"""
Phase 2-3: 叙事结构聚类 + 多维度分层抽样 (精简版)
基于 Phase 1 的结构指纹，对所有 1473 本聚类，然后分层选出 40-60 本典型剧本

策略:
  - k=5 层次聚类 (Ward)
  - 按 (genre × cluster) 为主维度，每组合选 1 本典型
  - 来源覆盖作为辅助校验
  - 特殊规则: 无场景标记型至少 3 本, 技法展示戏全部, 昆曲至少 2 本
"""

import json
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_score
from scipy.spatial.distance import cdist
from collections import Counter, defaultdict

INPUT_PATH = "/workspace/HumanVIZ/data/structural_fingerprints.json"
OUTPUT_CLUSTER = "/workspace/HumanVIZ/data/clustering_results.json"
OUTPUT_TYPICAL = "/workspace/HumanVIZ/data/typical_scripts.json"

CLUSTER_FEATURES = [
    'scene_count', 'avg_lines_per_scene', 'scene_lines_cv',
    'singing_ratio', 'reciting_ratio', 'speaking_ratio', 'fighting_ratio',
    'xipi_ratio', 'erhuang_ratio',
    'singing_style_fast', 'singing_style_yaoban', 'singing_style_slow',
    'singing_style_yuanban', 'singing_style_daoban',
    'max_scene_pos', 'line_change_rate', 'first_last_ratio',
    'emotion_density', 'conflict_density',
    'character_count', 'avg_chars_per_scene', 'top3_concentration',
]


def load_data():
    with open(INPUT_PATH, encoding='utf-8') as f:
        return json.load(f)['features']


def prepare_features(scripts):
    X = np.zeros((len(scripts), len(CLUSTER_FEATURES)))
    for i, s in enumerate(scripts):
        for j, feat in enumerate(CLUSTER_FEATURES):
            val = s.get(feat, 0)
            if val is None or np.isnan(val) or np.isinf(val):
                val = 0.0
            X[i, j] = val
    scaler = StandardScaler()
    return scaler.fit_transform(X), scaler


def cluster_k5(scripts, X_scaled):
    """用 k=5 做层次聚类 (k=5 轮廓系数 0.197, 与最佳 k=2 仅差 0.004)"""
    model = AgglomerativeClustering(n_clusters=5, linkage='ward')
    labels = model.fit_predict(X_scaled)
    score = silhouette_score(X_scaled, labels)
    return labels, model, score


def name_clusters(scripts, labels):
    """根据聚类中心特征给每个聚类命名，确保唯一"""
    profiles = {}
    used_names = Counter()

    for c in range(5):
        indices = [i for i, l in enumerate(labels) if l == c]
        members = [scripts[i] for i in indices]
        m = {
            'cluster_id': c, 'size': len(members),
            'scene_count': np.mean([x['scene_count'] for x in members]),
            'singing': np.mean([x['singing_ratio'] for x in members]),
            'fighting': np.mean([x['fighting_ratio'] for x in members]),
            'char_count': np.mean([x['character_count'] for x in members]),
            'conflict': np.mean([x['conflict_density'] for x in members]),
            'has_markers': np.mean([x['has_scene_markers'] for x in members]),
            'emotion': np.mean([x['emotion_density'] for x in members]),
            'xipi': np.mean([x['xipi_ratio'] for x in members]),
        }

        # 命名逻辑 (按优先级)
        if m['has_markers'] < 0.3:
            name = '无场景标记型'
        elif m['fighting'] > 0.015 and m['conflict'] > 0.02:
            name = '文武交替型'
        elif m['singing'] > 0.20:
            name = '唱工密集型'
        elif m['scene_count'] > 12:
            name = '长篇铺陈型'
        elif m['scene_count'] <= 2:
            name = '短小精炼型'
        elif m['xipi'] > 0.10:
            name = '西皮唱工型'
        else:
            name = '渐进推进型'

        # 确保唯一性
        if used_names[name] > 0:
            name = f"{name}-{chr(65 + used_names[name])}"  # A, B, C...
        used_names[name] += 1
        m['name'] = name
        profiles[c] = m
    return profiles


def select_typical(scripts, labels, X_scaled, profiles):
    """
    精简抽样 (目标 ≤10 本):
      - 每个聚类选 1 本离全局质心最近的 (5 本基础)
      - 额外: 每个聚类中离质心最远的有趣边缘样本 (最多 2 本)
      - 确保: 无场景标记型至少 1 本, 昆曲至少 1 本, 技法展示戏至少 1 本
      - 目标: 8-10 本, 覆盖 7 种类型和 5 种结构
    """
    selected_ids = set()

    # Step 1: 每聚类选 1 本最典型的 (最接近该聚类质心)
    print("\n  Step 1: 每聚类选典型...")
    for cl in range(5):
        cl_idxs = [i for i, l in enumerate(labels) if l == cl]
        if not cl_idxs:
            continue
        sub_X = X_scaled[cl_idxs]
        centroid = sub_X.mean(axis=0)
        dists = cdist([centroid], sub_X, metric='euclidean')[0]
        best = cl_idxs[np.argmin(dists)]
        selected_ids.add(best)
        s = scripts[best]
        print(f"    Cluster {cl} [{profiles[cl]['name']}]: "
              f"'{s['title']}' ({s['genre']}, {s['scene_count']}场)")

    # Step 2: 无场景标记型 — 确保至少 1 本
    no_marker = [i for i, s in enumerate(scripts) if not s['has_scene_markers']]
    already_no_marker = selected_ids & set(no_marker)
    if not already_no_marker:
        # 从无标记中选离全局质心最近的
        no_marker_X = X_scaled[no_marker]
        centroid = X_scaled.mean(axis=0)
        dists = cdist([centroid], no_marker_X, metric='euclidean')[0]
        extra = no_marker[np.argmin(dists)]
        selected_ids.add(extra)
        print(f"  Step 2 (无场景标记): +'{scripts[extra]['title']}'")

    # Step 3: 昆曲至少 1 本
    kunqu = [i for i, s in enumerate(scripts) if s['source_category'] == '昆曲剧本选']
    already_kunqu = selected_ids & set(kunqu)
    if not already_kunqu:
        kunqu_X = X_scaled[kunqu]
        centroid = X_scaled.mean(axis=0)
        dists = cdist([centroid], kunqu_X, metric='euclidean')[0]
        extra = kunqu[np.argmin(dists)]
        selected_ids.add(extra)
        print(f"  Step 3 (昆曲): +'{scripts[extra]['title']}'")

    # Step 4: 技法展示戏至少 1 本
    jifa = [i for i, s in enumerate(scripts) if s.get('genre') == '技法展示戏']
    already_jifa = selected_ids & set(jifa)
    if not already_jifa:
        jifa_X = X_scaled[jifa]
        centroid = jifa_X.mean(axis=0)
        dists = cdist([centroid], jifa_X, metric='euclidean')[0]
        extra = jifa[np.argmin(dists)]
        selected_ids.add(extra)
        print(f"  Step 4 (技法展示): +'{scripts[extra]['title']}'")

    # Step 5: 检查缺失的剧目类型，最多补 3 本
    genre_cov = Counter(scripts[i].get('genre', '?') for i in selected_ids)
    missing_genres = [g for g in ['历史戏', '家庭戏', '侠义戏', '爱情戏', '神话戏', '公案戏']
                      if genre_cov.get(g, 0) == 0]
    added = 0
    for g in missing_genres:
        if added >= 3:
            break
        g_idxs = [i for i, s in enumerate(scripts) if s.get('genre') == g and i not in selected_ids]
        if g_idxs:
            g_X = X_scaled[g_idxs]
            centroid = X_scaled.mean(axis=0)
            dists = cdist([centroid], g_X, metric='euclidean')[0]
            extra = g_idxs[np.argmin(dists)]
            selected_ids.add(extra)
            added += 1
            print(f"  Step 5 (补齐{'' if added==1 else ''}): +'{scripts[extra]['title']}' [{g}]")

    # Step 6: 去重
    title_map = {}
    for i in selected_ids:
        t = scripts[i]['title']
        if t not in title_map:
            title_map[t] = i
    selected_ids = set(title_map.values())

    # 统计覆盖
    genre_cov = Counter(scripts[i].get('genre', '?') for i in selected_ids)
    source_cov = Counter(scripts[i].get('source_category', '?') for i in selected_ids)
    cluster_cov = {str(k): v for k, v in Counter(labels[i] for i in selected_ids).items()}

    # --- 构建输出 ---
    selected = []
    for i in sorted(selected_ids):
        s = scripts[i]
        cl = int(labels[i])
        selected.append({
            'index': i,
            'entity_id': s['entity_id'],
            'title': s['title'],
            'source_folder': s['source_folder'],
            'source_name': s['source_name'],
            'source_category': s['source_category'],
            'genre': s['genre'],
            'cluster_id': cl,
            'cluster_name': profiles[cl]['name'],
            'scene_count': s['scene_count'],
            'character_count': s['character_count'],
            'has_scene_markers': s['has_scene_markers'],
            'singing_ratio': s['singing_ratio'],
            'fighting_ratio': s['fighting_ratio'],
        })

    return selected, dict(genre_cov), dict(source_cov), dict(cluster_cov)


def main():
    print("=" * 60)
    print("Phase 2-3: 聚类 + 分层抽样 (k=5)")
    print("=" * 60)

    scripts = load_data()
    print(f"加载 {len(scripts)} 本剧本")

    X_scaled, scaler = prepare_features(scripts)
    print(f"特征: {X_scaled.shape}")

    # k=5 聚类
    labels, model, score = cluster_k5(scripts, X_scaled)
    print(f"k=5 聚类完成, silhouette={score:.4f}")

    # 命名与统计
    profiles = name_clusters(scripts, labels)
    print(f"\n聚类概况:")
    for c_id, p in profiles.items():
        print(f"  Cluster {c_id} [{p['name']}]: {p['size']} 本, "
              f"scenes={p['scene_count']:.1f}, singing={p['singing']:.3f}, "
              f"fighting={p['fighting']:.4f}, markers={p['has_markers']:.1%}")

    # 抽样
    selected, genre_cov, source_cov, cluster_cov = select_typical(
        scripts, labels, X_scaled, profiles)

    print(f"\n===== 选取结果: {len(selected)} 本 =====")
    print(f"剧目类型覆盖: {genre_cov}")
    print(f"来源覆盖: {source_cov}")
    print(f"聚类覆盖: {cluster_cov}")

    print(f"\n===== 典型剧本清单 =====")
    for i, s in enumerate(selected):
        print(f"  {i+1:2d}. [{s['genre']}][{s['cluster_name']}] {s['title']} "
              f"({s['scene_count']}场, {s['character_count']}角色) "
              f"[{s['source_category']}]")

    # 保存聚类结果
    with open(OUTPUT_CLUSTER, 'w', encoding='utf-8') as f:
        json.dump({
            'k': 5, 'silhouette': float(score),
            'cluster_profiles': {str(k): v for k, v in profiles.items()},
            'scripts': [
                {'entity_id': s['entity_id'], 'title': s['title'],
                 'genre': s['genre'], 'cluster_id': int(labels[i]),
                 'cluster_name': profiles[labels[i]]['name']}
                for i, s in enumerate(scripts)
            ],
        }, f, ensure_ascii=False, indent=2)
    print(f"\n聚类结果: {OUTPUT_CLUSTER}")

    # 保存典型剧本列表
    with open(OUTPUT_TYPICAL, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(selected),
            'coverage': {
                'genre': genre_cov, 'source': source_cov, 'cluster': cluster_cov,
            },
            'scripts': selected,
        }, f, ensure_ascii=False, indent=2)
    print(f"典型列表: {OUTPUT_TYPICAL}")


if __name__ == '__main__':
    main()
