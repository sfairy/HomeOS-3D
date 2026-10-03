import { describe, expect, test } from 'bun:test';
import {
  CONFIG_MASK_PLACEHOLDER,
  maskSensitiveFieldsByKey,
  restoreClientPowerReportTokens,
  stripMaskedPlaceholders,
} from '../src/shared/app-config/config-mask.util';

describe('stripMaskedPlaceholders', () => {
  test('剔除占位符与空/null 敏感字段，保留其它键', () => {
    const stripped = stripMaskedPlaceholders({
      haToken: CONFIG_MASK_PLACEHOLDER,
      password: '',
      apiKey: null,
      label: 'keep',
      count: 0,
    });
    expect(stripped).toEqual({ label: 'keep', count: 0 });
  });

  test('递归进入 clientPower.clients 数组', () => {
    const stripped = stripMaskedPlaceholders({
      clientPower: {
        clients: [
          { id: 'wall', reportToken: CONFIG_MASK_PLACEHOLDER, label: '墙屏' },
          { id: 'pad', reportToken: '', label: '平板' },
        ],
      },
    });
    expect(stripped.clientPower.clients[0]).toEqual({ id: 'wall', label: '墙屏' });
    expect(stripped.clientPower.clients[1]).toEqual({ id: 'pad', label: '平板' });
  });
});

describe('maskSensitiveFieldsByKey', () => {
  test('脱敏数组元素中的 reportToken', () => {
    const obj = {
      clientPower: {
        clients: [{ id: 'wall', reportToken: 'secret-hex' }],
      },
    };
    maskSensitiveFieldsByKey(obj);
    expect(obj.clientPower.clients[0].reportToken).toBe(CONFIG_MASK_PLACEHOLDER);
    expect(obj.clientPower.clients[0].id).toBe('wall');
  });
});

describe('restoreClientPowerReportTokens', () => {
  test('按 id 回填被丢掉或占位的 reportToken', () => {
    const next = {
      enabled: true,
      reportIntervalSec: 10,
      staleTimeoutSec: 300,
      cooldownMin: 5,
      linkageRetryCount: 2,
      linkageRetryDelayMs: 5000,
      clients: [
        { id: 'wall', label: '墙屏', enabled: true, reportToken: '', selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 } },
        { id: 'pad', label: '平板', enabled: true, reportToken: CONFIG_MASK_PLACEHOLDER, selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 } },
        { id: 'new', label: '新机', enabled: true, selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 } },
      ],
    };
    const prev = {
      ...next,
      clients: [
        { id: 'wall', label: '墙屏', enabled: true, reportToken: 'token-wall', selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 } },
        { id: 'pad', label: '平板', enabled: true, reportToken: 'token-pad', selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 } },
      ],
    };
    restoreClientPowerReportTokens(next, prev);
    expect(next.clients[0].reportToken).toBe('token-wall');
    expect(next.clients[1].reportToken).toBe('token-pad');
    expect(next.clients[2].reportToken).toBeUndefined();
  });
});
