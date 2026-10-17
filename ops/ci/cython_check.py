#!/usr/bin/env python3
"""镜像编译的 Cython 兼容性门禁（push 阶段跑）：只做「能不能 cythonize」，不编译 C。

为什么需要它
------------
``ops/docker/compile_python.py`` 把后端**全部源码**交给 Cython 编译成 ``.so``。Cython
自己也会崩：3.3.0 在 ``AnalyseExpressionsTransform`` 里对「带 ``dict[...] | None`` 注解的
参数 + ``or {}`` 兜底 + 直接 ``.items()``」这种组合会抛
``TypeError: 'NoneType' object is not iterable``（``SimpleCallNode.args`` 为 None），构建
直接失败。源码本身完全合法，``ruff`` / ``pyright`` / 本地 ``bun run dev`` 都不会有问题 ——
只有真的交给 Cython 才炸。

为什么不能只靠构建期
------------------
与 ``image_imports.py`` 同一条理由：``ops/build.py backend`` 只在 ``.github/workflows/
docker.yml``（**手动 dispatch** 的发版工作流）里跑。2026-10-17 的失败正是这样：push 阶段
全绿，手动发版时 app 的 amd64 / arm64 双双红在编译阶段。

判定不在这里重写
----------------
- 编译指令直接取 ``ops.docker.compile_python.COMPILER_DIRECTIVES``（构建期同一份）；
- 扫描范围直接取 ``ops.ci.image_imports.IMAGE_SOURCE_ROOTS``（与 Dockerfile 的 COPY 对齐）；
- Cython 版本直接取 Dockerfile 的 ``ARG CYTHON_VERSION``（构建期同一份）。

用法：
    pip install "cython==<Dockerfile 里的 CYTHON_VERSION>"
    python3 ops/ci/cython_check.py
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# `python3 ops/ci/cython_check.py` 时 sys.path[0] 是 ops/ci，下面按仓库根导入 ops.*
# （与 image_imports.py 一致；不是延迟导入，只是要等上一行把仓库根挂进 sys.path）。
sys.path.insert(0, str(REPO_ROOT))

from ops.ci.image_imports import IMAGE_SOURCE_ROOTS
from ops.docker.compile_python import COMPILER_DIRECTIVES


def pinned_cython_version() -> str:
    """Dockerfile 的 ARG CYTHON_VERSION —— 与镜像里装的必须是同一个版本。"""
    text = (REPO_ROOT / 'Dockerfile').read_text(encoding='utf-8')
    match = re.search(r'^ARG CYTHON_VERSION=(\S+)$', text, re.MULTILINE)
    if match is None:
        raise SystemExit('Dockerfile 里读不到 ARG CYTHON_VERSION —— 版本单一来源断了')
    return match.group(1)


def _sources() -> list[Path]:
    found: list[Path] = []
    for relative in IMAGE_SOURCE_ROOTS:
        root = REPO_ROOT / relative
        if root.is_file():
            found.append(root)
        elif root.is_dir():
            found.extend(sorted(root.rglob('*.py')))
    # __pycache__ 里的东西不参与编译（compile_python 也会先清掉）。
    return [path for path in found if '__pycache__' not in path.parts]


def _cythonize_one(path: str) -> str | None:
    """在工作进程里 cythonize 单个文件；失败返回错误描述，成功返回 None。

    一个文件一个任务（而不是把整棵树丢进一次 cythonize）：Cython 遇到崩溃是**抛出**
    而不是记一条诊断，整批调用只会在第一个失败处中断，后面的问题被掩盖。
    生成的 .c 落到临时目录，不污染工作树。
    """
    # 构建期依赖：只在「装了 Dockerfile 里钉的那两个版本」的环境里可导入（CI 的 ruff job
    # 与镜像构建阶段），本地 .venv-store 刻意不带它们 —— 这是本文件存在的意义，不是缺失。
    # 与 ops/docker/compile_python.py 的开头两行同一处理方式。
    from Cython.Build import cythonize  # type: ignore[import-not-found]
    from setuptools import Extension  # type: ignore[import-not-found]

    target = Path(path)
    module = f'_cython_check_{abs(hash(path))}'
    try:
        with tempfile.TemporaryDirectory(prefix='cython-check-') as build_dir:
            cythonize(
                [Extension(module, [str(target)])],
                nthreads=1,
                quiet=True,
                build_dir=build_dir,
                compiler_directives=COMPILER_DIRECTIVES,
            )
    except Exception as error:  # 崩溃类型不可枚举，一律记为该文件失败
        first_line = str(error).strip().splitlines()[0] if str(error).strip() else type(error).__name__
        return f'{target.relative_to(REPO_ROOT)}：{type(error).__name__}: {first_line}'
    return None


def main() -> None:
    pinned = pinned_cython_version()
    try:
        # 同上：构建期依赖，本地 venv 里没有是常态 —— daemon 里的版本检查就是给这种
        # 「忘了装 / 装错版本」用的，不能让静态分析先报一条噪音把真正的提示淹掉。
        import Cython  # type: ignore[import-not-found]
    except ModuleNotFoundError:
        raise SystemExit(f'未安装 Cython；先执行 pip install "cython=={pinned}"') from None
    if Cython.__version__ != pinned:
        raise SystemExit(
            f'Cython 版本不一致：当前 {Cython.__version__}，Dockerfile 钉的是 {pinned}。'
            f'先执行 pip install "cython=={pinned}"'
        )

    sources = _sources()
    if not sources:
        raise SystemExit('没有扫到任何源码 —— IMAGE_SOURCE_ROOTS 与 Dockerfile 的 COPY 已经错位')

    jobs = max(1, min(len(sources), os.cpu_count() or 1))
    with ProcessPoolExecutor(max_workers=jobs) as pool:
        failures = [message for message in pool.map(_cythonize_one, map(str, sources), chunksize=1) if message]

    if failures:
        raise SystemExit(
            f'Cython {pinned} 无法编译以下模块（构建镜像时会在 compile_python.py 处失败）：\n'
            + '\n'.join(failures)
        )
    print(f'Cython {pinned} 兼容性检查通过：{len(sources)} 个模块（未编译 C，仅 cythonize）')


if __name__ == '__main__':
    main()
