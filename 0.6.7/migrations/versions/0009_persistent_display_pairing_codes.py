'''Make display pairing codes persistent and bind one code to one device.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-12
'''
from alembic import op
import sqlalchemy as sa
revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('display_pairing_codes') as batch_op:
        batch_op.add_column(sa.Column('encrypted_code', sa.Text(), nullable = True))
        batch_op.add_column(sa.Column('name', sa.String(length = 128), nullable = True))
        batch_op.add_column(sa.Column('is_enabled', sa.Boolean(), nullable = False, server_default = sa.true()))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone = True), nullable = True))
        batch_op.drop_index('ix_display_pairing_codes_expires_at')
        batch_op.drop_column('expires_at')
        batch_op.drop_column('consumed_at')
        batch_op.create_index('ix_display_pairing_codes_is_enabled', [
            'is_enabled'], unique = False)
    op.execute('DELETE FROM display_pairing_codes WHERE encrypted_code IS NULL')
    with op.batch_alter_table('display_pairing_codes') as batch_op:
        batch_op.alter_column('encrypted_code', existing_type = sa.Text(), nullable = False)
        batch_op.alter_column('name', existing_type = sa.String(length = 128), nullable = False)
        batch_op.alter_column('updated_at', existing_type = sa.DateTime(timezone = True), nullable = False)
    with op.batch_alter_table('display_devices') as batch_op:
        batch_op.add_column(sa.Column('pairing_code_id', sa.String(length = 36), nullable = True))
        batch_op.create_foreign_key('fk_display_devices_pairing_code_id', 'display_pairing_codes', [
            'pairing_code_id'], [
            'id'], ondelete = 'CASCADE')
        batch_op.create_index('ix_display_devices_pairing_code_id', [
            'pairing_code_id'], unique = True)
    return None

def downgrade():
    with op.batch_alter_table('display_devices') as batch_op:
        batch_op.drop_index('ix_display_devices_pairing_code_id')
        batch_op.drop_constraint('fk_display_devices_pairing_code_id', type_ = 'foreignkey')
        batch_op.drop_column('pairing_code_id')
    with op.batch_alter_table('display_pairing_codes') as batch_op:
        batch_op.drop_index('ix_display_pairing_codes_is_enabled')
        batch_op.add_column(sa.Column('consumed_at', sa.DateTime(timezone = True), nullable = True))
        batch_op.add_column(sa.Column('expires_at', sa.DateTime(timezone = True), nullable = True))
        batch_op.drop_column('updated_at')
        batch_op.drop_column('is_enabled')
        batch_op.drop_column('name')
        batch_op.drop_column('encrypted_code')
        batch_op.create_index('ix_display_pairing_codes_expires_at', [
            'expires_at'], unique = False)
    return None
