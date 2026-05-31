#!/usr/bin/env python3
"""
统计绘图脚本 - 生成数据验证图表
"""
import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os

# 设置样式
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['figure.facecolor'] = 'white'

# 数据路径
DATA_DIR = "/workspace/HumanVIZ/src/data"
OUTPUT_DIR = "/workspace"

# 选择数据集
STORY_FILE = "alice-new-themes.json"
story_name = "alice"

print(f"📂 加载数据: {STORY_FILE}")

with open(os.path.join(DATA_DIR, STORY_FILE), "r") as f:
    data = json.load(f)

print(f"   标题: {data.get('title')}")
print(f"   类型: {data.get('type')}")
print(f"   作者: {data.get('author')}")
print(f"   章节数: {data.get('num_chapters')}")
print(f"   场景数: {data.get('num_scenes')}")
print(f"   角色/主题数: {data.get('num_characters')}")
print(f"   地点数: {data.get('num_locations')}")
print()

scenes = data.get("scenes", [])
print(f"✅ 已加载 {len(scenes)} 个场景")

# ============================================================
# 图表一：场景重要性 × 冲突强度 散点图
# ============================================================
print("\n📊 生成图表 1: 重要性 × 冲突强度分布...")

scene_stats = []
for s in scenes:
    if s.get("importance") is not None:
        characters = s.get("characters", [])
        num_characters = len(characters) if isinstance(characters, list) else 0
        scene_stats.append({
            "title": s.get("title", "")[:40],
            "chapter": s.get("chapter", ""),
            "importance": s.get("importance"),
            "conflict": s.get("conflict"),
            "num_characters": num_characters,
            "location": s.get("location", "")
        })

scene_df = pd.DataFrame(scene_stats)

fig, ax = plt.subplots(figsize=(12, 8))

scatter = ax.scatter(
    scene_df["importance"],
    scene_df["conflict"],
    c=scene_df["num_characters"],
    cmap="plasma",
    s=100,
    alpha=0.75,
    edgecolors="white",
    linewidth=1
)

cbar = plt.colorbar(scatter, ax=ax)
cbar.set_label("Number of Characters/Themes", fontsize=11)

ax.set_xlabel("Scene Importance", fontsize=12)
ax.set_ylabel("Conflict Intensity", fontsize=12)
ax.set_title(f"Scene Distribution: Importance vs Conflict\n({data.get('title')} - {len(scene_df)} scenes)", fontsize=14)

# 标注极端值
top_importance = scene_df.nlargest(2, "importance")
top_conflict = scene_df.nlargest(2, "conflict")

for _, row in pd.concat([top_importance, top_conflict]).drop_duplicates().iterrows():
    ax.annotate(row["title"][:20], (row["importance"], row["conflict"]),
                fontsize=8, alpha=0.8, xytext=(5, 5), textcoords='offset points')

ax.set_xlim(-0.05, 1.05)
ax.set_ylim(-0.05, 1.05)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart1_importance_conflict_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart1_importance_conflict_{story_name}.svg")

# ============================================================
# 图表二：角色/主题出场频次分布
# ============================================================
print("\n📊 生成图表 2: 角色出场频次分布 (Top-35)...")

# 修复：characters 是 list of dicts
entity_counts = {}
for scene in scenes:
    characters = scene.get("characters", [])
    if isinstance(characters, list):
        for char in characters:
            if isinstance(char, dict):
                name = char.get("name", "Unknown")
                entity_counts[name] = entity_counts.get(name, 0) + 1

entity_df = pd.DataFrame([
    {"entity": k, "appearance_count": v}
    for k, v in sorted(entity_counts.items(), key=lambda x: x[1], reverse=True)
])

fig, ax = plt.subplots(figsize=(12, 8))

top_n = 20
colors = plt.cm.viridis(range(0, 256, 256//top_n))
sns.barplot(
    data=entity_df.head(top_n),
    x="appearance_count",
    y="entity",
    palette="viridis",
    ax=ax
)

ax.set_title(f"Top-{top_n} Character/Theme Appearance Frequency\n({data.get('title')} - Total {len(entity_df)} unique entities)", fontsize=14)
ax.set_xlabel("Appearance Count (Scene Count)", fontsize=12)
ax.set_ylabel("Character/Theme Name", fontsize=12)

# 添加数值标签
for i, (idx, row) in enumerate(entity_df.head(top_n).iterrows()):
    ax.text(row["appearance_count"] + 0.1, i, str(row["appearance_count"]),
            va='center', fontsize=9, alpha=0.8)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart2_entity_frequency_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart2_entity_frequency_{story_name}.svg")

# ============================================================
# 图表三：情感极性分布
# ============================================================
print("\n📊 生成图表 3: 情感极性分布...")

sentiments = []
for scene in scenes:
    characters = scene.get("characters", [])
    if isinstance(characters, list):
        for char in characters:
            if isinstance(char, dict):
                s = char.get("sentiment")
                if s is not None:
                    sentiments.append({
                        "entity": char.get("name", "Unknown"),
                        "sentiment": s,
                        "emotion": char.get("emotion", ""),
                        "scene_title": scene.get("title", "")
                    })

sent_df = pd.DataFrame(sentiments)

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# (a) 情感极性直方图
axes[0].hist(sent_df["sentiment"], bins=25, edgecolor="white",
             color="steelblue", alpha=0.85)
axes[0].axvline(sent_df["sentiment"].mean(), color="red", linestyle="--", linewidth=2,
                label=f'Mean = {sent_df["sentiment"].mean():.3f}')
axes[0].axvline(0, color="gray", linestyle="-", linewidth=1.5, alpha=0.5)
axes[0].set_title("Sentiment Polarity Distribution\n(Character/Theme Instances)", fontsize=12)
axes[0].set_xlabel("Sentiment Score (-1: Negative, +1: Positive)", fontsize=11)
axes[0].set_ylabel("Frequency", fontsize=11)
axes[0].legend()

# (b) Top 最正向 vs 最负向
top_positive = sent_df.groupby("entity")["sentiment"].mean().nlargest(10)
top_negative = sent_df.groupby("entity")["sentiment"].mean().nsmallest(10)

combined = pd.concat([top_positive, top_negative]).sort_values()

colors_bar = ["#2ca02c" if v > 0 else "#d62728" for v in combined.values]
axes[1].barh(range(len(combined)), combined.values, color=colors_bar, alpha=0.85, edgecolor="white")
axes[1].set_yticks(range(len(combined)))
axes[1].set_yticklabels(combined.index, fontsize=9)
axes[1].axvline(0, color="gray", linewidth=0.8)
axes[1].set_title("Top-10 Most Positive / Negative Entities", fontsize=12)
axes[1].set_xlabel("Average Sentiment Score", fontsize=11)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart3_sentiment_distribution_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart3_sentiment_distribution_{story_name}.svg")

# ============================================================
# 图表四：场景长度分布
# ============================================================
print("\n📊 生成图表 4: 场景长度与角色数量关系...")

scene_length_data = []
for s in scenes:
    characters = s.get("characters", [])
    num_chars = len(characters) if isinstance(characters, list) else 0
    scene_length_data.append({
        "title": s.get("title", "")[:30],
        "length": s.get("length", 0),
        "num_lines": s.get("num_lines", 0),
        "num_characters": num_chars,
        "importance": s.get("importance", 0)
    })

length_df = pd.DataFrame(scene_length_data)

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# (a) 场景长度分布
axes[0].hist(length_df["length"], bins=20, edgecolor="white",
             color="#3498db", alpha=0.85)
axes[0].axvline(length_df["length"].mean(), color="red", linestyle="--",
                label=f'Mean = {length_df["length"].mean():.0f}')
axes[0].set_title("Scene Length Distribution", fontsize=12)
axes[0].set_xlabel("Character Count", fontsize=11)
axes[0].set_ylabel("Number of Scenes", fontsize=11)
axes[0].legend()

# (b) 场景长度 vs 角色数量
scatter2 = axes[1].scatter(
    length_df["length"], length_df["num_characters"],
    c=length_df["importance"], cmap="coolwarm",
    s=80, alpha=0.7, edgecolors="white"
)
axes[1].set_xlabel("Scene Length (Characters)", fontsize=11)
axes[1].set_ylabel("Number of Characters/Themes", fontsize=11)
axes[1].set_title("Scene Length vs Character Count\n(Color = Importance)", fontsize=12)
plt.colorbar(scatter2, ax=axes[1], label="Importance")

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart4_scene_length_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart4_scene_length_{story_name}.svg")

# ============================================================
# 图表五：地点分布
# ============================================================
print("\n📊 生成图表 5: 场景地点分布...")

location_counts = {}
for scene in scenes:
    loc = scene.get("location", "Unknown")
    if loc:
        location_counts[loc] = location_counts.get(loc, 0) + 1

loc_df = pd.DataFrame([
    {"location": k, "count": v}
    for k, v in sorted(location_counts.items(), key=lambda x: x[1], reverse=True)
])

fig, ax = plt.subplots(figsize=(12, 8))

top_n = 15
sns.barplot(
    data=loc_df.head(top_n),
    x="count",
    y="location",
    palette="Set2",
    ax=ax
)

ax.set_title(f"Top-{top_n} Scene Locations\n({data.get('title')} - {len(loc_df)} unique locations)", fontsize=14)
ax.set_xlabel("Number of Scenes", fontsize=12)
ax.set_ylabel("Location", fontsize=12)

# 添加数值标签
for i, (idx, row) in enumerate(loc_df.head(top_n).iterrows()):
    ax.text(row["count"] + 0.1, i, str(row["count"]),
            va='center', fontsize=10, alpha=0.8)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart5_location_distribution_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart5_location_distribution_{story_name}.svg")

# ============================================================
# 统计摘要
# ============================================================
print("\n" + "="*60)
print("📊 数据有效性统计摘要")
print("="*60)
print(f"  数据集:              {data.get('title')} ({data.get('author')})")
print(f"  总场景数:            {len(scenes)}")
print(f"  唯一角色/主题数:      {len(entity_df)}")
print(f"  唯一地点数:          {len(loc_df)}")
print()
print(f"  平均场景重要性:      {scene_df['importance'].mean():.4f}")
print(f"  平均冲突强度:        {scene_df['conflict'].mean():.4f}")
print(f"  重要性标准差:        {scene_df['importance'].std():.4f}")
print(f"  冲突强度标准差:      {scene_df['conflict'].std():.4f}")
print()
print(f"  情感极性 - 均值:     {sent_df['sentiment'].mean():.4f}")
print(f"  情感极性 - 标准差:   {sent_df['sentiment'].std():.4f}")
print(f"  正向记录占比 (>0):    {(sent_df['sentiment'] > 0).mean()*100:.1f}%")
print(f"  负向记录占比 (<0):    {(sent_df['sentiment'] < 0).mean()*100:.1f}%")
print(f"  中性记录 (=0):       {(sent_df['sentiment'] == 0).mean()*100:.1f}%")
print()
print(f"  最高频角色/主题:     {entity_df.iloc[0]['entity']} ({entity_df.iloc[0]['appearance_count']}次)")
print(f"  最常见地点:          {loc_df.iloc[0]['location']} ({loc_df.iloc[0]['count']}个场景)")
print()
print("="*60)
print("✅ 所有图表已生成完毕！")
print("="*60)

# ============================================================
# 图表六：关键统计摘要数据 (图2.9)
# ============================================================
print("\n📊 生成图表 6: 关键统计摘要数据...")

fig, axes = plt.subplots(2, 3, figsize=(16, 10))
fig.suptitle(f"Key Statistics Summary — {data.get('title')}", fontsize=16, fontweight='bold', y=1.02)

# 1. 数据集概览 (指标卡片)
ax_card = axes[0, 0]
ax_card.axis('off')
overview_text = f"""
Dataset Overview
━━━━━━━━━━━━━━━━
Title:    {data.get('title')}
Author:   {data.get('author')}
Year:     {data.get('year')}
━━━━━━━━━━━━━━━━
Chapters:     {data.get('num_chapters')}
Scenes:       {data.get('num_scenes')}
Characters:   {data.get('num_characters')}
Locations:    {data.get('num_locations')}
"""
ax_card.text(0.1, 0.9, overview_text, transform=ax_card.transAxes,
             fontsize=12, verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round,pad=0.5', facecolor='#f8f9fa', edgecolor='#dee2e6'))

# 2. 场景重要性分布
ax_imp = axes[0, 1]
ax_imp.hist(scene_df["importance"], bins=15, edgecolor="white", color="#3498db", alpha=0.85)
ax_imp.axvline(scene_df["importance"].mean(), color="#e74c3c", linestyle="--", linewidth=2,
               label=f'Mean: {scene_df["importance"].mean():.3f}')
ax_imp.set_title("Importance Distribution", fontsize=12, fontweight='bold')
ax_imp.set_xlabel("Importance Score")
ax_imp.set_ylabel("Frequency")
ax_imp.legend(fontsize=9)

# 3. 冲突强度分布
ax_conf = axes[0, 2]
ax_conf.hist(scene_df["conflict"], bins=15, edgecolor="white", color="#e74c3c", alpha=0.85)
ax_conf.axvline(scene_df["conflict"].mean(), color="#3498db", linestyle="--", linewidth=2,
                label=f'Mean: {scene_df["conflict"].mean():.3f}')
ax_conf.set_title("Conflict Distribution", fontsize=12, fontweight='bold')
ax_conf.set_xlabel("Conflict Score")
ax_conf.set_ylabel("Frequency")
ax_conf.legend(fontsize=9)

# 4. 情感极性饼图
ax_pie = axes[1, 0]
positive_ratio = (sent_df["sentiment"] > 0).mean() * 100
negative_ratio = (sent_df["sentiment"] < 0).mean() * 100
neutral_ratio = (sent_df["sentiment"] == 0).mean() * 100
sentiment_sizes = [positive_ratio, negative_ratio, neutral_ratio]
sentiment_labels = [f'Positive\n{positive_ratio:.1f}%', f'Negative\n{negative_ratio:.1f}%', f'Neutral\n{neutral_ratio:.1f}%']
sentiment_colors = ['#2ecc71', '#e74c3c', '#95a5a6']
wedges, texts, autotexts = ax_pie.pie(sentiment_sizes, labels=sentiment_labels, colors=sentiment_colors,
                                        autopct='', startangle=90, explode=(0.02, 0.02, 0.02))
ax_pie.set_title(f"Sentiment Distribution\n(Mean: {sent_df['sentiment'].mean():.3f})", fontsize=12, fontweight='bold')

# 5. 角色出场TOP10
ax_char = axes[1, 1]
top10 = entity_df.head(10)
colors_bar = plt.cm.viridis(range(0, 256, 256//10))
bars = ax_char.barh(range(len(top10)), top10["appearance_count"].values, color=colors_bar, alpha=0.85, edgecolor="white")
ax_char.set_yticks(range(len(top10)))
ax_char.set_yticklabels(top10["entity"].values, fontsize=9)
ax_char.set_xlabel("Appearance Count")
ax_char.set_title(f"Top-10 Characters/Themes\n({entity_df.iloc[0]['entity']} leads with {entity_df.iloc[0]['appearance_count']} appearances)", fontsize=12, fontweight='bold')
ax_char.invert_yaxis()

# 6. 场景长度分布
ax_len = axes[1, 2]
ax_len.hist(length_df["length"], bins=15, edgecolor="white", color="#9b59b6", alpha=0.85)
ax_len.axvline(length_df["length"].mean(), color="#f39c12", linestyle="--", linewidth=2,
               label=f'Mean: {length_df["length"].mean():.0f}')
ax_len.set_title(f"Scene Length Distribution\n(Total scenes: {len(length_df)})", fontsize=12, fontweight='bold')
ax_len.set_xlabel("Character Count")
ax_len.set_ylabel("Frequency")
ax_len.legend(fontsize=9)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, f"chart6_statistics_summary_{story_name}.svg"), dpi=150, bbox_inches='tight')
print(f"   ✅ 已保存: chart6_statistics_summary_{story_name}.svg")
