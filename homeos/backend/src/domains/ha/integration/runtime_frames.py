"""``/ws/runtime`` 的出站帧组装：合批窗口、按实体合并、快照差异、队列背压。

## 为什么从 ``api/ha/routes.py`` 搬出来

这些函数没有一行碰 ``WebSocket`` / ``Request`` —— 它们只对「队列」和「状态列表」做纯计算：

- ``drain_runtime_queue``：在一个合批窗口里把突发事件取空（两段超时：先探 2ms，
  确认有后续才放宽到合批窗）；
- ``merge_runtime_state_events``：同实体的多条只保留最后一条（中途态没有展示价值）；
- ``diff_runtime_states``：补全前后的两份 hub 快照 → 只需要下发的差异帧；
- ``runtime_queue_put``：订阅队列满时丢最旧帧，连一帧都容不下才退化为整表重拉。

把它们留在路由里有两个坏处：路由文件已经有 1500 行（找一条规则要滚很久），
而这些逻辑的**正确性只取决于输入形状**，本可以单独推理、单独测试。

## 常量为什么也搬

``RUNTIME_STATE_BATCH_WINDOW_SECONDS`` / ``RUNTIME_DRAIN_PROBE_SECONDS`` 只被
``drain_runtime_queue`` 使用。常量留在路由文件里、函数搬走，会让「改窗口」这件事需要
同时看两个文件；一起搬走更内聚。取值仍来自 ``domains/ha/config/perf_windows``
（``HOMEOS_HA_RUNTIME_STATE_BATCH_WINDOW_MS`` 可覆盖）。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from ....platform.core.runtime.observability import record_ha_counter
from ..config.perf_windows import runtime_state_batch_window_ms

logger = logging.getLogger("homeos.ha.runtime_frames")

#: `/ws/runtime` 出站合并窗口（秒）：默认 4ms，可用
#: ``HOMEOS_HA_RUNTIME_STATE_BATCH_WINDOW_MS`` 覆盖；探测窗口不超过合批窗本身。
RUNTIME_STATE_BATCH_WINDOW_SECONDS = runtime_state_batch_window_ms() / 1000.0
RUNTIME_DRAIN_PROBE_SECONDS = min(0.002, RUNTIME_STATE_BATCH_WINDOW_SECONDS)


async def drain_runtime_queue(queue: Any) -> list[dict]:
    """在合并窗口内把队列里已经到达的事件一次性取空。

    分两段等，避免给「稳态下的孤立事件」白加 12ms：

    - 第一段只等 ``RUNTIME_DRAIN_PROBE_SECONDS``（2ms）：这一小段就能判断出当前是否
      处于突发（场景切换 / 全屋开关会把几十上百条同步塞进队列）；
    - 一旦确认有后续事件，再放宽到 ``RUNTIME_STATE_BATCH_WINDOW_SECONDS``（12ms），
      把整波都收进来按实体合并；收不到就立即返回，不再等满窗口。
    """
    events: list[dict] = []
    deadline = time.monotonic() + RUNTIME_STATE_BATCH_WINDOW_SECONDS
    probing = True
    while True:
        wait = RUNTIME_DRAIN_PROBE_SECONDS if probing else deadline - time.monotonic()
        if wait <= 0:
            return events
        try:
            events.append(await asyncio.wait_for(queue.get(), timeout=wait))
        except TimeoutError:
            # 窗口内没有新事件：这是稳态的正常出口，不是错误。
            logger.debug("合批窗口结束，未再收到事件（已收 %s 条）", len(events))
            return events
        probing = False


def merge_runtime_state_events(events: list[dict]) -> list[dict]:
    """按实体合并：同一实体只保留窗口内的最后一条，非状态事件保持原顺序。"""
    merged: list[dict] = []
    positions: dict[str, int] = {}
    for event in events:
        if event.get("type") == "state_changed":
            entity_id = str(event.get("entityId") or "")
            if entity_id and entity_id in positions:
                merged[positions[entity_id]] = event
                continue
            if entity_id:
                positions[entity_id] = len(merged)
        merged.append(event)
    return merged


def drain_runtime_queue_now(queue: Any) -> int:
    """非阻塞清空订阅队列，返回丢掉的帧数。

    握手期 / 补全期排队的帧都早于「即将下发的快照」，留着只会在快照之后被再推一遍
    （值相同，纯浪费带宽；值更旧时甚至会把界面推回过去 —— 前端只有快照后的
    ``last_updated`` 守卫兜底）。
    """
    dropped = 0
    while True:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            logger.debug("实时订阅队列已空，停止排空")
            return dropped
        dropped += 1


def diff_runtime_states(current: list[dict], previous: list[dict]) -> list[dict]:
    """补全前后的两份 hub 快照 → 只需要下发的差异帧。

    ``updatedAt`` 是 hub 里的权威更新时刻：相同即同一次更新，不必再推。旧实现直接对
    两份完整快照做 ``!=`` 深比较，一旦有差异就整包重发（几百个实体 × 全量属性）。
    """
    before = {str(item.get("entityId") or ""): item for item in previous if isinstance(item, dict)}
    changed: list[dict] = []
    for item in current:
        if not isinstance(item, dict):
            continue
        entity_id = str(item.get("entityId") or "")
        if not entity_id:
            continue
        old = before.get(entity_id)
        if old is None:
            changed.append(item)
            continue
        if old.get("updatedAt") != item.get("updatedAt") or old.get("state") != item.get("state"):
            changed.append(item)
    return changed


def runtime_queue_put(queue: Any, frame: dict) -> None:
    """往订阅队列里塞一帧（可能来自订阅增量更新），满了就丢掉最旧的再塞。"""
    try:
        queue.put_nowait(frame)
        return
    except asyncio.QueueFull:
        logger.warning("实时订阅队列已满，丢弃最旧帧后重试")
    while True:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            logger.debug("实时订阅队列已空，停止丢弃旧帧")
            break
    try:
        queue.put_nowait(frame)
    except asyncio.QueueFull:
        # 极端情况（单帧就超过队列容量）：退化成「建议整表重拉」，绝不静默丢帧。
        logger.warning("实时订阅队列连一帧都容不下，退化为要求整表重拉")
        record_ha_counter("resync")
        queue.put_nowait({"type": "resync_required"})


__all__ = [
    "RUNTIME_DRAIN_PROBE_SECONDS",
    "RUNTIME_STATE_BATCH_WINDOW_SECONDS",
    "diff_runtime_states",
    "drain_runtime_queue",
    "drain_runtime_queue_now",
    "merge_runtime_state_events",
    "runtime_queue_put",
]
