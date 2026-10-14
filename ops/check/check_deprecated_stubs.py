#!/usr/bin/env python3
"""`@deprecated` 转发桩门禁：**目标必须可解析，且必须在退役登记里**。

## 为什么需要这道门禁

studio 收敛把文件搬进新目录（`runtime/editor/**` → `runtime/config-ui/**`、
`runtime/*.ts` → `runtime/platform/*.ts`）时，为不打断调用方，在原位置留了一批
「`/** @deprecated ... */` + `export * from '<新路径>'`」的转发桩。这类桩有三个典型死法，
而且**没有一个现有门禁看得见**：

1. **目标被再次搬家 / 删除** → 桩变成编译期断裂（或更糟：被 `export *` 掩盖成空模块），
   报错点在几百个调用方而不是桩本身。
2. **桩链**：新位置又被人留了一个桩转发到第三处 —— 一次 import 穿三层文件，
   读代码的人永远找不到真实体。
3. **无限期存活**：桩没有退役日期，就没有任何力量逼调用方迁移；半年后没人记得
   这个路径已经作废，新代码照抄旧路径，收敛等于白做。

所以本门禁做三件事：**目标可解析 + 禁止桩链 + 强制登记（含退役期限）**。

## 口径

- 桩 = 去掉注释后**只剩** `export ... from '<目标>'` 的 `.ts`/`.vue` 文件，且含 `@deprecated`。
  （只写了 `@deprecated` 注释但本身有实现的文件不是桩，例如宿主文件里的历史说明。）
- 登记表 = `ops/check/deprecated_stubs.json`；每条含 `path` / `target` / `reason` / `since`，
  以及二选一：`retire_by`（临时桩，到期必须删除或续期）或 `status: "retained"`（有意长期保留的别名）。
- 登记与实物必须双向一致：磁盘有桩未登记 → 失败；登记了但磁盘没有 → 失败；
  登记 target 与实际 `export from` 不一致 → 失败。

用法：
```bash
python3 ops/check/check_deprecated_stubs.py              # 门禁（CI 跑这条）
python3 ops/check/check_deprecated_stubs.py --list       # 只打印桩与目标，不判成败
python3 ops/check/check_deprecated_stubs.py --root=<dir> --registry=<file>   # 自检注入 fixture
```
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

# 遍历与读文件走共享实现（`ops/lib/scan.py`）：Python 门禁各写一份遍历器 = 漏后缀就静默变绿。
from ops.lib import scan

FRONTEND_SRC = REPO / "homeos" / "frontend" / "src"
DEFAULT_REGISTRY = REPO / "ops" / "check" / "deprecated_stubs.json"

SUFFIXES = scan.TS_EXTS

#: `@/x`、`@app/x`、`@runtime/x` 三类别名 → frontend/src 下的真实前缀（与 tsconfig.json 的 paths 对齐）。
ALIASES = {
    "@/": "",
    "@app/": "studio/app/",
    "@runtime/": "studio/runtime/",
}

EXPORT_FROM = re.compile(
    r"""export\s+(?:\*|\{[^}]*\}|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"]""",
    re.DOTALL,
)
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT = re.compile(r"^\s*//.*$", re.MULTILINE)


def strip_comments(text: str) -> str:
    """去掉块注释与整行注释；保留代码行，便于判断「这文件是不是纯转发桩」。"""
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", text))


def collect_stubs(root: Path) -> list[tuple[Path, list[str]]]:
    """找出 `root` 下所有纯转发桩：去注释后只剩 `export ... from '...'` 语句。"""
    stubs: list[tuple[Path, list[str]]] = []
    for path in scan.walk(root, SUFFIXES):
        raw = scan.read_text(path)
        if raw is None or "@deprecated" not in raw:
            continue
        body = strip_comments(raw)
        statements = [line.strip() for line in body.splitlines() if line.strip()]
        if not statements:
            continue
        targets = EXPORT_FROM.findall(body)
        # 每一行都必须是 export ... from（允许多条：一个桩转发多份符号）。
        if not targets or len(targets) != len(statements):
            continue
        stubs.append((path, targets))
    return stubs


def resolve_target(stub: Path, specifier: str, root: Path) -> Path | None:
    """把 import 说明符解析成真实文件；解析不到返回 None。"""
    if specifier.startswith("."):
        base = (stub.parent / specifier).resolve()
    else:
        for alias, prefix in ALIASES.items():
            if specifier.startswith(alias):
                base = (root / prefix / specifier[len(alias) :]).resolve()
                break
        else:
            return None  # 包名（vue / three 等）：不是仓库内转发，跳过
    candidates = [base] if base.suffix in SUFFIXES else [base.with_suffix(s) for s in SUFFIXES]
    candidates += [base / "index.ts", base / "index.tsx", base / "index.vue"]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def load_registry(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("stubs", []))


def parse_iso(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def validate_entry(entry: dict, index: int) -> list[str]:
    """登记表自身自洽性：字段齐全、日期合法、临时桩必须有退役期限。"""
    problems: list[str] = []
    where = entry.get("path") or f"stubs[{index}]"
    for key in ("path", "target", "reason", "since"):
        if not str(entry.get(key, "")).strip():
            problems.append(f"{where}：登记缺字段 `{key}`（桩登记要能回答「转到哪、为什么、从哪天起」）")
    if "since" in entry and parse_iso(str(entry.get("since"))) is None:
        problems.append(f"{where}：`since` 不是 ISO 日期（形如 2026-10-13）")
    status = entry.get("status", "active")
    if status not in ("active", "retained"):
        problems.append(f"{where}：`status` 只能是 active（有退役期限）或 retained（有意长期保留）")
    if status == "active" and parse_iso(str(entry.get("retire_by", ""))) is None:
        problems.append(
            f"{where}：临时桩必须写 `retire_by`（ISO 日期）—— 没有期限的桩就是永久桩，"
            '要长期保留请显式写 `status: "retained"` 并说明理由'
        )
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=str(FRONTEND_SRC), help="扫描根（默认 frontend/src）")
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY), help="退役登记表路径")
    parser.add_argument("--list", action="store_true", help="只打印桩与目标，不判成败")
    parser.add_argument("--today", default=None, help="覆盖「今天」（自检用，验证到期判定）")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    registry_path = Path(args.registry).resolve()
    today = parse_iso(args.today) if args.today else date.today()
    problems: list[str] = []

    if not root.is_dir():
        print(f"✗ 扫描根不存在：{root}（目录改名后门禁会静默变绿，故按硬失败处理）", file=sys.stderr)
        return 1

    stubs = collect_stubs(root)
    stub_by_rel = {str(path.relative_to(root)): (path, targets) for path, targets in stubs}

    if args.list:
        for rel, (_, targets) in sorted(stub_by_rel.items()):
            print(f"{rel}  ->  {', '.join(targets)}")
        print(f"共 {len(stub_by_rel)} 个转发桩")
        return 0

    if not registry_path.is_file():
        print(f"✗ 退役登记表缺失：{registry_path}", file=sys.stderr)
        return 1
    entries = load_registry(registry_path)
    for index, entry in enumerate(entries):
        problems.extend(validate_entry(entry, index))

    registered = {str(entry.get("path", "")).strip(): entry for entry in entries}

    # ① 磁盘上的每个桩都必须在登记表里，且 target 与实物一致。
    for rel, (_path, targets) in sorted(stub_by_rel.items()):
        entry = registered.get(rel)
        if entry is None:
            problems.append(
                f"{rel}：磁盘上有 `@deprecated` 转发桩，但退役登记里没有 —— 新增桩必须登记（含退役期限）"
            )
            continue
        declared = str(entry.get("target", "")).strip()
        if declared not in targets:
            problems.append(
                f"{rel}：登记 target `{declared}` 与实物 `{', '.join(targets)}` 不一致（搬了目标没改登记？）"
            )

    # ② 登记表里的每条都必须有实物（删了桩却留着登记 = 死登记）。
    for rel in sorted(registered):
        if rel and rel not in stub_by_rel:
            problems.append(f"{rel}：登记还在，但磁盘上已没有这个桩 —— 退役后请同步删除登记条目")

    # ③ 目标可解析、不自指、不成链。
    for rel, (path, targets) in sorted(stub_by_rel.items()):
        for specifier in targets:
            target = resolve_target(path, specifier, root)
            if target is None:
                problems.append(f"{rel}：转发目标 `{specifier}` 解析不到文件（桩已断链）")
                continue
            if target == path:
                problems.append(f"{rel}：转发目标指向自己（自指桩，import 会成环）")
                continue
            try:
                target_rel = str(target.relative_to(root))
            except ValueError:
                continue  # 目标是仓库外：不判链
            if target_rel in stub_by_rel:
                problems.append(
                    f"{rel}：转发目标 `{specifier}` 本身也是转发桩（{target_rel}）—— 禁止桩链，请直接指向真实体"
                )

    # ④ 到期的临时桩必须删除或续期（续期 = 改 `retire_by`，评审可见）。
    for rel, entry in sorted(registered.items()):
        if not rel or entry.get("status", "active") != "active":
            continue
        due = parse_iso(str(entry.get("retire_by", "")))
        if due is not None and today is not None and due < today:
            problems.append(
                f"{rel}：退役期限 {due.isoformat()} 已过（今天 {today.isoformat()}）—— "
                '调用方迁移完就删桩并清登记，确需保留则改写 `status: "retained"` + 理由'
            )

    if problems:
        print("✗ `@deprecated` 转发桩门禁未通过：", file=sys.stderr)
        for item in problems:
            print(f"  - {item}", file=sys.stderr)
        return 1

    print(f"✓ `@deprecated` 转发桩门禁通过：{len(stub_by_rel)} 个桩全部登记在册、目标可解析、无桩链、无过期。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
