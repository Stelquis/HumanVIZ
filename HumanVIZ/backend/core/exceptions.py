"""
异常处理模块
统一处理API异常，返回标准错误格式
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class APIException(HTTPException):
    """自定义API异常"""
    def __init__(self, code: int = 400, message: str = "操作失败", data: dict = None):
        self.code = code
        self.message = message
        self.data = data or {}
        super().__init__(status_code=200, detail={
            "code": code,
            "message": message,
            "data": self.data
        })


def create_response(code: int = 0, message: str = "success", data=None):
    """创建标准响应格式"""
    return {
        "code": code,
        "message": message,
        "data": data if data is not None else {}
    }


async def api_exception_handler(request: Request, exc: APIException):
    """全局异常处理器"""
    return JSONResponse(
        status_code=200,
        content=create_response(exc.code, exc.message, exc.data)
    )


async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP异常处理器"""
    return JSONResponse(
        status_code=200,
        content=create_response(exc.status_code, str(exc.detail))
    )


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器"""
    return JSONResponse(
        status_code=200,
        content=create_response(500, f"服务器内部错误: {str(exc)}")
    )
