"""MCP 网关 IP 白名单策略单测。

回归点（HS-BC-03）：同一个 ``assert_ip_allowed`` 里出现过两套相反的默认值 ——
「白名单未配置」在非生产放行，而「白名单已配置但取不到客户端 IP」无条件拒绝。
这里把两种环境的四种组合都钉住，保证策略一致：
生产 fail-closed，非生产放行且只告警一次。
"""

from __future__ import annotations

import unittest

from src.domains.agent.mcp.mcp_service import McpGatewayService
from starlette.exceptions import HTTPException as StarletteHTTPException


def _service(*, production: bool, allow_ips: str) -> McpGatewayService:
    return McpGatewayService(
        agent_service=None,
        tools=None,
        agent_config=None,
        session_factory=None,
        env={"MCP_GATEWAY_ALLOW_IPS": allow_ips} if allow_ips else {},
        server_version="test",
        is_production=production,
    )


class McpIpAllowlistTest(unittest.TestCase):
    def test_production_without_allowlist_rejects(self) -> None:
        service = _service(production=True, allow_ips="")
        with self.assertRaises(StarletteHTTPException) as ctx:
            service.assert_ip_allowed("192.168.1.10")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_production_with_unknown_ip_rejects(self) -> None:
        """生产下「取不到客户端 IP」不能当成匹配（否则等于把白名单绕过去）。"""
        service = _service(production=True, allow_ips="192.168.1.")
        for raw in (None, "", "   ", "::ffff:"):
            with self.assertRaises(StarletteHTTPException) as ctx:
                service.assert_ip_allowed(raw)
            self.assertEqual(ctx.exception.status_code, 403)

    def test_production_allows_whitelisted_ip(self) -> None:
        service = _service(production=True, allow_ips="10.0.0.5,192.168.1.")
        service.assert_ip_allowed("192.168.1.42")
        service.assert_ip_allowed("::ffff:10.0.0.5")

    def test_production_rejects_ip_outside_allowlist(self) -> None:
        service = _service(production=True, allow_ips="192.168.1.")
        with self.assertRaises(StarletteHTTPException):
            service.assert_ip_allowed("10.1.2.3")

    def test_non_production_without_allowlist_allows(self) -> None:
        service = _service(production=False, allow_ips="")
        service.assert_ip_allowed("203.0.113.9")
        service.assert_ip_allowed(None)

    def test_non_production_with_unknown_ip_allows_once_warned(self) -> None:
        """非生产口径与「白名单为空」一致：放行，但告警只打一条。"""
        service = _service(production=False, allow_ips="192.168.1.")
        with self.assertLogs("homeos.agent.mcp", level="WARNING") as captured:
            service.assert_ip_allowed(None)
            service.assert_ip_allowed("")
        self.assertEqual(len(captured.records), 1)
        self.assertTrue(service._unknown_ip_warning_logged)

    def test_non_production_still_checks_known_ip(self) -> None:
        """非生产放行的只是「判不出 IP」，判得出时白名单照常生效。"""
        service = _service(production=False, allow_ips="192.168.1.")
        service.assert_ip_allowed("192.168.1.7")
        with self.assertRaises(StarletteHTTPException):
            service.assert_ip_allowed("203.0.113.9")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
