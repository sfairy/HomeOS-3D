'''Lock page dimming and focus appearance to the approved theme presets.'''
import json
from alembic import op
import sqlalchemy as sa
revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None
APPROVED = {
    'pageDimStrength': {
        'overview': 0,
        'light': 0,
        'environment': 30,
        'devices': 30,
        'vacuum': 30,
        'security': 30 },
    'pageSaturation': {
        'overview': 100,
        'light': 100,
        'environment': 100,
        'devices': 100,
        'vacuum': 100,
        'security': 100 },
    'focusDimStrength': 0,
    'focusVignetteStrength': 30 }
PRESETS = {
    'default': APPROVED,
    'warm-wood': APPROVED }

def migrate_document(value) -> bool:
    changed = False
    if isinstance(value, dict):
        properties = value.get('properties')
        if value.get('type') == 'interaction3d' and isinstance(properties, dict):
            preset = PRESETS['warm-wood' if properties.get('sceneStyle') == 'warm-wood' else 'default']
            for key, target in preset.items():
                if properties.get(key) != target:
                    properties[key] = dict(target) if isinstance(target, dict) else target
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
