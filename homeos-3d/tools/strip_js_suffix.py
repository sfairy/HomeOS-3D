#!/usr/bin/env python3
"""去掉 import/export 说明符里残留的 `.js` 后缀（0.6.7 JS→TS 迁移收尾）。

背景：迁移保留了旧代码的 `.js` 说明符（`from "./cover-panel.js"`），
现在源码已是 `.ts`，靠 `moduleResolution: "bundler"` 的 `.js`→`.ts` 解析兜底。
统一去掉后缀后类型/打包仍然成立，且不再依赖这一隐式解析。

只处理两类说明符，且目标 `.ts` 必须真实存在，否则跳过并报告：
  - 相对路径   ./x  ../x
  - 别名       @app/x  @runtime/x

绝对 URL（/static/vendor/**、/api/v1/modules/**）与 new URL(...) 内的字符串
一律不动 —— 它们是运行时真实下发的 `.js` 路径，tsconfig 的 paths 也按含 `.js` 的键匹配。

用法：
    python3 strip_js_suffix.py            # 只报告
    python3 strip_js_suffix.py --apply    # 落盘
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# 仓库根：本文件位于 <root>/homeos-3d/tools/，不写死任何绝对路径。
REPO = Path(__file__).resolve().parents[2]
SRC = REPO / 'homeos-3d' / 'frontend' / 'src'
ALIASES = {
    '@app/': SRC / 'app',
    '@runtime/': SRC / 'runtime',
}

# from "x" / import("x") / export ... from "x"
PATTERN = re.compile(
    r'(?P<head>\bfrom\s*|\bimport\s*\(\s*)(?P<q>["\'])(?P<spec>(?:\.\.?/|@app/|@runtime/)[^"\']*?)\.js(?P<rest>\?[^"\']*)?(?P=q)'
)


def resolve(spec: str, file: Path) -> Path:
    for prefix, root in ALIASES.items():
        if spec.startswith(prefix):
            return root / spec[len(prefix):]
    return (file.parent / spec).resolve()


def main(apply: bool) -> int:
    changed = 0
    skipped: list[tuple[str, str]] = []
    for path in sorted(SRC.rglob('*.ts')):
        text = path.read_text(encoding='utf-8')
        pieces: list[str] = []
        pos = 0
        local = 0
        for match in PATTERN.finditer(text):
            spec = match.group('spec')
            target = resolve(spec, path)
            if not (target.with_suffix('.ts').exists() or (target / 'index.ts').exists()):
                skipped.append((str(path.relative_to(SRC)), spec))
                continue
            pieces.append(text[pos:match.start()])
            pieces.append(
                f"{match.group('head')}{match.group('q')}{spec}{match.group('rest') or ''}{match.group('q')}"
            )
            pos = match.end()
            local += 1
        if local:
            pieces.append(text[pos:])
            changed += local
            if apply:
                path.write_text(''.join(pieces), encoding='utf-8')

    print(f'说明符 {"已改写" if apply else "待改写"}: {changed}')
    if skipped:
        print(f'跳过（目标 .ts 不存在）: {len(skipped)}')
        for rel, spec in skipped[:40]:
            print(f'  {rel}  ::  {spec}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main('--apply' in sys.argv))
