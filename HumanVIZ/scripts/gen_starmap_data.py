#!/usr/bin/env python3
"""
Generate data for the '梨园星图' (Pear Garden Star Map) visualization.
Computes cross-script connections and pre-calculates layout positions.
"""

import json
import math
from collections import defaultdict

DATA_DIR = "/workspace/HumanVIZ/data"
SRC_DIR = "/workspace/HumanVIZ/src/data"
OUT = "/workspace/HumanVIZ/src/data/starmap_data.json"

print("Loading data sources...")

# 1. Networks (characters per script)
with open(f"{DATA_DIR}/p2_networks.json") as f:
    raw = json.load(f)
    networks = raw["networks"]

# 2. Metrics
with open(f"{DATA_DIR}/p2_metrics.json") as f:
    raw = json.load(f)
    metrics_list = raw["metrics"]
    metrics_map = {m["entity_id"]: m for m in metrics_list}

# 3. Themes
with open(f"{DATA_DIR}/p3_themes.json") as f:
    themes_data = json.load(f)
    theme_taxonomy = themes_data["theme_taxonomy"]
    theme_scripts = themes_data["scripts"]
    theme_map = {s["entity_id"]: s for s in theme_scripts}

# 4. Structural fingerprints
with open(f"{DATA_DIR}/structural_fingerprints.json") as f:
    raw = json.load(f)
    features_list = raw["features"]
    features_map = {}
    for feat in features_list:
        # entity_id may have .pdf suffix in fingerprints
        eid = feat["entity_id"]
        features_map[eid] = feat

# 5. Character role map
with open(f"{SRC_DIR}/char_role_map.json") as f:
    char_role_map = json.load(f)

print(f"Loaded: {len(networks)} networks, {len(metrics_list)} metrics, "
      f"{len(theme_scripts)} theme scripts, {len(features_list)} fingerprints")

# ── Genre config ──
GENRE_ORDER = ["历史戏", "家庭戏", "侠义戏", "爱情戏", "神话戏", "公案戏", "技法展示戏"]
GENRE_COLORS = {
    "历史戏": "#b8926a", "家庭戏": "#96544d", "侠义戏": "#5e6b76",
    "爱情戏": "#c77d8b", "神话戏": "#7f968d", "公案戏": "#6b7b8e",
    "技法展示戏": "#c4a56e",
}

ROLE_COLORS = {
    "生": "#b8926a", "旦": "#96544d", "净": "#5e6b76", "丑": "#7f968d", "其他": "#a0a0a0",
}

THEME_COLORS = {name: info["color"] for name, info in theme_taxonomy.items()}
THEME_ORDER = list(theme_taxonomy.keys())

NARR_CLUSTERS = ["渐进式", "突变式", "双线交织", "回环式"]
NARR_COLORS = {
    "渐进式": "#b8926a", "突变式": "#96544d", "双线交织": "#5e6b76", "回环式": "#7f968d",
}

# ── Classify narrative type from structural features ──
def classify_narrative(feat):
    if not feat:
        return "渐进式"
    sc = feat.get("scene_count", 5)
    fc = feat.get("fighting_ratio", 0)
    cv = feat.get("scene_lines_cv", 1)
    sing = feat.get("singing_ratio", 0.2)

    if sc <= 3:
        return "突变式"
    elif fc > 0.08:
        return "双线交织"
    elif cv > 1.8:
        return "突变式"
    elif sing > 0.35 and sc <= 6:
        return "回环式"
    else:
        return "渐进式"

# ── Build script nodes ──
print("Building script nodes...")
script_nodes = []
entity_id_to_idx = {}

for i, net in enumerate(networks):
    eid = net["entity_id"]
    entity_id_to_idx[eid] = i

    # Find matching data across sources
    # fingerprint entity_id may have .pdf suffix
    feat = features_map.get(eid) or features_map.get(eid + ".pdf")
    mtr = metrics_map.get(eid)
    thm = theme_map.get(eid)

    # Extract title (short)
    title = net.get("title", eid)
    # Remove parenthetical suffix
    if "（" in title:
        title_short = title[:title.index("（")]
    elif "(" in title:
        title_short = title[:title.index("(")]
    else:
        title_short = title

    genre = net.get("genre", "历史戏")

    # Themes - only keep top themes with non-zero scores
    theme_vector = {}
    theme_present = []
    if thm:
        raw_tv = thm.get("theme_norm", {})
        # Only keep themes with score > 0
        theme_vector = {k: round(v, 3) for k, v in raw_tv.items() if v > 0}
        tp = thm.get("theme_present", {})
        theme_present = [k for k, v in tp.items() if v]

    # Top themes (by norm score)
    top_themes = sorted(theme_vector.items(), key=lambda x: -x[1])[:3]
    top_theme_names = [t[0] for t in top_themes if t[1] > 0]

    # Narrative type
    narr_type = classify_narrative(feat)

    # Character count and top characters
    char_count = net.get("total_characters", 0)
    nodes_sorted = sorted(net.get("nodes", []), key=lambda n: -n.get("degree", 0))
    top_chars = [n["name"] for n in nodes_sorted[:8]]

    # Role distribution
    role_dist = defaultdict(int)
    for n in net.get("nodes", []):
        role = char_role_map.get(n["name"], "其他")
        role_dist[role] += 1

    # Structural features for radar
    density = mtr.get("density", 0) if mtr else 0
    centralization = mtr.get("centralization", 0) if mtr else 0
    clustering = mtr.get("clustering", 0) if mtr else 0

    singing_ratio = feat.get("singing_ratio", 0) if feat else 0
    reciting_ratio = feat.get("reciting_ratio", 0) if feat else 0
    fighting_ratio = feat.get("fighting_ratio", 0) if feat else 0
    speaking_ratio = feat.get("speaking_ratio", 0) if feat else 0
    scene_count = feat.get("scene_count", 0) if feat else 0

    script_nodes.append({
        "id": eid,
        "idx": i,
        "title": title,
        "titleShort": title_short,
        "genre": genre,
        "genreColor": GENRE_COLORS.get(genre, "#999"),
        "sourceCategory": net.get("source_category", ""),
        "charCount": char_count,
        "topChars": top_chars,
        "topThemes": top_theme_names,
        "themeVector": theme_vector,
        "themePresent": theme_present,
        "narrType": narr_type,
        "narrColor": NARR_COLORS.get(narr_type, "#999"),
        "roleDist": dict(role_dist),
        "density": density,
        "centralization": centralization,
        "clustering": clustering,
        "singingRatio": singing_ratio,
        "recitingRatio": reciting_ratio,
        "fightingRatio": fighting_ratio,
        "speakingRatio": speaking_ratio,
        "sceneCount": scene_count,
        "totalScenes": net.get("total_scenes", 0),
        "totalEdges": net.get("total_edges", 0),
    })

# ── Build character-to-script index ──
print("Building character-to-script index...")
char_to_scripts = defaultdict(set)
char_to_degree = defaultdict(lambda: defaultdict(int))

for net in networks:
    eid = net["entity_id"]
    for node in net.get("nodes", []):
        name = node["name"]
        char_to_scripts[name].add(eid)
        char_to_degree[name][eid] = node.get("degree", 0)

# ── Build cross-script links (shared characters) ──
print("Building cross-script links...")
# Efficient approach: use defaultdict to aggregate directly
# Only consider characters appearing in ≤ 30 scripts to avoid huge common chars
agg_links = defaultdict(lambda: {"sharedChars": [], "totalWeight": 0})

for char_name, script_set in char_to_scripts.items():
    # Skip characters appearing in too many scripts (e.g., "众人", "龙套")
    if len(script_set) > 30 or len(script_set) < 2:
        continue
    script_list = sorted(script_set)
    for i in range(len(script_list)):
        s1 = script_list[i]
        if s1 not in entity_id_to_idx:
            continue
        for j in range(i + 1, len(script_list)):
            s2 = script_list[j]
            if s2 not in entity_id_to_idx:
                continue
            key = (min(s1, s2), max(s1, s2))
            entry = agg_links[key]
            entry["sharedChars"].append(char_name)
            entry["totalWeight"] += char_to_degree[char_name][s1] + char_to_degree[char_name][s2]

# Convert to list, filter by minimum shared characters
final_links = []
for (s1, s2), info in agg_links.items():
    n_shared = len(info["sharedChars"])
    if n_shared >= 2:  # At least 2 shared characters
        final_links.append({
            "source": entity_id_to_idx[s1],
            "target": entity_id_to_idx[s2],
            "sourceId": s1,
            "targetId": s2,
            "sharedChars": info["sharedChars"][:10],  # Top 10
            "sharedCount": n_shared,
            "totalWeight": info["totalWeight"],
        })

print(f"Cross-script links (≥2 shared chars): {len(final_links)}")

# ── Build theme similarity links (optimized with theme index) ──
print("Building theme similarity links...")
# Index scripts by theme, then only compare scripts sharing at least one theme
theme_to_scripts = defaultdict(list)
for i, s in enumerate(script_nodes):
    for t in s["themePresent"]:
        theme_to_scripts[t].append(i)

theme_link_acc = defaultdict(lambda: {"sharedThemes": set(), "count": 0})
for theme, indices in theme_to_scripts.items():
    for i in range(len(indices)):
        for j in range(i + 1, len(indices)):
            a, b = min(indices[i], indices[j]), max(indices[i], indices[j])
            key = (a, b)
            theme_link_acc[key]["sharedThemes"].add(theme)
            theme_link_acc[key]["count"] = len(theme_link_acc[key]["sharedThemes"])

theme_links_raw = []
for (a, b), info in theme_link_acc.items():
    if info["count"] >= 3:
        theme_links_raw.append({
            "source": a,
            "target": b,
            "sharedThemes": list(info["sharedThemes"]),
            "count": info["count"],
        })

# Limit to top 5 links per source script to keep visualization manageable
from collections import Counter
src_count = Counter()
theme_links = []
for link in sorted(theme_links_raw, key=lambda x: -x["count"]):
    s = link["source"]
    if src_count[s] < 5:
        theme_links.append(link)
        src_count[s] += 1

print(f"Theme similarity links (≥2 shared themes): {len(theme_links)}")

# ── Build genre groups ──
genre_groups = {}
for genre in GENRE_ORDER:
    indices = [i for i, s in enumerate(script_nodes) if s["genre"] == genre]
    genre_groups[genre] = {
        "name": genre,
        "color": GENRE_COLORS[genre],
        "count": len(indices),
        "indices": indices,
    }

# ── Build character nodes for Layer 2 ──
print("Building character nodes per genre...")
genre_characters = {}
for genre in GENRE_ORDER:
    char_count_genre = defaultdict(lambda: {"scripts": 0, "totalDegree": 0, "role": "其他"})
    for net in networks:
        if net.get("genre") != genre:
            continue
        for node in net.get("nodes", []):
            name = node["name"]
            cc = char_count_genre[name]
            cc["scripts"] += 1
            cc["totalDegree"] += node.get("degree", 0)
            cc["role"] = char_role_map.get(name, "其他")

    # Top 20 characters per genre
    sorted_chars = sorted(char_count_genre.items(), key=lambda x: -x[1]["totalDegree"])[:20]
    genre_characters[genre] = [
        {
            "name": name,
            "scripts": info["scripts"],
            "totalDegree": info["totalDegree"],
            "role": info["role"],
            "roleColor": ROLE_COLORS.get(info["role"], "#a0a0a0"),
        }
        for name, info in sorted_chars
    ]

# ── Theme statistics ──
theme_stats = {}
for theme_name in THEME_ORDER:
    count = sum(1 for s in script_nodes if theme_name in s["themePresent"])
    theme_stats[theme_name] = {
        "name": theme_name,
        "color": THEME_COLORS[theme_name],
        "count": count,
        "ratio": round(count / len(script_nodes), 3),
    }

# ── Narr type statistics ──
narr_stats = {}
for nt in NARR_CLUSTERS:
    count = sum(1 for s in script_nodes if s["narrType"] == nt)
    narr_stats[nt] = {
        "name": nt,
        "color": NARR_COLORS[nt],
        "count": count,
    }

# ── Serialize ──
print("Serializing output...")
output = {
    "meta": {
        "totalScripts": len(script_nodes),
        "totalCharLinks": len(final_links),
        "totalThemeLinks": len(theme_links),
        "generatedAt": "2026-05-30",
    },
    "config": {
        "genreOrder": GENRE_ORDER,
        "genreColors": GENRE_COLORS,
        "roleColors": ROLE_COLORS,
        "themeColors": THEME_COLORS,
        "themeOrder": THEME_ORDER,
        "narrColors": NARR_COLORS,
        "narrTypes": NARR_CLUSTERS,
    },
    "scripts": script_nodes,
    "charLinks": final_links,
    "themeLinks": theme_links,
    "genreGroups": genre_groups,
    "genreCharacters": genre_characters,
    "themeStats": theme_stats,
    "narrStats": narr_stats,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

print(f"\n✅ Output written to {OUT}")
print(f"   Scripts: {len(script_nodes)}")
print(f"   Character links: {len(final_links)}")
print(f"   Theme links: {len(theme_links)}")
print(f"   Genres: {len(genre_groups)}")
print(f"   Themes: {len(theme_stats)}")

# Size check
import os
size_kb = os.path.getsize(OUT) / 1024
print(f"   File size: {size_kb:.1f} KB")
