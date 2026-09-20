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

CURRENT_VERSION = "0.6.1"
CURRENT_RELEASE_DATE = "2026-09-20"
CURRENT_UPGRADE_NOTES = (
    "1. 全量安全与质量审计（P1–P12）落地：修复授权商店与主应用的一批高危 / 中危缺陷"
    "（首次设置守卫、CSRF 同源闸门、会话与配对码生命周期、上传体积上限、媒体代理归属、"
    "并发写入的唯一性退让等），详见仓库 README 的更新日志。\n"
    "2. 数据库迁移由单条基线扩展为 0001 → 0003：0002 为项目名加唯一索引并对历史重名行做"
    "确定性改名，0003 新建 project_path_aliases，让改名前的展示地址仍可访问（303 跳转）。"
    "启动时自动执行，无需手工命令。\n"
    "3. 邀请积分由 FLOAT（积分）改为 INTEGER（厘，1 积分 = 100 厘），启动时自动完成"
    "「补列 → 回填 + 逐行对账 → 退役旧列」并先做数据库快照；对外 JSON 仍是两位小数字符串，"
    "前端与客户端无需改动。\n"
    "4. 授权服务器心跳现在校验 instanceId，吊销响应改为结构化 code / revoked："
    "旧客户端必须与本服务端一并升级，否则会被判为确认吊销。\n"
    "5. 仓库目录分包（backend/、store/ 与前端静态资源按功能域分组），对运行时行为无影响；"
    "同步移除内置自动化测试设施（此后改动请人工走关键路径）。\n"
    "6. 升级时请保留全部数据卷 / 数据目录（homeos-3d-data / homeos-3d-store-data /"
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
