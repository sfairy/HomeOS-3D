"""停机编排：把全部组件逐个隔离超时 / 异常地停掉，最后释放数据库。

为什么从 ``lifespan`` 拆出来
---------------------------
停机是一段**顺序编排**：每个组件的停止都可能卡住，而组件之间的先后有硬约束
（连接器停了才刷时序缓冲、全局日志必须最后关、备份线程空闲了才 dispose 数据库）。
这些约束只能写成一条长链，放在 ``lifespan`` 里就让那个文件同时承担「装配」和
「拆除」两件不相干的事，任何一侧的增量都会把它推得更长。

拆出来后两个文件的职责各自收敛：``lifespan`` 只负责启动构建，本模块只负责停机。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from homeos_shared.schema_core import mark_clean_shutdown

logger = logging.getLogger("homeos.app")

#: 单个组件的停机超时（秒）。超过即放弃等待并留痕，不打断后续组件。
SHUTDOWN_TIMEOUT = 5.0

#: 备份线程仍在跑时的等待上界（秒）。超时不 dispose 数据库，交给进程退出时由 OS 回收。
_BACKUP_IDLE_TIMEOUT = 10.0

#: 停机阶段的统一停止回调签名（见 ``shutdown_all`` 内部定义的 ``shutdown``）。
Stopper = Callable[[str, Callable[[], Awaitable[Any]]], Awaitable[None]]


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


async def _stop_samplers(app: Any, startup: Any, shutdown: Stopper, plane: Any) -> None:
    """采样器与 3D 平面：都在其它服务之前停，避免停机过程本身产生新的业务写入。"""
    loop_lag = getattr(app.state, "loop_lag", None)
    if loop_lag is not None:
        await shutdown("事件循环延迟采样", loop_lag.stop)
    # 3D 平面模块是按需导入的：启动在 install 之前就失败时它从未被导入过，
    # 此时不能为了停机去 import 一遍（会在失败路径上再跑一次装配期依赖）。
    if plane is not None:
        await shutdown("3D 平面", lambda: plane.shutdown(app))
    await shutdown("授权服务", startup.license_service.stop)
    await shutdown("数据库保留调度", startup.database_retention.stop_schedule)
    await shutdown("外部 API", startup.external_api.stop)


async def _stop_presence_services(startup: Any, shutdown: Stopper) -> None:
    """在场感知 / 家庭模式：都依赖状态汇聚，须早于它停。"""
    for service, label in (
        (startup.presence, "在场检测"),
        (startup.mmwave, "毫米波"),
        (startup.away_sim, "离家模拟"),
    ):
        await shutdown(label, service.stop)
    await shutdown("家庭模式", startup.home_mode.stop)


async def _stop_agent_automation(app: Any, shutdown: Stopper) -> None:
    """停止看门狗与计划任务（先停巡检，避免停机过程中再触发设备控制）。"""
    for service, label in (
        (getattr(app.state, "agent_watchdog", None), "看门狗"),
        (getattr(app.state, "agent_scheduler", None), "计划任务"),
    ):
        if service is not None:
            await shutdown(label, service.stop)


async def _stop_agent_and_channels(app: Any, startup: Any, shutdown: Stopper) -> None:
    """主动管家 / 计划任务 / 通知与消息通道 / 地震与天气等周期服务。"""
    proactive = getattr(app.state, "agent_proactive", None)
    if proactive is not None:
        await shutdown("主动管家", proactive.stop)
    await _stop_agent_automation(app, shutdown)
    await shutdown("通知", startup.notification.stop)
    channels_service = getattr(app.state, "channels_service", None)
    if channels_service is not None:
        await shutdown("消息通道", channels_service.stop)
    for service, label in (
        (startup.catalog_notify, "目录通知"),
        (startup.eew_poll, "地震预警轮询"),
        (startup.earthquake, "地震服务"),
        (startup.eew_leader, "地震预警主节点"),
        (startup.weather_watch, "天气监视"),
        (startup.advisor_usage, "顾问用量"),
    ):
        await shutdown(label, service.stop)


async def _stop_ha_and_ingress(app: Any, startup: Any, shutdown: Stopper) -> None:
    """HA 连接器 → 时序刷盘 → 状态汇聚 → 媒体池 → 事件日志 → 全局日志。

    顺序是硬约束：连接器停了之后必须把 200ms 微批的时序缓冲刷掉，否则最后一批翻转
    会随进程消失；全局日志必须最后关，否则停机期间产生的诊断日志会滞留在内存队列里。
    """
    await shutdown("HA 连接器", startup.ha_connector.stop)
    agent_timeline = getattr(app.state, "agent_timeline", None)
    if agent_timeline is not None:
        await shutdown("设备时序刷盘", agent_timeline.aclose)
    await shutdown("状态汇聚", startup.state_ingress_coalesce.close)
    # 媒体代理的共享连接池：延迟导入，避免 lifespan 在模块级拉进整条 API 依赖链。
    from ..api.ha.proxy import close_shared_media_clients

    await shutdown("媒体代理连接池", close_shared_media_clients)
    await shutdown("事件日志刷盘", startup.event_log_service.flush)
    event_log = getattr(app.state, "global_log", None)
    if event_log is not None:
        await shutdown("全局日志刷盘", lambda: asyncio.to_thread(event_log.close, 5.0))


async def _release_databases(app: Any, startup: Any) -> None:
    """备份线程空闲后释放数据库，并落「干净关闭」标记。

    调度器停掉不代表正在跑的备份线程已经结束：先等协调器锁空闲再释放数据库，否则
    备份线程可能在 VACUUM/zip 时撞上已 dispose 的连接。等待有上界，超时则不 dispose
    （进程即将退出，交给 OS 回收），避免制造 use-after-dispose。
    """
    dispose_database = True
    coordinator = getattr(app.state, "business_backup", None)
    if coordinator is not None:
        try:
            await asyncio.wait_for(coordinator.wait_idle(), _BACKUP_IDLE_TIMEOUT)
        except TimeoutError:
            dispose_database = False
            logger.warning("备份作业仍在执行，跳过数据库 dispose 以免中途释放连接")
    database = getattr(app.state, "database", None)
    if database is None or not dispose_database:
        return
    # 遥测库先关：它的写队列已在「设备时序刷盘」清空，这里只是归还连接。
    telemetry_database = getattr(app.state, "telemetry_database", None)
    if telemetry_database is not None:
        telemetry_database.dispose()
    database.dispose()
    # 收尾真跑完（含 WAL 归并）才落「干净关闭」标记：下次启动据此只做 quick_check。
    # dispose 被跳过时（备份线程还在跑）不落标记 —— 那种收尾本来就不算干净，
    # 下次启动必须逐页全查。
    mark_clean_shutdown(startup.app_settings.database_path)


async def shutdown_all(app: Any, startup: Any, *, studio3d_plane: Any = None) -> None:
    """停机全部组件：逐个隔离超时 / 异常，最后释放数据库。

    各阶段拆成独立函数：停机链的**顺序**仍然集中在这一个函数里（读一屏就能看出
    先停什么、后停什么），但每个阶段内部的分支不再堆进同一张复杂度账单。

    ``studio3d_plane`` 由调用方传入已加载的模块句柄；为 ``None`` 表示启动在
    ``install`` 之前就失败、该模块从未导入，此时跳过而不是就地 import。
    """
    event_log = getattr(app.state, "global_log", None)

    async def shutdown(what: str, stopper: Callable[[], Awaitable[Any]]) -> None:
        # 统一带上全局日志：停机失败既要进进程日志，也要让用户在「系统后台」看得到。
        await shutdown_component(what, stopper, event_log=event_log)

    await _stop_samplers(app, startup, shutdown, studio3d_plane)
    await _stop_presence_services(startup, shutdown)
    await _stop_agent_and_channels(app, startup, shutdown)
    await _stop_ha_and_ingress(app, startup, shutdown)
    startup.auto_backup.stop()
    await _release_databases(app, startup)
