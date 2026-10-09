"""USGS 震中坐标 → 中文地名（反向地理编码 + Redis 缓存）。

对齐 ``earthquake/place-localize.util.ts``：
 - BigDataCloud 首选、Nominatim 兜底；
 - 内存 Map → Redis（30 天 TTL）→ 远程 API 三级缓存；
 - 批量并发查询（4 并发，最多 40 个坐标）；
 - 仅保留含 CJK 字符的结果，过滤无效翻译。
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("homeos.earthquake.place")

#: Redis 缓存键前缀
PLACE_ZH_CACHE_PREFIX = "homeos:eew:place-zh:"
#: Redis 缓存 TTL（秒），30 天
PLACE_ZH_CACHE_TTL_SEC = 30 * 24 * 60 * 60
#: 单次反向地理编码请求超时（毫秒）
PLACE_ZH_LOOKUP_TIMEOUT_MS = 4_000
#: 单次批量查询最多处理的坐标数
PLACE_ZH_MAX_LOOKUPS = 40
#: 并发查询数
PLACE_ZH_CONCURRENCY = 4

#: BigDataCloud 反向地理编码 API 地址（首选）
BIGDATACLOUD_REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client"
#: Nominatim 反向地理编码 API 地址（备选）
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

_CJK_RE = re.compile(r"[\u3400-\u9fff]")


@dataclass
class PlaceLocalizeDeps:
    """地点本地化依赖注入（HTTP GET + Redis get/set）。"""

    get: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
    redis_get: Callable[[str], Awaitable[Any]] | None = None
    redis_set: Callable[[str, str, int], Awaitable[Any]] | None = None


def _fixed2(value: float) -> str:
    return f"{float(value):.2f}"


def place_localize_cache_key(latitude: float, longitude: float) -> str:
    """坐标对应的 Redis 缓存键（精度 2 位小数）。"""
    return f"{PLACE_ZH_CACHE_PREFIX}{_fixed2(latitude)}:{_fixed2(longitude)}"


def coord_key(latitude: float, longitude: float) -> str:
    return f"{_fixed2(latitude)}:{_fixed2(longitude)}"


def _push(parts: list[str], value: Any) -> None:
    text = str(value if value is not None else "").strip()
    if not text or text in parts:
        return
    parts.append(text)


def format_place_zh_from_bigdatacloud(body: Any) -> str | None:
    """将 BigDataCloud 响应格式化为中文地名。"""
    if not isinstance(body, dict):
        return None
    parts: list[str] = []
    _push(parts, body.get("countryName"))
    _push(parts, body.get("principalSubdivision"))
    _push(parts, body.get("city"))
    _push(parts, body.get("locality"))

    if not parts:
        locality_info = body.get("localityInfo")
        admin = locality_info.get("administrative") if isinstance(locality_info, dict) else None
        if isinstance(admin, list):
            rows = [row for row in admin if isinstance(row, dict) and row.get("name")]
            rows.sort(key=lambda row: _sort_num(row.get("order")), reverse=True)
            for row in rows[:4]:
                _push(parts, row.get("name"))

    return "".join(parts) if parts else None


def format_place_zh_from_nominatim(body: Any) -> str | None:
    """将 Nominatim 响应格式化为中文地名。"""
    if not isinstance(body, dict):
        return None
    addr = body.get("address")
    if not isinstance(addr, dict):
        display = str(body.get("display_name") or "").strip()
        return display or None

    parts: list[str] = []
    _push(parts, addr.get("country"))
    _push(parts, addr.get("state") or addr.get("province") or addr.get("region"))
    _push(
        parts,
        addr.get("county") or addr.get("city") or addr.get("town") or addr.get("village") or addr.get("hamlet"),
    )
    _push(parts, addr.get("suburb") or addr.get("neighbourhood") or addr.get("isolated_dwelling"))

    if not parts:
        display = str(body.get("display_name") or "").strip()
        return display or None
    return "".join(parts)


def has_cjk_text(text: str) -> bool:
    """文本是否包含 CJK 字符（用于过滤无效翻译结果）。"""
    return bool(_CJK_RE.search(text or ""))


async def _read_cached_place(
    deps: PlaceLocalizeDeps, latitude: float, longitude: float
) -> str | None:
    if deps.redis_get is None:
        return None
    try:
        raw = await deps.redis_get(place_localize_cache_key(latitude, longitude))
    except Exception:
        return None
    text = str(raw.decode("utf-8", "ignore") if isinstance(raw, bytes) else (raw or "")).strip()
    return text or None


async def _write_cached_place(
    deps: PlaceLocalizeDeps, latitude: float, longitude: float, place_zh: str
) -> None:
    if deps.redis_set is None:
        return
    try:
        await deps.redis_set(
            place_localize_cache_key(latitude, longitude), place_zh, PLACE_ZH_CACHE_TTL_SEC
        )
    except Exception:
        pass


async def lookup_place_zh_remote(
    deps: PlaceLocalizeDeps, latitude: float, longitude: float
) -> str | None:
    """远程反向地理编码；BigDataCloud 优先，无 CJK 时回退 Nominatim。"""
    try:
        result = await deps.get(
            BIGDATACLOUD_REVERSE_URL,
            {
                "timeout": PLACE_ZH_LOOKUP_TIMEOUT_MS,
                "params": {
                    "latitude": latitude,
                    "longitude": longitude,
                    "localityLanguage": "zh",
                },
            },
        )
        from_bdc = format_place_zh_from_bigdatacloud(result.get("data"))
        if from_bdc and has_cjk_text(from_bdc):
            return from_bdc
    except Exception:
        pass

    try:
        result = await deps.get(
            NOMINATIM_REVERSE_URL,
            {
                "timeout": PLACE_ZH_LOOKUP_TIMEOUT_MS,
                "headers": {
                    "Accept": "application/json",
                    "User-Agent": "HomeOS/1.0 (earthquake-place-localize)",
                },
                "params": {
                    "lat": latitude,
                    "lon": longitude,
                    "format": "json",
                    "accept-language": "zh-CN",
                    "zoom": 8,
                },
            },
        )
        from_nom = format_place_zh_from_nominatim(result.get("data"))
        if from_nom and has_cjk_text(from_nom):
            return from_nom
    except Exception:
        return None

    return None


async def _resolve_place_zh(
    deps: PlaceLocalizeDeps,
    latitude: float,
    longitude: float,
    memory_cache: dict[str, str | None],
) -> str | None:
    key = coord_key(latitude, longitude)
    if key in memory_cache:
        return memory_cache[key]

    cached = await _read_cached_place(deps, latitude, longitude)
    if cached:
        memory_cache[key] = cached
        return cached

    remote = await lookup_place_zh_remote(deps, latitude, longitude)
    memory_cache[key] = remote
    if remote:
        await _write_cached_place(deps, latitude, longitude, remote)
    return remote


async def map_with_concurrency(
    items: list[Any],
    concurrency: int,
    worker: Callable[[Any, int], Awaitable[Any]],
) -> list[Any]:
    """并发执行 worker（顺序与 items 一致）。"""
    if not items:
        return []
    results: list[Any] = [None] * len(items)
    cursor = 0
    lock = asyncio.Lock()

    async def run_worker() -> None:
        nonlocal cursor
        while True:
            async with lock:
                if cursor >= len(items):
                    return
                index = cursor
                cursor += 1
            results[index] = await worker(items[index], index)

    await asyncio.gather(*[run_worker() for _ in range(min(concurrency, len(items)))])
    return results


async def enrich_usgs_places_with_chinese(
    items: list[dict[str, Any]], deps: PlaceLocalizeDeps
) -> list[dict[str, Any]]:
    """批量为 USGS 地震事件补充中文地名（``place`` 中文、``placeEn`` 保留原英文）。"""
    if not items:
        return items

    unique_coords: dict[str, tuple[float, float]] = {}
    for item in items:
        latitude = _finite(item.get("latitude"))
        longitude = _finite(item.get("longitude"))
        if latitude is None or longitude is None:
            continue
        key = coord_key(latitude, longitude)
        if key not in unique_coords:
            unique_coords[key] = (latitude, longitude)

    memory_cache: dict[str, str | None] = {}
    coord_list = list(unique_coords.items())[:PLACE_ZH_MAX_LOOKUPS]

    async def _worker(entry: tuple[str, tuple[float, float]], _index: int) -> Any:
        key, (latitude, longitude) = entry
        await _resolve_place_zh(deps, latitude, longitude, memory_cache)
        return key

    await map_with_concurrency(coord_list, PLACE_ZH_CONCURRENCY, _worker)

    out: list[dict[str, Any]] = []
    for item in items:
        latitude = _finite(item.get("latitude"))
        longitude = _finite(item.get("longitude"))
        if latitude is None or longitude is None:
            out.append(item)
            continue
        place_en = item.get("place")
        place_zh = memory_cache.get(coord_key(latitude, longitude))
        if not place_zh or place_zh == place_en:
            out.append(item)
            continue
        out.append({**item, "place": place_zh, "placeEn": place_en})
    return out


def _sort_num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _finite(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):  # NaN / Inf
        return None
    return number


__all__ = [
    "BIGDATACLOUD_REVERSE_URL",
    "NOMINATIM_REVERSE_URL",
    "PLACE_ZH_CACHE_TTL_SEC",
    "PlaceLocalizeDeps",
    "coord_key",
    "enrich_usgs_places_with_chinese",
    "format_place_zh_from_bigdatacloud",
    "format_place_zh_from_nominatim",
    "has_cjk_text",
    "lookup_place_zh_remote",
    "map_with_concurrency",
    "place_localize_cache_key",
]
