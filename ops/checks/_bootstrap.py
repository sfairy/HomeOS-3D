"""门禁脚本的公共引导：仓库根注入 + AST 缓存入口。

为什么单独一个模块
------------------
11 条 Python 检查都要做同一件事：把仓库根塞进 `sys.path`，再 `import ops.lib.ratchet`。
每份脚本抄一遍就成了 12–16 行的同构头部，重复样板本身就是维护负担 ——
门禁自己长重复是最没说服力的形态。

这里把那段固定动作收成一处：

- `ROOT`：仓库根（`ops/checks/_bootstrap.py` 上两级）；
- `parse_tree` / `load_ratchet`：`ops.lib.ratchet` 的入口，导入本模块后即可直接使用。

直接执行（`python ops/checks/check_x.py`）时 `sys.path[0]` 就是 `ops/checks`，所以
`from _bootstrap import ROOT, parse_tree` 一定可解析；子目录里的脚本先把自己上两级目录
插进 `sys.path` 再导入。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.lib import ratchet as _ratchet

#: `ast.parse` 的进程级缓存版本（批量入口里跨模块复用同一棵树）。
parse_tree = _ratchet.parse_tree

#: 与 `ROOT` 同值：子目录脚本习惯用 `REPO_ROOT` 命名（`parents[3]` 算出来的是同一个根）。
REPO_ROOT = ROOT

__all__ = ["REPO_ROOT", "ROOT", "parse_tree"]
