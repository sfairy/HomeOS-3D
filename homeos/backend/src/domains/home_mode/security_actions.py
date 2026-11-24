"""家庭模式的安防动作执行（布防降级保护）。

从 ``actions.py`` 拆出：这段是「布防强度策略 + 串行执行」的组合，与激活的
两阶段提交无关；放在一起会让激活编排被安全策略淹没。

## 为什么不允许自动降级

默认预置里「离家模式」布防 ``armed_away``、「睡眠模式」定时 22:30 布防
``armed_night``，两者分属不同互斥组。没有这条保护时，无人在家会被 22:30 的定时
静默降级成夜间警戒 —— 这是安防级别的问题，不是界面问题。

手动切换是用户的明确意图（回家后主动降级是合法操作），所以只拦非手动来源。
"""

from __future__ import annotations

from typing import Any

from .presets import is_security_downgrade
from ..security.zones import security_mode_label


def should_skip_security_downgrade(action: dict[str, Any], current: str | None, source: str | None) -> bool:
    """该安防动作是否会降低当前布防强度（自动来源才拦）。"""
    if str(source or "") == "manual":
        return False
    return is_security_downgrade(current, str(action.get("entity_id") or "").strip())


def _skipped_result(action: dict[str, Any], held: str) -> dict[str, Any]:
    """被降级保护跳过的动作：成功但标记 ``skipped``（不计失败、不触发回滚）。"""
    return {
        "entity_id": str(action.get("entity_id") or ""),
        "service": "security.arm",
        "success": True,
        "skipped": "security_armed_stricter",
        "reason": f"当前布防 {held} 更强，自动触发不降级",
    }


async def run_security_actions(
    deps: Any,
    *,
    mode_name: str,
    current_mode: str | None,
    source: str | None,
    configs: list[dict[str, Any]],
    execute: Any,
) -> list[dict[str, Any]]:
    """串行执行安防动作（必须先行且不并发：否则最终模式取决于最后一次 ``set_mode``）。

    Args:
        deps: 领域依赖（只需 ``warn`` / ``notify``）。
        mode_name: 模式名（日志与通知用）。
        current_mode: 执行前的布防档位，用于判定降级。
        source: 触发来源（``manual`` 允许降级）。
        configs: 本次要执行的安防动作。
        execute: 执行单条动作的协程（由 ``actions`` 注入，避免循环依赖）。
    """
    results: list[dict[str, Any]] = []
    held: str | None = None
    for config in configs:
        if should_skip_security_downgrade(config, current_mode, source):
            held = str(current_mode or "")
            deps.warn(f"模式 {mode_name} 的安防动作 {config.get('entity_id')} 会降级 {held}，已跳过")
            results.append(_skipped_result(config, held))
            continue
        results.append(await execute(config))
    if held:
        await deps.notify(
            "info",
            f"模式 {mode_name} 已应用，但安防保持「{security_mode_label(held)}」：自动触发不会降低布防等级",
            "home-mode",
        )
    return results


__all__ = ["run_security_actions", "should_skip_security_downgrade"]
