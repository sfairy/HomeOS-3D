"""首次初始化的访问守卫。

背景（安全审计发现）：``POST /api/v1/setup/admin`` 刻意不要求身份，唯一的闸门是
「管理员账号文件是否已存在」。于是一台尚未初始化的实例是**先到先得**的：

1. ``GET /api/v1/setup/status`` 未认证即可确认 ``initialized=false``；
2. ``POST /api/v1/setup/admin`` 一次就创建管理员、清空旧会话，并**当场下发会话
   Cookie**（实测返回 201 + ``role=admin``）；
3. 自此攻击者可以写 Home Assistant 连接（连同长期令牌）、配中控设备、导出日志。

当时没有 loopback 限制、没有引导密钥、没有限流、也没有审计记录。

本模块给出的策略：

- **本机直连放行**：能坐在机器前的人本来就拥有这台机器。判断标准是「TCP 对端是
  loopback」且**请求没带任何转发头** —— 带 ``X-Forwarded-For`` / ``Forwarded``
  说明前面还有代理，对端地址不再代表真实来源，此时不再按本机放行（否则同机反代会
  把「先到先得」原样暴露到公网）。
- **其它来源必须带对引导密钥**：``APP_SETUP_TOKEN``，或首次启动时自动生成的
  32 字节随机串。生成的那份以 0600 落到 ``data_dir/setup-token`` 并打印到标准错误
  （容器日志可见），初始化成功后立即删除 —— 一次性凭证。
- 失败与成功都写审计；失败还会计入限流（与登录共用同一个进程内限流器）。

刻意**不**把密钥写进全局日志正文：全局日志可被导出，而这是一枚能换取管理员身份的
凭证。落盘 + stderr 已经足够运维取用。
"""

from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

from fastapi import HTTPException, Request, status

#: 生成密钥的长度（``token_urlsafe(32)`` 约 43 个字符）。
TOKEN_BYTES = 32
#: 读回既有文件时的最短长度：明显被截断/写脏的文件不当作有效凭证，重新生成。
MIN_TOKEN_LENGTH = 16

#: 判定「本机直连」时可信的对端地址。
LOOPBACK_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})
#: 出现任一转发头即视为「前面还有代理」，此时不再按本机放行。
FORWARDED_HEADERS = ('x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'forwarded')


def _peer_host(request: Request) -> str:
    """TCP 对端地址（小写、去空白）；拿不到时返回空串。"""
    client = getattr(request, 'client', None)
    return str(getattr(client, 'host', '') or '').strip().lower()


def _is_direct_local(request: Request) -> bool:
    """是否是「本机直连」：loopback 对端，且没有任何转发头。"""
    if any(request.headers.get(name) for name in FORWARDED_HEADERS):
        return False
    return _peer_host(request) in LOOPBACK_HOSTS


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
        """记录密钥文件位置与（可选的）环境变量密钥。

        参数:
            data_dir: 数据目录；密钥文件固定为其中的 ``setup-token``。
            configured_token: ``APP_SETUP_TOKEN`` 的值，为空表示由本类生成。
            event_log: 可选的全局日志，用于记录初始化窗口的开合与授权失败。
        """
        self.path = Path(data_dir) / 'setup-token'
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
                existing = self.path.read_text(encoding='utf-8').strip()
            except (OSError, UnicodeError):
                existing = ''
            if len(existing) >= MIN_TOKEN_LENGTH:
                self._token = existing
                self._generated = True
                return self._token

        token = secrets.token_urlsafe(TOKEN_BYTES)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # O_CREAT|O_TRUNC + 0o600：创建瞬间就是私有权限，不留「先生成后 chmod」的窗口。
        descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(token + '\n')
            output.flush()
            os.fsync(output.fileno())
        os.chmod(self.path, 0o600)
        self._token = token
        self._generated = True
        return token

    def consume(self) -> None:
        """初始化成功后作废引导密钥。

        只删自动生成的那份文件；``APP_SETUP_TOKEN`` 由部署方持有，本类不越权处理
        （端点本身在初始化完成后也会关闭，环境变量那份无法再被使用）。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                # 删不掉不该让「已经初始化成功」变成失败：端点的 initialized 闸门
                # 已经关上了，这份文件最多是一枚死凭证。
                self.log('warning', '初始化完成，但未能删除引导密钥文件，请手动检查')
        self._token = ''
        self._generated = False

    def discard_file(self) -> None:
        """删除残留的引导密钥文件（已初始化的实例上它没有任何用途）。"""
        try:
            if self.path.is_file():
                self.path.unlink()
        except OSError:
            pass

    def authorize(self, request: Request, setup_token: str = '') -> None:
        """校验本次初始化请求；无权限抛 403，超限抛 429。

        参数:
            request: 当前请求（用于判定对端与限流键）。
            setup_token: 请求体里带的引导密钥（也接受 ``X-Setup-Token`` 头）。

        成功不写「授权通过」之外的任何东西；失败会 record_failure 并写审计。
        """
        limiter = getattr(request.app.state, 'login_limiter', None)
        host = _peer_host(request) or 'unknown'
        limiter_key = f'setup:{host}'

        if limiter is not None and limiter.blocked(limiter_key):
            # block_seconds 是 int 属性而不是方法（另一处曾把它当函数调用过）。
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail='初始化尝试次数过多，请稍后再试。',
                headers={'Retry-After': str(limiter.block_seconds)},
            )

        if _is_direct_local(request):
            return

        supplied = (setup_token or request.headers.get('x-setup-token') or '').strip()
        if self._token and supplied and secrets.compare_digest(supplied, self._token):
            return

        if limiter is not None:
            limiter.record_failure(limiter_key)
        self.log(
            'warning',
            '拒绝了未带正确引导密钥的初始化请求',
            context={'host': host, 'forwarded': _looks_like_forwarded(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                '首次设置需要引导密钥。请在服务启动日志（或容器日志）中查找 setup token，'
                '也可以用 APP_SETUP_TOKEN 指定一份后重启；从本机直接访问则无需填写。'
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
        '  从本机（loopback，且未经代理）直接访问时无需填写。',
        '=' * 72,
        '',
    ]
    try:
        sys.stderr.write('\n'.join(lines) + '\n')
        sys.stderr.flush()
    except OSError:
        pass
    guard.log('warning', '实例尚未初始化：首次设置需要引导密钥（见启动日志）')
