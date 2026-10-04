/**
 * @file voice-stt.helper.ts
 * @module awareness
 * @description 语音转写（STT）helper。根据配置选择前端 Web Speech / HA 实体 / 自动回退三种模式，
 * 提供文本转写与 HA 对话流程处理（processHaConversation）。
 *
 * 关键策略：
 *  - resolveSttEntity：优先使用配置的 STT 实体，缺省取首个非 unavailable 的 STT provider
 *  - transcribeVoiceAudio：按 sttMode 分发——browser 不需后端、ha 调用 STT 实体、auto 先 ha 后回退
 *  - processHaConversation：调用 HA conversation 代理完成语义解析，失败时抛 BusinessException
 *
 * 依赖（VoiceSttDeps）：
 *  - haConnector：调用 HA STT / conversation 服务
 *  - getVoiceConfig：提供 sttMode / sttEntityId / useHaConversation 配置
 *  - listSttProviders：列出可用 STT provider，用于缺省回退
 *  - logger：日志记录
 */
import { badRequest, rethrowIfHttpException } from '../../common/utils/business-exception';
import type { Logger } from '@nestjs/common';
import type { HaConnectorService } from '../ha-connector/service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

type SttMode = 'browser' | 'ha' | 'auto';

interface VoiceSttConfig {
  language: string;
  /** STT 识别模式：browser 前端 Web Speech / ha HA 实体 / auto 自动回退 */
  sttMode: SttMode;
  sttEntityId?: string;
  useHaConversation: boolean;
}

interface VoiceSttDeps {
  logger: Logger;
  haConnector: HaConnectorService;
  getVoiceConfig: () => VoiceSttConfig;
  listSttProviders: () => Promise<Array<{ entity_id: string; state: string }>>;
}

/**
 * resolveSttEntity：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function resolveSttEntity(deps: VoiceSttDeps): Promise<string | null> {
  const configured = deps.getVoiceConfig().sttEntityId?.trim();
  if (configured) return configured;
  const list = await deps.listSttProviders();
  const online = list.find((e) => e.state !== 'unavailable');
  return online?.entity_id || list[0]?.entity_id || null;
}

/**
 * transcribeVoiceAudio：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function transcribeVoiceAudio(
  audioBase64: string,
  format: string,
  deps: VoiceSttDeps,
): Promise<{ text: string; provider?: string }> {
  if (!audioBase64?.trim()) {
    badRequest(API_ERROR.VOICE_AUDIO_EMPTY);
  }

  const voice = deps.getVoiceConfig();

  // browser 模式优先走前端 Web Speech；若仍上传音频，视为在线识别失败后的 HA 回退
  const entityId = await resolveSttEntity(deps);
  if (!entityId) {
    badRequest(API_ERROR.VOICE_STT_NOT_CONFIGURED);
  }

  const mime = format === 'wav' ? 'audio/wav' : format === 'ogg' ? 'audio/ogg' : 'audio/webm';
  const mediaContentId = `data:${mime};base64,${audioBase64.replace(/^data:[^;]+;base64,/, '')}`;

  try {
    const result = (await deps.haConnector.callServiceViaRest('stt', 'speech_to_text', entityId, {
      language: voice.language || 'zh-CN',
      media: {
        media_content_id: mediaContentId,
        media_content_type: mime,
      },
    })) as { text?: string; speech?: string; result?: { text?: string } };

    const text = (
      result?.text ||
      result?.speech ||
      result?.result?.text ||
      (typeof result === 'string' ? result : '')
    ).trim();

    if (!text) {
      throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.VOICE_STT_NO_TEXT);
    }

    deps.logger.log(`HA 语音识别 [${entityId}]: ${text.slice(0, 40)}...`);
    return { text, provider: entityId };
  } catch (err) {
    rethrowIfHttpException(err);
    const msg = getErrorMessage(err);
    deps.logger.warn(`HA 语音识别失败 [${entityId}]: ${msg}`);
    throw new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.VOICE_STT_FAILED(msg));
  }
}

/**
 * processHaConversation：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function processHaConversation(
  text: string,
  deps: VoiceSttDeps & {
    getHaRestConfig: () => Promise<{ haUrl: string | null; token: string | null }>;
  },
): Promise<{ text: string; response: Record<string, unknown> | null }> {
  const trimmed = text?.trim();
  if (!trimmed) return { text: '', response: null };

  if (!deps.getVoiceConfig().useHaConversation) {
    return { text: trimmed, response: null };
  }

  const { haUrl, token } = await deps.getHaRestConfig();
  if (!haUrl || !token) return { text: trimmed, response: null };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${haUrl.replace(/\/$/, '')}/api/conversation/process`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: trimmed,
        language: deps.getVoiceConfig().language || 'zh-CN',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const snippet = body ? body.slice(0, 120) : '';
      throw new BusinessException(
        ErrorCode.EXTERNAL_ERROR,
        API_ERROR.VOICE_HA_CONVERSATION_FAILED(res.status, snippet),
      );
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { text: trimmed, response: data };
  } catch (err) {
    deps.logger.debug(`HA 对话跳过: ${getErrorMessage(err)}`);
    return { text: trimmed, response: null };
  }
}
