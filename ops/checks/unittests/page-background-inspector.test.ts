/**
 * 页面背景检查器宿主绑定的单测（0.9.0）。
 *
 * 这里测的是**渲染层与检查器之间的口径**，不是 DOM 交互（那部分要浏览器）：
 *
 * - 选中非页面背景时，检查器必须整体隐藏并返回 `false`（否则会占着右栏）；
 * - 透明度在**文档里是 0–1**（0.9.0），检查器显示时乘 100；
 * - 预设下拉的选项集合与 `PAGE_BACKGROUND_PRESETS` 一致；
 * - 铺满模式隐藏位置四格，自由布局用组件 `position` 的百分比回显。
 */
import { describe, expect, test } from 'bun:test'

import {
  PAGE_BACKGROUND_PRESETS,
  normalizePageBackground,
  pageBackgroundPreset,
} from '../../../homeos/frontend/src/kernel/widget/page-background'
import {
  applyPageBackgroundEdit,
  pageBackgroundFieldVisible,
  pageBackgroundPositionPercentages,
} from '../../../homeos/frontend/src/studio/app/editor/inspectors/home/page-background-spec'

describe('预设表与 0.9.0 一致', () => {
  test('六个预设、id 与图片名主干都对得上', () => {
    expect(PAGE_BACKGROUND_PRESETS.length).toBe(6)
    expect(PAGE_BACKGROUND_PRESETS.map(([id]) => id)).toEqual([
      'default/grid',
      'default/dots',
      'warm-wood/warm-sunlight',
      'warm-wood/warm-dusk',
      'natural-wood/warm-sunlight',
      'natural-wood/warm-dusk',
    ])
    expect(PAGE_BACKGROUND_PRESETS.map(([, , stem]) => stem)).toEqual([
      'grid',
      'dots',
      'warm-sunlight',
      'warm-dusk',
      'paper-garden',
      'evening-garden',
    ])
  })

  test('未知预设回落到第一个（不去猜）', () => {
    expect(pageBackgroundPreset('nope')[0]).toBe('default/grid')
  })
})

describe('透明度口径', () => {
  test('文档存 0–1，不是 0–100', () => {
    const background = normalizePageBackground({ opacity: 0.42 })
    expect(background.opacity).toBe(0.42)
  })

  test('旧文档的百分数被折算', () => {
    expect(normalizePageBackground({ opacity: 42 }).opacity).toBe(0.42)
  })

  test('检查器编辑透明度写回 0–1', () => {
    const next = applyPageBackgroundEdit({}, { key: 'opacity', value: 65 })
    expect(next.opacity).toBe(0.65)
  })
})

describe('字段可见性', () => {
  test('选图片时隐藏预设，选内置时隐藏图片字段', () => {
    expect(pageBackgroundFieldVisible('preset', { backgroundSource: 'preset' })).toBe(true)
    expect(pageBackgroundFieldVisible('preset', { backgroundSource: 'image' })).toBe(false)
    expect(pageBackgroundFieldVisible('assetId', { backgroundSource: 'image' })).toBe(true)
    expect(pageBackgroundFieldVisible('assetId', { backgroundSource: 'preset' })).toBe(false)
  })

  test('铺满时隐藏位置四格', () => {
    // 字段表里位置是**一个组**（`position`），不是四行独立字段：四格同显同隐。
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'fill' })).toBe(false)
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'free' })).toBe(true)
  })

  test('未知字段默认可见（避免新增字段被静默藏起来）', () => {
    expect(pageBackgroundFieldVisible('somethingNew', {})).toBe(true)
  })
})

describe('铺满与自由的位置语义', () => {
  test('位置来自组件盒，x/y 是中心点百分比', () => {
    const percentages = pageBackgroundPositionPercentages(
      { x: 200, y: 100, width: 400, height: 200 },
      { width: 1000, height: 500 },
    )
    expect(percentages).toEqual({ x: 40, y: 40, width: 40, height: 40 })
  })

  test('归一化不再把位置塞回 properties', () => {
    const background = normalizePageBackground({ layoutMode: 'free' })
    expect('position' in background).toBe(false)
    expect(background.legacyPosition).toBeUndefined()
  })
})
