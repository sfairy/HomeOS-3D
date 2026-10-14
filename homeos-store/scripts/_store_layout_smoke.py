#!/usr/bin/env python3
"""商店前端布局契约回归：静态壳表的 `dvh` 配对 + 表格容器显式横向可滚。

为什么住在商店侧，而不是主应用的那份 layout 冒烟里
--------------------------------------------------
两棵前端是**可独立构建部署**的树：主应用的源码与脚本里一旦出现兄弟项目的路径，
`verify:independence` 会拦下（理由很实在 —— 那条路径会把两边的构建也绑死）。
所以「商店自己的样式」只能由商店自己守。口径与主应用那份一致，只是范围收窄到本工程：

1. **可视高度**：声明了 `100vh` 的行，紧接着必须有一条 `100dvh`。移动端地址栏收起/展开时
   `vh` 用的是「最大可视高度」，只写 `vh` 的壳会在地址栏展开时溢出、在收起时留白。
2. **表格横向可滚**：包着表格的滚动容器必须**显式**写 `overflow-x`，不能依赖
   「`overflow-y: auto` + `overflow-x: visible` ⇒ 规范隐式把另一个轴也改成 auto」这条路 ——
   前者是规范行为、后者是各浏览器实现细节，商店后台的宽表在窄屏上会直接切掉右侧列。

口径说明：这是**已收敛清单的棘轮**。`public/static/` 下的是发行用的静态壳表（压缩产物
`*.min.css` 不参与），`frontend/src/**` 是本工程可写的样式源；两处都必须干净。

用法（从仓库根执行，只用标准库）::

    python3 homeos-store/scripts/_store_layout_smoke.py
"""

from __future__ import annotations

import re
from pathlib import Path

from _smoke_harness import STORE_ROOT, check, expect_true, report

FRONTEND = STORE_ROOT / "frontend"
STATIC = FRONTEND / "public" / "static"
SRC = FRONTEND / "src"

#: 「视口高度」声明：`height` / `min-height` / `max-height` 里带 `100vh`（也覆盖 calc 里的）。
_VIEWPORT_HEIGHT = re.compile(r"(?:^|[;\s{])(?:min-|max-)?height:\s*([^;]*\b100vh\b[^;]*)")

#: 剥注释：注释里常出现 `{`/`}`，不剥会把块结构切坏。
_COMMENT = re.compile(r"/\*[\s\S]*?\*/")


def strip_comments(css: str) -> str:
    return _COMMENT.sub("", css)


def rules_of(css: str) -> list[tuple[list[str], str]]:
    """极简 CSS 规则解析：返回 ``[(选择器列表, 声明体)]``（支持 at-rule 嵌套）。"""
    text = strip_comments(css)
    out: list[tuple[list[str], str]] = []
    cursor = 0
    fence = 0
    while cursor < len(text):
        char = text[cursor]
        if char == "{":
            selector = text[fence:cursor].strip()
            close = text.find("}", cursor)
            if close == -1:
                break
            out.append(([part.strip() for part in selector.split(",") if part.strip()], text[cursor + 1 : close]))
            cursor = close + 1
            fence = cursor
            continue
        if char in "};":
            fence = cursor + 1
        cursor += 1
    return out


def declarations(rule: tuple[list[str], str], prop: str) -> list[str]:
    """取某属性在规则体里的所有声明值（同名多次声明按出现顺序）。"""
    body = rule[1]
    return [
        match.group(1).strip()
        for match in re.finditer(rf"(?:^|[;{{])\s*{re.escape(prop)}\s*:([^;}}]+)", body)
    ]


def rules_for(rules: list[tuple[list[str], str]], selector: str) -> list[tuple[list[str], str]]:
    return [rule for rule in rules if selector in rule[0]]


def css_files_under(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix in {".css", ".vue"} and not path.name.endswith(".min.css")
    )


def uncovered_viewport_heights(files: list[Path]) -> list[str]:
    """找出「视口高度」声明里没配 `100dvh` 的行（配对口径：下一行含 `100dvh`）。"""
    out: list[str] = []
    for path in files:
        lines = path.read_text(encoding="utf-8").splitlines()
        for index, line in enumerate(lines):
            match = _VIEWPORT_HEIGHT.search(line)
            if match is None or "dvh" in line:
                continue
            following = lines[index + 1] if index + 1 < len(lines) else ""
            if "100dvh" in following:
                continue
            out.append(f"{path.relative_to(STORE_ROOT)}:{index + 1} {match.group(1).strip()}")
    return out


def main() -> None:
    print("商店前端布局契约冒烟：")

    # ① 发行用静态壳表（`*.min.css` 是第三方压缩产物，不参与）
    static_files = list(css_files_under(STATIC))
    check("① 静态壳表：目录存在且扫到了文件", lambda: expect_true(bool(static_files), f"{STATIC} 下没有 CSS"))
    static_uncovered = uncovered_viewport_heights(static_files)

    def static_dvh_ok() -> None:
        expect_true(
            not static_uncovered,
            "静态壳表里有视口高度声明没配 dvh：" + "、".join(static_uncovered),
        )

    check("① 静态壳表：每条视口高度声明都配了 dvh", static_dvh_ok)

    # ② 本工程可写的样式源
    src_files = css_files_under(SRC)
    check("② 样式源：目录存在且扫到了文件", lambda: expect_true(bool(src_files), f"{SRC} 下没有 CSS"))

    def src_dvh_ok() -> None:
        uncovered = uncovered_viewport_heights(src_files)
        expect_true(not uncovered, "样式源里有视口高度声明没配 dvh：" + "、".join(uncovered))

    check("② 样式源：每条视口高度声明都配了 dvh", src_dvh_ok)

    # ③ 宽表容器必须显式声明横向可滚（不能靠 overflow-y 的隐式转换）
    admin_rules = rules_of((STATIC / "admin.css").read_text(encoding="utf-8"))
    store_rules = rules_of((STATIC / "store.css").read_text(encoding="utf-8"))

    def table_wrap_scrolls() -> None:
        hits = rules_for(admin_rules, ".table-wrap")
        expect_true(bool(hits), "admin.css 里找不到 .table-wrap 规则（选择器改名了？）")
        values = [value for rule in hits for value in declarations(rule, "overflow")]
        expect_true(
            any(re.search(r"auto|scroll", value) for value in values),
            f".table-wrap 未声明可滚动的 overflow：{values}",
        )

    check("③ 商店后台：.table-wrap 可滚", table_wrap_scrolls)

    def referral_table_scrolls() -> None:
        hits = rules_for(store_rules, ".referral-table-wrap")
        expect_true(bool(hits), "store.css 里找不到 .referral-table-wrap 规则（选择器改名了？）")
        values = [value for rule in hits for value in declarations(rule, "overflow-x")]
        expect_true(
            any(re.search(r"auto|scroll", value) for value in values),
            f".referral-table-wrap 未显式声明 overflow-x：{values}",
        )

    check("③ 商店前台：.referral-table-wrap 显式 overflow-x", referral_table_scrolls)

    report("商店前端布局契约冒烟通过。")


if __name__ == "__main__":
    main()
