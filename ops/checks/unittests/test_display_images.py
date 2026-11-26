"""按显示尺寸派生图片的单元测试（0.8.9）。

这条链路的价值全在「不抛错」：它是纯优化，失败必须回落原图。因此测试的重点不是
「能不能缩放」，而是：

1. 参数解析对坏值宽容（回落原图，不是 422）；
2. 派生失败（坏图、超大源、缺 Pillow）返回 ``None`` 而不冒异常；
3. 缓存键含源文件指纹 —— 同名覆盖上传不会命中旧副本；
4. 淘汰按最久未用，且体积/文件数都回到上限内。
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.platform.core.http.display_images import (
    MAX_EDGE,
    OUTPUT_SUFFIX,
    DisplayImageCache,
    DisplayRequest,
    parse_display_request,
    supports_display_derivative,
)


class ParseDisplayRequestTests(unittest.TestCase):
    def test_absent_size_means_no_derivative(self) -> None:
        self.assertIsNone(parse_display_request({}))

    def test_valid_size(self) -> None:
        request = parse_display_request({"displaySize": "192x128"})
        assert request is not None
        self.assertEqual((request.width, request.height), (192, 128))
        self.assertFalse(request.cover)

    def test_malformed_size_falls_back_to_original(self) -> None:
        for raw in ("192", "192x", "x128", "0x128", "192x0", "192X128", "abcxdef", "192x128x64"):
            self.assertIsNone(parse_display_request({"displaySize": raw}), raw)

    def test_size_is_clamped_to_max_edge(self) -> None:
        request = parse_display_request({"displaySize": "9999x9999"})
        assert request is not None
        self.assertEqual((request.width, request.height), (MAX_EDGE, MAX_EDGE))

    def test_flags_are_opt_in(self) -> None:
        request = parse_display_request(
            {"displaySize": "64x64", "displayFit": "cover", "displayStill": "1", "displayCrop": "1"}
        )
        assert request is not None
        self.assertTrue(request.cover)
        self.assertTrue(request.still)
        self.assertTrue(request.crop)

    def test_flags_ignore_other_values(self) -> None:
        request = parse_display_request(
            {"displaySize": "64x64", "displayFit": "contain", "displayStill": "true", "displayCrop": "yes"}
        )
        assert request is not None
        self.assertFalse(request.cover)
        self.assertFalse(request.still)
        self.assertFalse(request.crop)

    def test_crop_band_is_clamped_and_optional(self) -> None:
        assert parse_display_request({"displaySize": "64x64"}) is not None
        self.assertIsNone(parse_display_request({"displaySize": "64x64"}).crop_band)
        band = parse_display_request({"displaySize": "64x64", "displayCropBand": "9999"})
        assert band is not None
        self.assertEqual(band.crop_band, 64)
        bad = parse_display_request({"displaySize": "64x64", "displayCropBand": "abc"})
        assert bad is not None
        self.assertIsNone(bad.crop_band)

    def test_cache_token_distinguishes_params(self) -> None:
        base = DisplayRequest(64, 64)
        self.assertNotEqual(base.cache_token(), DisplayRequest(64, 64, cover=True).cache_token())
        self.assertNotEqual(base.cache_token(), DisplayRequest(64, 64, still=True).cache_token())
        self.assertNotEqual(base.cache_token(), DisplayRequest(64, 64, crop=True, crop_band=3).cache_token())


class SupportsDisplayDerivativeTests(unittest.TestCase):
    def test_raster_is_supported(self) -> None:
        for suffix in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            self.assertTrue(supports_display_derivative(Path(f"a{suffix}")), suffix)

    def test_svg_and_unknown_are_passed_through(self) -> None:
        for suffix in (".svg", ".heic", ".bmp", ""):
            self.assertFalse(supports_display_derivative(Path(f"a{suffix}")), suffix)


class CacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.root = Path(self._directory.name)
        self.cache = DisplayImageCache(self.root / "display-images")

    def _write_jpeg(self, path: Path, size: tuple[int, int] = (400, 300)) -> Path:
        from PIL import Image

        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, (120, 90, 60)).save(path, format="JPEG")
        return path

    def test_derives_and_caches_webp(self) -> None:
        source = self._write_jpeg(self.root / "src" / "a.jpg")
        request = DisplayRequest(64, 64)
        derived = self.cache.get_or_create(source, request)
        assert derived is not None
        self.assertEqual(derived.suffix, OUTPUT_SUFFIX)
        self.assertTrue(derived.exists())
        from PIL import Image

        with Image.open(derived) as image:
            self.assertLessEqual(image.width, 64)
            self.assertLessEqual(image.height, 64)

    def test_second_call_hits_cache(self) -> None:
        source = self._write_jpeg(self.root / "src" / "b.jpg")
        request = DisplayRequest(64, 64)
        first = self.cache.get_or_create(source, request)
        second = self.cache.get_or_create(source, request)
        self.assertEqual(first, second)

    def test_source_change_invalidates_key(self) -> None:
        source = self._write_jpeg(self.root / "src" / "c.jpg", (400, 300))
        request = DisplayRequest(64, 64)
        first = self.cache.get_or_create(source, request)
        # 同名覆盖上传：大小或 mtime 一定会变（这里两个都变）。
        self._write_jpeg(source, (320, 240))
        second = self.cache.get_or_create(source, request)
        self.assertNotEqual(first, second)

    def test_cover_crops_to_target_aspect(self) -> None:
        source = self._write_jpeg(self.root / "src" / "d.jpg", (400, 100))
        derived = self.cache.get_or_create(source, DisplayRequest(64, 64, cover=True))
        assert derived is not None
        from PIL import Image

        with Image.open(derived) as image:
            self.assertEqual((image.width, image.height), (64, 64))

    def test_broken_source_returns_none(self) -> None:
        broken = self.root / "src" / "broken.jpg"
        broken.parent.mkdir(parents=True, exist_ok=True)
        broken.write_bytes(b"not-an-image")
        self.assertIsNone(self.cache.get_or_create(broken, DisplayRequest(64, 64)))

    def test_missing_source_returns_none(self) -> None:
        self.assertIsNone(self.cache.get_or_create(self.root / "nope.jpg", DisplayRequest(64, 64)))

    def test_eviction_keeps_cache_bounded(self) -> None:
        cache = self.cache
        # 造一批超过上限的派生文件，确认淘汰后数量回落。
        cache.ensure_dir()
        from homeos.backend.src.platform.core.http import display_images as module

        original = module.MAX_CACHE_FILES
        module.MAX_CACHE_FILES = 3
        try:
            for index in range(8):
                (cache.root / f"f{index}{OUTPUT_SUFFIX}").write_bytes(b"\0" * 8)
            cache.evict()
            remaining = [entry for entry in cache.root.iterdir() if entry.suffix == OUTPUT_SUFFIX]
            self.assertLessEqual(len(remaining), 3)
        finally:
            module.MAX_CACHE_FILES = original


if __name__ == "__main__":
    unittest.main()
