#!/usr/bin/env python3
"""分析 0.6.7 前端所有模块说明符（import/export/动态 import/new URL/new Worker）。

只读。用于在改写前把「需要重写的说明符形状」摸清，避免漏改。
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

# 仓库根：本文件位于 <root>/homeos-3d/tools/，不写死任何绝对路径。
REPO = Path(__file__).resolve().parents[2]
SRC_FRONTEND = REPO / '0.6.7' / 'frontend'
OUT_DIR = REPO / 'homeos-3d' / 'tools' / '_migration'

# 静态 import/export ... from "x"（跨行安全：不限定同一行）
RE_FROM = re.compile(r'\bfrom\s*["\']([^"\']+)["\']')
# 裸 import "x"
RE_BARE = re.compile(r'(?:^|\n)\s*import\s*["\']([^"\']+)["\']')
# 动态 import("x")
RE_DYNAMIC = re.compile(r'\bimport\s*\(\s*["\']([^"\']+)["\']\s*\)')
# new URL("x", import.meta.url)
RE_NEW_URL = re.compile(r'new\s+URL\s*\(\s*["\']([^"\']+)["\']\s*,\s*import\.meta\.url\s*\)')
# new Worker("x") / new Worker(new URL(...))
RE_WORKER_LITERAL = re.compile(r'new\s+Worker\s*\(\s*["\']([^"\']+)["\']')
# 任意字符串里的 /bridge-static/
RE_BRIDGE_STATIC = re.compile(r'/bridge-static/[^\s"\'`)]*')
# 运行时模块 URL
RE_RUNTIME_URL = re.compile(r'/api/v1/modules/interaction3d/[^\s"\'`)]*')


def strip_version(spec: str) -> str:
    return spec.split('?', 1)[0]


def classify(spec: str) -> str:
    s = strip_version(spec)
    if s.startswith('./') or s.startswith('../'):
        return 'relative'
    if s.startswith('/bridge-static/'):
        return 'bridge-static'
    if s.startswith('/api/v1/modules/interaction3d/'):
        return 'runtime-api'
    if s.startswith('/api/'):
        return 'other-api'
    if s.startswith('/static/'):
        return 'static-abs'
    if s.startswith('/'):
        return 'root-abs'
    return 'bare'


def main() -> None:
    mapping = json.loads((OUT_DIR / 'mapping.json').read_text(encoding='utf-8'))['mapping']

    kinds: dict[str, int] = defaultdict(int)
    samples: dict[str, set[str]] = defaultdict(set)
    per_file: dict[str, list[str]] = {}
    unresolved: list[tuple[str, str]] = []

    for src_rel, dst_rel in sorted(mapping.items()):
        if not dst_rel.endswith(('.ts', '.js')):
            continue
        text = (SRC_FRONTEND / src_rel).read_text(encoding='utf-8', errors='replace')
        found: set[str] = set()
        for regex in (RE_FROM, RE_BARE, RE_DYNAMIC, RE_NEW_URL, RE_WORKER_LITERAL):
            for match in regex.finditer(text):
                found.add(match.group(1))
        for spec in found:
            kind = classify(spec)
            kinds[kind] += 1
            if len(samples[kind]) < 25:
                samples[kind].add(strip_version(spec))
        per_file[src_rel] = sorted(found)

        # 相对说明符必须能在映射里解析到，否则是漏改风险
        for spec in found:
            if classify(spec) == 'relative':
                target = resolve_relative(src_rel, strip_version(spec))
                if target is None or target not in mapping:
                    unresolved.append((src_rel, spec))

    report = {
        'kinds': dict(kinds),
        'samples': {k: sorted(v) for k, v in samples.items()},
        'per_file': per_file,
        'unresolved_relative': unresolved,
    }
    (OUT_DIR / 'specifiers.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    print('说明符分类统计：')
    for kind, count in sorted(kinds.items(), key=lambda kv: -kv[1]):
        print(f'  {count:5d}  {kind}')
    print()
    for kind in ('relative', 'bridge-static', 'runtime-api', 'static-abs', 'root-abs', 'bare', 'other-api'):
        if kind in samples:
            print(f'--- {kind} 样例 ---')
            for spec in sorted(samples[kind])[:20]:
                print(f'    {spec}')
            print()

    print(f'未能解析的相对说明符: {len(unresolved)}')
    for src, spec in unresolved[:40]:
        print(f'  ! {src}  ->  {spec}')


def resolve_relative(src_rel: str, spec: str) -> str | None:
    base = Path(src_rel).parent
    parts = list(base.parts)
    for chunk in spec.split('/'):
        if chunk in ('', '.'):
            continue
        if chunk == '..':
            if not parts:
                return None
            parts.pop()
        else:
            parts.append(chunk)
    return '/'.join(parts)


if __name__ == '__main__':
    main()
