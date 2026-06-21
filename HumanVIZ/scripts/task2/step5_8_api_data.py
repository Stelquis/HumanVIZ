"""
================================================================================
Step 5.8: API 数据准备
================================================================================

将 type_comparison_summary.json 转换为前端图表可直接消费的结构。

输入:
  - type_comparison_summary.json (Step 5.7)
  - relation_type_distribution.json (Step 5.3)
  - core_role_hangdang_distribution.json (Step 5.4)
  - centralization_metrics.json (Step 5.5A)
  - network_structure_labels.json (Step 5.5B)
  - connectivity_stats.json (Step 5.6)

输出:
  - data/processed/task2/network_by_type/api_compare_by_type.json
  - data/processed/task2/network_by_type/api_contract_compare_by_type.md
================================================================================
"""

import json
import statistics
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/workspace/HumanVIZ")
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"

PLAY_TYPES = ['历史戏', '家庭戏', '公案戏', '爱情戏', '侠义戏', '神话戏', '技法展示戏']

STRUCTURE_LABELS = ['单核心型', '双核心型', '双核心对抗型', '多核心群像型', '分散型', '弱关系碎片型']

# Radars should exclude 中立 for semantic relevance
SEMANTIC_MACRO_TYPES = ['同盟', '从属', '敌对', '亲属', '情感']


def p(path_name):
    return OUTPUT_DIR / path_name


def load_json(fname):
    with open(p(fname), 'r', encoding='utf-8') as f:
        return json.load(f)


# ═══════════════════════════════════════════════════════════════
# Chart builders
# ═══════════════════════════════════════════════════════════════

def build_radar(summary):
    """
    雷达图: 每类型 5 轴 (归一化到 0-1 便于对比)
      - 密度 (avg_density)
      - 聚类 (avg_clustering)
      - 度中心化 (avg_degree_centralization)
      - 语义关系占比 (semantic_edge_ratio)
      - 最大连通分量占比 (avg_largest_component_ratio)
    """
    axes = [
        {'key': 'density', 'label': '网络密度', 'field': ['density', 'avg_density']},
        {'key': 'clustering', 'label': '聚类系数', 'field': ['density', 'avg_clustering']},
        {'key': 'centralization', 'label': '度中心化', 'field': ['centralization', 'avg_degree_centralization']},
        {'key': 'semantic_ratio', 'label': '语义关系占比', 'field': ['relations', 'semantic_edge_ratio']},
        {'key': 'lcr', 'label': '最大分量占比', 'field': ['connectivity', 'avg_largest_component_ratio']},
    ]

    series = []
    for pt in PLAY_TYPES:
        c = summary[pt]
        values = {}
        for ax in axes:
            section, field = ax['field']
            v = c.get(section, {}).get(field)
            values[ax['key']] = round(v, 4) if v is not None else 0
        series.append({
            'type': pt,
            'sample_size': c['sample']['play_count'],
            'values': values,
        })

    return {'axes': axes, 'series': series}


def build_relation_stack(rel_dist):
    """
    堆叠图: 各类型语义关系 macro 分布 (排除 中立).
    每类型一个 stacked bar, segments = semantic macro types.
    """
    by_type = rel_dist['by_type']
    categories = PLAY_TYPES
    segments = []

    # Collect all macro types present
    all_macros = set()
    type_data = {}
    for pt in PLAY_TYPES:
        if pt not in by_type:
            continue
        sem = by_type[pt].get('semantic_relations', {})
        macro_list = sem.get('macro_full', sem.get('macro_top5', []))
        dist = {}
        for m in macro_list:
            t = m['type']
            dist[t] = m.get('count', m.get('ratio', 0))
            all_macros.add(t)
        type_data[pt] = dist

    # Use only semantic macro types (exclude 中立)
    ordered_macros = [m for m in SEMANTIC_MACRO_TYPES if m in all_macros]
    # Add any other macro types that appeared
    for m in sorted(all_macros):
        if m not in ordered_macros:
            ordered_macros.append(m)

    for macro in ordered_macros:
        data = []
        for pt in PLAY_TYPES:
            data.append(type_data.get(pt, {}).get(macro, 0))
        segments.append({'name': macro, 'data': data})

    return {
        'categories': categories,
        'segments': segments,
        'note': '仅语义关系 (排除中立/同场), 数值为关系边计数',
    }


def build_structure_bar(summary):
    """
    条形图: 各类型结构标签分布 (%).
    """
    categories = PLAY_TYPES
    series = []
    for label in STRUCTURE_LABELS:
        data = []
        for pt in PLAY_TYPES:
            pct = summary[pt]['structure']['label_pct'].get(label, 0)
            data.append(round(pct, 1))
        series.append({'name': label, 'data': data})

    return {
        'categories': categories,
        'series': series,
        'unit': '%',
        'note': '严格 rule-based 标签。单核心倾向/双核心倾向为辅助标记，未计入主标签',
    }


def build_core_role_bar(hangdang_dist):
    """
    条形图: 各类型核心角色行当分布 (%).
    """
    hd = hangdang_dist['hangdang_distribution']
    categories = PLAY_TYPES

    # Collect all hangdang types
    all_hd = set()
    for pt in PLAY_TYPES:
        if pt in hd:
            all_hd.update(hd[pt].get('distribution', {}).keys())

    # Order by prevalence
    hd_totals = defaultdict(int)
    for pt in PLAY_TYPES:
        if pt in hd:
            for h, v in hd[pt].get('distribution', {}).items():
                hd_totals[h] += v.get('count', 0)

    ordered_hd = [h for h, _ in sorted(hd_totals.items(), key=lambda x: -x[1])]

    series = []
    for hangdang in ordered_hd:
        data = []
        for pt in PLAY_TYPES:
            dist = hd.get(pt, {}).get('distribution', {})
            entry = dist.get(hangdang, {})
            ratio = entry.get('ratio', 0) if isinstance(entry, dict) else 0
            data.append(round(ratio * 100, 1))
        series.append({'name': hangdang, 'data': data})

    return {
        'categories': categories,
        'series': series,
        'unit': '%',
        'note': '核心角色 = Top3 度中心性角色。行当来源: 原始JSON → 跨剧本映射 → LLM推断',
    }


def build_connectivity_scatter(cent_metrics, conn_stats):
    """
    散点图: 每部剧 (degree_centralization, largest_component_ratio),
    按剧目类型着色。同时提供 per-type 均值点。
    """
    cent_by_id = {p['entity_id']: p for p in cent_metrics['plays']}
    conn_by_id = {p['entity_id']: p for p in conn_stats['plays']}

    points = []
    for eid in cent_by_id:
        if eid not in conn_by_id:
            continue
        cent = cent_by_id[eid]
        conn = conn_by_id[eid]
        fg_c = cent.get('full_graph', {})
        fg_n = conn.get('full_graph', {})

        points.append({
            'entity_id': eid,
            'title': cent['title'],
            'play_type': cent['play_type'],
            'x': fg_c.get('degree_centralization'),  # 度中心化
            'y': fg_n.get('largest_component_ratio'),  # 最大分量占比
            'node_count': fg_n.get('node_count', 0),
            'edge_count': fg_n.get('edge_count', 0),
        })

    # Per-type means
    type_means = {}
    for pt in PLAY_TYPES:
        pt_points = [p for p in points if p['play_type'] == pt]
        if pt_points:
            xs = [p['x'] for p in pt_points if p['x'] is not None]
            ys = [p['y'] for p in pt_points if p['y'] is not None]
            type_means[pt] = {
                'play_type': pt,
                'x': round(statistics.mean(xs), 4) if xs else 0,
                'y': round(statistics.mean(ys), 4) if ys else 0,
                'count': len(pt_points),
            }

    return {
        'points': points,
        'type_means': list(type_means.values()),
        'x_label': 'degree_centralization (Freeman)',
        'y_label': 'largest_component_ratio',
        'note': '每个点 = 一部剧。散点按剧目类型着色。均值点为各类型重心',
    }


def build_small_multiples(cent_metrics, conn_stats, struct_labels, summary):
    """
    小多图: 每类型选 2 部代表性剧目，提供节点+边数据用于渲染缩略网络图。

    选取规则:
      1. 节点数接近该类型中位数
      2. 至少有 3 条语义关系边
      3. 结构标签为该类型常见标签
      4. 核心角色有行当信息
    """
    plays_cent = {p['entity_id']: p for p in cent_metrics['plays']}
    plays_conn = {p['entity_id']: p for p in conn_stats['plays']}
    plays_label = {p['entity_id']: p for p in struct_labels['plays']}

    # Get type medians from summary
    type_medians = {}
    for pt in PLAY_TYPES:
        s = summary[pt]['scale']
        type_medians[pt] = s.get('median_character_count', 10)

    selected = {}
    for pt in PLAY_TYPES:
        candidates = []
        for eid, cent in plays_cent.items():
            if cent['play_type'] != pt:
                continue
            if eid not in plays_conn or eid not in plays_label:
                continue

            fg = cent.get('full_graph', {})
            conn = plays_conn[eid]
            sem = conn.get('semantic_graph', {})
            lbl = plays_label[eid]

            # Filter: at least 3 semantic edges
            if sem.get('edge_count', 0) < 3:
                continue
            # Filter: has role_type for top characters
            top_chars = cent.get('top_characters', [])
            has_role = any(tc.get('role_type') for tc in top_chars[:3])

            nc = fg.get('node_count', 0)
            target = type_medians.get(pt, 10)

            candidates.append({
                'entity_id': eid,
                'title': cent['title'],
                'node_count': nc,
                'edge_count': fg.get('edge_count', 0),
                'sem_edge_count': sem.get('edge_count', 0),
                'label': lbl['label'],
                'top_characters': [
                    {'name': tc['name'], 'role_type': tc['role_type'],
                     'deg': tc['full_graph']['degree_centrality']}
                    for tc in top_chars[:3]
                ],
                'has_role_type': has_role,
                'distance_from_median': abs(nc - target),
                'lcr': conn['full_graph']['largest_component_ratio'],
            })

        # Sort: prefer has_role_type, then close to median
        candidates.sort(key=lambda c: (
            not c['has_role_type'],
            c['distance_from_median'],
        ))

        selected[pt] = candidates[:2]

    return {
        'types': {pt: items for pt, items in selected.items()},
        'note': '每类型选2部代表性剧目（接近该类型中位角色数、有语义边、有行当信息）',
        'usage': '前端用 entity_id 从 /api/v1/network/{entity_id} 获取完整图数据',
    }


# ═══════════════════════════════════════════════════════════════
# Metadata
# ═══════════════════════════════════════════════════════════════

def build_metadata(summary):
    return {
        'task': 'task2_network_by_type',
        'step': '5.8',
        'generated_at': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'data_version': '2026-06-06',
        'play_count': 1473,
        'play_types': 7,
        'relation_scopes': [
            {
                'key': 'all_relations',
                'description': '包含所有关系边，含中立/同场',
                'total_edges': 72257,
            },
            {
                'key': 'semantic_relations',
                'description': '排除 macro_type=中立 及 micro_type=同场/其他中立/萍水相逢',
                'total_edges': 22148,
            },
        ],
        'graph_scopes': [
            {'key': 'full_graph', 'description': '所有节点 + 所有边'},
            {'key': 'semantic_graph', 'description': '所有节点 + 语义边 (排除中立/同场)'},
            {'key': 'active_graph', 'description': '排除 degree=0 的孤立节点'},
        ],
        'role_type_sources': [
            {'source': 'original', 'description': '原始JSON主要角色字段', 'count': 92},
            {'source': 'cross_play', 'description': '跨剧本同名角色最高频行当映射', 'count': 5016},
            {'source': 'llm', 'description': 'DeepSeek-V4 对高价值未知核心角色的行当推断 (Step 5.4D)', 'count': 126},
        ],
        'structure_label_system': {
            '弱关系碎片型': 'edge_count<=2 | LCR<0.4 | active_node_ratio<0.3',
            '单核心型': 'top1_top2_gap>0.25 & deg_cent>=0.35 | ratio>1.6 & max_to_mean>=2.5',
            '双核心型': 'top1_top2_gap<=0.10 & top2_top3_gap>0.12, 非对抗',
            '双核心对抗型': '双核心型 + Top1/Top2 敌对/阵营对立/政敌/仇人',
            '多核心群像型': 'active>=6 & top3_share>=0.45 & deg_cent<0.4',
            '分散型': '不满足以上任何规则 (默认标签)',
        },
        'secondary_flags': {
            '单核心倾向': '0.20<=gap<=0.25 & dc>=0.44 — 有中心倾向但未达严格阈值',
            '双核心倾向': 'gap<=0.12 & 0.06<gap23<=0.12 & active>=4 — 有双头趋势但差距不显著',
        },
        'key_findings': [
            '阵营分裂 = 0: 全部1,473部剧中不存在跨语义分量的敌对关系边',
            '家庭戏语义以亲属关系为第一; 历史/侠义戏以同盟/从属为第一',
            '68.4% 剧目标签为分散型 (strict rule-based), 单核心型仅 5.4%',
            '历史戏最碎片 (frag_index=0.323); 神话戏最不碎片 (0.198)',
        ],
        'confidence_notes': {
            '技法展示戏': 'n=17, 统计指标仅供参考',
            '历史戏': '行当覆盖率 30.2%, 核心角色行当分析置信度受限',
        },
    }


# ═══════════════════════════════════════════════════════════════
# API contract markdown
# ═══════════════════════════════════════════════════════════════

def write_api_contract(metadata):
    lines = []
    lines.append("# GET /api/v1/network/compare-by-type — API 数据契约")
    lines.append("")
    lines.append(f"> 生成时间: {metadata['generated_at']}")
    lines.append(f"> 数据版本: {metadata['data_version']}")
    lines.append("")
    lines.append("## 概述")
    lines.append("")
    lines.append("返回 7 种剧目类型的角色关系网络结构对比数据，供前端图表直接消费。")
    lines.append("数据来源: `api_compare_by_type.json`。")
    lines.append("")
    lines.append("## 请求")
    lines.append("")
    lines.append("```http")
    lines.append("GET /api/v1/network/compare-by-type")
    lines.append("```")
    lines.append("")
    lines.append("无需参数。如需按关系范围筛选，使用查询参数:")
    lines.append("")
    lines.append("```http")
    lines.append("GET /api/v1/network/compare-by-type?scope=semantic")
    lines.append("```")
    lines.append("")
    lines.append("| 参数 | 类型 | 默认值 | 说明 |")
    lines.append("|------|------|--------|------|")
    lines.append("| `scope` | string | `all` | `all` (全量关系) 或 `semantic` (语义关系) |")
    lines.append("")
    lines.append("## 响应结构")
    lines.append("")
    lines.append("```json")
    lines.append("{")
    lines.append("  \"metadata\": { ... },    // 数据版本、口径说明、补全策略")
    lines.append("  \"types\": [ ... ],       // 7 个剧目类型的完整数据对象")
    lines.append("  \"charts\": {             // 图表就绪数据")
    lines.append("    \"radar\": { ... },          // 雷达图: 5 轴 × 7 类型")
    lines.append("    \"relation_stack\": { ... },  // 堆叠图: 语义关系 macro 分布")
    lines.append("    \"structure_bar\": { ... },   // 条形图: 结构标签分布")
    lines.append("    \"core_role_bar\": { ... },   // 条形图: 核心角色行当分布")
    lines.append("    \"connectivity_scatter\": { ... }, // 散点图: 中心化 × 连通性")
    lines.append("    \"small_multiples\": { ... }   // 小多图: 代表性剧目列表")
    lines.append("  }")
    lines.append("}")
    lines.append("```")
    lines.append("")
    lines.append("## charts 字段详解")
    lines.append("")
    lines.append("### radar — 雷达图")
    lines.append("")
    lines.append("5 个轴: `density`, `clustering`, `centralization`, `semantic_ratio`, `lcr`。")
    lines.append("每个类型一个 series entry, `values` 为 `{axis_key: value}` 映射。")
    lines.append("所有值 0-1 范围。")
    lines.append("")
    lines.append("### relation_stack — 关系类型堆叠图")
    lines.append("")
    lines.append("仅使用语义关系 (排除中立/同场)。")
    lines.append("`categories`: 7 个类型名。")
    lines.append("`segments[i]`: `{name: 关系类型, data: [每类型计数]}`。")
    lines.append("")
    lines.append("### structure_bar — 结构标签分布")
    lines.append("")
    lines.append("6 个结构标签的百分比分布。`unit: \"%\"`。")
    lines.append("不包括辅助标记 (单核心倾向/双核心倾向)。")
    lines.append("")
    lines.append("### core_role_bar — 核心角色行当分布")
    lines.append("")
    lines.append("各类型 Top3 度中心性角色的行当分布。`unit: \"%\"`。")
    lines.append("含 '未知' 类别 (表示行当信息缺失)。")
    lines.append("")
    lines.append("### connectivity_scatter — 连通性散点图")
    lines.append("")
    lines.append("每部剧一个点 (共 1,473 个点)。")
    lines.append("`x`: degree_centralization (Freeman, 0-1) ")
    lines.append("`y`: largest_component_ratio (0-1)")
    lines.append("`type_means`: 各类型重心坐标。")
    lines.append("")
    lines.append("### small_multiples — 小多图")
    lines.append("")
    lines.append("每类型 2 部代表性剧目的 `entity_id` 列表。")
    lines.append("前端通过 `GET /api/v1/network/{entity_id}` 获取完整图数据渲染。")
    lines.append("")
    lines.append("## types 字段")
    lines.append("")
    lines.append("`types` 数组的每个元素与 `type_comparison_summary.json` 结构一致，包含 9 个 section:")
    lines.append("`sample`, `scale`, `density`, `relations`, `core_roles`,")
    lines.append("`centralization`, `structure`, `connectivity`, `confidence`。")
    lines.append("")
    lines.append("## 关系范围说明")
    lines.append("")
    lines.append("| Scope | 边数 | 说明 |")
    lines.append("|-------|------|------|")
    lines.append("| `all_relations` | 72,257 | 全量关系 (含同场共现) |")
    lines.append("| `semantic_relations` | 22,148 | 仅语义标签 (亲属/同盟/从属/敌对/情感) |")
    lines.append("")
    lines.append("## 行当补全来源")
    lines.append("")
    lines.append("| 来源 | 数量 | 说明 |")
    lines.append("|------|------|------|")
    lines.append("| original | 92 | 原始JSON主要角色字段 |")
    lines.append("| cross_play | 5,016 | 跨剧本同名角色最高频行当映射 |")
    lines.append("| llm | 126 | DeepSeek-V4 推断 (高价值未知核心角色) |")
    lines.append("| unknown | 14,493 | 无法补全 (多为功能性/群体角色) |")
    lines.append("")
    lines.append("## 错误处理")
    lines.append("")
    lines.append("```json")
    lines.append("{")
    lines.append("  \"error\": \"数据未生成，请先运行 Task 2 Steps 1-7\"")
    lines.append("}")
    lines.append("```")
    lines.append("")
    lines.append("---")
    lines.append(f"*自动生成于 Step 5.8, {metadata['generated_at']}*")

    md_path = OUTPUT_DIR / 'api_contract_compare_by_type.md'
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f"  ✓ api_contract_compare_by_type.md")


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("Step 5.8: API 数据准备")
    print(f"开始时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # ── Load sources ──
    print("\n[1/3] 加载数据源 ...")
    summary = load_json('type_comparison_summary.json')
    rel_dist = load_json('relation_type_distribution.json')
    hangdang_dist = load_json('core_role_hangdang_distribution.json')
    cent_metrics = load_json('centralization_metrics.json')
    struct_labels = load_json('network_structure_labels.json')
    conn_stats = load_json('connectivity_stats.json')
    print(f"  ✓ 6 个数据源")

    # ── Build charts ──
    print("\n[2/3] 构建图表数据 ...")
    metadata = build_metadata(summary)

    charts = {
        'radar': build_radar(summary),
        'relation_stack': build_relation_stack(rel_dist),
        'structure_bar': build_structure_bar(summary),
        'core_role_bar': build_core_role_bar(hangdang_dist),
        'connectivity_scatter': build_connectivity_scatter(cent_metrics, conn_stats),
        'small_multiples': build_small_multiples(cent_metrics, conn_stats, struct_labels, summary),
    }
    print(f"  ✓ {len(charts)} 个图表")

    # Types array (per-type data from summary)
    types = []
    for pt in PLAY_TYPES:
        entry = {'play_type': pt}
        entry.update(summary[pt])
        types.append(entry)

    # ── Assemble API response ──
    print("\n[3/3] 输出文件 ...")
    api_data = {
        'metadata': metadata,
        'types': types,
        'charts': charts,
    }

    out_path = OUTPUT_DIR / 'api_compare_by_type.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(api_data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ api_compare_by_type.json ({out_path.stat().st_size / 1024:.0f} KB)")

    write_api_contract(metadata)

    # ── Summary ──
    print("\n" + "=" * 70)
    print("Step 5.8 完成")
    print("=" * 70)
    print(f"""
  API 数据结构:
    metadata       — 数据版本、口径、补全策略
    types[7]       — 每类型 9 个 section 完整数据
    charts:
      radar              — 5 轴 × 7 类型
      relation_stack     — {len(charts['relation_stack']['segments'])} 关系类型 × 7 类型
      structure_bar      — {len(STRUCTURE_LABELS)} 标签 × 7 类型
      core_role_bar      — {len(charts['core_role_bar']['series'])} 行当 × 7 类型
      connectivity_scatter — 1,473 散点 + 7 重心
      small_multiples    — 每类型 2 部代表性剧目

  API 端点: GET /api/v1/network/compare-by-type
  数据文件: api_compare_by_type.json
  契约文档: api_contract_compare_by_type.md

  Task 2 Step 5 全部完成。
""")


if __name__ == '__main__':
    main()
