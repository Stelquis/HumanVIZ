#!/usr/bin/env python3
"""
数据库属性增量导入脚本

从 JSON 文件恢复增量数据（角色字典、对话解析、剧目类型等）
到 humanviz.db，用于在新环境重建数据库状态。

前置条件：
  - humanviz.db 已存在（含基础数据）
  - db_exports/ 目录下有对应的 JSON 文件

用法:
    cd HumanVIZ
    python scripts/db_import_attributes.py                     # 导入所有增量属性
    python scripts/db_import_attributes.py --keys 角色字典     # 仅导入指定 key
    python scripts/db_import_attributes.py --keys 角色字典,对话解析
    python scripts/db_import_attributes.py --dry-run          # 仅预览，不写入
"""

import argparse
import gzip
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = PROJECT_ROOT / "data" / "humanviz.db"
EXPORT_DIR = PROJECT_ROOT / "data" / "db_exports"

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


def _safe_update_attributes(conn, entity_id: int, new_attrs: Dict[str, Any],
                            overwrite: bool = True) -> bool:
    """安全更新实体属性（与 parse_dialogues.py 相同的逻辑）"""
    try:
        row = conn.execute(
            "SELECT attributes FROM entities WHERE id = ?", (entity_id,)
        ).fetchone()
        if not row:
            return False

        existing = {}
        if row[0]:
            try:
                existing = json.loads(row[0])
            except Exception:
                existing = {}

        for key, value in new_attrs.items():
            if overwrite or key not in existing:
                existing[key] = value

        conn.execute(
            "UPDATE entities SET attributes = ? WHERE id = ?",
            (json.dumps(existing, ensure_ascii=False), entity_id)
        )
        return True

    except Exception as e:
        print(f"  ❌ 安全写入失败: {e}")
        return False


def _rebuild_triggers(conn):
    """重建 FTS 触发器"""
    trigger_file = EXPORT_DIR / "triggers.json"
    if not trigger_file.exists():
        print("  ⚠️  triggers.json 不存在，跳过触发器重建")
        return

    with open(trigger_file, "r", encoding="utf-8") as f:
        triggers = json.load(f)

    # 先删除旧触发器
    existing = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
    ).fetchall()
    for (name,) in existing:
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")

    # 创建新触发器
    for trigger in triggers:
        conn.execute(trigger["sql"])

    conn.commit()
    print(f"  触发器重建: {len(triggers)} 条")


def import_attributes(
    keys: Optional[List[str]] = None,
    dry_run: bool = False,
    overwrite: bool = True,
) -> Dict[str, Any]:
    """
    从 JSON 文件导入增量属性到数据库

    Args:
        keys: 要导入的属性 key 列表，None 表示导入所有增量 key
        dry_run: 仅预览，不写入
        overwrite: 是否覆盖已有属性

    Returns:
        导入汇总信息
    """
    if keys is None:
        keys = INCREMENTAL_KEYS

    if not DB_PATH.exists():
        print(f"❌ 数据库不存在: {DB_PATH}")
        print("请先确保 humanviz.db 已创建（含基础数据）")
        return {}

    conn = sqlite3.connect(str(DB_PATH))
    summary = {
        "dry_run": dry_run,
        "per_key_stats": {},
    }

    # 1. 重建触发器
    if not dry_run:
        print("── 重建触发器 ──")
        _rebuild_triggers(conn)

    # 2. 导入各属性
    for key in keys:
        # 优先读取 .json，其次 .json.gz
        export_file = EXPORT_DIR / f"{key}.json"
        if not export_file.exists():
            export_file_gz = EXPORT_DIR / f"{key}.json.gz"
            if export_file_gz.exists():
                with gzip.open(export_file_gz, "rt", encoding="utf-8") as f:
                    data = json.load(f)
                print(f"\n── 导入 {key}: {len(data)} 条记录 (from .gz) ──")
            else:
                print(f"  {key}: 文件不存在，跳过")
                summary["per_key_stats"][key] = {"status": "skipped", "reason": "file not found"}
                continue
        else:
            with open(export_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"\n── 导入 {key}: {len(data)} 条记录 ──")

        success = 0
        skip = 0
        fail = 0

        for item in data:
            entity_id = item["entity_id"]
            value = item[key]

            # 检查实体是否存在
            row = conn.execute(
                "SELECT id FROM entities WHERE id = ?", (entity_id,)
            ).fetchone()
            if not row:
                skip += 1
                continue

            if dry_run:
                success += 1
            else:
                ok = _safe_update_attributes(
                    conn, entity_id, {key: value}, overwrite=overwrite
                )
                if ok:
                    success += 1
                else:
                    fail += 1

        if not dry_run and success > 0:
            conn.commit()

        print(f"  成功: {success}, 跳过(实体不存在): {skip}, 失败: {fail}")
        summary["per_key_stats"][key] = {
            "total": len(data),
            "success": success,
            "skip": skip,
            "fail": fail,
        }

    conn.close()
    print(f"\n导入完成!")
    return summary


def main():
    parser = argparse.ArgumentParser(description="从 JSON 文件导入增量属性到数据库")
    parser.add_argument(
        "--keys", type=str, default=None,
        help="要导入的属性 key，逗号分隔。默认导入所有增量 key"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅预览，不写入数据库"
    )
    parser.add_argument(
        "--no-overwrite", action="store_true",
        help="不覆盖已有属性"
    )
    args = parser.parse_args()

    keys = None
    if args.keys:
        keys = [k.strip() for k in args.keys.split(",")]

    print("═" * 50)
    print("  数据库增量属性导入")
    print("═" * 50)

    import_attributes(
        keys=keys,
        dry_run=args.dry_run,
        overwrite=not args.no_overwrite,
    )


if __name__ == "__main__":
    main()
