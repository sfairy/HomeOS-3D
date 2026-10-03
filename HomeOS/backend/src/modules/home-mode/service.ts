/**
 * 家庭模式服务（HomeModeService）。
 *
 * 所属模块：backend/modules/home-mode
 * 职责：管理家庭模式的 CRUD、激活 / 停用、设备快照恢复、触发器绑定与自动触发、
 *  预设包安装、运行日志（触发日志 + 执行历史）的内存缓冲与防抖持久化。
 *  激活 / 停用经 DistributedLockService 串行化，避免并发切换导致互斥组与快照状态错乱；
 *  触发器仅由 HaWsLeader 副本执行，避免多副本重复激活。
 *  实现OnModuleInit/OnModuleDestroy：启动恢复激活态、加载触发器与日志、启动定时触发轮询；
 *  关机时立刻落库日志。
 * 关键依赖：
 *  - PrismaService：持久化
 *  - HaConnectorService：下发 HA 服务、采集设备快照
 *  - StateStoreService：实体缓存（预设实体推荐）
 *  - NotificationService：模式切换通知
 *  - AppConfigService：homeMode 配置（冷却、重试、日志上限）
 *  - DistributedLockService：激活互斥锁
 *  - JobRegistryService：定时触发任务编排
 *  - HaWsLeaderService：leader 副本判定
 *  - ChildModeService：child/guest 动作 ACL 拦截
 *  - actions.internals / triggers.internals / runtime.internals：拆分的纯函数
 *  - linkage-arbiter.util：联动仲裁（手动锁定 TTL）
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { notFound } from '../../common/utils/business-exception';
import { getErrorMessage } from '../../common/utils';
import { OnEvent } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { coldBatchChanges } from '../../shared/ha/cold-batch.util';
import { PrismaService } from '../../shared/prisma/service';
import type { HomeMode } from '../../generated/prisma/client';
import { BaseCrudService, type CrudWriteEvent } from '../../common/crud/base-crud.service';
import { HaConnectorService } from '../ha-connector/service';
import { StateStoreService } from '../state-store/service';
import { NotificationService } from '../notification/service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  parseHomeModeTriggerBindings,
  pruneHomeModeTriggerCooldown,
  type HomeModeTriggerBinding,
  checkHomeModeTimeTriggers,
  handleHomeModeCalendarAway,
  handleHomeModeEveryoneLeft,
  handleHomeModePresenceArrive,
  handleHomeModeStateTrigger,
  type HomeModeTriggersDeps,
  type HomeModeTriggersState,
} from './triggers.internals';
import {
  HomeModeRuntimeLogStore,
  type HomeModeExecutionRecord,
  type HomeModeTriggerLog,
  type HomeModeTriggerLogFilters,
  normalizeHomeModeJsonArray,
} from './runtime.internals';
import {
  enrichHomeModePresets,
  buildHomeModePresetInstallPlan,
  activateHomeMode,
  deactivateHomeMode,
  type HomeModeActivateDeps,
  type HomeModeActivateState,
} from './actions.internals';
import { HomeModeLinkageArbiter } from './linkage-arbiter.util';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { clampInt } from '../../common/crud/pagination.util';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { HOME_MODE_DEFAULT_MODES } from './defaults';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { HOME_MODE_ACTION_TEMPLATES } from './presets';
import { ChildModeService } from '../child-mode/service';
import type { OrchestratorExecActor } from '../scene/scene-execute-acl.util';

/**
 * 家庭模式服务（@Injectable）。
 *
 * 继承 BaseCrudService<'homeMode'>，复用分页 / 排序 / 写入钩子基础设施。
 * 激活 / 停用委托 actions.internals，触发器匹配委托 triggers.internals，
 * 运行日志委托 runtime.internals.HomeModeRuntimeLogStore。
 */
@Injectable()
export class HomeModeService
  extends BaseCrudService<'homeMode'>
  implements OnModuleInit, OnModuleDestroy
{
  /** 家庭模式切换互斥锁键（activate/deactivate 共用，确保模式转换全局串行） */
  private static readonly TRANSITION_LOCK_KEY = 'home-mode:transition';
  private readonly logger = new Logger(HomeModeService.name);
  private readonly linkageArbiter = new HomeModeLinkageArbiter();
  private activeModeId: string | null = null;
  private timeCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly runtimeLogs: HomeModeRuntimeLogStore;
  private triggerBindings: HomeModeTriggerBinding[] = [];
  private cachedModes: Array<{ id: string; name: string; triggers: unknown }> = [];
  private readonly triggerCooldown = new Map<string, number>();
  private calendarAway = false;
  private preAwayModeId: string | null = null;
  private lastTimeTriggerMinute = '';
  constructor(
    prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly notification: NotificationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly haLeader: HaWsLeaderService,
    private readonly lock: DistributedLockService,
    private readonly jobs: JobRegistryService,
    private readonly childMode: ChildModeService,
  ) {
    super(prisma, { delegate: prisma.homeMode, modelName: 'homeMode' });
    this.runtimeLogs = new HomeModeRuntimeLogStore(this.prisma, this.logger, () => ({
      maxTriggerLogs: this.maxTriggerLogs,
      maxExecHistory: this.maxExecHistory,
    }));
  }

  private get homeModeCfg() {
    return this.appConfig.get('homeMode');
  }

  private get applyMaxRetries() {
    return this.homeModeCfg.applyMaxRetries;
  }

  private get triggerCooldownMs() {
    return this.homeModeCfg.triggerCooldownMs;
  }

  private get maxTriggerLogs() {
    return this.homeModeCfg.maxTriggerLogs;
  }

  private get maxExecHistory() {
    return this.homeModeCfg.maxExecHistory;
  }

  private get activateState(): HomeModeActivateState {
    return {
      getActiveModeId: () => this.activeModeId,
      setActiveModeId: (id) => {
        this.activeModeId = id;
      },
    };
  }

  private _activateDeps: HomeModeActivateDeps | null = null;
  private get activateDeps(): HomeModeActivateDeps {
    if (!this._activateDeps) {
      this._activateDeps = {
        logger: {
          log: (msg) => this.logger.log(msg),
          warn: (msg) => this.logger.warn(msg),
        },
        prisma: this.prisma,
        haConnector: this.haConnector,
        notification: this.notification,
        eventEmitter: this.eventEmitter,
        eventBus: this.eventBus,
        appConfig: this.appConfig,
        childMode: this.childMode,
        linkageArbiter: this.linkageArbiter,
        getApplyMaxRetries: () => this.applyMaxRetries,
        pushTriggerLog: (entry) => this.pushTriggerLog(entry),
        recordExecution: (entry) => this.recordExecution(entry),
      };
    }
    return this._activateDeps;
  }

  private get triggersState(): HomeModeTriggersState {
    return {
      triggerBindings: this.triggerBindings,
      cachedModes: this.cachedModes,
      triggerCooldown: this.triggerCooldown,
      lastTimeTriggerMinute: this.lastTimeTriggerMinute,
      calendarAway: this.calendarAway,
      preAwayModeId: this.preAwayModeId,
      getActiveModeId: () => this.activeModeId,
      setLastTimeTriggerMinute: (value) => {
        this.lastTimeTriggerMinute = value;
      },
      setCalendarAway: (value) => {
        this.calendarAway = value;
      },
      setPreAwayModeId: (value) => {
        this.preAwayModeId = value;
      },
      getPreAwayModeId: () => this.preAwayModeId,
    };
  }

  private _triggersDeps: HomeModeTriggersDeps | null = null;
  private get triggersDeps(): HomeModeTriggersDeps {
    if (!this._triggersDeps) {
      this._triggersDeps = {
        logger: {
          log: (msg) => this.logger.log(msg),
          warn: (msg) => this.logger.warn(msg),
        },
        prisma: this.prisma,
        haLeader: this.haLeader,
        getTriggerCooldownMs: () => this.triggerCooldownMs,
        getHomeTimezone: () => this.appConfig.getHomeTimezone(),
        activate: (id, meta) => this.activate(id, meta),
        deactivate: () => this.deactivate(),
        getActiveMode: () => this.getActiveMode(),
      };
    }
    return this._triggersDeps;
  }

  /**
   * 模块初始化：恢复激活态、加载触发器绑定与运行日志、启动定时触发轮询（30s）。
   * 多副本环境下仅 leader 副本的定时器会实际执行触发检查。
   */
  async onModuleInit() {
    const active = await this.prisma.homeMode.findFirst({ where: { isActive: true } });
    this.activeModeId = active?.id ?? null;
    await this.reloadTriggerBindings();
    await this.runtimeLogs.load();
    this.timeCheckTimer = setInterval(() => {
      void this.jobs.run(
        'home-mode-time-triggers',
        { description: '家庭模式定时触发检查', intervalMs: 30_000 },
        () => this.checkTimeTriggers(),
      );
    }, 30_000);
    if (this.activeModeId) {
      this.logger.log(`已恢复激活家庭模式: ${active?.name}`);
    }
  }

  async onModuleDestroy() {
    if (this.timeCheckTimer) clearInterval(this.timeCheckTimer);
    await this.runtimeLogs.flushNow();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  handleConfigUpdated(sections: string[]) {
    if (sections?.length && !sections.includes('homeMode')) return;
    this.runtimeLogs.trimToLimits();
  }

  private async reloadTriggerBindings() {
    const modes = await this.prisma.homeMode.findMany({ take: 200 });
    this.cachedModes = modes;
    this.triggerBindings = parseHomeModeTriggerBindings(modes, this.logger);
    pruneHomeModeTriggerCooldown(this.triggerCooldown);
    this.logger.log(`全屋模式触发器已加载: ${this.triggerBindings.length} 条`);
  }

  private pushTriggerLog(entry: Omit<HomeModeTriggerLog, 'id' | 'executedAt'>) {
    this.runtimeLogs.pushTriggerLog(entry);
  }

  getTriggerLogs(limit = 20): HomeModeTriggerLog[] {
    return this.runtimeLogs.getTriggerLogs(limit);
  }

  getTriggerLogsPaginated(
    page = 1,
    pageSize = 20,
    filters: HomeModeTriggerLogFilters = {},
  ) {
    return this.runtimeLogs.getTriggerLogsPaginated(page, pageSize, filters);
  }

  getExecutionHistory(limit = 30): HomeModeExecutionRecord[] {
    return this.runtimeLogs.getExecutionHistory(limit);
  }

  clearExecutionHistory(): { deleted: number } {
    return this.runtimeLogs.clearExecutionHistory();
  }

  getActionTemplates() {
    return HOME_MODE_ACTION_TEMPLATES;
  }

  getPresets() {
    return this.loadPresetsWithContext();
  }

  private async loadPresetsWithContext() {
    const entityIds = this.stateStore.getAll().map((e) => e.entity_id);
    const existingModes = await this.prisma.homeMode.findMany({
      select: { id: true, name: true },
      take: 200,
    });
    return enrichHomeModePresets(entityIds, existingModes);
  }

  async installPreset(
    presetId: string,
    entityOverrides: Record<string, string> = {},
    merge = false,
  ) {
    const entityIds = this.stateStore.getAll().map((e) => e.entity_id);
    const plan = buildHomeModePresetInstallPlan(presetId, entityIds, entityOverrides);
    const { preset, config, triggersJson, unresolvedActions } = plan;

    const existing = await this.prisma.homeMode.findFirst({
      where: { name: preset.name },
    });

    if (existing && merge) {
      const row = await this.update(existing.id, {
        icon: preset.icon,
        config,
        triggers: triggersJson,
      });
      return { ...row, unresolvedActions };
    }

    if (existing) {
      const row = await this.create({
        name: `${preset.name}（预设）`,
        icon: preset.icon,
        config,
        triggers: triggersJson,
        sortOrder: (existing.sortOrder || 0) + 1,
        exclusiveGroup: preset.exclusiveGroup,
        priority: preset.priority,
      });
      return { ...row, unresolvedActions };
    }

    const maxOrder = await this.prisma.homeMode.aggregate({ _max: { sortOrder: true } });
    const row = await this.create({
      name: preset.name,
      icon: preset.icon,
      config,
      triggers: triggersJson,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      exclusiveGroup: preset.exclusiveGroup,
      priority: preset.priority,
    });
    return { ...row, unresolvedActions };
  }

  private recordExecution(entry: Omit<HomeModeExecutionRecord, 'id' | 'executedAt'>) {
    this.runtimeLogs.recordExecution(entry);
  }

  getModeContext() {
    const active = this.activeModeId
      ? this.runtimeLogs.findExecutionByModeId(this.activeModeId)
      : null;
    return {
      calendarAway: this.calendarAway,
      activeModeId: this.activeModeId,
      triggerBindingsCount: this.triggerBindings.length,
      triggerLogs: this.getTriggerLogs(8),
      recentExecutions: this.getExecutionHistory(5),
      lastActivation: active || this.runtimeLogs.getLatestExecution() || null,
    };
  }

  async duplicate(id: string) {
    const src = await this.findOne(id);
    if (!src) notFound(API_ERROR.HOME_MODE_NOT_FOUND);
    return this.create({
      name: `${src.name} 副本`,
      icon: src.icon,
      config: src.config,
      triggers: src.triggers || undefined,
      sortOrder: (src.sortOrder || 0) + 1,
      exclusiveGroup: src.exclusiveGroup || undefined,
      priority: src.priority ?? undefined,
    });
  }

  /** 批量调整模式排序（事务内逐条更新，完成后返回最新列表） */
  async reorder(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.homeMode.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return this.findAll();
  }

  private checkTimeTriggers() {
    void checkHomeModeTimeTriggers(this.triggersState, this.triggersDeps).catch((err) => {
      this.logger.warn(`时间触发器检查失败: ${getErrorMessage(err)}`);
    });
  }

  @OnEvent('homeMode.activate.request')
  async handleActivateRequest(data: { mode_id?: string; modeId?: string }) {
    const id = data.mode_id || data.modeId;
    if (!id) return;
    try {
      await this.activate(id, { source: 'manual', reason: 'automation' });
    } catch (e) {
      this.logger.warn(`自动化请求激活家庭模式失败: ${getErrorMessage(e)}`);
    }
  }

  @OnEvent('presence.changed')
  async handlePresenceArrive(data: { atHome?: boolean; name?: string }) {
    await handleHomeModePresenceArrive(this.triggersState, this.triggersDeps, data);
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  async handleStateTrigger(payload: HaStateChangeBatchEvent) {
    for (const event of coldBatchChanges(payload)) {
      await handleHomeModeStateTrigger(this.triggersState, this.triggersDeps, event);
    }
  }

  /** 404 文案：保持既有「模式不存在」 */
  protected override notFoundMessage(): string {
    return API_ERROR.HOME_MODE_NOT_FOUND;
  }

  /** 列表查询：按 sortOrder 升序 + 上限 200（与原 findAll 一致） */
  protected override listFindArgs() {
    return { orderBy: { sortOrder: 'asc' }, take: 200 };
  }

  /** 分页列表：页码/页大小兜底与原实现一致（page>=1，pageSize 夹取 [5,200]） */
  override async findAllPaginated(page = 1, pageSize = 50) {
    return super.findAllPaginated(Math.max(page, 1), clampInt(pageSize, 5, 200));
  }

  override async findOne(id: string): Promise<HomeMode | null> {
    return (await super.findOne(id)) as HomeMode | null;
  }

  /** 全量列表：收窄返回类型，供调用方直接使用模式字段 */
  override async findAll(): Promise<HomeMode[]> {
    return (await super.findAll()) as HomeMode[];
  }

  async getActive() {
    return this.prisma.homeMode.findFirst({
      where: { isActive: true },
    });
  }

  /** config/triggers JSON 数组规范化（create/update 写入共用，就地修改） */
  private normalizeHomeModeJsonFields(payload: Record<string, unknown>): Record<string, unknown> {
    if (payload.config !== undefined) {
      payload.config = normalizeHomeModeJsonArray(payload.config, 'config', true);
    }
    if (payload.triggers !== undefined) {
      payload.triggers = normalizeHomeModeJsonArray(payload.triggers, 'triggers', false);
    }
    return payload;
  }

  /** 新建前载荷整理：config/triggers 规范化 + 字段默认值（config/icon/sortOrder/exclusiveGroup/priority） */
  protected override async validateBeforeCreate(payload: Record<string, unknown>): Promise<void> {
    this.normalizeHomeModeJsonFields(payload);
    payload.config = payload.config ?? [];
    payload.icon = payload.icon || 'home';
    payload.sortOrder = payload.sortOrder || 0;
    payload.exclusiveGroup = payload.exclusiveGroup || 'default';
    payload.priority = payload.priority ?? 50;
  }

  override async create(data: {
    name: string;
    icon?: string;
    config: unknown;
    triggers?: unknown;
    sortOrder?: number;
    exclusiveGroup?: string;
    priority?: number;
  }): Promise<HomeMode> {
    return (await super.create(data)) as HomeMode;
  }

  /**
   * 更新家庭模式：仅写入显式传入字段（config/triggers 规范化；未传字段 Prisma 忽略）。
   * 与既有实现一致不做前置存在性校验（缺失 id 由 Prisma P2025 抛出），成功后刷新触发器缓存。
   */
  override async update(
    id: string,
    data: {
      name?: string;
      icon?: string;
      config?: unknown;
      triggers?: unknown;
      sortOrder?: number;
      exclusiveGroup?: string;
      priority?: number;
    },
  ): Promise<HomeMode> {
    const payload = this.normalizeHomeModeJsonFields({ ...(data as Record<string, unknown>) });
    const updated = (await this.delegate.update({
      where: { id },
      data: payload,
    })) as HomeMode;
    await this.afterWrite({ op: 'update', id, result: updated });
    return updated;
  }

  /** 删除前置：删除激活中模式（或当前激活 id）时先停用，恢复设备快照 */
  protected override async beforeRemove(id: string, existing: unknown): Promise<void> {
    const row = existing as HomeMode;
    if (row.isActive || this.activeModeId === id) {
      await this.deactivate(id);
    }
  }

  /** 删除家庭模式：返回被删除记录（保持既有响应形状），成功后刷新触发器缓存 */
  override async remove(id: string): Promise<HomeMode> {
    const row = (await this.delegate.findUnique({ where: { id } })) as HomeMode | null;
    if (!row) notFound(API_ERROR.HOME_MODE_NOT_FOUND);
    await this.beforeRemove(id, row);
    const removed = (await this.delegate.delete({ where: { id } })) as HomeMode;
    await this.afterWrite({ op: 'remove', id, before: row, result: removed });
    return removed;
  }

  /** 写入成功后刷新全屋模式触发器缓存（create/update/remove 统一生效） */
  protected override async afterWrite(_event: CrudWriteEvent): Promise<void> {
    await this.reloadTriggerBindings();
  }

  /** 串行化家庭模式切换，避免并发激活/停用导致互斥组与快照状态错乱（多副本时经 Redis 锁） */
  async activate(
    id: string,
    meta?: {
      source?: HomeModeTriggerLog['source'];
      reason?: string;
      actor?: OrchestratorExecActor;
    },
  ) {
    return this.lock.runExclusive(HomeModeService.TRANSITION_LOCK_KEY, () =>
      activateHomeMode(this.activateState, this.activateDeps, id, meta),
    );
  }

  async deactivate(modeId?: string) {
    return this.lock.runExclusive(HomeModeService.TRANSITION_LOCK_KEY, () =>
      deactivateHomeMode(this.activateState, this.activateDeps, modeId),
    );
  }

  getActiveModeId(): string | null {
    return this.activeModeId;
  }

  private async getActiveMode() {
    if (!this.activeModeId) return null;
    return this.prisma.homeMode.findUnique({ where: { id: this.activeModeId } });
  }

  @OnEvent('calendar.awayChanged')
  async handleCalendarAway(data: { away?: boolean }) {
    await handleHomeModeCalendarAway(this.triggersState, this.triggersDeps, data);
  }

  async seedDefaults() {
    const count = await this.prisma.homeMode.count();
    if (count > 0) return;

    for (const mode of HOME_MODE_DEFAULT_MODES) {
      await this.prisma.homeMode.create({ data: mode });
    }
    this.logger.log(`已创建 ${HOME_MODE_DEFAULT_MODES.length} 个默认全屋模式`);
  }

  @OnEvent('presence.everyoneLeft')
  async handleEveryoneLeft() {
    await handleHomeModeEveryoneLeft(this.triggersState, this.triggersDeps);
  }
}
