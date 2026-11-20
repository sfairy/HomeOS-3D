"""全局日志接口：查询、导出、清空，以及前端与未登录页面的日志上报。"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import OrderedDict, deque
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..dependencies import CurrentUser, CurrentViewer, DatabaseSession, authenticated_viewer
from ..domains.logs.global_log import event_context, format_log_context, safe_context
from ..platform.core.http.frontend_resources import read_resource_revision
from ..platform.core.runtime.client_metrics import record_client_metric
from ..platform.security.client_address import resolve_client_address_from_request
from ..platform.security.login_limiter import retry_after_headers
from ..platform.security.request_origin import browser_origin_allowed

router = APIRouter(prefix='/logs', tags=['global-logs'])
logger = logging.getLogger(__name__)


class ClientLogEvent(BaseModel):

    model_config = ConfigDict(extra='forbid')
    level: str = Field(default='info', pattern='^(info|success|warning|error)$')
    source: str = Field(default='仪表盘编辑器', min_length=1, max_length=64)
    category: str = Field(default='界面', min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    details: str | None = Field(default=None, max_length=8000)
    context: dict[str, Annotated[str, StringConstraints(max_length=512)] | int | float | bool | None] = Field(default_factory=dict, max_length=32)
    clientTimestamp: datetime | None = None


CLIENT_CONTEXT_KEYS = {
    'code',
    'hint',
    'line',
    'page',
    'path',
    'hours',
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
    'reason',
    'eventType',
    'operation',
    'modelType',
    'appVersion',
    'entityName',
    'projectName',
    'componentName',
    'componentIds',
    'correlationId',
    'droppedEvents',
    'pageSessionId',
    'clientFrontendRevision',
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
    """匿名上报只允许同源页面（判据与写操作共用 :func:`browser_origin_allowed`）。"""
    if not browser_origin_allowed(request, public_report=True):
        raise HTTPException(status_code=403, detail='只允许同源页面上报。')


def _matches_request_id(item: dict, request_id: str) -> bool:
    context = item.get('context') or {}
    if item.get('id') == request_id:
        return True
    if request_id in {context.get('requestId'), context.get('firstRequestId'), context.get('lastRequestId')}:
        return True
    recent = context.get('requestIds')
    return isinstance(recent, list) and request_id in recent


def _matches_correlation(item: dict, correlation_id: str) -> bool:
    if item.get('id') == correlation_id:
        return True
    return (item.get('context') or {}).get('correlationId') == correlation_id


def _event_request_ids(item: dict) -> set[str]:
    """一条事件里出现过的全部请求编号（含合并后的首次 / 最近 / 近期）。"""
    context = item.get('context') or {}
    found = {str(context[key]) for key in ('requestId', 'firstRequestId', 'lastRequestId') if context.get(key)}
    recent = context.get('requestIds')
    if isinstance(recent, list):
        found.update(str(value) for value in recent if value)
    return found


def _related_items(items: list[dict], request_id: str | None, correlation_id: str | None) -> list[dict]:
    """按 `requestId` / `correlationId` 取「同一次故障」的完整事件组。

    先选中锚点（编号直接命中），再把锚点里的关联编号与近期请求编号展开一轮 —— 这样
    一条被合并计数的事件能把它合并过的所有请求一起带出来。
    """
    if not request_id and not correlation_id:
        return items
    selected = {
        index
        for index, item in enumerate(items)
        if (request_id and _matches_request_id(item, request_id))
        or (correlation_id and _matches_correlation(item, correlation_id))
    }
    if not selected:
        return []
    correlations = {
        (items[index].get('context') or {}).get('correlationId') for index in selected
    }
    correlations.discard(None)
    request_ids: set[str] = set()
    for index in selected:
        request_ids.update(_event_request_ids(items[index]))
    for index, item in enumerate(items):
        context = item.get('context') or {}
        if context.get('correlationId') in correlations or context.get('requestId') in request_ids:
            selected.add(index)
    return [item for index, item in enumerate(items) if index in selected]


def _export_heading(store, *, version: str, revision: str | None, count: int) -> str:
    """导出文件头：版本与保留策略写清楚，避免「日志看起来少」被误解为「没发生」。"""
    storage = store.storage_status()
    return (
        'HomeOS 全局诊断日志\n'
        f'导出时程序版本：{version or "未知"}\n'
        f'导出时前端修订：{revision or "未知"}\n'
        f'本次筛选事件：{count} 条；保留最近 {store.retention_days} 天，上限 {store.max_bytes // 1048576} MB\n'
        f'存储待写：{storage.get("pendingEvents", 0)} 条；存储累计丢弃：{storage.get("droppedEvents", 0)} 条\n'
        '同一故障可能合并计数；关联事件编号连接完整故障组，首次/最近及近期请求编号保留具体请求线索。\n'
        '旧记录缺少的字段表示当时未采集；未记录不代表未发生。\n\n'
    )


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
            # 已登录日志上报 120 条/分钟：后端 / HA 重启一次就会同时冒出十几条
            # 「网络连接失败」与「实时状态连接已断开（1006）」，30 条/分钟的旧预算
            # 会被一波启动风暴直接打穿（表现为控制台 POST /api/v1/logs/events 429，
            # 事件被迫退避几分钟才补传）。匿名上报仍沿用 30 条/分钟；
            # Web Vitals 每 10s 一批（最多 8 项）同样 120 条/分钟。全局 600 条/分钟兜底。
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
def export_global_logs(request: Request, _user: CurrentUser, level: str | None = Query(None, pattern='^(info|success|warning|error)$'), category: str | None = Query(None, max_length=64), search: str | None = Query(None, max_length=128), requestId: str | None = Query(None, max_length=64), correlationId: str | None = Query(None, max_length=64)) -> PlainTextResponse:
    items = list(reversed(request.app.state.global_log.list_events(limit=None, level=level, category=category, search=search)))
    items = _related_items(items, requestId, correlationId)
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
    settings = request.app.state.settings
    heading = _export_heading(
        request.app.state.global_log,
        version=getattr(settings, 'version', ''),
        revision=_frontend_revision(settings),
        count=len(items),
    )
    return PlainTextResponse(heading + content, media_type='text/plain; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="homeos-global-log.txt"'})


def _frontend_revision(settings) -> str | None:
    """读取构建期资源修订；读不到（源码态未构建）时只记 debug，不阻塞导出。"""
    try:
        return read_resource_revision(settings.frontend_dir)
    except (OSError, ValueError, KeyError):
        logger.debug('读取前端资源修订失败，导出头回落到「未知」', exc_info=True)
        return None


@router.get('')
def list_global_logs(request: Request, _user: CurrentUser, level: str | None = Query(None, pattern='^(info|success|warning|error)$'), category: str | None = Query(None, max_length=64), search: str | None = Query(None, max_length=128), limit: int = Query(500, ge=1, le=2000), offset: int = Query(0, ge=0, le=1000000), requestId: str | None = Query(None, max_length=64), correlationId: str | None = Query(None, max_length=64)) -> dict:
    matching, categories = request.app.state.global_log.list_events_with_categories(
        level=level,
        category=category,
        search=search,
        limit=None,
    )
    matching = _related_items(matching, requestId, correlationId)
    items = matching[offset:offset + limit]
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
        'related': bool(requestId or correlationId),
    }


@router.post('/events', status_code=status.HTTP_204_NO_CONTENT)
def create_client_log_event(payload: ClientLogEvent, request: Request, viewer: CurrentViewer) -> Response:
    # 已登录页面独占一个客户端预算：一次启动风暴（后端/HA 重启）能在一个窗口里
    # 产生 40+ 条上报，沿用匿名侧的 30 条/分钟必然 429，见 ClientLogLimiter.allow。
    _limit_client_log(request, anonymous=False, per_client_limit=120)
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
