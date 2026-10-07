from __future__ import annotations

import json
from copy import deepcopy

from sqlalchemy.orm import Session

from .core.models import GlobalCustomPopupState


def global_popup_state(database: Session) -> GlobalCustomPopupState:
    state = database.get(GlobalCustomPopupState, 1)
    if state is None:
        state = GlobalCustomPopupState(id = 1, revision = 1, popups_json = '[]')
        database.add(state)
        database.flush()
    return state

def global_popups(database: Session) -> list[dict]:
    state = global_popup_state(database)
    try:
        value = json.loads(state.popups_json)
    except (TypeError, json.JSONDecodeError):
        value = []
    return value if isinstance(value, list) else []

def popup_reference_ids(value) -> set[str]:
    result = set()
    if isinstance(value, dict):
        if value.get('popupSource') == 'custom' and isinstance(value.get('popupId'), str):
            result.add(value['popupId'])
        for item in value.values():
            result.update(popup_reference_ids(item))
    elif isinstance(value, list):
        for item in value:
            result.update(popup_reference_ids(item))
    return result

def remap_popup_references(value, replacements: dict[str, str]) -> None:
    if isinstance(value, dict):
        if value.get('popupSource') == 'custom' and value.get('popupId') in replacements:
            value['popupId'] = replacements[value['popupId']]
        for item in value.values():
            remap_popup_references(item, replacements)
    elif isinstance(value, list):
        for item in value:
            remap_popup_references(item, replacements)

def clear_popup_references(value, popup_ids: set[str]) -> int:
    '''把指向已删除全局弹窗的操作转换为显式的空操作。'''
    if not popup_ids:
        return 0
    if isinstance(value, dict):
        data = value.get('data')
        if value.get('type') == 'more-info' and isinstance(data, dict) and data.get('popupSource') == 'custom' and data.get('popupId') in popup_ids:
            value.clear()
            value.update({
                'type': 'none',
                'data': { } })
            return 1
        return sum(clear_popup_references(item, popup_ids) for item in value.values())
    if isinstance(value, list):
        return sum(clear_popup_references(item, popup_ids) for item in value)
    return 0

def hydrate_document_popups(database: Session, document: dict, *, referenced_only: bool = False) -> dict:
    hydrated = deepcopy(document)
    popups = global_popups(database)
    if referenced_only:
        referenced = popup_reference_ids(hydrated)
        popups = [popup for popup in popups if popup.get('id') in referenced]
    hydrated['customPopups'] = deepcopy(popups)
    return hydrated

def strip_document_popups(document: dict) -> dict:
    stored = deepcopy(document)
    stored['customPopups'] = []
    return stored
