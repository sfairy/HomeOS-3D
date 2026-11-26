#!/usr/bin/env python3
"""后端静态检查批量入口：一个解释器、一次 AST 解析。

## 为什么合并

此前这些后端检查是各自独立的步骤，每条都由 `ops/lib/py.mjs` 起一个新 Python 进程，
并且各自把同一批 `.py` 重新 `ast.parse` 一遍 —— 单条就要 1.3–3.9s，时间几乎全花在
重复解析上，而不是断言本身。

合并后：只起一个解释器，AST 走 `ops.lib.ratchet.parse_tree()` 的**进程级缓存**，
第二条检查起直接命中前一条解析好的树。

函数复杂度棘轮（`check_complexity`）已删除：阈值与基线都是拍的，实际效果只是让
「把函数搬到新文件」也要重录一次基线。

## 失败语义不变

- 任一模块失败 = 整体退出 1（门禁仍是「全绿或失败」，不给部分通过）；
- 单条失败不中断其余模块：跑完再看总账；
- 失败模块的完整输出与 traceback 原样打印；成功模块只留最后一行结论；
- 单项调试仍走原脚本（`bun run check:silent-except` 等）。

## 用法

```bash
bun run check:backend                      # 全部
bun run check:backend -- --module kinds    # 只跑名字匹配的模块（子串，可重复）
node ops/lib/py.mjs ops/checks/run_backend_checks.py --list
```
"""

from __future__ import annotations

import _bootstrap

from ops.lib.batch import extend_check_path, run_batch

extend_check_path(_bootstrap.ROOT / "ops" / "checks")

#: 模块名 → 传给该模块 `main()` 的参数。
#:
#: 门禁语义永远是「检查」而不是「重写基线」，所以需要区分模式的模块一律显式传 `--check`；
#: 棘轮模块默认就是检查模式，传空元组即可（`--update` 仍走各自的单项脚本）。
MODULES = (
    ("check_silent_except", ()),
    ("check_error_contract", ()),
    ("check_background_tasks", ()),
    ("check_env_access", ()),
    ("check_guards", ("--check",)),
    ("check_parity", ("--check",)),
)


def main(argv: list[str] | None = None) -> int:
    return run_batch(
        modules=MODULES,
        label="后端静态检查",
        description="批量执行后端静态检查",
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
