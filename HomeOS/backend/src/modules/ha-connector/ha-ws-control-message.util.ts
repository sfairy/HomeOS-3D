/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - WS 控制消息编解码（pong/auth/subscription）；
 * 关键依赖：
 *  - ha-ws-protocol.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { WS_PUSH_CRITICAL_DOMAINS, getEntityDomain } from '@homeos/shared';

type HaWsIngressClass = 'control-sync' | 'result-defer' | 'defer';

const HEAD_TYPE_RE = /"type"\s*:\s*"([^"]+)"/;
const EVENT_TYPE_RE = /"event_type"\s*:\s*"([^"]+)"/;
const ENTITY_ID_RE = /"entity_id"\s*:\s*"([^"]+)"/;

/** 小体积 result（订阅 ack 等）同步；超过此字节走优先延期 */
const SYNC_RESULT_MAX_BYTES = 8_192;

const CRITICAL_DOMAIN_SET = new Set<string>(WS_PUSH_CRITICAL_DOMAINS);

/**
 * 分类入站帧。
 */
export function classifyHaWsIngressText(text: string): HaWsIngressClass {
  if (!text) return 'defer';
  const head = text.length > 240 ? text.slice(0, 240) : text;
  const m = HEAD_TYPE_RE.exec(head);
  if (!m) return 'defer';
  const type = m[1];
  if (
    type === 'pong' ||
    type === 'auth_required' ||
    type === 'auth_ok' ||
    type === 'auth_invalid'
  ) {
    return 'control-sync';
  }
  if (type === 'result') {
    return text.length <= SYNC_RESULT_MAX_BYTES ? 'control-sync' : 'result-defer';
  }
  if (type === 'event' && isCriticalStateChangedText(text)) {
    return 'control-sync';
  }
  return 'defer';
}

/** 廉价判断：state_changed 且 entity 为关键控制域 */
function isCriticalStateChangedText(text: string): boolean {
  const probe = text.length > 512 ? text.slice(0, 512) : text;
  const eventType = EVENT_TYPE_RE.exec(probe)?.[1];
  if (eventType && eventType !== 'state_changed') return false;
  const entityId = ENTITY_ID_RE.exec(probe)?.[1];
  if (!entityId) return false;
  return CRITICAL_DOMAIN_SET.has(getEntityDomain(entityId));
}
