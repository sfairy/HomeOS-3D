#!/usr/bin/env python3
"""WebSocket 路由鉴权守卫：每条 `@router.websocket` 都必须能追到已知鉴权调用。

为什么需要它
-----------
HTTP 路由可以用依赖声明判断"有没有鉴权"；WebSocket 不能 —— 鉴权发生在 accept 之前
的 handler 代码里（读 Cookie、查会话、验 Origin、查 license），FastAPI 的 OpenAPI
也看不到它。结果就是 5 条 WS 路由明明各自校验，却没有任何门禁能阻止"新加一条 WS
忘了鉴权"。这个脚本把"handler 内必须出现哪个鉴权符号"变成可执行契约。

口径
----
- 静态 AST，不连库、不启动服务；
- 允许一层以上的模块内调用（例如 `embed_proxy_ws_root` → `_embed_proxy_ws`）；
- 鉴权符号是白名单：新增校验方式时在这里登记，并同步基线；
- 基线记录全部 WS 路由；新增/删除路由必须显式改基线，避免"悄悄多一条"。

用法：
    node ops/lib/py.mjs ops/checks/security/check_ws_auth.py --check
    node ops/lib/py.mjs ops/checks/security/check_ws_auth.py --write
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SRC = REPO_ROOT / "homeos" / "backend" / "src"
DEFAULT_BASELINE = Path(__file__).with_name("ws-routes-baseline.json")

#: 允许作为"这条 WS 已鉴权"证据的调用名。不要放宽成任意 `*auth*`：
#: 名字匹配会让 `_unauth_debug` 之类的函数误判通过。
AUTH_SYMBOLS: frozenset[str] = frozenset(
    {
        "_runtime_authorize",
        "resolve_go2rtc_ws_user",
        "verify_embed_ws_auth",
        "websocket_origin_allowed",
        "websocket_viewer",
    }
)

MAX_CALL_DEPTH = 4

#: 每条路由的"最低证据"：只看"有没有任一鉴权符号"会放过 `/ws`（只有 Origin 校验、
#: 没有用户会话校验）。这里按路径钉死必须出现的符号；新增路由必须在本表登记。
REQUIRED_AUTH: dict[str, tuple[str, ...]] = {
    "/ws": ("websocket_origin_allowed", "websocket_viewer"),
    "/ws/runtime": ("_runtime_authorize",),
    "/ha/webrtc-ws": ("resolve_go2rtc_ws_user",),
    "/embed-proxy/{embed_id}": ("verify_embed_ws_auth",),
    "/embed-proxy/{embed_id}/{sub_path:path}": ("verify_embed_ws_auth",),
}


@dataclass(frozen=True)
class Route:
    file: str
    line: int
    path: str
    function: str
    auth_symbols: tuple[str, ...]


def _call_name(node: ast.Call) -> str:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return ""


def _function_calls(functions: dict[str, ast.AST]) -> dict[str, set[str]]:
    """收集函数内出现过的调用名与作为参数传入的函数名。

    `asyncio.to_thread(websocket_viewer, websocket)` 里的 `websocket_viewer` 不是被调用，
    而是被传递；只看 `Call.func` 会漏掉这条鉴权证据，所以参数里的 Name 也要收。
    """
    calls: dict[str, set[str]] = {}
    for name, node in functions.items():
        found: set[str] = set()
        for child in ast.walk(node):
            if not isinstance(child, ast.Call):
                continue
            callee = _call_name(child)
            if callee:
                found.add(callee)
            for argument in [*child.args, *(keyword.value for keyword in child.keywords)]:
                if isinstance(argument, ast.Name):
                    found.add(argument.id)
        calls[name] = found
    return calls


def _reaching_auth(name: str, calls: dict[str, set[str]], seen: set[str], depth: int = 0) -> set[str]:
    if name in seen or depth > MAX_CALL_DEPTH:
        return set()
    seen.add(name)
    direct = calls.get(name, set()) & AUTH_SYMBOLS
    if direct:
        return set(direct)
    found: set[str] = set()
    for callee in calls.get(name, set()):
        if callee in calls:
            found |= _reaching_auth(callee, calls, seen, depth + 1)
    return found


def _websocket_path(decorator: ast.Call) -> str | None:
    func = decorator.func
    if not isinstance(func, ast.Attribute) or func.attr != "websocket":
        return None
    if decorator.args and isinstance(decorator.args[0], ast.Constant):
        value = decorator.args[0].value
        return value if isinstance(value, str) else None
    return None


def scan(root: Path = DEFAULT_SRC) -> list[Route]:
    """扫描所有 Python 文件，返回带鉴权链的 WS 路由（按文件/行排序）。"""
    root = root.resolve()
    if not root.is_dir():
        raise FileNotFoundError(root)
    routes: list[Route] = []
    for file in sorted(root.rglob("*.py")):
        if "__pycache__" in file.parts:
            continue
        relative = file.relative_to(root).as_posix()
        tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
        functions = {
            node.name: node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        }
        calls = _function_calls(functions)
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                path = _websocket_path(decorator)
                if path is None:
                    continue
                auth = tuple(sorted(_reaching_auth(node.name, calls, set())))
                routes.append(
                    Route(
                        file=relative,
                        line=node.lineno,
                        path=path,
                        function=node.name,
                        auth_symbols=auth,
                    )
                )
    return sorted(routes, key=lambda route: (route.file, route.line, route.path))


def _baseline_payload(routes: list[Route]) -> dict[str, object]:
    return {
        "description": "homeos 后端全部 WebSocket 路由及其 handler 内鉴权调用；新增/删除路由必须改这里",
        "routes": [{"file": route.file, "function": route.function, "path": route.path} for route in routes],
    }


def _route_key(route: Route) -> tuple[str, str, str]:
    return (route.file, route.function, route.path)


def _load_baseline(path: Path) -> set[tuple[str, str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {(str(item["file"]), str(item["function"]), str(item["path"])) for item in payload.get("routes", [])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="写入基线")
    mode.add_argument("--check", action="store_true", help="与基线比对（默认）")
    args = parser.parse_args()

    routes = scan(args.src)
    for route in routes:
        status = "OK" if route.auth_symbols else "MISSING"
        symbols = ",".join(route.auth_symbols) or "-"
        print(f"{status:7} {route.file}:{route.line} {route.path:44} {route.function:28} {symbols}")

    problems: list[str] = []
    unauthenticated = [route for route in routes if not route.auth_symbols]
    for route in unauthenticated:
        problems.append(f"UNAUTHENTICATED {route.file}:{route.line} {route.path} ({route.function})")
    for route in routes:
        required = REQUIRED_AUTH.get(route.path)
        if required is None:
            problems.append(
                f"UNREGISTERED {route.file}:{route.line} {route.path} ({route.function}); "
                "在 check_ws_auth.REQUIRED_AUTH 登记最低鉴权证据"
            )
            continue
        missing = sorted(set(required) - set(route.auth_symbols))
        if missing:
            problems.append(
                f"INSUFFICIENT {route.file}:{route.line} {route.path} ({route.function}) missing {','.join(missing)}"
            )

    if args.write:
        args.baseline.write_text(
            json.dumps(_baseline_payload(routes), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"baseline written: {args.baseline} ({len(routes)} routes)")
        return 1 if unauthenticated else 0

    if not args.baseline.is_file():
        print(f"baseline missing: {args.baseline}", file=sys.stderr)
        return 2
    expected = _load_baseline(args.baseline)
    actual = {_route_key(route) for route in routes}
    for item in sorted(expected - actual):
        problems.append(f"REMOVED {item[0]} {item[1]} {item[2]}")
    for item in sorted(actual - expected):
        problems.append(f"ADDED   {item[0]} {item[1]} {item[2]}")

    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print(f"ws auth ok: {len(routes)} routes, all reach an auth symbol")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
