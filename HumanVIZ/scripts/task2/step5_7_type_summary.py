"""
================================================================================
Step 5.7: 类型对比总表生成
================================================================================

汇总 Step 5.2-5.6 的所有统计结果，为每种剧目类型生成统一的数据对象。

数据来源:
  - basic_stats.json (Step 5.2)
  - relation_type_distribution.json (Step 5.3)
  - core_role_hangdang_distribution.json (Step 5.4)
  - role_type_completion_audit.json (Step 5.4)
  - centralization_metrics.json (Step 5.5A)
  - network_structure_labels.json + by_type.json (Step 5.5B)
  - connectivity_stats.json + by_type.json (Step 5.6)

输出:
  - data/processed/task2/network_by_type/type_comparison_summary.json
================================================================================
"""

import json
from collections import Counter
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/workspace/HumanVIZ")
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"

# ─── 所有数据源路径 ──────────────────────────────────────────
def path(fname):
    return OUTPUT_DIR / fname

SOURCES = {
    'basic_stats':               path('basic_stats.json'),
    'relation_type_dist':        path('relation_type_distribution.json'),
    'core_role_hangdang':        path('core_role_hangdang_distribution.json'),
    'role_type_completion':      path('role_type_completion_audit.json'),
    'centralization':            path('centralization_metrics.json'),
    'structure_labels':          path('network_structure_labels.json'),
    'structure_by_type':         path('network_structure_by_type.json'),
    'connectivity_stats':        path('connectivity_stats.json'),
    'connectivity_by_type':      path('connectivity_by_type.json'),
}

PLAY_TYPES = ['历史戏', '家庭戏', '公案戏', '爱情戏', '侠义戏', '神话戏', '技法展示戏']

SMALL_SAMPLE_THRESHOLD = 30  # n < 30 → small_sample_warning


def load(fname):
    with open(SOURCES[fname], 'r', encoding='utf-8') as f:
        return json.load(f)


# ═══════════════════════════════════════════════════════════════
# 置信度评定
# ═══════════════════════════════════════════════════════════════

def assess_confidence(play_type, sample_size, role_type_completion_rate, sem_enrichment):
    """综合评定各维度的置信度。"""
    conf = {}

    # sample size
    if sample_size >= 200:
        conf['sample_confidence'] = 'high'
    elif sample_size >= 50:
        conf['sample_confidence'] = 'medium'
    else:
        conf['sample_confidence'] = 'low'

    # role_type
    if role_type_completion_rate >= 60:
        conf['role_type_confidence'] = 'high'
    elif role_type_completion_rate >= 40:
        conf['role_type_confidence'] = 'medium'
    else:
        conf['role_type_confidence'] = 'low'

    # structure
    if sample_size >= 100:
        conf['structure_confidence'] = 'high'
    elif sample_size >= 30:
        conf['structure_confidence'] = 'medium'
    else:
        conf['structure_confidence'] = 'low'

    # connectivity
    if sample_size >= 50:
        conf['connectivity_confidence'] = 'high'
    else:
        conf['connectivity_confidence'] = 'medium'

    conf['overall_confidence'] = conf['sample_confidence']

    # 置信度说明
    conf['notes'] = []
    if sample_size < SMALL_SAMPLE_THRESHOLD:
        conf['notes'].append(f"样本量 {sample_size} < {SMALL_SAMPLE_THRESHOLD}，统计指标仅供参考")
    if role_type_completion_rate < 50:
        conf['notes'].append(f"行当覆盖率仅 {role_type_completion_rate:.0f}%，核心角色行当分析置信度受限")

    return conf


# ═══════════════════════════════════════════════════════════════
# 提取器: 从各数据源提取所需字段
# ═══════════════════════════════════════════════════════════════

def safe_num(d, key, default=0):
    """安全提取数值"""
    v = d.get(key)
    return v if v is not None else default


def pick_mean_median(obj):
    """从分布统计对象中提取 mean 和 median"""
    if not obj:
        return None, None
    return obj.get('mean'), obj.get('median')


def extract_scale(basic_stats):
    """从 basic_stats.json 提取规模指标"""
    by_type = basic_stats['by_type']
    result = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        fg = by_type[pt].get('full_graph', {})
        node_mean, node_median = pick_mean_median(fg.get('node_count', {}))
        edge_mean, edge_median = pick_mean_median(fg.get('edge_count', {}))
        result[pt] = {
            'avg_character_count': round(node_mean, 2) if node_mean else None,
            'median_character_count': round(node_median, 2) if node_median else None,
            'avg_relation_count': round(edge_mean, 2) if edge_mean else None,
            'median_relation_count': round(edge_median, 2) if edge_median else None,
            'play_count': by_type[pt].get('play_count', 0),
        }
    return result


def extract_density(basic_stats):
    """从 basic_stats.json 提取密度指标"""
    by_type = basic_stats['by_type']
    result = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        fg = by_type[pt].get('full_graph', {})
        dens_mean, dens_median = pick_mean_median(fg.get('density', {}))
        clust_mean, _ = pick_mean_median(fg.get('avg_clustering', {}))
        result[pt] = {
            'avg_density': round(dens_mean, 4) if dens_mean else None,
            'median_density': round(dens_median, 4) if dens_median else None,
            'avg_clustering': round(clust_mean, 4) if clust_mean else None,
        }
    return result


def extract_relations(rel_dist):
    """从 relation_type_distribution.json 提取关系类型"""
    by_type = rel_dist['by_type']
    result = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        info = by_type[pt]

        # All relations top types
        all_rel = info.get('all_relations', {})
        all_top = [r['type'] for r in all_rel.get('macro_top5', [])] if all_rel else []

        # Semantic relations top types
        sem_rel = info.get('semantic_relations', {})
        sem_top = [r['type'] for r in sem_rel.get('macro_top5', [])] if sem_rel else []

        # Semantic enrichment (float)
        enrichment = info.get('semantic_enrichment', 0)
        total_edges = info.get('total_edges', 0)
        semantic_edges = info.get('semantic_edges', 0)

        result[pt] = {
            'total_edges': total_edges,
            'semantic_edges': semantic_edges,
            'semantic_edge_ratio': round(semantic_edges / max(total_edges, 1), 3),
            'all_relations_top': all_top,
            'semantic_relations_top': sem_top,
            'mean_semantic_enrichment': round(enrichment, 3) if enrichment else 0,
        }
    return result


def extract_core_roles(hangdang_dist, completion_audit):
    """提取核心角色行当分布"""
    hangdang = hangdang_dist.get('hangdang_distribution', {})
    protagonist = hangdang_dist.get('single_protagonist_analysis', {})
    by_type_comp = completion_audit.get('by_type', {})

    result = {}
    for pt in PLAY_TYPES:
        hd = hangdang.get(pt, {})
        sp = protagonist.get(pt, {})
        comp = by_type_comp.get(pt, {})

        # Dominant hangdang
        dominant_raw = hd.get('dominant_hangdang', [])
        if dominant_raw and isinstance(dominant_raw[0], list):
            dominant = [d[0] for d in dominant_raw[:3]]
        else:
            dominant = dominant_raw[:3] if isinstance(dominant_raw, list) else []

        # Single protagonist ratio (float)
        sp_ratio = sp.get('single_protagonist_ratio', 0) if isinstance(sp, dict) else (sp if isinstance(sp, (int, float)) else 0)

        # Completion rate
        completion_rate = comp.get('completion_rate', 0)

        result[pt] = {
            'dominant_role_types': dominant,
            'role_type_completion_rate': round(completion_rate, 1),
            'single_protagonist_ratio': round(sp_ratio, 3) if sp_ratio else 0,
        }
    return result


def extract_centralization(cent_metrics):
    """从 centralization_metrics.json 按类型聚合中心化指标"""
    plays = cent_metrics['plays']
    # Aggregate per type
    by_type = {pt: {
        'deg_cent': [], 'betw_cent': [], 'gap': [], 'ratio': [],
        't3s': [], 'mmr': [], 'ec_top1': [], 'ec_top3': [],
    } for pt in PLAY_TYPES}

    import statistics

    for p in plays:
        pt = p['play_type']
        if pt not in by_type:
            continue
        fg = p.get('full_graph', {})
        for key, field in [('deg_cent', 'degree_centralization'),
                          ('betw_cent', 'betweenness_centralization'),
                          ('gap', 'top1_top2_gap'),
                          ('ratio', 'top1_top2_ratio'),
                          ('t3s', 'top3_centrality_share'),
                          ('mmr', 'max_to_mean_centrality_ratio'),
                          ('ec_top1', 'edge_concentration_top1'),
                          ('ec_top3', 'edge_concentration_top3')]:
            v = fg.get(field)
            if v is not None:
                by_type[pt][key].append(v)

    result = {}
    for pt in PLAY_TYPES:
        vals = by_type[pt]
        def s(lst):
            if not lst:
                return None, None
            return round(statistics.mean(lst), 4), round(statistics.median(lst), 4)

        deg_m, deg_med = s(vals['deg_cent'])
        gap_m, gap_med = s(vals['gap'])
        t3s_m, t3s_med = s(vals['t3s'])
        mmr_m, mmr_med = s(vals['mmr'])
        ec1_m, _ = s(vals['ec_top1'])
        ec3_m, _ = s(vals['ec_top3'])

        result[pt] = {
            'avg_degree_centralization': deg_m,
            'median_degree_centralization': deg_med,
            'avg_top1_top2_gap': gap_m,
            'median_top1_top2_gap': gap_med,
            'avg_top3_centrality_share': t3s_m,
            'median_top3_centrality_share': t3s_med,
            'avg_max_to_mean_ratio': mmr_m,
            'median_max_to_mean_ratio': mmr_med,
            'avg_edge_concentration_top1': ec1_m,
            'avg_edge_concentration_top3': ec3_m,
        }
    return result


def extract_structure(struct_by_type, struct_labels):
    """提取结构标签分布"""
    by_type = struct_by_type['by_type']

    # Count all labels including secondary
    plays = struct_labels['plays']
    type_secondary = {pt: Counter() for pt in PLAY_TYPES}
    for p in plays:
        pt = p['play_type']
        if pt in type_secondary:
            for sf in p.get('secondary_flags', []):
                flag_name = sf.split(' ')[0]  # '单核心倾向 (gap=...)' → '单核心倾向'
                type_secondary[pt][flag_name] += 1

    result = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        info = by_type[pt]
        result[pt] = {
            'dominant_labels': info.get('dominant_labels', []),
            'top_label': info.get('top_label', ''),
            'label_distribution': info.get('label_distribution', {}),
            'label_pct': info.get('label_pct', {}),
            'secondary_flag_counts': dict(type_secondary[pt].most_common()),
        }
    return result


def extract_connectivity(conn_by_type):
    """提取连通性指标"""
    by_type = conn_by_type['by_type']
    result = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        info = by_type[pt]
        fg = info.get('full_graph', {})
        sg = info.get('semantic_graph', {})
        gap = info.get('connectivity_gap', {})
        fi = info.get('fragmentation_index', {})
        camp = info.get('camp_split', {})

        result[pt] = {
            'avg_connected_components': safe_num(fg.get('connected_components', {}), 'mean'),
            'avg_largest_component_ratio': safe_num(fg.get('largest_component_ratio', {}), 'mean'),
            'avg_isolated_node_ratio': safe_num(fg.get('isolated_node_ratio', {}), 'mean'),
            'avg_fragmentation_index': safe_num(fi, 'mean'),
            'semantic_avg_largest_component_ratio': safe_num(sg.get('largest_component_ratio', {}), 'mean'),
            'semantic_edge_retention': round(1 - safe_num(gap.get('edge_reduction_ratio', {}), 'mean'), 4),
            'avg_component_increase': safe_num(gap.get('component_increase', {}), 'mean'),
            'camp_split_rate': safe_num(camp, 'rate', 0),
        }
    return result


# ═══════════════════════════════════════════════════════════════
# 口径说明
# ═══════════════════════════════════════════════════════════════

SCOPE_NOTES = {
    'scale': '基于 full_graph: 所有角色节点 + 所有关系边（含中立/同场）',
    'density': '基于 full_graph',
    'relations': (
        'all_relations: 包含 中立/同场 等所有关系边；'
        'semantic_relations: 排除 macro_type=中立 及 micro_type=同场/其他中立/萍水相逢'
    ),
    'core_roles': (
        '核心角色 = 度中心性最高的角色。'
        '行当来源: original(原始JSON主要角色) → cross_play(跨剧本同名映射) → llm(DeepSeek-V4推断)'
    ),
    'centralization': '基于 full_graph。Freeman公式, n<=2 时使用简化计算',
    'structure': (
        'Rule-based 标签判定，严格阈值。'
        '单核心倾向/双核心倾向 为辅助标记，主标签不包含它们'
    ),
    'connectivity': 'full_graph + semantic_graph 双口径连通性分析。阵营分裂检测: 0 cases',
    'confidence': (
        'sample: n>=200→high, n>=50→medium, n<50→low; '
        'role_type: completion>=60%→high, >=40%→medium; '
        'structure: n>=100→high, n>=30→medium'
    ),
}


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("Step 5.7: 类型对比总表生成")
    print(f"开始时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # ── Load all sources ──
    print("\n[1/2] 加载所有数据源 ...")
    basic = load('basic_stats')
    rel_dist = load('relation_type_dist')
    hangdang = load('core_role_hangdang')
    completion = load('role_type_completion')
    cent = load('centralization')
    struct_labels = load('structure_labels')
    struct_by_type = load('structure_by_type')
    conn_stats = load('connectivity_stats')
    conn_by_type = load('connectivity_by_type')
    print(f"  ✓ 9 个数据源加载完成")

    # ── Extract ──
    scale = extract_scale(basic)
    density = extract_density(basic)
    relations = extract_relations(rel_dist)
    core_roles = extract_core_roles(hangdang, completion)
    centralization = extract_centralization(cent)
    structure = extract_structure(struct_by_type, struct_labels)
    connectivity = extract_connectivity(conn_by_type)

    # ── Assemble ──
    print("\n[2/2] 组装类型对比总表 ...")
    comparison = {
        'meta': {
            'step': '5.7',
            'generated_at': datetime.now().isoformat(),
            'description': '剧目类型网络结构特征对比 — 汇总 Step 5.2~5.6',
            'play_count': conn_stats['summary']['total_plays'],
            'sources': {
                'Step 5.2': 'basic_stats.json',
                'Step 5.3': 'relation_type_distribution.json',
                'Step 5.4': 'core_role_hangdang_distribution.json + role_type_completion_audit.json',
                'Step 5.5A': 'centralization_metrics.json',
                'Step 5.5B': 'network_structure_labels.json + network_structure_by_type.json',
                'Step 5.6': 'connectivity_stats.json + connectivity_by_type.json',
            },
            'scope_notes': SCOPE_NOTES,
            'small_sample_threshold': SMALL_SAMPLE_THRESHOLD,
        },
    }

    for pt in PLAY_TYPES:
        sample_size = scale.get(pt, {}).get('play_count', 0)
        comp_rate = core_roles.get(pt, {}).get('role_type_completion_rate', 0)
        sem_enrich = relations.get(pt, {}).get('mean_semantic_enrichment', 0)

        comparison[pt] = {
            'sample': {
                'play_count': sample_size,
                'small_sample_warning': sample_size < SMALL_SAMPLE_THRESHOLD,
                'pct_of_corpus': round(sample_size / 1473 * 100, 1),
            },
            'scale': scale.get(pt, {}),
            'density': density.get(pt, {}),
            'relations': relations.get(pt, {}),
            'core_roles': core_roles.get(pt, {}),
            'centralization': centralization.get(pt, {}),
            'structure': structure.get(pt, {}),
            'connectivity': connectivity.get(pt, {}),
            'confidence': assess_confidence(pt, sample_size, comp_rate, sem_enrich),
        }

    # ── Write ──
    out_path = OUTPUT_DIR / 'type_comparison_summary.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(comparison, f, ensure_ascii=False, indent=2)
    print(f"  ✓ type_comparison_summary.json ({out_path.stat().st_size / 1024:.0f} KB)")

    # ── Print summary ──
    print("\n" + "=" * 70)
    print("Step 5.7 完成 — 各类型关键指标一览")
    print("=" * 70)

    header = f"{'类型':<10s} {'样本':>5s} {'角色':>5s} {'关系':>5s} {'语义率':>6s} {'行当率':>6s} {'度集中':>6s} {'结构标签':>12s} {'碎片':>5s} {'置信度':>6s}"
    print(header)
    print("-" * len(header))

    for pt in PLAY_TYPES:
        c = comparison[pt]
        s = c['sample']
        sc = c['scale']
        r = c['relations']
        cr = c['core_roles']
        cz = c['centralization']
        st = c['structure']
        cn = c['connectivity']
        cf = c['confidence']

        print(f"{pt:<10s} {s['play_count']:>5d} "
              f"{sc.get('avg_character_count', 0):>5.1f} "
              f"{sc.get('avg_relation_count', 0):>5.1f} "
              f"{r.get('semantic_edge_ratio', 0):>5.1%} "
              f"{cr.get('role_type_completion_rate', 0):>5.0f}% "
              f"{cz.get('avg_degree_centralization', 0) or 0:>6.3f} "
              f"{st.get('top_label', ''):<12s} "
              f"{cn.get('avg_fragmentation_index', 0) or 0:>5.3f} "
              f"{cf.get('overall_confidence', ''):<6s}")

    print(f"\n{'':>10s} {'':>5s} {'mean':>5s} {'median':>5s} {'pct':>6s} {'pct':>6s} {'mean':>6s} {'':<12s} {'mean':>5s}")

    print(f"\n  ✓ 下一步: Step 5.8 — API 数据准备")


if __name__ == '__main__':
    main()
