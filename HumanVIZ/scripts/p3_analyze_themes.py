"""
Task 3 Phase 2: 主题分布分析 + 跨类型比较
加载 p3_themes.json，计算类型-主题关联、差异主题、共现模式

输出:
  /workspace/HumanVIZ/data/p3_type_comparison.json — 类型间主题比较
"""

import json
import numpy as np
from collections import Counter, defaultdict
from scipy import stats

INPUT_PATH = "/workspace/HumanVIZ/data/p3_themes.json"
OUTPUT_PATH = "/workspace/HumanVIZ/data/p3_type_comparison.json"

THEME_ORDER = ["忠义报国", "征战讨伐", "冤案昭雪", "权谋斗争", "爱情姻缘",
               "家庭伦理", "神话灵异", "侠义江湖", "智谋韬略", "科举功名",
               "宫廷朝堂", "生死离别"]


def main():
    print("=" * 60)
    print("Task 3 Phase 2: 主题分布分析")
    print("=" * 60)

    with open(INPUT_PATH, encoding='utf-8') as f:
        data = json.load(f)

    scripts = data['scripts']
    theme_taxonomy = data['theme_taxonomy']
    type_theme_ratio = data['type_theme_ratio']
    theme_overall = data['theme_overall']

    print(f"加载 {len(scripts)} 本剧本")

    # ====== 1. 按剧目类型的主题分布 ======
    print("\n===== 按剧目类型 =====")
    print(f"{'类型':<10}", end="")
    for t in THEME_ORDER:
        print(f" {t:<10}", end="")
    print(f" {'特有主题':<20}")
    print("-" * 130)

    all_type_distinctive = {}
    for genre in ['历史戏', '家庭戏', '侠义戏', '爱情戏', '神话戏', '公案戏', '技法展示戏']:
        ratios = type_theme_ratio.get(genre, {})
        if not ratios:
            continue

        # 该类型最高的 3 个主题
        top_themes = sorted(ratios.items(), key=lambda x: x[1], reverse=True)[:3]

        # 该类型的区分性主题 (相比全球均值差异最大的)
        genre_mean = {t: ratios.get(t, 0) for t in THEME_ORDER}
        global_mean = {t: theme_overall[t]['pct'] / 100 if theme_overall[t]['pct'] else 0 for t in THEME_ORDER}
        diff = {t: genre_mean[t] - global_mean[t] for t in THEME_ORDER}
        distinctive = sorted(diff.items(), key=lambda x: x[1], reverse=True)[:3]
        all_type_distinctive[genre] = {
            'top_themes': [(t, round(v, 3)) for t, v in top_themes],
            'distinctive': [(t, round(d, 3)) for t, d in distinctive],
        }

        print(f"{genre:<10}", end="")
        for t in THEME_ORDER:
            val = ratios.get(t, 0)
            if val > 0.4:
                print(f" \033[1;32m{val:.2f}\033[0m    ", end="")
            else:
                print(f" {val:.2f}    ", end="")
        print(f" {top_themes[0][0]}, {top_themes[1][0]}" if len(top_themes) >= 2 else "")

    # ====== 2. 卡方检验: 主题 × 类型独立性 ======
    print("\n===== 卡方独立性检验 (主题 × 剧目类型) =====")
    chi_results = {}
    for theme in THEME_ORDER:
        # 构建列联表
        type_order = ['历史戏', '家庭戏', '侠义戏', '爱情戏', '神话戏', '公案戏', '技法展示戏']
        observed = []
        for genre in type_order:
            genre_scripts = [s for s in scripts if s['genre'] == genre]
            has_theme = sum(1 for s in genre_scripts if s['theme_present'][theme])
            no_theme = len(genre_scripts) - has_theme
            observed.append([has_theme, no_theme])
        observed = np.array(observed)
        if observed.sum() > 0 and observed.min() >= 0:
            chi2, p, dof, expected = stats.chi2_contingency(observed)
            chi_results[theme] = {'chi2': round(chi2, 2), 'p': round(float(p), 8), 'dof': dof}
            sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else ""
            print(f"  {theme}: χ²={chi2:.1f}, p={p:.2e} {sig}")

    # ====== 3. 主题独特性排名 ======
    print("\n===== 每类型的最具区分性主题 =====")
    for genre, info in all_type_distinctive.items():
        print(f"  {genre}:")
        print(f"    高频主题: {', '.join(f'{t}({v:.0%})' for t, v in info['top_themes'])}")
        print(f"    区分主题: {', '.join(f'{t}(+{d:.0%} vs 全局)' for t, d in info['distinctive'])}")

    # ====== 4. 主题丰度分析 ======
    print("\n===== 主题丰度 (每剧本平均主题数) =====")
    for genre in ['历史戏', '家庭戏', '侠义戏', '爱情戏', '神话戏', '公案戏', '技法展示戏']:
        genre_scripts = [s for s in scripts if s['genre'] == genre]
        if not genre_scripts:
            continue
        avg_count = np.mean([s['active_theme_count'] for s in genre_scripts])
        print(f"  {genre}: {avg_count:.1f} 主题/本 ({len(genre_scripts)} 本)")

    # ====== 5. 主题共现网络 ======
    cooccur = data['theme_cooccur_top']

    # ====== 汇总输出 ======
    output = {
        'type_theme_ratio': type_theme_ratio,
        'type_distinctive': all_type_distinctive,
        'chi_square': chi_results,
        'theme_order': THEME_ORDER,
        'theme_cooccur': cooccur,
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n分析结果已保存: {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
