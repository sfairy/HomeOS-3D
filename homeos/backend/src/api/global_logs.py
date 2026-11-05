"""全局日志接口：查询、导出、清空，以及前端与未登录页面的日志上报。"""

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
from ..domains.logs.global_log import event_context, format_log_context, safe_context
from ..platform.core.runtime.client_metrics import record_client_metric
from ..platform.security.client_address import resolve_client_address_from_request
from ..platform.security.login_limiter import retry_after_headers

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
    '/register',
    '/reset-password',
    '/display',
    '/license-recovery',
    '/3d-studio',
}


class ClientMetricSample(BaseModel):

    model_config = ConfigDict(extra='forbid')
    page: str = Field(default='/', max_length=128)
    name: str = Field(pattern='^(lcp|fcp|ttfb|inp|longtask|cls|error|ws_reconnect)$')
    value: float = Field(ge=0, le=600000, allow_inf_nan=False)


def _require_same_origin(request: Request) -> None:
    host = request.headers.get('host', '').casefold()
    raw_origin = request.headers.get('origin', '')
    if not raw_origin:
        # sendBeacon / fetch keepalive 在部分浏览器不发送 Origin（同源请求允许省略）。
        # 该端点只写聚合计数、无鉴权无副作用，匿名滥用由限流兜底，因此缺省放行；
        # 一旦浏览器带了 Origin（跨站请求必带），仍按同源校验拦截。
        return
    origin = urlsplit(raw_origin)
    if origin.scheme not in {'http', 'https'} or origin.netloc.casefold() != host:
        raise HTTPException(status_code=403, detail='只允许同源页面上报。')


class ClientLogLimiter:
    '限制匿名上报，避免为每个任意 IP 各增长一条记录。'


    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients = OrderedDict()
        self._all = deque()

    def allow(self, peer: str, *, anonymous: bool, per_client_limit: int = 30) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._clients.pop(peer, deque())
            self._clients[peer] = bucket
            while len(self._clients) > 512:
                self._clients.popitem(last=False)
            for queue in (bucket, self._all):
                while queue and queue[0] <= now - 60:
                    queue.popleft()
            # 日志上报沿用 30 条/分钟；Web Vitals 每 10s 一批（最多 8 项）单独给
            # 120 条/分钟，否则正常 RUM 会被限流。全局 600 条/分钟兜底。
            if len(bucket) >= per_client_limit or len(self._all) >= 600:
                return False
            bucket.append(now)
            self._all.append(now)
            return True


def _limit_client_log(request: Request, *, anonymous: bool, per_client_limit: int = 30) -> None:
    store = request.app.state.global_log
    with store._lock:
        if not hasattr(store, 'client_limiter'):
            store.client_limiter = ClientLogLimiter()
        limiter = store.client_limiter
    # 匿名上报按可信代理解析后的真实客户端分桶：直接用 TCP 对端地址时，
    # 经镜像内置回环反代部署的客户端会共享同一个桶（30 条/分钟），
    # 一个页面刷屏就会让所有人的上报被 429 拦截。无法判定客户端时退化为全局桶。
    address = resolve_client_address_from_request(request)
    peer = address.ip if address.per_client and address.ip else 'unknown'
    if not limiter.allow(peer, anonymous=anonymous, per_client_limit=per_client_limit):
        raise HTTPException(status_code=429, detail='日志上报过于频繁，请稍后重试。', headers=retry_after_headers(60))


def _append_client_event(payload: ClientLogEvent, request: Request, viewer=None) -> None:
    context = safe_context({
        key: value
        for key, value in payload.context.items()
        if key in CLIENT_CONTEXT_KEYS
    })
    context['userAgent'] = request.headers.get('user-agent', '')[:384]
    if viewer is not None:
        source = payload.source
        context['actor'] = viewer.user.username
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
def export_global_logs(request: Request, _user: CurrentUser, level: str | None = Query(None, pattern='^(info|success|warning|error)$'), category: str | None = Query(None, max_length=64), search: str | None = Query(None, max_length=128)) -> PlainTextResponse:
    items = list(reversed(request.app.state.global_log.list_events(limit=None, level=level, category=category, search=search)))
    level_labels = {'info': '信息', 'success': '成功', 'warning': '警告', 'error': '错误'}
    content = '\n'.join(
        ' | '.join(
            (
                str(item.get('timestamp') or ''),
                level_labels.get(str(item.get('level') or ''), '信息'),
                str(item.get('source') or '系统后台'),
                str(item.get('category') or '系统'),
                str(item.get('message') or ''),
                f"次数={item.get('repeatCount', 1)}",
                f"最近发生={item.get('lastTimestamp') or item.get('timestamp') or ''}",
                f"客户端发生时间={item.get('clientTimestamp') or ''}",
                f"客户端最近发生={item.get('lastClientTimestamp') or item.get('clientTimestamp') or ''}",
                json.dumps(item.get('context') or {}, ensure_ascii=False, separators=(',', ':')),
                format_log_context(item.get('context') or {}),
                str(item.get('details') or ''),
            )
        )
        for item in items
    )
    return PlainTextResponse(content, media_type='text/plain; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="homeos-global-log.txt"'})


@router.get('')
def list_global_logs(request: Request, _user: CurrentUser, level: str | None = Query(None, pattern='^(info|success|warning|error)$'), category: str | None = Query(None, max_length=64), search: str | None = Query(None, max_length=128), limit: int = Query(500, ge=1, le=2000), offset: int = Query(0, ge=0, le=1000000)) -> dict:
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
    _require_same_origin(request)
    if payload.level not in {'error', 'warning'}:
        raise HTTPException(status_code=422, detail='未登录页面只能上报异常。')
    page = str(payload.context.get('page') or '').split('?', 1)[0].split('#', 1)[0].rstrip('/') or '/'
    if page not in PUBLIC_PAGES and not page.startswith(('/display/', '/homeos/', '/3d-studio/')):
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


@router.post('/public-metrics', status_code=status.HTTP_204_NO_CONTENT)
def create_public_client_metric(payload: ClientMetricSample, request: Request) -> Response:
    """匿名 Web Vitals / 错误 / 重连上报；同源 + 限流，聚合进 `/metrics`。"""
    _require_same_origin(request)
    _limit_client_log(request, anonymous=True, per_client_limit=120)
    record_client_metric(payload.name, payload.page, payload.value)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete('', status_code=status.HTTP_204_NO_CONTENT)
def clear_global_logs(request: Request, user: CurrentUser) -> Response:
    request.app.state.global_log.clear()
    request.app.state.global_log.append('info', '系统后台', '系统', f'全局日志已由 {user.username} 清空')
    return Response(status_code=status.HTTP_204_NO_CONTENT)
