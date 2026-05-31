"""
LLM服务模块
封装所有与LLM相关的业务逻辑
"""

import os
import sys
import json
from typing import Any, Dict, List, Optional, Tuple
from langchain_openai import ChatOpenAI

from core.config import settings


class LLMService:
    """LLM服务类"""
    
    _instance = None
    _llm = None
    
    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @property
    def llm(self) -> ChatOpenAI:
        """获取LLM实例（懒加载）"""
        if self._llm is None:
            self._llm = self._load_model()
        return self._llm
    
    def _load_model(self) -> ChatOpenAI:
        """加载LLM模型"""
        if not settings.LLM_API_KEY:
            raise ValueError("LLM API Key 未配置，请检查 secrets.json")
        
        os.environ["OPENAI_API_KEY"] = settings.LLM_API_KEY
        
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            temperature=0.1,
            base_url=settings.LLM_BASE_URL
        )
        
        print(f"✅ LLM模型加载成功: {settings.LLM_PROVIDER} ({settings.LLM_MODEL})")
        return llm
    
    def get_model_info(self) -> Dict[str, str]:
        """获取模型信息"""
        return {
            "provider": settings.LLM_PROVIDER,
            "model": settings.LLM_MODEL,
            "base_url": settings.LLM_BASE_URL or "https://api.openai.com/v1"
        }


# 全局LLM服务实例
llm_service = LLMService()


# ==================== 导入原有的prompts功能 ====================

# prompts 和 helpers 已整合到当前目录
sys.path.insert(0, str(settings.BASE_DIR))

try:
    from services.prompts import (
        assign_character_attributes,
        add_yaxis_data,
        ask_question,
        find_chapter
    )
    
    def get_llm():
        """获取LLM实例供原有函数使用"""
        return llm_service.llm
        
except ImportError as e:
    print(f"⚠️ 无法导入原有prompts模块: {e}")
    # 如果导入失败，提供空实现
    def assign_character_attributes(*args, **kwargs):
        raise NotImplementedError("LLM功能暂不可用")
    
    def add_yaxis_data(*args, **kwargs):
        raise NotImplementedError("LLM功能暂不可用")
    
    def ask_question(*args, **kwargs):
        raise NotImplementedError("LLM功能暂不可用")
    
    def find_chapter(*args, **kwargs):
        raise NotImplementedError("LLM功能暂不可用")
