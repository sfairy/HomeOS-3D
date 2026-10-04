/**
 * @file tts-route.util.ts
 * @module @homeos/shared/notification
 * @brief TTS 输出路径解析与告警优先级排序（前后端共用）。
 *
 * 职责：
 *  - 根据可用资源（HA media_player / 浏览器 Web Speech）解析 TTS 路由：
 *    ha_media 优先、browser 次之、silent 兜底；
 *  - 多条待播报告警按 voice-alert-priority 排序（高优先先播）。
 *
 * 关键依赖：
 *  - voice-alert-priority 提供 VOICE_ALERT_PRIORITY 数值表与比较函数。
 *
 * 约定：
 *  - mediaPlayerIds 任一非空即认定 HA 音箱可用；
 *  - browserAvailable !== false 且 preferBrowser !== false 才走浏览器；
 *  - 排序为浅拷贝，不修改原数组。
 */
import { compareVoiceAlertPriority } from './voice-alert-priority';

/** TTS 播报输出路由：browser=浏览器 Web Speech；ha_media=HA 音箱；silent=静默（无可用输出时） */
export type TtsRoute = 'browser' | 'ha_media' | 'silent';

/** resolveTtsRoute 的输入参数（全部可选；空对象传入即返回默认路由） */
export interface ResolveTtsRouteInput {
  /** 浏览器 Web Speech API 是否可用 */
  browserAvailable?: boolean;
  /** HA media_player 实体 ID 列表 */
  mediaPlayerIds?: string[];
  /** 用户是否启用浏览器 TTS 兜底 */
  preferBrowser?: boolean;
}

/** 解析 TTS 输出路径：HA 音箱优先，其次浏览器，最后静默 */
export function resolveTtsRoute(input: ResolveTtsRouteInput = {}): TtsRoute {
  const ids = (input.mediaPlayerIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  if (ids.length) return 'ha_media';
  if (input.browserAvailable !== false && input.preferBrowser !== false) return 'browser';
  return 'silent';
}

/** 多条待播报告警按优先级排序（高优先先播） */
export function sortAlertsByVoicePriority(keys: string[]): string[] {
  return [...keys].sort(compareVoiceAlertPriority);
}
