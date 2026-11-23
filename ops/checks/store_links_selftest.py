#!/usr/bin/env python3
"""商店入口自检：注册 / 激活 / 商店链接不得落到内网地址。

前因：注册页会自动打开商店购买页，激活页有「去商店购买 / 账号中心」，登录页有「商店 /
忘记密码」—— 三处都读 ``/api/v1/public/config``，取值全在 ``domains/store/discovery.py``。
曾经的优先级是「同机 + 浏览器在用 IP → 拼 ``<同一 IP>:8802``」，先于商店声明的
``STORE_BASE_URL``；于是从局域网 IP 打开主应用时，这些入口全变成内网地址，而默认
compose 的商店端口只绑回环，那个地址根本打不开。

本自检钉住现行口径：

- 商店显式声明 ``STORE_BASE_URL``（``declared=true``）时**原样采信**，局域网 / 回环访问
  也一样 —— 这就是「注册 / 激活 / 商店一律走公网」的配置方式；
- 只有商店**没声明**时，才允许「同机 + IP 访问 → ``<同一 IP>:8802``」这条离线推断；
- 公网域名访问且商店没声明入口时回空串（前端隐藏入口），绝不拼一个 404 链接；
- 显式 ``APP_STORE_URL`` 永远优先，且不产生任何发现请求。
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.store.discovery import (
    StoreAnswer,
    StoreBaseUrlResolver,
    resolve_browser_store_url,
    same_machine_store,
)

DECLARED = "https://homelifepay.iepose.cn"
LAN_ORIGIN = "http://192.168.31.175:8801"
PUBLIC_ORIGIN = "https://homelife.iepose.cn"
LOOPBACK_ORIGIN = "http://127.0.0.1:8801"
SAME_MACHINE = "http://homeos-store:8802"
REMOTE = "https://homelifepay.iepose.cn"


def _settings(*, license_server_url: str = SAME_MACHINE, store_url: str = "") -> SimpleNamespace:
    return SimpleNamespace(license_server_url=license_server_url, store_url=store_url)


class CannedResolver(StoreBaseUrlResolver):
    """``_discover`` 返回固定答案的解析器（不联网）。"""

    def __init__(self, settings: SimpleNamespace, answer: StoreAnswer) -> None:
        super().__init__(settings)
        self._canned = answer

    async def _discover(self) -> StoreAnswer:  # type: ignore[override]
        return self._canned


def test_declared_wins_over_same_machine_inference() -> None:
    answer = StoreAnswer(DECLARED, True)
    check(
        "声明优先: 局域网 IP 访问也拿公网商店地址",
        resolve_browser_store_url(answer, LAN_ORIGIN, same_machine=True) == DECLARED,
    )
    check(
        "声明优先: 回环访问也拿公网商店地址",
        resolve_browser_store_url(answer, LOOPBACK_ORIGIN, same_machine=True) == DECLARED,
    )
    check(
        "声明优先: 公网域名访问拿公网商店地址",
        resolve_browser_store_url(answer, PUBLIC_ORIGIN, same_machine=True) == DECLARED,
    )


def test_undeclared_keeps_lan_fallback() -> None:
    # 商店没声明 STORE_BASE_URL：回显的是「调用方怎么连上我的」，即容器服务名。
    echo = StoreAnswer("http://homeos-store:8802", False)
    check(
        "未声明: 局域网 + 同机 → 同一 IP 的商店端口",
        resolve_browser_store_url(echo, LAN_ORIGIN, same_machine=True) == "http://192.168.31.175:8802",
    )
    check(
        "未声明: 回环 + 同机 → 回环商店端口",
        resolve_browser_store_url(echo, LOOPBACK_ORIGIN, same_machine=True) == "http://127.0.0.1:8802",
    )
    check(
        "未声明: 公网域名 + 同机 → 空串（隐藏入口，不拼 404）",
        resolve_browser_store_url(echo, PUBLIC_ORIGIN, same_machine=True) == "",
    )


def test_undeclared_remote_deployment() -> None:
    echo = StoreAnswer(REMOTE, False)
    check(
        "未声明: 分机部署回显公网域名 → 原样使用",
        resolve_browser_store_url(echo, PUBLIC_ORIGIN, same_machine=False) == REMOTE,
    )
    check(
        "未声明: 分机部署回显服务名 → 换成浏览器主机",
        resolve_browser_store_url(StoreAnswer("http://localhost:8802", False), LAN_ORIGIN, same_machine=False)
        == "http://192.168.31.175:8802",
    )


def test_resolver_prefers_declared_answer() -> None:
    check(
        "解析器: 同机部署识别正确",
        same_machine_store(_settings()) is True,
    )
    resolver = CannedResolver(_settings(), StoreAnswer(DECLARED, True))
    check(
        "解析器: 声明答案压过同机推断",
        asyncio.run(resolver.resolve_for_browser(LAN_ORIGIN)) == DECLARED,
    )

    fallback = CannedResolver(_settings(), StoreAnswer())
    check(
        "解析器: 商店不可达时局域网仍有兜底入口",
        asyncio.run(fallback.resolve_for_browser(LAN_ORIGIN)) == "http://192.168.31.175:8802",
    )


def test_explicit_store_url_wins() -> None:
    settings = _settings(store_url=DECLARED)
    resolver = CannedResolver(settings, StoreAnswer())
    check(
        "解析器: 显式 APP_STORE_URL 优先且不问商店",
        asyncio.run(resolver.resolve_for_browser(LAN_ORIGIN)) == DECLARED,
    )


def main() -> int:
    test_declared_wins_over_same_machine_inference()
    test_undeclared_keeps_lan_fallback()
    test_undeclared_remote_deployment()
    test_resolver_prefers_declared_answer()
    test_explicit_store_url_wins()
    report("商店入口")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
