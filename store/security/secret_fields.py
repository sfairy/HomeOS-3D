"""后台「密钥类字段」的通用处理：打码、识别打码值、归一化提交值。

这一层被支付宝凭据（``payments/credentials.py``）和邮箱 SMTP 授权码
（``mail_settings.py``）共用。两处的语义完全一致，而且**错法也一样**：
前端把 GET 拿到的打码值原样回传，若后端当成新密钥写入，真密钥就被
``••••abcd`` 覆盖掉，接口还会返回 200、界面继续显示「已配置」。

所以这套规则必须只有一份实现 —— 两边各写一遍的话，任何一边的边界漏了，
表现都是「保存成功但凭据静默损坏」，而这类故障只有在用户付不了款 /
收不到验证码时才暴露。
"""

from __future__ import annotations

import re

#: 密钥打码前缀。后台读到的密钥都是 ``••••abcd`` 这种形式，回传时按「不修改」处理。
MASK_PREFIX = "••••"

#: PEM 头尾（``-----BEGIN PRIVATE KEY-----`` 之类）与空白，用于取出密钥本体。
_PEM_WRAPPER_RE = re.compile(r"-{3,}[^-]+-{3,}")
_WHITESPACE_RE = re.compile(r"\s+")


def mask_secret(value: str | None) -> str:
    """把密钥打码成 ``••••abcd``（只留末 4 位）。

    留末 4 位是为了让运营能确认「库里存的是我以为的那把新密钥」，全遮成 ``****`` 时换没换
    成功在界面上看不出来。末 4 位必须取自**密钥本体**（PEM 去掉头尾后的 base64）—— 直接取
    原串尾部的话每把私钥都显示成 ``••••----``，打码值就失去意义。
    """
    text = (value or "").strip()
    if not text:
        return ""
    # 去掉 ----BEGIN XXX---- / ----END XXX---- 之类的头尾，只留密钥本体
    body = _PEM_WRAPPER_RE.sub("", text)
    material = _WHITESPACE_RE.sub("", body) or _WHITESPACE_RE.sub("", text)
    return f"{MASK_PREFIX}{material[-4:]}"


def is_masked_secret(value: str | None) -> bool:
    """判断前端回传的是不是打码值（而非新密钥）。"""
    return bool(value) and (value or "").strip().startswith(MASK_PREFIX)


def resolve_secret_input(value: str | None) -> str | None:
    """把后台提交的密钥字段归一成「要写入的值」。

    返回 ``None`` 表示**不要改动**（字段没传，或前端把打码值原样回传了）。
    返回 ``""`` 表示**清空**（跟随环境变量）。返回其它字符串表示新密钥。
    """
    if value is None:
        return None
    text = value.strip()
    if is_masked_secret(text):
        return None
    return text
