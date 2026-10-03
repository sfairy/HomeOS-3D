/**
 * 自动化触发器匹配内部实现。
 *
 * 所属模块：backend/modules/automation
 * 职责：覆盖自动化全部触发器的判定与追踪：
 *  - state / numeric_state / time / time_pattern / cron / sun / event /
 *    zone / calendar / device / webhook / homeassistant / interval
 *  - wait_for_trigger 的等待与超时
 *  - state 触发器的 for 持续时长计时
 *  - per-entity 去抖合并
 *  - time / interval / sun 的定时扫描入口
 * 关键依赖：AutomationTriggerDeps（由 AutomationEngineService 注入）。
 */
import type { AutomationTraceStep, AutomationActionDeps } from './engine-actions.internals';
import {
  automationEntityIdsOf,
  matchAutomationEntity,
  isSunTriggerNow,
  resolveAutomationTemplateWithRuntime,
} from './engine-conditions.internals';
import type { AutomationEngineRunRuntime } from './engine-execute.internals';
import type { AutomationRuleIndex } from './rule-index.util';
import type { AutomationRule, ParsedTrigger } from './yaml-parse.util';
import { matchCronExpression, normalizeAutomationTimeStr, zonedDateParts } from '@homeos/shared';

export { matchCronExpression };

// ── automation-engine-trigger.util ──
/** 触发器评估所需的运行时依赖（由 AutomationEngineService 注入） */
export interface AutomationTriggerDeps {
  entityStateOf: (entityId: string) => string | undefined;
  /** 读取实体 attribute 当前值（用于 attribute + for 到期校验） */
  entityAttrOf?: (entityId: string, attr: string) => string | undefined;
  checkConditions: (rule: AutomationRule) => Promise<boolean>;
  isSunTriggerNow: (trigger: ParsedTrigger, windowMs: number) => boolean;
  /** template 触发求值（本地优先，HA 兜底） */
  resolveTemplate?: (tpl: string) => Promise<boolean>;
  /** 家庭时区（IANA）；缺省为进程本地时间 */
  homeTimezone?: string;
}

/** time_pattern 值解析：数字精确匹配、`*` 任意、`/N` 每 N 个 */
function matchTimePatternPart(part: string | undefined, value: number): boolean {
  if (!part) return true;
  const p = part.trim();
  if (p === '*' || p === '') return true;
  if (p.startsWith('/')) {
    const n = parseInt(p.slice(1), 10);
    if (!Number.isFinite(n) || n <= 0) return false;
    return value % n === 0;
  }
  if (/^\d+$/.test(p)) return parseInt(p, 10) === value;
  // 支持 `*/N` 等价写法
  if (p.startsWith('*/')) {
    const n = parseInt(p.slice(2), 10);
    if (!Number.isFinite(n) || n <= 0) return false;
    return value % n === 0;
  }
  return false;
}

/** 判断当前时间是否满足 time_pattern 触发 */
export function isTimePatternTriggerNow(
  trigger: ParsedTrigger,
  now: Date,
  timeZone?: string,
): boolean {
  const p = trigger.pattern;
  if (!p) return false;
  const parts = zonedDateParts(now, timeZone);
  if (!matchTimePatternPart(p.hours, parts.hour)) return false;
  if (!matchTimePatternPart(p.minutes, parts.minute)) return false;
  if (!matchTimePatternPart(p.seconds, parts.second)) return false;
  return true;
}

/** 将 HH:MM:SS interval 串解析为秒数 */
export function parseIntervalSeconds(interval: string | undefined): number | null {
  if (!interval) return null;
  const parts = String(interval)
    .split(':')
    .map((x) => parseInt(x.trim(), 10));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

/** 解析 forPending key：`ruleId:ti:entityId` 或 `ruleId:ti:entityId:attr` */
function parseForPendingKey(
  key: string,
  triggerAttribute?: string,
): { ruleId: string; ti: number; entityId: string; attr?: string } | null {
  const first = key.indexOf(':');
  if (first < 0) return null;
  const second = key.indexOf(':', first + 1);
  if (second < 0) return null;
  const ruleId = key.slice(0, first);
  const ti = parseInt(key.slice(first + 1, second), 10);
  if (!Number.isFinite(ti)) return null;
  const rest = key.slice(second + 1);
  if (!rest) return null;
  const attr = triggerAttribute ? String(triggerAttribute) : '';
  if (attr && rest.endsWith(`:${attr}`)) {
    return {
      ruleId,
      ti,
      entityId: rest.slice(0, rest.length - attr.length - 1),
      attr,
    };
  }
  return { ruleId, ti, entityId: rest };
}

function zoneShortName(zoneRef?: string): string {
  if (!zoneRef) return '';
  return zoneRef.startsWith('zone.') ? zoneRef.slice(5) : zoneRef;
}

function matchEntity(pattern: string | string[] | undefined, entityId: string): boolean {
  return matchAutomationEntity(pattern, entityId);
}

function entityIdsOf(ref?: string | string[]): string[] {
  return automationEntityIdsOf(ref);
}

/** 读取 wait 用的当前值（优先 attribute） */
function readWaitEntityValue(
  deps: Pick<AutomationTriggerDeps, 'entityStateOf' | 'entityAttrOf'>,
  entityId: string,
  attribute?: string,
): string | undefined {
  const attr = attribute ? String(attribute) : '';
  if (attr && deps.entityAttrOf) return deps.entityAttrOf(entityId, attr);
  return deps.entityStateOf(entityId);
}

/** wait_for_trigger 轮询：是否刚发生满足条件的状态/事件变化 */
function isWaitTriggerSatisfied(
  deps: Pick<AutomationTriggerDeps, 'entityStateOf' | 'entityAttrOf'> & {
    consumeEvent?: (eventType: string) => Record<string, unknown> | null;
  },
  trigger: ParsedTrigger,
  prevStates: Map<string, string | undefined>,
): boolean {
  if (trigger.platform === 'state') {
    const ids = entityIdsOf(trigger.entity_id);
    if (!ids.length) return false;
    for (const id of ids) {
      const st = readWaitEntityValue(deps, id, trigger.attribute);
      if (st === undefined) continue;
      const prev = prevStates.get(id);
      prevStates.set(id, st);
      if (prev === undefined || prev === st) continue;
      const toOk = !trigger.to || trigger.to === 'any' || st === trigger.to;
      const fromOk = !trigger.from || prev === trigger.from;
      if (toOk && fromOk) return true;
    }
    return false;
  }
  if (trigger.platform === 'numeric_state') {
    const ids = entityIdsOf(trigger.entity_id);
    if (!ids.length) return false;
    for (const id of ids) {
      const raw = readWaitEntityValue(deps, id, trigger.attribute);
      const val = parseFloat(raw || '');
      if (Number.isNaN(val)) continue;
      const prevRaw = prevStates.get(id);
      prevStates.set(id, raw);
      const oldVal = parseFloat(prevRaw || '');
      const nowIn = numericStateInRange(val, trigger.above, trigger.below);
      if (!nowIn) continue;
      if (!Number.isNaN(oldVal) && numericStateInRange(oldVal, trigger.above, trigger.below)) {
        continue;
      }
      if (prevRaw === undefined) continue;
      return true;
    }
    return false;
  }
  if (trigger.platform === 'zone') {
    const ids = entityIdsOf(trigger.entity_id);
    const zoneName = zoneShortName(trigger.zone);
    if (!ids.length || !zoneName) return false;
    const event = (trigger.event || trigger.event_type || 'enter').toLowerCase();
    for (const id of ids) {
      const st = deps.entityStateOf(id);
      if (st === undefined) continue;
      const prev = prevStates.get(id);
      prevStates.set(id, st);
      if (prev === undefined || prev === st) continue;
      const entered = event === 'enter' && st === zoneName && prev !== zoneName;
      const left = event === 'leave' && prev === zoneName && st !== zoneName;
      if (entered || left) return true;
    }
    return false;
  }
  if (trigger.platform === 'calendar') {
    const ids = entityIdsOf(trigger.entity_id);
    if (!ids.length) return false;
    const calEvent = (trigger.event || trigger.event_type || 'start').toLowerCase();
    for (const id of ids) {
      const st = deps.entityStateOf(id);
      if (st === undefined) continue;
      const prev = prevStates.get(id);
      prevStates.set(id, st);
      if (prev === undefined || prev === st) continue;
      const started = calEvent === 'start' && st === 'on' && prev !== 'on';
      const ended = calEvent === 'end' && st === 'off' && prev === 'on';
      if (started || ended) return true;
    }
    return false;
  }
  if (trigger.platform === 'event' && deps.consumeEvent) {
    const et = trigger.event_type || trigger.event;
    if (!et) return false;
    const payload = deps.consumeEvent(et);
    if (!payload) return false;
    const want = trigger.event_data;
    if (want && typeof want === 'object') {
      for (const [k, v] of Object.entries(want)) {
        if (String(payload[k]) !== String(v)) return false;
      }
    }
    return true;
  }
  return false;
}

function numericStateInRange(val: number, above?: number, below?: number): boolean {
  if (above != null && val <= above) return false;
  if (below != null && val >= below) return false;
  return true;
}

/** 轮询等待任一 wait_for_trigger 子触发器满足，超时返回 false 并记录轨迹 */
export async function waitForTriggers(
  deps: Pick<AutomationTriggerDeps, 'entityStateOf' | 'entityAttrOf'> & {
    consumeEvent?: (eventType: string) => Record<string, unknown> | null;
    beginEventCapture?: (eventTypes: string[]) => () => void;
  },
  triggers: ParsedTrigger[],
  timeoutSec: number,
  trace: AutomationTraceStep[],
): Promise<boolean> {
  const deadline = Date.now() + timeoutSec * 1000;
  const prevByTrigger = triggers.map(() => new Map<string, string | undefined>());
  const eventTypes = triggers
    .filter((t) => t.platform === 'event')
    .map((t) => t.event_type || t.event)
    .filter((x): x is string => Boolean(x));
  const stopCapture = deps.beginEventCapture?.(eventTypes);

  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    for (const id of entityIdsOf(t.entity_id)) {
      prevByTrigger[i].set(id, readWaitEntityValue(deps, id, t.attribute));
    }
  }
  try {
    while (Date.now() < deadline) {
      for (let i = 0; i < triggers.length; i++) {
        if (isWaitTriggerSatisfied(deps, triggers[i], prevByTrigger[i])) {
          trace.push({
            step: 'wait_for_trigger',
            ok: true,
            detail: triggers[i].platform,
            at: new Date().toISOString(),
          });
          return true;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    stopCapture?.();
  }
  trace.push({
    step: 'wait_for_trigger',
    ok: false,
    detail: `超时 ${timeoutSec} 秒`,
    at: new Date().toISOString(),
  });
  return false;
}

/** 将事件分发给匹配 homeassistant / event 触发器的规则：校验 event_data 后逐条执行 */
export async function dispatchEventTriggers(
  rules: AutomationRule[],
  eventName: string,
  checkConditions: (rule: AutomationRule) => Promise<boolean>,
  executeRule: (rule: AutomationRule) => Promise<void>,
  eventData?: Record<string, unknown>,
): Promise<void> {
  for (const rule of rules) {
    let triggerMatched = false;
    for (const trigger of rule.triggers) {
      if (trigger.platform === 'homeassistant' && trigger.event === eventName) {
        triggerMatched = true;
        break;
      }
      if (
        trigger.platform === 'event' &&
        (trigger.event_type === eventName || trigger.event === eventName)
      ) {
        // 声明了 event_data 时：payload 对应 key 须宽松相等（覆盖 presence.atHome 等）
        const want = trigger.event_data;
        if (want && typeof want === 'object' && Object.keys(want).length) {
          if (!eventData || typeof eventData !== 'object') continue;
          let dataOk = true;
          for (const [k, v] of Object.entries(want)) {
            if (String(eventData[k]) !== String(v)) {
              dataOk = false;
              break;
            }
          }
          if (!dataOk) continue;
        }
        // 变量变更：rule scope 额外要求 ruleId 匹配自身
        if (
          eventName === 'homeos.var_changed' &&
          trigger.event_data?.scope === 'rule' &&
          eventData?.ruleId != null
        ) {
          if (String(eventData.ruleId) !== String(rule.id)) continue;
        }
        // 自动化启用：仅匹配自身
        if (
          eventName === 'homeos.automation.enabled' &&
          eventData?.automation_id != null &&
          String(eventData.automation_id) !== rule.id
        ) {
          continue;
        }
        triggerMatched = true;
        break;
      }
    }
    if (!triggerMatched) continue;
    if (!(await checkConditions(rule))) continue;
    await executeRule(rule);
  }
}

/** 处理实体状态变化：匹配 state / device 触发器（含 for 持续计时与去抖） */
export async function trackStateTrigger(
  deps: AutomationTriggerDeps,
  forPending: Map<string, number>,
  rule: AutomationRule,
  entityId: string,
  oldState: string | undefined,
  newState: string | undefined,
  oldAttrs?: Record<string, unknown> | null,
  newAttrs?: Record<string, unknown> | null,
): Promise<boolean> {
  for (let ti = 0; ti < rule.triggers.length; ti++) {
    const trigger = rule.triggers[ti];
    if (trigger.platform !== 'state' && trigger.platform !== 'device') continue;
    if (trigger.entity_id && !matchEntity(trigger.entity_id, entityId)) continue;

    // device 触发器：type 映射为 state 期望（turned_on→on / turned_off→off / changed→任意变化）
    if (trigger.platform === 'device') {
      const type = (trigger.device_type || trigger.event_type || '').toLowerCase();
      if (newState === undefined || oldState === newState) continue;
      if (type === 'turned_on' && newState !== 'on') continue;
      if (type === 'turned_off' && newState !== 'off') continue;
      if (type === 'changed' || type === '' || type === 'state_changed') {
        // changed 允许任意状态变化
      } else if (type && !['turned_on', 'turned_off', 'changed', 'state_changed'].includes(type)) {
        continue;
      }
      if (!(await deps.checkConditions(rule))) continue;
      return true;
    }

    const attr = trigger.attribute;
    const oldVal = attr
      ? oldAttrs?.[attr] != null
        ? String(oldAttrs[attr])
        : undefined
      : oldState;
    const newVal = attr
      ? newAttrs?.[attr] != null
        ? String(newAttrs[attr])
        : undefined
      : newState;

    const key = `${rule.id}:${ti}:${entityId}${attr ? `:${attr}` : ''}`;
    const toOk = !trigger.to || trigger.to === 'any' || newVal === trigger.to;
    if (!toOk || newVal === undefined) {
      forPending.delete(key);
      continue;
    }
    // 未指定 attribute 时纯属性变化（state 未变）不触发，对齐 HA
    if (oldVal === newVal) continue;

    if (trigger.for && trigger.for > 0) {
      if (trigger.from && oldVal !== trigger.from && !forPending.has(key)) continue;
      // pending 期间观测值变化则重置计时（无 to 时中途变态不应到期开火）
      forPending.set(key, Date.now());
      continue;
    }

    if (trigger.from && oldVal !== trigger.from) continue;
    if (!(await deps.checkConditions(rule))) continue;
    return true;
  }
  return false;
}

/** 处理实体数值变化：匹配 numeric_state 触发器（above/below 区间与 for 持续计时） */
export async function trackNumericTrigger(
  deps: AutomationTriggerDeps,
  forPending: Map<string, number>,
  rule: AutomationRule,
  entityId: string,
  oldState: string | undefined,
  newState: string | undefined,
  oldAttrs?: Record<string, unknown> | null,
  newAttrs?: Record<string, unknown> | null,
): Promise<boolean> {
  for (let ti = 0; ti < rule.triggers.length; ti++) {
    const trigger = rule.triggers[ti];
    if (trigger.platform !== 'numeric_state') continue;
    if (trigger.entity_id && !matchEntity(trigger.entity_id, entityId)) continue;
    const attr = trigger.attribute;
    const rawNew = attr
      ? newAttrs?.[attr] != null
        ? String(newAttrs[attr])
        : undefined
      : newState;
    const rawOld = attr
      ? oldAttrs?.[attr] != null
        ? String(oldAttrs[attr])
        : undefined
      : oldState;
    const val = parseFloat(rawNew || '');
    if (Number.isNaN(val)) continue;
    const oldVal = parseFloat(rawOld || '');
    const inRange = numericStateInRange(val, trigger.above, trigger.below);
    const key = `${rule.id}:${ti}:${entityId}${attr ? `:${attr}` : ''}`;
    if (!inRange) {
      forPending.delete(key);
      continue;
    }
    const wasInRange = !Number.isNaN(oldVal) && numericStateInRange(oldVal, trigger.above, trigger.below);
    if (trigger.for && trigger.for > 0) {
      if (!forPending.has(key)) {
        if (wasInRange) continue;
        forPending.set(key, Date.now());
      }
      continue;
    }
    if (wasInRange) continue;
    if (rawOld === undefined && !attr) continue;
    if (!(await deps.checkConditions(rule))) continue;
    return true;
  }
  return false;
}

/** 处理实体区域变化：匹配 zone 触发器（enter / leave） */
export async function trackZoneTrigger(
  deps: AutomationTriggerDeps,
  rule: AutomationRule,
  entityId: string,
  oldState: string | undefined,
  newState: string | undefined,
): Promise<boolean> {
  for (const trigger of rule.triggers) {
    if (trigger.platform !== 'zone') continue;
    if (trigger.entity_id && !matchEntity(trigger.entity_id, entityId)) continue;
    const zoneName = zoneShortName(trigger.zone);
    if (!zoneName) continue;
    const event = (trigger.event || trigger.event_type || 'enter').toLowerCase();
    const entered = event === 'enter' && newState === zoneName && oldState !== zoneName;
    const left = event === 'leave' && oldState === zoneName && newState !== zoneName;
    if (!entered && !left) continue;
    if (!(await deps.checkConditions(rule))) continue;
    return true;
  }
  return false;
}

/** 处理日历实体状态变化：匹配 calendar 触发器（start / end） */
export async function trackCalendarTrigger(
  deps: AutomationTriggerDeps,
  rule: AutomationRule,
  entityId: string,
  oldState: string | undefined,
  newState: string | undefined,
): Promise<boolean> {
  for (const trigger of rule.triggers) {
    if (trigger.platform !== 'calendar') continue;
    if (trigger.entity_id && !matchEntity(trigger.entity_id, entityId)) continue;
    const calEvent = (trigger.event || trigger.event_type || 'start').toLowerCase();
    const fired =
      (calEvent === 'start' && newState === 'on' && oldState !== 'on') ||
      (calEvent === 'end' && newState === 'off' && oldState === 'on');
    if (!fired) continue;
    if (!(await deps.checkConditions(rule))) continue;
    return true;
  }
  return false;
}

/** 扫描 for 持续计时队列：到期且条件仍满足时执行对应规则 */
export async function processForDurationPending(
  deps: AutomationTriggerDeps,
  forPending: Map<string, number>,
  rules: AutomationRule[],
  now: number,
  executeRule: (rule: AutomationRule, note?: string) => Promise<unknown>,
): Promise<void> {
  for (const [key, since] of forPending) {
    const firstColon = key.indexOf(':');
    const secondColon = firstColon >= 0 ? key.indexOf(':', firstColon + 1) : -1;
    if (firstColon < 0 || secondColon < 0) {
      forPending.delete(key);
      continue;
    }
    const ruleId = key.slice(0, firstColon);
    const ti = parseInt(key.slice(firstColon + 1, secondColon), 10);
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) {
      forPending.delete(key);
      continue;
    }
    const trigger = rule.triggers[ti];
    if (!trigger?.for) {
      forPending.delete(key);
      continue;
    }
    const parsed = parseForPendingKey(key, trigger.attribute);
    if (!parsed) {
      forPending.delete(key);
      continue;
    }
    const { entityId, attr } = parsed;
    if (now - since < trigger.for * 1000) continue;
    const current = attr
      ? deps.entityAttrOf?.(entityId, attr)
      : deps.entityStateOf(entityId);
    if (trigger.platform === 'numeric_state') {
      const val = parseFloat(current || '');
      if (Number.isNaN(val) || !numericStateInRange(val, trigger.above, trigger.below)) {
        forPending.delete(key);
        continue;
      }
    } else if (trigger.to && trigger.to !== 'any') {
      if (current !== trigger.to) {
        forPending.delete(key);
        continue;
      }
    } else {
      // 无 to：校验当前仍匹配边沿（仍有值，且未回到 from）
      if (current == null) {
        forPending.delete(key);
        continue;
      }
      if (trigger.from && current === trigger.from) {
        forPending.delete(key);
        continue;
      }
    }
    if (!(await deps.checkConditions(rule))) {
      forPending.delete(key);
      continue;
    }
    const accepted = await executeRule(rule, `${entityId} 持续 ${trigger.for}s`);
    if (accepted !== false) forPending.delete(key);
  }
}

/** 扫描时间（time / time_pattern / cron / template / sun）触发器，命中即执行规则 */
export async function scanTimeBasedTriggers(
  deps: AutomationTriggerDeps,
  ruleIndex: AutomationRuleIndex,
  timeStr: string,
  now: Date,
  windowMs: number,
  executeRule: (rule: AutomationRule, note?: string) => Promise<unknown>,
): Promise<void> {
  const firedRules = new Set<string>();
  const timeRules = ruleIndex.getTimeRulesAt(timeStr);
  for (const rule of timeRules) {
    if (firedRules.has(rule.id)) continue;
    for (const trigger of rule.triggers) {
      if (!['time', 'time_changed'].includes(trigger.platform)) continue;
      if (normalizeAutomationTimeStr(trigger.at || '') !== timeStr) continue;
      if (trigger.days?.length && !trigger.days.includes(zonedDateParts(now, deps.homeTimezone).weekday))
        continue;
      if (!(await deps.checkConditions(rule))) continue;
      firedRules.add(rule.id);
      void executeRule(rule, `时间 ${timeStr}`);
      break;
    }
  }

  // time_pattern / cron / template 周期触发：与 time 触发共用分钟级去重，
  // 由调用方通过 executeRule 包装（tryExecuteTimeTriggeredRule）保证不重复触发
  for (const rule of ruleIndex.getPatternRules()) {
    if (firedRules.has(rule.id)) continue;
    for (const trigger of rule.triggers) {
      if (trigger.platform === 'time_pattern') {
        if (!isTimePatternTriggerNow(trigger, now, deps.homeTimezone)) continue;
        if (trigger.days?.length && !trigger.days.includes(zonedDateParts(now, deps.homeTimezone).weekday))
          continue;
      } else if (trigger.platform === 'cron') {
        if (!trigger.cron || !matchCronExpression(trigger.cron, now, deps.homeTimezone)) continue;
      } else if (trigger.platform === 'template') {
        if (!trigger.value_template) continue;
        if (!deps.resolveTemplate) continue;
        if (!(await deps.resolveTemplate(trigger.value_template))) continue;
      } else {
        continue;
      }
      if (!(await deps.checkConditions(rule))) continue;
      firedRules.add(rule.id);
      void executeRule(rule);
      break;
    }
  }

  for (const rule of ruleIndex.getSunRules()) {
    if (firedRules.has(rule.id)) continue;
    for (const trigger of rule.triggers) {
      if (trigger.platform !== 'sun' || !deps.isSunTriggerNow(trigger, windowMs)) continue;
      if (!(await deps.checkConditions(rule))) continue;
      firedRules.add(rule.id);
      void executeRule(rule);
      break;
    }
  }
}

// ── automation-engine-run.helper (trigger/action deps) ──
/** 由运行期 runtime 装配触发器判定依赖（状态、属性、时区、日出日落） */
export function createAutomationTriggerDeps(
  runtime: Pick<
    AutomationEngineRunRuntime,
    'entityStateOf' | 'weatherLat' | 'weatherLon' | 'homeTimezone'
  > & {
    entityAttrOf?: (entityId: string, attr: string) => string | undefined;
  },
  checkConditions: (rule: AutomationRule) => Promise<boolean>,
): AutomationTriggerDeps {
  return {
    entityStateOf: runtime.entityStateOf,
    entityAttrOf: runtime.entityAttrOf,
    checkConditions,
    homeTimezone: runtime.homeTimezone,
    isSunTriggerNow: (trigger, windowMs) =>
      isSunTriggerNow(
        trigger,
        windowMs,
        runtime.weatherLat,
        runtime.weatherLon,
        runtime.homeTimezone,
      ),
  };
}

/** 由运行期 runtime 装配动作执行依赖（含 wait_for_trigger、场景、脚本、变量等） */
export function createAutomationActionDeps(
  runtime: AutomationEngineRunRuntime,
  triggerDeps: AutomationTriggerDeps,
  checkConditionList: AutomationActionDeps['checkConditionList'],
): AutomationActionDeps {
  const triggerAutomation = runtime.triggerAutomation;
  return {
    logger: {
      error: (msg) => runtime.logger.error(msg),
      debug: (msg) => runtime.logger.debug(msg),
      warn: (msg) => runtime.logger.warn(msg),
    },
    haConnector: {
      callService: (domain, service, entityId, data, requestId) =>
        runtime.haConnector.callService(domain, service, entityId, data, false, requestId),
    },
    sceneService: { execute: (id) => runtime.sceneService.execute(id) },
    scriptService: { execute: (id) => runtime.scriptService.execute(id) },
    triggerAutomation: triggerAutomation ? (id) => triggerAutomation(id) : undefined,
    eventEmitter: { emit: (event, data) => runtime.eventEmitter.emit(event, data) },
    checkConditionList,
    resolveTemplate: (tpl, ctx) => resolveAutomationTemplateWithRuntime(tpl, ctx, runtime),
    waitForTriggers: (triggers, timeoutSec, trace) => {
      const buffer: Array<{ type: string; data: Record<string, unknown> }> = [];
      const handlers: Array<{ type: string; fn: (...args: unknown[]) => void }> = [];
      return waitForTriggers(
        {
          entityStateOf: triggerDeps.entityStateOf,
          entityAttrOf: triggerDeps.entityAttrOf,
          beginEventCapture: (eventTypes) => {
            for (const type of eventTypes) {
              const fn = (...args: unknown[]) => {
                const raw = args[0];
                const data =
                  raw && typeof raw === 'object'
                    ? (raw as Record<string, unknown>)
                    : { value: raw };
                buffer.push({ type, data });
              };
              runtime.eventEmitter.on(type, fn);
              handlers.push({ type, fn });
            }
            return () => {
              for (const h of handlers) {
                runtime.eventEmitter.off(h.type, h.fn);
              }
            };
          },
          consumeEvent: (eventType) => {
            const idx = buffer.findIndex((e) => e.type === eventType);
            if (idx < 0) return null;
            const [hit] = buffer.splice(idx, 1);
            return hit?.data ?? null;
          },
        },
        triggers,
        timeoutSec,
        trace,
      );
    },
    variableService: runtime.variableService,
    entityStateOf: runtime.entityStateOf,
    getEntityAttr: (id, attr) => runtime.stateStore.getById(id)?.attributes?.[attr],
    retryDefaults: runtime.retryDefaults,
    waitTemplateTimeoutSec: runtime.waitTemplateTimeoutSec,
    maxDelaySeconds: runtime.maxDelaySeconds,
    maxRepeatIterations: runtime.maxRepeatIterations,
  };
}
