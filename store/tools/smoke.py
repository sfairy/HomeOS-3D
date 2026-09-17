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
10. 主应用首次初始化的守卫：远程来源必须带引导密钥，本机直连放行，猜密钥会被限流，
    初始化成功后密钥立即作废（并静态钉住 authorize 排在 argon2 之前）

全部使用临时目录，不会污染 store/data 与 keys/。
"""

from __future__ import annotations

import asyncio
import base64
import importlib.util
import json
import logging
import os
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import traceback
import warnings
import types
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from sqlalchemy import Column, MetaData, String, inspect, select

from store.app import create_app
from store.config import STORE_ROOT, StoreSettings, load_settings
from store import site_settings as site_config
from store.database import Base, create_store_engine
from store.models import (
    Account,
    AccountSession,
    AuditLog,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    Entitlement,
    License,
    Order,
    Product,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
)
from store.order_status import ORDER_STATUS_LABELS
from store.payments import alipay as alipay_module
from store.payments import resolve_provider
from store.payments.base import PaymentError, RefundResult
from store.payments.mock import MockPaymentProvider
from store.payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from store.payments import sweeper as sweeper_module
from store.security import hash_password, token_hash, utcnow
from store.serializers import list_json
from store.tools.seed import seed_admin, seed_products, seed_release, seed_settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CLIENT_CRYPTO_PATH = PROJECT_ROOT / "backend" / "app" / "license" / "crypto.py"
CLIENT_CONFIG_PATH = PROJECT_ROOT / "backend" / "app" / "config.py"

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


def check_retired_columns() -> None:
    """退役列必须能被 ``ensure_schema`` 从存量库上真正删掉。

    防的是一类**只在存量库上出现**的故障：``Mapped[str]`` 会被推断成 ``NOT NULL``，
    而 SQLAlchemy 不把 Python 侧的 ``default=`` 写进 DDL，于是存量库里那一列是
    ``NOT NULL`` 且**没有默认值**。ORM 一旦不再映射它，INSERT 就会省略该列并以
    ``NOT NULL constraint failed`` 失败 —— 全新库（``create_all`` 建表时本就没有
    这一列）与整套 smoke 全绿，线上却是每次提现都失败。

    这里按「旧版结构」造库（把登记过的退役列以 ``NOT NULL`` 加回去），跑一遍
    ``ensure_schema``，断言列被删干净、且剩下的列与 ORM 完全一致。
    """
    from store.schema_guard import _RETIRED_COLUMNS, ensure_schema

    # 登记表是删列白名单，反过来也要对得上：已经不在模型里的才算「退役」，
    # 还留在模型里的说明登记表过期了（改名/写错都会让删列静默不发生）。
    stale = [
        f"{table}.{column}"
        for table, columns in _RETIRED_COLUMNS.items()
        for column in columns
        if column in Base.metadata.tables[table].columns
    ]
    check("退役列登记表与 ORM 一致（登记过的列不该还在模型里）", not stale, f"仍在模型里: {stale}")

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-retired-"))
    engine = create_store_engine(load_settings(data_dir=workdir / "data"))
    try:
        # 整库复制一份再「退回旧结构」：只复制单表的话，它指向的外键在副本里
        # 找不到目标表，create_all 会以 NoReferencedTableError 直接崩掉。
        legacy = MetaData()
        for table in Base.metadata.tables.values():
            table.to_metadata(legacy)
        for table_name, columns in _RETIRED_COLUMNS.items():
            for column in columns:
                legacy.tables[table_name].append_column(
                    Column(column, String(64), nullable=False)
                )
        legacy.create_all(engine)

        ensure_schema(engine)

        problems: list[str] = []
        for table_name, columns in _RETIRED_COLUMNS.items():
            actual = {column["name"] for column in inspect(engine).get_columns(table_name)}
            expected = {column.name for column in Base.metadata.tables[table_name].columns}
            problems.extend(f"{table_name}.{name}" for name in columns if name in actual)
            if actual != expected:
                problems.append(f"{table_name}：列集合与 ORM 不一致 {sorted(actual ^ expected)}")
        check("退役列已从存量库删净（列集合与 ORM 一致）", not problems, str(problems))
    finally:
        engine.dispose()
        shutil.rmtree(workdir, ignore_errors=True)


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


def check_field_label_fit() -> None:
    """多列字段带里的字段名必须排得下一行，否则同一行的控件会高低不齐。

    实测过的错位：商品编辑器第一行「名称 / 商品码 / 类型」，中间那个字段名挂了
    一段 72px 宽的括号说明，折成两行后把它的输入框压低了 19px —— 三个输入框
    不在一条线上，截图一眼可见，但 DOM 正常、控制台静默、任何断言都不报错。

    布局是 ``repeat(auto-fit, minmax(186px, 1fr))``，列只会变宽不会变窄，所以
    「字段名在 186px 内排得下」就是它永不换行的充要条件（``--wide`` 表单是
    210px）。宽度按浏览器实测标定：全角 12.24px、半角 7px、空格 3.4px，
    再留 8px 余量。独占整行的 ``admin-grid__full`` / ``admin-grid__wide`` 不受此限。

    顺带钉住说明文字的位置：``.admin-field-hint`` **必须写在控件之后**。
    夹在字段名和控件之间，它同样会把控件顶下去，错位照旧——只是这次宽度检查
    查不出来，所以在这里一起管。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")

    def measure(text: str) -> float:
        width = 0.0
        for char in text:
            if char == " ":
                width += 3.4
            elif ord(char) > 0x2E80:  # 含全角标点
                width += 12.24
            else:
                width += 7.0
        return width

    forms = [
        (match.start(), 210 if "admin-grid--wide" in match.group(1) else 186)
        for match in re.finditer(r'<form\b[^>]*class="([^"]*\badmin-grid\b[^"]*)"', html)
    ]
    fields = list(
        re.finditer(
            r'<(?:label|div)\b[^>]*class="([^"]*\bhb-field\b[^"]*)"[^>]*>'
            r"\s*<span>([^<]{1,90})</span>",
            html,
        )
    )
    overflow: list[str] = []
    misplaced: list[str] = []
    for index, match in enumerate(fields):
        classes = match.group(1)
        label = match.group(2).strip()
        if "admin-grid__full" in classes or "admin-grid__wide" in classes:
            continue  # 独占整行，列宽由容器给，不存在被邻列挤到换行
        minimum = max(
            (width for start, width in forms if start < match.start()), default=186
        )
        width = measure(label)
        if width > minimum - 8:
            overflow.append(f"{label!r} 约 {width:.0f}px，{minimum}px 列排不下")

        # 该字段的作用域：到下一个字段为止，避免把邻字段的控件算进来
        end = fields[index + 1].start() if index + 1 < len(fields) else len(html)
        block = html[match.start():end]
        hint_at = block.find("admin-field-hint")
        control_at = min(
            (at for at in (
                block.find("<input"), block.find("<select"), block.find("<textarea"),
                block.find('class="feature-picker"'),
            ) if at != -1),
            default=-1,
        )
        if hint_at != -1 and control_at != -1 and hint_at < control_at:
            misplaced.append(label)

    check(
        "多列字段带的字段名排得下一行（换行会把同一行的控件顶错位）",
        not overflow,
        f"超宽: {overflow[:5]}" if overflow else f"共核对 {len(fields)} 个字段名",
    )
    check(
        "字段说明写在控件之后（写在字段名和控件之间同样顶错位）",
        not misplaced,
        f"位置不对: {misplaced[:5]}" if misplaced else "全部在控件之后",
    )


def check_stat_card_fit() -> None:
    """概览 KPI 卡的主数字必须是「一个量级 + 一行」。

    实测过的错位：积分负债卡把 ``1,039,400.5 可用 / 0 冻结`` 整串塞进主数字，
    194px 的卡里 25px 等宽字排了 3 行（浏览器实测 ``getClientRects().length`` =
    3），同一排的卡片全被撑高，数字自己也没了量级感。拆成「主数字给总额、
    拆解走 .stat__note」以后，用下面三条把结论钉住：

    1. 主数字的降档阈值必须真的排得下。卡宽下限 186px（``.stat-grid`` 的
       ``minmax(186px, 1fr)``）减左右内边距 = 154px；等宽字符按浏览器标定的
       0.61em/字符（实测 0.59–0.60，留余量）算，各档容量必须 ≥ 该档的字符数上界。
    2. 降档到最小一档也放不下时（例如十位数的积分余额）必须出省略号：少了
       ``text-overflow`` 就只剩 ``.stat`` 的 ``overflow: hidden`` 无声截断，
       看起来是一个「少了一位」的错数字。
    3. 积分负债的拆解不许再写回主数字（回归守卫）。

    数值来自接口，静态查不出真实长度，所以查的是「阈值与字号的标定关系」——
    改字号或改阈值任何一边，这里都会 FAIL。
    """
    css = (STORE_ROOT / "static" / "admin.css").read_text(encoding="utf-8")
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")

    misses: list[str] = []

    def px(pattern: str, label: str) -> float:
        match = re.search(pattern, css)
        if match is None:
            misses.append(label)
            return 0.0
        return float(match.group(1))

    column = px(r"\.stat-grid\s*\{[^}]*?minmax\(\s*(\d+)px", ".stat-grid 的列宽下限")
    pad = px(r"\n\.stat\s*\{[^}]*?padding:\s*[\d.]+px\s+([\d.]+)px", ".stat 的左右内边距")
    fonts = {"": px(r"\.stat__value\s*\{[^}]*?font-size:\s*([\d.]+)px", "主数字的基准字号")}
    thresholds: dict[str, int] = {}
    for length, tier in re.findall(r"if \(length > (\d+)\) return ' stat__value--(\w+)'", html):
        thresholds[tier] = int(length)
        fonts[tier] = px(
            # 不用 f-string：正则里的 {} 在 f-string 里要写成一堆 {{}}，拼接更好读
            r"\.stat \.stat__value--" + tier + r"\s*\{[^}]*?font-size:\s*([\d.]+)px",
            f".stat__value--{tier} 的字号",
        )
    if misses or len(thresholds) < 2:
        # 类名或写法被改过，标定关系已经无从核对：直接 FAIL 而不是崩在后面
        check("概览 KPI 卡主数字的降档标定可核对", False,
              f"读不到: {misses or list(thresholds)}")
        return

    usable = column - pad * 2

    # 各档负责的字符数区间：档位按「长度超过 N 就降到这一档」定义，所以 N+1 是本档起点。
    # 最长的一档不设上界，改按现实最长值核对 —— 金额「¥99,999,999.99」14 位、
    # 积分余额「1,039,400.5」11 位，16 位足够；再长的值由省略号兜底（下一条断言管）。
    LONGEST_REALISTIC = 16
    ladder = sorted(thresholds.items(), key=lambda item: item[1])
    bounds: list[tuple[str, int, int]] = [("", 1, ladder[0][1])]
    for index, (tier, threshold) in enumerate(ladder):
        upper = ladder[index + 1][1] if index + 1 < len(ladder) else max(LONGEST_REALISTIC, threshold + 1)
        bounds.append((tier, threshold + 1, upper))

    CHAR_EM = 0.61  # 等宽字符宽度 / 字号，浏览器实测 0.59–0.60，留一点余量
    capacity = {tier: int(usable / (CHAR_EM * fonts[tier])) for tier, _, _ in bounds}
    overflow = [
        f"{tier or '默认'}档 {fonts[tier]:.0f}px 一行 {capacity[tier]} 个字符，却要管 {low}–{high} 个"
        for tier, low, high in bounds
        if capacity[tier] < high
    ]
    check(
        "概览 KPI 卡的主数字排得下一行（降档阈值与字号必须对得上）",
        not overflow,
        f"排不下: {overflow}" if overflow else
        f"可用宽 {usable:.0f}px，" + "、".join(
            f"{tier or '默认'} {low}-{high} 字 @{fonts[tier]:.0f}px（放 {capacity[tier]}）"
            for tier, low, high in bounds
        ),
    )

    ellipsis_block = re.search(r"\.stat \.stat__value\s*\{([^}]*)\}", css)
    block = ellipsis_block.group(1) if ellipsis_block else ""
    missing = [
        prop for prop in ("white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis")
        if prop not in block
    ]
    check(
        "主数字放不下时出省略号（不能靠 overflow: hidden 无声截断）",
        not missing,
        f"缺: {missing}" if missing else "单行 + 省略号",
    )

    row = re.search(r"\['积分负债',\s*([^,]+),\s*`([^`]*)`", html)
    # 主数字只能是单个量（金额/积分数），「可用/冻结」这类拆解属于 note
    check(
        "积分负债卡：主数字只放总额，拆解写在 note",
        bool(row) and "可用" not in row.group(1) and "冻结" not in row.group(1)
        and "可用" in row.group(2) and "冻结" in row.group(2),
        f"主数字 {row.group(1).strip()!r} / note {row.group(2)!r}" if row else "找不到该行",
    )


def check_admin_dom_bindings() -> None:
    """后台脚本引用的元素 id，必须在模板里真实存在。

    分页改造给商品 / 订单 / 设备绑定补了筛选逻辑，却漏加了对应控件，于是顶层
    ``$('#order-reset').addEventListener(...)`` 拿到 ``None`` 抛 ``TypeError``，
    **整个内联脚本从这里往后全部不执行**：面板、登录、导航一起哑掉，页面停在登录态，
    控制台只有一条 null 错误。改 id 名字（「刷新」改成「查询」）会触发同样的雪崩。

    所以「脚本引用的 id ⊆ 模板定义的 id」必须是一条硬约束，而不是靠事后翻控制台。
    """
    templates_dir = STORE_ROOT / "templates"
    html = (templates_dir / "admin.html").read_text(encoding="utf-8")

    ids = set(re.findall(r'\bid="([\w-]+)"', html))
    referenced = set(re.findall(r"\$\('#([\w-]+)'\)", html))
    # bindFilters 的注册表写的是 ['#id', 'pager-key'] 形式，同样要核
    referenced |= set(re.findall(r"\['#([\w-]+)',", html))
    missing = sorted(referenced - ids)
    check(
        "admin.html 脚本引用的元素 id 都在模板里定义（漏一个即整段脚本失效）",
        not missing,
        f"缺失: {missing}" if missing else f"共核对 {len(referenced)} 个 id",
    )

    # 事件注册必须早于第一次拉列表：bootstrap() 里就直接读筛选控件的值
    call_at = html.find("bindPanelFilters();")
    boot_at = html.find("bootstrap().then(")
    check(
        "bindPanelFilters() 在 bootstrap() 之前调用",
        call_at != -1 and boot_at != -1 and call_at < boot_at,
        f"bindPanelFilters at {call_at} / bootstrap at {boot_at}",
    )

    # 功能码字段只能由 data-feature-picker 选择器托管：商品（多选）与权益新增 /
    # 改期（单选）三处都提交一个隐藏域。任何一处退回手写英文代码的输入框，都会
    # 重新引入「抄错一个字母 → 履约照发、客户端静默拦截」的隐性故障——
    # 而且退回之后界面上看不出异常，只有客户投诉「功能没生效」。隐藏域也不进
    # 浏览器 required 校验，所以「字段数 == 选择器数」必须由这条检查兜住。
    code_inputs = re.findall(r'<input[^>]*name="featureCodes?"[^>]*>', html)
    handwritten = [
        tag for tag in code_inputs
        if 'type="hidden"' not in tag or "data-feature-value" not in tag
    ]
    # 只数模板里的实例（data-feature-picker 在脚本的选择器字符串里也出现）
    pickers = len(re.findall(r'class="feature-picker"[^>]*data-feature-picker', html))
    check(
        "功能码字段全部由选择器托管（隐藏域提交，无手写输入框）",
        bool(code_inputs) and not handwritten and pickers == len(code_inputs),
        f"输入框 {len(code_inputs)} 个 / 选择器 {pickers} 个"
        + (f" / 手写输入框: {handwritten}" if handwritten else ""),
    )

    # 支付巡检的 health 判定在 Python、徽标文案在 JS：两边是同一份状态码的两个副本。
    # 后端加了新状态而前端没加文案，徽标会**静默退回** SWEEP_HEALTH 的兜底
    # （显示成「尚未启动」）——不报错、不难看，只是把「连续失败」说成了别的东西。
    # 这正是本次新增的那块卡片最不该出的错（它就是用来报警的），所以钉死。
    sweeper_source = (STORE_ROOT / "payments" / "sweeper.py").read_text(encoding="utf-8")
    backend_health = set(
        re.findall(r'^HEALTH_[A-Z_]+ = "([a-z]+)"', sweeper_source, re.MULTILINE)
    )
    block = re.search(r"const SWEEP_HEALTH = \{(.*?)\n\};", html, re.DOTALL)
    frontend_health = (
        set(re.findall(r"^\s{2}([a-z]+): \{", block.group(1), re.MULTILINE)) if block else set()
    )
    check(
        "巡检状态码在前后端一一对应（缺文案会静默显示成「尚未启动」）",
        bool(backend_health) and backend_health == frontend_health,
        f"后端 {sorted(backend_health)} / 前端 {sorted(frontend_health)}",
    )

    # 状态徽标的三个语气类必须真实存在。设计类名漏了不会报错，只是掉回无底色的
    # ``hb-tag``——「正常」与「连续失败」看上去一模一样，报警就白做了。
    theme_css = (STORE_ROOT / "static" / "theme.css").read_text(encoding="utf-8")
    tag_tones = {"hb-tag--success", "hb-tag--warning", "hb-tag--danger"}
    tag_tone_css = (STORE_ROOT / "static" / "admin.css").read_text(encoding="utf-8")
    missing_tones = sorted(
        tone for tone in tag_tones
        if f".{tone}" not in theme_css and f".{tone}" not in tag_tone_css
    )
    check(
        "巡检徽标用到的 hb-tag 语气类都在 CSS 里定义",
        not missing_tones,
        f"缺失: {missing_tones}" if missing_tones else f"共核对 {len(tag_tones)} 个类",
    )


def check_admin_console_resilience() -> None:
    """后台脚本里那些「出错时界面看不出异常」的地方。

    这一组断言盯的都不是功能缺失，而是**失败被伪装成别的状态**：

    1. 把「数据加载失败」当成「未登录」：运营会反复重输密码，而后端挂了这件事
       没有任何出口；登录动作成功但数据没拉到时还照样提示「已登录后台」，比
       不提示更糟 —— 他会在空列表上操作。
    2. 站点配置读不到时表单是空的，此时保存等于用一次读取失败把支付渠道清空、
       把「启用支付」关掉，而界面显示「保存成功」。所以必须有一道显式闸门。
    3. 清理弹窗只有「取消」按钮这条路会 resolve：按 Esc 关闭时等待方永远挂着。
    4. 调账弹窗在发请求**之前**就关窗清 resolver，接口一失败输入就没了。
    5. 分页/筛选的乱序响应覆盖新数据，表现为「筛选偶尔没生效」。
    6. 死按钮（有 id、无监听）与永远不会执行的分支。

    这些都是「点下去也有反应，只是反应错了」的类型，静态检查是唯一能在
    不改数据的情况下把它们钉住的手段。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")

    check(
        "bootstrap 区分「未登录」与「加载失败」（后者不能静默退回登录页）",
        "async function resolveAdminSession()" in html
        and "showLogin(error.message)" in html
        and "Promise.allSettled" in html,
        "resolveAdminSession + 带原因的 showLogin + allSettled",
    )
    # 反方向的一类：把**正常状态**伪装成故障。服务端 /auth/me 在无会话时返回
    # 401「请先登录。」；若无条件包装成「无法确认登录状态：…」交给 showLogin()，
    # 每个未登录的访客一打开 /admin 就先看到一条红框报错，而不是一张干净的登录页。
    # 但也不能反过来把 401 和 5xx 一起吞掉 —— 那会让「后端挂了」变成「你没登录」。
    check(
        "401（未登录）按正常状态处理：不弹登录页报错",
        re.search(r"if \(error\.status === 401\) \{?\s*\n?\s*return null", html) is not None
        and html.count("error.status === 401") >= 2,
        f"命中 {html.count('error.status === 401')} 处 401 分支（/auth/me 与 /overview 各一处）",
    )
    check(
        "错误对象带上 HTTP 状态码（否则调用方只能靠文案猜，改文案即失效）",
        "function httpError(response, data)" in html and "error.status = response.status" in html,
        "httpError 会写入 response.status",
    )
    check(
        "非 401 的故障仍然照实报出来（5xx / 断网不能静默退回登录页）",
        "无法确认登录状态：${error.message}" in html,
        "保留带原因的兜底抛出",
    )
    check(
        "登录成功后按实际加载结果提示（不再无条件说「已登录后台」）",
        "announce" in html and "toast('已登录后台')" in html and "failed.length" in html,
        "按 failed 计数分流",
    )
    check(
        "未确认登录态时不去加载面板（否则登录页会被一串 401 的失败提示淹掉）",
        re.search(r"bootstrap\(\)\.then\(loggedIn => \{\s*\n\s*if \(loggedIn && loaders\[initial\.page\]\)", html)
        is not None,
        "初次 activate 以 bootstrap 的返回值为准",
    )

    # —— 站点配置的保存闸门 ——
    check(
        "站点配置有「读到了吗」闸门：读失败时禁止保存",
        "function setSettingsLoadState(" in html
        and "state.settingsLoaded = phase === 'ready'" in html
        and "if (!state.settingsLoaded)" in html,
        "setSettingsLoadState + 提交处二次校验",
    )
    check(
        "站点配置读取失败时会说明原因（而不是留一个空表单）",
        "setSettingsLoadState('error', error.message)" in html
        and "settings-load-status" in html,
        "错误写入状态芯片并抛出",
    )

    # —— 接口错误的人话化 ——
    # 收口改到了 httpError：两个请求函数（api / storeApi）都要走它，它内部把结构化
    # detail 压成人话并带上状态码。所以断言要盯「两处都调了 httpError」，而不是盯
    # 某一行字面量出现的次数 —— 后者会被一次正常重构改坏（这条断言本身就这么坏过一次）。
    check(
        "422 的结构化 detail 会被压成可读文案（否则 toast 是 [object Object]）",
        "function describeApiError(" in html
        and "describeApiError(data && data.detail)" in html
        and html.count("throw httpError(response, data)") >= 2,
        f"describeApiError 收口在 httpError；非 ok 响应走 httpError 的有 "
        f"{html.count('throw httpError(response, data)')} 处（api + storeApi）",
    )

    # —— 弹窗生命周期 ——
    check(
        "清理弹窗在 close 事件里收口（Esc 关闭不再让 await 永远挂着）",
        "purgeDialog.addEventListener('close'" in html,
        "有 close 监听" if "purgeDialog.addEventListener('close'" in html else "缺 close 监听",
    )
    adjust_block = re.search(r"\$\('#adjust-ok'\)\.addEventListener.*?\n\}\);", html, re.DOTALL)
    adjust_body = adjust_block.group(0) if adjust_block else ""
    # 找的是语句本身（带分号）：注释里也会出现 settleAdjust(null) 这个词
    api_at = adjust_body.find("await api(")
    settle_at = adjust_body.find("settleAdjust(null);")
    check(
        "调账成功后才关窗（失败时保留刚填的金额与备注）",
        bool(adjust_body) and api_at != -1 and settle_at > api_at,
        f"api at {api_at} / settleAdjust at {settle_at}",
    )

    # —— 在途请求的竞态守卫 ——
    check(
        "分页/筛选有请求序号守卫（旧响应不覆盖新数据）",
        "const latestRequest = {}" in html
        and "if (seq !== cursor.seq) return null;" in html
        and "while (latestRequest[key] && latestRequest[key].seq !== entry.seq)" in html,
        "序号 + 以最新一次为准",
    )

    # —— 死按钮与死分支 ——
    for button_id in ("coupon-refresh", "release-refresh"):
        check(
            f"#{button_id} 已接线（有 id 无监听的按钮点下去毫无反应）",
            f"$('#{button_id}').addEventListener" in html,
            "已有监听" if f"$('#{button_id}').addEventListener" in html else "缺少监听",
        )
    dead_branch_leftovers = [
        token
        for token in ('data-account-off="', 'data-account-on="', "dataset.accountOff", "dataset.accountOn")
        if token in html
    ]
    check(
        "已删除的账号停用/启用死分支不再出现（模板里没有 data-account-off）",
        not dead_branch_leftovers,
        f"残留: {dead_branch_leftovers}" if dead_branch_leftovers else "无残留",
    )
    state_block = re.search(r"const state = \{(.*?)\n\};", html, re.DOTALL)
    state_body = state_block.group(1) if state_block else ""
    check(
        "state 里没有只写不读的槽位",
        bool(state_body)
        and "orders:" not in state_body
        and "withdrawals:" not in state_body
        and "bindings:" not in state_body
        and "ledger:" not in state_body
        and "account:" not in state_body,
        ", ".join(
            slot for slot in ("orders:", "withdrawals:", "bindings:", "ledger:", "account:")
            if slot in state_body
        ) or "已是精简集合",
    )

    # —— 清理天数必须是整数（小数会被 FastAPI 拦成英文 422） ——
    check(
        "审计清理与诊断清理都要求整数天（3.5 天会触发英文 422）",
        html.count("Number.isInteger(days)") >= 2,
        f"出现 {html.count('Number.isInteger(days)')} 处",
    )

    # —— 状态文案必须与后端逐一对应 ——
    # 前端缺一个 key 不会报错，只会把 snake_case 原样显示在徽标里
    # （``partially_refunded`` 就是这么漏出去的）；漏斗同理，缺色相就退回域色，
    # 看不出「这一条是终态」。
    labels_block = re.search(r"const ORDER_STATUS = \{(.*?)\n\};", html, re.DOTALL)
    hues_block = re.search(r"const STATUS_HUES = \{(.*?)\n\};", html, re.DOTALL)
    labels = set(re.findall(r"(\w+):", labels_block.group(1))) if labels_block else set()
    hues = set(re.findall(r"(\w+):", hues_block.group(1))) if hues_block else set()
    expected = set(ORDER_STATUS_LABELS)
    check(
        "订单状态的文案与色相映射覆盖后端全部状态码",
        labels == expected and hues == expected,
        f"后端 {len(expected)} 个 / 文案缺 {sorted(expected - labels)} / 色相缺 {sorted(expected - hues)}",
    )


def check_admin_tab_bindings() -> None:
    """后台标签页（tab）的静态契约。

    后台把 15 个面板里的 10 个按「列表 / 表单 / …」拆成了 tab。这类重构的特点是
    **改错了界面也不报错**，只是有一块内容从此再也点不出来：

    1. ``[data-tab]`` 写了、对应的 ``[data-tab-pane]`` 忘了写（或 key 拼错一个字母）：
       那个标签点下去是**一整片空白**，而且因为没有异常，控制台也干干净净。
    2. 反过来，pane 的 key 没登记进标签条：内容永远 hidden，等于功能下线。
    3. ``data-domain`` 拼错（``licensing`` → ``license``）：CSS 里没有这条映射，
       整块静默退回默认琥珀，五色编码当场失效，而页面上看不出「错」。
    4. 面板与侧栏分组的域色必须一致 —— 导航把「订单」染成琥珀、点进去面板却是青的，
       会让人怀疑自己点错了菜单。
    5. 编辑器回到 ``.hidden = false`` 的老写法：表单在 DOM 里可见了，但用户停在
       列表 tab 上就是看不到，表现为「点编辑没反应」。所以显隐必须走
       showEditor / hideEditor。

    浏览器逐页点一遍当然能发现，但那需要人工、而且只在有人真的去点的时候才发生。
    这里是同一份契约的静态版本，改坏立刻 FAIL。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    css = (STORE_ROOT / "static" / "admin.css").read_text(encoding="utf-8")

    # —— 面板切分：每片从 <section> 开头切到它自己的 </section> ——
    # 不能切到「下一个面板开头」：最后一个面板会一路吃到 <script>，
    # 把 JS 注释里的 [data-tab-pane="key"] 当成真面板的 pane（假 FAIL）。
    marks = list(
        re.finditer(
            r'<section class="admin-panel[^"]*" id="panel-([\w-]+)" data-domain="([\w-]+)">',
            html,
        )
    )
    panels: dict[str, dict[str, object]] = {}
    for mark in marks:
        close = html.find("\n    </section>", mark.end())
        body = html[mark.end(): close if close != -1 else len(html)]
        panels[mark.group(1)] = {
            "domain": mark.group(2),
            "tabs": re.findall(r'data-tab="([\w-]+)"', body),
            "panes": re.findall(r'data-tab-pane="([\w-]+)"', body),
            "strips": body.count("data-tab-strip"),
        }

    check(
        "每个 admin-panel 都声明了 data-domain（域色编码靠它，漏一个就退回琥珀）",
        len(panels) == 15 and all(p["domain"] for p in panels.values()),
        f"解析到 {len(panels)} 个面板",
    )

    # 标签条与内容必须一一对上：方向 A 防「点了空白」，方向 B 防「内容永远看不到」
    orphans = sorted(
        f"{page}:{key}" for page, p in panels.items()
        for key in set(p["panes"]) - set(p["tabs"])
    )
    empty_tabs = sorted(
        f"{page}:{key}" for page, p in panels.items()
        for key in set(p["tabs"]) - set(p["panes"])
    )
    check(
        "每个 tab 都有内容、每块内容都登记进了标签条（两个方向都要对）",
        not orphans and not empty_tabs,
        (f"无主的 pane: {orphans} / 空标签: {empty_tabs}") if (orphans or empty_tabs)
        else f"共核对 {sum(len(set(p['tabs'])) for p in panels.values())} 个 tab",
    )

    # 一个面板只能有一个标签条：collectTabs 只取第一个 [data-tab-strip]，
    # 出现第二个的话它下面的 tab 永远不会被初始化（点了也没反应）。
    multi = sorted(page for page, p in panels.items() if p["strips"] > 1)
    check(
        "每个面板最多一个标签条（collectTabs 只认第一个，第二个等于死的）",
        not multi,
        f"多标签条: {multi}" if multi else "无",
    )

    # 重复的 tab key 会让 setTab 只能命中最前面那个（同一 key 的多 pane 是允许的，
    # 但按钮只会有一个）
    dup = sorted(
        f"{page}:{key}" for page, p in panels.items()
        for key in set(p["tabs"]) if p["tabs"].count(key) > 1
    )
    check("同一个面板里 tab 按钮不重复", not dup, f"重复: {dup}" if dup else "无重复")

    tabbed = sorted(page for page, p in panels.items() if p["tabs"])
    check(
        "至少 10 个面板已按清单拆出 tab（回退成单页会在这里露出来）",
        len(tabbed) >= 10,
        f"{len(tabbed)} 个面板有 tab: {tabbed}",
    )

    # —— 域色映射：标记里的每个 domain 都必须在 CSS 里有规则，否则静默退回默认色 ——
    nav_at = html.find('<nav class="admin-nav"')
    nav_end = html.find("</nav>", nav_at)
    nav_html = html[nav_at: nav_end] if nav_at != -1 and nav_end != -1 else ""
    nav_groups = re.findall(r'data-nav-group="([\w-]+)" data-domain="([\w-]+)"', nav_html)
    declared = {str(p["domain"]) for p in panels.values()} | {domain for _, domain in nav_groups}
    styled = set(re.findall(r'\[data-domain="([\w-]+)"\]', css))
    missing = sorted(declared - styled)
    check(
        "data-domain 的取值都在 admin.css 里有色相映射（拼错会静默退回琥珀）",
        not missing,
        f"缺映射: {missing}" if missing else f"共核对 {sorted(declared)}",
    )
    unpainted = sorted(
        domain for domain in styled
        if not re.search(
            r'\[data-domain="%s"\][^{]*\{[^}]*--a-tint-h' % re.escape(domain), css
        )
    )
    check(
        "每条域色规则都真的给了 --a-tint-h（只写选择器不写色相等于没写）",
        not unpainted,
        f"未设色相: {unpainted}" if unpainted else "均已声明色相",
    )

    # —— 面板域色必须与它所在侧栏分组的域色一致 ——
    group_of: dict[str, str] = {}
    group_marks = list(re.finditer(r'data-nav-group="([\w-]+)" data-domain="([\w-]+)"', nav_html))
    for index, mark in enumerate(group_marks):
        end = group_marks[index + 1].start() if index + 1 < len(group_marks) else len(nav_html)
        for page in re.findall(r'data-admin-page="([\w-]+)"', nav_html[mark.end():end]):
            group_of[page] = mark.group(2)
    mismatched = sorted(
        f"{page}: 面板 {panels[page]['domain']} ≠ 分组 {group_of[page]}"
        for page in panels
        if page in group_of and group_of[page] != panels[page]["domain"]
    )
    check(
        "面板域色与侧栏分组域色一致（导航与内容不同色会让人以为点错了菜单）",
        len(group_of) == len(panels) and not mismatched,
        f"导航覆盖 {len(group_of)}/{len(panels)} 个面板"
        + (f" / 不一致: {mismatched}" if mismatched else ""),
    )

    # —— tab 控制器本身 ——
    for symbol in ("collectTabs", "setTab", "revealTabFor", "showEditor", "hideEditor", "parseHash"):
        check(
            f"tab 控制器 {symbol}() 存在（标记里有 tab，但没人切就等于没有）",
            f"function {symbol}(" in html,
        )
    check(
        "tab 用 hidden 属性切显隐并同步 aria-selected / roving tabindex",
        "pane.hidden = !on" in html
        and 'aria-selected' in html
        and "item.button.tabIndex = on ? 0 : -1" in html,
    )
    check(
        "深链支持 #page/tab（parseHash 按 / 拆分，且同面板内换 tab 不重拉数据）",
        "function parseHash()" in html
        and "location.hash || '').replace(/^#/, '').split('/')" in html
        and re.search(r"setTab\(page, tab, \{ push: true \}\);", html) is not None,
    )

    # 编辑器显隐必须走 showEditor / hideEditor：直接写 .hidden 会让表单「可见但不在
    # 当前 tab 上」，从用户视角就是「点了没反应」。
    writes = re.findall(r"\$\('#([\w-]+)'\)\.hidden = (?:true|false)", html)
    editor_writes = sorted(name for name in writes if name.endswith("-editor"))
    check(
        "编辑器显隐全部走 showEditor/hideEditor（直接写 .hidden 会切不到表单所在 tab）",
        not editor_writes,
        f"直接赋值: {editor_writes}" if editor_writes else "无直接赋值",
    )
    check(
        "showEditor 会顺带切到表单所在的 tab",
        re.search(
            r"function showEditor\(selector\) \{.*?revealTabFor\(node\);", html, re.DOTALL
        ) is not None,
    )

    # 「按需出现」的表单 tab 靠 id 后缀 ``-editor`` 认出来（collectTabs 里
    # `[id$="-editor"]`）。把编辑器改个名字不会报错，后果是那个 tab 永远留在
    # 标签条上、点下去一片空白 —— 所以这里把识别标记钉住：编辑器必须在某个
    # [data-tab-pane] 里面（按 key 切块后能落到某一块里），且一个都不能少。
    chunks: list[str] = []
    for mark in marks:
        close = html.find("\n    </section>", mark.end())
        body = html[mark.end(): close if close != -1 else len(html)]
        parts = re.split(r'data-tab-pane="[\w-]+"', body)
        chunks.extend(parts[1:])
    editor_ids = re.findall(r'\bid="([\w-]+-editor)"', html)
    stray = sorted(name for name in editor_ids if not any(f'id="{name}"' in chunk for chunk in chunks))
    check(
        "每个编辑器都在 admin-tab-pane 里（按需 tab 靠 -editor 后缀识别，改名会让空表单页常驻）",
        len(editor_ids) >= 8 and not stray,
        f"{len(editor_ids)} 个编辑器"
        + (f" / 不在 tab pane 里: {stray}" if stray else f": {sorted(editor_ids)}"),
    )


def check_admin_grid_tab_layout() -> None:
    """表单栅格里的标签条与 pane 必须独占整行，且 pane 内再排一遍同样的网格。

    站点配置是**唯一**把标签条与 pane 放进 ``<form class="admin-grid …">`` 的面板
    （模板注释里写了为什么必须留在 form 内：字段列宽是按 form 的 210px 推的）。
    在 grid 里这两者都成了网格项，于是缺了 CSS 就会是：

      · 标签条被压进第一列（218px），五个标签挤到要横滑；
      · 整个 pane 只占第二列（218px），里面的字段一列到底。

    页面上看着像「布局乱成一团」，而 DOM 合法、控制台无话、所有既有断言通过 ——
    正是必须写死一条断言的那类回归。

    另外两条同样是静默的：

      · pane 内的字段列宽下限必须**与所在 form 同一个口径**，否则字段的换行点
        与邻居不同（``check_field_label_fit`` 是按 form 的下限算的，两边不一致时
        它还照样 PASS）。
      · 给 pane 写 ``display`` 的规则必须带 ``:not([hidden])``：本文件里
        ``.admin-tab-pane[hidden] { display: none }`` 的优先级与它完全相同，胜负
        只看源码顺序 —— 晚写的 ``display: grid`` 会让五个 pane 的字段同时铺出来。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    css = (STORE_ROOT / "static" / "admin.css").read_text(encoding="utf-8")

    def rules_of(text: str) -> list[tuple[str, str]]:
        """把样式表拆成 (选择器, 声明块) —— 选择器与声明都压成单行便于比对。

        先去掉注释：注释紧贴规则时会被 ``[^{}]+`` 一起吃进选择器，
        于是 ``sel == ".admin-grid > .admin-tabs"`` 这类精确比对全部落空。
        """
        stripped = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
        return [
            (re.sub(r"\s+", " ", sel).strip(), re.sub(r"\s+", " ", body).strip())
            for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", stripped)
            if "@" not in sel
        ]

    rules = rules_of(css)

    def floor_of(selector: str) -> str:
        """取某个栅格规则的列宽下限（``repeat(auto-fit, minmax(NNNpx, 1fr))``）。"""
        for sel, body in rules:
            if sel == selector:
                match = re.search(r"minmax\((\d+)px, 1fr\)", body)
                if match:
                    return match.group(1)
        return ""

    # —— 找出「pane 落在栅格表单里」的那些 form ——
    gridded: list[tuple[str, int]] = []
    for match in re.finditer(
        r'<form\b[^>]*id="([\w-]+)"[^>]*class="([^"]*\badmin-grid\b[^"]*)"', html
    ):
        close = html.find("</form>", match.end())
        body = html[match.end(): close if close != -1 else len(html)]
        if "admin-tab-pane" not in body:
            continue
        floor = floor_of(".admin-grid--wide") if "admin-grid--wide" in match.group(2) else floor_of(".admin-grid")
        gridded.append((match.group(1), int(floor or 0)))

    check(
        "站点配置的标签条与 pane 在表单栅格里独占整行（缺了这条标签条会被压进第一列）",
        bool(gridded)
        and any(
            sel.split(",")[0].strip() == ".admin-grid > .admin-tabs"
            and "grid-column: 1 / -1" in body
            for sel, body in rules
        )
        and any(
            ".admin-grid > .admin-tab-pane" in sel and "grid-column: 1 / -1" in body
            for sel, body in rules
        ),
        f"含 pane 的栅格表单: {gridded}",
    )

    # pane 自己那一层的列宽下限必须与 form 同口径（否则字段换行点不一致）
    mismatched = [
        f"{name}:{floor}px"
        for name, floor in gridded
        if not any(
            ".admin-tab-pane" in sel and f"minmax({floor}px, 1fr)" in body
            for sel, body in rules
        )
    ]
    check(
        "pane 内字段的列宽下限与所在 form 一致（不一致时字段换行点与邻居不同）",
        not mismatched,
        f"对不上: {mismatched}" if mismatched else str(gridded),
    )

    # 给 pane 写 display 的规则必须避开 [hidden]（优先级相同，靠源码顺序定胜负）
    unguarded = sorted(
        sel
        for sel, body in rules
        if ".admin-tab-pane" in sel
        and re.search(r"(?<![\w-])display\s*:", body)
        and ":not([hidden])" not in sel
        and "[hidden]" not in sel
    )
    check(
        "给 pane 写 display 的规则都避开了 [hidden]（否则隐藏的 pane 会被一起显示）",
        not unguarded,
        f"缺 :not([hidden]): {unguarded}" if unguarded else "均已收口",
    )


def check_admin_inline_script_parses() -> None:
    """admin.html 的内联脚本必须能通过语法检查。

    这一条是**事故复盘**加上的：给 tab 控制器加函数时，粘贴进来的片段里混进了
    ``  2090|`` 这样的行号前缀（从带行号的代码视图里复制的结果）。整段内联脚本
    因此解析失败，浏览器里**什么都不执行**——登录按钮点了没反应、面板一块都不显示、
    控制台只有一条语法错误。而所有静态断言照样通过：元素 id 都在、函数名都在
    （语法错误的文件里文本仍然存在），连 HTML 都是完好的。

    「整段脚本静默失效」是后台最严重的一类故障，必须有一条真正解析一遍的检查。
    优先用 ``node --check``（与浏览器同一个引擎家族的解析器）；没有 node 时退化为
    行号前缀的静态检查，至少能拦住这次的真实成因。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")

    # 无 node 也能跑的兜底：正文里不该出现「数字 + 竖线」的行首（行号前缀）
    artifacts = [
        line.strip()
        for line in html.splitlines()
        if re.match(r"^\s{1,8}\d+\|", line)
    ]
    check(
        "模板正文里没有行号前缀残留（`  1234|` 会让整段内联脚本语法错误）",
        not artifacts,
        f"残留 {len(artifacts)} 处: {artifacts[:3]}" if artifacts else "无残留",
    )

    inline = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.DOTALL)
    check(
        "admin.html 有且只有一段内联脚本（拆成多段会踩到暂时性死区）",
        len(inline) == 1,
        f"内联脚本 {len(inline)} 段",
    )
    if not inline:
        return

    node = shutil.which("node")
    if node is None:
        check("跳过 node --check（环境里没有 node，仅做了行号残留检查）", True, "node 不可用")
        return
    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "admin-inline.js"
        script.write_text(inline[0], encoding="utf-8")
        proc = subprocess.run(
            [node, "--check", str(script)], capture_output=True, text=True, timeout=60
        )
    detail = (proc.stderr or proc.stdout).strip().splitlines()
    check(
        "admin.html 内联脚本通过 node --check（解析失败等于整个后台静默失效）",
        proc.returncode == 0,
        "语法通过" if proc.returncode == 0 else " / ".join(detail[:3]),
    )


def check_admin_login_no_prefill() -> None:
    """后台登录页必须是**空白**表单，且不邀请浏览器/密码管理器替我们填。

    背景：``/admin`` 的输入框以前写的是 ``autocomplete="username"`` /
    ``"current-password"`` —— 这两个值本身就是给密码管理器的「请填这里」的信号
    （它们正是「登录表单」的标准语义）。在一台被借用过的机器上打开后台，账号与
    密码已经填好，点一下「登录后台」就进去了，等于把最高权限的入口白送出去。

    三处一起守，缺一处都可能漏：
      1. 模板里没有任何写死的 ``value``（服务端也不注入默认账号）；
      2. 属性层压住自动填充（表单 ``autocomplete="off"``、密码框 ``new-password``
         ——Chrome/Safari 对 password 字段会忽略 ``off``——以及 LastPass / 1Password
         / Bitwarden 各自的忽略标记，这些扩展不看 ``autocomplete``）；
      3. 脚本里保留「加载后清空」的兜底：部分浏览器与扩展是在 ``DOMContentLoaded``
         之后才灌值的，属性层拦不住。
    """
    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")

    # 只截登录表单这一段：后台里还有别的 email / password 输入框（账号编辑、邮箱
    # 测试、支付宝密钥），拿整份模板去找属性会张冠李戴。
    match = re.search(r'<form id="admin-login-form".*?</form>', html, re.DOTALL)
    if not check(
        "admin.html 里能找到登录表单 form#admin-login-form",
        match is not None,
        "未找到" if match is None else "已定位",
    ):
        return
    form = match.group(0)

    # 1. 不许有写死的值
    hardcoded = re.findall(r'<input\b[^>]*\bvalue="([^"]*)"', form)
    check(
        "登录表单里没有写死的默认账号/口令（value 属性）",
        not hardcoded,
        f"发现写死的 value: {hardcoded}" if hardcoded else "无",
    )

    # 2. 属性层：表单关掉自动填充
    form_off = re.search(r'<form id="admin-login-form"[^>]*\bautocomplete="off"', form) is not None
    check(
        '登录表单声明 autocomplete="off"',
        form_off,
        "已声明" if form_off else 'form 上没有 autocomplete="off"',
    )

    # 3. 属性层：两个输入框各自的写法。不用「邀请填充」的那两个值。
    email_tag = re.search(r'<input\b[^>]*\bname="email"[^>]*>', form)
    password_tag = re.search(r'<input\b[^>]*\bname="password"[^>]*>', form)
    if not check(
        "登录表单的 email / password 输入框都还在",
        email_tag is not None and password_tag is not None,
        "" if email_tag is not None and password_tag is not None else "少了输入框",
    ):
        return
    email_html, password_html = email_tag.group(0), password_tag.group(0)

    inviting = [
        value
        for value in ('autocomplete="username"', 'autocomplete="current-password"')
        if value in email_html or value in password_html
    ]
    check(
        "登录框不再用 username / current-password（那是邀请密码管理器填充的信号）",
        not inviting,
        f"仍有: {inviting}" if inviting else "无",
    )
    password_new = 'autocomplete="new-password"' in password_html
    check(
        '密码框用 autocomplete="new-password"（password 字段会忽略 "off"）',
        password_new,
        "已使用" if password_new else f'password 框写成: {password_html}',
    )
    lp_ignored = all('data-lpignore="true"' in tag for tag in (email_html, password_html))
    check(
        "两个输入框都带扩展忽略标记（data-lpignore，1Password/Bitwarden 同样）",
        lp_ignored,
        "均已带" if lp_ignored else f"email={email_html} password={password_html}",
    )

    # 4. 脚本兜底：加载后清空，并且在用户自己动过表单之后停手
    has_clear = (
        "function clearAutofilledLogin" in html
        and "window.addEventListener('pageshow', clearAutofilledLogin)" in html
    )
    check(
        "脚本里有加载后清空自动填充的兜底（clearAutofilledLogin）",
        has_clear,
        "已定义并在 pageshow 上调用" if has_clear else "缺少 clearAutofilledLogin 或它的 pageshow 调用",
    )
    has_touched = "loginFormTouched = true" in html
    check(
        "清空逻辑在用户交互后停手（不抹掉正在输入的内容）",
        has_touched,
        "有交互标记" if has_touched else "缺少 loginFormTouched 交互标记",
    )


def check_account_meta_chip_tokens() -> None:
    """账号中心芯片：变体必须写在 theme.css 里，且 store.js 必须带上语义类。

    芯片配色是「状态一眼可辨」的唯一载体：有效=绿、到期=琥珀、停用=红、永久=琥珀强调。
    如果 store.js 不再输出 ``hb-meta-chip--*``，或 theme.css 里的变体被改回单类名
    （会被外层容器里任何 ``.xxx span`` 这类（0,1,1）规则压掉），颜色就静默退回中性灰——
    功能上没问题，但用户看到的「状态」就没了。
    """
    static_dir = STORE_ROOT / "static"
    theme_css = (static_dir / "theme.css").read_text(encoding="utf-8")
    store_js = (static_dir / "store.js").read_text(encoding="utf-8")

    for variant in ("success", "warning", "danger", "accent"):
        # 复合类名才压得过外层容器里的 `.xxx span`（0,1,1）规则
        compound = f".hb-meta-chip.hb-meta-chip--{variant}"
        found = compound in theme_css
        check(
            f"芯片变体 {compound} 为复合选择器（可压过外层容器的 span 规则）",
            found,
            f"找到 {compound}" if found else "theme.css 里未找到该复合选择器，颜色会被外层 span 规则吃掉",
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


def is_confirmed_revocation(*, body: dict | None = None) -> bool:
    """与客户端 ``LicenseClientError.is_confirmed_revocation`` 对齐：只认结构化 code/revoked。"""
    if not body:
        return False
    code = body.get("code")
    if isinstance(code, str) and code.strip() in {"REVOKED", "LICENSE_REVOKED"}:
        return True
    return body.get("revoked") is True


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

    content = "out_trade_no=HOMEOS-1&total_amount=49.90&trade_status=TRADE_SUCCESS"
    signature = alipay_module.sign_params(
        {"out_trade_no": "HOMEOS-1", "total_amount": "49.90", "trade_status": "TRADE_SUCCESS"},
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


def check_alipay_sign_type_guard() -> None:
    """``sign_type`` 只能是 RSA2。

    签名实现写死了 SHA256withRSA（也就是支付宝说的 RSA2），而 ``sign_type`` 是
    可以配的：配成 ``RSA`` 时请求会**声明** RSA、签名却是 RSA2 的 —— 网关按 SHA1
    去验一份 SHA256 签名，只回一句笼统的「验签失败」。这种配置错误的代价是
    「每一笔支付都失败」而报错里看不出原因，所以必须在下单前就拒绝。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-sign-type-"))
    keys = _alipay_test_keys(workdir)
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        alipay_app_id="2021000000000000",
        alipay_app_private_key_path=str(keys["app_private"]),
        alipay_public_key_path=str(keys["alipay_public"]),
    )
    provider = alipay_module.AlipayProvider()
    # 直接用私有方法：``_assert_configured`` 是「能不能下单」的统一闸门，
    # 走 query_payment/precreate 会真的去连网关（既慢又会因无公网回调而失败）。
    outcome: dict[str, str | None] = {}
    for sign_type in ("RSA2", "rsa2", "RSA", "RSA3"):
        try:
            provider._assert_configured(replace(settings, alipay_sign_type=sign_type))
            outcome[sign_type] = None
        except alipay_module.PaymentError as error:
            outcome[sign_type] = str(error)
    check(
        "sign_type=RSA2 放行（大小写不敏感）",
        outcome["RSA2"] is None and outcome["rsa2"] is None,
        str(outcome),
    )
    check(
        "sign_type 非 RSA2 立即报错并指出该怎么改",
        (outcome["RSA"] or "").startswith("STORE_ALIPAY_SIGN_TYPE=RSA")
        and "RSA2" in (outcome["RSA"] or "")
        and (outcome["RSA3"] or "").startswith("STORE_ALIPAY_SIGN_TYPE=RSA3"),
        str(outcome),
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
                order_no=f"HOMEOS-ALIPAY-{utcnow().strftime('%H%M%S%f')}",
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

        # —— app_id / seller_id：通知「属于哪个商户」的判据 ——
        # 现实部署里这两项常常只填在后台（环境变量为空）。此时必须拿 provider
        # **合并后**的凭据去比：用 app.state.settings 那份（只有环境变量）会命中
        # 「非空才比较」的短路，整段校验被静默跳过 —— 任何人只要签名合法就能把
        # 通知推进来；反过来，环境变量与后台不一致时又会把正常通知全部拒掉。
        with app.state.database.session() as session:
            site_config.update_setting(session, alipay_seller_id="2088000000000000")

        def _notify_with_seller(out_trade_no: str, seller_id: str):
            fields = _fields(out_trade_no)
            fields["seller_id"] = seller_id
            return _sign_notify(fields, alipay_private)

        # 反例在前：seller_id 不符必须拒，且不能入账
        mismatched = await client.post(
            notify_url, data=_notify_with_seller(tampered_order, "2088999999999999")
        )
        check(
            "seller_id 与后台配置不符的通知被拒绝",
            mismatched.status_code == 200 and mismatched.text.strip() == "failure",
            f"{mismatched.status_code} {mismatched.text!r}",
        )
        with app.state.database.session() as session:
            order = session.scalars(
                select(Order).where(Order.order_no == tampered_order)
            ).first()
            check("seller_id 不符的订单没有被入账", order.status == "pending", str(order.status))

        # 正例：同一笔订单、同样的签名，只把 seller_id 换回后台配置的那个 —— 必须通过
        matched = await client.post(
            notify_url, data=_notify_with_seller(tampered_order, "2088000000000000")
        )
        check(
            "seller_id 与后台配置一致时通知通过（凭据按合并后的口径比较）",
            matched.status_code == 200 and matched.text.strip() == "success",
            f"{matched.status_code} {matched.text!r}",
        )
        with app.state.database.session() as session:
            order = session.scalars(
                select(Order).where(Order.order_no == tampered_order)
            ).first()
            check("校验通过后订单正常入账", order.status == "fulfilled", str(order.status))

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


class _SweepLogCatcher(logging.Handler):
    """抓巡检自己的日志。

    ``sweep_once`` 唯一的分支就在日志语句上（``if result.queried: logger.info(...)``），
    而 ``logger.info`` 的格式化错误会被 logging 自己吞掉——只往 stderr 打一行
    ``--- Logging error ---``，异常不往外抛。所以这里必须自己 ``getMessage()``，
    否则「%d 个数与参数个数对不上」这类错误在自检里同样是隐形的。
    """

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.messages.append(record.getMessage())
        except Exception as error:  # noqa: BLE001 - 格式化失败本身就是被测对象
            self.messages.append(f"<日志格式化失败: {error}>")


def check_payment_sweep_flow() -> None:
    """后台支付巡检必须真的跑得完一轮。

    这条检查是有来历的：``sweep_once`` 的日志分支曾把 ``result.queried`` 写成
    ``result.queryed``。它跑在 ``_payment_sweep_loop`` 的 ``try/except Exception`` 里，
    异常被吃成一行 ``logger.exception`` —— 服务照常启动、下单照常成功，只是**每 30 秒**
    往日志里刷一次 traceback，而查单、认领已付款订单、关闭过期渠道交易这三件事
    **一件都没发生**。界面上完全看不出异常，只有「用户付了钱、订单还停在待支付」
    慢慢堆积，最后变成客服工单。

    之前没有任何检查碰过这个模块（``store/tools`` 里搜不到 ``sweep``），所以这个
    错别字能一路跑到线上，靠人去翻日志才发现。这里把它当黑盒跑完整两轮：

    1. 已付款但异步通知丢了的单，必须被查单认领并履约；
    2. 本地已过期、渠道侧还开着的单，必须被关掉；
    3. 一轮下来没事可做时返回 ``None``，且不在节流窗口内重复查同一笔单。

    渠道调用全部打桩：真去连支付宝既慢，又会因为没有公网回调而失败。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-sweep-"))
    keys = _alipay_test_keys(workdir)
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="alipay",
        alipay_app_id="2021000000000000",
        alipay_app_private_key_path=str(keys["app_private"]),
        alipay_public_key_path=str(keys["alipay_public"]),
        # 只测巡检逻辑，不去验网关响应的签名
        alipay_verify_response_sign=False,
    )
    app = create_app(settings)
    database = app.state.database

    # 订单号带时间戳：``_allow_query`` 的节流表是模块级全局的，同一进程里
    # 重跑本检查不能撞上上一轮的记录
    stamp = utcnow().strftime("%H%M%S%f")
    email = f"sweep-{stamp}@habridge.local"

    with database.session() as session:
        seed_settings(session)
        products = seed_products(session)
        base_product_id = products["base"].id
        account = Account(
            email=email,
            password_hash=hash_password("sweep-password-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(account_id=account.id, email=email, name=email)
        session.add(customer)
        session.flush()

        def _order(suffix: str, status: str, expires_at) -> str:
            order = Order(
                order_no=f"HOMEOS-SWEEP-{stamp}-{suffix}",
                lookup_token=f"sweep-token-{stamp}-{suffix}",
                account_id=account.id,
                customer_id=customer.id,
                email=email,
                product_id=base_product_id,
                product_name="smoke 主授权",
                product_type="base",
                order_type="base",
                license_action="issue",
                original_amount_cents=4990,
                amount_cents=4990,
                status=status,
                fulfillment_mode="automatic",
                payment_provider="alipay",
                expires_at=expires_at,
            )
            session.add(order)
            session.flush()
            return order.order_no

        # 钱付了、异步通知丢了：本地还是 pending，渠道侧已经是 TRADE_SUCCESS
        paid_order_no = _order("paid", "pending", utcnow() + timedelta(minutes=30))
        # 本地已过期，但渠道侧那笔预下单交易还开着（旧二维码还能扫、还能付）
        stale_order_no = _order("stale", "expired", utcnow() - timedelta(hours=1))
        # 用户放着不付：既不该入账，也不该被反复查单
        waiting_order_no = _order("waiting", "pending", utcnow() + timedelta(minutes=30))

    alipay_cls = alipay_module.AlipayProvider
    real_query = alipay_cls.query_payment
    real_close = alipay_cls.close_payment
    calls: list[str] = []

    # 打桩替代真实网关调用；签名与 AlipayProvider.query_payment 一致
    def stub_query(self, _settings, order):
        calls.append(f"query:{order.order_no}")
        if order.order_no == paid_order_no:
            return {
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "49.90",
                "trade_no": "2026SWEEP0001",
                "out_trade_no": order.order_no,
            }
        if order.order_no == stale_order_no:
            # 渠道侧仍是「等待付款」：钱没到，关单环节应该把它关掉
            return {"trade_status": "WAIT_BUYER_PAY", "out_trade_no": order.order_no}
        return None

    def stub_close(self, _settings, order):
        calls.append(f"close:{order.order_no}")
        return alipay_module.CloseResult(closed=True, reason="smoke 关单")

    catcher = _SweepLogCatcher()
    sweep_logger = logging.getLogger("store.payments.sweeper")
    sweep_logger.addHandler(catcher)

    configure_sweep_loop(30)
    check(
        "巡检循环启用、第一轮还没跑完时报「尚未启动」",
        sweep_status()["health"] == "pending",
        sweep_status()["health"],
    )

    raised: Exception | None = None
    result = None
    second = None
    first_status: dict = {}
    try:
        alipay_cls.query_payment = stub_query
        alipay_cls.close_payment = stub_close
        try:
            # 走 app.py 循环真正调用的那个入口：状态登记就在这一层，
            # 只测 sweep_once 会漏掉「状态记错了/没记」这一类问题。
            result = sweep_round(database, settings)
        except Exception as error:  # noqa: BLE001 - 正是要被测出来的那类异常
            raised = error
        else:
            # 快照要在这里取：lastResult 记的是**最近一轮**，第二轮的「无事可做」
            # 会把它覆盖成全 0。
            first_status = sweep_status()
            second = sweep_round(database, settings)
    finally:
        alipay_cls.query_payment = real_query
        alipay_cls.close_payment = real_close
        sweep_logger.removeHandler(catcher)

    check(
        "后台支付巡检单轮跑通（不再抛异常）",
        raised is None,
        f"{type(raised).__name__}: {raised}" if raised is not None else "",
    )
    if raised is not None:
        # 后面每一项都依赖这一轮的产物，继续断言只会刷屏
        app.state.database.dispose()
        return

    # —— 状态登记：后台概览与 /healthz 读的就是这份快照 ——
    check(
        "巡检成功后状态为「正常」并记下本轮结果",
        first_status.get("health") == "ok"
        and first_status.get("consecutiveFailures") == 0
        and first_status.get("lastSuccessAt")
        and (first_status.get("lastResult") or {}).get("settled") == 1
        and first_status.get("secondsSinceSuccess") is not None,
        str(first_status),
    )
    success_at = first_status.get("lastSuccessAt")
    check(
        "无事可做的一轮也算成功（不会把状态卡在「连续失败」）",
        sweep_status()["health"] == "ok" and sweep_status()["rounds"] == 2,
        str(sweep_status()),
    )

    # 连续失败必须能看出来，而且**不能把「上次成功」抹掉**：运维要判断的正是
    # 「已经坏了多久」。这里让查单抛一个非 PaymentError（真实故障就是这样：
    # AttributeError / TypeError 这类不会在 reconcile_due_orders 里被吃掉）。
    #
    # 必须先造一笔**新**订单：``_allow_query`` 对同一单号有 3 秒节流，拿上面那几笔
    # 去注入故障，它们会被直接跳过，异常根本不会发生（这条断言就先自己踩过一次）。
    with database.session() as session:
        fresh = Order(
            order_no=f"HOMEOS-SWEEP-{stamp}-boom",
            lookup_token=f"sweep-token-{stamp}-boom",
            email=email,
            product_id=base_product_id,
            product_name="smoke 主授权",
            product_type="base",
            order_type="base",
            license_action="issue",
            original_amount_cents=4990,
            amount_cents=4990,
            status="pending",
            fulfillment_mode="automatic",
            payment_provider="alipay",
            expires_at=utcnow() + timedelta(minutes=30),
        )
        session.add(fresh)
        session.flush()

    def stub_query_boom(self, _settings, order):
        calls.append(f"query:{order.order_no}")
        raise RuntimeError("smoke 注入的巡检故障")

    before_failure = sweep_status()
    try:
        alipay_cls.query_payment = stub_query_boom
        try:
            sweep_round(database, settings)
            injected_raised = False
        except RuntimeError:
            injected_raised = True
    finally:
        alipay_cls.query_payment = real_query

    failed_status = sweep_status()
    check(
        "巡检异常照旧往上抛（调用方要打完整 traceback）",
        injected_raised,
        "" if injected_raised else "异常被吞掉了，调用方拿不到任何信号",
    )
    check(
        "连续失败会被登记为「连续失败」",
        failed_status["health"] == "failing"
        and failed_status["consecutiveFailures"] == 1
        and "RuntimeError" in failed_status["lastError"],
        str(failed_status),
    )
    # 失败时把 lastSuccessAt 清掉，等于把「已经坏了多久」也一起抹了——运维正是
    # 靠这个时间判断要不要立刻介入。
    check(
        "失败不覆盖上次成功时间（要能看出「已经坏了多久」）",
        failed_status["lastSuccessAt"] == before_failure["lastSuccessAt"]
        and success_at is not None,
        f"失败前 {before_failure['lastSuccessAt']} → 失败后 {failed_status['lastSuccessAt']}",
    )

    # 配置关掉巡检时，「已关闭」与「坏了」必须分开：前者是运营的选择，后者是故障，
    # 两种处置完全不同（改配置 vs 查日志）。
    configure_sweep_loop(0)
    check(
        "巡检间隔为 0 时报「已关闭」，不混进故障态",
        sweep_status()["health"] == "disabled",
        sweep_status()["health"],
    )
    configure_sweep_loop(30)

    check(
        "巡检日志打印出本轮统计（报错分支就在这条日志语句里）",
        any("查单" in message for message in catcher.messages),
        str(catcher.messages) or "没有抓到巡检日志",
    )
    check(
        "巡检认领「已付款但通知丢了」的订单",
        result is not None and result.settled == 1 and result.settled_orders == [paid_order_no],
        f"settled={getattr(result, 'settled', None)} "
        f"settled_orders={getattr(result, 'settled_orders', None)}",
    )
    check(
        "巡检关掉「本地已过期、渠道侧还开着」的订单",
        result is not None
        and result.closed == 1
        and calls.count(f"close:{stale_order_no}") == 1,
        f"closed={getattr(result, 'closed', None)} calls={calls}",
    )
    check(
        "巡检的查单 / 失败计数与预期一致",
        result is not None and result.queried == 3 and result.failed == 0,
        f"queried={getattr(result, 'queried', None)} failed={getattr(result, 'failed', None)}",
    )
    waiting_queries = calls.count(f"query:{waiting_order_no}")
    check(
        "同一订单在节流窗口内不重复查单（网关有频率限制）",
        waiting_queries == 1,
        f"未付款的那笔单被查了 {waiting_queries} 次",
    )
    check(
        "无事可做时返回 None（上层不用猜有没有变化）",
        second is None,
        repr(second),
    )

    with database.session() as session:
        paid = session.scalars(select(Order).where(Order.order_no == paid_order_no)).first()
        stale = session.scalars(select(Order).where(Order.order_no == stale_order_no)).first()
        check(
            "被认领的订单已履约并发码",
            paid.status == "fulfilled" and paid.license_id is not None,
            f"{paid.status} / license={paid.license_id}",
        )
        check(
            "被认领的订单记下了渠道交易号",
            paid.payment_trade_no == "2026SWEEP0001",
            str(paid.payment_trade_no),
        )
        check(
            "关单后写下 channel_closed_at（下一轮不会再关一次）",
            stale.channel_closed_at is not None,
            str(stale.channel_closed_at),
        )

    # —— 状态是进程级全局：必须能分清「这条状态归哪一轮循环」——
    # 同一个进程里先后起过多个 app（测试就是这么反复建的），旧循环的收尾与残留线程
    # 都可能迟到。它们若还能改写快照，运维看到的就是上一位留下的「上次成功」，
    # 而真正跑着的那个循环坏没坏，反而看不出来。
    real_sweep_once = sweeper_module.sweep_once
    sweeper_module.sweep_once = lambda *_args, **_kwargs: None  # 空转一轮，只测状态登记
    try:
        old_generation = configure_sweep_loop(30)
        sweep_round(database, settings, old_generation)
        check(
            "循环跑完一轮后状态为「正常」",
            sweep_status()["health"] == "ok",
            str(sweep_status()),
        )

        # 新循环起来：它必须从零开始，而不是继承上一个循环的「上次成功」。
        new_generation = configure_sweep_loop(30)
        check(
            "新循环启动时不继承上一个循环的成功时间",
            sweep_status()["lastSuccessAt"] is None,
            str(sweep_status()["lastSuccessAt"]),
        )

        # 旧循环的残留线程这时才跑完它那一轮（传旧代号）。
        sweep_round(database, settings, old_generation)
        stale_status = sweep_status()
        check(
            "旧循环的残留线程写不进新循环的快照",
            stale_status["rounds"] == 0 and stale_status["lastSuccessAt"] is None,
            str(stale_status),
        )

        # 旧循环迟到的 finally。
        mark_sweep_loop_stopped(old_generation)
        check(
            "旧循环的收尾不会把新循环标成「已停止」",
            sweep_status()["health"] != "stopped",
            str(sweep_status()),
        )

        # 反向：当前这一轮循环退出，必须如实标成「已停止」——否则这层校验就成了
        # 「谁都别想让我停下来」，把真正的异常退出也一起瞒掉。
        sweep_round(database, settings, new_generation)
        mark_sweep_loop_stopped(new_generation)
        check(
            "当前循环退出后照实报「已停止」",
            sweep_status()["health"] == "stopped",
            str(sweep_status()),
        )
    finally:
        sweeper_module.sweep_once = real_sweep_once
        configure_sweep_loop(30)

    app.state.database.dispose()


async def check_payment_sweep_edge_cases() -> None:
    """巡检的边界：过期仍是 pending 的单、查单失败 ≠ 交易不存在。

    这一批位置都是「出错时只在日志里留一行、界面上完全看不出来」的地方：

    1. 过期却仍是 ``pending`` 的单：既不查单也不关单，本地一直占着库存预留与
       优惠码名额，渠道那笔预交易也一直开着（旧二维码永远能扫、能付）；
    2. 查单抛 ``PaymentError``（网关抖动）被当成「渠道没有这笔交易」，于是给订单
       打上 ``channel_closed_at`` —— 那笔交易从此再也不会被关，钱还能被付进来；
    3. 终态订单复活成交时副作用漏了一半（不置 ``needs_review``、不占回优惠码
       名额），超卖与名额超发都从这里开始。

    渠道调用全部打桩：真去连支付宝既慢，又没有公网回调。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-sweep-edge-"))
    keys = _alipay_test_keys(workdir)
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="alipay",
        alipay_app_id="2021000000000000",
        alipay_app_private_key_path=str(keys["app_private"]),
        alipay_public_key_path=str(keys["alipay_public"]),
        alipay_verify_response_sign=False,
    )
    app = create_app(settings)
    database = app.state.database

    # 订单号带时间戳：``_allow_query`` 的节流表是模块级全局的，同一进程里
    # 重跑本检查不能撞上上一轮的记录
    stamp = utcnow().strftime("%H%M%S%f")
    email = f"sweep-edge-{stamp}@habridge.local"

    with database.session() as session:
        seed_settings(session)
        products = seed_products(session)
        product = products["base"]
        base_product_id = product.id
        # 预留是真的占着一件：过期时没归还，就等于这件货永远卖不出去
        session.execute(
            Product.__table__.update()
            .where(Product.id == product.id)
            .values(reserved_stock=1)
        )
        account = Account(
            email=email,
            password_hash=hash_password("sweep-password-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(account_id=account.id, email=email, name=email)
        session.add(customer)
        session.flush()

        def _coupon(code: str, redeemed: int) -> str:
            session.add(
                Coupon(code=code, description="smoke 巡检边界", percent=5, redeemed_count=redeemed)
            )
            session.flush()
            return code

        # 「过期单占着名额」：进终态时 release_coupon 会减到 0，这里先摆成 1
        aging_coupon = _coupon(f"SMOKE-EDGE-AGING-{stamp}", 1)
        # 「复活单」：取消那一刻名额已经还回去了（0），成交后必须重新占回来
        revive_coupon = _coupon(f"SMOKE-EDGE-REVIVE-{stamp}", 0)

        def _order(suffix: str, status: str, *, expires_at=None, coupon_code=None) -> str:
            row = Order(
                order_no=f"HOMEOS-EDGE-{stamp}-{suffix}",
                lookup_token=f"edge-token-{stamp}-{suffix}",
                account_id=account.id,
                customer_id=customer.id,
                email=email,
                product_id=base_product_id,
                product_name="smoke 主授权",
                product_type="base",
                order_type="base",
                license_action="issue",
                original_amount_cents=4990,
                amount_cents=4990,
                status=status,
                fulfillment_mode="automatic",
                payment_provider="alipay",
                expires_at=expires_at,
                coupon_code=coupon_code,
            )
            session.add(row)
            session.flush()
            return row.order_no

        # 本地已过期、却还是 pending（商店没人访问时没人扫过期）
        aging_order_no = _order(
            "aging",
            "pending",
            expires_at=utcnow() - timedelta(hours=1),
            coupon_code=aging_coupon,
        )
        # 同上，但渠道**确认没有这笔交易**（预下单就没成功）
        ghost_order_no = _order("ghost", "pending", expires_at=utcnow() - timedelta(hours=1))
        # 终态订单 + 网关抖动：绝不能被当成「交易不存在」
        flaky_order_no = _order("flaky", "cancelled")
        # 终态订单 + 钱其实付了：必须认回来（复活）
        revive_order_no = _order("revive", "cancelled", coupon_code=revive_coupon)

    alipay_cls = alipay_module.AlipayProvider
    real_query = alipay_cls.query_payment
    real_close = alipay_cls.close_payment
    calls: list[str] = []

    def stub_query(self, _settings, order):
        calls.append(f"query:{order.order_no}")
        if order.order_no == aging_order_no:
            return {"trade_status": "WAIT_BUYER_PAY", "out_trade_no": order.order_no}
        if order.order_no == ghost_order_no:
            return None
        if order.order_no == flaky_order_no:
            raise PaymentError("smoke 注入的网关抖动")
        if order.order_no == revive_order_no:
            return {
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "49.90",
                "trade_no": "2026EDGE0001",
                "out_trade_no": order.order_no,
            }
        return None

    def stub_close(self, _settings, order):
        calls.append(f"close:{order.order_no}")
        return alipay_module.CloseResult(closed=True, reason="smoke 关单")

    raised: Exception | None = None
    result = None
    second = None
    try:
        alipay_cls.query_payment = stub_query
        alipay_cls.close_payment = stub_close
        try:
            result = sweep_round(database, settings)
        except Exception as error:  # noqa: BLE001 - 正是要被测出来的那类异常
            raised = error
        else:
            second = sweep_round(database, settings)
    finally:
        alipay_cls.query_payment = real_query
        alipay_cls.close_payment = real_close

    check(
        "巡检边界用例单轮跑通（不再抛异常）",
        raised is None,
        f"{type(raised).__name__}: {raised}" if raised is not None else "",
    )
    if raised is not None:
        app.state.database.dispose()
        return

    check(
        "过期仍是 pending 的单被收尾（关单 2 笔：一笔关渠道、一笔渠道无此交易）",
        result is not None and result.closed == 2,
        f"closed={getattr(result, 'closed', None)} calls={calls}",
    )
    check(
        "查单失败计入 failed，且不当作「交易不存在」去关单",
        result is not None
        and result.failed == 1
        and calls.count(f"close:{flaky_order_no}") == 0,
        f"failed={getattr(result, 'failed', None)} calls={calls}",
    )
    check(
        "终态订单收到钱后照常入账（复活）",
        result is not None and result.settled == 1 and result.settled_orders == [revive_order_no],
        f"settled={getattr(result, 'settled', None)} "
        f"settled_orders={getattr(result, 'settled_orders', None)}",
    )

    with database.session() as session:
        aging = session.scalars(select(Order).where(Order.order_no == aging_order_no)).first()
        ghost = session.scalars(select(Order).where(Order.order_no == ghost_order_no)).first()
        flaky = session.scalars(select(Order).where(Order.order_no == flaky_order_no)).first()
        revive = session.scalars(select(Order).where(Order.order_no == revive_order_no)).first()
        reserved_after = int(session.get(Product, base_product_id).reserved_stock or 0)
        aging_redeemed = session.scalars(
            select(Coupon).where(Coupon.code == aging_coupon)
        ).first().redeemed_count
        revive_redeemed = session.scalars(
            select(Coupon).where(Coupon.code == revive_coupon)
        ).first().redeemed_count

        check(
            "过期仍是 pending 的单被推进终态并写下 channel_closed_at",
            aging.status == "expired" and aging.channel_closed_at is not None,
            f"{aging.status} / closed={aging.channel_closed_at}",
        )
        check(
            "过期收尾把库存预留还了回去（不再永久占着那一件）",
            reserved_after == 0,
            f"reserved_stock={reserved_after}",
        )
        check(
            "过期收尾把优惠码名额还了回去",
            int(aging_redeemed or 0) == 0,
            f"redeemed_count={aging_redeemed}",
        )
        check(
            "渠道确认无此交易时也把本地订单推进终态（本地不再卡 pending）",
            ghost.status == "expired" and ghost.channel_closed_at is not None,
            f"{ghost.status} / closed={ghost.channel_closed_at}",
        )
        check(
            "渠道确认无此交易时不去调关单接口（没什么可关的）",
            calls.count(f"close:{ghost_order_no}") == 0,
            str(calls),
        )
        check(
            "查单失败不给订单打 channel_closed_at（否则那笔交易再也不会被关）",
            flaky.status == "cancelled" and flaky.channel_closed_at is None,
            f"{flaky.status} / closed={flaky.channel_closed_at}",
        )
        check(
            "复活单被认领并履约发码",
            revive.status == "fulfilled" and revive.license_id is not None,
            f"{revive.status} / license={revive.license_id}",
        )
        check(
            "复活单标记待人工复核（预留早已还给别人，可能超卖）",
            bool(revive.needs_review) and "库存预留" in (revive.review_note or ""),
            f"needs_review={revive.needs_review} note={revive.review_note!r}",
        )
        check(
            "复活单把优惠码名额重新占回来（否则 max_redemptions 能被突破）",
            int(revive_redeemed or 0) == 1,
            f"redeemed_count={revive_redeemed}",
        )

    check(
        "收尾之后无事可做时返回 None（不会反复关同一笔）",
        second is None,
        repr(second),
    )

    app.state.database.dispose()


async def check_payment_sweep_loop_runs() -> None:
    """巡检循环真的被接上了：起一次真实 lifespan，等它自己跑完第一轮。

    ``check_payment_sweep_flow`` 只证明「单轮跑得通」，证明不了**有人会去跑它**。
    app.py 的循环有三处能静默失效而单轮检查全绿：

    1. 忘了把 ``sweep_once`` 换成登记状态的入口 → 后台永远显示尚未启动；
    2. 忘了 ``configure_sweep_loop(...)`` → 状态永远是「尚未启动」；
    3. 循环压根没被 ``create_task`` → 同上，而且没有任何别的信号。

    所以这里用 ``lifespan_context`` 走真实启动路径，把间隔调到 1 秒等它跑一轮。
    渠道用自己的空配置（``payment_provider=mock``），``is_configured`` 为假 →
    不会真的去连支付宝，纯本地一轮。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-sweep-loop-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
        # 首轮延后 min(interval, 5) 秒，设 1 秒让这轮检查只需要等 1 秒左右
        payment_sweep_interval_seconds=1,
    )
    app = create_app(settings)
    with app.state.database.session() as session:
        seed_settings(session)

    # 前置条件：先把模块状态置成「已关闭」。
    # 巡检状态是模块级全局的，前面那条检查已经把它配成 30 秒了；不先弄脏，
    # 「循环漏了 configure_sweep_loop」就会因为撞上别人留下的状态而被放过
    # （实测过：只报一条 interval=30 不符，看着像小毛病）。这样一改，漏配
    # 就直接停在「已关闭」，下面的断言全部炸掉，且与检查顺序无关。
    configure_sweep_loop(0)
    check(
        "（前置）巡检状态被置为「已关闭」，用于验证循环会自己声明配置",
        sweep_status()["health"] == "disabled",
        str(sweep_status()),
    )

    async with app.router.lifespan_context(app):
        snapshot = sweep_status()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not snapshot["lastSuccessAt"]:
            await asyncio.sleep(0.2)
            snapshot = sweep_status()

        check(
            "巡检循环自己跑完第一轮并把状态记为「正常」",
            snapshot["health"] == "ok" and snapshot["lastSuccessAt"],
            str(snapshot),
        )
        check(
            "巡检状态回报的间隔与站点配置一致",
            snapshot["intervalSeconds"] == 1 and snapshot["enabled"] is True,
            f"interval={snapshot['intervalSeconds']} enabled={snapshot['enabled']}",
        )
        check(
            "本轮无事可做也记下结果（全 0，不是缺失）",
            snapshot["lastResult"] == {"queried": 0, "settled": 0, "closed": 0, "failed": 0},
            str(snapshot["lastResult"]),
        )

        # 外部监控的抓手：探活的机器不该被巡检状态带偏，但监控要能读到它。
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://store.test"
        ) as client:
            health = (await client.get("/healthz")).json()
        check(
            "/healthz 带上巡检状态（监控可据此报警）",
            health.get("status") == "ok"
            and health.get("paymentSweep", {}).get("health") == "ok",
            str(health),
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


def check_mail_settings_merge() -> None:
    """邮件配置的「站点配置优先、环境变量兜底」口径（纯函数，不建库）。

    这里钉的是**哨兵语义**：留空 / 0 / None 表示「跟随环境变量」。这套规则一旦
    被写成「有值就覆盖」，整个后台的「留空即跟随环境变量」提示就变成谎话，
    运营会以为清空某个框就能回到环境变量，实际却把一个空值固化进了数据库。
    """
    from store import mail_settings
    from store.models import StoreSetting

    env = load_settings(
        mail_mode="smtp",
        mail_from="env@example.com",
        smtp_host="env.smtp",
        smtp_port=465,
        smtp_username="env-user",
        smtp_password="env-secret",
        smtp_use_ssl=True,
        smtp_starttls=False,
        verification_ttl_seconds=600,
        verification_cooldown_seconds=60,
        expose_verification_code=False,
    )

    # 1) 库里全空 -> 完全跟随环境变量
    merged = mail_settings.merge_mail_settings(env, StoreSetting(id=1))
    check(
        "邮件配置全空时完全跟随环境变量",
        (merged.mail_mode, merged.smtp_host, merged.smtp_port, merged.smtp_password)
        == ("smtp", "env.smtp", 465, "env-secret"),
        f"{merged.mail_mode} {merged.smtp_host}:{merged.smtp_port}",
    )

    # 2) 后台覆盖 + 选了 STARTTLS 但没填端口 -> 用 587 而不是环境变量的 465
    merged = mail_settings.merge_mail_settings(
        env,
        StoreSetting(
            id=1,
            smtp_host="db.smtp",
            smtp_security="starttls",
            smtp_username="db-user",
            smtp_password="db-secret",
        ),
    )
    check(
        "选了 STARTTLS 未填端口时推导 587（不会沿用环境变量的 465）",
        merged.smtp_host == "db.smtp"
        and merged.smtp_port == 587
        and merged.smtp_use_ssl is False
        and merged.smtp_starttls is True,
        f"{merged.smtp_host}:{merged.smtp_port} ssl={merged.smtp_use_ssl} starttls={merged.smtp_starttls}",
    )

    # 3) 回显开关的三态：None 跟随环境变量，True / False 显式覆盖
    check(
        "回显开关未配置时跟随环境变量",
        mail_settings.merge_mail_settings(env, StoreSetting(id=1)).expose_verification_code
        is False,
    )
    env_exposed = replace(env, expose_verification_code=True)
    check(
        "回显开关既可被后台打开，也可被后台关掉（三态而非布尔覆盖）",
        mail_settings.merge_mail_settings(
            env, StoreSetting(id=1, expose_verification_code=True)
        ).expose_verification_code
        is True
        and mail_settings.merge_mail_settings(
            env_exposed, StoreSetting(id=1, expose_verification_code=False)
        ).expose_verification_code
        is False
        and mail_settings.merge_mail_settings(env_exposed, StoreSetting(id=1))
        .expose_verification_code
        is True,
    )

    # 4) 库里的脏数据（人工改库写错的投递方式）不能把发信整个静默关掉
    check(
        "库里的非法投递方式按「未配置」处理（跟随环境变量）",
        mail_settings.merge_mail_settings(env, StoreSetting(id=1, mail_mode="smpt")).mail_mode
        == "smtp",
    )

    # 5) 概览绝不带授权码明文，只报「已配置」与打码值
    secret = "super-secret-授权码"
    summary = mail_settings.mail_delivery_summary(
        env, StoreSetting(id=1, smtp_password=secret)
    )
    check(
        "邮件概览不回显授权码明文",
        secret not in str(summary)
        and summary["smtpPasswordConfigured"] is True
        and summary["smtpPasswordFromDatabase"] is True
        and summary["smtpPasswordMasked"] == mail_settings.mask_secret(secret),
        str(summary["smtpPasswordMasked"]),
    )
    check(
        "后台配了 smtp 但漏了授权码时，概览如实报「未就绪」",
        mail_settings.mail_delivery_summary(
            replace(env, smtp_password=""), StoreSetting(id=1, mail_mode="smtp")
        )["smtpReady"]
        is False,
    )

    # 6) 有效期 / 冷却的联动校验
    check(
        "冷却短于有效期为合法配置",
        _window_error(mail_settings, 600, 60) is None,
        str(_window_error(mail_settings, 600, 60)),
    )
    check(
        "冷却 >= 有效期被拒绝（用户会在验证码过期后被冷却锁住）",
        _window_error(mail_settings, 600, 600) is not None,
        "未拦下冷却 >= 有效期",
    )
    check(
        "有效期短于 60 秒被拒绝（用户来不及输入）",
        _window_error(mail_settings, 30, 10) is not None,
        "未拦下过短的有效期",
    )


def _window_error(mail_settings, ttl: int, cooldown: int) -> str | None:
    """跑一遍有效期 / 冷却校验，返回错误文案（合法时返回 ``None``）。"""
    try:
        mail_settings.validate_verification_window(ttl, cooldown)
    except ValueError as exc:
        return str(exc)
    return None


def check_mail_presets() -> None:
    """默认邮箱必须真的能带出一套可用的 SMTP 预设。

    后台「注册邮件」在**当前没有任何可用配置**时会用默认邮箱反查服务商预设，
    直接预填服务器 / 加密 / 端口 / 账号 / 发件人（见 admin.html 的 applyMailPreset）。
    这条链路上任何一环断掉都不会报错：预设查不到只是「没预填」，端口与加密方式
    配错则要等到点「发送测试邮件」才暴露 —— 而那时运营更可能去怀疑授权码写错了。
    所以这里把三件事钉死：

    1. 默认邮箱能在预设表里反查出服务商，否则整个预填是死的；
    2. 每个预设的加密方式合法、端口与加密方式一一对应；
    3. 域名不重复（重复时 ``preset_for_email`` 只会命中最前面那个，另一条永远选不中），
       且前端不另抄一份服务商清单 —— 两份清单漂移时，页面会拿旧参数去填一个
       已经改过接入方式的服务商。
    """
    from store import mail_settings
    from store.models import DEFAULT_SUPPORT_EMAIL

    default_preset = mail_settings.preset_for_email(DEFAULT_SUPPORT_EMAIL)
    check(
        "默认邮箱能反查到 SMTP 预设（否则后台的预填是死的）",
        default_preset is not None and bool(default_preset["smtpHost"]),
        f"{DEFAULT_SUPPORT_EMAIL} -> {default_preset and default_preset['id']}",
    )
    check(
        "认不出的域名返回 None（自定义邮局刻意不猜）",
        mail_settings.preset_for_email("nobody@my-company.cn") is None
        and mail_settings.preset_for_email("not-an-email") is None,
        "自定义域名 / 非法地址都应有预设为空",
    )

    mismatched = [
        f"{item['id']}:{item['smtpSecurity']}/{item['smtpPort']}"
        for item in mail_settings.SMTP_PRESETS
        if item["smtpSecurity"] not in mail_settings.SMTP_SECURITY_MODES
        or int(item["smtpPort"])
        != mail_settings.DEFAULT_SMTP_PORTS[str(item["smtpSecurity"])]
    ]
    check(
        "每个邮箱预设的加密方式与端口都匹配（配错要到测试邮件才暴露）",
        not mismatched,
        f"不匹配: {mismatched}" if mismatched else f"共核对 {len(mail_settings.SMTP_PRESETS)} 家服务商",
    )

    seen: dict[str, str] = {}
    duplicated: list[str] = []
    for item in mail_settings.SMTP_PRESETS:
        for domain in item["domains"]:  # type: ignore[union-attr]
            if str(domain) in seen:
                duplicated.append(f"{domain}（{seen[str(domain)]} / {item['id']}）")
            seen[str(domain)] = str(item["id"])
    check("预设域名互不重复（重复的那条永远选不中）", not duplicated, f"重复: {duplicated}")

    html = (STORE_ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    hosts = [str(item["smtpHost"]) for item in mail_settings.SMTP_PRESETS]
    hardcoded = sorted(host for host in hosts if host in html)
    check(
        "服务商清单只有后端一份（前端硬编码就会和预设表漂移）",
        "mail.presets" in html and not hardcoded,
        f"前端硬编码: {hardcoded}" if hardcoded else "前端只消费 mail.presets",
    )

    summary = mail_settings.mail_delivery_summary(load_settings(), StoreSetting(id=1))
    check(
        "邮件概览带上默认邮箱与服务商预设（前端预填的唯一来源）",
        summary.get("defaultEmail") == DEFAULT_SUPPORT_EMAIL
        and len(summary.get("presets") or []) == len(mail_settings.SMTP_PRESETS),
        f"defaultEmail={summary.get('defaultEmail')} presets={len(summary.get('presets') or [])}",
    )


# --------------------------------------------------------------------------- #
# 站点配置真实连通性诊断 + 本轮业务逻辑修复的专项自检
#
# 这些检查各自带一个临时库，因为它们要**故意把配置改坏**（填错公钥、
# 指向一个关着端口的地址、把订单造成复活态）。塞进主流程会连带后面几千行
# 「计数类」断言的基线一起偏，所以统一在流程最前面单独跑。
# --------------------------------------------------------------------------- #
def _closed_local_port() -> int:
    """取一个「刚刚还空着、现在已经关掉」的本机端口。

    刻意不写死端口号：写死 1、9 这类低端口在部分系统上会先撞权限错误，
    报出来的原因就不是「端口上没有服务在听」了 —— 而那正是要复现的故障。
    """
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _levels(checks: list[dict]) -> dict[str, str]:
    """把诊断清单拍成「检查项 id → 级别」，断言时不必关心顺序。"""
    return {str(item.get("id")): str(item.get("level")) for item in checks}


def _admin_login_payload() -> dict[str, str]:
    return {"email": "admin@habridge.local", "password": "smoke-admin-2026"}


async def check_alipay_diagnostics() -> None:
    """支付凭据自检必须真的用上「支付宝公钥」，且测不了就说测不了。

    过去的自检只做一次 ``require_signature=False`` 的 ``trade.query``：
    下单、查单全通，而**支付宝公钥从头到尾没被使用过**。于是把它误填成「应用公钥」
    时界面全绿，每一笔异步通知却都验签失败 —— 用户付了钱、订单永远停在待支付，
    而这是运营最难自查的一类故障。这里覆盖三条互不重叠的结论：

    * 模拟渠道（skip，而不是 409 或全绿）；
    * 公钥填反（``key-pair-distinct`` 判 fail —— 磨数相同就是同一把密钥）；
    * 网关连不上 / 通知地址填本机（分别判 fail，且都在无外网环境下可复现）。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-alipay-diag-"))
    keys = _alipay_test_keys(workdir)
    # ``openapi.invalid`` 是 RFC 2606 的保留域名，DNS 必然失败：既能在没有外网的
    # 环境里稳定复现「连不上网关」，又不会真的把请求打到支付宝去。
    unreachable = "https://openapi.invalid/gateway.do"
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="alipay",
        alipay_app_id="2021000000000000",
        alipay_gateway_url=unreachable,
        alipay_app_private_key_path=str(keys["app_private"]),
        alipay_public_key_path=str(keys["alipay_public"]),
    )
    app = create_app(settings)
    database = app.state.database
    with database.session() as session:
        seed_settings(session)
        seed_admin(session, "admin@habridge.local", "smoke-admin-2026")

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        await client.post("/store/v1/auth/login", json=_admin_login_payload())

        # ---- (a) 模拟渠道：按钮必须可用，且如实说「没有凭据可校验」 ---- #
        with database.session() as session:
            session.get(StoreSetting, 1).payment_provider = "mock"
        mock_response = await client.post("/store-admin/v1/settings/alipay/test")
        mock_data = mock_response.json() if mock_response.status_code == 200 else {}
        mock_levels = _levels(mock_data.get("checks") or [])
        check(
            "模拟渠道下的支付自检不再 409（本地联调时这个按钮必须能用）",
            mock_response.status_code == 200,
            f"{mock_response.status_code} {mock_data.get('message', '')}",
        )
        check(
            "模拟渠道如实报 skip + 不通过，而不是把「没测到」渲染成绿色",
            mock_levels.get("provider") == "skip" and mock_data.get("ok") is False,
            str(mock_levels),
        )

        # ---- (b) 「支付宝公钥」填成应用公钥：最隐蔽、损失最直接的配置错误 ---- #
        with database.session() as session:
            setting = session.get(StoreSetting, 1)
            setting.payment_provider = "alipay"
            setting.alipay_public_key = keys["app_public"].read_text(encoding="utf-8")
            setting.alipay_notify_url = (
                "https://127.0.0.1:18080/store/v1/payments/alipay/notify"
            )
        swapped_response = await client.post("/store-admin/v1/settings/alipay/test")
        swapped_data = (
            swapped_response.json() if swapped_response.status_code == 200 else {}
        )
        swapped_levels = _levels(swapped_data.get("checks") or [])
        check(
            "把「支付宝公钥」填成应用公钥必须判 fail（后台自己就能发现）",
            swapped_levels.get("key-pair-distinct") == "fail"
            and swapped_data.get("ok") is False,
            f"{swapped_levels.get('key-pair-distinct')} / ok={swapped_data.get('ok')}",
        )
        check(
            "网关 DNS 打不通时「网关连通性」判 fail（不是静默跳过）",
            swapped_levels.get("network") == "fail",
            str(swapped_levels.get("network")),
        )
        check(
            "异步通知地址填本机/内网时直接判 fail（必然收不到回调）",
            swapped_levels.get("notify-url") == "fail",
            str(swapped_levels.get("notify-url")),
        )

        # ---- (c) 填对公钥后同一项必须转绿：证明它不是写死的 ---- #
        with database.session() as session:
            session.get(StoreSetting, 1).alipay_public_key = keys["alipay_public"].read_text(
                encoding="utf-8"
            )
        correct_response = await client.post("/store-admin/v1/settings/alipay/test")
        correct_levels = _levels(
            (correct_response.json() if correct_response.status_code == 200 else {}).get(
                "checks"
            )
            or []
        )
        check(
            "换成真正的「支付宝公钥」后该项转 pass（检查项不是写死的）",
            correct_levels.get("key-pair-distinct") == "pass",
            str(correct_levels.get("key-pair-distinct")),
        )


async def check_payment_provider_fail_closed() -> None:
    """支付渠道必须 fail-closed：未配置渠道、或模拟收银台未显式开启时，都不能建单。

    这是审计里的第一个阻断项。过去 ``payment_provider`` 默认 ``mock``，而
    ``MockPaymentProvider.is_configured`` 恒为真，于是「照默认配置部署」就等于
    「0 元下单 → 点一下收银台 → 签发真实授权」。这里守住三条线：声明默认值、
    渠道解析逻辑、以及端到端下单（含一个「打开开关就能走通」的对照，避免
    「流程本身走不通导致 0 张授权」这种假绿）。
    """
    from dataclasses import fields as dataclass_fields

    declared = {field.name: field.default for field in dataclass_fields(StoreSettings)}
    check(
        "payment_provider 的声明默认值是空串（不再是 mock）",
        declared.get("payment_provider") == "",
        repr(declared.get("payment_provider")),
    )
    check(
        "allow_mock_payments 声明默认关闭",
        declared.get("allow_mock_payments") is False,
        repr(declared.get("allow_mock_payments")),
    )

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-pay-failclosed-"))
    base = dict(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="log",
    )

    def resolve_error(**overrides):
        """返回解析渠道时抛出的错误文案；没抛就返回 None。"""
        settings = load_settings(**base, **overrides)
        try:
            resolve_provider(settings, None)
        except PaymentError as error:
            return str(error)
        return None

    unconfigured = resolve_error(allow_mock_payments=False)
    check(
        "未配置渠道时解析支付渠道直接报错（不会回落成 mock）",
        unconfigured is not None and "尚未配置支付渠道" in unconfigured,
        str(unconfigured),
    )
    disabled = resolve_error(payment_provider="mock", allow_mock_payments=False)
    check(
        "渠道选了 mock 但开关没开时同样报错（默认不可用）",
        disabled is not None and "模拟收银台" in disabled,
        str(disabled),
    )
    mock_settings = load_settings(
        **base, payment_provider="mock", allow_mock_payments=True
    )
    provider = resolve_provider(mock_settings, None)
    check(
        "显式打开后 mock 才可用，且 is_configured 为真",
        isinstance(provider, MockPaymentProvider) and provider.is_configured(mock_settings),
        type(provider).__name__,
    )
    check(
        "未开启时 mock 自报 is_configured=False（巡检不会把它当成健康渠道）",
        MockPaymentProvider().is_configured(
            load_settings(**base, allow_mock_payments=False)
        )
        is False,
        "is_configured",
    )
    unknown = resolve_error(payment_provider="wechat", allow_mock_payments=True)
    check(
        "未知渠道名依旧报错（不会静默回落 mock）",
        unknown is not None and "不是受支持的渠道" in unknown,
        str(unknown),
    )

    async def run_order_flow(label: str, **overrides) -> tuple[int, str, int]:
        """下单（能用模拟收银台就付掉），返回 (下单状态码, 说明, 库内授权条数)。

        每个流程用**独立的临时数据目录**：共用同一个 SQLite 会把「对照组签发的授权」
        带进「被拦截组」的计数里，让「没有留下任何授权」这条断言永远失败。
        """
        workdir = Path(tempfile.mkdtemp(prefix=f"hb-store-pay-{label}-"))
        settings = load_settings(
            data_dir=workdir / "data",
            license_keys_dir=workdir / "keys",
            mail_mode="log",
            **overrides,
        )
        app = create_app(settings)
        database = app.state.database
        with database.session() as session:
            seed_settings(session)
            products = seed_products(session)
            seed_admin(session, "admin@habridge.local", "smoke-admin-2026")
            base_product_id = products["base"].id

        order_status = 0
        detail = ""
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://store.test"
        ) as client:
            await client.post("/store/v1/auth/login", json=_admin_login_payload())
            response = await client.post(
                "/store/v1/orders", json={"productId": base_product_id, "couponCode": None}
            )
            order_status = response.status_code
            if order_status == 201:
                payload = response.json()
                paid = await client.post(
                    f"/store/v1/orders/{payload['orderNo']}/mock/pay",
                    json={"orderToken": payload.get("lookupToken")},
                )
                detail = f"pay={paid.status_code}"
            else:
                try:
                    detail = str(response.json().get("detail", ""))
                except ValueError:
                    detail = response.text[:120]

        with database.session() as session:
            licenses = len(session.scalars(select(License)).all())
        app.state.database.dispose()
        return order_status, detail, licenses

    # ---- 对照：显式打开开关时，同一条流程必须走得通 ---- #
    allowed_status, allowed_detail, allowed_licenses = await run_order_flow(
        "control", payment_provider="mock", allow_mock_payments=True
    )
    check(
        "（对照）显式打开 mock 时：下单 201 + 模拟支付 200",
        allowed_status == 201 and allowed_detail == "pay=200",
        f"{allowed_status} {allowed_detail}",
    )
    check(
        "（对照）对照库里确实签发了授权（证明下面的「0 张」不是流程走不通导致的假绿）",
        allowed_licenses == 1,
        f"licenses={allowed_licenses}",
    )

    # ---- 阻断项本身：开关关闭 / 渠道未配置，都拿不到订单 ---- #
    blocked_status, blocked_detail, blocked_licenses = await run_order_flow(
        "mock-off", payment_provider="mock", allow_mock_payments=False
    )
    check(
        "mock 未开启时下单直接 503（拿不到订单，也就没有免付款发码的入口）",
        blocked_status == 503 and blocked_licenses == 0,
        f"{blocked_status} {blocked_detail} licenses={blocked_licenses}",
    )

    unset_status, unset_detail, unset_licenses = await run_order_flow(
        "unset", payment_provider="", allow_mock_payments=False
    )
    check(
        "完全未配置渠道时下单同样 503，文案指向「尚未配置支付渠道」",
        unset_status == 503 and "尚未配置支付渠道" in unset_detail and unset_licenses == 0,
        f"{unset_status} {unset_detail} licenses={unset_licenses}",
    )

    # ---- 联调入口必须成对打开两个开关 ---- #
    # 打开 fail-closed 之后最容易踩的坑：入口只设了 STORE_PAYMENT_PROVIDER=mock，
    # 忘了 STORE_ALLOW_MOCK_PAYMENTS=1 —— 表现是「按文档跑联调，下单 503」。
    # 这类失误不会让自检变红（自检自己设了环境变量），只能靠静态核对钉住。
    for entry in ("start.py", "store/tools/e2e.py"):
        source = (PROJECT_ROOT / entry).read_text(encoding="utf-8")
        wants_mock = "STORE_PAYMENT_PROVIDER" in source
        check(
            f"{entry} 指向模拟收银台时必须同时打开它是允许的",
            not wants_mock or "STORE_ALLOW_MOCK_PAYMENTS" in source,
            "缺 STORE_ALLOW_MOCK_PAYMENTS，下单会 503" if wants_mock and "STORE_ALLOW_MOCK_PAYMENTS" not in source else "",
        )


def check_seed_requires_credentials() -> None:
    """seed 不得再提供内置管理员凭据（审计里的第二个阻断项）。

    过去 ``store/tools/seed.py`` 里写死了真实的管理员邮箱与口令，而且口令就公开在
    ``store/README.md`` 里：照文档部署的实例全都带一个公开后门。这类"回归"最危险，
    因为它只要被重新加回来一行常量就复活，所以这里同时守住常量、模块属性与默认值。
    """
    from store.tools import seed as seed_module

    check(
        "seed 模块不再暴露 DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD",
        not hasattr(seed_module, "DEFAULT_ADMIN_EMAIL")
        and not hasattr(seed_module, "DEFAULT_ADMIN_PASSWORD"),
        f"{[n for n in dir(seed_module) if 'ADMIN' in n]}",
    )
    check(
        "seed 对缺凭据给出了显式退出提示",
        bool(getattr(seed_module, "MISSING_ADMIN_CREDENTIALS", "")),
        "MISSING_ADMIN_CREDENTIALS",
    )

    workdir = Path(tempfile.mkdtemp(prefix="hb-store-seed-cred-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="log",
    )
    check(
        "bootstrap 管理员凭据默认是空（必须由部署方显式提供）",
        settings.bootstrap_admin_email == "" and settings.bootstrap_admin_password == "",
        f"email={settings.bootstrap_admin_email!r} password={'*' if settings.bootstrap_admin_password else ''!r}",
    )

    # 真正跑一次「全新目录 + 无凭据」：必须非零退出，且不留下半初始化的数据库。
    env = {
        **os.environ,
        "PYTHONPATH": str(PROJECT_ROOT),
        "STORE_DATA_DIR": str(workdir / "data"),
        "STORE_LICENSE_KEYS_DIR": str(workdir / "keys"),
        "STORE_MAIL_MODE": "log",
    }
    env.pop("STORE_ADMIN_EMAIL", None)
    env.pop("STORE_ADMIN_PASSWORD", None)
    proc = subprocess.run(
        [sys.executable, "-m", "store.tools.seed"],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    check(
        "全新目录且无凭据时 seed 拒绝执行（非零退出）",
        proc.returncode != 0,
        f"exit={proc.returncode}",
    )
    check(
        "被拒绝的 seed 不会留下数据库（避免半初始化状态）",
        not (workdir / "data" / "store.db").exists(),
        str(workdir / "data" / "store.db"),
    )
    check(
        "拒绝时打印的指引里包含 STORE_ADMIN_EMAIL（照着就能改好）",
        "STORE_ADMIN_EMAIL" in (proc.stdout + proc.stderr),
        "指引文案",
    )


async def check_login_throttle_persists() -> None:
    """登录失败计数必须真的落库（审计里的第三个阻断项）。

    过去的写法是把失败记录写进**请求会话**，紧接着抛 401 —— 事务随之回滚，记录
    一起消失，于是限流永远触发不了（审计实测：40 次错误密码一次都没被拦）。这里
    守住三件事：按账号那一档会拦、**换了邮箱也躲不掉按来源 IP 那一档**、以及记录
    确实存在于数据库里（而不是「碰巧内存里记着」）。

    两档分别用**独立的数据目录**：按来源 IP 的桶是跨账号共享的，共用同一个库会让
    第一段的失败提前填满它（第一版就这么写错了一次，得到「22×401 / 11×429」这种
    看着像 bug、其实是测试算错数的结果）。
    """
    from store.api.store import LOGIN_ACCOUNT_MAX_ATTEMPTS, LOGIN_IP_MAX_ATTEMPTS

    def boot(prefix: str):
        workdir = Path(tempfile.mkdtemp(prefix=f"hb-store-login-{prefix}-"))
        settings = load_settings(
            data_dir=workdir / "data",
            license_keys_dir=workdir / "keys",
            mail_mode="log",
            payment_provider="",
            allow_mock_payments=False,
        )
        app = create_app(settings)
        with app.state.database.session() as session:
            seed_settings(session)
            seed_admin(session, "ops@example.com", "Correct-pw-123")
        return app

    def logged_in_attempt(client):
        return client.post(
            "/store/v1/auth/login",
            json={"email": "ops@example.com", "password": "definitely-wrong"},
        )

    # ---------------- 第一档：按账号 ---------------- #
    app = boot("account")
    database = app.state.database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        good = await client.post(
            "/store/v1/auth/login",
            json={"email": "ops@example.com", "password": "Correct-pw-123"},
        )
        check("登录限流未触发时正确密码可以登录", good.status_code == 200, str(good.status_code))

        codes = []
        response = None
        for _ in range(LOGIN_ACCOUNT_MAX_ATTEMPTS + 4):
            response = await logged_in_attempt(client)
            codes.append(response.status_code)
        check(
            f"同一账号错 {LOGIN_ACCOUNT_MAX_ATTEMPTS} 次后被限流（不再是无一被拦）",
            codes[:LOGIN_ACCOUNT_MAX_ATTEMPTS] == [401] * LOGIN_ACCOUNT_MAX_ATTEMPTS
            and 429 in codes[LOGIN_ACCOUNT_MAX_ATTEMPTS:],
            f"{codes.count(401)}×401 / {codes.count(429)}×429",
        )
        check(
            "429 带上 Retry-After（客户端知道该等多久）",
            response is not None
            and response.headers.get("retry-after") is not None
            and int(response.headers["retry-after"]) > 0,
            str(response.headers.get("retry-after") if response is not None else None),
        )

    with database.session() as session:
        from store.models import LoginAttempt

        account_scopes = {
            row[0] for row in session.execute(select(LoginAttempt.scope).distinct()).all()
        }
    check(
        "失败记录确实落到 login_attempts 表（回滚不再吃掉计数）",
        any(scope.startswith("login:ops@example.com") for scope in account_scopes),
        str(sorted(account_scopes)[:3]),
    )
    app.state.database.dispose()

    # ---------------- 第二档：按来源 IP ---------------- #
    app = boot("ip")
    database = app.state.database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        # 每个邮箱只错 1 次：按账号那档永远不会触发，能拦下来只可能是按来源 IP 那档。
        ip_codes = []
        for index in range(LOGIN_IP_MAX_ATTEMPTS + 3):
            response = await client.post(
                "/store/v1/auth/login",
                json={"email": f"nobody{index}@example.com", "password": "definitely-wrong"},
            )
            ip_codes.append(response.status_code)
        check(
            f"换邮箱也躲不掉：第 {LOGIN_IP_MAX_ATTEMPTS + 1} 次起按来源 IP 被拦（每个邮箱只错 1 次）",
            ip_codes[:LOGIN_IP_MAX_ATTEMPTS] == [401] * LOGIN_IP_MAX_ATTEMPTS
            and ip_codes[LOGIN_IP_MAX_ATTEMPTS:] == [429] * 3,
            f"{ip_codes.count(401)}×401 / {ip_codes.count(429)}×429",
        )

    with database.session() as session:
        from store.models import LoginAttempt

        scopes = {
            row[0] for row in session.execute(select(LoginAttempt.scope).distinct()).all()
        }
        #: 每个 nobody 邮箱只留下 1 条失败 —— 直接证明拦截来自 IP 档而非账号档。
        per_account = {
            scope: len(
                session.execute(
                    select(LoginAttempt.id).where(LoginAttempt.scope == scope)
                ).all()
            )
            for scope in scopes
            if scope.startswith("login:nobody")
        }
    check(
        "限流同时写入按来源 IP 与全局两个维度",
        any(scope.startswith("login-ip:") for scope in scopes) and "login-global" in scopes,
        str(sorted(s for s in scopes if not s.startswith("login:"))),
    )
    check(
        "每个被尝试的邮箱都只有 1 条失败记录（拦截确实来自 IP 档，不是账号档）",
        bool(per_account) and all(count == 1 for count in per_account.values()),
        f"涉及 {len(per_account)} 个邮箱，计数={sorted(set(per_account.values()))}",
    )
    check(
        "全局维度只计数、不参与拦截（避免任何人打满阈值就锁死所有登录）",
        "login-global" in scopes,
        "仅观测，见 _note_login_failure",
    )

    app.state.database.dispose()


async def check_mail_diagnostics() -> None:
    """邮件自检：连接与登录握手要能单独探，失败原因要落到具体一项。

    「填了 SMTP 但授权码过期 / 端口选错」过去唯一的暴露方式是用户注册不了，
    而运营在后台看不出任何异常。这里断言两件事：留空收件人时**只诊断不发信**
    （可以反复点），以及连不上时如实判 fail 并给出能照着改的文案。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-mail-diag-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="log",
        payment_provider="mock",
    )
    app = create_app(settings)
    database = app.state.database
    with database.session() as session:
        seed_settings(session)
        seed_admin(session, "admin@habridge.local", "smoke-admin-2026")

    closed_port = _closed_local_port()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        await client.post("/store/v1/auth/login", json=_admin_login_payload())

        # ---- log 模式：不发信是既定事实，必须报 skip 而不是 pass ---- #
        log_response = await client.post("/store-admin/v1/settings/mail/test", json={})
        log_data = log_response.json() if log_response.status_code == 200 else {}
        log_levels = _levels(log_data.get("checks") or [])
        check(
            "留空收件人时只做连接诊断（不产生任何投递尝试）",
            log_response.status_code == 200 and log_data.get("attempts") == 0,
            f"{log_response.status_code} attempts={log_data.get('attempts')}",
        )
        check(
            "log 模式下「投递方式」如实报 skip 且整体不通过",
            log_levels.get("mode") == "skip" and log_data.get("ok") is False,
            str(log_levels),
        )
        check(
            "log 模式下不做无意义的网络探测（dns / connect 均为 skip）",
            log_levels.get("dns") == "skip" and log_levels.get("connect") == "skip",
            str(log_levels),
        )

        # ---- smtp 模式 + 一个关着端口的本机地址：如实报「连不上」 ---- #
        with database.session() as session:
            setting = session.get(StoreSetting, 1)
            setting.mail_mode = "smtp"
            setting.smtp_host = "127.0.0.1"
            setting.smtp_port = closed_port
            setting.smtp_security = "plain"
        smtp_response = await client.post("/store-admin/v1/settings/mail/test", json={})
        smtp_data = smtp_response.json() if smtp_response.status_code == 200 else {}
        smtp_levels = _levels(smtp_data.get("checks") or [])
        check(
            "地址解析成功、连接被拒：结论分别落在 dns=pass 与 connect=fail",
            smtp_levels.get("dns") == "pass" and smtp_levels.get("connect") == "fail",
            str(smtp_levels),
        )
        check(
            "连接失败的文案要指出「端口上没有服务在听」这一层，而不是一句网络错误",
            "连接被拒绝" in str(smtp_data.get("message", "")),
            str(smtp_data.get("message", ""))[:200],
        )


async def check_upgrade_refund_revert() -> None:
    """升级单全额退款必须把授权**还原**回升级前，而不是整张作废。

    升级改的是用户此前已经付过钱的那张授权，而 ``License.order_id`` 仍然指着
    最早那张订单 —— 退款时按 ``License.order_id == 本单`` 是找不到它的，于是
    「钱退了、永久授权还在手里」。还原而不是作废：作废等于没收了他原来那笔消费。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-upgrade-refund-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
    )
    app = create_app(settings)
    database = app.state.database
    from store import fulfill
    from store.api.admin import _revoke_order_entitlements

    started = utcnow() - timedelta(days=5)
    expired_at = started + timedelta(days=30)

    with database.session() as session:
        seed_settings(session)
        module = Product(
            name="smoke 3D 交互包",
            product_code="homeos",
            price_cents=3990,
            validity_days=None,
            product_type="module",
            feature_codes_json=list_json(["module.3d_interaction"]),
            included_product_ids_json=list_json([]),
            active=True,
            fulfillment_mode="automatic",
        )
        timed = Product(
            name="smoke 时限主授权",
            product_code="homeos",
            price_cents=2900,
            validity_days=30,
            product_type="base",
            feature_codes_json=list_json(["editor.basic"]),
            included_product_ids_json=list_json([]),
            active=True,
            fulfillment_mode="automatic",
        )
        permanent = Product(
            name="smoke 永久主授权",
            product_code="homeos",
            price_cents=7990,
            validity_days=None,
            product_type="package",
            feature_codes_json=list_json(["editor.basic"]),
            # 套餐自带一个子商品：升级会据此写出 ``product_id == permanent.id``
            # 的权益行，退款时必须把它们停用（否则「钱退了、功能还在」）。
            included_product_ids_json=list_json([]),
            active=True,
            fulfillment_mode="automatic",
        )
        session.add_all([module, timed, permanent])
        session.flush()
        permanent.included_product_ids_json = list_json([module.id])
        session.flush()

        account = Account(
            email="upgrade-refund@habridge.local",
            password_hash=hash_password("smoke-upgrade-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(
            account_id=account.id, email=account.email, name=account.email
        )
        session.add(customer)
        session.flush()

        # ① 用户此前买过一张 30 天的授权（钱已经付过，退款不该把它收走）
        base_order = Order(
            order_no="HOMEOS-SMOKE-UPGRADE-BASE",
            lookup_token="smoke-upgrade-base",
            account_id=account.id,
            customer_id=customer.id,
            email=account.email,
            product_id=timed.id,
            product_name=timed.name,
            product_type="base",
            order_type="base",
            license_action="issue",
            original_amount_cents=2900,
            amount_cents=2900,
            status="fulfilled",
            fulfillment_mode="automatic",
            payment_provider="mock",
            paid_at=started,
            fulfilled_at=started,
        )
        session.add(base_order)
        session.flush()
        license = License(
            activation_code="HOMEOS-SMOKE-UPGRADE-000000000001",
            code_hint="SMOKE-UP",
            customer_id=customer.id,
            account_id=account.id,
            product_id=timed.id,
            order_id=base_order.id,
            product_name=timed.name,
            product_type="base",
            price_cents=2900,
            validity_days=30,
            issuance_source="payment_automatic",
            active=True,
            issued_at=started,
            access_started_at=started,
            access_expires_at=expired_at,
        )
        session.add(license)
        session.flush()
        base_order.license_id = license.id
        session.add(
            Entitlement(
                customer_id=customer.id,
                license_id=license.id,
                product_id=timed.id,
                product_name=timed.name,
                product_type="base",
                feature_code="editor.basic",
                active=True,
                starts_at=started,
            )
        )

        # ② 升级单就地升级这张授权
        upgrade = Order(
            order_no="HOMEOS-SMOKE-UPGRADE-0001",
            lookup_token="smoke-upgrade-token",
            account_id=account.id,
            customer_id=customer.id,
            email=account.email,
            product_id=permanent.id,
            product_name=permanent.name,
            product_type="package",
            order_type="upgrade",
            license_action="upgrade",
            target_license_id=license.id,
            original_amount_cents=7990,
            amount_cents=7990,
            status="paid",
            fulfillment_mode="automatic",
            payment_provider="mock",
            paid_at=utcnow(),
        )
        session.add(upgrade)
        session.flush()
        upgrade_id = upgrade.id

        fulfill.fulfill_order(session, order=upgrade, setting=session.get(StoreSetting, 1))
        session.flush()
        session.refresh(license)
        check(
            "升级就地把授权改为永久（保留激活码，不是另发一张）",
            license.product_id == permanent.id and license.access_expires_at is None,
            f"{license.product_id} expires={license.access_expires_at}",
        )
        snapshot = json.loads(upgrade.license_state_before_json or "{}")
        check(
            "升级单记录了「升级前」的授权快照",
            snapshot.get("product_id") == timed.id
            and snapshot.get("validity_days") == 30
            and str(snapshot.get("access_expires_at", "")).startswith(
                expired_at.isoformat()[:16]
            ),
            str(snapshot),
        )
        upgrade_entitlements = session.scalars(
            select(Entitlement).where(
                Entitlement.license_id == license.id,
                Entitlement.feature_code == "module.3d_interaction",
            )
        ).all()
        check(
            "升级带进来的套餐权益已发放",
            upgrade_entitlements
            and all(item.product_id == permanent.id for item in upgrade_entitlements),
            str([(item.feature_code, item.product_id) for item in upgrade_entitlements]),
        )

        # ③ 全额退款
        upgrade = session.get(Order, upgrade_id)
        upgrade.status = "refunded"
        upgrade.refunded_at = utcnow()
        _revoke_order_entitlements(session, upgrade)
        session.flush()
        session.refresh(license)
        check(
            "退款后授权回到升级前的商品（不是整张作废）",
            license.product_id == timed.id
            and license.validity_days == 30
            and license.price_cents == 2900,
            f"{license.product_id} days={license.validity_days}",
        )
        check(
            "退款后「永久」被收回：到期时间回到升级前那一刻",
            license.access_expires_at == expired_at,
            str(license.access_expires_at),
        )
        check(
            "退款后授权仍然有效 —— 用户原来那笔消费不该被没收",
            license.active is True and license.revoked_at is None,
            f"active={license.active} revoked={license.revoked_at}",
        )
        session.refresh(upgrade_entitlements[0])
        check(
            "升级带进来的权益已停用（钱退了、功能不能还在）",
            upgrade_entitlements[0].active is False,
            str(upgrade_entitlements[0].active),
        )
        original = session.scalars(
            select(Entitlement).where(
                Entitlement.license_id == license.id,
                Entitlement.feature_code == "editor.basic",
            )
        ).first()
        check(
            "用户原有的权益没有被连带关掉",
            original is not None and original.active is True,
            str(original and original.active),
        )

        # ④ 幂等：退款重试（重推通知、运营重复点）不该把状态改坏
        _revoke_order_entitlements(session, upgrade)
        session.flush()
        session.refresh(license)
        check(
            "重复退款是幂等的（授权仍是还原后的样子）",
            license.product_id == timed.id and license.access_expires_at == expired_at,
            f"{license.product_id} expires={license.access_expires_at}",
        )


async def check_stock_reservation_flag() -> None:
    """库存预留的「还占不占」必须只有一个事实来源：``stock_reservation_released_at``。

    过去的判据是调用方各自看 ``order.status`` 反推，而状态与预留的生命周期并不一致
    —— 复活单（expired 之后才收到钱）的预留早就还了，按状态反推会**再释放一次**，
    扣掉的是别人待支付订单的预留（等于放开超卖）；``recompute_reserved_stock``
    还会把复活单算成占用，这个「自愈」动作反而把占用虚增上去。

    顺带覆盖两个相邻缺陷：``expires_at IS NULL`` 的历史单永远扫不到（一直占着预留
    卡住整个账号下单），以及 ``needs_review`` 只能置位、无法清除（待办永久噪声）。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-reservation-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
        order_ttl_seconds=120,
    )
    app = create_app(settings)
    database = app.state.database
    from store import fulfill
    from store.api.store import _expire_stale_orders

    with database.session() as session:
        seed_settings(session)
        seed_admin(session, "admin@habridge.local", "smoke-admin-2026")
        product = Product(
            name="smoke 限量商品",
            product_code="homeos",
            price_cents=990,
            validity_days=None,
            product_type="base",
            feature_codes_json=list_json(["editor.basic"]),
            included_product_ids_json=list_json([]),
            active=True,
            fulfillment_mode="automatic",
            stock_quantity=5,
            # 故意写错缓存值：下面靠 ``recompute_reserved_stock`` 把它纠正成 1
            # （只有 holding 那一笔仍占预留）。按状态反推的老实现会算成 2。
            reserved_stock=9,
        )
        session.add(product)
        session.flush()
        account = Account(
            email="reservation@habridge.local",
            password_hash=hash_password("smoke-reservation-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(
            account_id=account.id, email=account.email, name=account.email
        )
        session.add(customer)
        session.flush()

        def _order(order_no: str, status: str, *, released: bool, expires_at=None):
            order = Order(
                order_no=order_no,
                lookup_token=f"{order_no}-token",
                account_id=account.id,
                customer_id=customer.id,
                email=account.email,
                product_id=product.id,
                product_name=product.name,
                product_type="base",
                order_type="base",
                license_action="issue",
                original_amount_cents=990,
                amount_cents=990,
                status=status,
                fulfillment_mode="automatic",
                payment_provider="mock",
                expires_at=expires_at,
                stock_reservation_released_at=utcnow() if released else None,
                paid_at=utcnow() if status == "paid" else None,
            )
            session.add(order)
            session.flush()
            return order

        holding = _order("HOMEOS-SMOKE-RESERVE-HOLD", "pending", released=False)
        # 复活单：钱到账了（paid），但预留早在 expired 那一刻还掉了，需要人工复核
        revived = _order("HOMEOS-SMOKE-RESERVE-REVIVE", "paid", released=True)
        revived.needs_review = True
        session.flush()

        changes = fulfill.recompute_reserved_stock(session)
        check(
            "重算预留不把复活单算成占用（只认仍占用的那一笔，不是按状态数）",
            int(product.reserved_stock or 0) == 1 and changes.get(product.id) == -8,
            f"reserved={product.reserved_stock} changes={changes}",
        )

        # 复活单履约：不能再释放一次（那会扣掉 holding 那件）
        fulfill.fulfill_order(session, order=revived, setting=session.get(StoreSetting, 1))
        session.flush()
        session.refresh(product)
        check(
            "复活单履约不再二次释放预留（别人的预留不被扣掉）",
            int(product.reserved_stock or 0) == 1,
            str(product.reserved_stock),
        )
        check(
            "复活单履约照常把这一件从库存里扣掉（发码即售出）",
            int(product.stock_quantity or 0) == 4,
            str(product.stock_quantity),
        )
        check(
            "履约没有把「已归还预留」的标记抹掉",
            revived.stock_reservation_released_at is not None,
            str(revived.stock_reservation_released_at),
        )

        # 历史遗留单：expires_at 为 NULL，过去永远扫不到
        legacy = _order("HOMEOS-SMOKE-RESERVE-LEGACY", "pending", released=False)
        legacy.expires_at = None
        legacy.created_at = utcnow() - timedelta(seconds=int(settings.order_ttl_seconds) + 60)
        session.flush()
        _expire_stale_orders(session, session.get(StoreSetting, 1), settings)
        session.flush()
        session.refresh(legacy)
        check(
            "expires_at 为 NULL 的历史待支付单也会被扫描过期（不再永久卡住下单）",
            legacy.status == "expired",
            str(legacy.status),
        )
        check(
            "过期时同时归还预留并打上标记",
            legacy.stock_reservation_released_at is not None,
            str(legacy.stock_reservation_released_at),
        )
        session.refresh(holding)
        check(
            "到期扫描没有误伤未超时的订单",
            holding.status == "pending" and holding.stock_reservation_released_at is None,
            f"{holding.status} {holding.stock_reservation_released_at}",
        )
        revived_order_no = revived.order_no

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        await client.post("/store/v1/auth/login", json=_admin_login_payload())
        review = await client.post(
            f"/store-admin/v1/orders/{revived_order_no}/review",
            json={"note": "已确认补货"},
        )
        review_data = review.json() if review.status_code == 200 else {}
        check(
            "needs_review 有清除路径（否则待办告警是永久噪声）",
            review.status_code == 200 and review_data.get("needsReview") is False,
            f"{review.status_code} {review_data.get('needsReview')}",
        )
        check(
            "复核结论追加进备注（保留原始原因，不覆盖）",
            "已确认补货" in str(review_data.get("reviewNote", "")),
            str(review_data.get("reviewNote", ""))[:120],
        )
        with database.session() as session:
            pending_order = session.scalars(
                select(Order).where(Order.order_no == "HOMEOS-SMOKE-RESERVE-HOLD")
            ).first()
            pending_order.status = "pending"
        unpayable = await client.post(
            "/store-admin/v1/orders/HOMEOS-SMOKE-RESERVE-HOLD/review", json={}
        )
        check(
            "待支付订单不允许标记「已处理」（钱还没到账）",
            unpayable.status_code == 409,
            str(unpayable.status_code),
        )


async def check_referral_wallet_atomic() -> None:
    """邀请钱包的冻结/审批必须是原子的：并发丢更新等于可以重复套现。

    过去的写法是 ORM 属性「读-改-写」：两个并发提现申请各自基于同一个旧 ``frozen``
    计算，后写的一方把先写的整个覆盖 —— 账面只冻结一次，却挂着两笔待审提现，
    两次审批后 ``frozen`` 变负、``withdrawn`` 翻倍。这里用两个**真正独立的会话**
    复现丢更新的现场（第二个会话先读、再让第一个提交、最后才写）。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-referral-atomic-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
    )
    app = create_app(settings)
    database = app.state.database
    from store import referrals

    with database.session() as session:
        seed_settings(session)
        account = Account(
            email="wallet-atomic@habridge.local",
            password_hash=hash_password("smoke-wallet-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        account_id = account.id

    session_a = database.session_factory()
    session_b = database.session_factory()
    try:
        account = session_a.get(Account, account_id)
        wallet = referrals.get_or_create_wallet(session_a, account)
        wallet.balance = 100.0
        wallet.earned = 100.0
        wallet.frozen = 0.0
        session_a.commit()
        wallet_id = wallet.id

        # 会话 B 先读到 frozen=0，然后**主动提交**释放快照 —— 它的内存里仍然是旧值，
        # 但数据库里已经是新的了。这正是「读 - 改 - 写」丢更新的现场。
        stale_b = session_b.get(ReferralWallet, wallet_id)
        stale_b_frozen = float(stale_b.frozen or 0.0)
        session_b.commit()

        stale_a = session_a.get(ReferralWallet, wallet_id)
        first = referrals.create_withdrawal(
            session_a,
            stale_a,
            points=60.0,
            request_key="smoke-atomic-0001",
            fee_percent=1.0,
        )
        session_a.commit()

        conflict = ""
        try:
            referrals.create_withdrawal(
                session_b,
                stale_b,
                points=60.0,
                request_key="smoke-atomic-0002",
                fee_percent=1.0,
            )
        except referrals.WalletConflictError as error:
            conflict = str(error)
        session_b.rollback()
        check(
            "并发冻结的第二次被条件 UPDATE 抢单挡下（不会各插一条待审提现）",
            stale_b_frozen == 0.0 and bool(conflict),
            conflict or "第二次竟然成功了",
        )
        session_a.refresh(stale_a)
        check(
            "冻结只生效一次：frozen 没有被覆盖成同一个值",
            float(stale_a.frozen or 0.0) == 60.0,
            str(stale_a.frozen),
        )
        check(
            "可用积分没有被并发放大（100 - 60 = 40）",
            referrals.available_points(stale_a) == 40.0,
            str(referrals.available_points(stale_a)),
        )

        # 双击审批：两个会话都看到 pending，只有抢到状态迁移的那一次能动账
        wd_b = session_b.get(ReferralWithdrawal, first.id)
        wd_b_status = wd_b.status
        session_b.commit()
        wd_a = session_a.get(ReferralWithdrawal, first.id)
        referrals.resolve_withdrawal(session_a, wd_a, approve=True)
        session_a.commit()
        referrals.resolve_withdrawal(session_b, wd_b, approve=True)
        session_b.rollback()
        session_a.refresh(stale_a)
        check(
            "双击审批不把 frozen 扣成负数",
            wd_b_status == "pending" and float(stale_a.frozen or 0.0) == 0.0,
            f"status={wd_b_status} frozen={stale_a.frozen}",
        )
        check(
            "双击审批不让 withdrawn 翻倍",
            float(stale_a.withdrawn or 0.0) == 60.0,
            str(stale_a.withdrawn),
        )
        check(
            "审批后的余额与账本一致（100 - 60 = 40）",
            float(stale_a.balance or 0.0) == 40.0,
            str(stale_a.balance),
        )
    finally:
        session_b.close()
        session_a.close()


async def check_coupon_parity() -> None:
    """优惠码的预览与下单必须同口径，且预览不能绕过限流。

    人工发卡商品由运营手工核对后发码，折扣没法自动结算 —— 关键是**两条路径都
    拒绝**。过去下单路径静默忽略优惠码、预览照常打折：界面显示「¥50 → ¥25」，
    结账按 ¥50 收，用户多付了钱且没有任何提示。预览还是一个天然判定 oracle
    （每次都返回精确折扣额），不设限流等于开了一个无限次爆破接口。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-coupon-parity-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
    )
    app = create_app(settings)
    database = app.state.database
    from store.api.store import _MANUAL_COUPON_DETAIL

    email = "coupon-parity@habridge.local"
    password = "smoke-coupon-2026"
    with database.session() as session:
        seed_settings(session)
        products = seed_products(session)
        manual = Product(
            name="smoke 人工发卡商品",
            product_code="homeos",
            price_cents=5000,
            validity_days=None,
            product_type="base",
            feature_codes_json=list_json(["editor.basic"]),
            included_product_ids_json=list_json([]),
            active=True,
            fulfillment_mode="manual",
        )
        session.add(manual)
        session.add(
            Coupon(
                code="SMOKE50",
                description="smoke 五折",
                discount_type="percent",
                percent=50.0,
                active=True,
                per_account_limit=1,
            )
        )
        account = Account(
            email=email,
            password_hash=hash_password(password),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        session.add(Customer(account_id=account.id, email=email, name=email))
        session.flush()
        manual_id = manual.id
        base_id = products["base"].id

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        await client.post(
            "/store/v1/auth/login", json={"email": email, "password": password}
        )
        preview = await client.post(
            "/store/v1/coupons/preview",
            json={"productId": manual_id, "couponCode": "SMOKE50"},
        )
        try:
            preview_data = preview.json()
        except ValueError:
            preview_data = {}
        check(
            "人工发卡商品的预览**拒绝**优惠码（不再显示折后价骗人）",
            preview.status_code == 422
            and preview_data.get("detail") == _MANUAL_COUPON_DETAIL,
            f"{preview.status_code} {preview_data.get('detail')}",
        )
        order = await client.post(
            "/store/v1/orders",
            json={"productId": manual_id, "couponCode": "SMOKE50"},
        )
        try:
            order_data = order.json()
        except ValueError:
            order_data = {}
        check(
            "下单与预览同口径：人工发卡商品同样 422（而不是静默按原价收款）",
            order.status_code == 422 and order_data.get("detail") == _MANUAL_COUPON_DETAIL,
            f"{order.status_code} {order_data.get('detail')}",
        )

        # 限流：预览必须复用下单那条同一份计数（否则爆破是免费的）
        statuses = []
        for _ in range(9):
            attempt = await client.post(
                "/store/v1/coupons/preview",
                json={"productId": base_id, "couponCode": "NOPE-NOT-A-CODE"},
            )
            statuses.append(attempt.status_code)
        check(
            "预览也会被优惠码限流拦下（第 9 次起 429，爆破不再免费）",
            statuses[:8] == [404] * 8 and statuses[8] == 429,
            str(statuses),
        )


async def check_entitlement_patch_validation() -> None:
    """后台改功能码必须与创建时同一套校验。

    功能码写错不会报任何错：后台显示已发放、客户端的 ``allows`` 一直拒绝
    （表现是「功能打不开」）。创建时校验、编辑时不校验，等于给同一条规则留了后门。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-entitlement-patch-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        payment_provider="mock",
    )
    app = create_app(settings)
    database = app.state.database

    with database.session() as session:
        seed_settings(session)
        products = seed_products(session)
        seed_admin(session, "admin@habridge.local", "smoke-admin-2026")
        account = Account(
            email="entitlement@habridge.local",
            password_hash=hash_password("smoke-entitlement-2026"),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        customer = Customer(account_id=account.id, email=account.email, name=account.email)
        session.add(customer)
        session.flush()
        license = License(
            activation_code="HOMEOS-SMOKE-ENTITLEMENT-00000001",
            code_hint="SMOKE-ENT",
            customer_id=customer.id,
            account_id=account.id,
            product_id=products["base"].id,
            product_name=products["base"].name,
            product_type="base",
            issuance_source="manual",
            active=True,
            issued_at=utcnow(),
            access_started_at=utcnow(),
        )
        session.add(license)
        session.flush()
        entry = Entitlement(
            customer_id=customer.id,
            license_id=license.id,
            product_id=products["module"].id,
            product_name=products["module"].name,
            product_type="module",
            feature_code="module.3d_interaction",
            active=True,
            starts_at=utcnow(),
        )
        session.add(entry)
        session.flush()
        entry_id = entry.id

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://store.test"
    ) as client:
        await client.post("/store/v1/auth/login", json=_admin_login_payload())
        invalid = await client.patch(
            f"/store-admin/v1/entitlements/{entry_id}",
            json={"featureCode": "smoke.not.a.feature"},
        )
        check(
            "PATCH 传非法功能码必须 422（否则后台显示已发放、客户端打不开）",
            invalid.status_code == 422,
            f"{invalid.status_code} {invalid.text[:140]}",
        )
        valid = await client.patch(
            f"/store-admin/v1/entitlements/{entry_id}", json={"featureCode": "display"}
        )
        check(
            "合法功能码仍然可以改（校验不是一刀切）",
            valid.status_code == 200
            and valid.json().get("featureCode") == "display",
            f"{valid.status_code} {valid.text[:140]}",
        )


async def check_echo_exposure_scope() -> None:
    """``echo`` 模式只在**本机**回显验证码。

    echo 的文案本来就写着「仅本地」，但一旦生产被切到 echo（手滑、或照抄了本地
    环境变量），它就变成一条账号接管路径：攻击者对受害者邮箱调一次「发送验证码」，
    响应里直接拿到重置码。非本机一律按 log 处理（验证码仍进服务端日志，运营能捞）。
    """
    workdir = Path(tempfile.mkdtemp(prefix="hb-store-echo-scope-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        expose_verification_code=True,
        payment_provider="mock",
    )
    app = create_app(settings)
    with app.state.database.session() as session:
        seed_settings(session)

    loopback_transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 51234))
    async with httpx.AsyncClient(
        transport=loopback_transport, base_url="http://store.test"
    ) as local_client:
        response = await local_client.post(
            "/store/v1/verifications",
            json={"email": "echo-local@habridge.local", "purpose": "register"},
        )
        local_data = response.json() if response.status_code == 200 else {}
        check(
            "本机客户端下 echo 仍然回显验证码（本地联调不受影响）",
            response.status_code == 200 and bool(local_data.get("code")),
            f"{response.status_code} code={bool(local_data.get('code'))}",
        )

    remote_transport = httpx.ASGITransport(app=app, client=("203.0.113.9", 51235))
    async with httpx.AsyncClient(
        transport=remote_transport, base_url="http://store.test"
    ) as remote_client:
        response = await remote_client.post(
            "/store/v1/verifications",
            json={"email": "echo-remote@habridge.local", "purpose": "register"},
        )
        remote_data = response.json() if response.status_code == 200 else {}
        check(
            "非本机客户端下 echo 不再回显验证码（堵掉账号接管路径）",
            response.status_code == 200 and "code" not in remote_data,
            f"{response.status_code} {remote_data}",
        )
        check(
            "非本机时不回显的提示要说明验证码去了哪里（运营能去日志里捞）",
            "本机" in str(remote_data.get("devNotice", "")),
            str(remote_data.get("devNotice", ""))[:160],
        )


def check_setup_admin_guard() -> None:
    """首次初始化的守卫必须真的在，且接线顺序正确。

    ``POST /api/v1/setup/admin`` 刻意不要求身份（首次设置时还没有账号可登），
    所以它天然是「谁能连上，谁就先把自己设成管理员」。修复前的实测路径就是：
    ``GET /setup/status`` 看到 ``initialized=false`` → 一次 POST 拿到 201 与
    ``role=admin`` 会话 → 随后可写 HA 连接（含长期令牌）、配对中控、导出日志。

    判定逻辑不好用纯文本断言，所以这里分两层：
    1. 真跑一遍 SetupGuard（本机 / 远程 / 转发头 / 限流 / 密钥作废）；
    2. 静态钉住接线位置 —— ``authorize`` 必须排在 ``hash_password`` 之前，否则
       未授权的请求照样能让服务端烧 argon2（免费打满 CPU 的办法）。
    """
    from fastapi import HTTPException
    from starlette.requests import Request as StarletteRequest

    guard_module = load_module("hb_setup_guard", PROJECT_ROOT / "backend" / "app" / "setup_guard.py")
    limiter_module = load_module(
        "hb_setup_limiter", PROJECT_ROOT / "backend" / "app" / "auth_limiter.py"
    )

    workdir = Path(tempfile.mkdtemp(prefix="hb-setup-guard-"))
    limiter = limiter_module.LoginAttemptLimiter()
    app_state = types.SimpleNamespace(state=types.SimpleNamespace(login_limiter=limiter))

    def build_request(host: str, *extra_headers: tuple[str, str]) -> StarletteRequest:
        """构造一个真实 Request：authorize 只看对端地址、请求头和 app.state。"""
        return StarletteRequest(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/api/v1/setup/admin",
                "raw_path": b"/api/v1/setup/admin",
                "query_string": b"",
                "headers": [(key.lower().encode(), value.encode()) for key, value in extra_headers],
                "client": (host, 40123),
                "server": ("testserver", 80),
                "app": app_state,
            }
        )

    def rejected(call) -> tuple[int | None, str]:
        """执行一次应被拒绝的授权；返回 (状态码, 文案)。"""
        try:
            call()
        except HTTPException as error:
            return error.status_code, str(error.detail)
        return None, ""

    guard = guard_module.SetupGuard(workdir, "", event_log=None)
    token = guard.ensure_token()
    token_path = workdir / "setup-token"
    check(
        "首次启动生成引导密钥并落到 0600 的 private 文件",
        token_path.is_file()
        and stat.S_IMODE(token_path.stat().st_mode) == 0o600
        and len(token) >= 32,
        f"{token_path} mode={oct(stat.S_IMODE(token_path.stat().st_mode)) if token_path.is_file() else 'n/a'} len={len(token)}",
    )
    check(
        "密钥文件内容与内存里给出的那份一致（重启后仍可用同一份）",
        token_path.is_file() and token_path.read_text(encoding="utf-8").strip() == token,
    )
    check(
        "再次 ensure_token 不会换掉密钥（初始化窗口中断重启后运维手上那份仍有效）",
        guard.ensure_token() == token,
    )

    # 远程来源：不带密钥、带错密钥都必须 403，且不能因此认为已授权。
    remote_status, _ = rejected(
        lambda: guard.authorize(build_request("203.0.113.7"), "")
    )
    check("远程来源不带引导密钥 → 403", remote_status == 403, str(remote_status))
    wrong_status, _ = rejected(
        lambda: guard.authorize(build_request("203.0.113.7"), "wrong-token")
    )
    check("远程来源密钥错误 → 403", wrong_status == 403, str(wrong_status))
    header_status, _ = rejected(
        lambda: guard.authorize(build_request("203.0.113.7", ("X-Setup-Token", "wrong")), "")
    )
    check("X-Setup-Token 头同样会被校验（错的就是 403）", header_status == 403, str(header_status))

    # 本机直连：放行；但一旦带转发头就说明前面有代理，不能再按本机算。
    local_status, _ = rejected(lambda: guard.authorize(build_request("127.0.0.1"), ""))
    check("本机直连（未经代理）无需密钥即放行", local_status is None, str(local_status))
    rebuilt_proxy = rejected(
        lambda: guard.authorize(build_request("127.0.0.1", ("X-Forwarded-For", "203.0.113.7")), "")
    )
    check(
        "同机反向代理过来的请求不再算本机（否则公网等于没守卫）",
        rebuilt_proxy[0] == 403,
        str(rebuilt_proxy[0]),
    )

    # 正确密钥：两条投递方式都要能过。
    body_ok, _ = rejected(lambda: guard.authorize(build_request("203.0.113.7"), token))
    check("远程来源带正确密钥 → 放行", body_ok is None, str(body_ok))
    header_ok, _ = rejected(
        lambda: guard.authorize(build_request("203.0.113.7", ("X-Setup-Token", token)), "")
    )
    check("远程来源用 X-Setup-Token 头带正确密钥 → 放行", header_ok is None, str(header_ok))

    # 限流：连续猜密钥要能被拦住，而不是可以无限试。
    codes = []
    for _ in range(8):
        codes.append(rejected(lambda: guard.authorize(build_request("198.51.100.9"), "nope"))[0])
    check(
        "同一来源连续猜密钥最终会被限流（出现 429）",
        429 in codes,
        "序列=" + ",".join(str(code) for code in codes),
    )
    retry_after = ""
    try:
        guard.authorize(build_request("198.51.100.9"), "nope")
    except HTTPException as error:
        retry_after = str(error.headers.get("Retry-After", ""))
    check(
        "429 要带 Retry-After（前端与运维都能知道多久后再试）",
        retry_after.isdigit() and int(retry_after) > 0,
        f"Retry-After={retry_after}",
    )

    # 初始化成功即作废：文件删掉，旧密钥不能再用来抢一次管理员。
    guard.consume()
    check(
        "初始化成功后引导密钥文件被删除",
        not token_path.exists(),
    )
    after_consume, _ = rejected(lambda: guard.authorize(build_request("203.0.113.7"), token))
    check("初始化成功后旧密钥作废（再用是 403）", after_consume == 403, str(after_consume))

    # 用 APP_SETUP_TOKEN 指定时不该再往磁盘写一份。
    env_dir = Path(tempfile.mkdtemp(prefix="hb-setup-guard-env-"))
    env_guard = guard_module.SetupGuard(env_dir, "from-env-token", event_log=None)
    check(
        "APP_SETUP_TOKEN 已配置时不再生成文件（部署方自己持有密钥）",
        env_guard.ensure_token() == "from-env-token" and not (env_dir / "setup-token").exists(),
    )

    # ---- 静态接线：守卫在，且顺序对 ----
    auth_source = (PROJECT_ROOT / "backend" / "app" / "api" / "auth.py").read_text(encoding="utf-8")
    setup_body = auth_source.split("def setup_admin(", 1)[-1].split("def login(", 1)[0]
    check(
        "setup_admin 里先过守卫、再算 argon2（未授权请求换不到 CPU）",
        "setup_guard.authorize(" in setup_body
        and 0 <= setup_body.index("setup_guard.authorize(") < setup_body.index("hash_password("),
    )
    check(
        "初始化成功后立即作废引导密钥（consume）",
        "setup_guard.consume()" in setup_body,
    )
    main_source = (PROJECT_ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
    check(
        "lifespan 里建好守卫，并在未初始化时打印引导密钥",
        "SetupGuard(" in main_source and "announce_setup_window(" in main_source,
    )
    config_source = (PROJECT_ROOT / "backend" / "app" / "config.py").read_text(encoding="utf-8")
    check(
        "引导密钥可由 APP_SETUP_TOKEN 指定",
        "APP_SETUP_TOKEN" in config_source and "setup_token" in config_source,
    )
    check(
        "请求体字段 setupToken 与前端 setup.js 对齐",
        "setupToken" in (PROJECT_ROOT / "backend" / "app" / "schemas.py").read_text(encoding="utf-8")
        and "setupToken"
        in (PROJECT_ROOT / "frontend" / "static" / "setup.js").read_text(encoding="utf-8"),
    )
    guard_lines = [
        line
        for line in (PROJECT_ROOT / "backend" / "app" / "setup_guard.py")
        .read_text(encoding="utf-8")
        .splitlines()
        if ".append(" in line
    ]
    check(
        "引导密钥不写进全局日志正文（全局日志可导出，等于把管理员送出去）",
        bool(guard_lines) and not any("token" in line for line in guard_lines),
        "；".join(guard_lines),
    )


def check_global_log_write_amplification() -> None:
    """全局日志不能把「请求量」放大成「磁盘读写量」（审计 H1）。

    修复前有三个放大器叠在一起，任何匿名客户端都能触发：
    1. 诊断中间件在事件循环里同步 ``append`` —— 4xx/5xx 当场做磁盘 I/O；
    2. 去重签名里含 ``requestId`` / ``durationMs``（逐请求变化），刷屏时
       「5 秒折叠」完全失效，日志文件行数直接等于请求数；
    3. 文件一旦超过 ``max_bytes``，**每次** append 都触发一次
       「读全量 + 解析 + 全量重写 + fsync」（实测 5 MiB 文件约 50 ms/次）。
    于是「先匿名把日志顶到上限，再高频打任意 401 接口」就等于自造的 DoS。

    这里用真实的 GlobalLogStore 钉住修复后的三条性质：append 不碰磁盘、
    同源刷屏折叠成 1 行、超限期间不再逐次全量重写。
    """
    module = load_module("hb_global_log", PROJECT_ROOT / "backend" / "app" / "global_log.py")
    workdir = Path(tempfile.mkdtemp(prefix="hb-global-log-"))

    def new_store(name: str, *, max_bytes: int = 65536):
        store = module.GlobalLogStore(workdir / name, max_bytes=max_bytes)
        # 自检不等人：把刷盘节奏压快，折叠窗口也压到 0.2 秒。
        store.FLUSH_INTERVAL_SECONDS = 0.01
        store.FOLD_WINDOW_SECONDS = 0.2
        store.FOLD_WRITE_INTERVAL_SECONDS = 0.2
        return store

    def wait_drain(store, timeout: float = 10.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with store._lock:
                if not store._pending:
                    return
            time.sleep(0.005)

    def lines_on_disk(store) -> list[str]:
        if not store.path.exists():
            return []
        return [line for line in store.path.read_text(encoding="utf-8").splitlines() if line.strip()]

    # ---------------- 1. append 不做磁盘 I/O ----------------
    store = new_store("io")
    store.append("info", "系统后台", "系统", "预热")
    wait_drain(store)
    size_before = store.path.stat().st_size
    # 拿住内部锁 = 把后台写线程挡在门外，此时文件不可能增长。
    with store._lock:
        for index in range(50):
            store.append("warning", "系统后台", "接口", f"接口返回错误：GET /api/v1/hold/{index} · HTTP 401")
        size_locked = store.path.stat().st_size
        pending = len(store._pending)
    check(
        "append 只入队、不落盘（调用方可能是事件循环里的中间件）",
        size_locked == size_before and pending == 50,
        f"{size_before} → {size_locked}，pending={pending}",
    )
    visible = store.list_events(limit=None)
    check(
        "未落盘的事件也能立刻读到（前端不会觉得日志丢了）",
        any("hold/49" in str(item.get("message")) for item in visible),
        f"{len(visible)} 条",
    )
    store.stop()
    check(
        "stop() 把剩余事件全部刷盘且线程退出",
        len(store._read_events()) >= 51 and not store._writer.is_alive(),
        f"{len(store._read_events())} 条",
    )

    # ---------------- 2. 同源刷屏折叠成一行 ----------------
    store = new_store("fold")
    for _ in range(300):
        store.append(
            "warning",
            "系统后台",
            "接口",
            "接口返回错误：GET /api/v1/auth/me · HTTP 401",
            context={"requestId": uuid4().hex, "method": "GET", "path": "/api/v1/auth/me", "status": 401, "durationMs": 1.5},
        )
    wait_drain(store)
    folded_lines = lines_on_disk(store)
    live = [item for item in store.list_events(limit=None) if "auth/me" in str(item.get("message"))]
    check(
        "300 次同源刷屏只落 1 行（修复前 300 行）",
        len(folded_lines) == 1,
        f"{len(folded_lines)} 行",
    )
    check(
        "折叠后计数仍准确（读接口立刻看到最新 repeatCount）",
        len(live) == 1 and live[0].get("repeatCount") == 300,
        str([item.get("repeatCount") for item in live]),
    )
    # 窗口结束后补写最终快照：文件多 1 行，但读到的仍是同一条、计数不变。
    time.sleep(1.0)
    store._wake.set()
    wait_drain(store)
    final = [item for item in store.list_events(limit=None) if "auth/me" in str(item.get("message"))]
    check(
        "窗口结束只补 1 行最终快照（同 id 去重后计数仍是 300）",
        len(lines_on_disk(store)) == 2 and len(final) == 1 and final[0].get("repeatCount") == 300,
        f"{len(lines_on_disk(store))} 行 / {[item.get('repeatCount') for item in final]}",
    )
    # 反向保护：真的不同的事件不能被折叠掉。
    for index in range(30):
        store.append(
            "warning",
            "系统后台",
            "接口",
            f"接口返回错误：GET /api/v1/other/{index} · HTTP 401",
            context={"requestId": uuid4().hex, "path": f"/api/v1/other/{index}", "status": 401},
        )
    wait_drain(store)
    check("不同 path 的错误不会被误折叠", len(lines_on_disk(store)) == 32, f"{len(lines_on_disk(store))} 行")
    store.stop()

    # ---------------- 3. 超限期间不再逐次全量重写 ----------------
    store = new_store("prune")
    filler = "x" * 400
    written = 0
    while written < 4000:
        for index in range(100):
            number = written + index
            store.append(
                "warning",
                "系统后台",
                "接口",
                f"接口返回错误：GET /api/v1/flood/{number} · HTTP 401 · {filler}",
                context={"requestId": uuid4().hex, "path": f"/api/v1/flood/{number}", "status": 401},
            )
        written += 100
        wait_drain(store)
        if store.path.stat().st_size > store.max_bytes:
            break
    check("能把日志灌到超过上限（构造前置条件）", store.path.stat().st_size > store.max_bytes, f"{store.path.stat().st_size} > {store.max_bytes}")
    store.prune_now()
    check("裁剪仍然把文件收回上限内", store.path.stat().st_size <= store.max_bytes, f"{store.path.stat().st_size}")
    prunes_before = store._prune_count
    size_before = store.path.stat().st_size
    for index in range(100):
        store.append(
            "warning",
            "系统后台",
            "接口",
            f"接口返回错误：GET /api/v1/hammer/{index} · HTTP 401",
            context={"requestId": uuid4().hex, "path": f"/api/v1/hammer/{index}", "status": 401},
        )
        if index % 20 == 0:
            time.sleep(0.02)
            wait_drain(store)
    wait_drain(store)
    check(
        "超限期间高频写入不再触发全量重写（修复前每次写入都重写）",
        store._prune_count == prunes_before,
        f"pruneCount {prunes_before} → {store._prune_count}",
    )
    check(
        "超限期间文件只按追加量增长，没有重写量",
        store.path.stat().st_size - size_before < 200 * 1024,
        f"增长 {store.path.stat().st_size - size_before} 字节",
    )
    check("裁剪保留最新事件而不是清空文件", len(store.list_events(limit=None, search="hammer/99")) == 1)
    store.stop()

    # ---------------- 4. 静态接线：写线程与去抖裁剪必须在 ----------------
    source = (PROJECT_ROOT / "backend" / "app" / "global_log.py").read_text(encoding="utf-8")
    check(
        "落盘走独立写线程（请求路径不做磁盘 I/O）",
        "global-log-writer" in source and "def _writer_loop" in source and "daemon=True" in source,
    )
    check(
        "裁剪带最小间隔，且 oversized 不能绕过它",
        "PRUNE_MIN_INTERVAL_SECONDS" in source and "elapsed < timedelta(seconds=self.PRUNE_MIN_INTERVAL_SECONDS)" in source,
    )
    check(
        "去重签名剔除逐请求变化的字段（否则折叠形同虚设）",
        "_VOLATILE_CONTEXT_KEYS" in source and '"requestId"' in source and '"durationMs"' in source,
    )
    main_source = (PROJECT_ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
    check(
        "应用关闭时刷盘并回收写线程（否则最后一条日志会丢）",
        "global_log.stop()" in main_source,
    )


def check_upload_size_cap() -> None:
    """``POST /api/v1/assets/user`` 必须有请求体字节上限（审计 H3）。

    修复前是 ``async for chunk in request.stream(): descriptor.write(chunk)``：
    没有任何字节上限，一个请求就能把磁盘写满（连带拖垮 SQLite WAL、日志与导出），
    而体积校验（Pillow 解析）发生在整段写完之后 —— 那时磁盘已经被占了。

    上面这三种上传（正常图 / 伪造 Content-Length / 分块超限）要真发请求才覆盖得到，
    这里用静态断言钉住三处关键接线，防止回归时把早拒或逐块计数删掉。
    """
    source = (PROJECT_ROOT / "backend" / "app" / "api" / "assets.py").read_text(encoding="utf-8")
    # 只看真正的上传处理函数体：模块文档里会引用修复前的旧写法，不能拿来判断顺序。
    body = source[source.index("async def upload_user_asset") :]
    check("存在统一的字节上限常量", "MAX_UPLOAD_BYTES" in source, "assets.py")
    check(
        "超过声明的 Content-Length 时在读体之前就拒绝（413）",
        "content-length" in body
        and "status_code = 413" in body
        and body.index("content-length") < body.index("request.stream()"),
        "早拒必须排在读流之前",
    )
    check(
        "流式写入按累计字节数兜底（分块传输 / 不带 Content-Length 也拦得住）",
        "received" in body and "byte_limit" in body,
    )


def check_display_pairing_hardening() -> None:
    """中控配对码的生命周期与限流（审计 H2）。

    修复前：6 位数字、永不过期、可无限复用；只有按 IP 的失败计数（5/300 秒），
    换 IP 就能继续穷举；更糟的是拿一个已经在用的配对码再次配对会**顶掉**原来那台
    平板的令牌（不删行、只覆盖 token_hash 并清掉 revoked_at），等于用一张照片把
    合法设备挤下线。另外被拦截时走的是 ``limiter.block_seconds(...)``（int 当函数
    调）→ 抛 TypeError → 返回 500 而不是 429。

    上面这些行为（首次配对、重复配对 409、解绑后重配、旧令牌失效、按 IP 与跨来源
    两档限流）要真发请求才覆盖得到，这里钉住关键接线。
    """
    source = (PROJECT_ROOT / "backend" / "app" / "api" / "displays.py").read_text(encoding="utf-8")
    check("配对失败有跨来源的全局预算（换 IP 也躲不掉）", "PAIRING_GLOBAL_LIMIT" in source and "PAIRING_GLOBAL_KEY" in source)
    check(
        "被限流时返回 429 + Retry-After（block_seconds 是属性，不是方法）",
        "limiter.block_seconds" in source and "limiter.block_seconds(" not in source and "Retry-After" in source,
    )
    check(
        "正在用的设备不会被同一个配对码顶掉（409 冲突）",
        "HTTP_409_CONFLICT" in source,
    )
    check(
        "配对前检查授权能力（授权收回后旧码也换不出令牌）",
        "allows('display')" in source or 'allows("display")' in source,
    )
    check(
        "后台列表提供解绑入口（否则 409 之后没法恢复）",
        '"DELETE"' in (PROJECT_ROOT / "frontend" / "static" / "home.js").read_text(encoding="utf-8")
        and '"/displays/"' in (PROJECT_ROOT / "frontend" / "static" / "home.js").read_text(encoding="utf-8"),
    )


async def run() -> int:
    client_crypto = load_module("hb_client_crypto", CLIENT_CRYPTO_PATH)

    # 自检里大量用例刻意走模拟收银台（下单 → 模拟支付 → 拿激活码）。模拟收银台默认
    # 是关闭的（fail-closed，见 store/payments/__init__.resolve_provider），这里显式
    # 打开，只作用在本进程内。注意：单个用例若还要覆盖「禁止 mock」的行为，必须自己
    # 传 allow_mock_payments=False 的 settings，不能依赖这个环境变量。
    os.environ.setdefault("STORE_ALLOW_MOCK_PAYMENTS", "1")

    # 纯静态检查放在流程末尾统一跑（见下面第 11 节），这里只放不需要建库的
    # 单元检查与各自带临时库的流程检查
    # 注意 await：这类函数是 async 的，漏掉 await 不会报错，只会静默不执行
    # （Python 仅打一条 RuntimeWarning），整段断言就成了摆设 —— 这里曾经就这样漏过。
    await check_payment_provider_fail_closed()
    check_seed_requires_credentials()
    await check_login_throttle_persists()
    check_alipay_signing()
    check_alipay_sign_type_guard()
    check_mail_settings_merge()
    check_mail_presets()
    await check_verification_isolation()
    await check_smtp_degrades_without_credentials()
    await check_alipay_notify_flow()
    check_payment_sweep_flow()
    await check_payment_sweep_edge_cases()
    await check_payment_sweep_loop_runs()
    # 站点配置的真实连通性诊断，以及本轮业务逻辑修复的专项断言。
    # 放在主流程之前：它们各自建临时库、且要故意把配置改坏。
    await check_alipay_diagnostics()
    await check_mail_diagnostics()
    await check_upgrade_refund_revert()
    await check_stock_reservation_flag()
    await check_referral_wallet_atomic()
    await check_coupon_parity()
    await check_entitlement_patch_validation()
    await check_echo_exposure_scope()
    check_setup_admin_guard()
    # 第 2 批 High 的专项断言：日志写入放大、上传体积、配对码生命周期。
    check_global_log_write_amplification()
    check_upload_size_cap()
    check_display_pairing_hardening()

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
        default_key_id=settings.license_key_id,
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
            {"provider", "enabled", "displayName", "icon", "transactionDescription",
             "configured", "available", "updatedAt"} <= set(config["payment"]),
            str(sorted(config["payment"])),
        )
        # 匿名可读的接口不该带商户凭据信息。这不是「少给点信息」的洁癖：
        # appId / 网关 / 「密钥尚未配置」暴露出去，等于告诉扫描器这个站值不值得下手、
        # 以及支付是否正处于未配置的脆弱状态。后台的 /settings 里照旧全都有。
        leaked = sorted(
            {"appId", "gatewayUrl", "applicationPrivateKeyConfigured",
             "alipayPublicKeyConfigured", "merchantOrderTemplate"} & set(config["payment"])
        )
        check(
            "公开 configuration 不泄露支付宝凭据信息",
            not leaked,
            f"泄露字段: {leaked}",
        )

        products_response = (await client.get("/store/v1/products")).json()
        items = products_response["items"]
        check("GET /products 返回三条商品", len(items) == 3, f"count={len(items)}")
        base = next(item for item in items if item["productType"] == "base")
        module = next(item for item in items if item["productType"] == "module")
        package = next(item for item in items if item["productType"] == "package")
        check("基础商品价格 4990", base["priceCents"] == 4990, str(base["priceCents"]))
        check("基础商品功能码 9 个", len(base["featureCodes"]) == 9, str(len(base["featureCodes"])))
        check("基础商品永久有效", base["validityDays"] is None, str(base["validityDays"]))
        check("3D 交互包功能码", module["featureCodes"] == ["module.3d_interaction"], str(module["featureCodes"]))
        check(
            "套餐包含 10 个功能码",
            len(package["featureCodes"]) == 10,
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
            updates["release"] and updates["release"]["version"] == "0.5.6",
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
            "激活码格式 HOMEOS-XXXX-…",
            activation_code.startswith("HOMEOS-") and len(activation_code.split("-")) == 7,
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
                body: dict = {}
                detail = ""
                try:
                    parsed = response.json()
                    if isinstance(parsed, dict):
                        body = parsed
                        detail = str(parsed.get("detail", ""))
                    else:
                        detail = str(parsed)
                except ValueError:
                    detail = response.text
                return response.status_code, detail, body
            return response.status_code, transport.decrypt_response(
                response.json(), path, response_key
            ), None

        status_code, activate, _ = await call_license(
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
            check("租约含 9 个基础功能码", len(payload["features"]) == 9, str(payload["features"]))
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

        status_code, heartbeat, _ = await call_license(
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

        status_code, recovered, _ = await call_license(
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
        status_code, detail, _ = await call_license(
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
            json={"productId": module_product_id, "targetLicenseId": activation_id},
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
        status_code, heartbeat, _ = await call_license(
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

        # 绑定列表按激活码搜：客户报过来的是激活码（或提示码），而绑定行上没有
        # 这个字段 —— 条件必须经 License 反查，否则排障时只能一页页翻。
        bound_search = await client.get(
            "/store-admin/v1/bindings", params={"keyword": activation_code}
        )
        check(
            "绑定列表可按激活码搜到（激活码不在绑定行上，必须反查授权）",
            bound_search.status_code == 200
            and binding_id in [item["bindingId"] for item in bound_search.json()["items"]],
            f"{bound_search.status_code} {len(bound_search.json().get('items', []))} 条",
        )

        release_binding = await client.post(
            f"/store-admin/v1/bindings/{binding_id}/release",
            json={"note": "smoke 强制解绑"},
        )
        check("后台强制解绑设备", release_binding.status_code == 200, str(release_binding.status_code))

        status_code, detail, body = await call_license(
            "/v2/heartbeat",
            {
                "sessionToken": session_token,
                "leaseSequence": 0,
                "clientVersion": CLIENT_VERSION,
                "nonce": "smoke-nonce-revoked",
            },
        )
        check("解绑后心跳返回 403", status_code == 403, f"{status_code} {detail}")
        check("解绑后心跳确认为结构化吊销", is_confirmed_revocation(body=body), str(body))
        check(
            "吊销响应含结构化 code=REVOKED",
            isinstance(body, dict) and body.get("code") == "REVOKED" and body.get("revoked") is True,
            str(body),
        )

        status_code, detail, _ = await call_license(
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
        status_code, detail, body = await call_license(
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
        check("停用后激活确认为结构化吊销", is_confirmed_revocation(body=body), str(body))
        check(
            "停用响应含结构化 code=REVOKED",
            isinstance(body, dict) and body.get("code") == "REVOKED" and body.get("revoked") is True,
            str(body),
        )

        # 邮箱不匹配
        status_code, detail, _ = await call_license(
            "/v2/activate",
            {
                "activationCode": "HOMEOS-0000-0000-0000-0000-0000-0000",
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
            "entitlements", "activeEntitlements", "orderFunnel", "attention", "referral",
            # 巡检状态必须一直在这个响应里：它坏掉时订单不会报错、界面上
            # 没有任何别的信号，这块卡片就是唯一的报警入口。
            "paymentSweep",
        }
        <= set(overview_data),
        str(sorted(overview_data)),
    )
    check("后台营收已累计", int(overview_data["revenueCents"]) > 0, str(overview_data["revenueCents"]))

    # 看板的时间维度与漏斗：营收必须给出 24 小时 / 7 天 / 30 天三个滚动窗口，
    # 且窗口越大金额越大（同一批付款订单，30 天必然覆盖 24 小时）。
    revenue_windows = {item["key"]: item for item in overview_data["revenue"]["windows"]}
    check(
        "后台营收返回三个滚动时间窗",
        set(revenue_windows) == {"last24h", "last7d", "last30d"},
        str(sorted(revenue_windows)),
    )
    windowed = [
        int(revenue_windows[key]["grossCents"])
        for key in ("last24h", "last7d", "last30d")
    ]
    check(
        "营收时间窗自小到大单调不减",
        windowed == sorted(windowed),
        str(windowed),
    )
    check(
        "时间窗净营收 = 收款 − 退款",
        all(
            int(item["netCents"]) == int(item["grossCents"]) - int(item["refundCents"])
            for item in revenue_windows.values()
        ),
        str(revenue_windows),
    )
    check(
        "累计净营收 = 收款 − 退款",
        int(overview_data["revenueCents"])
        == int(overview_data["revenue"]["totalGrossCents"])
        - int(overview_data["revenue"]["totalRefundCents"]),
        str(overview_data["revenue"]),
    )

    # 漏斗必须覆盖全部已登记状态（含 0 条的那个），否则前端会少画一格，
    # 运营看不出「这个状态其实一条都没有」。
    funnel_codes = [item["status"] for item in overview_data["orderFunnel"]]
    check(
        "订单漏斗覆盖全部状态且带中文文案",
        set(funnel_codes) == set(ORDER_STATUS_LABELS)
        and all(item["label"] for item in overview_data["orderFunnel"]),
        str(funnel_codes),
    )
    funnel_counts = {item["status"]: int(item["count"]) for item in overview_data["orderFunnel"]}
    check(
        "漏斗状态计数与累计数一致",
        funnel_counts.get("pending") == int(overview_data["pendingOrders"])
        and funnel_counts.get("fulfilled") == int(overview_data["fulfilledOrders"]),
        str(funnel_counts),
    )

    attention = overview_data["attention"]
    check(
        "待办区字段齐全",
        {
            "awaitingFulfillment", "fulfillmentFailed", "paymentFailed", "needsReview",
            "expiringLicenses", "expiringWindowDays", "lowStock", "pendingWithdrawals", "soldOut",
        }
        <= set(attention),
        str(sorted(attention)),
    )
    check(
        "待审提现笔数两处口径一致",
        int(attention["pendingWithdrawals"]) == int(overview_data["pendingWithdrawals"]),
        str(attention["pendingWithdrawals"]),
    )
    check(
        "积分负债：可用 = 余额 − 冻结",
        abs(
            float(overview_data["referral"]["availablePoints"])
            - (float(overview_data["referral"]["balancePoints"]) - float(overview_data["referral"]["frozenPoints"]))
        ) < 1e-6,
        str(overview_data["referral"]),
    )
    check(
        "看板附带服务器时间",
        bool(overview_data["serverTime"]),
        str(overview_data["serverTime"]),
    )

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

    # 后台商品编辑的功能码下拉渲染这份目录；它必须覆盖主程序全部能力码，
    # 否则运营在界面上勾不到的代码就只能手写，等于没解决问题。
    feature_catalog = await client.get("/store-admin/v1/feature-codes")
    check("GET /store-admin/v1/feature-codes", feature_catalog.status_code == 200, str(feature_catalog.status_code))
    catalog_data = feature_catalog.json()
    catalog_codes = {item["code"] for item in catalog_data.get("items", [])}
    check(
        "功能码目录覆盖主程序全部能力码",
        {
            "api", "assets", "editor", "display", "ha.sync", "ha.configure", "ha.control",
            "projects.write", "runtime.websocket", "module.3d_interaction",
        } == catalog_codes,
        str(sorted(catalog_codes)),
    )
    check(
        "功能码目录每项都有中文名与分组",
        all(item.get("label") and item.get("groupLabel") for item in catalog_data.get("items", [])),
        str([item.get("code") for item in catalog_data.get("items", []) if not item.get("label")]),
    )

    created_product = await client.post(
        "/store-admin/v1/products",
        json={
            "name": "smoke 临时商品",
            "productType": "module",
            "priceCents": 1990,
            # 必须用能力目录里的真代码：接口会拒绝目录外的功能码（见下面的断言），
            # 而「抄错一个字母」正是这条校验要拦的东西。
            "featureCodes": ["module.3d_interaction"],
            "active": True,
        },
    )
    check("后台创建商品", created_product.status_code == 200, str(created_product.status_code))

    # 商品类型 / 履约方式 / 功能码都是「写错不报错、但会静默走错路」的字段：
    # 类型决定下单分支（module 必须挂到已有授权上）、履约方式决定付款后发不发码、
    # 功能码抄错只会被客户端静默拦截。三者都必须在写库前拒绝非法取值。
    bad_type = await client.post(
        "/store-admin/v1/products",
        json={"name": "smoke 类型错", "productType": "moduel", "featureCodes": ["api"]},
    )
    check(
        "非法商品类型被拒绝（拼错一个字母不能当成基础授权卖）",
        bad_type.status_code == 422,
        f"{bad_type.status_code} {bad_type.text[:120]}",
    )
    bad_mode = await client.post(
        "/store-admin/v1/products",
        json={
            "name": "smoke 履约错",
            "productType": "base",
            "fulfillmentMode": "Manual",
            "featureCodes": ["api"],
        },
    )
    check(
        "非法履约方式被拒绝（写错不能静默按自动发码处理）",
        bad_mode.status_code == 422,
        f"{bad_mode.status_code} {bad_mode.text[:120]}",
    )
    bad_feature = await client.post(
        "/store-admin/v1/products",
        json={"name": "smoke 功能码错", "productType": "base", "featureCodes": ["ha.synx"]},
    )
    check(
        "目录外的功能码被拒绝（客户端不会认，等于没发）",
        bad_feature.status_code == 422,
        f"{bad_feature.status_code} {bad_feature.text[:120]}",
    )
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
        manual_code.startswith("HOMEOS-") and len(manual_code.split("-")) == 7,
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

    # ---- 注册邮箱验证码：后台配置必须真的生效（免重启） ---------------- #
    mail_payload = (await client.get("/store-admin/v1/settings")).json().get("mail", {})
    check(
        "GET /settings 带邮件配置概览且不回显授权码明文",
        {"mode", "smtpHost", "smtpPort", "smtpPasswordConfigured", "smtpReady",
         "verificationTtlSeconds", "verificationCooldownSeconds",
         "exposeVerificationCode", "defaultEmail", "presets"} <= set(mail_payload),
        str(sorted(mail_payload)),
    )

    # 写入一份「后台优先」的邮件配置：有效期 300、冷却 30（合法组合）。
    mail_update = await client.put(
        "/store-admin/v1/settings",
        json={
            "mailMode": "log",
            "smtpHost": "smtp.smoke.local",
            "smtpPort": 2525,
            "smtpSecurity": "starttls",
            "smtpUsername": "smoke@smoke.local",
            "smtpPassword": "smoke-smtp-secret",
            "mailFrom": "HomeOS Smoke <no-reply@smoke.local>",
            "verificationTtlSeconds": 300,
            "verificationCooldownSeconds": 30,
        },
    )
    check("后台保存邮件配置", mail_update.status_code == 200, str(mail_update.status_code))
    saved_mail = mail_update.json().get("mail", {})
    check(
        "邮件配置回读为后台来源（免重启即时生效）",
        saved_mail.get("smtpHost") == "smtp.smoke.local"
        and saved_mail.get("smtpPort") == 2525
        and saved_mail.get("smtpSecurity") == "starttls"
        and saved_mail.get("smtpHostFromDatabase") is True,
        str({k: saved_mail.get(k) for k in ("smtpHost", "smtpPort", "smtpSecurity", "smtpHostFromDatabase")}),
    )
    check(
        "SMTP 授权码只报「已配置」与打码值，绝不回显明文",
        saved_mail.get("smtpPasswordConfigured") is True
        and saved_mail.get("smtpPasswordFromDatabase") is True
        and saved_mail.get("smtpPasswordMasked", "").startswith("••••")
        and "smoke-smtp-secret" not in str(saved_mail),
        str(saved_mail.get("smtpPasswordMasked")),
    )
    check(
        "有效期 / 冷却按后台配置解析",
        saved_mail.get("verificationTtlSeconds") == 300
        and saved_mail.get("verificationCooldownSeconds") == 30,
        str({k: saved_mail.get(k) for k in ("verificationTtlSeconds", "verificationCooldownSeconds")}),
    )

    # 回显开关是三态而不是布尔：False（生产上明确关掉）与 NULL（跟随环境变量）是
    # 两件事。写成 ``bool(None)`` 的话，运营一旦点过一次那个下拉框就再也回不到
    # 「跟随环境变量」—— 而界面上那一项照样选得中，是个静默失效的假选项。
    explicit_off = await client.put(
        "/store-admin/v1/settings", json={"exposeVerificationCode": False}
    )
    check(
        "回显开关可显式关掉（与「没配过」区分开）",
        explicit_off.json()["mail"]["exposeVerificationCode"] is False
        and explicit_off.json()["mail"]["exposeVerificationCodeFromDatabase"] is True,
        str(explicit_off.json().get("mail", {}).get("exposeVerificationCodeFromDatabase")),
    )
    back_to_env = await client.put(
        "/store-admin/v1/settings", json={"exposeVerificationCode": None}
    )
    check(
        "传 null 可清回「跟随环境变量」（否则这个下拉框只能单向变）",
        back_to_env.json()["mail"]["exposeVerificationCodeFromDatabase"] is False
        and back_to_env.json()["mail"]["exposeVerificationCode"] is True,
        str(back_to_env.json().get("mail", {})),
    )

    # 把打码值原样回传必须视为「不改动」：真授权码被 •••• 覆盖掉是这类表单最典型的
    # 静默损坏（接口 200、界面显示已配置，实际发不出信）。
    masked_round_trip = await client.put(
        "/store-admin/v1/settings",
        json={"smtpPassword": saved_mail.get("smtpPasswordMasked")},
    )
    check(
        "回传打码值不会覆盖真实授权码",
        masked_round_trip.status_code == 200
        and masked_round_trip.json()["mail"]["smtpPasswordConfigured"] is True
        and masked_round_trip.json()["mail"]["smtpPasswordMasked"]
        == saved_mail.get("smtpPasswordMasked"),
        str(masked_round_trip.json().get("mail", {}).get("smtpPasswordMasked")),
    )

    # 冷却 >= 有效期 = 用户在验证码过期后仍被冷却挡住，永远完不成注册。
    deadlock = await client.put(
        "/store-admin/v1/settings",
        json={"verificationTtlSeconds": 120, "verificationCooldownSeconds": 120},
    )
    check(
        "冷却 >= 有效期被拒绝（否则用户注册不了）",
        deadlock.status_code == 422 and "冷却" in str(deadlock.json().get("detail", "")),
        f"{deadlock.status_code} {deadlock.json().get('detail')}",
    )
    too_short = await client.put(
        "/store-admin/v1/settings", json={"verificationTtlSeconds": 30}
    )
    check(
        "有效期短于 60 秒被拒绝（用户来不及输入）",
        too_short.status_code == 422,
        f"{too_short.status_code} {too_short.json().get('detail')}",
    )
    bad_mode = await client.put(
        "/store-admin/v1/settings", json={"mailMode": "smpt"}
    )
    check(
        "非法投递方式被拒绝",
        bad_mode.status_code == 422,
        f"{bad_mode.status_code} {bad_mode.json().get('detail')}",
    )

    # 测试邮件按钮：log 模式下必须如实回报「没真的发出去」，而不是报成功。
    # 位置刻意放在「清回跟随环境变量」之前 —— 清回之后生效的是环境变量的 echo，
    # 那时按钮照样会说「未真正发信」，但这个用例想钉的是**后台配置的 log 模式**
    # 也必须如实自报，而不是把「发送成功」当默认答案。
    mail_probe = await client.post(
        "/store-admin/v1/settings/mail/test", json={"email": "probe@smoke.local"}
    )
    check(
        "测试邮件在 log 模式下如实报告未投递",
        mail_probe.status_code == 200
        and mail_probe.json().get("ok") is False
        and mail_probe.json().get("mode") == "log"
        and "未真正发信" in mail_probe.json().get("message", ""),
        f"{mail_probe.status_code} {mail_probe.json()}",
    )
    bad_probe = await client.post(
        "/store-admin/v1/settings/mail/test", json={"email": "not-an-email"}
    )
    check(
        "测试邮件校验收件人格式",
        bad_probe.status_code == 422,
        str(bad_probe.status_code),
    )

    # 收尾：把邮件配置清回「跟随环境变量」。后续用例（邀请注册）依赖 smoke 起服务时
    # 的 echo 模式回显验证码，留着一份 mail_mode=log 的后台配置会让它拿不到码 ——
    # 这正是「后台配置优先」生效的证明，但必须还原。
    await client.put(
        "/store-admin/v1/settings",
        json={
            "mailMode": "",
            "smtpHost": "",
            "smtpPort": 0,
            "smtpSecurity": "",
            "smtpUsername": "",
            "mailFrom": "",
            "smtpClearPassword": True,
            "verificationTtlSeconds": 600,
            "verificationCooldownSeconds": 60,
        },
    )
    restored = (await client.get("/store-admin/v1/settings")).json()["mail"]
    check(
        "邮件配置可清回「跟随环境变量」",
        restored.get("modeFromDatabase") is False
        and restored.get("smtpHostFromDatabase") is False
        and restored.get("smtpPasswordFromDatabase") is False,
        str({k: restored.get(k) for k in ("modeFromDatabase", "smtpHostFromDatabase", "smtpPasswordFromDatabase")}),
    )

    # ---- 支付宝回调地址：后台可改，且校验拦得住必然收不到通知的写法 ----- #
    bad_callback = await client.put(
        "/store-admin/v1/settings",
        json={"alipayNotifyUrl": "http://127.0.0.1:18082/store/v1/payments/alipay/notify"},
    )
    check(
        "本机地址的异步通知地址被拒绝（支付宝访问不到 localhost）",
        bad_callback.status_code == 422,
        f"{bad_callback.status_code} {bad_callback.json().get('detail')}",
    )
    relative_callback = await client.put(
        "/store-admin/v1/settings", json={"alipayReturnUrl": "/store/payment/return"}
    )
    check(
        "只填路径的回调地址被拒绝",
        relative_callback.status_code == 422,
        f"{relative_callback.status_code} {relative_callback.json().get('detail')}",
    )
    callback_update = await client.put(
        "/store-admin/v1/settings",
        json={
            "alipayNotifyUrl": "https://pay.smoke.local/store/v1/payments/alipay/notify",
            "paymentTransactionDescription": "smoke 交易标题",
        },
    )
    check(
        "回调地址与交易标题可写入并回读",
        callback_update.status_code == 200
        and callback_update.json()["alipay"]["notifyUrl"]
        == "https://pay.smoke.local/store/v1/payments/alipay/notify"
        and callback_update.json()["alipay"]["notifyUrlFromDatabase"] is True
        and callback_update.json()["payment"]["transactionDescription"] == "smoke 交易标题",
        str({
            "notifyUrl": callback_update.json().get("alipay", {}).get("notifyUrl"),
            "txn": callback_update.json().get("payment", {}).get("transactionDescription"),
        }),
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

    # —— 用户自助取消（POST /orders/{order_no}/cancel）——
    # 这条路与后台取消、模拟收银台取消的关键区别：它在改本地状态**之前**先关掉渠道
    # 侧的预下单交易（否则用户手里那张二维码还能继续扫、继续付），所以三段副作用
    # ——订单状态、库存预留、优惠码名额——必须都收干净，重复取消和他人取消都要挡住。
    self_cancel_coupon = f"SMOKE-SELF-{utcnow().strftime('%H%M%S%f')}"
    with database.session() as session:
        session.add(
            Coupon(
                code=self_cancel_coupon,
                description="smoke 用户自助取消",
                percent=5,
                max_redemptions=1,
                per_account_limit=1,
            )
        )
    self_cancel_order = (
        await client.post(
            "/store/v1/orders",
            json={"productId": base_product_id, "couponCode": self_cancel_coupon},
        )
    ).json()
    with database.session() as session:
        before_coupon = session.scalars(
            select(Coupon).where(Coupon.code == self_cancel_coupon)
        ).first()
    check(
        "自助取消前：下单确实占用了优惠码名额",
        before_coupon is not None and before_coupon.redeemed_count == 1,
        str(before_coupon.redeemed_count if before_coupon is not None else None),
    )

    self_cancelled = await client.post(
        f"/store/v1/orders/{self_cancel_order['orderNo']}/cancel"
    )
    check(
        "本人可自助取消待支付订单",
        self_cancelled.status_code == 200 and self_cancelled.json()["status"] == "cancelled",
        f"{self_cancelled.status_code} {self_cancelled.text[:80]!r}",
    )
    with database.session() as session:
        after_coupon = session.scalars(
            select(Coupon).where(Coupon.code == self_cancel_coupon)
        ).first()
        after_order = session.scalars(
            select(Order).where(Order.order_no == self_cancel_order["orderNo"])
        ).first()
    check(
        "自助取消归还优惠码名额（漏掉会让名额被永久占用）",
        after_coupon is not None and after_coupon.redeemed_count == 0,
        str(after_coupon.redeemed_count if after_coupon is not None else None),
    )
    check(
        "自助取消归还库存预留",
        after_order is not None and after_order.stock_reservation_released_at is not None,
        str(getattr(after_order, "stock_reservation_released_at", None)),
    )

    repeat_cancel = await client.post(
        f"/store/v1/orders/{self_cancel_order['orderNo']}/cancel"
    )
    check(
        "已取消的订单不能再取消（409）",
        repeat_cancel.status_code == 409,
        f"{repeat_cancel.status_code} {repeat_cancel.text[:80]!r}",
    )

    # 访客不能拿订单号取消别人的单：这是唯一一条「不花钱就能把别人占用的库存释放掉」
    # 的路径，授权口径必须与 GET 订单一致 —— 凭证对了才放行（扫码收银台那条路径）。
    async with httpx.AsyncClient(
        transport=transport_http, base_url="http://store.test", follow_redirects=False
    ) as guest:
        stranger_order = (
            await client.post(
                "/store/v1/orders", json={"productId": base_product_id, "couponCode": None}
            )
        ).json()
        stranger_cancel = await guest.post(
            f"/store/v1/orders/{stranger_order['orderNo']}/cancel",
            headers={"x-order-token": "not-the-token"},
        )
        check(
            "凭证不对的访客不能取消他人订单（403）",
            stranger_cancel.status_code == 403,
            f"{stranger_cancel.status_code} {stranger_cancel.text[:80]!r}",
        )
        tokened_cancel = await guest.post(
            f"/store/v1/orders/{stranger_order['orderNo']}/cancel",
            headers={"x-order-token": stranger_order["lookupToken"]},
        )
        check(
            "持订单凭证的访客可取消该订单（与查单授权口径一致）",
            tokened_cancel.status_code == 200
            and tokened_cancel.json()["status"] == "cancelled",
            f"{tokened_cancel.status_code} {tokened_cancel.text[:80]!r}",
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
    status_code, manual_activate, _ = await call_license(
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
            len(manual_payload["features"]) == 9,
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
        json={"points": 5, "requestKey": "smoke-withdraw-0002"},
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
                order_no=f"HOMEOS-SMOKE-FK-{utcnow().strftime('%H%M%S%f')}",
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
        pending_order_no = f"HOMEOS-SMOKE-PEND-{stamp}"
        junk_order_no = f"HOMEOS-SMOKE-JUNK-{stamp}"
        linked_order_no = f"HOMEOS-SMOKE-LINK-{stamp}"
        addon_order_no = f"HOMEOS-SMOKE-ADDON-{stamp}"
        snapshot_order_no = f"HOMEOS-SMOKE-SNAP-{stamp}"
        _smoke_order("pending", pending_order_no)
        _smoke_order("cancelled", junk_order_no)
        linked_order = _smoke_order("cancelled", linked_order_no)

        # 给「已关联授权」那笔订单挂一条授权，用于验证删除守卫
        linked_license = License(
            activation_code=f"HOMEOS-SMOKE-LINK-{stamp}",
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

        # 增量包 / 升级单在**下单时**就写上 target_license_id（表达「这单打算改谁」），
        # 但从未履约的单既没发码、也没动过那张授权，不该被删除守卫拦住 —— 过去
        # 守卫把这一列当成「已关联授权」，让所有增购垃圾单在后台永远删不掉。
        addon_order = _smoke_order("cancelled", addon_order_no)
        addon_order.order_type = "addon"
        addon_order.license_action = "patch"
        addon_order.target_license_id = linked_license.id

        # 履约过的升级/增量包单会留下「改前快照」（退款要靠它还原），那种单永远不能删。
        snapshot_order = _smoke_order("cancelled", snapshot_order_no)
        snapshot_order.order_type = "addon"
        snapshot_order.license_action = "patch"
        snapshot_order.target_license_id = linked_license.id
        snapshot_order.license_state_before_json = '{"active": true}'

        # 支付宝单在渠道确认关单之前不能删：本地过期 ≠ 远端那笔交易结束，用户手上
        # 那个旧二维码还能付款，删了订单这笔钱就没有凭证（异步通知按订单号找不到）。
        payable_order_no = f"HOMEOS-SMOKE-PAYABLE-{stamp}"
        payable_order = _smoke_order("expired", payable_order_no)
        payable_order.payment_provider = "alipay"
        payable_order.channel_closed_at = None
        # 关单后（或已超出巡检回看窗口）就是普通的可删垃圾单。
        closed_order_no = f"HOMEOS-SMOKE-CLOSED-{stamp}"
        closed_order = _smoke_order("expired", closed_order_no)
        closed_order.payment_provider = "alipay"
        closed_order.channel_closed_at = utcnow()

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
    # 「指向某张授权」≠「关联授权」：增量包/升级单下单时就写 target_license_id，
    # 用它当判据会让这类终态垃圾单永远删不掉（后台操作列整列空白）。
    deleted_addon = await client.delete(f"/store-admin/v1/orders/{addon_order_no}")
    check(
        "已取消的增量包单（只有 target_license_id、未履约）可删除",
        deleted_addon.status_code == 200 and deleted_addon.json().get("deleted") is True,
        str(deleted_addon.json()),
    )
    blocked_snapshot = await client.delete(f"/store-admin/v1/orders/{snapshot_order_no}")
    check(
        "改动过已有授权的订单不可删除（提示走退款）",
        blocked_snapshot.status_code == 409,
        str(blocked_snapshot.status_code),
    )
    blocked_payable = await client.delete(f"/store-admin/v1/orders/{payable_order_no}")
    check(
        "支付宝交易未关单的订单不可删除（延迟到账的钱会失去凭证）",
        blocked_payable.status_code == 409,
        str(blocked_payable.status_code),
    )
    deleted_closed = await client.delete(f"/store-admin/v1/orders/{closed_order_no}")
    check(
        "渠道已确认关单的终态订单可删除",
        deleted_closed.status_code == 200 and deleted_closed.json().get("deleted") is True,
        str(deleted_closed.json()),
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

    # ------------------------------------------------------------------ #
    # 9c. 资金路径：退款的原子性、无资金变动的空退款、累计值必须锁内落库
    # ------------------------------------------------------------------ #
    # 这一段动的都是「钱」：账面错了的时候界面反而一切正常（状态、流水、
    # 提示都在），只有数字对不上，所以必须有断言盯着。
    def _paid_order(suffix: str, amount_cents: int) -> str:
        """造一笔**已付款**的订单。

        预留刻意加 1：退款要把这件预留还回去，漏了等于这件货再也卖不出去。
        """
        with database.session() as session:
            product_row = session.get(Product, base_product_id)
            product_row.reserved_stock = int(product_row.reserved_stock or 0) + 1
            customer_row = session.scalars(
                select(Customer).where(Customer.account_id == account_id)
            ).first()
            row = Order(
                order_no=f"HOMEOS-SMOKE-REFUND-{suffix}-{utcnow().strftime('%H%M%S%f')}",
                lookup_token=f"refund-token-{suffix}-{utcnow().strftime('%H%M%S%f')}",
                account_id=account_id,
                customer_id=customer_row.id,
                email=email,
                product_id=product_row.id,
                product_name=product_row.name,
                product_type=product_row.product_type,
                order_type="base",
                license_action="issue",
                original_amount_cents=amount_cents,
                amount_cents=amount_cents,
                status="paid",
                fulfillment_mode="automatic",
                payment_provider="mock",
                paid_at=utcnow(),
            )
            session.add(row)
            session.flush()
            return row.order_no

    with database.session() as session:
        reserved_baseline = int(session.get(Product, base_product_id).reserved_stock or 0)

    revenue_before = (await client.get("/store-admin/v1/overview")).json()["revenue"]

    # —— 部分退款：营收要按「收款 − 实退」记，既不能整单消失也不能当没退 ——
    partial_order_no = _paid_order("partial", 10000)
    partial = await client.post(
        f"/store-admin/v1/orders/{partial_order_no}/refund",
        json={"amountCents": 3000, "note": "smoke 部分退款"},
    )
    check(
        "支持部分退款（不再是一退就退全款）",
        partial.status_code == 200,
        f"{partial.status_code} {partial.text[:200]}",
    )
    partial_data = partial.json() if partial.status_code == 200 else {}
    check(
        "部分退款后订单进入「部分已退」且写下累计退款额",
        partial_data.get("status") == "partially_refunded"
        and int(partial_data.get("refundAmountCents") or 0) == 3000
        and int(partial_data.get("refundableCents") or 0) == 7000,
        str(
            {
                key: partial_data.get(key)
                for key in ("status", "refundAmountCents", "refundableCents")
            }
        ),
    )

    revenue_after = (await client.get("/store-admin/v1/overview")).json()["revenue"]
    check(
        "部分退款订单按「收款 − 实退」计入营收（10000 − 3000 = 7000）",
        int(revenue_after["totalGrossCents"]) - int(revenue_before["totalGrossCents"]) == 10000
        and int(revenue_after["totalRefundCents"])
        - int(revenue_before["totalRefundCents"])
        == 3000,
        f"gross {revenue_before['totalGrossCents']}→{revenue_after['totalGrossCents']} "
        f"refund {revenue_before['totalRefundCents']}→{revenue_after['totalRefundCents']}",
    )

    with database.session() as session:
        reserved_after_partial = int(session.get(Product, base_product_id).reserved_stock or 0)
    check(
        "退款把订单占的库存预留还了回去（离开 paid 就再没人负责这一步）",
        reserved_after_partial == reserved_baseline,
        f"reserved={reserved_after_partial} baseline={reserved_baseline}",
    )

    # —— 超出可退余额要拒绝，且绝不能改动账面 ——
    too_much = await client.post(
        f"/store-admin/v1/orders/{partial_order_no}/refund",
        json={"amountCents": 8000, "note": "smoke 超额退款"},
    )
    check(
        "退款超过可退余额时 422（可退只剩 7000）",
        too_much.status_code == 422,
        f"{too_much.status_code} {too_much.text[:200]}",
    )
    after_reject = (await client.get(f"/store-admin/v1/orders/{partial_order_no}/refunds")).json()
    check(
        "被拒的退款不留任何流水痕迹",
        too_much.status_code == 422
        and len(after_reject["items"]) == 1
        and int(after_reject["refundedCents"]) == 3000,
        f"{len(after_reject['items'])} 条 / 累计 {after_reject['refundedCents']}",
    )

    # —— 第二次部分退款：幂等号不能复用，否则渠道会把第二笔当成重复请求 ——
    remainder = await client.post(
        f"/store-admin/v1/orders/{partial_order_no}/refund",
        json={"amountCents": 7000, "note": "smoke 退完剩余"},
    )
    check(
        "退完剩余金额后订单进入全额已退",
        remainder.status_code == 200
        and remainder.json().get("status") == "refunded"
        and int(remainder.json().get("refundAmountCents") or 0) == 10000,
        f"{remainder.status_code} {remainder.text[:200]}",
    )
    refund_rows = (
        await client.get(f"/store-admin/v1/orders/{partial_order_no}/refunds")
    ).json()["items"]
    check(
        "两次部分退款各留一条流水，且渠道单号（幂等号）互不相同",
        len(refund_rows) == 2
        and len({row["outRequestNo"] for row in refund_rows}) == 2
        and len({row["tradeNo"] for row in refund_rows}) == 2,
        str([(row["amountCents"], row["outRequestNo"], row["tradeNo"]) for row in refund_rows]),
    )
    already_done = await client.post(
        f"/store-admin/v1/orders/{partial_order_no}/refund", json={"note": "smoke 再退一次"}
    )
    check(
        "已全额退款的订单再退返回 409（没有可退余额）",
        already_done.status_code == 409,
        f"{already_done.status_code} {already_done.text[:200]}",
    )

    # —— 并发退款：进程内锁 + 累计值抢单，钱只能退一次 ——
    # 过去这里两句 UPDATE 是「读-改-写」：两个请求都读到累计 0，各自把渠道退款
    # 发出去，钱多退一倍而账面只加一次。锁还必须在**提交之前**拿住 ——
    # 请求会话的 commit 在依赖 teardown 里，那时锁已释放，第二笔照样读到旧值。
    race_order_no = _paid_order("race", 10000)
    race = await asyncio.gather(
        client.post(f"/store-admin/v1/orders/{race_order_no}/refund", json={"note": "smoke 并发 A"}),
        client.post(f"/store-admin/v1/orders/{race_order_no}/refund", json={"note": "smoke 并发 B"}),
        return_exceptions=True,
    )
    race_codes = sorted(
        item.status_code if hasattr(item, "status_code") else 599 for item in race
    )
    check(
        "同一订单的并发退款只有一笔成功，另一笔 409（不会重复退钱）",
        race_codes == [200, 409],
        str(race_codes),
    )
    with database.session() as session:
        race_order = session.scalars(
            select(Order).where(Order.order_no == race_order_no)
        ).first()
        check(
            "并发退款后累计退款额恰好等于订单金额（不多记也不少记）",
            int(race_order.refund_amount_cents or 0) == 10000,
            f"refund_amount_cents={race_order.refund_amount_cents}",
        )
    race_rows = (
        await client.get(f"/store-admin/v1/orders/{race_order_no}/refunds")
    ).json()["items"]
    check(
        "并发退款只留下一条成功流水（没有第二条渠道退款）",
        len(race_rows) == 1 and int(race_rows[0]["amountCents"]) == 10000,
        str([(row["amountCents"], row["status"]) for row in race_rows]),
    )

    # —— 渠道确认「本次没有新增资金变动」：不是一次成功退款 ——
    # （支付宝 refund_fee=0 / fund_change=N 就是这个形状：钱早就退过了）
    zero_order_no = _paid_order("zero", 5000)
    real_mock_refund = MockPaymentProvider.refund_payment

    def stub_refund_nothing(self, *, order, amount_cents, reason, out_request_no, settings, setting):
        return RefundResult(
            ok=True,
            trade_no="MOCK-NOFUND",
            unrefunded_cents=int(amount_cents),
            detail="渠道确认本次无新增资金变动",
        )

    try:
        MockPaymentProvider.refund_payment = stub_refund_nothing
        zero = await client.post(
            f"/store-admin/v1/orders/{zero_order_no}/refund", json={"note": "smoke 空退款"}
        )
    finally:
        MockPaymentProvider.refund_payment = real_mock_refund

    check(
        "渠道确认无资金变动时按 200 返回（不是失败）",
        zero.status_code == 200,
        f"{zero.status_code} {zero.text[:200]}",
    )
    zero_data = zero.json() if zero.status_code == 200 else {}
    check(
        "无资金变动的退款不推进订单状态（不能显示成退过钱）",
        zero_data.get("status") == "paid" and int(zero_data.get("refundAmountCents") or 0) == 0,
        str({key: zero_data.get(key) for key in ("status", "refundAmountCents")}),
    )
    zero_rows = (await client.get(f"/store-admin/v1/orders/{zero_order_no}/refunds")).json()["items"]
    check(
        "无资金变动仍留下一条金额为 0 的流水（对账要看得见这次尝试）",
        len(zero_rows) == 1
        and int(zero_rows[0]["amountCents"]) == 0
        and zero_rows[0]["status"] == "succeeded",
        str([(row["amountCents"], row["status"]) for row in zero_rows]),
    )
    with database.session() as session:
        zero_audit = session.scalars(
            select(AuditLog)
            .where(AuditLog.action == "order.refund")
            .where(AuditLog.target == zero_order_no)
            .order_by(AuditLog.created_at.desc())
        ).first()
    check(
        "无资金变动的退款在审计里写明原因（否则「退了几次都没动钱」查不出来）",
        zero_audit is not None and "未产生资金变动" in (zero_audit.detail or ""),
        zero_audit.detail if zero_audit is not None else "没有审计记录",
    )

    # ------------------------------------------------------------------ #
    # 9d. 后台加固：无凭证的收银台、审计不落明文、优惠码作用域、管理员自锁、商品图
    # ------------------------------------------------------------------ #
    # 这一段查的是「出问题时界面完全看不出来」的几处：收银台能白拿授权、审计日志
    # 变成激活码的第二份副本、优惠码作用域被写坏（谁都可用）、管理员把自己锁在
    # 门外、SVG 变成同源 XSS 落点。

    # —— 模拟收银台：订单号可枚举，页面本身绝不能无鉴权可达 ——
    seeded = (await client.get("/store-admin/v1/orders?limit=1")).json()["items"]
    check("取到一笔订单用于收银台鉴权检查", bool(seeded), str(seeded)[:120])
    if seeded:
        sample_no = seeded[0]["orderNo"]
        sample_token = seeded[0]["lookupToken"]
        async with httpx.AsyncClient(
            transport=transport_http, base_url="http://store.test", follow_redirects=False
        ) as guest:
            anon_page = await guest.get(f"/store/mock/pay/{sample_no}")
            check(
                "未登录且无订单凭证时收银台不可达（订单号是可枚举的）",
                anon_page.status_code == 404,
                f"{anon_page.status_code} {anon_page.text[:80]!r}",
            )
            tokened = await guest.get(f"/store/mock/pay/{sample_no}?token={sample_token}")
            check(
                "带上订单凭证后收银台可打开（扫码支付的正常路径）",
                tokened.status_code == 200 and "cashier" in tokened.text,
                f"{tokened.status_code}",
            )
            bad_token = await guest.post(
                f"/store/v1/orders/{sample_no}/mock/pay",
                json={"orderToken": "not-the-token"},
            )
            check(
                "凭证错误的模拟支付被拒绝（否则凑出订单号就能免费发码）",
                bad_token.status_code == 403,
                f"{bad_token.status_code} {bad_token.text[:80]!r}",
            )

    # —— 审计日志不该成为激活码的第二份副本 ——
    issued = await client.post(
        "/store-admin/v1/licenses",
        json={"email": email, "productId": base_product_id, "validityDays": 1},
    )
    check("后台签发授权成功", issued.status_code == 200, str(issued.status_code))
    if issued.status_code == 200:
        issued_data = issued.json()
        full_code = issued_data["activationCode"]
        with database.session() as session:
            audit_row = session.scalars(
                select(AuditLog)
                .where(AuditLog.action == "license.issue")
                .where(AuditLog.target == issued_data["activationCodeId"])
            ).first()
            check(
                "签发审计只记提示码，不落激活码明文",
                audit_row is not None
                and full_code not in (audit_row.detail or "")
                and (audit_row.detail or "").strip(),
                audit_row.detail if audit_row is not None else "没有审计记录",
            )

    # —— 优惠码作用域：写入的适用商品必须原样读回 ——
    scoped = await client.post(
        "/store-admin/v1/coupons",
        json={
            "code": f"SMOKE-SCOPE-{utcnow().strftime('%H%M%S%f')}",
            "description": "smoke 作用域",
            "percent": 5,
            "applicableProductIds": [base_product_id],
        },
    )
    check("带适用商品范围的优惠码创建成功", scoped.status_code == 200, str(scoped.status_code))
    if scoped.status_code == 200:
        scope_row = next(
            (
                item
                for item in (await client.get("/store-admin/v1/coupons")).json()["items"]
                if item["id"] == scoped.json()["id"]
            ),
            None,
        )
        check(
            "优惠码的适用商品范围能原样读回（作用域不被写坏成「全场可用」）",
            scope_row is not None and scope_row.get("applicableProductIds") == [base_product_id],
            str(scope_row and scope_row.get("applicableProductIds")),
        )

    # —— 管理员不能把自己锁在门外 ——
    admin_me = (await client.get("/store-admin/v1/accounts?role=admin")).json()["items"]
    admin_id = next((item["id"] for item in admin_me if item["email"] == "admin@habridge.local"), "")
    check("取到管理员自己的账号", bool(admin_id), str(admin_me)[:160])
    if admin_id:
        self_off = await client.patch(
            f"/store-admin/v1/accounts/{admin_id}", json={"isActive": False}
        )
        check(
            "管理员不能停用自己（否则下一秒就再也登不进后台）",
            self_off.status_code == 409,
            f"{self_off.status_code} {self_off.text[:120]}",
        )
        self_demote = await client.patch(
            f"/store-admin/v1/accounts/{admin_id}", json={"isAdmin": False}
        )
        check(
            "管理员不能摘掉自己的管理员权限（同样是把自己锁在门外）",
            self_demote.status_code == 409,
            f"{self_demote.status_code} {self_demote.text[:120]}",
        )

    # —— 商品图：SVG 必须被挡在「按原 Content-Type 回源」之外 ——
    if seeded:
        product_for_image = (await client.get("/store-admin/v1/products?limit=1")).json()["items"]
        check("取到一件商品用于商品图检查", bool(product_for_image), "")
        if product_for_image:
            image_product_id = product_for_image[0]["id"]
            uploaded = await client.post(
                f"/store-admin/v1/products/{image_product_id}/image",
                files={"file": ("evil.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml")},
            )
            check("商品图上传完成", uploaded.status_code == 200, str(uploaded.status_code))
            if uploaded.status_code == 200:
                served = await client.get(uploaded.json()["imageUrl"])
                content_type = served.headers.get("content-type", "")
                check(
                    "上传的 SVG 不会按 svg 回源（能内嵌脚本，等于同源 XSS 落点）",
                    "svg" not in content_type,
                    f"content-type={content_type!r} url={uploaded.json()['imageUrl']}",
                )
            rejected = await client.post(
                f"/store-admin/v1/products/{image_product_id}/image",
                files={"file": ("big.png", b"x" * (8 * 1024 * 1024 + 1), "image/png")},
            )
            check(
                "超过 8MB 的商品图被拒绝（不是悄悄写进磁盘）",
                rejected.status_code == 413,
                f"{rejected.status_code} {rejected.text[:80]}",
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
            and default.license_key_id
            == client_config.DEFAULT_LICENSE_KEY_ID,
            default.license_key_id,
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
        check("本地 keyId 生效", local.license_key_id == "hb-local-2026")
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
    check_retired_columns()
    check_frontend_api_contract()
    check_theme_matches_app()
    check_legacy_stylesheets_removed()
    check_design_class_coverage()
    check_field_label_fit()
    check_stat_card_fit()
    check_admin_dom_bindings()
    check_admin_console_resilience()
    check_admin_tab_bindings()
    check_admin_grid_tab_layout()
    check_admin_inline_script_parses()
    check_admin_login_no_prefill()
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
    # 捕获「协程没被 await」这类静默失效：Python 只打一条 RuntimeWarning，
    # 自检照样全绿，但整段断言从没执行过（payment fail-closed 那批就这么漏过一次）。
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            code = asyncio.run(run())
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            code = 1
    unawaited = [str(item.message) for item in caught if "never awaited" in str(item.message)]
    if unawaited:
        print()
        print("有自检用的协程没有被 await（这些断言其实没跑）：")
        for message in unawaited:
            print(f"  - {message}")
        code = 1
    raise SystemExit(code)


if __name__ == "__main__":
    main()
