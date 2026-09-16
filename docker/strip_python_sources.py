#!/usr/bin/env python3
"""把目录内 Python 编译为 legacy ``.pyc`` 后删除 ``.py`` 源码。

Alembic 按文件名加载 ``migrations/env.py``，因此 ``migrations/`` 下的 ``.py`` 会保留。
``store/tools/seed.py`` / ``gen_keys.py`` 保留进镜像（运维初始化）；smoke/e2e 去掉。
前端静态资源（HTML/JS/CSS）不在此处理。
"""
from __future__ import annotations

import argparse
import compileall
import py_compile
import shutil
import sys
from pathlib import Path


KEEP_PY_PREFIXES = (
    "migrations/",
)

# 不进运行镜像的开发/测试脚本（相对仓库根）
DROP_PATHS = (
    "store/tools/smoke.py",
    "store/tools/e2e.py",
)


def _is_kept_source(path: Path, root: Path) -> bool:
    relative = path.relative_to(root).as_posix()
    return any(relative == prefix.rstrip("/") or relative.startswith(prefix) for prefix in KEEP_PY_PREFIXES)


def _remove_tree(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def strip_tree(root: Path) -> None:
    root = root.resolve()
    if not root.is_dir():
        raise SystemExit(f"不是目录：{root}")

    for relative in DROP_PATHS:
        _remove_tree(root / relative)

    probes = root / "backend" / "app"
    if probes.is_dir():
        for match in probes.glob("probe_*.py"):
            _remove_tree(match)

    ok = compileall.compile_dir(
        str(root),
        maxlevels=20,
        quiet=1,
        force=True,
        legacy=True,
        optimize=2,
        invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH,
    )
    if not ok:
        raise SystemExit(f"compileall 失败：{root}")

    removed = 0
    for path in sorted(root.rglob("*.py")):
        if _is_kept_source(path, root):
            continue
        path.unlink()
        removed += 1

    for path in sorted(root.rglob("__pycache__"), reverse=True):
        _remove_tree(path)
    for path in root.rglob("*.pyi"):
        path.unlink(missing_ok=True)

    print(
        f"已剥离 {removed} 个 .py；保留 migrations 与 store.tools.seed/gen_keys",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, nargs="?", default=Path("/app"))
    args = parser.parse_args()
    strip_tree(args.root)


if __name__ == "__main__":
    main()
    sys.exit(0)
