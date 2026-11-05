"""握手窗口（订阅已建立、全量快照尚未落地）里的收帧缓冲。

拆成独立模块的原因：``service_live`` 已经贴着 ``check:file-size`` 的棘轮上限，
而这段逻辑与长连收包循环无关 —— 它只回答一个问题：「同步那几秒里到达的帧怎么暂存，
才能在回放时既不丢最新值、又不把内存交给同一实体的中间值」。
"""

from __future__ import annotations

from typing import Any

from .live_events import live_state_change

#: 握手窗口最多缓冲多少个槽位。
#:
#: 这个窗口里不能「不读 socket」：HA 的待发队列会堆积，轻则事件延迟，重则被判为消费
#: 不过来而踢连接（→ 又触发一轮全量重建）。也不能无限缓冲：大户型在同步那几秒里可能
#: 收到成百上千条传感器帧。槽位按实体合并（见 ``HandshakeCapture``），因此上界是
#: 「窗口内发生变化的实体个数」而不是帧速率 —— 实测本机重连时 4 秒 2141 帧只对应
#: 700 余个实体。只有真正的槽位耗尽才会丢最旧的一格并补一次全量对账。
LIVE_BOOTSTRAP_MAX_FRAMES = 2_000


def _capture_key(message: dict[str, Any]) -> str | None:
    """握手缓冲里这条消息的合并键；``None`` 表示不可合并（逐格保留）。

    只有 ``state_changed`` 能按实体合并：压缩帧（``a``/``c``/``r``）一帧可能带多个
    实体，注册表事件也不是按实体推送的，它们各自占一格（数量级远小于状态帧）。
    """
    change = live_state_change(message)
    if change is None:
        return None
    entity_id = change.get("entity_id") or change.get("removed_entity_id")
    return f"s:{entity_id}" if entity_id else None


class HandshakeCapture:
    """订阅已建立、全量快照尚未落地期间到达的原始帧。

    按实体合并而不是逐帧追加：同一个窗口里一条传感器可能推送几十次（功率 / 电量 /
    毫米波在场景切换或 HA 重启后集中刷），逐帧缓冲会把 ``LIVE_BOOTSTRAP_MAX_FRAMES``
    消耗在「同一实体的中间值」上，一旦超限就丢最旧的帧并补一次全量对账 —— 那次对账的
    代价（get_states + 三张注册表 + 大事务）远大于它补回来的信息。

    回放只关心「每个实体的最新值」，与 ``LiveStateEventQueue`` 的合并取舍一致；
    被合并掉的中间值本来就会被 ``superseded_by_snapshot`` 或下一次对账覆盖。
    """

    __slots__ = ("_frames", "_limit", "coalesced", "dropped", "received")

    def __init__(self, limit: int = LIVE_BOOTSTRAP_MAX_FRAMES) -> None:
        self._limit = max(int(limit), 1)
        #: 键 = ``s:<entity_id>``（可合并）或 ``u:<收帧序号>``（不可合并，逐格保留）。
        #: dict 保留插入顺序：被合并的键删后重插，回放时自然按「最新在最后」排序。
        self._frames: dict[str, dict[str, Any]] = {}
        self.received = 0
        #: 被同一实体的更新顶掉的帧数（不影响正确性，只用于确认窗口里发生了风暴）。
        self.coalesced = 0
        #: 槽位耗尽被挤掉的帧数（此时确有实体的最新值没进缓冲，需要补对账）。
        self.dropped = 0

    def __len__(self) -> int:
        return len(self._frames)

    def add(self, message: dict[str, Any]) -> None:
        self.received += 1
        key = _capture_key(message)
        if key is not None and key in self._frames:
            self.coalesced += 1
            del self._frames[key]
            self._frames[key] = message
            return
        if len(self._frames) >= self._limit:
            oldest = next(iter(self._frames), None)
            if oldest is not None:
                del self._frames[oldest]
            self.dropped += 1
        self._frames[key if key is not None else f"u:{self.received}"] = message

    def drain(self) -> list[dict[str, Any]]:
        frames = list(self._frames.values())
        self._frames.clear()
        return frames
