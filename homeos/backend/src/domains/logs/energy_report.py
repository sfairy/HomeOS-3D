"""能耗报表的「金额 + 分回路」扩展（从 ``event_log_report`` 拆出）。

拆出来的理由是两者没有共享口径：``event_log_report`` 已经很大，而这两件事
（按电价算钱、按回路排行）与「事件流报表」没有共享口径，放在一起只会让两种时间语义
继续糊在同一个模块里。

宿主需同时继承 ``EventLogReportMixin``（提供 ``_ops`` / ``_database``）与本 mixin。
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select

from .energy_cost import annotate_series, cost_from_hourly, resolve_prices
from .energy_history import resolve_unit
from .event_log_report import normalize_energy_range
from ...platform.core.db.models import EnergyUsageDaily, EnergyUsageHourly
from ...platform.core.runtime.app_config import load_raw_config

logger = logging.getLogger("homeos.event_log")


def _is_monthly_series(series: list[dict[str, Any]]) -> bool:
    """序列粒度：日期是 ``YYYY-MM`` 时按月计价（阶梯必须按月累计）。"""
    for point in series:
        date = str(point.get("date") or "")
        if date:
            return len(date) == 7
    return False


def _hour_cost(kwh: float, hour_key: str, cfg: dict[str, Any], prices: dict[str, Any]) -> float:
    """单个小时的金额（逐点金额用，与总量口径必须来自同一套价格）。"""
    from .energy_cost import hour_period

    tou = prices["tou"]
    if tou is None:
        return kwh * prices["fixed"]
    return kwh * tou[hour_period(hour_key, cfg)]


class EnergyReportExtraMixin:
    """分回路排行 + 费用口径（依赖宿主的 ``_database`` / ``_ops`` / ``_report_now``）。"""

    def query_energy_circuits(self, range_key: str | None, entity_ids: list[str] | None = None) -> dict[str, Any]:
        """分回路用电排行（读日聚合表，按实体求和后降序）。

        ``energy.circuitEntityIds`` 以前只被首装向导和引用清理读取：用户勾了「空调回路 /
        厨房回路」，却在任何页面都看不到它的用电量。这里给出窗口内的回路排行与占比，
        让这份配置真正产生价值。
        """
        resolved = normalize_energy_range(range_key)
        ids = [str(item) for item in (entity_ids or []) if str(item).strip()]
        if not ids:
            ids = sorted(self.circuit_entity_ids())
        if not ids:
            return {"range": resolved, "unit": "kWh", "total": 0.0, "items": [], "source": "empty"}
        from .event_log_report import _report_now

        now = _report_now(self._ops)
        today = now.date()
        days = 7 if resolved == "W" else (30 if resolved == "M" else 365)
        start = today - timedelta(days=days - 1)
        with self._database.session_factory() as session:
            rows = session.execute(
                select(EnergyUsageDaily.entity_id, func.sum(EnergyUsageDaily.kwh))
                .where(
                    EnergyUsageDaily.entity_id.in_(ids),
                    EnergyUsageDaily.day >= start.isoformat(),
                    EnergyUsageDaily.day <= today.isoformat(),
                )
                .group_by(EnergyUsageDaily.entity_id)
                .order_by(func.sum(EnergyUsageDaily.kwh).desc())
            ).all()
            unit = resolve_unit(session, ids)
        total = round(sum(float(value or 0.0) for _eid, value in rows), 2)
        items = [
            {
                "entityId": str(entity_id),
                "value": round(float(value or 0.0), 2),
                "share": round(float(value or 0.0) / total, 4) if total > 0 else 0.0,
            }
            for entity_id, value in rows
        ]
        return {
            "range": resolved,
            "unit": unit,
            "total": total,
            "items": items,
            "source": "daily" if items else "empty",
        }

    def _pricing_config(self) -> dict[str, Any]:
        """读 ``pricing`` 分区（电价的唯一真源）。

        每次报表请求读一次单行配置：报表是用户触发的低频查询，而缓存的失效时机
        （改完电价要立刻生效）比那一次读库更值得。
        """
        try:
            with self._database.session_factory() as session:
                raw = load_raw_config(session)
        except Exception:
            logger.debug("读取电价配置失败，报表不带金额", exc_info=True)
            return {}
        section = raw.get("pricing")
        return section if isinstance(section, dict) else {}

    def _with_cost(self, payload: dict[str, Any], ids: list[str], *, monthly: bool | None = None) -> dict[str, Any]:
        """按电价给曲线补金额。

        **只对电**（``unit == kWh``）计价：燃气/水按电价算钱会得到一个看起来合理、
        实际完全错的数字。

        计价有两条路，按「小时数据是否覆盖完整」自动选择：

        - 有完整小时行 → 逐小时按真实时段计价（**精确**，``costEstimated: false``）；
        - 只有日行（本功能上线前的历史）→ 按段时长占比估算，并标 ``estimated``。

        ``monthly`` 只影响**阶梯**口径的计价粒度：``compare`` 报表的序列即使按「月」
        聚合也仍然是逐日点，光看日期长度判不出来，必须由调用方显式告知。
        """
        if str(payload.get("unit") or "") != "kWh":
            return {**payload, "cost": None, "costEstimated": False}
        cfg = self._pricing_config()
        series = list(payload.get("series") or [])
        exact = self._exact_cost(ids, series, cfg)
        if exact is not None:
            buckets = exact["buckets"]
            return {
                **payload,
                "series": [{**point, "cost": buckets.get(str(point.get("date")))} for point in series],
                "cost": exact["cost"],
                "costCurrency": "CNY",
                "costEstimated": False,
            }
        annotation = annotate_series(series, cfg, monthly=_is_monthly_series(series) if monthly is None else monthly)
        return {
            **payload,
            "series": annotation["series"],
            "cost": annotation["cost"],
            "costCurrency": annotation["currency"],
            "costEstimated": annotation["estimated"],
        }

    def _exact_cost(self, ids: list[str], series: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any] | None:
        """用真实小时电量算精确峰谷费用；小时数据覆盖不足时返回 ``None``。

        覆盖判据是「小时行合计 ≥ 日行合计的 98%」：小时行是本功能上线后才开始累积的，
        老库的历史只有日行；直接拿小时行算钱会得到「本月电费 ¥12」这种明显错误的结果。
        阈值取 98% 而不是 100%，是因为当前这一小时的增量在日行里已入账、小时行可能还没写。
        """
        if not ids or not series:
            return None
        prices = resolve_prices(cfg)
        if prices["tou"] is None:
            # 固定单价 / 阶梯口径本来就是精确的（按总量算），不需要小时数据。
            return None
        dates = [str(point.get("date") or "") for point in series if point.get("date")]
        if not dates:
            return None
        start_key, end_key = min(dates), max(dates)
        month_bucket = len(start_key) == 7
        start_day = f"{start_key}-01" if month_bucket else start_key
        end_day = f"{end_key}-31" if month_bucket else end_key
        try:
            with self._database.session_factory() as session:
                hourly_rows = session.execute(
                    select(EnergyUsageHourly.hour, func.sum(EnergyUsageHourly.kwh))
                    .where(
                        EnergyUsageHourly.entity_id.in_(ids),
                        EnergyUsageHourly.hour >= f"{start_day} 00",
                        EnergyUsageHourly.hour <= f"{end_day} 23",
                    )
                    .group_by(EnergyUsageHourly.hour)
                ).all()
                daily_total = session.scalar(
                    select(func.sum(EnergyUsageDaily.kwh)).where(
                        EnergyUsageDaily.entity_id.in_(ids),
                        EnergyUsageDaily.day >= start_day,
                        EnergyUsageDaily.day <= end_day,
                    )
                )
        except Exception:
            logger.debug("读取小时能耗失败，费用回退到估算口径", exc_info=True)
            return None
        hourly = [(str(hour), float(kwh or 0.0)) for hour, kwh in hourly_rows]
        hourly_total = sum(kwh for _hour, kwh in hourly)
        daily_sum = float(daily_total or 0.0)
        if daily_sum <= 0 or hourly_total < daily_sum * 0.98:
            return None
        computed = cost_from_hourly(hourly, cfg, prices=prices)
        buckets: dict[str, float] = {}
        for hour, kwh in hourly:
            key = hour[:7] if month_bucket else hour[:10]
            buckets[key] = round(buckets.get(key, 0.0) + _hour_cost(kwh, hour, cfg, prices), 2)
        return {"cost": computed["cost"], "buckets": buckets}
