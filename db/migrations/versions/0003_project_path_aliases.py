'''Add project_path_aliases for old display addresses.
'''
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_path_aliases',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length = 128), nullable = False),
        sa.Column('project_id', sa.String(length = 36), nullable = False),
        sa.Column('created_at', sa.DateTime(timezone = True), nullable = False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete = 'CASCADE'),
    )
    op.create_index('ix_project_path_aliases_name', 'project_path_aliases', ['name'], unique = True)
    op.create_index('ix_project_path_aliases_project_id', 'project_path_aliases', ['project_id'], unique = False)


def downgrade() -> None:
    op.drop_index('ix_project_path_aliases_project_id', table_name = 'project_path_aliases')
    op.drop_index('ix_project_path_aliases_name', table_name = 'project_path_aliases')
    op.drop_table('project_path_aliases')
