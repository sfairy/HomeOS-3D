/**
 * @file smart-advisor.service.ts
 * @module awareness
 * @description 智能顾问服务。监听 HomeOS 事件（安防报警 / 紧急求助 / 房间上下文 / 离家 /
 * 自动化 / 能耗异常 / 用水异常 / 霉菌风险 / 通知），按场景生成 TTS 播报与智能建议，
 * 并提供每日顾问问候、设备使用报告、遗忘设备检测与离线基线重建入口。
 *
 * 关键策略：
 *  - TTS 消息通过 `tts.speak` 事件发出，由 WsPushGateway 调用 TtsSpeakService 经 HA 播报
 *  - 播报与建议均带冷却去重（speakCooldownMin / tipCooldownHours）
 *  - 事件处理委托给 SmartAdvisorEventsHelper（纯逻辑、无状态）
 *  - 设备使用统计与遗忘检测委托给 SmartAdvisorUsageHelper
 *
 * 依赖：
 *  - PrismaService：建议 / 使用统计持久化
 *  - AppConfigService：other / voice 配置（冷却时长、TTS 模板、告警规则）
 *  - EventBusService：跨实例事件总线，订阅 HomeOS 各类事件
 *  - HomeModeService / SceneService：家庭模式与场景执行
 *  - HaConnectorService / HaStateChangeRouterService / StateStoreService：HA 状态来源
 *  - IaqService / EnvironmentHealthService / EnergyBudgetService：环境与能源数据
 *  - EntityAreaEnrichmentService：HA area 补全，用于房间标签解析
 *  - DistributedLockService：分布式锁，避免多实例重复处理
 */
import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { HomeModeService } from '../home-mode/service';
import { SceneService } from '../scene/service';
import { getErrorMessage } from '../../common/utils';
import { localDateKey } from '../../common/utils/local-date.util';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import type { AppConfigData } from '../../shared/app-config/types';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { IaqService } from '../environment/iaq.service';
import { EnvironmentHealthService } from '../environment/health.service';
import { EnergyBudgetService } from '../energy/budget.service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import type { RoomContextSnapshot } from '../security/presence/room-context.service';
import { HaConnectorService } from '../ha-connector/service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { StateStoreService } from '../state-store/service';
import {
  isVoiceAlertEnabled,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
  resolveAlertSpeech,
  resolveDailyAdvisorTts,
  resolveVoiceAlertRules,
  type VoiceAlertRuleKey,
  type VoiceAlertRules,
} from '../../common/alert-support/voice-alert.util';
import { isDndActive as isDndActiveUtil } from '@homeos/shared';
import {
  handleAlarm,
  handleAutomation,
  handleEmergency,
  handleEnergyAnomaly,
  handleEnergyBudget,
  handleEveryoneLeft,
  handleMoldRisk,
  handleNotification,
  handleRoomContext,
  handleWaterAnomaly,
  type SmartAdvisorEventsDeps,
} from './smart-advisor-events.helper';
import { resolveRoomLabelFromHaAreas } from '@homeos/shared';
import { SmartAdvisorUsageHelper } from './smart-advisor-usage.helper';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';

/**
 * TTS 场景播报 + 智能建议引擎
 *
 * 监听 HomeOS 事件，根据场景自动生成 TTS 消息和建议。
 * TTS 消息通过 `tts.speak` 事件发出，由 WsPushGateway 调用 TtsSpeakService 经 HA 播报。
 */
@Injectable()
export class SmartAdvisorService implements OnModuleInit {
  private readonly logger = new Logger(SmartAdvisorService.name);

  /** 已播报过的消息去重（同一条消息 10 分钟内不重复） */
  private spokenMessages = new Map<string, number>();

  private get SPEAK_COOLDOWN() {
    return this.appConfig.get('other').speakCooldownMin * 60_000;
  }

  /** 已推送过的建议去重 */
  private pushedTips = new Map<string, number>();

  private get TIP_COOLDOWN() {
    return this.appConfig.get('other').tipCooldownHours * 3_600_000;
  }

  private readonly usage: SmartAdvisorUsageHelper;

  private readonly eventsDeps: SmartAdvisorEventsDeps;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly eventBus: EventBusService,
    private readonly homeMode: HomeModeService,
    private readonly sceneService: SceneService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly stateStore: StateStoreService,
    private readonly haConnector: HaConnectorService,
    private readonly iaqService: IaqService,
    private readonly envHealth: EnvironmentHealthService,
    private readonly energyBudget: EnergyBudgetService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly lock: DistributedLockService,
  ) {
    this.usage = new SmartAdvisorUsageHelper({
      prisma: this.prisma,
      appConfig: this.appConfig,
      haConnector: this.haConnector,
      stateStore: this.stateStore,
      stateRouter: this.stateRouter,
      logger: this.logger,
      pushTip: (title, message, category) => this.pushTip(title, message, category),
      roomLabel: (room) => this.roomLabel(room),
      voiceConfig: () => this.voiceConfig(),
      entityTtsAlerts: () => this.entityTtsAlerts(),
      customAlerts: () => this.customAlerts(),
      queueSpeak: (message, dedupKey, opts) => this.queueSpeak(message, dedupKey, opts),
    });
    this.eventsDeps = {
      appConfig: this.appConfig,
      usage: this.usage,
      voiceAlertRules: () => this.voiceAlertRules(),
      voiceConfig: () => this.voiceConfig(),
      alertTemplates: () => this.alertTemplates(),
      customAlerts: () => this.customAlerts(),
      speakForRule: (key, defaultMsg, dedupKey, vars, opts) =>
        this.speakForRule(key, defaultMsg, dedupKey, vars, opts),
      queueSpeak: (message, dedupKey, opts) => this.queueSpeak(message, dedupKey, opts),
      pushTip: (title, message, category) => this.pushTip(title, message, category),
      roomLabel: (room) => this.roomLabel(room),
    };
  }

  async onModuleInit() {
    await this.loadCooldowns();
    await this.usage.buildRoomDeviceMapFromConfig();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  async onAppConfigUpdated(sections: string[]) {
    if (!Array.isArray(sections) || !sections.includes('envSensorMap')) return;
    await this.usage.buildRoomDeviceMapFromConfig();
  }

  private async loadCooldowns() {
    try {
      const now = Date.now();
      const records = await this.prisma.advisorCooldown.findMany({ take: 2000 });
      for (const r of records) {
        const deadline = Number(r.cooldownUntil);
        if (deadline > now) {
          if (r.dedupKey.startsWith('speak:')) {
            this.spokenMessages.set(r.dedupKey.slice(6), deadline - this.SPEAK_COOLDOWN);
          } else if (r.dedupKey.startsWith('tip:')) {
            this.pushedTips.set(r.dedupKey.slice(4), deadline - this.TIP_COOLDOWN);
          }
        }
      }
      const expired = records.filter((r) => Number(r.cooldownUntil) <= now);
      if (expired.length > 0) {
        this.prisma.advisorCooldown
          .deleteMany({
            where: { id: { in: expired.map((r) => r.id) } },
          })
          .catch((e) =>
            this.logger.warn(`清理过期建议冷却记录失败: ${getErrorMessage(e)}`),
          );
      }
      this.logger.log(`智能建议冷却记录已加载: ${records.length} 条 (过期 ${expired.length})`);
    } catch (err) {
      this.logger.warn(`加载建议冷却记录失败: ${(err as Error).message}`);
    }
  }

  private persistCooldown(dedupKey: string, cooldownUntil: number) {
    setImmediate(() => {
      this.prisma.advisorCooldown
        .upsert({
          where: { dedupKey },
          create: { dedupKey, cooldownUntil: BigInt(cooldownUntil) },
          update: { cooldownUntil: BigInt(cooldownUntil), createdAt: new Date() },
        })
        .catch((e) =>
          this.logger.warn(`持久化建议冷却失败 [${dedupKey}]: ${getErrorMessage(e)}`),
        );
    });
  }

  /** 以本地时区（Asia/Shanghai）格式化日期键：YYYY-MM-DD */
  private static formatLocalDayKey(date = new Date()): string {
    return localDateKey(date, 'Asia/Shanghai');
  }

  /** 智能顾问 Tips 反馈（已完成/忽略）持久化键：advisor-done:<date>:<category> */
  private static tipFeedbackKey(date: string, category: string, state: 'done' | 'ignored') {
    return `advisor-${state}:${date}:${category}`;
  }

  /** 记录今日某类别建议的反馈状态（已完成/忽略），次日自动过期 */
  async markTipFeedback(category: string, state: 'done' | 'ignored') {
    const normalized = String(category || '').trim();
    if (!normalized) return { success: false, message: '缺少建议类别' };
    const date = SmartAdvisorService.formatLocalDayKey();
    const key = SmartAdvisorService.tipFeedbackKey(date, normalized, state);
    // 反馈持久化 24h 后过期，使「今日已处理」跨页面/跨设备生效
    this.persistCooldown(key, Date.now() + 24 * 3_600_000);
    return { success: true };
  }

  /** 读取今日各建议类别的反馈状态（done/ignored 分类） */
  private async loadTodayTipFeedback(): Promise<{ done: Set<string>; ignored: Set<string> }> {
    const date = SmartAdvisorService.formatLocalDayKey();
    const done = new Set<string>();
    const ignored = new Set<string>();
    try {
      const rows = await this.prisma.advisorCooldown.findMany({
        where: {
          dedupKey: { startsWith: 'advisor-' },
        },
        take: 500,
      });
      const prefix = `:${date}:`;
      for (const r of rows) {
        const key = r.dedupKey;
        if (!key.includes(prefix)) continue;
        if (key.startsWith('advisor-done:')) {
          done.add(key.slice(key.lastIndexOf(':') + 1));
        } else if (key.startsWith('advisor-ignored:')) {
          ignored.add(key.slice(key.lastIndexOf(':') + 1));
        }
      }
    } catch (err) {
      this.logger.warn(`读取今日建议反馈失败: ${(err as Error).message}`);
    }
    return { done, ignored };
  }

  private voiceAlertRules(): VoiceAlertRules {
    return resolveVoiceAlertRules(this.appConfig.get('voice'));
  }

  private voiceConfig(): AppConfigData['voice'] {
    return this.appConfig.get('voice');
  }

  private alertTemplates() {
    return this.voiceConfig().ttsAlertTemplates || {};
  }

  private customAlerts() {
    return normalizeCustomTtsAlerts(this.voiceConfig().customTtsAlerts);
  }

  private entityTtsAlerts() {
    return normalizeEntityTtsAlerts(this.voiceConfig().entityTtsAlerts);
  }

  private static readonly DND_BYPASS_RULE_KEYS = new Set<VoiceAlertRuleKey>([
    'securityEmergency',
    'safetySmoke',
    'safetyGas',
    'safetyWater',
    'notificationDanger',
  ]);

  private speakForRule(
    key: VoiceAlertRuleKey,
    defaultMsg: string,
    dedupKey: string,
    vars?: Record<string, string | number | undefined | null>,
    opts?: { bypassDnd?: boolean },
  ) {
    if (!isVoiceAlertEnabled(this.voiceAlertRules(), key)) return;
    const msg = resolveAlertSpeech(key, defaultMsg, this.alertTemplates(), vars);
    const bypassDnd = opts?.bypassDnd ?? SmartAdvisorService.DND_BYPASS_RULE_KEYS.has(key);
    if (msg) this.queueSpeak(msg, dedupKey, { bypassDnd });
  }

  @OnEvent('security.alarm')
  handleAlarm(data: Parameters<typeof handleAlarm>[1]) {
    handleAlarm(this.eventsDeps, data);
  }

  @OnEvent('security.emergency')
  handleEmergency(data: { action?: string }) {
    handleEmergency(this.eventsDeps, data);
  }

  @OnEvent(HOMEOS_EVENTS.ROOM_CONTEXT)
  handleRoomContext(payload: RoomContextSnapshot & { changedRoom?: string }) {
    handleRoomContext(this.eventsDeps, payload);
  }

  @OnEvent('presence.everyoneLeft')
  handleEveryoneLeft() {
    handleEveryoneLeft(this.eventsDeps);
  }

  @OnEvent('automation.executed')
  handleAutomation(data: { name?: string }) {
    handleAutomation(this.eventsDeps, data);
  }

  @OnEvent('energy.anomaly')
  handleEnergyAnomaly(data: { friendlyName?: string; current?: number; average?: number }) {
    handleEnergyAnomaly(this.eventsDeps, data);
  }

  @OnEvent('energy.budgetExceeded')
  handleEnergyBudget(data: { message?: string }) {
    handleEnergyBudget(this.eventsDeps, data);
  }

  @OnEvent('water.anomaly')
  handleWaterAnomaly(data: {
    friendlyName?: string;
    entityId?: string;
    type?: string;
    flowRate?: number;
    totalUsage?: number;
  }) {
    handleWaterAnomaly(this.eventsDeps, data);
  }

  @OnEvent('env.moldRisk')
  handleMoldRisk(data: { roomId?: string; message?: string }) {
    handleMoldRisk(this.eventsDeps, data);
  }

  @OnEvent('notification.created')
  handleNotification(data: {
    level?: string;
    message?: string;
    source?: string;
    channels?: string[];
  }) {
    handleNotification(this.eventsDeps, data);
  }

  async getDailyAdvice(): Promise<{
    tts: string;
    tips: Array<{
      title: string;
      message: string;
      category: string;
      actionable?: boolean;
      done?: boolean;
      ignored?: boolean;
    }>;
  }> {
    const hour = new Date().getHours();
    const month = new Date().getMonth() + 1;
    const tips: Array<{ title: string; message: string; category: string }> = [];
    const voice = this.voiceConfig();

    if (hour >= 20 || hour < 6) {
      tips.push({
        title: '门窗检查',
        message: '入夜了，请确认所有门窗已关好',
        category: 'security',
      });
    }

    const readings = this.envHealth.getAllReadings();
    let worstIaq: { room: string; iaq: number; advice: string[] } | null = null;
    for (const [room, r] of Object.entries(readings)) {
      const result = this.iaqService.compute({
        pm25: r.pm25,
        co2: r.co2,
        temperature: r.temperature,
        humidity: r.humidity,
      });
      if (result.iaq == null) continue;
      if (!worstIaq || result.iaq > worstIaq.iaq) {
        const advice = Array.isArray(result.advice) ? result.advice : [String(result.advice)];
        worstIaq = { room, iaq: result.iaq, advice };
      }
      if (r.risk === 'Lv2' || r.risk === 'Lv3') {
        const label = this.roomLabel(room);
        tips.push({
          title: `${label}防潮提醒`,
          message: `${label}湿度偏高，建议通风或开启除湿`,
          category: 'env',
        });
      }
    }
    if (worstIaq && worstIaq.iaq > 40) {
      const label = this.roomLabel(worstIaq.room);
      tips.push({
        title: '空气质量',
        message: `${label} IAQ ${worstIaq.iaq}（${worstIaq.advice[0] || '建议改善通风'}）`,
        category: 'env',
      });
    }

    const budgetStatus = await this.energyBudget.getStatus();
    if (budgetStatus.warnings.length > 0) {
      tips.push({
        title: '能源预算',
        message: budgetStatus.warnings[0],
        category: 'energy',
      });
    } else if (budgetStatus.kwhUsedPct != null && budgetStatus.kwhUsedPct >= 80) {
      tips.push({
        title: '节能提醒',
        message: `本月用电已达预算 ${budgetStatus.kwhUsedPct}%，注意控制高耗能设备`,
        category: 'energy',
      });
    } else {
      tips.push({
        title: '节能贴士',
        message: '空调设定 26°C 比 22°C 省电约 30%',
        category: 'energy',
      });
    }

    // 月度/季节提示：优先接入真实能耗与室内外温度，替代纯硬编码话术
    const monthTip = await this.buildSeasonalTip(month, budgetStatus);
    if (monthTip) tips.push(monthTip);

    const tts = resolveDailyAdvisorTts(hour, {
      daytime: voice.dailyAdvisorTtsDaytime,
      evening: voice.dailyAdvisorTtsEvening,
    });

    const actions = this.appConfig.get('other').advisorTipActions || {};
    const todayFeedback = await this.loadTodayTipFeedback();
    const tipsWithActions = tips.map((t) => {
      const action = actions[t.category];
      const actionable = !!(action?.id && (action.type === 'home_mode' || action.type === 'scene'));
      return {
        ...t,
        actionable,
        done: todayFeedback.done.has(t.category),
        ignored: todayFeedback.ignored.has(t.category),
      };
    });
    return { tts, tips: tipsWithActions };
  }

  /**
   * 月度/季节提示：基于本月实际用电与室内外温差动态生成，
   * 无计量数据时回退到传统季节话术（避免空泛/误导）。
   */
  private async buildSeasonalTip(
    month: number,
    budgetStatus: Awaited<ReturnType<EnergyBudgetService['getStatus']>>,
  ): Promise<{ title: string; message: string; category: string } | null> {
    const monthUsage = budgetStatus.monthUsage ?? null;
    const isWinter = month === 12 || month <= 2;
    const isSummer = month >= 6 && month <= 8;
    const isSpring = month >= 3 && month <= 5;

    // 本月已有实际用电量时：给出环比建议（相对上月 / 日均为零则强调峰谷错峰）
    if (monthUsage != null && monthUsage > 0) {
      const dailyAvg = budgetStatus.dailyAvgKwh;
      const projected = budgetStatus.projectedKwh;
      if (isWinter) {
        return {
          title: '采暖节能',
          message:
            projected != null && projected > monthUsage
              ? `本月已用电 ${monthUsage} kWh，按当前节奏预计 ${projected} kWh。取暖每降 1°C 约省 5–8% 能耗`
              : `本月已用电 ${monthUsage} kWh${dailyAvg != null ? `（日均 ${dailyAvg} kWh）` : ''}。采暖季注意门窗密封，温控每降 1°C 约省 5–8%`,
          category: 'energy',
        };
      }
      if (isSummer) {
        return {
          title: '夏季错峰',
          message: `本月已用电 ${monthUsage} kWh${
            dailyAvg != null ? `（日均 ${dailyAvg} kWh）` : ''
          }。高温时段尽量少开大功率电器，可配合峰谷电价把洗衣/充电挪到谷电时段`,
          category: 'energy',
        };
      }
      if (isSpring) {
        return {
          title: '春季通风',
          message: `本月已用电 ${monthUsage} kWh${
            dailyAvg != null ? `（日均 ${dailyAvg} kWh）` : ''
          }。花粉与扬尘增多，建议适时开启净化或新风，同时优先开窗自然通风`,
          category: 'env',
        };
      }
      return {
        title: '秋季节能',
        message: `本月已用电 ${monthUsage} kWh${
          dailyAvg != null ? `（日均 ${dailyAvg} kWh）` : ''
        }。昼夜温差大，注意调节湿度以防结露发霉`,
        category: 'env',
      };
    }

    // 无计量数据：保留传统季节话术兜底
    if (isSummer) {
      return {
        title: '夏季提示',
        message: '午间高温时段尽量少开大功率电器，可配合峰谷电价调整用电',
        category: 'energy',
      };
    }
    if (isWinter) {
      return {
        title: '冬季提示',
        message: '采暖季注意门窗密封，每降 1°C 约可节省 5–8% 取暖能耗',
        category: 'energy',
      };
    }
    if (isSpring) {
      return {
        title: '春季提示',
        message: '花粉与扬尘增多，建议适时开启净化或新风',
        category: 'env',
      };
    }
    return {
      title: '秋季提示',
      message: '昼夜温差大，注意调节湿度以防结露发霉',
      category: 'env',
    };
  }

  async executeTip(
    category: string,
  ): Promise<{ success: boolean; message: string; silent?: boolean }> {
    const action = this.appConfig.get('other').advisorTipActions?.[category];
    if (!action?.id) {
      return { success: false, message: `未配置「${category}」类别的一键动作` };
    }
    try {
      if (action.type === 'home_mode') {
        await this.homeMode.activate(action.id, {
          source: 'advisor',
          reason: `顾问建议: ${category}`,
        });
        return { success: true, message: '已切换家庭模式', silent: true };
      }
      if (action.type === 'scene') {
        await this.sceneService.execute(action.id);
        return { success: true, message: '已执行场景' };
      }
      return { success: false, message: '未知动作类型' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  get deviceUsage() {
    return this.usage.deviceUsage;
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  trackUsage(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      this.usage.trackUsage(event);
    });
  }

  getUsageReport() {
    return this.usage.getUsageReport();
  }

  getEntityUsage(entityId: string, days?: number) {
    return this.usage.getEntityUsage(entityId, days);
  }

  getUsageSummary(days?: number) {
    return this.usage.getUsageSummary(days);
  }

  clearUsageStats() {
    return this.usage.clearUsageStats();
  }

  registerRoomDevices(room: string, entityIds: string[]) {
    this.usage.registerRoomDevices(room, entityIds);
  }

  // 遗忘设备检测会查库+写通知，多副本下需分布式锁避免重复检测/重复提醒
  @Cron('*/15 * * * *')
  async checkForgottenCron() {
    try {
      await this.lock.runExclusive(
        'smart-advisor-check-forgotten',
        () => this.usage.checkForgottenCron(),
        10 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) return; // 其他实例持有锁，跳过本轮
      this.logger.warn(`遗忘设备检测失败: ${getErrorMessage(err)}`);
    }
  }

  getForgottenDevices() {
    return this.usage.getForgottenDevices();
  }

  detectForgottenDevices(
    entities: Map<string, { state: string; attributes?: Record<string, unknown> }>,
  ) {
    return this.usage.detectForgottenDevices(entities);
  }

  private isVoiceDndActive(): boolean {
    const { dndStart, dndEnd } = this.appConfig.get('notification');
    return isDndActiveUtil(new Date().getHours(), dndStart, dndEnd);
  }

  /** 去重 Map 惰性清理：写入前删除超过 24h 的旧条目，避免 Map 只增不减 */
  private pruneDedupMaps(now: number) {
    const maxAgeMs = 24 * 3600_000;
    for (const [key, last] of this.spokenMessages) {
      if (now - last >= maxAgeMs) this.spokenMessages.delete(key);
    }
    for (const [key, last] of this.pushedTips) {
      if (now - last >= maxAgeMs) this.pushedTips.delete(key);
    }
  }

  private queueSpeak(message: string, dedupKey: string, opts?: { bypassDnd?: boolean }) {
    if (!resolveVoiceAlertRules(this.appConfig.get('voice')).enabled) return;
    if (!opts?.bypassDnd && this.isVoiceDndActive()) return;
    const now = Date.now();
    this.pruneDedupMaps(now);
    const last = this.spokenMessages.get(dedupKey);
    if (last && now - last < this.SPEAK_COOLDOWN) return;
    this.spokenMessages.set(dedupKey, now);
    this.persistCooldown(`speak:${dedupKey}`, now + this.SPEAK_COOLDOWN);
    this.logger.log(`TTS 播报: ${message}`);
    this.eventBus.emit('tts.speak', { message, ts: now });
  }

  private pushTip(title: string, message: string, category: string) {
    const now = Date.now();
    this.pruneDedupMaps(now);
    const key = `${title}:${category}`;
    const last = this.pushedTips.get(key);
    if (last && now - last < this.TIP_COOLDOWN) return;
    this.pushedTips.set(key, now);
    this.persistCooldown(`tip:${key}`, now + this.TIP_COOLDOWN);
    this.logger.log(`💡 建议: [${category}] ${title} - ${message}`);
    this.eventBus.emit('advisor.tip', { title, message, category, ts: now });
  }

  private roomLabel(room: string): string {
    return resolveRoomLabelFromHaAreas(
      room,
      this.appConfig.get('envSensorMap'),
      this.entityAreaEnrichment.getCachedHaAreas(),
    );
  }
}
