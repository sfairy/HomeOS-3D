/**
 * `@homeos/shared` 设备 kind 词汇表的单元测试（`bun test`，与 Python 用例同目录）。
 *
 * 这里只测「表本身」的不变量：跨端一致性由 `ops/checks/check_device_kinds_parity.py`
 * 断言（需要读 Python 侧），两者分工不同 —— 这条保证 TS 侧自洽，那条保证两端等价。
 */
import { describe, expect, test } from 'bun:test'

import {
  CLIMATE_KINDS,
  CLIMATE_RENDER_TYPES,
  CLIMATE_RENDER_TYPE_BY_KIND,
  climateRenderTypeFromKind,
  isClimateDeviceKind,
} from '../../../packages/shared/src/entity/device-kind'

describe('device-kind: 表结构', () => {
  test('每个 kind 都有渲染形态，且没有多余键', () => {
    expect(Object.keys(CLIMATE_RENDER_TYPE_BY_KIND).sort()).toEqual([...CLIMATE_KINDS].sort())
  })

  test('映射值全部落在三种渲染形态内', () => {
    const values = new Set(Object.values(CLIMATE_RENDER_TYPE_BY_KIND))
    expect([...values].sort()).toEqual([...CLIMATE_RENDER_TYPES].sort())
  })

  test('kind 列表无重复', () => {
    expect(new Set(CLIMATE_KINDS).size).toBe(CLIMATE_KINDS.length)
  })
})

describe('device-kind: 换算', () => {
  test('浴霸 / 热水器分别落到自己的面板', () => {
    expect(climateRenderTypeFromKind('bath_heater')).toBe('bath-heater')
    expect(climateRenderTypeFromKind('water_heater')).toBe('water-heater')
  })

  test('分体空调与供暖类复用空调面板', () => {
    for (const kind of ['ac_split', 'ac_central', 'boiler', 'floor_heating']) {
      expect(climateRenderTypeFromKind(kind)).toBe('air-conditioner')
    }
  })

  test('unknown 不给形态（由调用方按域兜底，而不是当成「表外值」）', () => {
    expect(climateRenderTypeFromKind('unknown')).toBe('')
  })

  test('表外取值 / 空值 / 非字符串一律返回空串', () => {
    expect(climateRenderTypeFromKind('air-conditioner')).toBe('')
    expect(climateRenderTypeFromKind('')).toBe('')
    expect(climateRenderTypeFromKind(null)).toBe('')
    expect(climateRenderTypeFromKind(undefined)).toBe('')
    expect(climateRenderTypeFromKind(42)).toBe('')
  })

  test('isClimateDeviceKind 接受 unknown、拒绝表外值', () => {
    expect(isClimateDeviceKind('unknown')).toBe(true)
    expect(isClimateDeviceKind('bath_heater')).toBe(true)
    expect(isClimateDeviceKind('bath-heater')).toBe(false)
    expect(isClimateDeviceKind(undefined)).toBe(false)
  })
})
