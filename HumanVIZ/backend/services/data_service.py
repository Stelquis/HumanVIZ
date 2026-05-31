"""
数据服务模块
处理数据集的加载、统计和管理（适配京剧剧本数据）
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from functools import wraps

from core.config import settings
from database.connection import get_db_connection
from database.models import (
    get_all_datasets,
    get_dataset_by_id,
    get_entities_by_dataset,
    get_entity_count,
)


def cached(ttl_seconds=30):
    """简单的内存缓存装饰器"""
    cache = {}

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            now = time.time()
            if key in cache:
                result, expire_time = cache[key]
                if now < expire_time:
                    return result
            result = func(*args, **kwargs)
            cache[key] = (result, now + ttl_seconds)
            return result

        wrapper.cache_clear = lambda: cache.clear()
        return wrapper
    return decorator


class DataService:
    """数据服务类 — 京剧剧本数据版本"""

    def __init__(self):
        self._cache = {}

    @cached(ttl_seconds=60)
    def list_datasets(self) -> List[Dict[str, Any]]:
        """
        列出所有可用的数据集（38 个 collection）

        Returns:
            数据集信息列表，按 record_count 降序
        """
        conn = get_db_connection()
        try:
            datasets = get_all_datasets(conn)
            result = [
                {
                    "id": ds["id"],
                    "name": ds["name"],
                    "record_count": ds.get("record_count", 0),
                    "created_at": ds.get("created_at", ""),
                    "category": ds.get("category", ""),
                    "description": ds.get("description", ""),
                }
                for ds in datasets
            ]
            return sorted(result, key=lambda x: -x["record_count"])
        except Exception as e:
            print(f"⚠️ 读取数据集列表失败: {e}")
            return []
        finally:
            conn.close()

    def clear_cache(self):
        """清除缓存（数据导入后调用）"""
        self.list_datasets.cache_clear()
        if hasattr(self, "get_dataset_stats"):
            self.get_dataset_stats.cache_clear()
        self._cache = {}

    @cached(ttl_seconds=120)
    def get_dataset_stats(self) -> Dict[str, Any]:
        """
        获取所有数据集的聚合统计信息

        Returns:
            {
                "total_plays": int,
                "total_datasets": int,
                "categories": [ { "name": "综合剧目集", "count": 1195, "datasets": [...] } ],
                "role_type_distribution": { "老生": 234, ... },
                "total_relations": int,
            }
        """
        conn = get_db_connection()
        try:
            datasets = get_all_datasets(conn)
            total_plays = sum(d.get("record_count", 0) for d in datasets)

            # 按 5 大类汇总
            category_groups: Dict[str, Dict] = {}
            for ds in datasets:
                cat = ds.get("category", "其他")
                if cat not in category_groups:
                    category_groups[cat] = {"name": cat, "count": 0, "datasets": []}
                category_groups[cat]["count"] += ds.get("record_count", 0)
                category_groups[cat]["datasets"].append({
                    "id": ds["id"],
                    "name": ds["name"],
                    "record_count": ds.get("record_count", 0),
                })

            # 行当分布（从 entities.attributes JSON 中统计）
            role_distribution: Dict[str, int] = {}
            try:
                rows = conn.execute(
                    """
                    SELECT attributes FROM entities
                    WHERE type = 'opera_script' AND attributes IS NOT NULL
                    """
                ).fetchall()
                for row in rows:
                    try:
                        attrs = json.loads(row["attributes"])
                        roles = attrs.get("主要角色", [])
                        if isinstance(roles, str):
                            roles = []
                        for r in roles:
                            rt = r.get("role_type", "未知")
                            role_distribution[rt] = role_distribution.get(rt, 0) + 1
                    except Exception:
                        pass
            except Exception:
                pass

            # 总关系数
            total_relations = 0
            try:
                total_relations = conn.execute(
                    "SELECT COUNT(*) as cnt FROM relations"
                ).fetchone()["cnt"]
            except Exception:
                pass

            return {
                "total_plays": total_plays,
                "total_datasets": len(datasets),
                "total_relations": total_relations,
                "categories": sorted(
                    category_groups.values(), key=lambda x: -x["count"]
                ),
                "role_type_distribution": dict(
                    sorted(role_distribution.items(), key=lambda x: -x[1])
                ),
            }
        except Exception as e:
            print(f"⚠️ 获取数据集统计失败: {e}")
            import traceback
            traceback.print_exc()
            return {
                "total_plays": 0,
                "total_datasets": 0,
                "total_relations": 0,
                "categories": [],
                "role_type_distribution": {},
            }
        finally:
            conn.close()

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """
        获取单个数据集详情

        Args:
            dataset_id: 数据集 ID（folder_code，如 "01000000"）
        """
        conn = get_db_connection()
        try:
            dataset = get_dataset_by_id(conn, dataset_id)
            if not dataset:
                return None

            entities = get_entities_by_dataset(conn, dataset_id)

            parsed_entities = []
            for entity in entities:
                entity_data = dict(entity)
                if entity.get("attributes"):
                    try:
                        entity_data["attributes"] = json.loads(entity["attributes"])
                    except Exception:
                        entity_data["attributes"] = entity["attributes"]
                parsed_entities.append(entity_data)

            return {
                "id": dataset["id"],
                "name": dataset["name"],
                "category": dataset.get("category"),
                "description": dataset.get("description"),
                "record_count": len(parsed_entities),
                "entities": parsed_entities,
                "created_at": dataset.get("created_at"),
            }
        except Exception as e:
            print(f"⚠️ 读取数据集失败 {dataset_id}: {e}")
            return None
        finally:
            conn.close()

    def preview_dataset(self, dataset_id: str, limit: int = 50) -> Dict[str, Any]:
        """预览数据集的前 N 条记录"""
        conn = get_db_connection()
        try:
            dataset = get_dataset_by_id(conn, dataset_id)
            if not dataset:
                return {"error": "数据集不存在"}

            entities = get_entities_by_dataset(conn, dataset_id, limit)

            preview_data = []
            for entity in entities:
                item = {
                    "_entity_id": entity["id"],
                    "_entity_name": entity.get("name"),
                }
                if entity.get("attributes"):
                    try:
                        attrs = json.loads(entity["attributes"])
                        item.update(attrs)
                    except Exception:
                        item["content"] = entity.get("content")
                preview_data.append(item)

            total = get_entity_count(conn, dataset_id)

            return {
                "dataset_id": dataset_id,
                "name": dataset["name"],
                "total": total,
                "preview_count": len(preview_data),
                "data": preview_data,
            }
        except Exception as e:
            print(f"⚠️ 预览数据集失败 {dataset_id}: {e}")
            return {"error": f"预览失败: {str(e)}"}
        finally:
            conn.close()

    def get_dataset_entities(
        self, dataset_id: str, filters: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """获取数据集的实体列表，支持筛选"""
        conn = get_db_connection()
        try:
            entities = get_entities_by_dataset(conn, dataset_id)
            result = []

            for entity in entities:
                entity_data = {
                    "id": entity["id"],
                    "name": entity.get("name"),
                    "type": entity.get("type"),
                }

                if entity.get("attributes"):
                    try:
                        attrs = json.loads(entity["attributes"])
                        entity_data.update(attrs)
                    except Exception:
                        pass

                if entity.get("content"):
                    entity_data["content"] = entity["content"]

                result.append(entity_data)

            return result
        finally:
            conn.close()


# 全局数据服务实例
data_service = DataService()
