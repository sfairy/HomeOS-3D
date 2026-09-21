"""首次初始化的访问守卫。

``POST /api/v1/setup/admin`` 刻意不要求身份，唯一的闸门是「管理员账号文件是否已存在」，
因此尚未初始化的实例是**先到先得**的：一次 POST 就能创建管理员并当场下发会话 Cookie。

- 本机直连放行（TCP 对端是 loopback、``Host`` 主机名也是 loopback，且请求没带任何转发头；带了
  转发头说明前面还有代理，对端地址不再代表真实来源；``Host`` 那一条挡的是**同机反代** —— 它既
  不补 ``X-Forwarded-*``，对端又是 127.0.0.1，只看前两条时与本机运维完全一样）；
- 其它来源必须带对引导密钥（APP_SETUP_TOKEN 或首次启动生成的随机串，0600 落盘并打印到
  标准错误，初始化成功后立即删除）；失败与成功都写审计，失败计入限流。

刻意不把密钥写进全局日志正文：全局日志可被导出，而这是一枚能换取管理员身份的凭证。
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sys
from pathlib import Path

from fastapi import HTTPException, Request, status

from .http_security import FORWARDED_HEADERS, _peer_host, is_direct_local

#: 生成密钥的长度（``token_urlsafe(32)`` 约 43 个字符）。
TOKEN_BYTES = 32
#: 读回既有文件时的最短长度：明显被截断/写脏的文件不当作有效凭证，重新生成。
MIN_TOKEN_LENGTH = 16
#: 标记文件：它的存在（且指纹对得上）说明同目录的 ``setup-token`` 是本服务生成的。
#: 密钥文件因此保持「一行就是一枚密钥」：README 教的是 cat 它，多一行注释会让照文档复制的
#: 人拿到「注释 + 密钥」并在表单里粘出一个 403。出处另放一个文件。
GENERATED_MARKER_FILE = 'setup-token.generated'
#: 标记文件里那行指纹的前缀。
FINGERPRINT_PREFIX = 'sha256:'
# 「本机直连」的判据与转发头清单统一放在 http_security，健康探针与这里用同一份判断。


def token_fingerprint(token: str) -> str:
    """令牌的短指纹：用来回答「盘上这份还是不是我们当初写下的那一枚」。

    取 16 位十六进制就够：这不是口令学保护（密钥本身高熵），只是出处比对依据 —— 少了它，
    一份被运维替换过的密钥文件会因留着上一轮标记而被当成自己生成的，初始化成功时删掉。
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()[:16]


def read_token_file(text: str) -> str:
    """从密钥文件内容里取密钥：跳过 ``#`` 开头的注释行与空行。

    自动生成的那份只有一行；运维预置的偶尔会带自己的注释。两种都要读得出来，所以按
    「第一个非注释、非空行」取值，而不是整文件 strip。
    """
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            return stripped
    return ''


def _looks_like_forwarded(request: Request) -> bool:
    """请求是否经过代理（用于在拒绝对话里给出更准确的提示）。"""
    return any(request.headers.get(name) for name in FORWARDED_HEADERS)


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
        """密钥来源，用于日志文案：``env`` / ``file`` / ``generated`` / ``none``。"""
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

        证据 = 标记文件里的指纹与该令牌的指纹一致。只看「标记文件在不在」不够：本服务生成过
        一枚之后，运维完全可能把它换成自己的，此时标记文件还在而那份密钥是运维的。
        读不到就当「不是我们的」：宁可留下一份没用的文件，也不删掉可能是运维预置的恢复手段。
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

        优先环境变量（运维自己指定，跨重启稳定）；其次读回既有文件（初始化窗口被
        中断后重启时不该换密钥，否则运维手上那份就作废了）；最后才生成新的。
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
                # 运维预置的那份一旦被当成自己生成的，初始化成功后就会被 consume() 删掉。
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

        只删**自动生成**的那份文件；APP_SETUP_TOKEN 由部署方持有、运维预置的文件是部署方
        留给自己的恢复手段，两者本类都不越权处理（端点本身在初始化完成后也会关闭）。
        判据是标记文件里的指纹。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
                # 标记最后删：万一删密钥文件失败，标记还留着，下次启动的 discard_file
                # 便仍认得出这枚残留在盘上的死凭证是我们自己写的。
                self.marker_path.unlink(missing_ok=True)
            except OSError:
                # 删不掉不该让「已经初始化成功」变成失败：闸门已经关上，这份文件最多是一枚死凭证。
                self.log('warning', '初始化完成，但未能删除引导密钥文件，请手动检查')
        self._token = ''
        self._generated = False

    def discard_file(self) -> None:
        """删除**本服务自动生成**的残留密钥文件。

        调用点是「实例已经初始化」：盘上的 setup-token 可能是上次未完成窗口留下的自动生成
        文件，也可能是运维**预置**的恢复手段 —— 后者删掉等于掐断后路。以标记文件里的指纹为准，
        对得上才删。
        """
        try:
            if not self.path.is_file():
                return None
            on_disk = read_token_file(self.path.read_text(encoding='utf-8'))
            if not self._is_ours(on_disk):
                self.log('warning', '检测到预置的引导密钥文件（不是本服务生成的），已保留')
                return None
            self.path.unlink()
            # 标记跟着一起走：留着它只会让下一个人对着一个来历不明的文件猜。
            self.marker_path.unlink(missing_ok=True)
        except (OSError, UnicodeError):
            pass

    def authorize(self, request: Request, setup_token: str = '') -> None:
        """校验本次初始化请求；无权限抛 403，超限抛 429。
        成功不写「授权通过」之外的任何东西；失败会 record_failure 并写审计。
        """
        limiter = getattr(request.app.state, 'login_limiter', None)
        host = _peer_host(request) or 'unknown'
        limiter_key = f'setup:{host}'

        if limiter is not None and limiter.blocked(limiter_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail='初始化尝试次数过多，请稍后再试。',
                # 剩余等待时间而非整段封禁时长：回总时长会让客户端白等已经过去的那一段。
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
        except Exception:  # noqa: BLE001 - 审计失败不该改变接口结论
            pass


def announce_setup_window(state: str, guard: SetupGuard) -> None:
    """把「实例尚未初始化」这件事连同引导密钥打印到启动日志。

    走 stderr：容器日志会收，且不依赖全局日志是否已经被写坏。密钥本身只出现在这里
    与 0600 的文件里，不进全局日志正文。
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
