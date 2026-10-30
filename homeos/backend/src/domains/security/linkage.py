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
import time
from collections.abc import Callable
from typing import Any

from .bus import LocalEventBus
from .layout import load_active_project_layout, schedule_security_event
from .zones import resolve_home_mode_link_for_security_change, security_mode_label
from ...platform.core.background import spawn_background

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
        #: 成员首次被判定「在家」的时间戳（毫秒），用于驻留确认
        self._home_since: dict[str, float] = {}
        self._home_dwell_task: asyncio.Task[Any] | None = None

        bus.on("presence.everyoneLeft", self._on_everyone_left)
        bus.on("presence.changed", self._on_presence_changed)
        bus.on("calendar.awayChanged", self._on_calendar_away)
        bus.on("security.modeChanged", self._on_security_mode_changed)

    def _log_linkage_failure(self, event_type: str, detail: str, mode: str | None = None) -> None:
        schedule_security_event(
            self._session_factory,
            event_type,
            detail,
            mode=mode or self._panel.get_mode(),
            source="linkage",
        )

    def _auto_action_blocked(self) -> bool:
        """人工布防/撤防后的人工锁窗口内，自动联动不得覆盖用户决定。"""
        is_locked = getattr(self._panel, "is_auto_action_locked", None)
        if callable(is_locked) and is_locked():
            logger.info("安防处于人工操作锁窗口内，跳过本次自动联动")
            return True
        return False

    async def _arm_checked(
        self, mode: str, opts: dict[str, Any], label: str
    ) -> bool:
        """执行自动布防并检查返回值：失败必须留痕 + 通知，不能只写「已自动切换」。"""
        result = await self._panel.arm(mode, None, opts)
        if isinstance(result, dict):
            ok = result.get("success", True) is not False
            failed = len(result.get("failedItems") or [])
        else:
            ok = bool(result)
            failed = 0
        if ok:
            return True
        detail = f"{label}失败" + (f"（{failed} 条联动未完成）" if failed else "")
        self._log_linkage_failure("linkage_auto_arm_failed", detail, mode)
        try:
            await self._bus.emit(
                "notification.homeos.send",
                {"message": f"安防自动联动：{detail}，请检查安防面板"},
            )
        except Exception as exc:  # 通知失败不能反过来拖垮联动
            logger.debug("发送自动布防失败通知失败: %s", exc)
        return False

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
        except Exception as exc:
            # 读不到联动映射就按「无联动」继续布防：安全兜底，但必须留痕，否则配置读坏了没人知道。
            logger.warning("读取安防模式联动配置失败，按无联动处理: %s", exc)
            return {}

    # 事件处理
    async def _on_everyone_left(self, _payload: Any = None) -> None:
        cfg = self._config()
        self._home_since.clear()
        if not cfg.get("autoArmOnEveryoneLeft") and not cfg.get(
            "autoUpgradeToAwayOnEveryoneLeft"
        ):
            return
        if self._auto_action_blocked():
            return

        current = self._panel.get_mode()
        try:
            if current == "disarmed" and cfg.get("autoArmOnEveryoneLeft"):
                if await self._arm_checked(
                    "armed_away", {"source": "presence"}, "全员离家自动布防"
                ):
                    logger.info("全员离家：已自动切换为离家布防")
            elif current in ("armed_home", "armed_night") and cfg.get(
                "autoUpgradeToAwayOnEveryoneLeft"
            ):
                if await self._arm_checked(
                    "armed_away",
                    {"source": "presence", "force": True},
                    "全员离家升级离家布防",
                ):
                    logger.info(
                        "全员离家：安防从%s升级为离家布防", security_mode_label(current)
                    )
        except Exception as exc:
            self._log_linkage_failure("linkage_auto_arm_failed", f"全员离家自动布防失败: {exc}")

    def _home_confirm_ms(self) -> float:
        """首人到家降级为居家前所需的驻留确认时长（毫秒）。"""
        try:
            return max(0.0, float(self._config().get("homeConfirmMin") or 0) * 60_000)
        except (TypeError, ValueError):
            return 0.0

    async def _on_presence_changed(self, data: dict[str, Any] | None) -> None:
        if not isinstance(data, dict):
            return
        member_id = str(data.get("memberId") or "_any")
        if not data.get("atHome"):
            self._home_since.pop(member_id, None)
            return
        now = time.time() * 1000
        self._home_since.setdefault(member_id, now)
        if not self._config().get("autoDisarmOnFirstHome"):
            return
        # 单条 GPS/追踪器「在家」可能是定位漂移或短暂经过，无驻留确认就撤销
        # armed_away / armed_night 会让家人在真正离家的情形下被误降级为居家布防。
        # 取 max（最近一次到家）而不是 min：已有成员在家时又有人「到家」（常见于 GPS
        # 漂移），min 会直接越过驻留期立刻撤防；max 要求这次新信号也自己待满。
        dwell_ms = self._home_confirm_ms()
        elapsed = now - max(self._home_since.values())
        if elapsed < dwell_ms:
            self._schedule_home_dwell_check(dwell_ms - elapsed)
            return
        await self._downgrade_to_home()

    def _schedule_home_dwell_check(self, delay_ms: float) -> None:
        existing = self._home_dwell_task
        if existing is not None and not existing.done():
            return
        self._home_dwell_task = spawn_background(self._run_home_dwell_check(delay_ms))

    async def _run_home_dwell_check(self, delay_ms: float) -> None:
        self._home_dwell_task = None
        await asyncio.sleep(max(0.0, delay_ms) / 1000)
        if not self._config().get("autoDisarmOnFirstHome") or not self._home_since:
            return
        # 睡眠期间可能有人离家（``_home_since`` 已被 pop）：按当前在场成员重新取
        # 「最近一次到家」，不能沿用调度时的快照。
        remaining = self._home_confirm_ms() - (
            time.time() * 1000 - max(self._home_since.values())
        )
        if remaining > 0:
            self._schedule_home_dwell_check(remaining)
            return
        await self._downgrade_to_home()

    async def _downgrade_to_home(self) -> None:
        current = self._panel.get_mode()
        if current in ("armed_home", "disarmed"):
            self._home_since.clear()
            return
        if self._auto_action_blocked():
            # 人工锁期间保留 _home_since：锁过期后若仍未发生新事件，下一轮 dwell 检查可续判。
            return
        try:
            if await self._arm_checked(
                "armed_home",
                {"source": "presence", "force": True},
                "首人到家自动切居家",
            ):
                logger.info("首人到家：已自动切换为在家布防")
            self._home_since.clear()
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
                if self._auto_action_blocked():
                    return
                if current == "disarmed":
                    if await self._arm_checked(
                        "armed_away", {"source": "calendar"}, "日历外出自动布防"
                    ):
                        logger.info("日历显示外出：已自动切换为离家布防")
                elif current in ("armed_home", "armed_night") and cfg.get(
                    "autoUpgradeToAwayOnEveryoneLeft"
                ):
                    if await self._arm_checked(
                        "armed_away",
                        {"source": "calendar", "force": True},
                        "日历外出升级离家布防",
                    ):
                        logger.info(
                            "日历显示外出：安防从%s升级为离家布防",
                            security_mode_label(current),
                        )
            elif not away and cfg.get("autoDisarmOnFirstHome") and current == "armed_away":
                if self._auto_action_blocked():
                    return
                if await self._arm_checked(
                    "armed_home",
                    {"source": "calendar", "force": True},
                    "日历外出结束恢复居家",
                ):
                    logger.info("日历外出结束：已恢复为在家布防")
        except Exception as exc:
            self._log_linkage_failure("linkage_calendar_arm_failed", f"日历外出联动布防失败: {exc}")

    async def _on_security_mode_changed(self, data: dict[str, Any] | None) -> None:
        if not isinstance(data, dict):
            return
        mode = data.get("mode")
        if not mode:
            return

        cfg = self._config()
        source = data.get("source")
        # emergency / home-mode 触发的安防切换不再反向驱动家庭模式（避免回路），
        # 但离家模拟的启停仍要跟随最终模式 —— 之前整段 return 会让「家庭模式联动布防
        # 离家」永远不启用模拟，或撤防后模拟一直亮着灯。
        if source not in ("emergency", "home-mode"):
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
                        logger.info("安防撤防：已退出家庭模式")
                    elif decision["action"] == "activate":
                        result = await self._home_mode.activate(
                            decision["modeId"],
                            {"source": "security", "reason": f"安防模式 {mode}"},
                        )
                        mode_name = next(
                            (
                                str(item.get("name") or "")
                                for item in modes
                                if str(item.get("id")) == str(decision["modeId"])
                            ),
                            "",
                        )
                        # activate 的业务失败返回 success=False（HA 未连接/联动被拦截/
                        # 动作失败回滚），不会抛异常；不检查就会把失败记成成功日志。
                        if isinstance(result, dict) and result.get("success") is False:
                            self._log_linkage_failure(
                                "linkage_home_mode_failed",
                                f"安防联动家庭模式失败: {result.get('error') or '未知原因'}",
                                mode,
                            )
                        else:
                            logger.info(
                                "安防：%s，已联动家庭模式「%s」",
                                security_mode_label(mode),
                                mode_name or decision["modeId"],
                            )
            except Exception as exc:
                self._log_linkage_failure(
                    "linkage_home_mode_failed", f"安防联动家庭模式失败: {exc}", mode
                )

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
                logger.info("安防：%s，已关闭离家模拟", security_mode_label(mode))
            except Exception as exc:
                self._log_linkage_failure(
                    "linkage_away_sim_disable_failed", f"联动关闭离家模拟失败: {exc}", mode
                )
