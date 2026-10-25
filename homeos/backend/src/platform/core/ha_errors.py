"""HA 侧高频错误文案工厂。

这些句子原本在 4~6 个地方逐字手写（Token 无效 ×4、操作超时 ×2、HTTP 错误 ×3…），
任何一处改措辞都会漂移；前端有按文案兜底匹配的地方，文案漂移等于静默失效。

这里只负责**生成文案**：异常类型（``HAAuthError`` / ``HAClientError``）仍由调用方
按语义选择，避免把「哪类错误该重试」的决策藏进文案层。
"""

from __future__ import annotations

from typing import Final

#: 服务地址配置类错误的公共前缀（这几条只在保存 / 测试连接时出现）。
URL_PREFIX: Final = 'Home Assistant'


def address_invalid_port() -> str:
    """端口不在 1..65535。"""
    return '请填写有效地址，端口应在 1 到 65535 之间。'


def address_not_url() -> str:
    """地址不是完整的 http(s) URL。"""
    return f'{URL_PREFIX} 地址必须是完整的 http 或 https URL。'


def address_has_credentials() -> str:
    """地址里带了账号 / 密码 / 查询参数 / 锚点。"""
    return f'{URL_PREFIX} 地址不能包含账号、密码、查询参数或锚点。'


def address_not_home_assistant() -> str:
    """能连上，但返回的不是 HA 的 ``/api/config``。"""
    return '该地址未返回有效的 Home Assistant 配置，请检查服务地址及反向代理。'


def token_invalid() -> str:
    """REST / WebSocket 通用「Token 无效或权限不足」。"""
    return f'{URL_PREFIX} Token 无效或权限不足。'


def websocket_token_invalid() -> str:
    """WebSocket 鉴权阶段的 Token 失效（措辞与 REST 区分，便于排查走的是哪条链路）。"""
    return f'{URL_PREFIX} WebSocket Token 无效或鉴权失败。'


def http_status(status_code: int) -> str:
    """HA 返回了非 2xx（401/403 会先被归为 ``token_invalid``）。"""
    return f'{URL_PREFIX} 返回 HTTP {status_code}。'


def operation_timeout() -> str:
    """单次服务调用超时。"""
    return f'{URL_PREFIX} 操作超时。'


def dial_timeout() -> str:
    """连不上（DNS / 端口 / 网络）。"""
    return '连接 Home Assistant 超时，请检查地址、端口及 HomeOS 所在设备的网络。'


def unreachable(detail: object) -> str:
    """其它传输层错误。"""
    return f'无法连接 Home Assistant：{detail}'


def service_call_failed(detail: object) -> str:
    """服务调用本身失败（HTTP 层之后的错误）。"""
    return f'{URL_PREFIX} 服务调用失败：{detail}'


def service_call_not_answered(domain: str, service: str) -> str:
    """重试后仍没拿到结果（``result`` 未赋值，属于不该发生的分支）。"""
    return f'{URL_PREFIX} 服务 {domain}.{service} 未返回结果（重试后仍失败）。'


def entity_unavailable(entity_id: str, domain: str, service: str) -> str:
    """HA 对不可用实体同样返回 200，只能靠响应里的状态复核出来。"""
    return f'实体 {entity_id} 当前不可用（unavailable），服务 {domain}.{service} 未生效。'


def entity_fetch_failed(entity_id: str, detail: object) -> str:
    """读取单个实体状态失败。"""
    return f'无法获取 Home Assistant 实体 {entity_id}：{detail}'


def history_fetch_failed(detail: object) -> str:
    """读取历史数据失败。"""
    return f'无法读取 Home Assistant 历史数据：{detail}'


def screen_state_unavailable(device_name: str) -> str:
    """交互大屏上的设备面板：实体状态不可用时给用户的话（各面板共用同一句）。"""
    return f'{device_name}状态暂不可用，请等待设备重新连接。'
