#!/usr/bin/env python3
"""UI 素材（背景图）服务自检：分层合并 / 隐藏标记 / 删除语义 / SVG 消毒 / 图标目录退役。

为什么需要它：这套服务同时管着两件事，且两件事都不会让编译失败 ——

1. **两层文件系统**（随包只读 ``assets/backgrounds`` + 用户可写 ``<data>/ui-assets``）合并成
   一个列表视图。任何一处优先级写反，用户上传的图会被随包默认图盖住；任何一处 ``hidden``
   判断写漏，用户删掉的默认图会在下次刷新时「复活」。
2. **上传即执行面**：``/backgrounds`` 是匿名可取的静态挂载，未消毒的 SVG 就是一个可长期
   引用的同源脚本（存储型 XSS）。消毒是解析式而非正则式，最容易在「改一行」时退化。

外加一条本轮新增的收尾逻辑：图标素材库下线后，``<data>/ui-assets/icons`` 与实例目录里的
``icons/`` 必须被改名隔离而不是物理删除（素材可能来自用户自己画的图）。

用法：
    node ops/lib/py.mjs ops/checks/ui_assets_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from _selftest_support import check, report

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.ui_config.static_assets import (
    UiConfigStaticAssetService,
    create_image_directory,
    delete_image_asset,
    list_image_assets,
    save_image_asset,
)
from homeos.backend.src.platform.core.http.asset_paths import (
    hidden_asset_key,
    layered_asset_path,
    load_hidden_assets,
    sanitize_uploaded_svg,
    save_hidden_assets,
)
from homeos.backend.src.platform.core.http.errors import BusinessException


#: 与 ``_background_url`` 同形：``/backgrounds/<子路径>``。
def _url(*segments: str) -> str:
    tail = "/".join(segment for segment in segments if segment)
    return f"/backgrounds/{tail}" if tail else "/backgrounds"


def expect_error(fn, label: str, http_status: int | None = None) -> None:
    """断言 ``fn()`` 抛业务异常（可核对 HTTP 状态码）。"""
    try:
        fn()
    except BusinessException as error:
        check(f"{label}（业务异常）", True)
        if http_status is not None:
            check(f"{label}（状态码 {http_status}）", error.status_code == http_status, str(error.status_code))
        return
    raise AssertionError(f"{label} 未抛异常")


def write(path: Path, text: str = "x") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def names(entries) -> list[str]:
    return [entry["name"] for entry in entries]


def test_save_and_list() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        builtin = Path(tmp) / "builtin"
        user = Path(tmp) / "user"
        ui_root = Path(tmp) / "ui"
        write(builtin / "light_on.webp", "builtin-on")
        write(builtin / "light_off.webp", "builtin-off")
        write(builtin / "gallery" / "old.webp", "builtin-nested")

        # 同名上传必须覆盖随包默认图（用户层优先）。
        saved = save_image_asset(user, _url, "light_on.webp", b"user-on", "", "背景图")
        check("save_image_asset 返回文件名", saved["name"] == "light_on.webp")
        check("save_image_asset 返回可访问 URL", saved["url"] == "/backgrounds/light_on.webp", saved["url"])
        check("save_image_asset 落盘", (user / "light_on.webp").read_bytes() == b"user-on")

        root_entries = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "", "背景图")
        check(
            "根目录列出两层合并结果",
            names(root_entries) == ["gallery", "light_off.webp", "light_on.webp"],
            str(names(root_entries)),
        )
        check("目录排在文件之前", root_entries[0]["type"] == "dir")

        merged = next(entry for entry in root_entries if entry["name"] == "light_on.webp")
        check("同名时用户层 URL 生效", merged["url"] == "/backgrounds/light_on.webp")
        check("同名时用户层字节数为准", merged["size"] == len(b"user-on"), str(merged["size"]))
        off = next(entry for entry in root_entries if entry["name"] == "light_off.webp")
        check("未覆盖项仍来自随包层", off["size"] == len(b"builtin-off"))

        nested = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "gallery", "背景图")
        check("子目录只看该层文件", names(nested) == ["old.webp"], str(names(nested)))

        # 扩展名白名单：不是图片就 400，且不落盘。
        expect_error(
            lambda: save_image_asset(user, _url, "notes.txt", b"nope", "", "背景图"),
            "非图片扩展名被拒",
            400,
        )
        check("被拒文件未落盘", not (user / "notes.txt").exists())

        # 目录建两次必须 400（合并视图里已存在）。
        create_image_directory(builtin, user, "gallery2", "背景图")
        check("建目录落到用户层", (user / "gallery2").is_dir())
        expect_error(
            lambda: create_image_directory(builtin, user, "gallery2", "背景图"),
            "重复建目录被拒",
            400,
        )
        expect_error(
            lambda: create_image_directory(builtin, user, "gallery", "背景图"),
            "与随包目录同名被拒",
            400,
        )


def test_hidden_markers() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        builtin = Path(tmp) / "builtin"
        user = Path(tmp) / "user"
        ui_root = Path(tmp) / "ui"
        write(builtin / "a.webp", "a")
        write(builtin / "dir" / "b.webp", "b")
        user.mkdir(parents=True, exist_ok=True)

        # 删除随包素材：文件不能真删（升级会复活），只能写隐藏标记。
        delete_image_asset(builtin, user, ui_root, "backgrounds", "a.webp", "背景图")
        check("随包文件未被物理删除", (builtin / "a.webp").is_file())
        hidden = load_hidden_assets(ui_root)
        check("隐藏标记已写入", hidden_asset_key("backgrounds", "a.webp") in hidden, str(hidden))

        after = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "", "背景图")
        check("被隐藏的随包素材不再列出", "a.webp" not in names(after), str(names(after)))
        check("未隐藏的目录仍在", "dir" in names(after))

        # 删目录：祖先被隐藏时整棵子树都算隐藏。
        delete_image_asset(builtin, user, ui_root, "backgrounds", "dir", "背景图")
        check("随包目录未被物理删除", (builtin / "dir").is_dir())
        root_after = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "", "背景图")
        check("被隐藏的目录不再列出", "dir" not in names(root_after), str(names(root_after)))
        nested_after = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "dir", "背景图")
        check("隐藏目录的子树整层不列出", nested_after == [], str(names(nested_after)))

        # 用户层文件是真删。
        write(user / "mine.webp", "mine")
        delete_image_asset(builtin, user, ui_root, "backgrounds", "mine.webp", "背景图")
        check("用户层文件物理删除", not (user / "mine.webp").exists())

        # 两层都没有 → 400（带 NOT_FOUND 语义的 code）。
        expect_error(
            lambda: delete_image_asset(builtin, user, ui_root, "backgrounds", "ghost.webp", "背景图"),
            "删除不存在的素材被拒",
            400,
        )

        # 手工清掉隐藏标记后，随包素材应当重新可见（验证「隐藏」而非「删除」）。
        save_hidden_assets(ui_root, set())
        restored = list_image_assets(builtin, user, ui_root, "backgrounds", _url, "", "背景图")
        check("清空隐藏标记后随包素材恢复", "a.webp" in names(restored), str(names(restored)))


def test_layered_resolution() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        builtin = Path(tmp) / "builtin"
        user = Path(tmp) / "user"
        write(builtin / "x.webp", "builtin")
        write(user / "x.webp", "user")
        write(builtin / "only.webp", "builtin-only")

        check(
            "用户层优先命中",
            layered_asset_path(builtin, user, set(), "backgrounds", "x.webp").read_text(encoding="utf-8") == "user",
        )
        check(
            "用户层缺失时回落随包层",
            layered_asset_path(builtin, user, set(), "backgrounds", "only.webp").read_text(encoding="utf-8")
            == "builtin-only",
        )
        check(
            "被隐藏的随包素材解析为 None",
            layered_asset_path(
                builtin, user, {hidden_asset_key("backgrounds", "only.webp")}, "backgrounds", "only.webp"
            )
            is None,
        )
        check("路径穿越被拒", layered_asset_path(builtin, user, set(), "backgrounds", "../x.webp") is None)
        check("空路径被拒", layered_asset_path(builtin, user, set(), "backgrounds", "") is None)


def test_svg_sanitizer() -> None:
    # 危险元素与非 SVG 命名空间元素必须被剔除，safe 内容保留。
    dirty = (
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        b'width="10" height="10" onload="alert(1)">'
        b'<defs><linearGradient id="g"/></defs>'
        b"<script>alert(1)</script>"
        b'<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
        b'<a xlink:href="javascript:alert(1)"><circle cx="1" cy="1" r="1" fill="url(#g)"/></a>'
        b'<rect width="4" height="4" style="fill: url(javascript:alert(1))"/>'
        b'<circle cx="2" cy="2" r="2" fill="url(#g)"/>'
        b"</svg>"
    )
    clean = sanitize_uploaded_svg(dirty).decode("utf-8").lower()
    check("SVG 消毒剔除 script", "<script" not in clean)
    check("SVG 消毒剔除 foreignObject", "foreignobject" not in clean)
    check("SVG 消毒剔除事件属性", "onload" not in clean)
    check("SVG 消毒剔除 javascript: 引用", "javascript:" not in clean)
    check("SVG 消毒保留安全渐变引用", "url(#g)" in clean)
    check("SVG 消毒保留普通图形", "<circle" in clean)

    expect_error(
        lambda: sanitize_uploaded_svg(b'<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>'),
        "SVG 含 DOCTYPE/ENTITY 被拒",
        400,
    )
    expect_error(
        lambda: sanitize_uploaded_svg(b'<html xmlns="http://www.w3.org/1999/xhtml"/>'),
        "根元素非 <svg> 被拒",
        400,
    )
    expect_error(lambda: sanitize_uploaded_svg(b"<svg"), "损坏的 SVG 被拒", 400)

    # 未知命名空间的前缀写法（<s:script>）不能靠文本匹配绕过。
    namespaced = (
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg">'
        b"<s:script>alert(1)</s:script></svg>"
    )
    check("带命名空间前缀的 script 被剔除", "alert(1)" not in sanitize_uploaded_svg(namespaced).decode("utf-8"))

    # 走上传入口时也必须是消毒后的字节。
    with tempfile.TemporaryDirectory() as tmp:
        user = Path(tmp) / "user"
        save_image_asset(user, _url, "bad.svg", dirty, "", "背景图")
        stored = (user / "bad.svg").read_text(encoding="utf-8").lower()
        check("上传入口写入的是消毒后的 SVG", "javascript:" not in stored and "<script" not in stored)


def test_retire_legacy_icons() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ui_root = Path(tmp) / "ui-assets"
        instance_root = Path(tmp) / "assets"
        write(ui_root / "icons" / "light_on.svg", "<svg/>")
        write(instance_root / "icons" / "camera.svg", "<svg/>")
        write(instance_root / "backgrounds" / "keep.webp", "keep")

        service = UiConfigStaticAssetService(ui_root)
        service.ensure_dirs()
        # 生产由 ``ensure_dirs`` 用环境解析出的实例根调用；测试里直接给显式根。
        service.retire_legacy_icon_assets((instance_root,))

        check("用户层 icons 目录被移走", not (ui_root / "icons").exists())
        check("实例层 icons 目录被移走", not (instance_root / "icons").exists())
        check("图标文件内容保留（改名而非删除）", (ui_root / ".icons-retired" / "light_on.svg").is_file())
        check(
            "实例层图标内容保留",
            (instance_root / ".icons-retired" / "camera.svg").is_file(),
        )
        check("backgrounds 不受影响", (instance_root / "backgrounds" / "keep.webp").is_file())
        check("背景图目录已就绪", (ui_root / "backgrounds").is_dir())

        # 幂等：再跑一次不报错、不产生第二份退役目录。
        service.ensure_dirs()
        retired = [path.name for path in ui_root.iterdir() if path.name.startswith(".icons-retired")]
        check("重复执行为幂等", retired == [".icons-retired"], str(retired))

        # 符号链接不能顺着改到根目录之外。
        outside = Path(tmp) / "outside"
        outside.mkdir()
        link_root = Path(tmp) / "link-root"
        link_root.mkdir()
        (link_root / "icons").symlink_to(outside, target_is_directory=True)
        service.retire_legacy_icon_assets((link_root,))
        check("符号链接被跳过", (link_root / "icons").exists() and outside.is_dir())


def main() -> int:
    test_save_and_list()
    test_hidden_markers()
    test_layered_resolution()
    test_svg_sanitizer()
    test_retire_legacy_icons()
    report("UI 素材")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
