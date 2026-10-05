"""全球 / 区域地震目录服务（对齐 ``earthquake/global.service.ts``）。

CENC + USGS 双源拉取、Redis 缓存与 USGS 英文地名中文翻译。

缓存策略：
 - 新鲜窗口 5 分钟：命中则直接返回（cached=true, stale=false）
 - 陈旧窗口 24 小时：拉取失败时回退（cached=true, stale=true）
 - 缓存键按 ``source:period:minMagnitude:limit`` 分桶

数据源：
 - CENC：优先 CEIC speedsearch 直连，失败回退 Wolfx CENC 列表 API
 - USGS：GeoJSON Feed，英文地名经 ``enrich_usgs_places_with_chinese`` 翻译为中文
"""

from __future__ import annotations

import json
import logging
import math
import time
from typing import Any

import httpx

from ...core.errors import BusinessException, ErrorCode
from .feeds import (
    WOLFX_CENC_EQ_LIST_URL,
    normalize_global_period,
    normalize_global_source,
    parse_ceic_speedsearch,
    parse_ceic_speedsearch_text,
    parse_cenc_wolfx_eqlist,
    parse_usgs_geojson,
    resolve_ceic_speedsearch_url,
    resolve_usgs_feed_url,
)
from .geo import haversine_distance_km
from .place_localize import PlaceLocalizeDeps, enrich_usgs_places_with_chinese

logger = logging.getLogger("homeos.earthquake.global")

#: 新鲜缓存窗口：命中则跳过外源拉取
CACHE_FRESH_SEC = 300
#: Redis 保留时长：过期后仍可作为 stale 回退
CACHE_STALE_SEC = 86_400
CACHE_PREFIX = "homeos:eew:global:"


def _now_ms() -> float:
    return time.time() * 1000


def _clamp(value: float, minimum: float, maximum: float) -> float:
    if not math.isfinite(value):
        return minimum
    return min(maximum, max(minimum, value))


async def _http_get_json(
    url: str,
    *,
    timeout_ms: int = 15_000,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    async with httpx.AsyncClient(timeout=timeout_ms / 1000, follow_redirects=True) as client:
        response = await client.get(url, headers=headers or {}, params=params or {})
        response.raise_for_status()
        return response.json()


async def _place_localize_get(url: str, config: dict[str, Any]) -> dict[str, Any]:
    """适配 ``PlaceLocalizeDeps.get``：``config`` 支持 timeout(ms) / headers / params。"""
    timeout_ms = int(config.get("timeout", 4000))
    async with httpx.AsyncClient(timeout=timeout_ms / 1000, follow_redirects=True) as client:
        response = await client.get(
            url, headers=config.get("headers") or {}, params=config.get("params") or {}
        )
        response.raise_for_status()
        return {"data": response.json()}


class EarthquakeGlobalService:
    """全球 / 区域地震目录服务。"""

    def __init__(self, redis: Any, earthquake_service: Any) -> None:
        self._redis = redis
        self._earthquake = earthquake_service
        self._logger = logger

    async def get_recent_feed(self, query: dict[str, Any] | None = None) -> dict[str, Any]:
        query = query or {}
        source = normalize_global_source(query.get("source"))
        period = normalize_global_period(query.get("period"))
        default_min = 3 if source == "cenc" else 4
        min_magnitude = _clamp(_to_number(query.get("minMagnitude"), default_min), 2, 8)
        limit_raw = _to_number(query.get("limit"), 50)
        # 复刻 JS ``Math.floor``：NaN / ±Inf 参与 clamp 时退化为下限
        floored = math.floor(limit_raw) if math.isfinite(limit_raw) else float("nan")
        limit = int(_clamp(floored, 1, 100))

        await self._earthquake.ensure_runtime_config()
        coords = self._earthquake.get_home_coordinates()
        home_coordinates = (
            {"lat": coords["lat"], "lon": coords["lon"]}
            if coords.get("lat") is not None and coords.get("lon") is not None
            else None
        )

        cache_key = f"{CACHE_PREFIX}{source}:{period}:{min_magnitude:g}:{limit}"
        fresh = await self._load_cache(cache_key, allow_stale=False)
        if fresh is not None:
            return self._with_home(fresh, home_coordinates, cached=True, stale=False)

        items: list[dict[str, Any]]
        try:
            if source == "cenc":
                items = await self._fetch_cenc_items(
                    period, min_magnitude, limit, home_coordinates
                )
            else:
                items = await self._fetch_usgs_items(
                    period, min_magnitude, limit, home_coordinates
                )
        except Exception as exc:  # noqa: BLE001
            label = "中国地震台网" if source == "cenc" else "USGS"
            self._logger.warning("%s 震情拉取失败: %s", label, exc)
            stale = await self._load_cache(cache_key, allow_stale=True)
            if stale is not None:
                self._logger.warning("%s 使用过期缓存(fetchedAt=%s)", label, stale.get("fetchedAt"))
                return self._with_home(stale, home_coordinates, cached=True, stale=True)
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE, f"{label} 数据源暂不可用，请稍后重试"
            ) from exc

        result: dict[str, Any] = {
            "source": source,
            "period": period,
            "minMagnitude": min_magnitude,
            "fetchedAt": _now_ms(),
            "cached": False,
            "stale": False,
            "homeCoordinates": home_coordinates,
            "items": items,
        }
        await self._save_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ #
    # 数据源拉取
    # ------------------------------------------------------------------ #
    async def _fetch_usgs_items(
        self,
        period: str,
        min_magnitude: float,
        limit: int,
        home_coordinates: dict[str, float] | None,
    ) -> list[dict[str, Any]]:
        url = resolve_usgs_feed_url(period, min_magnitude)
        body = await _http_get_json(
            url, timeout_ms=15_000, headers={"Accept": "application/json"}
        )
        items = parse_usgs_geojson(
            body,
            {
                "minMagnitude": min_magnitude,
                "limit": limit,
                "homeLat": home_coordinates["lat"] if home_coordinates else None,
                "homeLon": home_coordinates["lon"] if home_coordinates else None,
            },
        )
        deps = PlaceLocalizeDeps(
            get=_place_localize_get,
            redis_get=self._redis.get if self._redis is not None else None,
            redis_set=self._redis.set if self._redis is not None else None,
        )
        return await enrich_usgs_places_with_chinese(items, deps)

    async def _fetch_cenc_items(
        self,
        period: str,
        min_magnitude: float,
        limit: int,
        home_coordinates: dict[str, float] | None,
    ) -> list[dict[str, Any]]:
        ceic_items = await self._try_fetch_ceic_direct(
            period, min_magnitude, limit, home_coordinates
        )
        if ceic_items:
            return ceic_items

        body = await _http_get_json(
            WOLFX_CENC_EQ_LIST_URL, timeout_ms=15_000, headers={"Accept": "application/json"}
        )
        items = parse_cenc_wolfx_eqlist(
            body,
            {
                "period": period,
                "minMagnitude": min_magnitude,
                "limit": limit,
                "homeLat": home_coordinates["lat"] if home_coordinates else None,
                "homeLon": home_coordinates["lon"] if home_coordinates else None,
            },
        )
        # 过滤后为空属正常（如近 24h 无 M3+），勿当成数据源故障
        if not items:
            feed_keys = (
                [key for key in body if key != "md5"] if isinstance(body, dict) else []
            )
            if not feed_keys:
                raise BusinessException(ErrorCode.EXTERNAL_ERROR, "CENC 返回空列表")
        return items

    async def _try_fetch_ceic_direct(
        self,
        period: str,
        min_magnitude: float,
        limit: int,
        home_coordinates: dict[str, float] | None,
    ) -> list[dict[str, Any]]:
        url = resolve_ceic_speedsearch_url(period)
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(
                    url,
                    headers={
                        "Accept": "*/*",
                        "User-Agent": "Mozilla/5.0 (compatible; HomeOS/1.0)",
                    },
                )
            if response.status_code >= 400:
                return []
            rows = parse_ceic_speedsearch_text(str(response.text or ""))
            if not rows:
                return []
            return parse_ceic_speedsearch(
                rows,
                {
                    "period": period,
                    "minMagnitude": min_magnitude,
                    "limit": limit,
                    "homeLat": home_coordinates["lat"] if home_coordinates else None,
                    "homeLon": home_coordinates["lon"] if home_coordinates else None,
                },
            )
        except Exception as exc:  # noqa: BLE001
            self._logger.debug("CEIC 直连不可用,回退 Wolfx CENC: %s", exc)
            return []

    # ------------------------------------------------------------------ #
    # 距离 / 缓存
    # ------------------------------------------------------------------ #
    def _with_home(
        self,
        payload: dict[str, Any],
        home_coordinates: dict[str, float] | None,
        *,
        cached: bool = True,
        stale: bool = False,
    ) -> dict[str, Any]:
        return {
            "source": payload.get("source"),
            "period": payload.get("period"),
            "minMagnitude": payload.get("minMagnitude"),
            "fetchedAt": payload.get("fetchedAt"),
            "cached": cached,
            "stale": stale,
            "homeCoordinates": home_coordinates,
            "items": self._enrich_distances(list(payload.get("items") or []), home_coordinates),
        }

    def _enrich_distances(
        self, items: list[dict[str, Any]], home: dict[str, float] | None
    ) -> list[dict[str, Any]]:
        if home is None:
            return [{**item, "distanceKm": None} for item in items]
        return [
            {
                **item,
                "distanceKm": math.floor(
                    haversine_distance_km(
                        home["lat"], home["lon"], item["latitude"], item["longitude"]
                    )
                    + 0.5
                ),
            }
            for item in items
        ]

    async def _load_cache(self, key: str, *, allow_stale: bool) -> dict[str, Any] | None:
        if self._redis is None or not self._redis.is_ready():
            return None
        try:
            raw = await self._redis.get(key)
            if not raw:
                return None
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", "ignore")
            parsed = json.loads(raw)
            items = parsed.get("items") if isinstance(parsed, dict) else None
            if not isinstance(items, list):
                return None
            fetched_at = _to_number(parsed.get("fetchedAt"), 0)
            if not fetched_at:
                return None
            age_sec = (_now_ms() - fetched_at) / 1000
            if age_sec < 0:
                return None
            if not allow_stale and age_sec > CACHE_FRESH_SEC:
                return None
            if allow_stale and age_sec > CACHE_STALE_SEC:
                return None
            return {
                "source": parsed.get("source"),
                "period": parsed.get("period"),
                "minMagnitude": parsed.get("minMagnitude"),
                "fetchedAt": fetched_at,
                "items": items,
            }
        except Exception:  # noqa: BLE001
            return None

    async def _save_cache(self, key: str, result: dict[str, Any]) -> None:
        if self._redis is None or not self._redis.is_ready():
            return
        try:
            payload = {
                "source": result.get("source"),
                "period": result.get("period"),
                "minMagnitude": result.get("minMagnitude"),
                "fetchedAt": result.get("fetchedAt"),
                "items": result.get("items"),
            }
            await self._redis.set(key, json.dumps(payload, ensure_ascii=False), CACHE_STALE_SEC)
        except Exception as exc:  # noqa: BLE001
            self._logger.debug("全球震情缓存写入失败: %s", exc)


def _to_number(value: Any, fallback: float = float("nan")) -> float:
    if value is None or value == "":
        return fallback
    if isinstance(value, bool):
        return fallback
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


__all__ = ["CACHE_FRESH_SEC", "CACHE_STALE_SEC", "EarthquakeGlobalService"]
