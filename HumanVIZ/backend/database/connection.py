"""
数据库连接管理
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from core.config import settings

# 数据库文件路径
DB_PATH = settings.BASE_DIR.parent / "data" / "humanviz.db"


# ============================================================
#  方式一：基础连接函数（保留原样，确保现有代码零影响）
#
#  适用场景：旧代码、简单脚本、不需要自动关闭连接的场景。
#  注意：调用方必须手动调用 conn.close()，否则连接会泄漏。
# ============================================================
def get_db_connection() -> sqlite3.Connection:
    """
    获取数据库连接
    
    Returns:
        sqlite3.Connection: 数据库连接对象
    """
    # 确保目录存在
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # 创建连接
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row  # 让查询结果可以像字典一样访问
    conn.execute("PRAGMA foreign_keys = ON")  # 启用外键约束
    
    return conn


# ============================================================
#  方式二：上下文管理器（推荐新代码使用）
#  原来的 get_db_connection() 有一个隐患：只负责打开连接，不负责关闭。
#  如果调用方写了 conn = get_db_connection() 之后忘记写 conn.close()，
#  或者中间抛了异常导致 close() 没执行到，连接就会一直占用 SQLite 的文件锁，
#  轻则其他请求卡住等待锁释放，重则整个数据库被锁死无法读写。
#
#  用 @contextmanager 装饰后，get_db 变成了一个可以用 with 语句使用的对象
#  无论是否抛异常，退出 with 块时都会自动关闭连接，避免了资源泄漏和死锁问题
# ============================================================
@contextmanager
def get_db():
    """
    获取数据库连接（上下文管理器版本）
    
    使用方式:
        with get_db() as conn:
            result = conn.execute("SELECT ...")
    
    Yields:
        sqlite3.Connection: 已配置好的数据库连接对象
    
    特点:
        - 退出 with 块时自动关闭连接，无需手动 close()
        - 即使 with 块内发生异常，也能保证连接被关闭
        - 与 get_db_connection() 返回的连接完全等价（同样的 row_factory、PRAGMA 配置）
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


def init_database():
    """初始化数据库（创建表结构）"""
    from database.models import create_tables, init_fts

    conn = get_db_connection()
    try:
        create_tables(conn)
        init_fts(conn)
        print("✅ 数据库初始化完成（含 FTS5）")
    finally:
        conn.close()
