"""Home Assistant 地址的整形与校验（HTTP 地址解析 + 元数据地址拦截）。
"""
from __future__ import annotations

from ipaddress import ip_address
from urllib.parse import urlparse, urlunparse


class HAClientError(RuntimeError):
    """与 Home Assistant 交互失败（地址非法、鉴权失败、网络异常、返回超限等）。
    """
    pass


#: 云元数据端点：SSRF 里最经典的目标，任何情况下都不该被当成 HA 地址。
METADATA_HOSTS = frozenset({'169.254.169.254', '169.254.170.2', 'fd00:ec2::254'})


def host_ip(base_url: str):
    """取出地址里的 IP 字面量；是域名或解析不出时返回 None。"""
    hostname = urlparse(base_url).hostname
    if not hostname:
        return None
    try:
        return ip_address(hostname)
    except ValueError:
        return None


def metadata_address(base_url: str) -> str:
    host = host_ip(base_url)
    if host is None:
        return ''
    candidates = {str(host)}
    if host.version == 6 and host.ipv4_mapped is not None:
        candidates.add(str(host.ipv4_mapped))
    for candidate in candidates:
        if candidate in METADATA_HOSTS:
            return candidate
    return ''


def normalize_base_url(value: str) -> str:
    """把用户填写的 HA 地址整形成规范形式。
    """
    candidate = value.strip().rstrip('/')
    parsed = urlparse(candidate)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise HAClientError('Home Assistant 地址必须是完整的 http 或 https URL。')
    # 拒绝嵌入的凭据与查询串：它们会被带进日志和后端请求，拼接 /api/... 时也易产生歧义地址。
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HAClientError('Home Assistant 地址不能包含账号、密码、查询参数或锚点。')
    # 元数据地址不是「家里的 HA」：放行等于白送一个能读到云上凭证的探针。
    metadata = metadata_address(candidate)
    if metadata:
        raise HAClientError(f'{metadata} 是云元数据地址，不能作为 Home Assistant 地址。')
    path = parsed.path.rstrip('/')
    return urlunparse((parsed.scheme, parsed.netloc, path, '', '', ''))
