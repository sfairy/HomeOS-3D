"""安防告警文案构造（对齐 ``@homeos/shared`` setup/hazard-config.util.ts 的
``formatSecurityAlarmMessage`` / ``summarizeHazardActionFailures``）。
"""

from __future__ import annotations

from typing import Any


def format_security_alarm_message(data: dict[str, Any] | None) -> str:
    """根据安防告警事件参数构造中文告警消息文本（含类型分支 + 联动失败说明拼接）。"""
    data = data or {}
    name = data.get("friendlyName") or data.get("entityId") or "传感器"
    alarm_type = data.get("type")
    if alarm_type == "smoke":
        base = f"烟雾告警：{name} 检测到烟雾，请立即检查"
    elif alarm_type == "gas_leak":
        base = f"燃气泄漏：{name} 触发告警，请立即通风并检查燃气阀"
    elif alarm_type == "water_leak":
        base = f"漏水告警：{name} 检测到漏水，水阀已尝试自动关闭"
    elif data.get("message"):
        base = str(data.get("message"))
    else:
        zone = f" ({data.get('zoneNames')})" if data.get("zoneNames") else ""
        base = f"{name} 触发告警{zone}"
    failures = data.get("actionFailures")
    if isinstance(failures, list) and failures:
        base += f"（联动失败：{'、'.join(str(item) for item in failures)}）"
    return base


def summarize_hazard_action_failures(results: list[dict[str, Any]] | None) -> list[str]:
    """汇总联动动作执行结果，返回失败项的可读描述（``target(关阀|排风)``）。"""
    out: list[str] = []
    for result in results or []:
        if result.get("ok"):
            continue
        action = "关阀" if result.get("action") == "close_valve" else "排风"
        out.append(f"{result.get('target')}({action})")
    return out


__all__ = ["format_security_alarm_message", "summarize_hazard_action_failures"]
