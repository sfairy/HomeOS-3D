"""地震地名本地化：进程级有界缓存避免每轮震情重复请求上游。"""

from __future__ import annotations

import unittest

from src.domains.earthquake.place_localize import (
    _PLACE_ZH_CACHE,
    PLACE_ZH_CACHE_MAX_ENTRIES,
    PlaceLocalizeDeps,
    _place_cache_set,
    enrich_usgs_places_with_chinese,
)


class _FakeGet:
    def __init__(self, response: dict | None = None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.calls: list[str] = []

    async def __call__(self, url: str, _params: dict) -> dict:
        self.calls.append(url)
        if self.error is not None:
            raise self.error
        return self.response or {}


class PlaceLocalizeCacheTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _PLACE_ZH_CACHE.clear()

    async def test_positive_result_is_reused_across_calls(self) -> None:
        get = _FakeGet({"data": {"countryName": "中国", "city": "上海"}})
        deps = PlaceLocalizeDeps(get=get)
        items = [{"latitude": 31.23, "longitude": 121.47, "place": "Shanghai"}]

        first = await enrich_usgs_places_with_chinese(items, deps)
        second = await enrich_usgs_places_with_chinese(items, deps)

        self.assertEqual(first[0]["place"], "中国上海")
        self.assertEqual(second[0]["place"], "中国上海")
        self.assertEqual(first[0]["placeEn"], "Shanghai")
        self.assertEqual(len(get.calls), 1)

    async def test_negative_result_is_reused_within_ttl(self) -> None:
        get = _FakeGet(error=RuntimeError("upstream unavailable"))
        deps = PlaceLocalizeDeps(get=get)
        items = [{"latitude": 35.0, "longitude": 139.0, "place": "Tokyo"}]

        first = await enrich_usgs_places_with_chinese(items, deps)
        second = await enrich_usgs_places_with_chinese(items, deps)

        self.assertEqual(first, items)
        self.assertEqual(second, items)
        # 首选 + 兜底各一次；第二次命中负缓存，不再打上游。
        self.assertEqual(len(get.calls), 2)

    def test_cache_is_bounded(self) -> None:
        for index in range(PLACE_ZH_CACHE_MAX_ENTRIES + 10):
            _place_cache_set(f"k{index}", "上海")
        self.assertEqual(len(_PLACE_ZH_CACHE), PLACE_ZH_CACHE_MAX_ENTRIES)
        self.assertNotIn("k0", _PLACE_ZH_CACHE)


if __name__ == "__main__":
    unittest.main()
