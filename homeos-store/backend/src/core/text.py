"""文本归一化与格式判据（邮箱、账号名、邀请码）。

与口令无关：这些判据决定「同一个账号的不同写法是否等价」，既被登录使用，也被注册、
后台改邮箱与邀请码绑定使用。原先放在 ``security/security.py`` 会让 ``core.schemas``
反向依赖 ``security``，拆出来之后依赖方向只剩 ``security → core``。
"""

from __future__ import annotations

import re

__all__ = [
    "REFERRAL_CODE_RE",
    "is_valid_email",
    "normalize_email",
    "normalize_referral_code",
    "normalize_username",
]

_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")

REFERRAL_CODE_RE = re.compile(r"^[2-9A-HJ-NP-Z]{8}$")


def is_valid_email(value: str | None) -> bool:
    """邮箱形态是否合法（同时要求长度不超过 255，和 ``accounts.email`` 列宽对齐）。"""
    if not value:
        return False
    text = value.strip()
    return len(text) <= 255 and bool(_EMAIL_RE.match(text))


def normalize_email(value: str) -> str:
    """统一大小写与前后空白：库里所有邮箱都按小写比对，签名也要一致。"""
    return value.strip().lower()


def normalize_username(value: str) -> str:
    """登录账号名清洗（与主应用 ``_clean_username`` 同口径）。

    至少 3 位、最多 64 位；不能含控制字符、``@`` 或空白（``@`` 留给邮箱登录）。
    统一小写，避免 ``Alice`` / ``alice`` 双注册而登录 ``func.lower`` 歧义。
    """
    cleaned = (value or "").strip().lower()
    if len(cleaned) < 3 or len(cleaned) > 64 or _CONTROL_CHARACTERS.search(cleaned):
        raise ValueError("账号长度须为 3–64 个字符，且不能包含控制字符。")
    if "@" in cleaned or re.search(r"\s", cleaned):
        raise ValueError("账号不能包含 @ 或空格（@ 保留给邮箱登录）。")
    return cleaned


def normalize_referral_code(value: str | None) -> str | None:
    """把用户输入的邀请码归一成库里存的形式；形态不合法时返回 None。"""
    text = (value or "").strip().upper()
    if not text:
        return None
    return text if REFERRAL_CODE_RE.match(text) else None
