"""认证安全分区（``auth``）的只读访问器。

分区结构与缺省值的真源在 ``domains/app_config``（写侧：``defaults.py`` 造默认值、
``validate.py`` 校验范围）；这里只负责**把它读回成强类型对象**，供安全层使用。

为什么放在 ``platform/security`` 而不是 ``platform/core``
------------------------------------------------------
``AuthConfig`` 是**安全语义**（锁定策略、会话有效期、登录告警），不是通用配置原语。
此前它与「读/写 SystemConfig 单例」这类纯基础设施函数同处 ``platform/core/app_config.py``，
于是安全层反而要通过 core 的中转去拿自己的配置。现在方向是正的：通用访问器（
``load_raw_config`` / ``write_raw_config_section`` / ``merge_raw_config_section``）留 core，
安全语义随安全层下沉。

现状说明（读侧尚无消费者）
------------------------
``get_auth_config`` 目前**没有调用方**：后台可以写 ``auth`` 分区（
``domains/app_config`` 的默认值与校验都在），但登录锁定次数 / 会话有效期 / 登录告警
尚未在鉴权链路上生效（会话有效期当前取 ``settings.session_max_age_seconds``）。
保留本模块而不是删掉，是因为「写得到、读不回」这个缺口要修时必须有个确定的落点；
接线时**从这里取**，不要再在调用点重抄一遍 ``5 / 15 / 30``。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..core.app_config import load_raw_config
from ..core.json_field import object_field

#: ``auth`` 分区的缺省值 —— 与 ``@homeos/shared`` 的 ``DEFAULT_AUTH_SECURITY`` 完全一致。
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


def get_auth_config(session: Session) -> AuthConfig:
    """读取 ``auth`` 分区（缺字段回落缺省值），归一成 ``AuthConfig``。"""
    raw = load_raw_config(session)
    auth = object_field(raw, "auth")
    merged = {**DEFAULT_AUTH_CONFIG, **auth}
    return AuthConfig(
        lockout_max_attempts=int(merged["lockoutMaxAttempts"]),
        lockout_minutes=int(merged["lockoutMinutes"]),
        session_expire_days=int(merged["sessionExpireDays"]),
        login_alert_enabled=bool(merged["loginAlertEnabled"]),
        new_device_alert_cooldown_min=int(merged["newDeviceAlertCooldownMin"]),
        brute_force_alert_enabled=bool(merged["bruteForceAlertEnabled"]),
    )


__all__ = ["DEFAULT_AUTH_CONFIG", "AuthConfig", "get_auth_config"]
