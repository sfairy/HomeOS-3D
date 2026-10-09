"""系统域核心服务（对齐 ``modules/system/service.ts``）。

提供系统信息查询（版本号、健康状态、数据库体积）与跨端网络与远程访问信息
（内外网地址 / 公网 IPv4·IPv6 / 端口回退），供原生端漫游与登录下发。

与 Nest 的差异：数据库由 PostgreSQL 换成 SQLite，``dbSize`` 取 SQLite 数据文件
（含 ``-wal`` / ``-shm``）体积并按人类可读格式化。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import resource
import socket
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from ... import load_app_version
from ...core.process_memory import get_process_memory_health

logger = logging.getLogger("homeos.system")

#: 公网 IPv4 探针候选（按顺序尝试，全部失败返回 null）
PUBLIC_IPV4_PROBES = (
    "http://ip.3322.net",
    "http://ddns.oray.com/checkip",
    "http://members.3322.org/dyndns/getip",
    "https://api4.ipify.org?format=json",
)
#: 公网 IPv6 探针候选（按顺序尝试，全部失败返回 null）
PUBLIC_IPV6_PROBES = ("https://api6.ipify.org?format=json", "https://v6.ident.me")
#: 探针超时（毫秒）：设置页需要快速反馈，宁可返回 null 也不长时间挂起
PROBE_TIMEOUT_MS = 2500
#: 探针 User-Agent：部分 DDNS 检查服务会拒绝浏览器 UA，用 curl 的 UA 拿到裸 IP 文本
PROBE_USER_AGENT = "curl/8.7.1"

#: 进程启动近似时刻（模块导入时间；服务随应用工厂在启动早期导入）
_PROCESS_START_MONOTONIC = time.monotonic()


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class SystemService:
    """系统信息 / 健康 / 网络信息。"""

    def __init__(self, settings: Any, ui_config: Any) -> None:
        self._settings = settings
        self._ui_config = ui_config
        self._cached_version: str | None = None
        self.ensure_prisma_and_assets()
        self._cached_version = load_app_version()

    def ensure_prisma_and_assets(self) -> None:
        """确保 SQLite 数据目录存在（Nest 侧为 ``prisma/data``）。"""
        try:
            data_dir = Path(self._settings.data_dir)
            data_dir.mkdir(parents=True, exist_ok=True)
        except Exception as err:
            logger.warning("创建数据目录失败:%s", err)

    # ------------------------------------------------------------------ #
    # 版本 / 健康
    # ------------------------------------------------------------------ #
    async def get_system_info(self) -> dict[str, Any]:
        """获取系统版本信息（启动时缓存）。"""
        return {"version": self._cached_version or "unknown", "timestamp": _iso_now()}

    async def get_health(self) -> dict[str, Any]:
        mem_health = get_process_memory_health()
        uptime = max(0.0, time.monotonic() - _PROCESS_START_MONOTONIC)
        usage = resource.getrusage(resource.RUSAGE_SELF)
        cpu_seconds = float(usage.ru_utime) + float(usage.ru_stime)

        hours = int(uptime // 3600)
        minutes = int((uptime % 3600) // 60)
        uptime_str = f"{hours}h{minutes}m" if hours > 0 else f"{minutes}m"

        # 单核平均占用% = (user + system) / uptime / 1e4（Nest 同口径）
        cpu_pct = min(100, round(cpu_seconds / max(uptime, 1.0) * 100))
        db_size = self.get_db_size_label()

        return {
            "cpu": cpu_pct,
            "memory": mem_health["memory"],
            "memoryMb": mem_health["memoryMb"],
            "memoryLimitMb": mem_health["memoryLimitMb"],
            "rssMb": mem_health["rssMb"],
            "heapUsedMb": mem_health["heapUsedMb"],
            "heapTotalMb": mem_health["heapTotalMb"],
            "dbSize": db_size,
            "uptime": uptime_str,
            "version": self._cached_version or "unknown",
        }

    def get_db_size_label(self) -> str:
        """SQLite 数据文件体积（含 WAL/SHM），失败返回 ``--``。"""
        try:
            database_path: Path = Path(self._settings.database_path)
            total = 0
            found = False
            for suffix in ("", "-wal", "-shm"):
                candidate = Path(f"{database_path}{suffix}")
                if candidate.is_file():
                    total += candidate.stat().st_size
                    found = True
            if not found:
                return "--"
            return _format_size(total)
        except Exception as err:
            logger.debug("查询数据库大小失败: %s", err)
            return "--"

    # ------------------------------------------------------------------ #
    # 跨端网络与远程访问
    # ------------------------------------------------------------------ #
    async def get_external_url(self) -> str:
        """读取远程访问地址（layout.externalUrl）。

        容错：配置缺失 / 解析失败返回空串，绝不抛错（设置页需稳定返回）。
        """
        try:
            data = self._ui_config.get_config("default")
            layout, _ = self._ui_config.parse_layout_field(
                data.get("layout") if isinstance(data, dict) else None
            )
            url = layout.get("externalUrl") if isinstance(layout, dict) else None
            return "" if url is None else str(url).strip()
        except Exception as err:
            logger.warning("读取 externalUrl 失败: %s", err)
            return ""

    async def probe_public_ip(self, family: int) -> str | None:
        """探测公网 IP。按候选列表顺序尝试，任一成功即返回；全部失败返回 null。

        永不抛错，避免设置页因网络不可达而 5xx。IPv6 候选域名仅解析 AAAA，
        因此无需显式绑定协议族。
        """
        probes = PUBLIC_IPV6_PROBES if family == 6 else PUBLIC_IPV4_PROBES
        timeout = httpx.Timeout(PROBE_TIMEOUT_MS / 1000)
        async with httpx.AsyncClient(
            timeout=timeout, headers={"User-Agent": PROBE_USER_AGENT}
        ) as client:
            for url in probes:
                try:
                    response = await client.get(url)
                    ip = self.extract_ip(response.text, family)
                    if ip:
                        return ip
                except Exception as err:
                    logger.debug("公网 IPv%s 探针失败 %s: %s", family, url, err)
        return None

    @staticmethod
    def extract_ip(data: Any, family: int) -> str | None:
        """从探针响应体提取 IP（兼容纯文本 DDNS 检查服务与 JSON ipify / ident.me）。"""
        raw = ""
        if isinstance(data, str):
            raw = data.strip()
        elif isinstance(data, dict):
            raw = str(data.get("ip") or data.get("address") or data.get("query") or "").strip()
        if not raw:
            return None
        # 纯文本响应可能带 HTML 包装，抓第一个符合协议族的 token
        match = (
            re.search(r"[0-9a-fA-F:]{4,}", raw)
            if family == 6
            else re.search(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", raw)
        )
        if not match:
            return None
        ip = match.group(0)
        if family == 4 and not re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", ip):
            return None
        if family == 6 and ":" not in ip:
            return None
        return ip

    @staticmethod
    def get_local_ipv6() -> str | None:
        """读取本机原生 IPv6（网卡地址）。

        过滤回环、link-local（fe80::）与 ULA（fc00::/7，即 fc / fd 开头）地址。
        """
        try:
            for address in _collect_addresses(socket.AF_INET6):
                addr = str(address).split("%")[0].lower()
                if ":" not in addr:
                    continue
                if addr.startswith(("fe80:", "fc", "fd")):
                    continue
                if addr == "::1":
                    continue
                return addr
        except Exception as err:
            logger.warning("读取本机 IPv6 失败: %s", err)
        return None

    @staticmethod
    def get_local_ip() -> str:
        """读取本机内网 IPv4（优先 192.168.x / 10.x / 172.16-31.x 私有网段）。"""
        try:
            candidates = list(_collect_addresses(socket.AF_INET))
            if not candidates:
                return "127.0.0.1"
            private = re.compile(r"^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)")
            for candidate in candidates:
                if private.match(candidate):
                    return candidate
            return candidates[0] or "127.0.0.1"
        except Exception:
            return "127.0.0.1"

    def resolve_backend_port(self) -> int:
        """后端监听端口（PORT 环境变量，缺省 8801）。"""
        try:
            port = int(os.getenv("PORT") or 8801)
        except ValueError:
            return 8801
        return port if port > 0 else 8801

    def resolve_frontend_port(self, req: dict[str, Any] | None = None) -> int:
        """解析前端访问端口。

        生产环境下 SPA 由后端直接托管，不存在独立前端端口，按回退链推导：
        ``FRONTEND_PORT → APP_PROXY_PUBLISH_PORT / HTTPS_PORT →
        APP_PUBLISH_PORT / HTTP_PORT → 请求 Host 端口 → 后端端口``。
        宿主发布端口可能写成 ``127.0.0.1:8803``，只取末段数字。
        """
        for key in (
            "FRONTEND_PORT",
            "APP_PROXY_PUBLISH_PORT",
            "HTTPS_PORT",
            "APP_PUBLISH_PORT",
            "HTTP_PORT",
        ):
            raw = (os.getenv(key) or "").strip()
            if not raw:
                continue
            # 兼容 compose 宿主映射写法 host:port / 裸端口
            tail = raw.rsplit(":", 1)[-1]
            try:
                explicit = int(tail)
            except ValueError:
                explicit = 0
            if explicit > 0:
                return explicit
        headers = (req or {}).get("headers") if isinstance(req, dict) else None
        host = str((headers or {}).get("host") or "")
        tail = host.rsplit(":", 1)[1] if ":" in host else ""
        if tail.isdigit() and int(tail) > 0:
            return int(tail)
        return self.resolve_backend_port()

    async def get_network_info(self, req: dict[str, Any] | None = None) -> dict[str, Any]:
        """汇总跨端网络与远程访问信息。

        公网 IPv4 / IPv6 并行探测，各自失败即返回 null（接口永不 5xx）。
        """
        port = self.resolve_backend_port()
        frontend_port = self.resolve_frontend_port(req)
        local_ip = self.get_local_ip()
        local_ipv6 = self.get_local_ipv6()

        ipv4, ipv6 = await asyncio.gather(self.probe_public_ip(4), self.probe_public_ip(6))

        return {
            "port": port,
            "frontendPort": frontend_port,
            "backendPort": port,
            "localIp": local_ip,
            "internalUrl": f"http://{local_ip}:{frontend_port}",
            "externalUrl": await self.get_external_url(),
            "publicIpv4": ipv4,
            "publicIpv6": ipv6,
            "localIpv6": local_ipv6,
            "timestamp": _iso_now(),
        }


def _collect_addresses(family: int) -> list[str]:
    """收集本机非回环网卡地址（psutil 可用时优先，否则回退 getaddrinfo）。"""
    addresses: list[str] = []
    try:
        import psutil

        for _, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == family and not addr.address.startswith("127."):
                    addresses.append(str(addr.address))
        if addresses:
            return addresses
    except Exception:
        pass

    hostname = socket.gethostname()
    try:
        infos = socket.getaddrinfo(hostname, None, family)
    except OSError:
        return addresses
    for info in infos:
        raw = info[4][0]
        if raw and raw not in addresses and raw != "127.0.0.1" and raw != "::1":
            addresses.append(raw)
    return addresses


def _format_size(size_bytes: int) -> str:
    """人类可读体积（对齐 ``pg_size_pretty`` 的口径：B / kB / MB / GB）。"""
    if size_bytes < 1024:
        return f"{size_bytes} bytes"
    units = ("kB", "MB", "GB", "TB")
    value = float(size_bytes)
    for unit in units:
        value /= 1024
        if value < 1024 or unit == units[-1]:
            text = f"{value:.2f}".rstrip("0").rstrip(".")
            return f"{text} {unit}"
    return f"{size_bytes} bytes"


__all__ = [
    "PROBE_TIMEOUT_MS",
    "PROBE_USER_AGENT",
    "PUBLIC_IPV4_PROBES",
    "PUBLIC_IPV6_PROBES",
    "SystemService",
]
