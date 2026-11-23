#!/usr/bin/env python3
"""路由 / 契约检查批量入口：一次后端导入，一次 AST 解析。

## 为什么合并

此前 `gate:static` 里这五条是五个独立步骤，每条各起一个 Python 进程：

- `check:routes` / `check:store-routes`：导入真实路由表 / 静态扫描商店路由；
- `check:api-contract`：再 `ast.parse` 一遍两个后端；
- `check:frontend-coverage`：**又**导入一次后端路由表（`frontend_route_coverage`
  内部调用 `route_inventory.collect_operations()`）；
- `check:ws-auth`：再扫一遍 WS 路由。

合并后：路由表有进程内缓存（`route_inventory._OPERATIONS_CACHE` /
`store_route_inventory._ROUTES_CACHE`），后端应用只导入一次；文件 AST 走
`ops.lib.ratchet.parse_tree()` 的进程级缓存。实测 4.5s（此前约 9.7s）。

## `probe_src` 的清理

`collect_operations()` 用临时 symlink 把后端暴露成 `probe_src` 包，并在自己的 `finally`
里清 `sys.modules`。批量入口在每条模块跑完后再清一次：即使将来有人挪走那个 `finally`，
同进程的第二次导入也不会拿到旧路由表（换来的只是更早暴露问题，而不是静默用旧数据）。

## 失败语义不变

- 任一模块失败 = 整体退出 1；单条失败不中断其余模块；
- 失败模块完整输出原样打印，成功模块只留最后一行结论；
- 单项调试仍走原脚本（`bun run check:routes` 等）。

## 用法

```bash
bun run check:contracts                      # 全部
bun run check:contracts -- --module coverage # 只跑名字匹配的模块（子串，可重复）
node ops/lib/py.mjs ops/checks/run_contract_checks.py --list
```
"""

from __future__ import annotations

import sys

import _bootstrap

from ops.lib.batch import extend_check_path, run_batch

#: 模块名 → `main()` 参数。顺序固定为「先路由表，后覆盖率」：后者复用前两条算出的缓存。
#: `check_parity` 收在末尾：它读的是两张跨语言表，与路由无关，失败时一眼能分出是哪一类。
MODULES = (
    ("route_inventory", ("--check",)),
    ("store_route_inventory", ("--check",)),
    ("check_ws_auth", ("--check",)),
    ("api_contract_coverage", ()),
    ("frontend_route_coverage", ("--check",)),
    ("check_parity", ("--check",)),
)


def clear_probe_modules() -> None:
    """清掉 `route_inventory` 为导入后端而注册的临时包，避免同进程二次导入串味。"""
    for name in [key for key in sys.modules if key == "probe_src" or key.startswith("probe_src.")]:
        del sys.modules[name]


extend_check_path(_bootstrap.ROOT / "ops" / "checks")


def main(argv: list[str] | None = None) -> int:
    return run_batch(
        modules=MODULES,
        label="路由 / 契约检查",
        description="批量执行路由 / 契约检查",
        argv=argv,
        cleanup=clear_probe_modules,
    )


if __name__ == "__main__":
    raise SystemExit(main())
