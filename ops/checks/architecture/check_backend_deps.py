#!/usr/bin/env python3
"""后端依赖方向门禁（只读）。

把 `homeos/backend/src/README.md` 里用自然语言写的依赖方向约定，变成可执行的检查。
前端同样的约定有两道门禁（ESLint `no-restricted-imports` + `ops/checks/frontend/check_frontend_deps.mjs`），
后端此前一道都没有 —— 本脚本补上这个缺口。

五条规则（B1/B2/B3 取自 README「依赖方向（约定）」一节；B4/B5 是结构不变量）：

    B1 platform→upper : `platform/**` 是叶子基础设施，不得 import
                        api / domains / modules / bootstrap / panel / realtime
    B2 lower→api      : `domains/**` `modules/**` `panel/**` `realtime/**` 不得 import `api/**`
                        （`bootstrap → 全部` 是 README 明确允许的装配方向，故不列 bootstrap）
    B3 absolute-src   : 禁止绝对 `from src.…` / `import src.…`
                        （容器构建期 Cython 烤成 .so 后，`import app.app` 会炸）
    B4 package-cycle  : 包级强连通分量必须落在白名单里。包级互依本身不是运行时环
                        （A 包某文件 → B 包，B 包另一文件 → A 包，文件级仍然无环），
                        但它会让「谁该依赖谁」变得说不清，所以白名单化、新增即失败。
    B5 file-cycle     : 文件级强连通分量必须为空。这才是真实的 import 环 ——
                        环内两个模块互相 import，任何一方都无法先完成初始化。

多项目：`--project homeos|store|all`（默认 all）。`homeos-store` 的 README 尚未写依赖方向，
因此它的 profile 不设 B1/B2（不臆造规则），只跑 B3 与 B4/B5 —— 结构不变量与具体约定无关。

用法：
    # 只报告（默认，退出码 0）
    node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py

    # CI 门禁（有违规时退出码 1）
    node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --check

    # 指定项目 / 目录 / 机器可读
    node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --project store
    node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --root /tmp/fixture
    node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --json

纯标准库 + `ast` 解析，不导入被分析的代码，因此不影响运行时。
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

#: 后端顶层包（与 `inventory.py` 的 BACKEND_TOP 保持一致）。
BACKEND_TOP = frozenset({"api", "domains", "platform", "modules", "bootstrap", "realtime", "panel"})

#: B4 白名单：允许互相依赖的包级强连通分量。新增一处就必须显式加到这里 ——
#: 这正是门禁的价值：让「又长出一条回边」变成需要评审的动作，而不是悄悄发生。
#:
#: 现状（2026-10-26 盘查）：5 个分量、13 个包。其中 `domains.client_power / ha / logs /
#: proxy / security` 是 5 元环（不存在任何两条互反边，逐对看很容易漏掉）。
HOMEOS_PACKAGE_WHITELIST: frozenset[frozenset[str]] = frozenset(
    {
        frozenset({"platform.core", "platform.security"}),
        frozenset({"domains.client_power", "domains.ha", "domains.logs", "domains.proxy", "domains.security"}),
        frozenset({"domains.earthquake", "domains.notification"}),
        frozenset({"domains.agent", "domains.channels"}),
        frozenset({"domains.studio3d", "modules.interaction3d"}),
    }
)

SKIP_DIRS = {"__pycache__", "node_modules", ".venv-store", "dist", "backups"}


@dataclass(frozen=True)
class Profile:
    """一个后端项目的分层约定。规则为空即「该项目暂无此约定」，不是「永远通过」。"""

    name: str
    root: Path
    top: frozenset[str]
    #: 叶子层：不得向上依赖（B1 的导入方）。
    leaf_layers: frozenset[str] = frozenset()
    #: 受 B2 约束的下层导入方。
    lower_layers: frozenset[str] = frozenset()
    #: B2 的禁止目标。
    forbidden_targets: frozenset[str] = frozenset({"api"})
    #: B4 白名单。
    package_whitelist: frozenset[frozenset[str]] = frozenset()
    #: B4 的包粒度：这些顶层包取 2 段（`domains.ha` / `platform.core`），其余取 1 段。
    #: 与 `inventory.py` 的 `backend_module_for` 同口径 —— 否则报告与门禁会对不上。
    two_level: frozenset[str] = frozenset({"domains", "modules", "platform", "api"})


HOMEOS = Profile(
    name="homeos",
    root=REPO_ROOT / "homeos" / "backend" / "src",
    top=BACKEND_TOP,
    leaf_layers=frozenset({"platform"}),
    lower_layers=frozenset({"domains", "modules", "panel", "realtime"}),
    package_whitelist=HOMEOS_PACKAGE_WHITELIST,
)

#: `homeos-store` 后端：顶层是 api / commerce / core / licensing / ops / payments / security，
#: README 未声明依赖方向。只跑与约定无关的 B3/B4/B5，等它写出方向后再补 leaf_layers / lower_layers。
STORE = Profile(
    name="store",
    root=REPO_ROOT / "homeos-store" / "backend" / "src",
    top=frozenset({"api", "commerce", "core", "licensing", "ops", "payments", "security"}),
    two_level=frozenset(),
    # `homeos-store` 的 README 没有声明依赖方向，所以这里不设 B1/B2（不臆造规则），
    # 只把 B4 的现状冻结住：5 个平铺包已经是强连通（文件级仍无环），
    # 允许它维持现状，但不允许再多出新的包级环。等 README 写出方向后再降级为白名单清空。
    package_whitelist=frozenset({frozenset({"commerce", "core", "ops", "payments", "security"})}),
)

PROFILES = {profile.name: profile for profile in (HOMEOS, STORE)}


@dataclass(frozen=True)
class Violation:
    """一条违规。`line` 指向触发违规的那行 import；环类违规的 `line` 为 0。"""

    rule: str
    path: str
    line: int
    importer: str
    target: str

    def as_dict(self) -> dict[str, object]:
        return {
            "rule": self.rule,
            "path": self.path,
            "line": self.line,
            "importer": self.importer,
            "target": self.target,
        }


def iter_python_files(root: Path) -> list[Path]:
    """按路径排序枚举源码文件，保证输出稳定（便于 diff 与快照比对）。"""
    files: list[Path] = []
    for path in root.rglob("*.py"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        files.append(path)
    return sorted(files)


def module_parts(rel: str) -> list[str]:
    """`domains/home_mode/actions.py` → `['domains', 'home_mode', 'actions']`。"""
    parts = rel.removesuffix(".py").split("/")
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return [part for part in parts if part]


def resolve_relative(parts: list[str], level: int, module: str | None, *, is_package: bool = False) -> list[str] | None:
    """解析 `from ...pkg.sub import x` 这类相对导入。

    Python 语义：`level=1` 指当前包，`level=n` 向上走 `n-1` 层。

    `parts` 来自 `module_parts`，`__init__.py` 已被抹成它所在的包名。因此对包文件
    「当前包」就是 `parts` 本身，对普通模块才是 `parts[:-1]` —— 少这一位会让
    `alerts/__init__.py` 里的 `from .channels import x` 解析成 `domains.channels`
    （少了一层 `alerts`），凭空造出一条错误的跨包边。

    越界（`from ...` 超出包根）返回 None —— 那是语法/打包错误，不是依赖方向问题。
    """
    if level <= 0:
        return [p for p in (module or "").split(".") if p]
    package = parts if is_package else parts[:-1]
    climb = level - 1
    if climb > len(package):
        return None
    base = package[: len(package) - climb]
    return base + [p for p in (module or "").split(".") if p]


def resolve_absolute(module: str | None) -> list[str] | None:
    """解析绝对导入：后端以 `src/` 为根时，`platform.core.x` 就是顶层包路径。"""
    if not module:
        return None
    return [p for p in module.split(".") if p]


def check_target(
    rel: str,
    importer_layer: str,
    lineno: int,
    target_layer: str,
    profile: Profile,
    out: list[Violation],
) -> None:
    """按规则表判定一条 `importer_layer → target_layer` 边。"""
    if target_layer not in profile.top or target_layer == importer_layer:
        return
    if importer_layer in profile.leaf_layers:
        out.append(Violation("B1 platform→upper", rel, lineno, importer_layer, target_layer))
    elif importer_layer in profile.lower_layers and target_layer in profile.forbidden_targets:
        out.append(Violation("B2 lower→api", rel, lineno, importer_layer, target_layer))


def check_file(path: Path, profile: Profile) -> list[Violation]:
    """检查单个文件的方向类违规（B1/B2/B3）。"""
    rel = path.relative_to(profile.root).as_posix()
    parts = module_parts(rel)
    if not parts or parts[0] not in profile.top:
        return []

    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
    except SyntaxError:
        # 语法错误由 compileall / ruff 负责，这里不重复报。
        return []

    importer_layer = parts[0]
    violations: list[Violation] = []
    is_package = rel.endswith("__init__.py")

    def target_of(node: ast.ImportFrom) -> list[str] | None:
        if node.level:
            return resolve_relative(parts, node.level, node.module, is_package=is_package)
        return resolve_absolute(node.module)

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if not node.level and node.module and (node.module == "src" or node.module.startswith("src.")):
                violations.append(Violation("B3 absolute-src", rel, node.lineno, importer_layer, node.module))
                continue
            target = target_of(node)
            if not target:
                continue
            check_target(rel, importer_layer, node.lineno, target[0], profile, violations)

        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "src" or alias.name.startswith("src."):
                    violations.append(Violation("B3 absolute-src", rel, node.lineno, importer_layer, alias.name))
                    continue
                check_target(rel, importer_layer, node.lineno, alias.name.split(".")[0], profile, violations)

    return violations


def collect_direction(root: Path, profile: Profile) -> list[Violation]:
    """扫描整棵树的方向类违规（B1/B2/B3）。"""
    violations: list[Violation] = []
    for path in iter_python_files(root):
        violations.extend(check_file(path, profile))
    return violations


def import_targets(rel: str, tree: ast.AST) -> list[list[str]]:
    """一条文件里的全部 import 目标（已解析成模块路径段，含相对导入）。"""
    parts = module_parts(rel)
    is_package = rel.endswith("__init__.py")
    targets: list[list[str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            resolved = (
                resolve_relative(parts, node.level, node.module, is_package=is_package)
                if node.level
                else resolve_absolute(node.module)
            )
            if not resolved:
                continue
            # `from a.b import c` 指向 `a/b/c.py` 或 `a.b` 本身，两种都记上。
            targets.append(resolved)
            targets.extend([*resolved, alias.name] for alias in node.names)
        elif isinstance(node, ast.Import):
            targets.extend(alias.name.split(".") for alias in node.names)
    return targets


def parsed_files(root: Path, profile: Profile) -> list[tuple[str, ast.AST]]:
    """枚举并解析项目内文件；语法错误交给 compileall / ruff，这里跳过。"""
    parsed: list[tuple[str, ast.AST]] = []
    for path in iter_python_files(root):
        rel = path.relative_to(root).as_posix()
        parts = module_parts(rel)
        if not parts or parts[0] not in profile.top:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
        except SyntaxError:
            continue
        parsed.append((rel, tree))
    return parsed


def package_graph(root: Path, profile: Profile) -> dict[str, set[str]]:
    """包级依赖图（B4 用）。

    **不解析到文件**：`homeos` 后端大量目录是隐式命名空间包（没有 `__init__.py`），
    `from .. import channels` 这类写法解析到文件时会塌到最近的祖先包上，把不同包的边
    混成一个假枢纽。直接把 import 目标截到前 `package_depth` 段，与 `inventory.py`
    生成报告的口径一致，B4 的结论才能和结构报告对得上。
    """
    parsed = parsed_files(root, profile)
    known = {package_key(rel, profile) for rel, _ in parsed}
    graph: dict[str, set[str]] = {package: set() for package in known}
    for rel, tree in parsed:
        source = package_key(rel, profile)
        for target_parts in import_targets(rel, tree):
            if not target_parts:
                continue
            target = parts_to_package(target_parts, profile)
            if target != source and target in known:
                graph[source].add(target)
    return graph


def file_graph(root: Path, profile: Profile) -> dict[str, set[str]]:
    """文件级依赖图（B5 用）。

    只接受**精确命中**的模块名，不做「找不到就退回父包」的兜底 —— 那个兜底会把
    `from .. import channels` 记到 `domains` 上，凭空造出一个枢纽节点，让真正的环
    被掩盖。宁可漏记一条无法精确解析的边，也不要给出错误的 SCC。
    """
    parsed = parsed_files(root, profile)
    by_module = {".".join(module_parts(rel)): rel for rel, _ in parsed}
    graph: dict[str, set[str]] = {rel: set() for rel, _ in parsed}
    for rel, tree in parsed:
        for target_parts in import_targets(rel, tree):
            target = by_module.get(".".join(target_parts))
            if target and target != rel:
                graph[rel].add(target)
    return graph


def strongly_connected(graph: dict[str, set[str]]) -> list[list[str]]:
    """Tarjan SCC（显式栈，避免大仓库递归爆栈），只返回大小 >1 的分量。

    每条边只处理一次；从子节点返回时必须把 `low[child]` 回传给父节点 —— 少了这一步
    会把一个真实的多元环拆成若干「看起来是两两互依」的假象。
    """
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    result: list[list[str]] = []
    counter = 0

    for root in graph:
        if root in index:
            continue
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        frames: list[tuple[str, object]] = [(root, iter(sorted(graph.get(root, ()))))]
        while frames:
            node, children = frames[-1]  # type: ignore[assignment]
            descended = False
            for nxt in children:  # type: ignore[union-attr]
                if nxt not in index:
                    index[nxt] = low[nxt] = counter
                    counter += 1
                    stack.append(nxt)
                    on_stack.add(nxt)
                    frames.append((nxt, iter(sorted(graph.get(nxt, ())))))
                    descended = True
                    break
                if nxt in on_stack:
                    low[node] = min(low[node], index[nxt])
            if descended:
                continue
            if low[node] == index[node]:
                component: list[str] = []
                while True:
                    popped = stack.pop()
                    on_stack.discard(popped)
                    component.append(popped)
                    if popped == node:
                        break
                if len(component) > 1:
                    result.append(sorted(component))
            frames.pop()
            if frames:
                parent = frames[-1][0]
                low[parent] = min(low[parent], low[node])
    return sorted(result)


def package_key(rel: str, profile: Profile) -> str:
    """文件 → 包键。`two_level` 里的顶层包取 2 段，其余取 1 段。

    与 `inventory.py` 的 `backend_module_for` 同口径：`domains.ha` 是包，而
    `bootstrap` / `realtime` / `panel` 是平铺包（文件直接放在下面）。若对所有包都用
    「取前 2 段」，`bootstrap/router_registry.py` 会变成 `bootstrap.router_registry`，
    于是 `bootstrap → api.*` 的边全部消失、报告与门禁给出两套结果。
    """
    return parts_to_package(module_parts(rel), profile)


def parts_to_package(parts: list[str], profile: Profile) -> str:
    """模块路径段 → 包键。"""
    if not parts:
        return ""
    if parts[0] in profile.two_level and len(parts) > 1:
        return ".".join(parts[:2])
    return parts[0]


def collect_cycles(root: Path, profile: Profile) -> list[Violation]:
    """B4（包级白名单）+ B5（文件级必须无环）。"""
    violations: list[Violation] = []

    for component in strongly_connected(file_graph(root, profile)):
        violations.append(Violation("B5 file-cycle", component[0], 0, component[0], " ↔ ".join(component)))

    for component in strongly_connected(package_graph(root, profile)):
        group = frozenset(component)
        if group in profile.package_whitelist:
            continue
        violations.append(Violation("B4 package-cycle", component[0], 0, component[0], " ↔ ".join(component)))
    return violations


def collect(profile: Profile) -> list[Violation]:
    """扫描一个项目的全部规则。"""
    violations = collect_direction(profile.root, profile) + collect_cycles(profile.root, profile)
    return sorted(violations, key=lambda v: (v.rule, v.path, v.line, v.target))


def describe(item: Violation) -> str:
    """环类违规没有行号，单独一种格式；否则 `path:line [rule] a → b`。"""
    if item.rule.startswith(("B4", "B5")):
        return f"[{item.rule}] {item.target}"
    return f"{item.path}:{item.line} [{item.rule}] {item.importer} → {item.target}"


def resolve_profiles(args: argparse.Namespace) -> list[Profile]:
    """`--root`（单目录，沿用 homeos 规则，供测试用）优先于 `--project`。"""
    if args.root is not None:
        return [
            Profile(
                name="custom",
                root=args.root,
                top=HOMEOS.top,
                leaf_layers=HOMEOS.leaf_layers,
                lower_layers=HOMEOS.lower_layers,
                forbidden_targets=HOMEOS.forbidden_targets,
                package_whitelist=HOMEOS.package_whitelist,
            )
        ]
    if args.project == "all":
        return [PROFILES["homeos"], PROFILES["store"]]
    return [PROFILES[args.project]]


def main() -> int:
    parser = argparse.ArgumentParser(description="后端依赖方向门禁（B1–B5）")
    parser.add_argument("--check", action="store_true", help="有违规时以退出码 1 结束")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--project", choices=[*PROFILES, "all"], default="all", help="被扫描的项目")
    parser.add_argument("--root", type=Path, default=None, help="仅扫指定 src 根（单项目，测试用）")
    args = parser.parse_args()

    violations: list[Violation] = []
    missing: list[str] = []
    for profile in resolve_profiles(args):
        if not profile.root.is_dir():
            missing.append(f"{profile.name}: {profile.root}")
            continue
        violations.extend(collect(profile))

    for name in missing:
        print(f"check_backend_deps: 跳过不存在的源码树 {name}", file=sys.stderr)

    if args.json:
        print(json.dumps([v.as_dict() for v in violations], ensure_ascii=False, indent=2))
    else:
        for item in violations:
            print(describe(item))
        if violations:
            print(f"check_backend_deps: {len(violations)} violation(s)")
        else:
            print("check_backend_deps: 0 violation(s)")

    if args.check and violations:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
