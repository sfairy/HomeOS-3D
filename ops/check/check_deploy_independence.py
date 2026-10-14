#!/usr/bin/env python3
"""独立部署护栏：钉死「两个项目只经共享包交互、且各自内联一份编译副本」。

为什么需要它
------------
主应用（``homeos/``）与商店（``homeos-store/``）要求**运行时 / 容器各自独立**，但它们同处一个
monorepo，源码互相看得见 —— 于是「共享」与「越界」在代码里长得几乎一样：

    合法：构建期源码共享（``@homeos/shared``、``packages/shared-py``）——代码在各自构建时被
          打进各自产物，产物里各有一份**自己编译的副本**。
    非法：运行时跨项目引用 —— backend 运行期 import 另一个 backend、前端运行期请求另一个前端
          的产物、或镜像里只存一份共享产物被两个容器共用。

后者**不会**在 typecheck / 冒烟里露头（monorepo 里两边路径都解析得到），一旦发生，表现是
「本地全绿、单独部署某一个镜像时 ImportError / 404」。故立源码级护栏，并进 ``verify:contracts``。

检查项
------
1. **后端源码隔离**：``<项目>/backend/src/**/*.py`` 的**可执行部分**（AST 常量 + import 名，
   剥掉 docstring）不得出现兄弟项目的路径名。注释/docstring 里写「与商店同名文件是孪生」是
   允许的（那是说明，不是引用）；真正危险的是运行期路径/模块引用。
2. **前端源码隔离**：两个前端互不引用对方源码；跨界只允许 ``@homeos/shared``。
3. **包依赖隔离**：两项目的 ``package.json`` 不得依赖兄弟项目。
4. **镜像阶段隔离**：两个项目**共用**一个后端构建阶段（``backend-build``），源码只能由
   ``--build-arg PROJECT`` 选：不得出现字面量项目源码目录、``ARG PROJECT`` 不得有默认值
   （漏传即失败，而不是静默编出另一个项目）；该阶段 ``case`` 认的项目集必须与
   ``ops/build.py`` 的 ``PROJECTS`` 表逐条对得上。导出阶段一律 ``FROM scratch`` 且只 COPY
   构建阶段；两个运行阶段只 COPY 各自的 ``dist/<项目>/...``，且不 ``COPY --from`` 任何项目级
   构建阶段。
5. **共享 Python 包内联**：``packages/shared-py`` 一旦存在，``backend-build`` **必须**把它
   COPY 进镜像并纳入产物断言 —— 这证明是「各自内联编译」，而不是运行期互相依赖
   （P5 起两个项目共用一个构建阶段，这条随之只需核对一次）。

> 第 5 项的真源是 ``packages/shared-py``，故为**硬检查**；目录若被搬走 / 重命名，它会退回
> 打印 N/A（显式说明原因，不是「解析不到就跳过」）。自检里 5a/5b/5c
> 三项在**真实接线**上做撤回式注入，覆盖分支本身。
6. **共享包边界**：``packages/shared``（``@homeos/shared``）不得反向引用任一应用 —— 源码里
   不得 import 应用内部别名（``@/`` ``@app/`` ``@runtime/``）或相对逃逸进应用 ``src``、字符串
   里不得出现应用路径、``package.json`` 不得依赖 ``homeos`` / ``homeos-store``。这一项补的是
   **依赖方向的另一半**：第 2 项只看两个应用的 frontend，共享包自身没有门禁。自检
   6a~6e 覆盖干净基线、三条注入式违规与「目录缺失即自身报错」。

用法::

    python3 ops/check/check_deploy_independence.py
    python3 ops/check/check_deploy_independence.py --root <副本目录>   # 自检用（不碰真实工作区）
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

#: 两个可独立部署的项目：项目名 == 仓库内目录名。
APP_PROJECT = "homeos"
STORE_PROJECT = "homeos-store"

#: 共享 Python 包（P3c）：真源目录 → 镜像内包名。
SHARED_PY_SRC = "packages/shared-py"
SHARED_PY_PACKAGE = "homeos_shared"

#: 允许的跨项目共享面（唯一合法通道）。
SHARED_TS_PACKAGE = "@homeos/shared"
#: 共享 TS 包的真源目录（`@homeos/shared` → packages/shared）。
SHARED_TS_SRC = "packages/shared"
#: 两个**应用内部**的 vite/tsconfig 别名：只在各自应用里成立，共享包一旦 import 它们，
#: 就说明它反过来挂了应用侧的东西（共享包自己既没有 `@/` 也没有 `@app` / `@runtime` 的 paths）。
APP_ALIAS_PREFIXES = ("@/", "@app/", "@runtime/")

#: 「引用兄弟项目」的判据：**只有路径形态才算**。
#:
#: 判据刻意写得窄，因为这段文字到处都是孪生说明、发布文案与品牌名。真正的越界是「把对方的
#: 目录当路径用」或「import 对方的模块」，这两件事都有确定的形状：
#:
#:  * 常量：**路径样字符串**（只含 `[A-Za-z0-9_./\-{}$]` 且含分隔符）里按 `/` / `\` 切出的
#:    **段**命中判据；或整个常量就等于判据（`Path(ROOT / "homeos-store")` 里写的就是它本身）。
#:    于是「把 homeos-store/keys/local 的公钥同步过来即可」这类**说明文案**（含中文标点、反引号，
#:    不是路径样字符串）不会被误报 —— 它也确实绑不住两个项目。
#:  * import：顶层包名命中判据。这是真正的运行期耦合。
#:
#: `homeos` 这个**裸词**刻意不收进判据：它是两个项目共用的品牌名（容器名、供应商字段、发布文案
#: 到处都是），单独出现 19 处全是误报。商店侧只认**无歧义的多段形态**（`homeos/backend` 等）——
#: 想引用主应用的源码目录，绕不开这些段。
SIBLING_REFERENCES = {
    APP_PROJECT: {
        "segments": frozenset({"homeos-store", "homeos_store"}),
        "subpaths": (),
    },
    STORE_PROJECT: {
        "segments": frozenset({"homeos-3d"}),
        "subpaths": ("homeos/backend", "homeos/frontend", "homeos/packages"),
    },
}
#: 路径样字符串：只允许这些字符，且（判据里另要求）含分隔符。
PATH_CHARS_RE = re.compile(r"^[A-Za-z0-9_.\-/\\{}$]+$")

#: 后端构建阶段（P5 起主应用与商店**共用这一个**）：源码由 ``ARG PROJECT`` 选，不写死项目名。
BUILD_STAGE = "backend-build"
#: 该阶段里源码 COPY 的形态：左边必须由 ARG 拼出（取值只能是 ``ops/build.py`` 的项目目录名）。
BUILD_SOURCE_COPY = "${PROJECT}/backend/src"
#: ``ARG PROJECT`` 必须**无默认值**：漏传要失败，不能悄悄退化成某个项目。
BUILD_PROJECT_ARG = re.compile(r"^ARG\s+PROJECT\s*(?P<default>=.*)?$", re.MULTILINE)
#: 导出阶段：``FROM scratch`` + 只 COPY 构建阶段的 ``/app``（供 ``--output type=local`` 用）。
EXPORT_STAGE = "backend-export"
#: 运行阶段 → 该阶段唯一允许的产物来源前缀（带尾斜杠，避免 `dist/homeos` 误吞 `dist/homeos-store`）。
RUNTIME_STAGE_DIST = {
    "app": f"dist/{APP_PROJECT}/",
    "store": f"dist/{STORE_PROJECT}/",
}
#: 运行阶段不得 ``COPY --from`` 的项目级阶段：两个镜像只组装 ``dist/`` 里的产物，不在镜像里
#: 编译后端（这条同时挡住「运行阶段顺手套用另一个项目的构建产物」那类越界）。
RUNTIME_FORBIDDEN_FROM = frozenset({BUILD_STAGE, EXPORT_STAGE})
#: CLI 项目键 → 仓库内目录名，也就是 ``--build-arg PROJECT`` 的**唯一**合法取值。
#: 给错值不会让构建失败（单阶段 + ARG 是同一个模板），只会在运行期才暴露 —— 所以在这里对账。
PROJECT_DIRS = {"app": APP_PROJECT, "store": STORE_PROJECT}
#: 那张派发表所在的编排脚本。
BUILD_SCRIPT = "ops/build.py"
#: 构建阶段里选择项目的 ``case "$PROJECT" in … esac``（抠分支名用，见 `_project_case_branches`）。
PROJECT_CASE_RE = re.compile(r"""case\s+["']?\$\{?PROJECT\}?["']?\s+in(?P<body>.*?)\besac\b""", re.DOTALL)

#: 前端源码扩展名（含构建配置 —— 跨项目耦合最常见的落点就是 vite 配置里的字符串路径）。
FRONTEND_SUFFIXES = (".ts", ".tsx", ".vue", ".js", ".mjs")
#: 跳过目录。
SKIP_DIRS = {"node_modules", "dist", ".vite", "__pycache__"}

#: import 说明的提取（`from "x"` / `import "x"` / 动态 `import("x")`）。
IMPORT_SPEC_RE = re.compile(r"""(?:\bfrom\s+|\bimport\s*\(|\bimport\s+)['"]([^'"]+)['"]""")
#: `FROM <image> AS <stage>`。
FROM_STAGE_RE = re.compile(r"^FROM\s+\S+\s+AS\s+(\S+)\s*$", re.IGNORECASE)
#: `COPY [--flag=val]...`。
COPY_RE = re.compile(r"^COPY\s+(.*)$", re.IGNORECASE)
#: 后端源码目录的一级形态。
BACKEND_SRC_RE = re.compile(rf"^({APP_PROJECT}|{STORE_PROJECT})/backend/src$")


def _iter_files(root: Path, suffixes: tuple[str, ...]):
    """按后缀递归遍历，跳过构建/依赖目录（排序保证输出确定，便于复现）。"""
    if not root.is_dir():
        return
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in suffixes:
            yield path


def _py_executable_strings(path: Path):
    """产出 ``(行号, 类型, 文本)``：类型是 ``"const"`` / ``"import"``，**不含 docstring**。

    注释根本不在 AST 里，天然被排除；docstring 需显式识别 —— 兄弟项目的说明性提及
    （「与商店 xxx 是同一实现的两个副本」）正是写在 docstring 里的，属于允许项。
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstring_ids = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", [])
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                docstring_ids.add(id(body[0].value))
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) not in docstring_ids:
                yield node.lineno, "const", node.value
        elif isinstance(node, ast.JoinedStr):  # f-string：逐段取字面量
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    yield getattr(value, "lineno", node.lineno), "const", value.value
        elif isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, "import", alias.name
        elif isinstance(node, ast.ImportFrom) and node.module:
            yield node.lineno, "import", node.module


def _sibling_hit(project: str, kind: str, text: str) -> str | None:
    """判断一条可执行文本是否**真的**引用兄弟项目；命中则返回命中的名字。"""
    rules = SIBLING_REFERENCES[project]
    segments: frozenset[str] = rules["segments"]
    subpaths: tuple[str, ...] = rules["subpaths"]
    value = text.strip()
    if kind == "import":
        top = value.split(".")[0]
        return top if top in segments else None
    if value in segments or value in subpaths:
        return value
    if "/" not in value and "\\" not in value:
        return None
    if not PATH_CHARS_RE.match(value):
        return None  # 说明书 / 发布文案（含中文标点、反引号）——不是路径
    normalized = value.replace("\\", "/")
    for segment in normalized.split("/"):
        if segment in segments:
            return segment
    for subpath in subpaths:
        if f"/{subpath}/" in f"/{normalized}/":
            return subpath
    return None


def check_backend_source(root: Path) -> tuple[list[str], str]:
    """1. 后端源码隔离（只看可执行部分，且只认路径/import 形态）。"""
    found: list[str] = []
    for project in (APP_PROJECT, STORE_PROJECT):
        source_root = root / project / "backend" / "src"
        if not source_root.is_dir():
            found.append(
                f"{project}/backend/src 不存在 —— 后端源码目录被改名后本项会静默通过，请同步本脚本"
            )
            continue
        for path in _iter_files(source_root, (".py",)):
            rel = path.relative_to(root)
            try:
                items = list(_py_executable_strings(path))
            except SyntaxError as error:
                found.append(f"{rel} 解析失败（本项会因此静默放行）：{error}")
                continue
            for lineno, kind, text in items:
                hit = _sibling_hit(project, kind, text)
                if hit:
                    found.append(
                        f"{rel}:{lineno} 运行期引用兄弟项目（{kind}：{text!r}）—— "
                        f"跨项目只能用共享包，见 {SHARED_PY_SRC}"
                    )
    return found, f"后端源码隔离：{APP_PROJECT} 与 {STORE_PROJECT} 的可执行部分互不引用"


def _resolve_relative(importer: Path, spec: str) -> Path | None:
    """把相对 spec 归一化成绝对路径（不要求文件存在 —— 越界本身就是要抓的）。"""
    if not spec.startswith("."):
        return None
    return (importer.parent / spec).resolve()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _blank_js_comments(text: str) -> str:
    """把 JS/TS 的注释整块**替换成空白**（保留换行与列位置，便于照常按行号报错）。

    必须剥注释：`// 授权商店在 homeos-store/frontend/vite.config.ts 里同样…` 这类**说明性提及**
    到处都是，而它们绑不住两个项目。剥成空白而不是删掉，是为了不破坏 `enumerate` 的行号。
    字符串与模板字面量里的 `//`（如 `https://`）靠状态机区分，不会被误当注释。
    """
    out: list[str] = []
    index = 0
    length = len(text)
    mode = "code"
    while index < length:
        char = text[index]
        nxt = text[index + 1] if index + 1 < length else ""
        if mode == "code":
            if char == "/" and nxt == "/":
                mode, index = "line", index + 2
                out.append("  ")
                continue
            if char == "/" and nxt == "*":
                mode, index = "block", index + 2
                out.append("  ")
                continue
            if char in "'\"`":
                mode = char
            out.append(char)
            index += 1
            continue
        if mode == "line":
            if char == "\n":
                mode = "code"
                out.append(char)
            else:
                out.append(" ")
            index += 1
            continue
        if mode == "block":
            if char == "*" and nxt == "/":
                mode, index = "code", index + 2
                out.append("  ")
                continue
            out.append("\n" if char == "\n" else " ")
            index += 1
            continue
        # 字符串 / 模板字面量内部：转义与闭合
        if char == "\\":
            out.append(char)
            out.append(nxt)
            index += 2
            continue
        if char == mode:
            mode = "code"
        out.append(char)
        index += 1
    return "".join(out)


def check_frontend_source(root: Path) -> tuple[list[str], str]:
    """2. 前端源码隔离：互不引用；跨界只允许 ``@homeos/shared``。"""
    found: list[str] = []
    frontend_roots = {
        APP_PROJECT: root / APP_PROJECT / "frontend",
        STORE_PROJECT: root / STORE_PROJECT / "frontend",
    }
    for project, own_root in frontend_roots.items():
        sibling = STORE_PROJECT if project == APP_PROJECT else APP_PROJECT
        sibling_root = frontend_roots[sibling]
        if not own_root.is_dir():
            found.append(f"{project}/frontend 不存在 —— 目录改名后本项会静默通过，请同步本脚本")
            continue
        allowed_scope = re.compile(rf"^{re.escape(SHARED_TS_PACKAGE)}(/|$)")
        for path in _iter_files(own_root, FRONTEND_SUFFIXES):
            rel = path.relative_to(root)
            raw = path.read_text(encoding="utf-8", errors="replace")
            text = _blank_js_comments(raw)
            for lineno, line in enumerate(text.splitlines(), start=1):
                # 2a. import 说明：只放行 @homeos/shared 这一条跨界通道。
                for spec in IMPORT_SPEC_RE.findall(line):
                    if spec.startswith("@homeos/") and not allowed_scope.match(spec):
                        found.append(
                            f"{rel}:{lineno} 引用了非共享的 @homeos 作用域（{spec}）—— "
                            f"跨界只允许 {SHARED_TS_PACKAGE}"
                        )
                    resolved = _resolve_relative(path, spec)
                    if resolved and _is_within(resolved, sibling_root):
                        found.append(
                            f"{rel}:{lineno} 相对导入直达兄弟项目源码（{spec}）—— "
                            f"跨界只允许 {SHARED_TS_PACKAGE}"
                        )
                # 2b. 字符串字面量里的兄弟项目**路径**（vite alias / 配置路径常这么写）。
                for literal in re.findall(r"""['"`]([^'"`]+)['"`]""", line):
                    hit = _sibling_hit(project, "const", literal)
                    if hit:
                        found.append(
                            f"{rel}:{lineno} 字符串里出现兄弟项目路径（{literal!r}）—— "
                            f"构建配置也会把两个项目绑死，请改走共享包"
                        )
    return found, f"前端源码隔离：两前端互不引用，跨界仅 {SHARED_TS_PACKAGE}"


def check_package_dependencies(root: Path) -> tuple[list[str], str]:
    """3. 包依赖隔离。"""
    found: list[str] = []
    for project in (APP_PROJECT, STORE_PROJECT):
        sibling = STORE_PROJECT if project == APP_PROJECT else APP_PROJECT
        manifest = root / project / "package.json"
        if not manifest.is_file():
            found.append(f"{project}/package.json 不存在 —— 本项会静默通过，请同步本脚本")
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for section in ("dependencies", "devDependencies", "optionalDependencies"):
            for name in data.get(section) or {}:
                if name == sibling:
                    found.append(f"{project}/package.json 的 {section} 依赖了兄弟项目（{name}）")
    return found, "包依赖隔离：两项目的 package.json 互不依赖"


def _app_hit(text: str) -> str | None:
    """共享包视角：一段可执行文本是否引用了**任一**应用（两个项目都试一遍）。"""
    for project in (APP_PROJECT, STORE_PROJECT):
        hit = _sibling_hit(project, "const", text)
        if hit:
            return f"{project}:{hit}"
    return None


def check_shared_package_boundary(root: Path) -> tuple[list[str], str]:
    """6. 共享包边界：``packages/shared`` 不得反向引用任一应用（源码或清单）。

    为什么需要它 —— 第 2 项只看两个**应用**的 frontend，从不看 ``packages/shared/src``；
    于是「共享包 import 应用的东西」这个方向**没有任何门禁**。它同样是 monorepo 里不会露头的
    事故：类型检查（共享包自己的 tsconfig 没有应用的 `@/` 别名）会报错，但若别名恰好能解析成
    相对路径、或有人往共享包里塞了一个指向应用的字符串路径，就要等**单独发布 / 单独构建共享包**
    时才炸 —— 而它恰恰是「两个应用各自内联一份」的那一份，炸的是两个应用。
    """
    found: list[str] = []
    shared_root = root / SHARED_TS_SRC
    src_root = shared_root / "src"
    if not src_root.is_dir():
        found.append(f"{SHARED_TS_SRC}/src 不存在 —— 目录改名后本项会静默通过，请同步本脚本")
        return found, "共享包边界：目录缺失"

    app_frontends = [root / APP_PROJECT / "frontend", root / STORE_PROJECT / "frontend"]
    for path in _iter_files(src_root, FRONTEND_SUFFIXES):
        rel = path.relative_to(root)
        text = _blank_js_comments(path.read_text(encoding="utf-8", errors="replace"))
        for lineno, line in enumerate(text.splitlines(), start=1):
            for spec in IMPORT_SPEC_RE.findall(line):
                if spec.startswith(APP_ALIAS_PREFIXES):
                    found.append(
                        f"{rel}:{lineno} 共享包 import 了应用内部别名（{spec}）—— "
                        f"该别名只在应用里有定义，{SHARED_TS_PACKAGE} 必须自足"
                    )
                    continue
                if spec in (APP_PROJECT, STORE_PROJECT):
                    found.append(f"{rel}:{lineno} 共享包 import 了应用包名（{spec}）")
                    continue
                resolved = _resolve_relative(path, spec)
                if resolved and any(_is_within(resolved, app / "src") for app in app_frontends):
                    found.append(
                        f"{rel}:{lineno} 共享包相对导入直达应用源码（{spec}）—— "
                        f"依赖方向反了：只允许应用 import {SHARED_TS_PACKAGE}"
                    )
            for literal in re.findall(r"""['"`]([^'"`]+)['"`]""", line):
                hit = _app_hit(literal)
                if hit:
                    found.append(f"{rel}:{lineno} 字符串里出现应用路径（{literal!r}，命中 {hit}）")

    manifest = shared_root / "package.json"
    if not manifest.is_file():
        found.append(f"{SHARED_TS_SRC}/package.json 不存在 —— 本项会静默通过，请同步本脚本")
    else:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            for name in data.get(section) or {}:
                if name in (APP_PROJECT, STORE_PROJECT):
                    found.append(f"{SHARED_TS_SRC}/package.json 的 {section} 依赖了应用（{name}）")

    return found, f"共享包边界：{SHARED_TS_SRC} 不反向引用任一应用"


def _parse_dockerfile(root: Path) -> tuple[dict[str, list[tuple[str, str | None]]], list[str]]:
    """解析出「阶段 → COPY 列表」；每项是 ``(源, --from 的值或 None)``。"""
    dockerfile = root / "Dockerfile"
    if not dockerfile.is_file():
        return {}, ["仓库根 Dockerfile 不存在 —— 镜像断言会静默通过，请同步本脚本"]
    stages: dict[str, list[tuple[str, str | None]]] = {}
    current: str | None = None
    for line in dockerfile.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = FROM_STAGE_RE.match(stripped)
        if match:
            # `re.Match.group` 静态类型是 Any，直接赋值会被 `current: str | None` 的声明
            # 重新放宽回 Optional，下面 `setdefault(current, …)` 就会报实参类型错。
            # `str()` 收敛成 str（运行期 group(1) 本就是 str）。
            current = str(match.group(1)).lower()
            stages.setdefault(current, [])
            continue
        copy_match = COPY_RE.match(stripped)
        if copy_match and current is not None:
            from_flag = re.search(r"--from=(\S+)", copy_match.group(1))
            remainder = re.sub(r"--\S+=\S+", "", copy_match.group(1)).split()
            source = remainder[0] if remainder else ""
            stages[current].append((source, from_flag.group(1) if from_flag else None))
    return stages, []


def _stage_from_image(text: str, stage: str) -> str | None:
    """取某阶段 ``FROM <image> AS <stage>`` 里的基础镜像名（小写）。"""
    for line in text.splitlines():
        match = FROM_STAGE_RE.match(line.strip())
        if match and match.group(1).lower() == stage:
            return line.strip().split()[1].lower()
    return None


def _project_case_branches(block: str) -> tuple[list[str], list[str]]:
    """抠出构建阶段里 ``case "$PROJECT" in … esac`` 的项目分支名（不含 ``*`` 兜底）。

    抠不到、抠到多个、或分支体是空的，都当**问题**报出去 —— 解析型判据最典型的死法就是
    「匹配不到就跳过」，那样它会永远打印通过，而项目名写错照样溜过去。兜底分支 ``*)``
    不计入分支名：它是「未知项目 → 失败」，不是一个项目。
    """
    matches = PROJECT_CASE_RE.findall(block)
    if len(matches) != 1:
        return [], [
            (
                f'{BUILD_STAGE} 里 `case "$PROJECT" in … esac` 出现 {len(matches)} 次（期望恰好 1 次）'
                " —— 抠不到分支就无法核对项目集"
            )
        ]
    names: list[str] = []
    problems: list[str] = []
    for raw in matches[0].split(";;"):
        # 分支体是跨行的（Dockerfile 用 `\` 续行），先把续行折成空格再切分。
        branch = raw.replace("\\\n", " ").strip()
        if not branch:
            continue
        pattern, separator, body = branch.partition(")")
        if not separator:
            problems.append(f"{BUILD_STAGE} 的 PROJECT 分支无法解析：{branch!r}")
            continue
        pattern = pattern.strip().strip("'\"")
        if not body.strip():
            problems.append(
                f"{BUILD_STAGE} 的 PROJECT 分支 {pattern!r} 是空体 —— 分支必须真的做事"
                "（选启动器 / 落后遗留目录并断言），空体等于这个项目没被处理"
            )
        if pattern == "*":
            continue
        names.append(pattern)
    if not names:
        problems.append(f"{BUILD_STAGE} 的 case 里没有任何具体项目分支（只剩兜底 `*`？）")
    return names, problems


def _project_table(root: Path) -> tuple[dict[str, dict[str, str]], list[str]]:
    """读 ``ops/build.py`` 的 ``PROJECTS`` 表（``class Project`` 的字段名 + 每条记录）。

    刻意**不 import** 那个脚本：它在 import 期就要 argparse、找 docker，把门禁的成败绑在
    运行环境上不值。AST 只认字面量结构，读不出就当问题报出去（表一改名这项就得有人来改，
    而不是静默失效）。
    """
    path = root / BUILD_SCRIPT
    if not path.is_file():
        return {}, [f"{BUILD_SCRIPT} 不存在 —— 项目派发表读不到，本项会静默通过，请同步本脚本"]
    tree = ast.parse(path.read_text(encoding="utf-8"))
    fields: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Project":
            fields = [
                item.target.id
                for item in node.body
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)
            ]
    if not fields:
        return {}, [f"{BUILD_SCRIPT} 里读不到 `class Project` 的字段定义 —— 表结构变了，请同步本脚本"]
    table_node: ast.expr | None = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) == "PROJECTS":
            table_node = node.value
    if not isinstance(table_node, ast.Dict):
        return {}, [f"{BUILD_SCRIPT} 里读不到字面量 `PROJECTS` 字典 —— 请同步本脚本"]
    table: dict[str, dict[str, str]] = {}
    problems: list[str] = []
    for key_node, value_node in zip(table_node.keys, table_node.values, strict=True):
        key = getattr(key_node, "value", None)
        # `ast.Call.args` 的元素静态类型是 `ast.expr`（没有 `value`），与上面的 `key` 同法用
        # getattr 取字面量节点。取出来不是 str 的（含 None）在下面判掉 —— 用「过滤后个数变少」
        # 而不是 `all(isinstance(...))`：静态分析不会据此把 list 的元素类型收窄。
        raw_args = (
            [getattr(arg, "value", None) for arg in value_node.args]
            if isinstance(value_node, ast.Call)
            else []
        )
        args = [item for item in raw_args if isinstance(item, str)]
        if not isinstance(key, str) or len(args) != len(raw_args):
            problems.append(f"{BUILD_SCRIPT} 的 PROJECTS 里有非字面量条目 —— 请同步本脚本")
            continue
        if len(args) != len(fields):
            problems.append(
                f"PROJECTS[{key!r}] 的位置参数 {len(args)} 个，与 `class Project` 的 "
                f"{len(fields)} 个字段不匹配"
            )
            continue
        table[key] = dict(zip(fields, args, strict=True))
    return table, problems


def check_image_stages(root: Path) -> tuple[list[str], str]:
    """4. 镜像阶段隔离（P5 起是「单构建阶段 + ARG 选源」的形态）。"""
    found: list[str] = []
    stages, parse_problems = _parse_dockerfile(root)
    found.extend(parse_problems)
    if not stages:
        return found, "镜像阶段隔离：Dockerfile 未解析到任何阶段"
    dockerfile = root / "Dockerfile"
    text = dockerfile.read_text(encoding="utf-8") if dockerfile.is_file() else ""
    block = _stage_block(text, BUILD_STAGE) if text else ""

    # 4a. 构建阶段：源码只能由 ARG 选，不得写死项目名（写死 = 另一个镜像装错源码）。
    copies = stages.get(BUILD_STAGE)
    if copies is None:
        found.append(f"Dockerfile 里找不到构建阶段 {BUILD_STAGE} —— 改名后本项会静默通过，请同步本脚本")
    else:
        sources = [source for source, _ in copies]
        if BUILD_SOURCE_COPY not in sources:
            found.append(
                f"{BUILD_STAGE} 未 COPY {BUILD_SOURCE_COPY}（当前 COPY：{sources}）—— "
                f"两个项目共用同一阶段，源码只能由 --build-arg PROJECT 选"
            )
        for source in sources:
            if BACKEND_SRC_RE.match(source):
                found.append(
                    f"{BUILD_STAGE} COPY 了**字面量**项目源码目录（{source}）—— 写死哪个项目，"
                    f"另一个项目的镜像就会装错源码；这里只允许 {BUILD_SOURCE_COPY}"
                )
        if not block:
            found.append(
                f"Dockerfile 里解析不到 {BUILD_STAGE} 的指令块 —— 下面的 ARG / 项目分支核对会失去判据"
            )

    # 4b. ARG PROJECT 必须必传；case 分支与 ops/build.py 的项目表必须两侧一致。
    if block:
        defaults = BUILD_PROJECT_ARG.findall(block)
        if not defaults:
            found.append(f"{BUILD_STAGE} 里没有 `ARG PROJECT` —— 源码那行会把空值当项目目录")
        elif any(default for default in defaults):
            found.append(
                f"{BUILD_STAGE} 的 `ARG PROJECT` 带了默认值 —— 必须无默认值：漏传要失败，"
                f"有默认值就会静默编出另一个项目的后端"
            )
        branches, branch_problems = _project_case_branches(block)
        found.extend(branch_problems)
        table, table_problems = _project_table(root)
        found.extend(table_problems)
        for key, expected_dir in PROJECT_DIRS.items():
            row = table.get(key)
            if row is None:
                if table:
                    found.append(
                        f"{BUILD_SCRIPT} 的 PROJECTS 里没有项目 {key!r} —— 少了就没人核对，请同步本脚本"
                    )
                continue
            source = row.get("source")
            if source != expected_dir:
                found.append(
                    f"{BUILD_SCRIPT} 的 PROJECTS[{key!r}].source = {source!r}，期望 {expected_dir!r} —— "
                    f"这个值就是 --build-arg PROJECT，写错就是编出另一个项目的后端"
                )
            elif branches and source not in branches:
                found.append(
                    f"PROJECTS[{key!r}].source = {source!r} 不在 {BUILD_STAGE} 的 case 分支里"
                    f"（{sorted(branches)}）"
                )
            if row.get("name") != expected_dir:
                found.append(
                    f"{BUILD_SCRIPT} 的 PROJECTS[{key!r}].name = {row.get('name')!r}，"
                    f"期望 {expected_dir!r}（产物目录名）"
                )
        extra = sorted(key for key in table if key not in PROJECT_DIRS)
        if extra:
            found.append(
                f"{BUILD_SCRIPT} 的 PROJECTS 多了项目 {extra} —— 请同步本脚本的 PROJECT_DIRS 与 Dockerfile 的 case"
            )
        if branches and set(branches) != set(PROJECT_DIRS.values()):
            found.append(
                f"{BUILD_STAGE} 的 case 分支 {sorted(branches)} 与已知项目目录 "
                f"{sorted(PROJECT_DIRS.values())} 不一致"
            )

    # 4c. 导出阶段：FROM scratch + 只 COPY 构建阶段（多拷一层就会把整个 rootfs 带进本地导出）。
    export_copies = stages.get(EXPORT_STAGE)
    if export_copies is None:
        found.append(f"Dockerfile 里找不到导出阶段 {EXPORT_STAGE} —— 改名后本项会静默通过，请同步本脚本")
    else:
        base = _stage_from_image(text, EXPORT_STAGE) if text else None
        if base != "scratch":
            found.append(
                f"{EXPORT_STAGE} 的基础镜像不是 scratch（{base!r}）—— --output type=local 会把整个 rootfs 导出"
            )
        if export_copies != [("/app/", BUILD_STAGE)]:
            found.append(
                f"{EXPORT_STAGE} 只允许 `COPY --from={BUILD_STAGE} /app/ /`，当前：{export_copies}"
            )

    # 4d. 运行阶段：只装自己的产物，且不在镜像里编译后端。
    for stage, dist_prefix in RUNTIME_STAGE_DIST.items():
        runtime_copies = stages.get(stage)
        if runtime_copies is None:
            found.append(f"Dockerfile 里找不到运行阶段 {stage} —— 改名后本项会静默通过，请同步本脚本")
            continue
        sibling_prefix = RUNTIME_STAGE_DIST["store"] if stage == "app" else RUNTIME_STAGE_DIST["app"]
        for source, from_stage in runtime_copies:
            if source.startswith(sibling_prefix):
                found.append(f"{stage} 运行阶段 COPY 了兄弟项目的产物（{source}）")
            if from_stage and from_stage.lower() in RUNTIME_FORBIDDEN_FROM:
                found.append(
                    f"{stage} 运行阶段 COPY --from={from_stage} —— 两个镜像只组装 dist/ 里的产物，"
                    f"不得跨用构建阶段"
                )
        if not any(source.startswith(dist_prefix) for source, _ in runtime_copies):
            found.append(f"{stage} 运行阶段未 COPY 自己的产物（期望前缀 {dist_prefix}）")
    return found, "镜像阶段隔离：单构建阶段按 ARG 选源，运行阶段各装各的产物"


def _stage_block(dockerfile: str, stage: str) -> str:
    """截取某阶段的指令块（从 `FROM ... AS <stage>` 到下一个 FROM）。"""
    lines = dockerfile.splitlines()
    start = None
    for index, line in enumerate(lines):
        match = FROM_STAGE_RE.match(line.strip())
        if match and match.group(1).lower() == stage:
            start = index
            break
    if start is None:
        return ""
    for end in range(start + 1, len(lines)):
        if FROM_STAGE_RE.match(lines[end].strip()):
            return "\n".join(lines[start:end])
    return "\n".join(lines[start:])


def check_shared_python_inline(root: Path) -> tuple[list[str], str]:
    """5. 共享 Python 包内联（``packages/shared-py`` 存在时生效）。

    真源已随 P3c 落地，故正常路径上是硬检查；只有目录被搬走 / 重命名时才会退回这里的 N/A
    分支（显式打印原因，且自检 5a/5b/5c 是在**真实接线**上做撤回式注入的，不是靠这个分支兜）。
    """
    shared_py = root / SHARED_PY_SRC
    if not shared_py.is_dir():
        return [], (
            f"[N/A] 共享 Python 包内联：{SHARED_PY_SRC} 不存在 —— 若这是有意的，请确认没有模块"
            f"再从 {SHARED_PY_PACKAGE} 导入，并同步 ops/check/check_shared_contracts.py 第 9 项"
        )
    found: list[str] = []
    stages, parse_problems = _parse_dockerfile(root)
    found.extend(parse_problems)
    dockerfile = root / "Dockerfile"
    if not dockerfile.is_file():
        # 「Dockerfile 不存在」已由 _parse_dockerfile 记下。这里必须提前返回：直接读会抛
        # FileNotFoundError 把整条门禁带崩 —— 门禁自己崩掉比门禁报错难排查得多
        # （traceback 里看不出是哪一项检查没做完）。自检第 4f 项就是压这条路径的。
        return found, "共享 Python 包内联：Dockerfile 缺失，无法核对"
    text = dockerfile.read_text(encoding="utf-8")
    # P5 起两个项目共用一个构建阶段（ARG 选源），所以这里只需核对这一个阶段 ——
    # 它 COPY 一次、断言一次，两个镜像就都拿到了自己的那份编译副本。
    for stage in (BUILD_STAGE,):
        copies = stages.get(stage) or []
        if not any(source.startswith(SHARED_PY_SRC) for source, _ in copies):
            found.append(
                f"{stage} 未 COPY {SHARED_PY_SRC} —— 共享 Python 包必须由构建阶段"
                f"内联（{SHARED_PY_PACKAGE}），否则就成了运行期跨镜像依赖"
            )
            continue
        block = _stage_block(text, stage)
        find_line = next(
            (line for line in block.splitlines() if re.search(r"\bfind\s+/app\b", line)),
            "",
        )
        if not find_line:
            found.append(
                f"{stage} 的产物断言里没有 `find /app ...` —— 无法确认共享包的 .py 残留会被拦下"
            )
        elif f"/app/{SHARED_PY_PACKAGE}" not in find_line:
            found.append(
                f"{stage} 的 `find` 断言未覆盖 /app/{SHARED_PY_PACKAGE} —— "
                f"共享包编译漏掉时不会被拦下（COPY 那行不算数，要出现在 find 的路径里）"
            )
    return found, f"共享 Python 包内联：构建阶段自己 COPY {SHARED_PY_SRC}"


#: 全部检查项（名字 → 函数）；顺序即输出顺序。
CHECKS = (
    check_backend_source,
    check_frontend_source,
    check_package_dependencies,
    check_image_stages,
    check_shared_python_inline,
    check_shared_package_boundary,
)


def run(root: Path) -> tuple[list[str], list[str]]:
    """跑全部检查，返回 ``(问题, 说明)``。"""
    problems: list[str] = []
    notes: list[str] = []
    for check in CHECKS:
        found, note = check(root)
        problems.extend(found)
        notes.append(("[PASS] " if not found else "[FAIL] ") + note)
    return problems, notes


def main() -> int:
    parser = argparse.ArgumentParser(description="独立部署护栏")
    parser.add_argument("--root", default=None, help="被检查的仓库根（自检用；默认脚本上一级）")
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]

    problems, notes = run(root)
    for note in notes:
        print(note)
    if problems:
        print(f"\n独立部署护栏未通过（{len(problems)} 条）：")
        for message in problems:
            print(f"  - {message}")
        return 1
    print("\n独立部署护栏通过：两个项目只经共享包交互，镜像各自内联自己的产物。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
