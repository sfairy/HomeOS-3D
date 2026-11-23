#!/usr/bin/env python3
"""响应模型基类守卫：``response_model=`` 引用的类不得继承 ``StrictModel``（只读，AST）。

为什么需要它
------------
``api/schemas/base.py`` 有两个基类，语义**相反**：

- ``StrictModel``（``extra="forbid"``）—— 给**请求体**用：客户端多发字段应当 422；
- ``ResponseModel``（``extra="ignore"``）—— 给**响应**用：服务端多返回字段应当被忽略。

把 ``StrictModel`` 误用到 ``response_model=`` 上时，服务层只要多返回一个键（例如新加一个
指标），FastAPI 在序列化阶段就会抛 ``ValidationError``，把一次正常请求升级成 500。这个
错误在类型检查、路由基线里都看不见，只有真的请求到那个接口才暴露。

口径
----
纯 AST，不导入任何业务代码：

1. 收集所有 ``class X(StrictModel)`` / ``class X(A, StrictModel)`` 的类名（按模块限定）；
2. 收集所有装饰器或 ``add_api_route`` 里的 ``response_model=Name``；
3. 交集即违规。跨模块引用（``response_model=other.Model``）按末段名比对，误报宁可多不可少。

用法
----
    node ops/lib/py.mjs ops/checks/check_response_models.py           # 只报告
    node ops/lib/py.mjs ops/checks/check_response_models.py --check   # 有违规退出 1
    node ops/lib/py.mjs ops/checks/check_response_models.py --json
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = [
    ROOT / "homeos/backend/src",
    ROOT / "homeos-store/backend/src",
]
SKIP_DIRS = frozenset({"__pycache__", "node_modules", ".venv-store", "dist", "backups"})
#: 响应模型禁止继承的基类（按末段名比对，兼容 `from ...base import StrictModel as X`）。
FORBIDDEN_BASES = frozenset({"StrictModel"})


def _base_names(node: ast.ClassDef) -> set[str]:
    names: set[str] = set()
    for base in node.bases:
        if isinstance(base, ast.Name):
            names.add(base.id)
        elif isinstance(base, ast.Attribute):
            names.add(base.attr)
    return names


def _response_model_names(tree: ast.AST) -> list[tuple[int, str]]:
    """收集 ``response_model=X`` 的出现位置与末段名。"""
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        for keyword in node.keywords:
            if keyword.arg != "response_model":
                continue
            value = keyword.value
            if isinstance(value, ast.Name):
                found.append((node.lineno, value.id))
            elif isinstance(value, ast.Attribute):
                found.append((node.lineno, value.attr))
    return found


def scan(roots: list[Path] | None = None) -> tuple[list[str], int]:
    """扫描并返回 (违规描述, 扫描模块数)。

    ``roots`` 可覆盖（供单元测试传临时目录）—— 否则这条门禁本身无法被验证，
    而「永远绿的假门禁」比没有门禁更糟。
    """
    strict_classes: dict[str, str] = {}
    response_usages: list[tuple[str, int, str]] = []
    files = 0

    for root in roots if roots is not None else SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.py")):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):  # fmt: skip
                continue
            files += 1
            try:
                relative = path.relative_to(ROOT).as_posix()
            except ValueError:
                # 临时目录（单测）不在仓库内：用绝对路径，避免被误当成相对路径。
                relative = path.as_posix()
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and _base_names(node) & FORBIDDEN_BASES:
                    strict_classes[node.name] = relative
            for line, name in _response_model_names(tree):
                response_usages.append((relative, line, name))

    problems: list[str] = []
    for relative, line, name in response_usages:
        owner = strict_classes.get(name)
        if owner is None:
            continue
        problems.append(
            f"{relative}:{line} response_model={name}（继承 StrictModel，定义在 {owner}）"
            "—— 响应侧多返回一个键就会 500，应改用 ResponseModel"
        )
    return problems, files


def main() -> int:
    parser = argparse.ArgumentParser(description="response_model 不得用 StrictModel")
    parser.add_argument("--check", action="store_true", help="有违规时退出 1")
    parser.add_argument("--json", action="store_true", help="机器可读")
    args = parser.parse_args()

    problems, files = scan()

    if args.json:
        print(json.dumps({"files": files, "violations": problems}, ensure_ascii=False, indent=2))
    else:
        print(f"check_response_models: 扫描 {files} 个模块")
        for problem in problems:
            print(f"  ✗ {problem}")

    if problems:
        if args.check:
            print(f"check_response_models: {len(problems)} violation(s)", file=sys.stderr)
        return 1
    print("check_response_models: 0 violation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
