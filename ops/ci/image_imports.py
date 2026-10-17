#!/usr/bin/env python3
"""镜像包的导入门禁（push 阶段跑）：源码里的绝对 ``src.`` 导入在镜像里不存在。

为什么需要它
------------
Dockerfile 把两个后端分别 ``COPY <项目>/backend/src ./app`` —— **源码态包名是 ``src``，
镜像态是 ``app``**。于是 ``from src.core.console_log import …`` 这种绝对导入在镜像里
根本没有这个包：构建期由 ``ops/docker/compile_python.py`` 的 import 门禁拦下
（``镜像包禁止绝对 import src``），真漏过去的话运行期是 ``ModuleNotFoundError``。

为什么不能只靠构建期那道门禁
--------------------------
它只在 ``ops/build.py backend``（也就是 ``.github/workflows/docker.yml``，**手动
dispatch**的发版工作流）里跑。绝对导入写进去之后，push 阶段的检查可以全绿，要等下一次
有人手动发版才炸。2026-10-17 的商店镜像就是这么红的：``security/access_log.py`` 里那句
``from src.core.console_log import …`` 让 store 的 amd64 / arm64 双双失败，而当时
``ruff`` 是过的（ruff 看不见「运行时包名会被 COPY 改写」这一层）。

判定不在这里重写
----------------
直接调 ``ops.docker.compile_python.precheck_tree`` —— 与构建期同一个 ``_precheck``
（含语法解析与绝对 ``src.`` 两条），避免两份实现漂移。

扫描范围与 Dockerfile 的 COPY 一一对应
------------------------------------
    COPY ${PROJECT}/backend/src ./app          → ops/build.py 的 PROJECTS（项目名真源）
    COPY ops/container_entrypoint.py ./ops/
    COPY ops/license_keys.py ./ops/
    COPY ops/docker ./ops/docker
    COPY packages/shared-py/homeos_shared ./homeos_shared

**改 Dockerfile 的 COPY 就要同步改下面的清单**（多一条少一条都会让门禁与构建错位）。

用法：
    python3 ops/ci/image_imports.py     # CI 与本地都能跑，不联网、不编译
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# `python3 ops/ci/image_imports.py` 时 sys.path[0] 是 ops/ci，下面按仓库根导入 ops.*
# （不是延迟导入：纯粹要等上一行把仓库根挂进 sys.path；E402 在本仓 ruff 里本就关着）。
sys.path.insert(0, str(REPO_ROOT))

from ops.build import PROJECTS
from ops.docker.compile_python import precheck_tree

#: 镜像源路径（仓库根相对）：逐条对应上面 Dockerfile 的 ``COPY``。
IMAGE_SOURCE_ROOTS = (
    # 项目名与源码目录名同值，真源是 ops/build.py 的 PROJECTS（新增项目不会漏到这里）。
    *(f'{project.source}/backend/src' for project in PROJECTS.values()),
    'ops/container_entrypoint.py',
    'ops/license_keys.py',
    'ops/docker',
    'packages/shared-py/homeos_shared',
)


def main() -> None:
    checked = 0
    failures: list[str] = []
    for relative in IMAGE_SOURCE_ROOTS:
        root = REPO_ROOT / relative
        if not root.exists():
            failures.append(f'{relative}：路径不存在（Dockerfile 的 COPY 也会失败，或本清单已过期）')
            continue
        try:
            checked += precheck_tree(root)
        except SystemExit as error:
            # precheck_tree 把「哪个文件第几行、导入了什么」都写在消息里，原样带出来。
            failures.append(f'{relative}：\n{error}')
    if failures:
        raise SystemExit('镜像导入门禁未通过：\n' + '\n'.join(failures))
    print(f'镜像导入门禁通过：{len(IMAGE_SOURCE_ROOTS)} 个镜像源路径共 {checked} 个文件')


if __name__ == '__main__':
    main()
