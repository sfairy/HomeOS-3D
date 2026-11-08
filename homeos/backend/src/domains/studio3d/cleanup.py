"""Studio 3D 删除级联清理：把 3D 场景里被删掉的物件/灯组/门/窗扇/楼层从项目交互配置中摘除。

原 ``modules/interaction3d/studio_cleanup.py`` 已并入本模块（C1），那里只保留了
一段时间的 re-export 垫片，随零引用清理一并删除。这里只保留业务规则：

- ``identities`` 决定「哪些绑定目标被删了」（模型、灯组、门、窗扇，以及**楼层本身**）；
- ``remove_bindings`` 是「摘除」的唯一实现：删除级联与显式修复共用同一套集合与
  窗帘组清理口径，只改交互配置，绝不碰实体或设备状态；
- ``plan_cleanup`` 产出新文档、可回滚归档与影响清单；
- ``repair_binding_document`` 产出「只读修复预览」（改了哪几项、为什么失效），
  真正落库仍走项目编辑器的 PUT，历史与乐观锁不变；
- ``confirmation_token`` 给「一次删除影响多个项目」的场景做一次性确认凭据。

行为约束（与迁移前一致）：快照文件缺失的组件仍然不改变其绑定 —— 宁可留下不可达
绑定，也不凭缺失文件误删用户配置；区别是现在会记录警告，而不是静默跳过。
静默跳过会让「删了家具、但项目里的交互项还在」这类反馈无从排查。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Iterable
from copy import deepcopy
from typing import Any

from fastapi import HTTPException, status

from . import draft_repository
from ...modules.interaction3d.access import module_components, scene_snapshot_file
from ...modules.interaction3d.device import GENERIC_DEVICE_COLLECTIONS
from ...modules.interaction3d.media_device import MEDIA_DEVICE_COLLECTIONS
from ...modules.interaction3d.window import window_targets

logger = logging.getLogger(__name__)

#: 户型快照里标记来源的键：``'template'`` 表示随包分发的模板户型（不可编辑，
#: 也不会跟着用户的 3D 绘制草稿走）；缺省表示用户自己绘制的户型。
SCENE_SOURCE_KEY = "interaction3dSource"

#: 交互配置里各集合的绑定口径。顺序即「摘除记录」的输出顺序，保持稳定便于前端 diff。
COLLECTIONS = (
    ("lights",),
    ("environment", "airConditioners"),
    ("environment", "airers"),
    ("environment", "fans"),
    ("environment", "exhaustFans"),
    ("environment", "airPurifiers"),
    ("environment", "waterHeaters"),
    ("environment", "curtains"),
    ("environment", "windowOpeners"),
    ("environment", "temperatureHumidity"),
    ("devices", "nas"),
    *(("devices", key) for key in MEDIA_DEVICE_COLLECTIONS),
    ("devices", "speakers"),
    ("devices", "vacuums"),
    *(("devices", key) for key in GENERIC_DEVICE_COLLECTIONS),
    ("security", "alarms"),
    ("security", "cameras"),
    ("security", "presenceSensors"),
    ("security", "locks"),
    ("security", "windows"),
)

#: 「绑定在楼层上」而不是绑定在某个模型上的集合：整层温湿度、整层报警。
#: 它们的绑定键是 ``(floorId, 'floor', floorId)``。
FLOOR_COLLECTIONS = frozenset({("security", "alarms"), ("environment", "temperatureHumidity")})

#: 绑定在**窗扇**上的集合：钥匙是 ``window:{windowId}:{sashId}``。
WINDOW_COLLECTIONS = frozenset({("security", "windows"), ("environment", "windowOpeners")})


def identities(scene) -> set[tuple[str, str, str]]:
    """场景中所有「可被交互配置绑定」的目标身份：`(floorId, kind, id)`。

    kind 取 `floor` / `model` / `light` / `door` / `window`：门用 `door:<id>` 前缀，
    窗扇用 :func:`window_targets` 的 ``window:{窗}：{扇}`` 身份，避免与同层模型 id 撞车。
    缺 id 的条目直接丢弃 —— 没有身份就无法判断它是否被删。
    """
    result: set[tuple[str, str, str]] = set()
    for floor in (scene or {}).get("floors", []):
        if not isinstance(floor, dict) or not floor.get("id"):
            continue
        result.add((floor["id"], "floor", floor["id"]))
        # 先落成变量再窄化：``floor.get("scene")`` 是 ``Unknown | None``，直接在条件表达式
        # 里 isinstance 判不干净 —— 检查器拿不到同一个值，``payload`` 会留成
        # ``Unknown | dict | None``，后面每次 ``.get`` 都报可选链访问。
        payload = floor.get("scene")
        if not isinstance(payload, dict):
            payload = {}
        for kind, field in (("model", "items"), ("light", "lightGroups")):
            result.update((floor["id"], kind, item["id"]) for item in payload.get(field, []) if item.get("id"))
        result.update(
            (floor["id"], "door", f"door:{item['id']}") for item in payload.get("doors", []) if item.get("id")
        )
        # 窗扇：只有「自定义窗型 + 版式 v1」的窗才有可绑定的叶子窗扇。
        # ``window_targets`` 是单场景视角（校验开窗器时按楼层取 scene），
        # 这里补齐 floorId，让它与其它绑定身份同构。
        result.update((floor["id"], "window", model_id) for model_id in window_targets(payload, include_legacy=True))
    return result


def collection(properties, path):
    """按 `path` 取 `(父容器, 列表)`，供调用方原地改写 `父容器[path[-1]]`。

    注意：中间层级缺失时返回的是一个**游离**的空 dict，对其写回不会影响 `properties`。
    这是刻意的 —— 项目里没有该集合时本来就不该凭空造出一层。
    """
    parent = properties
    for key in path[:-1]:
        parent = parent.get(key, {})
    return (parent, parent.get(path[-1], []))


def binding_key(item, path):
    """交互项 → 它绑定的目标身份（与 `identities()` 的三元组同构）。

    分五档，顺序即优先级：

    - 楼层级控件（``security.alarms`` / ``temperatureHumidity``）绑楼层；
    - 锁绑门、开窗器/窗磁绑窗扇（都用 ``modelId``，语义由集合决定）；
    - 灯绑灯组、其余绑模型；
    - 绑定键缺失时返回含 `None` 的元组，天然匹配不上任何目标。
    """
    if path in FLOOR_COLLECTIONS:
        return (item.get("floorId"), "floor", item.get("floorId"))
    if path == ("security", "locks"):
        return (item.get("floorId"), "door", item.get("modelId"))
    if path in WINDOW_COLLECTIONS:
        return (item.get("floorId"), "window", item.get("modelId"))
    return (
        item.get("floorId"),
        "light" if path == ("lights",) else "model",
        item.get("groupId") if path == ("lights",) else item.get("modelId"),
    )


def _hashable(values):
    """把值收成集合；遇到不可哈希元素返回 None（调用方回退逐项比较）。"""
    result = set()
    for value in values:
        try:
            result.add(value)
        except TypeError:
            return None
    return result


def _binding_present(items, item, path, key):
    """``items`` 中是否已有同一 id 或同一绑定键的条目。

    楼层级集合不比较绑定键 —— 同层所有条目共享 ``(floorId, 'floor', floorId)``，
    按绑定键判重会把「恢复一层温湿度」误判成已存在。其余集合等价于原来的
    ``any(other.id == item.id or binding_key(other) == key)``：常规路径用集合做 O(1)
    判断，元素不可哈希时回退逐项比较。
    """
    ids = _hashable(other.get("id") for other in items)
    if ids is not None and item.get("id") in ids:
        return True
    if path in FLOOR_COLLECTIONS:
        return False
    keys = _hashable(binding_key(other, path) for other in items)
    if keys is None:
        return any(other.get("id") == item.get("id") or binding_key(other, path) == tuple(key) for other in items)
    return tuple(key) in keys


def remove_bindings(properties, predicate, *, removed_floors: frozenset[str] | set[str] = frozenset()):
    """在调用方传入的副本上原地摘除绑定，返回**精确的**被删记录供撤销/前端展示。

    删除级联与显式修复共用这一处集合清理 + 窗帘组清理口径。只动交互配置，绝不碰
    实体或设备状态。返回 ``[(path, item, key)]``：``key`` 是绑定身份三元组，
    ``None`` 表示窗帘组（它没有单一绑定身份）。
    """
    removed: list[tuple[tuple, dict, tuple | None]] = []
    curtain_ids: set[str] = set()
    for parts in COLLECTIONS:
        parent, items = collection(properties, parts)
        deleted: list[dict] = []
        kept: list[dict] = []
        for item in items:
            (deleted if predicate(item, parts) else kept).append(item)
        if not deleted:
            continue
        parent[parts[-1]] = kept
        removed.extend((parts, item, binding_key(item, parts)) for item in deleted)
        if parts == ("environment", "curtains"):
            curtain_ids.update(item["id"] for item in deleted)
    environment = properties.get("environment", {})
    groups = environment.get("curtainGroups", [])
    broken = [
        group
        for group in groups
        if group.get("floorId") in removed_floors or curtain_ids.intersection(group.get("memberIds", []))
    ]
    if broken:
        environment["curtainGroups"] = [group for group in groups if group not in broken]
        removed.extend((("environment", "curtainGroups"), group, None) for group in broken)
    return removed


def is_template_scene(snapshot) -> bool:
    """户型快照是不是「随包模板」：模板户型不跟着用户的可编辑草稿走。

    只认显式来源标记。旧快照没有标记时按用户户型处理 —— 宁可多校验一次，
    也不要把用户的房子当成模板而跳过清理。
    """
    return isinstance(snapshot, dict) and snapshot.get(SCENE_SOURCE_KEY) == "template"


def _binding_conflict(message: str) -> HTTPException:
    """``STUDIO3D_BINDING_CONFLICT`` 的唯一构造点（文案由调用方给）。"""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "STUDIO3D_BINDING_CONFLICT", "message": message},
    )


def _load_snapshot(path, *, strict: bool) -> dict | None:
    """读一份户型快照；读不出来时 ``strict`` 抛 409，否则记 warning 并返回 ``None``。

    ``None`` 在调用方一律按「未知来源」处理（跳过校验、不允许据此做破坏性修复）。
    """
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(snapshot, dict):
            raise ValueError("invalid snapshot")
    # `# fmt: skip`：括号不能省，否则 ruff format（target py314）会按 PEP 758
    # 改写成无括号形式，而 Cython 3.3.0 会把后者按 `except A as B:` 误解析
    # （3 个以上的异常名则直接解析失败）。守卫见 gate:infra 的 check:cython。
    except (OSError, UnicodeDecodeError, ValueError):  # fmt: skip
        if strict:
            raise _binding_conflict("户型来源无法读取，未清理任何配置。请先检查或重新载入户型。") from None
        logger.warning("3D 交互场景快照无法解析，跳过绑定校验：%s", path, exc_info=True)
        return None
    return snapshot


def current_binding_sources(settings, database, scene_ids: Iterable[str], *, strict: bool = False):
    """本次保存/修复使用的「权威户型身份」：``{sceneId: set[身份] | None}``。

    必须在资产写锁内调用。当前草稿（``studio_drafts``）优先；模板快照永远不跟随
    可编辑草稿，直接用快照自身。未知来源（快照缺失/不可解析）返回 ``None`` ——
    保存侧保持旧行为（跳过校验），但**不允许**据此做破坏性修复。

    ``strict=True`` 时，「快照坏了」直接 409 而不是跳过：修复会把配置真的删掉，
    证明不了户型现状就不许动手。
    """
    sources: dict[str, set | None] = {}
    current: dict | None = None
    loaded = False
    for scene_id in dict.fromkeys(scene_ids):
        sources[scene_id] = None
        if not isinstance(scene_id, str) or re.fullmatch("[a-f0-9]{32}", scene_id) is None:
            continue
        path = scene_snapshot_file(settings, scene_id)
        if path is None:
            continue
        snapshot = _load_snapshot(path, strict=strict)
        if snapshot is None or is_template_scene(snapshot):
            continue
        if not loaded:
            current = _current_draft_scene(database)
            loaded = True
        scene = current
        if scene is None:
            # 没有可编辑草稿时退回快照自身（模型的旧版本行为）。但快照必须是
            # ``{"scene": {"floors": [...]}}`` 的现行格式：更早版本写下的快照没有顶层
            # ``scene``，那时没有可对照的户型数据，按「未知来源」跳过而不是误杀 ——
            # 与「快照缺失 / 不可解析」同一口径，只有读得出来才敢判定绑定失效。
            scene = snapshot.get("scene")
            if not isinstance(scene, dict):
                logger.warning("3D 交互场景快照缺少 scene（旧格式），跳过绑定校验：%s", path)
                continue
        try:
            sources[scene_id] = identities(scene)
        except (OSError, UnicodeDecodeError, ValueError, TypeError, KeyError, AttributeError) as error:
            raise _binding_conflict("无法核对最新户型，请先打开户型绘制检查，再保存新增或复制的 3D 配置。") from error
    return sources


def _current_draft_scene(database) -> dict | None:
    """当前可编辑户型草稿的 scene；没有草稿返回 ``None``。

    读不出来（草稿损坏）不能当成「没有草稿」放行 —— 那就是「证明不了就不许写」。
    """
    try:
        snapshot = draft_repository.read_snapshot(database)
    except HTTPException as error:
        raise _binding_conflict("无法核对最新户型，请先打开户型绘制检查，再保存新增或复制的 3D 配置。") from error
    return snapshot.scene if snapshot is not None else None


def _binding_reference_map(document):
    """文档里所有「交互项 → 绑定的户型身份」，键为 ``(sceneId, (floorId, kind, id))``。

    值与 ``identities()`` 同构，因此可以直接和「当前户型图的身份集合」求差；
    ``label`` 只用于错误文案，取交互项自己的 label / id。
    """
    result = {}
    for _, component in module_components(document or {}):
        properties = component.get("properties") or {}
        scene_id = properties.get("sceneId") or ""
        if not isinstance(scene_id, str) or re.fullmatch("[a-f0-9]{32}", scene_id) is None:
            continue
        for parts in COLLECTIONS:
            _, items = collection(properties, parts)
            for item in items:
                if not isinstance(item, dict):
                    continue
                key = (scene_id, tuple(binding_key(item, parts)))
                result[key] = item.get("label") or item.get("id") or ""
    return result


def new_binding_references(document, previous=None):
    """``document`` 里**新出现**的绑定引用：``[(sceneId, key, label)]``。

    只检查新增身份是刻意的：普通保存会带上历史遗留的失效绑定（删过的模型），
    全部重校验会让「任何一次保存」都失败。真正需要拦的是撤销 / 粘贴 / 复制把已经
    删掉的模型、楼层、灯组、门又绑回来。
    """
    before = _binding_reference_map(previous)
    return [
        (scene_id, key, label)
        for (scene_id, key), label in _binding_reference_map(document).items()
        if (scene_id, key) not in before
    ]


def require_current_binding_references(settings, database, references) -> None:
    """新增绑定必须存在于**当前**户型图，否则 409 ``STUDIO3D_BINDING_CONFLICT``。

    锁由调用方一直持有到项目提交（共享同一条资产写锁）：校验与写库之间不能插进
    一次户型保存，否则校验通过的是「刚才那一版」户型。
    """
    if not references:
        return
    sources = current_binding_sources(settings, database, (reference[0] for reference in references))
    missing = [
        (scene_id, key, label)
        for scene_id, key, label in references
        if sources.get(scene_id) is not None and key not in sources[scene_id]
    ]
    if not missing:
        return
    # 文案只点名第一个失效项；完整清单在 detail.bindings 里交给前端逐条展示。
    label = missing[0][2]
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "STUDIO3D_BINDING_CONFLICT",
            "message": (
                f"户型已更新，‘{label}’关联的模型或楼层已不存在。请先使用“检查失效配置”修复，或在户型绘制中撤销删除。"
            ),
            "bindings": [
                {"sceneId": scene_id, "floorId": key[0], "kind": key[1], "modelId": key[2], "label": item_label}
                for scene_id, key, item_label in missing
            ],
        },
    )


def _interaction3d_components(document, selected: set):
    """深度遍历文档，产出参与修复的 ``interaction3d`` 组件。

    没有选中任何容器时全量返回；选中了容器就把它和它的子组件一起带上（容器级选中
    的意思是「这棵树都算」），未选中的组件原样跳过。
    """

    def visit(value, active):
        if isinstance(value, list):
            for item in value:
                yield from visit(item, active)
            return
        if not isinstance(value, dict):
            return
        active = active or (bool(value.get("type")) and value.get("id") in selected)
        if value.get("type") == "interaction3d":
            if not selected or active:
                yield value
            return
        for item in value.values():
            yield from visit(item, active)

    yield from visit(document, False)


def repair_binding_document(document, settings, database, component_ids):
    """当前工作文档的**只读**修复提案：``(更新后的文档, 问题清单)``。

    落库与历史仍归既有项目编辑器与 PUT 路由。选中一个容器就带上它的子组件；
    未被选中的组件原样返回。旧版本留下的失效绑定也在检查范围内 —— 这正是
    「检查失效配置」要解决的问题。
    """
    updated = deepcopy(document)
    components = list(_interaction3d_components(updated, set(component_ids or ())))
    sources = current_binding_sources(
        settings,
        database,
        (component.get("properties", {}).get("sceneId", "") for component in components),
        strict=True,
    )
    issues: list[dict[str, Any]] = []
    for component in components:
        properties = component.get("properties", {})
        scene_id = properties.get("sceneId", "")
        present = sources.get(scene_id)
        if present is None:
            continue

        def missing(item, parts, present=present):
            key = binding_key(item, parts)
            return (bool(key[0]) and (key[0], "floor", key[0]) not in present) or (bool(key[2]) and key not in present)

        for parts, item, key in remove_bindings(properties, missing):
            if key is None:
                reason = "关联成员失效"
            elif (key[0], "floor", key[0]) not in present:
                reason = "楼层已删除"
            else:
                reason = "模型或灯组已删除"
            issues.append(
                {
                    "componentId": component.get("id"),
                    "componentLabel": properties.get("label") or "3D 交互",
                    "sceneId": scene_id,
                    "collection": list(parts),
                    "bindingId": item.get("id"),
                    "floorId": item.get("floorId", ""),
                    "label": item.get("label") or item.get("id") or "设备",
                    "reason": reason,
                }
            )
    return (updated, issues)


def _restore_binding_entry(properties, entry, asset_exists) -> None:
    """把一条归档绑定放回组件；封面图资产已不存在时只恢复条目、丢掉图。"""
    parts = tuple(entry["path"])
    parent, items = collection(properties, parts)
    item = entry["item"]
    if _binding_present(items, item, parts, entry["key"]):
        return
    restored = deepcopy(item)
    if parts in (("devices", "computers"), ("devices", "televisions")) and asset_exists is not None:
        image = restored.get("screenImage")
        if (
            isinstance(image, dict)
            and isinstance(image.get("assetId"), str)
            and not asset_exists(image["assetId"])
        ):
            restored.pop("screenImage")
    parent[parts[-1]] = [*items, restored]


def _restorable_curtain_group(environment, entry) -> dict | None:
    """归档里的窗帘组现在能否重新挂上：能则返回副本，不能（成员缺失/冲突/不合法）返回 ``None``。"""
    group = entry["item"]
    members = environment.get("curtains", [])
    member_ids = {item["id"] for item in members}
    if not set(group["memberIds"]) <= member_ids:
        return None
    groups = environment.get("curtainGroups", [])
    if any(g["id"] == group["id"] or set(g["memberIds"]) & set(group["memberIds"]) for g in groups):
        return None
    selected = [item for item in members if item["id"] in group["memberIds"]]
    valid = len(selected) == 2 and all(
        item.get("floorId") == group["floorId"] and item.get("coverKind") != "dream" for item in selected
    )
    valid = valid and not (
        selected[0].get("entityId") and selected[0].get("entityId") == selected[1].get("entityId")
    )
    return deepcopy(group) if valid else None


def plan_cleanup(documents, old_scene, new_scene, archives, settings, *, asset_exists=None):
    """计算删除级联清理计划，返回 `(新文档, 新归档, 影响清单)`，且不修改任何入参。

    四步：
    1. 用 `identities()` 对比新旧场景，得到被删/新增的绑定目标（含整层删除）；
    2. 逐项目逐组件，用 `remove_bindings()` 把绑定了「被删目标」的交互项摘出来，
       写进归档（整层删除的条目额外记 `restoreFloorId`，便于按楼层整批恢复）；
    3. 反方向处理「新增目标」—— 从归档里捞回此前被摘掉、如今又能绑上的条目。
       整层恢复按 `restoreFloorId` 匹配；恢复电脑/电视的封面图前先用 `asset_exists`
       确认资产还在，否则只恢复条目、丢掉已失效的 `screenImage`；
    4. 幂等：已消费的归档条目按 `id()` 去重，末尾按原顺序过滤，等价于逐条 `saved.remove`。

    `documents` 只返回**真的变了**的项目（`updated != document`），避免无谓写库。
    """
    before = identities(old_scene)
    after = identities(new_scene)
    removed = before - after
    added = after - before
    removed_floors = {key[0] for key in removed if key[1] == "floor"}
    added_floors = {key[0] for key in added if key[1] == "floor"}
    if not removed and not added:
        return ({}, deepcopy(archives), [])
    output = {}
    saved = deepcopy(archives)
    impacts = []
    reported_missing = set()
    # 按 scope 分桶：原实现每个组件都重扫整份归档（O(组件数 × 归档数)），归档越多越慢。
    # 分桶后每个组件只遍历自己 scope 的条目；桶内顺序与 saved 中的原始顺序一致，
    # 因此「按身份标记已消费 + 末尾按原顺序过滤」与逐条 `saved.remove(entry)` 等价。
    saved_by_scope: dict[tuple, list[dict]] = {}
    for archived in saved:
        saved_by_scope.setdefault(tuple(archived["scope"]), []).append(archived)
    consumed: set[int] = set()

    def append_saved(entry: dict) -> None:
        saved.append(entry)
        saved_by_scope.setdefault(tuple(entry["scope"]), []).append(entry)

    def missing(item, parts):
        return item.get("floorId") in removed_floors or binding_key(item, parts) in removed

    for project_id, document in documents.items():
        updated = deepcopy(document)
        for _, component in module_components(updated):
            properties = component.get("properties", {})
            scene_id = properties.get("sceneId", "")
            snapshot = scene_snapshot_file(settings, scene_id)
            if snapshot is None:
                # 不静默跳过：记录一次（同一组件只记一次），继续处理其余组件/项目。
                if scene_id and (project_id, component.get("id"), scene_id) not in reported_missing:
                    reported_missing.add((project_id, component.get("id"), scene_id))
                    logger.warning(
                        "3D 交互场景快照缺失，跳过该组件的级联清理（绑定保持不变）：project=%s component=%s scene=%s",
                        project_id,
                        component.get("id"),
                        scene_id,
                    )
                continue
            try:
                payload = json.loads(snapshot.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError):  # fmt: skip
                logger.warning("3D 交互场景快照无法解析，跳过级联清理：%s", snapshot, exc_info=True)
                continue
            if is_template_scene(payload):
                # 模板户型不是用户的房子：既不清理，也不参与「删了又加回来」的恢复。
                continue
            scope = [project_id, component.get("id"), scene_id]
            deleted = remove_bindings(properties, missing, removed_floors=removed_floors)
            for parts, item, key in deleted:
                entry = {
                    "scope": scope,
                    "path": list(parts),
                    "item": deepcopy(item),
                    "key": list(key) if key is not None else None,
                }
                if item.get("floorId") in removed_floors:
                    entry["restoreFloorId"] = item["floorId"]
                append_saved(entry)
                if key is None:
                    continue
                impacts.append(
                    {
                        "projectId": project_id,
                        "componentId": component.get("id"),
                        "label": item.get("label") or item.get("id"),
                    }
                )
            environment = properties.get("environment", {})
            for entry in list(saved_by_scope.get(tuple(scope), ())):
                if id(entry) in consumed or entry["key"] is None:
                    continue
                if tuple(entry["key"]) not in added and entry.get("restoreFloorId") not in added_floors:
                    continue
                _restore_binding_entry(properties, entry, asset_exists)
                consumed.add(id(entry))
            for entry in list(saved_by_scope.get(tuple(scope), ())):
                if id(entry) in consumed or entry["key"] is not None:
                    continue
                restored_group = _restorable_curtain_group(environment, entry)
                if restored_group is not None:
                    environment["curtainGroups"] = [*environment.get("curtainGroups", []), restored_group]
                consumed.add(id(entry))
        if updated != document:
            output[project_id] = updated
    if consumed:
        saved = [entry for entry in saved if id(entry) not in consumed]
    return (output, saved, impacts)


def confirmation_token(revision, scene, documents, impacts):
    """「一次删除影响多个项目」的一次性确认凭据。

    对 `[revision, scene, documents, impacts]` 的规范化 JSON（键排序、无空格）取 SHA-256，
    因此入参任一字节变化都会让旧 token 失效 —— 前端必须带着与服务端一致的影响面回传。
    """
    return hashlib.sha256(
        json.dumps([revision, scene, documents, impacts], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
