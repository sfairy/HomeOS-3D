"""字体域常量。"""

from __future__ import annotations

import re

#: 随包内置的 8 款字体（id 与 ``assets-default/fonts/catalog.json`` 一致）。
BUILTIN_FONT_IDS = frozenset(
    {
        "inter",
        "orbitron",
        "lxgw-wenkai",
        "smiley-sans",
        "noto-sans-sc",
        "jetbrains-mono",
        "barlow-condensed",
        "source-han-serif",
    }
)

#: 用户字体 id：``font:`` + 文件 sha256 的前 32 位（同一文件重复上传落到同一条目）。
FONT_ID = re.compile(r"^font:[0-9a-f]{32}$")
FONT_ID_PREFIX = "font:"

FONT_TYPES = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}

MAX_FONT_BYTES = 32 * 1024 * 1024
MAX_FONTS = 32
