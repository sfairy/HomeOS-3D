'''Durable undo and pending file delivery for studio interaction cleanup.'''
from alembic import op
import sqlalchemy as sa
revision = '0020'
down_revision = '0019'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('studio_interaction_sync', sa.Column('id', sa.Integer(), primary_key = True), sa.Column('document_json', sa.Text(), nullable = False))
    return None

def downgrade():
    op.drop_table('studio_interaction_sync')
    return None
