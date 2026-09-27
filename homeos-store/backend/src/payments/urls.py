"""渠道无关的地址校验：网关与回调地址。

抽出来的理由很实在：**「回调地址不能是内网」这条规则对所有渠道都一样**，而它的文案里
必须出现具体渠道名（运营看到的是「微信支付的服务器访问不到 127.0.0.1」这种句子）。
两处各写一份的结局一定是「改了一边、另一边静默留着旧规则」。
"""

from __future__ import annotations

from urllib.parse import urlsplit

from ..ops.net_probe import LEVEL_FAIL, LEVEL_PASS, LEVEL_WARN, check_result, host_from_url, is_private_host, probe_http
from ..payments.base import PaymentError


def callback_url_error(text: str, *, label: str, channel: str) -> str:
    """回调地址的格式校验；返回错误文案，空串表示合法（空值也算合法：会按 base_url 推导）。"""
    if not text:
        return ""
    lowered = text.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        return (
            f"{label}必须以 http:// 或 https:// 开头（要填完整的外部可达地址，"
            "不能只填路径）。"
        )
    host = host_from_url(text)
    if not host:
        return f"{label}缺少主机名。"
    if is_private_host(host):
        return (
            f"{label}不能填本机或内网地址：{channel}的服务器访问不到 {host}，"
            "异步通知会永远收不到（订单停在待支付）。请填公网可达的域名，"
            "或用内网穿透工具提供的地址。"
        )
    return ""


def validate_callback_url(text: str, *, label: str, channel: str) -> None:
    """校验不通过就抛 ``PaymentError``。"""
    problem = callback_url_error(text, label=label, channel=channel)
    if problem:
        raise PaymentError(problem)


def callback_url_check(
    check_id: str, label: str, url_value: str, *, channel: str, reachable_hint: str
) -> dict:
    """回调地址的单项诊断：格式 → 是否内网 → 本机可达性。

    「本机可达性」只是**提示**（LEVEL_WARN）而不是失败：从容器里探不到自己的公网地址
    很常见，真正能证明它可用的是收到过一次真实回调。
    """
    text = (url_value or "").strip()
    if not text:
        return check_result(
            check_id,
            label,
            LEVEL_FAIL,
            f"未配置，且无法按 STORE_BASE_URL 推导出有效地址。{reachable_hint}",
        )
    problem = callback_url_error(text, label=label, channel=channel)
    if problem:
        return check_result(check_id, label, LEVEL_FAIL, problem)

    reachable, detail = probe_http(text)
    if reachable:
        return check_result(check_id, label, LEVEL_PASS, f"{text} — {detail}")
    return check_result(
        check_id, label, LEVEL_WARN, f"{text} — {detail}。{reachable_hint}"
    )


def url_port(url: str, *, default: int) -> int:
    """从 URL 里取端口；没写就按协议默认（http 80，其余用 ``default``）。"""
    try:
        parsed = urlsplit((url or "").strip())
    except ValueError:
        return default
    if parsed.port:
        return int(parsed.port)
    return 80 if parsed.scheme == "http" else default


__all__ = [
    "callback_url_check",
    "callback_url_error",
    "url_port",
    "validate_callback_url",
]
