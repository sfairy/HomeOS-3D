"""HomeOS 主应用结构基线：与当前 ORM 元数据完全一致的全新库结构。

本文件是 ``0001`` … ``0023`` 整条迁移链的**压缩基线**：项目仍在开发阶段，没有需要
兼容的存量部署，于是把早期逐次增删的迁移收敛成一次建表。它精确等于
``backend/src/models.py`` 里的 ``Base.metadata``，不是对着某个存量库生成的增量差异。

生成与校验：
- 由 ``alembic revision --autogenerate`` 对着**空库**生成，因此建出来的结构与 ORM 逐列一致；
- ``ops/check_schema.py`` 会验证「全新库能建出来」「``alembic check`` 无差异」
    「重复执行无副作用」三件事。

紧随其后的两处修正也已一并折进本基线（原 ``0002``/``0003`` 已删除）：
- ``display_devices.pairing_code_id`` 外键直接建成 ``ondelete='SET NULL'``（删除配对码
  不再连带删除已绑定的中控设备）；
- ``projects.name`` 直接建出唯一索引 ``ix_projects_name``（并发写入不再产生同名仪表盘），
  全新库没有历史重名数据，不需要消重步骤。

随压缩一起删除的都是**一次性**历史逻辑，不再需要：
- ``0010``/``0015``/``0016``/``0017``/``0018``/``0023``：改写存量文档 JSON 的数据迁移
  （弹窗库化、3D 主题与灯光预设、清理 ``uiPack``）—— 全新库直接建出最终结构；
- ``0011``：为 0.3.3 时期的老库补的历史列 ``users.editor_theme_mode``，ORM 不再建模；
- ``0019``：空迁移。

**旧版开发库不再兼容**：库内记录的 revision 不在新脚本目录里，启动迁移会明确报错
（见 ``backend/src/migrations.py``）。开发机上删掉 ``homeos-3d/data/`` 重新建库即可。

Revision ID: 0001
Revises:
Create Date: 2026-10-02

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('ha_connections',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('name', sa.String(length = 128), nullable = False),
    sa.Column('base_url', sa.String(length = 512), nullable = False),
    sa.Column('external_base_url', sa.String(length = 512), nullable = True),
    sa.Column('encrypted_access_token', sa.Text(), nullable = False),
    sa.Column('verify_tls', sa.Boolean(), nullable = False),
    sa.Column('external_verify_tls', sa.Boolean(), nullable = False),
    sa.Column('active_endpoint', sa.String(length = 16), nullable = True),
    sa.Column('is_active', sa.Boolean(), nullable = False),
    sa.Column('ha_version', sa.String(length = 64), nullable = True),
    sa.Column('last_connected_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_error', sa.Text(), nullable = True),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ha_connections_is_active'), 'ha_connections', ['is_active'], unique = False)
    op.create_table('license_state',
    sa.Column('id', sa.Integer(), nullable = False),
    sa.Column('instance_id', sa.String(length = 64), nullable = False),
    sa.Column('license_id', sa.String(length = 64), nullable = True),
    sa.Column('lease_id', sa.String(length = 64), nullable = True),
    sa.Column('session_id', sa.String(length = 64), nullable = True),
    sa.Column('lease_sequence', sa.Integer(), nullable = False),
    sa.Column('activation_code_hint', sa.String(length = 16), nullable = True),
    sa.Column('encrypted_activation_code', sa.Text(), nullable = True),
    sa.Column('activation_email', sa.String(length = 255), nullable = True),
    sa.Column('signed_lease', sa.Text(), nullable = True),
    sa.Column('encrypted_session_token', sa.Text(), nullable = True),
    sa.Column('encrypted_recovery_token', sa.Text(), nullable = True),
    sa.Column('status', sa.String(length = 32), nullable = False),
    sa.Column('lease_issued_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('lease_expires_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_verified_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('product_edition', sa.String(length = 64), nullable = True),
    sa.Column('feature_set', sa.Text(), nullable = False),
    sa.Column('max_projects', sa.Integer(), nullable = False),
    sa.Column('max_displays', sa.Integer(), nullable = False),
    sa.Column('heartbeat_interval_seconds', sa.Integer(), nullable = False),
    sa.Column('last_error', sa.Text(), nullable = True),
    sa.Column('activated_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('deactivated_at', sa.DateTime(timezone = True), nullable = True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('instance_id')
    )
    op.create_index(op.f('ix_license_state_status'), 'license_state', ['status'], unique = False)
    op.create_table('studio_interaction_sync',
    sa.Column('id', sa.Integer(), nullable = False),
    sa.Column('document_json', sa.Text(), nullable = False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('username', sa.String(length = 64), nullable = False),
    sa.Column('password_hash', sa.String(length = 512), nullable = False),
    sa.Column('role', sa.String(length = 32), nullable = False),
    sa.Column('is_active', sa.Boolean(), nullable = False),
    sa.Column('auth_externalized', sa.Boolean(), nullable = False),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique = True)
    op.create_table('global_custom_popup_state',
    sa.Column('id', sa.Integer(), nullable = False),
    sa.Column('revision', sa.Integer(), nullable = False),
    sa.Column('popups_json', sa.Text(), nullable = False),
    sa.Column('updated_by', sa.String(length = 36), nullable = True),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete = 'SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_global_custom_popup_state_updated_by'), 'global_custom_popup_state', ['updated_by'], unique = False)
    op.create_table('ha_areas',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('connection_id', sa.String(length = 36), nullable = False),
    sa.Column('area_id', sa.String(length = 255), nullable = False),
    sa.Column('name', sa.String(length = 255), nullable = False),
    sa.Column('aliases_json', sa.Text(), nullable = False),
    sa.Column('sync_status', sa.String(length = 32), nullable = False),
    sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True),
    sa.ForeignKeyConstraint(['connection_id'], ['ha_connections.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('connection_id', 'area_id', name = 'uq_ha_areas_connection_area')
    )
    op.create_index(op.f('ix_ha_areas_area_id'), 'ha_areas', ['area_id'], unique = False)
    op.create_index(op.f('ix_ha_areas_connection_id'), 'ha_areas', ['connection_id'], unique = False)
    op.create_index(op.f('ix_ha_areas_sync_status'), 'ha_areas', ['sync_status'], unique = False)
    op.create_table('ha_devices',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('connection_id', sa.String(length = 36), nullable = False),
    sa.Column('device_id', sa.String(length = 255), nullable = False),
    sa.Column('name', sa.String(length = 255), nullable = True),
    sa.Column('name_by_user', sa.String(length = 255), nullable = True),
    sa.Column('manufacturer', sa.String(length = 255), nullable = True),
    sa.Column('model', sa.String(length = 255), nullable = True),
    sa.Column('area_id', sa.String(length = 255), nullable = True),
    sa.Column('registry_metadata_json', sa.Text(), nullable = True),
    sa.Column('disabled_by', sa.String(length = 64), nullable = True),
    sa.Column('sync_status', sa.String(length = 32), nullable = False),
    sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True),
    sa.ForeignKeyConstraint(['connection_id'], ['ha_connections.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('connection_id', 'device_id', name = 'uq_ha_devices_connection_device')
    )
    op.create_index(op.f('ix_ha_devices_area_id'), 'ha_devices', ['area_id'], unique = False)
    op.create_index(op.f('ix_ha_devices_connection_id'), 'ha_devices', ['connection_id'], unique = False)
    op.create_index(op.f('ix_ha_devices_device_id'), 'ha_devices', ['device_id'], unique = False)
    op.create_index(op.f('ix_ha_devices_sync_status'), 'ha_devices', ['sync_status'], unique = False)
    op.create_table('ha_entities',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('connection_id', sa.String(length = 36), nullable = False),
    sa.Column('entity_id', sa.String(length = 255), nullable = False),
    sa.Column('domain', sa.String(length = 64), nullable = False),
    sa.Column('platform', sa.String(length = 128), nullable = True),
    sa.Column('translation_key', sa.String(length = 255), nullable = True),
    sa.Column('has_entity_name', sa.Boolean(), nullable = True),
    sa.Column('unique_id', sa.String(length = 512), nullable = True),
    sa.Column('device_id', sa.String(length = 255), nullable = True),
    sa.Column('area_id', sa.String(length = 255), nullable = True),
    sa.Column('name', sa.String(length = 255), nullable = True),
    sa.Column('original_name', sa.String(length = 255), nullable = True),
    sa.Column('icon', sa.String(length = 255), nullable = True),
    sa.Column('disabled_by', sa.String(length = 64), nullable = True),
    sa.Column('sync_status', sa.String(length = 32), nullable = False),
    sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True),
    sa.ForeignKeyConstraint(['connection_id'], ['ha_connections.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('connection_id', 'entity_id', name = 'uq_ha_entities_connection_entity')
    )
    op.create_index(op.f('ix_ha_entities_area_id'), 'ha_entities', ['area_id'], unique = False)
    op.create_index(op.f('ix_ha_entities_connection_id'), 'ha_entities', ['connection_id'], unique = False)
    op.create_index(op.f('ix_ha_entities_device_id'), 'ha_entities', ['device_id'], unique = False)
    op.create_index(op.f('ix_ha_entities_domain'), 'ha_entities', ['domain'], unique = False)
    op.create_index(op.f('ix_ha_entities_entity_id'), 'ha_entities', ['entity_id'], unique = False)
    op.create_index(op.f('ix_ha_entities_sync_status'), 'ha_entities', ['sync_status'], unique = False)
    op.create_table('ha_sync_state',
    sa.Column('connection_id', sa.String(length = 36), nullable = False),
    sa.Column('status', sa.String(length = 32), nullable = False),
    sa.Column('phase', sa.String(length = 64), nullable = True),
    sa.Column('last_started_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_completed_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_full_sync_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_incremental_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('last_reconciled_at', sa.DateTime(timezone = True), nullable = True),
    sa.Column('catalog_revision', sa.Integer(), server_default = '0', nullable = False),
    sa.Column('entity_count', sa.Integer(), nullable = False),
    sa.Column('device_count', sa.Integer(), nullable = False),
    sa.Column('area_count', sa.Integer(), nullable = False),
    sa.Column('last_error', sa.Text(), nullable = True),
    sa.ForeignKeyConstraint(['connection_id'], ['ha_connections.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('connection_id')
    )
    op.create_table('projects',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('name', sa.String(length = 128), nullable = False),
    sa.Column('slug', sa.String(length = 128), nullable = False),
    sa.Column('description', sa.Text(), nullable = False),
    sa.Column('created_by', sa.String(length = 36), nullable = False),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete = 'RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_created_by'), 'projects', ['created_by'], unique = False)
    op.create_index(op.f('ix_projects_name'), 'projects', ['name'], unique = True)
    op.create_index(op.f('ix_projects_slug'), 'projects', ['slug'], unique = True)
    op.create_table('sessions',
    sa.Column('id_hash', sa.String(length = 64), nullable = False),
    sa.Column('user_id', sa.String(length = 36), nullable = False),
    sa.Column('expires_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('ip_address', sa.String(length = 64), nullable = False),
    sa.Column('user_agent', sa.String(length = 512), nullable = False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id_hash')
    )
    op.create_index(op.f('ix_sessions_expires_at'), 'sessions', ['expires_at'], unique = False)
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique = False)
    op.create_table('display_pairing_codes',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('code_hash', sa.String(length = 64), nullable = False),
    sa.Column('encrypted_code', sa.Text(), nullable = False),
    sa.Column('name', sa.String(length = 128), nullable = False),
    sa.Column('project_id', sa.String(length = 36), nullable = False),
    sa.Column('created_by', sa.String(length = 36), nullable = False),
    sa.Column('is_enabled', sa.Boolean(), nullable = False),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete = 'CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_display_pairing_codes_code_hash'), 'display_pairing_codes', ['code_hash'], unique = True)
    op.create_index(op.f('ix_display_pairing_codes_created_by'), 'display_pairing_codes', ['created_by'], unique = False)
    op.create_index(op.f('ix_display_pairing_codes_is_enabled'), 'display_pairing_codes', ['is_enabled'], unique = False)
    op.create_index(op.f('ix_display_pairing_codes_project_id'), 'display_pairing_codes', ['project_id'], unique = False)
    op.create_table('project_drafts',
    sa.Column('project_id', sa.String(length = 36), nullable = False),
    sa.Column('schema_version', sa.Integer(), nullable = False),
    sa.Column('revision', sa.Integer(), nullable = False),
    sa.Column('document_json', sa.Text(), nullable = False),
    sa.Column('updated_by', sa.String(length = 36), nullable = False),
    sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete = 'CASCADE'),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete = 'RESTRICT'),
    sa.PrimaryKeyConstraint('project_id')
    )
    op.create_index(op.f('ix_project_drafts_updated_by'), 'project_drafts', ['updated_by'], unique = False)
    op.create_table('display_devices',
    sa.Column('id', sa.String(length = 36), nullable = False),
    sa.Column('token_hash', sa.String(length = 64), nullable = False),
    sa.Column('pairing_code_id', sa.String(length = 36), nullable = True),
    sa.Column('project_id', sa.String(length = 36), nullable = False),
    sa.Column('name', sa.String(length = 128), nullable = False),
    sa.Column('ip_address', sa.String(length = 64), nullable = False),
    sa.Column('user_agent', sa.String(length = 512), nullable = False),
    sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False),
    sa.Column('revoked_at', sa.DateTime(timezone = True), nullable = True),
    sa.ForeignKeyConstraint(['pairing_code_id'], ['display_pairing_codes.id'], ondelete = 'SET NULL'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete = 'CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_display_devices_last_seen_at'), 'display_devices', ['last_seen_at'], unique = False)
    op.create_index(op.f('ix_display_devices_pairing_code_id'), 'display_devices', ['pairing_code_id'], unique = True)
    op.create_index(op.f('ix_display_devices_project_id'), 'display_devices', ['project_id'], unique = False)
    op.create_index(op.f('ix_display_devices_revoked_at'), 'display_devices', ['revoked_at'], unique = False)
    op.create_index(op.f('ix_display_devices_token_hash'), 'display_devices', ['token_hash'], unique = True)


def downgrade() -> None:
    op.drop_index(op.f('ix_display_devices_token_hash'), table_name = 'display_devices')
    op.drop_index(op.f('ix_display_devices_revoked_at'), table_name = 'display_devices')
    op.drop_index(op.f('ix_display_devices_project_id'), table_name = 'display_devices')
    op.drop_index(op.f('ix_display_devices_pairing_code_id'), table_name = 'display_devices')
    op.drop_index(op.f('ix_display_devices_last_seen_at'), table_name = 'display_devices')
    op.drop_table('display_devices')
    op.drop_index(op.f('ix_project_drafts_updated_by'), table_name = 'project_drafts')
    op.drop_table('project_drafts')
    op.drop_index(op.f('ix_display_pairing_codes_project_id'), table_name = 'display_pairing_codes')
    op.drop_index(op.f('ix_display_pairing_codes_is_enabled'), table_name = 'display_pairing_codes')
    op.drop_index(op.f('ix_display_pairing_codes_created_by'), table_name = 'display_pairing_codes')
    op.drop_index(op.f('ix_display_pairing_codes_code_hash'), table_name = 'display_pairing_codes')
    op.drop_table('display_pairing_codes')
    op.drop_index(op.f('ix_sessions_user_id'), table_name = 'sessions')
    op.drop_index(op.f('ix_sessions_expires_at'), table_name = 'sessions')
    op.drop_table('sessions')
    op.drop_index(op.f('ix_projects_name'), table_name = 'projects')
    op.drop_index(op.f('ix_projects_slug'), table_name = 'projects')
    op.drop_index(op.f('ix_projects_created_by'), table_name = 'projects')
    op.drop_table('projects')
    op.drop_table('ha_sync_state')
    op.drop_index(op.f('ix_ha_entities_sync_status'), table_name = 'ha_entities')
    op.drop_index(op.f('ix_ha_entities_entity_id'), table_name = 'ha_entities')
    op.drop_index(op.f('ix_ha_entities_domain'), table_name = 'ha_entities')
    op.drop_index(op.f('ix_ha_entities_device_id'), table_name = 'ha_entities')
    op.drop_index(op.f('ix_ha_entities_connection_id'), table_name = 'ha_entities')
    op.drop_index(op.f('ix_ha_entities_area_id'), table_name = 'ha_entities')
    op.drop_table('ha_entities')
    op.drop_index(op.f('ix_ha_devices_sync_status'), table_name = 'ha_devices')
    op.drop_index(op.f('ix_ha_devices_device_id'), table_name = 'ha_devices')
    op.drop_index(op.f('ix_ha_devices_connection_id'), table_name = 'ha_devices')
    op.drop_index(op.f('ix_ha_devices_area_id'), table_name = 'ha_devices')
    op.drop_table('ha_devices')
    op.drop_index(op.f('ix_ha_areas_sync_status'), table_name = 'ha_areas')
    op.drop_index(op.f('ix_ha_areas_connection_id'), table_name = 'ha_areas')
    op.drop_index(op.f('ix_ha_areas_area_id'), table_name = 'ha_areas')
    op.drop_table('ha_areas')
    op.drop_index(op.f('ix_global_custom_popup_state_updated_by'), table_name = 'global_custom_popup_state')
    op.drop_table('global_custom_popup_state')
    op.drop_index(op.f('ix_users_username'), table_name = 'users')
    op.drop_table('users')
    op.drop_table('studio_interaction_sync')
    op.drop_index(op.f('ix_license_state_status'), table_name = 'license_state')
    op.drop_table('license_state')
    op.drop_index(op.f('ix_ha_connections_is_active'), table_name = 'ha_connections')
    op.drop_table('ha_connections')