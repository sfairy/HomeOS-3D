"""请求级身份解析：页面放行、静态资源门禁、API 依赖共用同一套判据。
"""
from __future__ import annotations

from fastapi import Request

from ..config import Settings
from ..core.models import DisplayDevice
from ..security.access import (
    admin_token_from,
    check_admin_session,
    discard_expired_session,
    display_token_from,
    resolve_principal,
)
from ..security.display_access import active_display_device


def initialized(request: Request, settings: Settings) -> bool:
    """系统是否已完成管理员初始化。"""
    return request.app.state.admin_account.initialized


def signed_in(request: Request, settings: Settings) -> bool:
    """是否为已登录的有效管理员会话。
    """
    with request.app.state.database.session_factory() as database:
        session = check_admin_session(
            database,
            settings,
            admin_token_from(request.cookies, settings),
            account_user_id = request.app.state.admin_account.user_id,
        )
        discard_expired_session(database, session)
    return session.ok


def active_display(request: Request, settings: Settings) -> DisplayDevice | None:
    """从 Cookie 解析已配对且未过期的中控设备，并把对象 detachment 出会话。
    """
    token = display_token_from(request.cookies, settings)
    if not token:
        return None
    with request.app.state.database.session_factory() as database:
        device = active_display_device(database, settings, token)
        if device is None:
            return None
        database.expunge(device)
        return device


def resolve_request_principal(database, request: Request, settings: Settings):
    """在**给定会话**里解析请求主体，并顺手清掉过期的会话行。
    """
    resolution = resolve_principal(
        database,
        settings,
        admin_token = admin_token_from(request.cookies, settings),
        display_token = display_token_from(request.cookies, settings),
        account_user_id = request.app.state.admin_account.user_id,
    )
    discard_expired_session(database, resolution.admin)
    return resolution


def browser_authorized(request: Request, settings: Settings) -> bool:
    """页面级访问条件：管理员已登录，或是一台已配对且未过期的中控设备。
    """
    with request.app.state.database.session_factory() as database:
        return resolve_request_principal(database, request, settings).authenticated


def asset_denial_status(request: Request, settings: Settings) -> int | None:
    """静态资源的门禁：在**一个会话**里判完「主体是谁」与「授权允不允许读资源」。
    """
    with request.app.state.database.session_factory() as database:
        if not resolve_request_principal(database, request, settings).authenticated:
            return 401
        if not request.app.state.license_service.allows('assets', database = database):
            return 403
    return None
