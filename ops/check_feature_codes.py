#!/usr/bin/env python3
"""功能码目录门禁：确认**真源 JSON 与各端内嵌副本**完全一致。

能力码是真源 ``ops/feature_codes.json``，但发行的加密镜像里没有 ``ops/`` 目录（见根
Dockerfile：产物只允许 ``.so``），所以两个后端的 ``features.py`` 各自内嵌了一份副本供
回退加载；前端授权状态面板另有一份只读的 ``code → 中文名`` 镜像。副本一旦与 JSON 漂移，
就会出现「商店签了一个码、主应用根本不认识」这种最难查的问题 —— 门禁把这类漂移挡在提交前。

检查六件事：

1. ``ops/feature_codes.json`` 自身可解析、结构合法（code 唯一、组已声明、布尔字段齐备）；
2. 两项目 ``features.py`` 的内嵌副本 ``EMBEDDED_CATALOG`` 与 JSON 逐字段相等；
3. 两项目派生的能力码集合一致；
4. 前端 ``feature-labels.util.ts`` 的 ``code → label/group`` 镜像与 JSON 一致；
5. 前端**门禁映射**里不出现真源以外的码（``module.agent`` 写成 ``module.agnet`` 会永久
   fail-open：界面入口一直在，接口逐个 403）；
6. 每个增量模块码都在主应用前端有引用（否则商店把这个模块卖出去了，界面毫无变化）。

用法::

    python ops/check_feature_codes.py
"""
from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "ops" / "feature_codes.json"

MODULES: dict[str, Path] = {
    "主应用": ROOT / "homeos" / "backend" / "src" / "services" / "license" / "features.py",
    "授权商店": ROOT / "homeos-store" / "backend" / "src" / "ops" / "features.py",
}

#: 前端展示镜像：只含 code/label/group 三个展示字段。
FRONTEND_MIRROR: Path = (
    ROOT / "homeos" / "frontend" / "src" / "utils" / "registry" / "feature-labels.util.ts"
)

#: 前端**门禁映射**文件：这些映射（导航 Tab → 码、设置 Tab → 码）是手写字面量，
#: 写错一个字母就会永久 fail-open —— 界面上入口永远在，后端却逐个 403。
FRONTEND_GATE_FILES: tuple[Path, ...] = (
    ROOT / "homeos" / "frontend" / "src" / "utils" / "ui" / "main-layout-nav.util.ts",
    ROOT / "homeos" / "frontend" / "src" / "utils" / "registry" / "settings-nav.util.ts",
    ROOT / "homeos" / "frontend" / "src" / "features" / "settings" / "system" / "SettingsLicensePanel.vue",
)

#: 主应用前端源码根（模块码覆盖检查用；排除展示镜像本身）。
FRONTEND_SRC: Path = ROOT / "homeos" / "frontend" / "src"

#: 引号包裹的疑似功能码字面量（如 'module.agent'、"ha.sync"）。
_QUOTED_CODE = re.compile(r"""['"](?P<code>[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)['"]""")

_REQUIRED_FIELDS = ("code", "label", "group", "description")

#: 匹配 `'module.x': { label: '中文名', group: 'module' },`（兼容裸键名 api: {...}）。
_MIRROR_ENTRY = re.compile(
    r"^\s*'?(?P<code>[A-Za-z0-9_.]+)'?\s*:\s*\{\s*"
    r"label\s*:\s*'(?P<label>[^']*)'\s*,\s*"
    r"group\s*:\s*'(?P<group>[^']*)'\s*\}\s*,?\s*$"
)


def _canonical(catalog: dict) -> list[tuple]:
    """把一份目录压成可比较的规范形态（按 code 排序的元组列表）。"""
    features = catalog.get("features")
    if not isinstance(features, list):
        raise ValueError("catalog.features 必须是列表")
    canonical = []
    for feature in features:
        if not isinstance(feature, dict):
            raise ValueError(f"features 项不是对象：{feature!r}")
        missing = [field for field in _REQUIRED_FIELDS if field not in feature]
        if missing:
            raise ValueError(f"功能码 {feature.get('code')!r} 缺字段：{missing}")
        canonical.append(
            (
                str(feature["code"]),
                str(feature["label"]),
                str(feature["group"]),
                str(feature.get("description", "")),
                bool(feature.get("base", False)),
                bool(feature.get("grantedByAll", False)),
                tuple(sorted(str(item) for item in (feature.get("impliedBy") or []))),
            )
        )
    canonical.sort(key=lambda item: item[0])
    return canonical


def _validate(catalog: dict) -> list[str]:
    """结构合法性自检，返回问题列表（空 = 通过）。"""
    problems: list[str] = []
    groups = catalog.get("groups")
    if not isinstance(groups, list) or not groups:
        problems.append("catalog.groups 必须是非空列表")
        return problems
    declared = {str(group.get("key")) for group in groups if isinstance(group, dict)}
    canonical = _canonical(catalog)
    codes = [item[0] for item in canonical]
    duplicates = sorted({code for code in codes if codes.count(code) > 1})
    if duplicates:
        problems.append(f"存在重复功能码：{duplicates}")
    for item in canonical:
        code, _label, group, _desc, _base, _granted_by_all, implied_by = item
        if not code:
            problems.append("存在空功能码")
        if group not in declared:
            problems.append(f"功能码 {code} 的 group={group!r} 未在 groups 中声明")
        for source in implied_by:
            if source not in codes:
                problems.append(f"功能码 {code} 的 impliedBy 引用了不存在的码 {source!r}")
    if not str(catalog.get("wildcard") or "").strip():
        problems.append("catalog.wildcard 不能为空")
    return problems


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(f"feature_codes_check_{name}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载模块：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _frontend_mirror_rows(path: Path) -> list[tuple[str, str, str]]:
    """解析前端展示镜像，返回按出现顺序的 ``(code, label, group)`` 列表。"""
    rows: list[tuple[str, str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _MIRROR_ENTRY.match(line)
        if match:
            rows.append(
                (match.group("code"), match.group("label"), match.group("group"))
            )
    return rows


def _code_namespaces(truth: list[tuple]) -> set[str]:
    """从真源派生「功能码命名空间」：首段 + 无点全码。

    用于判断某个字符串**像不像**功能码（``module.xxx`` / ``ha.xxx`` …）。这样既能抓到
    ``module.notifcations`` 这类拼写错误，又不会把 ``render.key``、``fact.label``
    这类普通点号字段误判成功能码。
    """
    namespaces: set[str] = set()
    for item in truth:
        code = item[0]
        namespaces.add(code)
        if "." in code:
            namespaces.add(code.split(".", 1)[0])
    return namespaces


def _gate_literal_problems(truth_codes: set[str], truth: list[tuple]) -> list[str]:
    """前端门禁映射里若有「像功能码但真源里没有」的字面量，说明是拼错或已废弃的码。"""
    namespaces = _code_namespaces(truth)
    problems: list[str] = []
    for path in FRONTEND_GATE_FILES:
        if not path.is_file():
            # 文件被 refactor 搬走时，只报「找不到」会让人以为门禁本身坏了。
            # 顺手把同名文件的真实位置找出来，把「路径过期」和「文件真被删了」区分开。
            moved = sorted(FRONTEND_SRC.rglob(path.name)) if FRONTEND_SRC.is_dir() else []
            hint = f"（同名文件现在位于 {moved[0].relative_to(ROOT)}）" if moved else "（未找到同名文件，可能已删除）"
            problems.append(f"找不到前端门禁映射文件：{path.relative_to(ROOT)}{hint}")
            continue
        seen: set[str] = set()
        for code in _QUOTED_CODE.findall(path.read_text(encoding="utf-8")):
            if code in truth_codes or code in seen:
                continue
            if code in namespaces or code.split(".", 1)[0] in namespaces:
                seen.add(code)
                problems.append(
                    f"{path.name} 引用了真源里不存在的功能码 {code!r}（拼写错误会永久 fail-open）"
                )
    return problems


def _module_coverage_problems(truth: list[tuple]) -> list[str]:
    """每个增量模块码都必须在前端留下引用，否则商店卖了这个模块、界面却毫无变化。"""
    problems: list[str] = []
    if not FRONTEND_SRC.is_dir():
        return [f"找不到主应用前端源码目录：{FRONTEND_SRC}"]
    corpus: list[str] = []
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".vue", ".js"}:
            continue
        if path == FRONTEND_MIRROR:
            continue
        try:
            corpus.append(path.read_text(encoding="utf-8"))
        except OSError:
            continue
    blob = "\n".join(corpus)
    for code, _label, _group, _desc, base, _granted_by_all, _implied in truth:
        if base:
            continue
        if code not in blob:
            problems.append(
                f"增量模块码 {code} 在主应用前端没有任何引用：卖了这个模块界面也不会有变化"
            )
    return problems


def main() -> int:
    if not CATALOG_PATH.is_file():
        print(f"✗ 找不到功能码真源：{CATALOG_PATH}")
        return 1
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except ValueError as error:
        print(f"✗ 功能码真源不是合法 JSON：{error}")
        return 1

    problems = _validate(catalog)
    if problems:
        print("✗ 功能码真源结构不合法：")
        for problem in problems:
            print(f"    - {problem}")
        return 1

    truth = _canonical(catalog)
    truth_codes = {item[0] for item in truth}
    print(f"✓ 真源 ops/feature_codes.json：{len(truth)} 个功能码")

    failures: list[str] = []
    for title, path in MODULES.items():
        if not path.is_file():
            failures.append(f"{title} 缺少 features.py：{path}")
            continue
        module = _load_module(title, path)
        embedded = getattr(module, "EMBEDDED_CATALOG", None)
        if not isinstance(embedded, dict):
            failures.append(f"{title} features.py 没有可比较的 EMBEDDED_CATALOG")
            continue
        embedded_canonical = _canonical(embedded)
        if embedded_canonical != truth:
            only_truth = [item[0] for item in truth if item[0] not in {row[0] for row in embedded_canonical}]
            only_embedded = [item[0] for item in embedded_canonical if item[0] not in truth_codes]
            detail = []
            if only_truth:
                detail.append(f"内嵌副本缺：{only_truth}")
            if only_embedded:
                detail.append(f"内嵌副本多：{only_embedded}")
            for left, right in zip(truth, embedded_canonical):
                if left != right:
                    detail.append(f"{left[0]} 字段不一致：真源={left} 内嵌={right}")
            failures.append(f"{title} 内嵌副本与真源不一致：" + "；".join(detail or ["字段差异"]))
            continue
        module_codes = {item[0] for item in embedded_canonical}
        if module_codes != truth_codes:
            failures.append(f"{title} 功能码集合与真源不一致")
            continue
        print(f"✓ {title} features.py 内嵌副本与真源一致（{len(module_codes)} 个码）")

    # 4. 前端展示镜像（code → label/group）
    if not FRONTEND_MIRROR.is_file():
        failures.append(f"前端缺少功能码展示镜像：{FRONTEND_MIRROR}")
    else:
        mirror_rows = _frontend_mirror_rows(FRONTEND_MIRROR)
        # 真源 `_canonical()` 按 code 排序，镜像按 base/module 分组书写更易读：
        # 因此只比对「码 → 文案」的映射，不约束书写顺序。
        truth_display = {item[0]: (item[1], item[2]) for item in truth}
        mirror_display = {code: (label, group) for code, label, group in mirror_rows}
        missing = sorted(set(truth_display) - set(mirror_display))
        extra = sorted(set(mirror_display) - set(truth_display))
        mismatched = [
            f"{code}（真源 {truth_display[code][0]}/{truth_display[code][1]}，"
            f"镜像 {mirror_display[code][0]}/{mirror_display[code][1]}）"
            for code in sorted(set(truth_display) & set(mirror_display))
            if truth_display[code] != mirror_display[code]
        ]
        if missing or extra or mismatched:
            detail = []
            if missing:
                detail.append(f"镜像缺：{missing}")
            if extra:
                detail.append(f"镜像多：{extra}")
            if mismatched:
                detail.append("文案不一致：" + "、".join(mismatched))
            failures.append(
                "前端 feature-labels.util.ts 与真源不一致：" + "；".join(detail)
            )
        else:
            print(f"✓ 前端 feature-labels.util.ts 与真源一致（{len(mirror_display)} 个码）")

    # 5. 前端门禁映射：只允许出现真源里的码（拼错一个字母就会永久 fail-open）；
    #    每个增量模块码都必须在前端留下引用（否则卖出去也没有界面变化）。
    gate_problems = _gate_literal_problems(truth_codes, truth)
    coverage_problems = _module_coverage_problems(truth)
    if gate_problems:
        failures.extend(gate_problems)
    else:
        print(f"✓ 前端门禁映射引用的功能码都在真源内（{len(FRONTEND_GATE_FILES)} 个文件）")
    if coverage_problems:
        failures.extend(coverage_problems)
    else:
        module_total = sum(1 for item in truth if not item[4])
        print(f"✓ 每个增量模块码都在主应用前端有引用（{module_total} 个模块码）")

    if failures:
        print()
        print("功能码门禁未通过：")
        for failure in failures:
            print(f"    ✗ {failure}")
        return 1

    print()
    print("功能码门禁通过：真源 JSON 与两项目内嵌副本一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
