"""AppConfig 只读访问器（SystemConfig 单例）。

完整的分区校验/写入属 Phase 5；此处仅提供 auth 分区读取，供认证链路取
``lockoutMaxAttempts`` / ``lockoutMinutes`` / ``sessionExpireDays``，
缺省值与 ``@homeos/shared`` 的 ``DEFAULT_AUTH_SECURITY`` 完全一致。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from .models import SystemConfig

DEFAULT_AUTH_CONFIG: dict[str, Any] = {
    "lockoutMaxAttempts": 5,
    "lockoutMinutes": 15,
    "sessionExpireDays": 30,
    "loginAlertEnabled": True,
    "newDeviceAlertCooldownMin": 1440,
    "bruteForceAlertEnabled": True,
}


@dataclass(frozen=True)
class AuthConfig:
    lockout_max_attempts: int
    lockout_minutes: int
    session_expire_days: int
    login_alert_enabled: bool
    new_device_alert_cooldown_min: int
    brute_force_alert_enabled: bool


def load_raw_config(session: Session) -> dict[str, Any]:
    row = session.get(SystemConfig, "default")
    if row is None or not row.data:
        return {}
    try:
        data = json.loads(row.data)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_raw_config_section(session_factory, section: str, value: dict[str, Any]) -> None:
    """写入（合并）SystemConfig 单例中的指定分区，供子模块持久化自身配置。"""
    with session_factory() as session:
        row = session.get(SystemConfig, "default")
        if row is None:
            row = SystemConfig(id="default", data="{}")
            session.add(row)
        raw = load_raw_config(session)
        raw[section] = value
        row.data = json.dumps(raw, ensure_ascii=False)
        session.commit()


def merge_raw_config_section(session_factory, section: str, partial: dict[str, Any]) -> None:
    """按字段合并（而非整体替换）SystemConfig 指定分区，供增量更新使用。"""
    with session_factory() as session:
        raw = load_raw_config(session)
    current = raw.get(section) if isinstance(raw.get(section), dict) else {}
    write_raw_config_section(session_factory, section, {**current, **partial})


def get_auth_config(session: Session) -> AuthConfig:
    raw = load_raw_config(session)
    auth = raw.get("auth") if isinstance(raw.get("auth"), dict) else {}
    merged = {**DEFAULT_AUTH_CONFIG, **auth}
    return AuthConfig(
        lockout_max_attempts=int(merged["lockoutMaxAttempts"]),
        lockout_minutes=int(merged["lockoutMinutes"]),
        session_expire_days=int(merged["sessionExpireDays"]),
        login_alert_enabled=bool(merged["loginAlertEnabled"]),
        new_device_alert_cooldown_min=int(merged["newDeviceAlertCooldownMin"]),
        brute_force_alert_enabled=bool(merged["bruteForceAlertEnabled"]),
    )
