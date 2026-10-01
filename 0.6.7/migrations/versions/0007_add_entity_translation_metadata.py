'''Store Home Assistant entity translation metadata.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-28
'''
from alembic import op
import sqlalchemy as sa
revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('ha_entities', sa.Column('translation_key', sa.String(length = 255), nullable = True))
    op.add_column('ha_entities', sa.Column('has_entity_name', sa.Boolean(), nullable = True))
    return None

def downgrade():
    with op.batch_alter_table('ha_entities') as batch_op:
        batch_op.drop_column('has_entity_name')
        batch_op.drop_column('translation_key')
    return None
