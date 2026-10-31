#!/usr/bin/env python3
"""API 契约覆盖率棘轮（只读，纯 AST）。

为什么需要它
------------
`route_inventory.py` 只保证「路由数量与路径不变」，`check_ws_auth.py` 只保证「WS 路由
有鉴权调用」。**没有任何门禁在看响应契约**：一个 handler 把 `response_model` 或显式
`status_code` 删掉，路由基线照样绿，但 OpenAPI 文档当场退化、前端按 schema 生成的类型
悄悄变成 `any`。这类退化在评审里极难看见 —— 代码 diff 只是一行关键字消失。

口径
----
- 路由 = `@router.<method>(...)` 装饰器 + `router.add_api_route(path, ..., methods=[...])`；
- 路径 = `APIRouter(prefix=...)` / `NestRouter(prefix=...)` 的 prefix + 装饰器路径；
- `response_model` = 装饰器/`add_api_route` 显式传了 `response_model=`；
- `status_code` = 显式传了 `status_code=`（不传时 FastAPI 默认 200，属于「未声明」）。

棘轮语义（与 `check_complexity.py` / `check_frontend_complexity.mjs` 一致）
--------------------------------------------------------------------------
基线记录**逐文件**的 `operations` / `response_model` / `status_code`。任一文件的
`response_model` 或 `status_code` 计数下降即失败；总数下降也失败。新增文件不设门槛
（否则一次新功能会被迫先补契约），但只要它出现在下一次 `--update` 里，就不能再退。

用法
----
    node ops/lib/py.mjs ops/checks/architecture/api_contract_coverage.py            # 校验
    node ops/lib/py.mjs ops/checks/architecture/api_contract_coverage.py --write    # 重写基线
    node ops/lib/py.mjs ops/checks/architecture/api_contract_coverage.py --json     # 机器可读
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_BASELINE = Path(__file__).with_name("api-contract-baseline.json")
HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})
ROUTER_FACTORIES = frozenset({"APIRouter", "NestRouter"})
SKIP_PARTS = frozenset({"__pycache__", "tests"})

PROJECTS: dict[str, Path] = {
    "homeos": REPO_ROOT / "homeos" / "backend" / "src",
    "homeos-store": REPO_ROOT / "homeos-store" / "backend" / "src",
}


@dataclass(frozen=True)
class Route:
    """一条路由的契约声明状态。"""

    file: str
    line: int
    method: str
    path: str
    function: str
    has_response_model: bool
    has_status_code: bool


def _prefixes(tree: ast.AST, relative: str) -> dict[str, str]:
    """收集 `x = APIRouter(prefix=...)` / `x = NestRouter(prefix=...)` 的前缀。"""
    found: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        func = node.value.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
        if name not in ROUTER_FACTORIES:
            continue
        prefix = ""
        for keyword in node.value.keywords:
            if keyword.arg == "prefix" and isinstance(keyword.value, ast.Constant):
                prefix = str(keyword.value.value)
        for target in node.targets:
            if isinstance(target, ast.Name):
                found[f"{relative}:{target.id}"] = prefix
    return found


def _kw_present(call: ast.Call, name: str) -> bool:
    return any(keyword.arg == name for keyword in call.keywords)


def _router_name(node: ast.expr) -> str:
    """装饰器/调用里的 router 表达式 → 变量名（`router` / `self.router` 取末段）。"""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def _string_arg(call: ast.Call, position: int, name: str) -> str:
    """取位置参数或关键字里的字符串字面量。"""
    candidates: list[ast.expr] = []
    if len(call.args) > position:
        candidates.append(call.args[position])
    for keyword in call.keywords:
        if keyword.arg == name:
            candidates.append(keyword.value)
    for candidate in candidates:
        if isinstance(candidate, ast.Constant) and isinstance(candidate.value, str):
            return candidate.value
    return ""


def _list_constants(tree: ast.AST) -> dict[str, list[str]]:
    """收集模块级 `NAME = ["GET", ...]` 常量，供 `methods=_ALL_METHODS` 这类写法解析。"""
    found: dict[str, list[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        value = node.value
        if not isinstance(value, ast.List | ast.Tuple | ast.Set):
            continue
        items = [
            str(item.value).upper()
            for item in value.elts
            if isinstance(item, ast.Constant) and isinstance(item.value, str)
        ]
        if len(items) != len(value.elts):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                found[target.id] = items
    return found


def _methods_from_add_route(call: ast.Call, constants: dict[str, list[str]]) -> list[str]:
    for keyword in call.keywords:
        if keyword.arg != "methods":
            continue
        value = keyword.value
        if isinstance(value, ast.Name):
            return constants.get(value.id, [])
        if not isinstance(value, ast.List | ast.Tuple | ast.Set):
            return []
        return [
            str(item.value).upper()
            for item in value.elts
            if isinstance(item, ast.Constant) and isinstance(item.value, str)
        ]
    return []


def collect_routes(src: Path, project: str) -> list[Route]:
    src = src.resolve()
    if not src.is_dir():
        raise FileNotFoundError(src)
    files = sorted(path for path in src.rglob("*.py") if not SKIP_PARTS.intersection(path.relative_to(src).parts))
    trees: dict[str, ast.AST] = {}
    prefixes: dict[str, str] = {}
    constants: dict[str, list[str]] = {}
    for path in files:
        relative = path.relative_to(REPO_ROOT).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        trees[relative] = tree
        prefixes.update(_prefixes(tree, relative))
        constants.update(_list_constants(tree))

    routes: list[Route] = []
    for relative, tree in trees.items():
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                for decorator in node.decorator_list:
                    if not isinstance(decorator, ast.Call):
                        continue
                    func = decorator.func
                    if not isinstance(func, ast.Attribute) or func.attr not in HTTP_METHODS:
                        continue
                    name = _router_name(func.value)
                    prefix = prefixes.get(f"{relative}:{name}", "")
                    routes.append(
                        Route(
                            file=relative,
                            line=node.lineno,
                            method=func.attr.upper(),
                            path=f"{prefix}{_string_arg(decorator, 0, 'path')}",
                            function=node.name,
                            has_response_model=_kw_present(decorator, "response_model"),
                            has_status_code=_kw_present(decorator, "status_code"),
                        )
                    )
                continue
            if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
                continue
            call = node.value
            func = call.func
            if not isinstance(func, ast.Attribute) or func.attr != "add_api_route":
                continue
            name = _router_name(func.value)
            prefix = prefixes.get(f"{relative}:{name}", "")
            path = f"{prefix}{_string_arg(call, 0, 'path')}"
            methods = _methods_from_add_route(call, constants)
            if not methods:
                continue
            for method in methods:
                routes.append(
                    Route(
                        file=relative,
                        line=node.lineno,
                        method=method,
                        path=path,
                        function=_string_arg(call, 1, "endpoint") or "<add_api_route>",
                        has_response_model=_kw_present(call, "response_model"),
                        has_status_code=_kw_present(call, "status_code"),
                    )
                )
    return sorted(routes, key=lambda route: (route.file, route.line, route.method, route.path))


def summarize(routes: list[Route]) -> dict[str, dict[str, int]]:
    """按文件聚合，只保留有路由的文件。"""
    per_file: dict[str, dict[str, int]] = {}
    for route in routes:
        bucket = per_file.setdefault(route.file, {"operations": 0, "response_model": 0, "status_code": 0})
        bucket["operations"] += 1
        bucket["response_model"] += int(route.has_response_model)
        bucket["status_code"] += int(route.has_status_code)
    return dict(sorted(per_file.items()))


def totals(per_file: dict[str, dict[str, int]]) -> dict[str, int]:
    return {
        key: sum(bucket[key] for bucket in per_file.values()) for key in ("operations", "response_model", "status_code")
    }


def build_baseline() -> dict:
    per_file: dict[str, dict[str, int]] = {}
    for project, src in PROJECTS.items():
        per_file.update(summarize(collect_routes(src, project)))
    return {
        "description": (
            "两个后端的 API 契约覆盖率棘轮：逐文件统计 operations / response_model / status_code，任一计数下降即失败"
        ),
        "rules": "只认装饰器或 add_api_route 上显式声明的 response_model= / status_code=",
        "totals": totals(per_file),
        "files": per_file,
    }


def compare(expected: dict, actual: dict) -> list[str]:
    problems: list[str] = []
    expected_files: dict[str, dict[str, int]] = expected.get("files", {})
    for file, bucket in expected_files.items():
        current = actual.get(file)
        if current is None:
            problems.append(f"MISSING-FILE {file}（基线有 {bucket['operations']} 条路由，现在整个文件没有路由）")
            continue
        for key in ("response_model", "status_code"):
            if current[key] < bucket[key]:
                problems.append(
                    f"REGRESS {file} {key}: {bucket[key]} → {current[key]}"
                    f"（删掉了 {bucket[key] - current[key]} 处显式契约声明）"
                )
    expected_totals = expected.get("totals", {})
    actual_totals = totals(actual)
    for key in ("response_model", "status_code"):
        if actual_totals[key] < expected_totals.get(key, 0):
            problems.append(f"REGRESS TOTAL {key}: {expected_totals.get(key, 0)} → {actual_totals[key]}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--write", action="store_true", help="重写基线")
    parser.add_argument("--json", action="store_true", help="机器可读输出")
    args = parser.parse_args()

    per_file: dict[str, dict[str, int]] = {}
    per_project: dict[str, list[Route]] = {}
    for project, src in PROJECTS.items():
        routes = collect_routes(src, project)
        per_project[project] = routes
        per_file.update(summarize(routes))

    actual_totals = totals(per_file)
    if args.write:
        args.baseline.write_text(json.dumps(build_baseline(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"baseline written: {args.baseline}")
        return 0

    if not args.baseline.is_file():
        print(f"baseline missing: {args.baseline}", file=sys.stderr)
        return 2
    expected = json.loads(args.baseline.read_text(encoding="utf-8"))
    problems = compare(expected, per_file)

    if args.json:
        print(
            json.dumps(
                {
                    "totals": actual_totals,
                    "baseline_totals": expected.get("totals", {}),
                    "by_project": {
                        project: {
                            "operations": len(routes),
                            "response_model": sum(1 for r in routes if r.has_response_model),
                            "status_code": sum(1 for r in routes if r.has_status_code),
                        }
                        for project, routes in per_project.items()
                    },
                    "problems": problems,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1 if problems else 0

    for project, routes in per_project.items():
        typed = sum(1 for route in routes if route.has_response_model)
        declared = sum(1 for route in routes if route.has_status_code)
        total = len(routes)
        rate = typed / total * 100 if total else 0.0
        print(
            f"{project}: operations={total} response_model={typed} ({rate:.1f}%)"
            f" status_code={declared} ({declared / total * 100 if total else 0.0:.1f}%)"
        )

    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print("api contract ratchet ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
