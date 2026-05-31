#!/usr/bin/env python3
"""
批量剧目分类脚本（支持断点续传）

对数据库中所有 opera_script 类型的实体调用 LLM 进行剧目类型分类，
并将分类结果写入 entities.attributes 的 "剧目类型" 字段。

断点续传机制：
  - 每成功分类一条，立即将结果追加到 checkpoint 文件
  - 中断后重新运行（默认 --resume），自动跳过已处理条目
  - checkpoint 同时保存完整分类结果，即使数据库丢失也可恢复

用法:
    # 从 HumanVIZ 根目录运行
    cd HumanVIZ
    python scripts/classify_play_types.py

    # 仅预览不写入
    python scripts/classify_play_types.py --dry-run

    # 限制数量
    python scripts/classify_play_types.py --limit 20

    # 限定数据集
    python scripts/classify_play_types.py --dataset-id my_dataset

    # 覆盖已有分类
    python scripts/classify_play_types.py --overwrite

    # 设置请求间隔（秒）
    python scripts/classify_play_types.py --delay 2

    # 失败重试次数
    python scripts/classify_play_types.py --retries 3

    # 不使用断点续传（从头开始）
    python scripts/classify_play_types.py --no-resume

    # 从 checkpoint 恢复数据到数据库（不调用 LLM）
    python scripts/classify_play_types.py --import-checkpoint
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

# 将 backend 目录加入 sys.path，以便导入后端模块
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from database.connection import get_db_connection
from database.models import update_entity_attributes


# ─── 配置 ───────────────────────────────────────────────

VALID_CATEGORIES = {
    "历史戏", "家庭戏", "公案戏", "爱情戏",
    "神话戏", "侠义戏", "技法展示戏",
}

OUTPUT_DIR = PROJECT_ROOT / "data" / "classification_results"
CHECKPOINT_FILE = PROJECT_ROOT / "data" / "db_exports" / "classify_checkpoint.json"


# ─── 断点续传 ───────────────────────────────────────────

def load_checkpoint() -> Dict[str, Any]:
    """
    加载 checkpoint 文件

    Returns:
        {"entity_id_str": {"status": "success/error", "name": ..., ...}}
    """
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("processed", {})
        except Exception as e:
            print(f"⚠ 加载 checkpoint 失败: {e}，将从头开始")
    return {}


def save_checkpoint(processed: Dict[str, Any]):
    """保存 checkpoint 文件（覆盖写入）"""
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "last_updated": datetime.now().isoformat(),
        "total_processed": len(processed),
        "success_count": sum(1 for v in processed.values() if v.get("status") == "success"),
        "processed": processed,
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_checkpoint_success_ids(processed: Dict[str, Any]) -> Set[int]:
    """获取 checkpoint 中已成功处理的 entity_id 集合"""
    return {
        int(eid) for eid, info in processed.items()
        if info.get("status") == "success"
    }


def import_checkpoint_to_db(dry_run: bool = False) -> None:
    """
    从 checkpoint 恢复数据到数据库（不调用 LLM）

    用于数据库丢失后，从 checkpoint 文件恢复分类结果。
    """
    processed = load_checkpoint()
    if not processed:
        print("checkpoint 为空，无需恢复。")
        return

    success_ids = get_checkpoint_success_ids(processed)
    print(f"checkpoint 中有 {len(success_ids)} 条成功记录")

    conn = get_db_connection()
    try:
        # 检查哪些 entity 已存在于 DB 但缺少分类
        existing_ids = set()
        rows = conn.execute(
            "SELECT id FROM entities WHERE type = 'opera_script'"
        ).fetchall()
        for row in rows:
            existing_ids.add(row[0])

        missing = success_ids & existing_ids
        already_has = set()

        # 检查哪些已经有分类
        if missing:
            ids_str = ",".join(str(i) for i in missing)
            rows2 = conn.execute(
                f"SELECT id FROM entities WHERE id IN ({ids_str}) "
                f"AND json_extract(attributes, '$.剧目类型') IS NOT NULL"
            ).fetchall()
            already_has = {row[0] for row in rows2}

        to_import = missing - already_has
        print(f"需要恢复: {len(to_import)} 条 (已有分类: {len(already_has)}, 不在DB中: {len(success_ids - existing_ids)})")

        if dry_run:
            print("[dry-run] 不写入数据库")
            conn.close()
            return

        imported = 0
        for eid in to_import:
            info = processed[str(eid)]
            new_attrs = {
                "剧目类型": info.get("剧目类型", ""),
                "分类置信度": info.get("分类置信度", ""),
                "分类依据": info.get("分类依据", ""),
            }
            if info.get("次要剧目类型"):
                new_attrs["次要剧目类型"] = info["次要剧目类型"]

            ok = update_entity_attributes(conn, eid, new_attrs, overwrite=True)
            if ok:
                imported += 1

        conn.commit()
        print(f"恢复完成: {imported}/{len(to_import)} 条")
    finally:
        conn.close()


# ─── 数据库查询 ──────────────────────────────────────────

def fetch_unclassified_plays(
    conn,
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    skip_ids: Optional[Set[int]] = None,
) -> List[Dict[str, Any]]:
    """
    读取待分类的 opera_script 实体列表

    若 overwrite=False，则跳过已有 "剧目类型" 属性的实体。
    skip_ids 中的 entity_id 也会被跳过（断点续传）。
    """
    conditions = ["e.type = 'opera_script'"]
    params: list = []

    if dataset_id:
        conditions.append("e.dataset_id = ?")
        params.append(dataset_id)

    if not overwrite:
        conditions.append(
            "json_extract(e.attributes, '$.剧目类型') IS NULL"
        )

    where = " AND ".join(conditions)

    sql = f"""
        SELECT e.id, e.name, e.dataset_id, e.content, e.attributes
        FROM entities e
        WHERE {where}
        ORDER BY e.id
    """
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    results = []
    for row in rows:
        # 断点续传：跳过已处理
        if skip_ids and row["id"] in skip_ids:
            continue

        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                attrs = {}
        results.append({
            "id": row["id"],
            "name": row["name"],
            "dataset_id": row["dataset_id"],
            "content": row["content"],
            "attributes": attrs or {},
        })
    return results


def count_classified(conn) -> Dict[str, int]:
    """统计各剧目类型的数量"""
    rows = conn.execute("""
        SELECT json_extract(e.attributes, '$.剧目类型') AS play_type,
               COUNT(*) AS cnt
        FROM entities e
        WHERE e.type = 'opera_script'
          AND json_extract(e.attributes, '$.剧目类型') IS NOT NULL
        GROUP BY play_type
        ORDER BY cnt DESC
    """).fetchall()
    return {row["play_type"]: row["cnt"] for row in rows}


# ─── LLM 调用 ───────────────────────────────────────────

def get_llm():
    """获取 LLM 实例"""
    from services.llm_service import llm_service
    return llm_service.llm


def classify_one(llm, detail: Dict[str, Any]) -> Dict[str, Any]:
    """对单个剧本调用 LLM 分类，返回分类结果"""
    from services.prompts_opera import classify_play_type
    return classify_play_type(llm, detail)


# ─── 导出增量结果 ────────────────────────────────────────

def export_results_from_checkpoint():
    """从 checkpoint 导出分类结果为标准 db_exports 格式"""
    processed = load_checkpoint()
    success_entries = {
        eid: info for eid, info in processed.items()
        if info.get("status") == "success"
    }

    if not success_entries:
        print("checkpoint 中无成功记录，跳过导出。")
        return

    export_dir = CHECKPOINT_FILE.parent
    export_dir.mkdir(parents=True, exist_ok=True)

    # 导出各属性 key
    keys_to_export = ["剧目类型", "分类置信度", "分类依据", "次要剧目类型"]

    summary = {
        "export_time": datetime.now().isoformat(),
        "source": "classify_checkpoint.json",
        "per_key_stats": {},
    }

    for key in keys_to_export:
        export_data = []
        for eid_str, info in success_entries.items():
            val = info.get(key)
            if val is not None:
                export_data.append({
                    "entity_id": int(eid_str),
                    "name": info.get("name", ""),
                    key: val,
                })

        if not export_data:
            summary["per_key_stats"][key] = {"count": 0}
            continue

        output_file = export_dir / f"{key}.json"
        # 大文件压缩
        file_size_est = len(json.dumps(export_data, ensure_ascii=False))
        import gzip
        if file_size_est > 500_000:
            output_file = export_dir / f"{key}.json.gz"
            with gzip.open(output_file, "wt", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
        else:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)

        file_size = output_file.stat().st_size
        print(f"  {key}: {len(export_data)} 条 → {output_file.name} ({file_size / 1024:.1f} KB)")
        summary["per_key_stats"][key] = {
            "count": len(export_data),
            "file": output_file.name,
            "size_bytes": file_size,
        }

    # 保存汇总
    summary_file = export_dir / "export_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  导出汇总: {summary_file}")


# ─── 核心流程 ───────────────────────────────────────────

def run(
    dataset_id: Optional[str] = None,
    limit: Optional[int] = None,
    overwrite: bool = False,
    dry_run: bool = False,
    delay: float = 1.0,
    retries: int = 2,
    resume: bool = True,
):
    """批量分类主流程"""
    print("=" * 60)
    print("  京剧剧目批量分类脚本（支持断点续传）")
    print("=" * 60)
    print(f"  模式: {'预览 (dry-run)' if dry_run else '正式写入'}")
    print(f"  覆盖已有: {'是' if overwrite else '否'}")
    print(f"  断点续传: {'是' if resume else '否'}")
    print(f"  请求间隔: {delay}s")
    print(f"  失败重试: {retries} 次")
    if dataset_id:
        print(f"  限定数据集: {dataset_id}")
    if limit:
        print(f"  数量限制: {limit}")
    print()

    # 1. 加载 checkpoint
    checkpoint_processed = {}
    skip_ids: Set[int] = set()
    if resume:
        checkpoint_processed = load_checkpoint()
        if checkpoint_processed:
            skip_ids = get_checkpoint_success_ids(checkpoint_processed)
            print(f"📋 断点续传: 已有 {len(skip_ids)} 条成功记录，将跳过\n")
        else:
            print("📋 无历史 checkpoint，从头开始\n")

    # 2. 读取待分类数据
    conn = get_db_connection()
    try:
        plays = fetch_unclassified_plays(
            conn, dataset_id, limit, overwrite, skip_ids=skip_ids
        )
    finally:
        conn.close()

    total = len(plays)
    if total == 0:
        print("没有需要分类的剧本，退出。")
        # 即使无需分类，也执行导出
        if resume and checkpoint_processed:
            print("\n正在导出 checkpoint 结果到 db_exports ...")
            export_results_from_checkpoint()
        return

    print(f"共 {total} 部剧本待分类\n")

    # 3. 获取 LLM
    print("正在加载 LLM ...")
    llm = get_llm()
    print("LLM 加载成功\n")

    # 4. 逐条分类
    success_count = 0
    fail_count = 0
    skip_count = 0
    results_log = []

    for idx, play in enumerate(plays, 1):
        entity_id = play["id"]
        play_name = play["name"]
        print(f"[{idx}/{total}] 分类: {play_name} (id={entity_id})")

        # 构造 detail（与 search_service.get_play_detail 返回格式一致）
        detail = {
            "id": play["id"],
            "name": play["name"],
            "type": "opera_script",
            "dataset_id": play["dataset_id"],
            "content": play["content"],
            "attributes": play["attributes"],
        }

        # 调用 LLM（带重试）
        result = None
        for attempt in range(1, retries + 2):
            try:
                result = classify_one(llm, detail)
                break
            except Exception as e:
                print(f"  ⚠ 第 {attempt} 次尝试失败: {e}")
                if attempt <= retries:
                    wait = delay * attempt
                    print(f"  等待 {wait:.1f}s 后重试 ...")
                    time.sleep(wait)
                else:
                    print(f"  ❌ 全部重试失败，跳过该剧本")

        if result is None:
            fail_count += 1
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "error",
                "error": "LLM 调用失败",
            })
            # 记录失败到 checkpoint，下次可重试
            checkpoint_processed[str(entity_id)] = {
                "status": "error",
                "name": play_name,
                "error": "LLM 调用失败",
            }
            save_checkpoint(checkpoint_processed)
            continue

        classification = result.get("result", {})

        # 兼容 raw_response 的情况（LLM 未返回有效 JSON）
        if "raw_response" in classification:
            print(f"  ⚠ LLM 返回非标准格式，跳过写入")
            skip_count += 1
            results_log.append({
                "entity_id": entity_id,
                "play_name": play_name,
                "status": "parse_error",
                "raw_response": classification["raw_response"][:500],
            })
            checkpoint_processed[str(entity_id)] = {
                "status": "parse_error",
                "name": play_name,
            }
            save_checkpoint(checkpoint_processed)
            continue

        category = classification.get("category", "")
        confidence = classification.get("confidence", "")
        reasoning = classification.get("reasoning", "")
        secondary = classification.get("secondary_category")

        # 校验分类是否在有效范围内
        if category and category not in VALID_CATEGORIES:
            print(f"  ⚠ 分类结果 '{category}' 不在有效范围内，仍写入")

        print(f"  → {category} (置信度: {confidence})")

        if dry_run:
            print(f"  [dry-run] 不写入数据库")
            success_count += 1
        else:
            # 写入数据库
            new_attrs = {
                "剧目类型": category,
                "分类置信度": confidence,
                "分类依据": reasoning,
            }
            if secondary:
                new_attrs["次要剧目类型"] = secondary

            write_conn = get_db_connection()
            try:
                ok = update_entity_attributes(write_conn, entity_id, new_attrs, overwrite=True)
                if ok:
                    success_count += 1
                    print(f"  ✅ 写入成功")
                else:
                    fail_count += 1
                    print(f"  ❌ 写入失败")
            except Exception as e:
                fail_count += 1
                print(f"  ❌ 写入异常: {e}")
            finally:
                write_conn.close()

        results_log.append({
            "entity_id": entity_id,
            "play_name": play_name,
            "status": "success",
            "category": category,
            "confidence": confidence,
            "reasoning": reasoning[:200] if reasoning else "",
            "secondary_category": secondary,
        })

        # 断点续传：每条成功后立即更新 checkpoint
        checkpoint_processed[str(entity_id)] = {
            "status": "success",
            "name": play_name,
            "剧目类型": category,
            "分类置信度": confidence,
            "分类依据": reasoning,
            "次要剧目类型": secondary,
        }
        save_checkpoint(checkpoint_processed)

        # 请求间隔
        if idx < total and delay > 0:
            time.sleep(delay)

    # 5. 输出运行日志（到 classification_results/，gitignore 目录）
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = OUTPUT_DIR / f"classify_play_types_{timestamp}.json"

    summary = {
        "timestamp": timestamp,
        "total": total,
        "success": success_count,
        "fail": fail_count,
        "skip": skip_count,
        "dry_run": dry_run,
        "results": results_log,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}, 跳过: {skip_count}")
    print(f"  运行日志: {output_file}")
    print(f"  断点文件: {CHECKPOINT_FILE}")
    print("=" * 60)

    # 6. 导出分类结果到 db_exports/（可提交的文件）
    if not dry_run:
        print("\n正在导出分类结果到 db_exports/ ...")
        export_results_from_checkpoint()

    # 7. 打印当前分类统计
    if not dry_run:
        stat_conn = get_db_connection()
        try:
            stats = count_classified(stat_conn)
            if stats:
                print("\n当前剧目类型分布:")
                total_classified = sum(stats.values())
                for cat, cnt in stats.items():
                    pct = cnt / total_classified * 100
                    print(f"  {cat}: {cnt} ({pct:.1f}%)")
                print(f"  已分类总数: {total_classified}")
        finally:
            stat_conn.close()


# ─── 命令行入口 ─────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="批量剧目分类脚本 - 调用 LLM 对剧本进行剧目类型分类（支持断点续传）"
    )
    parser.add_argument(
        "--dataset-id", type=str, default=None,
        help="限定某个数据集 ID"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="限制处理数量（用于测试）"
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="覆盖已有剧目类型分类"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅预览分类结果，不写入数据库"
    )
    parser.add_argument(
        "--delay", type=float, default=1.0,
        help="每次 LLM 请求间隔秒数（默认 1.0）"
    )
    parser.add_argument(
        "--retries", type=int, default=2,
        help="LLM 调用失败后重试次数（默认 2）"
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="不使用断点续传，从头开始分类"
    )
    parser.add_argument(
        "--import-checkpoint", action="store_true",
        help="从 checkpoint 恢复数据到数据库（不调用 LLM）"
    )
    args = parser.parse_args()

    if args.import_checkpoint:
        import_checkpoint_to_db(dry_run=args.dry_run)
        return

    run(
        dataset_id=args.dataset_id,
        limit=args.limit,
        overwrite=args.overwrite,
        dry_run=args.dry_run,
        delay=args.delay,
        retries=args.retries,
        resume=not args.no_resume,
    )


if __name__ == "__main__":
    main()
