/**
 * 脚本本地执行：将 HA sequence 规范为 ParsedAction 后递归执行。
 *
 * 所属模块：backend/modules/script
 * 职责：将 HA 脚本 sequence 规范为 ParsedAction 后递归执行。
 *  支持 call_service / delay / fire_event / stop / choose / sequence / condition /
 *  repeat / parallel / variables / wait_template / wait_for_trigger。
 *  对 homeos.scene|script.execute 与 scene|script.turn_on（HomeOS UUID）做本地直调，
 *  避免经 HA 绕一圈；device_action 等仍需 runOnHa。
 * 关键依赖：@homeos/shared（normalizeActions / ParsedAction / ParsedCondition / ParsedTrigger）、
 *  automation/engine-runtime（条件判定 / 触发等待）、ha/state-change-filter.util（UUID 识别）、
 *  action.util（事件载荷与 variables 提取）。
 */
import {
  normalizeActions,
  type ParsedAction,
  type ParsedCondition,
  type ParsedTrigger,
} from '@homeos/shared';
import { getErrorMessage } from '../../common/utils';
import { delayToMs, sleepMs } from '../../shared/orchestrator/execute-action-sequence.util';
import {
  checkAutomationConditionList,
  type AutomationConditionDeps,
  type AutomationTraceStep,
} from '../automation/engine-runtime';
import { isHomeOsUuid } from '../../shared/ha/state-change-filter.util';
import {
  extractScriptEventPayload,
  extractScriptExecuteVariables,
  type ScriptActionInput,
} from './action.util';

/** 单步动作执行结果（按 sequence 索引汇总，含 service / entity_id / 成功标记与错误信息） */
type ScriptLocalStepResult = {
  index: number;
  service: string;
  entity_id: string;
  success: boolean;
  error?: string;
};

/**
 * 脚本本地执行依赖集合（由 ScriptService 注入）。
 * 含 HA 服务调用、事件派发、嵌套 scene/script 直调、条件判定、模板求值与触发等待，
 * 以及可被 variables 动作写入的运行时上下文 templateContext。
 */
type ScriptLocalExecuteDeps = {
  logger: { log: (msg: string) => void; error: (msg: string) => void };
  haConnector: {
    callService: (
      domain: string,
      service: string,
      entityId: string,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  eventEmitter: { emit: (event: string, data: unknown) => void };
  sceneService: { execute: (id: string) => Promise<unknown> };
  /** 嵌套 homeos.script.execute */
  executeScript: (id: string, variables?: Record<string, unknown>) => Promise<unknown>;
  checkConditionList: (conditions: ParsedCondition[]) => Promise<boolean>;
  resolveTemplate: (tpl: string, ctx: Record<string, unknown>) => Promise<boolean>;
  waitForTriggers: (
    triggers: ParsedTrigger[],
    timeoutSec: number,
    trace: AutomationTraceStep[],
  ) => Promise<boolean>;
  /** 运行时 variables 上下文（可被 variables 动作写入） */
  templateContext: Record<string, unknown>;
};

/** 执行规范化后的脚本动作序列 */
async function executeParsedScriptActions(
  actions: ParsedAction[],
  deps: ScriptLocalExecuteDeps,
  results: ScriptLocalStepResult[],
  indexBase = 0,
): Promise<{ stopped: boolean; abortError?: boolean }> {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const index = indexBase + i;

    if (action.type === 'variables' && action.data) {
      Object.assign(deps.templateContext, action.data);
      results.push({
        index,
        service: 'variables',
        entity_id: '-',
        success: true,
      });
      continue;
    }

    if (action.type === 'parallel') {
      if (!action.sequence?.length) {
        results.push({ index, service: 'parallel', entity_id: '-', success: true });
        continue;
      }
      const branchOutcomes = await Promise.all(
        action.sequence.map(async (sub) => {
          const branchResults: ScriptLocalStepResult[] = [];
          const branchDeps: ScriptLocalExecuteDeps = {
            ...deps,
            templateContext: { ...deps.templateContext },
          };
          const outcome = await executeParsedScriptActions([sub], branchDeps, branchResults, index);
          results.push(...branchResults);
          return outcome;
        }),
      );
      const stopped = branchOutcomes.find((o) => o.stopped);
      if (stopped) return stopped;
      results.push({
        index,
        service: 'parallel',
        entity_id: '-',
        success: true,
      });
      continue;
    }

    if (action.type === 'delay') {
      await sleepMs(delayToMs(action.delay || 0, 'seconds'));
      results.push({ index, service: 'delay', entity_id: '-', success: true });
      continue;
    }

    if (action.type === 'stop') {
      const asError = action.stopError === true;
      const msg =
        (action.stopMessage && action.stopMessage.trim()) ||
        (asError ? '脚本以错误停止' : '脚本已停止');
      results.push({
        index,
        service: 'stop',
        entity_id: '-',
        success: !asError,
        error: asError ? msg : undefined,
      });
      deps.logger.log('脚本遇 stop,中止后续动作');
      return { stopped: true, abortError: asError };
    }

    if (action.type === 'condition') {
      const ok = await deps.checkConditionList(action.conditions || []);
      results.push({
        index,
        service: 'condition',
        entity_id: '-',
        success: ok,
        error: ok ? undefined : '条件未满足',
      });
      if (!ok) return { stopped: true };
      continue;
    }

    if (action.type === 'choose') {
      let matched = false;
      for (const branch of action.choose || []) {
        const pass =
          !branch.conditions?.length || (await deps.checkConditionList(branch.conditions));
        if (!pass) continue;
        matched = true;
        const nested = await executeParsedScriptActions(branch.actions || [], deps, results, index);
        if (nested.stopped) return nested;
        break;
      }
      if (!matched && action.defaultActions?.length) {
        const nested = await executeParsedScriptActions(
          action.defaultActions,
          deps,
          results,
          index,
        );
        if (nested.stopped) return nested;
      }
      results.push({
        index,
        service: 'choose',
        entity_id: '-',
        success: true,
      });
      continue;
    }

    if (action.type === 'repeat' && action.repeat) {
      const r = action.repeat;
      if (r.count && r.count > 0) {
        // count 钳制到 100（与 while/until 上限一致），防止超大 count 阻塞
        const iterations = Math.min(r.count, 100);
        for (let n = 0; n < iterations; n++) {
          const nested = await executeParsedScriptActions(r.actions || [], deps, results, index);
          if (nested.stopped) return nested;
        }
      } else if (r.while?.length) {
        for (let n = 0; n < 100; n++) {
          if (!(await deps.checkConditionList(r.while))) break;
          const nested = await executeParsedScriptActions(r.actions || [], deps, results, index);
          if (nested.stopped) return nested;
        }
      } else if (r.until?.length) {
        for (let n = 0; n < 100; n++) {
          const nested = await executeParsedScriptActions(r.actions || [], deps, results, index);
          if (nested.stopped) return nested;
          if (await deps.checkConditionList(r.until)) break;
        }
      }
      results.push({ index, service: 'repeat', entity_id: '-', success: true });
      continue;
    }

    if (action.type === 'sequence') {
      const nested = await executeParsedScriptActions(action.sequence || [], deps, results, index);
      if (nested.stopped) return nested;
      continue;
    }

    if (action.type === 'wait_template' && action.value_template) {
      const deadline = Date.now() + 300_000;
      let ok = false;
      while (Date.now() < deadline) {
        if (await deps.resolveTemplate(action.value_template, deps.templateContext)) {
          ok = true;
          break;
        }
        await sleepMs(1000);
      }
      results.push({
        index,
        service: 'wait_template',
        entity_id: '-',
        success: ok,
        error: ok ? undefined : '等待模板超时',
      });
      if (!ok) return { stopped: true };
      continue;
    }

    if (action.type === 'wait_for_trigger' && action.waitTriggers?.length) {
      const trace: AutomationTraceStep[] = [];
      const ok = await deps.waitForTriggers(action.waitTriggers, action.delay || 30, trace);
      if (!ok && !action.continueOnTimeout) {
        results.push({
          index,
          service: 'wait_for_trigger',
          entity_id: '-',
          success: false,
          error: `等待触发超时 ${action.delay || 30} 秒`,
        });
        return { stopped: true };
      }
      results.push({
        index,
        service: 'wait_for_trigger',
        entity_id: '-',
        success: true,
      });
      continue;
    }

    if (action.type === 'fire_event' && action.event) {
      const eventName = String(action.event).trim();
      const payload = extractScriptEventPayload({
        event: eventName,
        event_data: action.event_data,
        data: action.data,
      });
      try {
        if (eventName === 'homeos.scene.execute' && typeof payload.scene_id === 'string') {
          await deps.sceneService.execute(payload.scene_id);
        } else if (eventName === 'homeos.script.execute' && typeof payload.script_id === 'string') {
          await deps.executeScript(
            payload.script_id,
            extractScriptExecuteVariables(payload, ['script_id']),
          );
        } else {
          deps.eventEmitter.emit(eventName, payload);
        }
        results.push({
          index,
          service: `event:${eventName}`,
          entity_id: '-',
          success: true,
        });
      } catch (err: unknown) {
        const errMsg = getErrorMessage(err);
        deps.logger.error(`脚本事件执行失败 [${eventName}]: ${errMsg}`);
        results.push({
          index,
          service: `event:${eventName}`,
          entity_id: '-',
          success: false,
          error: errMsg,
        });
        if (!action.continueOnError) return { stopped: true, abortError: true };
      }
      continue;
    }

    if (action.type === 'call_service' && action.service) {
      const [domain, service] = String(action.service).split('.');
      if (!domain || !service) {
        results.push({
          index,
          service: action.service,
          entity_id: '-',
          success: false,
          error: '无效的服务格式',
        });
        if (!action.continueOnError) return { stopped: true, abortError: true };
        continue;
      }
      const entityId = Array.isArray(action.entity_id)
        ? String(action.entity_id[0] || '')
        : String(action.entity_id || '');
      const data = action.data || {};
      const bareId = entityId.includes('.')
        ? entityId.slice(entityId.indexOf('.') + 1)
        : entityId;
      try {
        if (domain === 'scene' && service === 'turn_on' && isHomeOsUuid(bareId || entityId)) {
          await deps.sceneService.execute(isHomeOsUuid(entityId) ? entityId : bareId);
        } else if (
          domain === 'script' &&
          service === 'turn_on' &&
          isHomeOsUuid(bareId || entityId)
        ) {
          await deps.executeScript(
            isHomeOsUuid(entityId) ? entityId : bareId,
            extractScriptExecuteVariables(data),
          );
        } else {
          await deps.haConnector.callService(domain, service, entityId, data);
        }
        results.push({
          index,
          service: action.service,
          entity_id: entityId || '-',
          success: true,
        });
      } catch (err: unknown) {
        const errMsg = getErrorMessage(err);
        deps.logger.error(`脚本执行失败 [${action.service}]: ${errMsg}`);
        results.push({
          index,
          service: action.service,
          entity_id: entityId || '-',
          success: false,
          error: errMsg,
        });
        if (!action.continueOnError) return { stopped: true, abortError: true };
      }
      continue;
    }

    results.push({
      index,
      service: action.type || 'unknown',
      entity_id: '-',
      success: false,
      error: `不支持的动作类型: ${action.type}`,
    });
    if (!action.continueOnError) return { stopped: true, abortError: true };
  }
  return { stopped: false };
}

/** 从原始 YAML sequence 执行 */
export async function executeRawScriptSequence(
  raw: ScriptActionInput[],
  deps: ScriptLocalExecuteDeps,
): Promise<ScriptLocalStepResult[]> {
  const actions = normalizeActions(raw);
  const results: ScriptLocalStepResult[] = [];
  await executeParsedScriptActions(actions, deps, results);
  return results;
}

/** 供 ScriptService 组装条件判定依赖 */
export type { AutomationConditionDeps };
export { checkAutomationConditionList };
