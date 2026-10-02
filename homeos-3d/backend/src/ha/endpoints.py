# [补充说明] Home Assistant 端点（内网 / 外网）的建模与候选顺序。
#
# 一条连接可以配两路地址：内网（优先）与外网（备用，可留空）。所有出网调用都从
# ``active_endpoint`` 取地址与该校验开关，内网连不上时自动改走外网。
from __future__ import annotations

from dataclasses import dataclass

#: 内网端点。字符串值同时落库到 ``ha_connections.active_endpoint``，改名要带上迁移。
ENDPOINT_INTERNAL = 'internal'
#: 外网端点。
ENDPOINT_EXTERNAL = 'external'


@dataclass(frozen=True)
class HAEndpoint:
    # [补充说明] 一个可连的 HA 端点：地址 + 它自己的证书校验开关。

    kind: str
    base_url: str
    verify_tls: bool

    @property
    def label(self) -> str:
        # [补充说明] 中文标签，用于日志与界面文案。
        return '内网' if self.kind == ENDPOINT_INTERNAL else '外网'


def endpoint_candidates(
    internal_url: str,
    internal_verify_tls: bool,
    external_url: str | None,
    external_verify_tls: bool,
) -> tuple[HAEndpoint, ...]:
    # [补充说明] 按优先级列出候选端点：内网在前、外网在后。
    #
    # 外网留空、或与外网地址完全相同（用户把两栏填成一样）时不产生第二个候选，
    # 免得同一地址被探两次。
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
    # [补充说明] 按优先级列出这条连接的候选端点：内网在前、外网在后。
    return endpoint_candidates(
        connection.base_url,
        bool(connection.verify_tls),
        connection.external_base_url,
        bool(connection.external_verify_tls),
    )


def endpoint_signature(connection) -> tuple:
    # [补充说明] 端点的配置指纹：任一路地址或校验开关改了，指纹就变。
    #
    # 用来判断缓存的「当前在用端点」是否还适用，改配置后必须重探。
    return (
        str(connection.id),
        (connection.base_url or '').strip(),
        (connection.external_base_url or '').strip(),
        bool(connection.verify_tls),
        bool(connection.external_verify_tls),
    )
