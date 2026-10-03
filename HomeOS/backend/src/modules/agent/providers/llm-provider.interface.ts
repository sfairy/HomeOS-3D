/**
 * LLM 提供商接口与消息类型定义。
 *
 * 所属模块：backend/modules/agent/providers
 * 职责：定义智能管家与大语言模型之间的统一抽象（LlmProvider），
 *  让 AgentService 不感知具体是 deepseek 还是 mock，由 ResolvingLlmProvider 在运行时切换。
 * 依赖：被 deepseek-llm.provider / mock-llm.provider / resolving-llm.provider 实现。
 */

/** 依赖注入 Token：用于 @Inject(LLM_PROVIDER) 注入 LlmProvider 实现 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * LLM 对话消息（OpenAI 风格 role 区分）。
 * - system / user：普通文本消息
 * - assistant：可带 tool_calls 数组，表示模型要求调用工具
 * - tool：工具执行结果回填，需带 tool_call_id 关联到对应调用
 */
export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: LlmToolCall[];
    }
  | {
      role: 'tool';
      tool_call_id: string;
      name: string;
      content: string;
    };

/** 一次工具调用请求：模型生成，由 AgentService 执行后回填结果 */
export interface LlmToolCall {
  /** 调用 ID，用于把工具结果关联回这次调用 */
  id: string;
  /** 工具名，如 control_device / search_entities */
  name: string;
  /** 工具入参（已解析的对象） */
  arguments: Record<string, unknown>;
}

/** 工具的 JSON Schema 描述，暴露给 LLM 供其选择调用 */
export interface LlmToolSchema {
  /** 工具名 */
  name: string;
  /** 工具用途说明，供 LLM 理解何时调用 */
  description: string;
  /** JSON Schema 形态的入参定义 */
  parameters: Record<string, unknown>;
}

/** 单次对话的 token 用量统计，用于成本估算 */
interface LlmUsage {
  /** 输入 token 数（含 system prompt 与历史） */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 命中提供商 prompt 缓存的 token 数（计费更便宜） */
  cachedTokens?: number;
}

/** 一次 chat 调用的返回：文本回复 + 可选工具调用 + 用量统计 */
export interface LlmChatResult {
  /** 模型文本回复，无工具调用时必填 */
  content?: string | null;
  /** 模型要求执行的工具调用列表 */
  toolCalls?: LlmToolCall[];
  /** token 用量 */
  usage?: LlmUsage;
}

/**
 * LLM 提供商统一接口。
 * 实现方需暴露 name / isReady / chat，由 ResolvingLlmProvider 在 mock 与真实提供商间切换。
 */
export interface LlmProvider {
  /** 提供商名（如 deepseek / mock），用于日志与 provider 字段 */
  name: string;
  /** 是否就绪（如 API Key 已配置），未就绪时 chat 会抛异常 */
  isReady(): boolean;
  /**
   * 执行一次对话。
   * @param messages 完整对话历史（system + 历史 + 本轮 user）
   * @param tools 可用工具 schema 列表
   * @param opts.onToken 流式 token 回调；提供时实现方可走 SSE
   * @returns 文本回复 / 工具调用 / token 用量
   */
  chat(
    messages: LlmMessage[],
    tools: LlmToolSchema[],
    opts?: { onToken?: (text: string) => void },
  ): Promise<LlmChatResult>;
}