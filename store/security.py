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


def iso(value: datetime | None) -> str | None:
    """序列化为参考站风格的无时区 ISO 字符串。"""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S")


def iso_micro(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S.%f")


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

    订单查询凭证（``lookup_token``）是可以直接换到订单内容的 bearer 凭据，
    用 ``==`` 比较会**逐字节提前返回** —— 把一个「猜不中」的问题变成「按字节
    逐个试出来」的问题（48 字节的 token 只需约 48×256 次试探，而不是 256^48）。
    项目里已有 ``secrets.compare_digest`` 的正确用法散在几个文件里，但都各写一遍
    「非空 + 比较」，于是新加的调用点很容易漏掉。统一收在这里。

    先把两侧编码成 bytes 再比：``compare_digest`` 传入非 ASCII 的 ``str`` 会抛
    ``TypeError``（不是返回 False），而 candidate 来自攻击者可完全控制的查询串/请求头，
    抛异常就等于多了一个 500 面。
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

    为什么需要盐：验证码只有 6 位（10⁶ 空间），不加盐时哈希是全局确定的 ——
    ``sha256("hb-store-verification:" + code)``。这个口径有三个问题：

    * **可预计算**：10⁶ 个哈希几分钟就能算完并存成表，拿到库之后是查表而不是爆破；
    * **一次爆破覆盖所有行**：同一个码在任何记录里哈希相同，于是 10⁶ 次哈希能把
      **所有**近期验证码一起还原出来，而不是一行；
    * **可对比**：哈希相等即可反推「两个用户拿到过同一个码」。

    加逐条盐之后，攻击者必须**按行**重算（每行一次 10⁶ 量级的爆破），预计算与
    跨行对比同时失效。

    ``salt`` 为空串表示这是**本列引入之前写入的旧记录**，按旧口径校验 —— 否则升级
    瞬间正在输入的那些验证码（最多还有 10 分钟寿命）会全部失效，而它们不值得为
    此做一次回填。
    """
    text = (code or "").strip()
    if not salt:
        return hashlib.sha256(f"hb-store-verification:{text}".encode("utf-8")).hexdigest()
    return hashlib.sha256(f"{salt}\x1f{text}".encode("utf-8")).hexdigest()


def new_order_no(prefix_email: str, *, now: datetime | None = None) -> str:
    """生成订单号：``HOMEOS-<本地时间14位>-<邮箱前缀>-<随机6位>``。

    参考站格式是 ``HOMEOS-20260906224517-156120718``（本地时间 + 9 位数字）。
    本实现把第三段换成可读的邮箱前缀，于是**必须在末尾再补一段随机值**：

    时间精度只到秒 + 后缀只取邮箱本地部分，意味着「同一秒 + 同一邮箱前缀」必然
    算出同一个号。而同账号连点两次、或 ``a@x.com`` 与 ``a@y.com`` 两个不同账号
    在同一秒下单，都会落进这个窗口 —— 唯一索引一撞就是 500（实测 8 线程 × 40 轮里
    有 32 轮复现）。补上随机段后订单号**按构造即唯一**，不再依赖「插进去撞了再换号」
    这种事后重试。

    ``secrets`` 而非 ``random``：订单号会出现在查询链接与邮件里，能被猜到就没有
    意义了。6 字节（12 个十六进制字符）在单秒内撞号的概率可以忽略。
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
