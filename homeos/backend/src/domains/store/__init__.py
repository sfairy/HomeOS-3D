"""商店客户端（主应用侧）：邮箱验证码 + 对外地址取回。"""

from .discovery import StoreBaseUrlResolver, discover_store_base_url
from .verification import (
    StoreVerificationClient,
    StoreVerificationError,
    verification_client_from_settings,
)

__all__ = [
    "StoreBaseUrlResolver",
    "StoreVerificationClient",
    "StoreVerificationError",
    "discover_store_base_url",
    "verification_client_from_settings",
]
