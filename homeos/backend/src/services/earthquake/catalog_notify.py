"""CENC 震情目录新增事件定时通知服务（对齐 ``earthquake/catalog-notify.service.ts``）。

工作机制：
 - 每 5 分钟拉取一次 CENC「近 24 小时」目录（max 50 条）；
 - 维护 Redis 中最近 200 个已通知 eventId（7 天 TTL），Redis 不可用时回退进程内集合；
 - 启用 EEW 且配置了家庭坐标时按与 EEW 相同阈值（aligned）通知，否则按
   ``catalog_only`` 宽松规则通知；
 - 启用 EEW 时同步将达标事件记入本地预警（``recordCatalogLocalAlert``）；
 - 仅 EEW Leader 实例执行实际拉取与通知，避免重复发送。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from .state import (
    format_catalog_notify_message,
    resolve_catalog_notify_level,
    should_notify_catalog_event,
)
from .types import eew_catalog_cooldown_key

logger = logging.getLogger("homeos.earthquake.catalog")

POLL_MS = 5 * 60 * 1000
BOOT_DELAY_MS = 15_000
SEEN_KEY = "homeos:eew:cenc-notified-ids"
SEEN_MAX = 200
#: 目录速报的通知冷却（分钟）：与通知模块确认通报共用同一冷却键
CATALOG_NOTIFY_COOLDOWN_MIN = 10
SEEN_TTL_SEC = 7 * 24 * 3600


class EarthquakeCatalogNotifyService:
    """CENC 震情目录新增事件定时通知服务。"""

    def __init__(
        self,
        earthquake_service: Any,
        global_service: Any,
        leader: Any,
        notification_service: Any,
        cooldown_service: Any,
        redis: Any,
        jobs: Any = None,
    ) -> None:
        self._earthquake = earthquake_service
        self._global = global_service
        self._leader = leader
        self._notification = notification_service
        self._cooldown = cooldown_service
        self._redis = redis
        self._jobs = jobs
        self._task: asyncio.Task[None] | None = None
        self._stopped = False
        #: 进程内已通知 eventId 兜底集合（Redis 不可用时保底去重）
        self._mem_seen_ids: list[str] = []

    async def start(self) -> None:
        self._stopped = False
        self._task = asyncio.create_task(self._loop(), name="eew-catalog-notify")

    async def stop(self) -> None:
        self._stopped = True
        if self._task is not None and not self._task.done():
            self._task.cancel()
        if self._task is not None:
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._task = None

    async def _loop(self) -> None:
        try:
            await asyncio.sleep(BOOT_DELAY_MS / 1000)
        except asyncio.CancelledError:
            raise
        while not self._stopped:
            try:
                if self._jobs is not None:
                    await self._jobs.run(
                        "earthquake-catalog-notify",
                        {"description": "CENC 震情目录轮询通知", "intervalMs": POLL_MS},
                        self._tick,
                    )
                else:
                    await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.debug("CENC 震情通知轮询失败: %s", exc)
            try:
                await asyncio.sleep(POLL_MS / 1000)
            except asyncio.CancelledError:
                raise

    async def _tick(self) -> None:
        if not self._leader.is_eew_leader():
            return
        try:
            await self._check_new_cenc_events()
        except Exception as exc:  # noqa: BLE001
            logger.debug("CENC 震情通知轮询失败: %s", exc)

    async def _check_new_cenc_events(self) -> None:
        await self._earthquake.ensure_runtime_config()
        runtime = self._earthquake.get_runtime_config()
        home = self._earthquake.get_home_coordinates()
        home_configured = home.get("lat") is not None and home.get("lon") is not None

        feed = await self._global.get_recent_feed(
            {"source": "cenc", "period": "day", "minMagnitude": 2, "limit": 50}
        )
        items = [item for item in feed.get("items", []) if isinstance(item, dict)]

        ids = [str(item.get("id")) for item in items if item.get("id")]
        if not ids:
            return

        seen = await self._load_seen_ids()
        if not seen:
            await self._save_seen_ids(ids)
            logger.info("CENC 震情通知: 已初始化 %s 条已知事件", len(ids))
            return

        if runtime.enabled and home.get("lat") is not None and home.get("lon") is not None:
            notify_opts: dict[str, Any] = {
                "mode": "aligned",
                "minMagnitude": runtime.min_magnitude,
                "maxDistanceKm": runtime.max_distance,
                "minLocalIntensity": runtime.min_local_intensity,
                "homeLat": home["lat"],
                "homeLon": home["lon"],
            }
        else:
            notify_opts = {
                "mode": "catalog_only",
                "minMagnitude": runtime.min_magnitude if runtime.enabled else 4,
                "maxDistanceKm": runtime.max_distance if runtime.enabled else None,
                "homeConfigured": home_configured,
            }

        new_ids: list[str] = []
        for item in items:
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen:
                continue
            new_ids.append(item_id)
            if not should_notify_catalog_event(item, notify_opts):
                continue

            level = resolve_catalog_notify_level(item)
            delivered = await self._notification.notify(
                level,
                format_catalog_notify_message(item),
                "earthquake-catalog",
                item_id,
                {
                    "channels": ["in_app", "socket", "webpush"],
                    # 目录事件为台网正式测定结果，与实时预警标题分流
                    "title": "地震速报(官方已确认)",
                },
            )

            # 目录轮询已直投：占位与确认通报共用的冷却键，避免随后 CONFIRMATION 双发
            if delivered:
                self._cooldown.set_cooldown(
                    "notify", eew_catalog_cooldown_key(item_id), CATALOG_NOTIFY_COOLDOWN_MIN
                )

            # 启用 EEW 时：达标目录事件同步写入本地预警，与设置阈值一致
            if notify_opts["mode"] == "aligned":
                try:
                    await self._earthquake.record_catalog_local_alert(item)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("目录震情写入本地预警失败: %s", exc)

        if new_ids:
            await self._save_seen_ids([*seen, *new_ids])
            logger.info("CENC 震情通知: 发现 %s 条新事件", len(new_ids))

    # ------------------------------------------------------------------ #
    # 已通知 ID 集合
    # ------------------------------------------------------------------ #
    async def _load_seen_ids(self) -> set[str]:
        """Redis 结果与进程内兜底集合并集（Redis 故障期间不重复通知）。"""
        mem_fallback = set(self._mem_seen_ids)
        if self._redis is None or not self._redis.is_ready():
            return mem_fallback
        try:
            raw = await self._redis.get(SEEN_KEY)
            # 键不存在：Redis 可能刚被清空，优先信任进程内已知集合
            if not raw:
                return mem_fallback
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", "ignore")
            parsed = json.loads(raw)
            if not isinstance(parsed, list):
                return mem_fallback
            ids = [item for item in parsed if isinstance(item, str) and item.strip()]
            merged = list(dict.fromkeys([*ids, *mem_fallback]))
            return set(merged[-SEEN_MAX:])
        except Exception:  # noqa: BLE001
            return mem_fallback

    async def _save_seen_ids(self, ids: Any) -> None:
        unique = list(dict.fromkeys([str(item) for item in ids if item]))
        trimmed = unique[-SEEN_MAX:]
        for item in trimmed:
            if item not in self._mem_seen_ids:
                self._mem_seen_ids.append(item)
        # 进程内集合同样按 SEEN_MAX 有界，防止长跑内存增长
        if len(self._mem_seen_ids) > SEEN_MAX:
            self._mem_seen_ids = self._mem_seen_ids[-SEEN_MAX:]

        if self._redis is None or not self._redis.is_ready():
            return
        try:
            await self._redis.set(
                SEEN_KEY, json.dumps(trimmed, ensure_ascii=False), SEEN_TTL_SEC
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("CENC 已知事件写入失败: %s", exc)


__all__ = [
    "CATALOG_NOTIFY_COOLDOWN_MIN",
    "EarthquakeCatalogNotifyService",
    "POLL_MS",
    "SEEN_KEY",
]
