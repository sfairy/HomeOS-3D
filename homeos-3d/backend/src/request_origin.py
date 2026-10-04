'''Browser-origin guard for writes that do not require a JSON request body.'''
from urllib.parse import urlsplit

from fastapi import HTTPException, Request


def require_same_origin_write(request: Request) -> None:
    site = request.headers.get('sec-fetch-site', '').strip().lower()
    if site and site != 'same-origin':
        raise HTTPException(403, detail = '此操作只允许从当前应用页面发起。')
    origin = request.headers.get('origin')
    referer = request.headers.get('referer') if origin is None else None
    raw_source = origin if origin is not None else referer
    if raw_source is None:
        return
    try:
        source = urlsplit(raw_source.strip())
        valid = source.scheme in {'http', 'https'} and bool(source.netloc) and source.username is None and source.password is None
        if origin is not None:
            valid = valid and not (source.path or source.query or source.fragment)
        configured = request.app.state.settings.app_base_url
        if configured:
            expected = urlsplit(configured)
            valid = valid and (source.scheme, source.netloc.casefold()) == (expected.scheme, expected.netloc.casefold())
        else:
            valid = valid and source.netloc.casefold() == request.headers.get('host', '').casefold() and (source.scheme == request.url.scheme or site == 'same-origin')
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(403, detail = '此操作只允许从当前应用页面发起。')
