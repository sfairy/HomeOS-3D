"""Python 侧批量入口的公共调度器。

为什么需要它：`run_backend_checks.py` 与 `run_contract_checks.py` 的控制流完全一样
（解析 `--module` / 选模块 / 捕获输出跑 `main()` / 汇总退出码）。各写一份的后果不是
「重复 40 行」，而是**门禁代码自己成了重复检测的举报对象** —— 合并检查本来是为了减少
重复，入口再长出重复就自相矛盾。

与 `ops/lib/batch.mjs` 的分工：JS 侧跑的是子进程（`spawn`），Python 侧跑的是**同进程内的
模块函数**（这样才能共享 `ops.lib.ratchet` 的 AST 缓存）。因此不能复用 JS 的实现。
"""

from __future__ import annotations

import argparse
import importlib
import inspect
import io
import json
import sys
import time
import traceback
from collections.abc import Callable
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

#: 模块名 → 传给 `main()` 的参数。门禁语义永远是「检查」而不是「重写基线」。
ModuleSpec = tuple[str, tuple[str, ...]]

#: 每条模块跑完后调用的清理钩子（默认什么都不做）。
CleanupHook = Callable[[], None]

#: 门禁脚本所在的子目录（相对 `ops/checks`）。批量入口把它们加进 `sys.path`，
#: 这样模块名就是文件 stem（`check_parity` / `check_guards`），不必写包路径 ——
#: 包路径会随目录调整而逐处失效，而 stem 一直稳定。
CHECK_SUBDIRS = ("business", "python", "contract", "architecture", "security", "size", "studio")


def extend_check_path(checks_dir: Path) -> None:
    """把各检查子目录加入 `sys.path`（幂等）。"""
    for name in CHECK_SUBDIRS:
        entry = str(checks_dir / name)
        if entry not in sys.path:
            sys.path.append(entry)


def _noop() -> None:
    """默认清理：什么都不做。"""


def _wants_argv(main) -> bool:
    """`main(argv=None)` 形态返回 True；`main()` 形态返回 False。"""
    try:
        return len(inspect.signature(main).parameters) > 0
    except (TypeError, ValueError):  # fmt: skip
        return False


def _last_line(text: str, fallback: str) -> str:
    for line in reversed([item.strip() for item in text.splitlines()]):
        if line:
            return line
    return fallback


def run_one(name: str, argv: tuple[str, ...], cleanup: CleanupHook = _noop) -> tuple[bool, str, float, str]:
    """跑一个模块，返回 ``(是否通过, 摘要, 耗时秒, 完整输出)``。

    模块自己的 `print` 全被捕获：成功只取最后一行做摘要，失败原样展开 —— 与
    `run_selftests.py` 的输出口径一致，不在这里另造一套格式。
    """
    started = time.monotonic()
    buffer = io.StringIO()
    try:
        module = importlib.import_module(name)
        main = module.main
        with redirect_stdout(buffer), redirect_stderr(buffer):
            exit_code = main(list(argv)) if _wants_argv(main) else main()
        if exit_code not in (0, None):
            raise SystemExit(f"{name}.main() 返回 {exit_code}")
    except SystemExit as error:
        # `SystemExit(1)` 是模块自己的失败表达；字符串表示「无法运行」。
        elapsed = time.monotonic() - started
        detail = buffer.getvalue().strip()
        message = error.code if isinstance(error.code, str) else ""
        if detail and message:
            detail = f"{detail}\n{message}"
        elif message:
            detail = message
        return False, name, elapsed, detail or f"{name} 以 SystemExit({error.code}) 退出"
    except BaseException:  # 检查失败可能是断言 / 导入错误 / 解析异常
        elapsed = time.monotonic() - started
        return False, name, elapsed, f"{buffer.getvalue().strip()}\n{traceback.format_exc()}".strip()
    finally:
        cleanup()

    elapsed = time.monotonic() - started
    return True, _last_line(buffer.getvalue(), name), elapsed, buffer.getvalue()


def select(modules: tuple[ModuleSpec, ...], filters: list[str]) -> list[ModuleSpec]:
    """模块选择：**先精确、后子串**。

    纯子串匹配有个坑：`--module ts` 会同时命中 `selftests`（`selfle**ts**`），想单跑测试却把
    19 个自检一起拖上。因此某个过滤词只要与模块名完全相同，就按精确处理，其余才退化为子串。
    """
    if not filters:
        return list(modules)
    exact = {name for name, _ in modules if name in filters}

    def matched(name: str) -> bool:
        return any(name == needle if needle in exact else needle in name for needle in filters)

    return [(name, argv) for name, argv in modules if matched(name)]


#: 子检查：名字 + 无参执行器（返回 `(problems, summary)`）。
SubSpec = tuple[str, Callable[[], tuple[list[str], str]]]


def run_subchecks(
    *,
    modules: tuple[SubSpec, ...],
    title: str,
    description: str,
    argv: list[str] | None = None,
) -> int:
    """一个脚本内多个子检查的统一入口（`--module` / `--json` / 退出码）。

    为什么抽出来：`check_guards`（async DB / PEP 758 / 响应模型）与 `check_parity`
    （设备 kind 两表 / 域控制类型 / 迁移回归）的 `main()` 完全同构 —— 选子检查、逐条跑、
    汇总、按需输出 JSON。两处各写 35 行，只是 17 行同构克隆。

    与 `run_batch` 的区别：那个跑**独立模块文件**（各自有 `main(argv)`），这个跑**同一文件
    内的子检查**（无参调用，结果由调用方渲染）。
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--check", action="store_true", help="有违规时退出 1（默认即门禁语义，保留兼容）")
    parser.add_argument("--json", action="store_true", help="机器可读")
    parser.add_argument("--module", action="append", default=None, help="只跑指定子检查（精确名优先，其余按子串）")
    args, _ = parser.parse_known_args(argv)

    names = [name for name, _ in modules]
    selected = [
        (name, run)
        for name, run in modules
        if not args.module or any(name == needle if needle in names else needle in name for needle in args.module)
    ]
    if not selected:
        print(f"没有子检查匹配 {'、'.join(args.module or [])}（用 --module 指定，或省略跑全部）", file=sys.stderr)
        return 2

    report: dict[str, dict[str, object]] = {}
    failures = 0
    for name, run in selected:
        try:
            problems, summary = run()
        except Exception as error:  # 子检查「无法运行」也是失败，不该中断其余子检查
            problems, summary = [f"{type(error).__name__}: {error}"], "无法运行"
        report[name] = {"summary": summary, "violations": problems}
        if problems:
            failures += 1
            if not args.json:
                print(f"{name}: {summary}")
                for problem in problems:
                    print(f"  ✗ {problem}")
        elif not args.json:
            print(f"{name}: {summary} → 0 violation(s)")

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if failures else 0

    if failures:
        print(f"{title}：{failures} 个子检查有违规", file=sys.stderr)
        return 1
    return 0


def run_batch(
    *,
    modules: tuple[ModuleSpec, ...],
    label: str,
    description: str,
    argv: list[str] | None = None,
    cleanup: CleanupHook = _noop,
) -> int:
    """解析参数 → 选模块 → 逐条执行 → 汇总退出码。"""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--module", action="append", default=None, help="只跑指定模块（精确名优先，其余按子串；可重复）"
    )
    parser.add_argument("--list", action="store_true", help="只打印模块清单")
    parser.add_argument("--json", action="store_true", help="只输出机器可读汇总")
    args = parser.parse_args(argv)

    selected = select(modules, args.module or [])
    if not selected:
        print(f"没有模块匹配 {'、'.join(args.module or [])}（用 --list 查看可用名称）", file=sys.stderr)
        return 2

    if args.list:
        for name, _ in selected:
            print(name)
        return 0

    started = time.monotonic()
    failures: list[str] = []
    results: list[dict[str, object]] = []

    for name, module_argv in selected:
        passed, detail, elapsed, output = run_one(name, module_argv, cleanup)
        results.append({"module": name, "ok": passed, "seconds": round(elapsed, 2)})
        if passed:
            if not args.json:
                print(f"  PASS {detail}  {elapsed:.2f}s")
        else:
            failures.append(name)
            if not args.json:
                print(f"  FAIL {name}  {elapsed:.2f}s")
                for line in output.splitlines():
                    print(f"    {line}")

    total = time.monotonic() - started
    if args.json:
        print(json.dumps({"ok": not failures, "results": results, "failures": failures}, ensure_ascii=False, indent=2))
        return 1 if failures else 0

    print(f"\n{label}：{len(selected) - len(failures)}/{len(selected)} 通过（{total:.1f}s）")
    if failures:
        print(f"  失败：{'、'.join(failures)}", file=sys.stderr)
        return 1
    return 0
