"""儿童模式服务（对齐 ChildModeService）。

职责：
- 白名单 + 时间窗：非白名单设备一律拦截；白名单设备仅在允许时段内可用，窗外强制关闭；
- 媒体时长限制：累计媒体播放时长超过上限后自动关闭；
- 实时拦截：白名单设备在允许时段外被打开会被立即关闭；
- 家长临时 override：clamp 到 [5, 180] 分钟。

运行时状态（mediaUsedMin / usageDate / overrideUntil）持久化到 ``ChildModeRuntime``。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select

from ..core.app_config import load_raw_config, write_raw_config_section
from ..core.entity_domain import get_entity_domain
from ..core.errors import api_error, bad_request
from ..core.models import ChildModeRuntime

logger = logging.getLogger("homeos.child_mode")

RUNTIME_ID = "default"
CHECK_INTERVAL_SECONDS = 60
WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": False,
    "dailyMediaLimitMin": 0,
    "deviceWhitelist": [],
    "timeWindows": [],
}


def _parse_time_to_min(value: Any) -> int:
    try:
        hour, minute = str(value).split(":")
        return int(hour) * 60 + int(minute)
    except (ValueError, TypeError):
        return -1


def _day_matched(days: Any, weekday: int) -> bool:
    if days == "weekday":
        return 1 <= weekday <= 5
    if days == "weekend":
        return weekday in (0, 6)
    if isinstance(days, list):
        return weekday in days
    return False


def _within_window(window: dict[str, Any], now_min: int) -> bool:
    start = _parse_time_to_min(window.get("start"))
    end = _parse_time_to_min(window.get("end"))
    if start < 0 or end < 0:
        return False
    return start <= now_min < end if start <= end else (now_min >= start or now_min < end)


def _describe_days(days: Any) -> str:
    if days == "weekday":
        return "工作日"
    if days == "weekend":
        return "周末"
    if isinstance(days, list):
        return "、".join(WEEK_LABELS[d] for d in days if isinstance(d, int) and 0 <= d < 7)
    return ""


class ChildModeService:
    def __init__(self, session_factory, connector=None, jobs=None) -> None:
        self._session_factory = session_factory
        self._connector = connector
        self._jobs = jobs
        self._config: dict[str, Any] = dict(DEFAULT_CONFIG)
        self._media_used_min = 0.0
        self._usage_date = ""
        self._media_playing_since: dict[str, float] = {}
        self._override_until = 0
        self._task: asyncio.Task | None = None
        self._home_timezone: str | None = None

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        self._load_config()
        await self._load_persisted_state()
        if self._config.get("enabled"):
            self._start_timer()

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None

    def _start_timer(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._enforce_loop(), name="child-mode-enforce")

    async def _enforce_loop(self) -> None:
        while True:
            await asyncio.sleep(CHECK_INTERVAL_SECONDS)
            try:
                if self._jobs is None:
                    await self.enforce()
                else:
                    await self._jobs.run(
                        "child-mode-enforce",
                        {"description": "儿童模式设备规则执行", "intervalMs": 60_000},
                        self.enforce,
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("儿童模式周期执行失败: %s", exc)

    def _load_config(self) -> None:
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
            section = raw.get("childMode") if isinstance(raw.get("childMode"), dict) else {}
        except Exception:  # noqa: BLE001
            section = {}
        self._home_timezone = self._home_timezone_of()
        self._config = {**DEFAULT_CONFIG, **section}

    def _home_timezone_of(self) -> str | None:
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
        except Exception:  # noqa: BLE001
            return None
        tz = raw.get("homeTimezone")
        return tz.strip() if isinstance(tz, str) and tz.strip() else None

    def _tzinfo(self) -> ZoneInfo | None:
        if not self._home_timezone:
            return None
        try:
            return ZoneInfo(self._home_timezone)
        except Exception:  # noqa: BLE001
            return None

    async def _load_persisted_state(self) -> None:
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ChildModeRuntime).where(ChildModeRuntime.id == RUNTIME_ID)
                ).scalar_one_or_none()
            if row is not None:
                self._media_used_min = float(row.media_used_min or 0)
                self._usage_date = row.usage_date or ""
                self._override_until = int(row.override_until or 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("加载儿童模式运行时失败: %s", exc)

    def _persist_runtime(self) -> None:
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ChildModeRuntime).where(ChildModeRuntime.id == RUNTIME_ID)
                ).scalar_one_or_none()
                if row is None:
                    row = ChildModeRuntime(id=RUNTIME_ID)
                    session.add(row)
                row.media_used_min = self._media_used_min
                row.usage_date = self._usage_date
                row.override_until = self._override_until
                session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("儿童模式运行时持久化失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 判定
    # ------------------------------------------------------------------ #
    def can_control(self, entity_id: str) -> dict[str, Any]:
        if not self._config.get("enabled"):
            return {"allowed": True}
        if self.is_override_active():
            return {"allowed": True}
        whitelist = self._config.get("deviceWhitelist") or []
        if isinstance(whitelist, list) and whitelist:
            if entity_id not in whitelist:
                return {"allowed": False, "reason": "儿童模式：该设备未加入允许白名单"}
            if not self.is_in_allowed_window():
                return {"allowed": False, "reason": self.outside_window_reason()}
        limit = self._config.get("dailyMediaLimitMin") or 0
        if limit > 0 and str(entity_id).startswith("media_player."):
            active = self._active_media_minutes()
            if active >= float(limit):
                return {"allowed": False, "reason": "儿童模式媒体时长已达上限"}
        return {"allowed": True}

    def get_status(self) -> dict[str, Any]:
        override_active = self.is_override_active()
        return {
            **self._config,
            "mediaUsedMin": round(self._media_used_min),
            "inAllowedWindow": self.is_in_allowed_window(),
            "overrideActive": override_active,
            "overrideUntil": (
                datetime.fromtimestamp(self._override_until / 1000).astimezone().isoformat()
                if override_active
                else None
            ),
        }

    def update_config(self, partial: dict[str, Any]) -> dict[str, Any]:
        was_enabled = bool(self._config.get("enabled"))
        merged = {**self._config}
        for key in ("enabled", "dailyMediaLimitMin"):
            if key in partial and partial[key] is not None:
                merged[key] = partial[key]
        for key in ("deviceWhitelist", "timeWindows"):
            value = partial.get(key)
            if isinstance(value, list):
                merged[key] = value
        self._config = merged
        if self._config.get("enabled") and not was_enabled:
            self._start_timer()
        elif not self._config.get("enabled") and was_enabled and self._task is not None:
            self._task.cancel()
            self._task = None
        self._persist_config()
        return self.get_status()

    def _persist_config(self) -> None:
        try:
            write_raw_config_section(self._session_factory, "childMode", self._config)
        except Exception as exc:  # noqa: BLE001
            logger.warning("儿童模式配置持久化失败: %s", exc)

    def request_override(self, minutes: int = 30) -> dict[str, Any]:
        mins = min(max(int(minutes or 30), 5), 180)
        self._override_until = int(time.time() * 1000) + mins * 60_000
        logger.info("儿童模式家长 override: %s 分钟", mins)
        self._persist_runtime()
        return self.get_status()

    def is_override_active(self) -> bool:
        if self._override_until <= int(time.time() * 1000):
            self._override_until = 0
            return False
        return True

    # ------------------------------------------------------------------ #
    # 时间窗
    # ------------------------------------------------------------------ #
    def _now_parts(self) -> tuple[int, int]:
        tz = self._tzinfo()
        now = datetime.now(tz) if tz is not None else datetime.now().astimezone()
        weekday = (now.weekday() + 1) % 7  # 0=周日
        return weekday, now.hour * 60 + now.minute

    def _current_allowed_window(self) -> dict[str, Any] | None:
        weekday, now_min = self._now_parts()
        windows = self._config.get("timeWindows") or []
        for window in windows:
            if not isinstance(window, dict):
                continue
            if _day_matched(window.get("days"), weekday) and _within_window(window, now_min):
                return window
        return None

    def is_in_allowed_window(self) -> bool:
        return self._current_allowed_window() is not None

    def outside_window_reason(self) -> str:
        windows = [w for w in (self._config.get("timeWindows") or []) if isinstance(w, dict)]
        if not windows:
            return "儿童模式：该设备当前不在允许使用时段"
        desc = "；".join(
            f"{_describe_days(w.get('days'))} {w.get('start')}-{w.get('end')}" for w in windows[:3]
        )
        suffix = " 等" if len(windows) > 3 else ""
        return f"儿童模式：当前不在允许使用时段（{desc}{suffix}）"

    # ------------------------------------------------------------------ #
    # 状态变更 / 周期执行
    # ------------------------------------------------------------------ #
    def _active_media_minutes(self) -> float:
        active = self._media_used_min
        now = time.time() * 1000
        for since in self._media_playing_since.values():
            active += (now - since) / 60_000
        return active

    def _reset_daily_if_needed(self) -> None:
        tz = self._tzinfo()
        today = (datetime.now(tz) if tz is not None else datetime.now().astimezone()).strftime("%Y-%m-%d")
        if self._usage_date != today:
            self._usage_date = today
            self._media_used_min = 0.0
            self._media_playing_since.clear()

    async def handle_state_change(self, change: dict[str, Any]) -> None:
        if not self._config.get("enabled"):
            return
        entity_id = str(change.get("entity_id") or "")
        if not entity_id:
            return
        state = (change.get("new_state") or {}).get("state")
        if entity_id.startswith("media_player."):
            self._reset_daily_if_needed()
            if state == "playing":
                self._media_playing_since.setdefault(entity_id, time.time() * 1000)
            else:
                since = self._media_playing_since.pop(entity_id, None)
                if since is not None:
                    self._media_used_min += (time.time() * 1000 - since) / 60_000
                    self._persist_runtime()

        whitelist = self._config.get("deviceWhitelist") or []
        governed = isinstance(whitelist, list) and entity_id in whitelist
        if not governed or self.is_override_active():
            return
        blocked = not self.is_in_allowed_window()
        is_on = state in ("on", "playing", "open")
        if is_on and blocked:
            await self._turn_off(entity_id)
            logger.info("儿童模式拦截: %s 非允许时段被打开，已关闭", entity_id)

    async def enforce(self) -> None:
        if not self._config.get("enabled"):
            return
        self._reset_daily_if_needed()
        if self.is_override_active():
            return
        whitelist = self._config.get("deviceWhitelist") or []
        if isinstance(whitelist, list) and whitelist and not self.is_in_allowed_window():
            for entity_id in whitelist:
                await self._turn_off(entity_id)
        limit = self._config.get("dailyMediaLimitMin") or 0
        if limit > 0 and self._active_media_minutes() >= float(limit):
            for entity_id in list(self._media_playing_since):
                await self._turn_off(entity_id)
            logger.info("儿童模式: 媒体每日时长已达上限 %s 分钟", limit)

    async def _turn_off(self, entity_id: str) -> None:
        if self._connector is None:
            return
        domain = get_entity_domain(entity_id)
        service = "close_cover" if domain == "cover" else "turn_off"
        try:
            await self._connector.call_service(domain, service, entity_id, {})
        except Exception as exc:  # noqa: BLE001
            logger.debug("儿童模式关闭设备失败 [%s]: %s", entity_id, exc)


def validate_override_minutes(minutes: Any) -> int:
    try:
        value = int(minutes)
    except (TypeError, ValueError):
        bad_request(api_error("VALIDATION_FAILED"))
    if value < 1:
        bad_request(api_error("VALIDATION_FAILED"))
    return value
