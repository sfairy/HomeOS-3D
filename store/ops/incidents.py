"""资金与履约路径上的「吞掉异常」计数（S36）。

为什么需要它：有几处 ``except Exception`` 是**刻意**吞掉异常的 —— 对账失败不能把
用户正看着的支付页打成 500，入账后履约失败也不能给渠道回失败（那会让它无限重推）。
但「吞掉」过去只等于「往日志写一行 traceback」：服务照常启动、后台概览一片正常，
而实际发生的事情是「钱收了、授权没发出去」。日志是写给已经在翻日志的人看的，
不是告警。

这里给这类异常留一个**进程内**的计数器：谁吞的、吞了几次、最近一次错在哪一笔单上。
``/healthz`` 与后台概览读的是同一份快照（与巡检状态同一套做法，见
``store/payments/sweeper``），只要有非零计数 ``health`` 就是 ``degraded``，
监控可以直接按它报警，而不必去猜日志里哪一行算严重。

为什么不落库：与巡检同理 —— 重启之后「本进程内已经吞了 N 次」本身才是要看的信号；
落库会把上一个进程的计数带过来，让刚起来就出问题的进程看起来像「历史遗留」。
另外这些计数只回答「有没有出过事」，不是账目，丢了不影响对账。

为什么还要 ``clear()``：一次性的抖动会把这盏灯**永久**点亮，而运维除了重启服务
没有任何办法把它按灭 —— 那样的告警很快就没人看了。所以后台可以「确认」一次
（连审计一起记），计数归零并留下确认时间与确认人。
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
    # 钱已经到账、订单也已置为已支付，但发码/扣库存/记邀请奖励那一段抛了异常。
    # 这条最重：用户付了钱却什么都没拿到，订单会被推到 fulfillment_failed。
    "fulfillment": "入账后履约失败",
    # 用户在同步跳转页上被对账（查单）失败：这一笔可能因此停在待支付，
    # 好在异步通知与后台巡检还会再试。
    "reconcile.return": "跳转页查单失败",
    # 账号中心轮询订单时查单失败：同上，只是入口不同。
    "reconcile.poll": "轮询查单失败",
}

HEALTH_OK = "ok"
#: 有过异常。不做 ok/degraded 之外的第三档：这个计数器回答的是「有没有出过事」，
#: 而不是「现在还好吗」——「现在好不好」由巡检状态回答。
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
    """整套计数器。装进一个对象是为了让 ``clear`` 与 ``status`` 都能在**同一把锁**
    里整体读/整体改 —— 分开成三个模块级字典的话，清空与计数并发时会出现
    「计数清了、最近错误还留着」这种自相矛盾的快照。
    """

    counts: dict[str, _Incident] = field(default_factory=dict)
    cleared: _Cleared | None = None


_STATE = _State()
_LOCK = threading.Lock()


def note(
    kind: str, *, order_no: str | None = None, error: BaseException | str | None = None
) -> None:
    """记一次「被吞掉的」异常。

    这个方法**绝不能抛异常**：它唯一的调用场合就是 ``except`` 块内部，那里再抛一次
    等于把原本刻意吞下的失败重新变成 500（甚至盖掉原始错误）。所以整段包在
    ``try/except`` 里，内部出问题只落一行日志 —— 计数器是辅助信号，不值得为它
    牺牲主流程。
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
    """把计数归零（后台「确认」按钮）。返回**清零前**的快照。

    为什么返回清零前的：审计日志要记下「确认掉的是什么」，否则事后只剩一句
    「某人点了确认」，看不出当时到底出过几次、发生在哪笔单上。
    """
    before = status()
    with _LOCK:
        _STATE.counts.clear()
        _STATE.cleared = _Cleared(at=utcnow(), by=(actor or "").strip(), total=before["total"])
    return before
