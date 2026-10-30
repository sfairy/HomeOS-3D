"""实时状态事件的合并队列：把同一实体在一个窗口内的多次变化压成一批再落地。

为什么需要：HA 在场景切换 / 全屋开关 / 状态重算时会一次推送几十上百条 ``state_changed``。
逐条处理时，每条事件都要过一次数据库事务（``_apply_incremental_state`` 一次 session +
commit）外发一次监听回调，墙屏的 socket.io 广播也随之被拆成 N 次小事件 —— 卡顿和写放大
都出在这里。

合并语义刻意保持「逐条等价」：同一实体在一个窗口内只保留**首包的 old_state** 与
**末包的 new_state**，监听器看到的是从首态到末态的一次变化；不同实体互不影响，
批内顺序按首次出现排列。

窗口、批大小、积压上限都由构造参数决定（``haConnector.liveEventBatchWindowMs`` 见
``service_live._live_event_batch_window``）；窗口 0 表示不合并。
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import time
from typing import Any

from .service_support import LOGGER

#: 合并窗口（毫秒）：比一次墙屏帧（16ms）略长，又不至于让人感觉到延迟。
LIVE_EVENT_BATCH_WINDOW_MS = 50
#: 单个批次最多合并多少条：再大就分多次落地，避免一次事务过大。
LIVE_EVENT_BATCH_MAX_SIZE = 200
#: 待合并队列上限：HA 刷屏时宁可丢最旧的推送（下一轮全量对账会补），也不让内存无界增长。
LIVE_EVENT_PENDING_MAX = 2_000

#: 关键控制域的专用合并窗口（毫秒）。
#:
#: 为什么单独给：``LIVE_EVENT_BATCH_WINDOW_MS`` 是拿「传感器刷屏」换「事务次数」的取舍，
#: 对灯光/开关这类**用户手势的直接反馈**却是纯延迟 —— 点一下灯要白等最多 50ms（实测
#: p50 也要 ~29ms）才可能被推送。这里给关键域一个帧级的短窗口：既保留「同一次操作
#: 涉及多个实体时合批」的能力，又不会让人感觉到延迟。
LIVE_EVENT_CRITICAL_WINDOW_MS = 4
#: 关键域默认清单，与 ``wsPush.criticalDomains`` 默认值一致（配置会覆盖）。
LIVE_EVENT_CRITICAL_DOMAINS: frozenset[str] = frozenset(
    {'light', 'switch', 'cover', 'climate', 'media_player', 'fan', 'lock'}
)


def entity_domain(entity_id: str | None) -> str:
    """``light.kitchen`` → ``light``（无点号时返回空串）。"""
    if not entity_id:
        return ''
    head, sep, _ = str(entity_id).partition('.')
    return head if sep else ''



def live_state_change(message: dict[str, Any]) -> dict[str, Any] | None:
    """把一条 HA ``state_changed`` WS 消息折成监听器契约里的 change 字典。

    返回 ``None`` 表示这条消息不该进合并队列（不是事件 / 不是 state_changed /
    缺 data），调用方按原路径即时处理。

    ``entity_id`` 只在有 ``new_state`` 时有值 —— 与逐条路径一致；实体被删除时
    ``new_state`` 为 None，删除动作由 ``removed_entity_id`` 单独带出（该字段只在本模块
    内部使用，外发前会被剥掉，见 ``service_live._flush_live_state_changes``）。
    """
    if not isinstance(message, dict) or message.get('type') != 'event':
        return None
    event = message.get('event')
    if not isinstance(event, dict) or event.get('event_type') != 'state_changed':
        return None
    data = event.get('data')
    if not isinstance(data, dict):
        return None
    new_state = data.get('new_state')
    removed_entity_id: str | None = None
    if isinstance(new_state, dict):
        entity_id = str(new_state.get('entity_id') or '') or None
    else:
        entity_id = None
        removed_entity_id = str(data.get('entity_id') or '') or None
    # 注意：entity_id 与 removed_entity_id 都为空时仍要入队 —— 逐条路径对这类畸形事件
    # 也会照发一次 change（entity_id=None），这里保持同一语义，不做静默丢弃。
    return {
        'entity_id': entity_id,
        'old_state': data.get('old_state'),
        'new_state': new_state,
        'time_fired': event.get('time_fired'),
        'removed_entity_id': removed_entity_id,
        # 入队时刻（单调时钟）：供「合并队列停留」指标计算，也用于诊断长尾。
        'received_at': time.monotonic(),
    }


class LiveStateEventQueue:
    """单 worker 的合并队列：``enqueue`` 同步不阻塞 recv 循环，flush 由回调落地。

    ``enqueue`` 必须是同步的：它跑在 WebSocket 收包循环里，任何 await 都会让后续
    ACK / 心跳的处理排在数据库事务后面。
    """

    def __init__(
        self,
        flush: Any,
        *,
        window_seconds: float = LIVE_EVENT_BATCH_WINDOW_MS / 1000.0,
        max_batch_size: int = LIVE_EVENT_BATCH_MAX_SIZE,
        max_pending: int = LIVE_EVENT_PENDING_MAX,
        on_drop: Any = None,
        critical_window_seconds: float = LIVE_EVENT_CRITICAL_WINDOW_MS / 1000.0,
        critical_domains: frozenset[str] | set[str] | None = None,
    ) -> None:
        self._flush = flush
        #: 积压超限丢弃时的回调 ``on_drop(delta, total)``（同步或协程），用于让前端知道
        #: 「有一批状态没被推送」并触发重同步。此前只记内部计数、无人读取，前端那套
        #: ``ha_queue_dropped`` 处理器等于永远收不到事件。
        self._on_drop = on_drop
        self._reported_dropped = 0
        self._window = max(float(window_seconds), 0.0)
        #: 关键域窗口：不短于 0，且不超过常规窗口（配置写反时以常规窗口为准）。
        self._critical_window = min(
            max(float(critical_window_seconds), 0.0), self._window
        ) if self._window > 0 else 0.0
        self._critical_domains = frozenset(critical_domains or LIVE_EVENT_CRITICAL_DOMAINS)
        self._max_batch = max(int(max_batch_size), 1)
        self._max_pending = max(int(max_pending), 1)
        self._pending: dict[str, dict[str, Any]] = {}
        #: 没有 entity_id 的变化（实体被移除）不参与合并，用递增键各占一格。
        self._unkeyed = 0
        self._dropped = 0
        self._task: asyncio.Task[None] | None = None
        self._closed = False
        #: 关键域入队时置位：让 worker 从「常规窗口」里立刻醒来改走短窗口。
        self._wake = asyncio.Event()
        #: 本批是否含关键域变化（决定 flush 后的等待时长）。
        self._critical_pending = False

    @property
    def dropped(self) -> int:
        """积压超限被丢弃的条数（下一轮全量对账会补齐）。"""
        return self._dropped

    @property
    def pending(self) -> int:
        return len(self._pending)

    def start(self) -> None:
        """启动后台 worker（重复调用是幂等的）。"""
        if self._task is not None and not self._task.done():
            return
        self._closed = False
        self._task = asyncio.create_task(self._run(), name = 'ha-live-state-batch')

    def enqueue(self, change: dict[str, Any], *, entity_id: str | None = None) -> None:
        """入队一次变化：同实体覆盖合并（留首包 old_state、更新末包 new_state）。"""
        if self._closed:
            return
        # 关键域先置位再入队：即使下面走的是「同实体覆盖」分支，本批也应改走短窗口 ——
        # 用户又拨了一次开关，没理由继续等传感器那 50ms 的合并窗。
        if not self._critical_pending and self._critical_window < self._window:
            if entity_domain(entity_id) in self._critical_domains:
                self._critical_pending = True
                self._wake.set()
        if entity_id:
            existing = self._pending.get(entity_id)
            if existing is not None:
                existing['new_state'] = change.get('new_state')
                existing['time_fired'] = change.get('time_fired') or existing.get('time_fired')
                return
            key = entity_id
        else:
            self._unkeyed += 1
            key = f'__unkeyed_{self._unkeyed}'
        if len(self._pending) >= self._max_pending:
            # 丢最旧而不是丢新到：全量对账补得回旧状态，但用户刚触发的这一条
            # 如果被丢掉，墙屏会停在上一帧直到下一轮对账。
            oldest = next(iter(self._pending), None)
            if oldest is not None:
                self._pending.pop(oldest, None)
            self._dropped += 1
        self._pending[key] = dict(change)

    async def flush(self) -> None:
        """立刻把待处理变化交给回调（worker 继续跑）。"""
        if self._pending:
            await self._deliver(self._take())
        await self._report_dropped()

    async def _report_dropped(self) -> None:
        """把「又丢了 N 条」告诉上层（每次 flush 最多一次，避免刷屏）。"""
        if self._on_drop is None or self._dropped <= self._reported_dropped:
            return
        delta = self._dropped - self._reported_dropped
        self._reported_dropped = self._dropped
        try:
            result = self._on_drop(delta, self._dropped)
            if inspect.isawaitable(result):
                await result
        except Exception:
            # 丢弃通知是旁路：失败不能杀死落地 worker。
            LOGGER.debug('HA 实时状态丢弃通知失败', exc_info = True)

    async def aclose(self) -> None:
        """停掉 worker，并把已收到但还没落地的变化冲出去（断开前不丢最后一帧）。"""
        self._closed = True
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await self.flush()

    async def _run(self) -> None:
        while True:
            try:
                await self._wait_for_batch()
                await self.flush()
            except asyncio.CancelledError:
                raise
            except Exception:
                # 落地失败不能杀死收包循环，下一批照常。
                LOGGER.debug('HA 实时状态合并批次落地失败', exc_info = True)

    async def _wait_for_batch(self) -> None:
        """等到该开批的时刻。

        - 空闲时按常规窗口（默认 50ms）攒批，把传感器刷屏压成一次事务；
        - 关键域入队会 ``set()`` 唤醒：先从常规窗口里立刻退出，再用帧级短窗口收拢
          「同一次操作的多实体变化」，然后开批。
        """
        if self._window <= 0:
            # 窗口为 0 = 不合并：让出一次事件循环即可。
            await asyncio.sleep(0)
            return
        if self._critical_pending:
            # 上批还没交出去的关键域变化（或入队时已置位）：短窗口收拢后立即开批。
            await asyncio.sleep(self._critical_window)
            return
        self._wake.clear()
        try:
            await asyncio.wait_for(self._wake.wait(), timeout=self._window)
        except TimeoutError:
            return
        # 被关键域唤醒：给它一个短窗口把同批实体收齐，再交给 flush。
        if self._critical_window > 0:
            await asyncio.sleep(self._critical_window)

    def _take(self) -> list[dict[str, Any]]:
        keys = list(self._pending)[: self._max_batch]
        changes = [self._pending.pop(key) for key in keys]
        # 剩下的还没交出去的变化里是否仍有关键域：决定下一轮用长窗口还是短窗口。
        self._critical_pending = any(
            entity_domain(change.get('entity_id')) in self._critical_domains
            for change in self._pending.values()
        )
        return changes

    async def _deliver(self, changes: list[dict[str, Any]]) -> None:
        if not changes:
            return
        result = self._flush(changes)
        if inspect.isawaitable(result):
            await result
