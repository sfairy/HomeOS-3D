"""Lock soft-light theme rendering to the approved saved iPad presets."""
import json

from alembic import op
import sqlalchemy as sa

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None

BASE = {
    'ambientIntensity': 0.16,
    'fillAzimuth': -48,
    'fillElevation': 28,
    'fillIntensity': 0.16,
    'hemisphereIntensity': 0.58,
    'mainAzimuth': 139,
    'mainElevation': 55,
    'mainIntensity': 2.05,
    'mainShadowIntensity': 0.18,
    'topAzimuth': 90,
    'topElevation': 86,
    'topIntensity': 0.12,
}

PRESETS = {
    'default': {**BASE, 'exposure': 0.95, 'floorBrightness': 75},
    'warm-wood': {**BASE, 'exposure': 0.6, 'floorBrightness': 50},
}


def migrate_document(value) -> bool:
    changed = False
    if isinstance(value, dict):
        properties = value.get('properties')
        if (
            value.get('type') == 'interaction3d'
            and isinstance(properties, dict)
            and properties.get('lightingMode') == 'region'
        ):
            style = 'warm-wood' if properties.get('sceneStyle') == 'warm-wood' else 'default'
            if properties.get('baseLighting') != PRESETS[style]:
                properties['baseLighting'] = dict(PRESETS[style])
                changed = True
        for item in value.values():
            changed = migrate_document(item) or changed
    elif isinstance(value, list):
        for item in value:
            changed = migrate_document(item) or changed
    return changed


def upgrade() -> None:
    connection = op.get_bind()
    for name, primary_key, json_column in (
        ('project_drafts', 'project_id', 'document_json'),
        ('global_custom_popup_state', 'id', 'popups_json'),
    ):
        table = sa.table(
            name,
            sa.column(primary_key),
            sa.column(json_column),
            sa.column('revision'),
        )
        for ident, payload in connection.execute(
            sa.select(table.c[primary_key], table.c[json_column])
        ).all():
            document = json.loads(payload)
            if migrate_document(document):
                connection.execute(
                    table.update()
                    .where(table.c[primary_key] == ident)
                    .values({
                        json_column: json.dumps(
                            document,
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(',', ':'),
                        ),
                        'revision': table.c.revision + 1,
                    })
                )


def downgrade() -> None:
    pass
