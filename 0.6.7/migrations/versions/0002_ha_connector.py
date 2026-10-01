'''Create Home Assistant connector tables.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-22
'''
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('ha_connections', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('name', sa.String(length = 128), nullable = False), sa.Column('base_url', sa.String(length = 512), nullable = False), sa.Column('encrypted_access_token', sa.Text(), nullable = False), sa.Column('verify_tls', sa.Boolean(), nullable = False), sa.Column('is_active', sa.Boolean(), nullable = False), sa.Column('ha_version', sa.String(length = 64), nullable = True), sa.Column('last_connected_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_error', sa.Text(), nullable = True), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False), sa.PrimaryKeyConstraint('id'))
    op.create_index('ix_ha_connections_is_active', 'ha_connections', [
        'is_active'], unique = False)
    op.create_table('ha_entities', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('connection_id', sa.String(length = 36), nullable = False), sa.Column('entity_id', sa.String(length = 255), nullable = False), sa.Column('domain', sa.String(length = 64), nullable = False), sa.Column('platform', sa.String(length = 128), nullable = True), sa.Column('unique_id', sa.String(length = 512), nullable = True), sa.Column('device_id', sa.String(length = 255), nullable = True), sa.Column('area_id', sa.String(length = 255), nullable = True), sa.Column('name', sa.String(length = 255), nullable = True), sa.Column('original_name', sa.String(length = 255), nullable = True), sa.Column('icon', sa.String(length = 255), nullable = True), sa.Column('disabled_by', sa.String(length = 64), nullable = True), sa.Column('sync_status', sa.String(length = 32), nullable = False), sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True), sa.ForeignKeyConstraint([
        'connection_id'], [
        'ha_connections.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('connection_id', 'entity_id', name = 'uq_ha_entities_connection_entity'))
    for column in ('connection_id', 'entity_id', 'domain', 'device_id', 'area_id', 'sync_status'):
        op.create_index(f'''ix_ha_entities_{column}''', 'ha_entities', [
            column], unique = False)
    op.create_table('ha_devices', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('connection_id', sa.String(length = 36), nullable = False), sa.Column('device_id', sa.String(length = 255), nullable = False), sa.Column('name', sa.String(length = 255), nullable = True), sa.Column('name_by_user', sa.String(length = 255), nullable = True), sa.Column('manufacturer', sa.String(length = 255), nullable = True), sa.Column('model', sa.String(length = 255), nullable = True), sa.Column('area_id', sa.String(length = 255), nullable = True), sa.Column('disabled_by', sa.String(length = 64), nullable = True), sa.Column('sync_status', sa.String(length = 32), nullable = False), sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True), sa.ForeignKeyConstraint([
        'connection_id'], [
        'ha_connections.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('connection_id', 'device_id', name = 'uq_ha_devices_connection_device'))
    for column in ('connection_id', 'device_id', 'area_id', 'sync_status'):
        op.create_index(f'''ix_ha_devices_{column}''', 'ha_devices', [
            column], unique = False)
    op.create_table('ha_areas', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('connection_id', sa.String(length = 36), nullable = False), sa.Column('area_id', sa.String(length = 255), nullable = False), sa.Column('name', sa.String(length = 255), nullable = False), sa.Column('aliases_json', sa.Text(), nullable = False), sa.Column('sync_status', sa.String(length = 32), nullable = False), sa.Column('first_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('missing_since', sa.DateTime(timezone = True), nullable = True), sa.ForeignKeyConstraint([
        'connection_id'], [
        'ha_connections.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('connection_id', 'area_id', name = 'uq_ha_areas_connection_area'))
    for column in ('connection_id', 'area_id', 'sync_status'):
        op.create_index(f'''ix_ha_areas_{column}''', 'ha_areas', [
            column], unique = False)
    op.create_table('ha_sync_state', sa.Column('connection_id', sa.String(length = 36), nullable = False), sa.Column('status', sa.String(length = 32), nullable = False), sa.Column('phase', sa.String(length = 64), nullable = True), sa.Column('last_started_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_completed_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_full_sync_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_incremental_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_reconciled_at', sa.DateTime(timezone = True), nullable = True), sa.Column('entity_count', sa.Integer(), nullable = False), sa.Column('device_count', sa.Integer(), nullable = False), sa.Column('area_count', sa.Integer(), nullable = False), sa.Column('last_error', sa.Text(), nullable = True), sa.ForeignKeyConstraint([
        'connection_id'], [
        'ha_connections.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('connection_id'))
    return None

def downgrade():
    op.drop_table('ha_sync_state')
    for column in ('sync_status', 'area_id', 'connection_id'):
        op.drop_index(f'''ix_ha_areas_{column}''', table_name = 'ha_areas')
    op.drop_table('ha_areas')
    for column in ('sync_status', 'area_id', 'device_id', 'connection_id'):
        op.drop_index(f'''ix_ha_devices_{column}''', table_name = 'ha_devices')
    op.drop_table('ha_devices')
    for column in ('sync_status', 'area_id', 'device_id', 'domain', 'entity_id', 'connection_id'):
        op.drop_index(f'''ix_ha_entities_{column}''', table_name = 'ha_entities')
    op.drop_table('ha_entities')
    op.drop_index('ix_ha_connections_is_active', table_name = 'ha_connections')
    op.drop_table('ha_connections')
    return None
