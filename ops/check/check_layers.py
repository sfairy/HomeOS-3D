#!/usr/bin/env python3
"""后端分层门禁：**依赖方向只能向下**，且每一层能看见谁必须显式登记。

## 为什么需要它

本轮审计抓到三类「不该存在的 import」，它们全都没有任何门禁看得见：

1. ``domains → realtime`` / ``domains → panel``：域层为了拿「实体访问控制」「实体 id 语法」
   import 了入口层/编辑器层的模块 —— 依赖方向被反转（叶子反过来依赖调用者）。
2. ``modules → api``：3D 增量模块复用 ``api/ha.py`` 的路由处理函数（连 FastAPI 依赖注入
   签名一起复用），等于把 HTTP 入口当成业务库。
3. ``platform`` 反向依赖上层：平台叶子一旦 import 域，分包就彻底失去意义。

这类边的危害是**结构性的**：单看某一个文件都能跑，但依赖图一旦成环，任何一次拆包/搬运/
独立部署都会以「莫名循环导入」的形式爆掉，且爆点离肇事点很远。所以必须用门禁把它钉住。

## 口径

- 层 = ``backend/src`` 下的顶层包（``platform`` / ``realtime`` / ``panel`` / ``domains`` /
  ``modules`` / ``api`` / ``bootstrap``）。发现未登记的新顶层包即失败 —— 新增一层是
  **结构决策**，必须在本文件里显式登记并给出它允许看见谁。
- 用**白名单**而不是黑名单：只有「显式允许的边」才通过。新增一条跨层边 = 一次结构决策，
  必须改本文件（评审可见），而不是悄悄多一条 import。
- ``bootstrap`` 是组装根（composition root）：只有它可以 import 全部层，因为它存在的意义
  就是把所有部件接起来。
- 根级单文件模块（``config`` / ``schemas`` / ``dependencies`` / ``env`` / ``app`` / ``run``）
  单独判：``dependencies`` 是 FastAPI 依赖注入门面，只有入口层（``api`` / ``modules``）
  与组装根可以 import；域与平台叶子 import 它就是把 HTTP 语义渗进业务层。

判定逻辑由 ``ops/check/check_layers_selftest.py`` 用合成源码树反向压住（该红时必须红）。

用法::

    python3 ops/check/check_layers.py            # 门禁（CI 跑这条）
    python3 ops/check/check_layers.py --list     # 只打印每条实际存在的跨层边
    python3 ops/check/check_layers.py --root=<dir>   # 自检注入 fixture
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

# 复用共享遍历器：漏一个后缀就是一道静默变绿的门禁（JS 侧已经吃过这个亏）。
from ops.lib import scan

#: 后端源码根（相对仓库根）。
SRC_REL = Path("homeos") / "backend" / "src"

#: 全部层（``bootstrap`` 是组装根）。
LAYERS: tuple[str, ...] = ("platform", "realtime", "panel", "domains", "modules", "api", "bootstrap")

#: 层 → 允许它 import 的层（含自身）。白名单：没写在这里的边一律失败。
ALLOWED_LAYER_EDGES: dict[str, frozenset[str]] = {
    # 平台叶子：不许反向依赖任何上层（否则分包失去意义）。
    "platform": frozenset({"platform"}),
    "realtime": frozenset({"platform", "realtime"}),
    "panel": frozenset({"platform", "panel"}),
    # 域层：只能吃平台叶子（本轮的 domains→realtime / domains→panel 就是被这条拦下的）。
    "domains": frozenset({"platform", "domains"}),
    # 模块层：可以从域层与平台层拿能力，但**不能**反向依赖 api（原先的 modules→api）。
    "modules": frozenset({"platform", "domains", "modules"}),
    # 入口层：HTTP 路由可以向下用全部业务层。
    "api": frozenset({"platform", "realtime", "panel", "domains", "modules", "api"}),
    # 组装根：存在的意义就是接线，故允许全部。
    "bootstrap": frozenset(LAYERS),
}

#: 根级单文件模块（``src/<name>.py``）。
ROOT_MODULES: frozenset[str] = frozenset({"app", "config", "dependencies", "env", "run", "schemas"})

#: 层 → 允许 import 的根级模块。``dependencies``（FastAPI 依赖注入门面）只给入口层与组装根。
ALLOWED_ROOT_MODULE_EDGES: dict[str, frozenset[str]] = {
    "platform": frozenset({"config"}),
    "realtime": frozenset(),
    "panel": frozenset(),
    "domains": frozenset({"config"}),
    "modules": frozenset({"config", "dependencies", "schemas"}),
    "api": frozenset({"config", "dependencies", "env", "schemas"}),
    "bootstrap": ROOT_MODULES,
}

#: 遍历时跳过的顶层目录（``__pycache__`` 由 ``scan.SKIP_DIRS`` 兜住）。
_IGNORED_TOP_DIRS: frozenset[str] = frozenset({"__pycache__"})

#: ``from ...pkg.mod import name`` / ``import pkg.mod``：只取模块路径，不管导入名清单
#: （多行括号 import 的模块部分永远在同一行，故单行匹配即可）。
_FROM_RE = re.compile(r"^\s*from\s+(?P<dots>\.*)(?P<module>[A-Za-z_][\w.]*)?\s+import\b", re.MULTILINE)
_PLAIN_IMPORT_RE = re.compile(r"^[ \t]*import\s+(?P<module>[A-Za-z_][\w.]*)", re.MULTILINE)


class Violation:
    """一条越界 import：``source`` 层 import 了 ``target`` 层（``module`` 是解析出的路径）。"""

    def __init__(self, rel_path: str, line: int, source: str, target: str, module: str, rule: str) -> None:
        self.rel_path = rel_path
        self.line = line
        self.source = source
        self.target = target
        self.module = module
        self.rule = rule

    def render(self) -> str:
        return f"{self.rel_path}:{self.line}  {self.source} → {self.target}（`{self.module}`）· {self.rule}"


def parse_imports(text: str) -> list[tuple[int, int, str]]:
    """解析出 ``(行号, 相对点数, 模块路径)``。

    ``dots`` 为 0 表示绝对 import（按首段是不是已知层/根模块判断）。
    """
    found: list[tuple[int, int, str]] = []
    for match in _FROM_RE.finditer(text):
        dots = len(match.group("dots"))
        module = match.group("module") or ""
        line = text.count("\n", 0, match.start()) + 1
        found.append((line, dots, module))
    for match in _PLAIN_IMPORT_RE.finditer(text):
        line = text.count("\n", 0, match.start()) + 1
        found.append((line, 0, match.group("module")))
    return found


def resolve_module_parts(package_parts: tuple[str, ...], dots: int, module: str) -> tuple[str, ...] | None:
    """把 import 说明符解析成相对 ``src`` 的模块路径片段；``None`` = 无法解析（含越出源码根）。

    ``dots`` 个点表示「从当前包向上 ``dots - 1`` 层」再拼接模块路径
    （``from .x`` = 同级包内、``from ..x`` = 上一层）。
    """
    if dots == 0:
        return tuple(module.split(".")) if module else None
    up = dots - 1
    if up > len(package_parts):
        return None
    base = package_parts[: len(package_parts) - up]
    tail = tuple(module.split(".")) if module else ()
    if not base and not tail:
        return None
    return base + tail


def escapes_source_root(package_parts: tuple[str, ...], dots: int) -> bool:
    """点号数是否已越出源码根（``..`` 用得太多 = 写错了层数）。

    这种 import 在运行期会直接 ``ImportError``（或 import 到别的顶层包），**必须报红**：
    若只是「解析不到就跳过」，一个把 ``..`` 写成 ``...`` 的越界边就会变成假绿。
    """
    return dots > 0 and dots - 1 > len(package_parts)


def classify(parts: tuple[str, ...]) -> tuple[str, str] | None:
    """把模块路径片段归类成 ``(源类别, 目标名)``；不认识的层返回 ``None``（由调用方登记）。"""
    if not parts:
        return None
    head = parts[0]
    if head in LAYERS:
        return "layer", head
    if len(parts) == 1 and head in ROOT_MODULES:
        return "root", head
    return None


def collect_violations(src_root: Path) -> tuple[list[Violation], list[str]]:
    """扫描 ``src_root`` 下全部 ``.py``，返回 ``(越界列表, 未登记顶层包列表)``。"""
    violations: list[Violation] = []
    unregistered: list[str] = []
    if not src_root.is_dir():
        return violations, unregistered

    for entry in sorted(src_root.iterdir(), key=lambda item: item.name):
        if entry.is_dir() and entry.name not in LAYERS and entry.name not in _IGNORED_TOP_DIRS:
            unregistered.append(entry.name)

    for path in scan.walk(src_root, scan.PY_EXTS):
        rel_parts = path.relative_to(src_root).parts
        source_layer = rel_parts[0]
        if source_layer not in LAYERS:
            continue
        rel_path = scan.rel(src_root, path)
        text = scan.read_text(path)
        if text is None:
            continue
        # 剥注释：注释里写的 `from ...api import x` 不算依赖边。
        stripped = scan.strip_comments(text, ".py")
        package_parts = rel_parts[:-1]
        for line, dots, module in parse_imports(stripped):
            if escapes_source_root(package_parts, dots):
                violations.append(
                    Violation(
                        rel_path,
                        line,
                        source_layer,
                        "?",
                        "." * dots + (module or ""),
                        "相对导入的点号数超过包深度（越出 backend/src，层数写错了）",
                    )
                )
                continue
            parts = resolve_module_parts(package_parts, dots, module)
            kind_and_name = classify(parts) if parts else None
            if kind_and_name is None or parts is None:
                continue
            kind, target = kind_and_name
            # 同层自引用（`api.ha` 里 import `api.go2rtc`）不算跨层边。
            if kind == "layer" and target == source_layer:
                continue
            allowed = ALLOWED_LAYER_EDGES[source_layer] if kind == "layer" else ALLOWED_ROOT_MODULE_EDGES[source_layer]
            if target in allowed:
                continue
            module_repr = "." * max(dots, 0) + ".".join(parts) if dots else ".".join(parts)
            rule = (
                f"`{source_layer}` 只允许看见 {sorted(allowed)}"
                if kind == "layer"
                else f"根模块 `{target}` 不给 `{source_layer}` 用"
            )
            violations.append(Violation(rel_path, line, source_layer, target, module_repr, rule))
    return violations, unregistered


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=None, help="后端 src 根（默认 homeos/backend/src）")
    parser.add_argument("--list", action="store_true", help="只列出实际存在的跨层边，不判成败")
    args = parser.parse_args(argv)

    src_root = Path(args.root).resolve() if args.root else (ROOT / SRC_REL)

    if args.list:
        edges: dict[tuple[str, str], list[str]] = defaultdict(list)
        for path in scan.walk(src_root, scan.PY_EXTS):
            rel_parts = path.relative_to(src_root).parts
            if rel_parts[0] not in LAYERS:
                continue
            text = scan.read_text(path)
            if text is None:
                continue
            for _, dots, module in parse_imports(scan.strip_comments(text, ".py")):
                parts = resolve_module_parts(rel_parts[:-1], dots, module)
                if not parts:
                    continue
                kind_and_name = classify(parts)
                if kind_and_name is None or kind_and_name[1] == rel_parts[0]:
                    continue
                edges[(rel_parts[0], kind_and_name[1])].append(scan.rel(src_root, path))
        for (source, target), files in sorted(edges.items()):
            print(f"{source:10s} -> {target:10s} {len(files):4d}  ({len(set(files))} files)")
        return 0

    if not src_root.is_dir():
        print(f"✗ 后端源码根不存在：{src_root}（目录改名后门禁会静默变绿，故按硬失败处理）", file=sys.stderr)
        return 1

    violations, unregistered = collect_violations(src_root)
    problems = [violation.render() for violation in violations]
    for name in unregistered:
        problems.append(
            f"backend/src/ 下出现未登记顶层包 `{name}`：新增一层是结构决策，"
            "请在 ops/check/check_layers.py 的 LAYERS 与 ALLOWED_LAYER_EDGES 里显式登记它允许看见谁"
        )

    if problems:
        print("✗ 后端分层门禁未通过：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "\n修法：共享原语下沉到 platform/ 或 domains/（保持依赖只向下），"
            "而不是让下层反向 import 上层。",
            file=sys.stderr,
        )
        return 1

    print(f"✓ 后端分层门禁通过：{len(LAYERS)} 层依赖方向全部向下，无未登记顶层包。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
