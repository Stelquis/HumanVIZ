"""
HumanVIZ Backend - FastAPI主入口
人文数据可视化后端服务
"""

import sys
import os
from pathlib import Path

# backend模块已整合，无需额外路径配置

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates

from core.config import settings
from core.exceptions import (
    api_exception_handler,
    http_exception_handler,
    general_exception_handler,
    APIException
)
from api.routes import router as api_router
from services.llm_service import llm_service
from services.data_service import data_service


# ==================== 创建FastAPI应用 ====================

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# ==================== 静态文件配置 ====================

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# ==================== 中间件配置 ====================

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 异常处理器
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# ==================== 模板配置 ====================

# 获取模板目录的绝对路径
template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

# 创建 FastAPI 模板实例
templates = Jinja2Templates(directory=template_dir)

# ==================== API路由 ====================

app.include_router(
    api_router,
    prefix=settings.API_V1_STR,
    tags=["api"]
)

# ==================== 管理后台页面路由 ====================

@app.get("/HumanVIZ", response_class=HTMLResponse, include_in_schema=False)
async def admin_dashboard(request: Request):
    """
    管理后台首页 - 仪表盘
    """
    datasets = data_service.list_datasets()
    llm_info = llm_service.get_model_info()
    
    # 获取数据库状态
    db_stats = get_db_stats()
    
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "request": request,
            "active_page": "dashboard",
            "datasets": datasets,
            "dataset_count": len(datasets),
            "llm_provider": llm_info["provider"],
            "llm_model": llm_info["model"],
            "llm_status": "available" if llm_service._llm else "not_loaded",
            "version": settings.VERSION,
            "db_table_count": db_stats["table_count"],
            "db_total_records": db_stats["total_records"],
            "db_size": db_stats["size"],
            "db_dataset_count": db_stats.get("dataset_count", 0),
            "db_fts_indexed": db_stats.get("fts_indexed", 0),
        }
    )


def get_db_stats():
    """获取数据库统计信息"""
    try:
        from database.connection import get_db_connection
        import os

        conn = get_db_connection()
        try:
            # 获取表数量
            cursor = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            table_count = cursor.fetchone()[0]

            # 获取总剧本数
            cursor = conn.execute(
                "SELECT COUNT(*) FROM entities WHERE type='opera_script'"
            )
            total_records = cursor.fetchone()[0]

            # 获取数据集数
            cursor = conn.execute("SELECT COUNT(*) FROM datasets")
            dataset_count = cursor.fetchone()[0]

            # 获取数据库文件大小
            db_list = conn.execute("PRAGMA database_list").fetchone()
            if db_list and len(db_list) > 2:
                db_path = db_list[2]
            else:
                db_path = str(Path(__file__).parent.parent / "data" / "humanviz.db")
            size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0
            size_str = format_size(size_bytes)

            # FTS5 索引状态
            try:
                cursor = conn.execute("SELECT COUNT(*) FROM plays_fts")
                fts_count = cursor.fetchone()[0]
            except Exception:
                fts_count = 0

            return {
                "table_count": table_count,
                "total_records": total_records,
                "dataset_count": dataset_count,
                "fts_indexed": fts_count,
                "size": size_str,
            }
        finally:
            conn.close()
    except Exception as e:
        print(f"获取数据库状态失败: {e}")
        return {
            "table_count": 0,
            "total_records": 0,
            "dataset_count": 0,
            "fts_indexed": 0,
            "size": "Unknown",
        }


def format_size(size_bytes):
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


@app.get("/HumanVIZ/data", response_class=HTMLResponse, include_in_schema=False)
async def admin_data(request: Request):
    """
    数据管理中心
    """
    datasets = data_service.list_datasets()
    
    return templates.TemplateResponse(
        request=request,
        name="data_manager.html",
        context={
            "request": request,
            "active_page": "data",
            "datasets": datasets
        }
    )


@app.get("/HumanVIZ/llm", response_class=HTMLResponse, include_in_schema=False)
async def admin_llm(request: Request):
    """
    LLM测试台
    """
    llm_info = llm_service.get_model_info()
    llm_info["status"] = "available" if llm_service._llm else "not_loaded"
    
    return templates.TemplateResponse(
        request=request,
        name="llm_test.html",
        context={
            "request": request,
            "active_page": "llm",
            "llm_info": llm_info
        }
    )


@app.get("/HumanVIZ/colors", response_class=HTMLResponse, include_in_schema=False)
async def admin_colors(request: Request):
    """
    配色方案展示
    """
    return templates.TemplateResponse(
        request=request,
        name="color_schemes.html",
        context={
            "request": request,
            "active_page": "colors"
        }
    )


@app.get("/HumanVIZ/docs", response_class=HTMLResponse, include_in_schema=False)
async def admin_docs(request: Request):
    """
    API 文档页面
    """
    return templates.TemplateResponse(
        request=request,
        name="api_docs.html",
        context={
            "request": request,
            "active_page": "docs"
        }
    )


@app.get("/HumanVIZ/preview", response_class=HTMLResponse, include_in_schema=False)
async def admin_preview(request: Request):
    """
    数据预览页面
    """
    datasets = data_service.list_datasets()
    return templates.TemplateResponse(
        request=request,
        name="data_preview.html",
        context={
            "request": request,
            "active_page": "preview",
            "datasets": datasets
        }
    )


@app.get("/HumanVIZ/sql", response_class=HTMLResponse, include_in_schema=False)
async def admin_sql(request: Request):
    """
    SQL 查询器页面
    """
    return templates.TemplateResponse(
        request=request,
        name="sql_query.html",
        context={
            "request": request,
            "active_page": "sql"
        }
    )


@app.get("/HumanVIZ/import-export", response_class=HTMLResponse, include_in_schema=False)
async def admin_import_export(request: Request):
    """
    数据导入导出页面
    """
    datasets = data_service.list_datasets()
    return templates.TemplateResponse(
        request=request,
        name="import_export.html",
        context={
            "request": request,
            "active_page": "import-export",
            "datasets": datasets
        }
    )


# ==================== 根路由 ====================

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root():
    """
    根路径 - 重定向到管理后台
    """
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>HumanVIZ Backend</title>
        <link rel="icon" href="data:image/svg+xml;base64,PCFET0NUWVBFIHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48dGV4dCB4PSI1MCIgeT0iODAiIGZvbnQtc2l6ZT0iODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuKAlTAwPC90ZXh0Pjwvc3ZnPg==">
        <meta http-equiv="refresh" content="0;url=/HumanVIZ">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                line-height: 1.6;
                color: #333;
                text-align: center;
            }
            h1 { color: #667eea; }
            a { color: #667eea; }
        </style>
    </head>
    <body>
        <h1>🖥️ HumanVIZ Backend</h1>
        <p>正在跳转到 <a href="/HumanVIZ">管理后台</a>...</p>
        <p>
            <a href="/HumanVIZ">管理后台</a> | 
            <a href="/docs">API文档</a>
        </p>
    </body>
    </html>
    """


# ==================== 启动事件 ====================

@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    print("=" * 60)
    print(f"🚀 {settings.PROJECT_NAME} v{settings.VERSION}")
    print("=" * 60)
    print(f"📚 API文档: http://localhost:{settings.PORT}/docs")
    print(f"🎛️  管理后台: http://localhost:{settings.PORT}/HumanVIZ")
    print(f"📊 健康检查: http://localhost:{settings.PORT}/api/v1/status")
    print("=" * 60)
    
    # 尝试加载LLM模型
    try:
        _ = llm_service.llm
        print("✅ LLM服务初始化成功")
    except Exception as e:
        print(f"⚠️  LLM服务初始化失败: {e}")
        print("   请检查 secrets.json 配置")
    
    # 初始化数据库（含 FTS5）
    try:
        from database import init_database
        init_database()
    except Exception as e:
        print(f"⚠️ 数据库初始化失败: {e}")

    # 初始化搜索服务
    try:
        from services.search_service import search_service as _ss
        stats = _ss.get_dimensions()
        print(f"✅ 搜索服务就绪")
    except Exception as e:
        print(f"⚠️ 搜索服务初始化失败: {e}")

    # 检查数据集
    datasets = data_service.list_datasets()
    print(f"✅ 发现 {len(datasets)} 个数据集")
    print("=" * 60)


# ==================== 主入口 ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
