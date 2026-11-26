"""HA 连接身份（0.8.9）与内网媒体直连的单元测试。

两条都源于同一类事故：**同一份「看起来对」的状态用在了错误的连接上**。

1. 换 HA 后旧页面继续操作 → 打到新机器的同名实体（本节第 1 组）；
2. 容器里配了公网代理 → 内网摄像头经代理拉不到（本节第 2 组）。

第 2 组只测纯判定函数（``bypass_environment_proxy``）：真正的 httpx 行为不在单测范围。
"""

from __future__ import annotations

import asyncio
import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.ha.integration.client import bypass_environment_proxy
from homeos.backend.src.domains.ha.integration.state_hub import StateHub

HOME_A = "http://192.168.1.10:8123"
HOME_B = "http://192.168.1.20:8123"


def identity(url: str, token: str | None = None) -> str:
    return StateHub.browser_source_identity(url, token or "token-a")


class BrowserSourceIdentityTests(unittest.TestCase):
    def test_is_short_and_prefixed_digest(self) -> None:
        value = identity(HOME_A)
        self.assertEqual(len(value), 16)
        self.assertRegex(value, r"^[0-9a-f]{16}$")

    def test_stable_across_trailing_slash(self) -> None:
        self.assertEqual(identity(HOME_A), identity(f"{HOME_A}/"))

    def test_changes_with_base_url(self) -> None:
        self.assertNotEqual(identity(HOME_A), identity(HOME_B))

    def test_changes_with_credential(self) -> None:
        self.assertNotEqual(identity(HOME_A, "token-a"), identity(HOME_A, "token-b"))

    def test_does_not_leak_hostname(self) -> None:
        # 前端会把这个值写进 URL / 缓存键 / 日志，不能带出内网主机名。
        self.assertNotIn("192.168", identity(HOME_A))
        self.assertNotIn("token", identity(HOME_A))


class RuntimeEpochTests(unittest.TestCase):
    def test_initial_state_is_offline_without_identity(self) -> None:
        hub = StateHub()
        self.assertEqual(hub.runtime_epoch, 0)
        self.assertFalse(hub.runtime_online)
        self.assertEqual(hub.runtime_source_identity, "")

    def test_first_connect_does_not_bump_epoch(self) -> None:
        hub = StateHub()
        hub.set_runtime_online(True, identity(HOME_A))
        self.assertEqual(hub.runtime_epoch, 0)
        self.assertTrue(hub.runtime_online)

    def test_reconnect_to_same_home_keeps_epoch(self) -> None:
        """断连重连不换身份：前端缓存应继续有效，否则每次抖动都要重载 3D。"""
        hub = StateHub()
        hub.set_runtime_online(True, identity(HOME_A))
        hub.set_runtime_online(False)
        hub.set_runtime_online(True, identity(HOME_A))
        self.assertEqual(hub.runtime_epoch, 0)

    def test_switching_home_bumps_epoch(self) -> None:
        hub = StateHub()
        hub.set_runtime_online(True, identity(HOME_A))
        changed = hub.set_runtime_online(True, identity(HOME_B))
        self.assertTrue(changed)
        self.assertEqual(hub.runtime_epoch, 1)

    def test_offline_keeps_identity(self) -> None:
        hub = StateHub()
        hub.set_runtime_online(True, identity(HOME_A))
        hub.set_runtime_online(False)
        self.assertEqual(hub.runtime_source_identity, identity(HOME_A))
        self.assertFalse(hub.runtime_online)

    def test_source_changed_ignores_empty_expectation(self) -> None:
        """旧客户端不发这个头时不能全部 409。"""
        hub = StateHub()
        hub.set_runtime_online(True, identity(HOME_A))
        self.assertFalse(hub.source_changed(""))
        self.assertTrue(hub.source_changed(identity(HOME_B)))
        self.assertFalse(hub.source_changed(identity(HOME_A)))

    def test_source_changed_before_any_connect_is_permissive(self) -> None:
        self.assertFalse(StateHub().source_changed(identity(HOME_A)))


class HubStillWorksTests(unittest.TestCase):
    def test_normalize_and_snapshot_unaffected(self) -> None:
        hub = StateHub()
        normalized = hub.normalize({"entity_id": "light.a", "state": "on", "attributes": {"friendly_name": "客厅灯"}})
        self.assertEqual(normalized["entityId"], "light.a")
        self.assertTrue(asyncio.run(hub.snapshot()) == [])


class BypassEnvironmentProxyTests(unittest.TestCase):
    def test_private_ipv4_bypasses_proxy(self) -> None:
        for url in (
            "http://192.168.1.10:8123",
            "http://10.0.0.5:8123",
            "http://172.16.4.4:8123",
            "http://127.0.0.1:8123",
        ):
            self.assertTrue(bypass_environment_proxy(url), url)

    def test_mdns_and_local_names_bypass(self) -> None:
        for url in ("http://homeassistant.local:8123", "http://ha.lan:8123", "http://localhost:8123"):
            self.assertTrue(bypass_environment_proxy(url), url)

    def test_public_hostname_keeps_proxy(self) -> None:
        self.assertFalse(bypass_environment_proxy("https://ha.example.com"))

    def test_ipv6_literal_bypasses(self) -> None:
        self.assertTrue(bypass_environment_proxy("http://[fd00::1]:8123"))

    def test_empty_url_is_not_bypassed(self) -> None:
        self.assertFalse(bypass_environment_proxy(""))


if __name__ == "__main__":
    unittest.main()
