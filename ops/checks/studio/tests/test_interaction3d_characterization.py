"""interaction3d 交付与控制分发的特性测试：重构 api.py / stage_delivery 前冻结现有行为。

覆盖的是「换实现时最容易悄悄变掉」的几处：

- ``/current`` 响应缓存：命中、``since`` 相同回 204、草稿不可用时带 ``since`` 回 409；
- 渲染缓存：键格式校验、作用域隔离、读写往返；
- 舞台缓存作用域与底图 URL 注入；
- ``/control`` 按 deviceKind / domain 分派到哪条控制分支。
"""

from __future__ import annotations

import asyncio
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from src.modules.interaction3d import api, render_cache
from src.modules.interaction3d import stage_delivery as delivery

SCENE_ID = "0123456789abcdef0123456789abcdef"
ASSET_ID = "fedcba9876543210fedcba9876543210"


def _viewer(user_id: str | None = "u1"):
    return SimpleNamespace(user=SimpleNamespace(id=user_id) if user_id else None)


class SceneCacheScopeTest(unittest.TestCase):
    def test_light_scope_wins(self):
        self.assertEqual(delivery.scene_cache_scope("abc", _viewer(), "p1"), "abc")

    def test_fallback_is_stable_per_user_and_project(self):
        first = delivery.scene_cache_scope("", _viewer(), "p1")
        self.assertEqual(len(first), 64)
        self.assertEqual(first, delivery.scene_cache_scope("", _viewer(), "p1"))
        self.assertNotEqual(first, delivery.scene_cache_scope("", _viewer(), "p2"))
        self.assertNotEqual(first, delivery.scene_cache_scope("", _viewer("u2"), "p1"))

    def test_empty_without_project_or_user(self):
        self.assertEqual(delivery.scene_cache_scope("", _viewer(), ""), "")
        self.assertEqual(delivery.scene_cache_scope("", _viewer(None), "p1"), "")


class BackgroundUrlTest(unittest.TestCase):
    def test_injects_only_hex_asset_ids(self):
        scene = {
            "floors": [
                {"scene": {"background": {"assetId": f"user:{ASSET_ID}"}}},
                {"scene": {"background": {"assetId": "not-an-asset"}}},
                {"scene": {}},
            ]
        }
        delivery.inject_background_urls(scene, SCENE_ID, "p 1")
        self.assertEqual(
            scene["floors"][0]["scene"]["background"]["url"],
            f"/api/v1/modules/interaction3d/scenes/{SCENE_ID}/background/{ASSET_ID}?projectId=p+1",
        )
        self.assertNotIn("url", scene["floors"][1]["scene"]["background"])


class CurrentSceneDeliveryTest(unittest.TestCase):
    def setUp(self):
        delivery._current_scene_cache.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.scene_file = Path(self.tmp.name) / f"{SCENE_ID}.json"
        self.scene_file.write_text("{}", encoding="utf-8")
        self.reference = {"scene": {"floors": [{"id": "f1"}]}, "interaction3dSource": "studio"}

    def _entry(self, command):
        return delivery.build_current_scene_entry(command, self.reference, SCENE_ID, "p1", "interaction3dSource")

    def test_body_shape_and_sync_key(self):
        entry = self._entry({"scene": {"floors": [{"id": "f2"}]}, "revision": 3})
        body = json.loads(entry.body)
        self.assertFalse(entry.fallback)
        self.assertEqual(body["syncKey"], entry.sync_key)
        self.assertEqual(body["referenceScene"], self.reference["scene"])
        self.assertEqual(body["revision"], 3)
        self.assertNotIn("interaction3dSource", body)

    def test_fallback_copies_reference(self):
        entry = self._entry(None)
        self.assertTrue(entry.fallback)
        self.assertIn("interaction3dSource", self.reference, "缓存里的快照不得被就地修改")
        self.assertEqual(json.loads(entry.body)["scene"], self.reference["scene"])

    def test_cache_hit_and_since_semantics(self):
        builds = []

        def build():
            builds.append(1)
            return self._entry({"scene": {"floors": []}})

        first = delivery.serve_current_scene(self.scene_file, "p1", (1, "t", 10), "", build)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.headers["cache-control"], "no-store")
        sync_key = json.loads(first.body)["syncKey"]
        same = delivery.serve_current_scene(self.scene_file, "p1", (1, "t", 10), sync_key, build)
        self.assertEqual(same.status_code, 204)
        self.assertEqual(len(builds), 1)
        delivery.serve_current_scene(self.scene_file, "p1", (2, "t", 10), "", build)
        self.assertEqual(len(builds), 2, "草稿指纹变化必须重建")

    def test_since_without_draft_is_409(self):
        with self.assertRaises(HTTPException) as caught:
            delivery.serve_current_scene(self.scene_file, "p1", None, "abc", lambda: self._entry(None))
        self.assertEqual(caught.exception.status_code, 409)

    def test_since_on_fallback_entry_is_409(self):
        delivery.serve_current_scene(self.scene_file, "p1", (1, "t", 1), "", lambda: self._entry(None))
        with self.assertRaises(HTTPException) as caught:
            delivery.serve_current_scene(self.scene_file, "p1", (1, "t", 1), "abc", lambda: self._entry(None))
        self.assertEqual(caught.exception.status_code, 409)

    def test_missing_snapshot_is_409(self):
        with self.assertRaises(HTTPException) as caught:
            delivery.serve_current_scene(Path(self.tmp.name) / "gone.json", "p1", None, "", lambda: None)
        self.assertEqual(caught.exception.status_code, 409)


def _png_bytes() -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


class RenderCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.data_dir = Path(self.tmp.name)

    def test_rejects_malformed_key(self):
        with self.assertRaises(HTTPException) as caught:
            render_cache.cache_path(self.data_dir, SCENE_ID, "p1", "XYZ")
        self.assertEqual(caught.exception.status_code, 422)

    def test_scope_isolated_by_project_and_principal(self):
        key = "a" * 64
        base = render_cache.cache_path(self.data_dir, SCENE_ID, "p1", key)
        self.assertNotEqual(base, render_cache.cache_path(self.data_dir, SCENE_ID, "p2", key))
        self.assertNotEqual(base, render_cache.cache_path(self.data_dir, SCENE_ID, "p1", key, principal="u1"))
        self.assertEqual(base.name, f"{key}.png")

    def test_round_trip_and_rejects_non_png(self):
        path = render_cache.cache_path(self.data_dir, SCENE_ID, "p1", "b" * 64)
        self.assertIsNone(render_cache.read_cache(path))
        content = _png_bytes()
        render_cache.write_cache(path, content)
        self.assertEqual(render_cache.read_cache(path), content)
        with self.assertRaises(HTTPException) as caught:
            render_cache.write_cache(path, b"not a png")
        self.assertEqual(caught.exception.status_code, 422)
        with self.assertRaises(HTTPException) as caught:
            render_cache.write_cache(path, b"")
        self.assertEqual(caught.exception.status_code, 413)


class SceneReferenceTest(unittest.TestCase):
    def test_collects_nested_scene_ids(self):
        found: set[str] = set()
        api._collect_scene_ids(
            {"a": [{"sceneId": f"user:{SCENE_ID}"}, {"b": {"sceneId": "x"}}], "sceneId": ""},
            found,
        )
        self.assertEqual(found, {SCENE_ID, "x"})


class LightHistoryScopeTest(unittest.TestCase):
    def _connection(self, **overrides):
        values = {
            "id": "c1",
            "base_url": "http://ha.local/",
            "encrypted_access_token": "tok",
            "is_active": True,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_stable_and_ignores_trailing_slash(self):
        scope = api.light_history_scope(self._connection(), _viewer(), "p1")
        self.assertEqual(len(scope), 64)
        self.assertEqual(scope, api.light_history_scope(self._connection(base_url="http://ha.local"), _viewer(), "p1"))

    def test_empty_when_inactive_or_missing(self):
        self.assertEqual(api.light_history_scope(self._connection(is_active=False), _viewer(), "p1"), "")
        self.assertEqual(api.light_history_scope(None, _viewer(), "p1"), "")
        self.assertEqual(api.light_history_scope(self._connection(), _viewer(), ""), "")
        self.assertEqual(api.light_history_scope(self._connection(), _viewer(None), "p1"), "")


BRANCHES = (
    "_control_game_console",
    "_control_speaker",
    "_control_television",
    "_control_lock",
    "_control_computer_power",
    "_control_environment_device",
    "call_service",
)


class ControlDispatchTest(unittest.TestCase):
    """冻结 /control 的分派表：重构成查表或拆文件时，每个 (domain, deviceKind) 必须落到同一分支。"""

    CASES = (
        ("media_player", "game-console", "turn_on", "_control_game_console"),
        ("media_player", "speaker", "media_play", "_control_speaker"),
        ("media_player", "television", "turn_on", "_control_television"),
        ("media_player", "", "turn_on", "_control_television"),
        ("media_player", "fan-extra", "turn_on", "_control_environment_device"),
        ("lock", "", "lock", "_control_lock"),
        ("switch", "lock", "turn_on", "_control_lock"),
        ("switch", "computer", "turn_on", "_control_computer_power"),
        ("fan", "", "turn_on", "_control_environment_device"),
        ("cover", "", "open_cover", "_control_environment_device"),
        ("climate", "", "set_temperature", "_control_environment_device"),
        ("water_heater", "", "set_temperature", "_control_environment_device"),
        ("switch", "window-opener", "turn_on", "_control_environment_device"),
        ("switch", "exhaust-fan", "turn_on", "_control_environment_device"),
        ("light", "", "turn_on", "call_service"),
        ("switch", "", "turn_off", "call_service"),
    )

    def _dispatch(self, domain, kind, service):
        command = api.Interaction3dControlRequest.model_validate(
            {"domain": domain, "service": service, "entityId": f"{domain}.x", "deviceKind": kind}
        )
        calls: list[str] = []

        def recorder(name):
            async def branch(*_args, **_kwargs):
                calls.append(name)
                return {"branch": name}

            return branch

        patches = [mock.patch.object(api, name, recorder(name)) for name in BRANCHES]
        patches.append(mock.patch.object(api, "require_access", lambda _request: None))
        for patch in patches:
            patch.start()
        try:
            asyncio.run(api.control_light(command, SimpleNamespace(), None, _viewer()))
        finally:
            for patch in patches:
                patch.stop()
        return calls

    def test_dispatch_table(self):
        for domain, kind, service, expected in self.CASES:
            with self.subTest(domain=domain, kind=kind):
                self.assertEqual(self._dispatch(domain, kind, service), [expected])

    def test_unsupported_domain_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            self._dispatch("vacuum", "", "start")
        self.assertEqual(caught.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            self._dispatch("light", "", "toggle")


if __name__ == "__main__":
    unittest.main()
