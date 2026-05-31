"""
API依赖模块
定义路由依赖项，如认证、数据库连接等
"""

from typing import Generator

# 当前项目暂不需要复杂的依赖注入
# 这里预留位置，后续可以添加：
# - 数据库会话
# - 用户认证
# - 权限检查
# - 请求日志等


def get_llm():
    """获取LLM服务实例"""
    from services.llm_service import llm_service
    return llm_service


def get_data_service():
    """获取数据服务实例"""
    from services.data_service import data_service
    return data_service
