"""单进程守卫的回归：配置了多 worker 必须在启动期失败，而不是静默降级。

运行：node ops/lib/py.mjs -m unittest discover -s ops/checks/shared/tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SHARED_PY_ROOT = REPO_ROOT / "packages" / "shared-py"
sys.path.insert(0, str(SHARED_PY_ROOT))

from homeos_shared.single_process import assert_single_process, configured_worker_count


class WorkerCountTest(unittest.TestCase):
    def test_missing_or_single_is_one(self) -> None:
        self.assertEqual(configured_worker_count({}), 1)
        self.assertEqual(configured_worker_count({"WEB_CONCURRENCY": "1"}), 1)
        self.assertEqual(configured_worker_count({"UVICORN_WORKERS": " 1 "}), 1)
        self.assertEqual(configured_worker_count({"GUNICORN_WORKERS": "not-a-number"}), 1)

    def test_multi_worker_is_detected(self) -> None:
        self.assertEqual(configured_worker_count({"WEB_CONCURRENCY": "4"}), 4)
        self.assertEqual(configured_worker_count({"UVICORN_WORKERS": "2"}), 2)
        self.assertEqual(configured_worker_count({"HOMEOS_WORKERS": "auto"}), 2)


class AssertSingleProcessTest(unittest.TestCase):
    def test_single_process_passes(self) -> None:
        assert_single_process("测试服务", {"WEB_CONCURRENCY": "1"})
        assert_single_process("测试服务", {})

    def test_multi_worker_raises_with_all_offenders(self) -> None:
        with self.assertRaises(RuntimeError) as caught:
            assert_single_process(
                "测试服务",
                {"WEB_CONCURRENCY": "4", "UVICORN_WORKERS": "2", "STORE_WORKERS": "3"},
            )
        message = str(caught.exception)
        self.assertIn("测试服务", message)
        self.assertIn("WEB_CONCURRENCY=4", message)
        self.assertIn("UVICORN_WORKERS=2", message)
        self.assertIn("STORE_WORKERS=3", message)
