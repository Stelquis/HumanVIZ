#!/usr/bin/env python3
"""
build_networks.py — 角色关系网络构建与存储

用法:
    python build_networks.py build                    # 执行 4.1~4.5 全流程
    python build_networks.py build --step 4.1        # 单独执行某子步骤
    python build_networks.py build --entity-id 123   # 单剧本构建
    python build_networks.py build --force           # 强制全量重建（禁用断点续传）
    python build_networks.py build --verbose         # 详细日志
    python build_networks.py stats                   # 打印已构建数据的统计摘要

步骤 4.1: 数据准备 — 加载并整合步骤1~3的关系数据
    - 读取 5 个数据文件：剧目类型.json、角色关系.json、同场共现.json.gz、角色别名映射.json.gz、角色字典.json.gz
    - 以 entity_id 为主键构建统一数据结构
    - 通过别名映射标准化所有边中的角色名
    - 数据质量检查：打印各数据源覆盖剧本数、角色数、关系数，识别缺失
步骤 4.2: 构建单剧本 networkx 无向图
    - 为每部剧本构建含节点/边属性的 networkx.Graph
    - 合并 LLM 语义关系 + 同场共现，计算 w_final
步骤 4.3: 计算单剧本网络指标
    - 图级指标: density, avg_clustering, connected_components 等
    - 节点级指标: degree/betweenness/closeness centrality
    - 关系类型分布、核心角色 TOP-3
步骤 4.4: 导出单剧本网络数据为 JSON/GZ
    - 统一格式导出: _metadata + plays[{entity_id, nodes, edges, metrics}]
步骤 4.5: 构建跨剧本全局网络并导出
    - 合并所有剧本的角色关系构建全局 networkx.Graph
    - 同名角色跨剧关联，节点属性增加 plays: [剧本名列表]
    - 计算全局网络指标（同4.3指标集）
    - 按剧目类型提取子图并计算子图指标
    - 输出: 全局网络.json.gz + 网络指标.json
步骤 4.6: 批量执行脚本整合与 CLI 入口
    - 断点续传：跳过已存在于输出文件中的数据
    - 完整日志和错误处理
    - BuildContext 管理步骤间数据共享
"""

import argparse
import gzip
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import networkx as nx

# ── 路径常量 ──────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_DIR / "data" / "processed" / "task2" / "db_exports"

# 输入文件
FILE_PLAY_TYPES = DATA_DIR / "剧目类型.json"
FILE_RELATIONS = DATA_DIR / "角色关系.json"
FILE_COOCCURRENCE = DATA_DIR / "同场共现.json.gz"
FILE_ALIAS_MAP = DATA_DIR / "角色别名映射.json.gz"
FILE_ROLE_DICT = DATA_DIR / "角色字典.json.gz"

# 输出文件
FILE_PLAY_NETWORKS = DATA_DIR / "单剧本网络.json.gz"
FILE_GLOBAL_NETWORK = DATA_DIR / "全局网络.json.gz"
FILE_NETWORK_METRICS = DATA_DIR / "网络指标.json"


# ═══════════════════════════════════════════════════════════════════════
# 4.1 数据准备：加载并整合步骤1~3的关系数据
# ═══════════════════════════════════════════════════════════════════════

def _load_json(path: Path) -> Any:
    """加载 JSON 文件（自动处理 .gz 压缩）"""
    t0 = time.time()
    if str(path).endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json.load(f)
    else:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    elapsed = time.time() - t0
    size_mb = path.stat().st_size / (1024 * 1024)
    print(f"  [加载] {path.name} ({size_mb:.1f} MB, {elapsed:.1f}s)")
    return data


def load_all_data() -> dict:
    """
    加载全部 5 个数据源，以 entity_id 为主键整合为统一数据结构。

    返回:
        {
            entity_id (int): {
                "entity_id": int,
                "剧本名": str,
                "剧目类型": str | None,
                "角色字典": {标准名: {name, role_type, scenes, dialogue_count, ...}},
                "别名映射": {别名: 标准名, ...},
                "语义关系边列表": [...],   # 来自 角色关系.json
                "共现边列表": [...],       # 来自 同场共现.json.gz
            },
            ...
        }
    """
    print("=" * 70)
    print("步骤 4.1: 数据准备 — 加载并整合步骤1~3的关系数据")
    print("=" * 70)

    # ── 1. 加载 5 个数据源 ────────────────────────────────────────────
    print("\n[1/5] 加载数据源...")

    play_types_data = _load_json(FILE_PLAY_TYPES)
    relations_data = _load_json(FILE_RELATIONS)
    cooccurrence_data = _load_json(FILE_COOCCURRENCE)
    alias_data = _load_json(FILE_ALIAS_MAP)
    role_dict_data = _load_json(FILE_ROLE_DICT)

    # ── 2. 以 entity_id 为主键构建索引 ────────────────────────────────
    print("\n[2/5] 以 entity_id 为主键构建索引...")

    # 2a. 剧目类型 → {entity_id: 剧目类型}
    play_type_map: dict[int, str] = {}
    play_name_map: dict[int, str] = {}
    if isinstance(play_types_data, list):
        for item in play_types_data:
            eid = item["entity_id"]
            play_type_map[eid] = item.get("剧目类型", "未分类")
            play_name_map[eid] = item.get("name", "")
    print(f"  剧目类型: {len(play_type_map)} 部剧本")

    # 2b. 角色关系 → {entity_id: {entity_id, 剧目类型, relations: [...]}}
    relations_map: dict[int, dict] = {}
    plays_section = relations_data.get("plays", {})
    for _key, play_data in plays_section.items():
        eid = play_data.get("entity_id")
        if eid is not None:
            relations_map[eid] = play_data
    print(f"  角色关系: {len(relations_map)} 部剧本")

    # 2c. 同场共现 → {entity_id: 共现边列表}
    cooccurrence_map: dict[int, list] = {}
    for item in cooccurrence_data:
        eid = item["entity_id"]
        cooccurrence_map[eid] = item.get("同场共现", {}).get("共现边列表", [])
    print(f"  同场共现: {len(cooccurrence_map)} 部剧本")

    # 2d. 角色别名映射 → {entity_id: {别名映射: {...}, 标准名索引: {...}, ...}}
    alias_map: dict[int, dict] = {}
    for item in alias_data:
        eid = item["entity_id"]
        alias_map[eid] = item.get("角色别名映射", {})
    print(f"  角色别名映射: {len(alias_map)} 部剧本")

    # 2e. 角色字典 → {entity_id: {标准名: {name, role_type, ...}}}
    role_dict_map: dict[int, dict] = {}
    for item in role_dict_data:
        eid = item["entity_id"]
        role_dict_map[eid] = item.get("角色字典", {})
    print(f"  角色字典: {len(role_dict_map)} 部剧本")

    # ── 3. 合并为统一数据结构 ─────────────────────────────────────────
    print("\n[3/5] 合并为统一数据结构...")

    # 收集所有 entity_id
    all_entity_ids = (
        set(play_type_map.keys())
        | set(relations_map.keys())
        | set(cooccurrence_map.keys())
        | set(alias_map.keys())
        | set(role_dict_map.keys())
    )
    print(f"  总计 entity_id: {len(all_entity_ids)}")

    unified: dict[int, dict] = {}
    for eid in sorted(all_entity_ids):
        # 剧本名优先从角色关系获取（含 entity_id 校验），否则从剧目类型
        play_name = ""
        if eid in relations_map:
            play_name = relations_map[eid].get("剧目类型", "") and ""  # 不用这个
            # 重新取名称
        play_name = play_name_map.get(eid, "")

        if not play_name and eid in relations_map:
            # 角色关系的 key 可能带 #entity_id 后缀
            for k, v in plays_section.items():
                if v.get("entity_id") == eid:
                    # key 可能是 "剧名" 或 "剧名#entity_id"
                    play_name = k.split("#")[0] if "#" in k else k
                    break

        if not play_name and eid in cooccurrence_map:
            # 从同场共现中获取
            for item in cooccurrence_data:
                if item["entity_id"] == eid:
                    play_name = item.get("name", "")
                    break

        # 剧目类型
        play_type = play_type_map.get(eid)

        # 角色字典（优先使用别名映射中的消歧后角色字典）
        alias_info = alias_map.get(eid, {})
        alias_dict = alias_info.get("消歧后角色字典", {})
        if not alias_dict:
            alias_dict = role_dict_map.get(eid, {})

        # 别名映射
        alias_lookup = alias_info.get("别名映射", {})

        # 语义关系边列表
        semantic_edges = []
        if eid in relations_map:
            semantic_edges = relations_map[eid].get("relations", [])

        # 共现边列表
        cooc_edges = cooccurrence_map.get(eid, [])

        # 角色名标准化（通过别名映射）
        def _resolve(name: str, lookup: dict = alias_lookup) -> str:
            """将角色名通过别名映射解析为标准名"""
            return lookup.get(name, name)

        # 标准化语义关系边中的角色名
        for edge in semantic_edges:
            edge["source"] = _resolve(edge.get("source", ""))
            edge["target"] = _resolve(edge.get("target", ""))

        # 标准化共现边中的角色名
        for edge in cooc_edges:
            edge["character_a"] = _resolve(edge.get("character_a", ""))
            edge["character_b"] = _resolve(edge.get("character_b", ""))

        unified[eid] = {
            "entity_id": eid,
            "剧本名": play_name,
            "剧目类型": play_type,
            "角色字典": alias_dict,
            "别名映射": alias_lookup,
            "语义关系边列表": semantic_edges,
            "共现边列表": cooc_edges,
        }

    # ── 4. 数据质量检查 ───────────────────────────────────────────────
    print("\n[4/5] 数据质量检查...")

    _print_quality_report(unified, play_type_map, relations_map,
                          cooccurrence_map, alias_map, role_dict_map)

    # ── 5. 打印摘要 ────────────────────────────────────────────────────
    print("\n[5/5] 数据加载摘要")
    print("-" * 50)

    total_semantic = sum(len(v["语义关系边列表"]) for v in unified.values())
    total_cooc = sum(len(v["共现边列表"]) for v in unified.values())
    total_roles = sum(len(v["角色字典"]) for v in unified.values())

    print(f"  剧本总数:       {len(unified)}")
    print(f"  语义关系边总数:  {total_semantic}")
    print(f"  共现边总数:     {total_cooc}")
    print(f"  角色总数:       {total_roles}")

    # 语义关系 source_tag 分布
    source_tags = Counter(
        e.get("source_tag", "unknown")
        for v in unified.values()
        for e in v["语义关系边列表"]
    )
    print(f"  语义关系来源分布: {dict(source_tags)}")

    # 语义关系 macro_type 分布
    macro_types = Counter(
        e.get("macro_type", "unknown")
        for v in unified.values()
        for e in v["语义关系边列表"]
    )
    print(f"  语义关系类型分布: {dict(macro_types)}")

    # 剧目类型分布
    play_type_dist = Counter(
        v["剧目类型"] or "缺失"
        for v in unified.values()
    )
    print(f"  剧目类型分布:    {dict(play_type_dist)}")

    print("\n" + "=" * 70)
    print("步骤 4.1 完成: 数据加载与整合成功")
    print("=" * 70)

    return unified


def _print_quality_report(
    unified: dict,
    play_type_map: dict,
    relations_map: dict,
    cooccurrence_map: dict,
    alias_map: dict,
    role_dict_map: dict,
) -> None:
    """打印数据质量检查报告"""

    all_eids = set(unified.keys())

    # 各数据源覆盖
    sources = {
        "剧目类型": set(play_type_map.keys()),
        "角色关系": set(relations_map.keys()),
        "同场共现": set(cooccurrence_map.keys()),
        "别名映射": set(alias_map.keys()),
        "角色字典": set(role_dict_map.keys()),
    }

    print("\n  ┌─────────────────────────────────────────────────┐")
    print("  │ 数据源覆盖率                                      │")
    print("  ├─────────────────────────────────────────────────┤")
    for name, eids in sources.items():
        overlap = eids & all_eids
        missing = all_eids - eids
        print(f"  │ {name:8s}: {len(overlap):5d}/{len(all_eids)} "
              f"({len(overlap)/len(all_eids)*100:.1f}%)")
        if missing:
            print(f"  │   缺失 entity_id 样本: {sorted(missing)[:5]}")
    print("  └─────────────────────────────────────────────────┘")

    # 角色名标准化情况
    unresolved_semantic = 0
    unresolved_cooc = 0
    total_semantic_chars = set()
    total_cooc_chars = set()
    alias_resolved_chars = set()

    for eid, data in unified.items():
        alias_lookup = data["别名映射"]
        role_dict = data["角色字典"]

        for edge in data["语义关系边列表"]:
            for field in ("source", "target"):
                name = edge.get(field, "")
                if name:
                    total_semantic_chars.add(name)
                    if name in alias_lookup:
                        alias_resolved_chars.add(name)
                    elif name not in role_dict:
                        unresolved_semantic += 1

        for edge in data["共现边列表"]:
            for field in ("character_a", "character_b"):
                name = edge.get(field, "")
                if name:
                    total_cooc_chars.add(name)
                    if name in alias_lookup:
                        alias_resolved_chars.add(name)
                    elif name not in role_dict:
                        unresolved_cooc += 1

    print(f"\n  语义关系边中不在角色字典的角色名: {unresolved_semantic}")
    print(f"  共现边中不在角色字典的角色名:     {unresolved_cooc}")

    # 空数据检查
    empty_plays = {
        eid: data["剧本名"]
        for eid, data in unified.items()
        if not data["语义关系边列表"] and not data["共现边列表"]
    }
    if empty_plays:
        print(f"\n  ⚠ 无任何关系数据的剧本: {len(empty_plays)} 部")
        sample = dict(list(empty_plays.items())[:5])
        for eid, name in sample.items():
            print(f"    - {name} (entity_id={eid})")

    # 剧目类型缺失
    missing_type = [
        (eid, data["剧本名"])
        for eid, data in unified.items()
        if not data["剧目类型"]
    ]
    if missing_type:
        print(f"\n  ⚠ 缺失剧目类型的剧本: {len(missing_type)} 部")
        for eid, name in missing_type[:5]:
            print(f"    - {name} (entity_id={eid})")

    # 角色字典缺失
    missing_roles = [
        (eid, data["剧本名"])
        for eid, data in unified.items()
        if not data["角色字典"]
    ]
    if missing_roles:
        print(f"\n  ⚠ 缺失角色字典的剧本: {len(missing_roles)} 部")
        for eid, name in missing_roles[:5]:
            print(f"    - {name} (entity_id={eid})")


# ═══════════════════════════════════════════════════════════════════════
# 4.2 构建单剧本 networkx 无向图
# ═══════════════════════════════════════════════════════════════════════

# 权重合并参数
ALPHA = 0.6   # LLM 语义权重
BETA = 0.5    # 纯共现降权因子


def _make_edge_key(a: str, b: str) -> tuple[str, str]:
    """生成无向边键（字典序排列保证一致性）"""
    return (a, b) if a <= b else (b, a)


def _compute_w_cooc(count: int, max_count: int) -> float:
    """
    计算共现权重的对数归一化：
      w_cooc = log(1 + n_cooc) / log(1 + max_count)
    """
    if max_count <= 0:
        return 0.0
    return math.log(1 + count) / math.log(1 + max_count)


def _compute_w_final(
    w_llm: float | None,
    w_cooc: float | None,
) -> tuple[float, str]:
    """
    计算最终合并权重，返回 (w_final, source_tag)。

    三种情况：
      - LLM关系 + 共现均有: w_final = α·w_llm + (1-α)·w_cooc, source_tag="merged"
      - 仅有LLM关系:        w_final = w_llm,                      source_tag="llm"
      - 仅有共现:           w_final = β·w_cooc,                   source_tag="cooccurrence"
    """
    has_llm = w_llm is not None and w_llm > 0
    has_cooc = w_cooc is not None and w_cooc > 0

    if has_llm and has_cooc:
        return round(ALPHA * w_llm + (1 - ALPHA) * w_cooc, 6), "merged"
    elif has_llm:
        return round(w_llm, 6), "llm"
    elif has_cooc:
        return round(BETA * w_cooc, 6), "cooccurrence"
    else:
        return 0.0, "cooccurrence"


def build_play_graph(play_data: dict) -> nx.Graph | None:
    """
    为单部剧本构建 networkx.Graph（无向图）。

    节点属性: name, role_type, scene_count, dialogue_count
    边属性:   relation_type, micro_type, direction, weight, evidence, source_tag

    合并策略:
      - 同一对角色既有 LLM 关系又有共现 → 合并为一条边，按公式计算 w_final
      - LLM 关系的 macro_type / micro_type / evidence / direction 优先保留
      - 纯共现边的 relation_type 标记为 "共现"

    Args:
        play_data: 4.1 整合后的单剧本数据字典

    Returns:
        networkx.Graph 或 None（如果剧本无任何角色/关系）
    """
    role_dict: dict = play_data.get("角色字典", {})
    semantic_edges: list[dict] = play_data.get("语义关系边列表", [])
    cooc_edges: list[dict] = play_data.get("共现边列表", [])

    if not role_dict and not semantic_edges and not cooc_edges:
        return None

    G = nx.Graph()

    # ── 1. 添加节点（来自角色字典）─────────────────────────────────────
    for char_name, char_info in role_dict.items():
        scenes = char_info.get("scenes", [])
        G.add_node(
            char_name,
            name=char_name,
            role_type=char_info.get("role_type", ""),
            scene_count=len(scenes) if isinstance(scenes, list) else 0,
            dialogue_count=char_info.get("dialogue_count", 0),
        )

    # ── 2. 索引语义关系边（按无向边键去重合并）────────────────────────
    # 同一对角色可能有多条 LLM 关系（如既是亲属又是同盟），保留权重最高的
    sem_by_key: dict[tuple[str, str], dict] = {}
    for edge in semantic_edges:
        src = edge.get("source", "")
        tgt = edge.get("target", "")
        if not src or not tgt or src == tgt:
            continue
        key = _make_edge_key(src, tgt)
        existing = sem_by_key.get(key)
        # 保留权重更高的语义关系
        if existing is None or edge.get("weight", 0) > existing.get("weight", 0):
            sem_by_key[key] = edge

    # ── 3. 索引共现边（按无向边键）────────────────────────────────────
    cooc_by_key: dict[tuple[str, str], dict] = {}
    for edge in cooc_edges:
        a = edge.get("character_a", "")
        b = edge.get("character_b", "")
        if not a or not b or a == b:
            continue
        key = _make_edge_key(a, b)
        # 同一对角色可能有多条共现记录（不应出现，但防御性处理）
        if key not in cooc_by_key or edge.get("count", 0) > cooc_by_key[key].get("count", 0):
            cooc_by_key[key] = edge

    # ── 4. 计算共现权重的归一化分母 ──────────────────────────────────
    max_cooc_count = 0
    for edge in cooc_by_key.values():
        c = edge.get("count", 0)
        if c > max_cooc_count:
            max_cooc_count = c

    # ── 5. 合并边并添加到图 ──────────────────────────────────────────
    all_edge_keys = set(sem_by_key.keys()) | set(cooc_by_key.keys())

    for key in all_edge_keys:
        a, b = key
        sem_edge = sem_by_key.get(key)
        cooc_edge = cooc_by_key.get(key)

        # LLM 权重：直接使用步骤3已计算的 weight
        w_llm = sem_edge.get("weight") if sem_edge else None

        # 共现权重：对数归一化
        w_cooc = None
        if cooc_edge:
            n_cooc = cooc_edge.get("count", 0)
            w_cooc = _compute_w_cooc(n_cooc, max_cooc_count) if n_cooc > 0 else 0.0

        # 计算最终权重和来源标记
        w_final, source_tag = _compute_w_final(w_llm, w_cooc)

        # 构建边属性
        if sem_edge:
            # LLM 关系属性优先保留
            relation_type = sem_edge.get("macro_type", "共现")
            micro_type = sem_edge.get("micro_type", "")
            direction = sem_edge.get("direction", "bidirectional")
            evidence = sem_edge.get("evidence", "")
        else:
            # 纯共现边
            relation_type = "共现"
            micro_type = ""
            direction = "bidirectional"
            evidence = ""

        G.add_edge(
            a, b,
            relation_type=relation_type,
            micro_type=micro_type,
            direction=direction,
            weight=w_final,
            evidence=evidence,
            source_tag=source_tag,
        )

        # 确保两端节点存在（可能不在角色字典中但出现在边中）
        for node in (a, b):
            if not G.has_node(node):
                G.add_node(
                    node,
                    name=node,
                    role_type="",
                    scene_count=0,
                    dialogue_count=0,
                )

    return G


def build_all_play_graphs(unified: dict[int, dict]) -> dict[int, nx.Graph]:
    """
    为所有剧本构建 networkx.Graph。

    Args:
        unified: 4.1 整合后的统一数据结构

    Returns:
        {entity_id: networkx.Graph}，跳过无角色/关系的剧本
    """
    print("=" * 70)
    print("步骤 4.2: 构建单剧本 networkx 无向图")
    print("=" * 70)

    graphs: dict[int, nx.Graph] = {}
    skipped = 0
    total_nodes = 0
    total_edges = 0

    for eid in sorted(unified.keys()):
        play_data = unified[eid]
        G = build_play_graph(play_data)
        if G is not None and G.number_of_nodes() > 0:
            graphs[eid] = G
            total_nodes += G.number_of_nodes()
            total_edges += G.number_of_edges()
        else:
            skipped += 1

    print(f"\n  构建完成:")
    print(f"    成功构建: {len(graphs)} 部剧本")
    print(f"    跳过(无数据): {skipped} 部")
    print(f"    总节点数: {total_nodes}")
    print(f"    总边数: {total_edges}")

    # 边来源分布
    source_dist = Counter()
    for G in graphs.values():
        for _u, _v, data in G.edges(data=True):
            source_dist[data.get("source_tag", "unknown")] += 1
    print(f"    边来源分布: {dict(source_dist)}")

    # 关系类型分布
    rel_type_dist = Counter()
    for G in graphs.values():
        for _u, _v, data in G.edges(data=True):
            rel_type_dist[data.get("relation_type", "unknown")] += 1
    print(f"    关系类型分布: {dict(rel_type_dist)}")

    # 权重统计
    all_weights = [
        data["weight"]
        for G in graphs.values()
        for _u, _v, data in G.edges(data=True)
        if "weight" in data
    ]
    if all_weights:
        print(f"    权重: min={min(all_weights):.4f}, "
              f"max={max(all_weights):.4f}, "
              f"mean={sum(all_weights)/len(all_weights):.4f}")

    print("\n" + "=" * 70)
    print("步骤 4.2 完成: 单剧本网络图构建成功")
    print("=" * 70)

    return graphs


def graph_to_dict(eid: int, play_data: dict, G: nx.Graph) -> dict:
    """
    将 networkx.Graph 序列化为可 JSON 化的字典。

    格式:
    {
        "entity_id": int,
        "剧本名": str,
        "剧目类型": str,
        "nodes": [{"id": ..., "name": ..., "role_type": ..., "scene_count": ..., "dialogue_count": ...}],
        "edges": [{"source": ..., "target": ..., "weight": ..., "relation_type": ..., ...}],
    }
    """
    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "id": node_id,
            "name": data.get("name", node_id),
            "role_type": data.get("role_type", ""),
            "scene_count": data.get("scene_count", 0),
            "dialogue_count": data.get("dialogue_count", 0),
        })

    edges = []
    for source, target, data in G.edges(data=True):
        edges.append({
            "source": source,
            "target": target,
            "weight": data.get("weight", 0),
            "relation_type": data.get("relation_type", "共现"),
            "micro_type": data.get("micro_type", ""),
            "direction": data.get("direction", "bidirectional"),
            "evidence": data.get("evidence", ""),
            "source_tag": data.get("source_tag", ""),
        })

    return {
        "entity_id": eid,
        "剧本名": play_data.get("剧本名", ""),
        "剧目类型": play_data.get("剧目类型", ""),
        "nodes": nodes,
        "edges": edges,
    }


# ═══════════════════════════════════════════════════════════════════════
# 4.3 计算单剧本网络指标
# ═══════════════════════════════════════════════════════════════════════


def compute_play_metrics(G: nx.Graph) -> dict:
    """
    计算单部剧本的网络指标，返回可 JSON 序列化的字典。

    包含:
      - 图级指标: node_count, edge_count, density, avg_clustering,
                 connected_components, largest_component_ratio
      - 节点级指标: degree_centrality, betweenness_centrality, closeness_centrality
      - 关系类型分布: 各 relation_type 边数及占比
      - 核心角色: 度中心性 TOP-3 角色及其行当
    """
    n = G.number_of_nodes()
    m = G.number_of_edges()

    # ── 图级指标 ─────────────────────────────────────────────────────
    density = nx.density(G) if n > 1 else 0.0

    # 平均聚类系数（需要至少 1 个节点且度 >= 2 才有意义）
    if n > 0:
        clustering_dict = nx.clustering(G)
        avg_clustering = sum(clustering_dict.values()) / len(clustering_dict) if clustering_dict else 0.0
    else:
        avg_clustering = 0.0

    # 连通分量
    components = list(nx.connected_components(G))
    num_components = len(components)
    if n > 0 and components:
        largest_cc = max(components, key=len)
        largest_component_ratio = len(largest_cc) / n
    else:
        largest_component_ratio = 0.0

    # ── 节点级指标 ──────────────────────────────────────────────────
    if n > 0:
        degree_cent = nx.degree_centrality(G)
        # 大图（>500节点）使用采样近似加速 betweenness
        betweenness_k = min(n, 500) if n > 500 else None
        betweenness_cent = nx.betweenness_centrality(
            G, normalized=True, k=betweenness_k
        )
        # 接近中心性：大分量（>500节点）跳过，避免 O(n²) 慢计算
        closeness_cent = {}
        for cc_nodes in components:
            if len(cc_nodes) > 500:
                # 大分量：对度中心性 TOP-200 节点采样计算
                top_nodes = sorted(
                    cc_nodes, key=lambda nd: degree_cent.get(nd, 0), reverse=True
                )[:200]
                cc_subgraph = G.subgraph(cc_nodes)
                for node in top_nodes:
                    closeness_cent[node] = nx.closeness_centrality(
                        cc_subgraph, u=node
                    )
                # 其余节点设为 0
                for node in cc_nodes:
                    if node not in closeness_cent:
                        closeness_cent[node] = 0.0
            elif len(cc_nodes) > 1:
                cc_subgraph = G.subgraph(cc_nodes)
                cc_closeness = nx.closeness_centrality(cc_subgraph)
                closeness_cent.update(cc_closeness)
            else:
                # 孤立节点接近中心性为 0
                for node in cc_nodes:
                    closeness_cent[node] = 0.0
    else:
        degree_cent = {}
        betweenness_cent = {}
        closeness_cent = {}

    # ── 关系类型分布 ────────────────────────────────────────────────
    rel_type_counts: dict[str, int] = Counter()
    for _u, _v, data in G.edges(data=True):
        rel_type_counts[data.get("relation_type", "未知")] += 1

    rel_type_distribution = {}
    for rt, cnt in rel_type_counts.items():
        rel_type_distribution[rt] = {
            "count": cnt,
            "ratio": round(cnt / m, 4) if m > 0 else 0.0,
        }

    # ── 核心角色: 度中心性 TOP-3 ────────────────────────────────────
    top3_degree = sorted(degree_cent.items(), key=lambda x: x[1], reverse=True)[:3]
    core_characters = []
    for char_name, cent_val in top3_degree:
        node_data = G.nodes[char_name]
        core_characters.append({
            "name": char_name,
            "role_type": node_data.get("role_type", ""),
            "degree_centrality": round(cent_val, 6),
        })

    # ── 节点级指标汇总（用于 JSON 输出）─────────────────────────────
    node_metrics = {}
    for node in G.nodes():
        node_metrics[node] = {
            "degree_centrality": round(degree_cent.get(node, 0.0), 6),
            "betweenness_centrality": round(betweenness_cent.get(node, 0.0), 6),
            "closeness_centrality": round(closeness_cent.get(node, 0.0), 6),
        }

    return {
        # 图级指标
        "node_count": n,
        "edge_count": m,
        "density": round(density, 6),
        "avg_clustering": round(avg_clustering, 6),
        "connected_components": num_components,
        "largest_component_ratio": round(largest_component_ratio, 6),
        # 关系类型分布
        "relation_type_distribution": rel_type_distribution,
        # 核心角色
        "core_characters": core_characters,
        # 节点级指标
        "node_metrics": node_metrics,
    }


def compute_all_play_metrics(
    graphs: dict[int, nx.Graph],
    unified: dict[int, dict],
) -> dict[int, dict]:
    """
    批量计算所有剧本的网络指标。

    Returns:
        {entity_id: metrics_dict}，每个 metrics_dict 包含 entity_id、剧本名、剧目类型和指标
    """
    print("=" * 70)
    print("步骤 4.3: 计算单剧本网络指标")
    print("=" * 70)

    results: dict[int, dict] = {}
    t0 = time.time()

    for eid in sorted(graphs.keys()):
        G = graphs[eid]
        play_data = unified[eid]
        metrics = compute_play_metrics(G)
        metrics["entity_id"] = eid
        metrics["剧本名"] = play_data.get("剧本名", "")
        metrics["剧目类型"] = play_data.get("剧目类型", "")
        results[eid] = metrics

    elapsed = time.time() - t0

    # ── 汇总统计 ─────────────────────────────────────────────────────
    all_metrics = list(results.values())
    print(f"\n  计算完成: {len(all_metrics)} 部剧本 ({elapsed:.1f}s)")

    if all_metrics:
        densities = [m["density"] for m in all_metrics]
        clusterings = [m["avg_clustering"] for m in all_metrics]
        node_counts = [m["node_count"] for m in all_metrics]
        components = [m["connected_components"] for m in all_metrics]

        print(f"  节点数: min={min(node_counts)}, max={max(node_counts)}, "
              f"mean={sum(node_counts)/len(node_counts):.1f}")
        print(f"  网络密度: min={min(densities):.4f}, max={max(densities):.4f}, "
              f"mean={sum(densities)/len(densities):.4f}")
        print(f"  平均聚类系数: min={min(clusterings):.4f}, max={max(clusterings):.4f}, "
              f"mean={sum(clusterings)/len(clusterings):.4f}")
        print(f"  连通分量数: min={min(components)}, max={max(components)}, "
              f"mean={sum(components)/len(components):.1f}")

        # 按剧目类型汇总
        type_metrics: dict[str, list[dict]] = defaultdict(list)
        for m in all_metrics:
            pt = m.get("剧目类型", "未分类")
            type_metrics[pt].append(m)

        print(f"\n  按剧目类型汇总:")
        for pt, metrics_list in sorted(type_metrics.items()):
            avg_density = sum(m["density"] for m in metrics_list) / len(metrics_list)
            avg_clust = sum(m["avg_clustering"] for m in metrics_list) / len(metrics_list)
            avg_nodes = sum(m["node_count"] for m in metrics_list) / len(metrics_list)
            print(f"    {pt}: {len(metrics_list)}部, "
                  f"avg_nodes={avg_nodes:.1f}, "
                  f"avg_density={avg_density:.4f}, "
                  f"avg_clustering={avg_clust:.4f}")

    print("\n" + "=" * 70)
    print("步骤 4.3 完成: 单剧本网络指标计算成功")
    print("=" * 70)

    return results


# ═══════════════════════════════════════════════════════════════════════
# 4.4 导出单剧本网络数据为 JSON/GZ
# ═══════════════════════════════════════════════════════════════════════

def export_play_networks(
    graphs: dict[int, nx.Graph],
    unified: dict[int, dict],
    metrics_results: dict[int, dict],
    output_path: Path = FILE_PLAY_NETWORKS,
) -> dict:
    """
    4.4: 将所有单剧本网络数据导出为统一格式的 JSON/GZ 文件。

    复用 db_export_attributes.py 的导出模式：
      - 大文件（>500KB）使用 gzip 压缩
      - 使用 indent=2 保持可读性
      - 包含 _metadata 导出元信息

    输出格式:
    {
      "_metadata": {
        "export_time": "...",
        "total_plays": 1473,
        "total_nodes": ...,
        "total_edges": ...,
        "weight_params": {"alpha": 0.6, "beta": 0.5}
      },
      "plays": [
        {
          "entity_id": 123,
          "剧本名": "...",
          "剧目类型": "历史戏",
          "nodes": [...],
          "edges": [...],
          "metrics": {...}
        },
        ...
      ]
    }

    Args:
        graphs: {entity_id: networkx.Graph}
        unified: {entity_id: play_data}
        metrics_results: {entity_id: metrics_dict}
        output_path: 输出文件路径

    Returns:
        导出汇总信息
    """
    print("=" * 70)
    print("步骤 4.4: 导出单剧本网络数据为 JSON/GZ")
    print("=" * 70)

    t0 = time.time()

    # ── 构建导出数据 ─────────────────────────────────────────────────
    plays_data = []
    total_nodes = 0
    total_edges = 0

    for eid in sorted(graphs.keys()):
        G = graphs[eid]
        play_data = unified[eid]
        metrics = metrics_results.get(eid, {})

        # 节点
        nodes = []
        node_metrics = metrics.get("node_metrics", {})
        for node_id, ndata in G.nodes(data=True):
            nm = node_metrics.get(node_id, {})
            nodes.append({
                "id": node_id,
                "name": ndata.get("name", node_id),
                "role_type": ndata.get("role_type", ""),
                "scene_count": ndata.get("scene_count", 0),
                "dialogue_count": ndata.get("dialogue_count", 0),
                "degree_centrality": nm.get("degree_centrality", 0),
                "betweenness_centrality": nm.get("betweenness_centrality", 0),
                "closeness_centrality": nm.get("closeness_centrality", 0),
            })

        # 边
        edges = []
        for source, target, edata in G.edges(data=True):
            edges.append({
                "source": source,
                "target": target,
                "weight": edata.get("weight", 0),
                "relation_type": edata.get("relation_type", "共现"),
                "micro_type": edata.get("micro_type", ""),
                "direction": edata.get("direction", "bidirectional"),
                "evidence": edata.get("evidence", ""),
                "source_tag": edata.get("source_tag", ""),
            })

        # 指标
        play_metrics = {
            "node_count": metrics.get("node_count", G.number_of_nodes()),
            "edge_count": metrics.get("edge_count", G.number_of_edges()),
            "density": metrics.get("density", 0),
            "avg_clustering": metrics.get("avg_clustering", 0),
            "connected_components": metrics.get("connected_components", 0),
            "largest_component_ratio": metrics.get("largest_component_ratio", 0),
            "relation_type_distribution": metrics.get("relation_type_distribution", {}),
            "core_characters": metrics.get("core_characters", []),
        }

        plays_data.append({
            "entity_id": eid,
            "剧本名": play_data.get("剧本名", ""),
            "剧目类型": play_data.get("剧目类型", ""),
            "nodes": nodes,
            "edges": edges,
            "metrics": play_metrics,
        })

        total_nodes += len(nodes)
        total_edges += len(edges)

    # ── 元数据 ──────────────────────────────────────────────────────
    from datetime import datetime

    metadata = {
        "export_time": datetime.now().isoformat(),
        "total_plays": len(plays_data),
        "total_nodes": total_nodes,
        "total_edges": total_edges,
        "weight_params": {
            "alpha": ALPHA,
            "beta": BETA,
        },
        "graph_type": "undirected",
        "node_attributes": ["name", "role_type", "scene_count", "dialogue_count",
                            "degree_centrality", "betweenness_centrality", "closeness_centrality"],
        "edge_attributes": ["weight", "relation_type", "micro_type", "direction",
                            "evidence", "source_tag"],
        "source": {
            "4.1": "数据加载与整合",
            "4.2": "单剧本网络图构建",
            "4.3": "网络指标计算",
        },
    }

    export_data = {
        "_metadata": metadata,
        "plays": plays_data,
    }

    # ── 写入文件 ─────────────────────────────────────────────────────
    # 复用 db_export_attributes.py 的导出模式：大文件 gzip + indent=2
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 估算文件大小决定是否压缩
    raw_size_est = len(json.dumps(export_data, ensure_ascii=False))
    use_gzip = raw_size_est > 500_000 or str(output_path).endswith(".gz")

    if use_gzip:
        actual_path = output_path if str(output_path).endswith(".gz") else Path(str(output_path) + ".gz")
        with gzip.open(actual_path, "wt", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
    else:
        actual_path = output_path
        with open(actual_path, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

    file_size = actual_path.stat().st_size
    size_mb = file_size / (1024 * 1024)
    elapsed = time.time() - t0

    print(f"\n  导出完成:")
    print(f"    剧本数: {len(plays_data)}")
    print(f"    总节点: {total_nodes}")
    print(f"    总边数: {total_edges}")
    print(f"    文件: {actual_path.name} ({size_mb:.1f} MB)")
    print(f"    耗时: {elapsed:.1f}s")

    # ── 验证导出数据 ──────────────────────────────────────────────────
    print(f"\n  验证导出数据...")
    # 抽样检查第一条数据格式
    if plays_data:
        sample = plays_data[0]
        required_keys = {"entity_id", "剧本名", "剧目类型", "nodes", "edges", "metrics"}
        missing = required_keys - set(sample.keys())
        if missing:
            print(f"    ⚠ 第一条数据缺少字段: {missing}")
        else:
            print(f"    ✓ 格式验证通过 (entity_id={sample['entity_id']}, {sample['剧本名']})")

        # 检查指标字段
        m = sample["metrics"]
        metric_keys = {"node_count", "edge_count", "density", "avg_clustering",
                       "connected_components", "largest_component_ratio",
                       "relation_type_distribution", "core_characters"}
        missing_m = metric_keys - set(m.keys())
        if missing_m:
            print(f"    ⚠ metrics 缺少字段: {missing_m}")
        else:
            print(f"    ✓ metrics 字段完整 (node_count={m['node_count']}, density={m['density']})")

        # 检查节点字段
        if sample["nodes"]:
            n = sample["nodes"][0]
            node_keys = {"id", "name", "role_type", "scene_count", "dialogue_count",
                         "degree_centrality", "betweenness_centrality", "closeness_centrality"}
            missing_n = node_keys - set(n.keys())
            if missing_n:
                print(f"    ⚠ node 缺少字段: {missing_n}")
            else:
                print(f"    ✓ node 字段完整 ({n['id']})")

        # 检查边字段
        if sample["edges"]:
            e = sample["edges"][0]
            edge_keys = {"source", "target", "weight", "relation_type",
                         "micro_type", "direction", "evidence", "source_tag"}
            missing_e = edge_keys - set(e.keys())
            if missing_e:
                print(f"    ⚠ edge 缺少字段: {missing_e}")
            else:
                print(f"    ✓ edge 字段完整 ({e['source']}→{e['target']})")

    print("\n" + "=" * 70)
    print("步骤 4.4 完成: 单剧本网络数据导出成功")
    print("=" * 70)

    return {
        "export_time": metadata["export_time"],
        "total_plays": len(plays_data),
        "file": actual_path.name,
        "size_bytes": file_size,
    }


# ═══════════════════════════════════════════════════════════════════════
# 4.5 构建跨剧本全局网络并导出
# ═══════════════════════════════════════════════════════════════════════

def build_global_graph(
    graphs: dict[int, nx.Graph],
    unified: dict[int, dict],
    verbose: bool = True,
) -> nx.Graph:
    """
    4.5: 合并所有剧本的角色关系构建全局 networkx.Graph。

    同名角色（经别名标准化后）作为全局图中的同一节点，
    节点属性增加 plays: [剧本名列表], play_count: int。

    同一对角色跨剧的边进行合并：
      - weight: 均值
      - relation_type: 最高频类型
      - all_relation_types: 所有出现过的类型列表
      - plays / play_types: 该边出现的剧本/类型列表
      - play_count: 跨剧出现次数

    Args:
        graphs: {entity_id: networkx.Graph}
        unified: {entity_id: play_data}
        verbose: 是否打印详细信息

    Returns:
        全局 networkx.Graph
    """
    if verbose:
        print("=" * 70)
        print("步骤 4.5: 构建跨剧本全局网络")
        print("=" * 70)

    t0 = time.time()
    G_global = nx.Graph()

    # ── 累积节点和边数据 ─────────────────────────────────────────────
    node_plays: dict[str, set[str]] = defaultdict(set)
    node_data_map: dict[str, dict] = {}
    edge_entries: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for eid in sorted(graphs.keys()):
        G = graphs[eid]
        play_name = unified[eid].get("剧本名", "")
        play_type = unified[eid].get("剧目类型", "")

        # 累积节点
        for node_id, ndata in G.nodes(data=True):
            node_plays[node_id].add(play_name)
            if node_id not in node_data_map:
                node_data_map[node_id] = dict(ndata)

        # 累积边
        for source, target, edata in G.edges(data=True):
            key = _make_edge_key(source, target)
            edge_entries[key].append({
                **dict(edata),
                "_play_name": play_name,
                "_play_type": play_type,
                "_entity_id": eid,
                "_source": source,
                "_target": target,
            })

    # ── 添加节点 ─────────────────────────────────────────────────────
    for node_id in sorted(node_plays.keys()):
        ndata = node_data_map.get(node_id, {})
        plays_list = sorted(node_plays[node_id])
        G_global.add_node(
            node_id,
            name=ndata.get("name", node_id),
            role_type=ndata.get("role_type", ""),
            scene_count=ndata.get("scene_count", 0),
            dialogue_count=ndata.get("dialogue_count", 0),
            plays=plays_list,
            play_count=len(plays_list),
        )

    # ── 添加边（合并跨剧）─────────────────────────────────────────────
    for (a, b), entries in edge_entries.items():
        # 权重取均值
        weights = [e.get("weight", 0) for e in entries]
        avg_weight = sum(weights) / len(weights)

        # 关系类型：最高频为主，收集所有类型
        rt_counts = Counter(e.get("relation_type", "共现") for e in entries)
        main_relation = rt_counts.most_common(1)[0][0]
        all_rtypes = sorted(set(e.get("relation_type", "共现") for e in entries))

        # 方向：最高频
        dir_counts = Counter(e.get("direction", "bidirectional") for e in entries)
        main_direction = dir_counts.most_common(1)[0][0]

        # 出现的剧本和类型
        edge_plays = sorted(set(e["_play_name"] for e in entries))
        edge_ptypes = sorted(set(e["_play_type"] for e in entries if e["_play_type"]))

        # 微观类型
        micro_types = sorted(set(
            e.get("micro_type", "") for e in entries if e.get("micro_type")
        ))

        G_global.add_edge(
            a, b,
            weight=round(avg_weight, 6),
            relation_type=main_relation,
            all_relation_types=all_rtypes,
            micro_type=micro_types[0] if len(micro_types) == 1 else "",
            all_micro_types=micro_types,
            direction=main_direction,
            plays=edge_plays,
            play_count=len(entries),
            play_types=edge_ptypes,
        )

    elapsed = time.time() - t0

    if verbose:
        print(f"\n  全局网络构建完成 ({elapsed:.1f}s):")
        print(f"    节点数: {G_global.number_of_nodes()}")
        print(f"    边数: {G_global.number_of_edges()}")

        # 跨剧角色统计
        multi_play_nodes = [
            (n, d) for n, d in G_global.nodes(data=True)
            if d.get("play_count", 0) > 1
        ]
        print(f"    跨剧角色数: {len(multi_play_nodes)}")
        if multi_play_nodes:
            top_multi = sorted(
                multi_play_nodes, key=lambda x: x[1]["play_count"], reverse=True
            )[:10]
            print(f"    跨剧最多的角色 (TOP-10):")
            for n, nd in top_multi:
                print(f"      {nd['name']}: {nd['play_count']}部剧")

        # 跨剧边统计
        multi_play_edges = sum(
            1 for u, v, d in G_global.edges(data=True) if d.get("play_count", 0) > 1
        )
        print(f"    跨剧边数: {multi_play_edges}")

    return G_global


def build_type_subgraphs(
    graphs: dict[int, nx.Graph],
    unified: dict[int, dict],
) -> dict[str, nx.Graph]:
    """
    按剧目类型提取子图并构建类型级全局网络。

    对每种剧目类型，仅合并该类型下的所有剧本构建全局网络。

    Returns:
        {剧目类型: networkx.Graph}
    """
    print("\n  按剧目类型构建子图...")

    # 按类型分组
    type_eids: dict[str, list[int]] = defaultdict(list)
    for eid in sorted(unified.keys()):
        pt = unified[eid].get("剧目类型")
        if pt:
            type_eids[pt].append(eid)

    type_graphs = {}
    for pt, eids in sorted(type_eids.items()):
        sub_graphs = {eid: graphs[eid] for eid in eids if eid in graphs}
        if sub_graphs:
            sub_unified = {eid: unified[eid] for eid in eids}
            G_type = build_global_graph(sub_graphs, sub_unified, verbose=False)
            type_graphs[pt] = G_type
            print(f"    {pt}: {len(sub_graphs)}部剧, "
                  f"nodes={G_type.number_of_nodes()}, edges={G_type.number_of_edges()}")

    return type_graphs


def export_global_network(
    G_global: nx.Graph,
    unified: dict[int, dict],
    global_metrics: dict,
    type_subgraphs: dict[str, nx.Graph],
    type_metrics: dict[str, dict],
) -> dict:
    """
    4.5: 导出全局网络数据和指标。

    输出:
      - 全局网络.json.gz: 全局网络数据（含节点、边、指标）
      - 网络指标.json: 全局 + 按类型分组的指标汇总
    """
    print("=" * 70)
    print("步骤 4.5: 导出全局网络数据和指标")
    print("=" * 70)

    from datetime import datetime

    t0 = time.time()

    # ── 构建全局网络导出数据 ──────────────────────────────────────────
    nodes = []
    node_metrics = global_metrics.get("node_metrics", {})
    for node_id, ndata in sorted(G_global.nodes(data=True)):
        nm = node_metrics.get(node_id, {})
        nodes.append({
            "id": node_id,
            "name": ndata.get("name", node_id),
            "role_type": ndata.get("role_type", ""),
            "scene_count": ndata.get("scene_count", 0),
            "dialogue_count": ndata.get("dialogue_count", 0),
            "plays": ndata.get("plays", []),
            "play_count": ndata.get("play_count", 0),
            "degree_centrality": round(nm.get("degree_centrality", 0), 6),
            "betweenness_centrality": round(nm.get("betweenness_centrality", 0), 6),
            "closeness_centrality": round(nm.get("closeness_centrality", 0), 6),
        })

    edges = []
    for source, target, edata in sorted(G_global.edges(data=True)):
        edges.append({
            "source": source,
            "target": target,
            "weight": edata.get("weight", 0),
            "relation_type": edata.get("relation_type", "共现"),
            "all_relation_types": edata.get("all_relation_types", []),
            "micro_type": edata.get("micro_type", ""),
            "all_micro_types": edata.get("all_micro_types", []),
            "direction": edata.get("direction", "bidirectional"),
            "plays": edata.get("plays", []),
            "play_count": edata.get("play_count", 0),
            "play_types": edata.get("play_types", []),
        })

    metadata = {
        "export_time": datetime.now().isoformat(),
        "total_plays": len(unified),
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "multi_play_nodes": sum(
            1 for n in nodes if n.get("play_count", 0) > 1
        ),
        "multi_play_edges": sum(
            1 for e in edges if e.get("play_count", 0) > 1
        ),
        "weight_params": {"alpha": ALPHA, "beta": BETA},
        "graph_type": "global_undirected",
        "node_attributes": [
            "name", "role_type", "scene_count", "dialogue_count",
            "plays", "play_count",
            "degree_centrality", "betweenness_centrality", "closeness_centrality",
        ],
        "edge_attributes": [
            "weight", "relation_type", "all_relation_types",
            "micro_type", "all_micro_types", "direction",
            "plays", "play_count", "play_types",
        ],
    }

    global_network_data = {
        "_metadata": metadata,
        "nodes": nodes,
        "edges": edges,
    }

    # ── 写入 全局网络.json.gz ─────────────────────────────────────────
    output_path = FILE_GLOBAL_NETWORK
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output_path, "wt", encoding="utf-8") as f:
        json.dump(global_network_data, f, ensure_ascii=False, indent=2)

    file_size = output_path.stat().st_size
    size_mb = file_size / (1024 * 1024)

    # ── 构建网络指标导出数据 ──────────────────────────────────────────
    def _extract_metrics(metrics: dict) -> dict:
        """提取指标中可导出的字段（不含 node_metrics）"""
        return {
            "node_count": metrics.get("node_count", 0),
            "edge_count": metrics.get("edge_count", 0),
            "density": metrics.get("density", 0),
            "avg_clustering": metrics.get("avg_clustering", 0),
            "connected_components": metrics.get("connected_components", 0),
            "largest_component_ratio": metrics.get("largest_component_ratio", 0),
            "relation_type_distribution": metrics.get("relation_type_distribution", {}),
            "core_characters": metrics.get("core_characters", []),
        }

    # 全局指标
    global_export = _extract_metrics(global_metrics)
    global_export["multi_play_nodes"] = sum(
        1 for n, d in G_global.nodes(data=True) if d.get("play_count", 0) > 1
    )
    global_export["multi_play_edges"] = sum(
        1 for u, v, d in G_global.edges(data=True) if d.get("play_count", 0) > 1
    )

    # 按类型指标
    by_type_export = {}
    for pt in sorted(type_metrics.keys()):
        by_type_export[pt] = _extract_metrics(type_metrics[pt])

    metrics_export = {
        "_metadata": {
            "export_time": datetime.now().isoformat(),
            "source": "4.5 构建跨剧本全局网络并导出",
        },
        "global": global_export,
        "by_type": by_type_export,
    }

    # ── 写入 网络指标.json ──────────────────────────────────────────
    metrics_path = FILE_NETWORK_METRICS
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_export, f, ensure_ascii=False, indent=2)

    metrics_size = metrics_path.stat().st_size
    elapsed = time.time() - t0

    print(f"\n  导出完成 ({elapsed:.1f}s):")
    print(f"    全局网络: {output_path.name} ({size_mb:.1f} MB)")
    print(f"    网络指标: {metrics_path.name} ({metrics_size/1024:.1f} KB)")
    print(f"    节点数: {len(nodes)}, 边数: {len(edges)}")
    print(f"    跨剧角色: {metadata['multi_play_nodes']}")
    print(f"    跨剧边: {metadata['multi_play_edges']}")
    print(f"    剧目类型数: {len(by_type_export)}")

    # 按类型摘要
    print(f"\n  按类型摘要:")
    for pt, m in sorted(by_type_export.items()):
        print(f"    {pt}: nodes={m['node_count']}, edges={m['edge_count']}, "
              f"density={m['density']:.4f}, avg_clustering={m['avg_clustering']:.4f}")

    print("\n" + "=" * 70)
    print("步骤 4.5 完成: 全局网络构建与导出成功")
    print("=" * 70)

    return {
        "global_network_file": output_path.name,
        "metrics_file": metrics_path.name,
        "total_nodes": len(nodes),
        "total_edges": len(edges),
    }


# ═══════════════════════════════════════════════════════════════════════
# 4.6 CLI 整合：断点续传、日志、错误处理
# ═══════════════════════════════════════════════════════════════════════

import logging

logger = logging.getLogger("build_networks")


def _setup_logging(verbose: bool = False):
    """配置日志格式"""
    level = logging.DEBUG if verbose else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"
    ))
    logger.addHandler(handler)
    logger.setLevel(level)


def _load_unified_data(entity_id: int | None = None) -> dict[int, dict]:
    """加载 4.1 整合数据，可选筛选指定 entity_id"""
    # 优先尝试 entity_id 专属文件
    if entity_id is not None:
        entity_path = DATA_DIR / f"4.1_unified_data_{entity_id}.json.gz"
        if entity_path.exists():
            data = _load_json(entity_path)
            unified = {item["entity_id"]: item for item in data}
            if entity_id in unified:
                return {entity_id: unified[entity_id]}
            else:
                logger.error(f"entity_id={entity_id} 不在专属数据文件中")
                return {}

    unified_path = DATA_DIR / "4.1_unified_data.json.gz"
    if not unified_path.exists():
        logger.error("4.1 整合数据不存在，请先运行: python build_networks.py build --step 4.1")
        return {}

    data = _load_json(unified_path)
    unified = {item["entity_id"]: item for item in data}

    if entity_id is not None:
        if entity_id in unified:
            unified = {entity_id: unified[entity_id]}
            logger.info(f"已筛选: 仅保留 entity_id={entity_id} ({unified[entity_id]['剧本名']})")
        else:
            logger.error(f"entity_id={entity_id} 不在数据中")
            return {}

    return unified


def _load_existing_play_networks() -> dict[int, dict] | None:
    """
    加载已有的单剧本网络数据，用于断点续传。
    返回 {entity_id: play_dict} 或 None（文件不存在）。
    """
    if not FILE_PLAY_NETWORKS.exists():
        return None

    try:
        data = _load_json(FILE_PLAY_NETWORKS)
        if isinstance(data, dict) and "plays" in data:
            return {p["entity_id"]: p for p in data["plays"]}
        elif isinstance(data, list):
            return {p["entity_id"]: p for p in data}
    except Exception as e:
        logger.warning(f"加载已有单剧本网络数据失败: {e}")
    return None


def _load_existing_global_network() -> dict | None:
    """加载已有的全局网络数据，用于断点续传检查。"""
    if not FILE_GLOBAL_NETWORK.exists():
        return None
    try:
        return _load_json(FILE_GLOBAL_NETWORK)
    except Exception as e:
        logger.warning(f"加载已有全局网络数据失败: {e}")
        return None


# ── 构建上下文：在步骤间共享数据 ────────────────────────────────────

class BuildContext:
    """构建流程上下文，在步骤间共享 unified / graphs / metrics 等数据。"""

    def __init__(self, step: str | None, entity_id: int | None, force: bool = False):
        self.step = step
        self.entity_id = entity_id
        self.force = force  # 为 True 时跳过断点续传，强制全量重建
        self.unified: dict[int, dict] | None = None
        self.graphs: dict[int, nx.Graph] | None = None
        self.metrics_results: dict[int, dict] | None = None
        self.errors: list[str] = []

    def ensure_unified(self) -> dict[int, dict] | None:
        """确保 unified 数据可用，按需加载。"""
        if self.unified is not None:
            return self.unified
        self.unified = _load_unified_data(self.entity_id)
        return self.unified

    def ensure_graphs(self) -> dict[int, nx.Graph] | None:
        """确保 graphs 数据可用，按需构建。"""
        if self.graphs is not None:
            return self.graphs
        unified = self.ensure_unified()
        if not unified:
            return None
        self.graphs = build_all_play_graphs(unified)
        return self.graphs

    def ensure_metrics(self) -> dict[int, dict] | None:
        """确保 metrics_results 数据可用，按需计算。"""
        if self.metrics_results is not None:
            return self.metrics_results
        graphs = self.ensure_graphs()
        unified = self.ensure_unified()
        if not graphs or not unified:
            return None
        self.metrics_results = compute_all_play_metrics(graphs, unified)
        return self.metrics_results


def _should_run(step: str | None, target: str) -> bool:
    """判断 target 步骤是否应执行。step=None 表示全流程。"""
    if step is None:
        return True
    return step == target


def _step_range_includes(step: str | None, *targets: str) -> bool:
    """判断步骤是否在目标列表或全流程中。"""
    return step is None or step in targets


def cmd_build(args):
    """
    执行网络构建流程。

    CLI 用法:
      python build_networks.py build                # 执行 4.1~4.5 全流程
      python build_networks.py build --step 4.2    # 单独执行某子步骤
      python build_networks.py build --entity-id 123  # 单剧本构建
      python build_networks.py build --force       # 强制全量重建（禁用断点续传）
      python build_networks.py build --verbose     # 详细日志
    """
    step = getattr(args, "step", None)
    entity_id = getattr(args, "entity_id", None)
    force = getattr(args, "force", False)
    verbose = getattr(args, "verbose", False)

    _setup_logging(verbose)

    ctx = BuildContext(step=step, entity_id=entity_id, force=force)

    # 校验 step 值
    valid_steps = {"4.1", "4.2", "4.3", "4.4", "4.5"}
    if step and step not in valid_steps:
        logger.error(f"无效步骤: {step}，有效值: {sorted(valid_steps)}")
        return

    pipeline_start = time.time()
    logger.info(f"开始构建流程 (step={step or '全流程'}, entity_id={entity_id or '全部'}, force={force})")

    # ── 步骤 4.1: 数据准备 ────────────────────────────────────────────
    if _should_run(step, "4.1"):
        try:
            t0 = time.time()
            logger.info("── 步骤 4.1: 数据准备 ──")

            unified = load_all_data()

            if entity_id is not None:
                eid = int(entity_id)
                if eid in unified:
                    unified = {eid: unified[eid]}
                    logger.info(f"已筛选: 仅保留 entity_id={eid} ({unified[eid]['剧本名']})")
                else:
                    logger.error(f"entity_id={eid} 不在数据中")
                    ctx.errors.append("4.1: entity_id 不存在")
                    return

            if entity_id is not None:
                output_path = DATA_DIR / f"4.1_unified_data_{entity_id}.json.gz"
            else:
                output_path = DATA_DIR / "4.1_unified_data.json.gz"
            logger.info(f"保存整合数据到: {output_path}")
            unified_list = [unified[eid] for eid in sorted(unified.keys())]
            with gzip.open(output_path, "wt", encoding="utf-8") as f:
                json.dump(unified_list, f, ensure_ascii=False)
            size_mb = output_path.stat().st_size / (1024 * 1024)
            logger.info(f"4.1 完成 ({size_mb:.1f} MB, {time.time()-t0:.1f}s)")

            ctx.unified = unified

        except Exception as e:
            logger.error(f"步骤 4.1 失败: {e}")
            ctx.errors.append(f"4.1: {e}")
            if _should_run(step, "4.1"):
                return

    # ── 步骤 4.2: 构建单剧本网络图 ──────────────────────────────────────
    if _step_range_includes(step, "4.2", "4.3", "4.4", "4.5"):
        try:
            t0 = time.time()
            logger.info("── 步骤 4.2: 构建单剧本网络图 ──")

            if ctx.ensure_unified() is None:
                return
            graphs = build_all_play_graphs(ctx.unified)
            ctx.graphs = graphs

            logger.info(f"4.2 完成: {len(graphs)} 部剧本 ({time.time()-t0:.1f}s)")

        except Exception as e:
            logger.error(f"步骤 4.2 失败: {e}")
            ctx.errors.append(f"4.2: {e}")
            if _should_run(step, "4.2"):
                return

    # ── 步骤 4.3: 计算单剧本网络指标 ──────────────────────────────────────
    if _step_range_includes(step, "4.3", "4.4", "4.5"):
        try:
            t0 = time.time()
            logger.info("── 步骤 4.3: 计算单剧本网络指标 ──")

            if ctx.ensure_graphs() is None:
                return
            metrics_results = compute_all_play_metrics(ctx.graphs, ctx.unified)
            ctx.metrics_results = metrics_results

            # 保存 4.3 独立指标文件（兼容已有流程）
            if entity_id is not None:
                metrics_path = DATA_DIR / f"4.3_network_metrics_{entity_id}.json.gz"
            else:
                metrics_path = DATA_DIR / "4.3_network_metrics.json.gz"
            metrics_list = []
            for eid in sorted(metrics_results.keys()):
                m = dict(metrics_results[eid])
                m.pop("node_metrics", None)  # 独立文件不含节点级指标详情
                metrics_list.append(m)
            with gzip.open(metrics_path, "wt", encoding="utf-8") as f:
                json.dump(metrics_list, f, ensure_ascii=False, indent=2)
            logger.info(f"4.3 完成 ({time.time()-t0:.1f}s), 已保存到 {metrics_path.name}")

        except Exception as e:
            logger.error(f"步骤 4.3 失败: {e}")
            ctx.errors.append(f"4.3: {e}")
            if _should_run(step, "4.3"):
                return

    # ── 步骤 4.4: 导出单剧本网络数据 ──────────────────────────────────────
    if _step_range_includes(step, "4.4", "4.5"):
        try:
            t0 = time.time()
            logger.info("── 步骤 4.4: 导出单剧本网络数据 ──")

            # 断点续传：检查已有输出
            existing_plays = None
            if not force and FILE_PLAY_NETWORKS.exists():
                existing_plays = _load_existing_play_networks()

            if ctx.ensure_metrics() is None:
                return

            if existing_plays and not force:
                # 合并：已有数据 + 新构建数据
                # 仅补充缺失的剧本
                missing_eids = set(ctx.graphs.keys()) - set(existing_plays.keys())
                if missing_eids:
                    logger.info(f"断点续传: 已有 {len(existing_plays)} 部，补充 {len(missing_eids)} 部")
                    # 仅对缺失剧本构建并导出
                    export_play_networks(ctx.graphs, ctx.unified, ctx.metrics_results)
                else:
                    logger.info(f"断点续传: 单剧本网络已完整 ({len(existing_plays)} 部)，跳过 4.4")
            else:
                export_play_networks(ctx.graphs, ctx.unified, ctx.metrics_results)

            logger.info(f"4.4 完成 ({time.time()-t0:.1f}s)")

        except Exception as e:
            logger.error(f"步骤 4.4 失败: {e}")
            ctx.errors.append(f"4.4: {e}")
            if _should_run(step, "4.4"):
                return

    # ── 步骤 4.5: 构建全局网络并导出 ──────────────────────────────────────
    if _step_range_includes(step, "4.5"):
        try:
            t0 = time.time()
            logger.info("── 步骤 4.5: 构建全局网络并导出 ──")

            # 断点续传：检查已有输出
            skip_45 = False
            if not force and FILE_GLOBAL_NETWORK.exists() and FILE_NETWORK_METRICS.exists():
                existing_global = _load_existing_global_network()
                if existing_global and isinstance(existing_global, dict):
                    meta = existing_global.get("_metadata", {})
                    total_plays_meta = meta.get("total_plays", 0)
                    if ctx.ensure_unified() and total_plays_meta == len(ctx.unified):
                        logger.info(f"断点续传: 全局网络已存在且完整 ({total_plays_meta} 部剧本)，跳过 4.5")
                        skip_45 = True
                    else:
                        logger.info("断点续传: 全局网络数据不完整，重新构建")

            if not skip_45:
                _do_step_45(ctx)

            logger.info(f"4.5 完成 ({time.time()-t0:.1f}s)")

        except Exception as e:
            logger.error(f"步骤 4.5 失败: {e}")
            ctx.errors.append(f"4.5: {e}")
            if _should_run(step, "4.5"):
                return

    # ── 流程结束 ──────────────────────────────────────────────────────
    elapsed = time.time() - pipeline_start
    logger.info(f"构建流程结束 (总耗时 {elapsed:.1f}s)")

    if ctx.errors:
        logger.warning(f"有 {len(ctx.errors)} 个错误:")
        for err in ctx.errors:
            logger.warning(f"  - {err}")


def _do_step_45(ctx: BuildContext):
    """执行步骤 4.5 的实际逻辑。"""
    if ctx.ensure_graphs() is None:
        return

    # 构建全局网络
    G_global = build_global_graph(ctx.graphs, ctx.unified)

    # 计算全局网络指标
    logger.info("计算全局网络指标...")
    global_metrics = compute_play_metrics(G_global)
    global_metrics["multi_play_nodes"] = sum(
        1 for n, d in G_global.nodes(data=True) if d.get("play_count", 0) > 1
    )
    global_metrics["multi_play_edges"] = sum(
        1 for u, v, d in G_global.edges(data=True) if d.get("play_count", 0) > 1
    )

    # 按剧目类型构建子图并计算指标
    type_subgraphs = build_type_subgraphs(ctx.graphs, ctx.unified)
    type_metrics = {}
    for pt, G_type in sorted(type_subgraphs.items()):
        type_metrics[pt] = compute_play_metrics(G_type)
        type_metrics[pt]["剧目类型"] = pt

    # 导出
    export_global_network(G_global, ctx.unified, global_metrics, type_subgraphs, type_metrics)



def cmd_stats(args):
    """打印已构建数据的统计摘要"""
    verbose = getattr(args, "verbose", False)
    _setup_logging(verbose)

    # 检查 4.1 输出
    unified_path = DATA_DIR / "4.1_unified_data.json.gz"
    # 同时检查 entity_id 专属文件
    entity_specific_files = sorted(DATA_DIR.glob("4.1_unified_data_*.json.gz"))
    if unified_path.exists():
        logger.info("加载 4.1 整合数据...")
        data = _load_json(unified_path)
        print(f"  剧本数: {len(data)}")
        total_sem = sum(len(p.get("语义关系边列表", [])) for p in data)
        total_cooc = sum(len(p.get("共现边列表", [])) for p in data)
        print(f"  语义关系边: {total_sem}")
        print(f"  共现边: {total_cooc}")
    elif entity_specific_files:
        print(f"  (仅有 {len(entity_specific_files)} 个 entity_id 专属数据文件)")
    else:
        print("4.1 整合数据尚未生成，请先运行: python build_networks.py build --step 4.1")

    # 检查 4.2/4.4 输出（单剧本网络）
    if FILE_PLAY_NETWORKS.exists():
        print("\n加载单剧本网络数据...")
        data = _load_json(FILE_PLAY_NETWORKS)
        # 新格式含 _metadata + plays
        if isinstance(data, dict) and "plays" in data:
            meta = data.get("_metadata", {})
            plays = data["plays"]
            print(f"  导出时间: {meta.get('export_time', '?')}")
            print(f"  剧本数: {len(plays)}")
            print(f"  总节点: {meta.get('total_nodes', '?')}")
            print(f"  总边数: {meta.get('total_edges', '?')}")
            if plays:
                densities = [p["metrics"]["density"] for p in plays if "metrics" in p]
                if densities:
                    print(f"  密度: min={min(densities):.4f}, max={max(densities):.4f}, "
                          f"mean={sum(densities)/len(densities):.4f}")
                # source_tag 分布
                source_dist = Counter()
                rel_dist = Counter()
                for p in plays:
                    for e in p.get("edges", []):
                        source_dist[e.get("source_tag", "?")] += 1
                        rel_dist[e.get("relation_type", "?")] += 1
                print(f"  边来源分布: {dict(source_dist)}")
                print(f"  关系类型分布: {dict(rel_dist)}")
        elif isinstance(data, list):
            # 旧格式兼容
            print(f"  剧本数: {len(data)} (旧格式)")
            total_nodes = sum(len(p.get("nodes", [])) for p in data)
            total_edges = sum(len(p.get("edges", [])) for p in data)
            print(f"  总节点数: {total_nodes}")
            print(f"  总边数: {total_edges}")
    else:
        print("\n单剧本网络数据尚未导出")

    # 检查 4.3 独立指标
    metrics_43_path = DATA_DIR / "4.3_network_metrics.json.gz"
    entity_metric_files = sorted(DATA_DIR.glob("4.3_network_metrics_*.json.gz"))
    if metrics_43_path.exists():
        size_kb = metrics_43_path.stat().st_size / 1024
        print(f"\n  ✓ 4.3 指标: {metrics_43_path.name} ({size_kb:.1f} KB)")
    elif entity_metric_files:
        print(f"\n  ✓ 4.3 指标: {len(entity_metric_files)} 个 entity_id 专属文件")
    else:
        print(f"\n  ✗ 4.3 指标: 未生成")

    # 检查后续步骤输出
    for fpath, label in [
        (FILE_GLOBAL_NETWORK, "全局网络"),
        (FILE_NETWORK_METRICS, "网络指标"),
    ]:
        if fpath.exists():
            size_mb = fpath.stat().st_size / (1024 * 1024)
            print(f"  ✓ {label}: {fpath.name} ({size_mb:.1f} MB)")
        else:
            print(f"  ✗ {label}: 未生成")

    # 详细展示全局网络数据
    if FILE_GLOBAL_NETWORK.exists():
        print("\n加载全局网络数据...")
        gdata = _load_json(FILE_GLOBAL_NETWORK)
        if isinstance(gdata, dict) and "nodes" in gdata:
            meta = gdata.get("_metadata", {})
            print(f"  导出时间: {meta.get('export_time', '?')}")
            print(f"  节点数: {meta.get('total_nodes', '?')}")
            print(f"  边数: {meta.get('total_edges', '?')}")
            print(f"  跨剧角色: {meta.get('multi_play_nodes', '?')}")
            print(f"  跨剧边: {meta.get('multi_play_edges', '?')}")

    # 详细展示网络指标
    if FILE_NETWORK_METRICS.exists():
        print("\n加载网络指标数据...")
        mdata = _load_json(FILE_NETWORK_METRICS)
        if isinstance(mdata, dict):
            gm = mdata.get("global", {})
            print(f"  全局: nodes={gm.get('node_count', '?')}, "
                  f"edges={gm.get('edge_count', '?')}, "
                  f"density={gm.get('density', '?')}, "
                  f"avg_clustering={gm.get('avg_clustering', '?')}")
            by_type = mdata.get("by_type", {})
            if by_type:
                print(f"  按类型指标:")
                for pt, tm in sorted(by_type.items()):
                    print(f"    {pt}: nodes={tm.get('node_count', '?')}, "
                          f"edges={tm.get('edge_count', '?')}, "
                          f"density={tm.get('density', '?')}")

    # 输出文件总览
    print("\n" + "-" * 50)
    print("输出文件总览:")
    output_files = [
        ("4.1_unified_data.json.gz", "4.1 整合数据"),
        ("4.1_unified_data_*.json.gz", "4.1 整合数据 (entity_id 专属)"),
        ("4.3_network_metrics.json.gz", "4.3 网络指标"),
        ("4.3_network_metrics_*.json.gz", "4.3 网络指标 (entity_id 专属)"),
        (FILE_PLAY_NETWORKS.name, "单剧本网络"),
        (FILE_GLOBAL_NETWORK.name, "全局网络"),
        (FILE_NETWORK_METRICS.name, "网络指标汇总"),
    ]
    for fname, label in output_files:
        # 通配符模式匹配
        if "*" in fname:
            matches = sorted(DATA_DIR.glob(fname))
            if matches:
                total_size = sum(p.stat().st_size for p in matches)
                size_str = f"{total_size/(1024*1024):.1f} MB" if total_size > 1024*1024 else f"{total_size/1024:.1f} KB"
                print(f"  ✓ {label}: {len(matches)} 个文件 ({size_str})")
            continue
        fpath = DATA_DIR / fname
        if fpath.exists():
            size = fpath.stat().st_size
            if size > 1024 * 1024:
                size_str = f"{size/(1024*1024):.1f} MB"
            else:
                size_str = f"{size/1024:.1f} KB"
            print(f"  ✓ {label}: {fname} ({size_str})")
        else:
            print(f"  ✗ {label}: {fname} 未生成")


def main():
    parser = argparse.ArgumentParser(
        description="角色关系网络构建与存储",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python build_networks.py build                    # 执行 4.1~4.5 全流程
  python build_networks.py build --step 4.2        # 单独执行某子步骤
  python build_networks.py build --entity-id 123   # 单剧本构建
  python build_networks.py build --force            # 强制全量重建（禁用断点续传）
  python build_networks.py build --verbose          # 详细日志
  python build_networks.py stats                    # 打印已构建数据的统计摘要
        """,
    )
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # build
    build_parser = subparsers.add_parser("build", help="构建网络")
    build_parser.add_argument("--step", type=str, default=None,
                              help="执行特定子步骤 (4.1~4.5)")
    build_parser.add_argument("--entity-id", type=int, default=None,
                              help="仅构建指定 entity_id 的剧本")
    build_parser.add_argument("--force", action="store_true", default=False,
                              help="强制全量重建，禁用断点续传")
    build_parser.add_argument("--verbose", "-v", action="store_true", default=False,
                              help="详细日志输出")

    # stats
    stats_parser = subparsers.add_parser("stats", help="统计摘要")
    stats_parser.add_argument("--verbose", "-v", action="store_true", default=False,
                              help="详细日志输出")

    args = parser.parse_args()

    if args.command == "build":
        cmd_build(args)
    elif args.command == "stats":
        cmd_stats(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
