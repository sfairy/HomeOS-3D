from __future__ import annotations
import json
from copy import deepcopy
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import GlobalCustomPopupState, Project, ProjectDraft

def _canonical(value) -> str:
    return json.dumps(value, ensure_ascii = False, sort_keys = True, separators = (',', ':'))

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
    return None

def clear_popup_references(value, popup_ids: set[str]) -> int:
    '''Turn actions targeting deleted global popups into explicit no-op actions.'''
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

def merge_document_popups(database: Session, document: dict, *, updated_by: str | None = None) -> dict:
    state = global_popup_state(database)
    current = global_popups(database)
    by_id = {popup.get('id'): popup for popup in current if isinstance(popup, dict)}
    replacements = {}
    changed = False
    for source in document.get('customPopups') or []:
        if not (isinstance(source, dict) and isinstance(source.get('id'), str)):
            continue
        popup = deepcopy(source)
        popup_id = popup['id']
        existing = by_id.get(popup_id)
        if existing is not None and _canonical(existing) != _canonical(popup):
            replacement = f'custom-popup-global-{uuid4()}'
            popup['id'] = replacement
            replacements[popup_id] = replacement
            popup_id = replacement
            existing = None
        if existing is not None:
            continue
        current.append(popup)
        by_id[popup_id] = popup
        changed = True
    merged = deepcopy(document)
    if replacements:
        remap_popup_references(merged, replacements)
    merged['customPopups'] = deepcopy(current)
    if changed:
        state.popups_json = _canonical(current)
        state.revision += 1
        state.updated_by = updated_by
    return merged

def popup_reference_projects(database: Session, popup_ids: set[str], *, exclude_project_id: str | None = None) -> list[str]:
    if not popup_ids:
        return []
    names = {project.id: project.name for project in database.scalars(select(Project))}
    result = []
    for draft in database.scalars(select(ProjectDraft)):
        if draft.project_id == exclude_project_id:
            continue
        try:
            document = json.loads(draft.document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        if not (popup_reference_ids(document) & popup_ids):
            continue
        result.append(names.get(draft.project_id, draft.project_id))
    return result
