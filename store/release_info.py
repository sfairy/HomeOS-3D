"""当前版本的发布记录常量与兜底写入。

store 的库不走 Alembic：结构由 ``create_all`` 在启动时创建。这里只保留
「当前版本的发布记录」——``/store/v1/updates/latest`` 查的正是这张表，
客户端靠它判断是否有新版本。
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from store.models import Release

logger = logging.getLogger("store.release_info")

CURRENT_VERSION = "0.5.6"
CURRENT_RELEASE_DATE = "2026-09-17"
CURRENT_UPGRADE_NOTES = (
    "1. 自托管改为双容器：主应用（18081）与授权商店 / 授权服务器（18082）"
    "通过 Docker Compose 一并拉起；默认镜像 ghcr.io/sfairy/homeos-3d 与 …-store。\n"
    "2. 商店容器负责生成或复用授权密钥，并把公钥同步到共享卷；"
    "主应用等待公钥就绪后再启动。首次部署请在浏览器打开 "
    "http://<商店地址>:18082/setup 创建管理员（不再支持 STORE_ADMIN_EMAIL / "
    "STORE_ADMIN_PASSWORD 环境变量）。\n"
    "3. 运行镜像不再包含可读业务源码（Python 仅留 .pyc，业务 JS 经混淆）；"
    "生产清单与反代示例见 deploy/PRODUCTION.md。\n"
    "4. .env.example 收敛为部署常改项置顶；邮件 / SMTP / 支付渠道请到商店 /admin「站点配置」修改，免重启。\n"
    "5. 升级时请保留全部数据卷（homeos-3d-data / homeos-3d-store-data /"
    "homeos-3d-license-keys / homeos-3d-client-keys），不要删卷。"
)


def _load_current_release(session: Session) -> Release | None:
    """读 docker 渠道当前版本的发布记录（``None`` 表示还没有）。"""
    return session.scalars(
        select(Release).where(
            Release.product == "homeos",
            Release.channel == "docker",
            Release.version == CURRENT_VERSION,
        )
    ).first()


def _sync_release_fields(release: Release) -> bool:
    """把已存在的记录对齐到常量；返回是否改动了内容。"""
    changed = False
    if release.release_date != CURRENT_RELEASE_DATE:
        release.release_date = CURRENT_RELEASE_DATE
        changed = True
    if release.upgrade_notes != CURRENT_UPGRADE_NOTES:
        release.upgrade_notes = CURRENT_UPGRADE_NOTES
        changed = True
    return changed


def ensure_current_release(session: Session) -> bool:
    """确保 docker 渠道存在当前版本的发布记录（幂等；已存在则同步升级说明）。"""
    existing = _load_current_release(session)
    if existing is not None:
        if _sync_release_fields(existing):
            session.flush()
            logger.info("已同步 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
            return True
        return False

    # ``releases`` 上 (product, channel, version) 是唯一索引，于是「查不到就插」在多个
    # 实例同时启动时会撞索引 —— 而这是**启动路径**，一次竞争就会让容器起不来。
    # 用 SAVEPOINT 兜住：撞了说明别处刚插好，回滚这一条重查、按「已存在」处理即可。
    # flush 放在 SAVEPOINT 内并关掉自动 flush（见 ``store/api/admin.py`` 同款写法）。
    try:
        with session.no_autoflush, session.begin_nested():
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
    except IntegrityError:
        existing = _load_current_release(session)
        if existing is None:
            # 撞的不是这条唯一性（不该发生）：让启动照旧失败，别把结构问题藏起来。
            raise
        changed = _sync_release_fields(existing)
        session.flush()
        logger.info("并发写入撞上唯一索引，已复用既有的 %s 发布记录。", CURRENT_VERSION)
        return changed
    logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
    return True
