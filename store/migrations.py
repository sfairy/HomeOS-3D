"""启动时执行的存量数据迁移（幂等）。

store 的库没有走 Alembic——``alembic.ini`` 指向的是主应用的 ``data/app.db``，
而这里是 ``store/data/store.db``，结构变更由 ``create_all`` 负责。所以
「历史数据回填」集中放在本文档，启动时跑一遍，重复执行无副作用。
"""

from __future__ import annotations

import logging

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from store.models import Product, Release

logger = logging.getLogger("store.migrations")

#: 品牌改名前的旧标识。这两列存的是**标识**而不是文案，必须回填：
#: 按新值查询会查不到旧数据，且失败是静默的（查不到 → 当作「没有更新」）。
_LEGACY_BRAND = "ha-bridge"
_CURRENT_BRAND = "homeos"

#: (模型, 列名, 日志标签)
_BRAND_COLUMNS = (
    (Release, "product", "releases.product"),
    (Product, "product_code", "products.product_code"),
)

#: 破坏性变更所在的版本。协议标识改名后必须让「检查更新」能看到这个版本号，
#: 否则老客户端会被踢下线、却拿不到任何可升级的目标版本（VERSION 文件同步）。
CURRENT_VERSION = "0.5.5"
CURRENT_RELEASE_DATE = "2026-09-15"
CURRENT_UPGRADE_NOTES = (
    "1. 品牌全面更名为 HomeOS，图标与标识统一改为 homeos-* 文件名，"
    "老部署启动时会自动把库内遗留的旧图标路径与旧品牌标识归一。\n"
    "2. 【破坏性变更】授权传输协议标识与产品标识同步改名（ha-bridge → homeos）。"
    "服务端只接受新标识：请**先升级客户端、再升级服务端**，"
    "否则老客户端会在解密阶段直接失败、没有降级路径。\n"
    "3. 库存口径修正：发码时扣减库存总量、退款时释放预留，"
    "杜绝「同一件库存被反复卖出」。\n"
    "4. 优惠码名额修正：取消/退款自动归还名额，且「每人限用」不再把已取消的订单"
    "算成已使用（此前用户会永久失去该优惠码）。\n"
    "5. 管理后台所有时间改为按浏览器本地时区显示与录入（库内仍存 UTC）。\n"
    "6. 管理后台补齐商品字段与商品图上传、登录会话/客户端会话/找回令牌的撤销入口、"
    "日志清理入口，并让诊断类列表支持翻页。"
)


def ensure_current_release(session: Session) -> bool:
    """确保 docker 渠道存在**当前版本**的发布记录（幂等）。

    为什么不交给人工在后台「版本发布」里补：硬切协议之后，老客户端唯一的自救
    路径就是「检查更新」，而这一步查的正是这张表。让启动流程兜底，才不会出现
    「服务端已经只认新标识、更新接口却还只报旧版本号」的空窗。
    """
    exists = session.scalars(
        select(Release).where(
            Release.product == _CURRENT_BRAND,
            Release.channel == "docker",
            Release.version == CURRENT_VERSION,
        )
    ).first()
    if exists is not None:
        return False
    session.add(
        Release(
            product=_CURRENT_BRAND,
            channel="docker",
            version=CURRENT_VERSION,
            release_date=CURRENT_RELEASE_DATE,
            upgrade_notes=CURRENT_UPGRADE_NOTES,
        )
    )
    session.flush()
    logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
    return True


def rebrand_legacy_identifiers(session: Session) -> dict[str, int]:
    """把品牌改名遗留的旧标识改写为新值，返回「表.列 → 修正行数」。

    ``Release.product``：``/store/v1/updates/latest`` 按 ``product == "homeos"``
    过滤，旧值回填前老部署的客户端会永远收不到更新。
    ``Product.product_code``：该列不参与匹配，但同一列混着两种取值会让后续
    按产品码筛选、统计的口径不可靠，一并归一。
    """
    changed: dict[str, int] = {}
    for model, attribute, label in _BRAND_COLUMNS:
        column = getattr(model, attribute)
        result = session.execute(
            update(model).where(column == _LEGACY_BRAND).values(**{attribute: _CURRENT_BRAND})
        )
        if result.rowcount:
            changed[label] = int(result.rowcount)
    if changed:
        session.flush()
        logger.info("已把旧品牌标识归一为新值：%s", changed)
    return changed
