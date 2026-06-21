#!/usr/bin/env python3
"""
Expand rep_networks to include ALL plays with full node/edge data.
Compact format for frontend-friendly size (~2MB total for 1473 plays).
"""
import json, gzip
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_GZ = ROOT / "data" / "processed" / "db_exports" / "单剧本网络.json.gz"
NETWORK_JSON = ROOT / "src" / "data" / "network-data.json"

with gzip.open(SRC_GZ, "rt", encoding="utf-8") as f:
    full_data = json.load(f)

plays_list = full_data.get("plays", [])

by_genre = defaultdict(list)

for pdata in plays_list:
    entity_id = pdata.get("entity_id", "")
    title = pdata.get("剧本名", entity_id)
    genre = pdata.get("剧目类型", "")
    if not genre:
        continue
    nodes_in = pdata.get("nodes", [])
    edges_in = pdata.get("edges", [])

    nodes = [{
        "name": n.get("name", n.get("角色名", "")),
        "degree": n.get("degree", 1),
        "role": n.get("行当", ""),
    } for n in nodes_in]

    edges = [{
        "source": e.get("source", e.get("源角色", "")),
        "target": e.get("target", e.get("目标角色", "")),
        "weight": e.get("weight", e.get("权重", 1)),
    } for e in edges_in]

    by_genre[genre].append({
        "entity_id": entity_id,
        "title": title,
        "total_characters": len(nodes),
        "total_edges": len(edges),
        "total_scenes": max(1, len(edges)),
        "nodes": nodes,
        "edges": edges,
    })

with open(NETWORK_JSON, encoding="utf-8") as f:
    ndata = json.load(f)

# Replace rep_networks with ALL plays
ndata["rep_networks"] = dict(by_genre)

# Remove heavyweight all_play_index (now redundant since rep_networks has everything)
if "all_play_index" in ndata:
    del ndata["all_play_index"]

with open(NETWORK_JSON, "w", encoding="utf-8") as f:
    json.dump(ndata, f, ensure_ascii=False, indent=2)

size_mb = NETWORK_JSON.stat().st_size / (1024 * 1024)
total = sum(len(v) for v in by_genre.values())
print(f"Expanded rep_networks: {total} plays across {len(by_genre)} types")
print(f"File size: {size_mb:.1f} MB")
for g in sorted(by_genre.keys()):
    print(f"  {g}: {len(by_genre[g])} plays")
