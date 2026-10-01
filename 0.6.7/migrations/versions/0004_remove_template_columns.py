'''Remove withdrawn template source columns.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-22
'''
from alembic import op
import sqlalchemy as sa
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('source_template_version')
        batch_op.drop_column('source_template_id')
    return None

def downgrade():
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('source_template_id', sa.String(length = 128), nullable = True))
        batch_op.add_column(sa.Column('source_template_version', sa.Integer(), nullable = True))
    return None
