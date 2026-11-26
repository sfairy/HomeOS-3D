"""租约过期后的「只降级编辑类能力」判定（宽限期）。

## 为什么单独一层

产品定位是「本机中控」：家里断网 / 商店不可达导致租约过期时，把设备控制一起停掉会让
用户觉得整台设备坏了。这里实现「过期只降级改配置 / 改布局 / 管理账号，设备控制与实时
通道继续可用」，直到超出宽限窗口（默认 90 天）。

从 ``service.py`` 抽出来的原因：那里已经 1600+ 行，而这段判定
只需要 **设置 + 授权状态 + 租约验签** 三样东西，完全可以独立演进与自检。

判定只信任**签名租约**：签名有效、关联标识一致、过期时间在窗口内。禁用开关
（``LICENSE_EXPIRED_GRACE=false``）时恒返回 ``False``，恢复「过期立刻全站停用」。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from .crypto import LicenseCryptoError, parse_timestamp

logger = logging.getLogger("homeos.license.grace")


def grace_days(settings: Any) -> int:
    """宽限窗口天数：开关关闭或取值非法时为 0（= 不宽限）。"""
    if not getattr(settings, "license_expired_grace", False):
        return 0
    try:
        value = int(getattr(settings, "license_expired_grace_days", 0) or 0)
    except (TypeError, ValueError):  # fmt: skip
        logger.warning("LICENSE_EXPIRED_GRACE_DAYS 不是整数，按不宽限处理")
        return 0
    return max(0, value)


def evaluate(service: Any) -> bool:
    """租约是否处于「已过期但仍在宽限窗口内」（或尚未过期）。

    ``service`` 需要提供 ``settings`` / ``database`` / ``verifier`` / ``_state`` /
    ``_record_failure`` 五项（即 ``LicenseService`` 的本体）。用鸭子类型而不是 import
    具体类，避免 service ↔ grace 循环依赖。
    """
    settings = service.settings
    if not settings.license_required:
        return True
    days = grace_days(settings)
    if days <= 0:
        return False
    try:
        with service.database.session_factory() as session:
            state = service._state(session)
    except Exception:
        logger.warning("宽限期判定读取授权状态失败，按不可用处理", exc_info=True)
        return False
    if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
        return False
    try:
        body = service.verifier.verify(state.signed_lease, state.instance_id)
        issued_at = parse_timestamp(body["issuedAt"])
        expires_at = parse_timestamp(body["expiresAt"])
    except LicenseCryptoError as error:
        logger.warning("宽限期判定：本地租约验签失败（%s）", error)
        service._record_failure("本地校验", error, sensitive_values=(state.signed_lease,))
        return False
    now = datetime.now(UTC)
    if issued_at > now + timedelta(seconds=settings.license_clock_skew_seconds):
        return False
    if body["activationCodeId"] != state.license_id or body["leaseSequence"] != state.lease_sequence:
        return False
    if expires_at > now:
        # 没过期：正常路径（``allows``）会按能力码放行，这里不必重复授权。
        return True
    return (now - expires_at) <= timedelta(days=days)


__all__ = ["evaluate", "grace_days"]
