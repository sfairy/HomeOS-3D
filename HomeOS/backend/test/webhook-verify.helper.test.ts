import { describe, expect, test } from 'bun:test';
import { verifyWebhookTriggerSignature } from '../src/modules/automation/webhook-verify.helper';
import { createHmac } from 'crypto';
import type { AutomationRule } from '../src/modules/automation/yaml-parse.util';

function rule(webhookId: string, secret?: string): AutomationRule {
  return {
    id: 'r1',
    name: 't',
    triggers: [
      {
        platform: 'webhook',
        webhook_id: webhookId,
        webhook_secret: secret,
      } as AutomationRule['triggers'][number],
    ],
    conditions: [],
    actions: [],
    mode: 'single',
    enabled: true,
  };
}

function sign(secret: string, payload: Record<string, unknown>): string {
  const hex = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  return `sha256=${hex}`;
}

describe('verifyWebhookTriggerSignature', () => {
  const payload = { ok: true };

  test('未配置 secret 的匹配触发器拒绝', () => {
    const r = verifyWebhookTriggerSignature([rule('wh1')], 'wh1', sign('x', payload), payload);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('未配置 secret');
  });

  test('缺少签名头拒绝', () => {
    const r = verifyWebhookTriggerSignature([rule('wh1', 's3cret-value')], 'wh1', undefined, payload);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('缺少签名头');
  });

  test('正确 HMAC 通过', () => {
    const secret = 's3cret-value';
    const r = verifyWebhookTriggerSignature(
      [rule('wh1', secret)],
      'wh1',
      sign(secret, payload),
      payload,
    );
    expect(r.ok).toBe(true);
  });

  test('错误 HMAC 拒绝', () => {
    const r = verifyWebhookTriggerSignature(
      [rule('wh1', 's3cret-value')],
      'wh1',
      sign('other', payload),
      payload,
    );
    expect(r.ok).toBe(false);
  });

  test('未匹配的 webhook id 放行（由引擎返回 triggered=0）', () => {
    const r = verifyWebhookTriggerSignature([rule('wh1', 's3cret-value')], 'other', undefined, payload);
    expect(r.ok).toBe(true);
  });
});
