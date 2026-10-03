from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class CredentialCipherError(RuntimeError):
    pass

class CredentialCipher:

    def __init__(self, key_path: Path) -> None:
        self.key_path = key_path

    def _load_or_create_key(self) -> bytes:
        # 目录 0700：密钥文件与数据目录同卷存放，不应对其它账号可读。
        self.key_path.parent.mkdir(parents = True, exist_ok = True, mode = 0o700)
        # chmod 只是加固：某些文件系统（挂载的只读卷、容器的 overlay）不支持它，
        # 失败不该阻断启动，mkdir 的 mode 已经给出 0700。
        try:
            os.chmod(self.key_path.parent, 0o700)
        except OSError:
            pass
        if self.key_path.exists():
            key = self.key_path.read_bytes().strip()
            if not key:
                raise CredentialCipherError('凭证密钥文件为空。')
            return key
        # O_EXCL：两个进程同时首启时只有一个能创建密钥，另一个走 exists 分支读同一份。
        key = Fernet.generate_key()
        descriptor = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as key_file:
            key_file.write(key + b'\n')
        return key

    def encrypt(self, plaintext: str) -> str:
        if not plaintext:
            raise CredentialCipherError('Home Assistant Token 不能为空。')
        return Fernet(self._load_or_create_key()).encrypt(plaintext.encode('utf-8')).decode('ascii')

    def decrypt(self, ciphertext: str) -> str:
        try:
            return Fernet(self._load_or_create_key()).decrypt(ciphertext.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise CredentialCipherError('无法解密 Home Assistant 凭证。') from error
