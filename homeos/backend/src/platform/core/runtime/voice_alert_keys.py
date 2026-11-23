"""「通知来源 → 语音告警开关」的映射（无领域依赖）。

放在 ``platform`` 而不是 ``domains/awareness``：``domains.notification`` 要用它决定
「这条通知该不该播报」，而 ``notification`` 与 ``awareness`` 之间已经存在包级循环
（``check:backend-deps`` B4），任何互相 import 都会立刻失败。

这里只做纯映射，不读配置、不认识默认值 —— 默认矩阵仍由 ``app_config.defaults`` 与
``awareness.voice_alerts`` 拥有。
"""

from __future__ import annotations

#: 通知来源 → 语音告警开关键；``None`` 表示该来源不参与语音播报。
SOURCE_VOICE_KEYS: dict[str, str | None] = {
    "security": "securityZone",
    "security-zone": "securityZone",
    "emergency": "securityEmergency",
    "water-monitor": "safetyWater",
    "water": "waterAnomaly",
    "energy-anomaly": "energyAnomaly",
    "energy-budget": "energyBudget",
    "energy-balance": "energyBudget",
    "environment-health": "envMoldRisk",
    "presence": "presenceLeft",
    "earthquake": "notificationDanger",
    "earthquake-eew": "notificationDanger",
    "earthquake-catalog": "notificationDanger",
    "home-mode": None,
    "automation": None,
    "device-timer": None,
    "advisor": None,
    "system": None,
}


def voice_alert_key(source: str, level: str) -> str | None:
    """通知来源 + 级别 → 语音告警开关键（``None`` = 不参与播报）。

    ``danger`` 级在没有专门映射时按 ``notificationDanger`` 处理：危险通知默认播报，
    与「静音不能挡掉真正的告警」是同一条原则。
    """
    text = str(source or "").strip().lower()
    if text in SOURCE_VOICE_KEYS:
        return SOURCE_VOICE_KEYS[text]
    if level == "danger":
        return "notificationDanger"
    if level in ("warn", "warning"):
        return "notificationWarn"
    return None


__all__ = ["SOURCE_VOICE_KEYS", "voice_alert_key"]
