#!/usr/bin/env python3
"""
桥接脚本：从分析管线数据生成前端 network-data.json

输入:
  - data/processed/db_exports/单剧本网络.json.gz  (1473 部剧本的节点+边+指标)
  - data/processed/task2/network_by_type/network_structure_labels.json  (6种结构标签)
  - data/processed/task2/network_by_type/core_role_hangdang_distribution.json  (行当分布)
  - data/processed/task2/network_by_type/centralization_metrics.json  (中心化指标)
  - data/processed/task2/network_by_type/connectivity_stats.json  (连通性)

输出:
  - src/data/network-data.json

数据特征:
  - edges 含语义关系类型 (relation_type, micro_type)
  - nodes 含行当标注 (role_type)
  - 含结构标签、行当分布、关系类型分布等分析字段
"""

import gzip
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data" / "processed" / "task2" / "db_exports"
OUTPUTS_DIR = ROOT / "data" / "processed" / "task2" / "network_by_type"
SRC_DATA = ROOT / "src" / "data"
OUTPUT = SRC_DATA / "network-data.json"

# ── 常量 ──
TYPE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"]
TYPE_COLORS = {
    "历史戏": "#b8926a", "家庭戏": "#96544d", "侠义戏": "#5e6b76",
    "爱情戏": "#c77d8b", "神话戏": "#7f968d", "公案戏": "#6b7b8e",
    "技法展示戏": "#c4a56e",
}

METRIC_KEYS = [
    "density", "centralization", "clustering", "modularity",
    "degree_entropy", "bridge_ratio", "top2_concentration",
]
METRIC_LABELS = {
    "density": "网络密度", "centralization": "中心性偏离度", "clustering": "聚类系数",
    "modularity": "模块度", "degree_entropy": "度分布熵", "bridge_ratio": "桥接节点比",
    "top2_concentration": "Top-2集中度",
}

ROLE_COLORS = {"生": "#b8926a", "旦": "#96544d", "净": "#5e6b76", "丑": "#7f968d", "其他": "#a09080"}
STRUCTURE_LABELS = ["弱关系碎片型", "单核心型", "双核心型", "双核心对抗型", "多核心群像型", "分散型"]
STRUCTURE_COLORS = {
    "弱关系碎片型": "#d4a76a", "单核心型": "#c44e52", "双核心型": "#4c72b0",
    "双核心对抗型": "#8b3a3a", "多核心群像型": "#55a868", "分散型": "#a09080",
}
MACRO_RELATIONS = ["同盟", "从属", "敌对", "亲属", "情感"]
MACRO_COLORS = {"同盟": "#55a868", "从属": "#4c72b0", "敌对": "#c44e52", "亲属": "#937860", "情感": "#c77d8b", "中立": "#c0c0c0"}

REP_PER_TYPE = 3  # 每种类型选3个代表性网络


def load_play_networks():
    """加载单剧本网络数据"""
    path = DATA_DIR / "单剧本网络.json.gz"
    print(f"  加载: {path}")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        raw = json.load(f)
    return raw["plays"]


def load_structure_labels():
    """加载结构标签"""
    path = OUTPUTS_DIR / "network_structure_labels.json"
    print(f"  加载: {path}")
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {p["entity_id"]: p for p in raw["plays"]}


def load_centralization():
    """加载中心化指标"""
    path = OUTPUTS_DIR / "centralization_metrics.json"
    print(f"  加载: {path}")
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {p["entity_id"]: p for p in raw["plays"]}


def load_connectivity():
    """加载连通性数据"""
    path = OUTPUTS_DIR / "connectivity_stats.json"
    print(f"  加载: {path}")
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {p["entity_id"]: p for p in raw["plays"]}


def load_hangdang_dist():
    """加载行当分布"""
    path = OUTPUTS_DIR / "core_role_hangdang_distribution.json"
    print(f"  加载: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_radar_metrics():
    """
    加载雷达图数据: 从 basic_stats.json 提取每种类型的5维指标均值。
    返回 { play_type: { node_count, density, clustering, centralization, degree_entropy } }
    node_count 归一化到 0-1 范围。
    """
    path = OUTPUTS_DIR / "basic_stats.json"
    print(f"  加载: {path}")
    with open(path, encoding="utf-8") as f:
        bs = json.load(f)

    by_type = bs.get("by_type", {})
    result = {}
    max_nodes = max(
        by_type[t]["full_graph"]["node_count"]["mean"] for t in by_type
    ) if by_type else 1

    for t in TYPE_ORDER:
        if t not in by_type:
            continue
        fg = by_type[t]["full_graph"]
        result[t] = {
            "node_count_norm": round(fg["node_count"]["mean"] / max_nodes, 3),
            "density": round(fg["density"]["mean"], 3),
            "clustering": round(fg["avg_clustering"]["mean"], 3),
            "centralization": round(fg["centralization"]["mean"], 3),
            "degree_entropy": round(fg["degree_entropy"]["mean"], 3),
        }
    return result


def load_sankey_data():
    """
    构建桑基图数据: 剧目类型 → 宏观关系类型 (两级，不含微观子关系)。
    返回 { nodes: [{name}], links: [{source, target, value}] }
    """
    # 加载宏观关系 (类型 → 关系类别 → count)
    hangdang_path = OUTPUTS_DIR / "core_role_hangdang_distribution.json"
    with open(hangdang_path, encoding="utf-8") as f:
        cr = json.load(f)
    core_tendency = cr.get("core_relation_tendency", {})

    # 宏观关系名称映射 (core_relation_tendency 的 key 用中文)
    MACRO_KEYS = ["同盟", "从属", "敌对", "亲属", "情感"]

    nodes_set = set()
    links = []

    for play_type in TYPE_ORDER:
        if play_type not in core_tendency:
            continue
        pt_node = f"T:{play_type}"
        nodes_set.add(pt_node)

        macro_dist = core_tendency[play_type].get("distribution", {})

        for macro_key in MACRO_KEYS:
            macro_count = macro_dist.get(macro_key, {}).get("count", 0) if isinstance(macro_dist.get(macro_key), dict) else macro_dist.get(macro_key, 0)
            if macro_count <= 0:
                continue
            macro_node = f"M:{macro_key}"
            nodes_set.add(macro_node)

            # 类型 → 宏观关系
            links.append({
                "source": pt_node,
                "target": macro_node,
                "value": macro_count,
            })

    # 构建 nodes 数组
    nodes = [{"name": n} for n in sorted(nodes_set)]

    # 将 source/target 从 name 转为 index
    name_to_idx = {n["name"]: i for i, n in enumerate(nodes)}
    indexed_links = []
    for link in links:
        src_idx = name_to_idx.get(link["source"])
        tgt_idx = name_to_idx.get(link["target"])
        if src_idx is not None and tgt_idx is not None:
            indexed_links.append({
                "source": src_idx,
                "target": tgt_idx,
                "value": link["value"],
            })

    print(f"  桑基图: {len(nodes)} 节点, {len(indexed_links)} 连线")
    return {"nodes": nodes, "links": indexed_links}


def mean(vals):
    """纯 Python 均值"""
    return sum(vals) / len(vals) if vals else 0.0


def compute_per_play_metrics(plays):
    """从 per-play metrics 字段提取全局类型均值"""
    by_type = defaultdict(list)
    for p in plays:
        m = p.get("metrics", {})
        genre = p.get("剧目类型", "历史戏")
        if genre not in TYPE_ORDER:
            continue
        metric_vals = {
            "density": m.get("density", 0),
            "clustering": m.get("avg_clustering", 0),
            "modularity": m.get("modularity", 0),
            "centralization": m.get("degree_centralization", 0),
            "degree_entropy": m.get("degree_entropy", 0),
            "bridge_ratio": m.get("bridge_ratio", 0),
            "top2_concentration": m.get("top2_concentration", 0),
            "n_nodes": m.get("node_count", 0),
            "n_edges": m.get("edge_count", 0),
        }
        by_type[genre].append(metric_vals)

    type_means = {}
    for genre in TYPE_ORDER:
        ms = by_type.get(genre, [])
        if not ms:
            continue
        type_means[genre] = {
            "metrics": {
                key: round(mean([m.get(key, 0) for m in ms]), 4)
                for key in METRIC_KEYS
            },
            "count": len(ms),
        }

    return type_means, by_type


def patch_with_structure_data(plays, struct_map, centr_map, conn_map):
    """将结构标签、中心化、连通性数据注入 plays"""
    for p in plays:
        eid = p["entity_id"]
        m = p.get("metrics", {})

        # 结构标签
        if eid in struct_map:
            p["structure_label"] = struct_map[eid].get("label", "分散型")
            p["structure_reasons"] = struct_map[eid].get("reasons", [])
            p["structure_secondary"] = struct_map[eid].get("secondary_flags", [])

        # 中心化指标
        if eid in centr_map:
            c = centr_map[eid]
            fg = c.get("full_graph", {})
            m["degree_centralization"] = fg.get("degree_centralization", 0)
            m["betweenness_centralization"] = fg.get("betweenness_centralization", 0)
            m["top1_top2_gap"] = fg.get("top1_top2_gap", 0)
            p["centralization"] = fg

        # 连通性
        if eid in conn_map:
            cn = conn_map[eid]
            fg = cn.get("full_graph", {})
            sg = cn.get("semantic_graph", {})
            m["connected_components"] = fg.get("connected_components", 1)
            m["largest_component_ratio"] = fg.get("largest_component_ratio", 1.0)
            m["isolated_node_ratio"] = fg.get("isolated_node_ratio", 0)
            m["semantic_fragmented"] = sg.get("connected_components", 1) > fg.get("connected_components", 1) * 1.5
            p["connectivity"] = {"full_graph": fg, "semantic_graph": sg}

    return plays


def compute_scatter_points(plays):
    """
    生成结构空间散点数据。
    使用 degree_centralization (X) 和 largest_component_ratio (Y) 作为轴，
    比 PCA 更具可解释性：X=权力集中度，Y=网络完整性。
    对所有 1473 个剧本计算，前端可以筛选显示。
    """
    scatter_points = []
    for p in plays:
        m = p.get("metrics", {})
        dc = m.get("degree_centralization", 0)
        lcr = m.get("largest_component_ratio", 1.0)
        # 如果数据还没注入，尝试从 connectivity / centralization 字段获取
        if dc == 0 and "centralization" in p:
            dc = p["centralization"].get("degree_centralization", 0)
        if lcr == 1.0 and "connectivity" in p:
            lcr = p["connectivity"].get("full_graph", {}).get("largest_component_ratio", 1.0)

        bc = m.get("betweenness_centralization", 0)

        scatter_points.append({
            "entity_id": p["entity_id"],
            "title": p.get("剧本名", ""),
            "genre": p.get("剧目类型", "历史戏"),
            "x": round(dc, 4),        # degree_centralization
            "y": round(lcr, 4),       # largest_component_ratio
            "n_nodes": m.get("node_count", 0),
            "n_edges": m.get("edge_count", 0),
            "structure_label": p.get("structure_label", "分散型"),
            "semantic_fragmented": m.get("semantic_fragmented", False),
            "betweenness": round(bc, 4),  # 介数集中度 (for Phase 3 violin/box)
        })

    # 按类型计算质心
    centroids = {}
    for genre in TYPE_ORDER:
        gpts = [p for p in scatter_points if p["genre"] == genre]
        if gpts:
            centroids[genre] = {
                "x": round(mean([p["x"] for p in gpts]), 4),
                "y": round(mean([p["y"] for p in gpts]), 4),
                "count": len(gpts),
            }

    return scatter_points, centroids


def score_play(p):
    """评分: 角色数 + 边数*0.5 + 非分散型奖励"""
    m = p.get("metrics", {})
    s = m.get("node_count", 0) + m.get("edge_count", 0) * 0.5
    # 非分散型加分，让结构多样性样本更容易被选中
    label = p.get("structure_label", "分散型")
    if label != "分散型":
        s += 10  # 显著加分
    return s


def select_representative_networks(plays):
    """
    每种类型选 REP_PER_TYPE 个代表性网络。
    策略: 按结构标签分组，每组选最好的，确保结构多样性。
    优先展示不同类型的网络拓扑形态。
    """
    by_type = defaultdict(list)
    for p in plays:
        genre = p.get("剧目类型", "历史戏")
        if genre not in TYPE_ORDER:
            continue
        n_chars = p.get("metrics", {}).get("node_count", 0)
        n_edges = p.get("metrics", {}).get("edge_count", 0)
        if n_chars >= 3 and n_edges >= 3:
            by_type[genre].append(p)

    rep_networks = {}
    for genre in TYPE_ORDER:
        candidates = by_type.get(genre, [])
        # 按结构标签分组
        by_label = defaultdict(list)
        for p in candidates:
            label = p.get("structure_label", "分散型")
            by_label[label].append(p)

        # 每组内按评分排序
        for label in by_label:
            by_label[label].sort(key=score_play, reverse=True)

        # 贪心选择: 每轮从不同标签组选一个最好的
        selected = []
        label_order = ["单核心型", "双核心对抗型", "双核心型", "多核心群像型", "弱关系碎片型", "分散型"]
        round_idx = 0
        while len(selected) < REP_PER_TYPE:
            added = False
            for label in label_order:
                group = by_label.get(label, [])
                if round_idx < len(group):
                    selected.append(group[round_idx])
                    added = True
                    if len(selected) >= REP_PER_TYPE:
                        break
            if not added:
                break  # 没有更多候选了
            round_idx += 1

        rep_networks[genre] = []
        for p in selected:
            m = p.get("metrics", {})
            nodes = []
            for n in p.get("nodes", []):
                nodes.append({
                    "name": n.get("name", n.get("id", "")),
                    "degree": n.get("degree_centrality", 0),
                    "scene_count": n.get("scene_count", 0),
                    "role_type": n.get("role_type", "其他"),
                    "dialogue_count": n.get("dialogue_count", 0),
                    "betweenness": n.get("betweenness_centrality", 0),
                })
            edges = []
            for e in p.get("edges", []):
                edges.append({
                    "source": e["source"],
                    "target": e["target"],
                    "weight": e.get("weight", 1),
                    "relation_type": e.get("relation_type", "中立"),
                    "micro_type": e.get("micro_type", ""),
                    "source_tag": e.get("source_tag", "unknown"),
                })

            rep_networks[genre].append({
                "entity_id": p["entity_id"],
                "title": p.get("剧本名", ""),
                "genre": genre,
                "structure_label": p.get("structure_label", "分散型"),
                "total_characters": m.get("node_count", 0),
                "total_edges": m.get("edge_count", 0),
                "total_scenes": m.get("total_scenes", 0) if "total_scenes" in m else max(
                    1, max((n.get("scene_count", 0) for n in p.get("nodes", [])), default=1)
                ),
                "density": m.get("density", 0),
                "nodes": nodes,
                "edges": edges,
            })

    return rep_networks


def compute_relation_distribution(plays):
    """按类型统计语义关系分布"""
    by_type = defaultdict(lambda: defaultdict(float))
    for p in plays:
        genre = p.get("剧目类型", "历史戏")
        for e in p.get("edges", []):
            rt = e.get("relation_type", "中立")
            if rt != "中立":  # 排除中立，聚焦语义关系
                by_type[genre][rt] += e.get("weight", 1)

    # 归一化为比例
    result = {}
    for genre in TYPE_ORDER:
        total = sum(by_type[genre].values())
        if total > 0:
            result[genre] = {rt: round(by_type[genre][rt] / total * 100, 1)
                           for rt in MACRO_RELATIONS}
        else:
            result[genre] = {rt: 0 for rt in MACRO_RELATIONS}
    return result


def compute_structure_by_type(plays):
    """按类型统计结构标签分布"""
    by_type = defaultdict(lambda: Counter())
    for p in plays:
        genre = p.get("剧目类型", "历史戏")
        label = p.get("structure_label", "分散型")
        by_type[genre][label] += 1

    result = {}
    for genre in TYPE_ORDER:
        total = sum(by_type[genre].values())
        result[genre] = {
            label: {"count": by_type[genre][label],
                    "pct": round(by_type[genre][label] / total * 100, 1) if total > 0 else 0}
            for label in STRUCTURE_LABELS
        }
    return result


def compute_top_chars(plays):
    """每种类型的枢纽角色 Top-5"""
    by_type = defaultdict(lambda: Counter())
    for p in plays:
        genre = p.get("剧目类型", "历史戏")
        for n in p.get("nodes", []):
            name = n.get("name", n.get("id", ""))
            deg = n.get("degree_centrality", 0)
            if deg > 0:
                by_type[genre][name] += deg

    top_chars = {}
    for genre in TYPE_ORDER:
        top_chars[genre] = [
            {"name": name, "total_degree": round(total, 2)}
            for name, total in by_type[genre].most_common(5)
        ]
    return top_chars


def build_play_index(plays):
    """构建可搜索的剧本索引"""
    index = []
    for p in plays:
        m = p.get("metrics", {})
        index.append({
            "entity_id": p["entity_id"],
            "title": p.get("剧本名", ""),
            "genre": p.get("剧目类型", "历史戏"),
            "structure_label": p.get("structure_label", "分散型"),
            "node_count": m.get("node_count", 0),
            "edge_count": m.get("edge_count", 0),
            "density": m.get("density", 0),
            "degree_centralization": m.get("degree_centralization", 0),
            "largest_component_ratio": m.get("largest_component_ratio", 1.0),
            "semantic_fragmented": m.get("semantic_fragmented", False),
        })
    return index


def main():
    print("=" * 60)
    print("生成前端 network-data.json")
    print("=" * 60)

    # 1. 加载数据
    print("\n📂 加载数据...")
    plays = load_play_networks()
    print(f"  剧本数: {len(plays)}")

    struct_map = load_structure_labels()
    print(f"  结构标签: {len(struct_map)} 条")

    centr_map = load_centralization()
    print(f"  中心化指标: {len(centr_map)} 条")

    conn_map = load_connectivity()
    print(f"  连通性: {len(conn_map)} 条")

    # 2. 注入额外数据
    print("\n🔗 注入结构标签/中心化/连通性...")
    plays = patch_with_structure_data(plays, struct_map, centr_map, conn_map)

    # 3. 计算类型均值
    print("\n📊 计算类型均值...")
    type_means, by_type_metrics = compute_per_play_metrics(plays)
    for genre in TYPE_ORDER:
        if genre in type_means:
            print(f"  {genre}: {type_means[genre]['count']} 本, "
                  f"density={type_means[genre]['metrics']['density']:.3f}, "
                  f"clustering={type_means[genre]['metrics']['clustering']:.3f}")

    # 4. 结构散点数据 (用中心化度 vs 连通性，替代 PCA)
    print(f"\n📉 生成结构散点数据 (X=中心化度, Y=最大连通分量占比)...")
    scatter_points, scatter_centroids = compute_scatter_points(plays)
    print(f"  散点: {len(scatter_points)}, 质心: {len(scatter_centroids)}")
    if scatter_centroids:
        for genre, c in scatter_centroids.items():
            print(f"  {genre}: ({c['x']:.3f}, {c['y']:.3f})")

    # 5. 代表性网络
    print("\n🎯 选择代表性网络...")
    rep_networks = select_representative_networks(plays)
    for genre in TYPE_ORDER:
        nets = rep_networks.get(genre, [])
        labels = [n.get("structure_label", "?") for n in nets]
        print(f"  {genre}: {len(nets)} 本, 标签={labels}")

    # 6. 关系类型分布
    print("\n📋 计算关系类型分布...")
    relation_dist = compute_relation_distribution(plays)
    for genre in TYPE_ORDER:
        if genre in relation_dist:
            top = sorted(relation_dist[genre].items(), key=lambda x: -x[1])[:3]
            print(f"  {genre}: {top}")

    # 7. 结构标签分布
    print("\n🏷️ 计算结构标签分布...")
    structure_by_type = compute_structure_by_type(plays)

    # 8. 枢纽角色
    print("\n👤 计算枢纽角色...")
    top_chars = compute_top_chars(plays)

    # 9. 剧本索引
    print("\n📑 构建剧本索引...")
    play_index = build_play_index(plays)

    # 10. 加载行当分布
    print("\n🎭 加载行当分布...")
    hangdang_data = load_hangdang_dist()

    # 11. 加载 Phase 2 仪表盘数据 (雷达图 + 桑基图)
    print("\n📊 加载仪表盘数据 (雷达 + 桑基)...")
    radar_metrics = load_radar_metrics()
    sankey_data = load_sankey_data()

    # 组装输出
    print("\n📦 组装输出...")
    output = {
        # ── 基础字段 ──
        "total_scripts": len(plays),
        "type_means": type_means,
        "type_colors": TYPE_COLORS,
        "type_order": TYPE_ORDER,
        "pca_points": scatter_points,              # 结构散点: X=中心化度, Y=连通分量占比
        "pca_centroids": scatter_centroids,        # 类型质心
        "type_size_stats": [{"type": t, "count": type_means[t]["count"]} for t in TYPE_ORDER if t in type_means],
        "rep_networks": rep_networks,
        "top_chars": top_chars,
        "metric_labels": METRIC_LABELS,
        "metric_order": METRIC_KEYS,
        "key_findings": [],  # 可由后续分析填充

        # ── 分析字段 ──
        "data_source": "LLM语义关系 + 共现权重融合管线",
        "structure_labels": STRUCTURE_LABELS,
        "structure_colors": STRUCTURE_COLORS,
        "structure_by_type": structure_by_type,
        "relation_type_distribution": relation_dist,
        "macro_relation_types": MACRO_RELATIONS,
        "macro_relation_colors": MACRO_COLORS,
        "hangdang_distribution": hangdang_data.get("hangdang_distribution", {}),
        "role_type_completion": hangdang_data.get("completion", {}),
        "radar_metrics": radar_metrics,              # 类型指纹雷达图: 5轴 × 7类型
        "sankey_data": sankey_data,                  # 桑基图: 类型→宏观关系→微观关系
        "play_index": play_index,
        "generated_at": "2026-06-06",
        "generated_by": "build_frontend_from_my_data.py",
    }

    # 写入
    print(f"\n💾 写入: {OUTPUT}")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"  完成! 文件大小: {size_kb:.1f} KB")
    print(f"  剧本数: {output['total_scripts']}")
    print(f"  类型: {len(output['type_means'])}")
    print(f"  结构散点: {len(output['pca_points'])}")
    print(f"  代表性网络: {sum(len(v) for v in output['rep_networks'].values())}")
    print(f"  结构标签: {output['structure_labels']}")
    print(f"  分析字段: structure_by_type, relation_type_distribution, "
          f"hangdang_distribution, connectivity, play_index")

    print("\n✅ 完成!")
    print("  - Nodes: role_type + degree/betweenness centrality")
    print("  - Edges: relation_type (同盟/敌对/从属/亲属/情感/中立)")
    print("  - 分析维度: 结构标签、连通性、行当分布、关系类型分布")


if __name__ == "__main__":
    main()
