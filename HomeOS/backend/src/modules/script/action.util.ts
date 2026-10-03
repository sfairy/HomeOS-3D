/**
 * 脚本模块 - 动作解析工具
 *
 * 职责：解析 Home Assistant 脚本中的 service 动作，提取 domain / service / entityId / data。
 * HA 脚本的 sequence 中每个 action 可能是 call_service 或 delay，
 * 本文件仅处理 call_service 类型的动作解析。
 */
import { parseHaDuration } from '@homeos/shared';

/**
 * 脚本动作输入（HA 脚本 sequence 中的一项）。
 * 支持多种字段命名（entity_id / target.entity_id / data / service_data），
 * 以兼容不同版本的 HA 脚本格式。
 */
export interface ScriptActionInput {
  service?: string;
  /** HA 新写法，等价于 service */
  action?: string;
  entity_id?: string;
  target?: { entity_id?: string };
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
  /** 秒数 / HA "HH:MM:SS" / { hours, minutes, seconds } */
  delay?: unknown;
  /** HA / HomeOS 事件动作 */
  event?: string;
  event_data?: Record<string, unknown>;
  /** HA stop 动作（值为消息字符串或空） */
  stop?: string | null;
  error?: boolean;
  /** HA scene 快捷写法 */
  scene?: string | number;
  /** choose / if 流控 */
  choose?: unknown;
  default?: unknown;
  if?: unknown;
  then?: unknown;
  else?: unknown;
  condition?: unknown;
  sequence?: unknown;
  /** 流控：repeat / parallel / variables / wait_* */
  repeat?: unknown;
  parallel?: unknown;
  variables?: unknown;
  wait_template?: unknown;
  wait_for_trigger?: unknown;
  timeout?: unknown;
  continue_on_timeout?: unknown;
  [key: string]: unknown;
}


/**
 * 判断脚本动作是否为延迟动作。
 * 兼容 HA YAML：number / "HH:MM:SS" / { hours, minutes, seconds }。
 */
function isScriptDelayAction(action: ScriptActionInput): boolean {
  return parseHaDuration(action.delay) != null;
}


/**
 * 判断是否为可通过本地 EventBus 派发的事件动作。
 * 用于 notify_homeos / home_mode / debug / homeos.scene|script.execute 等。
 */
function isScriptEventAction(action: ScriptActionInput): boolean {
  return typeof action.event === 'string' && action.event.trim().length > 0;
}

/** HA stop：中止后续 sequence（'stop' in action） */
function isScriptStopAction(action: ScriptActionInput): boolean {
  return Object.prototype.hasOwnProperty.call(action, 'stop');
}

function everyLocalExecutable(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.every((x) => isScriptLocalExecutableAction(x as ScriptActionInput));
}

/**
 * 本地脚本执行是否支持该动作。
 * 已支持：delay / call_service / event / stop / choose / if / sequence / condition /
 * repeat / parallel / variables / wait_template / wait_for_trigger。
 * 仍需 runOnHa：device 等。
 */
export function isScriptLocalExecutableAction(action: ScriptActionInput): boolean {
  if (isScriptDelayAction(action)) return true;
  if (isScriptStopAction(action)) return true;
  if (action.service || action.action) return true;
  if (isScriptEventAction(action)) return true;
  if (action.scene != null && action.scene !== '') return true;

  // 条件步骤（choose 旁路 / sequence 内）
  if (action.condition != null) return true;

  // 运行时 variables 块（无嵌套 sequence）
  if (action.variables != null && typeof action.variables === 'object') return true;

  // wait_template / wait_for_trigger（叶子动作）
  if (action.wait_template != null) return true;
  if (action.wait_for_trigger != null) return true;

  if (action.choose != null) {
    const branches = Array.isArray(action.choose) ? action.choose : [action.choose];
    for (const b of branches) {
      if (!b || typeof b !== 'object') return false;
      const seq =
        (b as { sequence?: unknown; actions?: unknown }).sequence ??
        (b as { actions?: unknown }).actions ??
        [];
      if (!everyLocalExecutable(seq)) return false;
    }
    const def = action.default;
    if (def != null) {
      const arr = Array.isArray(def) ? def : [def];
      if (!everyLocalExecutable(arr)) return false;
    }
    return true;
  }

  // HA if/then/else（规范化后等同 choose）
  if (action.if != null) {
    if (action.then != null && !everyLocalExecutable(Array.isArray(action.then) ? action.then : [action.then])) {
      return false;
    }
    if (action.else != null && !everyLocalExecutable(Array.isArray(action.else) ? action.else : [action.else])) {
      return false;
    }
    return true;
  }

  if (action.repeat != null && typeof action.repeat === 'object') {
    const r = action.repeat as { sequence?: unknown; actions?: unknown };
    const seq = r.sequence ?? r.actions ?? [];
    return everyLocalExecutable(seq);
  }

  if (action.parallel != null) {
    return everyLocalExecutable(action.parallel);
  }

  if (Array.isArray(action.sequence)) {
    return everyLocalExecutable(action.sequence);
  }

  return false;
}

/** 从 event_data / data 提取事件载荷（兼容 HA 与 HomeOS YAML） */
export function extractScriptEventPayload(action: ScriptActionInput): Record<string, unknown> {
  const raw = action.event_data ?? action.data;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/**
 * 从脚本执行事件载荷提取 variables（去掉 id 类键；支持嵌套 variables）。
 */
export function extractScriptExecuteVariables(
  data: Record<string, unknown>,
  omitKeys: string[] = [],
): Record<string, unknown> | undefined {
  const omit = new Set(omitKeys);
  const nested = data.variables;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
      if (omit.has(k)) continue;
      out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (omit.has(k) || k === 'variables') continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}