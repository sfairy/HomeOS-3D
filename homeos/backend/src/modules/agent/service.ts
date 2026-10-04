/**
 * 智能管家核心编排服务。
 *
 * 职责：AgentController 的业务实现，把用户自然语言指令按以下优先级流转：
 *  1) 纠正 / 清除记忆（口令匹配）→ 直接回复
 *  2) 命令缓存命中（已确认）→ 直接执行工具
 *  3) 查询快路径（温度 / 湿度）→ get_area_snapshot 直接回复
 *  4) 控制快路径（开 / 关 / 设温度）→ control_device / control_room
 *  5) LLM tool-calling 多轮循环（最多 maxRounds 轮）
 * 并在成功路径上回写命令缓存，失败路径上清理缓存。
 * 依赖：LlmProvider（注入）、HomeToolsService、FastPathService、CommandCacheService、LangTemplateService、AgentConfigService。
 *  会话上下文分两层：AgentSessionStoreService（10 分钟 / 16 轮，连续对话长上下文）
 *  与 AgentShortTermMemoryService（45s / 2 轮，反问闭环与指代消解）。
 */
import { getEntityDomain } from '@homeos/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { BusinessException, ErrorCode, getErrorMessage, rethrowIfHttpException } from '../../common/utils';
import { HomeToolsService } from './tools/home-tools.service';
import { FastPathService } from './fast-path.service';
import { CommandCacheService } from './command-cache.service';
import {
  LLM_PROVIDER,
  type LlmMessage,
  type LlmProvider,
} from './providers/llm-provider.interface';
import { AgentConfigService } from './config.service';
import { LangTemplateService } from './lang-template.service';
import { AgentSessionStoreService } from './session-store.service';
import { AgentShortTermMemoryService } from './short-term-memory.service';
import type { LangTemplate } from './lang-templates';
import type { AgentActor } from './agent-actor';

/** 对话可选执行上下文 */
type AgentChatOptions = {
  /** 执行身份；控制类工具必须提供，否则 ACL 拒绝 */
  actor?: AgentActor;
  /**
   * 连续对话会话 ID：携带时按会话保存上下文，多轮指令共享历史，
   * 使后续指令可基于上一轮实体 / 意图补全（如「开灯」后「再调暗一点」）。
   */
  sessionId?: string;
  /** 流式进度：token 增量与工具轨迹 */
  onProgress?: (event: AgentProgressEvent) => void;
};

type AgentProgressEvent =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; arguments: Record<string, unknown>; resultPreview?: string };

/**
 * 单轮对话的内部状态（由 chat 创建并透传给 chatInternal）。
 * 用于让确定性路径（快路径 / 缓存命中）执行成功后「重置短时记忆」这一动作
 * 能被外层感知——外层据此跳过本轮短时回写，否则重置会被立即覆盖、失去意义。
 */
type AgentChatInternalState = {
  /** 是否已在本轮成功重置短时记忆 */
  shortTermReset: boolean;
};

/** 输入 token 单价：未命中缓存的（元 / 百万 token） */
const RATE_INPUT_MISS_CNY = 2.0;
/** 输入 token 单价：命中缓存的（更便宜） */
const RATE_INPUT_HIT_CNY = 0.5;
/** 输出 token 单价（元 / 百万 token） */
const RATE_OUTPUT_CNY = 3.0;

/** 单条工具结果回填 LLM 上下文的最大字符数（防止大实体状态 / 日志撑爆上下文） */
const MAX_TOOL_RESULT_CHARS = 4000;
/** 单轮对话累计 prompt token 硬上限：超出即中止工具循环，避免无限膨胀 */
const MAX_SESSION_PROMPT_TOKENS = 30_000;

/** 截断过大的工具结果：保留 JSON 头尾结构，中段省略，兼顾可读性与上下文安全 */
function truncateToolResult(raw: string): string {
  if (raw.length <= MAX_TOOL_RESULT_CHARS) return raw;
  const head = raw.slice(0, Math.floor(MAX_TOOL_RESULT_CHARS * 0.6));
  const tail = raw.slice(-Math.floor(MAX_TOOL_RESULT_CHARS * 0.35));
  return `${head}…[截断 ${raw.length - MAX_TOOL_RESULT_CHARS} 字符]…${tail}`;
}

/**
 * 按 DeepSeek 计费规则估算本次对话成本（人民币）。
 * 未命中缓存部分按原价、命中部分按缓存价、输出按输出价计算，结果保留 6 位小数。
 * @param promptTokens 输入 token 总数
 * @param cachedTokens 其中命中缓存的 token 数
 * @param completionTokens 输出 token 数
 * @returns 估算成本（元）
 */
function estimateCostCNY(
  promptTokens: number,
  cachedTokens: number,
  completionTokens: number,
): number {
  const missTokens = Math.max(0, promptTokens - cachedTokens);
  const cost =
    (missTokens * RATE_INPUT_MISS_CNY +
      cachedTokens * RATE_INPUT_HIT_CNY +
      completionTokens * RATE_OUTPUT_CNY) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * 对话接口返回结构。
 * - reply：回复文本（控制成功时可为空）
 * - outcome：执行结果分类，决定前端提示与音效
 * - timing / usage：性能与成本统计
 */
export interface AgentChatResponse {
  /** 回复文本；控制成功且无需朗读时可为空 */
  reply: string;
  /** 是否需要朗读 reply（查询类 true，控制成功 false） */
  speak: boolean;
  /** 执行结果：answer（纯回答）/ success（控制成功）/ failed（失败）/ blocked（被安全策略拦截） */
  outcome: 'answer' | 'success' | 'failed' | 'blocked';
  /** 音效提示：成功 / 失败 / 无 */
  earcon: 'success' | 'error' | null;
  /** 实际处理方：deepseek / mock / cache / fast-path / fast-query / system */
  provider: string;
  /** LLM 对话轮数（非 LLM 路径为 0 或 1） */
  rounds: number;
  /** 工具调用轨迹，含名称、参数与结果预览 */
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    resultPreview: string;
  }>;
  /** 耗时统计（毫秒） */
  timing: { llmMs: number; toolMs: number; totalMs: number };
  /** token 用量与成本估算 */
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    estimatedCostCNY: number;
  };
}

/**
 * 智能管家服务（@Injectable）。
 * 通过 @Inject(LLM_PROVIDER) 注入由 ResolvingLlmProvider 提供的 LlmProvider。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');
  /** LLM tool-calling 最大轮数，避免无限循环 */
  private readonly maxRounds = 8;

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly tools: HomeToolsService,
    private readonly fastPath: FastPathService,
    private readonly cmdCache: CommandCacheService,
    private readonly langTemplates: LangTemplateService,
    private readonly agentConfig: AgentConfigService,
    private readonly sessions: AgentSessionStoreService,
    private readonly shortTerm: AgentShortTermMemoryService,
  ) {}

  /** 当前语言模板（口令、回复模板、系统提示） */
  private get L(): LangTemplate {
    return this.langTemplates.current;
  }

  /**
   * 返回当前 LLM 提供商信息（名称 + 就绪状态），不触发刷新。
   * @returns provider 提供商名，ready 是否就绪
   */
  getProviderInfo(): { provider: string; ready: boolean } {
    return { provider: this.llm.name, ready: this.llm.isReady() };
  }

  /** 重新读取配置并刷新 LLM，供 ping / 保存后检测使用 */
  async pingProvider(): Promise<{ provider: string; ready: boolean }> {
    this.agentConfig.invalidateCache();
    const resolving = this.llm as LlmProvider & { refresh?: () => Promise<void> };
    if (typeof resolving.refresh === 'function') {
      await resolving.refresh();
    }
    return this.getProviderInfo();
  }
  /**
   * 把客户端自带的 sessionId 收敛为「按登录身份隔离」的服务端会话 key。
   *
   * 为什么必须做：`sessionId` 完全由调用方提供且不与用户绑定——HTTP 侧是前端生成的 UUID
   * （最长 64 字符、无校验），MCP 侧直接是 `mcp:<ip>`。若不隔离，同一 NAT 出口下的两个账号、
   * 或碰巧复用了同一 sessionId 的两个账号会共享同一个上下文窗口：
   * A 刚被反问「是否为您打开书房空调？」，B 随后说「打开吧」就会被消解成 A 的设备
   * （动作本身仍走 B 自己的 ACL，因此是上下文串味而非越权，但同样不该发生）。
   *
   * 该 key 同时用于 10 分钟会话存储与 45 秒短时记忆，保证两者隔离口径一致。
   * 没有身份信息时退回 `anon`：与隔离前的行为等价，不会把未绑定身份的调用者聚到同一人上。
   * @param options 对话执行上下文
   * @returns 作用域化后的会话 key；未提供 sessionId 时返回 undefined（不启用会话）
   */
  private scopeSessionId(options?: AgentChatOptions): string | undefined {
    const raw = options?.sessionId?.trim();
    if (!raw) return undefined;
    const owner = options?.actor?.userId || options?.actor?.username || 'anon';
    return `${owner}:${raw}`;
  }

  /**
   * 智能管家对话主入口。
   * 支持连续对话：携带 sessionId 时，从会话存储补全历史并记录本轮上下文，
   * 使同一会话的多轮指令（如「开灯」→「再调暗一点」）能基于上一轮实体 / 意图执行。
   * @param userMessage 本轮用户输入
   * @param history 多轮上下文（可选；有 sessionId 且服务端会话非空时用服务端历史，否则用此 history）
   * @param options 执行上下文（actor / sessionId）
   * @returns 对话响应（回复、结果、耗时、用量）
   */
  async chat(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options?: AgentChatOptions,
  ): Promise<AgentChatResponse> {
    // 会话 key 先按登录身份隔离，再进入会话存储 / 短时记忆；
    // 后续所有读写（含 chatInternal 里的 clear）都必须用这个作用域化后的 key
    const sessionId = this.scopeSessionId(options);
    const scopedOptions: AgentChatOptions | undefined = options
      ? { ...options, sessionId }
      : undefined;
    // 连续对话：服务端会话优先；过期/空会话时回退前端 history，避免「再调暗一点」丢上下文
    let effectiveHistory = history;
    if (sessionId) {
      const stored = this.sessions.get(sessionId);
      if (stored.length > 0) effectiveHistory = stored;
    }
    // 短时记忆（45s / 2 轮）追加在末尾：保证上一轮管家的反问句紧邻当前输入，
    // 用户回「打开吧」「好」这类省略短语时才能正确消解指代
    effectiveHistory = this.mergeShortTermHistory(effectiveHistory, sessionId);
    const state: AgentChatInternalState = { shortTermReset: false };
    const result = await this.chatInternal(userMessage, effectiveHistory, scopedOptions, state);
    // 记录本轮上下文（清除记忆口令除外），供后续指令补全实体 / 意图
    if (sessionId && userMessage.trim() !== this.L.clearMemory) {
      const sessionSummary = this.buildSessionSummary(result);
      this.sessions.pushTurn(sessionId, userMessage, sessionSummary);
      // 短时记忆同样记录一轮（含管家的反问句与执行完成话术）；
      // 但确定性路径已重置上下文时跳过，避免把上一意图重新写回窗口
      if (!state.shortTermReset) {
        // 优先复用会话摘要：两个存储对同一轮若写入不同文本，下一轮
        // mergeShortTermHistory 的「已是历史后缀」等值判定就会落空，
        // 导致上一轮 user 消息被重复注入 prompt。仅在会话摘要为空时补完成话术。
        this.shortTerm.appendTurn(
          sessionId,
          userMessage,
          sessionSummary || this.buildShortTermSummary(result),
        );
      }
    }
    return result;
  }

  /**
   * 合并「长会话历史」与「短时记忆」。
   *
   * 短时记忆的内容通常已被 10 分钟会话历史覆盖，直接拼接会让最近两轮重复出现；
   * 因此先判断短时记忆是否已是历史末尾的连续后缀，是则原样返回，否则追加到末尾，
   * 以此保证（a）不重复占用 token，（b）上一轮反问句始终紧邻当前输入。
   * @param history 来自 AgentSessionStoreService / 前端的有效历史
   * @param sessionId 会话 ID（缺省不合并）
   * @returns 合并后的历史
   */
  private mergeShortTermHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    sessionId?: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (!sessionId) return history;
    const recent = this.shortTerm.getHistory(sessionId);
    if (recent.length === 0) return history;
    // 短时记忆已是历史末尾连续后缀 → 无需重复追加
    const offset = history.length - recent.length;
    const alreadySuffix =
      offset >= 0 &&
      recent.every(
        (turn, i) =>
          history[offset + i]?.role === turn.role &&
          history[offset + i]?.content === turn.content,
      );
    if (alreadySuffix) return history;
    return [...history, ...recent];
  }

  /**
   * 构造写入短时记忆的 assistant **兜底**文本（仅在 `buildSessionSummary` 返回空时使用）。
   *
   * 正常情况下短时记忆会直接复用会话摘要，两者文本一致，
   * `mergeShortTermHistory` 的「已是历史后缀」等值判定才能命中、避免重复注入。
   * 这里只负责会话摘要为空、但短时窗口仍需语境时的补位：执行成功但无工具调用摘要时
   * 补一句完成话术；反问句（reply 非空）由会话摘要分支覆盖。
   * @param res 对话结果
   * @returns 摘要文本；无可记录内容时返回空串（调用方会跳过写入）
   */
  private buildShortTermSummary(res: AgentChatResponse): string {
    if (res.reply?.trim()) return res.reply.trim().slice(0, 500);
    if (res.outcome === 'success') return '好的，已为您执行完成。';
    return '';
  }

  /**
   * 将一轮对话结果压缩为会话历史中的 assistant 摘要。
   * 优先使用回复文本；控制成功且无回复时用工具调用摘要，便于后续指令理解上文动作。
   * @param res 对话结果
   * @returns 摘要文本，无可记录内容时返回 null
   */
  private buildSessionSummary(res: AgentChatResponse): string | null {
    if (res.reply?.trim()) return res.reply.trim().slice(0, 500);
    if (res.toolCalls.length > 0) {
      const summary = res.toolCalls
        .map((c) => `${c.name}(${JSON.stringify(c.arguments ?? {}).slice(0, 200)})`)
        .join('；');
      return summary ? `（已执行）${summary}` : null;
    }
    return null;
  }

  /**
   * 智能管家对话主逻辑（内部实现，不处理会话上下文）。
   * 依次走 纠正/清除 → 命令缓存 → 查询快路径 → 控制快路径 → LLM tool-calling，
   * 成功路径回写缓存，失败路径清理缓存，最终返回 AgentChatResponse。
   * @param userMessage 本轮用户输入
   * @param history 多轮上下文（可选）
   * @param options 执行上下文（actor / sessionId）
   * @returns 对话响应（回复、结果、耗时、用量）
   */
  private async chatInternal(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options?: AgentChatOptions,
    state: AgentChatInternalState = { shortTermReset: false },
  ): Promise<AgentChatResponse> {
    const actor = options?.actor;
    const t0 = Date.now();
    let llmMs = 0;
    let toolMs = 0;
    const toolTrace: AgentChatResponse['toolCalls'] = [];

    // 1) 纠正 / 清除记忆口令：命中则直接返回系统回复，不走后续流程
    const isCorrection = this.L.correctionCommands.test(userMessage.trim());
    const isClear = userMessage.trim() === this.L.clearMemory;

    if (isCorrection || isClear) {
      if (isClear) {
        this.cmdCache.clear(actor?.userId);
        if (options?.sessionId) {
          this.sessions.clear(options.sessionId);
          // 短时记忆一并清空，避免遗留的反问语境在「忘掉一切」后继续生效
          this.shortTerm.clear(options.sessionId);
        }
        return this.emptySystemReply('已经把所有学到的指令忘掉了，像刚认识一样。');
      }
      // 纠正：删除最近一条缓存，用其原话作为新指令继续走后续流程
      const last = this.cmdCache.correctLast(actor?.userId);
      if (last) {
        userMessage = last;
      } else {
        return this.emptySystemReply('没有需要纠正的指令哦。');
      }
    }

    // 2) 命令缓存命中：已确认直接执行工具；待确认则提示用户确认，不直接执行
    const cached = this.cmdCache.get(userMessage, actor?.userId);
    if (cached) {
      // 待确认缓存（LLM 路径首次学习、尚未二次验证）：
      // 不直接执行工具，向用户返回确认提示；同时提升为已确认，下次相同指令直接执行。
      if (cached.confirmed === false) {
        this.cmdCache.confirm(userMessage, actor?.userId);
        const totalMs = Date.now() - t0;
        this.logger.log(
          `缓存待确认,提示用户确认: ${cached.toolName} total=${totalMs}ms`,
        );
        return {
          reply: this.L.cacheConfirmPrompt.replace('{tool}', cached.toolName),
          speak: true,
          outcome: 'answer',
          earcon: null,
          provider: 'cache',
          rounds: 0,
          toolCalls: [],
          timing: { llmMs: 0, toolMs: 0, totalMs },
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            estimatedCostCNY: 0,
          },
        };
      }
      // 已确认（confirmed === true）：直接执行工具，跳过 LLM
      const s0 = Date.now();
      const toolResult = await this.tools.execute(cached.toolName, cached.toolArgs, actor);
      toolMs = Date.now() - s0;
      const ok =
        cached.toolName === 'control_device' || cached.toolName === 'activate_scene'
          ? toolResult?.success === true
          : typeof toolResult.total === 'number' &&
            toolResult.total > 0 &&
            toolResult.affected === toolResult.total;
      if (ok) {
        const serialized = JSON.stringify(toolResult);
        toolTrace.push({
          name: cached.toolName,
          arguments: cached.toolArgs,
          resultPreview: serialized.slice(0, 200),
        });
        const totalMs = Date.now() - t0;
        this.logger.log(
          `缓存命中: ${cached.toolName} total=${totalMs}ms hitCount=${cached.hitCount}`,
        );
        // 独立完整的指令已执行完毕，重置短时记忆，杜绝跨意图污染
        if (options?.sessionId) {
          this.shortTerm.clear(options.sessionId);
          state.shortTermReset = true;
        }
        return {
          reply: '',
          speak: false,
          outcome: 'success',
          earcon: 'success',
          provider: 'cache',
          rounds: 0,
          toolCalls: toolTrace,
          timing: { llmMs: 0, toolMs, totalMs },
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            estimatedCostCNY: 0,
          },
        };
      }
      // 缓存执行失败：设备可能已变更，删除过期缓存后降级到快路径 / LLM
      this.logger.warn(
        `缓存失败(设备可能已变更),删除过期缓存,降级→快路径/LLM: "${userMessage}"`,
      );
      this.cmdCache.delete(userMessage, actor?.userId);
    }

    // 3) 查询快路径：温度 / 湿度询问直接读传感器回复
    const queryFast = this.matchQueryFastPath(userMessage);
    if (queryFast) {
      const s0 = Date.now();
      const snap = await this.tools.execute(
        'get_area_snapshot',
        {
          area_id: queryFast.roomName,
        },
        actor,
      );
      toolMs = Date.now() - s0;
      const sensors = snap?.sensors as
        | {
            temperature?: { value?: string };
            humidity?: { value?: string };
          }
        | undefined;
      if (queryFast.type === 'temperature' && sensors?.temperature?.value) {
        return {
          reply: this.L.tempReplyTemplate
            .replace('{room}', queryFast.roomName)
            .replace('{value}', String(sensors.temperature.value)),
          speak: true,
          outcome: 'answer',
          earcon: null,
          provider: 'fast-query',
          rounds: 0,
          toolCalls: [
            {
              name: 'get_area_snapshot',
              arguments: { area_id: queryFast.roomName },
              resultPreview: '',
            },
          ],
          timing: { llmMs: 0, toolMs, totalMs: Date.now() - t0 },
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            estimatedCostCNY: 0,
          },
        };
      }
      if (queryFast.type === 'humidity' && sensors?.humidity?.value) {
        return {
          reply: this.L.humidityReplyTemplate
            .replace('{room}', queryFast.roomName)
            .replace('{value}', String(sensors.humidity.value)),
          speak: true,
          outcome: 'answer',
          earcon: null,
          provider: 'fast-query',
          rounds: 0,
          toolCalls: [
            {
              name: 'get_area_snapshot',
              arguments: { area_id: queryFast.roomName },
              resultPreview: '',
            },
          ],
          timing: { llmMs: 0, toolMs, totalMs: Date.now() - t0 },
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            estimatedCostCNY: 0,
          },
        };
      }
    }
    // 4) 控制快路径：规则解析为 control_device / control_room / activate_scene 直接执行
    const fast = await this.fastPath.tryParse(userMessage);
    if (fast) {
      const s0 = Date.now();
      let toolName: string;
      let toolArgs: Record<string, unknown>;
      if (fast.kind === 'device') {
        toolName = 'control_device';
        toolArgs = {
          domain: getEntityDomain(fast.entityId),
          service: fast.service,
          entity_id: fast.entityId,
        };
        if (fast.serviceData) toolArgs.service_data = fast.serviceData;
      } else if (fast.kind === 'scene') {
        // 白名单内的 HA 场景 / 脚本：FastPathService 已做闸门过滤，这里直接触发
        toolName = 'activate_scene';
        toolArgs = { scene: fast.sceneName, entity_id: fast.entityId };
      } else {
        toolName = 'control_room';
        toolArgs = {
          room: fast.roomName,
          domain: fast.domain,
          service: fast.service,
        };
      }
      const toolResult = await this.tools.execute(toolName, toolArgs, actor);
      toolMs = Date.now() - s0;
      const serialized = JSON.stringify(toolResult);
      toolTrace.push({
        name: toolName,
        arguments: toolArgs,
        resultPreview: serialized.slice(0, 200),
      });
      const ok =
        fast.kind === 'device' || fast.kind === 'scene'
          ? toolResult?.success === true
          : typeof toolResult.total === 'number' &&
            toolResult.total > 0 &&
            toolResult.affected === toolResult.total;
      const blocked =
        toolResult?.blocked === true ||
        (Array.isArray(toolResult?.results) &&
          (toolResult.results as Array<{ blocked?: boolean }>).some((r) => r?.blocked));
      const totalMs = Date.now() - t0;
      this.logger.log(
        `快路径: ${toolName} total=${totalMs}ms ok=${ok} blocked=${blocked}`,
      );
      // 控制成功则回写缓存（快路径默认 confirmed）
      if (ok) {
        this.cmdCache.tryAutoCorrect(userMessage, toolName, toolArgs, actor?.userId);
        this.cmdCache.set(userMessage, toolName, toolArgs, true, actor?.userId);
        // 快路径是独立完整的指令执行，成功后重置短时记忆，杜绝跨意图污染
        if (options?.sessionId) {
          this.shortTerm.clear(options.sessionId);
          state.shortTermReset = true;
        }
      }
      return {
        reply: '',
        speak: false,
        outcome: ok ? 'success' : blocked ? 'blocked' : 'failed',
        earcon: ok ? 'success' : 'error',
        provider: 'fast-path',
        rounds: 1,
        toolCalls: toolTrace,
        timing: { llmMs: 0, toolMs, totalMs },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          estimatedCostCNY: 0,
        },
      };
    }

    // 5) 兜底：构造 LLM 对话，进入 tool-calling 多轮循环
    // 截取最近 16 条有效历史，单条限长 2000，避免上下文膨胀
    const prior = history
      .filter((h) => (h.role === 'user' || h.role === 'assistant') && String(h.content || '').trim())
      .slice(-16)
      .map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: String(h.content).slice(0, 2000),
      }));

    const messages: LlmMessage[] = [
      { role: 'system', content: await this.resolveSystemPrompt() },
      ...prior,
      { role: 'user', content: userMessage },
    ];
    const toolSchemas = this.tools.getToolSchemas();
    let rounds = 0;
    let reply = '';
    let speak = true;
    let outcome: AgentChatResponse['outcome'] = 'answer';
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    // tool-calling 循环：每轮调用 LLM，若有 tool_calls 则执行后回填，直到无 tool_calls 或达到上限
    while (rounds < this.maxRounds) {
      rounds++;
      const l0 = Date.now();
      let result;
      try {
        result = await this.llm.chat(messages, toolSchemas, {
          onToken: options?.onProgress
            ? (text) => options.onProgress?.({ type: 'token', text })
            : undefined,
        });
      } catch (e: unknown) {
        // 业务 / HTTP 异常透传，其余包装为 LLM 上游错误
        rethrowIfHttpException(e);
        throw new BusinessException(
          ErrorCode.EXTERNAL_ERROR,
          API_ERROR.AGENT_LLM_UPSTREAM_ERROR('unknown', getErrorMessage(e)),
        );
      }
      llmMs += Date.now() - l0;
      if (result.usage) {
        promptTokens += result.usage.promptTokens;
        completionTokens += result.usage.completionTokens;
        cachedTokens += result.usage.cachedTokens ?? 0;
      }
      // 每会话 prompt token 硬上限：累计超限即中止工具循环，避免上下文无限膨胀
      if (promptTokens > MAX_SESSION_PROMPT_TOKENS) {
        this.logger.warn(
          `Agent 会话上下文超限中止: rounds=${rounds} promptTokens=${promptTokens}>${MAX_SESSION_PROMPT_TOKENS}`,
        );
        reply = '对话内容过多，已停止继续调用工具。请简化指令或重试。';
        speak = true;
        outcome = 'failed';
        break;
      }
      // 无工具调用：本轮为最终文本回复，结束循环
      if (!result.toolCalls || result.toolCalls.length === 0) {
        reply = result.content ?? '';
        speak = true;
        break;
      }
      // 有工具调用：把 assistant 消息（含 tool_calls）追加到上下文
      messages.push({
        role: 'assistant',
        content: result.content ?? '',
        tool_calls: result.toolCalls,
      });
      // 过滤掉缺关键参数的调用（control_room 缺 room / control_device 缺 entity_id）
      const effective = result.toolCalls.filter((c) => {
        if (c.name === 'control_room') return c.arguments?.room;
        if (c.name === 'control_device') return c.arguments?.entity_id;
        return true;
      });
      const calls = effective.length > 0 ? effective : result.toolCalls;
      let batchHasControl = false;
      let batchAllOk = true;
      let batchAnyBlocked = false;
      // 逐个执行工具调用并回填结果
      for (const call of calls) {
        const isControl =
          call.name === 'control_device' ||
          call.name === 'control_room' ||
          call.name === 'activate_scene';
        const s0 = Date.now();
        let toolResult: Record<string, unknown>;
        try {
          toolResult = await this.tools.execute(call.name, call.arguments ?? {}, actor);
        } catch (e: unknown) {
          toolResult = {
            error: e instanceof Error ? e.message : '工具执行异常',
          };
        }
        toolMs += Date.now() - s0;
        // 截断大工具结果后再回填 LLM 上下文，防止实体状态 / 日志撑爆 prompt
        const serialized = truncateToolResult(JSON.stringify(toolResult));
        toolTrace.push({
          name: call.name,
          arguments: call.arguments,
          resultPreview: serialized.slice(0, 200),
        });
        options?.onProgress?.({
          type: 'tool',
          name: call.name,
          arguments: call.arguments,
          resultPreview: serialized.slice(0, 200),
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: serialized,
        });
        // 跟踪本批控制类调用的成功 / 拦截状态
        if (isControl) {
          batchHasControl = true;
          if (!this.isControlSuccess(call.name, toolResult)) batchAllOk = false;
          if (this.isBlocked(toolResult)) batchAnyBlocked = true;
        }
      }
      // 本批控制全部成功：结束循环，标记 success
      if (batchHasControl && batchAllOk) {
        reply = '';
        speak = false;
        outcome = 'success';
        break;
      }
      // 本批控制存在失败：标记 failed / blocked，但仍继续循环让 LLM 决定是否重试 / 回复
      if (batchHasControl && !batchAllOk) {
        outcome = batchAnyBlocked ? 'blocked' : 'failed';
      }
    }
    // 循环结束但需要朗读且无回复：兜底提示
    if (speak && !reply) {
      reply = '（未能完成，请重试或换个说法）';
      if (outcome === 'answer') outcome = 'failed';
    }

    const totalMs = Date.now() - t0;
    const estimatedCostCNY = estimateCostCNY(promptTokens, cachedTokens, completionTokens);
    this.logger.log(
      `对话完成: 提供商=${this.llm.name} 轮次=${rounds} 结果=${outcome} 朗读=${speak ? '是' : '否'} ` +
        `LLM=${llmMs}ms 工具=${toolMs}ms 合计=${totalMs}ms | 令牌 入=${promptTokens}(缓存=${cachedTokens}) 出=${completionTokens} ≈¥${estimatedCostCNY.toFixed(6)}`,
    );

    const earcon =
      outcome === 'success'
        ? 'success'
        : outcome === 'failed' || outcome === 'blocked'
          ? 'error'
          : null;

    // 成功的控制类指令回写缓存（LLM 路径默认待确认，需二次命中才确认）
    if (outcome === 'success' && toolTrace.length > 0) {
      const last = toolTrace[toolTrace.length - 1];
      if (
        last.name === 'control_device' ||
        last.name === 'control_room' ||
        last.name === 'activate_scene'
      ) {
        this.cmdCache.tryAutoCorrect(userMessage, last.name, last.arguments, actor?.userId);
        this.cmdCache.set(userMessage, last.name, last.arguments, false, actor?.userId);
      }
    }

    return {
      reply,
      speak,
      outcome,
      earcon,
      provider: this.llm.name,
      rounds,
      toolCalls: toolTrace,
      timing: { llmMs, toolMs, totalMs },
      usage: { promptTokens, completionTokens, cachedTokens, estimatedCostCNY },
    };
  }

  /**
   * 解析系统提示：默认模板 + 用户自定义补充（来自 AgentConfig）。
   * @returns 拼接后的系统提示
   */
  private async resolveSystemPrompt(): Promise<string> {
    const cfg = await this.agentConfig.getConfig();
    const custom = cfg.systemPrompt?.trim();
    if (!custom) return this.L.systemPrompt;
    return `${this.L.systemPrompt}\n\n【用户自定义补充】\n${custom}`;
  }

  /**
   * 构造一个空的系统回复（provider=system，无工具调用、无耗时）。
   * 用于纠正 / 清除记忆等直接回复场景。
   * @param reply 回复文本
   * @returns AgentChatResponse
   */
  private emptySystemReply(reply: string): AgentChatResponse {
    return {
      reply,
      speak: true,
      outcome: 'answer',
      earcon: null,
      provider: 'system',
      rounds: 0,
      toolCalls: [],
      timing: { llmMs: 0, toolMs: 0, totalMs: 0 },
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        estimatedCostCNY: 0,
      },
    };
  }

  /**
   * 匹配查询快路径（温度 / 湿度询问）。
   * @param text 用户原话
   * @returns 房间名与查询类型，不匹配返回 null
   */
  private matchQueryFastPath(
    text: string,
  ): { roomName: string; type: 'temperature' | 'humidity' } | null {
    const t = text.trim();
    let m = t.match(this.L.tempQuery);
    if (m) {
      const roomPart = (m[1] || m[3] || '').replace(/[的]+/g, '').trim();
      if (roomPart.length >= 1) return { roomName: roomPart, type: 'temperature' };
    }
    m = t.match(this.L.humidityQuery);
    if (m) {
      const roomPart = (m[1] || '').replace(/[的]+/g, '').trim();
      if (roomPart.length >= 1) return { roomName: roomPart, type: 'humidity' };
    }
    return null;
  }

  /**
   * 判定一次控制调用是否成功。
   * - control_device：success === true
   * - control_room：total > 0 且 affected === total
   * @param name 工具名
   * @param r 工具结果
   * @returns 是否成功
   */
  private isControlSuccess(name: string, r: Record<string, unknown>): boolean {
    if (!r || r.error) return false;
    if (name === 'control_device') return r.success === true;
    // HA 场景 / 脚本：activate_scene 返回 { success, entity_id, ... }
    if (name === 'activate_scene') return r.success === true && r.blocked !== true;
    if (name === 'control_room') {
      return typeof r.total === 'number' && r.total > 0 && r.affected === r.total;
    }
    return false;
  }

  /**
   * 判定工具结果是否包含被安全策略拦截的设备。
   * @param r 工具结果
   * @returns 是否被拦截
   */
  private isBlocked(r: Record<string, unknown>): boolean {
    if (!r) return false;
    if (r.blocked === true) return true;
    if (Array.isArray(r.results)) {
      return (r.results as Array<{ blocked?: boolean }>).some((x) => x?.blocked);
    }
    return false;
  }
}