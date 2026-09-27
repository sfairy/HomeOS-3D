"""口令、会话令牌与 Cookie 的密码学工具。
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from starlette.responses import Response

from ..config import Settings

# 模块级单例：PasswordHasher 内部会缓存参数，重复构造纯属浪费。
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """把明文口令哈希成 argon2 串（含盐与参数，可直接入库）。"""
    return password_hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """校验口令是否匹配哈希；**恒定走一次且只走一次** argon2 计算。
    """
    if not password_hash:
        _verify_against_dummy(password)
        return False
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except InvalidHashError:
        # 哈希本身坏了：再算一轮哑哈希，免得这条路径比「口令错」快一大截。
        _verify_against_dummy(password)
        return False


def _verify_against_dummy(password: str) -> None:
    """拿 :data:`DUMMY_PASSWORD_HASH` 算一轮，只为让耗时与真实校验一致。
    """
    try:
        password_hasher.verify(DUMMY_PASSWORD_HASH, password)
    except (InvalidHashError, VerifyMismatchError):
        return None


#: 一条口令未知的 argon2 哈希，用来把「没有哈希可校验」的路径也变成一次真的校验。
DUMMY_PASSWORD_HASH = (
    '$argon2id$v=19$m=65536,t=3,p=4$5JEhzNRvImo3+VBOu7xD0Q$IMvV/nOBd1/+sI61MaQJx3fHAR6WCXSpU419+hTAwwk'
)



def new_session_token() -> str:
    """生成新的会话随机令牌（32 字节，URL 安全 base64）。"""
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    """会话令牌入库前的哈希。
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def session_expiry(max_age_seconds: int) -> datetime:
    """按有效期算出会话的绝对过期时间（UTC）。"""
    return datetime.now(timezone.utc) + timedelta(seconds=max_age_seconds)


def set_display_cookie(response: Response, settings: Settings, token: str, *, secure: bool | None = None) -> None:
    """写入中控设备 Cookie。
    """
    max_age = settings.display_cookie_max_age_seconds
    # httponly 防脚本读取；samesite=lax 允许展示页被同源 iframe 打开；
    response.set_cookie(key=settings.display_cookie_name, value=token, max_age=max_age, expires=datetime.now(timezone.utc) + timedelta(seconds=max_age), httponly=True, secure=settings.cookie_secure if secure is None else secure, samesite='lax', path='/')
