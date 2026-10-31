"""商店静态资源缓存策略：稳定 URL 回源校验，哈希产物长缓存。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos-store" / "backend"
SHARED_ROOT = REPO_ROOT / "packages" / "shared-py"
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(SHARED_ROOT))

from src.security.static_cache import (
    IMMUTABLE_CACHE_CONTROL,
    is_immutable_asset_path,
    is_static_asset_path,
)


class StaticAssetPathTest(unittest.TestCase):
    def test_stable_urls_use_revalidation(self) -> None:
        self.assertTrue(is_static_asset_path('/store-static/font.min.css'))
        self.assertTrue(is_static_asset_path('/store-static/fonts/font-subset.woff2'))
        self.assertTrue(is_static_asset_path('/store/v1/product-images/1.png'))
        self.assertFalse(is_static_asset_path('/api/v1/products'))

    def test_vite_hashed_assets_are_immutable(self) -> None:
        self.assertTrue(is_immutable_asset_path('/store-static/assets/index-Bww_YPma.js'))
        self.assertTrue(
            is_immutable_asset_path(
                '/store-static/assets/features/admin/views/OrdersView-CuBZdY85.js'
            )
        )
        self.assertTrue(is_immutable_asset_path('/store-static/assets/index-BeKJmk8J.css'))
        self.assertEqual(IMMUTABLE_CACHE_CONTROL, 'public, max-age=31536000, immutable')

    def test_unhashed_or_other_prefixes_stay_revalidated(self) -> None:
        self.assertFalse(is_immutable_asset_path('/store-static/font.min.css'))
        self.assertFalse(is_immutable_asset_path('/store-static/fonts/font-subset.woff2'))
        self.assertFalse(is_immutable_asset_path('/store-static/assets/features/foo.js'))
        self.assertFalse(is_immutable_asset_path('/static/assets/index-Bww_YPma.js'))
        self.assertFalse(is_immutable_asset_path('/store/v1/product-images/1.png'))


if __name__ == '__main__':
    unittest.main()
