"""FastAPI 路由基类：POST 默认返回 201 Created。

GET / PUT / PATCH / DELETE / HEAD / OPTIONS 默认 200 OK。FastAPI 默认所有方法均为 200，
故统一使用 ``NestRouter``：路由包含 POST 且未显式指定 ``status_code`` 时注入 201；
显式传入的 ``status_code``（如登录类端点 200、创建类端点 201）始终保持不变。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

#: Nest ``@Post()`` 的默认状态码
NEST_POST_DEFAULT_STATUS = 201


class NestRouter(APIRouter):
    """把 POST 默认状态码对齐为 Nest ``201`` 的 ``APIRouter``。

    仅覆写 ``add_api_route``，不改变路由匹配、依赖注入与响应模型行为。
    """

    def add_api_route(self, path: str, endpoint: Any, **kwargs: Any) -> None:
        if kwargs.get("status_code") is None:
            methods = [str(method).upper() for method in (kwargs.get("methods") or ["GET"])]
            if "POST" in methods:
                kwargs["status_code"] = NEST_POST_DEFAULT_STATUS
        super().add_api_route(path, endpoint, **kwargs)


__all__ = ["NEST_POST_DEFAULT_STATUS", "NestRouter"]
