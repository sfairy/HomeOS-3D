"""网络可达性探测：给后台「站点配置」的自检按钮提供最小的探测原语。

这个模块只回答三类问题，每一类都对应运营在后台真实踩过的一个坑：

1. **「这个域名到底解析得到吗」**（:func:`resolve_host`）。SMTP 服务器或网关域名
   打错一个字母，过去的表现为「点了保存、界面全绿、用户收不到信」，因为发信失败
   只在用户注册那一刻以一句超时暴露。把 DNS 单独拆成一条检查项，错字就落在
   改配置的人眼前。
2. **「这个地址本机连得上吗」**（:func:`probe_http`）。异步通知地址填错（少个协议、
   指向 localhost、指向一个没部署的路径）时支付宝**不会报错** —— 它只是连不上，
   而我们的订单会永远停在待支付。
3. **「这个地址是不是根本不可能被支付宝访问到」**（:func:`is_private_host`）。
   本机/内网地址是必然收不到通知的写法，必须判 ``fail`` 而不是等探测结果。

**必须明说的一条边界**：本机连得通 ≠ 支付宝连得通。NAT 回环（hairpin）、
只对内网监听的边界、公司防火墙都可能让这里探测通过、而支付宝始终够不着。
所以调用方要把「探测成功」标成提示而不是结论 —— 这个模块的返回值只描述
「从本进程出发的可达性」，不承诺更多。

**另一条边界（S58）**：内网地址是**合法**的探测目标（自建 SMTP 中继、内网反代、
内网网关都长在 ``10./172./192.168.`` 里，探测它们正是这个模块存在的理由），
但**链路本地这一档直接拒绝**（``169.254.0.0/16`` 与 ``fe80::/10``，云厂商的元数据
服务就在里面）。理由是用途：元数据服务不提供邮件/回调/网关能力，只提供这台机器
的临时凭据，而本模块的返回值（可达/不可达、以及失败原因区分「拒绝」「超时」
「TLS 握手失败」）足以把它当成一个内网端口探针用。所以这一档不连、直接判不可达
并说明原因，其余地址照旧如实探测 —— 本模块**从不回显响应体**，只回答可达性。
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import ssl
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("store.ops.net_probe")

#: 单次探测的超时（秒）。刻意取得比 ``httpx`` 默认的 5 秒更短：自检是**同步**
#: 端点，FastAPI 会把它丢进线程池，几个检查项串起来就是运营盯着按钮转圈的时间。
DEFAULT_TIMEOUT_SECONDS = 5.0

#: 诊断结论的四个级别。刻意把「通过」与「没测」分开：
#: 后台的整块改造就是要消灭「界面全绿、实际不可用」，把 ``skip`` 渲染成通过
#: 等于把同一个谎言换个地方再讲一遍。``warn`` 是「测不了 / 大概率有问题」，
#: 同样不可以当作通过。
LEVEL_PASS = "pass"
LEVEL_WARN = "warn"
LEVEL_FAIL = "fail"
LEVEL_SKIP = "skip"

#: 四个级别里「算不算真的验证过」。只有 pass 才是。
PASSING_LEVELS = frozenset({LEVEL_PASS})


def check_result(check_id: str, label: str, level: str, detail: str = "") -> dict:
    """构造一条诊断结论（``mailer`` 与 ``payments.alipay`` 共用同一份结构）。"""
    return {"id": check_id, "label": label, "level": level, "detail": detail}

#: 视为「必然收不到回调」的网段。刻意包含 172.16/12 与 100.64/10（CGNAT）：
#: 云厂商的容器网络大量落在后者，配上去之后表现为「本机能访问、外网不能」。
_PRIVATE_NETWORKS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local，含云元数据地址
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT / 容器网络
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),  # 唯一本地地址
    ipaddress.ip_network("fe80::/10"),  # link-local
)

#: **绝不允许**探测的那一档：链路本地（v4 的 ``169.254.0.0/16``、v6 的 ``fe80::/10``）。
#: 刻意与 :data:`_PRIVATE_NETWORKS` 分开（S58）：内网地址是**合法**目标 ——
#: 自建 SMTP 中继、内网反代、内网网关都长在 ``10./172./192.168.`` 里，探测它们正是
#: 本模块存在的理由；而云厂商的**元数据服务**（``169.254.169.254`` 等）在这一档里，
#: 它不提供邮件/回调/网关能力，只提供这台机器的临时凭据。本模块的返回值（可达性，
#: 以及失败原因区分「连接被拒」「超时」「TLS 握手失败」）足够把它当成一个内网端口与
#: 凭据服务的探针，而它没有任何正当用途。所以这一档不连。
_BLOCKED_NETWORKS = (
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
)


def host_from_url(url: str) -> str:
    """从 URL 里取出主机名（小写）。URL 不合法时返回空串。"""
    try:
        return (urlsplit((url or "").strip()).hostname or "").lower()
    except ValueError:
        return ""


def is_private_host(host: str) -> bool:
    """主机名是否指向本机 / 内网（含直接写 IP 与 ``localhost`` 两种写法）。

    域名解析到内网地址的情况**不在这里判定**：那需要一次 DNS 查询，而本函数是
    纯函数、要能在表单校验里同步调用。解析到内网的域名由 :func:`resolve_host`
    的返回值去暴露。
    """
    text = (host or "").strip().strip("[]").lower()
    if not text:
        return False
    if text == "localhost" or text.endswith(".localhost"):
        return True
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        # 域名（含 ``.local`` / ``.internal`` 这类内网后缀）一律不在这里判死：
        # 那是启发式判断，会误伤自建域名（内网 DNS 也能解析出公网地址）。
        # 它们解析不出来这件事由 :func:`resolve_host` 如实报告，比猜测可靠。
        return False
    return any(address in network for network in _PRIVATE_NETWORKS)


#: 拒绝探测的说明文案。调用方原样放进 ``detail``，所以要把「为什么不」写清楚。
_BLOCKED_MESSAGE = (
    "{host} 是链路本地地址（云厂商的元数据服务就在这一档），不探测：它不提供"
    "邮件/回调/网关能力，只提供这台机器的临时凭据，而本模块会回报可达性与失败原因，"
    "足够把它当内网探针用。请换成一个真实的外部可达地址。"
)


def resolve_host(host: str) -> tuple[bool, str, tuple[str, ...]]:
    """解析主机名，返回 ``(是否成功, 说明文案, 解析到的地址)``。

    只做一次 ``getaddrinfo``：探测的目的是回答「这个写法有没有可能通」，
    不是做完整的 DNS 健康检查。地址去重后按字符串排序，让同一份配置每次得到
    同一份说明文案（否则运维比对两次自检结果时会以为环境变了）。
    """
    text = (host or "").strip()
    if not text:
        return False, "未填写主机名。", ()
    try:
        infos = socket.getaddrinfo(text, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as error:
        return False, f"域名解析失败：{error}（请检查是否拼写错误，或该域名在公网不存在）。", ()
    except OSError as error:  # noqa: BLE001 - 解析器的其它故障同样不该炸掉自检
        return False, f"域名解析失败：{error}", ()
    addresses = tuple(sorted({str(info[4][0]) for info in infos if info[4]}))
    if not addresses:
        return False, "域名解析没有返回任何地址。", ()
    return True, "解析到 " + "、".join(addresses), addresses


def _blocked_probe_reason(host: str) -> str:
    """目标是否落在「绝不允许探测」那一档（S58）；返回原因文案（空串表示放行）。

    主机名会先解析一次再判断：``metadata.google.internal`` 这类写法解析出来的就是
    链路本地地址，只看字面量等于把这条路留着。解析失败时**放行**（返回空串）——
    解析不出来这件事本身由连接的失败去报告，那时的报错比「我猜它是元数据」更准确，
    也不会把一次 DNS 抖动变成「目标被拒绝」。
    """
    text = (host or "").strip().strip("[]").lower()
    if not text:
        return ""

    def blocked(value: str) -> bool:
        try:
            address = ipaddress.ip_address(value.strip().strip("[]"))
        except ValueError:
            return False
        # ``::ffff:169.254.169.254`` 是 IPv4 映射写法，必须折回 IPv4 再比：
        # 换个写法就绕过的话，这道闸等于没装（v4 地址与 v6 网段本来也不可比）。
        mapped = getattr(address, "ipv4_mapped", None)
        if mapped is not None:
            address = mapped
        return any(
            address.version == network.version and address in network
            for network in _BLOCKED_NETWORKS
        )

    if blocked(text):
        return _BLOCKED_MESSAGE.format(host=text)

    try:
        ipaddress.ip_address(text)
    except ValueError:
        # 是域名：按解析结果判断（与后面真正连接时会连到的地址一致）。
        resolved, _detail, addresses = resolve_host(text)
        if resolved and any(blocked(item) for item in addresses):
            return _BLOCKED_MESSAGE.format(host=text)
    return ""


def probe_http(
    url: str,
    *,
    method: str = "GET",
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[bool, str]:
    """探测一个 http(s) 地址是否可达。返回 ``(是否可达, 说明文案)``。

    **拿到任何 HTTP 状态码都算可达**，包括 4xx/5xx。这一点是刻意的：我们的异步
    通知端点只接受 POST，用 GET 去探会得到 405 —— 而 405 恰恰证明「域名解析正常、
    TLS 正常、HTTP 服务在监听、请求路由到了正确的地方」，这正是我们要验证的事。
    反过来，只有**连接层**的失败（DNS、TCP、TLS 握手、超时）才算不可达。

    刻意不跟随重定向：跟随会走出去探测用户填的第三方地址，可能落到登录页而
    返回 200，把「配错了」判成「配对了」。
    """
    target = (url or "").strip()
    if not target:
        return False, "未填写地址。"
    blocked = _blocked_probe_reason(host_from_url(target))
    if blocked:
        return False, blocked
    try:
        response = httpx.request(
            method,
            target,
            timeout=timeout,
            follow_redirects=False,
        )
    except httpx.HTTPError as error:
        return False, f"连接失败：{error.__class__.__name__}: {error}"
    except ValueError as error:
        return False, f"地址不合法：{error}"
    return True, f"已建立连接（HTTP {response.status_code}）"


def probe_tls(
    host: str,
    port: int = 443,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[bool, str]:
    """探测 TCP 连通性 + TLS 握手，返回 ``(是否成功, 说明文案)``。

    刻意不做 HTTP 请求：调用方要验证的是「这个地址能不能走通」，而不是网关的业务
    响应（那由带签名的 API 调用去验证）。只握手不发数据，也就不会留下任何请求记录。

    TLS 验证走默认上下文（校验证书链）：自签证书的中间盒会让这里失败，
    而那正是需要被暴露的部署问题 —— 客户端库在生产上同样会拒绝它。
    """
    text = (host or "").strip()
    if not text:
        return False, "未填写主机名。"
    blocked = _blocked_probe_reason(text)
    if blocked:
        return False, blocked
    try:
        with socket.create_connection((text, int(port)), timeout=timeout) as raw:
            context = ssl.create_default_context()
            with context.wrap_socket(raw, server_hostname=text) as tls:
                version = tls.version() or "未知"
        return True, f"TCP 与 TLS 握手成功（{version}）"
    except ssl.SSLCertVerificationError as error:
        return False, f"TLS 证书校验失败：{error}"
    except ssl.SSLError as error:
        return False, f"TLS 握手失败：{error}"
    except (socket.timeout, TimeoutError):
        return False, f"连接 {text}:{port} 超时。"
    except OSError as error:
        return False, f"连接 {text}:{port} 失败：{error}"
