#!/usr/bin/env python3
"""
enrich_opera_data.py — 京剧故事丝带数据增强管线

从原始剧本 JSON（data/raw/dataSet/）中提取：
  1. 场景级原文对白 (text/dialogue) → 支撑 T5 原文关联
  2. 角色级原文引用 (evidence) → 支撑 T4 AI 解释
  3. 增强情感分析 (emotion_detail, emotion_score) → 丰富火花图
  4. 数据质量置信度 (confidence) → 支撑 T4 信任校准

输出: 增强后的 opera-samples.json（覆盖原文件 + 备份）

用法:
    python scripts/enrich_opera_data.py                    # 处理全部样本
    python scripts/enrich_opera_data.py --dry-run          # 仅分析不写入
    python scripts/enrich_opera_data.py --verbose          # 详细输出
"""

import json
import re
import os
import sys
import argparse
import math
from pathlib import Path
from collections import Counter, defaultdict
from typing import Optional, Dict, List, Any

# ── 路径配置 ───────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "raw" / "dataSet"
SAMPLES_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.json"
BACKUP_FILE = PROJECT_ROOT / "src" / "data" / "opera-samples.backup.json"
OUTPUT_FILE = SAMPLES_FILE  # 直接覆盖（备份已保存）

# ── 情感词典（扩展版）─────────────────────────────────────────
POSITIVE_WORDS = {
    "忠", "义", "仁", "孝", "爱", "喜", "欢", "乐", "笑", "贤", "良", "善", "美", "好",
    "胜", "成", "功", "荣", "贵", "福", "吉", "祥", "兴", "隆", "盛", "安", "康", "宁",
    "勇", "烈", "刚", "强", "豪", "杰", "英", "雄", "威", "武",
    "赏", "封", "拜", "赐", "贺", "庆", "升", "晋",
}

NEGATIVE_WORDS = {
    "悲", "哀", "怨", "恨", "怒", "杀", "死", "亡", "哭", "苦", "愁", "忧", "伤", "痛",
    "败", "失", "祸", "凶", "惨", "凄", "凉", "寒", "孤", "独", "离", "别", "弃", "叛",
    "奸", "诈", "贼", "盗", "寇", "仇", "辱", "羞", "耻", "惧", "怕", "惊", "恐",
    "斩", "诛", "罚", "贬", "罢", "废", "囚", "困",
}

# 情感强度修饰词
INTENSIFIERS = {
    "十分": 1.5, "非常": 1.4, "极为": 1.6, "甚是": 1.3, "好不": 1.3,
    "万分": 1.7, "何等": 1.4, "如此": 1.2, "这般": 1.2, "太": 1.3,
    "略": 0.6, "稍": 0.5, "微": 0.4, "颇": 1.1,
}

# 情感转折词
TRANSITION_WORDS = {
    "却": "contrast", "但": "contrast", "然而": "contrast", "可是": "contrast",
    "忽然": "sudden", "突然": "sudden", "不料": "unexpected",
    "竟然": "surprise", "果然": "confirmation", "原来": "revelation",
}

# ── 工具函数 ──────────────────────────────────────────────────

def find_raw_file(file_name: str) -> Optional[Path]:
    """在 dataSet 目录树中递归查找原始 JSON 文件"""
    file_name = file_name.replace(".json", "")
    for root, dirs, files in os.walk(DATA_DIR):
        for f in files:
            if file_name in f or f.startswith(file_name):
                return Path(root) / f
    return None


def parse_scene_dialogue(full_dialogue: str) -> List[Dict[str, Any]]:
    """
    将 正文对话 按 【第X场】 标记分割为场景级对白。

    Returns:
        [{scene_num, scene_label, text, characters: {name: [lines]}}, ...]
    """
    if not full_dialogue:
        return []

    # 按 【第X场】 分割（支持中文数字和阿拉伯数字）
    scene_pattern = re.compile(r'【第([一二三四五六七八九十百千万\d]+)场】')
    parts = scene_pattern.split(full_dialogue)

    scenes = []
    # parts[0] 是第一个场景标记之前的内容（通常为空或前言）
    for i in range(1, len(parts), 2):
        scene_num_str = parts[i]
        scene_text = parts[i + 1] if i + 1 < len(parts) else ""

        # 将中文数字转为阿拉伯数字
        scene_num = _chinese_to_int(scene_num_str)

        # 提取场景中的所有角色名及其对白
        char_lines = _extract_char_lines(scene_text)

        scenes.append({
            "scene_num": scene_num,
            "scene_label": f"第{scene_num_str}场",
            "text": scene_text.strip(),
            "characters": char_lines,
        })

    return scenes


def _chinese_to_int(s: str) -> int:
    """中文数字 → 整数"""
    if s.isdigit():
        return int(s)

    cn_map = {
        "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
        "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
        "百": 100, "千": 1000, "万": 10000,
    }
    result = 0
    temp = 0
    for ch in s:
        if ch in cn_map:
            val = cn_map[ch]
            if val >= 10:
                if temp == 0:
                    temp = 1
                result += temp * val
                temp = 0
            else:
                temp = val
        else:
            return -1
    result += temp
    return result


def _extract_char_lines(scene_text: str) -> Dict[str, List[str]]:
    """
    从场景文本中提取每个角色的台词。

    格式示例:
        诸葛亮 （念） 兵扎祁山地，要擒司马懿。
        旗牌 （白） 来此已是。门上哪位在？

    Returns:
        {角色名: [台词行, ...]}
    """
    char_lines: Dict[str, List[str]] = defaultdict(list)

    # 匹配模式: 角色名 （表演类型） 内容
    # 表演类型: 念、白、唱、哭、笑、内白、叫头 等
    patterns = [
        re.compile(r'^(\S{1,4})\s*[（(]([^）)]*)[）)]\s*(.+)', re.MULTILINE),
    ]

    for line in scene_text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # 跳过舞台指示行（以括号开头但不含角色名-表演标记格式的）
        if line.startswith('（') and '）' in line[:15] and not any(
            kw in line[:15] for kw in ['念', '白', '唱', '哭', '笑']
        ):
            continue

        for pat in patterns:
            m = pat.match(line)
            if m:
                char_name = m.group(1).strip()
                perf_type = m.group(2).strip()
                content = m.group(3).strip()

                # 过滤：角色名不应是表演类型关键词
                if char_name in {'唱', '念', '白', '做', '打', '哭', '笑', '上', '下', '内'}:
                    continue

                char_lines[char_name].append({
                    "perf_type": perf_type,
                    "text": content,
                })
                break

    return dict(char_lines)


def compute_emotion_detail(char_lines_in_scene: List[Dict], scene_text: str) -> Dict[str, Any]:
    """
    基于角色台词计算细粒度情感分析。

    Returns:
        {
            emotion_label: str,       # 情感标签
            emotion_score: float,     # -1.0 ~ 1.0
            emotion_confidence: float, # 0~1 置信度
            emotion_detail: str,      # 人类可读的情感描述
            evidence_lines: [str],    # 原文证据
            transition_detected: bool, # 是否有情感转折
        }
    """
    if not char_lines_in_scene:
        return {
            "emotion_label": "neutral",
            "emotion_score": 0.0,
            "emotion_confidence": 0.1,
            "emotion_detail": "该角色在本场景中无对白",
            "evidence_lines": [],
            "transition_detected": False,
        }

    all_text = " ".join(cl["text"] for cl in char_lines_in_scene)

    # 计算正/负向情感词数
    pos_count = sum(1 for w in POSITIVE_WORDS if w in all_text)
    neg_count = sum(1 for w in NEGATIVE_WORDS if w in all_text)

    # 考虑修饰词放大/缩小
    intensifier_mult = 1.0
    for intens, mult in INTENSIFIERS.items():
        if intens in all_text:
            intensifier_mult = max(intensifier_mult, mult)

    total = pos_count + neg_count
    if total == 0:
        emotion_score = 0.0
        confidence = 0.3
    else:
        raw_score = (pos_count - neg_count) / total
        emotion_score = max(-1.0, min(1.0, raw_score * intensifier_mult))
        confidence = min(0.9, 0.3 + total * 0.15)

    # 检测情感转折
    transition_detected = any(tw in all_text for tw in TRANSITION_WORDS)

    # 生成人类可读的情感标签和描述
    if emotion_score > 0.5:
        label = "强烈正面"
        detail = f"台词中正面词汇({pos_count}个)显著多于负面词汇({neg_count}个)"
    elif emotion_score > 0.15:
        label = "偏正面"
        detail = f"整体情绪偏正面，正面词汇{pos_count}个，负面词汇{neg_count}个"
    elif emotion_score > -0.15:
        label = "中性"
        detail = "情绪平和，正负面词汇基本均衡"
    elif emotion_score > -0.5:
        label = "偏负面"
        detail = f"整体情绪偏负面，负面词汇{neg_count}个，正面词汇{pos_count}个"
    else:
        label = "强烈负面"
        detail = f"台词中负面词汇({neg_count}个)显著多于正面词汇({pos_count}个)"

    if transition_detected:
        detail += "；检测到情感转折词"

    # 提取证据行（最多3行有代表性的台词）
    evidence_texts = [cl["text"] for cl in char_lines_in_scene if len(cl["text"]) > 4]
    evidence_lines = evidence_texts[:3]

    return {
        "emotion_label": label,
        "emotion_score": round(emotion_score, 3),
        "emotion_confidence": round(confidence, 3),
        "emotion_detail": detail,
        "evidence_lines": evidence_lines,
        "transition_detected": transition_detected,
    }


def compute_scene_sentiment(scene_text: str, char_emotions: List[Dict]) -> Dict[str, Any]:
    """
    基于场景整体文本和角色情感，计算场景级情感指标。

    Returns 增强的 ratings 字段。
    """
    # 全局情感词统计
    pos_count = sum(1 for w in POSITIVE_WORDS if w in scene_text)
    neg_count = sum(1 for w in NEGATIVE_WORDS if w in scene_text)

    total = pos_count + neg_count
    if total == 0:
        sentiment = 0.0
        sentiment_confidence = 0.2
    else:
        sentiment = (pos_count - neg_count) / max(total, 1)
        sentiment_confidence = min(0.85, 0.3 + total * 0.1)

    # 基于角色情感聚合
    char_scores = [e.get("emotion_score", 0) for e in char_emotions if e]
    char_sentiment = sum(char_scores) / max(len(char_scores), 1) if char_scores else 0.0

    # 混合得分
    blended_sentiment = round(sentiment * 0.6 + char_sentiment * 0.4, 3)

    return {
        "sentiment": blended_sentiment,
        "sentiment_confidence": round(sentiment_confidence, 3),
        "pos_word_count": pos_count,
        "neg_word_count": neg_count,
    }


def compute_confidence(data_quality: Dict[str, Any]) -> float:
    """
    综合评估数据质量，生成置信度分数 0~1。

    考量因素:
      - 是否有完整对白文本
      - 是否有明确的角色标注
      - 情感分析的证据充分度
      - 场景划分清晰度
    """
    score = 0.0

    # 有原始对白: +0.4
    if data_quality.get("has_text", False):
        score += 0.4

    # 角色标注完整: +0.2
    if data_quality.get("chars_labeled", 0) > 0:
        score += 0.2

    # 情感证据充分: +0.2
    if data_quality.get("emotion_evidence_count", 0) >= 2:
        score += 0.2

    # 文本长度合理: +0.2
    text_len = data_quality.get("text_length", 0)
    if text_len > 200:
        score += 0.1
    if text_len > 500:
        score += 0.1

    return round(min(0.95, score), 3)


# ── 主流程 ────────────────────────────────────────────────────

def enrich_opera_samples(dry_run: bool = False, verbose: bool = False) -> Dict[str, Any]:
    """
    对 opera-samples.json 中的所有剧本执行数据增强。

    Returns:
        增强后的完整数据字典
    """
    # 1. 加载现有样本数据
    with open(SAMPLES_FILE, 'r', encoding='utf-8') as f:
        samples = json.load(f)

    # 过滤掉 $schema 等非数据键
    operas = {k: v for k, v in samples.items() if isinstance(v, dict)}

    print(f"📂 加载了 {len(operas)} 部剧本样本")
    print(f"📂 原始数据目录: {DATA_DIR}")
    print()

    enriched_count = 0
    skipped_count = 0
    total_scenes_enriched = 0
    total_chars_enhanced = 0

    for key, opera in operas.items():
        title = opera.get('title', key)
        source_file = opera.get('source_file', '')

        if verbose:
            print(f"\n{'='*60}")
            print(f"处理: {title} ({source_file})")

        # 2. 查找原始数据文件
        raw_path = find_raw_file(source_file) if source_file else None

        if not raw_path:
            # 尝试用 key 查找
            raw_path = find_raw_file(key)

        if not raw_path:
            print(f"  ⚠️ 未找到原始数据文件: {source_file or key}")
            skipped_count += 1
            continue

        if verbose:
            print(f"  📄 原始文件: {raw_path}")

        with open(raw_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        full_dialogue = raw_data.get('正文对话', '')
        if not full_dialogue:
            print(f"  ⚠️ 无正文对话数据")
            skipped_count += 1
            continue

        # 3. 解析场景对白
        parsed_scenes = parse_scene_dialogue(full_dialogue)
        if verbose:
            print(f"  📝 解析到 {len(parsed_scenes)} 个场景")

        # 4. 逐场景增强
        existing_scenes = opera.get('scenes', [])

        for i, scene in enumerate(existing_scenes):
            scene_num = scene.get('number', i + 1)

            # 4a. 匹配原始对白
            matched = None
            for ps in parsed_scenes:
                if ps['scene_num'] == scene_num:
                    matched = ps
                    break

            if matched:
                # 注入原文
                scene['text'] = matched['text']
                scene['dialogue'] = matched['text']  # 对白 = 场景全文（保持与论文术语一致）
                total_scenes_enriched += 1

                # 4b. 增强每个角色的情感数据
                existing_chars = scene.get('characters', [])
                for char in existing_chars:
                    char_name = char.get('name', '')
                    raw_char_lines = matched['characters'].get(char_name, [])

                    if raw_char_lines:
                        emotion = compute_emotion_detail(raw_char_lines, matched['text'])

                        # 保留 LLM 给出的 emotion 标签，但添加细粒度分析
                        char['emotion_detail'] = emotion['emotion_detail']
                        char['emotion_confidence'] = emotion['emotion_confidence']

                        # 如果 LLM 的 rating 不够细，用文本分析增强
                        existing_rating = char.get('rating', 0)
                        if abs(existing_rating) < 0.05 and abs(emotion['emotion_score']) > 0.1:
                            char['rating'] = emotion['emotion_score']

                        # 添加原文证据
                        char['evidence'] = emotion['evidence_lines']

                        # 保存增强的情感信息
                        char['enhanced_emotion'] = {
                            "label": emotion['emotion_label'],
                            "score": emotion['emotion_score'],
                            "confidence": emotion['emotion_confidence'],
                            "transition_detected": emotion['transition_detected'],
                        }

                        total_chars_enhanced += 1

                # 4c. 增强场景级情感（基于对白文本）
                char_emotions = [
                    c.get('enhanced_emotion', {})
                    for c in existing_chars
                    if c.get('enhanced_emotion')
                ]
                sent_data = compute_scene_sentiment(matched['text'], char_emotions)

                scene['ratings'] = scene.get('ratings', {})
                scene['ratings']['sentiment_raw'] = sent_data['sentiment']
                scene['ratings']['sentiment_confidence'] = sent_data['sentiment_confidence']
                scene['ratings']['pos_word_count'] = sent_data['pos_word_count']
                scene['ratings']['neg_word_count'] = sent_data['neg_word_count']

                # 4d. 计算场景级置信度
                scene['confidence'] = compute_confidence({
                    "has_text": len(matched['text']) > 0,
                    "chars_labeled": len(matched['characters']),
                    "emotion_evidence_count": sum(
                        1 for c in existing_chars if c.get('evidence')
                    ),
                    "text_length": len(matched['text']),
                })

        # 4e. 注入原始元数据
        opera['plot_summary'] = opera.get('plot_summary') or raw_data.get('情节', '')
        opera['performance_notes'] = opera.get('performance_notes') or raw_data.get('注释', '')
        opera['source_description'] = raw_data.get('说明', '')

        # 4f. 角色级信息增强
        raw_roles_text = raw_data.get('主要角色', '')
        for char in opera.get('characters', []):
            char_name = char.get('character', '')
            if char_name and raw_roles_text:
                # 从原始角色数据中提取行当信息（如果还没有）
                if not char.get('role_type'):
                    for line in raw_roles_text.split('\n'):
                        if char_name in line and '：' in line:
                            char['role_type'] = line.split('：')[-1].strip()
                            break

        enriched_count += 1
        if not verbose:
            print(f"  ✅ {title}: {len(existing_scenes)} 场 → "
                  f"{sum(1 for s in existing_scenes if s.get('text'))} 场注入原文, "
                  f"{sum(1 for s in existing_scenes for c in s.get('characters', []) if c.get('evidence'))} 角色增强")

    # 5. 重新组装数据
    output = {k: v for k, v in samples.items() if not isinstance(v, dict)}
    output.update(operas)

    # 6. 统计汇总
    print(f"\n{'='*60}")
    print(f"📊 增强完成:")
    print(f"   剧本总数: {len(operas)}")
    print(f"   成功增强: {enriched_count}")
    print(f"   跳过(无原始数据): {skipped_count}")
    print(f"   注入原文的场景: {total_scenes_enriched}")
    print(f"   增强情感的角色实例: {total_chars_enhanced}")

    if not dry_run:
        # 备份原文件
        import shutil
        shutil.copy2(SAMPLES_FILE, BACKUP_FILE)
        print(f"\n💾 原文件已备份至: {BACKUP_FILE}")

        # 写入增强后的数据
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"💾 增强数据已写入: {OUTPUT_FILE}")
    else:
        print(f"\n🔍 DRY RUN — 未写入文件")

    return output


# ── 验证 ──────────────────────────────────────────────────────

def verify_enriched_data(filepath: Path = None):
    """验证增强后的数据完整性"""
    path = filepath or SAMPLES_FILE
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    operas = {k: v for k, v in data.items() if isinstance(v, dict)}

    print(f"\n{'='*60}")
    print(f"🔍 验证增强数据: {path}")

    total_scenes = 0
    scenes_with_text = 0
    total_chars = 0
    chars_with_evidence = 0
    chars_with_emotion_detail = 0

    for key, opera in operas.items():
        title = opera.get('title', key)
        for scene in opera.get('scenes', []):
            total_scenes += 1
            if scene.get('text'):
                scenes_with_text += 1

            for char in scene.get('characters', []):
                total_chars += 1
                if char.get('evidence'):
                    chars_with_evidence += 1
                if char.get('emotion_detail'):
                    chars_with_emotion_detail += 1

    print(f"  场景总数: {total_scenes}")
    print(f"  有原文的场景: {scenes_with_text} ({100*scenes_with_text/max(total_scenes,1):.0f}%)")
    print(f"  角色实例总数: {total_chars}")
    print(f"  有证据的角色: {chars_with_evidence} ({100*chars_with_evidence/max(total_chars,1):.0f}%)")
    print(f"  有情感详情的角色: {chars_with_emotion_detail} ({100*chars_with_emotion_detail/max(total_chars,1):.0f}%)")

    # 检查字段完整性
    all_scene_fields = set()
    all_char_fields = set()
    for opera in operas.values():
        for scene in opera.get('scenes', []):
            all_scene_fields.update(scene.keys())
            for char in scene.get('characters', []):
                all_char_fields.update(char.keys())

    print(f"\n  场景字段: {sorted(all_scene_fields)}")
    print(f"  角色字段: {sorted(all_char_fields)}")

    # 检查论文所需字段
    paper_fields_scene = ['text', 'dialogue', 'confidence']
    paper_fields_char = ['evidence', 'emotion_detail', 'emotion_confidence', 'enhanced_emotion']
    print(f"\n  论文字段检查:")
    for f in paper_fields_scene:
        print(f"    scene.{f}: {'✅' if f in all_scene_fields else '❌'}")
    for f in paper_fields_char:
        print(f"    char.{f}: {'✅' if f in all_char_fields else '❌'}")


# ── CLI ──────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="京剧故事丝带数据增强管线")
    parser.add_argument("--dry-run", action="store_true", help="仅分析不写入")
    parser.add_argument("--verbose", "-v", action="store_true", help="详细输出")
    parser.add_argument("--verify", action="store_true", help="验证已增强的数据")
    parser.add_argument("--file", type=str, help="指定验证/处理的目标文件")
    args = parser.parse_args()

    if args.verify:
        verify_enriched_data(Path(args.file) if args.file else None)
    else:
        enrich_opera_samples(dry_run=args.dry_run, verbose=args.verbose)

        # 增强后自动验证
        if not args.dry_run:
            verify_enriched_data()
