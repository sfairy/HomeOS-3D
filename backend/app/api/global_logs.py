from __future__ import annotations

import json
import threading
import time
from collections import OrderedDict, deque
from datetime import datetime
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..dependencies import CurrentUser, CurrentViewer, DatabaseSession, authenticated_viewer
from ..global_log import event_context, safe_context

router = APIRouter(prefix='/logs', tags=['global-logs'])


class ClientLogEvent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    level: str = Field(default='info', pattern='^(info|success|warning|error)$')
    source: str = Field(default='仪表盘编辑器', min_length=1, max_length=64)
    category: str = Field(default='界面', min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    details: str | None = Field(default=None, max_length=8000)
    context: dict[str, Annotated[str, StringConstraints(max_length=512)] | int | float | bool | None] = Field(default_factory=dict, max_length=20)
    clientTimestamp: datetime | None = None


CLIENT_CONTEXT_KEYS = {
    'code',
    'line',
    'page',
    'path',
    'phase',
    'column',
    'method',
    'status',
    'service',
    'entityId',
    'projectId',
    'requestId',
    'userAgent',
    'durationMs',
    'componentId',
}
PUBLIC_PAGES = {
    '/',
    '/pair',
    '/login',
    '/setup',
    '/display',
    '/license',
    '/3d-studio',
}


class ClientLogLimiter:
    """Bound anonymous reporting without growing one entry per arbitrary IP."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients = OrderedDict()
        self._all = deque()

    def allow(self, peer: str, *, anonymous: bool) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._clients.pop(peer, deque())
            self._clients[peer] = bucket
            while len(self._clients) > 512:
                self._clients.popitem(last=False)
            for queue in (bucket, self._all):
                if not queue:
                    continue
                while queue[0] <= now - 60:
                    queue.popleft()
                    if not queue:
                        break
            if len(bucket) >= (30 if anonymous else 120) or len(self._all) >= 600:
                return False
            bucket.append(now)
            self._all.append(now)
            return True


def _limit_client_log(request: Request, *, anonymous: bool) -> None:
    store = request.app.state.global_log
    with store._lock:
        if not hasattr(store, 'client_limiter'):
            store.client_limiter = ClientLogLimiter()
        limiter = store.client_limiter
    peer = request.client.host if request.client else 'unknown'
    if not limiter.allow(peer, anonymous=anonymous):
        raise HTTPException(status_code=429, detail='日志上报过于频繁，请稍后重试。', headers={'Retry-After': '60'})


def _append_client_event(payload: ClientLogEvent, request: Request, viewer=None) -> None:
    context = safe_context({
        key: value
        for key, value in payload.context.items()
        if key in CLIENT_CONTEXT_KEYS
    })
    context['userAgent'] = request.headers.get('user-agent', '')[:384]
    if viewer is not None and viewer.is_admin_session:
        source = payload.source
        context['actor'] = viewer.user.username
    elif viewer is not None:
        source = '展示设备'
        context.update(
            displayId=viewer.display.id,
            displayName=viewer.display.name,
            projectId=viewer.project_id,
        )
    else:
        source = '未登录页面'
        context['actor'] = '未登录'
    token = event_context.set({})
    try:
        request.app.state.global_log.append(
            payload.level,
            source,
            payload.category,
            payload.message,
            context=context,
            details=payload.details,
            client_timestamp=payload.clientTimestamp.isoformat() if payload.clientTimestamp else None,
        )
    finally:
        event_context.reset(token)


@router.get('/export', response_class=PlainTextResponse)
def export_global_logs(
    request: Request,
    _user: CurrentUser,
    level: str | None = Query(None, pattern='^(info|success|warning|error)$'),
    category: str | None = Query(None, max_length=64),
    search: str | None = Query(None, max_length=128),
) -> PlainTextResponse:
    items = list(reversed(request.app.state.global_log.list_events(limit=None, level=level, category=category, search=search)))
    level_labels = {'info': '信息', 'success': '成功', 'warning': '警告', 'error': '错误'}
    content = '\n'.join(
        ' | '.join(
            (
                str(item.get('timestamp') or ''),
                str(level_labels.get(str(item.get('level') or ''), '信息')),
                str(item.get('source') or '系统后台'),
                str(item.get('category') or '系统'),
                str(item.get('message') or ''),
                f"次数={item.get('repeatCount', 1)}",
                f"最近发生={item.get('lastTimestamp') or item.get('timestamp') or ''}",
                f"客户端发生时间={item.get('clientTimestamp') or ''}",
                f"客户端最近发生={item.get('lastClientTimestamp') or item.get('clientTimestamp') or ''}",
                json.dumps(item.get('context') or {}, ensure_ascii=False, separators=(',', ':')),
                str(item.get('details') or ''),
            )
        )
        for item in items
    )
    return PlainTextResponse(content, media_type='text/plain; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="homeos-global-log.txt"'})


@router.get('')
def list_global_logs(
    request: Request,
    _user: CurrentUser,
    level: str | None = Query(None, pattern='^(info|success|warning|error)$'),
    category: str | None = Query(None, max_length=64),
    search: str | None = Query(None, max_length=128),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0, le=1000000),
) -> dict:
    matching = request.app.state.global_log.list_events(level=level, category=category, search=search, limit=None)
    items = matching[offset:offset + limit]
    all_items = request.app.state.global_log.list_events(limit=None)
    categories = sorted({
        str(item.get('category') or '')
        for item in all_items
        if item.get('category')
    })
    store = request.app.state.global_log
    return {
        'items': items,
        'categories': categories,
        'retentionDays': store.retention_days,
        'total': len(matching),
        'offset': offset,
        'hasMore': offset + len(items) < len(matching),
        'nextOffset': offset + len(items),
        'storage': store.storage_status(),
    }


@router.post('/events', status_code=status.HTTP_204_NO_CONTENT)
def create_client_log_event(payload: ClientLogEvent, request: Request, viewer: CurrentViewer) -> Response:
    _limit_client_log(request, anonymous=False)
    _append_client_event(payload, request, viewer)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post('/public-events', status_code=status.HTTP_204_NO_CONTENT)
def create_public_client_log_event(payload: ClientLogEvent, request: Request, response: Response, database: DatabaseSession) -> Response:
    origin = urlsplit(request.headers.get('origin', ''))
    if origin.scheme not in frozenset({'http', 'https'}) or origin.netloc.casefold() != request.headers.get('host', '').casefold():
        raise HTTPException(status_code=403, detail='日志只允许同源页面上报。')
    if payload.level not in frozenset({'error', 'warning'}):
        raise HTTPException(status_code=422, detail='未登录页面只能上报异常。')
    page = str(payload.context.get('page') or '').split('?', 1)[0].split('#', 1)[0].rstrip('/') or '/'
    if page not in PUBLIC_PAGES and not page.startswith(('/display/', '/3d-studio/')):
        raise HTTPException(status_code=422, detail='不支持的页面。')
    _limit_client_log(request, anonymous=True)
    try:
        viewer = authenticated_viewer(request, response, database)
    except HTTPException as error:
        if error.status_code != 401:
            raise
        viewer = None
    _append_client_event(payload, request, viewer)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete('', status_code=status.HTTP_204_NO_CONTENT)
def clear_global_logs(request: Request, user: CurrentUser) -> Response:
    request.app.state.global_log.clear()
    request.app.state.global_log.append('info', '系统后台', '系统', f'全局日志已由 {user.username} 清空')
    return Response(status_code=status.HTTP_204_NO_CONTENT)
