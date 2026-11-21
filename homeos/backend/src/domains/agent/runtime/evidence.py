"""执行实证：把「命令发出去了」升级成「状态真的变了」。

参考实现的判定顺序（窗口 1500ms）：

1. 窗口内观察到状态翻转，且事件 ``contextId`` 与本次命令一致 → ``VERIFIED``；
2. 实体本来就在目标态 → ``ACCEPTED:already_at_target_state``（不算实证）；
3. 窗口内没等到事件 → ``ACCEPTED:observation_timeout``；
4. 等到了事件但 ``contextId`` 对不上（HA 自动化 / 手动操作抢在同一时刻）→
   ``ACCEPTED:unlinkedObservation``。

本项目复用命令通道已经算好的 ``verification`` 三态（``domains/proxy/verification.py``），
不再重复向 HA 订阅一遍状态：那份三态本身就是「响应里的实际状态 vs 请求目标」。

**只有 ``VERIFIED`` 允许命令缓存命中**：``ACCEPTED`` 只说明「没被证伪」，
把它当成可重放的成功会让「设备离线时点的开关」被记成一条有效映射。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

VERIFIED = "VERIFIED"
ACCEPTED = "ACCEPTED"
FAILED = "FAILED"

#: 观察窗口（毫秒）：命令通道的 ``verification`` 是同步返回的，这里只用于记录语义。
OBSERVATION_WINDOW_MS = 1500
#: 纠错引用窗口（秒）：纠正上一句时，只认这个窗口内的执行记录。
CORRECTION_WINDOW_SECONDS = 300

_ACCEPTED_REASONS = {
    "already_at_target_state",
    "observation_timeout",
    "unlinkedObservation",
    "no_derivable_target",
    "entity_not_in_response",
}


@dataclass(frozen=True)
class EvidenceResult:
    """一次工具的实证结论。``verified`` 为 True 时才允许写「可命中」缓存。"""

    status: str
    reason: str

    @property
    def verified(self) -> bool:
        return self.status == VERIFIED

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status, "reason": self.reason, "verified": self.verified}


def _reason(result: dict[str, Any]) -> str:
    verification = result.get("verification")
    if isinstance(verification, dict):
        return str(verification.get("reason") or "").strip()
    return str(result.get("reason") or "").strip()


def _from_verification(verification: dict[str, Any], *, already_at_target: bool) -> EvidenceResult:
    """``command_proxy`` 的 verification 三态 → 实证结论。"""
    verified = verification.get("verified")
    reason = str(verification.get("reason") or "").strip()
    if verified is True:
        return EvidenceResult(VERIFIED, reason or "state_confirmed")
    if verified is False:
        return EvidenceResult(FAILED, reason or "state_mismatch")
    if already_at_target:
        return EvidenceResult(ACCEPTED, "already_at_target_state")
    if verification.get("supported") is False:
        return EvidenceResult(ACCEPTED, reason or "no_derivable_target")
    return EvidenceResult(ACCEPTED, reason or "observation_timeout")


def evaluate_tool_result(
    result: Any, *, already_at_target: bool = False, context_linked: bool = True
) -> EvidenceResult:
    """从工具结果推断实证结论（纯函数）。"""
    if not isinstance(result, dict):
        return EvidenceResult(ACCEPTED, "unlinkedObservation")
    if result.get("ok") is False or result.get("error"):
        return EvidenceResult(FAILED, _reason(result) or "tool_failed")

    verification = result.get("verification")
    if isinstance(verification, dict):
        outcome = _from_verification(verification, already_at_target=already_at_target)
        if not context_linked and outcome.status == ACCEPTED:
            return EvidenceResult(ACCEPTED, "unlinkedObservation")
        return outcome

    # 没有 verification 包装时看顶层 verified。
    verified = result.get("verified")
    if verified is True:
        return EvidenceResult(VERIFIED, _reason(result) or "state_confirmed")
    if verified is False:
        return EvidenceResult(FAILED, _reason(result) or "state_mismatch")
    if already_at_target:
        return EvidenceResult(ACCEPTED, "already_at_target_state")
    reason = _reason(result)
    if reason in _ACCEPTED_REASONS:
        return EvidenceResult(ACCEPTED, reason)
    return EvidenceResult(ACCEPTED, "observation_timeout")


__all__ = [
    "ACCEPTED",
    "CORRECTION_WINDOW_SECONDS",
    "FAILED",
    "OBSERVATION_WINDOW_MS",
    "VERIFIED",
    "EvidenceResult",
    "evaluate_tool_result",
]
