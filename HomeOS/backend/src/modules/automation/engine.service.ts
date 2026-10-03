/**
 * 自动化引擎服务。
 *
 * 所属模块：backend/modules/automation
 * 职责：自动化规则的核心运行时——加载 DB 规则 → 构建 watch index → 订阅 HA 状态变化 /
 *  事件 / 定时任务，按触发器（state / time / numeric_state / sun / event / zone / webhook /
 *  calendar / interval）评估条件并执行动作（call_service / delay / choose / repeat /
 *  variable_set / notify 等）。同时提供手动触发、试运行（dry-run）、规则查重、
 *  执行历史与运行状态持久化能力。
 *  本地引擎与 HA 端执行互斥：runOnHa=true 时本地跳过，改由 HA automation.triggered 事件回读。
 * 关键依赖：
 *  - HaConnectorService / HaStateChangeRouterService：HA 实时事件流
 *  - HaWsLeaderService：多副本下仅 Leader 订阅触发
 *  - StateStoreService：实体状态查询
 *  - SceneService / ScriptService / AutomationVariableService：动作执行依赖
 *  - JobRegistryService：定时触发（time / interval / sun）
 *  - RedisService：跨副本运行状态持久化与事件总线
 * 子模块：
 *  - engine-triggers.internals：触发器评估
 *  - engine-conditions.internals：条件评估
 *  - engine-actions.internals：动作执行
 *  - engine-execute.internals：执行历史与试运行
 *  - engine-dryrun.internals：dry-run 实现
 *  - engine-state-persist.helper：运行状态快照持久化
 *  - automation-ha-readback.helper：HA 触发回读历史
 *  - webhook-verify.helper：webhook 签名校验
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { getErrorMessage } from '../../common/utils';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { RedisService } from '../../shared/redis/service';
import { PrismaService } from '../../shared/prisma/service';
import { HaConnectorService } from '../ha-connector/service';
import { StateStoreService } from '../state-store/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { HA_EVENTS } from '../../shared/types';
import type {
  HaAutomationTriggeredEvent,
  HaStateChangeBatchEvent,
  HaStateChangeEvent,
} from '../../shared/types';
import { coldBatchChanges } from '../../shared/ha/cold-batch.util';
import { AutomationWatchIndexService } from '../../shared/ha/watch-index.services';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { shouldAutomationProcessEntity } from '../../shared/ha/state-change-filter.util';
import { zonedDateParts } from '@homeos/shared';
import { SceneService } from '../scene/service';
import { ScriptService } from '../script/service';
import { AutomationVariableService } from './variable.service';
import { checkAutomationConditionList, type AutomationConditionDeps } from './engine-conditions.internals';
import {
  AUTOMATION_ENGINE_CAPABILITIES,
  parseAutomationYaml,
  type AutomationRule,
} from './yaml-parse.util';
import {
  computeAutomationSignature,
  computeSignatureFromYaml,
  findAutomationDuplicates,
} from './automation-duplicate.util';
import {
  emptyAutomationRulesResult,
  loadAutomationRulesFromDb,
} from './rule-loader.util';
import type { AutomationActionDeps } from './engine-actions.internals';
import { buildAutomationRuleIndex, type AutomationRuleIndex } from './rule-index.util';
import {
  createAutomationActionDeps,
  createAutomationTriggerDeps,
  dispatchEventTriggers,
  parseIntervalSeconds,
  processForDurationPending,
  scanTimeBasedTriggers,
  trackCalendarTrigger,
  trackNumericTrigger,
  trackStateTrigger,
  trackZoneTrigger,
  type AutomationTriggerDeps,
} from './engine-triggers.internals';
import {
  clearAutomationExecutionHistory,
  createAutomationExecuteDeps,
  executeAutomationRule,
  getAutomationExecutionAnalytics,
  getAutomationExecutionHistory,
  recordAutomationStartTrigger,
  runManualAutomationTrigger,
  shouldSkipAutomationStartTrigger,
  tryExecuteTimeTriggeredRule,
  type AutomationEngineRunRuntime,
  type AutomationExecuteDeps,
  type AutomationExecuteState,
} from './engine-execute.internals';
import {
  checkAutomationConditions,
  createAutomationConditionDeps,
  isSunTriggerNow,
  resolveAutomationTemplateWithRuntime,
} from './engine-conditions.internals';
import { dryRunAutomation, type AutomationDryRunDeps } from './engine-dryrun.internals';
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { recordAutomationHaTriggeredExecution } from './automation-ha-readback.helper';
import { verifyWebhookTriggerSignature } from './webhook-verify.helper';
import {
  buildAutomationRuntimeSnapshot,
  loadAutomationRuntimeSnapshot,
  mergeAutomationRuntimeSnapshot,
  saveAutomationRuntimeSnapshot,
} from './engine-state-persist.helper';

@Injectable()
/**
 * AutomationEngineService：Nest @Injectable 服务。
 * - 职责：封装引擎状态机与执行管线；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AutomationEngineService
 */
export class AutomationEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationEngineService.name);
  private rules: AutomationRule[] = [];
  private ruleIndex: AutomationRuleIndex = buildAutomationRuleIndex([]);
  private watchedEntityIds = new Set<string>();
  private wildcardPrefixes: string[] = [];
  private hasEventTriggers = false;
  private readonly lastTriggered = new Map<string, number>();
  /** state 触发器 for 持续时间跟踪：key = ruleId:triggerIdx:entityId */
  private readonly forPending = new Map<string, number>();
  private readonly runningRules = new Map<string, Promise<void>>();
  /** parallel 模式：规则 id → 进行中任务集合（并发上限控制） */
  private readonly parallelRunning = new Map<string, Set<Promise<void>>>();
  private readonly ruleQueues = new Map<string, Array<() => Promise<void>>>();
  private readonly queueProcessing = new Set<string>();
  private readonly runTokens = new Map<string, number>();
  /** 定时触发器：同一规则同一分钟仅执行一次 */
  private readonly lastTimeFireMinute = new Map<string, string>();
  /** runOnHa 自动化 HA 触发回读去重：key = automationId:triggerId|触发秒，value = 触发秒 */
  private readonly haTriggeredDedup = new Map<string, number>();
  /** DAG 互斥编排：mutex_group → 当前占用该组的规则 id */
  private readonly mutexOwner = new Map<string, string>();
  /** mutex_group → 占用计数（parallel/restart 多实例共用同一组） */
  private readonly mutexHoldCount = new Map<string, number>();
  /** per-entity 触发合并去抖：entityId → { 最新事件, 定时器 } */
  private readonly pendingEntityEvents = new Map<
    string,
    { event: HaStateChangeEvent; timer: NodeJS.Timeout }
  >();
  private forCheckTimer: NodeJS.Timeout | null = null;
  private intervalCheckTimer: NodeJS.Timeout | null = null;
  /** 运行态快照定时器 */
  private runtimeSnapshotTimer: NodeJS.Timeout | null = null;
  /** interval 触发：ruleId → 上次触发时间戳 */
  private readonly lastIntervalFire = new Map<string, number>();
  /** loop_start/stop：false 表示已停用循环；缺省视为运行中 */
  private readonly loopArmed = new Map<string, boolean>();

  /** reloadRules 合并去抖：进行中期间再有请求，在结束后补跑一次即可（避免串行排队） */
  private reloadInProgress: Promise<void> | null = null;
  private reloadRequestedAfterInProgress = false;

  private get triggerCooldownMs() {
    return this.appConfig.get('automation').triggerCooldownMs;
  }

  /** HA 断连或实体陈旧时跳过本地触发评估（可配置） */
  private shouldSkipWhenHaStale(): boolean {
    const cfg = this.appConfig.get('automation');
    if (cfg.skipWhenHaStale === false) return false;
    if (!this.haConnector.isConnected()) return true;
    return this.stateStore.getStaleInfo().stale;
  }
  private get timeScanIntervalSec() {
    return this.appConfig.get('automation').timeScanIntervalSec;
  }
  private timeCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly redis: RedisService,
    private readonly appConfig: AppConfigService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly automationWatchIndex: AutomationWatchIndexService,
    private readonly haLeader: HaWsLeaderService,
    private readonly sceneService: SceneService,
    private readonly scriptService: ScriptService,
    private readonly variableService: AutomationVariableService,
    private readonly jobs: JobRegistryService,
  ) {}

  async onModuleInit() {
    await this.loadRules();
    this.startTimeBasedTriggers();
    this.startRuntimeSnapshotTimer();
    // for_duration / interval 两个 1s 定时器由 loadRules 内的 syncSecondaryTimers 按需启停
    this.logger.log(`自动化引擎已启动,加载 ${this.rules.length} 条规则`);
  }

  onModuleDestroy() {
    if (this.timeCheckTimer) {
      clearInterval(this.timeCheckTimer);
      this.timeCheckTimer = null;
    }
    if (this.forCheckTimer) {
      clearInterval(this.forCheckTimer);
      this.forCheckTimer = null;
    }
    if (this.intervalCheckTimer) {
      clearInterval(this.intervalCheckTimer);
      this.intervalCheckTimer = null;
    }
    if (this.runtimeSnapshotTimer) {
      clearInterval(this.runtimeSnapshotTimer);
      this.runtimeSnapshotTimer = null;
    }
    // 清理实体触发去抖待处理定时器，避免停机后回调
    for (const { timer } of this.pendingEntityEvents.values()) {
      clearTimeout(timer);
    }
    this.pendingEntityEvents.clear();
    // 停机前做一次最终快照，尽量保留 for 计时与去重状态
    void this.saveRuntimeState();
  }

  private entityStateOf(entityId: string): string | undefined {
    return this.stateStore.getById(entityId)?.state;
  }

  private get runRuntime(): AutomationEngineRunRuntime {
    const ext = this.appConfig.get('external');
    const autoCfg = this.appConfig.get('automation');
    return {
      logger: this.logger,
      prisma: this.prisma,
      haConnector: this.haConnector,
      stateStore: this.stateStore,
      eventEmitter: this.eventEmitter,
      eventBus: this.eventBus,
      sceneService: this.sceneService,
      scriptService: this.scriptService,
      triggerAutomation: (id) => this.triggerAutomation(id),
      variableService: {
        upsertSet: (input) => this.variableService.upsertSet(input),
        getValue: (key, scope, ruleId) => this.variableService.getValue(key, scope, ruleId),
        applyMath: (input) => this.variableService.applyMath(input),
        applyFn: (input) => this.variableService.applyFn(input),
      },
      weatherLat: ext.weatherLat,
      weatherLon: ext.weatherLon,
      homeTimezone: this.appConfig.getHomeTimezone(),
      maxHistory: this.maxHistory,
      entityStateOf: (id) => this.entityStateOf(id),
      entityAttrOf: (id, attr) => {
        const raw = this.stateStore.getById(id)?.attributes?.[attr];
        return raw != null ? String(raw) : undefined;
      },
      retryDefaults: {
        count: autoCfg.actionRetryCount,
        delayMs: autoCfg.actionRetryDelayMs,
      },
      maxParallelRuns: autoCfg.maxParallelRuns,
      maxQueueLength: autoCfg.maxQueueLength,
      waitTemplateTimeoutSec: autoCfg.waitTemplateTimeoutSec,
      maxDelaySeconds: autoCfg.maxDelaySeconds,
      maxRepeatIterations: autoCfg.maxRepeatIterations,
    };
  }

  async loadRules() {
    try {
      const loaded = await loadAutomationRulesFromDb({
        prisma: this.prisma,
        logger: this.logger,
        haSyncEnabled: this.appConfig.get('automation').haSyncEnabled,
      });
      this.rules = loaded.rules;
      this.watchedEntityIds = loaded.watchedEntityIds;
      this.wildcardPrefixes = loaded.wildcardPrefixes;
      this.hasEventTriggers = loaded.hasEventTriggers;
      this.ruleIndex = loaded.ruleIndex;
      this.automationWatchIndex.updateFromRules(this.rules);
      this.logger.log(`成功解析 ${loaded.parsedCount}/${loaded.totalFetched} 条自动化规则`);
    } catch (e) {
      this.logger.error(`加载自动化规则失败: ${e}`);
      const empty = emptyAutomationRulesResult();
      this.rules = empty.rules;
      this.watchedEntityIds = empty.watchedEntityIds;
      this.wildcardPrefixes = empty.wildcardPrefixes;
      this.hasEventTriggers = empty.hasEventTriggers;
      this.ruleIndex = empty.ruleIndex;
      this.automationWatchIndex.updateFromRules([]);
    }
    // 首次加载时从 Redis 恢复运行态（for 计时 / interval 去重 / 冷却），
    // 避免服务重启后重复触发或持续时长计时丢失
    if (!this.runtimeStateRestored) {
      this.runtimeStateRestored = true;
      await this.restoreRuntimeState();
    }
    // 规则集合变更后（初始加载 / 增删改 reload）按需启停 1s 定时器
    this.syncSecondaryTimers();
  }

  private runtimeStateRestored = false;

  /** DAG 链路当前嵌套深度（automation.completed/failed 触发链防循环） */
  private dagDispatchDepth = 0;

  /** 从 Redis 恢复引擎运行态（仅在首次加载时执行） */
  private async restoreRuntimeState() {
    const snapshot = await loadAutomationRuntimeSnapshot(this.redis);
    if (!snapshot) return;
    mergeAutomationRuntimeSnapshot(
      snapshot,
      {
        forPending: this.forPending,
        lastIntervalFire: this.lastIntervalFire,
        lastTimeFireMinute: this.lastTimeFireMinute,
        lastTriggered: this.lastTriggered,
      },
      this.appConfig.get('automation').maxDelaySeconds * 1000 * 6,
    );
    const restored = snapshot.forPending.length;
    this.logger.log(
      `自动化引擎运行态已恢复:forPending ${restored} 条,interval 去重 ${snapshot.lastIntervalFire.length} 条`,
    );
  }

  /** 每 60s 将运行态快照写入 Redis（重启后恢复用） */
  private startRuntimeSnapshotTimer() {
    if (this.runtimeSnapshotTimer) return;
    this.runtimeSnapshotTimer = setInterval(() => {
      void this.saveRuntimeState();
    }, 60_000);
  }

  private async saveRuntimeState() {
    if (!this.haLeader.isHaWsLeader()) return;
    const snapshot = buildAutomationRuntimeSnapshot({
      forPending: this.forPending,
      lastIntervalFire: this.lastIntervalFire,
      lastTimeFireMinute: this.lastTimeFireMinute,
      lastTriggered: this.lastTriggered,
    });
    await saveAutomationRuntimeSnapshot(this.redis, snapshot);
  }

  async reloadRules() {
    // 合并去抖：进行中期间的并发调用只在结束后补跑 1 次，避免 N 次串行排队的 DB 全量扫描
    if (this.reloadInProgress) {
      this.reloadRequestedAfterInProgress = true;
      return this.reloadInProgress;
    }
    this.reloadInProgress = this.doReloadRules().finally(async () => {
      // 进行中期间若有新请求 → 补跑 1 次；补跑期间继续累积补跑标记
      while (this.reloadRequestedAfterInProgress) {
        this.reloadRequestedAfterInProgress = false;
        try {
          await this.doReloadRules();
        } catch (e) {
          this.logger.warn(`规则补刷新失败: ${getErrorMessage(e)}`);
        }
      }
      this.reloadInProgress = null;
    });
    return this.reloadInProgress;
  }

  private async doReloadRules() {
    // 记录旧规则指纹：热更新时仅清理「被删除/内容变化」规则的状态，
    // 保留未受影响规则的 for_duration 计时、触发冷却、cron 防抖等运行态
    const oldFingerprint = new Map(this.rules.map((r) => [r.id, JSON.stringify(r)]));
    await this.loadRules();

    const newFingerprint = new Map(this.rules.map((r) => [r.id, JSON.stringify(r)]));
    const affected = new Set<string>();
    for (const [id, fp] of oldFingerprint) {
      if (newFingerprint.get(id) !== fp) affected.add(id);
    }

    for (const id of affected) {
      this.lastTriggered.delete(id);
      this.runTokens.delete(id);
      this.lastIntervalFire.delete(id);
      this.loopArmed.delete(id);
      // forPending 的 key 为 ruleId:triggerIdx:entityId，lastTimeFireMinute 可能带触发器/分钟前缀
      const prefix = `${id}:`;
      for (const key of [...this.forPending.keys()]) {
        if (key.startsWith(prefix)) this.forPending.delete(key);
      }
      for (const key of [...this.lastTimeFireMinute.keys()]) {
        if (key === id || key.startsWith(prefix)) this.lastTimeFireMinute.delete(key);
      }
    }
    // 清理已删除规则的遗留条目
    const validRuleIds = new Set(this.rules.map((r) => r.id));
    for (const id of [...this.loopArmed.keys()]) {
      if (!validRuleIds.has(id)) this.loopArmed.delete(id);
    }
    for (const id of [...this.lastIntervalFire.keys()]) {
      if (!validRuleIds.has(id)) this.lastIntervalFire.delete(id);
    }
  }

  /** 本地引擎与 HA 自动化能力对照（供 Builder UI 展示） */
  getEngineCapabilities() {
    return { ...AUTOMATION_ENGINE_CAPABILITIES };
  }

  /**
   * 回读 HA 侧触发执行的 runOnHa 自动化。
   * HA 每次触发自动化都广播 automation.triggered（含 HA 内部时间/状态触发，
   * 以及 HomeOS 调用 turn_on 后 HA 侧的执行），此处匹配本地 runOnHa 规则并
   * 写入执行历史，解决 runOnHa 自动化执行历史缺失问题。
   * 仅在 HA WS Leader 处理（事件只到达 Leader），写入共享 PostgreSQL，无需跨实例桥接。
   */
  @OnEvent(HA_EVENTS.AUTOMATION_TRIGGERED)
  async handleAutomationTriggered(payload: HaAutomationTriggeredEvent) {
    if (!this.haLeader.isHaWsLeader()) return;
    await recordAutomationHaTriggeredExecution(
      {
        prisma: this.prisma,
        logger: this.logger,
        maxHistory: this.maxHistory,
        dedup: this.haTriggeredDedup,
      },
      payload,
    );
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  async handleStateChanged(payload: HaStateChangeBatchEvent) {
    if (!this.haLeader.isHaWsLeader()) return;
    if (this.shouldSkipWhenHaStale()) return;
    for (const event of coldBatchChanges(payload)) {
      if (!this.stateRouter.shouldProcess('automation', event)) continue;
      const entityId = event.entity_id;
      if (
        !shouldAutomationProcessEntity(
          entityId,
          this.watchedEntityIds,
          this.hasEventTriggers,
          this.wildcardPrefixes,
        )
      ) {
        continue;
      }
      // per-entity 多触发合并：开启去抖后，同一实体的高频状态变化在窗口内合并为一次触发评估，
      // 丢弃中间状态（如人体传感器抖动），仅用窗口内最后一次变化驱动规则
      const debounceMs = this.appConfig.get('automation').entityTriggerDebounceMs;
      if (debounceMs > 0) {
        this.debounceEntityStateEvent(event, debounceMs);
        continue;
      }
      await this.processEntityStateChange(event);
    }
  }

  /** 同一实体状态变化去抖合并：重置定时器并保留窗口内首次 old_state，窗口结束后统一评估 */
  private debounceEntityStateEvent(event: HaStateChangeEvent, debounceMs: number) {
    const entityId = event.entity_id;
    const existing = this.pendingEntityEvents.get(entityId);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const merged: HaStateChangeEvent = existing
      ? { ...event, old_state: existing.event.old_state }
      : event;
    const timer = setTimeout(() => {
      this.pendingEntityEvents.delete(entityId);
      void this.processEntityStateChange(merged).catch((e) => {
        this.logger.warn(`实体 ${entityId} 去抖触发评估失败: ${(e as Error).message}`);
      });
    }, debounceMs);
    this.pendingEntityEvents.set(entityId, { event: merged, timer });
  }

  /** 单个实体状态变化事件 → 匹配规则并触发（去抖合并后调用，参数即窗口内最后一次变化） */
  private async processEntityStateChange(event: HaStateChangeEvent) {
    const entityId = event.entity_id;
    const newState = event.new_state?.state;

    const candidateRules = [
      ...this.ruleIndex.getRulesForEntity(entityId),
      ...this.ruleIndex.getOpenRules(),
    ];
    const seenRuleIds = new Set<string>();
    for (const rule of candidateRules) {
      if (seenRuleIds.has(rule.id)) continue;
      let shouldExecute = false;
      if (
        await trackStateTrigger(
          this.triggerDeps,
          this.forPending,
          rule,
          entityId,
          event.old_state?.state,
          newState,
          event.old_state?.attributes as Record<string, unknown> | undefined,
          event.new_state?.attributes as Record<string, unknown> | undefined,
        )
      ) {
        shouldExecute = true;
      } else if (
        await trackNumericTrigger(
          this.triggerDeps,
          this.forPending,
          rule,
          entityId,
          event.old_state?.state,
          newState,
          event.old_state?.attributes as Record<string, unknown> | undefined,
          event.new_state?.attributes as Record<string, unknown> | undefined,
        )
      ) {
        shouldExecute = true;
      } else if (
        await trackZoneTrigger(this.triggerDeps, rule, entityId, event.old_state?.state, newState)
      ) {
        shouldExecute = true;
      } else if (
        await trackCalendarTrigger(
          this.triggerDeps,
          rule,
          entityId,
          event.old_state?.state,
          newState,
        )
      ) {
        shouldExecute = true;
      }
      if (shouldExecute) {
        seenRuleIds.add(rule.id);
        this.logger.debug(
          `[触发] 规则 [${rule.name}] 由实体 ${entityId} 状态变更 ${event.old_state?.state ?? '∅'} → ${newState ?? '∅'} 触发`,
        );
        // 异步执行：状态触发评估与执行分离，长 delay/wait 的规则不再阻塞同事件内
        // 后续规则触发（并发与去重由 executeRule 内部 single/queued/parallel/restart 模式控制）
        void this.executeRule(
          rule,
          false,
          `${entityId} ${event.old_state?.state ?? '∅'} → ${newState ?? '∅'}`,
        ).catch((e) => {
          this.logger.warn(`规则 [${rule.name}] 状态触发执行异常: ${getErrorMessage(e)}`);
        });
      }
    }
  }

  @OnEvent(HA_EVENTS.INITIAL_STATES)
  async handleInitialStatesSync() {
    if (!this.haLeader.isHaWsLeader()) return;
    if (await shouldSkipAutomationStartTrigger(this.prisma)) return;
    await this.dispatchEventTriggers('start');
    await recordAutomationStartTrigger(this.prisma);
  }

  @OnEvent('presence.everyoneLeft')
  onEveryoneLeft() {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('presence.everyoneLeft');
  }

  @OnEvent('presence.changed')
  onPresenceChanged(payload?: { atHome?: boolean; memberId?: string; name?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers(
      'presence.changed',
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined,
    );
  }

  @OnEvent('clientPower.low')
  onClientPowerLow() {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('clientPower.low');
  }

  @OnEvent('clientPower.charged')
  onClientPowerCharged() {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('clientPower.charged');
  }

  @OnEvent('clientPower.reported')
  onClientPowerReported() {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('clientPower.reported');
  }

  @OnEvent('homeos.var_changed')
  onVarChanged(payload: { key?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('homeos.var_changed', payload);
  }

  @OnEvent('homeos.automation.enabled')
  onAutomationEnabled(payload: { automation_id?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchEventTriggers('homeos.automation.enabled', payload);
  }

  /**
   * DAG 链路：本地规则执行成功 → 派发 automation.completed，
   * 订阅该事件的规则（event_data 可按 automation_id / name 过滤）随后执行。
   * 带嵌套深度防护，避免 A→B→A→… 循环链路无限递归。
   */
  @OnEvent('automation.completed')
  onAutomationCompleted(payload: { ruleId?: string; name?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchDagEvent('automation.completed', payload);
  }

  /** DAG 链路：本地规则执行失败 → 派发 automation.failed（语义同 automation.completed） */
  @OnEvent('automation.failed')
  onAutomationFailed(payload: { ruleId?: string; name?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    return this.dispatchDagEvent('automation.failed', payload);
  }

  private async dispatchDagEvent(
    eventName: 'automation.completed' | 'automation.failed',
    payload: Record<string, unknown> | undefined,
  ) {
    const maxDepth = this.appConfig.get('automation').dagMaxDepth;
    if (this.dagDispatchDepth >= maxDepth) {
      this.logger.warn(
        `DAG 链路过深(≥${maxDepth}),跳过事件 ${eventName} 派发,可能存在循环依赖`,
      );
      return;
    }
    this.dagDispatchDepth += 1;
    try {
      await this.dispatchEventTriggers(eventName, payload);
    } finally {
      this.dagDispatchDepth -= 1;
    }
  }

  @OnEvent('homeos.loop_start')
  onLoopStart(payload: { automation_id?: string }) {
    const id = payload?.automation_id;
    if (id) this.loopArmed.set(String(id), true);
  }

  @OnEvent('homeos.loop_stop')
  onLoopStop(payload: { automation_id?: string }) {
    const id = payload?.automation_id;
    if (id) this.loopArmed.set(String(id), false);
  }

  /** toggle 启用后由 controller 调用 */
  notifyAutomationEnabled(automationId: string) {
    this.eventEmitter.emit('homeos.automation.enabled', { automation_id: automationId });
    this.loopArmed.set(automationId, true);
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('automation')) {
      this.restartTimeBasedTriggers();
    }
  }

  private restartTimeBasedTriggers() {
    if (this.timeCheckTimer) {
      clearInterval(this.timeCheckTimer);
      this.timeCheckTimer = null;
    }
    this.startTimeBasedTriggers();
    this.logger.log(`定时自动化扫描间隔已更新: ${this.timeScanIntervalSec}s`);
  }

  private async dispatchEventTriggers(
    eventName: string,
    eventData?: Record<string, unknown>,
  ) {
    await dispatchEventTriggers(
      this.rules,
      eventName,
      (rule) => this.checkConditions(rule),
      (rule) => {
        this.logger.debug(
          `[触发] 规则 [${rule.name}] 由事件 ${eventName} 触发${
            eventData ? `（${JSON.stringify(eventData).slice(0, 120)}）` : ''
          }`,
        );
        // 异步执行：事件触发不与同事件内后续规则串行阻塞，执行分离（并发/去重由 executeRule 模式控制）
        void this.executeRule(
          rule,
          false,
          `事件 ${eventName}${eventData ? ` ${JSON.stringify(eventData).slice(0, 120)}` : ''}`,
        ).catch((e) => {
          this.logger.warn(`规则 [${rule.name}] 事件触发执行异常: ${getErrorMessage(e)}`);
        });
        return Promise.resolve();
      },
      eventData,
    );
  }

  /** 是否存在 for_duration（state / numeric_state 带 for）触发器 */
  private hasForDurationTriggers(): boolean {
    return this.rules.some((rule) => rule.triggers.some((t) => t.for && t.for > 0));
  }

  /** 是否存在 interval（homeos.interval.tick / time.interval）定时触发器 */
  private hasIntervalTriggers(): boolean {
    return this.rules.some(
      (rule) =>
        rule.triggers.some(
          (t) => t.platform === 'event' && t.event_type === 'homeos.interval.tick',
        ) || rule.triggers.some((t) => t.platform === 'time' && t.interval),
    );
  }

  /**
   * 按当前规则集合动态启停两个 1s 定时器（避免无相关触发器时每秒空转全量扫描）：
   * - forCheckTimer：仅当存在带 for 的 state/numeric_state 触发器时运行
   * - intervalCheckTimer：仅当存在 homeos.interval.tick 触发器时运行
   * 在 loadRules（初始加载与增删改 reload 的统一刷新入口）末尾调用。
   */
  private syncSecondaryTimers() {
    if (this.hasForDurationTriggers()) {
      if (!this.forCheckTimer) {
        this.startForDurationChecker();
        this.logger.log('存在 for_duration 触发器,启动持续时长检查器');
      }
    } else if (this.forCheckTimer) {
      clearInterval(this.forCheckTimer);
      this.forCheckTimer = null;
      this.logger.log('无 for_duration 触发器,已停止持续时长检查器');
    }

    if (this.hasIntervalTriggers()) {
      if (!this.intervalCheckTimer) {
        this.startIntervalTriggers();
        this.logger.log('存在 interval 触发器,启动间隔扫描器');
      }
    } else if (this.intervalCheckTimer) {
      clearInterval(this.intervalCheckTimer);
      this.intervalCheckTimer = null;
      this.logger.log('无 interval 触发器,已停止间隔扫描器');
    }
  }

  private startForDurationChecker() {
    this.forCheckTimer = setInterval(() => {
      if (!this.haLeader.isHaWsLeader()) return;
      if (this.shouldSkipWhenHaStale()) return;
      void this.jobs
        .run(
          'automation-for-duration',
          { description: '自动化 for_duration 持续时长检查', intervalMs: 1000 },
          () =>
            processForDurationPending(
              this.triggerDeps,
              this.forPending,
              this.rules,
              Date.now(),
              (rule, note) => this.executeRule(rule, false, note),
            ),
        )
        .catch(() => {
          // jobs.run 已记录错误，避免 unhandled rejection
        });
    }, 1000);
  }

  private startIntervalTriggers() {
    // interval 扫描节流到 5s：interval 触发器本身以秒级为粒度，1s 轮询收益有限
    this.intervalCheckTimer = setInterval(() => {
      void this.jobs
        .run(
          'automation-interval-triggers',
          { description: '自动化 interval 触发器扫描', intervalMs: 5000 },
          () => this.scanIntervalTriggers(),
        )
        .catch(() => {
          // jobs.run 已记录错误，避免 unhandled rejection
        });
    }, 5000);
  }

  private async scanIntervalTriggers() {
    if (!this.haLeader.isHaWsLeader()) return;
    // interval / time.interval 属纯时间触发：HA 断连或实体陈旧时不跳过，
    // 保证定时任务在 HA 故障期间仍按周期执行（条件按缓存状态求值）
    const now = Date.now();
    for (const rule of this.rules) {
      for (const trigger of rule.triggers) {
        if (trigger.platform === 'event' && trigger.event_type === 'homeos.interval.tick') {
          if (this.loopArmed.get(rule.id) === false) continue;
          const intervalSec = Number(trigger.event_data?.interval) || 60;
          const controlVar = trigger.event_data?.control_var
            ? String(trigger.event_data.control_var)
            : '';
          if (controlVar) {
            const v = await this.variableService.getValue(controlVar, 'global');
            if (v === '0' || v === 0 || v === 'false' || v === 'off' || v == null) continue;
          }
          const last = this.lastIntervalFire.get(rule.id) || 0;
          if (now - last < intervalSec * 1000) continue;
          if (!(await this.checkConditions(rule))) continue;
          this.lastIntervalFire.set(rule.id, now);
          void this.executeRule(rule, false, `周期 ${intervalSec}s`);
          break;
        }
        // time.interval："HH:MM:SS" 周期触发（复用 interval 扫描器，5s 节流）
        if (trigger.platform === 'time' && trigger.interval) {
          if (this.loopArmed.get(rule.id) === false) continue;
          const intervalSec = parseIntervalSeconds(trigger.interval) || 60;
          const last = this.lastIntervalFire.get(rule.id) || 0;
          if (now - last < intervalSec * 1000) continue;
          if (!(await this.checkConditions(rule))) continue;
          this.lastIntervalFire.set(rule.id, now);
          void this.executeRule(rule, false, `时间周期 ${trigger.interval}`);
          break;
        }
      }
    }
  }

  async triggerAutomation(automationId: string): Promise<{ success: boolean; message: string }> {
    return runManualAutomationTrigger(this.prisma, this.logger, automationId, (rule, manual) =>
      this.executeRule(rule, manual, '手动触发'),
    );
  }

  /**
   * 试运行（dry-run）：按当前实体状态 / 当前时刻评估触发器就绪度与条件满足度，
   * 不执行任何动作。支持按已保存规则 id 评估，或直接评估画布草稿 yaml。
   *
   * @param id   已保存自动化 ID（可选；优先于 yaml）
   * @param yaml 自动化 YAML 草稿（可选；无 id 时使用）
   * @returns 试运行报告（触发器 / 条件 / 动作清单与结论）
   * @throws BusinessException(NOT_FOUND) 规则不存在或 YAML 解析失败
   */
  async dryRunAutomation(
    id?: string,
    yaml?: string,
  ): Promise<ReturnType<typeof dryRunAutomation>> {
    let rule: AutomationRule | null = null;
    const draft = yaml && typeof yaml === 'string' && yaml.trim() ? yaml.trim() : '';
    if (draft) {
      rule = parseAutomationYaml('dry-run', 'dry-run', draft, (msg) => this.logger.warn(msg));
    } else if (id && typeof id === 'string') {
      rule = this.rules.find((r) => r.id === id) ?? null;
    }
    if (!rule) {
      this.logger.warn(`试运行失败:找不到规则(id=${id ?? '-'},yaml=${Boolean(draft)})`);
      throw new BusinessException(ErrorCode.NOT_FOUND, '未找到自动化规则，或 YAML 无法解析');
    }
    const deps: AutomationDryRunDeps = {
      entityStateOf: (entityId) => this.entityStateOf(entityId),
      entityAttrOf: (entityId, attr) => {
        const raw = this.stateStore.getById(entityId)?.attributes?.[attr];
        return raw != null ? String(raw) : undefined;
      },
      conditionDeps: this.conditionDeps,
      resolveTemplate: (tpl) => resolveAutomationTemplateWithRuntime(tpl, {}, this.runRuntime),
      isSunTriggerNow: (trigger, windowMs) =>
        isSunTriggerNow(
          trigger,
          windowMs,
          this.appConfig.get('external').weatherLat,
          this.appConfig.get('external').weatherLon,
        ),
      ruleId: rule.id,
    };
    return dryRunAutomation(rule, deps);
  }

  /**
   * 规则查重：按当前规则（或草稿 yaml）的触发器/条件/动作签名，
   * 返回现有规则中语义重复的命中项（排除自身）。
   *
   * @param yaml 自动化 YAML 草稿（可选）
   * @param excludeId 编辑中的规则 ID（可选，跳过自身）
   * @returns { duplicates: Array<{ id, name }> } 重复命中列表
   */
  async checkAutomationDuplicate(
    yaml?: string,
    excludeId?: string,
  ): Promise<{ duplicates: { id: string; name: string }[] }> {
    let signature: string | null = null;
    const draft = yaml && typeof yaml === 'string' && yaml.trim() ? yaml.trim() : '';
    if (draft) {
      signature = computeSignatureFromYaml(draft, (msg) => this.logger.warn(msg));
    } else if (excludeId && typeof excludeId === 'string') {
      const rule = this.rules.find((r) => r.id === excludeId);
      signature = rule ? computeAutomationSignature(rule) : null;
    }
    if (!signature) return { duplicates: [] };
    return { duplicates: findAutomationDuplicates(this.rules, signature, excludeId) };
  }

  /**
   * webhook 触发器入口：根据 webhook_id 匹配本地规则并执行。
   * 供自动化 controller 的公开 webhook 端点调用（无需登录）。
   */
  async triggerWebhook(
    webhookId: string,
    _payload: Record<string, unknown>,
  ): Promise<{ triggered: number; matched: boolean }> {
    if (!this.haLeader.isHaWsLeader()) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        API_ERROR.AUTOMATION_WEBHOOK_FOLLOWER,
      );
    }
    let triggered = 0;
    let matched = false;
    for (const rule of this.rules) {
      for (const trigger of rule.triggers) {
        if (trigger.platform !== 'webhook' || trigger.webhook_id !== webhookId) continue;
        matched = true;
        if (this.shouldSkipWhenHaStale()) continue;
        if (!(await this.checkConditions(rule))) continue;
        triggered += 1;
        void this.executeRule(rule, false, `webhook ${webhookId}`);
        break;
      }
    }
    return { triggered, matched };
  }

  /**
   * webhook HMAC 签名校验：匹配到的触发器必须配置 secret，
   * 且 X-HomeOS-Webhook-Signature 须为 sha256=<hex>。
   */
  verifyWebhookSignature(
    webhookId: string,
    signatureHeader: string | undefined,
    payload: Record<string, unknown>,
  ): { ok: boolean; reason?: string } {
    return verifyWebhookTriggerSignature(this.rules, webhookId, signatureHeader, payload);
  }

  private async checkConditions(rule: AutomationRule): Promise<boolean> {
    return checkAutomationConditions(rule, this.conditionDeps, rule.id);
  }

  private async checkConditionList(
    conditions: Parameters<typeof checkAutomationConditionList>[0],
    currentRuleId?: string,
  ): Promise<boolean> {
    return checkAutomationConditionList(conditions, this.conditionDeps, currentRuleId);
  }

  private _conditionDeps: AutomationConditionDeps | null = null;
  private get conditionDeps(): AutomationConditionDeps {
    if (!this._conditionDeps) {
      this._conditionDeps = createAutomationConditionDeps(this.runRuntime);
    }
    return this._conditionDeps;
  }

  private startTimeBasedTriggers() {
    if (this.timeCheckTimer) return;
    this.timeCheckTimer = setInterval(() => {
      void this.jobs
        .run(
          'automation-time-triggers',
          {
            description: '自动化时间触发器扫描',
            intervalMs: this.timeScanIntervalSec * 1000,
          },
          async () => {
            if (!this.haLeader.isHaWsLeader()) return;
            // time / time_pattern / cron / sun / template 触发依赖墙上时钟而非实体状态：
            // HA 断连或实体陈旧时仍按周期扫描，条件部分按缓存状态求值（安全降级）
            const now = new Date();
            const tz = this.appConfig.getHomeTimezone();
            const parts = zonedDateParts(now, tz);
            const pad = (n: number) => String(n).padStart(2, '0');
            const timeStr = `${pad(parts.hour)}:${pad(parts.minute)}:00`;
            const minuteKey = `${pad(parts.hour)}:${pad(parts.minute)}`;
            const windowMs = this.timeScanIntervalSec * 1000;
            await scanTimeBasedTriggers(
              this.triggerDeps,
              this.ruleIndex,
              timeStr,
              now,
              windowMs,
              (rule) => this.executeTimeTriggeredRule(rule, minuteKey),
            );
          },
        )
        .catch(() => {
          // jobs.run 已在 registry 记录错误，这里避免 unhandled rejection
        });
    }, this.timeScanIntervalSec * 1000);
  }

  private async executeTimeTriggeredRule(rule: AutomationRule, minuteKey: string) {
    await tryExecuteTimeTriggeredRule(this.lastTimeFireMinute, rule, minuteKey, (r) => {
      this.logger.debug(`[触发] 规则 [${r.name}] 由时间触发(${minuteKey})`);
      return this.executeRule(r, false, `时间 ${minuteKey}`);
    });
  }

  async executeRule(rule: AutomationRule, manual = false, triggerNote?: string): Promise<boolean> {
    return executeAutomationRule(
      this.executeState,
      this.executeDeps,
      rule,
      manual,
      this.triggerCooldownMs,
      triggerNote,
    );
  }

  private _actionDeps: AutomationActionDeps | null = null;
  private get actionDeps(): AutomationActionDeps {
    if (!this._actionDeps) {
      this._actionDeps = createAutomationActionDeps(
        this.runRuntime,
        this.triggerDeps,
        (conditions, currentRuleId) => this.checkConditionList(conditions, currentRuleId),
      );
    }
    return this._actionDeps;
  }

  private _triggerDeps: AutomationTriggerDeps | null = null;
  private get triggerDeps(): AutomationTriggerDeps {
    if (!this._triggerDeps) {
      const deps = createAutomationTriggerDeps(this.runRuntime, (rule) =>
        this.checkConditions(rule),
      );
      deps.resolveTemplate = (tpl) =>
        resolveAutomationTemplateWithRuntime(tpl, {}, this.runRuntime);
      this._triggerDeps = deps;
    }
    return this._triggerDeps;
  }

  private get executeState(): AutomationExecuteState {
    return {
      lastTriggered: this.lastTriggered,
      runningRules: this.runningRules,
      parallelRunning: this.parallelRunning,
      ruleQueues: this.ruleQueues,
      queueProcessing: this.queueProcessing,
      runTokens: this.runTokens,
      mutexOwner: this.mutexOwner,
      mutexHoldCount: this.mutexHoldCount,
    };
  }

  private _executeDeps: AutomationExecuteDeps | null = null;
  private get executeDeps(): AutomationExecuteDeps {
    if (!this._executeDeps) {
      this._executeDeps = createAutomationExecuteDeps(this.runRuntime, this.actionDeps);
    }
    return this._executeDeps;
  }

  private get maxHistory() {
    return this.appConfig.get('ops').sceneExecHistoryMax;
  }

  async getExecutionHistory(automationId?: string, limit?: number) {
    return getAutomationExecutionHistory(
      { logger: this.logger, prisma: this.prisma, maxHistory: this.maxHistory },
      automationId,
      limit,
    );
  }

  async clearExecutionHistory(): Promise<{ deleted: number }> {
    return clearAutomationExecutionHistory({ prisma: this.prisma });
  }

  async getExecutionAnalytics(hoursBack = 168) {
    return getAutomationExecutionAnalytics({ prisma: this.prisma }, hoursBack);
  }
}
