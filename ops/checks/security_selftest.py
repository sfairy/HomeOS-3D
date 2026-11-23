#!/usr/bin/env python3
"""来源与豁免自检：钉住 CORS / 同源写 / CSRF 的判定口径（不需要 pytest）。

背景（审计 P8 / S-02）
----------------------
CSRF 用的是双提交 Cookie，而 Cookie **不按端口隔离**：同一台主机上另一个端口
（商店 :8802、MoviePilot、go2rtc、NAS 上的其它应用）的页面能读到 ``csrf_token``，
伪造一对 Cookie/Header 就能通过双提交校验。而 CORS 原先在白名单为空时还会放行
任意私网来源并回写 ``Allow-Credentials: true``，等于把响应也交给对方读。

本自检钉住：

- ``is_origin_allowed`` 只认显式白名单，不再有「私网兜底」；
- ``browser_origin_allowed`` 对 ``Sec-Fetch-Site: cross-site`` / 外部 Origin 一律拒绝；
- 同主机（含反代摘掉端口）仍然放行 —— 不能为了收紧把正常访问挡掉；
- WebSocket 必须带来源头（脚本可以不带，浏览器 WS 一定带）；
- CSRF 豁免表仍然只覆盖那几条预认证 / 回调路径。

用法：
    node ops/lib/py.mjs ops/checks/security_selftest.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.platform.security.cookies import is_origin_allowed
from homeos.backend.src.platform.security.csrf import is_csrf_exempt_path, validate_csrf
from homeos.backend.src.platform.security.request_origin import browser_origin_allowed

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


def fake_request(
    headers: dict[str, str],
    *,
    host: str = "home.example.com",
    scheme: str = "https",
    path: str = "/",
    allowed_origins: tuple[str, ...] = (),
    app_base_url: str = "",
):
    """构造只满足 ``browser_origin_allowed`` 所需字段的 Request 替身。"""
    settings = SimpleNamespace(
        allowed_origins=allowed_origins,
        additional_public_origins=(),
        app_base_url=app_base_url,
    )
    app = SimpleNamespace(state=SimpleNamespace(settings=settings))
    merged = {"host": host, **headers}
    return SimpleNamespace(
        headers=merged,
        url=SimpleNamespace(scheme=scheme, path=path),
        app=app,
    )


def test_cors_whitelist_only() -> None:
    check("空白名单不再放行局域网来源", not is_origin_allowed("http://192.168.1.9:3000", []))
    check("空白名单不放行 localhost", not is_origin_allowed("http://localhost:3000", []))
    check(
        "显式白名单命中",
        is_origin_allowed("https://home.example.com", ["https://home.example.com"]),
    )
    check("显式白名单外拒绝", not is_origin_allowed("https://evil.example.com", ["https://home.example.com"]))
    check("空 origin 直接拒绝", not is_origin_allowed("", ["https://home.example.com"]))


def test_origin_guard() -> None:
    # 同主机：放行（不能把正常页面挡掉）
    check(
        "同主机同源放行",
        browser_origin_allowed(fake_request({"origin": "https://home.example.com", "sec-fetch-site": "same-origin"})),
    )
    # 反代摘端口：Origin 带端口、Host 不带，仍应放行
    check(
        "反代摘掉端口仍放行",
        browser_origin_allowed(
            fake_request({"origin": "https://home.example.com:8443", "sec-fetch-site": "same-origin"})
        ),
    )
    # 跨站：浏览器自己算的 Sec-Fetch-Site，最硬的一条
    check(
        "cross-site 直接拒绝",
        not browser_origin_allowed(
            fake_request({"origin": "https://evil.example.com", "sec-fetch-site": "cross-site"})
        ),
    )
    # 同主机不同端口：同站但非同源，Sec-Fetch-Site 会说 same-site
    check(
        "同站不同端口（same-site）拒绝",
        not browser_origin_allowed(
            fake_request({"origin": "http://home.example.com:8802", "sec-fetch-site": "same-site"})
        ),
    )
    # 没有来源头的脚本客户端：HTTP 写操作放行（CSRF 另有双提交兜底）
    check("脚本写请求放行", browser_origin_allowed(fake_request({})))
    # WebSocket 必须带来源
    check("WS 无来源头拒绝", not browser_origin_allowed(fake_request({}), websocket=True))
    check(
        "WS 同源放行",
        browser_origin_allowed(
            fake_request({"origin": "https://home.example.com", "sec-fetch-site": "same-origin"}),
            websocket=True,
        ),
    )
    # 匿名上报：只带 same-origin 标记也够（sendBeacon 可能省掉 Origin）
    check(
        "匿名上报 same-origin 标记放行",
        browser_origin_allowed(fake_request({"sec-fetch-site": "same-origin"}), public_report=True),
    )
    check(
        "匿名上报无任何证据拒绝",
        not browser_origin_allowed(fake_request({}), public_report=True),
    )


def test_csrf_exemptions() -> None:
    check("登录豁免", is_csrf_exempt_path("/api/v1/auth/login"))
    check("licence 激活豁免", is_csrf_exempt_path("/api/v1/license/activate"))
    check("企微回调豁免", is_csrf_exempt_path("/api/v1/channels/wecom/callback"))
    check("MCP 网关豁免", is_csrf_exempt_path("/api/v1/mcp"))
    check("普通写接口不豁免", not is_csrf_exempt_path("/api/v1/services/call"))
    check("设置写入不豁免", not is_csrf_exempt_path("/api/v1/system/config"))
    # 不带令牌的业务写请求必须失败
    check(
        "缺令牌的写请求被拒",
        not validate_csrf("POST", "/api/v1/services/call", None, None),
    )
    check(
        "令牌不一致被拒",
        not validate_csrf("POST", "/api/v1/services/call", "a" * 32, "b" * 32),
    )
    check(
        "令牌一致放行",
        validate_csrf("POST", "/api/v1/services/call", "a" * 32, "a" * 32),
    )


def test_license_grace_paths() -> None:
    """租约过期宽限：设备控制与实时通道放行，编辑类能力仍然拦。"""
    from homeos.backend.src.domains.license.guard import (
        LICENSE_EXPIRED_GRACE_WS_PREFIXES,
        is_expired_grace_path,
    )

    check("宽限: 实体列表放行", is_expired_grace_path("/api/v1/entities"))
    check("宽限: 设备控制放行", is_expired_grace_path("/api/v1/services/call"))
    check("宽限: 3D 控制放行", is_expired_grace_path("/api/v1/modules/interaction3d/control"))
    check("宽限: 系统配置仍拦截", not is_expired_grace_path("/api/v1/system/config"))
    check("宽限: 账号管理仍拦截", not is_expired_grace_path("/api/v1/auth/password/change"))
    check("宽限: 备份管理仍拦截", not is_expired_grace_path("/api/v1/backups"))
    check("宽限: 授权接口按原豁免走", is_expired_grace_path("/api/v1/license/activate"))
    check(
        "宽限: 实时 WS 放行",
        any("/api/v1/ws/runtime".startswith(prefix) for prefix in LICENSE_EXPIRED_GRACE_WS_PREFIXES),
    )
    check(
        "宽限: 设置类 WS 不放行",
        not any("/api/v1/system/ws".startswith(prefix) for prefix in LICENSE_EXPIRED_GRACE_WS_PREFIXES),
    )


def main() -> int:
    test_cors_whitelist_only()
    test_origin_guard()
    test_csrf_exemptions()
    test_license_grace_paths()
    print(f"来源与豁免自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
