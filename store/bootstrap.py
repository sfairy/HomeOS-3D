"""启动时幂等补齐的默认数据：商品目录、站点配置。

与 ``store.tools.seed`` 的区别：这里只处理「不影响运营决策」的基础设施——
商品目录是客户端授权校验的硬依赖（feature_codes 对不上就无法下单），站点配置
缺了后台和支付渠道全跑不起来。**管理员账号不在此**——部署者必须通过 /setup
页面显式创建，绝不能用硬编码默认口令。

幂等契约：每条数据都只在「库里完全不存在」时写入，不覆盖已有行的任何字段。
运营在后台改了价格/商品名之后重启服务，改动不会被踢回去。
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.models import Product, StoreSetting
from store.serializers import list_json

logger = logging.getLogger("store.bootstrap")

# --------------------------------------------------------------------------- #
# 商品
# --------------------------------------------------------------------------- #
# 与参考站 pay.habridge.cn 实测完全一致的功能码清单
BASE_PRODUCT_FEATURES = [
    "api", "assets", "display", "editor", "ha.configure",
    "ha.control", "ha.sync", "projects.write", "runtime.websocket",
]
MODULE_3D_FEATURES = ["module.3d_interaction"]


def ensure_default_products(session: Session) -> None:
    """补齐三条默认商品（base / module / package）。已存在的跳过。"""
    existing = {p.product_type: p for p in session.scalars(select(Product))}
    missing = [t for t in ("base", "module", "package") if t not in existing]
    if not missing:
        return

    base = existing.get("base")
    if base is None:
        base = Product(
            name="编辑器+绘制工具",
            product_code="homeos",
            price_cents=4990,
            validity_days=None,
            product_type="base",
            feature_codes_json=list_json(BASE_PRODUCT_FEATURES),
            included_product_ids_json=list_json([]),
            active=True,
            display_description="如需3D交互可后续再账号中心升级",
            sort_order=100,
            fulfillment_mode="automatic",
        )
        session.add(base)
        session.flush()

    module = existing.get("module")
    if module is None:
        module = Product(
            name="3D交互包",
            product_code="homeos",
            price_cents=3990,
            validity_days=None,
            product_type="module",
            feature_codes_json=list_json(MODULE_3D_FEATURES),
            included_product_ids_json=list_json([]),
            active=True,
            sort_order=100,
            fulfillment_mode="automatic",
            requires_license=True,
        )
        session.add(module)
        session.flush()

    package = existing.get("package")
    if package is None:
        package = Product(
            name="编辑器+绘制工具+3D交互",
            product_code="homeos",
            price_cents=7990,
            validity_days=None,
            product_type="package",
            feature_codes_json=list_json(BASE_PRODUCT_FEATURES + MODULE_3D_FEATURES),
            included_product_ids_json=list_json([module.id]),
            active=True,
            sort_order=100,
            fulfillment_mode="automatic",
        )
        session.add(package)
        session.flush()

    logger.info("已补齐默认商品：%s", "、".join(missing))


def ensure_default_settings(session: Session) -> None:
    """补齐默认站点配置（id=1）。已存在的跳过。"""
    existing = session.get(StoreSetting, 1)
    if existing is not None:
        return
    session.add(StoreSetting(id=1))
    session.flush()
    logger.info("已补齐默认站点配置。")
