"""
build_task1_data.py — Task 1 数据集统计构建

扫描 data/raw/dataSet/ 下全部京剧剧本 JSON，一次遍历产出两份数据：
  1. src/data/scripts-summary.json — 剧本摘要（剧目名、来源分类、行当大类）
  2. src/data/role-treering.json   — 行当层级统计（大类/子类角色人次与代表角色）

用法:
    python scripts/build_task1_data.py              # 默认产出两份数据
    python scripts/build_task1_data.py --summary-only   # 仅产出 scripts-summary.json
    python scripts/build_task1_data.py --treering-only  # 仅产出 role-treering.json
"""

import argparse
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

# ── 路径配置 ────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "raw" / "dataSet"
OUTPUT_DIR = PROJECT_ROOT / "src" / "data"

SUMMARY_OUT = OUTPUT_DIR / "scripts-summary.json"
TREERING_OUT = OUTPUT_DIR / "role-treering.json"

# ── 来源分类映射 ────────────────────────────────────────────
# source_folder_name → 五大来源类别
SOURCE_CATEGORY_MAP = {
    "《戏考》": "综合剧目集",
    "《京剧汇编》": "综合剧目集",
    "《国剧大成》": "综合剧目集",
    "《京剧丛刊》": "综合剧目集",
    "《传统剧目汇编》": "综合剧目集",
    "《戏典》": "综合剧目集",
    "《京剧流派剧目荟萃》": "综合剧目集",
    "《剧学月刊》": "综合剧目集",
    "《京剧集成》": "综合剧目集",
    "《戏考大全》": "综合剧目集",
    "《中国传统戏曲剧本选集》": "综合剧目集",
    "《传统戏曲剧目资料汇编》": "综合剧目集",
    "《大众戏曲丛书》": "综合剧目集",
    # 名家剧本选
    "李洪春剧本选": "名家剧本选",
    "荀慧生剧本选": "名家剧本选",
    "周信芳剧本选": "名家剧本选",
    "汪笑侬剧本选": "名家剧本选",
    "孟小冬剧本选": "名家剧本选",
    "程砚秋剧本选": "名家剧本选",
    "梅兰芳剧本选": "名家剧本选",
    "唐韵笙剧本选": "名家剧本选",
    "马连良剧本选": "名家剧本选",
    "萧长华剧本选": "名家剧本选",
    "郝寿臣剧本选": "名家剧本选",
    "方荣翔剧本选": "名家剧本选",
    "欧阳予倩剧本选": "名家剧本选",
    # 昆曲剧本选
    "俞振飞剧本选": "昆曲剧本选",
    "侯玉山剧本选": "昆曲剧本选",
    "马祥麟剧本选": "昆曲剧本选",
    "侯少奎剧本选": "昆曲剧本选",
    # 现代剧作家
    "翁偶虹剧本选": "现代剧作家",
    "田汉剧本选": "现代剧作家",
    "老舍剧本选": "现代剧作家",
    "范钧宏剧本选": "现代剧作家",
    "范钧宏、吕瑞明剧本选": "现代剧作家",
    # 其他
    "录音、唱片本": "其他剧本",
    "名家藏本、演出本": "其他剧本",
    "院团改编本、演出本": "其他剧本",
}

# ── 行当分类体系 ────────────────────────────────────────────
# 大类 → {子类型列表, 配色, 子类型配色}
ROLE_CATEGORY_DEF = {
    "生": {
        "subTypes": ["老生", "小生", "武生", "红生", "末", "外", "生"],
        "color": "#b8926a",
        "subColors": {
            "老生": "#d4bea6", "小生": "#dcc8b1", "武生": "#cdb59c",
            "红生": "#c9a88a", "末": "#e0d2be", "外": "#e5dbc8", "生": "#d8c9b0",
        },
    },
    "旦": {
        "subTypes": ["旦", "正旦", "青衣", "花旦", "老旦", "武旦", "贴旦", "彩旦", "花衫"],
        "color": "#96544d",
        "subColors": {
            "旦": "#c09894", "正旦": "#c09894", "青衣": "#b88b86",
            "花旦": "#d3b8b3", "老旦": "#c9a49f", "武旦": "#b88b86",
            "贴旦": "#d9c4bf", "彩旦": "#cfaba6", "花衫": "#d3b8b3",
        },
    },
    "净": {
        "subTypes": ["净", "副净", "武净"],
        "color": "#5e6b76",
        "subColors": {
            "净": "#9ea6ad", "副净": "#8a9299", "武净": "#7d868d",
        },
    },
    "丑": {
        "subTypes": ["丑", "武丑", "丑旦"],
        "color": "#7f968d",
        "subColors": {
            "丑": "#a7b8b3", "武丑": "#8ca39e", "丑旦": "#96aba5",
        },
    },
}

# 子类型 → 大类 反向索引
SUB_TO_CATEGORY = {}
for cat, info in ROLE_CATEGORY_DEF.items():
    for sub in info["subTypes"]:
        SUB_TO_CATEGORY[sub] = cat

ROLE_KEYWORDS = ["生", "旦", "净", "丑"]


# ══════════════════════════════════════════════════════════════
#  解析工具
# ══════════════════════════════════════════════════════════════

def extract_role_type(roles_text: str) -> str:
    """从主要角色文本的首行提取行当大类（生/旦/净/丑）"""
    if not roles_text:
        return "生"
    first_line = roles_text.strip().split("\n")[0]
    parts = first_line.replace("：", ":").split(":")
    if len(parts) >= 2:
        role_desc = parts[1].strip()
        for kw in ROLE_KEYWORDS:
            if kw in role_desc:
                return kw
    return "生"


def parse_role_entries(role_str: str) -> list[tuple[str, str]]:
    """解析 '角色名：行当类型' 格式，返回 [(角色名, 行当类型), ...]"""
    entries = []
    for line in role_str.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if "：" in line:
            parts = line.split("：", 1)
            name = parts[0].strip()
            raw_type = parts[1].strip()
            # 去掉服装描述等附加信息（逗号后的内容）
            role_type = raw_type.split("，")[0].strip()
            entries.append((name, role_type))
    return entries


def classify_role_type(role_type: str) -> tuple[str, str]:
    """将行当类型归类到（大类, 标准化子类型）"""
    if role_type in SUB_TO_CATEGORY:
        return SUB_TO_CATEGORY[role_type], role_type
    # 模糊匹配
    for sub, cat in SUB_TO_CATEGORY.items():
        if sub in role_type or role_type in sub:
            return cat, sub
    # 兜底：归入"生"
    return "生", "生"


# ══════════════════════════════════════════════════════════════
#  主处理
# ══════════════════════════════════════════════════════════════

def scan_all_scripts(json_files: list[Path]) -> tuple[list[dict], dict]:
    """
    遍历全部 JSON 文件，同时构建两份数据的中间结构。

    Returns:
        (scripts_entries, treering_accumulator)
    """
    scripts_entries = []
    treering = defaultdict(lambda: defaultdict(Counter))  # 大类 → 子类 → Counter(角色名)

    for fpath in json_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

        fname = os.path.splitext(os.path.basename(fpath))[0]
        title = data.get("剧本名字", fname)
        source_name = data.get("source_folder_name", "")
        source_category = SOURCE_CATEGORY_MAP.get(source_name, "其他剧本")
        roles_text = data.get("主要角色", "")

        # ── 剧本摘要 ──
        role_type = extract_role_type(roles_text)
        scripts_entries.append({
            "id": fname,
            "title": title,
            "source": source_category,
            "roleType": role_type,
            "roles": roles_text,
        })

        # ── 行当统计 ──
        if roles_text:
            for char_name, role_type_raw in parse_role_entries(roles_text):
                cat, sub = classify_role_type(role_type_raw)
                treering[cat][sub][char_name] += 1

    return scripts_entries, treering


def build_summary_output(entries: list[dict]) -> list[dict]:
    """构建 scripts-summary.json 输出数据"""
    return entries


def build_treering_output(treering: dict) -> dict:
    """构建 role-treering.json 输出数据"""
    categories = []

    for cat_name in ["生", "旦", "净", "丑"]:
        info = ROLE_CATEGORY_DEF[cat_name]
        sub_chars = treering[cat_name]
        sub_counts = {sub: sum(chars.values()) for sub, chars in sub_chars.items()}

        total = sum(sub_counts.values())

        sub_types = []
        for sub_name in info["subTypes"]:
            count = sub_counts.get(sub_name, 0)
            if count == 0:
                continue
            top_chars = [name for name, _ in sub_chars.get(sub_name, Counter()).most_common(8)]
            sub_types.append({
                "name": sub_name,
                "color": info["subColors"].get(sub_name, "#999"),
                "count": count,
                "topChars": top_chars,
            })

        sub_types.sort(key=lambda x: x["count"], reverse=True)

        categories.append({
            "name": cat_name,
            "color": info["color"],
            "totalCount": total,
            "subTypes": sub_types,
        })

    return {"categories": categories}


def write_json(output_path: Path, data):
    """写入 JSON 文件，自动创建父目录"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description="Task 1 数据集统计构建")
    parser.add_argument("--summary-only", action="store_true", help="仅产出 scripts-summary.json")
    parser.add_argument("--treering-only", action="store_true", help="仅产出 role-treering.json")
    args = parser.parse_args()

    do_summary = not args.treering_only
    do_treering = not args.summary_only

    # 收集 JSON 文件列表
    json_files = sorted(DATA_DIR.rglob("*.json"))
    print(f"扫描 {len(json_files)} 个 JSON 文件...")

    # 一次遍历，同时构建两份数据
    scripts_entries, treering_data = scan_all_scripts(json_files)

    # 输出 scripts-summary.json
    if do_summary:
        summary_output = build_summary_output(scripts_entries)
        write_json(SUMMARY_OUT, summary_output)
        print(f"scripts-summary.json → {SUMMARY_OUT} ({len(summary_output)} 条记录)")
        # 统计分布
        src_counter = Counter(e["source"] for e in summary_output)
        role_counter = Counter(e["roleType"] for e in summary_output)
        print(f"  来源分布: {dict(src_counter)}")
        print(f"  行当分布: {dict(role_counter)}")

    # 输出 role-treering.json
    if do_treering:
        treering_output = build_treering_output(treering_data)
        write_json(TREERING_OUT, treering_output)
        print(f"role-treering.json → {TREERING_OUT}")
        for cat in treering_output["categories"]:
            print(f"  {cat['name']}: {cat['totalCount']} 角色人次, {len(cat['subTypes'])} 个子类型")
            for st in cat["subTypes"][:5]:
                print(f"    {st['name']}: {st['count']} (Top: {', '.join(st['topChars'][:5])})")


if __name__ == "__main__":
    main()
