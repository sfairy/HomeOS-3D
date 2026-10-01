'''Track administrator credentials stored outside the business database.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-05
'''
from alembic import op
import sqlalchemy as sa
revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None

def _users_columns() -> set[str]:
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns('users')}

def upgrade() -> None:
    if 'auth_externalized' not in _users_columns():
        op.add_column('users', sa.Column('auth_externalized', sa.Boolean(), nullable = False, server_default = sa.false()))
    return None

def downgrade() -> None:
    if 'auth_externalized' in _users_columns():
        op.drop_column('users', 'auth_externalized')
    return None
