"""客户端系统信息与电量联动类型定义（对齐 ``client-power/types.ts``）。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: 持久化到 RuntimeKv 的运行时配置 ID
CLIENT_POWER_RUNTIME_CONFIG_ID = "client-power-runtime"

#: 共享包默认自充电阈值（对齐 ``@homeos/shared`` 的 DEFAULT_CLIENT_POWER_SELF_CHARGE）
DEFAULT_CLIENT_POWER_SELF_CHARGE: dict[str, Any] = {
    "enabled": False,
    "lowPercent": 20,
    "highPercent": 80,
    "touEnabled": False,
    "criticalPercent": 10,
}


@dataclass
class SwitchLinkageAction:
    """开关联动动作：由 linkage helper 计算后交给 service 执行。"""

    entity_id: str
    domain: str
    service: str
    reason: str
    cooldown_key: str


@dataclass
class ClientSystemState:
    """客户端运行时状态：归一化后的电量字段 + 在线/待配对等运行时标志。"""

    client_id: str
    system_info: dict[str, Any] | None = None
    level: float | None = None
    charging: bool | None = None
    charging_time: float | None = None
    discharging_time: float | None = None
    battery_supported: bool = False
    last_report_at: str = ""
    online: bool = False
    label: str | None = None
    pending: bool = False
    report_token_acknowledged: bool = False
    report_token_hash: str | None = None

    def to_public(self) -> dict[str, Any]:
        """对外快照结构（camelCase，对齐 Nest ``getStatusSnapshot``）。"""
        payload: dict[str, Any] = {
            "clientId": self.client_id,
            "systemInfo": self.system_info,
            "level": self.level,
            "charging": self.charging,
            "chargingTime": self.charging_time,
            "dischargingTime": self.discharging_time,
            "batterySupported": self.battery_supported,
            "lastReportAt": self.last_report_at,
            "online": self.online,
            "pending": self.pending,
        }
        if self.label is not None:
            payload["label"] = self.label
        if self.report_token_acknowledged:
            payload["reportTokenAcknowledged"] = True
        if self.report_token_hash is not None:
            payload["reportTokenHash"] = self.report_token_hash
        return payload

    def to_persist(self) -> dict[str, Any]:
        """持久化结构（不含 online，重启后重建）。"""
        return {
            "clientId": self.client_id,
            "systemInfo": self.system_info,
            "level": self.level,
            "charging": self.charging,
            "chargingTime": self.charging_time,
            "dischargingTime": self.discharging_time,
            "batterySupported": self.battery_supported,
            "lastReportAt": self.last_report_at,
            "label": self.label,
            "pending": self.pending,
            "reportTokenAcknowledged": self.report_token_acknowledged,
            "reportTokenHash": self.report_token_hash,
        }


@dataclass
class PendingClientState:
    """待配对终端的发现记录。"""

    client_id: str
    system_info: dict[str, Any] | None = None
    first_seen_at: str = ""
    last_report_at: str = ""

    def to_public(self) -> dict[str, Any]:
        return {
            "clientId": self.client_id,
            "systemInfo": self.system_info,
            "firstSeenAt": self.first_seen_at,
            "lastReportAt": self.last_report_at,
        }


@dataclass
class ClientPowerConfig:
    """clientPower 分区配置（已归一化）。"""

    enabled: bool = False
    report_interval_sec: int = 10
    stale_timeout_sec: int = 300
    cooldown_min: float = 5
    linkage_retry_count: int = 2
    linkage_retry_delay_ms: int = 5000
    clients: list[dict[str, Any]] = field(default_factory=list)


__all__ = [
    "CLIENT_POWER_RUNTIME_CONFIG_ID",
    "DEFAULT_CLIENT_POWER_SELF_CHARGE",
    "ClientPowerConfig",
    "ClientSystemState",
    "PendingClientState",
    "SwitchLinkageAction",
]
