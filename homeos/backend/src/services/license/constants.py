"""商业授权常量（对齐 ``modules/license/license.constants.ts``）。

威胁模型：防误用与随手拷贝；不承诺防专业破解。授权商店可吊销 / 解绑，客户端按租约续期。
"""

from __future__ import annotations

import os
from collections.abc import Mapping

from ...core.booleans import parse_boolean_query

#: 授权商店默认地址（同机自测口径，生产由部署注入 ``APP_LICENSE_SERVER_URL``）。
DEFAULT_LICENSE_SERVER_URL = "http://127.0.0.1:8802"

#: Linux/Docker machine-id 指纹盐
LICENSE_HWID_SALT = "HOMEOS_LICENSE_SALT_2026"

#: macOS IOPlatformUUID 指纹盐
LICENSE_HWID_SALT_MAC = "HOMEOS_LICENSE_SALT_2026_MAC"

#: Windows MachineGuid 指纹盐
LICENSE_HWID_SALT_WIN = "HOMEOS_LICENSE_SALT_2026_WIN"


def _env_boolean(raw: str | None) -> bool | None:
    """解析 env 布尔值；未设置 / 无法识别返回 ``None``（对齐 ``parseEnvBoolean``）。"""
    if raw is None:
        return None
    text = raw.strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return None


def is_license_required_from_env(env: Mapping[str, str] | None = None) -> bool:
    """是否启用商业授权门禁。

    ``LICENSE_REQUIRED`` 显式 0/false/no/off → 关闭；1/true/yes/on → 开启；
    未设置时：``NODE_ENV=production`` 默认开启，其它环境默认关闭。
    """
    source = env if env is not None else os.environ
    explicit = _env_boolean(source.get("LICENSE_REQUIRED"))
    if explicit is not None:
        return explicit
    return str(source.get("NODE_ENV") or "").strip() == "production"


__all__ = [
    "DEFAULT_LICENSE_SERVER_URL",
    "LICENSE_HWID_SALT",
    "LICENSE_HWID_SALT_MAC",
    "LICENSE_HWID_SALT_WIN",
    "is_license_required_from_env",
    "parse_boolean_query",
]
