#!/usr/bin/env python3
"""
opera_processor.py — 京剧剧本 → Story Ribbon 格式转换器

将京剧原始 JSON 转换为 Story Ribbon 可视化管线的数据结构（gatsby-new.json 兼容格式）。
包含场景分割、表演标记提取、情感分析、地点提取与结构化数据构建。

用法:
    python opera_processor.py                          # 默认处理代表性样本
    python opera_processor.py --input <file.json>      # 处理单个剧本
    python opera_processor.py --samples                # 仅输出代表性样本
    python opera_processor.py --all                    # 批量处理全部
    python opera_processor.py --list-samples           # 列出代表性样本
"""

import json
import re
import os
import sys
import argparse
import math
from pathlib import Path
from collections import Counter, defaultdict
from typing import Optional

# ── 配置常量 ───────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "dataSet"
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "opera_ribbon_data"
SAMPLE_OUTPUT = Path(__file__).parent.parent / "src" / "data" / "opera-samples.json"

# 表演类型 → 叙事节奏权重
PERFORMANCE_WEIGHTS = {
    "唱": 0.8, "念": 0.5, "白": 0.4, "做": 0.7, "打": 1.0,
    "西皮": 0.7, "二黄": 0.6, "快板": 1.0, "慢板": 0.3,
    "摇板": 0.6, "导板": 0.9, "原板": 0.4, "散板": 0.5,
    "哭": -0.7, "笑": 0.5,
}

# 角色行当 → 分组
ROLE_GROUPS = {
    "老生": "生", "小生": "生", "武生": "生", "红生": "生", "生": "生",
    "青衣": "旦", "花旦": "旦", "武旦": "旦", "老旦": "旦", "旦": "旦", "刀马旦": "旦", "彩旦": "旦",
    "正净": "净", "副净": "净", "武净": "净", "净": "净", "铜锤花脸": "净", "架子花脸": "净",
    "文丑": "丑", "武丑": "丑", "丑": "丑", "外": "生",
}

# 有效的表演类型关键词（用于验证角色名提取）
VALID_PERFORMANCE_KEYS = {
    "唱", "念", "白", "做", "打", "哭", "笑", "上", "下",
    "内白", "内唱", "引子", "叫头", "哭头",
    "西皮摇板", "西皮慢板", "西皮原板", "西皮快板", "西皮二六", "西皮导板",
    "西皮流水", "西皮散板", "西皮快三眼", "西皮回龙",
    "二黄摇板", "二黄慢板", "二黄原板", "二黄快板", "二黄导板",
    "二黄散板", "二黄快三眼", "二黄碰板", "二黄回龙",
    "反二黄慢板", "反二黄原板", "反二黄摇板",
    "四平调", "南梆子", "高拨子", "吹腔", "昆腔",
}

# 情感词典（简易中文情感分析）
POSITIVE_WORDS = {"忠", "义", "仁", "孝", "爱", "喜", "欢", "乐", "笑", "贤", "良", "善", "美", "好",
                  "胜", "成", "功", "荣", "贵", "福", "吉", "祥", "兴", "隆", "盛", "安", "康", "宁"}
NEGATIVE_WORDS = {"悲", "哀", "怨", "恨", "怒", "杀", "死", "亡", "哭", "苦", "愁", "忧", "伤", "痛",
                  "败", "失", "祸", "凶", "惨", "凄", "凉", "寒", "孤", "独", "离", "别", "弃", "叛"}

# 代表性剧本选取
REPRESENTATIVE_SAMPLES = [
    "01001001_空城计.json",
    "01001003_三娘教子.json",
    "01005008_玉堂春.json",
    "01001002_洪羊洞.json",
    "01006007_定军山.json",
    "01002016_打渔杀家.json",
    "01005001_武家坡.json",
    "01002014_宇宙锋.json",
    "01003002_群英会.json",
    "01005006_六月雪.json",
    # 叙事分析代表性剧本选择报告中的 5 部剧本 (新增4部)
    "01012007_贵妃醉酒.json",
    "70002105_赵氏孤儿.json",
    "11001001_连环套.json",
    "03031006_打面缸.json",
]


# ═══════════════════════════════════════════════════════════════
# 角色解析
# ═══════════════════════════════════════════════════════════════

def parse_role_info(role_text: str) -> list[dict]:
    """解析"主要角色"字段 → [{name, role, group}]"""
    roles = []
    for line in role_text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if "：" in line or ":" in line:
            parts = re.split(r"[：:]", line, maxsplit=1)
            name = parts[0].strip()
            role = parts[1].strip() if len(parts) > 1 else ""
        else:
            match = re.match(r"(\S+)\s*[：:]\s*(\S+)", line)
            if match:
                name, role = match.group(1), match.group(2)
            else:
                continue

        group = ROLE_GROUPS.get(role, "其他")
        roles.append({"name": name, "role": role, "group": group})
    return roles


# ═══════════════════════════════════════════════════════════════
# 场景分割
# ═══════════════════════════════════════════════════════════════

def split_scenes(dialogue: str) -> list[dict]:
    """将正文对话按【第X场】标记分割为场景列表"""
    scene_pattern = r"【第?([^】]*?)[场折幕](?:[：:]([^】]*))?】"
    scene_matches = list(re.finditer(scene_pattern, dialogue))

    if scene_matches:
        scenes = []
        for idx, match in enumerate(scene_matches):
            scene_num = match.group(1).strip() if match.group(1) else str(idx + 1)
            scene_title = match.group(2).strip() if match.group(2) else f"第{scene_num}场"
            start = match.end()
            end = scene_matches[idx + 1].start() if idx + 1 < len(scene_matches) else len(dialogue)
            text = dialogue[start:end].strip()
            scenes.append({
                "number": idx + 1,
                "name": scene_title,
                "text": text,
                "raw_marker": match.group(0),
            })
        return scenes

    # 无显式标记：按角色退场点切分
    return _split_by_entrance_exit(dialogue)


def _split_by_entrance_exit(dialogue: str) -> list[dict]:
    """按角色退场标记切分无场景标记的剧本"""
    lines = dialogue.strip().split("\n")
    split_indices = [-1]
    for i, line in enumerate(lines):
        stripped = line.strip()
        if "同下" in stripped or stripped.endswith("下。）"):
            split_indices.append(i)

    if len(split_indices) <= 2:
        # 按空行分割
        parts = re.split(r"\n\s*\n", dialogue)
        scenes = []
        for idx, part in enumerate(parts):
            part = part.strip()
            if not part or len(part) < 30:
                continue
            scenes.append({
                "number": idx + 1,
                "name": f"段落{idx + 1}",
                "text": part,
                "raw_marker": "",
            })
        return scenes

    scenes = []
    for idx in range(len(split_indices)):
        start = split_indices[idx] + 1
        end = split_indices[idx + 1] if idx + 1 < len(split_indices) else len(lines)
        text = "\n".join(lines[start:end]).strip()
        if not text or len(text) < 30:
            continue
        scenes.append({
            "number": len(scenes) + 1,
            "name": f"第{len(scenes) + 1}场",
            "text": text,
            "raw_marker": "",
        })
    return scenes


# ═══════════════════════════════════════════════════════════════
# 角色提取
# ═══════════════════════════════════════════════════════════════

def extract_characters_from_text(text: str, known_roles: list[dict] = None) -> list[str]:
    """从场景文本中提取出场角色名（严格格式匹配 + 已知角色交叉验证）"""
    known_names = set()
    if known_roles:
        known_names = {r["name"] for r in known_roles}

    chars = []
    for match in re.finditer(r"^([\u4e00-\u9fff]{1,4})\s*（([^）]*)）", text, re.MULTILINE):
        name = match.group(1)
        perf_type = match.group(2).strip()
        if not re.match(r"^[\u4e00-\u9fff]+$", name):
            continue
        is_valid = any(kw in perf_type for kw in VALID_PERFORMANCE_KEYS)
        if not is_valid:
            continue
        if name not in chars:
            chars.append(name)

    # 补充已知角色
    if known_names:
        for name in known_names:
            if name not in chars and name in text:
                chars.append(name)

    return chars


# ═══════════════════════════════════════════════════════════════
# 表演标记提取
# ═══════════════════════════════════════════════════════════════

def extract_performance_markers(text: str) -> dict:
    """从文本中提取表演类型标记"""
    markers = re.findall(r"（([^）]*)）", text)
    perf_counts = Counter()
    for m in markers:
        for key in PERFORMANCE_WEIGHTS:
            if key in m:
                perf_counts[key] += 1
    return dict(perf_counts)


# ═══════════════════════════════════════════════════════════════
# 情感与重要性计算
# ═══════════════════════════════════════════════════════════════

def compute_scene_sentiment(text: str, characters: list[str]) -> float:
    """简易情感分析"""
    pos_count = sum(1 for w in POSITIVE_WORDS if w in text)
    neg_count = sum(1 for w in NEGATIVE_WORDS if w in text)
    total = pos_count + neg_count
    text_score = (pos_count - neg_count) / max(total, 1)

    markers = extract_performance_markers(text)
    perf_score = 0.0
    perf_total = sum(markers.values())
    if perf_total > 0:
        perf_score = sum(PERFORMANCE_WEIGHTS.get(k, 0) * v for k, v in markers.items()) / perf_total

    return round(0.6 * text_score + 0.4 * perf_score, 3)


def compute_scene_importance(characters: list[str], all_roles: list[dict],
                              line_count: int, total_lines: int) -> float:
    """场景重要性"""
    main_chars = [r["name"] for r in all_roles[:3]]
    main_present = sum(1 for c in characters if c in main_chars)
    char_factor = min(len(characters) / max(len(all_roles), 1), 1.0)
    line_factor = min(line_count / max(total_lines / max(len(all_roles), 1), 1), 1.0)
    main_factor = main_present / min(len(main_chars), max(len(characters), 1))
    return round(0.3 * char_factor + 0.3 * line_factor + 0.4 * main_factor, 3)


def compute_character_sentiment_in_scene(text: str, char_name: str) -> float:
    """角色在场景中的情感倾向"""
    lines = re.findall(rf"{re.escape(char_name)}\s*（[^）]*）\s*(.+?)(?=\n\S+\s*（|\Z)", text, re.DOTALL)
    if not lines:
        lines = re.findall(rf"{re.escape(char_name)}[^\n]*\n?", text)
    combined = " ".join(lines)
    pos = sum(1 for w in POSITIVE_WORDS if w in combined)
    neg = sum(1 for w in NEGATIVE_WORDS if w in combined)
    total = pos + neg
    return round((pos - neg) / total, 3) if total else 0.0


def extract_character_quote(text: str, char_name: str) -> str:
    """提取角色的一句代表性台词"""
    lines = re.findall(rf"{re.escape(char_name)}\s*（[^）]*）\s*(.+?)(?=\n)", text)
    if lines:
        quote = lines[0].strip()
        return quote[:57] + "..." if len(quote) > 60 else quote
    return ""


# ═══════════════════════════════════════════════════════════════
# 地点提取
# ═══════════════════════════════════════════════════════════════

def extract_locations(scenes: list[dict]) -> list[str]:
    """从场景文本中推断地点"""
    locations = set()
    location_patterns = [
        r"(?:在|到|来至|前往|上)([^，。；,!！\n]{2,6}(?:城|殿|堂|楼|府|营|亭|阁|台|庙|寺|街|巷|门|关|寨))",
        r"([^，。；,!！\n]{2,4}(?:城|殿|堂|楼|府|营|亭|阁|台|庙|寺))[，。]",
    ]
    for scene in scenes:
        text = scene["text"]
        first_line = text.split("\n")[0] if text else ""
        loc_match = re.search(r"[在至到]([^，。\n]{2,6})", first_line)
        if loc_match:
            locations.add(loc_match.group(1))
            continue
        for pat in location_patterns:
            for m in re.finditer(pat, text[:200]):
                locations.add(m.group(1))

    if not locations:
        locations.add("舞台")
    return list(locations)


# ═══════════════════════════════════════════════════════════════
# 结构化数据构建
# ═══════════════════════════════════════════════════════════════

def build_character_data(all_roles: list[dict], all_scenes: list[dict]) -> list[dict]:
    """构建角色元数据"""
    all_names = set()
    for scene in all_scenes:
        all_names.update(scene.get("_characters", []))

    role_map = {r["name"]: r for r in all_roles}
    characters = []
    for name in all_names:
        role_info = role_map.get(name, {})
        group = role_info.get("group", "其他")
        characters.append({
            "character": name,
            "short": name[:2] if len(name) > 2 else name,
            "key": name,
            "quote": f"{name} — {role_info.get('role', '未知行当')}",
            "group": group,
            "color": "",
            "explanation": [f"行当: {role_info.get('role', '未知')}", f"所属: {group}组"],
        })

    priority = {r["name"]: i for i, r in enumerate(all_roles)}
    characters.sort(key=lambda c: priority.get(c["character"], 999))
    return characters


def _build_character_links(scenes: list[dict]) -> list[dict]:
    """从场景角色共现构建角色关系链接"""
    links = Counter()
    for scene in scenes:
        chars = scene.get("_characters", [])
        for i in range(len(chars)):
            for j in range(i + 1, len(chars)):
                pair = tuple(sorted([chars[i], chars[j]]))
                links[pair] += 1
    return [{"source": s, "target": t, "value": v} for (s, t), v in links.items()]


def build_chapter_data(all_scenes: list[dict], total_lines: int) -> list[dict]:
    """将场景按叙事阶段聚合为章节"""
    n = len(all_scenes)
    if n <= 4:
        chapter_count = max(1, n)
    elif n <= 8:
        chapter_count = max(2, n // 2)
    else:
        chapter_count = min(9, max(3, n // 2))

    scenes_per_chapter = math.ceil(n / chapter_count)
    chapters = []
    for ci in range(chapter_count):
        start = ci * scenes_per_chapter
        end = min(start + scenes_per_chapter, n)
        chap_scenes = all_scenes[start:end]

        chap_lines = sum(s["_line_count"] for s in chap_scenes)
        chars_in_chap = set()
        locs_in_chap = Counter()
        for s in chap_scenes:
            chars_in_chap.update(s.get("_characters", []))
            locs_in_chap[s.get("_location", "舞台")] += 1

        sentiments = [s["_sentiment"] for s in chap_scenes]
        conflict = round(max(sentiments) - min(sentiments), 3) if sentiments else 0.3
        chapters.append({
            "chapter": f"第{ci + 1}章" if chapter_count > 1 else "全剧",
            "numScenes": len(chap_scenes),
            "numLines": chap_lines,
            "summary": "；".join(s["name"] for s in chap_scenes),
            "conflict": conflict,
            "importance": round(min(chap_lines / max(total_lines / chapter_count, 1), 1.0), 3),
            "locations": dict(locs_in_chap),
            "characters": dict(Counter(chars_in_chap)),
            "links": _build_character_links(chap_scenes),
        })
    return chapters


def build_scene_data(all_scenes: list[dict], all_roles: list[dict],
                     char_data: list[dict], locations: list[str],
                     chapter_list: list[dict]) -> list[dict]:
    """构建场景数据数组（gatsby-new scenes 格式）"""
    total_lines = sum(s["_line_count"] for s in all_scenes)

    # 场景→章节映射
    scene_to_chapter = {}
    acc = 0
    for chap in chapter_list:
        for i in range(chap["numScenes"]):
            if acc + i < len(all_scenes):
                scene_to_chapter[acc + i] = chap["chapter"]
        acc += chap["numScenes"]

    scenes_out = []
    for scene in all_scenes:
        chars = scene.get("_characters", [])
        n_chars = len(chars)
        chapter_name = scene_to_chapter.get(scene["number"] - 1, "全剧")

        characters_detail = []
        for ci, name in enumerate(chars):
            role_info = next((r for r in all_roles if r["name"] == name), {})
            sentiment = compute_character_sentiment_in_scene(scene["text"], name)
            quote = extract_character_quote(scene["text"], name)
            characters_detail.append({
                "name": name,
                "importance": (n_chars - ci) / max(n_chars, 1),
                "importance_rank": ci + 1,
                "emotion": "positive" if sentiment > 0.3 else "negative" if sentiment < -0.3 else "neutral",
                "quote": quote,
                "rating": sentiment,
                "role": role_info.get("role", ""),
            })

        scenes_out.append({
            "number": scene["number"],
            "name": scene["name"],
            "location": scene.get("_location", "舞台"),
            "characters": characters_detail,
            "summary": f"{scene['name']}：{len(chars)}位角色，{scene['_line_count']}行",
            "firstLine": 1,
            "lastLine": scene["_line_count"],
            "numLines": scene["_line_count"],
            "chapter": chapter_name,
            "ratings": {
                "importance": scene["_importance"],
                "conflict": scene.get("_conflict", 0.3),
                "sentiment": scene["_sentiment"],
            },
        })

    return scenes_out


def build_location_data(locations: list[str]) -> list[dict]:
    return [{"name": loc, "key": loc, "quote": f"场景发生在{loc}"} for loc in locations]


# ═══════════════════════════════════════════════════════════════
# 主处理函数
# ═══════════════════════════════════════════════════════════════

def process_single_opera(filepath: Path) -> Optional[dict]:
    """处理单个京剧 JSON 文件 → story ribbon 兼容格式"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"  [跳过] {filepath.name}: JSON解析失败 ({e})")
        return None

    dialogue = raw.get("正文对话", "")
    if not dialogue or len(dialogue) < 50:
        print(f"  [跳过] {filepath.name}: 正文对话不足")
        return None

    role_text = raw.get("主要角色", "")
    all_roles = parse_role_info(role_text)

    scenes = split_scenes(dialogue)
    if not scenes:
        print(f"  [跳过] {filepath.name}: 无法分割场景")
        return None

    # 解析每个场景
    all_char_names = set()
    total_lines = 0
    for scene in scenes:
        text = scene["text"]
        chars = extract_characters_from_text(text, all_roles)
        scene["_characters"] = chars
        all_char_names.update(chars)
        scene["_line_count"] = len(text.split("\n"))
        total_lines += scene["_line_count"]
        scene["_sentiment"] = compute_scene_sentiment(text, chars)

    locations = extract_locations(scenes)

    # 为每个场景分配地点/重要性/冲突
    for scene in scenes:
        assigned = False
        for loc in locations:
            if loc in scene["text"][:300]:
                scene["_location"] = loc
                assigned = True
                break
        if not assigned:
            scene["_location"] = locations[0] if locations else "舞台"

        scene["_importance"] = compute_scene_importance(
            scene.get("_characters", []), all_roles,
            scene["_line_count"], max(total_lines, 1)
        )
        conflict_words = {"但", "却", "可", "怎么", "如何", "为何", "杀", "战", "争"}
        conflict_count = sum(1 for w in conflict_words if w in scene["text"])
        scene["_conflict"] = round(min(conflict_count / max(len(scene["text"].split()), 1) * 20, 1.0), 3)

    # 构建结构化数据
    char_data = build_character_data(all_roles, scenes)
    chapter_data = build_chapter_data(scenes, total_lines)
    scene_data = build_scene_data(scenes, all_roles, char_data, locations, chapter_data)
    location_data = build_location_data(locations)

    # 时代语境
    source_folder = raw.get("source_folder_name", "")
    era_map = {
        "《戏考》": "民国", "《戏考大全》": "民国", "《国剧大成》": "民国",
        "《京剧汇编》": "新中国", "《京剧丛刊》": "新中国",
        "《传统剧目汇编》": "新中国", "《京剧集成》": "新中国",
    }
    era = "近代"
    for key, val in era_map.items():
        if key in source_folder:
            era = val
            break

    title = raw.get("剧本名字", filepath.stem)
    title = re.sub(r"[（(].*?[）)]", "", title).strip()

    return {
        "title": title,
        "type": "京剧剧本",
        "author": era,
        "year": 1900,
        "url": "",
        "image": "",
        "num_chapters": len(chapter_data),
        "num_scenes": len(scene_data),
        "num_characters": len(char_data),
        "num_locations": len(location_data),
        "source_file": filepath.name,
        "source_folder": raw.get("source_folder", ""),
        "plot_summary": raw.get("情节", ""),
        "performance_notes": raw.get("注释", ""),
        "chapters": chapter_data,
        "scenes": scene_data,
        "characters": char_data,
        "locations": location_data,
    }


# ═══════════════════════════════════════════════════════════════
# 批量处理
# ═══════════════════════════════════════════════════════════════

def process_all(input_dir: Path = DATA_DIR, output_dir: Path = OUTPUT_DIR,
                limit: int = 0) -> list[Path]:
    """批量处理所有京剧 JSON 文件"""
    output_dir.mkdir(parents=True, exist_ok=True)
    json_files = sorted(input_dir.rglob("*.json"))
    print(f"找到 {len(json_files)} 个剧本文件")

    if limit:
        json_files = json_files[:limit]

    success = 0
    output_files = []
    for fp in json_files:
        print(f"处理: {fp.relative_to(input_dir)}")
        result = process_single_opera(fp)
        if result is None:
            continue
        out_path = output_dir / f"{fp.stem}_ribbon.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        output_files.append(out_path)
        success += 1

    print(f"\n完成: {success}/{len(json_files)} 个剧本成功转换")
    return output_files


def process_samples(input_dir: Path = DATA_DIR,
                    samples: list[str] = REPRESENTATIVE_SAMPLES,
                    output_path: Path = SAMPLE_OUTPUT) -> dict:
    """处理代表性样本并汇总输出"""
    results = {}
    all_ribbon_data = {}

    for filename in samples:
        found = None
        for fp in input_dir.rglob(filename):
            found = fp
            break
        if not found:
            print(f"  [未找到] {filename}")
            continue

        print(f"  处理: {filename}")
        result = process_single_opera(found)
        if result:
            results[filename] = {
                "title": result["title"],
                "scenes": result["num_scenes"],
                "characters": result["num_characters"],
                "chapters": result["num_chapters"],
                "source": result["source_folder"],
            }
            all_ribbon_data[filename] = result

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_ribbon_data, f, ensure_ascii=False, indent=2)

    print(f"\n代表性样本已保存到: {output_path}")
    print(f"共 {len(results)} 本:")
    for fn, info in results.items():
        print(f"  {info['title']} — {info['scenes']}场, {info['characters']}角色")

    return results


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="京剧剧本 → Story Ribbon 格式转换器")
    parser.add_argument("--input", "-i", type=str, help="单个输入文件路径")
    parser.add_argument("--output", "-o", type=str, help="输出文件路径")
    parser.add_argument("--samples", action="store_true", help="仅处理代表性样本")
    parser.add_argument("--list-samples", action="store_true", help="列出代表性样本")
    parser.add_argument("--all", action="store_true", help="批量处理全部剧本")
    parser.add_argument("--limit", "-n", type=int, default=0, help="限制处理数量")

    args = parser.parse_args()

    if args.list_samples:
        print("代表性剧本样本:")
        for fn in REPRESENTATIVE_SAMPLES:
            name = fn.replace(".json", "").split("_", 1)[-1]
            print(f"  {fn} — {name}")
        return

    if args.input:
        fp = Path(args.input)
        if not fp.exists():
            print(f"文件不存在: {fp}")
            sys.exit(1)
        result = process_single_opera(fp)
        if result is None:
            print("处理失败")
            sys.exit(1)
        out_path = args.output or f"{fp.stem}_ribbon.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"输出: {out_path}")
        print(f"  标题: {result['title']}")
        print(f"  场景: {result['num_scenes']} | 角色: {result['num_characters']} | 地点: {result['num_locations']}")
    elif args.all:
        process_all(limit=args.limit)
    else:
        print("默认处理模式：代表性样本\n")
        process_samples()
        print("\n使用 --all 批量处理全部剧本")


if __name__ == "__main__":
    main()
