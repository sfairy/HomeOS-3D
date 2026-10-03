/**
 * 自动化动作执行内部实现。
 *
 * 所属模块：backend/modules/automation
 * 职责：解析 ParsedAction（call_service / delay / choose / repeat / variable_set /
 *  notify / wait_for_trigger / scene / script / event 等）并依次执行，
 *  输出 AutomationTraceStep 轨迹用于执行历史与 dry-run。
 *  依赖类型 AutomationActionDeps 由 AutomationEngineService.runRuntime 提供，
 *  供 internals 在不感知 Nest DI 的前提下完成 HA 调用、场景/脚本执行等副作用。
 * 关键依赖：haConnector / sceneService / scriptService / variableService / eventBus。
 */
import { isHomeOsUuid } from '../../shared/ha/state-change-filter.util';
import { getErrorMessage } from '../../common/utils';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import { extractScriptExecuteVariables } from '../script/action.util';
import type { ParsedAction, ParsedCondition, ParsedTrigger } from './yaml-parse.util';

// ── automation-engine-action.util ──
/**
 * AutomationTraceStep：业务类型别名。
 * - 表示：modules/automation/engine-actions.internals.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type AutomationTraceStep = { step: string; ok: boolean; detail?: string; at: string };

/** automation 动作执行所需的运行时依赖（由 AutomationEngineService 注入） */
export interface AutomationActionDeps {
  logger: {
    error: (msg: string) => void;
    debug: (msg: string) => void;
    warn: (msg: string) => void;
  };
  haConnector: {
    callService: (
      domain: string,
      service: string,
      entityId: string,
      data: Record<string, unknown>,
      requestId?: string,
    ) => Promise<unknown>;
  };
  sceneService: { execute: (id: string) => Promise<unknown> };
  scriptService: {
    execute: (id: string, variables?: Record<string, unknown>) => Promise<unknown>;
  };
  /** 触发本地 HomeOS 自动化（UUID），避免 automation.trigger 打到 HA */
  triggerAutomation?: (id: string) => Promise<unknown>;
  eventEmitter: { emit: (event: string, data: unknown) => void };
  checkConditionList: (
    conditions: ParsedCondition[],
    currentRuleId?: string,
  ) => Promise<boolean>;
  resolveTemplate: (tpl: string, ctx: Record<string, unknown>) => Promise<boolean>;
  waitForTriggers: (
    triggers: ParsedTrigger[],
    timeoutSec: number,
    trace: AutomationTraceStep[],
  ) => Promise<boolean>;
  /** 本地持久变量读写（homeos.variable.set） */
  variableService?: {
    upsertSet: (input: {
      key: string;
      scope?: 'global' | 'rule';
      ruleId?: string | null;
      op?: 'set' | 'add' | 'concat';
      value?: string | number;
      type?: 'number' | 'string';
      name?: string;
    }) => Promise<unknown>;
    getValue: (
      key: string,
      scope?: 'global' | 'rule',
      ruleId?: string | null,
    ) => Promise<string | number | null>;
    applyMath?: (input: {
      key: string;
      scope?: 'global' | 'rule';
      ruleId?: string | null;
      op: '+' | '-' | '*' | '/' | '%';
      lhs: number;
      rhs: number;
      name?: string;
    }) => Promise<unknown>;
    applyFn?: (input: {
      key: string;
      scope?: 'global' | 'rule';
      ruleId?: string | null;
      fn: string;
      arg?: string | number;
      digits?: number;
      name?: string;
    }) => Promise<unknown>;
  };
  entityStateOf?: (entityId: string) => string | undefined;
  getEntityAttr?: (entityId: string, attr: string) => unknown;
  /** call_service 默认失败重试（动作自身 retry 优先） */
  retryDefaults?: {
    count: number;
    delayMs: number;
  };
  /** wait_template 最大等待秒数 */
  waitTemplateTimeoutSec?: number;
  /** delay 最大秒数 */
  maxDelaySeconds?: number;
  /** repeat 最大迭代次数 */
  maxRepeatIterations?: number;
}

/** wait_template 动作最大等待秒数（可被 deps.waitTemplateTimeoutSec 覆盖） */
const WAIT_TEMPLATE_TIMEOUT_S = 300;
/** delay 动作最大秒数（可被 deps.maxDelaySeconds 覆盖） */
const MAX_DELAY_SECONDS = 600;
/** parallel 动作分支并发上限：防止分支过多时同时向 HA 打爆大量服务调用 */
const PARALLEL_ACTION_CONCURRENCY = 8;

function nowIso(): string {
  return new Date().toISOString();
}

/** 递归执行 automation 动作序列，返回是否全部成功 */
export async function executeAutomationActions(
  deps: AutomationActionDeps,
  actions: ParsedAction[],
  trace: AutomationTraceStep[],
  templateContext: Record<string, unknown>,
  shouldAbort?: () => boolean,
  currentRuleId?: string,
  retryOptions?: { count: number; delayMs: number },
): Promise<boolean> {
  let success = true;
  const defaultRetryCount = retryOptions?.count ?? 0;
  const defaultRetryDelayMs = retryOptions?.delayMs ?? 1000;
  /** 步骤失败：默认中止序列；continue_on_error 时继续 */
  const failAndMaybeAbort = (act: ParsedAction): boolean => {
    success = false;
    return !act.continueOnError;
  };

  let actionOrdinal = 0;
  for (const action of actions) {
    actionOrdinal += 1;
    if (shouldAbort?.()) return false;
    if (action.type === 'variables' && action.data) {
      Object.assign(templateContext, action.data);
      trace.push({
        step: 'variables',
        ok: true,
        detail: Object.keys(action.data).join(','),
        at: nowIso(),
      });
      continue;
    }

    if (action.type === 'parallel') {
      if (!action.sequence?.length) {
        trace.push({
          step: 'parallel',
          ok: true,
          detail: '0 个分支',
          at: nowIso(),
        });
        continue;
      }
      // 各分支使用独立 trace 子数组，避免并发分支交叉污染同一 trace；
      // 并发上限（8）防止 parallel 分支过多时同时向 HA 打爆大量服务调用
      const branchResults = await mapWithConcurrency(
        action.sequence,
        PARALLEL_ACTION_CONCURRENCY,
        (sub) => {
          const branchTrace: AutomationTraceStep[] = [];
          return executeAutomationActions(
            deps,
            [sub],
            branchTrace,
            { ...templateContext },
            shouldAbort,
            currentRuleId,
            retryOptions,
          ).then((ok) => ({ ok, branchTrace }));
        },
      );
      // 按分支顺序拼接各分支 trace，再追加 parallel 汇总条目
      for (const r of branchResults) {
        trace.push(...r.branchTrace);
        success = r.ok && success;
      }
      trace.push({
        step: 'parallel',
        ok: success,
        detail: `${action.sequence.length} 个分支`,
        at: nowIso(),
      });
      continue;
    }

    if (action.type === 'delay') {
      let totalSec = action.delay || 1;
      const maxDelay = deps.maxDelaySeconds ?? MAX_DELAY_SECONDS;
      if (totalSec > maxDelay) {
        deps.logger.warn(`delay 动作 ${totalSec}s 超出上限,已夹取为 ${maxDelay}s`);
        totalSec = maxDelay;
      }
      for (let i = 0; i < totalSec; i++) {
        if (shouldAbort?.()) return false;
        await new Promise((r) => setTimeout(r, 1000));
      }
      trace.push({ step: 'delay', ok: true, detail: `${totalSec}s`, at: nowIso() });
      continue;
    }

    if (action.type === 'condition') {
      const ok = await deps.checkConditionList(action.conditions || [], currentRuleId);
      trace.push({ step: 'condition', ok, at: nowIso() });
      if (!ok && failAndMaybeAbort(action)) return false;
      continue;
    }

    if (action.type === 'choose') {
      let matched = false;
      for (const branch of action.choose || []) {
        const pass =
          !branch.conditions?.length || (await deps.checkConditionList(branch.conditions, currentRuleId));
        if (!pass) continue;
        matched = true;
        success =
          (await executeAutomationActions(
            deps,
            branch.actions,
            trace,
            templateContext,
            shouldAbort,
            currentRuleId,
            retryOptions,
          )) && success;
        break;
      }
      if (!matched && action.defaultActions?.length) {
        success =
          (await executeAutomationActions(
            deps,
            action.defaultActions,
            trace,
            templateContext,
            shouldAbort,
            currentRuleId,
            retryOptions,
          )) && success;
      }
      trace.push({
        step: 'choose',
        ok: true,
        detail: matched ? 'branch' : 'default',
        at: nowIso(),
      });
      continue;
    }

    if (action.type === 'repeat' && action.repeat) {
      const r = action.repeat;
      const maxIter = deps.maxRepeatIterations ?? 100;
      if (r.count && r.count > 0) {
        // count 同样钳制到 maxRepeatIterations，防止超大 count 阻塞规则线程/刷爆 HA
        const iterations = Math.min(r.count, maxIter);
        for (let i = 0; i < iterations; i++) {
          if (shouldAbort?.()) return false;
          success =
            (await executeAutomationActions(
              deps,
              r.actions,
              trace,
              templateContext,
              shouldAbort,
              currentRuleId,
              retryOptions,
            )) && success;
        }
      } else if (r.while?.length) {
        for (let i = 0; i < maxIter; i++) {
          if (shouldAbort?.()) return false;
          if (!(await deps.checkConditionList(r.while, currentRuleId))) break;
          success =
            (await executeAutomationActions(
              deps,
              r.actions,
              trace,
              templateContext,
              shouldAbort,
              currentRuleId,
              retryOptions,
            )) && success;
        }
      } else if (r.until?.length) {
        // HA 语义：先执行 body，再检查 until；满足则退出（最多 maxIter 次）
        for (let i = 0; i < maxIter; i++) {
          if (shouldAbort?.()) return false;
          success =
            (await executeAutomationActions(
              deps,
              r.actions,
              trace,
              templateContext,
              shouldAbort,
              currentRuleId,
              retryOptions,
            )) && success;
          if (await deps.checkConditionList(r.until, currentRuleId)) break;
        }
      }
      trace.push({ step: 'repeat', ok: true, at: nowIso() });
      continue;
    }

    if (action.type === 'sequence') {
      if (!action.sequence?.length) {
        trace.push({
          step: 'sequence',
          ok: true,
          detail: '0 步',
          at: nowIso(),
        });
        continue;
      }
      success =
        (await executeAutomationActions(
          deps,
          action.sequence,
          trace,
          templateContext,
          shouldAbort,
          currentRuleId,
        )) && success;
      continue;
    }

    if (action.type === 'wait_template' && action.value_template) {
      const timeoutSec = deps.waitTemplateTimeoutSec ?? WAIT_TEMPLATE_TIMEOUT_S;
      const deadline = Date.now() + timeoutSec * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        if (await deps.resolveTemplate(action.value_template, templateContext)) {
          ok = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      trace.push({ step: 'wait_template', ok, at: nowIso() });
      if (!ok && failAndMaybeAbort(action)) return false;
      continue;
    }

    if (action.type === 'wait_for_trigger' && action.waitTriggers?.length) {
      const ok = await deps.waitForTriggers(action.waitTriggers, action.delay || 30, trace);
      if (!ok && !action.continueOnTimeout && failAndMaybeAbort(action)) return false;
      continue;
    }

    if (action.type === 'stop') {
      const asError = Boolean(action.stopError);
      trace.push({
        step: 'stop',
        ok: !asError,
        detail: action.stopMessage || (asError ? 'error' : 'ok'),
        at: nowIso(),
      });
      if (asError) {
        success = false;
        return false;
      }
      return success;
    }

    if (action.type === 'device_action') {
      deps.logger.warn('HA device 动作需由 HA 执行,本地引擎已跳过');
      trace.push({
        step: 'device_action',
        ok: false,
        detail: action.device_id || action.entity_id || 'device',
        at: nowIso(),
      });
      if (failAndMaybeAbort(action)) return false;
      continue;
    }

    if (action.type === 'call_service' && action.service) {
      const [domain, service] = action.service.split('.');
      const entityId =
        action.entity_id ||
        String((action.data as Record<string, unknown> | undefined)?.entity_id || '');
      if (domain === 'homeos' && service === 'variable_set' && deps.variableService) {
        const data = { ...(action.data || {}) } as Record<string, unknown>;
        const key = String(data.key || entityId || '');
        try {
          let value = (data.value as string | number) ?? '';
          if (data.source_var) {
            const fromVar = await deps.variableService.getValue(
              String(data.source_var),
              data.scope === 'rule' ? 'rule' : 'global',
              data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
            );
            if (fromVar != null) value = fromVar as string | number;
          } else if (data.source_entity_id && deps.entityStateOf) {
            const srcId = String(data.source_entity_id);
            const attr = data.source_attribute != null ? String(data.source_attribute) : '';
            const fromEntity =
              attr && deps.getEntityAttr
                ? deps.getEntityAttr(srcId, attr)
                : deps.entityStateOf(srcId);
            if (fromEntity != null) value = fromEntity as string | number;
          }
          await deps.variableService.upsertSet({
            key,
            scope: data.scope === 'rule' ? 'rule' : 'global',
            ruleId: data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
            op: (data.op as 'set' | 'add' | 'concat') || 'set',
            value,
            // 缺省不强制 string：由 variableService 继承已有类型；add 默认 number
            type:
              data.type === 'number'
                ? 'number'
                : data.type === 'string'
                  ? 'string'
                  : undefined,
          });
          trace.push({
            step: 'homeos.variable_set',
            ok: true,
            detail: `${key}=${value}`,
            at: nowIso(),
          });
        } catch (e) {
          deps.logger.error(`变量赋值失败: ${getErrorMessage(e)}`);
          trace.push({
            step: 'homeos.variable_set',
            ok: false,
            detail: getErrorMessage(e),
            at: nowIso(),
          });
          if (failAndMaybeAbort(action)) return false;
        }
        continue;
      }
      if (domain === 'homeos' && service === 'variable_math' && deps.variableService?.applyMath) {
        const variableService = deps.variableService;
        const data = { ...(action.data || {}) } as Record<string, unknown>;
        const key = String(data.key || '');
        try {
          const resolveNum = async (literal: unknown, varKey: unknown) => {
            if (varKey) {
              const v = await variableService.getValue(
                String(varKey),
                data.scope === 'rule' ? 'rule' : 'global',
                data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
              );
              return Number(v ?? 0);
            }
            return Number(literal ?? 0);
          };
          const lhs = await resolveNum(data.lhs, data.lhs_var);
          const rhs = await resolveNum(data.rhs, data.rhs_var);
          const op = (String(data.op || '+') as '+' | '-' | '*' | '/' | '%') || '+';
          await deps.variableService.applyMath({
            key,
            scope: data.scope === 'rule' ? 'rule' : 'global',
            ruleId: data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
            op,
            lhs: Number.isFinite(lhs) ? lhs : 0,
            rhs: Number.isFinite(rhs) ? rhs : 0,
          });
          trace.push({
            step: 'homeos.variable_math',
            ok: true,
            detail: `${key} ${lhs}${op}${rhs}`,
            at: nowIso(),
          });
        } catch (e) {
          deps.logger.error(`变量运算失败: ${getErrorMessage(e)}`);
          trace.push({
            step: 'homeos.variable_math',
            ok: false,
            detail: getErrorMessage(e),
            at: nowIso(),
          });
          if (failAndMaybeAbort(action)) return false;
        }
        continue;
      }
      if (domain === 'homeos' && service === 'variable_fn' && deps.variableService?.applyFn) {
        const data = { ...(action.data || {}) } as Record<string, unknown>;
        const key = String(data.key || '');
        try {
          let arg: string | number = (data.arg as string | number) ?? '';
          if (data.arg_var) {
            const v = await deps.variableService.getValue(
              String(data.arg_var),
              data.scope === 'rule' ? 'rule' : 'global',
              data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
            );
            arg = v ?? '';
          } else if (data.source_entity_id && deps.entityStateOf) {
            const srcId = String(data.source_entity_id);
            const attr = data.source_attribute != null ? String(data.source_attribute) : '';
            const fromEntity =
              attr && deps.getEntityAttr
                ? deps.getEntityAttr(srcId, attr)
                : deps.entityStateOf(srcId);
            if (fromEntity != null) arg = fromEntity as string | number;
          }
          await deps.variableService.applyFn({
            key,
            scope: data.scope === 'rule' ? 'rule' : 'global',
            ruleId: data.scope === 'rule' ? String(data.rule_id || currentRuleId || '') || null : null,
            fn: String(data.fn || 'round'),
            arg,
            digits: data.digits != null ? Number(data.digits) : 0,
          });
          trace.push({
            step: 'homeos.variable_fn',
            ok: true,
            detail: `${String(data.fn || 'round')} → ${key}`,
            at: nowIso(),
          });
        } catch (e) {
          deps.logger.error(`变量函数失败: ${getErrorMessage(e)}`);
          trace.push({
            step: 'homeos.variable_fn',
            ok: false,
            detail: getErrorMessage(e),
            at: nowIso(),
          });
          if (failAndMaybeAbort(action)) return false;
        }
        continue;
      }
      if (domain && service) {
        // 重试策略：动作自带 retry > 默认配置 > 不重试
        const retryCount =
          typeof action.retry?.count === 'number'
            ? action.retry.count
            : defaultRetryCount;
        const retryDelayMs =
          typeof action.retry?.delayMs === 'number'
            ? action.retry.delayMs
            : defaultRetryDelayMs;
        let attempt = 0;
        let lastError: unknown;
        for (;;) {
          attempt += 1;
          try {
            const bareId = entityId.includes('.')
              ? entityId.slice(entityId.indexOf('.') + 1)
              : entityId;
            if (domain === 'scene' && service === 'turn_on' && isHomeOsUuid(bareId || entityId)) {
              await deps.sceneService.execute(isHomeOsUuid(entityId) ? entityId : bareId);
              trace.push({
                step: 'homeos.scene',
                ok: true,
                detail: isHomeOsUuid(entityId) ? entityId : bareId,
                at: nowIso(),
              });
            } else if (
              domain === 'script' &&
              service === 'turn_on' &&
              isHomeOsUuid(bareId || entityId)
            ) {
              const scriptId = isHomeOsUuid(entityId) ? entityId : bareId;
              await deps.scriptService.execute(
                scriptId,
                extractScriptExecuteVariables(action.data || {}),
              );
              trace.push({
                step: 'homeos.script',
                ok: true,
                detail: scriptId,
                at: nowIso(),
              });
            } else if (
              domain === 'automation' &&
              (service === 'trigger' || service === 'turn_on') &&
              isHomeOsUuid(bareId || entityId) &&
              deps.triggerAutomation
            ) {
              const autoId = isHomeOsUuid(entityId) ? entityId : bareId;
              await deps.triggerAutomation(autoId);
              trace.push({ step: 'homeos.automation', ok: true, detail: autoId, at: nowIso() });
            } else {
              // 幂等键：规则 id + 动作序号（重试沿用同键，避免断连重放 / 重试造成命令重复执行）
              const requestId =
                currentRuleId && actionOrdinal
                  ? `auto:${currentRuleId}:${actionOrdinal}`
                  : undefined;
              await deps.haConnector.callService(
                domain,
                service,
                entityId,
                action.data || {},
                requestId,
              );
              trace.push({
                step: action.service,
                ok: true,
                detail: entityId || '（无实体）',
                at: nowIso(),
              });
            }
            break;
          } catch (e) {
            lastError = e;
            const msg = getErrorMessage(e);
            if (attempt <= retryCount) {
              deps.logger.warn(
                `动作执行失败 [${action.service}] 第 ${attempt}/${retryCount + 1} 次: ${msg},${retryDelayMs}ms 后重试`,
              );
              await new Promise((r) => setTimeout(r, retryDelayMs));
              continue;
            }
            trace.push({ step: action.service, ok: false, detail: msg, at: nowIso() });
            deps.logger.error(`动作执行失败 [${action.service}]: ${msg}`);
            if (failAndMaybeAbort(action)) return false;
            break;
          }
        }
        if (lastError && action.continueOnError) {
          // continue_on_error 时已记录失败 trace，继续后续步骤
        }
      }
      continue;
    }

    if (action.type === 'fire_event' && action.event) {
      const data = action.event_data || {};
      if (action.event === 'homeos.scene.execute' && typeof data.scene_id === 'string') {
        try {
          await deps.sceneService.execute(data.scene_id);
          trace.push({
            step: 'homeos.scene.execute',
            ok: true,
            detail: data.scene_id,
            at: nowIso(),
          });
        } catch (e) {
          trace.push({
            step: 'homeos.scene.execute',
            ok: false,
            detail: getErrorMessage(e),
            at: nowIso(),
          });
          if (failAndMaybeAbort(action)) return false;
        }
        continue;
      }
      if (action.event === 'homeos.script.execute' && typeof data.script_id === 'string') {
        try {
          await deps.scriptService.execute(
            data.script_id,
            extractScriptExecuteVariables(data, ['script_id']),
          );
          trace.push({
            step: 'homeos.script.execute',
            ok: true,
            detail: data.script_id,
            at: nowIso(),
          });
        } catch (e) {
          trace.push({
            step: 'homeos.script.execute',
            ok: false,
            detail: getErrorMessage(e),
            at: nowIso(),
          });
          if (failAndMaybeAbort(action)) return false;
        }
        continue;
      }
      const payload =
        data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : {};
      // loop_start/stop：未写 automation_id 时回落到当前规则
      if (
        (action.event === 'homeos.loop_start' || action.event === 'homeos.loop_stop') &&
        payload.automation_id == null &&
        currentRuleId
      ) {
        payload.automation_id = currentRuleId;
      }
      deps.eventEmitter.emit(action.event, payload);
      trace.push({ step: `event:${action.event}`, ok: true, at: nowIso() });
      deps.logger.debug(`触发自定义事件: ${action.event}`);
      continue;
    }

    deps.logger.warn(`不支持的动作类型 "${action.type}",已跳过`);
    trace.push({
      step: 'unsupported_action',
      ok: false,
      detail: String(action.type),
      at: nowIso(),
    });
    if (failAndMaybeAbort(action)) return false;
  }
  return success;
}
