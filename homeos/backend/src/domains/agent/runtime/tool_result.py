"""工具结果契约统一：每个工具结果都带一个可读的 ``ok`` 真值与失败原因。

仓库里同时存在三种「成功标记」，各自都有来历：

- ``success`` —— 控制类工具，直接透传 ``CommandProxy`` 的响应；
- ``ok`` —— 计划任务 / 家规 / 自动化，写库类工具的惯例；
- ``error`` —— 参数校验或工具内部异常（``set_light_brightness`` 传了非 ``light.*``）。

单看都成立，但消费方必须同时理解三种：LLM 上下文、审计、批量确认、成功率统计，
漏掉任意一种就会把失败读成成功（``{"error": ...}`` 的结果里既没有 ``success`` 也没有
``ok``，按「非 false 即成功」的老口径就是成功）。

统一收敛在**唯一边界** —— ``AgentService._call_tool`` 返回之前 —— 做一次归一：

- ``ok``：三种标记归一后的布尔结论，恒存在；
- ``error``：``ok=False`` 且既非被拦截、又没有 ``error`` 时，用 ``message`` 补上，
  保证「失败必有原因」，模型不必再从 ``message`` 里猜；
- **不删任何既有字段**，老调用方读 ``success`` / ``ok`` / ``error`` 全部照旧。

被安全策略拦截的结果不算「失败」：``blocked=True`` 时 ``ok=False``，但保留 ``message``
原文、不补 ``error`` —— 拦截是策略结论，不是执行错误，混进 error 会让模型去「重试」。
"""

from __future__ import annotations

from typing import Any

#: 失败时可以用作 ``error`` 文案的备选字段（按优先级）
_MESSAGE_KEYS = ("message", "detail", "reason")


def _has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_failed(result: Any) -> bool:
    """工具结果是否失败（三种标记归一）。被拦截也算失败，另见 :func:`is_blocked`。"""
    if not isinstance(result, dict) or not result:
        return False
    if result.get("ok") is False or result.get("success") is False:
        return True
    if result.get("blocked") is True:
        return True
    return bool(result.get("error"))


def normalize_tool_result(result: Any) -> Any:
    """给工具结果补 ``ok``（失败时再补 ``error``），返回新的 dict，不改原对象。

    非 dict 结果（字符串 / 列表，如搜索摘要）原样返回：它们没有成功语义可言。
    """
    if not isinstance(result, dict) or not result:
        return result
    normalized = dict(result)
    failed = is_failed(normalized)
    normalized["ok"] = not failed
    if failed and not _has_text(normalized.get("error")) and normalized.get("blocked") is not True:
        for key in _MESSAGE_KEYS:
            text = normalized.get(key)
            if _has_text(text):
                normalized["error"] = str(text).strip()
                break
    return normalized


__all__ = ["is_failed", "normalize_tool_result"]
