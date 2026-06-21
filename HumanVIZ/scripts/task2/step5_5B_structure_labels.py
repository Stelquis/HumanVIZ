"""
================================================================================
Step 5.5B: Rule-based 网络结构标签判定
================================================================================

基于 Step 5.5A 的 centralization_metrics.json，用独立规则函数为每部剧打结构标签。

标签体系:
  - 弱关系碎片型    edge_count<=2 | LCR<0.4 | active_node_ratio<0.3
  - 单核心型         top1_top2_gap>0.25 & deg_cent>=0.35 | ratio>1.6 & max_to_mean>=2.5
  - 双核心型         top1_top2_gap<=0.10 & top2_top3_gap>0.12 (非对抗)
  - 双核心对抗型     双核心型 + Top1/Top2 有敌对/阵营对立/政敌/仇人关系
  - 多核心群像型     active>=6 & top3_share>=0.45 & deg_cent<0.4
  - 分散型           其余

输入: data/processed/task2/network_by_type/centralization_metrics.json
输出:
  - data/processed/task2/network_by_type/network_structure_labels.json
  - data/processed/task2/network_by_type/network_structure_by_type.json
  - data/processed/task2/network_by_type/network_structure_rule_audit.json
================================================================================
"""

import json
import sys
import random
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BASE_DIR = Path("/workspace/HumanVIZ")
OUTPUT_DIR = BASE_DIR / "data" / "processed" / "task2" / "network_by_type"
INPUT_FILE = OUTPUT_DIR / "centralization_metrics.json"

# ─── 对抗性关系判定 ──────────────────────────────────────────
ADVERSARIAL_MACRO = {"敌对"}
ADVERSARIAL_MICRO = {"阵营对立", "政敌", "仇人", "宿敌", "仇人/敌对", "敌对/仇人"}


def is_adversarial(top1_top2_rel):
    """判断 Top1 和 Top2 之间是否存在对抗关系"""
    if not top1_top2_rel or not top1_top2_rel.get('exists'):
        return False
    macro = top1_top2_rel.get('relation_type', '')
    micro = top1_top2_rel.get('micro_type', '')
    return macro in ADVERSARIAL_MACRO or micro in ADVERSARIAL_MICRO


# ─── 主分类函数 ──────────────────────────────────────────────

def classify_network_structure(fg, top1_top2_rel):
    """
    基于 full_graph 指标和 Top1/Top2 关系类型判定网络结构标签。

    Args:
        fg: full_graph metrics dict (from centralization_metrics.json)
        top1_top2_rel: top1_top2_relation dict

    Returns:
        (label: str, reasons: list[str], secondary_flags: list[str])
    """
    reasons = []
    secondary_flags = []

    # 提取指标（处理 None 值）
    ec = fg.get('edge_count', 0)
    nc = fg.get('node_count', 0)
    lcr = fg.get('largest_component_ratio', 0) or 0
    anr = fg.get('active_node_ratio', 0) or 0
    anc = fg.get('active_node_count', 0) or 0
    gap = fg.get('top1_top2_gap')  # may be None
    ratio = fg.get('top1_top2_ratio')  # may be None
    gap23 = fg.get('top2_top3_gap')  # may be None
    t3s = fg.get('top3_centrality_share')  # may be None
    dc = fg.get('degree_centralization')  # may be 0 or None
    mmr = fg.get('max_to_mean_centrality_ratio')  # may be None

    # Default None → 0 for comparisons
    gap = gap if gap is not None else 0
    ratio = ratio if ratio is not None else 1.0
    gap23 = gap23 if gap23 is not None else 0
    t3s = t3s if t3s is not None else 0
    dc = dc if dc is not None else 0
    mmr = mmr if mmr is not None else 1.0

    # ── Secondary flags: 在规则引擎运行前先标记 ──
    # 单核心倾向: gap 在 0.20-0.25 且度中心化程度足够高
    if 0.20 <= gap <= 0.25 and dc >= 0.44:
        secondary_flags.append(f"单核心倾向 (gap={gap:.3f}, dc={dc:.3f})")

    # 双核心倾向: Top1/Top2 接近但 Top2/Top3 差距不够双核心阈值
    if gap <= 0.12 and 0.06 < gap23 <= 0.12 and anc >= 4:
        secondary_flags.append(f"双核心倾向 (gap={gap:.3f}, gap23={gap23:.3f})")

    # ── Rule 1: 弱关系碎片型 ──
    if ec <= 2:
        reasons.append(f"edge_count={ec} <= 2")
        return "弱关系碎片型", reasons, secondary_flags
    if lcr < 0.4:
        reasons.append(f"largest_component_ratio={lcr:.3f} < 0.4")
        return "弱关系碎片型", reasons, secondary_flags
    if anr < 0.3:
        reasons.append(f"active_node_ratio={anr:.3f} < 0.3")
        return "弱关系碎片型", reasons, secondary_flags

    # ── Rule 2: 单核心型 ──
    if gap > 0.25 and dc >= 0.35:
        reasons.append(f"top1_top2_gap={gap:.3f} > 0.25 AND degree_centralization={dc:.3f} >= 0.35")
        return "单核心型", reasons, secondary_flags
    if ratio > 1.6 and mmr >= 2.5:
        reasons.append(f"top1_top2_ratio={ratio:.2f} > 1.6 AND max_to_mean={mmr:.2f} >= 2.5")
        return "单核心型", reasons, secondary_flags

    # ── Rule 3: 双核心型 / 双核心对抗型 ──
    if gap <= 0.10 and gap23 > 0.12:
        adversarial = is_adversarial(top1_top2_rel)
        if adversarial:
            rel_info = top1_top2_rel or {}
            reasons.append(
                f"top1_top2_gap={gap:.3f} <= 0.10 AND top2_top3_gap={gap23:.3f} > 0.12 "
                f"AND relation={rel_info.get('relation_type','')}/{rel_info.get('micro_type','')} (对抗)"
            )
            return "双核心对抗型", reasons, secondary_flags
        else:
            reasons.append(
                f"top1_top2_gap={gap:.3f} <= 0.10 AND top2_top3_gap={gap23:.3f} > 0.12"
            )
            return "双核心型", reasons, secondary_flags

    # ── Rule 4: 多核心群像型 ──
    if anc >= 6 and t3s >= 0.45 and dc < 0.4:
        reasons.append(
            f"active_node_count={anc} >= 6 AND top3_centrality_share={t3s:.3f} >= 0.45 "
            f"AND degree_centralization={dc:.3f} < 0.4"
        )
        return "多核心群像型", reasons, secondary_flags

    # ── Rule 5: 分散型 (fallthrough) ──
    reasons.append(
        f"不满足以上任何规则 (gap={gap:.3f}, ratio={ratio:.2f}, dc={dc:.3f}, "
        f"t3s={t3s:.3f}, anc={anc}, gap23={gap23:.3f}, mmr={mmr:.2f})"
    )
    return "分散型", reasons, secondary_flags


# ─── 抽样审计 ────────────────────────────────────────────────

def sample_audit(labeled_plays, max_per_label=20):
    """对每个标签抽样检查，记录可能误判的样例"""
    audit = {}
    all_types = set(p['label'] for p in labeled_plays)

    for label in sorted(all_types):
        subset = [p for p in labeled_plays if p['label'] == label]
        n = min(max_per_label, len(subset))
        sample = random.sample(subset, n) if n > 0 else []
        audit[label] = {
            'total': len(subset),
            'sampled': n,
            'cases': [
                {
                    'entity_id': p['entity_id'],
                    'title': p['title'],
                    'play_type': p['play_type'],
                    'label': p['label'],
                    'reasons': p['reasons'],
                    'secondary_flags': p['secondary_flags'],
                    'key_metrics': {
                        'edge_count': p['full_graph'].get('edge_count'),
                        'node_count': p['full_graph'].get('node_count'),
                        'active_node_ratio': p['full_graph'].get('active_node_ratio'),
                        'largest_component_ratio': p['full_graph'].get('largest_component_ratio'),
                        'top1_top2_gap': p['full_graph'].get('top1_top2_gap'),
                        'top1_top2_ratio': p['full_graph'].get('top1_top2_ratio'),
                        'degree_centralization': p['full_graph'].get('degree_centralization'),
                        'top3_centrality_share': p['full_graph'].get('top3_centrality_share'),
                    },
                    'top_characters': [
                        {'name': tc['name'], 'role_type': tc['role_type'],
                         'deg': tc['full_graph']['degree_centrality']}
                        for tc in p.get('top_characters', [])[:3]
                    ],
                    'top1_top2_relation': p.get('top1_top2_relation'),
                    'possible_misclassification': '',  # 留空供人工填写
                }
                for p in sample
            ]
        }
    return audit


# ─── Main ────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("Step 5.5B: Rule-based 网络结构标签判定")
    print(f"开始时间: {datetime.now().isoformat()}")
    print("=" * 70)

    # ── 加载数据 ──
    print("\n[1/4] 加载 centralization_metrics.json ...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    plays = data['plays']
    print(f"  ✓ {len(plays)} 部剧本")

    # ── 分类 ──
    print("\n[2/4] 执行 rule-based 分类 ...")
    classified = []
    label_counter = Counter()
    rule_trace = []  # 记录每条规则触发情况

    for p in plays:
        fg = p['full_graph']
        top1_top2_rel = p.get('top1_top2_relation')
        label, reasons, secondary_flags = classify_network_structure(fg, top1_top2_rel)

        classified.append({
            'entity_id': p['entity_id'],
            'title': p['title'],
            'play_type': p['play_type'],
            'label': label,
            'reasons': reasons,
            'secondary_flags': secondary_flags,
            'full_graph': fg,
            'semantic_graph': p.get('semantic_graph', {}),
            'active_graph': p.get('active_graph', {}),
            'top_characters': p.get('top_characters', []),
            'top1_top2_relation': top1_top2_rel,
        })
        label_counter[label] += 1

    print(f"  完成: {len(classified)} 部剧")
    print(f"  标签分布:")
    for label, count in label_counter.most_common():
        print(f"    {label}: {count} ({count/len(classified)*100:.1f}%)")

    # Secondary flag counts
    flag_counter = Counter()
    for p in classified:
        for f in p['secondary_flags']:
            flag_counter[f.split(' ')[0]] += 1  # "单核心傾向" or "双核心傾向"
    print(f"  辅助标记分布:")
    for flag, count in flag_counter.most_common():
        print(f"    {flag}: {count}")

    # ── 按类型聚合 ──
    print("\n[3/4] 按剧目类型聚合 ...")
    by_type = {}
    for p in classified:
        pt = p['play_type']
        if pt not in by_type:
            by_type[pt] = {
                'play_count': 0,
                'label_distribution': Counter(),
                'label_pct': {},
            }
        by_type[pt]['play_count'] += 1
        by_type[pt]['label_distribution'][p['label']] += 1

    for pt, info in by_type.items():
        total = info['play_count']
        info['label_distribution'] = dict(info['label_distribution'].most_common())
        info['label_pct'] = {
            label: round(count / total * 100, 1)
            for label, count in info['label_distribution'].items()
        }
        # Dominant labels
        sorted_labels = sorted(info['label_pct'].items(), key=lambda x: -x[1])
        info['dominant_labels'] = [l for l, pct in sorted_labels if pct >= 15]
        info['top_label'] = sorted_labels[0][0] if sorted_labels else ''

        print(f"\n  {pt} ({info['play_count']} 部):")
        for label, count in info['label_distribution'].items():
            pct = info['label_pct'][label]
            print(f"    {label}: {count} ({pct}%)")

    # ── 抽样审计 ──
    print("\n[4/4] 抽样审计 (每类最多 20 部) ...")
    random.seed(42)  # 可复现
    rule_audit = sample_audit(classified, max_per_label=20)

    # ── 输出文件 1: 每部剧的结构标签 ──
    labels_output = {
        'meta': {
            'step': '5.5B',
            'generated_at': datetime.now().isoformat(),
            'source': 'centralization_metrics.json (Step 5.5A)',
            'graph_scope': 'full_graph',
            'description': 'Rule-based 网络结构标签 — 每部剧一个标签 + 判断依据',
            'label_system': {
                '弱关系碎片型': 'edge_count<=2 | LCR<0.4 | active_node_ratio<0.3',
                '单核心型': 'top1_top2_gap>0.25 & deg_cent>=0.35 | ratio>1.6 & max_to_mean>=2.5',
                '双核心型': 'top1_top2_gap<=0.10 & top2_top3_gap>0.12, 非对抗',
                '双核心对抗型': '双核心型 + Top1/Top2 敌对/阵营对立/政敌/仇人',
                '多核心群像型': 'active>=6 & top3_share>=0.45 & deg_cent<0.4',
                '分散型': '不满足以上任何规则',
            },
            'secondary_flags': {
                '单核心倾向': '0.20 <= top1_top2_gap <= 0.25 AND degree_centralization >= 0.44 — 有中心倾向但未达严格单核心阈值',
                '双核心倾向': 'top1_top2_gap <= 0.12 AND 0.06 < top2_top3_gap <= 0.12 AND active>=4 — 有双头趋势但差距不够显著',
            },
        },
        'summary': {
            'total_plays': len(classified),
            'label_distribution': dict(label_counter.most_common()),
            'secondary_flag_counts': dict(flag_counter.most_common()),
        },
        'plays': [
            {
                'entity_id': p['entity_id'],
                'title': p['title'],
                'play_type': p['play_type'],
                'label': p['label'],
                'reasons': p['reasons'],
                'secondary_flags': p['secondary_flags'],
                'key_metrics': {
                    'edge_count': p['full_graph'].get('edge_count'),
                    'node_count': p['full_graph'].get('node_count'),
                    'active_node_count': p['full_graph'].get('active_node_count'),
                    'active_node_ratio': p['full_graph'].get('active_node_ratio'),
                    'largest_component_ratio': p['full_graph'].get('largest_component_ratio'),
                    'top1_top2_gap': p['full_graph'].get('top1_top2_gap'),
                    'top1_top2_ratio': p['full_graph'].get('top1_top2_ratio'),
                    'top2_top3_gap': p['full_graph'].get('top2_top3_gap'),
                    'top3_centrality_share': p['full_graph'].get('top3_centrality_share'),
                    'max_to_mean_centrality_ratio': p['full_graph'].get('max_to_mean_centrality_ratio'),
                    'degree_centralization': p['full_graph'].get('degree_centralization'),
                },
                'top_characters': [
                    {'rank': tc['rank'], 'name': tc['name'], 'role_type': tc['role_type'],
                     'degree_centrality': tc['full_graph']['degree_centrality']}
                    for tc in p.get('top_characters', [])[:3]
                ],
                'top1_top2_relation': p.get('top1_top2_relation'),
            }
            for p in classified
        ],
    }

    out1 = OUTPUT_DIR / 'network_structure_labels.json'
    with open(out1, 'w', encoding='utf-8') as f:
        json.dump(labels_output, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓ network_structure_labels.json ({out1.stat().st_size / 1024:.0f} KB)")

    # ── 输出文件 2: 按类型聚合 ──
    by_type_output = {
        'meta': {
            'step': '5.5B',
            'generated_at': datetime.now().isoformat(),
            'description': '按剧目类型的网络结构标签分布',
        },
        'summary': {
            'total_plays': len(classified),
            'global_label_distribution': dict(label_counter.most_common()),
        },
        'by_type': by_type,
    }

    out2 = OUTPUT_DIR / 'network_structure_by_type.json'
    with open(out2, 'w', encoding='utf-8') as f:
        json.dump(by_type_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ network_structure_by_type.json")

    # ── 输出文件 3: 规则审计 ──
    audit_output = {
        'meta': {
            'step': '5.5B',
            'generated_at': datetime.now().isoformat(),
            'description': '规则抽样审计 — 每类标签抽样检查，供人工验证',
            'sample_size_per_label': min(20, min(label_counter.values())),
            'random_seed': 42,
        },
        'audit': rule_audit,
    }

    out3 = OUTPUT_DIR / 'network_structure_rule_audit.json'
    with open(out3, 'w', encoding='utf-8') as f:
        json.dump(audit_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ network_structure_rule_audit.json")

    # ── 打印总结 ──
    print("\n" + "=" * 70)
    print("Step 5.5B 完成摘要")
    print("=" * 70)
    print(f"""
  总剧本数:         {len(classified)}
  标签分布:
""")
    for label, count in label_counter.most_common():
        bar = '█' * int(count / len(classified) * 50)
        print(f"    {label:　<8s}  {count:4d} ({count/len(classified)*100:5.1f}%)  {bar}")

    print(f"""
  按类型 Top 标签:
""")
    for pt in sorted(by_type.keys()):
        info = by_type[pt]
        print(f"    {pt}: {info['top_label']} (dominant: {', '.join(info['dominant_labels'])})")

    print(f"""
  抽样审计: 每类 {min(20, min(label_counter.values()))} 部 → network_structure_rule_audit.json
  下一步: Step 5.6 — 连通性与子图结构分析
""")


if __name__ == '__main__':
    main()
