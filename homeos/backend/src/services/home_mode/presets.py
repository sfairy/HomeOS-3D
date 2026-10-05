"""家庭模式预设包、动作模板与默认种子（对齐 home-mode/presets.ts + defaults.ts）。

提供：
- ``HOME_MODE_ACTION_TEMPLATES`` / ``HOME_MODE_PRESETS`` / ``HOME_MODE_DEFAULT_MODES`` 数据；
- 动作类型推断（resolve_action_kind）与执行目标收集（collect_home_mode_target_actions）；
- 预设实体键智能推荐与一键安装计划构建（enrich_home_mode_presets / build_home_mode_preset_install_plan）。
"""

from __future__ import annotations

from typing import Any

from ...core.entity_domain import get_entity_domain
from ...core.errors import api_error, not_found

# 安防布防模式枚举（对齐 @homeos/shared security-map）。
SECURITY_ARMING_MODES = ("armed_home", "armed_away", "armed_night", "disarmed")

HOME_MODE_ACTION_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "away_lights_off",
        "label": "离家 · 关闭灯光",
        "kind": "entity",
        "domain": "light",
        "service": "turn_off",
        "placeholder": "light.all 或选择分组",
    },
    {
        "id": "away_climate_off",
        "label": "离家 · 关闭空调",
        "kind": "entity",
        "domain": "climate",
        "service": "turn_off",
        "placeholder": "climate.all",
    },
    {
        "id": "home_lights_on",
        "label": "回家 · 开玄关灯",
        "kind": "entity",
        "domain": "light",
        "service": "turn_on",
        "service_data": {"brightness_pct": 80},
        "placeholder": "light.entrance",
    },
    {
        "id": "sleep_scene",
        "label": "睡眠 · 激活场景",
        "kind": "scene",
        "domain": "scene",
        "service": "turn_on",
        "placeholder": "scene.sleep",
    },
    {
        "id": "notify_family",
        "label": "通知 · 应用内提醒",
        "kind": "notify",
        "domain": "notify",
        "service": "send_message",
        "placeholder": "模式已切换",
    },
    {
        "id": "cleaning_vacuum_start",
        "label": "清扫 · 启动扫地机",
        "kind": "entity",
        "domain": "vacuum",
        "service": "start",
        "placeholder": "vacuum.robot",
    },
]

HOME_MODE_PRESETS: list[dict[str, Any]] = [
    {
        "id": "preset_home",
        "name": "回家",
        "icon": "door-open",
        "description": "开玄关灯、居家布防、舒适空调温度",
        "entityKeys": [
            {"key": "entrance_light", "label": "玄关灯", "placeholder": "light.entrance"},
            {"key": "climate", "label": "空调（可选）", "placeholder": "climate.living_room"},
            {"key": "lock", "label": "门锁触发（可选）", "placeholder": "lock.front_door"},
        ],
        "triggers": [{"type": "lock_unlock", "entityId": "lock.front_door"}],
        "actions": [
            {
                "key": "entrance_light",
                "kind": "entity",
                "entity_id": "light.entrance",
                "domain": "light",
                "service": "turn_on",
                "service_data": {"brightness_pct": 80},
            },
            {"kind": "security", "entity_id": "armed_home", "domain": "security", "service": "arm"},
            {
                "key": "climate",
                "kind": "entity",
                "entity_id": "climate.living_room",
                "domain": "climate",
                "service": "set_temperature",
                "service_data": {"temperature": 24},
                "delay": 500,
            },
        ],
    },
    {
        "id": "preset_away",
        "name": "离家",
        "icon": "door-closed",
        "description": "关灯、关空调、外出布防",
        "entityKeys": [
            {"key": "lights", "label": "灯光分组", "placeholder": "light.all"},
            {"key": "climate", "label": "空调分组", "placeholder": "climate.all"},
        ],
        "triggers": [{"type": "all_leave"}],
        "actions": [
            {"key": "lights", "kind": "entity", "entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"key": "climate", "kind": "entity", "entity_id": "climate.all", "domain": "climate", "service": "turn_off"},
            {"kind": "security", "entity_id": "armed_away", "domain": "security", "service": "arm"},
            {"kind": "notify", "entity_id": "已切换离家模式", "domain": "notify", "service": "send_message"},
        ],
    },
    {
        "id": "preset_sleep",
        "name": "睡眠",
        "icon": "moon",
        "description": "关窗帘、睡眠场景、白噪音、夜间布防与勿扰提示",
        "exclusiveGroup": "comfort",
        "priority": 80,
        "entityKeys": [
            {"key": "curtains", "label": "卧室窗帘（可选）", "placeholder": "cover.bedroom"},
            {"key": "sleep_scene", "label": "睡眠场景", "placeholder": "scene.sleep"},
            {"key": "white_noise", "label": "白噪音音箱（可选）", "placeholder": "media_player.bedroom"},
        ],
        "triggers": [{"type": "time", "at": "22:30"}],
        "actions": [
            {"key": "curtains", "kind": "entity", "entity_id": "cover.bedroom", "domain": "cover", "service": "close_cover"},
            {
                "key": "sleep_scene",
                "kind": "scene",
                "entity_id": "scene.sleep",
                "domain": "scene",
                "service": "turn_on",
                "delay": 300,
            },
            {
                "key": "white_noise",
                "kind": "entity",
                "entity_id": "media_player.bedroom",
                "domain": "media_player",
                "service": "play_media",
                "service_data": {"media_content_id": "white_noise", "media_content_type": "music"},
                "delay": 500,
            },
            {"kind": "security", "entity_id": "armed_night", "domain": "security", "service": "arm", "delay": 800},
            {
                "kind": "notify",
                "entity_id": "睡眠模式已启用，夜间布防已激活",
                "domain": "notify",
                "service": "send_message",
                "delay": 1000,
            },
            {
                "kind": "notify",
                "entity_id": "已进入睡眠勿扰模式，非紧急通知将静默",
                "domain": "notify",
                "service": "send_message",
                "delay": 1200,
            },
        ],
    },
    {
        "id": "preset_cinema",
        "name": "影院",
        "icon": "film",
        "description": "关主灯、激活观影场景",
        "exclusiveGroup": "comfort",
        "priority": 50,
        "entityKeys": [
            {"key": "main_light", "label": "主灯", "placeholder": "light.living_room"},
            {"key": "cinema_scene", "label": "观影场景", "placeholder": "scene.cinema"},
        ],
        "actions": [
            {"key": "main_light", "kind": "entity", "entity_id": "light.living_room", "domain": "light", "service": "turn_off"},
            {
                "key": "cinema_scene",
                "kind": "scene",
                "entity_id": "scene.cinema",
                "domain": "scene",
                "service": "turn_on",
                "delay": 300,
            },
        ],
    },
    {
        "id": "preset_guest",
        "name": "会客",
        "icon": "users",
        "description": "会客灯光、通知家人",
        "entityKeys": [{"key": "guest_lights", "label": "会客区灯光", "placeholder": "light.living_room"}],
        "actions": [
            {
                "key": "guest_lights",
                "kind": "entity",
                "entity_id": "light.living_room",
                "domain": "light",
                "service": "turn_on",
                "service_data": {"brightness_pct": 70},
            },
            {"kind": "notify", "entity_id": "会客模式已启用", "domain": "notify", "service": "send_message"},
        ],
    },
    {
        "id": "preset_cleaning",
        "name": "清扫中",
        "icon": "vacuum",
        "description": "启动扫地机器人并通知家人",
        "entityKeys": [{"key": "vacuum", "label": "扫地机", "placeholder": "vacuum.robot"}],
        "actions": [
            {"key": "vacuum", "kind": "entity", "entity_id": "vacuum.robot", "domain": "vacuum", "service": "start"},
            {"kind": "notify", "entity_id": "清扫模式已启用", "domain": "notify", "service": "send_message", "delay": 300},
        ],
    },
]


def build_home_mode_security_action(mode: str) -> dict[str, Any]:
    return {
        "kind": "security",
        "entity_id": mode,
        "domain": "security",
        "service": "disarm" if mode == "disarmed" else "arm",
    }


HOME_MODE_DEFAULT_MODES: list[dict[str, Any]] = [
    {
        "name": "回家模式",
        "icon": "door-open",
        "sortOrder": 0,
        "config": [
            {"entity_id": "light.xuan_guan", "domain": "light", "service": "turn_on", "service_data": {"brightness_pct": 80}},
            build_home_mode_security_action("armed_home"),
            {
                "entity_id": "climate.ke_ting",
                "domain": "climate",
                "service": "set_temperature",
                "service_data": {"temperature": 24},
                "delay": 500,
            },
            {"entity_id": "cover.ke_ting", "domain": "cover", "service": "open_cover", "delay": 1000},
        ],
        "triggers": [{"type": "lock_unlock", "entityId": "lock.da_men"}],
    },
    {
        "name": "离家模式",
        "icon": "door-closed",
        "sortOrder": 1,
        "config": [
            {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"entity_id": "climate.all", "domain": "climate", "service": "turn_off"},
            {"entity_id": "media_player.all", "domain": "media_player", "service": "turn_off"},
            {"entity_id": "cover.all", "domain": "cover", "service": "close_cover", "delay": 500},
            build_home_mode_security_action("armed_away"),
        ],
        "triggers": [{"type": "all_leave"}],
    },
    {
        "name": "睡眠模式",
        "icon": "moon",
        "sortOrder": 2,
        "exclusiveGroup": "comfort",
        "priority": 80,
        "config": [
            {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"entity_id": "climate.wo_shi", "domain": "climate", "service": "set_temperature", "service_data": {"temperature": 26}},
            build_home_mode_security_action("armed_night"),
        ],
        "triggers": [{"type": "time", "at": "22:30"}],
    },
    {
        "name": "影音模式",
        "icon": "film",
        "sortOrder": 3,
        "exclusiveGroup": "comfort",
        "priority": 50,
        "config": [
            {
                "entity_id": "light.ke_ting",
                "domain": "light",
                "service": "turn_on",
                "service_data": {"brightness_pct": 20, "rgb_color": [100, 50, 200]},
            },
            {"entity_id": "cover.ke_ting", "domain": "cover", "service": "close_cover"},
        ],
    },
    {
        "name": "用餐模式",
        "icon": "utensils",
        "sortOrder": 4,
        "config": [
            {
                "entity_id": "light.can_ting",
                "domain": "light",
                "service": "turn_on",
                "service_data": {"brightness_pct": 80, "kelvin": 3000},
            },
            {"entity_id": "light.ke_ting", "domain": "light", "service": "turn_off"},
        ],
    },
    {
        "name": "度假模式",
        "icon": "palmtree",
        "sortOrder": 5,
        "config": [
            {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"entity_id": "climate.all", "domain": "climate", "service": "turn_off"},
            build_home_mode_security_action("armed_away"),
        ],
        "triggers": [{"type": "manual"}],
    },
]


# --------------------------------------------------------------------------- #
# 动作类型 / 目标收集
# --------------------------------------------------------------------------- #
def is_security_arming_entity_id(entity_id: str) -> bool:
    return entity_id in SECURITY_ARMING_MODES


def resolve_action_kind(action: dict[str, Any]) -> str:
    if action.get("kind"):
        return str(action["kind"])
    entity_id = action.get("entity_id") or ""
    if is_security_arming_entity_id(entity_id):
        return "security"
    if entity_id.startswith("scene."):
        return "scene"
    if entity_id.startswith("script."):
        return "script"
    return "entity"


def collect_home_mode_target_actions(actions: list[dict[str, Any]]) -> list[dict[str, str]]:
    """收集执行目标（notify 跳过；security 映射为 alarm_control_panel 合成目标）。"""
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for action in actions:
        kind = resolve_action_kind(action)
        if kind == "notify":
            continue
        ref = str(action.get("entity_id") or "").strip()
        if kind == "security":
            entity_id = f"alarm_control_panel.{ref or 'home'}"
            key = entity_id + "|alarm_control_panel"
            if key not in seen:
                seen.add(key)
                out.append({"entityId": entity_id, "domain": "alarm_control_panel"})
            continue
        if "." not in ref:
            continue
        domain = action.get("domain") or get_entity_domain(ref)
        key = ref + "|" + domain
        if key in seen:
            continue
        seen.add(key)
        out.append({"entityId": ref, "domain": domain})
    return out


# --------------------------------------------------------------------------- #
# 预设实体键推荐 / 安装计划
# --------------------------------------------------------------------------- #
def _suggest_preset_entity_overrides(preset: dict[str, Any], entity_ids: list[str]) -> dict[str, str]:
    by_domain: dict[str, list[str]] = {}
    for entity_id in entity_ids:
        domain = get_entity_domain(entity_id)
        if not domain:
            continue
        by_domain.setdefault(domain, []).append(entity_id)
    overrides: dict[str, str] = {}
    for entity_key in preset.get("entityKeys") or []:
        placeholder = str(entity_key.get("placeholder") or "").strip()
        domain = get_entity_domain(placeholder) or "light"
        candidates = by_domain.get(domain) or []
        if not candidates:
            continue
        if placeholder in candidates:
            overrides[entity_key["key"]] = placeholder
            continue
        hint = str(entity_key["key"]).replace("_", "")
        fuzzy = next(
            (
                candidate
                for candidate in candidates
                if hint in (candidate.split(".")[1] if "." in candidate else "")
                or (candidate.split(".")[1] if "." in candidate else "") in hint
                or entity_key["key"] in candidate.lower()
            ),
            None,
        )
        if fuzzy:
            overrides[entity_key["key"]] = fuzzy
            continue
        if placeholder.endswith(".all"):
            all_entity = next((c for c in candidates if c.endswith(".all") or "_all" in c), None)
            if all_entity:
                overrides[entity_key["key"]] = all_entity
    return overrides


def _get_unresolved_preset_keys(
    preset: dict[str, Any], overrides: dict[str, str], known_entity_ids: set[str]
) -> list[str]:
    unresolved: list[str] = []
    for entity_key in preset.get("entityKeys") or []:
        value = str(overrides.get(entity_key["key"]) or "").strip() or str(
            entity_key.get("placeholder") or ""
        ).strip()
        if "." not in value or value not in known_entity_ids:
            unresolved.append(entity_key["label"])
    return unresolved


def _build_preset_actions(preset: dict[str, Any], overrides: dict[str, str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for action in preset.get("actions") or []:
        kind = action.get("kind")
        if kind == "notify":
            out.append(
                {
                    "kind": "notify",
                    "entity_id": str(overrides.get(action.get("key") or "") or "").strip()
                    or action.get("entity_id"),
                    "domain": action.get("domain"),
                    "service": action.get("service"),
                    "service_data": action.get("service_data"),
                    "delay": action.get("delay"),
                }
            )
            continue
        if kind == "security":
            out.append(
                {
                    "kind": "security",
                    "entity_id": action.get("entity_id"),
                    "domain": action.get("domain"),
                    "service": action.get("service"),
                    "delay": action.get("delay"),
                }
            )
            continue
        entity_id = str(overrides.get(action.get("key") or "") or "").strip() or action.get("entity_id")
        if not entity_id or "." not in entity_id:
            continue
        out.append(
            {
                "kind": kind,
                "entity_id": entity_id,
                "domain": action.get("domain") or get_entity_domain(entity_id),
                "service": action.get("service"),
                "service_data": action.get("service_data"),
                "delay": action.get("delay"),
            }
        )
    return out


def _build_preset_triggers(preset: dict[str, Any], overrides: dict[str, str]) -> list[dict[str, Any]] | None:
    triggers = preset.get("triggers") or []
    if not triggers:
        return None
    result: list[dict[str, Any]] = []
    for trigger in triggers:
        if trigger.get("type") == "lock_unlock" and str(overrides.get("lock") or "").strip():
            result.append({**trigger, "entityId": overrides["lock"].strip()})
        else:
            result.append({**trigger})
    return result


def enrich_home_mode_presets(
    entity_ids: list[str], existing_modes: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    known = set(entity_ids)
    mode_id_by_name = {mode["name"]: mode["id"] for mode in existing_modes}
    views: list[dict[str, Any]] = []
    for preset in HOME_MODE_PRESETS:
        suggested = _suggest_preset_entity_overrides(preset, entity_ids)
        unresolved = _get_unresolved_preset_keys(preset, suggested, known)
        views.append(
            {
                **preset,
                "suggestedOverrides": suggested,
                "unresolvedCount": len(unresolved),
                "unresolvedLabels": unresolved,
                "existingModeId": mode_id_by_name.get(preset["name"]),
            }
        )
    return views


def build_home_mode_preset_install_plan(
    preset_id: str, entity_ids: list[str], entity_overrides: dict[str, str] | None = None
) -> dict[str, Any]:
    preset = next((p for p in HOME_MODE_PRESETS if p["id"] == preset_id), None)
    if preset is None:
        not_found(api_error("HOME_MODE_PRESET_NOT_FOUND"))
    known = set(entity_ids)
    merged_overrides = {
        **_suggest_preset_entity_overrides(preset, entity_ids),
        **(entity_overrides or {}),
    }
    unresolved_actions = _get_unresolved_preset_keys(preset, merged_overrides, known)
    actions = _build_preset_actions(preset, merged_overrides)
    if not actions:
        not_found(api_error("HOME_MODE_PRESET_ACTIONS_EMPTY"))
    triggers = _build_preset_triggers(preset, merged_overrides)
    return {
        "preset": preset,
        "actions": actions,
        "config": actions,
        "triggersJson": triggers,
        "unresolvedActions": unresolved_actions,
        "mergedOverrides": merged_overrides,
    }
