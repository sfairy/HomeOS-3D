"""LLM 计费口径：按 provider 解析单价并估算单轮成本。

背景
----
早期实现把 DeepSeek 的单价写成模块常量，并且 ``DeepseekLlmProvider.name`` 固定返回
``deepseek``。于是即使用户在设置里选了豆包 / 通义（同样是 OpenAI 兼容端点），
界面仍显示 ``deepseek``、成本也按 DeepSeek 计价 —— 数据看起来正常，实际是错的。

这里把「provider → 单价」显式化：
- 已知 provider 用其公开单价（元 / 百万 token）；
- 设置页的 provider 别名（``kimi`` / ``tongyi`` / ``ark`` …）归一到同一个口径；
- 未知 provider 回退到 DeepSeek 单价，但 ``source`` 标记为 ``fallback-deepseek``，
  让设置页 / 日志能看出这是估算而不是精确值；
- 覆盖优先级：``AGENT_PRICE_<PROVIDER>_*`` > 全局 ``AGENT_PRICE_*`` > 表内默认价。

单价会随厂商调价漂移，所以**永远可以从环境变量覆盖**：运维不需要改代码，
也不必等一次发版才能把成本显示修对。
"""

from __future__ import annotations

import logging
import os
import re
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
#:
#: 取值口径：该 provider 面向中国区的**主力低价文本模型**公开价（元 / 百万 token）,
#: 用于给出量级正确的成本，不做合同价对齐。厂商调价后用环境变量覆盖即可。
PROVIDER_PRICING: dict[str, LlmPricing] = {
    "deepseek": DEEPSEEK_PRICING,
    # 豆包 Doubao 1.5 Pro 32k（火山方舟）
    "doubao": LlmPricing(0.8, 0.16, 2.0),
    # 通义千问 qwen-plus（DashScope 兼容模式）
    "qwen": LlmPricing(0.8, 0.8, 2.0),
    # Moonshot / Kimi moonshot-v1-8k
    "moonshot": LlmPricing(12.0, 12.0, 12.0),
    # MiniMax abab6.5s
    "minimax": LlmPricing(1.0, 1.0, 1.0),
    # 智谱 GLM-4-Air
    "glm": LlmPricing(1.0, 1.0, 1.0),
    # OpenAI gpt-4o-mini（按汇率折算人民币，仅用于量级参考）
    "openai": LlmPricing(2.5, 1.25, 10.0),
}

#: provider 别名 → 表内主键。设置页 / 用户自定义文案里会出现各种写法。
PROVIDER_ALIASES: dict[str, str] = {
    "deepseek-ai": "deepseek",
    "deepseek-chat": "deepseek",
    "volcengine": "doubao",
    "volcano": "doubao",
    "ark": "doubao",
    "bytedance": "doubao",
    "doubao-pro": "doubao",
    "tongyi": "qwen",
    "qianwen": "qwen",
    "dashscope": "qwen",
    "alibaba": "qwen",
    "aliyun": "qwen",
    "qwen-plus": "qwen",
    "kimi": "moonshot",
    "moonshot-ai": "moonshot",
    "minimax-ai": "minimax",
    "abab": "minimax",
    "zhipu": "glm",
    "chatglm": "glm",
    "zhipuai": "glm",
    "azure-openai": "openai",
    "openai-compatible": "openai",
}

#: 环境变量名（单位：元 / 百万 token）
ENV_PRICE_INPUT_MISS = "AGENT_PRICE_INPUT_MISS_CNY"
ENV_PRICE_INPUT_HIT = "AGENT_PRICE_INPUT_HIT_CNY"
ENV_PRICE_OUTPUT = "AGENT_PRICE_OUTPUT_CNY"
#: per-provider 环境变量前缀：``AGENT_PRICE_<PROVIDER>_INPUT_MISS_CNY`` 等
ENV_PRICE_PROVIDER_PREFIX = "AGENT_PRICE_"
#: 回退口径标记（设置页据此提示「这是估算」）
SOURCE_FALLBACK = "fallback-deepseek"


def normalize_provider(provider: str | None) -> str:
    """provider 归一：小写、去掉非字母数字、再查别名表。"""
    raw = re.sub(r"[^a-z0-9]+", "-", str(provider or "").strip().lower()).strip("-")
    if not raw:
        return ""
    if raw in PROVIDER_PRICING:
        return raw
    alias = PROVIDER_ALIASES.get(raw)
    if alias:
        return alias
    # 形如 ``doubao-seed-1-6`` / ``qwen3-max`` / ``glm-4-air`` 的前缀匹配：取最长的已知前缀
    for known in sorted(PROVIDER_PRICING, key=len, reverse=True):
        if re.match(rf"^{re.escape(known)}(?![a-z])", raw):
            return known
    return raw


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


def _provider_env_name(provider: str, suffix: str) -> str:
    """``doubao`` + ``INPUT_MISS_CNY`` → ``AGENT_PRICE_DOUBAO_INPUT_MISS_CNY``。"""
    key = re.sub(r"[^A-Z0-9]+", "_", provider.upper()).strip("_")
    return f"{ENV_PRICE_PROVIDER_PREFIX}{key}_{suffix}"


def _default_pricing(provider: str) -> LlmPricing:
    base = PROVIDER_PRICING.get(provider)
    if base is not None:
        return base
    return LlmPricing(
        input_miss_cny=DEEPSEEK_PRICING.input_miss_cny,
        input_hit_cny=DEEPSEEK_PRICING.input_hit_cny,
        output_cny=DEEPSEEK_PRICING.output_cny,
        source=SOURCE_FALLBACK,
    )


def resolve_pricing(
    provider: str | None,
    env: Mapping[str, str] | None = None,
) -> LlmPricing:
    """解析 provider 的计费单价（per-provider 覆盖 > 全局覆盖 > 表内默认价）。"""
    source = env if env is not None else os.environ
    normalized = normalize_provider(provider)
    base = _default_pricing(normalized)
    miss = _env_float(source, _provider_env_name(normalized, "INPUT_MISS_CNY")) if normalized else None
    hit = _env_float(source, _provider_env_name(normalized, "INPUT_HIT_CNY")) if normalized else None
    out = _env_float(source, _provider_env_name(normalized, "OUTPUT_CNY")) if normalized else None
    if miss is None:
        miss = _env_float(source, ENV_PRICE_INPUT_MISS)
    if hit is None:
        hit = _env_float(source, ENV_PRICE_INPUT_HIT)
    if out is None:
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
    cost = (miss_tokens * rate.input_miss_cny + cached * rate.input_hit_cny + out * rate.output_cny) / 1_000_000
    # 对齐 JS Math.round(x * 1e6) / 1e6
    import math

    return math.floor(cost * 1_000_000 + 0.5) / 1_000_000


def supported_providers() -> list[dict[str, Any]]:
    """已知 provider 与单价（设置页 / 文档用于说明当前口径）。"""
    return [
        {"provider": name, **rate.to_dict()}
        for name, rate in sorted(PROVIDER_PRICING.items())
    ]


__all__ = [
    "DEEPSEEK_PRICING",
    "ENV_PRICE_INPUT_HIT",
    "ENV_PRICE_INPUT_MISS",
    "ENV_PRICE_OUTPUT",
    "ENV_PRICE_PROVIDER_PREFIX",
    "PROVIDER_ALIASES",
    "PROVIDER_PRICING",
    "SOURCE_FALLBACK",
    "LlmPricing",
    "estimate_cost_cny",
    "normalize_provider",
    "resolve_pricing",
    "supported_providers",
]
