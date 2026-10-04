'''独立的 iframe 凭据保留仅 display 访问权限，且不受来源限制。'''
from __future__ import annotations

import re
from urllib.parse import urlsplit

from .display_access import active_display_device

COOKIE_PREFIX = 'homeos_embed_'

def embedded_devices(connection, database):
    devices = []
    for name, token in connection.cookies.items():
        if not name.startswith(COOKIE_PREFIX):
            continue
        device = active_display_device(database, token)
        if device is None:
            continue
        if name != COOKIE_PREFIX + device.project_id:
            continue
        devices.append(device)
    return tuple(sorted(devices, key = lambda item: item.project_id))

def set_embedded_cookie(request, response, project_id: str, token: str) -> None:
    settings = request.app.state.settings
    secure = request.url.scheme == 'https' or settings.cookie_secure or urlsplit(settings.app_base_url).scheme == 'https'
    response.set_cookie(COOKIE_PREFIX + project_id, token, max_age = settings.display_cookie_max_age_seconds, httponly = True, secure = secure, samesite = 'none' if secure else 'lax', path = '/')
    if secure:
        (key, value) = response.raw_headers[-1]
        response.raw_headers[-1] = (key, value + b'; Partitioned')

class EmbedSessionMiddleware:
    """把 display 的可撤销 bearer 凭据保存在私有 URL 命名空间下。

    相对模块继承该命名空间；bootstrap 会限定运行时 URL 的范围。
    常规授权检查仍以恰好一个 display 身份运行。
    管理员 cookie 与其他已配对项目都不会跨越此边界。
    """

    def __init__(self, app, settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        match = re.match('^/embed/([A-Za-z0-9_-]{43})(/.*)$', scope.get('path', ''))
        if scope['type'] not in {'http', 'websocket'} or not match:
            await self.app(scope, receive, send)
            return
        (token, path) = match.groups()
        prefix = '/embed/' + token
        scope['path'] = path
        scope['raw_path'] = path.encode('utf-8')
        scope.setdefault('state', { })['embed_prefix'] = prefix
        scope['headers'] = [ (key, value) for (key, value) in scope['headers'] if key.lower() != b'cookie' ]
        scope['headers'].append((b'cookie', f'{self.settings.display_cookie_name}={token}'.encode()))
        start = None
        chunks = []
        rewrite_type = None

        async def scoped_send(message):
            nonlocal rewrite_type, start
            if message['type'] == 'http.response.start':
                headers = [ (key, value) for (key, value) in message['headers'] if key.lower() != b'set-cookie' ]
                content_type = next((value for (key, value) in headers if key.lower() == b'content-type'), b'')
                rewrite_type = 'html' if content_type.startswith(b'text/html') else 'css' if content_type.startswith(b'text/css') else None
                message = { **message, 'headers': headers }
                if rewrite_type:
                    start = message
                    return
            elif message['type'] == 'http.response.body' and rewrite_type:
                chunks.append(message.get('body', b''))
                if message.get('more_body'):
                    return
                body = b''.join(chunks)
                root = prefix.encode()
                if rewrite_type == 'html':
                    body = re.sub(b'(\\b(?:src|href|poster)=["\'])(/[^/])', lambda m: m[1] + root + m[2], body)
                    bootstrap = b'<script src="' + root + b'/static/embed-runtime.js"></script>'
                    body = body.replace(b'<head>', b'<head>' + bootstrap, 1)
                else:
                    body = re.sub(b'(url\\(\\s*["\']?)(/[^/])', lambda m: m[1] + root + m[2], body)
                assert start is not None
                start['headers'] = [ (key, value) for (key, value) in start['headers'] if key.lower() not in {b'etag', b'cache-control', b'content-length'} ]
                start['headers'].extend([ (b'content-length', str(len(body)).encode()), (b'cache-control', b'private, no-store') ])
                await send(start)
                await send({'type': 'http.response.body', 'body': body})
                return
            await send(message)

        await self.app(scope, receive, scoped_send)
