#!/usr/bin/env python3
"""
build_character_index.py
Generate character-performance-index.json with per-character 4-dimensional
performance scores for all 3,581 Peking Opera characters.

Inputs:
  - src/data/char-role-map.json          (3581 character → category)
  - src/data/scripts-summary.json        (1473 scripts with roles field)
  - data/processed/structural_fingerprints.json (1473 scripts with ratios)
  - src/data/task1-performance.json       (category stats for reference)

Output:
  - src/data/character-performance-index.json

Tiers:
  - "expert": 8 characters with domain-expert values (from PERFORMANCE_DATA)
  - "script-inferred": characters with ≥1 script appearance (real data means)
"""

import json
import os
import sys
from math import sqrt
from collections import defaultdict

# ── Paths relative to project root ──
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHAR_ROLE_MAP_PATH = os.path.join(PROJECT_ROOT, "src", "data", "char-role-map.json")
SCRIPTS_SUMMARY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "scripts-summary.json")
FINGERPRINTS_PATH = os.path.join(PROJECT_ROOT, "data", "processed", "structural_fingerprints.json")
TASK1_PERF_PATH = os.path.join(PROJECT_ROOT, "src", "data", "task1-performance.json")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "src", "data", "character-performance-index.json")

# ── Expert character data (from Task1Layout.tsx PERFORMANCE_DATA, 0-100 scale) ──
EXPERT_CHARACTERS = {
    "包公":   {"sing": 82, "speak": 75, "act": 50, "fight": 15},
    "诸葛亮": {"sing": 85, "speak": 80, "act": 45, "fight": 10},
    "穆桂英": {"sing": 60, "speak": 55, "act": 78, "fight": 85},
    "孙悟空": {"sing": 30, "speak": 50, "act": 95, "fight": 90},
    "唐明皇": {"sing": 70, "speak": 65, "act": 55, "fight": 20},
    "杨贵妃": {"sing": 88, "speak": 60, "act": 65, "fight": 10},
    "曹操":   {"sing": 65, "speak": 75, "act": 60, "fight": 35},
    "红娘":   {"sing": 55, "speak": 80, "act": 72, "fight": 25},
}

DIMS = ["sing", "speak", "act", "fight"]
DIM_NAMES = {"sing": "唱", "speak": "念", "act": "做", "fight": "打"}

# ── Character name aliases (expert/common name → formal data name) ──
CHARACTER_ALIASES = {
    "包公": "包拯",   # 包公 is colloquial; char-role-map and scripts use 包拯
}


def load_json(path):
    """Load a JSON file with error handling."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {path}: {e}", file=sys.stderr)
        sys.exit(1)


def build_script_fingerprint_lookup(fingerprints):
    """Build a dict: script_id → {singing_ratio, speaking_ratio, acting_ratio, fighting_ratio}.

    structural_fingerprints entity_id format: "01001001_空城计.pdf"
    scripts-summary id format:            "01001001_空城计"
    """
    lookup = {}
    for feat in fingerprints["features"]:
        eid = feat["entity_id"]
        # Strip .pdf suffix to match scripts-summary id
        script_id = eid.replace(".pdf", "")
        lookup[script_id] = {
            "singing_ratio": feat.get("singing_ratio", 0),
            "speaking_ratio": feat.get("speaking_ratio", 0),
            "acting_ratio": feat.get("acting_ratio", 0),
            "fighting_ratio": feat.get("fighting_ratio", 0),
        }
    return lookup


def extract_character_scripts(scripts_summary):
    """Build a dict: character_name → list of script_ids they appear in.

    scripts-summary roles field format:
      "诸葛亮：老生\n司马懿：净\n司马昭：小生\n..."
    """
    char_scripts = defaultdict(list)
    for entry in scripts_summary:
        script_id = entry["id"]
        roles_text = entry.get("roles", "")
        if not roles_text:
            continue
        for line in roles_text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # Parse "角色名：行当" format (uses fullwidth colon ：)
            if "：" in line:
                name = line.split("：", 1)[0].strip()
            elif ":" in line:
                name = line.split(":", 1)[0].strip()
            else:
                continue
            if name:
                char_scripts[name].append(script_id)
    return dict(char_scripts)


def compute_character_performance(char_scripts, fp_lookup, char_role_map, expert_chars_01, expert_display_names):
    """Compute per-character 4D performance scores.

    For each character:
    - If in expert set, use expert values
    - Otherwise, compute mean of their scripts' fingerprint ratios
    """
    results = {}

    for char_name, category in char_role_map.items():
        scripts = char_scripts.get(char_name, [])

        if char_name in expert_chars_01:
            # Expert character — use domain knowledge values
            results[char_name] = {
                **expert_chars_01[char_name],
                "category": category,
                "confidence": "expert",
                "source": "领域知识参考值",
                "scriptCount": len(scripts),
            }
            # Add displayName if this character has a colloquial name
            if char_name in expert_display_names:
                results[char_name]["displayName"] = expert_display_names[char_name]
        elif scripts:
            # Script-inferred: mean of script ratios
            sums = {dim: 0.0 for dim in DIMS}
            fp_key_map = {
                "sing": "singing_ratio",
                "speak": "speaking_ratio",
                "act": "acting_ratio",
                "fight": "fighting_ratio",
            }
            valid_count = 0
            for sid in scripts:
                fp = fp_lookup.get(sid)
                if fp:
                    valid_count += 1
                    for dim in DIMS:
                        sums[dim] += fp[fp_key_map[dim]]

            if valid_count > 0:
                results[char_name] = {
                    dim: round(sums[dim] / valid_count, 6)
                    for dim in DIMS
                }
                results[char_name].update({
                    "category": category,
                    "confidence": "script-inferred",
                    "source": "剧本级聚合统计",
                    "scriptCount": len(scripts),
                })
            else:
                # Scripts listed but not in fingerprint lookup (shouldn't happen
                # given the perfect 1473/1473 overlap, but handle gracefully)
                results[char_name] = _fallback_scores(category, len(scripts))
        else:
            # No scripts found for this character — use category fallback
            results[char_name] = _fallback_scores(category, 0)

    return results


def _fallback_scores(category, script_count):
    """Create fallback scores when no script data is available."""
    # Use mid-range placeholder; these characters will be marked clearly
    return {
        "sing": 0.0, "speak": 0.0, "act": 0.0, "fight": 0.0,
        "category": category,
        "confidence": "no-data",
        "source": "无剧本数据",
        "scriptCount": script_count,
    }


def normalize_performance_scores(output_chars):
    """Rescale act/fight scores for script-inferred characters.

    The raw acting_ratio and fighting_ratio from structural_fingerprints are
    extremely small (act mean ~0.0005, fight mean ~0.01) compared to the
    expert-annotated characters (act 0.45-0.95, fight 0.10-0.90).

    This function applies a sqrt-based rescaling to bring script-inferred
    act/fight values into a comparable 0-1 range, while preserving:
      - Relative ordering (sqrt is monotonic)
      - Zero stays at zero (characters with no action/fight markers)
      - Expert characters untouched (already on correct scale)

    Transformation:  new = min(1.0, (raw / P99) ** 0.5 * 0.75)
    where P99 is the 99th percentile among script-inferred characters.
    At P99, the character scores ~75 (display scale), leaving headroom for
    truly exceptional characters and expert references.

    Returns:
        norm_params: dict with P99 values and transformation metadata
    """
    # Collect script-inferred scores per dimension
    inferred_by_dim = {dim: [] for dim in DIMS}
    for name, data in output_chars.items():
        if data.get("confidence") == "script-inferred":
            for dim in DIMS:
                inferred_by_dim[dim].append(data["scores"][dim])

    # Compute P99 for each dimension (for normalization reference)
    def p99(vals):
        s = sorted(vals)
        k = int((len(s) - 1) * 0.99)
        return s[k] if s else 0.001

    norm_params = {}
    for dim in DIMS:
        vals = inferred_by_dim[dim]
        norm_params[dim] = {
            "p99": round(p99(vals), 6),
            "mean": round(sum(vals) / len(vals), 6) if vals else 0,
            "max": round(max(vals), 6) if vals else 0,
        }

    # Only rescale act and fight — sing/speak already on reasonable scale
    RESCALE_DIMS = ["act", "fight"]
    TRANSFORM_POWER = 0.5      # sqrt — spreads low values
    TRANSFORM_TARGET = 0.75    # target value at P99 (display 75)

    rescale_count = 0
    for name, data in output_chars.items():
        if data.get("confidence") != "script-inferred":
            continue
        for dim in RESCALE_DIMS:
            raw = data["scores"][dim]
            ref = norm_params[dim]["p99"]
            if raw > 0 and ref > 0:
                normalized = (raw / ref) ** TRANSFORM_POWER * TRANSFORM_TARGET
                data["scores"][dim] = round(min(1.0, normalized), 4)
            else:
                data["scores"][dim] = 0.0
        rescale_count += 1

    norm_params["_transform"] = {
        "description": "sqrt-based rescaling applied to act/fight for script-inferred characters",
        "formula": "min(1.0, (raw / p99_raw) ** 0.5 * 0.75)",
        "rescaledDims": RESCALE_DIMS,
        "power": TRANSFORM_POWER,
        "target": TRANSFORM_TARGET,
        "charactersRescaled": rescale_count,
        # Store raw P99 values so the frontend can normalize
        # category-reference stats (from task1-performance.json) consistently
        "p99Raw": {
            dim: norm_params[dim]["p99"] for dim in RESCALE_DIMS
        },
    }

    print(f"    Normalized act/fight for {rescale_count} script-inferred characters")
    for dim in RESCALE_DIMS:
        print(f"      {dim}: P99_raw={norm_params[dim]['p99']:.6f}, mean(raw)={norm_params[dim]['mean']:.6f}")

    return norm_params


def compute_percentiles(output_chars):
    """Compute per-dimension percentiles across all characters.

    Percentile = what percentage of characters score BELOW this value.
    Higher percentile = more exceptional performance.

    Args:
        output_chars: dict of {char_name: {scores: {dim: value}, ...}}
    """
    percentile_data = {dim: {} for dim in DIMS}

    for dim in DIMS:
        # Collect all scores for this dimension
        dim_scores = [
            (name, data["scores"][dim])
            for name, data in output_chars.items()
        ]
        sorted_vals = sorted(v for _, v in dim_scores)
        n = len(sorted_vals)

        for char_name, score in dim_scores:
            # Count how many are strictly below (ties get same percentile)
            below = sum(1 for s in sorted_vals if s < score)
            tie = sum(1 for s in sorted_vals if s == score)
            # Mid-point of tie range gives fair percentile
            rank_pct = round((below + tie / 2) / n * 100, 1)
            percentile_data[dim][char_name] = rank_pct

    return percentile_data


def main():
    print("Building character performance index...")

    # ── Load data ──
    print("  Loading char-role-map.json...")
    char_role_map = load_json(CHAR_ROLE_MAP_PATH)

    print("  Loading scripts-summary.json...")
    scripts_summary = load_json(SCRIPTS_SUMMARY_PATH)

    print("  Loading structural_fingerprints.json...")
    fingerprints = load_json(FINGERPRINTS_PATH)

    print("  Loading task1-performance.json...")
    task1_perf = load_json(TASK1_PERF_PATH)

    # ── Build lookups ──
    print("  Building script fingerprint lookup...")
    fp_lookup = build_script_fingerprint_lookup(fingerprints)
    print(f"    {len(fp_lookup)} scripts indexed")

    print("  Extracting character-script mappings...")
    char_scripts = extract_character_scripts(scripts_summary)
    print(f"    {len(char_scripts)} unique characters found in scripts")

    # ── Resolve expert character aliases & convert from 0-100 to 0-1 scale ──
    # Build map: formal_name → {scores, displayName (if aliased)}
    expert_chars_01 = {}
    expert_display_names = {}
    for name, scores in EXPERT_CHARACTERS.items():
        formal_name = CHARACTER_ALIASES.get(name, name)
        if name != formal_name:
            expert_display_names[formal_name] = name
        expert_chars_01[formal_name] = {
            dim: round(scores[dim] / 100.0, 4) for dim in DIMS
        }

    # ── Compute character performance ──
    print("  Computing per-character performance scores...")
    characters = compute_character_performance(
        char_scripts, fp_lookup, char_role_map, expert_chars_01, expert_display_names
    )
    print(f"    {len(characters)} characters processed")

    # ── Count by tier ──
    tier_counts = defaultdict(int)
    for data in characters.values():
        tier_counts[data["confidence"]] += 1
    print(f"    Tiers: {dict(tier_counts)}")

    # ── Restructure: nest scores under a 'scores' key ──
    output_chars = {}
    for char_name, data in characters.items():
        scores = {dim: data.pop(dim) for dim in DIMS}
        output_chars[char_name] = {
            "scores": scores,
            **data,
        }

    # ── Normalize act/fight scores for script-inferred characters ──
    print("  Normalizing act/fight scores...")
    norm_params = normalize_performance_scores(output_chars)

    # ── Compute percentiles (based on normalized scores) ──
    print("  Computing percentiles...")
    percentiles = compute_percentiles(output_chars)

    # Add percentiles to each character
    for char_name in output_chars:
        output_chars[char_name]["percentiles"] = {
            dim: percentiles[dim].get(char_name, 50.0)
            for dim in DIMS
        }

    # ── Build output ──
    # Create a searchable name list sorted by importance (expert first, then by scriptCount)
    sorted_names = sorted(
        output_chars.keys(),
        key=lambda n: (
            0 if output_chars[n]["confidence"] == "expert" else
            1 if output_chars[n]["confidence"] == "script-inferred" else 2,
            -output_chars[n]["scriptCount"],
        )
    )

    output = {
        "_meta": {
            "description": "Per-character 4-dimensional performance scores for Peking Opera roles",
            "totalCharacters": len(characters),
            "expertCharacters": tier_counts.get("expert", 0),
            "scriptInferredCharacters": tier_counts.get("script-inferred", 0),
            "noDataCharacters": tier_counts.get("no-data", 0),
            "dimensions": DIMS,
            "dimensionLabels": DIM_NAMES,
            "generatedAt": "2026-06-12",
            "normalization": norm_params["_transform"],
            "dataSources": [
                "char-role-map.json (3581 character→category)",
                "scripts-summary.json (1473 scripts × role lists)",
                "structural_fingerprints.json (1473 scripts × performance ratios)",
                "task1-performance.json (category-level aggregate stats)",
            ],
        },
        "searchOrder": sorted_names,
        "characters": output_chars,
    }

    # ── Write output ──
    print(f"  Writing {OUTPUT_PATH}...")
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # ── Summary ──
    file_size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"\n✅ Done! Generated {OUTPUT_PATH}")
    print(f"   {len(characters)} characters × 4 dimensions")
    print(f"   File size: {file_size_kb:.0f} KB")
    print(f"   Expert: {tier_counts.get('expert', 0)}")
    print(f"   Script-inferred: {tier_counts.get('script-inferred', 0)}")
    print(f"   No-data: {tier_counts.get('no-data', 0)}")


if __name__ == "__main__":
    main()
