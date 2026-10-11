"""客户端电量上报与充电器开关滞回联动（对齐 Nest ``ClientPowerModule``）。"""

from __future__ import annotations

from .linkage import evaluate_self_charge_actions
from .normalize import normalize_client_system_report, normalize_level
from .service import ClientPowerService
from .types import (
    CLIENT_POWER_RUNTIME_CONFIG_ID,
    DEFAULT_CLIENT_POWER_SELF_CHARGE,
    ClientSystemState,
    PendingClientState,
    SwitchLinkageAction,
)

__all__ = [
    "CLIENT_POWER_RUNTIME_CONFIG_ID",
    "DEFAULT_CLIENT_POWER_SELF_CHARGE",
    "ClientPowerService",
    "ClientSystemState",
    "PendingClientState",
    "SwitchLinkageAction",
    "evaluate_self_charge_actions",
    "normalize_client_system_report",
    "normalize_level",
]
