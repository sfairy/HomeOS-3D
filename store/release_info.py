"""当前版本的发布记录常量与兜底写入。

store 的库不走 Alembic：结构由 ``create_all`` 在启动时创建。这里只保留
「当前版本的发布记录」——``/store/v1/updates/latest`` 查的正是这张表，
客户端靠它判断是否有新版本。
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.models import Release

logger = logging.getLogger("store.release_info")

CURRENT_VERSION = "0.5.5"
CURRENT_RELEASE_DATE = "2026-09-15"
CURRENT_UPGRADE_NOTES = (
    "1. 品牌标识统一为 HomeOS，图标与标识文件名统一为 homeos-*。\n"
    "2. 库存口径修正：发码时扣减库存总量、退款时释放预留，"
    "杜绝「同一件库存被反复卖出」。\n"
    "3. 优惠码名额修正：取消/退款自动归还名额，且「每人限用」不再把已取消的订单"
    "算成已使用（此前用户会永久失去该优惠码）。\n"
    "4. 管理后台所有时间改为按浏览器本地时区显示与录入（库内仍存 UTC）。\n"
    "5. 管理后台补齐商品字段与商品图上传、登录会话/客户端会话/找回令牌的撤销入口、"
    "日志清理入口，并让诊断类列表支持翻页。"
)


def ensure_current_release(session: Session) -> bool:
    """确保 docker 渠道存在当前版本的发布记录（幂等）。"""
    exists = session.scalars(
        select(Release).where(
            Release.product == "homeos",
            Release.channel == "docker",
            Release.version == CURRENT_VERSION,
        )
    ).first()
    if exists is not None:
        return False
    session.add(
        Release(
            product="homeos",
            channel="docker",
            version=CURRENT_VERSION,
            release_date=CURRENT_RELEASE_DATE,
            upgrade_notes=CURRENT_UPGRADE_NOTES,
        )
    )
    session.flush()
    logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
    return True
