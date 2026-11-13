"""密钥类字段的通用处理：打码、识别打码值、归一化提交值。

纯字符串工具，与算法/密钥环无关，因此放在 ``core`` 叶子层：``infra.mail_settings``
需要 ``mask_secret`` 给后台展示 SMTP 授权码，而 ``infra`` 只允许依赖 ``core``。
``security.secret_fields`` 保留为门面，旧导入路径不变。
"""

from __future__ import annotations

import re

MASK_PREFIX = "••••"

_PEM_WRAPPER_RE = re.compile(r"-{3,}[^-]+-{3,}")
_WHITESPACE_RE = re.compile(r"\s+")

__all__ = ["MASK_PREFIX", "is_masked_secret", "mask_secret", "resolve_secret_input"]


def mask_secret(value: str | None) -> str:
    """把密钥打码成 ``••••abcd``（只留末 4 位）。"""
    text = (value or "").strip()
    if not text:
        return ""
    body = _PEM_WRAPPER_RE.sub("", text)
    material = _WHITESPACE_RE.sub("", body) or _WHITESPACE_RE.sub("", text)
    return f"{MASK_PREFIX}{material[-4:]}"


def is_masked_secret(value: str | None) -> bool:
    """判断前端回传的是不是打码值（而非新密钥）。"""
    return bool(value) and (value or "").strip().startswith(MASK_PREFIX)


def resolve_secret_input(value: str | None) -> str | None:
    """把后台提交的密钥字段归一成「要写入的值」。"""
    if value is None:
        return None
    text = value.strip()
    if is_masked_secret(text):
        return None
    return text
