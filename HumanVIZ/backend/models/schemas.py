"""
Pydantic数据模型
定义API请求和响应的数据结构
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ==================== 基础响应模型 ====================

class ResponseModel(BaseModel):
    """标准响应格式"""
    code: int = Field(0, description="状态码，0表示成功")
    message: str = Field("success", description="状态信息")
    data: Dict[str, Any] = Field(default_factory=dict, description="响应数据")


# ==================== LLM相关模型 ====================

class ColorRequest(BaseModel):
    """颜色分配请求"""
    data: List[Dict[str, Any]] = Field(..., description="角色或主题数据")
    color_desc: str = Field(..., description="颜色描述/属性名")
    palette_info: Optional[str] = Field(None, description="调色板信息")
    story_type: str = Field("character", description="故事类型: character 或 theme")


class ColorResponse(BaseModel):
    """颜色分配响应"""
    char_attrs: List[Dict[str, Any]] = Field(..., description="角色属性列表")
    color_assignments: List[Dict[str, str]] = Field(..., description="颜色分配列表")


class YAxisRequest(BaseModel):
    """Y轴数据请求"""
    data: List[Dict[str, Any]] = Field(..., description="场景数据")
    yaxis_desc: str = Field(..., description="Y轴描述")
    story_type: str = Field("character", description="故事类型")


class YAxisResponse(BaseModel):
    """Y轴数据响应"""
    new_data: List[Dict[str, Any]] = Field(..., description="添加了Y轴数据的新数据")


class QuestionRequest(BaseModel):
    """问答请求"""
    question: str = Field(..., description="问题内容")
    data: Any = Field(..., description="相关数据")


class QuestionResponse(BaseModel):
    """问答响应"""
    answer: str = Field(..., description="答案")


class ChapterRequest(BaseModel):
    """章节查找请求"""
    question: str = Field(..., description="问题内容")
    data: List[Dict[str, Any]] = Field(..., description="章节数据")


class ChapterResponse(BaseModel):
    """章节查找响应"""
    chapter: str = Field(..., description="章节名称")
    explanation: str = Field(..., description="解释说明")


# ==================== 数据管理模型 ====================

class DatasetInfo(BaseModel):
    """数据集信息"""
    id: str = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    record_count: int = Field(..., description="记录数量")
    created_at: str = Field(..., description="创建时间")
    description: Optional[str] = Field(None, description="描述")


class DatasetListResponse(BaseModel):
    """数据集列表响应"""
    datasets: List[DatasetInfo] = Field(..., description="数据集列表")
    total: int = Field(..., description="总数")


# ==================== 系统状态模型 ====================

class SystemStatus(BaseModel):
    """系统状态"""
    status: str = Field("ok", description="状态")
    version: str = Field(..., description="版本号")
    llm_provider: str = Field(..., description="LLM提供商")
    llm_model: str = Field(..., description="LLM模型")
