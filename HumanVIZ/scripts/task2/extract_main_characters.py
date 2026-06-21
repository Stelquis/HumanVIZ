#!/usr/bin/env python3
"""
从原始剧本 JSON 中提取「主要角色」字段，生成前端可用的 JSON 数据。

匹配策略:
  原始文件按 (source_folder, file_name) 排序 == 单剧本网络数据按 entity_id 排序
  经验证 1473/1473 位置完全对应，由此实现精确映射，避免同名剧本冲突。

输入:
  - data/raw/dataSet/*/*.json  (1473 本原始剧本，含「主要角色」字段)
  - data/processed/task2/db_exports/单剧本网络.json.gz  (entity_id → 剧目类型映射)

输出:
  - src/data/task2-main-characters.json

用法:
    cd HumanVIZ
    python scripts/task2/extract_main_characters.py
"""

import gzip
import json
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RAW_DIR = ROOT / "data" / "raw" / "dataSet"
NETWORK_FILE = ROOT / "data" / "processed" / "task2" / "db_exports" / "单剧本网络.json.gz"
OUTPUT = ROOT / "src" / "data" / "task2-main-characters.json"


def collect_raw_files(raw_dir: Path) -> list[dict]:
    """收集所有原始 JSON 文件，按 (source_folder, file_name) 排序"""
    files = []
    for root, dirs, filenames in os.walk(raw_dir):
        for fname in filenames:
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, encoding='utf-8') as f:
                    raw = json.load(f)
            except Exception as e:
                print(f"  ⚠ 读取失败: {fpath}: {e}")
                continue

            files.append({
                'source_folder': raw.get('source_folder', ''),
                'file_name': raw.get('file_name', ''),
                'title': raw.get('剧本名字', ''),
                'main_characters_raw': raw.get('主要角色', ''),
            })

    files.sort(key=lambda x: (x['source_folder'], x['file_name']))
    return files


def load_network_plays(network_file: Path) -> list[dict]:
    """加载单剧本网络数据，按 entity_id 排序"""
    with gzip.open(network_file, 'rt', encoding='utf-8') as f:
        data = json.load(f)

    plays = data['plays']
    plays.sort(key=lambda x: x['entity_id'])
    return plays


def parse_main_characters(raw_text: str) -> list[dict]:
    """
    解析「主要角色」字段。
    格式: "诸葛亮：老生\n司马懿：净\n司马师：净\n..."

    返回: [{"name": "诸葛亮", "role_type": "老生"}, ...]
    """
    if not raw_text or not raw_text.strip():
        return []

    characters = []
    for line in raw_text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        # 匹配 "角色名：行当" 或 "角色名:行当"
        match = re.match(r'^([一-鿿㐀-䶿a-zA-Z0-9·]{1,6})[：:]\s*(.+)$', line)
        if match:
            name = match.group(1).strip()
            role_type = match.group(2).strip()
            characters.append({"name": name, "role_type": role_type})
        else:
            # 可能只有角色名没有行当
            if 1 <= len(line) <= 6:
                characters.append({"name": line, "role_type": "未知"})

    return characters


def main():
    # 1. 收集并排序原始文件
    print("收集原始剧本文件...")
    raw_files = collect_raw_files(RAW_DIR)
    print(f"  已收集 {len(raw_files)} 个原始文件")

    # 2. 加载网络数据
    print("加载单剧本网络数据...")
    net_plays = load_network_plays(NETWORK_FILE)
    print(f"  已加载 {len(net_plays)} 条网络记录")

    # 3. 验证数量一致
    if len(raw_files) != len(net_plays):
        print(f"❌ 数量不一致: raw={len(raw_files)}, net={len(net_plays)}")
        return

    # 4. 位置对应，合并数据
    print("匹配合并...")
    results = []
    pos_mismatch = 0

    for i, (raw, net) in enumerate(zip(raw_files, net_plays)):
        eid = net['entity_id']
        genre = net['剧目类型']
        net_title = net['剧本名']

        # 验证名称一致性
        if raw['title'] != net_title:
            pos_mismatch += 1
            if pos_mismatch <= 5:
                print(f"  ⚠ 名称不一致 #{i}: raw='{raw['title']}' vs net='{net_title}' (eid={eid})")

        characters = parse_main_characters(raw['main_characters_raw'])

        results.append({
            "entity_id": eid,
            "title": net_title,
            "genre": genre,
            "main_characters": [c["name"] for c in characters],
            "main_characters_detail": characters,
            "main_character_count": len(characters),
        })

    if pos_mismatch:
        print(f"  ⚠ 共 {pos_mismatch} 条名称不一致（不影响映射，仅作提示）")
    else:
        print(f"  ✅ 全部 {len(results)} 条名称一致，映射正确")

    # 5. 输出统计
    genres = defaultdict(lambda: {"count": 0, "total_chars": 0})
    for r in results:
        g = r["genre"]
        genres[g]["count"] += 1
        genres[g]["total_chars"] += r["main_character_count"]

    print(f"\n类型分布:")
    for g in ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"]:
        if g in genres:
            stats = genres[g]
            avg = stats["total_chars"] / stats["count"] if stats["count"] > 0 else 0
            print(f"  {g}: {stats['count']}本, 平均 {avg:.1f} 个主要角色")

    # 6. 写入输出
    output_data = {
        "total": len(results),
        "description": "每本京剧剧本的主要角色列表，提取自原始数据「主要角色」字段",
        "plays": results,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 已写入: {OUTPUT} ({OUTPUT.stat().st_size / 1024:.1f} KB)")


if __name__ == '__main__':
    main()
