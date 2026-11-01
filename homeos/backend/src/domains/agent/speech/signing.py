"""音频 URL 的签名密钥。

音频 URL 不需要登录态就能播放（``<audio src>`` 带不了自定义头，也带不了 Cookie
之外的凭证），所以用「HMAC 签名 + 过期时间」自证：链接本身就是凭证，10 分钟后失效。

密钥优先级：

1. 环境变量 ``AGENT_TTS_SECRET``（多副本部署时各副本必须一致，否则 A 副本签的
   URL 到 B 副本会被判篡改）；
2. ``<data_dir>/secrets/agent_tts.key``（首次使用时 0600 原子创建）。

落盘写法与 ``ha/integration/crypto.py`` 一致：``O_CREAT | O_EXCL`` + ``0o600``，
避免并发启动时互相覆盖，也避免密钥被同机其它用户读到。
"""

from __future__ import annotations

import logging
import os
import secrets
from collections.abc import Mapping
from pathlib import Path

logger = logging.getLogger("homeos.agent.tts.signing")

#: 密钥长度（字节）。32 字节 = 256 bit，直接给 HMAC-SHA256 用
SECRET_BYTES = 32

#: 环境变量名
SECRET_ENV = "AGENT_TTS_SECRET"

#: 落盘文件名（在 ``<data_dir>/secrets/`` 下）
SECRET_FILENAME = "agent_tts.key"


class TtsSecretError(RuntimeError):
    """签名密钥不可用（目录不可写、文件损坏等）。"""


def _normalize(raw: str) -> str:
    return str(raw or "").strip()


def _read_key_file(path: Path) -> str:
    try:
        key = _normalize(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise TtsSecretError(f"读取 TTS 签名密钥失败: {exc}") from exc
    if not key:
        raise TtsSecretError("TTS 签名密钥文件为空")
    return key


def _create_key_file(path: Path) -> str:
    """原子创建密钥文件；并发下输的那一方重读赢家的内容。"""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        # 非 POSIX 或权限不足时不必致命：目录归属已经是当前用户
        logger.debug("无法收紧 TTS 密钥目录权限: %s", path.parent)
    key = secrets.token_hex(SECRET_BYTES)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        # 并发启动时另一个进程先创建了密钥：读赢家的那份，别覆盖
        logger.debug("TTS 签名密钥已存在，复用现有文件: %s", path)
        return _read_key_file(path)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(f"{key}\n")
    return key


def load_signing_secret(secrets_dir: Path | None, env: Mapping[str, str] | None = None) -> str:
    """解析签名密钥；``secrets_dir`` 为空且无环境变量时退化为进程内随机密钥。

    进程内随机密钥意味着「重启后旧 URL 全部失效」，只有在既没配环境变量、
    也没有数据目录（例如单元测试）时才走到这一步。
    """
    source = env if env is not None else os.environ
    from_env = _normalize(source.get(SECRET_ENV, ""))
    if from_env:
        return from_env
    if secrets_dir is None:
        logger.debug("TTS 未配置持久化密钥，使用进程内临时密钥")
        return secrets.token_hex(SECRET_BYTES)
    path = Path(secrets_dir) / SECRET_FILENAME
    if path.exists():
        return _read_key_file(path)
    return _create_key_file(path)


__all__ = ["SECRET_ENV", "TtsSecretError", "load_signing_secret"]
