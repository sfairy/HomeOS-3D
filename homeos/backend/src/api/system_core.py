"""系统域核心路由（对齐 Nest ``SystemController``，``/api/v1/system/*``）。

覆盖：
- 调度作业仪表盘 ``GET system/jobs``（admin）；
- 聚合运维诊断 ``GET system/diagnostics``（admin）；
- 运行日志查询 / SSE 推送 / 清空（admin）；
- 设备管理 ``GET system/devices`` + ``POST system/devices/unbind``（admin）；
- 版本与健康 ``GET system/info`` / ``GET system/health``（登录即可）；
- 跨端网络信息 ``GET system/network-info``（admin）。

鉴权：JwtAuthGuard 通用；admin 专属接口叠加 RolesGuard。

注意：``GET system/img/0``（MoviePilot 图片代理）随 MoviePilot 代理服务一并迁移。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from fastapi import Body, Depends, Query, Request
from fastapi.responses import Response, StreamingResponse

from .router import NestRouter
from ..core.adaptive_perf import build_backend_perf_suggestions
from ..core.observability import (
    get_ha_sync_latency_snapshots,
    get_ha_ws_deferred_dropped_total,
)
from ..core.runtime_kv import load_runtime_kv
from ..core.runtime_logs import DEFAULT_QUERY_LIMIT, RuntimeLogBuffer, matches_runtime_log_filter
from ..security.auth_context import require_roles, require_user

logger = logging.getLogger("homeos.system.controller")

router = NestRouter(prefix="/system", tags=["system"])

#: 运行日志 SSE 心跳间隔（毫秒）：与 Nest ``HEARTBEAT_MS`` 一致
SSE_HEARTBEAT_MS = 15_000
#: 默认大实体阈值（``frontend.workerDerivedThreshold`` 缺失时）
DEFAULT_XLARGE_THRESHOLD = 3500

# ---------------------------------------------------------------------- #
# 依赖读取
# ---------------------------------------------------------------------- #
def _runtime_buffer(request: Request) -> RuntimeLogBuffer:
    return request.app.state.runtime_logs

def _jobs(request: Request) -> Any:
    return request.app.state.jobs

def _int_or_none(raw: str | None) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None

def _js_number(value: float) -> str:
    """数值文本：整数值去掉 ``.0``（对齐 JS 模板字符串数字格式）。"""
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))

def _json_number(value: float) -> float | int:
    """JSON 数值：整数值输出 int（对齐 ``JSON.stringify`` 的 "0" 而非 "0.0"）。"""
    return int(value) if float(value).is_integer() else float(value)

def _format_locale_string(moment: datetime, locale: str = "zh-CN") -> str:
    """等价 ``new Date().toLocaleString('zh-CN')``（月/日不补零）。"""
    _ = locale
    return (
        f"{moment.year}/{moment.month}/{moment.day} "
        f"{moment.hour:02d}:{moment.minute:02d}:{moment.second:02d}"
    )

def _or_none(value: Any) -> Any:
    """等价 JS ``value || null``（空串 / 0 / None 都归一为 None）。"""
    return value or None

def _load_drift_repair_last_run(request: Request) -> dict[str, Any] | None:
    database = request.app.state.database
    try:
        with database.session_factory() as session:
            row = load_runtime_kv(session, "orchestrator-drift-repair")
    except Exception as err:
        logger.debug("读取漂移修复记录失败: %s", err)
        return None
    if not isinstance(row, dict):
        return None

    def number(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    errors = row.get("errors")
    return {
        "startedAt": _or_none(row.get("startedAt")),
        "finishedAt": _or_none(row.get("finishedAt")),
        "repaired": number(row.get("repaired")),
        "failed": number(row.get("failed")),
        "errorCount": len(errors) if isinstance(errors, list) else 0,
    }

# ---------------------------------------------------------------------- #
# 调度作业 / 诊断
# ---------------------------------------------------------------------- #
@router.get("/jobs")
async def get_jobs(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """调度作业统一仪表盘（setInterval / Cron 心跳与耗时）。"""
    _ = user
    return {"success": True, "data": _jobs(request).list()}

@router.get("/diagnostics")
async def get_diagnostics(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """聚合运维诊断（HA / 实体 / WS / 资源）。"""
    _ = user
    app = request.app
    state_store = app.state.realtime.state_store
    gateway = app.state.realtime
    redis = app.state.redis
    settings = app.state.settings
    app_config = app.state.app_config
    retention = app.state.database_retention

    host, ha = await asyncio.gather(
        app.state.system_service.get_health(),
        app.state.ha_connector.get_status(),
    )
    redis_configured = bool(settings.redis_url)
    retention_days = retention.resolve_retention_days()
    stale_info = state_store.get_stale_info()
    entity_count = state_store.get_count()
    memory_detail = state_store.get_memory_diagnostics()
    drift_repair_last_run = _load_drift_repair_last_run(request)

    frontend_cfg = app_config.get("frontend") or {}
    xlarge_threshold = frontend_cfg.get("workerDerivedThreshold")
    if not isinstance(xlarge_threshold, (int, float)) or xlarge_threshold <= 0:
        xlarge_threshold = DEFAULT_XLARGE_THRESHOLD
    ops_cfg = app_config.get("ops") or {}
    skip_sensor_timeline = ops_cfg.get("eventLogSkipSensorTimeline") is not False

    latency = get_ha_sync_latency_snapshots()
    deferred_dropped = get_ha_ws_deferred_dropped_total()

    def copy_text() -> str:
        with_samples = [snap for snap in latency if snap.count > 0]
        if with_samples:
            latency_line = "同步延迟: " + " · ".join(
                f"{snap.stage} p99={_js_number(snap.p99)}ms" for snap in with_samples[:6]
            )
        else:
            latency_line = "同步延迟: 暂无样本"

        memory_mb = host.get("memoryMb")
        limit_mb = host.get("memoryLimitMb")
        rss_mb = host.get("rssMb")
        lines = [
            f"HomeOS 诊断 {_format_locale_string(datetime.now(UTC).astimezone())}",
            (
                f"HA: {'已连接' if ha.get('connected') else '未连接'} "
                f"{ha.get('ha_version') or ''} ({ha.get('ha_ws_mode') or 'standalone'})"
            ),
            f"实体: {state_store.get_count()}",
            f"WS 客户端: {gateway.client_count()}",
            f"Redis: {'就绪' if redis.is_ready() else '未连接'}" if redis_configured else "Redis: 未配置",
            f"历史保留: {retention_days} 天",
            "传感器时间线: "
            + ("跳过写入（能耗依赖 Redis/HA 降级）" if skip_sensor_timeline else "已写入 Redis"),
            (
                f"漂移修复上次: {drift_repair_last_run['finishedAt']} · "
                f"修复 {drift_repair_last_run['repaired']} · 失败 {drift_repair_last_run['failed']}"
                if drift_repair_last_run and drift_repair_last_run.get("finishedAt")
                else "漂移修复: 尚无运行记录"
            ),
            latency_line,
            f"HA WS 延期丢弃: {deferred_dropped}",
            (
                f"CPU: {host.get('cpu')}% 内存: {host.get('memory')}% "
                f"({memory_mb if memory_mb is not None else '?'}/"
                f"{limit_mb if limit_mb is not None else '?'} MB, "
                f"RSS {rss_mb if rss_mb is not None else '?'} MB) 运行: {host.get('uptime')}"
            ),
            (
                f"实体缓存估算: ~{memory_detail['estimatedEntityStoreMb']} MB · "
                f"recentChanges {memory_detail['recentChangesCount']}/{memory_detail['recentChangesMax']}"
            ),
            f"DB: {host.get('dbSize')}",
        ]
        return "\n".join(lines)

    now = datetime.now(UTC)
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"

    return {
        "timestamp": timestamp,
        "host": host,
        "memoryDetail": memory_detail,
        "perfSuggestions": build_backend_perf_suggestions(entity_count, xlarge_threshold),
        "ha": {
            "connected": ha.get("connected"),
            "version": ha.get("ha_version"),
            "wsLeader": ha.get("ha_ws_leader"),
            "wsMode": ha.get("ha_ws_mode"),
            "reconnectCount": ha.get("reconnect_count") or 0,
            "registryAvailable": bool(ha.get("connected"))
            and not app.state.ha_connector.is_registry_degraded(),
        },
        "entities": {
            "count": entity_count,
            "stale": stale_info.get("stale"),
            "syncedAt": stale_info.get("syncedAt"),
        },
        "websocket": {"clients": gateway.client_count()},
        "haSyncLatency": [
            {
                "stage": snap.stage,
                "count": snap.count,
                "p50": _json_number(snap.p50),
                "p99": _json_number(snap.p99),
                "max": _json_number(snap.max),
            }
            for snap in latency
        ],
        "haWsDeferredDroppedTotal": deferred_dropped,
        "retention": {
            "days": retention_days,
            "skipSensorTimeline": skip_sensor_timeline,
            "note": f"事件/环境/用水等历史默认保留 {retention_days} 天；"
            "查询窗口超过保留期时图表可能不完整",
        },
        "redis": {
            "configured": redis_configured,
            "ok": redis.is_ready() if redis_configured else None,
            "timelineReady": redis.is_ready() if redis_configured else False,
        },
        "driftRepairLastRun": drift_repair_last_run,
        "copyText": copy_text(),
    }

# ---------------------------------------------------------------------- #
# 运行日志（REST + SSE）
# ---------------------------------------------------------------------- #
@router.get("/runtime-logs")
async def get_runtime_logs(
    request: Request,
    limit: str | None = Query(default=None),
    level: str | None = Query(default=None),
    q: str | None = Query(default=None),
    context: str | None = Query(default=None),
    afterId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """后端运行日志（进程内环形缓冲）。"""
    _ = user
    parsed_limit = _int_or_none(limit)
    return _runtime_buffer(request).query(
        {
            "limit": parsed_limit if parsed_limit is not None else DEFAULT_QUERY_LIMIT,
            "level": level,
            "q": q,
            "context": context,
            "afterId": _int_or_none(afterId),
        }
    )

def _sse_frame(event_type: str, data: Any, event_id: int) -> str:
    """序列化单条 SSE 消息（字段顺序 event → id → data，与 Nest SseStream 一致）。"""
    payload = (
        data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    )
    data_block = "".join(f"data: {line}\n" for line in re.split(r"\r\n|\r|\n", payload))
    return f"event: {event_type}\nid: {event_id}\n{data_block}\n"

@router.get("/runtime-logs/stream")
async def stream_runtime_logs(
    request: Request,
    level: str | None = Query(default=None),
    q: str | None = Query(default=None),
    context: str | None = Query(default=None),
    afterId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """后端运行日志 SSE 推送（Cookie 鉴权）。"""
    _ = user
    buffer = _runtime_buffer(request)
    query_filter = {"level": level, "q": q, "context": context}
    after = _int_or_none(afterId) or 0

    async def event_stream() -> AsyncIterator[str]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def listener(entry: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, entry)

        unsubscribe = buffer.subscribe(listener)
        event_id = 0
        try:
            # 先推增量缺口，再订阅实时写入
            backlog = buffer.query(
                {**query_filter, "afterId": after if after > 0 else None, "limit": 200}
            )
            yield "\n"
            for item in backlog["items"]:
                event_id += 1
                yield _sse_frame("log", item, event_id)
            event_id += 1
            yield _sse_frame("meta", buffer.meta(), event_id)

            while True:
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_MS / 1000)
                except TimeoutError:
                    event_id += 1
                    yield _sse_frame("ping", buffer.meta(), event_id)
                    continue
                if not matches_runtime_log_filter(entry, query_filter):
                    continue
                event_id += 1
                yield _sse_frame("log", entry, event_id)
        except asyncio.CancelledError:  # 客户端断开
            raise
        finally:
            unsubscribe()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Content-Type": "text/event-stream",
            "Connection": "keep-alive",
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0, no-transform",
            "Pragma": "no-cache",
            "Expire": "0",
            "X-Accel-Buffering": "no",
        },
    )

@router.delete("/runtime-logs")
async def delete_runtime_logs(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """清空后端运行日志缓冲。"""
    _ = user
    return _runtime_buffer(request).clear()

# ---------------------------------------------------------------------- #
# 设备管理
# ---------------------------------------------------------------------- #
@router.get("/devices")
async def get_devices_overview(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """设备管理总览：僵尸绑定列表（按来源分组）。"""
    _ = user
    return await request.app.state.device_management.get_devices_overview()

@router.post("/devices/unbind")
async def unbind_zombies(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """批量解绑僵尸绑定（布局 Widget / 房间绑定 / 告警规则 / 寿命统计，幂等）。"""
    _ = user
    return await request.app.state.device_management.unbind_zombies(body or {})

# ---------------------------------------------------------------------- #
# 版本 / 健康 / 网络
# ---------------------------------------------------------------------- #
@router.get("/info")
async def get_system_info(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取系统版本信息。"""
    _ = user
    return await request.app.state.system_service.get_system_info()

@router.get("/health")
async def get_health(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取系统健康状态。"""
    _ = user
    return await request.app.state.system_service.get_health()

@router.get("/network-info")
async def get_network_info(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """获取跨端网络与远程访问信息（内网地址 / 公网 IPv4·IPv6 / 端口回退）。"""
    _ = user
    headers = {key.lower(): value for key, value in request.headers.items()}
    return await request.app.state.system_service.get_network_info({"headers": headers})

@router.get("/img/0")
async def proxy_image(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
    imgurl: str | None = Query(default=None),
):
    """MoviePilot 图片代理：SSRF 校验 → 拉取二进制 → 透传内容类型 / 缓存头。"""
    _ = user
    if not imgurl:
        # 对齐 Nest ``res.status(400).send('需要提供 imgurl 查询参数')``（Express 默认 text/html）
        return Response(
            content="需要提供 imgurl 查询参数",
            status_code=400,
            media_type="text/html; charset=utf-8",
        )
    result = await request.app.state.moviepilot_proxy.proxy_image(
        imgurl, dict(request.headers)
    )
    headers = dict(result.headers or {})
    return Response(content=result.body, status_code=result.status, headers=headers)

__all__ = ["SSE_HEARTBEAT_MS", "router"]
