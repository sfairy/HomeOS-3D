import { describe, expect, test } from 'bun:test'
import {
  clampNumber,
  finiteNumberOr,
  finiteNumberOrCoerced,
} from '../../../../homeos/frontend/src/studio/app/shared/util/number.ts'

/**
 * 这三个函数是全前端「夹取区间 / 非有限数兜底」的唯一口径，但此前没有任何测试。
 * 它们被合进 `export-presets`、`studio-normalization`（26 处调用）、`scene-popup`、
 * `fan-state` 之后，一处语义漂移就会同时改到导出预设、户型归一化与弹窗字号。
 */
describe('clampNumber', () => {
  test('夹到闭区间内', () => {
    expect(clampNumber(5, 0, 10)).toBe(5)
    expect(clampNumber(-1, 0, 10)).toBe(0)
    expect(clampNumber(11, 0, 10)).toBe(10)
  })

  test('边界值原样返回', () => {
    expect(clampNumber(0, 0, 10)).toBe(0)
    expect(clampNumber(10, 0, 10)).toBe(10)
  })

  test('不做取整与符号处理', () => {
    expect(clampNumber(3.7, 0, 10)).toBe(3.7)
    expect(clampNumber(-0, 0, 10)).toBe(0)
  })

  test('NaN 会传播（调用方必须先收敛）', () => {
    // 这是有意的：`clampNumber` 只管区间。NaN 交给 finiteNumberOr(Coerced)。
    expect(Number.isNaN(clampNumber(Number.NaN, 0, 10))).toBe(true)
  })

  test('上下界写反时返回下界（Math.max 外层胜出）', () => {
    // 记录现状而非背书：调用方写反区间时拿到的是 lowerBound，不是 max/min 的语义期望值。
    expect(clampNumber(5, 10, 0)).toBe(10)
  })
})

describe('finiteNumberOr', () => {
  test('只认真正的 number', () => {
    expect(finiteNumberOr(2.5, 7)).toBe(2.5)
    expect(finiteNumberOr(Number.POSITIVE_INFINITY, 7)).toBe(7)
    expect(finiteNumberOr(Number.NaN, 7)).toBe(7)
  })

  test('字符串与布尔不转换', () => {
    expect(finiteNumberOr('3', 7)).toBe(7)
    expect(finiteNumberOr(true, 7)).toBe(7)
    expect(finiteNumberOr(null, 7)).toBe(7)
  })

  test('fallback 可以是非数值（给「未设置」留 null）', () => {
    expect(finiteNumberOr(undefined, null)).toBeNull()
  })
})

describe('finiteNumberOrCoerced', () => {
  test('接受可转成数字的字符串与布尔', () => {
    expect(finiteNumberOrCoerced('0.4', 0)).toBe(0.4)
    expect(finiteNumberOrCoerced(' 12 ', 0)).toBe(12)
    // Number('') === 0：空串会被当成 0，调用方需要自己先过滤空串（现状如此）。
    expect(finiteNumberOrCoerced('', 9)).toBe(0)
    expect(finiteNumberOrCoerced(true, 9)).toBe(1)
  })

  test('非有限结果落回 fallback', () => {
    expect(finiteNumberOrCoerced('abc', 9)).toBe(9)
    expect(finiteNumberOrCoerced(undefined, 9)).toBe(9)
    expect(finiteNumberOrCoerced(Number.NEGATIVE_INFINITY, 9)).toBe(9)
  })

  test('与 clampNumber 组合即「带兜底的夹取」', () => {
    const clampWithFallback = (raw, min, max, fallback) => clampNumber(finiteNumberOrCoerced(raw, fallback), min, max)
    expect(clampWithFallback('0.4', 0, 1, 0.5)).toBe(0.4)
    expect(clampWithFallback('abc', 0, 1, 0.5)).toBe(0.5)
    expect(clampWithFallback(9, 0, 1, 0.5)).toBe(1)
  })
})
