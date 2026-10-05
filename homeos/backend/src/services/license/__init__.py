"""商业授权服务包（LicenseService / 授权门禁 / 公钥自举 / 密码学原语）。"""

from __future__ import annotations

from .constants import DEFAULT_LICENSE_SERVER_URL, is_license_required_from_env
from .crypto import (
    LICENSE_PRODUCT,
    LICENSE_PROTOCOL,
    LeaseVerifier,
    LicenseCryptoError,
    LicenseTransportCipher,
    SecretCipher,
    derive_key_id,
    parse_timestamp,
    public_key_sha256,
)
from .fingerprint import generate_hardware_fingerprint
from .key_bootstrap import ensure_client_keys, keys_ready
from .service import (
    LICENSE_EXEMPT_EXACT,
    LICENSE_EXEMPT_PREFIX,
    STATUS_LABELS,
    TERMINAL_STATES,
    LicenseClientError,
    LicenseService,
)

__all__ = [
    "DEFAULT_LICENSE_SERVER_URL",
    "LICENSE_EXEMPT_EXACT",
    "LICENSE_EXEMPT_PREFIX",
    "LICENSE_PRODUCT",
    "LICENSE_PROTOCOL",
    "STATUS_LABELS",
    "TERMINAL_STATES",
    "LeaseVerifier",
    "LicenseClientError",
    "LicenseCryptoError",
    "LicenseService",
    "LicenseTransportCipher",
    "SecretCipher",
    "derive_key_id",
    "ensure_client_keys",
    "generate_hardware_fingerprint",
    "is_license_required_from_env",
    "keys_ready",
    "parse_timestamp",
    "public_key_sha256",
]
