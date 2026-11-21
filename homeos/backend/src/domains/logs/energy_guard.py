"""能耗口径护栏：识别「看起来合法、实际会毒化报表」的单日用量。

两类输入在结构上无法与真实用电区分，只能靠数量级判断：

1. **首次读数 / 集成重连后的纠正跳变**：年累计表从 8 跳到 4217，差分得到单日
   4209 kWh。这不是一天用了 4209 度，而是基线缺失。实测本机
   ``energy_usage_daily`` 就因此出现过 4209 / 306 两条脏行，并把 11 月月表写成 4626。
2. **账单快照传感器**（``*_last_month_ele_num``）：数值是「上月总量」，一个月只跳
   一次，按累计表差分会把整月用电记到跳变那天。判定在
   :func:`event_log_tier.is_billing_snapshot_entity`（纯名字，无 IO）。

阈值一律用相对口径（同实体近 30 天日用量中位数 × 倍数）再加一个绝对下限，
不同户型的大用量尖峰不会被误杀：中位数越大，允许的上限同比放大。
"""

from __future__ import annotations

import logging
from statistics import median
from typing import Any

from sqlalchemy import select

from .event_log_tier import is_billing_snapshot_entity
from ...platform.core.db.models import EnergyUsageDaily

logger = logging.getLogger("homeos.energy_guard")

#: 判定为「异常跳变」所需的绝对下限（kWh/日/实体）。低于它一律放行，
#: 避免小用量家庭因中位数接近 0 而被误杀。
MIN_IMPLAUSIBLE_KWH = 300.0
#: 相对倍数：超过「同实体近 N 天日用量中位数」的这个倍数才判为跳变。
IMPLAUSIBLE_RATIO = 20.0
#: 取中位数的回看窗口（天）。只做数量级判断，不需要完整历史。
PEER_WINDOW_DAYS = 30
#: 月读数护栏：超过「同月日行之和 / 其它月份中位数」的倍数即判为跳变。
IMPLAUSIBLE_MONTH_RATIO = 5.0
#: 月读数护栏的绝对下限（kWh/月）：差额小于它一律放行，避免月初日行很少时误杀。
MIN_IMPLAUSIBLE_MONTH_GAP = 1000.0

__all__ = [
    "IMPLAUSIBLE_MONTH_RATIO",
    "IMPLAUSIBLE_RATIO",
    "MIN_IMPLAUSIBLE_KWH",
    "MIN_IMPLAUSIBLE_MONTH_GAP",
    "drop_implausible_days",
    "is_billing_snapshot_entity",
    "is_implausible_day",
    "is_implausible_month",
    "load_day_peers",
    "peer_baseline",
]


def peer_baseline(values: list[float] | tuple[float, ...]) -> float:
    """同实体日用量基线：忽略 0 与负数后取中位数（无样本时为 0）。"""
    cleaned = [float(value) for value in values if value is not None and float(value) > 0]
    return float(median(cleaned)) if cleaned else 0.0


def is_implausible_day(value: float, peers: list[float] | tuple[float, ...] = ()) -> bool:
    """单日用量是否已达到「基线缺失而非真实用电」的数量级。

    两条都要满足：超过绝对下限，且超过「中位数 × 倍数」。没有同行样本时
    （首次写入）只看绝对下限 —— 一个家庭单日 300 kWh 已接近 13 kW 平均负荷。
    """
    if value is None or value <= 0:
        return False
    if value < MIN_IMPLAUSIBLE_KWH:
        return False
    limit = max(MIN_IMPLAUSIBLE_KWH, peer_baseline(peers) * IMPLAUSIBLE_RATIO)
    return float(value) > limit


def is_implausible_month(value: float, baseline: float) -> bool:
    """月读数是否达到「基线缺失而非真实用电」的数量级。

    月读数在语义上应当 ≈ 同月日行之和（或与其它月份同量级）。超过基线的
    ``IMPLAUSIBLE_MONTH_RATIO`` 倍、且差额大于 ``MIN_IMPLAUSIBLE_MONTH_GAP`` 时才拦：
    月初日行很少、整月读数偏大是正常情况，不能被一刀切掉。
    """
    if value is None or value <= 0 or baseline <= 0:
        return False
    limit = max(baseline * IMPLAUSIBLE_MONTH_RATIO, baseline + MIN_IMPLAUSIBLE_MONTH_GAP)
    return float(value) > limit


def load_day_peers(
    session: Any,
    entity_ids: list[str] | set[str],
    *,
    row_limit: int | None = None,
    exclude_days: set[tuple[str, str]] | None = None,
) -> dict[str, list[float]]:
    """取各实体近期的日用量样本（用于算中位数基线）。

    ``exclude_days`` 里的 (实体, 日) 不参与基线：它们就是本次要判定/改写的值，
    把可疑值算进基线会自己抬高上限。
    """
    ids = [str(item) for item in entity_ids if str(item).strip()]
    if not ids:
        return {}
    limit = row_limit or len(ids) * (PEER_WINDOW_DAYS + 1) * 4
    rows = session.execute(
        select(EnergyUsageDaily.entity_id, EnergyUsageDaily.day, EnergyUsageDaily.kwh)
        .where(EnergyUsageDaily.entity_id.in_(ids))
        .order_by(EnergyUsageDaily.day.desc())
        .limit(limit)
    ).all()
    excluded = exclude_days or set()
    peers: dict[str, list[float]] = {}
    for entity_id, day, kwh in rows:
        entity_key = str(entity_id)
        if (entity_key, str(day)) in excluded:
            continue
        try:
            value = float(kwh or 0.0)
        except (TypeError, ValueError):  # fmt: skip
            continue
        if value > 0:
            peers.setdefault(entity_key, []).append(value)
    return peers


def drop_implausible_days(
    day_values: dict[tuple[str, str], float],
    peers: dict[str, list[float]],
    *,
    keep_keys: set[tuple[str, str]] | None = None,
) -> dict[tuple[str, str], float]:
    """丢掉数量级不合理的 (实体, 日) 值，并留一条告警日志。

    ``keep_keys`` 是权威来源（国网列表）的键：账单级数据不做数量级拦截，
    否则「首个账单日」会被当成跳变吞掉。
    """
    kept: dict[tuple[str, str], float] = {}
    dropped: list[tuple[str, str, float]] = []
    exempt = keep_keys or set()
    for key, value in day_values.items():
        if key in exempt:
            kept[key] = value
            continue
        if is_implausible_day(value, peers.get(key[0], [])):
            dropped.append((key[0], key[1], float(value)))
            continue
        kept[key] = value
    if dropped:
        sample = ", ".join(f"{entity}@{day}={value:.0f}" for entity, day, value in dropped[:5])
        logger.warning(
            "能耗：丢弃 %s 条数量级异常的单日用量（疑似首次读数/基线缺失）：%s",
            len(dropped),
            sample,
        )
    return kept
