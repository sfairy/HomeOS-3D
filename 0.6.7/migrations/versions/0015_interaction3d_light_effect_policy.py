"""Force existing 3D visual light settings to the proportional display policy.

This only changes dashboard JSON. HA entities, authored studio lights and
baseLighting (including the user's exposure) are deliberately not touched.
"""
import json
from alembic import op
import sqlalchemy as sa
revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None

def migrate_document(value) -> bool:
    changed = False
    if isinstance(value, dict):
        if value.get('type') == 'interaction3d':
            properties = value.get('properties')
            lights = properties.get('lights') if isinstance(properties, dict) else None
            if isinstance(lights, list):
                for light in lights:
                    if not isinstance(light, dict):
                        continue
                    for key, target in (('effectRange', {
                        'brightnessMin': 50,
                        'brightnessMax': 150,
                        'temperatureMin': 2700,
                        'temperatureMax': 6500 }), ('effectDefaults', {
                        'brightness': 150,
                        'kelvin': 3500 })):
                        if light.get(key) != target:
                            light[key] = target
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
