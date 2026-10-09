"""家庭模式触发器解析与自动触发（对齐 home-mode/triggers.internals.ts）。

包含时间触发（按家庭时区分钟匹配）、HA 状态变更触发（门锁解锁 / state to-from）、
在场回家触发、日历外出联动、全员离家触发；均由 leader 副本执行并做冷却去重。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .presets import resolve_action_kind  # noqa: F401  (保持模块语义对齐，供调用方复用)
from ...core.zoned_time import home_mode_minute_key, normalize_home_mode_time_at, zoned_date_parts

logger = logging.getLogger("homeos.home_mode")

_AWAY_NAME_RE = __import__("re").compile(r"离家|away|外出|vacation", __import__("re").IGNORECASE)


@dataclass
class HomeModeTriggerBinding:
    mode_id: str
    mode_name: str
    trigger: dict[str, Any]


@dataclass
class HomeModeTriggersState:
    trigger_bindings: list[HomeModeTriggerBinding] = field(default_factory=list)
    cached_modes: list[dict[str, Any]] = field(default_factory=list)
    trigger_cooldown: dict[str, int] = field(default_factory=dict)
    last_time_trigger_minute: str = ""
    calendar_away: bool = False
    pre_away_mode_id: str | None = None


def _read_json_array(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return []
    else:
        parsed = raw
    return parsed if isinstance(parsed, list) else []


def can_fire_home_mode_trigger(cooldown_map: dict[str, int], key: str, cooldown_ms: int) -> bool:
    """只做冷却判定，不消费冷却。动作真正执行后才调用 ``mark_home_mode_trigger_fired``。"""
    import time

    last = cooldown_map.get(key) or 0
    now = int(time.time() * 1000)
    return now - last >= cooldown_ms


def mark_home_mode_trigger_fired(cooldown_map: dict[str, int], key: str) -> None:
    """动作成功后消费一次冷却窗口。"""
    import time

    cooldown_map[key] = int(time.time() * 1000)


def prune_home_mode_trigger_cooldown(
    cooldown_map: dict[str, int], max_age_ms: int = 24 * 3600_000
) -> None:
    import time

    cutoff = int(time.time() * 1000) - max_age_ms
    for key in [k for k, ts in cooldown_map.items() if ts < cutoff]:
        del cooldown_map[key]


def parse_home_mode_trigger_bindings(
    modes: list[dict[str, Any]],
) -> list[HomeModeTriggerBinding]:
    bindings: list[HomeModeTriggerBinding] = []
    for mode in modes:
        raw_triggers = mode.get("triggers")
        if not raw_triggers:
            continue
        triggers = _read_json_array(raw_triggers)
        for trigger in triggers:
            if not isinstance(trigger, dict) or not trigger.get("type"):
                continue
            if trigger["type"] in ("manual", "calendar_away"):
                continue
            if trigger.get("enabled") is False:
                continue
            bindings.append(
                HomeModeTriggerBinding(
                    mode_id=mode["id"], mode_name=mode["name"], trigger=trigger
                )
            )
    return bindings


def resolve_calendar_away_mode(modes: list[dict[str, Any]]) -> dict[str, Any] | None:
    marked = None
    for mode in modes:
        triggers = _read_json_array(mode.get("triggers"))
        if any(
            isinstance(t, dict)
            and t.get("enabled") is not False
            and (t.get("type") == "calendar_away" or t.get("calendarAway") is True)
            for t in triggers
        ):
            marked = mode
            break
    if marked is not None:
        return marked
    return next((m for m in modes if _AWAY_NAME_RE.search(str(m.get("name") or ""))), None)


async def _fire_triggered_home_mode(
    state: HomeModeTriggersState,
    deps: Any,
    binding: HomeModeTriggerBinding,
    reason: str,
    meta: dict[str, Any] | None = None,
) -> None:
    if deps.get_active_mode_id() == binding.mode_id:
        return
    key = f"{binding.mode_id}:{binding.trigger.get('type')}:{reason}"
    if not can_fire_home_mode_trigger(state.trigger_cooldown, key, deps.get_trigger_cooldown_ms()):
        return
    incoming = await deps.find_mode(binding.mode_id)
    if not incoming:
        return
    active = await deps.get_active_mode()
    if active and active["id"] != binding.mode_id:
        same_group = (incoming.get("exclusiveGroup") or "default") == (
            active.get("exclusiveGroup") or "default"
        )
        incoming_priority = incoming.get("priority")
        active_priority = active.get("priority")
        if same_group and (50 if incoming_priority is None else incoming_priority) <= (
            50 if active_priority is None else active_priority
        ):
            # 已评估但按优先级让位，同样消费冷却，避免每个状态变更都重复查库。
            mark_home_mode_trigger_fired(state.trigger_cooldown, key)
            return
    deps.log(f"触发器激活模式 [{binding.mode_name}]: {reason}")
    await deps.activate(
        binding.mode_id,
        {
            "source": (meta or {}).get("source", "trigger"),
            "reason": (meta or {}).get("reason", reason),
        },
    )
    # 冷却只在动作真正执行后消费：activate 抛错时可立即重试，不被冷却挡住。
    mark_home_mode_trigger_fired(state.trigger_cooldown, key)


async def check_home_mode_time_triggers(state: HomeModeTriggersState, deps: Any) -> None:
    if not deps.is_leader():
        return
    now = datetime.now(UTC)
    timezone_name = (deps.get_home_timezone() or "").strip() or None
    minute_key = home_mode_minute_key(now, timezone_name)
    if minute_key == state.last_time_trigger_minute:
        return
    weekday = zoned_date_parts(now, timezone_name)["weekday"]

    for binding in state.trigger_bindings:
        trigger = binding.trigger
        if trigger.get("type") != "time" or not trigger.get("at"):
            continue
        if not isinstance(trigger.get("at"), str):
            continue
        days = trigger.get("days")
        if isinstance(days, list) and days and weekday not in days:
            continue
        at = normalize_home_mode_time_at(trigger["at"].strip())
        if at and at == minute_key:
            await _fire_triggered_home_mode(state, deps, binding, f"time@{at}")
    # 只有整轮求值完成后才标记该分钟已处理：中途异常不会吞掉本分钟的触发机会。
    state.last_time_trigger_minute = minute_key


async def handle_home_mode_state_trigger(
    state: HomeModeTriggersState, deps: Any, event: dict[str, Any]
) -> None:
    if not deps.is_leader():
        return
    entity_id = event.get("entity_id")
    new_state = (event.get("new_state") or {}).get("state")
    old_state = (event.get("old_state") or {}).get("state")
    if not new_state or new_state == old_state:
        return

    for binding in state.trigger_bindings:
        trigger = binding.trigger
        if (
            trigger.get("type") == "lock_unlock"
            and str(entity_id or "").startswith("lock.")
            and new_state == "unlocked"
        ):
            if not trigger.get("entityId") or trigger.get("entityId") == entity_id:
                await _fire_triggered_home_mode(state, deps, binding, f"lock_unlock:{entity_id}")
        if trigger.get("type") == "state" and trigger.get("entityId") == entity_id:
            if trigger.get("to") and new_state != trigger["to"]:
                continue
            if trigger.get("from") and old_state != trigger["from"]:
                continue
            await _fire_triggered_home_mode(state, deps, binding, f"state:{entity_id}→{new_state}")


async def handle_home_mode_presence_arrive(
    state: HomeModeTriggersState, deps: Any, data: dict[str, Any]
) -> None:
    if not deps.is_leader():
        return
    if not data.get("atHome"):
        return
    for binding in state.trigger_bindings:
        if binding.trigger.get("type") != "arrive_home":
            continue
        await _fire_triggered_home_mode(
            state, deps, binding, f"arrive_home:{data.get('name') or 'member'}"
        )


async def handle_home_mode_calendar_away(
    state: HomeModeTriggersState, deps: Any, data: dict[str, Any]
) -> None:
    if not deps.is_leader():
        return
    away = bool(data.get("away"))
    if away and not state.calendar_away:
        state.pre_away_mode_id = deps.get_active_mode_id()
    state.calendar_away = away
    away_mode = resolve_calendar_away_mode(state.cached_modes)
    if away_mode is None:
        if not away:
            state.pre_away_mode_id = None
        return
    try:
        if away:
            if deps.get_active_mode_id() != away_mode["id"]:
                deps.log(f"日历外出事件触发,激活模式: {away_mode['name']}")
                await _fire_triggered_home_mode(
                    state,
                    deps,
                    HomeModeTriggerBinding(
                        mode_id=away_mode["id"],
                        mode_name=away_mode["name"],
                        trigger={"type": "calendar_away", "enabled": True},
                    ),
                    "calendar_away",
                    {"source": "calendar", "reason": "日历外出事件"},
                )
        else:
            if deps.get_active_mode_id() == away_mode["id"]:
                pre_id = state.pre_away_mode_id
                pre_mode = (
                    await deps.find_mode(pre_id) if pre_id and pre_id != away_mode["id"] else None
                )
                if pre_mode:
                    deps.log(f"日历外出结束,恢复先前模式: {pre_mode['name']}")
                    await deps.activate(
                        pre_mode["id"],
                        {"source": "calendar", "reason": "日历外出结束，恢复先前模式"},
                    )
                else:
                    deps.log(f"日历外出结束,停用模式: {away_mode['name']}")
                    await deps.deactivate()
            state.pre_away_mode_id = None
    except Exception as exc:
        deps.warn(f"日历联动模式失败: {exc}")


async def handle_home_mode_everyone_left(state: HomeModeTriggersState, deps: Any) -> None:
    if not deps.is_leader():
        return
    try:
        bindings = [b for b in state.trigger_bindings if b.trigger.get("type") == "all_leave"]
        if not bindings:
            return
        for binding in bindings:
            await _fire_triggered_home_mode(state, deps, binding, "all_leave")
    except Exception as exc:
        deps.warn(f"自动离家模式触发失败: {exc}")
