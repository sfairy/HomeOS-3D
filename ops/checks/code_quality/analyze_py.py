"""Python 侧离线静态分析：无效代码 / 死代码 / 低效候选 / 重复实现。

设计原则（与 docs/code-quality/2026-10-20/report.md 的判定规则一致）：
- 只做「保守」判定：任一引用（含字符串出现、装饰器注册、__all__ 导出）都视为活代码；
- 无法被静态证明的（公共 API、动态 getattr 名字）一律降级为 manual 待人工确认；
- 输出确定性 JSON（按 path/line 排序），供 run.mjs 合并与渲染。
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import Counter
from pathlib import Path

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    ".venv-store",
    "__pycache__",
    "dist",
    "build",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
}
SKIP_PREFIXES = [
    ("ops", "checks", "code_quality"),
    ("homeos", "frontend", "public"),
    ("docs",),
    ("ops", "perf", "reports"),
]
PY_ROOTS = [
    "homeos/backend/src",
    "homeos-store/backend/src",
    "packages/shared-py",
    "ops",
]

DEF_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
TERMINATORS = (ast.Return, ast.Raise, ast.Break, ast.Continue)
DYNAMIC_CALLS = {"getattr", "setattr", "delattr", "globals", "locals", "__import__", "import_module"}
DB_MARKERS = {".query(", ".execute(", ".scalars(", ".commit(", ".flush(", "session.", "select("}


def iter_py_files(repo: Path) -> list[Path]:
    files: list[Path] = []
    for root in PY_ROOTS:
        base = repo / root
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.py")):
            rel_parts = path.relative_to(repo).parts
            if any(part in SKIP_DIRS for part in rel_parts):
                continue
            if any(tuple(rel_parts[: len(prefix)]) == prefix for prefix in SKIP_PREFIXES):
                continue
            files.append(path)
    return files


def is_test_entry(rel_path: str, node: ast.AST) -> bool:
    """测试入口：由 unittest/pytest 发现机制调用，静态引用数为 0 属正常。"""
    name = Path(rel_path).name
    if name.startswith("test_") or "/tests/" in f"/{rel_path}" or name.endswith("_test.py"):
        return True
    if isinstance(node, ast.ClassDef):
        for base in node.bases:
            if _unparse(base).split(".")[-1] in {"TestCase", "IsolatedAsyncioTestCase", "AsyncTestCase"}:
                return True
    return False


def first_doc_line(node: ast.AST) -> str:
    if not isinstance(node, DEF_TYPES):
        return ""
    doc = ast.get_docstring(node, clean=True)
    if not doc:
        return ""
    for line in doc.splitlines():
        line = line.strip()
        if line:
            return line[:120]
    return ""


def is_type_checking(test: ast.expr) -> bool:
    if isinstance(test, ast.Name):
        return test.id == "TYPE_CHECKING"
    if isinstance(test, ast.Attribute):
        return test.attr == "TYPE_CHECKING"
    return False


def collect_refs(tree: ast.AST) -> tuple[Counter[str], set[str], set[str]]:
    """收集全局标识符引用、字符串常量、动态取名的字符串参数。"""
    refs: Counter[str] = Counter()
    strings: set[str] = set()
    dynamic_names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            refs[node.id] += 1
        elif isinstance(node, ast.Attribute):
            refs[node.attr] += 1
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            strings.add(node.value)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                refs[alias.name] += 1
        elif isinstance(node, ast.Import):
            for alias in node.names:
                refs[alias.name] += 1
                refs[alias.name.rsplit(".", 1)[-1]] += 1
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                fname = func.id
            elif isinstance(func, ast.Attribute):
                fname = func.attr
            else:
                fname = ""
            if fname in DYNAMIC_CALLS:
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        dynamic_names.add(arg.value)
    return refs, strings, dynamic_names


def normalize(node: ast.AST | list, depth: int = 0) -> str:
    """结构归一化：丢弃标识符与字面量值，保留控制流/运算形状。"""
    if depth > 40:
        return "…"
    if node is None:
        return "None"
    if isinstance(node, str):
        return "str"
    if isinstance(node, list):
        return "[" + ",".join(normalize(item, depth + 1) for item in node) + "]"
    if isinstance(node, ast.Name):
        return "Name"
    if isinstance(node, ast.arg):
        return "Arg"
    if isinstance(node, ast.Constant):
        return f"Const({type(node.value).__name__})"
    if isinstance(node, ast.Attribute):
        return f"Attr[{normalize(node.value, depth + 1)}]"
    if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
        return f"Def[{normalize(node.body, depth + 1)}]"
    if isinstance(node, ast.ClassDef):
        return f"Class[{normalize(node.body, depth + 1)}]"
    parts = [type(node).__name__]
    for field_name in node._fields:
        value = getattr(node, field_name, None)
        if isinstance(value, ast.AST | list) and value is not None:
            parts.append(normalize(value, depth + 1))
        elif isinstance(value, int | bool | type(None)):
            parts.append(f"{field_name}={value!r}")
    return " ".join(parts)


def node_count(node: ast.AST) -> int:
    return sum(1 for _ in ast.walk(node))


def finding(
    *,
    type_: str,
    path: str,
    line_start: int,
    line_end: int,
    symbol: str,
    evidence: str,
    impact: str,
    action: str,
    manual: bool,
    extra: dict | None = None,
    labels: list[str] | None = None,
) -> dict:
    return {
        "type": type_,
        "labels": labels or [type_],
        "path": path,
        "line_start": line_start,
        "line_end": line_end,
        "symbol": symbol,
        "evidence": evidence,
        "impact": impact,
        "action": action,
        "manual": manual,
        "dynamic_risk": [],
        "meta": extra or {},
    }


def statement_blocks(node: ast.AST) -> list[list[ast.stmt]]:
    """返回某节点直接拥有的语句列表（跳过 TYPE_CHECKING 块）。"""
    if isinstance(node, (ast.Module, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)):
        return [node.body]
    if isinstance(node, ast.If):
        if is_type_checking(node.test):
            return [node.orelse] if node.orelse else []
        return [node.body, node.orelse] if node.orelse else [node.body]
    if isinstance(node, ast.For | ast.AsyncFor | ast.While):
        return [node.body, node.orelse] if node.orelse else [node.body]
    if isinstance(node, ast.With | ast.AsyncWith):
        return [node.body]
    if isinstance(node, ast.Try | ast.TryStar):
        blocks = [node.body, node.orelse, node.finalbody]
        blocks.extend(handler.body for handler in node.handlers)
        return blocks
    if isinstance(node, ast.Match):
        return [case.body for case in node.cases]
    return []


def scan_unreachable(rel_path: str, tree: ast.AST) -> list[dict]:
    findings: list[dict] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and isinstance(node.test, ast.Constant) and node.test.value is False:
            findings.append(
                finding(
                    type_="invalid-unreachable",
                    path=rel_path,
                    line_start=node.lineno,
                    line_end=getattr(node, "end_lineno", node.lineno),
                    symbol="if False:",
                    evidence="恒假分支，运行时永不执行",
                    impact="块内语句不可达；若为调试残留可删除",
                    action="manual-confirm",
                    manual=True,
                )
            )
        for block in statement_blocks(node):
            terminated_at: int | None = None
            for stmt in block:
                if terminated_at is not None:
                    findings.append(
                        finding(
                            type_="invalid-unreachable",
                            path=rel_path,
                            line_start=stmt.lineno,
                            line_end=getattr(stmt, "end_lineno", stmt.lineno),
                            symbol=f"unreachable:{type(stmt).__name__}",
                            evidence=f"第 {terminated_at} 行终止语句之后仍存在语句（同一语句块）",
                            impact="永不执行，属于无效代码",
                            action="remove",
                            manual=False,
                        )
                    )
                    terminated_at = None
                    continue
                if isinstance(stmt, TERMINATORS):
                    terminated_at = stmt.lineno
    return findings


def module_const_sizes(tree: ast.Module) -> dict[str, int]:
    """模块级字面量常量：名字 -> 元素个数，用于判定循环上界是否为编译期常量。"""
    sizes: dict[str, int] = {}
    for node in tree.body:
        targets: list[str] = []
        value: ast.expr | None = None
        if isinstance(node, ast.Assign):
            targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
            value = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            targets = [node.target.id]
            value = node.value
        if value is None:
            continue
        if isinstance(value, ast.Tuple | ast.List | ast.Set):
            for name in targets:
                sizes[name] = len(value.elts)
        elif isinstance(value, ast.Dict):
            for name in targets:
                sizes[name] = len(value.keys)
    return sizes


def _unparse(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return type(node).__name__


def _iter_evidence(node: ast.AST) -> str:
    text = " ".join(_unparse(node).split())
    return text[:72]


def _is_bounded_iter(node: ast.AST, consts: dict[str, int]) -> bool:
    """迭代源是否为编译期/结构上的小集合（而非数据或请求规模）。"""
    if isinstance(node, ast.Tuple | ast.List | ast.Set | ast.Dict):
        return True
    if isinstance(node, ast.Constant) and isinstance(node.value, str | bytes):
        return True
    if isinstance(node, ast.Name) and node.id in consts:
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
        return all(isinstance(arg, ast.Constant) and isinstance(arg.value, int) for arg in node.args)
    # 结构枚举：AST 子节点、已取回的对象的字段/下标，单层遍历即是 O(子节点数)。
    return isinstance(node, ast.Attribute | ast.Subscript)


def _calls_in_expr(expr: ast.AST) -> list[tuple[int, str]]:
    hits: list[tuple[int, str]] = []
    for node in ast.walk(expr):
        if isinstance(node, ast.Call):
            segment = _unparse(node.func)
            if segment and any(marker in f"{segment}(" for marker in DB_MARKERS):
                hits.append((node.lineno, segment))
    return sorted(hits)


def _loop_source(loop: ast.AST) -> ast.AST:
    """For/AsyncFor 用 iter，While 用 test 作为迭代源描述。"""
    source = getattr(loop, "iter", None)
    if source is not None:
        return source
    return getattr(loop, "test", ast.Constant(value=None))


def _calls_in_loop(loop: ast.AST) -> list[tuple[int, str]]:
    """只统计本层循环体（不含内层循环，内层会单独报告），避免重复计数。"""
    hits: list[tuple[int, str]] = []
    stack: list[ast.AST] = [*getattr(loop, "body", []), *getattr(loop, "orelse", [])]
    while stack:
        node = stack.pop()
        if node is not loop and isinstance(node, ast.For | ast.AsyncFor | ast.While):
            continue
        if isinstance(node, ast.Call):
            segment = _unparse(node.func)
            if segment and any(marker in f"{segment}(" for marker in DB_MARKERS):
                hits.append((node.lineno, segment))
        stack.extend(ast.iter_child_nodes(node))
    return sorted(hits)


def scan_loops(rel_path: str, tree: ast.AST, threshold_depth: int = 3) -> list[dict]:
    """低效候选：循环体内 DB/IO 调用、深层嵌套循环。

    判定尽量给出可复核的规模证据：记录每层迭代源、常量上界、
    并以「非恒定迭代因子的乘积」表达复杂度，而不是简单写 O(n^depth)。
    """
    findings: list[dict] = []
    consts = module_const_sizes(tree) if isinstance(tree, ast.Module) else {}
    one_shot = rel_path.startswith(("ops/", "homeos/frontend/scripts/", "scripts/"))

    def visit(node: ast.AST, chain: list[ast.AST]) -> None:
        is_loop = isinstance(node, ast.For | ast.AsyncFor | ast.While)
        next_chain = [*chain, node] if is_loop else chain
        if is_loop:
            depth = len(next_chain)
            iterators = [f"{type(inner).__name__}({_iter_evidence(_loop_source(inner))})" for inner in next_chain]
            unbounded = [inner for inner in next_chain if not _is_bounded_iter(_loop_source(inner), consts)]
            if len(unbounded) >= 2:
                complexity = "O(" + " × ".join(f"n{index + 1}" for index in range(len(unbounded))) + ")"
            else:
                complexity = "O(n)"
            hits = _calls_in_loop(node)
            source_hits = _calls_in_expr(_loop_source(node))
            if not hits and source_hits:
                findings.append(
                    finding(
                        type_="inefficient",
                        path=rel_path,
                        line_start=node.lineno,
                        line_end=getattr(node, "end_lineno", node.lineno),
                        symbol=f"single-query@depth{depth}",
                        evidence=(
                            f"DB 调用仅出现在循环迭代源：`{source_hits[0][1]}`（第 {source_hits[0][0]} 行）；"
                            "循环体无额外 DB/ORM 调用"
                        ),
                        impact="单条查询的游标式遍历，不是 N+1；仅当迭代源被多次物化时才需复核",
                        action="keep-single-query",
                        manual=False,
                        extra={"loop_depth": depth, "scope": "one-shot" if one_shot else "app"},
                    )
                )
            if hits:
                findings.append(
                    finding(
                        type_="inefficient",
                        path=rel_path,
                        line_start=node.lineno,
                        line_end=getattr(node, "end_lineno", node.lineno),
                        symbol=f"{type(node).__name__}@depth{depth}",
                        evidence=(
                            f"循环体内 {len(hits)} 处 DB/ORM 调用；首个：`{hits[0][1]}`（第 {hits[0][0]} 行）；"
                            f"迭代链：{' → '.join(iterators)}"
                        ),
                        impact=(
                            f"最坏 {complexity} 次往返；"
                            + ("一次性运维/性能脚本，单次执行" if one_shot else "若循环规模随请求/数据增长将形成 N+1 查询")
                        ),
                        action="manual-confirm",
                        manual=True,
                        extra={
                            "db_calls": len(hits),
                            "loop_depth": depth,
                            "iterators": iterators,
                            "complexity": complexity,
                            "scope": "one-shot" if one_shot else "app",
                        },
                    )
                )
            if depth >= threshold_depth:
                bounded_chain = all(_is_bounded_iter(_loop_source(inner), consts) for inner in next_chain)
                structural = all(
                    isinstance(_loop_source(inner), ast.Attribute | ast.Subscript) for inner in next_chain[1:]
                ) if len(next_chain) > 1 else False
                if bounded_chain:
                    action, manual, note = "keep-bounded", False, "迭代源均为常量/结构枚举，规模有编译期上界"
                elif structural or one_shot:
                    action, manual, note = "keep-one-shot", False, "外层为单次遍历，内层仅结构枚举，无嵌套 IO"
                else:
                    action, manual, note = "manual-confirm", True, "嵌套深度大且迭代源来自数据，需人工确认是否热点路径"
                findings.append(
                    finding(
                        type_="inefficient",
                        path=rel_path,
                        line_start=node.lineno,
                        line_end=getattr(node, "end_lineno", node.lineno),
                        symbol=f"nested-loop@depth{depth}",
                        evidence=f"嵌套循环深度 {depth}，{complexity}；{note}；迭代链：{' → '.join(iterators)}",
                        impact=f"数据量放大时 CPU 成本按 {complexity} 增长；"
                        + ("一次性脚本，不在请求路径" if one_shot else "需确认是否位于请求热点路径"),
                        action=action,
                        manual=manual,
                        extra={
                            "loop_depth": depth,
                            "iterators": iterators,
                            "complexity": complexity,
                            "bounded": bounded_chain,
                            "scope": "one-shot" if one_shot else "app",
                        },
                    )
                )
        for child in ast.iter_child_nodes(node):
            visit(child, next_chain)

    visit(tree, [])
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--out", default="")
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    files = iter_py_files(repo)
    if not files:
        sys.stderr.write("no python files found\n")
        return 1

    trees: dict[str, ast.Module] = {}
    sources: dict[str, str] = {}
    parse_errors: list[str] = []
    refs_global: Counter[str] = Counter()
    strings_global: set[str] = set()
    dynamic_global: set[str] = set()
    all_exports: set[str] = set()
    per_file_refs: dict[str, Counter[str]] = {}

    for path in files:
        rel_path = path.relative_to(repo).as_posix()
        source = path.read_text(encoding="utf-8", errors="replace")
        sources[rel_path] = source
        try:
            tree = ast.parse(source, filename=rel_path)
        except SyntaxError as exc:
            parse_errors.append(f"{rel_path}: {exc}")
            continue
        trees[rel_path] = tree
        refs, strings, dynamic_names = collect_refs(tree)
        per_file_refs[rel_path] = refs
        refs_global.update(refs)
        strings_global.update(strings)
        dynamic_global.update(dynamic_names)
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "__all__":
                        exports = node.value
                        if isinstance(exports, ast.List | ast.Tuple):
                            all_exports.update(
                                elt.value
                                for elt in exports.elts
                                if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                            )

    all_strings = "\n".join(strings_global)
    findings: list[dict] = []
    skipped_test_entries: list[str] = []

    for rel_path, tree in trees.items():
        for node in tree.body:
            if not isinstance(node, DEF_TYPES):
                continue
            name = node.name
            if name.startswith("__"):
                continue
            if is_test_entry(rel_path, node):
                skipped_test_entries.append(f"{rel_path}:{node.lineno} {name}")
                continue
            if node.decorator_list or name in all_exports or name in dynamic_global:
                continue
            in_module = per_file_refs.get(rel_path, Counter())[name]
            total = refs_global[name]
            if total > 0:
                continue
            string_hit = name in strings_global or bool(re.search(rf"\b{re.escape(name)}\b", all_strings))
            risk: list[str] = []
            if string_hit:
                risk.append("名称命中字符串常量（可能被反射/注册表/配置驱动调用）")
            if name in dynamic_global:
                risk.append("名称作为 getattr/import_module 参数出现")
            private = name.startswith("_")
            action = "remove" if private and not risk else "manual-confirm"
            findings.append(
                finding(
                    type_="dead",
                    path=rel_path,
                    line_start=node.lineno,
                    line_end=getattr(node, "end_lineno", node.lineno),
                    symbol=f"{'class' if isinstance(node, ast.ClassDef) else 'def'} {name}",
                    evidence=f"全仓 {len(trees)} 个 Python 模块内 0 处引用（本模块 {in_module}）",
                    impact=("模块内私有辅助，无调用点" if private else "模块级公共符号，无调用点；可能为外部 API")
                    + ("；存在动态引用风险" if risk else ""),
                    action=action,
                    manual=bool(risk) or not private,
                    extra={"docstring": first_doc_line(node), "dynamic_risk": risk},
                )
            )

    for rel_path, tree in trees.items():
        findings.extend(scan_unreachable(rel_path, tree))
        findings.extend(scan_loops(rel_path, tree))

    # 重复实现：结构归一化完全一致，且规模达到阈值
    groups: dict[str, list[tuple[str, ast.FunctionDef | ast.AsyncFunctionDef]]] = {}
    for rel_path, tree in trees.items():
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            lines = getattr(node, "end_lineno", node.lineno) - node.lineno + 1
            if len(node.body) < 4 or lines < 10 or node_count(node) < 45:
                continue
            key = normalize(ast.Module(body=node.body, type_ignores=[]))
            groups.setdefault(key, []).append((rel_path, node))

    for members in groups.values():
        if len(members) < 2:
            continue
        locations = "、".join(f"{p}:{n.lineno}-{n.end_lineno}" for p, n in members)
        for rel_path, node in members:
            findings.append(
                finding(
                    type_="duplicate",
                    path=rel_path,
                    line_start=node.lineno,
                    line_end=getattr(node, "end_lineno", node.lineno),
                    symbol=f"def {node.name}",
                    evidence=f"与另外 {len(members) - 1} 处函数结构归一化后完全一致：{locations}",
                    impact=f"重复实现共 {len(members)} 处；任一处修复需同步其余位置",
                    action="extract-helper",
                    manual=False,
                    extra={"group_size": len(members), "group_locations": locations},
                )
            )

    findings.sort(key=lambda item: (item["path"], item["line_start"], item["symbol"]))
    payload = {
        "analyzer": "analyze_py.py",
        "files": len(files),
        "parsed": len(trees),
        "parseErrors": parse_errors,
        "findings": findings,
        "stats": {
            "definitions": sum(1 for tree in trees.values() for n in tree.body if isinstance(n, DEF_TYPES)),
            "byType": dict(Counter(item["type"] for item in findings)),
            "testEntriesSkipped": len(skipped_test_entries),
        },
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    else:
        sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
