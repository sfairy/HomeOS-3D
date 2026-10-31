"""密码哈希与强度策略。

口令哈希统一为 **argon2id**（``argon2-cffi`` 默认参数：time_cost=3 /
memory_cost=65536 / parallelism=4）。

**口令强度判据不在这里**：真源是 ``homeos_shared.password_policy``（与 ``homeos-store``
共用同一份），本模块只做转发，让调用点继续 ``from .passwords import
is_password_policy_compliant``。
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from homeos_shared.password_policy import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_MESSAGE,
    is_password_policy_compliant,
)

__all__ = [
    "EXTERNAL_PASSWORD_SENTINEL",
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "PASSWORD_POLICY_MESSAGE",
    "hash_password",
    "is_credentialless",
    "is_password_policy_compliant",
    "password_hasher",
    "verify_password",
]

#: 主哈希器（argon2id，库默认参数）。
password_hasher = PasswordHasher()

#: 「无本地凭据」哨兵口令：备份导入的账号用它占位（凭据留在导出的那台机器上）。
EXTERNAL_PASSWORD_SENTINEL = "!no-local-credential-v1!"


def is_credentialless(hashed: str | None) -> bool:
    """该口令哈希是否为「无本地凭据」哨兵。

    拿哨兵当口令的行**永远无法登录**（与传入什么口令无关）。首装注册据此允许就地接管，
    避免这类行把注册永久挡在 409 之外。
    """
    return (hashed or "") == EXTERNAL_PASSWORD_SENTINEL


def hash_password(password: str) -> str:
    """生成 argon2id 哈希（新密码一律走这里）。"""
    return password_hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """校验口令（argon2id）。"""
    if not hashed or not hashed.startswith("$argon2"):
        return False
    try:
        return password_hasher.verify(hashed, password)
    except (InvalidHashError, VerificationError):
        return False
