"""授权商店冒烟脚本共用夹具：环境引导、fn 式断言、临时库与收尾。

此前 3 个 store 冒烟各自复制一套「硬设 STORE_DATA_DIR → 插 sys.path → 定义
``check()`` / ``expect()`` / ``failures`` / ``checked``」以及多处裸 ``tempfile.mkdtemp``
（用完不清理，跑一次留一堆目录）。这里收敛成一份。

用法（``STORE_DATA_DIR`` 必须在 ``import src.*`` 之前设好）::

    from _smoke_harness import bootstrap_env, check, expect, report, temp_dir

    def main() -> int:
        data_dir = bootstrap_env()          # 临时目录 + backend 加入 sys.path
        ...
        check("某项检查", lambda: expect(actual, wanted, "说明"))
        report()
        return 0

脚本直接以 ``python <script>.py`` 运行时，``sys.path[0]`` 就是脚本目录，因此
``import _smoke_harness`` 无需手动插路径。``check(name, fn)`` 是 **fn 式**：任何异常都算失败，
不让脚本半路炸掉；``expect`` 是相等断言，``expect_true`` 是真值断言。

「模块里有没有真的调 X / 真的把某文案写进字面量」这类结构断言用 ``source_ast`` 家族
（``call_targets`` / ``referenced_names`` / ``literal_line`` / ``call_line`` /
``membership_string_set``），不用字符串匹配源码 —— 后者换行即红、注释也能满足。
"""

from __future__ import annotations

import ast
import inspect
import os
import sys
import tempfile
import textwrap
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

STORE_ROOT = Path(__file__).resolve().parents[1]
BACKEND = STORE_ROOT / "backend"

_failures: list[str] = []
_checked = 0
# 持有 TemporaryDirectory 引用：解释器退出时才清理，替代裸 mkdtemp 的目录泄漏。
_retained: list[tempfile.TemporaryDirectory] = []


def ensure_backend_on_path() -> None:
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))


def bootstrap_env(prefix: str = "homeos-store-smoke-", data_dir: Path | None = None) -> Path:
    """硬设 ``STORE_DATA_DIR`` 到临时目录，并把 ``backend/`` 加入 ``sys.path``。

    必须**硬赋值**而非 ``setdefault``：若外部（开发者 shell / CI）已经把 STORE_DATA_DIR
    导出成真实 data/，``setdefault`` 会原样保留它，冒烟就会往真实库里写。宁可显式报错，
    也不要静默污染。
    """
    if data_dir is not None:
        resolved = Path(data_dir)
    else:
        holder = tempfile.TemporaryDirectory(prefix=prefix)
        _retained.append(holder)
        resolved = Path(holder.name) / "data"
    existing = os.environ.get("STORE_DATA_DIR")
    if existing and Path(existing).expanduser().resolve() != resolved.resolve():
        raise SystemExit(
            f"拒绝运行：STORE_DATA_DIR 已被设为 {existing}（非本次的临时目录）。"
            " 为免冒烟写进真实 data/，请先 `unset STORE_DATA_DIR` 再跑。"
        )
    os.environ["STORE_DATA_DIR"] = str(resolved)
    ensure_backend_on_path()
    return resolved


def temp_dir(prefix: str = "homeos-store-smoke-") -> Path:
    """临时目录，解释器退出时自动清理 —— 替代裸 ``tempfile.mkdtemp`` 的泄漏。"""
    holder = tempfile.TemporaryDirectory(prefix=prefix)
    _retained.append(holder)
    return Path(holder.name)


@contextmanager
def temp_sqlite(prefix: str = "homeos-store-smoke-") -> Generator[Path]:
    """作用域化的临时目录（退出 ``with`` 即清理），供临时 SQLite 工作区使用。"""
    with tempfile.TemporaryDirectory(prefix=prefix) as raw:
        yield Path(raw)


def expect(actual: object, wanted: object, what: str) -> None:
    """相等断言：失败信息里同时给出期望与实际，便于直接定位。"""
    if actual != wanted:
        raise AssertionError(f"{what}：期望 {wanted!r}，实际 {actual!r}")


def expect_true(condition: object, message: str) -> None:
    """真值断言：失败时只打印这条 message。"""
    if not condition:
        raise AssertionError(message)


def source_ast(target) -> ast.Module:
    """把模块或可调用对象解析成 AST（行号即源码行号）。

    「路由里有没有真的调 X」这类结构断言一律走 AST，不用 ``inspect.getsource`` 做字符串
    匹配：字符串匹配被 ``ruff format`` 换个换行就红，而且注释里写上同样的字样也能满足，
    等于没测。AST 只看真实的调用/字面量节点。
    """
    return ast.parse(textwrap.dedent(inspect.getsource(target)))


def _called_name(node: ast.AST) -> str | None:
    """取 ``f(...)`` / ``a.b.f(...)`` 里的被调名，其它调用形态返回 None。"""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def call_targets(target) -> set[str]:
    """目标体内真实发生的被调名集合（``fulfill.revert_license_change`` → ``revert_license_change``）。"""
    return {
        name
        for node in ast.walk(source_ast(target))
        if isinstance(node, ast.Call) and (name := _called_name(node.func)) is not None
    }


def referenced_names(target) -> set[str]:
    """目标体内出现过的名字：``ast.Name`` 标识符 + 属性末段 + 关键字参数名。

    用于断言「读到了某个字段/引用了某个符号」，且不会被注释或无关字符串骗过。
    """
    names: set[str] = set()
    for node in ast.walk(source_ast(target)):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg is not None:
            names.add(node.arg)
    return names


def literal_line(target, text: str) -> int | None:
    """包含 ``text`` 的字符串字面量所在的最小行号；找不到返回 None。

    与 ``"text" in source`` 的区别：注释、变量名、日志模板都不算，只有真的写进字符串
    字面量（多半是抛给用户的 detail）才算数。
    """
    hits = [
        node.lineno
        for node in ast.walk(source_ast(target))
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and text in node.value
    ]
    return min(hits) if hits else None


def call_line(target, name: str) -> int | None:
    """调用 ``name`` 的最小行号；找不到返回 None。"""
    hits = [
        node.lineno
        for node in ast.walk(source_ast(target))
        if isinstance(node, ast.Call) and _called_name(node.func) == name
    ]
    return min(hits) if hits else None


def membership_string_set(target, name: str) -> set[str] | None:
    """找 ``...<name> in {"a", "b"}`` 里的字符串集合。

    用于断言白名单/守卫集合覆盖了哪些分支（比匹配整段字面量源码稳：换行、加注释、
    给集合排序都不会红）。
    """
    for node in ast.walk(source_ast(target)):
        if not isinstance(node, ast.Compare) or len(node.ops) != 1 or len(node.comparators) != 1:
            continue
        if not isinstance(node.ops[0], (ast.In, ast.NotIn)):
            continue
        left = node.left
        left_name = left.attr if isinstance(left, ast.Attribute) else getattr(left, "id", None)
        if left_name != name:
            continue
        right = node.comparators[0]
        if not isinstance(right, (ast.Set, ast.Tuple, ast.List)):
            continue
        values = {item.value for item in right.elts if isinstance(item, ast.Constant) and isinstance(item.value, str)}
        if values:
            return values
    return None


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global _checked
    _checked += 1
    try:
        fn()
    except AssertionError as error:
        _failures.append(f"{name} —— {error}")
        print(f"  FAIL {name} —— {error}")
    except Exception as error:
        # 未预期异常同样算失败，但要看清类型：它通常意味着环境问题而非判定口径。
        _failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def failed() -> bool:
    return bool(_failures)


def report(success_message: str = "冒烟通过。") -> None:
    """打印通过数与失败清单；有失败即以非零码退出，可直接当门禁用。"""
    passed = _checked - len(_failures)
    print(f"\n通过 {passed} / {_checked} 项检查。")
    if _failures:
        print(f"\n冒烟失败，共 {len(_failures)} 条：")
        for item in _failures:
            print(f"  - {item}")
        raise SystemExit(1)
    print(success_message)


__all__ = [
    "BACKEND",
    "STORE_ROOT",
    "bootstrap_env",
    "call_line",
    "call_targets",
    "check",
    "ensure_backend_on_path",
    "expect",
    "expect_true",
    "failed",
    "literal_line",
    "membership_string_set",
    "referenced_names",
    "report",
    "source_ast",
    "temp_dir",
    "temp_sqlite",
]
