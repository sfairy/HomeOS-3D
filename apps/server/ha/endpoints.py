"""Home Assistant 端点（内网 / 外网）的建模与候选顺序。

一条连接可以同时保存两个地址，**内网优先**：内网可达就一直走内网，不通才退到外网。本模块
只回答「有哪些候选端点、按什么顺序试」，真正的探测与切换在 ``ha/service.py`` 里 ——
那里才拿得到令牌与网络访问。

放在单独模块而不是塞进 service：媒体代理、接口层与前端回传都要构造端点对象，让它们
从 service 反向依赖只会把连接器的其余部分一起拖进来。
"""
from __future__ import annotations

from dataclasses import dataclass

#: 内网端点。字符串值同时落库到 ``ha_connections.active_endpoint``，改名要带上迁移。
ENDPOINT_INTERNAL = 'internal'
#: 外网端点。
ENDPOINT_EXTERNAL = 'external'


@dataclass(frozen=True)
class HAEndpoint:
    """一个可连的 HA 端点：地址 + 它自己的证书校验开关。

    ``verify_tls`` 必须随端点走而不是连接级共享：内网多是 http 或自签名证书（不校验），
    外网走公网（要校验），两套地址的合理取值天生相反。
    """

    kind: str
    base_url: str
    verify_tls: bool

    @property
    def label(self) -> str:
        """中文标签，用于日志与界面文案。"""
        return '内网' if self.kind == ENDPOINT_INTERNAL else '外网'


def endpoint_candidates(
    internal_url: str,
    internal_verify_tls: bool,
    external_url: str | None,
    external_verify_tls: bool,
) -> tuple[HAEndpoint, ...]:
    """按优先级列出候选端点：内网在前、外网在后。

    外网地址为空、或**与内网地址完全相同**时跳过它 —— 否则同一地址会被探两次，日志里会
    出现两次失败与两次成功，看起来像两台不同的机器。

    单独抽出来是因为「保存前的试连」也要按同一顺序试两个地址，而那时手上只有请求体、
    还没有连接记录。
    """
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
    """按优先级列出这条连接的候选端点：内网在前、外网在后。"""
    return endpoint_candidates(
        connection.base_url,
        bool(connection.verify_tls),
        connection.external_base_url,
        bool(connection.external_verify_tls),
    )


def endpoint_signature(connection) -> tuple:
    """端点的配置指纹：任一路地址或校验开关改了，指纹就变。

    连接被重建时连接器会主动作废缓存，但「同一个 id 下地址被改写」不会触发重建判定，
    只靠指纹才能发现 —— 否则改完地址后连接器会一直用内存里那个旧端点。
    """
    return (
        str(connection.id),
        (connection.base_url or '').strip(),
        (connection.external_base_url or '').strip(),
        bool(connection.verify_tls),
        bool(connection.external_verify_tls),
    )
