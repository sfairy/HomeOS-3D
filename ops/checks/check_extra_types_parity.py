#!/usr/bin/env python3
"""「域 → 控制类型」契约表的两端一致性门禁（只读，纯标准库）。

为什么需要它
------------
同一张表在仓库里存在两份，且**必须**同时存在：

- ``homeos/backend/src/modules/interaction3d/extra_types.py`` —— 后端校验命令时用；
- ``homeos/frontend/src/studio/runtime/climate/purifier-extras.ts`` 的 ``extraTypes()``
  —— 播放器渲染附加实体面板时用。

它们不可能合并成一个文件（一个跑在 Python，一个跑在浏览器），但语义必须是同一张表：
后端认为 ``climate`` 是 ``panel``、前端却当成 ``state``，结果就是「面板能显示但一个命令都
发不出去」，而这种错在两端各自的单测里都看不出来。

因此这里不做代码生成（跨语言生成器本身会成为第三处真相），只做**断言**：任何一侧改动
却没同步另一侧，CI 立刻红灯。``extra_types.py`` 的模块注释已经写明「改这里等于改配置契约，
谨慎」——这条门禁把「谨慎」变成可执行的检查。

口径（两端等价，不是逐字相同）
------------------------------
Python 侧把 ``sensor`` / ``binary_sensor`` 显式登记为 ``state``；
TS 侧没有登记它们，而是靠 ``return ['state']`` 兜底 —— **语义相同**。
所以断言写成：

1. 两端的「非 state」映射必须逐条相等（``domain -> type``）；
2. Python 里登记为 ``state`` 的域，在 TS 侧不得映射成别的类型。

另外守一条结构不变量：``extra_types.py`` 必须保持**无 import 的纯数据叶子模块**
（模块注释里写明这是为了断掉 ``config_ctx → purifier → lock → config_ctx`` 的环）。
顺手加一条：``__future__`` 之外的任何 import 都算违规。

用法：
    node ops/lib/py.mjs ops/checks/check_extra_types_parity.py           # 只报告
    node ops/lib/py.mjs ops/checks/check_extra_types_parity.py --check   # 门禁（违规退出 1）
    node ops/lib/py.mjs ops/checks/check_extra_types_parity.py --json
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PY_TABLE = REPO_ROOT / "homeos/backend/src/modules/interaction3d/extra_types.py"
TS_TABLE = REPO_ROOT / "homeos/frontend/src/studio/runtime/climate/purifier-extras.ts"

#: 兜底类型：两端都用它表示「表外的域只能只读展示」。
FALLBACK_TYPE = "state"


def load_python_table() -> tuple[dict[str, str], list[str]]:
    """导入叶子模块拿表；顺带校验它确实没有 import（结构不变量）。"""
    problems: list[str] = []
    source = PY_TABLE.read_text(encoding="utf-8")
    for node in ast.parse(source).body:
        if isinstance(node, ast.Import):
            problems.append(f"{PY_TABLE.name} 不应 import 任何模块（现引入 {ast.unparse(node)}）")
        elif isinstance(node, ast.ImportFrom):
            is_future = node.module == "__future__"
            if not is_future:
                problems.append(f"{PY_TABLE.name} 不应 import 任何模块（现引入 {ast.unparse(node)}）")

    spec = importlib.util.spec_from_file_location("_homeos_extra_types_parity", PY_TABLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {PY_TABLE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return dict(module.EXTRA_TYPES), problems


def load_typescript_table() -> dict[str, str]:
    """从 ``extraTypes()`` 里抠出「域 → 类型」。

    这里解析的是**当前实现形状**：一个 ``[...].includes(domain)`` 的 panel 名单 +
    一个 ``const mapped = {...}`` 字面量 + ``return ['state']`` 兜底。形状一旦变化，
    本函数会抛错而不是静默返回空表 —— 静默会给出一条永远绿的假门禁。
    """
    source = TS_TABLE.read_text(encoding="utf-8")
    start = source.index("export function extraTypes(")
    end = source.index("\n}", start)
    body = source[start:end]

    table: dict[str, str] = {}

    # 1) 「整块面板」名单：`[ 'a', 'b', ... ].includes(domain)` 紧跟 `return ['panel', 'state']`
    list_match = re.search(
        r"\[([^\[\]]*?)\]\.includes\(\s*domain\s*\)\s*\)\s*return\s*\[\s*'(\w+)'\s*,\s*'state'\s*\]", body, re.DOTALL
    )
    if list_match is None:
        raise RuntimeError("无法从 extraTypes() 解析出 includes 分支的 panel 名单，实现形状可能已变，请更新本脚本")
    listed = re.findall(r"'([\w]+)'", list_match.group(1))
    listed_type = list_match.group(2)
    for domain in listed:
        table[domain] = listed_type

    # 2) `const mapped = { a: 'x', b: 'y' }`
    mapped_match = re.search(r"const\s+mapped\s*=\s*\{(.*?)\}\s*\[\s*domain\s*\]", body, re.DOTALL)
    if mapped_match is None:
        raise RuntimeError("无法从 extraTypes() 解析出 mapped 字面量，实现形状可能已变，请更新本脚本")
    for domain, mapped_type in re.findall(r"(\w+)\s*:\s*'(\w+)'", mapped_match.group(1)):
        if domain in table and table[domain] != mapped_type:
            raise RuntimeError(f"TS 侧 {domain} 同时出现在 includes 名单与 mapped 字面量里且类型不同")
        table[domain] = mapped_type

    # 3) 兜底必须是 state（否则第 1 条的等价性不成立）
    if not re.search(r":\s*\[\s*'state'\s*\]", body):
        raise RuntimeError("extraTypes() 的兜底分支不再是 ['state']，请更新本脚本的等价性口径")

    return table


def compare(py_table: dict[str, str], ts_table: dict[str, str]) -> list[str]:
    problems: list[str] = []
    py_typed = {k: v for k, v in py_table.items() if v != FALLBACK_TYPE}
    ts_typed = {k: v for k, v in ts_table.items() if v != FALLBACK_TYPE}

    for domain in sorted(set(py_typed) | set(ts_typed)):
        left = py_typed.get(domain)
        right = ts_typed.get(domain)
        if left == right:
            continue
        if left is None:
            problems.append(f"{domain}: 仅 TS 侧映射为 {right!r}（Python 缺失）")
        elif right is None:
            problems.append(f"{domain}: 仅 Python 侧映射为 {left!r}（TS 缺失）")
        else:
            problems.append(f"{domain}: Python={left!r} 但 TS={right!r}")

    # Python 显式登记为 state 的域，TS 不得映射成可写类型
    for domain, py_type in py_table.items():
        if py_type != FALLBACK_TYPE:
            continue
        ts_type = ts_table.get(domain, FALLBACK_TYPE)
        if ts_type != FALLBACK_TYPE:
            problems.append(f"{domain}: Python 为只读 state，但 TS 映射为 {ts_type!r}")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="校验「域 → 控制类型」契约表两端一致")
    parser.add_argument("--check", action="store_true", help="有违规时退出 1")
    parser.add_argument("--json", action="store_true", help="机器可读")
    args = parser.parse_args()

    if not PY_TABLE.is_file() or not TS_TABLE.is_file():
        print("check_extra_types_parity: 找不到契约表文件，跳过", file=sys.stderr)
        return 0

    try:
        py_table, structure_problems = load_python_table()
        ts_table = load_typescript_table()
    except (RuntimeError, OSError, ValueError) as error:
        print(f"check_extra_types_parity: {error}", file=sys.stderr)
        return 1

    problems = structure_problems + compare(py_table, ts_table)

    if args.json:
        print(
            json.dumps(
                {
                    "pythonEntries": len(py_table),
                    "typescriptEntries": len(ts_table),
                    "violations": problems,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"check_extra_types_parity: python={len(py_table)} 条，typescript={len(ts_table)} 条")
        for problem in problems:
            print(f"  ✗ {problem}")

    if problems and args.check:
        print(f"check_extra_types_parity: {len(problems)} violation(s)", file=sys.stderr)
        return 1
    if not problems:
        print("check_extra_types_parity: 0 violation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
