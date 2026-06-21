"""
================================================================================
Step 5: 按剧目类型的网络结构特征对比分析
================================================================================
Step 5.1 — JSON 数据结构与网络指标审计
Step 5.2 — 剧目类型分组与基础统计
Step 5.3 — 关系类型分布分析
Step 5.4 — 核心角色与行当分布分析
================================================================================

数据来源:
  - 单剧本网络.json.gz  (主要: nodes, edges, metrics)
  - 4.1_unified_data.json.gz  (角色字典, 关系列表)
  - 剧目类型.json
  - 分类依据.json
  - 角色关系.json  (metadata + per-play relations)
  - 全局网络.json.gz  (跨剧本全局网络)
  - 网络指标.json  (预计算的 global + by_type 聚合)

输出:
  data/processed/task2/network_by_type/schema_audit.json
  data/processed/task2/network_by_type/missing_fields.json
  data/processed/task2/network_by_type/basic_stats.json        (Step 5.2)
  data/processed/task2/network_by_type/relation_type_distribution.json  (Step 5.3)
  data/processed/task2/network_by_type/core_roles.json          (Step 5.4)
  data/processed/task2/network_by_type/core_role_hangdang_distribution.json  (Step 5.4)
"""

import json
import gzip
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# ─── 路径配置 ───────────────────────────────────────────────
BASE_DIR = Path("/workspace/HumanVIZ")
DATA_DIR = BASE_DIR / "data" / "processed" / "task2" / "db_exports"
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"

SINGLE_NETWORK_GZ = DATA_DIR / "单剧本网络.json.gz"
UNIFIED_DATA_GZ = DATA_DIR / "4.1_unified_data.json.gz"
METRICS_GZ = DATA_DIR / "4.3_network_metrics.json.gz"
PLAY_TYPES_JSON = DATA_DIR / "剧目类型.json"
CLASSIFY_EVIDENCE_JSON = DATA_DIR / "分类依据.json"
ROLE_RELATIONS_JSON = DATA_DIR / "角色关系.json"
GLOBAL_NETWORK_GZ = DATA_DIR / "全局网络.json.gz"
NETWORK_METRICS_JSON = DATA_DIR / "网络指标.json"


def load_json(path):
    """加载普通 JSON 文件"""
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_gz_json(path):
    """加载 gzip 压缩的 JSON 文件"""
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def ensure_output_dir():
    """确保输出目录存在"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════
# Step 5.1: JSON 数据结构与网络指标审计
# ═══════════════════════════════════════════════════════════════

def audit_step_5_1():
    """
    审计所有剧本 JSON 文件的结构，确认 attributes.网络指标 内容。
    产出: schema_audit.json, missing_fields.json
    """
    print("=" * 70)
    print("Step 5.1: JSON 数据结构与网络指标审计")
    print("=" * 70)

    # ── 加载数据 ──────────────────────────────────────────
    print("\n[1/5] 加载 单剧本网络.json.gz ...")
    single_nets = load_gz_json(SINGLE_NETWORK_GZ)
    plays = single_nets['plays']
    print(f"  ✓ 加载 {len(plays)} 部剧本")

    print("\n[2/5] 加载 4.1_unified_data.json.gz ...")
    unified_data = load_gz_json(UNIFIED_DATA_GZ)
    # 构建 entity_id → play 的索引
    unified_by_id = {d['entity_id']: d for d in unified_data}
    print(f"  ✓ 加载 {len(unified_data)} 条记录")

    print("\n[3/5] 加载 剧目类型.json ...")
    play_types = load_json(PLAY_TYPES_JSON)
    types_by_id = {d['entity_id']: d['剧目类型'] for d in play_types}
    print(f"  ✓ 加载 {len(play_types)} 条类型映射")

    print("\n[4/5] 加载 角色关系.json ...")
    role_relations = load_json(ROLE_RELATIONS_JSON)
    relations_by_play = role_relations.get('plays', {})
    relations_meta = role_relations.get('metadata', {})
    print(f"  ✓ 加载 {len(relations_by_play)} 部剧的关系数据")

    print("\n[5/5] 加载 全局网络.json.gz 和 网络指标.json ...")
    global_net = load_gz_json(GLOBAL_NETWORK_GZ)
    net_metrics_aggr = load_json(NETWORK_METRICS_JSON)
    print(f"  ✓ 全局网络: {global_net['_metadata']['total_nodes']} 节点, {global_net['_metadata']['total_edges']} 边")

    # ── 字段结构审计 ──────────────────────────────────────
    print("\n" + "─" * 70)
    print("字段结构审计")
    print("─" * 70)

    # 1. 每部剧本的顶层字段完整性
    top_level_fields = Counter()
    unified_top_level_fields = Counter()

    for p in plays:
        for k in p.keys():
            top_level_fields[k] += 1

    for d in unified_data:
        for k in d.keys():
            unified_top_level_fields[k] += 1

    print("\n--- 单剧本网络 顶层字段 ---")
    for field, count in top_level_fields.most_common():
        pct = count / len(plays) * 100
        print(f"  {field}: {count}/{len(plays)} ({pct:.1f}%)")

    print("\n--- 4.1 统一数据 顶层字段 ---")
    for field, count in unified_top_level_fields.most_common():
        pct = count / len(unified_data) * 100
        print(f"  {field}: {count}/{len(unified_data)} ({pct:.1f}%)")

    # 2. metrics 字段（即 attributes.网络指标 的等价物）展开
    print("\n--- metrics 字段（等价 attributes.网络指标）子字段 ---")
    metrics_sub_fields = Counter()
    for p in plays:
        m = p.get('metrics', {})
        for k in m.keys():
            metrics_sub_fields[k] += 1
    for field, count in metrics_sub_fields.most_common():
        pct = count / len(plays) * 100
        print(f"  metrics.{field}: {count}/{len(plays)} ({pct:.1f}%)")

    # 3. nodes 字段子字段分布
    print("\n--- nodes 子字段覆盖率 ---")
    total_nodes_list = []
    node_sub_fields = Counter()
    for p in plays:
        for n in p.get('nodes', []):
            total_nodes_list.append(n)
            for k in n.keys():
                node_sub_fields[k] += 1
    total_nodes = len(total_nodes_list)
    for field, count in node_sub_fields.most_common():
        pct = count / total_nodes * 100
        print(f"  nodes.{field}: {count}/{total_nodes} ({pct:.1f}%)")

    # 4. edges 字段子字段分布
    print("\n--- edges 子字段覆盖率 ---")
    total_edges_list = []
    edge_sub_fields = Counter()
    for p in plays:
        for e in p.get('edges', []):
            total_edges_list.append(e)
            for k in e.keys():
                edge_sub_fields[k] += 1
    total_edges = len(total_edges_list)
    for field, count in edge_sub_fields.most_common():
        pct = count / max(total_edges, 1) * 100
        print(f"  edges.{field}: {count}/{total_edges} ({pct:.1f}%)")

    # ── 值覆盖率检查（区分字段存在 vs 值有意义）────────────
    print("\n--- 关键字段非空值覆盖率 ---")
    # role_type 非空
    total_nodes = len(total_nodes_list)
    nodes_role_nonempty = sum(1 for n in total_nodes_list if n.get('role_type'))
    print(f"  nodes.role_type (非空): {nodes_role_nonempty}/{total_nodes} ({nodes_role_nonempty/total_nodes*100:.1f}%)")
    # micro_type 非空
    total_edges = len(total_edges_list)
    edges_micro_nonempty = sum(1 for e in total_edges_list if e.get('micro_type'))
    print(f"  edges.micro_type (非空): {edges_micro_nonempty}/{total_edges} ({edges_micro_nonempty/total_edges*100:.1f}%)")
    # evidence 非空
    edges_evidence_nonempty = sum(1 for e in total_edges_list if e.get('evidence'))
    print(f"  edges.evidence (非空): {edges_evidence_nonempty}/{total_edges} ({edges_evidence_nonempty/total_edges*100:.1f}%)")

    # 补充到 schema_audit 的 value_coverage 中（在函数末尾写入前填充）
    value_coverage = {
        "nodes.role_type_nonempty": {"count": nodes_role_nonempty, "total": total_nodes, "pct": round(nodes_role_nonempty/total_nodes*100, 1)},
        "edges.micro_type_nonempty": {"count": edges_micro_nonempty, "total": total_edges, "pct": round(edges_micro_nonempty/total_edges*100, 1)},
        "edges.evidence_nonempty": {"count": edges_evidence_nonempty, "total": total_edges, "pct": round(edges_evidence_nonempty/total_edges*100, 1)},
    }

    # ── 异常检测 ──────────────────────────────────────────
    print("\n" + "─" * 70)
    print("异常检测")
    print("─" * 70)

    missing_fields_report = {
        "audit_time": datetime.now().isoformat(),
        "total_plays": len(plays),
        "issues": []
    }

    issues = missing_fields_report["issues"]

    # 检测 1: metrics 为空的剧本
    empty_metrics = []
    for p in plays:
        m = p.get('metrics', {})
        if not m:
            empty_metrics.append(p)
    if empty_metrics:
        print(f"\n  ⚠  {len(empty_metrics)} 部剧 metrics 完全为空")
        issues.append({
            "type": "empty_metrics",
            "count": len(empty_metrics),
            "plays": [{"entity_id": p['entity_id'], "剧本名": p['剧本名']} for p in empty_metrics]
        })

    # 检测 2: relation_type_distribution 为空/异常的剧本
    empty_rtd = []
    for p in plays:
        rtd = p.get('metrics', {}).get('relation_type_distribution', {})
        if not rtd:
            empty_rtd.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "剧目类型": p.get('剧目类型', ''),
                "node_count": p.get('metrics', {}).get('node_count', 0),
                "edge_count": p.get('metrics', {}).get('edge_count', 0)
            })
    if empty_rtd:
        print(f"\n  ⚠  {len(empty_rtd)} 部剧 relation_type_distribution 为空")
        issues.append({
            "type": "empty_relation_type_distribution",
            "count": len(empty_rtd),
            "plays": empty_rtd,
            "note": "这些剧 edge_count 均为 0，无法产生关系类型分布"
        })

    # 检测 3: core_characters 为空的剧本
    empty_core = []
    for p in plays:
        cc = p.get('metrics', {}).get('core_characters', [])
        if not cc:
            empty_core.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "剧目类型": p.get('剧目类型', ''),
                "node_count": p.get('metrics', {}).get('node_count', 0)
            })
    if empty_core:
        print(f"\n  ⚠  {len(empty_core)} 部剧 core_characters 为空")
        issues.append({
            "type": "empty_core_characters",
            "count": len(empty_core),
            "plays": empty_core,
            "note": "这些剧 node_count < 2，无法计算度中心性"
        })

    # 检测 4: nodes 中 role_type 为空的比例
    nodes_no_role = []
    for p in plays:
        missing_in_play = []
        for n in p.get('nodes', []):
            if not n.get('role_type'):
                missing_in_play.append(n['name'])
        if missing_in_play:
            nodes_no_role.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "missing_count": len(missing_in_play),
                "total_nodes": len(p.get('nodes', [])),
                "missing_ratio": len(missing_in_play) / max(len(p.get('nodes', [])), 1),
                "examples": missing_in_play[:5]
            })
    if nodes_no_role:
        plays_fully_missing = sum(1 for x in nodes_no_role if x['missing_ratio'] >= 1.0)
        print(f"\n  ⚠  {len(nodes_no_role)} 部剧存在角色缺行当信息")
        print(f"    其中 {plays_fully_missing} 部剧所有角色均缺行当信息")
        issues.append({
            "type": "missing_role_type_in_nodes",
            "count": len(nodes_no_role),
            "fully_missing_plays": plays_fully_missing,
            "total_nodes_affected": sum(x['missing_count'] for x in nodes_no_role),
            "details": nodes_no_role[:20],  # 只保留前 20 条样例
            "note": "需要从 主要角色 字段补充行当信息，或从 角色字典.json.gz 获取"
        })

    # 检测 5: 剧目类型分布与缺失检查
    type_dist = Counter(p.get('剧目类型', '__MISSING__') for p in plays)
    missing_type = type_dist.get('__MISSING__', 0)
    if missing_type > 0:
        print(f"\n  ⚠  {missing_type} 部剧缺失剧目类型")
        missing_type_plays = [{"entity_id": p['entity_id'], "剧本名": p['剧本名']}
                              for p in plays if not p.get('剧目类型')]
        issues.append({
            "type": "missing_play_type",
            "count": missing_type,
            "plays": missing_type_plays
        })

    # 检测 6: 孤立节点检测（度中心性为 0 的角色）
    # 区分 crowd (龙套/群体角色) 和 named (个体角色)
    CROWD_NAMES = {'四下手', '四文堂', '四青袍', '四龙套', '四小甲', '四将', '四兵士',
                   '四太监', '四宫女', '四衙役', '四校尉', '四武士', '四打手', '四英雄',
                   '四大铠', '四刀斧手', '四家丁', '四喽啰', '四小军', '四皂隶',
                   '八手下', '众百姓', '众人役', '众将官', '众喽啰', '众神将',
                   '众仙童', '众仙女', '众百姓', '众军士', '众将', '众喽兵', '众神兵'}
    isolated_real = []
    isolated_crowd = []
    for p in plays:
        for n in p.get('nodes', []):
            if n.get('degree_centrality', 0) == 0 and len(p.get('nodes', [])) > 1:
                entry = {
                    "entity_id": p['entity_id'],
                    "剧本名": p['剧本名'],
                    "角色名": n['name'],
                    "role_type": n.get('role_type', ''),
                    "dialogue_count": n.get('dialogue_count', 0),
                }
                if n['name'] in CROWD_NAMES or '众' in n['name'] or n.get('dialogue_count', 0) == 0:
                    isolated_crowd.append(entry)
                else:
                    isolated_real.append(entry)
    if isolated_crowd or isolated_real:
        print(f"\n  ⚠  孤立节点总计: {len(isolated_crowd) + len(isolated_real)} 个")
        print(f"     其中龙套/群体角色（预期孤立）: {len(isolated_crowd)} 个")
        print(f"     其中个体角色（需关注）: {len(isolated_real)} 个")
        issues.append({
            "type": "isolated_nodes",
            "total": len(isolated_crowd) + len(isolated_real),
            "crowd_characters_expected": len(isolated_crowd),
            "named_characters_need_attention": len(isolated_real),
            "note": "龙套/群体角色（度=0）属于正常现象；个体角色孤立需核查",
            "named_examples": isolated_real[:30]
        })

    # 检测 7: 4.1 统一数据中 entity_id 对齐检查
    unified_ids = set(d['entity_id'] for d in unified_data)
    play_ids = set(p['entity_id'] for p in plays)
    only_unified = unified_ids - play_ids
    only_play = play_ids - unified_ids
    if only_unified:
        print(f"\n  ⚠  {len(only_unified)} 条仅在 4.1 中存在（不在单剧本网络中）")
        issues.append({
            "type": "entity_id_mismatch",
            "only_in_unified": list(only_unified)[:20],
            "count": len(only_unified)
        })
    if only_play:
        print(f"\n  ⚠  {len(only_play)} 条仅在单剧本网络中存在（不在 4.1 中）")
        if not issues or issues[-1]['type'] != 'entity_id_mismatch':
            issues.append({
                "type": "entity_id_mismatch",
                "only_in_play_net": list(only_play)[:20],
                "count": len(only_play)
            })
    if not only_unified and not only_play:
        print(f"\n  ✓ entity_id 完全对齐: {len(play_ids)} 条")

    # 检测 8: 密度异常检查（density=0 但有 edges 的剧本）
    density_anomalies = []
    for p in plays:
        m = p.get('metrics', {})
        if m.get('density', 0) == 0 and m.get('edge_count', 0) > 0:
            density_anomalies.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "edge_count": m['edge_count'],
                "node_count": m['node_count']
            })
    if density_anomalies:
        print(f"\n  ⚠  {len(density_anomalies)} 部剧 density=0 但有边（需核查）")
        issues.append({
            "type": "density_zero_with_edges",
            "count": len(density_anomalies),
            "plays": density_anomalies
        })

    # ── 指标复用分析 ──────────────────────────────────────
    print("\n" + "─" * 70)
    print("指标复用分析（可直接复用 vs 需要补算）")
    print("─" * 70)

    available_metrics = set()
    for p in plays:
        m = p.get('metrics', {})
        available_metrics.update(m.keys())

    # 从 nodes 可提取的指标
    node_available = set()
    for p in plays:
        for n in p.get('nodes', []):
            node_available.update(n.keys())
            break
        if node_available:
            break

    print("\n已有指标（来自 metrics 字段）:")
    reusable = []
    for m in sorted(available_metrics):
        count = sum(1 for p in plays if p.get('metrics', {}).get(m) is not None)
        pct = count / len(plays) * 100
        status = "✓ 可直接复用" if pct > 99 else "⚠ 需补算"
        print(f"  {m}: {count}/{len(plays)} ({pct:.1f}%) — {status}")
        if pct <= 99:
            reusable.append({"metric": m, "coverage": count, "coverage_pct": pct, "status": "need_recompute"})
        else:
            reusable.append({"metric": m, "coverage": count, "coverage_pct": pct, "status": "ready"})

    print("\n节点级指标（来自 nodes 字段，可进一步聚合）:")
    for attr in sorted(node_available):
        count = sum(1 for p in plays for n in p.get('nodes', []) if n.get(attr) is not None)
        pct = count / max(total_nodes, 1) * 100
        print(f"  nodes.{attr}: {count}/{total_nodes} ({pct:.1f}%)")

    print("\n可补算的指标（基于现有数据无须重跑 LLM）:")
    supplementary = [
        {"name": "centralization", "description": "度中心化程度 = (max_deg - avg_deg) / max(avg_deg, 1)", "can_compute": True},
        {"name": "degree_entropy", "description": "度分布熵（归一化）", "can_compute": True},
        {"name": "modularity", "description": "社区模块度（需 Louvain/标签传播）", "can_compute": True},
        {"name": "core_role_betweenness", "description": "核心角色的介数中心性（已有 nodes 级 betweenness）", "can_compute": True},
        {"name": "diameter_or_avg_path", "description": "网络直径或平均最短路径长度", "can_compute": True},
        {"name": "assortativity", "description": "行当同配性（同类行当是否更倾向相连）", "can_compute": "partial (need role_type)"},
    ]
    for s in supplementary:
        print(f"  - {s['name']}: {s['description']} [可计算: {s['can_compute']}]")

    # ── 生成 schema_audit.json ─────────────────────────────
    print("\n" + "─" * 70)
    print("生成审计报告...")

    schema_audit = {
        "audit_time": datetime.now().isoformat(),
        "data_sources": {
            "单剧本网络.json.gz": {
                "description": "每部剧的图结构 + 指标，Step 4.2-4.3 产出",
                "play_count": len(plays),
                "total_nodes": sum(len(p.get('nodes', [])) for p in plays),
                "total_edges": sum(len(p.get('edges', [])) for p in plays),
                "top_level_fields": list(top_level_fields.keys()),
                "metrics_sub_fields": list(metrics_sub_fields.keys()),
                "node_attributes": list(node_sub_fields.keys()),
                "edge_attributes": list(edge_sub_fields.keys()),
            },
            "4.1_unified_data.json.gz": {
                "description": "角色字典、别名映射、语义关系边列表、共现边列表",
                "play_count": len(unified_data),
                "top_level_fields": list(unified_top_level_fields.keys()),
            },
            "剧目类型.json": {
                "play_count": len(play_types),
                "type_distribution": dict(type_dist),
            },
            "角色关系.json": {
                "play_count": len(relations_by_play),
                "total_relations": relations_meta.get('total_relations', 0),
                "macro_types": relations_meta.get('by_macro_type', {}),
            },
            "全局网络.json.gz": {
                "total_nodes": global_net['_metadata']['total_nodes'],
                "total_edges": global_net['_metadata']['total_edges'],
            },
            "网络指标.json": {
                "sections": list(net_metrics_aggr.keys()),
                "by_type_available": list(net_metrics_aggr.get('by_type', {}).keys()),
            }
        },
        "field_coverage": {
            "top_level": {k: v for k, v in top_level_fields.most_common()},
            "metrics_sub_fields": {k: v for k, v in metrics_sub_fields.most_common()},
            "node_sub_fields": {k: v for k, v in node_sub_fields.most_common()},
            "edge_sub_fields": {k: v for k, v in edge_sub_fields.most_common()},
        },
        "play_type_distribution": {k: v for k, v in type_dist.most_common()},
        "available_metrics": reusable,
        "supplementary_metrics_computable": [
            {"name": s["name"], "description": s["description"], "can_compute": s["can_compute"]}
            for s in supplementary
        ],
        "value_coverage": value_coverage,
        "data_quality_summary": {
            "total_plays": len(plays),
            "plays_with_empty_relation_distribution": len(empty_rtd),
            "plays_with_empty_core_characters": len(empty_core),
            "plays_with_missing_role_types": len(nodes_no_role),
            "total_nodes_without_role_type": sum(x['missing_count'] for x in nodes_no_role),
            "isolated_nodes_total": sum(1 for _ in isolated_crowd) + sum(1 for _ in isolated_real),
            "isolated_nodes_crowd": len(isolated_crowd),
            "isolated_nodes_named": len(isolated_real),
            "entity_id_alignment": "ok" if not only_unified and not only_play else "mismatch",
        }
    }

    ensure_output_dir()
    schema_audit_path = OUTPUT_DIR / "schema_audit.json"
    with open(schema_audit_path, 'w', encoding='utf-8') as f:
        json.dump(schema_audit, f, ensure_ascii=False, indent=2)
    print(f"  ✓ schema_audit.json → {schema_audit_path}")

    missing_fields_path = OUTPUT_DIR / "missing_fields.json"
    with open(missing_fields_path, 'w', encoding='utf-8') as f:
        json.dump(missing_fields_report, f, ensure_ascii=False, indent=2)
    print(f"  ✓ missing_fields.json → {missing_fields_path}")

    # ── 打印汇总 ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("Step 5.1 审计总结")
    print("=" * 70)
    print(f"""
  剧本总数:            {len(plays)}
  剧目类型数:           {len(type_dist)}
  总节点数:             {schema_audit['data_sources']['单剧本网络.json.gz']['total_nodes']}
  总边数:               {schema_audit['data_sources']['单剧本网络.json.gz']['total_edges']}

  metrics 已有指标:     {len(available_metrics)}
    - node_count ✓
    - edge_count ✓
    - density ✓
    - avg_clustering ✓
    - connected_components ✓
    - largest_component_ratio ✓
    - relation_type_distribution ✓ ({len(plays)-len(empty_rtd)}/{len(plays)} 覆盖)
    - core_characters ✓ ({len(plays)-len(empty_core)}/{len(plays)} 覆盖)

  异常项:
    - relation_type_distribution 为空:  {len(empty_rtd)} 部（均为 0-2 条边的剧）
    - core_characters 为空:            {len(empty_core)} 部
    - role_type 缺失的节点:            {sum(x['missing_count'] for x in nodes_no_role)}/{total_nodes}
    - 孤立节点（度=0，>1节点剧）:       {len(isolated_crowd) + len(isolated_real)} 个 (龙套{len(isolated_crowd)} + 个体{len(isolated_real)})
    - entity_id 对齐:                  {'✓ 完全对齐' if not only_unified and not only_play else '⚠ 不一致'}

  可额外补算的指标（无需重跑 LLM）:
    - centralization, degree_entropy, modularity
    - core_role_betweenness, diameter, assortativity

  后续步骤依赖:
    - Step 5.2 基础统计: 主要依赖 metrics 字段，可直接进行
    - Step 5.3 关系分布: 主要依赖 relation_type_distribution，可直接进行
    - Step 5.4 核心角色: 主要依赖 core_characters + nodes.betweenness_centrality，可直接进行
""")

    return schema_audit, missing_fields_report


# ═══════════════════════════════════════════════════════════════
# Step 5.2: 剧目类型分组与基础统计
# ═══════════════════════════════════════════════════════════════

def build_adjacency(nodes, edges):
    """从 nodes + edges 构建邻接表（基于 name 索引）"""
    name_to_idx = {n['name']: i for i, n in enumerate(nodes)}
    adj = {i: set() for i in range(len(nodes))}
    for e in edges:
        s = name_to_idx.get(e['source'])
        t = name_to_idx.get(e['target'])
        if s is not None and t is not None and s != t:
            adj[s].add(t)
            adj[t].add(s)
    return adj, name_to_idx


def compute_degree_stats(adj, node_indices):
    """计算指定节点的度统计"""
    if not node_indices:
        return {'degrees': [], 'max_deg': 0, 'mean_deg': 0}
    degrees = [len(adj[i]) for i in node_indices]
    return {
        'degrees': degrees,
        'max_deg': max(degrees) if degrees else 0,
        'mean_deg': sum(degrees) / len(degrees) if degrees else 0,
    }


def compute_clustering(adj, node_indices):
    """计算指定节点的平均聚类系数"""
    if len(node_indices) < 2:
        return 0.0
    coeffs = []
    for i in node_indices:
        neighbors = adj[i]
        k = len(neighbors)
        if k < 2:
            coeffs.append(0.0)
        else:
            edges_among = 0
            nlist = list(neighbors)
            for a in range(k):
                for b in range(a + 1, k):
                    if nlist[b] in adj[nlist[a]]:
                        edges_among += 1
            possible = k * (k - 1) / 2
            coeffs.append(edges_among / possible)
    return sum(coeffs) / len(coeffs) if coeffs else 0.0


def find_connected_components(adj, node_indices):
    """BFS 找连通分量，返回 (分量数, 最大分量占比)"""
    if not node_indices:
        return 0, 0.0
    visited = set()
    components = []
    for start in node_indices:
        if start in visited:
            continue
        # BFS
        queue = [start]
        visited.add(start)
        comp = []
        while queue:
            v = queue.pop(0)
            comp.append(v)
            for nb in adj[v]:
                if nb in node_indices and nb not in visited:
                    visited.add(nb)
                    queue.append(nb)
        components.append(comp)
    largest = max(len(c) for c in components) if components else 0
    return len(components), largest / len(node_indices) if node_indices else 0.0


def compute_centralization(degrees):
    """度中心化程度 = (max_deg - mean_deg) / max(mean_deg, 1)"""
    if not degrees:
        return 0.0
    max_deg = max(degrees)
    mean_deg = sum(degrees) / len(degrees)
    if mean_deg == 0:
        return 0.0
    return (max_deg - mean_deg) / mean_deg


def compute_degree_entropy(degrees):
    """归一化度分布熵"""
    import math
    n = len(degrees)
    if n <= 1 or sum(degrees) == 0:
        return 0.0
    total = sum(degrees)
    probs = [d / total for d in degrees if d > 0]
    if not probs:
        return 0.0
    entropy = -sum(p * math.log(p) for p in probs)
    max_entropy = math.log(n)
    return entropy / max_entropy if max_entropy > 0 else 0.0


def compute_play_metrics(play):
    """
    对单部剧本计算 full_graph 和 active_graph 两套指标。
    full_graph: 所有节点和边
    active_graph: 排除度中心性=0 的孤立节点
    """
    nodes = play.get('nodes', [])
    edges = play.get('edges', [])
    existing_metrics = play.get('metrics', {})

    adj, name_to_idx = build_adjacency(nodes, edges)
    all_indices = list(range(len(nodes)))

    # ── full_graph ──────────────────────────────────────
    full_deg_stats = compute_degree_stats(adj, all_indices)
    full_degrees = full_deg_stats['degrees']

    full_metrics = {
        'node_count': existing_metrics.get('node_count', len(nodes)),
        'edge_count': existing_metrics.get('edge_count', len(edges)),
        'density': existing_metrics.get('density', 0),
        'avg_clustering': existing_metrics.get('avg_clustering', 0),
        'connected_components': existing_metrics.get('connected_components', 0),
        'largest_component_ratio': existing_metrics.get('largest_component_ratio', 0),
        'centralization': compute_centralization(full_degrees),
        'degree_entropy': compute_degree_entropy(full_degrees),
    }

    # ── active_graph (排除孤立节点) ──────────────────────
    active_indices = [i for i in all_indices if len(adj[i]) > 0]
    # 如果所有节点都是孤立节点，active = full（保留至少1个节点避免除零）
    if not active_indices:
        active_indices = all_indices[:]

    active_deg_stats = compute_degree_stats(adj, active_indices)
    active_degrees = active_deg_stats['degrees']
    nc = len(active_indices)
    ec = sum(len(adj[i]) for i in active_indices) // 2  # 无向图边数

    active_density = (2 * ec) / (nc * (nc - 1)) if nc > 1 else 0.0
    active_clust = compute_clustering(adj, active_indices)
    active_cc, active_lcr = find_connected_components(adj, active_indices)

    active_metrics = {
        'node_count': nc,
        'edge_count': ec,
        'density': round(active_density, 6),
        'avg_clustering': round(active_clust, 4),
        'connected_components': active_cc,
        'largest_component_ratio': round(active_lcr, 4),
        'centralization': round(compute_centralization(active_degrees), 4),
        'degree_entropy': round(compute_degree_entropy(active_degrees), 4),
    }

    return {'full_graph': full_metrics, 'active_graph': active_metrics}


def distribution_stats(values):
    """对数值列表计算分布统计"""
    if not values:
        return {'mean': 0, 'median': 0, 'min': 0, 'max': 0, 'std': 0, 'p25': 0, 'p75': 0, 'count': 0}
    import math
    sv = sorted(values)
    n = len(sv)
    mean = sum(sv) / n
    variance = sum((x - mean) ** 2 for x in sv) / n
    std = math.sqrt(variance)

    def percentile(sorted_vals, p):
        k = (len(sorted_vals) - 1) * p / 100.0
        f = int(k)
        c = k - f
        if f + 1 >= len(sorted_vals):
            return sorted_vals[-1]
        return sorted_vals[f] + c * (sorted_vals[f + 1] - sorted_vals[f])

    return {
        'mean': round(mean, 4),
        'median': round(percentile(sv, 50), 4),
        'min': round(sv[0], 4),
        'max': round(sv[-1], 4),
        'std': round(std, 4),
        'p25': round(percentile(sv, 25), 4),
        'p75': round(percentile(sv, 75), 4),
        'count': n,
    }


def step_5_2(single_nets=None):
    """
    Step 5.2: 按剧目类型分组，计算双口径（full_graph / active_graph）基础统计。
    产出: data/processed/task2/network_by_type/basic_stats.json
    """
    print("=" * 70)
    print("Step 5.2: 剧目类型分组与基础统计（双口径）")
    print("=" * 70)

    # ── 加载数据 ──────────────────────────────────────────
    if single_nets is None:
        print("\n[1/3] 加载 单剧本网络.json.gz ...")
        single_nets = load_gz_json(SINGLE_NETWORK_GZ)

    plays = single_nets['plays']
    print(f"  ✓ 加载 {len(plays)} 部剧本")

    # ── 逐剧计算两套指标 ─────────────────────────────────
    print(f"\n[2/3] 计算每部剧的 full_graph / active_graph 指标 ...")
    play_results = []  # list of {entity_id, 剧本名, 剧目类型, full_graph: {...}, active_graph: {...}}
    skipped = 0
    for i, p in enumerate(plays):
        metrics = compute_play_metrics(p)
        play_results.append({
            'entity_id': p['entity_id'],
            '剧本名': p['剧本名'],
            '剧目类型': p.get('剧目类型', ''),
            **metrics,
        })
        if (i + 1) % 300 == 0:
            print(f"    处理进度: {i+1}/{len(plays)}")

    print(f"  ✓ 完成 {len(play_results)} 部")

    # ── 按剧目类型分组统计 ───────────────────────────────
    print(f"\n[3/3] 按剧目类型分组计算分布统计 ...")

    METRIC_KEYS = [
        'node_count', 'edge_count', 'density', 'avg_clustering',
        'connected_components', 'largest_component_ratio',
        'centralization', 'degree_entropy',
    ]

    # 分组
    type_groups = defaultdict(list)
    for pr in play_results:
        type_groups[pr['剧目类型']].append(pr)

    basic_stats = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'total_plays': len(plays),
            'metrics_computed': METRIC_KEYS,
            '口径说明': {
                'full_graph': '包含所有角色节点和关系边，反映完整角色表规模',
                'active_graph': '排除度中心性=0的孤立节点（龙套、无互动配角），反映真实互动结构',
            },
        },
        'by_type': {},
    }

    # 全局统计（所有剧）
    for scope in ['full_graph', 'active_graph']:
        basic_stats[f'global_{scope}'] = {}
        for key in METRIC_KEYS:
            values = [pr[scope][key] for pr in play_results]
            basic_stats[f'global_{scope}'][key] = distribution_stats(values)

    # 按类型统计
    for ptype in sorted(type_groups.keys()):
        group = type_groups[ptype]
        entry = {'play_count': len(group)}
        for scope in ['full_graph', 'active_graph']:
            entry[scope] = {}
            for key in METRIC_KEYS:
                values = [pr[scope][key] for pr in group]
                entry[scope][key] = distribution_stats(values)
        basic_stats['by_type'][ptype] = entry

    # ── 保存 ──────────────────────────────────────────────
    ensure_output_dir()
    output_path = OUTPUT_DIR / "basic_stats.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(basic_stats, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓ basic_stats.json → {output_path}")

    # ── 打印摘要 ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("Step 5.2 摘要: 各类型 full_graph 核心指标 (mean)")
    print("=" * 70)
    header = f"{'剧目类型':<12} {'数量':>5} {'节点':>6} {'边':>6} {'密度':>8} {'聚类':>6} {'分量':>5} {'中心化':>6} {'度熵':>6}"
    print(header)
    print("-" * len(header))
    for ptype in sorted(type_groups.keys()):
        entry = basic_stats['by_type'][ptype]
        fg = entry['full_graph']
        print(f"{ptype:<10} {entry['play_count']:>5} "
              f"{fg['node_count']['mean']:>6.1f} {fg['edge_count']['mean']:>6.1f} "
              f"{fg['density']['mean']:>8.4f} {fg['avg_clustering']['mean']:>6.3f} "
              f"{fg['connected_components']['mean']:>5.1f} {fg['centralization']['mean']:>6.2f} "
              f"{fg['degree_entropy']['mean']:>6.3f}")

    print(f"\n{'':>12} {'':>5} 以上为 full_graph 口径，详见 basic_stats.json 中 active_graph 统计")

    return basic_stats


# ═══════════════════════════════════════════════════════════════
# Step 5.3: 关系类型分布分析
# ═══════════════════════════════════════════════════════════════

def step_5_3(single_nets=None):
    """
    Step 5.3: 按剧目类型分析关系类型分布（macro + micro），双口径。
    产出: data/processed/task2/network_by_type/relation_type_distribution.json
    """
    print("=" * 70)
    print("Step 5.3: 关系类型分布分析（双口径：all / semantic）")
    print("=" * 70)

    # ── 加载数据 ──────────────────────────────────────────
    if single_nets is None:
        print("\n[1/4] 加载 单剧本网络.json.gz ...")
        single_nets = load_gz_json(SINGLE_NETWORK_GZ)

    plays = single_nets['plays']
    print(f"  ✓ 加载 {len(plays)} 部剧本")

    # ── 逐剧统计关系类型 ─────────────────────────────────
    print(f"\n[2/4] 逐剧统计 macro_type / micro_type ...")
    play_rel_stats = []  # {entity_id, 剧本名, 剧目类型, all_relations: {macro: {type: count}, micro: {...}}, semantic_relations: {...}}

    ALL_MACRO_TYPES = set()
    ALL_MICRO_TYPES = set()

    for i, p in enumerate(plays):
        edges = p.get('edges', [])
        # All relations
        all_macro = Counter()
        all_micro = Counter()
        # Semantic relations (exclude macro_type=中立)
        sem_macro = Counter()
        sem_micro = Counter()

        for e in edges:
            mt = e.get('relation_type', '未知')
            mit = e.get('micro_type', '未知')
            all_macro[mt] += 1
            all_micro[mit] += 1
            ALL_MACRO_TYPES.add(mt)
            ALL_MICRO_TYPES.add(mit)

            if mt != '中立':
                sem_macro[mt] += 1
                sem_micro[mit] += 1

        play_rel_stats.append({
            'entity_id': p['entity_id'],
            '剧本名': p['剧本名'],
            '剧目类型': p.get('剧目类型', ''),
            'total_edges': len(edges),
            'all_relations': {
                'macro_counts': dict(all_macro),
                'micro_counts': dict(all_micro),
            },
            'semantic_relations': {
                'macro_counts': dict(sem_macro),
                'micro_counts': dict(sem_micro),
            },
        })
        if (i + 1) % 400 == 0:
            print(f"    处理进度: {i+1}/{len(plays)}")

    print(f"  ✓ 完成 {len(play_rel_stats)} 部")
    print(f"  Macro types: {sorted(ALL_MACRO_TYPES)}")
    print(f"  Micro types: {len(ALL_MICRO_TYPES)} unique")

    # ── 全局关系类型分布 ─────────────────────────────────
    print(f"\n[3/4] 计算全局关系类型分布 ...")

    # 全局总计
    global_all_macro = Counter()
    global_all_micro = Counter()
    global_sem_macro = Counter()
    global_sem_micro = Counter()

    for prs in play_rel_stats:
        for mt, c in prs['all_relations']['macro_counts'].items():
            global_all_macro[mt] += c
        for mit, c in prs['all_relations']['micro_counts'].items():
            global_all_micro[mit] += c
        for mt, c in prs['semantic_relations']['macro_counts'].items():
            global_sem_macro[mt] += c
        for mit, c in prs['semantic_relations']['micro_counts'].items():
            global_sem_micro[mit] += c

    total_all = sum(global_all_macro.values())
    total_sem = sum(global_sem_macro.values())

    def build_type_dist(counter, total):
        """将 Counter 转为 {type: {count, ratio}} 排序列表"""
        return [
            {'type': t, 'count': c, 'ratio': round(c / max(total, 1), 4)}
            for t, c in counter.most_common()
        ]

    global_dist = {
        'all_relations': {
            'total': total_all,
            'macro': build_type_dist(global_all_macro, total_all),
            'micro': build_type_dist(global_all_micro, total_all),
        },
        'semantic_relations': {
            'total': total_sem,
            'note': '排除 macro_type=中立（含同场共现边），仅保留有明确语义标签的关系',
            'macro': build_type_dist(global_sem_macro, total_sem),
            'micro': build_type_dist(global_sem_micro, total_sem),
        },
    }

    # ── 按剧目类型分组 ────────────────────────────────────
    print(f"\n[4/4] 按剧目类型分组计算关系分布 ...")

    type_groups = defaultdict(list)
    for prs in play_rel_stats:
        type_groups[prs['剧目类型']].append(prs)

    by_type = {}

    for ptype in sorted(type_groups.keys()):
        group = type_groups[ptype]
        n = len(group)

        # 聚合计数
        all_macro = Counter()
        all_micro = Counter()
        sem_macro = Counter()
        sem_micro = Counter()

        for prs in group:
            for mt, c in prs['all_relations']['macro_counts'].items():
                all_macro[mt] += c
            for mit, c in prs['all_relations']['micro_counts'].items():
                all_micro[mit] += c
            for mt, c in prs['semantic_relations']['macro_counts'].items():
                sem_macro[mt] += c
            for mit, c in prs['semantic_relations']['micro_counts'].items():
                sem_micro[mit] += c

        t_all = sum(all_macro.values())
        t_sem = sum(sem_macro.values())

        # Top N
        def top_n(counter, total, n=5):
            return [
                {'type': t, 'count': c, 'ratio': round(c / max(total, 1), 4)}
                for t, c in counter.most_common(n)
            ]

        # 语义丰富度 = semantic_edges / total_edges
        semantic_enrichment = round(t_sem / max(t_all, 1), 4)

        # 代表性关系结构: 与全局 baseline 比较的 z-score
        def enrichment_zscore(type_counter, total, global_counter, global_total):
            """计算每个关系类型在该类型中相对于全局的富集程度"""
            if total == 0 or global_total == 0:
                return {}
            zscores = {}
            for t, c in type_counter.items():
                local_p = c / total
                global_p = global_counter.get(t, 0) / global_total
                # 用比例差 (percentage point difference) 直观表达
                zscores[t] = round(local_p - global_p, 4)
            return zscores

        sem_macro_enrich = enrichment_zscore(sem_macro, t_sem, global_sem_macro, total_sem)

        # 每剧均值统计
        per_play_all_macro_ratios = defaultdict(list)
        per_play_sem_macro_ratios = defaultdict(list)

        for prs in group:
            local_all_total = sum(prs['all_relations']['macro_counts'].values())
            local_sem_total = sum(prs['semantic_relations']['macro_counts'].values())
            for mt in ALL_MACRO_TYPES:
                c_all = prs['all_relations']['macro_counts'].get(mt, 0)
                per_play_all_macro_ratios[mt].append(c_all / max(local_all_total, 1))
                if mt != '中立':
                    c_sem = prs['semantic_relations']['macro_counts'].get(mt, 0)
                    per_play_sem_macro_ratios[mt].append(c_sem / max(local_sem_total, 1))

        # 构建 per-play distribution stats
        per_play_stats = {}
        for scope_name, ratio_dict in [('all_macro', per_play_all_macro_ratios), ('sem_macro', per_play_sem_macro_ratios)]:
            per_play_stats[scope_name] = {}
            for mt, vals in ratio_dict.items():
                if vals:
                    per_play_stats[scope_name][mt] = distribution_stats(vals)

        by_type[ptype] = {
            'play_count': n,
            'total_edges': t_all,
            'semantic_edges': t_sem,
            'semantic_enrichment': semantic_enrichment,
            'all_relations': {
                'total': t_all,
                'macro_top5': top_n(all_macro, t_all, 5),
                'micro_top10': top_n(all_micro, t_all, 10),
                'macro_full': build_type_dist(all_macro, t_all),
                'micro_full': build_type_dist(all_micro, t_all),
            },
            'semantic_relations': {
                'total': t_sem,
                'macro_top5': top_n(sem_macro, t_sem, 5),
                'micro_top10': top_n(sem_micro, t_sem, 10),
                'macro_full': build_type_dist(sem_macro, t_sem),
                'micro_full': build_type_dist(sem_micro, t_sem),
            },
            'enrichment_vs_global': {
                'semantic_macro_pp_diff': sem_macro_enrich,
                'note': '正值为该类型中占比高于全局均值，负值为低于。用于识别该类剧的特征关系类型。',
            },
            'per_play_ratio_stats': per_play_stats,
        }

    # ── 输出 ──────────────────────────────────────────────
    output = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'total_plays': len(plays),
            'total_edges_all': total_all,
            'total_edges_semantic': total_sem,
            '口径说明': {
                'all_relations': '包含所有关系边（macro_type=中立 约占69%，主要为同场共现），反映完整网络关系分布',
                'semantic_relations': '排除 macro_type=中立，仅保留具有明确语义标签的关系（亲属/同盟/从属/敌对/情感），用于分析真正的角色戏剧关系',
            },
        },
        'global': global_dist,
        'by_type': by_type,
    }

    ensure_output_dir()
    output_path = OUTPUT_DIR / "relation_type_distribution.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓ relation_type_distribution.json → {output_path}")

    # ── 打印摘要 ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("Step 5.3 摘要: 各类型 semantic_relations macro 分布 (Top 3)")
    print("=" * 70)

    for ptype in sorted(type_groups.keys()):
        entry = by_type[ptype]
        sem = entry['semantic_relations']
        enrich = entry['enrichment_vs_global']['semantic_macro_pp_diff']
        top3 = sem['macro_top5'][:3]
        parts = [f"{t['type']}({t['ratio']*100:.1f}%, Δ{enrich.get(t['type'],0)*100:+.1f}pp)" for t in top3]
        print(f"  {ptype:<10} (n={entry['play_count']:>4}, sem_enrich={entry['semantic_enrichment']:.2f}): {' | '.join(parts)}")

    print(f"\n  Δ = 与全局比例的百分点差，正值表示该类型剧目显著偏多")

    # ── 验收标准检查 ──────────────────────────────────────
    print("\n" + "─" * 70)
    print("验收标准检查")
    print("─" * 70)

    checks = []
    for ptype, entry in by_type.items():
        sem = entry['semantic_relations']
        macro = {t['type']: t['ratio'] for t in sem['macro_full']}
        micro = {t['type']: t['ratio'] for t in sem['micro_full']}
        enrich = entry['enrichment_vs_global']['semantic_macro_pp_diff']

        if ptype == '家庭戏':
            kin_ratio = macro.get('亲属', 0)
            checks.append(f"  家庭戏亲属占比: {kin_ratio*100:.1f}% {'✓ 以亲属为主' if kin_ratio > 0.25 else '⚠ 需核查'}")
            checks.append(f"    亲属 enrichment: {enrich.get('亲属', 0)*100:+.1f}pp")

        if ptype in ('历史戏',):
            cong_ratio = macro.get('从属', 0)
            ally_ratio = macro.get('同盟', 0)
            host_ratio = macro.get('敌对', 0)
            checks.append(f"  历史戏从属+同盟+敌对占比: {(cong_ratio+ally_ratio+host_ratio)*100:.1f}%")
            checks.append(f"    从属 Δ{enrich.get('从属',0)*100:+.1f}pp | 同盟 Δ{enrich.get('同盟',0)*100:+.1f}pp | 敌对 Δ{enrich.get('敌对',0)*100:+.1f}pp")

        if ptype == '公案戏':
            host_ratio = macro.get('敌对', 0)
            checks.append(f"  公案戏敌对占比: {host_ratio*100:.1f}% (Δ{enrich.get('敌对',0)*100:+.1f}pp)")
            # Check for 审判/调查/对立 in micro
            trial_micro = sum(micro.get(k, 0) for k in ['官民', '仇人', '政敌', '阵营对立', '审判', '调查'] if k in micro)
            checks.append(f"    审判/对立类 micro_types 占比: {trial_micro*100:.1f}%")

        if ptype == '爱情戏':
            emot_ratio = macro.get('情感', 0)
            checks.append(f"  爱情戏情感占比: {emot_ratio*100:.1f}% (Δ{enrich.get('情感',0)*100:+.1f}pp)")

        if ptype == '神话戏':
            ally_ratio = macro.get('同盟', 0)
            checks.append(f"  神话戏同盟占比: {ally_ratio*100:.1f}% (Δ{enrich.get('同盟',0)*100:+.1f}pp)")

    for c in checks:
        print(c)

    return output


# ═══════════════════════════════════════════════════════════════
# Step 5.4A: 行当补全
# ═══════════════════════════════════════════════════════════════

def build_role_type_lookup():
    """
    构建角色名→行当的查找表，来源优先级:
    1. 原始 JSON 的 主要角色 字段（per-play，最权威，覆盖率 ~83%）
    2. 角色字典.json.gz 内部条目（per-play，覆盖率 ~35%）
    3. 跨剧本全局映射（cross-play，同名角色取最高频行当，覆盖率 ~23%）
    """
    import re
    import glob
    from collections import Counter as Ctr

    # ── 来源1: 原始 JSON 主要角色 (per-play) ────────────
    raw_dir = '/workspace/HumanVIZ/data/raw/dataSet'
    raw_jsons = glob.glob(os.path.join(raw_dir, '*/*.json'))
    # {剧本名: {角色名: 行当}}
    raw_lookup = {}
    raw_parsed = 0
    raw_roles = 0

    for fp in raw_jsons:
        with open(fp, encoding='utf-8') as f:
            d = json.load(f)
        name = d.get('剧本名字', '')
        mr = d.get('主要角色', '')
        if not mr or not name:
            continue
        role_map = {}
        for line in mr.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            parts = re.split(r'[：:]', line, maxsplit=1)
            if len(parts) == 2:
                rn = parts[0].strip()
                rt = parts[1].strip()
                if rn and rt and len(rt) <= 6:  # 行当名称通常不超过6字
                    role_map[rn] = rt
        if role_map:
            raw_lookup[name] = role_map
            raw_parsed += 1
            raw_roles += len(role_map)

    print(f"  来源1 (原始JSON 主要角色, per-play): {raw_parsed} 部剧, {raw_roles} 个角色-行当映射")

    # ── 来源2: 角色字典.json.gz (per-play) ──────────────
    dict_lookup = {}  # {entity_id: {角色名: 行当}}
    dict_roles = 0

    dict_data = load_gz_json(DATA_DIR / "角色字典.json.gz")
    for play in dict_data:
        eid = play['entity_id']
        rm = {}
        for rn, info in play['角色字典'].items():
            rt = info.get('role_type', '')
            if rt:
                rm[rn] = rt
        if rm:
            dict_lookup[eid] = rm
            dict_roles += len(rm)

    print(f"  来源2 (角色字典.json.gz, per-play): {len(dict_lookup)} 部剧, {dict_roles} 个角色-行当映射")

    # ── 来源3: 跨剧本全局映射 (cross-play) ──────────────
    # 从所有 raw JSON 的 主要角色 中聚合全局角色名→行当
    # 同名角色在不同剧中行当应一致，用最高频行当解决少数冲突
    global_role_types = {}  # {角色名: 行当}
    global_name_counter = Ctr()  # {角色名: Ctr(行当)}
    global_name_plays = Ctr()    # {角色名: 出现剧数}

    for fp in raw_jsons:
        with open(fp, encoding='utf-8') as f:
            d = json.load(f)
        mr = d.get('主要角色', '')
        if not mr:
            continue
        seen = set()
        for line in mr.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            parts = re.split(r'[：:]', line, maxsplit=1)
            if len(parts) == 2:
                rn = parts[0].strip()
                rt = parts[1].strip()
                if rn and rt and len(rt) <= 6 and rn not in seen:
                    if rn not in global_name_counter:
                        global_name_counter[rn] = Ctr()
                    global_name_counter[rn][rt] += 1
                    global_name_plays[rn] += 1
                    seen.add(rn)

    # 取最高频行当
    conflicts = 0
    for rn, rt_counter in global_name_counter.items():
        best_rt = rt_counter.most_common(1)[0][0]
        global_role_types[rn] = best_rt
        if len(rt_counter) > 1:
            conflicts += 1

    print(f"  来源3 (跨剧本全局映射): {len(global_role_types)} 唯一角色名, "
          f"出现>1剧: {sum(1 for n,c in global_name_plays.items() if c>1)}, "
          f"行当冲突: {conflicts} ({conflicts/max(len(global_role_types),1)*100:.1f}%)")

    return raw_lookup, dict_lookup, global_role_types


def step_5_4A(single_nets=None):
    """
    Step 5.4A: 从 主要角色 / 角色字典 补全 nodes.role_type。
    产出: data/processed/task2/network_by_type/role_type_completion_audit.json
    返回: 补全后的 plays 列表（用于 Step 5.4）
    """
    print("=" * 70)
    print("Step 5.4A: 行当补全")
    print("=" * 70)

    if single_nets is None:
        print("\n[1/4] 加载 单剧本网络.json.gz ...")
        single_nets = load_gz_json(SINGLE_NETWORK_GZ)

    plays = single_nets['plays']

    # ── 构建查找表 ──────────────────────────────────────
    print("\n[2/4] 构建行当查找表 (三级: per-play raw → per-play dict → cross-play global) ...")
    raw_lookup, dict_lookup, global_role_types = build_role_type_lookup()

    # ── 逐剧补全 ────────────────────────────────────────
    print(f"\n[3/4] 逐剧补全 role_type ...")

    # 统计
    before_total = 0
    before_missing = 0
    after_missing = 0
    filled_from_raw = 0
    filled_from_dict = 0
    filled_from_cross_play = 0
    still_missing = 0
    plays_benefited = set()

    # 按类型统计
    type_stats = defaultdict(lambda: {'total': 0, 'before_missing': 0, 'after_missing': 0})
    # 核心角色跟踪 (度中心性 top-3 per play)
    core_role_issues = []

    # 深度拷贝 plays 以避免修改原数据
    import copy
    enriched_plays = copy.deepcopy(plays)

    for p in enriched_plays:
        eid = p['entity_id']
        pname = p['剧本名']
        ptype = p.get('剧目类型', '')

        # 从两个来源获取补全映射
        raw_rm = raw_lookup.get(pname, {})
        dict_rm = dict_lookup.get(eid, {})

        nodes = p.get('nodes', [])
        # Sort nodes by degree_centrality for core role tracking
        nodes_sorted = sorted(nodes, key=lambda n: n.get('degree_centrality', 0), reverse=True)
        core_candidates = nodes_sorted[:min(3, len(nodes_sorted))]

        for n in nodes:
            before_total += 1
            type_stats[ptype]['total'] += 1

            if not n.get('role_type'):
                before_missing += 1
                type_stats[ptype]['before_missing'] += 1

                # Priority 1: raw 主要角色
                if n['name'] in raw_rm:
                    n['role_type'] = raw_rm[n['name']]
                    filled_from_raw += 1
                    plays_benefited.add(eid)
                # Priority 2: 角色字典 (per-play)
                elif n['name'] in dict_rm:
                    n['role_type'] = dict_rm[n['name']]
                    filled_from_dict += 1
                    plays_benefited.add(eid)
                # Priority 3: 跨剧本全局映射
                elif n['name'] in global_role_types:
                    n['role_type'] = global_role_types[n['name']]
                    filled_from_cross_play += 1
                    plays_benefited.add(eid)
                # Fallback: 未知
                else:
                    n['role_type'] = '未知'
                    still_missing += 1
                    type_stats[ptype]['after_missing'] += 1

        # 检查核心角色中仍有缺失的
        for n in core_candidates:
            if n.get('role_type') == '未知' or not n.get('role_type'):
                core_role_issues.append({
                    'entity_id': eid,
                    '剧本名': pname,
                    '剧目类型': ptype,
                    '角色名': n['name'],
                    'degree_centrality': n.get('degree_centrality', 0),
                    'dialogue_count': n.get('dialogue_count', 0),
                })

    after_missing = still_missing
    # Count after-missing for stats that had role_type before
    for p in enriched_plays:
        ptype = p.get('剧目类型', '')
        for n in p.get('nodes', []):
            if n.get('role_type') == '未知':
                pass  # already counted above
            elif not n.get('role_type'):
                pass  # shouldn't happen, but just in case

    # ── 生成审计报告 ────────────────────────────────────
    print(f"\n[4/4] 生成审计报告 ...")

    # 重算 after stats more carefully
    type_after_stats = defaultdict(lambda: {'total': 0, 'missing': 0, 'has_role': 0})
    for p in enriched_plays:
        ptype = p.get('剧目类型', '')
        for n in p.get('nodes', []):
            type_after_stats[ptype]['total'] += 1
            if n.get('role_type') and n['role_type'] != '未知':
                type_after_stats[ptype]['has_role'] += 1
            else:
                type_after_stats[ptype]['missing'] += 1

    total_after = sum(s['total'] for s in type_after_stats.values())
    total_missing_after = sum(s['missing'] for s in type_after_stats.values())
    total_has_after = sum(s['has_role'] for s in type_after_stats.values())

    # ── 细分缺失原因 ────────────────────────────────────
    # 功能性角色关键词：这些角色几乎不可能有行当信息
    FUNCTIONAL_KEYWORDS = {'龙套', '下手', '文堂', '青袍', '小甲', '兵士', '将官',
                           '太监', '宫女', '衙役', '校尉', '武士', '打手', '英雄',
                           '刀斧手', '家丁', '喽啰', '皂隶', '神兵', '神将', '仙童',
                           '仙女', '军士', '百姓', '众人', '旗牌', '报子', '中军',
                           '家院', '院子', '童儿', '船夫', '车夫', '马夫', '更夫',
                           '禁卒', '刽子手', '解差', '班头', '朝官', '差人', '门子',
                           '四', '八', '二', '众', '各'}

    functional_unknown = 0
    named_unknown = 0
    for p in enriched_plays:
        for n in p.get('nodes', []):
            if n.get('role_type') == '未知':
                name = n['name']
                is_functional = any(kw in name for kw in FUNCTIONAL_KEYWORDS)
                if is_functional:
                    functional_unknown += 1
                else:
                    named_unknown += 1

    audit = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'description': '从 原始JSON主要角色 + 角色字典 补全 nodes.role_type，无法补全的统一标记为"未知"',
            'sources': {
                '主要角色': '原始JSON中的主要角色字段，约5-8个/剧，仅含主要人物',
                '角色字典': 'Steps 2-4从对话中提取的角色字典，部分含行当',
                '说明': '功能性角色（旗牌、报子、龙套等）不出现在主要角色中，统一标记为未知',
            },
        },
        'overall': {
            'total_nodes': before_total,
            'before_completion': {
                'has_role_type': before_total - before_missing,
                'missing_role_type': before_missing,
                'missing_rate': round(before_missing / before_total * 100, 2),
            },
            'after_completion': {
                'has_role_type': total_has_after,
                'marked_unknown': total_missing_after,
                'unknown_rate': round(total_missing_after / total_after * 100, 2),
                'unknown_breakdown': {
                    'functional_characters_expected': functional_unknown,
                    'named_characters_unexpected': named_unknown,
                    'note': '功能性角色（龙套/报子/旗牌等）本无行当，标记未知属正常；有名有姓的未知需关注',
                },
            },
            'fill_sources': {
                'from_per_play_raw': filled_from_raw,
                'from_per_play_dict': filled_from_dict,
                'from_cross_play_global': filled_from_cross_play,
                'newly_filled_total': filled_from_raw + filled_from_dict + filled_from_cross_play,
                'improvement_pct': round((filled_from_raw + filled_from_dict + filled_from_cross_play) / max(before_missing, 1) * 100, 2),
                'note': '跨剧本全局映射: 同名角色在不同剧中取最高频行当，3,355个唯一名，冲突率<2%',
            },
        },
        'by_type': {},
        'core_role_issues': {
            'count': len(core_role_issues),
            'note': '度中心性 Top-3 中仍缺行当的核心角色（高中心性但无行当=需关注）',
            'details': core_role_issues[:50],
        },
    }

    for ptype in sorted(type_after_stats.keys()):
        s = type_after_stats[ptype]
        bs = type_stats[ptype]
        audit['by_type'][ptype] = {
            'total_nodes': s['total'],
            'before_missing': bs['before_missing'],
            'before_missing_rate': round(bs['before_missing'] / max(s['total'], 1) * 100, 2),
            'after_missing': s['missing'],
            'after_missing_rate': round(s['missing'] / max(s['total'], 1) * 100, 2),
            'has_role_type': s['has_role'],
            'completion_rate': round(s['has_role'] / max(s['total'], 1) * 100, 2),
        }

    ensure_output_dir()
    output_path = OUTPUT_DIR / "role_type_completion_audit.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(audit, f, ensure_ascii=False, indent=2)
    print(f"  ✓ role_type_completion_audit.json → {output_path}")

    # ── 打印摘要 ────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"Step 5.4A 摘要: 行当补全结果")
    print(f"{'='*70}")
    print(f"  总节点: {before_total}")
    print(f"  补全前缺失: {before_missing} ({before_missing/before_total*100:.1f}%)")
    print(f"  补全后标记未知: {total_missing_after} ({total_missing_after/total_after*100:.1f}%)")
    print(f"    其中功能性角色(预期): {functional_unknown}")
    print(f"    其中有名有姓(需关注): {named_unknown}")
    print(f"  来源-per-play_raw: {filled_from_raw} | per-play_dict: {filled_from_dict} | cross-play_global: {filled_from_cross_play}")
    print(f"  受益剧本数: {len(plays_benefited)} 部")
    print(f"\n  按类型补全率:")
    for ptype in sorted(type_after_stats.keys()):
        s = audit['by_type'][ptype]
        print(f"    {ptype:<10}: {s['before_missing_rate']:.1f}% → {s['after_missing_rate']:.1f}% "
              f"(补全率 {s['completion_rate']:.1f}%)")
    print(f"\n  核心角色仍有缺失: {len(core_role_issues)} 个")

    return enriched_plays, audit


# ═══════════════════════════════════════════════════════════════
# Step 5.4: 核心角色与行当分布分析
# ═══════════════════════════════════════════════════════════════

def step_5_4(enriched_plays=None, single_nets=None):
    """
    Step 5.4: 核心角色识别与行当分布分析。
    需要先执行 Step 5.4A 补全行当。
    产出: core_roles.json, core_role_hangdang_distribution.json
    """
    print("=" * 70)
    print("Step 5.4: 核心角色与行当分布分析")
    print("=" * 70)

    # ── 加载/准备数据 ────────────────────────────────────
    if enriched_plays is None:
        print("\n[1/5] 行当未补全，先执行 Step 5.4A ...")
        enriched_plays, _ = step_5_4A(single_nets)
    else:
        print(f"\n[1/5] 使用已补全的数据: {len(enriched_plays)} 部剧")

    plays = enriched_plays

    # ── 提取每剧核心角色 ─────────────────────────────────
    print(f"\n[2/5] 提取每剧核心角色（度中心性 + 介数中心性）...")

    # 全局行当规范
    ROLE_TYPE_NORMALIZE = {
        '正生': '生', '副生': '生', '老生': '生', '小生': '生', '武生': '生',
        '红生': '生', '末': '生', '外': '生', '须生': '生', '生': '生',
        '正旦': '旦', '青衣': '旦', '花旦': '旦', '武旦': '旦', '老旦': '旦',
        '旦': '旦', '小旦': '旦', '闺门旦': '旦', '刀马旦': '旦', '彩旦': '旦',
        '正净': '净', '副净': '净', '净': '净', '武净': '净', '铜锤花脸': '净',
        '丑': '丑', '文丑': '丑', '武丑': '丑', '小丑': '丑', '老丑': '丑',
        '未知': '未知', '': '未知',
    }

    def normalize_rt(rt):
        return ROLE_TYPE_NORMALIZE.get(rt, rt)

    core_roles_per_play = []  # 每剧的核心角色列表
    all_core_roles = []       # 所有核心角色（跨剧）

    for p in plays:
        nodes = p.get('nodes', [])
        if not nodes:
            continue

        # 按度中心性排序
        by_degree = sorted(nodes, key=lambda n: n.get('degree_centrality', 0), reverse=True)
        # 按介数中心性排序
        by_between = sorted(nodes, key=lambda n: n.get('betweenness_centrality', 0), reverse=True)

        top_degree = by_degree[0] if by_degree else None
        top_between = by_between[0] if by_between else None

        # 取度中心性 Top-3（排除 degree=0）
        top3 = [n for n in by_degree[:5] if n.get('degree_centrality', 0) > 0][:3]

        # 计算集中度：top1_degree / sum_of_all_degrees
        total_deg = sum(n.get('degree_centrality', 0) for n in nodes)
        concentration = top_degree['degree_centrality'] / max(total_deg, 0.001) if top_degree else 0

        core_entry = {
            'entity_id': p['entity_id'],
            '剧本名': p['剧本名'],
            '剧目类型': p.get('剧目类型', ''),
            'node_count': len(nodes),
            'degree_concentration': round(concentration, 4),
            'top_by_degree': {
                'name': top_degree['name'] if top_degree else '',
                'role_type': normalize_rt(top_degree.get('role_type', '未知')) if top_degree else '未知',
                'original_role_type': top_degree.get('role_type', '') if top_degree else '',
                'degree_centrality': top_degree.get('degree_centrality', 0) if top_degree else 0,
                'betweenness_centrality': top_degree.get('betweenness_centrality', 0) if top_degree else 0,
                'dialogue_count': top_degree.get('dialogue_count', 0) if top_degree else 0,
            } if top_degree else None,
            'top_by_betweenness': {
                'name': top_between['name'] if top_between else '',
                'role_type': normalize_rt(top_between.get('role_type', '未知')) if top_between else '未知',
                'degree_centrality': top_between.get('degree_centrality', 0) if top_between else 0,
                'betweenness_centrality': top_between.get('betweenness_centrality', 0) if top_between else 0,
            } if top_between else None,
            'top3_by_degree': [
                {
                    'name': n['name'],
                    'role_type': normalize_rt(n.get('role_type', '未知')),
                    'degree_centrality': n.get('degree_centrality', 0),
                    'dialogue_count': n.get('dialogue_count', 0),
                }
                for n in top3
            ],
            'is_single_protagonist': len(top3) >= 2 and (
                top3[0]['degree_centrality'] > top3[1]['degree_centrality'] * 2
            ) if len(top3) >= 2 else (len(top3) == 1),
        }

        core_roles_per_play.append(core_entry)

        # 收集所有核心角色
        for n in top3:
            all_core_roles.append({
                'name': n['name'],
                'role_type': normalize_rt(n.get('role_type', '未知')),
                'original_role_type': n.get('role_type', ''),
                'degree_centrality': n.get('degree_centrality', 0),
                'betweenness_centrality': n.get('betweenness_centrality', 0),
                'dialogue_count': n.get('dialogue_count', 0),
                'entity_id': p['entity_id'],
                '剧本名': p['剧本名'],
                '剧目类型': p.get('剧目类型', ''),
            })

    print(f"  ✓ 提取 {len(core_roles_per_play)} 部剧的核心角色")
    print(f"  ✓ 总核心角色次数: {len(all_core_roles)}")

    # ── 按剧目类型聚合核心角色行当 ──────────────────────
    print(f"\n[3/5] 按剧目类型统计核心角色行当分布 ...")

    type_groups = defaultdict(list)
    for cr in all_core_roles:
        type_groups[cr['剧目类型']].append(cr)

    # 行当计数
    ALL_ROLE_TYPES = ['生', '旦', '净', '丑', '未知']

    hangdang_by_type = {}
    for ptype in sorted(type_groups.keys()):
        roles = type_groups[ptype]
        rt_counter = Counter(normalize_rt(r['role_type']) for r in roles)
        total = len(roles)
        hangdang_by_type[ptype] = {
            'total_core_roles': total,
            'distribution': {
                rt: {
                    'count': rt_counter.get(rt, 0),
                    'ratio': round(rt_counter.get(rt, 0) / max(total, 1), 4),
                }
                for rt in ALL_ROLE_TYPES
            },
            'dominant_hangdang': rt_counter.most_common(2) if rt_counter else [],
        }

    # ── 单一主角分析 ────────────────────────────────────
    print(f"\n[4/5] 分析单一主角倾向 ...")

    single_protagonist_by_type = defaultdict(lambda: {'count': 0, 'total': 0})
    for cr in core_roles_per_play:
        pt = cr['剧目类型']
        single_protagonist_by_type[pt]['total'] += 1
        if cr['is_single_protagonist']:
            single_protagonist_by_type[pt]['count'] += 1

    protagonist_analysis = {}
    for pt in sorted(single_protagonist_by_type.keys()):
        s = single_protagonist_by_type[pt]
        protagonist_analysis[pt] = {
            'total_plays': s['total'],
            'single_protagonist_plays': s['count'],
            'single_protagonist_ratio': round(s['count'] / max(s['total'], 1), 4),
        }

    # ── 核心角色关系类型倾向 ────────────────────────────
    print(f"\n[5/5] 分析核心角色的关系类型倾向 ...")

    # 构建每个核心角色的关系类型计数
    core_relation_tendency = defaultdict(lambda: defaultdict(Counter))  # {剧目类型: {角色名: Counter(relation_type)}}

    for p in plays:
        ptype = p.get('剧目类型', '')
        edges = p.get('edges', [])
        # 找出核心角色 names
        core_names = set()
        nodes_by_deg = sorted(p.get('nodes', []), key=lambda n: n.get('degree_centrality', 0), reverse=True)
        for n in nodes_by_deg[:3]:
            if n.get('degree_centrality', 0) > 0:
                core_names.add(n['name'])

        for e in edges:
            rt = e.get('relation_type', '')
            if rt == '中立':
                continue  # semantic only
            if e['source'] in core_names:
                core_relation_tendency[ptype][e['source']][rt] += 1
            if e['target'] in core_names:
                core_relation_tendency[ptype][e['target']][rt] += 1

    # 按类型聚合核心角色的关系类型
    core_rel_by_type = {}
    for ptype in sorted(core_relation_tendency.keys()):
        agg = Counter()
        for role_name, rel_counts in core_relation_tendency[ptype].items():
            for rt, c in rel_counts.items():
                agg[rt] += c
        total = sum(agg.values())
        core_rel_by_type[ptype] = {
            'total_core_relations': total,
            'distribution': {rt: {'count': c, 'ratio': round(c / max(total, 1), 4)}
                             for rt, c in agg.most_common()},
            'top_relation_types': agg.most_common(3),
        }

    # ── 保存输出 ────────────────────────────────────────
    ensure_output_dir()

    # core_roles.json
    core_roles_output = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'total_plays': len(plays),
            'description': '每部剧的核心角色识别（度中心性 + 介数中心性）',
            '行当说明': '行当已归一化为 生/旦/净/丑/未知 五类',
        },
        'summary': {
            'total_core_role_occurrences': len(all_core_roles),
            'plays_with_identified_core': sum(1 for cr in core_roles_per_play if cr['top_by_degree']),
            'degree_concentration_mean': round(
                sum(cr['degree_concentration'] for cr in core_roles_per_play) / max(len(core_roles_per_play), 1), 4
            ),
            'single_protagonist_global_ratio': round(
                sum(1 for cr in core_roles_per_play if cr['is_single_protagonist']) / max(len(core_roles_per_play), 1), 4
            ),
        },
        'plays': core_roles_per_play,
    }

    output_path = OUTPUT_DIR / "core_roles.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(core_roles_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ core_roles.json → {output_path}")

    # core_role_hangdang_distribution.json
    hangdang_output = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'description': '按剧目类型的核心角色行当分布与关系倾向',
        },
        'hangdang_distribution': hangdang_by_type,
        'single_protagonist_analysis': protagonist_analysis,
        'core_relation_tendency': core_rel_by_type,
    }

    output_path2 = OUTPUT_DIR / "core_role_hangdang_distribution.json"
    with open(output_path2, 'w', encoding='utf-8') as f:
        json.dump(hangdang_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ core_role_hangdang_distribution.json → {output_path2}")

    # ── 打印摘要 ────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"Step 5.4 摘要: 核心角色行当分布")
    print(f"{'='*70}")

    header = f"{'类型':<10} {'核心角色':>5} {'生%':>6} {'旦%':>6} {'净%':>6} {'丑%':>6} {'未知%':>6} {'主导行当':<8} {'单一主角%':>8}"
    print(header)
    print("-" * len(header))
    for ptype in sorted(hangdang_by_type.keys()):
        h = hangdang_by_type[ptype]
        dom = h['dominant_hangdang'][0][0] if h['dominant_hangdang'] else '?'
        sp = protagonist_analysis.get(ptype, {}).get('single_protagonist_ratio', 0)
        print(f"{ptype:<10} {h['total_core_roles']:>5} "
              f"{h['distribution']['生']['ratio']*100:>5.1f} {h['distribution']['旦']['ratio']*100:>5.1f} "
              f"{h['distribution']['净']['ratio']*100:>5.1f} {h['distribution']['丑']['ratio']*100:>5.1f} "
              f"{h['distribution']['未知']['ratio']*100:>5.1f} {dom:<8} {sp*100:>7.1f}%")

    print(f"\n  核心角色关系倾向 (semantic):")
    for ptype in sorted(core_rel_by_type.keys()):
        top = core_rel_by_type[ptype]['top_relation_types']
        parts = [f"{rt}({c})" for rt, c in top[:3]]
        print(f"    {ptype:<10}: {', '.join(parts)}")

    # ── 验收标准检查 ────────────────────────────────────
    print(f"\n{'─'*70}")
    print(f"验收标准检查")
    print(f"{'─'*70}")
    plays_with_core = sum(1 for cr in core_roles_per_play if cr['top_by_degree'])
    print(f"  每部剧至少一个核心角色: {plays_with_core}/{len(core_roles_per_play)} {'✓' if plays_with_core == len(core_roles_per_play) else '⚠'}")

    # 行当差异
    for ptype in ['历史戏', '家庭戏', '爱情戏', '公案戏']:
        if ptype in hangdang_by_type:
            h = hangdang_by_type[ptype]
            dom = h['dominant_hangdang']
            print(f"  {ptype} 主导行当: {dom[0][0] if dom else '?'} ({dom[0][1]/h['total_core_roles']*100:.1f}% of core)")

    # 单一主角
    for ptype in ['历史戏', '家庭戏', '技法展示戏']:
        if ptype in protagonist_analysis:
            sp = protagonist_analysis[ptype]
            print(f"  {ptype} 依赖单一主角: {sp['single_protagonist_ratio']*100:.1f}%")

    return core_roles_output, hangdang_output


# ═══════════════════════════════════════════════════════════════
# Step 5.4D: LLM 行当补全（目标类型高价值未知角色）
# ═══════════════════════════════════════════════════════════════

def step_5_4D_llm(enriched_plays=None, single_nets=None, dry_run=False):
    """
    对家庭戏/侠义戏/神话戏中 Top3 核心但行当未知的非功能性角色，
    用 LLM 根据对白上下文推断行当。

    阈值:
      confidence >= 0.75: 自动填充
      0.55 <= confidence < 0.75: 标记 needs_review
      confidence < 0.55: 保持未知

    产出: data/processed/task2/network_by_type/llm_role_type_results.json
    """
    import re as _re
    import glob as _glob
    import requests as _requests
    import time as _time
    import copy as _copy

    print("=" * 70)
    print("Step 5.4D: LLM 行当补全（P0+P1 高价值目标）")
    print("=" * 70)

    # ── 准备数据 ──────────────────────────────────────────
    if enriched_plays is None:
        print("\n[1/6] 行当未补全，先执行 Step 5.4A ...")
        enriched_plays, _ = step_5_4A(single_nets)
    else:
        print(f"\n[1/6] 使用已补全的数据: {len(enriched_plays)} 部剧")

    plays = enriched_plays

    # 功能性与行当归一化
    FUNCTIONAL_KEYWORDS = {'龙套','下手','文堂','青袍','小甲','兵士','将官',
        '太监','宫女','衙役','校尉','武士','打手','英雄','刀斧手','家丁',
        '喽啰','皂隶','神兵','神将','仙童','仙女','军士','百姓','众人',
        '旗牌','报子','中军','家院','院子','童儿','船夫','车夫','马夫',
        '更夫','禁卒','刽子手','解差','班头','朝官','差人','门子',
        '四','八','二','众','各'}
    def _is_func(name):
        return any(kw in name for kw in FUNCTIONAL_KEYWORDS)

    TARGET_TYPES = {'家庭戏', '侠义戏', '神话戏'}
    ROLE_TYPE_CATEGORIES = ['生','旦','净','丑','末','外','贴','老旦','武生','武旦','武净','武丑','小生','小旦','小丑','未知']

    # ── 识别 LLM 目标角色 ────────────────────────────────
    print(f"\n[2/6] 识别 LLM 目标角色 (P0+P1, 剔功能性)...")

    # 需要从 raw JSON 提取对白 → 先构建 raw JSON 查找表
    raw_dir = '/workspace/HumanVIZ/data/raw/dataSet'
    raw_jsons = _glob.glob(os.path.join(raw_dir, '*/*.json'))
    raw_by_name = {}
    for fp in raw_jsons:
        with open(fp, encoding='utf-8') as f:
            d = json.load(f)
        name = d.get('剧本名字', '')
        if name:
            raw_by_name[name] = d

    # 收集目标角色，按剧本分组
    play_targets = defaultdict(list)  # {play_name: [{角色信息}]}

    for p in plays:
        ptype = p.get('剧目类型', '')
        if ptype not in TARGET_TYPES:
            continue

        # 按度中心性排序取 Top3
        sorted_nodes = sorted(p.get('nodes', []),
                             key=lambda n: n.get('degree_centrality', 0), reverse=True)
        top3 = [n for n in sorted_nodes if n.get('degree_centrality', 0) > 0][:3]

        for rank, n in enumerate(top3):
            rt = n.get('role_type', '')
            if rt and rt != '未知':
                continue
            if _is_func(n['name']):
                continue

            # Get interaction partners from edges
            partners = set()
            for e in p.get('edges', []):
                if e['source'] == n['name']:
                    partners.add(e['target'])
                elif e['target'] == n['name']:
                    partners.add(e['source'])

            play_targets[p['剧本名']].append({
                'entity_id': p['entity_id'],
                'name': n['name'],
                'rank': rank + 1,
                'degree_centrality': n.get('degree_centrality', 0),
                'betweenness_centrality': n.get('betweenness_centrality', 0),
                'dialogue_count': n.get('dialogue_count', 0),
                'interaction_partners': list(partners)[:10],
                'play_type': ptype,
            })

    total_chars = sum(len(v) for v in play_targets.values())
    print(f"  LLM 目标: {len(play_targets)} 部剧, {total_chars} 个角色")
    for t in ['家庭戏','侠义戏','神话戏']:
        cnt = sum(1 for chars in play_targets.values()
                  for c in chars if c['play_type']==t)
        print(f"    {t}: {cnt}")

    if total_chars == 0:
        print("  无目标角色，跳过 LLM 补全。")
        return enriched_plays, {}

    # ── 构建 LLM Prompts ──────────────────────────────────
    print(f"\n[3/6] 构建 LLM prompts (按剧本批量)...")

    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_BASE_URL = "https://api.deepseek.com"
    LLM_MODEL = "deepseek-v4-flash"

    prompts = []  # [{play_name, prompt, target_chars}]

    for play_name, chars in play_targets.items():
        raw = raw_by_name.get(play_name, {})
        full_dialogue = raw.get('正文对话', '')
        main_roles_text = raw.get('主要角色', '')
        plot_text = raw.get('情节', '')

        # 为每个角色提取对白片段
        char_descriptions = []
        for c in chars:
            # 提取该角色的对白片段（最多取前800字）
            snippets = []
            if full_dialogue:
                # 找角色名出现的行
                lines = full_dialogue.split('\n')
                collected = 0
                for line in lines:
                    if c['name'] in line and ('白' in line or '唱' in line or '（' in line):
                        snippet = line.strip()[:200]
                        if snippet:
                            snippets.append(snippet)
                            collected += 1
                            if collected >= 8:
                                break

            char_desc = f"""角色: {c['name']}
  核心度排名: Top{c['rank']} (度中心性={c['degree_centrality']:.4f})
  台词数: {c['dialogue_count']}
  互动对象: {', '.join(c['interaction_partners'][:8]) if c['interaction_partners'] else '无'}
  对白片段:
{chr(10).join(f'    - {s}' for s in snippets[:8])}"""
            char_descriptions.append(char_desc)

        prompt = f"""你是京剧行当专家。根据以下信息，判断角色所属的行当。

剧本: {play_name}
类型: {chars[0]['play_type']}
情节: {plot_text[:200] if plot_text else '未知'}
主要角色表: {main_roles_text[:300] if main_roles_text else '未提供'}

待判断角色:
{chr(10).join(char_descriptions)}

请为每个角色输出 JSON，格式严格如下:
```json
[
  {{
    "name": "角色名",
    "role_type": "生/旦/净/丑/末/外/老旦/武生/武旦/武净/武丑/小生/未知",
    "confidence": 0.85,
    "evidence": "从对白中判断的依据",
    "reason": "推理过程",
    "should_apply": true
  }}
]
```

注意事项:
1. 行当必须从给定列表中选择
2. 主要角色表如有该角色，优先采信其行当
3. 根据角色身份、与其他角色的互动关系、台词口吻推断行当
4. 如信息不足，填'未知'，confidence < 0.55
5. 功能性角色（仆人/传令/报信）倾向填'丑'或'外'"""

        prompts.append({
            'play_name': play_name,
            'prompt': prompt,
            'target_chars': chars,
        })

    print(f"  构建 {len(prompts)} 个 prompts")

    if dry_run:
        print("\n  [DRY RUN] 跳过 API 调用。示例 prompt:")
        if prompts:
            print(f"  Play: {prompts[0]['play_name'][:30]}")
            print(f"  Chars: {[c['name'] for c in prompts[0]['target_chars']]}")
            print(f"  Prompt length: {len(prompts[0]['prompt'])} chars")
            # Save dry-run prompts for inspection
            ensure_output_dir()
            dry_path = OUTPUT_DIR / "llm_prompts_dry_run.json"
            with open(dry_path, 'w', encoding='utf-8') as f:
                json.dump([{'play_name': p['play_name'],
                           'chars': [c['name'] for c in p['target_chars']],
                           'prompt': p['prompt'][:500]} for p in prompts[:5]],
                          f, ensure_ascii=False, indent=2)
            print(f"  Dry-run prompts saved → {dry_path}")
        return enriched_plays, {'dry_run': True, 'prompt_count': len(prompts)}

    # ── 调用 LLM ──────────────────────────────────────────
    print(f"\n[4/6] 调用 DeepSeek API ({LLM_MODEL})...")
    print(f"  共 {len(prompts)} 个请求")

    llm_results = {}  # {(entity_id, name): {role_type, confidence, evidence, ...}}
    auto_fill = 0
    needs_review = 0
    kept_unknown = 0
    api_errors = 0

    for i, pr in enumerate(prompts):
        try:
            resp = _requests.post(
                f"{LLM_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": pr['prompt']}],
                    "temperature": 0.1,
                    "max_tokens": 2000,
                },
                timeout=60,
            )
            resp.raise_for_status()
            body = resp.json()
            content = body['choices'][0]['message']['content']

            # 解析 JSON（可能被 markdown 代码块包裹）
            json_match = _re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, _re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = content

            parsed = json.loads(json_str)
            if isinstance(parsed, dict):
                parsed = [parsed]

            for item in parsed:
                name = item.get('name', '')
                rt = item.get('role_type', '未知')
                conf = item.get('confidence', 0)
                key = (pr['target_chars'][0]['entity_id'], name) if pr['target_chars'] else (0, name)

                # 匹配到 target_chars 中的 entity_id
                for tc in pr['target_chars']:
                    if tc['name'] == name:
                        key = (tc['entity_id'], name)
                        break

                result = {
                    'role_type': rt,
                    'confidence': conf,
                    'evidence': item.get('evidence', ''),
                    'reason': item.get('reason', ''),
                    'should_apply': conf >= 0.55,
                    'status': 'auto_fill' if conf >= 0.75 else ('needs_review' if conf >= 0.55 else 'kept_unknown'),
                    'play_name': pr['play_name'],
                }

                if conf >= 0.75:
                    auto_fill += 1
                elif conf >= 0.55:
                    needs_review += 1
                else:
                    kept_unknown += 1

                llm_results[key] = result

            if (i + 1) % 30 == 0:
                print(f"    LLM 进度: {i+1}/{len(prompts)}, auto_fill={auto_fill}, review={needs_review}, unknown={kept_unknown}")

            _time.sleep(0.3)  # rate limiting

        except Exception as e:
            api_errors += 1
            print(f"    ⚠ API 错误 [{pr['play_name'][:20]}]: {str(e)[:100]}")

    print(f"  ✓ LLM 调用完成")
    print(f"    auto_fill (>=0.75): {auto_fill}")
    print(f"    needs_review (0.55-0.75): {needs_review}")
    print(f"    kept_unknown (<0.55): {kept_unknown}")
    print(f"    api_errors: {api_errors}")

    # ── 应用结果到 enriched_plays ────────────────────────
    print(f"\n[5/6] 应用 LLM 结果 (仅 auto_fill >= 0.75)...")

    applied = 0
    for p in plays:
        eid = p['entity_id']
        for n in p.get('nodes', []):
            rt = n.get('role_type', '')
            if rt and rt != '未知':
                continue
            key = (eid, n['name'])
            if key in llm_results:
                result = llm_results[key]
                if result['status'] == 'auto_fill':
                    n['role_type'] = result['role_type']
                    applied += 1

    print(f"  已应用: {applied} 个角色")

    # ── 保存 LLM 结果 ────────────────────────────────────
    print(f"\n[6/6] 保存 LLM 结果...")

    # Convert tuple keys to strings for JSON
    llm_output = {
        'meta': {
            'audit_time': datetime.now().isoformat(),
            'model': LLM_MODEL,
            'target_types': list(TARGET_TYPES),
            'thresholds': {
                'auto_fill': 'confidence >= 0.75',
                'needs_review': '0.55 <= confidence < 0.75',
                'kept_unknown': 'confidence < 0.55',
            },
            '口径说明': {
                'unknown_core_unique_characters': '全类型 Top3 核心且行当未知的唯一角色数（跨剧本补全后）',
                'llm_target_characters': '家庭戏+侠义戏+神话戏中 Top3 未知且非功能性的角色',
                'auto_filled': auto_fill,
                'needs_review': needs_review,
                'kept_unknown': kept_unknown,
                'api_errors': api_errors,
            },
        },
        'results': {f"{eid}::{name}": v for (eid, name), v in llm_results.items()},
    }

    ensure_output_dir()
    output_path = OUTPUT_DIR / "llm_role_type_results.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(llm_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ llm_role_type_results.json → {output_path}")

    # ── 打印摘要 ────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"Step 5.4D 摘要: LLM 行当补全")
    print(f"{'='*70}")
    print(f"  API 请求数: {len(prompts)} (成功={len(prompts)-api_errors})")
    print(f"  已应用 (auto): {applied}")
    print(f"  待审核: {needs_review}")
    print(f"  保持未知: {kept_unknown}")

    # 按类型统计
    for t in ['家庭戏','侠义戏','神话戏']:
        chars_t = [(eid, name) for (eid, name), v in llm_results.items()
                   if any(c['play_type']==t for c in sum([p['target_chars'] for p in prompts if p['play_name']==v.get('play_name','')], []))]
        auto_t = sum(1 for k in chars_t if k in llm_results and llm_results[k]['status'] == 'auto_fill')
        print(f"    {t}: {len(chars_t)} 处理, {auto_t} auto_fill")

    return enriched_plays, llm_output


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Step 5: 按剧目类型的网络结构特征对比分析")
    parser.add_argument("--step", type=str, default="5.1",
                        choices=["5.1", "5.2", "5.3", "5.4A", "5.4D", "5.4", "all"],
                        help="要执行的步骤 (默认: 5.1)")
    parser.add_argument("--dry-run", action="store_true",
                        help="5.4D: 只生成 prompts 不调用 API")
    args = parser.parse_args()

    ensure_output_dir()

    # 预加载共享数据
    single_nets = None
    if args.step != "5.1":
        print("预加载 单剧本网络.json.gz ...")
        single_nets = load_gz_json(SINGLE_NETWORK_GZ)
        print(f"  ✓ 加载 {len(single_nets['plays'])} 部剧本\n")

    if args.step == "5.1" or args.step == "all":
        audit_step_5_1()

    if args.step == "5.2" or args.step == "all":
        step_5_2(single_nets)

    if args.step == "5.3" or args.step == "all":
        step_5_3(single_nets)

    if args.step == "5.4A" or args.step == "all":
        step_5_4A(single_nets)

    if args.step == "5.4D":
        enriched, _ = step_5_4A(single_nets)
        enriched_llm, llm_result = step_5_4D_llm(enriched, single_nets, dry_run=args.dry_run)
        if not args.dry_run:
            step_5_4(enriched_llm, single_nets)

    if args.step == "5.4" or args.step == "all":
        enriched, _ = step_5_4A(single_nets)
        step_5_4(enriched, single_nets)


if __name__ == '__main__':
    main()
