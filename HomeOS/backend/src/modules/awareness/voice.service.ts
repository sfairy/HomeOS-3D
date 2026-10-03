/**
 * @file voice.service.ts
 * @module awareness
 * @description 语音对话服务。聚合 STT 转写、HA Assist 对话、命令执行与 TTS 播报，
 * 对外提供 transcribe / converse / execute / speak / speakMultiple 等入口。
 *
 * 关键策略：
 *  - STT 转写委托给 voice-stt.helper（browser / ha / auto 三种模式）
 *  - HA Assist 对话委托给 voice-stt.helper 的 processHaConversation
 *  - 命令执行委托给 voice-command-execute.helper，统一走场景 / 自动化 / 命令代理下发
 *  - TTS 播报通过 TtsSpeakService 调用 HA media_player.play_media 播报
 *  - 支持全屋命令（DEFAULT_WHOLE_HOME_VOICE_COMMANDS）按 resolveVoiceRooms 解析目标播放器
 *
 * 依赖：
 *  - AutomationEngineService / HomeModeService / SceneService：命令执行目标
 *  - HaConnectorService / CommandProxyService：HA 服务与命令代理
 *  - ChildModeService：儿童模式门禁预检
 *  - TtsSpeakService：TTS 播报
 *  - AppConfigService：voice 配置（STT 模式 / TTS 实体 / 唤醒词）
 *  - PrismaService / StateStoreService / EntityAreaEnrichmentService：实体与房间解析
 *  - AgentService：可选的 LLM 代理对话
 */
import { Injectable, Logger } from '@nestjs/common';
import { AutomationEngineService } from '../automation/engine.service';
import { HomeModeService } from '../home-mode/service';
import { SceneService } from '../scene/service';
import { HaConnectorService } from '../ha-connector/service';
import { CommandProxyService } from '../command-proxy/service';
import { ChildModeService } from '../child-mode/service';
import { TtsSpeakService } from '../ha-connector/tts-speak.service';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { StateStoreService } from '../state-store/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import type { JwtUserLike } from '@homeos/shared';
import { getErrorMessage } from '../../common/utils';
import {
  resolveVoiceRooms,
  DEFAULT_WHOLE_HOME_VOICE_COMMANDS,
} from '../../common/alert-support/voice-command.util';
import {
  VOICE_ALERT_CATALOG,
  normalizeWakeWords,
  resolveVoiceAlertRules,
} from '../../common/alert-support/voice-alert.util';
import {
  processHaConversation,
  resolveSttEntity,
  transcribeVoiceAudio,
} from './voice-stt.helper';
import { executeVoiceCommand } from './voice-command-execute.helper';
import { AgentService } from '../agent/service';

@Injectable()
/**
 * VoiceService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class VoiceService
 */
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly commandProxy: CommandProxyService,
    private readonly childMode: ChildModeService,
    private readonly appConfig: AppConfigService,
    private readonly stateStore: StateStoreService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly ttsSpeak: TtsSpeakService,
    private readonly prisma: PrismaService,
    private readonly sceneService: SceneService,
    private readonly automationEngine: AutomationEngineService,
    private readonly homeMode: HomeModeService,
    private readonly agentService: AgentService,
  ) {}

  private get voice() {
    return this.appConfig.get('voice');
  }

  private get sttDeps() {
    return {
      logger: this.logger,
      haConnector: this.haConnector,
      getVoiceConfig: () => ({
        language: this.voice.language,
        sttMode: this.voice.sttMode,
        sttEntityId: this.voice.sttEntityId,
        useHaConversation: this.voice.useHaConversation,
      }),
      listSttProviders: async () => {
        const entities = await this.haConnector.fetchEntitiesByDomain('stt');
        return entities.map((e) => ({
          entity_id: e.entity_id,
          state: e.state,
        }));
      },
      getHaRestConfig: () => this.haConnector.getConfigForRest(),
    };
  }

  /** 列出 HA 可用的 STT 实体 */
  async listSttProviders() {
    const entities = await this.haConnector.fetchEntitiesByDomain('stt');
    return entities.map((e) => ({
      entity_id: e.entity_id,
      name: (e.attributes as Record<string, unknown>)?.friendly_name || e.entity_id,
      state: e.state,
    }));
  }

  getSttStatus() {
    const v = this.voice;
    return {
      sttMode: v.sttMode,
      language: v.language,
      sttEntityId: v.sttEntityId || '',
      useHaConversation: v.useHaConversation,
    };
  }

  async transcribe(
    audioBase64: string,
    format = 'webm',
  ): Promise<{ text: string; provider?: string }> {
    return transcribeVoiceAudio(audioBase64, format, this.sttDeps);
  }

  async processConversation(text: string) {
    return processHaConversation(text, this.sttDeps);
  }

  async autoDetectSttEntity(): Promise<string | null> {
    return resolveSttEntity(this.sttDeps);
  }

  private voiceRooms() {
    return resolveVoiceRooms(
      this.appConfig.get('envSensorMap'),
      this.entityAreaEnrichment.getCachedHaAreas(),
    );
  }

  async speak(message: string, mediaPlayer?: string) {
    return this.ttsSpeak.speak(message, { mediaPlayer });
  }

  async speakMultiple(message: string, mediaPlayers?: string[]) {
    return this.ttsSpeak.speakToMultiple(message, { mediaPlayers });
  }

  getCommandPresets() {
    return structuredClone(DEFAULT_WHOLE_HOME_VOICE_COMMANDS);
  }

  async getVoiceMeta() {
    await this.entityAreaEnrichment.ensureLoaded();
    const sttProviders = await this.listSttProviders();
    const detectedStt = await this.resolveSttEntity();
    const ttsEntities = await this.haConnector.fetchEntitiesByDomain('tts');
    const mediaPlayers = this.stateStore.getAll('media_player');
    const commands = this.appConfig.get('voiceCommands');
    const rooms = this.voiceRooms();
    return {
      rooms: rooms.map((r) => r.label),
      commandCount: commands.length,
      defaultCommandCount: DEFAULT_WHOLE_HOME_VOICE_COMMANDS.length,
      ttsMediaPlayerId: this.ttsSpeak.getConfiguredMediaPlayer(),
      stt: {
        ...this.getSttStatus(),
        providers: sttProviders,
        detectedEntityId: detectedStt,
      },
      ttsProviders: ttsEntities.map((e) => e.entity_id),
      mediaPlayerCount: mediaPlayers.length,
      ttsAlerts: resolveVoiceAlertRules(this.appConfig.get('voice')),
      alertCatalog: VOICE_ALERT_CATALOG,
      wakeWords: normalizeWakeWords(this.appConfig.get('voice')),
      customAlertCount:
        (this.appConfig.get('voice').customTtsAlerts || []).length +
        (this.appConfig.get('voice').entityTtsAlerts || []).length,
    };
  }

  private async resolveSttEntity(): Promise<string | null> {
    return resolveSttEntity(this.sttDeps);
  }

  async executeCommand(
    text: string,
    user?: JwtUserLike,
  ): Promise<{
    ok: boolean;
    message: string;
    source: 'ha_assist' | 'mapping' | 'none' | 'agent';
    room?: string | null;
    count?: number;
  }> {
    await this.entityAreaEnrichment.ensureLoaded();
    const result = await executeVoiceCommand(text, user, {
      logger: this.logger,
      prisma: this.prisma,
      commandProxy: this.commandProxy,
      childMode: this.childMode,
      sceneService: this.sceneService,
      automationEngine: this.automationEngine,
      homeMode: this.homeMode,
      getVoiceCommands: () => this.appConfig.get('voiceCommands'),
      getEntities: () => this.stateStore.getAll(),
      getRooms: () => this.voiceRooms(),
      useHaConversation: () => this.voice.useHaConversation,
      processConversation: (t) => this.processConversation(t),
    });

    // 命令映射未命中且已开启回落：交由智能管家（Agent LLM）理解并执行，
    // 覆盖「查天气 / 问预算 / 组合指令」等未预置映射的语音场景
    if (result.source === 'none' && this.voice.agentFallback) {
      const sessionId = `voice:${user?.userId || 'anon'}`;
      try {
        const agent = await this.agentService.chat(
          text,
          [],
          {
            actor: {
              role: user?.role,
              restrictions: user?.restrictions,
              userId: user?.userId,
              username: user?.username,
            },
            sessionId,
          },
        );
        const message = agent.reply?.trim() || '已由智能管家理解，但未生成可执行动作';
        return {
          ok: agent.outcome === 'success' || agent.outcome === 'answer',
          message,
          source: 'agent' as const,
          room: null,
          count: agent.toolCalls.length,
        };
      } catch (err) {
        this.logger.warn(`语音回落智能管家失败: ${getErrorMessage(err)}`);
        return {
          ok: false,
          message: getErrorMessage(err) || '智能管家暂时不可用',
          source: 'agent',
        };
      }
    }
    return result;
  }
}
