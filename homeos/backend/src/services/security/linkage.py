"""安防跨模块联动（对齐 ``SecurityLinkageService``）。

挂载 presence / calendar / security.modeChanged 等事件上的联动逻辑：
- 全员离家 → 自动布防 armed_away（或升级既有 armed_home/night）；
- 首人到家 → 切换为 armed_home；
- 日历外出时段 → 自动布防 / 恢复居家；
- 安防模式变更 → 联动家庭模式 + 离家模拟启停。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from .bus import LocalEventBus
from .layout import load_active_project_layout, schedule_security_event
from .zones import resolve_home_mode_link_for_security_change

logger = logging.getLogger("homeos.security.linkage")


class SecurityLinkageService:
    def __init__(
        self,
        session_factory,
        bus: LocalEventBus,
        panel,
        away_sim,
        home_mode,
        config_reader: Callable[[], dict[str, Any]],
    ) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._panel = panel
        self._away_sim = away_sim
        self._home_mode = home_mode
        self._config = config_reader

        bus.on("presence.everyoneLeft", self._on_everyone_left)
        bus.on("presence.changed", self._on_presence_changed)
        bus.on("calendar.awayChanged", self._on_calendar_away)
        bus.on("security.modeChanged", self._on_security_mode_changed)

    def _log_linkage_failure(self, event_type: str, detail: str, mode: str | None = None) -> None:
        schedule_security_event(
            self._session_factory, event_type, detail, mode=mode or self._panel.get_mode()
        )

    async def _load_security_mode_links(self) -> dict[str, str]:
        try:
            project_id, layout = await asyncio.to_thread(
                load_active_project_layout, self._session_factory
            )
            links = layout.get("securityModeLinks")
            if (not isinstance(links, dict)) and project_id != "default":
                from .layout import load_project_layout_json

                def _load_default() -> dict[str, Any]:
                    with self._session_factory() as session:
                        return load_project_layout_json(session, "default")

                default_layout = await asyncio.to_thread(_load_default)
                links = default_layout.get("securityModeLinks")
            return {str(k): str(v) for k, v in links.items()} if isinstance(links, dict) else {}
        except Exception:
            return {}

    # ------------------------------------------------------------------ #
    # 事件处理
    # ------------------------------------------------------------------ #
    async def _on_everyone_left(self, _payload: Any = None) -> None:
        cfg = self._config()
        if not cfg.get("autoArmOnEveryoneLeft") and not cfg.get(
            "autoUpgradeToAwayOnEveryoneLeft"
        ):
            return

        current = self._panel.get_mode()
        try:
            if current == "disarmed" and cfg.get("autoArmOnEveryoneLeft"):
                await self._panel.arm("armed_away", None, {"source": "presence"})
                logger.info("全员离家:已自动布防 armed_away")
            elif current in ("armed_home", "armed_night") and cfg.get(
                "autoUpgradeToAwayOnEveryoneLeft"
            ):
                await self._panel.arm(
                    "armed_away", None, {"source": "presence", "force": True}
                )
                logger.info("全员离家:%s 已升级为 armed_away", current)
        except Exception as exc:
            self._log_linkage_failure("linkage_auto_arm_failed", f"全员离家自动布防失败: {exc}")

    async def _on_presence_changed(self, data: dict[str, Any] | None) -> None:
        if not isinstance(data, dict) or not data.get("atHome"):
            return
        if not self._config().get("autoDisarmOnFirstHome"):
            return
        current = self._panel.get_mode()
        if current in ("armed_home", "disarmed"):
            return
        try:
            await self._panel.arm("armed_home", None, {"source": "presence", "force": True})
            logger.info("首人到家:已自动切换安防为 armed_home(居家)")
        except Exception as exc:
            self._log_linkage_failure(
                "linkage_auto_arm_home_failed", f"首人到家自动切居家失败: {exc}"
            )

    async def _on_calendar_away(self, data: dict[str, Any] | None) -> None:
        cfg = self._config()
        current = self._panel.get_mode()
        away = bool(isinstance(data, dict) and data.get("away"))
        try:
            if away and cfg.get("calendarArmOnAway"):
                if current == "disarmed":
                    await self._panel.arm("armed_away", None, {"source": "calendar"})
                    logger.info("日历外出开始:已自动布防 armed_away")
                elif current in ("armed_home", "armed_night") and cfg.get(
                    "autoUpgradeToAwayOnEveryoneLeft"
                ):
                    await self._panel.arm(
                        "armed_away", None, {"source": "calendar", "force": True}
                    )
                    logger.info("日历外出开始:%s 已升级为 armed_away", current)
            elif not away and cfg.get("autoDisarmOnFirstHome") and current == "armed_away":
                await self._panel.arm(
                    "armed_home", None, {"source": "calendar", "force": True}
                )
                logger.info("日历外出结束:已恢复 armed_home 居家布防")
        except Exception as exc:
            self._log_linkage_failure("linkage_calendar_arm_failed", f"日历外出联动布防失败: {exc}")

    async def _on_security_mode_changed(self, data: dict[str, Any] | None) -> None:
        if not isinstance(data, dict):
            return
        mode = data.get("mode")
        if not mode:
            return
        if data.get("source") in ("emergency", "home-mode"):
            return

        cfg = self._config()
        try:
            links = await self._load_security_mode_links()
            explicit_link = bool(str(links.get(mode) or "").strip())
            if cfg.get("linkHomeModeOnSecurityChange") or explicit_link:
                modes = self._home_mode.find_all()
                decision = resolve_home_mode_link_for_security_change(
                    mode=mode,
                    linked_id=links.get(mode),
                    modes=[{"id": m.get("id"), "name": m.get("name")} for m in modes],
                    allow_name_fallback=bool(cfg.get("linkHomeModeOnSecurityChange")),
                )
                if decision["action"] == "deactivate":
                    await self._home_mode.deactivate()
                    logger.info("安防撤防:已退出家庭模式")
                elif decision["action"] == "activate":
                    await self._home_mode.activate(
                        decision["modeId"], {"source": "security", "reason": f"安防模式 {mode}"}
                    )
                    logger.info("安防 %s:已联动家庭模式 %s", mode, decision["modeId"])
        except Exception as exc:
            self._log_linkage_failure("linkage_home_mode_failed", f"安防联动家庭模式失败: {exc}", mode)

        if cfg.get("linkAwaySimOnArmAway") and mode == "armed_away":
            if data.get("degraded"):
                logger.warning("布防离家:联动降级,跳过启用离家模拟")
            else:
                try:
                    await self._away_sim.enable()
                    logger.info("布防离家:已启用离家模拟")
                except Exception as exc:
                    self._log_linkage_failure(
                        "linkage_away_sim_failed", f"联动离家模拟失败: {exc}", mode
                    )
        elif mode != "armed_away" and self._away_sim.get_status().get("enabled"):
            try:
                await self._away_sim.disable()
                logger.info("安防 %s:已关闭离家模拟", mode)
            except Exception:
                pass
