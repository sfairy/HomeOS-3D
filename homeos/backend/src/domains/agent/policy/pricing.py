"""LLM 计费口径：按 provider 解析单价并估算单轮成本。

背景
----
早期实现把 DeepSeek 的单价写成模块常量，并且 ``DeepseekLlmProvider.name`` 固定返回
``deepseek``。于是即使用户在设置里选了豆包 / 通义（同样是 OpenAI 兼容端点），
界面仍显示 ``deepseek``、成本也按 DeepSeek 计价 —— 数据看起来正常，实际是错的。

这里把「provider → 单价」显式化：
- 已知 provider 用其公开单价；
- 未知 provider 回退到 DeepSeek 单价，但 ``source`` 标记为
  ``fallback-deepseek``，让设置页 / 日志能看出这是估算而不是精确值；
- 三个 ``AGENT_PRICE_*`` 环境变量可整体覆盖（按「元 / 百万 token」）。
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("homeos.agent.pricing")


@dataclass(frozen=True)
class LlmPricing:
    """每百万 token 的人民币单价。"""

    #: 输入（未命中 prompt 缓存）
    input_miss_cny: float
    #: 输入（命中 prompt 缓存）
    input_hit_cny: float
    #: 输出
    output_cny: float
    #: 口径来源：provider-default / fallback-deepseek / env
    source: str = "provider-default"

    def to_dict(self) -> dict[str, Any]:
        return {
            "inputMissCNY": self.input_miss_cny,
            "inputHitCNY": self.input_hit_cny,
            "outputCNY": self.output_cny,
            "source": self.source,
        }


#: DeepSeek 公开单价（元 / 百万 token）
DEEPSEEK_PRICING = LlmPricing(
    input_miss_cny=2.0,
    input_hit_cny=0.5,
    output_cny=3.0,
    source="provider-default",
)

#: provider → 单价。未列出的 provider 回退 DeepSeek 估算。
PROVIDER_PRICING: dict[str, LlmPricing] = {
    "deepseek": DEEPSEEK_PRICING,
}

#: 环境变量名（单位：元 / 百万 token）
ENV_PRICE_INPUT_MISS = "AGENT_PRICE_INPUT_MISS_CNY"
ENV_PRICE_INPUT_HIT = "AGENT_PRICE_INPUT_HIT_CNY"
ENV_PRICE_OUTPUT = "AGENT_PRICE_OUTPUT_CNY"


def _env_float(env: Mapping[str, str], name: str) -> float | None:
    raw = str(env.get(name, "") or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError:
        logger.warning("环境变量 %s 不是数字，已忽略: %s", name, raw)
        return None
    if value < 0:
        logger.warning("环境变量 %s 为负数，已忽略: %s", name, raw)
        return None
    return value


def resolve_pricing(
    provider: str | None,
    env: Mapping[str, str] | None = None,
) -> LlmPricing:
    """解析 provider 的计费单价（环境变量优先）。"""
    source = env if env is not None else os.environ
    base = PROVIDER_PRICING.get(str(provider or "").strip().lower())
    if base is None:
        base = LlmPricing(
            input_miss_cny=DEEPSEEK_PRICING.input_miss_cny,
            input_hit_cny=DEEPSEEK_PRICING.input_hit_cny,
            output_cny=DEEPSEEK_PRICING.output_cny,
            source="fallback-deepseek",
        )
    miss = _env_float(source, ENV_PRICE_INPUT_MISS)
    hit = _env_float(source, ENV_PRICE_INPUT_HIT)
    out = _env_float(source, ENV_PRICE_OUTPUT)
    if miss is None and hit is None and out is None:
        return base
    return LlmPricing(
        input_miss_cny=base.input_miss_cny if miss is None else miss,
        input_hit_cny=base.input_hit_cny if hit is None else hit,
        output_cny=base.output_cny if out is None else out,
        source="env",
    )


def estimate_cost_cny(
    prompt_tokens: int,
    cached_tokens: int,
    completion_tokens: int,
    pricing: LlmPricing | None = None,
) -> float:
    """按「未命中 / 命中 / 输出」三段计价，保留 6 位小数。"""
    rate = pricing or DEEPSEEK_PRICING
    miss_tokens = max(0, int(prompt_tokens) - int(cached_tokens))
    cached = max(0, int(cached_tokens))
    out = max(0, int(completion_tokens))
    cost = (
        miss_tokens * rate.input_miss_cny
        + cached * rate.input_hit_cny
        + out * rate.output_cny
    ) / 1_000_000
    # 对齐 JS Math.round(x * 1e6) / 1e6
    import math

    return math.floor(cost * 1_000_000 + 0.5) / 1_000_000


__all__ = [
    "DEEPSEEK_PRICING",
    "ENV_PRICE_INPUT_HIT",
    "ENV_PRICE_INPUT_MISS",
    "ENV_PRICE_OUTPUT",
    "PROVIDER_PRICING",
    "LlmPricing",
    "estimate_cost_cny",
    "resolve_pricing",
]
