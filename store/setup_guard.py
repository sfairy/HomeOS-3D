"""商店首次初始化的访问守卫。

背景（安全审计发现 S1）：``POST /store/v1/setup/admin`` 刻意不要求身份（首次设置时
还没有账号可登），唯一的闸门是「库里是否已有管理员」。于是一台尚未初始化的实例是
**先到先得**的：

1. ``GET /store/v1/setup/status`` 未认证即可确认 ``initialized=false``；
2. ``POST /store/v1/setup/admin`` 一次就创建管理员，并**当场下发会话 Cookie**；
3. 自此攻击者可读订单与账号、改商品与价格、导出授权码、下发/吊销授权。

当时唯一的保护是同源中间件（``store/request_security.py`` 的
``same_origin_request``），而它在请求**没有** ``Origin``/``Referer`` 时放行 ——
``curl`` 默认就不带这两个头，所以这道闸门对脚本化攻击等于不存在。

本模块给出的策略与主应用 ``backend/app/setup_guard.py`` 同构（两边刻意各自保留一份：
store 要能单独部署，不依赖 backend 的代码；P10 会用同步测试钉住两侧的行为一致）：

- **本机直连放行**：能坐在机器前的人本来就拥有这台机器。判断标准是「TCP 对端是
  loopback」且**请求没带任何转发头** —— 带 ``X-Forwarded-For`` / ``Forwarded``
  说明前面还有代理，对端地址不再代表真实来源，此时不再按本机放行（否则同机反代会
  把「先到先得」原样暴露到公网）。
- **其它来源必须带对引导密钥**：``STORE_SETUP_TOKEN``，或首次启动时自动生成的
  32 字节随机串。生成的那份以 0600 落到 ``data_dir/setup-token`` 并打印到标准错误
  （容器日志可见），初始化成功后立即删除 —— 一次性凭证。
- 失败计入按来源的限流，避免把引导密钥当口令爆破（``hash_password`` 走 argon2，
  不设限的话这里同样是一条打满 CPU 的路径）。

刻意**不**把密钥写进全局日志正文：全局日志可被导出，而这是一枚能换取管理员身份的
凭证。落盘 + stderr 已经足够运维取用。
"""

from __future__ import annotations

import logging
import os
import secrets
import sys
from pathlib import Path

from fastapi import HTTPException, Request, status

from store.limiter import SlidingWindowLimiter
from store.request_security import forwarded_headers_present

logger = logging.getLogger("store.setup")

#: 生成密钥的长度（``token_urlsafe(32)`` 约 43 个字符）。
TOKEN_BYTES = 32
#: 读回既有文件时的最短长度：明显被截断/写脏的文件不当作有效凭证，重新生成。
MIN_TOKEN_LENGTH = 16

#: 判定「本机直连」时可信的对端地址。
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient", ""})

#: 初始化尝试的限流预算：每来源 10 次 / 15 分钟。
_SETUP_ATTEMPT_LIMIT = 10
_SETUP_ATTEMPT_WINDOW_SECONDS = 900.0


def peer_host(request: Request) -> str:
    """TCP 对端地址（小写、去空白）；拿不到时返回空串。"""
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "").strip().lower()


def is_direct_local(request: Request) -> bool:
    """是否是「本机直连」：loopback 对端，且没有任何转发头。

    与 ``store/api/store.py`` 里那套「验证码只回显给本机」的判定同源，但这里刻意
    **不**看 ``resolve_client_ip`` 的结果：首次初始化时运营还没来得及配
    ``STORE_TRUSTED_PROXIES``，此时若按「解析出的真实来源」判定，远端请求会因为
    对端是 127.0.0.1（同机反代）而被当成本机 —— 那正是要堵的洞。宁可对「同机反代
    后面的部署者」要求一次引导密钥，也不能对公网放行。
    """
    if forwarded_headers_present(request):
        return False
    return peer_host(request) in LOOPBACK_HOSTS


class SetupGuard:
    """首次初始化窗口的守卫：本机放行 + 远程需引导密钥 + 限流。"""

    def __init__(self, data_dir: Path, configured_token: str = "") -> None:
        self.path = Path(data_dir) / "setup-token"
        self._configured = (configured_token or "").strip()
        self._token = ""
        self._generated = False
        self._attempts = SlidingWindowLimiter(
            limit=_SETUP_ATTEMPT_LIMIT,
            window_seconds=_SETUP_ATTEMPT_WINDOW_SECONDS,
        )

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
            return "env"
        if self._token and not self._generated:
            return "file"
        if self._generated:
            return "generated"
        return "none"

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
                existing = self.path.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError):
                existing = ""
            if len(existing) >= MIN_TOKEN_LENGTH:
                self._token = existing
                self._generated = True
                return self._token

        token = secrets.token_urlsafe(TOKEN_BYTES)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # O_CREAT|O_TRUNC + 0o600：创建瞬间就是私有权限，不留「先生成后 chmod」的窗口。
        descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(token + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(self.path, 0o600)
        self._token = token
        self._generated = True
        return token

    def consume(self) -> None:
        """初始化成功后作废引导密钥，并清空限流计数。

        只删自动生成的那份文件；``STORE_SETUP_TOKEN`` 由部署方持有，本类不越权处理
        （端点本身在初始化完成后也会关闭，环境变量那份无法再被使用）。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                # 删不掉不该让「已经初始化成功」变成失败：端点的 initialized 闸门
                # 已经关上了，这份文件最多是一枚死凭证。
                logger.warning("初始化完成，但未能删除引导密钥文件 %s，请手动检查", self.path)
        self._token = ""
        self._generated = False
        self._attempts.reset()

    def discard_file(self) -> None:
        """删除残留的引导密钥文件（已初始化的实例上它没有任何用途）。"""
        try:
            if self.path.is_file():
                self.path.unlink()
        except OSError:
            pass

    def has_setup_privilege(self, request: Request, setup_token: str = "") -> bool:
        """本次请求是否有资格初始化（只判断，不抛错、不消耗限流配额）。

        判据与 :meth:`authorize` 完全一致：本机直连，或带了正确的引导密钥。
        刻意让两者共用这一份实现，而不是各写一套 —— 两套判据一旦漂移，结果就是
        「状态页说可以初始化，真点下去却 403」。

        ``/setup/status`` 用它决定「能不能如实回答尚未初始化」（审计 S17）。
        """
        if is_direct_local(request):
            return True
        supplied = (setup_token or request.headers.get("x-setup-token") or "").strip()
        # 常量时间比对：密钥是定长随机串，用 != 会泄漏前缀匹配长度。
        return bool(self._token and supplied and secrets.compare_digest(supplied, self._token))

    def authorize(self, request: Request, setup_token: str = "") -> None:
        """校验本次初始化请求；无权限抛 403，超限抛 429。

        参数:
            request: 当前请求（用于判定对端与限流键）。
            setup_token: 请求体里带的引导密钥（也接受 ``X-Setup-Token`` 头）。
        """
        host = peer_host(request) or "unknown"
        limiter_key = f"setup:{host}"

        if not self._attempts.allow(limiter_key):
            retry_after = max(1, int(self._attempts.retry_after(limiter_key)) or 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="初始化尝试次数过多，请稍后再试。",
                headers={"Retry-After": str(retry_after)},
            )

        if self.has_setup_privilege(request, setup_token):
            return

        logger.warning(
            "拒绝了未带正确引导密钥的初始化请求 host=%s 是否经代理=%s 已配置密钥=%s",
            host,
            forwarded_headers_present(request),
            bool(self._token),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "首次设置需要引导密钥。请在服务启动日志（或容器日志）中查找 setup token，"
                "也可以用 STORE_SETUP_TOKEN 指定一份后重启；从本机直接访问则无需填写。"
            ),
        )


def announce_setup_window(guard: SetupGuard) -> None:
    """把「实例尚未初始化」这件事连同引导密钥打印到启动日志。

    走 stderr：容器日志会收，且不依赖全局日志是否已经被写坏。密钥本身只出现在这里
    与 0600 的文件里，不进全局日志正文。
    """
    guard.ensure_token()
    location = "STORE_SETUP_TOKEN" if guard.source == "env" else str(guard.path)
    lines = [
        "",
        "=" * 72,
        "HomeOS 授权商店尚未初始化（库中没有任何管理员账号），完成首次设置后本窗口自动关闭。",
        "首次设置需要一个引导密钥：",
        f"  密钥来源: {location}",
        f"  密钥内容: {guard.token}",
        "  使用方式: 打开 /store/setup 页面填入「引导密钥」一栏；",
        "            或在 POST /store/v1/setup/admin 的请求体里加 \"setupToken\"（也可用 X-Setup-Token 头）。",
        "  从本机（loopback，且未经代理）直接访问时无需填写。",
        "=" * 72,
        "",
    ]
    try:
        sys.stderr.write("\n".join(lines) + "\n")
        sys.stderr.flush()
    except OSError:
        pass
