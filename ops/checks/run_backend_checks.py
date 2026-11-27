#!/usr/bin/env python3
"""后端静态检查批量入口：一个解释器、一次 AST 解析。

## 为什么合并

这些后端检查此前是各自独立的步骤，每条都由 `ops/lib/py.mjs` 起一个新 Python 进程，
并且各自把同一批 `.py` 重新 `ast.parse` 一遍 —— 单条就要 1.3–3.9s，时间几乎全花在
重复解析上，而不是断言本身。

合并后：只起一个解释器，AST 走 `ops.lib.ratchet.parse_tree()` 的**进程级缓存**，
第二条检查起直接命中前一条解析好的树。

## 保留哪些（全是语义断言，不靠重录基线维持）

- `check_guards`：async 函数里同步调 DB（阻塞事件循环）、PEP 758 无括号多异常
  （Cython 会按 Python 2 解析，语义静默改变）、响应模型漏声明；
- `check_ws_auth`：每条 WS 路由都必须真的调用鉴权；
- `check_parity`：设备 kind / 域控制类型两张跨语言表两端一致 + 迁移回归。

已删除的是**计数型棘轮**（静默 except / 裸 create_task / 中文 HTTPException /
`os.getenv` 白名单 / 路由数量 / 接口覆盖率）：它们的判定是「比基线多一处就失败」，
而基线只能靠不断重录维持 —— 与已删除的行数、重复代码、`any` 计数同一类问题。
它们守的规范本身仍然有效，只是不再由「数字不许涨」来强制。

## 用法

```bash
bun run check:backend                    # 全部
bun run check:backend -- --module guards # 只跑名字匹配的模块（子串，可重复）
node ops/lib/py.mjs ops/checks/run_backend_checks.py --list
```

失败的模块完整输出与 traceback 原样打印；成功的只留最后一行结论。
"""

from __future__ import annotations

import _bootstrap

from ops.lib.batch import extend_check_path, run_batch

extend_check_path(_bootstrap.ROOT / "ops" / "checks")

#: 模块名 → 传给该模块 `main()` 的参数。需要区分模式的模块显式传 `--check`。
MODULES = (
    ("check_guards", ("--check",)),
    ("check_ws_auth", ("--check",)),
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
