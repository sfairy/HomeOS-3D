"""Home Assistant 实体状态的内存中枢与订阅分发。
"""
from __future__ import annotations

import asyncio
from collections.abc import Iterable
from copy import deepcopy
from typing import Any


class StateHub:
    """实体状态内存表 + 订阅者分发器。"""

    def __init__(self) -> None:
        """建立空的实体状态表与订阅者集合。"""
        # entityId -> 归一化后的状态字典。
        self._states = {}
        self._subscribers = set()
        # 队列 -> 该订阅者关心的实体集合；None 表示尚未完成握手、暂时全量接收。
        self._subscriber_entities = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        """把 HA 的原始状态对象转成前端协议结构。
        """
        entity_id = str(raw.get("entity_id", ""))
        # state 缺失时按 unknown 处理：HA 在某些不可用场景下会省掉该字段，
        state = str(raw.get("state", "unknown"))
        return {
            "type": "state_changed",
            "entityId": entity_id,
            # 域用于前端快速判断控件类型，前端不再自己切分实体 ID。
            "domain": entity_id.partition(".")[0],
            "state": state,
            # deepcopy：原始字典来自网络消息，深拷一份防止后续被复用/改写。
            "attributes": deepcopy(raw.get("attributes") or {}),
            # 只有 unknown / unavailable（含大小写差异）才算不可用。
            "available": state not in frozenset({"unknown", "unavailable"}),
            "lastChanged": raw.get("last_changed"),
            # updatedAt 优先取 last_updated，缺失时退化为 last_changed。
            "updatedAt": raw.get("last_updated") or raw.get("last_changed"),
        }

    async def replace(self, states: Iterable[dict[str, Any]]) -> None:
        """用一份完整快照整体替换内存状态，并通知被移除的实体。
        """
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            removed = sorted(set(self._states) - set(normalized))
            # 先整体换表再发通知：期间到达的 update 会写进新表，不会被随后覆盖。
            self._states = normalized
        # 通知放在锁外发送：publish 是 async 的，持锁等待订阅者会阻塞其它读写。
        for entity_id in removed:
            await self.publish({"type": "state_removed", "entityId": entity_id})

    async def merge(self, states: Iterable[dict[str, Any]]) -> None:
        """把若干状态合并进内存表，不删除任何已有实体，也不发通知。
        """
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            self._states.update(normalized)

    async def update(self, raw: dict[str, Any]) -> dict[str, Any] | None:
        """写入单个实体的最新状态，并立即广播。
        """
        normalized = self.normalize(raw)
        if not normalized["entityId"]:
            return None
        async with self._lock:
            self._states[normalized["entityId"]] = normalized
        await self.publish(normalized)
        return normalized

    async def snapshot(
        self, entity_ids: set[str] | None = None
    ) -> list[dict[str, Any]]:
        """取状态快照（深拷贝，调用方可随意改写）。
        """
        async with self._lock:
            if entity_ids is None:
                values = self._states.values()
            else:
                values = (
                    self._states[key] for key in entity_ids if key in self._states
                )
            return deepcopy(list(values))

    async def entity_ids(self) -> set[str]:
        """当前内存里所有实体 ID 的副本。"""
        async with self._lock:
            return set(self._states)

    async def retain(self, entity_ids: set[str]) -> None:
        """只保留给定实体，其余从内存丢弃（不发 state_removed）。
        """
        async with self._lock:
            self._states = {
                key: value
                for key, value in self._states.items()
                if key in entity_ids
            }

    async def remove(self, entity_id: str) -> None:
        """删除单个实体并广播 state_removed（实体被 HA 移除时调用）。"""
        normalized = str(entity_id or "")
        if not normalized:
            return None
        async with self._lock:
            self._states.pop(normalized, None)
        await self.publish({"type": "state_removed", "entityId": normalized})

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        """登记一个新订阅者并返回它的事件队列。
        """
        queue = asyncio.Queue(maxsize=512)
        self._subscribers.add(queue)
        # 初始为 None：表示「握手未完成，先全量接收」，见 set_subscription_entities。
        self._subscriber_entities[queue] = None
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)
        self._subscriber_entities.pop(queue, None)

    def set_subscription_entities(
        self, queue: asyncio.Queue[dict[str, Any]], entity_ids: set[str]
    ) -> None:
        """限制某个订阅者能收到的增量状态事件。
        """
        if queue not in self._subscribers:
            return None
        self._subscriber_entities[queue] = set(entity_ids)
        # 队列已空：这个循环本来就靠 QueueEmpty 退出，属预期终止而非异常。
        try:
            while True:
                queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        return None

    async def publish(self, event: dict[str, Any]) -> None:
        """把事件分发给所有订阅者。
        """
        # tuple(...)：publish 是 async 的，遍历期间可能有订阅者退订；
        for queue in tuple(self._subscribers):
            event_type = event.get("type")
            if event_type in frozenset({"state_changed", "state_removed"}):
                subscribed_entities = self._subscriber_entities.get(queue)
                if (
                    subscribed_entities is not None
                    and event.get("entityId") not in subscribed_entities
                ):
                    continue
            if queue.full():
                try:
                    while True:
                        queue.get_nowait()
                except asyncio.QueueEmpty:
                    queue.put_nowait({"type": "resync_required"})
                    continue
            # deepcopy：多个订阅者共享同一事件对象，谁也不能改到别人的副本。
            queue.put_nowait(deepcopy(event))
