'''Move dashboard custom popups into one global library.

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-18
'''
from __future__ import annotations
import json
from uuid import uuid4
from alembic import op
import sqlalchemy as sa
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

def _canonical(value) -> str:
    return json.dumps(value, ensure_ascii = False, sort_keys = True, separators = (',', ':'))

def _remap_popup_references(value, replacements: dict[str, str]) -> None:
    if isinstance(value, dict):
        if value.get('popupSource') == 'custom' and value.get('popupId') in replacements:
            value['popupId'] = replacements[value['popupId']]
        for item in value.values():
            _remap_popup_references(item, replacements)
    elif isinstance(value, list):
        for item in value:
            _remap_popup_references(item, replacements)
    return None

def upgrade() -> None:
    op.create_table('global_custom_popup_state', sa.Column('id', sa.Integer(), nullable = False), sa.Column('revision', sa.Integer(), nullable = False), sa.Column('popups_json', sa.Text(), nullable = False), sa.Column('updated_by', sa.String(length = 36), nullable = True), sa.Column('updated_at', sa.DateTime(timezone = True), nullable = False), sa.ForeignKeyConstraint([
        'updated_by'], [
        'users.id'], ondelete = 'SET NULL'), sa.PrimaryKeyConstraint('id'))
    op.create_index('ix_global_custom_popup_state_updated_by', 'global_custom_popup_state', [
        'updated_by'], unique = False)
    connection = op.get_bind()
    rows = connection.execute(sa.text('SELECT project_id, document_json FROM project_drafts ORDER BY project_id')).mappings().all()
    global_popups = []
    popup_by_id = { }
    for row in rows:
        try:
            document = json.loads(row['document_json'])
        except (TypeError, json.JSONDecodeError):
            continue
        replacements = {}
        for popup in document.get('customPopups') or []:
            if not isinstance(popup, dict) or not isinstance(popup.get('id'), str):
                continue
            popup_id = popup['id']
            existing = popup_by_id.get(popup_id)
            if existing is not None and _canonical(existing) != _canonical(popup):
                replacement = f'custom-popup-global-{uuid4()}'
                popup = {**popup, 'id': replacement}
                replacements[popup_id] = replacement
                popup_id = replacement
                existing = None
            if existing is not None:
                continue
            popup_by_id[popup_id] = popup
            global_popups.append(popup)
        if replacements:
            _remap_popup_references(document, replacements)
        document['customPopups'] = []
        connection.execute(sa.text('UPDATE project_drafts SET document_json = :document WHERE project_id = :project_id'), {
            'document': _canonical(document),
            'project_id': row['project_id'] })
    connection.execute(sa.text('INSERT INTO global_custom_popup_state (id, revision, popups_json, updated_by, updated_at) VALUES (1, 1, :popups_json, NULL, CURRENT_TIMESTAMP)'), {
        'popups_json': _canonical(global_popups) })
    return None

def downgrade() -> None:
    connection = op.get_bind()
    row = connection.execute(sa.text('SELECT popups_json FROM global_custom_popup_state WHERE id = 1')).mappings().first()
    popups_json = row['popups_json'] if row else '[]'
    for draft in connection.execute(sa.text('SELECT project_id, document_json FROM project_drafts')).mappings().all():
        try:
            document = json.loads(draft['document_json'])
        except (TypeError, json.JSONDecodeError):
            continue
        document['customPopups'] = json.loads(popups_json)
        connection.execute(sa.text('UPDATE project_drafts SET document_json = :document WHERE project_id = :project_id'), {
            'document': _canonical(document),
            'project_id': draft['project_id'] })
    op.drop_index('ix_global_custom_popup_state_updated_by', table_name = 'global_custom_popup_state')
    op.drop_table('global_custom_popup_state')
    return None
