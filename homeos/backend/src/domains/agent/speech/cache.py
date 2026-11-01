"""TTS 音频缓存与「待合成参数」。

两层结构：

- ``<data_dir>/tts/<cacheKey>.mp3``：合成结果。命中直接回读，不再打上游；
- ``<data_dir>/tts/pending/<cacheKey>.json``：**参数 sidecar**。对话只签 URL 不合成，
  浏览器真正来取音频时才合成 —— 参数必须能从 key 还原出来。放文件而不是进程内
  字典，是因为签名 URL 活 10 分钟，这期间进程可能重启、请求可能落到另一个副本。

缓存淘汰是惰性的（每次写入最多触发一次，间隔 5 分钟）：按时间删 30 天前的，
再按 LRU 删到 200MB 以内。定时器会随进程生命周期管理，不值得为磁盘缓存单独起线程。
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("homeos.agent.tts.cache")

#: 缓存目录名（在 ``<data_dir>`` 下）
CACHE_DIR_NAME = "tts"
#: 参数 sidecar 子目录
PENDING_DIR_NAME = "pending"
#: 音频扩展名（与 URL 里的文件名后缀保持一致）
AUDIO_SUFFIX = ".mp3"
#: 缓存键版本：算法或格式变更时 +1，避免旧音频被当成新参数命中
KEY_VERSION = "v1"
#: 音频保留天数
RETENTION_DAYS = 30
#: 缓存体积上限
MAX_BYTES = 200 * 1024 * 1024
#: 待合成参数保留时间（签名 URL 只有 10 分钟，留足重试余量）
PENDING_TTL_SECONDS = 30 * 60
#: 惰性清理的最小间隔
PRUNE_INTERVAL_SECONDS = 5 * 60


def compute_cache_key(
    engine: str,
    voice: str,
    rate: int,
    pitch: int,
    text: str,
    audio_format: str = "mp3",
) -> str:
    """缓存键：相同参数 + 相同文本 → 相同音频。"""
    material = f"{engine}:{voice}:{rate}:{pitch}:{audio_format}:{KEY_VERSION}:{text}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


class TtsCacheService:
    """磁盘缓存；``root`` 为空时退化为纯内存（单元测试 / 无数据目录的场景）。"""

    def __init__(self, root: Path | None, *, retention_days: int = RETENTION_DAYS, max_bytes: int = MAX_BYTES) -> None:
        self._root = Path(root) if root is not None else None
        self._retention_seconds = max(1, int(retention_days)) * 86400
        self._max_bytes = max(1, int(max_bytes))
        self._memory: dict[str, bytes] = {}
        self._pending_memory: dict[str, dict[str, Any]] = {}
        self._last_prune = 0.0

    # —— 路径 ——
    def _audio_path(self, cache_key: str) -> Path | None:
        return None if self._root is None else self._root / f"{cache_key}{AUDIO_SUFFIX}"

    def _pending_path(self, cache_key: str) -> Path | None:
        return None if self._root is None else self._root / PENDING_DIR_NAME / f"{cache_key}.json"

    # —— 音频 ——
    def has(self, cache_key: str) -> bool:
        if cache_key in self._memory:
            return True
        path = self._audio_path(cache_key)
        return path is not None and path.is_file()

    def size(self, cache_key: str) -> int:
        cached = self._memory.get(cache_key)
        if cached is not None:
            return len(cached)
        path = self._audio_path(cache_key)
        if path is None:
            return 0
        try:
            return path.stat().st_size
        except OSError as exc:
            logger.debug("读取 TTS 缓存大小失败 %s: %s", path, exc)
            return 0

    def read(self, cache_key: str) -> bytes:
        """整段读取；文件不存在时返回空字节串（调用方据此判断是否需要合成）。"""
        cached = self._memory.get(cache_key)
        if cached is not None:
            return cached
        path = self._audio_path(cache_key)
        if path is None:
            return b""
        try:
            return path.read_bytes()
        except OSError as exc:
            logger.debug("读取 TTS 缓存失败 %s: %s", cache_key, exc)
            return b""

    def save(self, cache_key: str, payload: bytes) -> None:
        """写入缓存；落盘失败只记日志，不影响本次播放。"""
        if not payload:
            return
        path = self._audio_path(cache_key)
        if path is None:
            self._memory[cache_key] = payload
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            # 先写临时文件再 replace：并发读取不会读到半截 mp3
            temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
            temporary.write_bytes(payload)
            temporary.replace(path)
        except OSError as exc:
            logger.warning("写入 TTS 缓存失败 %s: %s", cache_key, exc)
        self._maybe_prune()

    def touch(self, cache_key: str) -> None:
        """更新访问时间，供 LRU 淘汰使用。"""
        path = self._audio_path(cache_key)
        if path is None or not path.is_file():
            return
        try:
            os.utime(path, None)
        except OSError as exc:
            logger.debug("更新 TTS 缓存时间失败 %s: %s", cache_key, exc)

    # —— 待合成参数 ——
    def write_pending(self, cache_key: str, params: dict[str, Any]) -> None:
        payload = {**params, "createdAt": time.time()}
        path = self._pending_path(cache_key)
        if path is None:
            self._pending_memory[cache_key] = payload
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            logger.warning("写入 TTS 待合成参数失败 %s: %s", cache_key, exc)

    def read_pending(self, cache_key: str) -> dict[str, Any] | None:
        cached = self._pending_memory.get(cache_key)
        if isinstance(cached, dict):
            return cached
        path = self._pending_path(cache_key)
        if path is None:
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            logger.debug("读取 TTS 待合成参数失败 %s: %s", cache_key, exc)
            return None
        if not isinstance(raw, dict):
            return None
        created = raw.get("createdAt")
        if isinstance(created, (int, float)) and time.time() - float(created) > PENDING_TTL_SECONDS:
            return None
        return raw

    # —— 清理 ——
    def _maybe_prune(self) -> None:
        now = time.monotonic()
        if now - self._last_prune < PRUNE_INTERVAL_SECONDS:
            return
        self._last_prune = now
        self.prune()

    def prune(self, now: float | None = None) -> None:
        """删除过期音频与过期参数文件；目录不存在时静默返回。"""
        if self._root is None or not self._root.is_dir():
            return
        moment = time.time() if now is None else now
        survivors: list[tuple[float, int, Path]] = []
        total = 0
        for entry in self._root.iterdir():
            if entry.name == PENDING_DIR_NAME or not entry.is_file() or entry.suffix != AUDIO_SUFFIX:
                continue
            try:
                stat = entry.stat()
            except OSError as exc:
                logger.debug("清理 TTS 缓存时无法读取 %s: %s", entry, exc)
                continue
            if moment - stat.st_mtime > self._retention_seconds:
                self._unlink(entry)
                continue
            total += stat.st_size
            survivors.append((stat.st_mtime, stat.st_size, entry))
        self._evict(survivors, total)
        self._prune_pending(moment)

    def _evict(self, survivors: list[tuple[float, int, Path]], total: int) -> None:
        if total <= self._max_bytes:
            return
        for _mtime, size, entry in sorted(survivors):
            if total <= self._max_bytes:
                break
            self._unlink(entry)
            total -= size

    def _prune_pending(self, moment: float) -> None:
        pending_dir = self._root / PENDING_DIR_NAME if self._root is not None else None
        if pending_dir is None or not pending_dir.is_dir():
            return
        for entry in pending_dir.iterdir():
            if not entry.is_file():
                continue
            try:
                if moment - entry.stat().st_mtime > PENDING_TTL_SECONDS:
                    self._unlink(entry)
            except OSError as exc:
                logger.debug("清理 TTS 待合成参数时无法读取 %s: %s", entry, exc)
                continue

    @staticmethod
    def _unlink(path: Path) -> None:
        try:
            path.unlink()
        except OSError as exc:
            logger.debug("删除 TTS 缓存失败 %s: %s", path, exc)


__all__ = [
    "AUDIO_SUFFIX",
    "CACHE_DIR_NAME",
    "KEY_VERSION",
    "PENDING_TTL_SECONDS",
    "TtsCacheService",
    "compute_cache_key",
]
