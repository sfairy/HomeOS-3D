"""Home Assistant 端点（内网 / 外网）的建模与候选顺序。 一条连接可以配两路地址：内网（优先）与外网（备用，可留空）。"""

from __future__ import annotations

from dataclasses import dataclass

ENDPOINT_INTERNAL = 'internal'
ENDPOINT_EXTERNAL = 'external'


@dataclass(frozen=True)
class HAEndpoint:

    kind: str
    base_url: str
    verify_tls: bool

    @property
    def label(self) -> str:
        return '内网' if self.kind == ENDPOINT_INTERNAL else '外网'


def endpoint_candidates(
    internal_url: str,
    internal_verify_tls: bool,
    external_url: str | None,
    external_verify_tls: bool,
) -> tuple[HAEndpoint, ...]:
    internal_url = (internal_url or '').strip()
    external_url = (external_url or '').strip()
    endpoints = [
        HAEndpoint(kind=ENDPOINT_INTERNAL, base_url=internal_url, verify_tls=internal_verify_tls)
    ]
    if external_url and external_url != internal_url:
        endpoints.append(
            HAEndpoint(kind=ENDPOINT_EXTERNAL, base_url=external_url, verify_tls=external_verify_tls)
        )
    return tuple(endpoints)


def connection_endpoints(connection) -> tuple[HAEndpoint, ...]:
    return endpoint_candidates(
        connection.base_url,
        bool(connection.verify_tls),
        connection.external_base_url,
        bool(connection.external_verify_tls),
    )


def endpoint_signature(connection) -> tuple:
    return (
        str(connection.id),
        (connection.base_url or '').strip(),
        (connection.external_base_url or '').strip(),
        bool(connection.verify_tls),
        bool(connection.external_verify_tls),
    )
