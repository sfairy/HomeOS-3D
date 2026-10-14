#!/usr/bin/env python3
"""静态资源门禁的自检：**用合成 fixture 反证门禁会红**。

这道门禁最容易的假绿方式是「扫描不到就说没问题」：语料根改名、图标目录改名、
引用正则前置守卫写错（把 `/static/assets/icons/x` 当 `/icons/x`）—— 三种情况下它都会
打印「全部通过」。所以这里在临时目录里造一棵最小资源树（两个根 + 语料），逐条注入缺口，
断言门禁**确实报红且指名道姓**，再用同一批 fixture 断言「修好之后会转绿」。

每个用例都造**独立的一棵树**：上一用例留下的死图标会污染下一用例的孤儿判定。

用法：``python3 ops/check/verify_assets_selftest.py``
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import struct
import sys
import tempfile
from collections.abc import Callable, Generator
from pathlib import Path

HERE = Path(__file__).resolve().parent
GATE = HERE / "verify_assets.py"

# 公共骨架按包路径导入：本文件自己用 importlib 直接加载门禁（见 `load_gate`），
# 但记账层是个正常模块，走包导入才与其它自检一致 —— 所以先把仓库根放上 sys.path。
REPO_ROOT = HERE.parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ops.check._selftest_harness import Selftest

#: 记账/收尾统一走公共骨架。本文件的用例是「表驱动 + 期望片段」形态（见 `CASES`），
#: 与其余自检的 `check/expect` 不同，故保留自己的循环与逐行打印，只把清单与收尾交出去。
_SELFTEST = Selftest("静态资源门禁自检")


def load_gate():
    spec = importlib.util.spec_from_file_location("verify_assets", GATE)
    # 断言必须在用之前：`spec_from_file_location` 的返回是 `ModuleSpec | None`，
    # 先断言再使用，下面的 `module_from_spec` / `exec_module` 才收窄得掉 None。
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def png_bytes(width: int, height: int) -> bytes:
    """最小 PNG 头：签名 + IHDR（尺寸检查只读前 33 字节）。"""
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", width, height)
        + b"\x08\x06\x00\x00\x00"
    )


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_png(path: Path, declared: int, actual: int | None = None) -> None:
    """写一个「声明尺寸 declared、实际像素 actual」的 PNG（默认两者一致）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    side = actual if actual is not None else declared
    path.write_bytes(png_bytes(side, side))


BUILTIN_FILES = {
    "logo/logo.svg": "<svg/>",
    "sounds/doorbell.mp3": "ID3",
    "icons/domains/vacuum_idle.svg": "<svg/>",
}
PWA_ICON_SIZES = (16, 32, 48, 180, 192, 512)
PWA_FAMILIES = ("", "-h3", "-h4", "-h5")
MANIFEST = "homeos/frontend/public/static/assets/manifest/manifest.webmanifest"
ICONS = "homeos/frontend/public/static/assets/icons"


def make_tree(root: Path) -> None:
    """一棵自洽的最小资源树：门禁跑在它上面必须是绿的。"""
    for relative, text in BUILTIN_FILES.items():
        write(root / "homeos/assets" / relative, text)
    write(root / "homeos/assets/backgrounds/light_on.webp", "RIFF")
    write(root / "homeos/assets/backgrounds/light_off.webp", "RIFF")

    for family in PWA_FAMILIES:
        for size in PWA_ICON_SIZES:
            write_png(root / ICONS / f"homeos-icon-{size}{family}.png", size)
        for ext in ("ico", "svg"):
            write(root / ICONS / f"homeos-favicon{family}.{ext}", "x")
    for mark in ("homeos-mark-white-orange.svg", "homeos-mark-black-orange.svg"):
        write(root / ICONS / mark, "<svg/>")

    write(
        root / MANIFEST,
        json.dumps(
            {
                "name": "HomeOS",
                "icons": [
                    {"src": "/static/assets/icons/homeos-icon-192.png", "sizes": "192x192", "type": "image/png"},
                    {"src": "/static/assets/icons/homeos-icon-512.png", "sizes": "512x512", "type": "image/png"},
                ],
            },
            ensure_ascii=False,
        ),
    )
    write(
        root / "homeos/frontend/index.html",
        '<link rel="apple-touch-icon" href="/static/assets/icons/homeos-icon-180.png" sizes="180x180">\n'
        '<link rel="manifest" href="/static/assets/manifest/manifest.webmanifest">\n',
    )

    lines = [
        "export const logo = '/logo/logo.svg'",
        "export const bell = '/sounds/doorbell.mp3'",
        "export const lightOn = '/backgrounds/light_on.webp'",
        "export const lightOff = '/backgrounds/light_off.webp'",
        "export const icon = '/icons/domains/vacuum_idle.svg'",
        "export const markWhite = '/static/assets/icons/homeos-mark-white-orange.svg'",
        "export const markBlack = '/static/assets/icons/homeos-mark-black-orange.svg'",
    ]
    for family in PWA_FAMILIES:
        for size in PWA_ICON_SIZES:
            lines.append(
                f"export const icon{size}{family.replace('-', '_')} = '/static/assets/icons/homeos-icon-{size}{family}.png'"
            )
        for ext in ("ico", "svg"):
            lines.append(
                f"export const favicon{family.replace('-', '_')}_{ext} = '/static/assets/icons/homeos-favicon{family}.{ext}'"
            )
    write(root / "homeos/frontend/src/app.ts", "\n".join(lines) + "\n")


def add_refs(tree: Path, urls: list[str]) -> None:
    """往语料里塞引用（用于「引用了不存在的文件」这类用例）。"""
    write(
        tree / "homeos/frontend/src/extra.ts",
        "".join(f"export const extra{index} = {url!r}\n" for index, url in enumerate(urls)),
    )


CASES: list[tuple[str, str, Callable[[Path], None]]] = []


def case(name: str, expect: str):
    """注册用例：``expect`` 为 ``green`` 或「红档报错里必须出现的关键字」。"""

    def decorator(func: Callable[[Path], None]) -> Callable[[Path], None]:
        CASES.append((name, expect, func))
        return func

    return decorator


@case("基线：自洽的资源树必须绿", "green")
def _baseline(tree: Path) -> None:
    return None


@case("内置素材引用指向不存在的文件 → 红", "logo/brand-new.svg")
def _builtin_missing(tree: Path) -> None:
    add_refs(tree, ["/logo/brand-new.svg"])


@case("旧名迁移键（LEGACY_BUILTIN_ALIASES）不算缺口", "green")
def _legacy_alias(tree: Path) -> None:
    add_refs(tree, ["/backgrounds/light_on.png"])


@case("logo/ 下的死资源 → 红", "unused.svg")
def _builtin_orphan(tree: Path) -> None:
    write(tree / "homeos/assets/logo/unused.svg", "<svg/>")


@case("icons/ 是枚举消费，孤儿不判红", "green")
def _builtin_icons_orphan(tree: Path) -> None:
    write(tree / "homeos/assets/icons/domains/brand_new_icon.svg", "<svg/>")


@case("PWA 引用落不到盘 → 红", "homeos-icon-999.png")
def _pwa_missing(tree: Path) -> None:
    add_refs(tree, ["/static/assets/icons/homeos-icon-999.png"])


@case("清单 src 不在 icons/ 下 → 红", "不在 `/static/assets/icons/` 下")
def _manifest_outside_icons(tree: Path) -> None:
    write(tree / "homeos/frontend/public/static/assets/elsewhere.png", "x")
    write(tree / MANIFEST, json.dumps({"icons": [{"src": "/static/assets/elsewhere.png", "sizes": "1x1"}]}))


@case("清单声明尺寸与 PNG 实际像素不符 → 红", "实际像素 192x192")
def _manifest_size_mismatch(tree: Path) -> None:
    write(
        tree / MANIFEST,
        json.dumps({"icons": [{"src": "/static/assets/icons/homeos-icon-192.png", "sizes": "180x180"}]}),
    )


@case("未引用的规范命名图标 → 红（死资源）", "homeos-icon-256.png")
def _pwa_orphan(tree: Path) -> None:
    write_png(tree / ICONS / "homeos-icon-256.png", 256)


@case("命名约定之外的图标文件 → 红（成族检查）", "命名约定之外")
def _pwa_unexpected_name(tree: Path) -> None:
    write_png(tree / ICONS / "homeos-icon-192-h6.png", 192)


@case("某设备档缺一个尺寸 → 红（漏生成）", "缺 512x512 图标")
def _family_gap(tree: Path) -> None:
    (tree / ICONS / "homeos-icon-512-h4.png").unlink()


@case("资源根改名 → 红（不能静默变绿）", "内置素材根缺失")
def _root_renamed(tree: Path) -> None:
    (tree / "homeos/assets").rename(tree / "homeos/assets-renamed")


@case("产物目录里的文件不算引用来源（防自指假绿）", "homeos-icon-192-h6.png")
def _public_not_a_source(tree: Path) -> None:
    # 只在 public/ 内部出现的新图标：没人引用 → 必须报红（若把 public/ 当语料就会假绿）。
    write_png(tree / ICONS / "homeos-icon-192-h6.png", 192)


@contextlib.contextmanager
def fixture() -> Generator[Path]:
    """临时仓库根（`tempfile` 默认在系统 tmp，不会污染仓库，也不受 .gitignore 影响）。"""
    directory = Path(tempfile.mkdtemp(prefix="assets-gate-"))
    try:
        yield directory
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def run_gate(tree: Path) -> tuple[int, str]:
    """跑门禁，返回 ``(退出码, 输出)``；stdout/stderr 收进同一份文本便于断言。"""
    module = load_gate()
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        code = module.main(["--repo", str(tree)])
    return code, buffer.getvalue()


def main() -> int:
    greens = 0
    for name, expect, apply_fixture in CASES:
        with fixture() as tree:
            make_tree(tree)
            apply_fixture(tree)
            code, output = run_gate(tree)

        if expect == "green":
            greens += 1
            ok = code == 0
            detail = "期望绿但报红了"
        else:
            ok = code != 0 and expect in output
            detail = f"期望红且输出含「{expect}」"
        print(f"{'✓' if ok else '✗'} {name}（{detail}）")
        if ok:
            _SELFTEST.bump()
        else:
            _SELFTEST.fail(f"{name}：exit={code}\n{output}")

    # 收尾行沿用本文件原有的信息量（用例数与绿档数），只是换了统一的记账实现。
    _SELFTEST.note = f"：{len(CASES)} 个用例（含 {greens} 个绿档）。"
    return _SELFTEST.report()


if __name__ == "__main__":
    sys.exit(main())
