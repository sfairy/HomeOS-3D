"""能耗历史窗口读取（W / M / Y）与候选实体筛选。

从 ``event_log_report`` 拆出的原因有两个：

1. 那个文件已经贴着 ``check:file-size`` 的棘轮上限，再加窗口细节只能继续抬高基线；
2. 这里全是**按聚合表读窗口**的纯查询，与「事件流报表」没有共享口径，放在一起反而
   让两种时间语义（事件发生时间 vs 自然日）混在同一个模块里。

口径说明：``W`` = 近 7 天、``M`` = 近 30 天，都读日表；``Y`` = 近 12 个月，优先读月表，
月表还没攒够（新装机 / 只接国网 30 天日列表）时用日表按自然月求和兜底。
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import func, select

from .energy_sgcc import account_identity_key, account_member_rank
from .event_log_tier import is_billing_snapshot_entity
from ...platform.core.db.models import EnergyUsageDaily, EnergyUsageMonthly


def _format_short_label(value: str) -> str:
    """图表短标签（``2026-01-21`` → ``1/21``）。"""
    parts = value.split("-")
    if len(parts) == 3:
        return f"{int(parts[1])}/{int(parts[2])}"
    return value


def _round2(number: float) -> float:
    return round(number * 100) / 100


def _month_key(today: Any, months_back: int) -> str:
    """``today`` 往前推 N 个自然月，返回 ``YYYY-MM``。"""
    total = today.year * 12 + (today.month - 1) - int(months_back)
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def select_energy_candidates(ids: list[str], *, keep: set[str] | None) -> list[str]:
    """按报表读取口径筛候选实体（白名单 → 主表或家族代表）。

    - 账单快照实体（``*_last_month_ele_num``）永远剔除：它的日行是「整月总量」被差分
      的产物，参与求和必然重复计费。
    - 绑定了主电表（``keep``）时只保留主表；未绑定时每个账户**身份**只留一个代表
      （``sensor.ele_8107_{daily,month,year}_ele_num`` 与厂商命名的同一户号是同一度电
      的多种口径，见 :func:`account_identity_key`）。
    """
    cleaned = [eid for eid in ids if not is_billing_snapshot_entity(eid)]
    if keep:
        return [eid for eid in cleaned if eid in keep]
    groups: dict[str, list[str]] = {}
    for entity_id in cleaned:
        groups.setdefault(account_identity_key(entity_id), []).append(entity_id)
    return sorted(
        members[0] if len(members) == 1 else min(members, key=account_member_rank) for members in groups.values()
    )


def read_daily_history(session: Any, ids: list[str], today: Any, *, days: int) -> dict[str, Any]:
    """近 N 天日曲线（读日聚合表）。"""
    start = today - timedelta(days=days - 1)
    rows = session.execute(
        select(EnergyUsageDaily.day, func.sum(EnergyUsageDaily.kwh))
        .where(
            EnergyUsageDaily.entity_id.in_(ids),
            EnergyUsageDaily.day >= start.isoformat(),
            EnergyUsageDaily.day <= today.isoformat(),
        )
        .group_by(EnergyUsageDaily.day)
    ).all()
    mapping = {str(day): float(total or 0.0) for day, total in rows}
    series = [
        {
            "date": (start + timedelta(days=offset)).isoformat(),
            "label": _format_short_label((start + timedelta(days=offset)).isoformat()),
            "value": _round2(mapping.get((start + timedelta(days=offset)).isoformat(), 0.0)),
        }
        for offset in range(days)
    ]
    return {
        "range": "W" if days == 7 else "M",
        "unit": "kWh",
        "total": _round2(sum(item["value"] for item in series)),
        "source": "daily" if mapping else "empty",
        "series": series,
    }


def read_year_history(session: Any, ids: list[str], today: Any) -> dict[str, Any]:
    """近 12 个月曲线（优先月表，缺失时按日表求和兜底）。"""
    months = [_month_key(today, offset) for offset in range(11, -1, -1)]
    rows = session.execute(
        select(EnergyUsageMonthly.month, func.sum(EnergyUsageMonthly.kwh))
        .where(EnergyUsageMonthly.entity_id.in_(ids), EnergyUsageMonthly.month.in_(months))
        .group_by(EnergyUsageMonthly.month)
    ).all()
    mapping = {str(month): float(total or 0.0) for month, total in rows}
    source = "monthly"
    if not mapping:
        day_rows = session.execute(
            select(func.substr(EnergyUsageDaily.day, 1, 7), func.sum(EnergyUsageDaily.kwh))
            .where(
                EnergyUsageDaily.entity_id.in_(ids),
                EnergyUsageDaily.day >= f"{months[0]}-01",
                EnergyUsageDaily.day <= today.isoformat(),
            )
            .group_by(func.substr(EnergyUsageDaily.day, 1, 7))
        ).all()
        mapping = {str(month): float(total or 0.0) for month, total in day_rows}
        source = "daily" if mapping else "empty"
    series = [
        {
            "date": month,
            "label": f"{int(month[5:7])}月",
            "value": _round2(mapping.get(month, 0.0)),
        }
        for month in months
    ]
    return {
        "range": "Y",
        "unit": "kWh",
        "total": _round2(sum(item["value"] for item in series)),
        "source": source,
        "series": series,
    }


__all__ = ["read_daily_history", "read_year_history", "select_energy_candidates"]
