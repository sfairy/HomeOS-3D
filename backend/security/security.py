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

from ..config import Settings

# 模块级单例：PasswordHasher 内部会缓存参数，重复构造纯属浪费。
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """把明文口令哈希成 argon2 串（含盐与参数，可直接入库）。"""
    return password_hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """校验口令是否匹配哈希；**恒定走一次且只走一次** argon2 计算。

    两条要求一起满足：

    - 哈希缺失、哈希格式非法、口令不匹配都返回 False，不向外区分 —— 区分等于把
      「该用户是否存在 / 哈希是否损坏」暴露给攻击者；
    - 上面三种情形都必须真的算一轮 argon2（缺哈希时用 :data:`DUMMY_PASSWORD_HASH`
      顶上）。否则调用方一旦把本函数写在判定链的末尾，短路会让「用户名对不对」
      从响应时间上泄漏出去—— 22ms 与 0ms 的差别，枚举出用户名只要几次请求。
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

    结果必然不匹配，因此这里只负责「算完」，并把不匹配本身咽掉。
    """
    try:
        password_hasher.verify(DUMMY_PASSWORD_HASH, password)
    except (InvalidHashError, VerifyMismatchError):
        return None


#: 一条口令未知的 argon2 哈希，专门用来把「没有哈希可校验」的路径也变成一次真的校验。
#:
#: 它的作用只有一个：当账号不存在（或哈希损坏）时，仍然让 argon2 跑完整的一轮，
#: 使这条路径的耗时与「账号存在但口令错」一致 —— 否则响应时间的差别本身就回答了
#: 「这个用户名存不存在」。值写死而不是启动时现算，是为了不给每个进程的启动
#: 加一次 argon2 哈希；参数随 argon2 升级也不会失效（校验参数从哈希串里读）。
DUMMY_PASSWORD_HASH = (
    '$argon2id$v=19$m=65536,t=3,p=4$5JEhzNRvImo3+VBOu7xD0Q$IMvV/nOBd1/+sI61MaQJx3fHAR6WCXSpU419+hTAwwk'
)



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
    """
    max_age = settings.display_cookie_max_age_seconds
    # httponly 防脚本读取；samesite=lax 允许展示页被同源 iframe 打开；
    # path='/' 保证 /display/* 与 /api/* 都能带上这个 Cookie。
    response.set_cookie(key=settings.display_cookie_name, value=token, max_age=max_age, expires=datetime.now(timezone.utc) + timedelta(seconds=max_age), httponly=True, secure=settings.cookie_secure if secure is None else secure, samesite='lax', path='/')
