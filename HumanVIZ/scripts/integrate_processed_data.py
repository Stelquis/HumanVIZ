#!/usr/bin/env python3
"""
integrate_processed_data.py — 将已处理的主题/网络数据注入 opera-samples.json

从以下来源提取并集成:
  - p3_themes.json (12维主题向量 + 关键词匹配)
  - p2_networks.json (角色共现网络 + 度中心性)

输出: 进一步增强的 opera-samples.json
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

PROJECT_ROOT = Path(__file__).parent.parent
SAMPLES_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.json"
THEMES_FILE = PROJECT_ROOT / "data" / "processed" / "p3_themes.json"
NETWORKS_FILE = PROJECT_ROOT / "data" / "processed" / "p2_networks.json"
BACKUP_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.backup2.json"


def load_json(path: Path) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_theme_lookup(themes_data: dict) -> Dict[str, dict]:
    """构建 entity_id → theme data 的映射"""
    lookup = {}
    for script in themes_data.get('scripts', []):
        eid = script.get('entity_id', '')
        if eid:
            lookup[eid] = script
    print(f"  📊 主题数据: {len(lookup)} 部剧本")
    return lookup


def build_network_lookup(networks_data: dict) -> Dict[str, dict]:
    """构建 entity_id → network data 的映射"""
    lookup = {}
    for net in networks_data.get('networks', []):
        eid = net.get('entity_id', '')
        if eid:
            lookup[eid] = net
    print(f"  📊 网络数据: {len(lookup)} 部剧本")
    return lookup


def integrate(opera_key: str, opera: dict, theme_lookup: dict, network_lookup: dict) -> dict:
    """将主题和网络数据注入单部剧本"""

    # 生成 entity_id（匹配规则: source_file 去掉 .json 后缀）
    source_file = opera.get('source_file', '')
    entity_id = source_file.replace('.json', '')

    # ── 1. 注入主题数据 ──
    theme_data = theme_lookup.get(entity_id)
    if theme_data:
        opera['theme'] = {
            'vector': theme_data.get('theme_vector', {}),
            'norm': theme_data.get('theme_norm', {}),
            'present': theme_data.get('theme_present', {}),
            'active_count': theme_data.get('active_theme_count', 0),
            'matched_keywords': theme_data.get('matched_keywords', {}),
            'total_score': theme_data.get('total_score', 0),
            'primary_themes': _get_primary_themes(theme_data),
        }
        opera['genre'] = opera.get('genre') or theme_data.get('genre', '')
        opera['source_category'] = opera.get('source_category') or theme_data.get('source_category', '')

    # ── 2. 注入角色网络数据 ──
    network_data = network_lookup.get(entity_id)
    if network_data:
        opera['character_network'] = {
            'nodes': network_data.get('nodes', []),
            'edges': network_data.get('edges', []),
        }

        # 将网络度中心性注入角色元数据
        _inject_centrality(opera, network_data)

    return opera


def _get_primary_themes(theme_data: dict) -> List[Dict[str, Any]]:
    """提取前3个主要主题"""
    norm = theme_data.get('theme_norm', {})
    present = theme_data.get('theme_present', {})
    keywords = theme_data.get('matched_keywords', {})

    sorted_themes = sorted(norm.items(), key=lambda x: x[1], reverse=True)
    primary = []
    for name, score in sorted_themes[:3]:
        if score > 0:
            primary.append({
                'name': name,
                'score': round(score, 4),
                'is_present': present.get(name, False),
                'matched_words': keywords.get(name, []),
            })
    return primary


def _inject_centrality(opera: dict, network_data: dict):
    """将网络中心性数据注入到角色定义中"""
    nodes = {n['name']: n for n in network_data.get('nodes', [])}

    for char in opera.get('characters', []):
        char_name = char.get('character', '')
        node = nodes.get(char_name)
        if node:
            char['network_degree'] = node.get('degree', 0)
            char['network_scene_count'] = node.get('scene_count', 0)

    # 也为 scenes.characters 补充网络信息
    for scene in opera.get('scenes', []):
        for char in scene.get('characters', []):
            char_name = char.get('name', '')
            node = nodes.get(char_name)
            if node:
                char['network_degree'] = node.get('degree', 0)


def main():
    print("🔗 集成已处理的主题与网络数据")
    print()

    # 加载
    samples = load_json(SAMPLES_FILE)
    operas = {k: v for k, v in samples.items() if isinstance(v, dict)}

    themes_data = load_json(THEMES_FILE)
    networks_data = load_json(NETWORKS_FILE)

    # 构建查找表
    theme_lookup = build_theme_lookup(themes_data)
    network_lookup = build_network_lookup(networks_data)

    # 集成
    enriched = 0
    theme_hits = 0
    network_hits = 0

    for key, opera in operas.items():
        result = integrate(key, opera, theme_lookup, network_lookup)
        operas[key] = result

        has_theme = 'theme' in result
        has_network = 'character_network' in result

        if has_theme:
            theme_hits += 1
        if has_network:
            network_hits += 1

        if has_theme or has_network:
            enriched += 1

        primary = result.get('theme', {}).get('primary_themes', [])
        theme_str = ', '.join(t['name'] for t in primary) if primary else '无'
        net_nodes = len(result.get('character_network', {}).get('nodes', []))
        print(f"  {'✅' if has_theme or has_network else '⚠️'} {result.get('title', key)}: "
              f"主题=[{theme_str}] 网络={net_nodes}节点")

    # 重组并写入
    output = {k: v for k, v in samples.items() if not isinstance(v, dict)}
    output.update(operas)

    import shutil
    shutil.copy2(SAMPLES_FILE, BACKUP_FILE)
    print(f"\n💾 备份: {BACKUP_FILE}")

    with open(SAMPLES_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"💾 写入: {SAMPLES_FILE}")
    print(f"\n📊 集成统计:")
    print(f"   剧本总数: {len(operas)}")
    print(f"   主题命中: {theme_hits}/{len(operas)}")
    print(f"   网络命中: {network_hits}/{len(operas)}")
    print(f"   至少一项命中: {enriched}/{len(operas)}")

    # 验证
    verify(output)


def verify(data: dict):
    """验证集成后的数据"""
    operas = {k: v for k, v in data.items() if isinstance(v, dict)}
    print(f"\n🔍 验证:")

    fields = set()
    for opera in operas.values():
        fields.update(opera.keys())

    new_fields = ['theme', 'character_network', 'genre', 'source_category']
    for f in new_fields:
        count = sum(1 for o in operas.values() if f in o)
        print(f"  opera.{f}: {count}/{len(operas)} 部剧本")

    # 角色字段检查
    char_fields = set()
    for opera in operas.values():
        for char in opera.get('characters', []):
            char_fields.update(char.keys())
    net_char_fields = ['network_degree', 'network_scene_count']
    for f in net_char_fields:
        count = sum(1 for o in operas.values()
                    for c in o.get('characters', []) if f in c)
        total = sum(len(o.get('characters', [])) for o in operas.values())
        print(f"  char.{f}: {count}/{total} 角色")


if __name__ == "__main__":
    main()
