"""实体翻译表的缓存：内存 + 磁盘 + 同键并发去重（single-flight）。
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Awaitable, Callable

from sqlalchemy import select

from ..core.database import Database
from ..core.models import HAConnection, HAEntity



from .ha_shared import active_connection

def load_translation_context(database_manager: Database) -> tuple[HAConnection | None, set[str]]:
    """取活跃连接，以及需要向其请求实体翻译的集成名集合。
    """
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return None, set()
        # 同平台只需要一次，因此用 SQL 的 distinct 去重后再转集合。
        integrations = set(
            database.scalars(
                select(HAEntity.platform)
                .where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status == 'active',
                    HAEntity.platform.is_not(None),
                    HAEntity.translation_key.is_not(None),
                )
                .distinct()
            )
        )
        database.expunge(connection)
        return connection, integrations
#: 实体翻译表的缓存时长（秒）。翻译内容由 HA 的集成版本决定，进程生命周期内几乎不变，
TRANSLATION_CACHE_TTL_SECONDS = 3600
#: 翻译表持久化的文件名（相对 ``data/cache/``）。与更新检查的缓存同一个目录。
TRANSLATION_CACHE_FILENAME = 'entity-translations.json'
TranslationKey = tuple[str, str, tuple[str, ...]]
class EntityTranslationCache:
    """实体翻译表的缓存：内存 + 磁盘 + 同键并发去重（single-flight）。
    """

    def __init__(
        self,
        ttl_seconds: float = TRANSLATION_CACHE_TTL_SECONDS,
        cache_path: Path | None = None,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.cache_path = cache_path
        self.entries: dict[TranslationKey, tuple[float, dict[str, str]]] = {}
        self._inflight: dict[TranslationKey, asyncio.Task] = {}
        # 代次：``clear()`` 会推进它，用来作废「清空之前发起、清空之后才回来」的在途回源。
        self._generation = 0
        self._load_from_disk()

    @staticmethod
    def key(
        connection_id: str, language: str, integrations: set[str]
    ) -> TranslationKey:
        """拼缓存键；集成集合排序后入键，集合顺序不同不该另算一份。"""
        return (connection_id, language, tuple(sorted(integrations)))

    def get(self, cache_key: TranslationKey) -> dict[str, str] | None:
        """取一份还在有效期内的翻译表；过期即丢弃并返回 None。"""
        entry = self.entries.get(cache_key)
        if entry is None:
            return None
        created_at, resources = entry
        if time.monotonic() - created_at >= self.ttl_seconds:
            self.entries.pop(cache_key, None)
            return None
        return resources

    def remember(self, cache_key: TranslationKey, resources: dict[str, str]) -> None:
        self.entries[cache_key] = (time.monotonic(), resources)
        self._save_to_disk(cache_key, resources)

    async def get_or_fetch(
        self,
        cache_key: TranslationKey,
        fetch: Callable[[], Awaitable[dict[str, str]]],
    ) -> dict[str, str]:
        cached = self.get(cache_key)
        if cached is not None:
            return cached
        task = self._inflight.get(cache_key)
        if task is None:
            generation = self._generation
            task = asyncio.ensure_future(self._fetch_and_store(cache_key, fetch, generation))
            self._inflight[cache_key] = task
            task.add_done_callback(self._forget_inflight)
        return await asyncio.shield(task)

    async def _fetch_and_store(
        self,
        cache_key: TranslationKey,
        fetch: Callable[[], Awaitable[dict[str, str]]],
        generation: int,
    ) -> dict[str, str]:
        resources = await fetch()
        # 期间连接被重建过（clear() 推进了代次）：这份结果属于上一台 HA，丢掉不写回。
        if generation == self._generation:
            self.remember(cache_key, resources)
        return resources

    def _forget_inflight(self, task: asyncio.Task) -> None:
        """在途任务结束时把它摘掉，并消费掉异常（没人 await 时不留未处理异常告警）。"""
        for key, running in list(self._inflight.items()):
            if running is task:
                self._inflight.pop(key, None)
        if not task.cancelled():
            task.exception()

    def clear(self) -> None:
        """作废缓存：内存、磁盘与在途代次一起（调用方是 HA 连接的重建 / 删除）。"""
        self.entries.clear()
        self._generation += 1
        if self.cache_path is not None:
            try:
                self.cache_path.unlink(missing_ok=True)
            except OSError:
                # 删不掉只是下次可能读到上一台的表，而内存与代次都作废了 —— 不阻断连接重建。
                pass

    def _load_from_disk(self) -> None:
        """启动时把未过期的磁盘条目载回内存；任何异常都当作"没有缓存"。"""
        if self.cache_path is None:
            return
        try:
            payload = json.loads(self.cache_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return
        try:
            raw_key = payload['key']
            saved_at = float(payload['savedAt'])
            resources = payload['resources']
        except (KeyError, TypeError, ValueError):
            return
        if (
            not isinstance(raw_key, list)
            or len(raw_key) != 3
            or not isinstance(resources, dict)
        ):
            return
        connection_id, language, integrations = raw_key
        if not isinstance(integrations, list):
            return
        # 用「文件里记下的落盘时刻」换算年龄，而不是假设进程重启是瞬时的。
        age = max(0.0, time.time() - saved_at)
        if age >= self.ttl_seconds:
            return
        key: TranslationKey = (str(connection_id), str(language), tuple(str(item) for item in integrations))
        self.entries[key] = (time.monotonic() - age, resources)

    def _save_to_disk(self, cache_key: TranslationKey, resources: dict[str, str]) -> None:
        if self.cache_path is None:
            return
        connection_id, language, integrations = cache_key
        temporary = self.cache_path.with_suffix('.tmp')
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                'key': [connection_id, language, list(integrations)],
                'savedAt': time.time(),
                'resources': resources,
            }
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                json.dump(payload, output, ensure_ascii=False)
            os.replace(temporary, self.cache_path)
        except OSError:
            pass
