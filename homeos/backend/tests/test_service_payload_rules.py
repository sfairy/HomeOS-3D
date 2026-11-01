"""服务调用白名单的回归：两条下发通道必须共用同一份判据。

背景（HS-BH-01）：``ALLOWED_SERVICES`` 只挂在 ``/ha/services/call`` 上，而前端实体控制走的
``/services/call`` → ``CommandProxyService.call_service`` 一份校验都没有，等于「登录即可下发
任意 ``domain.service``」（含 ``shell_command`` / ``homeassistant.restart``）。

这里的 case 锁三件事：
1. 命令代理**默认**就按最严口径校验（忘传 policy 不会退回放行）；
2. 管家 / 语音通道的 ``agent`` 口径与 ``agent_service_allowed`` 完全等价（不误伤 toggle）；
3. ``service_data.target`` 在两条口径下都被拒（HA 会按它扩散目标，而校验只看顶层实体）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.ha.ha_service_catalog import (
    AGENT_EXTRA_SERVICES,
    AGENT_TOGGLE_DOMAINS,
    ALLOWED_SERVICES,
    agent_service_allowed,
)
from src.platform.core.ha.service_payload_rules import (
    ServicePayloadRejected,
    validate_service_payload,
)


def _rejects(domain, service, data=None, entity_id="", *, policy="http") -> bool:
    try:
        validate_service_payload(domain, service, data or {}, entity_id, policy=policy)
    except ServicePayloadRejected:
        return True
    return False


class HttpPolicyTest(unittest.TestCase):
    def test_admin_services_are_rejected(self) -> None:
        for domain, service in (
            ("shell_command", "turn_on"),
            ("python_script", "hello"),
            ("homeassistant", "restart"),
            ("recorder", "purge"),
            ("hassio", "backup_full"),
        ):
            with self.subTest(service=f"{domain}.{service}"):
                self.assertTrue(_rejects(domain, service))

    def test_listed_service_passes(self) -> None:
        validate_service_payload("light", "turn_on", {"brightness": 128}, "light.living")
        validate_service_payload("lock", "unlock", {"code": "1234"}, "lock.front_door")

    def test_unknown_field_is_rejected(self) -> None:
        self.assertTrue(_rejects("light", "turn_on", {"bogus": 1}, "light.living"))

    def test_cross_domain_entity_is_rejected(self) -> None:
        self.assertTrue(_rejects("lock", "unlock", {}, "light.living"))

    def test_target_is_rejected(self) -> None:
        # 校验看顶层 entity_id，HA 却会按 target 扩散 —— 放行等于「校验 A、下发 B」。
        self.assertTrue(_rejects("lock", "unlock", {"target": {"entity_id": ["lock.front_door"]}}, "light.living"))

    def test_catalog_matches_whitelist(self) -> None:
        # ``homeassistant.*`` 是跨域服务，实体域必须落在 TOGGLE_ENTITY_DOMAINS 里。
        for domain, service in ALLOWED_SERVICES:
            entity_id = f"{min(AGENT_TOGGLE_DOMAINS)}.sample" if domain == "homeassistant" else f"{domain}.sample"
            with self.subTest(service=f"{domain}.{service}"):
                self.assertFalse(
                    _rejects(domain, service, {}, entity_id),
                    f"{domain}.{service} 在白名单里却被拒绝",
                )


class AgentPolicyTest(unittest.TestCase):
    def test_equivalent_to_agent_service_allowed(self) -> None:
        keys = (
            list(ALLOWED_SERVICES)
            + list(AGENT_EXTRA_SERVICES)
            + [(domain, "toggle") for domain in AGENT_TOGGLE_DOMAINS]
            + [("lock", "toggle"), ("shell_command", "turn_on"), ("homeassistant", "restart")]
        )
        for domain, service in keys:
            with self.subTest(service=f"{domain}.{service}"):
                self.assertEqual(
                    _rejects(domain, service, {}, f"{domain}.sample", policy="agent"),
                    not agent_service_allowed(domain, service),
                )

    def test_agent_still_cannot_reach_admin_services(self) -> None:
        self.assertTrue(_rejects("shell_command", "turn_on", policy="agent"))
        self.assertTrue(_rejects("homeassistant", "restart", policy="agent"))

    def test_agent_target_is_rejected(self) -> None:
        self.assertTrue(
            _rejects("light", "turn_on", {"target": {"entity_id": ["lock.door"]}}, "light.x", policy="agent")
        )


class UnknownPolicyTest(unittest.TestCase):
    def test_unknown_policy_fails_closed(self) -> None:
        self.assertTrue(_rejects("light", "turn_on", policy="typo"))


if __name__ == "__main__":
    unittest.main()
