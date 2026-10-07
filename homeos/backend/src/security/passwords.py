"""密码哈希与强度策略（argon2id 为主，迁移期兼容 bcrypt）。

并入 homeos-3d 授权服务后，口令哈希统一为 **argon2id**（``argon2-cffi`` 默认参数：
time_cost=3 / memory_cost=65536 / parallelism=4）。

存量 homeos 用户是 bcrypt（``$2a$/$2b$/$2y$``，且与既有 ``bcryptjs`` 互通）哈希，采取
**首登平滑迁移**：``verify_password`` 仍能校验 bcrypt，``needs_rehash`` 会把它标记为
待升级；调用方在登录成功后写回 argon2 哈希。用户无感，也无需一次性批量重置密码。

安全说明：``DUMMY_HASH`` / ``DUMMY_ARGON2_HASH`` 用于「用户不存在」时的等价耗时比较，
抵御用户名枚举时序侧信道。
"""

from __future__ import annotations

import bcrypt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from ..core.errors import bad_request

#: 主哈希器（argon2id，库默认参数）。
password_hasher = PasswordHasher()

#: 用户不存在时用于 dummy 比较的预生成 bcrypt 哈希。
DUMMY_HASH = "$2b$10$GFL.8CarZJXuw3Y/ET6tdeDLd6RNRvtr97RgsTNv4oteETp9w4Laq"
#: argon2 版 dummy 哈希（新库统一走 argon2 比较分支）。
DUMMY_ARGON2_HASH = password_hasher.hash("homeos-dummy-password")

BCRYPT_ROUNDS = 10
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
ARGON2_PREFIX = "$argon2"

#: 密码策略提示文案（与 Nest cookie-cors.util 完全一致）。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字"

#: 「无本地凭据」哨兵口令：备份导入的账号用它占位（凭据留在导出的那台机器上）。
EXTERNAL_PASSWORD_SENTINEL = "!no-local-credential-v1!"
#: 历史哨兵：删号前的本机管理员账号文件写入口令（``admin_account.py`` 已删除，但存量库里
#: 的行还在）。字面量在这里**只此一处**——源码里再也搜不到它，因为写入方已经没了。
LEGACY_ADMIN_PASSWORD_SENTINEL = "!external-admin-account-v1!"
#: 全部哨兵。都不是任何哈希算法可产生的格式，``verify_password`` 对它们必定返回 False。
CREDENTIALLESS_SENTINELS = frozenset(
    {EXTERNAL_PASSWORD_SENTINEL, LEGACY_ADMIN_PASSWORD_SENTINEL}
)


def is_credentialless(hashed: str | None) -> bool:
    """该口令哈希是否为「无本地凭据」哨兵。

    拿哨兵当口令的行**永远无法登录**（与传入什么口令无关）。判定用途见
    ``api/auth.py`` 的 ``_claimable_legacy_user``：这类行不该把首装注册永久挡在 409 之外。
    """
    return (hashed or "") in CREDENTIALLESS_SENTINELS


def hash_password(password: str) -> str:
    """生成 argon2id 哈希（新密码一律走这里）。"""
    return password_hasher.hash(password)


def _is_bcrypt(hashed: str) -> bool:
    return hashed.startswith(BCRYPT_PREFIXES)


def _is_argon2(hashed: str) -> bool:
    return hashed.startswith(ARGON2_PREFIX)


def verify_password(password: str, hashed: str) -> bool:
    """校验口令；兼容 argon2 与存量 bcrypt 两种哈希。"""
    if not hashed:
        return False
    if _is_argon2(hashed):
        try:
            return password_hasher.verify(hashed, password)
        except (InvalidHashError, VerificationError):
            return False
    if _is_bcrypt(hashed):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except (ValueError, TypeError):
            return False
    return False


def needs_rehash(hashed: str) -> bool:
    """该哈希是否应升级为当前 argon2 参数。

    bcrypt 恒为 ``True``（迁移期统一升级）；argon2 则按参数是否落后判断。
    """
    if not hashed:
        return False
    if _is_bcrypt(hashed):
        return True
    if _is_argon2(hashed):
        try:
            return password_hasher.check_needs_rehash(hashed)
        except (InvalidHashError, VerificationError):
            return False
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
