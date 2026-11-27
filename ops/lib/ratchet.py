"""后端检查的公共骨架：ruff 定位、进程级 AST / 文本缓存、按目录产出 ``*.py``。

为什么抽出这一层
----------------
批量入口（`run_backend_checks.py`）会在同一个解释器里依次跑多条检查，它们扫的是
**同一批 694 个 .py**。此前每条都把整棵树 `ast.parse` 一遍，单条 1.3–3.9s 全花在
重复解析上；共享缓存后第二条起直接命中。

这里**只管缓存与定位**，不再提供基线读写：「只许降的数字棘轮」已按「不设数字门槛」
全部删除，留下读写基线的骨架只会变成没有消费者的死代码。

用法
----
    from ops.checks._bootstrap import parse_tree      # 已经从本模块转出
    from ops.lib.ratchet import iter_python_files

    两个检查此前各写了一遍同样的 ``rglob('*.py') + 目录过滤``，收在一处后只剩一行 import。
"""

from __future__ import annotations

import ast
import os
import shutil
from pathlib import Path


def resolve_ruff(repo_root: Path) -> str:
    """定位 ruff：`RUFF` 环境变量 → PATH → 共享 venv。

    为什么放在共享库：`check_python_format` 与 `check_guards` 都需要它，两处各抄一份
    10 行就会变成同构样板。优先级顺序也是仓内约定（先尊重显式覆盖，
    再让 CI 用 PATH 里的，最后才回落到本机 venv）。
    """
    override = os.environ.get("RUFF", "").strip()
    if override:
        return override
    found = shutil.which("ruff")
    if found:
        return found
    venv = repo_root / ".venv-store" / "bin" / "ruff"
    if venv.is_file():
        return str(venv)
    raise SystemExit("找不到 ruff。装到 .venv-store，或用 RUFF=/path/to/ruff 指定。")


#: 扫描时跳过的目录：产物 / 缓存 / 虚拟环境。
SKIP_DIRS = frozenset({"__pycache__", "node_modules", ".venv-store", "dist", "backups"})

#: 进程级 AST / 文本缓存。
#:
#: 键是规范化后的绝对路径。一次门禁运行内源文件不会变化，因此不需要 mtime 失效。
_TREE_CACHE: dict[str, ast.AST] = {}
_TEXT_CACHE: dict[str, str] = {}


def read_text(path: Path | str) -> str:
    """读 UTF-8 文本（进程内缓存）。"""
    key = str(Path(path).resolve())
    cached = _TEXT_CACHE.get(key)
    if cached is not None:
        return cached
    value = Path(path).read_text(encoding="utf-8")
    _TEXT_CACHE[key] = value
    return value


def parse_tree(path: Path | str) -> ast.AST:
    """`ast.parse` 的进程级缓存版本。

    注意：`filename` 仍取真实路径，语法错误信息不受影响；调用方不应修改返回的树
    （多个检查共用同一份 AST，改写会让后一条检查看到被污染的节点）。
    """
    resolved = Path(path).resolve()
    key = str(resolved)
    cached = _TREE_CACHE.get(key)
    if cached is not None:
        return cached
    tree = ast.parse(read_text(resolved), filename=key)
    _TREE_CACHE[key] = tree
    return tree


def iter_python_files(roots: list[Path], *, skip_dirs: frozenset[str] = SKIP_DIRS):
    """按路径顺序产出待扫描的 ``*.py``（跳过产物目录）。

    多条检查此前各写了一遍同样的 ``rglob + 目录过滤``，收在一处后只剩一行 import。
    """
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.py")):
            if any(part in skip_dirs for part in path.parts):
                continue
            yield path
