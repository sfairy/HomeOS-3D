"""邮箱验证码投递。

``STORE_MAIL_MODE`` 三种模式：``log`` 只写日志（默认，本地联调）、``echo`` 写日志并在响应里回显明文
（**仅限本地**）、``smtp`` 真实发信。

发信的三条铁律：瞬时故障（限流、偶发 4xx）必须重试，否则验证码根本没发出去；确定性失败
（认证失败、收件人被拒）不能重试，只会把注册接口拖到超时；邮件同时提供
``multipart/alternative`` 的 HTML 与纯文本兜底，因为纯文本在真机邮箱里难读、但部分企业网关只认它。
"""

from __future__ import annotations

import hashlib
import html
import logging
import smtplib
import socket
import ssl
import time
from contextlib import contextmanager
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Iterator

from store.ops import mail_settings, net_probe
from store.config import StoreSettings
from store.core.models import StoreSetting
from store.ops.net_probe import check_result
from store.security.security import is_valid_email, new_verification_code

logger = logging.getLogger("store.ops.mailer")


@dataclass(frozen=True)
class _Copy:
    """一个用途对应的文案。"""

    label: str
    action: str
    ignore_hint: str


#: 用途 → 文案。新增用途时必须在这里登记：``_copy_for`` 对未知用途会回落到
#: 通用文案，但「您正在验证账号」这种模糊说法会让用户怀疑邮件是钓鱼。
PURPOSE_COPY: dict[str, _Copy] = {
    "register": _Copy(
        label="注册账号",
        action="注册 HomeOS 账号",
        ignore_hint="如果这不是您本人的操作，请忽略本邮件，该邮箱不会被注册。",
    ),
    "reset": _Copy(
        label="重置登录密码",
        action="重置登录密码",
        ignore_hint="如果这不是您本人的操作，请忽略本邮件，您的密码不会被修改。",
    ),
    "verify": _Copy(
        label="验证邮箱",
        action="验证本邮箱",
        ignore_hint="如果这不是您本人的操作，请忽略本邮件。",
    ),
    "change_email": _Copy(
        label="更换邮箱",
        action="把账号邮箱更换为本邮箱",
        ignore_hint="如果这不是您本人的操作，请忽略本邮件，您的邮箱不会被更改。",
    ),
    #: 后台「发送测试邮件」用。文案必须自报家门：测试邮件会出现在运营自己的
    #: 收件箱里，如果它和真实验证码邮件长得一模一样，事后没人分得清哪封是测的；
    #: 主题里也带上「测试」字样（label 直接进主题），邮件列表里一眼可辨。
    "test": _Copy(
        label="【测试邮件】",
        action="测试验证码邮件的投递链路（收到本邮件即说明 SMTP 配置可用，无需任何操作）",
        ignore_hint="这是一封来自授权商店后台的测试邮件，其中的验证码没有任何用途。",
    ),
}


@dataclass(frozen=True)
class MailResult:
    """一次投递尝试的完整结果，会被落库（见 ``EmailVerification``）。"""

    #: 是否真的通过 SMTP 投递成功
    delivered: bool
    #: 实际生效的投递方式：smtp / log / echo
    mode: str
    #: SMTP 实际尝试次数（含首次）；未走 SMTP 时为 0
    attempts: int = 0
    #: 失败原因（已截断）；成功或未走 SMTP 时为空
    error: str = ""
    #: 仅本地联调：把验证码明文回给接口调用方
    exposed_code: str | None = None


def _code_fingerprint(code: str) -> str:
    """把验证码渲染成可在日志里留痕、但无法据以还原的形式。

    刻意不用 ``123***`` 这类掩码：验证码是定长数字串，掩码会把搜索空间从
    10^n 降到 10^(n-3)，日志一旦外流就等于替攻击者做完了大部分爆破。
    这里改用短哈希指纹 —— 仍能用来核对「两条日志是不是同一个码」（排障真正
    需要的部分），但反推不出任何一位数字。
    """
    text = (code or "").strip()
    if not text:
        return "(空)"
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]
    return f"sha256:{digest}（{len(text)} 位）"


def _copy_for(purpose: str) -> _Copy:
    return PURPOSE_COPY.get(
        purpose,
        _Copy(
            label="验证账号",
            action="完成身份验证",
            ignore_hint="如果这不是您本人的操作，请忽略本邮件。",
        ),
    )


def _render_plain(code: str, copy: _Copy, site: str, ttl_minutes: int) -> str:
    return (
        "您好，\n\n"
        f"您正在{copy.action}，验证码为：{code}\n\n"
        f"验证码 {ttl_minutes} 分钟内有效，请勿转发给他人。\n"
        f"{copy.ignore_hint}\n\n"
        f"{site}\n"
    )


def _render_html(code: str, copy: _Copy, site: str, ttl_minutes: int) -> str:
    """渲染 HTML 版本。

    全部用行内样式：多数邮箱客户端会剥离 ``<head>`` 里的 ``<style>``，
    class 选择器在 Gmail/Outlook 里基本不可靠。表格布局同理 —— flex/grid
    在 Outlook 桌面版上会被直接丢掉。
    """
    site_escaped = html.escape(site)
    code_escaped = html.escape(code)
    return f"""<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1f2430;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;border-collapse:collapse;background:#ffffff;border:1px solid #e3e6ec;border-radius:12px;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:17px;font-weight:600;letter-spacing:.02em;">{site_escaped}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5361;">您正在{copy.action}，请在页面中输入下面的验证码：</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <div style="background:#fff8ec;border:1px solid #f0d9b5;border-radius:10px;padding:18px 0;text-align:center;">
            <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:.28em;color:#b46a12;">{code_escaped}</span>
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">
            验证码 <strong style="color:#4b5361;">{ttl_minutes} 分钟</strong>内有效，请勿转发给他人。<br>
            {copy.ignore_hint}
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 26px;">
          <div style="border-top:1px solid #eef0f4;padding-top:14px;font-size:12px;color:#9aa1ad;">
            本邮件由系统自动发送，请勿直接回复。
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _build_message(
    *,
    mail_from: str,
    email: str,
    subject: str,
    plain: str,
    rich: str,
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = mail_from
    message["To"] = email
    message["Subject"] = subject
    # 先设纯文本再 add_alternative：顺序决定 MIME 部件次序，
    # 纯文本必须在前（客户端从后往前挑它能显示的最「富」的那一个）。
    message.set_content(plain)
    message.add_alternative(rich, subtype="html")
    return message


def _is_transient(error: BaseException) -> bool:
    """判断是否值得重试。

    认证失败、收件人被拒属于「改配置或换地址才能解决」，重试纯属浪费时间；
    其余 SMTP/网络异常（限流 4xx、连接重置、超时）都按瞬时故障处理。
    """
    if isinstance(error, (smtplib.SMTPAuthenticationError, smtplib.SMTPRecipientsRefused)):
        return False
    if isinstance(error, smtplib.SMTPResponseException):
        # 4xx 是「稍后再试」，5xx 是永久失败
        return 400 <= int(getattr(error, "smtp_code", 0) or 0) < 500
    return isinstance(error, (OSError, smtplib.SMTPException))


@contextmanager
def _connect_smtp(
    settings: StoreSettings, *, deadline: float | None = None
) -> Iterator[smtplib.SMTP]:
    """建立到 SMTP 的连接并完成 TLS / 登录握手，**不发信**。
    独立成段是为了让「连接诊断」复用真正发信时的同一条连接与登录逻辑，避免 STARTTLS/ehlo
    细节漂移导致「诊断说通、真发信失败」。``login`` 仅在配了用户名时调用（匿名投递的 SMTP
    带空用户名登录会得到与配置无关的失败）；``deadline`` 把单次连接超时压进总预算。
    """
    timeout = max(1, int(settings.smtp_timeout_seconds or 15))
    if deadline is not None:
        timeout = max(1, min(timeout, int(deadline - time.monotonic())))
    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, context=context, timeout=timeout
        ) as client:
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            yield client
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout) as client:
        client.ehlo()
        if settings.smtp_starttls:
            client.starttls(context=ssl.create_default_context())
            client.ehlo()
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password)
        yield client


def _send_smtp_once(
    settings: StoreSettings, *, message: EmailMessage, email: str, deadline: float | None = None
) -> None:
    """一次投递尝试；失败时抛异常，由调用方决定是否重试。"""
    with _connect_smtp(settings, deadline=deadline) as client:
        client.send_message(message)


#: 一次发信的**总**墙钟预算（秒）。
#: 单次连接超时（``smtp_timeout_seconds``，默认 15s）× 重试次数 + 线性退避最坏可达 ~50 秒，
#: 而发信走**同步端点**、全程占着一个线程池工作线程，``/store/v1/verifications`` 又匿名可达，
#: 并发刷几次就能占满线程池、拖垮整个商店前端。三个旋钮单独看都合理、乘起来才是灾难，所以
#: 这里放一条**安全上限**而非可调策略：调大只会让线程被占更久，没有场景需要更久。
MAX_SEND_WALL_SECONDS = 20.0


def _send_smtp(
    settings: StoreSettings, *, email: str, subject: str, plain: str, rich: str
) -> tuple[bool, int, str]:
    """带重试的投递，返回 ``(是否成功, 尝试次数, 错误文本)``。

    整段受 ``MAX_SEND_WALL_SECONDS`` 约束：预算耗尽就立刻放弃并如实返回
    **实际**尝试次数，绝不为了一次重试把线程再占 15 秒。
    """
    message = _build_message(
        mail_from=settings.mail_from,
        email=email,
        subject=subject,
        plain=plain,
        rich=rich,
    )
    max_attempts = max(1, int(settings.smtp_max_attempts or 1))
    backoff = max(0.0, float(settings.smtp_retry_backoff_seconds or 0.0))
    last_error = ""
    deadline = time.monotonic() + MAX_SEND_WALL_SECONDS
    tries = 0

    for attempt in range(1, max_attempts + 1):
        if time.monotonic() >= deadline:
            logger.warning(
                "SMTP 投递已超出总时限 %.0fs，放弃剩余重试 收件人=%s", MAX_SEND_WALL_SECONDS, email
            )
            break
        tries = attempt
        try:
            _send_smtp_once(settings, message=message, email=email, deadline=deadline)
        except Exception as error:  # noqa: BLE001 - 需要覆盖 smtplib 与 socket 的全部异常
            last_error = f"{error.__class__.__name__}: {error}"[:250]
            logger.warning(
                "SMTP 投递失败（第 %d/%d 次）收件人=%s：%s",
                attempt,
                max_attempts,
                email,
                last_error,
            )
            if attempt >= max_attempts or not _is_transient(error):
                break
            # 线性退避：重试之间给对端一点恢复时间，避免被当成轰炸。
            # 但不能睡过总预算 —— 睡过去等于白白占着线程。
            if backoff:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(backoff * attempt, remaining))
            continue
        if attempt > 1:
            logger.info("SMTP 第 %d 次尝试成功，收件人=%s", attempt, email)
        return True, attempt, ""

    if not last_error:
        # 一次都没发出去、也不是被异常打断：只可能是进循环时预算就已耗尽
        last_error = f"SMTP 总时限（{MAX_SEND_WALL_SECONDS:.0f}s）内未能完成投递"
    return False, max(1, tries), last_error


def send_verification_email(
    settings: StoreSettings,
    setting: StoreSetting,
    *,
    email: str,
    code: str,
    purpose: str,
) -> MailResult:
    copy = _copy_for(purpose)
    # 站点配置优先、环境变量兜底的合并必须收口在这里，而不是让每个调用方自己做。
    # 「测试邮件」按钮的意义就是验证**用户真正会走到的那条路**：若这里读环境变量，
    # 运营改了后台授权码、点测试却通了（或反过来），得到的结论正好是错的。
    settings = mail_settings.merge_mail_settings(settings, setting)
    mode = (settings.mail_mode or "log").lower()
    site = setting.site_name or "HomeOS 授权中心"
    ttl_minutes = max(1, int((settings.verification_ttl_seconds or 600) // 60))

    subject = f"{site} - {copy.label}验证码"
    plain = _render_plain(code, copy, site, ttl_minutes)
    rich = _render_html(code, copy, site, ttl_minutes)

    #: 是否允许在响应里回显验证码（本地联调）。smtp 模式下由独立开关控制，
    #: echo 模式则天然回显。
    expose = settings.expose_verification_code or mode == "echo"

    if settings.smtp_misconfigured:
        logger.error(
            "STORE_MAIL_MODE=smtp 但凭据不全（host=%r username=%r password=%s），"
            "本次改为日志/回显投递，注册流程不会中断",
            settings.smtp_host,
            settings.smtp_username,
            "已设置" if settings.smtp_password else "缺失",
        )

    if settings.smtp_ready:
        ok, attempts, error = _send_smtp(
            settings, email=email, subject=subject, plain=plain, rich=rich
        )
        if ok:
            return MailResult(
                delivered=True,
                mode="smtp",
                attempts=attempts,
                exposed_code=code if expose else None,
            )
        logger.error(
            "验证码邮件重试 %d 次后仍失败，回退为日志模式：%s", attempts, email
        )
        return MailResult(
            delivered=False,
            mode=mode if mode in {"log", "echo"} else "log",
            attempts=attempts,
            error=error,
            exposed_code=code if expose else None,
        )

    # 写不写明文验证码必须区分来由：**显式**选 log/echo 时日志就是投递通道，写明文是设计意图；
    # 选 smtp 但因凭据不全**回退**到日志时，运营以为不打码，实际验证码都留在日志里，任何能读日志
    # 的人（聚合、冷备、工单附件）都能接管账号。故回退场景只记掩码并告警，显式打开才写明文。
    log_plaintext_code = mode in {"log", "echo"} or settings.expose_verification_code
    if log_plaintext_code:
        logger.warning(
            "[验证码] 收件人=%s 用途=%s 验证码=%s（mail_mode=%s）",
            email,
            purpose,
            code,
            mode,
        )
    else:
        logger.error(
            "验证码无法投递：mail_mode=%s 但 SMTP 未就绪，本次已回退为日志投递。"
            "为避免把可用的验证码写进生产日志，这里只记录掩码 %s，"
            "请尽快补全 SMTP 配置（收件人=%s 用途=%s）。",
            mode,
            _code_fingerprint(code),
            email,
            purpose,
        )
    return MailResult(
        delivered=False,
        mode="echo" if mode == "echo" else "log",
        exposed_code=code if expose else None,
    )


def send_test_email(
    settings: StoreSettings,
    setting: StoreSetting,
    *,
    email: str,
) -> MailResult:
    """后台「发送测试邮件」：走**真实**投递路径，但不产生验证码记录。
    刻意复用 ``send_verification_email``：测试的意义就是验证运营真正会走的那条路，另写一条的话
    两边在 ``smtp_ready`` 判定、重试、降级上的分歧都不会被测出来。差别只在**不写库** —— 不占
    单邮箱配额，邮件里的验证码在系统里也不存在。
    """
    return send_verification_email(
        settings,
        setting,
        email=email,
        code=new_verification_code(),
        purpose="test",
    )


def _mail_from_address(mail_from: str) -> str:
    """从 ``HomeOS <no-reply@example.com>`` 这种带显示名的写法里取出纯地址。

    必须走 ``parseaddr`` 而不是直接拿去正则匹配：``store.security.is_valid_email``
    刻意不认显示名，而带显示名的发件人是本项目文档里推荐的写法，
    直接匹配会把一份完全合法的配置判成失败。
    """
    _, address = parseaddr(mail_from or "")
    return address or (mail_from or "").strip()


def _describe_smtp_error(error: BaseException) -> str:
    """把 SMTP/网络异常翻译成运营能照着改的一句话。

    「连不上」的成因有十几种，而每一种的处置方式完全不同：认证失败要去换授权码，
    SSL 错误要去改加密方式，超时要去查防火墙。丢一句 ``OSError: [Errno 61]``
    给运营等于没说，所以这里把最常见的几类分别写清楚。
    """
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return (
            "认证失败：用户名或授权码不对。多数邮箱（QQ/163/Gmail）要求填的是"
            "「SMTP 授权码」而不是网页登录密码。"
        )
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "收件人被服务器拒绝：请确认发件地址与 SMTP 账号属于同一个邮箱服务商。"
    if isinstance(error, ssl.SSLError):
        return (
            f"TLS/SSL 握手失败：{error}。请核对「SMTP 加密」与端口是否匹配"
            "（SSL 一般 465、STARTTLS 一般 587）。"
        )
    if isinstance(error, (socket.timeout, TimeoutError)):
        return "连接超时：服务器不可达，或端口被防火墙/云安全组拦住了。"
    if isinstance(error, ConnectionRefusedError):
        return "连接被拒绝：地址能解析，但该端口上没有服务在监听（端口号填错了？）。"
    if isinstance(error, smtplib.SMTPServerDisconnected):
        return (
            "连接被服务器中断：常见于「明文端口上传了 TLS」或反垃圾策略拒绝了本次会话。"
        )
    if isinstance(error, OSError):
        return f"网络错误：{error}"
    return f"{error.__class__.__name__}: {error}"


def diagnose_mail(
    settings: StoreSettings, *, timeout_seconds: float = net_probe.DEFAULT_TIMEOUT_SECONDS
) -> tuple[bool, list[dict]]:
    """按**已合并站点配置**做一次邮件链路诊断，返回 ``(是否全部通过, 结论列表)``。
    这里回答「配置本身对不对」（域名解析、TLS/端口、授权码登录），**不发信**所以可反复点；
    ``send_test_email`` 回答「这条路真能通吗」，会真发一封。分开是刻意的：SMTP 故障在握手
    阶段就能定位，而发信失败往往只回笼统 5xx。任何一项不是 ``pass``（含 skip/warn）都不算通过。
    """
    checks: list[dict] = []
    mode = (settings.mail_mode or "log").lower()

    if mode == "smtp":
        checks.append(
            check_result("mode", "投递方式", net_probe.LEVEL_PASS, "smtp：验证码会真正投递到收件人邮箱。")
        )
    else:
        hint = "（echo 会回显明文，仅供本地联调）" if mode == "echo" else ""
        checks.append(
            check_result(
                "mode",
                "投递方式",
                net_probe.LEVEL_SKIP,
                f"当前为 {mode}{hint}：验证码不会离开服务器，真实投递链路无法验证。",
            )
        )

    host = (settings.smtp_host or "").strip()
    port = int(settings.smtp_port or 0)
    server_ok = True
    if not host:
        server_ok = False
        checks.append(check_result("server", "服务器与端口", net_probe.LEVEL_FAIL, "未填写 SMTP 服务器地址。"))
    elif not (1 <= port <= 65535):
        server_ok = False
        checks.append(
            check_result("server", "服务器与端口", net_probe.LEVEL_FAIL, f"端口 {port} 不在 1-65535 范围内。")
        )
    else:
        checks.append(
            check_result("server", "服务器与端口", net_probe.LEVEL_PASS, f"{host}:{port}")
        )

    # 用户名与授权码必须成对。这个组合不对时 ``smtp_ready`` 为假，发信会**静默降级**
    # 成写日志 —— 用户收不到信，而后台每一样看起来都填好了。
    if settings.smtp_username and not settings.smtp_password:
        checks.append(
            check_result(
                "auth",
                "SMTP 登录凭据",
                net_probe.LEVEL_FAIL,
                "填了用户名但没有授权码：发信会退化为只写日志。请补全 SMTP 授权码。",
            )
        )
    elif settings.smtp_username:
        checks.append(
            check_result("auth", "SMTP 登录凭据", net_probe.LEVEL_PASS, f"用户名 {settings.smtp_username}（授权码已配置）")
        )
    else:
        checks.append(
            check_result(
                "auth",
                "SMTP 登录凭据",
                net_probe.LEVEL_WARN,
                "未配置用户名：按匿名投递处理。只有内网开放中继的服务器才允许，公网邮箱服务商一律会拒绝。",
            )
        )

    sender = _mail_from_address(settings.mail_from)
    if is_valid_email(sender):
        checks.append(check_result("sender", "发件地址", net_probe.LEVEL_PASS, sender))
    else:
        checks.append(
            check_result(
                "sender",
                "发件地址",
                net_probe.LEVEL_FAIL,
                f"发件地址 {sender or '（空）'} 不是合法邮箱。多数邮箱服务商还要求发件人与 SMTP 账号同域。",
            )
        )

    # 只有真打算走 smtp 时才做网络探测：log/echo 模式下检测 DNS 与登录没有意义，
    # 反而会让运营以为「修好了网络就能发信」。
    if mode != "smtp":
        checks.append(
            check_result("dns", "域名解析", net_probe.LEVEL_SKIP, "投递方式不是 smtp，未做网络探测。")
        )
        checks.append(
            check_result("connect", "连接与登录", net_probe.LEVEL_SKIP, "投递方式不是 smtp，未做连接探测。")
        )
    elif not server_ok:
        checks.append(
            check_result("dns", "域名解析", net_probe.LEVEL_SKIP, "服务器地址未填对，无法解析。")
        )
        checks.append(
            check_result("connect", "连接与登录", net_probe.LEVEL_SKIP, "服务器地址未填对，无法连接。")
        )
    else:
        resolved, detail, _addresses = net_probe.resolve_host(host)
        checks.append(
            check_result(
                "dns",
                "域名解析",
                net_probe.LEVEL_PASS if resolved else net_probe.LEVEL_FAIL,
                detail,
            )
        )
        if not resolved:
            checks.append(
                check_result("connect", "连接与登录", net_probe.LEVEL_SKIP, "域名解析失败，未尝试连接。")
            )
        else:
            try:
                with _connect_smtp(settings):
                    pass
            except Exception as error:  # noqa: BLE001 - 诊断要覆盖 smtplib/socket/ssl 全部异常
                checks.append(
                    check_result("connect", "连接与登录", net_probe.LEVEL_FAIL, _describe_smtp_error(error))
                )
            else:
                checks.append(
                    check_result(
                        "connect",
                        "连接与登录",
                        net_probe.LEVEL_PASS,
                        "已建立连接并完成登录握手（本次未发送任何邮件）。",
                    )
                )

    passed = all(item["level"] in net_probe.PASSING_LEVELS for item in checks)
    return passed, checks
