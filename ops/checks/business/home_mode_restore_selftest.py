#!/usr/bin/env python3
"""家庭模式「跨互斥组设备归属 + 布防降级」自检。

默认预置就能复现的两条缺陷：

1. 回家（default 组）→ 睡眠（comfort 组）→ 离家（default 组）→ 退出睡眠：
   睡眠快照记的是「回家时灯亮着」，退出时无脑回放 —— 家里没人灯全亮。
   归属仲裁要求：设备由仍在生效的模式控制时**不回放**，并如实报 ``skippedOwned``。
2. 离家（armed_away）+ 22:30 睡眠（armed_night）：无人在家被静默降级成夜间警戒。
   自动触发不允许降低布防等级；手动切换仍然可以。

另外覆盖「停用态 + 残留快照」的重试回放：以前这种孤儿快照既不在激活列表里，也没有
回放入口（``deactivate`` 直接返回「模式未激活」）。现在它可回放，成功后清掉快照。
"""

from __future__ import annotations

import asyncio
from typing import Any

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.home_mode.actions import (
    HomeModeActivateState,
    deactivate_home_mode,
)
from homeos.backend.src.domains.home_mode.execution_record import check_mode_conditions
from homeos.backend.src.domains.home_mode.persistence import build_mode_row, normalize_mode_fields
from homeos.backend.src.domains.home_mode.presence_rules import (
    away_conflict_result,
    collect_evictions,
    evict_other_modes,
    find_blocking_away_mode,
    mode_implies_away,
)
from homeos.backend.src.domains.home_mode.presets import is_security_downgrade
from homeos.backend.src.domains.home_mode.restore import (
    build_activation_preview,
    collect_owned_targets,
    foreign_owned_entities,
    restore_mode_snapshot,
    summarize_pending_restore,
    target_covers,
)
from homeos.backend.src.domains.home_mode.security_actions import should_skip_security_downgrade
from homeos.backend.src.domains.home_mode.settle import settle_home_mode


class FakeDeps:
    """只实现归属仲裁 / 快照回放用到的窄接口。"""

    def __init__(
        self,
        *,
        modes: list[dict[str, Any]] | None = None,
        active: list[dict[str, Any]] | None = None,
        states: dict[str, dict[str, Any]] | None = None,
        ha_connected: bool = True,
    ) -> None:
        self.modes = modes or []
        self.active_modes = active or []
        self.states = states or {}
        self.presence: dict[str, Any] = {}
        self.ha_connected = ha_connected
        self.calls: list[tuple[str, str, str]] = []
        self.warnings: list[str] = []
        self.logs: list[str] = []
        self.notifications: list[tuple[str, str]] = []
        self.deactivated: list[str] = []
        self.cleared: list[tuple[list[str], bool]] = []
        self.events: list[tuple[str, Any]] = []
        self.trigger_logs: list[dict[str, Any]] = []
        self.linkage_arbiter = self

    # 日志 / 通知 / 联动
    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def log(self, message: str) -> None:
        self.logs.append(message)

    async def notify(self, level: str, message: str, _source: str) -> None:
        self.notifications.append((level, message))

    def push_trigger_log(self, payload: dict[str, Any]) -> None:
        self.trigger_logs.append(payload)

    def release(self, *_args: Any) -> None:
        return None

    async def emit_home_mode_event(self, name: str, payload: Any) -> None:
        self.events.append((name, payload))

    # 数据
    async def list_active_modes(self) -> list[dict[str, Any]]:
        return self.active_modes

    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return next((mode for mode in self.modes if str(mode.get("id")) == mode_id), None)

    async def find_first_active(self) -> dict[str, Any] | None:
        return self.active_modes[0] if self.active_modes else None

    async def clear_group_active(self, group_ids: list[str], incomplete: bool) -> None:
        self.cleared.append((list(group_ids), incomplete))

    async def deactivate_in_db(self, mode_id: str, **_kwargs: Any) -> None:
        self.deactivated.append(mode_id)

    # HA
    async def get_ha_status(self) -> dict[str, Any]:
        return {"connected": self.ha_connected}

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        return self.states.get(entity_id)

    async def call_service(self, domain: str, service: str, entity_id: str, _data: dict[str, Any]) -> None:
        self.calls.append((domain, service, entity_id))

    def get_presence_context(self) -> dict[str, Any]:
        return self.presence


class FakeState:
    def __init__(self, active_mode_id: str | None = None) -> None:
        self.active_mode_id = active_mode_id

    def get_active_mode_id(self) -> str | None:
        return self.active_mode_id

    def set_active_mode_id(self, mode_id: str | None) -> None:
        self.active_mode_id = mode_id


def _light_on(brightness: int = 200) -> dict[str, Any]:
    return {"state": "on", "attributes": {"brightness": brightness}}


def _light_off() -> dict[str, Any]:
    return {"state": "off", "attributes": {}}


def test_owned_targets() -> None:
    mode = {
        "config": [
            {"kind": "notify", "entity_id": "已切换离家模式", "domain": "notify", "service": "send_message"},
            {"kind": "security", "entity_id": "armed_away", "domain": "security", "service": "arm"},
            {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"entity_id": "climate.ke_ting", "domain": "climate", "service": "turn_off"},
        ]
    }
    owned = collect_owned_targets(mode)
    check("归属只认设备动作", owned == {"light.all", "climate.ke_ting"}, str(owned))
    check("domain.all 覆盖具体实体", target_covers(owned, "light.ke_ting"))
    check("具体实体覆盖 domain.all（保守）", target_covers({"light.ke_ting"}, "light.all"))
    check("不同域不覆盖", not target_covers({"light.ke_ting"}, "climate.ke_ting"))
    check("通配符覆盖", target_covers({"*"}, "cover.ke_ting"))
    check("空配置不占设备", collect_owned_targets({"config": "not-json"}) == set())


def test_foreign_owners() -> None:
    deps = FakeDeps(
        active=[
            {
                "id": "m-home",
                "name": "回家模式",
                "exclusiveGroup": "default",
                "config": [
                    {"entity_id": "light.ke_ting", "domain": "light", "service": "turn_on"},
                ],
            },
            {
                "id": "m-away",
                "name": "离家模式",
                "exclusiveGroup": "default",
                "config": [
                    {"entity_id": "cover.all", "domain": "cover", "service": "close_cover"},
                ],
            },
            {
                "id": "m-sleep",
                "name": "睡眠模式",
                "exclusiveGroup": "comfort",
                "config": [
                    {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
                ],
            },
        ]
    )
    owners = asyncio.run(foreign_owned_entities(deps, "m-sleep", ["light.ke_ting", "cover.ke_ting", "climate.ke_ting"]))
    check("排除自身后按动作目标归属", owners.get("light.ke_ting") == "回家模式", str(owners))
    check("域整域动作覆盖同域实体", owners.get("cover.ke_ting") == "离家模式", str(owners))
    check("无人认领的设备不出现", "climate.ke_ting" not in owners, str(owners))


def _away_owner_deps(states: dict[str, dict[str, Any]]) -> FakeDeps:
    """「离家模式仍在生效、并控制整域灯光」的最小依赖集。"""
    return FakeDeps(
        active=[
            {
                "id": "m-away",
                "name": "离家模式",
                "exclusiveGroup": "default",
                "config": [{"entity_id": "light.all", "domain": "light", "service": "turn_off"}],
            }
        ],
        states=states,
    )


def test_restore_skips_owned() -> None:
    snapshot = {"light.ke_ting": _light_on(200)}
    mode = {
        "id": "m-sleep",
        "name": "睡眠模式",
        "exclusiveGroup": "comfort",
        "deviceSnapshot": snapshot,
        "config": [{"entity_id": "light.all", "domain": "light", "service": "turn_off"}],
    }
    deps = _away_owner_deps({"light.ke_ting": _light_off()})
    outcome = asyncio.run(restore_mode_snapshot(deps, mode))
    check("归属仲裁跳过被接管设备", outcome["skippedOwned"] == ["light.ke_ting"], str(outcome))
    check("跳过的设备不发出服务调用", deps.calls == [], str(deps.calls))
    check("跳过不计入 attempted", outcome["attempted"] == 0, str(outcome))
    check("跳过不算恢复失败", outcome["incomplete"] is False)
    check("回报占用者名称", outcome["ownedElsewhere"].get("light.ke_ting") == "离家模式")


def test_restore_rollback_ignores_ownership() -> None:
    """激活失败回滚不仲裁：那时要还原的是「本次激活之前」，跳过会把半执行状态留在设备上。"""
    snapshot = {"light.ke_ting": _light_on(200)}
    deps = _away_owner_deps({"light.ke_ting": _light_off()})
    outcome = asyncio.run(restore_mode_snapshot(deps, {"deviceSnapshot": snapshot}, respect_active_owners=False))
    check("回滚路径仍回写设备", deps.calls == [("light", "turn_on", "light.ke_ting")], str(deps.calls))
    check("回滚路径统计 restored", outcome["restored"] == 1, str(outcome))
    check("回滚路径无 skippedOwned", outcome["skippedOwned"] == [])


def test_restore_without_owner() -> None:
    snapshot = {"light.ke_ting": _light_on(120)}
    deps = FakeDeps(states={"light.ke_ting": _light_off()})
    outcome = asyncio.run(restore_mode_snapshot(deps, {"deviceSnapshot": snapshot}))
    check("无占用时正常回放", deps.calls == [("light", "turn_on", "light.ke_ting")], str(deps.calls))
    check("无占用统计 restored", outcome["restored"] == 1, str(outcome))


def test_security_downgrade() -> None:
    check("离家布防不可降级为夜间", is_security_downgrade("armed_away", "armed_night"))
    check("夜间布防可升级为离家", not is_security_downgrade("armed_night", "armed_away"))
    check("同档不算降级", not is_security_downgrade("armed_home", "armed_home"))
    check("撤防算降级", is_security_downgrade("armed_away", "disarmed"))
    check("当前未知不猜", not is_security_downgrade(None, "armed_night"))

    downgrade = {"entity_id": "armed_night", "kind": "security"}
    check(
        "自动触发跳过降级",
        should_skip_security_downgrade(downgrade, "armed_away", "trigger"),
    )
    check(
        "手动切换允许降级",
        not should_skip_security_downgrade(downgrade, "armed_away", "manual"),
    )
    check(
        "强度不变照常执行",
        not should_skip_security_downgrade({"entity_id": "armed_away", "kind": "security"}, "armed_away", "trigger"),
    )


def test_pending_restore_retry() -> None:
    mode = {
        "id": "m-sleep",
        "name": "睡眠模式",
        "isActive": False,
        "exclusiveGroup": "comfort",
        "deviceSnapshot": {"light.ke_ting": _light_on(200)},
        "config": [],
    }
    deps = FakeDeps(modes=[mode], states={"light.ke_ting": _light_off()})
    state = HomeModeActivateState(lambda: None, lambda _mode_id: None)
    result = asyncio.run(deactivate_home_mode(state, deps, "m-sleep"))
    check("停用态残留快照可回放", result.get("retryRestore") is True, str(result))
    check("回放发出设备调用", deps.calls == [("light", "turn_on", "light.ke_ting")], str(deps.calls))
    check("回放成功后清掉快照", deps.deactivated == ["m-sleep"], str(deps.deactivated))
    check("不广播 deactivated（模式本来就没激活）", deps.events == [], str(deps.events))

    offline = FakeDeps(modes=[mode], states={"light.ke_ting": _light_off()}, ha_connected=False)
    failed = asyncio.run(deactivate_home_mode(state, offline, "m-sleep"))
    check("HA 离线时回放失败可见", failed.get("success") is False and failed.get("restoreIncomplete") is True)
    check("HA 离线不清快照", offline.deactivated == [], str(offline.deactivated))
    check("HA 离线提示可重试", "重试" in str(failed.get("message")), str(failed.get("message")))


def test_summarize_pending_restore() -> None:
    modes = [
        {"id": "a", "name": "A", "isActive": True, "deviceSnapshot": {"light.x": _light_on()}},
        {"id": "b", "name": "B", "isActive": False, "deviceSnapshot": {"light.y": _light_on()}},
        {"id": "c", "name": "C", "isActive": False, "deviceSnapshot": None},
    ]
    pending = summarize_pending_restore(modes)
    check(
        "只有「停用态 + 有快照」进待恢复",
        [(item["id"], item["entities"]) for item in pending] == [("b", 1)],
        str(pending),
    )


def test_activation_preview() -> None:
    """激活前预览：点名会被同一批设备覆盖的仍生效模式。"""
    sleep = {
        "id": "m-sleep",
        "name": "睡眠模式",
        "config": [
            {"entity_id": "light.all", "domain": "light", "service": "turn_off"},
            {"kind": "security", "entity_id": "armed_night", "domain": "security", "service": "arm"},
        ],
    }
    active = [
        {"id": "m-sleep", "name": "睡眠模式", "config": sleep["config"]},
        {
            "id": "m-away",
            "name": "离家模式",
            "config": [
                {"entity_id": "light.ke_ting", "domain": "light", "service": "turn_off"},
            ],
        },
        {
            "id": "m-dining",
            "name": "用餐模式",
            "config": [
                {"entity_id": "climate.can_ting", "domain": "climate", "service": "turn_on"},
            ],
        },
    ]
    preview = build_activation_preview(sleep, active)
    conflicts = {item["modeName"]: item["entities"] for item in preview["conflicts"]}
    check("自身不算冲突", "睡眠模式" not in conflicts, str(conflicts))
    check("整域动作与具体实体判为冲突", conflicts.get("离家模式") == ["light.all"], str(conflicts))
    check("不同域不算冲突", "用餐模式" not in conflicts, str(conflicts))
    check("预览给出布防目标", preview["securityTarget"] == "armed_night", str(preview))
    check("无激活模式时无冲突", build_activation_preview(sleep, [])["conflicts"] == [])
    check("模式缺失时安全兜底", build_activation_preview(None, active)["conflicts"] == [])


def test_presence_rules() -> None:
    """离家（家里没人）与睡眠必须互斥：准入拦住，激活后退场。"""
    away = {
        "id": "m-away",
        "name": "离家模式",
        "exclusiveGroup": "default",
        "config": [{"kind": "security", "entity_id": "armed_away"}],
        "triggers": [{"type": "all_leave"}],
    }
    sleep = {
        "id": "m-sleep",
        "name": "睡眠模式",
        "exclusiveGroup": "comfort",
        "config": [{"entity_id": "light.all", "domain": "light", "service": "turn_off"}],
        "triggers": [{"type": "time", "at": "22:30"}],
    }
    home = {"id": "m-home", "name": "回家模式", "exclusiveGroup": "default", "config": []}

    check("布防 armed_away 判为离家", mode_implies_away(away))
    check("只有 all_leave 触发器也判为离家", mode_implies_away({"id": "x", "triggers": [{"type": "all_leave"}]}))
    check(
        "关掉 all_leave 触发器不算离家",
        not mode_implies_away({"id": "x", "triggers": [{"type": "all_leave", "enabled": False}]}),
    )
    check("睡眠不是离家", not mode_implies_away(sleep))
    # 回家模式（空 config / 无 all_leave 触发器）不得被判为「家里没人」——
    # 这条原先漏了断言，变量 `home` 建了却没用（ruff F841）。
    check("回家模式不是离家", not mode_implies_away(home))

    check("离家生效时自动触发的睡眠被拦", find_blocking_away_mode(sleep, [away], "trigger") is not None)
    check("手动切换不受离家限制", find_blocking_away_mode(sleep, [away], "manual") is None)
    check("离家自己不被拦", find_blocking_away_mode(away, [away], "trigger") is None)
    check("没有离家时不拦", find_blocking_away_mode(sleep, [], "trigger") is None)
    # 回家必须能结束离家：开锁进门被拦会让「回家回不来」。
    check(
        "到家类模式可以结束离家",
        find_blocking_away_mode(
            {
                "id": "m-home",
                "exclusiveGroup": "default",
                "triggers": [{"type": "lock_unlock", "entityId": "lock.da_men"}],
                "config": [{"kind": "security", "entity_id": "armed_home"}],
            },
            [away],
            "trigger",
        )
        is None,
    )

    evictions = collect_evictions(away, [away, sleep])
    check("离家和睡眠不能共存：激活离家要退掉睡眠", [m["id"] for m in evictions] == ["m-sleep"], str(evictions))
    check("离家自己不在退场列表", all(m["id"] != "m-away" for m in evictions))

    deps = FakeDeps()
    result = away_conflict_result(deps, sleep, "m-sleep", {"source": "trigger"}, away)
    check("拦截结果按「跳过」而非失败", result["skipped"] is True and result["success"] is True, str(result))
    check("拦截结果可解释", "离家模式" in str(result["message"]), str(result["message"]))
    check("拦截留下触发日志", deps.trigger_logs and deps.trigger_logs[0]["reason"] == "away_mode_active")


def test_single_active_evictions() -> None:
    """现实模型：家只有一个状态，活动可以叠加。

    - 离家：全部退场（没人还在看电影不合理）；
    - 回家 / 睡眠：只退其它基础态，保留叠加活动；
    - 用餐 / 影音（overlay）：只退其它活动，基础态不受影响；
    - 关掉单选：只有离家仍强制退场。
    """
    away = {
        "id": "m-away",
        "name": "离家模式",
        "exclusiveGroup": "default",
        "config": [{"kind": "security", "entity_id": "armed_away"}],
    }
    sleep = {"id": "m-sleep", "name": "睡眠模式", "exclusiveGroup": "default", "config": []}
    dining = {"id": "m-dining", "name": "用餐模式", "exclusiveGroup": "overlay", "config": []}
    cinema = {"id": "m-cinema", "name": "影音模式", "exclusiveGroup": "overlay", "config": []}

    check("离家退掉基础态", [m["id"] for m in collect_evictions(away, [away, sleep])] == ["m-sleep"])
    check("离家也退掉叠加活动", [m["id"] for m in collect_evictions(away, [away, dining])] == ["m-dining"])
    check("回家只退基础态、保留叠加活动", collect_evictions(sleep, [sleep, dining]) == [])
    check("叠加活动只退其它活动", [m["id"] for m in collect_evictions(dining, [sleep, dining, cinema])] == ["m-cinema"])

    state: dict[str, Any] = {"deactivated": [], "notes": [], "active": [away, sleep, dining]}
    targets = {"m-away": away, "m-home": sleep, "m-dining": dining}

    async def find_mode(mode_id: str) -> dict[str, Any] | None:
        return targets.get(mode_id)

    async def get_active() -> list[dict[str, Any]]:
        return state["active"]

    async def deactivate(mode_id: str) -> dict[str, Any]:
        state["deactivated"].append(mode_id)
        state["active"] = [m for m in state["active"] if m["id"] != mode_id]
        return {"success": True}

    async def notify(_level: str, message: str, _source: str) -> None:
        state["notes"].append(message)

    evicted = asyncio.run(
        evict_other_modes("m-away", find_mode, get_active, deactivate, notify, {"singleActiveMode": True})
    )
    check("离家生效后退掉睡眠与用餐", evicted == ["睡眠模式", "用餐模式"], str(evicted))
    check("退出调用了正确的模式 id", state["deactivated"] == ["m-sleep", "m-dining"], str(state["deactivated"]))
    check("退出有用户可见说明", any("睡眠模式" in note for note in state["notes"]), str(state["notes"]))

    # 叠加活动激活时不动基础态：吃饭不该把「回家」的玄关灯回滚掉。
    state.update(deactivated=[], active=[sleep, dining, cinema])
    evicted = asyncio.run(
        evict_other_modes("m-dining", find_mode, get_active, deactivate, notify, {"singleActiveMode": True})
    )
    check("叠加活动只退其它活动", evicted == ["影音模式"], str(evicted))
    check("叠加活动不退基础态", "m-sleep" not in state["deactivated"], str(state["deactivated"]))

    # 关掉单选：回家不再强制清场，但离家仍然清场。
    state.update(deactivated=[], active=[sleep, dining])
    evicted = asyncio.run(
        evict_other_modes("m-home", find_mode, get_active, deactivate, notify, {"singleActiveMode": False})
    )
    check("关掉单选后基础态可并存", evicted == [] and state["deactivated"] == [], str(evicted))
    state.update(deactivated=[], active=[away, dining])
    evicted = asyncio.run(
        evict_other_modes("m-away", find_mode, get_active, deactivate, notify, {"singleActiveMode": False})
    )
    check("关掉单选后离家仍清场", evicted == ["用餐模式"], str(evicted))


def test_presence_condition_source() -> None:
    """presence 条件必须真的能求值：deps 没有 get_presence_context 时它永远不成立。"""
    mode = {
        "id": "m-sleep",
        "name": "睡眠模式",
        "conditions": [{"type": "presence", "atHome": True}],
    }
    deps = FakeDeps()
    deps.presence = {"atHome": True}
    ok, unmet = asyncio.run(check_mode_conditions(deps, mode))
    check("有人在家时 presence 条件成立", ok and unmet == [], str((ok, unmet)))

    deps.presence = {"atHome": False}
    ok, unmet = asyncio.run(check_mode_conditions(deps, mode))
    check("无人在家时 presence 条件不成立", not ok and unmet == [0], str((ok, unmet)))

    # 未注入在场服务：按「不知道」处理 → 保守不执行，但绝不能静默当成满足。
    deps.presence = {}
    ok, _unmet = asyncio.run(check_mode_conditions(deps, mode))
    check("读取不到在场数据时不执行", not ok)


def test_settle_keeps_devices() -> None:
    """自动回落：模式结束但设备保持现状（「回家」开的灯不该被关掉）。"""
    mode = {
        "id": "m-home",
        "name": "回家模式",
        "isActive": True,
        "exclusiveGroup": "default",
        "settleMinutes": 20,
        "deviceSnapshot": {"light.ke_ting": _light_on(200)},
        "config": [{"entity_id": "light.ke_ting", "domain": "light", "service": "turn_on"}],
    }
    deps = FakeDeps(modes=[mode], active=[mode], states={"light.ke_ting": _light_on(200)})
    state = HomeModeActivateState(lambda: "m-home", lambda _mode_id: None)
    result = asyncio.run(settle_home_mode(state, deps, "m-home"))
    check("回落成功且标记 settled", result.get("settled") is True and result.get("success") is True, str(result))
    check("回落不发设备调用（不关灯）", deps.calls == [], str(deps.calls))
    check("回落清掉同组激活标记", deps.cleared and deps.cleared[0][0] == ["m-home"], str(deps.cleared))
    check("回落同时清掉快照（不留孤儿）", deps.cleared[0][1] is False, str(deps.cleared))
    check("回落广播 deactivated", deps.events and deps.events[0][0] == "homeMode.deactivated")
    check("回落事件标记 settled", (deps.events[0][1] or {}).get("settled") is True)
    check("回落写触发日志", deps.trigger_logs and deps.trigger_logs[0]["source"] == "auto_settle")
    check("回落文案含分钟数", "20" in str(result.get("message")), str(result.get("message")))

    deps2 = FakeDeps(modes=[{**mode, "isActive": False}], active=[])
    idle = asyncio.run(settle_home_mode(state, deps2, "m-home"))
    check("不在生效时不回落", idle.get("settled") is None and deps2.cleared == [])


def test_settle_persistence_fields() -> None:
    """settleMinutes 必须能落库并读回，否则回落配置只在本次请求生效。"""
    fields = normalize_mode_fields({"name": "回家", "config": [], "settleMinutes": 20})
    row = build_mode_row(fields)
    check("写入时落到 settle_minutes", row["settle_minutes"] == 20, str(row["settle_minutes"]))
    check(
        "缺省为 0（不回落）", build_mode_row(normalize_mode_fields({"name": "x", "config": []}))["settle_minutes"] == 0
    )


def main() -> None:
    test_owned_targets()
    test_foreign_owners()
    test_restore_skips_owned()
    test_restore_rollback_ignores_ownership()
    test_restore_without_owner()
    test_security_downgrade()
    test_pending_restore_retry()
    test_summarize_pending_restore()
    test_activation_preview()
    test_presence_rules()
    test_presence_condition_source()
    test_single_active_evictions()
    test_settle_keeps_devices()
    test_settle_persistence_fields()
    report("家庭模式归属仲裁")


if __name__ == "__main__":
    main()
