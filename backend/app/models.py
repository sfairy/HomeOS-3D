"""ORM 模型定义：主应用的全部数据表。

约定：
- 所有时间列都是 UTC aware（`DateTime(timezone=True)`），默认值统一用 `utc_now`，
  展示时由前端按浏览器本地时区换算。
- 需要加密的敏感字段（HA 令牌、激活码、会话令牌）以 `encrypted_*` 命名，
  库里存密文，密钥在 `data/secrets/` 下。
- 同步自 Home Assistant 的表（ha_entities / ha_devices / ha_areas）
  用 `sync_status` + `missing_since` 表达「曾经存在但当前消失」，
  不直接删行，这样仪表盘上已绑定的实体不会因为一次同步失败就丢失绑定。
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    """所有时间列的默认值来源，保证入库时间带 UTC 时区。"""
    return datetime.now(timezone.utc)


class User(Base):
    """管理员账号的库内身份行。

    注意：认证不读这里的 `password_hash`。凭据已外置到 admin-account.json，
    这一行保留主要是为了让 project.created_by 等外键有稳定的引用目标。
    """

    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default='admin')
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # True 表示凭据已外置到账号文件，库内 password_hash 只是哨兵值、不可用于登录。
    auth_externalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    sessions: Mapped[list['LoginSession']] = relationship(back_populates='user', cascade='all, delete-orphan')


class LoginSession(Base):
    """管理员登录会话；主键是令牌的 sha256，明文令牌只存在于浏览器 Cookie。

    删除用户时会话级联删除，因此账号重置只需清空这张表。
    """

    __tablename__ = 'sessions'

    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False, default='')
    user_agent: Mapped[str] = mapped_column(String(512), nullable=False, default='')
    user: Mapped[User] = relationship(back_populates='sessions')


class DisplayPairingCode(Base):
    """中控配对码：6 位数字码的哈希 + 可回显的密文。

    同时存哈希与密文是为了兼顾安全与易用：哈希用于配对时校验，
    密文（对称加密）让管理员日后还能在界面上看到当初发的那个码。
    """

    __tablename__ = 'display_pairing_codes'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    encrypted_code: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    device: Mapped['DisplayDevice | None'] = relationship(back_populates='pairing_code', cascade='all, delete-orphan', passive_deletes=True, uselist=False)


class DisplayDevice(Base):
    """已配对的中控设备。

    `pairing_code_id` 可为空：早期版本创建的设备没有关联配对码，
    它们不受配对码启停影响，只能由管理员显式吊销（写 revoked_at）。
    """

    __tablename__ = 'display_devices'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    pairing_code_id: Mapped[str | None] = mapped_column(ForeignKey('display_pairing_codes.id', ondelete='CASCADE'), nullable=True, unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False, default='')
    user_agent: Mapped[str] = mapped_column(String(512), nullable=False, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    pairing_code: Mapped[DisplayPairingCode | None] = relationship(back_populates='device')


class HAConnection(Base):
    """一条 Home Assistant 连接配置。

    长期访问令牌以密文存放；`is_active` 用来标记当前生效的那一条，
    新同步写入实体时只认活跃连接。
    """

    __tablename__ = 'ha_connections'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False, default='Home Assistant')
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    encrypted_access_token: Mapped[str] = mapped_column(Text, nullable=False)
    verify_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    ha_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class HAEntity(Base):
    """从 HA 同步来的实体。

    唯一约束是 (connection_id, entity_id)：换了一条连接后同名实体是另一条记录。
    实体在 HA 里消失时不删行，而是把 sync_status 置为非 active 并记 missing_since，
    这样仪表盘的绑定关系不会因为 HA 临时重启就丢失。
    """

    __tablename__ = 'ha_entities'
    __table_args__ = (UniqueConstraint('connection_id', 'entity_id', name='uq_ha_entities_connection_entity'),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    connection_id: Mapped[str] = mapped_column(ForeignKey('ha_connections.id', ondelete='CASCADE'), nullable=False, index=True)
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
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default='active', index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HADevice(Base):
    """从 HA 设备注册表同步来的物理设备。

    `registry_metadata_json` 原样保存注册表元数据，
    为的是将来前端需要更多字段时不必再加列、也不必重跑全量同步。
    """

    __tablename__ = 'ha_devices'
    __table_args__ = (UniqueConstraint('connection_id', 'device_id', name='uq_ha_devices_connection_device'),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    connection_id: Mapped[str] = mapped_column(ForeignKey('ha_connections.id', ondelete='CASCADE'), nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name_by_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    area_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    registry_metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    disabled_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default='active', index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HAArea(Base):
    """从 HA 区域注册表同步来的区域（房间）。

    `aliases_json` 保存区域的别名数组，用于在中文环境里匹配房间名。
    """

    __tablename__ = 'ha_areas'
    __table_args__ = (UniqueConstraint('connection_id', 'area_id', name='uq_ha_areas_connection_area'),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    connection_id: Mapped[str] = mapped_column(ForeignKey('ha_connections.id', ondelete='CASCADE'), nullable=False, index=True)
    area_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases_json: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default='active', index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    missing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HASyncState(Base):
    """每条连接的同步进度与统计（主键就是 connection_id，一行一连接）。

    `catalog_revision` 每次实体目录变化就自增，前端据此判断要不要重新拉实体列表，
    避免每次都做全量比对。
    """

    __tablename__ = 'ha_sync_state'

    connection_id: Mapped[str] = mapped_column(ForeignKey('ha_connections.id', ondelete='CASCADE'), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='idle')
    phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_full_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_incremental_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    catalog_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default='0')
    entity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    device_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    area_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Project(Base):
    """一个仪表盘项目。

    `name` 全局唯一，因为它同时被用作展示地址 `/display/{项目名称}` 的路径段；
    `slug` 则是给内部与文件命名用的 ASCII 形式。
    两条唯一性都由数据库的唯一索引兜底（应用层那次「先查后写」只是为了让常见错误
    尽早返回中文提示，并发下挡不住）：`name` 的冲突回 409 让用户改名，
    `slug` 的冲突换一个后缀重试，见 `api/projects.insert_project_with_draft`。
    `created_by` 用 RESTRICT：只要还有项目引用，就不允许删除该用户行。
    """

    __tablename__ = 'projects'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default='')
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ProjectDraft(Base):
    """项目草稿：与 Project 一对一（主键就是 project_id）。

    `revision` 是乐观锁：保存时必须带上客户端读到的版本号，
    不一致说明另一个页面已经改过，接口返回 409 让用户选择覆盖还是加载服务端版本。
    """

    __tablename__ = 'project_drafts'

    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class GlobalCustomPopupState(Base):
    """全局组合弹窗的单行状态表（固定 id=1）。

    弹窗内容整体以 JSON 数组存在 `popups_json` 里，`revision` 用于并发检测。
    `updated_by` 用 SET NULL：删用户不该连带删掉弹窗，只丢掉"最后修改人"。
    """

    __tablename__ = 'global_custom_popup_state'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    popups_json: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    updated_by: Mapped[str | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class LicenseState(Base):
    """本机授权状态（单行，固定 id=1）。

    敏感值全部加密存放：激活码、会话令牌、恢复令牌。`signed_lease` 是服务端签发的
    Ed25519 签名租约原文，客户端离线验签即可判断是否仍然有效。
    `status` 取值包括 UNACTIVATED / ACTIVE / CONNECTION_WARNING / LEASE_EXPIRED / REVOKED；
    其中只有「确认吊销」与「租约过期」会拦截功能，其余按联网告警处理。
    """

    __tablename__ = 'license_state'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    instance_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    license_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activation_code_hint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 以下三个 encrypted_* 字段存放密文，密钥来自 data/secrets/license_credentials.key。
    encrypted_activation_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    activation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_lease: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_session_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_recovery_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='UNACTIVATED', index=True)
    lease_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    product_edition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # feature_set 是能力码的 JSON 数组，租约校验通过后由 LicenseService.allows 读取。
    feature_set: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    max_projects: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_displays: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heartbeat_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
