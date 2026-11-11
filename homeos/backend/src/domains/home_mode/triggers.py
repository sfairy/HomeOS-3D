"""家庭模式触发器解析与自动触发（对齐 home-mode/triggers.internals.ts）。

包含时间触发（按家庭时区分钟匹配）、HA 状态变更触发（门锁解锁 / state to-from）、
在场回家触发、日历外出联动、全员离家触发；均由 leader 副本执行并做冷却去重。
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from .presets import resolve_action_kind  # noqa: F401  (保持模块语义对齐，供调用方复用)  # pyright: ignore[reportUnusedImport]
from ...platform.core.runtime.params import non_negative_seconds
from ...platform.core.runtime.zoned_time import (
    date_from_zoned_wall_clock,
    home_mode_minute_key,
    normalize_home_mode_time_at,
    zoned_date_parts,
)

logger = logging.getLogger("homeos.home_mode")

#: 时间触发器的补偿窗口：定时检查若被阻塞 / 服务重启跨过了 HH:MM，
#: 在这个窗口内仍会补触发一次；超过窗口视为「已经错过」，不再回放几小时前的模式。
TIME_TRIGGER_GRACE_MINUTES = 10


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
    #: 已触发过的时间触发器 occurrence：``mode_id@HH:MM@YYYY-MM-DD``。
    #: 用它替代「当前分钟相等」判定，错过一整分钟也能在宽限期内补触发。
    fired_time_occurrences: dict[str, int] = field(default_factory=dict)
    #: occurrence 集合所属的自然日（跨天时清空，避免无界增长）。
    time_occurrence_day: str = ""
    calendar_away: bool = False
    #: 日历外出**开始时**还处于激活态的模式 id 集合（可能跨多个互斥组）。
    #: 只记内存指针会漏掉「另一个互斥组同时激活」的模式，外出结束后它就永远留在激活态。
    pre_away_mode_ids: list[str] = field(default_factory=list)
    #: 持续判定（``forSeconds``）的待触发定时器：key 是「模式:类型:实体」。
    #: 回落时必须取消，否则「开一下就关」的门磁仍会在到点时触发。
    hold_timers: dict[str, Any] = field(default_factory=dict)
    #: 定时器到点后创建的异步任务（持有引用防止被 GC 提前回收）。
    hold_tasks: set[Any] = field(default_factory=set)


def _read_json_array(raw: Any, *, mode_id: str = "") -> list[Any]:
    """把 triggers 列解析成数组；解析失败**留日志**而不是静默当成空触发列表。

    静默返回 `[]` 的后果是「这个模式的自动化从此再也不会触发」，而界面上它看起来一切正常
    （触发器还在那里、开关也是开的）——用户只会觉得「不灵了」，排查时没有任何线索。
    """
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError) as error:
            logger.error(
                "家庭模式 %s 的 triggers 字段不是合法 JSON（%s），已按空触发处理：该模式的自动化不会生效",
                mode_id or "<unknown>",
                error,
            )
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


def prune_home_mode_trigger_cooldown(cooldown_map: dict[str, int], max_age_ms: int = 24 * 3600_000) -> None:
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
        triggers = _read_json_array(raw_triggers, mode_id=str(mode.get("id") or ""))
        for trigger in triggers:
            if not isinstance(trigger, dict) or not trigger.get("type"):
                continue
            if trigger["type"] in ("manual", "calendar_away"):
                continue
            if trigger.get("enabled") is False:
                continue
            if trigger["type"] in ("lock_unlock", "state") and not str(trigger.get("entityId") or "").strip():
                # 历史配置里可能有解绑后残留的空 entityId：留着会被状态事件当成通配符，
                # 在加载绑定这一步就丢掉，比在每次事件里判空更稳。
                logger.warning(
                    "忽略缺少 entityId 的家庭模式触发器 mode=%s type=%s",
                    mode.get("id"),
                    trigger["type"],
                )
                continue
            bindings.append(HomeModeTriggerBinding(mode_id=mode["id"], mode_name=mode["name"], trigger=trigger))
    return bindings


def resolve_calendar_away_mode(modes: list[dict[str, Any]]) -> dict[str, Any] | None:
    marked = None
    for mode in modes:
        triggers = _read_json_array(mode.get("triggers"), mode_id=str(mode.get("id") or ""))
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
) -> bool:
    """尝试按触发绑定激活模式。

    返回值语义：``True`` 表示「本次不需要再重试」（已激活 / 让位 / 冷却中 / 激活成功），
    ``False`` 表示激活失败且应当允许在宽限期内重试。调用方据此决定是否消费冷却与
    记录时间触发 occurrence —— 消费早了会让一次失败把整天的自动化吞掉。
    """
    # 「本次模式是否已在激活态」必须读库：多互斥组下内存指针只指向其中一个，
    # 拿指针判断会把「另一个组里已经激活的同名模式」当成未激活，于是反复走一遍
    # 激活流程（幂等但空转、还会占掉冷却），日历 / 在场链路也会据此误判。
    active_modes = await deps.get_active_modes()
    if any(str(mode.get("id")) == binding.mode_id for mode in active_modes):
        return True
    key = f"{binding.mode_id}:{binding.trigger.get('type')}:{reason}"
    if not can_fire_home_mode_trigger(state.trigger_cooldown, key, deps.get_trigger_cooldown_ms()):
        return True
    incoming = await deps.find_mode(binding.mode_id)
    if not incoming:
        return True
    incoming_group = incoming.get("exclusiveGroup") or "default"
    # 只在**同一个互斥组**里比优先级：全局主模式可能属于另一个组，拿它当对手会让
    # 「同组互斥 + 优先级让位」在多互斥组下完全失效（低优先级模式直接顶掉同组高优先级）。
    active = next(
        (
            mode
            for mode in active_modes
            if mode["id"] != binding.mode_id and (mode.get("exclusiveGroup") or "default") == incoming_group
        ),
        None,
    )
    if active is not None:
        incoming_priority = incoming.get("priority")
        active_priority = active.get("priority")
        if (50 if incoming_priority is None else incoming_priority) <= (
            50 if active_priority is None else active_priority
        ):
            # 已评估但按优先级让位，同样消费冷却，避免每个状态变更都重复查库。
            mark_home_mode_trigger_fired(state.trigger_cooldown, key)
            return True
    deps.log(f"触发器激活模式 [{binding.mode_name}]: {reason}")
    result = await deps.request_activate(
        binding.mode_id,
        {
            "source": (meta or {}).get("source", "trigger"),
            "reason": (meta or {}).get("reason", reason),
        },
    )
    # activate 的失败有两条路径：抛错，或返回 ``success=False``（HA 离线、执行失败率
    # 达阈值回滚）。后者以前照样消费冷却，结果是「22:30 因 HA 断连失败 → 当天再也
    # 不补触发」。这里按返回值判定，失败就不消费，让宽限期/下一次状态变更能重试。
    if isinstance(result, dict) and result.get("success") is False:
        deps.warn(f"触发器激活模式失败，保留冷却窗口等待重试: {binding.mode_name}")
        return False
    # 冷却只在动作真正执行后消费：activate 抛错时可立即重试，不被冷却挡住。
    mark_home_mode_trigger_fired(state.trigger_cooldown, key)
    return True


async def check_home_mode_time_triggers(state: HomeModeTriggersState, deps: Any) -> None:
    if not deps.is_leader():
        return
    now = datetime.now(UTC)
    timezone_name = (deps.get_home_timezone() or "").strip() or None
    minute_key = home_mode_minute_key(now, timezone_name)
    if minute_key == state.last_time_trigger_minute:
        return
    parts = zoned_date_parts(now, timezone_name)
    weekday = parts["weekday"]
    day_key = f"{parts['year']:04d}-{parts['month']:02d}-{parts['day']:02d}"
    if state.time_occurrence_day != day_key:
        state.fired_time_occurrences.clear()
        state.time_occurrence_day = day_key

    for binding in state.trigger_bindings:
        await _handle_time_binding(state, deps, binding, now, parts, weekday, day_key)
    # 只有整轮求值完成后才标记该分钟已处理：中途异常不会吞掉本分钟的触发机会。
    state.last_time_trigger_minute = minute_key


def _time_binding_due(
    binding: HomeModeTriggerBinding,
    now: datetime,
    parts: dict[str, Any],
    weekday: str,
    timezone_name: str | None,
) -> tuple[str, str] | None:
    """该时间绑定本次是否到期；到期返回 ``(at, occurrence)``，否则 ``None``。

    判据是「现在是否已过 occurrence」而不是「分钟是否恰好相等」：后者在事件循环被
    阻塞或服务重启跨过该分钟时会永久漏触发（当天再也不会补）。
    """
    trigger = binding.trigger
    if trigger.get("type") != "time" or not isinstance(trigger.get("at"), str) or not trigger.get("at"):
        return None
    days = trigger.get("days")
    if isinstance(days, list) and days and weekday not in days:
        return None
    at = normalize_home_mode_time_at(trigger["at"].strip())
    if not at:
        return None
    hour, minute = (int(item) for item in at.split(":", 1))
    due_at = date_from_zoned_wall_clock(timezone_name, parts["year"], parts["month"], parts["day"], hour, minute)
    delay = now - due_at
    if delay < timedelta(0) or delay > timedelta(minutes=TIME_TRIGGER_GRACE_MINUTES):
        return None
    return at, f"{binding.mode_id}@{at}@{parts['year']:04d}-{parts['month']:02d}-{parts['day']:02d}"


async def _handle_time_binding(
    state: HomeModeTriggersState,
    deps: Any,
    binding: HomeModeTriggerBinding,
    now: datetime,
    parts: dict[str, Any],
    weekday: str,
    day_key: str,
) -> None:
    """单个时间绑定的求值与执行（异常只影响自身）。"""
    due = _time_binding_due(binding, now, parts, weekday, (deps.get_home_timezone() or "").strip() or None)
    if due is None:
        return
    at, occurrence_key = due
    if occurrence_key in state.fired_time_occurrences:
        return
    # 单个绑定的异常不能中断同分钟其余绑定：低优先级模式被仲裁拒绝会抛错，
    # 以前会把后面所有模式的求值一起跳过，整分钟只剩它一个被评估。
    try:
        fired = await _fire_triggered_home_mode(state, deps, binding, f"time@{at}")
    except Exception:  # 仲裁拒绝 / 模式暂不可用：记录后继续下一个绑定
        logger.warning("时间触发器执行失败: mode=%s at=%s", binding.mode_id, at, exc_info=True)
        return
    if fired:
        # 只有整轮动作成功（activate 未抛错且未返回 success=False）才记 occurrence，
        # 失败可在宽限期内重试。
        state.fired_time_occurrences[occurrence_key] = 1


async def handle_home_mode_state_trigger(state: HomeModeTriggersState, deps: Any, event: dict[str, Any]) -> None:
    if not deps.is_leader():
        return
    # 重连/冷启动静置期：这一窗口内的状态变更来自快照补齐或首轮上报，没有可信的
    # 「旧态 → 新态」语义。默认「回家模式」以 `lock_unlock` 为触发，若不抑制，
    # 进程重启时门锁当前就是 unlocked 也会被判成一次「刚开锁」并直接布防。
    settle_check = getattr(deps, "is_baseline_settling", None)
    if callable(settle_check) and settle_check():
        logger.debug("HA 连接静置期内跳过家庭模式状态触发器: entity=%s", event.get("entity_id"))
        return
    entity_id = event.get("entity_id")
    new_state = (event.get("new_state") or {}).get("state")
    old_state = (event.get("old_state") or {}).get("state")
    if not new_state or new_state == old_state:
        return
    if deps.is_away_simulated_entity(str(entity_id or "")):
        # 离家模拟自己开关的灯不是「有人到家」：否则度假期间每轮模拟都会撤防/切居家。
        logger.info("跳过离家模拟实体触发的家庭模式状态触发器: %s → %s", entity_id, new_state)
        return

    for binding in state.trigger_bindings:
        await _handle_state_binding(state, deps, binding, str(entity_id or ""), old_state, new_state)


async def _handle_state_binding(
    state: HomeModeTriggersState,
    deps: Any,
    binding: HomeModeTriggerBinding,
    entity_id: str,
    old_state: Any,
    new_state: str,
) -> None:
    """单个状态绑定的匹配判定与（可选的）持续判定派发。

    抽成函数是为了让 ``handle_home_mode_state_trigger`` 保持「前置抑制 + 遍历」两层结构：
    锁边沿与 state 边沿的判据各自有 4–5 个分支，堆在遍历里会同时抬高圈复杂度与可读性成本。

    ``forSeconds`` 的语义是「状态进入匹配后**持续**满足这么久才触发」：进入匹配时起一个
    定时复核，回落时取消。它不是冷却 —— 冷却管「触发后多久内别再触发」，这里管
    「触发条件本身要不要再等一等」。典型用途：`门磁开` 持续 5 分钟才判定「门没关」，
    而不是一开就报警。
    """
    trigger = binding.trigger
    if not _state_binding_matches(trigger, entity_id, old_state, new_state):
        _cancel_hold(state, binding)
        return
    hold_seconds = non_negative_seconds(trigger.get("forSeconds"))
    reason = f"{trigger.get('type')}:{entity_id}→{new_state}"
    if hold_seconds <= 0:
        await _fire_triggered_home_mode(state, deps, binding, reason)
        return
    _schedule_hold(state, deps, binding, entity_id, new_state, hold_seconds, reason)


def _state_binding_matches(trigger: dict[str, Any], entity_id: str, old_state: Any, new_state: str) -> bool:
    """该状态绑定是否在本次事件上进入匹配（只判定，不执行）。"""
    trigger_type = trigger.get("type")
    if trigger_type == "lock_unlock":
        bound_lock = str(trigger.get("entityId") or "").strip()
        if not bound_lock:
            # 空 entityId 绝不能当通配符：历史配置（旧版解绑写空串）留着这种触发器时，
            # 「删掉前门锁 → 任意一把锁解锁都激活回家模式」。这里跳过并留日志。
            logger.warning("跳过缺少 entityId 的 lock_unlock 触发器 trigger=%s", trigger)
            return False
        # 必须是**锁本体**从 locked → unlocked 的真实边沿。缺旧态时（首次观测、
        # 快照补齐、实体重建）一律不触发 —— 那不是「有人开了门」。
        if old_state != "locked":
            return False
        return bound_lock == entity_id and entity_id.startswith("lock.") and new_state == "unlocked"
    if trigger_type != "state" or trigger.get("entityId") != entity_id:
        return False
    if trigger.get("to") and new_state != trigger["to"]:
        return False
    if trigger.get("from") and old_state != trigger["from"]:
        return False
    # 只声明了 `to` 的触发器依赖「真的发生了这次变化」。没有旧态说明这是
    # 首次观测（冷启动 / 重连补齐），不是边沿，跳过。
    return not (trigger.get("to") and not trigger.get("from") and old_state is None)


def _hold_key(binding: HomeModeTriggerBinding) -> str:
    trigger = binding.trigger
    return f"{binding.mode_id}:{trigger.get('type')}:{trigger.get('entityId')}"


def _cancel_hold(state: HomeModeTriggersState, binding: HomeModeTriggerBinding) -> None:
    """回落时取消待触发的持续判定（否则「开一下就关」的门磁仍会触发）。"""
    handle = state.hold_timers.pop(_hold_key(binding), None)
    if handle is not None:
        handle.cancel()


def _schedule_hold(
    state: HomeModeTriggersState,
    deps: Any,
    binding: HomeModeTriggerBinding,
    entity_id: str,
    new_state: str,
    hold_seconds: float,
    reason: str,
) -> None:
    """起一个持续判定定时器；同一绑定已有定时器时不重复起。"""
    key = _hold_key(binding)
    existing = state.hold_timers.get(key)
    if existing is not None and not existing.cancelled():
        return
    loop = asyncio.get_running_loop()

    async def _fire_after_hold() -> None:
        state.hold_timers.pop(key, None)
        # 定时到点后再确认一次：这段时间里实体可能已经回落，或者 HA 已断开。
        try:
            current = await deps.fetch_entity_state(entity_id)
        except Exception:
            logger.debug("持续判定复核读取状态失败，跳过本次触发: %s", entity_id, exc_info=True)
            current = None
        if not current or str(current.get("state") or "") != new_state:
            logger.debug("持续判定到点时状态已变化，跳过触发: %s", entity_id)
            return
        await _fire_triggered_home_mode(state, deps, binding, reason)

    def _on_timeout() -> None:
        task = loop.create_task(_fire_after_hold())
        state.hold_tasks.add(task)
        task.add_done_callback(state.hold_tasks.discard)

    state.hold_timers[key] = loop.call_later(hold_seconds, _on_timeout)


async def handle_home_mode_presence_arrive(state: HomeModeTriggersState, deps: Any, data: dict[str, Any]) -> None:
    if not deps.is_leader():
        return
    if not data.get("atHome"):
        return
    for binding in state.trigger_bindings:
        if binding.trigger.get("type") != "arrive_home":
            continue
        await _fire_triggered_home_mode(state, deps, binding, f"arrive_home:{data.get('name') or 'member'}")


async def _activate_calendar_away_mode(state: HomeModeTriggersState, deps: Any, away_mode: dict[str, Any]) -> None:
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


async def _restore_modes_after_away(state: HomeModeTriggersState, deps: Any, away_id: str, away_name: str) -> None:
    """日历外出结束：先退出外出模式，再恢复先前激活的模式。

    顺序不能反：① 先前模式在同一个互斥组时会顶掉外出模式，但快照回放顺序被打乱；
    ② 先前模式在**另一个**组时根本顶不掉，外出模式从此一直激活。
    """
    deps.log(f"日历外出结束,退出模式: {away_name}")
    await deps.request_deactivate(away_id)
    for restore_id in [mid for mid in state.pre_away_mode_ids if mid and mid != away_id]:
        restore_mode = await deps.find_mode(restore_id)
        if not restore_mode:
            continue
        deps.log(f"日历外出结束,恢复先前模式: {restore_mode['name']}")
        await deps.request_activate(
            restore_mode["id"],
            {"source": "calendar", "reason": "日历外出结束，恢复先前模式"},
        )


async def handle_home_mode_calendar_away(state: HomeModeTriggersState, deps: Any, data: dict[str, Any]) -> None:
    if not deps.is_leader():
        return
    away = bool(data.get("away"))
    # 激活态必须读库（可跨互斥组）：内存指针只指向「优先级最高的那一个」，
    # 用它判「是否已激活 / 该退哪一个」会让另一个组的外部模式残留（退出后仍占着激活态）。
    active_ids = {str(mode.get("id")) for mode in await deps.get_active_modes()}
    if away and not state.calendar_away:
        state.pre_away_mode_ids = sorted(active_ids)
    state.calendar_away = away
    away_mode = resolve_calendar_away_mode(state.cached_modes)
    if away_mode is None:
        if not away:
            state.pre_away_mode_ids = []
        return
    away_id = str(away_mode["id"])
    try:
        if away:
            if away_id not in active_ids:
                await _activate_calendar_away_mode(state, deps, away_mode)
        elif away_id in active_ids:
            await _restore_modes_after_away(state, deps, away_id, away_mode["name"])
            state.pre_away_mode_ids = []
    except Exception as exc:
        deps.warn(f"日历联动模式失败: {exc}")


async def handle_home_mode_everyone_left(state: HomeModeTriggersState, deps: Any) -> None:
    if not deps.is_leader():
        return
    bindings = [b for b in state.trigger_bindings if b.trigger.get("type") == "all_leave"]
    if not bindings:
        return
    # 逐条隔离：一个绑定被仲裁拒绝不该让其余「全员离家」绑定失去这次触发机会。
    for binding in bindings:
        try:
            await _fire_triggered_home_mode(state, deps, binding, "all_leave")
        except Exception as exc:  # 单条失败只影响自身
            deps.warn(f"自动离家模式触发失败（mode={binding.mode_id}）: {exc}")
