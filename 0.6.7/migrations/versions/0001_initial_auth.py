'''Create initial users and sessions tables.

Revision ID: 0001
Revises:
Create Date: 2026-07-22
'''
from alembic import op
import sqlalchemy as sa
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('users', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('username', sa.String(length = 64), nullable = False), sa.Column('password_hash', sa.String(length = 512), nullable = False), sa.Column('role', sa.String(length = 32), nullable = False), sa.Column('is_active', sa.Boolean(), nullable = False), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('username'))
    op.create_index('ix_users_username', 'users', [
        'username'], unique = True)
    op.create_table('sessions', sa.Column('id_hash', sa.String(length = 64), nullable = False), sa.Column('user_id', sa.String(length = 36), nullable = False), sa.Column('expires_at', sa.DateTime(timezone = True), nullable = False), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.Column('last_seen_at', sa.DateTime(timezone = True), nullable = False), sa.Column('ip_address', sa.String(length = 64), nullable = False), sa.Column('user_agent', sa.String(length = 512), nullable = False), sa.ForeignKeyConstraint([
        'user_id'], [
        'users.id'], ondelete = 'CASCADE'), sa.PrimaryKeyConstraint('id_hash'))
    op.create_index('ix_sessions_expires_at', 'sessions', [
        'expires_at'], unique = False)
    op.create_index('ix_sessions_user_id', 'sessions', [
        'user_id'], unique = False)
    return None

def downgrade():
    op.drop_index('ix_sessions_user_id', table_name = 'sessions')
    op.drop_index('ix_sessions_expires_at', table_name = 'sessions')
    op.drop_table('sessions')
    op.drop_index('ix_users_username', table_name = 'users')
    op.drop_table('users')
    return None
