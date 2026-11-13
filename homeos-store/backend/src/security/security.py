"""``core`` 叶子实现的门面（保留既有导入路径，不再持有实现）。

拆分背景
--------
本模块此前同时装着四类职责：时间、标识/凭据、文本判据、口令哈希。后果是
``core.models`` / ``core.deps`` / ``core.schemas`` 都必须 import 它，于是 ``core`` 反过来
依赖 ``security``，两者构成包级强连通（``check_backend_deps`` 的 B4 白名单一度冻结了这个环）。

现在真实实现按职责落位：``core.clock`` / ``core.ids`` / ``core.text`` / ``security.passwords``。
本模块只做 re-export —— 调用点（``api``、``licensing``、``payments`` …）里既有的
``from ..security.security import utcnow`` 不必逐个改，行为逐字不变；**新代码**请直接
import 真正的模块，别再把这里当杂物间。
"""

from __future__ import annotations

from homeos_shared.password_policy import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_MESSAGE,
    is_password_policy_compliant,
)

from .passwords import (
    PBKDF2_ALGORITHM,
    PBKDF2_ITERATIONS,
    PBKDF2_MAX_ITERATIONS,
    hash_password,
    needs_rehash,
    verify_password,
)
from ..core.clock import iso, iso_micro, iso_z, naive_utc, utcnow
from ..core.ids import (
    activation_code_hint,
    code_hash,
    log_fingerprint,
    new_activation_code,
    new_code_salt,
    new_order_no,
    new_referral_code,
    new_token,
    new_uuid,
    new_verification_code,
    token_hash,
    token_matches,
)
from ..core.text import (
    REFERRAL_CODE_RE,
    is_valid_email,
    normalize_email,
    normalize_referral_code,
    normalize_username,
)

__all__ = [
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "PASSWORD_POLICY_MESSAGE",
    "PBKDF2_ALGORITHM",
    "PBKDF2_ITERATIONS",
    "PBKDF2_MAX_ITERATIONS",
    "REFERRAL_CODE_RE",
    "activation_code_hint",
    "code_hash",
    "hash_password",
    "is_password_policy_compliant",
    "is_valid_email",
    "iso",
    "iso_micro",
    "iso_z",
    "log_fingerprint",
    "naive_utc",
    "needs_rehash",
    "new_activation_code",
    "new_code_salt",
    "new_order_no",
    "new_referral_code",
    "new_token",
    "new_uuid",
    "new_verification_code",
    "normalize_email",
    "normalize_referral_code",
    "normalize_username",
    "token_hash",
    "token_matches",
    "utcnow",
    "verify_password",
]
