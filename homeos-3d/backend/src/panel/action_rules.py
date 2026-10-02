from __future__ import annotations
import re
ENTITY_ID = re.compile('^[a-z0-9_]+\\.[a-z0-9_]+$')
VIRTUAL_ENTITY_ID = re.compile('^virtual\\.[a-z0-9_]+\\.[a-z0-9_]+$')
ACTION_TYPES = frozenset({
    'toggle',
    'navigate',
    'more-info'})
POPUP_SOURCES = frozenset({
    'custom',
    'entity',
    'current'})
TOGGLE_ENTITY_DOMAINS = frozenset({
    'fan',
    'cover',
    'light',
    'button',
    'remote',
    'script',
    'switch',
    'climate',
    'automation',
    'media_player',
    'water_heater',
    'input_boolean'})

def valid_ha_entity_id(value):
    return bool(ENTITY_ID.fullmatch(value))

def valid_entity_id(value):
    """Accept Home Assistant IDs and the renderer's scoped virtual IDs."""
    return valid_ha_entity_id(value) or bool(VIRTUAL_ENTITY_ID.fullmatch(value))

def action_popup_source(action):
    data = getattr(action, 'data', None)
    if not isinstance(data, dict) and isinstance(action, dict):
        data = action.get('data')
    source = str((data or { }).get('popupSource') or 'current')
    return source if source in POPUP_SOURCES else 'current'

def action_needs_current_entity(action):
    action_type = getattr(action, 'type', None)
    if action_type is None and isinstance(action, dict):
        action_type = action.get('type')
    return (action_type == 'toggle' or action_type == 'more-info') and action_popup_source(action) == 'current'

def entity_id_supports_toggle(entity_id):
    normalized = str(entity_id or '')
    return bool(VIRTUAL_ENTITY_ID.fullmatch(normalized)) or normalized.partition('.')[0] in TOGGLE_ENTITY_DOMAINS
