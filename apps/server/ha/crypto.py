"""Home Assistant 长期访问令牌的加密存储。
"""
from __future__ import annotations
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

from ..security.secret_key_file import load_or_create_secret_key


class CredentialCipherError(RuntimeError):
    """凭据加解密失败。
    """
    pass


class CredentialCipher:
    """长期访问令牌的加解密器；密钥文件按需生成并复用。"""

    def __init__(self, key_path: Path) -> None:
        """只记录密钥文件路径，真正的读写推迟到第一次加解密时。"""
        self.key_path = key_path

    def _load_or_create_key(self) -> bytes:
        """取密钥文件里的 Fernet 密钥；进程内只碰一次文件。
        """
        return load_or_create_secret_key(
            self.key_path,
            error_factory=CredentialCipherError,
            empty_message='凭证密钥文件为空。',
        )

    def encrypt(self, plaintext: str) -> str:
        """加密令牌并返回可直接入库的 ASCII 字符串。
        """
        if not plaintext:
            raise CredentialCipherError('Home Assistant Token 不能为空。')
        return Fernet(self._load_or_create_key()).encrypt(plaintext.encode('utf-8')).decode('ascii')

    def decrypt(self, ciphertext: str) -> str:
        """解出明文令牌。
        """
        try:
            return Fernet(self._load_or_create_key()).decrypt(ciphertext.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise CredentialCipherError('无法解密 Home Assistant 凭证。') from error
