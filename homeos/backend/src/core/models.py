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
    is_active: Mapped[bool] = mapped_column(
        "isActive", Boolean, nullable=False, default=True
    )
    #: 凭据是否外置到 ``admin_account`` 文件（homeos-3d 的账号自愈流程）。
    auth_externalized: Mapped[bool] = mapped_column(
        "authExternalized", Boolean, nullable=False, default=False
    )
    preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_version: Mapped[int] = mapped_column("tokenVersion", Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    sessions: Mapped[list[LoginSession]] = relationship(back_populates="user")


class LoginSession(Base):
    """DB 会话（并入 homeos-3d 的 LoginSession 会话模型）。

    ``id_hash`` 是会话令牌的 sha256（令牌本身绝不落库），作为主键，因而会话**可服务端
    吊销**，也便于审计最后活跃时间与来源 IP/UA。

    属性名沿用 homeos-3d 的 snake_case（便于移植来的 ``dependencies.py`` 等代码逐字通用），
    列名按 homeos 既有惯例走 camelCase。
    """

    __tablename__ = "sessions"
    __table_args__ = (Index("sessions_expiresAt_idx", "expiresAt"),)

    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        "userId", ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column("expiresAt", DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        "lastSeenAt", DateTime(timezone=True), nullable=False, default=utc_now
    )
    ip_address: Mapped[str] = mapped_column("ipAddress", String(64), nullable=False, default="")
    user_agent: Mapped[str] = mapped_column("userAgent", String(512), nullable=False, default="")

    user: Mapped[User] = relationship(back_populates="sessions")


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


# --------------------------------------------------------------------------- #
# 商业授权（并入 homeos-3d 授权服务）
# --------------------------------------------------------------------------- #
class LicenseState(Base):
    """授权单例状态行（``id`` 恒为 1），与 homeos-3d 的 license_state 表逐列对齐。

    表名与列名刻意保持 homeos-3d 的 snake_case：数据库状态字段可被改写，真正的门禁
    依据是 ``signed_lease`` 的 Ed25519 签名（离线验签，见 services/license/crypto.py）。
    同名列也便于一次性把 homeos-3d 的 app.db 数据原样导入（Phase 5）。
    """

    __tablename__ = "license_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    instance_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    license_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activation_code_hint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    encrypted_activation_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    activation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_lease: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_session_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_recovery_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="UNACTIVATED", index=True
    )
    lease_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    product_edition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    feature_set: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    max_projects: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_displays: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heartbeat_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# --------------------------------------------------------------------------- #
# 3D Studio 数据面（并入 homeos-3d：项目 / HA 目录 / 全局弹窗）
#
# 表名与列名一律保持 homeos-3d 的 snake_case：移植来的 ha/**、panel/**、
# modules/interaction3d/** 与 api/{projects,studio3d,assets,...}.py 直接按属性名访问，
# 无需改写；同时便于一次性导入 homeos-3d 的 app.db 数据。
# 注意：`User` / `LoginSession` / `LicenseState` 与 homeos-3d 同名但沿用 homeos 既有表，
# 因此这里的 FK 指向的是 homeos 的 `users`。
# 中控设备配对（display_pairing_codes / display_devices）已随配对码机制一并移除。
# --------------------------------------------------------------------------- #
class Project(Base):
    """Studio 项目（一个项目对应一套可编辑 / 可展示的 3D 仪表盘）。"""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProjectDraft(Base):
    """项目草稿（Studio 文档 JSON + 修订号），一行一项目。"""

    __tablename__ = "project_drafts"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class StudioInteractionSync(Base):
    """Studio ↔ interaction3d 的同步文档（单例行，``id`` 恒为 1）。"""

    __tablename__ = "studio_interaction_sync"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class GlobalCustomPopupState(Base):
    """全局自定义弹窗（单例行，``id`` 恒为 1）。"""

    __tablename__ = "global_custom_popup_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    popups_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class HAConnection(Base):
    """Home Assistant 连接（access token 加密落库）。"""

    __tablename__ = "ha_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False, default="Home Assistant")
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    external_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    encrypted_access_token: Mapped[str] = mapped_column(Text, nullable=False)
    verify_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    external_verify_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active_endpoint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    ha_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class HAEntity(Base):
    """HA 实体目录（连接 × 实体唯一）。"""

    __tablename__ = "ha_entities"
    __table_args__ = (
        UniqueConstraint("connection_id", "entity_id", name="uq_ha_entities_connection_entity"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    connection_id: Mapped[str] = mapped_column(
        ForeignKey("ha_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    platform: Mapped[str | None] = mapped_column(String(128), nullable=True)
    translation_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_entity_name: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    unique_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    area_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    disabled_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HADevice(Base):
    """HA 设备目录（连接 × 设备唯一）。"""

    __tablename__ = "ha_devices"
    __table_args__ = (
        UniqueConstraint("connection_id", "device_id", name="uq_ha_devices_connection_device"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    connection_id: Mapped[str] = mapped_column(
        ForeignKey("ha_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name_by_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    area_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    registry_metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    disabled_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HAArea(Base):
    """HA 区域目录（连接 × 区域唯一）。"""

    __tablename__ = "ha_areas"
    __table_args__ = (
        UniqueConstraint("connection_id", "area_id", name="uq_ha_areas_connection_area"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    connection_id: Mapped[str] = mapped_column(
        ForeignKey("ha_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    area_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HASyncState(Base):
    """HA 目录同步游标（一行一连接）。"""

    __tablename__ = "ha_sync_state"

    connection_id: Mapped[str] = mapped_column(
        ForeignKey("ha_connections.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_full_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_incremental_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    catalog_revision: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    entity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    device_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    area_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
