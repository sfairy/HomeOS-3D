"""主动管家：定时巡检 + 简报 / 提醒。

设计要点：

- **默认关闭**：由 ``layout.agentConfig.proactive.enabled`` 或
  ``AGENT_PROACTIVE_ENABLED=true`` 显式开启，避免升级后突然开始推送；
- **只读**：只调用 ``get_home_status`` / ``get_energy_usage`` / ``get_weather_forecast``
  三个只读工具，不执行任何控制动作；
- **频控**：巡检周期 + 最小提醒间隔 + 免打扰时段（并与通知中心的 DND 对齐）；
- **安静失败**：任一数据源不可用只跳过对应信号，不影响其它提醒，也不影响主流程；
- **统一出口**：提醒走 ``NotificationService.notify``，复用站内通知 / WebPush / 企微等通道。
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any

from .config_service import AgentConfigService, AgentProactiveConfig

logger = logging.getLogger("homeos.agent.proactive")

#: 通知来源（前端按来源归并 / 静音）
PROACTIVE_SOURCE = "agent-proactive"
#: 关闭状态下重新检查配置的间隔（秒）：允许设置页开启后无需重启
DISABLED_POLL_SECONDS = 300
#: 一次提醒最多包含的信号条数，避免变成「状态播报」
MAX_SIGNALS = 3

_AWAY_KEYWORDS = ("离家", "外出", "离开", "away", "vacation", "度假")


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def in_quiet_hours(cfg: AgentProactiveConfig, now: datetime) -> bool:
    """免打扰时段判定：支持跨夜（22 → 7）与全天（start == end）。"""
    start, end = cfg.quiet_start, cfg.quiet_end
    if start == end:
        return False
    hour = now.hour
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def is_away_mode(status: dict[str, Any]) -> bool:
    """从 ``get_home_status.active_mode`` 判断当前是否离家 / 度假。"""
    mode = status.get("active_mode")
    if not isinstance(mode, dict):
        return False
    text = f"{mode.get('id') or ''} {mode.get('name') or ''}".lower()
    return any(keyword in text for keyword in _AWAY_KEYWORDS)


class AgentProactiveService:
    """主动管家服务：后台巡检 + 事件驱动的简报生成。"""

    def __init__(
        self,
        tools: Any,
        agent_config: AgentConfigService,
        notification: Any = None,
        jobs: Any = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._tools = tools
        self._agent_config = agent_config
        self._notification = notification
        self._jobs = jobs
        self._clock = clock or datetime.now
        self._task: asyncio.Task[None] | None = None
        self._stopped = False
        self._stop_event: asyncio.Event | None = None
        #: 最近一次成功提醒的时间（monotonic 秒）
        self._last_sent_at: float | None = None

    # 生命周期
    async def start(self) -> None:
        """启动后台巡检（幂等）。"""
        if self._task is not None and not self._task.done():
            return
        self._stopped = False
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="agent-proactive")

    async def stop(self) -> None:
        """停止巡检并取消后台任务。"""
        self._stopped = True
        if self._stop_event is not None:
            self._stop_event.set()
        task = self._task
        self._task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError, Exception:
                pass

    async def _loop(self) -> None:
        while not self._stopped:
            interval = DISABLED_POLL_SECONDS
            try:
                cfg = await self._agent_config.get_proactive_config()
                interval = cfg.interval_seconds if cfg.enabled else DISABLED_POLL_SECONDS
                await self._run_tracked()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("主动管家巡检失败", exc_info=True)
            stop_event = self._stop_event
            if stop_event is None:
                return
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=max(60, interval))
                return
            except TimeoutError:
                continue

    async def _run_tracked(self) -> None:
        """包一层作业监控；Jobs 服务不可用时直接执行。"""
        if self._jobs is None:
            await self.run_once()
            return
        try:
            await self._jobs.run(
                "agent-proactive",
                {
                    "description": "智能管家主动巡检（设备离线 / 能耗 / 天气 / 离家异常）",
                    "intervalMs": 60_000,
                },
                self.run_once,
            )
        except Exception:
            # run_once 内部已吞掉单源错误；这里只保护作业监控本身
            raise

    # 单次巡检
    async def run_once(self, now: datetime | None = None) -> dict[str, Any]:
        """执行一次巡检并返回结果（供定时任务与单测直接调用）。"""
        cfg = await self._agent_config.get_proactive_config()
        if not cfg.enabled:
            return {"ok": True, "skipped": "disabled", "sent": False, "signals": []}

        moment = now or self._clock()
        if in_quiet_hours(cfg, moment):
            return {"ok": True, "skipped": "quiet_hours", "sent": False, "signals": []}
        if self._notification is not None:
            try:
                if self._notification.is_dnd_active():
                    return {"ok": True, "skipped": "dnd", "sent": False, "signals": []}
            except Exception:
                logger.debug("读取免打扰状态失败,继续巡检", exc_info=True)

        if self._in_cooldown(cfg):
            return {"ok": True, "skipped": "cooldown", "sent": False, "signals": []}

        status, energy, forecast = await asyncio.gather(
            self._call_tool("get_home_status", {}),
            self._call_tool("get_energy_usage", {"days": 7}),
            self._call_tool("get_weather_forecast", {"count": cfg.forecast_slots}),
            return_exceptions=True,
        )
        signals = self._collect_signals(cfg, status, energy, forecast)
        if not signals:
            return {"ok": True, "sent": False, "signals": []}

        lang = await self._get_language()
        message = self._compose_message(signals, lang)
        sent = await self._send(message)
        if sent:
            self._last_sent_at = time.monotonic()
        return {
            "ok": True,
            "sent": sent,
            "signals": signals,
            "message": message,
        }

    async def _call_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        """调用只读工具；异常与工具错误统一转成空对象。"""
        try:
            result = await self._tools.execute(name, args, None)
        except Exception as exc:
            logger.debug("主动管家工具失败: %s (%s)", name, exc)
            return {}
        return result if isinstance(result, dict) and not result.get("error") else {}

    async def _get_language(self) -> str:
        try:
            return await self._agent_config.get_language()
        except Exception:
            return "zh"

    def _in_cooldown(self, cfg: AgentProactiveConfig) -> bool:
        if self._last_sent_at is None:
            return False
        return time.monotonic() - self._last_sent_at < cfg.cooldown_seconds

    def _collect_signals(
        self,
        cfg: AgentProactiveConfig,
        status: Any,
        energy: Any,
        forecast: Any,
    ) -> list[str]:
        """把三路只读数据压缩成人类可读的信号列表。"""
        signals: list[str] = []
        status = status if isinstance(status, dict) else {}
        away = is_away_mode(status)

        unavailable = int(_num(status.get("unavailable")) or 0)
        if unavailable > 0:
            signals.append(f"{unavailable} 台设备离线或状态未知")

        if away:
            openings = int(_num(status.get("openings_open")) or 0)
            locks = int(_num(status.get("locks_unlocked")) or 0)
            lights = int(_num(status.get("lights_on")) or 0)
            if openings > 0:
                signals.append(f"离家模式下有 {openings} 个门窗仍开着")
            if locks > 0:
                signals.append(f"离家模式下有 {locks} 把门锁未上锁")
            if lights > 0:
                signals.append(f"离家模式下仍有 {lights} 盏灯亮着")

        energy = energy if isinstance(energy, dict) else {}
        energy_signal = self._energy_signal(cfg, energy)
        if energy_signal:
            signals.append(energy_signal)

        weather_signal = self._weather_signal(cfg, forecast)
        if weather_signal:
            signals.append(weather_signal)

        return signals[:MAX_SIGNALS]

    @staticmethod
    def _energy_signal(cfg: AgentProactiveConfig, energy: dict[str, Any]) -> str:
        """今日用电显著高于前几日均值才提醒（今天的数据是部分日，只与完整日比较）。"""
        today = _num(energy.get("today_kwh"))
        daily = energy.get("daily")
        if today is None or today < cfg.min_energy_kwh or not isinstance(daily, list):
            return ""
        rows = [item for item in daily if isinstance(item, dict) and _num(item.get("kwh")) is not None]
        # daily 按日期升序；最后一行若就是今天，则不参与均值（部分日会拉低均值）
        if rows and abs(float(_num(rows[-1].get("kwh")) or 0.0) - today) < 1e-6:
            rows = rows[:-1]
        prior = [float(_num(item.get("kwh")) or 0.0) for item in rows]
        if len(prior) < 2:
            return ""
        average = sum(prior) / len(prior)
        if average <= 0 or today <= average * cfg.energy_multiplier:
            return ""
        return f"今日已用电 {today:.1f} kWh，高于近 {len(prior)} 天均值 {average:.1f} kWh"

    @staticmethod
    def _weather_signal(cfg: AgentProactiveConfig, forecast: dict[str, Any]) -> str:
        items = forecast.get("items")
        if not isinstance(items, list):
            return ""
        worst: float | None = None
        for item in items[: cfg.forecast_slots]:
            if not isinstance(item, dict):
                continue
            pop = _num(item.get("precipitation_probability"))
            if pop is not None and (worst is None or pop > worst):
                worst = pop
        if worst is None or worst < cfg.forecast_pop_threshold:
            return ""
        return f"未来 {cfg.forecast_slots * 3} 小时可能有雨（最高降水概率 {round(worst * 100)}%）"

    @staticmethod
    def _compose_message(signals: list[str], lang: str) -> str:
        if lang.lower().startswith("en"):
            return "[Butler] " + "; ".join(signals) + "."
        return "【管家提醒】" + "；".join(signals) + "。"

    async def _send(self, message: str) -> bool:
        if self._notification is None:
            logger.info("主动管家提醒(无通知服务): %s", message)
            return False
        try:
            result = await self._notification.notify("info", message, PROACTIVE_SOURCE)
        except Exception:
            logger.warning("主动管家提醒发送失败", exc_info=True)
            return False
        return bool(result)


__all__ = [
    "PROACTIVE_SOURCE",
    "AgentProactiveService",
    "in_quiet_hours",
    "is_away_mode",
]
