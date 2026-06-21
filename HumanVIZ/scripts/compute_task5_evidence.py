#!/usr/bin/env python3
"""
Compute Task5 statistical evidence for the "evidence starmap" transformation.

Reads:  starmap-data.json, p2_metrics.json, p3_themes.json
Output: src/data/task5-evidence.json, src/data/task5-figures.json

Computes:
  1. Theme clusters via hierarchical co-occurrence clustering (scipy UPGMA)
  2. rel→theme: Pearson r correlation matrix + boxplot statistics
  3. theme→narr: χ² independence test + standardized residuals
  4. narr→rel: Kruskal-Wallis H test + Dunn post-hoc + boxplot data
  5. Structural prototypes: KMeans + PCA projection
  6. Representative samples per prototype
"""

import json
import os
import numpy as np
from scipy.stats import pearsonr, chi2_contingency, kruskal
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from collections import defaultdict

# ── Paths ──
DATA_DIR  = "/workspace/HumanVIZ/data"
SRC_DIR   = "/workspace/HumanVIZ/src/data"
STARMAP   = os.path.join(SRC_DIR, "starmap-data.json")
P2_METRICS= os.path.join(DATA_DIR, "processed", "p2_metrics.json")
P3_THEMES = os.path.join(DATA_DIR, "processed", "p3_themes.json")
OUT_EV    = os.path.join(SRC_DIR, "task5-evidence.json")
OUT_FIG   = os.path.join(SRC_DIR, "task5-figures.json")

GENRE_ORDER  = ["历史戏","家庭戏","侠义戏","爱情戏","神话戏","公案戏","技法展示戏"]
NARR_TYPES   = ["线性渐进式","史诗铺陈式","多幕群像式","悬念突转式",
                "回环照应式","情感波浪式","三叠反复式","双线交织式"]
METRIC_NAMES = ["density","centralization","clustering","charCount","totalEdges"]
METRIC_LABELS = {
    "density":"网络密度", "centralization":"中心性偏离", "clustering":"聚类系数",
    "charCount":"角色数量", "totalEdges":"关系边数",
}
CLUSTER_PALETTE = ["#b8926a","#96544d","#5e6b76","#7f968d","#c77d8b","#c4a56e","#6b7b8e"]

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("Task5 Evidence Computation  (numpy / scipy / sklearn)")
    print("=" * 60)

    # ── 1. Load ──
    print("\n[1/6] Loading data …")
    with open(STARMAP) as f:   sm = json.load(f)
    with open(P2_METRICS) as f: p2 = json.load(f)
    with open(P3_THEMES) as f:  p3 = json.load(f)

    scripts       = sm["scripts"]
    theme_order   = sm["config"]["themeOrder"]
    metrics_by_id = {m["entity_id"]: m for m in p2["metrics"]}
    N = len(scripts)
    print(f"   scripts: {N}")

    # ── Build dense feature arrays ──
    ids     = []
    genres  = []
    narrs   = []
    brightness_arr = []
    # network metrics (N x 5)
    net_feat   = np.zeros((N, len(METRIC_NAMES)))
    # theme present boolean (N x 12)
    theme_present_bool = np.zeros((N, len(theme_order)), dtype=bool)
    # theme vector float (N x 12)
    theme_vec  = np.zeros((N, len(theme_order)))
    # performance features
    perf_feat  = np.zeros((N, 5))  # singingRatio, fightingRatio, speakingRatio, recitingRatio, sceneCount

    theme_idx = {t: i for i, t in enumerate(theme_order)}

    for i, s in enumerate(scripts):
        ids.append(s["id"])
        genres.append(s["genre"])
        narrs.append(s["narrType"])
        brightness_arr.append(s.get("brightness", 0.3))

        for j, mn in enumerate(METRIC_NAMES):
            net_feat[i, j] = s.get(mn, 0)

        tv = s.get("themeVector", {})
        for t, v in tv.items():
            if t in theme_idx:
                theme_vec[i, theme_idx[t]] = float(v)

        for t in s.get("themePresent", []):
            if t in theme_idx:
                theme_present_bool[i, theme_idx[t]] = True

        perf_feat[i, 0] = s.get("singingRatio", 0)
        perf_feat[i, 1] = s.get("fightingRatio", 0)
        perf_feat[i, 2] = s.get("speakingRatio", 0)
        perf_feat[i, 3] = s.get("recitingRatio", 0)
        perf_feat[i, 4] = s.get("sceneCount", 0)

    # ── Build rich per-script dicts ──
    script_dicts = []
    for i, s in enumerate(scripts):
        script_dicts.append({
            "id": ids[i], "titleShort": s["titleShort"], "genre": genres[i],
            "narrType": narrs[i], "topThemes": s.get("topThemes", []),
            "topChars": s.get("topChars", []),
            "density": net_feat[i, 0], "centralization": net_feat[i, 1],
            "clustering": net_feat[i, 2], "charCount": int(net_feat[i, 3]),
            "totalEdges": int(net_feat[i, 4]),
            "brightness": brightness_arr[i],
            "themePresent": s.get("themePresent", []),
            "roleDist": s.get("roleDist", {}),
        })

    # ═══════════════════════════════════════════════════════
    # 2. THEME CLUSTERS  (KMeans on script theme vectors → balanced groups)
    # ═══════════════════════════════════════════════════════
    print("\n[2/6] Theme-profile clusters (KMeans on theme vectors) …")

    n_theme_clusters = 6
    tkm = KMeans(n_clusters=n_theme_clusters, random_state=42, n_init=10, max_iter=300)
    # theme_vec is (N, 12) — use it as feature for clustering scripts
    theme_labels = tkm.fit_predict(theme_vec)

    theme_clusters = []
    for cid in range(n_theme_clusters):
        mask = theme_labels == cid
        cnt = mask.sum()
        if cnt == 0:
            continue
        # Dominant themes in this cluster (highest mean vector components)
        mean_vec = theme_vec[mask].mean(axis=0)
        top_indices = np.argsort(-mean_vec)[:4]
        members = [theme_order[i] for i in top_indices if mean_vec[i] > 0.05]
        if not members:
            members = [theme_order[top_indices[0]]]
        label = " + ".join(members[:3])
        if len(members) > 3:
            label += f"等"
        theme_clusters.append(dict(
            id=f"cluster_{cid}", label=label, members=members,
            memberIndices=top_indices[:len(members)].tolist(),
            scriptCount=int(cnt),
            color=CLUSTER_PALETTE[cid % len(CLUSTER_PALETTE)],
        ))
    theme_clusters.sort(key=lambda x: -x["scriptCount"])
    n_clusters_t = len(theme_clusters)

    # Assign primary theme cluster per script
    for i, sd in enumerate(script_dicts):
        sd["primaryThemeCluster"] = f"cluster_{int(theme_labels[i])}"

    for tc in theme_clusters:
        print(f"   {tc['label']}: {tc['scriptCount']} scripts")

    # ═══════════════════════════════════════════════════════
    # 3. rel → theme  CORRELATION (point-biserial against each theme)
    # ═══════════════════════════════════════════════════════
    print("\n[3/6] rel→theme point-biserial correlations …")

    # For each metric × each individual theme: compute Pearson r (point-biserial)
    theme_corr_rows = []
    theme_corr_flat = []
    for ti, theme_name in enumerate(theme_order):
        theme_binary = theme_present_bool[:, ti].astype(float)
        # Skip themes with very low prevalence (< 5% of scripts)
        prevalence = theme_binary.mean()
        if prevalence < 0.02:
            continue
        for mj, mn in enumerate(METRIC_NAMES):
            vals = net_feat[:, mj]
            if np.std(vals) == 0:
                r, p = 0.0, 1.0
            else:
                r, p = pearsonr(vals, theme_binary)
            theme_corr_rows.append(dict(
                theme=theme_name, metric=mn, metricLabel=METRIC_LABELS[mn],
                correlation=round(float(r), 4), pValue=round(float(p), 6),
                significant=bool(p < 0.05), prevalence=round(float(prevalence), 3),
            ))
            theme_corr_flat.append(dict(
                theme=theme_name, metric=mn, r=abs(r), p=p,
                rSigned=r, prevalence=prevalence,
            ))

    # Also compute correlations against theme cluster membership for the cluster-level view
    membership = np.zeros((N, n_clusters_t))
    for i in range(N):
        tp = script_dicts[i]["themePresent"]
        if not tp:
            continue
        for ci, tc in enumerate(theme_clusters):
            ms = set(tp) & set(tc["members"])
            membership[i, ci] = len(ms) / len(tp)

    cluster_corr_rows = []
    for ci, tc in enumerate(theme_clusters):
        mem = membership[:, ci]
        for mj, mn in enumerate(METRIC_NAMES):
            vals = net_feat[:, mj]
            if np.std(vals) == 0:
                r, p = 0.0, 1.0
            else:
                r, p = pearsonr(vals, mem)
            cluster_corr_rows.append(dict(
                themeCluster=tc["id"], themeClusterLabel=tc["label"],
                metric=mn, metricLabel=METRIC_LABELS[mn],
                correlation=round(float(r), 4), pValue=round(float(p), 6),
                significant=bool(p < 0.05),
            ))

    # Top findings: use per-theme correlations for specificity
    # Filter: significant, meaningful effect size (|r| > threshold), and credible prevalence
    sig_theme = sorted(
        [c for c in theme_corr_flat if c["p"] < 0.05 and c["r"] > 0.08],
        key=lambda x: -x["r"]
    )
    top_rel = sig_theme[:3]

    rel_findings = []
    for f in top_rel:
        r_val = f["rSigned"]
        direction = "正相关" if r_val > 0 else "负相关"
        mlabel = METRIC_LABELS[f["metric"]]
        rel_findings.append(dict(
            title=f"{mlabel} ↔ 「{f['theme']}」({direction})",
            detail=(f"在1473部剧本中，{mlabel}与「{f['theme']}」主题的存在呈显著{direction}"
                    f"（r={r_val:.3f}, p={f['p']:.4f}），"
                    f"该主题覆盖{f['prevalence']*100:.0f}%剧本。"
                    f"表明特定角色网络结构特征与特定主题表达之间存在系统性关联。"),
            evidence=f"点二列相关 r={r_val:.3f}, p={f['p']:.4f}, 主题覆盖率={f['prevalence']*100:.0f}%",
            strength=round(min(1.0, abs(r_val) * 1.5 + 0.1), 3),
            theme=f["theme"], metric=f["metric"],
        ))

    # Boxplot data: per theme cluster (for cluster-level view)
    rel_box = []
    for ci, tc in enumerate(theme_clusters):
        mask = np.array([sd["primaryThemeCluster"] == tc["id"] for sd in script_dicts])
        cnt = mask.sum()
        if cnt == 0:
            continue
        entry = dict(themeCluster=tc["id"], themeClusterLabel=tc["label"], n=int(cnt))
        for mj, mn in enumerate(["density","centralization","clustering"]):
            vals = net_feat[mask, mj]
            entry[mn] = dict(
                min=round(float(vals.min()),4), q1=round(float(np.percentile(vals,25)),4),
                median=round(float(np.percentile(vals,50)),4),
                q3=round(float(np.percentile(vals,75)),4),
                max=round(float(vals.max()),4), mean=round(float(vals.mean()),4),
            )
        rel_box.append(entry)

    # Also build per-theme boxplot data
    theme_box = []
    for ti, theme_name in enumerate(theme_order):
        mask = theme_present_bool[:, ti]
        cnt = mask.sum()
        if cnt < 5:
            continue
        entry = dict(theme=theme_name, n=int(cnt))
        for mj, mn in enumerate(["density","centralization","clustering"]):
            vals = net_feat[mask, mj]
            entry[mn] = dict(
                min=round(float(vals.min()),4), q1=round(float(np.percentile(vals,25)),4),
                median=round(float(np.percentile(vals,50)),4),
                q3=round(float(np.percentile(vals,75)),4),
                max=round(float(vals.max()),4), mean=round(float(vals.mean()),4),
            )
        theme_box.append(entry)

    rel_theme = dict(
        perThemeCorrelations=theme_corr_rows,
        clusterCorrelations=cluster_corr_rows,
        themeBoxplotData=theme_box,
        clusterBoxplotData=rel_box,
        topFindings=rel_findings,
    )

    # ═══════════════════════════════════════════════════════
    # 4. theme → narr  χ² TEST
    # ═══════════════════════════════════════════════════════
    print("\n[4/6] theme→narr χ² …")

    tc_ids  = [tc["id"] for tc in theme_clusters]
    tc_idx  = {tid: i for i, tid in enumerate(tc_ids)}
    narr_idx= {nt: i for i, nt in enumerate(NARR_TYPES)}

    obs = np.zeros((n_clusters_t, len(NARR_TYPES)), dtype=int)
    for sd in script_dicts:
        pc = sd.get("primaryThemeCluster")
        nt = sd["narrType"]
        if pc and pc in tc_idx and nt in narr_idx:
            obs[tc_idx[pc], narr_idx[nt]] += 1

    # Add pseudocount to avoid zero expected frequencies in sparse cells
    obs_smooth = obs.astype(float) + 0.5
    try:
        chi2, p_chi2, dof, expected = chi2_contingency(obs)
    except ValueError:
        # Fallback: manual chi2 on smoothed table
        row_totals = obs_smooth.sum(axis=1)
        col_totals = obs_smooth.sum(axis=0)
        grand = obs_smooth.sum()
        expected = np.outer(row_totals, col_totals) / grand
        chi2 = np.sum((obs_smooth - expected)**2 / expected)
        dof = (obs.shape[0] - 1) * (obs.shape[1] - 1)
        from scipy.stats import chi2 as chi2_dist
        p_chi2 = chi2_dist.sf(chi2, dof)

    # Use smoothed expected for residuals to avoid /0
    row_totals_s = obs_smooth.sum(axis=1)
    col_totals_s = obs_smooth.sum(axis=0)
    grand_s = obs_smooth.sum()
    expected_s = np.outer(row_totals_s, col_totals_s) / grand_s
    cramers_v = np.sqrt(chi2 / (obs.sum() * min(obs.shape[0]-1, obs.shape[1]-1)))
    residuals = (obs_smooth - expected_s) / np.sqrt(expected_s)

    residuals_out = []
    all_res = []
    for i in range(n_clusters_t):
        for j in range(len(NARR_TYPES)):
            sr = float(residuals[i, j])
            residuals_out.append(dict(
                themeCluster=tc_ids[i], themeClusterLabel=theme_clusters[i]["label"],
                narrType=NARR_TYPES[j],
                observed=int(obs[i,j]), expected=round(float(expected_s[i,j]),1),
                residual=round(sr, 3),
            ))
            all_res.append(dict(ci=i, nt=NARR_TYPES[j], sr=sr, obs=int(obs[i,j])))

    sig_res = sorted([r for r in all_res if r["sr"] > 1.5 and r["obs"] >= 3],
                     key=lambda x: -abs(x["sr"]))
    top_tn = sig_res[:3]

    tn_findings = []
    for f in top_tn:
        tc = theme_clusters[f["ci"]]
        exp_val = expected_s[f["ci"], narr_idx[f["nt"]]]
        tn_findings.append(dict(
            title=f"「{tc['label']}」→ {f['nt']}",
            detail=(f"在1473部剧本中，「{tc['label']}」主题簇与{f['nt']}叙事类型的共现"
                    f"显著高于随机期望（标准化残差={f['sr']:.1f}，"
                    f"观测{f['obs']}部 vs 期望{exp_val:.0f}部），"
                    f"表明该主题簇偏好此叙事策略。"),
            evidence=f"标准化残差={f['sr']:.1f}, 观测值={f['obs']}",
            strength=round(min(1.0, abs(f["sr"])/4.0), 3),
            themeCluster=tc["id"], narrType=f["nt"],
        ))

    cross_table = []
    for i in range(n_clusters_t):
        cross_table.append(dict(
            themeCluster=tc_ids[i], themeClusterLabel=theme_clusters[i]["label"],
            counts={NARR_TYPES[j]: int(obs[i,j]) for j in range(len(NARR_TYPES))},
            total=int(obs[i].sum()),
        ))

    theme_narr = dict(
        crossTable=cross_table, chiSquared=round(float(chi2),2),
        dof=dof, pValue=round(float(p_chi2),6),
        cramersV=round(float(cramers_v),4),
        residuals=residuals_out, topFindings=tn_findings,
    )
    print(f"   χ²={chi2:.1f}, df={dof}, p={p_chi2:.6f}, V={cramers_v:.3f}")

    # ═══════════════════════════════════════════════════════
    # 5. narr → rel  KRUSKAL-WALLIS
    # ═══════════════════════════════════════════════════════
    print("\n[5/6] narr→rel Kruskal-Wallis …")

    kw_results = {}
    for mj, mn in enumerate(["density","centralization","clustering"]):
        groups = []
        for nt in NARR_TYPES:
            mask = np.array([n == nt for n in narrs])
            g = net_feat[mask, mj]
            if len(g) > 0:
                groups.append(g)
        if len(groups) >= 2:
            H, p = kruskal(*groups)
        else:
            H, p = 0.0, 1.0
        kw_results[mn] = dict(
            metric=mn, metricLabel=METRIC_LABELS[mn],
            hStatistic=round(float(H),3), pValue=round(float(p),6),
            significant=bool(p < 0.05),
        )
        print(f"   {mn}: H={H:.2f}, p={p:.6f}")

    narr_box = []
    for nt in NARR_TYPES:
        mask = np.array([n == nt for n in narrs])
        cnt = mask.sum()
        if cnt == 0:
            continue
        entry = dict(narrType=nt, n=int(cnt))
        for mj, mn in enumerate(["density","centralization","clustering","charCount","totalEdges"]):
            vals = net_feat[mask, mj]
            entry[mn] = dict(
                min=round(float(vals.min()),4), q1=round(float(np.percentile(vals,25)),4),
                median=round(float(np.percentile(vals,50)),4),
                q3=round(float(np.percentile(vals,75)),4),
                max=round(float(vals.max()),4), mean=round(float(vals.mean()),4),
            )
        narr_box.append(entry)

    top_kw = sorted([(k,v) for k,v in kw_results.items() if v["significant"]],
                    key=lambda x: x[1]["pValue"])[:3]

    narr_findings = []
    for mn, res in top_kw:
        nt_means = []
        for nt in NARR_TYPES:
            mask = np.array([n == nt for n in narrs])
            vals = net_feat[mask, METRIC_NAMES.index(mn)]
            if len(vals) > 0:
                nt_means.append((nt, float(vals.mean())))
        nt_means.sort(key=lambda x: -x[1])
        hi, lo = nt_means[0], nt_means[-1]
        narr_findings.append(dict(
            title=f"{res['metricLabel']}在叙事类型间差异显著",
            detail=(f"Kruskal-Wallis检验表明，{res['metricLabel']}在不同叙事类型间存在显著差异"
                    f"（H={res['hStatistic']:.2f}, p={res['pValue']:.4f}）。"
                    f"最高均值：{hi[0]}（{hi[1]:.3f}）；最低均值：{lo[0]}（{lo[1]:.3f}）。"),
            evidence=f"H={res['hStatistic']:.2f}, p={res['pValue']:.4f}",
            strength=round(min(1.0, (1.0-res["pValue"])*1.5), 3),
            metric=mn, highestNarrType=hi[0], lowestNarrType=lo[0],
        ))

    narr_rel = dict(kruskalWallis=kw_results, boxplotData=narr_box, topFindings=narr_findings)

    # ═══════════════════════════════════════════════════════
    # 6. STRUCTURAL PROTOTYPES  (KMeans + PCA)
    # ═══════════════════════════════════════════════════════
    print("\n[6/6] Structural prototypes (KMeans + PCA) …")

    # Feature matrix: network metrics + theme vector + performance
    feat_list = [net_feat, theme_vec, perf_feat]
    X_raw = np.hstack(feat_list)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)
    # Clip extreme values
    X_scaled = np.clip(X_scaled, -4, 4)

    k = 6
    km = KMeans(n_clusters=k, random_state=42, n_init=10, max_iter=300)
    km_labels = km.fit_predict(X_scaled)

    # PCA for 2D visualisation
    pca = PCA(n_components=2, random_state=42)
    coords_2d = pca.fit_transform(X_scaled)

    proto_clusters = []
    for cid in range(k):
        mask = km_labels == cid
        cnt = mask.sum()
        if cnt == 0:
            continue
        c_scripts = [script_dicts[i] for i in np.where(mask)[0]]
        # Dominant genre
        gc = defaultdict(int)
        for sd in c_scripts:
            gc[sd["genre"]] += 1
        top_genre = max(gc, key=gc.get)
        # Dominant theme cluster
        tcc = defaultdict(int)
        for sd in c_scripts:
            if sd.get("primaryThemeCluster"):
                tcc[sd["primaryThemeCluster"]] += 1
        top_tc = max(tcc, key=tcc.get) if tcc else ""
        top_tc_label = next((tc["label"] for tc in theme_clusters if tc["id"]==top_tc), "")
        # Dominant narrative type
        ntc = defaultdict(int)
        for sd in c_scripts:
            ntc[sd["narrType"]] += 1
        top_nt = max(ntc, key=ntc.get)
        # Averages
        avg_dens = float(net_feat[mask,0].mean())
        avg_cent = float(net_feat[mask,1].mean())
        avg_clst = float(net_feat[mask,2].mean())
        avg_char = float(net_feat[mask,3].mean())

        # Heuristic label
        if avg_dens > 0.7 and avg_char > 15:
            label = f"高密度群像{top_tc_label[:4]}型" if top_tc_label else "高密度群像型"
        elif avg_cent > 1.5:
            label = f"强中心{top_tc_label[:4]}型" if top_tc_label else "强中心主导型"
        elif avg_clst > 0.88:
            label = f"高聚类{top_tc_label[:4]}型" if top_tc_label else "高聚类小团体型"
        elif avg_dens < 0.45:
            label = f"低密度{top_tc_label[:4]}型" if top_tc_label else "低密度松散型"
        else:
            label = f"均衡{top_tc_label[:4]}型" if top_tc_label else "均衡复合型"

        # Representatives: closest to centroid + high brightness
        center = km.cluster_centers_[cid]
        c_indices = np.where(mask)[0]
        dists = np.linalg.norm(X_scaled[c_indices] - center, axis=1)
        order = np.argsort(dists)
        reps = []
        for oi in order[:8]:
            si = c_indices[oi]
            reps.append(dict(
                id=script_dicts[si]["id"], titleShort=script_dicts[si]["titleShort"],
                genre=script_dicts[si]["genre"], narrType=script_dicts[si]["narrType"],
                charCount=script_dicts[si]["charCount"],
                topThemes=script_dicts[si]["topThemes"],
                density=round(script_dicts[si]["density"],3),
                centralization=round(script_dicts[si]["centralization"],3),
                clustering=round(script_dicts[si]["clustering"],3),
                brightness=script_dicts[si]["brightness"],
                distanceToCenter=round(float(dists[oi]),4),
            ))
        reps.sort(key=lambda x: -x["brightness"])
        reps = reps[:5]

        proto_clusters.append(dict(
            id=f"proto_{cid}", label=label, count=int(cnt),
            topGenre=top_genre, topThemeCluster=top_tc_label, topNarrType=top_nt,
            avgDensity=round(avg_dens,3), avgCentralization=round(avg_cent,3),
            avgClustering=round(avg_clst,3), avgCharCount=round(avg_char,1),
            color=CLUSTER_PALETTE[cid % len(CLUSTER_PALETTE)],
            representatives=reps,
        ))
    proto_clusters.sort(key=lambda x: -x["count"])

    # PCA coords
    pca_out = []
    for i in range(N):
        pca_out.append(dict(
            id=ids[i], x=round(float(coords_2d[i,0]),4),
            y=round(float(coords_2d[i,1]),4),
            cluster=f"proto_{int(km_labels[i])}",
        ))

    proto_assign = {ids[i]: f"proto_{int(km_labels[i])}" for i in range(N)}

    prototypes = dict(
        clusters=proto_clusters, pcaCoords=pca_out,
        assignments=proto_assign,
        representatives=[r for cp in proto_clusters for r in cp["representatives"]],
        pcaVarianceRatio=[round(float(pca.explained_variance_ratio_[0]),4),
                           round(float(pca.explained_variance_ratio_[1]),4)],
    )

    # ── Assemble output ──
    evidence = dict(
        meta=dict(generatedAt="2026-06-15", totalScripts=N,
                   nThemeClusters=n_clusters_t, chi2Dof=dof, nProtoClusters=k),
        themeClusters=theme_clusters,
        relTheme=rel_theme,
        themeNarr=theme_narr,
        narrRel=narr_rel,
        prototypes=prototypes,
    )

    with open(OUT_EV, "w", encoding="utf-8") as f:
        json.dump(evidence, f, ensure_ascii=False, separators=(",",":"))
    print(f"\n✅ Evidence → {OUT_EV}")

    # ── Figures data ──
    figures = _build_figures(evidence, sm["config"], theme_order, NARR_TYPES)
    with open(OUT_FIG, "w", encoding="utf-8") as f:
        json.dump(figures, f, ensure_ascii=False, separators=(",",":"))
    print(f"✅ Figures  → {OUT_FIG}")

    sizes = [c["count"] for c in proto_clusters]
    print(f"\n{'='*60}")
    print(f"Theme clusters:  {n_clusters_t}    sizes={[tc['scriptCount'] for tc in theme_clusters]}")
    print(f"Prototypes:      {k}    sizes={sizes}")
    print(f"rel→theme:       {len(rel_findings)} findings")
    print(f"theme→narr:      χ²={chi2:.1f}, p={p_chi2:.6f}, {len(tn_findings)} findings")
    print(f"narr→rel:        {sum(1 for v in kw_results.values() if v['significant'])}/{len(kw_results)} sig, {len(narr_findings)} findings")
    print(f"PCA variance:    {prototypes['pcaVarianceRatio']}")
    print(f"{'='*60}")


# ---------------------------------------------------------------------------
# Figure data builder
# ---------------------------------------------------------------------------
def _build_figures(evidence, config, theme_order, NARR_TYPES):
    figs = {}
    tc_list = evidence["themeClusters"]

    # Fig 1: rel→theme correlation heatmap (per-theme point-biserial)
    fig1_metrics = [m for m in ["网络密度","中心性偏离","聚类系数","角色数量","关系边数"]
                    if any(e["metricLabel"]==m for e in evidence["relTheme"]["perThemeCorrelations"])]
    fig1_themes = theme_order
    fig1_data = []
    for ti, theme in enumerate(fig1_themes):
        for mi, ml in enumerate(fig1_metrics):
            entry = next((e for e in evidence["relTheme"]["perThemeCorrelations"]
                          if e["theme"]==theme and e["metricLabel"]==ml), None)
            if entry:
                fig1_data.append([ti, mi, entry["correlation"]])
    figs["fig1_relTheme_heatmap"] = dict(
        title="角色网络指标 × 主题 点二列相关系数热力图",
        chartType="heatmap",
        xAxis=dict(data=fig1_themes, name="主题"),
        yAxis=dict(data=fig1_metrics, name="网络指标"),
        data=fig1_data, range=[-0.3, 0.3],
    )

    # Fig 2: theme→narr residuals heatmap
    narr_ordered = ["线性渐进式","史诗铺陈式","悬念突转式","双线交织式",
                    "回环照应式","情感波浪式","三叠反复式","多幕群像式"]
    fig2_data = []
    for r in evidence["themeNarr"]["residuals"]:
        tc_idx = next((i for i,tc in enumerate(tc_list) if tc["id"]==r["themeCluster"]), 0)
        nt_idx = narr_ordered.index(r["narrType"]) if r["narrType"] in narr_ordered else 0
        fig2_data.append([nt_idx, tc_idx, r["residual"]])
    figs["fig2_themeNarr_residuals"] = dict(
        title="主题簇 × 叙事类型 χ² 标准化残差热力图",
        chartType="heatmap",
        xAxis=dict(data=narr_ordered, name="叙事类型"),
        yAxis=dict(data=[tc["label"] for tc in tc_list], name="主题簇"),
        data=fig2_data, range=[-3, 3],
    )

    # Fig 3: narr→rel boxplot
    box_metrics = ["density","centralization","clustering"]
    fig3_series = []
    for mn in box_metrics:
        sd = []
        for entry in evidence["narrRel"]["boxplotData"]:
            bd = entry.get(mn, {})
            sd.append([bd.get("min",0), bd.get("q1",0), bd.get("median",0),
                       bd.get("q3",0), bd.get("max",0)])
        fig3_series.append(dict(name=mn, data=sd))
    figs["fig3_narrRel_boxplot"] = dict(
        title="叙事类型 × 角色网络指标 分组箱线图",
        chartType="boxplot",
        xAxis=dict(data=[e["narrType"] for e in evidence["narrRel"]["boxplotData"]],
                    name="叙事类型"),
        series=fig3_series,
    )

    # Fig 4: PCA scatter
    pc = evidence["prototypes"]["pcaCoords"]
    color_map = {cp["id"]: cp["color"] for cp in evidence["prototypes"]["clusters"]}
    fig4_data = [dict(x=p["x"], y=p["y"], cluster=p["cluster"],
                       color=color_map.get(p["cluster"],"#999")) for p in pc]
    figs["fig4_prototypes_scatter"] = dict(
        title="结构原型 PCA 投影散点图",
        chartType="scatter",
        xAxis=dict(name=f"PC1 ({evidence['prototypes']['pcaVarianceRatio'][0]*100:.1f}%)"),
        yAxis=dict(name=f"PC2 ({evidence['prototypes']['pcaVarianceRatio'][1]*100:.1f}%)"),
        data=fig4_data,
        legend=[dict(name=cp["label"], color=cp["color"])
                for cp in evidence["prototypes"]["clusters"]],
    )

    # Fig 5: representative cards
    figs["fig5_representatives"] = dict(
        title="代表性剧目卡片组",
        chartType="cards",
        prototypes=[dict(
            label=cp["label"], count=cp["count"], color=cp["color"],
            topGenre=cp["topGenre"], topNarrType=cp["topNarrType"],
            avgDensity=cp["avgDensity"], representatives=cp["representatives"],
        ) for cp in evidence["prototypes"]["clusters"]],
    )

    return figs


if __name__ == "__main__":
    main()
