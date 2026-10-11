#!/usr/bin/env python3
"""TS ↔ Python 共享契约门禁：用黄金向量对账至少一个孪生清单。

``@homeos/shared`` 是 TypeScript 真源，主应用 Python 侧手抄了子集（不能 import 前端包）。
漂移的表现是「前端房间 Tab 有客厅、后端语音解析认不出」。
本脚本只做源码解析 + JSON 对账，不跑 tsc / 不 import 后端包。

检查：

    1. ``ops/contracts/shared-twins.json`` 可解析；
2. 默认房间 id：``room/catalog.ts`` ↔ ``services/app_config/rooms.py`` ↔ 黄金列表（顺序敏感）；
3. 后端孪生模块：``backendTwinModules`` 登记的成对文件，剥掉 docstring 后 AST 必须一致 ——
   两个后端独立部署、各自编译成内嵌 ``.so``，禁止互相 import，只能「各存一份 + 门禁兜底」，
   替代原先靠 docstring 提醒人工同步；
4. 源码树不得残留构建期产物（``_version.py``）：它被 ``.gitignore``，只该由 Dockerfile 在镜像里
   烘入，残留在源码里会盖过 package.json 的真实版本号；
5. 容器启动契约：镜像把源码目录 ``COPY .../src ./<包>`` 映射成包名，启动器必须用同一个包名
   声明入口（主应用 ``uvicorn "包.模块:工厂"``、商店 ``-c "import 包.模块 as m"``），且该符号
   在源码里确有定义。这三处漏改任一处，源码态测试全绿、起容器即 ImportError。

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

TS_ROOMS = ROOT / "homeos" / "packages" / "shared" / "src" / "room" / "catalog.ts"
PY_ROOMS = ROOT / "homeos" / "backend" / "src" / "services" / "app_config" / "rooms.py"

#: `COPY <src> ./<pkg>`：源码目录 → 镜像内包名。容器布局全靠这一行，改它得同步启动器。
_DOCKER_COPY_PACKAGE = re.compile(r"^\s*COPY\s+(\S+)\s+\./(\w+)\s*$", re.MULTILINE)
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
    """``COPY <src> ./<pkg>`` → ``{源码目录: 镜像内包名}``（Cython 据此烤出 ``.so`` 的模块名）。"""
    return dict(_DOCKER_COPY_PACKAGE.findall(path.read_text(encoding="utf-8")))


def _docker_copy_target(path: Path, source: str) -> str | None:
    """该源码目录在 Dockerfile 里的实际 COPY 目标。

    用来把「层次被改深（``./backend/app``）」和「压根没 COPY」区分开 —— 两者的修法不同。
    """
    pattern = re.compile(rf"^\s*COPY\s+{re.escape(source)}\s+(\S+)\s*$", re.MULTILINE)
    match = pattern.search(path.read_text(encoding="utf-8"))
    return match.group(1) if match else None


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
    boot = golden.get("containerBoot")

    ts_rooms = load_ts_rooms(TS_ROOMS.read_text(encoding="utf-8"))
    py_rooms = load_py_rooms(PY_ROOMS.read_text(encoding="utf-8"))

    problems = [
        item
        for item in (
            _same("TS 房间目录 id", ts_rooms, expected_rooms),
            _same("Python 房间目录 id", py_rooms, expected_rooms),
            *check_twins(twins),
            *check_source_hygiene(),
            *(check_container_boot(boot) if boot else []),
        )
        if item
    ]
    if problems:
        return _fail("；".join(problems))

    boot_note = f"，容器入口 {len(boot['entries'])} 处" if boot else ""
    print(
        f"共享契约：通过（房间目录 {len(expected_rooms)} 项，"
        f"后端孪生模块 {len(twins)} 对{boot_note}，无构建期残留）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
