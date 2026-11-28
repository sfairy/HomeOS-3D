"""商店首次初始化的访问守卫。
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import sys
from pathlib import Path

from fastapi import HTTPException, Request, status

from ..security.limiter import SlidingWindowLimiter
from ..security.request_security import forwarded_headers_present, resolve_client_ip

logger = logging.getLogger("src.setup")

TOKEN_BYTES = 32
MIN_TOKEN_LENGTH = 16

GENERATED_MARKER_FILE = "setup-token.generated"
FINGERPRINT_PREFIX = "sha256:"

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

#: 显式允许「本机直连免引导密钥」的环境变量。
#:
#: 默认**关闭**：``is_direct_local`` 只能证明「TCP 对端是回环」，而四层转发
#: （SSH ``-L`` / ``socat`` / 只转发的 sidecar）会让远端请求也满足这个条件，
#: 于是任何人都能在实例初始化前抢先创建第一个管理员。引导密钥是唯一无法伪造的凭据。
#: 确实只在本机使用、且能接受该风险的部署可以设为 1 换回便利。
ALLOW_LOCAL_SETUP_ENV = "STORE_ALLOW_LOCAL_SETUP"

_SETUP_ATTEMPT_LIMIT = 10
_SETUP_ATTEMPT_WINDOW_SECONDS = 900.0


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def peer_host(request: Request) -> str:
    """TCP 对端地址（小写、去空白）；拿不到时返回空串。"""
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "").strip().lower()


def host_header_name(request: Request) -> str:
    """``Host`` 头里的主机名：去端口、去 IPv6 方括号、转小写；读不到时返回空串。"""
    raw = (request.headers.get("host") or "").strip().lower()
    if not raw:
        return ""
    if raw.startswith("["):
        return raw[1:].split("]", 1)[0].strip()
    if raw.count(":") == 1:
        return raw.split(":", 1)[0].strip()
    return raw


def is_direct_local(request: Request) -> bool:
    """是否是「本机直连」：loopback 对端 + loopback ``Host`` + 没有任何转发头。

    **这只说明请求看起来来自本机，不构成身份凭据**：一个 TCP 层的转发（SSH ``-L``、
    ``socat``、只做四层转发的 sidecar）会让远端连接的 TCP 对端变成 ``127.0.0.1``，
    而转发方还能把 ``Host`` 改写成 ``localhost`` —— 此时本函数返回真，但请求其实是
    远程发起的。因此它只用来**提示**（``GET /setup/status`` 的 ``localAccess``），
    真正放行初始化还必须拿到引导密钥，除非运维显式打开
    :data:`ALLOW_LOCAL_SETUP_ENV`。
    """
    if forwarded_headers_present(request):
        return False
    if peer_host(request) not in LOOPBACK_HOSTS:
        return False
    return host_header_name(request) in LOOPBACK_HOSTS


def read_token_file(text: str) -> str:
    """从密钥文件内容里取密钥：跳过 ``#`` 开头的注释行与空行。
    """
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            return stripped
    return ""


class SetupGuard:
    """首次初始化窗口的守卫：本机放行 + 远程需引导密钥 + 限流。"""

    def __init__(self, data_dir: Path, configured_token: str = "", *, allow_local_setup: bool = False) -> None:
        self.path = Path(data_dir) / "setup-token"
        self.marker_path = Path(data_dir) / GENERATED_MARKER_FILE
        self._configured = (configured_token or "").strip()
        #: 是否允许「本机直连免密钥」（见 :data:`ALLOW_LOCAL_SETUP_ENV`）。默认关闭。
        self._allow_local_setup = bool(allow_local_setup)
        self._token = ""
        self._generated = False
        self._attempts = SlidingWindowLimiter(
            limit=_SETUP_ATTEMPT_LIMIT,
            window_seconds=_SETUP_ATTEMPT_WINDOW_SECONDS,
        )

    @property
    def allow_local_setup(self) -> bool:
        return self._allow_local_setup

    def local_access(self, request: Request) -> bool:
        """本机直连**且**运维允许免密钥时，才算「本次访问无需引导密钥」。

        ``is_direct_local`` 本身不是凭据（四层转发可伪造），所以状态接口也用它判 ——
        否则界面会告诉用户「不用填密钥」，而 POST 却要密钥，两边自相矛盾。
        """
        return self._allow_local_setup and is_direct_local(request)

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
            return "env"
        if self._token and not self._generated:
            return "file"
        if self._generated:
            return "generated"
        return "none"

    def _fingerprint_on_disk(self) -> str:
        """标记文件里记下的指纹；没有标记文件（或读不到）就返回空串。"""
        try:
            text = self.marker_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return ""
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(FINGERPRINT_PREFIX):
                return stripped[len(FINGERPRINT_PREFIX):].strip()
        return ""

    def _is_ours(self, token: str) -> bool:
        """盘上这枚令牌是否**有证据**说明是本商店生成的。

        比较用 :func:`secrets.compare_digest`：这是「令牌派生指纹」的等值判断，普通 ``==``
        会按首个不同字节提前返回，给本地攻击者留下逐字节试探的时间侧信道（成本很低，
        没理由留着）。
        """
        fingerprint = self._fingerprint_on_disk()
        if not fingerprint:
            return False
        return secrets.compare_digest(fingerprint, token_fingerprint(token))

    def _mark_generated(self, token: str) -> None:
        """写下「这份令牌是我们生成的」这个事实（连同指纹）。"""
        marker = (
            f"# 本文件说明同目录的 {self.path.name} 由本商店自动生成，"
            f"初始化完成或实例已初始化时会被清理。\n"
            f"# 删掉本文件（或换成另一枚密钥）会让那份密钥被视为运营预置而保留。\n"
            f"{FINGERPRINT_PREFIX}{token_fingerprint(token)}\n"
        )
        descriptor = os.open(self.marker_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
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
                existing = read_token_file(self.path.read_text(encoding="utf-8"))
            except (OSError, UnicodeError):
                existing = ""
            if len(existing) >= MIN_TOKEN_LENGTH:
                self._token = existing
                self._generated = self._is_ours(existing)
                return self._token

        token = secrets.token_urlsafe(TOKEN_BYTES)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(token + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(self.path, 0o600)
        self._mark_generated(token)
        self._token = token
        self._generated = True
        return token

    def consume(self) -> None:
        """初始化成功后作废引导密钥，并清空限流计数。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
                self.marker_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("初始化完成，但未能删除引导密钥文件 %s，请手动检查", self.path)
        self._token = ""
        self._generated = False
        self._attempts.reset()

    def discard_file(self) -> None:
        """删除**本商店自动生成**的残留密钥文件。
        """
        try:
            if not self.path.is_file():
                return
            on_disk = read_token_file(self.path.read_text(encoding="utf-8"))
            if not self._is_ours(on_disk):
                logger.warning("检测到预置的引导密钥文件（不是本商店生成的），已保留：%s", self.path)
                return
            self.path.unlink()
            self.marker_path.unlink(missing_ok=True)
        except (OSError, UnicodeError):
            pass

    def has_setup_privilege(self, request: Request, setup_token: str = "") -> bool:
        """本次请求是否有资格初始化（只判断，不抛错、不消耗限流配额）。

        本机直连只在运维**显式**打开 ``STORE_ALLOW_LOCAL_SETUP`` 时放行（见
        :data:`ALLOW_LOCAL_SETUP_ENV` 的说明）：回环对端证明不了「请求来自本机」，
        四层转发也能满足它。
        """
        if self.local_access(request):
            return True
        supplied = (setup_token or request.headers.get("x-setup-token") or "").strip()
        return bool(self._token and supplied and secrets.compare_digest(supplied, self._token))

    def authorize(self, request: Request, setup_token: str = "") -> None:
        """校验本次初始化请求；无权限抛 403，超限抛 429。

        有权限的请求**不消耗**限流配额：否则一次远程爆破（或共享 NAT 出口）会把
        ``setup:global`` 打满，合法管理员拿着正确密钥也只能等窗口过期。限流只统计
        「未带正确密钥」的尝试。
        """
        # 先判权限：本机直连 / 正确密钥都不该被算作「尝试」。
        if self.has_setup_privilege(request, setup_token):
            return

        address = resolve_client_ip(request)
        host = address.ip or "unknown"
        limiter_key = f"setup:{host}" if address.per_client else "setup:global"

        if not self._attempts.allow(limiter_key):
            retry_after = max(1, int(self._attempts.retry_after(limiter_key)) or 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="初始化尝试次数过多，请稍后再试。",
                headers={"Retry-After": str(retry_after)},
            )

        logger.warning(
            "拒绝了未带正确引导密钥的初始化请求 对端=%s 经代理=%s Host=%s 有转发头=%s 已配置密钥=%s 密钥位置=%s",
            host,
            address.via_proxy,
            host_header_name(request) or "(缺失)",
            forwarded_headers_present(request),
            bool(self._token),
            # 被拒的时候正好是「密钥去哪找」的问题最需要答案的时刻，所以顺手指出位置
            # （只给位置，不给密钥本身）。
            "STORE_SETUP_TOKEN" if self.source == "env" else str(self.path),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "首次设置需要引导密钥。请在服务启动日志（或容器日志）中查找 setup token，"
                "也可以用 STORE_SETUP_TOKEN 指定一份后重启。"
            ),
        )


def announce_setup_window(guard: SetupGuard) -> None:
    """把「实例尚未初始化」这件事连同引导密钥打印到启动日志。

    横幅**只打印一次**（随启动），而 ``docker logs`` 与编排面板都只显示尾部 —— 所以除了
    给人看的「密钥内容」，还打一行 ``SETUP-TOKEN=<密钥>``：它只在整份日志里出现一次，
    且不含中文，``docker logs homeos-store 2>&1 | grep -m1 SETUP-TOKEN=`` 就能稳定取到
    （访问日志的成功请求已由 ``security/access_log.py`` 收起，横幅不会几秒就被顶走）。
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
        f"  SETUP-TOKEN={guard.token}",
        "  （上两行是同一枚密钥；只想机器取用时 grep 这一行：",
        "    docker logs homeos-store 2>&1 | grep -m1 SETUP-TOKEN=）",
        "  使用方式: 打开 /store/setup 页面填入「引导密钥」一栏；",
        "            或在 POST /store/v1/setup/admin 的请求体里加 \"setupToken\"（也可用 X-Setup-Token 头）。",
    ]
    if guard.allow_local_setup:
        lines.append("  已开启 STORE_ALLOW_LOCAL_SETUP=1：用 localhost / 127.0.0.1 从本机（未经代理）访问时无需填写。")
    else:
        lines.append(
            "  用 localhost 从本机访问**同样**需要这枚密钥（回环对端无法证明请求来自本机："
            "SSH -L / socat 之类的四层转发也能伪造）。"
        )
        lines.append("  只想在本机图省事、且能接受该风险：设 STORE_ALLOW_LOCAL_SETUP=1 后重启。")
    lines.extend(["=" * 72, ""])
    try:
        sys.stderr.write("\n".join(lines) + "\n")
        sys.stderr.flush()
    except OSError:
        pass
