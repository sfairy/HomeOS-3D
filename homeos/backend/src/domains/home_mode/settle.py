"""家庭模式的「自动回落」（从 ``actions.py`` 拆出）。

「回家」是一次性过渡动作：进门开灯、调温、居家布防之后，家就进入「日常」，
不该让一个模式永久挂在 header 上。回落与「停用」只差一个语义：

- **停用**（``deactivate_home_mode``）：按激活前快照还原设备；
- **回落**（这里）：只清激活标记与快照，**设备保持现状**。

拆成独立模块是因为它属于生命周期终点，与激活的四阶段编排不是同一类知识，
而 ``actions.py`` 已被文件规模棘轮锁住。
"""

from __future__ import annotations

from typing import Any

from .actions import HomeModeActivateState, HomeModeDeactivateResult


async def settle_home_mode(state: HomeModeActivateState, deps: Any, mode_id: str) -> HomeModeDeactivateResult:
    """让过渡模式到期失效：清激活标记与快照，不还原设备。

    快照必须一起清：回落不还原设备，留着快照只会变成无法解释的「待恢复设备」。
    回落是正常生命周期终点，不是失败 —— 日志记成功、不触发回滚、不发 warning。
    """
    mode = await deps.find_mode(mode_id)
    if mode is None or not mode.get("isActive"):
        return {"success": True, "modeId": mode_id, "active": False, "message": "模式已不在生效"}
    group = mode.get("exclusiveGroup") or "default"
    active_modes = await deps.list_active_modes()
    group_ids = [m["id"] for m in active_modes if (m.get("exclusiveGroup") or "default") == group]
    await deps.clear_group_active(group_ids, False)
    still_active = await deps.find_first_active()
    state.set_active_mode_id(still_active["id"] if still_active else None)
    if not still_active:
        deps.linkage_arbiter.release()
    minutes = int(mode.get("settleMinutes") or 0)
    message = f"「{mode['name']}」{minutes} 分钟已到，自动回落（设备保持现状）"
    deps.push_trigger_log(
        {"modeId": mode_id, "modeName": mode["name"], "source": "auto_settle", "reason": message, "success": True}
    )
    await deps.emit_home_mode_event(
        "homeMode.deactivated",
        {
            "modeId": mode_id,
            "exclusiveGroup": group,
            "settled": True,
            "remainingActiveModeIds": [m["id"] for m in await deps.list_active_modes() if m["id"] != mode_id],
        },
    )
    deps.log(f"模式 {mode['name']} 自动回落，设备保持当前状态")
    return {
        "success": True,
        "modeId": mode_id,
        "modeName": mode["name"],
        "active": False,
        "settled": True,
        "exclusiveGroup": group,
        "message": message,
    }


__all__ = ["settle_home_mode"]
