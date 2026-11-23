"""用水日用量表（``water_usage_daily``）。

## 为什么单独一张表，而不是复用 ``energy_usage_daily``

``energy_usage_daily`` 的读取路径（``read_daily_history`` / ``read_year_history`` /
``energy_guard``）都是**对 kwh 列直接求和**，调用方默认整张表同一种单位。把水表混进去，
「总用电 12 kWh」里就会掺进 0.4 m³ 的读数 —— 数字看起来正常，量级错了 1000 倍。

复用需要先改造所有求和路径按 ``unit`` 分组，风险远高于新建一张专用表；而用水只需
「今天用了多少 / 历史日均多少」，两张列就够。

## 写入方式

水表是累计读数（``state_class: total_increasing``）。累计表只能靠差分得到区间用量，
而差分需要在进程内记住上一次读数 —— 这份状态**刻意不落库**：重启后第一轮没有基线，
跳过即可（少记一次 60 秒的增量，而不是记错一整天的用量）。
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid4())


class WaterUsageDaily(Base):
    """用水日聚合（每实体每天一行，单位立方米）。"""

    __tablename__ = "water_usage_daily"
    __table_args__ = (
        UniqueConstraint("entityId", "day", name="water_usage_daily_key"),
        Index("water_usage_daily_day_idx", "day"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    day: Mapped[str] = mapped_column(String(16), nullable=False)
    cubic_meters: Mapped[float] = mapped_column("cubicMeters", Float, nullable=False, default=0.0)
    sample_count: Mapped[int] = mapped_column("sampleCount", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=_utc_now, onupdate=_utc_now
    )
