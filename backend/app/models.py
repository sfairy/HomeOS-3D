from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default='admin')
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auth_externalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    sessions: Mapped[list['LoginSession']] = relationship(back_populates='user', cascade='all, delete-orphan')


class LoginSession(Base):
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
    __tablename__ = 'projects'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default='')
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ProjectDraft(Base):
    __tablename__ = 'project_drafts'

    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class GlobalCustomPopupState(Base):
    __tablename__ = 'global_custom_popup_state'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    popups_json: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    updated_by: Mapped[str | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class LicenseState(Base):
    __tablename__ = 'license_state'

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
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='UNACTIVATED', index=True)
    lease_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    product_edition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    feature_set: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    max_projects: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_displays: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heartbeat_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
