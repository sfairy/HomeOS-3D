"""L3 回归：免打扰不再丢弃通知，冷却可跨重启恢复。

1. 免打扰期间：仍然入库、带 ``deferred`` 标记、不投外部渠道；
2. 危险级 / 生命安全的通知照常穿透；
3. 冷却持久化：写入后在「新实例」上仍能读到（模拟重启）。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.notification import dispatch as notification_dispatch
from src.domains.security.cooldown import COOLDOWN_KV_KEY, NotificationCooldownService


def _run(coro):
    return asyncio.run(coro)


class _Bus:
    def __init__(self) -> None:
        self.events: list[tuple[str, Any]] = []

    def on(self, *args: Any, **kwargs: Any) -> None:
        return None

    def emit_soon(self, name: str, payload: Any) -> None:
        self.events.append((name, payload))

    async def emit(self, name: str, payload: Any) -> None:
        self.events.append((name, payload))


def _helper(cfg: dict[str, Any], bus: _Bus) -> Any:
    helper = notification_dispatch.NotificationDispatchHelper(
        session_factory=lambda: None,
        event_bus=bus,
        get_cfg=lambda: cfg,
        schedule_prune=lambda: None,
        get_timezone=lambda: "Asia/Shanghai",
    )
    # 不入库：直接返回一条内存通知，专注验证「丢不丢 / 发不发外部」。
    helper._insert_notification = MagicMock(  # type: ignore[method-assign]
        return_value={"id": "n1", "level": "warn", "message": "m", "source": "security"}
    )
    helper._send_external_notifications = MagicMock()  # type: ignore[method-assign]
    return helper


_DND_CFG = {"globalNotifyEnabled": True, "importantNotifyEnabled": True, "dndStart": 0, "dndEnd": 24}


class DndDeferralTests(unittest.TestCase):
    def test_dnd_keeps_notification_and_skips_external(self) -> None:
        bus = _Bus()
        helper = _helper(_DND_CFG, bus)

        # 用**非生命安全**来源：``security`` / ``water`` / ``earthquake`` 等按设计穿透 DND。
        result = _run(helper.notify("warn", "空调滤芯到期", "energy", opts={"channels": ["in_app", "webpush"]}))

        self.assertIsNotNone(result)
        self.assertTrue(result["deferred"])
        helper._insert_notification.assert_called_once()  # type: ignore[attr-defined]
        helper._send_external_notifications.assert_not_called()  # type: ignore[attr-defined]
        self.assertTrue(any(name == "notification.created" for name, _ in bus.events))

    def test_life_safety_source_ignores_dnd(self) -> None:
        """``security`` 属生命安全来源：静音时段照常推送（与前端 DND 的豁免一致）。"""
        bus = _Bus()
        helper = _helper(_DND_CFG, bus)

        result = _run(helper.notify("warn", "有人移动", "security", opts={"channels": ["in_app", "webpush"]}))

        self.assertNotIn("deferred", result or {})
        helper._send_external_notifications.assert_called_once()  # type: ignore[attr-defined]

    def test_danger_bypasses_dnd(self) -> None:
        bus = _Bus()
        helper = _helper(_DND_CFG, bus)

        result = _run(helper.notify("danger", "燃气泄漏", "energy", opts={"channels": ["in_app", "webpush"]}))

        self.assertIsNotNone(result)
        self.assertNotIn("deferred", result)
        helper._send_external_notifications.assert_called_once()  # type: ignore[attr-defined]

    def test_bypass_dnd_option(self) -> None:
        bus = _Bus()
        helper = _helper(_DND_CFG, bus)

        result = _run(helper.notify("warn", "重要提醒", "system", opts={"channels": ["in_app"], "bypassDnd": True}))

        self.assertNotIn("deferred", result or {})

    def test_no_dnd_is_not_deferred(self) -> None:
        bus = _Bus()
        helper = _helper({"globalNotifyEnabled": True, "importantNotifyEnabled": True}, bus)

        result = _run(helper.notify("warn", "普通提醒", "system", opts={"channels": ["in_app"]}))

        self.assertNotIn("deferred", result or {})


class _FakeSession:
    def __init__(self, store: dict[str, Any]) -> None:
        self._store = store

    def __enter__(self):
        return self

    def __exit__(self, *args: Any) -> None:
        return None


class CooldownPersistenceTests(unittest.TestCase):
    def test_cooldown_survives_restart(self) -> None:
        stored: dict[str, Any] = {}

        with (
            patch(
                "src.domains.security.cooldown.load_runtime_kv",
                side_effect=lambda session, key: stored.get(key),
            ),
            patch(
                "src.domains.security.cooldown.persist_runtime_kv",
                side_effect=lambda factory, key, value: stored.__setitem__(key, value),
            ),
        ):
            first = NotificationCooldownService(None, lambda: _FakeSession(stored))
            first.set_cooldown("notify", "gas", 5)
            self.assertTrue(first.is_in_cooldown("notify", "gas"))

            # 新实例 = 模拟进程重启：从 runtime_kv 恢复。
            second = NotificationCooldownService(None, lambda: _FakeSession(stored))
            self.assertTrue(second.is_in_cooldown("notify", "gas"))

        self.assertIn(COOLDOWN_KV_KEY, stored)

    def test_expired_entries_not_restored(self) -> None:
        stored = {COOLDOWN_KV_KEY: {"notify:old": 1.0}}
        with (
            patch(
                "src.domains.security.cooldown.load_runtime_kv",
                side_effect=lambda session, key: stored.get(key),
            ),
            patch("src.domains.security.cooldown.persist_runtime_kv"),
        ):
            service = NotificationCooldownService(None, lambda: _FakeSession(stored))
            self.assertFalse(service.is_in_cooldown("notify", "old"))

    def test_repository_without_factory_still_works(self) -> None:
        service = NotificationCooldownService(None)
        service.set_cooldown("notify", "k", 1)
        self.assertTrue(service.is_in_cooldown("notify", "k"))


if __name__ == "__main__":
    unittest.main()
