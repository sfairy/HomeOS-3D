"""口令、会话令牌与 Cookie 的密码学工具。

只提供无状态的纯函数，不碰数据库也不读配置内容（只读 Settings 里的开关）。
所有随机值一律走 secrets 模块，不用 random，避免可预测的会话令牌。
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from starlette.responses import Response

from .config import Settings

# 模块级单例：PasswordHasher 内部会缓存参数，重复构造纯属浪费。
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """把明文口令哈希成 argon2 串（含盐与参数，可直接入库）。"""
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """校验口令是否匹配哈希。

    哈希格式非法与口令不匹配都返回 False，不向外区分二者 ——
    区分等于把「该用户是否存在 / 哈希是否损坏」暴露给攻击者。
    因此登录流程固定走一次校验，避免用响应时间枚举用户名。
    """
    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerifyMismatchError):
        return False


def new_session_token() -> str:
    """生成新的会话随机令牌（32 字节，URL 安全 base64）。"""
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    """会话令牌入库前的哈希。

    库里只存哈希不存原文：即使数据库泄露也无法直接拿去冒用会话。
    这里用 sha256 而非 argon2 是因为令牌本身已是高熵随机值，
    不需要抗爆破的慢哈希，而每次请求都要查库、必须够快。
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def session_expiry(max_age_seconds: int) -> datetime:
    """按有效期算出会话的绝对过期时间（UTC）。"""
    return datetime.now(timezone.utc) + timedelta(seconds=max_age_seconds)


def set_display_cookie(response: Response, settings: Settings, token: str, *, secure: bool | None = None) -> None:
    """写入中控设备 Cookie。

    浏览器侧有效期取 display_cookie_max_age_seconds（默认 180 天）；服务端还有一层
    滑动有效期（display_token_expires_at），因此这里不需要留十年 —— 只要平板还在
    轮询，续期就会把两边一起推后。同时刷新 max_age 与 expires，兼容只认其中一个的旧浏览器。

    参数:
        secure: 是否加 Secure。调用方有请求上下文时传请求级判定结果
            （见 http_security.secure_cookies_enabled）；只有 Settings 时留空，
            退化成读配置开关。
    """
    max_age = settings.display_cookie_max_age_seconds
    # httponly 防脚本读取；samesite=lax 允许展示页被同源 iframe 打开；
    # path='/' 保证 /display/* 与 /api/* 都能带上这个 Cookie。
    response.set_cookie(key=settings.display_cookie_name, value=token, max_age=max_age, expires=datetime.now(timezone.utc) + timedelta(seconds=max_age), httponly=True, secure=settings.cookie_secure if secure is None else secure, samesite='lax', path='/')
