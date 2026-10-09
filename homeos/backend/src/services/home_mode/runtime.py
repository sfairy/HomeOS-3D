"""家庭模式运行日志缓冲与 JSON 规范化（对齐 home-mode/runtime.internals.ts）。

- ``HomeModeRuntimeLogStore``：内存中的触发日志 / 执行历史缓冲，防抖（500ms）持久化到
  ``runtime_kv`` 表，上限由 homeMode 配置控制；
- ``normalize_home_mode_json_array``：校验并规范化 config / triggers JSON 数组。
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from datetime import UTC
from typing import Any

from ...core.errors import api_error, bad_request
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv
from ...core.zoned_time import normalize_home_mode_time_at

logger = logging.getLogger("homeos.home_mode")

HOME_MODE_RUNTIME_CONFIG_ID = "home-mode-runtime"


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return minimum
    if not math.isfinite(number):
        return minimum
    return min(max(int(number // 1), minimum), maximum)


def _new_id(prefix: str) -> str:
    return f"{prefix}{int(time.time() * 1000)}_{_rand_suffix()}"


def _rand_suffix() -> str:
    import random
    import string

    return "".join(random.choices(string.ascii_lowercase + string.digits, k=6))


def aggregate_home_mode_trigger_logs(logs: list[dict[str, Any]]) -> dict[str, Any]:
    by_source: dict[str, int] = {}
    by_day: dict[str, int] = {}
    ok = 0
    fail = 0
    for row in logs:
        src = str(row.get("source") or "manual")
        by_source[src] = by_source.get(src, 0) + 1
        if row.get("success") is False:
            fail += 1
        else:
            ok += 1
        day = str(row.get("executedAt") or "")[:10]
        if day:
            by_day[day] = by_day.get(day, 0) + 1
    source_buckets = sorted(
        ({"key": key, "count": count} for key, count in by_source.items()),
        key=lambda item: item["count"],
        reverse=True,
    )
    day_buckets = [
        {"date": date, "count": by_day[date]} for date in sorted(by_day.keys())
    ]
    return {
        "sourceBuckets": source_buckets,
        "dayBuckets": day_buckets,
        "ok": ok,
        "fail": fail,
        "total": len(logs),
    }


class HomeModeRuntimeLogStore:
    """内存中的触发 / 执行日志缓冲 + 防抖持久化。"""

    def __init__(self, session_factory, get_limits) -> None:
        self._session_factory = session_factory
        self._get_limits = get_limits
        self._trigger_logs: list[dict[str, Any]] = []
        self._execution_history: list[dict[str, Any]] = []
        self._persist_task: asyncio.Task | None = None

    # ------------------------------------------------------------------ #
    # 持久化
    # ------------------------------------------------------------------ #
    async def load(self) -> None:
        limits = self._get_limits()
        try:
            with self._session_factory() as session:
                data = load_runtime_kv(session, HOME_MODE_RUNTIME_CONFIG_ID)
        except Exception as exc:
            logger.warning("加载家庭模式运行日志失败: %s", exc)
            return
        if not isinstance(data, dict):
            return
        logs = data.get("triggerLogs")
        if isinstance(logs, list):
            self._trigger_logs = logs[: limits["maxTriggerLogs"]]
        history = data.get("executionHistory")
        if isinstance(history, list):
            self._execution_history = history[: limits["maxExecHistory"]]

    def _persist(self) -> None:
        limits = self._get_limits()
        _ = limits
        try:
            persist_runtime_kv(
                self._session_factory,
                HOME_MODE_RUNTIME_CONFIG_ID,
                {
                    "triggerLogs": self._trigger_logs,
                    "executionHistory": self._execution_history,
                },
            )
        except Exception as exc:
            logger.warning("家庭模式运行日志持久化失败: %s", exc)

    async def flush_now(self) -> None:
        if self._persist_task is not None:
            self._persist_task.cancel()
            self._persist_task = None
        await asyncio.to_thread(self._persist)

    def _schedule_persist(self) -> None:
        if self._persist_task is not None:
            self._persist_task.cancel()
        self._persist_task = asyncio.get_event_loop().create_task(self._debounced_persist())

    async def _debounced_persist(self) -> None:
        try:
            await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            return
        self._persist_task = None
        await asyncio.to_thread(self._persist)

    # ------------------------------------------------------------------ #
    # 写入
    # ------------------------------------------------------------------ #
    def push_trigger_log(self, entry: dict[str, Any]) -> None:
        limits = self._get_limits()
        self._trigger_logs.insert(
            0,
            {
                **entry,
                "id": _new_id(""),
                "executedAt": _iso_now(),
            },
        )
        if len(self._trigger_logs) > limits["maxTriggerLogs"]:
            del self._trigger_logs[limits["maxTriggerLogs"] :]
        self._schedule_persist()

    def record_execution(self, entry: dict[str, Any]) -> None:
        limits = self._get_limits()
        self._execution_history.insert(
            0,
            {
                **entry,
                "id": _new_id("hm_"),
                "executedAt": _iso_now(),
            },
        )
        if len(self._execution_history) > limits["maxExecHistory"]:
            del self._execution_history[limits["maxExecHistory"] :]
        self._schedule_persist()

    # ------------------------------------------------------------------ #
    # 读取
    # ------------------------------------------------------------------ #
    def get_trigger_logs(self, limit: int = 20) -> list[dict[str, Any]]:
        limits = self._get_limits()
        return self._trigger_logs[: clamp_int(limit, 1, limits["maxTriggerLogs"])]

    def get_trigger_logs_paginated(
        self, page: int = 1, page_size: int = 20, filters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        filters = filters or {}
        limits = self._get_limits()
        source = filters.get("source")
        success = filters.get("success")

        def _match(log: dict[str, Any]) -> bool:
            if source and str(log.get("source") or "manual") != source:
                return False
            if success is True and log.get("success") is False:
                return False
            return not (success is False and log.get("success") is not False)

        filtered = [log for log in self._trigger_logs if _match(log)]
        total = len(filtered)
        safe_page = max(1, page)
        safe_size = clamp_int(page_size, 1, limits["maxTriggerLogs"])
        start = (safe_page - 1) * safe_size
        return {
            "items": filtered[start : start + safe_size],
            "total": total,
            "page": safe_page,
            "pageSize": safe_size,
            "totalPages": max(1, -(-total // safe_size)),
            "analytics": aggregate_home_mode_trigger_logs(filtered),
        }

    def get_execution_history(self, limit: int = 30) -> list[dict[str, Any]]:
        limits = self._get_limits()
        return self._execution_history[: clamp_int(limit, 1, limits["maxExecHistory"])]

    def clear_execution_history(self) -> dict[str, int]:
        deleted = len(self._execution_history)
        self._execution_history.clear()
        self._schedule_persist()
        return {"deleted": deleted}

    def find_execution_by_mode_id(self, mode_id: str) -> dict[str, Any] | None:
        return next((e for e in self._execution_history if e.get("modeId") == mode_id), None)

    def get_latest_execution(self) -> dict[str, Any] | None:
        return self._execution_history[0] if self._execution_history else None

    def trim_to_limits(self) -> None:
        limits = self._get_limits()
        if len(self._trigger_logs) > limits["maxTriggerLogs"]:
            del self._trigger_logs[limits["maxTriggerLogs"] :]
        if len(self._execution_history) > limits["maxExecHistory"]:
            del self._execution_history[limits["maxExecHistory"] :]
        self._schedule_persist()


def _iso_now() -> str:
    from datetime import datetime

    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def normalize_home_mode_json_array(
    raw: Any, label: str, require_entity_id: bool = False
) -> list[dict[str, Any]] | None:
    """校验并规范化 config / triggers JSON 数组（返回可写入的数组）。"""
    if raw is None:
        return None
    if not isinstance(raw, list):
        bad_request(api_error("VALIDATION_JSON_ARRAY_TYPE", label))
    parsed: list[Any] = raw
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            bad_request(api_error("VALIDATION_ARRAY_ITEM_INVALID", label, index))
        if require_entity_id and not str(item.get("entity_id") or "").strip():
            bad_request(api_error("VALIDATION_ARRAY_ITEM_ENTITY_ID", label, index))
        if not require_entity_id:
            trigger_type = str(item.get("type") or "").strip()
            if not trigger_type:
                bad_request(api_error("VALIDATION_ARRAY_ITEM_TYPE", label, index))
            if trigger_type == "time":
                at = normalize_home_mode_time_at(item.get("at"))
                if not at:
                    bad_request(api_error("VALIDATION_ARRAY_ITEM_TIME", label, index))
                item["at"] = at
            if trigger_type == "lock_unlock" and not str(item.get("entityId") or "").strip():
                bad_request(api_error("VALIDATION_ARRAY_ITEM_LOCK_ENTITY", label, index))
            if trigger_type == "state":
                if not str(item.get("entityId") or "").strip():
                    bad_request(api_error("VALIDATION_ARRAY_ITEM_STATE_ENTITY", label, index))
                if not str(item.get("to") or "").strip():
                    bad_request(api_error("VALIDATION_ARRAY_ITEM_STATE_TO", label, index))
    return parsed
