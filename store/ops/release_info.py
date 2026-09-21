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

from store.core.models import Release

logger = logging.getLogger("store.ops.release_info")

CURRENT_VERSION = "0.6.2"
CURRENT_RELEASE_DATE = "2026-09-20"
CURRENT_UPGRADE_NOTES = (
    "1. 授权恢复链路重做：新增 ``POST /api/v1/license/retry``（立即发起一轮恢复并跳过端点"
    "冷却）与匿名可读的 ``GET /api/v1/license/availability``；授权不可用时 /pair 与 /display/* "
    "会就地渲染连接状态页（不新增路由、不要求登录）。展示端在授权受限时不再跳到需要登录的"
    "管理员激活页，而是留在原地自动重试，网络恢复后无需人工操作。\n"
    "2. 授权失败改为分级处置：网络类故障按指数退避自动重试，并把「可重试 / 需人工介入」的"
    "结论（canRetry / nextRetryAt / retryAttempt）交给前端决定是否继续显示重试按钮；端点"
    "拉黑时长与重试节奏对齐为 120 秒，避免每一轮重试都撞在冷却里。\n"
    "3. 授权租约凭证写入增加跨进程文件锁（backend/license/process_lock.py）：同一数据目录"
    "只允许一个实例续租，第二个实例启动即失败并说明原因，不再出现两个进程互相把对方写成"
    "重放而各自锁死。\n"
    "4. 户型自动导图：底图分辨率改为「保留控件宽高比、面积对齐画布」换算，修复导图与预览"
    "比例不一致导致的位置偏移；生成完成改为可关闭的浮层（完成 / 关闭 / 背景点击 / Esc），"
    "置换失败时恢复预览并提示重试。\n"
    "5. 无数据库结构变更、无迁移；升级只需替换镜像并保留全部数据卷 / 数据目录"
    "（homeos-3d-data / homeos-3d-store-data / homeos-3d-license-keys / homeos-3d-client-keys）。"
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

    # ``releases`` 上 (product, channel, version) 是唯一索引，「查不到就插」在多实例同时
    # 启动时会撞索引，而这是**启动路径**，一次竞争就让容器起不来。用 SAVEPOINT 兜住。
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
