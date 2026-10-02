#!/usr/bin/env python3
"""给仍有类型错误的文件加 `// @ts-nocheck`，把基线刷绿。

策略（对应计划里的 pragmatic typing）：
  - 迭代：跑 typecheck -> 给报错文件加 pragma -> 再跑，直到 0 错误。
  - 只动报错文件；本来就干净的文件保持「真类型检查」，不无脑全加。
  - 不删代码、不改语义：只在文件最前面加一行注释。
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRAGMA = '// @ts-nocheck  (0.6.7 JS→TS 全量迁移：该文件保留原生 JS 写法，类型基线暂不收紧)\n'
ERR_FILE = re.compile(r'^(frontend/src/[^(]+?)\(', re.M)


def run_typecheck() -> tuple[int, set[str]]:
    proc = subprocess.run(
        ['bun', 'run', 'typecheck'],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    out = proc.stdout + proc.stderr
    files = {m.group(1) for m in ERR_FILE.finditer(out)}
    count = out.count('error TS')
    return count, files


def main() -> int:
    total_rounds = 0
    touched: set[str] = set()
    while True:
        count, files = run_typecheck()
        print(f'[round {total_rounds}] errors={count} files={len(files)}', flush=True)
        files = {f for f in files if not f.endswith('.d.ts')}
        if count == 0 or not files:
            break
        new = files - touched
        if not new:
            print('无可新增 pragma 的文件，但仍有错误：')
            proc = subprocess.run(
                ['bun', 'run', 'typecheck'], cwd=ROOT, capture_output=True, text=True
            )
            print('\n'.join((proc.stdout + proc.stderr).splitlines()[:40]))
            return 1
        for rel in new:
            path = ROOT / rel
            text = path.read_text(encoding='utf-8')
            if '@ts-nocheck' in text.split('\n', 1)[0]:
                continue
            path.write_text(PRAGMA + text, encoding='utf-8')
            touched.add(rel)
        total_rounds += 1

    print(f'\n共为 {len(touched)} 个文件加上 @ts-nocheck')
    (ROOT / 'tools' / '_migration' / 'ts-nocheck-files.txt').write_text(
        '\n'.join(sorted(touched)) + '\n', encoding='utf-8'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
