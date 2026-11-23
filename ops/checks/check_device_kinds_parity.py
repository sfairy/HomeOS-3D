#!/usr/bin/env python3
"""「设备 kind → 渲染形态」契约表的两端一致性门禁（只读，纯标准库）。

为什么需要它
------------
3D 面板要回答一个同步问题：「这台 climate 设备该画空调面板还是浴霸面板？」。
此前答案由前端自己猜：``resolveClimateDeviceType()`` 用设备中文名正则
（``浴霸|风暖|暖风``）+ ``hvac_modes`` 启发式判一遍；后端 ``domains/device_profile/classify.py``
是另一套规则（按域与属性指纹分类，判不出来就要求人工确认）。两套规则各判一次，
同一台设备在 3D 面板、语音选目标、自动化执行里可能结论不同。

现在唯一的换算表是 ``CLIMATE_RENDER_TYPE_BY_KIND``：

- ``homeos/backend/src/domains/device_profile/classify.py`` —— 权威 kind 集合 + 换算；
- ``packages/shared/src/entity/device-kind.ts`` —— 前端唯一词汇表与前端的同一张换算表。

它们不可能合并成一个文件（一个跑 Python、一个跑浏览器），因此这里不做代码生成
（跨语言生成器本身会成为第三处真相），只做**断言**：

1. 两端的 climate kind 集合逐条相等（顺序不计）；
2. 两端的 ``kind -> 渲染形态`` 映射逐条相等；
3. TS 的 ``CLIMATE_RENDER_TYPES`` 与映射值集合相等（新增渲染形态必须两端同步）。

形状一旦变化（例如把 ``Object.freeze({...})`` 改成函数返回），本脚本报错而不是
静默返回空表 —— 静默会给出一条永远绿的假门禁。

用法：
    node ops/lib/py.mjs ops/checks/check_device_kinds_parity.py           # 只报告
    node ops/lib/py.mjs ops/checks/check_device_kinds_parity.py --check   # 门禁（违规退出 1）
    node ops/lib/py.mjs ops/checks/check_device_kinds_parity.py --json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PY_TABLE = REPO_ROOT / "homeos/backend/src/domains/device_profile/classify.py"
TS_TABLE = REPO_ROOT / "packages/shared/src/entity/device-kind.ts"


def load_python_tables() -> tuple[list[str], dict[str, str]]:
    """导入 classify.py 拿 kind 集合与换算表（纯模块，不依赖运行时）。"""
    spec = importlib.util.spec_from_file_location("_homeos_device_kinds_parity", PY_TABLE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {PY_TABLE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    kinds = list(module.CLIMATE_KINDS)
    render_map = dict(module.CLIMATE_RENDER_TYPE_BY_KIND)
    return kinds, render_map


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


def compare(
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


def main() -> int:
    parser = argparse.ArgumentParser(description="校验「设备 kind → 渲染形态」契约表两端一致")
    parser.add_argument("--check", action="store_true", help="有违规时退出 1")
    parser.add_argument("--json", action="store_true", help="机器可读")
    args = parser.parse_args()

    if not PY_TABLE.is_file() or not TS_TABLE.is_file():
        print("check_device_kinds_parity: 找不到契约表文件，跳过", file=sys.stderr)
        return 0

    try:
        py_kinds, py_map = load_python_tables()
        ts_source = TS_TABLE.read_text(encoding="utf-8")
        ts_kinds = _ts_array(ts_source, "CLIMATE_KINDS")
        ts_map = _ts_render_map(ts_source)
        ts_render_types = _ts_array(ts_source, "CLIMATE_RENDER_TYPES")
    except (RuntimeError, OSError) as error:
        print(f"check_device_kinds_parity: {error}", file=sys.stderr)
        return 1

    problems = compare(py_kinds, py_map, ts_kinds, ts_map, ts_render_types)

    if args.json:
        print(
            json.dumps(
                {
                    "pythonKinds": py_kinds,
                    "typescriptKinds": ts_kinds,
                    "pythonRenderTypes": sorted(set(py_map.values())),
                    "typescriptRenderTypes": ts_render_types,
                    "violations": problems,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"check_device_kinds_parity: python={len(py_kinds)} kind，typescript={len(ts_kinds)} kind")
        for problem in problems:
            print(f"  ✗ {problem}")

    if problems and args.check:
        print(f"check_device_kinds_parity: {len(problems)} violation(s)", file=sys.stderr)
        return 1
    if not problems:
        print("check_device_kinds_parity: 0 violation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
