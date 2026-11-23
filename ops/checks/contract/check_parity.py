#!/usr/bin/env python3
"""跨语言契约表的一致性门禁（只读，纯标准库 + 项目运行期依赖）。

## 为什么把三条并成一条

仓库里有两张「必须两端同时存在」的表：

| 表 | Python 侧 | TS 侧 |
| --- | --- | --- |
| 设备 kind → 渲染形态 | `domains/device_profile/classify.py` | `packages/shared/src/entity/device-kind.ts` |
| 域 → 控制类型 | `modules/interaction3d/extra_types.py` | `studio/runtime/climate/purifier-extras.ts` |

它们不可能合并成一个文件（一个跑 Python、一个跑浏览器），因此**不做代码生成**（跨语言生成器
本身会成为第三处真相），只做断言。三条检查此前是三个脚本，但做的是同一件事——
「读 Python 表、读 TS 表、逐条比对」——拆成三个文件只是让同一段解析代码出现三遍。

## 三个子检查

- `device-kinds`：两端 climate kind 集合、`kind → 渲染形态` 映射、TS 的 `CLIMATE_RENDER_TYPES`
  三者相互一致（新增渲染形态必须两端同步）。
- `device-kinds-regression`：规则从前端搬到后端 `classify()` 时，**既有结论不许变**。
  脚本里保留旧前端启发式作对照实现，逐条跑 `fixtures/device-kinds-entities.json`。
  「两端结论不同」必须在该条里登记 `verdict: correction` + `reason`，否则按违规算。
- `extra-types`：两端的「非 state」映射逐条相等；Python 登记为 state 的域，TS 不得映射成可写类型。
  另外守一条结构不变量：`extra_types.py` 必须是无 import 的纯数据叶子模块（断掉
  `config_ctx → purifier → lock → config_ctx` 的环）。

形状一旦变化（例如把 `Object.freeze({...})` 改成函数返回），本脚本报错而不是静默返回空表
—— 静默会给出一条永远绿的假门禁。

## 用法

```bash
node ops/lib/py.mjs ops/checks/contract/check_parity.py            # 三条都跑
node ops/lib/py.mjs ops/checks/contract/check_parity.py --check    # 门禁（有违规退出 1）
node ops/lib/py.mjs ops/checks/contract/check_parity.py --module extra-types
node ops/lib/py.mjs ops/checks/contract/check_parity.py --json
```
"""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import sys
from typing import Any

from ops.checks._bootstrap import REPO_ROOT, parse_tree
from ops.lib.batch import SubSpec, run_subchecks

FIXTURE = REPO_ROOT / "ops/checks/fixtures/device-kinds-entities.json"

DEVICE_KINDS_PY = REPO_ROOT / "homeos/backend/src/domains/device_profile/classify.py"
DEVICE_KINDS_TS = REPO_ROOT / "packages/shared/src/entity/device-kind.ts"
EXTRA_TYPES_PY = REPO_ROOT / "homeos/backend/src/modules/interaction3d/extra_types.py"
EXTRA_TYPES_TS = REPO_ROOT / "homeos/frontend/src/studio/runtime/climate/purifier-extras.ts"

#: 兜底类型：两端都用它表示「表外的域只能只读展示」。
FALLBACK_TYPE = "state"


# --------------------------------------------------------------------------- #
# 设备 kind：两端表一致性
# --------------------------------------------------------------------------- #


def load_python_tables() -> tuple[list[str], dict[str, str]]:
    """导入 classify.py 拿 kind 集合与换算表（纯模块，不依赖运行时）。"""
    spec = importlib.util.spec_from_file_location("_homeos_device_kinds_parity", DEVICE_KINDS_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {DEVICE_KINDS_PY}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.CLIMATE_KINDS), dict(module.CLIMATE_RENDER_TYPE_BY_KIND)


def _ts_array(source: str, const_name: str) -> list[str]:
    match = re.search(
        rf"export\s+const\s+{const_name}\s*=\s*\[(.*?)\]\s*as\s+const",
        source,
        re.DOTALL,
    )
    if match is None:
        raise RuntimeError(f"无法从 device-kind.ts 解析 {const_name}（实现形状可能已变，请更新本脚本）")
    return re.findall(r"'([^']+)'", match.group(1))


def _ts_render_map(source: str) -> dict[str, str]:
    match = re.search(
        r"export\s+const\s+CLIMATE_RENDER_TYPE_BY_KIND[^=]*=\s*Object\.freeze\(\{(.*?)\}\)",
        source,
        re.DOTALL,
    )
    if match is None:
        raise RuntimeError("无法从 device-kind.ts 解析 CLIMATE_RENDER_TYPE_BY_KIND（实现形状可能已变，请更新本脚本）")
    return dict(re.findall(r"(\w+)\s*:\s*'([^']+)'", match.group(1)))


def compare_device_kinds(
    py_kinds: list[str],
    py_map: dict[str, str],
    ts_kinds: list[str],
    ts_map: dict[str, str],
    ts_render_types: list[str],
) -> list[str]:
    problems: list[str] = []

    for kind in sorted(set(py_kinds) - set(ts_kinds)):
        problems.append(f"kind {kind!r}: 仅 Python 侧登记（TS 缺失）")
    for kind in sorted(set(ts_kinds) - set(py_kinds)):
        problems.append(f"kind {kind!r}: 仅 TS 侧登记（Python 缺失）")

    for kind in sorted(set(py_map) | set(ts_map)):
        left = py_map.get(kind)
        right = ts_map.get(kind)
        if left == right:
            continue
        if left is None:
            problems.append(f"{kind}: 仅 TS 侧映射为 {right!r}（Python 缺失）")
        elif right is None:
            problems.append(f"{kind}: 仅 Python 侧映射为 {left!r}（TS 缺失）")
        else:
            problems.append(f"{kind}: Python={left!r} 但 TS={right!r}")

    mapped_values = set(py_map.values()) | set(ts_map.values())
    for render_type in sorted(mapped_values - set(ts_render_types)):
        problems.append(f"渲染形态 {render_type!r}: 出现在映射里但未登记在 CLIMATE_RENDER_TYPES")
    for render_type in sorted(set(ts_render_types) - mapped_values):
        problems.append(f"渲染形态 {render_type!r}: 登记在 CLIMATE_RENDER_TYPES 但没有任何 kind 映射到它")

    return problems


def run_device_kinds() -> tuple[list[str], str]:
    if not DEVICE_KINDS_PY.is_file() or not DEVICE_KINDS_TS.is_file():
        return [], "找不到契约表文件，跳过"
    py_kinds, py_map = load_python_tables()
    ts_source = DEVICE_KINDS_TS.read_text(encoding="utf-8")
    ts_kinds = _ts_array(ts_source, "CLIMATE_KINDS")
    ts_map = _ts_render_map(ts_source)
    ts_render_types = _ts_array(ts_source, "CLIMATE_RENDER_TYPES")
    problems = compare_device_kinds(py_kinds, py_map, ts_kinds, ts_map, ts_render_types)
    return problems, f"python={len(py_kinds)} kind，typescript={len(ts_kinds)} kind"


# --------------------------------------------------------------------------- #
# 设备 kind：迁移回归（旧启发式 vs 迁移后链路）
# --------------------------------------------------------------------------- #

#: 旧前端的浴霸档位表（``resolveClimateDeviceType()`` 里的字面量，原样保留）。
_LEGACY_BATH_HEATER_MODES = frozenset(
    {
        "vent",
        "ventilate",
        "ventilation",
        "exhaust",
        "air_exchange",
        "defog",
        "quick_heat",
        "quick_defog",
        "drying",
        "取暖",
        "吹风",
        "换气",
        "除雾",
        "干燥",
    }
)
_LEGACY_BATH_HEATER_NAME = re.compile(r"(浴霸|风暖|暖风|浴室取暖|bath.?heater)", re.IGNORECASE)


def _classify_module() -> Any:
    """按需导入后端分类模块（只在跑回归子检查时需要运行期依赖）。"""
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    from homeos.backend.src.domains.device_profile import classify as module

    return module


def legacy_resolve(entity: dict[str, Any], configured: str = "auto") -> str:
    """旧 ``resolveClimateDeviceType()``（auto 分支）的等价实现。

    旧实现只在 ``configured === 'auto'`` 时跑启发式；语料里的实体都没有显式配置，
    因此这里固定走 auto 分支。

    模式名归一**复用后端**的 ``normalize_mode_key`` 而不是另抄一份：归一化口径本来
    就必须两端一致（它就是「同一张表」的一部分）；本脚本要锁定的是**规则表与分支顺序**
    （哪些档位算浴霸、先看名字还是先看档位），那部分保持独立实现。
    """
    if configured != "auto":
        return configured
    normalize_mode_key = _classify_module().normalize_mode_key
    attrs = entity.get("attributes") or {}
    hvac_modes = [str(item) for item in attrs.get("hvac_modes") or [] if str(item).strip()]
    preset_modes = [str(item) for item in attrs.get("preset_modes") or [] if str(item).strip()]
    name_text = str(attrs.get("friendly_name") or "").lower()
    if _LEGACY_BATH_HEATER_NAME.search(name_text):
        return "bath-heater"
    hvac_keys = [normalize_mode_key(item) for item in hvac_modes]
    preset_keys = [normalize_mode_key(item) for item in preset_modes]
    if any(key in _LEGACY_BATH_HEATER_MODES for key in (*hvac_keys, *preset_keys)):
        return "bath-heater"
    if any(key in ("cool", "heat_cool") for key in hvac_keys):
        return "air-conditioner"
    active = [key for key in hvac_keys if key != "off"]
    return "bath-heater" if active == ["heat"] else "air-conditioner"


def resolved_render_type(entity: dict[str, Any], profile_kind: str | None) -> str:
    """迁移后的链路（等价于新的 ``resolveClimateDeviceType()``）。

    1. 人工确认的 kind 优先（画像里 ``confirmed`` 的行）；
    2. 否则用后端规则分类的 kind；
    3. kind → 渲染形态；``unknown`` / 表外 → 按实体域兜底（water_heater 之外都是空调）。
    """
    module = _classify_module()
    entity_id = str(entity.get("entity_id") or "")
    domain = entity_id.split(".", 1)[0]
    kind = profile_kind or str(module.classify(entity)["kind"])
    render_type = module.CLIMATE_RENDER_TYPE_BY_KIND.get(kind, "")
    if kind != "unknown" and render_type:
        return render_type
    return "water-heater" if domain == "water_heater" else "air-conditioner"


def run_device_kinds_regression(verbose: bool = False) -> tuple[list[str], str]:
    if not FIXTURE.is_file():
        return [f"找不到语料 {FIXTURE}"], "找不到语料"

    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = payload.get("cases") or []
    problems: list[str] = []
    stats = {"cases": len(cases), "same": 0, "corrected": 0}

    for case in cases:
        case_id = str(case.get("id") or "?")
        entity = case.get("entity") or {}
        legacy = legacy_resolve(entity)
        resolved = resolved_render_type(entity, case.get("profileKind"))
        expected_legacy = str(case.get("legacy") or "")
        expected_resolved = str(case.get("resolved") or "")

        if legacy != expected_legacy:
            problems.append(f"{case_id}: 旧启发式结论变化 legacy={legacy!r}（语料记录 {expected_legacy!r}）")
        if resolved != expected_resolved:
            problems.append(f"{case_id}: 迁移后结论变化 resolved={resolved!r}（语料记录 {expected_resolved!r}）")

        differs = legacy != resolved
        if differs:
            stats["corrected"] += 1
            if case.get("verdict") != "correction" or not case.get("reason"):
                problems.append(f"{case_id}: 两端结论不同（{legacy} → {resolved}）但未登记 verdict/reason")
        else:
            stats["same"] += 1

        if verbose:
            mark = "≠" if differs else "="
            print(f"  {mark} {case_id:28} legacy={legacy:16} resolved={resolved:16} {case.get('why', '')}")

    return problems, f"{stats['cases']} 条语料，{stats['same']} 条两端一致，{stats['corrected']} 条有意修正"


# --------------------------------------------------------------------------- #
# 域 → 控制类型
# --------------------------------------------------------------------------- #


def load_extra_types_python() -> tuple[dict[str, str], list[str]]:
    """导入叶子模块拿表；顺带校验它确实没有 import（结构不变量）。"""
    problems: list[str] = []
    for node in parse_tree(EXTRA_TYPES_PY).body:
        if isinstance(node, ast.Import):
            problems.append(f"{EXTRA_TYPES_PY.name} 不应 import 任何模块（现引入 {ast.unparse(node)}）")
        elif isinstance(node, ast.ImportFrom):
            is_future = node.module == "__future__"
            if not is_future:
                problems.append(f"{EXTRA_TYPES_PY.name} 不应 import 任何模块（现引入 {ast.unparse(node)}）")

    spec = importlib.util.spec_from_file_location("_homeos_extra_types_parity", EXTRA_TYPES_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {EXTRA_TYPES_PY}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return dict(module.EXTRA_TYPES), problems


def load_extra_types_typescript() -> dict[str, str]:
    """从 ``extraTypes()`` 里抠出「域 → 类型」。

    这里解析的是**当前实现形状**：一个 ``[...].includes(domain)`` 的 panel 名单 +
    一个 ``const mapped = {...}`` 字面量 + ``return ['state']`` 兜底。形状一旦变化，
    本函数会抛错而不是静默返回空表 —— 静默会给出一条永远绿的假门禁。
    """
    source = EXTRA_TYPES_TS.read_text(encoding="utf-8")
    start = source.index("export function extraTypes(")
    end = source.index("\n}", start)
    body = source[start:end]

    table: dict[str, str] = {}

    # 1) 「整块面板」名单：`[ 'a', 'b', ... ].includes(domain)` 紧跟 `return ['panel', 'state']`
    list_match = re.search(
        r"\[([^\[\]]*?)\]\.includes\(\s*domain\s*\)\s*\)\s*return\s*\[\s*'(\w+)'\s*,\s*'state'\s*\]", body, re.DOTALL
    )
    if list_match is None:
        raise RuntimeError("无法从 extraTypes() 解析出 includes 分支的 panel 名单，实现形状可能已变，请更新本脚本")
    listed = re.findall(r"'([\w]+)'", list_match.group(1))
    listed_type = list_match.group(2)
    for domain in listed:
        table[domain] = listed_type

    # 2) `const mapped = { a: 'x', b: 'y' }`
    mapped_match = re.search(r"const\s+mapped\s*=\s*\{(.*?)\}\s*\[\s*domain\s*\]", body, re.DOTALL)
    if mapped_match is None:
        raise RuntimeError("无法从 extraTypes() 解析出 mapped 字面量，实现形状可能已变，请更新本脚本")
    for domain, mapped_type in re.findall(r"(\w+)\s*:\s*'(\w+)'", mapped_match.group(1)):
        if domain in table and table[domain] != mapped_type:
            raise RuntimeError(f"TS 侧 {domain} 同时出现在 includes 名单与 mapped 字面量里且类型不同")
        table[domain] = mapped_type

    # 3) 兜底必须是 state（否则第 1 条的等价性不成立）
    if not re.search(r":\s*\[\s*'state'\s*\]", body):
        raise RuntimeError("extraTypes() 的兜底分支不再是 ['state']，请更新本脚本的等价性口径")

    return table


def compare_extra_types(py_table: dict[str, str], ts_table: dict[str, str]) -> list[str]:
    problems: list[str] = []
    py_typed = {k: v for k, v in py_table.items() if v != FALLBACK_TYPE}
    ts_typed = {k: v for k, v in ts_table.items() if v != FALLBACK_TYPE}

    for domain in sorted(set(py_typed) | set(ts_typed)):
        left = py_typed.get(domain)
        right = ts_typed.get(domain)
        if left == right:
            continue
        if left is None:
            problems.append(f"{domain}: 仅 TS 侧映射为 {right!r}（Python 缺失）")
        elif right is None:
            problems.append(f"{domain}: 仅 Python 侧映射为 {left!r}（TS 缺失）")
        else:
            problems.append(f"{domain}: Python={left!r} 但 TS={right!r}")

    # Python 显式登记为 state 的域，TS 不得映射成可写类型
    for domain, py_type in py_table.items():
        if py_type != FALLBACK_TYPE:
            continue
        ts_type = ts_table.get(domain, FALLBACK_TYPE)
        if ts_type != FALLBACK_TYPE:
            problems.append(f"{domain}: Python 为只读 state，但 TS 映射为 {ts_type!r}")

    return problems


def run_extra_types() -> tuple[list[str], str]:
    if not EXTRA_TYPES_PY.is_file() or not EXTRA_TYPES_TS.is_file():
        return [], "找不到契约表文件，跳过"
    py_table, structure_problems = load_extra_types_python()
    ts_table = load_extra_types_typescript()
    return structure_problems + compare_extra_types(py_table, ts_table), (
        f"python={len(py_table)} 条，typescript={len(ts_table)} 条"
    )


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    verbose = "--verbose" in (argv if argv is not None else sys.argv[1:])
    modules: tuple[SubSpec, ...] = (
        ("device-kinds", run_device_kinds),
        ("device-kinds-regression", lambda: run_device_kinds_regression(verbose)),
        ("extra-types", run_extra_types),
    )
    return run_subchecks(
        modules=modules,
        title="契约表一致性",
        description="跨语言契约表一致性（设备 kind / 域控制类型）",
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
