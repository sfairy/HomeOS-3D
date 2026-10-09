"""调度作业统一注册中心（对齐 ``shared/jobs/registry.service.ts``）。

为全站 setInterval / Cron 循环提供统一的运行监控（lastRunAt / lastDurationMs /
lastError / nextRunAt / runs），并通过 ``GET /system/jobs`` 暴露给前端诊断面板（只读）。

接入方式（不改变既有定时器生命周期）::

    jobs.run("data-retention", {"description": "...", "intervalMs": ms}, self.run_cleanup)
"""

from __future__ import annotations

import inspect
import logging
import threading
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("homeos.jobs")


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _error_message(err: BaseException) -> str:
    text = str(err).strip()
    return text or err.__class__.__name__


class JobRegistryService:
    """作业注册与运行监控（线程安全：定时器线程与事件循环均可能写入）。"""

    def __init__(self) -> None:
        self._jobs: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    # 登记
    # ------------------------------------------------------------------ #
    def register(self, name: str, options: dict[str, Any] | None = None) -> None:
        """登记作业元数据（纯登记，不启动任何定时器）。"""
        opts = options or {}
        with self._lock:
            existing = self._jobs.get(name)
            self._jobs[name] = {
                "description": opts.get("description", existing["description"] if existing else ""),
                "intervalMs": opts.get("intervalMs", existing["intervalMs"] if existing else None),
                "enabled": opts.get("enabled", existing["enabled"] if existing else True),
                "runs": existing["runs"] if existing else 0,
                "lastRunAt": existing["lastRunAt"] if existing else None,
                "lastDurationMs": existing["lastDurationMs"] if existing else None,
                "lastError": existing["lastError"] if existing else None,
            }

    # ------------------------------------------------------------------ #
    # 执行
    # ------------------------------------------------------------------ #
    async def run(
        self,
        name: str,
        options: dict[str, Any] | None,
        fn: Callable[[], Any],
    ) -> Any:
        """执行一次带监控的作业：记录耗时 / 错误 / 下次运行时间。

        异常会原样抛出（由调用方既有 try/catch 接管），状态已记录。
        """
        self.register(name, options)
        started_at = datetime.now(UTC).timestamp() * 1000
        try:
            result = fn()
            if inspect.isawaitable(result):
                result = await result
        except BaseException as err:
            self._complete(name, started_at, _error_message(err))
            raise
        self._complete(name, started_at, None)
        return result

    def tick(self, name: str, options: dict[str, Any] | None = None) -> None:
        """记录一次已由调用方自行 try/catch 的作业执行（无耗时统计精度要求时使用）。"""
        opts = options or {}
        self.register(name, opts)
        with self._lock:
            entry = self._jobs.get(name)
            if entry is None:
                return
            entry["runs"] += 1
            entry["lastRunAt"] = _iso_now()
            entry["lastError"] = None
            if opts.get("intervalMs"):
                entry["intervalMs"] = opts["intervalMs"]

    # ------------------------------------------------------------------ #
    # 查询
    # ------------------------------------------------------------------ #
    def list(self) -> list[dict[str, Any]]:
        """全部作业快照（按登记时间排序，供诊断面板只读展示）。"""
        with self._lock:
            snapshot = [
                {
                    "name": name,
                    "description": job["description"],
                    "intervalMs": job["intervalMs"],
                    "enabled": job["enabled"],
                    "runs": job["runs"],
                    "lastRunAt": job["lastRunAt"],
                    "lastDurationMs": job["lastDurationMs"],
                    "lastError": job["lastError"],
                    "nextRunAt": self._next_run_at(job["lastRunAt"], job["intervalMs"]),
                }
                for name, job in self._jobs.items()
            ]
        return snapshot

    def _complete(self, name: str, started_at_ms: float, error: str | None) -> None:
        with self._lock:
            entry = self._jobs.get(name)
            if entry is None:
                return
            entry["runs"] += 1
            entry["lastRunAt"] = _ms_to_iso(started_at_ms)
            entry["lastDurationMs"] = round(datetime.now(UTC).timestamp() * 1000 - started_at_ms)
            entry["lastError"] = error

    @staticmethod
    def _next_run_at(last_run_at: str | None, interval_ms: Any) -> str | None:
        """下次运行 = 上次完成时间 + 周期；尚未跑过则无法推算。"""
        if not isinstance(interval_ms, (int, float)) or interval_ms <= 0:
            return None
        if not last_run_at:
            return None
        try:
            last = datetime.strptime(last_run_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)
        except ValueError:
            return None
        return _ms_to_iso(last.timestamp() * 1000 + interval_ms)


def _ms_to_iso(milliseconds: float) -> str:
    moment = datetime.fromtimestamp(milliseconds / 1000, tz=UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


__all__ = ["JobRegistryService"]
