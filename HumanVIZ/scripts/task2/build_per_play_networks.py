#!/usr/bin/env python3
"""
构建 per-play 网络前端数据，支持按需加载单个剧本的完整关系网络。

输入:
  - data/processed/task2/db_exports/单剧本网络.json.gz  (1473本完整 nodes+edges)

输出:
  - src/data/task2-play-networks.json        (5.7MB, 全部剧本的紧凑网络数据)
  - src/data/task2-play-networks-index.json  (111KB, 轻量索引)

用法:
    cd HumanVIZ
    python scripts/task2/build_per_play_networks.py
"""

import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
NETWORK_FILE = ROOT / "data" / "processed" / "task2" / "db_exports" / "单剧本网络.json.gz"
OUTPUT_FULL = ROOT / "src" / "data" / "task2-play-networks.json"
OUTPUT_INDEX = ROOT / "src" / "data" / "task2-play-networks-index.json"


def build_compact_networks(plays: list[dict]) -> dict:
    """
    将全量剧本网络转换为紧凑格式。

    紧凑 node:  {"n":"诸葛亮","d":0.545,"r":"老生","sc":3}
    紧凑 edge:  {"s":"诸葛亮","t":"司马懿","w":3,"rl":"敌对"}
    """
    compact = {}
    for p in plays:
        eid = str(p["entity_id"])
        nodes = []
        for n in p.get("nodes", []):
            nodes.append({
                "n": n["name"],
                "d": round(n.get("degree_centrality", 0), 3),
                "r": n.get("role_type", ""),
                "sc": n.get("scene_count", 0),
            })
        edges = []
        for e in p.get("edges", []):
            edges.append({
                "s": e["source"],
                "t": e["target"],
                "w": e.get("weight", 1),
                "rl": e.get("relation_type", ""),
            })
        compact[eid] = {
            "ti": p["剧本名"],
            "ge": p["剧目类型"],
            "nc": len(nodes),
            "ec": len(edges),
            "no": nodes,
            "ed": edges,
        }
    return compact


def build_index(compact: dict) -> dict:
    """从紧凑数据提取轻量索引"""
    index = {}
    for eid, data in compact.items():
        index[eid] = {
            "ti": data["ti"],
            "ge": data["ge"],
            "nc": data["nc"],
            "ec": data["ec"],
        }
    return index


def main():
    # 1. 加载全量数据
    print("加载单剧本网络数据...")
    with gzip.open(NETWORK_FILE, "rt", encoding="utf-8") as f:
        raw = json.load(f)

    plays = raw["plays"]
    print(f"  已加载 {len(plays)} 本剧本")

    # 2. 构建紧凑格式
    print("构建紧凑网络数据...")
    compact = build_compact_networks(plays)
    print(f"  已构建 {len(compact)} 条记录")

    # 3. 写入完整数据
    print(f"写入 {OUTPUT_FULL.name} ...")
    OUTPUT_FULL.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FULL, "w", encoding="utf-8") as f:
        json.dump(compact, f, ensure_ascii=False)
    size_mb = OUTPUT_FULL.stat().st_size / 1024 / 1024
    print(f"  {size_mb:.2f} MB")

    # 4. 写入索引
    print(f"写入 {OUTPUT_INDEX.name} ...")
    index = build_index(compact)
    with open(OUTPUT_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    size_kb = OUTPUT_INDEX.stat().st_size / 1024
    print(f"  {size_kb:.0f} KB")

    # 5. 统计
    types = {}
    for data in compact.values():
        g = data["ge"]
        if g not in types:
            types[g] = {"count": 0, "total_nodes": 0, "total_edges": 0}
        types[g]["count"] += 1
        types[g]["total_nodes"] += data["nc"]
        types[g]["total_edges"] += data["ec"]

    print(f"\n类型分布:")
    for g in ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"]:
        if g in types:
            s = types[g]
            print(f"  {g}: {s['count']}本, 均{s['total_nodes']//s['count']}节点, {s['total_edges']//s['count']}边")

    print(f"\n✅ 完成。前端可通过以下方式使用:")
    print(f"  import idx from '@/data/task2-play-networks-index.json'  // 轻量索引")
    print(f"  const full = await fetch('/src/data/task2-play-networks.json').then(r=>r.json())  // 按需加载")


if __name__ == "__main__":
    main()
