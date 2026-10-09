#!/usr/bin/env python3
"""TS ↔ Python 共享契约门禁：用黄金向量对账至少一个孪生清单。

``@homeos/shared`` 是 TypeScript 真源，主应用 Python 侧手抄了子集（不能 import 前端包）。
漂移的表现是「前端房间 Tab 有客厅、后端语音解析认不出」或「儿童 ACL 两端拦的域不一致」。
本脚本只做字符串解析 + JSON 对账，不跑 tsc / 不 import 后端包。

检查：

1. ``ops/contracts/shared-twins.json`` 可解析；
2. 儿童受限域：``child-restricted-domains.ts`` ↔ ``core/entity_domain.py`` ↔ 黄金列表；
3. 默认房间 id：``room/catalog.ts`` ↔ ``services/rooms.py`` ↔ 黄金列表（顺序敏感）。

用法::

    python ops/check_shared_contracts.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "ops" / "contracts" / "shared-twins.json"

TS_DOMAINS = (
    ROOT / "homeos" / "packages" / "shared" / "src" / "auth" / "child-restricted-domains.ts"
)
PY_DOMAINS = ROOT / "homeos" / "backend" / "src" / "core" / "entity_domain.py"
TS_ROOMS = ROOT / "homeos" / "packages" / "shared" / "src" / "room" / "catalog.ts"
PY_ROOMS = ROOT / "homeos" / "backend" / "src" / "services" / "rooms.py"

_QUOTED = re.compile(r"""['"]([^'"]+)['"]""")
_TS_ROOM_ID = re.compile(r"^\s*id:\s*'([^']+)'\s*,?\s*$", re.M)
_PY_ROOM_ENTRY = re.compile(r'_entry\(\s*"([^"]+)"')
_TS_DOMAIN_BLOCK = re.compile(
    r"export const CHILD_RESTRICTED_DOMAIN_LIST\s*=\s*\[(.*?)\]\s*as const",
    re.S,
)
_PY_DOMAIN_BLOCK = re.compile(
    r"CHILD_RESTRICTED_DOMAIN_LIST\s*=\s*\((.*?)\)",
    re.S,
)


def _fail(message: str) -> int:
    print(f"契约漂移：{message}", file=sys.stderr)
    return 1


def _quoted_list(block: str) -> list[str]:
    return _QUOTED.findall(block)


def load_ts_domains(text: str) -> list[str]:
    match = _TS_DOMAIN_BLOCK.search(text)
    if not match:
        raise ValueError(f"解析失败：{TS_DOMAINS.relative_to(ROOT)} 找不到 CHILD_RESTRICTED_DOMAIN_LIST")
    return _quoted_list(match.group(1))


def load_py_domains(text: str) -> list[str]:
    match = _PY_DOMAIN_BLOCK.search(text)
    if not match:
        raise ValueError(f"解析失败：{PY_DOMAINS.relative_to(ROOT)} 找不到 CHILD_RESTRICTED_DOMAIN_LIST")
    return _quoted_list(match.group(1))


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


def main() -> int:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    expected_domains = list(golden["childRestrictedDomains"])
    expected_rooms = list(golden["roomCatalogIds"])

    ts_domains = load_ts_domains(TS_DOMAINS.read_text(encoding="utf-8"))
    py_domains = load_py_domains(PY_DOMAINS.read_text(encoding="utf-8"))
    ts_rooms = load_ts_rooms(TS_ROOMS.read_text(encoding="utf-8"))
    py_rooms = load_py_rooms(PY_ROOMS.read_text(encoding="utf-8"))

    problems = [
        item
        for item in (
            _same("TS 儿童受限域", ts_domains, expected_domains),
            _same("Python 儿童受限域", py_domains, expected_domains),
            _same("TS 房间目录 id", ts_rooms, expected_rooms),
            _same("Python 房间目录 id", py_rooms, expected_rooms),
        )
        if item
    ]
    if problems:
        return _fail("；".join(problems))

    print(
        "共享契约：通过 "
        f"（儿童受限域 {len(expected_domains)} 项，房间目录 {len(expected_rooms)} 项）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
