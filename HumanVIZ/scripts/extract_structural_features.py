"""
Phase 1: 批量结构指纹提取
从全部 1473 本剧本的 JSON 中提取结构特征向量（纯正则，无 LLM）

输出: structural_fingerprints.json (1473 × ~30 维)
"""

import json
import os
import re
from pathlib import Path
from collections import Counter
import numpy as np
from tqdm import tqdm


# ============================================================
# 配置
# ============================================================
BASE_DIR = "/workspace/HumanVIZ/data/dataSet"
OUTPUT_PATH = "/workspace/HumanVIZ/data/structural_fingerprints.json"
GENRE_PATH = "/workspace/HumanVIZ/data/db_exports/剧目类型.json"

# 场景边界正则
SCENE_RE = re.compile(r'【第[一二三四五六七八九十\d]+[场折幕]】')
SCENE_WITH_TITLE_RE = re.compile(r'【[^】]*[场折幕][：:][^】]*】')
SCENE_ANY_RE = re.compile(r'【[^】]*(?:场|折|幕|本|出)[^】]*】')

# 表演类型正则 (从对话中提取 （xxx） 标记)
PERF_MARKER_RE = re.compile(r'（([^）]*)）')

# 角色行正则: 行首的 2-4 字中文角色名 + 空格 + （表演类型）
CHAR_LINE_RE = re.compile(r'^([\u4e00-\u9fa5]{2,4})\s+（', re.MULTILINE)

# 西皮/二黄 分类
XIPI_PATTERNS = ['西皮']
ERHUANG_PATTERNS = ['二黄', '二簧']

# 唱腔板式分类
SINGING_STYLES = {
    '快板类': ['快板', '流水板', '快三眼'],
    '摇板类': ['摇板', '散板'],
    '慢板类': ['慢板', '慢三眼'],
    '原板类': ['原板', '二六板'],
    '导板类': ['导板', '回龙'],
}

# 情绪标记
EMOTION_MARKERS = ['笑', '哭', '哭头', '叫头', '三叫头']

# 冲突/舞台指示
CONFLICT_MARKERS = ['急急风', '四击头', '乱锤', '起鼓', '急急风过场',
                    '杀', '斩', '打', '战', '斗']

# 舞台动作指示
STAGE_ACTION_MARKERS = ['上', '下', '过场']


def classify_singing_style(marker: str) -> str | None:
    """将表演标记分类到唱腔板式类别"""
    for category, patterns in SINGING_STYLES.items():
        for pat in patterns:
            if pat in marker:
                return category
    return None


def classify_performance_type(marker: str) -> str:
    """
    将表演标记分类到五大类型: 唱/念/做/打/白
    处理复合标记如'西皮摇板' → 唱, '同白' → 白
    """
    # 先检查是否为唱腔板式
    for cat, patterns in SINGING_STYLES.items():
        for pat in patterns:
            if pat in marker:
                return '唱'

    # 直接匹配
    if '唱' in marker:
        return '唱'
    if '念' in marker:
        return '念'
    if '做' in marker:
        return '做'
    if '打' in marker:
        return '打'
    if '白' in marker:
        return '白'

    # 特殊: 引子/定场诗/点绛唇 归入念
    if any(x in marker for x in ['引子', '点绛唇', '定场诗']):
        return '念'

    return 'other'


def is_xipi(marker: str) -> bool:
    return any(p in marker for p in XIPI_PATTERNS)


def is_erhuang(marker: str) -> bool:
    return any(p in marker for p in ERHUANG_PATTERNS)


def extract_features(json_path: str, genre_map: dict) -> dict:
    """从单个剧本 JSON 提取结构特征"""
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    dialogue = data.get('正文对话', '')
    title = data.get('剧本名字', '')
    source_folder = data.get('source_folder', '')
    source_name = data.get('source_folder_name', '')

    # ---- 场景切分 ----
    scenes = SCENE_RE.findall(dialogue)
    if not scenes:
        scenes = SCENE_WITH_TITLE_RE.findall(dialogue)
    if not scenes:
        scenes = SCENE_ANY_RE.findall(dialogue)

    scene_count = len(scenes) if scenes else 0

    # 按场景切分对话
    scene_texts = []
    if scenes:
        # 用场景标记切分
        parts = SCENE_ANY_RE.split(dialogue)
        # 跳过场景标记前的非正文内容
        first_scene_idx = 0
        for i, part in enumerate(parts):
            if part.strip():
                first_scene_idx = i
                break
        scene_texts = [s.strip() for s in parts[first_scene_idx + 1:] if s.strip()]
        # 确保数量匹配
        if len(scene_texts) > len(scenes):
            scene_texts = scene_texts[:len(scenes)]
    else:
        scene_texts = [dialogue]

    # ---- 表演类型统计 ----
    perf_markers = PERF_MARKER_RE.findall(dialogue)
    perf_counter = Counter()
    singing_styles_counter = Counter()
    xipi_count = 0
    erhuang_count = 0
    emotion_count = 0

    for marker in perf_markers:
        marker = marker.strip()
        if not marker:
            continue
        ptype = classify_performance_type(marker)
        perf_counter[ptype] += 1

        if ptype == '唱':
            style_cat = classify_singing_style(marker)
            if style_cat:
                singing_styles_counter[style_cat] += 1
            if is_xipi(marker):
                xipi_count += 1
            if is_erhuang(marker):
                erhuang_count += 1

        if any(em in marker for em in EMOTION_MARKERS):
            emotion_count += 1

    total_perf = sum(perf_counter.values()) or 1  # 避免除零

    # ---- 每场特征 ----
    scene_lines = []
    scene_char_counts = []
    scene_perf_counters = []
    for st in scene_texts:
        lines = [l for l in st.split('\n') if l.strip()]
        scene_lines.append(len(lines))
        char_lines = CHAR_LINE_RE.findall(st)
        scene_char_counts.append(len(set(char_lines)))
        # 每场表演类型
        s_markers = PERF_MARKER_RE.findall(st)
        s_counter = Counter()
        for m in s_markers:
            s_counter[classify_performance_type(m.strip())] += 1
        scene_perf_counters.append(s_counter)

    # ---- 台词行数 ----
    total_lines = sum(scene_lines)
    avg_lines_per_scene = total_lines / len(scene_lines) if scene_lines else total_lines
    scene_lines_cv = float(np.std(scene_lines) / np.mean(scene_lines)) \
        if len(scene_lines) > 1 and np.mean(scene_lines) > 0 else 0.0

    # ---- 角色统计 ----
    all_chars = list(set(CHAR_LINE_RE.findall(dialogue)))
    char_count = len(all_chars)
    avg_chars_per_scene = np.mean(scene_char_counts) if scene_char_counts else 0.0

    # 角色对话集中度 (Top-3)
    char_line_counts = Counter(CHAR_LINE_RE.findall(dialogue))
    top3_lines = sum(c for _, c in char_line_counts.most_common(3))
    total_char_lines = sum(char_line_counts.values()) or 1
    top3_concentration = top3_lines / total_char_lines

    # ---- 场景节奏 ----
    first_last_ratio = 0.0
    if len(scene_lines) >= 2 and scene_lines[-1] > 0:
        first_last_ratio = scene_lines[0] / scene_lines[-1]

    # 最长场位置 (归一化)
    max_scene_pos = 0.0
    if scene_lines:
        max_idx = np.argmax(scene_lines)
        max_scene_pos = max_idx / len(scene_lines) if len(scene_lines) > 1 else 0.5

    # 场景间行数变化率
    line_change_rate = 0.0
    if len(scene_lines) >= 2:
        diffs = [abs(scene_lines[i] - scene_lines[i - 1]) /
                 max(scene_lines[i] + scene_lines[i - 1], 1)
                 for i in range(1, len(scene_lines))]
        line_change_rate = float(np.mean(diffs))

    # ---- 情绪/冲突密度 ----
    conflict_count = sum(1 for m in perf_markers
                         if any(c in m for c in CONFLICT_MARKERS))
    conflict_density = conflict_count / max(total_lines, 1)

    emotion_density = emotion_count / max(total_perf, 1)

    # ---- 唱腔板式多样性 ----
    ban_variety = len(singing_styles_counter)

    # ---- 是否有场景标记 ----
    has_scene_markers = scene_count > 0

    # ---- 来源分类 ----
    source_category = classify_source(source_folder)

    # ---- 剧目类型 ----
    genre = genre_map.get(title, genre_map.get(data.get('file_name', ''), ''))

    # ---- 构建特征向量 ----
    features = {
        # 标识
        'entity_id': data.get('file_name', os.path.basename(json_path)).replace('.json', ''),
        'title': title,
        'source_folder': source_folder,
        'source_name': source_name,
        'source_category': source_category,
        'genre': genre,

        # 场景规模
        'scene_count': scene_count,
        'total_lines': total_lines,
        'avg_lines_per_scene': round(avg_lines_per_scene, 2),

        # 表演类型占比 (0-1)
        'singing_ratio': round(perf_counter.get('唱', 0) / total_perf, 4),
        'reciting_ratio': round(perf_counter.get('念', 0) / total_perf, 4),
        'speaking_ratio': round(perf_counter.get('白', 0) / total_perf, 4),
        'acting_ratio': round(perf_counter.get('做', 0) / total_perf, 4),
        'fighting_ratio': round(perf_counter.get('打', 0) / total_perf, 4),

        # 唱腔细分
        'xipi_ratio': round(xipi_count / max(total_perf, 1), 4),
        'erhuang_ratio': round(erhuang_count / max(total_perf, 1), 4),
        'ban_variety': ban_variety,

        # 唱腔板式分布
        'singing_style_fast': round(singing_styles_counter.get('快板类', 0) / max(total_perf, 1), 4),
        'singing_style_yaoban': round(singing_styles_counter.get('摇板类', 0) / max(total_perf, 1), 4),
        'singing_style_slow': round(singing_styles_counter.get('慢板类', 0) / max(total_perf, 1), 4),
        'singing_style_yuanban': round(singing_styles_counter.get('原板类', 0) / max(total_perf, 1), 4),
        'singing_style_daoban': round(singing_styles_counter.get('导板类', 0) / max(total_perf, 1), 4),

        # 场景节奏
        'scene_lines_cv': round(scene_lines_cv, 4),
        'first_last_ratio': round(first_last_ratio, 4),
        'max_scene_pos': round(max_scene_pos, 4),
        'line_change_rate': round(line_change_rate, 4),

        # 情绪/冲突
        'emotion_density': round(emotion_density, 4),
        'conflict_density': round(conflict_density, 4),

        # 角色维度
        'character_count': char_count,
        'avg_chars_per_scene': round(avg_chars_per_scene, 2),
        'top3_concentration': round(top3_concentration, 4),

        # 格式特征
        'has_scene_markers': has_scene_markers,
    }

    return features


def classify_source(folder_code: str) -> str:
    """将 source_folder 映射到来源大类"""
    if folder_code in ('01000000', '02000000', '03000000', '04000000',
                        '05000000', '07000000', '08000000', '09000000',
                        '10000000', '11000000', '13000000', '14000000',
                        '15000000'):
        # 细分: 民国 vs 新中国
        if folder_code in ('01000000', '02000000', '10000000',
                            '13000000', '14000000', '15000000'):
            return '民国汇编本'
        else:
            return '新中国整理本'

    # 709/708 必须优先判断 (它们也以 70 开头)
    if folder_code.startswith('709'):
        return '昆曲剧本选'

    if folder_code.startswith('708'):
        return '现代剧作家本'

    if folder_code.startswith('70'):
        return '名家演出本'

    if folder_code in ('80000000', '90000000', '94000000'):
        return '录音藏本及其他'

    return '其他'


def main():
    # 加载剧目类型映射
    genre_map = {}
    if os.path.exists(GENRE_PATH):
        with open(GENRE_PATH, encoding='utf-8') as f:
            genre_data = json.load(f)
        for item in genre_data:
            genre_map[item['name']] = item['剧目类型']
            # 也用文件名作为 key
            # entity_id 可能是数字，也可能是文件名

    # 另外从 JSON 文件本身构建 entity_id → name 映射
    print("构建剧目类型映射...")

    # 收集所有 JSON 文件
    all_jsons = []
    for folder_name in sorted(os.listdir(BASE_DIR)):
        folder_path = os.path.join(BASE_DIR, folder_name)
        if os.path.isdir(folder_path):
            for fname in os.listdir(folder_path):
                if fname.endswith('.json'):
                    all_jsons.append(os.path.join(folder_path, fname))

    print(f"共找到 {len(all_jsons)} 个 JSON 文件")

    # 处理所有文件
    results = []
    errors = []
    for jpath in tqdm(all_jsons, desc="提取结构特征", unit="本"):
        try:
            features = extract_features(jpath, genre_map)
            results.append(features)
        except Exception as e:
            errors.append({'file': jpath, 'error': str(e)})

    # 保存结果
    output = {
        'total_scripts': len(results),
        'errors': errors,
        'features': results,
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完成! 成功: {len(results)}, 失败: {len(errors)}")
    print(f"输出: {OUTPUT_PATH}")

    # ---- 基础统计 ----
    if results:
        print("\n===== 特征分布概要 =====")
        print(f"场景数: 均值={np.mean([r['scene_count'] for r in results]):.1f}, "
              f"中位数={np.median([r['scene_count'] for r in results]):.0f}")
        print(f"有场景标记: {sum(1 for r in results if r['has_scene_markers'])} "
              f"({sum(1 for r in results if r['has_scene_markers'])/len(results)*100:.1f}%)")
        print(f"唱占比: 均值={np.mean([r['singing_ratio'] for r in results]):.3f}")
        print(f"白占比: 均值={np.mean([r['speaking_ratio'] for r in results]):.3f}")
        print(f"角色数: 均值={np.mean([r['character_count'] for r in results]):.1f}")
        print(f"冲突密度: 均值={np.mean([r['conflict_density'] for r in results]):.4f}")


if __name__ == '__main__':
    main()
