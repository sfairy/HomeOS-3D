"""请求级身份解析：页面放行、静态资源门禁、API 依赖共用同一套判据。

从 main.py 的 create_app 里抽出来的三件事，它们原本是闭包：

1. 页面路由要的是「未登录就跳转」——只返回布尔；
2. 静态资源门禁要多判一步能力码（assets），因此返回应当回给客户端的状态码；
3. 两者必须**同源**：各自写一遍「管理员或中控设备」的判据，迟早有一边漏掉其中一条分支，
   而漏掉的那一侧就是越权。

改成模块级函数（显式收 settings）之后，这三件事可以被单独测，页面层与中间件层也都能用，
不再需要把闭包从 create_app 传出去。

每个函数都自己开一个 ``session_factory()`` 会话：数据库访问是同步的，调用方负责用
``asyncio.to_thread`` 把它丢进线程池（否则会阻塞事件循环）。
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

    必须与 API 侧共用 ``access.check_admin_session``：独立实现容易漏掉绝对寿命判定，而滑动
    有效期能被续期一直往后推 —— 被盗 Cookie 只要还在用就能一直打开页面、取静态资源。页面
    路由要的是「未登录就跳转」而非 401，所以这里只返回布尔值；副作用与 API 侧一致，顺手清掉
    命中的过期会话行。
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

    expunge 是为了让调用方拿到游离对象后连接即可归还连接池。
    令牌有效期必须由 ``active_display_device`` 判定：只查「配没配过」的话，
    展示页就绕过了 display_token_ttl / hard_ttl。
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

    单独成一个函数是因为它有两个消费点：页面级判定（只要布尔）与静态资源的两道门禁
    （还要接着判能力码）。两处同源，才不会有一边漏掉其中一条分支。
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

    两种身份必须由同一个解析入口给出：分别写成
    ``signed_in(...) or active_display(...) is not None`` 的话，一次请求要开两个数据库会话，
    而两边的判据又各自不完整。
    """
    with request.app.state.database.session_factory() as database:
        return resolve_request_principal(database, request, settings).authenticated


def asset_denial_status(request: Request, settings: Settings) -> int | None:
    """静态资源的门禁：在**一个会话**里判完「主体是谁」与「授权允不允许读资源」。

    原先这里是两次 ``asyncio.to_thread``，每次都自己开一个 ``session_factory()`` —— 一个静态
    资源请求要开两个数据库会话。而 ``LicenseService.allows`` 本来就接受外部会话（它的
    ``database`` 参数就是为此准备的），合并没有任何语义变化，只是少一次线程跳转与一次建连。
    编辑器一次冷启动要拉 150+ 个受保护资源，这个差值会被乘以 150。

    返回 None 表示放行；否则是应当回给客户端的状态码（401 未登录/未配对，403 授权不允许）。
    """
    with request.app.state.database.session_factory() as database:
        if not resolve_request_principal(database, request, settings).authenticated:
            return 401
        if not request.app.state.license_service.allows('assets', database = database):
            return 403
    return None
