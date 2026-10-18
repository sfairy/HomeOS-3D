"""业务备份包读取：清单校验必须接受 0 字节文件（回归）。

这个 bug 的形状值得单独留一条测试：``create_payload`` 会把数据目录里的 0 字节文件
（``.license-process.lock``、``homeos.db.migrate.lock`` 这类锁文件必然存在）按
``{"size": 0, ...}`` 写进清单，而旧的读取侧写的是

    expected_size = int(meta.get("size") or -1)

``0 or -1`` 得到 ``-1``，于是**每一个**自己导出的备份都在检查阶段报
「备份清单缺少文件大小：.license-process.lock」—— 导出成功、恢复永远失败，
文案还与「0 字节」毫无关系。改用显式类型判定后，0 必须被当成合法大小。
"""

import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from src.domains.backup.business_backup import (
    DB_NAME,
    FORMAT_VERSION,
    KIND,
    MANIFEST_NAME,
    PRODUCT,
    BackupError,
    read_manifest,
)

ZERO_BYTE_NAME = ".license-process.lock"
NORMAL_NAME = "assets/logo.png"
NORMAL_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 24


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _manifest(files: dict[str, dict]) -> dict:
    return {
        "kind": KIND,
        "product": PRODUCT,
        "formatVersion": FORMAT_VERSION,
        "version": "0.0.0-test",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "database": {"name": DB_NAME, "sha256": _digest(b"db"), "size": 2},
        "files": files,
        "excludedTables": [],
        "includesHistory": False,
        "hasSecrets": False,
    }


def build_payload(path: Path, files: dict[str, dict]) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(DB_NAME, b"db")
        archive.writestr(ZERO_BYTE_NAME, b"")
        archive.writestr(NORMAL_NAME, NORMAL_BYTES)
        archive.writestr(MANIFEST_NAME, json.dumps(_manifest(files)))
    return path


class ManifestVerificationTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_zero_byte_entry_is_valid(self) -> None:
        """0 字节文件是合法条目 —— 旧实现会把它折成 -1 并报「缺少文件大小」。"""
        payload = build_payload(
            self.root / "payload.zip",
            {
                ZERO_BYTE_NAME: {"sha256": _digest(b""), "size": 0},
                NORMAL_NAME: {"sha256": _digest(NORMAL_BYTES), "size": len(NORMAL_BYTES)},
            },
        )
        manifest = read_manifest(payload)
        self.assertEqual(manifest["files"][ZERO_BYTE_NAME]["size"], 0)

    def test_missing_size_is_rejected(self) -> None:
        """缺 ``size`` 仍然必须拒绝：否则空文件能绕过大小校验。"""
        payload = build_payload(
            self.root / "payload.zip",
            {
                ZERO_BYTE_NAME: {"sha256": _digest(b"")},
                NORMAL_NAME: {"sha256": _digest(NORMAL_BYTES), "size": len(NORMAL_BYTES)},
            },
        )
        with self.assertRaises(BackupError) as caught:
            read_manifest(payload)
        self.assertIn("缺少文件大小", str(caught.exception))

    def test_negative_size_is_rejected(self) -> None:
        payload = build_payload(
            self.root / "payload.zip",
            {ZERO_BYTE_NAME: {"sha256": _digest(b""), "size": -1}},
        )
        with self.assertRaises(BackupError) as caught:
            read_manifest(payload)
        self.assertIn("缺少文件大小", str(caught.exception))

    def test_size_mismatch_is_rejected(self) -> None:
        payload = build_payload(
            self.root / "payload.zip",
            {ZERO_BYTE_NAME: {"sha256": _digest(b""), "size": 7}},
        )
        with self.assertRaises(BackupError) as caught:
            read_manifest(payload)
        self.assertIn("大小与清单不符", str(caught.exception))

    def test_digest_mismatch_is_rejected(self) -> None:
        payload = build_payload(
            self.root / "payload.zip",
            {NORMAL_NAME: {"sha256": "0" * 64, "size": len(NORMAL_BYTES)}},
        )
        with self.assertRaises(BackupError) as caught:
            read_manifest(payload)
        self.assertIn("摘要与清单不符", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
