#!/usr/bin/env python3
"""授权商店路由契约基线：把 (method, path, 鉴权类型) 钉死成可审查的快照。

为什么商店需要单独的脚本
------------------------
主应用有 `route_inventory.py`：它用临时 symlink 导入 `bootstrap.router_registry` 取
OpenAPI。商店的 `create_app()` 会在导入/构造时建库、跑迁移、要求密钥目录，不适合放进
静态门禁；而商店 121 条路由里 75 条是 admin，任何一条鉴权注解被删都会造成越权。

这里用纯 AST 静态扫描，口径与 `route_inventory.py` 的"实际注册表"不同：
- 路径 = `APIRouter(prefix=...)` + 装饰器路径；
- 鉴权 = handler 参数里的 `AdminAccount` / `AuthedAccount` / `CurrentAccount|CurrentSession`；
- 不启动应用、不建库、不读密钥。

基线变化必须显式 `--write`，并在 PR 里解释"为什么多/少了一条路由、鉴权为什么变了"。

用法：
    node ops/lib/py.mjs ops/checks/architecture/store_route_inventory.py --check
    node ops/lib/py.mjs ops/checks/architecture/store_route_inventory.py --write
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SRC = REPO_ROOT / "homeos-store" / "backend" / "src"
DEFAULT_BASELINE = Path(__file__).with_name("store-routes-baseline.json")
HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options"})
AUTH_ORDER = ("admin", "account", "optional-account", "public")


@dataclass(frozen=True)
class StoreRoute:
    file: str
    line: int
    method: str
    path: str
    function: str
    auth: str

    def key(self) -> str:
        return f"{self.method} {self.path} [{self.auth}]"


def _router_prefixes(tree: ast.AST, relative: str) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        func = node.value.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
        if name != "APIRouter":
            continue
        prefix = ""
        for keyword in node.value.keywords:
            if keyword.arg == "prefix" and isinstance(keyword.value, ast.Constant):
                prefix = str(keyword.value.value)
        for target in node.targets:
            if isinstance(target, ast.Name):
                prefixes[f"{relative}:{target.id}"] = prefix
    return prefixes


def _auth_kind(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    annotations = " ".join(
        ast.unparse(argument.annotation)
        for argument in [*node.args.args, *node.args.kwonlyargs]
        if argument.annotation is not None
    )
    if "AdminAccount" in annotations:
        return "admin"
    if "AuthedAccount" in annotations:
        return "account"
    if "CurrentAccount" in annotations or "CurrentSession" in annotations:
        return "optional-account"
    return "public"


def _decorator_method(decorator: ast.Call) -> str | None:
    func = decorator.func
    if not isinstance(func, ast.Attribute) or func.attr not in HTTP_METHODS:
        return None
    return func.attr.upper()


def collect_routes(src: Path = DEFAULT_SRC) -> list[StoreRoute]:
    """返回排序后的路由清单（按 method + path + 鉴权）。"""
    src = src.resolve()
    if not src.is_dir():
        raise FileNotFoundError(src)
    files = sorted(file for file in src.rglob("*.py") if "__pycache__" not in file.parts)
    trees: dict[str, ast.AST] = {}
    prefixes: dict[str, str] = {}
    for file in files:
        relative = file.relative_to(src).as_posix()
        tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
        trees[relative] = tree
        prefixes.update(_router_prefixes(tree, relative))

    routes: list[StoreRoute] = []
    for relative, tree in trees.items():
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                method = _decorator_method(decorator)
                if method is None:
                    continue
                path = decorator.args[0].value if decorator.args and isinstance(decorator.args[0], ast.Constant) else ""
                if not isinstance(path, str):
                    path = ""
                router = decorator.func.value
                router_name = router.id if isinstance(router, ast.Name) else ""
                prefix = prefixes.get(f"{relative}:{router_name}", "")
                routes.append(
                    StoreRoute(
                        file=relative,
                        line=node.lineno,
                        method=method,
                        path=f"{prefix}{path}",
                        function=node.name,
                        auth=_auth_kind(node),
                    )
                )
    return sorted(routes, key=lambda route: (route.method, route.path, route.auth))


def _load_baseline(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [str(item) for item in payload.get("routes", [])]


def _write_baseline(path: Path, routes: list[StoreRoute]) -> None:
    payload = {
        "description": "homeos-store 后端 (method, path, 鉴权类型) 快照；改路由必须同步这里",
        "counts": dict(sorted(Counter(route.auth for route in routes).items())),
        "routes": [route.key() for route in routes],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="写入基线")
    mode.add_argument("--check", action="store_true", help="与基线比对（默认）")
    args = parser.parse_args()

    routes = collect_routes(args.src)
    counts = Counter(route.auth for route in routes)
    print(f"routes={len(routes)} " + " ".join(f"{kind}={counts.get(kind, 0)}" for kind in AUTH_ORDER))

    if args.write:
        _write_baseline(args.baseline, routes)
        print(f"baseline written: {args.baseline}")
        return 0

    if not args.baseline.is_file():
        print(f"baseline missing: {args.baseline}", file=sys.stderr)
        return 2
    expected = _load_baseline(args.baseline)
    actual = [route.key() for route in routes]
    missing = sorted(set(expected) - set(actual))
    added = sorted(set(actual) - set(expected))
    if missing or added:
        for item in missing:
            print(f"MISSING {item}", file=sys.stderr)
        for item in added:
            print(f"ADDED   {item}", file=sys.stderr)
        return 1
    print("store route inventory matches baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
