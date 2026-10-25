#!/usr/bin/env python3
"""检测 async 路由/事件处理里直接调用同步 SQLAlchemy API 的回归。

规则：在 async 函数体内（不含它内部定义的同步函数，因为那些通常已经被
asyncio.to_thread 包起来），如果对 session/db/database 变量调用
execute/query/get/commit/flush/scalar/scalars/add/delete/merge/refresh，
或对 engine 调用 connect，就报错。

退出码：0 干净，1 有违规。
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = [
    ROOT / "homeos/backend/src/api",
    ROOT / "homeos/backend/src/realtime",
    ROOT / "homeos/backend/src/bootstrap",
    # 域服务此前不在扫描范围：`check_async_db` 一直 PASS，但 domains/ 里有几十处
    # async 函数内直接跑同步 SQLAlchemy，会把事件循环整段阻塞。
    ROOT / "homeos/backend/src/domains",
    ROOT / "homeos/backend/src/modules",
]
EXTRA_FILES = [ROOT / "homeos/backend/src/app.py"]
ORM_METHODS = {
    "execute", "query", "get", "commit", "flush", "scalar", "scalars",
    "add", "delete", "merge", "refresh", "begin",
}
DB_NAMES = {"session", "db", "database", "sess", "conn", "dbsession", "db_session"}
ENGINE_METHODS = {"connect", "begin"}


def _receiver_name(node: ast.AST) -> str | None:
    current = node
    while isinstance(current, ast.Attribute):
        current = current.value
    if isinstance(current, ast.Name):
        return current.id
    return None


class AsyncDbVisitor(ast.NodeVisitor):
    def __init__(self, path: Path) -> None:
        self.path = path
        self.violations: list[tuple[Path, int, str]] = []

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        for child in node.body:
            self._walk_async(child)

    def _walk_async(self, node: ast.AST) -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            if isinstance(node, ast.AsyncFunctionDef):
                self.visit_AsyncFunctionDef(node)
            return
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    self._check_call(child)
            return
        if isinstance(node, ast.Call):
            self._check_call(node)
        for child in ast.iter_child_nodes(node):
            self._walk_async(child)

    def _check_call(self, call: ast.Call) -> None:
        func = call.func
        if not isinstance(func, ast.Attribute):
            return
        receiver = _receiver_name(func.value)
        if receiver is None:
            return
        lowered = receiver.lower()
        if (
            func.attr == "get"
            and call.args
            and isinstance(call.args[0], ast.Constant)
            and isinstance(call.args[0].value, str)
        ):
            # dict.get("key")，例如 socket.io 的 session 字典。
            return
        if (func.attr in ORM_METHODS and lowered in DB_NAMES) or (func.attr in ENGINE_METHODS and ("engine" in lowered or "database" in lowered)):
            self.violations.append((self.path, call.lineno, f"{receiver}.{func.attr}()"))


def _iter_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if root.exists():
            files.extend(sorted(root.rglob("*.py")))
    files.extend(path for path in EXTRA_FILES if path.exists())
    return files


def main() -> int:
    violations: list[tuple[Path, int, str]] = []
    for path in _iter_files():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as error:
            print(f"{path}:{error.lineno}: 无法解析：{error.msg}", file=sys.stderr)
            return 1
        visitor = AsyncDbVisitor(path)
        visitor.visit(tree)
        violations.extend(visitor.violations)
    for path, line, detail in violations:
        print(f"{path.relative_to(ROOT)}:{line}: async 函数内直接调用同步数据库 API {detail}")
    if violations:
        print(f"\n共 {len(violations)} 处；请改用 platform.core.db_exec.run_db 或 asyncio.to_thread。", file=sys.stderr)
        return 1
    print("async DB 检查通过：未发现 async 函数内直接调用同步数据库 API。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
