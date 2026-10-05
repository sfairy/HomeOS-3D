"""密码哈希与强度策略（bcryptjs `$2b$` 互通）。

Phase 0 已验证：``bcryptjs`` 生成的 ``$2a$`` 哈希可被 Python ``bcrypt`` 验证，
Python ``$2b$`` 哈希也可被 ``bcryptjs`` 验证，因此既有用户密码无需重置。
"""

from __future__ import annotations

import bcrypt

from ..core.errors import bad_request

#: 用户不存在时用于 dummy 比较的预生成哈希，抵御用户名枚举时序侧信道。
DUMMY_HASH = "$2b$10$GFL.8CarZJXuw3Y/ET6tdeDLd6RNRvtr97RgsTNv4oteETp9w4Laq"

BCRYPT_ROUNDS = 10

#: 密码策略提示文案（与 Nest cookie-cors.util 完全一致）。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def is_password_policy_compliant(password: str) -> bool:
    if not password or len(password) < 8 or len(password) > 128:
        return False
    return any(ch.isalpha() and ch.isascii() for ch in password) and any(
        ch.isdigit() for ch in password
    )


def assert_password_policy(password: str) -> None:
    if not is_password_policy_compliant(password):
        bad_request(PASSWORD_POLICY_MESSAGE)
