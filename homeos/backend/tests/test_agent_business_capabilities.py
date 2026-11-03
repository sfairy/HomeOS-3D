"""业务能力回归：提醒 / 通知 / 待办 / 日历 / 摄像头快照 / 在家状态 / 偏好学习。

每个用例只搭一条最小链路（假状态库 + 假通知服务），锁住「模型能选到一个工具之后，
这个工具到底做了什么」——参数映射、权限、频控和返回字段都在这里。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -p 'test_agent_business_capabilities.py' -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.memory.memory_store import AgentMemoryService
from src.domains.agent.runtime.agent_actor import AgentActor
from src.domains.agent.tools.home_tools_calendar import HomeToolsCalendarMixin
from src.domains.agent.tools.home_tools_entities import HomeToolsEntitiesMixin
from src.domains.agent.tools.home_tools_lists import HomeToolsListsMixin
from src.domains.agent.tools.home_tools_memory import HomeToolsMemoryMixin
from src.domains.agent.tools.home_tools_notify import (
    ALLOWED_CHANNELS,
    RATE_LIMIT_PER_MINUTE,
    HomeToolsNotifyMixin,
    _NotifyRateLimiter,
)


class _StateStore:
    def __init__(self, entities: list[dict]) -> None:
        self._entities = entities

    def get_all(self) -> list[dict]:
        return self._entities

    def get(self, entity_id: str):
        return next((item for item in self._entities if item.get("entity_id") == entity_id), None)


class _Notification:
    def __init__(self, result: object = "__default__") -> None:
        self.calls: list[dict] = []
        self._result = {"deliveryChannels": ["in_app"]} if result == "__default__" else result

    async def notify(self, level, message, source="", actor=None, opts=None):
        self.calls.append({"level": level, "message": message, "source": source, "actor": actor, "opts": opts or {}})
        return self._result


class _NotifyHost(HomeToolsNotifyMixin):
    def __init__(self, notification: _Notification | None = None) -> None:
        self._notification = notification or _Notification()
        self._notify_limiter = _NotifyRateLimiter()


class NotificationToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_requires_actor(self) -> None:
        result = await _NotifyHost()._send_notification({"message": "关火"}, None)
        self.assertIs(result["blocked"], True)
        self.assertIs(result["success"], False)

    async def test_pass_title_channels_and_dnd_bypass(self) -> None:
        host = _NotifyHost()
        result = await host._send_notification(
            {
                "message": "关火提醒",
                "title": "厨房",
                "channels": ["in_app", "wecom"],
                "bypass_dnd": True,
                "level": "warn",
            },
            AgentActor(user_id="u1"),
        )
        self.assertIs(result["success"], True)
        call = host._notification.calls[0]
        self.assertEqual(call["message"], "关火提醒")
        self.assertEqual(call["opts"]["title"], "厨房")
        self.assertEqual(call["opts"]["channels"], ["in_app", "wecom"])
        self.assertIs(call["opts"]["bypassDnd"], True)
        self.assertEqual(call["level"], "warn")
        self.assertEqual(result["channels"], ["in_app"])

    async def test_unknown_channel_is_refused(self) -> None:
        host = _NotifyHost()
        result = await host._send_notification({"message": "x", "channels": ["sms"]}, AgentActor(user_id="u1"))
        self.assertIs(result["success"], False)
        self.assertIn("sms", result["message"])
        self.assertEqual(host._notification.calls, [])

    async def test_empty_channels_means_default_channels(self) -> None:
        host = _NotifyHost()
        await host._send_notification({"message": "x", "channels": []}, AgentActor(user_id="u1"))
        self.assertNotIn("channels", host._notification.calls[0]["opts"])

    async def test_rate_limit_stops_flooding(self) -> None:
        host = _NotifyHost()
        actor = AgentActor(user_id="u1")
        for index in range(RATE_LIMIT_PER_MINUTE):
            allowed = await host._send_notification({"message": f"m{index}"}, actor)
            self.assertIs(allowed["success"], True)
        blocked = await host._send_notification({"message": "m-extra"}, actor)
        self.assertIs(blocked["blocked"], True)
        self.assertEqual(len(host._notification.calls), RATE_LIMIT_PER_MINUTE)

    async def test_suppressed_notification_is_reported_as_blocked(self) -> None:
        host = _NotifyHost(_Notification(result=None))
        result = await host._send_notification({"message": "x"}, AgentActor(user_id="u1"))
        self.assertIs(result["blocked"], True)
        self.assertIs(result["success"], False)

    def test_allowed_channels_are_the_lan_subset(self) -> None:
        for channel in ("in_app", "socket", "webpush", "wecom", "email"):
            self.assertIn(channel, ALLOWED_CHANNELS)


class _TodoHost(HomeToolsListsMixin):
    def __init__(self, entities: list[dict], proxy_result: object = None, readable: bool = True) -> None:
        self._state_store = _StateStore(entities)
        self._command_proxy = self
        self._proxy_result = {"success": True, "data": {"items": []}} if proxy_result is None else proxy_result
        self._readable = readable
        self.control: list[dict] = []

    def _may_read(self, entity_id: str, actor=None) -> bool:
        return self._readable

    async def _control_device(self, args: dict, actor=None) -> dict:
        self.control.append(args)
        return {"success": True}

    async def call_service(self, args: dict) -> dict:
        self._last_service = args
        return self._proxy_result


def _todo_entity(entity_id: str, name: str) -> dict:
    return {"entity_id": entity_id, "state": "0", "attributes": {"friendly_name": name}}


class TodoToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_list_reads_items_through_return_response(self) -> None:
        host = _TodoHost(
            [_todo_entity("todo.shopping", "购物清单")],
            proxy_result={
                "success": True,
                "data": {"todo.shopping": {"items": [{"summary": "牛奶", "status": "needs_action"}]}},
            },
        )
        result = await host._manage_todo({"action": "list"}, AgentActor(user_id="u1"))
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["summary"], "牛奶")
        self.assertIs(host._last_service["return_response"], True)
        self.assertEqual(host._last_service["service"], "get_items")

    async def test_add_maps_to_add_item(self) -> None:
        host = _TodoHost([_todo_entity("todo.shopping", "购物清单")])
        result = await host._manage_todo({"action": "add", "item": "牛奶"}, AgentActor(user_id="u1"))
        self.assertIs(result["success"], True)
        self.assertEqual(host.control[0]["domain"], "todo")
        self.assertEqual(host.control[0]["service"], "add_item")
        self.assertEqual(host.control[0]["service_data"], {"item": "牛奶"})

    async def test_add_maps_due_to_due_date_or_datetime(self) -> None:
        host = _TodoHost([_todo_entity("todo.shopping", "购物清单")])
        await host._manage_todo({"action": "add", "item": "牛奶", "due": "2026-11-05"}, AgentActor(user_id="u1"))
        self.assertEqual(
            host.control[0]["service_data"],
            {"item": "牛奶", "due_date": "2026-11-05"},
        )
        await host._manage_todo(
            {"action": "add", "item": "取快递", "due": "2026-11-05 18:30"},
            AgentActor(user_id="u1"),
        )
        self.assertEqual(
            host.control[1]["service_data"],
            {"item": "取快递", "due_datetime": "2026-11-05 18:30"},
        )

    async def test_due_on_complete_is_rejected(self) -> None:
        host = _TodoHost([_todo_entity("todo.shopping", "购物清单")])
        result = await host._manage_todo(
            {"action": "complete", "item": "牛奶", "due": "2026-11-05"},
            AgentActor(user_id="u1"),
        )
        self.assertIn("due", result.get("error", ""))
        self.assertEqual(host.control, [])

    async def test_complete_maps_to_update_item_with_status(self) -> None:
        host = _TodoHost([_todo_entity("todo.shopping", "购物清单")])
        await host._manage_todo({"action": "complete", "item": "牛奶"}, AgentActor(user_id="u1"))
        self.assertEqual(host.control[0]["service"], "update_item")
        self.assertEqual(host.control[0]["service_data"], {"item": "牛奶", "status": "completed"})

    async def test_multiple_lists_ask_back_candidates(self) -> None:
        host = _TodoHost([_todo_entity("todo.a", "购物"), _todo_entity("todo.b", "待办")])
        result = await host._manage_todo({"action": "list"}, AgentActor(user_id="u1"))
        self.assertIn("error", result)
        self.assertEqual(len(result["candidates"]), 2)

    async def test_unreadable_list_is_refused(self) -> None:
        host = _TodoHost([_todo_entity("todo.secret", "私人")], readable=False)
        result = await host._manage_todo({"action": "list", "entity_id": "todo.secret"}, AgentActor(user_id="u1"))
        self.assertIn("无权", result["error"])

    async def test_missing_item_is_an_error(self) -> None:
        host = _TodoHost([_todo_entity("todo.shopping", "购物清单")])
        result = await host._manage_todo({"action": "add"}, AgentActor(user_id="u1"))
        self.assertIn("item", result["error"])


class _CalendarHost(HomeToolsCalendarMixin):
    def __init__(self, entities: list[dict], proxy_result: object = None) -> None:
        self._state_store = _StateStore(entities)
        self._command_proxy = self
        self._proxy_result = {"success": True, "data": {"events": []}} if proxy_result is None else proxy_result
        self.control: list[dict] = []

    def _may_read(self, entity_id: str, actor=None) -> bool:
        return True

    async def _control_device(self, args: dict, actor=None) -> dict:
        self.control.append(args)
        return {"success": True}

    async def call_service(self, args: dict) -> dict:
        self._last_service = args
        return self._proxy_result


def _calendar_entity(entity_id: str = "calendar.family") -> dict:
    return {"entity_id": entity_id, "state": "off", "attributes": {"friendly_name": "家庭日历"}}


class CalendarToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_list_events_extracts_summary(self) -> None:
        host = _CalendarHost(
            [_calendar_entity()],
            proxy_result={
                "success": True,
                "data": {
                    "events": [
                        {
                            "summary": "和物业开会",
                            "start": {"dateTime": "2026-11-04T15:00:00+08:00"},
                            "end": {"dateTime": "2026-11-04T16:00:00+08:00"},
                        }
                    ]
                },
            },
        )
        result = await host._manage_calendar(
            {"action": "list", "start": "2026-11-04T00:00:00+08:00"}, AgentActor(user_id="u1")
        )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["events"][0]["summary"], "和物业开会")
        self.assertEqual(host._last_service["service"], "list_events")

    async def test_create_timed_event_uses_date_time_fields(self) -> None:
        host = _CalendarHost([_calendar_entity()])
        await host._manage_calendar(
            {
                "action": "create",
                "summary": "和物业开会",
                "start": "2026-11-04T15:00:00+08:00",
                "end": "2026-11-04T16:00:00+08:00",
                "location": "物业办公室",
            },
            AgentActor(user_id="u1"),
        )
        data = host.control[0]["service_data"]
        self.assertEqual(host.control[0]["service"], "create_event")
        self.assertIn("start_date_time", data)
        self.assertIn("end_date_time", data)
        self.assertNotIn("start_date", data)
        self.assertEqual(data["location"], "物业办公室")

    async def test_create_all_day_event_uses_date_fields(self) -> None:
        host = _CalendarHost([_calendar_entity()])
        await host._manage_calendar(
            {
                "action": "create",
                "summary": "年假",
                "start": "2026-11-05",
                "end": "2026-11-06",
                "all_day": True,
            },
            AgentActor(user_id="u1"),
        )
        data = host.control[0]["service_data"]
        self.assertEqual(data["start_date"], "2026-11-05")
        self.assertEqual(data["end_date"], "2026-11-06")
        self.assertNotIn("start_date_time", data)

    async def test_create_requires_summary(self) -> None:
        host = _CalendarHost([_calendar_entity()])
        result = await host._manage_calendar(
            {"action": "create", "start": "2026-11-05T10:00:00+08:00"}, AgentActor(user_id="u1")
        )
        self.assertIn("summary", result["error"])

    async def test_end_must_be_after_start(self) -> None:
        host = _CalendarHost([_calendar_entity()])
        result = await host._manage_calendar(
            {
                "action": "create",
                "summary": "x",
                "start": "2026-11-05T10:00:00+08:00",
                "end": "2026-11-05T09:00:00+08:00",
            },
            AgentActor(user_id="u1"),
        )
        self.assertIn("end", result["error"])


class _CameraHost(HomeToolsEntitiesMixin):
    def __init__(self, state: dict) -> None:
        self._state = state

    def _get_entity_state(self, entity_id: str, actor=None) -> dict:
        return dict(self._state)


class CameraSnapshotTest(unittest.TestCase):
    def test_snapshot_url_is_same_origin_and_cache_busted(self) -> None:
        host = _CameraHost({"entity_id": "camera.living", "state": "recording"})
        payload = host._query_camera("camera.living", AgentActor(user_id="u1"))
        self.assertTrue(payload["snapshotUrl"].startswith("/api/camera_proxy/camera.living?hb="))
        self.assertIsInstance(payload["snapshotAt"], int)
        self.assertEqual(payload["state"], "recording")

    def test_non_camera_entity_is_refused(self) -> None:
        payload = _CameraHost({})._query_camera("light.a", None)
        self.assertIn("error", payload)


class _Presence:
    def __init__(self, occupied: set[str] | None = None, anyone: bool = True, count: int = 2) -> None:
        self._occupied = occupied or set()
        self._anyone = anyone
        self._count = count

    def is_anyone_home(self) -> bool:
        return self._anyone

    def get_at_home_count(self) -> int:
        return self._count

    def is_room_occupied(self, name: str) -> bool:
        return name in self._occupied


class _Areas:
    async def find_all(self) -> list[SimpleNamespace]:
        return [SimpleNamespace(id="living", name="客厅"), SimpleNamespace(id="study", name="书房")]


class _HomeMode:
    def get_active(self) -> dict:
        return {"id": "home", "name": "在家"}


class _HomeStatusHost(HomeToolsEntitiesMixin):
    def __init__(self, presence: _Presence | None) -> None:
        self._state_store = _StateStore(
            [
                {"entity_id": "light.living", "state": "on", "attributes": {}},
                {"entity_id": "sensor.temp", "state": "22.5", "attributes": {"device_class": "temperature"}},
            ]
        )
        self._home_mode = _HomeMode()
        self._presence = presence
        self._area_service = _Areas() if presence else None
        self._session_factory = None

    def _may_read(self, entity_id: str, actor=None) -> bool:
        return True


class HomeStatusPresenceTest(unittest.IsolatedAsyncioTestCase):
    async def test_reports_anyone_home_and_occupied_rooms(self) -> None:
        host = _HomeStatusHost(_Presence(occupied={"客厅"}))
        payload = await host._get_home_status(AgentActor(user_id="u1"))
        self.assertIs(payload["anyone_home"], True)
        self.assertEqual(payload["at_home_count"], 2)
        self.assertEqual(payload["occupied_rooms"], ["客厅"])
        # 只给房间名，不带成员姓名
        self.assertNotIn("members", payload)

    async def test_restricted_actor_gets_no_occupancy(self) -> None:
        host = _HomeStatusHost(_Presence(occupied={"客厅"}))
        payload = await host._get_home_status(AgentActor(user_id="u1", restrictions=["area:living"]))
        self.assertNotIn("anyone_home", payload)
        self.assertNotIn("occupied_rooms", payload)

    async def test_no_presence_service_keeps_old_payload(self) -> None:
        payload = await _HomeStatusHost(None)._get_home_status(AgentActor(user_id="u1"))
        self.assertNotIn("anyone_home", payload)
        self.assertEqual(payload["lights_on"], 1)


class _MemoryHost(HomeToolsMemoryMixin):
    def __init__(self, memory: AgentMemoryService | None = None) -> None:
        self._memory = memory or AgentMemoryService()


class MemoryToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_requires_actor(self) -> None:
        result = await _MemoryHost()._manage_memory({"action": "remember", "content": "怕冷"}, None)
        self.assertIs(result["blocked"], True)

    async def test_remember_then_forget(self) -> None:
        memory = AgentMemoryService()
        host = _MemoryHost(memory)
        actor = AgentActor(user_id="u1")
        saved = await host._manage_memory({"action": "remember", "content": "睡觉喜欢把灯调到 20%"}, actor)
        self.assertIs(saved["success"], True)
        items = memory.list_memories("user:u1")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["kind"], "preference")
        self.assertEqual(items[0]["value"], "睡觉喜欢把灯调到 20%")

        forgotten = await host._manage_memory({"action": "forget", "content": "睡觉喜欢把灯调到 20%"}, actor)
        self.assertIs(forgotten["removed"], True)
        self.assertEqual(memory.list_memories("user:u1"), [])

    async def test_same_content_overwrites_instead_of_stacking(self) -> None:
        memory = AgentMemoryService()
        host = _MemoryHost(memory)
        actor = AgentActor(user_id="u1")
        await host._manage_memory({"action": "remember", "content": "怕冷"}, actor)
        await host._manage_memory({"action": "remember", "content": "怕冷"}, actor)
        self.assertEqual(len(memory.list_memories("user:u1")), 1)

    async def test_limit_blocks_new_preferences(self) -> None:
        memory = AgentMemoryService()
        host = _MemoryHost(memory)
        actor = AgentActor(user_id="u1")
        for index in range(50):
            memory.remember("user:u1", f"pref:p{index}", f"偏好 {index}", kind="preference")
        result = await host._manage_memory({"action": "remember", "content": "新偏好"}, actor)
        self.assertIs(result["blocked"], True)
        self.assertIn("50", result["message"])

    async def test_scope_is_per_user(self) -> None:
        memory = AgentMemoryService()
        host = _MemoryHost(memory)
        await host._manage_memory({"action": "remember", "content": "怕冷"}, AgentActor(user_id="u1"))
        self.assertEqual(memory.list_memories("user:u2"), [])


class ActionPromptSerializationTest(unittest.TestCase):
    def test_action_prompt_is_exposed_to_clients(self) -> None:
        from src.domains.notification.stats import map_notification_row

        row = SimpleNamespace(
            id="n1",
            level="info",
            message="客厅灯一直开着",
            entity_id=None,
            source="agent-watchdog",
            read=False,
            created_at=None,
            delivered_at=None,
            delivery_channels="[]",
            action_prompt="关掉客厅里一直开着的灯",
        )
        payload = map_notification_row(row)
        self.assertEqual(payload["actionPrompt"], "关掉客厅里一直开着的灯")

    def test_missing_action_prompt_is_omitted(self) -> None:
        from src.domains.notification.stats import map_notification_row

        row = SimpleNamespace(
            id="n1",
            level="info",
            message="x",
            entity_id=None,
            source="system",
            read=True,
            created_at=None,
            delivered_at=None,
            delivery_channels="[]",
        )
        self.assertNotIn("actionPrompt", map_notification_row(row))

    def test_migration_adds_column_idempotently(self) -> None:
        import sqlite3

        from src.platform.core.db.migrations import _add_notification_action_prompt

        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        connection.execute("CREATE TABLE notifications (id TEXT)")
        _add_notification_action_prompt(connection, None)  # type: ignore[arg-type]
        _add_notification_action_prompt(connection, None)  # type: ignore[arg-type]
        columns = {str(row[1]) for row in connection.execute('PRAGMA table_info("notifications")')}
        self.assertIn("actionPrompt", columns)


if __name__ == "__main__":
    unittest.main()
