#!/usr/bin/env python3
"""
Task 2 Step 3: 批量角色关系提取（LLM 增强版）

步骤 3.0 — 数据准备与探查
  - 读取已有数据：剧目类型.json、同场共现.json.gz、对话解析.json.gz、角色别名映射.json.gz
  - 构建统一输入数据结构：每个剧本一个对象，包含剧名、剧目类型、角色列表、
    正文对话、情节、同场共现边列表（角色名已标准化）
  - 使用别名映射对共现边中的角色名做标准化
  - 统计并打印数据摘要

后续步骤（3.1+）将在本文件中扩展。

产出: /workspace/HumanVIZ/scripts/batch_extract_relations.py
"""

import argparse
import gzip
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────
# 路径常量
# ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_EXPORTS_DIR = DATA_DIR / "db_exports"

GENRE_PATH = DB_EXPORTS_DIR / "剧目类型.json"
DIALOGUE_PATH = DB_EXPORTS_DIR / "对话解析.json.gz"
ALIAS_PATH = DB_EXPORTS_DIR / "角色别名映射.json.gz"
COOCCUR_PATH = DB_EXPORTS_DIR / "同场共现.json.gz"

# 输出路径（后续步骤使用）
OUTPUT_DIR = DATA_DIR / "task2_relations"
OUTPUT_PATH = OUTPUT_DIR / "relations_extracted.json.gz"

# 步骤 3.2 路径
CHECKPOINT_PATH = OUTPUT_DIR / "extraction_checkpoint.json"
BATCH_OUTPUT_PATH = OUTPUT_DIR / "relations_batch_results.json.gz"


# ──────────────────────────────────────────────────────────────────────
# 数据加载
# ──────────────────────────────────────────────────────────────────────

def load_json(path: str) -> list | dict:
    """加载普通 JSON 文件"""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_json_gz(path: str) -> list | dict:
    """加载 gzip 压缩的 JSON 文件"""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load_all_data() -> dict:
    """
    加载全部 4 个数据文件，返回按 entity_id 索引的字典。

    Returns:
        {
            "genres":      {entity_id: {"name": str, "剧目类型": str}},
            "dialogues":   {entity_id: {"name": str, "对话解析": dict}},
            "aliases":     {entity_id: {"name": str, "角色别名映射": dict}},
            "cooccurs":    {entity_id: {"name": str, "同场共现": dict}},
        }
    """
    print("📂 加载数据文件...")

    # 1. 剧目类型
    genre_list = load_json(str(GENRE_PATH))
    genres = {g["entity_id"]: g for g in genre_list}
    print(f"   ✅ 剧目类型.json: {len(genres)} 条")

    # 2. 对话解析
    dialogue_list = load_json_gz(str(DIALOGUE_PATH))
    dialogues = {d["entity_id"]: d for d in dialogue_list}
    print(f"   ✅ 对话解析.json.gz: {len(dialogues)} 条")

    # 3. 角色别名映射
    alias_list = load_json_gz(str(ALIAS_PATH))
    aliases = {a["entity_id"]: a for a in alias_list}
    print(f"   ✅ 角色别名映射.json.gz: {len(aliases)} 条")

    # 4. 同场共现
    cooccur_list = load_json_gz(str(COOCCUR_PATH))
    cooccurs = {c["entity_id"]: c for c in cooccur_list}
    print(f"   ✅ 同场共现.json.gz: {len(cooccurs)} 条")

    return {
        "genres": genres,
        "dialogues": dialogues,
        "aliases": aliases,
        "cooccurs": cooccurs,
    }


# ──────────────────────────────────────────────────────────────────────
# 角色名标准化
# ──────────────────────────────────────────────────────────────────────

def standardize_name(name: str, alias_map: dict) -> str:
    """
    将角色名标准化为规范名。

    Args:
        name: 原始角色名
        alias_map: 别名映射字典 {别名: 标准名}

    Returns:
        标准化后的角色名（如无映射则返回原名）
    """
    return alias_map.get(name, name)


def standardize_edge_names(edge: dict, alias_map: dict) -> dict:
    """
    标准化共现边中的 character_a 和 character_b。

    Args:
        edge: 共现边字典 {"character_a": str, "character_b": str, ...}
        alias_map: 别名映射字典

    Returns:
        新的边字典，角色名已标准化
    """
    return {
        **edge,
        "character_a": standardize_name(edge["character_a"], alias_map),
        "character_b": standardize_name(edge["character_b"], alias_map),
    }


# ──────────────────────────────────────────────────────────────────────
# 统一数据结构构建
# ──────────────────────────────────────────────────────────────────────

def build_unified_play_data(data: dict) -> list[dict]:
    """
    构建统一的输入数据结构，每个剧本一个对象。

    只保留在四个数据源中都有对应记录的剧本（交集）。
    使用别名映射对共现边中的角色名做标准化。

    Args:
        data: load_all_data() 的返回值

    Returns:
        [
            {
                "entity_id": int,
                "剧本名": str,
                "剧目类型": str,
                "角色列表": [str],          # 标准名列表（来自消歧后角色字典）
                "角色字典": {str: dict},     # 标准名 -> 角色详情
                "对话统计": dict,            # 角色统计 + 场景角色
                "共现边列表": [dict],        # 角色名已标准化的共现边
                "网络摘要": dict,            # 共现网络摘要
            },
            ...
        ]
    """
    genres = data["genres"]
    dialogues = data["dialogues"]
    aliases = data["aliases"]
    cooccurs = data["cooccurs"]

    # 取四个数据源的 entity_id 交集
    common_ids = (
        set(genres.keys())
        & set(dialogues.keys())
        & set(aliases.keys())
        & set(cooccurs.keys())
    )
    print(f"\n🔗 四源交集剧本数: {len(common_ids)}")

    plays = []
    for eid in sorted(common_ids):
        genre_info = genres[eid]
        dialogue_info = dialogues[eid]
        alias_info = aliases[eid]
        cooccur_info = cooccurs[eid]

        # 提取别名映射
        alias_map = alias_info["角色别名映射"]["别名映射"]  # {别名: 标准名}

        # 角色字典（标准名 -> 详情）
        char_dict = alias_info["角色别名映射"]["消歧后角色字典"]

        # 角色列表（标准名，排除 crowd 角色）
        char_list = [
            name for name, info in char_dict.items()
            if not info.get("is_crowd", False)
        ]

        # 标准化共现边中的角色名
        raw_edges = cooccur_info["同场共现"]["共现边列表"]
        std_edges = [standardize_edge_names(e, alias_map) for e in raw_edges]

        # 去重：标准化后可能出现 A-B 和 B-A 重复（或 A-A 自环）
        # 保留 count 较大的那条
        edge_dict = {}
        for e in std_edges:
            a, b = e["character_a"], e["character_b"]
            if a == b:
                continue  # 跳过自环
            key = tuple(sorted([a, b]))
            if key not in edge_dict or e["count"] > edge_dict[key]["count"]:
                edge_dict[key] = e
        deduped_edges = list(edge_dict.values())

        plays.append({
            "entity_id": eid,
            "剧本名": genre_info["name"],
            "剧目类型": genre_info["剧目类型"],
            "角色列表": char_list,
            "角色字典": char_dict,
            "对话统计": {
                "角色统计": dialogue_info["对话解析"]["角色统计"],
                "场景角色": dialogue_info["对话解析"]["场景角色"],
                "对话行数": dialogue_info["对话解析"]["对话行数"],
                "角色数": dialogue_info["对话解析"]["角色数"],
                "场次数": dialogue_info["对话解析"]["场次数"],
            },
            "共现边列表": deduped_edges,
            "网络摘要": cooccur_info["同场共现"]["网络摘要"],
        })

    return plays


# ──────────────────────────────────────────────────────────────────────
# 数据摘要统计
# ──────────────────────────────────────────────────────────────────────

def print_data_summary(plays: list[dict]) -> None:
    """打印数据摘要统计信息"""
    print("\n" + "=" * 60)
    print("📊 数据摘要")
    print("=" * 60)

    # 基本统计
    total_plays = len(plays)
    total_chars = sum(len(p["角色列表"]) for p in plays)
    total_edges = sum(len(p["共现边列表"]) for p in plays)
    total_dialogues = sum(p["对话统计"]["对话行数"] for p in plays)

    print(f"\n  剧本总数:         {total_plays}")
    print(f"  角色总数（含重复）: {total_chars}")
    print(f"  共现边总数:        {total_edges}")
    print(f"  对话总行数:        {total_dialogues}")

    # 每剧本平均值
    print(f"\n  每剧本平均角色数:  {total_chars / total_plays:.1f}")
    print(f"  每剧本平均边数:    {total_edges / total_plays:.1f}")
    print(f"  每剧本平均对话行数: {total_dialogues / total_plays:.1f}")

    # 剧目类型分布
    print(f"\n  📂 剧目类型分布:")
    genre_counter = Counter(p["剧目类型"] for p in plays)
    for genre, count in genre_counter.most_common():
        pct = count / total_plays * 100
        bar = "█" * int(pct / 2)
        print(f"     {genre:8s}  {count:5d} ({pct:5.1f}%)  {bar}")

    # 角色名标准化统计
    print(f"\n  🔤 角色名标准化效果:")
    # 统计有多少共现边的角色名被标准化（即原名 != 标准名）
    # 这需要回查原始数据，这里用一个近似方法
    unique_chars = set()
    for p in plays:
        unique_chars.update(p["角色列表"])
    print(f"     去重后全局角色数: {len(unique_chars)}")

    # 边权重分布
    print(f"\n  📈 共现边权重分布:")
    all_weights = [e["count"] for p in plays for e in p["共现边列表"]]
    weight_counter = Counter(all_weights)
    for w in sorted(weight_counter.keys()):
        cnt = weight_counter[w]
        print(f"     weight={w}:  {cnt:6d} 条边 ({cnt / len(all_weights) * 100:.1f}%)")

    # 规模分布
    print(f"\n  📏 剧本规模分布（按角色数）:")
    size_buckets = {"小型(≤5角色)": 0, "中型(6-15)": 0, "大型(16-30)": 0, "超大型(>30)": 0}
    for p in plays:
        n = len(p["角色列表"])
        if n <= 5:
            size_buckets["小型(≤5角色)"] += 1
        elif n <= 15:
            size_buckets["中型(6-15)"] += 1
        elif n <= 30:
            size_buckets["大型(16-30)"] += 1
        else:
            size_buckets["超大型(>30)"] += 1
    for label, cnt in size_buckets.items():
        pct = cnt / total_plays * 100
        print(f"     {label:16s}  {cnt:5d} ({pct:5.1f}%)")

    # Top 10 最多共现边的剧本
    print(f"\n  🏆 共现边最多的 Top 10 剧本:")
    sorted_plays = sorted(plays, key=lambda p: len(p["共现边列表"]), reverse=True)
    for i, p in enumerate(sorted_plays[:10], 1):
        print(f"     {i:2d}. {p['剧本名'][:30]:30s}  [{p['剧目类型']}]  "
              f"{len(p['角色列表'])}角色  {len(p['共现边列表'])}边")

    print("\n" + "=" * 60)


# ──────────────────────────────────────────────────────────────────────
# 数据质量检查
# ──────────────────────────────────────────────────────────────────────

def check_data_quality(plays: list[dict]) -> list[str]:
    """
    检查数据质量，返回警告列表。

    检查项：
    1. 共现边中是否有角色不在角色列表中（可能是标准化后的新名）
    2. 是否有空角色列表的剧本
    3. 是否有零共现边的剧本
    """
    warnings = []

    empty_chars = 0
    empty_edges = 0
    missing_chars = 0

    for p in plays:
        if not p["角色列表"]:
            empty_chars += 1
        if not p["共现边列表"]:
            empty_edges += 1

        # 检查共现边中的角色是否都在角色列表中
        char_set = set(p["角色列表"])
        for e in p["共现边列表"]:
            if e["character_a"] not in char_set:
                missing_chars += 1
            if e["character_b"] not in char_set:
                missing_chars += 1

    if empty_chars > 0:
        warnings.append(f"⚠️  {empty_chars} 个剧本角色列表为空")
    if empty_edges > 0:
        warnings.append(f"⚠️  {empty_edges} 个剧本共现边为空（可能是独角戏或数据缺失）")
    if missing_chars > 0:
        warnings.append(f"⚠️  {missing_chars} 条边的角色不在角色列表中（可能需要补充角色字典）")

    if not warnings:
        warnings.append("✅ 数据质量检查通过")

    return warnings


# ──────────────────────────────────────────────────────────────────────
# 示例数据展示
# ──────────────────────────────────────────────────────────────────────

def show_sample_plays(plays: list[dict], n: int = 3) -> None:
    """展示几个样本剧本的详细信息"""
    print(f"\n📋 样本数据（前 {n} 个剧本）:")
    print("-" * 60)

    for i, p in enumerate(plays[:n], 1):
        print(f"\n  [{i}] {p['剧本名']}")
        print(f"      entity_id: {p['entity_id']}")
        print(f"      剧目类型: {p['剧目类型']}")
        print(f"      角色数: {len(p['角色列表'])}  — {p['角色列表'][:8]}{'...' if len(p['角色列表']) > 8 else ''}")
        print(f"      共现边数: {len(p['共现边列表'])}")
        if p["共现边列表"]:
            e0 = p["共现边列表"][0]
            print(f"      首条边: {e0['character_a']} ↔ {e0['character_b']}  "
                  f"(count={e0['count']}, weight={e0['weight']})")
        print(f"      对话行数: {p['对话统计']['对话行数']}")
        print(f"      场次数: {p['对话统计']['场次数']}")


# ──────────────────────────────────────────────────────────────────────
# 持久化
# ──────────────────────────────────────────────────────────────────────

def save_unified_data(plays: list[dict], output_path: Path = OUTPUT_PATH) -> None:
    """
    将统一数据结构保存为 gzip JSON。

    保存为 .json.gz 格式，与项目中其他大数据文件一致。
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(str(output_path), "wt", encoding="utf-8") as f:
        json.dump(plays, f, ensure_ascii=False, indent=None)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n💾 已保存统一数据到: {output_path} ({size_mb:.2f} MB)")


# ──────────────────────────────────────────────────────────────────────
# 主函数
# ──────────────────────────────────────────────────────────────────────

# 注意: main() 和 __name__ 定义已移至文件末尾（支持步骤 3.0/3.2 路由）


# ══════════════════════════════════════════════════════════════════════════
# 步骤 3.1: 测试关系提取 V2 Prompt
# ══════════════════════════════════════════════════════════════════════════

class MIMOClient:
    """
    基于 requests 的 MIMO API 客户端。

    兼容 langchain 的 invoke() 接口，返回带 .content 属性的对象。
    """

    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def invoke(self, prompt: str):
        """调用 MIMO API，返回带 content 属性的对象"""
        import requests

        url = f"{self.base_url}/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        data = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }

        response = requests.post(url, headers=headers, json=data, timeout=300)
        response.raise_for_status()

        result = response.json()
        # 提取文本内容（跳过 thinking 块）
        content = ""
        for block in result.get("content", []):
            if block.get("type") == "text":
                content += block.get("text", "")

        # 返回带 content 属性的对象（兼容 langchain 接口）
        return type("LLMResponse", (), {"content": content})()


class DeepSeekClient:
    """
    基于 requests 的 DeepSeek API 客户端（OpenAI 兼容格式）。

    兼容 langchain 的 invoke() 接口，返回带 .content 属性的对象。
    """

    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def invoke(self, prompt: str):
        """调用 DeepSeek API，返回带 content 属性的对象"""
        import requests

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        data = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 8192,
            "temperature": 0.1,
            "stream": False,
        }

        response = requests.post(url, headers=headers, json=data, timeout=300)
        response.raise_for_status()

        result = response.json()
        # OpenAI 格式: choices[0].message.content
        message = result["choices"][0]["message"]
        content = message.get("content") or ""

        # DeepSeek thinking 模式可能把内容放在 reasoning_content
        if not content.strip() and message.get("reasoning_content"):
            content = message["reasoning_content"]

        if not content.strip():
            raise ValueError(f"API 返回空内容: {json.dumps(result, ensure_ascii=False)[:500]}")

        # 返回带 content 属性的对象（兼容 langchain 接口）
        return type("LLMResponse", (), {"content": content})()


def get_llm():
    """获取 LLM 实例（根据 provider 自动选择客户端）"""
    # 从 secrets.json 加载配置
    secrets_path = PROJECT_ROOT / "secrets.json"
    if not secrets_path.exists():
        raise FileNotFoundError(f"配置文件不存在: {secrets_path}")

    with open(secrets_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    api_key = config.get("api_key")
    base_url = config.get("base_url")
    model = config.get("model")
    provider = config.get("provider", "mimo")

    if not api_key:
        raise ValueError("API key 未配置")

    if provider == "deepseek":
        base_url = base_url or "https://api.deepseek.com"
        model = model or "deepseek-v4-flash"
        print(f"✅ LLM 初始化 [DeepSeek]: {model} @ {base_url}")
        return DeepSeekClient(api_key, base_url, model)
    else:
        base_url = base_url or "https://token-plan-cn.xiaomimimo.com/anthropic"
        model = model or "mimo-v2.5-pro"
        print(f"✅ LLM 初始化 [MIMO]: {model} @ {base_url}")
        return MIMOClient(api_key, base_url, model)


def find_sample_plays(plays: list[dict]) -> dict[str, dict]:
    """
    找到用于测试的典型剧本。

    选择标准：
    - 空城计：历史戏，角色少、边多，适合测试敌对阵营关系
    - 铡美案：公案戏，适合测试官民、冤仇关系

    Returns:
        {"历史戏": play, "公案戏": play}
    """
    samples = {}

    for p in plays:
        name = p["剧本名"]
        genre = p["剧目类型"]

        # 空城计
        if "空城计" in name and genre == "历史戏":
            samples["历史戏_空城计"] = p

        # 铡美案
        if "铡美案" in name or "秦香莲" in name:
            if genre == "公案戏":
                samples["公案戏_铡美案"] = p

        # 三娘教子（家庭戏）
        if "三娘教子" in name and genre == "家庭戏":
            samples["家庭戏_三娘教子"] = p

    # 如果没找到铡美案，找一个公案戏替代
    if "公案戏_铡美案" not in samples:
        for p in plays:
            if p["剧目类型"] == "公案戏" and len(p["共现边列表"]) >= 4:
                samples["公案戏_替代"] = p
                break

    return samples


def test_relation_extraction_v2(play_data: dict, llm=None) -> dict:
    """
    对单个剧本测试 V2 关系提取 prompt。

    Args:
        play_data: 统一数据结构中的单个剧本对象
        llm: LLM 实例（可选，如不提供则自动获取）

    Returns:
        测试结果字典，包含 LLM 输出和元信息
    """
    import time

    # 动态导入 prompts_opera 模块
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))
    from services.prompts_opera import extract_character_relations_v2

    if llm is None:
        llm = get_llm()

    print(f"\n{'='*60}")
    print(f"🧪 测试剧本: {play_data['剧本名']}")
    print(f"   剧目类型: {play_data['剧目类型']}")
    print(f"   角色数: {len(play_data['角色列表'])}")
    print(f"   共现边数: {len(play_data['共现边列表'])}")
    print(f"{'='*60}")

    # 记录开始时间
    start_time = time.time()

    # 调用 LLM（带重试机制）
    max_retries = 3
    retry_delay = 10  # 秒

    for attempt in range(max_retries):
        try:
            result = extract_character_relations_v2(llm, play_data)
            elapsed = time.time() - start_time
            break
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                print(f"   ⚠️ 速率限制，等待 {retry_delay}s 后重试 ({attempt+1}/{max_retries})...")
                time.sleep(retry_delay)
                retry_delay *= 2  # 指数退避
                continue
            raise

    try:

        # 解析结果
        llm_result = result.get("result", {})

        if "parse_error" in llm_result:
            print(f"❌ JSON 解析失败: {llm_result['parse_error']}")
            print(f"   原始响应:\n{llm_result.get('raw_response', '')[:500]}")
        else:
            relations = llm_result.get("relations", [])
            print(f"\n✅ 提取成功！耗时 {elapsed:.1f}s")
            print(f"   关系数: {len(relations)}")

            # 打印关系详情
            print(f"\n   📋 提取的关系:")
            for i, rel in enumerate(relations, 1):
                print(f"   [{i}] {rel.get('source', '?')} → {rel.get('target', '?')}")
                print(f"       类型: {rel.get('macro_type', '?')} / {rel.get('micro_type', '?')}")
                print(f"       方向: {rel.get('direction', '?')}, 置信度: {rel.get('confidence', '?')}")
                evidence = rel.get('evidence', '')
                if evidence:
                    print(f"       证据: {evidence[:80]}{'...' if len(evidence) > 80 else ''}")

            # 网络摘要
            summary = llm_result.get("network_summary", "")
            if summary:
                print(f"\n   📝 网络摘要: {summary[:200]}{'...' if len(summary) > 200 else ''}")

        return {
            "entity_id": play_data["entity_id"],
            "剧本名": play_data["剧本名"],
            "剧目类型": play_data["剧目类型"],
            "elapsed_seconds": elapsed,
            "result": llm_result,
            "success": "parse_error" not in llm_result,
        }

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ 调用失败: {e}")
        return {
            "entity_id": play_data["entity_id"],
            "剧本名": play_data["剧本名"],
            "剧目类型": play_data["剧目类型"],
            "elapsed_seconds": elapsed,
            "error": str(e),
            "success": False,
        }


def test_step_3_1(num_samples: int = 2) -> None:
    """
    步骤 3.1 主函数：测试 V2 关系提取 prompt。

    Args:
        num_samples: 测试的剧本数量（默认2个）
    """
    print("=" * 60)
    print("Task 2 Step 3.1 — 测试关系提取 V2 Prompt")
    print("=" * 60)

    # 1. 加载数据
    print("\n📂 加载数据...")
    plays = load_unified_data()
    if not plays:
        print("❌ 未找到统一数据文件，请先运行步骤 3.0")
        return

    print(f"   加载了 {len(plays)} 个剧本")

    # 2. 找到典型剧本
    print("\n🔍 寻找典型测试剧本...")
    samples = find_sample_plays(plays)

    if not samples:
        print("❌ 未找到合适的测试剧本")
        return

    print(f"   找到了 {len(samples)} 个候选剧本:")
    for key, p in samples.items():
        print(f"   - {key}: {p['剧本名']} ({len(p['角色列表'])}角色, {len(p['共现边列表'])}边)")

    # 3. 获取 LLM
    print("\n🤖 初始化 LLM...")
    try:
        llm = get_llm()
        print("   ✅ LLM 加载成功")
    except Exception as e:
        print(f"   ❌ LLM 加载失败: {e}")
        return

    # 4. 逐个测试
    test_results = []
    sample_list = list(samples.values())[:num_samples]

    for idx, play in enumerate(sample_list, 1):
        print(f"\n{'─'*60}")
        print(f"  测试 {idx}/{len(sample_list)}")
        print(f"{'─'*60}")

        result = test_relation_extraction_v2(play, llm)
        test_results.append(result)

    # 5. 汇总
    print("\n" + "=" * 60)
    print("📊 测试汇总")
    print("=" * 60)

    success_count = sum(1 for r in test_results if r["success"])
    total_relations = sum(
        len(r["result"].get("relations", []))
        for r in test_results if r["success"]
    )

    print(f"\n  测试剧本数:   {len(test_results)}")
    print(f"  成功数:       {success_count}")
    print(f"  提取关系总数: {total_relations}")

    # 统计关系类型分布
    if total_relations > 0:
        macro_counter = Counter()
        micro_counter = Counter()
        for r in test_results:
            if r["success"]:
                for rel in r["result"].get("relations", []):
                    macro_counter[rel.get("macro_type", "未知")] += 1
                    micro_counter[rel.get("micro_type", "未知")] += 1

        print(f"\n  📈 宏观类型分布:")
        for macro, cnt in macro_counter.most_common():
            print(f"     {macro:10s}  {cnt:3d}")

        print(f"\n  📈 微观类型分布:")
        for micro, cnt in micro_counter.most_common(10):
            print(f"     {micro:15s}  {cnt:3d}")

    # 保存测试结果
    output_path = OUTPUT_DIR / "test_v2_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(output_path), "w", encoding="utf-8") as f:
        json.dump(test_results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 测试结果已保存到: {output_path}")

    print("\n✅ 步骤 3.1 测试完成！")
    print("   请手动检查 LLM 输出的关系是否合理。")
    print("   验收标准：macro_type/micro_type 正确、'其他*'类使用合理、有证据引用")


def load_unified_data() -> list[dict]:
    """加载步骤 3.0 保存的统一数据结构"""
    output_path = OUTPUT_DIR / "relations_extracted.json.gz"
    if not output_path.exists():
        return []
    return load_json_gz(str(output_path))


# ══════════════════════════════════════════════════════════════════════════
# 步骤 3.2: 批量关系提取核心框架
# ══════════════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────────────────────────────
# 断点续传（Checkpoint）
# ──────────────────────────────────────────────────────────────────────

def load_checkpoint() -> dict:
    """
    加载 checkpoint 文件。

    Returns:
        {
            "last_updated": str,
            "total_processed": int,
            "success_count": int,
            "processed": {
                "<entity_id_str>": {
                    "status": "success" | "error" | "parse_error",
                    "name": str,
                    "剧本名": str,
                    "剧目类型": str,
                    "relations_count": int,
                    "error": str (optional),
                    "elapsed_seconds": float,
                }
            }
        }
    """
    if CHECKPOINT_PATH.exists():
        try:
            with open(str(CHECKPOINT_PATH), "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except Exception as e:
            print(f"⚠️  加载 checkpoint 失败: {e}，将从头开始")
    return {
        "last_updated": None,
        "total_processed": 0,
        "success_count": 0,
        "processed": {},
    }


def save_checkpoint(checkpoint: dict) -> None:
    """保存 checkpoint 文件（覆盖写入）"""
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    checkpoint["last_updated"] = datetime.now().isoformat()
    checkpoint["total_processed"] = len(checkpoint["processed"])
    checkpoint["success_count"] = sum(
        1 for v in checkpoint["processed"].values()
        if v.get("status") == "success"
    )
    with open(str(CHECKPOINT_PATH), "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)


def get_checkpoint_success_ids(checkpoint: dict) -> set:
    """获取 checkpoint 中已成功处理的 entity_id 集合"""
    return {
        int(eid) for eid, info in checkpoint["processed"].items()
        if info.get("status") == "success"
    }


# ──────────────────────────────────────────────────────────────────────
# 批量提取
# ──────────────────────────────────────────────────────────────────────

def extract_single_play(play_data: dict, llm, max_retries: int = 3,
                        base_delay: float = 2.0) -> dict:
    """
    对单个剧本执行关系提取（带重试机制）。

    Args:
        play_data: 统一数据结构中的单个剧本对象
        llm: LLM 实例
        max_retries: 最大重试次数
        base_delay: 重试基础延迟（秒），指数退避

    Returns:
        {
            "entity_id": int,
            "剧本名": str,
            "剧目类型": str,
            "status": "success" | "error" | "parse_error",
            "relations_count": int,
            "result": dict (LLM 原始返回),
            "elapsed_seconds": float,
            "error": str (optional),
        }
    """
    from services.prompts_opera import extract_character_relations_v2

    start_time = time.time()
    last_error = None

    for attempt in range(max_retries):
        try:
            result = extract_character_relations_v2(llm, play_data)
            elapsed = time.time() - start_time

            llm_result = result.get("result", {})

            # 检查是否为 parse_error → 也重试
            if "parse_error" in llm_result:
                last_error = f"JSON 解析失败: {llm_result.get('parse_error', '')}"
                if attempt < max_retries - 1:
                    wait = base_delay * (attempt + 1)
                    print(f"      ⚠️  JSON 解析失败，等待 {wait:.1f}s 后重试 "
                          f"({attempt + 1}/{max_retries})...")
                    time.sleep(wait)
                    continue
                # 最后一次重试仍然失败
                elapsed = time.time() - start_time
                return {
                    "entity_id": play_data["entity_id"],
                    "剧本名": play_data["剧本名"],
                    "剧目类型": play_data["剧目类型"],
                    "status": "parse_error",
                    "relations_count": 0,
                    "result": llm_result,
                    "elapsed_seconds": elapsed,
                    "error": last_error,
                }

            relations = llm_result.get("relations", [])
            return {
                "entity_id": play_data["entity_id"],
                "剧本名": play_data["剧本名"],
                "剧目类型": play_data["剧目类型"],
                "status": "success",
                "relations_count": len(relations),
                "result": llm_result,
                "elapsed_seconds": elapsed,
            }

        except Exception as e:
            elapsed = time.time() - start_time
            last_error = str(e)

            # 速率限制：指数退避重试
            if "429" in last_error and attempt < max_retries - 1:
                wait = base_delay * (2 ** attempt)
                print(f"      ⚠️  速率限制，等待 {wait:.1f}s 后重试 "
                      f"({attempt + 1}/{max_retries})...")
                time.sleep(wait)
                continue

            # 其他错误：短暂等待后重试
            if attempt < max_retries - 1:
                wait = base_delay * (attempt + 1)
                print(f"      ⚠️  调用失败，等待 {wait:.1f}s 后重试 "
                      f"({attempt + 1}/{max_retries}): {e}")
                time.sleep(wait)
                continue

    # 全部重试失败
    elapsed = time.time() - start_time
    return {
        "entity_id": play_data["entity_id"],
        "剧本名": play_data["剧本名"],
        "剧目类型": play_data["剧目类型"],
        "status": "error",
        "relations_count": 0,
        "result": {},
        "elapsed_seconds": elapsed,
        "error": last_error or "未知错误",
    }


def select_plays(plays: list[dict], mode: str = "all",
                 sample_n: int = 0, target_ids: list = None,
                 skip_ids: set = None) -> list[dict]:
    """
    根据 CLI 参数选择待处理的剧本子集。

    Args:
        plays: 全部剧本列表
        mode: "all" | "sample" | "ids"
        sample_n: 随机采样数量（mode="sample" 时使用）
        target_ids: 指定 entity_id 列表（mode="ids" 时使用）
        skip_ids: 需要跳过的 entity_id 集合（断点续传已处理的）

    Returns:
        筛选后的剧本列表
    """
    # 先过滤掉已处理的剧本
    if skip_ids:
        plays = [p for p in plays if p["entity_id"] not in skip_ids]

    if mode == "all":
        return plays
    elif mode == "sample":
        if sample_n >= len(plays):
            return plays
        # 使用固定种子确保可重现性，配合断点续传能正确跳过
        rng = random.Random(42 + sample_n)
        return rng.sample(plays, sample_n)
    elif mode == "ids":
        id_set = set(target_ids)
        return [p for p in plays if p["entity_id"] in id_set]
    else:
        raise ValueError(f"未知选择模式: {mode}")


def run_batch_extraction(
    plays: list[dict],
    llm=None,
    resume: bool = True,
    max_retries: int = 3,
    delay: float = 1.0,
    output_path: Path = BATCH_OUTPUT_PATH,
) -> dict:
    """
    批量关系提取主流程。

    Args:
        plays: 待处理的剧本列表（经 select_plays 筛选后）
        llm: LLM 实例（可选，如不提供则自动获取）
        resume: 是否从 checkpoint 恢复
        max_retries: 单次 LLM 调用最大重试次数
        delay: 每次请求间隔（秒）
        output_path: 输出文件路径

    Returns:
        {
            "total": int,
            "success": int,
            "failed": int,
            "skipped": int,
            "total_relations": int,
            "results": list[dict],
        }
    """
    # 动态导入 prompts_opera 模块
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))

    if llm is None:
        llm = get_llm()

    # 加载 checkpoint（用于保存进度，以及再次过滤以防万一）
    checkpoint = load_checkpoint()
    if resume:
        skip_ids = get_checkpoint_success_ids(checkpoint)
        if skip_ids:
            print(f"📋 断点续传: 已有 {len(skip_ids)} 条成功记录")
    else:
        skip_ids = set()

    # 过滤已处理的剧本（与 select_plays 中的过滤一致，双重保险）
    pending_plays = [
        p for p in plays if p["entity_id"] not in skip_ids
    ]

    total = len(pending_plays)
    already_done = len(plays) - total

    print(f"\n📊 任务概览:")
    print(f"   选中剧本数:   {len(plays)}")
    print(f"   已完成(跳过):  {already_done}")
    print(f"   待处理:       {total}")
    print(f"   最大重试次数: {max_retries}")
    print(f"   请求间隔:     {delay}s")

    if total == 0:
        print("\n✅ 所有选中剧本均已处理完毕，无需执行。")
        return {
            "total": len(plays),
            "success": already_done,
            "failed": 0,
            "skipped": 0,
            "total_relations": 0,
            "results": [],
        }

    # 主循环（带 tqdm 进度条）
    try:
        from tqdm import tqdm
        pbar = tqdm(pending_plays, desc="批量提取关系", unit="剧本",
                    bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]")
    except ImportError:
        # tqdm 不可用时回退到简单打印
        pbar = pending_plays
        print(f"\n⚠️  tqdm 未安装，使用简单进度显示")

    success_count = 0
    fail_count = 0
    parse_error_count = 0
    total_relations = 0
    all_results = []
    batch_start = time.time()

    for idx, play in enumerate(pbar):
        play_name = play["剧本名"]
        entity_id = play["entity_id"]
        n_chars = len(play.get("角色列表", []))
        n_edges = len(play.get("共现边列表", []))

        # 实时打印当前处理的剧本（tqdm 和非 tqdm 模式都输出）
        print(f"\n  [{idx + 1}/{total}] 🔄 {play_name} ({n_chars}角色, {n_edges}边) ...",
              flush=True)

        # 调用 LLM 提取
        result = extract_single_play(
            play, llm, max_retries=max_retries, base_delay=delay * 2
        )

        status = result["status"]
        rel_count = result["relations_count"]
        elapsed = result["elapsed_seconds"]

        if status == "success":
            success_count += 1
            total_relations += rel_count

            # tqdm 模式下更新后缀
            if not isinstance(pbar, list):
                pbar.set_postfix_str(
                    f"✅ {play_name[:15]}... {rel_count}条关系 {elapsed:.1f}s"
                )
            else:
                print(f"   ✅ 成功: {rel_count} 条关系 ({elapsed:.1f}s)")

        elif status == "parse_error":
            parse_error_count += 1
            if not isinstance(pbar, list):
                pbar.set_postfix_str(
                    f"⚠️  {play_name[:15]}... JSON解析失败"
                )
            else:
                print(f"   ⚠️  JSON 解析失败 ({elapsed:.1f}s)")

        else:  # status == "error"
            fail_count += 1
            error_msg = result.get("error", "未知错误")
            if not isinstance(pbar, list):
                pbar.set_postfix_str(
                    f"❌ {play_name[:15]}... {error_msg[:30]}"
                )
            else:
                print(f"   ❌ 失败: {error_msg[:80]}")

        all_results.append(result)

        # 更新 checkpoint（无论成功失败都记录）
        checkpoint["processed"][str(entity_id)] = {
            "status": status,
            "name": play_name,
            "剧本名": play_name,
            "剧目类型": play.get("剧目类型", ""),
            "relations_count": rel_count,
            "elapsed_seconds": round(elapsed, 2),
        }
        if status == "error":
            checkpoint["processed"][str(entity_id)]["error"] = result.get("error", "")

        save_checkpoint(checkpoint)

        # 请求间隔（最后一个不需要等待）
        if idx < total - 1 and delay > 0:
            time.sleep(delay)

    batch_elapsed = time.time() - batch_start

    # 关闭 tqdm
    if not isinstance(pbar, list):
        pbar.close()

    # 保存批量结果
    save_batch_results(all_results, output_path)

    # 汇总输出
    print(f"\n{'=' * 60}")
    print(f"📊 批量提取完成")
    print(f"{'=' * 60}")
    print(f"   处理剧本数:  {total}")
    print(f"   成功:        {success_count}")
    print(f"   解析失败:    {parse_error_count}")
    print(f"   调用失败:    {fail_count}")
    print(f"   提取关系总数: {total_relations}")
    print(f"   总耗时:      {batch_elapsed:.1f}s ({batch_elapsed / 60:.1f}min)")
    if total > 0:
        print(f"   平均每剧本:  {batch_elapsed / total:.1f}s")
    print(f"   checkpoint:  {CHECKPOINT_PATH}")
    print(f"   结果文件:    {output_path}")

    # 打印关系类型分布
    if total_relations > 0:
        macro_counter = Counter()
        micro_counter = Counter()
        for r in all_results:
            if r["status"] == "success":
                for rel in r["result"].get("relations", []):
                    macro_counter[rel.get("macro_type", "未知")] += 1
                    micro_counter[rel.get("micro_type", "未知")] += 1

        print(f"\n   📈 宏观关系类型分布:")
        for macro, cnt in macro_counter.most_common():
            pct = cnt / total_relations * 100
            print(f"      {macro:12s}  {cnt:5d} ({pct:5.1f}%)")

        print(f"\n   📈 微观关系类型 Top 10:")
        for micro, cnt in micro_counter.most_common(10):
            pct = cnt / total_relations * 100
            print(f"      {micro:18s}  {cnt:5d} ({pct:5.1f}%)")

    # 打印失败列表
    failed_results = [r for r in all_results if r["status"] == "error"]
    if failed_results:
        print(f"\n   ⚠️  失败剧本列表 ({len(failed_results)} 个):")
        for r in failed_results[:20]:
            print(f"      - {r['剧本名']} (id={r['entity_id']}): "
                  f"{r.get('error', '未知')[:60]}")
        if len(failed_results) > 20:
            print(f"      ... 还有 {len(failed_results) - 20} 个")

    return {
        "total": total + already_done,
        "success": success_count + already_done,
        "failed": fail_count,
        "skipped": parse_error_count,
        "total_relations": total_relations,
        "results": all_results,
    }


def save_batch_results(results: list[dict],
                       output_path: Path = BATCH_OUTPUT_PATH) -> None:
    """
    保存批量提取结果。

    结果同时包含完整的 LLM 返回（result 字段）和元信息。
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 构建输出结构
    output = {
        "extracted_at": datetime.now().isoformat(),
        "total_plays": len(results),
        "success_count": sum(1 for r in results if r["status"] == "success"),
        "total_relations": sum(r["relations_count"] for r in results),
        "results": results,
    }

    with gzip.open(str(output_path), "wt", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=None)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n💾 批量结果已保存到: {output_path} ({size_mb:.2f} MB)")


def load_batch_results(output_path: Path = BATCH_OUTPUT_PATH) -> dict:
    """加载批量提取结果"""
    if not output_path.exists():
        return {}
    return load_json_gz(str(output_path))


# ══════════════════════════════════════════════════════════════════════════
# 步骤 3.3: LLM 调用、结果解析与来源标记
# ══════════════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────────────────────────────
# 3.3a: 合法 micro_type 体系 & 关系 schema 校验
# ──────────────────────────────────────────────────────────────────────

# 合法的 macro_type → micro_type 映射（含"其他*"兜底）
VALID_MICRO_TYPES: dict[str, list[str]] = {
    "亲属": ["父子", "母子", "夫妻", "兄弟", "姐妹", "婆媳", "翁婿", "其他亲属"],
    "从属": ["君臣", "主仆", "师徒", "将卒", "官民", "其他从属"],
    "同盟": ["结拜", "恩人", "知己", "同僚", "利益结盟", "其他同盟"],
    "敌对": ["宿敌", "政敌", "仇人", "情敌", "阵营对立", "其他敌对"],
    "情感": ["恋人", "暗恋", "政治联姻", "其他情感"],
    "中立": ["萍水相逢", "路人", "交易", "同场", "其他中立"],
}

# macro_type → 对应的"其他*"兜底子类名
_FALLBACK_MICRO: dict[str, str] = {macro: f"其他{macro}" for macro in VALID_MICRO_TYPES}
_FALLBACK_MICRO["中立"] = "其他中立"  # "同场" 是特殊子类，不作为通用兜底


def validate_relation_schema(
    rel: dict,
    char_set: set[str],
    alias_map: dict | None = None,
) -> dict | None:
    """
    校验并修复单条关系的 schema 字段。

    校验项：
    1. 必需字段存在性 (source, target, macro_type, micro_type)
    2. source/target 角色名标准化（使用 alias_map）并在 char_set 中
    3. macro_type 合法性
    4. micro_type 合法性（不合法则降级为对应 macro 的"其他*"兜底）
    5. direction 合法性
    6. confidence 范围 [0, 1]

    Args:
        rel: LLM 输出的单条关系字典
        char_set: 本剧本的合法角色名集合（标准名）
        alias_map: 别名映射 {别名: 标准名}，用于标准化 LLM 输出的角色名

    Returns:
        校验修复后的关系字典，若 source/target 均不在角色集中则返回 None
    """
    # 1. 必需字段检查
    source = rel.get("source", "").strip()
    target = rel.get("target", "").strip()
    if not source or not target:
        return None

    # 2. 角色名标准化
    if alias_map:
        source = alias_map.get(source, source)
        target = alias_map.get(target, target)

    # 检查标准化后的名字是否在角色集中
    if source not in char_set and target not in char_set:
        return None
    # 若一端不在，尝试保留（可能是 crowd 角色或未收录角色）
    # 但至少一端必须在角色集中
    if source not in char_set or target not in char_set:
        pass  # 允许一端不在（如公差、衙役等辅助角色）

    # 3. macro_type 校验
    macro_type = rel.get("macro_type", "中立")
    if macro_type not in VALID_MICRO_TYPES:
        macro_type = "中立"

    # 4. micro_type 校验与降级
    micro_type = rel.get("micro_type", "")
    valid_micros = VALID_MICRO_TYPES[macro_type]
    if micro_type not in valid_micros:
        # 降级为对应 macro 的"其他*"兜底
        micro_type = _FALLBACK_MICRO[macro_type]

    # 5. direction 校验
    direction = rel.get("direction", "bidirectional")
    if direction not in ("bidirectional", "unidirectional"):
        direction = "bidirectional"

    # 6. confidence 校验
    confidence = rel.get("confidence")
    if confidence is not None:
        try:
            confidence = float(confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = None

    return {
        "source": source,
        "target": target,
        "macro_type": macro_type,
        "micro_type": micro_type,
        "direction": direction,
        "confidence": confidence,
        "evidence": rel.get("evidence", ""),
        "context_scene": rel.get("context_scene", ""),
    }


def deduplicate_relations(relations: list[dict]) -> list[dict]:
    """
    对同一 (source, target, macro_type) 的关系去重，保留 confidence 最高者。

    匹配时将 (A,B) 和 (B,A) 视为同一无向对。

    Args:
        relations: 已校验的关系列表

    Returns:
        去重后的关系列表
    """
    best: dict[tuple, dict] = {}

    for rel in relations:
        a, b = sorted([rel["source"], rel["target"]])
        key = (a, b, rel["macro_type"])

        if key not in best:
            best[key] = rel
        else:
            existing = best[key]
            # 优先比较 confidence（None 视为 -1）
            existing_conf = existing.get("confidence") or -1
            new_conf = rel.get("confidence") or -1
            if new_conf > existing_conf:
                best[key] = rel
            elif new_conf == existing_conf:
                # confidence 相同时，保留 evidence 更长的
                if len(rel.get("evidence", "")) > len(existing.get("evidence", "")):
                    best[key] = rel

    return list(best.values())


def extract_and_parse(
    play_data: dict,
    llm=None,
    max_retries: int = 3,
    base_delay: float = 2.0,
) -> dict:
    """
    3.3a 封装：对单个剧本执行 LLM 关系提取 + schema 校验 + 去重。

    完整流程：
    1. 调用 LLM 提取关系（含重试）
    2. 校验每条关系的 schema（角色名标准化、micro_type 合法性）
    3. 去重（同一角色对同一 macro_type 只保留 confidence 最高者）

    Args:
        play_data: 统一数据结构中的单个剧本对象
        llm: LLM 实例
        max_retries: 最大重试次数
        base_delay: 重试基础延迟（秒）

    Returns:
        {
            "entity_id": int,
            "剧本名": str,
            "剧目类型": str,
            "status": "success" | "error" | "parse_error",
            "relations_count": int,
            "relations": list[dict],      # 校验去重后的关系列表
            "network_summary": str,
            "raw_result": dict,           # LLM 原始返回
            "elapsed_seconds": float,
            "validation_stats": dict,     # 校验统计
            "error": str (optional),
        }
    """
    from services.prompts_opera import extract_character_relations_v2

    start_time = time.time()
    last_error = None

    # 准备校验用数据
    char_set = set(play_data.get("角色列表", []))
    alias_map = {}
    alias_info = play_data.get("角色字典", {})
    # 从角色字典反向构建一个简单的别名映射（标准名→标准名，即恒等映射）
    # 真正的别名映射需要从原始 alias 数据获取
    # 这里使用 play_data 附带的 alias_map（如果有的话）
    alias_map = play_data.get("_alias_map", {})

    for attempt in range(max_retries):
        try:
            result = extract_character_relations_v2(llm, play_data)
            elapsed = time.time() - start_time

            llm_result = result.get("result", {})

            # 检查是否为 parse_error
            if "parse_error" in llm_result:
                return {
                    "entity_id": play_data["entity_id"],
                    "剧本名": play_data["剧本名"],
                    "剧目类型": play_data["剧目类型"],
                    "status": "parse_error",
                    "relations_count": 0,
                    "relations": [],
                    "network_summary": "",
                    "raw_result": llm_result,
                    "elapsed_seconds": elapsed,
                    "validation_stats": {},
                    "error": f"JSON 解析失败: {llm_result.get('parse_error', '')}",
                }

            # 获取原始关系列表
            raw_relations = llm_result.get("relations", [])
            network_summary = llm_result.get("network_summary", "")

            # schema 校验
            validated = []
            skipped_no_char = 0
            micro_downgraded = 0

            for rel in raw_relations:
                original_micro = rel.get("micro_type", "")
                v_rel = validate_relation_schema(rel, char_set, alias_map)
                if v_rel is None:
                    skipped_no_char += 1
                    continue
                if v_rel["micro_type"] != original_micro and "其他" in v_rel["micro_type"]:
                    micro_downgraded += 1
                validated.append(v_rel)

            # 去重
            before_dedup = len(validated)
            deduped = deduplicate_relations(validated)
            dedup_removed = before_dedup - len(deduped)

            return {
                "entity_id": play_data["entity_id"],
                "剧本名": play_data["剧本名"],
                "剧目类型": play_data["剧目类型"],
                "status": "success",
                "relations_count": len(deduped),
                "relations": deduped,
                "network_summary": network_summary,
                "raw_result": llm_result,
                "elapsed_seconds": elapsed,
                "validation_stats": {
                    "raw_count": len(raw_relations),
                    "skipped_no_char": skipped_no_char,
                    "micro_downgraded": micro_downgraded,
                    "dedup_removed": dedup_removed,
                    "final_count": len(deduped),
                },
            }

        except Exception as e:
            elapsed = time.time() - start_time
            last_error = str(e)

            if "429" in last_error and attempt < max_retries - 1:
                wait = base_delay * (2 ** attempt)
                print(f"      ⚠️  速率限制，等待 {wait:.1f}s 后重试 "
                      f"({attempt + 1}/{max_retries})...")
                time.sleep(wait)
                continue

            if attempt < max_retries - 1:
                wait = base_delay * (attempt + 1)
                print(f"      ⚠️  调用失败，等待 {wait:.1f}s 后重试 "
                      f"({attempt + 1}/{max_retries}): {e}")
                time.sleep(wait)
                continue

    elapsed = time.time() - start_time
    return {
        "entity_id": play_data["entity_id"],
        "剧本名": play_data["剧本名"],
        "剧目类型": play_data["剧目类型"],
        "status": "error",
        "relations_count": 0,
        "relations": [],
        "network_summary": "",
        "raw_result": {},
        "elapsed_seconds": elapsed,
        "validation_stats": {},
        "error": last_error or "未知错误",
    }


# ──────────────────────────────────────────────────────────────────────
# 3.3b: 共现边与 LLM 边的合并与来源标记
# ──────────────────────────────────────────────────────────────────────

def merge_sources(
    llm_relations: list[dict],
    cooccur_edges: list[dict],
) -> list[dict]:
    """
    将 LLM 提取的关系与同场共现边进行匹配合并，为每条关系标记来源。

    source_tag 判定规则：
    - "both":            该角色对同时存在于 LLM 结果和共现数据中
    - "llm_only":        仅 LLM 提取出，共现数据中无此角色对
    - "cooccurrence_only": 仅共现数据中存在，LLM 未提取

    匹配逻辑：将角色对 (A,B) 和 (B,A) 视为同一条无向边。

    Args:
        llm_relations: 校验去重后的关系列表（来自 extract_and_parse）
        cooccur_edges: 同场共现边列表 [{"character_a": str, "character_b": str,
                         "count": int, "weight": float, "scenes": list}, ...]

    Returns:
        合并后的关系列表，每条含 source_tag、dialogue_score、plot_score、
        weight、cooccurrence_count 等字段
    """
    # ── 构建共现边查找表 ──
    # key: frozenset({a, b}) → edge dict
    cooccur_map: dict[frozenset, dict] = {}
    for edge in cooccur_edges:
        a, b = edge["character_a"], edge["character_b"]
        key = frozenset([a, b])
        # 保留 count 最大的（理论上已去重，这里做防御）
        if key not in cooccur_map or edge["count"] > cooccur_map[key]["count"]:
            cooccur_map[key] = edge

    # ── 标记 LLM 关系的来源 ──
    merged: list[dict] = []
    matched_keys: set[frozenset] = set()

    for rel in llm_relations:
        key = frozenset([rel["source"], rel["target"]])
        cooccur = cooccur_map.get(key)

        if cooccur is not None:
            # both: LLM + 共现双源确认
            matched_keys.add(key)
            merged.append({
                **rel,
                "source_tag": "both",
                "dialogue_score": None,   # 稍后由 compute_weight 计算
                "plot_score": rel.get("confidence"),
                "weight": None,           # 稍后由 compute_weight 计算
                "cooccurrence_count": cooccur["count"],
                "cooccurrence_scenes": cooccur.get("scenes", []),
            })
        else:
            # llm_only: 仅 LLM 发现的隐性关系
            merged.append({
                **rel,
                "source_tag": "llm_only",
                "dialogue_score": 0,
                "plot_score": rel.get("confidence"),
                "weight": None,
                "cooccurrence_count": 0,
                "cooccurrence_scenes": [],
            })

    # ── 添加 cooccurrence_only 边 ──
    for key, edge in cooccur_map.items():
        if key not in matched_keys:
            a, b = list(key)
            merged.append({
                "source": a,
                "target": b,
                "macro_type": "中立",
                "micro_type": "同场",
                "direction": "bidirectional",
                "confidence": None,
                "evidence": None,
                "context_scene": ", ".join(edge.get("scenes", [])[:3]),
                "source_tag": "cooccurrence_only",
                "dialogue_score": None,   # 稍后由 compute_weight 计算
                "plot_score": None,
                "weight": None,
                "cooccurrence_count": edge["count"],
                "cooccurrence_scenes": edge.get("scenes", []),
            })

    return merged


# ──────────────────────────────────────────────────────────────────────
# 3.4: 关系强度双维度评分（含对数平滑）
# ──────────────────────────────────────────────────────────────────────

# 默认权重配置：{source_tag: [dialogue_weight, plot_weight]}
DEFAULT_WEIGHT_CONFIG: dict[str, list[float]] = {
    "both": [0.5, 0.5],
    "llm_only": [0.0, 1.0],        # dialogue_score=0, 所以只用 plot_score
    "cooccurrence_only": [1.0, 0.0],  # plot_score=null, 所以只用 dialogue_score
}


def compute_weights_for_play(
    relations: list[dict],
    weight_config: dict[str, list[float]] | None = None,
) -> list[dict]:
    """
    3.4: 为单个剧本的所有关系计算 dialogue_score、plot_score 和 weight。

    dialogue_score 使用对数平滑 + 剧内 min-max 归一化：
      smoothed = log(1 + count)
      dialogue_score = smoothed / max_smoothed_in_play

    plot_score 直接取 LLM confidence（cooccurrence_only 边为 null）。

    weight 根据 source_tag 使用可配置的加权公式。

    Args:
        relations: 已合并来源标记的关系列表（来自 merge_sources）
        weight_config: 权重配置 {source_tag: [dialogue_weight, plot_weight]}
                       默认使用 DEFAULT_WEIGHT_CONFIG

    Returns:
        更新了 dialogue_score、plot_score、weight 字段的关系列表
    """
    if weight_config is None:
        weight_config = DEFAULT_WEIGHT_CONFIG

    if not relations:
        return relations

    # ── 计算 dialogue_score（对数平滑 + 剧内归一化）──
    # 收集所有 cooccurrence_count > 0 的 count 值
    counts = [r["cooccurrence_count"] for r in relations if r.get("cooccurrence_count", 0) > 0]

    if counts:
        max_count = max(counts)
        max_smoothed = math.log(1 + max_count) if max_count > 0 else 1.0
    else:
        max_smoothed = 1.0  # 防止除零

    for rel in relations:
        source_tag = rel.get("source_tag", "both")
        count = rel.get("cooccurrence_count", 0)

        # dialogue_score
        if source_tag == "llm_only":
            rel["dialogue_score"] = 0.0
        elif count > 0:
            smoothed = math.log(1 + count)
            rel["dialogue_score"] = round(smoothed / max_smoothed, 6)
        else:
            rel["dialogue_score"] = 0.0

        # plot_score（直接取 confidence）
        confidence = rel.get("confidence")
        if source_tag == "cooccurrence_only":
            rel["plot_score"] = None
        elif confidence is not None:
            rel["plot_score"] = round(float(confidence), 6)
        else:
            rel["plot_score"] = None

        # weight（根据 source_tag 加权）
        cfg = weight_config.get(source_tag, weight_config.get("both", [0.5, 0.5]))
        d_weight, p_weight = cfg[0], cfg[1]

        d_score = rel["dialogue_score"] if rel["dialogue_score"] is not None else 0.0
        p_score = rel["plot_score"] if rel["plot_score"] is not None else 0.0

        rel["weight"] = round(d_weight * d_score + p_weight * p_score, 6)

    return relations


def post_process_batch_results(
    batch_results: dict,
    plays_by_id: dict[int, dict],
    weight_config: dict[str, list[float]] | None = None,
) -> dict:
    """
    对批量提取的原始结果执行完整的后处理流程。

    流程：对每个成功提取的剧本 → validate + dedup (3.3a) → merge_sources (3.3b) → compute_weights (3.4)

    Args:
        batch_results: load_batch_results() 的返回值
        plays_by_id: {entity_id: play_data} 映射，用于获取共现边和角色字典

    Returns:
        后处理后的结果字典（结构同 batch_results，但每条 result 替换为
        含 relations（已校验去重+来源标记）的新结构）
    """
    results = batch_results.get("results", [])
    if not results:
        print("⚠️  批量结果为空，无需后处理")
        return batch_results

    total = len(results)
    success_count = 0
    parse_error_count = 0
    error_count = 0
    total_raw_relations = 0
    total_validated_relations = 0
    total_merged_relations = 0

    # 校验统计汇总
    agg_stats = {
        "skipped_no_char": 0,
        "micro_downgraded": 0,
        "dedup_removed": 0,
    }
    source_tag_counter = Counter()

    processed_results = []

    for idx, r in enumerate(results):
        entity_id = r["entity_id"]
        status = r.get("status", "error")

        if status == "parse_error":
            parse_error_count += 1
            processed_results.append({
                **r,
                "post_processed": False,
            })
            continue

        if status == "error":
            error_count += 1
            processed_results.append({
                **r,
                "post_processed": False,
            })
            continue

        # 成功的结果
        success_count += 1
        raw_result = r.get("result", {})
        raw_relations = raw_result.get("relations", [])
        network_summary = raw_result.get("network_summary", "")
        total_raw_relations += len(raw_relations)

        # 获取对应剧本的角色字典和共现边
        play = plays_by_id.get(entity_id)
        if play is None:
            # 找不到对应剧本数据，跳过后处理
            processed_results.append({
                **r,
                "post_processed": False,
                "post_process_error": "未在统一数据中找到该剧本",
            })
            continue

        char_set = set(play.get("角色列表", []))
        alias_map = play.get("_alias_map", {})
        cooccur_edges = play.get("共现边列表", [])

        # 3.3a: validate + dedup
        validated = []
        for rel in raw_relations:
            v_rel = validate_relation_schema(rel, char_set, alias_map)
            if v_rel is not None:
                validated.append(v_rel)

        before_dedup = len(validated)
        deduped = deduplicate_relations(validated)
        dedup_removed = before_dedup - len(deduped)
        total_validated_relations += len(deduped)

        # 累计校验统计
        agg_stats["skipped_no_char"] += len(raw_relations) - len(validated)
        agg_stats["dedup_removed"] += dedup_removed

        # 3.3b: merge_sources
        merged = merge_sources(deduped, cooccur_edges)

        # 3.4: compute_weights（对数平滑 + 双维度评分）
        merged = compute_weights_for_play(merged, weight_config)
        total_merged_relations += len(merged)

        for rel in merged:
            source_tag_counter[rel["source_tag"]] += 1

        processed_results.append({
            "entity_id": entity_id,
            "剧本名": r.get("剧本名", ""),
            "剧目类型": r.get("剧目类型", ""),
            "status": "success",
            "post_processed": True,
            "relations_count": len(merged),
            "relations": merged,
            "network_summary": network_summary,
            "validation_stats": {
                "raw_count": len(raw_relations),
                "validated_count": len(validated),
                "dedup_removed": dedup_removed,
                "merged_count": len(merged),
                "source_tags": dict(Counter(rel["source_tag"] for rel in merged)),
            },
            "elapsed_seconds": r.get("elapsed_seconds", 0),
        })

    # ── 计算全局权重统计 ──
    weight_stats = {}
    for tag in ["both", "llm_only", "cooccurrence_only"]:
        tag_weights = []
        tag_d_scores = []
        tag_p_scores = []
        for r in processed_results:
            if not r.get("post_processed"):
                continue
            for rel in r.get("relations", []):
                if rel.get("source_tag") != tag:
                    continue
                w = rel.get("weight")
                if w is not None:
                    tag_weights.append(w)
                d = rel.get("dialogue_score")
                if d is not None:
                    tag_d_scores.append(d)
                p = rel.get("plot_score")
                if p is not None:
                    tag_p_scores.append(p)

        if tag_weights:
            weight_stats[tag] = {
                "count": len(tag_weights),
                "weight_mean": round(sum(tag_weights) / len(tag_weights), 4),
                "weight_min": round(min(tag_weights), 4),
                "weight_max": round(max(tag_weights), 4),
            }
            if tag_d_scores:
                weight_stats[tag]["dialogue_score_mean"] = round(
                    sum(tag_d_scores) / len(tag_d_scores), 4)
            if tag_p_scores:
                weight_stats[tag]["plot_score_mean"] = round(
                    sum(tag_p_scores) / len(tag_p_scores), 4)
        else:
            weight_stats[tag] = {"count": 0}

    # 构建输出
    output = {
        "post_processed_at": datetime.now().isoformat(),
        "total_plays": total,
        "success_count": success_count,
        "parse_error_count": parse_error_count,
        "error_count": error_count,
        "total_raw_relations": total_raw_relations,
        "total_validated_relations": total_validated_relations,
        "total_merged_relations": total_merged_relations,
        "validation_summary": agg_stats,
        "source_tag_distribution": dict(source_tag_counter),
        "weight_statistics": weight_stats,
        "weight_config_used": weight_config or DEFAULT_WEIGHT_CONFIG,
        "results": processed_results,
    }

    return output


# ──────────────────────────────────────────────────────────────────────
# 步骤 3.3 输出路径
# ──────────────────────────────────────────────────────────────────────

POST_PROCESS_OUTPUT_PATH = OUTPUT_DIR / "relations_post_processed.json.gz"


def save_post_processed_results(results: dict,
                                output_path: Path = POST_PROCESS_OUTPUT_PATH) -> None:
    """保存后处理结果"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(str(output_path), "wt", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=None)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"💾 后处理结果已保存到: {output_path} ({size_mb:.2f} MB)")


def load_post_processed_results(
    output_path: Path = POST_PROCESS_OUTPUT_PATH,
) -> dict:
    """加载后处理结果"""
    if not output_path.exists():
        return {}
    return load_json_gz(str(output_path))


def build_play_lookup(plays: list[dict],
                      load_aliases: bool = True) -> dict[int, dict]:
    """
    为后处理构建 {entity_id: play_data} 映射。

    同时加载原始别名映射并注入 play_data 的 _alias_map 字段，
    供 validate_relation_schema 使用。

    Args:
        plays: 统一数据结构列表
        load_aliases: 是否从原始文件加载别名映射（默认 True）
    """
    # 加载原始别名映射（用于 LLM 输出角色名标准化）
    alias_by_id: dict[int, dict] = {}
    if load_aliases:
        try:
            alias_list = load_json_gz(str(ALIAS_PATH))
            alias_by_id = {a["entity_id"]: a for a in alias_list}
        except Exception as e:
            print(f"⚠️  加载别名映射失败: {e}，将使用恒等映射")

    lookup = {}
    for p in plays:
        eid = p["entity_id"]

        # 从原始数据获取别名映射 {别名: 标准名}
        alias_map = {}
        if eid in alias_by_id:
            raw_map = alias_by_id[eid].get("角色别名映射", {}).get("别名映射", {})
            alias_map = dict(raw_map)  # {别名: 标准名}

        # 确保标准名也映射到自身（恒等映射）
        char_dict = p.get("角色字典", {})
        for name in char_dict:
            if name not in alias_map:
                alias_map[name] = name

        enriched = {**p, "_alias_map": alias_map}
        lookup[eid] = enriched
    return lookup


# ──────────────────────────────────────────────────────────────────────
# 步骤 3.3 命令行入口
# ──────────────────────────────────────────────────────────────────────

def main_step_3_3():
    """
    步骤 3.3 命令行入口：对已有批量结果执行后处理。

    功能：
    1. 加载批量提取的原始结果
    2. 加载统一数据（用于角色字典和共现边）
    3. 执行 schema 校验 + 去重 + 来源标记
    4. 保存后处理结果并打印统计摘要
    """
    parser = argparse.ArgumentParser(
        description="Task 2 Step 3.3 — 关系结果后处理（校验/去重/来源标记）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 对默认批量结果执行后处理
  python scripts/batch_extract_relations.py --post-process

  # 指定输入/输出路径
  python scripts/batch_extract_relations.py --post-process \\
      --input data/task2_relations/relations_batch_results.json.gz \\
      --output data/task2_relations/relations_post_processed.json.gz

  # 仅打印统计信息（不保存）
  python scripts/batch_extract_relations.py --post-process --dry-run
        """,
    )

    parser.add_argument(
        "--post-process", action="store_true", required=True,
        help="执行步骤 3.3 后处理"
    )
    parser.add_argument(
        "--input", type=str, default=None,
        help=f"批量结果输入路径（默认: {BATCH_OUTPUT_PATH}）"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help=f"后处理结果输出路径（默认: {POST_PROCESS_OUTPUT_PATH}）"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅打印统计信息，不保存结果"
    )
    parser.add_argument(
        "--weight-config", type=str, default=None,
        help=('权重配置 JSON，格式: \'{"both": [0.5, 0.5], "llm_only": [0, 1], "cooccurrence_only": [1, 0]}\''
              '（默认: both=0.5/0.5, llm_only=0/1, cooccurrence_only=1/0）')
    )

    args = parser.parse_args()

    input_path = Path(args.input) if args.input else BATCH_OUTPUT_PATH
    output_path = Path(args.output) if args.output else POST_PROCESS_OUTPUT_PATH

    print("=" * 60)
    print("Task 2 Step 3.3 — 关系结果后处理（校验/去重/来源标记）")
    print("=" * 60)
    print(f"  输入路径: {input_path}")
    print(f"  输出路径: {output_path}")
    print(f"  模式: {'dry-run' if args.dry_run else '保存'}")

    # 1. 加载批量结果（合并所有批次）
    print("\n📂 加载批量提取结果（合并所有批次）...")
    batch_results = load_and_merge_all_batches(input_path)
    if not batch_results or not batch_results.get("results"):
        print("❌ 未找到批量结果，请先运行步骤 3.2")
        sys.exit(1)
    print(f"   合并后共 {batch_results.get('total_plays', 0)} 个剧本的结果")

    # 2. 加载统一数据
    print("\n📂 加载统一数据...")
    plays = load_unified_data()
    if not plays:
        print("❌ 未找到统一数据文件，请先运行步骤 3.0")
        sys.exit(1)
    print(f"   加载了 {len(plays)} 个剧本")

    # 构建查找表（含别名映射）
    print("   📂 加载别名映射用于角色名标准化...")
    plays_by_id = build_play_lookup(plays, load_aliases=True)
    print(f"   构建了 {len(plays_by_id)} 个剧本的查找表")

    # 解析权重配置
    weight_config = None
    if args.weight_config:
        try:
            weight_config = json.loads(args.weight_config)
            print(f"   ⚙️  自定义权重配置: {weight_config}")
        except json.JSONDecodeError as e:
            print(f"❌ 权重配置 JSON 解析失败: {e}")
            sys.exit(1)

    # 3. 执行后处理（含权重计算）
    print("\n🔄 执行后处理...")
    processed = post_process_batch_results(batch_results, plays_by_id, weight_config)

    # 4. 打印统计摘要
    print(f"\n{'=' * 60}")
    print(f"📊 后处理统计")
    print(f"{'=' * 60}")
    print(f"   总剧本数:     {processed['total_plays']}")
    print(f"   成功数:       {processed['success_count']}")
    print(f"   解析失败:     {processed['parse_error_count']}")
    print(f"   调用失败:     {processed['error_count']}")
    print(f"   原始关系总数:  {processed['total_raw_relations']}")
    print(f"   校验后关系数:  {processed['total_validated_relations']}")
    print(f"   合并后关系数:  {processed['total_merged_relations']}")

    # 校验统计
    vs = processed.get("validation_summary", {})
    print(f"\n   📋 校验统计:")
    print(f"      角色名不匹配跳过: {vs.get('skipped_no_char', 0)}")
    print(f"      micro_type 降级:   {vs.get('micro_downgraded', 0)}")
    print(f"      去重移除:          {vs.get('dedup_removed', 0)}")

    # 来源分布
    st_dist = processed.get("source_tag_distribution", {})
    print(f"\n   📈 来源标记分布:")
    for tag in ["both", "llm_only", "cooccurrence_only"]:
        cnt = st_dist.get(tag, 0)
        total_m = processed["total_merged_relations"]
        pct = cnt / total_m * 100 if total_m > 0 else 0
        label = {"both": "双源确认", "llm_only": "仅LLM", "cooccurrence_only": "仅共现"}[tag]
        print(f"      {tag:20s} ({label}): {cnt:5d} ({pct:5.1f}%)")

    # 权重统计
    ws = processed.get("weight_statistics", {})
    if ws:
        print(f"\n   ⚖️  权重统计（dialogue_score + plot_score → weight）:")
        for tag in ["both", "llm_only", "cooccurrence_only"]:
            stats = ws.get(tag, {})
            cnt = stats.get("count", 0)
            if cnt == 0:
                continue
            label = {"both": "双源确认", "llm_only": "仅LLM", "cooccurrence_only": "仅共现"}[tag]
            w_mean = stats.get("weight_mean", 0)
            w_min = stats.get("weight_min", 0)
            w_max = stats.get("weight_max", 0)
            d_mean = stats.get("dialogue_score_mean")
            p_mean = stats.get("plot_score_mean")
            line = f"      {tag:20s} ({label}): n={cnt:4d}  weight=[{w_min:.3f}, {w_mean:.3f}, {w_max:.3f}]"
            if d_mean is not None:
                line += f"  d_mean={d_mean:.3f}"
            if p_mean is not None:
                line += f"  p_mean={p_mean:.3f}"
            print(line)

        # 验收标准检查
        print(f"\n   ✅ 验收标准:")
        # 对数平滑效果：count=2 vs count=50 的差距对比
        linear_ratio = 2 / 50
        log_ratio = math.log(1 + 2) / math.log(1 + 50)
        print(f"      对数平滑效果: count=2/50 线性比={linear_ratio:.2f} → 对数比={log_ratio:.3f} (差距缩小)")
        # 不同 max_count 下 count=2 的 dialogue_score
        for mc in [5, 10, 20]:
            s = math.log(1 + 2) / math.log(1 + mc)
            print(f"      max_count={mc:2d} 时 count=2 → dialogue_score = {s:.3f} "
                  f"({'✅ > 0.3' if s > 0.3 else '❌ ≤ 0.3'})")
        # 检查 both 平均 weight 是否高于单源
        both_mean = ws.get("both", {}).get("weight_mean", 0)
        llm_mean = ws.get("llm_only", {}).get("weight_mean", 0)
        cooc_mean = ws.get("cooccurrence_only", {}).get("weight_mean", 0)
        if both_mean > 0:
            print(f"      both 均值 ({both_mean:.3f}) vs llm_only 均值 ({llm_mean:.3f}) "
                  f"vs cooccurrence_only 均值 ({cooc_mean:.3f})")

    # 展示几个样本
    print(f"\n   📋 样本关系（前 3 个成功剧本）:")
    shown = 0
    for r in processed["results"]:
        if not r.get("post_processed") or not r.get("relations"):
            continue
        shown += 1
        if shown > 3:
            break
        rels = r["relations"]
        print(f"\n   [{shown}] {r['剧本名']} ({r['剧目类型']}, {len(rels)}条关系)")
        for rel in rels[:3]:
            tag = rel.get("source_tag", "?")
            w = rel.get("weight")
            w_str = f"{w:.3f}" if w is not None else "N/A"
            d = rel.get("dialogue_score")
            d_str = f"{d:.3f}" if d is not None else "N/A"
            p = rel.get("plot_score")
            p_str = f"{p:.3f}" if p is not None else "N/A"
            print(f"       {rel['source']} → {rel['target']}  "
                  f"[{rel['macro_type']}/{rel['micro_type']}]  "
                  f"tag={tag} d={d_str} p={p_str} w={w_str}")
        if len(rels) > 3:
            print(f"       ... 还有 {len(rels) - 3} 条")

    # 5. 保存
    if not args.dry_run:
        save_post_processed_results(processed, output_path)
    else:
        print(f"\n⚠️  dry-run 模式，未保存结果")

    print(f"\n✅ 步骤 3.3 完成！")


# ──────────────────────────────────────────────────────────────────────
# 步骤 3.5 — 全量运行与结果导出
# ──────────────────────────────────────────────────────────────────────

FINAL_EXPORT_PATH = DB_EXPORTS_DIR / "角色关系.json"
FINAL_CHECKPOINT_PATH = OUTPUT_DIR / "角色关系_checkpoint.json"


def build_final_export(post_processed: dict,
                       plays_by_id: dict[int, dict] | None = None,
                       all_plays: list[dict] | None = None,
                       weight_config: dict[str, list[float]] | None = None) -> dict:
    """
    将后处理结果转换为最终导出格式。

    相比旧版，新增逻辑：
    - 遍历 all_plays 中所有 1473 个剧本
    - 仅有共现数据、无 LLM 提取的剧本 → 生成 cooccurrence_only 关系
    - 无共现也无 LLM 的剧本 → 导出为空 relations 列表
    - 同名剧本通过添加 entity_id 后缀区分（如 "五雷阵#6012"）

    输出结构:
    {
      "metadata": { ... 统计信息 ... },
      "plays": {
        "剧本名" 或 "剧本名#entity_id": {
          "entity_id": int,
          "剧目类型": "...",
          "relations": [ ... ]
        }
      }
    }
    """
    results = post_processed.get("results", [])
    plays_export = {}
    total_relations = 0

    # 统计计数器
    by_source_tag = Counter()
    by_macro_type = Counter()
    by_micro_type = Counter()
    all_weights = []

    # 收集所有剧本名，用于检测重复
    name_usage: dict[str, list[int]] = {}  # name -> [entity_id, ...]
    if all_plays is not None:
        for p in all_plays:
            pn = p.get("剧本名", "") or p.get("name", "")
            eid = p.get("entity_id")
            if pn and eid is not None:
                name_usage.setdefault(pn, []).append(eid)
    elif plays_by_id is not None:
        for eid, play in plays_by_id.items():
            pn = play.get("剧本名", "") or play.get("name", "")
            if pn:
                name_usage.setdefault(pn, []).append(eid)

    # 构建辅助函数：决定导出 key
    def _export_key(play_name: str, entity_id: int | None) -> str:
        if entity_id is None:
            return play_name
        ids = name_usage.get(play_name, [])
        if len(ids) > 1:
            return f"{play_name}#{entity_id}"
        return play_name

    # ── 第一轮：处理 LLM 后处理结果 ──
    llm_processed_ids = set()
    for r in results:
        entity_id = r.get("entity_id")
        if entity_id is not None:
            llm_processed_ids.add(entity_id)

        play_name = r.get("剧本名", "")
        genre = r.get("剧目类型", "")
        export_key = _export_key(play_name, entity_id)

        if not r.get("post_processed") or not r.get("relations"):
            # 即使 post_processed 失败，也尝试保留（共现数据可能存在）
            if play_name and export_key not in plays_export:
                # 尝试为 parse_error/error 的剧本补充共现数据
                if entity_id is not None and plays_by_id is not None:
                    play = plays_by_id.get(entity_id)
                    if play and play.get("共现边列表"):
                        cooccur_edges = play["共现边列表"]
                        cooc_only_rels = _build_cooccurrence_only_relations(cooccur_edges)
                        cooc_only_rels = compute_weights_for_play(cooc_only_rels, weight_config)
                        for rel in cooc_only_rels:
                            by_source_tag[rel["source_tag"]] += 1
                            by_macro_type[rel["macro_type"]] += 1
                            by_micro_type[rel["micro_type"]] += 1
                            if rel.get("weight") is not None:
                                all_weights.append(rel["weight"])
                        total_relations += len(cooc_only_rels)
                        plays_export[export_key] = {
                            "entity_id": entity_id,
                            "剧目类型": genre,
                            "relations": cooc_only_rels,
                        }
                        continue
                # 无共现数据，导出空 relations
                if play_name:
                    plays_export[export_key] = {
                        "entity_id": entity_id,
                        "剧目类型": genre,
                        "relations": [],
                    }
            continue

        relations = r["relations"]

        # 清理关系字段（移除内部元数据）
        clean_relations = []
        for rel in relations:
            clean_rel = {
                "source": rel["source"],
                "target": rel["target"],
                "macro_type": rel["macro_type"],
                "micro_type": rel["micro_type"],
                "direction": rel.get("direction", "bidirectional"),
                "source_tag": rel["source_tag"],
                "weight": rel.get("weight"),
                "dialogue_score": rel.get("dialogue_score"),
                "plot_score": rel.get("plot_score"),
                "confidence": rel.get("confidence"),
                "evidence": rel.get("evidence"),
                "context_scene": rel.get("context_scene"),
                "cooccurrence_count": rel.get("cooccurrence_count"),
            }
            clean_relations.append(clean_rel)

            # 统计
            by_source_tag[rel["source_tag"]] += 1
            by_macro_type[rel["macro_type"]] += 1
            by_micro_type[rel["micro_type"]] += 1
            if rel.get("weight") is not None:
                all_weights.append(rel["weight"])

        total_relations += len(clean_relations)

        plays_export[export_key] = {
            "entity_id": entity_id,
            "剧目类型": genre,
            "relations": clean_relations,
        }

    # ── 第二轮：补充仅有共现数据、未经过 LLM 提取的剧本 ──
    if plays_by_id is not None:
        cooc_only_play_count = 0
        for entity_id, play in plays_by_id.items():
            if entity_id in llm_processed_ids:
                continue  # 已在第一轮处理
            play_name = play.get("剧本名", "") or play.get("name", "")
            genre = play.get("剧目类型", "")
            if not play_name:
                continue
            export_key = _export_key(play_name, entity_id)
            cooccur_edges = play.get("共现边列表", [])
            if cooccur_edges:
                cooc_only_rels = _build_cooccurrence_only_relations(cooccur_edges)
                cooc_only_rels = compute_weights_for_play(cooc_only_rels, weight_config)
                for rel in cooc_only_rels:
                    by_source_tag[rel["source_tag"]] += 1
                    by_macro_type[rel["macro_type"]] += 1
                    by_micro_type[rel["micro_type"]] += 1
                    if rel.get("weight") is not None:
                        all_weights.append(rel["weight"])
                total_relations += len(cooc_only_rels)
                plays_export[export_key] = {
                    "entity_id": entity_id,
                    "剧目类型": genre,
                    "relations": cooc_only_rels,
                }
                cooc_only_play_count += 1
            else:
                # 无共现也无 LLM → 空导出
                plays_export[export_key] = {
                    "entity_id": entity_id,
                    "剧目类型": genre,
                    "relations": [],
                }
        if cooc_only_play_count > 0:
            print(f"   📌 补充了 {cooc_only_play_count} 个仅有共现数据的剧本")

    # ── 第三轮：补充 all_plays 中既无 LLM 也无 plays_by_id 的剧本 ──
    if all_plays is not None:
        missing_count = 0
        for p in all_plays:
            name = p.get("剧本名", "") or p.get("name", "")
            eid = p.get("entity_id")
            if name and eid is not None:
                export_key = _export_key(name, eid)
                if export_key not in plays_export:
                    genre = p.get("剧目类型", "")
                    plays_export[export_key] = {
                        "entity_id": eid,
                        "剧目类型": genre,
                        "relations": [],
                    }
                    missing_count += 1
        if missing_count > 0:
            print(f"   📌 补充了 {missing_count} 个无关系数据的剧本（空导出）")

    # micro_type Top-20
    micro_top20 = [item[0] for item in by_micro_type.most_common(20)]

    # 权重分布统计
    weight_stats = {}
    if all_weights:
        weight_stats = {
            "mean": round(sum(all_weights) / len(all_weights), 4),
            "min": round(min(all_weights), 4),
            "max": round(max(all_weights), 4),
            "median": round(sorted(all_weights)[len(all_weights) // 2], 4),
        }

    metadata = {
        "total_plays": len(plays_export),
        "total_relations": total_relations,
        "by_source_tag": dict(by_source_tag),
        "by_macro_type": dict(by_macro_type),
        "by_micro_type_top": micro_top20,
        "weight_statistics": weight_stats,
        "duplicate_names": len({k for k, v in name_usage.items() if len(v) > 1}),
        "post_processed_at": post_processed.get("post_processed_at", ""),
        "exported_at": datetime.now().isoformat(),
    }

    return {"metadata": metadata, "plays": plays_export}


def _build_cooccurrence_only_relations(cooccur_edges: list[dict]) -> list[dict]:
    """
    从共现边列表构建 cooccurrence_only 关系列表（无 LLM 数据的剧本）。
    """
    relations = []
    for edge in cooccur_edges:
        a = edge.get("character_a", "")
        b = edge.get("character_b", "")
        if not a or not b:
            continue
        relations.append({
            "source": a,
            "target": b,
            "macro_type": "中立",
            "micro_type": "同场",
            "direction": "bidirectional",
            "confidence": None,
            "evidence": None,
            "context_scene": ", ".join(edge.get("scenes", [])[:3]),
            "source_tag": "cooccurrence_only",
            "dialogue_score": None,   # 稍后由 compute_weight 计算
            "plot_score": None,
            "weight": None,
            "cooccurrence_count": edge.get("count", 0),
            "cooccurrence_scenes": edge.get("scenes", []),
        })
    return relations


def save_final_export(export: dict,
                      output_path: Path = FINAL_EXPORT_PATH,
                      checkpoint_path: Path = FINAL_CHECKPOINT_PATH) -> None:
    """保存最终导出文件和检查点"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 保存主文件
    with open(str(output_path), "w", encoding="utf-8") as f:
        json.dump(export, f, ensure_ascii=False, indent=2)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"💾 最终导出已保存到: {output_path} ({size_mb:.2f} MB)")

    # 保存检查点（不含 relations 详情，仅 metadata + 剧本信息列表）
    play_info = [
        {"key": k, "entity_id": v.get("entity_id"), "剧目类型": v.get("剧目类型", ""),
         "relations_count": len(v.get("relations", []))}
        for k, v in export["plays"].items()
    ]
    checkpoint = {
        "exported_at": export["metadata"]["exported_at"],
        "total_plays": export["metadata"]["total_plays"],
        "total_relations": export["metadata"]["total_relations"],
        "plays": play_info,
    }
    with open(str(checkpoint_path), "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    print(f"💾 检查点已保存到: {checkpoint_path}")


def print_final_summary(export: dict) -> None:
    """打印最终导出的统计摘要"""
    meta = export["metadata"]
    plays = export["plays"]

    print(f"\n{'=' * 60}")
    print(f"📊 Task 2 最终导出统计")
    print(f"{'=' * 60}")
    print(f"   总剧本数:     {meta['total_plays']}")
    print(f"   总关系数:     {meta['total_relations']}")

    # 平均关系数
    if meta["total_plays"] > 0:
        avg = meta["total_relations"] / meta["total_plays"]
        print(f"   平均关系/剧本: {avg:.1f}")

    # 来源分布
    print(f"\n   📈 来源标记分布:")
    for tag in ["both", "llm_only", "cooccurrence_only"]:
        cnt = meta["by_source_tag"].get(tag, 0)
        pct = cnt / meta["total_relations"] * 100 if meta["total_relations"] > 0 else 0
        label = {"both": "双源确认", "llm_only": "仅LLM", "cooccurrence_only": "仅共现"}[tag]
        print(f"      {tag:20s} ({label}): {cnt:5d} ({pct:5.1f}%)")

    # 宏观类型分布
    print(f"\n   📈 宏观关系类型分布:")
    for macro, cnt in sorted(meta["by_macro_type"].items(), key=lambda x: -x[1]):
        pct = cnt / meta["total_relations"] * 100 if meta["total_relations"] > 0 else 0
        print(f"      {macro:10s}: {cnt:5d} ({pct:5.1f}%)")

    # 微观类型 Top-10
    print(f"\n   📈 微观关系类型 Top-10:")
    micro_counter = Counter()
    for play_data in plays.values():
        for rel in play_data["relations"]:
            micro_counter[rel["micro_type"]] += 1
    for micro, cnt in micro_counter.most_common(10):
        pct = cnt / meta["total_relations"] * 100 if meta["total_relations"] > 0 else 0
        print(f"      {micro:15s}: {cnt:5d} ({pct:5.1f}%)")

    # 权重统计
    ws = meta.get("weight_statistics", {})
    if ws:
        print(f"\n   ⚖️  权重统计:")
        print(f"      mean={ws.get('mean', 0):.4f}  min={ws.get('min', 0):.4f}  "
              f"max={ws.get('max', 0):.4f}  median={ws.get('median', 0):.4f}")

    # 剧目类型分布
    genre_counter = Counter()
    for play_data in plays.values():
        genre_counter[play_data["剧目类型"]] += 1
    print(f"\n   📈 剧目类型分布:")
    for genre, cnt in genre_counter.most_common():
        print(f"      {genre:10s}: {cnt:4d} 部剧本")

    # 按剧目类型统计平均关系数
    print(f"\n   📈 各剧目类型平均关系数:")
    genre_rel_count = defaultdict(list)
    for play_data in plays.values():
        genre_rel_count[play_data["剧目类型"]].append(len(play_data["relations"]))
    for genre, counts in sorted(genre_rel_count.items(), key=lambda x: -sum(x[1])/len(x[1])):
        avg = sum(counts) / len(counts)
        print(f"      {genre:10s}: {avg:.1f} ({len(counts)} 部)")


def _load_json_auto(fpath: Path) -> dict:
    """
    自动检测文件编码并加载 JSON。
    先尝试普通读取，失败后尝试 gzip 解压（处理 .json 后缀但实际为 gzip 的情况）。
    """
    # 先按后缀判断
    if fpath.suffix == ".gz":
        with gzip.open(str(fpath), "rt", encoding="utf-8") as f:
            return json.load(f)
    # 尝试普通读取
    try:
        with open(str(fpath), "r", encoding="utf-8") as f:
            return json.load(f)
    except (UnicodeDecodeError, json.JSONDecodeError):
        # 可能是 .json 后缀但实际为 gzip
        try:
            with gzip.open(str(fpath), "rt", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            raise


def load_and_merge_all_batches(primary_path: Path = BATCH_OUTPUT_PATH) -> dict:
    """
    加载并合并所有批次的提取结果。

    查找 OUTPUT_DIR 下所有 relations_batch_*.json* 文件，以及主批次文件，
    按 entity_id 去重（后加载的覆盖先前的），返回合并后的结果字典。

    Args:
        primary_path: 主批次文件路径

    Returns:
        合并后的结果字典（结构同 load_batch_results 返回值）
    """
    all_results = []
    seen_ids = set()

    # 收集所有批次文件
    batch_files = sorted(OUTPUT_DIR.glob("relations_batch_*.json*"))
    # 确保主文件在最后（优先级最高）
    if primary_path in batch_files:
        batch_files.remove(primary_path)
    batch_files.append(primary_path)

    for fpath in batch_files:
        try:
            data = _load_json_auto(fpath)
            results = data.get("results", [])
            added = 0
            for r in results:
                eid = r.get("entity_id")
                if eid is not None and eid not in seen_ids:
                    seen_ids.add(eid)
                    all_results.append(r)
                    added += 1
            print(f"   📄 {fpath.name}: {len(results)} 条 (新增 {added} 条)")
        except Exception as e:
            print(f"   ⚠️  加载 {fpath.name} 失败: {e}")

    # 构建合并后的输出
    merged = {
        "merged_at": datetime.now().isoformat(),
        "total_plays": len(all_results),
        "success_count": sum(1 for r in all_results if r.get("status") == "success"),
        "total_relations": sum(r.get("relations_count", 0) for r in all_results),
        "results": all_results,
    }

    return merged


def main_step_3_5():
    """
    步骤 3.5 命令行入口：全量后处理与最终导出。

    流程：
    1. 加载批量提取结果（步骤 3.2 产出）
    2. 加载统一数据（步骤 3.0 产出）
    3. 执行完整后处理（校验/去重/来源标记/权重计算）
    4. 导出为最终 JSON 格式（含 metadata）
    5. 打印统计摘要
    """
    parser = argparse.ArgumentParser(
        description="Task 2 Step 3.5 — 全量后处理与最终导出",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 执行全量后处理并导出
  python scripts/batch_extract_relations.py --export

  # 指定输出路径
  python scripts/batch_extract_relations.py --export --final-output data/db_exports/角色关系.json

  # dry-run 模式（仅打印统计，不保存）
  python scripts/batch_extract_relations.py --export --dry-run
        """,
    )

    parser.add_argument(
        "--export", action="store_true", required=True,
        help="执行步骤 3.5 全量导出"
    )
    parser.add_argument(
        "--batch-input", type=str, default=None,
        help=f"批量结果输入路径（默认: {BATCH_OUTPUT_PATH}）"
    )
    parser.add_argument(
        "--final-output", type=str, default=None,
        help=f"最终导出路径（默认: {FINAL_EXPORT_PATH}）"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅打印统计信息，不保存结果"
    )
    parser.add_argument(
        "--weight-config", type=str, default=None,
        help='权重配置 JSON'
    )

    args = parser.parse_args()

    batch_input = Path(args.batch_input) if args.batch_input else BATCH_OUTPUT_PATH
    final_output = Path(args.final_output) if args.final_output else FINAL_EXPORT_PATH

    print("=" * 60)
    print("Task 2 Step 3.5 — 全量后处理与最终导出")
    print("=" * 60)
    print(f"  批量结果: {batch_input}")
    print(f"  最终导出: {final_output}")
    print(f"  模式: {'dry-run' if args.dry_run else '保存'}")

    # 1. 加载批量结果（合并所有批次）
    print("\n📂 加载批量提取结果（合并所有批次）...")
    batch_results = load_and_merge_all_batches(batch_input)
    if not batch_results or not batch_results.get("results"):
        print("❌ 未找到批量结果，请先运行步骤 3.2")
        sys.exit(1)
    print(f"   合并后共 {batch_results.get('total_plays', 0)} 个剧本的结果")

    # 2. 加载统一数据
    print("\n📂 加载统一数据...")
    plays = load_unified_data()
    if not plays:
        print("❌ 未找到统一数据文件，请先运行步骤 3.0")
        sys.exit(1)
    print(f"   加载了 {len(plays)} 个剧本")

    # 构建查找表
    print("   📂 加载别名映射用于角色名标准化...")
    plays_by_id = build_play_lookup(plays, load_aliases=True)
    print(f"   构建了 {len(plays_by_id)} 个剧本的查找表")

    # 解析权重配置
    weight_config = None
    if args.weight_config:
        try:
            weight_config = json.loads(args.weight_config)
        except json.JSONDecodeError as e:
            print(f"❌ 权重配置 JSON 解析失败: {e}")
            sys.exit(1)

    # 3. 执行后处理
    print("\n🔄 执行全量后处理...")
    processed = post_process_batch_results(batch_results, plays_by_id, weight_config)

    # 4. 构建最终导出（传入 plays_by_id 和 plays 列表以补充仅有共现数据的剧本）
    print("\n📦 构建最终导出格式...")
    export = build_final_export(processed, plays_by_id=plays_by_id,
                                all_plays=plays, weight_config=weight_config)

    # 5. 打印统计摘要
    print_final_summary(export)

    # 6. 保存
    if not args.dry_run:
        save_final_export(export, final_output)
    else:
        print(f"\n⚠️  dry-run 模式，未保存结果")

    print(f"\n✅ 步骤 3.5 完成！")


# ──────────────────────────────────────────────────────────────────────
# 命令行入口（Step 3.2）
# ──────────────────────────────────────────────────────────────────────

def main_step_3_2():
    """步骤 3.2 命令行入口：批量角色关系提取"""
    parser = argparse.ArgumentParser(
        description="Task 2 Step 3.2 — 批量角色关系提取（LLM 增强版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 处理全部剧本
  python scripts/batch_extract_relations.py --all

  # 随机采样 10 个剧本测试
  python scripts/batch_extract_relations.py --sample 10

  # 指定剧本 ID
  python scripts/batch_extract_relations.py --ids 123,456,789

  # 从断点恢复
  python scripts/batch_extract_relations.py --all --resume

  # 不使用断点续传（从头开始）
  python scripts/batch_extract_relations.py --all --no-resume
        """,
    )

    # 互斥的剧本选择参数
    select_group = parser.add_mutually_exclusive_group(required=True)
    select_group.add_argument(
        "--all", action="store_true",
        help="处理全部剧本"
    )
    select_group.add_argument(
        "--sample", type=int, metavar="N",
        help="随机采样 N 个剧本处理"
    )
    select_group.add_argument(
        "--ids", type=str, metavar="id1,id2,...",
        help="指定剧本 entity_id（逗号分隔）"
    )

    # 其他参数
    parser.add_argument(
        "--resume", action="store_true", default=True,
        help="从断点恢复（默认启用）"
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="不使用断点续传，从头开始"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help=f"输出文件路径（默认: {BATCH_OUTPUT_PATH}）"
    )
    parser.add_argument(
        "--delay", type=float, default=1.0,
        help="每次 LLM 请求间隔秒数（默认 1.0）"
    )
    parser.add_argument(
        "--retries", type=int, default=3,
        help="单次 LLM 调用失败后最大重试次数（默认 3）"
    )

    args = parser.parse_args()

    # 解析参数
    resume = not args.no_resume
    output_path = Path(args.output) if args.output else BATCH_OUTPUT_PATH

    # 确定选择模式
    if args.all:
        mode = "all"
        sample_n = 0
        target_ids = None
    elif args.sample:
        mode = "sample"
        sample_n = args.sample
        target_ids = None
    elif args.ids:
        mode = "ids"
        sample_n = 0
        target_ids = [int(x.strip()) for x in args.ids.split(",")]
    else:
        parser.error("必须指定 --all, --sample N, 或 --ids id1,id2,...")

    # 打印启动信息
    print("=" * 60)
    print("Task 2 Step 3.2 — 批量角色关系提取（LLM 增强版）")
    print("=" * 60)
    print(f"  选择模式: {'全部' if mode == 'all' else f'采样 {sample_n}' if mode == 'sample' else f'指定 ID ({len(target_ids)} 个)'}")
    print(f"  断点续传: {'是' if resume else '否'}")
    print(f"  请求间隔: {args.delay}s")
    print(f"  最大重试: {args.retries} 次")
    print(f"  输出路径: {output_path}")

    # 1. 加载统一数据
    print("\n📂 加载统一数据...")
    plays = load_unified_data()
    if not plays:
        print("❌ 未找到统一数据文件，请先运行步骤 3.0")
        sys.exit(1)
    print(f"   加载了 {len(plays)} 个剧本")

    # 1.5 加载 checkpoint（用于筛选时跳过已处理的剧本）
    skip_ids = set()
    if resume:
        checkpoint = load_checkpoint()
        skip_ids = get_checkpoint_success_ids(checkpoint)
        if skip_ids:
            print(f"   📋 checkpoint 已有 {len(skip_ids)} 条成功记录")

    # 2. 筛选待处理剧本（传入 skip_ids 以跳过已处理的）
    selected = select_plays(plays, mode=mode, sample_n=sample_n,
                            target_ids=target_ids, skip_ids=skip_ids)
    print(f"   筛选了 {len(selected)} 个剧本")

    if not selected:
        print("❌ 没有匹配的剧本，请检查筛选条件")
        sys.exit(1)

    # 3. 初始化 LLM
    print("\n🤖 初始化 LLM...")
    try:
        llm = get_llm()
        print("   ✅ LLM 加载成功")
    except Exception as e:
        print(f"   ❌ LLM 加载失败: {e}")
        sys.exit(1)

    # 4. 执行批量提取
    summary = run_batch_extraction(
        plays=selected,
        llm=llm,
        resume=resume,
        max_retries=args.retries,
        delay=args.delay,
        output_path=output_path,
    )

    print(f"\n✅ 步骤 3.2 完成！")
    if summary["failed"] > 0:
        print(f"   ⚠️  有 {summary['failed']} 个剧本失败，可使用 --resume 重试")


# ──────────────────────────────────────────────────────────────────────
# 主入口路由
# ──────────────────────────────────────────────────────────────────────

def main():
    """
    主入口：根据命令行参数路由到不同步骤。

    - 无参数: 运行步骤 3.0（数据准备）
    - --all/--sample/--ids: 运行步骤 3.2（批量提取）
    - --post-process: 运行步骤 3.3（结果后处理）
    - --export: 运行步骤 3.5（全量导出）
    """
    # 检查是否有步骤 3.5 的参数
    if "--export" in sys.argv:
        main_step_3_5()
    # 检查是否有步骤 3.3 的参数
    elif "--post-process" in sys.argv:
        main_step_3_3()
    # 检查是否有步骤 3.2 的参数
    elif any(arg in sys.argv for arg in ["--all", "--sample", "--ids", "--help", "-h"]):
        main_step_3_2()
    else:
        # 默认运行步骤 3.0
        print("=" * 60)
        print("Task 2 Step 3.0 — 数据准备与探查")
        print("=" * 60)

        # 1. 加载数据
        data = load_all_data()

        # 2. 构建统一数据结构
        plays = build_unified_play_data(data)

        # 3. 数据质量检查
        print("\n🔍 数据质量检查:")
        warnings = check_data_quality(plays)
        for w in warnings:
            print(f"   {w}")

        # 4. 打印数据摘要
        print_data_summary(plays)

        # 5. 展示样本
        show_sample_plays(plays, n=3)

        # 6. 保存
        save_unified_data(plays)

        print("\n✅ 步骤 3.0 完成！")
        print(f"   下一步: 使用统一数据结构进行 LLM 关系提取（步骤 3.2）")
        print(f"   运行: python scripts/batch_extract_relations.py --sample 5")


if __name__ == "__main__":
    main()
