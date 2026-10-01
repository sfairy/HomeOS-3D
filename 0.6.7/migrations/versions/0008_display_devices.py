'''Create paired display devices and one-time pairing codes.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-03
'''
from alembic import op
import sqlalchemy as sa
revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('display_pairing_codes', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('code_hash', sa.String(length = 64), nullable = False), sa.Column('project_id', sa.String(length = 36), nullable = False), sa.Column('created_by', sa.String(length = 36), nullable = False), sa.Column('expires_at', sa.DateTime(timezone = True), nullable = False), sa.Column('consumed_at', sa.DateTime(timezone = True), nullable = True), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.ForeignKeyConstraint([
        'created_by'], [
        'users.id'], ondelete = 'CASCADE'), sa.ForeignKeyConstraint([
        'project_id'], [
        'projects.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('code_hash'))
    op.create_index('ix_display_pairing_codes_code_hash', 'display_pairing_codes', [
        'code_hash'], unique = True)
    op.create_index('ix_display_pairing_codes_project_id', 'display_pairing_codes', [
        'project_id'], unique = False)
    op.create_index('ix_display_pairing_codes_created_by', 'display_pairing_codes', [
        'created_by'], unique = False)
    op.create_index('ix_display_pairing_codes_expires_at', 'display_pairing_codes', [
        'expires_at'], unique = False)
    op.create_table('display_devices', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('token_hash', sa.String(length = 64), nullable = False), sa.Column('project_id', sa.String(length = 36), nullable = False), sa.Column('name', sa.String(length = 128), nullable = False), sa.Column('ip_address', sa.String(length = 64), nullable = False), sa.Column('user_agent', sa.String(length = 512), nullable = False), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('revoked_at', sa.DateTime(timezone = True), nullable = True), sa.ForeignKeyConstraint([
        'project_id'], [
        'projects.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('token_hash'))
    op.create_index('ix_display_devices_token_hash', 'display_devices', [
        'token_hash'], unique = True)
    op.create_index('ix_display_devices_project_id', 'display_devices', [
        'project_id'], unique = False)
    op.create_index('ix_display_devices_last_seen_at', 'display_devices', [
        'last_seen_at'], unique = False)
    op.create_index('ix_display_devices_revoked_at', 'display_devices', [
        'revoked_at'], unique = False)
    return None

def downgrade():
    op.drop_index('ix_display_devices_revoked_at', table_name = 'display_devices')
    op.drop_index('ix_display_devices_last_seen_at', table_name = 'display_devices')
    op.drop_index('ix_display_devices_project_id', table_name = 'display_devices')
    op.drop_index('ix_display_devices_token_hash', table_name = 'display_devices')
    op.drop_table('display_devices')
    op.drop_index('ix_display_pairing_codes_expires_at', table_name = 'display_pairing_codes')
    op.drop_index('ix_display_pairing_codes_created_by', table_name = 'display_pairing_codes')
    op.drop_index('ix_display_pairing_codes_project_id', table_name = 'display_pairing_codes')
    op.drop_index('ix_display_pairing_codes_code_hash', table_name = 'display_pairing_codes')
    op.drop_table('display_pairing_codes')
    return None
