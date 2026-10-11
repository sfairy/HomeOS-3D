"""Home Assistant 实体状态的内存中枢与订阅分发。 连接器把 HA 推来的原始状态归一成前端约定的 camelCase 结构后存在这里，再由 WebSocket / SSE 端点 通过订阅队列实时取走，避免每个前端连接各自去 HA 拉一次状态。"""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StateFetchChanges:
    """一次「批量取状态」窗口内发生的并发变更记录。

    背景：批量取状态是「先请求、后写回」，HA 的返回可能在请求期间就已经过期 —— 期间到达的
    实时事件（``update``）才是更新的值。用这份记录告诉写回方：哪些实体在窗口内被改过，
    写回时必须保留内存里的新值。

    ``requested`` 是本次批量请求涉及的实体，``None`` 表示不限（整表替换用）；
    ``changed`` 是窗口内被实时事件改写过的实体；``replaced`` 表示窗口内已经发生过一次
    整表替换，之后所有实体都按「已变更」处理。
    """

    requested: set[str] | None
    changed: set[str] = field(default_factory=set)
    replaced: bool = False

    def preserves(self, entity_id: str) -> bool:
        """写回这份快照时，该实体是否应保留内存里的现有值。"""
        return self.replaced or entity_id in self.changed


class StateHub:

    def __init__(self) -> None:
        self._states = {}
        self._subscribers = set()
        self._subscriber_entities = {}
        self._lock = asyncio.Lock()
        # 进行中的「批量取状态」窗口；key 是 StateFetchChanges 的 id()（生命周期只在窗口内），
        # value 是该窗口的变更记录，见 track_fetch_changes / _mark_fetch_changes。
        self._fetch_changes = {}

    @asynccontextmanager
    async def track_fetch_changes(self, entity_ids: set[str] | None = None):
        """开一个「批量取状态」窗口，退出时自动注销。

        ``entity_ids`` 为空表示不限范围（整表替换用）；窗口对象本身作为「本次取数的结果是否
        该写回」的凭据，传给 ``replace`` / ``merge``。
        """
        changes = StateFetchChanges(set(entity_ids) if entity_ids is not None else None)
        async with self._lock:
            self._fetch_changes[id(changes)] = changes
        try:
            yield changes
        finally:
            # 用 id() 而不是对象本身：这个对象只在本窗口内有意义。
            self._fetch_changes.pop(id(changes), None)

    def _mark_fetch_changes(self, entity_ids: set[str]) -> None:
        """把一批实体的变更登记到所有进行中的取数窗口里。

        每个窗口有自己的 ``requested`` 范围，只登记它关心的那部分：否则补拉 A 状态的结果
        会把正在整表替换的窗口也标脏，导致那次替换白做。
        """
        for changes in self._fetch_changes.values():
            changes.changed.update(entity_ids if changes.requested is None else changes.requested & entity_ids)

    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        entity_id = str(raw.get("entity_id", ""))
        state = str(raw.get("state", "unknown"))
        domain = entity_id.partition(".")[0]
        return {
            "type": "state_changed",
            "entityId": entity_id,
            "domain": domain,
            "state": state,
            "attributes": deepcopy(raw.get("attributes") or {}),
            # unknown 要分域看：按钮/输入按钮/事件实体空闲时常态就是 unknown，仍算可用。
            # event.* 无最新事件时 HA 也是 unknown，不能当成设备掉线。
            # 但同时要求原始 state 真的是字符串 "unknown" —— 字段整个缺失时也归一成
            # unknown，那种情况说明状态还没到齐，仍按不可用处理。
            "available": (
                state != "unavailable"
                and (
                    state != "unknown"
                    or (
                        domain in {"button", "input_button", "event"}
                        and raw.get("state") == "unknown"
                    )
                )
            ),
            # 供前端区分「事件实体空闲」与真不可用（对齐 0.7.2 availabilityReason）
            **(
                {"availabilityReason": "event-idle"}
                if domain == "event" and raw.get("state") == "unknown"
                else {}
            ),
            "lastChanged": raw.get("last_changed"),
            "updatedAt": raw.get("last_updated") or raw.get("last_changed"),
        }

    async def replace(self, states: Iterable[dict[str, Any]], *, invalidated: StateFetchChanges | None = None) -> None:
        """用一份完整快照整体替换内存状态，并通知被移除的实体。

        ``invalidated`` 给了就保住窗口内被实时事件改写过的实体，不让这份可能已过期的快照
        把它们覆盖掉。
        """
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            if invalidated is not None:
                # 先剔除「窗口内被改写」的实体，再把内存里这些实体的最新值补回去。
                normalized = {
                    key: value
                    for key, value in normalized.items()
                    if not invalidated.preserves(key)
                }
                normalized.update({
                    key: value
                    for key, value in self._states.items()
                    if invalidated.preserves(key)
                })
            removed = sorted(set(self._states) - set(normalized))
            # 整表替换是权威数据：正在取数的窗口不必再纠结谁更新，全部按已变更处理。
            for changes in self._fetch_changes.values():
                changes.replaced = True
            self._states = normalized
        for entity_id in removed:
            await self.publish({"type": "state_removed", "entityId": entity_id})

    async def merge(self, states: Iterable[dict[str, Any]], *, invalidated: StateFetchChanges | None = None) -> None:
        """把若干状态合并进内存表，不删除任何已有实体，也不发通知。

        ``invalidated`` 里被改写过的实体会被跳过，只写回没被别人改过的值。
        """
        normalized = {
            item["entityId"]: item
            for item in (self.normalize(raw) for raw in states)
            if item["entityId"]
        }
        async with self._lock:
            if invalidated is not None:
                normalized = {
                    key: value
                    for key, value in normalized.items()
                    if not invalidated.preserves(key)
                }
                # 这批量取回来的值是 HA 直接给的，比任何窗口内已有的记录都权威，
                # 登记给其它窗口，避免它们随后用更旧的值覆盖。
                self._mark_fetch_changes(set(normalized))
            self._states.update(normalized)

    async def update(self, raw: dict[str, Any]) -> dict[str, Any] | None:
        normalized = self.normalize(raw)
        if not normalized["entityId"]:
            return None
        async with self._lock:
            # 登记这次写入，让进行中的取数窗口不要用更旧的返回值盖掉它。
            self._mark_fetch_changes({normalized["entityId"]})
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
            # 被丢弃的实体里，包含「正在取数窗口里被请求、但已不在保留集合中」的那些：
            # 它们已经从内存删掉，若取数窗口随后写回，就会把一个已被遗忘的实体带回来。
            removed = set(self._states) - entity_ids
            for changes in self._fetch_changes.values():
                if changes.requested is None:
                    continue
                removed.update(changes.requested - entity_ids)
            self._mark_fetch_changes(removed)
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
            self._mark_fetch_changes({normalized})
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
        """限制投递给单个订阅者的增量状态事件。

        订阅校验完成之前排队的事件属于握手窗口期。随后的快照才是权威数据，
        因此在运行时处理开始前会丢弃这些过期事件。
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
