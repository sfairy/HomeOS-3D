/**
 * 自动化规则执行调度内部实现。
 *
 * 所属模块：backend/modules/automation
 * 职责：负责规则的执行编排——mode（single / restart / queued / parallel）调度、
 *  并发上限与队列、互斥组（mutex_group）编排、执行历史记录与执行分析查询、
 *  启动触发防抖（loopArmed + runTokens）以及手动触发入口。
 *  内部把具体动作执行委托给 engine-actions.internals 的 executeAutomationActions。
 * 关键依赖：AutomationActionDeps / AutomationExecuteDeps（由 AutomationEngineService 注入）。
 */
import { recordAutomationExecution } from '../../shared/orchestrator/execution-history-helper.util';
import { readOrchestratorExecutionHistory } from '../../shared/orchestrator/execution-history.util';
import { parseJsonArray } from '../../common/utils/json-field.util';
import type { PrismaService } from '../../shared/prisma/service';
import { loadRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import type { HaConnectorService } from '../ha-connector/service';
import type { SceneService } from '../scene/service';
import type { ScriptService } from '../script/service';
import type { StateStoreService } from '../state-store/service';
import type { AutomationActionDeps, AutomationTraceStep } from './engine-actions.internals';
import { executeAutomationActions } from './engine-actions.internals';
import type { AutomationRule } from './yaml-parse.util';
import { parseAutomationYaml } from './yaml-parse.util';
import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';

// ── automation-engine-analytics.util ──
interface ExecutionAnalyticsTotalsRow {
  total: bigint;
  success_count: bigint;
}

interface ExecutionAnalyticsFailureHourRow {
  hour: number;
  count: bigint;
}

interface ExecutionAnalyticsByAutoRow {
  automationId: string;
  name: string;
  total: bigint;
  failed: bigint;
}

interface ExecutionAnalyticsResult {
  periodHours: number;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  failuresByHour: Array<{ hour: number; count: number }>;
  topAutomations: Array<{
    automationId: string;
    name: string;
    executions: number;
    failures: number;
    successRate: number;
  }>;
}

/** 将 Prisma 原始查询结果组装为执行分析 DTO */
function buildExecutionAnalyticsResult(
  hoursBack: number,
  totals: ExecutionAnalyticsTotalsRow[],
  failureHours: ExecutionAnalyticsFailureHourRow[],
  byAuto: ExecutionAnalyticsByAutoRow[],
): ExecutionAnalyticsResult {
  const total = Number(totals[0]?.total ?? 0);
  const successCount = Number(totals[0]?.success_count ?? 0);
  const failuresByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const row of failureHours) {
    if (row.hour >= 0 && row.hour < 24) failuresByHour[row.hour].count = Number(row.count);
  }
  const topAutomations = byAuto.map((r) => {
    const executions = Number(r.total);
    const failures = Number(r.failed);
    return {
      automationId: r.automationId,
      name: r.name,
      executions,
      failures,
      successRate:
        executions > 0 ? Math.round(((executions - failures) / executions) * 1000) / 10 : 100,
    };
  });
  return {
    periodHours: hoursBack,
    totalExecutions: total,
    successCount,
    failureCount: total - successCount,
    successRate: total > 0 ? Math.round((successCount / total) * 1000) / 10 : 100,
    failuresByHour,
    topAutomations,
  };
}

// ── automation-engine-execute.util ──
/** 规则执行调度所需的运行时依赖（由 AutomationEngineService 注入） */
export interface AutomationExecuteState {
  lastTriggered: Map<string, number>;
  runningRules: Map<string, Promise<void>>;
  /** parallel 模式：同一规则可同时跑多路，按 id 跟踪进行中的 Promise */
  parallelRunning: Map<string, Set<Promise<void>>>;
  ruleQueues: Map<string, Array<() => Promise<void>>>;
  queueProcessing: Set<string>;
  /** restart 模式：递增后旧 run 在动作间隙自行退出 */
  runTokens: Map<string, number>;
  /** DAG 互斥编排：mutex_group → 当前占用该组的规则 id（同组规则互斥，占用中被触发则丢弃） */
  mutexOwner: Map<string, string>;
  /** mutex_group → 占用计数（parallel/restart 多实例共用同一组时，最后一次 settle 才释放） */
  mutexHoldCount: Map<string, number>;
}

/**
 * AutomationExecuteDeps：业务接口定义。
 * - 表示：modules/automation/engine-execute.internals.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationExecuteDeps {
  logger: Logger;
  prisma: Pick<PrismaService, 'automationExecution'>;
  eventBus: { emit: (event: string, data: unknown) => void };
  actionDeps: AutomationActionDeps;
  maxHistory: number;
  /** parallel 模式并发上限（来自 appConfig automation） */
  maxParallelRuns: number;
  /** queued 模式队列上限（来自 appConfig automation） */
  maxQueueLength: number;
}

function canTriggerRule(
  rule: AutomationRule,
  lastTriggered: Map<string, number>,
  triggerCooldownMs: number,
): boolean {
  const lastTime = lastTriggered.get(rule.id);
  if (lastTime && Date.now() - lastTime < triggerCooldownMs) return false;
  return true;
}

/** 按 mode（single / restart / queued / parallel）调度规则执行，含互斥组与并发上限控制 */
export async function executeAutomationRule(
  state: AutomationExecuteState,
  deps: AutomationExecuteDeps,
  rule: AutomationRule,
  manual: boolean,
  triggerCooldownMs: number,
  triggerNote?: string,
): Promise<boolean> {
  const mode = rule.mode || 'single';
  // DAG 互斥编排：同 mutex_group 的自动化互斥，组被其他规则占用时丢弃本次触发，
  // 避免互相冲突的规则（如「离家关灯」与「回家开灯」）同时执行
  const mutexGroup = rule.mutexGroup;
  if (mutexGroup) {
    const owner = state.mutexOwner.get(mutexGroup);
    if (owner && owner !== rule.id) {
      deps.logger.warn(
        `自动化 [${rule.name}] 互斥组 [${mutexGroup}] 正被规则 [${owner}] 占用,本次触发被丢弃`,
      );
      deps.eventBus.emit('automation.dropped', {
        ruleId: rule.id,
        name: rule.name,
        reason: 'mutex-busy',
        group: mutexGroup,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
    acquireMutex(state, rule);
  }
  if (mode === 'queued') {
    return enqueueAutomationRule(state, deps, rule, manual, triggerCooldownMs, triggerNote);
  }
  // 互斥锁已在入口获取：以下提前 return 必须释放，否则同组其他规则被永久丢弃（锁泄漏）
  if (!manual && !canTriggerRule(rule, state.lastTriggered, triggerCooldownMs)) {
    releaseMutex(state, rule);
    return false;
  }
  if (mode === 'single' && state.runningRules.has(rule.id)) {
    releaseMutex(state, rule);
    return false;
  }

  if (mode === 'parallel') {
    // 并发上限控制：进行中任务 ≥ 上限时丢弃本次触发（计数与规则 id 绑定），
    // 避免 high-frequency 状态实体驱动时任务无限叠加、重操作动作重复执行
    const running = state.parallelRunning.get(rule.id) ?? new Set<Promise<void>>();
    if (running.size >= deps.maxParallelRuns) {
      deps.logger.warn(
        `自动化 [${rule.name}] parallel 并发已达上限(${deps.maxParallelRuns}),丢弃本次触发`,
      );
      // 并发超限不再无痕丢弃：写一条执行历史（success=false + trace 标记 dropped 原因），
      // 并 emit automation.dropped 供通知消费者生成站内通知，避免用户看到的执行次数少于实际触发次数
      recordAutomationExecution(deps.prisma.automationExecution, deps.logger, deps.maxHistory, {
        automationId: rule.id,
        name: rule.name,
        success: false,
        trace: [
          {
            dropped: true,
            reason: 'concurrency-limit',
            limit: deps.maxParallelRuns,
            at: new Date().toISOString(),
          },
        ],
        error: `parallel 并发已达上限(${deps.maxParallelRuns})，本次触发被丢弃`,
      });
      deps.eventBus.emit('automation.dropped', {
        ruleId: rule.id,
        name: rule.name,
        reason: 'concurrency-limit',
        limit: deps.maxParallelRuns,
        timestamp: new Date().toISOString(),
      });
      // 并发超限丢弃时同样须释放入口已获取的 mutex 锁，避免同组规则被永久锁死
      releaseMutex(state, rule);
      return false;
    }
    if (!manual) state.lastTriggered.set(rule.id, Date.now());
    const job = runRuleBody(deps, state, rule, undefined, triggerNote);
    running.add(job);
    state.parallelRunning.set(rule.id, running);
    void job.finally(() => {
      running.delete(job);
      if (running.size === 0) state.parallelRunning.delete(rule.id);
    });
    void releaseMutexOnSettle(state, rule, job);
    return true;
  }

  if (mode === 'restart') {
    const token = (state.runTokens.get(rule.id) ?? 0) + 1;
    state.runTokens.set(rule.id, token);
    const job = runRuleBody(
      deps,
      state,
      rule,
      () => state.runTokens.get(rule.id) !== token,
      triggerNote,
    );
    state.runningRules.set(rule.id, job);
    void job.finally(() => {
      if (state.runningRules.get(rule.id) === job) {
        state.runningRules.delete(rule.id);
      }
    });
    void releaseMutexOnSettle(state, rule, job);
    return true;
  }

  const job = runRuleBody(deps, state, rule, undefined, triggerNote);
  state.runningRules.set(rule.id, job);
  try {
    await job;
  } finally {
    state.runningRules.delete(rule.id);
    releaseMutex(state, rule);
  }
  return true;
}

/** DAG 互斥：同组占用引用计数，parallel/restart 多实例结束前不提前释放 */
function acquireMutex(state: AutomationExecuteState, rule: AutomationRule): void {
  const group = rule.mutexGroup;
  if (!group) return;
  state.mutexOwner.set(group, rule.id);
  state.mutexHoldCount.set(group, (state.mutexHoldCount.get(group) ?? 0) + 1);
}

/** DAG 互斥：规则运行结束后释放其占用的互斥组（计数归零才清 owner） */
function releaseMutex(state: AutomationExecuteState, rule: AutomationRule): void {
  const group = rule.mutexGroup;
  if (!group) return;
  if (state.mutexOwner.get(group) !== rule.id) return;
  const n = (state.mutexHoldCount.get(group) ?? 1) - 1;
  if (n <= 0) {
    state.mutexOwner.delete(group);
    state.mutexHoldCount.delete(group);
  } else {
    state.mutexHoldCount.set(group, n);
  }
}

function releaseMutexOnSettle(
  state: AutomationExecuteState,
  rule: AutomationRule,
  job: Promise<void>,
): void {
  void job
    .finally(() => releaseMutex(state, rule))
    .catch(() => {
      // releaseMutex 无异常；此处仅避免 unhandled rejection
    });
}

function enqueueAutomationRule(
  state: AutomationExecuteState,
  deps: AutomationExecuteDeps,
  rule: AutomationRule,
  manual: boolean,
  triggerCooldownMs: number,
  triggerNote?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const q = state.ruleQueues.get(rule.id) || [];
    if (q.length >= deps.maxQueueLength) {
      deps.logger.warn(
        `自动化 [${rule.id}] 队列已满(${deps.maxQueueLength}),本次触发被丢弃`,
      );
      deps.eventBus.emit('automation.dropped', {
        ruleId: rule.id,
        name: rule.name,
        reason: 'queue-limit',
        limit: deps.maxQueueLength,
        timestamp: new Date().toISOString(),
      });
      // 入口已获取 mutex 互斥锁：队列满丢弃时须释放，否则同组规则被永久锁死
      releaseMutex(state, rule);
      resolve(false);
      return;
    }
    q.push(async () => {
      await runRuleExclusive(state, deps, rule, manual, triggerCooldownMs, triggerNote);
      resolve(true);
    });
    state.ruleQueues.set(rule.id, q);
    void processAutomationRuleQueue(state, deps, rule.id);
  });
}

async function processAutomationRuleQueue(
  state: AutomationExecuteState,
  deps: AutomationExecuteDeps,
  ruleId: string,
): Promise<void> {
  if (state.queueProcessing.has(ruleId)) return;
  state.queueProcessing.add(ruleId);
  try {
    while (true) {
      const q = state.ruleQueues.get(ruleId);
      if (!q?.length) break;
      const task = q.shift();
      if (!task) break;
      await task().catch((e) =>
        deps.logger.warn(`队列执行失败 [${ruleId}]: ${(e as Error).message}`),
      );
    }
  } finally {
    state.queueProcessing.delete(ruleId);
    // 清空 flag 与出队之间可能又有入队：若队列非空则继续处理，避免孤儿任务
    if (state.ruleQueues.get(ruleId)?.length) {
      void processAutomationRuleQueue(state, deps, ruleId);
    } else {
      state.ruleQueues.delete(ruleId);
    }
  }
}

async function runRuleExclusive(
  state: AutomationExecuteState,
  deps: AutomationExecuteDeps,
  rule: AutomationRule,
  manual: boolean,
  triggerCooldownMs: number,
  triggerNote?: string,
): Promise<void> {
  if (!manual && !canTriggerRule(rule, state.lastTriggered, triggerCooldownMs)) {
    releaseMutex(state, rule);
    return;
  }
  if (state.runningRules.has(rule.id)) {
    releaseMutex(state, rule);
    return;
  }
  const job = runRuleBody(deps, state, rule, undefined, triggerNote);
  state.runningRules.set(rule.id, job);
  try {
    await job;
  } finally {
    state.runningRules.delete(rule.id);
    releaseMutex(state, rule);
  }
}

/** 从执行 trace 中提取失败步骤摘要（供失败通知正文使用） */
function extractTraceFailureSummary(trace: AutomationTraceStep[]): string | undefined {
  const failed = trace.filter((t) => !t.ok);
  if (failed.length === 0) return undefined;
  return failed
    .map((t) => t.detail || t.step)
    .filter(Boolean)
    .join('；')
    .slice(0, 200);
}

async function runRuleBody(
  deps: AutomationExecuteDeps,
  state: AutomationExecuteState,
  rule: AutomationRule,
  shouldAbort?: () => boolean,
  triggerNote?: string,
): Promise<void> {
  deps.logger.log(`执行自动化: ${rule.name}`);
  const trace: AutomationTraceStep[] = [];
  // 触发上下文记录为 trace 首步，供执行历史「多次触发对比」展示触发来源
  if (triggerNote && typeof triggerNote === 'string' && triggerNote.trim()) {
    trace.push({ step: `触发：${triggerNote.trim()}`, ok: true, at: new Date().toISOString() });
  }
  let success = true;
  let errorMsg: string | undefined;

  try {
    if (shouldAbort?.()) return;
    success =
      (await executeAutomationActions(
        deps.actionDeps,
        rule.actions,
        trace,
        {},
        shouldAbort,
        rule.id,
        deps.actionDeps.retryDefaults,
      )) && success;
    if (shouldAbort?.()) return;

    recordAutomationExecution(deps.prisma.automationExecution, deps.logger, deps.maxHistory, {
      automationId: rule.id,
      name: rule.name,
      success,
      trace,
      error: errorMsg ?? null,
    });

    deps.eventBus.emit('automation.executed', {
      id: rule.id,
      automation_id: rule.id,
      name: rule.name,
      success,
      timestamp: new Date().toISOString(),
    });
    // DAG 链路：eventBus.emit 会本地触发 @OnEvent 监听器（并桥接 Redis），
    // 供 `event_type: automation.completed / automation.failed` 触发器订阅
    // （规则可在 event_data 中按 automation_id / ruleId / name 过滤）。
    // 修复：按真实 success 门控，避免失败时同时发 completed(success:true) 与 failed 误导 DAG
    if (success) {
      deps.eventBus.emit('automation.completed', {
        ruleId: rule.id,
        automation_id: rule.id,
        name: rule.name,
        success: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      deps.eventBus.emit('automation.failed', {
        ruleId: rule.id,
        automation_id: rule.id,
        name: rule.name,
        error: extractTraceFailureSummary(trace),
        trace,
        timestamp: new Date().toISOString(),
      });
    }
    if (success && !shouldAbort?.()) {
      state.lastTriggered.set(rule.id, Date.now());
    }
  } catch (e) {
    errorMsg = (e as Error).message;
    if (shouldAbort?.()) return;
    deps.logger.error(`自动化 [${rule.name}] 执行出错: ${errorMsg}`);
    recordAutomationExecution(deps.prisma.automationExecution, deps.logger, deps.maxHistory, {
      automationId: rule.id,
      name: rule.name,
      success: false,
      trace,
      error: errorMsg ?? null,
    });
    deps.eventBus.emit('automation.failed', {
      ruleId: rule.id,
      automation_id: rule.id,
      name: rule.name,
      error: extractTraceFailureSummary(trace) ?? errorMsg,
      trace,
      timestamp: new Date().toISOString(),
    });
  }
}

// ── automation-engine-query.helper ──
interface AutomationExecutionHistoryRecord {
  id: string;
  automationId: string;
  name: string;
  success: boolean;
  trace: unknown[];
  error?: string;
  executedAt: string;
}

interface AutomationEngineQueryDeps {
  logger: Logger;
  prisma: PrismaService;
  maxHistory: number;
}

/**
 * getAutomationExecutionHistory：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function getAutomationExecutionHistory(
  deps: AutomationEngineQueryDeps,
  automationId?: string,
  limit?: number,
): Promise<AutomationExecutionHistoryRecord[]> {
  return readOrchestratorExecutionHistory({
    logger: deps.logger,
    label: '自动化执行历史',
    limit: limit ?? deps.maxHistory,
    maxHistory: deps.maxHistory,
    findMany: (take) =>
      deps.prisma.automationExecution.findMany({
        where: automationId ? { automationId } : undefined,
        orderBy: { executedAt: 'desc' },
        take,
      }),
    mapRow: (r) => ({
      id: r.id,
      automationId: r.automationId,
      name: r.name,
      success: r.success,
      trace: parseJsonArray(r.trace),
      error: r.error || undefined,
      executedAt: r.executedAt.toISOString(),
    }),
  });
}

/**
 * clearAutomationExecutionHistory：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function clearAutomationExecutionHistory(
  deps: Pick<AutomationEngineQueryDeps, 'prisma'>,
): Promise<{ deleted: number }> {
  const result = await deps.prisma.automationExecution.deleteMany({});
  return { deleted: result.count };
}

/** 统计近 hoursBack 小时的执行分析：成功率、失败时段分布与 Top 规则 */
export async function getAutomationExecutionAnalytics(
  deps: Pick<AutomationEngineQueryDeps, 'prisma'>,
  hoursBack = 168,
) {
  const since = new Date(Date.now() - hoursBack * 3600_000);
  const [totals, failureHours, byAuto] = await Promise.all([
    deps.prisma.$queryRaw<[{ total: bigint; success_count: bigint }]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE success = true)::bigint AS success_count
      FROM "AutomationExecution"
      WHERE "executedAt" >= ${since}
    `,
    deps.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT
        EXTRACT(HOUR FROM "executedAt")::int AS hour,
        COUNT(*)::bigint AS count
      FROM "AutomationExecution"
      WHERE "executedAt" >= ${since} AND success = false
      GROUP BY 1
    `,
    deps.prisma.$queryRaw<
      Array<{ automationId: string; name: string; total: bigint; failed: bigint }>
    >`
      SELECT
        "automationId",
        "name",
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE success = false)::bigint AS failed
      FROM "AutomationExecution"
      WHERE "executedAt" >= ${since}
      GROUP BY "automationId", "name"
      ORDER BY total DESC
      LIMIT 10
    `,
  ]);
  return buildExecutionAnalyticsResult(hoursBack, totals, failureHours, byAuto);
}

// ── automation-engine-run.helper ──
const AUTOMATION_START_TRIGGER_CONFIG_ID = 'automation:lastStartTriggerAt';
const AUTOMATION_START_TRIGGER_COOLDOWN_MS = 24 * 3600_000;

/**
 * AutomationEngineRunRuntime：业务接口定义。
 * - 表示：modules/automation/engine-execute.internals.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationEngineRunRuntime {
  logger: Logger;
  prisma: PrismaService;
  haConnector: HaConnectorService;
  stateStore: StateStoreService;
  eventEmitter: EventEmitter2;
  eventBus: EventBusService;
  sceneService: SceneService;
  scriptService: ScriptService;
  triggerAutomation?: (id: string) => Promise<unknown>;
  variableService?: AutomationActionDeps['variableService'];
  weatherLat: number;
  weatherLon: number;
  /** 家庭时区（IANA）；缺省为进程本地时间 */
  homeTimezone?: string;
  maxHistory: number;
  entityStateOf: (entityId: string) => string | undefined;
  entityAttrOf?: (entityId: string, attr: string) => string | undefined;
  /** call_service 默认失败重试配置（来自 appConfig automation 分区） */
  retryDefaults?: {
    count: number;
    delayMs: number;
  };
  /** parallel 并发上限 */
  maxParallelRuns: number;
  /** queued 队列上限 */
  maxQueueLength: number;
  /** wait_template 最大等待秒数 */
  waitTemplateTimeoutSec: number;
  /** delay 最大秒数 */
  maxDelaySeconds: number;
  /** repeat 最大迭代次数 */
  maxRepeatIterations: number;
}

/**
 * createAutomationExecuteDeps：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function createAutomationExecuteDeps(
  runtime: AutomationEngineRunRuntime,
  actionDeps: AutomationActionDeps,
): AutomationExecuteDeps {
  return {
    logger: runtime.logger,
    prisma: runtime.prisma,
    eventBus: runtime.eventBus,
    actionDeps,
    maxHistory: runtime.maxHistory,
    maxParallelRuns: runtime.maxParallelRuns,
    maxQueueLength: runtime.maxQueueLength,
  };
}

/**
 * shouldSkipAutomationStartTrigger：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function shouldSkipAutomationStartTrigger(
  prisma: PrismaService,
  now = Date.now(),
): Promise<boolean> {
  const data = await loadRuntimeKv<{ at?: string }>(
    prisma,
    AUTOMATION_START_TRIGGER_CONFIG_ID,
  );
  if (!data?.at) return false;
  const ts = Date.parse(data.at);
  return !Number.isNaN(ts) && now - ts < AUTOMATION_START_TRIGGER_COOLDOWN_MS;
}

/**
 * recordAutomationStartTrigger：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function recordAutomationStartTrigger(prisma: PrismaService): Promise<void> {
  const at = new Date().toISOString();
  await prisma.runtimeKv.upsert({
    where: { id: AUTOMATION_START_TRIGGER_CONFIG_ID },
    create: { id: AUTOMATION_START_TRIGGER_CONFIG_ID, data: { at } },
    update: { data: { at } },
  });
}

/**
 * tryExecuteTimeTriggeredRule：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function tryExecuteTimeTriggeredRule(
  lastTimeFireMinute: Map<string, string>,
  rule: AutomationRule,
  minuteKey: string,
  executeRule: (rule: AutomationRule) => Promise<unknown>,
): Promise<void> {
  if (lastTimeFireMinute.get(rule.id) === minuteKey) return;
  lastTimeFireMinute.set(rule.id, minuteKey);
  await executeRule(rule);
}

/**
 * runManualAutomationTrigger：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function runManualAutomationTrigger(
  prisma: PrismaService,
  logger: Logger,
  automationId: string,
  executeRule: (rule: AutomationRule, manual: boolean) => Promise<unknown>,
): Promise<{ success: boolean; message: string }> {
  const row = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!row) return { success: false, message: '自动化不存在' };
  if (!row.enabled) return { success: false, message: '自动化已停用' };
  const rule = parseAutomationYaml(row.id, row.name, row.yaml, (msg) => logger.warn(msg));
  if (!rule) return { success: false, message: 'YAML 解析失败' };
  await executeRule(rule, true);
  return { success: true, message: '已手动触发' };
}
