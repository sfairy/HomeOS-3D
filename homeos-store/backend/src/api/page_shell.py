"""商店页面外壳：把站点配色样式表填进 SPA 模板的 ``<!--{{APPEARANCE}}-->``。

本模块只剩「外壳」这一件事。
"""

from __future__ import annotations

from fastapi import Request

APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

APPEARANCE_PATH = '/store-appearance.css'

PAGE_STATE_ATTR = 'store_shell_page'

#: 外壳上写登录态用的属性。渲染这一页时服务端已经解过会话，直接把结论交给前端，
#: 前端挂载时就不必再打一发注定 401 的 ``/store/v1/auth/me`` 探针。
AUTH_STATE_ATTR = 'data-auth'

HTML_OPEN_TAG = '<html lang="zh-CN">'


def inject_auth_state(text: str, account) -> str:
    """把服务端已知的登录态写成 ``<html ... data-auth="guest|user|admin">``。

    ``account`` 是 ``core.deps.current_account`` 的结果（游客为 ``None``）。模板里
    找不到 ``<html>`` 开标签时原样返回：前端读到空属性会退回「按 cookie 提示决定
    要不要探针」的旧行为，页面照样能开，只是多一发请求。
    """
    if HTML_OPEN_TAG not in text:
        return text
    if account is None:
        state = 'guest'
    else:
        state = 'admin' if getattr(account, 'is_admin', False) else 'user'
    return text.replace(
        HTML_OPEN_TAG,
        f'<html lang="zh-CN" {AUTH_STATE_ATTR}="{state}">',
        1,
    )


def inject_scene(text: str, request: Request, *, session=None) -> str:
    """把 ``text`` 里的配色插入点换成实际的 ``<link>``。

    样式表是稳定 URL：不再带 ``?v=`` 版本戳，改由响应的 ``no-cache`` + ``ETag`` 回源校验。
    """
    del session, request
    if APPEARANCE_PLACEHOLDER not in text:
        raise RuntimeError(
            '模板缺少 ' + APPEARANCE_PLACEHOLDER + ' 占位符，页面不会跟随站点配色'
        )
    return text.replace(
        APPEARANCE_PLACEHOLDER,
        f'<link rel="stylesheet" href="{APPEARANCE_PATH}">',
    )


def page_of(request: Request) -> str:
    """这一响应渲染的页面名；没登记时回空串。"""
    return getattr(request.state, PAGE_STATE_ATTR, '')
