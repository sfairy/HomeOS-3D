"""首次初始化的访问守卫。
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sys
from pathlib import Path

from fastapi import HTTPException, Request, status

from .http_security import _peer_host, forwarded_headers_present, is_direct_local

#: 生成密钥的长度（``token_urlsafe(32)`` 约 43 个字符）。
TOKEN_BYTES = 32
#: 读回既有文件时的最短长度：明显被截断/写脏的文件不当作有效凭证，重新生成。
MIN_TOKEN_LENGTH = 16
#: 标记文件：它的存在（且指纹对得上）说明同目录的 ``setup-token`` 是本服务生成的。
GENERATED_MARKER_FILE = 'setup-token.generated'
#: 标记文件里那行指纹的前缀。
FINGERPRINT_PREFIX = 'sha256:'
# 「本机直连」的判据与转发头清单统一放在 http_security，健康探针与这里用同一份判断。


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()[:16]


def read_token_file(text: str) -> str:
    """从密钥文件内容里取密钥：跳过 ``#`` 开头的注释行与空行。
    """
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            return stripped
    return ''


def _looks_like_forwarded(request: Request) -> bool:
    """请求是否经过代理（用于在拒绝对话里给出更准确的提示）。
    """
    return forwarded_headers_present(request)


class SetupGuard:
    """首次初始化窗口的守卫：本机放行 + 远程需引导密钥 + 限流。"""

    def __init__(
        self,
        data_dir: Path,
        configured_token: str = '',
        *,
        event_log=None,
    ) -> None:
        """记录密钥文件位置与（可选的）环境变量密钥。"""
        self.path = Path(data_dir) / 'setup-token'
        self.marker_path = Path(data_dir) / GENERATED_MARKER_FILE
        self._configured = (configured_token or '').strip()
        self._token = ''
        self._generated = False
        self._event_log = event_log

    @property
    def token(self) -> str:
        """当前生效的引导密钥；未调用 :meth:`ensure_token` 时为空串。"""
        return self._token

    @property
    def generated(self) -> bool:
        """密钥是否由本类生成（生成的那份可以、也应该在初始化后被删除）。"""
        return self._generated

    @property
    def source(self) -> str:
        if self._configured:
            return 'env'
        if self._token and not self._generated:
            return 'file'
        if self._generated:
            return 'generated'
        return 'none'

    def _fingerprint_on_disk(self) -> str:
        """标记文件里记下的指纹；没有标记文件（或读不到）就返回空串。"""
        try:
            text = self.marker_path.read_text(encoding='utf-8')
        except (OSError, UnicodeError):
            return ''
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(FINGERPRINT_PREFIX):
                return stripped[len(FINGERPRINT_PREFIX):].strip()
        return ''

    def _is_ours(self, token: str) -> bool:
        """盘上这枚令牌是否**有证据**说明是本服务生成的。
        """
        fingerprint = self._fingerprint_on_disk()
        return bool(fingerprint) and fingerprint == token_fingerprint(token)

    def _mark_generated(self, token: str) -> None:
        """写下「这份令牌是我们生成的」这个事实（连同指纹）。"""
        marker = (
            f'# 本文件说明同目录的 {self.path.name} 由本服务自动生成，'
            f'初始化完成或实例已初始化时会被清理。\n'
            f'# 删掉本文件（或换成另一枚密钥）会让那份密钥被视为运维预置而保留。\n'
            f'{FINGERPRINT_PREFIX}{token_fingerprint(token)}\n'
        )
        descriptor = os.open(self.marker_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(marker)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(self.marker_path, 0o600)

    def ensure_token(self) -> str:
        """确定本次初始化窗口的引导密钥；必要时生成并落盘。
        """
        if self._configured:
            self._token = self._configured
            self._generated = False
            return self._token

        if self.path.is_file():
            try:
                existing = read_token_file(self.path.read_text(encoding='utf-8'))
            except (OSError, UnicodeError):
                existing = ''
            if len(existing) >= MIN_TOKEN_LENGTH:
                self._token = existing
                # 「是不是我们生成的」由标记文件里的指纹决定，而不是由「文件存在」决定：
                self._generated = self._is_ours(existing)
                return self._token

        token = secrets.token_urlsafe(TOKEN_BYTES)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # O_CREAT|O_TRUNC + 0o600：创建瞬间就是私有权限，不留「先生成后 chmod」的窗口。
        descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            # 密钥文件就是「一行一枚密钥」：README 教的是 cat 它，多一行都是给运维添乱。
            output.write(token + '\n')
            output.flush()
            os.fsync(output.fileno())
        os.chmod(self.path, 0o600)
        self._mark_generated(token)
        self._token = token
        self._generated = True
        return token

    def consume(self) -> None:
        """初始化成功后作废引导密钥。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
                # 标记最后删：万一删密钥文件失败，标记还留着，下次启动的 discard_file
                self.marker_path.unlink(missing_ok=True)
            except OSError:
                # 删不掉不该让「已经初始化成功」变成失败：闸门已经关上，这份文件最多是一枚死凭证。
                self.warn_durable('初始化完成，但未能删除引导密钥文件，请手动检查')
        self._token = ''
        self._generated = False

    def discard_file(self) -> None:
        """删除**本服务自动生成**的残留密钥文件。
        """
        try:
            if not self.path.is_file():
                return
            on_disk = read_token_file(self.path.read_text(encoding='utf-8'))
            if not self._is_ours(on_disk):
                self.warn_durable('检测到预置的引导密钥文件（不是本服务生成的），已保留')
                return
            self.path.unlink()
            # 标记跟着一起走：留着它只会让下一个人对着一个来历不明的文件猜。
            self.marker_path.unlink(missing_ok=True)
        except (OSError, UnicodeError):
            pass

    def authorize(self, request: Request, setup_token: str = '') -> None:
        """校验本次初始化请求；无权限抛 403，超限抛 429。
        """
        limiter = getattr(request.app.state, 'login_limiter', None)
        host = _peer_host(request) or 'unknown'
        limiter_key = f'setup:{host}'

        if limiter is not None and limiter.blocked(limiter_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail='初始化尝试次数过多，请稍后再试。',
                headers={'Retry-After': str(limiter.retry_after(limiter_key))},
            )

        if is_direct_local(request):
            return

        supplied = (setup_token or request.headers.get('x-setup-token') or '').strip()
        if self._token and supplied and secrets.compare_digest(supplied, self._token):
            return

        if limiter is not None:
            limiter.record_failure(limiter_key)
        self.log(
            'warning',
            '拒绝了未带正确引导密钥的初始化请求',
            context={
                'host': host,
                'host_header': request.headers.get('host', ''),
                'forwarded': _looks_like_forwarded(request),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                '首次设置需要引导密钥。请在服务启动日志（或容器日志）中查找 setup token，'
                '也可以用 APP_SETUP_TOKEN 指定一份后重启；'
                '用 localhost / 127.0.0.1 从本机访问则无需填写。'
            ),
        )

    def log(self, level: str, message: str, *, context: dict | None = None) -> None:
        """写全局日志；日志不可用时不掩盖真正要返回的 4xx。"""
        if self._event_log is None:
            return
        try:
            self._event_log.append(level, '系统后台', '账号', message, context=context or {})
        except Exception:
            pass

    def warn_durable(self, message: str) -> None:
        """磁盘副作用的警告：同时写 stderr 与全局日志。
        """
        try:
            sys.stderr.write(f'[setup] {message}\n')
            sys.stderr.flush()
        except OSError:
            pass
        self.log('warning', message)


def announce_setup_window(state: str, guard: SetupGuard) -> None:
    """把「实例尚未初始化」这件事连同引导密钥打印到启动日志。
    """
    guard.ensure_token()
    location = 'APP_SETUP_TOKEN' if guard.source == 'env' else str(guard.path)
    reason = '库中没有任何管理员账号' if state == 'empty' else '管理员账号文件已被删除，等待重新设置'
    lines = [
        '',
        '=' * 72,
        f'HomeOS 尚未初始化（{reason}），完成首次设置后本窗口自动关闭。',
        '首次设置需要一个引导密钥：',
        f'  密钥来源: {location}',
        f'  密钥内容: {guard.token}',
        '  使用方式: 打开 /setup 页面填入「引导密钥」一栏；',
        '            或在 POST /api/v1/setup/admin 的请求体里加 "setupToken"（也可用 X-Setup-Token 头）。',
        '  用 localhost / 127.0.0.1 从本机（未经代理）访问时无需填写。',
        '=' * 72,
        '',
    ]
    # stderr 不可用（已关闭 / 重定向到坏管道）时放弃这次提示，启动流程照常继续。
    try:
        sys.stderr.write('\n'.join(lines) + '\n')
        sys.stderr.flush()
    except OSError:
        pass
    guard.log('warning', '实例尚未初始化：首次设置需要引导密钥（见启动日志）')
