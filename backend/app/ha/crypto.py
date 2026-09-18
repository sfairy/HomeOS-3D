"""Home Assistant 长期访问令牌的加密存储。

HA 的长期访问令牌等价于账号密码，明文入库等于把家里所有设备交出去，
因此这里用 Fernet（对称加密 + 完整性校验）把令牌加密后再落库，密钥单独
放在 credential_key_path 指向的文件里，权限 0600，且与数据库分离保存。

密钥文件的建立是「惰性 + 竞态安全」的：第一次加密时才生成，多个进程同时
首次启动时靠 O_EXCL 抢锁，抢输的一方退化为读取对方写好的密钥 —— 这段逻辑
放在 ``..secret_key_file`` 里，与授权侧的 SecretCipher 共用一份实现。
"""
from __future__ import annotations
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

from ..secret_key_file import load_or_create_secret_key


class CredentialCipherError(RuntimeError):
    """凭据加解密失败。

    统一用同一异常类型对外抛出，调用方（连接器服务 / API 层）只需把它
    翻译成面向用户的中文提示，不必区分是密钥损坏、密文被篡改还是令牌为空。
    """
    pass


class CredentialCipher:
    """长期访问令牌的加解密器；密钥文件按需生成并复用。"""

    def __init__(self, key_path: Path) -> None:
        """只记录密钥文件路径，真正的读写推迟到第一次加解密时。"""
        self.key_path = key_path

    def _load_or_create_key(self) -> bytes:
        """取密钥文件里的 Fernet 密钥；进程内只碰一次文件（B8）。

        目录权限 0700、文件 O_EXCL + 0600 的原子创建与「只对并发抢占重试」
        都在 ``load_or_create_secret_key`` 里；这里只负责把失败翻译成
        CredentialCipherError。该入口自带进程内缓存：HA 长期令牌的解密落在每个
        用到 HA 的请求上，而密钥文件在部署生命周期内不变，不必每次都重新读盘。

        返回:
            Fernet 格式的密钥字节（URL 安全 base64，44 字节含换行）。

        异常:
            CredentialCipherError: 密钥文件存在但内容为空，或密钥文件/目录不可写。
        """
        return load_or_create_secret_key(
            self.key_path,
            error_factory=CredentialCipherError,
            empty_message='凭证密钥文件为空。',
        )

    def encrypt(self, plaintext: str) -> str:
        """加密令牌并返回可直接入库的 ASCII 字符串。

        Fernet 密文自带时间戳与 HMAC，密文被改动会在解密时暴露，
        因此字符串列（而非 BLOB）存储即可，也便于排查数据问题。

        异常:
            CredentialCipherError: 明文为空（空令牌没有存储意义，提前拦下）。
        """
        if not plaintext:
            raise CredentialCipherError('Home Assistant Token 不能为空。')
        return Fernet(self._load_or_create_key()).encrypt(plaintext.encode('utf-8')).decode('ascii')

    def decrypt(self, ciphertext: str) -> str:
        """解出明文令牌。

        异常:
            CredentialCipherError: 密文被篡改、密钥不匹配，或密文不是合法 ASCII/UTF-8
                （例如换了密钥文件、手工改过数据库）。
        """
        try:
            return Fernet(self._load_or_create_key()).decrypt(ciphertext.encode('ascii')).decode('utf-8')
        except (InvalidToken, UnicodeError, ValueError) as error:
            raise CredentialCipherError('无法解密 Home Assistant 凭证。') from error
