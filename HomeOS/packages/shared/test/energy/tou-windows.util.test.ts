/**
 * @file tou-windows.util.test.ts
 * @module @homeos/shared/energy
 * @brief 峰谷时段窗口工具函数的单元测试。
 *
 * 职责：
 *  - 验证峰谷时段配置的合法性校验（validateTouWindows）：默认跨日谷段、峰段重叠、谷段跨日重叠、起止相同、省略第二峰段；
 *  - 验证时钟区间重叠判定（clockRangesOverlap）：相邻区间半开区间不重叠。
 *
 * 约定：
 *  - 时段采用 "HH:MM" 24 小时格式；
 *  - 重叠判定使用半开区间 [start, end)，相邻边界视为不重叠。
 */
import { describe, expect, test } from 'bun:test';
import { clockRangesOverlap, validateTouWindows } from '../../src/energy/tou-windows.util';

describe('validateTouWindows', () => {
  test('默认峰谷（谷段跨日）通过', () => {
    expect(
      validateTouWindows({
        peakStart1: '8:00',
        peakEnd1: '11:00',
        peakStart2: '18:00',
        peakEnd2: '23:00',
        valleyStart: '23:00',
        valleyEnd: '7:00',
      }),
    ).toEqual([]);
  });

  test('峰段互相重叠报错', () => {
    const errs = validateTouWindows({
      peakStart1: '08:00',
      peakEnd1: '12:00',
      peakStart2: '11:00',
      peakEnd2: '14:00',
    });
    expect(errs.some((e) => e.includes('重叠'))).toBe(true);
  });

  test('谷段与峰段跨日重叠报错', () => {
    const errs = validateTouWindows({
      peakStart1: '06:00',
      peakEnd1: '10:00',
      valleyStart: '23:00',
      valleyEnd: '07:00',
    });
    expect(errs.some((e) => e.includes('重叠'))).toBe(true);
  });

  test('起止相同报错', () => {
    expect(validateTouWindows({ peakStart1: '08:00', peakEnd1: '08:00' })).toEqual([
      '峰段1起止不能相同',
    ]);
  });

  test('空第二峰段可省略', () => {
    expect(
      validateTouWindows({
        peakStart1: '08:00',
        peakEnd1: '11:00',
        valleyStart: '23:00',
        valleyEnd: '07:00',
      }),
    ).toEqual([]);
  });
});

describe('clockRangesOverlap', () => {
  test('相邻不重叠（半开）', () => {
    expect(clockRangesOverlap('08:00', '11:00', '11:00', '14:00')).toBe(false);
  });
});
