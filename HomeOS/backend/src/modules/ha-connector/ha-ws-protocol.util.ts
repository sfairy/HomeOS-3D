/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - WS 协议归一化编解码；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { HA_WS_RECONNECT_INITIAL_MS, HA_WS_RECONNECT_MAX_MS } from './types';
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * WS 重连指数退避（毫秒），上限 maxMs，带 ±25% jitter 避免多实例同步重连。
 * @param attempt 重连次数（从 0 开始）。
 * @param baseMs 初始退避毫秒，默认 1s。
 * @param maxMs 最大退避毫秒，默认 30s。
 * @returns 计算后的退避延迟（含 jitter）。
 */
export function computeReconnectDelayMs(
  attempt: number,
  baseMs = HA_WS_RECONNECT_INITIAL_MS,
  maxMs = HA_WS_RECONNECT_MAX_MS,
): number {
  const safeAttempt = Math.max(0, attempt);
  const base = Math.min(maxMs, baseMs * 2 ** safeAttempt);
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(base * jitter);
}

/** HA state_changed 事件解析后的标准化载荷 */
interface HaStateChangedPayload {
  entity_id: string;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  changed_at: string;
}

/** HA automation.triggered 事件解析后的标准化载荷 */
interface HaAutomationTriggeredPayload {
  name?: string;
  entity_id?: string;
  source?: string;
  trigger?: unknown;
  time_fired: string;
}

/**
 * 解析 HA WebSocket state_changed 事件为标准化载荷。
 * @param msg HA WebSocket 入站消息。
 * @returns 解析后的载荷，非 state_changed 事件或缺少 entity_id 时返回 null。
 */
export function parseHaStateChangedEvent(msg: {
  event?: {
    event_type?: string;
    time_fired?: string;
    data?: {
      entity_id?: string;
      old_state?: Record<string, unknown> | null;
      new_state?: Record<string, unknown> | null;
    };
  };
}): HaStateChangedPayload | null {
  const event = msg.event;
  if (!event || event.event_type !== 'state_changed') return null;
  const data = event.data;
  if (!data?.entity_id) return null;
  return {
    entity_id: data.entity_id,
    old_state: data.old_state ?? null,
    new_state: data.new_state ?? null,
    changed_at: event.time_fired || new Date().toISOString(),
  };
}

/**
 * 解析 HA WebSocket automation.triggered 事件为标准化载荷。
 * 用于回读 runOnHa 自动化的执行结果（HA 每次触发都会广播该事件）。
 * @param msg HA WebSocket 入站消息。
 * @returns 解析后的载荷，非 automation.triggered 事件时返回 null。
 */
export function parseHaAutomationTriggeredEvent(msg: {
  event?: {
    event_type?: string;
    time_fired?: string;
    data?: Record<string, unknown>;
  };
}): HaAutomationTriggeredPayload | null {
  const event = msg.event;
  if (!event || event.event_type !== 'automation.triggered') return null;
  const data = event.data || {};
  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    entity_id: typeof data.entity_id === 'string' ? data.entity_id : undefined,
    source: typeof data.source === 'string' ? data.source : undefined,
    trigger: data.trigger,
    time_fired: event.time_fired || new Date().toISOString(),
  };
}

interface HaWsPendingResult {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

interface HaWsResultMessage {
  id?: number;
  success?: boolean;
  error?: { code: string; message: string };
  result?: unknown;
}

/**
 * 解析 WebSocket result 响应，匹配 pending result 并 resolve/reject。
 * @param msg HA WebSocket result 消息。
 * @param pendingResults 待处理请求 Map（id → pending）。
 * @param fallbackErrorMessage 错误消息回退函数。
 * @returns 是否成功匹配并处理了 pending result。
 */
export function resolveHaWsPendingResult(
  msg: HaWsResultMessage,
  pendingResults: Map<number, HaWsPendingResult>,
  fallbackErrorMessage: (err: unknown) => string,
): boolean {
  const id = msg.id;
  if (id === undefined) return false;
  const pending = pendingResults.get(id);
  if (!pending) return false;
  clearTimeout(pending.timeout);
  pendingResults.delete(id);
  if (msg.success) {
    pending.resolve(msg.result);
  } else {
    const err = msg.error;
    const errMsg =
      err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : fallbackErrorMessage(err) || API_ERROR.HA_WS_REQUEST_FAILED;
    pending.reject(new BusinessException(ErrorCode.EXTERNAL_ERROR, errMsg));
  }
  return true;
}
