/**
 * 取暖壁挂炉配置绑定的单测（0.8.9）。
 *
 * 这里钉住两条容易静默出错的语义：
 *
 * 1. **渲染不写文档**：`buildRuntimeProperties` 把 `structuredClone2` 整份展开，
 *    如果「打开配置面板」就补一条 `heatingBoilers` 记录，用户什么都没改也会看到
 *    「有未保存修改」。所以 `boilerBindingFor` 必须是只读的。
 * 2. **默认值必须是「开」**：公告是「制热时可显示本层盘管」，默认关会让人以为功能没做。
 *    写错成 `false` 不会报错，只会让盘管永远不出现。
 */
import { describe, expect, test } from 'bun:test'

import {
  boilerBindingFor,
  ensureBoilerBinding,
} from '../../../homeos/frontend/src/studio/runtime/config-ui/config-editor/rendering/boiler-section'
import {
  heatingPanelStyleOf,
  isThermostatBoilerPanel,
} from '../../../homeos/frontend/src/studio/runtime/climate/boiler-copy'

describe('壁挂炉绑定：只读渲染', () => {
  test('没有记录时返回 null，且不修改 environment', () => {
    const environment: Record<string, unknown> = {}
    expect(boilerBindingFor(environment, 'floor-1')).toBeNull()
    expect('heatingBoilers' in environment).toBe(false)
  })

  test('按楼层取，不串层', () => {
    const environment = {
      heatingBoilers: [
        { deviceId: 'climate.a', floorId: 'floor-1' },
        { deviceId: 'climate.b', floorId: 'floor-2' },
      ],
    }
    expect(boilerBindingFor(environment, 'floor-2')?.deviceId).toBe('climate.b')
    expect(boilerBindingFor(environment, 'floor-3')).toBeNull()
  })
})

describe('壁挂炉绑定：改动时补建', () => {
  test('默认温控卡 + 制热时显示盘管', () => {
    const environment: Record<string, unknown> = {}
    const created = ensureBoilerBinding(environment, 'floor-1')
    expect(created.heatingPanelStyle).toBe('thermostat')
    expect(created.underfloorHeating).toBe(true)
    expect(created.floorId).toBe('floor-1')
    expect(Array.isArray(environment.heatingBoilers)).toBe(true)
  })

  test('已存在时复用同一条，不重复追加', () => {
    const environment = { heatingBoilers: [{ deviceId: 'climate.a', floorId: 'floor-1' }] }
    const first = ensureBoilerBinding(environment, 'floor-1')
    const second = ensureBoilerBinding(environment, 'floor-1')
    expect(first).toBe(second)
    expect((environment.heatingBoilers as unknown[]).length).toBe(1)
  })

  test('多楼层各一条，互不覆盖', () => {
    const environment: Record<string, unknown> = {}
    ensureBoilerBinding(environment, 'floor-1').deviceId = 'climate.a'
    ensureBoilerBinding(environment, 'floor-2').deviceId = 'climate.b'
    expect((environment.heatingBoilers as unknown[]).length).toBe(2)
    expect(boilerBindingFor(environment, 'floor-1')?.deviceId).toBe('climate.a')
    expect(boilerBindingFor(environment, 'floor-2')?.deviceId).toBe('climate.b')
  })
})

describe('壁挂炉面板形态：只有显式 climate 才是空调卡', () => {
  test('缺省 / 脏值 / 旧枚举都按温控卡', () => {
    expect(heatingPanelStyleOf({})).toBe('thermostat')
    expect(heatingPanelStyleOf(null)).toBe('thermostat')
    expect(heatingPanelStyleOf(undefined)).toBe('thermostat')
    expect(heatingPanelStyleOf({ heatingPanelStyle: 'card' })).toBe('thermostat')
    // 旧枚举（本项目早期误用）不能被当成空调卡，否则会漏判成"配置没生效"。
    expect(heatingPanelStyleOf({ heatingPanelStyle: 'air-conditioner' })).toBe('thermostat')
    expect(heatingPanelStyleOf({ heatingPanelStyle: 'climate' })).toBe('climate')
  })

  test('温控卡只对壁挂炉生效，空调不受影响', () => {
    expect(isThermostatBoilerPanel({ type: 'heating-boiler' })).toBe(true)
    expect(isThermostatBoilerPanel({ climateType: 'heating-boiler', heatingPanelStyle: 'climate' })).toBe(false)
    expect(isThermostatBoilerPanel({ climateType: 'air-conditioner' })).toBe(false)
    expect(isThermostatBoilerPanel(null)).toBe(false)
  })
})
