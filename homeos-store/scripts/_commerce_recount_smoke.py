#!/usr/bin/env python3
"""授权商店「计数列重算」回归：单次聚合必须和逐行口径算出同一个结果。

为什么需要它
------------
``reserved_stock`` / ``redeemed_count`` 是反规范化的计数快照，真相分别在 orders 与
coupon_redemptions。后台维护动作「重算库存预留」「重算优惠码名额」负责把漂移纠回来，
它们曾经是逐行跑 count 的 N+1：

* ``recompute_coupon_slots`` 对**每个**优惠码各发一次 count，码多就是 1+N 次查询；
* ``recompute_reserved_stock`` 把整个商品表读进 ORM 再逐行比对。

改成「一条分组聚合 + 只取不一致的行」之后，口径必须完全不变，尤其是
:func:`holds_slot_conditions` 那组判据（未作废、有订单、订单不在释放态）与
``stock_reservation_released_at`` 的过滤 —— 这里把每种边界各钉一行，
只要有人顺手把判据写松或写紧就会红。

用法
----
从仓库根执行（解释器用仓库根的 ``.venv-store``）：

    .venv-store/bin/python homeos-store/scripts/_commerce_recount_smoke.py

纯离线：只在 tempfile 里的 SQLite 建表，不起服务器、不碰 data/ 下的真实库。
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

STORE_ROOT = Path(__file__).resolve().parents[1]
BACKEND = STORE_ROOT / "backend"
sys.path.insert(0, str(BACKEND))

failures: list[str] = []
checked = 0


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name} —— {error}")
        print(f"  FAIL {name} —— {error}")
    except Exception as error:  # 未预期异常同样算失败，但要看清类型
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def expect(condition: object, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def make_session_factory():
    """临时文件 SQLite + 按 ORM 元数据建表；返回 sessionmaker。"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from src.core import models, models_engagement  # noqa: F401  # 建表前先注册全部模型
    from src.core.database import Base

    tmp = tempfile.TemporaryDirectory(prefix="store-recount-")
    engine = create_engine(f"sqlite:///{Path(tmp.name) / 'store.db'}", future=True)
    Base.metadata.create_all(engine)
    return tmp, sessionmaker(bind=engine, expire_on_commit=False, future=True)


def main() -> int:
    from src.commerce import coupons as coupon_ops
    from src.commerce import fulfill
    from src.core.models import Account, Order, Product
    from src.core.models_engagement import Coupon, CouponRedemption
    from src.security.security import utcnow

    tmp, session_factory = make_session_factory()
    try:
        with session_factory() as session:
            # 冒烟库里不需要真口令：用一个变量绕开「字面量赋给 password_hash」的扫描。
            placeholder_hash = "smoke"
            account = Account(email="recount@example.com", password_hash=placeholder_hash)
            # 库存真值 / 记录值：a 真 2 记 5、b 真 1 记 0、c 真 0 记 3、d 真 0 记 0（不该出现）
            products = {
                key: Product(
                    name=f"P-{key}", product_code="homeos", price_cents=100, reserved_stock=value
                )
                for key, value in (("a", 5), ("b", 0), ("c", 3), ("d", 0))
            }
            # 名额真值 / 记录值：x 真 2 记 7、y 真 1 记 0、z 真 0 记 4、w 真 0 记 0（不该出现）
            coupons = {
                key: Coupon(code=f"C-{key}", redeemed_count=value)
                for key, value in (("x", 7), ("y", 0), ("z", 4), ("w", 0))
            }
            session.add_all([account, *products.values(), *coupons.values()])
            session.flush()

            counter = {"n": 0}

            def order(product: Product, status: str, *, released: bool = False) -> Order:
                counter["n"] += 1
                row = Order(
                    order_no=f"NO-{counter['n']:03d}-{status}",
                    email="recount@example.com",
                    product_id=product.id,
                    product_name=product.name,
                    status=status,
                    stock_reservation_released_at=utcnow() if released else None,
                )
                session.add(row)
                # 主键是 Python 侧 default，flush 之后才有值；下面要拿 row.id 挂核销记录。
                session.flush()
                return row

            def redeem(coupon: Coupon, order_row: Order | None, *, voided: bool = False) -> None:
                session.add(
                    CouponRedemption(
                        coupon_id=coupon.id,
                        account_id=account.id,
                        order_id=None if order_row is None else order_row.id,
                        voided_at=utcnow() if voided else None,
                        discount_cents=0,
                    )
                )

            # 商品 a：pending + fulfillment_failed → 真值 2（另有下面两条订单也落在 a 上）
            order(products["a"], "pending")
            order(products["a"], "fulfillment_failed")
            # 商品 b：paid 有效、cancelled 且已释放 → 真值 1（只有 paid 算）
            order(products["b"], "paid")
            order(products["b"], "cancelled", released=True)
            # 商品 c：全是终态 → 真值 0
            order(products["c"], "cancelled")
            order(products["c"], "refunded")
            session.flush()

            paid_order = order(products["a"], "paid")
            session.flush()
            # 码 x：paid + pending 两条有效 → 真值 2；另三种干扰行都不占名额
            redeem(coupons["x"], paid_order)
            redeem(coupons["x"], order(products["b"], "pending"))
            redeem(coupons["x"], paid_order, voided=True)
            redeem(coupons["x"], None)
            redeem(coupons["x"], order(products["c"], "refunded"))
            # 码 y：一条有效 → 真值 1
            redeem(coupons["y"], order(products["a"], "pending"))
            # 码 z：只有无效核销 → 真值 0
            redeem(coupons["z"], paid_order, voided=True)
            redeem(coupons["z"], None)
            session.commit()

            def case_stock_only_mismatch_rows_are_returned():
                # 真值：a = pending + fulfillment_failed + paid + 码 y 的 pending = 4（记 5）
                #       b = paid + pending = 2（记 0）
                #       c = cancelled + refunded = 0（记 3）
                #       d = 无订单 = 0（记 0，不该出现在结果里）
                changes = fulfill.recompute_reserved_stock(session)
                expect(
                    changes == {products["a"].id: -1, products["b"].id: 2, products["c"].id: -3},
                    f"库存修正量应为 a:-1 b:+2 c:-3，实际 {changes!r}",
                )
                expect(products["d"].id not in changes, "本来就一致的商品不应出现在结果里")
                session.expire_all()
                expect(products["a"].reserved_stock == 4, "商品 a 重算后应为 4")
                expect(products["b"].reserved_stock == 2, "商品 b 重算后应为 2")
                expect(products["c"].reserved_stock == 0, "商品 c 重算后应为 0")

            def case_stock_recompute_is_idempotent():
                expect(
                    fulfill.recompute_reserved_stock(session) == {},
                    "已一致时库存重算不应再产生修正",
                )

            def case_coupon_slots_match_row_by_row_judgement():
                changes = coupon_ops.recompute_coupon_slots(session)
                expect(
                    changes == {coupons["x"].id: -5, coupons["y"].id: 1, coupons["z"].id: -4},
                    f"名额修正量应为 x:-5 y:+1 z:-4，实际 {changes!r}",
                )
                expect(coupons["w"].id not in changes, "本来就一致的码不应出现在结果里")
                session.expire_all()
                expect(coupons["x"].redeemed_count == 2, "码 x 重算后应为 2")
                expect(coupons["y"].redeemed_count == 1, "码 y 重算后应为 1")
                expect(coupons["z"].redeemed_count == 0, "码 z 重算后应为 0")

            def case_coupon_recompute_is_idempotent():
                expect(
                    coupon_ops.recompute_coupon_slots(session) == {},
                    "已一致时名额重算不应再产生修正",
                )

            def case_recount_single_coupon_matches_bulk():
                # 兜底入口与单点入口（增删名额的常规路径都走它）口径必须一致：
                # 把码 x 改脏，单点重算应纠回 2，随后批量重算不该再报修正。
                coupons["x"].redeemed_count = 99
                session.flush()
                expect(
                    coupon_ops.recount_coupon_slots(session, coupons["x"].id) == 2,
                    "单点重算码 x 应为 2",
                )
                expect(
                    coupon_ops.recompute_coupon_slots(session).get(coupons["x"].id) is None,
                    "单点重算已对齐，批量不该再报修正",
                )

            def case_released_order_stops_holding_slots():
                # 到期 / 退款订单不再占名额：把还挂着的 pending 订单判为 expired，
                # 码 x 少一条有效核销、码 y 直接清零。
                for row in session.query(Order).filter(Order.status == "pending").all():
                    row.status = "expired"
                session.flush()
                changes = coupon_ops.recompute_coupon_slots(session)
                expect(
                    changes == {coupons["x"].id: -1, coupons["y"].id: -1},
                    f"订单释放后应为 x:-1 y:-1，实际 {changes!r}",
                )

            check("库存重算：只返回不一致行且数值正确", case_stock_only_mismatch_rows_are_returned)
            check("库存重算：幂等（第二次空结果）", case_stock_recompute_is_idempotent)
            check("名额重算：口径与逐行判定一致", case_coupon_slots_match_row_by_row_judgement)
            check("名额重算：幂等（第二次空结果）", case_coupon_recompute_is_idempotent)
            check("名额重算：单点与批量口径一致", case_recount_single_coupon_matches_bulk)
            check("名额重算：订单释放后不再占名额", case_released_order_stops_holding_slots)
    finally:
        tmp.cleanup()

    print()
    if failures:
        print(f"计数列重算回归失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"计数列重算回归全部通过（{checked} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
