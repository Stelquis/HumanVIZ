#!/usr/bin/env python3
"""
narrative_deep_analysis.py — 叙事结构与人物关系专项深度分析

补全审计发现的 5 个缺口:
  1. 预计算叙事阶段 (pre-computed narrative phases)
  2. 语义化关系类型 (semantic relations: 敌对/同盟/从属...)
  3. 改进中心性指标 (betweenness centrality + eigenvector)
  4. 角色行当补全 (role type completion)
  5. 跨剧本角色追踪 (cross-opera character appearances)
  6. 叙事结构指纹 (narrative structure fingerprints)
  7. 增强情绪转折检测 (enhanced emotion transition detection)

输入: 增强后的 opera-samples.json
输出: 进一步增强的 opera-samples.json (含 narratology 专项数据)
"""

import json
import re
import os
import sys
import math
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Any, Optional, Set, Tuple

PROJECT_ROOT = Path(__file__).parent.parent
SAMPLES_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.json"
BACKUP_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.backup3.json"

# ── 角色行当补全字典 ──────────────────────────────────────────
# 从《戏考》原文的主要角色标注 + 已知京剧知识
ROLE_COMPLETION: Dict[str, str] = {
    # 生行
    "诸葛亮": "老生", "刘备": "老生", "黄忠": "老生", "严颜": "老生",
    "萧恩": "老生", "杨延昭": "老生", "程婴": "老生", "赵盾": "老生",
    "伍子胥": "老生", "薛平贵": "老生", "祢衡": "老生", "陈宫": "老生",
    "刘世昌": "老生", "田伦": "老生", "赵德芳": "老生", "王有道": "老生",
    "宋江": "老生", "杨继业": "老生", "寇准": "老生", "赵高": "老生",
    "周瑜": "小生", "杨宗保": "小生", "赵武": "小生", "吕布": "小生",
    "赵云": "武生", "黄天霸": "武生", "高宠": "武生",
    "关羽": "红生",
    "郭先生": "老生", "大教师": "丑", "家院": "末",
    # 旦行
    "王宝钏": "青衣", "窦娥": "青衣", "赵艳容": "青衣", "蔡母": "老旦",
    "杨贵妃": "花旦", "周腊梅": "花旦", "柴夫人": "青衣",
    "佘太君": "老旦", "庄姬": "青衣", "卜凤": "青衣",
    # 净行
    "曹操": "净", "司马懿": "净", "窦尔敦": "净", "屠岸贾": "净",
    "张飞": "净", "孟良": "净", "焦赞": "净", "夏侯渊": "净",
    "张郃": "净", "司马师": "净", "司马昭": "净",
    "魏绛": "净", "潘洪": "净", "李逵": "净",
    # 丑行
    "老军甲": "丑", "老军乙": "丑", "二老军": "丑",
    "报子": "丑", "禁婆": "丑", "张才": "丑", "王四": "丑",
    "书吏": "丑", "四徒弟": "丑",
    # 其他常见角色
    "童儿": "生", "旗牌": "丑", "朱光祖": "丑", "计全": "生",
    "关泰": "净", "何路通": "丑", "贺天龙": "净", "贺天虎": "净",
    "贺天豹": "净", "贺天彪": "净", "大老爷": "净",
    "公孙杵臼": "老生", "韩厥": "武生", "提弥明": "武生",
    "灵辄": "武生", "鉏麑": "武生", "晋灵公": "净",
    "赵朔": "小生", "赵穿": "生", "魏颗": "生",
    "鲁肃": "老生", "蒋干": "丑", "黄盖": "净", "甘宁": "净",
    "阚泽": "老生", "庞统": "净", "徐庶": "老生",
}

# ── 关系类型推断规则 ──────────────────────────────────────────
# 基于行当组合 + 场景冲突/情感 推断语义化关系类型
RELATION_RULES = {
    # (来源行当, 目标行当) → 候选关系类型
    ("生", "旦"): ["夫妻", "恋人", "母子", "君臣"],
    ("旦", "生"): ["夫妻", "恋人", "母子", "君臣"],
    ("净", "生"): ["敌对", "君臣", "对手"],
    ("生", "净"): ["敌对", "君臣", "对手"],
    ("净", "净"): ["敌对", "同盟", "对手"],
    ("丑", "生"): ["从属", "主仆", "师生"],
    ("生", "丑"): ["从属", "主仆", "师生"],
    ("丑", "净"): ["从属", "敌对"],
    ("净", "丑"): ["从属", "敌对"],
    ("旦", "净"): ["敌对", "君臣"],
    ("净", "旦"): ["敌对", "君臣"],
    ("生", "生"): ["同盟", "师生", "父子", "兄弟"],
    ("旦", "旦"): ["姐妹", "主仆", "婆媳"],
    ("丑", "丑"): ["同伴", "从属"],
}


def load_data() -> Dict[str, dict]:
    with open(SAMPLES_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if isinstance(v, dict)}


# ═══════════════════════════════════════════════════════════════
# 1. 预计算叙事阶段
# ═══════════════════════════════════════════════════════════════

def compute_narrative_phases(opera: dict) -> List[Dict[str, Any]]:
    """
    预计算自适应叙事阶段，将结果写入 JSON 而非依赖前端运行时计算。

    使用冲突弧 + 情感弧 + 角色密度的局部极值检测断点。

    Returns:
        [{label, startScene, endScene, dominantFeature, avgConflict, avgSentiment, avgDensity}, ...]
    """
    scenes = opera.get('scenes', [])
    n = len(scenes)
    if n < 3:
        return [{"label": "全剧", "startScene": 0, "endScene": n - 1,
                 "dominantFeature": "conflict", "avgConflict": 0.5, "avgSentiment": 0.0,
                 "avgDensity": len(scenes[0].get('characters', [])) if scenes else 0}]

    # 提取弧线
    conflict = [s.get('ratings', {}).get('conflict', 0) for s in scenes]
    sentiment = [s.get('ratings', {}).get('sentiment', 0) for s in scenes]
    density = [len(s.get('characters', [])) for s in scenes]

    # 找局部极值
    def find_peaks(arr, is_max=True):
        peaks = []
        for i in range(1, len(arr) - 1):
            if is_max and arr[i] > arr[i-1] and arr[i] >= arr[i+1]:
                peaks.append(i)
            elif not is_max and arr[i] < arr[i-1] and arr[i] <= arr[i+1]:
                peaks.append(i)
        return peaks

    # 找变化率拐点
    def find_slope_changes(arr):
        slopes = [abs(arr[i] - arr[i-1]) for i in range(1, len(arr))]
        changes = []
        for i in range(1, len(slopes) - 1):
            if slopes[i] > slopes[i-1] and slopes[i] >= slopes[i+1]:
                changes.append(i + 1)
        return changes

    conflict_peaks = find_peaks(conflict, True)
    sentiment_changes = find_slope_changes(sentiment)
    density_changes = find_slope_changes(density)

    # 融合断点
    scores = defaultdict(int)
    for bp in conflict_peaks:
        scores[bp] += 3
    for bp in sentiment_changes:
        scores[bp] += 2
    for bp in density_changes:
        scores[bp] += 1

    # 合并相邻断点
    merged = []
    for idx in sorted(scores.keys()):
        if merged and idx - merged[-1] <= 1:
            if scores[idx] > scores.get(merged[-1], 0):
                merged[-1] = idx
        else:
            merged.append(idx)

    # 取 top 3 作为阶段边界
    top_bps = sorted(merged, key=lambda x: scores[x], reverse=True)[:3]
    boundaries = sorted(set([0] + top_bps + [n - 1]))
    boundaries = [b for b in boundaries if 0 <= b < n]

    labels = ["开端", "发展", "高潮", "结局", "尾声"]
    phases = []
    for i in range(len(boundaries) - 1):
        start, end = boundaries[i], boundaries[i+1]
        seg_conflict = conflict[start:end+1]
        seg_sentiment = sentiment[start:end+1]
        seg_density = density[start:end+1]

        avg_c = sum(seg_conflict) / len(seg_conflict)
        avg_s = sum(seg_sentiment) / len(seg_sentiment)
        avg_d = sum(seg_density) / len(seg_density)

        dominant = "conflict" if avg_c > 0.4 else ("sentiment" if abs(avg_s) > 0.3 else "density")

        phases.append({
            "label": labels[i] if i < len(labels) else f"阶段{i+1}",
            "startScene": start,
            "endScene": end,
            "dominantFeature": dominant,
            "avgConflict": round(avg_c, 3),
            "avgSentiment": round(avg_s, 3),
            "avgDensity": round(avg_d, 1),
        })

    return phases


# ═══════════════════════════════════════════════════════════════
# 2. 语义化关系类型推断
# ═══════════════════════════════════════════════════════════════

def infer_semantic_relations(opera: dict) -> List[Dict[str, Any]]:
    """
    将原始"共现"关系升级为语义化关系类型。

    推断依据:
      1. 行当组合规则
      2. 场景冲突/情感水平
      3. 角色在剧中地位 (degree centrality)
      4. 原文对白中的关键词

    Returns:
        [{source, target, relation_type, confidence, evidence_words, weight}, ...]
    """
    network = opera.get('character_network', {})
    edges = network.get('edges', [])
    nodes = {n['name']: n for n in network.get('nodes', [])}
    chars = {c.get('character', ''): c for c in opera.get('characters', [])}

    # 构建场景级互动信息
    scene_interactions = defaultdict(lambda: {"conflict_avg": 0, "sentiment_avg": 0, "count": 0})
    for s in opera.get('scenes', []):
        names = [c.get('name', '') for c in s.get('characters', [])]
        conflict = s.get('ratings', {}).get('conflict', 0)
        sentiment = s.get('ratings', {}).get('sentiment', 0)
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                key = tuple(sorted([names[i], names[j]]))
                scene_interactions[key]["conflict_avg"] += conflict
                scene_interactions[key]["sentiment_avg"] += sentiment
                scene_interactions[key]["count"] += 1

    semantic_edges = []
    for edge in edges:
        source = edge.get('source', '')
        target = edge.get('target', '')

        # 获取行当
        s_role = _get_role_group(source, chars, nodes)
        t_role = _get_role_group(target, chars, nodes)

        # 获取互动特征
        key = tuple(sorted([source, target]))
        interactions = scene_interactions.get(key, {"conflict_avg": 0, "sentiment_avg": 0, "count": 1})
        avg_conflict = interactions["conflict_avg"] / max(interactions["count"], 1)
        avg_sentiment = interactions["sentiment_avg"] / max(interactions["count"], 1)

        # 规则推断
        relation_type, confidence = _infer_type(s_role, t_role, avg_conflict, avg_sentiment)

        # 关键词验证
        evidence_words = _find_relation_keywords(opera, source, target)

        semantic_edges.append({
            "source": source,
            "target": target,
            "co_scenes": edge.get('scenes', 1),
            "weight": edge.get('weight', 1),
            "relation_type": relation_type,
            "type_confidence": round(confidence, 3),
            "avg_conflict": round(avg_conflict, 3),
            "avg_sentiment": round(avg_sentiment, 3),
            "evidence_words": evidence_words,
        })

    return semantic_edges


def _get_role_group(name: str, chars: dict, nodes: dict) -> str:
    """获取角色行当分组 (生/旦/净/丑/其他)"""
    char = chars.get(name, {})
    group = char.get('group', '')
    if group and group != '其他':
        return group

    # 尝试从 nodes 中推断
    node = nodes.get(name, {})
    # 无法推断
    return "其他"


def _infer_type(s_role: str, t_role: str, conflict: float, sentiment: float) -> Tuple[str, float]:
    """根据行当组合和情感特征推断关系类型"""
    key = (s_role, t_role)
    candidates = RELATION_RULES.get(key, ["共现"])

    # 高冲突 → 敌对/对手
    if conflict > 0.5:
        if "敌对" in candidates:
            return "敌对", 0.7 + conflict * 0.3
        elif "对手" in candidates:
            return "对手", 0.6 + conflict * 0.3

    # 正面情感 → 同盟/夫妻/父子
    if sentiment > 0.3:
        for rel in ["同盟", "夫妻", "父子", "兄弟", "恋人"]:
            if rel in candidates:
                return rel, 0.6 + sentiment * 0.3

    # 负面情感 → 敌对
    if sentiment < -0.3:
        if "敌对" in candidates:
            return "敌对", 0.6 + abs(sentiment) * 0.3

    # 默认：取第一个候选
    return candidates[0], 0.5


def _find_relation_keywords(opera: dict, source: str, target: str) -> List[str]:
    """在原文对白中搜索两个角色同场时的关系关键词"""
    keywords_map = {
        "敌对": ["杀", "斩", "擒", "灭", "攻", "战", "仇", "恨", "死敌"],
        "同盟": ["共", "同", "助", "帮", "合", "盟", "联手", "协力"],
        "夫妻": ["夫人", "妻", "夫", "相公", "娘子"],
        "父子": ["父", "子", "儿", "爹"],
        "君臣": ["陛下", "丞相", "主公", "臣", "君", "万岁"],
        "师生": ["师", "徒", "先生", "学生"],
        "从属": ["报", "遵命", "吩咐", "听令", "得令"],
        "对手": ["比", "斗", "对", "胜", "败", "输赢"],
    }

    found = []
    for s in opera.get('scenes', []):
        text = s.get('text', '')
        if not text:
            continue
        names_in_scene = [c.get('name', '') for c in s.get('characters', [])]
        if source in names_in_scene and target in names_in_scene:
            for rel_type, kws in keywords_map.items():
                for kw in kws:
                    if kw in text and kw not in found:
                        found.append(kw)
    return found[:5]


# ═══════════════════════════════════════════════════════════════
# 3. 改进中心性指标
# ═══════════════════════════════════════════════════════════════

def compute_improved_centrality(network: dict) -> Dict[str, Dict[str, float]]:
    """
    计算改进的中心性指标:
      - degree_centrality (度中心性)
      - betweenness_centrality (介数中心性 — 桥梁角色)
      - eigenvector_centrality (特征向量中心性 — 主角识别)
    """
    nodes_list = network.get('nodes', [])
    edges_list = network.get('edges', [])

    if not nodes_list:
        return {}

    n = len(nodes_list)
    node_names = [nd['name'] for nd in nodes_list]
    name_to_idx = {name: i for i, name in enumerate(node_names)}

    # 构建邻接矩阵
    adj = [[0.0] * n for _ in range(n)]
    for edge in edges_list:
        s = name_to_idx.get(edge.get('source', ''))
        t = name_to_idx.get(edge.get('target', ''))
        if s is not None and t is not None and s != t:
            w = edge.get('scenes', edge.get('weight', 1))
            adj[s][t] += w
            adj[t][s] += w

    # Degree centrality (already have this, recalculate for consistency)
    degree = [sum(1 for w in row if w > 0) for row in adj]

    # Betweenness centrality (Brandes algorithm — simplified for small graphs)
    betweenness = _compute_betweenness(adj, n)

    # Eigenvector centrality (power iteration)
    eigenvector = _compute_eigenvector(adj, n)

    result = {}
    for i, name in enumerate(node_names):
        result[name] = {
            "degree": degree[i],
            "betweenness": round(betweenness[i], 4),
            "eigenvector": round(eigenvector[i], 4),
        }
    return result


def _compute_betweenness(adj: List[List[float]], n: int) -> List[float]:
    """Brandes 介数中心性算法"""
    betweenness = [0.0] * n

    for s in range(n):
        # BFS from source s
        stack = []
        pred = [[] for _ in range(n)]
        sigma = [0.0] * n
        sigma[s] = 1.0
        dist = [-1] * n
        dist[s] = 0
        queue = [s]

        for v in queue:
            stack.append(v)
            for w in range(n):
                if adj[v][w] > 0:
                    if dist[w] < 0:
                        dist[w] = dist[v] + 1
                        queue.append(w)
                    if dist[w] == dist[v] + 1:
                        sigma[w] += sigma[v]
                        pred[w].append(v)

        delta = [0.0] * n
        while stack:
            w = stack.pop()
            for v in pred[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
            if w != s:
                betweenness[w] += delta[w]

    # Normalize
    norm = (n - 1) * (n - 2) if n > 2 else 1
    return [b / norm for b in betweenness]


def _compute_eigenvector(adj: List[List[float]], n: int, iterations: int = 100) -> List[float]:
    """Power iteration 特征向量中心性"""
    import random
    vec = [1.0 / n] * n

    for _ in range(iterations):
        new_vec = [0.0] * n
        for i in range(n):
            for j in range(n):
                if adj[i][j] > 0:
                    new_vec[i] += adj[i][j] * vec[j]

        norm = math.sqrt(sum(v * v for v in new_vec))
        if norm < 1e-10:
            break
        vec = [v / norm for v in new_vec]

    return vec


# ═══════════════════════════════════════════════════════════════
# 4. 角色行当补全
# ═══════════════════════════════════════════════════════════════

def complete_role_types(opera: dict) -> int:
    """补全缺失的角色行当信息"""
    completed = 0
    for char in opera.get('characters', []):
        name = char.get('character', '')
        if not char.get('role_type') and name in ROLE_COMPLETION:
            char['role_type'] = ROLE_COMPLETION[name]
            # 同时更新 group
            role = char['role_type']
            if role in {'老生', '小生', '武生', '红生', '生'}:
                char['group'] = '生'
            elif role in {'青衣', '花旦', '武旦', '老旦', '旦', '刀马旦', '彩旦'}:
                char['group'] = '旦'
            elif role in {'正净', '副净', '武净', '净', '铜锤花脸', '架子花脸'}:
                char['group'] = '净'
            elif role in {'文丑', '武丑', '丑', '外'}:
                char['group'] = '丑'
            completed += 1
    return completed


# ═══════════════════════════════════════════════════════════════
# 5. 跨剧本角色追踪
# ═══════════════════════════════════════════════════════════════

def build_cross_opera_tracking(operas: Dict[str, dict]) -> Dict[str, Any]:
    """
    追踪同一角色在不同剧本中的表现。

    Returns:
        {角色名: {appearances: [{opera, scene_count, role_type, group, network_role}], total_operas}}
    """
    tracking: Dict[str, dict] = defaultdict(lambda: {"appearances": [], "total_operas": 0})

    for key, opera in operas.items():
        title = opera.get('title', key)
        network = opera.get('character_network', {})
        centrality = opera.get('centrality_metrics', {})

        for char in opera.get('characters', []):
            name = char.get('character', '')
            if not name:
                continue

            cent = centrality.get(name, {})
            tracking[name]["appearances"].append({
                "opera": title,
                "opera_key": key,
                "role_type": char.get('role_type', ''),
                "group": char.get('group', ''),
                "network_degree": char.get('network_degree', 0),
                "eigenvector_centrality": cent.get('eigenvector', 0),
                "betweenness_centrality": cent.get('betweenness', 0),
            })
            tracking[name]["total_operas"] += 1

    # 只保留跨剧本出现的角色
    multi_opera = {k: v for k, v in tracking.items() if v["total_operas"] >= 2}
    return multi_opera


# ═══════════════════════════════════════════════════════════════
# 6. 叙事结构指纹
# ═══════════════════════════════════════════════════════════════

def compute_structure_fingerprint(opera: dict) -> Dict[str, Any]:
    """计算叙事结构指纹，用于跨剧本比较"""
    scenes = opera.get('scenes', [])
    n = len(scenes)

    if n == 0:
        return {}

    conflict_arc = [s.get('ratings', {}).get('conflict', 0) for s in scenes]
    sentiment_arc = [s.get('ratings', {}).get('sentiment', 0) for s in scenes]
    scene_lengths = [s.get('numLines', 0) for s in scenes]
    density = [len(s.get('characters', [])) for s in scenes]

    # 弧线特征
    conflict_trend = _linear_trend(conflict_arc)
    sentiment_trend = _linear_trend(sentiment_arc)

    # 结构类型判定
    if n <= 3:
        structure_type = "短剧型"
    elif conflict_trend > 0.02 and n >= 8:
        structure_type = "渐进高潮型"
    elif max(conflict_arc) > 0.7 and conflict_arc.index(max(conflict_arc)) < n * 0.4:
        structure_type = "早期高潮型"
    elif any(c > 0.6 for c in conflict_arc) and conflict_trend < 0:
        structure_type = "跌宕起伏型"
    else:
        structure_type = "平稳铺陈型"

    return {
        "sceneCount": n,
        "charCount": len(opera.get('characters', [])),
        "totalLines": sum(scene_lengths),
        "avgCharsPerScene": round(sum(density) / n, 1),
        "conflictMax": round(max(conflict_arc), 3),
        "conflictMin": round(min(conflict_arc), 3),
        "conflictRange": round(max(conflict_arc) - min(conflict_arc), 3),
        "conflictTrend": round(conflict_trend, 4),
        "sentimentRange": round(max(sentiment_arc) - min(sentiment_arc), 3),
        "sentimentTrend": round(sentiment_trend, 4),
        "structureType": structure_type,
        "sceneLengthCV": round(_cv(scene_lengths), 3),
        "peakPosition": round(conflict_arc.index(max(conflict_arc)) / max(n - 1, 1), 3) if n > 1 else 0,
        "themes": [t['name'] for t in opera.get('theme', {}).get('primary_themes', [])],
    }


def _linear_trend(arr: List[float]) -> float:
    """简单线性趋势 (斜率)"""
    n = len(arr)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(arr) / n
    num = sum((i - x_mean) * (arr[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den != 0 else 0.0


def _cv(arr: List[float]) -> float:
    """变异系数"""
    if not arr:
        return 0.0
    mean = sum(arr) / len(arr)
    if mean == 0:
        return 0.0
    variance = sum((x - mean) ** 2 for x in arr) / len(arr)
    return math.sqrt(variance) / mean


# ═══════════════════════════════════════════════════════════════
# 7. 增强情绪转折检测
# ═══════════════════════════════════════════════════════════════

def enhance_emotion_transitions(opera: dict) -> int:
    """提升情绪转折检测率 — 使用场景间情感变化"""
    scenes = opera.get('scenes', [])
    enhanced = 0

    for i, scene in enumerate(scenes):
        chars = scene.get('characters', [])
        if not chars:
            continue

        prev_scene = scenes[i-1] if i > 0 else None
        next_scene = scenes[i+1] if i < len(scenes) - 1 else None

        for char in chars:
            name = char.get('name', '')
            enhanced_emotion = char.get('enhanced_emotion', {})

            # 已有转折检测 → 跳过
            if enhanced_emotion.get('transition_detected'):
                continue

            # 跨场景检测：同一角色在相邻场景中情感变化 > 0.4
            prev_rating = _get_char_rating(prev_scene, name) if prev_scene else None
            next_rating = _get_char_rating(next_scene, name) if next_scene else None
            current_rating = char.get('rating', 0)

            transition = False
            if prev_rating is not None and abs(current_rating - prev_rating) > 0.4:
                transition = True
            if next_rating is not None and abs(next_rating - current_rating) > 0.4:
                transition = True

            if transition:
                # 更新 enhanced_emotion
                if not isinstance(enhanced_emotion, dict):
                    enhanced_emotion = {}
                enhanced_emotion['transition_detected'] = True
                enhanced_emotion['transition_detail'] = _describe_transition(
                    prev_rating, current_rating, next_rating
                )
                char['enhanced_emotion'] = enhanced_emotion
                enhanced += 1

    return enhanced


def _get_char_rating(scene: dict, name: str) -> Optional[float]:
    """获取角色在某场景的情感 rating"""
    if not scene:
        return None
    for c in scene.get('characters', []):
        if c.get('name') == name:
            return c.get('rating', 0)
    return None


def _describe_transition(prev: Optional[float], curr: float, next_: Optional[float]) -> str:
    """描述情感转折"""
    parts = []
    if prev is not None:
        delta = curr - prev
        if delta > 0.4:
            parts.append("情绪明显上扬")
        elif delta < -0.4:
            parts.append("情绪明显下沉")
    if next_ is not None:
        delta = next_ - curr
        if delta > 0.4:
            parts.append("即将迎来转机")
        elif delta < -0.4:
            parts.append("即将陷入低谷")

    return "；".join(parts) if parts else "情绪出现波动"


# ═══════════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("  📊 叙事结构与人物关系专项深度分析")
    print("=" * 70)

    operas = load_data()
    print(f"\n📂 加载 {len(operas)} 部剧本")

    total_phases = 0
    total_semantic_edges = 0
    total_roles_completed = 0
    total_transitions_enhanced = 0
    total_centrality_computed = 0

    for key, opera in operas.items():
        title = opera.get('title', key)
        print(f"\n{'─'*50}")
        print(f"  《{title}》")

        # 1. 预计算叙事阶段
        phases = compute_narrative_phases(opera)
        opera['narrative_phases'] = phases
        total_phases += len(phases)
        print(f"    叙事阶段: {len(phases)} 段 — {' → '.join(p['label'] for p in phases)}")

        # 2. 语义化关系
        semantic_edges = infer_semantic_relations(opera)
        opera['semantic_relations'] = semantic_edges
        total_semantic_edges += len(semantic_edges)
        rel_types = Counter(e['relation_type'] for e in semantic_edges)
        top_types = rel_types.most_common(3)
        print(f"    语义关系: {len(semantic_edges)} 条 — {', '.join(f'{t}({c})' for t,c in top_types)}")

        # 3. 改进中心性
        network = opera.get('character_network', {})
        centrality = compute_improved_centrality(network)
        opera['centrality_metrics'] = centrality
        total_centrality_computed += len(centrality)

        # 用 eigenvector 找真正的主角
        if centrality:
            top = sorted(centrality.items(), key=lambda x: x[1]['eigenvector'], reverse=True)[:3]
            top_str = ', '.join(f'{n}({c.get("eigenvector", 0):.3f})' for n, c in top)
            print(f"    改进中心性: eigenvector Top3 — {top_str}")

        # 更新角色 network_degree → 添加完整中心性
        for char in opera.get('characters', []):
            name = char.get('character', '')
            if name in centrality:
                char['centrality'] = centrality[name]

        # 4. 角色行当补全
        completed = complete_role_types(opera)
        total_roles_completed += completed
        if completed:
            print(f"    行当补全: {completed} 个角色")

        # 5. 叙事结构指纹
        fingerprint = compute_structure_fingerprint(opera)
        opera['structure_fingerprint'] = fingerprint
        print(f"    结构指纹: {fingerprint.get('structureType', '?')} | 冲突峰位={fingerprint.get('peakPosition', 0):.2f} | 趋势={fingerprint.get('conflictTrend', 0):.4f}")

        # 6. 增强情绪转折
        enhanced = enhance_emotion_transitions(opera)
        total_transitions_enhanced += enhanced
        if enhanced:
            print(f"    情绪转折增强: {enhanced} 处新检测")

    # ── 跨剧本分析 ──
    print(f"\n{'='*50}")
    print(f"  跨剧本角色追踪")
    cross_tracking = build_cross_opera_tracking(operas)

    # 注入到每部剧本
    for key, opera in operas.items():
        # 只注入该剧本角色参与的跨剧本信息
        opera_chars = {c.get('character', '') for c in opera.get('characters', [])}
        opera['cross_opera_characters'] = {
            name: info for name, info in cross_tracking.items()
            if name in opera_chars
        }

    multi_chars = sorted(cross_tracking.items(), key=lambda x: x[1]['total_operas'], reverse=True)
    print(f"  跨剧本角色: {len(cross_tracking)} 个")
    for name, info in multi_chars[:10]:
        operas_list = [a['opera'] for a in info['appearances']]
        print(f"    {name}: 出现于 {info['total_operas']} 部 — {', '.join(operas_list)}")

    # ── 结构指纹对比 ──
    print(f"\n{'='*50}")
    print(f"  叙事结构指纹对比")
    structures = Counter(o.get('structure_fingerprint', {}).get('structureType', '?') for o in operas.values())
    for st, cnt in structures.most_common():
        examples = [o['title'] for o in operas.values()
                    if o.get('structure_fingerprint', {}).get('structureType') == st]
        print(f"    {st}: {cnt} 部 — {', '.join(examples)}")

    # ── 写入 ──
    import shutil
    shutil.copy2(SAMPLES_FILE, BACKUP_FILE)

    # 重新加载完整数据并更新
    with open(SAMPLES_FILE, 'r', encoding='utf-8') as f:
        full_data = json.load(f)

    for key in operas:
        if key in full_data:
            full_data[key] = operas[key]

    # 添加跨剧本全局数据
    full_data['_cross_opera_tracking'] = dict(cross_tracking)

    with open(SAMPLES_FILE, 'w', encoding='utf-8') as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2)

    # ── 汇总 ──
    print(f"\n{'='*70}")
    print(f"  📊 专项分析完成")
    print(f"{'='*70}")
    print(f"  叙事阶段: {total_phases} 段 (覆盖 {len(operas)} 部)")
    print(f"  语义关系: {total_semantic_edges} 条")
    print(f"  中心性计算: {total_centrality_computed} 个角色")
    print(f"  行当补全: {total_roles_completed} 个")
    print(f"  情绪转折增强: {total_transitions_enhanced} 处")
    print(f"  跨剧本追踪: {len(cross_tracking)} 个角色")
    print(f"  结构指纹: {len(operas)} 部")
    print(f"\n💾 备份: {BACKUP_FILE}")
    print(f"💾 写入: {SAMPLES_FILE}")


if __name__ == "__main__":
    main()
