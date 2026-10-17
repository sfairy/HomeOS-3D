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
    "1. 主应用 homeos（容器 ``homeos``，HTTP ``:8801`` / 内置 HTTPS ``:8803``）："
    "面向 Home Assistant 的本机仪表盘与中控。含首次设置 ``/setup``、账号与登录会话、"
    "HA 集成与设备控制、授权激活 ``/license``，以及只读 3D 户型总览 ``/`` 与创作端 "
    "``/studio/editor``、``/3d-studio``。\n"
    "2. 授权商店 homeos-store（容器 ``homeos-store``，HTTP ``:8802``；没有任何 HTTPS 端口）："
    "商店前台、运营后台 ``/admin`` 与授权服务器（Ed25519 租约 + X25519 传输）三合一。支付支持"
    "支付宝当面付与微信支付 Native 扫码；未配置支付渠道时下单直接 503，不会回落到任何免费通道。\n"
    "3. 部署：仓库根两份 compose 文件都是自包含的（值写死在文件里，不需要 .env、不需要脚本）—— "
    "``docker-compose.yml`` 给开发者 / 管理员自己那台（商店 + 主应用一起起，整个产品唯一的商店就在"
    "这里），``docker-compose.app.yml`` 给客户机（只有主应用，商店地址两行已填好："
    "``APP_LICENSE_SERVER_URL`` 给容器出站、``APP_STORE_URL`` 给登录页的商店链接 —— 后者"
    "显式写死，免得商店不可达时前端兜底成 ``127.0.0.1``）。"
    "授权公钥无需人工投放 —— 同机部署由主应用只读挂载商店写出的共享卷，分机部署由主应用启动时"
    "向授权服务器 ``GET /v2/keys`` 自动取回并落盘（首次取回后指纹即固定）。跨公网 / 要收款时"
    "取消 ``docker-compose.yml`` 里「公网接入」段的注释，上真实证书 HTTPS"
    "（见 ``ops/deploy/PUBLIC-ACCESS.md``）。"
    "Caddy 反向代理内置在镜像中，主应用开箱即有内网 HTTPS"
    "（自签证书，首次访问需手动放行），无需单独的反代容器。"
    "用 IP 打开 ``https://<局域网IP>:8803`` 时设 ``APP_HTTPS_DEFAULT_SNI=<该IP>``："
    "浏览器访问 IP 字面量不发 SNI，不设它证书只会签给容器自己的 docker IP，浏览器会报"
    "「证书与地址不匹配」。商店不提供 HTTPS（``http://<局域网IP>:8802`` 是唯一的内网入口，"
    "也没有 8804 这类自签端口）。\n"
    "4. 安全默认：管理员账号只能在浏览器 ``/setup`` 创建，不走环境变量；验证码没有回显通道"
    "（联调用 ``STORE_MAIL_MODE=log`` 看日志，生产配 SMTP）；主应用的可信代理收敛到容器回环 "
    "``127.0.0.1,::1``，商店侧用 ``STORE_TRUSTED_PROXIES`` 覆盖容器内回环与 docker 网段"
    "（宿主反代 / 隧道反代到发布端口时源是网桥网关，公网口径已配好），限流与审计按解析后的"
    "真实来源 IP 统计；公网 HTTPS 与内网 HTTP "
    "并存时，``COOKIE_SECURE`` / ``STORE_COOKIE_SECURE`` 用 ``auto``"
    "（按本次请求实际协议决定 Cookie 的 Secure），别写死 true / false。\n"
    "5. 数据落盘：数据库、授权私钥与自签证书都在下列卷 / 目录中，升级（替换镜像并重启）与跨机"
    "迁移时务必保留（``homeos_homeos-data`` / ``homeos_homeos-secrets`` / "
    "``homeos_homeos-store-data`` / ``homeos_homeos-license-keys`` / "
    "``homeos_homeos-client-keys``）。"
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
