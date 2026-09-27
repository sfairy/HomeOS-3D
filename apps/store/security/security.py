"""口令哈希、会话令牌与验证码工具。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

PBKDF2_ITERATIONS = 240_000
PBKDF2_ALGORITHM = "sha256"


def utcnow() -> datetime:
    """返回 naive UTC 时间，便于 SQLite 存储与比较。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def naive_utc(value: datetime | None) -> datetime | None:
    """时区归一的**唯一**实现：带时区的值先换算到 UTC，再去掉时区。

    它是「协议要求 UTC、库里存 naive UTC」这条知识的执行点，``iso``/``iso_micro`` 都调它：
    少做一步不会报错，只会把小时数静默偏掉 —— 东八区正好偏 8 小时。
    """
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


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

    ``lookup_token`` 是能直接换到订单内容的 bearer 凭据，用 ``==`` 比较会逐字节提前返回，
    把「猜不中」变成按字节试出来。两侧先编码成 bytes：``compare_digest`` 收到非 ASCII
    ``str`` 会抛 ``TypeError``，而 candidate 由攻击者控制，抛异常等于多一个 500 面。
    """
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
    """验证码在库里只存哈希，且**逐条加盐**。

    验证码只有 6 位（10⁶ 空间），无盐哈希全局确定：可预计算成表、一次爆破覆盖所有行，还能
    反推两个用户拿过同一个码；逐条盐把成本压回按行重算。``salt`` 为空串表示本列引入之前的
    旧记录，按旧口径校验，否则升级瞬间在用的验证码（最多 10 分钟寿命）会集体失效。
    """
    text = (code or "").strip()
    if not salt:
        return hashlib.sha256(f"hb-store-verification:{text}".encode("utf-8")).hexdigest()
    return hashlib.sha256(f"{salt}\x1f{text}".encode("utf-8")).hexdigest()


def new_order_no(prefix_email: str, *, now: datetime | None = None) -> str:
    """生成订单号：``HOMEOS-<本地时间14位>-<邮箱前缀>-<随机6位>``。

    时间精度只到秒、后缀只取邮箱本地部分，所以「同一秒 + 同一邮箱前缀」必然撞号（同账号
    连点两次或两个不同账号同秒下单），唯一索引一撞就是 500；补随机段后按构造即唯一。
    用 ``secrets``：订单号出现在查询链接与邮件里，能被猜到就没意义了。
    """
    moment = now or (datetime.now(timezone.utc) + timedelta(hours=8))
    local_prefix = "".join(ch for ch in (prefix_email or "").split("@")[0] if ch.isalnum())
    if not local_prefix:
        local_prefix = "customer"
    suffix = secrets.token_hex(6)
    return f"HOMEOS-{moment.strftime('%Y%m%d%H%M%S')}-{local_prefix}-{suffix}"


#: 邮箱形状校验。刻意写得保守：只拒绝明显不是邮箱的输入（缺 @、带空格、域名没有点等），
#: 不追求 RFC 5322 的完整文法——把能收信的合法地址误判掉，比放过一个拼错的地址更麻烦。
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


def new_referral_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_uuid() -> str:
    return str(uuid.uuid4())
