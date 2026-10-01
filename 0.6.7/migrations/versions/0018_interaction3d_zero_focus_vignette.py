'''Force focus vignette off for every existing 3D interaction control.'''
import json
from alembic import op
import sqlalchemy as sa
revision = '0018'
down_revision = '0017'
branch_labels = None
depends_on = None

def migrate_document(value) -> bool:
    changed = False
    if isinstance(value, dict):
        properties = value.get('properties')
        if value.get('type') == 'interaction3d' and isinstance(properties, dict) and properties.get('focusVignetteStrength') != 0:
            properties['focusVignetteStrength'] = 0
            changed = True
        for item in value.values():
            changed = migrate_document(item) or changed
    elif isinstance(value, list):
        for item in value:
            changed = migrate_document(item) or changed
    return changed

def upgrade() -> None:
    connection = op.get_bind()
    for name, primary_key, json_column in (('project_drafts', 'project_id', 'document_json'), ('global_custom_popup_state', 'id', 'popups_json')):
        table = sa.table(name, sa.column(primary_key), sa.column(json_column), sa.column('revision'))
        for ident, payload in connection.execute(sa.select(table.c[primary_key], table.c[json_column])).all():
            document = json.loads(payload)
            if not migrate_document(document):
                continue
            connection.execute(table.update().where(table.c[primary_key] == ident).values({
                'revision': table.c.revision + 1,
                json_column: json.dumps(document, ensure_ascii = False, sort_keys = True, separators = (',', ':')) }))
    return None

def downgrade() -> None:
    return None
