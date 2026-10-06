"""HA 动态配置解析与主备故障转移（对齐 HaConfigService）。

读取顺序：激活 profile 的 ``layout.haConfig``（DB 优先）→ 环境变量 ``HA_URL`` /
``HA_URL_FALLBACK`` / ``HA_TOKEN`` 回退。

故障转移（对齐 Nest ``HaConfigService``）：局域网优先，连续建连失败 ``FAIL_BEFORE_FAILOVER``
次后切外网；使用外网期间每 ``PRIMARY_PROBE_EVERY`` 次重连探测一次局域网以便切回。
REST / WS 共用同一 :class:`HaEndpointSelector`，确保始终打到当前 active 地址。
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.app_config import load_raw_config
from ..core.models import HAConnection, ProjectConfig
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


def _read_json_object(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def load_ha_endpoints(session: Session) -> HaEndpoints:
    ha_url_primary = os.getenv("HA_URL", "").strip()
    ha_url_fallback = os.getenv("HA_URL_FALLBACK", "").strip()
    token = os.getenv("HA_TOKEN", "").strip()
    try:
        config = load_raw_config(session)
        profiles = config.get("profiles") if isinstance(config.get("profiles"), dict) else {}
        active_profile_id = str(profiles.get("activeProfileId") or "").strip() or "default"
        record = session.execute(
            select(ProjectConfig).where(ProjectConfig.project_id == active_profile_id)
        ).scalar_one_or_none()
        if record is not None and record.layout:
            layout = _read_json_object(record.layout)
            ha_config = layout.get("haConfig") if isinstance(layout.get("haConfig"), dict) else {}
            if ha_config.get("url") and ha_config.get("token"):
                ha_url_primary = str(ha_config["url"])
                ha_url_fallback = str(ha_config.get("fallbackUrl") or "")
                token = str(ha_config["token"])
    except Exception:  # noqa: BLE001 - 配置读取失败回退 env
        pass
    primary = normalize_ha_url(ha_url_primary)
    fallback = normalize_ha_url(ha_url_fallback)
    if fallback and fallback == primary:
        fallback = ""
    return HaEndpoints(ha_url_primary=primary, ha_url_fallback=fallback, token=token)


def load_active_ha_endpoints(session: Session) -> HaEndpoints:
    """在 :func:`load_ha_endpoints` 之上，把地址换成「连接器当前正在使用的那一侧」。

    ``layout.haConfig`` / 环境变量给的是静态的「内网优先」配置，而 3D 连接器每次探测后会把
    结果写回 ``ha_connections.active_endpoint``。语音 Assist、摄像头 WebRTC WS、安防事件
    读取这些旁路消费者原来一律取 ``ha_url_primary``（内网），一旦内网不可达、连接器已经
    切到外网，它们就会全部连不上 —— 而它们并不属于连接器，无法复用连接器的 ``client_for``。

    这里统一以连接记录为准：连接器在用哪一侧，就把哪一侧当作 ``ha_url_primary``，另一侧
    留作 ``ha_url_fallback``。没有连接记录（或记录里没有可用地址）时保持原行为。
    令牌仍沿用 :func:`load_ha_endpoints` 的解析结果，避免这里再引入一条解密路径。
    """
    endpoints = load_ha_endpoints(session)
    try:
        connection = session.scalars(
            select(HAConnection).where(HAConnection.is_active.is_(True)).limit(1)
        ).first()
    except Exception:  # noqa: BLE001 - 读不到连接记录时退回静态配置
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


class HaEndpointSelector:
    """HA 主/备地址选择器（故障转移），对齐 Nest ``HaConfigService``。

    - 局域网（primary）优先；连续建连失败 ``FAIL_BEFORE_FAILOVER`` 次后切外网（fallback）；
    - 使用外网期间，每 ``PRIMARY_PROBE_EVERY`` 次重连探测一次局域网以便切回；
    - 建连成功后若命中局域网则退出 failover；
    - :meth:`resolve` 返回「把落地地址填到 ``ha_url_primary``」的副本，REST / WS 共用，
      因此所有既有 ``endpoints.ha_url_primary`` 调用点自动跟随当前 active 地址。
    """

    #: 局域网连续失败多少次后切到外网（对齐 Nest FAIL_BEFORE_FAILOVER）
    FAIL_BEFORE_FAILOVER = 2
    #: 使用外网期间，每隔多少次重连尝试探测一次局域网（对齐 Nest PRIMARY_PROBE_EVERY）
    PRIMARY_PROBE_EVERY = 5
    #: 端点缓存时长（毫秒），对齐 Nest CONFIG_CACHE_MS
    CONFIG_CACHE_MS = 5_000

    def __init__(self, loader: Callable[[], HaEndpoints]) -> None:
        self._loader = loader
        self._lock = threading.Lock()
        self._cached: HaEndpoints | None = None
        self._cached_at = 0.0
        #: 最近一次解析出的端点（invalidate 不清，供比对与失败判定）
        self._last_loaded: HaEndpoints | None = None
        self._prefer_fallback = False
        self._fail_streak = 0

    # ------------------------------------------------------------------ #
    # 选择
    # ------------------------------------------------------------------ #
    def resolve(self, *, reconnect_attempt: int | None = None) -> HaEndpoints:
        """返回当前应使用的端点（``ha_url_primary`` 已按要求的主/备选择填好）。"""
        endpoints = self._load_cached()
        probe_primary = (
            self._prefer_fallback
            and bool(endpoints.ha_url_fallback)
            and bool(endpoints.ha_url_primary)
            and isinstance(reconnect_attempt, int)
            and reconnect_attempt > 0
            and reconnect_attempt % self.PRIMARY_PROBE_EVERY == 0
        )
        use_fallback = (not probe_primary) and self._prefer_fallback and bool(endpoints.ha_url_fallback)
        if not use_fallback:
            return endpoints
        return replace(endpoints, ha_url_primary=endpoints.ha_url_fallback)

    @property
    def active_source(self) -> str:
        """当前选用来源：``"primary"``（局域网）或 ``"fallback"``（外网）。"""
        return "fallback" if self._prefer_fallback else "primary"

    def has_fallback(self) -> bool:
        endpoints = self._last_loaded
        return bool(endpoints and endpoints.ha_url_fallback)

    def is_expected_lan_failover(self) -> bool:
        """局域网失败且已配置外网 → 属预期切换，日志降级为普通级别。"""
        return self.active_source != "fallback" and self.has_fallback()

    # ------------------------------------------------------------------ #
    # 事件回调
    # ------------------------------------------------------------------ #
    def notify_connect_failure(self) -> None:
        """建连失败：累计失败次数，达到阈值后切外网（对齐 Nest notifyConnectFailure）。"""
        with self._lock:
            self._fail_streak += 1
            if self._prefer_fallback:
                return
            endpoints = self._last_loaded
            if endpoints is None:
                endpoints = self._load_cached()
            if endpoints.ha_url_fallback and self._fail_streak >= self.FAIL_BEFORE_FAILOVER:
                self._prefer_fallback = True
                logger.warning(
                    "局域网HA连续失败%s次,切换到外网地址:%s",
                    self._fail_streak,
                    endpoints.ha_url_fallback,
                )

    def notify_connect_success(self, connected_url: str) -> None:
        """建连成功：清零失败计数；若回到局域网则退出 failover（对齐 Nest notifyConnectSuccess）。"""
        with self._lock:
            self._fail_streak = 0
        normalized = (connected_url or "").rstrip("/")
        endpoints = self._last_loaded
        if not normalized or endpoints is None or not endpoints.ha_url_primary:
            return
        if normalized != endpoints.ha_url_primary:
            return
        if self._prefer_fallback:
            self._prefer_fallback = False
            logger.info("局域网HA已恢复,切回优先地址:%s", endpoints.ha_url_primary)

    # ------------------------------------------------------------------ #
    # 缓存 / 复位
    # ------------------------------------------------------------------ #
    def _load_cached(self) -> HaEndpoints:
        now = time.monotonic()
        cached = self._cached
        if cached is not None and (now - self._cached_at) * 1000 < self.CONFIG_CACHE_MS:
            return cached
        resolved = self._loader()
        self._cached = resolved
        self._cached_at = now
        self._last_loaded = resolved
        return resolved

    def loaded_snapshot(self) -> HaEndpoints | None:
        """最近一次已解析的端点（未加载过则为 ``None``）。"""
        return self._last_loaded

    def invalidate_cache(self) -> None:
        """仅失效端点缓存。不断开当前外网会话、不重置 failover。"""
        self._cached = None

    def reset_failover(self) -> None:
        """HA 地址/令牌确实变更后：从局域网重新试起。"""
        with self._lock:
            self._prefer_fallback = False
            self._fail_streak = 0
