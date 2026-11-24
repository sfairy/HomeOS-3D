"""在场互斥：离家（家里没人）与「活动型模式」不该同时生效。

## 为什么需要它

互斥组只保证**同组**至多一条激活，而「离家」和「睡眠」分属 ``default`` / ``comfort``
两个组：离家布防 ``armed_away`` 之后，22:30 的睡眠定时照常触发并布防 ``armed_night`` ——
家里没人却挂着睡眠模式。反过来，睡眠生效时激活离家，睡眠也不会退场，界面上同时勾选。

这条约束无法用互斥组表达（它是跨组依赖），所以单独成规则，两条方向各管一半：

1. **准入**：离家（含度假等布防 away 的模式）生效期间，跨组的目标模式一律不激活；
   同组的目标会由正常的「同组互斥」顶掉离家，不需要在这里拦。
2. **退场**：离家类模式激活成功后，其它激活中的模式全部退出 —— 家里没人时，
   睡眠 / 影音 / 用餐都不该继续存在。

判定「离家类」只认模式自己的动作与触发器（布防 ``armed_away`` / ``all_leave`` 触发），
不依赖在场感知是否配置：默认安装没人配 person 实体，靠在场数据判会永远判不出来。
"""

from __future__ import annotations

import logging
from typing import Any

from .presets import resolve_action_kind

logger = logging.getLogger("homeos.home_mode.presence_rules")

#: 离家类模式的「家里没人」布防档位。
AWAY_SECURITY_TARGET = "armed_away"

#: 到家类模式的「有人回家」布防档位（结束离家状态）。
ARRIVAL_SECURITY_TARGET = "armed_home"

#: 叠加组：这一组是「活动」（用餐 / 影音），叠在基础状态之上，退出后回到基础态。
#: 它**不参与**单选退场 —— 吃饭不该把「回家」的玄关灯关掉。
OVERLAY_GROUP = "overlay"


def is_overlay(mode: dict[str, Any] | None) -> bool:
    """该模式是否是「叠加活动」而不是「家状态」。"""
    return str((mode or {}).get("exclusiveGroup") or "").strip().lower() == OVERLAY_GROUP


def mode_implies_away(mode: dict[str, Any] | None) -> bool:
    """该模式是否表达「家里没人」。

    两个判据任一成立即可：

    - 动作里布防 ``armed_away``（离家 / 度假 / 自定义外出模式）；
    - 触发器里挂了 ``all_leave``（全员离家自动执行）。

    ``enabled: false`` 的触发器不算 —— 用户关掉它就是在说「别再用这条判离家」。
    """
    if not isinstance(mode, dict):
        return False
    actions = mode.get("config")
    if isinstance(actions, list) and any(
        isinstance(action, dict)
        and resolve_action_kind(action) == "security"
        and str(action.get("entity_id") or "").strip() == AWAY_SECURITY_TARGET
        for action in actions
    ):
        return True
    triggers = mode.get("triggers")
    return isinstance(triggers, list) and any(
        isinstance(trigger, dict) and trigger.get("type") == "all_leave" and trigger.get("enabled") is not False
        for trigger in triggers
    )


def mode_implies_arrival(mode: dict[str, Any] | None) -> bool:
    """该模式是否表达「有人到家」（可以结束离家状态）。

    判据只看模式自己的配置，不看在场感知：

    - 触发器里有 ``lock_unlock`` / ``arrive_home``（开锁 / 有人进门）；
    - 或安防动作布防 ``armed_home``（到家撤为居家布防）。

    没有这条区分，「全员离家后开锁进门」会被当成普通模式激活而被离家拦住 ——
    回家反而回不去。
    """
    if not isinstance(mode, dict):
        return False
    triggers = mode.get("triggers")
    if isinstance(triggers, list) and any(
        isinstance(trigger, dict)
        and trigger.get("enabled") is not False
        and trigger.get("type") in ("lock_unlock", "arrive_home")
        for trigger in triggers
    ):
        return True
    actions = mode.get("config")
    return isinstance(actions, list) and any(
        isinstance(action, dict)
        and resolve_action_kind(action) == "security"
        and str(action.get("entity_id") or "").strip() == ARRIVAL_SECURITY_TARGET
        for action in actions
    )


def find_blocking_away_mode(
    target_mode: dict[str, Any] | None,
    active_modes: list[dict[str, Any]] | None,
    source: str | None = None,
) -> dict[str, Any] | None:
    """准入判定：返回拦住本次激活的离家类模式（``None`` 表示可以激活）。

    真实场景的三条边界：

    - **用户手动切换**永远放行（明确意图，例如远程切模式）；
    - **到家类模式**放行 —— 开锁进门必须能结束离家，否则回家回不来；
    - 其余（睡眠 / 用餐 / 影音…）在离家生效期间不自动激活：无人在家还执行
      「22:30 关灯布防夜间」既不合理，也会把在外布防降级。
    """
    if str(source or "") == "manual":
        return None
    if not isinstance(target_mode, dict) or mode_implies_away(target_mode) or mode_implies_arrival(target_mode):
        return None
    target_id = str(target_mode.get("id") or "")
    for active in active_modes or []:
        if not isinstance(active, dict) or str(active.get("id")) == target_id:
            continue
        if mode_implies_away(active):
            return active
    return None


def collect_evictions(
    target_mode: dict[str, Any] | None, active_modes: list[dict[str, Any]] | None
) -> list[dict[str, Any]]:
    """目标模式激活成功后需要退场的模式。

    规则贴合现实中的「家只有一个状态，活动可以叠加」：

    - **离家 / 度假**（家里没人）：其余模式全部退场（没人还在看电影不合理）；
    - **基础态**（回家 / 睡眠）：只退其它基础态，保留正在进行的叠加活动；
    - **叠加活动**（用餐 / 影音）：只退其它活动，基础态不受影响。
    """
    target = target_mode or {}
    target_id = str(target.get("id") or "")
    away = mode_implies_away(target)
    target_overlay = is_overlay(target)
    evictions: list[dict[str, Any]] = []
    for mode in active_modes or []:
        if not isinstance(mode, dict) or str(mode.get("id")) == target_id:
            continue
        if away or target_overlay == is_overlay(mode):
            evictions.append(mode)
    return evictions


async def evict_other_modes(
    mode_id: str,
    find_mode: Any,
    get_active_modes: Any,
    deactivate: Any,
    notify: Any,
    cfg: dict[str, Any] | None = None,
) -> list[str]:
    """激活成功后退出其余模式；返回被退出的模式名。

    两种情形会退场：

    - **单选（默认）**：``homeMode.singleActiveMode`` 为真时，家只有一个当前状态
      —— 到家后再点睡眠，回家模式就该退场，而不是两个勾并列挂在 header 上；
    - **离家兜底**：即使关掉单选，离家/度假生效时其它模式也必须退场（家里没人时
      睡眠、影音不该继续存在）。

    必须在转换锁**之外**调用（``deactivate`` 也要拿同一把锁，嵌套会自锁），所以由
    ``HomeModeService.activate`` 在编排返回后调用。

    设备不会互相踩：离家已经接管 ``light.all`` 之后，被退出模式的快照回放会被归属
    仲裁跳过，不会出现「家里没人灯却亮了」。
    """
    mode = await find_mode(mode_id)
    single = bool((cfg or {}).get("singleActiveMode", True))
    if not single and not mode_implies_away(mode):
        return []
    evicted: list[str] = []
    for other in collect_evictions(mode, await get_active_modes()):
        name = str(other.get("name") or other.get("id") or "?")
        try:
            outcome = await deactivate(str(other.get("id")))
        except Exception as exc:  # 单条失败不能连累其余模式退场
            logger.warning("激活模式下退出模式失败(%s): %s", name, exc)
            continue
        if isinstance(outcome, dict) and outcome.get("restoreIncomplete"):
            logger.warning("激活模式下退出模式(%s)未完全恢复，快照已保留可重试", name)
        evicted.append(name)
    if evicted:
        logger.info("模式「%s」生效，已退出：%s", (mode or {}).get("name"), "、".join(evicted))
        await notify(
            "info",
            f"「{(mode or {}).get('name')}」已生效，以下模式随之退出：{'、'.join(evicted)}",
            "home-mode",
        )
    return evicted


def away_conflict_result(
    deps: Any,
    mode: dict[str, Any],
    mode_id: str,
    meta: dict[str, Any] | None,
    away_mode: dict[str, Any],
) -> dict[str, Any]:
    """被离家拦截时的结果：按「跳过」而非「失败」返回，并写一条可解释的触发日志。

    跳过语义很重要：定时到点的睡眠在无人在家时不执行是**正常行为**，不该让执行历史
    出现一条失败，也不该让用户以为是设备出了问题。
    """
    away_name = str(away_mode.get("name") or away_mode.get("id") or "离家模式")
    message = f"「{away_name}」正在生效（家里没人），「{mode['name']}」本次不会激活"
    deps.log(f"模式 {mode['name']} 因「{away_name}」生效而跳过激活")
    deps.push_trigger_log(
        {
            "modeId": mode_id,
            "modeName": mode["name"],
            "source": (meta or {}).get("source") or "manual",
            "reason": "away_mode_active",
            "success": True,
        }
    )
    return {
        "success": True,
        "modeId": mode_id,
        "modeName": mode["name"],
        "active": False,
        "skipped": True,
        "reason": "away_mode_active",
        "conflictingMode": away_name,
        "message": message,
        "executed": 0,
        "total": 0,
    }


__all__ = [
    "ARRIVAL_SECURITY_TARGET",
    "AWAY_SECURITY_TARGET",
    "OVERLAY_GROUP",
    "away_conflict_result",
    "collect_evictions",
    "evict_other_modes",
    "find_blocking_away_mode",
    "is_overlay",
    "mode_implies_arrival",
    "mode_implies_away",
]
