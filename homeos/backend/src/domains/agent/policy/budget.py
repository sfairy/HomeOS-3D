"""智能管家用量预算：按「用户 + 自然日」累计 token 与成本。

为什么需要
----------
语音 / 悬浮层 / MCP 都是「一句话就可能触发多轮 tool-calling」的入口，一次多轮对话
最坏会跑满 ``MAX_ROUNDS`` 轮。没有日预算时，一个反复触发的客户端（或一句被误识别的
唤醒词）就能把当天额度烧光，而运维在界面上看不到任何迹象。

语义
----
- 进程内内存计数，按自然日滚动；进程重启后归零（与命令缓存 / 会话记忆同口径）。
- token 与成本**任一**超限即判定为「预算用尽」；成本上限 0 表示不启用。
- 只拦 LLM 兜底链路：缓存命中 / 快路径仍然可用，避免「额度用完连灯都关不了」。
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Any

logger = logging.getLogger("homeos.agent.budget")

#: 默认每日 token 上限（每用户）。取值宁可宽松：目的是兜住失控循环，不是限制正常使用。
DEFAULT_DAILY_TOKEN_BUDGET = 1_000_000
#: 默认每日成本上限（人民币）。0 = 不启用成本上限。
DEFAULT_DAILY_COST_BUDGET_CNY = 0.0
#: 同时跟踪的用户上限：超出后淘汰最久未活动的记录，避免无界增长。
MAX_TRACKED_OWNERS = 512


@dataclass(frozen=True)
class AgentBudgetConfig:
    """日预算配置（0 表示该维度不限制）。"""

    daily_token_budget: int = DEFAULT_DAILY_TOKEN_BUDGET
    daily_cost_budget_cny: float = DEFAULT_DAILY_COST_BUDGET_CNY
    #: 配置来源，便于在 ping / 设置页说明「为什么会被拦」
    source: str = "default"

    @property
    def enabled(self) -> bool:
        return self.daily_token_budget > 0 or self.daily_cost_budget_cny > 0


@dataclass
class DailyUsage:
    """单个用户当天的累计用量。"""

    day: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_cny: float = 0.0
    #: 完成一轮 LLM 兜底对话的次数（不含快路径 / 缓存）
    llm_runs: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass(frozen=True)
class BudgetDecision:
    """预算检查结果。"""

    allowed: bool
    reason: str = ""
    #: 当天已用 / 上限，供回复与前端说明
    used_tokens: int = 0
    used_cost_cny: float = 0.0
    token_budget: int = 0
    cost_budget_cny: float = 0.0


def _read_number(env: Mapping[str, str], name: str) -> float | None:
    """读取非负数字环境变量；非法 / 负数 / 空串返回 None（按未配置处理）。"""
    raw = str(env.get(name, "") or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError:
        logger.warning("环境变量 %s 不是数字，已忽略: %s", name, raw)
        return None
    if value < 0:
        logger.warning("环境变量 %s 为负数，按未配置处理: %s", name, raw)
        return None
    return value


def resolve_budget_config(env: Mapping[str, str] | None = None) -> AgentBudgetConfig:
    """解析预算配置：环境变量优先，其次内置默认值。"""
    source = env if env is not None else os.environ
    token_raw = _read_number(source, "AGENT_DAILY_TOKEN_BUDGET")
    cost_raw = _read_number(source, "AGENT_DAILY_COST_BUDGET_CNY")
    if token_raw is None and cost_raw is None:
        return AgentBudgetConfig()
    token_budget = int(token_raw) if token_raw is not None else DEFAULT_DAILY_TOKEN_BUDGET
    cost_budget = float(cost_raw) if cost_raw is not None else DEFAULT_DAILY_COST_BUDGET_CNY
    return AgentBudgetConfig(
        daily_token_budget=max(0, token_budget),
        daily_cost_budget_cny=max(0.0, cost_budget),
        source="env",
    )


def _today() -> str:
    """自然日 key（服务端本地时区，与 .env 的 TZ 一致）。"""
    return date.today().isoformat()


class AgentBudgetService:
    """按用户累计当日用量并在超限时拒绝 LLM 兜底。"""

    def __init__(self, env: Mapping[str, str] | None = None) -> None:
        self._env = env
        #: owner → 当天用量（dict 迭代顺序即插入顺序，用于 LRU 淘汰）
        self._usage: dict[str, DailyUsage] = {}
        #: 当前生效配置（进程启动时解析一次；如需热更新可再调用 configure）
        self._config = resolve_budget_config(env)

    # 配置
    @property
    def config(self) -> AgentBudgetConfig:
        return self._config

    def configure(self, config: AgentBudgetConfig) -> None:
        """替换预算配置（测试 / 运维热更新用）。"""
        self._config = config

    @property
    def env(self) -> Mapping[str, str]:
        return self._env if self._env is not None else os.environ

    # 读写
    def _usage_of(self, owner: str) -> DailyUsage:
        """取（必要时新建 / 跨日重置）某用户的当天用量。"""
        key = str(owner or "").strip() or "anon"
        today = _today()
        usage = self._usage.get(key)
        if usage is None or usage.day != today:
            if usage is None and len(self._usage) >= MAX_TRACKED_OWNERS:
                oldest = next(iter(self._usage), None)
                if oldest is not None:
                    self._usage.pop(oldest, None)
            usage = DailyUsage(day=today)
            self._usage.pop(key, None)
            self._usage[key] = usage
        else:
            # 刷新 LRU 顺序：活跃用户不会被新用户挤掉
            self._usage.pop(key, None)
            self._usage[key] = usage
        return usage

    def check(self, owner: str) -> BudgetDecision:
        """检查是否还允许进入 LLM 兜底链路。"""
        cfg = self._config
        usage = self._usage_of(owner)
        if not cfg.enabled:
            return BudgetDecision(allowed=True)
        if cfg.daily_token_budget > 0 and usage.total_tokens >= cfg.daily_token_budget:
            return BudgetDecision(
                allowed=False,
                reason="token",
                used_tokens=usage.total_tokens,
                used_cost_cny=usage.cost_cny,
                token_budget=cfg.daily_token_budget,
                cost_budget_cny=cfg.daily_cost_budget_cny,
            )
        if (
            cfg.daily_cost_budget_cny > 0
            and usage.cost_cny >= cfg.daily_cost_budget_cny
        ):
            return BudgetDecision(
                allowed=False,
                reason="cost",
                used_tokens=usage.total_tokens,
                used_cost_cny=usage.cost_cny,
                token_budget=cfg.daily_token_budget,
                cost_budget_cny=cfg.daily_cost_budget_cny,
            )
        return BudgetDecision(
            allowed=True,
            used_tokens=usage.total_tokens,
            used_cost_cny=usage.cost_cny,
            token_budget=cfg.daily_token_budget,
            cost_budget_cny=cfg.daily_cost_budget_cny,
        )

    def record(
        self,
        owner: str,
        *,
        prompt_tokens: int,
        completion_tokens: int,
        cost_cny: float,
    ) -> None:
        """累计一次 LLM 兜底对话的用量（只统计成功的上游调用）。"""
        usage = self._usage_of(owner)
        usage.prompt_tokens += max(0, int(prompt_tokens))
        usage.completion_tokens += max(0, int(completion_tokens))
        usage.cost_cny += max(0.0, float(cost_cny))
        usage.llm_runs += 1

    def snapshot(self, owner: str) -> dict[str, Any]:
        """当天用量快照（供 ping / 设置页展示）。"""
        usage = self._usage_of(owner)
        return {
            "day": usage.day,
            "promptTokens": usage.prompt_tokens,
            "completionTokens": usage.completion_tokens,
            "totalTokens": usage.total_tokens,
            "costCNY": round(usage.cost_cny, 6),
            "llmRuns": usage.llm_runs,
            "dailyTokenBudget": self._config.daily_token_budget,
            "dailyCostBudgetCNY": self._config.daily_cost_budget_cny,
            "budgetSource": self._config.source,
        }

    def reset(self, owner: str | None = None) -> None:
        """清空某用户（或全部）的当天用量（运维 / 测试用）。"""
        if owner is None:
            self._usage.clear()
            return
        self._usage.pop(str(owner or "").strip() or "anon", None)


__all__ = [
    "DEFAULT_DAILY_COST_BUDGET_CNY",
    "DEFAULT_DAILY_TOKEN_BUDGET",
    "MAX_TRACKED_OWNERS",
    "AgentBudgetConfig",
    "AgentBudgetService",
    "BudgetDecision",
    "DailyUsage",
    "resolve_budget_config",
]
