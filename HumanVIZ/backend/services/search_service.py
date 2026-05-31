"""
搜索服务模块
封装 FTS5 全文检索 + 多维度筛选 + 角色网络查询
"""

import json
from functools import wraps
from typing import Any, Dict, List, Optional
import time

from database.connection import get_db_connection
from database.models import (
    search_plays_fts,
    search_suggest_fts,
    get_play_relations,
    get_global_character_network,
    get_filter_dimensions,
    get_all_datasets,
    get_entities_by_dataset,
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


class SearchService:
    """搜索服务类"""

    def __init__(self):
        self._cache = {}

    def clear_cache(self):
        """清除所有缓存（数据更新后调用）"""
        self.search.cache_clear()
        self.get_dimensions.cache_clear()
        self._cache = {}

    @cached(ttl_seconds=15)
    def search(self, query: str, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        """
        FTS5 全文搜索剧本

        Args:
            query: 搜索关键词
            limit: 返回条数
            offset: 分页偏移

        Returns:
            {"total": int, "results": [...]}
        """
        conn = get_db_connection()
        try:
            results = search_plays_fts(conn, query, limit, offset)
            return {
                "query": query,
                "total": len(results),
                "limit": limit,
                "offset": offset,
                "results": results,
            }
        finally:
            conn.close()

    def suggest(self, prefix: str, limit: int = 10) -> List[str]:
        """搜索自动补全"""
        conn = get_db_connection()
        try:
            return search_suggest_fts(conn, prefix, limit)
        finally:
            conn.close()

    def filter_plays(
        self,
        source_category: str = None,
        role_type: str = None,
        era: str = None,
        play_type: str = None,
        dataset_id: str = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        多维度组合筛选剧本

        所有筛选条件均为可选，内部用 AND 组合。
        """
        conn = get_db_connection()
        try:
            conditions = ["e.type = 'opera_script'"]
            params: list = []

            if source_category:
                conditions.append(
                    "json_extract(e.attributes, '$.__source_category') = ?"
                )
                params.append(source_category)

            if role_type:
                conditions.append(
                    "json_extract(e.attributes, '$.主要角色_flat') LIKE ?"
                )
                params.append(f"%{role_type}%")

            if era:
                conditions.append(
                    "json_extract(e.attributes, '$.时代背景') = ?"
                )
                params.append(era)

            if play_type:
                conditions.append(
                    "json_extract(e.attributes, '$.剧目类型') = ?"
                )
                params.append(play_type)

            if dataset_id:
                conditions.append("e.dataset_id = ?")
                params.append(dataset_id)

            where = " AND ".join(conditions)

            # 总数
            count_sql = f"SELECT COUNT(*) as cnt FROM entities e WHERE {where}"
            total = conn.execute(count_sql, params).fetchone()["cnt"]

            # 数据
            data_sql = f"""
                SELECT e.id, e.name, e.dataset_id, e.content, e.attributes
                FROM entities e
                WHERE {where}
                ORDER BY e.id
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(data_sql, params + [limit, offset]).fetchall()

            results = []
            for row in rows:
                attrs = row["attributes"]
                if attrs:
                    try:
                        attrs = json.loads(attrs)
                    except Exception:
                        pass
                results.append({
                    "id": row["id"],
                    "name": row["name"],
                    "dataset_id": row["dataset_id"],
                    "content_snippet": (row["content"] or "")[:300],
                    "attributes": attrs,
                })

            return {
                "total": total,
                "limit": limit,
                "offset": offset,
                "results": results,
            }
        finally:
            conn.close()

    def get_play_detail(self, entity_id: int) -> Optional[Dict[str, Any]]:
        """获取单部剧本详情 + 角色列表"""
        conn = get_db_connection()
        try:
            row = conn.execute(
                """
                SELECT e.*, d.name as dataset_name, d.category
                FROM entities e
                LEFT JOIN datasets d ON e.dataset_id = d.id
                WHERE e.id = ?
                """,
                (entity_id,),
            ).fetchone()

            if not row:
                return None

            attrs = row["attributes"]
            if attrs:
                try:
                    attrs = json.loads(attrs)
                except Exception:
                    attrs = {}

            return {
                "id": row["id"],
                "name": row["name"],
                "type": row["type"],
                "dataset_id": row["dataset_id"],
                "dataset_name": row["dataset_name"],
                "category": row["category"],
                "content": row["content"],
                "attributes": attrs,
            }
        finally:
            conn.close()

    def get_play_relations(self, entity_id: int) -> Dict[str, Any]:
        """获取单部剧本的角色共现关系（nodes + edges）"""
        conn = get_db_connection()
        try:
            return get_play_relations(conn, entity_id)
        finally:
            conn.close()

    @cached(ttl_seconds=60)
    def get_character_network(
        self,
        source_category: str = None,
        min_cooccurrence: int = 2,
    ) -> Dict[str, Any]:
        """
        跨剧本全局角色共现网络

        Args:
            source_category: 按来源分类过滤
            min_cooccurrence: 最少共现次数阈值
        """
        conn = get_db_connection()
        try:
            return get_global_character_network(
                conn, source_category, min_cooccurrence
            )
        finally:
            conn.close()

    @cached(ttl_seconds=60)
    def get_dimensions(self) -> Dict[str, Any]:
        """获取所有可用的筛选维度及选项"""
        conn = get_db_connection()
        try:
            return get_filter_dimensions(conn)
        finally:
            conn.close()

    def list_datasets(self) -> List[Dict[str, Any]]:
        """列出所有数据集（38 个 collection）"""
        conn = get_db_connection()
        try:
            datasets = get_all_datasets(conn)
            return [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "category": d.get("category", ""),
                    "record_count": d.get("record_count", 0),
                    "description": d.get("description", ""),
                    "created_at": d.get("created_at", ""),
                }
                for d in datasets
            ]
        finally:
            conn.close()

    def get_dataset_plays(
        self, dataset_id: str, limit: int = 100, offset: int = 0
    ) -> Dict[str, Any]:
        """获取某个数据集下的剧本列表"""
        conn = get_db_connection()
        try:
            entities = get_entities_by_dataset(conn, dataset_id, limit)
            results = []
            for e in entities:
                attrs = e.get("attributes")
                if attrs:
                    try:
                        attrs = json.loads(attrs)
                    except Exception:
                        pass
                results.append({
                    "id": e["id"],
                    "name": e["name"],
                    "type": e.get("type"),
                    "content_snippet": (e.get("content") or "")[:200],
                    "attributes": attrs,
                })
            return {
                "dataset_id": dataset_id,
                "total": len(results),
                "results": results,
            }
        finally:
            conn.close()


# 全局实例
search_service = SearchService()
