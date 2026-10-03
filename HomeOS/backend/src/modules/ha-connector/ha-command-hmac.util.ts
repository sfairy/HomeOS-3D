/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - HA 命令 HMAC 签名防篡改；
 * 关键依赖：
 *  - crypto.createHmac；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** 参与 HMAC 规范 JSON 的请求字段（不含 hmac） */
interface HaCommandHmacPayload {
  correlationId: string;
  domain: string;
  service: string;
  entityId: string;
  serviceData?: Record<string, unknown>;
  returnResponse?: boolean;
  requestId?: string;
}

/** 固定字段顺序的规范 JSON，确保发布方与校验方一致 */
function canonicalHaCommandPayload(payload: HaCommandHmacPayload): string {
  return JSON.stringify({
    correlationId: payload.correlationId,
    domain: payload.domain,
    service: payload.service,
    entityId: payload.entityId,
    serviceData: payload.serviceData,
    returnResponse: payload.returnResponse,
    requestId: payload.requestId,
  });
}

/** HMAC-SHA256 hex 签名 */
export function signHaCommandRequest(payload: HaCommandHmacPayload, secret: string): string {
  return createHmac('sha256', secret).update(canonicalHaCommandPayload(payload)).digest('hex');
}

/** 校验 HMAC；签名缺失或不匹配返回 false */
export function verifyHaCommandRequest(
  req: HaCommandHmacPayload & { hmac?: string },
  secret: string,
): boolean {
  if (!req.hmac) return false;
  const expected = signHaCommandRequest(req, secret);
  const received = String(req.hmac);
  try {
    if (received.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}
