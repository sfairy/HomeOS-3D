/**
 * 首装向导服务
 *
 * 模块：system/setup
 * 职责：
 *  - getStatus：返回各步骤完成度（connection / security / energy / environment / complete）
 *  - validateEntities：批量校验 entity（state-store，未命中再查 HA 实时状态）
 *  - completeWizard：完成向导并启用能源学习期（幂等）
 *  - reduceSecuritySensitivity：误报反馈时延长传感器告警冷却
 *  - getPostSetupChecklist：首装后引导任务清单（户型图 / 常用设备 / 场景 / 自动化 / 联动占位符 / 语音）
 *  - getBindingGaps：集成绑定缺口清单
 *  - getConfigHealthScore：配置健康评分（绑定缺口 / HA / 占位自动化）
 *
 * 依赖：
 *  - AppConfigService  读取 energy / security / voice / external / other 配置
 *  - PrismaService     读取 projectConfig / automation / scene / securityEvent
 *  - HaConnectorService HA 连接状态
 *  - StateStoreService  实体存在性校验
 *  - RedisService       Redis 就绪状态
 *  - ConfigService      读取 REDIS_URL
 */
import { Injectable, Logger } from '@nestjs/common';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { badRequest } from '../../../common/utils/business-exception';
import { scheduleBackgroundTask } from '../../../common/resilience/circuit-breaker.helper';
import { AppConfigService } from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { HaConnectorService } from '../../ha-connector/service';
import { StateStoreService } from '../../state-store/service';
import { RedisService } from '../../../shared/redis/service';
import { ConfigService } from '@nestjs/config';
import { parseCircuitEntityIds } from '../../energy/circuit.util';
import {
  collectBindingGaps,
  type BindingGapItem,
  findReplaceableEntityIdsInYaml,
  findReplaceableEntityIdsInSceneEntities,
} from '@homeos/shared';
import { readJsonObject } from '../../../common/utils/json-field.util';

/** 首装后引导任务清单项 ID */
type SetupChecklistItemId =
  | 'floorplan'
  | 'favorites'
  | 'scene'
  | 'automation'
  | 'voice'
  | 'orchestrator-placeholders';

/** 首装向导步骤 ID */
type SetupWizardStepId =
  | 'connection'
  | 'security'
  | 'energy'
  | 'environment'
  | 'dashboard'
  | 'complete';

/**
 * 首装向导服务
 *
 * 由 SystemSetupController 调用，封装向导状态查询 / 完成 / 误报反馈 / 引导任务清单。
 */
@Injectable()
export class SetupWizardService {
  private readonly logger = new Logger(SetupWizardService.name);
  /** 配置健康评分缓存（避免频繁扫表，TTL 60s） */
  private configHealthCache: {
    at: number;
    data: Awaited<ReturnType<SetupWizardService['computeConfigHealthScore']>>;
  } | null = null;
  /** 健康评分缓存 TTL（毫秒） */
  private static readonly HEALTH_CACHE_TTL_MS = 60_000;
  /** 引导清单短缓存（刷新页重复请求） */
  private checklistCache: {
    at: number;
    data: Awaited<ReturnType<SetupWizardService['buildPostSetupChecklist']>>;
  } | null = null;
  private static readonly CHECKLIST_CACHE_TTL_MS = 15_000;

  /**
   * @param appConfig   应用配置
   * @param prisma      Prisma 访问
   * @param haConnector HA 连接器（状态快照）
   * @param stateStore  实体状态存储（存在性校验）
   * @param redis       Redis（就绪状态）
   * @param config      Nest 配置（REDIS_URL）
   */
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 当前激活 display profile（与 HA / UI 保存目标一致）。
   */
  private resolveActiveProjectId(): string {
    return String(this.appConfig.get('profiles')?.activeProfileId || '').trim() || 'default';
  }

  /**
   * 读取已配置的门铃数量（从 projectConfig.layout.haConfig.doorbells 中统计有效条目）。
   * 解析失败 / 无配置时返回 0，不抛出。
   */
  private async getConfiguredDoorbellCount(): Promise<number> {
    try {
      const row = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!row?.layout) return 0;
      const layout = readJsonObject(row.layout) as {
        haConfig?: { doorbells?: Array<{ triggerEntityId?: string }> };
      };
      const hc = layout.haConfig || {};
      const list = hc.doorbells || [];
      return list.filter((d) => d.triggerEntityId?.trim()).length;
    } catch (err: unknown) {
      this.logger.debug(`读取门铃配置失败: ${String(err)}`);
      return 0;
    }
  }

  /**
   * 统计已绑定环境传感器的房间数（temperature / humidity / pm25 / co2 任一非空即算）。
   * 跳过 _hidden=true 的房间。
   *
   * @param map roomId → 字段映射
   */
  private countEnvRooms(map: Record<string, Record<string, string>> | undefined): number {
    if (!map) return 0;
    return Object.entries(map).filter(([_roomId, entry]) => {
      if ((entry as { _hidden?: boolean })?._hidden) return false;
      return ['temperature', 'humidity', 'pm25', 'co2'].some((k) => String(entry[k] || '').trim());
    }).length;
  }

  /**
   * 是否已配置移动传感器（从 projectConfig.layout.haConfig.motionSensorEntityId 判定）。
   */
  private async getConfiguredMotionSensor(): Promise<boolean> {
    try {
      const row = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!row?.layout) return false;
      const layout = readJsonObject(row.layout) as { haConfig?: { motionSensorEntityId?: string } };
      return Boolean(layout.haConfig?.motionSensorEntityId?.trim());
    } catch {
      return false;
    }
  }
  /**
   * 获取首装向导状态：各步骤完成度 + HA / Redis / 能源学习期状态。
   * 步骤判定：
   *  - connection   HA 已连接 + 实体数 > 0
   *  - security     门铃数 > 0 或已配置移动传感器
   *  - energy       已绑定主电表 entity_id
   *  - environment  已绑定环境传感器的房间数 >= 3
   *  - dashboard    已上传户型图或收藏 ≥1 个常用设备（可选，不阻断完成）
   *  - complete     能源学习期已启动（learningStartedAt 非空）
   */
  async getStatus() {
    const haStatus = await this.haConnector.getStatus();
    const entityCount = this.stateStore.getCount();
    const cfg = this.appConfig.getAll();
    const energy = this.appConfig.get('energy');
    const envMap = cfg.envSensorMap as Record<string, Record<string, string>> | undefined;
    const doorbellCount = await this.getConfiguredDoorbellCount();
    const motionConfigured = await this.getConfiguredMotionSensor();
    const envRoomCount = this.countEnvRooms(envMap);

    const layout = await this.getProjectLayout();
    const favoriteCount = this.countFavoriteEntities(layout);
    const hasFloorplan = this.hasCustomFloorplan(layout);
    const dashboardDone = hasFloorplan || favoriteCount >= 1;

    const steps: Record<SetupWizardStepId, { done: boolean; hint?: string }> = {
      connection: {
        done: haStatus.connected && entityCount > 0,
        hint: haStatus.connected ? undefined : '请确认 HA 地址与 Token，并保持 HA 在线',
      },
      security: {
        done: doorbellCount > 0 || motionConfigured,
        hint: '至少配置一路门铃触发实体或移动传感器',
      },
      energy: {
        done: Boolean(energy.meterEntityId?.trim()),
        hint: '请绑定主电表 entity_id',
      },
      environment: {
        done: envRoomCount >= 3,
        hint: '在 HA 配置区域后，至少为 3 个区域绑定环境传感器',
      },
      dashboard: {
        done: dashboardDone,
        hint: dashboardDone
          ? undefined
          : '可选：上传户型图，或在常用设备中收藏至少 1 个实体',
      },
      complete: {
        done: Boolean(energy.learningStartedAt),
        hint: '完成向导以启用能源学习期',
      },
    };

    const completed = Object.values(steps).filter((s) => s.done).length;
    const redisConfigured = Boolean(this.config.get('REDIS_URL'));
    return {
      steps,
      progress: Math.round((completed / Object.keys(steps).length) * 100),
      ha: { connected: haStatus.connected, entityCount },
      redis: {
        configured: redisConfigured,
        ok: redisConfigured ? this.redis.isReady() : null,
      },
      retentionDays:
        this.appConfig.get('retention')?.eventLog ??
        this.appConfig.get('other').eventlogRetentionDays ??
        7,
      circuitCount: parseCircuitEntityIds(energy).length,
      learningPeriodDays: energy.learningPeriodDays ?? 7,
      learningStartedAt: energy.learningStartedAt || null,
    };
  }

  /**
   * 批量校验 entity_id 是否可用。
   * 先查 state-store；未命中再向 HA 拉一次实时状态
   * （门铃 button 等可能被同步过滤，但 HA 里仍存在）。
   */
  async validateEntities(entityIds: string[]) {
    const missing: string[] = [];
    const valid: string[] = [];
    const needHa: string[] = [];
    for (const id of entityIds) {
      const eid = String(id || '').trim();
      if (!eid) continue;
      if (this.stateStore.getById(eid)) valid.push(eid);
      else needHa.push(eid);
    }
    for (const eid of needHa) {
      try {
        const live = await this.haConnector.fetchEntityState(eid);
        if (live?.entity_id) valid.push(eid);
        else missing.push(eid);
      } catch {
        missing.push(eid);
      }
    }
    return { valid, missing, allOk: missing.length === 0 };
  }

  /**
   * 完成首装向导并启用能源学习期。
   * 幂等：已完成则保留首次 learningStartedAt，避免重复调用重置能源学习期。
   *
   * @param opts.learningPeriodDays 学习期天数（可选，缺省用 energy.learningPeriodDays 或 7）
   * @returns success + learningPeriodDays
   * @throws BadRequestException 必要步骤未完成（connection / energy / environment；security/dashboard 可跳过）
   */
  async completeWizard(opts?: { learningPeriodDays?: number }) {
    const status = await this.getStatus();
    // 与前端一致：安防 / 户型收藏可稍后补齐，不阻断完成向导
    const required: SetupWizardStepId[] = ['connection', 'energy', 'environment'];
    const pending = required.filter((id) => !status.steps[id]?.done);
    if (pending.length) {
      badRequest(API_ERROR.SETUP_WIZARD_STEPS_PENDING(pending.join('、')));
    }
    const energy = this.appConfig.get('energy');
    const days = opts?.learningPeriodDays ?? energy.learningPeriodDays ?? 7;
    // 幂等：已完成则保留首次 learningStartedAt，避免重复调用重置能源学习期
    const update: { learningPeriodDays: number; learningStartedAt?: string } = {
      learningPeriodDays: days,
    };
    if (!energy.learningStartedAt) {
      update.learningStartedAt = new Date().toISOString();
    }
    await this.appConfig.update({
      energy: update,
    } as Parameters<AppConfigService['update']>[0]);
    return { success: true, learningPeriodDays: days };
  }

  /**
   * 降低安防传感器告警灵敏度（误报反馈时调用）。
   * 副作用：
   *  - sensorAlertCooldownSec += 120（上限 600）
   *  - 可选写入 securityEvent 记录（type=false_alarm_feedback）
   *
   * @param opts.recordFeedback 是否记录到 securityEvent 表
   * @param opts.source         反馈来源（如 web / voice）
   * @returns 新的 sensorAlertCooldownSec
   */
  async reduceSecuritySensitivity(opts?: { recordFeedback?: boolean; source?: string }) {
    const sec = this.appConfig.get('security');
    const next = Math.min(600, (sec.sensorAlertCooldownSec || 60) + 120);
    await this.appConfig.update({
      security: { sensorAlertCooldownSec: next },
    } as Parameters<AppConfigService['update']>[0]);

    if (opts?.recordFeedback) {
      const source = opts.source || 'unknown';
      const detail = `用户误报反馈，冷却延长至 ${next}s（来源: ${source}）`;
      // 异步写入 securityEvent，不阻塞响应
      scheduleBackgroundTask(this.logger, 'SecurityEvent 误报反馈', () =>
        this.prisma.securityEvent.create({
          data: {
            type: 'false_alarm_feedback',
            mode: 'disarmed',
            detail,
            zones: '[]',
          },
        }),
      );
    }

    return { sensorAlertCooldownSec: next };
  }
  /**
   * 读取当前激活方案的 layout JSON（解析失败返回 null）。
   */
  private async getProjectLayout(): Promise<Record<string, unknown> | null> {
    try {
      const row = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!row?.layout) return null;
      return readJsonObject(row.layout);
    } catch {
      return null;
    }
  }

  /**
   * 获取 HA 配置快照（layout.haConfig 段），用于 UI 展示当前已绑定的实体。
   */
  async getHaConfigSnapshot(): Promise<Record<string, unknown>> {
    const layout = await this.getProjectLayout();
    return (layout?.haConfig || {}) as Record<string, unknown>;
  }

  /**
   * 统计联动器中含"可替换占位实体"的条目数（自动化 YAML + 场景 entities）。
   * 分批扫描（batchSize=100），避免单次查询过大。
   */
  private async countOrchestratorPlaceholdersByKind(): Promise<{
    automations: number;
    scenes: number;
  }> {
    const batchSize = 100;
    let automations = 0;
    let scenes = 0;
    let skip = 0;
    while (true) {
      const batch = await this.prisma.automation.findMany({
        select: { yaml: true },
        skip,
        take: batchSize,
      });
      for (const row of batch) {
        if (findReplaceableEntityIdsInYaml(String(row.yaml || '')).length > 0) automations++;
      }
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
    skip = 0;
    while (true) {
      const batch = await this.prisma.scene.findMany({
        select: { entities: true },
        skip,
        take: batchSize,
      });
      for (const row of batch) {
        if (
          findReplaceableEntityIdsInSceneEntities(
            typeof row.entities === 'string' ? row.entities : JSON.stringify(row.entities ?? []),
          ).length > 0
        ) {
          scenes++;
        }
      }
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
    return { automations, scenes };
  }

  private async countOrchestratorPlaceholders(): Promise<number> {
    const { automations, scenes } = await this.countOrchestratorPlaceholdersByKind();
    return automations + scenes;
  }

  /**
   * 统计已收藏的实体数量（layout.favoriteEntities 各类别去空求和）。
   */
  private countFavoriteEntities(layout: Record<string, unknown> | null): number {
    const fe = layout?.favoriteEntities as Record<string, string[]> | undefined;
    if (!fe) return 0;
    return Object.values(fe).reduce(
      (sum, ids) => sum + (Array.isArray(ids) ? ids.filter(Boolean).length : 0),
      0,
    );
  }

  /**
   * 判断是否已上传自定义户型图。
   * 判定条件：floors 数组非空 + 至少一个 backgroundUrl 非空且非默认占位图（lights_off.png）。
   */
  private hasCustomFloorplan(layout: Record<string, unknown> | null): boolean {
    if (!layout) return false;
    const floors = layout.floors as Array<{ backgroundUrl?: string }> | undefined;
    if (!Array.isArray(floors) || !floors.length) return false;
    return floors.some((f) => {
      const url = String(f.backgroundUrl || '').trim();
      return url && !url.includes('lights_off.png');
    });
  }

  /**
   * 获取首装后引导任务清单（关键路径）。
   * 6 项任务：户型图 / 常用设备 / 场景 / 自动化 / 联动占位符 / 语音播报。
   * 每项含 done / hint / route（深链到设置页对应 tab）。
   *
   * visible = 向导已完成 && 未 dismissed && 完成数 < 总数
   */
  async getPostSetupChecklist() {
    const now = Date.now();
    if (
      this.checklistCache &&
      now - this.checklistCache.at < SetupWizardService.CHECKLIST_CACHE_TTL_MS
    ) {
      return this.checklistCache.data;
    }
    const data = await this.buildPostSetupChecklist();
    this.checklistCache = { at: now, data };
    return data;
  }

  private async buildPostSetupChecklist() {
    const voice = this.appConfig.get('voice');
    const external = this.appConfig.get('external');
    const other = this.appConfig.get('other');
    const [layout, sceneCount, automationCount] = await Promise.all([
      this.getProjectLayout(),
      this.prisma.scene.count(),
      this.prisma.automation.count(),
    ]);
    // 无自动化 / 场景时跳过占位符扫描（避免无意义扫表）
    const placeholderTotal =
      automationCount + sceneCount === 0 ? 0 : await this.countOrchestratorPlaceholders();
    const favoriteCount = this.countFavoriteEntities(layout);
    // 语音就绪：已配置 TTS 播报实体 或 启用了日常播报
    const voiceReady = Boolean(
      (Array.isArray(external?.ttsMediaPlayerIds) &&
        external.ttsMediaPlayerIds.some((id: string) => String(id || '').trim())) ||
      voice?.dailyAdvisorSpeak,
    );

    const items: Record<
      SetupChecklistItemId,
      { id: SetupChecklistItemId; label: string; done: boolean; hint: string; route?: string }
    > = {
      floorplan: {
        id: 'floorplan',
        label: '上传户型图',
        done: this.hasCustomFloorplan(layout),
        hint: '设置 → 仪表板布局 → 楼层管理',
        route: '/settings?tab=layout&section=floors',
      },
      favorites: {
        id: 'favorites',
        label: '配置 3 个常用设备',
        done: favoriteCount >= 3,
        hint: `已配置 ${favoriteCount}/3 个`,
        route: '/settings?tab=favorites',
      },
      scene: {
        id: 'scene',
        label: '添加 1 条场景',
        done: sceneCount >= 1,
        hint: '设置 → 联动中心 → 场景',
        route: '/settings?tab=orchestrator&orchTab=scene',
      },
      automation: {
        id: 'automation',
        label: '安装 1 条自动化模板',
        done: automationCount >= 1,
        hint: '设置 → 联动中心 → 自动化 → 内置模板',
        route: '/settings?tab=orchestrator&orchTab=automation',
      },
      'orchestrator-placeholders': {
        id: 'orchestrator-placeholders',
        label: '联动器占位符',
        done: placeholderTotal === 0,
        hint:
          placeholderTotal > 0
            ? `仍有 ${placeholderTotal} 条联动含未替换占位实体`
            : '所有联动器占位符已替换',
        route: '/settings?tab=orchestrator',
      },
      voice: {
        id: 'voice',
        label: '测试语音播报',
        done: voiceReady,
        hint: '设置 → 语音 → 播报输出',
        route: '/settings?tab=voice&section=output',
      },
    };

    const list = Object.values(items);
    const completed = list.filter((i) => i.done).length;
    const dismissed = Boolean(other.setupChecklistDismissedAt);
    const wizardComplete = Boolean(this.appConfig.get('energy').learningStartedAt);

    return {
      items: list,
      completed,
      total: list.length,
      dismissed,
      dismissedAt: other.setupChecklistDismissedAt || null,
      // 仅在向导完成 + 未 dismissed + 还有未完成项时显示
      visible: wizardComplete && !dismissed && completed < list.length,
    };
  }

  /**
   * 关闭首装后引导任务清单提示（记录 dismissedAt 时间戳）。
   */
  async dismissPostSetupChecklist() {
    const at = new Date().toISOString();
    await this.appConfig.update({
      other: { setupChecklistDismissedAt: at },
    } as Parameters<AppConfigService['update']>[0]);
    this.checklistCache = null;
    return { dismissedAt: at };
  }
  /**
   * 获取集成绑定缺口清单（含修复深链）。
   * 委托给 @homeos/shared 的 collectBindingGaps，传入 layout 中的各配置段。
   *
   * @returns gaps 缺口列表（每项含 severity / hint / route）
   */
  async getBindingGaps(): Promise<{ gaps: BindingGapItem[] }> {
    const layout = (await this.getProjectLayout()) || {};
    const hc = (layout.haConfig || {}) as Record<string, unknown>;
    const stats = (layout.statsSensors || {}) as Record<string, unknown>;
    const envMap = (layout.envSensorMap || {}) as Record<string, unknown>;
    const footerItems = (layout.dashboardFooter as { items?: unknown[] } | undefined)?.items;
    const gaps = collectBindingGaps({
      haConfig: hc,
      statsSensors: stats,
      envSensorMap: envMap,
      dashboardFooterItems: Array.isArray(footerItems)
        ? (footerItems as Parameters<typeof collectBindingGaps>[0]['dashboardFooterItems'])
        : undefined,
    });
    return { gaps };
  }

  /**
   * 获取配置健康评分（带 60s 缓存）。
   * 评分逻辑：
   *  - 初始 100 分
   *  - 每个 warn 级缺口 -8，普通缺口 -4
   *  - HA 未连接 -15
   *  - 占位自动化 -4/条（上限 -20）
   *  - 占位场景 -3/条（上限 -12）
   *  - 无 advisor 动作绑定 -5
   *  - 最终 clamp 到 [0, 100]
   *
   * @returns score / haConnected / bindingGapCount / placeholderAutomationCount / placeholderSceneCount / advisorActionsBound / gaps
   */
  async getConfigHealthScore() {
    const now = Date.now();
    // 命中缓存则直接返回，避免频繁扫表
    if (
      this.configHealthCache &&
      now - this.configHealthCache.at < SetupWizardService.HEALTH_CACHE_TTL_MS
    ) {
      return this.configHealthCache.data;
    }
    const data = await this.computeConfigHealthScore();
    this.configHealthCache = { at: now, data };
    return data;
  }

  /**
   * 实际计算配置健康评分（无缓存）。
   * 综合：绑定缺口 + HA 连接 + 占位自动化 / 场景 + advisor 动作绑定。
   */
  private async computeConfigHealthScore() {
    const { gaps } = await this.getBindingGaps();
    let score = 100;
    for (const g of gaps) {
      score -= g.severity === 'warn' ? 8 : 4;
    }
    const haOk = this.haConnector.getStatusSnapshot().connected;
    if (!haOk) score -= 15;
    const { automations: placeholderAutomations, scenes: placeholderScenes } =
      await this.countOrchestratorPlaceholdersByKind();
    score -= Math.min(20, placeholderAutomations * 4);
    score -= Math.min(12, placeholderScenes * 3);
    const other = this.appConfig.get('other');
    const advisorBound = Object.keys(other.advisorTipActions || {}).filter(
      (k) => (other.advisorTipActions as Record<string, { id?: string }>)?.[k]?.id,
    ).length;
    if (advisorBound === 0) score -= 5;
    score = Math.max(0, Math.min(100, score));
    return {
      score,
      haConnected: haOk,
      bindingGapCount: gaps.length,
      placeholderAutomationCount: placeholderAutomations,
      placeholderSceneCount: placeholderScenes,
      advisorActionsBound: advisorBound,
      gaps,
    };
  }
}