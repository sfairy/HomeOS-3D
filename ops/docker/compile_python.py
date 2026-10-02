#!/usr/bin/env python3
"""构建期把 Python 源码编译成原生扩展（``.so``）后删除 ``.py``。
"""
from __future__ import annotations

import argparse
import ast
import os
import shutil
import sys
import sysconfig
import tempfile
from pathlib import Path

EXT_SUFFIX = sysconfig.get_config_var("EXT_SUFFIX") or ".so"
#: 迁移脚本目录按源码保留，不编译：alembic 是**读源码文件**来执行的，编译成 .so 之后它
#: 反而找不到脚本。两个应用的目录名不同 —— 主应用是项目根 ``migrations/``，商店是 ``db/``。
KEEP_SOURCE_PREFIXES = ("db/", "migrations/")
COMPILER_DIRECTIVES = {
    "language_level": "3",
    # 关掉「用注解当类型」：本项目的注解是 PEP 563 之后的普通标注，交给 Cython 解析
    "annotation_typing": False,
    # 保留函数签名与自省信息，FastAPI 依赖 inspect.signature 解析路由参数。
    "binding": True,
    "embedsignature": True,
}


def _is_kept_source(path: Path, root: Path) -> bool:
    relative = path.relative_to(root).as_posix()
    return any(relative == prefix.rstrip("/") or relative.startswith(prefix) for prefix in KEEP_SOURCE_PREFIXES)


def _iter_sources(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*.py") if "__pycache__" not in path.parts and not _is_kept_source(path, root)
    )


def _module_name(path: Path, root: Path) -> str:
    relative = path.relative_to(root)
    if path.name == "__init__.py":
        # 包初始化模块对外就是包本身，扩展名必须叫 <pkg>（导出 PyInit_<pkg>）。
        return ".".join(relative.parent.parts)
    return ".".join(relative.with_suffix("").parts)


def _expected_so(path: Path) -> Path:
    if path.name == "__init__.py":
        return path.parent / f"__init__{EXT_SUFFIX}"
    return path.parent / f"{path.stem}{EXT_SUFFIX}"


def _precheck(sources: list[Path]) -> None:
    """先用 Python 自己的解析器过一遍，源码有问题时给出清晰报错。
    """
    broken: list[str] = []
    for path in sources:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeDecodeError) as error:
            broken.append(f"{path}: {error}")
    if broken:
        raise SystemExit("以下源码无法解析，请先修复再构建：\n" + "\n".join(broken))


def _clean_caches(root: Path) -> None:
    for cache in sorted(root.rglob("__pycache__"), reverse=True):
        shutil.rmtree(cache, ignore_errors=True)
    for pattern in ("*.pyc", "*.pyo"):
        for path in root.rglob(pattern):
            path.unlink(missing_ok=True)


def _compile(root: Path, sources: list[Path], jobs: int) -> None:
    from Cython.Build import cythonize  # type: ignore[import-not-found]  # 构建期依赖，仅在 Docker 编译容器内可用
    from setuptools import (  # type: ignore[import-untyped]  # 构建期依赖，仅在 Docker 编译容器内可用
        Distribution,
        Extension,
    )
    from setuptools.command.build_ext import (
        build_ext,  # type: ignore[import-untyped]  # 构建期依赖，仅在 Docker 编译容器内可用
    )

    extensions = [Extension(_module_name(path, root), [str(path)]) for path in sources]
    print(f"Cython 编译 {len(sources)} 个模块（-j{jobs}）…", flush=True)
    ext_modules = cythonize(
        extensions,
        nthreads=jobs,
        quiet=True,
        compiler_directives=COMPILER_DIRECTIVES,
    )

    distribution = Distribution({"name": "homeos-protected", "ext_modules": ext_modules})
    command = build_ext(distribution)
    command.inplace = True
    command.parallel = jobs
    command.build_temp = tempfile.mkdtemp(prefix="cython-build-")
    command.ensure_finalized()
    previous = Path.cwd()
    try:
        os.chdir(root)
        command.run()
    finally:
        os.chdir(previous)
        shutil.rmtree(command.build_temp, ignore_errors=True)

    _relocate_package_inits(root, sources)


def _relocate_package_inits(root: Path, sources: list[Path]) -> None:
    for path in sources:
        if path.name != "__init__.py" or len(path.relative_to(root).parts) < 2:
            continue
        package = path.parent.relative_to(root)
        produced = root / f"{package.as_posix()}{EXT_SUFFIX}"
        if produced.is_file():
            produced.replace(root / package / f"__init__{EXT_SUFFIX}")


def _discard_artifacts(root: Path, sources: list[Path]) -> None:
    for path in sources:
        _expected_so(path).unlink(missing_ok=True)
        (root / f"{_module_name(path, root)}{EXT_SUFFIX}").unlink(missing_ok=True)
    for generated in root.rglob("*.c"):
        generated.unlink(missing_ok=True)
    shutil.rmtree(root / "build", ignore_errors=True)


def _remove_sources(sources: list[Path]) -> int:
    for path in sources:
        path.unlink(missing_ok=True)
    return len(sources)


def _verify(root: Path, sources: list[Path]) -> int:
    missing = [path for path in sources if not _expected_so(path).is_file()]
    if missing:
        raise SystemExit("以下模块没有产出原生扩展：\n" + "\n".join(str(p) for p in missing))

    leaked = [
        path for path in root.rglob("*.py") if "__pycache__" not in path.parts and not _is_kept_source(path, root)
    ]
    if leaked:
        raise SystemExit("以下源码未清理：\n" + "\n".join(str(p) for p in leaked))
    return len(sources)


def compile_tree(root: Path, jobs: int | None = None) -> None:
    root = root.resolve()
    if not root.is_dir():
        raise SystemExit(f"不是目录：{root}")

    jobs = max(1, jobs or min(4, os.cpu_count() or 1))
    _clean_caches(root)
    sources = _iter_sources(root)
    if not sources:
        raise SystemExit(f"未找到任何可编译的 Python 源码：{root}")
    _precheck(sources)

    if jobs > 1:
        try:
            _compile(root, sources, jobs)
        except Exception as error:  # Cython 并行模式在本项目上偶尔崩溃
            print(f"并行编译失败（{type(error).__name__}: {error}），改用单进程重试…", flush=True)
            _discard_artifacts(root, sources)
            _compile(root, sources, 1)
    else:
        _compile(root, sources, 1)

    _remove_sources(sources)
    _clean_caches(root)
    shutil.rmtree(root / "build", ignore_errors=True)
    for generated in root.rglob("*.c"):
        generated.unlink(missing_ok=True)

    count = _verify(root, sources)
    print(f"完成：编译 {count} 个模块为原生扩展（{EXT_SUFFIX}），迁移脚本目录保留源码", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, nargs="?", default=Path("/app"))
    parser.add_argument("--jobs", type=int, default=None, help="并行编译进程数，默认最多 4（失败自动回退单进程）")
    args = parser.parse_args()
    compile_tree(args.root, args.jobs)
    sys.exit(0)


if __name__ == "__main__":
    main()
