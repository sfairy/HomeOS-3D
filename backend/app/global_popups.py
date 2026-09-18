"""全局组合弹窗：跨项目共享的弹窗定义，与项目文档的合并 / 剥离。

背景：组合弹窗有两个来源 —— 项目私有的存在文档里，全局的存在
`GlobalCustomPopupState` 单行表里（所有项目共享）。

本模块负责两者之间的转换：
- 读取文档时「水合」：把全局弹窗合进 document.customPopups 再下发前端；
- 保存文档时「剥离」：文档里只留项目私有的，全局的交给全局表维护。

这样前端始终只看到一份完整列表，不必关心弹窗的归属。
"""
from __future__ import annotations

import json
from copy import deepcopy
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import GlobalCustomPopupState, Project, ProjectDraft
from .panel.documents import parse_document


def _canonical(value) -> str:
    """把值序列化成稳定的比较用字符串。

    排序键并去掉空格，保证「同一份内容」无论键序如何都得到相同结果 ——
    合并弹窗时靠它判断内容是否真的变了。
    """
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


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


def remap_popup_references(value, replacements: dict[str, str]) -> None:
    """就地改写文档里指向弹窗的动作，按 replacements 换 id。

    用于合并时给冲突弹窗分配了新 id 之后同步更新引用，
    否则文档里的动作会指向一个不存在的弹窗。
    """
    if isinstance(value, dict):
        if value.get("popupSource") == "custom" and value.get("popupId") in replacements:
            value["popupId"] = replacements[value["popupId"]]
        for item in value.values():
            remap_popup_references(item, replacements)
    elif isinstance(value, list):
        for item in value:
            remap_popup_references(item, replacements)


def clear_popup_references(value, popup_ids: set[str]) -> int:
    """把指向已删除全局弹窗的动作改写成显式的空动作。

    改写成 type="none" 而不是删除该动作：控件本来配了点击行为，
    静默移除会让前端事件绑定错位；显式置空则得到"点了没反应"的安全降级。

    返回:
        被改写的动作数量。
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

    参数:
        database: 数据库会话。
        document: 项目文档。
        referenced_only: True 时只带出文档真正引用到的全局弹窗
            （展示页与中控视角用，减少下发体积）；False 则全量带出（编辑器用）。

    返回:
        文档的深拷贝，其 customPopups 已含全局弹窗；入参不会被修改。
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

    返回深拷贝；文档里的弹窗定义已经通过 merge_document_popups
    归并到全局表，这里只需留空占位。
    """
    stored = deepcopy(document)
    stored["customPopups"] = []
    return stored


def merge_document_popups(
    database: Session,
    document: dict,
    *,
    updated_by: str | None = None,
) -> dict:
    """把文档里的弹窗并入全局表，并解决 id 冲突。

    冲突处理：若文档里某个弹窗的 id 在全局表已存在但内容不同，
    说明它和别的项目定义的弹窗撞了 id —— 这时给它分配一个新 id，
    并回写文档中所有指向它的引用，而不是覆盖全局表里的那条。

    只有真正新增了弹窗才会写库并递增 revision。

    参数:
        database: 数据库会话。
        document: 待保存的文档。
        updated_by: 记录本次变更的用户 id。

    返回:
        弹窗已补齐（含全局已有的与本次新增的）的文档副本。
    """
    state = global_popup_state(database)
    current = global_popups(database)
    by_id = {popup.get("id"): popup for popup in current if isinstance(popup, dict)}
    # 旧的弹窗 id -> 新分配的 id，用于最后统一改写文档引用。
    replacements = {}
    changed = False
    for source in document.get("customPopups") or []:
        if not (isinstance(source, dict) and isinstance(source.get("id"), str)):
            continue
        popup = deepcopy(source)
        popup_id = popup["id"]
        existing = by_id.get(popup_id)
        # 同 id 但内容不同：视为跨项目的 id 冲突，换新 id 而不是覆盖。
        if existing is not None and _canonical(existing) != _canonical(popup):
            replacement = f"custom-popup-global-{uuid4()}"
            popup["id"] = replacement
            replacements[popup_id] = replacement
            popup_id = replacement
            existing = None
        if existing is not None:
            continue
        current.append(popup)
        by_id[popup_id] = popup
        changed = True
    merged = deepcopy(document)
    # 先改写引用再拼回弹窗列表：顺序反了会让改动落在被丢弃的副本上。
    if replacements:
        remap_popup_references(merged, replacements)
    merged["customPopups"] = deepcopy(current)
    if changed:
        state.popups_json = _canonical(current)
        state.revision += 1
        state.updated_by = updated_by
    return merged


def popup_reference_projects(
    database: Session,
    popup_ids: set[str],
    *,
    exclude_project_id: str | None = None,
) -> list[str]:
    """列出引用了给定弹窗的项目名称。

    用于删除全局弹窗前的提示：先告诉用户哪些仪表盘会受影响。

    参数:
        popup_ids: 待删除的弹窗 id 集合。
        exclude_project_id: 排除某个项目（通常是当前正在编辑的那个）。

    返回:
        项目名称列表；草稿损坏或未引用该弹窗的项目会被跳过。
    """
    if not popup_ids:
        return []
    names = {project.id: project.name for project in database.scalars(select(Project))}
    result = []
    for draft in database.scalars(select(ProjectDraft)):
        if draft.project_id == exclude_project_id:
            continue
        # 单份草稿损坏时跳过：它引用不到任何弹窗，不必连累这次统计（B54）。
        document = parse_document(draft.document_json)
        if document is None:
            continue
        if not popup_reference_ids(document) & popup_ids:
            continue
        result.append(names.get(draft.project_id, draft.project_id))
    return result
