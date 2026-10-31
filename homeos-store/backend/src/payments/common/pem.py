"""支付宝 / 微信支付共用的 PEM 解析：去包装、私钥、公钥。
"""
from __future__ import annotations

import re
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509 import load_pem_x509_certificate


def strip_wrapping(raw: str) -> str:
    """把环境变量里常见的写法归一：字面量换行转义、外层引号、首尾空白。"""
    text = (raw or "").strip()
    if "BEGIN" in text:
        if "\\\\n" in text:
            text = text.replace("\\\\n", "\n")
        if "\\n" in text:
            text = text.replace("\\n", "\n")
    return text.strip().strip('"').strip("'")


def _wrap(body: str, header: str) -> str:
    compact = re.sub(r"\s+", "", body)
    chunks = [compact[i : i + 64] for i in range(0, len(compact), 64)]
    return f"-----BEGIN {header}-----\n" + "\n".join(chunks) + f"\n-----END {header}-----"


def pem_candidates(raw: str, *headers: str) -> tuple[str, ...]:
    """「PEM 全文」与「裸 base64 正文」都变成候选 PEM。"""
    text = strip_wrapping(raw)
    if not text:
        return ()
    if "BEGIN" in text:
        return (text,)
    return tuple(_wrap(text, header) for header in headers)


@lru_cache(maxsize=16)
def load_private_key(raw: str) -> rsa.RSAPrivateKey:
    """解析 RSA 私钥（PKCS#8 或 PKCS#1）。失败抛 ``ValueError``。"""
    for candidate in pem_candidates(raw, "PRIVATE KEY", "RSA PRIVATE KEY"):
        try:
            key = serialization.load_pem_private_key(
                candidate.encode("utf-8"), password=None
            )
        except (ValueError, TypeError):
            continue
        if isinstance(key, rsa.RSAPrivateKey):
            return key
    raise ValueError("unable to parse RSA private key")


@lru_cache(maxsize=16)
def load_public_key(raw: str, allow_certificate: bool = False) -> rsa.RSAPublicKey:
    """解析 RSA 公钥；``allow_certificate`` 时也接受 PEM 证书里的公钥。失败抛 ``ValueError``。"""
    text = strip_wrapping(raw)
    if allow_certificate and "BEGIN CERTIFICATE" in text:
        try:
            certificate = load_pem_x509_certificate(text.encode("utf-8"))
            public = certificate.public_key()
        except (ValueError, TypeError) as error:
            raise ValueError(f"unable to parse certificate: {error}") from error
        if isinstance(public, rsa.RSAPublicKey):
            return public
        raise ValueError("certificate public key is not RSA")
    for candidate in pem_candidates(text, "PUBLIC KEY"):
        try:
            public = serialization.load_pem_public_key(candidate.encode("utf-8"))
        except (ValueError, TypeError):
            continue
        if isinstance(public, rsa.RSAPublicKey):
            return public
    raise ValueError("unable to parse RSA public key")


__all__ = [
    "load_private_key",
    "load_public_key",
    "pem_candidates",
    "strip_wrapping",
]
