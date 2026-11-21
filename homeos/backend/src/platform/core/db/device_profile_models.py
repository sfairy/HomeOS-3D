"""设备画像表（媒体 / 空调的 kind、别名、房间默认设备与人工确认审计）。

处理三个域：

- ``media_player``：``apple_tv | tv | speaker | receiver | unknown``；
- ``climate``：``ac_split | ac_central | boiler | floor_heating | water_heater | bath_heater | unknown``；
- ``water_heater``：``water_heater | unknown``（HA 原生热水器域，形态同样需人工确认）。

``climate`` / ``water_heater`` 恒为 ``unknown`` 且必须人工确认：制热形态无法从实体属性
可靠推断，猜错会让「调温度」下发到错误的服务参数。

``DeviceProfileAudit`` 记录人工确认 / 撤销 / 别名改写，供面板回看「谁在什么时候把
这台设备改成了什么」—— 撤销确认不再是一次不可追溯的覆盖。
"""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_uuid, utc_now


class DeviceProfile(Base):
    """一台设备的画像（按实体唯一）。"""

    __tablename__ = "device_profiles"
    __table_args__ = (
        UniqueConstraint("entityId", name="device_profiles_entity"),
        Index("device_profiles_domain_idx", "domain"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    #: 分类置信度 0–1；< 0.85 且未确认时视为「可用但需人工确认」。
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="RULE")
    #: JSON 数组：用户自定义别名（≤30 条、每条 ≤60 字）
    aliases_json: Mapped[str] = mapped_column("aliasesJson", Text, nullable=False, default="[]")
    #: JSON 数组：分类依据（便于前端解释「为什么判成 Apple TV」）
    evidence_json: Mapped[str] = mapped_column("evidenceJson", Text, nullable=False, default="[]")
    classifier_version: Mapped[str] = mapped_column("classifierVersion", String(32), nullable=False, default="rule-v1")
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    attributes_hash: Mapped[str] = mapped_column("attributesHash", String(64), nullable=False, default="")
    #: 最近一次在 HA 快照里见到该实体的时刻（判断「多久没见到了」的唯一依据）
    last_seen_at: Mapped[datetime | None] = mapped_column("lastSeenAt", DateTime, nullable=True)
    #: 最近一次重新分类的时刻（属性指纹变化或规则版本升级时才推进）
    last_classified_at: Mapped[datetime | None] = mapped_column("lastClassifiedAt", DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    def aliases(self) -> list[str]:
        try:
            value = json.loads(self.aliases_json)
            return [str(item) for item in value] if isinstance(value, list) else []
        except (TypeError, ValueError):  # fmt: skip
            return []


class DeviceProfileDefault(Base):
    """房间默认设备：``(areaId, kind)`` 唯一，``entityId`` 与 ``maPlayerId`` 二选一。"""

    __tablename__ = "device_profile_defaults"
    __table_args__ = (
        UniqueConstraint("areaId", "kind", name="device_profile_defaults_area_kind"),
        Index("device_profile_defaults_entity_idx", "entityId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    area_id: Mapped[str] = mapped_column("areaId", String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str | None] = mapped_column("entityId", String(255), nullable=True)
    #: Music Assistant 播放器 id（与 entityId 二选一）
    ma_player_id: Mapped[str | None] = mapped_column("maPlayerId", String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column("sortOrder", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class DeviceProfileAudit(Base):
    """人工确认审计：每次确认 / 撤销 / 别名改写都落一行，便于回看与追责。"""

    __tablename__ = "device_profile_audit"
    __table_args__ = (
        Index("device_profile_audit_entity_idx", "entityId"),
        Index("device_profile_audit_created_idx", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    #: confirm | clear_confirmation | aliases
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_kind: Mapped[str] = mapped_column("fromKind", String(32), nullable=False, default="")
    to_kind: Mapped[str] = mapped_column("toKind", String(32), nullable=False, default="")
    aliases_json: Mapped[str] = mapped_column("aliasesJson", Text, nullable=False, default="[]")
    actor: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


__all__ = ["DeviceProfile", "DeviceProfileAudit", "DeviceProfileDefault"]
