"""装饰模型库与 GLB 结构校验的单元测试（0.8.9「我的装饰」）。

覆盖三类真实故障：

1. **GLB 容器校验**：魔数 / 版本 / 截断 / 无网格 / 外部贴图 —— 这些错误必须给出可读原因，
   而不是让浏览器端加载失败；
2. **库的生命周期**：上传 → 列表 → 改名 → 删除（墓碑）→ 恢复（自愈）；
3. **备份口径**：``models`` 进包、``display-images`` 不进包。第 3 条已在
   ``ops/checks/business/backup_selftest.py`` 里断言，这里只覆盖前两类。

构造 GLB 的辅助函数刻意只有一个：读它的代码只需理解「JSON chunk + BIN chunk」这一层，
不必引入真实模型文件。
"""

from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.studio3d.model_glb import (
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    MAX_TRIANGLES,
    image_dimensions,
    validate_glb,
)
from homeos.backend.src.domains.studio3d.models import (
    MAX_MODEL_BYTES,
    ModelLibrary,
    normalize_model_name,
)
from homeos.backend.src.platform.core.http.errors import BusinessException


def build_glb(gltf: dict, bin_payload: bytes = b"") -> bytes:
    """按 GLB 2.0 规范拼一份最小容器（JSON chunk + 可选 BIN chunk）。"""
    json_bytes = json.dumps(gltf).encode("utf-8")
    # JSON chunk 用空格补齐到 4 字节，BIN chunk 用 0 补齐。
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    chunks = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    if bin_payload:
        padded = bin_payload + b"\0" * ((4 - len(bin_payload) % 4) % 4)
        chunks += struct.pack("<II", len(padded), 0x004E4942) + padded
    total = 12 + len(chunks)
    return struct.pack("<4sII", b"glTF", 2, total) + chunks


def triangle_gltf(*, triangles: int = 3, images: list | None = None) -> dict:
    """一个「有网格、可摆放」的最小 glTF JSON。"""
    return {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [
            {"count": triangles * 3, "type": "VEC3", "componentType": 5126},
            {"count": triangles * 3, "type": "SCALAR", "componentType": 5125},
        ],
        "bufferViews": [{"buffer": 0, "byteLength": 1024}],
        "buffers": [{"byteLength": 1024}],
        "images": images or [],
    }


class GlbValidationTests(unittest.TestCase):
    def test_accepts_minimal_static_mesh(self) -> None:
        summary = validate_glb(build_glb(triangle_gltf()), max_bytes=MAX_MODEL_BYTES)
        self.assertEqual(summary.triangles, 3)
        self.assertEqual(summary.meshes, 1)
        self.assertEqual(summary.images, 0)

    def test_rejects_wrong_magic(self) -> None:
        payload = bytearray(build_glb(triangle_gltf()))
        payload[0:4] = b"glTX"
        with self.assertRaises(BusinessException) as caught:
            validate_glb(bytes(payload), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("魔数", caught.exception.message)

    def test_rejects_wrong_version(self) -> None:
        payload = bytearray(build_glb(triangle_gltf()))
        struct.pack_into("<I", payload, 4, 1)
        with self.assertRaises(BusinessException) as caught:
            validate_glb(bytes(payload), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("GLB 2.0", caught.exception.message)

    def test_rejects_truncated_file(self) -> None:
        payload = build_glb(triangle_gltf())[:-8]
        with self.assertRaises(BusinessException) as caught:
            validate_glb(payload, max_bytes=MAX_MODEL_BYTES)
        self.assertIn("长度", caught.exception.message)

    def test_rejects_empty_file(self) -> None:
        with self.assertRaises(BusinessException):
            validate_glb(b"", max_bytes=MAX_MODEL_BYTES)

    def test_rejects_oversize_before_parsing(self) -> None:
        with self.assertRaises(BusinessException) as caught:
            validate_glb(b"\0" * 32, max_bytes=16)
        self.assertEqual(caught.exception.status_code, 413)

    def test_rejects_external_texture_uri(self) -> None:
        gltf = triangle_gltf(images=[{"uri": "wood.png", "mimeType": "image/png"}])
        with self.assertRaises(BusinessException) as caught:
            validate_glb(build_glb(gltf), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("内嵌", caught.exception.message)

    def test_rejects_non_image_texture(self) -> None:
        gltf = triangle_gltf(images=[{"mimeType": "image/gif", "bufferView": 0}])
        with self.assertRaises(BusinessException) as caught:
            validate_glb(build_glb(gltf, b"\0" * 64), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("PNG 或 JPEG", caught.exception.message)

    def test_rejects_too_many_triangles(self) -> None:
        gltf = triangle_gltf(triangles=MAX_TRIANGLES + 3)
        with self.assertRaises(BusinessException) as caught:
            validate_glb(build_glb(gltf), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("三角面", caught.exception.message)

    def test_rejects_scene_without_mesh(self) -> None:
        gltf = triangle_gltf()
        gltf["scenes"] = [{"nodes": []}]
        with self.assertRaises(BusinessException) as caught:
            validate_glb(build_glb(gltf), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("网格", caught.exception.message)

    def test_image_limits_constant_is_sane(self) -> None:
        # 贴图边长的上限只用于文档化；这里是「别把它改成 0」的护栏。
        self.assertGreaterEqual(MAX_IMAGE_SIDE, 512)

    def test_unknown_extensions_are_reported_not_rejected(self) -> None:
        gltf = triangle_gltf()
        gltf["extensionsUsed"] = ["KHR_materials_unlit", "VENDOR_fancy"]
        summary = validate_glb(build_glb(gltf), max_bytes=MAX_MODEL_BYTES)
        self.assertEqual(summary.unknown_extensions, ("VENDOR_fancy",))


class ModelLibraryTests(unittest.TestCase):
    ASSET_ID = "0123456789abcdef0123456789abcdef"

    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.library = ModelLibrary(Path(self._directory.name) / "models")

    def test_store_list_and_read(self) -> None:
        record = self.library.store(self.ASSET_ID, "落地花瓶", b"glTF-payload")
        self.assertEqual(record.asset_id, self.ASSET_ID)
        self.assertEqual([item.asset_id for item in self.library.list_models()], [self.ASSET_ID])
        self.assertEqual(self.library.read_model_bytes(self.ASSET_ID), b"glTF-payload")
        self.assertTrue(self.library.exists(self.ASSET_ID))

    def test_rejects_invalid_asset_id(self) -> None:
        with self.assertRaises(BusinessException):
            self.library.store("not-hex", "x", b"1")

    def test_rejects_duplicate_asset_id(self) -> None:
        self.library.store(self.ASSET_ID, "a", b"1")
        with self.assertRaises(BusinessException) as caught:
            self.library.store(self.ASSET_ID, "b", b"2")
        self.assertEqual(caught.exception.status_code, 409)

    def test_remove_leaves_tombstone(self) -> None:
        self.library.store(self.ASSET_ID, "a", b"1")
        self.assertTrue(self.library.remove(self.ASSET_ID))
        self.assertFalse(self.library.exists(self.ASSET_ID))
        self.assertTrue(self.library.is_retired(self.ASSET_ID))
        self.assertEqual(self.library.list_models(), [])

    def test_missing_scene_models_reports_retired(self) -> None:
        self.library.store(self.ASSET_ID, "a", b"1")
        self.library.remove(self.ASSET_ID)
        missing = self.library.missing_scene_models({self.ASSET_ID})
        self.assertEqual(missing, [self.ASSET_ID])

    def test_rename_updates_name_only(self) -> None:
        self.library.store(self.ASSET_ID, "a", b"1234")
        renamed = self.library.rename(self.ASSET_ID, "  新 名字  ")
        self.assertEqual(renamed.name, "新 名字")
        self.assertEqual(renamed.bytes, 4)

    def test_recover_drops_missing_entries_and_adopts_orphans(self) -> None:
        self.library.store(self.ASSET_ID, "a", b"1")
        # 模拟「索引有、文件丢了」
        self.library.model_path(self.ASSET_ID).unlink()
        orphan = "fedcba9876543210fedcba9876543210"
        self.library.model_path(orphan).write_bytes(b"orphan")
        stats = self.library.recover()
        self.assertGreaterEqual(stats["missing"], 1)
        self.assertEqual(stats["orphan"], 1)
        self.assertEqual([item.asset_id for item in self.library.list_models()], [orphan])

    def test_recover_cleans_temporary_files(self) -> None:
        self.library.ensure_dirs()
        (self.library.root / ".upload-deadbeef").write_bytes(b"partial")
        stats = self.library.recover()
        self.assertEqual(stats["temporary"], 1)
        self.assertFalse((self.library.root / ".upload-deadbeef").exists())


class ModelNameTests(unittest.TestCase):
    def test_strips_control_characters_and_collapses_whitespace(self) -> None:
        self.assertEqual(normalize_model_name("  落\x00地\n花瓶  "), "落地花瓶")

    def test_falls_back_when_empty(self) -> None:
        self.assertEqual(normalize_model_name("   "), "我的装饰")

    def test_truncates_long_names(self) -> None:
        self.assertEqual(len(normalize_model_name("名" * 200)), 64)


def build_png(width: int, height: int) -> bytes:
    """最小 PNG 头（签名 + IHDR 宽高），只为让尺寸解析能量出来。"""
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", width, height)
        + b"\x08\x06\x00\x00\x00"
    )


def build_jpeg(width: int, height: int) -> bytes:
    """最小 JPEG 头（SOI + APP0 段 + SOF0 段），只为让尺寸解析能量出来。"""
    app0 = b"\xff\xe0" + struct.pack(">H", 4) + b"\x00\x00"
    sof0 = b"\xff\xc0" + struct.pack(">H", 11) + b"\x08" + struct.pack(">HH", height, width) + b"\x01\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof0


class ImageDimensionParsingTests(unittest.TestCase):
    """内嵌贴图的宽高解析（上游 `imageSide` / `imagePixels` 校验的基础）。"""

    def test_png_dimensions(self) -> None:
        self.assertEqual(image_dimensions(build_png(640, 480)), (640, 480))

    def test_jpeg_dimensions(self) -> None:
        self.assertEqual(image_dimensions(build_jpeg(300, 200)), (300, 200))

    def test_unknown_format_returns_none(self) -> None:
        # 量不出来时返回 None（调用方放行），而不是假装是 0×0。
        self.assertIsNone(image_dimensions(b"not-an-image"))
        self.assertIsNone(image_dimensions(b""))

    def test_truncated_png_returns_none(self) -> None:
        self.assertIsNone(image_dimensions(build_png(64, 64)[:16]))


class ImageSizeLimitTests(unittest.TestCase):
    """贴图边长与合计像素的限制（只在能量出尺寸时生效）。"""

    def _glb_with_texture(self, png: bytes) -> bytes:
        offset = 0
        # 顶点数据占位（让 bufferView 有内容），贴图接在后面。
        vertex = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
        image_offset = len(vertex)
        bin_payload = vertex + png
        gltf = {
            "asset": {"version": "2.0"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126}],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": len(vertex)},
                {"buffer": 0, "byteOffset": image_offset, "byteLength": len(png)},
            ],
            "buffers": [{"byteLength": len(bin_payload)}],
            "images": [{"bufferView": 1, "mimeType": "image/png"}],
        }
        del offset
        return build_glb(gltf, bin_payload)

    def _glb_with_textures(self, png_list: list[bytes]) -> bytes:
        """多张贴图（每张一个 bufferView），用于验证合计像素上限。"""
        vertex = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
        bin_payload = bytearray(vertex)
        views = [{"buffer": 0, "byteOffset": 0, "byteLength": len(vertex)}]
        images = []
        for png in png_list:
            views.append({"buffer": 0, "byteOffset": len(bin_payload), "byteLength": len(png)})
            images.append({"bufferView": len(views) - 1, "mimeType": "image/png"})
            bin_payload += png
        gltf = {
            "asset": {"version": "2.0"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"count": 3, "type": "VEC3", "componentType": 5126}],
            "bufferViews": views,
            "buffers": [{"byteLength": len(bin_payload)}],
            "images": images,
        }
        return build_glb(gltf, bytes(bin_payload))

    def test_normal_texture_passes_and_reports_pixels(self) -> None:
        summary = validate_glb(self._glb_with_texture(build_png(512, 512)), max_bytes=MAX_MODEL_BYTES)
        self.assertEqual(summary.image_pixels, 512 * 512)

    def test_oversized_side_rejected(self) -> None:
        with self.assertRaises(BusinessException) as caught:
            validate_glb(self._glb_with_texture(build_png(MAX_IMAGE_SIDE + 1, 64)), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("长边", str(caught.exception))

    def test_single_large_texture_alone_passes(self) -> None:
        # 单张 2048² = 4Mi 像素，未超 16Mi 总量：边界内的合法文件不能被拒。
        summary = validate_glb(self._glb_with_texture(build_png(2048, 2048)), max_bytes=MAX_MODEL_BYTES)
        self.assertEqual(summary.image_pixels, 2048 * 2048)
        self.assertGreater(MAX_IMAGE_PIXELS, 2048 * 2048)

    def test_total_pixels_rejected_across_textures(self) -> None:
        # 五张 2048² = 20Mi 像素，超过 16Mi 上限 —— 单看每张都合法，合起来越界。
        # 这正是「单张边长限制挡不住」的那类组合，必须由总量校验兜住。
        with self.assertRaises(BusinessException) as caught:
            validate_glb(self._glb_with_textures([build_png(2048, 2048)] * 5), max_bytes=MAX_MODEL_BYTES)
        self.assertIn("合计", str(caught.exception))

    def test_unmeasurable_texture_does_not_block(self) -> None:
        # 塞一段不是 PNG/JPEG 的字节：量不出尺寸 → 放行（宁可少一层校验也不误杀）。
        summary = validate_glb(self._glb_with_texture(b"not-an-image"), max_bytes=MAX_MODEL_BYTES)
        self.assertEqual(summary.image_pixels, 0)


class ModelReferenceGuardTests(unittest.TestCase):
    """被引用的模型不能删（0.8.9 上游 `deleteBlockReason`）。

    放任删除的后果是**已放置的物件变成 404**：场景里还留着 assetId，字节没了，
    3D 画面里那件装饰直接消失 —— 只能靠用户自己发现。所以删除路径必须能证明「没被引用」。
    """

    def test_scan_reports_referenced_model(self) -> None:

        asset_id = "a" * 32
        document = {
            "floors": [
                {
                    "scene": {
                        "items": [
                            {"type": "user-decoration", "assetId": asset_id},
                            {"type": "sofa", "assetId": "b" * 32},
                        ]
                    }
                }
            ]
        }
        # 直接验证扫描逻辑本身：用最小假 request/database 太脆，这里走纯函数式判定。
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        self.assertTrue(_document_references_model(document, asset_id))
        self.assertFalse(_document_references_model(document, "c" * 32))

    def test_scan_ignores_non_decoration_types(self) -> None:
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        asset_id = "d" * 32
        document = {"floors": [{"scene": {"items": [{"type": "image", "assetId": asset_id}]}}]}
        self.assertFalse(_document_references_model(document, asset_id))

    def test_scan_handles_single_floor_document(self) -> None:
        """老文档没有 floors，items 直接在 scene 上。"""
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        asset_id = "e" * 32
        document = {"scene": {"items": [{"type": "user-decoration", "assetId": asset_id}]}}
        self.assertTrue(_document_references_model(document, asset_id))

    def test_scan_tolerates_malformed_document(self) -> None:
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        for bad in (None, {}, {"floors": "nope"}, {"floors": [None, 3]}):
            self.assertFalse(_document_references_model(bad, "f" * 32))


class AssetIdPrefixCompatTests(unittest.TestCase):
    """0.8.9 上游把 assetId 存成 `model:<hex32>`，本仓存裸 hex。

    两种形态都必须能读：不兼容的后果是「从 0.8.9 导入的户型里装饰全部消失」——
    正则会拒掉带前缀的值，assetId 被清空，物件还在原位但画不出网格。
    """

    def test_strip_prefix(self) -> None:
        from homeos.backend.src.modules.interaction3d.scene_io import strip_decoration_asset_prefix

        self.assertEqual(strip_decoration_asset_prefix("model:" + "a" * 32), "a" * 32)
        self.assertEqual(strip_decoration_asset_prefix("A" * 32), "a" * 32)
        self.assertEqual(strip_decoration_asset_prefix(None), "")
        self.assertEqual(strip_decoration_asset_prefix(""), "")

    def test_scene_model_ids_accepts_both_forms(self) -> None:
        from homeos.backend.src.modules.interaction3d.scene_io import scene_model_ids

        prefixed = {
            "scene": {"floors": [{"scene": {"items": [{"type": "user-decoration", "assetId": "model:" + "b" * 32}]}}]}
        }
        bare = {"scene": {"floors": [{"scene": {"items": [{"type": "user-decoration", "assetId": "c" * 32}]}}]}}
        self.assertEqual(scene_model_ids(prefixed), {"b" * 32})
        self.assertEqual(scene_model_ids(bare), {"c" * 32})

    def test_single_floor_document_with_prefix(self) -> None:
        """老文档（items 直接在 scene 上）同样要接受前缀。"""
        from homeos.backend.src.modules.interaction3d.scene_io import scene_model_ids

        document = {"scene": {"items": [{"type": "user-decoration", "assetId": "model:" + "d" * 32}]}}
        self.assertEqual(scene_model_ids(document), {"d" * 32})

    def test_reference_scan_accepts_prefix(self) -> None:
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        document = {"floors": [{"scene": {"items": [{"type": "user-decoration", "assetId": "model:" + "e" * 32}]}}]}
        self.assertTrue(_document_references_model(document, "e" * 32))


class UpstreamKeyCompatTests(unittest.TestCase):
    """0.8.9 上游的物件字段名与本仓不同（`modelAssetId`/`modelName` vs `assetId`/`name`）。

    只读一边的后果：从 0.8.9 导入的户型里，装饰的 assetId 拿不到 ——
    物件还在原位，但 3D 里一件都画不出来，且属性面板也显示不出模型名。
    """

    def test_scene_model_ids_reads_model_asset_id(self) -> None:
        from homeos.backend.src.modules.interaction3d.scene_io import scene_model_ids

        document = {
            "scene": {
                "floors": [{"scene": {"items": [{"type": "user-decoration", "modelAssetId": "model:" + "a" * 32}]}}]
            }
        }
        self.assertEqual(scene_model_ids(document), {"a" * 32})

    def test_reference_scan_reads_model_asset_id(self) -> None:
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        document = {
            "floors": [{"scene": {"items": [{"type": "user-decoration", "modelAssetId": "model:" + "b" * 32}]}}]
        }
        self.assertTrue(_document_references_model(document, "b" * 32))

    def test_reference_scan_reads_nested_floors(self) -> None:
        """户型草稿的形状是 `{scene: {floors: [...]}}`（楼层嵌在 scene 下）。"""
        from homeos.backend.src.api.studio3d import _document_references_model  # type: ignore[attr-defined]

        document = {"scene": {"floors": [{"scene": {"items": [{"type": "user-decoration", "assetId": "c" * 32}]}}]}}
        self.assertTrue(_document_references_model(document, "c" * 32))

    def test_both_keys_present_prefers_asset_id(self) -> None:
        from homeos.backend.src.modules.interaction3d.scene_io import scene_model_ids

        document = {
            "scene": {
                "floors": [
                    {
                        "scene": {
                            "items": [
                                {
                                    "type": "user-decoration",
                                    "assetId": "d" * 32,
                                    "modelAssetId": "model:" + "e" * 32,
                                }
                            ]
                        }
                    }
                ]
            }
        }
        # 两个键都在时以本仓 `assetId` 为准（它是当前写入方）。
        self.assertEqual(scene_model_ids(document), {"d" * 32})


if __name__ == "__main__":
    unittest.main()


class ModelUsageDraftScanTests(unittest.TestCase):
    """`studio_model_usages` 必须真的读到**户型草稿**里的引用。

    这里补的是一条现场缺陷的回归：扫描函数取的是 `getattr(snapshot, "document")`，
    而快照字段叫 `scene` —— 于是「户型图绘制」这条永远返回 None。后果不是报错，
    而是**静默放行**：草稿里还摆着某件装饰，模型却被删了，物件从此 404。

    只测 `_document_references_model`（上一个测试类）抓不到这个错：纯函数是对的，
    错在「从哪个字段取文档」。
    """

    ASSET_ID = "a576b34cf6f04eb9a855401574ad10e8"

    def _request_with(self, draft_scene: dict | None) -> object:
        """造一个最小 request：只带 `app.state.database`，数据库用假对象。"""

        class _EmptyScalars:
            def all(self) -> list[object]:
                return []

            def __iter__(self):
                return iter(())

        class _Result:
            def __init__(self, row: dict | None) -> None:
                self._row = row

            def mappings(self) -> _Result:
                return self

            def first(self) -> dict | None:
                return self._row

        class _FakeDatabase:
            def __init__(self, scene: dict | None) -> None:
                self._scene = scene

            def scalars(self, _statement: object) -> _EmptyScalars:
                # 项目与项目草稿都返回空：本用例只关心户型草稿这一条引用面。
                return _EmptyScalars()

            def execute(self, _statement: object, _params: object = None) -> _Result:
                if self._scene is None:
                    return _Result(None)
                return _Result(
                    {
                        "revision": 1,
                        "schema_version": 1,
                        "scene_json": json.dumps(self._scene),
                        "updated_at": "2026-11-26T00:00:00+00:00",
                    }
                )

            def get(self, _model: object, _key: object) -> None:
                return None

        class _State:
            database = _FakeDatabase(draft_scene)

        class _App:
            state = _State()

        class _FakeRequest:
            app = _App()

        return _FakeRequest()

    def test_referenced_model_in_floors_is_reported(self) -> None:
        from homeos.backend.src.api.studio3d import studio_model_usages

        scene = {
            "floors": [
                {"scene": {"items": [{"type": "user-decoration", "assetId": self.ASSET_ID}]}},
            ]
        }
        self.assertEqual(studio_model_usages(self._request_with(scene), self.ASSET_ID), ["户型图绘制"])

    def test_referenced_model_in_single_floor_draft_is_reported(self) -> None:
        from homeos.backend.src.api.studio3d import studio_model_usages

        scene = {"items": [{"type": "user-decoration", "assetId": self.ASSET_ID}]}
        self.assertEqual(studio_model_usages(self._request_with(scene), self.ASSET_ID), ["户型图绘制"])

    def test_model_prefixed_asset_id_is_reported(self) -> None:
        from homeos.backend.src.api.studio3d import studio_model_usages

        scene = {"items": [{"type": "user-decoration", "assetId": "model:" + self.ASSET_ID}]}
        self.assertEqual(studio_model_usages(self._request_with(scene), self.ASSET_ID), ["户型图绘制"])

    def test_unreferenced_model_is_not_reported(self) -> None:
        from homeos.backend.src.api.studio3d import studio_model_usages

        scene = {"items": [{"type": "user-decoration", "assetId": "b" * 32}]}
        self.assertEqual(studio_model_usages(self._request_with(scene), self.ASSET_ID), [])

    def test_no_draft_does_not_block(self) -> None:
        from homeos.backend.src.api.studio3d import studio_model_usages

        self.assertEqual(studio_model_usages(self._request_with(None), self.ASSET_ID), [])
