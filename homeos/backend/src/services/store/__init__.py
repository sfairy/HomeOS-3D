"""商店客户端（主应用侧）：目前只有邮箱验证码。"""

from .verification import (
    StoreVerificationClient,
    StoreVerificationError,
    verification_client_from_settings,
)

__all__ = [
    "StoreVerificationClient",
    "StoreVerificationError",
    "verification_client_from_settings",
]
