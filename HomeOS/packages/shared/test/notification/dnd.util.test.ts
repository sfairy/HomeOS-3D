/**
 * @file dnd.util.test.ts
 * @module @homeos/shared/notification
 * @brief 通知勿扰模式工具函数的单元测试。
 *
 * 职责：
 *  - 验证勿扰时段激活判定（isDndActive）：跨日夜间窗口、同日白天窗口、起止相同即全天勿扰；
 *  - 验证勿扰持续小时数计算（dndDurationHours）：跨日、全天、同日；
 *  - 验证基于当前配置与系统时间的勿扰激活判定（isDndActiveNow）：配置缺失时返回 false。
 *
 * 约定：
 *  - 时段以 0-23 整点小时为单位（不含分钟）；
 *  - 判定使用半开区间 [start, end)，end == start 视为全天。
 */
import { describe, expect, test } from 'bun:test'
import { dndDurationHours, isDndActive, isDndActiveNow } from '../../src/notification/dnd.util'

describe('isDndActive', () => {
  test('overnight window 22→8', () => {
    expect(isDndActive(23, 22, 8)).toBe(true)
    expect(isDndActive(3, 22, 8)).toBe(true)
    expect(isDndActive(10, 22, 8)).toBe(false)
  })
  test('same start/end is all-day dnd', () => {
    expect(isDndActive(12, 8, 8)).toBe(true)
  })
  test('same-day window 9→17', () => {
    expect(isDndActive(9, 9, 17)).toBe(true)
    expect(isDndActive(16, 9, 17)).toBe(true)
    expect(isDndActive(17, 9, 17)).toBe(false)
    expect(isDndActive(8, 9, 17)).toBe(false)
  })
})

describe('dndDurationHours', () => {
  test('overnight and all-day', () => {
    expect(dndDurationHours(22, 8)).toBe(10)
    expect(dndDurationHours(8, 8)).toBe(24)
    expect(dndDurationHours(9, 17)).toBe(8)
  })
})

describe('isDndActiveNow', () => {
  test('missing config is not dnd', () => {
    expect(isDndActiveNow({})).toBe(false)
  })
})
