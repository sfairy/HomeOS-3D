#!/usr/bin/env python3
"""按映射表把 0.6.7 前端源码改写并落到 0.6.7-ts/frontend。

改写范围严格限定为四类（对应计划的「零功能丢失保障」）：
  1. 文件移动/改名（由 migrate_frontend.py 的映射表决定）
  2. /bridge-static/ → /static/（纯前缀，资产相对布局不变）
  3. 运行时模块 URL 扁平 → 嵌套（/api/v1/modules/interaction3d/<name> → <domain>/<name>）
  4. 跨构建边界的 import：runtime → app 改走 @app 别名（与参考工程同法），
     双路径 new URL 三元折叠为单条 import(...)

其余内容逐字节保留：不改标识符、不改字面量、不删代码、不动顺序。

用法：
    python3 rewrite_frontend.py --report   # 只报告将要发生的改写
    python3 rewrite_frontend.py --apply    # 落盘
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

from migrate_frontend import (
    RUNTIME_CSS_DOMAIN,
    RUNTIME_DOMAINS,
    build_mapping,
)

# 仓库根：本文件位于 <root>/homeos-3d/tools/，不写死任何绝对路径。
REPO = Path(__file__).resolve().parents[2]
SRC_FRONTEND = REPO / '0.6.7' / 'frontend'
DST_FRONTEND = REPO / 'homeos-3d' / 'frontend'
OUT_DIR = REPO / 'homeos-3d' / 'tools' / '_migration'

VENDOR_STATIC_PREFIX = '/static/vendor/'

# 扁平模块名 -> 新嵌套相对路径（含扩展名），供运行时 URL 重写使用
FLAT_TO_NESTED: dict[str, str] = {}
for _domain, _names in RUNTIME_DOMAINS.items():
    for _name in _names:
        FLAT_TO_NESTED[f'{_name}.js'] = f'{_domain}/{_name}.js'
for _css, _domain in RUNTIME_CSS_DOMAIN.items():
    FLAT_TO_NESTED[_css] = f'{_domain}/{_css}'

# 显式覆盖：绝对 URL 字面量里，源文件被编译进 bundle（不再按原路径下发）的少数几处
ABS_URL_OVERRIDES: dict[str, str] = {
    # 经典 Worker：由 vite classicIifePlugin 输出到固定路径（参考工程同法）
    '/bridge-static/3d-studio/draco-decoder-worker.js':
        '/static/3d-studio/export/draco-decoder-worker.js',
}

# 源文件 -> 目标文件（相对各自根）
RE_FROM = re.compile(r'(?P<pre>\bfrom\s*)(?P<q>["\'])(?P<spec>[^"\']+)(?P=q)')
RE_BARE = re.compile(r'(?P<pre>(?:^|\n)\s*import\s*)(?P<q>["\'])(?P<spec>[^"\']+)(?P=q)')
RE_DYNAMIC = re.compile(r'(?P<pre>\bimport\s*\(\s*)(?P<q>["\'])(?P<spec>[^"\']+)(?P=q)(?P<post>\s*\))')
RE_NEW_URL = re.compile(
    r'(?P<pre>new\s+URL\s*\(\s*)(?P<q>["\'])(?P<spec>[^"\']+)(?P=q)'
    r'(?P<post>\s*,\s*import\.meta\.url\s*,?\s*\))'
)
RE_WORKER = re.compile(r'(?P<pre>new\s+Worker\s*\(\s*)(?P<q>["\'])(?P<spec>[^"\']+)(?P=q)')

# 双路径 new URL 三元：import.meta.url.startsWith("file:") ? import(new URL(A)) : import(new URL(B))
RE_DUAL_PATH = re.compile(
    r'import\.meta\.url\.startsWith\("file:"\)\s*\?\s*'
    r'import\(\s*new URL\(\s*"[^"]*"\s*,\s*import\.meta\.url\s*,?\s*\)\s*\)\s*:\s*'
    r'import\(\s*new URL\(\s*"(?P<spec>[^"]+)"\s*,\s*import\.meta\.url\s*,?\s*\)\s*\)'
)

RE_BRIDGE_LITERAL = re.compile(r'/bridge-static/[^\s"\'`)]*')
RE_RUNTIME_LITERAL = re.compile(r'/api/v1/modules/interaction3d/[^\s"\'`)]*')

# const X = new URL(cond ? "dev" : "prod", import.meta.url); export const { y } = await import(X.href);
RE_MODULE_URL_REEXPORT = re.compile(
    r'const\s+\w+\s*=\s*new URL\(\s*'
    r'import\.meta\.url\.startsWith\("file:"\)\s*\?\s*"[^"]*"\s*:\s*"(?P<prod>[^"]*)"\s*,?\s*'
    r'import\.meta\.url\s*,?\s*\)\s*;\s*'
    r'export const \{(?P<bindings>[^}]+)\}\s*=\s*await import\(\w+\.href\s*\);'
)


def is_runtime(src_rel: str, dst_rel: str) -> bool:
    return dst_rel.startswith('src/runtime/')


def app_alias_for(dst_rel: str) -> str | None:
    """src/app/... -> @app/....js（保持 .js 后缀，与参考工程一致）。"""
    if dst_rel.startswith('src/app/'):
        return '@app/' + to_js_specifier(dst_rel[len('src/app/'):])
    return None


def to_js_specifier(path: str) -> str:
    """TS 源码在 import 说明符里必须写成 .js（Vite/TS bundler 解析口径）。"""
    if path.endswith('.ts'):
        return path[:-3] + '.js'
    return path


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


class Rewriter:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping
        self.dst_of = mapping
        self.stats: Counter[str] = Counter()
        self.notes: list[str] = []
        self.unresolved: list[tuple[str, str]] = []

    # -- 说明符解析 ---------------------------------------------------------
    def new_specifier(self, src_rel: str, dst_rel: str, raw_spec: str) -> str | None:
        """返回重写后的说明符；None 表示保持原样。"""
        spec = raw_spec.split('?', 1)[0]
        if not spec:
            return None

        # 1) 绝对 URL 覆盖表
        if spec in ABS_URL_OVERRIDES:
            self.stats['abs-override'] += 1
            return ABS_URL_OVERRIDES[spec]

        # 2) 相对说明符
        if spec.startswith('./') or spec.startswith('../'):
            resolved = resolve_relative(src_rel, spec)
            if resolved is not None and resolved.startswith('static/vendor/'):
                self.stats['vendor'] += 1
                return '/static/' + resolved[len('static/'):]
            if resolved is not None and resolved in self.mapping:
                target = self.mapping[resolved]
                self.stats['relative->relative'] += 1
                return relative_specifier(dst_rel, target)
            # 逃出 frontend 根 -> 变成根绝对 URL
            if spec.startswith('../'):
                tail = collapse_root_absolute(src_rel, spec)
                if tail is not None:
                    return self.new_specifier(src_rel, dst_rel, tail)
            self.unresolved.append((src_rel, raw_spec))
            return None

        # 3) /bridge-static/...
        if spec.startswith('/bridge-static/'):
            rel = spec[len('/bridge-static/'):]
            if rel.startswith('vendor/'):
                self.stats['vendor'] += 1
                return VENDOR_STATIC_PREFIX + rel[len('vendor/'):]
            src_target = f'static/{rel}'
            target = self.mapping.get(src_target)
            if target is None:
                # 资产（未参与编译）保持相对布局
                self.stats['asset-prefix'] += 1
                return '/static/' + rel
            if is_runtime(src_rel, dst_rel):
                alias = app_alias_for(target)
                if alias:
                    self.stats['runtime->app'] += 1
                    return alias
            self.stats['app->app'] += 1
            return relative_specifier(dst_rel, target)

        # 4) /api/v1/modules/interaction3d/...
        if spec.startswith('/api/v1/modules/interaction3d/'):
            self.stats['runtime-url'] += 1
            return nest_runtime_url(spec)

        return None

    # -- 逐文件改写 ---------------------------------------------------------
    def rewrite(self, src_rel: str, dst_rel: str, text: str) -> str:
        # (a) 双路径 new URL 三元折叠为单条 import("@app/...")
        def dual(match: re.Match[str]) -> str:
            spec = match.group('spec')
            new = self.new_specifier(src_rel, dst_rel, spec)
            if new is None:
                self.unresolved.append((src_rel, spec))
                return match.group(0)
            self.stats['dual-path->import'] += 1
            return f'import("{new}")'

        out = RE_DUAL_PATH.sub(dual, text)

        # (a2) `const X = new URL(cond ? dev : prod, import.meta.url); export const {y} = await import(X.href);`
        #      -> `export { y } from "@app/...";`（与参考工程同法）
        def module_url_reexport(match: re.Match[str]) -> str:
            new = self.new_specifier(src_rel, dst_rel, match.group('prod'))
            if new is None:
                self.unresolved.append((src_rel, match.group('prod')))
                return match.group(0)
            self.stats['module-url->reexport'] += 1
            bindings = ' '.join(match.group('bindings').split())
            return f'export {{ {bindings} }} from "{new}";'

        out = RE_MODULE_URL_REEXPORT.sub(module_url_reexport, out)

        # (b) 从**原始文本**收集说明符并一次性算完替换目标（不能从折叠后的 out 收集，
        #     否则折叠产物 import("./x.js") 会被当成源说明符二次解析）。
        replacements: dict[str, str] = {}
        for regex in (RE_FROM, RE_DYNAMIC, RE_NEW_URL, RE_WORKER, RE_BARE):
            for match in regex.finditer(text):
                raw = match.group('spec')
                if raw in replacements:
                    continue
                new = self.new_specifier(src_rel, dst_rel, raw)
                if new is not None and new != raw:
                    replacements[raw] = new

        # (c) 占位符法：每个匹配换成唯一 token，最后统一回填 —— 单趟替换，不会级联。
        tokens: dict[str, str] = {}
        counter = [0]

        def swap(match: re.Match[str]) -> str:
            raw = match.group('spec')
            new = replacements.get(raw)
            if new is None:
                return match.group(0)
            token = f'\u0000SPEC{counter[0]}\u0000'
            counter[0] += 1
            tokens[token] = new
            q = match.group('q')
            groups = match.groupdict()
            return (
                (groups.get('pre') or '')
                + q + token + q
                + (groups.get('post') or '')
            )

        for regex in (RE_FROM, RE_DYNAMIC, RE_NEW_URL, RE_WORKER, RE_BARE):
            out = regex.sub(swap, out)

        for token, value in tokens.items():
            out = out.replace(token, value)

        # (d) 残留的绝对 URL 字面量（资产 / 运行时 URL）
        def abs_literal(match: re.Match[str]) -> str:
            raw = match.group(0)
            spec = raw.split('?', 1)[0]
            if spec in ABS_URL_OVERRIDES:
                self.stats['abs-override'] += 1
                return ABS_URL_OVERRIDES[spec]
            self.stats['asset-prefix'] += 1
            return '/static/' + spec[len('/bridge-static/'):]

        out = RE_BRIDGE_LITERAL.sub(abs_literal, out)

        def runtime_literal(match: re.Match[str]) -> str:
            self.stats['runtime-url'] += 1
            return nest_runtime_url(match.group(0).split('?', 1)[0])

        out = RE_RUNTIME_LITERAL.sub(runtime_literal, out)

        return out


def collapse_root_absolute(src_rel: str, spec: str) -> str | None:
    """把 ../../../../bridge-static/... 这类逃出根目录的相对路径还原成根绝对路径。"""
    depth = len(Path(src_rel).parent.parts)
    parts = spec.split('/')
    ups = 0
    idx = 0
    for i, chunk in enumerate(parts):
        if chunk == '..':
            ups += 1
            idx = i + 1
        elif chunk == '.':
            continue
        else:
            break
    if ups < depth:
        return None
    rest = '/'.join(parts[idx:])
    if rest.startswith('bridge-static/'):
        return '/bridge-static/' + rest[len('bridge-static/'):]
    if rest.startswith('api/'):
        return '/api/' + rest[len('api/'):]
    return None


def relative_specifier(dst_from: str, dst_to: str) -> str:
    """从 dst_from 计算指向 dst_to 的相对说明符（TS 目标写成 .js）。"""
    from_parts = Path(dst_from).parent.parts
    to_parts = Path(dst_to).parts
    common = 0
    for a, b in zip(from_parts, to_parts):
        if a != b:
            break
        common += 1
    ups = ['..'] * (len(from_parts) - common)
    down = list(to_parts[common:])
    rel = '/'.join(ups + down)
    if not rel.startswith('.'):
        rel = './' + rel
    return to_js_specifier(rel)


def nest_runtime_url(spec: str) -> str:
    prefix = '/api/v1/modules/interaction3d/'
    if not spec.startswith(prefix):
        return spec
    rest = spec[len(prefix):]
    if rest in FLAT_TO_NESTED:
        return prefix + FLAT_TO_NESTED[rest]
    return spec


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    if args.apply and DST_FRONTEND.exists() and any(DST_FRONTEND.iterdir()):
        print(
            f'目标工程已存在且非空：{DST_FRONTEND}\n迁移已完成，拒绝覆盖。',
            file=sys.stderr,
        )
        return 1

    mapping, unmapped = build_mapping()
    if unmapped:
        print('映射表有未归类条目，先修 migrate_frontend.py', file=sys.stderr)
        return 1

    rewriter = Rewriter(mapping)
    changed = 0
    leftover: list[tuple[str, str]] = []

    for src_rel, dst_rel in sorted(mapping.items()):
        if not dst_rel.endswith(('.ts', '.js')):
            continue
        src = SRC_FRONTEND / src_rel
        text = src.read_text(encoding='utf-8')
        out = rewriter.rewrite(src_rel, dst_rel, text)
        if out != text:
            changed += 1
        for match in RE_BRIDGE_LITERAL.finditer(out):
            leftover.append((dst_rel, match.group(0).split('?', 1)[0]))

        if args.apply:
            dst = DST_FRONTEND / dst_rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(out, encoding='utf-8')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / 'rewrite_report.json').write_text(
        json.dumps(
            {
                'stats': dict(rewriter.stats),
                'unresolved': rewriter.unresolved,
                'leftover_bridge_static': leftover,
            },
            ensure_ascii=False,
            indent=2,
        ) + '\n',
        encoding='utf-8',
    )

    print('改写统计：')
    for key, count in sorted(rewriter.stats.items(), key=lambda kv: -kv[1]):
        print(f'  {count:5d}  {key}')
    print(f'\n改动文件数: {changed} / {len(mapping)}')
    print(f'未能解析的说明符: {len(rewriter.unresolved)}')
    for src, spec in rewriter.unresolved[:30]:
        print(f'  ! {src}  ->  {spec}')
    print(f'\n残留 /bridge-static/ 字面量: {len(leftover)}')
    for dst, spec in leftover[:30]:
        print(f'  ? {dst}  ->  {spec}')

    if args.apply:
        print(f'\n已写入 {DST_FRONTEND}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
