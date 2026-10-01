from __future__ import annotations
from typing import Any

def is_virtual_entity_id(value):
    return value.startswith('virtual.')

def document_entity_ids(value):
    '''Return every HA entity explicitly or implicitly used by a panel document.'''
    result = set()

    def walk(item: Any) -> None:
        if isinstance(item, dict):
            if item.get('type') == 'weather':
                # 天气控件的太阳实体：bindings.sun.entityId 缺省时回落到 sun.sun。
                sun_id = ((item.get('bindings') or { }).get('sun') or { }).get('entityId')
                result.add(str(sun_id or 'sun.sun'))
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith('entityid') and isinstance(child, str) and '.' in child:
                    if not is_virtual_entity_id(child):
                        result.add(child)
                    continue
                if normalized_key.endswith('entityids') and isinstance(child, list):
                    result.update(
                        str(entity_id)
                        for entity_id in child
                        if isinstance(entity_id, str) and '.' in entity_id and not is_virtual_entity_id(entity_id)
                    )
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)
        return None

    walk(value)
    return result
