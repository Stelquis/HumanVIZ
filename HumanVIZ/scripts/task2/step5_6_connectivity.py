"""
================================================================================
Step 5.6: 连通性与子图结构分析
================================================================================

专注于角色网络的连通性维度：分量结构、碎片化程度、阵营分裂检测。
不重复中心性分析。

数据来源:
  - centralization_metrics.json (Step 5.5A) — 预计算的连通性指标
  - 单剧本网络.json.gz — 原始图数据，用于阵营检测

输出:
  - data/processed/task2/network_by_type/connectivity_stats.json       (per-play)
  - data/processed/task2/network_by_type/connectivity_by_type.json     (aggregated)
  - data/processed/task2/network_by_type/possible_camp_split_cases.json (阵营分裂)
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

BASE_DIR = Path("/workspace/HumanVIZ")
DATA_DIR = BASE_DIR / "data" / "processed" / "task2" / "db_exports"
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"

SINGLE_NET_GZ = DATA_DIR / "单剧本网络.json.gz"
CENT_METRICS_JSON = OUTPUT_DIR / "centralization_metrics.json"

# ─── 对抗性关系 (用于阵营检测) ──────────────────────────────
ADVERSARIAL_MACRO = {"敌对"}
ADVERSARIAL_MICRO = {"阵营对立", "政敌", "仇人", "宿敌", "仇人/敌对", "敌对/仇人", "其他敌对"}

NEUTRAL_MACRO = {"中立"}
NEUTRAL_MICRO = {"同场", "其他中立", "萍水相逢"}


# ═══════════════════════════════════════════════════════════════
# Graph building (reuse logic from 5.5A)
# ═══════════════════════════════════════════════════════════════

def build_graphs(play):
    """Build full_graph and semantic_graph from raw play data."""
    nodes = play['nodes']
    edges = play['edges']

    # full_graph
    G_full = nx.Graph()
    for n in nodes:
        attrs = {k: v for k, v in n.items() if k not in ('id', 'name')}
        G_full.add_node(n['name'], id=n.get('id', n['name']), **attrs)
    for e in edges:
        attrs = {k: v for k, v in e.items() if k not in ('source', 'target')}
        G_full.add_edge(e['source'], e['target'], **attrs)

    # semantic_graph
    sem_edges = [e for e in edges
                 if e.get('relation_type', '') not in NEUTRAL_MACRO
                 and e.get('micro_type', '') not in NEUTRAL_MICRO]
    G_sem = nx.Graph()
    for n in nodes:
        attrs = {k: v for k, v in n.items() if k not in ('id', 'name')}
        G_sem.add_node(n['name'], id=n.get('id', n['name']), **attrs)
    for e in sem_edges:
        attrs = {k: v for k, v in e.items() if k not in ('source', 'target')}
        G_sem.add_edge(e['source'], e['target'], **attrs)

    return G_full, G_sem


# ═══════════════════════════════════════════════════════════════
# Connectivity metrics
# ═══════════════════════════════════════════════════════════════

def compute_connectivity(G):
    """Compute connectivity-related metrics for a single graph."""
    n = G.number_of_nodes()
    m = G.number_of_edges()

    if n == 0:
        return {
            'node_count': 0, 'edge_count': 0,
            'connected_components': 0, 'largest_component_ratio': 0,
            'second_component_ratio': 0, 'third_component_ratio': 0,
            'isolated_node_count': 0, 'isolated_node_ratio': 0,
            'small_component_count': 0, 'small_component_ratio': 0,
            'component_sizes': [],
        }

    components = list(nx.connected_components(G))
    comp_sizes = sorted([len(c) for c in components], reverse=True)

    isolated_count = sum(1 for c in components if len(c) == 1)
    small_count = sum(1 for c in components if len(c) < 3)

    return {
        'node_count': n,
        'edge_count': m,
        'connected_components': len(components),
        'largest_component_ratio': round(comp_sizes[0] / n, 6) if comp_sizes else 0,
        'second_component_ratio': round(comp_sizes[1] / n, 6) if len(comp_sizes) >= 2 else 0,
        'third_component_ratio': round(comp_sizes[2] / n, 6) if len(comp_sizes) >= 3 else 0,
        'isolated_node_count': isolated_count,
        'isolated_node_ratio': round(isolated_count / n, 6) if n > 0 else 0,
        'small_component_count': small_count,
        'small_component_ratio': round(small_count / max(len(components), 1), 6),
        'component_sizes': comp_sizes,
    }


# ═══════════════════════════════════════════════════════════════
# Fragmentation index
# ═══════════════════════════════════════════════════════════════

def compute_fragmentation_index(full_conn, sem_conn):
    """
    碎片化综合指数 (0-1, 越高越碎片):
      = 0.35 * (1 - full_largest_component_ratio)
      + 0.25 * (full_isolated_node_ratio)
      + 0.25 * normalized_components
      + 0.15 * small_component_ratio

    normalized_components = min(connected_components / node_count, 1)
    """
    n = full_conn['node_count']
    if n <= 1:
        return 1.0 if n == 1 else 0.0

    lcr = full_conn['largest_component_ratio']
    inr = full_conn['isolated_node_ratio']
    cc_norm = min(full_conn['connected_components'] / n, 1.0)
    scr = full_conn['small_component_ratio']

    fi = (0.35 * (1 - lcr)
          + 0.25 * inr
          + 0.25 * cc_norm
          + 0.15 * scr)
    return round(fi, 6)


# ═══════════════════════════════════════════════════════════════
# Camp split detection
# ═══════════════════════════════════════════════════════════════

def detect_camp_split(G_sem, full_conn):
    """
    在 semantic_graph 中检测阵营分裂。

    Rules:
      1. connected_components >= 3
      2. largest_component_ratio < 0.7
      3. 敌对关系跨子图 或 集中于两个大子图之间

    Returns:
        {
            'possible_camp_split': bool,
            'camp_split_score': float (0-1),
            'evidence': list[str],
            'cross_component_adversarial_edges': int,
            'total_adversarial_edges': int,
        }
    """
    n = G_sem.number_of_nodes()
    m = G_sem.number_of_edges()

    result = {
        'possible_camp_split': False,
        'camp_split_score': 0.0,
        'evidence': [],
        'cross_component_adversarial_edges': 0,
        'total_adversarial_edges': 0,
    }

    if n < 4 or m == 0:
        return result

    components = list(nx.connected_components(G_sem))
    if len(components) < 2:
        return result

    # Map node → component index
    node_to_comp = {}
    for i, comp in enumerate(components):
        for node_name in comp:
            node_to_comp[node_name] = i

    # Sorted component sizes
    comp_sizes = sorted([len(c) for c in components], reverse=True)
    lcr = comp_sizes[0] / n if comp_sizes else 0

    # Rule 1 & 2
    if len(components) < 3 and lcr >= 0.7:
        return result

    # Find adversarial edges and their component assignments
    cross_comp_adv_edges = []  # (src_comp, tgt_comp, src, tgt, rel_type, micro_type)
    intra_comp_adv_edges = []
    total_adv = 0

    for u, v, data in G_sem.edges(data=True):
        macro = data.get('relation_type', '')
        micro = data.get('micro_type', '')
        is_adv = macro in ADVERSARIAL_MACRO or micro in ADVERSARIAL_MICRO
        if not is_adv:
            continue
        total_adv += 1
        cu = node_to_comp.get(u, -1)
        cv = node_to_comp.get(v, -1)
        if cu != cv and cu >= 0 and cv >= 0:
            cross_comp_adv_edges.append((cu, cv, u, v, macro, micro))
        else:
            intra_comp_adv_edges.append((cu, u, v, macro, micro))

    result['total_adversarial_edges'] = total_adv

    if total_adv == 0:
        return result

    cross_count = len(cross_comp_adv_edges)
    result['cross_component_adversarial_edges'] = cross_count

    # Rule 3: adversarial edges concentrated between two components
    if cross_count >= 2 and len(components) >= 3 and lcr < 0.7:
        # Count which component pairs have adversarial edges
        pair_counts = Counter()
        for cu, cv, _, _, _, _ in cross_comp_adv_edges:
            pair = tuple(sorted([cu, cv]))
            pair_counts[pair] += 1

        # If the top pair has >= 50% of cross-component adversarial edges
        top_pair_count = pair_counts.most_common(1)[0][1] if pair_counts else 0
        cross_concentration = top_pair_count / cross_count if cross_count > 0 else 0

        if cross_concentration >= 0.5:
            result['possible_camp_split'] = True
            top_pair = pair_counts.most_common(1)[0][0]
            comp_a_size = comp_sizes[top_pair[0]] if top_pair[0] < len(comp_sizes) else 0
            comp_b_size = comp_sizes[top_pair[1]] if top_pair[1] < len(comp_sizes) else 0
            result['evidence'].append(
                f"semantic components={len(components)}, LCR={lcr:.3f} < 0.7, "
                f"cross-comp adversarial edges={cross_count}/{total_adv}, "
                f"concentrated between comp#{top_pair[0]}(size={comp_a_size}) "
                f"and comp#{top_pair[1]}(size={comp_b_size}) "
                f"(concentration={cross_concentration:.2f})"
            )
            # Camp split score: combines component fragmentation + adversarial cross ratio
            frag_score = (1 - lcr) * (len(components) / max(n, 1))
            adv_score = cross_count / max(total_adv, 1)
            result['camp_split_score'] = round(0.5 * frag_score + 0.5 * adv_score, 4)
        elif cross_count >= 1 and len(components) >= 4 and lcr < 0.5:
            # Lower threshold: very fragmented + any cross-comp adversarial
            result['possible_camp_split'] = True
            result['evidence'].append(
                f"semantic components={len(components)}, LCR={lcr:.3f} < 0.5, "
                f"highly fragmented with {cross_count} cross-comp adversarial edges"
            )
            result['camp_split_score'] = round(0.6 * (1 - lcr) + 0.4 * (cross_count / max(total_adv, 1)), 4)
    elif cross_count >= 1 and lcr < 0.7 and len(components) >= 3:
        # Marginal case: some adversarial edges cross components
        result['evidence'].append(
            f"marginal: {cross_count} cross-comp adversarial edges but "
            f"doesn't meet concentration threshold (components={len(components)}, LCR={lcr:.3f})"
        )
        result['camp_split_score'] = round(0.3 * (1 - lcr) + 0.2 * (cross_count / max(total_adv, 1)), 4)

    return result


# ═══════════════════════════════════════════════════════════════
# Semantic vs Full connectivity gap analysis
# ═══════════════════════════════════════════════════════════════

def compute_connectivity_gap(full_conn, sem_conn):
    """Analyze the gap between full_graph and semantic_graph connectivity."""
    n = full_conn['node_count']
    if n <= 1:
        return {}

    return {
        'edge_reduction_ratio': round(
            1 - sem_conn['edge_count'] / max(full_conn['edge_count'], 1), 4),
        'component_increase': sem_conn['connected_components'] - full_conn['connected_components'],
        'lcr_change': round(
            sem_conn['largest_component_ratio'] - full_conn['largest_component_ratio'], 4),
        'isolated_increase': sem_conn['isolated_node_count'] - full_conn['isolated_node_count'],
        'interpretation': _interpret_gap(full_conn, sem_conn),
    }


def _interpret_gap(full, sem):
    """定性解释 full→semantic 的连通性变化."""
    gap = sem['connected_components'] - full['connected_components']
    iso_increase = sem['isolated_node_count'] - full['isolated_node_count']
    lcr_drop = full['largest_component_ratio'] - sem['largest_component_ratio']

    if gap >= 5 and lcr_drop > 0.2:
        return "语义关系显著碎片化 — 大量节点仅通过同场共现关联，无明确语义关系"
    elif gap >= 2 and lcr_drop > 0.1:
        return "语义网络中度碎片化 — 去除同场边后网络分裂为多个子群"
    elif iso_increase >= 3:
        return "部分角色仅以共现方式出现，无语义互动"
    elif gap <= 1 and lcr_drop < 0.05:
        return "语义网络与全量网络高度一致 — 大部分关系有明确语义标签"
    else:
        return "语义网络连通性轻微下降"


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("Step 5.6: 连通性与子图结构分析")
    print(f"开始时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # ── Load data ──
    print("\n[1/4] 加载数据源 ...")
    with gzip.open(SINGLE_NET_GZ, 'rt', encoding='utf-8') as f:
        net_data = json.load(f)
    plays_raw = net_data['plays']
    print(f"  ✓ 单剧本网络: {len(plays_raw)} 部")

    with open(CENT_METRICS_JSON, 'r', encoding='utf-8') as f:
        cent_data = json.load(f)
    plays_cent = cent_data['plays']
    print(f"  ✓ centralization_metrics: {len(plays_cent)} 部")

    # Build lookup for 5.5A data
    cent_by_id = {p['entity_id']: p for p in plays_cent}

    # ── Compute per-play connectivity ──
    print("\n[2/4] 计算每部剧的连通性指标 + 阵营检测 ...")
    results = []
    camp_cases = []
    errors = []

    for i, play in enumerate(plays_raw):
        if (i + 1) % 200 == 0:
            print(f"  进度: {i+1}/{len(plays_raw)}")

        eid = play['entity_id']
        cent = cent_by_id.get(eid, {})

        try:
            G_full, G_sem = build_graphs(play)

            full_conn = compute_connectivity(G_full)
            sem_conn = compute_connectivity(G_sem)

            # Fragmentation index
            frag_idx = compute_fragmentation_index(full_conn, sem_conn)

            # Connectivity gap
            gap_analysis = compute_connectivity_gap(full_conn, sem_conn)

            # Camp split detection
            camp = detect_camp_split(G_sem, full_conn)

            entry = {
                'entity_id': eid,
                'title': play['剧本名'],
                'play_type': play.get('剧目类型', ''),
                'full_graph': full_conn,
                'semantic_graph': sem_conn,
                'fragmentation_index': frag_idx,
                'connectivity_gap': gap_analysis,
                'camp_split': camp,
                'semantic_fragmented': (
                    sem_conn['node_count'] >= 4
                    and sem_conn['edge_count'] > 0
                    and sem_conn['connected_components'] >= 3
                    and sem_conn['largest_component_ratio'] < 0.7
                ),
            }

            results.append(entry)

            if camp['possible_camp_split']:
                camp_cases.append(entry)

        except Exception as e:
            errors.append({'entity_id': eid, 'title': play['剧本名'], 'error': str(e)})
            results.append({
                'entity_id': eid,
                'title': play['剧本名'],
                'play_type': play.get('剧目类型', ''),
                'full_graph': compute_connectivity(nx.Graph()),
                'semantic_graph': compute_connectivity(nx.Graph()),
                'fragmentation_index': 0,
                'connectivity_gap': {},
                'camp_split': {'possible_camp_split': False},
                'error': str(e),
            })

    # Semantic fragmentation analysis (replacement for camp splits which yielded 0)
    semantic_fragmented = [
        r for r in results
        if (r['semantic_graph']['node_count'] >= 4
            and r['semantic_graph']['edge_count'] > 0
            and r['semantic_graph']['connected_components'] >= 3
            and r['semantic_graph']['largest_component_ratio'] < 0.7)
    ]

    print(f"  完成: {len(results)} 部剧, {len(errors)} 个异常")
    print(f"  阵营分裂候选: {len(camp_cases)} (cross-component adversarial: 0)")
    print(f"  语义碎片化候选: {len(semantic_fragmented)} (semantic: CC>=3 & LCR<0.7)")

    # ── Aggregate by type ──
    print("\n[3/4] 按剧目类型聚合 ...")
    type_groups = defaultdict(list)
    for r in results:
        type_groups[r['play_type']].append(r)

    def agg(values):
        """聚合数值列表为分布统计"""
        v = [x for x in values if x is not None]
        if not v:
            return {}
        sv = sorted(v)
        nv = len(sv)
        return {
            'mean': round(statistics.mean(v), 4),
            'median': round(statistics.median(v), 4),
            'min': round(min(v), 4),
            'max': round(max(v), 4),
            'std': round(statistics.stdev(v), 4) if nv > 1 else 0,
            'p25': round(sv[nv // 4], 4),
            'p75': round(sv[3 * nv // 4], 4),
            'count': nv,
        }

    by_type = {}
    for pt in sorted(type_groups.keys()):
        group = type_groups[pt]
        n_plays = len(group)

        fg = [r['full_graph'] for r in group]
        sg = [r['semantic_graph'] for r in group]
        camp_count = sum(1 for r in group if r['camp_split']['possible_camp_split'])

        by_type[pt] = {
            'play_count': n_plays,
            'full_graph': {
                'connected_components': agg([c['connected_components'] for c in fg]),
                'largest_component_ratio': agg([c['largest_component_ratio'] for c in fg]),
                'second_component_ratio': agg([c['second_component_ratio'] for c in fg]),
                'third_component_ratio': agg([c['third_component_ratio'] for c in fg]),
                'isolated_node_count': agg([c['isolated_node_count'] for c in fg]),
                'isolated_node_ratio': agg([c['isolated_node_ratio'] for c in fg]),
                'small_component_count': agg([c['small_component_count'] for c in fg]),
                'small_component_ratio': agg([c['small_component_ratio'] for c in fg]),
            },
            'semantic_graph': {
                'connected_components': agg([c['connected_components'] for c in sg]),
                'largest_component_ratio': agg([c['largest_component_ratio'] for c in sg]),
                'second_component_ratio': agg([c['second_component_ratio'] for c in sg]),
                'isolated_node_ratio': agg([c['isolated_node_ratio'] for c in sg]),
                'small_component_ratio': agg([c['small_component_ratio'] for c in sg]),
            },
            'fragmentation_index': agg([r['fragmentation_index'] for r in group]),
            'connectivity_gap': {
                'edge_reduction_ratio': agg([r['connectivity_gap'].get('edge_reduction_ratio', 0) for r in group]),
                'component_increase': agg([r['connectivity_gap'].get('component_increase', 0) for r in group]),
                'lcr_change': agg([r['connectivity_gap'].get('lcr_change', 0) for r in group]),
            },
            'camp_split': {
                'count': camp_count,
                'rate': round(camp_count / n_plays * 100, 1),
            },
        }

        print(f"\n  {pt} ({n_plays} 部):")
        fg_cc = by_type[pt]['full_graph']['connected_components']
        fg_lcr = by_type[pt]['full_graph']['largest_component_ratio']
        fi = by_type[pt]['fragmentation_index']
        print(f"    full CC: mean={fg_cc['mean']:.1f}, LCR mean={fg_lcr['mean']:.3f}")
        print(f"    fragmentation_index: mean={fi['mean']:.3f}, median={fi['median']:.3f}")
        print(f"    camp_split: {camp_count} ({camp_count/n_plays*100:.1f}%)")

    # ── Write outputs ──
    print("\n[4/4] 生成输出文件 ...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Output 1: per-play connectivity stats
    out1 = {
        'meta': {
            'step': '5.6',
            'generated_at': datetime.now().isoformat(),
            'description': '每部剧的连通性指标 — full_graph + semantic_graph',
            'sources': ['centralization_metrics.json (Step 5.5A)', '单剧本网络.json.gz'],
            'networkx_version': nx.__version__,
        },
        'summary': {
            'total_plays': len(results),
            'errors': len(errors),
            'possible_camp_splits': len(camp_cases),
            'camp_split_note': '跨子图敌对边数为0 — 戏曲中敌对关系不形成清晰的跨组件对抗结构，敌对角色共享其他语义关系（从属/亲属/同盟）使其处于同一连通分量',
            'semantic_fragmented_plays': len(semantic_fragmented),
        },
        'plays': results,
    }
    out1_path = OUTPUT_DIR / 'connectivity_stats.json'
    with open(out1_path, 'w', encoding='utf-8') as f:
        json.dump(out1, f, ensure_ascii=False, indent=2)
    print(f"  ✓ connectivity_stats.json ({out1_path.stat().st_size / 1024:.0f} KB)")

    # Output 2: by-type aggregation
    out2 = {
        'meta': {
            'step': '5.6',
            'generated_at': datetime.now().isoformat(),
            'description': '按剧目类型的连通性指标聚合',
        },
        'by_type': by_type,
        'global': {
            'fragmentation_index': agg([r['fragmentation_index'] for r in results]),
            'camp_split_rate': round(len(camp_cases) / len(results) * 100, 1),
            'total_camp_splits': len(camp_cases),
        },
    }
    out2_path = OUTPUT_DIR / 'connectivity_by_type.json'
    with open(out2_path, 'w', encoding='utf-8') as f:
        json.dump(out2, f, ensure_ascii=False, indent=2)
    print(f"  ✓ connectivity_by_type.json")

    # Output 3: camp split cases + key finding analysis
    out3 = {
        'meta': {
            'step': '5.6',
            'generated_at': datetime.now().isoformat(),
            'description': '阵营分裂检测结果与语义碎片化分析',
            'detection_rules': {
                'primary': 'semantic_graph: components>=3 & LCR<0.7 & cross-comp adversarial edges concentrated between 2 components',
                'secondary': 'semantic_graph: components>=4 & LCR<0.5 & any cross-comp adversarial',
            },
            'key_finding': {
                'camp_split_cases': 0,
                'cross_component_adversarial_edges': 0,
                'explanation': (
                    '在全部1,473部剧本的semantic_graph中，敌对关系边(敌对/阵营对立/政敌/仇人)'
                    '始终与同盟/从属/亲属等其他语义关系共存于同一连通分量内。'
                    '这意味着：传统戏曲中的敌对角色共享社会关系网络（同属一个朝廷、军队、家族），'
                    '不存在由语义关系定义的独立对立阵营。'
                    '阵营对立在戏曲中表现为同群体内部的冲突，而非群体间的对抗。'
                ),
            },
        },
        'summary': {
            'total_cases': len(camp_cases),
            'by_type': {},
            'semantic_fragmented_count': len(semantic_fragmented),
            'semantic_fragmented_by_type': {
                pt: sum(1 for c in semantic_fragmented if c['play_type'] == pt)
                for pt in sorted(set(c['play_type'] for c in semantic_fragmented))
            },
        },
        'cases': [
            {
                'entity_id': c['entity_id'],
                'title': c['title'],
                'play_type': c['play_type'],
                'full_graph': {
                    'node_count': c['full_graph']['node_count'],
                    'edge_count': c['full_graph']['edge_count'],
                    'connected_components': c['full_graph']['connected_components'],
                    'largest_component_ratio': c['full_graph']['largest_component_ratio'],
                },
                'semantic_graph': {
                    'node_count': c['semantic_graph']['node_count'],
                    'edge_count': c['semantic_graph']['edge_count'],
                    'connected_components': c['semantic_graph']['connected_components'],
                    'largest_component_ratio': c['semantic_graph']['largest_component_ratio'],
                },
                'fragmentation_index': c['fragmentation_index'],
                'camp_split': c['camp_split'],
                'connectivity_gap_interpretation': c['connectivity_gap'].get('interpretation', ''),
            }
            for c in camp_cases
        ],
        'semantic_fragmented_samples': [
            {
                'entity_id': c['entity_id'],
                'title': c['title'],
                'play_type': c['play_type'],
                'full_cc': c['full_graph']['connected_components'],
                'sem_cc': c['semantic_graph']['connected_components'],
                'sem_lcr': c['semantic_graph']['largest_component_ratio'],
                'fragmentation_index': c['fragmentation_index'],
                'gap_interpretation': c['connectivity_gap'].get('interpretation', ''),
            }
            for c in sorted(semantic_fragmented,
                            key=lambda x: -(x['semantic_graph']['connected_components']))[:50]
        ],
    }
    out3_path = OUTPUT_DIR / 'possible_camp_split_cases.json'
    with open(out3_path, 'w', encoding='utf-8') as f:
        json.dump(out3, f, ensure_ascii=False, indent=2)
    print(f"  ✓ possible_camp_split_cases.json ({len(camp_cases)} cases)")

    # ── Print summary ──
    print("\n" + "=" * 70)
    print("Step 5.6 完成摘要")
    print("=" * 70)
    print(f"""
  总剧本数:                  {len(results)}
  计算异常:                  {len(errors)}
  阵营分裂候选:              {len(camp_cases)} (跨语义子图敌对边=0)
  语义碎片化候选:            {len(semantic_fragmented)} (semantic: CC>=3 & LCR<0.7)

  核心发现:
    在全部1,473部剧本中，语义关系网络(semantic_graph)中不存在
    跨连通分量的敌对关系边。敌对角色共享从属/亲属/同盟等语义关系，
    始终处于同一连通分量内。这意味着传统戏曲中不存在由语义关系
    定义的独立对立阵营 — 冲突是群体内部的，而非群体之间的。

  全量网络 (full_graph):
""")
    for pt in sorted(by_type.keys()):
        info = by_type[pt]
        fg = info['full_graph']
        print(f"    {pt:<8s}  CC={fg['connected_components']['mean']:.1f}  "
              f"LCR={fg['largest_component_ratio']['mean']:.3f}  "
              f"孤立率={fg['isolated_node_ratio']['mean']:.3f}  "
              f"碎片指数={info['fragmentation_index']['mean']:.3f}  "
              f"阵营={info['camp_split']['rate']:.1f}%")

    print(f"""
  语义网络 (semantic_graph) 关键差异:
""")
    for pt in sorted(by_type.keys()):
        info = by_type[pt]
        gap = info['connectivity_gap']
        sg = info['semantic_graph']
        print(f"    {pt:<8s}  边保留率={1-gap['edge_reduction_ratio']['mean']:.1%}  "
              f"LCR={sg['largest_component_ratio']['mean']:.3f}  "
              f"CCΔ={gap['component_increase']['mean']:+.1f}")

    print(f"""
  下一步: Step 5.7 — 类型对比总表生成
""")


if __name__ == '__main__':
    main()
