"""实体反向引用查询与解绑（对齐 ``state-store/entity-references*.ts``）。"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
import logging
import re
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Sequence
from contextlib import AbstractContextManager
from functools import lru_cache
from typing import TYPE_CHECKING, Any, NotRequired, Protocol, TypedDict

from ...platform.core.json_field import object_field

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..ha.config.ha_filters import AlertRuleWatchIndex

logger = logging.getLogger("homeos.state_store.entity_references")

#: 打开一次数据库会话的工厂（``Database.session_factory`` 的形状）。
#: 用具体类型而不是 ``Any``：解绑/扫描全部走同步 Session，跨层传 ``Any`` 时
#: 「把 async 工厂传进来」这种错误在运行期才炸，类型收窄后由 pyright 直接拦下。
SessionFactory = Callable[[], AbstractContextManager['Session']]


class AppConfigPort(Protocol):
    """``AppConfigService`` 中本模块用到的两件事（读整份配置 / 打补丁保存）。"""

    def get_all_raw(self) -> dict[str, Any]: ...

    def update(self, partial: dict[str, Any]) -> None: ...


class UiConfigPort(Protocol):
    """``UiConfigService`` 中本模块用到的一件事（保存布局）。"""

    def save_config(self, project_id: str, layout: Any) -> dict[str, Any]: ...


class EntityReference(TypedDict):
    """单条实体反向引用（对齐前端 EntityReference 形状）。"""

    kind: str
    id: str
    role: str
    name: NotRequired[str]
    detail: NotRequired[str]
    path: NotRequired[str]
    jumpTo: NotRequired[str]
    enabled: NotRequired[bool]


class UnlinkResult(TypedDict, total=False):
    """解绑结果：失败仅 ``ok/message``；成功带 ``action`` 等。"""

    ok: bool
    message: str
    action: str
    layoutTouched: bool


class EntityReferencesDeps(TypedDict):
    """解绑/扫描依赖注入（session / 配置仓库 / layout 读写）。

    ``load_layout`` / ``save_layout`` / ``session_factory`` / ``app_config`` /
    ``ui_config`` 是必备依赖（唯一构造点 ``_deps`` 总是提供）；其余为可选能力，
    调用方通过 ``deps.get(...)`` 探测。
    """

    session_factory: SessionFactory
    app_config: AppConfigPort
    ui_config: UiConfigPort
    alert_rule_watch_index: NotRequired[AlertRuleWatchIndex | None]
    #: 同步写库回调（``HomeModeService.update_sync``）。**故意不是 Awaitable**：
    #: 解绑跑在 executor 线程里，若这里传进来 async 版本，调用只会得到一条没人 await
    #: 的协程 —— 模式看着「更新成功」，库里其实一个字没写。构造点用
    #: ``inspect.iscoroutinefunction`` 显式拒绝协程函数，调用点再兜一次 awaitable。
    update_home_mode: NotRequired[Callable[[str, dict[str, Any]], object] | None]
    delete_alert_rule: NotRequired[Callable[[str], dict[str, Any] | None] | None]
    load_layout: Callable[[], dict[str, Any]]
    save_layout: Callable[[dict[str, Any]], None]


#: JSON 树节点（倒排扫描 / 解绑递归用；容器值仍放宽为 Any 以免递归 TypedDict 过深）
JsonValue = dict[str, Any] | list[Any] | str | int | float | bool | None

#: 路径语义判定：出现 ``trigger`` 视为触发侧，出现 ``action`` / ``service`` / ``call`` 视为动作侧。
#: 这两条在倒排扫描里对每条命中路径都要跑一次，预编译避免每次调用重新编译（``re`` 的隐式
#: 缓存也要走一次查表 + 参数拼装）。
_TRIGGER_PATH_PATTERN = re.compile(r'trigger', re.IGNORECASE)
_ACTION_PATH_PATTERN = re.compile(r'action|service|call', re.IGNORECASE)

#: 引用类型（kind）全集 —— 对齐 ``@homeos/shared`` ``EntityReferenceKind``。
ENTITY_REFERENCE_KINDS = (
    "automation",
    "scene",
    "script",
    "template",
    "home_mode",
    "alert_rule",
    "favorite",
    "widget",
    "binding",
    "security_mode",
    "security_zone",
    "env_sensor",
    "system_config",
    "footer",
    "whole_home_off",
    "media",
    "other",
)

#: 引用角色 —— 对齐 ``EntityReferenceRole``。
ENTITY_REFERENCE_ROLES = (
    "trigger",
    "condition",
    "action",
    "member",
    "watch",
    "binding",
    "display",
    "favorite",
    "config",
    "reference",
)


# 工具函数（对齐 entity-references.util.ts）
@lru_cache(maxsize=256)
def _entity_id_boundary_pattern(entity_id: str) -> re.Pattern[str]:
    """实体 ID 的"整词"匹配式，按 ID 缓存。

    倒排扫描会对同一实体 ID 反复调用（每条字符串一次），原本每调一次就 ``re.compile``
    一次。正则由 ID 动态拼出，**无法**提到模块级，因此保留这里的 ``compile`` 并用
    **有界** LRU 缓存（256 个 ID 足够覆盖单次扫描，且不会无界增长）。
    """
    return re.compile(
        r"(?:^|[^A-Za-z0-9_])" + re.escape(entity_id) + r"(?:[^A-Za-z0-9_]|$)"
    )


def text_contains_entity_id(text: str, entity_id: str) -> bool:
    """文本是否包含完整 entity_id（避免 light.a 命中 light.abc）。"""
    if not text or not entity_id:
        return False
    if text == entity_id:
        return True
    return bool(_entity_id_boundary_pattern(entity_id).search(text))


def safe_parse_json(raw: Any) -> JsonValue:
    """安全解析 JSON（对象 / 数组直通；字符串尝试解析；其余 → None）。"""
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return None
    return None


def collect_entity_paths(
    node: Any,
    entity_id: str,
    path: str = "",
    paths: list[str] | None = None,
    mode: str = "exact",
) -> list[str]:
    """在任意 JSON 值中收集命中路径（mode=exact|contains）。"""
    if paths is None:
        paths = []
    if node is None:
        return paths

    if isinstance(node, str):
        hit = node == entity_id or (mode == "contains" and text_contains_entity_id(node, entity_id))
        if hit:
            paths.append(path or "value")
        return paths

    if isinstance(node, list):
        for index, element in enumerate(node):
            child_path = f"{path}[{index}]" if path else f"[{index}]"
            collect_entity_paths(element, entity_id, child_path, paths, mode)
        return paths

    if isinstance(node, dict):
        for field_key, child_node in node.items():
            next_path = f"{path}.{field_key}" if path else str(field_key)
            collect_entity_paths(child_node, entity_id, next_path, paths, mode)
    return paths


def path_looks_like_trigger(path: str) -> bool:
    return _TRIGGER_PATH_PATTERN.search(path) is not None


def path_looks_like_action(path: str) -> bool:
    return _ACTION_PATH_PATTERN.search(path) is not None


#: 实体承载字段名集合：对象中出现这些 key 且值匹配 entityId 时，视为以实体为主键。
_ENTITY_FIELD_KEYS = ("entity_id", "entityId", "entityIds", "entity_ids", "id", "target")

#: 摘引用时整条删除的「主键字段」。**绝不写空串**：空串在下游会被当成通配符，
#: 曾经让「删掉前门锁之后，任意一把锁解锁都激活回家模式」。
_ENTITY_PRIMARY_KEY_FIELDS = ("entity_id", "entityId", "id")

#: 没有实体就无从求值的触发器类型（写回前必须丢掉，否则 normalize 会整批拒绝）。
_TRIGGER_TYPES_REQUIRING_ENTITY = ("lock_unlock", "state")


def _is_entity_bearing_object(node: JsonValue, entity_id: str) -> bool:
    if not isinstance(node, dict):
        return False
    for field_key in _ENTITY_FIELD_KEYS:
        field_value = node.get(field_key)
        if isinstance(field_value, str) and field_value == entity_id:
            return True
        if isinstance(field_value, list) and any(str(element) == entity_id for element in field_value):
            return True
    return False


def remove_entity_from_json_value(node: JsonValue, entity_id: str) -> tuple[JsonValue, bool]:
    """从 JSON 值中移除实体引用，返回 ``(新值, 是否变更)``。"""
    if node is None:
        return node, False

    if isinstance(node, str):
        if node == entity_id:
            return "", True
        return node, False

    if isinstance(node, list):
        changed = False
        kept: list[Any] = []
        for element in node:
            if isinstance(element, str):
                if element == entity_id:
                    changed = True
                    continue
                kept.append(element)
                continue
            if _is_entity_bearing_object(element, entity_id):
                changed = True
                continue
            cleaned_element, element_changed = remove_entity_from_json_value(element, entity_id)
            if element_changed:
                changed = True
            kept.append(cleaned_element)
        return kept, changed

    if isinstance(node, dict):
        cleaned_object: dict[str, Any] = {}
        changed = False
        for field_key, child_node in node.items():
            if (
                field_key in _ENTITY_PRIMARY_KEY_FIELDS
                and isinstance(child_node, str)
                and child_node == entity_id
            ):
                # 删 key 而不是写 ""：空串会被下游当成「任意实体」。
                changed = True
                continue
            if field_key in ("entityIds", "entity_ids") and isinstance(child_node, list):
                cleaned_ids = [element for element in child_node if str(element) != entity_id]
                if len(cleaned_ids) != len(child_node):
                    changed = True
                cleaned_object[field_key] = cleaned_ids
                continue
            cleaned_child, child_changed = remove_entity_from_json_value(child_node, entity_id)
            if child_changed:
                changed = True
            cleaned_object[field_key] = cleaned_child
        return cleaned_object, changed

    return node, False


def _as_json_list(value: Any) -> list[Any]:
    """把 JSON 列解析结果收敛成列表（脏数据 / 非数组一律当空列表）。"""
    return value if isinstance(value, list) else []


def _primary_entity_of(entry: dict[str, Any]) -> str:
    """取条目上的主键实体（``entity_id`` / ``entityId``），没有则返回空串。"""
    for field_key in ("entity_id", "entityId"):
        value = entry.get(field_key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _prune_home_mode_entries(
    entries: list[Any], entity_id: str, *, kind: str
) -> tuple[list[Any], bool]:
    """从家庭模式 ``config`` / ``triggers`` 里摘掉实体：**整条删除**，而不是把 entityId 置空。

    - 条目以该实体为主键（``entity_id`` / ``entityId``）→ 整条删除：动作没有实体无从执行，
      触发器没有实体会退化成通配符。
    - 实体只出现在 ``entityIds`` / ``entity_ids`` 列表里 → 过滤该 id，保留条目。
    - 其它嵌套引用（``data`` 里的模板等）→ 交给 :func:`remove_entity_from_json_value`。

    另外顺手清掉历史遗留的「空主键」条目（旧版本解绑把 ``entityId`` 写成 ``""``）：
    这类条目写回时会被 ``normalize_home_mode_json_array`` 整批拒绝，留着只会让下一次
    保存失败。返回 ``(清理后的条目, 是否变更)``。
    """
    kept: list[Any] = []
    changed = False
    for entry in entries:
        if not isinstance(entry, dict):
            kept.append(entry)
            continue
        primary_entity = _primary_entity_of(entry)
        if primary_entity and primary_entity == entity_id:
            changed = True
            continue
        if not primary_entity and kind == "config":
            # 动作条目必须有 entity_id（normalize 要求），空主键是解绑残留。
            continue
        if not primary_entity and kind == "triggers" and entry.get("type") in _TRIGGER_TYPES_REQUIRING_ENTITY:
            continue
        cleaned, entry_changed = remove_entity_from_json_value(entry, entity_id)
        if not entry_changed:
            kept.append(entry)
            continue
        changed = True
        kept.append(cleaned if isinstance(cleaned, dict) else {})
    return kept, changed


def prune_home_mode_config(entries: list[Any], entity_id: str) -> tuple[list[Any], bool]:
    """家庭模式动作列表的实体摘除。"""
    return _prune_home_mode_entries(entries, entity_id, kind="config")


def prune_home_mode_triggers(entries: list[Any], entity_id: str) -> tuple[list[Any], bool]:
    """家庭模式触发器列表的实体摘除。"""
    return _prune_home_mode_entries(entries, entity_id, kind="triggers")


# 倒排索引（对齐 entity-references-index.ts）


def _reference_key(reference: EntityReference) -> str:
    """引用去重键：同 ``kind:id:role:detail`` 视为同一条引用。

    拼 key 的逻辑只有这一处：此前它在"插入"与"查重"里各写了一遍（`_push_reference`），
    两份一旦漂移（比如一处加字段、另一处没加）就会**静默插入重复项**。
    """
    return (
        f"{reference['kind']}:{reference['id']}:{reference['role']}"
        f":{reference.get('detail') or ''}"
    )


def _push_reference(
    mapping: dict[str, list[EntityReference]],
    seen_keys: set[str],
    entity_id: str,
    reference: EntityReference,
) -> None:
    """把引用挂到 ``entity_id`` 的桶里（去重是 **O(1)**：键算一次、集合查一次）。

    每插一条都遍历整桶并重拼 f-string 来比较，桶大时是 O(n²)。改为「算一次键 + 集合」
    后，插入与去重共用 :func:`_reference_key`。
    """
    key = f"{entity_id}\x00{_reference_key(reference)}"
    if key in seen_keys:
        return
    seen_keys.add(key)
    mapping.setdefault(entity_id, []).append(reference)


def _collect_referenced_ids(node: JsonValue, ids: set[str]) -> None:
    """递归收集 JSON 里所有形如 ``domain.object_id`` 的字符串（引用候选）。"""
    if not node:
        return
    if isinstance(node, str):
        if "." in node:
            ids.add(node)
        return
    if isinstance(node, list):
        for entry in node:
            _collect_referenced_ids(entry, ids)
        return
    if isinstance(node, dict):
        for child_node in node.values():
            _collect_referenced_ids(child_node, ids)


def _home_mode_reference_role(
    config_obj: Any, trigger_obj: Any, referenced_entity_id: str
) -> str:
    """判定家庭模式里一条引用扮演的角色（trigger / action / config / reference）。"""
    config_paths = collect_entity_paths(config_obj, referenced_entity_id)
    trigger_paths = collect_entity_paths(trigger_obj, referenced_entity_id)
    if trigger_paths or path_looks_like_trigger(trigger_paths[0] if trigger_paths else ""):
        return "trigger"
    if config_paths and path_looks_like_action(config_paths[0]):
        return "action"
    if config_paths:
        return "config"
    return "reference"


def _index_alert_rules(
    mapping: dict[str, list[EntityReference]],
    seen_keys: set[str],
    alert_rows: list[dict[str, Any]],
) -> None:
    for alert_row in alert_rows:
        watched_entity_id = str(alert_row.get("entityId") or "").strip()
        if "." not in watched_entity_id:
            continue
        _push_reference(
            mapping,
            seen_keys,
            watched_entity_id,
            {
                "kind": "alert_rule",
                "id": alert_row["id"],
                "name": alert_row.get("name") or "未命名告警",
                "role": "watch",
                "enabled": bool(alert_row.get("enabled")),
                "path": "/settings?tab=alerts",
            },
        )


def _index_home_modes(
    mapping: dict[str, list[EntityReference]],
    seen_keys: set[str],
    home_mode_rows: list[dict[str, Any]],
) -> None:
    for home_mode_row in home_mode_rows:
        config_obj = safe_parse_json(home_mode_row.get("config"))
        trigger_obj = safe_parse_json(home_mode_row.get("triggers"))
        walk_ids: set[str] = set()
        _collect_referenced_ids(config_obj, walk_ids)
        _collect_referenced_ids(trigger_obj, walk_ids)
        for referenced_entity_id in walk_ids:
            if "." not in referenced_entity_id:
                continue
            _push_reference(
                mapping,
                seen_keys,
                referenced_entity_id,
                {
                    "kind": "home_mode",
                    "id": home_mode_row["id"],
                    "name": home_mode_row.get("name") or "家庭模式",
                    "role": _home_mode_reference_role(config_obj, trigger_obj, referenced_entity_id),
                    "path": f"/settings?tab=home-mode&id={home_mode_row['id']}",
                },
            )


def build_entity_references_inverted_index(
    session_factory: Callable[[], AbstractContextManager[Any]],
) -> dict[str, list[EntityReference]]:
    """一次扫描本地资源（告警规则 / 家庭模式），构建 entityId → references 倒排索引。

    这两张表**不能**加 ``limit``：倒排索引是「删除实体前清引用」的唯一依据，截断意味着
    超出的告警规则 / 家庭模式里的引用根本不会被发现 —— 删除实体后留下悬挂引用，而且
    没有任何提示。配置表规模由用户配置决定（几十~几百行），全量扫描的代价可以忽略。
    """
    from ...platform.core.models import AlertRule, HomeMode

    with session_factory() as session:
        alerts = session.query(AlertRule).all()
        home_modes = session.query(HomeMode).all()

    logger.debug(
        "实体引用倒排索引：告警规则 %d 条、家庭模式 %d 条（全量，不截断）",
        len(alerts),
        len(home_modes),
    )

    alert_rows = [
        {
            "id": alert_rule.id,
            "name": alert_rule.name,
            "entityId": alert_rule.entity_id,
            "enabled": alert_rule.enabled,
        }
        for alert_rule in alerts
    ]
    home_mode_rows = [
        {
            "id": home_mode.id,
            "name": home_mode.name,
            "config": home_mode.config,
            "triggers": home_mode.triggers,
        }
        for home_mode in home_modes
    ]

    mapping: dict[str, list[EntityReference]] = {}
    seen_keys: set[str] = set()
    _index_alert_rules(mapping, seen_keys, alert_rows)
    _index_home_modes(mapping, seen_keys, home_mode_rows)
    return mapping


# 布局 / 系统配置扫描（对齐 entity-references-scanners.helper.ts）
def _push(items: list[EntityReference], reference: EntityReference, seen: set[str]) -> None:
    """按 ``kind:id:role:detail`` 去重后追加（与倒排索引共用同一份去重口径）。"""
    key = _reference_key(reference)
    if key in seen:
        return
    seen.add(key)
    items.append(reference)


def _reference_paths(node: JsonValue, entity_id: str) -> list[str]:
    """节点里该实体的命中路径；空列表 = 未引用。

    扫描器几乎每个落点都要写「取路径 → 空则跳过」。把它收成一行，既少了样板，
    也避免每个 `_scan_*` 复制同一段骨架（重复块棘轮会把这些骨架算成复制粘贴）。

    注意**不要**在这里过滤类型：布局里的"单字段引用"可以是数组
    （``awaySimulationLightPool`` / ``statsSensors`` / ``mobileRoomStats``），
    按 dict 过滤会静默漏掉它们 —— 这正是 ``_entity_references_parity_smoke`` 守的坑。
    """
    return collect_entity_paths(node, entity_id)


def scan_layout_and_system(deps: EntityReferencesDeps, entity_id: str, items: list[EntityReference]) -> None:
    """扫描布局配置（projectConfig.layout）与系统配置（app_config）中的实体引用。"""
    seen = {_reference_key(reference) for reference in items}
    try:
        layout = deps["load_layout"]()
        if isinstance(layout, dict) and layout:
            _scan_layout_object(entity_id, layout, items, seen)
    except Exception as exc:
        logger.warning("扫描布局引用失败: %s", exc)

    try:
        _scan_system_config(deps, entity_id, items, seen)
    except Exception as exc:
        logger.warning("扫描系统配置引用失败: %s", exc)


def _scan_layout_favorites(
    entity_id: str, layout: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    favorites = layout.get("favoriteEntities")
    if not isinstance(favorites, dict):
        return
    for favorite_domain, favorite_ids in favorites.items():
        if isinstance(favorite_ids, list) and any(
            str(referenced_id) == entity_id for referenced_id in favorite_ids
        ):
            _push(
                items,
                {
                    "kind": "favorite",
                    "id": f"favorite:{favorite_domain}",
                    "name": f"收藏 · {favorite_domain}",
                    "role": "favorite",
                    "path": "/settings?tab=favorites",
                },
                seen,
            )


def _scan_layout_panel_widgets(
    entity_id: str, layout: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    right_panel = layout.get("rightPanelWidgets")
    floating = layout.get("floatingWidgets")
    panel_widgets = [
        *(right_panel if isinstance(right_panel, list) else []),
        *(floating if isinstance(floating, list) else []),
    ]
    for index, widget in enumerate(panel_widgets):
        if not isinstance(widget, dict):
            continue
        paths = collect_entity_paths(widget, entity_id)
        if not paths:
            continue
        widget_type = str(widget.get("type") or "widget")
        widget_config_raw = widget.get("config")
        widget_config = widget_config_raw if isinstance(widget_config_raw, dict) else {}
        config_title = str(widget_config.get("title") or "")
        _push(
            items,
            {
                "kind": "widget",
                "id": str(widget.get("id") or f"widget:{index}"),
                "name": config_title or widget_type,
                "role": "display",
                "detail": paths[0],
                "path": "/settings?tab=widgets",
            },
            seen,
        )


# 布局里"字段命中即产出一条固定引用"的落点：(layoutKey, kind, 引用 id, 名称, role, 跳转)
# 页脚 / 全屋关闭与「紧急配置 / 离家模拟灯池 / 统计传感器 / 移动端房间统计」是同一件事，
# 合并成一张表 + 一个循环，避免两处各写一遍相同的取路径/判空/组装引用骨架。
_LAYOUT_FIELD_REFERENCES = (
    ("securityEmergency", "security_mode", "securityEmergency", "紧急配置", "config",
     "/settings?tab=security-modes"),
    ("awaySimulationLightPool", "binding", "awaySimulationLightPool", "离家模拟灯池", "config",
     "/settings?tab=params"),
    ("statsSensors", "binding", "statsSensors", "统计传感器", "config", "/settings?tab=bindings"),
    ("mobileRoomStats", "binding", "mobileRoomStats", "移动端房间统计", "config",
     "/settings?tab=rooms"),
    ("dashboardFooter", "footer", "dashboard-footer", "仪表盘页脚", "display",
     "/settings?tab=general&section=footer"),
    ("wholeHomeOff", "whole_home_off", "whole-home-off", "全屋关闭", "config",
     "/settings?tab=general"),
)
# kind=binding 的移除要区分"单字段引用"与其余 haConfig 兜底，两者共用同一份键集合。
_LAYOUT_SIMPLE_BINDINGS_KEYS = frozenset(
    field_key for field_key, _kind, _ref_id, _name, _role, _path in _LAYOUT_FIELD_REFERENCES
    if field_key != "securityEmergency"
)


def _scan_layout_field_references(
    entity_id: str, layout: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    """布局里"字段命中即产出一条固定引用"的落点（页脚 / 全屋关闭 / 单字段绑定）。"""
    for layout_key, kind, reference_id, display_name, role, settings_path in _LAYOUT_FIELD_REFERENCES:
        paths = _reference_paths(layout.get(layout_key), entity_id)
        if not paths:
            continue
        _push(
            items,
            {
                "kind": kind,
                "id": reference_id,
                "name": display_name,
                "role": role,
                "detail": paths[0],
                "path": settings_path,
            },
            seen,
        )


def _scan_layout_security_modes(
    entity_id: str, layout: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    raw_modes = layout.get("securityModes")
    security_modes = raw_modes if isinstance(raw_modes, list) else []
    for index, mode in enumerate(security_modes):
        if not isinstance(mode, dict):
            continue
        paths = collect_entity_paths(mode, entity_id)
        if not paths:
            continue
        _push(
            items,
            {
                "kind": "security_mode",
                "id": str(mode.get("key") or f"security-mode:{index}"),
                "name": str(mode.get("name") or mode.get("key") or "安防模式"),
                "role": "action" if path_looks_like_action(paths[0]) else "config",
                "detail": paths[0],
                "path": "/settings?tab=security-modes",
            },
            seen,
        )


# 布局里的"单字段引用"：紧急配置 / 离家模拟灯池 / 统计传感器 / 移动端房间统计
# （页脚与全屋关闭同属这张表，见 _LAYOUT_FIELD_REFERENCES）

def _scan_layout_security_zones(
    entity_id: str,
    layout: dict[str, Any],
    ha_config: dict[str, Any],
    items: list[EntityReference],
    seen: set[str],
) -> None:
    """安防区域：layout.securityZones 与 haConfig.zones 双源。"""
    raw_layout_zones = layout.get("securityZones")
    raw_ha_zones = ha_config.get("zones")
    layout_zones = raw_layout_zones if isinstance(raw_layout_zones, list) else []
    ha_zones = raw_ha_zones if isinstance(raw_ha_zones, list) else []
    if layout_zones and ha_zones:
        zone_lists = [layout_zones, ha_zones]
    else:
        zone_lists = [layout_zones or ha_zones]
    for zone_list in zone_lists:
        for index, zone in enumerate(zone_list):
            if not isinstance(zone, dict):
                continue
            paths = collect_entity_paths(zone, entity_id)
            if not paths:
                continue
            _push(
                items,
                {
                    "kind": "security_zone",
                    "id": str(zone.get("id") or zone.get("name") or f"zone:{index}"),
                    "name": str(zone.get("name") or zone.get("id") or f"安防区域 {index + 1}"),
                    "role": "watch",
                    "detail": paths[0],
                    "path": "/settings?tab=bindings&section=security",
                },
                seen,
            )


def _scan_layout_object(
    entity_id: str, layout: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    """扫描 projectConfig.layout 的各个引用落点（收藏 / 组件 / 页脚 / 安防 / 绑定 / 区域）。"""
    _scan_layout_favorites(entity_id, layout, items, seen)
    _scan_layout_panel_widgets(entity_id, layout, items, seen)

    ha_config_raw = layout.get("haConfig")
    ha_config: dict[str, Any] = ha_config_raw if isinstance(ha_config_raw, dict) else {}
    _scan_ha_bindings(entity_id, ha_config, items, seen)

    _scan_layout_field_references(entity_id, layout, items, seen)
    _scan_layout_security_modes(entity_id, layout, items, seen)
    _scan_layout_security_zones(entity_id, layout, ha_config, items, seen)


#: HA 配置里「实体绑定」字段 → 展示名。同组内命中第一个字段即停止（避免同一绑定出现多条）。
_HA_BINDING_LABELS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("securityCamera", "securityCameras"), "安防摄像头"),
    (("weatherEntityId",), "天气实体"),
    (("motionSensorEntityId",), "人体传感器"),
    (("hazardSmokeEntityIds",), "烟感绑定"),
    (("hazardGasEntityIds",), "燃气绑定"),
    (("hazardLeakEntityIds",), "水浸绑定"),
    (("hazardGasValveEntityId",), "燃气阀"),
    (("hazardWaterValveEntityId",), "水阀"),
    (("hazardExhaustFanEntityIds",), "排风"),
)


def _scan_ha_bindings(
    entity_id: str, ha_config: dict[str, Any], items: list[EntityReference], seen: set[str]
) -> None:
    for field_keys, binding_label in _HA_BINDING_LABELS:
        for field_key in field_keys:
            bound_value = ha_config.get(field_key)
            paths = collect_entity_paths(bound_value, entity_id)
            if not paths and isinstance(bound_value, str) and bound_value == entity_id:
                paths.append(field_key)
            if not paths:
                continue
            _push(
                items,
                {
                    "kind": "binding",
                    "id": f"ha:{field_key}",
                    "name": binding_label,
                    "role": "binding",
                    "detail": field_key,
                    "path": "/settings?tab=bindings",
                },
                seen,
            )
            break

    doorbells_raw = ha_config.get("doorbells")
    doorbells: list[Any] = doorbells_raw if isinstance(doorbells_raw, list) else []
    for index, doorbell in enumerate(doorbells):
        paths = collect_entity_paths(doorbell, entity_id)
        if not paths:
            continue
        doorbell_obj = doorbell if isinstance(doorbell, dict) else {}
        _push(
            items,
            {
                "kind": "binding",
                "id": f"doorbell:{index}",
                "name": str(doorbell_obj.get("name") or f"门铃 {index + 1}"),
                "role": "binding",
                "detail": paths[0],
                "path": "/settings?tab=bindings",
            },
            seen,
        )


def _scan_env_sensor_map(
    app_config_raw: dict[str, Any], entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    for room_id, env_sensor_room in (app_config_raw.get("envSensorMap") or {}).items():
        paths = _reference_paths(env_sensor_room, entity_id)
        if not paths:
            continue
        room_label = env_sensor_room.get("label") or room_id
        _push(
            items,
            {
                "kind": "env_sensor",
                "id": f"env:{room_id}",
                "name": f"环境映射 · {room_label}",
                "role": "binding",
                "detail": paths[0],
                "path": "/settings?tab=bindings&section=environment",
            },
            seen,
        )


def _push_system_config(
    items: list[EntityReference],
    seen: set[str],
    reference_id: str,
    display_name: str,
    role: str,
    settings_path: str,
) -> None:
    """app_config 侧引用的统一组装（kind 固定 ``system_config``）。

    app_config 有 5 个落点都产出 ``system_config`` 引用，只有 id/名称/role/跳转递进不同；
    把这段 8 行字典收到这里，各落点只剩"什么条件下算命中"。
    """
    _push(
        items,
        {
            "kind": "system_config",
            "id": reference_id,
            "name": display_name,
            "role": role,
            "path": settings_path,
        },
        seen,
    )


def _scan_presence_persons(
    app_config_raw: dict[str, Any], entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    security = _app_config_section(app_config_raw, "security")
    for person in security.get("presencePersons") or []:
        if not isinstance(person, dict) or entity_id not in (person.get("entityIds") or []):
            continue
        _push_system_config(
            items,
            seen,
            f"presence:{person.get('id')}",
            f"在家判定 · {person.get('name') or person.get('id')}",
            "watch",
            "/settings?tab=bindings&section=security",
        )


def _app_config_section(app_config_raw: dict[str, Any], section_key: str) -> dict[str, Any]:
    """取 app_config 的一个对象段落（缺失或类型不对时给空 dict）。

    实现落在 :func:`platform.core.json_field.object_field`：同一语义在全仓出现过二十余次
    （``x.get(K) if isinstance(x.get(K), dict) else {}``），收敛到一处后，字段名写错或类型判断
    漏写只会有一种后果。
    """
    return object_field(app_config_raw, section_key)


# app_config 里的"单字段绑定"：(section, 字段, 引用 id, 名称, 跳转)。
# 扫描与解绑**共用**这张表：两边的字段名一旦漂移，就会出现「界面提示已解绑、实际没清」。
_APP_CONFIG_FIELD_BINDINGS = (
    ("circadian", "weatherEntityId", "circadian-weather", "昼夜节律 · 天气", "/settings?tab=bindings"),
    ("water", "mainValveEntityId", "water-main-valve", "用水 · 总阀", "/settings?tab=bindings"),
    ("energy", "meterEntityId", "energy-meter", "能源 · 主电表", "/settings?tab=bindings"),
    ("voice", "sttEntityId", "voice-stt", "语音 · STT", "/settings?tab=voice"),
)
# 能源分路是数组字段（同 section，但命中判定不是"字段值等于实体"）。
_ENERGY_CIRCUIT_FIELD = ("energy", "circuitEntityIds")


def _scan_app_config_bindings(
    app_config_raw: dict[str, Any], entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    """昼夜节律 / 用水 / 能源 / 语音这几个"单字段绑定"是否指向该实体。"""
    for section_key, field_key, binding_id, display_name, settings_path in _APP_CONFIG_FIELD_BINDINGS:
        if _app_config_section(app_config_raw, section_key).get(field_key) != entity_id:
            continue
        _push_system_config(items, seen, binding_id, display_name, "binding", settings_path)

    circuit_section, circuit_field = _ENERGY_CIRCUIT_FIELD
    if entity_id in (_app_config_section(app_config_raw, circuit_section).get(circuit_field) or []):
        _push_system_config(
            items, seen, "energy-circuit", "能源 · 分路", "binding", "/settings?tab=bindings"
        )


def _scan_voice_and_client_power(
    app_config_raw: dict[str, Any], entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    voice = _app_config_section(app_config_raw, "voice")
    for tts_alert_rule in voice.get("entityTtsAlerts") or []:
        if not isinstance(tts_alert_rule, dict) or tts_alert_rule.get("entityId") != entity_id:
            continue
        _push_system_config(
            items,
            seen,
            f"tts-alert:{tts_alert_rule.get('entityId')}",
            "语音 · 实体播报",
            "watch",
            "/settings?tab=voice",
        )

    client_power = _app_config_section(app_config_raw, "clientPower")
    for client_profile in client_power.get("clients") or []:
        if not isinstance(client_profile, dict) or client_profile.get("chargerSwitchEntityId") != entity_id:
            continue
        _push_system_config(
            items,
            seen,
            f"client-power:{client_profile.get('id')}",
            f"客户端电源 · {client_profile.get('label') or client_profile.get('id')}",
            "binding",
            "/settings?tab=smart-charge",
        )


def _scan_media_and_log_block(
    app_config_raw: dict[str, Any], entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    """影音播放列表键名即实体 ID；事件日志屏蔽是 entity_ids 数组。"""
    media_playlists = app_config_raw.get("mediaPlaylists")
    if isinstance(media_playlists, dict) and entity_id in media_playlists:
        _push(
            items,
            {
                "kind": "media",
                "id": f"playlist:{entity_id}",
                "name": "影音播放列表",
                "role": "config",
                "path": "/settings?tab=widgets",
            },
            seen,
        )

    ops_config = _app_config_section(app_config_raw, "ops")
    blocked_entity_ids = ops_config.get("eventLogRecordBlockEntityIds")
    if isinstance(blocked_entity_ids, list) and entity_id in blocked_entity_ids:
        _push_system_config(
            items, seen, "event-log-block", "事件日志屏蔽", "config", "/settings?tab=connection"
        )


def _scan_system_config(
    deps: EntityReferencesDeps, entity_id: str, items: list[EntityReference], seen: set[str]
) -> None:
    """扫描 app_config 中的实体引用（环境映射 / 在家判定 / 绑定 / 播报 / 影音 / 日志屏蔽）。"""
    app_config_raw = deps["app_config"].get_all_raw() or {}
    _scan_env_sensor_map(app_config_raw, entity_id, items, seen)
    _scan_presence_persons(app_config_raw, entity_id, items, seen)
    _scan_app_config_bindings(app_config_raw, entity_id, items, seen)
    _scan_voice_and_client_power(app_config_raw, entity_id, items, seen)
    _scan_media_and_log_block(app_config_raw, entity_id, items, seen)


# 解绑执行器（对齐 entity-references-unlink.ts）
def _fail(message: str) -> UnlinkResult:
    return {"ok": False, "message": message}


def _ok(action: str, message: str | None = None, layout_touched: bool = False) -> UnlinkResult:
    result: UnlinkResult = {"ok": True, "action": action, "layoutTouched": layout_touched}
    if message is not None:
        result["message"] = message
    return result


def _unlink_home_mode(deps: EntityReferencesDeps, mode_id: str, entity_id: str) -> UnlinkResult:
    from ...platform.core.models import HomeMode

    with deps["session_factory"]() as session:
        stored_mode = session.get(HomeMode, mode_id)
        if stored_mode is None:
            return _fail("家庭模式不存在")
        config_parsed = _as_json_list(safe_parse_json(stored_mode.config))
        triggers_parsed = _as_json_list(safe_parse_json(stored_mode.triggers))
    config_next, config_changed = prune_home_mode_config(config_parsed, entity_id)
    triggers_next, triggers_changed = prune_home_mode_triggers(triggers_parsed, entity_id)
    if not config_changed and not triggers_changed:
        return _fail("家庭模式中未找到该实体")

    # 走服务层写库：那边会跑 normalize 校验并刷新触发器绑定。这里处于 executor 线程，
    # 所以注入的是**同步**版本（`update_sync`）；刷新绑定由调用方在事件循环里补。
    update_home_mode = deps.get("update_home_mode")
    if update_home_mode is not None:
        try:
            outcome = update_home_mode(mode_id, {"config": config_next, "triggers": triggers_next})
            if inspect.isawaitable(outcome):
                # 兜底：即便构造点没拦住（比如传了 functools.partial(update)），
                # 也不能让协程无声消失 —— 关掉它并明确报错。
                close = getattr(outcome, "close", None)
                if callable(close):
                    close()
                raise TypeError('update_home_mode 返回了 awaitable，解绑要求同步写库回调')
        except Exception as exc:
            logger.warning("家庭模式解绑写库失败 mode=%s entity=%s: %s", mode_id, entity_id, exc)
            return _fail("更新家庭模式失败")
        return _ok("filtered", "已从家庭模式动作/触发中移除")

    with deps["session_factory"]() as session:
        stored_mode = session.get(HomeMode, mode_id)
        if stored_mode is not None:
            stored_mode.config = json.dumps(config_next, ensure_ascii=False)
            stored_mode.triggers = json.dumps(triggers_next, ensure_ascii=False)
            session.commit()
    return _ok("filtered", "已从家庭模式动作/触发中移除")


def _unlink_alert_rule(deps: EntityReferencesDeps, rule_id: str) -> UnlinkResult:
    from ...platform.core.models import AlertRule

    delete_alert_rule = deps.get("delete_alert_rule")
    if delete_alert_rule is not None:
        delete_result = delete_alert_rule(rule_id)
        if not (isinstance(delete_result, dict) and delete_result.get("success")):
            return _fail("删除告警规则失败")
        return _ok("deleted_rule", "已删除告警规则")

    try:
        with deps["session_factory"]() as session:
            stored_rule = session.get(AlertRule, rule_id)
            if stored_rule is None:
                return _fail("告警规则不存在或删除失败")
            session.delete(stored_rule)
            session.commit()
    except Exception:
        return _fail("告警规则不存在或删除失败")

    watch_index = deps.get("alert_rule_watch_index")
    if watch_index is not None:
        # 实体关注索引是全量的：加 limit 会让超出的规则被静默漏掉，告警触发因此丢事件。
        with deps["session_factory"]() as session:
            remaining_rules = session.query(AlertRule).filter(AlertRule.enabled.is_(True)).all()
        watch_index.update_from_rules(
            [{"entityId": rule.entity_id, "enabled": rule.enabled} for rule in remaining_rules]
        )
    return _ok("deleted_rule", "已删除告警规则")


def _unlink_favorite(deps: EntityReferencesDeps, item_id: str, entity_id: str) -> UnlinkResult:
    layout = dict(deps["load_layout"]())
    favorites = layout.get("favoriteEntities")
    favorites = dict(favorites) if isinstance(favorites, dict) else {}
    favorite_domain = item_id[len("favorite:") :] if item_id.startswith("favorite:") else ""
    changed = False
    if favorite_domain and isinstance(favorites.get(favorite_domain), list):
        current_ids = favorites[favorite_domain]
        kept_ids = [referenced_id for referenced_id in current_ids if str(referenced_id) != entity_id]
        if len(kept_ids) != len(current_ids):
            favorites[favorite_domain] = kept_ids
            changed = True
    else:
        for domain, favorite_ids in list(favorites.items()):
            if not isinstance(favorite_ids, list):
                continue
            kept_ids = [referenced_id for referenced_id in favorite_ids if str(referenced_id) != entity_id]
            if len(kept_ids) != len(favorite_ids):
                favorites[domain] = kept_ids
                changed = True
    if not changed:
        return _fail("收藏中未找到该实体")
    layout["favoriteEntities"] = favorites
    deps["save_layout"](layout)
    return _ok("filtered", "已从收藏移除", True)


_WIDGET_INDEX_PATTERN = re.compile(r"widget:(\d+)")


def _strip_targeted_widgets(
    source: list[Any],
    start_index: int,
    item_id: str,
    entity_id: str,
    index_match: re.Match[str] | None,
) -> tuple[list[Any], bool, int]:
    """删除命中 ``item_id`` 的组件（按下标或按 ``id``），返回 ``(保留列表, 是否变更, 下一个累计下标)``。

    ``start_index`` 是跨两个列表（rightPanelWidgets → floatingWidgets）累计的下标，
    由调用方显式传入 / 传出，避免依赖闭包里的 ``nonlocal``。
    """
    kept_widgets: list[Any] = []
    changed = False
    next_index = start_index
    for widget in source:
        current_index = next_index
        next_index += 1
        if not isinstance(widget, dict):
            kept_widgets.append(widget)
            continue
        widget_key = str(widget.get("id") or f"widget:{current_index}")
        targeted = widget_key == item_id or (
            index_match is not None and current_index == int(index_match.group(1))
        )
        if not targeted:
            kept_widgets.append(widget)
            continue
        if str(widget.get("id") or "") == entity_id:
            changed = True
            continue
        cleaned_node, node_changed = remove_entity_from_json_value(widget, entity_id)
        if not node_changed:
            kept_widgets.append(widget)
            continue
        changed = True
        kept_widgets.append(cleaned_node)
    return kept_widgets, changed, next_index


def _unlink_layout_widgets(layout: dict[str, Any], item_id: str, entity_id: str) -> bool:
    index_match = _WIDGET_INDEX_PATTERN.fullmatch(item_id)
    changed = False
    next_index = 0
    for layout_key in ("rightPanelWidgets", "floatingWidgets"):
        source = layout.get(layout_key)
        if not isinstance(source, list):
            continue
        kept_widgets, list_changed, next_index = _strip_targeted_widgets(
            list(source), next_index, item_id, entity_id, index_match
        )
        layout[layout_key] = kept_widgets
        changed = changed or list_changed
    return changed


def _unlink_layout_binding(layout: dict[str, Any], item_id: str, entity_id: str) -> bool:
    """HA 绑定：``ha:<字段>`` / ``doorbell:<下标>`` / 单字段引用，其余整块 haConfig 兜底。"""
    ha_config_raw = layout.get("haConfig")
    ha_config = dict(ha_config_raw) if isinstance(ha_config_raw, dict) else {}
    changed = False
    if item_id.startswith("ha:"):
        ha_field_key = item_id[3:]
        if ha_field_key in ha_config:
            cleaned_node, node_changed = remove_entity_from_json_value(
                ha_config[ha_field_key], entity_id
            )
            if node_changed:
                ha_config[ha_field_key] = cleaned_node
                changed = True
    elif item_id.startswith("doorbell:"):
        doorbell_index_raw = item_id[len("doorbell:") :]
        doorbells_raw = ha_config.get("doorbells")
        doorbells: list[Any] = list(doorbells_raw) if isinstance(doorbells_raw, list) else []
        if doorbell_index_raw.isdigit() and 0 <= int(doorbell_index_raw) < len(doorbells):
            doorbell_index = int(doorbell_index_raw)
            cleaned_node, node_changed = remove_entity_from_json_value(
                doorbells[doorbell_index], entity_id
            )
            if node_changed:
                doorbells[doorbell_index] = cleaned_node
                ha_config["doorbells"] = doorbells
                changed = True
    elif item_id in _LAYOUT_SIMPLE_BINDINGS_KEYS:
        cleaned_node, node_changed = remove_entity_from_json_value(layout.get(item_id), entity_id)
        if node_changed:
            layout[item_id] = cleaned_node
            changed = True
    else:
        cleaned_node, node_changed = remove_entity_from_json_value(ha_config, entity_id)
        if node_changed and isinstance(cleaned_node, dict):
            ha_config = cleaned_node
            changed = True
    layout["haConfig"] = ha_config
    return changed


def _unlink_layout_single_field(layout: dict[str, Any], layout_key: str, entity_id: str) -> bool:
    """移除单字段引用里的实体（页脚 / 全屋关闭）。"""
    if not layout.get(layout_key):
        return False
    cleaned_node, node_changed = remove_entity_from_json_value(layout[layout_key], entity_id)
    if not node_changed:
        return False
    layout[layout_key] = cleaned_node
    return True


def _unlink_layout_security_mode(layout: dict[str, Any], item_id: str, entity_id: str) -> bool:
    if item_id == "securityEmergency":
        return _unlink_layout_single_field(layout, "securityEmergency", entity_id)

    raw_modes = layout.get("securityModes")
    modes = list(raw_modes) if isinstance(raw_modes, list) else []
    changed = False
    next_modes: list[Any] = []
    for mode in modes:
        if not isinstance(mode, dict) or str(mode.get("key") or "") != item_id:
            next_modes.append(mode)
            continue
        cleaned_node, node_changed = remove_entity_from_json_value(mode, entity_id)
        if node_changed:
            changed = True
            next_modes.append(cleaned_node)
        else:
            next_modes.append(mode)
    layout["securityModes"] = next_modes
    return changed


def _unlink_zone_list(zone_list: list[Any], item_id: str, entity_id: str) -> tuple[list[Any], bool]:
    kept_zones: list[Any] = []
    touched = False
    for zone_index, zone in enumerate(zone_list):
        if not isinstance(zone, dict):
            kept_zones.append(zone)
            continue
        zone_key = str(zone.get("id") or zone.get("name") or f"zone:{zone_index}")
        if zone_key != item_id:
            kept_zones.append(zone)
            continue
        cleaned_node, node_changed = remove_entity_from_json_value(zone, entity_id)
        if node_changed:
            touched = True
            kept_zones.append(cleaned_node)
        else:
            kept_zones.append(zone)
    return kept_zones, touched


def _unlink_layout_security_zone(layout: dict[str, Any], item_id: str, entity_id: str) -> bool:
    """安防区域双源：layout.securityZones 与 haConfig.zones 都要清。"""
    ha_config_raw = layout.get("haConfig")
    ha_config = dict(ha_config_raw) if isinstance(ha_config_raw, dict) else {}
    changed = False
    if isinstance(layout.get("securityZones"), list):
        cleaned_zones, touched = _unlink_zone_list(list(layout["securityZones"]), item_id, entity_id)
        layout["securityZones"] = cleaned_zones
        changed = changed or touched
    if isinstance(ha_config.get("zones"), list):
        cleaned_zones, touched = _unlink_zone_list(list(ha_config["zones"]), item_id, entity_id)
        ha_config["zones"] = cleaned_zones
        layout["haConfig"] = ha_config
        changed = changed or touched
    return changed


def _layout_field_unlinker(layout_key: str) -> Callable[[dict[str, Any], str, str], bool]:
    """把"解绑单个布局字段"适配成统一的 ``(layout, item_id, entity_id) -> changed`` 形态。"""
    return lambda layout, _item_id, entity_id: _unlink_layout_single_field(layout, layout_key, entity_id)


# kind → 布局解绑器。表驱动取代 6 段形状相同的 ``elif kind == ...``（那种写法也正好是
# 重复块棘轮最容易涨的地方）。
_LAYOUT_UNLINK_HANDLERS: dict[str, Callable[[dict[str, Any], str, str], bool]] = {
    "widget": _unlink_layout_widgets,
    "binding": _unlink_layout_binding,
    "footer": _layout_field_unlinker("dashboardFooter"),
    "whole_home_off": _layout_field_unlinker("wholeHomeOff"),
    "security_mode": _unlink_layout_security_mode,
    "security_zone": _unlink_layout_security_zone,
}


def _unlink_layout_json_field(
    deps: EntityReferencesDeps, kind: str, item_id: str, entity_id: str
) -> UnlinkResult:
    layout = dict(deps["load_layout"]())
    handler = _LAYOUT_UNLINK_HANDLERS.get(kind)
    # 调用方按 kind 分发，理论到不了这里。
    changed = handler(layout, item_id, entity_id) if handler is not None else False
    if not changed:
        return _fail("未找到可移除的布局引用")
    deps["save_layout"](layout)
    action = "deleted_widget" if kind == "widget" else "cleared"
    return _ok(action, "已从布局配置移除", True)


class _UnsupportedReferenceError(Exception):
    """解绑时遇到当前不支持的引用类型 / 找不到目标（消息直接回给前端）。"""


# system_config 的"单字段绑定"移除：命中即把该字段清空。
# 与**扫描**共用 `_APP_CONFIG_FIELD_BINDINGS`（同一份 section/字段名，两边不会漂移）。
_SYSTEM_CONFIG_CLEAR_FIELDS: dict[str, tuple[str, str]] = {
    binding_id: (section_key, field_key)
    for section_key, field_key, binding_id, _name, _path in _APP_CONFIG_FIELD_BINDINGS
}
# system_config 的"数组绑定"移除：命中即从数组里剔除该实体。
_SYSTEM_CONFIG_CLEAR_LISTS: dict[str, tuple[str, str]] = {
    "energy-circuit": ("energy", "circuitEntityIds"),
    "event-log-block": ("ops", "eventLogRecordBlockEntityIds"),
}


def _patch_env_sensor(app_config_raw: dict[str, Any], item_id: str, entity_id: str) -> dict[str, Any]:
    room_id = item_id[len("env:") :]
    env_sensor_room = dict((app_config_raw.get("envSensorMap") or {}).get(room_id) or {})
    cleaned_node, node_changed = remove_entity_from_json_value(env_sensor_room, entity_id)
    if not node_changed:
        raise _UnsupportedReferenceError("环境映射中未找到该实体")
    return {"envSensorMap": {**(app_config_raw.get("envSensorMap") or {}), room_id: cleaned_node}}


def _patch_media_playlist(app_config_raw: dict[str, Any], entity_id: str) -> dict[str, Any]:
    playlists = dict(app_config_raw.get("mediaPlaylists") or {})
    if entity_id not in playlists:
        raise _UnsupportedReferenceError("未找到影音播放列表")
    playlists.pop(entity_id, None)
    return {"mediaPlaylists": playlists}


def _patch_clear_field(
    app_config_raw: dict[str, Any], targets: dict[str, tuple[str, str]], item_id: str
) -> dict[str, Any]:
    section_key, field_key = targets[item_id]
    section = dict(app_config_raw.get(section_key) or {})
    section[field_key] = ""
    return {section_key: section}


def _patch_clear_list_field(
    app_config_raw: dict[str, Any],
    targets: dict[str, tuple[str, str]],
    item_id: str,
    entity_id: str,
) -> dict[str, Any]:
    section_key, list_key = targets[item_id]
    section = dict(app_config_raw.get(section_key) or {})
    section[list_key] = [
        referenced_id
        for referenced_id in (section.get(list_key) or [])
        if referenced_id != entity_id
    ]
    return {section_key: section}


def _patch_presence_person(
    app_config_raw: dict[str, Any], item_id: str, entity_id: str
) -> dict[str, Any]:
    person_id = item_id[len("presence:") :]
    security = dict(app_config_raw.get("security") or {})
    persons = [
        (
            {
                **person,
                "entityIds": [
                    referenced_id
                    for referenced_id in (person.get("entityIds") or [])
                    if referenced_id != entity_id
                ],
            }
            if person.get("id") == person_id
            else person
        )
        for person in (security.get("presencePersons") or [])
    ]
    return {"security": {**security, "presencePersons": persons}}


def _patch_tts_alert(app_config_raw: dict[str, Any], entity_id: str) -> dict[str, Any]:
    voice = dict(app_config_raw.get("voice") or {})
    return {
        "voice": {
            **voice,
            "entityTtsAlerts": [
                tts_rule
                for tts_rule in (voice.get("entityTtsAlerts") or [])
                if tts_rule.get("entityId") != entity_id
            ],
        }
    }


def _patch_client_power(
    app_config_raw: dict[str, Any], item_id: str, entity_id: str
) -> dict[str, Any]:
    client_id = item_id[len("client-power:") :]
    client_power = dict(app_config_raw.get("clientPower") or {})
    return {
        "clientPower": {
            **client_power,
            "clients": [
                {**profile, "chargerSwitchEntityId": ""} if profile.get("id") == client_id else profile
                for profile in (client_power.get("clients") or [])
            ],
        }
    }


# item_id 前缀 → 去除器（比"一长串 elif"更好扫读，也让每个分支能单独测）。
_SYSTEM_CONFIG_PREFIX_HANDLERS: tuple[
    tuple[str, Callable[[dict[str, Any], str, str], dict[str, Any]]], ...
] = (
    ("presence:", _patch_presence_person),
    ("tts-alert:", lambda config_raw, _item_id, entity_id: _patch_tts_alert(config_raw, entity_id)),
    ("client-power:", _patch_client_power),
)


def _build_system_config_patch(
    app_config_raw: dict[str, Any], kind: str, item_id: str, entity_id: str
) -> dict[str, Any]:
    """算出移除某条系统配置引用所需的 app_config 补丁；不支持的类型抛异常。"""
    if kind == "env_sensor":
        return _patch_env_sensor(app_config_raw, item_id, entity_id)
    if kind == "media":
        return _patch_media_playlist(app_config_raw, entity_id)
    if kind != "system_config":
        raise _UnsupportedReferenceError("暂不支持移除此引用类型")

    for prefix, handler in _SYSTEM_CONFIG_PREFIX_HANDLERS:
        if item_id.startswith(prefix):
            return handler(app_config_raw, item_id, entity_id)
    if item_id in _SYSTEM_CONFIG_CLEAR_FIELDS:
        return _patch_clear_field(app_config_raw, _SYSTEM_CONFIG_CLEAR_FIELDS, item_id)
    if item_id in _SYSTEM_CONFIG_CLEAR_LISTS:
        return _patch_clear_list_field(app_config_raw, _SYSTEM_CONFIG_CLEAR_LISTS, item_id, entity_id)
    raise _UnsupportedReferenceError("暂不支持移除此系统配置项")


def _unlink_system_config(
    deps: EntityReferencesDeps, kind: str, item_id: str, entity_id: str
) -> UnlinkResult:
    app_config_raw = deps["app_config"].get_all_raw() or {}
    try:
        patch = _build_system_config_patch(app_config_raw, kind, item_id, entity_id)
    except _UnsupportedReferenceError as exc:
        return _fail(str(exc))
    deps["app_config"].update(patch)
    return _ok("cleared", "已从系统配置移除")


def unlink_entity_reference(
    deps: EntityReferencesDeps, entity_id: str, req: dict[str, Any]
) -> UnlinkResult:
    """执行单条引用移除，按 kind 分发。"""
    item_id = str(req.get("id") or "").strip()
    kind = req.get("kind")
    if "." not in entity_id or not item_id or not kind:
        return _fail("参数无效")

    if kind == "home_mode":
        return _unlink_home_mode(deps, item_id, entity_id)
    if kind == "alert_rule":
        return _unlink_alert_rule(deps, item_id)
    if kind == "favorite":
        return _unlink_favorite(deps, item_id, entity_id)
    if kind in ("widget", "binding", "footer", "whole_home_off", "security_mode", "security_zone"):
        return _unlink_layout_json_field(deps, kind, item_id, entity_id)
    if kind in ("env_sensor", "system_config", "media"):
        return _unlink_system_config(deps, kind, item_id, entity_id)
    return _fail("暂不支持移除此引用类型")


class EntityReferencesService:
    """实体反向引用服务（倒排索引 + 60s TTL 缓存）。"""

    REF_CACHE_TTL_MS = 60_000
    INDEX_TTL_MS = 60_000
    #: 引用结果缓存条目上限。缓存按实体 id 无界增长，实体多/扫描页面多时是常驻泄漏；
    #: 超限按 LRU 淘汰最久未用的条目（60s TTL 内语义不变）。
    REF_CACHE_MAX_ENTRIES = 1024

    def __init__(
        self,
        session_factory: SessionFactory,
        app_config: AppConfigPort,
        ui_config: UiConfigPort,
        alert_rule_watch_index: AlertRuleWatchIndex | None = None,
        *,
        update_home_mode: Callable[[str, dict[str, Any]], object] | None = None,
        delete_alert_rule: Callable[[str], dict[str, Any] | None] | None = None,
        reload_home_mode_triggers: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        if update_home_mode is not None and inspect.iscoroutinefunction(update_home_mode):
            # 提前炸掉，而不是让每条解绑都静默丢掉一次写库（协程没人 await）。
            raise TypeError(
                'update_home_mode 必须是同步回调（EntityReferencesService 在 executor 线程调用），'
                '请注入 HomeModeService.update_sync'
            )
        self._session_factory = session_factory
        self._app_config = app_config
        self._ui_config = ui_config
        self._watch_index = alert_rule_watch_index
        self._update_home_mode = update_home_mode
        self._delete_alert_rule = delete_alert_rule
        # 解绑在 executor 线程里写库，触发器绑定必须在事件循环里刷新。
        self._reload_home_mode_triggers = reload_home_mode_triggers
        self._ref_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._inverted_index: dict[str, list[EntityReference]] | None = None
        self._inverted_index_at = 0.0

    def _deps(self) -> EntityReferencesDeps:
        return {
            "session_factory": self._session_factory,
            "app_config": self._app_config,
            "ui_config": self._ui_config,
            "alert_rule_watch_index": self._watch_index,
            "update_home_mode": self._update_home_mode,
            "delete_alert_rule": self._delete_alert_rule,
            "load_layout": self._load_layout,
            "save_layout": self._save_layout,
        }

    def _load_layout(self) -> dict[str, Any]:
        from ...platform.core.models import ProjectConfig

        with self._session_factory() as session:
            project_config_row = (
                session.query(ProjectConfig)
                .filter(ProjectConfig.project_id == "default")
                .one_or_none()
            )
            layout_raw = project_config_row.layout if project_config_row is not None else None
        layout_parsed = safe_parse_json(layout_raw)
        return layout_parsed if isinstance(layout_parsed, dict) else {}

    def _save_layout(self, layout: dict[str, Any]) -> None:
        self._ui_config.save_config("default", layout)

    async def _ensure_inverted_index(self) -> None:
        if self._inverted_index is not None and (
            time.monotonic() * 1000 - self._inverted_index_at < self.INDEX_TTL_MS
        ):
            return
        loop = asyncio.get_running_loop()
        try:
            self._inverted_index = await loop.run_in_executor(
                None, build_entity_references_inverted_index, self._session_factory
            )
        except Exception as exc:
            logger.warning("实体引用倒排索引构建失败: %s", exc)
            self._inverted_index = self._inverted_index or {}
        self._inverted_index_at = time.monotonic() * 1000

    @staticmethod
    def _to_response(entity_id: str, references: Sequence[EntityReference]) -> dict[str, Any]:
        ordered = sorted(
            references,
            key=lambda reference: (str(reference.get("kind") or ""), str(reference.get("name") or "")),
        )
        counts: dict[str, int] = {}
        for reference in ordered:
            kind_key = reference["kind"]
            counts[kind_key] = counts.get(kind_key, 0) + 1
        return {"entityId": entity_id, "total": len(ordered), "counts": counts, "items": ordered}

    async def find_references(self, entity_id: str) -> dict[str, Any]:
        ident = str(entity_id or "").strip()
        if not ident or "." not in ident:
            return {"entityId": ident, "total": 0, "counts": {}, "items": []}

        cached = self._ref_cache.get(ident)
        if cached and time.monotonic() * 1000 - cached["at"] < self.REF_CACHE_TTL_MS:
            self._ref_cache.move_to_end(ident)
            return cached["data"]

        await self._ensure_inverted_index()
        references = list((self._inverted_index or {}).get(ident, []))
        await asyncio.get_running_loop().run_in_executor(
            None, scan_layout_and_system, self._deps(), ident, references
        )

        references_response = self._to_response(ident, references)
        self._ref_cache[ident] = {"at": time.monotonic() * 1000, "data": references_response}
        self._ref_cache.move_to_end(ident)
        while len(self._ref_cache) > self.REF_CACHE_MAX_ENTRIES:
            self._ref_cache.popitem(last=False)
        return references_response

    def _invalidate_reference_index(self) -> None:
        self._ref_cache.clear()
        self._inverted_index = None
        self._inverted_index_at = 0.0

    async def remove_reference(self, entity_id: str, req: dict[str, Any]) -> dict[str, Any]:
        ident = str(entity_id or "").strip()
        loop = asyncio.get_running_loop()
        outcome = await loop.run_in_executor(
            None, unlink_entity_reference, self._deps(), ident, req
        )
        self._invalidate_reference_index()
        if outcome.get("action") == "filtered" and req.get("kind") == "home_mode":
            # 解绑只改了 config/triggers，触发器绑定缓存必须重建，否则旧绑定继续生效。
            if self._reload_home_mode_triggers is not None:
                with contextlib.suppress(Exception):
                    await self._reload_home_mode_triggers()
        remaining = await self.find_references(ident)
        return {
            "entityId": ident,
            "ok": bool(outcome.get("ok")),
            "action": outcome.get("action"),
            "message": outcome.get("message"),
            "remaining": remaining,
        }


__all__ = [
    "ENTITY_REFERENCE_KINDS",
    "ENTITY_REFERENCE_ROLES",
    "EntityReference",
    "EntityReferencesService",
    "UnlinkResult",
    "build_entity_references_inverted_index",
    "collect_entity_paths",
    "path_looks_like_action",
    "path_looks_like_trigger",
    "remove_entity_from_json_value",
    "safe_parse_json",
    "scan_layout_and_system",
    "text_contains_entity_id",
    "unlink_entity_reference",
]
