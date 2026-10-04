/**
 * DeepSeek LLM 提供商。
 *
 * 职责：把 LlmProvider 接口适配到 DeepSeek 兼容的 OpenAI 风格 /chat/completions 接口。
 *  - 把 LlmMessage 转成 OpenAI 消息格式（含 tool_calls / tool 结果）
 *  - 把 LlmToolSchema 转成 OpenAI function tool 描述
 *  - 解析 choices / usage，归一化返回 LlmChatResult
 *  - 支持 prompt 缓存命中 token 统计（用于成本估算）
 * 依赖：llm-provider.interface（接口）、BusinessException / API_ERROR（错误归一化）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { BusinessException, ErrorCode } from '../../../common/utils';
import type { LlmChatResult, LlmMessage, LlmProvider, LlmToolSchema } from './llm-provider.interface';

/**
 * DeepSeek LLM 提供商（@Injectable）。
 * 由 ResolvingLlmProvider 在配置了真实 API Key 时创建 / 更新。
 */
@Injectable()
export class DeepseekLlmProvider implements LlmProvider {
  /** 提供商名，固定为 deepseek */
  readonly name = 'deepseek';
  private readonly logger = new Logger('DeepSeekLLM');
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(cfg: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = cfg.apiKey || '';
    this.model = cfg.model || 'deepseek-chat';
    this.baseUrl = cfg.baseUrl || 'https://api.deepseek.com';
  }

  /** 配置热更新（SYSTEM_CONFIG_UPDATED 后重建时使用） */
  updateConfig(cfg: { apiKey?: string; model?: string; baseUrl?: string }): void {
    this.apiKey = cfg.apiKey || '';
    this.model = cfg.model || 'deepseek-chat';
    this.baseUrl = cfg.baseUrl || 'https://api.deepseek.com';
  }

  /** 是否就绪：API Key 非空即视为就绪 */
  isReady(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * 调用 DeepSeek 对话接口。
   * @param messages 已转换为 OpenAI 格式前的内部消息
   * @param tools 可用工具 schema
   * @returns 文本回复 / 工具调用 / token 用量；未配置或上游异常时抛 BusinessException
   * @throws BusinessException CONFIG_ERROR（未配置）/ EXTERNAL_ERROR（上游错误 / 响应非法）
   */
  async chat(
    messages: LlmMessage[],
    tools: LlmToolSchema[],
    opts?: { onToken?: (text: string) => void },
  ): Promise<LlmChatResult> {
    if (!this.isReady()) {
      throw new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.AGENT_LLM_NOT_CONFIGURED);
    }

    const oaMessages = messages.map((m) => {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || '',
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: m.tool_call_id,
          content: m.content,
        };
      }
      return { role: m.role, content: m.content };
    });

    const oaTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const payload = {
      model: this.model,
      messages: oaMessages,
      tools: oaTools.length ? oaTools : undefined,
      tool_choice: oaTools.length ? 'auto' : undefined,
      temperature: 0.3,
      stream: Boolean(opts?.onToken),
    };

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.AGENT_LLM_UPSTREAM_ERROR(resp.status, text.slice(0, 300)),
      );
    }

    if (opts?.onToken && resp.body) {
      return this.consumeChatStream(resp, opts.onToken);
    }

    const data = (await resp.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const msg = data?.choices?.[0]?.message;
    if (!msg) {
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.AGENT_LLM_RESPONSE_INVALID,
      );
    }

    const u = data?.usage;
    const usage = u
      ? {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          cachedTokens:
            u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : undefined;

    if (msg.tool_calls?.length) {
      return {
        content: msg.content ?? null,
        usage,
        toolCalls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function?.name || '',
          arguments: safeParse(tc.function?.arguments),
        })),
      };
    }

    return { content: msg.content ?? '', usage };
  }

  private async consumeChatStream(
    resp: Response,
    onToken: (text: string) => void,
  ): Promise<LlmChatResult> {
    const reader = resp.body?.getReader();
    if (!reader) {
      throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.AGENT_LLM_UPSTREAM_ERROR('deepseek', '响应无正文'));
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: LlmChatResult['usage'];

    const flushLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      let json: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_cache_hit_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      try {
        json = JSON.parse(payload) as typeof json;
      } catch {
        return;
      }
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) {
        content += delta.content;
        onToken(delta.content);
      }
      for (const tc of delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const prev = toolAcc.get(idx) ?? { id: '', name: '', arguments: '' };
        if (tc.id) prev.id = tc.id;
        if (tc.function?.name) prev.name += tc.function.name;
        if (tc.function?.arguments) prev.arguments += tc.function.arguments;
        toolAcc.set(idx, prev);
      }
      const u = json.usage;
      if (u) {
        usage = {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          cachedTokens:
            u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) flushLine(line);
    }
    if (buffer.trim()) flushLine(buffer);

    const toolCalls = [...toolAcc.values()]
      .filter((t) => t.name)
      .map((t) => ({
        id: t.id || t.name,
        name: t.name,
        arguments: safeParse(t.arguments),
      }));
    if (toolCalls.length) return { content: content || null, usage, toolCalls };
    return { content, usage };
  }
}

/**
 * 容错解析 LLM 返回的 tool_call arguments 字符串。
 * 解析失败时返回空对象，避免单个调用 JSON 非法导致整轮对话崩溃。
 * @param s JSON 字符串
 * @returns 解析后的对象
 */
function safeParse(s: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}