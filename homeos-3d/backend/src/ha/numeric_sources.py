'''Numeric state sources for signed flow; unavailable is not the same as text.'''
import math
import re
from typing import Any
DECIMAL_STATE = re.compile('[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?')
TEXT_DEVICE_CLASSES = {'date', 'enum', 'timestamp'}

def finite_numeric_state(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return False
    text = str(value).strip()
    return bool(DECIMAL_STATE.fullmatch(text)) and math.isfinite(float(text))


def numeric_sources(states: list[dict[str, Any]], allowed_ids: set[str]) -> list[dict[str, Any]]:
    result = []
    seen = set()
    for state in states:
        entity_id = str(state.get('entity_id') or '')
        domain = entity_id.partition('.')[0]
        if entity_id not in allowed_ids or entity_id in seen or domain not in {'number', 'sensor', 'input_number'}:
            continue
        attributes = state.get('attributes') or { }
        if not isinstance(attributes, dict):
            attributes = { }
        raw = state.get('state')
        numeric = finite_numeric_state(raw)
        if domain == 'sensor':
            if attributes.get('device_class') in TEXT_DEVICE_CLASSES or isinstance(attributes.get('options'), list):
                continue
            unavailable = raw is None or isinstance(raw, str) and raw.strip().lower() in {'unknown', 'unavailable'}
            if not numeric and not unavailable:
                continue
        seen.add(entity_id)
        result.append({
            'entityId': entity_id,
            'name': attributes.get('friendly_name') or entity_id,
            'unavailable': not numeric })
    return sorted(result, key=lambda item: item['entityId'])
