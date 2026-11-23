"""授权状态视图的纯逻辑：有效状态推算、租约字段投影、脱敏。

从 ``service.py`` 抽出（那个类有 74 个方法、1683 行）。抽出的判定全部是**无副作用**的
纯函数，判定口径如下：

- ``decide_effective_status`` —— 时钟回拨 / 租约到期 / 启动待验证三条降级路径；
- ``downgrade_if_unverified`` —— 本地签名校验失败时降到 INVALID（不得覆盖终端态）；
- ``lease_features_and_products`` —— 能力码与可见商品的来源优先级（签名租约 > 本地缓存）；
- ``mask_email`` / ``signed_timestamp`` —— 状态面板的展示与时间解析。


顺序是行为的一部分：先判时钟与到期，再判启动待验证，最后才看本地校验结果。任何重排都
会让用户看到错误的解释（例如把「到期」显示成「签名无效」），所以这里不做「顺手合并」。
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from .crypto import LicenseCryptoError, parse_timestamp

logger = logging.getLogger("homeos.license.service")

#: 不可被 INVALID 覆盖的终端态：吊销 / 停用 / 到期这类结论要原样展示给用户。
TERMINAL_STATES = frozenset(
    {
        "INVALID",
        "REVOKED",
        "DEACTIVATED",
        "CLOCK_ROLLBACK",
        "REMOTE_REJECTED",
        "INSTANCE_CHANGED",
        "INSTANCE_MISMATCH",
        "RECOVERY_REQUIRED",
    }
)

#: 这些状态下「本地校验失败」才是关键结论（其余终端态本身就是结论）。
_UNVERIFIED_OVERRIDABLE = frozenset({"ACTIVE", "CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED"})


def aware(value: datetime | None) -> datetime | None:
    """把 naive datetime 视作 UTC（库里存的一律是 UTC，读出来会丢 tzinfo）。"""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def signed_timestamp(payload: dict, key: str) -> datetime | None:
    """读签名租约里的时间戳；缺失或格式异常时返回 ``None``（由调用方决定降级口径）。"""
    raw = payload.get(key)
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return aware(parse_timestamp(raw))
    except (LicenseCryptoError, TypeError, ValueError):  # fmt: skip
        # 租约时间戳坏了等于「没有可信时间锚点」：上层据此跳过时钟回拨判定，
        # 不能让它把整个状态接口打挂 —— 但要留痕，否则时钟问题永远查不出来。
        logger.warning("签名租约的 %s 时间戳无法解析，按缺失处理: %r", key, raw, exc_info=True)
        return None


def mask_email(email: str | None) -> str | None:
    """邮箱脱敏：``ab***@example.com``。状态面板要展示又不宜全明文。"""
    value = (email or "").strip()
    if not value or "@" not in value:
        return value or None
    local, _, domain = value.partition("@")
    masked_local = local[:1] + "***" if len(local) <= 2 else local[:2] + "***"
    return f"{masked_local}@{domain}"


def decide_effective_status(
    *,
    base_status: str,
    base_error: str | None,
    signed_lease: dict,
    now: datetime | None,
    skew_seconds: int,
    lease_expires: datetime | None,
    license_required: bool,
    startup_pending: bool,
) -> tuple[str, str | None]:
    """按「时钟 → 到期 → 启动待验证」的顺序推算面板状态（不改库、不打日志）。"""
    status = base_status
    error = base_error

    server_issued_at = signed_timestamp(signed_lease, "issuedAt")
    if now is not None and server_issued_at is not None:
        from datetime import timedelta

        if server_issued_at > now + timedelta(seconds=skew_seconds):
            return (
                "CLOCK_ROLLBACK",
                "授权服务器签发的租约时间晚于本机时间，请校准系统时间后重试。",
            )

    if (
        now is not None
        and lease_expires is not None
        and lease_expires <= now
        and status in {"ACTIVE", "CONNECTION_WARNING"}
    ):
        status = "LEASE_EXPIRED"
        if not error:
            error = "授权租约已到期。"

    if license_required and startup_pending and status in {"ACTIVE", "CONNECTION_WARNING"}:
        status = "STARTUP_VALIDATION_REQUIRED"
        error = error or "服务重启后正在等待授权后台确认最新租约。"

    return status, error


def downgrade_if_unverified(status: str, error: str | None, *, verified: bool) -> tuple[str, str | None]:
    """本地签名 / 会话校验失败时降到 INVALID；终端态原样保留。"""
    if verified or status not in _UNVERIFIED_OVERRIDABLE:
        return status, error
    return "INVALID", "本地授权签名或会话记录校验失败，请联系管理员检查。"


def lease_features_and_products(
    *,
    signed_lease: dict,
    cached_feature_set: str | None,
    allowed: bool,
) -> tuple[list, list[dict]]:
    """从签名租约（或本地缓存）取出 features 列表与可见商品。

    能力清单以**签名租约**为准（服务端签的 features/entitlements 不可被改），
    ``feature_set`` 只是本地缓存，租约不可读时才退回它。
    """
    lease_features = signed_lease.get("features")
    if not isinstance(lease_features, list):
        try:
            lease_features = json.loads(cached_feature_set or "[]")
        except json.JSONDecodeError:
            # 本地缓存坏了就当真没有能力：租约可读时上面已经用它了，这条只是最后兜底。
            logger.warning("本地 feature_set 缓存不是合法 JSON，按空能力处理", exc_info=True)
            lease_features = []

    visible_products: list[dict] = []
    raw_products = signed_lease.get("products")
    if isinstance(raw_products, list):
        for product_entry in raw_products:
            if not isinstance(product_entry, dict) or not isinstance(product_entry.get("name"), str):
                continue
            product_name = product_entry["name"].strip()
            if not product_name:
                continue
            product_type = product_entry.get("type") if isinstance(product_entry.get("type"), str) else "module"
            expires_at = product_entry.get("expiresAt") if isinstance(product_entry.get("expiresAt"), str) else None
            visible_products.append({"name": product_name, "type": product_type, "expiresAt": expires_at})
    if allowed and not visible_products:
        visible_products = [{"name": "基础版", "type": "base", "expiresAt": None}]
    return lease_features, visible_products


__all__ = [
    "TERMINAL_STATES",
    "aware",
    "decide_effective_status",
    "downgrade_if_unverified",
    "lease_features_and_products",
    "mask_email",
    "signed_timestamp",
]
