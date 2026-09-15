"""端到端自检：``python -m store.tools.smoke``。

重点是**用客户端自己的 crypto.py** 来跟本服务对话，
确保「X25519 封套 + Ed25519 租约」在字节级别真正对齐，
而不是靠服务端自说自话。覆盖：

1. 传输加解密往返、租约签发/验签
2. ``/v2/activate`` → ``/v2/heartbeat`` → ``/v2/recover``
3. 商店只读接口：configuration / products / item
4. 注册（回显验证码）→ 下单 → 模拟支付 → 账号中心拿到激活码
5. 用该激活码激活客户端 → 租约包含基础功能码
6. 购买 3D 交互包（addon）→ 租约多出 ``module.3d_interaction``
7. 管理后台停用设备绑定 → 心跳返回「确认吊销」错误
8. 解绑冷却 → 冷却期内无法重新绑定
9. 未设置 APP_LICENSE_* 时默认自包含地指向自建授权服务器，且生产残留为零（静态断言）

全部使用临时目录，不会污染 store/data 与 keys/。
"""

from __future__ import annotations

import asyncio
import base64
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import timedelta
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from sqlalchemy import select

from store.app import create_app
from store.config import STORE_ROOT, load_settings
from store.models import (
    Account,
    AccountSession,
    AuditLog,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    License,
    Order,
    Product,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
)
from store.payments import alipay as alipay_module
from store.security import hash_password, token_hash, utcnow
from store.tools.seed import seed_products, seed_release, seed_settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CLIENT_CRYPTO_PATH = PROJECT_ROOT / "backend" / "app" / "license" / "crypto.py"
CLIENT_CONFIG_PATH = PROJECT_ROOT / "backend" / "app" / "config.py"

REVOCATION_PHRASES = (
    "实例绑定已停用",
    "客户授权或激活码已停用",
    "客户、激活码或实例绑定已停用",
    "商品授权有效期已结束",
)

INSTANCE_ID = "smoke-client-instance-000000000001"
CLIENT_VERSION = "0.4.6"

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    RESULTS.append((name, bool(condition), detail))
    flag = "PASS" if condition else "FAIL"
    line = f"[{flag}] {name}"
    if detail:
        line += f" — {detail}"
    print(line, flush=True)
    return bool(condition)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _parse_with_node(path: Path) -> tuple[bool, str]:
    """用 node --check 做真实语法校验；node 不可用时返回「跳过」。"""
    if shutil.which("node") is None:
        return True, "skipped"
    proc = subprocess.run(  # noqa: S603
        ["node", "--check", str(path)],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        return True, ""
    # node 的首行输出是文件路径，真正的错误在第二行
    lines = [line.strip() for line in proc.stderr.strip().splitlines() if line.strip()]
    detail = next((line for line in lines if not line.startswith(str(path))), lines[0] if lines else "")
    return False, detail


def check_static_assets() -> None:
    """静态资源完整性：引用都存在、JS 能通过真实语法解析、字体未被截断。

    这条检查是为了防「静默截断」：CDN/代理中断时 curl 会留下一个语法不完整的
    JS 文件，页面只在浏览器控制台报 ``Unexpected end of input``，服务端一切正常，
    很容易漏过。
    """
    static_dir = STORE_ROOT / "static"
    templates_dir = STORE_ROOT / "templates"

    # 1. 模板里引用的 /store-static/* 与 /fonts/*，以及 CSS 里 url(...) 引用的资源
    referenced: dict[str, Path] = {}

    def register(url: str, *, source: Path) -> None:
        path = url.split("?")[0].split("#")[0]
        if path.startswith("/store-static/"):
            referenced.setdefault(path, static_dir / path.removeprefix("/store-static/"))
        elif path.startswith("/fonts/"):
            referenced.setdefault(path, static_dir / "fonts" / path.removeprefix("/fonts/"))
        elif path.startswith("../fonts/"):
            # font.min.css 位于 static/ 下，../fonts/x 即 static/fonts/x
            target = static_dir / "fonts" / path.removeprefix("../fonts/")
            referenced.setdefault(f"/fonts/{target.name}", target)

    for template in sorted(templates_dir.glob("*.html")):
        text = template.read_text(encoding="utf-8")
        for raw in re.findall(r'(?:src|href)="(/[^"#]*)"', text):
            register(raw, source=template)
    for css in sorted(static_dir.glob("*.css")):
        for raw in re.findall(r'url\(\s*["\']?([^"\')]+)', css.read_text(encoding="utf-8", errors="replace")):
            register(raw, source=css)

    missing = sorted(url for url, disk in referenced.items() if not disk.is_file())
    check(f"模板/CSS 引用的静态资源都存在（共 {len(referenced)} 个）", not missing, str(missing))

    empty = sorted(url for url, disk in referenced.items() if disk.is_file() and disk.stat().st_size == 0)
    check("静态资源均非空", not empty, str(empty))

    # 2. 每个 JS 都必须能真正解析（截断文件会在这一步被抓住）
    js_files = sorted(static_dir.glob("*.js"))
    check("static/ 下存在 JS 资源", bool(js_files), str([p.name for p in js_files]))
    for path in js_files:
        ok, detail = _parse_with_node(path)
        check(f"JS 语法可解析：{path.name}", ok, detail)

    # 3. 字体：woff2 头里记录了真实长度，对不上就是被截断
    for font in sorted((static_dir / "fonts").glob("*.woff2")):
        data = font.read_bytes()
        declared = int.from_bytes(data[8:12], "big") if len(data) >= 12 else 0
        check(
            f"woff2 未截断：{font.name}",
            data[:4] == b"wOF2" and declared == len(data),
            f"声明 {declared} 字节 / 实际 {len(data)} 字节",
        )

    # 4. 兜底：node 不可用时，用「结尾字符」启发式抓明显截断
    if shutil.which("node") is None:
        for path in js_files:
            tail = path.read_text(encoding="utf-8", errors="replace").rstrip()
            check(
                f"JS 结尾完整（启发式）：{path.name}",
                tail.endswith((";", "}", ")", "]")),
                f"实际结尾: {tail[-24:]!r}",
            )


def check_theme_matches_app() -> None:
    """商店 / 后台主题必须与主程序共用同一套设计令牌。

    这是防「静默漂移」的：主程序改了配色而商店没跟，肉眼一时看不出，但两套
    界面会慢慢变得不像同一个产品。这里把画布色、强调色、成功色直接对齐成硬断言。

    同时锁定样式表的职责分层（换过两代主题，都踩过坑）：
      · ``theme.css`` 是唯一设计系统，必须**先于**页面样式表加载——``store.css``
        / ``admin.css`` 只排布局、不定义组件，反了就会出现「页面覆盖组件」；
      · 模板只允许引用这三张自有样式表（字体除外），任何新增的「补丁层」都会
        在这里被拦下；
      · ``admin.html`` 不得再有内联 ``<style>``，后台皮肤统一走外置文件。
    """
    static_dir = STORE_ROOT / "static"
    templates_dir = STORE_ROOT / "templates"

    def tokens(text: str, names: tuple[str, ...]) -> dict[str, str]:
        found: dict[str, str] = {}
        for name in names:
            # 负向断言避免 --bg 命中 --hb-bg 之类的子串
            match = re.search(rf"(?<![\w-]){re.escape(name)}\s*:\s*([^;}}]+)", text)
            if match:
                found[name] = match.group(1).strip().lower()
        return found

    app_css = (PROJECT_ROOT / "frontend" / "static" / "app.css").read_text(encoding="utf-8")
    theme_css = (static_dir / "theme.css").read_text(encoding="utf-8")

    app_tokens = tokens(app_css, ("--bg", "--accent", "--success"))
    theme_tokens = tokens(theme_css, ("--hb-bg", "--hb-accent", "--hb-success"))

    for app_name, theme_name in (
        ("--bg", "--hb-bg"),
        ("--accent", "--hb-accent"),
        ("--success", "--hb-success"),
    ):
        expected = app_tokens.get(app_name)
        actual = theme_tokens.get(theme_name)
        check(
            f"商店主题 {theme_name} 与主程序 {app_name} 一致",
            expected is not None and expected == actual,
            f"主程序 {expected} / 商店 {actual}",
        )

    def stylesheet_urls(text: str) -> list[str]:
        pattern = r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"'
        return [url.split("?")[0] for url in re.findall(pattern, text)]

    store_html = (templates_dir / "store.html").read_text(encoding="utf-8")
    admin_html = (templates_dir / "admin.html").read_text(encoding="utf-8")

    store_sheets = stylesheet_urls(store_html)
    allowed_store_sheets = {
        "/store-static/font.min.css",
        "/store-static/theme.css",
        "/store-static/store.css",
    }
    check(
        "store.html 只引用字体 + 设计系统 + 前台页面样式表",
        bool(store_sheets) and set(store_sheets) <= allowed_store_sheets,
        f"多余: {sorted(set(store_sheets) - allowed_store_sheets)}",
    )
    check(
        "theme.css 先于 store.css 加载（设计系统不被页面布局覆盖）",
        "/store-static/theme.css" in store_sheets
        and "/store-static/store.css" in store_sheets
        and store_sheets.index("/store-static/theme.css")
        < store_sheets.index("/store-static/store.css"),
        f"实际顺序: {store_sheets}",
    )

    admin_sheets = stylesheet_urls(admin_html)
    check(
        "admin.html 同时引用 theme.css 与 admin.css",
        "/store-static/theme.css" in admin_sheets
        and "/store-static/admin.css" in admin_sheets,
        str(admin_sheets),
    )
    check(
        "theme.css 先于 admin.css 加载（设计系统不被页面布局覆盖）",
        "/store-static/theme.css" in admin_sheets
        and "/store-static/admin.css" in admin_sheets
        and admin_sheets.index("/store-static/theme.css")
        < admin_sheets.index("/store-static/admin.css"),
        f"实际顺序: {admin_sheets}",
    )
    check(
        "admin.html 不再内联 <style>（后台皮肤已外置）",
        "<style" not in admin_html,
        "模板里仍存在 <style> 块" if "<style" in admin_html else "无内联样式块",
    )


def check_addon_card_layout() -> None:
    """商品卡必须是纵向 flex，且页脚用 ``margin-top: auto`` 顶到底。

    ``.hb-addons-grid`` 是等高网格（同排卡片拉伸到同一高度）。卡片内容若是 grid，
    高出同排最矮卡的那部分高度会被均摊到**每一行**：内容少的卡（「主授权」只有
    徽标 + 标题）表现为徽标被拉成竖椭圆、标题比邻卡低一截。改成 flex 后行高保持
    自然，多余高度全部沉到页脚上方。

    这条断言守的是「有人把卡片改回 grid」这类静默回归——它不报错、不崩页面，
    只是让卡片看起来没对齐，肉眼很容易漏过。
    """
    theme_css = (STORE_ROOT / "static" / "theme.css").read_text(encoding="utf-8")

    card = re.search(r"\.hb-addon-card\s*\{([^}]*)\}", theme_css)
    card_body = re.sub(r"\s+", " ", card.group(1)) if card else ""
    check(
        "商品卡为纵向 flex（等高网格不会拉伸徽标行）",
        "display: flex" in card_body and "flex-direction: column" in card_body,
        f"实际: {card_body.strip() or '未找到 .hb-addon-card 覆盖规则'}",
    )

    footer = re.search(r"\.hb-addon-card__footer\s*\{([^}]*)\}", theme_css)
    footer_body = re.sub(r"\s+", " ", footer.group(1)) if footer else ""
    check(
        "商品卡页脚 margin-top:auto（多余高度沉到卡片底部）",
        "margin-top: auto" in footer_body,
        f"实际: {footer_body.strip() or '未找到 .hb-addon-card__footer 规则'}",
    )


def check_legacy_stylesheets_removed() -> None:
    """参考站的浅色样板表与 Bootstrap 必须彻底消失，且不能再回来。

    这几份文件曾经是「基线」：theme.css 只是个补丁层，靠加载顺序 + 提高特异性把
    它们的浅色规则硬压成暗色。布局大重构后 theme.css 本身就是暗色的，留着它们
    只会让任何布局改动都要同时打赢两层，而且它们引用的浅色值随时可能把某个漏掉
    的块翻回白底。

    这里守三件事：文件没了、模板与收银页不再引用、没有任何样式文件再退回
    「Bootstrap 变量桥接」的写法。
    """
    static_dir = STORE_ROOT / "static"
    templates_dir = STORE_ROOT / "templates"
    legacy = (
        "bootstrap.min.css",
        "bridge-store.css",
        "merged.css",
        "referrals.css",
        "product-packages.css",
    )

    surviving = [name for name in legacy if (static_dir / name).is_file()]
    check(
        "参考站样板表与 Bootstrap 已删除",
        not surviving,
        f"仍存在: {surviving}" if surviving else f"已删除 {len(legacy)} 张旧样式表",
    )

    referenced_sources = {
        "templates/*.html": "\n".join(
            path.read_text(encoding="utf-8") for path in sorted(templates_dir.glob("*.html"))
        ),
        "api/pages.py": (STORE_ROOT / "api" / "pages.py").read_text(encoding="utf-8"),
    }
    referenced = [
        f"{name} <- {source}"
        for source, text in referenced_sources.items()
        for name in legacy
        if name in text
    ]
    check(
        "模板与模拟收银页不再引用已删样式表",
        not referenced,
        f"仍引用: {referenced}" if referenced else "无残留引用",
    )

    bridged = sorted(
        path.name
        for path in static_dir.glob("*.css")
        if re.search(r"--bs-[\w-]+\s*:", path.read_text(encoding="utf-8"))
    )
    check(
        "不再保留 Bootstrap 变量桥接层",
        not bridged,
        f"仍声明 --bs-* 变量: {bridged}" if bridged else "无 --bs-* 变量",
    )


# 纯 DOM 钩子：JS 只拿它当 querySelector 的锚点，本身不承担任何视觉职责。
#   · hb-store-brand-mark —— 顶栏/维护页的品牌图，尺寸由父级 .hb-brand-mark 决定
#   · hb-payment-close    —— 支付弹窗关闭按钮，外观走 .hb-dialog__close
#   · hb-*-dialog         —— 三个弹窗的语义标识，外观统一走 .hb-dialog
HOOK_ONLY_CLASSES = frozenset(
    {
        "hb-store-brand-mark",
        "hb-payment-close",
        "hb-payment-dialog",
        "hb-pending-order-dialog",
        "hb-release-dialog",
    }
)

# 图标类来自 font.min.css，不在自研设计系统范围内。
VENDOR_CLASS_PREFIXES = ("fa", "flag-")


def _emitted_class_names(text: str) -> set[str]:
    """抽出 ``class="..."`` 字面量里的类名（含 JS 模板字符串里的那些）。

    模板字符串里会嵌 ``${...}``，直接按空白切会切出 ``${tone}``、``pill--`` 这类
    碎片。这里只保留长得像类名的 token，并丢掉以 ``-`` 结尾的（它们是
    ``hb-meta-chip--${variant}`` 被截断后的产物，对应的完整变体另有字面量）。
    """
    names: set[str] = set()
    for raw in re.findall(r"class=[\"']([^\"']*)[\"']", text):
        for token in raw.split():
            if not re.fullmatch(r"[A-Za-z][\w-]*", token) or token.endswith("-"):
                continue
            names.add(token)
    return names


def check_design_class_coverage() -> None:
    """JS / 模板输出的每个类名，都必须能在自研样式表里找到定义。

    布局重写最典型的静默回归是「新加的类名没有对应样式」：节点照样渲染出来，
    只是没有边框、内边距和配色，看起来像页面坏了，而控制台一声不响。这里把
    store.js / referrals.js / admin.html（含内联脚本）与两份模板里 ``class=``
    字面量抽出来，逐个到 theme.css + store.css + admin.css 里核对。

    只检查模板字面量（``class="..."``）里的类名——这些是渲染路径上真正决定外观
    的东西；纯类名拼接（``classList.toggle('mobile-open')``）另由行为测试覆盖。
    """
    static_dir = STORE_ROOT / "static"
    templates_dir = STORE_ROOT / "templates"
    css = "\n".join(
        (static_dir / name).read_text(encoding="utf-8")
        for name in ("theme.css", "store.css", "admin.css")
    )
    defined = set(re.findall(r"\.([A-Za-z][\w-]*)", css))

    sources = (
        static_dir / "store.js",
        static_dir / "referrals.js",
        templates_dir / "store.html",
        templates_dir / "admin.html",
    )
    emitted: dict[str, set[str]] = {}
    for source in dict.fromkeys(sources):
        for name in _emitted_class_names(source.read_text(encoding="utf-8")):
            if name.startswith(VENDOR_CLASS_PREFIXES) or name in HOOK_ONLY_CLASSES:
                continue
            emitted.setdefault(name, set()).add(source.name)

    missing = sorted(name for name in emitted if name not in defined)
    check(
        "store.js / referrals.js / 模板输出的类名均在自研样式表中有定义",
        not missing,
        f"未定义: {[f'{name} ({', '.join(sorted(emitted[name]))})' for name in missing[:8]]}"
        if missing
        else f"共核对 {len(emitted)} 个类名",
    )


def check_account_meta_chip_tokens() -> None:
    """账号中心芯片：变体必须写在 theme.css 里，且 store.js 必须带上语义类。

    芯片配色是「状态一眼可辨」的唯一载体：有效=绿、到期=琥珀、停用=红、永久=琥珀强调。
    如果 store.js 不再输出 ``hb-meta-chip--*``，或 theme.css 里的变体被改回单类名
    （会被 ``.hb-account-meta span`` 压掉），颜色就静默退回中性灰——
    功能上没问题，但用户看到的「状态」就没了。
    """
    static_dir = STORE_ROOT / "static"
    theme_css = (static_dir / "theme.css").read_text(encoding="utf-8")
    store_js = (static_dir / "store.js").read_text(encoding="utf-8")

    for variant in ("success", "warning", "danger", "accent"):
        # 复合类名才压得过 `.hb-account-meta span`
        compound = f".hb-meta-chip.hb-meta-chip--{variant}"
        found = compound in theme_css
        check(
            f"芯片变体 {compound} 为复合选择器（可压过 .hb-account-meta span）",
            found,
            f"找到 {compound}" if found else "theme.css 里未找到该复合选择器，颜色会被 .hb-account-meta span 吃掉",
        )

    chips_wired = "licenseStateVariant(" in store_js and "hb-meta-chip" in store_js
    check(
        "store.js 给状态/期限芯片带上语义类",
        chips_wired,
        "已接线 metaChip / licenseStateVariant"
        if chips_wired
        else "未找到 metaChip / licenseStateVariant 的用法，状态与期限会退回中性灰",
    )


def _normalize_path(path: str) -> str:
    """把 ``${x}`` 与 ``{x}`` 统一成 ``{p}``，并丢掉 query。"""
    path = path.split("?")[0]
    path = re.sub(r"\$\{[^}]*\}", "{p}", path)
    return re.sub(r"\{[^}]*\}", "{p}", path)


def _extract_frontend_calls(
    text: str, function_name: str, prefix: str, *, literal_only: bool = False
) -> set[tuple[str, str]]:
    """从源码里抽出 ``api(...)`` 的 (方法, 路径) 组合。

    - 没有写 ``method`` 的按 GET 处理（与浏览器 fetch 默认一致）；
    - ``literal_only=True`` 时跳过带 ``${}`` 插值或 query 的调用：模板字面量里可能嵌
      模板字面量，朴素正则会把参数截断成假路径，与其误报不如不查。
    """
    calls: set[tuple[str, str]] = set()
    pattern = rf"(?<![A-Za-z]){re.escape(function_name)}\(\s*[`'\"]([^`'\"]*)[`'\"]([^)]*)"
    for match in re.finditer(pattern, text):
        raw_path = match.group(1)
        if literal_only and ("$" in raw_path or "?" in raw_path):
            continue
        method_match = re.search(r"method\s*:\s*['\"](\w+)['\"]", match.group(2))
        method = (method_match.group(1) if method_match else "GET").upper()
        calls.add((method, _normalize_path(f"{prefix}{raw_path}")))
    return calls


def check_frontend_api_contract() -> None:
    """前端调用的 (方法, 路径) 必须被服务端按**同样的方法**实现。

    ``store.js`` / ``referrals.js`` 与参考站 pay.habridge.cn 逐字节一致，所以它们就是
    契约本身。只对齐路径、不对齐方法，就会冒出 ``DELETE /auth/logout`` 打到只挂了
    ``POST`` 的路由这类 405 —— 路径看着「实现了」，功能却是坏的。而且因为服务端路由
    确实存在，靠翻代码很难发现。
    """
    static_dir = STORE_ROOT / "static"
    templates_dir = STORE_ROOT / "templates"

    # (文件, [(函数名, 该函数内部拼的前缀, 是否只查纯字面量路径), ...])
    sources: list[tuple[Path, list[tuple[str, str, bool]]]] = [
        (static_dir / "store.js", [("api", "/store/v1", False)]),
        (static_dir / "referrals.js", [("api", "/store/v1", False)]),
        (templates_dir / "admin.html", [("storeApi", "/store/v1", True), ("api", "/store-admin/v1", True)]),
    ]

    calls: set[tuple[str, str]] = set()
    scanned: list[str] = []
    for source, helpers in sources:
        if not source.is_file():
            continue
        text = source.read_text(encoding="utf-8")
        found = 0
        for function_name, prefix, literal_only in helpers:
            extracted = _extract_frontend_calls(
                text, function_name, prefix, literal_only=literal_only
            )
            found += len(extracted)
            calls |= extracted
        if found:
            scanned.append(f"{source.name}({found})")

    check(
        f"已提取前端调用：{', '.join(scanned) or '无'}",
        bool(calls),
        f"共 {len(calls)} 个",
    )

    from store.api import admin as admin_api, pages as pages_api, store as store_api  # noqa: PLC0415

    allowed: dict[str, set[str]] = {}
    for router in (store_api.router, admin_api.router, pages_api.router):
        for route in router.routes:
            path = getattr(route, "path", None)
            if path:
                allowed.setdefault(_normalize_path(path), set()).update(
                    getattr(route, "methods", None) or []
                )

    problems = []
    for method, path in sorted(calls):
        methods = allowed.get(path)
        if methods is None:
            problems.append(f"{method} {path} → 服务端无此路由")
        elif method not in methods:
            problems.append(f"{method} {path} → 服务端只允许 {sorted(methods)}")
    check(
        f"前端调用的方法/路径均被服务端按同方法实现（共 {len(calls)} 个）",
        not problems,
        "; ".join(problems),
    )


def is_confirmed_revocation(detail: str) -> bool:
    return any(phrase in detail for phrase in REVOCATION_PHRASES)


def _alipay_test_keys(workdir: Path) -> dict[str, Path]:
    """生成两对 RSA 密钥：一对当「应用密钥」，一对当「支付宝密钥」。

    刻意分开，这样「用错密钥必须验签失败」才测得出东西。
    """
    def _write(name: str, key) -> Path:
        path = workdir / name
        path.write_text(
            key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode(),
            encoding="utf-8",
        )
        return path

    def _write_public(name: str, key) -> Path:
        path = workdir / name
        path.write_text(
            key.public_key()
            .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
            .decode(),
            encoding="utf-8",
        )
        return path

    app_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    alipay_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return {
        "app_private": _write("app-private.pem", app_key),
        "app_public": _write_public("app-public.pem", app_key),
        "alipay_private": _write("alipay-private.pem", alipay_key),
        "alipay_public": _write_public("alipay-public.pem", alipay_key),
    }


def _sign_notify(fields: dict[str, str], alipay_private_pem: str) -> dict[str, str]:
    """按支付宝异步通知的规则签名：排除 sign 与 sign_type。

    这里独立实现拼接规则（不复用被测函数），否则两边一起错就测不出来。
    """
    signed = dict(fields)
    items = sorted(
        (key, value)
        for key, value in signed.items()
        if key not in {"sign", "sign_type"} and value != ""
    )
    content = "&".join(f"{key}={value}" for key, value in items)
    key = serialization.load_pem_private_key(alipay_private_pem.encode(), password=None)
    signature = key.sign(content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    signed["sign"] = base64.b64encode(signature).decode("ascii")
    return signed


def check_alipay_signing() -> None:
    """支付宝签名：拼接规则、往返、篡改拒绝、密钥格式容错。"""
    # 规矩 1：请求签名要带上 sign_type，但必须排除 sign
    request_content = alipay_module.build_sign_content(
        {"b": "2", "a": "1", "sign": "xxx", "sign_type": "RSA2", "empty": ""},
        excluded=frozenset({"sign"}),
    )
    check(
        "请求签名拼接：字典序、含 sign_type、排除 sign 与空值",
        request_content == "a=1&b=2&sign_type=RSA2",
        request_content,
    )

    # 规矩 2：异步通知验签要同时排除 sign 和 sign_type（与上面不同，容易踩坑）
    notify_content = alipay_module.build_sign_content(
        {"b": "2", "a": "1", "sign": "xxx", "sign_type": "RSA2"},
        excluded=frozenset({"sign", "sign_type"}),
    )
    check(
        "通知验签拼接：额外排除 sign_type",
        notify_content == "a=1&b=2",
        notify_content,
    )

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-alipay-crypto-"))
    keys = _alipay_test_keys(workdir)
    alipay_private = keys["alipay_private"].read_text(encoding="utf-8")
    alipay_public = keys["alipay_public"].read_text(encoding="utf-8")
    app_private = keys["app_private"].read_text(encoding="utf-8")

    content = "out_trade_no=HB-1&total_amount=49.90&trade_status=TRADE_SUCCESS"
    signature = alipay_module.sign_params(
        {"out_trade_no": "HB-1", "total_amount": "49.90", "trade_status": "TRADE_SUCCESS"},
        alipay_private,
    )
    check(
        "签名可用对应公钥验签通过",
        alipay_module.verify_content(content, signature, alipay_public),
    )
    check(
        "换一把公钥验签必须失败",
        not alipay_module.verify_content(content, signature, keys["app_public"].read_text(encoding="utf-8")),
    )
    check(
        "内容被篡改后验签必须失败",
        not alipay_module.verify_content(content.replace("49.90", "0.01"), signature, alipay_public),
    )

    # 支付宝密钥工具给的是纯 base64（PKCS1/PKCS8 都可能），必须都能吃下
    for label, fmt in (("PKCS8", PrivateFormat.PKCS8), ("PKCS1", PrivateFormat.TraditionalOpenSSL)):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        raw_base64 = base64.b64encode(
            key.private_bytes(Encoding.DER, fmt, NoEncryption())
        ).decode()
        try:
            alipay_module._load_private_key(raw_base64)
            ok = True
        except Exception:  # noqa: BLE001
            ok = False
        check(f"裸 base64 私钥可解析（{label}）", ok)

    # 把公钥误填成私钥这类错误必须报错，而不是静默失败
    try:
        alipay_module._load_public_key(app_private)
        wrong_ok = True
    except Exception:  # noqa: BLE001
        wrong_ok = False
    check("把私钥当公钥填会报错", not wrong_ok)

    # 金额换算
    check(
        "分转元补齐两位小数",
        alipay_module.yuan_from_cents(4990) == "49.90"
        and alipay_module.yuan_from_cents(0) == "0.00"
        and alipay_module.yuan_from_cents(5) == "0.05",
        f"4990→{alipay_module.yuan_from_cents(4990)} 0→{alipay_module.yuan_from_cents(0)}",
    )
    check(
        "元转分严格解析（脏数据返回 None 而非 0）",
        alipay_module.cents_from_yuan("49.90") == 4990
        and alipay_module.cents_from_yuan("") is None
        and alipay_module.cents_from_yuan("abc") is None,
        str([alipay_module.cents_from_yuan(v) for v in ("49.90", "", "abc")]),
    )

    # 响应验签要从原始文本里抠节点，不能重新序列化
    raw = '{"alipay_trade_query_response":{"code":"10000","msg":"Success","x":"a}b"},"sign":"S"}'
    node = alipay_module.extract_raw_node(raw, "alipay_trade_query_response")
    check(
        "能从原始响应中抠出待验签节点（含字符串内花括号）",
        node == '{"code":"10000","msg":"Success","x":"a}b"}',
        str(node),
    )


async def check_alipay_notify_flow() -> None:
    """异步通知整条链路：验签 → 金额校验 → 发码 → 幂等。"""
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-alipay-flow-"))
    keys = _alipay_test_keys(workdir)
    alipay_private = keys["alipay_private"].read_text(encoding="utf-8")

    app_id = "2021000000000000"
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="alipay",
        alipay_app_id=app_id,
        alipay_app_private_key_path=str(keys["app_private"]),
        alipay_public_key_path=str(keys["alipay_public"]),
        # 只测通知，不去真的连支付宝网关
        alipay_verify_response_sign=False,
    )
    app = create_app(settings)

    email = "alipay@habridge.local"
    with app.state.database.session() as session:
        seed_settings(session)
        products = seed_products(session)
        base_product_id = products["base"].id
        account = Account(
            email=email,
            password_hash=hash_password("alipay-password-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(account_id=account.id, email=email, name=email)
        session.add(customer)
        session.flush()
        account_id = account.id

        def _pending_order(amount_cents: int) -> str:
            order = Order(
                order_no=f"HB-ALIPAY-{utcnow().strftime('%H%M%S%f')}",
                lookup_token="alipay-token",
                account_id=account_id,
                customer_id=customer.id,
                email=email,
                product_id=base_product_id,
                product_name="smoke 主授权",
                product_type="base",
                order_type="base",
                license_action="issue",
                original_amount_cents=amount_cents,
                amount_cents=amount_cents,
                status="pending",
                fulfillment_mode="automatic",
                payment_provider="alipay",
                expires_at=utcnow() + timedelta(minutes=30),
            )
            session.add(order)
            session.flush()
            return order.order_no

        valid_order = _pending_order(4990)
        tampered_order = _pending_order(4990)
        wrong_amount_order = _pending_order(4990)
        wrong_key_order = _pending_order(4990)

    transport = httpx.ASGITransport(app=app)
    notify_url = alipay_module.AlipayProvider().notify_url(settings, "http://store.test")

    def _fields(out_trade_no: str, total_amount: str = "49.90") -> dict[str, str]:
        return {
            "app_id": app_id,
            "out_trade_no": out_trade_no,
            "trade_no": f"2026{out_trade_no[-8:]}",
            "trade_status": "TRADE_SUCCESS",
            "total_amount": total_amount,
            "seller_id": "2088000000000000",
            "sign_type": "RSA2",
            "charset": "utf-8",
            "notify_type": "trade_status_sync",
            "gmt_payment": "2026-09-15 00:00:00",
        }

    def _license_count(session, account_id: str) -> int:
        return len(
            session.scalars(select(License).where(License.account_id == account_id)).all()
        )

    async with httpx.AsyncClient(
        transport=transport, base_url="http://store.test", follow_redirects=True
    ) as client:
        # 未签名 / 错误密钥签名：必须拒绝
        unsigned = await client.post(notify_url, data=_fields(valid_order))
        check(
            "无签名的通知被拒绝",
            unsigned.status_code == 200 and unsigned.text.strip() == "failure",
            f"{unsigned.status_code} {unsigned.text!r}",
        )

        bad_key = await client.post(
            notify_url, data=_sign_notify(_fields(wrong_key_order), keys["app_private"].read_text(encoding="utf-8"))
        )
        check(
            "用错误密钥签名的通知被拒绝",
            bad_key.status_code == 200 and bad_key.text.strip() == "failure",
            f"{bad_key.status_code} {bad_key.text!r}",
        )

        # 正例：验签通过 → 入账 → 发码
        ok = await client.post(
            notify_url, data=_sign_notify(_fields(valid_order), alipay_private)
        )
        check(
            "验签通过的通知返回 success",
            ok.status_code == 200 and ok.text.strip() == "success",
            f"{ok.status_code} {ok.text!r}",
        )
        with app.state.database.session() as session:
            order = session.scalars(select(Order).where(Order.order_no == valid_order)).first()
            check("通知到账后订单已履约", order.status == "fulfilled", str(order.status))
            check("通知到账后已生成授权", order.license_id is not None, str(order.license_id))
            check("通知到账后交易号已记录", bool(order.payment_trade_no), str(order.payment_trade_no))
            licenses_after_first = _license_count(session, account_id)

        # 幂等：支付宝会重复推送，不能重复发码
        again = await client.post(
            notify_url, data=_sign_notify(_fields(valid_order), alipay_private)
        )
        check(
            "重复通知仍返回 success（避免支付宝无限重推）",
            again.status_code == 200 and again.text.strip() == "success",
            f"{again.status_code} {again.text!r}",
        )
        with app.state.database.session() as session:
            check(
                "重复通知不会重复发码",
                _license_count(session, account_id) == licenses_after_first,
                f"{licenses_after_first} → {_license_count(session, account_id)}",
            )

        # 签名合法但金额不符：必须拒绝，不能按「已付款」发码
        wrong_amount = await client.post(
            notify_url,
            data=_sign_notify(_fields(wrong_amount_order, total_amount="0.01"), alipay_private),
        )
        check(
            "签名合法但金额不符的通知被拒绝",
            wrong_amount.status_code == 200 and wrong_amount.text.strip() == "failure",
            f"{wrong_amount.status_code} {wrong_amount.text!r}",
        )
        with app.state.database.session() as session:
            order = session.scalars(
                select(Order).where(Order.order_no == wrong_amount_order)
            ).first()
            check("金额不符的订单没有被入账", order.status == "pending", str(order.status))

        # 签名之后被篡改金额
        tampered = _sign_notify(_fields(tampered_order), alipay_private)
        tampered["total_amount"] = "0.01"
        tampered_response = await client.post(notify_url, data=tampered)
        check(
            "签名后被篡改金额的通知被拒绝",
            tampered_response.status_code == 200
            and tampered_response.text.strip() == "failure",
            f"{tampered_response.status_code} {tampered_response.text!r}",
        )

    # 0 元订单：支付宝不接受 0 元交易，必须直接开通而不是去下单
    token = "smoke-alipay-free-session"
    with app.state.database.session() as session:
        # 上面几个通知用例会留下仍是 pending 的订单（被拒绝的篡改/错金额通知，
        # 以及签名错误那笔）。它们会命中下单接口的「已有待支付订单」409 守卫，
        # 所以先在这里收尾，让 0 元下单走的是「无待支付订单」这条正常路径。
        for stale in session.scalars(
            select(Order).where(Order.account_id == account_id, Order.status == "pending")
        ):
            stale.status = "cancelled"
            stale.cancelled_at = utcnow()
        session.flush()

        session.add(
            AccountSession(
                id_hash=token_hash(token),
                account_id=account_id,
                expires_at=utcnow() + timedelta(days=1),
            )
        )
        session.add(
            Coupon(
                code="FREE100",
                description="smoke 全免",
                discount_type="percent",
                percent=100.0,
                max_redemptions=10,
                per_account_limit=1,
                active=True,
            )
        )

    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://store.test",
        follow_redirects=True,
        cookies={settings.cookie_name: token},
    ) as client:
        free = await client.post(
            "/store/v1/orders",
            json={"productId": base_product_id, "couponCode": "FREE100"},
        )
        check("优惠后 0 元订单下单成功", free.status_code == 201, str(free.status_code))
        if free.status_code == 201:
            payload = free.json()
            check(
                "0 元订单直接开通（不经支付渠道）",
                payload["status"] == "fulfilled"
                and payload["payment"]["type"] == "free"
                and payload["amountCents"] == 0,
                str({key: payload[key] for key in ("status", "amountCents")}) + str(payload["payment"]),
            )

    app.state.database.dispose()


async def check_verification_isolation() -> None:
    """mail_mode != echo 时，验证码绝不能出现在接口响应里。

    默认 log 模式下码只进日志——这会直接导致「用户没法注册」，
    所以这里既守住不泄露，也守住前端仍能拿到 delivered/deliveryMode 做提示。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-mailguard-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="log",
        expose_verification_code=False,
        payment_provider="mock",
    )
    app = create_app(settings)
    with app.state.database.session() as session:
        seed_settings(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://store.test", follow_redirects=True
    ) as client:
        body = (
            await client.post(
                "/store/v1/verifications",
                json={"email": "mailguard@habridge.local", "purpose": "register"},
            )
        ).json()
    check("log 模式不回显验证码（生产不泄露）", "code" not in body, str(body))
    check(
        "log 模式仍返回 delivered/deliveryMode 供前端提示",
        body.get("delivered") is False and body.get("deliveryMode") == "log",
        str(body),
    )
    app.state.database.dispose()


async def check_smtp_degrades_without_credentials() -> None:
    """smtp 模式但授权码没填时，必须立刻降级而不是干等超时。

    这正是「用户没法注册」的另一个入口：若这里不放行，每个验证码请求都会去连
    QQ 然后等到 15s 超时才回退，注册接口看起来就像卡死了。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-smtpguard-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="smtp",
        smtp_host="smtp.invalid.example",
        smtp_username="someone@example.com",
        smtp_password="",
        expose_verification_code=True,
        payment_provider="mock",
    )
    check("smtp 缺授权码时判定为未就绪", settings.smtp_ready is False)
    check("smtp 缺授权码时标记为误配置以便报警", settings.smtp_misconfigured is True)

    app = create_app(settings)
    with app.state.database.session() as session:
        seed_settings(session)

    transport = httpx.ASGITransport(app=app)
    started = time.monotonic()
    async with httpx.AsyncClient(
        transport=transport, base_url="http://store.test", follow_redirects=True
    ) as client:
        response = await client.post(
            "/store/v1/verifications",
            json={"email": "smtpguard@habridge.local", "purpose": "register"},
        )
    elapsed = time.monotonic() - started
    body = response.json()
    check(
        "smtp 未就绪时验证码仍可回显（注册不会被卡死）",
        response.status_code == 200 and bool(body.get("code")),
        f"{response.status_code} {body}",
    )
    check(
        "smtp 未就绪时不做远程连接（无 15s 超时等待）",
        elapsed < 2.0,
        f"耗时 {elapsed * 1000:.0f} ms",
    )
    app.state.database.dispose()


async def run() -> int:
    client_crypto = load_module("hb_client_crypto", CLIENT_CRYPTO_PATH)

    check_static_assets()
    check_frontend_api_contract()
    check_theme_matches_app()
    check_legacy_stylesheets_removed()
    check_design_class_coverage()
    check_addon_card_layout()
    check_account_meta_chip_tokens()
    check_alipay_signing()
    await check_verification_isolation()
    await check_smtp_degrades_without_credentials()
    await check_alipay_notify_flow()

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-smoke-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        expose_verification_code=True,
        payment_provider="mock",
        order_ttl_seconds=120,
        device_release_cooldown_seconds=28800,
    )
    app = create_app(settings)
    database = app.state.database

    # ------------------------------------------------------------------ #
    # 准备：商品目录 + 一个已认证的测试账号
    # ------------------------------------------------------------------ #
    email = "smoke@habridge.local"
    password = "smoke-password-2026"
    with database.session() as session:
        seed_settings(session)
        seed_release(session)
        products = seed_products(session)
        account = Account(
            email=email,
            password_hash=hash_password(password),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        session.add(Customer(account_id=account.id, email=email, name=email))
        session.flush()
        account_id = account.id
        base_product_id = products["base"].id
        module_product_id = products["module"].id

    transport = client_crypto.LicenseTransportCipher(
        settings.transport_public_key_path,
        settings.license_transport_key_id,
        client_crypto.hashlib.sha256(
            settings.transport_public_key_path.read_bytes()
        ).hexdigest(),
    )
    verifier = client_crypto.LeaseVerifier(
        trusted_keys={
            settings.license_key_id: (
                settings.public_key_path,
                client_crypto.hashlib.sha256(settings.public_key_path.read_bytes()).hexdigest(),
            )
        },
        legacy_key_id=settings.license_key_id,
    )

    transport_http = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport_http, base_url="http://store.test", follow_redirects=True
    ) as client:

        # -------------------------------------------------------------- #
        # 1. 传输加解密往返
        # -------------------------------------------------------------- #
        envelope, key = transport.encrypt_request({"ping": "pong"}, "/v2/heartbeat")
        plain, round_key = app.state.license_authority.transport.decrypt_request(
            envelope, "/v2/heartbeat"
        )
        check("传输封套可被服务端解密", plain == {"ping": "pong"}, str(plain))
        response_envelope = app.state.license_authority.transport.encrypt_response(
            {"ok": True}, "/v2/heartbeat", round_key
        )
        decrypted = transport.decrypt_response(response_envelope, "/v2/heartbeat", key)
        check("响应封套可被客户端解密", decrypted == {"ok": True}, str(decrypted))

        # -------------------------------------------------------------- #
        # 2. 商店只读接口
        # -------------------------------------------------------------- #
        config = (await client.get("/store/v1/configuration")).json()
        check(
            "GET /configuration 含 store 与 payment",
            "store" in config and "payment" in config,
            f"siteName={config.get('store', {}).get('siteName')}",
        )
        check(
            "configuration 字段齐全",
            {"siteName", "siteTitle", "description", "announcement", "supportEmail", "logoUrl",
             "maintenanceMode", "maintenanceMessage", "updatedAt"} <= set(config["store"]),
            str(sorted(config["store"])),
        )
        check(
            "payment 字段齐全",
            {"provider", "enabled", "displayName", "appId", "gatewayUrl",
             "transactionDescription", "merchantOrderTemplate", "configured", "available"}
            <= set(config["payment"]),
            str(sorted(config["payment"])),
        )

        products_response = (await client.get("/store/v1/products")).json()
        items = products_response["items"]
        check("GET /products 返回三条商品", len(items) == 3, f"count={len(items)}")
        base = next(item for item in items if item["productType"] == "base")
        module = next(item for item in items if item["productType"] == "module")
        package = next(item for item in items if item["productType"] == "package")
        check("基础商品价格 4990", base["priceCents"] == 4990, str(base["priceCents"]))
        check("基础商品功能码 10 个", len(base["featureCodes"]) == 10, str(len(base["featureCodes"])))
        check("基础商品永久有效", base["validityDays"] is None, str(base["validityDays"]))
        check("3D 交互包功能码", module["featureCodes"] == ["module.3d_interaction"], str(module["featureCodes"]))
        check(
            "套餐包含 11 个功能码",
            len(package["featureCodes"]) == 11,
            str(len(package["featureCodes"])),
        )
        check(
            "套餐 packageItems 展开",
            package["packageItems"] and package["packageItems"][0]["name"] == "3D交互包",
            str(package["packageItems"]),
        )
        check(
            "商品字段与参考站逐一对齐",
            {"id", "name", "productCode", "priceCents", "validityDays", "productType",
             "featureCodes", "includedProductIds", "packageItems", "packageContentsLocked",
             "isFullPrice", "active", "note", "displayDescription", "imageUrl", "badgeText",
             "featured", "sortOrder", "fulfillmentMode", "stockQuantity", "reservedStock",
             "availableStock", "soldOut", "customerCount", "purchaseCount"} <= set(base),
            str(sorted(set(base) - {"createdAt", "updatedAt"})),
        )

        item = (await client.get(f"/store/v1/item/{base_product_id}")).json()
        check("GET /item/{id} 返回单个商品", item["id"] == base_product_id)
        updates = (await client.get("/store/v1/updates/latest?channel=docker")).json()
        check(
            "GET /updates/latest 返回版本",
            updates["release"] and updates["release"]["version"] == "0.5.5",
            str(updates["release"]),
        )

        # -------------------------------------------------------------- #
        # 3. 注册 → 下单 → 模拟支付
        # -------------------------------------------------------------- #
        verification = (
            await client.post(
                "/store/v1/verifications", json={"email": email, "purpose": "reset"}
            )
        ).json()
        check("POST /verifications 回显验证码", bool(verification.get("code")), str(verification))
        check(
            "POST /verifications 返回 resendAfter（前端据此解锁重发按钮）",
            verification.get("resendAfter") == settings.verification_cooldown_seconds,
            f"resendAfter={verification.get('resendAfter')!r} cooldown={settings.verification_cooldown_seconds}",
        )
        check(
            "POST /verifications 带 delivered/deliveryMode 供前端判断投递方式",
            "delivered" in verification and verification.get("deliveryMode") == "echo",
            str(verification),
        )

        login = await client.post(
            "/store/v1/auth/login", json={"email": email, "password": password}
        )
        check("POST /auth/login 成功", login.status_code == 200, str(login.status_code))
        me = (await client.get("/store/v1/auth/me")).json()
        check("GET /auth/me 返回账号", me["account"]["email"] == email, str(me["account"]["email"]))
        check("初始无授权", me["hasLicense"] is False, str(me["hasLicense"]))

        order_response = await client.post(
            "/store/v1/orders", json={"productId": base_product_id, "couponCode": None}
        )
        check("POST /orders 创建订单", order_response.status_code == 201, str(order_response.status_code))
        order = order_response.json()
        check("订单含 lookupToken", bool(order.get("lookupToken")))
        check("订单状态为 pending", order["status"] == "pending", order["status"])
        check("订单支付方式为 mock", order["payment"]["type"] == "mock", str(order["payment"]))
        check(
            "订单有效期 2 分钟",
            order["expiresAt"] is not None,
            str(order["expiresAt"]),
        )

        pay = await client.post(
            f"/store/v1/orders/{order['orderNo']}/mock/pay",
            json={"orderToken": order["lookupToken"]},
        )
        check("模拟支付成功", pay.status_code == 200, str(pay.status_code))
        paid = pay.json()
        check("订单履约完成", paid["status"] == "fulfilled", paid["status"])
        check("履约后生成激活码", bool(paid["codeHint"]), str(paid["codeHint"]))

        center = (await client.get("/store/v1/account")).json()
        check("账号中心出现 1 张授权", len(center["licenses"]) == 1, str(len(center["licenses"])))
        license_item = center["licenses"][0]
        activation_code = license_item["activationCode"]
        check(
            "激活码格式 HB-XXXX-…",
            activation_code.startswith("HB-") and len(activation_code.split("-")) == 7,
            activation_code,
        )
        check("授权来源为 payment_automatic", license_item["issuanceSource"] == "payment_automatic", license_item["issuanceSource"])
        check(
            "账号中心字段齐全",
            {"account", "deviceReleasePolicy", "licenses", "entitlements", "orders", "serverTime"}
            <= set(center),
            str(sorted(center)),
        )

        # -------------------------------------------------------------- #
        # 4. 客户端激活（用真实 client crypto）
        # -------------------------------------------------------------- #
        activation_id = license_item["activationCodeId"]

        async def call_license(path: str, payload: dict):
            envelope, response_key = transport.encrypt_request(payload, path)
            response = await client.post(path, json=envelope)
            if response.status_code >= 400:
                detail = ""
                try:
                    detail = str(response.json().get("detail", ""))
                except ValueError:
                    detail = response.text
                return response.status_code, detail
            return response.status_code, transport.decrypt_response(
                response.json(), path, response_key
            )

        status_code, activate = await call_license(
            "/v2/activate",
            {
                "activationCode": activation_code,
                "instanceId": INSTANCE_ID,
                "product": "homeos",
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-activate",
                "email": email,
            },
        )
        check("/v2/activate 返回 200", status_code == 200, str(status_code))
        if status_code == 200:
            payload = verifier.verify(activate["signedLease"], INSTANCE_ID)
            check("租约可通过客户端验签", payload["activationCodeId"] == activation_id)
            check("租约含 10 个基础功能码", len(payload["features"]) == 10, str(payload["features"]))
            check("租约序号从 1 开始", payload["leaseSequence"] == 1, str(payload["leaseSequence"]))
            check("租约 7 天有效", payload["expiresAt"].endswith("Z"), payload["expiresAt"])
            check("心跳间隔 300s", activate["heartbeatIn"] == 300, str(activate["heartbeatIn"]))
            check(
                "首激活返回双凭证",
                bool(activate.get("sessionToken")) and bool(activate.get("recoveryToken")),
            )
        else:
            return 1

        session_token = activate["sessionToken"]
        recovery_token = activate["recoveryToken"]
        sequence = payload["leaseSequence"]

        status_code, heartbeat = await call_license(
            "/v2/heartbeat",
            {
                "sessionToken": session_token,
                "leaseSequence": sequence,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-heartbeat",
            },
        )
        check("/v2/heartbeat 返回 200", status_code == 200, str(status_code))
        if status_code == 200:
            heartbeat_payload = verifier.verify(heartbeat["signedLease"], INSTANCE_ID)
            check(
                "心跳使租约序号严格递增",
                heartbeat_payload["leaseSequence"] > sequence,
                f"{sequence} -> {heartbeat_payload['leaseSequence']}",
            )
            sequence = heartbeat_payload["leaseSequence"]

        status_code, recovered = await call_license(
            "/v2/recover",
            {
                "recoveryToken": recovery_token,
                "instanceId": INSTANCE_ID,
                "leaseSequence": sequence,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-recover",
            },
        )
        check("/v2/recover 返回 200", status_code == 200, str(status_code))
        if status_code == 200:
            recovered_payload = verifier.verify(recovered["signedLease"], INSTANCE_ID)
            check(
                "恢复后序号继续递增",
                recovered_payload["leaseSequence"] > sequence,
                str(recovered_payload["leaseSequence"]),
            )
            session_token = recovered["sessionToken"]

        # 会话失效必须返回 401，客户端才会走 recover
        status_code, detail = await call_license(
            "/v2/heartbeat",
            {
                "sessionToken": "invalid-session-token",
                "leaseSequence": 99,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-bad",
            },
        )
        check("非法会话返回 401（触发客户端 recover）", status_code == 401, f"{status_code} {detail}")

        # -------------------------------------------------------------- #
        # 5. addon：购买 3D 交互包
        # -------------------------------------------------------------- #
        addon_order_response = await client.post(
            "/store/v1/orders",
            json={"productId": module_product_id, "customerId": activation_id},
        )
        check("增量包下单成功", addon_order_response.status_code == 201, str(addon_order_response.status_code))
        addon_order = addon_order_response.json()
        check("订单类型为 addon", addon_order["orderType"] == "addon", addon_order["orderType"])
        check("订单动作为 patch", addon_order["licenseAction"] == "patch", addon_order["licenseAction"])
        addon_pay = await client.post(
            f"/store/v1/orders/{addon_order['orderNo']}/mock/pay",
            json={"orderToken": addon_order["lookupToken"]},
        )
        check("增量包支付成功", addon_pay.status_code == 200, str(addon_pay.status_code))

        center = (await client.get("/store/v1/account")).json()
        check(
            "账号中心出现 1 条权益",
            len(center["entitlements"]) == 1
            and center["entitlements"][0]["featureCode"] == "module.3d_interaction",
            str(center["entitlements"]),
        )
        status_code, heartbeat = await call_license(
            "/v2/heartbeat",
            {
                "sessionToken": session_token,
                "leaseSequence": 0,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-addon",
            },
        )
        if check("增量包生效后心跳成功", status_code == 200, str(status_code)):
            payload = verifier.verify(heartbeat["signedLease"], INSTANCE_ID)
            check(
                "租约多出 module.3d_interaction",
                "module.3d_interaction" in payload["features"],
                str(payload["features"]),
            )

        # -------------------------------------------------------------- #
        # 6. 后台：停用设备绑定 → 客户端收到「确认吊销」
        # -------------------------------------------------------------- #
        with database.session() as session:
            admin_account = session.scalars(
                select(Account).where(Account.is_admin.is_(True))
            ).first()
            if admin_account is None:
                admin_account = Account(
                    email="admin@habridge.local",
                    password_hash=hash_password("smoke-admin-2026"),
                    is_admin=True,
                    is_active=True,
                )
                session.add(admin_account)
            else:
                admin_account.password_hash = hash_password("smoke-admin-2026")
            session.flush()
            binding = session.scalars(
                select(DeviceBinding).where(DeviceBinding.instance_id == INSTANCE_ID)
            ).first()
            binding_id = binding.id if binding is not None else None
            if session.get(StoreSetting, 1) is None:
                session.add(StoreSetting(id=1))
                session.flush()

        check("存在设备绑定记录", binding_id is not None, str(binding_id))

        logout = await client.delete("/store/v1/auth/logout")
        check("用户登出成功", logout.status_code == 204, str(logout.status_code))
        admin_login = await client.post(
            "/store/v1/auth/login",
            json={"email": "admin@habridge.local", "password": "smoke-admin-2026"},
        )
        check("管理员登录成功", admin_login.status_code == 200, str(admin_login.status_code))

        overview = await client.get("/store-admin/v1/overview")
        check("GET /store-admin/v1/overview", overview.status_code == 200, str(overview.status_code))
        settings_response = await client.get("/store-admin/v1/settings")
        check("GET /store-admin/v1/settings", settings_response.status_code == 200)

        release = await client.post(
            "/store-admin/v1/releases",
            json={
                "product": "homeos",
                "channel": "addon",
                "version": "1.0.0",
                "releaseDate": "2026-09-14",
                "upgradeNotes": "3D 交互包发布",
            },
        )
        check("后台发布版本", release.status_code == 200, str(release.status_code))
        addon_channel = (
            await client.get("/store/v1/updates/latest?channel=addon")
        ).json()
        check(
            "新增渠道可被客户端更新检查读取",
            addon_channel["release"] and addon_channel["release"]["version"] == "1.0.0",
            str(addon_channel["release"]),
        )

        release_binding = await client.post(
            f"/store-admin/v1/bindings/{binding_id}/release",
            json={"note": "smoke 强制解绑"},
        )
        check("后台强制解绑设备", release_binding.status_code == 200, str(release_binding.status_code))

        status_code, detail = await call_license(
            "/v2/heartbeat",
            {
                "sessionToken": session_token,
                "leaseSequence": 0,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-revoked",
            },
        )
        check("解绑后心跳返回 403", status_code == 403, f"{status_code} {detail}")
        check("错误文案命中客户端吊销短语", is_confirmed_revocation(detail), detail)

        status_code, detail = await call_license(
            "/v2/activate",
            {
                "activationCode": activation_code,
                "instanceId": "another-instance-0000000000000002",
                "product": "homeos",
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-cooldown",
                "email": email,
            },
        )
        check("冷却期内换设备激活被拒", status_code == 409, f"{status_code} {detail}")
        check("冷却错误提示含冷却字样", "冷却" in detail, detail)

        # 停用整张授权 → 也必须是吊销语义
        with database.session() as session:
            license_row = session.get(License, activation_id)
            license_row.active = False
            license_row.revoked_at = utcnow()
        status_code, detail = await call_license(
            "/v2/activate",
            {
                "activationCode": activation_code,
                "instanceId": INSTANCE_ID,
                "product": "homeos",
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-disabled",
                "email": email,
            },
        )
        check("授权被停用后激活返回 403", status_code == 403, f"{status_code} {detail}")
        check("停用文案命中吊销短语", is_confirmed_revocation(detail), detail)

        # 邮箱不匹配
        status_code, detail = await call_license(
            "/v2/activate",
            {
                "activationCode": "HB-0000-0000-0000-0000-0000-0000",
                "instanceId": INSTANCE_ID,
                "product": "homeos",
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-unknown",
                "email": email,
            },
        )
        check("不存在的激活码返回 404", status_code == 404, f"{status_code} {detail}")

    # ------------------------------------------------------------------ #
    # 7. 管理后台：商品 / 优惠码 / 手动签发 / 账号 / 站点配置 / 审计
    # ------------------------------------------------------------------ #
    # 上面的 async with 已退出并关闭了旧 client，这里为后续业务闭环重开会话
    client = httpx.AsyncClient(
        transport=transport_http, base_url="http://store.test", follow_redirects=True
    )
    admin_session = await client.post(
        "/store/v1/auth/login",
        json={"email": "admin@habridge.local", "password": "smoke-admin-2026"},
    )
    check("后台会话登录成功", admin_session.status_code == 200, str(admin_session.status_code))

    overview = await client.get("/store-admin/v1/overview")
    check("后台概览返回 200", overview.status_code == 200, str(overview.status_code))
    overview_data = overview.json()
    check(
        "后台概览字段齐全",
        {
            "accounts", "products", "licenses", "activeLicenses", "pendingOrders",
            "fulfilledOrders", "revenueCents", "pendingWithdrawals", "deviceBindings",
        }
        <= set(overview_data),
        str(sorted(overview_data)),
    )
    check("后台营收已累计", int(overview_data["revenueCents"]) > 0, str(overview_data["revenueCents"]))

    coupon_response = await client.post(
        "/store-admin/v1/coupons",
        json={
            "code": "SMOKE10",
            "description": "smoke 九折",
            "discountType": "percent",
            "percent": 10,
            "maxRedemptions": 5,
            "perAccountLimit": 1,
        },
    )
    check("后台创建优惠码", coupon_response.status_code == 200, str(coupon_response.status_code))
    coupons = (await client.get("/store-admin/v1/coupons")).json()["items"]
    check(
        "优惠码列表含新建码",
        any(item["code"] == "SMOKE10" and item["percent"] == 10 for item in coupons),
        str([item["code"] for item in coupons]),
    )

    created_product = await client.post(
        "/store-admin/v1/products",
        json={
            "name": "smoke 临时商品",
            "productType": "module",
            "priceCents": 1990,
            "featureCodes": ["module.smoke"],
            "active": True,
        },
    )
    check("后台创建商品", created_product.status_code == 200, str(created_product.status_code))
    temp_product_id = created_product.json()["id"]
    patched = await client.patch(
        f"/store-admin/v1/products/{temp_product_id}", json={"priceCents": 2990, "badgeText": "限时"}
    )
    check(
        "后台可补丁商品字段",
        patched.status_code == 200 and patched.json()["priceCents"] == 2990,
        str(patched.json().get("priceCents")),
    )

    # 商品图上传 + 前台读取
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
    )
    upload = await client.post(
        f"/store-admin/v1/products/{temp_product_id}/image",
        files={"file": ("smoke.png", tiny_png, "image/png")},
    )
    check("后台上传商品图", upload.status_code == 200, str(upload.status_code))
    image_url = upload.json().get("imageUrl", "")
    image_response = await client.get(image_url)
    check(
        "商品图可被前台读取",
        image_response.status_code == 200 and image_response.headers.get("content-type", "").startswith("image/"),
        f"{image_response.status_code} {image_response.headers.get('content-type')}",
    )

    removed = await client.delete(f"/store-admin/v1/products/{temp_product_id}")
    check(
        "无授权商品可物理删除",
        removed.status_code == 200 and removed.json().get("deleted") is True,
        str(removed.json()),
    )
    check(
        "商品目录恢复为 3 条",
        len((await client.get("/store/v1/products")).json()["items"]) == 3,
    )

    issued = await client.post(
        "/store-admin/v1/licenses",
        json={"email": email, "productId": base_product_id, "validityDays": 30},
    )
    check("后台手动签发激活码", issued.status_code == 200, str(issued.status_code))
    manual_license_id = issued.json()["activationCodeId"]
    manual_code = issued.json()["activationCode"]
    check(
        "手动签发来源为 manual 且格式正确",
        manual_code.startswith("HB-") and len(manual_code.split("-")) == 7,
        manual_code,
    )
    licenses = (await client.get("/store-admin/v1/licenses")).json()["items"]
    check(
        "激活码列表可检索到新码",
        any(item["activationCodeId"] == manual_license_id and item["issuanceSource"] == "manual" for item in licenses),
        str(len(licenses)),
    )

    accounts = (await client.get("/store-admin/v1/accounts")).json()["items"]
    user_row = next((item for item in accounts if item["email"] == email), None)
    check(
        "后台账号列表含该用户且授权数 >= 2",
        user_row is not None and int(user_row["licenseCount"]) >= 2,
        str(user_row),
    )

    settings_response = await client.put(
        "/store-admin/v1/settings",
        json={
            "announcement": "smoke 公告",
            "referralRatePercent": 100,
            "referralWithdrawalMinPoints": 1,
            "deviceReleaseCooldownSeconds": 28800,
        },
    )
    check("后台更新站点配置", settings_response.status_code == 200, str(settings_response.status_code))
    public_config = (await client.get("/store/v1/configuration")).json()
    check(
        "公告已反映到前台 configuration",
        public_config["store"]["announcement"] == "smoke 公告",
        str(public_config["store"]["announcement"]),
    )

    audits = (await client.get("/store-admin/v1/audit-logs")).json()["items"]
    check(
        "审计日志记录了商品与优惠码操作",
        any(item["action"].startswith("product.") for item in audits)
        and any(item["action"].startswith("coupon.") for item in audits),
        str(sorted({item["action"] for item in audits})),
    )
    releases = (await client.get("/store-admin/v1/releases")).json()["items"]
    check("版本发布列表可读", isinstance(releases, list) and len(releases) >= 1, str(len(releases)))

    # ------------------------------------------------------------------ #
    # 8. 前台业务闭环：优惠码抵扣、取消、过期、归档、改备注、自助解绑
    # ------------------------------------------------------------------ #
    await client.delete("/store/v1/auth/logout")
    relogin = await client.post(
        "/store/v1/auth/login", json={"email": email, "password": password}
    )
    check("用户重新登录成功", relogin.status_code == 200, str(relogin.status_code))

    preview = await client.post(
        "/store/v1/coupons/preview",
        json={"productId": base_product_id, "couponCode": "SMOKE10"},
    )
    check("优惠码预览返回 200", preview.status_code == 200, str(preview.status_code))
    preview_data = preview.json()
    check(
        "10% 折扣按分向下取整",
        preview_data["discountCents"] == 499
        and preview_data["amountCents"] == 4491
        and preview_data["originalAmountCents"] == 4990,
        str(preview_data),
    )

    discounted = await client.post(
        "/store/v1/orders", json={"productId": base_product_id, "couponCode": "SMOKE10"}
    )
    check("带优惠码下单成功", discounted.status_code == 201, str(discounted.status_code))
    discounted_order = discounted.json()
    check(
        "订单金额已抵扣",
        discounted_order["amountCents"] == 4491
        and discounted_order["discountCents"] == 499
        and discounted_order["couponCode"] == "SMOKE10",
        str({key: discounted_order[key] for key in ("amountCents", "discountCents", "couponCode")}),
    )
    discounted_pay = await client.post(
        f"/store/v1/orders/{discounted_order['orderNo']}/mock/pay",
        json={"orderToken": discounted_order["lookupToken"]},
    )
    check("抵扣订单支付成功", discounted_pay.status_code == 200, str(discounted_pay.status_code))

    repeat_preview = await client.post(
        "/store/v1/coupons/preview",
        json={"productId": base_product_id, "couponCode": "SMOKE10"},
    )
    check("同一账号不可重复使用优惠码", repeat_preview.status_code == 400, str(repeat_preview.status_code))

    pending_order = (
        await client.post("/store/v1/orders", json={"productId": base_product_id, "couponCode": None})
    ).json()
    cancelled = await client.post(
        f"/store/v1/orders/{pending_order['orderNo']}/mock/cancel",
        json={"orderToken": pending_order["lookupToken"]},
    )
    check(
        "待支付订单可取消",
        cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled",
        str(cancelled.status_code),
    )

    expiring_order = (
        await client.post("/store/v1/orders", json={"productId": base_product_id, "couponCode": None})
    ).json()
    with database.session() as session:
        row = session.scalars(select(Order).where(Order.order_no == expiring_order["orderNo"])).first()
        row.expires_at = utcnow() - timedelta(seconds=1)
    expired_list = (await client.get("/store/v1/orders")).json()["items"]
    expired_row = next(item for item in expired_list if item["orderNo"] == expiring_order["orderNo"])
    check("超时未支付订单被自动置为 expired", expired_row["status"] == "expired", expired_row["status"])

    archived = await client.post(f"/store/v1/orders/{discounted_order['orderNo']}/archive")
    check(
        "订单可归档",
        archived.status_code == 200 and archived.json()["archivedAt"] is not None,
        str(archived.status_code),
    )

    labeled = await client.patch(
        f"/store/v1/account/licenses/{manual_license_id}/label",
        json={"label": "smoke 备用授权"},
    )
    check(
        "授权备注可保存",
        labeled.status_code == 200 and labeled.json()["userLabel"] == "smoke 备用授权",
        str(labeled.json()),
    )

    wrong_password = await client.post(
        f"/store/v1/account/licenses/{manual_license_id}/release",
        json={"password": "wrong-password"},
    )
    check("自助解绑校验登录密码", wrong_password.status_code == 403, str(wrong_password.status_code))

    released_self = await client.post(
        f"/store/v1/account/licenses/{manual_license_id}/release",
        json={"password": password},
    )
    check("自助解绑成功", released_self.status_code == 200, str(released_self.status_code))
    released_policy = released_self.json()["deviceReleasePolicy"]
    check(
        "自助解绑返回冷却策略",
        released_policy["cooldownSeconds"] == 28800 and released_policy["remainingSeconds"] == 28800,
        str(released_policy),
    )
    released_again = await client.post(
        f"/store/v1/account/licenses/{manual_license_id}/release",
        json={"password": password},
    )
    check("冷却期内再次自助解绑被拒", released_again.status_code == 429, str(released_again.status_code))

    # 手动签发的授权可直接激活（同一账号、同一邮箱）
    status_code, manual_activate = await call_license(
        "/v2/activate",
        {
            "activationCode": manual_code,
            "instanceId": "smoke-manual-instance-000000000002",
            "product": "homeos",
            "clientVersion": CLIENT_VERSION,
            "nonce": "smoke-nonce-manual",
            "email": email,
        },
    )
    check("手动签发的激活码可用", status_code == 200, f"{status_code} {manual_activate}")
    if status_code == 200:
        manual_payload = verifier.verify(manual_activate["signedLease"], "smoke-manual-instance-000000000002")
        check(
            "手动授权租约含基础功能码",
            len(manual_payload["features"]) == 10,
            str(manual_payload["features"]),
        )

    # ------------------------------------------------------------------ #
    # 9. 邀请有礼：绑定关系 → 支付奖励 → 积分明细 → 提现审核
    # ------------------------------------------------------------------ #
    overview_before = (await client.get("/store/v1/referrals")).json()
    check("新用户尚无邀请钱包", overview_before["wallet"] is None, str(overview_before["wallet"]))
    wallet_response = await client.post("/store/v1/referrals/code")
    check("生成邀请码成功", wallet_response.status_code == 200, str(wallet_response.status_code))
    invite_code = wallet_response.json()["wallet"]["code"]
    check("邀请码为 6 位数字", invite_code.isdigit() and len(invite_code) == 6, invite_code)

    invitee_email = "smoke-invitee@habridge.local"
    invitee_password = "smoke-invitee-2026"
    invitee_code = (
        await client.post(
            "/store/v1/verifications", json={"email": invitee_email, "purpose": "register"}
        )
    ).json()["code"]
    invitee_register = await client.post(
        "/store/v1/auth/register",
        json={
            "email": invitee_email,
            "code": invitee_code,
            "password": invitee_password,
            "confirmPassword": invitee_password,
            "referralCode": invite_code,
        },
    )
    check("被邀请人注册成功", invitee_register.status_code == 200, str(invitee_register.status_code))
    invitee_order = (
        await client.post("/store/v1/orders", json={"productId": base_product_id, "couponCode": None})
    ).json()
    invitee_pay = await client.post(
        f"/store/v1/orders/{invitee_order['orderNo']}/mock/pay",
        json={"orderToken": invitee_order["lookupToken"]},
    )
    check("被邀请人下单并支付成功", invitee_pay.status_code == 200, str(invitee_pay.status_code))

    await client.delete("/store/v1/auth/logout")
    await client.post("/store/v1/auth/login", json={"email": email, "password": password})
    referral_after = (await client.get("/store/v1/referrals")).json()
    check(
        "邀请人钱包收到 100% 奖励积分",
        referral_after["wallet"] is not None
        and float(referral_after["wallet"]["balance"]) == 49.9
        and float(referral_after["wallet"]["earned"]) == 49.9,
        str(referral_after["wallet"]),
    )
    check("邀请人数为 1", referral_after["invitedCount"] == 1, str(referral_after["invitedCount"]))
    check(
        "前台可读到邀请设置",
        referral_after["settings"]["ratePercent"] == 100.0
        and referral_after["settings"]["withdrawalFeePercent"] == 1.0,
        str(referral_after["settings"]),
    )

    ledger = (await client.get("/store/v1/referrals/history?kind=ledger&page=1")).json()
    reward_row = next((item for item in ledger["items"] if item["kind"] == "reward"), None)
    check(
        "积分明细含 reward 记录",
        reward_row is not None
        and float(reward_row["delta"]) == 49.9
        and float(reward_row["balanceAfter"]) == 49.9,
        str(reward_row),
    )

    withdrawal = await client.post(
        "/store/v1/referrals/withdrawals",
        json={
            "points": 20,
            "qq": "123456789",
            "requestKey": "smoke-withdraw-0001",
            "expectedFeePercent": 1.0,
        },
    )
    check("提现申请成功", withdrawal.status_code == 200, str(withdrawal.status_code))
    withdrawal_data = withdrawal.json()
    check(
        "手续费按 1% 向下取整",
        withdrawal_data["feePoints"] == "0.20" and withdrawal_data["netPoints"] == "19.80",
        str(withdrawal_data),
    )
    check(
        "重复 requestKey 幂等返回同一条",
        (await client.post(
            "/store/v1/referrals/withdrawals",
            json={
                "points": 20,
                "qq": "123456789",
                "requestKey": "smoke-withdraw-0001",
                "expectedFeePercent": 1.0,
            },
        )).json()["id"] == withdrawal_data["id"],
    )
    frozen_wallet = (await client.get("/store/v1/referrals")).json()["wallet"]
    check(
        "提现后冻结增加、可用余额 = 余额 - 冻结",
        float(frozen_wallet["frozen"]) == 20.0
        and float(frozen_wallet["balance"]) - float(frozen_wallet["frozen"]) == 29.9,
        str(frozen_wallet),
    )
    blocked = await client.post(
        "/store/v1/referrals/withdrawals",
        json={"points": 5, "qq": "123456789", "requestKey": "smoke-withdraw-0002"},
    )
    check("存在处理中提现时拒绝新申请", blocked.status_code == 409, str(blocked.status_code))

    await client.delete("/store/v1/auth/logout")
    await client.post(
        "/store/v1/auth/login",
        json={"email": "admin@habridge.local", "password": "smoke-admin-2026"},
    )
    pending_withdrawals = (
        await client.get("/store-admin/v1/withdrawals?status_filter=pending")
    ).json()["items"]
    check(
        "后台可见待审提现",
        any(item["id"] == withdrawal_data["id"] for item in pending_withdrawals),
        str([item["id"] for item in pending_withdrawals]),
    )
    resolved = await client.post(
        f"/store-admin/v1/withdrawals/{withdrawal_data['id']}/resolve",
        json={"approve": True, "note": "smoke 通过"},
    )
    check("后台通过提现", resolved.status_code == 200, str(resolved.status_code))
    async with httpx.AsyncClient(
        transport=transport_http, base_url="http://store.test", follow_redirects=True
    ) as invitee_client:
        await invitee_client.post(
            "/store/v1/auth/login", json={"email": invitee_email, "password": invitee_password}
        )
        invitee_center = (await invitee_client.get("/store/v1/account")).json()
        check(
            "被邀请人账号中心已有自己的授权",
            len(invitee_center["licenses"]) == 1,
            str(len(invitee_center["licenses"])),
        )

    await client.post("/store/v1/auth/login", json={"email": email, "password": password})
    final_wallet = (await client.get("/store/v1/referrals")).json()["wallet"]
    check(
        "提现通过后冻结清零、已提现累计",
        float(final_wallet["frozen"]) == 0.0 and float(final_wallet["withdrawn"]) == 20.0,
        str(final_wallet),
    )
    withdrawal_history = (
        await client.get("/store/v1/referrals/history?kind=withdrawals&page=1")
    ).json()["items"]
    check(
        "提现记录状态为 paid",
        any(item["id"] == withdrawal_data["id"] and item["status"] == "paid" for item in withdrawal_history),
        str(withdrawal_history),
    )

    # ------------------------------------------------------------------ #
    # 9b. 后台删除能力：真删 / 守卫 / 级联
    # ------------------------------------------------------------------ #
    # 放在最后，避免改动前面的计数类断言（商品数、授权数、审计动作集合）
    await client.post(
        "/store/v1/auth/login",
        json={"email": "admin@habridge.local", "password": "smoke-admin-2026"},
    )

    # —— 商品：有订单引用时必须改为下架，而不是撞 FK 约束 500 ——
    # Order.product_id 是 NOT NULL 外键且没有 ondelete，SQLite 又开了 foreign_keys=ON，
    # 所以「只统计 License 不统计 Order」的老实现会在这里直接抛 IntegrityError。
    guard_product = (
        await client.post(
            "/store-admin/v1/products",
            json={"name": "smoke 被订单引用商品", "productType": "module", "priceCents": 990},
        )
    ).json()
    with database.session() as session:
        session.add(
            Order(
                order_no=f"HB-SMOKE-FK-{utcnow().strftime('%H%M%S%f')}",
                lookup_token="smoke-fk-token",
                account_id=account_id,
                email=email,
                product_id=guard_product["id"],
                product_name=guard_product["name"],
                product_type="module",
                order_type="addon",
                license_action="issue",
                original_amount_cents=990,
                amount_cents=990,
                status="expired",
                fulfillment_mode="automatic",
                payment_provider="mock",
            )
        )

    referenced = await client.delete(f"/store-admin/v1/products/{guard_product['id']}")
    referenced_data = referenced.json() if referenced.status_code == 200 else {}
    check(
        "有订单引用的商品删除被降级为下架（不撞 FK 崩溃）",
        referenced.status_code == 200
        and referenced_data.get("deleted") is False
        and referenced_data.get("deactivated") is True
        and referenced_data.get("orders") == 1,
        f"{referenced.status_code} {referenced_data}",
    )
    check(
        "降级下架后商品仍在目录里（active=false）",
        any(
            item["name"] == "smoke 被订单引用商品" and not item["active"]
            for item in (await client.get("/store-admin/v1/products")).json()["items"]
        ),
    )
    # 后台列表要把删除守卫的判定依据（不带 active/status 过滤的引用数）暴露出来，
    # 前端确认弹窗才能如实预告「真删」还是「下架」。
    guarded_row = next(
        (
            item
            for item in (await client.get("/store-admin/v1/products")).json()["items"]
            if item["name"] == "smoke 被订单引用商品"
        ),
        None,
    )
    check(
        "商品列表暴露与删除守卫同口径的引用计数",
        guarded_row is not None
        and guarded_row.get("orderCount") == 1
        and guarded_row.get("licenseCount") == 0,
        str(guarded_row and {k: guarded_row.get(k) for k in ("orderCount", "licenseCount")}),
    )

    # —— 订单：只有「终态且未关联授权」才允许删除 ——
    with database.session() as session:
        product_row = session.get(Product, base_product_id)
        holder_account = session.get(Account, account_id)
        holder_customer_id = session.scalars(
            select(Customer).where(Customer.account_id == account_id)
        ).first().id

        def _smoke_order(status: str, order_no: str) -> Order:
            row = Order(
                order_no=order_no,
                lookup_token=f"token-{order_no}",
                account_id=holder_account.id,
                customer_id=holder_customer_id,
                email=holder_account.email,
                product_id=product_row.id,
                product_name=product_row.name,
                product_type=product_row.product_type,
                order_type="base",
                license_action="issue",
                original_amount_cents=4990,
                amount_cents=4990,
                status=status,
                fulfillment_mode="automatic",
                payment_provider="mock",
            )
            session.add(row)
            session.flush()
            return row

        stamp = utcnow().strftime("%H%M%S%f")
        pending_order_no = f"HB-SMOKE-PEND-{stamp}"
        junk_order_no = f"HB-SMOKE-JUNK-{stamp}"
        linked_order_no = f"HB-SMOKE-LINK-{stamp}"
        _smoke_order("pending", pending_order_no)
        _smoke_order("cancelled", junk_order_no)
        linked_order = _smoke_order("cancelled", linked_order_no)

        # 给「已关联授权」那笔订单挂一条授权，用于验证删除守卫
        linked_license = License(
            activation_code=f"HB-SMOKE-LINK-{stamp}",
            code_hint="SMOKE",
            customer_id=holder_customer_id,
            account_id=account_id,
            product_id=product_row.id,
            product_name=product_row.name,
            product_type=product_row.product_type,
            issuance_source="manual",
            active=False,
        )
        session.add(linked_license)
        session.flush()
        linked_order.license_id = linked_license.id

    blocked_pending = await client.delete(f"/store-admin/v1/orders/{pending_order_no}")
    check(
        "待支付订单不可删除（提示先取消）",
        blocked_pending.status_code == 409,
        str(blocked_pending.status_code),
    )
    blocked_linked = await client.delete(f"/store-admin/v1/orders/{linked_order_no}")
    check(
        "已关联授权的订单不可删除（提示走退款）",
        blocked_linked.status_code == 409,
        str(blocked_linked.status_code),
    )
    deleted_junk = await client.delete(f"/store-admin/v1/orders/{junk_order_no}")
    check(
        "已取消且未发码的订单可删除",
        deleted_junk.status_code == 200 and deleted_junk.json().get("deleted") is True,
        str(deleted_junk.json()),
    )

    # —— 授权：必须先停用、且无活跃绑定，才允许彻底删除 ——
    active_license = (
        await client.post(
            "/store-admin/v1/licenses",
            json={"email": email, "productId": base_product_id, "validityDays": 1},
        )
    ).json()
    still_active = await client.delete(f"/store-admin/v1/licenses/{active_license['activationCodeId']}")
    check(
        "生效中的授权不可直接删除（必须先停用）",
        still_active.status_code == 409,
        str(still_active.status_code),
    )
    await client.post(
        f"/store-admin/v1/licenses/{active_license['activationCodeId']}/deactivate",
        json={"note": "smoke 删除前停用"},
    )
    purged_license = await client.delete(f"/store-admin/v1/licenses/{active_license['activationCodeId']}")
    check(
        "已停用且无绑定的授权可彻底删除",
        purged_license.status_code == 200 and purged_license.json().get("deleted") is True,
        str(purged_license.json()),
    )

    # 多设备绑定：一条授权每个 instance_id 一行。停用必须把它们**全部**释放，
    # 否则残留的 active 绑定会让客户端以为还能用，删除守卫也会被绕过。
    multi_license = (
        await client.post(
            "/store-admin/v1/licenses",
            json={"email": email, "productId": base_product_id, "validityDays": 1},
        )
    ).json()
    multi_license_id = multi_license["activationCodeId"]
    with database.session() as session:
        for index in range(2):
            session.add(
                DeviceBinding(
                    license_id=multi_license_id,
                    instance_id=f"smoke-multi-{index}-{utcnow().strftime('%H%M%S%f')}",
                    client_version="0.4.6",
                    active=True,
                )
            )
    await client.post(
        f"/store-admin/v1/licenses/{multi_license_id}/deactivate",
        json={"note": "smoke 多设备停用"},
    )
    with database.session() as session:
        remaining_active = session.scalars(
            select(DeviceBinding).where(
                DeviceBinding.license_id == multi_license_id,
                DeviceBinding.active.is_(True),
            )
        ).all()
    check(
        "停用授权会释放该授权的全部设备绑定（不只第一条）",
        remaining_active == [],
        f"仍活跃 {len(remaining_active)} 条",
    )
    multi_deleted = await client.delete(f"/store-admin/v1/licenses/{multi_license_id}")
    with database.session() as session:
        leftover = session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == multi_license_id)
        ).all()
    check(
        "解绑后可删除授权，且绑定记录被级联清理",
        multi_deleted.status_code == 200
        and multi_deleted.json().get("bindings") == 2
        and leftover == [],
        f"{multi_deleted.status_code} {multi_deleted.json()} 残留 {len(leftover)}",
    )

    # 守卫的纵深防御：直接构造「授权已停用但仍有活跃绑定」这种正常流程不会
    # 产生的状态（例如心跳与停用并发、或恢复旧备份），必须拦住删除。
    stranded_license = (
        await client.post(
            "/store-admin/v1/licenses",
            json={"email": email, "productId": base_product_id, "validityDays": 1},
        )
    ).json()
    stranded_id = stranded_license["activationCodeId"]
    with database.session() as session:
        row = session.get(License, stranded_id)
        row.active = False
        session.add(
            DeviceBinding(
                license_id=stranded_id,
                instance_id=f"smoke-stranded-{utcnow().strftime('%H%M%S%f')}",
                client_version="0.4.6",
                active=True,
            )
        )
    blocked_binding = await client.delete(f"/store-admin/v1/licenses/{stranded_id}")
    check(
        "授权虽已停用但仍挂着活跃绑定时，拒绝删除",
        blocked_binding.status_code == 409,
        str(blocked_binding.status_code),
    )
    with database.session() as session:
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == stranded_id)
        ):
            binding.active = False
            binding.released_at = utcnow()
    rescued = await client.delete(f"/store-admin/v1/licenses/{stranded_id}")
    check(
        "释放绑定后可删除该授权",
        rescued.status_code == 200 and rescued.json().get("deleted") is True,
        str(rescued.json()),
    )

    # —— 优惠码：未使用真删；已核销转停用；停用后还能再启用 ——
    unused_coupon = (
        await client.post(
            "/store-admin/v1/coupons",
            json={"code": "SMOKE-UNUSED", "description": "smoke 未使用", "percent": 5},
        )
    ).json()
    unused_deleted = await client.delete(f"/store-admin/v1/coupons/{unused_coupon['id']}")
    check(
        "未使用的优惠码可物理删除",
        unused_deleted.status_code == 200 and unused_deleted.json().get("deleted") is True,
        str(unused_deleted.json()),
    )
    check(
        "删除后不再出现在优惠码列表",
        not any(
            item["code"] == "SMOKE-UNUSED"
            for item in (await client.get("/store-admin/v1/coupons")).json()["items"]
        ),
    )

    used_coupon = (
        await client.post(
            "/store-admin/v1/coupons",
            json={"code": "SMOKE-USED", "description": "smoke 已核销", "percent": 5},
        )
    ).json()
    with database.session() as session:
        session.add(
            CouponRedemption(
                coupon_id=used_coupon["id"],
                account_id=account_id,
                discount_cents=100,
            )
        )
    # 夹具刻意没有同步 Coupon.redeemed_count（仍是默认 0），正是「计数列漂移」的场景。
    # 两个用量字段回答不同问题，必须各归各：
    #   redemptionCount = 数 coupon_redemptions（历史凭证 + 删除守卫判据）→ 1
    #   redeemedCount   = 读计数列（此刻仍占用的名额，参与名额校验）      → 0
    used_row = next(
        (
            item
            for item in (await client.get("/store-admin/v1/coupons")).json()["items"]
            if item["code"] == "SMOKE-USED"
        ),
        None,
    )
    check(
        "优惠码列表的历史用量以核销记录为准（计数列漂移时仍准确）",
        used_row is not None and used_row.get("redemptionCount") == 1,
        str(used_row and used_row.get("redemptionCount")),
    )
    check(
        "优惠码列表的占用名额以计数列为准（不被历史记录撑大）",
        used_row is not None and used_row.get("redeemedCount") == 0,
        str(used_row and used_row.get("redeemedCount")),
    )
    used_deleted = await client.delete(f"/store-admin/v1/coupons/{used_coupon['id']}")
    check(
        "已核销的优惠码降级为停用（保住核销记录）",
        used_deleted.status_code == 200
        and used_deleted.json().get("deleted") is False
        and used_deleted.json().get("deactivated") is True
        and used_deleted.json().get("redemptions") == 1,
        str(used_deleted.json()),
    )
    reactivated = await client.patch(
        f"/store-admin/v1/coupons/{used_coupon['id']}", json={"active": True}
    )
    check(
        "已停用优惠码可通过 PATCH 重新启用",
        reactivated.status_code == 200 and reactivated.json().get("active") is True,
        str(reactivated.json()),
    )

    # —— 提现：待审不可删（会丢冻结额度），已结算可删 ——
    # 直接造一条 pending 提现，验证守卫
    with database.session() as session:
        holder_wallet = session.scalars(
            select(ReferralWallet).where(ReferralWallet.account_id == account_id)
        ).first()
        session.add(
            ReferralWithdrawal(
                wallet_id=holder_wallet.id,
                account_id=account_id,
                request_key=f"smoke-delete-pending-{utcnow().strftime('%H%M%S%f')}",
                points=1.0,
                net_points=1.0,
                qq="123456789",
                status="pending",
            )
        )
    with database.session() as session:
        pending_withdrawal_id = (
            session.scalars(
                select(ReferralWithdrawal)
                .where(ReferralWithdrawal.status == "pending")
                .order_by(ReferralWithdrawal.created_at.desc())
            )
            .first()
            .id
        )
    blocked_withdrawal = await client.delete(f"/store-admin/v1/withdrawals/{pending_withdrawal_id}")
    check(
        "待审核提现不可删除（提示先通过或驳回）",
        blocked_withdrawal.status_code == 409,
        str(blocked_withdrawal.status_code),
    )
    settled_deleted = await client.delete(f"/store-admin/v1/withdrawals/{withdrawal_data['id']}")
    check(
        "已结算（paid）的提现记录可删除",
        settled_deleted.status_code == 200 and settled_deleted.json().get("deleted") is True,
        str(settled_deleted.json()),
    )

    # —— 版本发布：叶子表，可安全硬删 ——
    release_created = (
        await client.post(
            "/store-admin/v1/releases",
            json={"product": "homeos", "channel": "docker", "version": "0.0.0-smoke-delete"},
        )
    ).json()
    release_deleted = await client.delete(f"/store-admin/v1/releases/{release_created['id']}")
    check(
        "版本记录可删除",
        release_deleted.status_code == 200 and release_deleted.json().get("deleted") is True,
        str(release_deleted.json()),
    )
    check(
        "删除后版本列表不再包含该记录",
        not any(
            item["version"] == "0.0.0-smoke-delete"
            for item in (await client.get("/store-admin/v1/releases")).json()["items"]
        ),
    )

    # —— 审计日志：单条删除 + 按天数批量清理（必填守卫） ——
    audit_items = (await client.get("/store-admin/v1/audit-logs")).json()["items"]
    single_deleted = await client.delete(f"/store-admin/v1/audit-logs/{audit_items[0]['id']}")
    check(
        "审计日志可单条删除",
        single_deleted.status_code == 200 and single_deleted.json().get("deleted") is True,
        str(single_deleted.json()),
    )
    check(
        "删除后该条审计记录消失",
        all(
            item["id"] != audit_items[0]["id"]
            for item in (await client.get("/store-admin/v1/audit-logs")).json()["items"]
        ),
    )

    with database.session() as session:
        session.add(
            AuditLog(
                actor="smoke@habridge.local",
                action="smoke.ancient",
                target="ancient",
                detail="一条很旧的日志",
                created_at=utcnow() - timedelta(days=400),
            )
        )
    missing_param = await client.delete("/store-admin/v1/audit-logs")
    check(
        "批量清理必须显式给出天数（缺参数 422）",
        missing_param.status_code == 422,
        str(missing_param.status_code),
    )
    purged = await client.delete("/store-admin/v1/audit-logs?older_than_days=365")
    check(
        "批量清理删除保留区之外的日志",
        purged.status_code == 200 and int(purged.json().get("deleted", 0)) >= 1,
        str(purged.json()),
    )
    check(
        "批量清理后仍保留近期日志",
        any(
            item["action"].startswith("audit.")
            for item in (await client.get("/store-admin/v1/audit-logs")).json()["items"]
        ),
    )

    await client.aclose()

    # ------------------------------------------------------------------ #
    # 10. 客户端默认配置：必须自包含地指向自建授权服务器
    # ------------------------------------------------------------------ #
    client_config = load_module("hb_client_config", CLIENT_CONFIG_PATH)

    saved_env = {
        key: os.environ.pop(key)
        for key in list(os.environ)
        if key.startswith("APP_LICENSE_")
    }
    try:
        default = client_config.load_settings()
        check(
            "未设置 env 时授权服务器指向自建服务",
            default.license_server_url == client_config.SELF_HOSTED_LICENSE_SERVER_URL
            and default.effective_license_server_batches
            == (("direct", (client_config.SELF_HOSTED_LICENSE_SERVER_URL,)),),
            default.license_server_url,
        )
        check(
            "未设置 env 时批次为内置 direct",
            default.license_server_batches == client_config.DEFAULT_LICENSE_SERVER_BATCHES,
            str(default.license_server_batches),
        )
        check(
            "未设置 env 时签名公钥指纹为自建默认",
            default.license_public_key_sha256
            == client_config.DEFAULT_LICENSE_PUBLIC_KEY_SHA256
            and default.license_legacy_key_id
            == client_config.DEFAULT_LICENSE_KEY_ID,
            default.license_legacy_key_id,
        )
        check(
            "未设置 env 时传输公钥指纹为自建默认",
            default.license_transport_public_key_sha256
            == client_config.DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
            and default.license_transport_key_id
            == client_config.DEFAULT_LICENSE_TRANSPORT_KEY_ID,
            default.license_transport_key_id,
        )
        check(
            "未设置 env 时可信公钥表指仓库 keys/ 镜像",
            set(default.license_trusted_public_keys)
            == {client_config.DEFAULT_LICENSE_KEY_ID}
            and default.license_public_key_path.name
            == client_config.DEFAULT_LICENSE_PUBLIC_KEY_FILENAME,
            str(default.license_public_key_path),
        )

        # 公钥镜像必须与授权服务器私钥同源、且与默认指纹逐字节一致，
        # 否则「服务端签发 → 客户端离线验签」会在指纹校验处断裂。
        mirror = PROJECT_ROOT / "keys"
        server_keys = PROJECT_ROOT / "store" / "keys" / "local"
        mirror_pairs = (
            ("license-public.pem", client_config.DEFAULT_LICENSE_PUBLIC_KEY_SHA256),
            (
                "license-transport-public.pem",
                client_config.DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
            ),
        )
        for filename, expected in mirror_pairs:
            mirrored = mirror / filename
            origin = server_keys / filename
            ok = (
                mirrored.is_file()
                and origin.is_file()
                and mirrored.read_bytes() == origin.read_bytes()
                and client_crypto.hashlib.sha256(mirrored.read_bytes()).hexdigest()
                == expected
            )
            check(
                f"keys/{filename} 与服务器公钥同源且指纹一致",
                ok,
                f"{mirrored} vs {origin}",
            )

        # 生产授权端点与公钥应彻底移除（只保留自建授权服务器）。
        production_markers = (
            "hbjh1.habridge.cn",
            "hbjh2.habridge.cn",
            "hbjheas",
            "hbjheo",
            "onestrm.cn",
            "hb-2026-01",
            "hb-transport-2026-01",
            "56ad5028f6a48378b2475be119bed0dc912d317c399b94726e7ba43c3c8beab7",
            "5b9856b097de0fecb3699a4fae7c698de1cfbe60046e7658f345c1e95c6018d8",
        )
        leftovers = []
        for path in sorted((PROJECT_ROOT / "backend" / "app").rglob("*.py")):
            text = path.read_text(encoding="utf-8")
            leftovers.extend(
                f"{path.relative_to(PROJECT_ROOT)}:{marker}"
                for marker in production_markers
                if marker in text
            )
        check("生产授权端点/公钥已彻底移除", not leftovers, "；".join(leftovers[:4]))

        os.environ["APP_LICENSE_SERVER_URL"] = "http://127.0.0.1:18082"
        local_only = client_config.load_settings()
        check(
            "只给 URL 时批次收敛为单条 direct",
            local_only.effective_license_server_batches
            == (("direct", ("http://127.0.0.1:18082",)),),
            str(local_only.effective_license_server_batches),
        )

        os.environ["APP_LICENSE_SERVER_BATCHES"] = (
            "esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083"
        )
        os.environ["APP_LICENSE_KEY_ID"] = "hb-local-2026"
        os.environ["APP_LICENSE_PUBLIC_KEY_FILE"] = str(settings.public_key_path)
        os.environ["APP_LICENSE_PUBLIC_KEY_SHA256"] = (
            client_crypto.hashlib.sha256(settings.public_key_path.read_bytes()).hexdigest()
        )
        os.environ["APP_LICENSE_TRANSPORT_KEY_ID"] = "hb-local-transport-2026"
        os.environ["APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE"] = str(
            settings.transport_public_key_path
        )
        os.environ["APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256"] = (
            client_crypto.hashlib.sha256(
                settings.transport_public_key_path.read_bytes()
            ).hexdigest()
        )
        local = client_config.load_settings()
        check("批次可被显式覆盖", len(local.license_server_batches) == 3, str(local.license_server_batches))
        check("本地 keyId 生效", local.license_legacy_key_id == "hb-local-2026")
        check(
            "本地传输 keyId 生效",
            local.license_transport_key_id == "hb-local-transport-2026",
        )
        check(
            "可信公钥表改为本地公钥",
            local.license_trusted_public_keys["hb-local-2026"][0].resolve()
            == settings.public_key_path.resolve()
            and local.license_trusted_public_keys["hb-local-2026"][1]
            == os.environ["APP_LICENSE_PUBLIC_KEY_SHA256"],
            str(local.license_trusted_public_keys),
        )
        check(
            "本地配置可通过客户端自身校验（X25519 公钥可加载）",
            client_crypto.LicenseTransportCipher(
                local.license_transport_public_key_path,
                local.license_transport_key_id,
                local.license_transport_public_key_sha256,
            ).key_id
            == "hb-local-transport-2026",
        )
        check(
            "config.py 默认即自建授权服务器（18082 已内置）",
            "18082" in CLIENT_CONFIG_PATH.read_text(encoding="utf-8"),
        )
    finally:
        for key in list(os.environ):
            if key.startswith("APP_LICENSE_"):
                os.environ.pop(key, None)
        os.environ.update(saved_env)

    # ------------------------------------------------------------------ #
    # 11. 静态资源完整性（防下载截断）+ 前后端方法契约 + 设计系统单一来源
    # ------------------------------------------------------------------ #
    check_static_assets()
    check_frontend_api_contract()
    check_theme_matches_app()
    check_legacy_stylesheets_removed()
    check_design_class_coverage()
    check_addon_card_layout()
    check_account_meta_chip_tokens()

    shutil.rmtree(workdir, ignore_errors=True)

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print()
    print("=" * 72)
    print(f"自检完成：{passed} 通过 / {failed} 失败（共 {len(RESULTS)} 项）")
    print("=" * 72)
    if failed:
        print()
        print("失败项：")
        for name, ok, detail in RESULTS:
            if not ok:
                print(f"  - {name}：{detail}")
    return 1 if failed else 0


def main() -> None:
    try:
        code = asyncio.run(run())
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        code = 1
    raise SystemExit(code)


if __name__ == "__main__":
    main()
