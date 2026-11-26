#!/usr/bin/env python3
"""后端接口 / 前端调用覆盖门禁：钉住「后端有路由、前端没人调」的接口。

为什么需要它
------------
`route_inventory.py` 保证「后端注册的 (method, path) 不变」，`api_contract_coverage.py` 保证
「响应契约不变」，`check_ws_auth.py` 保证「WS 有鉴权」。它们都只看后端自己：
**没有任何门禁在看「这条路由还有没有人用」**。结果是删掉一个页面的调用点后，后端 handler
继续被维护、继续占着鉴权面、继续出现在 OpenAPI 里，而这种退化在 diff 里只是「少了一行
`apiGet(...)`」——评审几乎看不见。

2026-11 的一次人工盘点确认了 30+ 条这种路由（`events/timeline`、`security/frigate/*`、
`system/external/*`、商店的 `account/email` 等），说明这不是理论风险。

口径
----
- 路由 = 两个后端**实时注册**的结果，不读快照：
  - `homeos`：复用 `route_inventory.collect_operations()`（symlink 导入 `bootstrap.router_registry`
    取 OpenAPI，因此需要后端运行期依赖）；
  - `homeos-store`：复用 `store_route_inventory.collect_routes()`（纯 AST）。
  - `HEAD` / `OPTIONS` 不参与（CORS 预检与探活不承载业务）。
- 前端 = 静态扫描 `homeos/frontend/src`、`homeos-store/frontend/src` 里的**路径形态**：
  - 单/双引号字面量、模板字符串、`'a' + x + 'b'` 拼接链；
  - 模板里的 `${...}` 若要么是同一文件里的 `const NAME = '...'`，要么表达式内部出现了
    引号字面量（三元分支，如 `` `/licenses/${id}/${on ? "activate" : "deactivate"}` ``），
    就按字面量展开；否则按通配处理。
- 归一化：双方都去掉 `/api/v1`、`/store/v1`、`/store-admin/v1` 前缀，末段空串（尾斜杠）折叠；
  `{param}` 与 `${...}` 都视为单段通配。
- 匹配是**严格**的：路由的通配可以匹配前端任何字面量段，但前端的通配**不能**吞掉路由的字面量段
  （否则 `/config/${base}/upload` 会把 `/config/anything/upload` 全部算成「已接线」，
  正是最需要发现的那类漏接线）。
- 一处例外是 `dynamic`（弱匹配）：同一文件里存在**同形状**的动态拼接，且被拼掉的段的值以引号
  字面量出现在该文件里（`adminApi(`/orders/${no}/${action}`)` + `runAction(order, "refund", ...)`）。
  这类路由算「已接线」但会在报告里单列，提示把 action 写成字面量。

棘轮语义（与 `api_contract_coverage.py` 一致）
--------------------------------------------------------------------
基线把路由分成两档，两档都是**显式登记**：

- `allowlist`：设计上就不由前端调用（反向代理、webhook、MCP、桌面客户端协议、静态资源）。
- `known_gaps`：确实缺前端入口，先钉住、后续再决定接线还是删除。

`--check` 只在下面三种情况失败：

    1) NEW-ORPHAN  出现既没接线、也不在两档里的路由（新增了没人用的接口）；
    2) NOW-USED    `known_gaps` 里的路由已经被前端调用（该条目过期，必须显式移除）；
    3) STALE-ENTRY 基线里的条目在实时路由里已不存在（该条目过期，必须显式移除）。

允许「白名单里的路由后来被调用」——那是补接线，不构成退化，只打印 NOTE 提示可以移出白名单。

用法
----
    node ops/lib/py.mjs ops/checks/architecture/frontend_route_coverage.py --check
    node ops/lib/py.mjs ops/checks/architecture/frontend_route_coverage.py --write   # 重写已知缺口
    node ops/lib/py.mjs ops/checks/architecture/frontend_route_coverage.py --report  # Markdown 报告
    node ops/lib/py.mjs ops/checks/architecture/frontend_route_coverage.py --json    # 机器可读

退出码：0 通过 / 1 有退化 / 2 基线缺失 / 3 环境不具备（缺后端运行期依赖）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from api_contract_coverage import collect_routes as collect_ast_routes
from route_inventory import collect_operations
from store_route_inventory import collect_routes as collect_store_routes

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_BASELINE = REPO_ROOT / "ops/checks/baselines/contracts/frontend-coverage-baseline.json"

#: 项目名 → (前端源码目录, 该前端相对路径可能挂在的 API 前缀)。
#:
#: 前端有两种写法：`apiGet('/ha/connection')`（相对 axios baseURL）与
#: `apiGet('/api/v1/ha/connection')`（整条字面量）。所以每条扫描结果都要按这几个前缀
#: 各展开一次；前缀按项目限定，否则主应用的 `/appearance` 会误配到商店的后台路由。
FRONTEND_DIRS: dict[str, tuple[str, tuple[str, ...]]] = {
    "homeos": ("homeos/frontend/src", ("", "/api/v1")),
    "homeos-store": ("homeos-store/frontend/src", ("", "/store/v1", "/store-admin/v1")),
}

#: 前端源码后缀：只扫这些文件里的路径字面量。
SOURCE_SUFFIXES = frozenset({".ts", ".tsx", ".vue", ".js", ".mjs"})

#: API 前缀 → 归一化后的替代前缀，按「最长优先」尝试。
#: 商店的前台（`/store/v1`）与后台（`/store-admin/v1`）**不能**折到一起：两边都有
#: `/licenses`、`/orders` 之类同名资源，折叠后会把「后台有、前台没有」错算成已接线。
API_PREFIXES: tuple[tuple[str, str], ...] = (
    ("/store-admin/v1", "/store-admin"),
    ("/store/v1", ""),
    ("/api/v1", ""),
)

#: 不承载业务的动词：CORS 预检与探活不算「没人调用的接口」。
SKIP_METHODS = frozenset({"HEAD", "OPTIONS"})

#: 状态取值。`matched` = 字面量精确覆盖；`dynamic` = 同文件里存在同形状的动态拼接
#: （弱证据，见 `is_dynamic_match`），不算失败但会在报告里单列。
MATCHED = "matched"
DYNAMIC = "dynamic"
ALLOWLIST = "allowlist"
KNOWN_GAP = "known_gap"
NEW_ORPHAN = "new_orphan"

#: known_gap 的两种处置：保留（缺入口是设计选择）/ 已被替代待删除。
GAP_DECISIONS = frozenset({"keep", "delete-candidate"})

#: 任务分段标记（前端模板里未解析出的 `${...}`）。
WILDCARD = "__WILDCARD__"

#: 同一文件里的字符串常量：`const ASSET_API_BASE = 'backgrounds'`。
_CONST_RE = re.compile(
    r"""(?:^|[\n;])\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(['"])([^'"\n]{1,120})\2"""
)

#: 表达式里出现过的引号字面量（三元分支 / 数组备选）。
_QUOTED_RE = re.compile(r"""(['"])([^'"\n]{1,80})\1""")

#: 以 `/` 开头的字面量：候选路径起点。
_PATH_LITERAL_RE = re.compile(r"""(['"])(/[^'"\n]{0,300})\1""")

#: 纯标识符：用于把 `${NAME}` / `+ NAME +` 解析成常量值。
_IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][\w$]*$")

#: 「像一条 URL 路径」：只允许 ASCII 路径字符。
#:
#: 源码里的反引号既表示模板字符串，也表示**注释里的行内代码**（`` `见 /config/backgrounds` ``）。
#: 后者会被模板扫描器当成模板吞进来，产出一堆带中文/全角括号的假路径；而这些假路径里的
#: `${...}` 会变成通配段，进而把同层数的真实路由全部「匹配」掉。宁可漏报也不能这样误配。
_PATH_SHAPE_RE = re.compile(r"^/[A-Za-z0-9\-_./{}$~:%+]*$")


class EnvironmentMissing(RuntimeError):
    """后端运行期依赖不可用，无法取实时路由。"""


@dataclass(frozen=True)
class Verdict:
    """一条实时路由的覆盖结论。"""

    project: str
    method: str
    path: str
    key: str
    status: str
    reason: str = ""
    frontend: str = ""


# --------------------------------------------------------------------------- #
# 路径归一化
# --------------------------------------------------------------------------- #


def _strip_prefix(path: str) -> str:
    """去掉 API 前缀，返回以 `/` 开头的相对路径。"""
    for prefix, replacement in API_PREFIXES:
        if path == prefix:
            return replacement or "/"
        if path.startswith(f"{prefix}/"):
            return f"{replacement}{path[len(prefix) :]}"
    return path


def _strip_trailing_slash(path: str) -> str:
    """折叠尾斜杠（`/system/moviepilot/` 与 `/system/moviepilot` 是同一条业务路由）。"""
    trimmed = path.rstrip("/")
    return trimmed or "/"


#: 路径参数里的转换器后缀：AST 拿到的是 `{sub_path:path}`，OpenAPI 渲染成 `{sub_path}`。
_PARAM_CONVERTER_RE = re.compile(r"\{([^{}:]+):[^{}]+\}")


def _normalize_param_names(path: str) -> str:
    """把 `{name:path}` 折成 `{name}`，让 AST 路径与 OpenAPI 路径可比较。"""
    return _PARAM_CONVERTER_RE.sub(r"{\1}", path)


def route_key(method: str, path: str) -> str:
    """基线里用的稳定键：`METHOD /normalized/path`。"""
    return f"{method} {_strip_trailing_slash(_normalize_param_names(path))}"


def _relative(path: str) -> str:
    """统一到「相对 API 根」的形态，两侧都走这条规则才能比较。"""
    return _strip_trailing_slash(_strip_prefix(_strip_trailing_slash(path)))


def _segments(path: str) -> list[str]:
    return [part for part in _relative(path).split("/") if part]


def _template_segments(path: str) -> list[tuple[str, str]]:
    """前端路径 → 段列表：`('lit', v)` / `('wild', '')` / `('prefix', v)`。"""
    out: list[tuple[str, str]] = []
    for part in _segments(path):
        if part == WILDCARD:
            out.append(("wild", ""))
        elif WILDCARD in part:
            out.append(("prefix", part.split(WILDCARD)[0]))
        else:
            out.append(("lit", part))
    return out


def _route_segments(path: str) -> list[tuple[str, str]]:
    """路由路径 → 段列表：`{param}`（含 `{p:path}`）是通配。"""
    out: list[tuple[str, str]] = []
    for part in _segments(path):
        out.append(("wild", "") if re.fullmatch(r"\{[^}]*\}", part) else ("lit", part))
    return out


def is_covered(route_path: str, frontend_path: str) -> bool:
    """路由是否被某条前端路径覆盖（严格匹配，见模块 docstring 的「口径」）。

    两端段数必须相等；路由的通配段可以匹配前端任意段，但前端**只有整段通配**才算
    匹配路由字面量。`__WILDCARD__` 只出现在「无引号备选的 ${...}」位置，它周围还有
    字符（如 `file-${id}.png`）时无法断定具体值，因此不算覆盖任何路由字面量。
    """
    route = _route_segments(route_path)
    frontend = _template_segments(frontend_path)
    if len(route) != len(frontend):
        return False
    for (route_kind, route_value), (frontend_kind, frontend_value) in zip(route, frontend, strict=True):
        if route_kind == "wild":
            continue
        if frontend_kind == "wild":
            return False
        if frontend_kind == "lit":
            if route_value != frontend_value:
                return False
        elif frontend_kind == "prefix":
            if not frontend_value or not route_value.startswith(frontend_value):
                return False
        else:  # pragma: no cover - 只可能来自本模块的两种取值
            return False
    return True


# --------------------------------------------------------------------------- #
# 前端源码扫描
# --------------------------------------------------------------------------- #


def _string_constants(text: str) -> dict[str, str]:
    """收集同一文件里的 `const NAME = 'literal'`，供模板内联。"""
    return {match.group(1): match.group(3) for match in _CONST_RE.finditer(text)}


def _quoted_alternatives(expression: str) -> list[str]:
    return [match.group(2) for match in _QUOTED_RE.finditer(expression)]


def _looks_like_path(path: str) -> bool:
    """判断字面量是不是一条 URL 路径（排除注释里的中文行内代码、文件路径等）。"""
    return bool(_PATH_SHAPE_RE.match(path))


def _expand(segments: list[tuple[str, list[str] | None]]) -> list[str]:
    """把带备选的段列表展开成若干条具体路径（备选数设上限，避免三元嵌套爆炸）。"""
    out: list[list[str]] = [[]]
    for kind, values in segments:
        if kind == "wild":
            alternatives = [WILDCARD]
        elif values:
            alternatives = values
        else:
            alternatives = [WILDCARD]
        out = [[*prefix, value] for prefix in out for value in alternatives]
        if len(out) > 60:
            out = out[:60]
    return ["".join(parts) for parts in out]


def is_dynamic_match(route_path: str, frontend_path: str, tokens: set[str]) -> bool:
    """弱匹配：同一文件里存在同形状的动态拼接，且路由的字面量段都出现在该文件的字符串里。

    为什么需要它：商店后台的订单操作是 `` adminApi(`/orders/${no}/${action}`) ``，`action`
    由 `runAction(order, "refund", ...)` 传入 —— 路径在源码里**没有** `refund` 字面量。
    只看路径形态会把「确实在用」的 `POST /orders/{no}/refund` 判成孤儿。

    三个条件同时成立才算弱匹配，避免把「文件里恰好出现过这个词」当成调用：
    1. 段数相同；
    2. 路由的字面量段与前端对应段相等（前端可以是通配）；
    3. 前端处于通配位置的**才有歧义**，因此只要求这些路由字面量在该文件的引号字面量里出现；
       前端已经是同名字面量的段，路径本身就已经证明过了。
    """
    route = _route_segments(route_path)
    frontend = _template_segments(frontend_path)
    if len(route) != len(frontend):
        return False
    if not any(kind != "lit" for kind, _ in frontend):
        return False
    ambiguous: list[str] = []
    proven = False
    for (route_kind, route_value), (frontend_kind, frontend_value) in zip(route, frontend, strict=True):
        if route_kind == "wild":
            continue
        if frontend_kind == "lit":
            if route_value != frontend_value:
                return False
            proven = True
            continue
        ambiguous.append(route_value)
        if frontend_kind == "prefix" and frontend_value and not route_value.startswith(frontend_value):
            return False
    if not proven:
        return False
    return all(literal in tokens for literal in ambiguous)


def _add_path(found: set[str], path: str) -> None:
    """登记一条候选路径：去掉 query/hash，并剔除不像路径的字面量。"""
    candidate = path.split("?", maxsplit=1)[0].split("#", maxsplit=1)[0]
    if candidate.startswith("/") and _looks_like_path(candidate):
        found.add(candidate)


def _scan_template(text: str, start: int, constants: dict[str, str]) -> tuple[list[tuple[str, list[str] | None]], int]:
    """扫描从 `start`（反引号位置）开始的模板字符串，返回段列表与闭合反引号下标。"""
    segments: list[tuple[str, list[str] | None]] = []
    buffer: list[str] = []
    index = start + 1
    while index < len(text):
        char = text[index]
        if char == "\\":
            buffer.append(text[index : index + 2])
            index += 2
            continue
        if char == "`":
            break
        if char == "$" and index + 1 < len(text) and text[index + 1] == "{":
            if buffer:
                segments.append(("lit", ["".join(buffer)]))
                buffer = []
            cursor = index + 2
            depth = 1
            expression: list[str] = []
            while cursor < len(text) and depth > 0:
                inner = text[cursor]
                if inner == "{":
                    depth += 1
                elif inner == "}":
                    depth -= 1
                if depth > 0:
                    expression.append(inner)
                cursor += 1
            body = "".join(expression).strip()
            if _IDENTIFIER_RE.match(body) and body in constants:
                segments.append(("lit", [constants[body]]))
            else:
                alternatives = _quoted_alternatives(body)
                segments.append(("dyn", alternatives or None))
            index = cursor
            continue
        buffer.append(char)
        index += 1
    if buffer:
        segments.append(("lit", ["".join(buffer)]))
    return segments, index


def _scan_concat(text: str, start: int, constants: dict[str, str]) -> list[tuple[str, list[str] | None]]:
    """扫描 `'a' + expr + 'b'` 拼接链（从字面量结束处开始）。"""
    segments: list[tuple[str, list[str] | None]] = []
    index = start
    while True:
        cursor = index
        while cursor < len(text) and text[cursor] in " \t\r\n":
            cursor += 1
        if cursor >= len(text) or text[cursor] != "+":
            return segments
        pos = cursor + 1
        while pos < len(text) and text[pos] in " \t\r\n":
            pos += 1
        depth = 0
        quote = ""
        escaped = False
        operand_start = pos
        operand_end = -1
        while pos < len(text):
            char = text[pos]
            if quote:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = ""
                pos += 1
                continue
            if char in "'\"`":
                quote = char
            elif char in "([{":
                depth += 1
            elif char in ")]}":
                if depth == 0:
                    operand_end = pos
                    break
                depth -= 1
            elif (char in ",;+" or char == "\n") and depth == 0:
                operand_end = pos
                break
            pos += 1
        if operand_end < 0:
            operand_end = pos
        operand = text[operand_start:operand_end].strip()
        if len(operand) >= 2 and operand[0] in "'\"`" and operand[-1] == operand[0]:
            segments.append(("lit", [operand[1:-1]]))
        elif _IDENTIFIER_RE.match(operand) and operand in constants:
            segments.append(("lit", [constants[operand]]))
        else:
            alternatives = _quoted_alternatives(operand)
            segments.append(("dyn", alternatives or None))
        index = operand_end


def scan_source(text: str) -> set[str]:
    """从一份前端源码里抽取所有以 `/` 开头的路径形态（含模板与拼接）。"""
    constants = _string_constants(text)
    found: set[str] = set()
    for match in _PATH_LITERAL_RE.finditer(text):
        segments: list[tuple[str, list[str] | None]] = [("lit", [match.group(2)])]
        segments.extend(_scan_concat(text, match.end(), constants))
        for path in _expand(segments):
            _add_path(found, path)
    index = 0
    while index < len(text):
        if text[index] == "`":
            segments, closing = _scan_template(text, index, constants)
            for path in _expand(segments):
                _add_path(found, path)
            index = closing + 1
            continue
        index += 1
    return found


@dataclass
class FrontendIndex:
    """一个前端的静态索引：精确匹配用 `paths`，弱匹配用 `files`。"""

    #: 归一化路径 → 首个命中文件（仓库相对路径）
    paths: dict[str, str]
    #: 文件 → (该文件里的全部归一化路径, 该文件里的引号字面量)
    files: dict[str, tuple[list[str], set[str]]]


def collect_frontend_index(directory: Path, prefixes: tuple[str, ...]) -> FrontendIndex:
    """扫描一个前端目录，建立路径索引。

    `prefixes` 是同一个相对路径可能的挂载点：`'/ha/connection'` 与
    `'/api/v1/ha/connection'` 是同一件事，两条都要登记（见 `FRONTEND_DIRS` 的说明）。
    """
    paths: dict[str, str] = {}
    files: dict[str, tuple[list[str], set[str]]] = {}
    for file in sorted(directory.rglob("*")):
        if file.suffix not in SOURCE_SUFFIXES or not file.is_file():
            continue
        relative = file.relative_to(REPO_ROOT).as_posix()
        if ".test." in file.name or "node_modules" in file.parts:
            continue
        try:
            text = file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):  # fmt: skip
            continue
        tokens = {match.group(2) for match in _QUOTED_RE.finditer(text)}
        normalized = [_relative(f"{prefix}{path}") for path in scan_source(text) for prefix in prefixes]
        for candidate in normalized:
            paths.setdefault(candidate, relative)
        files[relative] = (normalized, tokens)
    return FrontendIndex(paths=paths, files=files)


def _dynamic_evidence(index: FrontendIndex, route_path: str) -> str:
    """找一条弱匹配证据，返回提供证据的文件（没有则空串）。"""
    for file, (candidates, tokens) in index.files.items():
        if any(is_dynamic_match(route_path, candidate, tokens) for candidate in candidates):
            return file
    return ""


# --------------------------------------------------------------------------- #
# 实时路由采集
# --------------------------------------------------------------------------- #


def _homeos_operations() -> list[str]:
    try:
        return collect_operations()
    except ModuleNotFoundError as exc:
        raise EnvironmentMissing(str(exc.name or exc)) from exc


def collect_live_routes() -> dict[str, list[tuple[str, str]]]:
    """项目 → [(method, path)]，已去掉 HEAD/OPTIONS 并按 key 去重。"""
    routes: dict[str, list[tuple[str, str]]] = {}
    seen: dict[str, str] = {}

    def add(project: str, method: str, path: str) -> None:
        key = route_key(method, path)
        previous = seen.get(key)
        if previous is not None:
            # 只允许「尾斜杠差异」折叠（`/x/` 与 `/x` 是同一条业务路由）；
            # 其它撞键说明归一化把两条不同路由并成一条，门禁必须先暴露这个缺陷。
            if previous.rstrip("/") != path.rstrip("/"):
                print(f"WARN 归一化撞键：{previous} 与 {path} 都映射到 {key}", file=sys.stderr)
            return
        seen[key] = path
        routes.setdefault(project, []).append((method, path))

    for operation in _homeos_operations():
        method, _, path = operation.partition(" ")
        if method in SKIP_METHODS:
            continue
        add("homeos", method, path)
    for route in collect_store_routes():
        if route.method in SKIP_METHODS:
            continue
        add("homeos-store", route.method, route.path)
    for items in routes.values():
        items.sort(key=lambda item: (item[1], item[0]))
    return routes


#: 报告的「后端入口」列要覆盖的前缀：AST 拿到的是路由自身路径，`/api/v1` 这类前缀
#: 是在 `include_router(prefix=...)` 时加的，所以按项目补一遍才能与实时路由对上。
HANDLER_PREFIXES: dict[str, tuple[str, ...]] = {
    "homeos": ("", "/api/v1"),
    "homeos-store": ("", "/store/v1", "/store-admin/v1"),
}


def collect_handlers() -> dict[str, str]:
    """(METHOD 完整路径) → `后端文件:行号`，只用于报告定位。

    AST 扫描拿到的是**路由自身**的路径（`/agent/learning/audit`），`/api/v1` 这类前缀
    是在 `include_router(prefix=...)` 时加的，所以这里按项目把前缀各补一遍。
    """
    handlers: dict[str, str] = {}
    for project, directory in (
        ("homeos", REPO_ROOT / "homeos" / "backend" / "src"),
        ("homeos-store", REPO_ROOT / "homeos-store" / "backend" / "src"),
    ):
        if not directory.is_dir():
            continue
        prefixes = HANDLER_PREFIXES[project]
        for route in collect_ast_routes(directory, project):
            location = f"{route.file}:{route.line}"
            for prefix in prefixes:
                handlers.setdefault(route_key(route.method, f"{prefix}{route.path}"), location)
    return handlers


# --------------------------------------------------------------------------- #
# 基线
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Baseline:
    allowlist: dict[str, str]
    known_gaps: dict[str, str]
    #: 每条 known_gap 的处理决策：``keep``（保留，缺入口是设计选择）或
    #: ``delete-candidate``（已被替代，可删除）。没有决策就不算「已评估」。
    gap_decisions: dict[str, str]

    def to_payload(self) -> dict:
        return {
            "description": (
                "后端接口 / 前端调用覆盖基线：allowlist = 设计上不由前端调用；"
                "known_gaps = 确认缺前端入口、暂时保留。新增孤儿接口必须显式登记才能过门禁"
            ),
            "rules": (
                "键为 `METHOD /完整路径`（尾斜杠折叠）。"
                "known_gaps 里的接口一旦被前端调用会被要求移除；allowlist 只提示不失败。"
                "每条 known_gap 必须带 decision（keep / delete-candidate）"
            ),
            "allowlist": [{"key": key, "reason": self.allowlist[key]} for key in sorted(self.allowlist)],
            "known_gaps": [
                {
                    "key": key,
                    "reason": self.known_gaps[key],
                    "decision": self.gap_decisions.get(key, ""),
                }
                for key in sorted(self.known_gaps)
            ],
        }


def _read_entries(payload: dict, name: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    for item in payload.get(name, []):
        key = str(item.get("key", "")).strip()
        if not key:
            continue
        entries[key] = str(item.get("reason", "")).strip()
    return entries


def _read_decisions(payload: dict, name: str) -> dict[str, str]:
    decisions: dict[str, str] = {}
    for item in payload.get(name, []):
        key = str(item.get("key", "")).strip()
        if key:
            decisions[key] = str(item.get("decision", "")).strip()
    return decisions


def load_baseline(path: Path) -> Baseline:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return Baseline(
        allowlist=_read_entries(payload, "allowlist"),
        known_gaps=_read_entries(payload, "known_gaps"),
        gap_decisions=_read_decisions(payload, "known_gaps"),
    )


def write_baseline(path: Path, baseline: Baseline) -> None:
    path.write_text(json.dumps(baseline.to_payload(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# 判定
# --------------------------------------------------------------------------- #


def classify(
    live: dict[str, list[tuple[str, str]]],
    frontend: dict[str, FrontendIndex],
    baseline: Baseline,
) -> list[Verdict]:
    """逐条给出结论：matched / dynamic / allowlist / known_gap / new_orphan。"""
    verdicts: list[Verdict] = []
    for project, routes in live.items():
        index = frontend.get(project, FrontendIndex({}, {}))
        for method, path in routes:
            key = route_key(method, path)
            hit = next((candidate for candidate in index.paths if is_covered(path, candidate)), "")
            if hit:
                status, reason, file = MATCHED, "", index.paths[hit]
            else:
                evidence = _dynamic_evidence(index, path)
                if evidence:
                    status, reason, file = DYNAMIC, "同文件动态拼接（弱匹配，建议改成字面量）", evidence
                elif key in baseline.allowlist:
                    status, reason, file = ALLOWLIST, baseline.allowlist[key], ""
                elif key in baseline.known_gaps:
                    status, reason, file = KNOWN_GAP, baseline.known_gaps[key], ""
                else:
                    status, reason, file = NEW_ORPHAN, "", ""
            verdicts.append(
                Verdict(project=project, method=method, path=path, key=key, status=status, reason=reason, frontend=file)
            )
    verdicts.sort(key=lambda verdict: (verdict.project, verdict.key))
    return verdicts


def check(baseline: Baseline, verdicts: list[Verdict]) -> list[str]:
    """棘轮比对，返回失败项（空表示通过）。"""
    problems: list[str] = []
    live_keys = {verdict.key for verdict in verdicts}
    for verdict in verdicts:
        if verdict.status == NEW_ORPHAN:
            problems.append(f"NEW-ORPHAN {verdict.key}（后端已注册，前端没有调用点，也未登记）")
        elif verdict.status in (MATCHED, DYNAMIC) and verdict.key in baseline.known_gaps:
            problems.append(f"NOW-USED   {verdict.key}（已在 {verdict.frontend} 接线，应从 known_gaps 移除）")
    for key in sorted(baseline.known_gaps):
        if key not in live_keys:
            problems.append(f"STALE-ENTRY {key}（known_gaps 有、实时路由没有，应移除）")
        # 「登记了但没决策」等同于没评估：接口是删是留必须写明，否则这份清单永远只是免责声明。
        decision = baseline.gap_decisions.get(key, "")
        if decision not in GAP_DECISIONS:
            problems.append(
                f"NO-DECISION {key}（known_gaps 条目必须带 decision ∈ {sorted(GAP_DECISIONS)}，"
                "否则无法区分「设计如此」与「已被替代、待删除」）"
            )
    for key in sorted(baseline.allowlist):
        if key not in live_keys:
            problems.append(f"STALE-ENTRY {key}（allowlist 有、实时路由没有，应移除）")
    return problems


def notes(baseline: Baseline, verdicts: list[Verdict]) -> list[str]:
    """不构成失败、但值得打印的观察。"""
    messages: list[str] = []
    for verdict in verdicts:
        if verdict.status in (MATCHED, DYNAMIC) and verdict.key in baseline.allowlist:
            messages.append(f"NOTE {verdict.key} 已被 {verdict.frontend} 调用，可以从 allowlist 移出")
    return messages


# --------------------------------------------------------------------------- #
# 报告
# --------------------------------------------------------------------------- #

STATUS_LABELS = {
    MATCHED: "已接线",
    DYNAMIC: "动态拼接（弱匹配）",
    ALLOWLIST: "白名单",
    KNOWN_GAP: "已知缺口",
    NEW_ORPHAN: "新增孤儿",
}

#: 报告里各状态的展示顺序：先列需要处理的，再列已接线/白名单。
REPORT_ORDER = (NEW_ORPHAN, KNOWN_GAP, DYNAMIC, ALLOWLIST)


def _split_group(path: str) -> str:
    segments = _segments(path)
    return f"/{segments[0]}" if segments else "/"


def _table(rows: list[list[str]], header: list[str]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return lines


def render_report(verdicts: list[Verdict], handlers: dict[str, str], baseline: Baseline) -> str:
    """生成 Markdown 报告（无时间戳，保证同样输入同样输出）。"""
    lines = [
        "# 后端接口 / 前端调用覆盖报告",
        "",
        "> 由 `node ops/lib/py.mjs ops/checks/architecture/frontend_route_coverage.py --report` 生成，请勿手改。",
        "",
        "## 口径",
        "",
        "- 路由：两个后端的**实时注册**结果（`homeos` 走 OpenAPI，`store` 走 AST），不含 `HEAD` / `OPTIONS`。",
        "- 前端：静态扫描 `homeos/frontend/src`、`homeos-store/frontend/src` 的路径字面量 / 模板 / 拼接链。",
        "- 匹配严格：前端通配不能吞掉路由的字面量段；`const` 字符串常量与三元分支会展开。",
        "- `allowlist` = 设计上不由本仓库前端调用；`known_gaps` = 确实缺前端入口，暂时保留。",
        "",
        "## 统计",
        "",
    ]
    header = ["项目", "路由", "已接线", "动态拼接", "白名单", "已知缺口", "新增孤儿"]
    rows = []
    for project in ("homeos", "homeos-store"):
        subset = [verdict for verdict in verdicts if verdict.project == project]
        counts = {status: sum(1 for verdict in subset if verdict.status == status) for status in STATUS_LABELS}
        rows.append(
            [
                f"`{project}`",
                str(len(subset)),
                str(counts[MATCHED]),
                str(counts[DYNAMIC]),
                str(counts[ALLOWLIST]),
                str(counts[KNOWN_GAP]),
                str(counts[NEW_ORPHAN]),
            ]
        )
    lines.extend(_table(rows, header))
    lines.append("")

    for project in ("homeos", "homeos-store"):
        subset = [verdict for verdict in verdicts if verdict.project == project]
        if not subset:
            continue
        lines.append(f"## {project}")
        lines.append("")
        for status in REPORT_ORDER:
            group = [verdict for verdict in subset if verdict.status == status]
            lines.append(f"### {STATUS_LABELS[status]}（{len(group)}）")
            lines.append("")
            if not group:
                lines.extend(["无。", ""])
                continue
            grouped: dict[str, list[Verdict]] = {}
            for verdict in group:
                grouped.setdefault(_split_group(verdict.path), []).append(verdict)
            for prefix in sorted(grouped):
                lines.append(f"#### `{prefix}`")
                lines.append("")
                rows = [
                    [
                        verdict.method,
                        f"`{verdict.path}`",
                        f"`{handlers.get(verdict.key, '?')}`",
                        (verdict.reason or "—")
                        + (f"（证据：`{verdict.frontend}`）" if verdict.status == DYNAMIC and verdict.frontend else ""),
                    ]
                    for verdict in grouped[prefix]
                ]
                headers = ["Method", "Path", "后端入口", "说明"]
                if status == KNOWN_GAP:
                    # 决策单列一栏：批量评审时一眼能分出「设计如此」与「已被替代、待删除」。
                    for row, verdict in zip(rows, grouped[prefix], strict=True):
                        row.append(baseline.gap_decisions.get(verdict.key) or "**未决策**")
                    headers.append("决策")
                lines.extend(_table(rows, headers))
                lines.append("")
        lines.append("")

    lines.extend(
        [
            "## 已知限制",
            "",
            "- 前端路径来自静态扫描：跨文件常量、运行时拼出来的 URL 无法解析，会落成通配或被漏掉；",
            "  出现误报时优先把路径改成可静态识别的形态（模板里直接写字面量）。",
            "- 反向代理 / webhook / MCP / 桌面客户端协议等外部入口在 `allowlist` 里登记，不算缺陷。",
            "- 3D 舞台与 HA 自定义面板的消费方不在本仓库前端，相关接口需要人工确认后再移出 `known_gaps`。",
            "",
        ]
    )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="与基线比对（默认）")
    mode.add_argument("--write", action="store_true", help="用当前扫描结果重写 known_gaps（allowlist 原样保留）")
    mode.add_argument("--report", action="store_true", help="输出 Markdown 报告")
    mode.add_argument("--json", action="store_true", help="输出机器可读结果")
    parser.add_argument("--out", type=Path, help="与 --report 搭配：写入文件而不是 stdout")
    args = parser.parse_args(argv)

    try:
        live = collect_live_routes()
    except EnvironmentMissing as exc:
        print(f"无法导入后端运行期依赖（{exc}）：先安装 requirements.txt 再跑本条门禁", file=sys.stderr)
        return 3

    frontend = {
        project: collect_frontend_index(REPO_ROOT / directory, prefixes)
        for project, (directory, prefixes) in FRONTEND_DIRS.items()
    }

    if args.write:
        previous = load_baseline(args.baseline) if args.baseline.is_file() else Baseline({}, {}, {})
        scanned = classify(live, frontend, previous)
        gaps = dict(previous.known_gaps)
        decisions = dict(previous.gap_decisions)
        for verdict in scanned:
            if verdict.status != NEW_ORPHAN:
                continue
            gaps.setdefault(verdict.key, "待确认：后端已注册，前端没有调用点")
            # 新登记的条目默认 `keep`（先钉住，再评估）；已有决策原样保留。
            decisions.setdefault(verdict.key, "keep")
        for key in list(gaps):
            if any(verdict.status in (MATCHED, DYNAMIC) and verdict.key == key for verdict in scanned):
                del gaps[key]
                decisions.pop(key, None)
        write_baseline(
            args.baseline,
            Baseline(allowlist=previous.allowlist, known_gaps=gaps, gap_decisions=decisions),
        )
        total = sum(len(items) for items in live.values())
        print(f"baseline written: {args.baseline}（路由 {total}，known_gaps {len(gaps)}）")
        return 0

    if not args.baseline.is_file():
        print(f"baseline missing: {args.baseline}", file=sys.stderr)
        return 2

    baseline = load_baseline(args.baseline)
    verdicts = classify(live, frontend, baseline)

    if args.report:
        report = render_report(verdicts, collect_handlers(), baseline)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(report + "\n", encoding="utf-8")
            print(f"report written: {args.out}")
        else:
            print(report)
        return 0

    problems = check(baseline, verdicts)
    counts = {status: sum(1 for verdict in verdicts if verdict.status == status) for status in STATUS_LABELS}

    if args.json:
        print(
            json.dumps(
                {
                    "counts": counts,
                    "problems": problems,
                    "notes": notes(baseline, verdicts),
                    "orphans": [verdict.key for verdict in verdicts if verdict.status == NEW_ORPHAN],
                    "known_gaps": [verdict.key for verdict in verdicts if verdict.status == KNOWN_GAP],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1 if problems else 0

    for project in ("homeos", "homeos-store"):
        subset = [verdict for verdict in verdicts if verdict.project == project]
        if not subset:
            continue
        print(
            f"{project}: routes={len(subset)}"
            f" matched={sum(1 for v in subset if v.status == MATCHED)}"
            f" dynamic={sum(1 for v in subset if v.status == DYNAMIC)}"
            f" allowlist={sum(1 for v in subset if v.status == ALLOWLIST)}"
            f" known_gaps={sum(1 for v in subset if v.status == KNOWN_GAP)}"
            f" new_orphans={sum(1 for v in subset if v.status == NEW_ORPHAN)}"
        )

    for message in notes(baseline, verdicts):
        print(message)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print("frontend route coverage matches baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
