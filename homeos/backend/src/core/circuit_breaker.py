"""断路器（对齐 ``common/resilience/circuit-breaker.helper.ts``）。

三态机（closed → open → half_open → closed），用于保护不稳定下游（HA / 第三方集成）：
- closed：正常放行，连续失败达 ``failure_threshold`` 后跳 open；
- open：快速失败抛 ``CircuitOpenError``，经过 ``recovery_timeout`` 后转入 half_open；
- half_open：仅放行单个探测请求，连续成功 ``half_open_max_attempts`` 次回到 closed，
  任意失败立即重开。
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger("homeos.circuit_breaker")


class CircuitOpenError(Exception):
    """断路器打开时抛出，携带 ``circuit_name`` 与 ``retry_after_seconds``。"""

    def __init__(self, circuit_name: str, retry_after_seconds: int) -> None:
        self.circuit_name = circuit_name
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"断路器 [{circuit_name}] 已打开，{retry_after_seconds} 秒后重试")


class CircuitBreaker:
    """三态断路器。"""

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 3,
        recovery_timeout_ms: int = 30_000,
        half_open_max_attempts: int = 2,
    ) -> None:
        self.name = name
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout_ms
        self._half_open_max_attempts = half_open_max_attempts
        self._state = "closed"
        self._failure_count = 0
        self._last_failure_ms = 0.0
        self._success_count = 0
        self._half_open_in_progress = False
        self._metrics: dict[str, Any] = {
            "totalCalls": 0,
            "totalSuccesses": 0,
            "totalFailures": 0,
            "rejectedWhileOpen": 0,
            "openedCount": 0,
            "lastOpenedAt": 0,
            "lastError": "",
        }

    def _now_ms(self) -> float:
        return time.time() * 1000

    async def fire(self, fn: Callable[[], Awaitable[Any]]) -> Any:
        """执行受保护任务，按结果推进状态机。"""
        if self._state == "open":
            elapsed = self._now_ms() - self._last_failure_ms
            if elapsed >= self._recovery_timeout:
                self._state = "half_open"
                self._success_count = 0
                self._half_open_in_progress = False
                logger.info("%s: 进入半开状态,尝试恢复...", self.name)
            else:
                remaining = int(-(-(self._recovery_timeout - elapsed) // 1000))
                self._metrics["rejectedWhileOpen"] += 1
                logger.warning("%s: 断路器打开,%s秒后重试", self.name, remaining)
                raise CircuitOpenError(self.name, remaining)

        # 半开期单探测：已有探测在途时快速失败，避免并发请求一拥而上
        if self._state == "half_open" and self._half_open_in_progress:
            self._metrics["rejectedWhileOpen"] += 1
            raise CircuitOpenError(self.name, int(-(-self._recovery_timeout // 1000)))

        probing = self._state == "half_open"
        if probing:
            self._half_open_in_progress = True

        self._metrics["totalCalls"] += 1
        try:
            result = await fn()
        except BaseException as err:  # noqa: BLE001 - 记录后原样抛出
            self._metrics["lastError"] = str(err).strip() or err.__class__.__name__
            self._on_failure()
            raise
        else:
            self._on_success()
            return result
        finally:
            if probing:
                self._half_open_in_progress = False

    def _on_success(self) -> None:
        self._metrics["totalSuccesses"] += 1
        self._failure_count = 0
        if self._state == "half_open":
            self._success_count += 1
            if self._success_count >= self._half_open_max_attempts:
                self._state = "closed"
                logger.info("%s: 断路器已关闭(恢复正常)", self.name)

    def _on_failure(self) -> None:
        self._metrics["totalFailures"] += 1
        self._failure_count += 1
        self._last_failure_ms = self._now_ms()
        if self._state == "half_open":
            self._state = "open"
            self._metrics["openedCount"] += 1
            self._metrics["lastOpenedAt"] = self._now_ms()
            logger.error("%s: 半开状态失败,断路器重新打开", self.name)
        elif self._state == "closed" and self._failure_count >= self._failure_threshold:
            self._state = "open"
            self._metrics["openedCount"] += 1
            self._metrics["lastOpenedAt"] = self._now_ms()
            logger.error("%s: 连续失败 %s 次,断路器打开", self.name, self._failure_count)

    def get_state(self) -> dict[str, Any]:
        """当前状态与运行指标快照（指标为浅拷贝）。"""
        return {
            "name": self.name,
            "state": self._state,
            "failureCount": self._failure_count,
            "lastFailureTime": self._last_failure_ms,
            "metrics": dict(self._metrics),
        }


__all__ = ["CircuitBreaker", "CircuitOpenError"]
