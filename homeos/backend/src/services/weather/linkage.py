"""极端天气安全联动（对齐 ``weather/weather-auto-linkage.service.ts``）。

监听 ``weather.alert`` 事件：

- 按等级门槛过滤（默认 ≥ 橙色）；
- 冷却去重（``weather:`` 命名空间，默认 120 分钟）；
- 红色预警执行安全联动（HA 场景 ``turn_on`` + 家庭模式激活）；
- 联动动作失败经 ``scheduleSecurityEvent`` 写入安全事件审计。
"""

from __future__ import annotations

import logging
from typing import Any

from ...core.entity_domain import get_entity_domain
from ..security.layout import schedule_security_event
from .watch import LEVEL_PRIORITY, alert_dedup_key

logger = logging.getLogger("homeos.weather.linkage")


class WeatherAutoLinkageService:
    """极端天气安全联动服务。"""

    def __init__(
        self,
        *,
        app_config: Any,
        session_factory: Any,
        cooldown_service: Any,
        ha_connector: Any,
        home_mode: Any,
        notification: Any,
    ) -> None:
        self._app_config = app_config
        self._session_factory = session_factory
        self._cooldown = cooldown_service
        self._ha_connector = ha_connector
        self._home_mode = home_mode
        self._notification = notification

    def _external_cfg(self) -> dict[str, Any]:
        value = self._app_config.get("external")
        return value if isinstance(value, dict) else {}

    # ------------------------------------------------------------------ #
    # 事件处理
    # ------------------------------------------------------------------ #
    async def on_weather_alert(self, payload: Any) -> None:
        """``weather.alert`` 事件处理器：门槛过滤 → 红色预警安全联动。"""
        if not isinstance(payload, dict) or not payload.get("alert"):
            return
        cfg = self._external_cfg()
        if cfg.get("weatherAlertEnabled") is False:
            return

        alert = payload.get("alert") or {}
        level = str(alert.get("level") or payload.get("level") or "yellow")
        priority = LEVEL_PRIORITY.get(level, LEVEL_PRIORITY["yellow"])

        threshold_priority = LEVEL_PRIORITY.get(
            str(cfg.get("weatherAlertNotifyLevel") or ""), LEVEL_PRIORITY["orange"]
        )
        if priority < threshold_priority:
            return

        key = f"alert:{alert_dedup_key(alert)}"
        if self._cooldown.is_in_cooldown("weather", key):
            return

        reason = f"极端天气 {alert.get('type') or alert.get('title')}（{level}）"
        acted = False

        # 红色预警执行安全联动（关窗 / 拉帘 / 布防场景 + 家庭模式）
        if priority >= LEVEL_PRIORITY["red"]:
            scene_id = str(cfg.get("weatherAlertSceneId") or "").strip()
            if scene_id:
                acted = (await self.run_scene(scene_id, reason)) or acted
            mode_id = str(cfg.get("weatherAlertModeId") or "").strip()
            if mode_id:
                acted = (await self.activate_mode(mode_id, reason)) or acted

        if acted:
            try:
                cooldown_min = float(cfg.get("weatherAlertCooldownMin") or 120)
            except (TypeError, ValueError):
                cooldown_min = 120.0
            self._cooldown.set_cooldown("weather", key, cooldown_min)
            await self._notification.notify(
                "warn",
                f"{reason}：已自动执行安全联动",
                "weather-linkage",
                key,
                {"channels": ["in_app", "socket"]},
            )

    # ------------------------------------------------------------------ #
    # 联动动作
    # ------------------------------------------------------------------ #
    async def run_scene(self, scene_id: str, reason: str) -> bool:
        if not scene_id:
            return False
        try:
            await self._ha_connector.call_service(
                get_entity_domain(scene_id) or "scene", "turn_on", scene_id, {}
            )
            logger.info("天气联动:已执行场景 %s(%s)", scene_id, reason)
            return True
        except Exception as exc:  # noqa: BLE001
            schedule_security_event(
                self._session_factory,
                "linkage_weather_scene_failed",
                f"天气联动场景失败 [{scene_id}]: {exc}",
            )
            return False

    async def activate_mode(self, mode_id: str, reason: str) -> bool:
        if not mode_id:
            return False
        try:
            await self._home_mode.activate(
                mode_id, {"source": "weather_linkage", "reason": reason}
            )
            logger.info("天气联动:已激活家庭模式 %s(%s)", mode_id, reason)
            return True
        except Exception as exc:  # noqa: BLE001
            schedule_security_event(
                self._session_factory,
                "linkage_weather_mode_failed",
                f"天气联动家庭模式失败 [{mode_id}]: {exc}",
            )
            return False

    # ------------------------------------------------------------------ #
    # 诊断快照
    # ------------------------------------------------------------------ #
    def get_status(self) -> dict[str, Any]:
        cfg = self._external_cfg()
        gaps: list[str] = []
        scene_id = str(cfg.get("weatherAlertSceneId") or "").strip()
        mode_id = str(cfg.get("weatherAlertModeId") or "").strip()
        if cfg.get("weatherAlertEnabled") is False:
            gaps.append("天气预警联动未开启")
        elif not scene_id and not mode_id:
            gaps.append("未配置红色预警联动场景或家庭模式（高级参数 → 外部集成 → 天气 API）")
        try:
            cooldown_min = int(cfg.get("weatherAlertCooldownMin") or 120)
        except (TypeError, ValueError):
            cooldown_min = 120
        return {
            "enabled": cfg.get("weatherAlertEnabled") is not False,
            "notifyLevel": cfg.get("weatherAlertNotifyLevel") or "orange",
            "sceneId": str(cfg.get("weatherAlertSceneId") or ""),
            "modeId": str(cfg.get("weatherAlertModeId") or ""),
            "cooldownMin": cooldown_min,
            "gaps": gaps,
        }


__all__ = ["WeatherAutoLinkageService"]
