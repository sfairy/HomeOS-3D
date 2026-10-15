"""智能管家核心编排服务。"""

from __future__ import annotations

import inspect
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, TypeGuard

from starlette.exceptions import HTTPException as StarletteHTTPException

from .agent_actor import AgentActor
from .command_cache import CommandCacheService
from .config_service import AgentConfigService
from .fast_path import FastPathService
from .lang_template_service import LangTemplateService
from .providers.llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolCall,
)
from .session_store import AgentSessionStoreService
from .short_term_memory import AgentShortTermMemoryService
from .tools.home_tools_service import HomeToolsService
from ...platform.core.entity_domain import get_entity_domain
from ...platform.core.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.agent.service")

#: 输入 token 单价：未命中缓存的（元 / 百万 token）
RATE_INPUT_MISS_CNY = 2.0
#: 输入 token 单价：命中缓存的（更便宜）
RATE_INPUT_HIT_CNY = 0.5
#: 输出 token 单价（元 / 百万 token）
RATE_OUTPUT_CNY = 3.0
#: 单条工具结果回填 LLM 上下文的最大字符数（防止大实体状态 / 日志撑爆上下文）
MAX_TOOL_RESULT_CHARS = 4000
#: 单条历史消息进入上下文的字符上限
MAX_HISTORY_MESSAGE_CHARS = 2000
#: 历史上下文（不含 system prompt 与工具 schema）的字符预算。
MAX_HISTORY_PROMPT_CHARS = 8000
#: 历史消息条数硬上限（兜底，避免极短消息堆满上下文）
MAX_HISTORY_MESSAGES = 24
#: 单轮对话累计 prompt token 硬上限：超出即中止工具循环，避免无限膨胀
MAX_SESSION_PROMPT_TOKENS = 30_000
#: 单轮对话内 messages 的字符预算（含 system / 历史 / 工具回填）。
#: 超出时优先丢弃最旧的非 system 消息，而不是等一轮跑完才发现超限。
MAX_SESSION_PROMPT_CHARS = 24_000
#: LLM tool-calling 最大轮数，避免无限循环
MAX_ROUNDS = 8


def _js_stringify(value: Any) -> str:
    """对齐 JS ``JSON.stringify``（紧凑分隔符、不转义中文）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
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
    dropped_call_ids = {
        call.id for message in dropped if message.tool_calls for call in message.tool_calls
    }
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
    import math

    return math.floor(value + 0.5)


def truncate_tool_result(raw: str) -> str:
    """截断过大的工具结果：保留 JSON 头尾结构，中段省略。"""
    if len(raw) <= MAX_TOOL_RESULT_CHARS:
        return raw
    head = raw[: int(MAX_TOOL_RESULT_CHARS * 0.6)]
    tail = raw[-int(MAX_TOOL_RESULT_CHARS * 0.35) :]
    return f"{head}…[截断 {len(raw) - MAX_TOOL_RESULT_CHARS} 字符]…{tail}"


def estimate_cost_cny(prompt_tokens: int, cached_tokens: int, completion_tokens: int) -> float:
    """按 DeepSeek 计费规则估算本次对话成本（人民币），保留 6 位小数。"""
    miss_tokens = max(0, prompt_tokens - cached_tokens)
    cost = (
        miss_tokens * RATE_INPUT_MISS_CNY
        + cached_tokens * RATE_INPUT_HIT_CNY
        + completion_tokens * RATE_OUTPUT_CNY
    ) / 1_000_000
    return _math_round(cost * 1_000_000) / 1_000_000


@dataclass
class AgentChatOptions:
    """对话可选执行上下文。"""

    #: 执行身份；控制类工具必须提供，否则 ACL 拒绝
    actor: AgentActor | None = None
    #: 连续对话会话 ID：携带时按会话保存上下文，多轮指令共享历史
    session_id: str | None = None
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
    #: 音效提示（success / error / null）
    earcon: str | None = None
    #: 实际处理方（deepseek / mock / cache / fast-path / fast-query / system）
    provider: str = ""
    #: LLM 对话轮数（非 LLM 路径为 0 或 1）
    rounds: int = 0
    #: 工具调用轨迹，含名称、参数与结果预览
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    #: 耗时统计（毫秒）
    timing: dict[str, int] = field(default_factory=dict)
    #: token 用量与成本估算
    usage: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """转换为 HTTP 响应的 camelCase 结构（对齐 Nest 序列化）。"""
        return {
            "reply": self.reply,
            "speak": self.speak,
            "outcome": self.outcome,
            "earcon": self.earcon,
            "provider": self.provider,
            "rounds": self.rounds,
            "toolCalls": self.tool_calls,
            "timing": self.timing,
            "usage": self.usage,
        }


def _empty_usage() -> dict[str, Any]:
    return {
        "promptTokens": 0,
        "completionTokens": 0,
        "cachedTokens": 0,
        "estimatedCostCNY": 0,
    }


def _now_ms() -> int:
    """当前毫秒时间戳（对齐 JS ``Date.now()``）。"""
    import time

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
    rounds: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0


@dataclass
class _ToolBatchOutcome:
    """一批 LLM 工具调用的执行标记（是否含控制类 / 是否全成功 / 是否被拦截）。"""

    has_control: bool = False
    all_ok: bool = True
    any_blocked: bool = False


def _build_control_fast_call(fast: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """把控制快路径的解析结果整理成 ``(tool_name, tool_args)``。"""
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
            "resultPreview": serialized[:200],
        }
    )


class AgentService:
    """智能管家服务：注入由 ResolvingLlmProvider 提供的 LlmProvider。"""

    def __init__(
        self,
        llm: LlmProvider,
        tools: HomeToolsService,
        fast_path: FastPathService,
        cmd_cache: CommandCacheService,
        lang_templates: LangTemplateService,
        agent_config: AgentConfigService,
        sessions: AgentSessionStoreService,
        short_term: AgentShortTermMemoryService,
    ) -> None:
        self._llm = llm
        self._tools = tools
        self._fast_path = fast_path
        self._cmd_cache = cmd_cache
        self._lang_templates = lang_templates
        self._agent_config = agent_config
        self._sessions = sessions
        self._short_term = short_term

    @property
    def _L(self) -> Any:
        """当前语言模板（口令、回复模板、系统提示）。"""
        return self._lang_templates.current

    # 提供商信息
    def get_provider_info(self) -> dict[str, Any]:
        """返回当前 LLM 提供商信息（名称 + 就绪状态），不触发刷新。"""
        return {"provider": self._llm.name, "ready": self._llm.is_ready()}

    async def ping_provider(self) -> dict[str, Any]:
        """重新读取配置并刷新 LLM，供 ping / 保存后检测使用。"""
        self._agent_config.invalidate_cache()
        refresh = getattr(self._llm, "refresh", None)
        if callable(refresh):
            result = refresh()
            if inspect.isawaitable(result):
                await result
        return self.get_provider_info()

    # 会话 key
    def _scope_session_id(self, options: AgentChatOptions | None) -> str | None:
        """把客户端自带的 session_id 收敛为「按登录身份隔离」的服务端会话 key。

        session_id 完全由调用方提供且不与用户绑定（HTTP 侧是前端生成的 UUID，
        MCP 侧直接是 ``mcp:<ip>``）。若不隔离，同一 NAT 出口下的两个账号或碰巧复用同一
        session_id 的两个账号会共享同一个上下文窗口，造成上下文串味。
        没有身份信息时退回 ``anon``：与隔离前的行为等价。
        """
        raw = (options.session_id or "").strip() if options else ""
        if not raw:
            return None
        actor = (options.actor if options else None) or None
        owner = (actor.user_id if actor else None) or (actor.username if actor else None) or "anon"
        return f"{owner}:{raw}"

    # 主入口
    async def chat(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
        options: AgentChatOptions | None = None,
    ) -> AgentChatResponse:
        """智能管家对话主入口（支持连续对话）。"""
        history = history or []
        # 会话 key 先按登录身份隔离，再进入会话存储 / 短时记忆；
        # 后续所有读写（含 _chat_internal 里的 clear）都必须用这个作用域化后的 key
        session_id = self._scope_session_id(options)
        scoped_options = (
            AgentChatOptions(
                actor=options.actor,
                session_id=session_id,
                on_progress=options.on_progress,
            )
            if options is not None
            else None
        )
        # 连续对话：服务端会话优先；过期 / 空会话时回退前端 history
        effective_history = history
        if session_id:
            stored = self._sessions.get(session_id)
            if stored:
                effective_history = [{"role": t.role, "content": t.content} for t in stored]
        # 短时记忆（45s / 2 轮）追加在末尾：保证上一轮管家的反问句紧邻当前输入
        effective_history = self._merge_short_term_history(effective_history, session_id)
        state = {"short_term_reset": False}
        result = await self._chat_internal(
            user_message, effective_history, scoped_options, state
        )
        # 记录本轮上下文（清除记忆口令除外），供后续指令补全实体 / 意图
        if session_id and user_message.strip() != self._L.clear_memory:
            session_summary = self._build_session_summary(result)
            self._sessions.push_turn(session_id, user_message, session_summary)
            # 短时记忆同样记录一轮；但确定性路径已重置上下文时跳过，
            # 避免把上一意图重新写回窗口
            if not state["short_term_reset"]:
                self._short_term.append_turn(
                    session_id,
                    user_message,
                    session_summary or self._build_short_term_summary(result),
                )
        return result

    def _merge_short_term_history(
        self,
        history: list[dict[str, str]],
        session_id: str | None,
    ) -> list[dict[str, str]]:
        """合并「长会话历史」与「短时记忆」，避免最近两轮重复出现。"""
        if not session_id:
            return history
        recent = [
            {"role": t.role, "content": t.content} for t in self._short_term.get_history(session_id)
        ]
        if not recent:
            return history
        # 短时记忆已是历史末尾连续后缀 → 无需重复追加
        offset = len(history) - len(recent)
        already_suffix = offset >= 0 and all(
            offset + i < len(history)
            and history[offset + i].get("role") == turn["role"]
            and history[offset + i].get("content") == turn["content"]
            for i, turn in enumerate(recent)
        )
        if already_suffix:
            return history
        return [*history, *recent]

    @staticmethod
    def _build_short_term_summary(res: AgentChatResponse) -> str:
        """构造写入短时记忆的 assistant **兜底**文本。"""
        if res.reply and res.reply.strip():
            return res.reply.strip()[:500]
        if res.outcome == "success":
            return "好的，已为您执行完成。"
        return ""

    @staticmethod
    def _build_session_summary(res: AgentChatResponse) -> str | None:
        """将一轮对话结果压缩为会话历史中的 assistant 摘要。"""
        if res.reply and res.reply.strip():
            return res.reply.strip()[:500]
        if res.tool_calls:
            summary = "；".join(
                f"{c['name']}({_js_stringify(c.get('arguments') or {})[:200]})" for c in res.tool_calls
            )
            return f"（已执行）{summary}" if summary else None
        return None

    # 核心流程
    async def _chat_internal(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
        options: AgentChatOptions | None = None,
        state: dict[str, bool] | None = None,
    ) -> AgentChatResponse:
        """智能管家对话主逻辑（内部实现，不处理会话上下文）。

        本方法只做「阶段编排」：每个阶段抽成独立 helper，命中即返回，未命中则继续。
        跨阶段共享的可变状态放在 :class:`_ChatRunContext` 里传递。
        """
        ctx = _ChatRunContext(
            user_message=user_message,
            history=history or [],
            options=options,
            state=state if state is not None else {"short_term_reset": False},
            actor=options.actor if options else None,
            start_ms=_now_ms(),
        )
        # 1) 纠正 / 清除记忆口令：命中则直接返回系统回复，不走后续流程
        memory_reply = self._handle_memory_command(ctx)
        if memory_reply is not None:
            return memory_reply
        # 2) 命令缓存命中：已确认直接执行工具；待确认则提示用户确认，不直接执行
        cached_reply = await self._serve_cached_command(ctx)
        if cached_reply is not None:
            return cached_reply
        # 3) 查询快路径：温度 / 湿度询问直接读传感器回复
        query_reply = await self._serve_query_fast_path(ctx)
        if query_reply is not None:
            return query_reply
        # 4) 控制快路径：规则解析为 control_device / control_room / activate_scene 直接执行
        control_reply = await self._serve_control_fast_path(ctx)
        if control_reply is not None:
            return control_reply
        # 5) 兜底：构造 LLM 对话，进入 tool-calling 多轮循环
        loop_outcome = await self._run_llm_tool_loop(ctx)
        return self._finalize_llm_reply(ctx, loop_outcome)

    def _handle_memory_command(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """处理「纠正上一条指令 / 清除记忆」口令；返回 None 表示继续走后续流程。"""
        trimmed = ctx.user_message.strip()
        is_correction = bool(self._L.correction_commands.search(trimmed))
        is_clear = trimmed == self._L.clear_memory
        if not (is_correction or is_clear):
            return None
        if is_clear:
            self._cmd_cache.clear(ctx.actor.user_id if ctx.actor else None)
            if ctx.session_id:
                self._sessions.clear(ctx.session_id)
                # 短时记忆一并清空，避免遗留的反问语境在「忘掉一切」后继续生效
                self._short_term.clear(ctx.session_id)
            return self._empty_system_reply("已经把所有学到的指令忘掉了，像刚认识一样。")
        # 纠正：删除最近一条缓存，用其原话作为新指令继续走后续流程
        last = self._cmd_cache.correct_last(ctx.actor.user_id if ctx.actor else None)
        if last:
            ctx.user_message = last
            return None
        return self._empty_system_reply("没有需要纠正的指令哦。")

    async def _serve_cached_command(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """命令缓存命中分支：待确认先提示用户，已确认则直接执行工具（跳过 LLM）。"""
        cached = self._cmd_cache.get(ctx.user_message, ctx.actor.user_id if ctx.actor else None)
        if cached is None:
            return None
        # 待确认缓存（LLM 路径首次学习、尚未二次验证）
        if cached.confirmed is False:
            self._cmd_cache.confirm(ctx.user_message, ctx.actor.user_id if ctx.actor else None)
            total_ms = _now_ms() - ctx.start_ms
            logger.info("缓存待确认,提示用户确认: %s total=%sms", cached.tool_name, total_ms)
            return AgentChatResponse(
                reply=self._L.cache_confirm_prompt.replace("{tool}", cached.tool_name),
                speak=True,
                outcome="answer",
                earcon=None,
                provider="cache",
                rounds=0,
                tool_calls=[],
                timing={"llmMs": 0, "toolMs": 0, "totalMs": total_ms},
                usage=_empty_usage(),
            )
        # 已确认（confirmed === true）：直接执行工具，跳过 LLM
        s0 = _now_ms()
        tool_result = await self._tools.execute(cached.tool_name, cached.tool_args, ctx.actor)
        ctx.tool_ms = _now_ms() - s0
        ok = _is_applied_result(
            tool_result,
            by_success_flag=cached.tool_name in ("control_device", "activate_scene"),
        )
        if not ok:
            # 缓存执行失败：设备可能已变更，删除过期缓存后降级到快路径 / LLM
            logger.warning(
                '缓存失败(设备可能已变更),删除过期缓存,降级→快路径/LLM: "%s"', ctx.user_message
            )
            self._cmd_cache.delete(ctx.user_message, ctx.actor.user_id if ctx.actor else None)
            return None
        serialized = _js_stringify(tool_result)
        ctx.tool_trace.append(
            {
                "name": cached.tool_name,
                "arguments": cached.tool_args,
                "resultPreview": serialized[:200],
            }
        )
        total_ms = _now_ms() - ctx.start_ms
        logger.info(
            "缓存命中: %s total=%sms hitCount=%s",
            cached.tool_name,
            total_ms,
            cached.hit_count,
        )
        # 独立完整的指令已执行完毕，重置短时记忆，杜绝跨意图污染
        if ctx.session_id:
            self._short_term.clear(ctx.session_id)
            ctx.state["short_term_reset"] = True
        return AgentChatResponse(
            reply="",
            speak=False,
            outcome="success",
            earcon="success",
            provider="cache",
            rounds=0,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": 0, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage=_empty_usage(),
        )

    async def _serve_query_fast_path(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """查询快路径：温度 / 湿度询问直接读传感器回复；未命中返回 None。"""
        query_fast = self._match_query_fast_path(ctx.user_message)
        if not query_fast:
            return None
        s0 = _now_ms()
        snap = await self._tools.execute(
            "get_area_snapshot", {"area_id": query_fast["roomName"]}, ctx.actor
        )
        ctx.tool_ms = _now_ms() - s0
        sensors = (snap or {}).get("sensors") or {}
        if query_fast["type"] == "temperature" and _sensor_value(sensors.get("temperature")):
            return self._build_sensor_query_reply(ctx, query_fast, "temperature", sensors)
        if query_fast["type"] == "humidity" and _sensor_value(sensors.get("humidity")):
            return self._build_sensor_query_reply(ctx, query_fast, "humidity", sensors)
        return None

    def _build_sensor_query_reply(
        self,
        ctx: _ChatRunContext,
        query_fast: dict[str, str],
        sensor_kind: str,
        sensors: dict[str, Any],
    ) -> AgentChatResponse:
        """构造温度 / 湿度查询的固定回复（provider=fast-query）。"""
        template = (
            self._L.temp_reply_template
            if sensor_kind == "temperature"
            else self._L.humidity_reply_template
        )
        return AgentChatResponse(
            reply=template.replace("{room}", query_fast["roomName"]).replace(
                "{value}", _sensor_value(sensors.get(sensor_kind))
            ),
            speak=True,
            outcome="answer",
            earcon=None,
            provider="fast-query",
            rounds=0,
            tool_calls=[
                {
                    "name": "get_area_snapshot",
                    "arguments": {"area_id": query_fast["roomName"]},
                    "resultPreview": "",
                }
            ],
            timing={"llmMs": 0, "toolMs": ctx.tool_ms, "totalMs": _now_ms() - ctx.start_ms},
            usage=_empty_usage(),
        )

    async def _serve_control_fast_path(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """控制快路径：规则解析为 control_device / control_room / activate_scene 直接执行。"""
        fast = await self._fast_path.try_parse(ctx.user_message)
        if not fast:
            return None
        s0 = _now_ms()
        tool_name, tool_args = _build_control_fast_call(fast)
        tool_result = await self._tools.execute(tool_name, tool_args, ctx.actor)
        ctx.tool_ms = _now_ms() - s0
        serialized = _js_stringify(tool_result)
        ctx.tool_trace.append(
            {
                "name": tool_name,
                "arguments": tool_args,
                "resultPreview": serialized[:200],
            }
        )
        ok = _is_applied_result(tool_result, by_success_flag=fast["kind"] in ("device", "scene"))
        blocked = self._is_blocked(tool_result)
        total_ms = _now_ms() - ctx.start_ms
        logger.info("快路径: %s total=%sms ok=%s blocked=%s", tool_name, total_ms, ok, blocked)
        # 控制成功则回写缓存（快路径默认 confirmed）
        if ok:
            self._cmd_cache.try_auto_correct(
                ctx.user_message, tool_name, tool_args, ctx.actor.user_id if ctx.actor else None
            )
            self._cmd_cache.set(
                ctx.user_message, tool_name, tool_args, True, ctx.actor.user_id if ctx.actor else None
            )
            # 快路径是独立完整的指令执行，成功后重置短时记忆，杜绝跨意图污染
            if ctx.session_id:
                self._short_term.clear(ctx.session_id)
                ctx.state["short_term_reset"] = True
        return AgentChatResponse(
            reply="",
            speak=False,
            outcome="success" if ok else ("blocked" if blocked else "failed"),
            earcon="success" if ok else "error",
            provider="fast-path",
            rounds=1,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": 0, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage=_empty_usage(),
        )

    async def _run_llm_tool_loop(self, ctx: _ChatRunContext) -> _LlmLoopResult:
        """兜底 LLM 链路：构造首轮消息并跑 tool-calling 多轮循环。"""
        messages = await self._build_llm_messages(ctx.history, ctx.user_message)
        tool_schemas: list[Any] = self._tools.get_tool_schemas()
        # 进度回调与轮次无关：循环外解析一次（同时避免闭包延迟绑定）
        on_progress = ctx.options.on_progress if ctx.options else None
        loop = _LlmLoopResult()
        # tool-calling 循环：每轮调用 LLM，有 tool_calls 则执行后回填，直到无 tool_calls 或达到上限
        while loop.rounds < MAX_ROUNDS:
            loop.rounds += 1
            # 每轮下发前先按长度收敛上下文（工具回填会持续追加）
            messages = _trim_messages(messages, MAX_SESSION_PROMPT_CHARS)
            chat_result = await self._invoke_llm_round(messages, tool_schemas, ctx, loop, on_progress)
            # prompt token 超限：_invoke_llm_round 已写好中止回复，直接结束循环
            if chat_result is None:
                break
            # 无工具调用：本轮为最终文本回复，结束循环
            if not chat_result.tool_calls:
                loop.reply = chat_result.content or ""
                loop.speak = True
                break
            # 有工具调用：把 assistant 消息（含 tool_calls）追加到上下文
            messages.append(
                LlmMessage(
                    role="assistant",
                    content=chat_result.content or "",
                    tool_calls=chat_result.tool_calls,
                )
            )
            calls = _filter_effective_calls(chat_result.tool_calls)
            batch = await self._execute_llm_tool_batch(ctx, calls, messages, on_progress)
            # 本批控制全部成功：结束循环，标记 success
            if batch.has_control and batch.all_ok:
                loop.reply = ""
                loop.speak = False
                loop.outcome = "success"
                break
            # 本批控制存在失败：标记 failed / blocked，但仍继续循环让 LLM 决定是否重试 / 回复
            if batch.has_control and not batch.all_ok:
                loop.outcome = "blocked" if batch.any_blocked else "failed"
        # 循环结束但需要朗读且无回复：兜底提示
        if loop.speak and not loop.reply:
            loop.reply = "（未能完成，请重试或换个说法）"
            if loop.outcome == "answer":
                loop.outcome = "failed"
        return loop

    async def _build_llm_messages(
        self, history: list[dict[str, str]], user_message: str
    ) -> list[LlmMessage]:
        """构造 LLM 首轮消息：system + 按字符预算选取的历史 + 当前输入。"""
        # 历史按字符预算（而非固定条数）从新到旧选取，单条限长后再累计
        prior = _select_prior_history(history)
        return [
            LlmMessage(role="system", content=await self._resolve_system_prompt()),
            *[LlmMessage(role=p["role"], content=p["content"]) for p in prior],  # type: ignore[arg-type]
            LlmMessage(role="user", content=user_message),
        ]

    async def _invoke_llm_round(
        self,
        messages: list[LlmMessage],
        tool_schemas: list[Any],
        ctx: _ChatRunContext,
        loop: _LlmLoopResult,
        on_progress: Callable[[dict[str, Any]], None] | None,
    ) -> LlmChatResult | None:
        """调用一次 LLM 并累计 token / 耗时；返回 None 表示已触发 prompt token 硬上限。"""
        l0 = _now_ms()
        chat_opts = (
            LlmChatOptions(on_token=lambda text: on_progress({"type": "token", "text": text}))
            if on_progress
            else None
        )
        try:
            chat_result: LlmChatResult = await self._llm.chat(messages, tool_schemas, chat_opts)
        except (BusinessException, StarletteHTTPException):
            # 业务 / HTTP 异常透传，其余包装为 LLM 上游错误
            raise
        except Exception as exc:
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR,
                api_error("AGENT_LLM_UPSTREAM_ERROR", "unknown", str(exc) or ""),
            ) from exc
        ctx.llm_ms += _now_ms() - l0
        if chat_result.usage is not None:
            loop.prompt_tokens += chat_result.usage.prompt_tokens
            loop.completion_tokens += chat_result.usage.completion_tokens
            loop.cached_tokens += chat_result.usage.cached_tokens or 0
        # 每会话 prompt token 硬上限：累计超限即中止工具循环
        if loop.prompt_tokens > MAX_SESSION_PROMPT_TOKENS:
            logger.warning(
                "Agent 会话上下文超限中止: rounds=%s promptTokens=%s>%s",
                loop.rounds,
                loop.prompt_tokens,
                MAX_SESSION_PROMPT_TOKENS,
            )
            loop.reply = "对话内容过多，已停止继续调用工具。请简化指令或重试。"
            loop.speak = True
            loop.outcome = "failed"
            return None
        return chat_result

    async def _execute_llm_tool_batch(
        self,
        ctx: _ChatRunContext,
        calls: list[LlmToolCall],
        messages: list[LlmMessage],
        on_progress: Callable[[dict[str, Any]], None] | None,
    ) -> _ToolBatchOutcome:
        """逐个执行本轮 LLM 工具调用并回填 messages，同时累计耗时与轨迹。"""
        batch = _ToolBatchOutcome()
        for call in calls:
            is_control = call.name in ("control_device", "control_room", "activate_scene")
            s0 = _now_ms()
            try:
                tool_result = await self._tools.execute(call.name, call.arguments or {}, ctx.actor)
            except Exception as exc:
                tool_result = {"error": str(exc) or "工具执行异常"}
            ctx.tool_ms += _now_ms() - s0
            # 截断大工具结果后再回填 LLM 上下文，防止实体状态 / 日志撑爆 prompt
            serialized = truncate_tool_result(_js_stringify(tool_result))
            ctx.tool_trace.append(
                {
                    "name": call.name,
                    "arguments": call.arguments,
                    "resultPreview": serialized[:200],
                }
            )
            _emit_tool_progress(on_progress, call, serialized)
            messages.append(
                LlmMessage(
                    role="tool",
                    tool_call_id=call.id,
                    name=call.name,
                    content=serialized,
                )
            )
            # 跟踪本批控制类调用的成功 / 拦截状态
            if is_control:
                batch.has_control = True
                if not self._is_control_success(call.name, tool_result):
                    batch.all_ok = False
                if self._is_blocked(tool_result):
                    batch.any_blocked = True
        return batch

    def _finalize_llm_reply(self, ctx: _ChatRunContext, loop: _LlmLoopResult) -> AgentChatResponse:
        """LLM 循环收尾：统计耗时 / 成本、回写缓存并构造响应。"""
        total_ms = _now_ms() - ctx.start_ms
        estimated_cost_cny = estimate_cost_cny(
            loop.prompt_tokens, loop.cached_tokens, loop.completion_tokens
        )
        logger.info(
            "对话完成: 提供商=%s 轮次=%s 结果=%s 朗读=%s LLM=%sms 工具=%sms 合计=%sms | "
            "令牌 入=%s(缓存=%s) 出=%s ≈¥%.6f",
            self._llm.name,
            loop.rounds,
            loop.outcome,
            "是" if loop.speak else "否",
            ctx.llm_ms,
            ctx.tool_ms,
            total_ms,
            loop.prompt_tokens,
            loop.cached_tokens,
            loop.completion_tokens,
            estimated_cost_cny,
        )
        if loop.outcome == "success":
            earcon: str | None = "success"
        elif loop.outcome in ("failed", "blocked"):
            earcon = "error"
        else:
            earcon = None
        # 成功的控制类指令回写缓存（LLM 路径默认待确认，需二次命中才确认）
        if loop.outcome == "success" and ctx.tool_trace:
            last = ctx.tool_trace[-1]
            if last["name"] in ("control_device", "control_room", "activate_scene"):
                self._cmd_cache.try_auto_correct(
                    ctx.user_message,
                    last["name"],
                    last["arguments"],
                    ctx.actor.user_id if ctx.actor else None,
                )
                self._cmd_cache.set(
                    ctx.user_message,
                    last["name"],
                    last["arguments"],
                    False,
                    ctx.actor.user_id if ctx.actor else None,
                )
        return AgentChatResponse(
            reply=loop.reply,
            speak=loop.speak,
            outcome=loop.outcome,
            earcon=earcon,
            provider=self._llm.name,
            rounds=loop.rounds,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": ctx.llm_ms, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage={
                "promptTokens": loop.prompt_tokens,
                "completionTokens": loop.completion_tokens,
                "cachedTokens": loop.cached_tokens,
                "estimatedCostCNY": estimated_cost_cny,
            },
        )

    # 辅助
    async def _resolve_system_prompt(self) -> str:
        """解析系统提示：默认模板 + 用户自定义补充（来自 AgentConfig）。"""
        cfg = await self._agent_config.get_config()
        custom = (cfg.system_prompt or "").strip()
        if not custom:
            return self._L.system_prompt
        return f"{self._L.system_prompt}\n\n【用户自定义补充】\n{custom}"

    @staticmethod
    def _empty_system_reply(reply: str) -> AgentChatResponse:
        """构造一个空的系统回复（provider=system，无工具调用、无耗时）。"""
        return AgentChatResponse(
            reply=reply,
            speak=True,
            outcome="answer",
            earcon=None,
            provider="system",
            rounds=0,
            tool_calls=[],
            timing={"llmMs": 0, "toolMs": 0, "totalMs": 0},
            usage=_empty_usage(),
        )

    def _match_query_fast_path(
        self, text: str
    ) -> dict[str, str] | None:
        """匹配查询快路径（温度 / 湿度询问）。

        房间描述需先剥离「现在 / 当前 / 请问」等噪声词：否则「现在几度」会把时间词
        当成房间名，白白打一次 ``get_area_snapshot`` 才回落 LLM。剥离后为空表示用户
        没指定房间，此时不走快路径（交给 LLM 结合上下文判断）；清洗后仍残留「温 / 湿」
        等查询词碎片时同样放弃（如「客厅的温湿度」被切成房间「客厅温」）。
        """
        t = text.strip()
        for pattern, query_type in (
            (self._L.temp_query, "temperature"),
            (self._L.humidity_query, "humidity"),
        ):
            m = pattern.search(t)
            if not m:
                continue
            room_part = self._clean_query_room(m.group("room") or "")
            if len(room_part) < 1:
                continue
            if self._L.query_room_conflict_pattern.search(room_part):
                logger.info('快路径查询房间名残留查询词,交给 LLM: "%s" → %s', t, room_part)
                continue
            return {"roomName": room_part, "type": query_type}
        return None

    def _clean_query_room(self, room: str) -> str:
        """清洗查询语句捕获到的房间描述（去助词 + 去时间 / 礼貌噪声词）。"""
        cleaned = _strip_de(room)
        cleaned = self._L.query_noise_pattern.sub("", cleaned)
        return cleaned.strip()

    @staticmethod
    def _is_control_success(name: str, r: dict[str, Any]) -> bool:
        """判定一次控制调用是否成功。"""
        if not r or r.get("error"):
            return False
        if name == "control_device":
            return r.get("success") is True
        # HA 场景 / 脚本：activate_scene 返回 { success, entity_id, ... }
        if name == "activate_scene":
            return r.get("success") is True and r.get("blocked") is not True
        if name == "control_room":
            total = r.get("total")
            return (
                _is_number(total)
                and total > 0
                and r.get("affected") == total
            )
        return False

    @staticmethod
    def _is_blocked(r: dict[str, Any]) -> bool:
        """判定工具结果是否包含被安全策略拦截的设备。"""
        if not r:
            return False
        if r.get("blocked") is True:
            return True
        if isinstance(r.get("results"), list):
            return any(isinstance(x, dict) and x.get("blocked") for x in r["results"])
        return False


def _sensor_value(entry: Any) -> str:
    """从传感器对象中取出 value（对齐 JS ``sensors.temperature.value`` 真值判定）。"""
    if isinstance(entry, dict) and entry.get("value"):
        return str(entry["value"])
    return ""


def _strip_de(text: str) -> str:
    """去掉房间描述里的「的」等助词（对齐 ``replace(/[的]+/g, '')``）。"""
    import re

    return re.sub(r"[的]+", "", text or "").strip()


__all__ = [
    "MAX_HISTORY_MESSAGES",
    "MAX_HISTORY_MESSAGE_CHARS",
    "MAX_HISTORY_PROMPT_CHARS",
    "MAX_ROUNDS",
    "MAX_SESSION_PROMPT_CHARS",
    "MAX_SESSION_PROMPT_TOKENS",
    "MAX_TOOL_RESULT_CHARS",
    "AgentChatOptions",
    "AgentChatResponse",
    "AgentService",
    "estimate_cost_cny",
    "truncate_tool_result",
]
