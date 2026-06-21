#!/usr/bin/env python3
"""
compute_narrative_baselines.py — 全量叙事分析基线计算

从 starmap-data.json (1,473 剧本) + p2_networks + p3_themes 计算:
  1. 叙事类型分布 (8种类型的占比、平均指标)
  2. 剧目类型 × 叙事类型 交叉分布
  3. 网络结构基线 (density, centralization, clustering 的百分位)
  4. 表演风格基线 (唱念做打比例的分布)
  5. 角色行当分布基线
  6. 主题共现模式
  7. 结构指标百分位对照表 (用于任意剧本的对比分析)

输出: HumanVIZ/src/data/narrative-baselines.json
"""

import json
import math
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Any

PROJECT_ROOT = Path(__file__).parent.parent
STARMAP_FILE = PROJECT_ROOT / "src" / "data" / "starmap-data.json"
NETWORKS_FILE = PROJECT_ROOT / "data" / "processed" / "p2_networks.json"
THEMES_FILE = PROJECT_ROOT / "data" / "processed" / "p3_themes.json"
OUTPUT_FILE = PROJECT_ROOT / "src" / "data" / "narrative-baselines.json"

# ── 叙事类型 → 中文描述 ──
NARR_TYPE_DESC: Dict[str, str] = {
    "线性渐进式": "冲突沿时间线逐步升级，经典三幕结构",
    "悬念突转式": "剧情在关键节点发生意外转折，打破读者预期",
    "双线交织式": "两条叙事线交替推进，最终交汇于高潮",
    "回环照应式": "首尾呼应，中间穿插倒叙或回忆，形成闭环",
    "情感波浪式": "情绪起伏如波浪，大起大落，情感冲击力强",
    "史诗铺陈式": "宏大叙事结构，多场景多角色，篇幅较长",
    "三叠反复式": "同一模式重复三次或多次，层层递进",
    "多幕群像式": "多角色平等出场，无单一主角，展现群像",
}

# ── 剧目类型 → 中文描述 ──
GENRE_DESC: Dict[str, str] = {
    "历史戏": "取材于历史事件或历史人物",
    "家庭戏": "围绕家庭伦理、亲情关系展开",
    "侠义戏": "以侠客、江湖、正义为主题",
    "爱情戏": "以爱情故事为主线",
    "神话戏": "取材于神话传说、民间故事",
    "公案戏": "以案件审理、冤情昭雪为核心",
    "技法展示戏": "以展示表演技艺为主要目的",
}


def load_json(path: Path) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def percentile(values: List[float], p: float) -> float:
    """计算百分位数"""
    if not values:
        return 0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * p / 100
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def compute_narr_type_profiles(scripts: List[dict], config: dict) -> Dict[str, Any]:
    """计算8种叙事类型的详细画像"""
    narr_types = config.get('narrTypes', [])
    narr_colors = config.get('narrColors', {})

    profiles = {}
    for nt in narr_types:
        subset = [s for s in scripts if s.get('narrType') == nt]
        if not subset:
            continue

        n = len(subset)
        profiles[nt] = {
            "count": n,
            "pct": round(100 * n / max(len(scripts), 1), 1),
            "color": narr_colors.get(nt, "#888"),
            "description": NARR_TYPE_DESC.get(nt, ""),
            "avgSceneCount": round(sum(s.get('sceneCount', 0) for s in subset) / n, 1),
            "avgCharCount": round(sum(s.get('charCount', 0) for s in subset) / n, 1),
            "avgDensity": round(sum(s.get('density', 0) for s in subset) / n, 4),
            "avgCentralization": round(sum(s.get('centralization', 0) for s in subset) / n, 4),
            "avgClustering": round(sum(s.get('clustering', 0) for s in subset) / n, 4),
            "avgSingingRatio": round(sum(s.get('singingRatio', 0) for s in subset) / n, 4),
            "avgRecitingRatio": round(sum(s.get('recitingRatio', 0) for s in subset) / n, 4),
            "avgFightingRatio": round(sum(s.get('fightingRatio', 0) for s in subset) / n, 4),
            # 代表性样本 (top 5 by brightness)
            "topExamples": [
                {"title": s.get('titleShort', s.get('title', '')), "brightness": s.get('brightness', 0)}
                for s in sorted(subset, key=lambda x: x.get('brightness', 0), reverse=True)[:5]
            ],
        }
    return profiles


def compute_genre_narr_cross(scripts: List[dict], config: dict) -> Dict[str, Any]:
    """计算剧目类型 × 叙事类型的交叉分布"""
    genre_order = config.get('genreOrder', [])
    narr_types = config.get('narrTypes', [])

    matrix = {}
    for genre in genre_order:
        matrix[genre] = {}
        genre_scripts = [s for s in scripts if s.get('genre') == genre]
        for nt in narr_types:
            count = sum(1 for s in genre_scripts if s.get('narrType') == nt)
            matrix[genre][nt] = count

    # 行列汇总
    row_totals = {g: sum(matrix[g].values()) for g in genre_order}
    col_totals = {nt: sum(matrix[g].get(nt, 0) for g in genre_order) for nt in narr_types}

    return {
        "matrix": matrix,
        "genres": genre_order,
        "narrTypes": narr_types,
        "rowTotals": row_totals,
        "colTotals": col_totals,
    }


def compute_metric_percentiles(scripts: List[dict]) -> Dict[str, Any]:
    """计算关键指标的百分位分布"""
    metrics = ['sceneCount', 'charCount', 'density', 'centralization', 'clustering',
               'singingRatio', 'recitingRatio', 'fightingRatio', 'speakingRatio', 'brightness']

    result = {}
    for m in metrics:
        values = [s.get(m, 0) for s in scripts if s.get(m) is not None]
        if not values:
            continue
        result[m] = {
            "min": round(min(values), 4),
            "p10": round(percentile(values, 10), 4),
            "p25": round(percentile(values, 25), 4),
            "p50": round(percentile(values, 50), 4),
            "p75": round(percentile(values, 75), 4),
            "p90": round(percentile(values, 90), 4),
            "max": round(max(values), 4),
            "mean": round(sum(values) / len(values), 4),
        }
    return result


def compute_role_distribution(scripts: List[dict]) -> Dict[str, Any]:
    """计算角色行当分布"""
    role_agg = defaultdict(float)
    total_scripts = 0
    for s in scripts:
        rd = s.get('roleDist', {})
        if rd:
            total_scripts += 1
            for role, count in rd.items():
                role_agg[role] += count

    total_roles = sum(role_agg.values())
    return {
        "distribution": {k: round(v / max(total_roles, 1), 4) for k, v in role_agg.items()},
        "totalInstances": int(total_roles),
        "avgRolesPerScript": round(total_roles / max(total_scripts, 1), 1),
    }


def compute_theme_patterns(themes_data: dict) -> Dict[str, Any]:
    """计算主题共现模式"""
    theme_taxonomy = themes_data.get('theme_taxonomy', {})
    theme_overall = themes_data.get('theme_overall', {})

    # 主题流行度排序
    theme_ranking = sorted(theme_overall.items(), key=lambda x: x[1].get('script_count', 0), reverse=True)

    return {
        "taxonomy": {k: {"keywords": v.get("keywords", [])[:10], "color": v.get("color", "")}
                     for k, v in theme_taxonomy.items()},
        "ranking": [
            {"name": name, "count": info.get('script_count', 0), "pct": info.get('pct', 0), "avgScore": info.get('avg_score', 0)}
            for name, info in theme_ranking
        ],
    }


def compute_cross_opera_links(starmap: dict) -> Dict[str, Any]:
    """计算跨剧本关联统计"""
    char_links = starmap.get('charLinks', [])
    theme_links = starmap.get('themeLinks', [])

    # 共享角色统计
    shared_char_counts = [c.get('sharedCount', 0) for c in char_links]
    shared_theme_counts = [t.get('count', 0) for t in theme_links]

    return {
        "charLinks": {
            "total": len(char_links),
            "avgSharedChars": round(sum(shared_char_counts) / max(len(shared_char_counts), 1), 1),
            "topPairs": [
                {"source": c['sourceId'], "target": c['targetId'], "shared": c['sharedCount']}
                for c in sorted(char_links, key=lambda x: x.get('sharedCount', 0), reverse=True)[:10]
            ],
        },
        "themeLinks": {
            "total": len(theme_links),
            "avgSharedThemes": round(sum(shared_theme_counts) / max(len(shared_theme_counts), 1), 1),
        },
    }


def classify_opera(script: dict, baseline: dict) -> Dict[str, Any]:
    """
    对任意剧本计算其在全局中的位置（百分位 + 偏离度）
    这是通用分析的核心：任何剧本都能对照全局基线
    """
    pcts = {}
    for metric in ['sceneCount', 'charCount', 'density', 'centralization',
                    'singingRatio', 'fightingRatio', 'brightness']:
        bl = baseline.get(metric, {})
        val = script.get(metric, 0)
        p50 = bl.get('p50', 0)
        p75 = bl.get('p75', 0)
        p25 = bl.get('p25', 0)

        # 估算百分位
        if p75 > p25:
            est_pct = 50 + (val - p50) / (p75 - p25) * 25
        else:
            est_pct = 50
        est_pct = max(1, min(99, est_pct))

        # 偏离程度
        if abs(val - p50) < (p75 - p25) * 0.3:
            level = "typical"
            label = "接近中位数"
        elif val > p75:
            level = "high"
            label = "高于75%剧本"
        elif val < p25:
            level = "low"
            label = "低于75%剧本"
        else:
            level = "moderate"
            label = "中等偏离"

        pcts[metric] = {
            "value": val,
            "percentile": round(est_pct),
            "level": level,
            "label": label,
            "median": p50,
        }

    return pcts


def main():
    print("=" * 60)
    print("  全量叙事分析基线计算")
    print("=" * 60)

    # 加载
    starmap = load_json(STARMAP_FILE)
    scripts = starmap.get('scripts', [])
    config = starmap.get('config', {})
    themes_data = load_json(THEMES_FILE)
    networks_data = load_json(NETWORKS_FILE)

    print(f"\n📂 全量剧本: {len(scripts)} 部")
    print(f"📂 叙事类型: {len(config.get('narrTypes', []))} 种")
    print(f"📂 剧目类型: {len(config.get('genreOrder', []))} 种")

    # ── 1. 叙事类型画像 ──
    print("\n1️⃣  叙事类型画像...")
    narr_profiles = compute_narr_type_profiles(scripts, config)
    for nt, profile in narr_profiles.items():
        print(f"  {nt}: {profile['count']}部 ({profile['pct']}%), "
              f"avg场{profile['avgSceneCount']}, avg角{profile['avgCharCount']}, "
              f"密度{profile['avgDensity']:.3f}")

    # ── 2. 类型交叉分布 ──
    print("\n2️⃣  剧目类型 × 叙事类型交叉...")
    cross = compute_genre_narr_cross(scripts, config)

    # ── 3. 指标百分位 ──
    print("\n3️⃣  指标百分位基线...")
    percentiles = compute_metric_percentiles(scripts)
    for m, p in percentiles.items():
        print(f"  {m}: P50={p['p50']:.3f}, P25-P75=[{p['p25']:.3f}, {p['p75']:.3f}]")

    # ── 4. 角色分布 ──
    print("\n4️⃣  角色行当分布...")
    role_dist = compute_role_distribution(scripts)
    for role, pct in sorted(role_dist['distribution'].items(), key=lambda x: x[1], reverse=True):
        print(f"  {role}: {pct*100:.1f}%")

    # ── 5. 主题模式 ──
    print("\n5️⃣  主题共现模式...")
    theme_patterns = compute_theme_patterns(themes_data)
    for t in theme_patterns['ranking'][:5]:
        print(f"  {t['name']}: {t['count']}部 ({t['pct']}%)")

    # ── 6. 跨剧本关联 ──
    print("\n6️⃣  跨剧本关联...")
    cross_links = compute_cross_opera_links(starmap)

    # ── 7. 通用分类器 ──
    print("\n7️⃣  通用剧本分类器...")
    # 用所有脚本的基线测试一个样本
    sample = scripts[0]
    classification = classify_opera(sample, percentiles)
    print(f"  {sample.get('titleShort', '?')}:")
    for m, c in classification.items():
        print(f"    {m}: {c['value']} → P{c['percentile']} ({c['label']})")

    # ── 组装输出 ──
    output = {
        "meta": {
            "totalScripts": len(scripts),
            "generatedAt": starmap.get('meta', {}).get('generatedAt', ''),
        },
        "narrTypes": {
            "order": config.get('narrTypes', []),
            "colors": config.get('narrColors', {}),
            "descriptions": NARR_TYPE_DESC,
            "profiles": narr_profiles,
        },
        "genres": {
            "order": config.get('genreOrder', []),
            "colors": config.get('genreColors', {}),
            "descriptions": GENRE_DESC,
        },
        "crossDistribution": cross,
        "percentiles": percentiles,
        "roleDistribution": role_dist,
        "themePatterns": theme_patterns,
        "crossOperaLinks": cross_links,
        # 便捷查询: 按ID索引所有剧本
        "scriptIndex": {
            s['id']: {
                "title": s.get('titleShort', s.get('title', '')),
                "genre": s.get('genre', ''),
                "narrType": s.get('narrType', ''),
                "sceneCount": s.get('sceneCount', 0),
                "charCount": s.get('charCount', 0),
                "density": s.get('density', 0),
                "brightness": s.get('brightness', 0),
            }
            for s in scripts
        },
    }

    # 写入
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    import os
    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"\n💾 输出: {OUTPUT_FILE} ({size_kb:.0f} KB)")
    print(f"  包含: 叙事类型画像={len(narr_profiles)}, 百分位指标={len(percentiles)}, "
          f"剧本索引={len(output['scriptIndex'])}")


if __name__ == "__main__":
    main()
