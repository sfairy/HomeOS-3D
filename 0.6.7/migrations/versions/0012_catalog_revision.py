'''Track entity catalog changes separately from incremental state updates.

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-31
'''
from alembic import op
import sqlalchemy as sa
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

def _sync_state_columns() -> set[str]:
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns('ha_sync_state')}

def upgrade() -> None:
    if 'catalog_revision' not in _sync_state_columns():
        op.add_column('ha_sync_state', sa.Column('catalog_revision', sa.Integer(), nullable = False, server_default = '0'))
    return None

def downgrade() -> None:
    if 'catalog_revision' in _sync_state_columns():
        op.drop_column('ha_sync_state', 'catalog_revision')
    return None
