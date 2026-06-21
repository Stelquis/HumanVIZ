"""
================================================================================
Step 5.5A: 网络中心化数值统计
================================================================================

为每部剧本计算网络中心化相关的底层数值指标。
三个图口径: full_graph | semantic_graph | active_graph
不在此步骤打任何结构标签。

数据来源: 单剧本网络.json.gz (已含 LLM 行当补全)
输出: data/processed/task2/network_by_type/centralization_metrics.json
================================================================================
"""

import json
import gzip
import sys
import statistics
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import networkx as nx

# ─── 路径配置 ───────────────────────────────────────────────
BASE_DIR = Path("/workspace/HumanVIZ")
DATA_DIR = BASE_DIR / "data" / "processed" / "task2" / "db_exports"
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"
SINGLE_NET_GZ = DATA_DIR / "单剧本网络.json.gz"


def ensure_output():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# Graph building
# ═══════════════════════════════════════════════════════════════

NEUTRAL_MACRO = {'中立'}
NEUTRAL_MICRO = {'同场', '其他中立', '萍水相逢'}


def build_graphs(play):
    """
    为一部剧本构建三个图: full, semantic, active.

    Returns:
        G_full, G_sem, G_active  (all networkx.Graph)
    """
    nodes = play['nodes']
    edges = play['edges']

    # ── full_graph: 所有节点 + 所有边 ──
    G_full = nx.Graph()
    for n in nodes:
        attrs = {k: v for k, v in n.items() if k not in ('id', 'name')}
        G_full.add_node(n['name'], id=n.get('id', n['name']), **attrs)
    for e in edges:
        attrs = {k: v for k, v in e.items() if k not in ('source', 'target')}
        G_full.add_edge(e['source'], e['target'], **attrs)

    # ── semantic_graph: 排除 中立/同场 边，保留所有节点 ──
    sem_edges = []
    for e in edges:
        macro = e.get('relation_type', '')
        micro = e.get('micro_type', '')
        if macro not in NEUTRAL_MACRO and micro not in NEUTRAL_MICRO:
            sem_edges.append(e)

    G_sem = nx.Graph()
    for n in nodes:
        attrs = {k: v for k, v in n.items() if k not in ('id', 'name')}
        G_sem.add_node(n['name'], id=n.get('id', n['name']), **attrs)
    for e in sem_edges:
        attrs = {k: v for k, v in e.items() if k not in ('source', 'target')}
        G_sem.add_edge(e['source'], e['target'], **attrs)

    # ── active_graph: 排除 degree=0 的孤立节点 ──
    G_full_unweighted = nx.Graph()
    for n in nodes:
        G_full_unweighted.add_node(n['name'])
    for e in edges:
        G_full_unweighted.add_edge(e['source'], e['target'])
    active_names = {n for n in G_full_unweighted.nodes() if G_full_unweighted.degree(n) > 0}

    active_edges = []
    for e in edges:
        if e['source'] in active_names and e['target'] in active_names:
            active_edges.append(e)

    G_active = nx.Graph()
    for n in nodes:
        if n['name'] in active_names:
            attrs = {k: v for k, v in n.items() if k not in ('id', 'name')}
            G_active.add_node(n['name'], id=n.get('id', n['name']), **attrs)
    for e in active_edges:
        attrs = {k: v for k, v in e.items() if k not in ('source', 'target')}
        G_active.add_edge(e['source'], e['target'], **attrs)

    return G_full, G_sem, G_active


# ═══════════════════════════════════════════════════════════════
# Metric computation for a single graph
# ═══════════════════════════════════════════════════════════════

def compute_graph_metrics(G):
    """
    给定一个 networkx.Graph，计算所有中心化相关指标。
    返回 dict。
    """
    n = G.number_of_nodes()
    m = G.number_of_edges()
    metrics = {'node_count': n, 'edge_count': m}

    # ── 基本计数 ──
    if n == 0:
        # 空图 (active_graph 可能为空)
        for key in ['active_node_count', 'isolated_node_count', 'active_node_ratio',
                     'isolated_node_ratio', 'top1_character', 'top2_character',
                     'top3_character', 'top1_degree_centrality', 'top2_degree_centrality',
                     'top3_degree_centrality', 'top1_top2_gap', 'top1_top2_ratio',
                     'top2_top3_gap', 'top3_centrality_share', 'top5_centrality_share',
                     'max_to_mean_centrality_ratio', 'degree_centralization',
                     'betweenness_centralization', 'largest_component_ratio',
                     'connected_components', 'edge_concentration_top1',
                     'edge_concentration_top3', 'top1_degree_raw', 'top2_degree_raw',
                     'top3_degree_raw', 'top1_betweenness_centrality',
                     'top2_betweenness_centrality', 'top3_betweenness_centrality']:
            metrics[key] = None
        return metrics

    # ── 度（raw） ──
    degrees = dict(G.degree())  # name → raw_degree
    deg_values = list(degrees.values())
    max_deg = max(deg_values) if deg_values else 0
    mean_deg = statistics.mean(deg_values) if deg_values else 0

    # 活跃/孤立
    active_count = sum(1 for d in deg_values if d > 0)
    isolated_count = n - active_count
    metrics['active_node_count'] = active_count
    metrics['isolated_node_count'] = isolated_count
    metrics['active_node_ratio'] = round(active_count / n, 6) if n > 0 else 0
    metrics['isolated_node_ratio'] = round(isolated_count / n, 6) if n > 0 else 0

    # ── 度中心性 (normalized 0-1) ──
    if n > 1:
        deg_cent = {name: d / (n - 1) for name, d in degrees.items()}
    else:
        deg_cent = {name: 0.0 for name in degrees}

    # ── 介数中心性 ──
    if m > 0 and n > 1:
        try:
            betw_cent = nx.betweenness_centrality(G, normalized=True)
        except Exception:
            betw_cent = {name: 0.0 for name in degrees}
    else:
        betw_cent = {name: 0.0 for name in degrees}

    # 排序节点（按度中心性降序，度相同时按介数）
    sorted_nodes = sorted(deg_cent.items(), key=lambda x: (-x[1], -betw_cent.get(x[0], 0)))

    # ── Top 角色信息 ──
    def get_node_attrs(name):
        """获取节点属性"""
        attrs = dict(G.nodes.get(name, {}))
        return {
            'name': name,
            'role_type': attrs.get('role_type', ''),
            'degree_centrality': round(deg_cent.get(name, 0), 6),
            'betweenness_centrality': round(betw_cent.get(name, 0), 6),
            'degree_raw': degrees.get(name, 0),
        }

    top1 = get_node_attrs(sorted_nodes[0][0]) if len(sorted_nodes) >= 1 else None
    top2 = get_node_attrs(sorted_nodes[1][0]) if len(sorted_nodes) >= 2 else None
    top3 = get_node_attrs(sorted_nodes[2][0]) if len(sorted_nodes) >= 3 else None

    # 同时获取 top5 的角色名以备后续使用
    def top_k_names(k):
        return [sorted_nodes[i][0] for i in range(min(k, len(sorted_nodes)))]

    top1_names = set(top_k_names(1))
    top3_names = set(top_k_names(3))

    metrics['top1_character'] = top1
    metrics['top2_character'] = top2
    metrics['top3_character'] = top3

    # ── 中心性数值 ──
    d1 = deg_cent.get(sorted_nodes[0][0], 0) if len(sorted_nodes) >= 1 else 0
    d2 = deg_cent.get(sorted_nodes[1][0], 0) if len(sorted_nodes) >= 2 else 0
    d3 = deg_cent.get(sorted_nodes[2][0], 0) if len(sorted_nodes) >= 3 else 0
    d5_sum = sum(deg_cent.get(sorted_nodes[i][0], 0) for i in range(min(5, len(sorted_nodes))))
    d_total = sum(deg_cent.values())

    b1 = betw_cent.get(sorted_nodes[0][0], 0) if len(sorted_nodes) >= 1 else 0

    metrics['top1_degree_centrality'] = round(d1, 6)
    metrics['top2_degree_centrality'] = round(d2, 6)
    metrics['top3_degree_centrality'] = round(d3, 6)
    metrics['top1_degree_raw'] = max_deg
    metrics['top2_degree_raw'] = degrees.get(sorted_nodes[1][0], 0) if len(sorted_nodes) >= 2 else 0
    metrics['top3_degree_raw'] = degrees.get(sorted_nodes[2][0], 0) if len(sorted_nodes) >= 3 else 0
    metrics['top1_betweenness_centrality'] = round(b1, 6)
    metrics['top2_betweenness_centrality'] = round(betw_cent.get(sorted_nodes[1][0], 0), 6) if len(sorted_nodes) >= 2 else 0
    metrics['top3_betweenness_centrality'] = round(betw_cent.get(sorted_nodes[2][0], 0), 6) if len(sorted_nodes) >= 3 else 0

    # ── Gaps and ratios ──
    if d1 > 0 and d2 is not None:
        metrics['top1_top2_gap'] = round(d1 - d2, 6)
        metrics['top1_top2_ratio'] = round(d1 / d2, 4) if d2 > 0 else None  # None = Top2 度=0
    else:
        metrics['top1_top2_gap'] = None
        metrics['top1_top2_ratio'] = None

    if d2 > 0 and d3 is not None and len(sorted_nodes) >= 3:
        metrics['top2_top3_gap'] = round(d2 - d3, 6)
    else:
        metrics['top2_top3_gap'] = None

    # Top-k 中心性占比
    metrics['top3_centrality_share'] = round(d1 + d2 + d3 / max(d_total, 0.0001), 6) if d_total > 0 else None

    # Actually the spec says top3_centrality_share = sum(top3_deg) / sum(all_deg)
    if d_total > 0 and len(sorted_nodes) >= 3:
        top3_sum = d1 + d2 + d3
        metrics['top3_centrality_share'] = round(top3_sum / d_total, 6)
    elif d_total > 0 and len(sorted_nodes) >= 1:
        topN_sum = sum(deg_cent.get(sorted_nodes[i][0], 0) for i in range(len(sorted_nodes)))
        metrics['top3_centrality_share'] = round(topN_sum / d_total, 6)
    else:
        metrics['top3_centrality_share'] = None

    if d_total > 0:
        top5_sum_actual = sum(deg_cent.get(sorted_nodes[i][0], 0) for i in range(min(5, len(sorted_nodes))))
        metrics['top5_centrality_share'] = round(top5_sum_actual / d_total, 6)
    else:
        metrics['top5_centrality_share'] = None

    # max_to_mean
    if mean_deg > 0:
        metrics['max_to_mean_centrality_ratio'] = round(max_deg / mean_deg, 4)
    else:
        metrics['max_to_mean_centrality_ratio'] = None  # 所有节点度=0

    # ── Freeman degree centralization ──
    if n > 2 and max_deg > 0:
        degree_diff_sum = sum(max_deg - d for d in deg_values)
        max_possible = (n - 1) * (n - 2)
        metrics['degree_centralization'] = round(degree_diff_sum / max_possible, 6) if max_possible > 0 else None
    else:
        # n <= 2: Freeman formula undefined, fall back to a simple ratio
        if n == 2 and len(deg_values) == 2:
            d0, d1 = deg_values[0], deg_values[1]
            metrics['degree_centralization'] = round(abs(d0 - d1) / max(d0 + d1, 1), 6)
        elif n == 1:
            metrics['degree_centralization'] = 0.0
        else:
            metrics['degree_centralization'] = 0.0

    # ── Freeman betweenness centralization ──
    if m > 0 and n > 2:
        betw_raw = {}
        for name in betw_cent:
            # Convert normalized → raw for Freeman formula
            betw_raw[name] = betw_cent[name] * ((n - 1) * (n - 2) / 2) if n > 2 else 0

        max_betw = max(betw_raw.values()) if betw_raw else 0
        if max_betw > 0:
            betw_diff_sum = sum(max_betw - b for b in betw_raw.values())
            # Denominator for undirected graph
            denom = (n - 1) ** 2 * (n - 2) / 2
            if denom > 0:
                metrics['betweenness_centralization'] = round(betw_diff_sum / denom, 6)
            else:
                metrics['betweenness_centralization'] = 0.0
        else:
            metrics['betweenness_centralization'] = 0.0
    else:
        metrics['betweenness_centralization'] = 0.0 if n <= 2 else 0.0

    # ── 连通性 ──
    if n > 0:
        components = list(nx.connected_components(G))
        metrics['connected_components'] = len(components)
        largest_size = max(len(c) for c in components) if components else 0
        metrics['largest_component_ratio'] = round(largest_size / n, 6)

        # Second/third component
        comp_sizes = sorted([len(c) for c in components], reverse=True)
        metrics['second_component_ratio'] = round(comp_sizes[1] / n, 6) if len(comp_sizes) >= 2 else 0
        metrics['third_component_ratio'] = round(comp_sizes[2] / n, 6) if len(comp_sizes) >= 3 else 0
    else:
        metrics['connected_components'] = 0
        metrics['largest_component_ratio'] = 0
        metrics['second_component_ratio'] = 0
        metrics['third_component_ratio'] = 0

    # ── Edge concentration ──
    # 边集中于 top1 / top3 节点的程度
    if m > 0:
        edges_on_top1 = 0
        edges_on_top3 = 0
        for u, v in G.edges():
            if u in top1_names or v in top1_names:
                edges_on_top1 += 1
            if u in top3_names or v in top3_names:
                edges_on_top3 += 1
        metrics['edge_concentration_top1'] = round(edges_on_top1 / m, 6)
        metrics['edge_concentration_top3'] = round(edges_on_top3 / m, 6)
    else:
        metrics['edge_concentration_top1'] = None
        metrics['edge_concentration_top3'] = None

    # ── Small component count (< 3 nodes) ──
    if n > 0:
        small_comps = sum(1 for c in components if len(c) < 3)
        metrics['small_component_count'] = small_comps
        metrics['small_component_ratio'] = round(small_comps / max(len(components), 1), 6)
    else:
        metrics['small_component_count'] = 0
        metrics['small_component_ratio'] = 0

    return metrics


# ═══════════════════════════════════════════════════════════════
# Top characters cross-scope relation type analysis
# ═══════════════════════════════════════════════════════════════

def get_top_relation_types(G, char_name):
    """获取与某角色的关系类型分布"""
    rel_types = Counter()
    for neighbor in G.neighbors(char_name):
        edge_data = G.get_edge_data(char_name, neighbor)
        rt = edge_data.get('relation_type', '')
        if rt:
            rel_types[rt] += 1
    return dict(rel_types.most_common(5))


def get_top1_top2_relation(G, top1_name, top2_name):
    """获取 Top1 和 Top2 之间的关系类型（如果存在边）"""
    if G.has_edge(top1_name, top2_name):
        edge_data = G.get_edge_data(top1_name, top2_name)
        return {
            'exists': True,
            'relation_type': edge_data.get('relation_type', ''),
            'micro_type': edge_data.get('micro_type', ''),
            'weight': edge_data.get('weight', 0),
        }
    return {'exists': False, 'relation_type': None, 'micro_type': None, 'weight': None}


# ═══════════════════════════════════════════════════════════════
# Main computation
# ═══════════════════════════════════════════════════════════════

def compute_all():
    print("=" * 70)
    print("Step 5.5A: 网络中心化数值统计")
    print(f"开始时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # ── Load data ──
    print("\n[1/3] 加载 单剧本网络.json.gz ...")
    with gzip.open(SINGLE_NET_GZ, 'rt', encoding='utf-8') as f:
        net_data = json.load(f)
    plays = net_data['plays']
    print(f"  ✓ {len(plays)} 部剧本")

    # ── Compute per play ──
    print(f"\n[2/3] 计算每部剧的中心化指标 ...")
    results = []
    compute_errors = []

    for i, play in enumerate(plays):
        if (i + 1) % 200 == 0:
            print(f"  进度: {i+1}/{len(plays)}")

        try:
            G_full, G_sem, G_active = build_graphs(play)

            full_metrics = compute_graph_metrics(G_full)
            sem_metrics = compute_graph_metrics(G_sem)
            active_metrics = compute_graph_metrics(G_active)

            # Top characters — from full_graph (most complete)
            top_chars = []
            sorted_full = sorted(
                [(name, full_metrics.get('top1_degree_centrality', 0)
                  if name == (full_metrics.get('top1_character') or {}).get('name') else 0)
                 for name in G_full.nodes()],
                key=lambda x: -G_full.degree(x[0])
            )
            # Better: use the full_metrics top characters
            for rank, key in enumerate(['top1_character', 'top2_character', 'top3_character'], 1):
                char = full_metrics.get(key)
                if char and char.get('name'):
                    tc = {
                        'rank': rank,
                        'name': char['name'],
                        'role_type': char['role_type'],
                        'full_graph': {
                            'degree_centrality': char['degree_centrality'],
                            'betweenness_centrality': char['betweenness_centrality'],
                            'degree_raw': char['degree_raw'],
                        }
                    }
                    # Add semantic/active scope centralities
                    sem_deg = dict(G_sem.degree()) if G_sem.number_of_nodes() > 0 else {}
                    active_deg = dict(G_active.degree()) if G_active.number_of_nodes() > 0 else {}
                    n_full = G_full.number_of_nodes()
                    n_sem = G_sem.number_of_nodes()
                    n_active = G_active.number_of_nodes()

                    tc['semantic_graph'] = {
                        'degree_raw': sem_deg.get(char['name'], 0),
                        'degree_centrality': round(sem_deg.get(char['name'], 0) / max(n_sem - 1, 1), 6) if n_sem > 1 else 0,
                    }
                    tc['active_graph'] = {
                        'degree_raw': active_deg.get(char['name'], 0),
                        'degree_centrality': round(active_deg.get(char['name'], 0) / max(n_active - 1, 1), 6) if n_active > 1 else 0,
                    }

                    # Relation type tendency (from full graph edges)
                    tc['relation_tendency'] = get_top_relation_types(G_full, char['name'])

                    top_chars.append(tc)

            # Top1-Top2 relation (for 双核心对抗型 判断 in 5.5B)
            top1_name = top_chars[0]['name'] if len(top_chars) >= 1 else None
            top2_name = top_chars[1]['name'] if len(top_chars) >= 2 else None
            top1_top2_rel = get_top1_top2_relation(G_full, top1_name, top2_name) if top1_name and top2_name else None

            entry = {
                'entity_id': play['entity_id'],
                'title': play['剧本名'],
                'play_type': play.get('剧目类型', ''),
                'full_graph': full_metrics,
                'semantic_graph': sem_metrics,
                'active_graph': active_metrics,
                'top_characters': top_chars,
                'top1_top2_relation': top1_top2_rel,
            }

            results.append(entry)

        except Exception as e:
            compute_errors.append({
                'entity_id': play['entity_id'],
                'title': play['剧本名'],
                'error': str(e),
            })
            # Create a minimal entry
            results.append({
                'entity_id': play['entity_id'],
                'title': play['剧本名'],
                'play_type': play.get('剧目类型', ''),
                'full_graph': {'node_count': len(play.get('nodes', [])),
                               'edge_count': len(play.get('edges', [])),
                               'error': str(e)},
                'semantic_graph': {},
                'active_graph': {},
                'top_characters': [],
                'top1_top2_relation': None,
                'compute_error': str(e),
            })

    print(f"  完成: {len(results)} 部剧, {len(compute_errors)} 个计算异常")

    # ── Aggregate summary ──
    print(f"\n[3/3] 生成汇总统计 ...")

    # Collect distributions
    deg_cent_values = []
    betw_cent_values = []
    top1_top2_gap_values = []
    for r in results:
        fg = r.get('full_graph', {})
        dc = fg.get('degree_centralization')
        bc = fg.get('betweenness_centralization')
        gap = fg.get('top1_top2_gap')
        if dc is not None:
            deg_cent_values.append(dc)
        if bc is not None:
            betw_cent_values.append(bc)
        if gap is not None:
            top1_top2_gap_values.append(gap)

    def dist_stats(values):
        if not values:
            return {}
        sv = sorted(values)
        nv = len(sv)
        return {
            'min': round(min(sv), 6),
            'max': round(max(sv), 6),
            'mean': round(statistics.mean(sv), 6),
            'median': round(statistics.median(sv), 6),
            'std': round(statistics.stdev(sv), 4) if nv > 1 else 0,
            'p25': round(sv[nv // 4], 6),
            'p75': round(sv[3 * nv // 4], 6),
            'count': nv,
        }

    # Count edge cases
    betw_all_zero = sum(1 for r in results
                        if r['full_graph'].get('betweenness_centralization') is not None
                        and r['full_graph']['betweenness_centralization'] == 0
                        and (r['full_graph'].get('node_count', 0) > 1))
    deg_cent_null = sum(1 for r in results
                        if r['full_graph'].get('degree_centralization') is None)
    edge_zero = sum(1 for r in results
                    if r['full_graph'].get('edge_count', 0) == 0)
    single_node = sum(1 for r in results
                      if r['full_graph'].get('node_count', 0) == 1)

    summary = {
        'total_plays': len(results),
        'compute_errors': len(compute_errors),
        'scope_definitions': {
            'full_graph': '包含所有节点和所有关系边（含中立/同场）',
            'semantic_graph': '排除 macro_type=中立 且 micro_type=同场/其他中立/萍水相逢 的边，保留所有节点',
            'active_graph': '排除 degree=0 的孤立节点及其关联边',
        },
        'freeman_note': 'Freeman公式在 n<=2 时无定义，此类剧使用简化公式或设为0',
        'global_distributions': {
            'degree_centralization': dist_stats(deg_cent_values),
            'betweenness_centralization': dist_stats(betw_cent_values),
            'top1_top2_gap': dist_stats(top1_top2_gap_values),
        },
        'edge_cases': {
            'betweenness_all_zero': betw_all_zero,
            'betweenness_all_zero_pct': round(betw_all_zero / len(results) * 100, 1),
            'degree_centralization_null': deg_cent_null,
            'edge_count_zero': edge_zero,
            'single_node_plays': single_node,
        }
    }

    output = {
        'meta': {
            'step': '5.5A',
            'generated_at': datetime.now().isoformat(),
            'source': '单剧本网络.json.gz',
            'networkx_version': nx.__version__,
            'description': '网络中心化数值统计 — 每部剧三个图口径的底层指标，无结构标签',
            'note': '此文件不包含任何结构标签，标签判定在 Step 5.5B',
        },
        'summary': summary,
        'plays': results,
    }

    # ── Write output ──
    ensure_output()
    out_path = OUTPUT_DIR / 'centralization_metrics.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓ 输出: {out_path}")
    print(f"     文件大小: {out_path.stat().st_size / 1024 / 1024:.1f} MB")

    # ── Print summary ──
    print("\n" + "=" * 70)
    print("Step 5.5A 完成摘要")
    print("=" * 70)
    print(f"""
  剧本数:           {len(results)}
  计算异常:         {len(compute_errors)}

  degree_centralization 分布 (full_graph):
    mean={summary['global_distributions']['degree_centralization'].get('mean', 'N/A')}
    median={summary['global_distributions']['degree_centralization'].get('median', 'N/A')}

  betweenness_centralization 分布 (full_graph):
    mean={summary['global_distributions']['betweenness_centralization'].get('mean', 'N/A')}
    median={summary['global_distributions']['betweenness_centralization'].get('median', 'N/A')}

  边界情况:
    betweenness 全零剧:    {betw_all_zero} ({round(betw_all_zero/len(results)*100,1)}%)
    degree_centralization=null: {deg_cent_null}
    edge_count=0:          {edge_zero}
    单节点剧:              {single_node}

  三个图口径:
    full_graph:     所有节点 + 所有边
    semantic_graph: 排除中立/同场边后
    active_graph:   排除孤立节点后

  下一步: Step 5.5B — 基于此文件的数值进行 rule-based 结构标签判定
""")

    return output


if __name__ == '__main__':
    compute_all()
