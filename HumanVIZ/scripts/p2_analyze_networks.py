"""
Task 2 Phase 2: 网络指标计算 + 剧目类型统计比较
加载 p2_networks.json，计算多维度网络结构指标，按类型做统计检验

输出:
  /workspace/HumanVIZ/data/p2_metrics.json        — 每本剧本的完整指标
  /workspace/HumanVIZ/data/p2_type_comparison.json — 类型间比较结果
"""

import json
import numpy as np
from collections import Counter, defaultdict
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd
from tqdm import tqdm

INPUT_PATH = "/workspace/HumanVIZ/data/p2_networks.json"
OUTPUT_METRICS = "/workspace/HumanVIZ/data/p2_metrics.json"
OUTPUT_COMPARISON = "/workspace/HumanVIZ/data/p2_type_comparison.json"


def edge_list_to_adj(nodes, edges):
    """转邻接矩阵 (networkx 太重, 直接用 numpy)"""
    name_to_idx = {n['name']: i for i, n in enumerate(nodes)}
    n = len(nodes)
    adj = np.zeros((n, n))
    for e in edges:
        i = name_to_idx.get(e['source'])
        j = name_to_idx.get(e['target'])
        if i is not None and j is not None:
            adj[i, j] = e['weight']
            adj[j, i] = e['weight']
    return adj, name_to_idx


def compute_metrics(nodes, edges):
    """计算 8 个网络结构指标"""
    n = len(nodes)
    m = len(edges)
    if n < 2 or m == 0:
        return {
            'density': 0, 'centralization': 0, 'clustering': 0,
            'modularity': 0, 'diameter': 0, 'degree_entropy': 0,
            'bridge_ratio': 0, 'top2_concentration': 0,
            'n_nodes': n, 'n_edges': m, 'n_communities': max(1, n),
        }

    adj, _ = edge_list_to_adj(nodes, edges)

    # ---- 1. 密度 ----
    max_edges = n * (n - 1) / 2
    density = m / max_edges

    # ---- 2. 度中心性偏离度 ----
    degrees = adj.sum(axis=1)
    avg_deg = degrees.mean()
    max_deg = degrees.max()
    centralization = (max_deg - avg_deg) / max(avg_deg, 1)

    # ---- 3. 加权聚类系数 ----
    # 简化: 基于邻接矩阵的二元聚类系数
    clustering_vals = []
    for i in range(n):
        neighbors = np.where(adj[i] > 0)[0]
        k = len(neighbors)
        if k < 2:
            clustering_vals.append(0)
        else:
            sub = adj[np.ix_(neighbors, neighbors)]
            actual = (sub > 0).sum() / 2
            possible = k * (k - 1) / 2
            clustering_vals.append(actual / possible if possible > 0 else 0)
    clustering = np.mean(clustering_vals)

    # ---- 4. 模块度 (基于 Louvain 简化: 贪心社区检测) ----
    # 用简化的标签传播法
    communities = label_propagation(adj)
    modularity = compute_modularity(adj, communities)

    # ---- 5. 有效直径 (90% 百分位最短路径) ----
    diameter = 0
    if n <= 200:  # 太大跳过完整路径计算
        try:
            dist = floyd_warshall(adj)
            finite = dist[dist < 1e9]
            if len(finite) > 0:
                diameter = float(np.percentile(finite, 90))
        except:
            diameter = 0

    # ---- 6. 度分布熵 ----
    if degrees.sum() > 0:
        deg_prob = degrees / degrees.sum()
        degree_entropy = -np.sum(deg_prob[deg_prob > 0] * np.log(deg_prob[deg_prob > 0]))
        degree_entropy = degree_entropy / np.log(n) if n > 1 else 0  # 归一化
    else:
        degree_entropy = 0

    # ---- 7. 桥接节点比 (度 > 均值 且 有多社区邻居) ----
    if len(set(communities)) > 1:
        bridge_count = 0
        for i in range(n):
            if degrees[i] > avg_deg:
                neighbor_comms = set(communities[j] for j in range(n) if adj[i, j] > 0)
                if len(neighbor_comms) > 1:
                    bridge_count += 1
        bridge_ratio = bridge_count / n
    else:
        bridge_ratio = 0

    # ---- 8. Top-2 边集中度 ----
    if edges:
        weights = sorted([e['weight'] for e in edges], reverse=True)
        top2_weight = sum(weights[:2]) if len(weights) >= 2 else sum(weights)
        total_weight = sum(weights)
        top2_concentration = top2_weight / max(total_weight, 1)
    else:
        top2_concentration = 0

    return {
        'density': round(density, 6),
        'centralization': round(centralization, 4),
        'clustering': round(clustering, 4),
        'modularity': round(modularity, 4),
        'diameter': round(diameter, 2),
        'degree_entropy': round(degree_entropy, 4),
        'bridge_ratio': round(bridge_ratio, 4),
        'top2_concentration': round(top2_concentration, 4),
        'n_nodes': n,
        'n_edges': m,
        'n_communities': len(set(communities)) if communities else 0,
    }


def label_propagation(adj, max_iter=50):
    """简化的标签传播社区检测"""
    n = len(adj)
    labels = list(range(n))
    for _ in range(max_iter):
        changed = False
        order = np.random.permutation(n)
        for i in order:
            neighbors = np.where(adj[i] > 0)[0]
            if len(neighbors) == 0:
                continue
            # 取邻居中最常见的标签
            neighbor_labels = Counter(labels[j] for j in neighbors)
            best_label = neighbor_labels.most_common(1)[0][0]
            if labels[i] != best_label:
                labels[i] = best_label
                changed = True
        if not changed:
            break
    return labels


def compute_modularity(adj, labels):
    """计算模块度 Q"""
    n = len(adj)
    m = adj.sum() / 2
    if m == 0:
        return 0
    Q = 0
    for i in range(n):
        for j in range(n):
            if labels[i] == labels[j]:
                expected = adj[i].sum() * adj[j].sum() / (2 * m)
                Q += adj[i, j] - expected
    return Q / (2 * m)


def floyd_warshall(adj):
    """Floyd-Warshall 全对最短路径 (二元邻接)"""
    n = len(adj)
    dist = np.full((n, n), 1e9)
    np.fill_diagonal(dist, 0)
    binary = (adj > 0).astype(float)
    for i in range(n):
        for j in range(n):
            if binary[i, j] > 0:
                dist[i, j] = 1
    for k in range(n):
        dk = dist[k]
        for i in range(n):
            dik = dist[i, k]
            if dik < 1e9:
                dist[i] = np.minimum(dist[i], dik + dk)
    return dist


def statistical_comparison(metrics_list):
    """按剧目类型做统计比较"""
    # 分组
    type_groups = defaultdict(list)
    for rec in metrics_list:
        g = rec['genre']
        if g:
            type_groups[g].append(rec)

    metric_keys = ['density', 'centralization', 'clustering', 'modularity',
                   'degree_entropy', 'bridge_ratio', 'top2_concentration',
                   'n_nodes', 'n_edges']

    comparison = {}
    for key in metric_keys:
        groups = {g: [r[key] for r in recs] for g, recs in type_groups.items() if len(recs) >= 5}

        # ANOVA
        group_vals = list(groups.values())
        if len(group_vals) >= 2:
            f_stat, p_anova = stats.f_oneway(*group_vals)
        else:
            f_stat, p_anova = 0, 1

        # Kruskal-Wallis
        if len(group_vals) >= 2:
            h_stat, p_kw = stats.kruskal(*group_vals)
        else:
            h_stat, p_kw = 0, 1

        # 均值对比
        means = {g: np.mean(vals) for g, vals in groups.items()}
        stds = {g: np.std(vals) for g, vals in groups.items()}

        # Tukey HSD (如果 ANOVA 显著)
        tukey_results = []
        if p_anova < 0.05 and len(group_vals) >= 3:
            all_vals = []
            all_labels = []
            for g, vals in groups.items():
                all_vals.extend(vals)
                all_labels.extend([g] * len(vals))
            try:
                tukey = pairwise_tukeyhsd(all_vals, all_labels, alpha=0.05)
                for row in str(tukey).split('\n')[2:]:
                    parts = row.split()
                    if len(parts) >= 7 and parts[-1] == 'True':
                        tukey_results.append({
                            'group1': parts[0],
                            'group2': parts[1],
                            'meandiff': float(parts[2]),
                            'p_adj': float(parts[3]),
                        })
            except:
                pass

        comparison[key] = {
            'anova_f': round(f_stat, 4),
            'anova_p': round(p_anova, 6),
            'kw_h': round(h_stat, 4),
            'kw_p': round(p_kw, 6),
            'means': {g: round(v, 4) for g, v in means.items()},
            'stds': {g: round(v, 4) for g, v in stds.items()},
            'significant_pairs': tukey_results,
        }

    return comparison


def main():
    print("=" * 60)
    print("Task 2 Phase 2: 网络指标计算 + 统计比较")
    print("=" * 60)

    with open(INPUT_PATH, encoding='utf-8') as f:
        data = json.load(f)

    networks = data['networks']
    print(f"加载 {len(networks)} 个网络")

    # 计算指标
    metrics_list = []
    for net in tqdm(networks, desc="计算网络指标", unit="本"):
        metrics = compute_metrics(net['nodes'], net['edges'])
        metrics_list.append({
            'entity_id': net['entity_id'],
            'title': net['title'],
            'genre': net['genre'],
            'source_category': net['source_category'],
            'n_nodes': metrics['n_nodes'],
            'n_edges': metrics['n_edges'],
            'density': metrics['density'],
            'centralization': metrics['centralization'],
            'clustering': metrics['clustering'],
            'modularity': metrics['modularity'],
            'diameter': metrics['diameter'],
            'degree_entropy': metrics['degree_entropy'],
            'bridge_ratio': metrics['bridge_ratio'],
            'top2_concentration': metrics['top2_concentration'],
            'n_communities': metrics['n_communities'],
        })

    # 保存指标
    with open(OUTPUT_METRICS, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(metrics_list),
            'metrics': metrics_list,
        }, f, ensure_ascii=False, indent=2)
    print(f"指标已保存: {OUTPUT_METRICS}")

    # 统计比较
    comparison = statistical_comparison(metrics_list)

    with open(OUTPUT_COMPARISON, 'w', encoding='utf-8') as f:
        json.dump({
            'metric_keys': list(comparison.keys()),
            'comparison': comparison,
        }, f, ensure_ascii=False, indent=2)
    print(f"比较结果已保存: {OUTPUT_COMPARISON}")

    # 打印关键发现
    print("\n===== 关键发现 =====")
    for key, comp in comparison.items():
        if comp['anova_p'] < 0.01:
            sig_pairs = comp['significant_pairs']
            means = comp['means']
            # 找最大和最小
            sorted_means = sorted(means.items(), key=lambda x: x[1])
            print(f"\n**{key}** (p={comp['anova_p']:.2e}):")
            print(f"  最高: {sorted_means[-1][0]} ({sorted_means[-1][1]:.4f})")
            print(f"  最低: {sorted_means[0][0]} ({sorted_means[0][1]:.4f})")
            if sig_pairs:
                print(f"  显著差异对: {len(sig_pairs)} 对")
                for sp in sig_pairs[:3]:
                    print(f"    {sp['group1']} vs {sp['group2']}: diff={sp['meandiff']:.4f}")


if __name__ == '__main__':
    main()
