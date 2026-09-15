"""Home Assistant 实体状态的内存中枢与订阅分发。

连接器把 HA 推来的原始状态归一成前端约定的 camelCase 结构后存在这里，
再由 WebSocket / SSE 端点通过订阅队列实时取走，避免每个前端连接各自
去 HA 拉一次状态。

三条约定：
- 状态字典的字段名（entityId / lastChanged / updatedAt …）是与前端
  约定死的协议，改动等于改协议；
- 所有对 `_states` / `_subscribers` / `_subscriber_entities` 的读写都在
  `_lock` 保护下进行，因为这些方法会被多个 asyncio 任务并发调用；
- 订阅队列有界（见 `subscribe`），满了就丢旧事件并补一个全量重同步信号，
  宁可让前端重新拉一次快照，也不让慢消费者拖垮连接器。
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
        # 订阅者队列集合；用 set 是因为退订只需 O(1) 丢弃，不关心顺序。
        self._subscribers = set()
        # 队列 -> 该订阅者关心的实体集合；None 表示尚未完成握手、暂时全量接收。
        self._subscriber_entities = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def normalize(raw: dict[str, Any]) -> dict[str, Any]:
        """把 HA 的原始状态对象转成前端协议结构。

        参数:
            raw: HA `/api/states` 或 `state_changed` 事件里的 new_state 字典。

        返回:
            键名全部为 camelCase 的状态字典；缺字段时给出安全默认值，
            调用方仍需自行判断 entityId 是否为空。
        """
        entity_id = str(raw.get("entity_id", ""))
        # state 缺失时按 unknown 处理：HA 在某些不可用场景下会省掉该字段，
        # 用 unknown 可以让下游统一走「不可用」分支，而不是拿到空串。
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

        全量对账（`sync_once`）后使用：只有当次快照里出现的实体才留在内存中，
        因此差异部分要逐个发 `state_removed`，否则前端会一直显示已删除的实体。

        参数:
            states: HA 原始状态列表（未归一化）。
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

        补拉（`ensure_entity_states`）后使用：这里只负责让内存里有值，
        推送交给随后的订阅者按需读取，避免补拉引起前端整屏刷新。
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

        参数:
            raw: HA 推送的 new_state 原始字典。

        返回:
            归一化后的状态字典；entityId 为空时返回 None（不写也不推）。
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

        参数:
            entity_ids: 只取这些实体；为 None 时返回全部。
        """
        async with self._lock:
            if entity_ids is None:
                values = self._states.values()
            else:
                values = (
                    self._states[key] for key in entity_ids if key in self._states
                )
            # 生成器在锁内消费完再深拷，避免锁外迭代正在被并发修改的字典。
            return deepcopy(list(values))

    async def entity_ids(self) -> set[str]:
        """当前内存里所有实体 ID 的副本。"""
        async with self._lock:
            return set(self._states)

    async def retain(self, entity_ids: set[str]) -> None:
        """只保留给定实体，其余从内存丢弃（不发 state_removed）。

        用于「没人再看这些实体」时的清理：前端此时已不再订阅，
        逐条广播删除事件没有意义，还容易在页面切换瞬间造成闪烁。
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

        队列容量 512 是刻意设的上限：慢前端（页面隐藏、网络卡顿）不能
        无限堆积事件吃内存，写满时由 publish 侧丢旧保新并补全量重同步。
        """
        queue = asyncio.Queue(maxsize=512)
        self._subscribers.add(queue)
        # 初始为 None：表示「握手未完成，先全量接收」，见 set_subscription_entities。
        self._subscriber_entities[queue] = None
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """注销订阅者；连接断开时必须调用，否则 publish 会一直往死队列写。"""
        self._subscribers.discard(queue)
        self._subscriber_entities.pop(queue, None)

    def set_subscription_entities(
        self, queue: asyncio.Queue[dict[str, Any]], entity_ids: set[str]
    ) -> None:
        """限制某个订阅者能收到的增量状态事件。

        握手窗口期内（订阅尚未校验）排队的事件属于协议协商阶段，
        随后的快照才是权威数据，因此这里先丢弃这些陈旧事件，
        再开始运行期处理，防止前端收到比快照更早的过期状态。

        参数:
            queue: 订阅者队列；不在 `_subscribers` 中时静默忽略。
            entity_ids: 该订阅者关心的实体集合。
        """
        if queue not in self._subscribers:
            return None
        self._subscriber_entities[queue] = set(entity_ids)
        try:
            while True:
                queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        return None

    async def publish(self, event: dict[str, Any]) -> None:
        """把事件分发给所有订阅者。

        分发规则：
        - 只有状态类事件（state_changed / state_removed）会按实体过滤；
          目录变更等广播事件对所有订阅者可见；
        - `_subscriber_entities` 为 None 表示该订阅者还没完成握手，此时不过滤；
        - 队列满时清空并压入 resync_required，让前端丢弃增量、重新拉全量快照，
          这比继续丢事件更安全（丢事件会让界面停在错误状态）。
        """
        # tuple(...)：publish 是 async 的，遍历期间可能有订阅者退订；
        # 先拷一份固定列表，避免 RuntimeError: Set changed size during iteration。
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
