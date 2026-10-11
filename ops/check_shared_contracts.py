#!/usr/bin/env python3
"""TS ↔ Python 共享契约门禁：用黄金向量对账至少一个孪生清单。

``@homeos/shared`` 是 TypeScript 真源，主应用 Python 侧手抄了子集（不能 import 前端包）。
漂移的表现是「前端房间 Tab 有客厅、后端语音解析认不出」。
本脚本只做源码解析 + JSON 对账，不跑 tsc / 不 import 后端包。

检查：

    1. ``ops/contracts/shared-twins.json`` 可解析；
2. 默认房间 id：``room/catalog.ts`` ↔ ``services/app_config/rooms.py`` ↔ 黄金列表（顺序敏感）；
3. 后端孪生模块：``backendTwinModules``（**现为空**）登记的成对文件，剥掉 docstring 后 AST 必须一致。
   这两个后端独立部署、各自编译成内嵌 ``.so``，禁止互相 import，原先只能「各存一份 + 门禁兜底」——
   最初登记的两个模块（``logging_noise`` / ``core/file_lock``）现已收进 ``packages/shared-py`` 成为
   唯一真源（构建期各自内联），清单随之清零；机制与自检都保留，供将来确实无法共享的模块登记；
4. 源码树不得残留构建期产物（``_version.py``）：它被 ``.gitignore``，只该由 Dockerfile 在镜像里
   烘入，残留在源码里会盖过 package.json 的真实版本号；
5. 容器启动契约：镜像把源码目录 ``COPY .../src ./<包>`` 映射成包名，启动器必须用同一个包名
   声明入口（主应用 ``uvicorn "包.模块:工厂"``、商店 ``-c "import 包.模块 as m"``），且该符号
   在源码里确有定义。这三处漏改任一处，源码态测试全绿、起容器即 ImportError；
    6. 手持档判据的「手抄件」：入口场景给 ``<html>`` 挂 ``.hos-touch`` 的判据在
   ``packages/shared/src/scene/touch-profile.ts``，但 ``public/static/auth/scene/scene-depth.js``
   是构建缺口时由后端直接伺服的兜底资源、**不经过打包、无法 import**，只能各存一份。
   与后端孪生同类：不同步的表现是同一台设备在两个前端被分到不同档位；
7. TS 常量块 ↔ Python 手抄件（``tsPythonTwins``）：前端包不能被 Python import、后端也不吃 TS
   常量，枚举/白名单只能两边各存一份。按**字面量集合**对账（``dir`` 取 ``equal`` 或
   ``ts-subset``，比逐字 diff 松、比什么都不比严）。抽取不到块或项数低于 ``minItems`` 一律判
   **解析失败**，不静默放行；
8. 商店配色令牌名：TS 侧的 ``appearanceTokens()`` 能生成哪些 ``--hos-*`` / ``--hb-*`` 令牌，
   商店后端 ``ops/appearance.py`` 的校验器就必须**认得出**哪些 —— 认不出 = 管理员在设置界面
   保存配色时被 422 挡掉（前端生成得出来、后端存不进去）。该模块是纯标准库，本脚本仍只做
   源码解析（从 ``_TOKEN_NAME`` / ``_TOKEN_NAME_EXTRA`` 取正则与白名单），不 import 后端包；
9. 共享 Python 真源唯一：``packages/shared-py/homeos_shared/**`` 里的模块，两个后端的源码树里
   不得再出现同名文件。第 3 条（孪生清单）只能**事后**发现漂移，真源收拢之后要防的是相反方向 ——
   「又抄一份回后端」，而抄回去的那份多半还没人 import，类型检查与冒烟都不会响。

用法::

    20|    python ops/check_shared_contracts.py
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "ops" / "contracts" / "shared-twins.json"

TS_ROOMS = ROOT / "packages" / "shared" / "src" / "room" / "catalog.ts"
PY_ROOMS = ROOT / "homeos" / "backend" / "src" / "domains" / "app_config" / "rooms.py"

#: `COPY <src> ./<pkg>`：源码目录 → 镜像内包名。容器布局全靠这一行，改它得同步启动器。
_DOCKER_COPY_PACKAGE = re.compile(r"^\s*COPY\s+(\S+)\s+\./(\w+)\s*$", re.MULTILINE)
#: P5 把两个项目的构建阶段并成一个 `backend-build` 之后，源码那行只剩参数化形态：
#: `COPY ${PROJECT}/backend/src ./<pkg>`。`${PROJECT}` 的合法取值 = 项目名 = 仓库目录名
#: （`app`→`homeos`、`store`→`homeos-store`，由 `ops/build.py` 的 PROJECTS 与 Dockerfile 的
#: `case "$PROJECT"` 双向对账，见 `ops/check_deploy_independence.py`），所以这一行**同时**
#: 覆盖两个后端源码目录；包名仍必须是单层 `./<pkg>`，判据与字面量形态完全一样。
_DOCKER_COPY_PROJECT_SOURCE = re.compile(
    r"^\s*COPY\s+\$\{?PROJECT\}?/backend/src\s+\./(\w+)\s*$", re.MULTILINE
)
#: 同上，但保留完整目标串（`./app` / `./backend/app`）：`_docker_copy_target` 要拿它区分
#: 「层次被改深」和「压根没 COPY」，两种报错的修法不同。
_DOCKER_COPY_PROJECT_TARGET = re.compile(
    r"^\s*COPY\s+\$\{?PROJECT\}?/backend/src\s+(\S+)\s*$", re.MULTILINE
)
#: 启动器入口的两种写法：uvicorn 工厂串 `"pkg.mod:factory"`、`-c "import pkg.mod as m; ..."`。
_BOOT_UVICORN = re.compile(r"""["'](?P<module>[A-Za-z_][\w.]*):(?P<symbol>[A-Za-z_]\w*)["']""")
_BOOT_IMPORT = re.compile(r"""import\s+(?P<module>[A-Za-z_][\w.]*)\s+as\s+\w+""")
BOOT_PATTERNS = {"uvicorn": _BOOT_UVICORN, "import": _BOOT_IMPORT}

#: 构建期才注入的版本文件（均在 ``.gitignore`` 中）。源码树里一旦残留，``load_app_version()``
#: 会优先采信它，于是对外报出过期版本（实测过：package.json 是 0.7.4，应用却报 0.7.1）。
BUILD_ONLY_VERSION_FILES = (
    "homeos/backend/src/_version.py",
    "homeos-store/backend/src/_version.py",
)

_QUOTED = re.compile(r"""['"]([^'"]+)['"]""")
_TS_ROOM_ID = re.compile(r"^\s*id:\s*'([^']+)'\s*,?\s*$", re.MULTILINE)
_PY_ROOM_ENTRY = re.compile(r'_entry\(\s*"([^"]+)"')

#: 手持档判据：TS 真源 + 无法 import 它、只能手抄的兜底资源（见模块 docstring 第 6 条）。
_SCENE_DEPTH_TRUTH = ROOT / "packages" / "shared" / "src" / "scene" / "touch-profile.ts"
_SCENE_DEPTH_FALLBACKS = (
    ROOT / "homeos" / "frontend" / "public" / "static" / "auth" / "scene" / "scene-depth.js",
)
_TOUCH_MEDIA = re.compile(r"""matchMedia\(\s*['"]([^'"]+)['"]""")
#: 判据里另两个「信号」：触点数比较与 iPad 伪装 Mac 的平台正则。
_TOUCH_MARKERS = ("maxTouchPoints", "^Mac")


def _touch_signals(text: str) -> set[str]:
    """判据的「信号面」：查询串 + 被比较的量。比逐字比对宽，比什么都不比有意义。"""
    signals = {f"matchMedia({query})" for query in _TOUCH_MEDIA.findall(text)}
    signals.update(marker for marker in _TOUCH_MARKERS if marker in text)
    return signals


def _fail(message: str) -> int:
    print(f"契约漂移：{message}", file=sys.stderr)
    return 1


def _quoted_list(block: str) -> list[str]:
    return _QUOTED.findall(block)


def load_ts_rooms(text: str) -> list[str]:
    ids = _TS_ROOM_ID.findall(text)
    if not ids:
        raise ValueError(f"解析失败：{TS_ROOMS.relative_to(ROOT)} 找不到 id: '…'")
    return ids


def load_py_rooms(text: str) -> list[str]:
    ids = _PY_ROOM_ENTRY.findall(text)
    if not ids:
        raise ValueError(f"解析失败：{PY_ROOMS.relative_to(ROOT)} 找不到 _entry(\"…\")")
    return ids


def _same(label: str, actual: list[str], expected: list[str]) -> str | None:
    if actual != expected:
        return f"{label}：期望 {expected}，实际 {actual}"
    return None


def _strip_docstrings(node: ast.AST) -> None:
    """就地剥掉模块 / 类 / 函数的 docstring（递归）：副本可各自写侧别说明，只比代码。"""
    if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        body = node.body
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            node.body = body[1:] or [ast.Pass()]
    for child in ast.iter_child_nodes(node):
        _strip_docstrings(child)


def code_signature(path: Path) -> str:
    """与空白 / 注释 / docstring 无关的代码指纹（AST dump）。"""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    _strip_docstrings(tree)
    return ast.dump(tree, include_attributes=False)


def check_twins(pairs: list[dict[str, str]]) -> list[str]:
    """逐个比对孪生模块：缺文件或代码不一致都算漂移。"""
    problems: list[str] = []
    for pair in pairs:
        label = pair.get("label", "?")
        homeos = ROOT / pair["homeos"]
        store = ROOT / pair["store"]
        missing = [str(p.relative_to(ROOT)) for p in (homeos, store) if not p.exists()]
        if missing:
            problems.append(f"{label}：文件缺失 {missing}")
            continue
        if code_signature(homeos) != code_signature(store):
            problems.append(
                f"{label}：{pair['homeos']} 与 {pair['store']} 代码不一致"
                "（两个后端独立部署、不可互相 import，改动后请同步另一份）"
            )
    return problems


#: 共享 Python 包（真源，见 ``packages/shared-py/README.md``）：两个后端不得再存同名副本。
#: 路径在调用时由 ``ROOT`` 拼出（而不是 import 时定死），自检才能把 ROOT 指向一份副本。
SHARED_PY_PACKAGE = "packages/shared-py/homeos_shared"
BACKEND_SOURCE_SUBPATHS = ("homeos/backend/src", "homeos-store/backend/src")


def shared_python_modules() -> list[Path]:
    """共享包里的模块文件（排除 ``__init__.py`` 与缓存目录）。"""
    package = ROOT / SHARED_PY_PACKAGE
    if not package.is_dir():
        return []
    return sorted(
        path
        for path in package.rglob("*.py")
        if path.name != "__init__.py" and "__pycache__" not in path.parts
    )


def check_shared_python_singleton() -> list[str]:
    """9. 共享 Python 包是真源：后端源码树里不得再出现同名文件。

    这是 ``backendTwinModules``（已空）的后继。孪生清单当年只能**事后**发现漂移；真源收拢之后，
    要防的是相反方向 ——「有人又抄一份回后端」。抄回去的那份通常还没人 import，于是类型检查、
    冒烟、knip 都不会响，却会在下一次改动时开始漂移，正是这次重构要消灭的那种形态。

    判据取「文件名相撞」而不是「内容相同」：内容相同只说明抄得完整；内容不同（抄完又改过）
    是更危险的一种，两者都要拦，故按内容是否一致分别说明，便于一眼判断是哪种。
    """
    package = ROOT / SHARED_PY_PACKAGE
    if not package.is_dir():
        return []
    modules = shared_python_modules()
    if not modules:
        return [
            (
                f"解析失败：{SHARED_PY_PACKAGE} 下没有任何模块 —— "
                "门禁已看不见共享包内容（目录被搬走 / 清空？），拒绝放行"
            )
        ]
    problems: list[str] = []
    for module in modules:
        reference = code_signature(module)
        for source in (ROOT / sub for sub in BACKEND_SOURCE_SUBPATHS):
            for candidate in source.rglob(module.name):
                if "__pycache__" in candidate.parts:
                    continue
                relationship = (
                    "内容与共享包一致，是完整副本"
                    if code_signature(candidate) == reference
                    else "内容已与共享包不同，属于改过一份、最容易开始漂移"
                )
                problems.append(
                    f"{candidate.relative_to(ROOT)} 是共享模块 {module.relative_to(ROOT)} 的副本"
                    f"（{relationship}）：该模块只能有一份真源，请改为 "
                    "`from homeos_shared... import ...`"
                )
    return problems


def check_scene_depth_fallback() -> list[str]:
    """手持档判据（``.hos-touch``）：TS 真源 ↔ 无法 import 它的兜底资源，信号面必须一致。

    「解析不到就放行」是解析型门禁的通病，所以真源解析出的信号少于 3 个时直接判**解析失败**，
    而不是静默通过。
    """
    if not _SCENE_DEPTH_TRUTH.is_file():
        return [f"手持档判据真源缺失：{_SCENE_DEPTH_TRUTH.relative_to(ROOT)}"]
    truth = _touch_signals(_SCENE_DEPTH_TRUTH.read_text(encoding="utf-8"))
    problems: list[str] = []
    if len(truth) < 3:
        problems.append(
            f"解析失败：{_SCENE_DEPTH_TRUTH.relative_to(ROOT)} 只解析到信号 {sorted(truth)}，"
            "门禁已看不见判据真源（写法变了？），拒绝放行"
        )
    for path in _SCENE_DEPTH_FALLBACKS:
        if not path.is_file():
            problems.append(f"手持档兜底件缺失：{path.relative_to(ROOT)}")
            continue
        actual = _touch_signals(path.read_text(encoding="utf-8"))
        if actual != truth:
            problems.append(
                f"{path.relative_to(ROOT)} 的手持档判据与 "
                f"{_SCENE_DEPTH_TRUTH.relative_to(ROOT)} 不一致："
                f"真源 {sorted(truth)} / 兜底件 {sorted(actual)}"
                "（兜底件由后端直接伺服、不经过打包，改判据时必须同步另一份）"
            )
    return problems


#: TS 常量块的两种抽法：``values`` 取字符串字面量，``keys`` 取对象键（标识符键 + 引号键）。
_TS_COMMENTS = (re.compile(r"/\*.*?\*/", re.DOTALL), re.compile(r"(?<!:)//[^\n]*"))
_TS_STRING = re.compile(r"""['"]([^'"\n]{1,80})['"]""")
_TS_OBJECT_KEY = re.compile(r"""(?:^|[,{]\s*)(?:['"]([^'"]+)['"]|([A-Za-z_][A-Za-z0-9_]*))\s*:""", re.MULTILINE)
_BRACKETS = {"[": "]", "{": "}", "(": ")"}


def strip_ts_comments(text: str) -> str:
    """去掉 TS 注释：注释里的示例值不算契约（``://`` 不当行注释起点）。"""
    for pattern in _TS_COMMENTS:
        text = pattern.sub("", text)
    return text


def _balanced_block(text: str, start: int) -> str:
    """从 ``text[start]``（开括号）扫到配平结束，跳过字符串内的括号。"""
    opener = text[start]
    closer = _BRACKETS[opener]
    depth = 0
    quote = ""
    index = start
    while index < len(text):
        char = text[index]
        if quote:
            if char == "\\":
                index += 2
                continue
            if char == quote:
                quote = ""
        elif char in "'\"`":
            quote = char
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
        index += 1
    raise ValueError("字面量块括号不配平")


def ts_block_body(text: str, block: str) -> str:
    """取 ``const <block> … =`` 右侧的字面量块原文；找不到块直接抛错（不静默放行）。"""
    stripped = strip_ts_comments(text)
    match = re.search(rf"(?:export\s+)?const\s+{re.escape(block)}\b[^=\n]*=", stripped)
    if not match:
        raise ValueError(f"找不到 `const {block} … =`")
    rest = stripped[match.end() :]
    starts = [rest.index(char) for char in _BRACKETS if char in rest]
    if not starts:
        raise ValueError(f"`{block}` 右侧不是字面量块")
    return _balanced_block(rest, min(starts))


def ts_block_items(text: str, block: str, mode: str) -> set[str]:
    """字面量块里的项：``values`` 取字符串字面量，``keys`` 取对象键（标识符键 + 引号键）。"""
    body = ts_block_body(text, block)
    if mode == "values":
        return set(_TS_STRING.findall(body))
    return {quoted or identifier for quoted, identifier in _TS_OBJECT_KEY.findall(body)}


def py_block_items(tree: ast.Module, block: str | None, mode: str) -> set[str]:
    """取 Python 侧项集合；``block`` 为 ``None`` 表示整模块（Python 侧是组装函数时的退化口径）。"""
    node: ast.AST = tree
    if block is None:
        # 整模块口径要剥 docstring：文档里提一句事件名不该被当成「后端认识它」。
        _strip_docstrings(tree)
    else:
        node = _py_module_binding(tree, block)
    if mode == "keys":
        if not isinstance(node, ast.Dict):
            raise ValueError(f"`{block}` 不是字典字面量，取不了键")
        return {key.value for key in node.keys if isinstance(key, ast.Constant) and isinstance(key.value, str)}
    return {child.value for child in ast.walk(node) if isinstance(child, ast.Constant) and isinstance(child.value, str)}


def _py_module_binding(tree: ast.Module, name: str) -> ast.AST:
    """模块级 ``name = …`` 的右侧节点（只认顶层绑定，避免摸到函数里的同名局部量）。"""
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            # 只有标注没有赋值的绑定（``X: dict[str, str]``）不是手抄件，跳过。
            targets, value = [node.target], node.value
        else:
            continue
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            return value
    raise ValueError(f"找不到模块级 `{name} = …`")


def _twin_ts_items(twin: dict, label: str, problems: list[str]) -> set[str]:
    path = ROOT / twin["ts"]
    if not path.is_file():
        problems.append(f"{label}：TS 真源缺失 {twin['ts']}")
        return set()
    block = twin["tsBlock"]
    try:
        items = ts_block_items(path.read_text(encoding="utf-8"), block, twin.get("tsMode", "values"))
    except ValueError as exc:
        problems.append(f"{label}：解析失败——{twin['ts']} {exc}（写法变了？拒绝放行）")
        return set()
    floor = twin.get("minItems", {}).get("ts", 1)
    if len(items) < floor:
        problems.append(
            f"{label}：{twin['ts']} 的 {block} 只解析到 {len(items)} 项（下限 {floor}），疑似抽取失效，拒绝放行"
        )
    return items


def _twin_py_items(twin: dict, label: str, problems: list[str]) -> set[str]:
    items: set[str] = set()
    block = twin.get("pyBlock")
    for rel in twin["py"]:
        path = ROOT / rel
        if not path.is_file():
            problems.append(f"{label}：Python 手抄件缺失 {rel}")
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            items |= py_block_items(tree, block, twin.get("pyMode", "values"))
        except (SyntaxError, ValueError) as exc:
            problems.append(f"{label}：解析失败——{rel} {exc}（写法变了？拒绝放行）")
    floor = twin.get("minItems", {}).get("py", 1)
    if len(items) < floor:
        problems.append(f"{label}：Python 侧只解析到 {len(items)} 项（下限 {floor}），疑似抽取失效，拒绝放行")
    return items


def check_ts_python_twins(twins: list[dict]) -> list[str]:
    """TS 常量块 ↔ Python 手抄件的**字面量集合**对账（黄金文件 ``tsPythonTwins``）。

    比逐字 diff 松（顺序、注释、类型标注随便改），比什么都不比严（改名 / 漏抄必炸）。
    ``ignore`` 里每条豁免都要带 ``why``；豁免一旦失效（TS 侧没了、或两边都有）就报出来清理。
    """
    problems: list[str] = []
    for twin in twins:
        label = twin["label"]
        ignore = twin.get("ignore", [])
        for entry in ignore:
            if not isinstance(entry, dict) or not entry.get("why") or not entry.get("name"):
                problems.append(f"{label}：ignore 每条豁免都要写 name + why（豁免必须留下理由）")
        exempt = {entry["name"] for entry in ignore if isinstance(entry, dict) and entry.get("name")}
        ts_items = _twin_ts_items(twin, label, problems)
        py_items = _twin_py_items(twin, label, problems)
        if not ts_items or not py_items:
            continue
        ts_only = sorted(item for item in ts_items - py_items if item not in exempt)
        py_only = sorted(py_items - ts_items) if twin.get("dir", "equal") == "equal" else []
        if ts_only:
            problems.append(
                f"{label}：{twin['tsBlock']} 有 {len(ts_only)} 项在 Python 侧找不到 {ts_only}"
                "（两边各存一份、无法互相 import：改名请同步另一份；确属有意不对称就登记到该孪生的 ignore）"
            )
        if py_only:
            problems.append(
                f"{label}：Python 侧多出 {len(py_only)} 项 {py_only}"
                "（equal 型孪生要求两边同集；纯这侧多出的请改 dir=ts-subset 或登记 ignore）"
            )
        for entry in ignore:
            name = entry.get("name")
            if name and name not in ts_items:
                problems.append(f"{label}：ignore 里的 {name!r} 已不在 TS 侧（过期豁免，请删掉）")
            elif name and name in py_items:
                problems.append(f"{label}：ignore 里的 {name!r} 两边都有（豁免已无必要，请删掉）")
    return problems


#: 商店配色令牌：TS 生成令牌名 → 商店后端校验器必须认得（认不出 = 管理员保存配色被 422 挡）。
#: 该后端模块是纯标准库，但仍按本脚本的既有口径走源码解析（AST 取正则与白名单），不 import 后端包。
APPEARANCE_TS = Path("homeos-store") / "frontend" / "src" / "scene" / "appearance.ts"
APPEARANCE_PY = Path("homeos-store") / "backend" / "src" / "ops" / "appearance.py"
#: ``tokens[`--hb-${name}-soft`]``：前缀 + 循环变量 + 后缀。
_APPEARANCE_SHAPE = re.compile(r"""tokens\[\s*`--(?P<prefix>[a-z]+)-\$\{\w+\}(?P<suffix>[a-z-]*)`\s*\]""")
#: ``tokens["--hb-accent-grad-hover"]``：直写的单枚令牌。
_APPEARANCE_LITERAL = re.compile(r"""tokens\[\s*['"](--[^'"]+)['"]\s*\]""")
_APPEARANCE_MIN_NAMES = 4
_APPEARANCE_MIN_SHAPES = 8


def store_appearance_tokens(text: str) -> set[str]:
    """TS 能生成的令牌名全集：``CONFIGURABLE`` 的色名 × 形状（前缀 + 后缀）+ 直写令牌。"""
    names = ts_block_items(text, "CONFIGURABLE", "values")
    if len(names) < _APPEARANCE_MIN_NAMES:
        raise ValueError(f"`CONFIGURABLE` 只解析到 {len(names)} 个色名")
    shapes = _APPEARANCE_SHAPE.findall(strip_ts_comments(text))
    if len(shapes) < _APPEARANCE_MIN_SHAPES:
        raise ValueError(f"只解析到 {len(shapes)} 种令牌形状（如 `tokens[`--hos-${{name}}-rgb`]`）")
    tokens = {f"--{prefix}-{name}{suffix}" for prefix, suffix in shapes for name in names}
    return tokens | set(_APPEARANCE_LITERAL.findall(strip_ts_comments(text)))


def store_appearance_validator(text: str) -> tuple[re.Pattern[str], set[str]]:
    """后端校验器的（令牌名正则, 白名单）：正则只有一条，多一条即解析失败而非猜。"""
    tree = ast.parse(text)
    patterns = py_block_items(tree, "_TOKEN_NAME", "values")
    if len(patterns) != 1:
        raise ValueError(f"`_TOKEN_NAME` 解析到 {len(patterns)} 条正则字面量（期望 1 条）")
    return re.compile(next(iter(patterns))), py_block_items(tree, "_TOKEN_NAME_EXTRA", "values")


def check_store_appearance_tokens() -> list[str]:
    """商店配色令牌名：TS 生成得出来的，后端校验器必须认得出。

    漏改的表现是「前端能把配色渲染出来、管理员却存不进去」（422 带着用户可见文案），
    而源码态测试各跑各的永远发现不了。
    """
    missing = [str(rel) for rel in (APPEARANCE_TS, APPEARANCE_PY) if not (ROOT / rel).is_file()]
    if missing:
        return [f"商店配色令牌：文件缺失 {missing}"]
    try:
        tokens = store_appearance_tokens((ROOT / APPEARANCE_TS).read_text(encoding="utf-8"))
    except ValueError as exc:
        return [f"商店配色令牌：解析失败——{APPEARANCE_TS} {exc}（写法变了？拒绝放行）"]
    try:
        pattern, extra = store_appearance_validator((ROOT / APPEARANCE_PY).read_text(encoding="utf-8"))
    except (SyntaxError, ValueError) as exc:
        return [f"商店配色令牌：解析失败——{APPEARANCE_PY} {exc}（写法变了？拒绝放行）"]
    rejected = sorted(name for name in tokens if name not in extra and not pattern.match(name))
    if not rejected:
        return []
    return [
        (
            f"商店配色令牌：TS 能生成 {len(rejected)} 枚后端校验器不认的令牌 {rejected}"
            "（管理员保存这份配色会被 422 挡掉：改令牌名 / 后缀请同步 ops/appearance.py 的 _TOKEN_NAME）"
        )
    ]


def check_source_hygiene() -> list[str]:
    """源码树里不得残留构建期产物：它只该在镜像里由 Dockerfile 烘入。"""
    stale = [rel for rel in BUILD_ONLY_VERSION_FILES if (ROOT / rel).exists()]
    if not stale:
        return []
    return [
        (
            f"源码树残留构建期产物 {'、'.join(stale)}（已在 .gitignore）："
            "它会盖过 package.json 的真实版本号，请删除"
        )
    ]


def load_docker_packages(path: Path) -> dict[str, str]:
    """``COPY <src> ./<pkg>`` → ``{源码目录: 镜像内包名}``（Cython 据此烤出 ``.so`` 的模块名）。

    两种形态都认：

    * 字面量 ``COPY homeos/backend/src ./app``（P5 合并之前的样子）。继续支持有两个理由：本门禁的
      自检仍在合成小树上用它（自检要能独立证明「写死某个项目」这类漂移会被拦，不能反过来依赖被它
      守护的那份 Dockerfile 的当前写法）；将来若某个项目又要单独的构建阶段，也是这个形态。
    * 参数化 ``COPY ${PROJECT}/backend/src ./<pkg>``（P5 之后的唯一形态）。它一次覆盖全部后端源码
      目录 —— ``${PROJECT}`` 的取值域就是项目名，而项目名同时是仓库目录名（见
      ``ops/check_deploy_independence.py`` 里 PROJECTS 表与 case 分支的双向对账）。

    字面量优先（``setdefault``）：真出现「统一阶段 + 某个项目偷偷单独 COPY」时，让写死的那条生效，
    两边的包名就会不一致并报出来，而不是被参数化那条盖掉。
    """
    text = path.read_text(encoding="utf-8")
    packages = dict(_DOCKER_COPY_PACKAGE.findall(text))
    project_copy = _DOCKER_COPY_PROJECT_SOURCE.search(text)
    if project_copy:
        for source in BACKEND_SOURCE_SUBPATHS:
            packages.setdefault(source, project_copy.group(1))
    return packages


def _docker_copy_target(path: Path, source: str) -> str | None:
    """该源码目录在 Dockerfile 里的实际 COPY 目标。

    用来把「层次被改深（``./backend/app``）」和「压根没 COPY」区分开 —— 两者的修法不同。
    两种形态都算「这个源码目录」，理由同 `load_docker_packages`。
    """
    text = path.read_text(encoding="utf-8")
    patterns = (
        re.compile(rf"^\s*COPY\s+{re.escape(source)}\s+(\S+)\s*$", re.MULTILINE),
        _DOCKER_COPY_PROJECT_TARGET,
    )
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def boot_binding(launcher: Path, kind: str) -> tuple[str, str | None]:
    """取出启动器声明的入口 ``(module, symbol)``；符号可缺省（纯模块入口）。

    命中数不等于 1 就报错而非猜：说明启动器换了写法，门禁已「看不见」真正入口。
    """
    pattern = BOOT_PATTERNS[kind]
    hits = [match.groupdict() for match in pattern.finditer(launcher.read_text(encoding="utf-8"))]
    if len(hits) != 1:
        raise ValueError(
            f"解析失败：{launcher.relative_to(ROOT)} 里 {kind} 形式的入口有 {len(hits)} 处（期望 1 处）"
        )
    return hits[0]["module"], hits[0].get("symbol")


def _check_boot_symbol(label: str, module: str, symbol: str | None, source: Path) -> list[str]:
    """镜像包名 ``pkg`` 在源码里对应 ``src/``，故 ``pkg.mod`` ↔ ``src/mod.py``。"""
    if not symbol:
        return []
    parts = module.split(".")[1:]
    target = source.joinpath(*parts).with_suffix(".py") if parts else source / "__init__.py"
    if not target.is_file():
        return [f"容器入口 {label}：`{module}` 在源码里找不到 {target.relative_to(ROOT)}"]
    tree = ast.parse(target.read_text(encoding="utf-8"), filename=str(target))
    defined = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    defined |= {
        target_node.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign)
        for target_node in node.targets
        if isinstance(target_node, ast.Name)
    }
    if symbol not in defined:
        return [f"容器入口 {label}：`{module}:{symbol}` 在 {target.relative_to(ROOT)} 里没有定义"]
    return []


def check_container_boot(spec: dict) -> list[str]:
    """容器启动契约：镜像包名（Dockerfile）↔ 启动器入口 ↔ 源码符号，三者必须自洽。

    这三处任改一处漏改其余，表现都是「镜像能构建、起容器即 ImportError」——
    单测跑源码态永远发现不了，只有真正 build 才炸。故在源码解析层兜住。
    """
    dockerfile = ROOT / spec["dockerfile"]
    if not dockerfile.is_file():
        return [f"容器入口：找不到 {spec['dockerfile']}"]
    packages = load_docker_packages(dockerfile)
    problems: list[str] = []
    seen: dict[str, str] = {}
    for entry in spec["entries"]:
        label, launcher_rel = entry["label"], entry["launcher"]
        source = ROOT / entry["source"]
        launcher = ROOT / launcher_rel
        if not launcher.is_file():
            problems.append(f"容器入口 {label}：启动器缺失 {launcher_rel}")
            continue
        package = packages.get(entry["source"])
        if package is None:
            actual = _docker_copy_target(dockerfile, entry["source"])
            if actual:
                problems.append(
                    f"容器入口 {label}：{spec['dockerfile']} 把 {entry['source']} 映射到 `{actual}`，"
                    "不是单层包名 `./<包>`（容器层次被改深了，产物结构与启动器会一起偏）"
                )
            else:
                problems.append(
                    f"容器入口 {label}：{spec['dockerfile']} 里没有 `COPY {entry['source']} ./<包>`，"
                    "源码目录未映射进镜像"
                )
            continue
        seen[label] = package
        try:
            module, symbol = boot_binding(launcher, entry["bind"])
        except ValueError as exc:
            problems.append(str(exc))
            continue
        root_package = module.split(".")[0]
        if root_package != package:
            problems.append(
                f"容器入口 {label}：启动器声明 `{module}`，但镜像把 {entry['source']} 映射成包 "
                f"`{package}`（两边不同名，容器起来即 ImportError）"
            )
            continue
        problems.extend(_check_boot_symbol(label, module, symbol, source))
    if len(set(seen.values())) > 1:
        problems.append(f"两个后端的镜像包名不一致 {seen}（应统一，产物层数才有可比性）")
    return problems


def main() -> int:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    expected_rooms = list(golden["roomCatalogIds"])
    twins = list(golden.get("backendTwinModules", []))
    ts_py_twins = list(golden.get("tsPythonTwins", []))
    boot = golden.get("containerBoot")

    ts_rooms = load_ts_rooms(TS_ROOMS.read_text(encoding="utf-8"))
    py_rooms = load_py_rooms(PY_ROOMS.read_text(encoding="utf-8"))

    problems = [
        item
        for item in (
            _same("TS 房间目录 id", ts_rooms, expected_rooms),
            _same("Python 房间目录 id", py_rooms, expected_rooms),
            *check_twins(twins),
            *check_shared_python_singleton(),
            *check_ts_python_twins(ts_py_twins),
            *check_store_appearance_tokens(),
            *check_scene_depth_fallback(),
            *check_source_hygiene(),
            *(check_container_boot(boot) if boot else []),
        )
        if item
    ]
    if problems:
        return _fail("；".join(problems))

    boot_note = f"，容器入口 {len(boot['entries'])} 处" if boot else ""
    shared_modules = shared_python_modules()
    print(
        f"共享契约：通过（房间目录 {len(expected_rooms)} 项，"
        f"共享 Python 真源 {len(shared_modules)} 个模块（后端无副本），"
        f"后端孪生模块 {len(twins)} 对，TS↔Python 常量块 {len(ts_py_twins)} 对，"
        f"商店配色令牌与后端校验器对齐，"
        f"手持档兜底件 {len(_SCENE_DEPTH_FALLBACKS)} 份{boot_note}，"
        "无构建期残留）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
