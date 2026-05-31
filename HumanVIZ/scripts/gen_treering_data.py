"""
gen_treering_data.py — 从 1473 个京剧剧本 JSON 中提取 Tree Ring 层次数据
输出：src/data/t1_treering.json

数据结构：
{
  "categories": [
    {
      "name": "生",
      "color": "#b8926a",
      "totalCount": 3274,
      "subTypes": [
        {
          "name": "老生",
          "color": "#d4bea6",
          "count": 1439,
          "topChars": ["诸葛亮", "关羽", "赵云", ...]  // Top 8 代表角色
        },
        ...
      ]
    },
    ...
  ]
}
"""

import json
import os
from collections import defaultdict, Counter
from pathlib import Path

# 行当大类 → 子类型映射
CATEGORY_MAP = {
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

# 反向映射：子类型 → 大类
SUB_TO_CAT = {}
for cat, info in CATEGORY_MAP.items():
    for sub in info["subTypes"]:
        SUB_TO_CAT[sub] = cat

DATA_DIR = Path("/workspace/HumanVIZ/data/dataSet")
OUTPUT_PATH = Path("/workspace/HumanVIZ/src/data/t1_treering.json")


def parse_roles(role_str: str) -> list[tuple[str, str]]:
    """解析 '角色名：行当类型' 格式，返回 [(角色名, 行当), ...]"""
    roles = []
    for line in role_str.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if "：" in line:
            parts = line.split("：", 1)
            char_name = parts[0].strip()
            raw_type = parts[1].strip()
            # 去掉服装描述（逗号后面的内容）
            role_type = raw_type.split("，")[0].strip()
            # 标准化：有些写法是 "老生" 等
            roles.append((char_name, role_type))
    return roles


def classify_role(role_type: str) -> tuple[str, str]:
    """将角色类型归类到大类和标准化子类型"""
    # 精确匹配
    if role_type in SUB_TO_CAT:
        return SUB_TO_CAT[role_type], role_type

    # 模糊匹配
    for sub, cat in SUB_TO_CAT.items():
        if sub in role_type or role_type in sub:
            return cat, sub

    # 默认归到 "生"
    return "生", "生"


def main():
    # 统计结构：大类 → 子类型 → Counter(角色名)
    cat_sub_chars = defaultdict(lambda: defaultdict(Counter))
    cat_sub_counts = defaultdict(lambda: defaultdict(int))

    # 遍历所有 JSON 文件
    json_files = sorted(DATA_DIR.rglob("*.json"))
    print(f"扫描 {len(json_files)} 个 JSON 文件...")

    for jf in json_files:
        try:
            with open(jf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

        role_str = data.get("主要角色", "")
        if not role_str:
            continue

        for char_name, role_type in parse_roles(role_str):
            cat, sub = classify_role(role_type)
            cat_sub_chars[cat][sub][char_name] += 1
            cat_sub_counts[cat][sub] += 1

    # 构建输出数据
    categories = []
    for cat_name in ["生", "旦", "净", "丑"]:
        info = CATEGORY_MAP[cat_name]
        sub_chars = cat_sub_chars[cat_name]
        sub_counts = cat_sub_counts[cat_name]

        total = sum(sub_counts.values())

        sub_types = []
        for sub_name in info["subTypes"]:
            count = sub_counts.get(sub_name, 0)
            if count == 0:
                continue
            # Top 8 代表角色
            top_chars = [name for name, _ in sub_chars.get(sub_name, Counter()).most_common(8)]
            sub_types.append({
                "name": sub_name,
                "color": info["subColors"].get(sub_name, "#999"),
                "count": count,
                "topChars": top_chars,
            })

        # 按 count 降序排列
        sub_types.sort(key=lambda x: x["count"], reverse=True)

        categories.append({
            "name": cat_name,
            "color": info["color"],
            "totalCount": total,
            "subTypes": sub_types,
        })

    output = {"categories": categories}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"输出到 {OUTPUT_PATH}")
    for cat in categories:
        print(f"  {cat['name']}: {cat['totalCount']} 角色人次, {len(cat['subTypes'])} 个子类型")
        for st in cat["subTypes"]:
            print(f"    {st['name']}: {st['count']} (Top: {', '.join(st['topChars'][:5])})")


if __name__ == "__main__":
    main()
