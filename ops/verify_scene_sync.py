#!/usr/bin/env python3
"""校验 design/scene 下的场景资源与各前端 public 副本逐字节一致。

design/scene 是唯一真相，homeos / homeos-store 的 public/static 副本才是真正被
打包发布的那一份。副本落后不会有任何报错，只会让页面表现悄悄退回旧版：
曾在商店那份 panel.css 上落后一个主版本（少了一条 [hidden] 规则），结果是
激活表单在页面上藏不住。所以把「同源」固化成一条可执行的门槛。
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'design' / 'scene'
COPIES = (
    ROOT / 'homeos' / 'frontend' / 'public' / 'static' / 'auth' / 'scene',
    ROOT / 'homeos-store' / 'frontend' / 'public' / 'static' / 'scene',
)
FILES = ('fonts.css', 'page.css', 'panel.css', 'scene.css')
FONT_DIR = 'fonts'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    if not MASTER.is_dir():
        print(f'找不到主版本目录：{MASTER}')
        return 2
    problems: list[str] = []
    checked = 0
    for copy in COPIES:
        if not copy.is_dir():
            problems.append(f'缺少副本目录 {copy.relative_to(ROOT)}')
            continue
        for name in FILES:
            master_file = MASTER / name
            copy_file = copy / name
            if not master_file.is_file():
                problems.append(f'主版本缺少 {name}')
                continue
            checked += 1
            if not copy_file.is_file():
                problems.append(f'{copy_file.relative_to(ROOT)} 缺失（应为 design/scene/{name} 的副本）')
                continue
            if digest(master_file) != digest(copy_file):
                problems.append(f'{copy_file.relative_to(ROOT)} 与 design/scene/{name} 不一致')
        font_src = MASTER / FONT_DIR
        for font in sorted(font_src.iterdir()) if font_src.is_dir() else []:
            if not font.is_file():
                continue
            checked += 1
            target = copy / FONT_DIR / font.name
            if not target.is_file():
                problems.append(f'{target.relative_to(ROOT)} 缺失')
            elif digest(font) != digest(target):
                problems.append(f'{target.relative_to(ROOT)} 与 design/scene/{FONT_DIR}/{font.name} 不一致')

    if problems:
        print('场景资源不同步（design/scene 是唯一真相，请把主版本复制过去）：')
        for problem in problems:
            print(f'  - {problem}')
        print(f'共比对 {checked} 个文件，{len(problems)} 处不一致。')
        return 1
    print(f'场景资源同步正常：{checked} 个文件与 design/scene 逐字节一致。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
