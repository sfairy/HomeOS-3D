"""授权服务器端点池：三批地址的选路、洗牌与失败拉黑。"""

from __future__ import annotations

import random
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass

LICENSE_RETRY_SECONDS = 120
LICENSE_ENDPOINT_BLACKLIST_SECONDS = LICENSE_RETRY_SECONDS
LICENSE_ENDPOINT_BATCH_NAMES = ('esa', 'eo', 'direct')


@dataclass(frozen=True)
class LicenseEndpoint:
    batch: str
    base_url: str


class LicenseEndpointPool:
    """优先选择 ESA/EO，最后才回退到直连源站。"""

    def __init__(self, batches: Iterable[tuple[str, Iterable[str]]], *, blacklist_seconds: int = LICENSE_ENDPOINT_BLACKLIST_SECONDS, clock: Callable[[], float] = time.monotonic, rng: random.Random | None = None) -> None:
        self._lock = threading.RLock()
        self._batches = self._normalize_batches(batches)
        self._blacklist_seconds = max(1, blacklist_seconds)
        self._clock = clock
        self._rng = rng or random.SystemRandom()
        self._blacklist_until = {}

    @staticmethod
    def _normalize_batches(batches: Iterable[tuple[str, Iterable[str]]]) -> dict[str, tuple[str, ...]]:
        normalized: dict[str, tuple[str, ...]] = dict.fromkeys(LICENSE_ENDPOINT_BATCH_NAMES, ())
        seen = set()
        for raw_name, raw_urls in batches:
            name = raw_name.strip().lower()
            if name not in normalized:
                raise ValueError(f'未知授权服务器批次：{raw_name}')
            urls = []
            for raw_url in raw_urls:
                url = raw_url.strip().rstrip('/')
                if not url or url in seen:
                    continue
                if not url.startswith(('https://', 'http://')):
                    raise ValueError('授权服务器地址必须使用 HTTP 或 HTTPS。')
                seen.add(url)
                urls.append(url)
            normalized[name] = tuple(urls)
        return normalized

    @property
    def configured(self) -> bool:
        with self._lock:
            return any(self._batches.values())

    def candidates(self) -> list[LicenseEndpoint]:
        with self._lock:
            now = self._clock()
            self._blacklist_until = {url: expires_at for url, expires_at in self._blacklist_until.items() if expires_at > now}
            available = {batch: [url for url in urls if url not in self._blacklist_until] for batch, urls in self._batches.items()}
            preferred = [batch for batch in ('esa', 'eo') if available[batch]]
            self._rng.shuffle(preferred)
            batch_order = preferred + (['direct'] if available['direct'] else [])
            result = []
            for batch in batch_order:
                urls = list(available[batch])
                self._rng.shuffle(urls)
                result.extend(LicenseEndpoint(batch=batch, base_url=url) for url in urls)
            return result

    def mark_failed(self, base_url: str) -> None:
        with self._lock:
            self._blacklist_until[base_url] = self._clock() + self._blacklist_seconds

    def retry_failed(self) -> None:
        """定时重试轮次可以在旧冷却期结束前探查各线路。"""
        with self._lock:
            self._blacklist_until.clear()

    def is_blacklisted(self, base_url: str) -> bool:
        with self._lock:
            return self._blacklist_until.get(base_url, 0) > self._clock()
