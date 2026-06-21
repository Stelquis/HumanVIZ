#!/usr/bin/env python3
"""
Task 2 — 角色关系网络处理管线

三阶段一站式：
  Phase 1: 从 1473 本剧本 JSON 中正则提取场景级角色共现网络
  Phase 2: 计算 8 项网络指标 + ANOVA / Kruskal-Wallis / Tukey HSD 统计检验
  Phase 3: PCA 降维 + 代表性网络提取 + 生成前端 network-data.json

用法:
    python task2_process_networks.py              # 执行 Phase 1→2→3 全流程
    python task2_process_networks.py --step 1     # 仅 Phase 1: 共现提取
    python task2_process_networks.py --step 2     # 仅 Phase 2: 指标+统计
    python task2_process_networks.py --step 3     # 仅 Phase 3: 前端数据
"""

import argparse
import json
import os
import re
import sys
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from numpy import array
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd

# ── 路径常量 ──────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "raw" / "dataSet"
PROCESSED_DIR = ROOT / "data" / "processed"
SRC_DATA_DIR = ROOT / "src" / "data"

# 中间产出
NETWORKS_OUT = PROCESSED_DIR / "p2_networks.json"
METRICS_OUT = PROCESSED_DIR / "p2_metrics.json"
COMPARISON_OUT = PROCESSED_DIR / "p2_type_comparison.json"
# 前端产出
FRONTEND_OUT = SRC_DATA_DIR / "network-data.json"

# ── 参数配置 ──────────────────────────────────────────────────────────
SCENE_SEP = re.compile(r'【[^】]*(?:场|折|幕)[^】]*】')
CHAR_PAT = re.compile(r'^([一-龥]{2,4})\s+（', re.MULTILINE)

TYPE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"]
TYPE_COLORS = {
    "历史戏": "#b8926a", "家庭戏": "#96544d", "侠义戏": "#5e6b76",
    "爱情戏": "#c77d8b", "神话戏": "#7f968d", "公案戏": "#6b7b8e",
    "技法展示戏": "#c4a56e",
}

METRIC_LABELS = {
    "density": "网络密度", "centralization": "中心性偏离度", "clustering": "聚类系数",
    "modularity": "模块度", "degree_entropy": "度分布熵", "bridge_ratio": "桥接节点比",
    "top2_concentration": "Top-2集中度", "n_nodes": "角色数", "n_edges": "边数",
}

N_PCA_SAMPLES = 500
REP_PER_TYPE = 2


# ═══════════════════════════════════════════════════════════════════════
# Phase 1: 批量共现网络提取
# ═══════════════════════════════════════════════════════════════════════

def extract_characters_from_dialogue(dialogue: str) -> set[str]:
    """从一段对话文本中提取所有出场角色名"""
    chars = set()
    for line in dialogue.strip().split('\n'):
        m = CHAR_PAT.match(line)
        if m:
            chars.add(m.group(1))
    return chars


def split_scenes(dialogue: str) -> list[str]:
    """用场景分隔标记切分对话文本"""
    parts = SCENE_SEP.split(dialogue)
    return [p for p in parts if p.strip()]


def get_genre_type_map() -> dict[str, str]:
    """从剧目类型 JSON 读取 剧本名 → 类型映射"""
    genre_path = PROCESSED_DIR / "db_exports" / "剧目类型.json"
    if not genre_path.exists():
        return {}
    with open(genre_path, encoding='utf-8') as f:
        data = json.load(f)
    result = {}
    for item in data:
        name = item.get("name", "")
        genre = item.get("剧目类型", "")
        if name and genre:
            result[name] = genre
    return result


def build_cooccurrence_networks(verbose: bool = True) -> list[dict]:
    """
    遍历 1473 个剧本 JSON，正则提取场景级角色共现网络。

    返回: networks 列表，每个元素含 entity_id, title, genre,
           source_category, nodes, edges, total_scenes, total_characters,
           total_edges, density 等字段。
    """
    json_files = sorted(DATA_DIR.rglob("*.json"))
    genre_map = get_genre_type_map()
    networks = []
    errors = []

    print("=" * 60)
    print("Phase 1: 批量角色共现网络提取")
    print("=" * 60)
    print(f"共 {len(json_files)} 个 JSON")

    for i, fpath in enumerate(json_files):
        try:
            with open(fpath, encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            errors.append({"file": str(fpath), "error": str(exc)})
            continue

        entity_id = os.path.splitext(os.path.basename(fpath))[0]
        title = data.get("剧本名字", entity_id)
        genre = genre_map.get(title, "历史戏")
        source_name = data.get("source_folder_name", "")
        dialogue = data.get("正文对话", "")

        if not dialogue:
            networks.append({
                "entity_id": entity_id, "title": title, "genre": genre,
                "source_category": source_name,
                "nodes": [], "edges": [], "total_scenes": 0,
                "total_characters": 0, "total_edges": 0, "density": 0.0,
            })
            continue

        # 场景切分
        scenes = split_scenes(dialogue)
        total_scenes = len(scenes)

        # 逐场景提取角色
        scene_chars: list[set[str]] = []
        all_chars = set()
        for scene_text in scenes:
            chs = extract_characters_from_dialogue(scene_text)
            scene_chars.append(chs)
            all_chars.update(chs)

        # 共现边：同场任意两角色间建立边
        edge_counts: dict[tuple[str, str], int] = Counter()
        for chs in scene_chars:
            ch_list = sorted(chs)
            for a in range(len(ch_list)):
                for b in range(a + 1, len(ch_list)):
                    edge_counts[(ch_list[a], ch_list[b])] += 1

        char_degree = Counter()
        for (a, b), w in edge_counts.items():
            char_degree[a] += w
            char_degree[b] += w

        # 角色出场次数
        char_appearances = Counter()
        for chs in scene_chars:
            for c in chs:
                char_appearances[c] += 1

        n_chars = len(all_chars)
        n_edges = len(edge_counts)
        max_possible = n_chars * (n_chars - 1) / 2 if n_chars > 1 else 1
        density = n_edges / max_possible if max_possible > 0 else 0

        nodes = sorted([{
            "name": c,
            "degree": char_degree.get(c, 0),
            "appearances": char_appearances.get(c, 0),
            "degree_centrality": round(char_degree.get(c, 0) / (n_chars - 1), 4) if n_chars > 1 else 0,
        } for c in all_chars], key=lambda x: -x["degree"])

        edges = sorted([{
            "source": a, "target": b, "weight": w,
        } for (a, b), w in edge_counts.items()], key=lambda x: -x["weight"])

        networks.append({
            "entity_id": entity_id, "title": title, "genre": genre,
            "source_category": source_name,
            "nodes": nodes, "edges": edges,
            "total_scenes": total_scenes,
            "total_characters": n_chars, "total_edges": n_edges,
            "density": round(density, 6),
        })

        if verbose and i % 100 == 0:
            print(f"  进度: {i}/{len(json_files)}")

    print(f"\n完成! 成功: {len(networks)}, 失败: {len(errors)}")
    print(f"输出: {NETWORKS_OUT}")

    # 打印摘要
    _print_network_summary(networks)

    return networks


def _print_network_summary(networks: list[dict]) -> None:
    """打印网络提取概要统计"""
    total_scenes = [n["total_scenes"] for n in networks]
    total_chars = [n["total_characters"] for n in networks]
    total_edges = [n["total_edges"] for n in networks]
    densities = [n["density"] for n in networks]

    no_chars = sum(1 for n in networks if n["total_characters"] == 0)
    no_edges = sum(1 for n in networks if n["total_edges"] == 0 and n["total_characters"] > 0)

    print("\n===== 网络提取概要 =====")
    print(f"场景数: mean={np.mean(total_scenes):.1f}, median={np.median(total_scenes):.0f}")
    print(f"角色数: mean={np.mean(total_chars):.1f}, median={np.median(total_chars):.0f}, "
          f"min={min(total_chars)}, max={max(total_chars)}")
    print(f"边数:   mean={np.mean(total_edges):.1f}, median={np.median(total_edges):.0f}")
    print(f"密度:   mean={np.mean(densities):.4f}, median={np.median(densities):.4f}")
    print(f"无角色: {no_chars} 本")
    print(f"无共现: {no_edges} 本")

    print("\n===== 按剧目类型 =====")
    by_type = defaultdict(list)
    for n in networks:
        by_type[n["genre"]].append(n)
    for genre in sorted(by_type.keys(), key=lambda g: -len(by_type[g])):
        gns = by_type[genre]
        avg_chars = np.mean([n["total_characters"] for n in gns])
        avg_edges = np.mean([n["total_edges"] for n in gns])
        print(f"  {genre}: {len(gns)}本, avg_chars={avg_chars:.1f}, avg_edges={avg_edges:.1f}")


def save_networks(networks: list[dict], output_path: Path = NETWORKS_OUT) -> None:
    """保存共现网络到 JSON 文件"""
    with open(output_path, "w", encoding='utf-8') as f:
        json.dump({"networks": networks, "total": len(networks)}, f,
                  ensure_ascii=False, separators=(",", ":"))
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"已保存: {output_path} ({size_mb:.1f} MB)")


# ═══════════════════════════════════════════════════════════════════════
# Phase 2: 网络指标计算与统计检验
# ═══════════════════════════════════════════════════════════════════════

def compute_network_metrics(network: dict) -> dict[str, float]:
    """
    计算单本剧本的 8 项网络结构指标。

    输入: 含 nodes 和 edges 字段的字典。
    返回: {metric_name: value} 字典。
    """
    nodes = network.get("nodes", [])
    edges = network.get("edges", [])
    n_chars = len(nodes)
    n_edges = len(edges)

    metrics = {"n_nodes": n_chars, "n_edges": n_edges}

    if n_chars <= 1 or n_edges == 0:
        defaults = {
            "density": 0.0, "centralization": 0.0, "clustering": 0.0,
            "modularity": 0.0, "degree_entropy": 0.0, "bridge_ratio": 0.0,
            "top2_concentration": 0.0,
        }
        metrics.update(defaults)
        return metrics

    # 构建邻接表
    adj = defaultdict(set)
    edge_weights: dict[tuple[str, str], float] = {}
    for e in edges:
        a, b = e["source"], e["target"]
        w = e.get("weight", 1)
        adj[a].add(b)
        adj[b].add(a)
        key = (a, b) if a < b else (b, a)
        edge_weights[key] = w

    node_degrees = {n["name"]: len(adj.get(n["name"], set())) for n in nodes}
    max_degree = max(node_degrees.values()) if node_degrees else 0
    mean_degree = np.mean(list(node_degrees.values())) if node_degrees else 0

    # 1. density
    max_possible = n_chars * (n_chars - 1) / 2
    density = n_edges / max_possible

    # 2. centralization: max_degree / mean_degree
    centralization = max_degree / mean_degree if mean_degree > 0 else 0

    # 3. clustering (average local clustering coefficient)
    clustering_vals = []
    for node_name, neighbors in adj.items():
        nbrs = list(neighbors)
        k = len(nbrs)
        if k < 2:
            clustering_vals.append(0.0)
        else:
            actual = sum(1 for i in range(k) for j in range(i + 1, k)
                        if nbrs[j] in adj[nbrs[i]])
            clustering_vals.append(actual / (k * (k - 1) / 2))
    clustering = np.mean(clustering_vals)

    # 4. modularity (label propagation approximation)
    modularity = _compute_modularity(adj, node_degrees, list(adj.keys()), n_edges)

    # 5. degree_entropy (normalized Shannon)
    deg_vals = list(node_degrees.values())
    if n_chars > 1:
        prob = array(deg_vals) / sum(deg_vals)
        entropy = -sum(p * math.log(p) for p in prob if p > 0)
        max_entropy = math.log(n_chars)
        degree_entropy = entropy / max_entropy if max_entropy > 0 else 0
    else:
        degree_entropy = 0.0

    # 6. bridge_ratio: nodes connecting different communities
    communities = _label_propagation(adj, list(adj.keys()))
    bridge_ratio = _compute_bridge_ratio(adj, communities)

    # 7. top2_concentration
    sorted_weights = sorted(edge_weights.values(), reverse=True)
    top2_w = sum(sorted_weights[:2]) if len(sorted_weights) >= 2 else sum(sorted_weights)
    total_w = sum(sorted_weights)
    top2_concentration = top2_w / total_w if total_w > 0 else 0

    metrics.update({
        "density": round(density, 6),
        "centralization": round(centralization, 4),
        "clustering": round(clustering, 4),
        "modularity": round(modularity, 4),
        "degree_entropy": round(degree_entropy, 4),
        "bridge_ratio": round(bridge_ratio, 4),
        "top2_concentration": round(top2_concentration, 4),
    })
    return metrics


def _label_propagation(adj: dict[str, set[str]], nodes_list: list[str]) -> dict[str, int]:
    """标签传播社区检测，返回 {node: community_id}"""
    if not nodes_list:
        return {}
    labels = {n: i for i, n in enumerate(nodes_list)}
    changed = True
    max_iters = 50
    while changed and max_iters > 0:
        changed = False
        max_iters -= 1
        for node in nodes_list:
            neighbors = adj.get(node, set())
            if not neighbors:
                continue
            counts = Counter(labels[nbr] for nbr in neighbors)
            new_label = counts.most_common(1)[0][0]
            if labels[node] != new_label:
                labels[node] = new_label
                changed = True
    return labels


def _compute_modularity(adj: dict[str, set[str]], degrees: dict[str, int],
                        nodes_list: list[str], m: int) -> float:
    """计算图模块度 Q 值"""
    if m == 0:
        return 0.0
    communities = _label_propagation(adj, nodes_list)
    Q = 0.0
    for a in nodes_list:
        for b in nodes_list:
            if a == b:
                continue
            A_ab = 1 if b in adj.get(a, set()) else 0
            k_a = degrees.get(a, 0)
            k_b = degrees.get(b, 0)
            expected = (k_a * k_b) / (2 * m)
            delta = 1 if communities.get(a) == communities.get(b) else 0
            Q += (A_ab - expected) * delta
    return Q / (2 * m)


def _compute_bridge_ratio(adj: dict[str, set[str]],
                          communities: dict[str, int]) -> float:
    """计算跨社区桥接节点占比"""
    if not communities:
        return 0.0
    bridges = 0
    for node, nbrs in adj.items():
        if not nbrs:
            continue
        node_comm = communities.get(node)
        other_comms = set()
        for nbr in nbrs:
            nbr_comm = communities.get(nbr)
            if nbr_comm != node_comm:
                other_comms.add(nbr_comm)
        if len(other_comms) >= 2:
            bridges += 1
    return bridges / len(adj) if adj else 0.0


def compute_all_metrics(networks: list[dict]) -> list[dict]:
    """为所有网络计算指标，返回 metrics 列表"""
    print("=" * 60)
    print("Phase 2: 网络指标计算与统计比较")
    print("=" * 60)
    print(f"加载 {len(networks)} 个网络")

    metrics_list = []
    for i, net in enumerate(networks):
        metrics = compute_network_metrics(net)
        metrics["entity_id"] = net["entity_id"]
        metrics["title"] = net["title"]
        metrics["genre"] = net["genre"]
        metrics_list.append(metrics)
        if i % 200 == 0:
            print(f"  进度: {i}/{len(networks)}")

    print(f"指标已保存: {METRICS_OUT}")
    return metrics_list


def run_statistical_comparison(metrics_list: list[dict]) -> dict:
    """
    对 8 项指标做 ANOVA + Kruskal-Wallis + Tukey HSD 比较。

    返回: 比较结果字典，含 per_metric 对比、key_findings。
    """
    METRIC_KEYS = [
        "density", "centralization", "clustering", "modularity",
        "degree_entropy", "bridge_ratio", "top2_concentration",
        "n_nodes", "n_edges",
    ]

    comparison = {"per_metric": {}, "key_findings": []}

    for metric_key in METRIC_KEYS:
        groups = {}
        group_values: dict[str, list[float]] = defaultdict(list)
        for m in metrics_list:
            genre = m.get("genre", "未分类")
            group_values[genre].append(m.get(metric_key, 0))

        sorted_genres = sorted(group_values.keys(),
                               key=lambda g: -len(group_values[g]))

        # ANOVA
        anova_result = None
        if len([g for g in sorted_genres if len(group_values[g]) >= 3]) >= 2:
            anova_groups = [array(group_values[g]) for g in sorted_genres]
            try:
                f_stat, anova_p = stats.f_oneway(*anova_groups)
                anova_result = {"F": round(f_stat, 4), "p": round(float(anova_p), 8)}
            except Exception:
                anova_result = {"F": 0, "p": 1.0}

        # Kruskal-Wallis
        kw_result = None
        valid_groups = [array(group_values[g]) for g in sorted_genres
                        if len(group_values[g]) >= 3]
        if len(valid_groups) >= 2:
            try:
                h_stat, kw_p = stats.kruskal(*valid_groups)
                kw_result = {"H": round(h_stat, 4), "p": round(float(kw_p), 8)}
            except Exception:
                kw_result = {"H": 0, "p": 1.0}

        # Tukey HSD
        tukey_result = None
        all_values = []
        all_labels = []
        for g in sorted_genres:
            all_values.extend(group_values[g])
            all_labels.extend([g] * len(group_values[g]))
        if len(sorted_genres) >= 2:
            try:
                tukey = pairwise_tukeyhsd(all_values, all_labels, alpha=0.05)
                pairs = []
                for res_line in str(tukey).split('\n')[3:]:
                    parts = res_line.split()
                    if len(parts) < 6 or parts[0] == '-' * 10:
                        continue
                    g1, g2 = parts[0], parts[1]
                    try:
                        p_val = float(parts[-1])
                    except ValueError:
                        continue
                    if p_val < 0.05:
                        diff = float(parts[4])
                        pairs.append({
                            "pair": [g1, g2],
                            "diff": round(diff, 4),
                            "p": round(p_val, 8),
                        })
                tukey_result = {
                    "significant_pairs": len(pairs),
                    "pairs": sorted(pairs, key=lambda x: x["p"])[:10],
                }
            except Exception:
                tukey_result = {"significant_pairs": 0, "pairs": []}

        means = {}
        for g in sorted_genres:
            vals = group_values[g]
            means[g] = round(np.mean(vals), 4) if vals else 0

        sorted_means = sorted(means.items(), key=lambda x: -x[1])
        max_type, max_val = sorted_means[0]
        min_type, min_val = sorted_means[-1]

        comparison["per_metric"][metric_key] = {
            "metric": metric_key,
            "label": METRIC_LABELS.get(metric_key, metric_key),
            "anova": anova_result,
            "kruskal_wallis": kw_result,
            "tukey": tukey_result,
            "type_means": means,
            "max_type": max_type,
            "max_value": max_val,
            "min_type": min_type,
            "min_value": min_val,
            "n_per_type": {g: len(group_values[g]) for g in sorted_genres},
        }

        sig_pairs = (tukey_result or {}).get("pairs", [])
        comparison["key_findings"].append({
            "metric": metric_key,
            "label": METRIC_LABELS.get(metric_key, metric_key),
            "max_type": max_type,
            "max_value": max_val,
            "min_type": min_type,
            "min_value": min_val,
            "p_value": anova_result.get("p") if anova_result else None,
            "significant_pairs": len(sig_pairs),
            "top_pairs": sig_pairs[:3],
        })

    print(f"比较结果已保存: {COMPARISON_OUT}")
    _print_key_findings(comparison)
    return comparison


def _print_key_findings(comparison: dict) -> None:
    """打印关键发现摘要"""
    print("\n===== 关键发现 =====")
    for f in comparison.get("key_findings", []):
        p = f.get("p_value")
        p_str = f"{p:.2e}" if p is not None else "N/A"
        print(f"\n**{f['label']}** (p={p_str}):")
        print(f"  最高: {f['max_type']} ({f['max_value']:.4f})")
        print(f"  最低: {f['min_type']} ({f['min_value']:.4f})")
        print(f"  显著差异对: {f['significant_pairs']} 对")
        for pair in f.get("top_pairs", [])[:3]:
            g1, g2 = pair["pair"]
            print(f"    {g1} vs {g2}: diff={pair['diff']:.4f}")


# ═══════════════════════════════════════════════════════════════════════
# Phase 3: 前端数据生成（PCA + 代表性网络 + 紧凑 JSON）
# ═══════════════════════════════════════════════════════════════════════

def build_frontend_data(networks: list[dict], metrics_list: list[dict]) -> dict:
    """
    生成前端 network-data.json：
      - type_means: 7 类型 × 8 指标均值
      - pca_points / pca_centroids: PCA 降维
      - rep_networks: 每类型 2 个代表性网络
      - key_findings / top_chars: 极值类型 + 枢纽角色排名
    """
    print("=" * 60)
    print("Phase 3: 前端数据生成")
    print("=" * 60)

    METRIC_KEYS = [
        "density", "centralization", "clustering", "modularity",
        "degree_entropy", "bridge_ratio", "top2_concentration",
    ]

    # 类型均值
    by_type = defaultdict(list)
    for m in metrics_list:
        genre = m.get("genre", "历史戏")
        by_type[genre].append(m)

    type_means = {}
    for genre in TYPE_ORDER:
        ms = by_type.get(genre, [])
        if ms:
            type_means[genre] = {
                key: round(np.mean([m.get(key, 0) for m in ms]), 4)
                for key in METRIC_KEYS
            }
            type_means[genre]["count"] = len(ms)

    # PCA (采样 500 本)
    rng = np.random.RandomState(42)
    indices = rng.choice(len(metrics_list), min(N_PCA_SAMPLES, len(metrics_list)),
                         replace=False)
    sampled = [metrics_list[i] for i in indices]
    X = array([[m.get(k, 0) for k in METRIC_KEYS] for m in sampled])
    # 标准化
    X_mean = X.mean(axis=0)
    X_std = X.std(axis=0) + 1e-10
    X_z = (X - X_mean) / X_std
    # SVD 降维
    U, S, Vt = np.linalg.svd(X_z, full_matrices=False)
    pc = U[:, :2] * S[:2]

    pca_points = []
    for i, idx in enumerate(indices):
        m = metrics_list[idx]
        pca_points.append({
            "entity_id": m["entity_id"],
            "title": m["title"],
            "genre": m["genre"],
            "pc1": round(float(pc[i, 0]), 4),
            "pc2": round(float(pc[i, 1]), 4),
            "n_chars": int(m.get("n_nodes", 0)),
            "n_edges": int(m.get("n_edges", 0)),
        })

    # PCA 质心
    pca_centroids = {}
    for genre in TYPE_ORDER:
        gpts = [p for p in pca_points if p["genre"] == genre]
        if gpts:
            pca_centroids[genre] = {
                "pc1": round(np.mean([p["pc1"] for p in gpts]), 4),
                "pc2": round(np.mean([p["pc2"] for p in gpts]), 4),
                "count": len(gpts),
            }

    # 代表性网络：每类型选 REP_PER_TYPE 本
    rep_networks = defaultdict(list)
    for net in networks:
        if net["total_characters"] >= 3:
            rep_networks[net["genre"]].append(net)

    for genre in rep_networks:
        rep_networks[genre].sort(
            key=lambda n: -(n["total_characters"] + n["total_edges"] * 0.5)
        )
        rep_networks[genre] = rep_networks[genre][:REP_PER_TYPE]

    # 关键发现
    key_findings = []
    for key in METRIC_KEYS:
        vals_by_type = [(g, v[key]) for g, v in type_means.items() if g in v]
        vals_by_type.sort(key=lambda x: -x[1])
        if vals_by_type:
            key_findings.append({
                "metric": key,
                "label": METRIC_LABELS[key],
                "max_type": vals_by_type[0][0],
                "max_value": round(vals_by_type[0][1], 4),
                "min_type": vals_by_type[-1][0],
                "min_value": round(vals_by_type[-1][1], 4),
                "all_values": {g: round(v, 4) for g, v in vals_by_type},
            })

    # 枢纽角色 Top-3
    top_chars = {}
    for genre in TYPE_ORDER:
        deg_counter = Counter()
        for net in networks:
            if net["genre"] == genre:
                for node in net.get("nodes", []):
                    deg_counter[node["name"]] += node.get("degree", 0)
        top_chars[genre] = [
            {"name": name, "total_degree": int(d)}
            for name, d in deg_counter.most_common(3)
        ]

    # 组装输出
    output = {
        "type_means": type_means,
        "type_colors": TYPE_COLORS,
        "type_order": TYPE_ORDER,
        "pca_points": pca_points,
        "pca_centroids": pca_centroids,
        "rep_networks": {g: nets for g, nets in rep_networks.items()},
        "key_findings": key_findings,
        "top_chars": top_chars,
        "metric_labels": METRIC_LABELS,
        "metric_order": METRIC_KEYS,
        "total_scripts": len(networks),
    }

    return output


def save_frontend_data(output: dict, output_path: Path = FRONTEND_OUT) -> None:
    """保存前端数据到 JSON"""
    with open(output_path, "w", encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    size_kb = output_path.stat().st_size / 1024
    print(f"前端数据已保存: {output_path} ({size_kb:.1f} KB)")


# ═══════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Task 2 — 角色关系网络处理管线")
    parser.add_argument("--step", type=int, choices=[1, 2, 3], default=None,
                        help="执行特定阶段 (1=共现提取, 2=指标+统计, 3=前端数据)")
    args = parser.parse_args()

    run_phase1 = args.step is None or args.step == 1
    run_phase2 = args.step is None or args.step == 2
    run_phase3 = args.step is None or args.step == 3

    # Phase 1
    if run_phase1:
        networks = build_cooccurrence_networks()
        save_networks(networks)
    else:
        with open(NETWORKS_OUT, encoding='utf-8') as f:
            networks = json.load(f)["networks"]
        print(f"加载已有网络: {len(networks)} 个")

    # Phase 2
    if run_phase2:
        metrics_list = compute_all_metrics(networks)
        with open(METRICS_OUT, "w", encoding='utf-8') as f:
            json.dump({"metrics": metrics_list, "total": len(metrics_list)}, f,
                      ensure_ascii=False, indent=2)
        comparison = run_statistical_comparison(metrics_list)
        with open(COMPARISON_OUT, "w", encoding='utf-8') as f:
            json.dump(comparison, f, ensure_ascii=False, indent=2)
    else:
        with open(METRICS_OUT, encoding='utf-8') as f:
            metrics_list = json.load(f)["metrics"]
        print(f"加载已有指标: {len(metrics_list)} 条")

    # Phase 3
    if run_phase3:
        frontend_data = build_frontend_data(networks, metrics_list)
        save_frontend_data(frontend_data)
        print_stats = True
        if print_stats:
            print(f"\n  Scripts: {frontend_data['total_scripts']}")
            print(f"  Types: {len(frontend_data['type_means'])}")
            print(f"  PCA points: {len(frontend_data['pca_points'])}")
            print(f"  Rep networks: {sum(len(v) for v in frontend_data['rep_networks'].values())}")

    print("\n✅ Task 2 全流程完成")


if __name__ == "__main__":
    main()
