"""
配置管理模块
集中管理所有配置项，支持环境变量覆盖
"""

import json
import os
from pathlib import Path
from typing import Optional


class Settings:
    """应用配置类"""
    
    # 项目路径
    BASE_DIR = Path(__file__).resolve().parent.parent
    
    # API配置
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "HumanVIZ Backend"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "人文数据可视化后端服务"
    
    # CORS配置
    CORS_ORIGINS: list = [
        "http://localhost:5200",
        "http://127.0.0.1:5200",
    ]
    
    # 服务器配置
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "5000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
    
    # LLM配置（从secrets.json加载）
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_BASE_URL: Optional[str] = None
    LLM_PROVIDER: str = "openai"
    
    @classmethod
    def load_secrets(cls):
        """从secrets.json加载配置"""
        secrets_path = cls.BASE_DIR.parent / "secrets.json"
        try:
            with open(secrets_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            cls.LLM_API_KEY = config.get("api_key")
            cls.LLM_MODEL = config.get("model", cls.LLM_MODEL)
            cls.LLM_BASE_URL = config.get("base_url")
            cls.LLM_PROVIDER = config.get("provider", cls.LLM_PROVIDER)
            print(f"✅ 配置加载成功: {cls.LLM_PROVIDER} ({cls.LLM_MODEL})")
        except FileNotFoundError:
            print(f"⚠️ 配置文件未找到: {secrets_path}")
            print("请确保 secrets.json 文件存在")
        except Exception as e:
            print(f"⚠️ 加载配置失败: {e}")


# 全局配置实例
settings = Settings()
settings.load_secrets()
