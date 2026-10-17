"""密码哈希与强度策略。

口令哈希统一为 **argon2id**（``argon2-cffi`` 默认参数：time_cost=3 /
memory_cost=65536 / parallelism=4）。
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

#: 主哈希器（argon2id，库默认参数）。
password_hasher = PasswordHasher()

#: 密码策略提示文案。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字"

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


def is_password_policy_compliant(password: str) -> bool:
    """口令是否满足统一策略：8–128 位，且同时包含 ASCII 字母与 ASCII 数字。

    ``homeos-store`` 的同名实现逐条对齐；数字也限定 ASCII，避免全角 / 阿拉伯-印度
    数字在后端通过、前端 ``[0-9]`` 不通过这种两端不一致。
    """
    if not password or len(password) < 8 or len(password) > 128:
        return False
    has_letter = any(ch.isalpha() and ch.isascii() for ch in password)
    has_digit = any(ch.isdigit() and ch.isascii() for ch in password)
    return has_letter and has_digit
