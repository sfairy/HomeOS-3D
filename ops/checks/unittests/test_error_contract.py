"""错误契约与棘轮骨架的单元测试。

``api_error`` / ``resolve_api_error_code`` 是前端拿稳定错误码的唯一通道；``ratchet``
是六条棘轮门禁的共同骨架（骨架算错 = 所有棘轮一起错，且方向可能反成「只管放松」）。
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from homeos.backend.src.platform.core.http.errors import (
    API_ERROR,
    BusinessException,
    ErrorCode,
    api_error,
    resolve_api_error_code,
)
from ops.lib.ratchet import run_file_count_ratchet


class ApiErrorTest(unittest.TestCase):
    def test_static_message(self) -> None:
        self.assertEqual(api_error("HA_CONNECTION_REQUIRED"), "请先配置 Home Assistant 连接。")

    def test_callable_message_receives_args(self) -> None:
        self.assertEqual(api_error("UI_CONFIG_PROFILE_NOT_FOUND", "p1"), '配置方案 "p1" 不存在')

    def test_unknown_key_returns_key_itself(self) -> None:
        """未知键返回键名而不是空串：面板会显示 ``SOME_KEY`` 而不是一片空白。"""
        self.assertEqual(api_error("NOT_A_REGISTERED_KEY"), "NOT_A_REGISTERED_KEY")

    def test_reverse_lookup_recovers_code_from_message(self) -> None:
        message = API_ERROR["HA_CONNECTION_REQUIRED"]
        self.assertEqual(resolve_api_error_code(message), "HA_CONNECTION_REQUIRED")

    def test_reverse_lookup_tolerates_whitespace_only(self) -> None:
        self.assertIsNone(resolve_api_error_code(""))
        self.assertIsNone(resolve_api_error_code("   "))
        self.assertIsNone(resolve_api_error_code(None))

    def test_business_exception_status_from_error_code(self) -> None:
        error = BusinessException(ErrorCode.CONFLICT, "冲突")
        self.assertEqual(error.status_code, 409)
        self.assertEqual(str(error.error_code), "CONFLICT")

    def test_explicit_status_and_headers_win(self) -> None:
        error = BusinessException(ErrorCode.VALIDATION_FAILED, "x", http_status=429, headers={"retry-after": "5"})
        self.assertEqual((error.status_code, error.headers), (429, {"retry-after": "5"}))


class RatchetSkeletonTest(unittest.TestCase):
    """棘轮骨架的判定方向：变多失败、持平通过、减少通过（并提示可压低基线）。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.baseline = Path(self._tmp.name) / "baseline.json"
        self.baseline.write_text(json.dumps({"total": 2, "files": {"a.py": 1, "b.py": 1}}), encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _run(self, counts: dict[str, int], argv: list[str] | None = None) -> int:
        per_file = {path: list(range(count)) for path, count in counts.items()}
        return run_file_count_ratchet(
            name="unit",
            description="unit",
            rules="unit",
            baseline_path=self.baseline,
            scan=lambda: (per_file, sum(counts.values())),
            argv=argv if argv is not None else [],
        )

    def test_equal_counts_pass(self) -> None:
        self.assertEqual(self._run({"a.py": 1, "b.py": 1}), 0)

    def test_growth_in_existing_file_fails(self) -> None:
        self.assertEqual(self._run({"a.py": 2, "b.py": 1}), 1)

    def test_growth_in_new_file_fails(self) -> None:
        self.assertEqual(self._run({"a.py": 1, "b.py": 1, "c.py": 1}), 1)

    def test_shrink_passes(self) -> None:
        self.assertEqual(self._run({"a.py": 0, "b.py": 1}), 0)

    def test_update_writes_new_baseline(self) -> None:
        per_file = {"a.py": [0], "b.py": [0, 1]}
        self.assertEqual(self._run({"a.py": 1, "b.py": 2}, argv=["--update"]), 0)
        payload = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(payload["files"], {"a.py": 1, "b.py": 2})
        self.assertEqual(len(per_file), 2)


if __name__ == "__main__":
    unittest.main()
