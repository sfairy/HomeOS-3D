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

CURRENT_VERSION = "0.5.6"
CURRENT_RELEASE_DATE = "2026-09-17"
CURRENT_UPGRADE_NOTES = (
    "1. 自托管改为双容器：主应用（18081）与授权商店 / 授权服务器（18082）"
    "通过 Docker Compose 一并拉起；默认镜像 ghcr.io/sfairy/homeos-3d 与 …-store。\n"
    "2. 商店容器负责生成或复用授权密钥，并把公钥同步到共享卷；"
    "主应用等待公钥就绪后再启动。首次部署请设置 STORE_ADMIN_EMAIL / STORE_ADMIN_PASSWORD 完成 seed。\n"
    "3. 运行镜像不再包含可读业务源码（Python 仅留 .pyc，业务 JS 经混淆）；"
    "生产清单与反代示例见 deploy/PRODUCTION.md。\n"
    "4. .env.example 收敛为部署常改项置顶；邮件 / SMTP / 支付渠道请到商店 /admin「站点配置」修改，免重启。\n"
    "5. 升级时请保留全部数据卷（homeos-3d-data / homeos-3d-store-data /"
    "homeos-3d-license-keys / homeos-3d-client-keys），不要删卷。"
)


def ensure_current_release(session: Session) -> bool:
    """确保 docker 渠道存在当前版本的发布记录（幂等；已存在则同步升级说明）。"""
    existing = session.scalars(
        select(Release).where(
            Release.product == "homeos",
            Release.channel == "docker",
            Release.version == CURRENT_VERSION,
        )
    ).first()
    if existing is not None:
        changed = False
        if existing.release_date != CURRENT_RELEASE_DATE:
            existing.release_date = CURRENT_RELEASE_DATE
            changed = True
        if existing.upgrade_notes != CURRENT_UPGRADE_NOTES:
            existing.upgrade_notes = CURRENT_UPGRADE_NOTES
            changed = True
        if changed:
            session.flush()
            logger.info("已同步 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
        return changed

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
