"""当前版本的发布记录常量与兜底写入。
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import __version__ as _package_version
from ..core.models import Release

logger = logging.getLogger("src.ops.release_info")

CURRENT_VERSION = _package_version
CURRENT_RELEASE_DATE = "2026-09-28"
CURRENT_UPGRADE_NOTES = (
    f"HomeOS 首个正式版本（{CURRENT_VERSION}）。全新首发，没有历史版本升级路径，也不需要任何数据迁移："
    "首次启动即自动建库并生成授权密钥。\n"
    "1. 主应用 homeos-3d（容器 ``homeos-3d``，HTTP ``:8801`` / 内置 HTTPS ``:8803``）："
    "面向 Home Assistant 的本机仪表盘与中控。含首次设置 ``/setup``、账号与登录会话、"
    "HA 集成与设备控制、编辑器与展示端、设备配对、授权激活 ``/license``，以及 3D 户型工作室 "
    "``/3d-studio``。\n"
    "2. 授权商店 homeos-store（容器 ``homeos-3d-store``，HTTP ``:8802`` / 内置 HTTPS ``:8804``）："
    "商店前台、运营后台 ``/admin`` 与授权服务器（Ed25519 租约 + X25519 传输）三合一。支付支持"
    "支付宝当面付与微信支付 Native 扫码；未配置支付渠道时下单直接 503，不会回落到任何免费通道。\n"
    "3. 一键部署：``ops/deploy/deploy.sh`` 收口三种形态 —— 同机（默认）、只商店"
    "（``--role store``）、只主应用（``--role app --license-server ...``）。脚本按角色拉取 GHCR "
    "镜像、准备宿主标识、等待健康检查并打印访问地址；授权公钥无需人工投放 —— 同机部署由主应用"
    "只读挂载商店写出的共享卷，分拆部署由主应用启动时向授权服务器 ``GET /v2/keys`` 自动取回并"
    "落盘（首次取回后指纹即固定）。Caddy 反向代理内置在镜像中，"
    "开箱即有内网 HTTPS（自签证书，首次访问需手动放行），无需单独的反代容器。\n"
    "4. 安全默认：管理员账号只能在浏览器 ``/setup`` 创建，不走环境变量；验证码没有回显通道"
    "（联调用 ``STORE_MAIL_MODE=log`` 看日志，生产配 SMTP）；可信代理收敛到容器回环 "
    "``127.0.0.1,::1``，限流与审计按解析后的真实来源 IP 统计；HTTP 与 HTTPS 都要能登录时，"
    "把 ``APP_COOKIE_SECURE`` / ``STORE_COOKIE_SECURE`` 设为 ``false``。\n"
    "5. 数据落盘：数据库、授权私钥与自签证书都在下列卷 / 目录中，升级（替换镜像并重启）与跨机"
    "迁移时务必保留（``homeos-3d-data`` / ``homeos-3d-secrets`` / ``homeos-3d-store-data`` / "
    "``homeos-3d-license-keys`` / ``homeos-3d-client-keys``）。"
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
            raise
        changed = _sync_release_fields(existing)
        session.flush()
        logger.info("并发写入撞上唯一索引，已复用既有的 %s 发布记录。", CURRENT_VERSION)
        return changed
    logger.info("已补写 %s 渠道 %s 发布记录。", "docker", CURRENT_VERSION)
    return True
