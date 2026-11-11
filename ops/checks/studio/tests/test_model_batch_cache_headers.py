"""``/static`` 缓存头的分批键口径。

模型 GLB 的 URL 上的 ``?v=`` 是**批次缓存键**（``MODEL_ASSET_CACHE_KEYS``），约定「字节变了就换键」。
一旦这条约定被后端误判成内容寻址、或者反过来漏判，后果都不是报错：

- 漏判：上百个模型每次启动都发条件请求，热启动的「GLB 请求 0」promise 失效（本地环路看不出来）；
- 误判：手写/旧壳 URL 不带键也被缓存一年，换了模型画面还停在旧件（``basin`` 踩过这个坑）。

所以这里只钉死「带非空 v 的模型 URL 才 immutable，其余一律回源校验」。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import Response
from src.bootstrap.studio_shell import IMMUTABLE_PRIVATE_CACHE, _apply_cache_headers
from starlette.requests import Request


def _request(path: str, query: str = "", headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": query.encode(),
            "headers": headers or [],
            "scheme": "http",
            "server": ("127.0.0.1", 8000),
            "client": ("127.0.0.1", 50000),
            "root_path": "",
        }
    )


def _cache_control(path: str, query: str = "") -> str:
    response = Response(status_code=200)
    _apply_cache_headers(_request(path, query), response, None)
    return response.headers.get("cache-control", "")


class ModelBatchCacheTest(unittest.TestCase):
    def test_batch_pinned_model_is_immutable(self) -> None:
        self.assertEqual(
            _cache_control("/static/3d-studio/models/家居/客厅家具/沙发-lite.glb", "v=20261013-household-v2"),
            IMMUTABLE_PRIVATE_CACHE,
        )

    def test_model_without_key_revalidates(self) -> None:
        self.assertEqual(
            _cache_control("/static/3d-studio/models/家居/客厅家具/沙发-lite.glb"),
            "private, no-cache",
        )

    def test_empty_key_does_not_count(self) -> None:
        self.assertEqual(
            _cache_control("/static/3d-studio/models/沙发-lite.glb", "v="),
            "private, no-cache",
        )

    def test_stable_asset_keeps_revalidating(self) -> None:
        """`core/stage.js` 是稳定 URL：重建会覆盖它，长缓存会拿到过期脚本。"""
        self.assertEqual(
            _cache_control("/static/3d-studio/core/stage.js"),
            "private, no-cache",
        )

    def test_versioned_vendor_still_immutable(self) -> None:
        self.assertEqual(
            _cache_control("/static/vendor/hls.js/1.7.4/hls.light.min.js"),
            IMMUTABLE_PRIVATE_CACHE,
        )

    def test_model_prefix_is_scoped(self) -> None:
        """同一目录规则不能外溢到别的静态资源（例如贴图）。"""
        self.assertEqual(
            _cache_control("/static/3d-studio/textures/wood.webp", "v=batch"),
            "private, no-cache",
        )


class RenderCacheConditionalTest(unittest.TestCase):
    """渲染缓存键即内容：命中 If-None-Match 时回 304，不再重传 1 MB 的瓦片。"""

    SCENE = "0123456789abcdef0123456789abcdef"
    KEY = "b" * 64

    def _call(self, if_none_match: str | None = None):
        from types import SimpleNamespace
        from unittest import mock

        from src.modules.interaction3d import api as i3d

        path = f"/api/v1/modules/interaction3d/scenes/{self.SCENE}/render-cache/{self.KEY}"
        headers = [(b"if-none-match", if_none_match.encode())] if if_none_match else None
        request = _request(path, headers=headers)
        request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(data_dir="data")))
        with (
            mock.patch.object(i3d, "require_scene_transfer"),
            mock.patch.object(i3d, "scene_path"),
            mock.patch.object(i3d, "cache_path", return_value=Path("render-cache-entry.png")),
            mock.patch.object(i3d, "read_cache", return_value=b"fake-png"),
        ):
            return i3d.get_render_cache(self.SCENE, self.KEY, request, viewer=None, projectId="")

    def test_returns_body_and_etag(self) -> None:
        response = self._call()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["etag"], f'"{self.KEY}"')

    def test_matching_etag_returns_304(self) -> None:
        response = self._call(if_none_match=f'"{self.KEY}"')
        self.assertEqual(response.status_code, 304)


if __name__ == "__main__":
    unittest.main()
