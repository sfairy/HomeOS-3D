"""离家模拟（度假防盗）（对齐 ``AwaySimulationService``）。

在设定活跃时段内按学习到的 hour×dow 开灯概率随机切换灯具 / 窗帘；运行态写 Redis。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
from collections.abc import Callable
from typing import Any

from sqlalchemy import select

from .bus import LocalEventBus
from .layout import schedule_security_event
from ...core.models import AwayPatternBucket

logger = logging.getLogger("homeos.security.away_sim")

AWAY_SIM_STATE_KEY = "homeos:away-sim:state"
AWAY_SIM_SYNC_EVENT = "security.awaySimulation"


class AwaySimulationService:
    def __init__(
        self,
        session_factory,
        ha_connector,
        bus: LocalEventBus,
        redis,
        config_reader: Callable[[], dict[str, Any]],
    ) -> None:
        self._session_factory = session_factory
        self._ha = ha_connector
        self._bus = bus
        self._redis = redis
        self._config = config_reader

        self._enabled = False
        self._timer: asyncio.Task | None = None
        self._light_pool: list[str] = []
        self._cover_pool: list[str] = []
        self._last_toggled: str | None = None
        self._last_cover_toggled: str | None = None
        self._last_cover_action: str | None = None
        self._started_at = ""
        self._pattern_buckets: dict[str, dict[str, Any]] = {}
        self._active_start_hour = 18
        self._active_end_hour = 23

        bus.on(AWAY_SIM_SYNC_EVENT, self.handle_away_sim_sync)

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        await self._restore_state()

    async def stop(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._timer
            self._timer = None

    async def _restore_state(self) -> None:
        try:
            if not self._redis.is_ready():
                return
            raw = await self._redis.get(AWAY_SIM_STATE_KEY)
            if not raw:
                return
            state = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            if not isinstance(state, dict) or not state.get("enabled"):
                return
            self._enabled = True
            self._started_at = state.get("startedAt") or ""
            if isinstance(state.get("activeStartHour"), (int, float)):
                self._active_start_hour = int(state["activeStartHour"])
            if isinstance(state.get("activeEndHour"), (int, float)):
                self._active_end_hour = int(state["activeEndHour"])
            self._light_pool = list(state.get("lightPool") or [])
            self._cover_pool = list(state.get("coverPool") or [])
            self._last_toggled = state.get("lastToggled")
            self._last_cover_toggled = state.get("lastCoverToggled")
            self._last_cover_action = state.get("lastCoverAction")
            await self._load_pattern_buckets()
            self._schedule_next()
            logger.info(
                "离家模拟已从 Redis 恢复运行态(灯具池 %s,窗帘池 %s)",
                len(self._light_pool),
                len(self._cover_pool),
            )
        except Exception as exc:
            logger.warning("恢复离家模拟运行态失败: %s", exc)

    def _persist_state(self) -> None:
        if not self._redis.is_ready():
            return
        state = {
            "enabled": self._enabled,
            "startedAt": self._started_at,
            "activeStartHour": self._active_start_hour,
            "activeEndHour": self._active_end_hour,
            "lightPool": self._light_pool,
            "coverPool": self._cover_pool,
            "lastToggled": self._last_toggled,
            "lastCoverToggled": self._last_cover_toggled,
            "lastCoverAction": self._last_cover_action,
        }
        asyncio.get_running_loop().create_task(self._write_state(state))

    async def _write_state(self, state: dict[str, Any], ttl: int | None = None) -> None:
        try:
            await self._redis.set(AWAY_SIM_STATE_KEY, json.dumps(state, ensure_ascii=False), ttl)
        except Exception as exc:
            logger.warning("持久化离家模拟运行态失败: %s", exc)

    def _clear_persisted_state(self) -> None:
        if not self._redis.is_ready():
            return
        asyncio.get_running_loop().create_task(self._write_state({"enabled": False}, 60))

    # ------------------------------------------------------------------ #
    # 跨实例同步（单副本下等价直接调用）
    # ------------------------------------------------------------------ #
    async def handle_away_sim_sync(self, payload: dict[str, Any] | None) -> None:
        if not isinstance(payload, dict) or not isinstance(payload.get("enabled"), bool):
            return
        if payload["enabled"]:
            self._enabled = True
            if payload.get("startedAt"):
                self._started_at = str(payload["startedAt"])
            if isinstance(payload.get("activeStartHour"), (int, float)):
                self._active_start_hour = int(payload["activeStartHour"])
            if isinstance(payload.get("activeEndHour"), (int, float)):
                self._active_end_hour = int(payload["activeEndHour"])
            if isinstance(payload.get("lightPool"), list):
                self._light_pool = list(payload["lightPool"])
            if isinstance(payload.get("coverPool"), list):
                self._cover_pool = list(payload["coverPool"])
            if "lastToggled" in payload:
                self._last_toggled = payload["lastToggled"]
            if "lastCoverToggled" in payload:
                self._last_cover_toggled = payload["lastCoverToggled"]
            if "lastCoverAction" in payload:
                self._last_cover_action = payload["lastCoverAction"]
            self._schedule_next()
        else:
            self._enabled = False
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            self._last_toggled = None
            self._last_cover_toggled = None
            self._last_cover_action = None

    # ------------------------------------------------------------------ #
    # 状态查询
    # ------------------------------------------------------------------ #
    def _interval_range_ms(self) -> tuple[float, float]:
        sec = self._config()
        window = sec.get("awaySimIntervalMinMax")
        window = window if isinstance(window, dict) else {}
        min_min = float(window.get("min") or 8)
        max_min = float(window.get("max") or 25)
        return min_min * 60_000, max_min * 60_000

    def get_status(self) -> dict[str, Any]:
        min_ms, max_ms = self._interval_range_ms()
        return {
            "enabled": self._enabled,
            "startedAt": self._started_at,
            "activeStartHour": self._active_start_hour,
            "activeEndHour": self._active_end_hour,
            "poolSize": len(self._light_pool),
            "coverPoolSize": len(self._cover_pool),
            "patternBucketCount": len(self._pattern_buckets),
            "intervalMin": {"min": min_ms / 60_000, "max": max_ms / 60_000},
            "lastToggled": self._last_toggled,
            "lastCoverToggled": self._last_cover_toggled,
        }

    async def get_learned_pattern(self) -> dict[str, Any]:
        with self._session_factory() as session:
            rows = (
                session.execute(
                    select(AwayPatternBucket)
                    .order_by(AwayPatternBucket.dow.asc(), AwayPatternBucket.hour.asc())
                    .limit(500)
                )
                .scalars()
                .all()
            )
        return {
            "bucketCount": len(rows),
            "loadedInMemory": len(self._pattern_buckets),
            "buckets": [
                {
                    "dow": row.dow,
                    "hour": row.hour,
                    "lightOnProb": row.light_on_prob,
                    "sampleCount": row.sample_count,
                    "updatedAt": _iso(row.updated_at),
                }
                for row in rows
            ],
        }

    async def _load_pattern_buckets(self) -> None:
        try:
            with self._session_factory() as session:
                rows = (
                    session.execute(select(AwayPatternBucket).limit(500)).scalars().all()
                )
            self._pattern_buckets = {}
            for row in rows:
                self._pattern_buckets[f"{row.dow}|{row.hour}"] = {
                    "dow": row.dow,
                    "hour": row.hour,
                    "lightOnProb": row.light_on_prob,
                }
            logger.info("离家模拟已加载 %s 个 hour×dow 模式桶", len(rows))
        except Exception as exc:
            logger.warning("加载 AwayPatternBucket 失败: %s", exc)

    def _current_bucket(self) -> dict[str, Any] | None:
        from datetime import datetime

        now = datetime.now()
        # JS getDay(): 0=周日；Python weekday(): 0=周一 → 对齐转换
        dow = (now.weekday() + 1) % 7
        return self._pattern_buckets.get(f"{dow}|{now.hour}")

    # ------------------------------------------------------------------ #
    # 启用 / 停用
    # ------------------------------------------------------------------ #
    async def enable(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        opts = opts or {}
        if opts.get("activeStartHour") is not None:
            self._active_start_hour = int(opts["activeStartHour"])
        if opts.get("activeEndHour") is not None:
            self._active_end_hour = int(opts["activeEndHour"])

        await self._load_pattern_buckets()

        lights = opts.get("lights")
        if isinstance(lights, list) and lights:
            self._light_pool = list(lights)
        else:
            try:
                entities = await self._ha.fetch_entities_by_domain("light")
                self._light_pool = [e["entity_id"] for e in entities]
            except Exception as exc:
                message = str(exc)
                logger.warning("获取灯具列表失败: %s", message)
                schedule_security_event(
                    self._session_factory,
                    "away_sim_enable_failed",
                    f"离家模拟启用失败（无法获取灯具列表）: {message}",
                )
                self._light_pool = []

        covers = opts.get("covers")
        if isinstance(covers, list) and covers:
            self._cover_pool = list(covers)
        else:
            try:
                entities = await self._ha.fetch_entities_by_domain("cover")
                self._cover_pool = [e["entity_id"] for e in entities]
            except Exception:
                self._cover_pool = []

        self._enabled = True
        self._started_at = _iso_now()
        logger.info(
            "离家模拟已启用,灯具池 %s 个,窗帘池 %s 个,活跃时段 %s:00-%s:00",
            len(self._light_pool),
            len(self._cover_pool),
            self._active_start_hour,
            self._active_end_hour,
        )
        self._schedule_next()
        self._persist_state()
        await self._bus.emit(
            AWAY_SIM_SYNC_EVENT,
            {
                "enabled": True,
                "timestamp": self._started_at,
                "activeStartHour": self._active_start_hour,
                "activeEndHour": self._active_end_hour,
                "lightPool": self._light_pool,
                "coverPool": self._cover_pool,
                "lastToggled": self._last_toggled,
                "lastCoverToggled": self._last_cover_toggled,
                "lastCoverAction": self._last_cover_action,
            },
        )
        return self.get_status()

    async def disable(self) -> dict[str, Any]:
        self._enabled = False
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        if self._last_toggled:
            try:
                await self._ha.call_service("light", "turn_off", self._last_toggled, {})
            except Exception as exc:
                schedule_security_event(
                    self._session_factory,
                    "away_sim_action_failed",
                    f"离家模拟停用关灯失败 [{self._last_toggled}]: {exc}",
                    entity_id=self._last_toggled,
                )
            self._last_toggled = None
        if self._last_cover_toggled:
            try:
                await self._ha.call_service("cover", "close_cover", self._last_cover_toggled, {})
                logger.debug("离家模拟停用:关闭窗帘 %s", self._last_cover_toggled)
            except Exception as exc:
                schedule_security_event(
                    self._session_factory,
                    "away_sim_action_failed",
                    f"离家模拟停用关窗帘失败 [{self._last_cover_toggled}]: {exc}",
                    entity_id=self._last_cover_toggled,
                )
            self._last_cover_toggled = None
            self._last_cover_action = None
        logger.info("离家模拟已停用")
        self._clear_persisted_state()
        await self._bus.emit(AWAY_SIM_SYNC_EVENT, {"enabled": False, "timestamp": _iso_now()})
        return self.get_status()

    # ------------------------------------------------------------------ #
    # 定时切换
    # ------------------------------------------------------------------ #
    def _schedule_next(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
        min_ms, max_ms = self._interval_range_ms()
        delay = (min_ms + random.random() * (max_ms - min_ms)) / 1000
        self._timer = asyncio.get_running_loop().create_task(self._delayed_tick(delay))

    async def _delayed_tick(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        try:
            await self._tick()
        except Exception as exc:
            logger.warning("离家模拟执行失败: %s", exc)

    def _is_active_hour(self) -> bool:
        from datetime import datetime

        hour = datetime.now().hour
        if self._active_start_hour <= self._active_end_hour:
            return self._active_start_hour <= hour < self._active_end_hour
        return hour >= self._active_start_hour or hour < self._active_end_hour

    def _should_toggle_light(self) -> bool:
        bucket = self._current_bucket()
        if not bucket:
            return random.random() < 0.5
        return random.random() < float(bucket.get("lightOnProb") or 0)

    async def _tick(self) -> None:
        if not self._enabled:
            return
        try:
            if self._is_active_hour() and self._light_pool and self._should_toggle_light():
                if self._last_toggled:
                    try:
                        await self._ha.call_service("light", "turn_off", self._last_toggled, {})
                    except Exception as exc:
                        schedule_security_event(
                            self._session_factory,
                            "away_sim_action_failed",
                            f"离家模拟关灯失败 [{self._last_toggled}]: {exc}",
                            entity_id=self._last_toggled,
                        )
                next_light = self._light_pool[random.randrange(len(self._light_pool))]
                sec = self._config()
                brightness = int(sec.get("awaySimBrightnessMin") or 40) + int(
                    random.random() * (int(sec.get("awaySimBrightnessRange") or 50))
                )
                try:
                    await self._ha.call_service(
                        "light", "turn_on", next_light, {"brightness_pct": brightness}
                    )
                    self._last_toggled = next_light
                    logger.debug("离家模拟:点亮 %s (%s%%)", next_light, brightness)
                except Exception as exc:
                    schedule_security_event(
                        self._session_factory,
                        "away_sim_action_failed",
                        f"离家模拟点灯失败 [{next_light}]: {exc}",
                        entity_id=next_light,
                    )
            elif not self._is_active_hour() and self._last_toggled:
                try:
                    await self._ha.call_service("light", "turn_off", self._last_toggled, {})
                except Exception as exc:
                    schedule_security_event(
                        self._session_factory,
                        "away_sim_action_failed",
                        f"离家模拟非活跃时段关灯失败 [{self._last_toggled}]: {exc}",
                        entity_id=self._last_toggled,
                    )
                self._last_toggled = None

            bucket = self._current_bucket()
            if (
                self._is_active_hour()
                and self._cover_pool
                and bucket
                and float(bucket.get("lightOnProb") or 0) > 0.3
            ):
                if self._last_cover_toggled and self._last_cover_action:
                    revert = (
                        "close_cover" if self._last_cover_action == "open_cover" else "open_cover"
                    )
                    try:
                        await self._ha.call_service(
                            "cover", revert, self._last_cover_toggled, {}
                        )
                        logger.debug("离家模拟:回收 %s %s", revert, self._last_cover_toggled)
                    except Exception as exc:
                        schedule_security_event(
                            self._session_factory,
                            "away_sim_action_failed",
                            f"离家模拟窗帘回收失败 [{self._last_cover_toggled}]: {exc}",
                            entity_id=self._last_cover_toggled,
                        )
                cover = self._cover_pool[random.randrange(len(self._cover_pool))]
                service = "open_cover" if random.random() < 0.5 else "close_cover"
                try:
                    await self._ha.call_service("cover", service, cover, {})
                    self._last_cover_toggled = cover
                    self._last_cover_action = service
                    logger.debug("离家模拟:%s %s", service, cover)
                except Exception as exc:
                    schedule_security_event(
                        self._session_factory,
                        "away_sim_action_failed",
                        f"离家模拟窗帘操作失败 [{cover}]: {exc}",
                        entity_id=cover,
                    )
        finally:
            if self._enabled:
                self._schedule_next()


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
