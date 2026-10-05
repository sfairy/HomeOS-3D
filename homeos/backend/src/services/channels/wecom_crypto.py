"""企业微信回调消息加解密工具（对齐 ``wecom/wecom.crypto.ts``）。

AES-256-CBC + PKCS7 + SHA1 签名（企微官方回调协议）。
"""

from __future__ import annotations

import base64
import hashlib
from typing import Any

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from src.core.errors import BusinessException, ErrorCode, api_error


def _decrypt_fail(detail: str) -> None:
    raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("WECOM_DECRYPT_FAILED", detail))


def sha1(text: str) -> str:
    """计算字符串的 SHA1 摘要（hex 编码）。"""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def compute_msg_signature(token: str, timestamp: str, nonce: str, encrypt: str) -> str:
    """计算企微回调签名：token/timestamp/nonce/encrypt 字典序排序后拼接取 SHA1。"""
    parts = sorted(str(item) for item in (token, timestamp, nonce, encrypt))
    return sha1("".join(parts))


def decode_aes_key(aes_key: str) -> bytes:
    """将企微后台 EncodingAESKey（43 字符，不含尾部 ``=``）解码为 32 字节密钥。"""
    text = str(aes_key or "")
    base64_text = text if text.endswith("=") else f"{text}="
    return base64.b64decode(base64_text)


def pkcs7_unpad(buf: bytes) -> bytes:
    """去除 PKCS7 填充并校验合法性。"""
    if not buf:
        _decrypt_fail("密文为空")
    pad = buf[-1]
    if pad < 1 or pad > 32 or pad > len(buf):
        _decrypt_fail("非法 PKCS7 填充")
    if any(byte != pad for byte in buf[len(buf) - pad :]):
        _decrypt_fail("PKCS7 填充字节不一致")
    return buf[: len(buf) - pad]


def decrypt_wecom(aes_key: str, cipher_text_base64: str) -> dict[str, Any]:
    """解密企微回调密文，返回 ``{"msg": 明文, "corpId": corpId}``。

    明文格式：16 字节随机 + 4 字节 big-endian msgLen + 消息正文 + corpId。
    """
    key = decode_aes_key(aes_key)
    iv = key[:16]
    try:
        cipher_bytes = base64.b64decode(cipher_text_base64)
    except Exception:  # noqa: BLE001
        _decrypt_fail("密文 Base64 解码失败")
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    plain = decryptor.update(cipher_bytes) + decryptor.finalize()
    unpadded = pkcs7_unpad(plain)
    if len(unpadded) < 20:
        _decrypt_fail("解密明文长度不足")
    msg_len = int.from_bytes(unpadded[16:20], "big")
    msg_start, msg_end = 20, 20 + msg_len
    if msg_end > len(unpadded):
        _decrypt_fail("消息长度字段超出明文范围")
    return {
        "msg": unpadded[msg_start:msg_end].decode("utf-8", errors="replace"),
        "corpId": unpadded[msg_end:].decode("utf-8", errors="replace"),
    }


__all__ = ["compute_msg_signature", "decode_aes_key", "decrypt_wecom", "pkcs7_unpad", "sha1"]
