import { describe, expect, test } from 'bun:test';
import { validateAppConfigSection } from '../src/shared/app-config/validate/sections.util';
import { AppConfigValidationError } from '../src/shared/app-config/validate/primitives.util';

function expectFieldError(fn: () => void, key: string, messagePart?: string) {
  try {
    fn();
    throw new Error('expected AppConfigValidationError');
  } catch (e) {
    expect(e).toBeInstanceOf(AppConfigValidationError);
    const err = e as AppConfigValidationError;
    const hit = err.fieldErrors.find((f) => f.key === key);
    expect(hit).toBeTruthy();
    if (messagePart && hit) expect(hit.message).toContain(messagePart);
  }
}

describe('validateAppConfigSection iaq / energy', () => {
  test('iaq 合法阈值通过', () => {
    validateAppConfigSection('iaq', { iaqAlertThreshold: 60, iaqTargetTemp: 22 });
  });

  test('iaq 阈值越界报错', () => {
    expectFieldError(() => validateAppConfigSection('iaq', { iaqAlertThreshold: 0 }), 'iaqAlertThreshold');
  });

  test('energy 拒绝已迁走的 iaq 键', () => {
    expectFieldError(
      () => validateAppConfigSection('energy', { iaqAlertThreshold: 60 }),
      'iaqAlertThreshold',
      'iaq',
    );
  });

  test('energy 接受本分区字段', () => {
    validateAppConfigSection('energy', { meterEntityId: 'sensor.grid_power', spikeRatio: 2 });
  });
});

describe('validateAppConfigSection clientPower', () => {
  test('presenceWakeEnabled 须为布尔', () => {
    expectFieldError(
      () =>
        validateAppConfigSection('clientPower', {
          clients: [
            {
              id: 'tab-1',
              label: '客厅',
              presenceWakeEnabled: 'yes',
            },
          ],
        }),
      'clients',
    );
  });

  test('合法客户端含人来亮屏开关通过', () => {
    validateAppConfigSection('clientPower', {
      clients: [
        {
          id: 'tab-1',
          label: '客厅',
          chargerSwitchEntityId: 'switch.dock',
          presenceWakeEnabled: true,
        },
      ],
    });
  });

  test('criticalPercent 须小于 lowPercent', () => {
    expectFieldError(
      () =>
        validateAppConfigSection('clientPower', {
          clients: [
            {
              id: 'tab-1',
              label: '客厅',
              selfCharge: { enabled: true, lowPercent: 20, highPercent: 80, criticalPercent: 20 },
            },
          ],
        }),
      'clients',
      'criticalPercent',
    );
  });

  test('criticalPercent 为 0 且小于 lowPercent 通过', () => {
    validateAppConfigSection('clientPower', {
      clients: [
        {
          id: 'tab-1',
          label: '客厅',
          selfCharge: { enabled: true, lowPercent: 20, highPercent: 80, touEnabled: true, criticalPercent: 0 },
        },
      ],
    });
  });
});
