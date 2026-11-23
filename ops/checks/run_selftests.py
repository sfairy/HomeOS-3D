#!/usr/bin/env python3
"""业务规则自检的批量入口：一个解释器跑完 ``ops/checks/*_selftest.py``。

## 为什么合并

此前 19 条业务自检在门禁里是 19 个独立步骤，每条都走一次
``node ops/lib/py.mjs <script>`` —— 也就是重新启动一个 Python、重新导入一遍
``homeos.backend``。这些自检共用同一套 ``_selftest_support`` 骨架、彼此不依赖运行时
状态，为每条断言付一次解释器启动成本没有任何收益，只让门禁清单变长、日志变吵。

## 失败语义不变

- 任一模块抛错 = 整体退出 1（门禁仍是「全绿或失败」，不给部分通过）；
- 单条失败不会中断其余模块：跑完再看总账，避免「修好第一条才发现后面还有三条」；
- 失败模块的 stdout 与 traceback 原样打印，成功模块只留一行
  ``<自检名>：N 项``（名称取自各脚本自己的 ``report()``，不在这里另抄一份）。

单条调试仍走原脚本，例如 ``bun run check:circadian`` —— 本入口只是把它们串起来，
不取代单项脚本。

用法：
    node ops/lib/py.mjs ops/checks/run_selftests.py
    node ops/lib/py.mjs ops/checks/run_selftests.py --list
    node ops/lib/py.mjs ops/checks/run_selftests.py --module circadian_selftest
"""

from __future__ import annotations

import argparse
import importlib
import io
import logging
import sys
import time
import traceback
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKS_DIR = Path(__file__).resolve().parent
for entry in (str(CHECKS_DIR), str(ROOT)):
    if entry not in sys.path:
        sys.path.insert(0, entry)

from _selftest_support import CHECKS, ensure_repo_on_path

ensure_repo_on_path()

#: 顺序与原门禁清单一致（快而纯逻辑的在前），便于与历史日志对照。
MODULES: tuple[str, ...] = (
    "device_profile_selftest",
    "backup_selftest",
    "event_log_selftest",
    "water_monitor_selftest",
    "energy_guard_selftest",
    "iaq_monitor_selftest",
    "energy_cost_selftest",
    "energy_hourly_selftest",
    "circadian_selftest",
    "sun_trigger_selftest",
    "security_entry_delay_selftest",
    "device_timer_selftest",
    "notification_mute_selftest",
    "public_config_selftest",
    "store_links_selftest",
    "ui_assets_selftest",
    "timeline_selftest",
    "security_selftest",
    "command_proxy_selftest",
)


def summarise(output: str, module_name: str) -> str:
    """从模块输出里取 ``report()`` 写的那一行，取不到就退回模块名。"""
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    for line in reversed(lines):
        if "自检通过" in line:
            return line
    return module_name


def run_one(module_name: str) -> tuple[bool, str, float]:
    """跑一个自检模块，返回 ``(是否通过, 展示文案, 耗时秒)``。"""
    started = time.monotonic()
    # 共享骨架里的 CHECKS 是模块级列表：不在这里清空，后一个自检的 report()
    # 会把前面的项数累加进来（同一个进程跑 19 条时尤其明显）。
    CHECKS.clear()
    buffer = io.StringIO()
    try:
        module = importlib.import_module(module_name)
        with redirect_stdout(buffer):
            exit_code = module.main()
        if exit_code not in (0, None):
            raise SystemExit(f"{module_name}.main() 返回 {exit_code}")
    except BaseException:  # 自检失败可能是 SystemExit / 断言 / 导入错误
        elapsed = time.monotonic() - started
        captured = buffer.getvalue().strip()
        if captured:
            print(captured)
        traceback.print_exc()
        return False, module_name, elapsed
    elapsed = time.monotonic() - started
    # 名称与项数都取模块自己 ``report()`` 写的那一行：部分自检自带 CHECKS 列表，
    # 在这里再数一遍只会数出 0。
    return True, summarise(buffer.getvalue(), module_name), elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description="批量执行业务规则自检")
    parser.add_argument("--module", action="append", default=None, help="只跑指定模块（可重复）")
    parser.add_argument("--list", action="store_true", help="只打印模块清单")
    args = parser.parse_args()

    modules = tuple(args.module) if args.module else MODULES
    unknown = sorted(set(modules) - set(MODULES))
    if unknown:
        print(f"未知自检模块：{'、'.join(unknown)}", file=sys.stderr)
        return 2

    if args.list:
        for name in modules:
            print(name)
        return 0

    # 自检会刻意触发失败路径，业务日志（LOG / WARN）属于噪声：只保留异常回溯。
    logging.disable(logging.WARNING)
    started = time.monotonic()
    failures: list[str] = []
    for name in modules:
        passed, detail, elapsed = run_one(name)
        if passed:
            print(f"  PASS {detail}  {elapsed:.2f}s")
        else:
            failures.append(name)
            print(f"  FAIL {detail}  {elapsed:.2f}s")

    total = time.monotonic() - started
    print(f"\n业务规则自检：{len(modules) - len(failures)}/{len(modules)} 通过（{total:.1f}s）")
    if failures:
        print(f"  失败：{'、'.join(failures)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
