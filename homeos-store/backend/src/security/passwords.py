"""口令哈希：PBKDF2-HMAC-SHA256（商店侧）。

口令**策略**（长度上下界、字母/数字判据、提示文案）的真源在
``homeos_shared.password_policy``，与主应用共用同一份；本模块只负责「哈希与校验」，
并继续转发策略符号，让调用点可以只 import 一个模块。

与 ``core.ids`` 的分工：那里是纯随机数/哈希工具（无策略），这里是唯一需要密钥与
迭代次数的口令路径。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from homeos_shared.password_policy import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_MESSAGE,
    is_password_policy_compliant,
)

__all__ = [
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "PASSWORD_POLICY_MESSAGE",
    "PBKDF2_ITERATIONS",
    "hash_password",
    "is_password_policy_compliant",
    "needs_rehash",
    "verify_password",
]

PBKDF2_ITERATIONS = 600_000
PBKDF2_ALGORITHM = "sha256"

#: 校验时允许的最大迭代次数。库里的迭代次数来自 ``password_hash`` 列（服务端写入、不可由
#: 请求控制），但损坏或被人为塞入的超大值会让**每一次**登录都变成一个 CPU 热点 ——
#: 在单进程 SQLite 部署上等于一个自伤的 DoS。超过上限一律判为无效哈希（fail-closed）。
PBKDF2_MAX_ITERATIONS = 4_000_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(PBKDF2_ALGORITHM, password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "$".join(
        (
            "pbkdf2",
            PBKDF2_ALGORITHM,
            str(PBKDF2_ITERATIONS),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )
    )


def needs_rehash(encoded: str | None) -> bool:
    """该口令哈希是否需要用当前参数重新计算。

    升级 ``PBKDF2_ITERATIONS`` 只对新口令生效；存量账号的哈希还停在旧迭代次数上，
    必须等用户下次**成功登录**（手里有明文口令的那一刻）才有机会就地升级。
    这也是这里返回布尔而不是直接改写的原因：本函数不认识数据库。
    """
    if not encoded:
        return False
    parts = encoded.split("$")
    if len(parts) != 5:
        return True
    scheme, algorithm, iterations, _salt, _digest = parts
    if scheme != "pbkdf2" or algorithm != PBKDF2_ALGORITHM:
        return True
    # 迭代次数必须是纯数字：``int()`` 的异常在这里没有信息量，用 ``isdigit`` 提前判掉，
    # 顺带拒绝 ``+240000`` / `` 240000`` 这类「能转但不该接受」的写法。
    if not iterations.isdigit():
        return True
    return int(iterations) < PBKDF2_ITERATIONS


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        scheme, algorithm, iterations, salt_b64, digest_b64 = encoded.split("$")
        if scheme != "pbkdf2":
            return False
        rounds = int(iterations)
        if rounds <= 0 or rounds > PBKDF2_MAX_ITERATIONS:
            return False
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            algorithm,
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            rounds,
        )
    except (ValueError, TypeError):  # fmt: skip
        return False
    return hmac.compare_digest(actual, expected)
