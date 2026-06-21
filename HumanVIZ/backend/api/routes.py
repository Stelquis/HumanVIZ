"""
API路由模块
定义所有API端点
"""

import json
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from core.exceptions import create_response
from models.schemas import (
    ColorRequest, ColorResponse,
    YAxisRequest, YAxisResponse,
    QuestionRequest, QuestionResponse,
    ChapterRequest, ChapterResponse,
    DatasetListResponse, DatasetInfo,
    SystemStatus
)
from services.llm_service import llm_service, assign_character_attributes, add_yaxis_data, ask_question, find_chapter
from services.data_service import data_service
from api.dependencies import get_llm, get_data_service

# 创建路由器
router = APIRouter()


# ==================== 系统状态接口 ====================

@router.get("/status", response_model=dict, summary="系统状态检查")
async def get_status():
    """
    获取系统运行状态
    """
    model_info = llm_service.get_model_info()
    return create_response(data={
        "status": "ok",
        "version": "1.0.0",
        "llm_provider": model_info["provider"],
        "llm_model": model_info["model"]
    })


# ==================== LLM相关接口 ====================

@router.post("/llm/colors", response_model=dict, summary="分配角色颜色")
async def add_new_colors(request: ColorRequest):
    """
    为角色或主题分配颜色属性
    
    - **data**: 角色或主题数据列表
    - **color_desc**: 颜色描述（如"性别"、"性格"）
    - **palette_info**: 调色板偏好（可选）
    - **story_type**: 类型（character/theme）
    """
    print(f"🎨 分配颜色: {request.color_desc}")
    start_time = time.time()
    
    try:
        char_attrs, color_assignments = assign_character_attributes(
            llm_service.llm,
            request.data,
            request.color_desc,
            request.palette_info,
            request.story_type
        )
        
        elapsed = time.time() - start_time
        print(f"✅ 颜色分配完成，耗时: {elapsed:.2f}秒")
        
        return create_response(data={
            "char_attrs": char_attrs,
            "color_assignments": color_assignments
        })
    except Exception as e:
        print(f"❌ 颜色分配失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM处理失败: {str(e)}")


@router.post("/llm/yaxis", response_model=dict, summary="添加Y轴数据")
async def add_new_yaxis(request: YAxisRequest):
    """
    为场景数据添加Y轴维度
    
    - **data**: 场景数据
    - **yaxis_desc**: Y轴描述（如"幸福感"、"紧张度"）
    - **story_type**: 类型（character/theme）
    """
    print(f"📊 添加Y轴: {request.yaxis_desc}")
    start_time = time.time()
    
    try:
        new_data = add_yaxis_data(
            llm_service.llm,
            request.data,
            request.yaxis_desc,
            request.story_type
        )
        
        elapsed = time.time() - start_time
        print(f"✅ Y轴数据添加完成，耗时: {elapsed:.2f}秒")
        
        return create_response(data={"new_data": new_data})
    except Exception as e:
        print(f"❌ Y轴数据添加失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM处理失败: {str(e)}")


@router.post("/llm/ask", response_model=dict, summary="问答接口")
async def ask_llm(request: QuestionRequest):
    """
    向LLM提问
    
    - **question**: 问题内容
    - **data**: 相关上下文数据
    """
    print(f"❓ 问题: {request.question}")
    start_time = time.time()
    
    try:
        answer = ask_question(
            llm_service.llm,
            request.data,
            request.question
        )
        
        elapsed = time.time() - start_time
        print(f"✅ 回答生成完成，耗时: {elapsed:.2f}秒")
        
        return create_response(data={"answer": answer})
    except Exception as e:
        print(f"❌ 问答失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM处理失败: {str(e)}")


@router.post("/llm/find-chapter", response_model=dict, summary="查找相关章节")
async def find_chapter_with_llm(request: ChapterRequest):
    """
    根据问题查找相关章节
    
    - **question**: 问题内容
    - **data**: 章节数据
    """
    print(f"🔍 查找章节: {request.question}")
    start_time = time.time()
    
    try:
        chapter, explanation = find_chapter(
            llm_service.llm,
            request.data,
            request.question
        )
        
        elapsed = time.time() - start_time
        print(f"✅ 章节查找完成，耗时: {elapsed:.2f}秒")
        
        return create_response(data={
            "chapter": chapter,
            "explanation": explanation
        })
    except Exception as e:
        print(f"❌ 章节查找失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM处理失败: {str(e)}")


# ==================== 数据管理接口 ====================

@router.get("/datasets", response_model=dict, summary="获取数据集列表")
async def list_datasets():
    """
    获取所有可用的数据集列表
    """
    datasets = data_service.list_datasets()
    return create_response(data={
        "datasets": datasets,
        "total": len(datasets)
    })


@router.get("/datasets/stats", response_model=dict, summary="获取数据集聚合统计")
async def get_dataset_stats():
    """
    获取所有数据集的聚合统计信息

    返回：
    - 按类别分组的记录数、朝代分布
    - 按朝代汇总的总记录数
    - 按大类（自然环境/社会经济/文化建筑/军事事件）的分组统计
    """
    stats = data_service.get_dataset_stats()
    return create_response(data=stats)


@router.get("/datasets/{dataset_id}", response_model=dict, summary="获取数据集详情")
async def get_dataset(dataset_id: str):
    """
    获取指定数据集的完整数据
    
    - **dataset_id**: 数据集ID（文件名，不含.json）
    """
    data = data_service.get_dataset(dataset_id)
    
    if data is None:
        raise HTTPException(status_code=404, detail=f"数据集 '{dataset_id}' 不存在")
    
    return create_response(data=data)


@router.get("/datasets/{dataset_id}/preview", response_model=dict, summary="预览数据集")
async def preview_dataset(dataset_id: str, limit: int = 50):
    """
    预览数据集的前N条记录
    
    - **dataset_id**: 数据集ID
    - **limit**: 返回记录数（默认50，最大100）
    """
    limit = min(limit, 100)  # 限制最大100条
    result = data_service.preview_dataset(dataset_id, limit)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return create_response(data=result)


# ==================== 模型信息接口 ====================

@router.get("/llm/info", response_model=dict, summary="获取LLM配置信息")
async def get_llm_info():
    """
    获取当前LLM配置信息（不含敏感信息）
    """
    model_info = llm_service.get_model_info()
    return create_response(data={
        "provider": model_info["provider"],
        "model": model_info["model"],
        "status": "available" if llm_service._llm else "not_loaded"
    })


# ==================== 管理后台 API ====================

from pydantic import BaseModel

class SQLQueryRequest(BaseModel):
    sql: str

@router.post("/admin/query", response_model=dict, summary="执行 SQL 查询")
async def execute_sql_query(request: SQLQueryRequest):
    """
    执行 SQL 查询（仅限 SELECT）
    
    - **sql**: SQL 查询语句
    """
    import re
    
    sql = request.sql.strip()
    
    # 安全检查：只允许 SELECT
    # 1. 必须以 SELECT 开头
    if not sql.lower().startswith('select'):
        raise HTTPException(status_code=400, detail="只允许执行 SELECT 查询")
    
    # 2. 禁止危险关键字
    dangerous_keywords = [
        'insert', 'update', 'delete', 'drop', 'truncate', 'create',
        'alter', 'grant', 'revoke', 'exec', 'execute', 'union',
        '--', '/*', '*/', ';'
    ]
    sql_lower = sql.lower()
    for keyword in dangerous_keywords:
        if keyword in sql_lower:
            raise HTTPException(status_code=400, detail=f"SQL 包含危险关键字: {keyword}")
    
    try:
        from database.connection import get_db_connection
        
        conn = get_db_connection()
        try:
            cursor = conn.execute(sql)
            rows = cursor.fetchall()
            
            # 转换为字典列表
            results = []
            for row in rows:
                row_dict = {}
                for key in row.keys():
                    val = row[key]
                    # 处理不可序列化的类型
                    if val is None:
                        row_dict[key] = None
                    elif isinstance(val, (int, float, str, bool)):
                        row_dict[key] = val
                    else:
                        row_dict[key] = str(val)
                results.append(row_dict)
            
            return create_response(data=results)
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"查询执行失败: {str(e)}")


from fastapi import UploadFile, File

# 文件上传限制
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {'.xlsx', '.xls', '.csv', '.json', '.txt'}

@router.post("/admin/import", response_model=dict, summary="导入数据文件")
async def import_data_file(file: UploadFile = File(...)):
    """
    上传并导入数据文件（Excel/CSV/JSON/TXT）
    
    - **file**: 要上传的文件
    """
    import tempfile
    import os
    from pathlib import Path
    
    # 检查文件扩展名
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {suffix}，仅支持: {', '.join(ALLOWED_EXTENSIONS)}")
    
    # 读取并检查文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大，最大支持 {MAX_FILE_SIZE / 1024 / 1024:.0f}MB")
    
    # 保存上传的文件
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # 根据文件类型导入
        from scripts.import_data import import_excel, import_csv, import_json, import_txt
        
        dataset_id = Path(file.filename).stem.replace(" ", "_").replace("-", "_")
        
        if suffix in ['.xlsx', '.xls']:
            success = import_excel(Path(tmp_path), dataset_id)
        elif suffix == '.csv':
            success = import_csv(Path(tmp_path), dataset_id)
        elif suffix == '.json':
            success = import_json(Path(tmp_path), dataset_id)
        elif suffix == '.txt':
            success = import_txt(Path(tmp_path), dataset_id)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {suffix}")
        
        if success:
            return create_response(data={"imported": True, "dataset_id": dataset_id})
        else:
            raise HTTPException(status_code=500, detail="导入失败")
    finally:
        os.unlink(tmp_path)


@router.get("/admin/export", response_model=dict, summary="导出数据集")
async def export_dataset(dataset_id: str, format: str = "json"):
    """
    导出数据集为 JSON 或 CSV
    
    - **dataset_id**: 数据集 ID
    - **format**: 导出格式 (json/csv)
    """
    import csv
    import io
    
    data = data_service.get_dataset(dataset_id)
    if not data:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    entities = data.get("entities", [])
    
    if format == "json":
        # 解析 attributes
        results = []
        for entity in entities:
            item = {"id": entity["id"], "name": entity.get("name")}
            attrs = entity.get("attributes", {})
            if isinstance(attrs, str):
                try:
                    attrs = json.loads(attrs)
                except:
                    attrs = {}
            item.update(attrs)
            results.append(item)
        
        return create_response(data=results)
    
    elif format == "csv":
        if not entities:
            return create_response(data="")
        
        # 解析所有字段
        all_keys = set()
        parsed_entities = []
        for entity in entities:
            item = {"id": entity["id"], "name": entity.get("name")}
            attrs = entity.get("attributes", {})
            if isinstance(attrs, str):
                try:
                    attrs = json.loads(attrs)
                except:
                    attrs = {}
            item.update(attrs)
            all_keys.update(item.keys())
            parsed_entities.append(item)
        
        # 生成 CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=sorted(all_keys))
        writer.writeheader()
        writer.writerows(parsed_entities)
        
        return create_response(data=output.getvalue())
    
    else:
        raise HTTPException(status_code=400, detail="不支持的导出格式")


# ==================== 京剧剧本搜索与筛选接口 ====================

from services.search_service import search_service
from services.llm_service import llm_service as _llm_svc


@router.get("/plays/search", response_model=dict, summary="全文搜索剧本")
async def search_plays(q: str, limit: int = 50, offset: int = 0):
    """
    使用 FTS5 全文搜索京剧剧本

    - **q**: 搜索关键词（支持 AND/OR/NOT 语法）
    - **limit**: 返回条数（默认 50）
    - **offset**: 分页偏移
    """
    result = search_service.search(q, limit, offset)
    return create_response(data=result)


@router.get("/plays/suggest", response_model=dict, summary="搜索自动补全")
async def suggest_plays(prefix: str, limit: int = 10):
    """
    根据输入前缀返回匹配的剧本名字建议

    - **prefix**: 用户输入的前缀
    """
    suggestions = search_service.suggest(prefix, limit)
    return create_response(data={"prefix": prefix, "suggestions": suggestions})


@router.get("/plays/filter", response_model=dict, summary="多维度筛选剧本")
async def filter_plays(
    source_category: str = None,
    role_type: str = None,
    era: str = None,
    play_type: str = None,
    dataset_id: str = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    多维度组合筛选京剧剧本

    - **source_category**: 来源分类（综合剧目集/京剧名家剧本选/...）
    - **role_type**: 角色行当（老生/青衣/花脸/...）
    - **era**: 时代背景（三国/北宋/明代/...）
    - **play_type**: 剧目类型（历史戏/家庭戏/公案戏/...）
    - **dataset_id**: 限定某个数据集
    """
    result = search_service.filter_plays(
        source_category=source_category,
        role_type=role_type,
        era=era,
        play_type=play_type,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
    )
    return create_response(data=result)


@router.get("/plays/{entity_id}", response_model=dict, summary="剧本详情")
async def get_play_detail(entity_id: int):
    """
    获取单部剧本的完整信息（详情 + 角色列表）

    - **entity_id**: 剧本实体 ID
    """
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"剧本 '{entity_id}' 不存在")
    return create_response(data=detail)


@router.get("/plays/{entity_id}/relations", response_model=dict, summary="剧本角色关系")
async def get_play_relations(entity_id: int):
    """
    获取单部剧本的角色共现关系（nodes + edges 格式）

    - **entity_id**: 剧本实体 ID
    """
    relations = search_service.get_play_relations(entity_id)
    return create_response(data=relations)


@router.get("/network/characters", response_model=dict, summary="全局角色关系网络")
async def get_character_network(
    source_category: str = None,
    min_cooccurrence: int = 2,
):
    """
    获取跨剧本的全局角色共现网络（供 D3 force layout 渲染）

    - **source_category**: 按来源分类过滤（不传则为全部）
    - **min_cooccurrence**: 最少共现次数阈值（用于过滤弱连接）
    """
    network = search_service.get_character_network(
        source_category=source_category,
        min_cooccurrence=min_cooccurrence,
    )
    return create_response(data=network)


@router.get("/plays/dimensions", response_model=dict, summary="筛选维度元信息")
async def get_play_dimensions():
    """
    获取当前所有可用的筛选维度及选项值

    前端据此动态渲染筛选器（下拉框、多选等）。
    """
    dimensions = search_service.get_dimensions()
    return create_response(data=dimensions)


# ==================== LLM 分析接口（京剧任务） ====================


class OperaAnalysisRequest(BaseModel):
    entity_id: int


@router.post("/llm/classify-roles", response_model=dict, summary="Task1: 行当分类")
async def classify_roles(request: OperaAnalysisRequest):
    """
    角色行当归属推断

    基于剧本角色描述和对话，推断未标注角色的行当归属（生旦净丑及细分支）。
    """
    entity_id = request.entity_id
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="剧本不存在")

    try:
        from services.prompts_opera import classify_character_roles

        llm = _llm_svc.llm
        result = classify_character_roles(llm, detail)
        return create_response(data=result)
    except Exception as e:
        print(f"❌ 行当分类失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 分析失败: {str(e)}")


@router.post("/llm/classify-play-type", response_model=dict, summary="剧目分类")
async def classify_play_type(request: OperaAnalysisRequest):
    """
    剧目类型分类标注

    根据剧本情节、主要角色、正文对话，推断剧目类型
    （历史戏/家庭戏/公案戏/爱情戏/神话戏/侠义戏/技法展示戏），
    并将分类结果写入 entities.attributes 的 剧目类型 字段。
    """
    entity_id = request.entity_id
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="剧本不存在")

    try:
        from services.prompts_opera import classify_play_type
        from database.connection import get_db_connection
        from database.models import update_entity_attributes

        llm = _llm_svc.llm
        result = classify_play_type(llm, detail)

        # 将分类结果写入 entities.attributes
        classification = result.get("result", {})
        category = classification.get("category", "")
        confidence = classification.get("confidence", "")
        reasoning = classification.get("reasoning", "")
        secondary = classification.get("secondary_category")

        new_attrs = {
            "剧目类型": category,
            "分类置信度": confidence,
            "分类依据": reasoning,
        }
        if secondary:
            new_attrs["次要剧目类型"] = secondary

        conn = get_db_connection()
        try:
            update_entity_attributes(conn, entity_id, new_attrs, overwrite=True)
        finally:
            conn.close()

        return create_response(data={
            "entity_id": entity_id,
            "play_name": result.get("play_name"),
            "category": category,
            "confidence": confidence,
            "reasoning": reasoning,
            "secondary_category": secondary,
            "saved": True,
        })
    except Exception as e:
        print(f"❌ 剧目分类失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 分析失败: {str(e)}")


@router.post("/llm/extract-themes", response_model=dict, summary="主题提取")
async def extract_themes(request: OperaAnalysisRequest):
    """
    剧本核心主题标签提取

    从剧本情节和对话中提取 2-5 个主题标签。
    """
    entity_id = request.entity_id
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="剧本不存在")

    try:
        from services.prompts_opera import extract_play_themes

        llm = _llm_svc.llm
        result = extract_play_themes(llm, detail)
        return create_response(data=result)
    except Exception as e:
        print(f"❌ 主题提取失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 分析失败: {str(e)}")


@router.post("/llm/analyze-narrative", response_model=dict, summary="叙事结构分析")
async def analyze_narrative(request: OperaAnalysisRequest):
    """
    剧本叙事结构分析

    将剧本划分为 开端/发展/高潮/结局/尾声 等关键阶段。
    """
    entity_id = request.entity_id
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="剧本不存在")

    try:
        from services.prompts_opera import analyze_narrative_structure

        llm = _llm_svc.llm
        result = analyze_narrative_structure(llm, detail)
        return create_response(data=result)
    except Exception as e:
        print(f"❌ 叙事分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 分析失败: {str(e)}")


@router.post("/llm/extract-relations", response_model=dict, summary="关系提取")
async def extract_relations(request: OperaAnalysisRequest):
    """
    角色互动关系类型提取

    识别角色之间的互动关系（敌对/同盟/从属/亲属等）。
    """
    entity_id = request.entity_id
    detail = search_service.get_play_detail(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="剧本不存在")

    try:
        from services.prompts_opera import extract_character_relations

        llm = _llm_svc.llm
        result = extract_character_relations(llm, detail)
        return create_response(data=result)
    except Exception as e:
        print(f"❌ 关系提取失败: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 分析失败: {str(e)}")
