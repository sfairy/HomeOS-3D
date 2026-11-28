#!/usr/bin/env python3
"""媒体票据作用域自检：票据只能是「媒体通道」的短凭据，不能变成全 API 的 Bearer。

## 为什么需要它

``?ticket=`` 是为 ``<img>`` / MJPEG / SSE 无法携带自定义头而设的通道。票据解析出来的
是**原始会话令牌**：如果它在任意受保护路由上都被接受，那么一次 URL 泄露（反代日志、
截图、粘贴链接）就在票据有效期内等于交出了管理员会话，还能顺带续期成 30 天 Cookie。
``authenticate_session`` 现在只对媒体路径认票据、且不回写 Cookie —— 本自检钉住这条边界。
"""

from __future__ import annotations

import time

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.platform.security.media_ticket import (
    MEDIA_TICKET_PATH_PREFIXES,
    clear_tickets,
    issue_ticket,
    resolve_ticket,
    ticket_path_allowed,
)

MEDIA_PATHS = (
    "/api/camera_proxy/camera.front/0",
    "/api/camera_proxy_stream/camera.front/0",
    "/api/image_proxy/image.avatar",
    "/api/media_player_proxy/media_player.living",
    "/api/hls/abc/index.m3u8",
    "/api/camera_hls/camera.front",
)

NON_MEDIA_PATHS = (
    "/api/v1/entities",
    "/api/v1/entities/batch/area",
    "/api/v1/ha/services/call",
    "/api/v1/security-panel/disarm",
    "/api/v1/backups/restore",
    "/api/v1/auth/me",
    "/api/v1/mcp",
    "/",
)


def test_media_paths_allowed() -> None:
    for path in MEDIA_PATHS:
        check(f"媒体路径可用票据：{path}", ticket_path_allowed(path) is True)


def test_non_media_paths_rejected() -> None:
    for path in NON_MEDIA_PATHS:
        check(f"非媒体路径拒绝票据：{path}", ticket_path_allowed(path) is False)


def test_prefixes_never_widen_to_api_v1() -> None:
    """前缀表里不允许出现业务前缀：``/api/v1/`` 一旦进来就等于全 API 放行。"""
    for prefix in MEDIA_TICKET_PATH_PREFIXES:
        check(f"前缀不是业务前缀：{prefix}", not prefix.startswith("/api/v1/"), prefix)


def test_issue_and_resolve() -> None:
    clear_tickets()
    ticket = issue_ticket("session-token")
    check("票据能解析回会话令牌", resolve_ticket(ticket) == "session-token")
    check("未知票据返回 None", resolve_ticket("nope") is None)
    check("空票据返回 None", resolve_ticket("") is None)
    clear_tickets()


def test_expired_ticket_rejected() -> None:
    clear_tickets()
    ticket = issue_ticket("session-token", ttl=1)
    time.sleep(1.05)
    check("过期票据返回 None", resolve_ticket(ticket) is None)
    clear_tickets()


def main() -> int:
    test_media_paths_allowed()
    test_non_media_paths_rejected()
    test_prefixes_never_widen_to_api_v1()
    test_issue_and_resolve()
    test_expired_ticket_rejected()
    report("媒体票据作用域")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
