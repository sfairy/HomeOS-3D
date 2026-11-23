"""用水用量采集与「日用量异常」判定。

## 数据来源

水表在 HA 里是累计读数（``state_class: total_increasing``，单位 m³ 或 L）。区间用量只能
靠差分得到，所以这里维护「每个表最后一次读数」：

- 读数**只增**时，差值即上次采集以来的用量；
- 读数**变小**（换表 / 表底归零）时，按「重置」处理：本轮不计增量，重置后的读数额留作
  新基线 —— 把重置当成负增量会让当天用量变成负数；
- 单次增量超过 ``MAX_SINGLE_DELTA_M3``（默认 5 m³ / 采集周期）判为「不是真实用水」
  （表被替换、单位错配、集成补发历史），同样只更新基线不计账。

基线**不落库**：重启后第一轮没有基线就跳过（少记一次采集周期的增量），而不是凭空
造一个「从 0 到当前读数」的假用量。

## 判定

今日累计 ≥ 前 N 个**有数据日**均值 × ``dailyAnomalyRatio`` 即认为异常。用「有数据日」
而不是「前 N 天」：新装表前的那些天没有数据，按 0 参与平均会把基线压到很低，于是
正常用水也会误报。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from ...platform.core.db.models import WaterUsageDaily

logger = logging.getLogger("homeos.water.usage")

#: 单次采集周期内合理的最大增量（m³）。超过即视为换表 / 单位错配 / 历史补发。
MAX_SINGLE_DELTA_M3 = 5.0

#: 单位 → m³ 的换算因子。
_VOLUME_UNIT_FACTORS: dict[str, float] = {
    "m³": 1.0,
    "m3": 1.0,
    "m^3": 1.0,
    "立方米": 1.0,
    "l": 0.001,
    "升": 0.001,
    "ml": 1e-6,
}


def _num(raw: Any) -> float | None:
    if isinstance(raw, bool) or raw is None:
        return None
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("水表读数不是数值，跳过: %r", raw)
        return None


def meter_reading_m3(entity: dict[str, Any]) -> float | None:
    """累计水表读数 → 立方米；不是水表时返回 ``None``。

    只认 ``device_class: water`` 且状态可解析的 ``sensor.*``。单位缺失时按 m³ 解释
    （HA 对水表默认就是 m³）。
    """
    entity_id = str(entity.get("entity_id") or "")
    if not entity_id.startswith("sensor."):
        return None
    attrs = entity.get("attributes")
    attrs = attrs if isinstance(attrs, dict) else {}
    if str(attrs.get("device_class") or "").strip().lower() != "water":
        return None
    value = _num(entity.get("state"))
    if value is None or value < 0:
        return None
    unit = str(attrs.get("unit_of_measurement") or "m³").strip().lower()
    factor = _VOLUME_UNIT_FACTORS.get(unit)
    if factor is None:
        # 单位不是体积（例如误配成 % / W）时不要猜：猜错会把某个百分比写成几立方米。
        logger.debug("水表单位不是体积，跳过: %s (%s)", entity_id, unit)
        return None
    return value * factor


def business_day(now: datetime | None = None, timezone_name: str | None = None) -> str:
    """家庭时区的日键（与能耗日切同口径）。"""
    from ..client_power.energy_meter import business_day_key

    return business_day_key(now or datetime.now(UTC), timezone_name)


class WaterUsageStore:
    """水表用量采集与历史查询（同步 SQLite，调用方负责丢线程池）。"""

    def __init__(self, session_factory: Any) -> None:
        self._session_factory = session_factory

    # ---- 采集 ----
    def record_delta(self, entity_id: str, day: str, delta_m3: float) -> None:
        """把一段增量累加进某实体某天（只增不减）。"""
        if delta_m3 <= 0:
            return
        try:
            with self._session_factory() as session:
                row = session.scalars(
                    select(WaterUsageDaily).where(WaterUsageDaily.entity_id == entity_id, WaterUsageDaily.day == day)
                ).first()
                if row is None:
                    session.add(
                        WaterUsageDaily(
                            entity_id=entity_id,
                            day=day,
                            cubic_meters=delta_m3,
                            sample_count=1,
                        )
                    )
                else:
                    row.cubic_meters = float(row.cubic_meters or 0.0) + delta_m3
                    row.sample_count = int(row.sample_count or 0) + 1
                session.commit()
        except Exception:
            logger.warning("写入用水日用量失败: %s", entity_id, exc_info=True)

    # ---- 查询 ----
    def today_total(self, entity_ids: list[str], day: str) -> float:
        """今日用水合计（m³）。"""
        if not entity_ids:
            return 0.0
        try:
            with self._session_factory() as session:
                value = session.scalar(
                    select(func.sum(WaterUsageDaily.cubic_meters)).where(
                        WaterUsageDaily.entity_id.in_(entity_ids),
                        WaterUsageDaily.day == day,
                    )
                )
        except Exception:
            logger.debug("读取今日用水失败", exc_info=True)
            return 0.0
        return float(value or 0.0)

    def baseline(self, entity_ids: list[str], day: str, learning_days: int) -> tuple[float | None, int]:
        """前 N 天的日均用水与有效天数（只统计有数据的日）。"""
        if not entity_ids:
            return None, 0
        try:
            start = (datetime.fromisoformat(day) - timedelta(days=learning_days)).date().isoformat()
            with self._session_factory() as session:
                rows = session.execute(
                    select(WaterUsageDaily.day, func.sum(WaterUsageDaily.cubic_meters))
                    .where(
                        WaterUsageDaily.entity_id.in_(entity_ids),
                        WaterUsageDaily.day >= start,
                        WaterUsageDaily.day < day,
                    )
                    .group_by(WaterUsageDaily.day)
                ).all()
        except Exception:
            logger.debug("读取用水基线失败", exc_info=True)
            return None, 0
        values = [float(total or 0.0) for _d, total in rows if float(total or 0.0) > 0]
        if not values:
            return None, 0
        return sum(values) / len(values), len(values)


__all__ = [
    "MAX_SINGLE_DELTA_M3",
    "WaterUsageStore",
    "business_day",
    "meter_reading_m3",
]
