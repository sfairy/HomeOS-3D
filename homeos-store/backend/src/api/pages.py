"""SPA 外壳与商品图：所有页面路径最终都返回同一份 index.html。

服务端只负责「填站点配色 + 交出一份外壳」。
商品图仍是文件响应。
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import func, select

from ..api import page_shell
from ..core.deps import CurrentAccount, DbSession
from ..core.models import Account, ProductImage
from ..security.request_security import render_template

logger = logging.getLogger("src.pages")

router = APIRouter(tags=["pages"])

SHELL_TEMPLATE_NAME = "index.html"

#: 这些前缀由 API / 静态挂载处理，catch-all 绝不接管（漏下来一律 404）。
RESERVED_PREFIXES = (
    "/store/v1",
    "/store-admin/v1",
    "/v2",
    "/store-static",
    "/fonts",
    "/healthz",
    "/store-appearance.css",
    "/api",
)


def _shell_text(request: Request, account: Account | None = None) -> str:
    templates: Path = request.app.state.settings.templates_dir
    template_path = templates / SHELL_TEMPLATE_NAME
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SPA 模板缺失。",
        )
    text = render_template(template_path.read_text(encoding="utf-8"), request)
    text = page_shell.inject_auth_state(text, account)
    return page_shell.inject_scene(text, request)


def _render_shell(request: Request, page: str, account: Account | None = None) -> HTMLResponse:
    setattr(request.state, page_shell.PAGE_STATE_ATTR, page)
    return HTMLResponse(
        _shell_text(request, account), headers={"Cache-Control": "no-store"}
    )


def _admin_count(session: DbSession) -> int:
    return int(
        session.scalar(select(func.count()).select_from(Account).where(Account.is_admin == True))
        or 0
    )


@router.get("/", include_in_schema=False)
def home(request: Request, session: DbSession, account: CurrentAccount) -> Response:
    if _admin_count(session) == 0:
        return RedirectResponse(url="/admin", status_code=302)
    return _render_shell(request, "store", account)


@router.get("/setup", include_in_schema=False)
def setup_page(request: Request, account: CurrentAccount) -> HTMLResponse:
    return _render_shell(request, "setup", account)


@router.get("/admin", include_in_schema=False)
def admin_page(request: Request, session: DbSession, account: CurrentAccount) -> Response:
    if _admin_count(session) == 0:
        return RedirectResponse(url="/setup", status_code=302)
    return _render_shell(request, "admin", account)


@router.get("/store/v1/product-images/{product_id}", include_in_schema=False)
def product_image(product_id: str, request: Request, session: DbSession) -> FileResponse:
    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product_id)
    ).first()
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    folder: Path = request.app.state.settings.product_images_dir
    root = folder.resolve()
    target = (root / image.path).resolve()
    if target == root or root not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(
    full_path: str, request: Request, session: DbSession, account: CurrentAccount
) -> Response:
    """SPA catch-all：非预留前缀的 GET 一律交回外壳，由 vue-router 决定页面。

    预留前缀（API / 静态 / 授权）漏到这里说明是未知子路径，按 JSON 404 回答，
    不能返回 HTML —— 否则客户端会把一段标记当成接口响应解析。
    """
    path = "/" + full_path
    if path.startswith(RESERVED_PREFIXES):
        return JSONResponse({"detail": "未找到。"}, status_code=404)
    if not path.startswith("/"):
        path = "/" + path
    page = "admin" if path.startswith("/admin") else "store"
    return _render_shell(request, page, account)
