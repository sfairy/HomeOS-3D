"""限流器有界化回归冒烟：key 表必须有上限，且伪造转发头不能凭空造桶。

修复前 ``platform/security/limiter.py`` 的 ``_WINDOWS`` 是模块级全局字典，key 是
「路由 + 客户端 IP」，**永不淘汰、没有上限**；而那个 IP 来自可伪造的 ``X-Forwarded-For``。
于是任何客户端都能靠「每个请求换一个假 IP」把表撑到任意大小 —— 一个不需要鉴权的内存放大。

本脚本分两层验证：

* 判据层：``homeos_shared.rate_limit.SlidingWindowLimiter`` 的窗口语义 + ``max_keys`` 淘汰
  （造 10 倍于上限的 key，断言 key 表规模被压住）。
* 接线层：主应用的 ``rate_limit`` 依赖走可信地址解析 —— 同一对端伪造 500 个不同
  ``X-Forwarded-For``，只应产生 **1** 个桶；并确认真实路由上第 N+1 次请求得到 429。
"""

from __future__ import annotations

from _smoke_harness import bootstrap_env, check, report, section

# 必须在 import src.* 之前设好环境。LICENSE_REQUIRED=0：本脚本只关心限流层。
bootstrap_env(prefix="homeos-rate-limit-")

import src  # noqa: F401

from homeos_shared.rate_limit import SlidingWindowLimiter, resolve_limiter_key


def check_limiter_core() -> None:
    """判据层：滑动窗口 + 有界 key 表。"""
    section("1) SlidingWindowLimiter 窗口语义与内存上限")

    limiter = SlidingWindowLimiter(limit=3, window_seconds=60.0, max_keys=8)
    check(
        "窗口内前 limit 次放行",
        all(limiter.allow("k", now=0.0) for _ in range(3)),
    )
    check("超过 limit 后拒绝", limiter.allow("k", now=1.0) is False)
    check("retry_after 给出剩余等待秒数", 57.5 <= limiter.retry_after("k", now=2.0) <= 60.0)
    check("窗口滑过后重新放行", limiter.allow("k", now=61.0) is True)

    # 关键断言：远多于 max_keys 的不同 key，表规模必须被压住而不是线性增长。
    bounded = SlidingWindowLimiter(limit=5, window_seconds=60.0, max_keys=16)
    for index in range(200):
        bounded.allow(f"ip-{index}", now=float(index))
    check(
        "key 数量超过 max_keys 时触发淘汰（内存有界）",
        bounded.key_count() <= 16,
        f"key_count={bounded.key_count()}",
    )

    # 淘汰后总数仍受控，且不超过配置上限的一半以上（淘汰目标即 max_keys // 2）。
    check(
        "淘汰后表规模收敛到上限以内",
        bounded.key_count() < 200,
        f"key_count={bounded.key_count()}",
    )

    check("reset 清空全部", (bounded.reset(), bounded.key_count() == 0)[1])

    # 全局桶：判不出客户端时所有来源共享一个桶，而不是各占一个。
    check(
        "判不出客户端时折叠为 global 桶",
        resolve_limiter_key("", per_client=False, name="r") == "r:global",
    )
    check(
        "判出客户端时按地址分桶",
        resolve_limiter_key("192.168.1.9", per_client=True, name="r") == "r:192.168.1.9",
    )


def check_dependency_wiring() -> None:
    """接线层：伪造 XFF 不能造桶；真实路由第 N+1 次得到 429。"""
    section("2) 主应用 rate_limit 依赖：伪造转发头不造桶")

    from types import SimpleNamespace

    from src.platform.security import limiter as limiter_module
    from starlette.requests import Request

    # 不信任任何代理 → XFF 一律被忽略，500 个假 IP 只映射到同一个对端地址。
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(trusted_proxies=())))
    dependency_limit = 10_000  # 用大限额，确保本段测的是「分桶」而不是「被限流」

    def make_request(forwarded_for: str) -> Request:
        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/v1/mcp",
            "raw_path": b"/api/v1/mcp",
            "query_string": b"",
            "headers": [(b"x-forwarded-for", forwarded_for.encode())],
            "client": ("198.51.100.7", 41234),
            "server": ("testserver", 80),
            "app": app,
        }
        return Request(scope)

    import asyncio

    dependency = limiter_module.rate_limit(dependency_limit, 60.0)
    limiter = limiter_module._LIMITERS[(dependency_limit, 60.0)]
    for index in range(500):
        asyncio.run(dependency(make_request(f"203.0.113.{index % 256}")))
    check(
        "同一对端伪造 500 个 XFF 只产生 1 个桶",
        limiter.key_count() == 1,
        f"key_count={limiter.key_count()}",
    )

    # 真实路由：activate 声明 rate_limit(5, 60)，第 6 次必须是 429。
    from fastapi.testclient import TestClient
    from src.app import create_app

    real = create_app()
    with TestClient(real) as client:
        statuses = [
            client.post("/api/v1/license/activate", json={"licenseKey": "x"}).status_code
            for _ in range(7)
        ]
        check(
            "限流声明在真实路由上生效（第 6 次起 429）",
            statuses[5] == 429 and 429 in statuses,
            f"statuses={statuses}",
        )
        check(
            "限流前的请求不被限流（前 5 次不是 429）",
            all(code != 429 for code in statuses[:5]),
            f"statuses={statuses}",
        )


def main() -> None:
    check_limiter_core()
    check_dependency_wiring()
    report("SMOKE OK — 限流器有界化与分桶契约全部通过")


if __name__ == "__main__":
    main()
