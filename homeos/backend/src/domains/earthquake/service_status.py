"""地震服务状态 / 诊断 mixin（从 ``service.py`` 拆出，控制单文件体积）。"""

from __future__ import annotations

import time
from typing import Any


def _now_ms() -> float:
    return time.time() * 1000


def compute_usgs_backup_gate(
    *,
    wolfx_connected: bool,
    disconnected_since: float,
    down_for_ms: int,
) -> tuple[bool, float]:
    """判断是否启用 USGS 兜底；返回 ``(use_backup, disconnected_since)``。"""
    if wolfx_connected:
        return False, 0.0
    since = disconnected_since or _now_ms()
    return _now_ms() - since >= down_for_ms, since


def sync_diagnostics_connection(
    *,
    wolfx_connected: bool,
    coords_ok: bool,
    disconnected_since: float,
) -> tuple[bool, float]:
    """结合坐标可用性校正 Wolfx「在线」观感，并维护断开计时。"""
    # 无坐标时即便套接字仍开着，也不得对外宣称源「活跃 / 在线」——预警路径会全 skip。
    effective = wolfx_connected and coords_ok
    if effective:
        return True, 0.0
    return False, disconnected_since or _now_ms()


def build_cluster_connection_status(
    local: dict[str, Any],
    leader: dict[str, Any],
    *,
    coords_ok: bool,
) -> dict[str, Any]:
    """合并本机连接与 Leader 信息；无家庭坐标时对外标为 misconfigured。"""
    if not coords_ok:
        # 无坐标 = 配置未就绪：对外一律 offline / misconfigured，避免 UI 显示「在线可预警」。
        return {
            **local,
            "connected": False,
            "state": "misconfigured",
            "readyState": 3,
            "isLeader": bool(leader.get("isLeader")),
            "mode": leader.get("mode"),
            "clusterConnected": False,
            "misconfigured": True,
            "reason": "missing_home_coordinates",
        }
    return {
        **local,
        "isLeader": bool(leader.get("isLeader")),
        "mode": leader.get("mode"),
        "clusterConnected": bool(local.get("connected")),
        "misconfigured": False,
    }


def build_diagnostics_source_flags(
    *,
    wolfx_connected: bool,
    sources_active: bool,
    usgs_active: bool,
) -> dict[str, Any]:
    """诊断快照里各 EEW 源是否「活跃」的对外字段。"""
    return {
        "wolfxConnected": wolfx_connected,
        "scActive": sources_active,
        "cencActive": sources_active,
        "usgsActive": usgs_active,
    }


class EarthquakeStatusMixin:
    """状态 / 诊断方法：挂到 ``EarthquakeService``，对外 API 不变。"""

    def should_use_usgs_backup(self, down_for_ms: int) -> bool:
        use, since = compute_usgs_backup_gate(
            wolfx_connected=self._wolfx.is_connected(),
            disconnected_since=self._wolfx_disconnected_since,
            down_for_ms=down_for_ms,
        )
        self._wolfx_disconnected_since = since
        return use

    def get_diagnostics_snapshot(self) -> dict[str, Any]:
        coords_ok = self.has_home_coordinates()
        wolfx_connected, self._wolfx_disconnected_since = sync_diagnostics_connection(
            wolfx_connected=self._wolfx.is_connected(),
            coords_ok=coords_ok,
            disconnected_since=self._wolfx_disconnected_since,
        )
        self._diagnostics.sync_wolfx_from_connection(self._wolfx.get_connection_status())
        is_leader = bool(self._leader is not None and self._leader.is_eew_leader())
        sources_active = self._runtime.enabled and is_leader and coords_ok
        return self._diagnostics.snapshot(
            build_diagnostics_source_flags(
                wolfx_connected=wolfx_connected,
                sources_active=sources_active,
                usgs_active=sources_active and self.should_use_usgs_backup(60_000),
            )
        )

    def get_active_event_id(self) -> str:
        return self._active_event_id

    def is_connected(self) -> bool:
        return self._wolfx.is_connected()

    def get_connection_status(self) -> dict[str, Any]:
        return self._wolfx.get_connection_status()

    def get_leader_status(self) -> dict[str, Any]:
        if self._leader is None:
            return {"isLeader": False, "mode": "standalone"}
        return self._leader.get_status()

    async def get_cluster_connection_status(self) -> dict[str, Any]:
        return build_cluster_connection_status(
            self.get_connection_status(),
            self.get_leader_status(),
            coords_ok=self.has_home_coordinates(),
        )


__all__ = [
    "EarthquakeStatusMixin",
    "build_cluster_connection_status",
    "build_diagnostics_source_flags",
    "compute_usgs_backup_gate",
    "sync_diagnostics_connection",
]
