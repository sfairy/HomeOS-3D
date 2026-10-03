/**
 * 自动化条件判定内部实现。
 *
 * 所属模块：backend/modules/automation
 * 职责：评估 ParsedCondition（state / numeric_state / time / sun / template /
 *  and / or / not / homeos_variable 等），判断当前是否满足执行条件。
 *  另含日出日落窗口、本地时区时间窗口、模板表达式求值与变量比较等工具函数。
 * 关键依赖：AutomationConditionDeps（实体状态 / 属性 / 时间 / 模板 / 变量）。
 */
import type { AutomationEngineRunRuntime } from './engine-execute.internals';
import { parseTimeToMs } from '../../common/utils/time-parse.util';
import { compareNumeric } from '../../common/utils/evaluate-condition.util';
import type { AutomationRule, ParsedCondition } from './yaml-parse.util';
import {
  dateFromZonedHourFraction,
  normalizeAutomationTimeStr,
  zonedDateParts,
} from '@homeos/shared';

export { normalizeAutomationTimeStr };

// ── automation-engine-condition.util ──
/**
 * AutomationConditionDeps：业务接口定义。
 * - 表示：modules/automation/engine-conditions.internals.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface AutomationConditionDeps {
  entityIdsOf: (ref?: string | string[]) => string[];
  entityStateOf: (entityId: string) => string | undefined;
  /** 实体 last_changed 时间戳（ms），用于 state for 条件 */
  entityLastChangedMs?: (entityId: string) => number | undefined;
  /** 实体 last_updated 时间戳（ms），用于 attribute for（属性变更不 bump last_changed） */
  entityLastUpdatedMs?: (entityId: string) => number | undefined;
  /** 读取实体属性（属性级 state 条件） */
  getEntityAttr?: (entityId: string, attr: string) => unknown;
  /** weather 条件：列出全部 weather.* 实体（entity_id 缺省时自动匹配） */
  listWeatherEntityIds?: () => string[];
  checkSunCondition: (cond: ParsedCondition) => boolean;
  checkTimeCondition: (cond: ParsedCondition) => boolean;
  resolveTemplate: (tpl: string) => Promise<boolean>;
  /** 持久变量取值 */
  getVariableValue?: (
    key: string,
    scope?: 'global' | 'rule',
    ruleId?: string | null,
  ) => Promise<string | number | null>;
  warn: (msg: string) => void;
}

/** for 持续时长：attribute 条件优先 last_updated */
function conditionForSatisfied(
  cond: ParsedCondition,
  entityId: string,
  deps: AutomationConditionDeps,
): boolean {
  if (!cond.for || cond.for <= 0) return true;
  const ms = cond.attribute
    ? (deps.entityLastUpdatedMs?.(entityId) ?? deps.entityLastChangedMs?.(entityId))
    : deps.entityLastChangedMs?.(entityId);
  if (ms == null) return false;
  return Date.now() - ms >= cond.for * 1000;
}

/** 依次判定全部条件：任一不满足即返回 false（空条件列表视为满足） */
export async function checkAutomationConditionList(
  conditions: ParsedCondition[],
  deps: AutomationConditionDeps,
  currentRuleId?: string,
): Promise<boolean> {
  if (!conditions.length) return true;
  for (const c of conditions) {
    if (!(await checkAutomationSingleCondition(c, deps, currentRuleId))) return false;
  }
  return true;
}

/** 按条件类型分派判定单个条件（state / zone / numeric_state / and / or / not / 模板等） */
export async function checkAutomationSingleCondition(
  cond: ParsedCondition,
  deps: AutomationConditionDeps,
  currentRuleId?: string,
): Promise<boolean> {
  switch (cond.condition) {
    case 'state': {
      const ids = deps.entityIdsOf(cond.entity_id);
      if (!ids.length) return false;
      for (const id of ids) {
        const currentState =
          cond.attribute && deps.getEntityAttr
            ? String(deps.getEntityAttr(id, cond.attribute) ?? '')
            : deps.entityStateOf(id);
        if (cond.state && currentState !== cond.state) return false;
        if (!conditionForSatisfied(cond, id, deps)) return false;
      }
      return true;
    }
    case 'zone': {
      // zone 条件：所有目标实体当前状态须等于 zone 名（enter）或不等于 zone 名（leave）
      const ids = deps.entityIdsOf(cond.entity_id);
      if (!ids.length) return false;
      const zoneName = cond.zone
        ? cond.zone.startsWith('zone.')
          ? cond.zone.slice(5)
          : cond.zone
        : '';
      if (!zoneName) {
        deps.warn('zone 条件缺少 zone 目标');
        return false;
      }
      const event = (cond.event || 'enter').toLowerCase();
      for (const id of ids) {
        const st = deps.entityStateOf(id);
        if (st === undefined) return false;
        if (event === 'leave') {
          if (st === zoneName) return false;
        } else if (st !== zoneName) {
          return false;
        }
      }
      return true;
    }
    case 'trigger': {
      // trigger 条件：引用的实体状态须与目标 state 一致（HA trigger 条件简化版）
      const ids = deps.entityIdsOf(cond.entity_id);
      if (!ids.length) return false;
      for (const id of ids) {
        const currentState =
          cond.attribute && deps.getEntityAttr
            ? String(deps.getEntityAttr(id, cond.attribute) ?? '')
            : deps.entityStateOf(id);
        if (cond.state && currentState !== cond.state) return false;
      }
      return true;
    }
    case 'homeos_variable': {
      if (!deps.getVariableValue) {
        deps.warn('homeos_variable 条件缺少变量服务，视为不满足');
        return false;
      }
      const key = String(cond.key || '');
      if (!key) return false;
      const scope = cond.scope === 'rule' ? 'rule' : 'global';
      const ruleId =
        scope === 'rule' ? String(cond.rule_id || currentRuleId || '') : '';
      const raw = await deps.getVariableValue(key, scope, ruleId);
      const op = cond.operator || '==';
      const expect = cond.value ?? cond.state ?? '';
      if (op === '!=' || op === '<>') {
        if (raw == null) return String(expect) !== '' && expect !== '0';
        return String(raw) !== String(expect);
      }
      if (op === '>' || op === '>=' || op === '<' || op === '<=') {
        const lhs = raw == null || raw === '' ? 0 : Number(raw);
        const rhs = Number(expect);
        if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false;
        return compareNumeric(lhs, op, rhs);
      }
      if (raw == null) return String(expect) === '' || expect === '0';
      return String(raw) === String(expect);
    }
    case 'not': {
      if (!cond.conditions) return true;
      for (const sub of cond.conditions) {
        if (await checkAutomationSingleCondition(sub, deps, currentRuleId)) return false;
      }
      return true;
    }
    case 'and': {
      for (const sub of cond.conditions || []) {
        if (!(await checkAutomationSingleCondition(sub, deps, currentRuleId))) return false;
      }
      return true;
    }
    case 'or': {
      for (const sub of cond.conditions || []) {
        if (await checkAutomationSingleCondition(sub, deps, currentRuleId)) return true;
      }
      return false;
    }
    case 'numeric_state': {
      const ids = deps.entityIdsOf(cond.entity_id);
      if (!ids.length) return false;
      for (const id of ids) {
        const raw =
          cond.attribute && deps.getEntityAttr
            ? String(deps.getEntityAttr(id, cond.attribute) ?? '')
            : deps.entityStateOf(id);
        if (raw == null || raw === '' || raw === 'unavailable' || raw === 'unknown') return false;
        const val = parseFloat(raw);
        if (!Number.isFinite(val)) return false;
        if (cond.above != null && cond.above !== '' && val <= parseFloat(cond.above)) return false;
        if (cond.below != null && cond.below !== '' && val >= parseFloat(cond.below)) return false;
        if (!conditionForSatisfied(cond, id, deps)) return false;
      }
      return true;
    }
    case 'sun':
      return deps.checkSunCondition(cond);
    case 'time':
      return deps.checkTimeCondition(cond);
    case 'weather':
      return checkAutomationWeatherCondition(cond, deps);
    case 'template':
      return cond.value_template ? await deps.resolveTemplate(cond.value_template) : true;
    default:
      deps.warn(`未知自动化条件类型 "${String(cond.condition)}"，视为不满足`);
      return false;
  }
}

/**
 * weather 条件：按 weather 实体 state（或 attribute 数值）匹配。
 *  - entity_id 缺省时自动取全部 weather.* 实体
 *  - attribute 指定时按 above/below/state 数值比较（如 temperature > 30）
 *  - 支持 for 持续时长
 */
function checkAutomationWeatherCondition(
  cond: ParsedCondition,
  deps: AutomationConditionDeps,
): boolean {
  let ids = deps.entityIdsOf(cond.entity_id);
  if (!ids.length && deps.listWeatherEntityIds) {
    ids = deps.listWeatherEntityIds();
  }
  if (!ids.length) {
    deps.warn('weather 条件未找到 weather 实体');
    return false;
  }
  for (const id of ids) {
    if (cond.attribute && deps.getEntityAttr) {
      const raw = String(deps.getEntityAttr(id, cond.attribute) ?? '');
      if (raw === '' || raw === 'unknown' || raw === 'unavailable') return false;
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) return false;
      if (cond.above != null && cond.above !== '' && val <= parseFloat(cond.above)) return false;
      if (cond.below != null && cond.below !== '' && val >= parseFloat(cond.below)) return false;
      if (cond.state && String(val) !== cond.state) return false;
    } else {
      const currentState = deps.entityStateOf(id);
      if (currentState === undefined) return false;
      if (cond.state && currentState !== cond.state) return false;
    }
    if (!conditionForSatisfied(cond, id, deps)) return false;
  }
  return true;
}

/** 判断实体引用 pattern 是否命中 entityId：支持精确匹配与 * 前缀通配（无 pattern 视为命中） */
export function matchAutomationEntity(
  pattern: string | string[] | undefined,
  entityId: string,
): boolean {
  if (!pattern) return true;
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  for (const p of patterns) {
    if (typeof p !== 'string') continue;
    if (p === entityId) return true;
    if (p.endsWith('*') && entityId.startsWith(p.replace(/\*+$/, ''))) return true;
  }
  return false;
}

/** 将 string / string[] 实体引用规范化为字符串数组（空引用返回空数组） */
export function automationEntityIdsOf(ref?: string | string[]): string[] {
  if (!ref) return [];
  return Array.isArray(ref) ? ref.filter((id) => typeof id === 'string') : [ref];
}

/** 按家庭时区判断当前时刻是否满足 after/before 时间窗口（支持跨午夜与星期过滤） */
export function checkAutomationTimeCondition(
  cond: ParsedCondition,
  timeZone?: string,
): boolean {
  const now = new Date();
  const parts = zonedDateParts(now, timeZone);
  // 星期过滤（HA `weekday`）：0=周日 … 6=周六，按家庭时区
  if (cond.days && cond.days.length > 0 && !cond.days.includes(parts.weekday)) {
    return false;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmmss = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  const after = cond.after ? normalizeAutomationTimeStr(cond.after) : '';
  const before = cond.before ? normalizeAutomationTimeStr(cond.before) : '';
  if (after && before && after > before) {
    // 跨午夜窗口：after..24:00 或 00:00..before
    return hhmmss >= after || hhmmss <= before;
  }
  if (after && hhmmss < after) return false;
  if (before && hhmmss > before) return false;
  return true;
}

/** 判断当前时刻是否处于日出/日落条件窗口（支持 after/before 与秒级偏移） */
export function checkAutomationSunCondition(
  cond: ParsedCondition,
  lat: number,
  lon: number,
  timeZone?: string,
): boolean {
  const { sunrise, sunset } = getSunTimes(new Date(), lat, lon, timeZone);
  const now = Date.now();
  const after = cond.after?.toLowerCase();
  const before = cond.before?.toLowerCase();
  const afterOff = (cond.after_offset || 0) * 1000;
  const beforeOff = (cond.before_offset || 0) * 1000;
  if (after === 'sunrise' && now < sunrise.getTime() + afterOff) return false;
  if (after === 'sunset' && now < sunset.getTime() + afterOff) return false;
  if (before === 'sunrise' && now >= sunrise.getTime() + beforeOff) return false;
  if (before === 'sunset' && now >= sunset.getTime() + beforeOff) return false;
  return true;
}

function applyAutomationTemplateContext(tpl: string, ctx: Record<string, unknown>): string {
  let out = tpl;
  for (const [key, val] of Object.entries(ctx)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(val ?? ''));
  }
  return out;
}

// ── automation-engine-template.util ──
interface AutomationTemplateState {
  getState: (entityId: string) => string | undefined;
  getAttr: (entityId: string, attr: string) => unknown;
}

/**
 * 本地模板求值；识别常见 Jinja 表达式。
 * @returns true/false，或 null 表示无法本地识别（需 HA render_template 兜底）
 */
function evalAutomationTemplateLocal(
  tpl: string,
  state: AutomationTemplateState,
): boolean | null {
  const expr = tpl.replace(/\{\{\s*|\s*\}\}/g, '').trim();

  const isState = expr.match(/is_state\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
  if (isState) return state.getState(isState[1]) === isState[2];

  const isStateAttr = expr.match(
    /is_state_attr\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/i,
  );
  if (isStateAttr) {
    const expected = isStateAttr[3].trim().replace(/^['"]|['"]$/g, '');
    return String(state.getAttr(isStateAttr[1], isStateAttr[2]) ?? '') === expected;
  }

  const stateAttrEq = expr.match(
    /state_attr\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*==\s*['"]([^'"]+)['"]/i,
  );
  if (stateAttrEq) {
    return String(state.getAttr(stateAttrEq[1], stateAttrEq[2]) ?? '') === stateAttrEq[3];
  }

  const stateAttrCmp = expr.match(
    /state_attr\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\|\s*(?:float|int)\s*([><=!]+)\s*([-\d.]+)/i,
  );
  if (stateAttrCmp) {
    const val = parseFloat(String(state.getAttr(stateAttrCmp[1], stateAttrCmp[2]) ?? '') || '0');
    return compareNumeric(val, stateAttrCmp[3], parseFloat(stateAttrCmp[4]));
  }

  const statesEq = expr.match(/states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*==\s*['"]([^'"]+)['"]/i);
  if (statesEq) return state.getState(statesEq[1]) === statesEq[2];

  const statesNotEq = expr.match(/states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*!=\s*['"]([^'"]+)['"]/i);
  if (statesNotEq) return state.getState(statesNotEq[1]) !== statesNotEq[2];

  const floatCmp = expr.match(
    /states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\|\s*float\s*([><=!]+)\s*([\d.]+)/i,
  );
  if (floatCmp) {
    const val = parseFloat(state.getState(floatCmp[1]) || '0');
    return compareNumeric(val, floatCmp[2], parseFloat(floatCmp[3]));
  }

  const intCmp = expr.match(/states\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\|\s*int\s*([><=!]+)\s*(\d+)/i);
  if (intCmp) {
    const val = parseInt(state.getState(intCmp[1]) || '0', 10);
    return compareNumeric(val, intCmp[2], parseInt(intCmp[3], 10));
  }

  const nowHour = expr.match(/now\(\)\.hour\s*([><=!]+)\s*(\d+)/i);
  if (nowHour)
    return compareNumeric(new Date().getHours(), nowHour[1], parseInt(nowHour[2], 10));

  const nowMinute = expr.match(/now\(\)\.minute\s*([><=!]+)\s*(\d+)/i);
  if (nowMinute)
    return compareNumeric(new Date().getMinutes(), nowMinute[1], parseInt(nowMinute[2], 10));

  const isSun = expr.match(/is_state\s*\(\s*['"]sun\.sun['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
  if (isSun) return state.getState('sun.sun') === isSun[1];

  // 纯数值比较：`[[states('sensor.x') | float > 20]]` 之外的裸数字表达式
  const boolStr = expr.match(/^(true|false)$/i);
  if (boolStr) return boolStr[1].toLowerCase() === 'true';

  return null;
}

// ── automation-engine-time.util ──
function getSunTimes(
  date: Date,
  lat: number,
  lon: number,
  timeZone?: string,
): { sunrise: Date; sunset: Date } {
  const parts = zonedDateParts(date, timeZone);
  const utcNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const utcJan1 = Date.UTC(parts.year, 0, 1, 12, 0, 0);
  const dayOfYear = Math.floor((utcNoon - utcJan1) / 86400000) + 1;
  const latRad = (lat * Math.PI) / 180;
  const decl = (23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180) * Math.PI) / 180;
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(decl))));
  const solarNoon = 12 - lon / 15;
  const sunriseHour = solarNoon - (hourAngle * 12) / Math.PI;
  const sunsetHour = solarNoon + (hourAngle * 12) / Math.PI;
  const sunrise = dateFromZonedHourFraction(
    timeZone,
    parts.year,
    parts.month,
    parts.day,
    sunriseHour,
  );
  const sunset = dateFromZonedHourFraction(
    timeZone,
    parts.year,
    parts.month,
    parts.day,
    sunsetHour,
  );
  return { sunrise, sunset };
}

/** 判断当前时刻是否落在日出/日落触发器的触发窗口（±windowMs）内 */
export function isSunTriggerNow(
  trigger: { event?: string; event_type?: string; offset?: number },
  windowMs: number,
  lat: number,
  lon: number,
  timeZone?: string,
): boolean {
  const event = (trigger.event || trigger.event_type || '').toLowerCase();
  if (event !== 'sunrise' && event !== 'sunset') return false;
  const { sunrise, sunset } = getSunTimes(new Date(), lat, lon, timeZone);
  const target = event === 'sunset' ? sunset : sunrise;
  const offsetMs = (trigger.offset || 0) * 1000;
  return Math.abs(Date.now() - (target.getTime() + offsetMs)) < windowMs;
}

// ── automation-engine-template-eval.helper ──
interface AutomationTemplateEvalDeps {
  entityStateOf: (entityId: string) => string | undefined;
  getEntityAttr: (entityId: string, attr: string) => unknown;
  haConnected: () => boolean;
  renderTemplateViaHa: (tpl: string) => Promise<string | null>;
}

/** 本地模板解析；无法识别时 fallback HA render_template */
async function resolveAutomationTemplate(
  tpl: string,
  ctx: Record<string, unknown>,
  deps: AutomationTemplateEvalDeps,
): Promise<boolean> {
  const substituted = applyAutomationTemplateContext(tpl, ctx);
  const local = evalAutomationTemplateLocal(substituted, {
    getState: (id) => deps.entityStateOf(id),
    getAttr: (id, attr) => deps.getEntityAttr(id, attr),
  });
  if (local !== null) return local;
  if (!deps.haConnected()) return false;
  try {
    const rendered = await deps.renderTemplateViaHa(substituted);
    if (rendered === null) return false;
    const v = String(rendered).trim().toLowerCase();
    return v === 'true' || v === 'on' || v === '1' || v === 'yes';
  } catch {
    return false;
  }
}

// ── automation-engine-run.helper (condition deps) ──
/** 由 AutomationEngineRunRuntime 装配条件判定依赖（实体状态、时间、模板、变量） */
export function createAutomationConditionDeps(
  runtime: AutomationEngineRunRuntime,
): AutomationConditionDeps {
  return {
    entityIdsOf: (ref) => automationEntityIdsOf(ref),
    entityStateOf: runtime.entityStateOf,
    entityLastChangedMs: (id) => {
      const ent = runtime.stateStore.getById(id) as
        | { last_changed?: string; lastChanged?: string }
        | undefined;
      const raw = ent?.last_changed || ent?.lastChanged;
      return parseTimeToMs(raw);
    },
    entityLastUpdatedMs: (id) => {
      const ent = runtime.stateStore.getById(id) as
        | {
            last_updated?: string;
            lastUpdated?: string;
            last_changed?: string;
            lastChanged?: string;
          }
        | undefined;
      const raw =
        ent?.last_updated || ent?.lastUpdated || ent?.last_changed || ent?.lastChanged;
      return parseTimeToMs(raw);
    },
    getEntityAttr: (id, attr) => runtime.stateStore.getById(id)?.attributes?.[attr],
    listWeatherEntityIds: () => runtime.stateStore.getAll('weather').map((e) => e.entity_id),
    checkSunCondition: (cond) =>
      checkAutomationSunCondition(
        cond,
        runtime.weatherLat,
        runtime.weatherLon,
        runtime.homeTimezone,
      ),
    checkTimeCondition: (cond) => checkAutomationTimeCondition(cond, runtime.homeTimezone),
    resolveTemplate: (tpl) => resolveAutomationTemplateWithRuntime(tpl, {}, runtime),
    getVariableValue: (() => {
      const variableService = runtime.variableService;
      return variableService
        ? (key, scope, ruleId) => variableService.getValue(key, scope, ruleId)
        : undefined;
    })(),
    warn: (msg) => runtime.logger.warn(msg),
  };
}

/** 求值模板条件：优先本地解析常见 Jinja 表达式，无法识别时回退 HA render_template */
export async function resolveAutomationTemplateWithRuntime(
  tpl: string,
  ctx: Record<string, unknown>,
  runtime: Pick<AutomationEngineRunRuntime, 'entityStateOf' | 'stateStore' | 'haConnector'>,
): Promise<boolean> {
  return resolveAutomationTemplate(tpl, ctx, {
    entityStateOf: (id) => runtime.entityStateOf(id),
    getEntityAttr: (id, attr) => runtime.stateStore.getById(id)?.attributes?.[attr],
    haConnected: () => runtime.haConnector.isConnected(),
    renderTemplateViaHa: async (template) => {
      try {
        return await runtime.haConnector.sendRequest<string>('render_template', { template }, 8000);
      } catch {
        return null;
      }
    },
  });
}

/** 判定规则全部条件是否满足（空条件列表视为满足） */
export async function checkAutomationConditions(
  rule: AutomationRule,
  conditionDeps: AutomationConditionDeps,
  currentRuleId?: string,
): Promise<boolean> {
  return checkAutomationConditionList(rule.conditions, conditionDeps, currentRuleId);
}
