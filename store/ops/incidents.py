"""资金与履约路径上的「吞掉异常」计数。

几处 ``except Exception`` 是**刻意**吞掉的：对账失败不能把用户正看的支付页打成 500，
入账后履约失败也不能给渠道回失败（那会让它无限重推）。但「吞掉」不能只等于往日志写
一行 traceback —— 服务照常启动、后台概览一片正常，实际却是「钱收了、授权没发出去」。
这里留一个**进程内**计数器，``/healthz`` 与后台概览读同一份快照，非零即 degraded，
监控可直接报警。不落库：重启后「本进程内吞了 N 次」本身才是要看的信号；这些计数也
不是账目，丢了不影响对账。可 ``clear()``：一次性抖动不该永久点亮，运维能确认并归零。
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime

from store.core.models import utcnow
from store.security.security import iso_z

logger = logging.getLogger("store.ops.incidents")

#: 已登记的计数类别 → 人类可读标签。标签放在后端，是为了让后台、``/healthz`` 与
#: 日志讲同一件事；新类别必须显式登记，避免各处风格漂移成「同一件事三种叫法」。
KINDS: dict[str, str] = {
    # 钱已到账、订单已置为已支付，但发码/扣库存/记邀请奖励那一段抛了异常（最重的一档）。
    "fulfillment": "入账后履约失败",
    # 用户在同步跳转页上被对账（查单）失败：这一笔可能停在待支付，异步通知与巡检还会再试。
    "reconcile.return": "跳转页查单失败",
    # 账号中心轮询订单时查单失败：同上，只是入口不同。
    "reconcile.poll": "轮询查单失败",
}

HEALTH_OK = "ok"
#: 有过异常。不做第三档：这个计数器回答的是「有没有出过事」，而不是「现在还好吗」
#: ——「现在好不好」由巡检状态回答。
HEALTH_DEGRADED = "degraded"

#: 最近一次错误信息最多留多少字符。它是给后台一行提示用的，不是日志替身。
_MAX_ERROR_CHARS = 300


@dataclass
class _Incident:
    count: int = 0
    at: datetime | None = None
    order_no: str = ""
    error: str = ""


@dataclass
class _Cleared:
    at: datetime | None = None
    by: str = ""
    total: int = 0


@dataclass
class _State:
    """整套计数器。装进一个对象是为了让 ``clear`` 与 ``status`` 能在**同一把锁**里整体读改 ——
    分开成三个模块级字典的话，清空与计数并发时会出现「计数清了、最近错误还留着」的快照。
    """

    counts: dict[str, _Incident] = field(default_factory=dict)
    cleared: _Cleared | None = None


_STATE = _State()
_LOCK = threading.Lock()


def note(
    kind: str, *, order_no: str | None = None, error: BaseException | str | None = None
) -> None:
    """记一次「被吞掉的」异常。

    这个方法**绝不能抛异常**：调用场合就是 ``except`` 块内部，那里再抛等于把刻意吞下的
    失败重新变成 500。整段包在 ``try/except`` 里，内部出错只落一行日志。
    """
    try:
        text = "" if error is None else str(error)
        if len(text) > _MAX_ERROR_CHARS:
            text = text[: _MAX_ERROR_CHARS - 1] + "…"
        with _LOCK:
            record = _STATE.counts.get(kind) or _Incident()
            record.count += 1
            record.at = utcnow()
            record.order_no = order_no or ""
            record.error = text
            _STATE.counts[kind] = record
    except Exception:  # noqa: BLE001 - 见 docstring：这里绝不能影响调用方
        logger.exception("异常计数失败 kind=%s（计数本身出错，不影响主流程）", kind)


def status() -> dict:
    """当前快照。字段命名与巡检状态保持一致，前端可以复用同一套渲染思路。"""
    with _LOCK:
        kinds = [
            {
                "kind": kind,
                "label": KINDS.get(kind, kind),
                "count": record.count,
                "lastAt": iso_z(record.at) if record.at else None,
                "lastOrderNo": record.order_no,
                "lastError": record.error,
            }
            for kind, record in _STATE.counts.items()
            if record.count
        ]
        cleared = _STATE.cleared
        cleared_at = iso_z(cleared.at) if cleared and cleared.at else None
        cleared_by = cleared.by if cleared else ""
        cleared_total = cleared.total if cleared else 0

    # 次数多的排前面：「同一条路径反复失败」比「三条路径各失败一次」更急。
    kinds.sort(key=lambda item: (-item["count"], item["kind"]))
    total = sum(item["count"] for item in kinds)
    return {
        "health": HEALTH_OK if total == 0 else HEALTH_DEGRADED,
        "total": total,
        "kinds": kinds,
        "clearedAt": cleared_at,
        "clearedBy": cleared_by,
        "clearedTotal": cleared_total,
    }


def clear(*, actor: str | None = None) -> dict:
    """把计数归零（后台「确认」按钮）。返回**清零前**的快照，审计要记下确认掉的是什么。"""
    before = status()
    with _LOCK:
        _STATE.counts.clear()
        _STATE.cleared = _Cleared(at=utcnow(), by=(actor or "").strip(), total=before["total"])
    return before
