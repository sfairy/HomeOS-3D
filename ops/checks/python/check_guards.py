#!/usr/bin/env python3
"""Python 源码的三个 AST 守卫（只读，纯标准库 + 项目运行期依赖）。

## 为什么把三条并成一条

三个守卫做的是同一件事的不同变体：**走一遍后端源码的 AST，收集某类违规**。

| 子检查 | 守什么 | 违规后果 |
| --- | --- | --- |
| `async-db` | `async def` 体内直接调用同步 SQLAlchemy | 整段事件循环被阻塞 |
| `pep758` | `except A, B:`（无括号多异常） | Cython 3.3.0 解析成 `except A as B:`，编译通过但只捕获 A |
| `response-models` | `response_model=` 引用继承 `StrictModel` 的类 | 响应多一个键就 500 |

拆成三个文件时，`import` 头、文件遍历、`main()` 尾巴各写三遍；合并后共用一次遍历与
一份 `parse_tree` 缓存（批量入口里与其它后端检查共享同一棵 AST）。

## 各子检查的口径

### async-db

在 async 函数体内（不含它内部定义的嵌套函数，那些通常已经 `asyncio.to_thread` 包起来），
对 `session` / `db` / `database` 这类变量调用 `execute` / `query` / `get` / `commit` / `flush` /
`scalar` / `scalars` / `add` / `delete` / `merge` / `refresh` / `begin`，或对 engine 调用
`connect`，即违规。另外 async 内直接构造同步 `Session` / `sessionmaker` / `scoped_session`
同样算（`async_sessionmaker` 是异步入口，放行）。

### pep758

`except A, B:` 不带括号时，Cython 3.3.0 会把它解析成 `except A as B:` —— 编译**通过**，
但只捕获 A。`ruff format` 会主动改成无括号形式，所以这条守卫必须比 `check:cython` 更早、
更便宜。扫描范围与 `check:cython` 一致（`IMAGE_SOURCE_ROOTS`，即 Dockerfile 真正 COPY 进
镜像的那批）。

### response-models

`api/schemas/base.py` 有两个基类，语义**相反**：`StrictModel`（`extra="forbid"`）给请求体，
`ResponseModel`（`extra="ignore"`）给响应。把 `StrictModel` 误用到 `response_model=` 上时，
服务层多返回一个键就会在序列化阶段抛 `ValidationError`，把正常请求升级成 500 ——
类型检查与路由基线都看不见。判定纯 AST：收集 `class X(StrictModel)` 的类名与所有
`response_model=Name`，交集即违规；跨模块引用按末段名比对，宁可多报。

## 用法

```bash
node ops/lib/py.mjs ops/checks/python/check_guards.py             # 三条都跑
node ops/lib/py.mjs ops/checks/python/check_guards.py --check     # 同上（默认即门禁语义）
node ops/lib/py.mjs ops/checks/python/check_guards.py --module pep758
node ops/lib/py.mjs ops/checks/python/check_guards.py --json
```
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from typing import Any

from ops.checks._bootstrap import ROOT, parse_tree
from ops.lib.batch import SubSpec, run_subchecks

# --------------------------------------------------------------------------- #
# async-db
# --------------------------------------------------------------------------- #

ASYNC_DB_ROOTS = [
    ROOT / "homeos/backend/src/api",
    ROOT / "homeos/backend/src/realtime",
    ROOT / "homeos/backend/src/bootstrap",
    # 域服务此前不在扫描范围：`check_async_db` 一直 PASS，但 domains/ 里有几十处
    # async 函数内直接跑同步 SQLAlchemy，会把事件循环整段阻塞。
    ROOT / "homeos/backend/src/domains",
    ROOT / "homeos/backend/src/modules",
]
ASYNC_DB_EXTRA_FILES = [ROOT / "homeos/backend/src/app.py"]
ORM_METHODS = {
    "execute",
    "query",
    "get",
    "commit",
    "flush",
    "scalar",
    "scalars",
    "add",
    "delete",
    "merge",
    "refresh",
    "begin",
}
DB_NAMES = {
    "session",
    "db",
    "database",
    "sess",
    "conn",
    "dbsession",
    "db_session",
    # 间接命名也常是同步 Session（旧门禁只认字面量，假绿）
    "_session",
    "_db",
    "_sess",
    "orm_session",
    "sa_session",
    "sql_session",
    "scoped_session",
}
ENGINE_METHODS = {"connect", "begin"}
# 间接同步：async 里直接 new Session / sessionmaker() 再 ORM 调用同样会堵循环
SESSION_CTORS = {"Session", "sessionmaker", "scoped_session", "async_sessionmaker"}


def _receiver_name(node: ast.AST) -> str | None:
    current = node
    while isinstance(current, ast.Attribute):
        current = current.value
    if isinstance(current, ast.Name):
        return current.id
    return None


def _looks_like_db_name(name: str) -> bool:
    lowered = name.lower()
    if lowered in DB_NAMES:
        return True
    # WebRTC / 内存会话表（``_sessions``）不是 SQLAlchemy，排除复数 maps
    if lowered.endswith("sessions"):
        return False
    # self.db_session / repo._session 这类间接命名
    return lowered.endswith(("_session", "_db"))


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
        # async 内直接构造同步 Session / sessionmaker()
        ctor_name: str | None = None
        if isinstance(func, ast.Name):
            ctor_name = func.id
        elif isinstance(func, ast.Attribute):
            ctor_name = func.attr
        if ctor_name in SESSION_CTORS and ctor_name != "async_sessionmaker":
            # async_sessionmaker 是异步入口，允许；同步 Session/sessionmaker 不行
            if ctor_name in {"Session", "sessionmaker", "scoped_session"}:
                self.violations.append((self.path, call.lineno, f"{ctor_name}()"))
                return

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
        if (func.attr in ORM_METHODS and _looks_like_db_name(receiver)) or (
            func.attr in ENGINE_METHODS and ("engine" in lowered or "database" in lowered)
        ):
            self.violations.append((self.path, call.lineno, f"{receiver}.{func.attr}()"))


def _async_db_files() -> list[Path]:
    files: list[Path] = []
    for root in ASYNC_DB_ROOTS:
        if root.exists():
            files.extend(sorted(root.rglob("*.py")))
    files.extend(path for path in ASYNC_DB_EXTRA_FILES if path.exists())
    return files


def run_async_db() -> tuple[list[str], str]:
    violations: list[tuple[Path, int, str]] = []
    for path in _async_db_files():
        try:
            tree = parse_tree(path)
        except SyntaxError as error:
            return [f"{path}:{error.lineno}: 无法解析：{error.msg}"], "解析失败"
        visitor = AsyncDbVisitor(path)
        visitor.visit(tree)
        violations.extend(visitor.violations)

    problems = [
        f"{path.relative_to(ROOT)}:{line}: async 函数内直接调用同步数据库 API {detail}"
        for path, line, detail in violations
    ]
    if problems:
        problems.append(f"共 {len(violations)} 处；请改用 platform.core.db_exec.run_db 或 asyncio.to_thread。")
    return problems, f"{len(_async_db_files())} 个模块"


# --------------------------------------------------------------------------- #
# pep758
# --------------------------------------------------------------------------- #

#: 违规时的统一改法说明。
_PEP758_HINT = "except (A, B):  # fmt: skip —— 括号不能省，Cython 3.3.0 会把无括号形式解析成 `except A as B:`"


def _pep758_sources() -> list[Path]:
    """`IMAGE_SOURCE_ROOTS` 下的全部 .py（与 check:cython 扫的是同一批文件）。"""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from ops.ci.image_imports import IMAGE_SOURCE_ROOTS

    found: list[Path] = []
    for relative in IMAGE_SOURCE_ROOTS:
        target = ROOT / relative
        if target.is_file():
            found.append(target)
        elif target.is_dir():
            found.extend(sorted(target.rglob("*.py")))
    return [path for path in found if "__pycache__" not in path.parts]


def _pep758_violations(path: Path, root: Path) -> list[dict[str, Any]]:
    """一个文件里所有「无括号多异常捕获」：``[{file, line, except}]``。"""
    try:
        source = path.read_text(encoding="utf-8")
        tree = parse_tree(path)
    except (OSError, SyntaxError, ValueError):  # fmt: skip
        # 读不出来 / 语法错误由 py_compile、ruff、check:cython 各自负责，这里不重复报。
        return []
    result: list[dict[str, Any]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        handler = node.type
        if not isinstance(handler, ast.Tuple) or not handler.elts:
            continue
        segment = ast.get_source_segment(source, handler) or ""
        if segment.lstrip().startswith("("):
            continue
        names = [ast.unparse(item) for item in handler.elts]
        # 夹具仓库可能不在本仓库之内（--root /tmp/fixture），此时报绝对路径。
        try:
            shown = str(path.relative_to(root))
        except ValueError:
            shown = str(path)
        result.append({"file": shown, "line": node.lineno, "except": ", ".join(names)})
    return result


def run_pep758() -> tuple[list[str], str]:
    targets = _pep758_sources()
    if not targets:
        return ["没有扫到任何源码 —— IMAGE_SOURCE_ROOTS 与 Dockerfile 的 COPY 已经错位"], "0 个模块"
    problems: list[str] = []
    for path in targets:
        for item in _pep758_violations(path, ROOT):
            problems.append(f"{item['file']}:{item['line']}  except {item['except']}")
    if problems:
        problems.append(f"改法：{_PEP758_HINT}")
    return problems, f"{len(targets)} 个模块"


# --------------------------------------------------------------------------- #
# response-models
# --------------------------------------------------------------------------- #

RESPONSE_MODEL_ROOTS = [
    ROOT / "homeos/backend/src",
    ROOT / "homeos-store/backend/src",
]
RESPONSE_MODEL_SKIP_DIRS = frozenset({"__pycache__", "node_modules", ".venv-store", "dist", "backups"})
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


def scan_response_models(roots: list[Path] | None = None) -> tuple[list[str], int]:
    """扫描并返回 (违规描述, 扫描模块数)。

    ``roots`` 可覆盖（供单元测试传临时目录）—— 否则这条门禁本身无法被验证，
    而「永远绿的假门禁」比没有门禁更糟。
    """
    strict_classes: dict[str, str] = {}
    response_usages: list[tuple[str, int, str]] = []
    files = 0

    for root in roots if roots is not None else RESPONSE_MODEL_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.py")):
            if any(part in RESPONSE_MODEL_SKIP_DIRS for part in path.parts):
                continue
            try:
                tree = parse_tree(path)
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


def run_response_models() -> tuple[list[str], str]:
    problems, files = scan_response_models()
    return problems, f"扫描 {files} 个模块"


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    modules: tuple[SubSpec, ...] = (
        ("async-db", run_async_db),
        ("pep758", run_pep758),
        ("response-models", run_response_models),
    )
    return run_subchecks(
        modules=modules,
        title="Python 守卫",
        description="Python 源码 AST 守卫（async DB / PEP 758 / 响应模型）",
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
