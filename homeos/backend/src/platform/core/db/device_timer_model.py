"""设备倒计时表（``device_timers``）。

放在独立模块而不是塞回 ``models.py``：后者已经很大，而这张表
与其它模型没有任何关系。``models.py`` 末尾 import 本模块，保证 ``Base.metadata`` 里
注册到它（``create_all`` 才能建表）。
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid4())


class DeviceTimer(Base):
    """设备倒计时（「30 分钟后关灯」）。

    **必须持久化**：倒计时的语义是「我离开后它自己会关」，进程重启就丢会让灯亮一整夜 ——
    这正是最需要它可靠的场景（用户已经睡了，没人会发现计时器没了）。

    ``fire_at`` 存 naive UTC（与项目其余时间列一致），重启后按它续算；已经过期的条目在
    启动时立即补发一次（见 ``DeviceTimerService.load``），而不是静默丢弃。
    """

    __tablename__ = "device_timers"
    __table_args__ = (
        Index("device_timers_fireAt_idx", "fireAt"),
        UniqueConstraint("entityId", "service", name="device_timers_entity_service_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(32), nullable=False)
    service: Mapped[str] = mapped_column(String(64), nullable=False)
    #: 服务参数（JSON 文本）：例如 ``{"brightness": 0}``。
    service_data: Mapped[str] = mapped_column("serviceData", Text, nullable=False, default="{}")
    fire_at: Mapped[datetime] = mapped_column("fireAt", DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=_utc_now)
    created_by: Mapped[str | None] = mapped_column("createdBy", String(128), nullable=True)
