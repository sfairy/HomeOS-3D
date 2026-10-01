'''Create projects and project drafts.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-22
'''
from alembic import op
import sqlalchemy as sa
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('projects', sa.Column('id', sa.String(length = 36), nullable = False), sa.Column('name', sa.String(length = 128), nullable = False), sa.Column('slug', sa.String(length = 128), nullable = False), sa.Column('description', sa.Text(), nullable = False), sa.Column('source_template_id', sa.String(length = 128), nullable = True), sa.Column('source_template_version', sa.Integer(), nullable = True), sa.Column('created_by', sa.String(length = 36), nullable = False), sa.Column('created_at', sa.DateTime(timezone = True), nullable = False), sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False), sa.ForeignKeyConstraint([
        'created_by'], [
        'users.id'], ondelete = 'RESTRICT'), sa.PrimaryKeyConstraint('id'), sa.UniqueConstraint('slug'))
    op.create_index('ix_projects_slug', 'projects', [
        'slug'], unique = True)
    op.create_index('ix_projects_created_by', 'projects', [
        'created_by'], unique = False)
    op.create_table('project_drafts', sa.Column('project_id', sa.String(length = 36), nullable = False), sa.Column('schema_version', sa.Integer(), nullable = False), sa.Column('revision', sa.Integer(), nullable = False), sa.Column('document_json', sa.Text(), nullable = False), sa.Column('updated_by', sa.String(length = 36), nullable = False), sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False), sa.ForeignKeyConstraint([
        'project_id'], [
        'projects.id'], ondelete = 'CASCADE'), sa.ForeignKeyConstraint([
        'updated_by'], [
        'users.id'], ondelete = 'RESTRICT'), sa.PrimaryKeyConstraint('project_id'))
    op.create_index('ix_project_drafts_updated_by', 'project_drafts', [
        'updated_by'], unique = False)
    return None

def downgrade():
    op.drop_index('ix_project_drafts_updated_by', table_name = 'project_drafts')
    op.drop_table('project_drafts')
    op.drop_index('ix_projects_created_by', table_name = 'projects')
    op.drop_index('ix_projects_slug', table_name = 'projects')
    op.drop_table('projects')
    return None
