"""口令哈希、会话令牌与验证码工具。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

PBKDF2_ITERATIONS = 240_000
PBKDF2_ALGORITHM = "sha256"


def utcnow() -> datetime:
    """返回 naive UTC 时间，便于 SQLite 存储与比较。"""
    return datetime.now(UTC).replace(tzinfo=None)


def naive_utc(value: datetime | None) -> datetime | None:
    """时区归一的**唯一**实现：带时区的值先换算到 UTC，再去掉时区。
    """
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def iso(value: datetime | None) -> str | None:
    """序列化为参考站风格的无时区 ISO 字符串。"""
    value = naive_utc(value)
    return None if value is None else value.strftime("%Y-%m-%dT%H:%M:%S")


def iso_micro(value: datetime | None) -> str | None:
    value = naive_utc(value)
    return None if value is None else value.strftime("%Y-%m-%dT%H:%M:%S.%f")


def iso_z(value: datetime | None) -> str | None:
    """带 Z 后缀的 ISO 字符串，授权协议要求。"""
    text = iso_micro(value)
    return None if text is None else f"{text}Z"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM, password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "$".join(
        (
            "pbkdf2",
            PBKDF2_ALGORITHM,
            str(PBKDF2_ITERATIONS),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )
    )


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        scheme, algorithm, iterations, salt_b64, digest_b64 = encoded.split("$")
        if scheme != "pbkdf2":
            return False
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            algorithm,
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def new_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(candidate: str | None, expected: str | None) -> bool:
    """恒定时间比较两个令牌；任一为空即 ``False``。
    """
    if not candidate or not expected:
        return False
    return secrets.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def new_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_activation_code() -> str:
    """生成 HOMEOS-XXXX-XXXX-XXXX 形式的激活码。"""
    alphabet = "0123456789ABCDEF"
    groups = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(6)]
    return "HOMEOS-" + "-".join(groups)


def activation_code_hint(code: str) -> str:
    return code[-9:]


def new_code_salt() -> str:
    """验证码的逐条随机盐（16 字节十六进制）。"""
    return secrets.token_hex(16)


def code_hash(code: str, salt: str = "") -> str:
    """验证码在库里只存哈希，且**逐条加盐**。
    """
    text = (code or "").strip()
    if not salt:
        return hashlib.sha256(f"hb-store-verification:{text}".encode()).hexdigest()
    return hashlib.sha256(f"{salt}\x1f{text}".encode()).hexdigest()


def new_order_no(prefix_email: str, *, now: datetime | None = None) -> str:
    """生成订单号：``HOMEOS-<本地时间14位>-<邮箱前缀>-<随机6位>``。
    """
    moment = now or (datetime.now(UTC) + timedelta(hours=8))
    local_prefix = "".join(ch for ch in (prefix_email or "").split("@")[0] if ch.isalnum())
    if not local_prefix:
        local_prefix = "customer"
    suffix = secrets.token_hex(6)
    return f"HOMEOS-{moment.strftime('%Y%m%d%H%M%S')}-{local_prefix}-{suffix}"


_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


def is_valid_email(value: str | None) -> bool:
    """邮箱形态是否合法（同时要求长度不超过 255，和 ``accounts.email`` 列宽对齐）。"""
    if not value:
        return False
    text = value.strip()
    return len(text) <= 255 and bool(_EMAIL_RE.match(text))


def normalize_email(value: str) -> str:
    """统一大小写与前后空白：库里所有邮箱都按小写比对，签名也要一致。"""
    return value.strip().lower()


#: 邀请码形态：8 位无歧义字母数字（不含 0/1/I/O —— 手抄或电话口述时最容易混的四个字符）。
REFERRAL_CODE_RE = re.compile(r"^[2-9A-HJ-NP-Z]{8}$")


def new_referral_code() -> str:
    """生成 8 位无歧义邀请码（32^8 远大于原来 6 位数字的 10^6，撞码概率可忽略）。"""
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def normalize_referral_code(value: str | None) -> str | None:
    """把用户输入的邀请码归一成库里存的形式；形态不合法时返回 None。
    """
    text = (value or "").strip().upper()
    if not text:
        return None
    return text if REFERRAL_CODE_RE.match(text) else None


def new_uuid() -> str:
    return str(uuid.uuid4())
