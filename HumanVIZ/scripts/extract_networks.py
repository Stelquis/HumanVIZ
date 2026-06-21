"""
批量角色共现网络提取
从全部 1473 本剧本的 JSON 中提取场景级角色共现关系，构建网络并计算基础指标

输出: /workspace/HumanVIZ/data/processed/p2_networks.json
"""

import json
import os
import re
from collections import Counter, defaultdict
import numpy as np
from tqdm import tqdm

BASE_DIR = "/workspace/HumanVIZ/data/raw/dataSet"
GENRE_PATH = "/workspace/HumanVIZ/data/processed/db_exports/剧目类型.json"
OUTPUT_PATH = "/workspace/HumanVIZ/data/processed/p2_networks.json"

# 场景边界
SCENE_RE = re.compile(r'【[^】]*(?:场|折|幕|本|出)[^】]*】')
# 角色行
CHAR_LINE_RE = re.compile(r'^([\u4e00-\u9fa5]{2,4})\s+（', re.MULTILINE)


def build_network(dialogue: str) -> dict:
    """从正文对话构建角色共现网络"""
    # 场景切分
    parts = SCENE_RE.split(dialogue)
    # 跳过正文前的元数据
    scene_texts = []
    started = False
    for p in parts:
        p = p.strip()
        if p and (started or len(scene_texts) == 0):
            scene_texts.append(p)
            started = True

    if not scene_texts:
        # 无场景标记，整本为一个场景
        scene_texts = [dialogue]

    # 每场提取角色
    char_sets = []
    all_chars = set()
    for st in scene_texts:
        chars = set(CHAR_LINE_RE.findall(st))
        if chars:
            char_sets.append(chars)
            all_chars.update(chars)

    if not char_sets:
        return {
            'nodes': [], 'edges': [],
            'total_scenes': 0, 'total_characters': 0,
            'total_edges': 0, 'density': 0,
        }

    # 构建共现边 (同场任意两角色)
    edge_weights = Counter()
    for chars in char_sets:
        chars_list = sorted(chars)
        for i in range(len(chars_list)):
            for j in range(i + 1, len(chars_list)):
                edge = (chars_list[i], chars_list[j])
                edge_weights[edge] += 1

    # 计算度中心性 (基于加权共现)
    degree = Counter()
    for (a, b), w in edge_weights.items():
        degree[a] += w
        degree[b] += w

    n = len(all_chars)
    m = len(edge_weights)
    max_possible = n * (n - 1) / 2 if n > 1 else 1
    density = m / max_possible

    # 构建边列表
    edges = []
    for (a, b), w in edge_weights.items():
        edges.append({
            'source': a,
            'target': b,
            'weight': w,
            'scenes': w,  # 共现场次数
        })

    # 节点列表
    nodes = []
    for char in sorted(all_chars):
        nodes.append({
            'name': char,
            'degree': degree.get(char, 0),
            'scene_count': sum(1 for cs in char_sets if char in cs),
        })

    return {
        'nodes': nodes,
        'edges': edges,
        'total_scenes': len(scene_texts),
        'total_characters': n,
        'total_edges': m,
        'density': round(density, 6),
        'max_weight': max(edge_weights.values()) if edge_weights else 0,
    }


def main():
    print("=" * 60)
    print("批量角色共现网络提取")
    print("=" * 60)

    # 加载剧目类型映射
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

    # 批量处理
    results = []
    errors = []
    # 类型统计
    type_stats = defaultdict(lambda: {'count': 0, 'total_chars': 0, 'total_edges': 0})

    for jpath in tqdm(all_jsons, desc="构建共现网络", unit="本"):
        try:
            with open(jpath, encoding='utf-8') as f:
                data = json.load(f)

            title = data.get('剧本名字', '')
            dialogue = data.get('正文对话', '')
            source_folder = data.get('source_folder', '')
            source_name = data.get('source_folder_name', '')
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

            net = build_network(dialogue)

            record = {
                'entity_id': entity_id,
                'title': title,
                'genre': genre,
                'source_folder': source_folder,
                'source_name': source_name,
                'source_category': source_cat,
                **net,
            }
            results.append(record)

            if genre:
                type_stats[genre]['count'] += 1
                type_stats[genre]['total_chars'] += net['total_characters']
                type_stats[genre]['total_edges'] += net['total_edges']

        except Exception as e:
            errors.append({'file': jpath, 'error': str(e)})

    # 保存
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(results),
            'errors': errors,
            'networks': results,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n完成! 成功: {len(results)}, 失败: {len(errors)}")
    print(f"输出: {OUTPUT_PATH}")

    # 概要统计
    print("\n===== 网络提取概要 =====")
    scenes_list = [r['total_scenes'] for r in results]
    chars_list = [r['total_characters'] for r in results]
    edges_list = [r['total_edges'] for r in results]
    density_list = [r['density'] for r in results]

    print(f"场景数: mean={np.mean(scenes_list):.1f}, median={np.median(scenes_list):.0f}")
    print(f"角色数: mean={np.mean(chars_list):.1f}, median={np.median(chars_list):.0f}, "
          f"min={min(chars_list)}, max={max(chars_list)}")
    print(f"边数:   mean={np.mean(edges_list):.1f}, median={np.median(edges_list):.0f}")
    print(f"密度:   mean={np.mean(density_list):.4f}, median={np.median(density_list):.4f}")
    print(f"无角色: {sum(1 for c in chars_list if c == 0)} 本")
    print(f"无共现: {sum(1 for e in edges_list if e == 0)} 本")

    # 按类型的平均网络规模
    print("\n===== 按剧目类型 =====")
    for genre in sorted(type_stats.keys()):
        s = type_stats[genre]
        avg_chars = s['total_chars'] / s['count']
        avg_edges = s['total_edges'] / s['count']
        print(f"  {genre}: {s['count']}本, avg_chars={avg_chars:.1f}, avg_edges={avg_edges:.1f}")


if __name__ == '__main__':
    main()
