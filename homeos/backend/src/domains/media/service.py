"""媒体域：Music Assistant 搜索 / 点歌 + MoviePilot 入库轮询。

Music Assistant
    只做「搜索 → 唯一命中 → 提交队列」三步。点歌要求**恰好 1 条**匹配：多结果时返回
    候选而不是替用户猜，猜错会把整张专辑插进客厅音箱。

MoviePilot
    定时拉一页 20 条、最多 100 页；**首轮只建游标不导历史**（否则第一次启动会把
    整库都推一遍）；抓满 100 页还没遇到游标就报错且**不推进游标**（宁可下轮重试，
    也不能把中间漏掉的记录跳过）。只通知「到达超过 2 分钟仍未通知」的条目。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, select

from ...platform.core.db.media_models import MediaArrival

logger = logging.getLogger("homeos.media")

PAGE_SIZE = 20
MAX_PAGES_PER_POLL = 100
DEFAULT_INTERVAL_SECONDS = 90
MIN_INTERVAL_SECONDS = 30
MAX_INTERVAL_SECONDS = 3600
ARRIVAL_NOTIFY_DELAY = timedelta(minutes=2)
#: 允许的「整理成功」取值（大小写不敏感）
_SUCCESS_VALUES = frozenset(
    {"1", "true", "success", "successful", "completed", "complete", "整理成功", "已完成", "成功"}
)
#: 入库表中「钉住」的最新条数上限与最长保留天数（超出即清理，避免只增不减）
ARRIVAL_KEEP_ROWS = 1000
ARRIVAL_KEEP_DAYS = 180
#: 清理最短间隔：轮询很密时不必每轮都扫一遍表
ARRIVAL_PRUNE_INTERVAL = timedelta(hours=1)
#: Music Assistant 单次搜索上限
MAX_SEARCH_LIMIT = 20
#: MA 调用失败时统一给前端的提示（区分「没配」「配错」「服务挂了」的入口在 test-connection）
_MA_FAILED = "Music Assistant 无响应或返回错误（检查地址与长期令牌）"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _base_url(value: Any) -> str:
    """规整服务基地址：去掉末尾斜杠，缺少协议时补 ``http://``。

    用户手填 ``192.168.1.10:8095`` 是最常见的输入，httpx 会把它当相对 URL 直接抛错，
    报出来的信息（``Invalid URL``）对用户毫无意义；这里统一补全协议。
    """
    text = _text(value).rstrip("/")
    if not text:
        return ""
    return text if "://" in text else f"http://{text}"


def _is_http_url(url: str) -> bool:
    return url.startswith(("http://", "https://"))


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC).isoformat()


class MediaService:
    """媒体连接、搜索、点歌与入库列表。"""

    def __init__(self, session_factory: Any, ui_config: Any = None, notification: Any = None) -> None:
        self._session_factory = session_factory
        self._ui_config = ui_config
        self._notification = notification
        # 后台轮询与「立即轮询」共用同一份游标：并发跑会把同一页写两遍、并抢着推进游标。
        self._poll_lock = asyncio.Lock()
        self._last_prune: datetime | None = None

    def bind_notification(self, notification: Any) -> None:
        """装配顺序：媒体服务先建、通知服务后建，这里后置注入。"""
        self._notification = notification

    # ------------------------------------------------------------------ 配置
    def _layout(self) -> dict[str, Any]:
        """当前方案布局。

        注意 ``UiConfigService.get_config()`` 返回的是**记录**（``{id, projectId, layout,
        createdAt, updatedAt}``），布局本身在 ``record["layout"]``。旧实现直接在那个记录上
        找 ``mediaConfig``，于是**永远读到空**：填好的 MA / MoviePilot 地址与令牌一次都没
        生效过（点歌只会回「未配置地址」）。这里统一解包，并兼容 layout 仍是 JSON 字符串
        的历史数据。
        """
        if self._ui_config is None:
            return {}
        try:
            project_id = self._ui_config.resolve_active_project_id()
            record = self._ui_config.get_config(project_id)
        except Exception as exc:
            logger.debug("读取布局失败: %s", exc)
            return {}
        if not isinstance(record, dict):
            return {}
        layout = record.get("layout")
        if isinstance(layout, str):
            try:
                layout = json.loads(layout)
            except (TypeError, ValueError):  # fmt: skip
                return {}
        return layout if isinstance(layout, dict) else {}

    def _media_config(self) -> dict[str, Any]:
        config = self._layout().get("mediaConfig")
        return config if isinstance(config, dict) else {}

    def _ma(self) -> tuple[str, str]:
        config = self._media_config()
        return _base_url(config.get("maUrl")), _text(config.get("maToken"))

    def _mp(self) -> tuple[str, str]:
        """MoviePilot 地址：媒体库优先，其次「内嵌网页管理」的 moviePilotUrl。

        这两处历史上是分开填的（内嵌页 / 图片代理读 ``moviePilotUrl``，入库轮询读
        ``mediaConfig.mpUrl``），用户只填一处就会出现「能打开页面但轮询不到入库」。
        读取侧统一成一条链，两处都填时以媒体库为准。
        """
        config = self._media_config()
        url = _text(config.get("mpUrl")) or _text(self._layout().get("moviePilotUrl"))
        return _base_url(url), _text(config.get("mpToken"))

    def interval_seconds(self) -> int:
        raw = self._media_config().get("arrivalIntervalSeconds")
        if raw is None or raw == "":
            return DEFAULT_INTERVAL_SECONDS
        try:
            value = int(float(raw))
        except (TypeError, ValueError):  # fmt: skip
            return DEFAULT_INTERVAL_SECONDS
        return max(MIN_INTERVAL_SECONDS, min(MAX_INTERVAL_SECONDS, value))

    # ------------------------------------------------------------------ 连接
    async def test_connection(self, kind: str) -> dict[str, Any]:
        """探测连通性。

        探的是**需要鉴权的接口**而不是站点首页：MA 的 `/` 和 MoviePilot 的 `/` 对无效
        令牌同样回 200，只看首页会把「令牌写错」报成「连接正常」；旧实现连 401/403 都算
        成功（`status < 500`），用户因此永远看不到鉴权失败。
        """
        target = _text(kind).lower()
        if target not in ("ma", "mp"):
            return {"success": False, "message": "kind 须为 ma 或 mp"}
        url, token = self._ma() if target == "ma" else self._mp()
        if not url:
            return {"success": False, "message": "未配置地址"}
        if not _is_http_url(url):
            return {"success": False, "message": f"地址协议不支持：{url}（只支持 http / https）"}
        headers = {"authorization": f"Bearer {token}"} if token else {}
        if target == "ma":
            path, params = "/api/players/all", None
        else:
            path, params = "/api/v1/media/search", {"page": 1, "count": 1}
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(f"{url}{path}", headers=headers, params=params)
        except Exception as exc:
            return {"success": False, "message": f"连接失败：{exc}"}
        status = response.status_code
        if status in (401, 403):
            return {"success": False, "status": status, "message": "令牌被拒绝（401/403），请检查长期令牌"}
        if status == 404:
            # 老版本可能没有这个接口：退回探首页，只证明「能连上」，如实说明
            return await self._probe_root(url, headers)
        if status >= 400:
            return {"success": False, "status": status, "message": f"服务返回 {status}"}
        return {"success": True, "status": status}

    async def _probe_root(self, url: str, headers: dict[str, str]) -> dict[str, Any]:
        """兜底探测：只验证站点可达（不校验令牌）。"""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
        except Exception as exc:
            return {"success": False, "message": f"连接失败：{exc}"}
        if response.status_code < 400:
            return {
                "success": True,
                "status": response.status_code,
                "message": "地址可达，但探测接口不存在（版本可能不同），未校验令牌",
            }
        return {"success": False, "status": response.status_code, "message": f"服务返回 {response.status_code}"}

    # ------------------------------------------------------------------ Music Assistant
    async def players(self) -> dict[str, Any]:
        url, token = self._ma()
        if not url:
            return {"success": False, "items": [], "message": "未配置 Music Assistant 地址"}
        payload = await self._ma_json("GET", "/api/players/all", token=token)
        if payload is None:
            return {"success": False, "items": [], "message": _MA_FAILED}
        players = payload if isinstance(payload, list) else payload.get("players") or payload.get("items") or []
        return {
            "success": True,
            "items": [
                {
                    "playerId": _text(item.get("player_id") or item.get("id")),
                    "name": _text(item.get("display_name") or item.get("name")),
                    "available": bool(item.get("available", True)),
                    "type": _text(item.get("type")),
                }
                for item in players
                if isinstance(item, dict)
            ],
        }

    async def search_music(self, query: str, *, media_type: str = "track", limit: int = 10) -> dict[str, Any]:
        text = _text(query)
        if not text or len(text) > 160:
            return {"success": False, "message": "搜索词为空或过长"}
        capped = max(1, min(MAX_SEARCH_LIMIT, int(limit or 10)))
        url, token = self._ma()
        if not url:
            return {"success": False, "message": "未配置 Music Assistant 地址"}
        payload = await self._ma_json(
            "GET",
            "/api/music/search",
            token=token,
            params={"query": text, "media_type": media_type, "limit": capped},
        )
        if payload is None:
            return {"success": False, "items": [], "message": _MA_FAILED}
        items = payload if isinstance(payload, list) else payload.get("results") or payload.get("items") or []
        normalized = []
        for item in items:
            if not isinstance(item, dict):
                continue
            uri = _text(item.get("uri"))
            name = _text(item.get("name") or item.get("title"))
            if not uri or not name:
                continue
            artists = item.get("artists") or []
            normalized.append(
                {
                    "uri": uri,
                    "name": name,
                    "artists": [
                        {"uri": _text(artist.get("uri")), "name": _text(artist.get("name"))}
                        for artist in artists
                        if isinstance(artist, dict)
                    ]
                    if isinstance(artists, list)
                    else [],
                    "album": _text(item.get("album")),
                    "duration": item.get("duration"),
                }
            )
        return {"success": True, "items": normalized, "query": text, "type": media_type}

    async def play_music(self, *, artist: str, track: str, area_id: str = "") -> dict[str, Any]:
        """点歌：搜索 → 唯一命中 → 提交队列。多结果时返回候选，不替用户选。"""
        artist_text, track_text = _text(artist), _text(track)
        if not track_text:
            return {"success": False, "message": "缺少歌曲名"}
        query = f"{artist_text} {track_text}".strip()
        searched = await self.search_music(query, media_type="track", limit=MAX_SEARCH_LIMIT)
        if not searched.get("success"):
            return searched
        items = searched.get("items") or []
        target_name = _normalize(track_text)
        exact = [item for item in items if _normalize(item["name"]) == target_name]
        if len(exact) != 1:
            if len(exact) > 1:
                exact = _dedupe_uri(exact)
            if len(exact) != 1:
                return {
                    "success": False,
                    "reason": "ambiguous",
                    "message": "匹配到多首同名歌曲，请说得更具体一些。",
                    "candidates": [{"name": item["name"], "uri": item["uri"]} for item in (exact or items)[:4]],
                }
        chosen = exact[0]
        player = self._resolve_player(area_id)
        # ``_resolve_player`` 的失败形态是 ``{"success": False, ...}``（没有 ``error`` 键）。
        # 旧实现只认 ``error``，于是失败时把整个字典当 playerId 发给 MA —— 队列里什么都没有，
        # 用户却收到「已提交」。
        if isinstance(player, dict):
            return player
        if not player:
            return {"success": False, "message": "没有可用的默认音箱。"}
        _url, token = self._ma()
        result = await self._ma_json(
            "POST",
            "/api/playerqueues/play_media",
            token=token,
            json_body={"queue_id": player, "media": chosen["uri"]},
            timeout=25.0,
        )
        if result is None:
            # 旧实现把 MA 的非 2xx 吞成 `{}` 仍回 success=True：用户以为「播上了」，
            # 实际队列里什么都没有。
            return {"success": False, "message": f"提交播放队列失败：{_MA_FAILED}"}
        return {
            "success": True,
            "accepted": True,
            "phase": "queue_submitted",
            "playerId": player,
            "track": chosen,
            "result": result if isinstance(result, dict) else None,
        }

    def _resolve_player(self, area_id: str) -> Any:
        """默认播放器：房间 → ``speaker`` 默认；无房间时要求全屋恰好 1 台。

        返回 ``playerId`` 字符串，或 ``{"success": False, "message"/"reason": ...}`` 的错误载荷。
        """
        try:
            from sqlalchemy import select as _select

            from ...platform.core.db.device_profile_models import DeviceProfileDefault

            with self._session_factory() as session:
                rows = session.scalars(_select(DeviceProfileDefault)).all()
        except Exception as exc:
            logger.debug("读取默认播放器失败: %s", exc)
            return {"success": False, "message": "读取默认播放器失败"}
        candidates = [row for row in rows if row.kind == "speaker" and row.ma_player_id]
        if area_id:
            candidates = [row for row in candidates if row.area_id == area_id]
        if len(candidates) == 1:
            return candidates[0].ma_player_id
        if not candidates:
            scope = "该房间" if area_id else "全屋"
            return {"success": False, "message": f"{scope}没有配置默认音箱（设备画像 → 房间默认设备）。"}
        return {
            "success": False,
            "reason": "ambiguous",
            "message": "多个房间都配置了默认音箱，请说明在哪个房间播放。",
            "candidates": [row.ma_player_id for row in candidates],
        }

    async def _ma_json(
        self,
        method: str,
        path: str,
        *,
        token: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        timeout: float = 10.0,
    ) -> Any | None:
        """调用 MA；**失败返回 None**（旧实现回 ``{}``，调用方因此无法区分「空结果」和「出错」）。"""
        url, _ = self._ma()
        headers = {"authorization": f"Bearer {token}"} if token else {}
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
                response = await client.request(method, f"{url}{path}", headers=headers, params=params, json=json_body)
        except Exception as exc:
            # 地址不可达 / DNS 失败也在 httpx 里抛异常：不接住就是 500，前端只能看到「服务异常」。
            logger.debug("Music Assistant %s %s 请求失败: %s", method, path, exc)
            return None
        if response.status_code >= 400:
            logger.debug("Music Assistant %s %s → %s", method, path, response.status_code)
            return None
        try:
            return response.json()
        except ValueError:
            return None

    # ------------------------------------------------------------------ MoviePilot 入库
    def _initialized(self) -> bool:
        return self._read_cursor() is not None

    def _read_cursor(self) -> str | None:
        try:
            from ...platform.core.db.runtime_kv import load_runtime_kv

            with self._session_factory() as session:
                value = load_runtime_kv(session, "media-arrival-cursor")
            return _text(value) if value else None
        except Exception as exc:
            logger.debug("读取入库游标失败: %s", exc)
            return None

    def _write_cursor(self, remote_id: str) -> None:
        from ...platform.core.db.runtime_kv import persist_runtime_kv

        persist_runtime_kv(self._session_factory, "media-arrival-cursor", remote_id)

    async def poll_arrivals(self) -> dict[str, Any]:
        """拉一页（或多页）增量入库；返回本轮写入条数。

        后台轮询与设置页「立即轮询」共用同一份游标：并发跑会把同一页写两遍、并抢着推进
        游标（后写方用旧游标覆盖新游标 → 下轮重复拉取）。这里用锁串行化，且**不做排队**：
        已经在跑就直接告诉调用方「跳过」，避免接口挂住几十秒等一个 100 页的扫描。
        """
        if self._poll_lock.locked():
            return {"success": True, "added": 0, "skipped": True, "message": "上一轮轮询仍在进行，本次跳过"}
        async with self._poll_lock:
            return await self._poll_once()

    async def _poll_once(self) -> dict[str, Any]:
        url, token = self._mp()
        if not url:
            return {"success": False, "message": "未配置 MoviePilot 地址", "added": 0}
        cursor = self._read_cursor()
        headers = {"authorization": f"Bearer {token}"} if token else {}
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                added, newest, found_cursor, error = await self._collect_arrivals(client, url, headers, cursor)
        except Exception as exc:
            return {"success": False, "message": f"轮询失败：{exc}", "added": 0}
        if error:
            return {"success": False, "message": error, "added": added}
        if not self._initialized():
            # 首轮只建游标：不通知历史，也不导历史。
            if newest:
                self._write_cursor(newest)
            return {"success": True, "added": 0, "initialized": True}
        if found_cursor and newest:
            self._write_cursor(newest)
        if added:
            # 有新入库才值得扫一次表：入库表是只增表，没有清理策略就会一直涨。
            await asyncio.to_thread(self._prune_arrivals)
        return {"success": True, "added": added}

    def _prune_arrivals(self) -> None:
        """清理过旧 / 超量的入库记录（最多每小时一次，失败不影响轮询）。"""
        now = datetime.now(UTC).replace(tzinfo=None)
        if self._last_prune is not None and now - self._last_prune < ARRIVAL_PRUNE_INTERVAL:
            return
        self._last_prune = now
        cutoff = now - timedelta(days=ARRIVAL_KEEP_DAYS)
        keep = select(MediaArrival.id).order_by(MediaArrival.arrived_at.desc()).limit(ARRIVAL_KEEP_ROWS)
        try:
            with self._session_factory() as session:
                # 先按天数，再按条数：两条都执行，SQLite 上是两次索引扫描，代价远小于表无限增长。
                deleted = session.execute(delete(MediaArrival).where(MediaArrival.arrived_at < cutoff)).rowcount
                deleted += session.execute(delete(MediaArrival).where(MediaArrival.id.not_in(keep))).rowcount
                session.commit()
            if deleted:
                logger.info("入库记录已清理 %s 条（保留 %s 天 / %s 条）", deleted, ARRIVAL_KEEP_DAYS, ARRIVAL_KEEP_ROWS)
        except Exception as exc:
            logger.debug("入库记录清理失败: %s", exc)

    async def _collect_arrivals(
        self, client: httpx.AsyncClient, url: str, headers: dict[str, str], cursor: str | None
    ) -> tuple[int, str | None, bool, str | None]:
        """分页收集增量。返回 ``(added, newest, found_cursor, error)``。

        ``cursor is None`` 是首轮：**只取最新一条 id 建游标，不写库**。旧实现照常
        ``_upsert_arrival``，于是「首轮不导历史」只做了一半 —— 库被塞进最新一页历史，
        这些行的 ``notified_at`` 为空且到达时间早于 2 分钟，下一轮通知就把它们全推给用户。
        """
        importing = cursor is not None
        added = 0
        # newest 必须从 None 起算：旧实现写成 ``newest = cursor``，而 ``newest = newest or remote_id``
        # 于是永远是旧游标自己 —— 游标一次都不前进，每轮都把「游标 → 最新」整段重扫一遍
        # （靠 remote_id 去重才没写出重复行，但「新增 N 条」一直是错的）。
        newest: str | None = None
        found_cursor = not importing
        for page in range(1, MAX_PAGES_PER_POLL + 1):
            response = await client.get(
                f"{url}/api/v1/media/search",
                headers=headers,
                params={"page": page, "count": PAGE_SIZE},
            )
            if response.status_code >= 400:
                hint = "，该版本可能不支持 /api/v1/media/search" if response.status_code == 404 else ""
                return added, newest, found_cursor, f"MoviePilot 返回 {response.status_code}{hint}"
            items = _extract_items(response.json())
            if not items:
                return added, newest, found_cursor, None
            for item in items:
                remote_id = _text(item.get("id"))
                if not remote_id:
                    return added, newest, found_cursor, "MoviePilot 返回了非法 id"
                if cursor is not None and remote_id == cursor:
                    found_cursor = True
                    break
                # mp_url 由调用方传入：旧实现在这里每条都 self._mp()，等于每条记录重读一遍
                # 布局（一次轮询最多 2000 条 = 2000 次 DB 读 + JSON 解析）。
                if importing and self._is_success(item) and self._upsert_arrival(item, remote_id, url):
                    added += 1
                newest = newest or remote_id
            if found_cursor:
                return added, newest, found_cursor, None
        # 抓满上限仍未遇到游标：不推进游标，下轮重试。
        return added, newest, found_cursor, "入库增量超过本轮上限，游标未推进"

    def _is_success(self, item: dict[str, Any]) -> bool:
        raw = item.get("is_success", item.get("status"))
        return _text(raw).lower() in _SUCCESS_VALUES

    def _upsert_arrival(self, item: dict[str, Any], remote_id: str, mp_url: str) -> bool:
        """写入一条入库记录；返回是否**新插入**（已存在返回 False，避免重复计数）。"""
        title = _text(item.get("title") or item.get("name"))
        season = _text(item.get("season"))
        tmdb_id = _text(item.get("tmdb_id") or item.get("tmdbid"))
        poster = _resolve_poster(item, mp_url)
        arrived_at = _parse_time(item.get("date") or item.get("completed_at") or item.get("created_at"))
        with self._session_factory() as session:
            row = session.scalars(
                select(MediaArrival).where(MediaArrival.source == "moviepilot", MediaArrival.remote_id == remote_id)
            ).first()
            if row is None:
                session.add(
                    MediaArrival(
                        source="moviepilot",
                        remote_id=remote_id,
                        title=title,
                        season=season or None,
                        tmdb_id=tmdb_id or None,
                        poster_url=poster,
                        arrived_at=arrived_at,
                    )
                )
                session.commit()
                return True
        return False

    def list_arrivals(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(MediaArrival).order_by(MediaArrival.arrived_at.desc()).limit(max(1, min(200, int(limit or 50))))
            ).all()
            return [
                {
                    "id": row.id,
                    "source": row.source,
                    "remoteId": row.remote_id,
                    "title": row.title,
                    "season": row.season,
                    "tmdbId": row.tmdb_id,
                    "posterUrl": row.poster_url,
                    "arrivedAt": _iso(row.arrived_at),
                    "notifiedAt": _iso(row.notified_at),
                }
                for row in rows
            ]

    async def notify_pending_arrivals(self) -> int:
        """通知「到达超过 2 分钟且未通知」的入库记录；按 ``tmdbId:season`` 分组。"""
        if self._notification is None:
            return 0
        groups = await asyncio.to_thread(self._pending_groups)
        if not groups:
            return 0
        notified_ids: list[str] = []
        for key, items in groups.items():
            digest = hashlib.sha256(",".join(sorted(item["remoteId"] for item in items)).encode()).hexdigest()[:16]
            title = _arrival_title(items[0])
            try:
                result = await self._notification.notify(
                    "info",
                    title,
                    "media-arrival",
                    None,
                    {
                        "title": "媒体已入库",
                        "channels": ["in_app", "socket"],
                        "idempotencyKey": f"moviepilot_{digest}",
                    },
                )
            except Exception as exc:
                logger.debug("入库通知失败 %s: %s", key, exc)
                continue
            if result is not None:
                notified_ids.extend(item["id"] for item in items)
        if notified_ids:
            await asyncio.to_thread(self._mark_notified, notified_ids)
        return len(notified_ids)

    def _pending_groups(self) -> dict[str, list[dict[str, Any]]]:
        cutoff = datetime.now(UTC).replace(tzinfo=None) - ARRIVAL_NOTIFY_DELAY
        with self._session_factory() as session:
            rows = session.scalars(
                select(MediaArrival).where(MediaArrival.notified_at.is_(None), MediaArrival.arrived_at <= cutoff)
            ).all()
            groups: dict[str, list[dict[str, Any]]] = {}
            for row in rows:
                key = f"{row.tmdb_id or row.remote_id}:{row.season or ''}"
                groups.setdefault(key, []).append(
                    {
                        "id": row.id,
                        "remoteId": row.remote_id,
                        "title": row.title,
                        "season": row.season,
                        "tmdbId": row.tmdb_id,
                    }
                )
            return groups

    def _mark_notified(self, ids: list[str]) -> None:
        now = datetime.now(UTC).replace(tzinfo=None)
        with self._session_factory() as session:
            for row in session.scalars(select(MediaArrival).where(MediaArrival.id.in_(ids))).all():
                row.notified_at = now
            session.commit()


class ArrivalPoller:
    """后台轮询器：启动 3s 后首跑，之后按配置间隔。"""

    def __init__(self, media: MediaService) -> None:
        import asyncio

        self._media = media
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        import asyncio

        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                # cancel() 之后 await 必然抛 CancelledError，而它继承 BaseException：
                # 旧代码只 `except Exception`，于是每次停机都把它抛进 _shutdown_all，
                # 日志变成「Application shutdown failed」，下次启动还得做完整性体检。
                logger.debug("入库轮询任务已取消")
            except Exception as exc:
                logger.debug("入库轮询任务异常退出: %s", exc)
            self._task = None

    async def _run(self) -> None:
        import asyncio

        await asyncio.sleep(3)
        while not self._stop.is_set():
            try:
                await self._media.poll_arrivals()
                await self._media.notify_pending_arrivals()
            except Exception as exc:
                logger.warning("入库轮询异常: %s", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._media.interval_seconds())
            except TimeoutError:
                # 正常节奏：间隔到点（默认 90s）进入下一轮，不是错误。debug 级别避免刷屏。
                logger.debug("入库轮询间隔到点，继续下一轮")
                continue


def _extract_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    candidates = None
    if isinstance(data, dict):
        candidates = data.get("list") or data.get("items")
    candidates = candidates or payload.get("list") or payload.get("items") or payload.get("data")
    return [item for item in candidates if isinstance(item, dict)] if isinstance(candidates, list) else []


def _parse_time(raw: Any) -> datetime:
    text = _text(raw)
    if not text:
        return datetime.now(UTC).replace(tzinfo=None)
    try:
        parsed = datetime.fromisoformat(text)
    except (ValueError, TypeError) as exc:  # fmt: skip
        logger.debug("无法解析入库时间戳 %r: %s", raw, exc)
        return datetime.now(UTC).replace(tzinfo=None)
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _resolve_poster(item: dict[str, Any], mp_url: str) -> str | None:
    raw = _text(item.get("poster") or item.get("poster_path") or item.get("image"))
    if not raw:
        return None
    if raw.startswith(("http://", "https://")):
        return raw if len(raw) <= 2048 else None
    if raw.startswith("/") and mp_url:
        return f"{mp_url}{raw}"
    return None


def _arrival_title(item: dict[str, Any]) -> str:
    season = item.get("season")
    return f"媒体入库：{item.get('title') or ''}{f' {season}' if season else ''}"


def _normalize(value: str) -> str:
    return _text(value).replace(" ", "").replace("_", "").replace("-", "").lower()


def _dedupe_uri(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        if item["uri"] in seen:
            continue
        seen.add(item["uri"])
        unique.append(item)
    return unique


__all__ = [
    "ARRIVAL_NOTIFY_DELAY",
    "DEFAULT_INTERVAL_SECONDS",
    "MAX_PAGES_PER_POLL",
    "PAGE_SIZE",
    "ArrivalPoller",
    "MediaService",
]
