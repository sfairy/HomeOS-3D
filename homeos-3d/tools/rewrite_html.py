#!/usr/bin/env python3
"""把 0.6.7 的 8 个 HTML 页面改写到 0.6.7-ts/frontend/pages/。

规则（顺序敏感）：
  1. `<script type="module" src="/bridge-static/X.js?v=…">` -> `/src/app/…/X.ts`
     （Vite 会在构建时把它换成带 hash 的产物）
  2. `<script src="/bridge-static/X.js?v=…">`（经典 IIFE）-> `/static/<entry>.js`
  3. 其余 /bridge-static/（css / webmanifest / 图标 / 字体）-> /static/
  4. /api/v1/modules/interaction3d/<扁平> -> <域>/<扁平>
标签顺序、属性、文本一律保持原样；只换 URL。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from migrate_frontend import REPO, SRC_FRONTEND  # noqa: E402
from rewrite_frontend import (  # noqa: E402
    ABS_URL_OVERRIDES,
    nest_runtime_url,
)

DST_PAGES = REPO / '0.6.7-ts' / 'frontend' / 'pages'

# 经典 IIFE 入口：源 JS -> 构建产物路径（与 vite.config.ts 的 classicEntries 一致）
CLASSIC_DESTS: dict[str, str] = {
    'client-log.js': '/static/logging/client-log.js',
    'display-boot.js': '/static/display/display-boot.js',
    'display-startup.js': '/static/display/display-startup.js',
    'pairing-entry.js': '/static/auth/pairing-entry.js',
    'auth/scene/scene-depth.js': '/static/auth/scene/scene-depth.js',
}

RE_SCRIPT = re.compile(r'<script\b[^>]*>', re.I | re.S)
RE_SRC = re.compile(r'\bsrc\s*=\s*(["\'])(?P<src>[^"\']+)\1', re.I | re.S)
RE_TYPE_MODULE = re.compile(r'\btype\s*=\s*["\']module["\']', re.I)
RE_BRIDGE = re.compile(r'/bridge-static/[^\s"\'`)]*')
RE_RUNTIME = re.compile(r'/api/v1/modules/interaction3d/[^\s"\'`)]*')


class HtmlRewriter:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping
        self.notes: list[str] = []

    def rewrite(self, name: str, text: str) -> str:
        out: list[str] = []
        pos = 0
        for match in RE_SCRIPT.finditer(text):
            out.append(text[pos:match.start()])
            out.append(self.rewrite_script_tag(match.group(0), name))
            pos = match.end()
        out.append(text[pos:])
        body = ''.join(out)

        # 非 script 标签里的 /bridge-static/（link/icon/manifest/img）
        body = RE_BRIDGE.sub(self.rewrite_plain_literal, body)
        body = RE_RUNTIME.sub(lambda m: nest_runtime_url(m.group(0).split('?', 1)[0]), body)
        return body

    def rewrite_script_tag(self, tag: str, page: str) -> str:
        src_match = RE_SRC.search(tag)
        if src_match is None:
            return tag
        raw = src_match.group('src')
        new = self.script_src(raw, page)
        if new is None or new == raw:
            return tag
        return tag[:src_match.start('src')] + new + tag[src_match.end('src'):]

    def script_src(self, raw: str, page: str) -> str | None:
        spec = raw.split('?', 1)[0]
        if not spec.startswith('/bridge-static/'):
            return None
        rel = spec[len('/bridge-static/'):]

        if rel.startswith('vendor/'):
            return '/static/' + rel

        if rel in CLASSIC_DESTS:
            self.notes.append(f'{page}: classic {rel} -> {CLASSIC_DESTS[rel]}')
            return CLASSIC_DESTS[rel]

        target = self.mapping.get(f'static/{rel}')
        if target and target.startswith('src/app/'):
            self.notes.append(f'{page}: module {rel} -> /{target}')
            return '/' + target

        if spec in ABS_URL_OVERRIDES:
            return ABS_URL_OVERRIDES[spec]

        self.notes.append(f'{page}: pass-through {rel} -> /static/{rel}')
        return '/static/' + rel

    def rewrite_plain_literal(self, match: re.Match[str]) -> str:
        raw = match.group(0)
        spec = raw.split('?', 1)[0]
        if spec in ABS_URL_OVERRIDES:
            return ABS_URL_OVERRIDES[spec]
        return '/static/' + spec[len('/bridge-static/'):]


def main() -> int:
    import json

    mapping = json.loads(
        (REPO / '0.6.7-ts' / 'tools' / '_migration' / 'mapping.json').read_text(encoding='utf-8')
    )['mapping']
    rewriter = HtmlRewriter(mapping)
    DST_PAGES.mkdir(parents=True, exist_ok=True)

    for path in sorted(SRC_FRONTEND.glob('*.html')):
        text = path.read_text(encoding='utf-8')
        out = rewriter.rewrite(path.name, text)
        (DST_PAGES / path.name).write_text(out, encoding='utf-8')
        leftover = RE_BRIDGE.findall(out)
        flag = '' if not leftover else f'  !! 残留 {leftover}'
        print(f'  {path.name}{flag}')

    print('\n入口改写明细：')
    for note in rewriter.notes:
        print(f'  {note}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
