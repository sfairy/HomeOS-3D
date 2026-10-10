"""资金与履约路径上的「吞掉异常」计数。
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import TypedDict

from ..core.models import utcnow
from ..security.security import iso_z

logger = logging.getLogger("src.ops.incidents")

KINDS: dict[str, str] = {
    "fulfillment": "入账后履约失败",
    "fulfillment.retry": "履约失败重试仍异常",
    "reconcile.return": "跳转页查单失败",
    "reconcile.poll": "轮询查单失败",
    "alipay.config": "支付宝回调配置缺失",
    "wechat.config": "微信回调配置缺失",
    "refund.ledger": "退款流水写入失败",
    "referral.reversal_shortfall": "退款扣回邀请积分余额不足",
    "referral.reward": "邀请奖励入账失败",
    "delivery": "发货通知投递异常",
    "delivery.record": "发货投递结果记录失败",
    "verification.delivery_record": "验证码投递结果落库失败",
}

HEALTH_OK = "ok"
HEALTH_DEGRADED = "degraded"

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

    counts: dict[str, _Incident] = field(default_factory=dict)
    cleared: _Cleared | None = None


_STATE = _State()
_LOCK = threading.Lock()


def note(
    kind: str, *, order_no: str | None = None, error: BaseException | str | None = None
) -> None:
    """记一次「被吞掉的」异常。
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
    except Exception:
        logger.exception("异常计数失败 kind=%s（计数本身出错，不影响主流程）", kind)


class _KindRow(TypedDict):
    """后台巡检列表里的一行。"""

    kind: str
    label: str
    count: int
    lastAt: str | None
    lastOrderNo: str
    lastError: str


def status() -> dict:
    """当前快照。字段命名与巡检状态保持一致，前端可以复用同一套渲染思路。"""
    with _LOCK:
        kinds: list[_KindRow] = [
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
