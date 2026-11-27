/**
 * 光影模式切换行 / 逐灯柔光入口的单测（0.8.9）。
 *
 * 这两个控件最容易出的错是「状态对但显示不对」：切到标准光影后逐灯入口还留着，
 * 点进去却被拒绝。所以断言集中在**显隐规则**与**模式文案**上，不碰 DOM 细节。
 */
import { describe, expect, test } from 'bun:test'

import {
  LIGHTING_MODE_VERSION,
  fixtureLightingView,
  type FixtureLightingHost,
} from '../../../homeos/frontend/src/studio/authoring/ui/lighting'

/** 无 DOM 环境下的最小宿主（`document` 不存在时两个控件都拿不到，函数应安全返回）。 */
function host(overrides: Partial<FixtureLightingHost> = {}): FixtureLightingHost {
  return {
    lightingMode: 'region',
    fixture: { id: 'lamp-1', type: 'downlight' },
    isLamp: true,
    override: undefined,
    setLightingMode: () => {},
    editFixtureRange: () => {},
    ...overrides,
  }
}

describe('光影模式版本号', () => {
  test('与后端 `lightingModeVersion` 对齐（2）', () => {
    expect(LIGHTING_MODE_VERSION).toBe(2)
  })
})

describe('逐灯柔光入口的显隐', () => {
  test('轻量柔光 + 选中灯具 → 应当显示', () => {
    expect(fixtureLightingView(host()).showFixtureRow).toBe(true)
  })

  test('标准光影下即使选中灯具也不显示（避免点了没反应）', () => {
    expect(fixtureLightingView(host({ lightingMode: 'standard' })).showFixtureRow).toBe(false)
  })

  test('非灯具不显示', () => {
    expect(fixtureLightingView(host({ isLamp: false })).showFixtureRow).toBe(false)
  })

  test('没有选中件不显示', () => {
    expect(fixtureLightingView(host({ fixture: null })).showFixtureRow).toBe(false)
  })

  test('灯具缺 id 也不显示（打开编辑器需要 id 定位）', () => {
    expect(fixtureLightingView(host({ fixture: { type: 'downlight' } })).showFixtureRow).toBe(false)
  })

  test('光影模式行常显（用户要能切回标准光影）', () => {
    expect(fixtureLightingView(host()).showModeRow).toBe(true)
    expect(fixtureLightingView(host({ lightingMode: 'standard' })).showModeRow).toBe(true)
  })

  test('嵌入舞台 / 自动导图里整行隐藏（上游 `hidden = B || Me`）', () => {
    // 两种宿主都没有「切光影」这回事：舞台管线由 URL 固定，自动导图只截图。
    expect(fixtureLightingView(host({ hideModeRow: true })).showModeRow).toBe(false)
    // 隐藏时逐灯入口也必须一起消失，否则会出现一个没有父行的孤立按钮。
    expect(fixtureLightingView(host({ hideModeRow: true })).showFixtureRow).toBe(false)
  })
})

describe('状态文案口径', () => {
  test('未调整 → 自动', () => {
    expect(fixtureLightingView(host()).statusLabel).toBe('柔光覆盖 · 自动')
    expect(fixtureLightingView(host({ override: { adjusted: false } })).statusLabel).toBe('柔光覆盖 · 自动')
  })

  test('已调整 → 已调整', () => {
    expect(fixtureLightingView(host({ override: { adjusted: true } })).statusLabel).toBe('柔光覆盖 · 已调整')
  })

  test('不显示时状态文案为空（不留残留文字）', () => {
    expect(fixtureLightingView(host({ lightingMode: 'standard' })).statusLabel).toBeNull()
    expect(fixtureLightingView(host({ isLamp: false })).statusLabel).toBeNull()
  })
})
