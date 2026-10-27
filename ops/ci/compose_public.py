#!/usr/bin/env python3
"""把 docker-compose.yml 里注释态的「可选：内置 Caddy 入口」段启用一次，写到临时文件。

为什么要有这一步
----------------
公网接入不是独立文件，而是 ``docker-compose.yml`` 里的一段注释：**启用时才取消注释**。
注释里的缩进只有取消注释后才会被 YAML 解析 —— 写错了平时看不出来，等到部署时才以
「additional properties 'caddy-public' not allowed」（缩进掉了、变成顶层键）的形式炸。

这个脚本只做「正确地取消注释」，不判断正确性：产物交给 ``docker compose config`` 去解析，
解析不过就是缩进错了。逻辑此前内嵌在 ``.github/workflows/checks.yml`` 的 heredoc 里，
一旦要本地复现就得手工复制 —— 现在本地与 CI 都跑 ``bun run gate:infra``。

段的边界按**内容**定位（注释态的 ``caddy-public:`` 行），不按装饰性分隔线：那种
``# ───…`` 围栏在文件改版时被删过一次，硬编码长度会让本脚本直接 ValueError 挂掉，
且报错与真正的问题（缩进）毫无关系。

用法：
    python3 ops/ci/compose_public.py [--out /tmp/compose-public.yml]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
COMPOSE = ROOT / 'docker-compose.yml'
#: 文件末尾两个卷同样是注释态：启用 Caddy 时必须一起放开，否则挂载点没有对应卷。
COMMENTED_VOLUMES = '  # caddy-public-data:\n  # caddy-public-config:\n'
ENABLED_VOLUMES = '  caddy-public-data:\n  caddy-public-config:\n'


def render(source: str) -> tuple[str, int]:
    """返回（启用后的完整 compose 文本，服务块行数）。"""
    lines = source.splitlines(keepends=True)
    start = next(
        (i for i, line in enumerate(lines) if re.match(r'^\s*#\s*caddy-public:\s*$', line)),
        None,
    )
    if start is None:
        sys.exit(
            '::error::docker-compose.yml 里找不到注释态的 `caddy-public:` 服务块 —— '
            '「可选：内置 Caddy 入口」段被改了写法，请同步修改 ops/ci/compose_public.py'
        )

    # 往前吞掉紧邻的纯注释行（说明文字与 `#` 分隔行），启用后块前后都是干净的空行。
    begin = start
    while begin > 0 and re.match(r'^\s*#', lines[begin - 1]):
        begin -= 1
    end = start
    while end < len(lines) and re.match(r'^\s*#', lines[end]):
        end += 1

    block: list[str] = []
    for line in lines[begin:end]:
        # 只去掉注释标记，**保留缩进**：这段是 services: 下的一个兄弟服务，缩进掉了
        # 就变成顶层键，正是本脚本要喂给 compose 去抓的那类错。
        body = re.sub(r'^(\s*)#\s?', r'\1', line)
        # 保留服务块本身的键与列表项，丢掉面向人的说明文字（注释行）。
        if re.match(r'^\s*(caddy-public:|[A-Za-z][A-Za-z_-]*:|- )', body):
            block.append(body.rstrip() + '\n')

    if not block or not block[0].strip().startswith('caddy-public:') or len(block) < 10:
        sys.exit(
            '::error::「可选：内置 Caddy 入口」段解析失败 —— 注释块结构与提取逻辑不符，'
            '请同步修改 ops/ci/compose_public.py'
        )

    out = ''.join(lines[:begin]) + ''.join(block) + ''.join(lines[end:])
    if COMMENTED_VOLUMES not in out:
        sys.exit(
            '::error::文件末尾的 caddy-public-data / caddy-public-config 卷不是预期的注释态，'
            '请同步修改 ops/ci/compose_public.py'
        )
    return out.replace(COMMENTED_VOLUMES, ENABLED_VOLUMES), len(block)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    # 默认路径由调用方（ops/gates.mjs）显式给出；这里只做兜底，且走 tempfile.gettempdir()
    # 而不是硬编码 /tmp（Windows 没有 /tmp，ruff 的 S108 也会把硬编码临时路径判为不安全）。
    parser.add_argument('--out', default=None)
    options = parser.parse_args()

    out = options.out or str(pathlib.Path(tempfile.gettempdir()) / 'compose-public.yml')
    text, block_lines = render(COMPOSE.read_text(encoding='utf-8'))
    pathlib.Path(out).write_text(text, encoding='utf-8')
    print(f'已生成 {out}（服务块 {block_lines} 行）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
