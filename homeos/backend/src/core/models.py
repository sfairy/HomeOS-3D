"""ORM 模型：映射 Nest 侧 Prisma schema 的全部业务表到 SQLite。

迁移决策为「完全改用 SQLite」，因此相对 ``backend/prisma/schema.prisma`` 做了如下
**受控调整**（业务语义不变，仅存储形态适配 SQLite）：

- ``Json`` / ``JsonB`` → ``Text`` 存 JSON 文本（读取时 ``json.loads``）；
- ``EventLog`` 的 ``@@id([createdAt, id])`` + 原生按月分区 + BRIN 索引 → 普通自增主键表
  + 三个 B-tree 复合索引（SQLite 无分区/BRIN，改由保留策略任务按 ``createdAt`` 删除）；
- ``HomeMode`` 的「同组仅一条 isActive」部分唯一索引 → ``sqlite_where`` 部分索引；
- ``BigInt`` → ``Integer``（SQLite INTEGER 即 64 位）。

表名按 SQLite 惯例改为 snake_case 复数（如 Prisma ``EventLog`` → ``event_logs``）；
列名与 Prisma 保持一致（camelCase，如 ``createdAt`` / ``entityId``），以便既有
PostgreSQL 数据经一次性迁移脚本（``scripts/import_from_postgres.py``）原样导入。
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> str:
    return str(uuid4())


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class JsonMixin:
    """JSON 文本列的读写便捷方法。"""

    @staticmethod
    def load(raw: str | None, default: Any = None) -> Any:
        if raw is None or raw == "":
            return default
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return default


# --------------------------------------------------------------------------- #
# 用户与鉴权
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="admin")
    preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_version: Mapped[int] = mapped_column("tokenVersion", Integer, nullable=False, default=0)
    failed_login_attempts: Mapped[int] = mapped_column(
        "failedLoginAttempts", Integer, nullable=False, default=0
    )
    locked_until: Mapped[datetime | None] = mapped_column("lockedUntil", DateTime, nullable=True)
    totp_secret: Mapped[str | None] = mapped_column("totpSecret", String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(
        "totpEnabled", Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    command_audits: Mapped[list[CommandAudit]] = relationship(back_populates="user")
    login_audits: Mapped[list[LoginAudit]] = relationship(back_populates="user")


class LoginAudit(Base):
    __tablename__ = "login_audits"
    __table_args__ = (
        Index("login_audits_createdAt_idx", "createdAt"),
        Index("login_audits_username_idx", "username"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        "userId", ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )

    user: Mapped[User | None] = relationship(back_populates="login_audits")


class GuestShareCode(Base):
    __tablename__ = "guest_share_codes"
    __table_args__ = (Index("guest_share_codes_expiresAt_idx", "expiresAt"),)

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )


# --------------------------------------------------------------------------- #
# 配置与审计
# --------------------------------------------------------------------------- #
class ProjectConfig(Base):
    __tablename__ = "project_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", String(128), unique=True, nullable=False, default="default"
    )
    layout: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class CommandAudit(Base):
    __tablename__ = "command_audits"
    __table_args__ = (
        Index("command_audits_createdAt_idx", "createdAt"),
        Index("command_audits_entityId_idx", "entityId"),
        Index("command_audits_userId_idx", "userId"),
        Index("command_audits_username_createdAt_idx", "username", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(
        "userId", ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    domain: Mapped[str] = mapped_column(String(64), nullable=False)
    service: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )

    user: Mapped[User | None] = relationship(back_populates="command_audits")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("notifications_createdAt_idx", "createdAt"),
        Index("notifications_read_createdAt_idx", "read", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    level: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str | None] = mapped_column("entityId", String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    delivered_at: Mapped[datetime | None] = mapped_column("deliveredAt", DateTime, nullable=True)
    delivery_channels: Mapped[str] = mapped_column(
        "deliveryChannels", Text, nullable=False, default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )


class SecurityEvent(Base):
    __tablename__ = "security_events"
    __table_args__ = (
        Index("security_events_type_idx", "type"),
        Index("security_events_createdAt_idx", "createdAt"),
        Index("security_events_type_createdAt_idx", "type", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_id: Mapped[str | None] = mapped_column("entityId", String(255), nullable=True)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    zones: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )


class EarthquakeAlertHistory(Base):
    __tablename__ = "earthquake_alert_history"
    __table_args__ = (
        Index("earthquake_alert_history_savedAt_idx", "savedAt"),
        Index("earthquake_alert_history_eventId_idx", "eventId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    event_id: Mapped[str] = mapped_column("eventId", String(128), nullable=False)
    epicenter: Mapped[str] = mapped_column(String(255), nullable=False)
    magnitude: Mapped[float] = mapped_column(Float, nullable=False)
    depth: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    origin_time: Mapped[int] = mapped_column("originTime", Integer, nullable=False)
    distance: Mapped[float] = mapped_column(Float, nullable=False)
    countdown: Mapped[int] = mapped_column(Integer, nullable=False)
    local_intensity: Mapped[float] = mapped_column("localIntensity", Float, nullable=False)
    max_intensity: Mapped[str | None] = mapped_column("maxIntensity", String(32), nullable=True)
    alert_kind: Mapped[str | None] = mapped_column("alertKind", String(32), nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        "savedAt", DateTime, nullable=False, default=utc_now
    )


class AlertRule(Base):
    __tablename__ = "alert_rules"
    __table_args__ = (
        Index("alert_rules_enabled_idx", "enabled"),
        Index("alert_rules_entityId_idx", "entityId"),
        Index("alert_rules_createdAt_idx", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_id: Mapped[str | None] = mapped_column("entityId", String(255), nullable=True)
    condition: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(16), nullable=False, default="warn")
    channels: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    cooldown_minutes: Mapped[int] = mapped_column(
        "cooldownMinutes", Integer, nullable=False, default=60
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    message_template: Mapped[str | None] = mapped_column("messageTemplate", Text, nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class HomeMode(Base):
    __tablename__ = "home_modes"
    __table_args__ = (
        Index("home_modes_isActive_idx", "isActive"),
        # 同互斥组仅允许一条 isActive=true（SQLite 部分唯一索引，等价 Prisma init SQL）。
        Index(
            "home_modes_exclusive_active_uidx",
            "exclusiveGroup",
            unique=True,
            sqlite_where=text("isActive = 1"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(64), nullable=False, default="home")
    config: Mapped[str] = mapped_column(Text, nullable=False)
    triggers: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, nullable=False, default=False)
    device_snapshot: Mapped[str | None] = mapped_column("deviceSnapshot", Text, nullable=True)
    sort_order: Mapped[int] = mapped_column("sortOrder", Integer, nullable=False, default=0)
    exclusive_group: Mapped[str | None] = mapped_column(
        "exclusiveGroup", String(64), nullable=True, default="default"
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default="default")
    data: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class RuntimeKv(Base):
    __tablename__ = "runtime_kv"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    data: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class ChildModeRuntime(Base):
    __tablename__ = "child_mode_runtime"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default="default")
    media_used_min: Mapped[float] = mapped_column(
        "mediaUsedMin", Float, nullable=False, default=0.0
    )
    usage_date: Mapped[str] = mapped_column("usageDate", String(16), nullable=False, default="")
    override_until: Mapped[int] = mapped_column("overrideUntil", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class AwayPatternBucket(Base):
    __tablename__ = "away_pattern_buckets"
    __table_args__ = (UniqueConstraint("dow", "hour", name="away_pattern_buckets_dow_hour_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    dow: Mapped[int] = mapped_column(Integer, nullable=False)
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    light_on_prob: Mapped[float] = mapped_column(
        "lightOnProb", Float, nullable=False, default=0.0
    )
    sample_count: Mapped[int] = mapped_column("sampleCount", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class GuestPass(Base):
    __tablename__ = "guest_passes"
    __table_args__ = (
        Index("guest_passes_active_expiresAt_idx", "active", "expiresAt"),
        Index("guest_passes_lockEntityId_idx", "lockEntityId"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    lock_entity_id: Mapped[str] = mapped_column("lockEntityId", String(255), nullable=False)
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    code_cipher: Mapped[str] = mapped_column("codeCipher", Text, nullable=False)
    code_iv: Mapped[str] = mapped_column("codeIv", Text, nullable=False)
    code_tag: Mapped[str] = mapped_column("codeTag", Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class WebPushSubscription(Base):
    __tablename__ = "web_push_subscriptions"
    __table_args__ = (Index("web_push_subscriptions_createdAt_idx", "createdAt"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column("userAgent", Text, nullable=True)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class EventLog(Base):
    """HA 状态事件日志。

    相对 Prisma 的分区表：SQLite 用自增主键 + 复合索引；保留策略按 ``createdAt``
    定期清理（替代按整月 DROP 分区）。
    """

    __tablename__ = "event_logs"
    __table_args__ = (
        Index("event_logs_entityId_createdAt_idx", "entityId", "createdAt"),
        Index("event_logs_domain_createdAt_idx", "domain", "createdAt"),
        Index("event_logs_createdAt_idx", "createdAt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    old_state: Mapped[str | None] = mapped_column("oldState", Text, nullable=True)
    new_state: Mapped[str | None] = mapped_column("newState", Text, nullable=True)
    state_diff: Mapped[str | None] = mapped_column("stateDiff", String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )


class DeviceUsageStat(Base):
    __tablename__ = "device_usage_stats"
    __table_args__ = (
        UniqueConstraint("entityId", "day", name="device_usage_stats_entityId_day_key"),
        Index("device_usage_stats_day_idx", "day"),
        Index("device_usage_stats_entityId_idx", "entityId"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    day: Mapped[str] = mapped_column(String(16), nullable=False)
    on_count: Mapped[int] = mapped_column("onCount", Integer, nullable=False, default=0)
    total_runtime_ms: Mapped[int] = mapped_column(
        "totalRuntimeMs", Integer, nullable=False, default=0
    )
    last_on: Mapped[datetime | None] = mapped_column("lastOn", DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class EnvironmentRecord(Base):
    """环境读数历史（温湿度 / IAQ），供周期对比报表按天均值统计。

    Nest 侧以原生 SQL 引用 ``EnvironmentRecord``（未在 Prisma schema 中声明），
    这里显式建模并由基线迁移建表，保证 environment 指标可用。
    """

    __tablename__ = "environment_records"
    __table_args__ = (
        Index("environment_records_room_recordedAt_idx", "room", "recordedAt"),
        Index("environment_records_recordedAt_idx", "recordedAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    room: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    iaq_score: Mapped[float | None] = mapped_column("iaqScore", Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        "recordedAt", DateTime, nullable=False, default=utc_now
    )


class EnergyCandidateEntity(Base):
    """能耗计量候选实体白名单（只增不删），供能耗排名/基线精确筛选。"""

    __tablename__ = "energy_candidate_entities"

    entity_id: Mapped[str] = mapped_column("entityId", String(255), primary_key=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        "firstSeenAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class EnergyUsageDaily(Base):
    """能耗日聚合（Redis 不可用时的趋势查询回退源）。"""

    __tablename__ = "energy_usage_daily"
    __table_args__ = (UniqueConstraint("entityId", "day", name="energy_usage_daily_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    day: Mapped[str] = mapped_column(String(16), nullable=False)
    kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sample_count: Mapped[int] = mapped_column("sampleCount", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class EnergyUsageMonthly(Base):
    """能耗月聚合（Redis 不可用时的趋势查询回退源）。"""

    __tablename__ = "energy_usage_monthly"
    __table_args__ = (UniqueConstraint("entityId", "month", name="energy_usage_monthly_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_id: Mapped[str] = mapped_column("entityId", String(255), nullable=False)
    month: Mapped[str] = mapped_column(String(16), nullable=False)
    kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sample_count: Mapped[int] = mapped_column("sampleCount", Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )
