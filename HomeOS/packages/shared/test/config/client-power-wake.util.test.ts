/**
 * @file client-power-wake.util.test.ts
 * @module @homeos/shared/config
 * @brief 客户端电源唤醒工具函数的单元测试。
 *
 * 职责：
 *  - 验证开关状态关→开的判定（isSwitchOffToOn）；
 *  - 验证充电座开关触发屏保退出的边界条件（shouldDismissScreensaverOnChargerSwitch）；
 *  - 验证下发到前端的公共唤醒配置脱敏（buildClientPowerWakePublic）；
 *  - 验证按本机 clientId 解析对应充电座实体（resolveChargerSwitchWakeEntityId）；
 *  - 验证单机 ID 不匹配时回退、多终端不回退（resolveChargerSwitchWakeForDevice）。
 *
 * 约定：
 *  - 测试用例覆盖开关状态大小写、空快照、unavailable、屏保/预览组合等边界；
 *  - 脱敏后不得包含 reportToken、未绑定开关、关闭人来亮屏的客户端条目。
 */
import { describe, expect, test } from 'bun:test';
import {
  buildClientPowerWakePublic,
  isSwitchOffToOn,
  resolveChargerSwitchWakeEntityId,
  resolveChargerSwitchWakeEntityIdForDevice,
  resolveChargerSwitchWakeForDevice,
  shouldDismissScreensaverOnChargerSwitch,
} from '../../src/config/client-power-wake.util';

describe('isSwitchOffToOn', () => {
  test('仅关→开为真', () => {
    expect(isSwitchOffToOn('off', 'on')).toBe(true);
    expect(isSwitchOffToOn('OFF', 'ON')).toBe(true);
  });

  test('保持开启 / 开→关 / 空快照为假', () => {
    expect(isSwitchOffToOn('on', 'on')).toBe(false);
    expect(isSwitchOffToOn('on', 'off')).toBe(false);
    expect(isSwitchOffToOn(null, 'on')).toBe(false);
    expect(isSwitchOffToOn('unavailable', 'on')).toBe(false);
    expect(isSwitchOffToOn('off', 'unavailable')).toBe(false);
  });
});

describe('shouldDismissScreensaverOnChargerSwitch', () => {
  test('屏保中关→开才退出', () => {
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        oldState: 'off',
        newState: 'on',
      }),
    ).toBe(true);
  });

  test('非屏保或预览或开关保持开不退出', () => {
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: false,
        oldState: 'off',
        newState: 'on',
      }),
    ).toBe(false);
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        previewActive: true,
        oldState: 'off',
        newState: 'on',
      }),
    ).toBe(false);
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        oldState: 'on',
        newState: 'on',
      }),
    ).toBe(false);
  });

  test('本地边沿：null→on 不退、off→on 退、on→on 不退', () => {
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        oldState: null,
        newState: 'on',
      }),
    ).toBe(false);
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        oldState: 'off',
        newState: 'on',
      }),
    ).toBe(true);
    expect(
      shouldDismissScreensaverOnChargerSwitch({
        screensaverVisible: true,
        oldState: 'on',
        newState: 'on',
      }),
    ).toBe(false);
  });
});

describe('buildClientPowerWakePublic', () => {
  test('剔除未绑定开关、关闭人来亮屏与密钥', () => {
    const out = buildClientPowerWakePublic({
      clients: [
        {
          id: 'tab-1',
          label: '客厅平板',
          chargerSwitchEntityId: 'switch.dock',
          enabled: true,
          reportToken: 'secret',
          presenceWakeEnabled: true,
          selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 },
        },
        {
          id: 'tab-2',
          label: '关闭',
          chargerSwitchEntityId: 'switch.other',
          enabled: true,
          presenceWakeEnabled: false,
          selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 },
        },
        {
          id: 'tab-3',
          label: '无开关',
          enabled: true,
          selfCharge: { enabled: true, lowPercent: 20, highPercent: 80 },
        },
      ],
    });
    expect(out.clients).toEqual([
      { id: 'tab-1', chargerSwitchEntityId: 'switch.dock', presenceWakeEnabled: true },
    ]);
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});

describe('resolveChargerSwitchWakeEntityId', () => {
  test('按本机 clientId 解析', () => {
    const wake = {
      clients: [
        { id: 'a', chargerSwitchEntityId: 'switch.a', presenceWakeEnabled: true },
        { id: 'b', chargerSwitchEntityId: 'switch.b', presenceWakeEnabled: true },
      ],
    };
    expect(resolveChargerSwitchWakeEntityId(wake, 'b')).toBe('switch.b');
    expect(resolveChargerSwitchWakeEntityId(wake, 'missing')).toBe('');
  });
});

describe('resolveChargerSwitchWakeForDevice', () => {
  test('精确匹配优先', () => {
    const wake = {
      clients: [
        { id: 'a', chargerSwitchEntityId: 'switch.a', presenceWakeEnabled: true },
        { id: 'b', chargerSwitchEntityId: 'switch.b', presenceWakeEnabled: true },
      ],
    };
    expect(resolveChargerSwitchWakeForDevice(wake, 'b')).toEqual({
      entityId: 'switch.b',
      kind: 'exact',
    });
    expect(resolveChargerSwitchWakeEntityIdForDevice(wake, 'b')).toBe('switch.b');
  });

  test('单终端 ID 不匹配仍回退到该开关', () => {
    const wake = {
      clients: [{ id: 'tab-1', chargerSwitchEntityId: 'switch.dock', presenceWakeEnabled: true }],
    };
    expect(resolveChargerSwitchWakeForDevice(wake, 'cleared-kiosk-id')).toEqual({
      entityId: 'switch.dock',
      kind: 'single_client_fallback',
    });
    expect(resolveChargerSwitchWakeEntityIdForDevice(wake, 'cleared-kiosk-id')).toBe('switch.dock');
  });

  test('多终端 ID 不匹配不回退', () => {
    const wake = {
      clients: [
        { id: 'a', chargerSwitchEntityId: 'switch.a', presenceWakeEnabled: true },
        { id: 'b', chargerSwitchEntityId: 'switch.b', presenceWakeEnabled: true },
      ],
    };
    expect(resolveChargerSwitchWakeForDevice(wake, 'missing')).toEqual({
      entityId: '',
      kind: 'unmatched',
    });
    expect(resolveChargerSwitchWakeEntityIdForDevice(wake, 'missing')).toBe('');
  });

  test('无绑定或仅关闭人来亮屏时不回退', () => {
    expect(resolveChargerSwitchWakeForDevice({ clients: [] }, 'any')).toEqual({
      entityId: '',
      kind: 'unmatched',
    });
    const disabled = {
      clients: [
        { id: 'a', chargerSwitchEntityId: 'switch.a', presenceWakeEnabled: false },
      ],
    };
    expect(resolveChargerSwitchWakeEntityIdForDevice(disabled, 'other')).toBe('');
  });
});
