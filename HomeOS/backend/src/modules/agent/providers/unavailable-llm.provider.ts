/**
 * 未配置 LLM 时的占位提供商。
 *
 * 所属模块：backend/modules/agent/providers
 * 职责：在生产环境（NODE_ENV=production）且未配置真实 API Key、且 AGENT_ALLOW_MOCK=false
 *  时由 ResolvingLlmProvider 选中，保证 ResolvingLlmProvider 永不返回 mock。
 *  任何 chat 调用均抛 CONFIG_ERROR，让上层感知「智能管家不可用」并提示用户配置 LLM。
 * 依赖：llm-provider.interface（接口）、BusinessException / API_ERROR（错误归一化）。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { BusinessException, ErrorCode } from '../../../common/utils';
import type {
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolSchema,
} from './llm-provider.interface';

/**
 * 占位 LLM 提供商（@Injectable）。
 * 永远 not ready，任何 chat 调用均抛异常，确保生产环境未配置时不静默回退到 mock。
 */
@Injectable()
export class UnavailableLlmProvider implements LlmProvider {
  /** 提供商名，固定为 unavailable */
  readonly name = 'unavailable';

  /** 永不就绪：让上层 AgentService 在 pingProvider / getProviderInfo 时直接暴露状态 */
  isReady(): boolean {
    return false;
  }

  /**
   * 直接抛 CONFIG_ERROR 业务异常。
   * 不读取 messages / tools / opts，避免在不可用状态下被误用。
   * @throws BusinessException ErrorCode.CONFIG_ERROR + AGENT_LLM_NOT_CONFIGURED
   */
  async chat(
    _messages: LlmMessage[],
    _tools: LlmToolSchema[],
    _opts?: { onToken?: (text: string) => void },
  ): Promise<LlmChatResult> {
    throw new BusinessException(ErrorCode.CONFIG_ERROR, API_ERROR.AGENT_LLM_NOT_CONFIGURED);
  }
}
