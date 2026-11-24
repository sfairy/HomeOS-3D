"""停机编排：逐个组件隔离超时与异常，最后释放数据库。

## 为什么单独成模块而不是留在 ``lifespan``

``lifespan.py`` 有 1770 行、40+ 个函数，是「装配 + 运行 + 停机」三件事写在同一个文件里。
停机这一段（~190 行）与启动装配**没有任何共享状态**：它只读 ``app.state`` 和我传进来的
``_StartupContext``，用的是自己的一小组 helper。把它拆出来之后，改停机顺序不需要在
1770 行里找位置，也不会误碰启动路径。

## 与 ``lifespan`` 的关系

本模块**不 import** ``lifespan``（连 ``TYPE_CHECKING`` 下也不）：架构检查的 B5 把类型导入
同样算作文件级依赖，``lifecycle ↔ lifespan`` 会立刻报循环。``startup`` 参数因此标注为
``Any``，它实际是 ``_StartupContext`` —— 契约由调用方（``shutdown_all(app, startup)``）
单点保证。

## 两条不变量（改这个模块前先读）

1. **任何组件的停机失败都不能打断停机流程**：``shutdown_component`` 把超时与异常都收敛成
   一条 warning + 一条全局日志。这条是历史事故的直接产物 —— 旧实现把地震那四个组件塞进
   同一个 ``try``，第一个失败会让后面三个**根本不执行**，表现为「关机后进程残留」。
2. **释放数据库必须是最后一步**：备份线程可能还在 VACUUM/zip，先 dispose 会撞上已关闭的
   连接（use-after-dispose）。``_dispose_databases_after_shutdown`` 先等协调器空闲（有界
   超时），超时就**跳过** dispose 并放弃「干净关闭」标记 —— 下次启动会逐页全查。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI

from homeos_shared.schema_core import mark_clean_shutdown

from . import studio3d_plane
from ..platform.core.runtime.background_tasks import background_tasks

logger = logging.getLogger("homeos.app")

#: 单个组件停机的等待上限（秒）。超过就放弃等待并记一条 warning —— 卡住的组件不应该
#: 让整机停机拖到看门狗都超时。
SHUTDOWN_TIMEOUT = 5.0


async def record_lifecycle_failure(event_log: Any, what: str, message: str) -> None:
    """生命周期故障留痕：进程日志 + 全局日志（用户能在「系统后台」里看到）。

    走 ``append_async``：停机路径上写日志不能同步占住事件循环（此时其它组件正在等
    超时，主循环被拖住会把 5s 的预算变成更长的假死）。写失败只降级成进程日志 ——
    停机阶段的收尾日志永远不能反过来打断停机。
    """
    logger.warning("%s", message)
    if event_log is None:
        return
    try:
        await event_log.append_async("warning", "系统后台", "生命周期", message, context={"phase": what})
    except Exception:
        logger.debug("生命周期故障写入全局日志失败: %s", what, exc_info=True)


async def shutdown_component(
    what: str,
    stopper: Callable[[], Awaitable[Any]],
    *,
    event_log: Any = None,
) -> None:
    """停机一个组件：超时/异常只记日志，绝不打断停机流程。

    旧写法是十几段复制粘贴的 `try: await asyncio.wait_for(x.stop(), timeout=5) except
    Exception: pass`，两个问题：

    1. `pass` 把失败彻底吞掉 —— 停机为什么慢、哪个组件卡住，日志里一点痕迹都没有；
    2. 地震那组把四个组件塞进同一个 `try`，第一个失败会让后面三个**根本不执行**。
    """
    try:
        await asyncio.wait_for(stopper(), SHUTDOWN_TIMEOUT)
    except TimeoutError:
        logger.warning("%s停机超时（%ss），已放弃等待", what, SHUTDOWN_TIMEOUT)
        await record_lifecycle_failure(event_log, what, f"{what}停机超时（{SHUTDOWN_TIMEOUT}s），已放弃等待")
    except Exception as exc:
        logger.warning("%s停机失败：%s", what, exc)
        await record_lifecycle_failure(event_log, what, f"{what}停机失败: {exc}")


async def shutdown_business_monitors(app: FastAPI, shutdown: Callable[..., Awaitable[None]]) -> None:
    """停掉业务监测器与倒计时（顺序无所谓，各自的 stop 都是幂等的）。"""
    for attr, label in (
        ("water_monitor", "用水监测"),
        ("energy_monitor", "用能监测"),
        ("iaq_monitor", "室内环境监测"),
        ("circadian", "昼夜节律"),
        ("device_timer", "设备倒计时"),
    ):
        service = getattr(app.state, attr, None)
        stopper = getattr(service, "stop", None)
        if callable(stopper):
            await shutdown(label, stopper)


async def shutdown_agent_timeline(app: FastAPI, shutdown: Callable[..., Awaitable[Any]]) -> None:
    """把设备时序的写入队列落盘（必须在数据库 dispose 之前）。"""
    timeline = getattr(app.state, "agent_timeline", None)
    if timeline is not None:
        await shutdown("设备时序刷盘", timeline.close)


async def shutdown_agent_automation(app: FastAPI, shutdown: Callable[..., Awaitable[Any]]) -> None:
    """停止看门狗、计划任务与草案清理（先停巡检，避免停机过程中再触发设备控制）。"""
    for service, label in (
        (getattr(app.state, "agent_watchdog", None), "看门狗"),
        (getattr(app.state, "agent_scheduler", None), "计划任务"),
        (getattr(app.state, "automation_drafts", None), "自动化草案清理"),
    ):
        if service is not None:
            await shutdown(label, service.stop)


async def shutdown_media_services(app: FastAPI, shutdown: Any) -> None:
    """媒体入库轮询与影音场景（各自可能未启用）。"""
    media_poller = getattr(app.state, "media_poller", None)
    if media_poller is not None:
        await shutdown("媒体入库轮询", media_poller.stop)
    media_scene = getattr(app.state, "media_scene", None)
    if media_scene is not None and hasattr(media_scene, "stop"):
        await shutdown("影音场景", media_scene.stop)


async def dispose_databases_after_shutdown(app: FastAPI, startup: Any) -> None:
    """收尾释放两个库的连接池（业务库 + 日志库）。

    调度器停掉不代表正在跑的备份线程已经结束；先等协调器锁空闲再释放数据库，
    否则备份线程可能在 VACUUM/zip 时撞上已 dispose 的连接。等待有上界，
    超时则不 dispose（进程即将退出，交给 OS 回收），避免制造 use-after-dispose。
    日志库不参与备份，但同样只在「干净收尾」时 dispose —— 否则它的 WAL 会留在盘上。
    """
    dispose_database = True
    coordinator = getattr(app.state, "business_backup", None)
    if coordinator is not None:
        try:
            await asyncio.wait_for(coordinator.wait_idle(), 10.0)
        except TimeoutError:
            dispose_database = False
            logger.warning("备份作业仍在执行，跳过数据库 dispose 以免中途释放连接")
    database = getattr(app.state, "database", None)
    if database is not None and dispose_database:
        database.dispose()
        # 收尾真跑完（含 WAL 归并）才落「干净关闭」标记：下次启动据此只做 quick_check。
        # dispose 被跳过时（备份线程还在跑）不落标记 —— 那种收尾本来就不算干净，
        # 下次启动必须逐页全查。
        mark_clean_shutdown(startup.app_settings.database_path)
    log_database = getattr(app.state, "log_database", None)
    if log_database is not None and dispose_database:
        log_database.dispose()


async def shutdown_all(app: FastAPI, startup: Any) -> None:
    """停机全部组件：逐个隔离超时 / 异常，最后释放数据库。

    **顺序即约束**（与启动顺序大致相反）：

    - 先停采样与授权（它们只读状态，早停能少一批日志）；
    - 业务监测 / 家庭模式 / Agent 巡检 / 通知 / 媒体 / 通道：这些都会**发命令**，
      必须在 HA 连接器之前停，否则停机过程中还会往外发设备控制；
    - 事件日志刷盘 → 设备时序刷盘 → 全局日志刷盘 → 后台任务：写者先关，读侧最后关；
    - 数据库 dispose 收尾。
    """
    loop_lag = getattr(app.state, "loop_lag", None)
    event_log = getattr(app.state, "global_log", None)

    async def shutdown(what: str, stopper: Callable[[], Awaitable[Any]]) -> None:
        # 统一带上全局日志：停机失败既要进进程日志，也要让用户在「系统后台」看得到。
        await shutdown_component(what, stopper, event_log=event_log)

    if loop_lag is not None:
        await shutdown("事件循环延迟采样", loop_lag.stop)
    await shutdown("3D 平面", lambda: studio3d_plane.shutdown(app))
    await shutdown("授权服务", startup.license_service.stop)
    await shutdown("数据库保留调度", startup.database_retention.stop_schedule)
    await shutdown("外部 API", startup.external_api.stop)
    for service, label in (
        (startup.presence, "在场检测"),
        (startup.mmwave, "毫米波"),
        (startup.away_sim, "离家模拟"),
    ):
        await shutdown(label, service.stop)
    await shutdown_business_monitors(app, shutdown)
    await shutdown("家庭模式", startup.home_mode.stop)
    proactive = getattr(app.state, "agent_proactive", None)
    if proactive is not None:
        await shutdown("主动管家", proactive.stop)
    await shutdown_agent_automation(app, shutdown)
    await shutdown("通知", startup.notification.stop)
    await shutdown_media_services(app, shutdown)
    channels_service = getattr(app.state, "channels_service", None)
    if channels_service is not None:
        await shutdown("消息通道", channels_service.stop)
    for service, label in (
        (startup.catalog_notify, "目录通知"),
        (startup.eew_poll, "地震预警轮询"),
        (startup.earthquake, "地震服务"),
        (startup.eew_leader, "地震预警主节点"),
    ):
        await shutdown(label, service.stop)
    for service, label in (
        (startup.weather_watch, "天气监视"),
        (startup.advisor_usage, "顾问用量"),
    ):
        await shutdown(label, service.stop)
    await shutdown("HA 连接器", startup.ha_connector.stop)
    await shutdown("状态汇聚", startup.state_ingress_coalesce.close)
    from ..api.ha.proxy import close_shared_media_clients
    from ..domains.agent.shared_http import close_shared_http_client

    await shutdown("媒体代理连接池", close_shared_media_clients)
    await shutdown("Agent 共享 HTTP 连接池", close_shared_http_client)
    await shutdown("事件日志刷盘", startup.event_log_service.flush)
    # 设备时序的写入队列要先落盘再释放数据库（否则关停窗口里的状态变更会丢）。
    await shutdown_agent_timeline(app, shutdown)
    # 全局日志最后刷盘：必须等所有组件停止后再关写线程，否则停机期间产生的诊断日志
    # 会滞留在内存队列里丢掉。
    if event_log is not None:
        await shutdown("全局日志刷盘", lambda: asyncio.to_thread(event_log.close, 5.0))
    # 兜底收尾用 background_tasks.spawn 起的后台任务（不属于任何具体服务，服务 stop() 覆盖不到）。
    await shutdown("后台任务", background_tasks.shutdown)
    startup.auto_backup.stop()
    await dispose_databases_after_shutdown(app, startup)


__all__ = [
    "SHUTDOWN_TIMEOUT",
    "dispose_databases_after_shutdown",
    "record_lifecycle_failure",
    "shutdown_agent_automation",
    "shutdown_agent_timeline",
    "shutdown_all",
    "shutdown_business_monitors",
    "shutdown_component",
    "shutdown_media_services",
]
