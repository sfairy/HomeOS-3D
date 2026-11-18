"""备份清单校验回归。

历史缺陷：``manifest["files"]`` 被当作 dict、``formatVersion`` 直接 ``int()``。
清单是外部输入，``"files": ["x"]`` 会抛 ``AttributeError``、``"formatVersion": "abc"``
会抛 ``ValueError`` —— 都不是 ``BackupError``，API 只会返回 500，且临时目录不被清理。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.backup.business_backup import (
    KIND,
    BackupError,
    validate_full_backup,
)


def _manifest(**overrides):
    payload = {
        "kind": KIND,
        "formatVersion": 1,
        "database": {"name": "homeos.db", "size": 0, "sha256": "0" * 64},
    }
    payload.update(overrides)
    return payload


class ValidateFullBackupTest(unittest.TestCase):
    def test_valid_manifest_passes(self) -> None:
        validate_full_backup(_manifest())

    def test_non_numeric_format_version_raises_backup_error(self) -> None:
        with self.assertRaises(BackupError):
            validate_full_backup(_manifest(formatVersion="abc"))

    def test_none_format_version_defaults_to_zero(self) -> None:
        validate_full_backup(_manifest(formatVersion=None))

    def test_missing_database_raises(self) -> None:
        with self.assertRaises(BackupError):
            validate_full_backup(_manifest(database=None))

    def test_wrong_kind_raises(self) -> None:
        with self.assertRaises(BackupError):
            validate_full_backup(_manifest(kind="other"))


if __name__ == "__main__":
    unittest.main()
