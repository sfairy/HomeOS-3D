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
    "verify_password_or_dummy",
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
    except (InvalidHashError, VerificationError):  # fmt: skip
        return False


#: 固定哨兵哈希：账号不存在 / 已停用时也跑一次同等成本的校验。
#:
#: 登录原先对不存在的账号直接短路返回，真实账号则要跑 argon2id（约 64 MiB / 3 轮）——
#: 响应时间可被用来判断「这个用户名/邮箱在本机是否存在」，而本机只有一个管理员账号。
#: 惰性生成：模块导入时算一次 argon2 会拖慢每个导入方（含测试）。
_DUMMY_HASH: list[str] = []


def _dummy_hash() -> str:
    if not _DUMMY_HASH:
        _DUMMY_HASH.append(password_hasher.hash("homeos-dummy-password-for-constant-time-login"))
    return _DUMMY_HASH[0]


def verify_password_or_dummy(password: str, hashed: str | None) -> bool:
    """始终付出一次 argon2 成本的校验（供登录用）。

    返回值语义与 :func:`verify_password` 相同；差别只在于「哈希不可用」时也会
    对哨兵哈希跑一次完整校验，抹平响应时间差。
    """
    if not hashed or not hashed.startswith("$argon2"):
        verify_password(password, _dummy_hash())
        return False
    return verify_password(password, hashed)
