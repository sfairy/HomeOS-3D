"""Home Assistant 实体状态的内存中枢与订阅分发。 连接器把 HA 推来的原始状态归一成前端约定的 camelCase 结构后存在这里，再由 WebSocket / SSE 端点 通过订阅队列实时取走，避免每个前端连接各自去 HA 拉一次状态。"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable, Iterable
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from ....platform.core.runtime.observability import record_ha_counter

LOGGER = logging.getLogger(__name__)

#: 是否恢复「发布时深拷贝整份载荷」的旧行为（默认关闭 = 共享同一份只读快照）。
#: 共享后订阅方必须只读：队列里的 dict 就是 hub 内存里的同一对象；要回滚就设该 env。
STATE_HUB_COPY_PAYLOAD_ENV = 'HOMEOS_HA_STATE_HUB_COPY_PAYLOAD'
_TRUTHY = frozenset({'1', 'true', 'yes', 'on'})


def resolve_state_hub_copy_payload() -> bool:
    """读取回滚开关：``HOMEOS_HA_STATE_HUB_COPY_PAYLOAD=1`` 时恢复逐事件深拷贝。"""
    raw = os.getenv(STATE_HUB_COPY_PAYLOAD_ENV)
    return raw is not None and raw.strip().lower() in _TRUTHY


#: 状态值本身没有语义的"服务型实体"：常态 ``unknown`` 不等于掉线。
#:
#: 这些集成（语音引擎、通知、AI 任务、红外/射频、对话代理）上报的 ``state``
#: 只是占位，真正的能力在属性里。把它们当 ``unavailable`` 会让附加面板整块禁用。
STATELESS_DOMAINS = frozenset(
    {'stt', 'tts', 'cover', 'notify', 'ai_task', 'infrared', 'wake_word', 'conversation', 'radio_frequency'}
)

#: 按 ``entityId`` 过滤订阅的事件类型：``cover_memory_changed`` 只带实体号，
#: 墙屏按订阅的实体集合决定要不要重取姿态历史。
ENTITY_SCOPED_EVENT_TYPES = frozenset({'state_changed', 'state_removed', 'cover_memory_changed'})


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

    def __init__(self, *, observe: Callable[[Iterable[dict[str, Any]]], None] | None = None) -> None:
        #: 观察回调（同步）：每次状态写入后把规范化后的状态交给它（窗帘姿态历史用）。
        #: 刻意不是协程：它只做内存更新 + 节流写盘，不参与状态分发链路。
        self._observe = observe
        #: 当前状态来源的标识（连接作用域）。``CoverMemory.observe`` 用它丢弃
        #: 上一轮连接迟到的状态 —— 换了 HA 之后旧连接的事件不该写进新连接的历史。
        self.source_key = ''
        self._states = {}
        self._subscribers = set()
        self._subscriber_entities = {}
        self._lock = asyncio.Lock()
        # 进行中的「批量取状态」窗口；key 是 StateFetchChanges 的 id()（生命周期只在窗口内），
        # value 是该窗口的变更记录，见 track_fetch_changes / _mark_fetch_changes。
        self._fetch_changes = {}
        #: 发布载荷是否逐事件深拷贝（B20 回滚开关）：默认共享同一份只读快照，
        #: 一次状态更新只保留 normalize 里 attributes 的那一次深拷贝。
        self._copy_payload = resolve_state_hub_copy_payload()

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
        # unknown 要分域看：按钮/场景/输入按钮空闲时常态就是 unknown，仍算可用。
        # 但同时要求原始 state 真的是字符串 "unknown" —— 字段整个缺失时也归一成
        # unknown，那种情况说明状态还没到齐，仍按不可用处理。
        available = state != "unavailable" and (
            state != "unknown"
            or (
                domain in {"scene", "button", "input_button"}
                and raw.get("state") == "unknown"
            )
        )
        normalized = {
            "type": "state_changed",
            "entityId": entity_id,
            "domain": domain,
            "state": state,
            "attributes": deepcopy(raw.get("attributes") or {}),
            "available": available,
            "lastChanged": raw.get("last_changed"),
            "updatedAt": raw.get("last_updated") or raw.get("last_changed"),
        }
        # 服务型实体（tts / notify / conversation …）常态就是 unknown：available 仍为
        # False，但用 availabilityReason 标记「这是空闲，不是掉线」，前端据此仍可操作。
        if (
            domain in STATELESS_DOMAINS
            and raw.get("state") == "unknown"
            and raw.get("available") is not False
        ):
            normalized["availabilityReason"] = "unknown"
        attributes = normalized["attributes"]
        # event.* 无最新事件时 HA 也是 unknown；只有声明了 event_types 且当前没有
        # event_type 才算「事件空闲」，否则仍按真不可用处理。
        if (
            domain == "event"
            and raw.get("state") == "unknown"
            and raw.get("available") is not False
            and isinstance(attributes.get("event_types"), list)
            and attributes["event_types"]
            and attributes.get("event_type") is None
        ):
            normalized["availabilityReason"] = "event-idle"
        return normalized

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
        self._notify_observe(normalized.values())
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
        self._notify_observe(normalized.values())

    async def update(self, raw: dict[str, Any]) -> dict[str, Any] | None:
        normalized = self.normalize(raw)
        if not normalized["entityId"]:
            return None
        async with self._lock:
            # 登记这次写入，让进行中的取数窗口不要用更旧的返回值盖掉它。
            self._mark_fetch_changes({normalized["entityId"]})
            self._states[normalized["entityId"]] = normalized
        self._notify_observe((normalized,))
        await self.publish(normalized)
        return normalized

    def _notify_observe(self, states: Iterable[dict[str, Any]]) -> None:
        """把状态交给观察回调；回调异常绝不能影响状态分发主链路。"""
        observe = self._observe
        if observe is None:
            return
        try:
            observe(states)
        except Exception:
            LOGGER.warning('状态观察回调失败（忽略，不影响状态分发）', exc_info=True)

    async def snapshot(
        self, entity_ids: set[str] | None = None
    ) -> list[dict[str, Any]]:
        """返回内存状态的只读视图列表。

        默认与 hub 共享同一批 dict（不深拷贝）：调用方只允许读取/序列化，不得原地修改
        ``attributes`` 等嵌套字段。需要旧行为时设 ``HOMEOS_HA_STATE_HUB_COPY_PAYLOAD=1``。
        """
        async with self._lock:
            if entity_ids is None:
                values = self._states.values()
            else:
                values = (
                    self._states[key] for key in entity_ids if key in self._states
                )
            states = list(values)
        return deepcopy(states) if self._copy_payload else states

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
        """把一次状态事件投递给所有订阅队列（默认共享同一份只读载荷）。

        默认直接把 ``event`` 本身入队：订阅方（/ws/runtime）只读取并交给序列化，不会
        原地修改；normalize 已为 ``attributes`` 深拷贝过一次，这里再整份深拷贝等于每事件
        拷两遍，是状态推送热路径上一笔可观的纯 CPU。回滚：
        ``HOMEOS_HA_STATE_HUB_COPY_PAYLOAD=1`` 恢复旧行为。
        """
        payload = deepcopy(event) if self._copy_payload else event
        event_type = payload.get("type")
        entity_id = payload.get("entityId")
        for queue in tuple(self._subscribers):
            if event_type in ENTITY_SCOPED_EVENT_TYPES:
                subscribed_entities = self._subscriber_entities.get(queue)
                if subscribed_entities is not None and entity_id not in subscribed_entities:
                    continue
            if queue.full():
                # 队列满时不再「整队清空 + 只补一条 resync_required」：那会让前端断开
                # 重连并重新拉全量快照，高频源（功率/电量/毫米波）叠加时足以形成抖动循环。
                # 改为按实体合并（每个实体保留最后一条）后放回，容量实在不够才软重同步。
                self._compact_queue(queue, payload)
                continue
            queue.put_nowait(payload)

    @staticmethod
    def _compact_queue(queue: asyncio.Queue[dict[str, Any]], incoming: dict[str, Any]) -> None:
        """队列溢出时的合并降级：按实体保留最后一条，避免「清空 + 全量重拉」的抖动。"""
        buffered: list[dict[str, Any]] = []
        while True:
            try:
                buffered.append(queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        buffered.append(incoming)
        merged: list[dict[str, Any]] = []
        positions: dict[str, int] = {}
        for event in buffered:
            if event.get("type") == "state_changed" and event.get("entityId"):
                entity_id = str(event["entityId"])
                if entity_id in positions:
                    merged[positions[entity_id]] = event
                    continue
                positions[entity_id] = len(merged)
            merged.append(event)
        for event in merged:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # 合并后仍装不下（订阅实体数接近上限）：清空并让前端做一次软重同步。
                while True:
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                queue.put_nowait({"type": "resync_required"})
                record_ha_counter('resync')
                return
