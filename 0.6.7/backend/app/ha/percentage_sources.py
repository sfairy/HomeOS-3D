'''Only explicit percentage units and HA-defined percentage attributes qualify.'''
from typing import Any
PERCENTAGE_ATTRIBUTES = {
    'cover': {
        'current_position': '开合度',
        'current_tilt_position': '叶片角度' },
    'fan': {
        'percentage': '风速百分比' },
    'humidifier': {
        'current_humidity': '当前湿度',
        'humidity': '目标湿度' },
    'climate': {
        'current_humidity': '当前湿度',
        'humidity': '目标湿度' } }

def percentage_sources(states: list[dict[str, Any]], allowed_ids: set[str]) -> list[dict[str, Any]]:
    result = []
    for state in states:
        entity_id = str(state.get('entity_id') or '')
        if entity_id not in allowed_ids:
            continue
        attributes = state.get('attributes') or { }
        if str(attributes.get('unit_of_measurement') or '').strip() in {'%', '％'}:
            result.append({
                'entityId': entity_id,
                'attribute': '',
                'sourceLabel': '百分比状态' })
        for key, label in PERCENTAGE_ATTRIBUTES.get(entity_id.partition('.')[0], { }).items():
            value = attributes.get(key)
            if key in attributes:
                if isinstance(value, bool):
                    continue
                result.append({
                    'entityId': entity_id,
                    'attribute': key,
                    'sourceLabel': label })
    return result
