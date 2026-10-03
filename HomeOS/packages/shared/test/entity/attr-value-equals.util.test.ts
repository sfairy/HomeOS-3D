/**
 * @file attr-value-equals.util.test.ts
 * @module @homeos/shared/entity
 * @brief 实体属性值业务语义比较工具单元测试（对应 C-4.4 纯函数边界用例）。
 *
 * 重点覆盖：
 *  - 候选 5-A 修复：attrValueEquals(NaN, NaN) 必须 true（NaN 读数丢失再丢失视为无变化）
 *  - NaN × 非 NaN 必须 false
 *  - 数值容差 1 语义、键序无关的对象比较、数组比较、null/undefined 边界。
 */
import { describe, expect, test } from 'bun:test';
import { attrValueEquals } from '../../src/entity/attr-value-equals.util';

describe('attrValueEquals（Logic fix 候选5-A 覆盖）', () => {
  // ── 修复覆盖用例：C-4.1/路径5/候选5-A ──
  test('NaN vs NaN → true（传感器读数再次丢失视为属性无变化）', () => {
    expect(attrValueEquals(NaN, NaN)).toBe(true);
  });

  test('NaN vs 非 NaN（数字/字符串/对象）→ false', () => {
    expect(attrValueEquals(NaN, 0)).toBe(false);
    expect(attrValueEquals(NaN, 123)).toBe(false);
    expect(attrValueEquals(NaN, 'NaN')).toBe(false);
    expect(attrValueEquals(0, NaN)).toBe(false);
    expect(attrValueEquals(NaN, null)).toBe(false);
    expect(attrValueEquals(undefined, NaN)).toBe(false);
  });

  test('对象属性中嵌套 NaN 对比时键序无关且 NaN=NaN', () => {
    const a = { a: 1, v: NaN, nested: { value: NaN } };
    const b = { v: NaN, a: 1, nested: { value: NaN } };
    expect(attrValueEquals(a, b)).toBe(true);
  });

  // ── 非回归用例：成功路径（正常非边界输入）行为须与修复前一致 ──
  test('相同原始类型 → true', () => {
    expect(attrValueEquals(1, 1)).toBe(true);
    expect(attrValueEquals('foo', 'foo')).toBe(true);
    expect(attrValueEquals(true, true)).toBe(true);
    expect(attrValueEquals(null, null)).toBe(true);
    expect(attrValueEquals(undefined, undefined)).toBe(true);
  });

  test('null/undefined 不交叉相等 → false', () => {
    expect(attrValueEquals(null, undefined)).toBe(false);
    expect(attrValueEquals(undefined, null)).toBe(false);
    expect(attrValueEquals(null, 0)).toBe(false);
    expect(attrValueEquals(undefined, '')).toBe(false);
  });

  test('数值容差 1（整数传感器常见单位）→ 视为相等', () => {
    expect(attrValueEquals(22, 23)).toBe(true);
    expect(attrValueEquals(0, 0.9)).toBe(true);
    expect(attrValueEquals(10, 11)).toBe(true);
    expect(attrValueEquals(10, 12)).toBe(false);
    expect(attrValueEquals(10, 11.0001)).toBe(false);
  });

  test('数组相等（逐元素递归）', () => {
    expect(attrValueEquals([1, 2, NaN], [1, 2, NaN])).toBe(true);
    expect(attrValueEquals([1, 2], [1, 2, 3])).toBe(false);
    expect(attrValueEquals([NaN], [0])).toBe(false);
  });

  test('对象键序无关', () => {
    expect(attrValueEquals({ x: 1, y: 2 }, { y: 2, x: 1 })).toBe(true);
    expect(attrValueEquals({ x: 1, extra: undefined }, { x: 1, extra: undefined })).toBe(true);
    expect(attrValueEquals({ x: 1, a: 3 }, { x: 2 })).toBe(false); // 'a' 缺失键 vs {}=undefined → false
    // 注：attrValueEquals 对数值使用 1 容差，故 {x:1} vs {x:2} → 视为相等（传感器噪声容差语义）
    expect(attrValueEquals({ x: 1 }, { x: 3 })).toBe(false);
  });

  test('数字/字符串数字的近似相等（1 内）', () => {
    expect(attrValueEquals('1', 2)).toBe(true);
    expect(attrValueEquals(100, '100.5')).toBe(true);
    expect(attrValueEquals('10', 15)).toBe(false);
  });
});
