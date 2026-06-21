#!/usr/bin/env python3
"""
数据库属性增量导出脚本

将本次工作产生的增量数据（角色字典、对话解析、剧目类型等）
从 humanviz.db 导出为 JSON 文件，以便：
1. 不提交 .db 文件到 git
2. 通过导入脚本恢复数据到新环境

用法:
    cd HumanVIZ
    python scripts/db_export_attributes.py                     # 导出所有增量属性
    python scripts/db_export_attributes.py --keys 角色字典     # 仅导出指定 key
    python scripts/db_export_attributes.py --keys 角色字典,对话解析
"""

import argparse
import gzip
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DB_PATH = PROJECT_ROOT / "backend" / "humanviz.db"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "task2" / "db_exports"

# 这些是本次工作产生的增量属性 key（原始数据不包含这些）
INCREMENTAL_KEYS = [
    "对话解析",
    "角色字典",
    "剧目类型",
    "分类置信度",
    "分类依据",
    "次要剧目类型",
    "角色别名映射",
    "同场共现",
]


def export_attributes(
    keys: Optional[List[str]] = None,
    output_dir: Path = OUTPUT_DIR,
) -> Dict[str, Any]:
    """
    从数据库导出指定属性的增量数据

    Args:
        keys: 要导出的属性 key 列表，None 表示导出所有增量 key
        output_dir: 输出目录

    Returns:
        导出汇总信息
    """
    import sqlite3

    if keys is None:
        keys = INCREMENTAL_KEYS

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    output_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "export_time": datetime.now().isoformat(),
        "db_path": str(DB_PATH),
        "keys": keys,
        "per_key_stats": {},
    }

    for key in keys:
        # 查询有该属性的实体
        c.execute(f"""
            SELECT id, name, type, json_extract(attributes, '$."{key}"') AS val
            FROM entities
            WHERE type = 'opera_script'
              AND json_extract(attributes, '$."{key}"') IS NOT NULL
            ORDER BY id
        """)
        rows = c.fetchall()

        if not rows:
            print(f"  {key}: 0 条记录，跳过")
            summary["per_key_stats"][key] = {"count": 0}
            continue

        # 构建导出数据
        export_data = []
        for row in rows:
            val = row["val"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    pass
            export_data.append({
                "entity_id": row["id"],
                "name": row["name"],
                key: val,
            })

        # 写入 JSON 文件（大文件使用 gzip 压缩）
        file_size_est = len(json.dumps(export_data, ensure_ascii=False))
        if file_size_est > 500_000:  # >500KB 时压缩
            output_file = output_dir / f"{key}.json.gz"
            with gzip.open(output_file, "wt", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
        else:
            output_file = output_dir / f"{key}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)

        file_size = output_file.stat().st_size
        print(f"  {key}: {len(export_data)} 条记录 → {output_file.name} ({file_size / 1024:.1f} KB)")

        summary["per_key_stats"][key] = {
            "count": len(export_data),
            "file": output_file.name,
            "size_bytes": file_size,
        }

    # 导出触发器定义（用于在新环境重建）
    c.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger'")
    triggers = c.fetchall()
    trigger_data = [{"name": t["name"], "sql": t["sql"]} for t in triggers]
    trigger_file = output_dir / "triggers.json"
    with open(trigger_file, "w", encoding="utf-8") as f:
        json.dump(trigger_data, f, ensure_ascii=False, indent=2)
    print(f"  triggers: {len(trigger_data)} 条 → {trigger_file.name}")
    summary["triggers"] = {"count": len(trigger_data), "file": trigger_file.name}

    # 保存汇总
    summary_file = output_dir / "export_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    conn.close()
    print(f"\n导出汇总: {summary_file}")
    return summary


def main():
    parser = argparse.ArgumentParser(description="导出数据库增量属性为 JSON")
    parser.add_argument(
        "--keys", type=str, default=None,
        help="要导出的属性 key，逗号分隔。默认导出所有增量 key"
    )
    args = parser.parse_args()

    keys = None
    if args.keys:
        keys = [k.strip() for k in args.keys.split(",")]

    print("═" * 50)
    print("  数据库增量属性导出")
    print("═" * 50)

    export_attributes(keys=keys)


if __name__ == "__main__":
    main()
