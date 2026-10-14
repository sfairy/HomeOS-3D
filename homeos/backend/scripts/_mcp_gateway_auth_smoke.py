"""MCP 网关鉴权回归冒烟：伪造转发头不放行、生产缺白名单拒、IP 校验先于密钥校验。

修的是三个**静默失效**，三个都不会以「跑起来报错」的形式暴露：

1. ``api/mcp.py`` 的 ``_client_ip`` 直接取 ``X-Forwarded-For`` 第一个地址 ——
   任何客户端写一个请求头就能把自己伪装成白名单内的 IP。白名单于是等于没有。
2. ``mcp_service.assert_ip_allowed`` 用 ``NODE_ENV == "production"`` 判生产，而 ``NODE_ENV``
   在 ``Dockerfile`` / compose / ``.env.example`` 里**从未设置** —— 于是容器里那句
   「生产必须配白名单，否则拒绝」永远不会触发，未配置白名单时静默放行全部来源。
3. 因此「未配白名单」这个最危险的状态，在发行部署里既没有日志、也没有断言。

本脚本逐条把这三件事变成断言：判据层（共享纯函数）、服务层（白名单语义）、
路由层（伪造 XFF 走真实 HTTP 栈仍被拦下，且拦在**密钥校验之前**）。
"""

from __future__ import annotations

from _smoke_harness import bootstrap_env, check, report, section

# 环境必须在 import src.* 之前设好。这里把白名单留空，逐条用例自己控制。
bootstrap_env(prefix="homeos-mcp-auth-")

# 伪造 XFF 用的客户端地址：一个**不在**任何白名单里的地址。
FORGED_IP = "203.0.113.9"

# 先 import ``src``：``homeos_shared`` 的 sys.path 注册就在 ``src/__init__.py`` 里
# （源码态挂 ``packages/shared-py``），因此必须先过这一层才能 import 共享包。
import src  # noqa: F401
from starlette.exceptions import HTTPException as StarletteHTTPException

from homeos_shared.client_ip import resolve_client_address


def _service(*, env: dict[str, str], is_production: bool | None = None):
    """构造只带 env 与生产标记的网关服务（鉴权路径不碰其余依赖）。"""
    from src.domains.agent.mcp.mcp_service import McpGatewayService

    return McpGatewayService(
        None,
        None,
        None,
        None,
        env=env,
        server_version="0.0.0-test",
        is_production=is_production,
    )


def _status(exc: BaseException) -> int:
    return getattr(exc, "status_code", 0)


def check_address_judgement() -> None:
    """判据层：只有 TCP 对端可信时才采信转发头。"""
    section("1) 真实客户端地址判据（homeos_shared.client_ip）")

    # 对端不可信（或未配可信代理）→ 转发头一律无视。这正是修复前被绕过的那条路径。
    forged = resolve_client_address(
        peer="198.51.100.7",
        trusted_proxies=(),
        forwarded_for=FORGED_IP,
    )
    check("未配可信代理时忽略 X-Forwarded-For（用 TCP 对端）", forged.ip == "198.51.100.7", forged)
    check("未配可信代理时判定不标记 via_proxy", forged.via_proxy is False, forged)

    # 对端可信 → 从链右往左找第一个不可信地址。
    proxied = resolve_client_address(
        peer="127.0.0.1",
        trusted_proxies=("127.0.0.1", "::1"),
        forwarded_for=f"{FORGED_IP}, 127.0.0.1",
    )
    check("可信代理后取转发链中第一个不可信地址", proxied.ip == FORGED_IP, proxied)
    check("经由代理解析时标记 via_proxy", proxied.via_proxy is True, proxied)

    # 整条链都可信 → 退回链首（最接近原始客户端的一条）。
    all_trusted = resolve_client_address(
        peer="127.0.0.1",
        trusted_proxies=("127.0.0.1", "10.0.0.0/8"),
        forwarded_for="10.1.2.3, 127.0.0.1",
    )
    check("转发链全为可信地址时退回链首", all_trusted.ip == "10.1.2.3", all_trusted)

    # 对端可信但没有任何转发头 → 判不出客户端，调用方必须走全局桶（fail-closed 一侧）。
    unknown = resolve_client_address(peer="127.0.0.1", trusted_proxies=("127.0.0.1",))
    check("可信代理但无转发头时 per_client=False", unknown.per_client is False, unknown)

    # 垃圾段被丢弃，而不是当成可用地址（否则每请求换一个假地址就能撑爆限流 key 表）。
    garbage = resolve_client_address(
        peer="127.0.0.1",
        trusted_proxies=("127.0.0.1",),
        forwarded_for=f"not-an-ip, {FORGED_IP}",
    )
    check("转发链里的非 IP 段被丢弃", garbage.ip == FORGED_IP, garbage)

    # 网段形态也要认（配置里写 CIDR 是文档化的用法）。
    cidr = resolve_client_address(
        peer="10.0.0.5",
        trusted_proxies=("10.0.0.0/8",),
        forwarded_for=FORGED_IP,
    )
    check("可信代理支持 CIDR 网段", cidr.ip == FORGED_IP and cidr.via_proxy, cidr)

    # 写错的可信代理配置必须显式失败，而不是静默退化成「没有可信代理」。
    try:
        resolve_client_address(peer="127.0.0.1", trusted_proxies=("127.0.0.1.0/33",))
    except ValueError:
        check("非法可信代理配置抛错（不静默降级）", True)
    else:
        check("非法可信代理配置抛错（不静默降级）", False, "未抛 ValueError")


def check_allowlist_semantics() -> None:
    """服务层：白名单未配置在生产必须拒；配了就必须真的拦。"""
    section("2) MCP_GATEWAY_ALLOW_IPS 白名单语义")

    prod_no_allow = _service(env={}, is_production=True)
    try:
        prod_no_allow.assert_ip_allowed("192.168.1.9")
    except StarletteHTTPException as exc:
        check(
            "生产未配白名单 → 拒绝（403，fail-closed）",
            _status(exc) == 403,
            f"status={_status(exc)}",
        )
    else:
        check("生产未配白名单 → 拒绝（403，fail-closed）", False, "竟然放行")

    dev_no_allow = _service(env={}, is_production=False)
    try:
        dev_no_allow.assert_ip_allowed("192.168.1.9")
        check("非生产未配白名单 → 放行（本地开发便利）", True)
    except StarletteHTTPException as exc:
        check("非生产未配白名单 → 放行（本地开发便利）", False, f"status={_status(exc)}")

    # 生产标记来自 APP_ENVIRONMENT（唯一真源），而不是被容器忽略的 NODE_ENV。
    env_prod = _service(env={"APP_ENVIRONMENT": "production"})
    try:
        env_prod.assert_ip_allowed(None)
    except StarletteHTTPException as exc:
        check(
            "APP_ENVIRONMENT=production 时未配白名单也拒（走单一真源）",
            _status(exc) == 403,
            f"status={_status(exc)}",
        )
    else:
        check("APP_ENVIRONMENT=production 时未配白名单也拒（走单一真源）", False, "竟然放行")

    legacy_prod = _service(env={"NODE_ENV": "production"})
    try:
        legacy_prod.assert_ip_allowed(None)
    except StarletteHTTPException as exc:
        check("NODE_ENV=production 仍作兼容回退", _status(exc) == 403, f"status={_status(exc)}")
    else:
        check("NODE_ENV=production 仍作兼容回退", False, "竟然放行")

    allowed = _service(env={"MCP_GATEWAY_ALLOW_IPS": "192.168.1.,10.0.0.0/8"}, is_production=True)
    try:
        allowed.assert_ip_allowed("192.168.1.9")
        check("命中前缀白名单 → 放行", True)
    except StarletteHTTPException as exc:
        check("命中前缀白名单 → 放行", False, f"status={_status(exc)}")

    try:
        allowed.assert_ip_allowed(None)
    except StarletteHTTPException as exc:
        check("判不出客户端地址（None）→ 拒绝", _status(exc) == 403, f"status={_status(exc)}")
    else:
        check("判不出客户端地址（None）→ 拒绝", False, "竟然放行")

    try:
        allowed.assert_ip_allowed("203.0.113.9")
    except StarletteHTTPException as exc:
        check("白名单外的地址 → 拒绝", _status(exc) == 403, f"status={_status(exc)}")
    else:
        check("白名单外的地址 → 拒绝", False, "竟然放行")


def check_route_ordering() -> None:
    """路由层：伪造 XFF 走真实 HTTP 栈仍被拦，且拦在密钥校验**之前**。"""
    section("3) 路由层：伪造 X-Forwarded-For 不放行")

    import os

    # 白名单里放一个「伪造头会命中的地址」，让「伪造成功/失败」的差别在状态码上可见。
    os.environ["MCP_GATEWAY_ALLOW_IPS"] = FORGED_IP
    os.environ["MCP_GATEWAY_SECRET"] = "smoke-secret-0123456789"
    # 不设 APP_TRUSTED_PROXIES：TestClient 的对端不是回环，转发头一律不采信。
    os.environ.pop("APP_TRUSTED_PROXIES", None)

    from fastapi.testclient import TestClient
    from src.app import create_app

    app = create_app()
    with TestClient(app) as client:
        headers = {"x-forwarded-for": FORGED_IP, "x-homeos-mcp-key": "smoke-secret-0123456789"}
        response = client.post("/api/v1/mcp", json={"method": "ping"}, headers=headers)
        check(
            "伪造 XFF 指向白名单地址仍被拒",
            response.status_code == 403,
            f"status={response.status_code} body={response.text[:160]}",
        )
        # 顺序断言：白名单先于密钥。若密钥先校验，无效密钥会让这里变成 401，
        # 攻击者就能靠状态码差异探测「密钥对不对」，而 IP 白名单成了事后装饰。
        wrong_key = client.post(
            "/api/v1/mcp",
            json={"method": "ping"},
            headers={"x-forwarded-for": FORGED_IP, "x-homeos-mcp-key": "wrong-key-0000000000"},
        )
        check(
            "IP 校验先于密钥校验（伪造来源 + 无效密钥仍是 403）",
            wrong_key.status_code == 403,
            f"status={wrong_key.status_code} body={wrong_key.text[:160]}",
        )


def check_gateway_key() -> None:
    """密钥校验：未配置密钥 → 401；密钥错误 → 401；密钥正确 → 通过。"""
    section("4) MCP 网关密钥校验")

    import asyncio

    class _Config:
        def __init__(self, secret: str) -> None:
            self._secret = secret

        async def get_mcp_gateway_secret(self) -> str:
            return self._secret

    async def _run() -> None:
        missing = _service(env={"MCP_GATEWAY_ALLOW_IPS": FORGED_IP}, is_production=True)
        missing._agent_config = _Config("")
        try:
            await missing.assert_gateway_key("whatever")
        except StarletteHTTPException as exc:
            check("未配置密钥 → 401", _status(exc) == 401, f"status={_status(exc)}")
        else:
            check("未配置密钥 → 401", False, "竟然放行")

        configured = _service(env={"MCP_GATEWAY_ALLOW_IPS": FORGED_IP}, is_production=True)
        configured._agent_config = _Config("smoke-secret-0123456789")
        try:
            await configured.assert_gateway_key("wrong-key-0000000000")
        except StarletteHTTPException as exc:
            check("密钥不匹配 → 401", _status(exc) == 401, f"status={_status(exc)}")
        else:
            check("密钥不匹配 → 401", False, "竟然放行")

        try:
            await configured.assert_gateway_key("smoke-secret-0123456789")
            check("密钥匹配 → 通过", True)
        except StarletteHTTPException as exc:
            check("密钥匹配 → 通过", False, f"status={_status(exc)}")

    asyncio.run(_run())


def main() -> None:
    check_address_judgement()
    check_allowlist_semantics()
    check_route_ordering()
    check_gateway_key()
    report("SMOKE OK — MCP 网关鉴权契约全部通过")


if __name__ == "__main__":
    main()
