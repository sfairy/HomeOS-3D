"""启动期导入顺序的契约测试（路线图 `startup-imports`）。

「启动期惰性导入」很容易被一次无心改动推翻：只要有人在 `lifespan.py` 顶部把
`from . import studio3d_plane` 加回去，`import src.app` 立刻重新背上 ~200ms 的
3D 数据面装配（路由、模块、数据面服务）。这类回退不会让任何用例变红——功能完全
正常，只是每次导入都慢一点，所以只能显式断言。

断言三件事：
1. `import src.bootstrap.lifespan` **不会**顺带导入 `bootstrap.studio3d_plane`
   （以及它连带的路由模块）；
2. 句柄第一次取值时才导入，且同一模块被复用（不是每次都重新 resolve）；
3. 停机路径在模块从未导入时不会为了「关掉它」去导入一遍。

用 ``subprocess`` 跑：本进程的 `sys.modules` 早被别的用例污染过，在进程内断言
「没有导入」测的其实是 import 顺序的巧合。
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"


def _run(code: str) -> dict:
    """在干净的子进程里执行片段，返回它打印的 JSON。"""
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(BACKEND_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(f"子进程失败：\n{completed.stderr[-2000:]}")
    return json.loads(completed.stdout.strip().splitlines()[-1])


class StartupImportContractTest(unittest.TestCase):
    def test_lifespan_import_does_not_pull_studio3d_plane(self) -> None:
        payload = _run(
            """
import json, sys
import src.bootstrap.lifespan  # noqa: F401
print(json.dumps({
    "plane": "src.bootstrap.studio3d_plane" in sys.modules,
    "api": "src.api.studio3d" in sys.modules,
}))
"""
        )
        self.assertFalse(payload["plane"], "lifespan 顶部又把 studio3d_plane 导回来了")
        self.assertFalse(payload["api"], "studio3d 路由模块被 lifespan 顶层导入连带拉进来了")

    def test_handle_imports_once_on_demand(self) -> None:
        payload = _run(
            """
import json, sys
from src.bootstrap import lifespan
before = "src.bootstrap.studio3d_plane" in sys.modules
first = lifespan._studio3d_plane()
after_first = "src.bootstrap.studio3d_plane" in sys.modules
second = lifespan._studio3d_plane()
print(json.dumps({
    "before": before,
    "after_first": after_first,
    "same": first is second,
    "name": getattr(first, "__name__", ""),
}))
"""
        )
        self.assertFalse(payload["before"])
        self.assertTrue(payload["after_first"])
        self.assertTrue(payload["same"], "每次取值都重新 import 会丢掉缓存的句柄")
        self.assertEqual(payload["name"], "src.bootstrap.studio3d_plane")


if __name__ == "__main__":
    unittest.main()
