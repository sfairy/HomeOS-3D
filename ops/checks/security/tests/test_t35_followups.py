"""T35 后续修复回归：代理边界、幂等语义、安防回读、HA 超时、通道缓存等。

这些用例只依赖源码与假对象，不启动真实后端/HA；供 gate:test 的 test:security 收集。
"""

from __future__ import annotations

import asyncio
import base64
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.channels.email_service import EmailService
from src.domains.channels.webpush_service import WebPushService, _valid_webpush_keys
from src.domains.ha.integration.client import HAClient, HAClientError
from src.domains.ha.integration.live_events import LiveStateEventQueue
from src.domains.lifestyle.media_scene import MediaSceneService
from src.domains.proxy.command_proxy import CommandProxyService
from src.domains.security import panel_helpers
from src.domains.security.panel_helpers import SecurityLinkageHelper
from src.domains.state_store.entity_area import EntityAreaEnrichmentService
from src.domains.system.ops.moviepilot_proxy import filter_forward_headers
from src.platform.security.cookies import is_request_secure
from test_security_regressions import FakeBus, FakeConfigProvider, build_panel


class _Request:
    def __init__(self, *, peer: str, trusted: tuple[str, ...] = (), headers: dict[str, str] | None = None) -> None:
        self.url = SimpleNamespace(scheme="http")
        self.headers = headers or {}
        self.client = SimpleNamespace(host=peer)
        self.app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(trusted_proxies=trusted)))


class ProxyBoundaryTest(unittest.TestCase):
    def test_x_forwarded_proto_only_trusted_via_proxy(self) -> None:
        direct = _Request(peer="203.0.113.5", headers={"x-forwarded-proto": "https"})
        self.assertFalse(is_request_secure(direct))

        proxied = _Request(
            peer="127.0.0.1",
            trusted=("127.0.0.1",),
            headers={"x-forwarded-proto": "https"},
        )
        self.assertTrue(is_request_secure(proxied))

    def test_moviepilot_forward_does_not_leak_homeos_credentials(self) -> None:
        forwarded = filter_forward_headers(
            {
                "Cookie": "auth_token=secret",
                "Authorization": "Bearer secret",
                "Proxy-Authorization": "Basic secret",
                "X-Test": "ok",
            }
        )
        self.assertEqual(forwarded, {"X-Test": "ok"})

    def test_idempotency_inflight_is_pending_not_success(self) -> None:
        class _Connector:
            def __init__(self) -> None:
                self.release = asyncio.Event()
                self.calls = 0

            async def get_status(self) -> dict[str, bool]:
                return {"connected": True}

            async def call_service(self, *args: object, **kwargs: object) -> list[object]:
                self.calls += 1
                await self.release.wait()
                return []

        async def _run() -> dict[str, object]:
            connector = _Connector()
            proxy = CommandProxyService(lambda: None, connector)
            proxy._config = lambda: {"idempotencyTtlMs": 3000}  # type: ignore[method-assign]
            dto = {"domain": "light", "service": "turn_on", "entity_id": "light.x", "idempotency_key": "k"}
            first = asyncio.create_task(proxy.call_service(dto))
            while connector.calls == 0:
                await asyncio.sleep(0.01)
            duplicate = await proxy.call_service(dto)
            connector.release.set()
            await first
            return duplicate

        duplicate = asyncio.run(_run())
        self.assertFalse(duplicate["success"])
        self.assertTrue(duplicate["pending"])


class SecurityReadbackTest(unittest.TestCase):
    def test_ha_200_but_state_unchanged_is_failure(self) -> None:
        class _HA:
            async def get_status(self) -> dict[str, bool]:
                return {"connected": True}

            async def call_service(self, *args: object, **kwargs: object) -> list[object]:
                return []

            async def fetch_entity_state(self, entity_id: str) -> dict[str, object]:
                return {"state": "off", "attributes": {}}

        with patch.object(panel_helpers, "schedule_security_event"):
            helper = SecurityLinkageHelper(lambda: None, _HA(), FakeBus())
            result = asyncio.run(
                helper.execute_ha_actions(
                    [{"entity_id": "siren.demo", "service": "turn_on", "domain": "siren"}],
                    "测试",
                    "linkage_action_failed",
                )
            )
        self.assertEqual(result["executed"], 0)
        self.assertEqual(result["failed"], 1)

    def test_same_mode_rearm_refreshes_manual_lock(self) -> None:
        panel, _state, _bus = build_panel()
        panel._config = FakeConfigProvider({"manualArmLockSec": 60})
        asyncio.run(panel.arm("armed_away"))
        first = panel.get_manual_lock_until()
        time.sleep(0.01)
        asyncio.run(panel.arm("armed_away"))
        self.assertGreater(panel.get_manual_lock_until(), first)


class TimeoutAndChannelTest(unittest.TestCase):
    def test_ha_command_times_out(self) -> None:
        class _WS:
            async def send(self, payload: str) -> None:
                return None

            async def recv(self) -> str:
                await asyncio.sleep(10)
                return "{}"

        client = object.__new__(HAClient)
        client.timeout = 0.01
        client.websocket_max_size_bytes = 1024
        with self.assertRaises(HAClientError):
            asyncio.run(client.command(_WS(), 1, "test"))

    def test_email_status_is_cached(self) -> None:
        service = object.__new__(EmailService)
        service._enabled = True
        service._smtp = {"host": "smtp.example.com"}
        service._from_address = "a@example.com"
        service._to_addresses = []
        service._status_cache = None
        calls = 0

        def _verify() -> None:
            nonlocal calls
            calls += 1

        service._verify_sync = _verify  # type: ignore[method-assign]
        asyncio.run(service.get_status())
        asyncio.run(service.get_status())
        self.assertEqual(calls, 1)

    def test_empty_subscription_candidates_do_not_fall_back_to_all(self) -> None:
        class _Gateway:
            _baseline_ready = {"a", "b"}
            _indexed_sids = {"a", "b"}
            _sub_wildcard_sids: set[str] = set()
            _sub_domain_sids: dict[str, set[str]] = {}
            _sub_pinned_sids: dict[str, set[str]] = {}

        from src.realtime.gateway_subscriptions import SubscriptionIndexMixin

        self.assertEqual(SubscriptionIndexMixin._candidate_sids_for_changes(_Gateway(), [], set()), set())

    def test_webpush_test_reports_real_delivery(self) -> None:
        service = object.__new__(WebPushService)
        service._subscriptions = {"https://push.example/x": object()}

        async def _fake_send(to: str, text: str, title: str | None = None) -> dict[str, int]:
            return {"attempted": 1, "delivered": 0}

        service.send_text = _fake_send  # type: ignore[method-assign]
        result = asyncio.run(service.send_test("https://push.example/x"))
        self.assertEqual(result["sent"], 0)
        self.assertEqual(result["attempted"], 1)

    def test_webpush_keys_are_shape_checked(self) -> None:
        valid_point = base64.urlsafe_b64encode(b"\x04" + b"x" * 64).decode().rstrip("=")
        valid_auth = base64.urlsafe_b64encode(b"y" * 16).decode().rstrip("=")
        self.assertTrue(_valid_webpush_keys(valid_point, valid_auth))
        self.assertFalse(_valid_webpush_keys(valid_point, "bad"))


class SmallFollowupTest(unittest.TestCase):
    def test_live_queue_drops_oldest_not_newest(self) -> None:
        async def _run() -> tuple[set[str], int]:
            queue = LiveStateEventQueue(lambda batch: None, max_pending=2, window_seconds=999)
            queue.enqueue({"new_state": 1}, entity_id="a")
            queue.enqueue({"new_state": 2}, entity_id="b")
            queue.enqueue({"new_state": 3}, entity_id="c")
            return set(queue._pending), queue.dropped

        pending, dropped = asyncio.run(_run())
        self.assertNotIn("a", pending)
        self.assertIn("c", pending)
        self.assertEqual(dropped, 1)

    def test_media_scene_skips_malformed_playlist(self) -> None:
        class _Cfg:
            def get(self, key: str) -> object:
                return {"mediaPlaylists": {"media_player.x": {"items": "oops"}}} if key == "mediaPlaylists" else None

            async def update(self, patch: object) -> None:
                return None

        service = MediaSceneService(object(), _Cfg())
        service.start()
        self.assertIsNone(service.get_playlist("media_player.x"))

    def test_invalidate_keeps_inflight_for_generation_retry(self) -> None:
        async def _run() -> bool:
            service = EntityAreaEnrichmentService(None)
            task = asyncio.ensure_future(asyncio.sleep(0.1))
            service._inflight = task  # type: ignore[assignment]
            service.invalidate()
            same = service._inflight is task
            task.cancel()
            return same

        self.assertTrue(asyncio.run(_run()))

    def test_app_config_unknown_section_is_rejected(self) -> None:
        from src.domains.app_config.validate import AppConfigValidationError, validate_app_config_partial

        with self.assertRaises(AppConfigValidationError):
            validate_app_config_partial({"not-a-section": {}})


if __name__ == "__main__":
    unittest.main()
