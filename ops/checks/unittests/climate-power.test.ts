/**
 * 气候开关态 / 运行态判据的单元测试（`bun test`）。
 *
 * 这三条判据此前在 3D 侧、舞台面板、Vue 弹窗与仪表盘卡片各实现一遍，最容易分叉：
 *
 * 1. 浴霸 `state === 'off'` 但仍可能处于换气（`preset_mode` 决定）；
 * 2. 热水器测得温度距目标不足 0.4 度时算保温而不是加热；
 * 3. `unknown` / `unavailable` 一律不算开机（失联设备不能画成运行中）。
 *
 * 收敛到 `shared/device/climate-power.ts` 之后，用这里的用例把口径钉死。
 */
import { describe, expect, test } from 'bun:test'

import {
  bathHeaterModeUsesAirflow,
  bathHeaterPresentationMode,
  climateIsPoweredOn,
  climateIsRunning,
  climatePresentationMode,
  normalizeClimateModeKey,
  WATER_HEATER_HEATING_TOLERANCE_C,
} from '../../../homeos/frontend/src/features/device/model/climate-power'

describe('normalizeClimateModeKey', () => {
  test('大小写 / 空格 / 连字符 / 加号归一', () => {
    expect(normalizeClimateModeKey('Quick Heat')).toBe('quick_heat')
    expect(normalizeClimateModeKey('quickHeat')).toBe('quick_heat')
    expect(normalizeClimateModeKey('quick-heat')).toBe('quick_heat')
    expect(normalizeClimateModeKey('eco+mold')).toBe('eco_and_mold')
    expect(normalizeClimateModeKey('  fan_only  ')).toBe('fan_only')
  })

  test('空值返回空串', () => {
    expect(normalizeClimateModeKey(null)).toBe('')
    expect(normalizeClimateModeKey(undefined)).toBe('')
    expect(normalizeClimateModeKey('   ')).toBe('')
  })
})

describe('浴霸吹风判定', () => {
  test('换气 / 吹风 / 除雾 / 干燥算在用', () => {
    for (const mode of ['vent', 'ventilation', 'fan_only', 'defog', 'drying', '换气', '吹风', '除雾']) {
      expect(bathHeaterModeUsesAirflow(mode)).toBe(true)
    }
  })

  test('停机档与空值不算', () => {
    for (const mode of ['off', 'idle', 'standby', 'unknown', 'unavailable', '待机', '关闭', '', null]) {
      expect(bathHeaterModeUsesAirflow(mode)).toBe(false)
    }
  })

  test('state=off 但 preset 是换气 → 呈现模式保留换气', () => {
    expect(bathHeaterPresentationMode({ state: 'off', attributes: { preset_mode: 'vent' } })).toBe('vent')
    expect(bathHeaterPresentationMode({ state: 'off', attributes: { preset_mode: 'off' } })).toBe('off')
  })

  test('state=off + 换气 → 视为开机（关键行为：主开关关着仍在换气）', () => {
    expect(climateIsPoweredOn({ state: 'off', attributes: { preset_mode: 'vent' } }, 'bath-heater')).toBe(true)
    expect(climateIsPoweredOn({ state: 'off', attributes: { preset_mode: 'off' } }, 'bath-heater')).toBe(false)
  })

  test('浴霸失联不算开机', () => {
    expect(climateIsPoweredOn({ state: 'unavailable' }, 'bath-heater')).toBe(false)
    expect(climateIsPoweredOn({ state: 'unknown' }, 'bath-heater')).toBe(false)
  })
})

describe('空调 / 热水器呈现模式', () => {
  test('热水器优先读 operation_mode', () => {
    expect(
      climatePresentationMode({ state: 'eco', attributes: { operation_mode: 'performance' } }, 'water-heater'),
    ).toBe('performance')
  })

  test('热水器停机态原样返回', () => {
    expect(climatePresentationMode({ state: 'off' }, 'water-heater')).toBe('off')
    expect(climatePresentationMode({ state: 'unavailable' }, 'water-heater')).toBe('unavailable')
  })

  test('空调直接看 state', () => {
    expect(climatePresentationMode({ state: 'cool' }, 'air-conditioner')).toBe('cool')
  })
})

describe('开机态', () => {
  test('空调/热水器：off / unknown / unavailable 之外都算开机', () => {
    expect(climateIsPoweredOn({ state: 'cool' })).toBe(true)
    expect(climateIsPoweredOn({ state: 'idle' })).toBe(true)
    expect(climateIsPoweredOn({ state: 'off' })).toBe(false)
    expect(climateIsPoweredOn({ state: 'unavailable' })).toBe(false)
    expect(climateIsPoweredOn({}, 'water-heater')).toBe(false)
  })
})

describe('运行态', () => {
  test('热水器：低于目标 0.4 度才算加热', () => {
    const snapshot = { state: 'heat', attributes: { current_temperature: 40, temperature: 55 } }
    expect(climateIsRunning(snapshot, 'water-heater')).toBe(true)
    // 恰好差 0.4 度已是边界：不算「正在加热」。
    const atBoundary = {
      state: 'heat',
      attributes: { current_temperature: 55 - WATER_HEATER_HEATING_TOLERANCE_C, temperature: 55 },
    }
    expect(climateIsRunning(atBoundary, 'water-heater')).toBe(false)
  })

  test('热水器缺少温度读数时按「在运行」处理（无法判断就不断言停机）', () => {
    expect(climateIsRunning({ state: 'heat', attributes: {} }, 'water-heater')).toBe(true)
  })

  test('空调看 hvac_action', () => {
    expect(climateIsRunning({ state: 'cool', attributes: { hvac_action: 'cooling' } })).toBe(true)
    expect(climateIsRunning({ state: 'cool', attributes: { hvac_action: 'idle' } })).toBe(false)
    expect(climateIsRunning({ state: 'off', attributes: { hvac_action: 'cooling' } })).toBe(false)
  })

  test('浴霸：只有在吹风/换气时才运行', () => {
    expect(climateIsRunning({ state: 'on', attributes: { preset_mode: 'vent' } }, 'bath-heater')).toBe(true)
    expect(climateIsRunning({ state: 'on', attributes: { preset_mode: 'off' } }, 'bath-heater')).toBe(false)
  })
})
