"""媒体代理的支撑件：快照/列表缓存、HLS 归属与预热器、路径判定与配额常量。

从 api/ha_proxy.py 拆出来：那一份只留「路由 + 逐请求的转发逻辑」，而缓存与预热器是**进程级**
状态机（谁在放、放了多久、失败几次重试），与「怎么转发一个请求」是两件事。拆开之后
路由文件回到 800 行预算内，两边的改动也互不打扰。

依赖方向是单向的：ha_proxy 从这里 import 常量与判定函数，本模块**不** import ha_proxy
（否则就是一个模块级环，两个文件谁先加载都会炸）。
"""
from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from urllib.parse import urlparse

import httpx
from fastapi.responses import Response
from sqlalchemy import select

from ..core.database import Database
from ..core.models import ProjectDraft
from ..http.http_cache import PRIVATE_NO_STORE
from .ha_shared import load_active_connection_snapshot


# 允许代理的 HA 媒体路径前缀。代理是通配路由，这份白名单就是唯一的门禁：
# 只有摄像头实时流、图片与 HLS 片段能穿过去，其它 HA 接口一律被拦下。
ALLOWED_MEDIA_PROXY_PREFIXES = (
    '/api/camera_proxy/',
    '/api/camera_proxy_stream/',
    '/api/image_proxy/',
    '/api/media_player_proxy/',
    '/api/hls/',
)
# 缓存条目上限，超限按创建时间淘汰最旧一条，防止长期运行把内存吃满。
CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES = 64
# 缓存的**字节**预算：条数封顶挡不住「64 张 4K 快照」。超预算同样淘汰最旧的一条，
# 直到落回预算内；两个上限都生效（先撞哪个按哪个）。
CAMERA_SNAPSHOT_CACHE_MAX_BYTES = 24 * 1024 * 1024
# 单张快照**可进缓存**的上限。超过它的响应照旧原样流给浏览器，
# 只是不为它攒内存：缓存图的是省下一次回源，不值得为此把一张几十 MB 的图钉住。
CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES = 6 * 1024 * 1024
# HA 摄像头实体 supported_features 的 bit 2 表示支持 STREAM（可转 HLS）。
CAMERA_FEATURE_STREAM = 2
#: HLS 播放地址的前缀；路径形态固定为 ``/api/hls/<令牌>/<剩下的片段路径>``。
HLS_MEDIA_PREFIX = '/api/hls/'
#: HLS 令牌的记账有效期：一次播放（含长暂停）通常远短于它；命中时滑动续期。
HLS_STREAM_SCOPE_TTL_SECONDS = 12 * 3600
#: 记账条数上限，超限淘汰最早到期的一条（同快照缓存的「淘汰最旧」口径）。
HLS_STREAM_SCOPE_MAX_ENTRIES = 128
#: 同一个项目对同一个 HLS 令牌的归属结论，多久之内不必重查数据库。
#: HLS 分片是几秒一个，逐次查库开销不相称；窗口取 60 秒，改绑后漏放不超过一分钟。
HLS_SCOPE_RECHECK_SECONDS = 60
# —— 摄像头流保温 ——
#: 保温池的消费间隔（秒）。go2rtc 在没有消费者时约 10 秒就回收整条 RTSP→HLS 管道（实测），
#: 而下一次播放要为「连摄像头 + 起转码 + 生成初始分片」重新买单：冷流上第一个清单请求
#: 实测要 **9.2 秒**才返回，热的只要 6–16 毫秒。1 秒一次的节奏既远快于回收窗口，
#: 也正好是 LL-HLS 的 PART 节奏。
CAMERA_WARM_POLL_INTERVAL_SECONDS = 1.0
#: 保温任务重建流的间隔（秒）：流被回收、HA 暂时不可达、摄像头掉线都靠它重试。
CAMERA_WARM_RESTART_SECONDS = 3.0
#: 单个实体的连续失败上限。到顶就放弃它 —— 实体可能已被删除或根本不支持 HLS，
#: 留着任务只会每秒刷一次日志。
CAMERA_WARM_MAX_FAILURES = 3
#: 从仪表盘文档里认摄像头实体的模式。文档结构由前端 PanelRenderer 定义且会演进，这里刻意
#: 只做字符串扫描而不解析结构：多抓一个不存在的实体会在起流时被跳掉（见 _warm_once），
#: 漏抓才会让用户又撞上冷启动，两相权衡宁可多抓。
CAMERA_ENTITY_PATTERN = re.compile(r'camera\.[a-z0-9_]+')
#: LL-HLS 清单里的 PART URI；取最后一个（最新的）当本次要消费的分片。
HLS_PART_URI_PATTERN = re.compile(r'#EXT-X-PART:[^\n]*?URI="\.?/([^"]+)"')
#: 非低延迟清单里的完整分片行，同样是「取最后一个」。
HLS_SEGMENT_URI_PATTERN = re.compile(r'^\.?/(segment/[^\s]+\.m4s)$', re.MULTILINE)
@dataclass
class CameraSnapshotCacheEntry:
    """一张已缓存的摄像头快照：字节内容、媒体类型与写入时刻（monotonic）。"""

    content: bytes
    content_type: str
    created_at: float
@dataclass
class HlsStreamScope:
    """一条 HLS 播放地址的归属：属于哪个实体、记账何时过期、谁校验过。

    ``verified_project`` / ``verified_at`` 记录最近一次通过校验的项目与时刻，
    用来把片段级请求的查库开销压到每分钟一次（见 HLS_SCOPE_RECHECK_SECONDS）。
    """

    entity_id: str
    expires_at: float = 0.0
    verified_project: str = ''
    verified_at: float = 0.0

    def __post_init__(self) -> None:
        if not self.expires_at:
            self.expires_at = monotonic() + HLS_STREAM_SCOPE_TTL_SECONDS
class MediaProxyCaches:
    """媒体代理的两份进程内记账：快照缓存与 HLS 归属。

    挂在 ``app.state.media_proxy`` 而不是模块级字典：模块级会在 create_app() 调两次、
    跨事件循环的刷新任务、以及换 HA 连接这三处失效。因此快照键里带连接身份，
    两份记账另有 :meth:`clear` 在连接重建时显式清空。
    """

    def __init__(self) -> None:
        #: 快照缓存：key 为「连接身份 + HA 基址 + 代理路径」，见 camera_snapshot_cache_key。
        self.snapshots: dict[str, CameraSnapshotCacheEntry] = {}
        #: 正在后台刷新的任务，按同一个 key 去重：同一张图不会同时发起多次回源。
        self.refreshes: dict[str, asyncio.Task[None]] = {}
        #: HLS 令牌 → 归属。令牌由本服务在 /api/camera_hls 发放播放地址时登记。
        self.hls_scopes: dict[str, HlsStreamScope] = {}

    def clear(self) -> None:
        """丢掉两份记账 —— 连接被重建或删除时调用（见 ``HAConnectorService.restart``）。

        在途的刷新任务**不取消**：取消会让正在等它的请求（``hb_live=1`` 会 ``shield`` 它）
        收到 CancelledError；它写回的是旧连接的键，清理之后不会被任何请求命中。
        """
        self.snapshots.clear()
        self.hls_scopes.clear()
        self.refreshes.clear()

    # —— 快照缓存 ——

    def snapshot(self, key: str) -> CameraSnapshotCacheEntry | None:
        """取一张缓存的快照；没有则为 None。"""
        return self.snapshots.get(key)

    def snapshot_bytes(self) -> int:
        """当前快照缓存占用的字节数（预算淘汰要用）。"""
        return sum(len(entry.content) for entry in self.snapshots.values())

    def remember_snapshot(self, key: str, content: bytes, content_type: str) -> None:
        """写入快照缓存；超条数或超字节预算时淘汰最旧的一条。

        用「淘汰最旧」而不是 clear()：清空会让紧接着的一轮请求全部回源。单张超过
        ``CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES`` 的不缓存（一条就能吃掉整个字节预算）。
        """
        if len(content) > CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES:
            self.snapshots.pop(key, None)
            return None
        # 淘汰判据是「放进这一条之后」的占用：覆盖已有键时先把它自己那一份算掉，
        # 否则反复刷新同一张图会被当成新增，每次都白白淘汰一条别的活跃图。
        while self.snapshots:
            replaced = self.snapshots.get(key)
            replaced_bytes = len(replaced.content) if replaced is not None else 0
            over_entries = (
                replaced is None
                and len(self.snapshots) >= CAMERA_SNAPSHOT_CACHE_MAX_ENTRIES
            )
            over_bytes = (
                self.snapshot_bytes() - replaced_bytes + len(content)
                > CAMERA_SNAPSHOT_CACHE_MAX_BYTES
            )
            if not (over_entries or over_bytes):
                break
            oldest_key = min(self.snapshots, key=lambda item: self.snapshots[item].created_at)
            self.snapshots.pop(oldest_key, None)
        self.snapshots[key] = CameraSnapshotCacheEntry(
            content=content,
            # HA 偶尔不回 content-type，按最常见的 JPEG 兜底。
            content_type=content_type or 'image/jpeg',
            created_at=monotonic(),
        )
        return None

    def pending_refresh(self, key: str) -> asyncio.Task[None] | None:
        """同一个 key 正在跑的刷新任务；没有则 None。"""
        return self.refreshes.get(key)

    def schedule_refresh(
        self,
        key: str,
        target: str,
        headers: Mapping[str, str],
        verify_tls: bool,
        timeout: float,
    ) -> None:
        """安排一次后台快照刷新（同一个 key 去重：多个看板同时请求只回源一次）。"""
        existing = self.refreshes.get(key)
        if existing and not existing.done():
            return None
        self.refreshes[key] = asyncio.create_task(
            self._refresh_snapshot(key, target, headers, verify_tls, timeout)
        )
        return None

    async def _refresh_snapshot(
        self,
        key: str,
        target: str,
        headers: Mapping[str, str],
        verify_tls: bool,
        timeout: float,
    ) -> None:
        """后台回源刷新一张快照并写进缓存。

        失败被静默吞掉：调用方此时通常已把旧图返回给浏览器，不值得为刷新失败中断渲染。
        """
        try:
            async with httpx.AsyncClient(
                verify=verify_tls, timeout=timeout, follow_redirects=False
            ) as client:
                upstream = await client.get(target, headers=dict(headers))
            # 只有完整成功才覆盖缓存，失败时旧图继续服务。
            if 200 <= upstream.status_code < 300 and upstream.content:
                self.remember_snapshot(
                    key,
                    upstream.content,
                    upstream.headers.get('content-type', 'image/jpeg'),
                )
        except httpx.HTTPError:
            pass
        finally:
            # 无论成败都要摘掉任务登记，否则这个 key 再也不会被安排刷新。
            self.refreshes.pop(key, None)

    # —— HLS 归属记账 ——

    def hls_scope(self, token: str) -> HlsStreamScope | None:
        """取一条 HLS 归属（不含过期判定，调用方按自己的语义处理）。"""
        return self.hls_scopes.get(token) if token else None

    def remember_hls_stream(self, stream_url: str, entity_id: str) -> None:
        """记账「这条 HLS 播放地址是给哪个实体的」，供片段请求做归属校验。

        这是 HLS 唯一的归属来源：令牌里没有实体信息，只能在发放时记下来。记账滑动续期，
        正常播放不会中途失效；淘汰只在并发播放数超上限时发生，前端会回落到 MJPEG。
        """
        token = hls_stream_token(stream_url)
        if not token:
            return
        if token not in self.hls_scopes and len(self.hls_scopes) >= HLS_STREAM_SCOPE_MAX_ENTRIES:
            oldest = min(self.hls_scopes, key=lambda item: self.hls_scopes[item].expires_at)
            self.hls_scopes.pop(oldest, None)
        self.hls_scopes[token] = HlsStreamScope(entity_id=entity_id)

    def hls_entity_id(self, path: str) -> str | None:
        """查询 HLS 令牌的归属实体；过期即清除，命中则滑动续期。"""
        token = hls_stream_token(path)
        if not token:
            return None
        scope = self.hls_scopes.get(token)
        if scope is None:
            return None
        if monotonic() >= scope.expires_at:
            # 过期即失效：这条记账是「一次播放」的凭据，不该无限期有效。
            self.hls_scopes.pop(token, None)
            return None
        # 命中即续期（滑动窗口）：正常播放期间不会中途被判成「未登记」而断流。
        scope.expires_at = monotonic() + HLS_STREAM_SCOPE_TTL_SECONDS
        return scope.entity_id
def _latest_hls_consume_target(playlist: str) -> str | None:
    """从清单里挑一个本次要消费的分片（相对清单目录）。

    优先最新的 PART：它是 LL-HLS 的实时节奏（约 1 秒一个），消费它既最省流量，也最贴近
    真实播放器的行为；不是低延迟模式时退回最新的完整分片。
    """
    parts = HLS_PART_URI_PATTERN.findall(playlist)
    if parts:
        return parts[-1]
    segments = HLS_SEGMENT_URI_PATTERN.findall(playlist)
    return segments[-1] if segments else None
def dashboard_camera_entity_ids(database: Database) -> set[str]:
    """扫全部项目草稿，取出仪表盘文档里出现过的摄像头实体 ID（供开机预热）。

    只做字符串扫描、不解析文档结构，理由见 ``CAMERA_ENTITY_PATTERN`` 的注释。
    """
    with database.session_factory() as session:
        documents = session.execute(select(ProjectDraft.document_json)).scalars().all()
    found: set[str] = set()
    for document in documents:
        found.update(CAMERA_ENTITY_PATTERN.findall(document or ''))
    return found
class CameraStreamWarmer:
    """常驻保温池：让摄像头在 go2rtc 侧一直有活着的 HLS 流。

    为什么需要它：go2rtc 在**没有消费者**时约 10 秒就回收整条 RTSP→HLS 管道，下一次播放要为
    「连摄像头 + 起转码 + 生成初始分片」重新买单 —— 实测冷流上第一个清单请求要 **9.2 秒**
    才返回，而热的清单只要 6–16 毫秒。「首次加载慢、第二次就正常」的全部原因就在这里：
    第二次只是碰巧还落在那个约 10 秒的回收窗口内。

    保温方式就是当一个最小消费者：每 ``CAMERA_WARM_POLL_INTERVAL_SECONDS`` 拉一次清单，
    再取一次最新的分片。**必须真的取到分片**：实测只标记「在用」、或只拉清单不取分片，
    流照样在约 10 秒后变 404。

    ``camera/stream`` 在同一条流存活期间返回**同一个** HLS 地址（实测两次调用令牌完全一致），
    所以保温期间 ``/api/camera_hls`` 发给播放器的就是那条已经跑了几十秒的活流 —— hls.js
    挂上即播，不必等首帧。

    保温集合来自两处：``/api/camera_hls`` 每发放一次地址就 ``want`` 一次（精确，用户确实在看
    它），以及开机时扫仪表盘文档得到的 ``want_all``（让重启后的第一次打开也是热的）。
    """

    def __init__(self, database: Database, connector, caches: MediaProxyCaches) -> None:
        self.database = database
        self.connector = connector
        self.caches = caches
        #: 实体 ID → 它的保温任务。集合本身就是「当前在保温谁」的唯一事实来源。
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.stopped = False

    def want(self, entity_id: str) -> None:
        """登记一个要保温的摄像头；重复登记无副作用。"""
        entity_id = (entity_id or '').strip()
        if not entity_id or entity_id in self.tasks or self.stopped:
            return
        self.tasks[entity_id] = asyncio.create_task(self._warm_forever(entity_id))

    def want_all(self, entity_ids) -> None:
        for entity_id in entity_ids:
            self.want(entity_id)

    def forget_all(self) -> None:
        """HA 连接被重建 / 删除：全部保温作废 —— 流地址与令牌都跟着那一台 HA 走。"""
        self._cancel_all()

    def stop(self) -> None:
        self.stopped = True
        self._cancel_all()

    def _cancel_all(self) -> None:
        for task in self.tasks.values():
            task.cancel()
        self.tasks.clear()

    async def _warm_forever(self, entity_id: str) -> None:
        """起流 → 消费到流消亡 → 退避 → 再起流。

        只有**连续**失败才计数：一轮成功保温（哪怕只撑了几十秒）就清零 —— 「没人看时 go2rtc
        回收流」是预期行为，不是错误。连续失败到上限说明这个实体保不住（已被删除、不支持
        HLS、或摄像头一直不响应），此时放弃它，并把最后一次的错误抛出去，让它在服务端日志里
        留下痕迹而不是悄悄永远失败。
        """
        failures = 0
        last_error: BaseException | None = None
        try:
            while not self.stopped:
                try:
                    warmed = await self._warm_once(entity_id)
                    last_error = None
                except asyncio.CancelledError:
                    raise
                except Exception as error:  # noqa: BLE001 - 保温尽力而为，只影响这一个实体
                    warmed = False
                    last_error = error
                failures = 0 if warmed else failures + 1
                if failures >= CAMERA_WARM_MAX_FAILURES:
                    if last_error is not None:
                        raise last_error
                    return
                await asyncio.sleep(CAMERA_WARM_RESTART_SECONDS)
        finally:
            # 任务自己退出（放弃 / 被取消）时把登记一起撤掉，外面看到的始终是当前有效的集合。
            self.tasks.pop(entity_id, None)

    async def _warm_once(self, entity_id: str) -> bool:
        """起一条流并消费到它消亡。返回 False 表示这条流没能起来。"""
        connection = await asyncio.to_thread(load_active_connection_snapshot, self.database)
        if connection is None:
            return False
        client = await self.connector.client_for(connection)
        entity_states = await client.fetch_states({entity_id})
        # 与 /api/camera_hls 同一口径：只有明确不支持才放弃，状态未知时先试着起流。
        if camera_supports_hls(entity_states[0] if entity_states else None) is False:
            return False
        websocket = await client.connect_websocket()
        try:
            result = await client.command(
                websocket, 1, 'camera/stream', entity_id=entity_id, format='hls'
            )
        finally:
            # camera/stream 是一次性命令，拿到结果就关掉 WebSocket。
            await websocket.close()
        # HA 各版本返回结构不一致，这里兼容 dict 与裸字符串两种形态（同 /api/camera_hls）。
        stream_url = rewrite_location(
            str(result.get('url') if isinstance(result, dict) else result or '').strip(),
            client.base_url,
        )
        stream_path = stream_url.split('?', 1)[0]
        if not stream_path or not allowed_media_proxy_path(stream_path):
            return False
        # 记账归属：保温期间播放器请求的分片也要过 /api/hls/ 的归属校验，而这份记账的唯一
        # 来源就是「发放地址时记下令牌」。这里提前记上，播放器接手时校验已经就绪。
        self.caches.remember_hls_stream(stream_url, entity_id)
        await self._consume_until_gone(client, stream_path)
        return True

    async def _consume_until_gone(self, client, stream_path: str) -> None:
        """当一个最小消费者：拉清单 + 取最新分片，直到 go2rtc 把这条流回收。

        清单返回非 200、或内容不再是 m3u8，就说明流已经没了（实测约 10 秒不消费即 404），
        这里直接返回，由 ``_warm_forever`` 重建。
        """
        playlist_dir = stream_path.rsplit('/', 1)[0]
        playlist_path = f'{playlist_dir}/playlist.m3u8'
        headers = {
            'Authorization': f'Bearer {client.access_token}',
            # 与 /api/hls 的转发同口径：拿原始字节，不让中间层压缩。
            'accept-encoding': 'identity',
        }
        async with httpx.AsyncClient(
            verify=client.verify_tls, timeout=client.timeout, follow_redirects=False
        ) as http:
            while not self.stopped:
                response = await http.get(f'{client.base_url}{playlist_path}', headers=headers)
                if response.status_code != 200 or '#EXTM3U' not in response.text:
                    return
                target = _latest_hls_consume_target(response.text)
                if target:
                    # 必须真的取一个分片，管道才会被 go2rtc 认定为「有人在看」。
                    await http.get(f'{client.base_url}{playlist_dir}/{target}', headers=headers)
                await asyncio.sleep(CAMERA_WARM_POLL_INTERVAL_SECONDS)
def allowed_media_proxy_path(path: str) -> bool:
    """判断路径是否允许代理：既要命中白名单前缀，也不能含路径归一化写法。"""
    if not path.startswith(ALLOWED_MEDIA_PROXY_PREFIXES) or '\\' in path:
        return False
    # 逐段检查：'.' / '..' 可用 /api/hls/../xxx 绕过前缀检查打到别的 HA 接口。
    return all(segment not in {'.', '..'} for segment in path.split('/'))
def hls_stream_token(path: str) -> str:
    """取出 ``/api/hls/<令牌>/...`` 里的令牌；不是 HLS 路径时返回空串。"""
    if not path.startswith(HLS_MEDIA_PREFIX):
        return ''
    return path[len(HLS_MEDIA_PREFIX):].split('/', 1)[0].strip()
def rewrite_location(value: str, base_url: str) -> str:
    """把 HA 返回的绝对地址改写成本服务可代理的相对路径。

    Location 头与 HLS 播放列表里的地址可能是 HA 的绝对 URL，浏览器直接访问打不到，
    因此统一改写成 /api/... 形式；只改写命中媒体白名单的路径，其余原样返回。
    """
    normalized_base = base_url.rstrip('/')
    if value == normalized_base:
        # HA 指向自己的根地址，等价于站点首页。
        return '/'
    if value.startswith(f'{normalized_base}/'):
        # 同基址的绝对路径直接去掉基址，省一次 URL 解析。
        return value[len(normalized_base):]
    parsed_url = urlparse(value)
    # 绝对 URL 只在路径属于媒体白名单时才改写。
    if parsed_url.scheme in {'http', 'https'} and parsed_url.path:
        rewritten_path = parsed_url.path + (f'?{parsed_url.query}' if parsed_url.query else '')
        if allowed_media_proxy_path(parsed_url.path):
            return rewritten_path
    return value
def camera_supports_hls(entity_state: dict | None) -> bool | None:
    """判断摄像头实体是否能提供 HLS 实时流。

    参数: entity_state 为 HA 返回的实体状态字典；取不到时为 None。
    返回 True 能、False 明确不支持（前端应回落 MJPEG）、None 状态未知。
    """
    if not isinstance(entity_state, dict):
        return None
    attributes = entity_state.get('attributes')
    if not isinstance(attributes, dict):
        attributes = {}
    # frontend_stream_type 是 HA 告诉前端该走哪种播放方式的关键字段。
    stream_type = str(attributes.get('frontend_stream_type') or '').strip().lower()
    # 显式声明了非 hls 的流类型，直接判定不支持。
    if stream_type and stream_type != 'hls':
        return False
    try:
        supported_features = int(attributes.get('supported_features') or 0)
    except (TypeError, ValueError):
        supported_features = 0
    # 显式 hls 属于无条件支持，不必再看能力位。
    if stream_type == 'hls':
        return True
    # 没有流类型信息时退回能力位判断：bit 2 即 STREAM。
    return bool(supported_features & CAMERA_FEATURE_STREAM)
def camera_snapshot_cache_key(connection_id: str, base_url: str, path: str) -> str:
    """快照缓存键：连接身份 + HA 基址 + 代理路径。

    三部分各挡一类串图：连接身份挡「换了 HA 仍发上一台画面」、基址挡「同进程配过多个
    地址」、路径挡「同一台 HA 上不同摄像头互串」。连接身份必须在这里而不是只靠清缓存。
    """
    return f'{connection_id}|{base_url.rstrip("/")}{path}'
def _camera_snapshot_response(entry: CameraSnapshotCacheEntry) -> Response:
    """把缓存条目转成响应；快照统一按 no-store 下发，缓存策略由服务端掌握。"""
    return Response(content=entry.content, media_type=entry.content_type, headers={'cache-control': PRIVATE_NO_STORE})
