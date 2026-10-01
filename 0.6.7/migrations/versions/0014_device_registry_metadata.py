'''Preserve integration membership and device hierarchy for device discovery.'''
from alembic import op
import sqlalchemy as sa
revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None

def upgrade() -> None:
    columns = {column['name'] for column in sa.inspect(op.get_bind()).get_columns('ha_devices')}
    if 'registry_metadata_json' not in columns:
        op.add_column('ha_devices', sa.Column('registry_metadata_json', sa.Text(), nullable = True))
    return None

def downgrade() -> None:
    op.drop_column('ha_devices', 'registry_metadata_json')
    return None
