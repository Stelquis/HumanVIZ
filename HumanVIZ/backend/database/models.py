"""
数据库模型定义
定义表结构和基本操作
"""

import sqlite3
from typing import List, Dict, Any, Optional


# 表结构定义
SCHEMA = """
-- 数据集元信息表
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,           -- 数据类别：水系、建筑、文学等
    dynasty TEXT,            -- 朝代
    year_start INTEGER,      -- 起始年份
    year_end INTEGER,        -- 结束年份
    description TEXT,        -- 描述
    source_file TEXT,        -- 原始文件名
    record_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 实体表（存储每条数据记录）
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id TEXT NOT NULL,
    name TEXT,               -- 实体名称
    type TEXT,               -- 实体类型
    content TEXT,            -- 文本内容（如章节原文）
    attributes TEXT,         -- JSON 格式的其他属性
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

-- 字段定义表（记录每个数据集包含哪些可查询/可展示的字段）
--
-- 【设计目的】
--   现有 entities 表用 attributes(JSON) 存储动态字段，灵活性高但"不知道有哪些字段可用"。
--   这张表解决了这个盲区：导入数据时自动扫描并注册每个字段的元信息，
--   让前端知道该展示哪些列、后端知道该建什么索引、LLM 服务知道该分析哪些维度。
--   赛题数据格式未知时，这张表是"自描述"的关键——新数据导进来，字段就自动注册。
CREATE TABLE IF NOT EXISTS field_defs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id TEXT NOT NULL,           -- 所属数据集 ID
    field_name TEXT NOT NULL,            -- 字段名（如 "dynasty", "length", "happiness"）
    field_type TEXT NOT NULL,            -- 字段类型：text / number / date / category
    display_name TEXT,                   -- 前端显示的中文名（如 "朝代"、"长度（公里）"）
    description TEXT,                    -- 字段说明，帮助 LLM 和用户理解含义
    is_filterable BOOLEAN DEFAULT 0,     -- 是否允许前端按此字段筛选（1=是 0=否）
    is_visible BOOLEAN DEFAULT 1,        -- 是否在前端界面默认展示
    sort_order INTEGER DEFAULT 0,        -- 字段在界面的排列顺序（数字越小越靠前）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,

    -- 同一数据集内不允许重复注册同名字段
    UNIQUE(dataset_id, field_name)
);

-- 实体关系表（存储实体之间的关联关系）
--
-- 【设计目的】
--   为角色关系网络图、知识图谱等可视化能力预留的数据层。
--   例如：林黛玉 <-> 贾宝玉 (relation_type="恋人")，
--         长江 <-> 东海 (relation_type="流入")。
--   source 字段记录关系来源——可以是原文提取、LLM 推断或人工标注，
--   方便未来做数据溯源和可信度评估。
CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL,   -- 关系的起始实体 ID（如 "林黛玉"）
    target_entity_id INTEGER NOT NULL,   -- 关系的目标实体 ID（如 "贾宝玉"）
    relation_type TEXT,                  -- 关系类型：夫妻 / 父子 / 敌对 / 同盟 / 流入 / 所属 ...
    description TEXT,                    -- 关系详细描述（可选，LLM 可填充）
    weight REAL DEFAULT 1.0,             -- 关系权重/强度（0.0~1.0，用于网络图边粗细）
    source TEXT,                         -- 数据来源：original(原文) / llm(大模型推断) / manual(人工标注)
    metadata TEXT,                       -- JSON 格式的扩展信息（如出现章节、置信度等）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- 导入日志表（记录每次数据导入的完整轨迹）
--
-- 【设计目的】
--   数据库负责人的"审计账本"。每次导入（无论成功失败）都留一条记录，
--   解决以下问题：
--   1. "这批数据是什么时候导入的？" → imported_at
--   2. "原始文件叫什么？多大？" → file_name, file_size
--   3. "导入了多少条？有没有丢数据？" → record_count
--   4. "上次导入报错了，具体什么错？" → status, error_message
--   5. "赛题更新后需要重新导入，怎么知道上次用的哪个版本？" → 追溯完整历史
CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id TEXT,                     -- 关联的数据集 ID（NULL 表示未关联到任何数据集的独立导入）
    file_name TEXT NOT NULL,             -- 导入的原始文件名
    file_path TEXT,                      -- 文件完整路径（方便定位源文件）
    file_size INTEGER,                   -- 文件大小（字节）
    record_count INTEGER,                -- 本次导入的记录数
    status TEXT NOT NULL DEFAULT 'pending',  -- 状态：pending(待处理) / success(成功) / failed(失败) / partial(部分成功)
    error_message TEXT,                  -- 失败时的错误详情
    import_duration_seconds REAL,        -- 导入耗时（秒），用于性能监控
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 索引定义 ====================

-- 原有索引
CREATE INDEX IF NOT EXISTS idx_entities_dataset ON entities(dataset_id);
CREATE INDEX IF NOT EXISTS idx_datasets_category ON datasets(category);
CREATE INDEX IF NOT EXISTS idx_datasets_dynasty ON datasets(dynasty);

-- field_defs 索引：按数据集查字段是最常见的查询模式
CREATE INDEX IF NOT EXISTS idx_field_defs_dataset ON field_defs(dataset_id);

-- relations 索引：关系查询通常从某一端实体出发查找所有关联
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_dataset ON relations(source_entity_id);

-- import_logs 索引：审计时通常按时间倒序查看或按数据集筛选
CREATE INDEX IF NOT EXISTS idx_import_logs_dataset ON import_logs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
"""

# FTS5 全文检索虚拟表（独立存储，通过触发器同步）
FTS5_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS plays_fts USING fts5(
    name,              -- 剧本名字
    plot,              -- 情节概要
    dialogue,          -- 正文对话
    roles_text,        -- 主要角色（扁平化为可搜索文本）
    tokenize='unicode61 remove_diacritics 0'
);
"""

# FTS5 同步触发器
#
# 注意：FTS5 的 "INSERT INTO fts(fts, ...) VALUES ('delete', ...)" 语法
# 在某些 SQLite 版本下会报 "SQL logic error"，因此统一使用
# DELETE FROM + INSERT INTO 的方式来保持 FTS5 索引同步。
FTS5_TRIGGERS = """
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities
WHEN NEW.type = 'opera_script'
BEGIN
    INSERT INTO plays_fts(rowid, name, plot, dialogue, roles_text) VALUES (
        NEW.id,
        NEW.name,
        json_extract(NEW.attributes, '$.情节概要'),
        NEW.content,
        json_extract(NEW.attributes, '$.主要角色_flat')
    );
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities
WHEN OLD.type = 'opera_script'
BEGIN
    DELETE FROM plays_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities
WHEN NEW.type = 'opera_script'
BEGIN
    DELETE FROM plays_fts WHERE rowid = OLD.id;
    INSERT INTO plays_fts(rowid, name, plot, dialogue, roles_text) VALUES (
        NEW.id,
        NEW.name,
        json_extract(NEW.attributes, '$.情节概要'),
        NEW.content,
        json_extract(NEW.attributes, '$.主要角色_flat')
    );
END;
"""


def create_tables(conn: sqlite3.Connection):
    """创建所有表结构（含 FTS5）"""
    conn.executescript(SCHEMA)
    conn.commit()


def init_fts(conn: sqlite3.Connection):
    """初始化 FTS5 全文检索（虚拟表 + 触发器）— 仅首次创建"""
    try:
        # 检查 FTS 表是否已存在
        exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='plays_fts'"
        ).fetchone()

        if exists:
            # 表已存在，仅确保触发器就绪
            conn.executescript(FTS5_TRIGGERS)
            conn.commit()
            count = conn.execute("SELECT COUNT(*) FROM plays_fts").fetchone()[0]
            print(f"✅ FTS5 全文检索就绪 ({count} 条索引)")
        else:
            # 首次创建
            conn.executescript(FTS5_SCHEMA)
            conn.executescript(FTS5_TRIGGERS)
            conn.commit()
            print("✅ FTS5 全文检索初始化完成（新建）")
    except Exception as e:
        print(f"⚠️ FTS5 初始化失败: {e}")


def rebuild_fts_index(conn: sqlite3.Connection):
    """
    全量重建 FTS5 索引（导入数据后调用一次）

    删除旧索引，从 entities 表重新插入所有 opera_script 记录。
    """
    import json as _json
    try:
        # 清空 FTS5 表
        conn.execute("DELETE FROM plays_fts")

        # 从 entities 表读取所有 opera_script 并写入 FTS5
        rows = conn.execute(
            "SELECT id, name, content, attributes FROM entities WHERE type = 'opera_script'"
        ).fetchall()

        inserted = 0
        for row in rows:
            attrs = row["attributes"]
            plot = ""
            roles_flat = ""
            if attrs:
                try:
                    attrs = _json.loads(attrs)
                    plot = attrs.get("情节概要", "") or ""
                    roles_flat = attrs.get("主要角色_flat", "") or ""
                except Exception:
                    pass

            conn.execute(
                "INSERT INTO plays_fts(rowid, name, plot, dialogue, roles_text) VALUES (?, ?, ?, ?, ?)",
                (row["id"], row["name"], plot, row["content"] or "", roles_flat),
            )
            inserted += 1

        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM plays_fts").fetchone()[0]
        print(f"✅ FTS5 索引重建完成: {count} 条记录")
    except Exception as e:
        print(f"⚠️ FTS5 索引重建失败: {e}")
        conn.rollback()


# ==================== 数据集操作 ====================

def insert_dataset(
    conn: sqlite3.Connection,
    dataset_id: str,
    name: str,
    category: str = None,
    dynasty: str = None,
    year_start: int = None,
    year_end: int = None,
    description: str = None,
    source_file: str = None,
    record_count: int = 0
) -> bool:
    """插入或更新数据集元信息"""
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO datasets 
            (id, name, category, dynasty, year_start, year_end, description, source_file, record_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (dataset_id, name, category, dynasty, year_start, year_end, description, source_file, record_count)
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 插入数据集失败: {e}")
        return False


def get_all_datasets(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """获取所有数据集列表"""
    cursor = conn.execute(
        """
        SELECT id, name, category, dynasty, year_start, year_end, 
               description, record_count, created_at
        FROM datasets 
        ORDER BY created_at DESC
        """
    )
    return [dict(row) for row in cursor.fetchall()]


def get_dataset_by_id(conn: sqlite3.Connection, dataset_id: str) -> Optional[Dict[str, Any]]:
    """根据 ID 获取数据集"""
    cursor = conn.execute(
        "SELECT * FROM datasets WHERE id = ?",
        (dataset_id,)
    )
    row = cursor.fetchone()
    return dict(row) if row else None


# ==================== 实体操作 ====================

def insert_entity(
    conn: sqlite3.Connection,
    dataset_id: str,
    name: str = None,
    entity_type: str = None,
    content: str = None,
    attributes: str = None
) -> int:
    """
    插入实体记录
    
    Returns:
        int: 新插入记录的 ID
    """
    cursor = conn.execute(
        """
        INSERT INTO entities (dataset_id, name, type, content, attributes)
        VALUES (?, ?, ?, ?, ?)
        """,
        (dataset_id, name, entity_type, content, attributes)
    )
    conn.commit()
    return cursor.lastrowid


def get_entities_by_dataset(
    conn: sqlite3.Connection, 
    dataset_id: str,
    limit: int = None
) -> List[Dict[str, Any]]:
    """获取数据集下的所有实体"""
    sql = "SELECT * FROM entities WHERE dataset_id = ? ORDER BY id"
    params = (dataset_id,)
    
    if limit:
        sql += " LIMIT ?"
        params = (dataset_id, limit)
    
    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def get_entity_count(conn: sqlite3.Connection, dataset_id: str) -> int:
    """获取数据集的实体数量"""
    cursor = conn.execute(
        "SELECT COUNT(*) as count FROM entities WHERE dataset_id = ?",
        (dataset_id,)
    )
    return cursor.fetchone()["count"]


def update_dataset_record_count(conn: sqlite3.Connection, dataset_id: str):
    """更新数据集的记录数"""
    count = get_entity_count(conn, dataset_id)
    conn.execute(
        "UPDATE datasets SET record_count = ? WHERE id = ?",
        (count, dataset_id)
    )
    conn.commit()


# ==================== 数据集操作（补全） ====================


def update_dataset(
    conn: sqlite3.Connection,
    dataset_id: str,
    name: str = None,
    category: str = None,
    dynasty: str = None,
    year_start: int = None,
    year_end: int = None,
    description: str = None,
    source_file: str = None,
    record_count: int = None
) -> bool:
    """
    更新数据集信息（仅更新传入的非空字段，与 insert_dataset 的 REPLACE 语义不同）

    Args:
        conn: 数据库连接
        dataset_id: 数据集 ID（主键）
        其他参数均为可选，仅当值不为 None 时才更新对应字段

    Returns:
        bool: 是否更新成功
    """
    try:
        # 动态构建 SET 子句：只包含非 None 的字段
        updates = []
        params = []

        fields_map = {
            "name": name,
            "category": category,
            "dynasty": dynasty,
            "year_start": year_start,
            "year_end": year_end,
            "description": description,
            "source_file": source_file,
            "record_count": record_count,
        }

        for field, value in fields_map.items():
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if not updates:
            return True  # 没有需要更新的字段，视为成功

        # 始终更新 updated_at 时间戳
        updates.append("updated_at = datetime('now')")
        params.append(dataset_id)

        sql = f"UPDATE datasets SET {', '.join(updates)} WHERE id = ?"
        conn.execute(sql, params)
        conn.commit()
        return True

    except Exception as e:
        print(f"❌ 更新数据集失败: {e}")
        return False


def delete_dataset(conn: sqlite3.Connection, dataset_id: str) -> bool:
    """
    删除数据集（级联删除关联的 entities、field_defs、relations、import_logs）

    由于表定义中已设置 ON DELETE CASCADE，
    删除 datasets 记录后会自动清理所有外键关联的子记录。
    但 import_logs 的 dataset_id 无外键约束（允许 NULL），
    所以这里手动级联删除 import_logs。

    Args:
        conn: 数据库连接
        dataset_id: 要删除的数据集 ID

    Returns:
        bool: 是否删除成功
    """
    try:
        # 手动清除该数据集的导入日志（无外键级联）
        conn.execute("DELETE FROM import_logs WHERE dataset_id = ?", (dataset_id,))
        # 删除数据集本身（entities / field_defs / relations 通过 CASCADE 自动清理）
        conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 删除数据集失败: {e}")
        return False


# ==================== 实体操作（补全） ====================


def get_entity_by_id(conn: sqlite3.Connection, entity_id: int) -> Optional[Dict[str, Any]]:
    """根据实体 ID 获取单条实体记录"""
    cursor = conn.execute("SELECT * FROM entities WHERE id = ?", (entity_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def update_entity(
    conn: sqlite3.Connection,
    entity_id: int,
    name: str = None,
    entity_type: str = None,
    content: str = None,
    attributes: str = None
) -> bool:
    """更新实体记录（仅更新传入的非空字段）"""
    try:
        updates = []
        params = []

        fields_map = {
            "name": name,
            "type": entity_type,
            "content": content,
            "attributes": attributes,
        }

        for field, value in fields_map.items():
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if not updates:
            return True

        params.append(entity_id)
        sql = f"UPDATE entities SET {', '.join(updates)} WHERE id = ?"
        conn.execute(sql, params)
        conn.commit()
        return True

    except Exception as e:
        print(f"❌ 更新实体失败: {e}")
        return False


def update_entity_attributes(
    conn: sqlite3.Connection,
    entity_id: int,
    new_attrs: Dict[str, Any],
    overwrite: bool = False
) -> bool:
    """
    在 entities.attributes JSON 中合并新字段

    适用于在不改数据库结构的前提下，为实体动态追加属性（如剧目分类结果）。

    Args:
        conn: 数据库连接
        entity_id: 实体 ID
        new_attrs: 要合并的新字段字典，如 {"剧目类型": "历史戏", "分类置信度": 0.95}
        overwrite: 是否覆盖已有同名字段（默认 False，即仅追加不存在的字段）

    Returns:
        bool: 是否更新成功
    """
    import json as _json

    try:
        # 1. 读取现有 attributes
        row = conn.execute(
            "SELECT attributes FROM entities WHERE id = ?",
            (entity_id,)
        ).fetchone()

        if not row:
            print(f"⚠️ 实体 {entity_id} 不存在")
            return False

        # 2. 解析现有 JSON
        existing = {}
        if row["attributes"]:
            try:
                existing = _json.loads(row["attributes"])
            except Exception:
                existing = {}

        # 3. 合并新字段
        for key, value in new_attrs.items():
            if overwrite or key not in existing:
                existing[key] = value

        # 4. 写回
        conn.execute(
            "UPDATE entities SET attributes = ? WHERE id = ?",
            (_json.dumps(existing, ensure_ascii=False), entity_id)
        )
        conn.commit()
        return True

    except Exception as e:
        print(f"❌ 更新实体属性失败: {e}")
        return False


def batch_update_entity_attributes(
    conn: sqlite3.Connection,
    updates: List[Dict[str, Any]],
    overwrite: bool = False
) -> int:
    """
    批量在 entities.attributes JSON 中合并新字段

    适用于 LLM 分类完成后一次性写入所有实体的分类结果。

    Args:
        conn: 数据库连接
        updates: 更新列表，每项为字典，需包含:
                 entity_id (int): 实体 ID
                 new_attrs (dict): 要合并的字段字典
        overwrite: 是否覆盖已有同名字段

    Returns:
        int: 成功更新的记录数
    """
    import json as _json

    if not updates:
        return 0

    try:
        success_count = 0

        # 先批量读取所有涉及的实体
        entity_ids = [u["entity_id"] for u in updates]
        placeholders = ",".join("?" * len(entity_ids))
        rows = conn.execute(
            f"SELECT id, attributes FROM entities WHERE id IN ({placeholders})",
            entity_ids
        ).fetchall()

        # 构建 id -> attributes 的映射
        existing_map = {}
        for row in rows:
            attrs = {}
            if row["attributes"]:
                try:
                    attrs = _json.loads(row["attributes"])
                except Exception:
                    pass
            existing_map[row["id"]] = attrs

        # 合并并批量写回
        for update in updates:
            eid = update["entity_id"]
            new_attrs = update["new_attrs"]

            if eid not in existing_map:
                continue

            existing = existing_map[eid]
            for key, value in new_attrs.items():
                if overwrite or key not in existing:
                    existing[key] = value

        # 使用事务批量更新
        for eid, attrs in existing_map.items():
            conn.execute(
                "UPDATE entities SET attributes = ? WHERE id = ?",
                (_json.dumps(attrs, ensure_ascii=False), eid)
            )
            success_count += 1

        conn.commit()
        return success_count

    except Exception as e:
        print(f"❌ 批量更新实体属性失败: {e}")
        conn.rollback()
        return 0


def delete_entity(conn: sqlite3.Connection, entity_id: int) -> bool:
    """
    删除单条实体记录

    注意：由于 relations 表有 ON DELETE CASCADE 引用 entities.id，
    删除实体时其关联的关系也会被自动清除。
    """
    try:
        conn.execute("DELETE FROM entities WHERE id = ?", (entity_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 删除实体失败: {e}")
        return False


def search_entities(
    conn: sqlite3.Connection,
    dataset_id: str,
    keyword: str = None,
    entity_type: str = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    搜索实体记录（支持按名称/内容模糊搜索、按类型筛选）

    使用 SQLite 的 json_extract 函数对 attributes(JSON) 字段做全文检索。

    Args:
        conn: 数据库连接
        dataset_id: 数据集 ID
        keyword: 搜索关键词（匹配 name、content、attributes 中包含此词的记录）
        entity_type: 实体类型过滤
        limit: 返回结果上限
        offset: 分页偏移量

    Returns:
        匹配的实体列表
    """
    conditions = ["dataset_id = ?"]
    params = [dataset_id]

    if keyword:
        conditions.append("""
            (name LIKE ? OR content LIKE ? OR attributes LIKE ?)
        """)
        like_pattern = f"%{keyword}%"
        params.extend([like_pattern, like_pattern, like_pattern])

    if entity_type:
        conditions.append("type = ?")
        params.append(entity_type)

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT * FROM entities 
        WHERE {where_clause}
        ORDER BY id
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def batch_insert_entities(
    conn: sqlite3.Connection,
    dataset_id: str,
    entities_data: List[Dict[str, Any]]
) -> int:
    """
    批量插入实体记录（性能优化版）

    与逐条调用 insert_entity 相比，本函数使用 executemany + 单次 commit，
    在导入数千条记录时可提升 10~50 倍速度。

    Args:
        conn: 数据库连接
        dataset_id: 数据集 ID
        entities_data: 实体列表，每项为字典，可包含 keys:
                       name, type, content, attributes

    Returns:
        int: 成功插入的记录数
    """
    if not entities_data:
        return 0

    try:
        rows = []
        for item in entities_data:
            rows.append((
                dataset_id,
                item.get("name"),
                item.get("type"),
                item.get("content"),
                item.get("attributes"),  # 建议 JSON 字符串
            ))

        conn.executemany(
            """
            INSERT INTO entities (dataset_id, name, type, content, attributes)
            VALUES (?, ?, ?, ?, ?)
            """,
            rows
        )
        conn.commit()
        return len(rows)
    except Exception as e:
        print(f"❌ 批量插入实体失败: {e}")
        conn.rollback()
        return 0


# ==================== 字段定义操作（field_defs CRUD） ====================


def insert_field_def(
    conn: sqlite3.Connection,
    dataset_id: str,
    field_name: str,
    field_type: str,
    display_name: str = None,
    description: str = None,
    is_filterable: bool = False,
    is_visible: bool = True,
    sort_order: int = 0
) -> int:
    """
    注册一个字段定义到指定数据集

    Args:
        conn: 数据库连接
        dataset_id: 所属数据集 ID
        field_name: 字段名（英文标识）
        field_type: 字段类型，限值: text / number / date / category
        display_name: 前端显示名称
        description: 字段说明
        is_filterable: 是否可筛选
        is_visible: 是否默认可见
        sort_order: 排列顺序

    Returns:
        int: 新插入记录的 ID；如果因 UNIQUE 约束冲突返回 -1
    """
    try:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO field_defs 
            (dataset_id, field_name, field_type, display_name, description,
             is_filterable, is_visible, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (dataset_id, field_name, field_type, display_name, description,
             int(is_filterable), int(is_visible), sort_order)
        )
        conn.commit()
        return cursor.lastrowid or -1
    except Exception as e:
        print(f"❌ 插入字段定义失败: {e}")
        return -1


def get_field_defs_by_dataset(
    conn: sqlite3.Connection,
    dataset_id: str,
    visible_only: bool = False
) -> List[Dict[str, Any]]:
    """
    获取某数据集的所有字段定义（按 sort_order 排序）

    Args:
        conn: 数据库连接
        dataset_id: 数据集 ID
        visible_only: 是否只返回 is_visible=1 的字段（前端通常只需要这个）

    Returns:
        字段定义列表
    """
    sql = "SELECT * FROM field_defs WHERE dataset_id = ?"
    params: list = [dataset_id]

    if visible_only:
        sql += " AND is_visible = 1"

    sql += " ORDER BY sort_order ASC, id ASC"

    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def update_field_def(
    conn: sqlite3.Connection,
    field_def_id: int,
    display_name: str = None,
    description: str = None,
    field_type: str = None,
    is_filterable: bool = None,
    is_visible: bool = None,
    sort_order: int = None
) -> bool:
    """更新字段定义"""
    try:
        updates = []
        params = []

        fields_map = {
            "display_name": display_name,
            "description": description,
            "field_type": field_type,
            "is_filterable": is_filterable,
            "is_visible": is_visible,
            "sort_order": sort_order,
        }

        for field, value in fields_map.items():
            if value is not None:
                # 布尔值转为整数存入 SQLite
                val = int(value) if isinstance(value, bool) else value
                updates.append(f"{field} = ?")
                params.append(val)

        if not updates:
            return True

        params.append(field_def_id)
        sql = f"UPDATE field_defs SET {', '.join(updates)} WHERE id = ?"
        conn.execute(sql, params)
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 更新字段定义失败: {e}")
        return False


def delete_field_defs_by_dataset(conn: sqlite3.Connection, dataset_id: str) -> int:
    """
    清除某数据集下的所有字段定义

    通常在重新导入数据时使用——先清旧字段注册，再扫描新数据重新注册。

    Returns:
        int: 被删除的行数
    """
    cursor = conn.execute(
        "DELETE FROM field_defs WHERE dataset_id = ?",
        (dataset_id,)
    )
    conn.commit()
    return cursor.rowcount


# ==================== 关系操作（relations CRUD） ====================


def insert_relation(
    conn: sqlite3.Connection,
    source_entity_id: int,
    target_entity_id: int,
    relation_type: str = None,
    description: str = None,
    weight: float = 1.0,
    source: str = "manual",
    metadata: str = None
) -> int:
    """
    插入一条实体关系

    Args:
        conn: 数据库连接
        source_entity_id: 起始实体 ID
        target_entity_id: 目标实体 ID
        relation_type: 关系类型
        description: 详细描述
        weight: 权重强度 (0.0 ~ 1.0)
        source: 来源标识: original / llm / manual
        metadata: JSON 格式扩展信息

    Returns:
        int: 新插入关系的 ID
    """
    try:
        cursor = conn.execute(
            """
            INSERT INTO relations 
            (source_entity_id, target_entity_id, relation_type, description,
             weight, source, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (source_entity_id, target_entity_id, relation_type, description,
             weight, source, metadata)
        )
        conn.commit()
        return cursor.lastrowid
    except Exception as e:
        print(f"❌ 插入关系失败: {e}")
        return -1


def get_relations_by_entity(
    conn: sqlite3.Connection,
    entity_id: int,
    direction: str = "both"
) -> List[Dict[str, Any]]:
    """
    获取与某个实体相关的所有关系

    Args:
        conn: 数据库连接
        entity_id: 实体 ID
        direction: 查询方向
                   "outgoing" — 仅查以该实体为起点的关系（source）
                   "incoming" — 仅查以该实体为终点的关系（target）
                   "both"     — 双向查询（默认）
    """
    if direction == "outgoing":
        sql = """
            SELECT r.*, 
                   s.name as source_name, t.name as target_name
            FROM relations r
            LEFT JOIN entities s ON r.source_entity_id = s.id
            LEFT JOIN entities t ON r.target_entity_id = t.id
            WHERE r.source_entity_id = ?
        """
        params = [entity_id]
    elif direction == "incoming":
        sql = """
            SELECT r.*, 
                   s.name as source_name, t.name as target_name
            FROM relations r
            LEFT JOIN entities s ON r.source_entity_id = s.id
            LEFT JOIN entities t ON r.target_entity_id = t.id
            WHERE r.target_entity_id = ?
        """
        params = [entity_id]
    else:  # both
        sql = """
            SELECT r.*, 
                   s.name as source_name, t.name as target_name
            FROM relations r
            LEFT JOIN entities s ON r.source_entity_id = s.id
            LEFT JOIN entities t ON r.target_entity_id = t.id
            WHERE r.source_entity_id = ? OR r.target_entity_id = ?
        """
        params = [entity_id, entity_id]

    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def get_relations_by_dataset(
    conn: sqlite3.Connection,
    dataset_id: str,
    relation_type: str = None
) -> List[Dict[str, Any]]:
    """
    获取某数据集下所有实体间的关系

    通过 JOIN entities 表获取关系两端实体的所属数据集来过滤。
    可选按 relation_type 进一步筛选。
    """
    sql = """
        SELECT DISTINCT r.*,
               s.name as source_name, t.name as target_name
        FROM relations r
        INNER JOIN entities s ON r.source_entity_id = s.id
        INNER JOIN entities t ON r.target_entity_id = t.id
        WHERE s.dataset_id = ?
    """
    params = [dataset_id]

    if relation_type:
        sql += " AND r.relation_type = ?"
        params.append(relation_type)

    sql += " ORDER BY r.weight DESC, r.id"

    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def delete_relation(conn: sqlite3.Connection, relation_id: int) -> bool:
    """删除单条关系"""
    try:
        conn.execute("DELETE FROM relations WHERE id = ?", (relation_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 删除关系失败: {e}")
        return False


def batch_insert_relations(
    conn: sqlite3.Connection,
    relations_data: List[Dict[str, Any]]
) -> int:
    """
    批量插入关系记录（性能优化版）

    适用场景：
      - LLM 批量分析后一次性写入角色关系网络
      - 从知识图谱文件导入大量实体关联

    Args:
        conn: 数据库连接
        relations_data: 关系列表，每项为字典，需包含:
                        source_entity_id, target_entity_id
                        可选: relation_type, description, weight, source, metadata

    Returns:
        int: 成功插入的记录数
    """
    if not relations_data:
        return 0

    try:
        rows = []
        for item in relations_data:
            rows.append((
                item.get("source_entity_id"),
                item.get("target_entity_id"),
                item.get("relation_type"),
                item.get("description"),
                item.get("weight", 1.0),
                item.get("source", "manual"),
                item.get("metadata"),
            ))

        conn.executemany(
            """
            INSERT INTO relations 
            (source_entity_id, target_entity_id, relation_type, description,
             weight, source, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows
        )
        conn.commit()
        return len(rows)
    except Exception as e:
        print(f"❌ 批量插入关系失败: {e}")
        conn.rollback()
        return 0


# ==================== 导入日志操作（import_logs CRUD） ====================


def insert_import_log(
    conn: sqlite3.Connection,
    file_name: str,
    dataset_id: str = None,
    file_path: str = None,
    file_size: int = None,
    status: str = "pending",
    record_count: int = None,
    error_message: str = None,
    import_duration_seconds: float = None
) -> int:
    """
    创建一条导入日志记录

    典型使用流程:
        1. 导入开始前: log_id = insert_import_log(..., status="pending")
        2. 导入完成后: update_import_log_status(log_id, status="success", record_count=N)
        3. 导入异常时: update_import_log_status(log_id, status="failed", error_message=str(e))

    Args:
        conn: 数据库连接
        file_name: 原始文件名
        dataset_id: 关联的数据集 ID（可选）
        file_path: 文件完整路径
        file_size: 文件大小（字节）
        status: 初始状态，默认 pending
        record_count: 记录数（导入完成后再填）
        error_message: 错误信息（出错后再填）
        import_duration_seconds: 耗时（秒）

    Returns:
        int: 新日志记录的 ID
    """
    try:
        cursor = conn.execute(
            """
            INSERT INTO import_logs 
            (dataset_id, file_name, file_path, file_size, record_count,
             status, error_message, import_duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (dataset_id, file_name, file_path, file_size, record_count,
             status, error_message, import_duration_seconds)
        )
        conn.commit()
        return cursor.lastrowid
    except Exception as e:
        print(f"❌ 创建导入日志失败: {e}")
        return -1


def get_import_logs(
    conn: sqlite3.Connection,
    dataset_id: str = None,
    status: str = None,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    查询导入日志（支持多条件筛选 + 分页）

    默认按时间倒序排列（最新的在最前面），方便查看最近的导入历史。

    Args:
        conn: 数据库连接
        dataset_id: 按数据集筛选（可选）
        status: 按状态筛选: pending / success / failed / partial（可选）
        limit: 每页条数
        offset: 分页偏移

    Returns:
        日志记录列表
    """
    conditions = []
    params: list = []

    if dataset_id:
        conditions.append("dataset_id = ?")
        params.append(dataset_id)

    if status:
        conditions.append("status = ?")
        params.append(status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    sql = f"""
        SELECT * FROM import_logs
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]


def update_import_log_status(
    conn: sqlite3.Connection,
    log_id: int,
    status: str,
    record_count: int = None,
    error_message: str = None,
    import_duration_seconds: float = None
) -> bool:
    """
    更新导入日志的状态和结果信息

    这是最常用的"收尾"操作——在导入流程结束时调用一次，
    将初始的 pending 状态更新为最终结果（success/failed/partial）。
    """
    try:
        updates = ["status = ?"]
        params: list = [status]

        if record_count is not None:
            updates.append("record_count = ?")
            params.append(record_count)

        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)

        if import_duration_seconds is not None:
            updates.append("import_duration_seconds = ?")
            params.append(import_duration_seconds)

        params.append(log_id)
        sql = f"UPDATE import_logs SET {', '.join(updates)} WHERE id = ?"

        conn.execute(sql, params)
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 更新导入日志失败: {e}")
        return False


def delete_import_log(conn: sqlite3.Connection, log_id: int) -> bool:
    """删除单条导入日志"""
    try:
        conn.execute("DELETE FROM import_logs WHERE id = ?", (log_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"❌ 删除导入日志失败: {e}")
        return False


# ==================== 便捷方法（内部自动管理连接）====================
#
# 以上所有 CRUD 函数都接受 conn 参数，由调用方负责管理连接生命周期。
# 下面提供一组"一步到位"的便捷封装，内部通过 connection.py 的 get_db()
# 上下文管理器自动管理连接的打开和关闭。适合简单场景或脚本调用。
#
# 示例用法（无需手动管理连接）:
#     from database.models import quick_get_all_datasets
#     datasets = quick_get_all_datasets()


def _import_get_db():
    """
    延迟导入 get_db，避免模块加载时的循环依赖问题。

    models.py 被 connection.py 间接引用（connection.py → models.py → create_tables），
    如果在模块顶层直接 from connection import get_db 会形成循环。
    放到函数内部延迟导入即可解决。
    """
    from database.connection import get_db
    return get_db


def quick_get_all_datasets() -> List[Dict[str, Any]]:
    """无需传参的便捷方法：获取所有数据集列表"""
    get_db_ctx = _import_get_db()
    with get_db_ctx() as conn:
        return get_all_datasets(conn)


def quick_get_dataset_by_id(dataset_id: str) -> Optional[Dict[str, Any]]:
    """无需传参的便捷方法：根据 ID 获取数据集"""
    get_db_ctx = _import_get_db()
    with get_db_ctx() as conn:
        return get_dataset_by_id(conn, dataset_id)


def quick_get_field_defs(dataset_id: str, visible_only: bool = False) -> List[Dict[str, Any]]:
    """无需传参的便捷方法：获取某数据集的字段定义"""
    get_db_ctx = _import_get_db()
    with get_db_ctx() as conn:
        return get_field_defs_by_dataset(conn, dataset_id, visible_only)


def quick_get_import_logs(
    dataset_id: str = None,
    status: str = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """无需传参的便捷方法：查询导入日志"""
    get_db_ctx = _import_get_db()
    with get_db_ctx() as conn:
        return get_import_logs(conn, dataset_id, status, limit)


# ==================== FTS5 全文检索操作 ====================


def search_plays_fts(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    使用 FTS5 全文搜索剧本

    匹配范围: 剧本名字、情节概要、正文对话、角色名

    Args:
        conn: 数据库连接
        query: 搜索关键词（支持 FTS5 语法: AND/OR/NOT/前缀*）
        limit: 返回条数
        offset: 分页偏移

    Returns:
        匹配的剧本列表，含 FTS5 rank 分数
    """
    try:
        # 对中文查询做简单处理：双字之间加隐含 AND（防止单字搜索）
        rows = conn.execute(
            """
            SELECT
                e.id,
                e.name,
                e.dataset_id,
                e.content,
                e.attributes,
                fts.rank
            FROM plays_fts fts
            JOIN entities e ON e.id = fts.rowid
            WHERE plays_fts MATCH ?
            ORDER BY fts.rank
            LIMIT ? OFFSET ?
            """,
            (query, limit, offset)
        ).fetchall()

        results = []
        for row in rows:
            attrs = row["attributes"]
            if attrs:
                try:
                    import json
                    attrs = json.loads(attrs)
                except Exception:
                    pass
            results.append({
                "id": row["id"],
                "name": row["name"],
                "dataset_id": row["dataset_id"],
                "content_snippet": (row["content"] or "")[:300],
                "attributes": attrs,
                "rank": row["rank"],
            })
        return results
    except Exception as e:
        # FTS5 语法错误时回退到 LIKE 查询
        print(f"⚠️ FTS5 查询失败，回退到 LIKE: {e}")
        like_pattern = f"%{query}%"
        rows = conn.execute(
            """
            SELECT id, name, dataset_id, content, attributes
            FROM entities
            WHERE type = 'opera_script'
              AND (name LIKE ? OR content LIKE ? OR attributes LIKE ?)
            LIMIT ? OFFSET ?
            """,
            (like_pattern, like_pattern, like_pattern, limit, offset)
        ).fetchall()

        results = []
        for row in rows:
            attrs = row["attributes"]
            if attrs:
                try:
                    import json
                    attrs = json.loads(attrs)
                except Exception:
                    pass
            results.append({
                "id": row["id"],
                "name": row["name"],
                "dataset_id": row["dataset_id"],
                "content_snippet": (row["content"] or "")[:300],
                "attributes": attrs,
                "rank": None,
            })
        return results


def search_suggest_fts(
    conn: sqlite3.Connection,
    prefix: str,
    limit: int = 10
) -> List[str]:
    """
    FTS5 搜索自动补全

    Args:
        conn: 数据库连接
        prefix: 用户输入的前缀
        limit: 返回建议数

    Returns:
        匹配的剧本名字列表
    """
    try:
        rows = conn.execute(
            """
            SELECT name FROM plays_fts
            WHERE plays_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (f"{prefix}*", limit)
        ).fetchall()
        return [row["name"] for row in rows]
    except Exception:
        # 回退到 LIKE
        rows = conn.execute(
            """
            SELECT DISTINCT name FROM entities
            WHERE type = 'opera_script' AND name LIKE ?
            LIMIT ?
            """,
            (f"%{prefix}%", limit)
        ).fetchall()
        return [row["name"] for row in rows]


def get_play_relations(
    conn: sqlite3.Connection,
    entity_id: int
) -> Dict[str, Any]:
    """
    获取单部剧本的角色关系（从 relations 表 + attributes 中解析）

    返回 nodes 和 edges 格式，前端可直接用于 D3 force layout。
    """
    # 获取 entity 的 attributes 中的主要角色
    cursor = conn.execute(
        "SELECT attributes FROM entities WHERE id = ?",
        (entity_id,)
    )
    row = cursor.fetchone()
    if not row:
        return {"nodes": [], "edges": []}

    attrs = row["attributes"]
    if attrs:
        try:
            import json
            attrs = json.loads(attrs)
        except Exception:
            attrs = {}
    else:
        attrs = {}

    roles = attrs.get("主要角色", [])
    if isinstance(roles, str):
        roles = _parse_roles_text(roles)

    # 构建 nodes
    nodes = []
    seen = set()
    for role in roles:
        name = role.get("name", "")
        role_type = role.get("role_type", "")
        if name and name not in seen:
            seen.add(name)
            nodes.append({
                "id": name,
                "name": name,
                "role_type": role_type,
            })

    # 构建 edges（共现关系）
    edges = []
    for i in range(len(roles)):
        for j in range(i + 1, len(roles)):
            edges.append({
                "source": roles[i]["name"],
                "target": roles[j]["name"],
                "weight": 1.0,
            })

    return {"nodes": nodes, "edges": edges}


def get_global_character_network(
    conn: sqlite3.Connection,
    source_category: str = None,
    min_cooccurrence: int = 2
) -> Dict[str, Any]:
    """
    跨剧本全局角色共现网络

    Args:
        conn: 数据库连接
        source_category: 按来源分类过滤（综合剧目集/名家剧本选/...），None 为全部
        min_cooccurrence: 最少共现次数阈值（用于过滤弱连接）

    Returns:
        {"nodes": [...], "edges": [...]} 格式
    """
    import json

    where_extra = ""
    if source_category:
        where_extra = "AND json_extract(e.attributes, '$.source_category') = ?"

    # 收集所有实体
    sql = f"""
        SELECT e.id, e.attributes
        FROM entities e
        WHERE e.type = 'opera_script' {where_extra}
    """
    params = (source_category,) if source_category else ()

    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()

    # 统计角色共现
    node_set = {}       # name -> {name, role_type, count}
    edge_weights = {}   # (a, b) -> weight

    for row in rows:
        attrs = row["attributes"]
        if attrs:
            try:
                attrs = json.loads(attrs)
            except Exception:
                continue
        else:
            continue

        roles = attrs.get("主要角色", [])
        if isinstance(roles, str):
            roles = _parse_roles_text(roles)

        role_names = []
        for role in roles:
            name = role.get("name", "")
            role_type = role.get("role_type", "")
            if not name:
                continue
            role_names.append(name)
            if name not in node_set:
                node_set[name] = {"name": name, "role_type": role_type, "count": 0}
            node_set[name]["count"] += 1

        # 统计共现
        for i in range(len(role_names)):
            for j in range(i + 1, len(role_names)):
                a, b = sorted([role_names[i], role_names[j]])
                key = f"{a}|||{b}"
                edge_weights[key] = edge_weights.get(key, 0) + 1

    # 过滤
    nodes = [{"id": name, **info} for name, info in node_set.items()]
    edges = []
    for key, weight in edge_weights.items():
        if weight >= min_cooccurrence:
            a, b = key.split("|||")
            edges.append({"source": a, "target": b, "weight": weight})

    return {"nodes": nodes, "edges": edges}


def get_filter_dimensions(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    获取所有可用的筛选维度及选项值

    扫描 field_defs + datasets + entities.attributes 汇总当前数据中的所有维度。
    """
    # 基础维度：来源分类
    datasets = get_all_datasets(conn)
    categories = list(set(d.get("category") for d in datasets if d.get("category")))

    # 角色行当：从 field_defs 中查
    field_rows = conn.execute(
        "SELECT DISTINCT field_name, display_name FROM field_defs WHERE is_filterable = 1 ORDER BY sort_order"
    ).fetchall()

    dimensions = {
        "source_category": {
            "display_name": "来源分类",
            "type": "category",
            "values": sorted(categories),
        }
    }

    for fr in field_rows:
        fname = fr["field_name"]
        if fname.startswith("__"):
            continue
        dimensions[fname] = {
            "display_name": fr["display_name"] or fname,
            "type": "text",
        }

    return dimensions


# ── 内部辅助 ──

def _parse_roles_text(text: str) -> List[Dict[str, str]]:
    """解析 '角色名：行当' 格式的文本"""
    if not text:
        return []
    roles = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if "：" in line:
            name, role_type = line.split("：", 1)
            roles.append({"name": name.strip(), "role_type": role_type.strip()})
        elif ":" in line:
            name, role_type = line.split(":", 1)
            roles.append({"name": name.strip(), "role_type": role_type.strip()})
    return roles
