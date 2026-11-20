'''配置阶段与历史/运行时失败所用的连接提示消息（中文）。'''
from __future__ import annotations

import hashlib
import json
import re

import httpx

#: HA 侧稳定错误码 → 中文排查建议。与前端日志的分类词表互补：码给机器，建议给人。
HA_CODE_HINTS: dict[str, str] = {
    'HA_CONNECTION_FAILED': '检查 HomeOS 所在设备到 HA 的连接、端口、DNS及反向代理；原始异常保留在详情。',
    'HA_CREDENTIAL_UNREADABLE': '检查原 secrets 密钥文件是否保留且可读取；确认凭据来源后再处理连接配置。',
    'HA_ACCESS_DENIED': '检查 HA 访问令牌、账号权限及反向代理访问限制。',
    'HA_REQUEST_TIMEOUT': '检查 HA 服务响应、网络及反向代理超时设置。',
    'HA_SERVICE_NOT_FOUND': '检查日志中的实体和服务是否仍由对应集成提供，可在 Home Assistant 开发者工具核对。',
    'HA_SERVICE_PARAMETERS_REJECTED': '核对该实体支持的服务及参数要求；日志仅记录参数字段，不记录提交值。',
    'HA_UPSTREAM_UNAVAILABLE': '检查 HA 及反向代理的服务日志，服务恢复后再核对本次操作结果。',
    'HA_OPERATION_FAILED': '根据具体实体、服务和关联后台记录检查；设备操作请先核对实际状态。',
    'HA_HISTORY_ENDPOINT_UNAVAILABLE': '检查 HA 的历史记录功能及反向代理接口路径；这与本地实体目录缺失是不同的来源。',
}

#: HA 侧稳定错误码 → 一句话原因。
HA_CODE_REASONS: dict[str, str] = {
    'HA_CONNECTION_FAILED': '无法连接 Home Assistant。',
    'HA_CREDENTIAL_UNREADABLE': '无法读取已保存的 Home Assistant 连接凭据。',
    'HA_ACCESS_DENIED': 'Home Assistant 拒绝了本次访问或设备操作。',
    'HA_REQUEST_TIMEOUT': 'Home Assistant 请求超时。',
    'HA_SERVICE_NOT_FOUND': 'Home Assistant 未找到请求的设备服务或目标实体。',
    'HA_SERVICE_PARAMETERS_REJECTED': 'Home Assistant 拒绝了本次服务参数。',
    'HA_UPSTREAM_UNAVAILABLE': 'Home Assistant 或反向代理返回异常。',
    'HA_HISTORY_ENDPOINT_UNAVAILABLE': 'Home Assistant 未提供可访问的历史查询接口。',
    'HA_OPERATION_FAILED': 'Home Assistant 操作未完成，具体异常已保留在详情中。',
}


def _cause_chain(error: BaseException | str | None) -> list[BaseException | str]:
    if error is None:
        return []
    causes: list[BaseException | str] = [error]
    while isinstance(causes[-1], BaseException) and (cause := causes[-1].__cause__) is not None and len(causes) < 6:
        causes.append(cause)
    return causes


def _classify_ha_error(error: BaseException | str | None, operation: str) -> str:
    """把异常收敛成稳定错误码（顺序即优先级：越具体越前）。"""
    causes = _cause_chain(error)
    text = ' '.join(str(cause) for cause in causes)
    detail = text.casefold()
    if '解密' in text or '密钥文件' in text:
        return 'HA_CREDENTIAL_UNREADABLE'
    if any(isinstance(cause, (TimeoutError, httpx.TimeoutException)) for cause in causes) or 'timed out' in detail:
        return 'HA_REQUEST_TIMEOUT'
    if any(word in detail for word in ('not found', 'service_not_found', 'unknown service')) or re.search(r'\b404\b', detail):
        return 'HA_SERVICE_NOT_FOUND' if operation == 'service' else 'HA_HISTORY_ENDPOINT_UNAVAILABLE'
    if any(word in detail for word in ('invalid_parameters', 'invalid_format', '400')) and operation == 'service':
        return 'HA_SERVICE_PARAMETERS_REJECTED'
    if any(word in detail for word in ('token', 'auth_invalid', 'unauthorized', 'forbidden')) or re.search(r'\b(401|403)\b', detail):
        return 'HA_ACCESS_DENIED'
    if any(word in detail for word in ('certificate', 'cert_verify')):
        return 'HA_CONNECTION_FAILED'
    if any(word in detail for word in ('refused', 'no route', 'network is unreachable', 'getaddrinfo', 'name or service not known', 'connection reset', 'connection aborted')):
        return 'HA_CONNECTION_FAILED'
    if re.search(r'\b5\d\d\b', detail):
        return 'HA_UPSTREAM_UNAVAILABLE'
    return 'HA_OPERATION_FAILED'


def ha_error_context(error: BaseException | str | None, *, operation: str) -> dict[str, str]:
    """描述传输层事实，**不改动 HA 状态、也不改异常载荷**。

    ``operation`` 取 ``connect`` / ``history`` / ``service`` / ``control``，
    决定「404 是历史接口缺失还是服务不存在」这类同码不同因的归因。
    """
    code = _classify_ha_error(error, operation)
    return {
        'code': code,
        'reason': HA_CODE_REASONS[code],
        'hint': HA_CODE_HINTS[code],
    }


def connection_diagnostic_context(connection: object) -> dict[str, str]:
    """连接的可关联指纹：名称 + 配置版本（**不含**凭据本身）。

    指纹把 ``id / base_url / verify_tls / 加密令牌`` 一起哈希，因此「同一台 HA 换了地址
    或令牌」会被识别成不同的版本，日志里不会把两次不同的连接失败混成一组。
    """
    if not isinstance(getattr(connection, 'id', None), (str, int)) or not isinstance(getattr(connection, 'base_url', None), str):
        return {}
    identity = json.dumps(
        [
            str(connection.id),
            connection.base_url,
            getattr(connection, 'verify_tls', None),
            getattr(connection, 'encrypted_access_token', ''),
        ],
        separators=(',', ':'),
    )
    return {
        'connectionName': str(getattr(connection, 'name', '') or ''),
        'connectionRevision': hashlib.sha256(identity.encode()).hexdigest()[:16],
    }


def is_certificate_error(error: Exception) -> bool:
    current: BaseException | None = error
    for _ in range(6):
        detail = str(current).lower()
        if 'certificate' in detail or 'cert_verify' in detail:
            return True
        if current.__cause__ is None:
            break
        current = current.__cause__
    return False

def connection_error_message(error: Exception | str | None) -> str | None:
    if error is None:
        return None
    text = str(error)
    if not text and not isinstance(error, Exception):
        return None
    causes: list[BaseException | str] = [error]
    while isinstance(causes[-1], Exception) and (cause := causes[-1].__cause__) is not None and len(causes) < 6:
        causes.append(cause)
    detail = ' '.join(str(cause) for cause in causes).lower()
    if '解密' in text or '密钥文件' in text:
        return '无法读取已保存的 HA 访问令牌，请检查原有 secrets 密钥目录是否保留且可读取，或重新填写长期访问令牌。'
    if text.startswith('连接协议与服务不匹配'):
        return text
    if 'certificate' in detail or 'cert_verify' in detail or '证书' in detail:
        if 'expired' in detail or '过期' in detail:
            return 'Home Assistant 安全证书已过期，请更新证书后重试。'
        if any(word in detail for word in ('hostname mismatch', 'ip address mismatch', 'not valid for', '域名不匹配', '地址不匹配')):
            return '安全证书与填写的地址不匹配，请使用证书对应的域名连接。'
        return 'Home Assistant 安全证书不受信任或证书链不完整。请检查证书；使用自签名证书时，可在高级设置中明确选择仅对此连接跳过验证。'
    if any(word in detail for word in ('wrong_version_number', 'record layer failure', 'unknown protocol', 'http request', 'ssl:')):
        return '连接协议与服务不匹配，请确认该地址实际使用普通连接还是 HTTPS；关闭证书验证不能解决此问题。'
    if any(word in detail for word in ('token', 'auth_invalid', 'unauthorized', 'forbidden')) or re.search(r'\b(401|403)\b', detail):
        return 'Home Assistant 访问令牌无效、已失效或权限不足，请检查令牌和反向代理的访问限制。'
    if any(isinstance(cause, (TimeoutError, httpx.TimeoutException)) for cause in causes) or 'timeout' in detail or 'timed out' in detail:
        return '连接 Home Assistant 超时，请检查地址、端口及 HomeOS 所在设备的网络。'
    if any(word in detail for word in ('name or service not known', 'nodename nor servname', 'getaddrinfo', 'name resolution')):
        return '无法解析 Home Assistant 域名，请检查域名及 HomeOS 所在设备的 DNS 设置。'
    if 'refused' in detail:
        return 'Home Assistant 拒绝连接，请确认服务已启动，且填写的端口正确。'
    if any(word in detail for word in ('no route', 'network is unreachable', 'all connection attempts failed', 'connection reset', 'connection aborted')):
        return '无法连接 Home Assistant，请检查实际地址、端口、防火墙及 HomeOS 所在设备的网络。'
    if re.search(r'\b429\b', detail):
        return 'Home Assistant 或反向代理请求过于频繁，请稍后重试，并检查访问频率限制。'
    if 'websocket' in detail or 'opening handshake' in detail or 'close frame' in detail:
        return 'Home Assistant 实时连接失败或中断，请检查网络及反向代理是否支持 WebSocket。'
    status = re.search(r"\b(?:http\s*|status(?: code)?[ :\']*)(\d{3})\b", detail)
    if status:
        code = int(status[1])
        if code == 404:
            return '该地址没有 Home Assistant 接口，请检查服务端口及反向代理路径，不要填写仪表盘页面路径。'
        if 300 <= code < 400:
            return '该地址发生了跳转，请填写跳转后的 Home Assistant 服务地址，或检查反向代理登录限制。'
        if code >= 500:
            return f'Home Assistant 或反向代理暂时不可用（{code}），请稍后重试。'
        return f'Home Assistant 请求未成功（{code}），请检查服务和反向代理配置。'
    if re.search('[一-鿿]', text) and not re.search(r'[：:]\s*[A-Za-z\[{]', text):
        return text[:1000]
    return '连接 Home Assistant 失败，请检查服务地址和网络；详细原因可在日志中查看。'


def endpoint_failure_reason(error: BaseException | str) -> str:
    """把单个端点的探测失败压成一句短语，供「内网与外网都连不上」的汇总行使用。

    ``connection_error_message`` 给的是「怎么办」的整句建议；多个端点要拼进同一行日志时，
    每段都贴完整建议会把真正的原因淹掉。这里只回答「为什么」：网络不可达、HTTP 404、
    令牌无效……完整建议仍由界面上的错误提示负责。
    """
    text = str(error or '').strip()
    if not text:
        # httpx 的超时/连接异常常常没有消息体（如 httpx.ReadTimeout()），直接 str() 只会得到空串，
        # 日志里就剩一个光秃秃的「连接失败」。这里按异常类型补一句人话。
        name = type(error).__name__.casefold() if isinstance(error, BaseException) else ''
        if 'timeout' in name:
            return '连接超时'
        if 'connect' in name:
            return '连接失败'
        return '请求失败'
    detail = text.casefold()
    if '解密' in text or '密钥文件' in text:
        return '访问令牌无法解密'
    if any(word in detail for word in ('certificate', 'cert_verify')) or '证书' in text:
        return '证书不受信任'
    if any(word in detail for word in ('token', 'auth_invalid', 'unauthorized', 'forbidden')) or re.search(r'\b(401|403)\b', detail):
        return '访问令牌无效或权限不足'
    if 'timed out' in detail or 'timeout' in detail:
        return '连接超时'
    if any(word in detail for word in ('name or service not known', 'nodename nor servname', 'getaddrinfo', 'name resolution')):
        return '域名解析失败'
    if 'refused' in detail:
        return '连接被拒绝'
    if any(word in detail for word in ('no route', 'network is unreachable', 'all connection attempts failed', 'connection reset', 'connection aborted')):
        return '网络不可达'
    if 'websocket' in detail or 'opening handshake' in detail or 'close frame' in detail:
        return 'WebSocket 握手失败'
    status = re.search(r'\b(?:http|status(?: code)?[ :\']*)\s*(\d{3})\b', detail)
    if status:
        return f'HTTP {status.group(1)}'
    return text[:60] or '连接失败'
