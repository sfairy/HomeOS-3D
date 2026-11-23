#!/usr/bin/env python3
"""设备 kind 迁移回归（只读，纯标准库 + 项目运行期依赖）。

为什么需要它
------------
设备形态（空调 / 浴霸 / 热水器）此前由前端启发式推断：设备中文名正则
（``浴霸|风暖|暖风|浴室取暖``）+ ``hvac_modes`` 的档位特征。后端同期对 climate 一律
回 ``unknown``（要求人工确认）。两种结论各判一次，同一台设备在 3D 面板、语音选目标、
自动化执行里可能不一致 —— 这是本次治理要消除的「业务规则双份真源」。

规则搬到后端 `classify()` 之后，必须证明**迁移没有改变既有结论**：本脚本把旧前端
启发式原样保留为 ``legacy_*`` 参照实现，对同一批实体快照同时跑两套规则：

- ``legacy``   —— 旧前端启发式（已删除，仅作为对照保留在脚本里）；
- ``resolved`` —— 迁移后的链路：人工确认的 kind 优先 → 规则分类 kind → 渲染形态映射
                  → 按实体域兜底。

语料 `ops/checks/fixtures/device-kinds-entities.json` 里逐条记录了期望结论。
**任何一条结论变化都会让门禁失败**：要么是真正的回归（改回去），要么是有意修正
（把该条的 ``resolved`` 与 ``verdict`` / ``reason`` 一并更新，让变更在评审里可见）。

用法：
    node ops/lib/py.mjs ops/checks/check_device_kinds_regression.py           # 只报告
    node ops/lib/py.mjs ops/checks/check_device_kinds_regression.py --check   # 门禁（不一致退出 1）
    node ops/lib/py.mjs ops/checks/check_device_kinds_regression.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.device_profile.classify import (
    CLIMATE_RENDER_TYPE_BY_KIND,
    classify,
    normalize_mode_key,
)

FIXTURE = Path(__file__).with_name("fixtures") / "device-kinds-entities.json"

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
    entity_id = str(entity.get("entity_id") or "")
    domain = entity_id.split(".", 1)[0]
    kind = profile_kind or str(classify(entity)["kind"])
    render_type = CLIMATE_RENDER_TYPE_BY_KIND.get(kind, "")
    if kind != "unknown" and render_type:
        return render_type
    return "water-heater" if domain == "water_heater" else "air-conditioner"


def run(verbose: bool) -> tuple[list[str], dict[str, int]]:
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

    return problems, stats


def main() -> int:
    parser = argparse.ArgumentParser(description="设备 kind 迁移回归（旧启发式 vs 迁移后链路）")
    parser.add_argument("--check", action="store_true", help="有不一致时退出 1")
    parser.add_argument("--json", action="store_true", help="机器可读")
    parser.add_argument("--verbose", action="store_true", help="逐条打印结论")
    args = parser.parse_args()

    if not FIXTURE.is_file():
        print(f"check_device_kinds_regression: 找不到语料 {FIXTURE}", file=sys.stderr)
        return 1

    problems, stats = run(args.verbose)

    if args.json:
        print(json.dumps({"stats": stats, "violations": problems}, ensure_ascii=False, indent=2))
    else:
        print(
            f"check_device_kinds_regression: {stats['cases']} 条语料，"
            f"{stats['same']} 条两端一致，{stats['corrected']} 条有意修正"
        )
        for problem in problems:
            print(f"  ✗ {problem}")

    if problems and args.check:
        print(f"check_device_kinds_regression: {len(problems)} violation(s)", file=sys.stderr)
        return 1
    if not problems:
        print("check_device_kinds_regression: 0 violation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
