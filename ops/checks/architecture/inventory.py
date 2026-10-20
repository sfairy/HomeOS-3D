#!/usr/bin/env python3
"""主项目模块化分析盘点（只读）。

扫描 homeos 后端/前端源码，输出模块规模、职责输入与模块间依赖边，
供 docs/architecture 报告引用。纯标准库实现，不导入被分析代码。

用法：
    .venv-store/bin/python ops/checks/architecture/inventory.py --out-dir docs/architecture/2026-10-20/data/before
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import posixpath
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_SRC = REPO_ROOT / "homeos" / "backend" / "src"
FRONTEND_SRC = REPO_ROOT / "homeos" / "frontend" / "src"

BACKEND_TOP = {"api", "domains", "platform", "modules", "bootstrap", "realtime", "panel"}
FRONTEND_LAYERS = {
    "assets",
    "components",
    "composables",
    "directives",
    "features",
    "layouts",
    "router",
    "services",
    "shared",
    "stores",
    "studio",
    "styles",
    "views",
    "workers",
}
ROUTE_DECORATORS = {"get", "post", "put", "patch", "delete", "websocket", "api_route"}
SKIP_DIRS = {"__pycache__", "node_modules", ".venv-store", "dist"}
TS_IMPORT_RE = re.compile(
    r"""(?:^|[;\s])import\s+(?P<clause>[^'"]*?)\s*from\s*['"](?P<spec>[^'"]+)['"]"""
    r"""|(?:^|[;\s])import\s*['"](?P<side_spec>[^'"]+)['"]"""
    r"""|(?:^|[;\s])export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"](?P<export_spec>[^'"]+)['"]"""
    r"""|import\(\s*['"](?P<dynamic_spec>[^'"]+)['"]\s*\)""",
    re.MULTILINE,
)


def _iter_files(root: Path, suffixes: set[str]) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in suffixes:
            files.append(path)
    return sorted(files)


def backend_module_for(rel: str) -> str:
    """把相对 src 的路径归到报告中的后端模块粒度。"""
    parts = Path(rel).parts
    if not parts:
        return "root"
    top = parts[0]
    if top not in BACKEND_TOP:
        return "root"
    if top == "api":
        if len(parts) >= 2 and parts[1] == "system":
            return "api.system"
        if len(parts) >= 2 and parts[1] == "schemas":
            return "api.schemas"
        if len(parts) >= 2 and parts[1] == "__init__.py":
            return "api"
        if len(parts) >= 2 and parts[1].endswith(".py"):
            return f"api.{Path(parts[1]).stem}"
        return "api"
    if top == "domains":
        return f"domains.{parts[1]}" if len(parts) >= 2 else "domains"
    if top == "modules":
        return f"modules.{parts[1]}" if len(parts) >= 2 else "modules"
    if top == "platform":
        return f"platform.{parts[1]}" if len(parts) >= 2 else "platform"
    return top


def backend_module_for_dotted(dotted: str) -> str:
    dotted = dotted.removeprefix("src.").removeprefix("homeos.backend.src.")
    parts = dotted.split(".")
    if parts and parts[0] == "src":
        parts = parts[1:]
    if not parts:
        return "root"
    if parts[0] == "api":
        if len(parts) > 1 and parts[1] == "system":
            return "api.system"
        if len(parts) > 1 and parts[1] == "schemas":
            return "api.schemas"
        return f"api.{parts[1]}" if len(parts) > 1 else "api"
    if parts[0] in {"domains", "modules", "platform"}:
        return ".".join(parts[:2]) if len(parts) > 1 else parts[0]
    return parts[0]


def frontend_module_for(rel: str) -> str:
    """把相对 src 的路径归到报告中的前端模块粒度。"""
    parts = Path(rel).parts
    if not parts:
        return "root"
    top = parts[0]
    if top in {"features", "shared"}:
        return f"{top}.{parts[1]}" if len(parts) >= 2 else top
    if top == "studio":
        if len(parts) >= 3 and parts[1] == "app":
            return f"studio.app.{parts[2]}"
        if len(parts) >= 2:
            return f"studio.{parts[1]}"
        return "studio"
    if top in {"components", "composables"}:
        return f"{top}.{parts[1]}" if len(parts) >= 2 else top
    if top == "views":
        return f"views.{Path(parts[1]).stem}" if len(parts) >= 2 else "views"
    if top in FRONTEND_LAYERS:
        return top
    return "root"


def python_module_name(rel: str) -> str:
    rel_path = Path(rel)
    parts = list(rel_path.with_suffix("").parts)
    if parts and parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def resolve_python_import(rel: str, level: int, module: str | None) -> str:
    """解析相对 import：level=1 表示当前包。"""
    if level <= 0:
        return (module or "").removeprefix("src.")
    package = python_module_name(rel).split(".")
    if package and Path(rel).name != "__init__.py":
        package = package[:-1]
    keep = len(package) - (level - 1)
    base = package[:keep] if keep > 0 else []
    if module:
        base = base + module.split(".")
    return ".".join(part for part in base if part)


def _route_count(tree: ast.AST) -> int:
    count = 0
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            target = decorator.func if isinstance(decorator, ast.Call) else decorator
            if isinstance(target, ast.Attribute) and target.attr in ROUTE_DECORATORS:
                count += 1
    return count


def scan_backend() -> tuple[list[dict], Counter]:
    stats: dict[str, dict] = defaultdict(
        lambda: {"files": 0, "lines": 0, "classes": 0, "functions": 0, "routes": 0}
    )
    edges: Counter = Counter()
    for path in _iter_files(BACKEND_SRC, {".py"}):
        rel = path.relative_to(BACKEND_SRC).as_posix()
        module = backend_module_for(rel)
        try:
            text = path.read_text(encoding="utf-8")
            tree = ast.parse(text, filename=str(path))
        except (SyntaxError, UnicodeDecodeError):
            continue
        row = stats[module]
        row["files"] += 1
        row["lines"] += len(text.splitlines())
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                row["classes"] += 1
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                row["functions"] += 1
        row["routes"] += _route_count(tree)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    target = backend_module_for_dotted(alias.name)
                    if target != module:
                        edges[(module, target, "py")] += 1
            elif isinstance(node, ast.ImportFrom):
                target = backend_module_for_dotted(
                    resolve_python_import(rel, node.level, node.module)
                )
                if target != module:
                    edges[(module, target, "py")] += 1
    rows = []
    for module in sorted(stats):
        data = stats[module]
        rows.append({"module": module, "kind": module.split(".")[0], **data})
    return rows, edges


def _resolve_ts_target(importer_rel: str, spec: str) -> str | None:
    spec = spec.split("?", 1)[0].strip()
    if not spec:
        return None
    if spec.startswith("@/"):
        target = spec[2:]
    elif spec.startswith("@app/"):
        target = "studio/app/" + spec[len("@app/") :]
    elif spec.startswith("@runtime/"):
        target = "studio/runtime/" + spec[len("@runtime/") :]
    elif spec.startswith("."):
        target = posixpath.normpath(posixpath.join(posixpath.dirname(importer_rel), spec))
        if target.startswith("../"):
            return None
    else:
        return None
    target = target.lstrip("/")
    # 目录导入按其入口文件归并；模块粒度只看目录本身。
    return target.rstrip("/") or None


def _extract_import_specs(text: str) -> list[str]:
    specs: list[str] = []
    for match in TS_IMPORT_RE.finditer(text):
        spec = (
            match.group("spec")
            or match.group("side_spec")
            or match.group("export_spec")
            or match.group("dynamic_spec")
        )
        if spec:
            specs.append(spec)
    return specs


def scan_frontend() -> tuple[list[dict], Counter]:
    stats: dict[str, dict] = defaultdict(
        lambda: {"files": 0, "lines": 0, "classes": 0, "functions": 0, "routes": 0}
    )
    edges: Counter = Counter()
    for path in _iter_files(FRONTEND_SRC, {".ts", ".vue", ".mjs", ".js"}):
        rel = path.relative_to(FRONTEND_SRC).as_posix()
        module = frontend_module_for(rel)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        row = stats[module]
        row["files"] += 1
        row["lines"] += len(text.splitlines())
        # 轻量统计：Vue/TS 不做 AST，只统计脚本内函数/类声明。
        row["functions"] += len(re.findall(r"\bfunction\s+\w+|\b(?:const|let)\s+\w+\s*=\s*\(", text))
        row["classes"] += len(re.findall(r"\bclass\s+\w+", text))
        for spec in _extract_import_specs(text):
            target_path = _resolve_ts_target(rel, spec)
            if not target_path:
                continue
            target = frontend_module_for(target_path)
            if target != module:
                edges[(module, target, "ts")] += 1
    rows = []
    for module in sorted(stats):
        data = stats[module]
        rows.append({"module": module, "kind": module.split(".")[0], **data})
    return rows, edges


def _write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True, help="输出目录")
    args = parser.parse_args()
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = REPO_ROOT / out_dir

    backend_rows, backend_edges = scan_backend()
    frontend_rows, frontend_edges = scan_frontend()

    backend_in = Counter()
    backend_out = Counter()
    for (src, dst, _kind), count in backend_edges.items():
        backend_out[src] += count
        backend_in[dst] += count
    for row in backend_rows:
        row["out_edges"] = backend_out[row["module"]]
        row["in_edges"] = backend_in[row["module"]]

    frontend_in = Counter()
    frontend_out = Counter()
    for (src, dst, _kind), count in frontend_edges.items():
        frontend_out[src] += count
        frontend_in[dst] += count
    for row in frontend_rows:
        row["out_edges"] = frontend_out[row["module"]]
        row["in_edges"] = frontend_in[row["module"]]

    fields = [
        "module",
        "kind",
        "files",
        "lines",
        "classes",
        "functions",
        "routes",
        "in_edges",
        "out_edges",
    ]
    _write_csv(out_dir / "backend-modules.csv", backend_rows, fields)
    _write_csv(out_dir / "frontend-modules.csv", frontend_rows, fields)
    all_edges = [
        {"from_module": src, "to_module": dst, "kind": kind, "count": count}
        for (src, dst, kind), count in sorted(
            {**backend_edges, **frontend_edges}.items(), key=lambda item: (-item[1], item[0])
        )
    ]
    _write_csv(
        out_dir / "dependency-edges.csv",
        all_edges,
        ["from_module", "to_module", "kind", "count"],
    )
    summary = {
        "backend_modules": len(backend_rows),
        "backend_files": sum(row["files"] for row in backend_rows),
        "backend_lines": sum(row["lines"] for row in backend_rows),
        "frontend_modules": len(frontend_rows),
        "frontend_files": sum(row["files"] for row in frontend_rows),
        "frontend_lines": sum(row["lines"] for row in frontend_rows),
        "dependency_edges": len(all_edges),
    }
    (out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
