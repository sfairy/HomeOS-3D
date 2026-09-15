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
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from dataclasses import replace
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
from sqlalchemy import Column, MetaData, String, inspect, select

from store.app import create_app
from store.config import STORE_ROOT, load_settings
from store.database import Base, create_store_engine
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
from store.order_status import ORDER_STATUS_LABELS
from store.payments import alipay as alipay_module
from store.payments.sweeper import (
    configure_sweep_loop,
    mark_sweep_loop_stopped,
    sweep_round,
    sweep_status,
)
from store.payments import sweeper as sweeper_module
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
                order_no=f"HB-SWEEP-{stamp}-{suffix}",
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
            order_no=f"HB-SWEEP-{stamp}-boom",
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


async def run() -> int:
    client_crypto = load_module("hb_client_crypto", CLIENT_CRYPTO_PATH)

    # 纯静态检查放在流程末尾统一跑（见下面第 11 节），这里只放不需要建库的
    # 单元检查与各自带临时库的流程检查
    check_alipay_signing()
    check_mail_settings_merge()
    await check_verification_isolation()
    await check_smtp_degrades_without_credentials()
    await check_alipay_notify_flow()
    check_payment_sweep_flow()
    await check_payment_sweep_loop_runs()

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

    # ---- 注册邮箱验证码：后台配置必须真的生效（免重启） ---------------- #
    mail_payload = (await client.get("/store-admin/v1/settings")).json().get("mail", {})
    check(
        "GET /settings 带邮件配置概览且不回显授权码明文",
        {"mode", "smtpHost", "smtpPort", "smtpPasswordConfigured", "smtpReady",
         "verificationTtlSeconds", "verificationCooldownSeconds",
         "exposeVerificationCode"} <= set(mail_payload),
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
    check_retired_columns()
    check_frontend_api_contract()
    check_theme_matches_app()
    check_legacy_stylesheets_removed()
    check_design_class_coverage()
    check_field_label_fit()
    check_stat_card_fit()
    check_admin_dom_bindings()
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
