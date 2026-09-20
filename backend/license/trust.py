"""授权信任锚启动自检：公钥文件存在且指纹与配置一致。

构造 ``LicenseTransportCipher`` / 验签时也会核对指纹，但报错偏底层。
本模块在启动期给出明确的密钥准备指引，避免激活阶段才发现密钥漂移。
"""
from __future__ import annotations

import hashlib
import hmac
from pathlib import Path

from ..config import Settings

KEY_PREPARATION_HINT = (
    '请在仓库根运行 python start.py：它会生成 store/keys/local 密钥并把公钥同步到 '
    'keys/，同时按公钥文件字节设置主应用的 APP_LICENSE_* 指纹。'
    '也可手动设置 APP_LICENSE_PUBLIC_KEY_SHA256 / '
    'APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 覆盖，'
    '或更新 backend/config.py 的 DEFAULT_LICENSE_* 常量。'
)


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_license_trust_anchors(settings: Settings) -> None:
    """校验签名公钥与传输公钥的文件存在性与指纹。

    异常:
        RuntimeError: 缺失或指纹不一致；文案含密钥准备操作指引。
    """
    for key_id, (path, expected) in settings.license_trusted_public_keys.items():
        if not path.exists():
            raise RuntimeError(f'授权签名公钥缺失：{path}。{KEY_PREPARATION_HINT}')
        if expected:
            actual = _file_sha256(path)
            if not hmac.compare_digest(actual, expected):
                raise RuntimeError(
                    f'授权签名公钥指纹不匹配（keyId={key_id}）：'
                    f'期望 {expected}，实际 {actual}。{KEY_PREPARATION_HINT}'
                )

    transport_path = settings.license_transport_public_key_path
    if not transport_path.exists():
        raise RuntimeError(f'授权传输公钥缺失：{transport_path}。{KEY_PREPARATION_HINT}')
    actual = _file_sha256(transport_path)
    expected = settings.license_transport_public_key_sha256
    if not hmac.compare_digest(actual, expected):
        raise RuntimeError(
            f'授权传输公钥指纹不匹配：期望 {expected}，实际 {actual}。{KEY_PREPARATION_HINT}'
        )
