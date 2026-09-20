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

本模块给出的策略与主应用 ``backend/setup_guard.py`` 同构（两边刻意各自保留一份：
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

import hashlib
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

#: 标记文件：它的存在（且指纹对得上）说明同目录的 ``setup-token`` 是本商店生成的。
#:
#: 为什么**不**在密钥文件里写一行注释来标记：``cat $APP_DATA_DIR/setup-token`` 是
#: README 教给运营的取用方式，多出一行注释会让照着文档复制的人拿到「注释 + 密钥」，
#: 于是在表单里粘出一个 403 而不知道错在哪。密钥文件因此保持「一行就是一枚密钥」，
#: 出处另放一个文件。
#: 主应用的 ``backend/setup_guard.py`` 有同构的一份，两处必须一起改（改动前先
#: 对照另一处，确认改完仍然同构）。
GENERATED_MARKER_FILE = "setup-token.generated"
#: 标记文件里那行指纹的前缀。
FINGERPRINT_PREFIX = "sha256:"

#: 判定「本机直连」时可信的对端地址。
#:
#: **必须与主应用的 ``http_security.LOOPBACK_HOSTS`` 逐元素相同**：两份实现是刻意重复的
#: 同一套规则，而这条规则是首次初始化窗口唯一的闸门。这里刻意**不收** ``testclient``
#: （那是 ``TestClient`` 造出来的非 IP 对端名，让它等于「本机」等于把测试脚手架带进生产）
#: 也**不收空串**（``client`` 缺失只说明「拿不到对端」——unix socket 部署就是这种形态 ——
#: 而不说明对端就在本机；把「拿不到」当「本机」放行，等于给同机反代的 unix socket 部署
#: 重新打开「先到先得」）。这两条取舍必须与主应用那一份逐元素一致，改一处就要同步另一处。
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

#: 初始化尝试的限流预算：每来源 10 次 / 15 分钟。
_SETUP_ATTEMPT_LIMIT = 10
_SETUP_ATTEMPT_WINDOW_SECONDS = 900.0


def token_fingerprint(token: str) -> str:
    """令牌的短指纹：用来回答「盘上这份还是不是我们当初写下的那一枚」。

    取 16 位十六进制就够：这不是口令学上的保护（密钥本身仍是高熵随机串，指纹也只留在
    0600 的数据目录里），它只是**出处**的比对依据 —— 少了它，一份被运营替换过的密钥
    文件会因为我们留着上一轮的标记而被当成自己生成的，于是初始化成功时被删掉。
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


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


def read_token_file(text: str) -> str:
    """从密钥文件内容里取密钥：跳过 ``#`` 开头的注释行与空行。

    自动生成的那份只有一行；运营预置的偶尔会带自己的注释。两种都要读得出来，所以按
    「第一个非注释、非空行」取值，而不是整文件 strip。
    """
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            return stripped
    return ""


class SetupGuard:
    """首次初始化窗口的守卫：本机放行 + 远程需引导密钥 + 限流。"""

    def __init__(self, data_dir: Path, configured_token: str = "") -> None:
        self.path = Path(data_dir) / "setup-token"
        self.marker_path = Path(data_dir) / GENERATED_MARKER_FILE
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

        证据 = 标记文件里的指纹与该令牌的指纹一致。只看「标记文件在不在」不够：本商店
        生成过一枚之后，运营完全可能把这份文件换成自己的（或删掉重放一份），此时标记
        文件还在，而那份密钥是运营的 —— 指纹对不上就不会被误删。

        读不到就当「不是我们的」：宁可留下一份没用的文件（至多是一枚死凭证的副本），
        也不删掉可能是运营预置的恢复手段。
        """
        fingerprint = self._fingerprint_on_disk()
        return bool(fingerprint) and fingerprint == token_fingerprint(token)

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

        优先环境变量（运营自己指定，跨重启稳定）；其次读回既有文件（初始化窗口被
        中断后重启时不该换密钥，否则运营手上那份就作废了）；最后才生成新的。
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
                # 「是不是我们生成的」由标记文件里的指纹决定，而不是由「文件存在」
                # 决定：运营预置的那份一旦被当成自己生成的，初始化成功后就会被
                # consume() 删掉。
                self._generated = self._is_ours(existing)
                return self._token

        token = secrets.token_urlsafe(TOKEN_BYTES)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # O_CREAT|O_TRUNC + 0o600：创建瞬间就是私有权限，不留「先生成后 chmod」的窗口。
        descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            # 密钥文件就是「一行一枚密钥」：README 教的是 cat 它，多一行都是给运营添乱。
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

        只删**自动生成**的那份文件；``STORE_SETUP_TOKEN`` 由部署方持有、运营预置的
        文件是部署方留给自己的恢复手段，两者本类都不越权处理（端点本身在初始化完成
        后也会关闭，环境变量那份无法再被使用）。判据是标记文件里的指纹：
        「读回文件」曾把它当成自己生成的，于是初始化一成功就删掉了运营预置的那份。
        """
        if self._generated:
            try:
                self.path.unlink(missing_ok=True)
                # 标记最后删：万一删密钥文件失败，标记还留着，下次启动的 discard_file
                # 便仍认得出这枚残留在盘上的死凭证是我们自己写的。
                self.marker_path.unlink(missing_ok=True)
            except OSError:
                # 删不掉不该让「已经初始化成功」变成失败：端点的 initialized 闸门
                # 已经关上了，这份文件最多是一枚死凭证。
                logger.warning("初始化完成，但未能删除引导密钥文件 %s，请手动检查", self.path)
        self._token = ""
        self._generated = False
        self._attempts.reset()

    def discard_file(self) -> None:
        """删除**本商店自动生成**的残留密钥文件。

        调用点是「实例已经初始化」，此时盘上的 ``setup-token`` 有两种可能：上一次未
        完成窗口留下的自动生成文件，或运营**预置**的恢复手段。前者的内容照样能通过
        :meth:`authorize` 的比对，该删；后者是运营放在这里让实例读的一份副本，删掉等于
        把运营准备好的后路掐断。以标记文件里的指纹为准：对得上才删。
        """
        try:
            if not self.path.is_file():
                return None
            on_disk = read_token_file(self.path.read_text(encoding="utf-8"))
            if not self._is_ours(on_disk):
                logger.warning("检测到预置的引导密钥文件（不是本商店生成的），已保留：%s", self.path)
                return None
            self.path.unlink()
            # 标记跟着一起走：留着它只会让下一个人对着一个来历不明的文件猜。
            self.marker_path.unlink(missing_ok=True)
        except (OSError, UnicodeError):
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
