"""全局组合弹窗：跨项目共享的弹窗定义，与项目文档之间的水合 / 剥离。

组合弹窗**只有全局一份**，存在 `GlobalCustomPopupState` 单行表里（所有项目共享）。项目文档里的
`document.customPopups` 入库时被 `strip_document_popups` 清成空数组 —— 它只是占位，真正的定义
永远只在全局表里，因此不存在「两处各存一份、以谁为准」的问题。

本模块负责全局定义与项目文档之间的转换：读取时「水合」（把全局弹窗合进
`document.customPopups` 再下发前端），保存时「剥离」（入库前清空 `document.customPopups`，
全局那份由独立提交流程维护 —— 前端在 `payload.global_popups_dirty` 为真时把整张全局列表
一起交上来）。前端始终只看到一份完整列表。

删除被别的项目引用的全局弹窗时，保存路径必须把所有草稿里指向它的引用一起清掉。
`projects.py` 里那段级联清理**一直在**，但曾被一个集合差的方向错误挡在门外：算出来的是
「提交里有、库里没有」= 本次**新增**的弹窗，却被当成「本次被删掉的」。三条后果都静默 ——
新增弹窗的那次保存里指向新弹窗的动作被清成 `type:"none"`；删弹窗时集合恒为空、级联形同虚设
（别的草稿留着悬空引用，**下次保存必定 422**，那个仪表盘再也存不回去）；当前文档自己引用着
被删的弹窗时连本份文档都没清、校验层当场 422（用户根本删不掉）。方向改对后这三条一并修掉。
**已知边界**：草稿解析失败的那几份按 B54 跳过（清理不掉它的引用，但不该让整笔删除失败），
悬空引用要等用户自己改一次动作。
"""
from __future__ import annotations

import json
from copy import deepcopy

from sqlalchemy.orm import Session

from ..core.models import GlobalCustomPopupState


def global_popup_state(database: Session) -> GlobalCustomPopupState:
    """取出全局弹窗状态行；不存在时按需创建。

    固定使用 id=1 的单行表，因此用 get 而不是查询。
    """
    state = database.get(GlobalCustomPopupState, 1)
    if state is None:
        state = GlobalCustomPopupState(id=1, revision=1, popups_json="[]")
        database.add(state)
        database.flush()
    return state


def global_popups(database: Session) -> list[dict]:
    """读取全局弹窗列表；内容损坏时退化成空列表而不是抛错。"""
    state = global_popup_state(database)
    try:
        value = json.loads(state.popups_json)
    except (TypeError, json.JSONDecodeError):
        value = []
    return value if isinstance(value, list) else []


def popup_reference_ids(value) -> set[str]:
    """递归收集文档中所有指向组合弹窗的 popupId。

    只认 popupSource == "custom" 的动作，避免把实体弹窗的目标误当成弹窗 ID。
    """
    result = set()
    if isinstance(value, dict):
        if value.get("popupSource") == "custom" and isinstance(value.get("popupId"), str):
            result.add(value["popupId"])
        for item in value.values():
            result.update(popup_reference_ids(item))
    elif isinstance(value, list):
        for item in value:
            result.update(popup_reference_ids(item))
    return result


def clear_popup_references(value, popup_ids: set[str]) -> int:
    """把指向已删除全局弹窗的动作改写成显式的空动作。

    改写成 type="none" 而不是删除该动作：控件本来配了点击行为，
    静默移除会让前端事件绑定错位；显式置空则得到"点了没反应"的安全降级。
    """
    if not popup_ids:
        return 0
    if isinstance(value, dict):
        data = value.get("data")
        if (
            value.get("type") == "more-info"
            and isinstance(data, dict)
            and data.get("popupSource") == "custom"
            and data.get("popupId") in popup_ids
        ):
            value.clear()
            value.update({"type": "none", "data": {}})
            return 1
        return sum(clear_popup_references(item, popup_ids) for item in value.values())
    if isinstance(value, list):
        return sum(clear_popup_references(item, popup_ids) for item in value)
    return 0


def hydrate_document_popups(
    database: Session,
    document: dict,
    *,
    referenced_only: bool = False,
    ) -> dict:
    """把全局弹窗合并进文档，返回可直接下发前端的副本。
    """
    hydrated = deepcopy(document)
    popups = global_popups(database)
    if referenced_only:
        referenced = popup_reference_ids(hydrated)
        popups = [popup for popup in popups if popup.get("id") in referenced]
    hydrated["customPopups"] = deepcopy(popups)
    return hydrated


def strip_document_popups(document: dict) -> dict:
    """入库前清空 customPopups，全局弹窗不重复存进项目文档。

    返回深拷贝；全局弹窗由 `GlobalCustomPopupState` 那份独立提交流程维护，
    项目文档里只留空占位，读取时再由 `hydrate_document_popups` 合回来 ——
    同一条弹窗不会在两处各存一份，也就不存在「以谁为准」的问题。
    """
    stored = deepcopy(document)
    stored["customPopups"] = []
    return stored
