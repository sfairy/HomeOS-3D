"""通知热路径：配置/时区/免打扰读取不再阻塞事件循环。"""

from __future__ import annotations

import threading
import unittest
from unittest.mock import patch

from src.domains.notification.dispatch import NotificationDispatchHelper
from src.domains.notification.rules import NotificationRulesHelper

MAIN_THREAD = threading.main_thread().name


class NotificationOffloadTest(unittest.IsolatedAsyncioTestCase):
    async def test_notify_reads_config_off_loop(self) -> None:
        seen: list[str] = []
        helper = object.__new__(NotificationDispatchHelper)

        def get_cfg() -> dict:
            seen.append(threading.current_thread().name)
            return {"globalNotifyEnabled": False}

        helper._get_cfg = get_cfg  # type: ignore[attr-defined]
        self.assertIsNone(await helper.notify("info", "hello"))
        self.assertEqual(len(seen), 1)
        self.assertNotEqual(seen[0], MAIN_THREAD)

    async def test_notify_reads_timezone_off_loop(self) -> None:
        seen: list[str] = []
        helper = object.__new__(NotificationDispatchHelper)
        helper._get_cfg = lambda: {"globalNotifyEnabled": True, "importantNotifyEnabled": True}  # type: ignore[attr-defined]

        def get_timezone() -> str:
            seen.append(threading.current_thread().name)
            return "Asia/Shanghai"

        helper._get_timezone = get_timezone  # type: ignore[attr-defined]
        with patch(
            "src.domains.notification.dispatch.is_dnd_active_now", return_value=True
        ):
            self.assertIsNone(await helper.notify("info", "hello"))
        self.assertEqual(len(seen), 1)
        self.assertNotEqual(seen[0], MAIN_THREAD)

    async def test_evaluate_rules_reads_dnd_config_off_loop(self) -> None:
        seen: list[str] = []
        helper = object.__new__(NotificationRulesHelper)
        helper.rules_cache = [  # type: ignore[attr-defined]
            {"id": "rule-1", "condition": "state == 'on'", "level": "info"}
        ]
        helper._match_state = {}  # type: ignore[attr-defined]
        helper._is_in_cooldown = lambda _key: False  # type: ignore[attr-defined]
        helper._set_cooldown = lambda _key, _minutes: None  # type: ignore[attr-defined]

        def is_bypass() -> bool:
            seen.append(threading.current_thread().name)
            return False

        def is_dnd() -> bool:
            seen.append(threading.current_thread().name)
            return False

        async def notify(*_args, **_kwargs):
            return None

        helper._is_alert_bypass_dnd = is_bypass  # type: ignore[attr-defined]
        helper._is_dnd_active = is_dnd  # type: ignore[attr-defined]
        helper._notify = notify  # type: ignore[attr-defined]

        await helper.evaluate_rules("light.demo", "on")
        self.assertEqual(len(seen), 2)
        self.assertTrue(all(name != MAIN_THREAD for name in seen))


if __name__ == "__main__":
    unittest.main()
