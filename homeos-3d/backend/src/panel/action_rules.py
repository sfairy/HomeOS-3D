from __future__ import annotations
import re
ENTITY_ID = re.compile('^[a-z0-9_]+\\.[a-z0-9_]+$')
VIRTUAL_ENTITY_ID = re.compile('^virtual\\.[a-z0-9_]+\\.[a-z0-9_]+$')
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

