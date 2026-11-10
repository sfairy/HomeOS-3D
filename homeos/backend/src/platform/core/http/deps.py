"""FastAPI 依赖注入：Settings 与（Phase 2 起的）鉴权依赖。

对应 Nest 的 DI 容器 + ``APP_GUARD`` 链：这里以 ``Depends`` 函数表达，
业务路由按需声明 ``Depends(require_user)``（单一管理员模型，无角色守卫）。
"""

from __future__ import annotations

from fastapi import Request

from ....config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings

