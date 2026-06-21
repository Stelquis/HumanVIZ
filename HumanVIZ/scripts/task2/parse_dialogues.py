#!/usr/bin/env python3
"""
京剧剧本对话解析脚本

从剧本的"正文对话"字段中精确提取每场戏中出现的角色及其对话，
解决对话格式多样性、群组发言、内台发言等解析问题。

子步骤 2.1 的产出：对话格式调研 + 正则解析器原型
子步骤 2.2 的产出：角色名提取 + 角色字典构建
子步骤 2.3 的产出：角色名标准化 + 别名消歧
子步骤 2.4 的产出：同场共现检测 + 共现矩阵生成

用法:
    # 从 HumanVIZ 根目录运行
    cd HumanVIZ

    # 解析单个剧本（从数据库）
    python scripts/parse_dialogues.py parse --entity-id 1

    # 解析单个剧本（从 JSON 文件）
    python scripts/parse_dialogues.py parse --json-file data/raw/dataSet/01000000/01001001_空城计.json

    # 批量解析所有剧本（仅预览统计）
    python scripts/parse_dialogues.py parse --batch --dry-run

    # 批量解析并写入数据库
    python scripts/parse_dialogues.py parse --batch

    # 限制数量
    python scripts/parse_dialogues.py parse --batch --limit 20

    # 覆盖已有数据
    python scripts/parse_dialogues.py parse --batch --overwrite

    # 仅输出格式调研报告（不解析）
    python scripts/parse_dialogues.py survey --limit 50

    # 构建单个剧本的角色字典
    python scripts/parse_dialogues.py registry --entity-id 5893

    # 批量构建角色字典
    python scripts/parse_dialogues.py registry --batch

    # 批量构建角色字典（仅预览）
    python scripts/parse_dialogues.py registry --batch --dry-run --limit 10

    # 构建单个剧本的别名映射
    python scripts/parse_dialogues.py alias --entity-id 5893

    # 批量构建别名映射（仅规则推断）
    python scripts/parse_dialogues.py alias --batch

    # 批量构建别名映射（含 LLM 辅助）
    python scripts/parse_dialogues.py alias --batch --use-llm

    # 批量构建别名映射（仅预览）
    python scripts/parse_dialogues.py alias --batch --dry-run --limit 10

    # 检测单个剧本的同场共现
    python scripts/parse_dialogues.py cooccurrence --entity-id 5893

    # 批量检测同场共现
    python scripts/parse_dialogues.py cooccurrence --batch

    # 批量检测（仅预览）
    python scripts/parse_dialogues.py cooccurrence --batch --dry-run --limit 10

    # 包含群众角色的共现
    python scripts/parse_dialogues.py cooccurrence --batch --include-crowd

    # 覆盖已有共现数据
    python scripts/parse_dialogues.py cooccurrence --batch --overwrite
"""

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 将 backend 目录加入 sys.path，以便导入后端模块
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from database.connection import get_db_connection
from database.models import update_entity_attributes


def _safe_update_attributes(conn, entity_id: int, new_attrs: Dict[str, Any],
                            overwrite: bool = True) -> bool:
    """
    安全更新实体属性

    使用 update_entity_attributes 写入属性。
    若触发器导致失败，回退到直接 SQL 更新。
    """
    try:
        ok = update_entity_attributes(conn, entity_id, new_attrs, overwrite=overwrite)
        if ok:
            return True
    except Exception:
        pass

    # 回退方案：直接读取-合并-写入
    import json as _json
    try:
        row = conn.execute(
            "SELECT attributes FROM entities WHERE id = ?", (entity_id,)
        ).fetchone()
        if not row:
            return False

        existing = {}
        if row[0]:
            try:
                existing = _json.loads(row[0])
            except Exception:
                existing = {}

        for key, value in new_attrs.items():
            if overwrite or key not in existing:
                existing[key] = value

        conn.execute(
            "UPDATE entities SET attributes = ? WHERE id = ?",
            (_json.dumps(existing, ensure_ascii=False), entity_id)
        )
        conn.commit()
        return True

    except Exception as e:
        print(f"  ❌ 安全写入失败: {e}")
        return False


# ═══════════════════════════════════════════════════════════
#  数据结构定义
# ═══════════════════════════════════════════════════════════

@dataclass
class DialogueLine:
    """单条对话/台词记录"""
    scene: str           # "第一场" — 场景名
    speaker: str         # "诸葛亮" — 说话角色
    speech_type: str     # "白" / "唱" / "念" / "叫头" 等
    text: str            # 台词内容
    raw_line: str        # 原始行文本（用于调试）
    is_offstage: bool = False   # 是否内台（未出场）发言
    is_group: bool = False      # 是否群组发言
    group_members: list = field(default_factory=list)  # 群组发言时的所有角色


@dataclass
class SceneInfo:
    """场景信息"""
    scene_id: str        # "第一场"
    characters: List[str] = field(default_factory=list)  # 出场角色
    dialogue_count: int = 0   # 对话条数


@dataclass
class CharacterInfo:
    """角色信息"""
    name: str              # 标准化后的角色名
    role_type: str = ""    # 行当（可能为空）
    scenes: List[str] = field(default_factory=list)   # 出现场次
    dialogue_count: int = 0    # 对话/唱词次数
    is_crowd: bool = False     # 是否群众角色
    source: str = ""           # "主要角色字段" / "对话提取" / "两者"


@dataclass
class CharacterRegistry:
    """角色字典：一部剧本中所有角色的注册表"""
    characters: Dict[str, CharacterInfo] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """序列化为可 JSON 化的字典"""
        return {
            name: {
                "name": info.name,
                "role_type": info.role_type,
                "scenes": info.scenes,
                "dialogue_count": info.dialogue_count,
                "is_crowd": info.is_crowd,
                "source": info.source,
            }
            for name, info in self.characters.items()
        }


# ═══════════════════════════════════════════════════════════
#  正则模式定义
# ═══════════════════════════════════════════════════════════

# 场景标记: 【第一场】 【第二场】 等
SCENE_PATTERN = re.compile(r'^【第(.+?)场】$')

# 音乐/锣鼓提示: 〖急三枪〗 〖起初更鼓〗 等
MUSIC_CUE_PATTERN = re.compile(r'〖.+?〗')

# 舞台指示: （...） — 用于区分台词类型括号和舞台指示
# 注意：台词类型括号紧随角色名，舞台指示通常独立成行
STAGE_DIRECTION_PATTERN = re.compile(r'^（.+?）$')

# 角色名 + 台词类型 的核心模式
# 支持: 角色名 （白） / 角色名 （西皮摇板） / 角色名 （内白） 等
# 角色名允许中文、数字甲乙丙、全角点号等
_SPEAKER_CHAR_CLASS = r'[\u4e00-\u9fff\u3400-\u4dbfA-Za-z0-9甲乙丙丁戊己庚辛壬癸·\-]'

# 台词类型括号内的内容：
# 基础类型: 白, 念, 唱, 叫头, 笑, 哭, 数板, 引子, 冷笑
# 音乐板式: 西皮摇板, 西皮慢板, 二黄原板, 高拨子导板 等
# 同台: 同白, 同念, 同唱, 同笑, 同三笑, 同叫头, 同三叫头
# 内台: 内白, 内唱 + 内+板式（内西皮导板, 内二黄导板 等）
# 特殊: 背供, 背唱, 夹白, 苏白, 允
# 台词类型的正则片段（不含外层捕获组，便于嵌入 DIALOGUE_LINE_PATTERN）
_SPEECH_TYPE_RE = (
    r'(?:'
    # 同台型 (同白, 同念, 同唱, 同笑, 同三笑, 同叫头, 同三叫头)
    r'同[白唱念笑]|同三笑|同三叫头|同喜迁莺|同刮地风|同水仙子|同煞尾'
    r'|'
    # 内台型 (内白, 内唱, 内西皮导板, 内二黄导板 等)
    r'内(?:白|唱|西皮(?:导板|摇板|慢板|原板|快板|流水板|二六板|散板|小导板)|二黄(?:导板|摇板|慢板|原板|快三眼|散板)|高拨子(?:导板|二六板|原板|摇板)|南梆子(?:导板)?|同白)'
    r'|'
    # 特殊类型
    r'背供|背唱|夹白|苏白|允'
    r'|'
    # 昆曲曲牌 (仙吕宫调点绛唇, 双调新水令 等)
    r'(?:仙吕宫调|双调)?(?:点绛唇|新水令|驻马听|折桂令|雁儿落带得胜令|沽美酒带太平令|收江南|醉花阴|喜迁莺|刮地风|水仙子|煞尾|起更|起三更)'
    r'|'
    # 基础唱腔板式（声腔+板式组合）
    r'(?:西皮|二黄|高拨子|南梆子|四平调|吹腔|西皮娃娃调)?'
    r'(?:导板|摇板|慢板|原板|快板|流水板|二六板|散板|快三眼|小导板|回龙|哭头|娃娃调)'
    r'|'
    # 基础类型（必须放在最后，避免误匹配唱腔板式中的单字）
    r'白|念|唱|叫头|笑|哭|数板|引子|冷笑'
    r')'
)

# 完整的"角色名 + 台词类型"行模式
# 形如: "诸葛亮 （白） 传。"
# 或:   "司马懿 （内西皮导板） 得了街亭望西城，"
# 或:   "二老军 （同白） 参见丞相。"
# 角色名可能包含顿号分隔的多人名: "司马师、司马昭 （同白）"
DIALOGUE_LINE_PATTERN = re.compile(
    r'^'
    r'(' + _SPEAKER_CHAR_CLASS + r'+'
    r'(?:[、]' + _SPEAKER_CHAR_CLASS + r'+)*'  # 多角色用顿号分隔
    r')'
    r'\s*'
    r'（(' + _SPEECH_TYPE_RE + r')）'
    r'\s*'
    r'(.*)'  # 台词内容
    r'$'
)

# 群组发言：角色名跨行的情况
# 如:
#   南极老人、
#   牛郎、
#   织女、
#   张仙、
#   财神 （同白） 天官在上，吾等稽首。
# 这种情况角色名末尾有顿号表示续行
GROUP_SPEAKER_CONTINUE = re.compile(
    r'^(' + _SPEAKER_CHAR_CLASS + r'+)）\s*$'
)

# （完）结尾标记
END_MARKER = re.compile(r'^（完）$')


# ═══════════════════════════════════════════════════════════
#  对话格式调研统计
# ═══════════════════════════════════════════════════════════

@dataclass
class FormatSurveyResult:
    """对话格式调研结果"""
    total_scripts: int = 0
    scripts_with_scenes: int = 0       # 有场景标记的剧本数
    scripts_without_scenes: int = 0    # 无场景标记的剧本数
    speech_type_counts: Dict[str, int] = field(default_factory=lambda: Counter())
    group_speech_counts: Dict[str, int] = field(default_factory=lambda: Counter())
    offstage_speech_counts: Dict[str, int] = field(default_factory=lambda: Counter())
    scene_count_distribution: Dict[str, int] = field(default_factory=lambda: Counter())  # 场次数分布
    max_scene_count: int = 0
    avg_scene_count: float = 0.0
    sample_unusual_formats: List[str] = field(default_factory=list)


def survey_dialogue_formats(texts: List[Tuple[int, str, str]]) -> FormatSurveyResult:
    """
    对话格式调研：统计所有剧本的对话格式规律

    Args:
        texts: [(entity_id, play_name, content), ...]

    Returns:
        FormatSurveyResult
    """
    result = FormatSurveyResult(total_scripts=len(texts))
    scene_counts = []

    for entity_id, play_name, content in texts:
        if not content:
            continue

        lines = content.split('\n')
        has_scene = False
        scene_count = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 检测场景标记
            m = SCENE_PATTERN.match(line)
            if m:
                has_scene = True
                scene_count += 1
                continue

            # 检测角色对话行
            dm = DIALOGUE_LINE_PATTERN.match(line)
            if dm:
                speaker, speech_type, text_content = dm.groups()
                result.speech_type_counts[speech_type] += 1

                # 统计群组发言
                if speech_type.startswith('同'):
                    result.group_speech_counts[speech_type] += 1

                # 统计内台发言
                if speech_type.startswith('内'):
                    result.offstage_speech_counts[speech_type] += 1

        if has_scene:
            result.scripts_with_scenes += 1
            scene_counts.append(scene_count)
        else:
            result.scripts_without_scenes += 1

    if scene_counts:
        result.max_scene_count = max(scene_counts)
        result.avg_scene_count = sum(scene_counts) / len(scene_counts)
        # 场次分布直方图
        for sc in scene_counts:
            bucket = f"{(sc // 5) * 5}-{(sc // 5) * 5 + 4}"
            result.scene_count_distribution[bucket] += 1

    return result


# ═══════════════════════════════════════════════════════════
#  对话解析核心逻辑
# ═══════════════════════════════════════════════════════════

def parse_dialogue(content: str, play_name: str = "") -> List[DialogueLine]:
    """
    从剧本正文对话中解析出所有对话行

    解析策略：
    1. 按【第X场】切分场景
    2. 逐行匹配"角色名 （类型） 台词"模式
    3. 处理群组发言（同白/同唱等），拆分为多个角色
    4. 处理内台发言（内白/内唱等），标记 is_offstage
    5. 跳过纯舞台指示行和音乐提示

    Args:
        content: 剧本正文对话字符串
        play_name: 剧本名（用于调试日志）

    Returns:
        List[DialogueLine]: 解析出的对话行列表
    """
    if not content:
        return []

    lines = content.split('\n')
    results: List[DialogueLine] = []
    current_scene = "未分场"  # 默认场景（无场景标记时）
    pending_speakers: List[str] = []  # 跨行角色名缓冲

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        # 1. 检测场景标记
        m = SCENE_PATTERN.match(line)
        if m:
            current_scene = m.group(1) + "场"
            pending_speakers = []
            continue

        # 2. 检测结尾标记
        if END_MARKER.match(line):
            break

        # 3. 检测无角色名的台词类型行（续行模式）
        #    如: （念） 欲送登高千里目...
        #    如: （双调新水令） 按龙泉血泪洒征袍...
        #    如: （夹白） 投宿——
        #    这种情况下，发言角色与上一条台词相同
        #    注意：此检测必须在舞台指示检测之前，因为（念） 台词 也以（开头）结尾
        continuation_match = re.match(
            r'^（(' + _SPEECH_TYPE_RE + r')）\s*(.*)', line
        )
        if continuation_match:
            speech_type, text_content = continuation_match.groups()
            # 续行模式：发言角色与上一条台词相同
            last_speaker = results[-1].speaker if results else "未知"
            is_offstage = speech_type.startswith('内')
            clean_type = _clean_speech_type(speech_type)

            results.append(DialogueLine(
                scene=current_scene,
                speaker=last_speaker,
                speech_type=clean_type,
                text=text_content,
                raw_line=line,
                is_offstage=is_offstage,
            ))
            continue

        # 4. 检测纯舞台指示行（整行都是括号内容且非台词类型）
        #    如：（二童儿同上，诸葛亮上。）
        #    如：（〖急三枪〗。马谡写军令状。）
        if _is_stage_direction_line(line):
            # 但有些舞台指示包含角色名信息，可用于辅助判断
            # 如 （旗牌上。）→ 旗牌 出场
            # 暂不处理，留给后续角色提取步骤
            pending_speakers = []
            continue

        # 4. 检测角色名续行（顿号结尾的角色名）
        #    如: "南极老人、"
        if line.endswith('、') and not line.startswith('（'):
            # 可能是跨行群组角色名的一部分
            name = line.rstrip('、').strip()
            if re.match(r'^' + _SPEAKER_CHAR_CLASS + r'+$', name):
                pending_speakers.append(name)
                continue

        # 5. 尝试匹配"角色名 + 台词类型 + 台词内容"
        dm = DIALOGUE_LINE_PATTERN.match(line)
        if dm:
            speaker_str, speech_type, text_content = dm.groups()
            speakers = _parse_speaker_string(speaker_str, pending_speakers)
            pending_speakers = []

            # 判断是否内台
            is_offstage = speech_type.startswith('内')
            # 清理内台前缀，得到纯台词类型
            clean_type = _clean_speech_type(speech_type)
            # 判断是否群组发言
            is_group = len(speakers) > 1 or speech_type.startswith('同')

            if is_group and len(speakers) > 1:
                # 群组发言：每个角色生成一条记录
                for sp in speakers:
                    results.append(DialogueLine(
                        scene=current_scene,
                        speaker=sp,
                        speech_type=clean_type,
                        text=text_content,
                        raw_line=line,
                        is_offstage=is_offstage,
                        is_group=True,
                        group_members=speakers,
                    ))
            elif is_group and len(speakers) == 1:
                # 单角色名 + 同X（如 "二老军 （同白）"）
                # "二老军" 可能是群体角色名，暂不拆分
                results.append(DialogueLine(
                    scene=current_scene,
                    speaker=speakers[0],
                    speech_type=clean_type,
                    text=text_content,
                    raw_line=line,
                    is_offstage=is_offstage,
                    is_group=True,
                    group_members=speakers,
                ))
            else:
                # 单人发言
                results.append(DialogueLine(
                    scene=current_scene,
                    speaker=speakers[0],
                    speech_type=clean_type,
                    text=text_content,
                    raw_line=line,
                    is_offstage=is_offstage,
                ))
            continue

        # 6. 处理跨行角色名 + 台词类型的情况
        #    如前面有几行角色名（顿号结尾），然后当前行是 "财神 （同白） ..."
        if pending_speakers:
            dm2 = DIALOGUE_LINE_PATTERN.match(line)
            if dm2:
                speaker_str, speech_type, text_content = dm2.groups()
                current_speakers = _parse_speaker_string(speaker_str, [])
                all_speakers = pending_speakers + current_speakers
                pending_speakers = []

                is_offstage = speech_type.startswith('内')
                clean_type = _clean_speech_type(speech_type)

                for sp in all_speakers:
                    results.append(DialogueLine(
                        scene=current_scene,
                        speaker=sp,
                        speech_type=clean_type,
                        text=text_content,
                        raw_line=line,
                        is_offstage=is_offstage,
                        is_group=True,
                        group_members=all_speakers,
                    ))
                continue
            else:
                # 跨行角色名后面没有跟台词类型，可能是误判
                pending_speakers = []

        # 8. 其他行：可能是台词续行（上一条台词的延续）
        #    如: "人道司马用兵如神，"（上一条台词的续行）
        #    或舞台指示片段，暂不处理

    return results


def _is_stage_direction_line(line: str) -> bool:
    """
    判断一行是否为纯舞台指示行

    舞台指示特征：
    - 整行以（开头，）结尾
    - 包含〖...〗音乐提示
    - 内容为动作描述（上、下、同上、同下等）
    """
    # 完全由中文括号包裹
    if line.startswith('（') and line.endswith('）') and '（' in line[1:]:
        # 嵌套括号的情况，如（〖急三枪〗。马谡写军令状。）
        return True
    if line.startswith('（') and line.endswith('）'):
        return True
    # 〖...〗 音乐提示行
    if MUSIC_CUE_PATTERN.match(line):
        return True
    return False


def _parse_speaker_string(speaker_str: str, pending: List[str]) -> List[str]:
    """
    解析角色名字符串，拆分多角色情况

    支持:
    - "诸葛亮" → ["诸葛亮"]
    - "司马师、司马昭" → ["司马师", "司马昭"]
    - "四魏兵、司马昭、司马师" → ["四魏兵", "司马昭", "司马师"]

    Args:
        speaker_str: 角色名字符串
        pending: 前面跨行积攒的角色名

    Returns:
        角色名列表
    """
    speakers = []
    # 按顿号分隔
    parts = re.split(r'[、]', speaker_str)
    for part in parts:
        name = part.strip()
        if name:
            speakers.append(name)

    # 合并跨行积攒的角色名
    if pending:
        speakers = pending + speakers

    return speakers if speakers else [speaker_str]


def _clean_speech_type(speech_type: str) -> str:
    """
    清理台词类型，去掉"内""同"等前缀，得到基础类型

    Examples:
        "内白" → "白"
        "内西皮导板" → "西皮导板"（保留板式信息）
        "同白" → "白"
        "同三笑" → "笑"
        "同三叫头" → "叫头"
        "背供" → "背供"（保留，表示旁白/内心独白）
        "苏白" → "苏白"（保留，表示苏州方言白）
    """
    if speech_type.startswith('内'):
        # 内台: 去掉"内"前缀
        return speech_type[1:] if len(speech_type) > 1 else speech_type
    if speech_type.startswith('同'):
        rest = speech_type[1:]
        if rest == '白':
            return '白'
        elif rest == '唱':
            return '唱'
        elif rest == '念':
            return '念'
        elif rest == '笑' or rest == '三笑':
            return '笑'
        elif rest == '叫头' or rest == '三叫头':
            return '叫头'
        else:
            # 同喜迁莺 等 — 昆曲群组唱，保留曲牌名
            return rest
    return speech_type


# ═══════════════════════════════════════════════════════════
#  按场景汇总角色出场信息
# ═══════════════════════════════════════════════════════════

def summarize_scenes(dialogue_lines: List[DialogueLine]) -> Dict[str, SceneInfo]:
    """
    根据解析出的对话行，汇总每个场景的角色出场和对话数

    Args:
        dialogue_lines: parse_dialogue() 的输出

    Returns:
        {scene_name: SceneInfo}
    """
    scenes: Dict[str, SceneInfo] = {}

    for dl in dialogue_lines:
        if dl.scene not in scenes:
            scenes[dl.scene] = SceneInfo(scene_id=dl.scene)

        scene = scenes[dl.scene]
        scene.dialogue_count += 1

        # 添加角色（去重）
        if dl.speaker not in scene.characters:
            scene.characters.append(dl.speaker)

        # 群组成员也加入角色列表
        if dl.group_members:
            for member in dl.group_members:
                if member not in scene.characters:
                    scene.characters.append(member)

    return scenes


def get_character_summary(dialogue_lines: List[DialogueLine]) -> Dict[str, Dict[str, Any]]:
    """
    汇总角色统计信息

    Returns:
        {角色名: {dialogue_count, scenes, speech_types}}
    """
    chars: Dict[str, Dict[str, Any]] = {}

    for dl in dialogue_lines:
        name = dl.speaker
        if name not in chars:
            chars[name] = {
                "dialogue_count": 0,
                "scenes": set(),
                "speech_types": set(),
                "is_offstage_count": 0,
                "is_group_count": 0,
            }

        chars[name]["dialogue_count"] += 1
        chars[name]["scenes"].add(dl.scene)
        chars[name]["speech_types"].add(dl.speech_type)
        if dl.is_offstage:
            chars[name]["is_offstage_count"] += 1
        if dl.is_group:
            chars[name]["is_group_count"] += 1

    # 转换 set 为 list 以便 JSON 序列化
    for name in chars:
        chars[name]["scenes"] = sorted(chars[name]["scenes"])
        chars[name]["speech_types"] = sorted(chars[name]["speech_types"])

    return chars


# ═══════════════════════════════════════════════════════════
#  角色名标准化与清洗
# ═══════════════════════════════════════════════════════════

# 群众角色关键词
_CROWD_KEYWORDS = frozenset({
    # 带数字前缀的群体
    "龙套", "老军", "青袍", "校尉", "兵", "将", "军",
    "朝官", "衙役", "家院", "家丁", "宫女", "丫鬟", "侍女",
    # 功能性角色
    "旗牌", "报子", "探子", "中军", "太监", "门子", "店家",
    "媒婆", "驿丞", "金牌官", "内侍",
    # 集合称呼
    "众人", "众将", "众家丁", "四将", "四兵",
})

# 带数字/甲乙后缀的群众角色模式
_CROWD_SUFFIX_RE = re.compile(r'[甲乙丙丁]$')
_NUMBER_PREFIX_RE = re.compile(r'^[二三四五六七八九]')


def normalize_character_name(name: str) -> str:
    """
    标准化角色名：去除前后空格、统一全角/半角

    Args:
        name: 原始角色名

    Returns:
        标准化后的角色名
    """
    if not name:
        return ""
    # 去除前后空格
    name = name.strip()
    # 全角数字转半角
    name = name.replace('０', '0').replace('１', '1').replace('２', '2')
    name = name.replace('３', '3').replace('４', '4').replace('５', '5')
    name = name.replace('６', '6').replace('７', '7').replace('８', '8')
    name = name.replace('９', '9')
    return name


def is_crowd_character(name: str) -> bool:
    """
    判断是否为群众角色/功能性角色

    群众角色特征：
    - 名字含"甲""乙""丙""丁"后缀（如 老军甲、衙役乙）
    - 名字以数字开头（如 四龙套、二老军）
    - 名字为已知的群众角色关键词

    Args:
        name: 角色名

    Returns:
        True 如果是群众角色
    """
    if not name:
        return False

    # 直接匹配已知群众角色关键词
    if name in _CROWD_KEYWORDS:
        return True

    # 检查是否以群众关键词为前缀（如 "四龙套"、"二老军"、"四红龙套"）
    for kw in _CROWD_KEYWORDS:
        if name.endswith(kw) or name.startswith(kw):
            return True

    # 带"甲乙丙丁"后缀的角色（如 老军甲、衙役乙、朝官丙）
    if _CROWD_SUFFIX_RE.search(name):
        # 确保前缀部分不是主要角色名
        prefix = name[:-1]
        # 如果前缀本身也是群众关键词，则整体是群众角色
        if prefix in _CROWD_KEYWORDS:
            return True
        # 如果前缀只有1-2个字且匹配常见群众词根
        if len(prefix) <= 3 and any(kw in prefix for kw in ["衙", "兵", "役", "军", "官"]):
            return True

    # 以"二""三""四"等数字开头的群体称谓
    if _NUMBER_PREFIX_RE.match(name):
        # 如 "二老军"、"四红龙套"、"四朝官"
        rest = name[1:]
        if any(kw in rest for kw in _CROWD_KEYWORDS):
            return True

    return False


def parse_roles_from_attributes(attributes: Dict[str, Any]) -> Dict[str, str]:
    """
    从实体 attributes 中解析 主要角色 字段，返回 {角色名: 行当} 映射

    主要角色 在数据库中存储为 JSON 数组：
    [{"name": "诸葛亮", "role_type": "老生"}, ...]

    也可能为原始文本格式（由 _parse_roles_text 处理）。

    Args:
        attributes: 实体的 attributes 字典

    Returns:
        {角色名: 行当} 映射字典
    """
    roles = attributes.get("主要角色", [])
    if not roles:
        return {}

    # 如果是字符串，尝试解析为 JSON 或使用文本解析
    if isinstance(roles, str):
        try:
            roles = json.loads(roles)
        except (json.JSONDecodeError, TypeError):
            # 使用 _parse_roles_text 的逻辑
            result = {}
            for line in roles.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                if "：" in line:
                    name, role_type = line.split("：", 1)
                    result[name.strip()] = role_type.strip()
                elif ":" in line:
                    name, role_type = line.split(":", 1)
                    result[name.strip()] = role_type.strip()
            return result

    # JSON 数组格式
    result = {}
    if isinstance(roles, list):
        for role in roles:
            if isinstance(role, dict):
                name = normalize_character_name(role.get("name", ""))
                rt = role.get("role_type", "")
                if name:
                    result[name] = rt
    return result


# ═══════════════════════════════════════════════════════════
#  角色字典构建
# ═══════════════════════════════════════════════════════════

def build_character_registry(
    entity_id: Optional[int] = None,
    content: str = "",
    attributes: Optional[Dict[str, Any]] = None,
    play_name: str = "",
) -> CharacterRegistry:
    """
    从 主要角色 字段和对话解析结果中，构建完整的角色名-行当映射字典

    合并策略：
    1. 先从 主要角色 字段获取角色-行当映射（有行当标注但可能不全）
    2. 再从对话解析结果中提取所有出现过的角色名（角色全但无行当）
    3. 合并两种来源，以 主要角色 字段的行当为准

    Args:
        entity_id: 实体 ID（用于从数据库获取数据，若提供则忽略 content/attributes）
        content: 剧本正文对话（若提供 entity_id 则从数据库读取）
        attributes: 实体属性字典（若提供 entity_id 则从数据库读取）
        play_name: 剧本名（用于日志）

    Returns:
        CharacterRegistry 角色字典
    """
    if entity_id is not None:
        conn = get_db_connection()
        try:
            row = conn.execute(
                "SELECT name, content, attributes FROM entities WHERE id = ?",
                (entity_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return CharacterRegistry()
        play_name = row["name"]
        content = row["content"] or ""
        attributes = json.loads(row["attributes"]) if row["attributes"] else {}

    if attributes is None:
        attributes = {}

    registry = CharacterRegistry()

    # ── 步骤 1: 从 主要角色 字段获取角色-行当映射 ──
    roles_from_attr = parse_roles_from_attributes(attributes)
    for name, role_type in roles_from_attr.items():
        normalized = normalize_character_name(name)
        if not normalized:
            continue
        registry.characters[normalized] = CharacterInfo(
            name=normalized,
            role_type=role_type,
            scenes=[],
            dialogue_count=0,
            is_crowd=is_crowd_character(normalized),
            source="主要角色字段",
        )

    # ── 步骤 2: 从对话解析结果中提取角色名 ──
    dialogue_lines = parse_dialogue(content, play_name)
    chars_from_dialogue = get_character_summary(dialogue_lines)

    for name, info in chars_from_dialogue.items():
        normalized = normalize_character_name(name)
        if not normalized:
            continue

        if normalized in registry.characters:
            # 已在 主要角色 中存在，补充对话信息
            existing = registry.characters[normalized]
            existing.scenes = info["scenes"]
            existing.dialogue_count = info["dialogue_count"]
            # 如果已有行当信息，保留；否则为空
            existing.source = "两者"
        else:
            # 仅在对话中出现，不在 主要角色 字段中
            registry.characters[normalized] = CharacterInfo(
                name=normalized,
                role_type="",  # 无行当信息
                scenes=info["scenes"],
                dialogue_count=info["dialogue_count"],
                is_crowd=is_crowd_character(normalized),
                source="对话提取",
            )

    return registry


# ═══════════════════════════════════════════════════════════
#  数据库交互
# ═══════════════════════════════════════════════════════════

def fetch_operas(
    conn,
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
) -> List[Dict[str, Any]]:
    """
    读取待解析的 opera_script 实体列表

    若 overwrite=False，则跳过已有 "对话解析" 属性的实体。
    """
    conditions = ["e.type = 'opera_script'"]
    params: list = []

    if dataset_id:
        conditions.append("e.dataset_id = ?")
        params.append(dataset_id)

    if not overwrite:
        conditions.append(
            "json_extract(e.attributes, '$.对话解析') IS NULL"
        )

    where = " AND ".join(conditions)

    sql = f"""
        SELECT e.id, e.name, e.dataset_id, e.content, e.attributes
        FROM entities e
        WHERE {where}
        ORDER BY e.id
    """
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    results = []
    for row in rows:
        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        results.append({
            "id": row["id"],
            "name": row["name"],
            "dataset_id": row["dataset_id"],
            "content": row["content"],
            "attributes": attrs or {},
        })
    return results


# ═══════════════════════════════════════════════════════════
#  格式调研模式
# ═══════════════════════════════════════════════════════════

def run_survey(limit: int = 50):
    """运行对话格式调研"""
    print("=" * 60)
    print("  京剧剧本对话格式调研")
    print("=" * 60)

    conn = get_db_connection()
    try:
        # 获取剧本列表
        rows = conn.execute(
            "SELECT id, name, content FROM entities WHERE type = 'opera_script' ORDER BY id LIMIT ?",
            (limit,),
        ).fetchall()
    finally:
        conn.close()

    texts = [(row["id"], row["name"], row["content"] or "") for row in rows]
    result = survey_dialogue_formats(texts)

    print(f"\n调研剧本数: {result.total_scripts}")
    print(f"有场景标记: {result.scripts_with_scenes}")
    print(f"无场景标记: {result.scripts_without_scenes}")
    print(f"平均场次数: {result.avg_scene_count:.1f}")
    print(f"最大场次数: {result.max_scene_count}")

    print(f"\n── 台词类型分布 (Top 30) ──")
    for st, cnt in sorted(result.speech_type_counts.items(), key=lambda x: -x[1])[:30]:
        print(f"  {st}: {cnt}")

    print(f"\n── 群组发言类型分布 ──")
    for st, cnt in sorted(result.group_speech_counts.items(), key=lambda x: -x[1]):
        print(f"  {st}: {cnt}")

    print(f"\n── 内台发言类型分布 ──")
    for st, cnt in sorted(result.offstage_speech_counts.items(), key=lambda x: -x[1]):
        print(f"  {st}: {cnt}")

    print(f"\n── 场次分布 ──")
    for bucket, cnt in sorted(result.scene_count_distribution.items()):
        print(f"  {bucket}场: {cnt}部")

    # 保存调研报告
    report_path = PROJECT_ROOT / "data" / "processed" / "task2" / "dialogue_format_survey.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    # 将 Counter 转为普通 dict 以确保 JSON 可序列化
    result_dict = asdict(result)
    for key in ["speech_type_counts", "group_speech_counts",
                "offstage_speech_counts", "scene_count_distribution"]:
        val = result_dict[key]
        # 确保所有 key 为字符串
        result_dict[key] = {str(k): v for k, v in val.items()}
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(result_dict, f, ensure_ascii=False, indent=2)
    print(f"\n调研报告已保存: {report_path}")


# ═══════════════════════════════════════════════════════════
#  解析模式
# ═══════════════════════════════════════════════════════════

def parse_single(entity_id: Optional[int] = None, json_file: Optional[str] = None):
    """解析单个剧本并打印结果"""
    content = ""
    play_name = ""

    if json_file:
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        content = data.get("正文对话", "")
        play_name = data.get("剧本名字", Path(json_file).stem)
    elif entity_id:
        conn = get_db_connection()
        try:
            row = conn.execute(
                "SELECT id, name, content FROM entities WHERE id = ?",
                (entity_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            print(f"未找到 entity_id={entity_id}")
            return
        content = row["content"] or ""
        play_name = row["name"]
    else:
        print("请指定 --entity-id 或 --json-file")
        return

    print(f"解析剧本: {play_name}")
    print(f"正文字符数: {len(content)}")
    print()

    # 解析
    lines = parse_dialogue(content, play_name)
    print(f"解析出对话行: {len(lines)}")

    # 汇总
    scenes = summarize_scenes(lines)
    chars = get_character_summary(lines)

    print(f"场景数: {len(scenes)}")
    print(f"角色数: {len(chars)}")

    print(f"\n── 场景与角色 ──")
    for scene_name, scene_info in scenes.items():
        print(f"  {scene_name}: {len(scene_info.characters)} 角色, {scene_info.dialogue_count} 条对话")
        for ch in scene_info.characters[:10]:
            print(f"    - {ch}")
        if len(scene_info.characters) > 10:
            print(f"    ... 还有 {len(scene_info.characters) - 10} 个角色")

    print(f"\n── 角色统计 ──")
    for ch_name, ch_info in sorted(chars.items(), key=lambda x: -x[1]["dialogue_count"])[:20]:
        scenes_str = ", ".join(ch_info["scenes"][:5])
        print(f"  {ch_name}: {ch_info['dialogue_count']} 条, 场次[{scenes_str}], 类型{ch_info['speech_types']}")


def _load_existing_dialogue_export(export_dir: Path) -> List[Dict[str, Any]]:
    """加载已有的对话解析导出文件数据"""
    import gzip

    json_file = export_dir / "对话解析.json"
    gz_file = export_dir / "对话解析.json.gz"

    if json_file.exists():
        with open(json_file, "r", encoding="utf-8") as f:
            return json.load(f)
    elif gz_file.exists():
        with gzip.open(gz_file, "rt", encoding="utf-8") as f:
            return json.load(f)
    return []


def _save_dialogue_export(
    import_data: List[Dict[str, Any]],
    output_dir: Optional[Path] = None,
) -> Path:
    """将对话解析数据保存为兼容 db_import_attributes.py 的 JSON 文件"""
    import gzip

    if output_dir is None:
        output_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    key = "对话解析"
    file_size_est = len(json.dumps(import_data, ensure_ascii=False))

    if file_size_est > 500_000:  # >500KB 时压缩
        output_file = output_dir / f"{key}.json.gz"
        with gzip.open(output_file, "wt", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)
    else:
        output_file = output_dir / f"{key}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)

    file_size = output_file.stat().st_size
    print(f"\n  持久化文件: {output_file.name} ({file_size / 1024:.1f} KB, {len(import_data)} 部剧本)")
    print(f"  可通过 db_import_attributes.py --keys {key} 导入到新环境")

    return output_file


def run_batch(
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    dry_run: bool = False,
):
    """批量解析所有剧本"""
    print("=" * 60)
    print("  京剧剧本对话批量解析")
    print("=" * 60)
    print(f"  模式: {'预览 (dry-run)' if dry_run else '正式写入'}")
    print(f"  覆盖已有: {'是' if overwrite else '否'}")
    if dataset_id:
        print(f"  限定数据集: {dataset_id}")
    if limit:
        print(f"  数量限制: {limit}")
    print()

    # ── 检查已有的导出文件 ──
    export_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"
    existing_data = []
    existing_ids = set()
    if not overwrite and not dry_run:
        existing_data = _load_existing_dialogue_export(export_dir)
        if existing_data:
            existing_ids = {item["entity_id"] for item in existing_data}
            print(f"  已有导出文件: {len(existing_data)} 条记录（增量模式，跳过已有）")

    conn = get_db_connection()
    try:
        plays = fetch_operas(conn, dataset_id, limit, overwrite)
    finally:
        conn.close()

    # 过滤已有导出
    if existing_ids and not overwrite:
        plays = [p for p in plays if p["id"] not in existing_ids]

    total = len(plays)
    if total == 0:
        if existing_data:
            print(f"没有新增剧本需要解析（已有 {len(existing_data)} 条导出记录）")
        else:
            print("没有需要解析的剧本，退出。")
        return

    print(f"共 {total} 部剧本待解析\n")

    success_count = 0
    fail_count = 0
    results_log = []
    import_data = list(existing_data)  # 从已有数据开始
    import_data = list(existing_data)  # 从已有数据开始

    # 统计汇总
    total_dialogue_lines = 0
    total_characters = 0
    total_scenes = 0

    for idx, play in enumerate(plays, 1):
        entity_id = play["id"]
        play_name = play["name"]
        content = play["content"] or ""

        try:
            # 解析对话
            dialogue_lines = parse_dialogue(content, play_name)
            scenes = summarize_scenes(dialogue_lines)
            chars = get_character_summary(dialogue_lines)

            num_lines = len(dialogue_lines)
            num_chars = len(chars)
            num_scenes = len(scenes)

            total_dialogue_lines += num_lines
            total_characters += num_chars
            total_scenes += num_scenes

            print(f"[{idx}/{total}] {play_name}: {num_lines} 条对话, {num_chars} 角色, {num_scenes} 场")

            # 构建解析结果（无论是否 dry_run 都构建，用于 JSON 导出）
            parsing_result = {
                "对话行数": num_lines,
                "角色数": num_chars,
                "场次数": num_scenes,
                "角色统计": {
                    name: {
                        "dialogue_count": info["dialogue_count"],
                        "scenes": info["scenes"],
                        "speech_types": info["speech_types"],
                    }
                    for name, info in chars.items()
                },
                "场景角色": {
                    scene_name: {
                        "characters": scene_info.characters,
                        "dialogue_count": scene_info.dialogue_count,
                    }
                    for scene_name, scene_info in scenes.items()
                },
            }

            if dry_run:
                success_count += 1
            else:
                # 写入数据库
                write_conn = get_db_connection()
                try:
                    ok = _safe_update_attributes(
                        write_conn, entity_id,
                        {"对话解析": parsing_result},
                        overwrite=True,
                    )
                    if ok:
                        success_count += 1
                    else:
                        fail_count += 1
                        print(f"  ❌ 写入失败")
                except Exception as e:
                    fail_count += 1
                    print(f"  ❌ 写入异常: {e}")
                finally:
                    write_conn.close()

            # 收集导入兼容数据
            import_data.append({
                "entity_id": entity_id,
                "name": play_name,
                "对话解析": parsing_result,
            })

            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "success",
                "dialogue_lines": num_lines,
                "characters": num_chars,
                "scenes": num_scenes,
            })

        except Exception as e:
            fail_count += 1
            print(f"[{idx}/{total}] {play_name}: ❌ 解析失败: {e}")
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "error",
                "error": str(e),
            })

    # 输出 JSON 备份
    output_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "dialogue_parsing_results"
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"parse_dialogues_{timestamp}.json"

    summary = {
        "timestamp": timestamp,
        "total": total,
        "success": success_count,
        "fail": fail_count,
        "dry_run": dry_run,
        "stats": {
            "total_dialogue_lines": total_dialogue_lines,
            "total_characters": total_characters,
            "total_scenes": total_scenes,
            "avg_dialogue_per_play": round(total_dialogue_lines / total, 1) if total else 0,
            "avg_characters_per_play": round(total_characters / total, 1) if total else 0,
            "avg_scenes_per_play": round(total_scenes / total, 1) if total else 0,
        },
        "results": results_log,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # ── 输出 2: 导入兼容的持久化文件 ──
    if not dry_run and import_data:
        _save_dialogue_export(import_data)

    print()
    print("=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print(f"  总对话行: {total_dialogue_lines}, 总角色: {total_characters}, 总场景: {total_scenes}")
    print(f"  平均每剧: {total_dialogue_lines // max(total, 1)} 条对话, "
          f"{round(total_characters / max(total, 1), 1)} 角色, "
          f"{round(total_scenes / max(total, 1), 1)} 场")
    print(f"  结果备份: {output_file}")
    if not dry_run and import_data:
        print(f"  持久化记录总数: {len(import_data)} 部剧本")
    print("=" * 60)


# ═══════════════════════════════════════════════════════════
#  角色字典模式
# ═══════════════════════════════════════════════════════════

def registry_single(entity_id: int):
    """为单个剧本构建角色字典并打印"""
    registry = build_character_registry(entity_id=entity_id)
    if not registry.characters:
        print(f"entity_id={entity_id} 未找到或无角色数据")
        return

    # 获取剧名
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT name FROM entities WHERE id = ?", (entity_id,)).fetchone()
    finally:
        conn.close()
    play_name = row["name"] if row else f"id={entity_id}"

    print(f"剧本: {play_name}")
    print(f"总角色数: {len(registry.characters)}")

    # 分类统计
    named_chars = [c for c in registry.characters.values() if not c.is_crowd]
    crowd_chars = [c for c in registry.characters.values() if c.is_crowd]
    from_attr = [c for c in registry.characters.values() if c.source in ("主要角色字段", "两者")]
    from_dialogue_only = [c for c in registry.characters.values() if c.source == "对话提取"]
    with_role_type = [c for c in registry.characters.values() if c.role_type]

    print(f"  主要角色: {len(named_chars)}, 群众角色: {len(crowd_chars)}")
    print(f"  来自主要角色字段: {len(from_attr)}, 仅来自对话: {len(from_dialogue_only)}")
    print(f"  有行当标注: {len(with_role_type)}, 无行当标注: {len(registry.characters) - len(with_role_type)}")

    # 按对话次数排序打印
    print(f"\n── 角色列表（按对话次数排序）──")
    sorted_chars = sorted(registry.characters.values(), key=lambda c: -c.dialogue_count)
    for c in sorted_chars:
        rt = f"（{c.role_type}）" if c.role_type else ""
        crowd_tag = " [群众]" if c.is_crowd else ""
        src_tag = f" [{c.source}]" if c.source != "两者" else " [字段+对话]"
        print(f"  {c.name}{rt}: {c.dialogue_count} 条, 场次{c.scenes}{crowd_tag}{src_tag}")


def run_registry_batch(
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    dry_run: bool = False,
):
    """批量构建角色字典并写入数据库"""
    print("=" * 60)
    print("  京剧剧本角色字典批量构建")
    print("=" * 60)
    print(f"  模式: {'预览 (dry-run)' if dry_run else '正式写入'}")
    print(f"  覆盖已有: {'是' if overwrite else '否'}")
    if dataset_id:
        print(f"  限定数据集: {dataset_id}")
    if limit:
        print(f"  数量限制: {limit}")
    print()

    conn = get_db_connection()
    try:
        # 获取所有 opera_script 实体
        conditions = ["e.type = 'opera_script'"]
        params: list = []

        if dataset_id:
            conditions.append("e.dataset_id = ?")
            params.append(dataset_id)

        if not overwrite:
            conditions.append(
                "json_extract(e.attributes, '$.角色字典') IS NULL"
            )

        where = " AND ".join(conditions)
        sql = f"""
            SELECT e.id, e.name, e.content, e.attributes
            FROM entities e
            WHERE {where}
            ORDER BY e.id
        """
        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    plays = []
    for row in rows:
        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        plays.append({
            "id": row["id"],
            "name": row["name"],
            "content": row["content"] or "",
            "attributes": attrs or {},
        })

    total = len(plays)
    if total == 0:
        print("没有需要构建角色字典的剧本，退出。")
        return

    print(f"共 {total} 部剧本待处理\n")

    success_count = 0
    fail_count = 0
    results_log = []
    import_data = list(existing_data)  # 从已有数据开始

    # 统计汇总
    total_named_chars = 0
    total_crowd_chars = 0
    total_with_role_type = 0
    total_from_attr = 0
    total_from_dialogue = 0

    for idx, play in enumerate(plays, 1):
        entity_id = play["id"]
        play_name = play["name"]
        content = play["content"]
        attrs = play["attributes"]

        try:
            # 构建角色字典
            registry = build_character_registry(
                content=content,
                attributes=attrs,
                play_name=play_name,
            )

            named = [c for c in registry.characters.values() if not c.is_crowd]
            crowd = [c for c in registry.characters.values() if c.is_crowd]
            with_rt = [c for c in registry.characters.values() if c.role_type]
            from_a = [c for c in registry.characters.values() if c.source in ("主要角色字段", "两者")]
            from_d = [c for c in registry.characters.values() if c.source == "对话提取"]

            total_named_chars += len(named)
            total_crowd_chars += len(crowd)
            total_with_role_type += len(with_rt)
            total_from_attr += len(from_a)
            total_from_dialogue += len(from_d)

            print(f"[{idx}/{total}] {play_name}: {len(registry.characters)} 角色 "
                  f"({len(named)} 主要, {len(crowd)} 群众, {len(with_rt)} 有行当)")

            if dry_run:
                success_count += 1
            else:
                # 写入数据库
                registry_dict = registry.to_dict()

                write_conn = get_db_connection()
                try:
                    ok = _safe_update_attributes(
                        write_conn, entity_id,
                        {"角色字典": registry_dict},
                        overwrite=True,
                    )
                    if ok:
                        success_count += 1
                    else:
                        fail_count += 1
                        print(f"  ❌ 写入失败")
                except Exception as e:
                    fail_count += 1
                    print(f"  ❌ 写入异常: {e}")
                finally:
                    write_conn.close()

            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "success",
                "total_characters": len(registry.characters),
                "named_characters": len(named),
                "crowd_characters": len(crowd),
                "with_role_type": len(with_rt),
            })

        except Exception as e:
            fail_count += 1
            print(f"[{idx}/{total}] {play_name}: ❌ 构建失败: {e}")
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "error",
                "error": str(e),
            })

    # 输出 JSON 备份
    output_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "dialogue_parsing_results"
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"registry_{timestamp}.json"

    summary = {
        "timestamp": timestamp,
        "total": total,
        "success": success_count,
        "fail": fail_count,
        "dry_run": dry_run,
        "stats": {
            "total_named_chars": total_named_chars,
            "total_crowd_chars": total_crowd_chars,
            "total_with_role_type": total_with_role_type,
            "total_from_attr": total_from_attr,
            "total_from_dialogue": total_from_dialogue,
            "avg_chars_per_play": round((total_named_chars + total_crowd_chars) / total, 1) if total else 0,
            "avg_role_type_coverage": round(total_with_role_type / max(total_named_chars, 1) * 100, 1),
        },
        "results": results_log,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print(f"  总角色: {total_named_chars + total_crowd_chars} "
          f"(主要: {total_named_chars}, 群众: {total_crowd_chars})")
    print(f"  有行当标注: {total_with_role_type} "
          f"(覆盖率: {round(total_with_role_type / max(total_named_chars, 1) * 100, 1)}%)")
    print(f"  来自主要角色字段: {total_from_attr}, 仅来自对话: {total_from_dialogue}")
    print(f"  结果备份: {output_file}")
    print("=" * 60)


# ═══════════════════════════════════════════════════════════
#  同场共现检测与共现矩阵生成 (子步骤 2.4)
# ═══════════════════════════════════════════════════════════

@dataclass
class Cooccurrence:
    """角色同场共现记录"""
    character_a: str           # 角色A（标准化名）
    character_b: str           # 角色B（标准化名）
    scenes: List[str] = field(default_factory=list)  # 共现的场景列表
    count: int = 0             # 共现场次数
    weight: float = 0.0        # 归一化强度 0.0~1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "character_a": self.character_a,
            "character_b": self.character_b,
            "scenes": self.scenes,
            "count": self.count,
            "weight": round(self.weight, 4),
        }


def detect_cooccurrence(
    entity_id: Optional[int] = None,
    content: str = "",
    attributes: Optional[Dict[str, Any]] = None,
    play_name: str = "",
    exclude_crowd: bool = True,
) -> Tuple[List[Cooccurrence], Dict[str, Any]]:
    """
    检测角色同场共现关系，生成共现矩阵

    流程：
    1. 解析对话，按场景切分
    2. 构建角色字典并应用别名消歧
    3. 对每个场景，提取出场角色（消歧后）
    4. 计算角色对共现频次
    5. 归一化为 0~1 的 weight

    Args:
        entity_id: 实体 ID（用于从数据库获取数据）
        content: 剧本正文对话
        attributes: 实体属性字典
        play_name: 剧本名
        exclude_crowd: 是否排除群众角色

    Returns:
        (共现列表, 网络摘要信息)
    """
    if entity_id is not None:
        conn = get_db_connection()
        try:
            row = conn.execute(
                "SELECT name, content, attributes FROM entities WHERE id = ?",
                (entity_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return [], {}
        play_name = row["name"]
        content = row["content"] or ""
        attributes = json.loads(row["attributes"]) if row["attributes"] else {}

    if attributes is None:
        attributes = {}

    # ── 步骤 1: 解析对话 ──
    dialogue_lines = parse_dialogue(content, play_name)
    if not dialogue_lines:
        return [], {"play_name": play_name, "total_scenes": 0, "total_characters": 0, "total_edges": 0}

    # ── 步骤 2: 构建角色字典并应用别名消歧 ──
    registry = build_character_registry(
        content=content,
        attributes=attributes,
        play_name=play_name,
    )
    alias_map = build_alias_map(
        content=content,
        attributes=attributes,
        play_name=play_name,
    )
    # 获取消歧后的角色字典
    resolver = AliasResolver()
    # 加载已有别名映射
    for alias, std_name in alias_map.aliases.items():
        if alias != std_name:
            resolver.add_rule(alias, std_name, source=alias_map.sources.get(alias, "别名映射"))

    # ── 步骤 3: 按场景提取出场角色（消歧后） ──
    scene_characters: Dict[str, set] = defaultdict(set)
    for dl in dialogue_lines:
        if dl.is_offstage:
            continue  # 内台发言不算同场
        # 应用别名消歧
        resolved_speaker = resolver.resolve(dl.speaker)
        scene_characters[dl.scene].add(resolved_speaker)
        # 群组成员也加入
        for member in dl.group_members:
            resolved_member = resolver.resolve(member)
            scene_characters[dl.scene].add(resolved_member)

    # ── 步骤 4: 排除群众角色（可选） ──
    if exclude_crowd:
        for scene in scene_characters:
            scene_characters[scene] = {
                ch for ch in scene_characters[scene]
                if not is_crowd_character(ch)
            }

    # ── 步骤 5: 计算共现频次 ──
    # 对每对角色，统计共现场次数
    cooccurrence_counter: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    for scene, characters in scene_characters.items():
        chars_sorted = sorted(characters)
        for i in range(len(chars_sorted)):
            for j in range(i + 1, len(chars_sorted)):
                pair = (chars_sorted[i], chars_sorted[j])
                cooccurrence_counter[pair].append(scene)

    if not cooccurrence_counter:
        return [], {
            "play_name": play_name,
            "total_scenes": len(scene_characters),
            "total_characters": sum(len(v) for v in scene_characters.values()) // max(len(scene_characters), 1),
            "total_edges": 0,
        }

    # ── 步骤 6: 归一化权重 ──
    max_count = max(len(scenes) for scenes in cooccurrence_counter.values())
    total_scenes = len(scene_characters)

    cooccurrences: List[Cooccurrence] = []
    for (char_a, char_b), scenes in cooccurrence_counter.items():
        count = len(scenes)
        # 归一化方案：共现场次数 / 总场次数（更有语义意义）
        weight = count / total_scenes if total_scenes > 0 else 0.0
        cooccurrences.append(Cooccurrence(
            character_a=char_a,
            character_b=char_b,
            scenes=scenes,
            count=count,
            weight=weight,
        ))

    # 按共现次数降序排序
    cooccurrences.sort(key=lambda c: (-c.count, c.character_a, c.character_b))

    # ── 步骤 7: 生成网络摘要 ──
    all_characters_in_network = set()
    for c in cooccurrences:
        all_characters_in_network.add(c.character_a)
        all_characters_in_network.add(c.character_b)

    # 构建邻接表（用于计算度中心性等）
    degree: Dict[str, int] = Counter()
    for c in cooccurrences:
        degree[c.character_a] += c.count
        degree[c.character_b] += c.count

    network_summary = {
        "play_name": play_name,
        "total_scenes": total_scenes,
        "total_characters": len(all_characters_in_network),
        "total_edges": len(cooccurrences),
        "max_cooccurrence_count": max_count,
        "avg_cooccurrence_count": round(
            sum(c.count for c in cooccurrences) / len(cooccurrences), 2
        ) if cooccurrences else 0,
        "top_characters_by_degree": [
            {"name": name, "degree": deg}
            for name, deg in degree.most_common(10)
        ],
        "scene_character_counts": {
            scene: len(chars) for scene, chars in scene_characters.items()
        },
    }

    return cooccurrences, network_summary


def cooccurrence_single(entity_id: int, exclude_crowd: bool = True):
    """为单个剧本检测同场共现并打印结果"""
    # 获取剧名
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT name FROM entities WHERE id = ?", (entity_id,)).fetchone()
    finally:
        conn.close()
    play_name = row["name"] if row else f"id={entity_id}"

    cooccurrences, summary = detect_cooccurrence(
        entity_id=entity_id, exclude_crowd=exclude_crowd,
    )

    if not cooccurrences:
        print(f"剧本: {play_name}")
        print("未检测到共现关系")
        return

    print(f"剧本: {play_name}")
    print(f"总场景数: {summary['total_scenes']}")
    print(f"总角色数: {summary['total_characters']}")
    print(f"共现边数: {summary['total_edges']}")
    print(f"最大共现次数: {summary['max_cooccurrence_count']}")
    print(f"平均共现次数: {summary['avg_cooccurrence_count']}")

    # 度中心性 Top 10
    print(f"\n── 角色度中心性 Top 10 ──")
    for item in summary.get("top_characters_by_degree", []):
        print(f"  {item['name']}: 度={item['degree']}")

    # 共现关系 Top 20
    print(f"\n── 共现关系 Top 20 ──")
    for c in cooccurrences[:20]:
        scenes_str = ", ".join(c.scenes[:5])
        if len(c.scenes) > 5:
            scenes_str += f" 等{len(c.scenes)}场"
        print(f"  {c.character_a} ↔ {c.character_b}: 共现{c.count}场 "
              f"(权重{c.weight:.3f}) [{scenes_str}]")

    # 场景角色数分布
    print(f"\n── 场景角色数分布 ──")
    scc = summary.get("scene_character_counts", {})
    for scene, count in sorted(scc.items()):
        print(f"  {scene}: {count} 角色")


def _save_cooccurrence_export(
    import_data: List[Dict[str, Any]],
    output_dir: Optional[Path] = None,
) -> Path:
    """
    将共现数据保存为兼容 db_import_attributes.py 的 JSON 文件

    格式与 db_export_attributes.py 的输出一致，
    可直接通过 db_import_attributes.py --keys 同场共现 导入。

    Args:
        import_data: [{entity_id, name, 同场共现: {...}}, ...]
        output_dir: 输出目录，默认为 data/processed/db_exports/

    Returns:
        输出文件路径
    """
    import gzip

    if output_dir is None:
        output_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    key = "同场共现"
    file_size_est = len(json.dumps(import_data, ensure_ascii=False))

    if file_size_est > 500_000:  # >500KB 时压缩
        output_file = output_dir / f"{key}.json.gz"
        with gzip.open(output_file, "wt", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)
    else:
        output_file = output_dir / f"{key}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)

    file_size = output_file.stat().st_size
    print(f"\n  持久化文件: {output_file.name} ({file_size / 1024:.1f} KB, {len(import_data)} 部剧本)")
    print(f"  可通过 db_import_attributes.py --keys {key} 导入到新环境")

    return output_file


def run_cooccurrence_batch(
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    dry_run: bool = False,
    exclude_crowd: bool = True,
):
    """批量检测同场共现关系并保存到文件（不直接写数据库）"""
    print("=" * 60)
    print("  京剧剧本角色同场共现检测（批量）")
    print("=" * 60)
    print(f"  模式: {'预览 (dry-run)' if dry_run else '正式写入文件'}")
    print(f"  覆盖已有: {'是' if overwrite else '否'}")
    print(f"  排除群众: {'是' if exclude_crowd else '否'}")
    if dataset_id:
        print(f"  限定数据集: {dataset_id}")
    if limit:
        print(f"  数量限制: {limit}")
    print()

    # 检查已有的导出文件
    export_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"
    existing_export = export_dir / "同场共现.json"
    existing_export_gz = export_dir / "同场共现.json.gz"
    has_existing = existing_export.exists() or existing_export_gz.exists()

    if has_existing and not overwrite and not dry_run:
        # 加载已有数据，用于增量合并
        existing_data = _load_existing_export(export_dir)
        existing_ids = {item["entity_id"] for item in existing_data}
        print(f"  已有导出文件: {len(existing_data)} 条记录（增量模式，跳过已有）")
    else:
        existing_data = []
        existing_ids = set()
        if has_existing and overwrite:
            print(f"  已有导出文件将被覆盖")

    conn = get_db_connection()
    try:
        # 获取所有 opera_script 实体（detect_cooccurrence 会自行计算角色字典和别名映射）
        conditions = ["e.type = 'opera_script'"]
        params: list = []

        if dataset_id:
            conditions.append("e.dataset_id = ?")
            params.append(dataset_id)

        # 增量模式：跳过已有导出文件中的 entity_id
        if not overwrite and existing_ids:
            placeholders = ",".join("?" for _ in existing_ids)
            conditions.append(f"e.id NOT IN ({placeholders})")
            params.extend(existing_ids)

        where = " AND ".join(conditions)
        sql = f"""
            SELECT e.id, e.name, e.content, e.attributes
            FROM entities e
            WHERE {where}
            ORDER BY e.id
        """
        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    plays = []
    for row in rows:
        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        plays.append({
            "id": row["id"],
            "name": row["name"],
            "content": row["content"] or "",
            "attributes": attrs or {},
        })

    total = len(plays)
    if total == 0:
        if existing_data:
            print(f"没有新增剧本需要处理（已有 {len(existing_data)} 条导出记录）")
        else:
            print("没有需要检测共现的剧本，退出。")
        return

    print(f"共 {total} 部剧本待处理\n")

    success_count = 0
    fail_count = 0
    results_log = []
    import_data = list(existing_data)  # 从已有数据开始
    import_data = list(existing_data)  # 从已有数据开始

    # 统计汇总
    total_edges = 0
    total_nodes = 0
    total_scenes_sum = 0

    for idx, play in enumerate(plays, 1):
        entity_id = play["id"]
        play_name = play["name"]

        try:
            cooccurrences, summary = detect_cooccurrence(
                content=play["content"],
                attributes=play["attributes"],
                play_name=play_name,
                exclude_crowd=exclude_crowd,
            )

            num_edges = len(cooccurrences)
            num_nodes = summary.get("total_characters", 0)
            num_scenes = summary.get("total_scenes", 0)

            total_edges += num_edges
            total_nodes += num_nodes
            total_scenes_sum += num_scenes

            print(f"[{idx}/{total}] {play_name}: {num_edges} 共现对, "
                  f"{num_nodes} 角色, {num_scenes} 场")

            # 构建导入兼容数据
            cooccurrence_data = {
                "共现边列表": [c.to_dict() for c in cooccurrences],
                "网络摘要": summary,
            }
            import_data.append({
                "entity_id": entity_id,
                "name": play_name,
                "同场共现": cooccurrence_data,
            })

            success_count += 1

            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "success",
                "total_edges": num_edges,
                "total_characters": num_nodes,
                "total_scenes": num_scenes,
                "max_cooccurrence": summary.get("max_cooccurrence_count", 0),
                "avg_cooccurrence": summary.get("avg_cooccurrence_count", 0),
            })

        except Exception as e:
            fail_count += 1
            print(f"[{idx}/{total}] {play_name}: ❌ 共现检测失败: {e}")
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "error",
                "error": str(e),
            })

    # ── 输出 1: 处理摘要日志 ──
    log_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "cooccurrence_results"
    log_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_dir / f"cooccurrence_{timestamp}.json"

    summary_result = {
        "timestamp": timestamp,
        "total": total,
        "success": success_count,
        "fail": fail_count,
        "dry_run": dry_run,
        "exclude_crowd": exclude_crowd,
        "stats": {
            "total_edges": total_edges,
            "total_nodes": total_nodes,
            "total_scenes": total_scenes_sum,
            "avg_edges_per_play": round(total_edges / total, 1) if total else 0,
            "avg_nodes_per_play": round(total_nodes / total, 1) if total else 0,
        },
        "results": results_log,
    }
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(summary_result, f, ensure_ascii=False, indent=2)

    # ── 输出 2: 导入兼容的持久化文件 ──
    if not dry_run and import_data:
        _save_cooccurrence_export(import_data)

    print()
    print("=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print(f"  本次: {total_edges} 共现边, {total_nodes} 角色, {total_scenes_sum} 场景")
    print(f"  平均每剧: {round(total_edges / total, 1) if total else 0} 共现对, "
          f"{round(total_nodes / total, 1) if total else 0} 角色")
    print(f"  日志文件: {log_file}")
    if not dry_run and import_data:
        print(f"  持久化记录总数: {len(import_data)} 部剧本")
    print("=" * 60)


def _load_existing_export(export_dir: Path) -> List[Dict[str, Any]]:
    """
    加载已有的导出文件数据

    优先读取 .json，其次 .json.gz
    """
    import gzip

    json_file = export_dir / "同场共现.json"
    gz_file = export_dir / "同场共现.json.gz"

    if json_file.exists():
        with open(json_file, "r", encoding="utf-8") as f:
            return json.load(f)
    elif gz_file.exists():
        with gzip.open(gz_file, "rt", encoding="utf-8") as f:
            return json.load(f)
    return []


# ═══════════════════════════════════════════════════════════
#  角色名标准化与别名消歧 (子步骤 2.3)
# ═══════════════════════════════════════════════════════════

# ── 京剧常见角色别名硬编码规则库 ──
# 格式: {标准名: [别名1, 别名2, ...]}
# 每个别名映射为: 别名 → 标准名
_ALIAS_RULES: Dict[str, List[str]] = {
    # ── 三国戏 ──
    "诸葛亮": ["孔明", "卧龙", "诸葛孔明"],
    "刘备": ["玄德", "刘玄德", "皇叔", "使君"],
    "关羽": ["云长", "关云长", "关公", "二爷", "关侯"],
    "张飞": ["翼德", "张翼德", "三爷", "三将军"],
    "赵云": ["子龙", "赵子龙", "子龙将军"],
    "曹操": ["孟德", "曹孟德", "丞相", "魏王"],
    "孙权": ["仲谋", "吴侯"],
    "周瑜": ["公瑾", "周公瑾", "都督"],
    "吕布": ["奉先", "吕奉先", "温侯"],
    "司马懿": ["仲达", "司马仲达"],
    "黄忠": ["汉升", "老将军"],
    "马超": ["孟起"],
    "魏延": ["文长"],
    "姜维": ["伯约"],
    "庞统": ["士元", "凤雏"],
    "鲁肃": ["子敬"],
    "陆逊": ["伯言"],
    "董卓": ["仲颖"],
    "袁绍": ["本初"],
    "黄盖": ["公覆"],
    "甘宁": ["兴霸"],
    "太史慈": ["子义"],
    "夏侯惇": ["元让"],
    "夏侯渊": ["妙才"],
    "张辽": ["文远"],
    "徐晃": ["公明"],
    "许褚": ["仲康"],
    "典韦": ["恶来"],
    "荀彧": ["文若"],
    "郭嘉": ["奉孝"],
    "贾诩": ["文和"],
    "程昱": ["仲德"],
    "马谡": ["幼常"],
    "王平": ["子均"],
    "廖化": ["元俭"],
    "关平": ["坦之"],
    "关兴": ["安国"],
    "张苞": ["兴国"],
    "刘禅": ["公嗣", "阿斗"],
    "孙策": ["伯符"],
    "大乔": ["大桥"],
    "小乔": ["小桥"],
    "甄氏": ["甄宓", "甄夫人"],

    # ── 水浒戏 ──
    "宋江": ["公明", "及时雨", "宋公明", "呼保义"],
    "林冲": ["豹子头", "林教头"],
    "武松": ["行者", "武二郎", "武都头"],
    "鲁智深": ["花和尚", "鲁达", "提辖"],
    "李逵": ["铁牛", "黑旋风"],
    "吴用": ["学究", "智多星", "吴学究"],
    "花荣": ["小李广"],
    "杨志": ["青面兽"],
    "燕青": ["浪子"],
    "时迁": ["鼓上蚤"],
    "卢俊义": ["玉麒麟", "卢员外"],
    "公孙胜": ["入云龙"],
    "秦明": ["霹雳火"],
    "柴进": ["小旋风", "柴大官人"],
    "史进": ["九纹龙"],
    "阮小二": ["立地太岁"],
    "阮小五": ["短命二郎"],
    "阮小七": ["活阎罗"],

    # ── 杨家将戏 ──
    "佘太君": ["太君", "佘氏", "佘赛花"],
    "杨延昭": ["六郎", "杨六郎", "延昭"],
    "穆桂英": ["桂英", "穆氏"],
    "杨宗保": ["宗保"],
    "杨排风": ["排风", "火帅"],
    "杨四郎": ["四郎", "杨延辉"],
    "杨五郎": ["五郎", "杨延德"],
    "杨业": ["令公", "杨令公", "老令公"],
    "萧太后": ["太后", "萧银宗"],
    "柴郡主": ["郡主", "柴公主"],

    # ── 包公戏 ──
    "包拯": ["包公", "包大人", "包青天", "龙图", "包待制"],
    "公孙策": ["先生", "公孙先生"],
    "展昭": ["南侠", "展护卫", "展大人"],
    "王朝": ["王捕头"],
    "马汉": ["马捕头"],

    # ── 西游记戏 ──
    "孙悟空": ["行者", "齐天大圣", "大圣", "猴哥", "孙行者", "美猴王"],
    "猪八戒": ["八戒", "天蓬元帅", "呆子"],
    "唐僧": ["三藏", "玄奘", "唐三藏", "御弟"],
    "沙僧": ["悟净", "沙和尚", "沙悟净", "卷帘大将"],

    # ── 红楼梦戏 ──
    "贾宝玉": ["宝玉", "怡红公子"],
    "林黛玉": ["黛玉", "潇湘妃子", "颦儿", "林姑娘"],
    "薛宝钗": ["宝钗", "蘅芜君", "宝姐姐"],
    "王熙凤": ["凤姐", "凤辣子", "琏二奶奶"],
    "贾母": ["老太太", "史太君"],
    "史湘云": ["湘云", "枕霞旧友"],

    # ── 封神戏 ──
    "姜子牙": ["太公", "姜太公", "飞熊", "尚父"],
    "哪吒": ["三太子", "哪吒三太子"],
    "杨戬": ["二郎神", "清源妙道真君"],
    "闻仲": ["闻太师", "太师"],

    # ── 其他常见历史人物 ──
    "岳飞": ["鹏举", "岳鹏举", "岳元帅"],
    "秦桧": ["会之"],
    "文天祥": ["宋瑞", "文丞相"],
    "项羽": ["霸王", "西楚霸王", "项籍"],
    "虞姬": ["虞美人"],
    "刘邦": ["季", "沛公", "汉王"],
    "韩信": ["重言", "淮阴侯"],
    "萧何": ["相国"],
    "张良": ["子房", "留侯"],
    "范增": ["亚父"],
    "白素贞": ["白蛇", "白娘子", "素贞"],
    "许仙": ["汉文", "许宣"],
    "法海": ["长老", "禅师"],
    "小青": ["青儿", "青蛇"],
    "穆桂英": ["桂英", "穆氏"],
    "王宝钏": ["宝钏", "王三姐"],
    "薛平贵": ["平贵", "薛郎"],
    "薛丁山": ["丁山"],
    "樊梨花": ["梨花"],
    "秦琼": ["叔宝", "秦叔宝", "秦二哥"],
    "程咬金": ["知节", "程知节"],
    "罗成": ["士信"],
    "尉迟恭": ["敬德", "尉迟敬德", "胡敬德"],
    "李世民": ["秦王", "太宗"],
    "魏征": ["玄成", "魏玄成"],
    "徐茂公": ["世勣", "李勣"],
    "廉颇": ["老将军"],
    "蔺相如": ["相如"],
    "荆轲": ["荆卿"],
    "伍子胥": ["子胥", "伍员"],
    "申包胥": ["包胥"],
    "苏武": ["子卿"],
    "李陵": ["少卿"],
    "王昭君": ["昭君", "明妃", "王嫱"],
    "蔡文姬": ["文姬", "蔡琰"],
    "貂蝉": ["貂蝉"],
    "西施": ["施夷光", "夷光"],
    "王允": ["子师"],
    "董允": ["休昭"],
    "颜良": ["公骥"],
    "文丑": ["不可"],

    # ── 京剧特有称呼 ──
    # 称谓型别名（尊称/简称）
    "太后": ["国太", "老佛爷"],
    "皇帝": ["万岁", "圣上", "陛下", "天子"],
    "皇后": ["娘娘", "国母"],
    "公主": ["帝姬", "金枝"],
    "驸马": ["郡马"],
    "丞相": ["相爷", "相国"],
    "太守": ["大人"],
}

# 构建反向映射: 别名 → 标准名
_ALIAS_LOOKUP: Dict[str, str] = {}
for _std_name, _aliases in _ALIAS_RULES.items():
    # 标准名本身也加入映射（指向自己）
    _ALIAS_LOOKUP[_std_name] = _std_name
    for _alias in _aliases:
        _ALIAS_LOOKUP[_alias] = _std_name


# ── 尊称/官称模式 ──
# 一些通用的尊称/简称模式，用于从上下文推断
_HONORIFIC_PATTERNS: List[Tuple[str, str]] = [
    # (模式, 推断规则说明)
    # X公 → X (如"关公" → "关羽"需通过别名库处理)
    # X爷 → X (如"二爷" → "关羽"需通过别名库处理)
    # X大人 → X
]

# 角色名中常见的尊称后缀，可能指代同一角色的不同称呼
_HONORIFIC_SUFFIXES = ["公", "爷", "大人", "老将军", "将军", "侯", "王", "夫人", "小姐", "姑娘", "嫂嫂", "哥哥", "兄弟"]


@dataclass
class AliasMap:
    """一部剧本的角色别名映射"""
    # 别名 → 标准名
    aliases: Dict[str, str] = field(default_factory=dict)
    # 标准名 → [所有别名]（含自身）
    reverse: Dict[str, List[str]] = field(default_factory=dict)
    # 别名来源记录
    sources: Dict[str, str] = field(default_factory=dict)  # alias → "硬编码规则" / "对话推断" / "LLM判定"
    # 消歧后的角色字典（由 build_alias_map 填充）
    resolved_registry: Dict[str, Any] = field(default_factory=dict)

    def resolve(self, name: str) -> str:
        """将别名解析为标准名，若找不到则返回原名"""
        return self.aliases.get(name, name)

    def filter_to_play_characters(self, character_names: set) -> 'AliasMap':
        """
        过滤别名映射，仅保留与当前剧本角色相关的条目

        保留条件：
        - 别名或标准名至少有一方出现在角色名列表中
        - 来源为"对话推断"或"LLM判定"的条目始终保留

        Args:
            character_names: 当前剧本的角色名集合

        Returns:
            过滤后的新 AliasMap
        """
        filtered = AliasMap()
        for alias, std_name in self.aliases.items():
            if alias == std_name:
                continue
            source = self.sources.get(alias, "")
            # 保留条件：别名或标准名在角色列表中，或来源为剧本特定推断
            is_relevant = (
                alias in character_names
                or std_name in character_names
                or source in ("对话推断",) or source.startswith("LLM")
            )
            if is_relevant:
                filtered.aliases[alias] = std_name
                filtered.sources[alias] = source

        # 标准名自身也加入映射（用于 resolve）
        for name in character_names:
            if name not in filtered.aliases:
                filtered.aliases[name] = name

        # 重建反向索引（仅包含已过滤的别名）
        reverse: Dict[str, List[str]] = defaultdict(list)
        for alias, std_name in filtered.aliases.items():
            if alias != std_name:
                reverse[std_name].append(alias)
        for std_name in reverse:
            if std_name not in reverse[std_name]:
                reverse[std_name].insert(0, std_name)
        # 确保角色列表中的标准名也在 reverse 中
        for name in character_names:
            if name not in reverse:
                reverse[name] = [name]
        filtered.reverse = dict(reverse)

        # 复制消歧后的角色字典
        filtered.resolved_registry = self.resolved_registry

        return filtered

    def to_dict(self) -> Dict[str, Any]:
        """序列化为可 JSON 化的字典"""
        result = {
            "别名映射": {alias: std for alias, std in self.aliases.items() if alias != std},
            "标准名索引": self.reverse,
            "来源": self.sources,
        }
        if self.resolved_registry:
            result["消歧后角色字典"] = self.resolved_registry
        return result


class AliasResolver:
    """
    角色别名消歧器

    从多个来源构建别名映射：
    1. 硬编码规则库（京剧常见角色别名）
    2. 剧本内部推断（从对话和情节中推断）
    3. LLM 辅助判定（处理无法规则解决的别名）
    """

    def __init__(self):
        self.alias_map = AliasMap()
        # 初始化硬编码规则
        for alias, std_name in _ALIAS_LOOKUP.items():
            if alias != std_name:
                self.alias_map.aliases[alias] = std_name
                self.alias_map.sources[alias] = "硬编码规则"
        # 构建反向索引
        self._rebuild_reverse()

    def _rebuild_reverse(self):
        """重建反向索引"""
        reverse: Dict[str, List[str]] = defaultdict(list)
        for alias, std_name in self.alias_map.aliases.items():
            reverse[std_name].append(alias)
        # 确保标准名本身在列表中
        for std_name in reverse:
            if std_name not in reverse[std_name]:
                reverse[std_name].insert(0, std_name)
        self.alias_map.reverse = dict(reverse)

    def add_rule(self, alias: str, standard_name: str, source: str = "手动添加"):
        """手动添加一条别名规则"""
        if alias == standard_name:
            return
        self.alias_map.aliases[alias] = standard_name
        self.alias_map.sources[alias] = source
        self._rebuild_reverse()

    def resolve(self, name: str) -> str:
        """解析别名，返回标准名"""
        return self.alias_map.resolve(name)

    def has_alias(self, name: str) -> bool:
        """判断名称是否为已知别名"""
        return name in self.alias_map.aliases and self.alias_map.aliases[name] != name

    def resolve_registry(self, registry: CharacterRegistry) -> CharacterRegistry:
        """
        对角色字典中的所有角色名应用别名消歧

        将别名角色合并到标准名角色下，合并统计信息。

        Args:
            registry: 原始角色字典

        Returns:
            消歧后的角色字典
        """
        resolved = CharacterRegistry()
        # 收集每个标准名下的所有信息
        merged: Dict[str, List[CharacterInfo]] = defaultdict(list)

        for name, info in registry.characters.items():
            std_name = self.resolve(name)
            # 创建一个新的 CharacterInfo，名字替换为标准名
            new_info = CharacterInfo(
                name=std_name,
                role_type=info.role_type,
                scenes=list(info.scenes),
                dialogue_count=info.dialogue_count,
                is_crowd=info.is_crowd,
                source=info.source,
            )
            merged[std_name].append(new_info)

        # 合并同一标准名下的角色信息
        for std_name, info_list in merged.items():
            if len(info_list) == 1:
                resolved.characters[std_name] = info_list[0]
            else:
                # 合并：取非空的行当、合并场景、累加对话数
                best_role_type = ""
                all_scenes = set()
                total_dialogue = 0
                is_crowd = False
                sources = set()

                for info in info_list:
                    if info.role_type and not best_role_type:
                        best_role_type = info.role_type
                    all_scenes.update(info.scenes)
                    total_dialogue += info.dialogue_count
                    if info.is_crowd:
                        is_crowd = True
                    sources.add(info.source)

                resolved.characters[std_name] = CharacterInfo(
                    name=std_name,
                    role_type=best_role_type,
                    scenes=sorted(all_scenes),
                    dialogue_count=total_dialogue,
                    is_crowd=is_crowd,
                    source=" + ".join(sorted(sources)),
                )

        return resolved


def infer_aliases_from_play(
    play_name: str,
    characters: Dict[str, CharacterInfo],
    content: str = "",
    plot: str = "",
) -> Dict[str, str]:
    """
    从剧本内部推断角色别名关系

    推断策略：
    1. 角色名字符串包含关系（如"诸葛亮"包含"诸葛"）
    2. 常见尊称模式（如X公、X爷、X夫人等）
    3. 情节文本中的称呼（从情节概要中提取"某又称某"）

    Args:
        play_name: 剧本名
        characters: 角色字典
        content: 正文对话
        plot: 情节概要

    Returns:
        推断出的别名映射 {别名: 标准名}
    """
    inferred: Dict[str, str] = {}
    char_names = set(characters.keys())

    # ── 策略 1: 尊称/简称匹配 ──
    # 对于每个非群众角色，检查是否有其他角色的名字是其尊称形式
    for name in char_names:
        if is_crowd_character(name):
            continue

        # 检查名字是否为某已知角色的尊称简称
        # 例如："太君" 可能是 "佘太君" 的简称
        for other_name in char_names:
            if other_name == name or is_crowd_character(other_name):
                continue
            # name 是 other_name 的后缀（如 "太君" 是 "佘太君" 的后缀）
            if len(other_name) > len(name) and other_name.endswith(name):
                # 短名是长名的尾部，可能是简称
                prefix = other_name[:-len(name)]
                # 短名至少2个字才有意义
                if len(name) >= 2:
                    inferred[name] = other_name
                    break

    # ── 策略 2: 从情节文本推断 ──
    # 匹配模式: "A（又名B）" / "A，即B" / "A，又称B" 等
    if plot:
        # "A又名B" / "A（又名B）" / "A，亦称B" / "A即B"
        alias_patterns = [
            re.compile(r'(\w{2,4})（又名(\w{2,4})）'),
            re.compile(r'(\w{2,4})，又名(\w{2,4})'),
            re.compile(r'(\w{2,4})（亦称(\w{2,4})）'),
            re.compile(r'(\w{2,4})，亦称(\w{2,4})'),
            re.compile(r'(\w{2,4})即(\w{2,4})'),
            re.compile(r'(\w{2,4})，又称(\w{2,4})'),
            re.compile(r'(\w{2,4})（(\w{2,4})）'),  # 括号注释可能是别名
        ]
        for pat in alias_patterns:
            for m in pat.finditer(plot):
                name_a, name_b = m.group(1), m.group(2)
                # 检查是否都在角色名中
                if name_a in char_names and name_b in char_names:
                    # 两者都是角色名，可能是别名关系
                    # 长名通常为标准名
                    if len(name_a) >= len(name_b):
                        inferred[name_b] = name_a
                    else:
                        inferred[name_a] = name_b

    # ── 策略 3: 从对话内容推断 ──
    # 当角色在台词中被称为另一名字时
    # 如: 司马昭说 "那孔明..." → "孔明" 是 "诸葛亮" 的别名
    if content:
        for char_name in char_names:
            if is_crowd_character(char_name):
                continue
            # 在对话中查找称呼模式
            # "叫X" "唤X" "那X" "X他" 等后面跟的名字
            # 这是一个简化的实现，仅处理最常见的模式
            pass  # 复杂的对话推断留给 LLM 辅助

    return inferred


def build_alias_map(
    entity_id: Optional[int] = None,
    content: str = "",
    attributes: Optional[Dict[str, Any]] = None,
    play_name: str = "",
    llm=None,
) -> AliasMap:
    """
    构建一部剧本的角色别名映射

    合并策略：
    1. 先使用硬编码规则库
    2. 再从剧本内部推断
    3. 最后（可选）使用 LLM 辅助判定

    Args:
        entity_id: 实体 ID（用于从数据库获取数据）
        content: 剧本正文对话
        attributes: 实体属性字典
        play_name: 剧本名
        llm: LLM 实例（可选，用于辅助消歧）

    Returns:
        AliasMap 别名映射
    """
    if entity_id is not None:
        conn = get_db_connection()
        try:
            row = conn.execute(
                "SELECT name, content, attributes FROM entities WHERE id = ?",
                (entity_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return AliasMap()
        play_name = row["name"]
        content = row["content"] or ""
        attributes = json.loads(row["attributes"]) if row["attributes"] else {}

    if attributes is None:
        attributes = {}

    resolver = AliasResolver()

    # ── 步骤 1: 构建角色字典 ──
    registry = build_character_registry(
        content=content,
        attributes=attributes,
        play_name=play_name,
    )

    # ── 步骤 2: 从剧本内部推断别名 ──
    plot = attributes.get("情节概要", "")
    if isinstance(plot, list):
        plot = " ".join(str(p) for p in plot) if plot else ""

    inferred = infer_aliases_from_play(
        play_name=play_name,
        characters=registry.characters,
        content=content,
        plot=str(plot),
    )
    for alias, std_name in inferred.items():
        if alias not in resolver.alias_map.aliases:
            resolver.add_rule(alias, std_name, source="对话推断")

    # ── 步骤 3: LLM 辅助消歧（可选）──
    if llm is not None:
        _llm_resolve_aliases(resolver, registry, play_name, content, attributes, llm)

    # ── 步骤 4: 应用别名消歧到角色字典 ──
    resolved_registry = resolver.resolve_registry(registry)

    # 将消歧后的角色字典存入 AliasMap
    resolver.alias_map.resolved_registry = resolved_registry.to_dict()

    # ── 步骤 5: 过滤别名映射，仅保留与当前剧本角色相关的条目 ──
    character_names = set(registry.characters.keys())
    filtered_map = resolver.alias_map.filter_to_play_characters(character_names)

    return filtered_map


def _llm_resolve_aliases(
    resolver: AliasResolver,
    registry: CharacterRegistry,
    play_name: str,
    content: str,
    attributes: Dict[str, Any],
    llm,
):
    """
    使用 LLM 辅助消歧角色别名

    对于角色字典中无法用规则解决的潜在别名对，调用 LLM 判断是否为同一角色。

    判定逻辑：
    1. 收集角色字典中的所有非群众角色名
    2. 识别"可疑别名对"：名字相似（如2字名是3字名的子串）但未被规则匹配
    3. 批量请求 LLM 判断
    """
    from services.prompts_opera import resolve_character_aliases

    char_names = [
        name for name, info in registry.characters.items()
        if not info.is_crowd and not resolver.has_alias(name)
    ]

    if len(char_names) < 2:
        return

    # 识别可疑别名对
    suspicious_pairs: List[Tuple[str, str]] = []
    for i, name_a in enumerate(char_names):
        for name_b in char_names[i + 1:]:
            # 短名是长名的子串
            if len(name_a) >= 2 and len(name_b) >= 2:
                if name_a in name_b or name_b in name_a:
                    suspicious_pairs.append((name_a, name_b))
                # 名字有部分重叠（如 "穆桂英" 和 "桂英"）
                elif len(name_a) >= 2 and len(name_b) >= 2:
                    # 检查后2字是否相同
                    if name_a[-2:] == name_b[-2:] and name_a != name_b:
                        suspicious_pairs.append((name_a, name_b))

    if not suspicious_pairs:
        return

    # 限制对数，避免 LLM 请求过长
    if len(suspicious_pairs) > 20:
        suspicious_pairs = suspicious_pairs[:20]

    # 调用 LLM
    try:
        detail = {
            "name": play_name,
            "content": content[:2000],
            "attributes": attributes,
        }
        result = resolve_character_aliases(llm, detail, suspicious_pairs)
        if result and "aliases" in result:
            for alias_info in result["aliases"]:
                alias = alias_info.get("alias", "")
                standard = alias_info.get("standard", "")
                confidence = alias_info.get("confidence", "low")
                if alias and standard and confidence in ("high", "medium"):
                    resolver.add_rule(alias, standard, source=f"LLM判定({confidence})")
    except Exception as e:
        print(f"  ⚠ LLM别名消歧失败: {e}")


def alias_single(entity_id: int, use_llm: bool = False):
    """为单个剧本构建别名映射并打印"""
    llm = None
    if use_llm:
        llm = _get_llm_instance()

    alias_map = build_alias_map(entity_id=entity_id, llm=llm)

    # 获取剧名
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT name FROM entities WHERE id = ?", (entity_id,)).fetchone()
    finally:
        conn.close()
    play_name = row["name"] if row else f"id={entity_id}"

    print(f"剧本: {play_name}")

    # 统计
    alias_count = sum(1 for a, s in alias_map.aliases.items() if a != s)
    # 仅统计与当前剧本角色相关的别名
    relevant_aliases = {a: s for a, s in alias_map.aliases.items() if a != s}

    print(f"总别名规则数: {alias_count}")
    print(f"来源分布:")
    source_counts: Dict[str, int] = Counter()
    for alias, source in alias_map.sources.items():
        source_counts[source] += 1
    for source, count in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"  {source}: {count}")

    if alias_map.resolved_registry:
        print(f"\n── 消歧后角色列表 ──")
        for name, info in sorted(
            alias_map.resolved_registry.items(),
            key=lambda x: -x[1].get("dialogue_count", 0)
        ):
            dc = info.get("dialogue_count", 0)
            rt = info.get("role_type", "")
            rt_str = f"（{rt}）" if rt else ""
            print(f"  {name}{rt_str}: {dc} 条")


def _collect_import_data(
    plays: List[Dict[str, Any]],
    results_log: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    收集所有剧本的别名映射数据，格式兼容 db_import_attributes.py

    从数据库中读取已写入的 角色别名映射 属性，
    生成与 db_export_attributes.py 输出格式相同的数据。

    Args:
        plays: 剧本列表
        results_log: 处理结果日志

    Returns:
        [{entity_id, name, 角色别名映射: {...}}, ...]
    """
    import_data = []
    # 收集成功处理的 entity_id
    success_ids = {
        r["entity_id"] for r in results_log if r.get("status") == "success"
    }

    conn = get_db_connection()
    try:
        for play in plays:
            entity_id = play["id"]
            if entity_id not in success_ids:
                continue

            row = conn.execute(
                """SELECT name, json_extract(attributes, '$."角色别名映射"') AS val
                   FROM entities WHERE id = ?""",
                (entity_id,),
            ).fetchone()
            if not row or not row["val"]:
                continue

            val = row["val"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    continue

            import_data.append({
                "entity_id": entity_id,
                "name": row["name"],
                "角色别名映射": val,
            })
    finally:
        conn.close()

    return import_data


def _save_import_compatible_json(
    import_data: List[Dict[str, Any]],
    output_dir: Optional[Path] = None,
) -> Path:
    """
    将别名映射数据保存为兼容 db_import_attributes.py 的 JSON 文件

    格式与 db_export_attributes.py 的输出一致，
    可直接通过 db_import_attributes.py --keys 角色别名映射 导入。

    Args:
        import_data: _collect_import_data 的输出
        output_dir: 输出目录，默认为 data/processed/db_exports/

    Returns:
        输出文件路径
    """
    import gzip

    if output_dir is None:
        output_dir = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    file_size_est = len(json.dumps(import_data, ensure_ascii=False))
    key = "角色别名映射"

    if file_size_est > 500_000:  # >500KB 时压缩
        output_file = output_dir / f"{key}.json.gz"
        with gzip.open(output_file, "wt", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)
    else:
        output_file = output_dir / f"{key}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(import_data, f, ensure_ascii=False, indent=2)

    file_size = output_file.stat().st_size
    print(f"\n  持久化文件: {output_file.name} ({file_size / 1024:.1f} KB, {len(import_data)} 部剧本)")
    print(f"  可通过 db_import_attributes.py --keys {key} 导入到新环境")

    return output_file


def run_alias_batch(
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    dry_run: bool = False,
    use_llm: bool = False,
):
    """批量构建角色别名映射并写入数据库"""
    print("=" * 60)
    print("  京剧剧本角色别名消歧批量处理")
    print("=" * 60)
    print(f"  模式: {'预览 (dry-run)' if dry_run else '正式写入'}")
    print(f"  覆盖已有: {'是' if overwrite else '否'}")
    print(f"  使用LLM: {'是' if use_llm else '否'}")
    if dataset_id:
        print(f"  限定数据集: {dataset_id}")
    if limit:
        print(f"  数量限制: {limit}")
    print()

    conn = get_db_connection()
    try:
        # 获取所有 opera_script 实体（detect_cooccurrence 会自行计算角色字典和别名映射）
        conditions = ["e.type = 'opera_script'"]
        params: list = []

        if dataset_id:
            conditions.append("e.dataset_id = ?")
            params.append(dataset_id)

        if not overwrite:
            conditions.append(
                "json_extract(e.attributes, '$.角色别名映射') IS NULL"
            )

        where = " AND ".join(conditions)
        sql = f"""
            SELECT e.id, e.name, e.content, e.attributes
            FROM entities e
            WHERE {where}
            ORDER BY e.id
        """
        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    plays = []
    for row in rows:
        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        plays.append({
            "id": row["id"],
            "name": row["name"],
            "content": row["content"] or "",
            "attributes": attrs or {},
        })

    total = len(plays)
    if total == 0:
        print("没有需要处理别名消歧的剧本，退出。")
        return

    print(f"共 {total} 部剧本待处理\n")

    success_count = 0
    fail_count = 0
    results_log = []
    import_data = list(existing_data)  # 从已有数据开始
    total_aliases = 0
    total_rule_based = 0
    total_inferred = 0
    total_llm = 0

    llm = None
    if use_llm:
        llm = _get_llm_instance()

    for idx, play in enumerate(plays, 1):
        entity_id = play["id"]
        play_name = play["name"]

        try:
            alias_map = build_alias_map(
                content=play["content"],
                attributes=play["attributes"],
                play_name=play_name,
                llm=llm,
            )

            # 统计本剧本的别名数量
            play_aliases = {a: s for a, s in alias_map.aliases.items() if a != s}
            rule_based = sum(1 for a in play_aliases if alias_map.sources.get(a, "") == "硬编码规则")
            inferred = sum(1 for a in play_aliases if alias_map.sources.get(a, "") == "对话推断")
            llm_based = sum(1 for a in play_aliases if alias_map.sources.get(a, "").startswith("LLM"))

            total_aliases += len(play_aliases)
            total_rule_based += rule_based
            total_inferred += inferred
            total_llm += llm_based

            print(f"[{idx}/{total}] {play_name}: {len(play_aliases)} 个别名 "
                  f"(规则:{rule_based}, 推断:{inferred}, LLM:{llm_based})")

            if dry_run:
                success_count += 1
            else:
                # 写入数据库
                alias_data = alias_map.to_dict()

                write_conn = get_db_connection()
                try:
                    ok = _safe_update_attributes(
                        write_conn, entity_id,
                        {"角色别名映射": alias_data},
                        overwrite=True,
                    )
                    if ok:
                        success_count += 1
                    else:
                        fail_count += 1
                        print(f"  ❌ 写入失败")
                except Exception as e:
                    fail_count += 1
                    print(f"  ❌ 写入异常: {e}")
                finally:
                    write_conn.close()

            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "success",
                "alias_count": len(play_aliases),
                "rule_based": rule_based,
                "inferred": inferred,
                "llm_based": llm_based,
            })

        except Exception as e:
            fail_count += 1
            print(f"[{idx}/{total}] {play_name}: ❌ 别名消歧失败: {e}")
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "error",
                "error": str(e),
            })

    # ── 输出 1: 处理摘要日志 ──
    output_dir = PROJECT_ROOT / "data" / "alias_resolution_results"
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"alias_resolution_{timestamp}.json"

    summary = {
        "timestamp": timestamp,
        "total": total,
        "success": success_count,
        "fail": fail_count,
        "dry_run": dry_run,
        "use_llm": use_llm,
        "stats": {
            "total_aliases": total_aliases,
            "total_rule_based": total_rule_based,
            "total_inferred": total_inferred,
            "total_llm": total_llm,
            "avg_aliases_per_play": round(total_aliases / total, 1) if total else 0,
        },
        "results": results_log,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # ── 输出 2: 导入兼容的持久化文件（用于 db_import_attributes.py 恢复）──
    # 即使 dry-run 模式也生成，以便预览数据
    if not dry_run and results_log:
        import_data = _collect_import_data(plays, results_log)
        _save_import_compatible_json(import_data)

    print()
    print("=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    print(f"  总别名数: {total_aliases} "
          f"(规则:{total_rule_based}, 推断:{total_inferred}, LLM:{total_llm})")
    print(f"  平均每剧: {round(total_aliases / total, 1) if total else 0} 个别名")
    print(f"  结果备份: {output_file}")
    print("=" * 60)


def _get_llm_instance():
    """获取 LLM 实例"""
    from services.llm_service import LLMService
    llm_service = LLMService()
    return llm_service.get_llm()


# ═══════════════════════════════════════════════════════════
#  命令行入口
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="京剧剧本对话解析脚本 - 从正文对话中提取角色、场景、对话信息"
    )

    subparsers = parser.add_subparsers(dest="mode", help="运行模式")

    # ── survey 模式 ──
    survey_p = subparsers.add_parser("survey", help="对话格式调研")
    survey_p.add_argument("--limit", type=int, default=50, help="调研剧本数量")

    # ── parse 模式 ──
    parse_p = subparsers.add_parser("parse", help="解析对话")

    # 单剧本选项
    parse_p.add_argument("--entity-id", type=int, default=None, help="指定数据库中的实体 ID")
    parse_p.add_argument("--json-file", type=str, default=None, help="指定 JSON 文件路径")

    # 批量选项
    parse_p.add_argument("--batch", action="store_true", help="批量处理所有剧本")
    parse_p.add_argument("--dataset-id", type=str, default=None, help="限定数据集 ID")
    parse_p.add_argument("--limit", type=int, default=None, help="限制处理数量")
    parse_p.add_argument("--overwrite", action="store_true", help="覆盖已有解析结果")
    parse_p.add_argument("--dry-run", action="store_true", help="仅预览，不写入数据库")

    # ── registry 模式 ──
    registry_p = subparsers.add_parser("registry", help="构建角色字典")
    registry_p.add_argument("--entity-id", type=int, default=None, help="指定数据库中的实体 ID")
    registry_p.add_argument("--batch", action="store_true", help="批量处理所有剧本")
    registry_p.add_argument("--dataset-id", type=str, default=None, help="限定数据集 ID")
    registry_p.add_argument("--limit", type=int, default=None, help="限制处理数量")
    registry_p.add_argument("--overwrite", action="store_true", help="覆盖已有角色字典")
    registry_p.add_argument("--dry-run", action="store_true", help="仅预览，不写入数据库")

    # ── alias 模式 ──
    alias_p = subparsers.add_parser("alias", help="角色别名消歧")
    alias_p.add_argument("--entity-id", type=int, default=None, help="指定数据库中的实体 ID")
    alias_p.add_argument("--batch", action="store_true", help="批量处理所有剧本")
    alias_p.add_argument("--dataset-id", type=str, default=None, help="限定数据集 ID")
    alias_p.add_argument("--limit", type=int, default=None, help="限制处理数量")
    alias_p.add_argument("--overwrite", action="store_true", help="覆盖已有别名映射")
    alias_p.add_argument("--dry-run", action="store_true", help="仅预览，不写入数据库")
    alias_p.add_argument("--use-llm", action="store_true", help="启用 LLM 辅助消歧")

    # ── cooccurrence 模式 ──
    cooc_p = subparsers.add_parser("cooccurrence", help="同场共现检测")
    cooc_p.add_argument("--entity-id", type=int, default=None, help="指定数据库中的实体 ID")
    cooc_p.add_argument("--batch", action="store_true", help="批量处理所有剧本")
    cooc_p.add_argument("--dataset-id", type=str, default=None, help="限定数据集 ID")
    cooc_p.add_argument("--limit", type=int, default=None, help="限制处理数量")
    cooc_p.add_argument("--overwrite", action="store_true", help="覆盖已有共现数据")
    cooc_p.add_argument("--dry-run", action="store_true", help="仅预览，不写入数据库")
    cooc_p.add_argument("--include-crowd", action="store_true", help="包含群众角色的共现关系")

    args = parser.parse_args()

    if args.mode == "survey":
        run_survey(limit=args.limit)
    elif args.mode == "parse":
        if args.batch:
            run_batch(
                dataset_id=args.dataset_id,
                limit=args.limit,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
            )
        else:
            parse_single(entity_id=args.entity_id, json_file=args.json_file)
    elif args.mode == "registry":
        if args.batch:
            run_registry_batch(
                dataset_id=args.dataset_id,
                limit=args.limit,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
            )
        elif args.entity_id:
            registry_single(entity_id=args.entity_id)
        else:
            registry_p.print_help()
    elif args.mode == "alias":
        if args.batch:
            run_alias_batch(
                dataset_id=args.dataset_id,
                limit=args.limit,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
                use_llm=args.use_llm,
            )
        elif args.entity_id:
            alias_single(entity_id=args.entity_id, use_llm=args.use_llm)
        else:
            alias_p.print_help()
    elif args.mode == "cooccurrence":
        if args.batch:
            run_cooccurrence_batch(
                dataset_id=args.dataset_id,
                limit=args.limit,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
                exclude_crowd=not args.include_crowd,
            )
        elif args.entity_id:
            cooccurrence_single(
                entity_id=args.entity_id,
                exclude_crowd=not args.include_crowd,
            )
        else:
            cooc_p.print_help()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
