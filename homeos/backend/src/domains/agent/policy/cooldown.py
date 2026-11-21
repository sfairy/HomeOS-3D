"""主动提醒的跨进程冷却（「上次提醒时间」不再只存在进程内）。

为什么需要
----------
主动管家与看门狗都用「最小提醒间隔」做频控，但原来的实现是一个进程内
``_last_sent_at``（monotonic 秒）。这带来两种失真：

- **重启即清零**：进程重启（升级 / 崩溃重启 / 改了配置触发热重载）后冷却窗口丢失，
  同一批异常会立刻再推一次；
- **多 worker 各算一份**：实际提醒频率是配置值的 N 倍，看门狗的「单设备 4 小时冷却」
  同样失效，极端情况下同一台设备会被反复自动关停。

修法是把「上次发送时间」放进已有的 :class:`SharedStateStore`
（``<data_dir>/agent-state.sqlite3``，与短时记忆 / 批量确认 / 日预算同一份），
冷却判定与登记合并成一次 ``mutate``：``BEGIN IMMEDIATE`` 下只有一个调用方能占到
这个窗口，其余看到的都是「冷却中」。

用法
----
::

    if cooldown.is_cooling("proactive", cfg.cooldown_seconds):   # 便宜的前置判断
        return skipped
    if not cooldown.try_acquire("proactive", cfg.cooldown_seconds):
        return skipped
    sent = await send(...)
    if not sent:
        cooldown.release("proactive")   # 没送出去就别吃掉这个窗口

``try_acquire`` 里条目 TTL = 冷却窗口：过期即等同「很久没提醒」，不需要额外清理。
"""

from __future__ import annotations

import logging
import time
from typing import Any

from ..state.store import MemoryStateStore, SharedStateStore

logger = logging.getLogger("homeos.agent.cooldown")

#: 命名空间前缀：通知冷却与设备关停冷却各占一份，互不覆盖
DEFAULT_NAMESPACE = "agent.cooldown"


def _as_timestamp(value: Any) -> float | None:
    """从共享状态里取出时间戳；布尔 / 字符串 / 缺省一律当作「没有记录」。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


class SendCooldown:
    """「同一 key 在 cooldown 秒内最多成功投递一次」的共享闸门。"""

    def __init__(
        self,
        store: SharedStateStore | None = None,
        namespace: str = DEFAULT_NAMESPACE,
    ) -> None:
        #: 未注入共享状态库时退化为进程内实现：单进程部署语义与改动前完全一致
        self._store: SharedStateStore = store or MemoryStateStore()
        self._namespace = namespace

    @property
    def shared(self) -> bool:
        """当前是否跨进程共享（日志 / 诊断用）。"""
        return bool(getattr(self._store, "shared", False))

    def bind_store(self, store: SharedStateStore | None) -> None:
        """装配后期注入共享状态库（看门狗 / 主动管家先于共享状态构造）。"""
        if store is not None:
            self._store = store

    # 冷却窗口
    def last_sent(self, key: str) -> float | None:
        """上次成功发送的 Unix 时间；没有记录返回 ``None``。"""
        return _as_timestamp(self._store.get(self._namespace, key))

    def is_cooling(self, key: str, cooldown_seconds: float, now: float | None = None) -> bool:
        """只读判断是否仍在冷却窗口内（用于跳过昂贵的数据读取）。"""
        last = self.last_sent(key)
        if last is None:
            return False
        moment = time.time() if now is None else now
        return moment - last < max(0.0, float(cooldown_seconds))

    def try_acquire(self, key: str, cooldown_seconds: float, now: float | None = None) -> bool:
        """占用一次发送机会：冷却内返回 ``False``，否则登记当前时间并返回 ``True``。

        判定与登记在同一次 ``mutate`` 里完成，多 worker 同时命中时只有一个能拿到。
        """
        moment = time.time() if now is None else now
        window = max(0.0, float(cooldown_seconds))

        def _apply(old: Any) -> tuple[float, bool]:
            last = _as_timestamp(old)
            if last is not None and moment - last < window:
                return last, False
            return moment, True

        try:
            result = self._store.mutate(self._namespace, key, _apply, ttl_seconds=window or None)
        except Exception as exc:  # 状态库异常不能演变成「以后再也不提醒」
            logger.warning("冷却状态读写失败,本次按放行处理: key=%s (%s)", key, exc)
            return True
        if result is None:
            # sqlite 实现仅在事务失败时返回 None：宁可多发一次，也不要静默不再提醒
            logger.warning("冷却状态写入失败,本次按放行处理: key=%s", key)
            return True
        return bool(result)

    def release(self, key: str) -> None:
        """归还窗口（发送失败 / 被免打扰拦下时调用），避免白白吃掉一个冷却周期。"""
        try:
            self._store.delete(self._namespace, key)
        except Exception as exc:  # 归还失败只会多等一个窗口，不影响主流程
            logger.debug("冷却状态释放失败: key=%s (%s)", key, exc)


__all__ = ["DEFAULT_NAMESPACE", "SendCooldown"]
