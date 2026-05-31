"""
Task 3 Phase 1: 批量剧本主题提取
从全部 1473 本剧本的"情节"摘要中，通过关键词匹配提取 12 维主题向量

输出: /workspace/HumanVIZ/data/p3_themes.json
"""

import json
import os
import re
from collections import Counter, defaultdict
import numpy as np
from tqdm import tqdm

BASE_DIR = "/workspace/HumanVIZ/data/dataSet"
GENRE_PATH = "/workspace/HumanVIZ/data/db_exports/剧目类型.json"
OUTPUT_PATH = "/workspace/HumanVIZ/data/p3_themes.json"

# 12-theme taxonomy for Peking opera
THEME_TAXONOMY = {
    "忠义报国": {
        "keywords": ["忠", "报国", "尽忠", "殉国", "死节", "忠臣", "忠良", "精忠", "捐躯", "殉难", "就义", "不屈", "守节", "气节", "舍身", "成仁", "取义"],
        "color": "#b8926a",
    },
    "征战讨伐": {
        "keywords": ["征", "战", "伐", "讨", "攻", "围困", "厮杀", "大破", "破敌", "御敌", "出战", "迎战", "对阵", "会战", "征讨", "兴兵", "统兵", "伐之", "起兵"],
        "color": "#8b5e3c",
    },
    "冤案昭雪": {
        "keywords": ["冤", "斩", "审", "案", "状", "按院", "巡按", "昭雪", "平反", "鸣冤", "诉冤", "喊冤", "翻案", "洗冤", "申冤", "含冤", "雪冤"],
        "color": "#6b7b8e",
    },
    "权谋斗争": {
        "keywords": ["篡", "夺位", "争功", "陷害", "诬", "计害", "毒计", "设谋", "谋害", "暗害", "夺权", "篡位", "谋反", "争权", "擅权", "弄权", "僭越"],
        "color": "#5e3a2e",
    },
    "爱情姻缘": {
        "keywords": ["婚", "配", "许配", "嫁", "姻缘", "订", "招亲", "成亲", "联姻", "匹配", "结亲", "完婚", "纳妾", "选妃", "许婚", "聘", "择婿", "招赘", "私订终身"],
        "color": "#c77d8b",
    },
    "家庭伦理": {
        "keywords": ["母", "子", "妻", "孝", "抚养", "教子", "慈", "婆媳", "姑嫂", "妯娌", "后娘", "前房", "继母", "教养", "训子", "寻子", "弃子", "认子", "骨肉"],
        "color": "#96544d",
    },
    "神话灵异": {
        "keywords": ["仙", "妖", "神", "鬼", "龙王", "托梦", "显圣", "下凡", "降妖", "除怪", "天兵", "阴曹", "地府", "天庭", "妖魔", "狐", "精怪", "变身", "法术"],
        "color": "#7f968d",
    },
    "侠义江湖": {
        "keywords": ["侠", "盗", "劫", "救", "打抱不平", "劫富", "好汉", "绿林", "豪杰", "聚义", "济贫", "扶危", "除霸", "行侠", "仗义", "替天行道", "劫狱", "杀富"],
        "color": "#5e6b76",
    },
    "智谋韬略": {
        "keywords": ["计", "谋", "诈", "智取", "用计", "定计", "献计", "妙计", "巧计", "奇计", "设伏", "火攻", "诱敌", "诈降", "离间", "反问", "设局", "锦囊", "暗度陈仓"],
        "color": "#c4a56e",
    },
    "科举功名": {
        "keywords": ["科", "举", "状元", "进士", "及第", "中举", "功名", "赶考", "赴试", "应试", "登第", "探花", "榜眼", "会试", "殿试", "求取功名", "科举"],
        "color": "#d4c4a8",
    },
    "宫廷朝堂": {
        "keywords": ["帝", "王", "殿", "宫", "驾", "朝", "奏", "谏", "金殿", "上朝", "面圣", "见驾", "龙颜", "陛下", "娘娘", "万岁", "皇", "文武百官", "宣召", "临朝"],
        "color": "#8b7355",
    },
    "生死离别": {
        "keywords": ["死", "亡", "丧", "亡故", "病故", "身故", "逝世", "永别", "泣别", "诀别", "离别", "托孤", "遗命", "遗嘱", "自刎", "自尽", "殉情", "亡命", "投井", "投河"],
        "color": "#4a6b7a",
    },
}


def extract_themes(plot_text: str) -> dict:
    """从情节文本提取 12 维主题向量"""
    themes = {}
    for theme_name, config in THEME_TAXONOMY.items():
        score = 0
        matched = []
        for kw in config["keywords"]:
            count = plot_text.count(kw)
            if count > 0:
                # 权重: 长的关键词更精准
                score += count * len(kw)
                matched.append(kw)
        themes[theme_name] = {
            "score": score,
            "present": score > 0,
            "matched_keywords": matched[:5],  # 最多保留 5 个
        }
    return themes


def main():
    print("=" * 60)
    print("Task 3 Phase 1: 批量主题提取")
    print("=" * 60)

    # 加载剧目类型
    genre_map = {}
    if os.path.exists(GENRE_PATH):
        with open(GENRE_PATH, encoding='utf-8') as f:
            for item in json.load(f):
                genre_map[item['name']] = item['剧目类型']

    # 收集 JSON
    all_jsons = []
    for folder_name in sorted(os.listdir(BASE_DIR)):
        folder_path = os.path.join(BASE_DIR, folder_name)
        if os.path.isdir(folder_path):
            for fname in os.listdir(folder_path):
                if fname.endswith('.json'):
                    all_jsons.append(os.path.join(folder_path, fname))

    print(f"共 {len(all_jsons)} 个 JSON")

    results = []
    errors = []
    theme_type_stats = defaultdict(lambda: defaultdict(float))
    theme_cooccur = Counter()

    for jpath in tqdm(all_jsons, desc="提取主题", unit="本"):
        try:
            with open(jpath, encoding='utf-8') as f:
                data = json.load(f)

            title = data.get('剧本名字', '')
            plot = data.get('情节', '')
            dialogue = data.get('正文对话', '')
            source_folder = data.get('source_folder', '')
            entity_id = os.path.basename(jpath).replace('.json', '')

            # 来源分类
            if source_folder.startswith('709'):
                source_cat = '昆曲剧本选'
            elif source_folder.startswith('708'):
                source_cat = '现代剧作家本'
            elif source_folder.startswith('70'):
                source_cat = '名家演出本'
            elif source_folder in ('01000000','02000000','10000000','13000000','14000000','15000000'):
                source_cat = '民国汇编本'
            elif source_folder in ('80000000','90000000','94000000'):
                source_cat = '录音藏本及其他'
            else:
                source_cat = '新中国整理本'

            genre = genre_map.get(title, '')

            themes = extract_themes(plot)

            # 主题向量
            theme_vector = {t: themes[t]["score"] for t in THEME_TAXONOMY}
            theme_present = {t: themes[t]["present"] for t in THEME_TAXONOMY}
            total_score = sum(theme_vector.values())

            # 归一化
            if total_score > 0:
                theme_norm = {t: round(v / total_score, 4) for t, v in theme_vector.items()}
            else:
                theme_norm = {t: 0 for t in THEME_TAXONOMY}

            # 主题数
            active_theme_count = sum(theme_present.values())

            # 主题关键词
            all_keywords = {}
            for t, info in themes.items():
                if info["present"]:
                    all_keywords[t] = info["matched_keywords"]

            record = {
                'entity_id': entity_id,
                'title': title,
                'genre': genre,
                'source_category': source_cat,
                'source_folder': source_folder,
                'plot_summary': plot[:200],
                'theme_vector': theme_vector,
                'theme_norm': theme_norm,
                'theme_present': theme_present,
                'active_theme_count': active_theme_count,
                'matched_keywords': all_keywords,
                'total_score': total_score,
            }
            results.append(record)

            # 类型统计
            if genre:
                for t in THEME_TAXONOMY:
                    if theme_present[t]:
                        theme_type_stats[genre][t] += 1

            # 共现
            active = [t for t in THEME_TAXONOMY if theme_present[t]]
            for i in range(len(active)):
                for j in range(i + 1, len(active)):
                    theme_cooccur[(active[i], active[j])] += 1

        except Exception as e:
            errors.append({'file': jpath, 'error': str(e)})

    # 按类型计算主题占比
    type_theme_ratio = {}
    for genre, theme_counts in theme_type_stats.items():
        type_scripts = sum(1 for r in results if r['genre'] == genre)
        type_theme_ratio[genre] = {
            t: round(theme_counts[t] / type_scripts, 4) if type_scripts > 0 else 0
            for t in THEME_TAXONOMY
        }

    # 主题总体统计
    theme_overall = {}
    for t in THEME_TAXONOMY:
        count = sum(1 for r in results if r['theme_present'][t])
        theme_overall[t] = {
            'script_count': count,
            'pct': round(count / len(results) * 100, 1),
            'avg_score': round(np.mean([r['theme_vector'][t] for r in results]), 2),
        }

    # 保存
    output = {
        'total': len(results),
        'errors': errors,
        'theme_taxonomy': {t: {'keywords': c['keywords'], 'color': c['color']} for t, c in THEME_TAXONOMY.items()},
        'theme_overall': theme_overall,
        'type_theme_ratio': type_theme_ratio,
        'theme_cooccur_top': [{'pair': list(p), 'count': c} for p, c in theme_cooccur.most_common(20)],
        'scripts': results,
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完成! 成功: {len(results)}, 失败: {len(errors)}")
    print(f"输出: {OUTPUT_PATH}")

    # 概要
    print("\n===== 主题分布概要 =====")
    for t, stats in sorted(theme_overall.items(), key=lambda x: x[1]['script_count'], reverse=True):
        print(f"  {t}: {stats['script_count']} 本 ({stats['pct']}%), 均分={stats['avg_score']}")

    print(f"\n平均主题数: {np.mean([r['active_theme_count'] for r in results]):.1f}")


if __name__ == '__main__':
    main()
