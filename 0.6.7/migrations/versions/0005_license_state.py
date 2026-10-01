'''Create client license state.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-25
'''
from alembic import op
import sqlalchemy as sa
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('license_state', sa.Column('id', sa.Integer(), nullable = False), sa.Column('instance_id', sa.String(length = 64), nullable = False), sa.Column('license_id', sa.String(length = 64), nullable = True), sa.Column('lease_id', sa.String(length = 64), nullable = True), sa.Column('session_id', sa.String(length = 64), nullable = True), sa.Column('activation_code_hint', sa.String(length = 16), nullable = True), sa.Column('signed_lease', sa.Text(), nullable = True), sa.Column('encrypted_session_token', sa.Text(), nullable = True), sa.Column('encrypted_recovery_token', sa.Text(), nullable = True), sa.Column('status', sa.String(length = 32), nullable = False), sa.Column('lease_issued_at', sa.DateTime(timezone = True), nullable = True), sa.Column('lease_expires_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_heartbeat_at', sa.DateTime(timezone = True), nullable = True), sa.Column('last_verified_at', sa.DateTime(timezone = True), nullable = True), sa.Column('product_edition', sa.String(length = 64), nullable = True), sa.Column('feature_set', sa.Text(), nullable = False), sa.Column('max_projects', sa.Integer(), nullable = False), sa.Column('max_displays', sa.Integer(), nullable = False), sa.Column('heartbeat_interval_seconds', sa.Integer(), nullable = False), sa.Column('last_error', sa.Text(), nullable = True), sa.Column('activated_at', sa.DateTime(timezone = True), nullable = True), sa.Column('deactivated_at', sa.DateTime(timezone = True), nullable = True), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('instance_id'))
    op.create_index('ix_license_state_status', 'license_state', [
        'status'])
    return None

def downgrade():
    op.drop_index('ix_license_state_status', table_name = 'license_state')
    op.drop_table('license_state')
    return None
