"""Home Assistant 实体状态的内存中枢与订阅分发。 连接器把 HA 推来的原始状态归一成前端约定的 camelCase 结构后存在这里，再由 WebSocket / SSE 端点 通过订阅队列实时取走，避免每个前端连接各自去 HA 拉一次状态。"""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from copy import deepcopy
from typing import Any


class StateHub:

    def __init__(self) -> None:
        self._states = {}
        self._subscribers = set()
        self._subscriber_entities = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        entity_id = str(raw.get("entity_id", ""))
        state = str(raw.get("state", "unknown"))
        return {
            "type": "state_changed",
            "entityId": entity_id,
            "domain": entity_id.partition(".")[0],
            "state": state,
            "attributes": deepcopy(raw.get("attributes") or {}),
            "available": state not in {"unknown", "unavailable"},
            "lastChanged": raw.get("last_changed"),
            "updatedAt": raw.get("last_updated") or raw.get("last_changed"),
        }

    async def replace(self, states: Iterable[dict[str, Any]]) -> None:
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            removed = sorted(set(self._states) - set(normalized))
            self._states = normalized
        for entity_id in removed:
            await self.publish({"type": "state_removed", "entityId": entity_id})

    async def merge(self, states: Iterable[dict[str, Any]]) -> None:
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            self._states.update(normalized)

    async def update(self, raw: dict[str, Any]) -> dict[str, Any] | None:
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
        async with self._lock:
            if entity_ids is None:
                values = self._states.values()
            else:
                values = (
                    self._states[key] for key in entity_ids if key in self._states
                )
            return deepcopy(list(values))

    async def entity_ids(self) -> set[str]:
        async with self._lock:
            return set(self._states)

    async def retain(self, entity_ids: set[str]) -> None:
        async with self._lock:
            self._states = {
                key: value
                for key, value in self._states.items()
                if key in entity_ids
            }

    async def remove(self, entity_id: str) -> None:
        normalized = str(entity_id or "")
        if not normalized:
            return
        async with self._lock:
            self._states.pop(normalized, None)
        await self.publish({"type": "state_removed", "entityId": normalized})

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue = asyncio.Queue(maxsize=512)
        self._subscribers.add(queue)
        self._subscriber_entities[queue] = None
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)
        self._subscriber_entities.pop(queue, None)

    def set_subscription_entities(
        self, queue: asyncio.Queue[dict[str, Any]], entity_ids: set[str]
    ) -> None:
        """Limit incremental state events delivered to one subscriber.

        Events queued before the subscription was validated belong to the
        handshake window. The following snapshot is authoritative, so those
        stale events are discarded before runtime processing starts.
        """
        if queue not in self._subscribers:
            return
        self._subscriber_entities[queue] = set(entity_ids)
        try:
            while True:
                queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        return

    async def publish(self, event: dict[str, Any]) -> None:
        for queue in tuple(self._subscribers):
            event_type = event.get("type")
            if event_type in {"state_changed", "state_removed"}:
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
            queue.put_nowait(deepcopy(event))
