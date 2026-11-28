#!/usr/bin/env python3
"""商店初始化守卫自检：回环对端**不是**身份凭据。

## 为什么需要它

首次初始化会创建**第一个管理员**，是整台商店权限的起点。守卫原先的放行条件是
「TCP 对端是回环 + ``Host`` 是 localhost + 没有任何转发头」——但这条判据只能证明
「上一跳在本机」，四层转发（SSH ``-L`` / ``socat`` / 只转发的 sidecar）同样满足，
而转发方还能把 ``Host`` 改写成 ``localhost``。于是任何能碰到这类入口的远程攻击者
都能在实例初始化前抢先创建管理员。

现在默认要求引导密钥；「本机免密钥」必须显式打开 ``STORE_ALLOW_LOCAL_SETUP``，
且状态接口的 ``localAccess`` 与实际放行口径同源（否则界面会提示「不用填」而 POST 要密钥）。

用法：
    node ops/lib/py.mjs ops/checks/run_selftests.py --module store_setup_guard_selftest
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from _selftest_support import ROOT, check, report

# 商店后端的包根是 `homeos-store/backend`（其内部一律 `from ..security.xxx`），
# 与主应用的 `homeos.backend.src` 是两套独立包，因此单独加路径、单独导入。
_STORE_BACKEND = ROOT / "homeos-store" / "backend"
if str(_STORE_BACKEND) not in sys.path:
    sys.path.insert(0, str(_STORE_BACKEND))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import Request
from src.security.setup_guard import SetupGuard, is_direct_local

TOKEN = "t" * 40


def make_request(
    *,
    peer: str = "127.0.0.1",
    host: str = "localhost",
    headers: dict[str, str] | None = None,
) -> Request:
    """构造一个只带必要字段的请求（守卫只读 client / headers）。"""
    raw_headers = [(b"host", host.encode())]
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode(), value.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/store/v1/setup/admin",
            "query_string": b"",
            "headers": raw_headers,
            "client": (peer, 45678),
            "scheme": "http",
            "server": ("localhost", 8802),
        }
    )


def with_guard(**kwargs):
    """临时目录里的守卫（不碰真实 data_dir）。"""
    directory = tempfile.mkdtemp(prefix="homeos-setup-guard-")
    guard = SetupGuard(Path(directory), TOKEN, **kwargs)
    guard.ensure_token()
    return guard


def test_loopback_is_not_a_credential() -> None:
    """默认配置下，本机直连也必须带密钥。"""
    guard = with_guard()
    request = make_request()
    check("回环直连被识别为 is_direct_local", is_direct_local(request) is True)
    check("默认不允许本机免密钥", guard.allow_local_setup is False)
    check("localAccess 为假（界面会要求填密钥）", guard.local_access(request) is False)
    check("无密钥的本机请求被拒绝", guard.has_setup_privilege(request) is False)
    check("带上正确密钥才放行", guard.has_setup_privilege(request, TOKEN) is True)
    check("X-Setup-Token 头同样有效", guard.has_setup_privilege(make_request(headers={"x-setup-token": TOKEN})) is True)
    check("错误的密钥被拒绝", guard.has_setup_privilege(request, "wrong-token") is False)


def test_explicit_opt_in_restores_local_convenience() -> None:
    guard = with_guard(allow_local_setup=True)
    request = make_request()
    check("显式开启后本机免密钥", guard.has_setup_privilege(request) is True)
    check("localAccess 同步为真", guard.local_access(request) is True)
    # 非回环对端即使在开关打开时也不能免密钥。
    remote = make_request(peer="203.0.113.7", host="shop.example.com")
    check("远程请求仍需密钥", guard.has_setup_privilege(remote) is False)
    check("远程请求 localAccess 为假", guard.local_access(remote) is False)


def test_forwarded_headers_disable_local_shortcut() -> None:
    """带转发头的请求即使对端是回环也不算「本机直连」。"""
    guard = with_guard(allow_local_setup=True)
    proxied = make_request(headers={"x-forwarded-for": "203.0.113.7"})
    check("带 X-Forwarded-For 不算本机直连", is_direct_local(proxied) is False)
    check("带转发头时不能免密钥", guard.has_setup_privilege(proxied) is False)


def test_non_loopback_host_header_is_not_local() -> None:
    request = make_request(host="shop.example.com", headers={})
    check("Host 不是回环时不算本机直连", is_direct_local(request) is False)


def main() -> int:
    test_loopback_is_not_a_credential()
    test_explicit_opt_in_restores_local_convenience()
    test_forwarded_headers_disable_local_shortcut()
    test_non_loopback_host_header_is_not_local()
    report("商店初始化守卫")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
