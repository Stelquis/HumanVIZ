"""
================================================================================
Step 5.1 (v2): JSON 数据结构与网络指标审计 — 重新全面审计
================================================================================

审计所有数据源的结构完整性、字段一致性和值质量，产出：
  - data/processed/task2/network_by_type/schema_audit.json       (结构审计)
  - data/processed/task2/network_by_type/missing_fields.json     (缺失/异常清单)
  - data/processed/task2/network_by_type/metrics_inventory.json  (逐指标详细统计)
  - data/processed/task2/network_by_type/cross_source_alignment.json (跨数据源对齐)

上次审计: 2026-06-05
本次审计: 重新生成，增加深度交叉验证

数据来源:
  I.   单剧本网络.json.gz      — Step 4.2-4.3 产出, 1473 部剧本的图+指标
  II.  4.1_unified_data.json.gz — Step 4.1 产出, 角色字典+关系列表
  III.  剧目类型.json           — Step 1 产出, 剧目类型分类
  IV.  角色关系.json            — Step 3 产出, LLM 提取的语义关系
  V.   网络指标.json            — Step 4.3 产出, 按类型聚合的指标
  VI.  全局网络.json.gz         — Step 4 产出, 跨剧本全局网络
  VII. 角色字典.json.gz         — Step 2 产出, 角色行当映射
  VIII. llm_role_type_results.json — Step 5.4 产出, LLM 行当补全
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

# 主要数据源
SINGLE_NET_GZ       = DATA_DIR / "单剧本网络.json.gz"
UNIFIED_DATA_GZ     = DATA_DIR / "4.1_unified_data.json.gz"
PLAY_TYPES_JSON     = DATA_DIR / "剧目类型.json"
ROLE_RELATIONS_JSON = DATA_DIR / "角色关系.json"
NET_METRICS_JSON    = DATA_DIR / "网络指标.json"
GLOBAL_NET_GZ       = DATA_DIR / "全局网络.json.gz"
ROLE_DICT_GZ        = DATA_DIR / "角色字典.json.gz"
ALIAS_MAP_GZ        = DATA_DIR / "角色别名映射.json.gz"

# Step 5.4 产出
LLM_ROLE_TYPE_JSON  = OUTPUT_DIR / "llm_role_type_results.json"
ROLE_COMP_AUDIT_JSON = OUTPUT_DIR / "role_type_completion_audit.json"
CORE_ROLES_JSON     = OUTPUT_DIR / "core_roles.json"

# ─── 工具函数 ────────────────────────────────────────────────

def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def load_gz(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)

def safe_load(path, loader):
    """安全加载，文件不存在返回 None"""
    if path.exists():
        return loader(path)
    return None

def ensure_output():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def pct_str(n, d):
    if d == 0: return "N/A"
    return f"{n/d*100:.1f}%"


# ═══════════════════════════════════════════════════════════════
# Phase 1: 加载所有数据源
# ═══════════════════════════════════════════════════════════════

def load_all_data():
    print("=" * 70)
    print("Phase 1: 加载所有数据源")
    print("=" * 70)

    data = {}

    # I. 单剧本网络
    print("[1/8] 单剧本网络.json.gz ...")
    data['single_net'] = load_gz(SINGLE_NET_GZ)
    plays = data['single_net']['plays']
    meta = data['single_net'].get('_metadata', {})
    print(f"  ✓ {len(plays)} 部剧本, {meta.get('total_nodes','?')} 节点, {meta.get('total_edges','?')} 边")

    # II. 4.1 统一数据
    print("[2/8] 4.1_unified_data.json.gz ...")
    data['unified'] = load_gz(UNIFIED_DATA_GZ)
    print(f"  ✓ {len(data['unified'])} 条记录")

    # III. 剧目类型
    print("[3/8] 剧目类型.json ...")
    data['play_types'] = load_json(PLAY_TYPES_JSON)
    print(f"  ✓ {len(data['play_types'])} 条类型映射")

    # IV. 角色关系
    print("[4/8] 角色关系.json ...")
    data['role_relations'] = load_json(ROLE_RELATIONS_JSON)
    rel_plays = data['role_relations'].get('plays', {})
    rel_meta = data['role_relations'].get('metadata', {})
    print(f"  ✓ {len(rel_plays)} 部剧的关系数据, {rel_meta.get('total_relations','?')} 条关系")

    # V. 网络指标 (聚合)
    print("[5/8] 网络指标.json ...")
    data['net_metrics'] = load_json(NET_METRICS_JSON)
    print(f"  ✓ sections: {list(data['net_metrics'].keys())}")

    # VI. 全局网络
    print("[6/8] 全局网络.json.gz ...")
    data['global_net'] = load_gz(GLOBAL_NET_GZ)
    gm = data['global_net'].get('_metadata', {})
    print(f"  ✓ {gm.get('total_nodes','?')} 节点, {gm.get('total_edges','?')} 边")

    # VII. 角色字典
    print("[7/8] 角色字典.json.gz ...")
    data['role_dict'] = load_gz(ROLE_DICT_GZ) if ROLE_DICT_GZ.exists() else None
    if data['role_dict']:
        if isinstance(data['role_dict'], list):
            print(f"  ✓ {len(data['role_dict'])} 条角色映射")
        elif isinstance(data['role_dict'], dict):
            print(f"  ✓ dict, keys: {list(data['role_dict'].keys())[:5]}")

    # VIII. LLM 角色类型补全结果 (Step 5.4 产出)
    print("[8/8] LLM 角色类型补全结果 ...")
    data['llm_role_types'] = safe_load(LLM_ROLE_TYPE_JSON, load_json)
    data['role_comp_audit'] = safe_load(ROLE_COMP_AUDIT_JSON, load_json)
    data['core_roles'] = safe_load(CORE_ROLES_JSON, load_json)
    if data['llm_role_types']:
        m = data['llm_role_types'].get('meta', {})
        print(f"  ✓ {m.get('auto_filled','?')} auto-filled, {m.get('needs_review','?')} need review")
    if data['role_comp_audit']:
        o = data['role_comp_audit'].get('overall', {})
        print(f"  ✓ completion audit: {o.get('has_role_type','?')} with type, {o.get('marked_unknown','?')} unknown")
    if data['core_roles']:
        c = data['core_roles'].get('summary', {})
        print(f"  ✓ core_roles: {c.get('plays_with_identified_core','?')} plays with core identified")

    return data, plays


# ═══════════════════════════════════════════════════════════════
# Phase 2: 顶层字段结构审计
# ═══════════════════════════════════════════════════════════════

def audit_top_level_structure(plays, unified):
    print("\n" + "=" * 70)
    print("Phase 2: 顶层字段结构审计")
    print("=" * 70)

    # 2A. 单剧本网络顶层字段
    tlf = Counter()
    for p in plays:
        for k in p.keys():
            tlf[k] += 1
    print("\n--- 单剧本网络 顶层字段 ---")
    for field, count in tlf.most_common():
        print(f"  {field}: {count}/{len(plays)} ({pct_str(count, len(plays))})")

    # 2B. 4.1 统一数据顶层字段
    utf = Counter()
    for d in unified:
        for k in d.keys():
            utf[k] += 1
    print("\n--- 4.1 统一数据 顶层字段 ---")
    for field, count in utf.most_common():
        print(f"  {field}: {count}/{len(unified)} ({pct_str(count, len(unified))})")

    # 2C. metrics 子字段
    msf = Counter()
    msf_types = defaultdict(set)  # 收集每个字段的值类型
    for p in plays:
        m = p.get('metrics', {})
        for k, v in m.items():
            msf[k] += 1
            msf_types[k].add(type(v).__name__)
    print("\n--- metrics 子字段 ---")
    for field, count in msf.most_common():
        types = ', '.join(sorted(msf_types[field]))
        print(f"  metrics.{field}: {count}/{len(plays)} ({pct_str(count, len(plays))}) [{types}]")

    # 2D. nodes 子字段
    nsf = Counter()
    nsf_types = defaultdict(set)
    nsf_nonnull = Counter()
    all_nodes = []
    for p in plays:
        for n in p.get('nodes', []):
            all_nodes.append(n)
            for k, v in n.items():
                nsf[k] += 1
                nsf_types[k].add(type(v).__name__)
                if v is not None and v != '' and v != 0:
                    nsf_nonnull[k] += 1
    print(f"\n--- nodes 子字段 (共 {len(all_nodes)} 个节点) ---")
    for field, count in nsf.most_common():
        types = ', '.join(sorted(nsf_types[field]))
        nn = nsf_nonnull.get(field, 0)
        print(f"  nodes.{field}: {count}/{len(all_nodes)} ({pct_str(count, len(all_nodes))}) "
              f"非空:{nn} [{types}]")

    # 2E. edges 子字段
    esf = Counter()
    esf_types = defaultdict(set)
    esf_nonnull = Counter()
    all_edges = []
    for p in plays:
        for e in p.get('edges', []):
            all_edges.append(e)
            for k, v in e.items():
                esf[k] += 1
                esf_types[k].add(type(v).__name__)
                if v is not None and v != '' and v != 0:
                    esf_nonnull[k] += 1
    print(f"\n--- edges 子字段 (共 {len(all_edges)} 条边) ---")
    for field, count in esf.most_common():
        types = ', '.join(sorted(esf_types[field]))
        nn = esf_nonnull.get(field, 0)
        print(f"  edges.{field}: {count}/{len(all_edges)} ({pct_str(count, len(all_edges))}) "
              f"非空:{nn} [{types}]")

    return {
        'top_level_fields': dict(tlf.most_common()),
        'unified_top_level_fields': dict(utf.most_common()),
        'metrics_sub_fields': dict(msf.most_common()),
        'node_sub_fields': dict(nsf.most_common()),
        'edge_sub_fields': dict(esf.most_common()),
        'node_sub_fields_nonnull': dict(nsf_nonnull.most_common()),
        'edge_sub_fields_nonnull': dict(esf_nonnull.most_common()),
        'total_nodes': len(all_nodes),
        'total_edges': len(all_edges),
        'all_nodes': all_nodes,
        'all_edges': all_edges,
    }


# ═══════════════════════════════════════════════════════════════
# Phase 3: 值质量审计
# ═══════════════════════════════════════════════════════════════

def audit_value_quality(plays, structure):
    print("\n" + "=" * 70)
    print("Phase 3: 值质量审计")
    print("=" * 70)

    all_nodes = structure['all_nodes']
    all_edges = structure['all_edges']

    # 3A. role_type 覆盖率
    role_type_nonempty = sum(1 for n in all_nodes if n.get('role_type'))
    print(f"\n[3A] nodes.role_type 非空: {role_type_nonempty}/{len(all_nodes)} "
          f"({pct_str(role_type_nonempty, len(all_nodes))})")

    # role_type 值分布
    rt_counter = Counter()
    for n in all_nodes:
        if n.get('role_type'):
            # 可能有多个行当用逗号或斜杠分隔
            rts = [r.strip() for r in n['role_type'].replace('/', ',').split(',') if r.strip()]
            for r in rts:
                rt_counter[r] += 1
    print(f"  常见行当: {rt_counter.most_common(15)}")

    # 其他维度: 把"未知"标记也算上
    unknown_count = sum(1 for n in all_nodes if n.get('role_type') == '未知')
    empty_count = sum(1 for n in all_nodes if not n.get('role_type'))
    print(f"  显式标记'未知': {unknown_count}, 完全空白: {empty_count}")

    # 3B. relation_type 分布 (边的 macro_type)
    rt_edge_counter = Counter()
    for e in all_edges:
        rt_edge_counter[e.get('relation_type', '__MISSING__')] += 1
    print(f"\n[3B] edges.relation_type 分布 (macro):")
    for rt, cnt in rt_edge_counter.most_common():
        print(f"  {rt}: {cnt} ({pct_str(cnt, len(all_edges))})")

    # micro_type 分布
    mt_counter = Counter()
    for e in all_edges:
        mt_counter[e.get('micro_type', '__MISSING__')] += 1
    print(f"\n[3B] edges.micro_type 分布 (sample):")
    for mt, cnt in mt_counter.most_common(20):
        print(f"  {mt}: {cnt}")

    # 3C. source_tag 分布 (边来源: llm_extracted / cooccurrence / both / merged)
    st_counter = Counter()
    for e in all_edges:
        st_counter[e.get('source_tag', '__MISSING__')] += 1
    print(f"\n[3C] edges.source_tag 分布:")
    for st, cnt in st_counter.most_common():
        print(f"  {st}: {cnt} ({pct_str(cnt, len(all_edges))})")

    # 3D. weight 分布统计
    weights = [e.get('weight', 0) for e in all_edges]
    if weights:
        import statistics
        print(f"\n[3D] edges.weight 分布:")
        print(f"  min={min(weights):.3f}, max={max(weights):.3f}")
        print(f"  mean={statistics.mean(weights):.3f}, median={statistics.median(weights):.3f}")
        print(f"  p25={sorted(weights)[len(weights)//4]:.3f}, p75={sorted(weights)[3*len(weights)//4]:.3f}")

    # 3E. evidence 非空比率
    ev_nonempty = sum(1 for e in all_edges if e.get('evidence'))
    print(f"\n[3E] edges.evidence 非空: {ev_nonempty}/{len(all_edges)} "
          f"({pct_str(ev_nonempty, len(all_edges))})")

    # 3F. direction 分布
    dir_counter = Counter()
    for e in all_edges:
        dir_counter[e.get('direction', '__MISSING__')] += 1
    print(f"\n[3F] edges.direction 分布:")
    for d, cnt in dir_counter.most_common():
        print(f"  {d}: {cnt} ({pct_str(cnt, len(all_edges))})")

    # 3G. 剧目类型分布
    type_counter = Counter()
    for p in plays:
        type_counter[p.get('剧目类型', '__MISSING__')] += 1
    print(f"\n[3G] 剧目类型分布:")
    for t, cnt in type_counter.most_common():
        print(f"  {t}: {cnt} ({pct_str(cnt, len(plays))})")

    return {
        'role_type_nonempty': role_type_nonempty,
        'role_type_total': len(all_nodes),
        'role_type_pct': round(role_type_nonempty / len(all_nodes) * 100, 1),
        'role_type_distribution': dict(rt_counter.most_common(30)),
        'unknown_explicit': unknown_count,
        'unknown_empty': empty_count,
        'macro_type_distribution': dict(rt_edge_counter.most_common()),
        'micro_type_distribution': dict(mt_counter.most_common(50)),
        'source_tag_distribution': dict(st_counter.most_common()),
        'direction_distribution': dict(dir_counter.most_common()),
        'evidence_nonempty': ev_nonempty,
        'evidence_nonempty_pct': round(ev_nonempty / max(len(all_edges), 1) * 100, 1),
        'weight_stats': {
            'min': min(weights) if weights else None,
            'max': max(weights) if weights else None,
        } if weights else {},
        'play_type_distribution': dict(type_counter.most_common()),
    }


# ═══════════════════════════════════════════════════════════════
# Phase 4: 异常检测 (扩展版)
# ═══════════════════════════════════════════════════════════════

def detect_anomalies(plays, unified, role_relations, structure):
    print("\n" + "=" * 70)
    print("Phase 4: 异常检测")
    print("=" * 70)

    all_issues = []
    all_nodes = structure['all_nodes']

    # 4.1: metrics 完全为空
    empty_metrics = [p for p in plays if not p.get('metrics')]
    if empty_metrics:
        print(f"\n  [4.1] ⚠ {len(empty_metrics)} 部剧 metrics 完全为空")
        all_issues.append({
            "id": "empty_metrics",
            "severity": "high",
            "count": len(empty_metrics),
            "plays": [{"entity_id": p['entity_id'], "剧本名": p['剧本名']}
                       for p in empty_metrics]
        })

    # 4.2: relation_type_distribution 为空 (edge_count=0 的剧)
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
        print(f"\n  [4.2] ⚠ {len(empty_rtd)} 部剧 relation_type_distribution 为空 (均 edge_count=0)")
        all_issues.append({
            "id": "empty_relation_type_distribution",
            "severity": "low",
            "count": len(empty_rtd),
            "note": "这些剧没有关系边，属于独白戏或纯功能性片段",
            "plays": empty_rtd
        })

    # 4.3: core_characters 为空
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
        print(f"\n  [4.3] ⚠ {len(empty_core)} 部剧 core_characters 为空 (node_count<2)")
        all_issues.append({
            "id": "empty_core_characters",
            "severity": "low",
            "count": len(empty_core),
            "note": "这些剧角色数<2，无法计算中心性",
            "plays": empty_core
        })

    # 4.4: role_type 缺失 (区分功能性角色和命名角色)
    # 功能性角色关键词
    FUNCTIONAL_KEYWORDS = {
        '龙套', '青袍', '文堂', '下手', '小甲', '将', '兵士', '太监', '宫女',
        '衙役', '校尉', '武士', '打手', '英雄', '大铠', '刀斧手', '家丁',
        '喽啰', '小军', '皂隶', '手下', '报子', '旗牌', '门子', '众',
        '百姓', '军士', '喽兵', '神兵', '仙童', '仙女', '将官', '神将',
        '众人', '众', '四', '八', '班头', '船夫', '水手', '院子', '家院',
        '童儿', '车夫', '轿夫', '马夫', '更夫', '刽子手',
    }

    def is_functional(name, role_type, dialogue_count):
        if role_type and role_type != '未知':
            return False
        if dialogue_count == 0:
            return True
        for kw in FUNCTIONAL_KEYWORDS:
            if kw in name:
                return True
        return False

    nodes_no_role = []   # 每个剧本的缺失统计
    functional_nodes = 0
    named_nodes_no_role = 0
    named_examples = []
    plays_with_role_gaps = []

    for p in plays:
        missing_in_play = []
        for n in p.get('nodes', []):
            if not n.get('role_type') or n.get('role_type') == '未知':
                if is_functional(n['name'], n.get('role_type'), n.get('dialogue_count', 0)):
                    functional_nodes += 1
                else:
                    named_nodes_no_role += 1
                    missing_in_play.append({
                        "name": n['name'],
                        "dialogue_count": n.get('dialogue_count', 0),
                        "degree_centrality": n.get('degree_centrality', 0),
                    })
                    if len(named_examples) < 50:
                        named_examples.append({
                            "entity_id": p['entity_id'],
                            "剧本名": p['剧本名'],
                            "角色名": n['name'],
                            "dialogue_count": n.get('dialogue_count', 0),
                            "degree_centrality": n.get('degree_centrality', 0),
                        })
        if missing_in_play:
            plays_with_role_gaps.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "剧目类型": p.get('剧目类型', ''),
                "total_nodes": len(p.get('nodes', [])),
                "missing_named": len(missing_in_play),
                "missing_ratio": round(len(missing_in_play) / max(len(p.get('nodes', [])), 1), 3),
                "top_missing": missing_in_play[:5]
            })

    print(f"\n  [4.4] role_type 缺失:")
    print(f"    功能性角色(预期无行当): {functional_nodes}")
    print(f"    命名角色缺行当: {named_nodes_no_role}")
    print(f"    含缺失的剧本: {len(plays_with_role_gaps)}/{len(plays)}")

    all_issues.append({
        "id": "missing_role_type",
        "severity": "medium",
        "functional_characters_expected": functional_nodes,
        "named_characters_missing": named_nodes_no_role,
        "total_missing": functional_nodes + named_nodes_no_role,
        "plays_affected": len(plays_with_role_gaps),
        "named_examples": named_examples[:50],
        "plays_detail": plays_with_role_gaps[:30],
        "note": "功能性角色（龙套等）无行当属正常；命名角色缺行当需关注"
    })

    # 4.5: 孤立节点 (>1节点的剧中度=0)
    CROWD_PATTERNS = {'四', '八', '众', '龙套', '青袍', '文堂', '下手', '小甲',
                       '太监', '宫女', '衙役', '校尉', '武士', '打手', '大铠',
                       '刀斧手', '家丁', '喽啰', '小军', '皂隶', '手下'}
    isolated_crowd = []
    isolated_named = []
    for p in plays:
        if len(p.get('nodes', [])) <= 1:
            continue
        for n in p.get('nodes', []):
            if n.get('degree_centrality', 0) == 0:
                entry = {
                    "entity_id": p['entity_id'],
                    "剧本名": p['剧本名'],
                    "角色名": n['name'],
                    "role_type": n.get('role_type', ''),
                    "dialogue_count": n.get('dialogue_count', 0),
                }
                is_crowd = False
                name = n['name']
                for pat in CROWD_PATTERNS:
                    if pat in name:
                        is_crowd = True
                        break
                if n.get('dialogue_count', 0) == 0:
                    is_crowd = True
                if is_crowd:
                    isolated_crowd.append(entry)
                else:
                    isolated_named.append(entry)

    total_isolated = len(isolated_crowd) + len(isolated_named)
    print(f"\n  [4.5] 孤立节点 (度=0, 多节点剧): 总计 {total_isolated}")
    print(f"    龙套/群体(预期): {len(isolated_crowd)}")
    print(f"    命名角色(需关注): {len(isolated_named)}")
    all_issues.append({
        "id": "isolated_nodes",
        "severity": "info",
        "total": total_isolated,
        "crowd_expected": len(isolated_crowd),
        "named_unexpected": len(isolated_named),
        "note": "龙套/群体角色孤立正常；命名角色孤立需核查（可能为独白角色）",
        "named_examples": isolated_named[:50]
    })

    # 4.6: entity_id 跨数据源对齐
    unified_ids = set(d['entity_id'] for d in unified)
    play_ids = set(p['entity_id'] for p in plays)
    types_ids = set(d['entity_id'] for d in load_json(PLAY_TYPES_JSON))
    rel_plays_dict = role_relations.get('plays', {})
    rel_ids = set()
    for k, v in rel_plays_dict.items():
        if isinstance(v, dict) and 'entity_id' in v:
            rel_ids.add(v['entity_id'])

    alignment = {
        "single_net_count": len(play_ids),
        "unified_data_count": len(unified_ids),
        "play_types_count": len(types_ids),
        "role_relations_count": len(rel_ids),
        "in_all_four": len(play_ids & unified_ids & types_ids),
        "only_in_single_net": sorted(play_ids - unified_ids - types_ids)[:20],
        "only_in_unified": sorted(unified_ids - play_ids)[:20],
        "only_in_types": sorted(types_ids - play_ids)[:20],
        "only_in_relations": sorted(rel_ids - play_ids)[:20],
    }
    print(f"\n  [4.6] entity_id 跨源对齐:")
    print(f"    单剧本网络: {alignment['single_net_count']}")
    print(f"    4.1 统一数据: {alignment['unified_data_count']}")
    print(f"    剧目类型: {alignment['play_types_count']}")
    print(f"    角色关系: {alignment['role_relations_count']}")
    print(f"    全部交集: {alignment['in_all_four']}")
    all_issues.append({
        "id": "entity_id_alignment",
        "severity": "info" if alignment['in_all_four'] > 0.99 * len(play_ids) else "medium",
        **alignment
    })

    # 4.7: density 异常 (density=0 但有边)
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
        print(f"\n  [4.7] ⚠ {len(density_anomalies)} 部剧 density=0 但有边 (计算Bug?)")
        all_issues.append({
            "id": "density_zero_with_edges",
            "severity": "high",
            "count": len(density_anomalies),
            "plays": density_anomalies
        })

    # 4.8: 角色关系中 macro_type='中立' 占比过高 (>90%) 的剧
    neutral_heavy = []
    for p in plays:
        rtd = p.get('metrics', {}).get('relation_type_distribution', {})
        if rtd:
            # rtd values 可能是 int 或 dict（含 count）
            flat_vals = {}
            for k, v in rtd.items():
                if isinstance(v, dict):
                    flat_vals[k] = v.get('count', 0)
                elif isinstance(v, (int, float)):
                    flat_vals[k] = int(v)
            total = sum(flat_vals.values())
            neutral = flat_vals.get('中立', 0)
            if total > 0 and neutral / total > 0.95 and p.get('metrics', {}).get('edge_count', 0) > 5:
                neutral_heavy.append({
                    "entity_id": p['entity_id'],
                    "剧本名": p['剧本名'],
                    "neutral_ratio": round(neutral/total, 3),
                    "edge_count": p['metrics']['edge_count']
                })
    if neutral_heavy:
        print(f"\n  [4.8] ⚠ {len(neutral_heavy)} 部剧 中立关系>95% (LLM语义提取可能不足)")
        all_issues.append({
            "id": "neutral_dominated",
            "severity": "info",
            "count": len(neutral_heavy),
            "note": "这些剧的关系以共现为主，LLM语义标签覆盖率低",
            "plays": neutral_heavy[:30]
        })

    # 4.9: 检查 LLM 角色类型补全是否已写入单剧本网络
    if safe_load(LLM_ROLE_TYPE_JSON, load_json):
        llm_results = load_json(LLM_ROLE_TYPE_JSON)
        llm_filled = llm_results.get('results', {})
        auto_filled = sum(1 for v in llm_filled.values() if v.get('status') == 'auto_fill')
        print(f"\n  [4.9] LLM 角色类型补全: {auto_filled} 个 auto_fill")

        # 检查这些是否已反映在单剧本网络的 nodes 中
        # 构建 key → role_type 映射
        llm_map = {}
        for key, val in llm_filled.items():
            if val.get('should_apply') and val.get('role_type'):
                eid_str, char_name = key.split('::', 1)
                llm_map[(int(eid_str), char_name)] = val['role_type']

        matched = 0
        unmatched = 0
        for p in plays:
            for n in p.get('nodes', []):
                key = (p['entity_id'], n['name'])
                if key in llm_map:
                    if n.get('role_type') == llm_map[key]:
                        matched += 1
                    else:
                        unmatched += 1

        print(f"    LLM结果已反映在nodes中: {matched}, 未反映: {unmatched}")
        all_issues.append({
            "id": "llm_role_type_integration",
            "severity": "info" if unmatched == 0 else "medium",
            "total_llm_filled": len(llm_map),
            "reflected_in_nodes": matched,
            "not_reflected": unmatched,
            "note": "检查LLM补全的角色类型是否已写入单剧本网络的nodes.role_type"
        })

    # 4.10: 检查 node_count metrics vs nodes 数组长度不一致
    count_mismatch = []
    for p in plays:
        metrics_nc = p.get('metrics', {}).get('node_count', 0)
        actual_nc = len(p.get('nodes', []))
        if metrics_nc != actual_nc:
            count_mismatch.append({
                "entity_id": p['entity_id'],
                "剧本名": p['剧本名'],
                "metrics_node_count": metrics_nc,
                "actual_nodes_count": actual_nc
            })
    if count_mismatch:
        print(f"\n  [4.10] ⚠ {len(count_mismatch)} 部剧 metrics.node_count != len(nodes)")
        all_issues.append({
            "id": "node_count_mismatch",
            "severity": "medium",
            "count": len(count_mismatch),
            "plays": count_mismatch[:20]
        })

    return all_issues, alignment


# ═══════════════════════════════════════════════════════════════
# Phase 5: 指标详细统计 (per-metric inventory)
# ═══════════════════════════════════════════════════════════════

def inventory_metrics(plays):
    print("\n" + "=" * 70)
    print("Phase 5: 逐指标详细统计")
    print("=" * 70)

    metrics_inventory = {
        "audit_time": datetime.now().isoformat(),
        "total_plays": len(plays),
        "metrics": {}
    }

    # 收集所有可能的指标名
    all_metric_names = set()
    for p in plays:
        all_metric_names.update(p.get('metrics', {}).keys())

    for mname in sorted(all_metric_names):
        values = []
        non_null = 0
        plays_with = 0
        plays_without = 0

        for p in plays:
            m = p.get('metrics', {})
            v = m.get(mname)
            if v is not None:
                plays_with += 1
                if isinstance(v, (int, float)):
                    values.append(v)
                elif isinstance(v, (dict, list)):
                    non_null += 1 if v else 0
            else:
                plays_without += 1

        entry = {
            "name": mname,
            "plays_with": plays_with,
            "plays_without": plays_without,
            "coverage_pct": round(plays_with / len(plays) * 100, 1),
            "non_null": non_null if not values else len(values),
        }

        if values:
            import statistics
            entry["type"] = "numeric"
            entry["min"] = round(min(values), 6)
            entry["max"] = round(max(values), 6)
            entry["mean"] = round(statistics.mean(values), 6)
            entry["median"] = round(statistics.median(values), 6)
            entry["std"] = round(statistics.stdev(values) if len(values) > 1 else 0, 6)
            entry["zeros"] = sum(1 for v in values if v == 0)
        elif mname == 'relation_type_distribution':
            entry["type"] = "dict[str,int|dict]"
            # 合并所有剧的 relation type 分布
            all_types = Counter()
            for p in plays:
                rtd = p.get('metrics', {}).get('relation_type_distribution', {})
                for k, v in rtd.items():
                    if isinstance(v, dict):
                        all_types[k] += v.get('count', 0)
                    elif isinstance(v, (int, float)):
                        all_types[k] += int(v)
            entry["global_distribution"] = dict(all_types.most_common())
        elif mname == 'core_characters':
            entry["type"] = "list[dict]"
            # 统计 core_characters 的长度分布
            cc_lengths = []
            for p in plays:
                cc = p.get('metrics', {}).get('core_characters', [])
                cc_lengths.append(len(cc))
            import statistics
            entry["avg_core_count"] = round(statistics.mean(cc_lengths), 2)
            entry["max_core_count"] = max(cc_lengths)

        metrics_inventory["metrics"][mname] = entry

    # 打印摘要
    print(f"\n  共 {len(all_metric_names)} 个指标:")
    for mname in sorted(all_metric_names):
        e = metrics_inventory["metrics"][mname]
        if e.get('type') == 'numeric':
            print(f"  {mname}: {e['plays_with']}/{len(plays)} 覆盖, "
                  f"mean={e.get('mean', 'N/A')}, zeros={e.get('zeros', 0)}")
        else:
            print(f"  {mname}: {e['plays_with']}/{len(plays)} 覆盖, type={e.get('type', 'N/A')}")

    return metrics_inventory


# ═══════════════════════════════════════════════════════════════
# Phase 6: 可复用性分析
# ═══════════════════════════════════════════════════════════════

def analyze_reusability(plays, structure):
    print("\n" + "=" * 70)
    print("Phase 6: 指标可复用性分析")
    print("=" * 70)

    # 从现有数据能直接计算的指标
    directly_reusable = [
        "node_count", "edge_count", "density", "avg_clustering",
        "connected_components", "largest_component_ratio",
        "relation_type_distribution", "core_characters"
    ]

    # 需要从 nodes/edges 补算的指标
    computable_from_nodes = [
        {
            "name": "degree_centralization",
            "description": "度中心化程度 (Freeman's formula)",
            "formula": "sum(max_deg - deg_i) / ((n-1)*(n-2))",
            "inputs": "nodes.degree_centrality",
            "can_compute": True
        },
        {
            "name": "betweenness_centralization",
            "description": "介数中心化程度",
            "formula": "sum(max_betw - betw_i) / ((n-1)*(n-2)*(n-3)/2) or normalized",
            "inputs": "nodes.betweenness_centrality",
            "can_compute": True
        },
        {
            "name": "degree_entropy",
            "description": "度分布熵（归一化）",
            "formula": "-sum(p_i * log(p_i)) / log(n)",
            "inputs": "nodes.degree_centrality",
            "can_compute": True
        },
        {
            "name": "top1_top2_gap",
            "description": "最高度与第二高度的差值比",
            "formula": "(max1 - max2) / max1",
            "inputs": "nodes.degree_centrality",
            "can_compute": True
        },
        {
            "name": "top3_centrality_share",
            "description": "Top 3 节点中心性占比",
            "formula": "sum(top3_deg) / sum(all_deg)",
            "inputs": "nodes.degree_centrality",
            "can_compute": True
        },
        {
            "name": "max_to_mean_ratio",
            "description": "最大中心性与平均中心性比值",
            "formula": "max_deg / mean_deg",
            "inputs": "nodes.degree_centrality",
            "can_compute": True
        },
        {
            "name": "core_periphery_ratio",
            "description": "前20%节点与后80%节点的边权重比",
            "formula": "edges_in_top20 / edges_in_bottom80",
            "inputs": "nodes + edges",
            "can_compute": True
        },
        {
            "name": "modularity",
            "description": "社区模块度",
            "formula": "Louvain/标签传播算法",
            "inputs": "full adjacency",
            "can_compute": True,
            "note": "需 networkx community 算法"
        },
        {
            "name": "assortativity",
            "description": "行当同配性",
            "formula": "Pearson correlation of role_type between connected nodes",
            "inputs": "nodes.role_type + edges",
            "can_compute": "partial",
            "note": "role_type 覆盖率仅 {pct}%，需先补全"
        },
        {
            "name": "avg_shortest_path",
            "description": "平均最短路径长度",
            "formula": "networkx.average_shortest_path_length",
            "inputs": "adjacency",
            "can_compute": True,
            "note": "大网络计算成本高"
        },
    ]

    # 需要 LLM 才能获得的指标
    require_llm = [
        {
            "name": "structural_narrative",
            "description": "网络结构的叙事解释",
            "why_llm": "需要从结构特征推理叙事逻辑"
        },
        {
            "name": "network_structure_label",
            "description": "网络结构标签（单核心/双核心/多核心等）",
            "why_llm": "可 rule-based（Step 5.5B）或 LLM + rule 混合"
        },
    ]

    role_type_pct = round(
        sum(1 for n in structure['all_nodes'] if n.get('role_type')) / max(len(structure['all_nodes']), 1) * 100, 1
    )

    print("\n可直接复用 (来自 metrics 字段):")
    for m in directly_reusable:
        count = sum(1 for p in plays if p.get('metrics', {}).get(m) is not None)
        print(f"  ✓ {m}: {count}/{len(plays)}")

    print(f"\n可从 nodes/edges 补算 ({len(computable_from_nodes)} 项):")
    for c in computable_from_nodes:
        desc = c['description']
        note = c.get('note', '')
        if '{pct}' in note:
            note = note.format(pct=role_type_pct)
        print(f"  → {c['name']}: {desc} [可计算: {c['can_compute']}] {note}")

    print(f"\n需要 LLM ({len(require_llm)} 项):")
    for r in require_llm:
        print(f"  ✗ {r['name']}: {r['description']} ({r['why_llm']})")

    return {
        "directly_reusable": directly_reusable,
        "computable_from_nodes": computable_from_nodes,
        "require_llm": require_llm,
        "role_type_coverage_pct": role_type_pct,
    }


# ═══════════════════════════════════════════════════════════════
# Phase 7: 生成输出文件
# ═══════════════════════════════════════════════════════════════

def generate_outputs(data, plays, structure, value_quality, anomalies, alignment,
                     metrics_inventory, reusability):
    print("\n" + "=" * 70)
    print("Phase 7: 生成输出文件")
    print("=" * 70)

    ensure_output()
    audit_time = datetime.now().isoformat()

    # ── schema_audit.json ──
    meta = data['single_net'].get('_metadata', {})

    schema_audit = {
        "audit_time": audit_time,
        "audit_version": "v2",
        "previous_audit": "2026-06-05T17:40:54.894537",
        "changes_since_v1": [
            "新增 LLM 角色类型补全集成检查 (Phase 4.9)",
            "新增跨数据源 entity_id 四源对齐 (Phase 4.6)",
            "新增 node_count metrics vs actual 一致性检查 (Phase 4.10)",
            "新增 中立关系占比异常检测 (Phase 4.8)",
            "新增 core_roles.json 和 llm_role_type_results.json 的结构检查",
            "区分功能性角色和命名角色的 role_type 缺失",
            "逐指标详细统计移至独立文件 metrics_inventory.json",
            "新增 source_tag/direction 分布审计 (Phase 3)",
        ],
        "data_sources": {
            "单剧本网络.json.gz": {
                "description": "每部剧的图结构 + 指标，Step 4.2-4.3 产出",
                "play_count": len(plays),
                "total_nodes": structure['total_nodes'],
                "total_edges": structure['total_edges'],
                "top_level_fields": sorted(structure['top_level_fields'].keys()),
                "metrics_sub_fields": sorted(structure['metrics_sub_fields'].keys()),
                "node_attributes": sorted(structure['node_sub_fields'].keys()),
                "edge_attributes": sorted(structure['edge_sub_fields'].keys()),
                "metadata": meta,
            },
            "4.1_unified_data.json.gz": {
                "description": "角色字典、别名映射、语义关系边列表、共现边列表",
                "play_count": len(data['unified']),
                "top_level_fields": sorted(structure['unified_top_level_fields'].keys()),
            },
            "剧目类型.json": {
                "play_count": len(data['play_types']),
                "type_distribution": value_quality['play_type_distribution'],
            },
            "角色关系.json": {
                "play_count": len(data['role_relations'].get('plays', {})),
                "total_relations": data['role_relations'].get('metadata', {}).get('total_relations', 0),
                "macro_types": data['role_relations'].get('metadata', {}).get('by_macro_type', {}),
            },
            "全局网络.json.gz": {
                "total_nodes": data['global_net'].get('_metadata', {}).get('total_nodes', 0),
                "total_edges": data['global_net'].get('_metadata', {}).get('total_edges', 0),
            },
            "网络指标.json": {
                "sections": list(data['net_metrics'].keys()),
                "by_type_available": list(data['net_metrics'].get('by_type', {}).keys()),
            },
            "llm_role_type_results.json (Step 5.4)": {
                "description": "LLM 行当补全结果",
                "exists": data['llm_role_types'] is not None,
            } if data['llm_role_types'] else None,
            "core_roles.json (Step 5.4)": {
                "description": "核心角色识别结果",
                "exists": data['core_roles'] is not None,
                "plays_with_core": data['core_roles'].get('summary', {}).get('plays_with_identified_core', 0) if data['core_roles'] else 0,
            } if data['core_roles'] else None,
        },
        "field_coverage": {
            "top_level": structure['top_level_fields'],
            "metrics_sub_fields": structure['metrics_sub_fields'],
            "node_sub_fields": structure['node_sub_fields'],
            "edge_sub_fields": structure['edge_sub_fields'],
            "node_sub_fields_nonnull": structure['node_sub_fields_nonnull'],
            "edge_sub_fields_nonnull": structure['edge_sub_fields_nonnull'],
        },
        "play_type_distribution": value_quality['play_type_distribution'],
        "available_metrics": [
            {
                "metric": mname,
                "coverage": entry['plays_with'],
                "coverage_pct": entry['coverage_pct'],
                "status": "ready" if entry['coverage_pct'] >= 99 else "needs_attention"
            }
            for mname, entry in metrics_inventory['metrics'].items()
        ],
        "supplementary_metrics_computable": reusability['computable_from_nodes'],
        "value_coverage": {
            "nodes.role_type_nonempty": {
                "count": value_quality['role_type_nonempty'],
                "total": value_quality['role_type_total'],
                "pct": value_quality['role_type_pct']
            },
            "nodes.role_type_explicit_unknown": value_quality['unknown_explicit'],
            "nodes.role_type_blank": value_quality['unknown_empty'],
            "edges.micro_type_nonempty": structure['edge_sub_fields_nonnull'].get('micro_type', 0),
            "edges.evidence_nonempty": value_quality['evidence_nonempty'],
            "edges.evidence_nonempty_pct": value_quality['evidence_nonempty_pct'],
            "macro_type_distribution": value_quality['macro_type_distribution'],
            "source_tag_distribution": value_quality['source_tag_distribution'],
            "direction_distribution": value_quality['direction_distribution'],
        },
        "cross_source_alignment": alignment,
        "data_quality_summary": {
            "total_plays": len(plays),
            "plays_with_empty_relation_distribution": next((a['count'] for a in anomalies if a['id'] == 'empty_relation_type_distribution'), 0),
            "plays_with_empty_core_characters": next((a['count'] for a in anomalies if a['id'] == 'empty_core_characters'), 0),
            "plays_with_role_type_gaps": next((a['plays_affected'] for a in anomalies if a['id'] == 'missing_role_type'), 0),
            "total_nodes_without_role_type": next((a['total_missing'] for a in anomalies if a['id'] == 'missing_role_type'), 0),
            "named_nodes_no_role": next((a['named_characters_missing'] for a in anomalies if a['id'] == 'missing_role_type'), 0),
            "functional_nodes_expected": next((a['functional_characters_expected'] for a in anomalies if a['id'] == 'missing_role_type'), 0),
            "isolated_nodes_total": next((a['total'] for a in anomalies if a['id'] == 'isolated_nodes'), 0),
            "isolated_nodes_crowd": next((a['crowd_expected'] for a in anomalies if a['id'] == 'isolated_nodes'), 0),
            "isolated_nodes_named": next((a['named_unexpected'] for a in anomalies if a['id'] == 'isolated_nodes'), 0),
            "entity_id_alignment": "ok" if alignment['in_all_four'] >= len(plays) * 0.99 else "mismatch",
            "density_anomalies": next((a['count'] for a in anomalies if a['id'] == 'density_zero_with_edges'), 0),
            "neutral_dominated_plays": next((a['count'] for a in anomalies if a['id'] == 'neutral_dominated'), 0),
            "node_count_mismatch": next((a['count'] for a in anomalies if a['id'] == 'node_count_mismatch'), 0),
        },
        "reusability_summary": {
            "ready_metrics_count": len(reusability['directly_reusable']),
            "computable_metrics_count": len(reusability['computable_from_nodes']),
            "llm_required_count": len(reusability['require_llm']),
            "role_type_coverage_pct": reusability['role_type_coverage_pct'],
        }
    }

    # 清理 None 值
    schema_audit['data_sources'] = {k: v for k, v in schema_audit['data_sources'].items() if v is not None}

    schema_audit_path = OUTPUT_DIR / "schema_audit.json"
    with open(schema_audit_path, 'w', encoding='utf-8') as f:
        json.dump(schema_audit, f, ensure_ascii=False, indent=2)
    print(f"  ✓ schema_audit.json")

    # ── missing_fields.json ──
    missing_fields = {
        "audit_time": audit_time,
        "audit_version": "v2",
        "total_plays": len(plays),
        "total_nodes": structure['total_nodes'],
        "total_edges": structure['total_edges'],
        "issues": anomalies,
        "summary": {
            "total_issues": len(anomalies),
            "by_severity": {
                "high": len([a for a in anomalies if a.get('severity') == 'high']),
                "medium": len([a for a in anomalies if a.get('severity') == 'medium']),
                "low": len([a for a in anomalies if a.get('severity') == 'low']),
                "info": len([a for a in anomalies if a.get('severity') == 'info']),
            }
        }
    }

    missing_fields_path = OUTPUT_DIR / "missing_fields.json"
    with open(missing_fields_path, 'w', encoding='utf-8') as f:
        json.dump(missing_fields, f, ensure_ascii=False, indent=2)
    print(f"  ✓ missing_fields.json")

    # ── metrics_inventory.json (新) ──
    metrics_inv_path = OUTPUT_DIR / "metrics_inventory.json"
    with open(metrics_inv_path, 'w', encoding='utf-8') as f:
        json.dump(metrics_inventory, f, ensure_ascii=False, indent=2)
    print(f"  ✓ metrics_inventory.json (新)")

    # ── cross_source_alignment.json (新) ──
    cross_source = {
        "audit_time": audit_time,
        "alignment": alignment,
        "by_play_type": {},
    }
    # 按剧目类型分组统计 entity_id 一致性
    types_by_id = {d['entity_id']: d['剧目类型'] for d in data['play_types']}
    for play_type in set(types_by_id.values()):
        ptype_ids = set(eid for eid, pt in types_by_id.items() if pt == play_type)
        play_ids = set(p['entity_id'] for p in plays)
        unified_ids = set(d['entity_id'] for d in data['unified'])
        in_all = len(ptype_ids & play_ids & unified_ids)
        cross_source["by_play_type"][play_type] = {
            "total": len(ptype_ids),
            "in_single_net": len(ptype_ids & play_ids),
            "in_unified": len(ptype_ids & unified_ids),
            "in_all": in_all,
            "alignment": "ok" if in_all == len(ptype_ids) else "partial"
        }

    cross_source_path = OUTPUT_DIR / "cross_source_alignment.json"
    with open(cross_source_path, 'w', encoding='utf-8') as f:
        json.dump(cross_source, f, ensure_ascii=False, indent=2)
    print(f"  ✓ cross_source_alignment.json (新)")

    return schema_audit, missing_fields, metrics_inventory, cross_source


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("Step 5.1 v2: 数据结构与网络指标全面审计")
    print(f"审计时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # Phase 1
    data, plays = load_all_data()

    # Phase 2
    structure = audit_top_level_structure(plays, data['unified'])

    # Phase 3
    value_quality = audit_value_quality(plays, structure)

    # Phase 4
    anomalies, alignment = detect_anomalies(plays, data['unified'], data['role_relations'], structure)

    # Phase 5
    metrics_inventory = inventory_metrics(plays)

    # Phase 6
    reusability = analyze_reusability(plays, structure)

    # Phase 7
    generate_outputs(data, plays, structure, value_quality, anomalies, alignment,
                     metrics_inventory, reusability)

    # ── 打印总结 ──
    print("\n" + "=" * 70)
    print("Step 5.1 v2 审计总结")
    print("=" * 70)
    rt_pct = value_quality['role_type_pct']
    isol_total = next((a['total'] for a in anomalies if a['id'] == 'isolated_nodes'), 0)
    isol_crowd = next((a['crowd_expected'] for a in anomalies if a['id'] == 'isolated_nodes'), 0)
    isol_named = next((a['named_unexpected'] for a in anomalies if a['id'] == 'isolated_nodes'), 0)
    no_role_named = next((a['named_characters_missing'] for a in anomalies if a['id'] == 'missing_role_type'), 0)
    no_role_func = next((a['functional_characters_expected'] for a in anomalies if a['id'] == 'missing_role_type'), 0)
    empty_rtd = next((a['count'] for a in anomalies if a['id'] == 'empty_relation_type_distribution'), 0)
    empty_core = next((a['count'] for a in anomalies if a['id'] == 'empty_core_characters'), 0)
    density_bug = next((a['count'] for a in anomalies if a['id'] == 'density_zero_with_edges'), 0)
    neutral_heavy = next((a['count'] for a in anomalies if a['id'] == 'neutral_dominated'), 0)
    count_mis = next((a['count'] for a in anomalies if a['id'] == 'node_count_mismatch'), 0)

    print(f"""
  剧本总数:               {len(plays)}
  剧目类型数:              {len(value_quality['play_type_distribution'])}
  总节点数:                {structure['total_nodes']}
  总边数:                  {structure['total_edges']}
  entity_id 四源对齐:      {'✓' if alignment['in_all_four'] >= 0.99 * len(plays) else '⚠ ' + str(alignment['in_all_four'])}

  metrics 已有指标 ({len(metrics_inventory['metrics'])} 个):
    - node_count ✓
    - edge_count ✓
    - density ✓ ({density_bug} 部有 density=0 但有边的异常)
    - avg_clustering ✓
    - connected_components ✓
    - largest_component_ratio ✓
    - relation_type_distribution ✓ ({len(plays)-empty_rtd}/{len(plays)} 覆盖, {empty_rtd} 为空)
    - core_characters ✓ ({len(plays)-empty_core}/{len(plays)} 覆盖, {empty_core} 为空)

  可补算指标:              {len(reusability['computable_from_nodes'])} 个
  需LLM指标:               {len(reusability['require_llm'])} 个

  值质量:
    - role_type 非空:       {value_quality['role_type_nonempty']}/{structure['total_nodes']} ({rt_pct}%)
    - 命名角色缺行当:        {no_role_named}
    - 功能性角色(预期无):    {no_role_func}
    - evidence 非空:        {value_quality['evidence_nonempty']}/{structure['total_edges']} ({value_quality['evidence_nonempty_pct']}%)
    - 孤立节点:              {isol_total} (龙套{isol_crowd} + 命名{isol_named})
    - 中立关系>95%的剧:      {neutral_heavy}
    - node_count 不一致:    {count_mis}

  后续步骤可以直接复用 metrics 中的 8 个指标。
  Step 5.5A 需要的 centralization 等需从 nodes/edges 补算（无需 LLM）。
""")

    return 0


if __name__ == '__main__':
    sys.exit(main())
