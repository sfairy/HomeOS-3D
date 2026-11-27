"""``ops/checks/unittests`` 的公共引导：把仓库根塞进 ``sys.path``。

为什么单独成模块：每个测试文件都要 ``ROOT = parents[3]`` + ``sys.path.insert``。
这段样板抄进每个新测试，新文件会与任一既有测试成为同构样板
（实测 14 行）。收敛成一处后样板只有一行 import。

用法（``unittest discover`` 会把本目录放进 ``sys.path``，因此裸 import 即可）：

    from _support import ensure_repo_on_path

    ensure_repo_on_path()
"""

from __future__ import annotations

import sys
from pathlib import Path

#: 仓库根（``ops/checks/unittests`` 上三级）。
ROOT = Path(__file__).resolve().parents[3]


def ensure_repo_on_path() -> Path:
    """让 ``homeos.backend.src`` / ``ops.lib`` 可导入，返回仓库根。"""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    return ROOT


__all__ = ["ROOT", "ensure_repo_on_path"]
