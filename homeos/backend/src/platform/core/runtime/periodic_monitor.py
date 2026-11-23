"""周期后台监测器的公共骨架（用水 / 能耗 / IAQ / 昼夜节律共用）。

这几个服务形状完全一样：等一个启动延迟 → 按固定间隔求值一次 → 停机时可被打断。
把它们各自的 ``start/stop/_loop`` 抄四遍的代价不是行数，而是**不一致**：

- 某一处忘了给任务加强引用，事件循环回收后监测静默停止；
- 某一处把 ``CancelledError`` 当普通异常吞掉，``stop()`` 永远等不到退出；
- 某一处每轮异常都 ``logger.exception``，HA 断连时日志被刷成滚屏（真正的错误反而看不见）。

因此这里只保留一份循环：子类实现 :meth:`tick`，异常一律**节流**记录（每分钟最多一条，
附累计次数），取消原样向上抛。

约定：``tick`` 必须是幂等的求值，不得持有跨轮状态机 —— 需要「持续 N 分钟」这类状态时，
放在子类的字典里并用单次求值时间做判据（与 ``security.presence`` 的写法一致）。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger("homeos.monitor")

#: 异常日志的最小间隔（秒）：监测器按分钟级运行，出故障时不该比业务日志还吵。
_ERROR_LOG_INTERVAL_SECONDS = 60.0


class PeriodicMonitor:
    """按固定间隔执行 :meth:`tick` 的后台监测器（单进程单实例）。"""

    #: 日志与诊断用的名字（也是 ``app.state`` 上的属性名依据）。
    name: str = "monitor"

    def __init__(self, *, interval_seconds: float, boot_delay_seconds: float = 10.0) -> None:
        self._interval = max(1.0, float(interval_seconds))
        self._boot_delay = max(0.0, float(boot_delay_seconds))
        self._stop = asyncio.Event()
        self._task: asyncio.Task[Any] | None = None
        self._error_count = 0
        self._last_error_log = 0.0
        self._last_tick_at: float | None = None
        self._last_tick_ok: bool | None = None
        self._ticks = 0

    # ---- 生命周期 ----
    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stop.set()
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # fmt: skip
            # 停机路径上任何异常都不该阻断关闭流程（其它服务还要停）。
            logger.debug("%s 停机时任务异常退出", self.name, exc_info=True)

    # ---- 主循环 ----
    async def _loop(self) -> None:
        if self._boot_delay > 0:
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._boot_delay)
                return
            except TimeoutError:
                # 正常路径：启动延迟到期，继续进入主循环（不是错误，无需日志）。
                logger.debug("%s 启动延迟结束，开始首轮求值", self.name)
        while not self._stop.is_set():
            await self._run_once()
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._interval)
                return
            except TimeoutError:
                # 正常路径：间隔到期，进入下一轮。
                logger.debug("%s 间隔到期，进入第 %s 轮", self.name, self._ticks + 1)

    async def _run_once(self) -> None:
        """单轮求值：异常只在本轮内消化，并做日志节流。"""
        started = time.monotonic()
        try:
            await self.tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            self._error_count += 1
            self._last_tick_ok = False
            now = time.monotonic()
            if now - self._last_error_log >= _ERROR_LOG_INTERVAL_SECONDS:
                self._last_error_log = now
                logger.warning(
                    "%s 第 %s 轮求值失败（累计 %s 次，同类日志每分钟最多一条）",
                    self.name,
                    self._ticks + 1,
                    self._error_count,
                    exc_info=True,
                )
        else:
            self._last_tick_ok = True
        finally:
            self._ticks += 1
            self._last_tick_at = started

    # ---- 求值 ----
    async def tick(self) -> None:
        raise NotImplementedError

    # ---- 诊断 ----
    def diagnostics(self) -> dict[str, Any]:
        """供 ``/system/diagnostics`` 之外的排错使用：一眼看出监测是否活着。"""
        return {
            "name": self.name,
            "intervalSeconds": self._interval,
            "running": self._task is not None and not self._task.done(),
            "ticks": self._ticks,
            "errors": self._error_count,
            "lastTickOk": self._last_tick_ok,
            "secondsSinceLastTick": (
                None if self._last_tick_at is None else round(time.monotonic() - self._last_tick_at, 1)
            ),
        }


__all__ = ["PeriodicMonitor"]
