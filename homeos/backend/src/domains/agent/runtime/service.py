"""智能管家核心编排服务。"""

from __future__ import annotations

import asyncio
import inspect
import logging
import re
import time
from collections.abc import Callable
from typing import Any

from starlette.exceptions import HTTPException as StarletteHTTPException

from .agent_actor import AgentActor
from .audit import (
    CONTROL_TOOL_NAMES,
    OUTCOME_BLOCKED,
    OUTCOME_FAILED,
    OUTCOME_SUCCESS,
    OUTCOME_UNVERIFIED,
    audit_target,
    control_outcome,
    control_succeeded,
    describe_plan,
    is_blocked,
)
from .batch_ops import BatchOperationService, build_undo_calls
from .config_service import AgentConfigService
from .fast_path import FastPathService
from .lang_template_service import LangTemplateService
from .tool_i18n import agent_text, localize_tool_schemas
from .tool_result import normalize_tool_result
from ..memory.command_cache import CommandCacheService
from ..memory.memory_store import AgentMemoryService, parse_memory_command
from ..memory.session_store import AgentSessionStoreService
from ..memory.short_term_memory import AgentShortTermMemoryService
from ..policy.budget import AgentBudgetService
from ..policy.pricing import resolve_pricing
from ..providers.llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolCall,
)
from ..state.store import MemoryStateStore, SharedStateStore
from ..tools.home_tools_service import HomeToolsService
from ....platform.core.http.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.agent.service")

#: 单次 LLM 请求的 prompt token 上限：工具 schema + 历史 + 回填超限时这一轮就不该再发。
#: 与「整轮累计」分开：一次多轮工具调用会重复下发同一份 schema，把累计值当成单请求上限
#: 会让两三轮之后就误判「上下文过大」，而实际每一轮都远未超限。
MAX_PROMPT_TOKENS_PER_REQUEST = 48_000
#: 整轮对话累计 prompt token 兜底：防止单轮对话无限膨胀（成本保护，不是上下文保护）
MAX_SESSION_PROMPT_TOKENS = 240_000
#: 单轮对话内 messages 的字符预算（含 system / 历史 / 工具回填）。
#: 超出时优先丢弃最旧的非 system 消息，而不是等一轮跑完才发现超限。
MAX_SESSION_PROMPT_CHARS = 24_000
#: LLM tool-calling 最大轮数，避免无限循环
MAX_ROUNDS = 8


#: 审计结论 → (日志级别, 中文状态)。四态而不是两态：HA 收下请求却没回实体状态时
#: （``verified is None``）单独记「已下发未确认」，既不算成功也不算失败。
#: 判定见 :func:`.audit.control_outcome`；控制类名单也在那里，与 ACL 共用一份。
_AUDIT_STATUS = {
    OUTCOME_SUCCESS: ("success", "成功"),
    OUTCOME_UNVERIFIED: ("warning", "已下发未确认"),
    OUTCOME_FAILED: ("error", "失败"),
    OUTCOME_BLOCKED: ("warning", "已拦截"),
}
#: 审计时需要打码的参数字段（凭证类，绝不能进日志）
SENSITIVE_ARG_KEYS = frozenset({"code", "pin", "password", "passwd", "token", "secret", "apikey", "api_key", "key"})
#: 入口标识 → 中文标签（写入 global_log 便于人读）
ENTRY_LABELS = {
    "web": "网页",
    "voice": "语音",
    "wecom": "企业微信",
    "channels": "消息通道",
    "mcp": "MCP",
    "api": "API",
    "system": "系统",
}


from .service_support import (
    MAX_HISTORY_MESSAGE_CHARS,
    MAX_HISTORY_MESSAGES,
    MAX_HISTORY_PROMPT_CHARS,
    MAX_TOOL_RESULT_CHARS,
    TOOL_RESULT_PREVIEW_CHARS,
    TOOL_TIMEOUT_SECONDS,
    TURN_TIMEOUT_SECONDS,
    AgentChatOptions,
    AgentChatResponse,
    _build_control_fast_call,
    _ChatRunContext,
    _emit_tool_progress,
    _empty_usage,
    _filter_effective_calls,
    _intersect_restrictions,
    _is_applied_result,
    _js_stringify,
    _LlmLoopResult,
    _needs_batch_confirmation,
    _now_ms,
    _result_uses_success_flag,
    _select_prior_history,
    _summarize_query_result,
    _ToolBatchOutcome,
    _ToolOutcome,
    _trim_messages,
    estimate_cost_cny,
    truncate_tool_result,
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
        budget: AgentBudgetService | None = None,
        audit_log: Any | None = None,
        memory: AgentMemoryService | None = None,
        env_context: Any | None = None,
        tts: Any | None = None,
        state_store: SharedStateStore | None = None,
    ) -> None:
        self._llm = llm
        self._tools = tools
        self._fast_path = fast_path
        self._cmd_cache = cmd_cache
        self._lang_templates = lang_templates
        self._agent_config = agent_config
        self._sessions = sessions
        self._short_term = short_term
        #: 每日 token / 成本预算；None 表示不限制（测试或旧装配路径）
        self._budget = budget
        #: global_log 存储；None 表示不做审计（测试 / 精简装配）
        self._audit_log = audit_log
        #: 长期记忆（别名 / 偏好）；None 表示未启用
        self._memory = memory
        #: 家庭环境上下文（当前时间 / 天气 / 日出日落）；None 表示不注入
        self._env_context = env_context
        #: 服务端 TTS（签发签名 URL）；None 表示不提供音频，前端走本机 / HA 播报
        self._tts = tts
        #: 状态后端：短时记忆 / 预算共用一份，批量确认也复用（多 worker 时一致）
        self._state_store = state_store or MemoryStateStore()
        #: 批量操作确认 / 撤销（按会话隔离，状态走共享后端）
        self._batch_ops = BatchOperationService(self._state_store)

    @property
    def _L(self) -> Any:
        """当前语言模板（口令、回复模板、系统提示）。"""
        return self._lang_templates.current

    def _lang_code(self) -> str:
        """当前语言代码；精简装配（测试 / 旧路径）没有模板时回退中文。"""
        templates = self._lang_templates
        if templates is None:
            return "zh"
        return str(getattr(templates.current, "lang", "zh") or "zh")

    # 提供商信息
    def get_provider_info(self) -> dict[str, Any]:
        """返回当前 LLM 提供商信息（名称 / 模型 / 就绪状态 / 计价口径）。"""
        provider = str(self._llm.name or "")
        pricing = resolve_pricing(provider)
        return {
            "provider": provider,
            "model": str(getattr(self._llm, "model", "") or ""),
            "ready": self._llm.is_ready(),
            "pricing": pricing.to_dict(),
            "budget": (
                {
                    "dailyTokenBudget": self._budget.config.daily_token_budget,
                    "dailyCostBudgetCNY": self._budget.config.daily_cost_budget_cny,
                    "source": self._budget.config.source,
                }
                if self._budget is not None
                else None
            ),
        }

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

    async def _scope_actor(self, actor: AgentActor | None) -> AgentActor | None:
        """把 Agent 专属设备白名单叠加到执行身份上（与用户 ACL 取交集）。"""
        if actor is None:
            return None
        getter = getattr(self._agent_config, "get_device_allowlist", None)
        if not callable(getter):
            return actor
        try:
            # 配置端口允许返回同步值（内存桩）或协程（读库实现），统一兜住两种形态。
            pending = getter()
            raw_allowlist = await pending if inspect.isawaitable(pending) else pending
            allowlist = raw_allowlist if isinstance(raw_allowlist, list) else None
        except Exception as exc:  # 配置读取失败不应阻断对话，按“不额外限制”处理
            logger.warning("读取 Agent 设备白名单失败,按不限制处理: %s", exc)
            return actor
        if not allowlist:
            return actor
        restrictions = _intersect_restrictions(actor.restrictions, allowlist)
        return AgentActor(
            restrictions=restrictions,
            user_id=actor.user_id,
            username=actor.username,
        )

    # 主入口
    async def chat(
        self,
        user_message: str,
        history: list[dict[str, str]] | None = None,
        options: AgentChatOptions | None = None,
    ) -> AgentChatResponse:
        """智能管家对话主入口（支持连续对话）。"""
        history = history or []
        # Agent 专属设备白名单先叠加到执行身份（与登录用户 ACL 取交集），
        # 后续工具读取 / 控制都走同一份 restrictions
        actor = await self._scope_actor(options.actor if options is not None else None)
        # 会话 key 先按登录身份隔离，再进入会话存储 / 短时记忆；
        # 后续所有读写（含 _chat_internal 里的 clear）都必须用这个作用域化后的 key
        session_id = self._scope_session_id(options)
        scoped_options = (
            AgentChatOptions(
                actor=actor,
                session_id=session_id,
                entry=options.entry,
                room=options.room,
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
        result = await self._chat_internal(user_message, effective_history, scoped_options, state)
        self._attach_tts(result)
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

    def _attach_tts(self, result: AgentChatResponse) -> None:
        """给需要朗读的回复签一个音频 URL。

        TTS 是**锦上添花**：这里任何异常都只记日志。音频链路的任何问题都不该让
        一句已经执行成功的控制指令变成错误响应。
        """
        tts = self._tts
        if tts is None or not result.speak or not (result.reply or "").strip():
            return
        try:
            signed = tts.generate_signed_url(result.reply)
        except Exception:
            logger.debug("签发 TTS 音频 URL 失败", exc_info=True)
            return
        if signed is not None:
            result.tts_url = signed.tts_url

    def _merge_short_term_history(
        self,
        history: list[dict[str, str]],
        session_id: str | None,
    ) -> list[dict[str, str]]:
        """合并「长会话历史」与「短时记忆」，避免最近两轮重复出现。"""
        if not session_id:
            return history
        recent = [{"role": t.role, "content": t.content} for t in self._short_term.get_history(session_id)]
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
                f"{c['name']}({_js_stringify(c.get('arguments') or {})[:TOOL_RESULT_PREVIEW_CHARS]})"
                for c in res.tool_calls
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
            deadline_at=time.monotonic() + TURN_TIMEOUT_SECONDS,
        )
        # 1) 纠正 / 清除记忆口令：命中则直接返回系统回复，不走后续流程
        memory_reply = await self._handle_memory_command(ctx)
        if memory_reply is not None:
            return memory_reply
        # 1.5) 批量操作：撤销口令 / 上一轮待确认的确认与取消
        batch_reply = await self._serve_batch_flow(ctx)
        if batch_reply is not None:
            return batch_reply
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
        #    额度用尽时不再请求上游：缓存 / 快路径已在上面先行，常用控制指令仍可用
        budget_reply = self._serve_budget_guard(ctx)
        if budget_reply is not None:
            return budget_reply
        loop_outcome = await self._run_llm_tool_loop(ctx)
        return self._finalize_llm_reply(ctx, loop_outcome)

    def _batch_key(self, ctx: _ChatRunContext) -> str:
        """批量确认 / 撤销的隔离 key：优先会话，其次登录用户。"""
        if ctx.session_id:
            return f"session:{ctx.session_id}"
        actor = ctx.actor
        if actor is not None and (actor.user_id or actor.username):
            return f"user:{actor.user_id or actor.username}"
        return "anon"

    def _t(self, zh_text: str, en_text: str) -> str:
        """按当前语言模板选择文案。"""
        return zh_text if self._L.lang == "zh" else en_text

    async def _serve_batch_flow(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """批量操作：撤销口令 / 上一轮待确认计划的确认与取消。"""
        key = self._batch_key(ctx)
        if BatchOperationService.is_undo(ctx.user_message):
            self._batch_ops.clear_pending(key)
            record = self._batch_ops.pop_undo(key)
            if record is None:
                return self._empty_system_reply(self._t("没有可撤销的批量操作。", "There is no batch action to undo."))
            return await self._restore_undo(ctx, record.snapshot, record.summary)

        pending = self._batch_ops.pop_pending(key)
        if pending is None:
            return None
        if BatchOperationService.is_cancel(ctx.user_message):
            logger.info("批量操作已取消: key=%s summary=%s", key, pending.summary)
            return self._empty_system_reply(
                self._t("好的，已取消，不会执行这次批量操作。", "Cancelled. Nothing was changed.")
            )
        if not BatchOperationService.is_confirm(ctx.user_message):
            # 用户没有确认，视为新指令：丢弃待确认计划后继续正常流程
            logger.info("批量操作未确认,转为新指令: key=%s", key)
            return None
        return await self._execute_batch_calls(ctx, key, pending.calls, pending.summary)

    def _batch_confirm_prompt(self, summary: str) -> str:
        """批量操作确认提示（语音可朗读）。

        英文模式必须给出英文口令：确认 / 取消的解析是双语的，但提示如果还写
        「回复确认」，英文用户会照着中文说。
        """
        if self._L.lang == "zh":
            return f"这是批量操作：{summary}。确定执行吗？回复「确认」执行，或回复「取消」。"
        return f"This is a batch action: {summary}. Reply “confirm” to proceed or “cancel” to cancel."

    def _batch_confirmation(self, summary: str) -> dict[str, Any]:
        """结构化确认信息：前端据此渲染按钮，渠道侧仍用文本。"""
        return {
            "kind": "batch",
            "summary": summary,
            "confirmText": "确认" if self._L.lang == "zh" else "confirm",
            "cancelText": "取消" if self._L.lang == "zh" else "cancel",
            "expiresInSeconds": 60,
        }

    def _describe_fast_action(self, fast: dict[str, Any]) -> str:
        """把快路径结果压缩成一句可朗读的批量描述。"""
        if fast.get("summary"):
            return str(fast["summary"])
        if fast["kind"] == "room":
            return f"{fast.get('roomName') or '房间'}的{fast.get('domain') or '设备'}（{fast.get('service')}）"
        if fast["kind"] == "device":
            return f"{fast.get('entityId')}（{fast.get('service')}）"
        if fast["kind"] == "scene":
            return f"场景 {fast.get('sceneName')}"
        return "控制多台设备"

    def _stage_batch(
        self, ctx: _ChatRunContext, calls: list[tuple[str, dict[str, Any]]], summary: str
    ) -> AgentChatResponse:
        """暂存批量计划并返回确认提示。"""
        self._batch_ops.stage(self._batch_key(ctx), calls, summary)
        total_ms = _now_ms() - ctx.start_ms
        return AgentChatResponse(
            reply=self._batch_confirm_prompt(summary),
            speak=True,
            # 「等你确认」与「做完了 / 失败了」是三种不同反馈：确认提示用单音，
            # 用户不看屏幕也能听出这一句是在等回复，而不是已经执行完。
            outcome="answer",
            earcon="confirm",
            provider="fast-path",
            rounds=1,
            tool_calls=[],
            timing={"llmMs": 0, "toolMs": 0, "totalMs": total_ms},
            usage=_empty_usage(),
            confirmation=self._batch_confirmation(summary),
        )

    async def _execute_batch_calls(
        self,
        ctx: _ChatRunContext,
        key: str,
        calls: list[tuple[str, dict[str, Any]]],
        summary: str,
    ) -> AgentChatResponse:
        """执行已确认的批量计划，并记录执行前快照供撤销。

        计划里可能混有查询类调用（LLM 会把「关灯 + 看湿度」放进同一批）。批量成败、
        撤销快照与短时记忆目标只按控制类调用记账：查询失败不该说成「批量操作失败」，
        更不该把查询结果写进撤销快照。查询结果摘要补在回复末尾，避免用户看不到答案。
        """
        s0 = _now_ms()
        snapshot: list[dict[str, Any]] = []
        all_ok = True
        any_blocked = False
        query_notes: list[str] = []
        for tool_name, tool_args in calls:
            is_control = tool_name in CONTROL_TOOL_NAMES
            entity_id = tool_args.get("entity_id")
            if is_control and tool_name == "control_device" and isinstance(entity_id, str) and entity_id:
                snapshot.extend(self._tools.snapshot_entities([entity_id]))
            tool_result = await self._call_tool(ctx, tool_name, tool_args)
            if isinstance(tool_result, dict):
                snapshot.extend(tool_result.get("snapshot") or [])
                # 摄像头查询可能和批量控制同批暂存：确认后执行时也要把快照带回去，
                # 否则用户点了「确认」，图片却凭空消失。
                snapshot_url = tool_result.get("snapshotUrl")
                if isinstance(snapshot_url, str) and snapshot_url:
                    ctx.attachments = [
                        {
                            "kind": "image",
                            "url": snapshot_url,
                            "entityId": tool_args.get("entity_id"),
                        }
                    ]
            outcome = self._record_tool_result(ctx, tool_name, tool_args, tool_result)
            if not is_control:
                note = _summarize_query_result(tool_result)
                if note:
                    query_notes.append(note)
                continue
            all_ok = all_ok and outcome.applied
            any_blocked = any_blocked or outcome.blocked
            if outcome.applied:
                self._remember_targets(ctx, tool_name, tool_args, tool_result)
        ctx.tool_ms += _now_ms() - s0
        # 去重：同一实体只保留第一次（最早）的执行前状态
        deduped: dict[str, dict[str, Any]] = {}
        for item in snapshot:
            if isinstance(item, dict) and item.get("entity_id"):
                deduped.setdefault(str(item["entity_id"]), item)
        self._batch_ops.remember_undo(key, list(deduped.values()), summary)
        total_ms = _now_ms() - ctx.start_ms
        outcome = "success" if all_ok else ("blocked" if any_blocked else "failed")
        logger.info(
            "批量操作执行完成: key=%s calls=%s ok=%s outcome=%s total=%sms",
            key,
            len(calls),
            all_ok,
            outcome,
            total_ms,
        )
        return AgentChatResponse(
            reply=self._batch_result_reply(all_ok, query_notes),
            speak=True,
            outcome=outcome,
            earcon="success" if all_ok else "error",
            provider="fast-path",
            rounds=1,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": 0, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage=_empty_usage(),
            attachments=ctx.attachments,
        )

    def _batch_result_reply(self, all_ok: bool, query_notes: list[str]) -> str:
        """批量执行结果文案：控制项结论 + 同批查询项的结果摘要。"""
        if all_ok:
            base = self._t("好的，已执行。", "Done.")
        else:
            base = self._t("批量操作部分失败，请查看设备状态。", "Some batch actions failed.")
        if not query_notes:
            return base
        # 最多补 3 条，避免一次批量把整段 JSON 塞回用户
        joined = "；".join(query_notes[:3]) if self._L.lang == "zh" else "; ".join(query_notes[:3])
        return f"{base}\n{joined}"

    async def _restore_undo(
        self,
        ctx: _ChatRunContext,
        snapshot: list[dict[str, Any]],
        summary: str,
    ) -> AgentChatResponse:
        """按执行前快照反向恢复（一次性）。"""
        calls = build_undo_calls(snapshot)
        if not calls:
            return self._empty_system_reply(self._t("这批操作没有可恢复的开关或亮度状态。", "Nothing can be restored."))
        s0 = _now_ms()
        ok_count = 0
        for tool_name, tool_args in calls:
            tool_result = await self._call_tool(ctx, tool_name, tool_args)
            if self._record_tool_result(ctx, tool_name, tool_args, tool_result).applied:
                ok_count += 1
        ctx.tool_ms += _now_ms() - s0
        total_ms = _now_ms() - ctx.start_ms
        logger.info(
            "撤销批量操作: summary=%s restored=%s/%s total=%sms",
            summary,
            ok_count,
            len(calls),
            total_ms,
        )
        all_ok = ok_count == len(calls)
        return AgentChatResponse(
            reply=(
                self._t("已经撤销刚才的批量操作。", "The last batch action was undone.")
                if all_ok
                else self._t(
                    f"已恢复 {ok_count}/{len(calls)} 台设备，其余请手动确认。",
                    f"Restored {ok_count}/{len(calls)} devices; please check the rest manually.",
                )
            ),
            speak=True,
            outcome="success" if all_ok else "failed",
            earcon="success" if all_ok else "error",
            provider="fast-path",
            rounds=1,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": 0, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage=_empty_usage(),
        )

    def _record_tool_result(
        self,
        ctx: _ChatRunContext,
        name: str,
        args: dict[str, Any] | None,
        result: Any,
        *,
        truncate: bool = False,
    ) -> _ToolOutcome:
        """把一次工具调用记进 ``ctx.tool_trace``，并统一算出三个判定。

        原先 5 个调用点各自手写 ``serialized[:200]`` + 各自的成功 / 拦截判定，
        预览长度与判定口径容易走偏（LLM 链路要截断后再回填、控制链路看 total/affected）。
        收敛到这里后，轨迹格式与判定口径只有一份定义。
        """
        serialized = _js_stringify(result)
        if truncate:
            serialized = truncate_tool_result(serialized)
        payload = result if isinstance(result, dict) else {}
        ctx.tool_trace.append(
            {
                "name": name,
                "arguments": args,
                "resultPreview": serialized[:TOOL_RESULT_PREVIEW_CHARS],
            }
        )
        return _ToolOutcome(
            serialized=serialized,
            applied=_is_applied_result(payload, by_success_flag=_result_uses_success_flag(name)),
            control_ok=control_succeeded(name, payload),
            blocked=is_blocked(payload),
        )

    def _remember_targets(
        self,
        ctx: _ChatRunContext,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_result: Any,
    ) -> None:
        """记录本轮控制目标，供下一句「把它关掉」快速消解。"""
        if not ctx.session_id or self._short_term is None:
            return
        ids: list[str] = []
        entity_id = tool_args.get("entity_id")
        if isinstance(entity_id, str) and entity_id:
            ids.append(entity_id)
        if isinstance(tool_result, dict):
            for item in tool_result.get("snapshot") or []:
                if isinstance(item, dict) and item.get("entity_id"):
                    ids.append(str(item["entity_id"]))
        if ids or tool_name in CONTROL_TOOL_NAMES:
            self._short_term.remember_targets(ctx.session_id, ids)

    def _budget_owner(self, ctx: _ChatRunContext) -> str:
        """预算归属 key：优先登录用户，未绑定身份时归入 ``anon``。"""
        actor = ctx.actor
        if actor is None:
            return "anon"
        return str(actor.user_id or actor.username or "anon")

    def _llm_model(self) -> str:
        """当前 provider 使用的模型名（mock / unavailable 为空串）。"""
        return str(getattr(self._llm, "model", "") or "")

    # 工具执行 / 审计
    @staticmethod
    def _redact(value: Any) -> Any:
        """递归给凭证字段打码（覆盖 service_data 内嵌 ``code`` 等情况）。"""
        if isinstance(value, dict):
            return {
                str(key): ("***" if str(key).strip().lower() in SENSITIVE_ARG_KEYS else AgentService._redact(item))
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [AgentService._redact(item) for item in value]
        return value

    def _audit_control(
        self,
        ctx: _ChatRunContext,
        name: str,
        args: dict[str, Any],
        result: Any,
        elapsed_ms: int,
    ) -> None:
        """把控制类动作写入 global_log（best-effort，失败不影响主流程）。

        结论用 :func:`control_outcome` 的四态，而不是「成功 / 失败」两态：
        HA 收下请求但没回该实体状态时（``verified is None``）记作「已下发未确认」，
        既不冤枉成失败，也不把「没执行」写成成功。
        """
        if self._audit_log is None or name not in CONTROL_TOOL_NAMES:
            return
        try:
            outcome = control_outcome(name, result)
            level, status = _AUDIT_STATUS[outcome]
            entry = (ctx.options.entry if ctx.options else "web") or "web"
            label = ENTRY_LABELS.get(entry, entry)
            target = audit_target(name, args)
            actor = ctx.actor
            who = str(actor.username or actor.user_id or "未绑定身份") if actor else "未绑定身份"
            self._audit_log.append(
                level,
                "智能管家",
                "设备操作",
                f"{label} · {target or name} · {status}（{elapsed_ms}ms）",
                context={
                    "entry": entry,
                    "tool": name,
                    "target": target,
                    "user": who,
                    "ok": outcome == OUTCOME_SUCCESS,
                    "blocked": outcome == OUTCOME_BLOCKED,
                    "outcome": outcome,
                    "elapsedMs": elapsed_ms,
                    # 凭证字段已打码；其余参数保留，便于复盘误控
                    "arguments": self._redact(args or {}),
                },
            )
        except Exception:
            logger.warning("智能管家审计写入失败", exc_info=True)

    async def _call_tool(
        self,
        ctx: _ChatRunContext,
        name: str,
        args: dict[str, Any] | None,
    ) -> Any:
        """执行单个工具：带超时上限，并对控制类动作写审计。

        超时不抛异常而是返回``{"error": ...}``：缓存 / 快路径 / LLM 三条链路都把工具
        错误当作普通结果处理（删缓存、降级、回填给模型收尾），抛异常会变成 500。
        """
        payload = args if isinstance(args, dict) else {}
        started = _now_ms()
        result: Any
        # 单次工具超时不能超过整轮剩余时间：否则一个卡住的 HA 调用会把整轮拖过 deadline
        remaining = ctx.remaining_seconds()
        timeout = TOOL_TIMEOUT_SECONDS if remaining is None else max(0.5, min(TOOL_TIMEOUT_SECONDS, remaining))
        try:
            result = await asyncio.wait_for(
                self._tools.execute(name, payload, ctx.actor),
                timeout=timeout,
            )
        except TimeoutError:
            result = {"error": agent_text("tool_timeout", self._lang_code(), seconds=timeout)}
            logger.warning("工具执行超时: %s", name)
        except Exception as exc:
            result = {"error": agent_text("tool_error", self._lang_code(), detail=str(exc) or "unknown")}
        elapsed = _now_ms() - started
        # 契约统一：补 ``ok``（失败再补 ``error``），审计与后续消费方只认这一个真值
        result = normalize_tool_result(result)
        self._audit_control(ctx, name, payload, result, elapsed)
        return result

    def _serve_budget_guard(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """每日额度检查：超限时返回友好提示，不再调用 LLM。"""
        if self._budget is None:
            return None
        decision = self._budget.check(self._budget_owner(ctx))
        if decision.allowed:
            return None
        if decision.reason == "cost":
            limit = f"¥{decision.cost_budget_cny:.2f}"
            used = f"已用约 ¥{decision.used_cost_cny:.2f}"
        else:
            limit = f"{decision.token_budget:,} token"
            used = f"已用 {decision.used_tokens:,} token"
        logger.warning(
            "智能管家日额度用尽: owner=%s 维度=%s %s / %s",
            self._budget_owner(ctx),
            decision.reason,
            used,
            limit,
        )
        return self._empty_system_reply(
            agent_text(
                "budget_exhausted",
                self._lang_code(),
                limit=limit,
                used=used,
            )
        )

    def _memory_scope(self, ctx: _ChatRunContext) -> str:
        """长期记忆作用域：登录用户优先，其次会话，最后匿名。"""
        actor = ctx.actor
        if actor is not None and (actor.user_id or actor.username):
            return f"user:{actor.user_id or actor.username}"
        if ctx.session_id:
            return f"session:{ctx.session_id}"
        return "anon"

    async def _handle_memory_command(self, ctx: _ChatRunContext) -> AgentChatResponse | None:
        """处理「记住 / 忘记 / 纠正 / 清除记忆」口令；返回 None 表示继续走后续流程。"""
        trimmed = ctx.user_message.strip()
        if self._memory is not None:
            parsed = parse_memory_command(trimmed)
            if parsed is not None:
                action, key, value = parsed
                scope = self._memory_scope(ctx)
                if action == "forget":
                    removed = self._memory.forget(scope, key)
                    return self._empty_system_reply(
                        self._t(f"已经忘记「{key}」。", f"Forgotten: {key}.")
                        if removed
                        else self._t(f"我没有记住过「{key}」。", f"I don't have any memory named {key}.")
                    )
                kind = "preference" if action == "preference" else "alias"
                if not self._memory.remember(scope, key, value, kind):
                    return self._empty_system_reply(agent_text("alias_too_short", self._lang_code()))
                if kind == "preference":
                    return self._empty_system_reply(
                        self._t("好的，我记住您的偏好了。", "Got it. I'll remember that preference.")
                    )
                return self._empty_system_reply(
                    self._t(f"记住了：「{key}」就是「{value}」。", f'Noted: "{key}" means "{value}".')
                )
        is_correction = bool(self._L.correction_commands.search(trimmed))
        is_clear = trimmed == self._L.clear_memory
        if not (is_correction or is_clear):
            return None
        if is_clear:
            self._cmd_cache.clear(ctx.actor.user_id if ctx.actor else None)
            if self._memory is not None:
                self._memory.clear(self._memory_scope(ctx))
            if ctx.session_id:
                self._sessions.clear(ctx.session_id)
                # 短时记忆一并清空，避免遗留的反问语境在「忘掉一切」后继续生效
                self._short_term.clear(ctx.session_id)
            return self._empty_system_reply(agent_text("memory_cleared", self._lang_code()))
        # 纠正：删除最近一条缓存，用其原话作为新指令继续走后续流程
        last = self._cmd_cache.correct_last(ctx.actor.user_id if ctx.actor else None)
        if last:
            ctx.user_message = last
            return None
        return self._empty_system_reply(self._t("没有需要纠正的指令哦。", "There is no command to correct."))

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
                earcon="confirm",
                provider="cache",
                rounds=0,
                tool_calls=[],
                timing={"llmMs": 0, "toolMs": 0, "totalMs": total_ms},
                usage=_empty_usage(),
                confirmation=self._batch_confirmation(cached.tool_name),
            )
        # 已确认（confirmed === true）：直接执行工具，跳过 LLM
        s0 = _now_ms()
        tool_result = await self._call_tool(ctx, cached.tool_name, cached.tool_args)
        ctx.tool_ms = _now_ms() - s0
        outcome = self._record_tool_result(ctx, cached.tool_name, cached.tool_args, tool_result)
        if not outcome.applied:
            # 缓存执行失败：设备可能已变更，删除过期缓存后降级到快路径 / LLM
            logger.warning('缓存失败(设备可能已变更),删除过期缓存,降级→快路径/LLM: "%s"', ctx.user_message)
            self._cmd_cache.delete(ctx.user_message, ctx.actor.user_id if ctx.actor else None)
            # 轨迹里已经写进了这次失败调用：回滚掉，避免响应里出现「没执行却报成功」的 chip。
            ctx.tool_trace.pop()
            return None
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
        self._remember_targets(ctx, cached.tool_name, cached.tool_args, tool_result)
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
        snap = await self._call_tool(ctx, "get_area_snapshot", {"area_id": query_fast["roomName"]})
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
        template = self._L.temp_reply_template if sensor_kind == "temperature" else self._L.humidity_reply_template
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
        hints = (
            self._short_term.get_last_targets(ctx.session_id)
            if ctx.session_id and self._short_term is not None
            else None
        )
        fast_text = ctx.user_message
        if self._memory is not None:
            fast_text = self._memory.expand(fast_text, self._memory.alias_map(self._memory_scope(ctx)))
        fast = await self._fast_path.try_parse(fast_text, hints)
        if not fast:
            return None
        s0 = _now_ms()
        tool_name, tool_args = _build_control_fast_call(fast)
        # 整房间 / 全屋批量控制：先确认，避免「关灯」误关整屋
        if fast["kind"] == "room":
            summary = self._describe_fast_action(fast)
            return self._stage_batch(ctx, [(tool_name, tool_args)], summary)
        tool_result = await self._call_tool(ctx, tool_name, tool_args)
        ctx.tool_ms = _now_ms() - s0
        outcome = self._record_tool_result(ctx, tool_name, tool_args, tool_result)
        ok = outcome.applied
        blocked = outcome.blocked
        total_ms = _now_ms() - ctx.start_ms
        logger.info("快路径: %s total=%sms ok=%s blocked=%s", tool_name, total_ms, ok, blocked)
        # 控制成功则回写缓存（快路径默认 confirmed）
        if ok:
            self._cmd_cache.try_auto_correct(
                ctx.user_message, tool_name, tool_args, ctx.actor.user_id if ctx.actor else None
            )
            self._cmd_cache.set(ctx.user_message, tool_name, tool_args, True, ctx.actor.user_id if ctx.actor else None)
            # 快路径是独立完整的指令执行，成功后重置短时记忆，杜绝跨意图污染
            if ctx.session_id:
                self._short_term.clear(ctx.session_id)
                ctx.state["short_term_reset"] = True
            self._remember_targets(ctx, tool_name, tool_args, tool_result)
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
        messages = await self._build_llm_messages(ctx.history, ctx.user_message, ctx)
        tool_schemas: list[Any] = localize_tool_schemas(self._tools.get_tool_schemas(), self._lang_code())
        # 进度回调与轮次无关：循环外解析一次（同时避免闭包延迟绑定）
        on_progress = ctx.options.on_progress if ctx.options else None
        loop = _LlmLoopResult()
        # tool-calling 循环：每轮调用 LLM，有 tool_calls 则执行后回填，直到无 tool_calls 或达到上限
        while loop.rounds < MAX_ROUNDS:
            # 整轮 deadline：到点直接收尾，不再发起新一轮（单轮超时只是下限保护）
            if ctx.turn_expired():
                loop.reply = self._t(
                    "这轮处理时间过长，已先停下。请稍后重试或把指令拆成几步。",
                    "This turn took too long, so I stopped. Try again later or split the request.",
                )
                loop.speak = True
                loop.outcome = "failed"
                return loop
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
            # 多设备 / 整房间批量控制：暂停执行，先向用户确认。
            # 判定只看控制类调用，但暂存的是**全部**调用：LLM 常把「关灯 + 顺便看看湿度」
            # 放进同一批，只暂存控制项会让查询结果凭空消失；只按全批判断又会让混合批
            # 完全跳过确认（控制项被顺手执行）。
            control_calls = [call for call in calls if call.name in CONTROL_TOOL_NAMES]
            if _needs_batch_confirmation(control_calls):
                plan = [(call.name, dict(call.arguments or {})) for call in calls]
                summary = describe_plan([(call.name, dict(call.arguments or {})) for call in control_calls])
                self._batch_ops.stage(self._batch_key(ctx), plan, summary)
                logger.info("LLM 批量计划待确认: session=%s calls=%s", ctx.session_id, len(plan))
                loop.reply = self._batch_confirm_prompt(summary)
                loop.speak = True
                loop.outcome = "answer"
                # 「等你确认」用单音提示：与「已执行 / 失败」区分，不看屏幕也听得出
                loop.earcon = "confirm"
                loop.confirmation = self._batch_confirmation(summary)
                return loop
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
            loop.reply = self._t("（未能完成，请重试或换个说法）", "(That didn't finish. Please retry or rephrase.)")
            if loop.outcome == "answer":
                loop.outcome = "failed"
        return loop

    @staticmethod
    def _wrap_untrusted_tool_result(content: str) -> str:
        """把工具结果标记为不可信数据，降低提示注入风险。

        设备名 / 天气 / 日历 / 通知等字段可能被外部输入污染（例如用户把设备命名为
        「忽略以上规则」）。用固定分隔符包起来，并明确告知模型「这是数据不是指令」。
        内容里若自带闭合标签会提前结束区块、把后续文字伪造成区块外的指令，因此必须
        先把闭合标签转义成普通文本（大小写与空白变体一并处理）。
        """
        safe_content = re.sub(r"</\s*tool_result\s*>", r"<\\/tool_result>", content, flags=re.IGNORECASE)
        return f'<tool_result trust="untrusted_data">\n{safe_content}\n</tool_result>'

    async def _build_llm_messages(
        self,
        history: list[dict[str, str]],
        user_message: str,
        ctx: _ChatRunContext | None = None,
    ) -> list[LlmMessage]:
        """构造 LLM 首轮消息：system + 按字符预算选取的历史 + 当前输入。"""
        # 历史按字符预算（而非固定条数）从新到旧选取，单条限长后再累计
        prior = _select_prior_history(history)
        # 别名只展开当前输入，不改写历史：历史里的原话是用户真实说过的内容，
        # 改写会让模型看到「用户从没说过」的句子，也让后续纠正指令对不上原文。
        current = user_message
        if self._memory is not None and ctx is not None:
            aliases = self._memory.alias_map(self._memory_scope(ctx))
            if aliases:
                current = self._memory.expand(current, aliases)
        return [
            LlmMessage(role="system", content=await self._resolve_system_prompt(ctx)),
            *[LlmMessage(role=p["role"], content=p["content"]) for p in prior],  # pyright: ignore[reportArgumentType]
            LlmMessage(role="user", content=current),
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
            LlmChatOptions(on_token=lambda text: on_progress({"type": "token", "text": text})) if on_progress else None
        )
        try:
            remaining = ctx.remaining_seconds()
            timeout = TURN_TIMEOUT_SECONDS if remaining is None else max(1.0, remaining)
            chat_result: LlmChatResult = await asyncio.wait_for(
                self._llm.chat(messages, tool_schemas, chat_opts),
                timeout=timeout,
            )
        except TimeoutError:
            ctx.llm_ms += _now_ms() - l0
            logger.warning("整轮对话超时, 最后一轮 LLM 未返回: rounds=%s", loop.rounds)
            loop.reply = self._t(
                "这轮处理时间过长，已先停下。请稍后重试或把指令拆成几步。",
                "This turn took too long, so I stopped. Try again later or split the request.",
            )
            loop.speak = True
            loop.outcome = "failed"
            return None
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
            round_prompt_tokens = chat_result.usage.prompt_tokens
            loop.prompt_tokens += round_prompt_tokens
            loop.completion_tokens += chat_result.usage.completion_tokens
            loop.cached_tokens += chat_result.usage.cached_tokens or 0
            # 两层口径：本轮请求超限说明上下文本身已经放不下，必须中止；
            # 整轮累计超限是成本兜底。混用会把「多轮重复下发 schema」误判成上下文过大。
            if round_prompt_tokens > MAX_PROMPT_TOKENS_PER_REQUEST:
                logger.warning(
                    "Agent 单次上下文超限中止: rounds=%s roundPromptTokens=%s>%s",
                    loop.rounds,
                    round_prompt_tokens,
                    MAX_PROMPT_TOKENS_PER_REQUEST,
                )
                loop.reply = self._t(
                    "对话内容过多，已停止继续调用工具。请简化指令或重试。",
                    "The conversation is too long, so tool calls have stopped. Simplify the request or try again.",
                )
                loop.speak = True
                loop.outcome = "failed"
                return None
            if loop.prompt_tokens > MAX_SESSION_PROMPT_TOKENS:
                logger.warning(
                    "Agent 会话累计用量超限中止: rounds=%s promptTokens=%s>%s",
                    loop.rounds,
                    loop.prompt_tokens,
                    MAX_SESSION_PROMPT_TOKENS,
                )
                loop.reply = self._t(
                    "本轮对话用量过多，已停止继续调用工具。请稍后重试或简化指令。",
                    "This turn used too many tokens, so tool calls have stopped. Try again later or simplify the request.",
                )
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
            # 名单统一走 audit.CONTROL_TOOL_NAMES：这里此前只认 3 个工具，导致亮度 /
            # 窗帘 / 媒体 / 家庭模式既不计入批量成败，也不写缓存与审计。
            is_control = call.name in CONTROL_TOOL_NAMES
            s0 = _now_ms()
            # ``_call_tool`` 内部已把超时 / 异常收敛成 ``{"error": ...}``，这里不需要再包 try：
            # 旧实现的 ``except Exception`` 永远不会触发（一旦触发就说明工具层契约破了）。
            tool_result = await self._call_tool(ctx, call.name, call.arguments or {})
            ctx.tool_ms += _now_ms() - s0
            # 截断大工具结果后再回填 LLM 上下文，防止实体状态 / 日志撑爆 prompt
            outcome = self._record_tool_result(ctx, call.name, call.arguments, tool_result, truncate=True)
            _emit_tool_progress(on_progress, call, outcome.serialized)
            messages.append(
                LlmMessage(
                    role="tool",
                    tool_call_id=call.id,
                    name=call.name,
                    content=self._wrap_untrusted_tool_result(outcome.serialized),
                )
            )
            # 跟踪本批控制类调用的成功 / 拦截状态
            if is_control:
                batch.has_control = True
                if not outcome.control_ok:
                    batch.all_ok = False
                else:
                    self._remember_targets(ctx, call.name, call.arguments or {}, tool_result)
                if outcome.blocked:
                    batch.any_blocked = True
            # 摄像头快照：工具只回 URL，真正的图片由前端渲染。清空重填保证只带本轮的。
            if isinstance(tool_result, dict) and isinstance(tool_result.get("snapshotUrl"), str):
                ctx.attachments = [
                    {
                        "kind": "image",
                        "url": tool_result["snapshotUrl"],
                        "entityId": tool_result.get("entity_id") or (call.arguments or {}).get("entity_id"),
                        "name": tool_result.get("name"),
                    }
                ]
        return batch

    def _finalize_llm_reply(self, ctx: _ChatRunContext, loop: _LlmLoopResult) -> AgentChatResponse:
        """LLM 循环收尾：统计耗时 / 成本、回写缓存并构造响应。"""
        total_ms = _now_ms() - ctx.start_ms
        provider = str(self._llm.name or "")
        pricing = resolve_pricing(provider)
        estimated_cost_cny = estimate_cost_cny(
            loop.prompt_tokens,
            loop.cached_tokens,
            loop.completion_tokens,
            pricing,
        )
        # 累计日用量：只统计真正打到上游的 LLM 轮次
        if self._budget is not None and loop.rounds > 0:
            self._budget.record(
                self._budget_owner(ctx),
                prompt_tokens=loop.prompt_tokens,
                completion_tokens=loop.completion_tokens,
                cost_cny=estimated_cost_cny,
            )
        logger.info(
            "对话完成: 提供商=%s 模型=%s 轮次=%s 结果=%s 朗读=%s LLM=%sms 工具=%sms 合计=%sms | "
            "令牌 入=%s(缓存=%s) 出=%s ≈¥%.6f（%s）",
            provider,
            self._llm_model(),
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
            pricing.source,
        )
        if loop.earcon:
            earcon: str | None = loop.earcon
        elif loop.outcome == "success":
            earcon = "success"
        elif loop.outcome in ("failed", "blocked"):
            earcon = "error"
        else:
            earcon = None
        # 成功的控制类指令回写缓存（LLM 路径默认待确认，需二次命中才确认）。
        # 名单与执行 / 审计共用 CONTROL_TOOL_NAMES：只写这 3 个会让「把亮度调到 30%」
        # 这类高频指令每次都要重跑 LLM。
        if loop.outcome == "success" and ctx.tool_trace:
            last = ctx.tool_trace[-1]
            if last["name"] in CONTROL_TOOL_NAMES:
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
            provider=provider,
            model=self._llm_model(),
            rounds=loop.rounds,
            tool_calls=ctx.tool_trace,
            timing={"llmMs": ctx.llm_ms, "toolMs": ctx.tool_ms, "totalMs": total_ms},
            usage={
                "promptTokens": loop.prompt_tokens,
                "completionTokens": loop.completion_tokens,
                "cachedTokens": loop.cached_tokens,
                "estimatedCostCNY": estimated_cost_cny,
                "pricingSource": pricing.source,
            },
            attachments=ctx.attachments,
            confirmation=loop.confirmation,
        )

    # 辅助
    async def _resolve_system_prompt(self, ctx: _ChatRunContext | None = None) -> str:
        """解析系统提示：默认模板 + 用户自定义补充 + 语音房间 + 长期偏好。"""
        cfg = await self._agent_config.get_config()
        custom = (cfg.system_prompt or "").strip()
        base = self._L.system_prompt if not custom else f"{self._L.system_prompt}\n\n【用户自定义补充】\n{custom}"
        # 家庭环境（时间 / 天气 / 日出日落）：模型没有时钟，相对时间指令全靠这段。
        env_context = self._env_context
        if env_context is not None:
            try:
                env_text = await env_context.build(self._lang_code())
            except Exception:
                logger.debug("生成家庭环境上下文失败", exc_info=True)
                env_text = ""
            if env_text:
                base = f"{base}\n\n{env_text}"
        if ctx is not None:
            room = str(ctx.options.room or "").strip() if ctx.options else ""
            if room:
                if self._L.lang == "en":
                    base = (
                        f"{base}\n\n[Current voice room] {room}. "
                        'When the user omits the room (e.g. "turn on the light"), '
                        "prefer this room; never control devices in other rooms unless explicitly asked."
                    )
                else:
                    base = (
                        f"{base}\n\n【当前语音房间】{room}。"
                        "用户省略房间（如「开灯」）时优先使用该房间；除非明确要求，不要控制其它房间的设备。"
                    )
        if self._memory is not None and ctx is not None:
            preference = self._memory.preference_text(self._memory_scope(ctx))
            if preference:
                return f"{base}\n\n【用户长期偏好】\n{preference}"
        return base

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

    def _match_query_fast_path(self, text: str) -> dict[str, str] | None:
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
