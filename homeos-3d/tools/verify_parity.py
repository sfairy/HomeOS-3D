#!/usr/bin/env python3
"""五张（+两张）对账门禁：确认 0.6.7 -> 0.6.7-ts 的迁移没有丢业务逻辑。

设计前提
--------
迁移是「重写」而不是「搬运」：`.js` -> `.ts`、`frontend/` 源码 -> `frontend/src/`、
Vite 打包后文件名带内容哈希。因此不能拿生成物逐字节对比，只能按「契约」对比：

G1 文件对账    源 `.js` 全部有目标，且目标文件真实存在、无碰撞。
G2 导出对账    旧模块导出的每个符号，新模块仍然导出（名字一个字都不能变，
               因为跨文件引用与动态 import 都按名字找）。
G3 契约串对账  旧代码里带 `/` 的字符串（URL / 路径 / 选择器），去掉已知口径改写
               后必须仍能在新代码里找到。这条最像"业务逻辑"本身。
G4 页面结构对账  8 个页面 HTML 的 id / class / 标签多重集合必须一致 ——
               后端路由、中间件、前端脚本都按这些名字定位。
G5 后端路由对账  0.6.7 后端暴露的每条路由 / 挂载点，新后端仍然暴露。
G6 产物可服务对账  页面 HTML 引用的每个 `/static/**` 在 dist 里真实存在；
               公开页引用的资源必须在匿名白名单里（否则未登录白屏）。
G7 运行时清单自洽  dist/modules/runtime 里每个相对 import 都能在清单里解析到，
               否则后端 get_resource 会 404，前端整条 import 链断掉。

前置条件
--------
对照类门禁（G2/G3/G4/G5）需要旧参考树 `<项目根>/0.6.7`。它在工作树里是删除状态、
但完整存在于 git HEAD，恢复命令：`git restore --source=HEAD -- 0.6.7`。
旧树缺失时这些门禁会被跳过并打印恢复提示（不算失败），G1/G6/G7 仍照常执行。
有意不迁移的旧文件登记在 INTENTIONAL_DROPS（例如 UiPack 运行时的
`static/ui-packs/loader.js`），门禁不再要求新树里有对应产物。

退出码非 0 表示有硬门禁失败。报告写到 tools/_migration/parity_report.json。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT.parent / "0.6.7"
OLD_FRONTEND = OLD / "frontend"
NEW = ROOT
NEW_FRONTEND = NEW / "frontend"
NEW_SRC = NEW_FRONTEND / "src"
DIST = NEW / "dist"
MAPPING_PATH = NEW / "tools" / "_migration" / "mapping.json"
REPORT_PATH = NEW / "tools" / "_migration" / "parity_report.json"

# 已知且有意为之的口径改写：字符串对账前先两边归一化（两边都过一遍，所以是等价映射）。
REWRITES = (
    ("/bridge-static/", "/static/"),
    ("bridge-static", "static"),
    # 运行时资源打包后按域分目录，路由参数必须接受斜杠，否则嵌套模块全 404。
    # 这是有意的契约升级：旧扁平时不需要 :path，新嵌套必须要有。
    ("{filename}", "{filename:path}"),
    # 运行时资源根目录从源码目录换到构建产物。
    ("frontend/modules/runtime", "dist/modules/runtime"),
)

PAGE_FILES = (
    "index.html",
    "login.html",
    "setup.html",
    "pair.html",
    "license.html",
    "license-recovery.html",
    "display.html",
    "3d-studio.html",
)

# 公开页：未初始化 / 未登录 / 未激活时也要能打开，其引用的资源必须匿名可加载。
PUBLIC_PAGES = ("login.html", "setup.html", "pair.html", "license.html", "license-recovery.html")

# 有意不迁移的旧文件：映射表保留原始迁移记录，但门禁不再要求新树里有对应产物。
# 键 = 旧树相对 `frontend/` 的路径；值 = 决定理由（写在这里，避免"悄悄消失"）。
INTENTIONAL_DROPS: dict[str, str] = {
    "static/ui-packs/loader.js": (
        "UiPack 运行时已随后端 /api/v1/ui-packs 一起从前端移除"
        "（display.ts / editor/home.ts 均不再引用），不再迁移。"
    ),
}

# 旧参考树（0.6.7）在工作树里是删除状态，但仍完整存在于 git HEAD。
# G2/G3/G4/G5 是"新旧对照"门禁，没有旧树无法判断，不能当作失败刷屏。
OLD_TREE_RESTORE_HINT = (
    f"旧参考树缺失：{OLD}\n"
    f"  G2/G3/G4/G5 需要对旧树，已跳过。恢复旧树后本门禁才会恢复完整判定：\n"
    f"    git restore --source=HEAD -- 0.6.7"
)

failures: list[str] = []
notes: list[str] = []
report: dict[str, object] = {}


def old_tree_available() -> bool:
    """旧树是否可用于对照（G2/G3 看 frontend/，G4 看 pages，G5 看 backend/）。"""
    return OLD_FRONTEND.is_dir() and (OLD / "backend").is_dir()


def fail(gate: str, message: str) -> None:
    failures.append(f"[{gate}] {message}")


def normalize(text: str) -> str:
    for old, new in REWRITES:
        text = text.replace(old, new)
    return text


def strip_comments(source: str) -> str:
    """去掉 // 与 /* */ 注释，避免注释里的示例串污染对账。

    用状态机而不是正则：正则处理不了字符串里的 //  和注释里的引号。
    """
    out: list[str] = []
    index = 0
    length = len(source)
    quote: str | None = None
    while index < length:
        char = source[index]
        if quote is not None:
            out.append(char)
            if char == "\\":
                if index + 1 < length:
                    out.append(source[index + 1])
                    index += 2
                    continue
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in "'\"`":
            quote = char
            out.append(char)
            index += 1
            continue
        if char == "/" and index + 1 < length:
            nxt = source[index + 1]
            if nxt == "/":
                end = source.find("\n", index)
                index = length if end < 0 else end
                continue
            if nxt == "*":
                end = source.find("*/", index + 2)
                index = length if end < 0 else end + 2
                continue
        out.append(char)
        index += 1
    return "".join(out)


STRING_PATTERN = re.compile(r"""'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`""", re.S)


def string_literals(source: str) -> list[str]:
    body = strip_comments(source)
    found: list[str] = []
    for match in STRING_PATTERN.finditer(body):
        raw = match.group(0)
        if len(raw) < 2:
            continue
        found.append(raw[1:-1])
    return found


EXPORT_PATTERN = re.compile(
    r"^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)",
    re.M,
)
EXPORT_BRACE_PATTERN = re.compile(r"^\s*export\s*\{([^}]*)\}", re.M | re.S)
EXPORT_DEFAULT_PATTERN = re.compile(r"^\s*export\s+default\b", re.M)


def exported_names(source: str) -> set[str]:
    names = {match.group(1) for match in EXPORT_PATTERN.finditer(source)}
    for match in EXPORT_BRACE_PATTERN.finditer(source):
        for chunk in match.group(1).split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            # export { a as b }：对外名字是 b。
            alias = chunk.split(" as ")
            names.add((alias[1] if len(alias) > 1 else alias[0]).strip())
    if EXPORT_DEFAULT_PATTERN.search(source):
        names.add("default")
    return names


def load_mapping() -> dict[str, str]:
    payload = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    return payload["mapping"]


# ---------------------------------------------------------------- G1 文件对账


def gate_files(mapping: dict[str, str]) -> dict[str, str]:
    payload = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    if payload["unmapped"]:
        fail("G1", f"未归类文件 {len(payload['unmapped'])} 个：{payload['unmapped'][:10]}")
    if payload["target_collisions"]:
        fail("G1", f"目标路径碰撞：{payload['target_collisions']}")
    if payload["missing_from_mapping"]:
        fail("G1", f"源文件漏进映射表：{payload['missing_from_mapping'][:10]}")

    pairs: dict[str, str] = {}
    missing: list[str] = []
    dropped: list[str] = []
    for source_rel, target_rel in mapping.items():
        if source_rel in INTENTIONAL_DROPS:
            dropped.append(source_rel)
            continue
        if not target_rel.endswith(".ts"):
            # HTML 入口不参与"源码模块"对账，由 G4 单独管。
            continue
        target = NEW_FRONTEND / target_rel
        if not target.is_file():
            missing.append(target_rel)
            continue
        pairs[source_rel] = target_rel
    for source_rel in dropped:
        notes.append(f"G1 有意不迁移 {source_rel}：{INTENTIONAL_DROPS[source_rel]}")
    if missing:
        fail("G1", f"{len(missing)} 个目标文件不存在：{missing[:10]}")
    report["G1"] = {
        "mapped": len(mapping),
        "checked_modules": len(pairs),
        "missing_targets": len(missing),
        "intentional_drops": dropped,
    }
    return pairs


# ------------------------------------------------------- G2 / G3 模块级对账


def gate_modules(pairs: dict[str, str]) -> None:
    export_issues: list[str] = []
    contract_issues: dict[str, list[str]] = {}
    checked = 0

    for source_rel, target_rel in sorted(pairs.items()):
        source_path = OLD_FRONTEND / source_rel
        target_path = NEW_FRONTEND / target_rel
        if not source_path.is_file():
            fail("G2", f"源文件消失：{source_rel}")
            continue
        checked += 1
        old_source = source_path.read_text(encoding="utf-8", errors="replace")
        new_source = target_path.read_text(encoding="utf-8", errors="replace")

        # G2：导出名字必须是旧集合的超集（可以新增，不能少）。
        old_exports = exported_names(old_source)
        new_exports = exported_names(new_source)
        lost = sorted(old_exports - new_exports)
        if lost:
            export_issues.append(f"{source_rel}: 丢失导出 {lost}")

        # G3：只对账"带 / 的字符串"（URL / 路径 / 选择器），噪声低、信号强。
        old_strings = {
            normalize(item)
            for item in string_literals(old_source)
            if "/" in item and len(item) < 300
        }
        new_strings = {item for item in string_literals(new_source) if "/" in item and len(item) < 300}
        new_bare = {item.split("?")[0] for item in new_strings}
        # 新代码里仍保留少量含 .js 的绝对 URL（/static/vendor/**、/api/v1/modules/**），
        # 补一份去 .js 的变体，与已去后缀的相对说明符对齐。
        new_bare |= {candidate[:-3] for candidate in new_bare if candidate.endswith(".js")}
        # 目录整体搬迁会让相对路径前缀变化，这里只要求"旧串的尾段"仍出现，
        # 因为 src/runtime 与 src/app 的相对深度变了。
        missing: list[str] = []
        for item in sorted(old_strings):
            if item in new_strings:
                continue
            # 去掉 ?v=<内容戳> 再比：旧代码用查询串做手工缓存击穿
            # （import('./cover-state.js?v=20260914-...')），打包后内容哈希已经
            # 承担了这件事，迁移时把版本串去掉了。这条不算丢逻辑，但必须验证目标模块
            # 仍然被引用 —— 所以还要往下查"裸路径是否出现在新源码里"。
            bare = item.split("?")[0]
            # 迁移把 import 说明符结尾的 `.js` 去掉了（bundler 会 .js->.ts 解析，
            # 见 tools/strip_js_suffix.py）。这是有意的口径改写：两边都按
            # "去查询串 + 去结尾 .js" 比较，否则每条 import 都会被误判成丢契约。
            if bare.endswith(".js"):
                bare = bare[:-3]
            if bare and bare in new_bare:
                continue
            if bare and bare in new_source:
                continue
            # 尾段比较也必须在去查询串、去 .js 之后做：'./purifier-extras.js?v=xxx'
            # 的尾段应该是 purifier-extras，否则永远匹配不上 @runtime/... 这种改写。
            tail = bare.rsplit("/", 1)[-1]
            if tail and any(candidate.endswith(tail) for candidate in new_bare):
                continue
            if bare.lstrip("/") in {candidate.lstrip("/") for candidate in new_bare}:
                continue
            missing.append(item)
        if missing:
            contract_issues[source_rel] = missing

    if export_issues:
        for issue in export_issues[:40]:
            fail("G2", issue)
        if len(export_issues) > 40:
            fail("G2", f"...另有 {len(export_issues) - 40} 条导出缺失")
    if contract_issues:
        total = sum(len(v) for v in contract_issues.values())
        for rel, items in list(contract_issues.items())[:25]:
            fail("G3", f"{rel}: 契约串缺失 {items[:6]}")
        if len(contract_issues) > 25:
            fail("G3", f"...另有 {len(contract_issues) - 25} 个文件有契约串缺失")
        notes.append(f"G3 共 {total} 条契约串待确认（多为搬迁后的相对路径深度变化）")
    report["G2"] = {"checked": checked, "export_issues": len(export_issues)}
    report["G3"] = {
        "files_with_issues": len(contract_issues),
        "total_issues": sum(len(v) for v in contract_issues.values()),
        "detail": contract_issues,
    }


# ------------------------------------------------------------ G4 页面结构对账

TAG_PATTERN = re.compile(r"<([a-zA-Z][\w-]*)")
ID_PATTERN = re.compile(r"""\bid\s*=\s*["']([^"']+)["']""")
CLASS_PATTERN = re.compile(r"""\bclass\s*=\s*["']([^"']*)["']""")


def page_shape(path: Path) -> tuple[set[str], set[str]]:
    html = path.read_text(encoding="utf-8", errors="replace")
    ids = set(ID_PATTERN.findall(html))
    classes: set[str] = set()
    for group in CLASS_PATTERN.findall(html):
        classes.update(part for part in group.split() if part)
    return ids, classes


def gate_pages() -> None:
    detail: dict[str, object] = {}
    for page in PAGE_FILES:
        old_page = OLD_FRONTEND / page
        new_page = DIST / page
        if not old_page.is_file():
            fail("G4", f"旧页面不存在：{page}")
            continue
        if not new_page.is_file():
            fail("G4", f"构建产物里没有页面：{page}")
            continue
        old_ids, old_classes = page_shape(old_page)
        new_ids, new_classes = page_shape(new_page)
        lost_ids = sorted(old_ids - new_ids)
        lost_classes = sorted(old_classes - new_classes)
        if lost_ids:
            fail("G4", f"{page}: 丢失 id {lost_ids[:10]}")
        if lost_classes:
            fail("G4", f"{page}: 丢失 class {lost_classes[:10]}")
        detail[page] = {
            "ids": len(old_ids),
            "lost_ids": lost_ids,
            "classes": len(old_classes),
            "lost_classes": lost_classes,
        }
    report["G4"] = detail


# -------------------------------------------------------- G5 后端路由对账

ROUTE_PATTERN = re.compile(
    r"""^\s*@(?P<obj>\w+)\.(?P<method>get|post|put|patch|delete|api_route|websocket)\s*\(\s*['"](?P<path>[^'"]*)['"]""",
    re.M,
)
PREFIX_PATTERN = re.compile(r"""APIRouter\s*\([^)]*?prefix\s*=\s*['"]([^'"]*)['"]""", re.S)
INCLUDE_PATTERN = re.compile(
    r"""include_router\s*\(\s*(?P<name>[\w.]+)\s*(?:,\s*prefix\s*=\s*['"](?P<prefix>[^'"]*)['"])?""",
    re.S,
)
MOUNT_PATTERN = re.compile(r"""\.mount\s*\(\s*['"]([^'"]*)['"]""")
ASSIGN_ROUTER_PATTERN = re.compile(r"^\s*(?P<var>\w+)\s*=\s*APIRouter\s*\(", re.M)
IMPORT_AS_PATTERN = re.compile(r"^from\s+[\w.]+\s+import\s+(?P<body>.+)$", re.M)


def backend_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def collect_routes(package_root: Path) -> tuple[set[str], list[str]]:
    """粗略但保守地收集路由：模块内 prefix + 装饰器路径，外加挂载点。

    这个门禁只要求"旧集合 ⊆ 新集合"，因此宁可多算（把 @router 当成任意对象）
    也不漏算 —— 漏算会给出假阳性。
    """
    routes: set[str] = set()
    mounts: list[str] = []
    for path in backend_files(package_root):
        if path.name == "main.py":
            # main.py 的 include_router 带 prefix，单独在 collect_composed_routes 里处理。
            continue
        source = path.read_text(encoding="utf-8", errors="replace")
        prefixes = PREFIX_PATTERN.findall(source)
        prefix = prefixes[0] if prefixes else ""
        for match in ROUTE_PATTERN.finditer(source):
            route_path = match.group("path")
            routes.add(normalize(f"{prefix}{route_path}"))
        for match in MOUNT_PATTERN.finditer(source):
            mounts.append(normalize(match.group(1)))
    return routes, mounts


APP_ROUTE_PATTERN = re.compile(
    r"""^\s*@app\.(?P<method>get|post|put|patch|delete|api_route|websocket)\s*\(\s*['"](?P<path>[^'"]*)['"]""",
    re.M,
)


def collect_main_routes(main_path: Path) -> tuple[set[str], list[str]]:
    source = main_path.read_text(encoding="utf-8", errors="replace")
    routes = {normalize(match.group("path")) for match in APP_ROUTE_PATTERN.finditer(source)}
    mounts = [normalize(match.group(1)) for match in MOUNT_PATTERN.finditer(source)]
    return routes, mounts


def router_name_to_file(package_root: Path) -> dict[str, Path]:
    """把 `from .api.auth import router as auth_router` 反查回源文件。"""
    main_path = package_root / "main.py"
    if not main_path.is_file():
        return {}
    source = main_path.read_text(encoding="utf-8", errors="replace")
    found: dict[str, Path] = {}
    for match in IMPORT_AS_PATTERN.finditer(source):
        module_part = match.group(0)
        head = module_part.split(" import ", 1)
        if len(head) != 2:
            continue
        module_ref = head[0].replace("from", "", 1).strip()
        for chunk in head[1].split(","):
            chunk = chunk.strip()
            if " as " in chunk:
                original, alias = (part.strip() for part in chunk.split(" as ", 1))
                if original != "router":
                    continue
                resolved = resolve_module(package_root, module_ref)
                if resolved is not None:
                    found[alias] = resolved
    return found


def resolve_module(package_root: Path, module_ref: str) -> Path | None:
    if module_ref.startswith("."):
        depth = len(module_ref) - len(module_ref.lstrip("."))
        tail = module_ref.lstrip(".").replace(".", "/")
        base = package_root
        for _ in range(depth - 1):
            base = base.parent
        candidate = base / f"{tail}.py" if tail else base / "__init__.py"
        return candidate if candidate.is_file() else None
    return None


def collect_composed_routes(package_root: Path) -> set[str]:
    """按 main.py 的 include_router(prefix=...) 组合出最终对外路径。"""
    main_path = package_root / "main.py"
    if not main_path.is_file():
        return set()
    source = main_path.read_text(encoding="utf-8", errors="replace")
    name_to_file = router_name_to_file(package_root)
    composed: set[str] = set()
    for match in INCLUDE_PATTERN.finditer(source):
        name = match.group("name").split(".")[-1]
        prefix = match.group("prefix") or ""
        module_file = name_to_file.get(name)
        if module_file is None:
            continue
        module_source = module_file.read_text(encoding="utf-8", errors="replace")
        local_prefix = PREFIX_PATTERN.search(module_source)
        base = local_prefix.group(1) if local_prefix else ""
        for route in ROUTE_PATTERN.finditer(module_source):
            composed.add(normalize(f"{prefix}{base}{route.group('path')}"))
    return composed


def gate_backend() -> None:
    old_root = OLD / "backend" / "app"
    new_root = NEW / "backend" / "src"
    if not old_root.is_dir():
        fail("G5", f"旧后端目录不存在：{old_root}")
        return
    if not new_root.is_dir():
        fail("G5", f"新后端目录不存在：{new_root}")
        return

    old_routes, old_mounts = collect_routes(old_root)
    new_routes, new_mounts = collect_routes(new_root)
    old_main_routes, old_main_mounts = collect_main_routes(old_root / "main.py")
    new_main_routes, new_main_mounts = collect_main_routes(new_root / "main.py")
    old_all = old_routes | old_main_routes | collect_composed_routes(old_root)
    new_all = new_routes | new_main_routes | collect_composed_routes(new_root)

    lost_routes = sorted(old_all - new_all)
    if lost_routes:
        fail("G5", f"后端丢失 {len(lost_routes)} 条路由：{lost_routes[:15]}")

    old_mount_set = set(old_mounts) | set(old_main_mounts)
    new_mount_set = set(new_mounts) | set(new_main_mounts)
    lost_mounts = sorted(old_mount_set - new_mount_set)
    if lost_mounts:
        fail("G5", f"后端丢失挂载点：{lost_mounts}")

    report["G5"] = {
        "old_routes": len(old_all),
        "new_routes": len(new_all),
        "lost_routes": lost_routes,
        "old_mounts": sorted(old_mount_set),
        "new_mounts": sorted(new_mount_set),
        "added_routes": sorted(new_all - old_all)[:20],
    }


# --------------------------------------------------- G6 产物可服务对账

STATIC_REF_PATTERN = re.compile(r"""["'(](/static/[^"'()\s]+)["')]""")


def gate_served_assets() -> None:
    if not DIST.is_dir():
        fail("G6", "dist 不存在，先跑 bun run build")
        return
    manifest_path = DIST / "public-static.json"
    if not manifest_path.is_file():
        fail("G6", "dist/public-static.json 不存在")
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    anonymous = {
        entry["path"] if isinstance(entry, dict) else entry
        for entry in manifest.get("files", [])
        if isinstance(entry, (str, dict))
    }

    missing_on_disk: dict[str, list[str]] = {}
    public_missing_from_whitelist: dict[str, list[str]] = {}
    detail: dict[str, object] = {}

    for page in PAGE_FILES:
        html_path = DIST / page
        if not html_path.is_file():
            fail("G6", f"缺页面产物：{page}")
            continue
        html = html_path.read_text(encoding="utf-8", errors="replace")
        refs = set(STATIC_REF_PATTERN.findall(html))
        missing = sorted(ref for ref in refs if not (DIST / ref.lstrip("/")).is_file())
        if missing:
            missing_on_disk[page] = missing
        if page in PUBLIC_PAGES:
            not_whitelisted = sorted(ref for ref in refs if ref not in anonymous)
            if not_whitelisted:
                public_missing_from_whitelist[page] = not_whitelisted
        detail[page] = {"refs": len(refs), "missing_on_disk": missing}

    if missing_on_disk:
        for page, items in missing_on_disk.items():
            fail("G6", f"{page} 引用了 dist 里不存在的资源：{items[:8]}")
    if public_missing_from_whitelist:
        for page, items in public_missing_from_whitelist.items():
            fail("G6", f"公开页 {page} 的资源不在匿名白名单里：{items[:8]}")
    if anonymous:
        orphan = sorted(path for path in anonymous if not (DIST / path.lstrip("/")).is_file())
        if orphan:
            notes.append(f"G6 匿名白名单里 {len(orphan)} 条在 dist 中不存在（构建残留？）：{orphan[:8]}")

    report["G6"] = {
        "anonymous_entries": len(anonymous),
        "pages": detail,
        "public_pages_missing_from_whitelist": public_missing_from_whitelist,
    }


# ------------------------------------------------ G7 运行时清单自洽对账

RELATIVE_SPECIFIER_PATTERN = re.compile(
    r"""\bfrom\s*["'](?P<from>\.{1,2}/[^"']+)["']|\bimport\s*\(\s*["'](?P<dyn>\.{1,2}/[^"']+)["']|\bimport\s*["'](?P<side>\.{1,2}/[^"']+)["']|\bimport\s+(?P<name>\.{1,2}/[^"'\s;]+)"""
)


def gate_runtime_manifest() -> None:
    runtime_dir = DIST / "modules" / "runtime"
    manifest_path = runtime_dir / "manifest.json"
    if not manifest_path.is_file():
        fail("G7", "dist/modules/runtime/manifest.json 不存在，先跑 bun run build:runtime")
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    listed = set(manifest.get("files", []))
    media_types = manifest.get("mediaTypes", {})

    unresolved: dict[str, list[str]] = {}
    unlisted: dict[str, list[str]] = {}
    scanned = 0

    for path in sorted(runtime_dir.rglob("*.js")):
        rel_dir = path.parent.relative_to(runtime_dir)
        source = path.read_text(encoding="utf-8", errors="replace")
        rel_file = str(path.relative_to(runtime_dir)).replace("\\", "/")
        scanned += 1
        targets: set[str] = set()
        for match in RELATIVE_SPECIFIER_PATTERN.finditer(source):
            specifier = next(value for value in match.groupdict().values() if value)
            if specifier.startswith("./"):
                resolved = (rel_dir / specifier[2:]).as_posix()
            else:
                parts = list(rel_dir.parts)
                rest = specifier
                while rest.startswith("../"):
                    if parts:
                        parts.pop()
                    rest = rest[3:]
                resolved = "/".join([*parts, rest]) if parts else rest
            resolved = str(Path(resolved).as_posix())
            if resolved.startswith("/"):
                continue
            targets.add(resolved)
        for target in sorted(targets):
            if not (runtime_dir / target).is_file():
                unresolved.setdefault(rel_file, []).append(target)
            elif target not in listed:
                unlisted.setdefault(rel_file, []).append(target)

    if unresolved:
        for rel, items in list(unresolved.items())[:15]:
            fail("G7", f"{rel}: 引用了磁盘上不存在的模块 {items[:5]}")
    if unlisted:
        for rel, items in list(unlisted.items())[:15]:
            fail("G7", f"{rel}: 引用的模块未登记进清单（后端会 404）{items[:5]}")

    css_listed = sorted(name for name in listed if name.endswith(".css"))
    if not css_listed:
        notes.append("G7 清单里没有 .css 条目（若前端已无 runtime 样式可忽略）")

    report["G7"] = {
        "runtime_files_on_disk": scanned,
        "manifest_entries": len(listed),
        "mediaTypes": media_types,
        "unresolved": unresolved,
        "unlisted": unlisted,
    }


def main() -> int:
    mapping = load_mapping()
    pairs = gate_files(mapping)
    old_tree = old_tree_available()
    if old_tree:
        gate_modules(pairs)
        gate_pages()
        gate_backend()
    else:
        notes.append(f"旧参考树缺失，跳过 G2/G3/G4/G5（{OLD}）")
    gate_served_assets()
    gate_runtime_manifest()

    report["failures"] = failures
    report["notes"] = notes
    report["old_tree_available"] = old_tree
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if not old_tree:
        print(f"\n⚠  {OLD_TREE_RESTORE_HINT}\n")
    for note in notes:
        print(f"NOTE  {note}")
    if failures:
        print(f"\n对账失败，共 {len(failures)} 条：")
        for item in failures:
            print(f"  - {item}")
        print(f"\n完整报告：{REPORT_PATH}")
        return 1
    if old_tree:
        print("\n七张对账门禁全部通过。")
    else:
        print("\n对账通过（G2/G3/G4/G5 因旧参考树缺失已跳过，G1/G6/G7 已执行）。")
    print(f"完整报告：{REPORT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
