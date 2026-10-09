"""HA 连接凭据解析（单源：``ha_connections`` 表）。

1. 活跃 ``ha_connections`` 记录（``PUT /ha/connection`` 写入）；
2. 无记录时回落环境变量 ``HA_URL`` / ``HA_URL_FALLBACK`` / ``HA_TOKEN``（首次引导）。

:func:`load_ha_endpoints` 返回静态内网优先配置；:func:`load_active_ha_endpoints`
反映连接器当前端点。旁路消费者统一用后者。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.models import HAConnection
from ..ha.crypto import CredentialCipher, CredentialCipherError
from ..ha.endpoints import ENDPOINT_EXTERNAL


@dataclass(frozen=True)
class HaEndpoints:
    ha_url_primary: str
    ha_url_fallback: str
    token: str


#: HA 配置/故障转移日志器（中文展示名「HA配置」）
logger = logging.getLogger("homeos.ha_config")


def normalize_ha_url(raw: str) -> str:
    ha_url = (raw or "").rstrip("/")
    host_ip = os.getenv("HOST_IP", "").strip()
    if host_ip and host_ip != "host.docker.internal" and "host.docker.internal" in ha_url:
        ha_url = ha_url.replace("host.docker.internal", host_ip)
    return ha_url


def is_localhost_ha_url(url: str) -> bool:
    """判断 HA URL 是否指向本机回环地址（容器内不可达宿主机 HA）。"""
    try:
        host = urlparse(url.strip()).hostname or ""
    except ValueError:
        return False
    host = host.lower().strip("[]")
    return host in ("localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1")


def validate_ha_url_for_deploy(url: str, allow_localhost: bool = False) -> str | None:
    """校验 HA URL 是否可用于部署环境；返回错误描述，通过则返回 None。"""
    trimmed = (url or "").strip()
    if not trimmed:
        return "HA 地址不能为空"
    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return "HA 地址须以 http:// 或 https:// 开头"
    if not allow_localhost and is_localhost_ha_url(trimmed):
        return "HA 地址不能使用 localhost 或 127.0.0.1（Docker/远程部署请使用宿主机 LAN IP 或 host.docker.internal）"
    return None


def allow_ha_localhost() -> bool:
    """本机（非容器）运行允许 localhost；容器内 / 生产环境不允许。"""
    from pathlib import Path

    try:
        return not Path("/.dockerenv").exists()
    except OSError:
        return os.getenv("NODE_ENV", "development") != "production"


def describe_ha_url_for_deploy_error(url: str) -> str | None:
    """诊断型接口（连通性探测）使用的非抛异常校验。"""
    return validate_ha_url_for_deploy(url, allow_localhost=allow_ha_localhost())


def _decrypted_connection_token(session: Session, cipher: CredentialCipher) -> str | None:
    """活跃连接记录里的**加密**令牌；无记录 / 解不开返回 ``None``。

    解不开时返回 ``None`` 而不是抛异常：启动期不能因为一个坏令牌就整个起不来，
    调用方会退回环境变量的引导值。
    """
    try:
        encrypted = session.scalars(
            select(HAConnection.encrypted_access_token)
            .where(HAConnection.is_active.is_(True))
            .limit(1)
        ).first()
    except Exception:
        return None
    if not encrypted:
        return None
    try:
        return cipher.decrypt(encrypted)
    except CredentialCipherError:
        logger.warning("HA 连接记录的加密令牌无法解密，回退到环境变量中的令牌")
        return None


def load_ha_endpoints(session: Session, *, cipher: CredentialCipher | None = None) -> HaEndpoints:
    """解析当前生效的 HA 地址与令牌。

    唯一配置源是 ``ha_connections`` 的活跃记录；环境变量只在「还没有任何连接记录」时
    充当部署期引导。这样设置页保存一次之后，后端各处读到的一定是同一份地址。
    """
    ha_url_primary = os.getenv("HA_URL", "").strip()
    ha_url_fallback = os.getenv("HA_URL_FALLBACK", "").strip()
    token = os.getenv("HA_TOKEN", "").strip()
    try:
        connection = session.scalars(
            select(HAConnection).where(HAConnection.is_active.is_(True)).limit(1)
        ).first()
    except Exception:
        connection = None
    if connection is not None:
        ha_url_primary = connection.base_url or ""
        ha_url_fallback = connection.external_base_url or ""
    # keep_crypto：连接记录里的 Fernet 加密令牌优先于环境变量明文 token。
    if cipher is not None:
        decrypted = _decrypted_connection_token(session, cipher)
        if decrypted:
            token = decrypted
    primary = normalize_ha_url(ha_url_primary)
    fallback = normalize_ha_url(ha_url_fallback)
    if fallback and fallback == primary:
        fallback = ""
    return HaEndpoints(ha_url_primary=primary, ha_url_fallback=fallback, token=token)


def load_active_ha_endpoints(session: Session, *, cipher: CredentialCipher | None = None) -> HaEndpoints:
    """在 :func:`load_ha_endpoints` 之上，把地址换成「连接器当前正在使用的那一侧」。

    连接记录给的是静态的「内网优先」配置，而 3D 连接器每次探测后会把结果写回
    ``ha_connections.active_endpoint``。语音 Assist、摄像头 WebRTC WS、安防事件
    读取这些旁路消费者原来一律取 ``ha_url_primary``（内网），一旦内网不可达、连接器已经
    切到外网，它们就会全部连不上 —— 而它们并不属于连接器，无法复用连接器的 ``client_for``。

    这里统一以连接记录为准：连接器在用哪一侧，就把哪一侧当作 ``ha_url_primary``，另一侧
    留作 ``ha_url_fallback``。没有连接记录（或记录里没有可用地址）时保持原行为。
    令牌仍沿用 :func:`load_ha_endpoints` 的解析结果，避免这里再引入一条解密路径。
    """
    endpoints = load_ha_endpoints(session, cipher=cipher)
    try:
        connection = session.scalars(
            select(HAConnection).where(HAConnection.is_active.is_(True)).limit(1)
        ).first()
    except Exception:
        return endpoints
    if connection is None:
        return endpoints
    internal = normalize_ha_url(connection.base_url or '')
    external = normalize_ha_url(connection.external_base_url or '')
    use_external = str(connection.active_endpoint or '') == ENDPOINT_EXTERNAL and bool(external)
    primary = external if use_external else (internal or external)
    if not primary:
        return endpoints
    fallback = internal if primary == external else external
    if fallback == primary:
        fallback = ''
    return HaEndpoints(ha_url_primary=primary, ha_url_fallback=fallback, token=endpoints.token)
