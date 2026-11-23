#!/usr/bin/env python3
"""错误契约棘轮：熔断「新写的中文文案 HTTPException」（只读，纯标准库）。

为什么需要它
------------
后端有两种抛错方式，前端看到的东西完全不同：

- ``BusinessException(ErrorCode.X, api_error("KEY"))`` —— 响应里有稳定的
  ``apiErrorCode``（前端按码判定、日志按码聚合、文案可以改）；
- ``HTTPException(status_code=..., detail="中文文案")`` —— ``apiErrorCode`` 恒为
  ``UNKNOWN``，前端只能**拿文案当契约**判断（``message.includes('登录已过期')``）。

于是改一句文案就等于改一次接口语义。仓库现状是 315 处 ``HTTPException`` vs 100 处
``BusinessException``，一次清完不现实；但「不再新增」可以从今天开始守。

此外 ``platform/core/http/errors.py`` 的 ``resolve_api_error_code()`` 靠**中文文案反查**
错误码（``_STATIC_CODE_BY_MESSAGE``）：文案一改，稳定码就丢。等存量降到阈值后，
这条反查应当整体删除 —— 本门禁只负责把新增量按住，不让它继续长。

口径
----
只统计 **detail 是字符串字面量且含中文** 的 ``HTTPException``：

- 动态 detail（``str(error)`` / ``failed_endpoint_summary(results)``）不计入 —— 它们
  本来就无法登记成 ``API_ERROR`` 键，单独治理；
- 结构化 detail（``{"code": ..., "message": ...}``）不计入 —— 它已经有稳定码，
  属于 ``HTTPException`` 的合法用法；
- ``homeos-store`` 与 ``homeos`` 都扫（两个后端的错误契约要求一致）。

用法
----
    node ops/lib/py.mjs ops/checks/check_error_contract.py            # 校验
    node ops/lib/py.mjs ops/checks/check_error_contract.py --update   # 重写基线
    node ops/lib/py.mjs ops/checks/check_error_contract.py --verbose
    node ops/lib/py.mjs ops/checks/check_error_contract.py --json
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

from ops.checks._bootstrap import ROOT, parse_tree
from ops.lib.ratchet import iter_python_files, run_file_count_ratchet

BASELINE_PATH = ROOT / "ops/checks/baselines/backend/error-contract-baseline.json"
SCAN_ROOTS = [
    ROOT / "homeos/backend/src",
    ROOT / "homeos-store/backend/src",
]
CJK = re.compile(r"[\u4e00-\u9fff]")


def _literal_cjk_detail(call: ast.Call) -> bool:
    """``detail`` 是否为「含中文的字符串字面量」。"""
    candidates: list[ast.expr] = []
    for keyword in call.keywords:
        if keyword.arg == "detail":
            candidates.append(keyword.value)
    if not call.keywords and call.args:
        # 位置参数形态：``HTTPException(400, "中文")`` 的第二个参数是 detail。
        if len(call.args) >= 2:
            candidates.append(call.args[1])
        elif len(call.args) == 1:
            candidates.append(call.args[0])
    for value in candidates:
        if isinstance(value, ast.Constant) and isinstance(value.value, str) and CJK.search(value.value):
            return True
    return False


def scan_file(path: Path) -> list[int]:
    try:
        tree = parse_tree(path)
    except (SyntaxError, UnicodeDecodeError):  # fmt: skip
        return []
    return [
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "HTTPException"
        and _literal_cjk_detail(node)
    ]


def scan() -> tuple[dict[str, list[int]], int]:
    per_file: dict[str, list[int]] = {}
    for path in iter_python_files(SCAN_ROOTS):
        lines = scan_file(path)
        if lines:
            per_file[path.relative_to(ROOT).as_posix()] = lines
    return per_file, sum(len(lines) for lines in per_file.values())


def main(argv: list[str] | None = None) -> int:
    return run_file_count_ratchet(
        name="check_error_contract",
        description=(
            "错误契约棘轮基线：只统计 detail 为「含中文的字符串字面量」的 HTTPException。"
            "这类写法没有稳定 apiErrorCode，前端只能拿文案当契约；基线只许下降。"
        ),
        rules='raise HTTPException(status, detail="中文") → 改用 BusinessException(ErrorCode.X, api_error("KEY"))',
        baseline_path=BASELINE_PATH,
        scan=scan,
        hint=(
            "新增了「中文文案 HTTPException」。请改用 "
            'BusinessException(ErrorCode.X, api_error("KEY"))，并在 API_ERROR 里登记文案。'
        ),
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
