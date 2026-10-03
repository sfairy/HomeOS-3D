"""uvicorn 转发头信任范围的启动自检。

``--forwarded-allow-ips`` 取成通配（``*`` / ``0.0.0.0/0`` / ``::/0``）等于「谁的转发头
都信」：登录限流、配对码枚举预算与审计里的来源 IP 都会被逐个请求伪造，等于没有预算。
默认只该信任回环；前面确实有反向代理时，填该代理自身的地址或它所在的网段。
"""
from __future__ import annotations

WILDCARD_FORWARDED_ALLOW_IPS = frozenset({'*', '0.0.0.0/0', '::/0'})


def unsafe_forwarded_allow_ips(value: str | None) -> bool:
    """``--forwarded-allow-ips`` 的取值是否等于「谁的转发头都信」。
    """
    return any(
        piece.strip() in WILDCARD_FORWARDED_ALLOW_IPS
        for piece in str(value or '').split(',')
    )


def forwarded_allow_ips_warning(value: str | None) -> str:
    """取值会破坏来源地址可信性时给出告警文案；安全取值返回空串。
    """
    if not unsafe_forwarded_allow_ips(value):
        return ''
    return (
        f'UVICORN_FORWARDED_ALLOW_IPS={str(value).strip()!r} 等于信任任何对端的转发头：'
        'uvicorn 会据此改写对端地址，于是登录限流、配对码枚举预算与审计里的来源 IP '
        '都能被逐个请求伪造，等于没有预算。默认只该信任回环（127.0.0.1,::1）；'
        '前面确实有反向代理时，请填该代理自身的地址或它所在的网段。'
    )
