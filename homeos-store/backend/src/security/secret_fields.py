"""密钥字段处理的门面（实现已下沉到 ``core.secrets``）。

``infra.mail_settings`` 需要 ``mask_secret`` 展示 SMTP 授权码；而 ``infra`` 只允许依赖
``core``。打码是纯字符串工具，搬到 ``core`` 后依赖方向恢复为 ``infra → core``。
"""

from __future__ import annotations

from ..core.secrets import (
    MASK_PREFIX,
    is_masked_secret,
    mask_secret,
    resolve_secret_input,
)

__all__ = ["MASK_PREFIX", "is_masked_secret", "mask_secret", "resolve_secret_input"]
