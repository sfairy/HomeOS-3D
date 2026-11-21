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
from collections.abc import Callable
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .cooldown import SendCooldown
from ..runtime.config_service import AgentConfigService, AgentProactiveConfig

logger = logging.getLogger("homeos.agent.proactive")

#: 通知来源（前端按来源归并 / 静音）
PROACTIVE_SOURCE = "agent-proactive"
#: 冷却闸门里的 key：主动简报整户只占一个窗口
COOLDOWN_KEY = "proactive"
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
        except ValueError as exc:
            logger.debug("主动管家数量参数不是数字，忽略: %r (%s)", value, exc)
            return None
    return None


def in_quiet_hours(cfg: AgentProactiveConfig, now: datetime) -> bool:
    """免打扰时段判定：支持跨夜（23:30 → 07:00）与全天（start == end 且分钟相同）。

    分钟粒度来自 ``quiet_start_minute`` / ``quiet_end_minute``；老配置只有小时时
    仍按整点判定（分钟默认 0，或起点默认 30，见 ``AgentConfigService``）。

    ``now`` 必须是**家庭当地时间**：调用方用 :func:`home_now` 取，不能直接用
    ``datetime.now()``（容器默认 UTC，会把 23:30–07:00 判成北京时间 07:30–15:00）。
    """
    start_hour, end_hour = cfg.quiet_start, cfg.quiet_end
    start_minute = max(0, min(59, int(getattr(cfg, "quiet_start_minute", 0) or 0)))
    end_minute = max(0, min(59, int(getattr(cfg, "quiet_end_minute", 0) or 0)))
    start = start_hour * 60 + start_minute
    end = end_hour * 60 + end_minute
    if start == end:
        return False
    minute = now.hour * 60 + now.minute
    if start < end:
        return start <= minute < end
    return minute >= start or minute < end


def home_now(timezone_provider: Callable[[], str] | None = None) -> datetime:
    """家庭时区的当前时间（naive，便于与 ``in_quiet_hours`` 比较）。

    读取失败 / 未配置时回退服务器本地时间（旧行为），绝不因时区配置异常中断巡检。
    """
    name = ""
    if callable(timezone_provider):
        try:
            name = str(timezone_provider() or "").strip()
        except Exception as exc:  # 配置读取失败按旧口径继续
            logger.debug("读取家庭时区失败，回退服务器本地时间: %s", exc)
            name = ""
    if not name:
        return datetime.now()
    try:
        return datetime.now(ZoneInfo(name)).replace(tzinfo=None)
    except (ZoneInfoNotFoundError, ValueError):  # fmt: skip - 括号不能省，Cython 会把 PEP 758 形式误解析
        logger.debug("免打扰时区不可用，回退服务器本地时间: %s", name)
        return datetime.now()


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
        timezone_provider: Callable[[], str] | None = None,
        cooldown_store: Any = None,
    ) -> None:
        self._tools = tools
        self._agent_config = agent_config
        self._notification = notification
        self._jobs = jobs
        #: 测试注入的时钟（家庭当地时间）；None 时按 ``timezone_provider`` 实时计算。
        self._clock = clock
        self._timezone_provider = timezone_provider
        self._task: asyncio.Task[None] | None = None
        self._stopped = False
        self._stop_event: asyncio.Event | None = None
        #: 提醒冷却（跨进程共享；未注入共享库时退化为进程内，语义与改前一致）
        self._cooldown = SendCooldown(cooldown_store)

    def bind_cooldown_store(self, store: Any = None) -> None:
        """装配后期注入共享状态库：冷却窗口在重启 / 多 worker 之间保持一致。"""
        self._cooldown.bind_store(store)

    def _now(self) -> datetime:
        """家庭当地当前时间（免打扰判定必须与用户看到的钟一致）。"""
        if self._clock is not None:
            return self._clock()
        return home_now(self._timezone_provider)

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
            except (asyncio.CancelledError, Exception):  # fmt: skip
                pass

    async def _loop(self) -> None:
        while not self._stopped:
            interval = DISABLED_POLL_SECONDS
            try:
                cfg = await self._agent_config.get_proactive_config()
                interval = cfg.interval_seconds if cfg.enabled else DISABLED_POLL_SECONDS
                await self._run_tracked(interval)
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

    async def _run_tracked(self, interval_seconds: int = 900) -> None:
        """包一层作业监控；Jobs 服务不可用时直接执行。"""
        if self._jobs is None:
            await self.run_once()
            return
        try:
            await self._jobs.run(
                "agent-proactive",
                {
                    "description": "智能管家主动巡检（设备离线 / 能耗 / 天气 / 离家异常）",
                    # 报告真实周期：写死 60s 会让诊断页显示的巡检频率与配置不符
                    "intervalMs": max(60, int(interval_seconds)) * 1000,
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

        moment = now or self._now()
        if in_quiet_hours(cfg, moment):
            return {"ok": True, "skipped": "quiet_hours", "sent": False, "signals": []}
        if self._notification is not None:
            try:
                if self._notification.is_dnd_active():
                    return {"ok": True, "skipped": "dnd", "sent": False, "signals": []}
            except Exception:
                logger.debug("读取免打扰状态失败,继续巡检", exc_info=True)

        if self._cooldown.is_cooling(COOLDOWN_KEY, cfg.cooldown_seconds):
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

        # 只在「确实要发」时占窗口：无异常的那几轮不该吃掉一个冷却周期。
        # 判定与登记在同一次 mutate 里完成，多 worker / 重启后仍然只推一次。
        if not self._cooldown.try_acquire(COOLDOWN_KEY, cfg.cooldown_seconds):
            return {"ok": True, "skipped": "cooldown", "sent": False, "signals": []}

        lang = await self._get_language()
        message = self._compose_message(signals, lang)
        sent = await self._send(message, self._action_prompt(signals))
        if not sent:
            # 没送出去（通道全挂 / 免打扰刚生效）就归还窗口，下一次巡检还能重试
            self._cooldown.release(COOLDOWN_KEY)
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
            logger.debug("_get_language 忽略异常", exc_info=True)
            return "zh"

    def _in_cooldown(self, cfg: AgentProactiveConfig) -> bool:
        """冷却判定（保留给调用方 / 单测）：真源是共享状态库里的上次发送时间。"""
        return self._cooldown.is_cooling(COOLDOWN_KEY, cfg.cooldown_seconds)

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

    @staticmethod
    def _action_prompt(signals: list[str]) -> str | None:
        """把最强的一条信号转成管家能直接执行的一句话（通知中心「让管家处理」）。

        只挑「执行后能改善」的信号；离线设备 / 降雨预报这类没有可控动作的不给入口，
        否则按钮点下去管家也只能回一句「这事我做不了」。
        """
        rules = (
            ("灯", "关掉离家模式下还亮着的灯"),
            ("门窗", "检查并关好还开着的门窗"),
            ("门锁", "检查还没上锁的门锁"),
            ("用电", "看看今天哪个设备最费电"),
        )
        for keyword, prompt in rules:
            if any(keyword in signal for signal in signals):
                return prompt[:120]
        return None

    async def _send(self, message: str, action_prompt: str | None = None) -> bool:
        if self._notification is None:
            logger.info("主动管家提醒(无通知服务): %s", message)
            return False
        try:
            opts = {"actionPrompt": action_prompt} if action_prompt else None
            result = await self._notification.notify("info", message, PROACTIVE_SOURCE, None, opts)
        except Exception:
            logger.warning("主动管家提醒发送失败", exc_info=True)
            return False
        return bool(result)


__all__ = [
    "COOLDOWN_KEY",
    "PROACTIVE_SOURCE",
    "AgentProactiveService",
    "home_now",
    "in_quiet_hours",
    "is_away_mode",
]
