"""EEW 轮询服务（对齐 ``earthquake/eew-poll.service.ts``）。

启动后延迟 8 秒首次拉取，随后：
 - 每 18 秒并发拉取 SC EEW + CENC EEW（Wolfx HTTP 镜像）；
 - 每 60 秒在 Wolfx WS 断开超过 60 秒时用 USGS 兜底。

仅 EEW Leader 且启用 EEW 时才真正请求。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from .feeds import parse_usgs_feature_as_eew, parse_wolfx_eew_http_json, resolve_usgs_feed_url

logger = logging.getLogger("homeos.earthquake.poll")

#: SC 地震局 EEW（Wolfx HTTP 镜像）
SC_EEW_URL = "https://api.wolfx.jp/sc_eew.json"
#: 中国地震台网中心 EEW（Wolfx HTTP 镜像）
CENC_EEW_URL = "https://api.wolfx.jp/cenc_eew.json"
DUAL_POLL_MS = 18_000
USGS_POLL_MS = 60_000
BOOT_DELAY_MS = 8_000
#: Wolfx WS 断开超过该时长才启用 USGS 兜底
WOLFX_DOWN_FOR_USGS_MS = 60_000
#: USGS 兜底每轮最多上报条数
USGS_MAX_INGEST_PER_ROUND = 3
#: USGS 已见事件 ID 上限（超出后保留最近 40 条）
USGS_SEEN_MAX = 80


async def _fetch_json(url: str, timeout_ms: int = 12_000) -> Any:
    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        response = await client.get(url, headers={"Accept": "application/json"})
        response.raise_for_status()
        return response.json()


class EewPollService:
    """SC / CENC / USGS 主动轮询服务。"""

    def __init__(self, earthquake: Any, leader: Any, jobs: Any = None) -> None:
        self._earthquake = earthquake
        self._leader = leader
        self._jobs = jobs
        self._task: asyncio.Task[None] | None = None
        self._usgs_task: asyncio.Task[None] | None = None
        self._stopped = False
        self._last_sc_report: tuple[str, float, float] | None = None
        self._last_cenc_report: tuple[str, float, float] | None = None
        self._last_usgs_ids: list[str] = []

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        self._stopped = False
        self._task = asyncio.create_task(self._dual_loop(), name="eew-dual-poll")
        self._usgs_task = asyncio.create_task(self._usgs_loop(), name="eew-usgs-poll")

    async def stop(self) -> None:
        self._stopped = True
        for task in (self._task, self._usgs_task):
            if task is not None and not task.done():
                task.cancel()
        for task in (self._task, self._usgs_task):
            if task is None:
                continue
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        self._usgs_task = None

    async def _dual_loop(self) -> None:
        try:
            await asyncio.sleep(BOOT_DELAY_MS / 1000)
        except asyncio.CancelledError:
            raise
        while not self._stopped:
            try:
                await self._run_job(
                    "earthquake-eew-dual-poll",
                    "SC EEW + CENC EEW 主动查询",
                    DUAL_POLL_MS,
                    self.poll_dual_sources,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("EEW 双源轮询任务异常: %s", exc)
            try:
                await asyncio.sleep(DUAL_POLL_MS / 1000)
            except asyncio.CancelledError:
                raise

    async def _usgs_loop(self) -> None:
        try:
            await asyncio.sleep(BOOT_DELAY_MS / 1000)
        except asyncio.CancelledError:
            raise
        while not self._stopped:
            try:
                await self._run_job(
                    "earthquake-usgs-backup-poll",
                    "USGS EEW 兜底轮询",
                    USGS_POLL_MS,
                    self.poll_usgs_backup,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("USGS 兜底轮询任务异常: %s", exc)
            try:
                await asyncio.sleep(USGS_POLL_MS / 1000)
            except asyncio.CancelledError:
                raise

    async def _run_job(
        self, name: str, description: str, interval_ms: int, runner: Callable[[], Awaitable[Any]]
    ) -> Any:
        if self._jobs is None:
            return await runner()
        return await self._jobs.run(
            name, {"description": description, "intervalMs": interval_ms}, runner
        )

    async def poll_now(self) -> None:
        """状态面板刷新时立即拉一次（仅 Leader 且启用时真正请求）。"""
        await self.poll_dual_sources()
        await self.poll_usgs_backup()

    # ------------------------------------------------------------------ #
    # 轮询实现
    # ------------------------------------------------------------------ #
    async def poll_dual_sources(self) -> None:
        if not self._leader.is_eew_leader():
            return
        await self._earthquake.ensure_runtime_config()
        if not self._earthquake.get_runtime_config().enabled:
            return
        await asyncio.gather(self._poll_sc_eew(), self._poll_cenc_eew())

    async def _poll_sc_eew(self) -> None:
        try:
            body = await _fetch_json(SC_EEW_URL)
            self._earthquake.record_source_poll("sc_eew", {"ok": True})
            eew = parse_wolfx_eew_http_json(body, "sc_eew")
            if eew is None:
                return
            # 以 (event_id, report_id, 震级) 去重：同一事件的震级升级（新报告）必须放行。
            key = (eew.event_id, eew.report_id, round(float(eew.magnitude or 0.0), 1))
            if key == self._last_sc_report:
                return
            self._last_sc_report = key
            self._earthquake.ingest_eew(eew)
        except Exception as exc:
            message = str(exc)
            self._earthquake.record_source_poll("sc_eew", {"ok": False, "error": message})
            logger.warning("SC EEW 轮询失败: %s", message)

    async def _poll_cenc_eew(self) -> None:
        try:
            body = await _fetch_json(CENC_EEW_URL)
            self._earthquake.record_source_poll("cenc_eew", {"ok": True})
            eew = parse_wolfx_eew_http_json(body, "cenc_eew")
            if eew is None:
                return
            # 以 (event_id, report_id, 震级) 去重：同一事件的震级升级（新报告）必须放行。
            key = (eew.event_id, eew.report_id, round(float(eew.magnitude or 0.0), 1))
            if key == self._last_cenc_report:
                return
            self._last_cenc_report = key
            self._earthquake.ingest_eew(eew)
        except Exception as exc:
            message = str(exc)
            self._earthquake.record_source_poll("cenc_eew", {"ok": False, "error": message})
            logger.warning("CENC EEW 轮询失败: %s", message)

    async def poll_usgs_backup(self) -> None:
        if not self._leader.is_eew_leader():
            return
        await self._earthquake.ensure_runtime_config()
        if not self._earthquake.get_runtime_config().enabled:
            return
        if not self._earthquake.should_use_usgs_backup(WOLFX_DOWN_FOR_USGS_MS):
            return

        try:
            url = resolve_usgs_feed_url("hour")
            body = await _fetch_json(url)
            self._earthquake.record_source_poll("usgs", {"ok": True})
            features = body.get("features") if isinstance(body, dict) else None
            if not isinstance(features, list):
                return

            seen = set(self._last_usgs_ids)
            ingested = 0
            for feature in features[:15]:
                eew = parse_usgs_feature_as_eew(feature)
                if eew is None or eew.event_id in seen:
                    continue
                seen.add(eew.event_id)
                self._last_usgs_ids.append(eew.event_id)
                self._earthquake.ingest_eew(eew)
                ingested += 1
                if ingested >= USGS_MAX_INGEST_PER_ROUND:
                    break
            if len(self._last_usgs_ids) > USGS_SEEN_MAX:
                self._last_usgs_ids = self._last_usgs_ids[-40:]
        except Exception as exc:
            message = str(exc)
            self._earthquake.record_source_poll("usgs", {"ok": False, "error": message})
            logger.warning("USGS 兜底轮询失败: %s", message)


__all__ = ["CENC_EEW_URL", "SC_EEW_URL", "EewPollService"]
