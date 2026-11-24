"""``ops/checks/perf/*`` 的公共引导：仓库根 + ``ops/bench`` 注入，再暴露 ``_support``。

为什么单独一个模块
------------------
``bench_http.py`` 与 ``check_backend_hotpaths.py`` 都要做同一件事：把仓库根和
``ops/bench`` 塞进 ``sys.path``，再 ``import _support``（百分位统计 / 夹具 / 基线读写）。
两份各写一遍会被 ``check:duplicates`` 如实报出来 —— 基准/门禁自己长重复最没说服力。

用法（两个脚本的 sys.path[0] 就是本目录，因此裸 import 即可）::

    from _bench_bootstrap import BENCH_DIR, ROOT, support

    support.measure(...)
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BENCH_DIR = ROOT / "ops" / "bench"
for _entry in (str(ROOT), str(BENCH_DIR)):
    if _entry not in sys.path:
        sys.path.insert(0, _entry)

import _support as support

__all__ = ["BENCH_DIR", "ROOT", "support"]
