/**
 * webhook 触发器 HMAC 签名校验助手（纯函数，便于单测）。
 *
 * 所属模块：backend/modules/automation
 * 职责：自动化 webhook 触发器的可选 HMAC 签名校验。
 *  匹配到 webhook 触发器则必须配置 secret，且请求头
 *  X-HomeOS-Webhook-Signature: sha256=<hex> 须等于 HMAC-SHA256(secret, JSON(payload))。
 *  使用 timingSafeEqual 恒定时间比较，避免计时侧信道泄露 secret。
 * 关键依赖：node:crypto（createHmac / timingSafeEqual）、yaml-parse.util（AutomationRule）。
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { AutomationRule } from './yaml-parse.util';

/** 校验结果：ok=true 表示放行，false 时携带 reason 用于响应 */
interface WebhookVerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * 验证 webhook 请求签名。
 * @param rules 当前已加载的自动化规则集合
 * @param webhookId URL 中的 webhook id（/automation/webhook/:id）
 * @param signatureHeader 请求头 X-HomeOS-Webhook-Signature
 * @param payload 请求体（参与 HMAC 计算）
 * @returns 校验结果；未匹配到 webhook 触发器时返回 ok=true（交由后续触发逻辑判定）
 */
export function verifyWebhookTriggerSignature(
  rules: readonly AutomationRule[],
  webhookId: string,
  signatureHeader: string | undefined,
  payload: Record<string, unknown>,
): WebhookVerifyResult {
  let matchedAny = false;
  for (const rule of rules) {
    for (const trigger of rule.triggers) {
      if (trigger.platform !== 'webhook' || trigger.webhook_id !== webhookId) continue;
      matchedAny = true;
      const secret = String(
        (trigger as { webhook_secret?: string }).webhook_secret || '',
      ).trim();
      if (!secret) {
        return {
          ok: false,
          reason: '该 webhook 未配置 secret；请在触发器中填写 webhook_secret 或 secret',
        };
      }
      if (!signatureHeader) {
        return { ok: false, reason: '缺少签名头 X-HomeOS-Webhook-Signature' };
      }
      const match = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
      if (!match) return { ok: false, reason: '签名格式错误（应为 sha256=hex）' };
      const expectedHex = match[1].toLowerCase();
      const computed = createHmac('sha256', secret)
        .update(JSON.stringify(payload ?? {}))
        .digest('hex');
      try {
        const eq = timingSafeEqual(
          Buffer.from(computed, 'hex'),
          Buffer.from(expectedHex, 'hex'),
        );
        if (!eq) return { ok: false, reason: '签名校验失败' };
      } catch {
        return { ok: false, reason: '签名校验失败' };
      }
    }
  }
  if (!matchedAny) {
    return { ok: true };
  }
  return { ok: true };
}
