#!/usr/bin/env python3
"""未受管后台任务的棘轮门禁（只读，纯标准库）。

为什么需要它
------------
``asyncio.create_task()`` 在本仓库有 50 处，全部缺少 done callback：

- 协程里漏出的异常只会在事件循环关闭时打一条 ``Task exception was never retrieved``，
  与「哪个组件、哪次操作」脱节，线上几乎无法定位；
- 事件循环只保留任务的**弱引用**，任务在 await 期间可能被 GC 回收；
- 进程停机时这些任务被直接掐断，收尾逻辑没有机会跑。

正确写法是 ``background_tasks.spawn(coro, label=...)``
（``platform/core/runtime/background_tasks.py``）：保留强引用、异常统一落日志、
停机统一取消并等待。

口径
----
统计 ``asyncio.create_task(...)``；调用出现在受管模块自己（``background_tasks.py``）
不计。按文件记账 + 总数兜底，只许下降。

注意：服务把任务存在实例属性上（``self._task = asyncio.create_task(...)``）并由自己的
``stop()`` 取消/等待的，属于**已受管**，不要为了过门禁改成全局登记簿 —— 那会把所有权
从服务挪走。存量逐条判断后再迁移，本门禁只负责不新增。

用法
----
    node ops/lib/py.mjs ops/checks/check_background_tasks.py            # 校验
    node ops/lib/py.mjs ops/checks/check_background_tasks.py --update   # 重写基线
    node ops/lib/py.mjs ops/checks/check_background_tasks.py --verbose
    node ops/lib/py.mjs ops/checks/check_background_tasks.py --json
"""

from __future__ import annotations

import ast
from pathlib import Path

from ops.checks._bootstrap import ROOT, parse_tree
from ops.lib.ratchet import iter_python_files, run_file_count_ratchet

BASELINE_PATH = ROOT / "ops/checks/baselines/backend/background-tasks-baseline.json"
SCAN_ROOTS = [
    ROOT / "homeos/backend/src",
    ROOT / "homeos-store/backend/src",
]
#: 受管实现自己要用 create_task —— 它是唯一合法出口。
EXEMPT_FILES = {
    "homeos/backend/src/platform/core/runtime/background_tasks.py",
}


def scan_file(path: Path) -> list[int]:
    try:
        tree = parse_tree(path)
    except (SyntaxError, UnicodeDecodeError):  # fmt: skip
        return []
    lines: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr == "create_task"
            and isinstance(func.value, ast.Name)
            and func.value.id == "asyncio"
        ):
            lines.append(node.lineno)
    return lines


def scan() -> tuple[dict[str, list[int]], int]:
    per_file: dict[str, list[int]] = {}
    for path in iter_python_files(SCAN_ROOTS):
        relative = path.relative_to(ROOT).as_posix()
        if relative in EXEMPT_FILES:
            continue
        lines = scan_file(path)
        if lines:
            per_file[relative] = lines
    return per_file, sum(len(lines) for lines in per_file.values())


def main(argv: list[str] | None = None) -> int:
    return run_file_count_ratchet(
        name="check_background_tasks",
        description=(
            "未受管后台任务棘轮：统计直接调用 asyncio.create_task 的位置。"
            "新代码必须走 background_tasks.spawn()（强引用 / 异常收集 / 停机等待）。"
        ),
        rules='asyncio.create_task(coro) → background_tasks.spawn(coro, label="...")',
        baseline_path=BASELINE_PATH,
        scan=scan,
        hint='新增了裸 asyncio.create_task。请改用 background_tasks.spawn(coro, label="组件.动作")。',
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
