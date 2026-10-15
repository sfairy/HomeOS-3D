"""授权传输通道的**唯一**真源：协议标识、HKDF info、AAD 组成、base64url 与规范化 JSON。

为什么必须共享
--------------
主应用是客户端（``LicenseTransportCipher``：加密请求、解密响应），商店是服务端
（``TransportCipher``：解密请求、加密响应）。此前两侧各自写了一遍协议参数：
``PROTOCOL`` 字面量、``\x00`` 分隔符、``request`` / ``response`` 方向词、会话密钥长度、
IV 长度、无填充 base64url、以及"排序 + 紧凑分隔符 + 不转义非 ASCII"的 JSON 规范。

这些字面量**任一处漂移都不会在本端报错**：keyId 校验照样通过、本端单测照样全绿，只是派生
密钥或 AAD 不同，对手端解密必然失败 —— 症状是"激活突然全挂"，而两侧都查不出原因。

所以收口成一份叶子实现（**纯标准库**）：谁都不再持有这些字面量的副本。HKDF / AES-GCM 的
调用留在各端（各自的错误类型与文案不同），但参数一律由本模块给出。

依赖方向：后端 → ``homeos_shared``；本模块不 import 任一后端，也不依赖 ``cryptography``。
"""

from __future__ import annotations

import base64
import json
from collections.abc import Mapping
from typing import Any

#: 传输协议标识：同时参与 HKDF 的 info 与 AES-GCM 的 AAD。
#: 改名 = 与在役客户端 / 服务端不兼容（两侧同时升级才有意义，且必须成对）。
PROTOCOL = b'homeos-license-transport-v1'

#: 方向标记：同一把一次性密钥下用不同 AAD 绑死方向，防"把响应当请求重放"。
REQUEST_DIRECTION = b'request'
RESPONSE_DIRECTION = b'response'

#: HKDF-SHA256 派生出的会话密钥长度（AES-256-GCM 的 32 字节密钥）。
SESSION_KEY_LENGTH = 32

#: AES-GCM 的 IV 长度：96 位（NIST 推荐长度），两侧都按它校验。
AES_GCM_IV_LENGTH = 12

#: keyId 的长度上限与安全字符集：它会被拼进 HKDF info 与 AAD，必须限制在可打印安全字符内。
KEY_ID_MAX_LENGTH = 64
KEY_ID_SAFE_CHARACTERS = frozenset('-_.')


def _ascii_segment(segment: str) -> bytes:
    """协议段一律按 ASCII 编码：两侧派生必须逐字节一致，非 ASCII 直接抛 ``UnicodeEncodeError``。"""
    return segment.encode('ascii')


def derive_key_info(key_id: str, path: str) -> bytes:
    """HKDF 的 ``info``：``PROTOCOL \\x00 <keyId> \\x00 <path>``。"""
    return PROTOCOL + b'\x00' + _ascii_segment(key_id) + b'\x00' + _ascii_segment(path)


def transport_aad(direction: bytes, key_id: str, path: str) -> bytes:
    """AES-GCM 的 AAD：``PROTOCOL \\x00 <direction> \\x00 <path> \\x00 <keyId>``。"""
    return PROTOCOL + b'\x00' + direction + b'\x00' + _ascii_segment(path) + b'\x00' + _ascii_segment(key_id)


def b64url_encode(raw: bytes) -> str:
    """无填充 base64url（信封里的二进制字段一律用它）。"""
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def b64url_decode(encoded: Any) -> bytes:
    """无填充 base64url 解码。

    非字符串抛 ``TypeError``、非法编码抛 ``ValueError`` —— 各端据此翻译成自己的错误类型
    （客户端 ``LicenseCryptoError``、服务端 400），不在这里决定 HTTP 语义。
    """
    if not isinstance(encoded, str):
        raise TypeError(f'需要字符串，实际是 {type(encoded).__name__}')
    return base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))


def canonical_json_bytes(document: Mapping[str, Any]) -> bytes:
    """规范化 JSON：键排序 + 紧凑分隔符 + 不转义非 ASCII。

    两侧必须逐字节一致，否则签名验不过（这是"同一份数据、两种字节"的经典坑）。
    """
    return json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def is_valid_key_id(key_id: Any) -> bool:
    """keyId 是否可用于派生与 AAD：字符串、非空、≤64 字符、只用字母数字与 ``-_.``。"""
    if not isinstance(key_id, str) or not key_id or len(key_id) > KEY_ID_MAX_LENGTH:
        return False
    return all(character.isalnum() or character in KEY_ID_SAFE_CHARACTERS for character in key_id)


__all__ = [
    'AES_GCM_IV_LENGTH',
    'KEY_ID_MAX_LENGTH',
    'PROTOCOL',
    'REQUEST_DIRECTION',
    'RESPONSE_DIRECTION',
    'SESSION_KEY_LENGTH',
    'b64url_decode',
    'b64url_encode',
    'canonical_json_bytes',
    'derive_key_info',
    'is_valid_key_id',
    'transport_aad',
]
