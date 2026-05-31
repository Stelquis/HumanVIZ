#!/usr/bin/env python3
"""
Build enriched p3 frontend data from p3_themes.json.
Adds: theme combo patterns, hierarchical clustering, archetypes, PMI scores,
      script-level extraction examples, genre-theme alluvial data.
"""
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P3_THEMES = ROOT / "data" / "p3_themes.json"
OUTPUT = ROOT / "src" / "data" / "p3_frontend_data.json"

THEME_ORDER = [
    "忠义报国", "征战讨伐", "冤案昭雪", "权谋斗争",
    "爱情姻缘", "家庭伦理", "神话灵异", "侠义江湖",
    "智谋韬略", "科举功名", "宫廷朝堂", "生死离别",
]

THEME_COLORS = {
    "忠义报国": "#b8926a",
    "征战讨伐": "#8b5e3c",
    "冤案昭雪": "#6b7b8e",
    "权谋斗争": "#5e3a2e",
    "爱情姻缘": "#c77d8b",
    "家庭伦理": "#96544d",
    "神话灵异": "#7f968d",
    "侠义江湖": "#5e6b76",
    "智谋韬略": "#c4a56e",
    "科举功名": "#d4c4a8",
    "宫廷朝堂": "#8b7355",
    "生死离别": "#4a6b7a",
}

TYPE_COLORS = {
    "历史戏": "#b8926a",
    "家庭戏": "#96544d",
    "侠义戏": "#5e6b76",
    "爱情戏": "#c77d8b",
    "神话戏": "#7f968d",
    "公案戏": "#6b7b8e",
    "技法展示戏": "#c4a56e",
}

TYPE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏"]

with open(P3_THEMES) as f:
    raw = json.load(f)

scripts = raw["scripts"]
N = len(scripts)

# ── 1. Theme overall stats ──────────────────────────────────────────
theme_counts = Counter()
for s in scripts:
    for t, v in s["theme_present"].items():
        if v == 1:
            theme_counts[t] += 1

theme_overall = []
for t in THEME_ORDER:
    theme_overall.append({
        "name": t,
        "count": theme_counts.get(t, 0),
        "pct": round(theme_counts.get(t, 0) / N * 100, 1),
        "color": THEME_COLORS[t],
    })

# ── 2. Type × Theme matrix ──────────────────────────────────────────
type_theme_matrix: dict[str, dict[str, float]] = {}
type_counts = Counter(s["genre"] for s in scripts)

for genre in TYPE_ORDER:
    genre_scripts = [s for s in scripts if s["genre"] == genre]
    gn = len(genre_scripts)
    row = {}
    for t in THEME_ORDER:
        n_present = sum(1 for s in genre_scripts if s["theme_present"].get(t, 0) == 1)
        row[t] = round(n_present / gn, 3) if gn > 0 else 0.0
    type_theme_matrix[genre] = row

# ── 3. Theme co-occurrence (chord edges + PMI) ──────────────────────
cooccur = Counter()
pair_to_scripts = defaultdict(list)  # for PMI
for s in scripts:
    present = [t for t in THEME_ORDER if s["theme_present"].get(t, 0) == 1]
    for i in range(len(present)):
        for j in range(i + 1, len(present)):
            a, b = sorted([present[i], present[j]])
            cooccur[(a, b)] += 1
            pair_to_scripts[(a, b)].append(s["title"])

# PMI calculation
total_pairs = sum(cooccur.values())
pmi_scores = {}
for (a, b), count in cooccur.items():
    p_a = theme_counts[a] / N
    p_b = theme_counts[b] / N
    p_ab = count / N
    pmi = math.log2(p_ab / (p_a * p_b)) if p_ab > 0 else 0
    # Normalized PMI (NPMI): pmi / -log2(p_ab)
    npmi = pmi / (-math.log2(p_ab)) if p_ab > 0 else 0
    pmi_scores[f"{a}||{b}"] = {
        "pair": [a, b],
        "count": count,
        "pmi": round(pmi, 3),
        "npmi": round(npmi, 3),
        "examples": pair_to_scripts[(a, b)][:3],
    }

chord_edges = []
for (a, b), count in cooccur.most_common(50):
    chord_edges.append({
        "source": a, "target": b, "value": count,
    })

# ── 4. Theme combination patterns ────────────────────────────────────
# Exclude scripts with 0 active themes from combo analysis
# (50 scripts have plot summaries that don't match any theme keywords)
combo_counter = Counter()
combo_genre: dict[str, Counter] = defaultdict(Counter)
combo_examples: dict[str, list] = defaultdict(list)
zero_theme_count = 0
zero_theme_examples: list = []

for s in scripts:
    present = sorted([t for t in THEME_ORDER if s["theme_present"].get(t, 0) == 1])
    if not present:
        zero_theme_count += 1
        if len(zero_theme_examples) < 5:
            zero_theme_examples.append({
                "title": s["title"],
                "genre": s["genre"],
                "source": s.get("source_category", ""),
            })
        continue  # Skip zero-theme scripts from combo analysis
    key = " + ".join(present)
    combo_counter[key] += 1
    combo_genre[s["genre"]][key] += 1
    if len(combo_examples[key]) < 2:
        combo_examples[key].append({
            "title": s["title"],
            "genre": s["genre"],
            "source": s.get("source_category", ""),
        })

# Top combos by frequency
top_combos = []
for combo, count in combo_counter.most_common(60):
    themes = combo.split(" + ") if combo != "(none)" else []
    genre_dist = {}
    for genre in TYPE_ORDER:
        genre_dist[genre] = combo_genre[genre].get(combo, 0)
    top_combos.append({
        "combo": combo,
        "themes": themes,
        "count": count,
        "pct": round(count / N * 100, 2),
        "genre_dist": genre_dist,
        "primary_genre": max(genre_dist, key=genre_dist.get),
        "examples": combo_examples.get(combo, [])[:2],
    })

# Genre-specific top combos
genre_top_combos = {}
for genre in TYPE_ORDER:
    gc = combo_genre.get(genre, Counter())
    genre_top_combos[genre] = [
        {"combo": c, "count": n, "pct": round(n / type_counts.get(genre, 1) * 100, 1)}
        for c, n in gc.most_common(8)
    ]

# ── 5. Theme combination archetypes ──────────────────────────────────
# Identify representative thematic patterns based on co-occurrence + genre affinity
archetypes = [
    {
        "id": "court_power",
        "name": "宫廷权谋型",
        "subtitle": "Court & Power Struggle",
        "core_themes": ["宫廷朝堂", "权谋斗争", "智谋韬略"],
        "satellite_themes": ["生死离别", "征战讨伐", "冤案昭雪"],
        "primary_genres": ["历史戏", "公案戏"],
        "color": "#5e3a2e",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("宫廷朝堂") == 1
                     and (s["theme_present"].get("权谋斗争") == 1 or s["theme_present"].get("智谋韬略") == 1)),
        "examples": ["十道本", "宫门带", "狸猫换太子"],
        "description": "以宫廷为背景，围绕权力争夺、政治博弈展开，智谋与斗争交织，常伴有生死危机与冤案昭雪。多见于历史戏和公案戏。",
    },
    {
        "id": "family_life",
        "name": "家庭伦理型",
        "subtitle": "Family & Ethics",
        "core_themes": ["家庭伦理", "生死离别"],
        "satellite_themes": ["科举功名", "爱情姻缘", "宫廷朝堂"],
        "primary_genres": ["家庭戏", "爱情戏"],
        "color": "#96544d",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("家庭伦理") == 1
                     and s["theme_present"].get("生死离别") == 1),
        "examples": ["三娘教子", "钓金龟", "桑园会"],
        "description": "聚焦家庭成员间的伦理关系与悲欢离合，科举功名常为转折点，爱情与亲情交织。家庭戏的主要叙事模式。",
    },
    {
        "id": "battle_wisdom",
        "name": "征战智略型",
        "subtitle": "Warfare & Strategy",
        "core_themes": ["征战讨伐", "智谋韬略"],
        "satellite_themes": ["宫廷朝堂", "忠义报国", "生死离别"],
        "primary_genres": ["历史戏"],
        "color": "#8b5e3c",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("征战讨伐") == 1
                     and s["theme_present"].get("智谋韬略") == 1),
        "examples": ["空城计", "定军山", "赤壁之战"],
        "description": "以战争征伐为主线，突出谋略智慧在军事斗争中的作用。宫廷号令与忠义报国为常见背景动机，多见于历史演义类剧本。",
    },
    {
        "id": "justice_hero",
        "name": "侠义公案型",
        "subtitle": "Chivalry & Justice",
        "core_themes": ["侠义江湖", "冤案昭雪"],
        "satellite_themes": ["宫廷朝堂", "家庭伦理", "生死离别"],
        "primary_genres": ["公案戏", "侠义戏"],
        "color": "#6b7b8e",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("侠义江湖") == 1
                     and s["theme_present"].get("冤案昭雪") == 1),
        "examples": ["八义图", "打严嵩", "四进士"],
        "description": "侠客义士与清官廉吏携手匡扶正义，冤案的昭雪过程是叙事核心。官民互动、善恶对决构成主要冲突。",
    },
    {
        "id": "myth_fantasy",
        "name": "神话灵异型",
        "subtitle": "Mythology & Fantasy",
        "core_themes": ["神话灵异", "宫廷朝堂"],
        "satellite_themes": ["侠义江湖", "征战讨伐", "家庭伦理"],
        "primary_genres": ["神话戏"],
        "color": "#7f968d",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("神话灵异") == 1),
        "examples": ["闹天宫", "白蛇传", "宝莲灯"],
        "description": "以神魔斗法、仙凡恋情为核心，将超自然元素与人间伦理融合。宫廷（天庭）与世俗的双重空间是常见设定。",
    },
    {
        "id": "romance_scholar",
        "name": "才子佳人型",
        "subtitle": "Romance & Scholar",
        "core_themes": ["爱情姻缘", "科举功名"],
        "satellite_themes": ["家庭伦理", "宫廷朝堂", "生死离别"],
        "primary_genres": ["爱情戏", "家庭戏"],
        "color": "#c77d8b",
        "count": sum(1 for s in scripts
                     if s["theme_present"].get("爱情姻缘") == 1
                     and s["theme_present"].get("科举功名") == 1),
        "examples": ["西厢记", "牡丹亭", "凤还巢"],
        "description": "才子科举求名与佳人婚恋的经典双线叙事，爱情与功名互为因果，家庭伦理提供道德框架。",
    },
]

# ── 6. Distinctive & top themes per genre ────────────────────────────
distinctive_themes: dict[str, dict] = {}
for genre in TYPE_ORDER:
    row = type_theme_matrix[genre]
    # top themes by absolute ratio
    top = sorted(row.items(), key=lambda x: -x[1])[:3]
    # distinctive: diff from global mean
    diff_scores = []
    for t in THEME_ORDER:
        global_pct = theme_counts.get(t, 0) / N
        genre_pct = row[t]
        diff = genre_pct - global_pct
        diff_scores.append({"theme": t, "diff": round(diff, 3), "ratio": genre_pct})
    diff_scores.sort(key=lambda x: -x["diff"])
    distinctive_themes[genre] = {
        "top": [{"theme": t, "ratio": round(r, 3)} for t, r in top],
        "distinctive": diff_scores[:3],
    }

# ── 7. Era/era theme evolution ──────────────────────────────────────
source_categories = [
    "民国汇编本", "新中国整理本", "名家演出本",
    "昆曲剧本选", "录音藏本及其他", "现代剧作家本",
]
era_theme: dict[str, dict[str, float]] = {}
for era in source_categories:
    era_scripts = [s for s in scripts if s.get("source_category") == era]
    en = len(era_scripts)
    row = {}
    for t in THEME_ORDER:
        n_present = sum(1 for s in era_scripts if s["theme_present"].get(t, 0) == 1)
        row[t] = round(n_present / en, 3) if en > 0 else 0.0
    era_theme[era] = row

# ── 8. Type diversity ────────────────────────────────────────────────
type_diversity = {}
for genre in TYPE_ORDER:
    genre_scripts = [s for s in scripts if s["genre"] == genre]
    if not genre_scripts:
        continue
    counts = [s.get("active_theme_count", 0) for s in genre_scripts]
    entropies = []
    for s in genre_scripts:
        tv = s.get("theme_norm", {})
        vals = [v for v in tv.values() if v > 0]
        entropy = -sum(v * math.log2(v) for v in vals) if vals else 0
        entropies.append(entropy)
    type_diversity[genre] = {
        "avg_theme_count": round(sum(counts) / len(counts), 1),
        "avg_entropy": round(sum(entropies) / len(entropies), 3),
        "script_count": len(genre_scripts),
    }

# ── 9. Hierarchical clustering of themes (simple approach) ───────────
# Use co-occurrence to compute theme similarity, then cluster
from itertools import combinations

# Build similarity matrix based on co-occurrence overlap
theme_sim: dict[str, dict[str, float]] = {}
for t in THEME_ORDER:
    theme_sim[t] = {}

for a, b in combinations(THEME_ORDER, 2):
    co = cooccur.get((a, b), 0)
    # Jaccard-like: co-occurrence / min(freq_a, freq_b)
    min_freq = min(theme_counts[a], theme_counts[b])
    sim = co / min_freq if min_freq > 0 else 0
    theme_sim[a][b] = round(sim, 3)
    theme_sim[b][a] = round(sim, 3)

# Simple hierarchical clustering using UPGMA
# Build a dendrogram order
clusters = [[t] for t in THEME_ORDER]
cluster_order = list(THEME_ORDER)

while len(clusters) > 1:
    # Find closest pair of clusters
    best_sim = -1
    best_pair = (-1, -1)
    for i in range(len(clusters)):
        for j in range(i + 1, len(clusters)):
            # Average similarity between clusters
            sims = []
            for ta in clusters[i]:
                for tb in clusters[j]:
                    if ta == tb:
                        sims.append(1.0)
                    else:
                        sims.append(theme_sim[ta].get(tb, 0))
            avg_sim = sum(sims) / len(sims)
            if avg_sim > best_sim:
                best_sim = avg_sim
                best_pair = (i, j)
    i, j = best_pair
    clusters[i].extend(clusters[j])
    clusters.pop(j)

# Flatten - the order within each merged cluster
clustered_order = clusters[0]  # This is the dendrogram leaf order

# ── 10. Chi-square stats ────────────────────────────────────────────
chi_square = {}
for t in THEME_ORDER:
    # Simple chi-square: contingency table theme-present × genre
    obs = {}
    for genre in TYPE_ORDER:
        genre_scripts = [s for s in scripts if s["genre"] == genre]
        n_present = sum(1 for s in genre_scripts if s["theme_present"].get(t, 0) == 1)
        obs[genre] = {"present": n_present, "absent": len(genre_scripts) - n_present}
    # Expected under independence
    total_present = theme_counts[t]
    total_absent = N - total_present
    chi2 = 0
    for genre in TYPE_ORDER:
        gn = type_counts.get(genre, 1)
        for state, observed in [("present", obs[genre]["present"]), ("absent", obs[genre]["absent"])]:
            expected = gn * (total_present if state == "present" else total_absent) / N
            if expected > 0:
                chi2 += (observed - expected) ** 2 / expected
    # Approximate p-value from chi-square (dof=5 for 6 genres)
    # Using a simple approximation
    chi_square[t] = {"chi2": round(chi2, 2), "dof": 5}

# ── 11. Script extraction examples (show keyword matching) ──────────
extraction_examples = []
for s in scripts[:20]:
    tp = s.get("theme_present", {})
    present = [t for t in THEME_ORDER if tp.get(t, 0) == 1]
    if 3 <= len(present) <= 5 and s.get("plot_summary"):
        matched = s.get("matched_keywords", {})
        extraction_examples.append({
            "title": s["title"],
            "genre": s["genre"],
            "plot": s["plot_summary"][:200],
            "themes": present,
            "keywords": {t: matched.get(t, [])[:3] for t in present if t in matched},
            "theme_count": s.get("active_theme_count", 0),
        })
        if len(extraction_examples) >= 6:
            break

# ── 12. Genre similarity in theme space ──────────────────────────────
# Cosine similarity between genre theme vectors
genre_distance = {}
for g1 in TYPE_ORDER:
    genre_distance[g1] = {}
    v1 = [type_theme_matrix[g1][t] for t in THEME_ORDER]
    for g2 in TYPE_ORDER:
        v2 = [type_theme_matrix[g2][t] for t in THEME_ORDER]
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        cos_sim = dot / (norm1 * norm2) if norm1 > 0 and norm2 > 0 else 0
        genre_distance[g1][g2] = round(1 - cos_sim, 3)

# ── 13. Script theme richness distribution ───────────────────────────
theme_richness = []
# Pick diverse, interesting examples (not just the first few)
seen_titles = set()
for s in scripts:
    if s["title"] in seen_titles:
        continue
    seen_titles.add(s["title"])
    theme_richness.append({
        "title": s["title"],
        "genre": s["genre"],
        "count": s.get("active_theme_count", 0),
        "themes": {t: round(v, 4) for t, v in s.get("theme_norm", {}).items()},
    })
# Sort by theme count descending, take top 100 most theme-rich + diverse sample
theme_richness.sort(key=lambda x: -x["count"])
theme_richness = theme_richness[:80]

# ── Assemble output ──────────────────────────────────────────────────
output = {
    # Original fields (keep compatibility)
    "theme_order": THEME_ORDER,
    "theme_overall": theme_overall,
    "type_theme_matrix": type_theme_matrix,
    "type_colors": TYPE_COLORS,
    "distinctive_themes": distinctive_themes,
    "chord_edges": chord_edges,
    "era_theme": era_theme,
    "source_order": source_categories,
    "theme_colors": THEME_COLORS,
    "type_diversity": type_diversity,
    "type_order": TYPE_ORDER,

    # New fields
    "top_combos": top_combos[:30],
    "genre_top_combos": genre_top_combos,
    "archetypes": archetypes,
    "pmi_scores": list(pmi_scores.values()),
    "clustered_theme_order": clustered_order,
    "theme_similarity": theme_sim,
    "chi_square": chi_square,
    "genre_distance": genre_distance,
    "extraction_examples": extraction_examples,
    "theme_richness": theme_richness,
    "total_scripts": N,
    "total_unique_combos": len(combo_counter),
    "zero_theme_scripts": zero_theme_count,
    "zero_theme_examples": zero_theme_examples,
    "active_scripts_for_combo": N - zero_theme_count,
}

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Enriched p3 frontend data written to {OUTPUT}")
print(f"  {N} scripts, {len(combo_counter)} unique theme combinations")
print(f"  {len(archetypes)} archetypes, {len(top_combos)} top combos")
print(f"  {len(pmi_scores)} co-occurrence pairs with PMI")
