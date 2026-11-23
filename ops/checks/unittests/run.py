#!/usr/bin/env python3
"""后端单元测试 runner（标准库 ``unittest``，不引入 pytest）。

为什么不用 pytest
----------------
仓库现有自检脚本全部是「标准库直接跑、失败即非零退出」的形态，``requirements.lock`` 里
也没有 pytest。为了不把「写测试」变成「先改依赖锁 + 重建镜像」，这里用 ``unittest``：
断言风格与 pytest 接近，但零新增依赖。

约定
----
- 测试模块放 ``ops/checks/unittests/test_*.py``，用 ``unittest.TestCase``；
- 被测代码按仓库既有习惯用 ``sys.path`` 插入仓库根后 import（``homeos.backend.src.…``）；
- 纯逻辑优先：能用真实依赖就跑真实依赖（不 mock 被测对象），需要外部服务的不进这里。

用法
----
    node ops/lib/py.mjs ops/checks/unittests/run.py            # 跑全部
    node ops/lib/py.mjs ops/checks/unittests/run.py -v         # 逐用例
    node ops/lib/py.mjs ops/checks/unittests/run.py test_license  # 只跑匹配前缀的模块
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UNIT_DIR = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main(argv: list[str]) -> int:
    verbose = "-v" in argv or "--verbose" in argv
    patterns = [item for item in argv[1:] if not item.startswith("-")]

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for pattern in patterns or [""]:
        suite.addTests(loader.discover(str(UNIT_DIR), pattern=f"{pattern}test_*.py", top_level_dir=str(UNIT_DIR)))

    runner = unittest.TextTestRunner(verbosity=2 if verbose else 1)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
