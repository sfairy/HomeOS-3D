"""全局日志接口：查询、导出、清空，以及前端与未登录页面的日志上报。

日志本体存在 app.state.global_log 里（带落盘的环形缓冲），本模块只负责门禁、
分页与导出格式。两条上报通道的信任级别不同：
- /logs/events 走 CurrentViewer，必须是管理员或已配对的中控设备；
- /logs/public-events 允许未登录页面（登录页、配对页等）上报，因此额外做同源校验、
  只放行 warning / error，并单独走一套更严格的限流阈值。
"""
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
from ..http_security import resolve_client_ip

router = APIRouter(prefix='/logs', tags=['global-logs'])


class ClientLogEvent(BaseModel):
    """客户端上报的一条日志事件。

    extra='forbid' 是刻意的：上报字段固定成这几个，多传键直接 422，
    避免前端顺手塞入未脱敏的额外字段绕过下面的白名单过滤。
    """

    model_config = ConfigDict(extra='forbid')
    level: str = Field(default='info', pattern='^(info|success|warning|error)$')
    source: str = Field(default='仪表盘编辑器', min_length=1, max_length=64)
    category: str = Field(default='界面', min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    details: str | None = Field(default=None, max_length=8000)
    # 上下文限长、限量：单值 512 字符、最多 20 个键，防止前端把整个 state 对象传上来。
    context: dict[str, Annotated[str, StringConstraints(max_length=512)] | int | float | bool | None] = Field(default_factory=dict, max_length=20)
    clientTimestamp: datetime | None = None


# 允许客户端自带的上下文字段白名单：只有这些键会被写进日志，其余一律丢弃。
# 这是防敏感信息外泄的第一道闸，字段名与前端日志上报约定一致。
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
# 未登录也能上报日志的固定页面路径；带参数的子路径（/display/*、/3d-studio/*）
# 由下面的 startswith 分支单独放行。
PUBLIC_PAGES = {
    '/',
    '/pair',
    '/login',
    '/setup',
    '/display',
    '/license',
    '/3d-studio',
}

#: 公开通道（无需登录）的事件在落库前统一加这个来源标记（B62）：这条文本来自
#: 外部上报，没有身份背书，必须与系统自身记录一眼可分。
PUBLIC_EVENT_MARKER = '[公开上报] '
#: 公开通道的长度上限：比已认证通道紧得多。正文短到「够定位异常」即可，
#: 细节留给已认证通道 —— 审计日志的存储不该由未登录页面决定。
PUBLIC_EVENT_MESSAGE_LIMIT = 300
PUBLIC_EVENT_DETAILS_LIMIT = 1200
#: 匿名通道每分钟允许的上报条数（已认证通道 120）。匿名通道是「异常上报」，
#: 正常页面的 15 分钟窗口里到不了这个数；而刷日志的成本被压到 10 条/分钟/IP。
ANONYMOUS_CLIENT_LOG_PER_MINUTE = 10


class ClientLogLimiter:
    """客户端日志上报的双层限流器。

    目标是「限制匿名上报」又不让每个任意 IP 都在内存里留下常驻记录：
    每个 peer 只保留一个 60 秒滑动窗口，客户端条目数封顶并按 LRU 淘汰，
    另外再加一个全局窗口兜住「不停换 IP 刷日志」的情况。
    """

    def __init__(self) -> None:
        """初始化按 peer 与全局两个滑动窗口，以及保护它们的锁。"""
        self._lock = threading.Lock()
        # 按 peer 的窗口；键的插入顺序即最近使用顺序，供 LRU 淘汰使用。
        self._clients = OrderedDict()
        # 全局窗口：兜住不断更换 IP 上报的情况。
        self._all = deque()

    def allow(self, peer: str, *, anonymous: bool) -> bool:
        """判断本次上报是否放行；匿名通道阈值更低。

        参数:
            peer: 客户端地址，取不到时为 'unknown'。
            anonymous: 是否为未登录页面（匿名）通道。
        """
        now = time.monotonic()
        with self._lock:
            # 取不到就建空窗口；重新插回队尾，使 OrderedDict 的顺序即最近使用顺序。
            bucket = self._clients.pop(peer, deque())
            self._clients[peer] = bucket
            # 客户端条目上限：防止大量伪造 IP 把内存撑成一张巨大的表。
            while len(self._clients) > 512:
                self._clients.popitem(last=False)
            # 60 秒滑动窗口：分别清理该 peer 的窗口与全局窗口中的过期时间戳。
            for queue in (bucket, self._all):
                if not queue:
                    continue
                while queue[0] <= now - 60:
                    queue.popleft()
                    if not queue:
                        break
            # 匿名每分钟 10 条（见 ANONYMOUS_CLIENT_LOG_PER_MINUTE）、已登录 120 条，
            # 全局 600 条：全局那一档兜住「不停换 IP 上报」。
            if len(bucket) >= (ANONYMOUS_CLIENT_LOG_PER_MINUTE if anonymous else 120) or len(self._all) >= 600:
                return False
            bucket.append(now)
            self._all.append(now)
            return True


def _limit_client_log(request: Request, *, anonymous: bool) -> None:
    """对上报做限流，超限抛 429 并带 Retry-After。

    限流器懒挂在全局日志对象上并复用它已有的锁：状态随日志对象一起存活，
    不必为日志模块单独维护一个全局单例，也不会额外引入一把锁。
    """
    store = request.app.state.global_log
    with store._lock:
        if not hasattr(store, 'client_limiter'):
            store.client_limiter = ClientLogLimiter()
        limiter = store.client_limiter
    # 取不到地址时全部归到同一个桶，避免未知来源绕过限流。
    # 走统一解析：配了可信代理就按真实客户端计数，否则用 TCP 对端地址。
    address = resolve_client_ip(request)
    peer = address.ip or 'unknown'
    if not limiter.allow(peer, anonymous=anonymous):
        raise HTTPException(status_code=429, detail='日志上报过于频繁，请稍后重试。', headers={'Retry-After': '60'})


def _append_client_event(payload: ClientLogEvent, request: Request, viewer=None, *, public: bool = False) -> None:
    """把一条客户端事件整理成日志条目写入全局日志。

    身份三选一决定 source 与 actor：管理员沿用上报自带的 source、中控设备标注
    设备与项目、未登录页面统一记为「未登录页面 / 未登录」。
    上下文先按白名单过滤键，再交给 safe_context 做敏感值遮盖。

    ``public=True`` 表示这条走的是「无需登录」的公开通道（B62）：内容没有任何身份
    背书，因此统一加来源标记并收窄长度上限 —— 未登录页面能写进后台审计日志的文本，
    必须一眼能认出「这是外部上报的」，而不是混在系统自身的记录里。
    """
    message = payload.message
    details = payload.details
    if public:
        message = PUBLIC_EVENT_MARKER + message[:PUBLIC_EVENT_MESSAGE_LIMIT]
        details = details[:PUBLIC_EVENT_DETAILS_LIMIT] if details else None
    context = safe_context({
        key: value
        for key, value in payload.context.items()
        if key in CLIENT_CONTEXT_KEYS
    })
    # UA 截断到 384 字符：够定位浏览器版本，又不会被超长头把条目撑大。
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
    # 清空日志上下文：客户端事件是独立上报，不该被当前请求的 actor / 路径污染。
    token = event_context.set({})
    try:
        request.app.state.global_log.append(
            payload.level,
            source,
            payload.category,
            message,
            context=context,
            details=details,
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
    """把全局日志导出成纯文本附件（需已登录）。

    查询参数: level / category / search，语义与列表接口一致。
    返回 text/plain 附件，每行一条记录，字段用 ' | ' 拼接；除消息本体外还带上
    重复次数、最近发生时间与客户端时间，方便排查前端偶发问题。
    """
    # list_events 是「最新在前」，这里再倒序一次，让导出的文件按时间正序排列，
    # 用文本工具打开时更接近一条时间线。
    items = list(reversed(request.app.state.global_log.list_events(limit=None, level=level, category=category, search=search)))
    # 级别转中文标签；未知级别回落到「信息」，与前端筛选下拉的用词一致。
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
    """分页查询全局日志（需已登录）。

    查询参数: level / category / search 过滤，limit（默认 500，上限 2000）与
    offset（上限 100 万）分页。
    返回 items（当前页）、total（过滤后的总条数）、categories（全量分类清单）、
    hasMore / nextOffset（给前端「加载更多」用的游标）以及 retentionDays 与
    storage（日志文件占用与健康状态）。
    """
    # 先取出过滤后的全量再在内存里切片：日志本就在内存中，这样 total、hasMore
    # 与当前页结果天然同源，不会出现「总数比翻得到的条数多」的错位。
    matching = request.app.state.global_log.list_events(level=level, category=category, search=search, limit=None)
    items = matching[offset:offset + limit]
    all_items = request.app.state.global_log.list_events(limit=None)
    # 分类清单取未过滤的全量日志，否则一旦按 level 筛选，下拉框里的分类会缺项。
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
    """接收已认证页面 / 设备上报的日志事件（需已认证）。

    门禁：CurrentViewer（管理员或已配对中控设备），匿名标志为 False，
    走更宽松的限流阈值。成功固定返回 204 无正文。
    """
    _limit_client_log(request, anonymous=False)
    _append_client_event(payload, request, viewer)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post('/public-events', status_code=status.HTTP_204_NO_CONTENT)
def create_public_client_log_event(payload: ClientLogEvent, request: Request, response: Response, database: DatabaseSession) -> Response:
    """接收未登录页面上报的日志事件（无需登录，但必须同源）。

    门禁顺序：同源校验 → 只收 warning / error → 页面路径必须在 PUBLIC_PAGES
    或其子路径内 → 匿名限流 → 尝试解析身份（解析不到就按匿名记录）。
    身份解析失败不算错误：未登录页面上报本来就是这个接口的常态。
    """
    # Origin 必须与 Host 完全一致，避免被跨站页面当成日志注入通道。
    origin = urlsplit(request.headers.get('origin', ''))
    if origin.scheme not in frozenset({'http', 'https'}) or origin.netloc.casefold() != request.headers.get('host', '').casefold():
        raise HTTPException(status_code=403, detail='日志只允许同源页面上报。')
    # 未登录页面只允许上报异常：正常信息没有上报价值，也堵住刷日志的水位。
    # 直接 204 丢掉，而不是 422：日志通道是 fire-and-forget，打回 422 只会让
    # 浏览器控制台刷红，对运营与排障都没有帮助（旧版客户端偶发会误投 info）。
    if payload.level not in frozenset({'error', 'warning'}):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    # 先剥掉查询串与哈希、再去尾部斜杠，防止用 ?x 之类的小把戏绕过页面白名单。
    page = str(payload.context.get('page') or '').split('?', 1)[0].split('#', 1)[0].rstrip('/') or '/'
    if page not in PUBLIC_PAGES and not page.startswith(('/display/', '/3d-studio/')):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    _limit_client_log(request, anonymous=True)
    try:
        viewer = authenticated_viewer(request, response, database)
    except HTTPException as error:
        # 401 就是「没登录」，正是本接口要服务的场景；其余错误照常抛出。
        if error.status_code != 401:
            raise
        viewer = None
    # public=True：这条来自「无需登录」的通道，落库前加来源标记并收窄长度（B62）。
    _append_client_event(payload, request, viewer, public=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete('', status_code=status.HTTP_204_NO_CONTENT)
def clear_global_logs(request: Request, user: CurrentUser) -> Response:
    """清空全部全局日志（需已登录）。

    清空后立刻补记一条「由谁清空」，避免日志出现无从解释的空白。
    """
    request.app.state.global_log.clear()
    # 补记的这一条落在清空之后，所以它能留下来，成为唯一的清理痕迹。
    request.app.state.global_log.append('info', '系统后台', '系统', f'全局日志已由 {user.username} 清空')
    return Response(status_code=status.HTTP_204_NO_CONTENT)
