#!/usr/bin/env python3
"""授权商店后端「判定口径」回归冒烟：把本轮修掉的一批只差一行的逻辑缺陷钉死。

为什么需要它
------------
这批缺陷都不是页面上能看出来的：

* 退款幂等号曾经每次点击都重新生成 —— 渠道侧去重形同失效，运营在「失败」后重试一次
  就是真的再退一笔，多次部分退款还会层层叠加；
* 对账巡检窗口一度只有 24 小时 —— 跨天提交的退款永远对不上账；
* 注册 / 改邮箱曾经「先消费验证码、后查重」—— 用户白白烧掉一条短信，还多出一个
  「这个邮箱到底注册没有」的枚举探针；
* 被订单引用的授权还能被硬删 —— 退款要撤权益时找不到授权，静默少退一笔。

它们要么只在重试 / 并发 / 跨天时才暴露，要么只体现在「源码里那两行的先后顺序」，
页面级冒烟覆盖不到，所以单独用这个纯逻辑冒烟钉住
判定口径，防止回退。

用法
----
从仓库根执行（PATH 里没有 node，也不需要装任何东西；解释器一律用仓库根的 .venv-store）：

    .venv-store/bin/python homeos-store/tools/smoke_store.py

纯标准库 + 项目已有依赖，离线，不起服务器、不起后台进程，全程秒级完成。

为什么这么测
------------
* 退款闸门用 tempfile 下的**文件** SQLite：open_refund_gate 内部另开一条连接，
  内存库（sqlite:///:memory:）在另一条连接上看不到同一份数据；只建 order_refunds
  一张表即可（SQLite 默认不强制外键，不需要 orders 表）。
* 路由挂载与调用顺序这类「源码事实」用 inspect.getsource 断言：比 import 之后间接
  观察更直接，也不会被运行时状态掩盖。

判定口径：每项打印一行 OK / FAIL（FAIL 附带期望与实际），结尾打印通过项数，
只要有一项 FAIL 就以非零码退出，可直接当门禁用。
"""

from __future__ import annotations

import importlib
import importlib.util
import inspect
import os
import sys
import tempfile
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

#: 脚本位置：homeos-store/tools/smoke_store.py
STORE_ROOT = Path(__file__).resolve().parents[1]
#: 商店后端的 import 根：顶层包名是 src（见仓库根 ops/check_schema.py 的 LAYOUT 注释）。
BACKEND = STORE_ROOT / "backend"

#: 邀请码字母表：32 个字符，剔除了手抄 / 口述最易混的 0、1、I、O。
REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

failures: list[str] = []
checked = 0


# --------------------------------------------------------------------------- 极简断言 harness


def expect(actual: object, wanted: object, what: str) -> None:
    """相等断言：失败信息里同时给出期望与实际，便于直接定位。"""
    if actual != wanted:
        raise AssertionError(f"{what}：期望 {wanted!r}，实际 {actual!r}")


def expect_true(condition: object, message: str) -> None:
    """真值断言：失败时只打印这条 message。"""
    if not condition:
        raise AssertionError(message)


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name} —— {error}")
        print(f"  FAIL {name}")
        print(f"       期望 / 实际：{error}")
    except Exception as error:  # 冒烟必须把任何异常都记成一条失败，而不是崩掉。
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name}")
        print(f"       {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


# --------------------------------------------------------------------- 环境准备与导入兜底

#: 正常 import src.payments 失败时的原始错误（None 表示顶层包 import 正常）。
_payments_import_error: str | None = None


def prepare_environment() -> Path:
    """在 import 后端之前把数据目录指到临时目录，避免脚本碰到真实 data/。"""
    data_dir = Path(tempfile.mkdtemp(prefix="homeos-store-smoke-"))
    os.environ.setdefault("STORE_DATA_DIR", str(data_dir))
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    return data_dir


def _load_channels_bypassing_package_init():
    """按文件路径直接加载 channels.py，绕开 src.payments 的 __init__。

    正常路径下用不到它：只在 src.payments/__init__.py 出现残缺导入（导入了一个已经被
    删掉的旧别名）时兜底。否则 src.payments / src.api.* 整棵树都 import 不了，下面大半
    检查一个也跑不起来。它**不修改任何产品代码**，只是在运行期给缺失的旧别名一个取值。
    """
    spec = importlib.util.spec_from_file_location("src.payments.channels", BACKEND / "src" / "payments" / "channels.py")
    if spec is None or spec.loader is None:
        raise ImportError("无法按文件加载 src/payments/channels.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["src.payments.channels"] = module
    spec.loader.exec_module(module)
    return module


def ensure_store_importable() -> None:
    """先把 src.payments 这棵包拉起来；残缺导入时兜底一次并留证。"""
    global _payments_import_error
    try:
        importlib.import_module("src.payments")
    except ImportError as error:
        first_error = f"{type(error).__name__}: {error}"
    else:
        return
    try:
        channels = _load_channels_bypassing_package_init()
        if "channel_label" not in channels.__dict__ and hasattr(channels, "provider_label"):
            channels.channel_label = channels.provider_label
        importlib.import_module("src.payments")
    except Exception as error:
        _payments_import_error = (
            f"{first_error}（兜底按文件加载 channels.py 后仍然失败：{type(error).__name__}: {error}）"
        )
        return
    _payments_import_error = first_error


def _check_payments_package_importable() -> None:
    """src.payments 顶层包能不能干净 import —— 后端起不来时不该冒充全绿。"""
    if _payments_import_error is not None:
        raise AssertionError("src.payments 顶层包无法 import，商店后端当前起不来：" + _payments_import_error)


# ------------------------------------------------------------------- 临时 SQLite（退款闸门用）


def _fresh_refund_engine():
    """建一个临时**文件** SQLite 库，只建 order_refunds 一张表。

    必须是文件库：open_refund_gate 内部用 sessionmaker 另开一条连接，内存库在另一条
    连接上读不到同一份数据。不建 orders 表：SQLite 默认不强制外键。
    """
    from sqlalchemy import create_engine
    from src.core.models import OrderRefund

    db_dir = Path(tempfile.mkdtemp(prefix="homeos-store-smoke-db-"))
    engine = create_engine(f"sqlite:///{db_dir / 'store.db'}")
    OrderRefund.__table__.create(engine)
    return engine


@contextmanager
def _refund_db():
    engine = _fresh_refund_engine()
    try:
        yield engine
    finally:
        engine.dispose()


def _refund_row(**overrides):
    """造一条 OrderRefund（默认是一条 running 占位流水），字段可按需覆盖。

    这里必须显式补上 reason / operator 等 NOT NULL 列：真实调用点（src/api/admin_orders.py:465
    的 OrderRefund(...)）也是逐字段显式赋值的。不能指望 ORM 的 default="" ——
    open_refund_gate 走的是 Core insert() 并显式传 reason=refund.reason，
    ORM 默认值在 Core 插入里不生效。
    """
    from src.core.models import OrderRefund
    from src.security.security import utcnow

    values: dict[str, object] = {
        "id": "refund-1",
        "order_id": "order-1",
        "order_no": "NO-1",
        "out_request_no": "RFNO-1-100",
        "amount_cents": 100,
        "status": "running",
        "detail": "",
        "reason": "冒烟用例",
        "offline": False,
        "operator": "smoke",
        "created_at": utcnow(),
    }
    values.update(overrides)
    return OrderRefund(**values)


# --------------------------------------------------------------------------- 源码定位工具


def _first_index(source: str, *needles: str) -> int:
    """返回第一个在源码里出现的 needle 的下标；一个都没出现就判失败。"""
    found = [(source.find(needle), needle) for needle in needles]
    found = [(position, needle) for position, needle in found if position >= 0]
    expect_true(found, f"源码里找不到任何一处：{'、'.join(needles)}")
    return min(found)[0]


def _assert_duplicate_check_before_consume(source: str, label: str, *duplicate_texts: str) -> None:
    """断言「先查重、后消费验证码」：查重文案必须出现在消费调用之前。"""
    consume_at = source.find("_consume_verification_record")
    expect_true(consume_at >= 0, f"{label} 应当调用 _consume_verification_record")
    duplicate_at = _first_index(source, *duplicate_texts)
    expect_true(
        duplicate_at < consume_at,
        f"{label} 必须先查重后消费验证码：查重文案下标 {duplicate_at} 应小于 "
        f"_consume_verification_record 下标 {consume_at}（先查重才不会白白烧掉验证码，"
        f"也不会留下邮箱是否已注册的枚举探针）",
    )


# --------------------------------------------------------------------------------- 各项检查


def _check_refund_request_no() -> None:
    from src.payments.refunds import refund_request_no

    first = refund_request_no("NO-1", 100)
    expect(first, "RFNO-1-100", "退款幂等号格式（RF + 订单号 + - + 金额）")
    expect(refund_request_no("NO-1", 100), first, "同参数应当恒等（重试必须逐字相同）")
    expect_true(refund_request_no("NO-1", 200) != first, "金额不同必须换幂等号（部分退款场景）")
    expect_true(refund_request_no("NO-2", 100) != first, "订单号不同必须换幂等号")
    expect_true(len(refund_request_no("N" * 200, 10**9)) <= 128, "幂等号长度不得超过 128")
    expect_true(refund_request_no("NO-1", 100).startswith("RFNO-1-"), "幂等号应以 RF + 订单号 + - 开头")
    expect(refund_request_no("NO-1", 100), refund_request_no("NO-1", 100.0), "整数与等值浮点应同键")


def _check_refund_unsettled_statuses() -> None:
    from src.payments.refunds import REFUND_UNSETTLED_STATUSES

    expect_true(
        isinstance(REFUND_UNSETTLED_STATUSES, frozenset),
        f"REFUND_UNSETTLED_STATUSES 应当是 frozenset，实际 {type(REFUND_UNSETTLED_STATUSES).__name__}",
    )
    expect(
        REFUND_UNSETTLED_STATUSES,
        frozenset({"running", "processing"}),
        "「还没定论」的状态集合",
    )


def _check_refund_gate_open_then_in_flight() -> None:
    from sqlalchemy.orm import Session
    from src.payments.refunds import open_refund_gate

    request_no = "RFNO-1-100"
    with _refund_db() as engine, Session(engine) as session:
        verdict, row = open_refund_gate(session, _refund_row(status="running", out_request_no=request_no))
        expect(verdict, "open", "首次占位该幂等号时的裁决")
        expect(row, None, "首次占位不应命中已有的退款流水")

        second = _refund_row(id="refund-2", status="running", out_request_no=request_no)
        verdict2, row2 = open_refund_gate(session, second)
        expect(verdict2, "in_flight", "同幂等号第二次进入闸门的裁决")
        expect_true(row2 is not None, "同幂等号第二次应当命中已存在的 running 流水")
        expect(row2.out_request_no, request_no, "命中流水的 out_request_no")
        expect(row2.status, "running", "命中流水的 status")


def _check_refund_gate_settled_after_write() -> None:
    from sqlalchemy.orm import Session
    from src.payments.refunds import open_refund_gate, write_refund_result

    request_no = "RFNO-1-100"
    with _refund_db() as engine:
        with Session(engine) as session:
            open_refund_gate(session, _refund_row(status="running", out_request_no=request_no))
            rowcount = write_refund_result(session, out_request_no=request_no, status="succeeded", amount_cents=100)
            expect(rowcount, 1, "write_refund_result 影响的行数")
            session.commit()
        # 换一个新连接再进闸门，确认结果真的落到了库里。
        with Session(engine) as session:
            verdict, row = open_refund_gate(
                session, _refund_row(id="refund-2", status="running", out_request_no=request_no)
            )
            expect(verdict, "settled", "已成功退款的幂等号再进闸门的裁决")
            expect_true(row is not None, "settled 裁决必须带上命中的那行流水")
            expect(row.status, "succeeded", "命中流水的 status")


def _check_refund_gate_failed_is_retry() -> None:
    from sqlalchemy.orm import Session
    from src.payments.refunds import open_refund_gate

    request_no = "RFNO-1-100"
    with _refund_db() as engine, Session(engine) as session:
        session.add(_refund_row(id="refund-failed", status="failed", out_request_no=request_no))
        session.commit()
        verdict, row = open_refund_gate(
            session, _refund_row(id="refund-2", status="running", out_request_no=request_no)
        )
        expect(verdict, "retry", "失败退款再用同一幂等号重试的裁决")
        expect_true(row is not None, "retry 裁决应当带上命中的那行流水")


def _check_unsettled_refund_picks_latest_processing() -> None:
    from sqlalchemy.orm import Session
    from src.payments.refunds import unsettled_refund
    from src.security.security import utcnow

    base = utcnow()
    with _refund_db() as engine, Session(engine) as session:
        session.add_all(
            [
                _refund_row(
                    id="p-old",
                    order_id="o1",
                    out_request_no="RFo1-100",
                    status="processing",
                    created_at=base - timedelta(minutes=10),
                ),
                _refund_row(
                    id="p-new",
                    order_id="o1",
                    out_request_no="RFo1-200",
                    status="processing",
                    created_at=base,
                ),
                # 更新的 running / succeeded 都不能算「未定论」。
                _refund_row(
                    id="running-new",
                    order_id="o1",
                    out_request_no="RFo1-300",
                    status="running",
                    created_at=base + timedelta(minutes=10),
                ),
                _refund_row(
                    id="ok-new",
                    order_id="o1",
                    out_request_no="RFo1-400",
                    status="succeeded",
                    created_at=base + timedelta(minutes=20),
                ),
                # 别的订单上的 processing 不能串味。
                _refund_row(
                    id="other-order",
                    order_id="o2",
                    out_request_no="RFo2-100",
                    status="processing",
                    created_at=base + timedelta(minutes=30),
                ),
            ]
        )
        session.commit()
        latest = unsettled_refund(session, order_id="o1")
        expect_true(latest is not None, "o1 上应当能查到未定论的退款")
        expect(latest.id, "p-new", "o1 上未定论退款应当取最新的 processing 一行")
        expect(unsettled_refund(session, order_id="o3"), None, "没有流水的订单应当返回 None")


def _check_referral_code_generation() -> None:
    from src.security.security import REFERRAL_CODE_RE, new_referral_code

    codes = [new_referral_code() for _ in range(200)]
    bad_length = [code for code in codes if len(code) != 8]
    expect(bad_length, [], "新邀请码一律 8 位")
    outside = sorted({char for code in codes for char in code if char not in REFERRAL_ALPHABET})
    expect(outside, [], "新邀请码字符必须全部落在 32 字符集内（不含 0/1/I/O）")
    expect(len(REFERRAL_ALPHABET), 32, "邀请码字母表字符数")
    unmatched = [code for code in codes if not REFERRAL_CODE_RE.match(code)]
    expect(unmatched[:5], [], "新邀请码必须全部匹配 REFERRAL_CODE_RE")
    duplicates = len(codes) - len(set(codes))
    expect(duplicates, 0, "200 个新邀请码互不相同的数量（重复数）")


def _check_referral_code_regex_legacy() -> None:
    from src.security.security import REFERRAL_CODE_RE

    expect_true(bool(REFERRAL_CODE_RE.match("012345")), "老的 6 位数字码必须仍然匹配")
    expect_true(bool(REFERRAL_CODE_RE.match("987654")), "老 6 位数字码（含 9）必须仍然匹配")
    # 000000 是合法的老码（6 位数字码不排除 0/1），别拿它当非法输入。
    expect_true(bool(REFERRAL_CODE_RE.match("000000")), "老的 6 位数字码（全 0）必须仍然匹配")
    expect_true(bool(REFERRAL_CODE_RE.match("23456789")), "新 8 位码必须匹配")


def _check_normalize_referral_code() -> None:
    from src.security.security import normalize_referral_code

    expect(normalize_referral_code("abcdefgh"), "ABCDEFGH", "小写新码应当转成大写")
    expect(normalize_referral_code("  abcdefgh  "), "ABCDEFGH", "应当去掉首尾空白")
    expect(normalize_referral_code("012345"), "012345", "老 6 位数字码应当原样保留")
    for bad in ("23456780", "23456781", "2345678I", "2345678O", "ABCDE", "abcdefghi", "0000000", "", "   ", None):
        expect(normalize_referral_code(bad), None, f"非法邀请码 {bad!r} 应当归一化为 None")


def _check_reconcile_lookback_window() -> None:
    from src.payments.reconcile import CLOSE_LOOKBACK_HOURS, RECONCILE_LOOKBACK_HOURS

    expect(RECONCILE_LOOKBACK_HOURS, 72, "对账巡检回看窗口（小时）")
    expect(CLOSE_LOOKBACK_HOURS, RECONCILE_LOOKBACK_HOURS, "关单回看窗口应当与巡检窗口对齐")


def _check_wechat_api_v3_key_max_length() -> None:
    from src.core.schemas import AdminSettingsRequest

    field = AdminSettingsRequest.model_fields["wechat_api_v3_key"]
    lengths = [
        length for length in (getattr(meta, "max_length", None) for meta in field.metadata) if length is not None
    ]
    expect_true(lengths, "wechat_api_v3_key 字段上找不到 max_length 约束")
    expect(max(lengths), 64, "wechat_api_v3_key 的 max_length")


def _check_recompute_coupon_slots_wired() -> None:
    from src.api import admin as admin_module
    from src.commerce import coupons

    expect_true(callable(getattr(coupons, "recompute_coupon_slots", None)), "recompute_coupon_slots 应当可调用")
    source = inspect.getsource(admin_module)
    route_line, route_index = _line_containing(source, "maintenance/recompute-coupons")
    print(f"       路由：{route_line}")
    expect_true(
        route_index < source.find("recompute_coupon_slots"),
        "maintenance/recompute-coupons 路由应当调用 recompute_coupon_slots",
    )
    expect_true("recompute_coupon_slots" in source, "admin.py 应当调用 recompute_coupon_slots")


def _line_containing(source: str, needle: str) -> tuple[str, int]:
    """返回含 needle 的第一行（去首尾空白）及其全局下标。"""
    index = source.find(needle)
    expect_true(index >= 0, f"源码里找不到 {needle!r}")
    start = source.rfind("\n", 0, index) + 1
    end = source.find("\n", index)
    if end < 0:
        end = len(source)
    return source[start:end].strip(), index


def _check_coupon_patch_recounts_slots() -> None:
    from src.api import admin_coupons as admin_coupons_module

    function = getattr(admin_coupons_module, "admin_patch_coupon", None)
    expect_true(callable(function), "admin_coupons.admin_patch_coupon 应当存在")
    source = inspect.getsource(function)
    expect_true(
        "recount_coupon_slots" in source,
        "改动优惠券的分支应当调用 recount_coupon_slots 重算已发放份数",
    )


def _check_register_checks_duplicate_before_consuming() -> None:
    from src.api import store_auth as store_auth_module

    function = getattr(store_auth_module, "register", None)
    expect_true(callable(function), "store_auth.register 应当存在")
    _assert_duplicate_check_before_consume(inspect.getsource(function), "注册（store_auth.register）", "该邮箱已注册")


def _check_change_email_checks_duplicate_before_consuming() -> None:
    from src.api import store as store_module

    function = getattr(store_module, "change_account_email", None)
    expect_true(callable(function), "store.change_account_email 应当存在")
    _assert_duplicate_check_before_consume(
        inspect.getsource(function), "改邮箱（store.change_account_email）", "该邮箱已被其它账号使用"
    )


def _check_license_delete_refuses_when_ordered() -> None:
    from src.api import admin_licenses as admin_licenses_module

    function = getattr(admin_licenses_module, "admin_delete_license", None)
    expect_true(callable(function), "admin_licenses.admin_delete_license 应当存在")
    source = inspect.getsource(function)
    expect_true(
        "该授权已被订单引用" in source,
        "被订单引用时必须拒绝硬删（避免退款撤权益时找不到授权）",
    )


# ------------------------------------------------- 增量包履约必产生权益（P1 回归）


@contextmanager
def _products_db():
    """只建 products 一张表的临时**文件**库：够 bundled_feature_codes 展开「包含商品」。"""
    from sqlalchemy import create_engine
    from src.core.models import Product

    db_dir = Path(tempfile.mkdtemp(prefix="homeos-store-smoke-products-"))
    engine = create_engine(f"sqlite:///{db_dir / 'products.db'}")
    Product.__table__.create(engine)
    try:
        yield engine
    finally:
        engine.dispose()


def _check_addon_fulfillment_grants_entitlements() -> None:
    """增量包（只配 included_product_ids）履约后必须至少能开出 1 个能力码。

    原缺陷：``apply_addon_to_license`` 只展开增量包自己的 ``feature_codes_json``，漏了
    「包含商品」这一路。运营按「包含商品」配增量包是完全合法的配置（下单与结算都放行），
    于是顾客付完钱拿到一张什么都开不了的授权 —— licensing 的 features_for 是 fail-closed，
    激活时才 422，钱已经收了。
    """
    from sqlalchemy.orm import Session
    from src.commerce import fulfill
    from src.core.models import Product

    with _products_db() as engine:
        with Session(engine) as session:
            session.add(Product(id="parent", name="增量包", price_cents=100, feature_codes_json="[]", included_product_ids_json='["child"]'))
            session.add(Product(id="child", name="被包含商品", price_cents=0, feature_codes_json='["feature.child"]', included_product_ids_json="[]"))
            session.commit()

            parent = session.get(Product, "parent")
            expect(
                fulfill.bundled_feature_codes(session, parent),
                ["feature.child"],
                "bundled_feature_codes 必须展开包含商品的功能码",
            )
            expect_true(
                fulfill._product_grants_features(session, parent),  # noqa: SLF001 - 冒烟就是要钉这个私有判据
                "只配包含商品的增量包必须被判为「能开出能力」，否则会被履约守卫直接拦掉",
            )

    # 源码事实：追加与升级都要展开「包含商品」的功能码，履约后还要兜底断言。
    addon_source = inspect.getsource(fulfill.apply_addon_to_license)
    expect_true(
        "bundled_feature_codes(" in addon_source,
        "apply_addon_to_license 必须展开包含商品的功能码（缺 bundled_feature_codes 调用）",
    )
    expect_true(
        "grant_bundled_entitlements(" in inspect.getsource(fulfill.upgrade_license_in_place),
        "upgrade_license_in_place 必须展开包含商品，否则两种增量形态口径不一致",
    )
    order_source = inspect.getsource(fulfill.fulfill_order)
    expect_true(
        'order.license_action in {"issue", "patch", "upgrade"}' in order_source,
        "fulfill_order 的 _product_grants_features 守卫必须覆盖 issue / patch / upgrade",
    )
    expect_true(
        "_license_grants_features(" in order_source,
        "fulfill_order 必须在履约后断言授权至少能开出 1 个能力码，否则置 fulfillment_failed",
    )


# ------------------------------------------------------------ 默认渠道口径（P1 回归）


def _check_default_channel_stays_within_enabled() -> None:
    """没显式选渠道时必须落在**启用集合**内，不能读原始 payment_provider。

    原缺陷：``resolve_provider`` / 下单流程直接读 ``settings.payment_provider``，于是
    DB 里只勾了微信（``payment_channels_json=["wechat"]``）而环境变量是 alipay 时，
    顾客没选渠道就被冻结成支付宝 —— 前台展示微信、后台按支付宝收款，两边对不上。
    """
    import types

    from src.payments import channels as channels_module
    from src.payments import resolve_provider

    def default_for(channels_json: str, setting_provider: str, env_provider: str) -> str:
        setting = types.SimpleNamespace(
            payment_channels_json=channels_json,
            payment_provider=setting_provider,
        )
        settings = types.SimpleNamespace(payment_provider=env_provider)
        return channels_module.default_channel_name(setting, settings)

    expect(default_for('["wechat"]', "alipay", "alipay"), "wechat", "启用集合必须压过原始 payment_provider")
    expect(default_for('["wechat", "alipay"]', "alipay", "wechat"), "alipay", "配置的渠道本身也在启用集合内时应当直接采用")
    expect(default_for("", "", "wechat"), "wechat", "老部署（未写 payment_channels_json）回落到环境变量")
    expect(default_for('["wechat"]', "", "alipay"), "wechat", "setting 未写 payment_provider 时同样只能在启用集合内挑")
    expect(default_for("", "", "mock"), "", "一个渠道都没启用时必须返回空串（拒绝建单），不能退化成未知渠道")

    source = inspect.getsource(resolve_provider)
    expect_true(
        "default_channel_name(" in source,
        "resolve_provider 的无 name 分支必须走 default_channel_name（只在启用集合内挑）",
    )


# ----------------------------------------- 付款入账 → 退款撤权益（settle → revert 全链路）


def _check_settle_then_revert_license_chain() -> None:
    """settle_paid_order 履约成功，退款时必须能沿同一口径把授权还原回去。

    这一条是「钱与权益对得上」的底线：入账走 fulfill_order，退款走 revert_license_change，
    两边都要认同一个「是否还有别的有效订单在给这个商品付款」的判据（has_other_live_grant），
    否则重复购买同一增量包时，一笔退款会把别人付过钱的能力收回。
    """
    from src.api import admin_orders as admin_orders_module
    from src.commerce import fulfill
    from src.payments import settlement

    settle_source = inspect.getsource(settlement.settle_paid_order)
    expect_true("fulfill.fulfill_order(" in settle_source, "入账必须调 fulfill.fulfill_order")
    expect_true(
        "_mark_fulfillment_failed(" in settle_source,
        "履约抛异常时必须把订单标成 fulfillment_failed（而不是吞掉）",
    )
    expect_true(
        "def _mark_fulfillment_failed" in inspect.getsource(settlement),
        "settlement 必须提供 _mark_fulfillment_failed",
    )

    revert_source = inspect.getsource(fulfill.revert_license_change)
    expect_true(
        "has_other_live_grant(" in revert_source,
        "revert_license_change 收回权益前必须确认没有别的有效订单在给同一商品付款",
    )

    revoke_source = inspect.getsource(admin_orders_module._revoke_order_entitlements)  # noqa: SLF001
    expect_true(
        "fulfill.revert_license_change(" in revoke_source,
        "全额退款撤权益时必须优先走 fulfill.revert_license_change（还原升级/增量包）",
    )
    expect_true(
        "license_state_before_json" in revoke_source,
        "撤权益前必须确认订单留下了升级/增量包的授权快照，否则无从还原",
    )


def main() -> int:
    data_dir = prepare_environment()
    print(f"数据目录：{data_dir}")
    print(f"导入根：{BACKEND}")
    ensure_store_importable()
    if _payments_import_error is not None:
        print(f"警告：src.payments 顶层包 import 失败，已用临时兜底继续检查：{_payments_import_error}")

    print("\n环境：")
    check("src.payments 顶层包可正常 import（无残缺导入）", _check_payments_package_importable)

    print("\n退款幂等闸门（src.payments.refunds）：")
    check("refund_request_no 幂等号确定性、同参恒等、长度不超 128", _check_refund_request_no)
    check("REFUND_UNSETTLED_STATUSES 覆盖 running 与 processing", _check_refund_unsettled_statuses)
    check("open_refund_gate 首次 open / 同键第二次 in_flight", _check_refund_gate_open_then_in_flight)
    check("write_refund_result 落库后同键裁决 settled", _check_refund_gate_settled_after_write)
    check("failed 退款裁决为 retry", _check_refund_gate_failed_is_retry)
    check("unsettled_refund 只认 processing 的最新一行", _check_unsettled_refund_picks_latest_processing)

    print("\n邀请码（src.security.security）：")
    check("new_referral_code 恒 8 位、32 字符集、200 个互不相同", _check_referral_code_generation)
    check("REFERRAL_CODE_RE 兼容老 6 位数字码", _check_referral_code_regex_legacy)
    check("normalize_referral_code 归一化与非法输入拒绝", _check_normalize_referral_code)

    print("\n对账与设置：")
    check("对账巡检窗口 72 小时且关单窗口对齐", _check_reconcile_lookback_window)
    check("wechat_api_v3_key 的 max_length 为 64", _check_wechat_api_v3_key_max_length)

    print("\n优惠券（src.commerce.coupons + 后台路由）：")
    check("recompute_coupon_slots 可调用且挂上 maintenance 路由", _check_recompute_coupon_slots_wired)
    check("改券分支会调用 recount_coupon_slots", _check_coupon_patch_recounts_slots)

    print("\n验证码消费顺序（防枚举回归）：")
    check("注册先查重再消费验证码", _check_register_checks_duplicate_before_consuming)
    check("改邮箱先查占用再消费验证码", _check_change_email_checks_duplicate_before_consuming)

    print("\n授权删除：")
    check("被订单引用的授权拒绝硬删", _check_license_delete_refuses_when_ordered)

    print("\n增量包履约权益（P1 回归）：")
    check("只配包含商品的增量包履约后至少能开出 1 个能力码", _check_addon_fulfillment_grants_entitlements)

    print("\n默认渠道口径（P1 回归）：")
    check("未显式选渠道时必须落在启用集合内", _check_default_channel_stays_within_enabled)

    print("\n入账 → 退款撤权益（全链路）：")
    check("settle_paid_order 履约 / 退款沿同一判据还原授权", _check_settle_then_revert_license_chain)

    passed = checked - len(failures)
    print(f"\n通过 {passed} / {checked} 项检查。")
    if failures:
        print(f"\n冒烟失败，共 {len(failures)} 条：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print("冒烟通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
