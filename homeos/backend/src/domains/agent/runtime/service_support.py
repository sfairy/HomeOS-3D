"""智能管家编排服务的纯函数与数据结构。

`service.py` 已经承载了完整的对话状态机，再往里加常量 / 纯函数会让它继续膨胀。
这里只放**不依赖 AgentService 实例**的东西：

- 预算 / 超时解析与上下文裁剪；
- 对话请求 / 响应 / 内部运行上下文等数据结构；
- 工具调用分派与结果判定的小工具。

`service.py` 通过 ``from .service_support import ...`` 复用，并保持原有符号对外可见。
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, TypeGuard

from .agent_actor import AgentActor
from ..policy.pricing import LlmPricing
from ..policy.pricing import estimate_cost_cny as _estimate_cost_with_pricing
from ..providers.llm_provider_interface import LlmMessage, LlmToolCall
from ....platform.core.entity.entity_domain import get_entity_domain
from ....platform.security.entity_access import is_entity_allowed

logger = logging.getLogger("homeos.agent.service")

#: 单条工具结果回填 LLM 上下文的最大字符数（防止大实体状态 / 日志撑爆上下文）
MAX_TOOL_RESULT_CHARS = 4000
#: 工具轨迹 / 进度回调里展示的结果预览长度（前端 chip 与日志都按这个粒度看）。
TOOL_RESULT_PREVIEW_CHARS = 200
#: 单条历史消息进入上下文的字符上限
MAX_HISTORY_MESSAGE_CHARS = 2000
#: 历史上下文（不含 system prompt 与工具 schema）的字符预算。
MAX_HISTORY_PROMPT_CHARS = 8000
#: 历史消息条数硬上限（兜底，避免极短消息堆满上下文）
MAX_HISTORY_MESSAGES = 24


def _resolve_tool_timeout() -> float:
    """单次工具执行超时（秒）：环境变量可调，默认 15s。

    HA 卡死 / 网络半开时，单次服务调用可能挂住几十秒；不设上限会把整轮对话拖到
    客户端先超时，用户只看到「加载中」而拿不到任何收尾文案。
    """
    raw = os.environ.get("AGENT_TOOL_TIMEOUT_SECONDS", "").strip()
    if raw:
        try:
            value = float(raw)
        except ValueError:
            logger.warning("环境变量 AGENT_TOOL_TIMEOUT_SECONDS 不是数字，改用默认值: %s", raw)
        else:
            if 0.5 <= value <= 120:
                return value
            logger.warning("AGENT_TOOL_TIMEOUT_SECONDS 超出 0.5~120 范围，改用默认值: %s", raw)
    return 15.0


#: 工具执行超时（秒）
TOOL_TIMEOUT_SECONDS = _resolve_tool_timeout()


def _resolve_turn_timeout() -> float:
    """整轮对话总超时（秒）：环境变量可调，默认 90s。

    单次 LLM 读超时 60s × 最多 8 轮 + 每轮工具超时 15s，理论最坏可达十分钟；语音客户端
    与网关会先断开，用户只看到「加载中」。这里给整轮一个 deadline，每轮 / 每次工具都
    只能用剩余时间，到点返回可朗读的收尾文案。
    """
    raw = os.environ.get("AGENT_TURN_TIMEOUT_SECONDS", "").strip()
    if raw:
        try:
            value = float(raw)
        except ValueError:
            logger.warning("环境变量 AGENT_TURN_TIMEOUT_SECONDS 不是数字，改用默认值: %s", raw)
        else:
            if 10 <= value <= 600:
                return value
            logger.warning("AGENT_TURN_TIMEOUT_SECONDS 超出 10~600 范围，改用默认值: %s", raw)
    return 90.0


#: 整轮对话总超时（秒）
TURN_TIMEOUT_SECONDS = _resolve_turn_timeout()


def _js_stringify(value: Any) -> str:
    """对齐 JS ``JSON.stringify``（紧凑分隔符、不转义中文）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except (TypeError, ValueError) as exc:
        logger.debug("工具参数序列化失败: %r", exc)
        return ""


def _is_number(value: Any) -> TypeGuard[int | float]:
    """对齐 JS ``typeof value === 'number'``（布尔不算数字）。"""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _message_cost(message: LlmMessage) -> int:
    """估算单条消息进入 prompt 的字符数（含工具调用参数）。"""
    total = len(message.content or "")
    for call in message.tool_calls or []:
        total += len(call.name) + len(_js_stringify(call.arguments))
    return total


def _trim_messages(messages: list[LlmMessage], budget: int) -> list[LlmMessage]:
    """按字符预算裁剪会话消息：保留 system 与最新消息，丢弃最旧的非 system 消息。

    工具回填结果会不断追加进 ``messages``，若不裁剪，一次多轮 tool-calling 就可能
    超限；等 ``MAX_SESSION_PROMPT_TOKENS`` 事后判定为时已晚（那一轮已经付费）。
    """
    total = sum(_message_cost(m) for m in messages)
    if total <= budget or len(messages) <= 2:
        return messages
    system = messages[0] if messages and messages[0].role == "system" else None
    body = messages[1:] if system is not None else list(messages)

    kept: list[LlmMessage] = []
    for message in reversed(body):
        cost = _message_cost(message)
        # kept 非空时才是「可以省略」，从而保证最新一条消息永远保留
        if kept and total - cost < budget:
            break
        total -= cost
        kept.append(message)
    kept.reverse()

    # 清理失去归属的 tool 回填消息：其 assistant(tool_calls) 已被裁掉时，
    # tool_call_id 无法在上游关联，会直接 400。
    dropped = body[: len(body) - len(kept)]
    dropped_call_ids = {call.id for message in dropped if message.tool_calls for call in message.tool_calls}
    while kept and kept[0].role == "tool" and kept[0].tool_call_id in dropped_call_ids:
        kept.pop(0)

    trimmed = ([system] if system is not None else []) + kept
    if len(trimmed) != len(messages):
        logger.info("会话上下文按长度裁剪: %s → %s 条消息", len(messages), len(trimmed))
    return trimmed


def _select_prior_history(history: list[dict[str, Any]]) -> list[dict[str, str]]:
    """按字符预算从新到旧选取历史（替代固定「最近 16 条」）。

    条数与实际上下文长度无关：16 条长指令同样会撑爆 prompt。这里改成先单条限长，
    再从最新往旧累计，累计到预算用尽即停，最多 ``MAX_HISTORY_MESSAGES`` 条。
    """
    picked: list[dict[str, str]] = []
    budget = MAX_HISTORY_PROMPT_CHARS
    for turn in reversed(history or []):
        role = turn.get("role")
        if role not in ("user", "assistant"):
            continue
        content = str(turn.get("content") or "").strip()
        if not content:
            continue
        content = content[:MAX_HISTORY_MESSAGE_CHARS]
        if len(content) > budget or len(picked) >= MAX_HISTORY_MESSAGES:
            break
        budget -= len(content)
        picked.append({"role": role, "content": content})
    picked.reverse()
    return picked


def _math_round(value: float) -> int:
    """对齐 JS ``Math.round``。"""
    return math.floor(value + 0.5)


def truncate_tool_result(raw: str) -> str:
    """截断过大的工具结果：保留 JSON 头尾结构，中段省略。"""
    if len(raw) <= MAX_TOOL_RESULT_CHARS:
        return raw
    head = raw[: int(MAX_TOOL_RESULT_CHARS * 0.6)]
    tail = raw[-int(MAX_TOOL_RESULT_CHARS * 0.35) :]
    return f"{head}…[截断 {len(raw) - MAX_TOOL_RESULT_CHARS} 字符]…{tail}"


def estimate_cost_cny(
    prompt_tokens: int,
    cached_tokens: int,
    completion_tokens: int,
    pricing: LlmPricing | None = None,
) -> float:
    """按传入单价（缺省 DeepSeek）估算本次对话成本（人民币），保留 6 位小数。"""
    return _estimate_cost_with_pricing(prompt_tokens, cached_tokens, completion_tokens, pricing)


@dataclass
class AgentChatOptions:
    """对话可选执行上下文。"""

    #: 执行身份；控制类工具必须提供，否则 ACL 拒绝
    actor: AgentActor | None = None
    #: 连续对话会话 ID：携带时按会话保存上下文，多轮指令共享历史
    session_id: str | None = None
    #: 调用入口（web / voice / wecom / channels / mcp），用于审计留痕
    entry: str = "web"
    #: 语音房间上下文：用户只说「开灯」时用于定位房间
    room: str | None = None
    #: 流式进度：token 增量与工具轨迹
    on_progress: Callable[[dict[str, Any]], None] | None = None


@dataclass
class AgentChatResponse:
    """对话接口返回结构。"""

    #: 回复文本；控制成功且无需朗读时可为空
    reply: str = ""
    #: 是否需要朗读 reply（查询类 true，控制成功 false）
    speak: bool = True
    #: 执行结果（answer / success / failed / blocked）
    outcome: str = "answer"
    #: 音效提示（success / error / confirm / null）；confirm 用于「需要用户确认」
    earcon: str | None = None
    #: 实际处理方（deepseek / mock / cache / fast-path / fast-query / system）
    provider: str = ""
    #: 实际使用的模型名（非 LLM 路径为空）
    model: str = ""
    #: LLM 对话轮数（非 LLM 路径为 0 或 1）
    rounds: int = 0
    #: 工具调用轨迹，含名称、参数与结果预览
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    #: 耗时统计（毫秒）
    timing: dict[str, int] = field(default_factory=dict)
    #: token 用量与成本估算
    usage: dict[str, Any] = field(default_factory=dict)
    #: 服务端合成的音频 URL（签名 + 10 分钟有效）；为空表示本次不提供音频
    tts_url: str | None = None
    #: 附件（目前只有摄像头快照）：``{"kind": "image", "url": ..., "entityId": ...}``
    attachments: list[dict[str, Any]] = field(default_factory=list)
    #: 结构化确认信息（批量控制 / 缓存待确认）；前端据此渲染确认 / 取消按钮
    confirmation: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """转换为 HTTP 响应的 camelCase 结构（对齐 Nest 序列化）。"""
        payload = {
            "reply": self.reply,
            "speak": self.speak,
            "outcome": self.outcome,
            "earcon": self.earcon,
            "provider": self.provider,
            "model": self.model,
            "rounds": self.rounds,
            "toolCalls": self.tool_calls,
            "timing": self.timing,
            "usage": self.usage,
        }
        # 只有真的签出音频时才带这个字段：老前端不看它，新前端见空即回落本机播报
        if self.tts_url:
            payload["ttsUrl"] = self.tts_url
        if self.attachments:
            payload["attachments"] = self.attachments
        if self.confirmation:
            payload["confirmation"] = self.confirmation
        return payload


def _empty_usage() -> dict[str, Any]:
    return {
        "promptTokens": 0,
        "completionTokens": 0,
        "cachedTokens": 0,
        "estimatedCostCNY": 0,
    }


def _now_ms() -> int:
    """当前毫秒时间戳（对齐 JS ``Date.now()``）。"""
    return int(time.time() * 1000)


@dataclass
class _ChatRunContext:
    """单轮对话内部的可变运行上下文。

    承载「跨阶段共享、且会被后续 helper 改写」的状态：纠正口令会改写 ``user_message``，
    快路径 / LLM 循环会累加耗时并追加工具轨迹。集中到一个小对象里传递，
    避免每个 helper 都拖 7 个以上参数。
    """

    user_message: str
    history: list[dict[str, str]]
    options: AgentChatOptions | None
    state: dict[str, bool]
    actor: AgentActor | None
    start_ms: int
    llm_ms: int = 0
    tool_ms: int = 0
    tool_trace: list[dict[str, Any]] = field(default_factory=list)
    #: 本轮工具产生的附件（摄像头快照等），随响应返回给前端
    attachments: list[dict[str, Any]] = field(default_factory=list)
    #: 整轮对话的 monotonic deadline；0 表示不限制（测试 / 精简装配）
    deadline_at: float = 0.0

    def remaining_seconds(self) -> float | None:
        """整轮剩余可用秒数；未设置 deadline 时返回 None（表示不限制）。"""
        if self.deadline_at <= 0:
            return None
        return max(0.0, self.deadline_at - time.monotonic())

    def turn_expired(self) -> bool:
        """整轮是否已超时（留 0.5s 给收尾文案与响应序列化）。"""
        remaining = self.remaining_seconds()
        return remaining is not None and remaining <= 0.5

    @property
    def session_id(self) -> str | None:
        """当前会话 key（无 options 时为 None）。"""
        return self.options.session_id if self.options else None


@dataclass
class _LlmLoopResult:
    """LLM tool-calling 循环的收敛结果（回复 / 结果 / token 用量）。"""

    reply: str = ""
    speak: bool = True
    outcome: str = "answer"
    #: 音效提示覆盖：为空时按 outcome 推导（success / error / 无）
    earcon: str | None = None
    rounds: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    #: 结构化确认信息（LLM 批量分支）；为空表示本轮无需确认
    confirmation: dict[str, Any] | None = None


@dataclass
class _ToolBatchOutcome:
    """一批 LLM 工具调用的执行标记（是否含控制类 / 是否全成功 / 是否被拦截）。"""

    has_control: bool = False
    all_ok: bool = True
    any_blocked: bool = False


def _build_control_fast_call(fast: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """把控制快路径的解析结果整理成 ``(tool_name, tool_args)``。"""
    if fast["kind"] == "tool":
        return str(fast["tool"]), dict(fast.get("args") or {})
    if fast["kind"] == "device":
        tool_args: dict[str, Any] = {
            "domain": get_entity_domain(fast["entityId"]),
            "service": fast["service"],
            "entity_id": fast["entityId"],
        }
        if fast.get("serviceData"):
            tool_args["service_data"] = fast["serviceData"]
        return "control_device", tool_args
    if fast["kind"] == "scene":
        # 白名单内的 HA 场景 / 脚本：FastPathService 已做闸门过滤，这里直接触发
        return "activate_scene", {"scene": fast["sceneName"], "entity_id": fast["entityId"]}
    return "control_room", {
        "room": fast["roomName"],
        "domain": fast["domain"],
        "service": fast["service"],
    }


def _is_applied_result(result_obj: dict[str, Any], *, by_success_flag: bool) -> bool:
    """判定工具结果是否「生效」：设备 / 场景看 success，房间 / 批量看 total==affected。"""
    if by_success_flag:
        return result_obj.get("success") is True
    total = result_obj.get("total")
    return _is_number(total) and total > 0 and result_obj.get("affected") == total


def _result_uses_success_flag(tool_name: str) -> bool:
    """该工具的结果是否以 ``success`` 标记生效（房间类工具看 total/affected）。"""
    return tool_name in (
        "control_device",
        "activate_scene",
        "activate_home_mode",
        "set_light_brightness",
        "set_cover_position",
        "media_control",
    )


def _summarize_query_result(result: Any) -> str:
    """把同批查询类工具的结果压成一句人可读的补充说明（失败则返回空串）。

    批量计划里允许出现查询调用，但确认后的回复只讲「已执行」会让用户以为查询没跑。
    这里只挑最常见的几个字段（状态 / 数量 / 错误），不把整份 JSON 拼进回复。
    """
    if not isinstance(result, dict):
        return ""
    error = result.get("error")
    if isinstance(error, str) and error:
        return error[:120]
    name = result.get("name") or result.get("entity_id") or result.get("area_id")
    state = result.get("state")
    if isinstance(name, str) and name and state is not None:
        return f"{name}：{state}"
    count = result.get("count")
    if _is_number(count):
        return f"{int(count)} 条"
    items = result.get("items")
    if isinstance(items, list):
        return f"{len(items)} 条"
    return ""


def _filter_effective_calls(tool_calls: list[LlmToolCall]) -> list[LlmToolCall]:
    """过滤掉缺关键参数的调用（control_room 缺 room / control_device 缺 entity_id）。"""
    effective: list[LlmToolCall] = []
    for call in tool_calls:
        if call.name == "control_room":
            if call.arguments.get("room"):
                effective.append(call)
            continue
        if call.name == "control_device":
            if call.arguments.get("entity_id"):
                effective.append(call)
            continue
        effective.append(call)
    return effective or tool_calls


def _needs_batch_confirmation(control_calls: list[LlmToolCall]) -> bool:
    """这批控制调用是否要先跟用户确认。

    判定只看控制类调用；调用方暂存的却是**全部**调用 —— LLM 常把「关灯 + 顺便看看
    湿度」放进同一批，只暂存控制项会让查询结果凭空消失，按整批判定又会让混合批
    完全跳过确认。两条保护缺一不可。
    """
    return bool(control_calls) and (
        len(control_calls) >= 2 or any(call.name == "control_room" for call in control_calls)
    )


def _intersect_restrictions(
    base: list[str] | None,
    extra: list[str] | None,
) -> list[str] | None:
    """求「用户 ACL」与「Agent 专属白名单」的交集（均以允许列表表示）。

    - 任一为空 = 该侧不限制；
    - 结果是仍能表达交集的最小允许列表，无法表达的项直接丢弃（宁严勿松）。
    """
    if not extra:
        return base
    if not base:
        return list(extra)
    merged: list[str] = []
    for item in extra:
        for entry in _narrow_item(item, base):
            if entry and entry not in merged:
                merged.append(entry)
    return merged or ["__none__"]


def _narrow_item(item: str, base: list[str]) -> list[str]:
    """把 Agent 白名单里的一项收缩到用户 ACL 的能力范围内。"""
    if "." in item and not item.endswith("."):
        # 精确实体：用户侧允许才保留
        return [item] if is_entity_allowed(item, base) else []
    if "." not in item:
        return _narrow_domain(item, base)
    # 前缀（如 ``light.living_.``）：用户侧同前缀或更宽 domain 才保留
    domain = item.rstrip(".")
    if any(entry in (item, domain, f"{domain}.") or item.startswith(entry) for entry in base):
        return [item]
    return []


def _narrow_domain(domain: str, base: list[str]) -> list[str]:
    """整个 domain 的交集：用户侧更窄时取更窄的一侧。"""
    narrower = [
        entry for entry in base if entry == domain or entry.rstrip(".") == domain or entry.startswith(f"{domain}.")
    ]
    if narrower:
        return narrower
    # 用户侧只有该 domain 下的精确实体 → 交集为这些精确实体
    return [entry for entry in base if "." in entry and not entry.endswith(".") and get_entity_domain(entry) == domain]


def _emit_tool_progress(
    on_progress: Callable[[dict[str, Any]], None] | None,
    call: LlmToolCall,
    serialized: str,
) -> None:
    """向进度回调上报一次工具调用（无回调时什么都不做）。"""
    if not on_progress:
        return
    on_progress(
        {
            "type": "tool",
            "name": call.name,
            "arguments": call.arguments,
            "resultPreview": serialized[:TOOL_RESULT_PREVIEW_CHARS],
        }
    )


@dataclass(slots=True)
class _ToolOutcome:
    """一次工具调用的统一记账结果（轨迹里的一行 + 三个判定）。"""

    #: 序列化后的结果（LLM 链路会先按 ``MAX_TOOL_RESULT_CHARS`` 截断）
    serialized: str
    #: 动作是否真的生效（设备 / 场景看 success，房间 / 批量看 total==affected）
    applied: bool
    #: 控制类工具的「成功」判定（含 blocked 之外的失败语义）
    control_ok: bool
    #: 是否被权限 / 确认拦截
    blocked: bool
