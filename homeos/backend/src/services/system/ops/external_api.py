"""外部 API 集成服务（对齐 ``ops/external-api.service.ts``）。

整合三类外部数据源：
 1. 天气预警（OpenWeatherMap Alerts，Redis 缓存 + 熔断器）；
 2. 电价（本地 pricing 配置计算峰谷平 + 可选动态电价 API）；
 3. CalDAV 日历同步（ICS URL 拉取 + 增量 ETag + 外出状态事件）。

配置热更新：订阅 ``app.config.updated``（等价 Nest ``@OnEvent(APP_CONFIG_UPDATED)``）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import UTC, datetime
from typing import Any

from ....core.circuit_breaker import CircuitBreaker
from ....core.icalendar import (
    get_upcoming_away_events,
    is_away_during_calendar,
    parse_icalendar,
)
from ...app_config.pricing import (
    get_period_unit_price,
    get_time_period,
    resolve_tou_unit_prices,
    time_period_label,
)
from ...app_config.service import APP_CONFIG_UPDATED
from .calendar_sync import CalendarSyncDeps, sync_calendar_from_url
from .upstream import DEFAULT_TIMEOUT, UpstreamResponse, fetch_raw
from .weather_alerts import fetch_open_weather_alerts_with_cache

logger = logging.getLogger("homeos.system.ops.external_api")

#: Redis 中天气预警缓存 key 前缀（按经纬度拼后缀）
WEATHER_ALERTS_CACHE_KEY = "homeos:weather:alerts"

#: 当前天气内存缓存 TTL（毫秒）
WEATHER_SNAPSHOT_TTL_MS = 30 * 60_000
#: 预报内存缓存 TTL（毫秒）
FORECAST_TTL_MS = 30 * 60_000


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _iso_from_ms(milliseconds: float) -> str:
    moment = datetime.fromtimestamp(milliseconds / 1000, tz=UTC)
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


def _to_float(value: Any, fallback: float) -> float:
    """对齐 Node ``Number(x) || fallback`` 语义（0 / NaN → fallback）。"""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number or number == 0:  # NaN 或 0
        return fallback
    return number


class ExternalApiService:
    """外部数据源聚合服务。"""

    def __init__(
        self,
        app_config: Any,
        event_bus: Any = None,
        redis: Any = None,
        jobs: Any = None,
        state_store: Any = None,
        *,
        http_fetch: Callable[..., Awaitable[UpstreamResponse]] | None = None,
    ) -> None:
        self._app_config = app_config
        self._event_bus = event_bus
        self._redis = redis
        self._jobs = jobs
        self._state_store = state_store
        self._http_fetch = http_fetch or fetch_raw
        #: 日历同步熔断器：3 次失败开路，60s 后半开试探
        self._calendar_breaker = CircuitBreaker(
            "external-calendar", failure_threshold=3, recovery_timeout_ms=60_000
        )
        #: 天气预警熔断器：3 次失败开路，120s 后半开试探
        self._weather_breaker = CircuitBreaker(
            "external-weather", failure_threshold=3, recovery_timeout_ms=120_000
        )
        self._calendar_events: list[dict[str, Any]] = []
        self._calendar_cache_meta: dict[str, str] = {}
        self._calendar_sync_task: asyncio.Task[None] | None = None
        self._calendar_sync_stopped = False
        self._last_away_state = False
        self._dynamic_price_schedule: dict[str, Any] = {
            "region": "",
            "currency": "CNY",
            "schedule": [],
            "updatedAt": "",
        }
        self._dynamic_price_error = ""
        self._dynamic_price_task: asyncio.Task[None] | None = None
        self._weather_alerts: list[dict[str, Any]] = []
        self._last_alert_check = 0.0
        self._weather_snapshot: dict[str, Any] | None = None
        self._forecast_cache: dict[int, dict[str, Any]] = {}
        #: 内存电价快照（由 sync_pricing_from_config / update_pricing 维护）
        self._electricity_price: dict[str, Any] = {
            "currentTier": 1,
            "unitPrice": 0.4883,
            "nextTierPrice": 0.5383,
            "nextTierThreshold": 2880,
            "peakPrice": 0.5883,
            "valleyPrice": 0.3083,
            "flatPrice": 0.4883,
            "lastUpdated": "",
            "region": "北京 (默认)",
        }

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        """模块初始化：同步电价配置 + 启动日历同步 + 启动动态电价刷新。"""
        self.sync_pricing_from_config()
        self.bind_config_events()
        self._schedule_calendar_sync()
        self._schedule_dynamic_pricing_refresh()

    async def stop(self) -> None:
        """模块销毁：清理定时任务。"""
        self._calendar_sync_stopped = True
        for task in (self._calendar_sync_task, self._dynamic_price_task):
            if task is not None and not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await asyncio.wait_for(asyncio.shield(task), timeout=2)

    def bind_config_events(self) -> None:
        """订阅配置变更事件（pricing → 重算电价；external → 重启定时器）。"""
        if self._event_bus is None:
            return
        try:
            self._event_bus.on(APP_CONFIG_UPDATED, self.on_config_updated)
        except Exception as exc:  # noqa: BLE001
            logger.debug("订阅配置变更失败: %s", exc)

    def on_config_updated(self, keys: Any = None) -> None:
        """配置变更回调（对齐 Nest ``@OnEvent(APP_CONFIG_UPDATED)``）。"""
        changed = [str(key) for key in (keys or [])]
        if "pricing" in changed:
            self.sync_pricing_from_config()
        if "external" in changed:
            self._schedule_calendar_sync()
            self._schedule_dynamic_pricing_refresh()

    # ------------------------------------------------------------------ #
    # 配置读取
    # ------------------------------------------------------------------ #
    def _section(self, name: str) -> dict[str, Any]:
        value = self._app_config.get(name)
        return value if isinstance(value, dict) else {}

    async def _upstream(
        self,
        url: str,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
        json_body: Any = None,
        timeout: float = DEFAULT_TIMEOUT,
        follow_redirects: bool = False,
    ) -> UpstreamResponse:
        """统一出口：经注入的 ``http_fetch``（默认 httpx）请求上游。"""
        request_headers = dict(headers or {})
        content: bytes | None = None
        if json_body is not None:
            content = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        return await self._http_fetch(
            url,
            method=method,
            params=params,
            headers=request_headers,
            content=content,
            timeout=timeout,
            follow_redirects=follow_redirects,
        )

    @property
    def external_cfg(self) -> dict[str, Any]:
        return self._section("external")

    def pricing_cfg(self) -> dict[str, Any]:
        return self._section("pricing")

    def _home_timezone(self) -> str | None:
        getter = getattr(self._app_config, "get_home_timezone", None)
        if callable(getter):
            try:
                return getter()
            except Exception:  # noqa: BLE001
                return None
        return None

    # ------------------------------------------------------------------ #
    # 日历同步
    # ------------------------------------------------------------------ #
    def _schedule_calendar_sync(self) -> None:
        self._calendar_sync_stopped = False
        if self._calendar_sync_task is not None and not self._calendar_sync_task.done():
            self._calendar_sync_task.cancel()
        try:
            self._calendar_sync_task = asyncio.create_task(self._calendar_sync_loop())
        except RuntimeError as exc:  # noqa: BLE001 - 无事件循环（同步上下文）时跳过
            logger.debug("日历同步定时器未启动: %s", exc)

    async def _calendar_sync_loop(self) -> None:
        """立即同步一次，之后按自适应间隔循环（临近外出/外出中 → 短轮询）。"""
        await asyncio.sleep(1)
        while not self._calendar_sync_stopped:
            delay_ms = self.next_calendar_delay_ms()
            try:
                await self._run_job(
                    "calendar-sync",
                    "外部日历周期同步",
                    delay_ms,
                    self.sync_calendar_from_config,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - 单轮失败继续循环
                logger.warning("日历同步任务异常: %s", exc)
            try:
                await asyncio.sleep(max(1.0, delay_ms / 1000))
            except asyncio.CancelledError:
                raise

    async def _run_job(
        self, name: str, description: str, interval_ms: float, runner: Callable[[], Awaitable[Any]]
    ) -> Any:
        """经 ``JobRegistryService`` 记录一次周期任务（对齐 ``jobs.run``）。"""
        if self._jobs is None:
            return await runner()
        try:
            return await self._jobs.run(
                name, {"description": description, "intervalMs": interval_ms}, runner
            )
        except TypeError:
            # 兼容仅接受 (name, runner) 的注册表实现
            return await self._jobs.run(name, runner)

    def next_calendar_delay_ms(self) -> float:
        """下次日历同步延迟：外出中或 30 分钟内将外出 → 短轮询，否则常规间隔。"""
        cfg = self.external_cfg
        normal_ms = max(1, int(cfg.get("calendarSyncMin") or 60)) * 60_000
        short_ms = max(1, int(cfg.get("calendarSyncShortMin") or 5)) * 60_000
        if is_away_during_calendar(self._calendar_events):
            return float(short_ms)
        if get_upcoming_away_events(self._calendar_events, 0.5):
            return float(short_ms)
        return float(normal_ms)

    async def sync_calendar_from_config(self) -> dict[str, Any]:
        """从配置的 ``calendarUrl`` 同步日历（增量 + 自适应短轮询）。"""
        url = self.external_cfg.get("calendarUrl")
        incremental = self.external_cfg.get("calendarIncrementalEnabled") is not False
        result = await sync_calendar_from_url(
            url if isinstance(url, str) else None,
            CalendarSyncDeps(
                fetch_ics=lambda calendar_url: self._fetch_ics(calendar_url, incremental),
                parse_icalendar=parse_icalendar,
                on_away_changed=self._on_away_changed,
                get_last_away_state=lambda: self._last_away_state,
                set_last_away_state=self._set_last_away_state,
                get_last_events=lambda: self._calendar_events,
                set_last_events=self._set_last_events,
            ),
        )
        if result.get("events"):
            self._calendar_events = result["events"]
        if not result.get("synced") and result.get("error"):
            logger.warning("日历同步失败: %s", result["error"])
        elif result.get("notModified"):
            logger.debug("日历同步:服务端 304 未变更,复用上次解析结果")
        return result

    async def _fetch_ics(self, calendar_url: str, incremental: bool) -> str | None:
        """经熔断器拉取 ICS（304 返回 ``None`` 表示复用上次解析结果）。"""

        async def _do_fetch() -> UpstreamResponse:
            headers: dict[str, str] = {}
            if incremental:
                if self._calendar_cache_meta.get("etag"):
                    headers["If-None-Match"] = self._calendar_cache_meta["etag"]
                if self._calendar_cache_meta.get("lastModified"):
                    headers["If-Modified-Since"] = self._calendar_cache_meta["lastModified"]
            return await self._http_fetch(
                calendar_url, headers=headers, timeout=15.0, follow_redirects=False
            )

        response = await self._calendar_breaker.fire(_do_fetch)
        if response.status == 304:
            return None
        etag = response.header("etag")
        last_modified = response.header("last-modified")
        if etag:
            self._calendar_cache_meta["etag"] = etag
        if last_modified:
            self._calendar_cache_meta["lastModified"] = last_modified
        return response.text()

    def _set_last_events(self, events: list[dict[str, Any]]) -> None:
        self._calendar_events = events

    def _set_last_away_state(self, away: bool) -> None:
        self._last_away_state = away

    def _on_away_changed(self, away: bool, away_events: list[dict[str, Any]]) -> None:
        """外出状态切换时通知上层（安防 / 自动化引擎可订阅）。"""
        if self._event_bus is None:
            return
        try:
            self._event_bus.emit_soon("calendar.awayChanged", {"away": away, "events": away_events})
        except Exception as exc:  # noqa: BLE001
            logger.debug("广播外出状态失败: %s", exc)

    def get_calendar_events(self) -> dict[str, Any]:
        """日历事件列表 + 当前是否外出 + 即将到来的外出事件。"""
        return {
            "events": self._calendar_events,
            "awayNow": is_away_during_calendar(self._calendar_events),
            "upcomingAway": get_upcoming_away_events(self._calendar_events),
        }

    def get_calendar_summary(self) -> dict[str, Any]:
        """日历摘要：当前是否外出 + 即将到来的外出事件（最多 3 条）。"""
        data = self.get_calendar_events()
        return {
            "away_now": data["awayNow"],
            "upcoming_away": data["upcomingAway"][:3],
            "total_events": len(data["events"]),
        }

    # ------------------------------------------------------------------ #
    # 电价
    # ------------------------------------------------------------------ #
    def sync_pricing_from_config(self) -> None:
        """从后台 pricing 配置同步峰谷平电价到内存快照。"""
        p = self.pricing_cfg()
        pricing_mode = "fixed" if p.get("pricingMode") == "fixed" else "tiered"
        tier1_price = _to_float(p.get("tier1Price"), 0.4883)
        tier2_price = _to_float(p.get("tier2Price"), 0.5383)
        fixed_price = _to_float(p.get("fixedPrice"), tier1_price)
        ctx = {
            "pricingMode": pricing_mode,
            "tierUnitPrice": fixed_price if pricing_mode == "fixed" else tier1_price,
            "tier1Price": tier1_price,
            "tier2Price": tier2_price,
            "tier3Price": _to_float(p.get("tier3Price"), 0.7883),
            "fixedPrice": fixed_price,
        }
        period_prices = resolve_tou_unit_prices(p, ctx)
        self._electricity_price.update(
            {
                "peakPrice": period_prices["peak"],
                "valleyPrice": period_prices["valley"],
                "flatPrice": period_prices["flat"],
                "unitPrice": ctx["tierUnitPrice"],
                "nextTierPrice": tier2_price,
                "nextTierThreshold": int(_to_float(p.get("tier1Kwh"), 2880)),
                "region": str(p.get("regionLabel") or "").strip() or "默认",
                "lastUpdated": _iso_now(),
            }
        )

    def update_pricing(self, config: dict[str, Any]) -> None:
        """手动更新电价配置（覆盖内存快照）。"""
        self._electricity_price.update(config)
        self._electricity_price["lastUpdated"] = _iso_now()
        logger.info("电价已更新: %s", config)

    def get_pricing(self) -> dict[str, Any]:
        return dict(self._electricity_price)

    def get_time_period(self) -> str | None:
        """当前时段（peak / valley / flat / None 未启用分时）。"""
        return get_time_period(datetime.now(UTC), self.pricing_cfg(), self._home_timezone())

    def _price_context(self) -> dict[str, Any]:
        p = self.pricing_cfg()
        pricing_mode = "fixed" if p.get("pricingMode") == "fixed" else "tiered"
        tier1_price = _to_float(p.get("tier1Price"), 0.4883)
        tier2_price = _to_float(p.get("tier2Price"), 0.5383)
        fixed_price = _to_float(p.get("fixedPrice"), tier1_price)
        return {
            "pricingMode": pricing_mode,
            "tierUnitPrice": fixed_price if pricing_mode == "fixed" else tier1_price,
            "tier1Price": tier1_price,
            "tier2Price": tier2_price,
            "tier3Price": _to_float(p.get("tier3Price"), 0.7883),
            "fixedPrice": fixed_price,
        }

    def get_current_price(self) -> dict[str, Any]:
        """当前电价详情；动态电价启用且命中当前时段时优先返回动态价。"""
        p = self.pricing_cfg()
        ctx = self._price_context()
        tou = get_period_unit_price(datetime.now(UTC), p, ctx, self._home_timezone())
        period = tou["period"]

        dynamic = self._current_dynamic_entry()
        if dynamic is not None:
            return {
                "dynamicPricing": True,
                "timeOfUseEnabled": True,
                "period": dynamic["period"],
                "periodLabel": time_period_label(dynamic["period"]) or "动态",
                "pricePerKwh": dynamic["price"],
                "tierUnitPrice": tou["tierUnitPrice"],
                "allPeriods": tou["periodPrices"],
            }
        return {
            "dynamicPricing": False,
            "timeOfUseEnabled": tou["timeOfUseEnabled"],
            "period": period,
            "periodLabel": time_period_label(period) or "未启用分时",
            "pricePerKwh": tou["pricePerKwh"],
            "tierUnitPrice": tou["tierUnitPrice"],
            "allPeriods": tou["periodPrices"],
        }

    # ------------------------------------------------------------------ #
    # 动态电价 API
    # ------------------------------------------------------------------ #
    def _schedule_dynamic_pricing_refresh(self) -> None:
        if not self.external_cfg.get("dynamicPricingEnabled"):
            return
        if self._dynamic_price_task is not None and not self._dynamic_price_task.done():
            self._dynamic_price_task.cancel()
        try:
            self._dynamic_price_task = asyncio.create_task(self._dynamic_pricing_loop())
        except RuntimeError as exc:  # noqa: BLE001 - 无事件循环时跳过
            logger.debug("动态电价定时器未启动: %s", exc)

    async def _dynamic_pricing_loop(self) -> None:
        hours = max(1, int(self.external_cfg.get("dynamicPricingRefreshHours") or 24))
        while True:
            try:
                await self.sync_dynamic_pricing()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("动态电价周期刷新失败: %s", exc)
            try:
                await asyncio.sleep(hours * 3600)
            except asyncio.CancelledError:
                raise

    @staticmethod
    def _to_minutes(value: str) -> int:
        parts = str(value).split(":")
        hour = int(parts[0]) if parts and parts[0].isdigit() else 0
        minutes_raw = parts[1] if len(parts) > 1 else "0"
        minutes = int(re.match(r"\d+", minutes_raw).group(0)) if re.match(r"\d+", minutes_raw) else 0
        return hour * 60 + minutes

    async def sync_dynamic_pricing(self) -> dict[str, Any]:
        """拉取并解析动态电价 API（``{ region?, currency?, schedule:[{start,price,period}] }``）。"""
        cfg = self.external_cfg
        if not cfg.get("dynamicPricingEnabled"):
            return {"enabled": False, "reason": "未启用"}
        url = str(cfg.get("dynamicPricingUrl") or "").strip()
        if not url:
            return {"enabled": True, "reason": "未配置 dynamicPricingUrl"}
        headers: dict[str, str] = {}
        if cfg.get("dynamicPricingApiKey"):
            headers["X-Api-Key"] = str(cfg["dynamicPricingApiKey"])
        try:
            response = await self._upstream(
                url, headers=headers, timeout=DEFAULT_TIMEOUT
            )
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}")
            raw_data = response.json() or {}
            unwrapped = raw_data.get("data") if isinstance(raw_data, dict) else None
            body = unwrapped if isinstance(unwrapped, dict) else raw_data
            raw_schedule = body.get("schedule") if isinstance(body.get("schedule"), list) else []
            schedule: list[dict[str, Any]] = []
            for entry in raw_schedule:
                item = entry if isinstance(entry, dict) else {}
                start = str(item.get("start") or "").strip()
                try:
                    price = float(item.get("price"))
                except (TypeError, ValueError):
                    continue
                period = str(item.get("period") or "flat")
                if not re.fullmatch(r"\d{1,2}:\d{2}", start) or price < 0:
                    continue
                schedule.append(
                    {
                        "start": start,
                        "price": price,
                        "period": period if period in ("peak", "valley") else "flat",
                    }
                )
            schedule.sort(key=lambda item: self._to_minutes(item["start"]))
            if not schedule:
                self._dynamic_price_error = "动态电价 API 返回空 schedule"
                return {
                    "enabled": True,
                    "synced": False,
                    "count": 0,
                    "error": self._dynamic_price_error,
                }
            self._dynamic_price_schedule = {
                "region": str(body.get("region") or self._electricity_price["region"] or "动态"),
                "currency": str(body.get("currency") or "CNY"),
                "schedule": schedule,
                "updatedAt": _iso_now(),
            }
            self._dynamic_price_error = ""
            averages = self._today_average_prices()
            self.update_pricing(
                {
                    "peakPrice": averages["peak"],
                    "valleyPrice": averages["valley"],
                    "flatPrice": averages["flat"],
                }
            )
            logger.info(
                "动态电价已同步:%s 条(峰 %s / 谷 %s / 平 %s)",
                len(schedule),
                averages["peak"],
                averages["valley"],
                averages["flat"],
            )
            return {"enabled": True, "synced": True, "count": len(schedule)}
        except Exception as err:  # noqa: BLE001 - 外部 API 失败降级为结果对象
            self._dynamic_price_error = str(err)
            logger.warning("动态电价同步失败: %s", self._dynamic_price_error)
            return {"enabled": True, "synced": False, "error": self._dynamic_price_error}

    def _current_dynamic_entry(self) -> dict[str, Any] | None:
        if not self.external_cfg.get("dynamicPricingEnabled"):
            return None
        schedule = self._dynamic_price_schedule["schedule"]
        if not schedule:
            return None
        now = datetime.now()
        now_min = now.hour * 60 + now.minute
        current: dict[str, Any] | None = None
        for entry in schedule:
            if self._to_minutes(entry["start"]) <= now_min:
                current = entry
        # 00:00 前：昨夜最后一个条目
        return current if current is not None else schedule[-1]

    def _today_average_prices(self) -> dict[str, float]:
        acc: dict[str, dict[str, float]] = {
            "peak": {"sum": 0.0, "count": 0},
            "valley": {"sum": 0.0, "count": 0},
            "flat": {"sum": 0.0, "count": 0},
        }
        for entry in self._dynamic_price_schedule["schedule"]:
            acc[entry["period"]]["sum"] += entry["price"]
            acc[entry["period"]]["count"] += 1

        def _average(period: str, fallback: float) -> float:
            bucket = acc[period]
            return (
                round(bucket["sum"] / bucket["count"], 4) if bucket["count"] else float(fallback)
            )

        return {
            "peak": _average("peak", self._electricity_price["peakPrice"]),
            "valley": _average("valley", self._electricity_price["valleyPrice"]),
            "flat": _average("flat", self._electricity_price["flatPrice"]),
        }

    def get_dynamic_pricing(self) -> dict[str, Any]:
        return {
            "enabled": bool(self.external_cfg.get("dynamicPricingEnabled")),
            "region": self._dynamic_price_schedule["region"],
            "currency": self._dynamic_price_schedule["currency"],
            "schedule": self._dynamic_price_schedule["schedule"],
            "current": self._current_dynamic_entry(),
            "updatedAt": self._dynamic_price_schedule["updatedAt"],
            "lastError": self._dynamic_price_error or None,
        }

    # ------------------------------------------------------------------ #
    # 天气预警 / 当前天气 / 预报
    # ------------------------------------------------------------------ #
    def _weather_alerts_ttl_sec(self) -> int:
        minutes = self.external_cfg.get("weatherAlertsTtlMin")
        try:
            minutes_value = int(minutes)
        except (TypeError, ValueError):
            minutes_value = 0
        return (minutes_value if minutes_value > 0 else 30) * 60

    def _alert_refresh_ms(self) -> float:
        try:
            value = float(self.external_cfg.get("weatherAlertRefreshMs") or 0)
        except (TypeError, ValueError):
            value = 0.0
        return value or 30 * 60_000

    async def fetch_open_weather_alerts(
        self, lat: float, lon: float, api_key: str
    ) -> dict[str, Any]:
        """拉取 OpenWeather 天气预警（Redis 缓存 + 熔断器 + 内存降级）。"""
        cache_key = f"{WEATHER_ALERTS_CACHE_KEY}:{round(lat, 2):.2f}:{round(lon, 2):.2f}"

        async def _cache_get(key: str) -> Any:
            if self._redis is None:
                return None
            return await self._redis.get(key)

        async def _cache_set(key: str, value: str, ttl_sec: int) -> Any:
            if self._redis is None:
                return None
            return await self._redis.set(key, value, ttl_sec)

        async def _fetch_one_call(fetch_lat: float, fetch_lon: float, key: str) -> dict[str, Any]:
            async def _do_fetch() -> UpstreamResponse:
                return await self._upstream(
                    "https://api.openweathermap.org/data/3.0/onecall",
                    params={
                        "lat": fetch_lat,
                        "lon": fetch_lon,
                        "appid": key,
                        "exclude": "minutely,hourly,daily",
                        "lang": "zh_cn",
                    },
                    timeout=10.0,
                )

            response = await self._weather_breaker.fire(_do_fetch)
            data = response.json()
            return data if isinstance(data, dict) else {}

        return await fetch_open_weather_alerts_with_cache(
            lat,
            lon,
            api_key,
            cache_key=cache_key,
            cache_get=_cache_get,
            cache_set=_cache_set,
            fetch_one_call=_fetch_one_call,
            get_cached_alerts=lambda: self._weather_alerts,
            set_cached_alerts=self._set_weather_alerts,
            get_last_alert_check=lambda: self._last_alert_check,
            set_last_alert_check=self._set_last_alert_check,
            alert_refresh_ms=self._alert_refresh_ms,
            weather_alerts_ttl_sec=self._weather_alerts_ttl_sec,
            on_cache_read_error=lambda err: logger.debug("天气预警缓存读取失败: %s", err),
            on_fetch_error=lambda err: logger.warning("天气预警获取失败: %s", err),
        )

    def _set_weather_alerts(self, alerts: list[dict[str, Any]]) -> None:
        self._weather_alerts = alerts

    def _set_last_alert_check(self, timestamp: float) -> None:
        self._last_alert_check = timestamp

    def get_cached_alerts(self) -> list[dict[str, Any]]:
        """返回内存中缓存的天气预警列表（不触发 HTTP）。"""
        return self._weather_alerts

    async def get_current_weather(self) -> dict[str, Any]:
        """当前室外天气（OpenWeather → HA weather 实体降级链）。"""
        cfg = self.external_cfg
        api_key = str(cfg.get("openWeatherApiKey") or "").strip()
        if not api_key:
            return self._get_ha_fallback_weather()
        now = _now_ms()
        if self._weather_snapshot and now - self._weather_snapshot["fetchedAt"] < WEATHER_SNAPSHOT_TTL_MS:
            return {
                "source": "openweather",
                **self._weather_snapshot,
                "fetchedAt": datetime.fromtimestamp(
                    self._weather_snapshot["fetchedAt"] / 1000, tz=UTC
                )
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z"),
            }
        try:

            async def _do_fetch() -> UpstreamResponse:
                return await self._upstream(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={
                        "lat": cfg.get("weatherLat"),
                        "lon": cfg.get("weatherLon"),
                        "appid": api_key,
                        "units": "metric",
                        "lang": "zh_cn",
                    },
                    timeout=10.0,
                )

            response = await self._weather_breaker.fire(_do_fetch)
            data = response.json()
            data = data if isinstance(data, dict) else {}
            main = data.get("main") if isinstance(data.get("main"), dict) else {}
            temperature = main.get("temp") if isinstance(main.get("temp"), (int, float)) else None
            weather_list = data.get("weather") if isinstance(data.get("weather"), list) else []
            first = weather_list[0] if weather_list and isinstance(weather_list[0], dict) else {}
            condition = str(first.get("description") or "")
            if temperature is None:
                # OpenWeather 返回但缺温度：降级到 HA 实体
                return self._get_ha_fallback_weather()
            self._weather_snapshot = {
                "temperature": temperature,
                "condition": condition,
                "fetchedAt": now,
            }
            return {
                "source": "openweather",
                "temperature": temperature,
                "condition": condition,
                "fetchedAt": _iso_now(),
            }
        except Exception as err:  # noqa: BLE001 - 主源异常降级 HA 实体
            logger.debug("当前天气获取失败,降级 HA 实体: %s", err)
            return self._get_ha_fallback_weather()

    async def fetch_forecast(self, cnt: int | None = None) -> dict[str, Any]:
        """拉取 OpenWeather ``/data/2.5/forecast``（熔断器 + 30 分钟内存缓存）。"""
        cfg = self.external_cfg
        api_key = str(cfg.get("openWeatherApiKey") or "").strip()
        if not api_key:
            return {"list": [], "cached": False}
        size = min(40, max(1, int(cnt if cnt is not None else 8)))
        now = _now_ms()
        hit = self._forecast_cache.get(size)
        if hit and now - hit["fetchedAt"] < FORECAST_TTL_MS:
            return {"list": hit["list"], "cached": True}
        try:

            async def _do_fetch() -> UpstreamResponse:
                return await self._upstream(
                    "https://api.openweathermap.org/data/2.5/forecast",
                    params={
                        "lat": cfg.get("weatherLat"),
                        "lon": cfg.get("weatherLon"),
                        "appid": api_key,
                        "units": "metric",
                        "cnt": size,
                    },
                    timeout=10.0,
                )

            response = await self._weather_breaker.fire(_do_fetch)
            data = response.json()
            data = data if isinstance(data, dict) else {}
            raw_list = data.get("list")
            forecast_list = raw_list if isinstance(raw_list, list) else []
            self._forecast_cache[size] = {"fetchedAt": now, "list": forecast_list}
            return {"list": forecast_list, "cached": False}
        except Exception as err:  # noqa: BLE001 - 失败降级缓存
            logger.debug("OpenWeather 预报获取失败: %s", err)
            if hit:
                return {"list": hit["list"], "cached": True}
            return {"list": [], "cached": False}

    def _resolve_ha_weather_entity_id(self) -> str | None:
        """HA weather 备用源实体（配置优先，其次自动识别 weather 域）。"""
        if self._state_store is None:
            return None
        configured = str(self.external_cfg.get("weatherFallbackEntityId") or "").strip()
        if configured and self._state_store.get(configured):
            return configured
        for entity in self._state_store.get_all():
            if str(entity.get("entity_id") or "").startswith("weather."):
                return str(entity["entity_id"])
        return None

    def _get_ha_fallback_weather(self) -> dict[str, Any]:
        """从 HA weather 实体读取当前天气（无外部依赖兜底）。"""
        entity_id = self._resolve_ha_weather_entity_id()
        if not entity_id or self._state_store is None:
            return {"source": None, "temperature": None, "condition": "", "fetchedAt": ""}
        entity = self._state_store.get(entity_id) or {}
        attributes = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
        try:
            temperature = float(str(entity.get("state") if entity.get("state") is not None else ""))
        except (TypeError, ValueError):
            temperature = float("nan")
        return {
            "source": "ha",
            "entityId": entity_id,
            "temperature": temperature if temperature == temperature else None,  # NaN 判定
            "condition": str(attributes.get("condition") or ""),
            "fetchedAt": _iso_now(),
        }

    # ------------------------------------------------------------------ #
    # 委托工具（保持 Nest 服务同日历工具方法）
    # ------------------------------------------------------------------ #
    def parse_icalendar(self, ics_content: str) -> list[dict[str, Any]]:
        return parse_icalendar(ics_content)

    def is_away_during_calendar(self, events: list[dict[str, Any]]) -> bool:
        return is_away_during_calendar(events)

    def get_upcoming_away_events(
        self, events: list[dict[str, Any]], within_hours: float = 2
    ) -> list[dict[str, Any]]:
        return get_upcoming_away_events(events, within_hours)


__all__ = [
    "WEATHER_ALERTS_CACHE_KEY",
    "ExternalApiService",
]
