import { describe, expect, test } from 'bun:test';
import { isPeakTime } from '../src/shared/app-config/pricing-config.util';
import type { AppConfigData } from '../src/shared/app-config/types';

function pricing(partial: Partial<AppConfigData['pricing']> = {}): AppConfigData['pricing'] {
  return {
    pricingMode: 'tiered',
    fixedPrice: 0.5,
    timeOfUseEnabled: true,
    peakStart1: '8:00',
    peakEnd1: '11:00',
    peakStart2: '18:00',
    peakEnd2: '21:00',
    valleyStart: '23:00',
    valleyEnd: '07:00',
    peakPrice: 0,
    valleyPrice: 0,
    flatPrice: 0,
    ...partial,
  } as AppConfigData['pricing'];
}

describe('isPeakTime home timezone', () => {
  test('按家庭时区判定峰段，不跟随进程本地时区', () => {
    // 2026-01-15 00:30 UTC = 08:30 Asia/Shanghai
    const now = new Date('2026-01-15T00:30:00.000Z');
    const cfg = pricing();
    expect(isPeakTime(now, cfg, 'Asia/Shanghai')).toBe(true);
    expect(isPeakTime(now, cfg, 'UTC')).toBe(false);
  });

  test('关闭分时恒为 false', () => {
    const now = new Date('2026-01-15T00:30:00.000Z');
    expect(isPeakTime(now, pricing({ timeOfUseEnabled: false }), 'Asia/Shanghai')).toBe(false);
  });
});
