"""口令策略：两个后端共用同一份判据。

为什么单独成模块：``homeos``（``platform/security/passwords.py``）与
``homeos-store``（``security/security.py``）此前各存一份实现，改一处必须记得改另一处；
前端又各存一份 TS 副本。四份副本里只要有一份判据不同，就会出现
「前端放行、后端 422」或「主应用能注册、商店不能绑定」这类割裂。

判据本身刻意只认 ASCII：
- 字母：``ch.isalpha() and ch.isascii()`` —— 全角字母不算「有字母」；
- 数字：``ch.isdigit() and ch.isascii()`` —— 全角 / 阿拉伯-印度数字不算「有数字」。

两端前端用 ``[A-Za-z]`` / ``[0-9]``，与这里的 ASCII 口径逐条对齐。
"""

from __future__ import annotations

#: 口令长度下界。
PASSWORD_MIN_LENGTH = 8

#: 口令长度上界。
PASSWORD_MAX_LENGTH = 128

#: 策略提示文案：主应用、商店后端与两侧前端**逐字一致**。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且须同时包含字母和数字"


def is_password_policy_compliant(password: str) -> bool:
    """口令是否满足统一策略：8–128 位，且同时包含 ASCII 字母与 ASCII 数字。"""
    if not password or not (PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH):
        return False
    has_letter = any(ch.isalpha() and ch.isascii() for ch in password)
    has_digit = any(ch.isdigit() and ch.isascii() for ch in password)
    return has_letter and has_digit


__all__ = [
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "PASSWORD_POLICY_MESSAGE",
    "is_password_policy_compliant",
]
