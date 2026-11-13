"""安防配置读取（对齐 ``appConfig.get('security')`` 与 ``get('frontend')`` / ``get('notification')``）。

Nest 的 ``AppConfigService.get(section)`` 会返回「默认值 + 已存配置」的合并结果；
本模块用同样的语义复刻 ``security`` / ``frontend`` / ``notification`` 三个分区，
并附带 ``parseOptionalInt``（对齐 ``common/crud/pagination.util``）。
"""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

# 分区默认值单点在 ``domains.app_config.defaults``（那里逐条对齐
# ``backend/src/shared/app-config/defaults.ts``）。本模块过去把 ``security`` /
# ``frontend`` / ``notification`` 三个分区**又抄了一遍字面量**，于是同一张表在仓库里
# 有两份：改 defaults.py 改不到这里，改这里又对不上导出给前端的快照。
from ..app_config.defaults import DEFAULT_APP_CONFIG
from ...platform.core.runtime.app_config import load_raw_config

# 通知拉取条数 clamp 与 ``domains.alerts.channels`` 共用同一实现（原为两份拷贝）。
# 转出（非本地定义）：列入 ``__all__`` 即视为有意重导出。
from ...platform.core.runtime.numbers import resolve_notification_fetch_limit

#: 安防分区默认值。
#:
#: 深拷贝而非直接引用：``DEFAULT_APP_CONFIG`` 是模块级单例，直接引用会把「每个模块各有一份
#: 独立字面量」变成「全仓共享同一个 dict / list」（``presencePersons`` / ``alertChannels``
#: 都是可变容器）。深拷贝把旧语义原样保住。
#:
#: ``manualArmLockSec``（手动布防/撤防后的人为锁定时长）只被安防联动读取，不在
#: ``DEFAULT_APP_CONFIG`` 里 —— 加进去会多出一个前端也要渲染的分区字段。
DEFAULT_SECURITY_CONFIG: dict[str, Any] = {
    **copy.deepcopy(DEFAULT_APP_CONFIG["security"]),
    "manualArmLockSec": 300,
}

#: 只声明安防侧真正读取的那一个键（完整 ``frontend`` 分区由 app_config 拥有）。
DEFAULT_FRONTEND_CONFIG: dict[str, Any] = {
    "maxRemoteNotifications": DEFAULT_APP_CONFIG["frontend"]["maxRemoteNotifications"],
}

#: 同上：只声明本模块 ``load_notification_config`` 用得到的键。
DEFAULT_NOTIFICATION_CONFIG: dict[str, Any] = {
    "maxNotifications": DEFAULT_APP_CONFIG["notification"]["maxNotifications"],
}

DEFAULT_SECURITY_EMERGENCY: dict[str, Any] = {
    "mode": "full_home",
    "appendBuiltin": False,
    "appendMode": "full_home",
    "lightBrightnessPct": 100,
    "lightPool": [],
    "autoArmAway": False,
    "actions": [],
    "useBuiltinFallback": True,
}


def _section(raw: dict[str, Any], name: str) -> dict[str, Any]:
    value = raw.get(name)
    return value if isinstance(value, dict) else {}


def load_security_config(session: Session) -> dict[str, Any]:
    """读取安防分区（默认值 + 已存覆盖）。"""
    raw = load_raw_config(session)
    return {**DEFAULT_SECURITY_CONFIG, **_section(raw, "security")}


def load_frontend_config(session: Session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_FRONTEND_CONFIG, **_section(raw, "frontend")}


def load_notification_config(session: Session) -> dict[str, Any]:
    raw = load_raw_config(session)
    return {**DEFAULT_NOTIFICATION_CONFIG, **_section(raw, "notification")}


def load_home_timezone(session: Session) -> str | None:
    raw = load_raw_config(session)
    tz = _section(raw, "ops").get("homeTimezone")
    return tz.strip() if isinstance(tz, str) and tz.strip() else None


def parse_optional_int(raw: Any, default: int | None = None) -> int | None:
    """对齐 ``parseOptionalInt``：缺失/非法返回 default，否则取整。"""
    if raw is None or raw == "":
        return default
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):  # fmt: skip  # 括号不能省：Cython 3.3.0 会把无括号形式解析成 `except A as B:`
        return default


__all__ = [
    "DEFAULT_FRONTEND_CONFIG",
    "DEFAULT_NOTIFICATION_CONFIG",
    "DEFAULT_SECURITY_CONFIG",
    "DEFAULT_SECURITY_EMERGENCY",
    "load_frontend_config",
    "load_home_timezone",
    "load_notification_config",
    "load_security_config",
    "parse_optional_int",
    "resolve_notification_fetch_limit",
]
