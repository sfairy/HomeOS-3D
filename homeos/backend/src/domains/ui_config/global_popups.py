from __future__ import annotations

import json
import logging
from copy import deepcopy

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ...platform.core.db.models import GlobalCustomPopupState

logger = logging.getLogger(__name__)

#: 全局弹窗状态是单行表（``id = 1``）。读写两端共用这一个常量，避免 `get(..., 1)` 散落。
GLOBAL_POPUP_STATE_ID = 1


def global_popup_state(database: Session) -> GlobalCustomPopupState:
    state = database.get(GlobalCustomPopupState, GLOBAL_POPUP_STATE_ID)
    if state is None:
        state = GlobalCustomPopupState(id = GLOBAL_POPUP_STATE_ID, revision = 1, popups_json = '[]')
        database.add(state)
        database.flush()
    return state


def parse_popups_json(raw: str | None) -> list[dict]:
    """把 ``popups_json`` 解析成列表；非法内容按空列表处理。

    读路径（`GET /projects/{id}/draft`）在 SQL 里直接把这一列取出来，不再走
    `global_popups(database)`：后者会顺带 `global_popup_state()`，而行不存在时它会
    **插入一行**——一个 GET 因此产生写事务与一次 flush。语义上「没有那一行」与
    「有一行 revision=1 / []」完全等价，所以读路径按后者的取值处理即可。
    """
    try:
        value = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        # 坏内容按空列表处理，但留痕：读路径每次都会经过这里，出现即说明有写入方
        # 把非 JSON 内容塞进了 popups_json。
        logger.debug("全局弹窗内容不是合法 JSON，按空列表处理", exc_info=True)
        return []
    return value if isinstance(value, list) else []

def global_popups(database: Session, *, require_readable: bool = False) -> list[dict]:
    """读取全局组合弹窗列表。

    ``require_readable=True`` 时把「存储内容不是合法 JSON 数组」当成错误抛出 409：
    删除 / 覆盖图片前必须证明弹窗里没有引用它，读不出来时按「可能引用」处理，
    否则一次坏配置就能把仍在使用中的图片删掉（0.8.1 的修复点）。
    """
    state = global_popup_state(database)
    try:
        value = json.loads(state.popups_json)
        if not isinstance(value, list):
            raise ValueError('global popups must be an array')
    except (TypeError, ValueError) as error:
        if require_readable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='无法核对全局组合弹窗的图片引用，请先恢复弹窗配置后再删除或覆盖。',
            ) from error
        value = []
    return value


def apply_popups_to_document(document: dict, popups: list[dict], *, referenced_only: bool = False) -> dict:
    """把全局弹窗写进 ``document['customPopups']`` 并返回同一个 dict（**原地修改**）。

    与 `hydrate_document_popups` 的区别只有「不复用整篇文档的深拷贝」：
    读路径上 `document` 是 `json.loads(...)` 刚解析出来的临时对象，深拷贝 30~40KB 的
    嵌套结构纯属浪费（实测这是 draft 读接口除 JSON 解析外最大的 CPU 项）。
    调用方必须拥有这个 dict —— 共享引用（例如请求体、缓存对象）仍要走
    `hydrate_document_popups`，那里会先 `deepcopy`。
    """
    if referenced_only:
        referenced = popup_reference_ids(document)
        popups = [popup for popup in popups if popup.get('id') in referenced]
    # 弹窗列表本身来自共享的存储结构，必须复制，不能让调用方改到库里那份。
    document['customPopups'] = deepcopy(popups)
    return document

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
    return apply_popups_to_document(hydrated, global_popups(database), referenced_only=referenced_only)

def strip_document_popups(document: dict) -> dict:
    stored = deepcopy(document)
    stored['customPopups'] = []
    return stored
