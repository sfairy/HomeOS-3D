import { describe, expect, test } from 'bun:test';
import { evaluateSelfChargeActions } from '../src/modules/client-power/linkage.helper';
import type { ClientPowerClientConfig, ClientSystemState } from '../src/modules/client-power/types';

function client(partial: Partial<ClientPowerClientConfig['selfCharge']> & { lowPercent?: number }): ClientPowerClientConfig {
  const { lowPercent = 20, ...rest } = partial;
  return {
    id: 'wall',
    label: '墙屏',
    chargerSwitchEntityId: 'switch.charger',
    enabled: true,
    selfCharge: {
      enabled: true,
      lowPercent,
      highPercent: 80,
      touEnabled: true,
      ...rest,
    },
  };
}

function state(level: number): ClientSystemState {
  return {
    clientId: 'wall',
    systemInfo: null,
    level,
    charging: false,
    chargingTime: null,
    dischargingTime: null,
    batterySupported: true,
    lastReportAt: new Date().toISOString(),
    online: true,
  };
}

describe('evaluateSelfChargeActions peak criticalPercent', () => {
  test('lowPercent < 5 时缺省应急阈值钳到 0，峰段仍应急充电', () => {
    const actions = evaluateSelfChargeActions(client({ lowPercent: 3 }), state(2), { isPeak: true });
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_on');
  });

  test('应急阈值高于 lowPercent 时钳到 lowPercent 以下，峰段可暂缓', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 90 }),
      state(19.99),
      { isPeak: true },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_off');
  });

  test('正常 criticalPercent 在峰段介于应急与低阈值之间暂缓充电', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15 }),
      state(17),
      { isPeak: true },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_off');
  });

  test('低于应急阈值时峰段强制充电', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15 }),
      state(10),
      { isPeak: true },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_on');
  });

  test('峰段滞回带仍暂缓充电', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15 }),
      state(25),
      { isPeak: true },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_off');
    expect(actions[0].cooldownKey).toBe('selfCharge:peak:wall');
  });

  test('谷/平段滞回带恢复充电', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15 }),
      state(25),
      { isPeak: false, timeOfUseActive: true },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].service).toBe('turn_on');
    expect(actions[0].cooldownKey).toBe('selfCharge:on:wall');
  });

  test('家庭分时关闭时滞回带保持不动作', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15 }),
      state(25),
      { isPeak: false, timeOfUseActive: false },
    );
    expect(actions).toHaveLength(0);
  });

  test('未启用设备峰谷错峰时滞回带不动作', () => {
    const actions = evaluateSelfChargeActions(
      client({ lowPercent: 20, criticalPercent: 15, touEnabled: false }),
      state(25),
      { isPeak: false, timeOfUseActive: true },
    );
    expect(actions).toHaveLength(0);
  });
});
