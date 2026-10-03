'''Chinese connection messages for setup and historical/runtime failures.'''
from __future__ import annotations

import re

import httpx


def is_certificate_error(error: Exception) -> bool:
    for _ in range(6):
        detail = str(error).lower()
        if 'certificate' in detail or 'cert_verify' in detail:
            return True
        if error.__cause__ is None:
            break
        error = error.__cause__
    return False

def connection_error_message(error: Exception | str | None) -> str | None:
    if error is None:
        return None
    text = str(error)
    if not text and not isinstance(error, Exception):
        return None
    causes = [error]
    while isinstance(causes[-1], Exception) and causes[-1].__cause__ and len(causes) < 6:
        causes.append(causes[-1].__cause__)
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
