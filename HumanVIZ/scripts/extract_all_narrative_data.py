#!/usr/bin/env python3
"""
extract_all_narrative_data.py — 从全部 1473 部原始 JSON 提取叙事分析所需数据

为每部剧本提取:
  - 场景边界 (场次划分)
  - 每场出场角色
  - 每场行数
  - 冲突/情感评分 (基于正则标记)
  - 角色行当分组

输出: all-plays-narrative.json (供前端 Task4Layout 直接加载)

设计原则:
  - 纯正则提取，不依赖 LLM
  - 数据紧凑，适合前端加载 (~2-3 MB)
  - 输出格式兼容 RawStoryInput 接口
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Any, Optional, Set, Tuple

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "raw" / "dataSet"
OUTPUT_FILE = PROJECT_ROOT / "src" / "data" / "all-plays-narrative.json"
FINGERPRINTS_FILE = PROJECT_ROOT / "data" / "processed" / "structural_fingerprints.json"
GENRE_FILE = PROJECT_ROOT / "data" / "processed" / "db_exports" / "剧目类型.json"

# ── 正则 ──────────────────────────────────────────────────────────

# 场景边界: 【第X场】, 【第X折】, 【第X幕】
SCENE_BOUNDARY_RE = re.compile(r'【第[一二三四五六七八九十百千\d]+[场折幕出]】')
SCENE_HEADER_RE = re.compile(r'【第[一二三四五六七八九十百千\d]+[场折幕出]】[^\n]*')

# 角色对话行: "角色名 （表演标记）对白..."
CHAR_LINE_RE = re.compile(r'^([一-龥]{2,4})\s+[（(]', re.MULTILINE)
CHAR_LINE_FULL_RE = re.compile(r'^([一-龥]{2,4})\s+[（(]([^）)]*)[）)]', re.MULTILINE)

# 表演标记: （唱）/（白）/（念）等
PERF_MARKER_RE = re.compile(r'[（(]([^）)]*)[）)]')

# 冲突标记
CONFLICT_KEYWORDS = ['杀', '斩', '擒', '灭', '攻', '战', '仇', '恨', '死', '打',
                     '急急风', '四击头', '乱锤', '起鼓', '斩首', '自刎', '伏法',
                     '包围', '陷阱', '暗算', '毒计', '报仇', '血', '剑', '刀']

# 情感标记 (正面/负面)
POSITIVE_EMOTION_KEYWORDS = ['笑', '喜', '乐', '欢', '庆', '赏', '封', '赐', '团圆',
                              '拜', '贺', '胜利', '得胜', '凯旋', '成亲', '完婚']
NEGATIVE_EMOTION_KEYWORDS = ['哭', '悲', '哀', '愁', '苦', '叹', '泪', '泣', '恨',
                              '惨', '冤', '屈', '死', '别', '离', '怒']

# 角色行当关键词
ROLE_TYPE_PATTERNS = {
    '生': ['老生', '小生', '武生', '红生', '末', '外'],
    '旦': ['青衣', '花旦', '武旦', '老旦', '正旦', '贴旦', '刀马旦', '彩旦', '闺门旦'],
    '净': ['净', '铜锤', '架子', '花脸', '黑头'],
    '丑': ['丑', '文丑', '武丑', '小丑'],
}

# 行当简称到分组的映射
ROLE_TO_GROUP: Dict[str, str] = {}
for group, roles in ROLE_TYPE_PATTERNS.items():
    for role in roles:
        ROLE_TO_GROUP[role] = group

# ── 辅助函数 ──────────────────────────────────────────────────────

def chinese_to_int(s: str) -> int:
    """中文数字转整数"""
    cn_map = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
              '百':100,'千':1000}
    # 阿拉伯数字
    if s.isdigit():
        return int(s)
    # 简单中文数字 (如 "二十三" → 23)
    result = 0
    unit = 1
    for ch in reversed(s):
        if ch in cn_map:
            val = cn_map[ch]
            if val >= 10:
                unit = val if result == 0 else unit * val
            else:
                result += val * unit
    if result == 0 and s in cn_map:
        return cn_map[s]
    return result if result > 0 else 1


def parse_scenes(text: str) -> List[Dict[str, Any]]:
    """
    从剧本正文中解析场景结构。

    Returns:
        [{number, name, characters: [{name, importance?}], numLines,
          ratings: {conflict, sentiment}, text_sample}]
    """
    if not text:
        return [{"number": 1, "name": "全剧", "characters": [],
                 "numLines": 0, "ratings": {"conflict": 0.3, "sentiment": 0.0}}]

    # 分割场景
    boundaries = list(SCENE_BOUNDARY_RE.finditer(text))

    if not boundaries:
        # 无场景标记 → 整剧作为单一场景
        chars = extract_characters_from_text(text)
        ratings = compute_text_ratings(text)
        return [{
            "number": 1, "name": "全剧",
            "characters": [{"name": c} for c in sorted(chars)],
            "numLines": len(text.split('\n')),
            "ratings": ratings,
        }]

    scenes = []
    for i, m in enumerate(boundaries):
        header = m.group()
        start = m.end()
        end = boundaries[i+1].start() if i + 1 < len(boundaries) else len(text)
        body = text[start:end]

        # 提取角色
        chars = extract_characters_from_text(body)

        # 计算评分
        ratings = compute_text_ratings(body)

        # 行数
        num_lines = len(body.split('\n'))

        scenes.append({
            "number": i + 1,
            "name": header.strip('【】'),
            "characters": [{"name": c} for c in sorted(chars)],
            "numLines": num_lines,
            "ratings": ratings,
        })

    return scenes


def extract_characters_from_text(text: str) -> Set[str]:
    """从文本中提取角色名"""
    chars = set()
    for m in CHAR_LINE_RE.finditer(text):
        name = m.group(1)
        # 过滤常见的非角色词
        if name not in {'正是', '话犹', '正是如此', '来此已', '不知何', '不知你'}:
            chars.add(name)
    return chars


def compute_text_ratings(text: str) -> Dict[str, float]:
    """基于关键词密度计算冲突和情感评分"""
    if not text:
        return {"conflict": 0.3, "sentiment": 0.0}

    # 冲突密度
    conflict_count = sum(text.count(kw) for kw in CONFLICT_KEYWORDS)
    # 情感密度
    pos_count = sum(text.count(kw) for kw in POSITIVE_EMOTION_KEYWORDS)
    neg_count = sum(text.count(kw) for kw in NEGATIVE_EMOTION_KEYWORDS)

    # 归一化 (按文本长度)
    text_len = max(len(text), 1)
    conflict_score = min(conflict_count / text_len * 100, 1.0)  # 缩放到 0-1
    conflict_score = max(0.1, conflict_score)  # 保底

    sentiment_raw = (pos_count - neg_count) / text_len * 50
    sentiment_score = max(-1.0, min(1.0, sentiment_raw))

    return {
        "conflict": round(conflict_score, 3),
        "sentiment": round(sentiment_score, 3),
    }


def extract_character_roles(roles_text: str) -> List[Dict[str, str]]:
    """
    从"主要角色"字段提取角色行当信息。
    格式: 角色名：行当\n角色名：行当
    """
    if not roles_text:
        return []

    characters = []
    for line in roles_text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        # 格式: "诸葛亮：老生" 或 "诸葛亮（老生）"
        if '：' in line:
            parts = line.split('：', 1)
            name = parts[0].strip()
            role = parts[1].strip()
        elif '（' in line:
            name = line.split('（')[0].strip()
            role_match = re.search(r'（([^）]*)）', line)
            role = role_match.group(1) if role_match else ''
        else:
            continue

        if not name or len(name) > 4:
            continue

        # 推断分组
        group = '其他'
        for g, patterns in ROLE_TYPE_PATTERNS.items():
            for pat in patterns:
                if pat in role:
                    group = g
                    break
            if group != '其他':
                break

        # 如果 role 本身就是生/旦/净/丑
        if group == '其他' and role in {'生', '旦', '净', '丑'}:
            group = role

        characters.append({
            "character": name,
            "short": name[:2],
            "group": group,
            "role_type": role,
        })

    return characters


def get_genre_map() -> Dict[str, str]:
    """从分类数据中加载剧本ID→类型映射"""
    genre_map = {}
    if GENRE_FILE.exists():
        with open(GENRE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # 尝试多种格式
        if isinstance(data, list):
            for entry in data:
                eid = entry.get('entity_id') or entry.get('id') or entry.get('file_name', '')
                genre = entry.get('genre') or entry.get('类型') or entry.get('剧目类型', '')
                if eid and genre:
                    genre_map[eid] = genre
        elif isinstance(data, dict):
            for key, entry in data.items():
                if isinstance(entry, dict):
                    eid = entry.get('entity_id') or entry.get('id') or key
                    genre = entry.get('genre') or entry.get('类型') or entry.get('剧目类型', '')
                    if eid and genre:
                        genre_map[eid] = genre
    return genre_map


def get_fingerprint_map() -> Dict[str, Dict]:
    """从结构指纹中加载已有指标"""
    fp_map = {}
    if FINGERPRINTS_FILE.exists():
        with open(FINGERPRINTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        features = data.get('features', [])
        if isinstance(features, list):
            for feat in features:
                eid = feat.get('entity_id', '') or feat.get('file_name', '')
                if eid:
                    # 规范化 key: 去掉 .pdf 后缀
                    key = eid.replace('.pdf', '')
                    fp_map[key] = feat
    return fp_map


# ═══════════════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("  从 1473 部原始 JSON 批量提取叙事分析数据")
    print("=" * 70)

    # 加载已有指纹和分类
    genre_map = get_genre_map()
    fp_map = get_fingerprint_map()
    print(f"  已加载 {len(genre_map)} 条剧目类型, {len(fp_map)} 条结构指纹")

    # 收集所有 JSON 文件
    all_files = []
    for root, dirs, fnames in os.walk(DATA_DIR):
        for fn in fnames:
            if fn.endswith('.json'):
                all_files.append(os.path.join(root, fn))

    print(f"  找到 {len(all_files)} 个剧本 JSON 文件")

    output: Dict[str, Dict] = {}
    stats = Counter()
    errors = []

    for i, filepath in enumerate(sorted(all_files)):
        rel_path = os.path.relpath(filepath, DATA_DIR)

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                raw = json.load(f)
        except Exception as e:
            errors.append({"file": rel_path, "error": str(e)})
            continue

        # 提取基础信息
        title_text = raw.get('剧本名字', '')
        # 清理标题: "空城计（一名：抚琴退兵）" → "空城计"
        title = re.sub(r'[（(].*[）)]', '', title_text).strip()
        if not title:
            title = os.path.splitext(os.path.basename(filepath))[0]

        # 生成唯一 key
        file_key = os.path.splitext(os.path.basename(filepath))[0]

        # 提取来源信息
        source_folder = raw.get('source_folder', '')
        source_name = raw.get('source_folder_name', '')

        # 解析场景
        text = raw.get('正文对话', '')
        scenes = parse_scenes(text)
        stats['total_scenes'] += len(scenes)

        # 提取角色
        role_chars = extract_character_roles(raw.get('主要角色', ''))
        all_char_names = set()
        for s in scenes:
            for c in s['characters']:
                all_char_names.add(c['name'])

        # 合并角色信息
        role_map = {c['character']: c for c in role_chars}
        characters = []
        for name in sorted(all_char_names):
            if name in role_map:
                characters.append(role_map[name])
            else:
                # 尝试从名字推断行当分组 (简单启发式)
                group = '其他'
                characters.append({
                    "character": name,
                    "short": name[:2],
                    "group": group,
                    "role_type": "",
                })

        # 如果没有从角色字段提取到角色，使用场景中出现的
        if not characters:
            for name in sorted(all_char_names):
                characters.append({
                    "character": name,
                    "short": name[:2],
                    "group": '其他',
                    "role_type": "",
                })

        # 指纹和类型信息
        fp = fp_map.get(file_key, {})
        genre = genre_map.get(raw.get('file_name', ''), '') or fp.get('genre', '')

        # 构建输出
        play_data = {
            "title": title,
            "fullTitle": title_text,
            "fileKey": file_key,
            "sourceFolder": source_folder,
            "sourceName": source_name,
            "genre": genre,
            "scenes": scenes,
            "characters": characters,
            # 摘要信息
            "summary": raw.get('情节', '')[:200] if raw.get('情节') else '',
            "sceneCount": len(scenes),
            "charCount": len(characters),
            "totalLines": sum(s['numLines'] for s in scenes),
        }

        # 添加指纹中的分类信息
        if fp:
            play_data["narrType"] = fp.get('narr_type', '') or fp.get('narrative_type', '')
            play_data["singingRatio"] = fp.get('singing_ratio', 0)
            play_data["emotionDensity"] = fp.get('emotion_density', 0)
            play_data["conflictDensity"] = fp.get('conflict_density', 0)

        output[file_key] = play_data

        # 进度
        if (i + 1) % 200 == 0:
            print(f"  进度: {i+1}/{len(all_files)}")

    # ── 汇总 ──
    print(f"\n  处理完成: {len(output)} 部剧本")
    print(f"  总场景数: {stats['total_scenes']}")
    print(f"  错误: {len(errors)}")

    if errors:
        print(f"  错误详情 (前5):")
        for err in errors[:5]:
            print(f"    {err['file']}: {err['error']}")

    # ── 写入 ──
    # 添加元信息
    output_with_meta = {
        "_meta": {
            "totalPlays": len(output),
            "totalScenes": stats['total_scenes'],
            "generatedFrom": "extract_all_narrative_data.py",
            "note": "场景级叙事数据 — 基于正则表达式从原始剧本中提取，不含 LLM 增强的情感标注",
        }
    }
    output_with_meta.update(output)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_with_meta, f, ensure_ascii=False, indent=2)

    file_size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"\n  输出: {OUTPUT_FILE}")
    print(f"  文件大小: {file_size_mb:.1f} MB")

    # 统计信息
    avg_scenes = stats['total_scenes'] / max(len(output), 1)
    print(f"  平均场次: {avg_scenes:.1f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
