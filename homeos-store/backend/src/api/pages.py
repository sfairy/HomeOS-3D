"""页面路由、静态资源挂载与商品图。
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import func, select

from ..core.deps import DbSession
from ..core.models import Account, ProductImage
from ..api import page_shell
from ..security.request_security import render_template

logger = logging.getLogger("src.pages")

router = APIRouter(tags=["pages"])


def _render_page(
    request: Request, template_text: str, session: DbSession, *, page: str
) -> HTMLResponse:
    """模板 → 响应：填 CSP nonce，再把场景片段与状态甲板填进各自的占位符。
    """
    setattr(request.state, page_shell.PAGE_STATE_ATTR, page)
    text = render_template(template_text, request)
    return HTMLResponse(
        page_shell.inject_scene(text, request, session = session),
        headers={"Cache-Control": "no-store"},
    )


def _render_store_page(request: Request, session: DbSession) -> HTMLResponse:
    templates: Path = request.app.state.settings.templates_dir
    template_path = templates / "store.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="商店页面模板缺失。",
        )
    template = template_path.read_text(encoding="utf-8")
    return _render_page(request, template, session, page = "store.html")


def _home(request: Request, session: DbSession) -> Response:
    # 首次部署无管理员时，首页跳 /admin，再由 /admin 跳 /setup。
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    if (admin_count or 0) == 0:
        return RedirectResponse(url="/admin", status_code=302)
    return _render_store_page(request, session)


router.add_api_route("/", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/products", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/item/{product_id}", _home, methods=["GET"], include_in_schema=False)
router.add_api_route(
    "/user/authentication/login", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/authentication/register", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/authentication/forget", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/dashboard/index", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route("/user/index/query", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/user/referrals", _home, methods=["GET"], include_in_schema=False)


@router.get("/admin", include_in_schema=False)
def admin_page(request: Request, session: DbSession) -> Response:
    # 无管理员时跳初始化页：部署者直接访问 /admin 不会看到一个用不了的登录表单。
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    if (admin_count or 0) == 0:
        return RedirectResponse(url="/setup", status_code=302)
    template_path: Path = request.app.state.settings.templates_dir / "admin.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="管理后台模板缺失。"
        )
    return _render_page(
        request, template_path.read_text(encoding="utf-8"), session, page = "admin.html"
    )


@router.get("/setup", include_in_schema=False)
def setup_page(request: Request, session: DbSession) -> HTMLResponse:
    template_path: Path = request.app.state.settings.templates_dir / "setup.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="初始化页面模板缺失。"
        )
    return _render_page(
        request, template_path.read_text(encoding="utf-8"), session, page = "setup.html"
    )


# 商品图
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
