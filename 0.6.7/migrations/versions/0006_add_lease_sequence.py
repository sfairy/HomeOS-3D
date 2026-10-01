'''Track the latest signed lease sequence.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-26
'''
from alembic import op
import sqlalchemy as sa
revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('license_state', sa.Column('lease_sequence', sa.Integer(), nullable = False, server_default = '0'))
    return None

def downgrade():
    with op.batch_alter_table('license_state') as batch_op:
        batch_op.drop_column('lease_sequence')
    return None
