'''Keep databases created by HomeOS 0.3.3 upgradeable.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-25

HomeOS 0.3.3 stored an editor theme preference in this column. The 0.3.4
runtime intentionally returned to the 0.3.2 feature baseline, but deployed
databases may already be stamped at revision 0011. Retaining the revision and
normalising the harmless column lets both older and already-upgraded databases
start without restoring any of the 0.3.3 editor behaviour.
'''
from alembic import op
import sqlalchemy as sa
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

def _users_columns() -> set[str]:
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns('users')}

def upgrade() -> None:
    if 'editor_theme_mode' not in _users_columns():
        op.add_column('users', sa.Column('editor_theme_mode', sa.String(length = 16), nullable = False, server_default = 'dark'))
    return None

def downgrade() -> None:
    if 'editor_theme_mode' in _users_columns():
        op.drop_column('users', 'editor_theme_mode')
    return None
