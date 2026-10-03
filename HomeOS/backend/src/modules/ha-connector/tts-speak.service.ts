/**
 * 统一 HA TTS 播报服务（智能顾问、告警、手动触发共用）。
 *
 * 职责：
 * - 根据音箱类型选择最佳 TTS 路径，按优先级降级尝试：Xiaomi Home 官方集成 → HA tts 引擎 → Xiaomi Miot → 默认引擎。
 * - 支持单音箱与多音箱并行播报，缓存 TTS 实体与 Xiaomi Home play_text 实体以减少重复查询。
 * - 配置变更时自动失效缓存。
 *
 * 依赖：AppConfigService（TTS 配置）、HaConnectorService（服务调用）、HaRestClientService（实体查询）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../../common/utils/business-exception';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONFIG_UPDATED, AppConfigService } from '../../shared/app-config/service';
import { HaConnectorService } from './service';
import { HaRestClientService } from './ha-rest-client.service';
import { getErrorMessage } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * 统一 HA TTS 播报服务（@Injectable）。
 * 智能顾问、告警、手动触发共用，按音箱类型选择最佳 TTS 路径。
 */
@Injectable()
export class TtsSpeakService {
  private readonly logger = new Logger(TtsSpeakService.name);
  /** 缓存的 TTS 实体 ID（undefined=未查询，null=无可用，string=已找到） */
  private cachedTtsEntity: string | null | undefined;
  /** Xiaomi Home play_text 实体缓存：mediaPlayer stem → play_text entity_id */
  private cachedXiaomiHomePlayText = new Map<string, string | null>();

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly haConnector: HaConnectorService,
    private readonly haRest: HaRestClientService,
  ) {}

  /** @returns 配置的默认 TTS 播报实体 ID（单个，可能为空字符串）。 */
  getConfiguredMediaPlayer(): string {
    return this.appConfig.get('external').ttsMediaPlayerId?.trim() || '';
  }

  /**
   * @returns 配置的 TTS 播报实体 ID 列表。
   * 优先使用 ttsMediaPlayerIds 数组，回退到单个 ttsMediaPlayerId。
   */
  getConfiguredMediaPlayers(): string[] {
    const external = this.appConfig.get('external');
    const ids = external.ttsMediaPlayerIds || [];
    const fallback = external.ttsMediaPlayerId?.trim();
    if (ids.length > 0) return ids.filter((id) => id.trim());
    return fallback ? [fallback] : [];
  }

  /** 失效 TTS 实体与 Xiaomi Home play_text 实体缓存。 */
  clearCache() {
    this.cachedTtsEntity = undefined;
    this.cachedXiaomiHomePlayText.clear();
  }

  /**
   * 配置变更事件处理：external 或 voice 段变更时失效缓存。
   * @param sections 变更的配置段名列表。
   */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(sections: string[]) {
    if (sections?.some((s) => s === 'external' || s === 'voice')) {
      this.clearCache();
    }
  }

  /**
   * 向单个默认音箱播报文本。
   * @param message 播报内容。
   * @param opts 可选参数：mediaPlayer 指定目标音箱。
   * @returns 播报结果（success + message）。
   */
  async speak(
    message: string,
    opts?: { mediaPlayer?: string },
  ): Promise<{ success: boolean; message: string }> {
    const text = String(message || '').trim();
    if (!text) return { success: false, message: '播报内容为空' };

    const mediaPlayer = opts?.mediaPlayer?.trim() || this.getConfiguredMediaPlayer();
    if (!mediaPlayer) {
      this.logger.warn(`TTS 跳过:未配置 TTS 播报实体 - ${text.slice(0, 48)}`);
      return { success: false, message: '未配置 TTS 播报音箱，请在设置 → 语音中填写默认播报音箱' };
    }

    return this.speakToSingle(mediaPlayer, text);
  }

  /**
   * 向多个音箱并行播报文本。
   * @param message 播报内容。
   * @param opts 可选参数：mediaPlayers 指定目标音箱列表。
   * @returns 播报结果（success + message），部分成功时 message 描述成功数量。
   */
  async speakToMultiple(
    message: string,
    opts?: { mediaPlayers?: string[] },
  ): Promise<{ success: boolean; message: string }> {
    const text = String(message || '').trim();
    if (!text) return { success: false, message: '播报内容为空' };

    const mediaPlayers =
      opts?.mediaPlayers?.filter((id) => id.trim()) || this.getConfiguredMediaPlayers();
    if (mediaPlayers.length === 0) {
      this.logger.warn(`TTS 跳过:未配置 TTS 播报实体 - ${text.slice(0, 48)}`);
      return { success: false, message: '未配置 TTS 播报音箱，请在设置 → 语音中填写默认播报音箱' };
    }

    // 并行向所有音箱播报
    const results = await Promise.all(
      mediaPlayers.map((playerId) => this.speakToSingle(playerId, text)),
    );

    const successCount = results.filter((r) => r.success).length;
    if (successCount === 0) {
      const errors = results
        .map((r) => r.message)
        .filter(Boolean)
        .join('；');
      return { success: false, message: errors || 'TTS 播报失败' };
    }

    if (successCount < mediaPlayers.length) {
      this.logger.warn(`TTS 部分成功:${successCount}/${mediaPlayers.length}`);
    }

    return { success: true, message: `已播报到 ${successCount} 个音箱` };
  }
  /**
   * 向单个音箱播报文本（TTS 降级链核心逻辑）。
   *
   * 降级优先级：
   * 1. Xiaomi Home 官方集成（entity_id 含 xiaomi_cn_）→ notify/text play_text 实体
   * 2. HA tts 域 speak 服务（需解析可用 tts 实体）
   * 3. Xiaomi Miot Auto 集成（intelligent_speaker 服务）
   * 4. 默认 tts 引擎（不指定 entity_id 的 speak 调用）
   *
   * 任一路径成功即返回；全部失败时返回汇总错误。
   *
   * @param mediaPlayer 目标音箱 entity_id。
   * @param text 播报文本。
   * @returns 播报结果（success + message）。
   */
  private async speakToSingle(
    mediaPlayer: string,
    text: string,
  ): Promise<{ success: boolean; message: string }> {
    // 语言配置下发：随 tts.speak 调用下发 voice.language，保证 HA TTS 与 STT/识别使用同一语言
    const voiceLang = String(this.appConfig.get('voice')?.language || 'zh-CN').trim();
    const serviceData: Record<string, unknown> = {
      message: text,
      media_player_entity_id: mediaPlayer,
      ...(voiceLang ? { language: voiceLang } : {}),
    };
    const errors: string[] = [];

    // 路径 1：Xiaomi Home 官方集成
    if (this.isXiaomiHomeSpeaker(mediaPlayer)) {
      try {
        await this.speakViaXiaomiHome(mediaPlayer, text);
        this.logger.log(`TTS 已播报 [Xiaomi Home → ${mediaPlayer}]`);
        return { success: true, message: '已播报' };
      } catch (e: unknown) {
        errors.push(`小米官方集成: ${getErrorMessage(e)}`);
      }
    }

    // 路径 2：HA tts 域 speak 服务
    const ttsEntity = await this.resolveTtsEntity();
    if (ttsEntity) {
      try {
        await this.haConnector.callServiceViaRest('tts', 'speak', ttsEntity, serviceData, 30_000);
        this.logger.log(`TTS 已播报 [${ttsEntity} → ${mediaPlayer}]`);
        return { success: true, message: '已播报' };
      } catch (e: unknown) {
        errors.push(`tts 实体 ${ttsEntity}: ${getErrorMessage(e)}`);
      }
    }

    // 路径 3：Xiaomi Miot Auto 集成
    if (this.isXiaomiMiotSpeaker(mediaPlayer)) {
      try {
        await this.speakViaXiaomiMiot(mediaPlayer, text);
        this.logger.log(`TTS 已播报 [Xiaomi Miot → ${mediaPlayer}]`);
        return { success: true, message: '已播报' };
      } catch (e: unknown) {
        errors.push(`Xiaomi Miot: ${getErrorMessage(e)}`);
      }
    }

    // 路径 4：默认 tts 引擎（仅当不是 Xiaomi Home 音箱时，避免重复尝试）
    if (!this.isXiaomiHomeSpeaker(mediaPlayer)) {
      try {
        await this.haConnector.callServiceViaRest('tts', 'speak', undefined, serviceData, 30_000);
        this.logger.log(`TTS 已播报 [默认引擎 → ${mediaPlayer}]`);
        return { success: true, message: '已播报' };
      } catch (e: unknown) {
        errors.push(`默认 TTS → ${mediaPlayer}: ${getErrorMessage(e)}`);
      }
    }

    const detail = errors.join('；');
    this.logger.warn(`TTS 播报失败: ${detail}`);
    return { success: false, message: detail || 'TTS 播报失败' };
  }

  /**
   * 提取 media_player 实体 ID 的 stem（去掉 domain 前缀，转小写）。
   * @param mediaPlayer 完整 entity_id。
   * @returns 小写 stem（如 xiaomi_cn_xxx）。
   */
  private mediaPlayerStem(mediaPlayer: string): string {
    return mediaPlayer.replace(/^media_player\./i, '').toLowerCase();
  }

  /** 小米官方 Home 集成（entity_id 含 xiaomi_cn_） */
  private isXiaomiHomeSpeaker(mediaPlayer: string): boolean {
    return this.mediaPlayerStem(mediaPlayer).startsWith('xiaomi_cn_');
  }

  /** Xiaomi Miot Auto 集成 */
  private isXiaomiMiotSpeaker(mediaPlayer: string): boolean {
    const stem = this.mediaPlayerStem(mediaPlayer);
    if (stem.startsWith('xiaomi_cn_')) return false;
    return stem.includes('xiaomi') || stem.includes('xiaoai');
  }

  /**
   * 小米官方集成播报：通过 notify 或 text 域的 play_text 实体播放文本，参数格式 ["文本"]。
   * @param mediaPlayer 目标音箱 entity_id。
   * @param text 播报文本。
   * @throws {BusinessException} 找不到 play_text 实体时抛出。
   */
  private async speakViaXiaomiHome(mediaPlayer: string, text: string): Promise<void> {
    const payload = JSON.stringify([text]);
    const playTextEntity = await this.resolveXiaomiHomePlayTextEntity(mediaPlayer);
    if (!playTextEntity) {
      badRequest(API_ERROR.TTS_XIAOMI_PLAY_TEXT_NOT_FOUND);
    }
    if (playTextEntity.startsWith('notify.')) {
      await this.haConnector.callServiceViaRest(
        'notify',
        'send_message',
        playTextEntity,
        { message: payload },
        30_000,
      );
      return;
    }
    await this.haConnector.callServiceViaRest(
      'text',
      'set_value',
      playTextEntity,
      { value: payload },
      30_000,
    );
  }

  /**
   * 解析 Xiaomi Home 音箱对应的 play_text 实体 ID（带缓存）。
   * 查找逻辑：在 notify 域和 text 域中匹配同时包含 stem 和 play_text 的 entity_id。
   * @param mediaPlayer 目标音箱 entity_id。
   * @returns play_text 实体 ID，未找到返回 null。
   */
  private async resolveXiaomiHomePlayTextEntity(mediaPlayer: string): Promise<string | null> {
    const stem = this.mediaPlayerStem(mediaPlayer);
    if (this.cachedXiaomiHomePlayText.has(stem)) {
      return this.cachedXiaomiHomePlayText.get(stem) ?? null;
    }

    const matchPlayText = (entityId: string) => {
      const id = entityId.toLowerCase();
      return id.includes(stem) && id.includes('play_text');
    };

    // 优先查找 notify 域的 play_text 实体
    const notifies = await this.haRest.fetchEntitiesByDomain('notify');
    const notifyEntity = notifies.find((e) => matchPlayText(e.entity_id))?.entity_id;
    if (notifyEntity) {
      this.cachedXiaomiHomePlayText.set(stem, notifyEntity);
      return notifyEntity;
    }

    // 回退查找 text 域的 play_text 实体
    const texts = await this.haRest.fetchEntitiesByDomain('text');
    const textEntity = texts.find((e) => matchPlayText(e.entity_id))?.entity_id || null;
    this.cachedXiaomiHomePlayText.set(stem, textEntity);
    return textEntity;
  }

  /**
   * Xiaomi Miot Auto 集成播报：调用 intelligent_speaker 服务。
   * @param mediaPlayer 目标音箱 entity_id。
   * @param text 播报文本。
   */
  private async speakViaXiaomiMiot(mediaPlayer: string, text: string): Promise<void> {
    await this.haConnector.callServiceViaRest(
      'xiaomi_miot',
      'intelligent_speaker',
      undefined,
      {
        entity_id: mediaPlayer,
        text,
        execute: false,
      },
      30_000,
    );
  }

  /**
   * 解析可用的 HA tts 实体 ID（带缓存）。
   * 优先选择非 cloud 的 tts 实体，回退到第一个可用实体。
   * @returns tts 实体 ID，无可用时返回 null。
   */
  private async resolveTtsEntity(): Promise<string | null> {
    if (this.cachedTtsEntity !== undefined) return this.cachedTtsEntity;
    const list = await this.haRest.fetchEntitiesByDomain('tts');
    const preferred =
      list.find((e) => !e.entity_id.includes('cloud')) || list.find((e) => e.entity_id);
    this.cachedTtsEntity = preferred?.entity_id || null;
    return this.cachedTtsEntity;
  }
}