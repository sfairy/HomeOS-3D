"""0.8.6 仪表盘字体：文件校验、上传存储、文档字段与引用解析。"""

from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
REPO_ROOT = Path(__file__).resolve().parents[4]

sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import ValidationError
from src.domains.fonts import FontStore, valid_font_selection, validate_font_file
from src.panel.asset_refs import document_asset_ids, studio_asset_ids
from src.panel.schema import DashboardFonts, Theme


def _fvar(low: int, high: int) -> bytes:
    header = struct.pack(">HHHHHH", 1, 0, 16, 0, 1, 20) + struct.pack(">HH", 0, 0)
    axis = struct.pack(">4siiiHH", b"wght", low << 16, 400 << 16, high << 16, 0, 0)
    return header + axis


def make_sfnt(*, magic: bytes = b"\x00\x01\x00\x00", tables: dict[bytes, bytes] | None = None) -> bytes:
    tables = tables or {b"cmap": b"\0" * 8, b"head": b"\0" * 8, b"name": b"\0" * 8}
    count = len(tables)
    offset = 12 + count * 16
    directory = b""
    body = b""
    for tag, data in tables.items():
        directory += struct.pack(">4sIII", tag, 0, offset + len(body), len(data))
        body += data
    return magic + struct.pack(">HHHH", count, 0, 0, 0) + directory + body


def make_woff(*, flavor: bytes = b"wOFF") -> bytes:
    directory = struct.pack(">4sIIII", b"cmap", 64, 4, 4, 0)
    data = bytearray(struct.pack(">4s4sIHH", flavor, b"\0\1\0\0", 0, 1, 0))
    data += struct.pack(">I", 1024)
    data += b"\0" * (44 - len(data))
    data += directory
    data += b"\0" * 4
    struct.pack_into(">I", data, 8, len(data))
    return bytes(data)


class FontValidationTest(unittest.TestCase):
    def test_static_ttf_defaults_to_regular_weight(self) -> None:
        self.assertEqual(validate_font_file(make_sfnt(), ".ttf"), "400")

    def test_variable_font_reports_weight_range(self) -> None:
        tables = {b"cmap": b"\0" * 8, b"head": b"\0" * 8, b"name": b"\0" * 8, b"fvar": _fvar(100, 900)}
        self.assertEqual(validate_font_file(make_sfnt(tables=tables), ".ttf"), "100 900")

    def test_extension_must_match_container(self) -> None:
        with self.assertRaisesRegex(ValueError, "扩展名不一致"):
            validate_font_file(make_sfnt(), ".otf")
        self.assertEqual(validate_font_file(make_sfnt(magic=b"OTTO"), ".otf"), "400")

    def test_missing_required_tables_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "缺少必要"):
            validate_font_file(make_sfnt(tables={b"cmap": b"\0" * 40}), ".ttf")

    def test_truncated_table_rejected(self) -> None:
        data = make_sfnt()[:-4]
        with self.assertRaisesRegex(ValueError, "不完整"):
            validate_font_file(data, ".ttf")

    def test_woff_header_checked(self) -> None:
        self.assertEqual(validate_font_file(make_woff(), ".woff"), "400")
        with self.assertRaisesRegex(ValueError, "压缩字体"):
            validate_font_file(make_woff(), ".woff2")

    def test_unknown_or_tiny_files_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "无法识别"):
            validate_font_file(b"GIF89a" + b"\0" * 64, ".ttf")
        with self.assertRaisesRegex(ValueError, "32 MB"):
            validate_font_file(b"\0" * 10, ".ttf")


class FontSelectionTest(unittest.TestCase):
    def test_selection_values(self) -> None:
        self.assertTrue(valid_font_selection("device", latin=False))
        self.assertTrue(valid_font_selection("lxgw-wenkai", latin=False))
        self.assertTrue(valid_font_selection("font:" + "a" * 32, latin=False))
        self.assertFalse(valid_font_selection("chinese", latin=False))
        self.assertTrue(valid_font_selection("chinese", latin=True))
        self.assertFalse(valid_font_selection("font:xyz", latin=True))
        self.assertFalse(valid_font_selection(3, latin=True))

    def test_theme_fonts_schema(self) -> None:
        theme = Theme.model_validate({"fonts": {"chinese": "smiley-sans", "latin": "chinese"}})
        self.assertEqual(theme.fonts, DashboardFonts(chinese="smiley-sans", latin="chinese"))
        self.assertIsNone(Theme.model_validate({}).fonts)
        with self.assertRaises(ValidationError):
            Theme.model_validate({"fonts": {"chinese": "chinese"}})
        with self.assertRaises(ValidationError):
            Theme.model_validate({"fonts": {"chinese": "device", "extra": 1}})


class FontStoreTest(unittest.TestCase):
    def test_save_dedupe_list_delete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = FontStore(Path(tmp) / "fonts")
            self.assertEqual(store.entries(), [])
            first = store.save(make_sfnt(), "我的字体.ttf")
            self.assertRegex(first["id"], r"^font:[0-9a-f]{32}$")
            self.assertEqual(first["name"], "我的字体")
            self.assertEqual(first["source"], "user")
            self.assertTrue(first["url"].startswith("/api/v1/fonts/user/"))
            self.assertEqual(store.save(make_sfnt(), "another.ttf"), first)
            self.assertEqual([item["id"] for item in store.entries()], [first["id"]])
            found = store.entry(first["id"])
            assert found is not None
            self.assertEqual(found[1].read_bytes(), make_sfnt())
            self.assertFalse(any(path.name.startswith(".upload-") for path in store.root.iterdir()))
            store.delete(first["id"])
            self.assertIsNone(store.entry(first["id"]))

    def test_invalid_upload_leaves_no_staging(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = FontStore(Path(tmp) / "fonts")
            with self.assertRaises(ValueError):
                store.save(b"not a font" * 10, "bad.ttf")
            self.assertEqual(store.entries(), [])

    def test_entry_rejects_malformed_ids(self) -> None:
        store = FontStore(Path("/nonexistent"))
        self.assertIsNone(store.entry("font:../../etc"))
        self.assertIsNone(store.entry("user:" + "a" * 32))


class FontReferenceTest(unittest.TestCase):
    def test_theme_fonts_count_as_asset_references(self) -> None:
        font_id = "font:" + "b" * 32
        document = {
            "theme": {"fonts": {"chinese": font_id, "latin": "inter"}},
            "widgets": [{"backgroundAssetId": "user:" + "c" * 32}],
        }
        self.assertEqual(document_asset_ids(document), {font_id, "user:" + "c" * 32})
        self.assertIn(font_id, studio_asset_ids(document))


class BuiltinFontCatalogTest(unittest.TestCase):
    def test_catalog_files_present(self) -> None:
        root = REPO_ROOT / "homeos" / "assets-default" / "fonts"
        catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
        ids = {item["id"] for item in catalog["fonts"]}
        self.assertEqual(len(ids), 8)
        for item in catalog["fonts"]:
            self.assertTrue((root / item["file"]).is_file(), item["file"])
            # 授权文本不再随包分发，只保留上游 URL 作为出处；这里守的是「出处必须声明」。
            self.assertTrue(item.get("licenseSource", "").startswith("https://"), item["id"])


if __name__ == "__main__":
    unittest.main()
