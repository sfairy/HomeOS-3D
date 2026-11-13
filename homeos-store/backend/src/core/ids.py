"""标识与凭据的叶子实现：UUID、令牌、激活码、订单号、邀请码、验证码。

为什么单拆出来
--------------
这些函数原先与「口令哈希」一起住在 ``security/security.py``，但**标识生成与口令校验是
两件事**：前者是纯随机数/哈希工具（无密钥、无策略），后者才是安全职责。拆开之后
``core`` 可以只依赖 ``core.ids``，而 ``security`` 反向依赖 ``core``，包级强连通消失。

口径保持不变（逐条与拆分前一致）：
- 令牌只存 ``sha256``，日志里只留 12 位指纹；
- 激活码固定 ``HOMEOS-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX``；
- 订单号固定 30 字符、不带邮箱前缀（订单号会进日志、邮件与支付网关）。
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime

from .timeutil import aware_now

__all__ = [
    "activation_code_hint",
    "code_hash",
    "log_fingerprint",
    "new_activation_code",
    "new_code_salt",
    "new_order_no",
    "new_referral_code",
    "new_token",
    "new_uuid",
    "new_verification_code",
    "token_hash",
    "token_matches",
]


def new_uuid() -> str:
    return str(uuid.uuid4())


def new_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def log_fingerprint(secret: str) -> str:
    """日志里使用的不可逆指纹：同一凭据可串联排障，又不会泄露明文。"""
    return token_hash(secret)[:12]


def token_matches(candidate: str | None, expected: str | None) -> bool:
    """恒定时间比较两个令牌；任一为空即 ``False``。"""
    if not candidate or not expected:
        return False
    return secrets.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def new_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_activation_code() -> str:
    """生成 HOMEOS-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX 形式的激活码。"""
    alphabet = "0123456789ABCDEF"
    groups = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(6)]
    return "HOMEOS-" + "-".join(groups)


def activation_code_hint(code: str) -> str:
    return code[-9:]


def new_code_salt() -> str:
    """验证码的逐条随机盐（16 字节十六进制）。"""
    return secrets.token_hex(16)


def code_hash(code: str, salt: str = "") -> str:
    """验证码在库里只存哈希，且**逐条加盐**。"""
    text = (code or "").strip()
    if not salt:
        return hashlib.sha256(f"hb-store-verification:{text}".encode()).hexdigest()
    return hashlib.sha256(f"{salt}\x1f{text}".encode()).hexdigest()


def new_order_no(*, now: datetime | None = None) -> str:
    """生成订单号：``HOMEOS-<本地时间14位>-<随机8位>``（固定 30 字符）。

    - **不再带邮箱前缀**：订单号会进日志、发货邮件和支付网关，把邮箱本地部分写进去等于
      把 PII 散到所有下游；
    - **固定长度 30**：订单号会直接当微信 ``out_trade_no`` 用（只接受 6–32 字符）。
    """
    moment = now or aware_now()
    return f"HOMEOS-{moment.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}"


def new_referral_code() -> str:
    """生成 8 位无歧义邀请码（32^8 远大于原来 6 位数字的 10^6，撞码概率可忽略）。"""
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(8))
