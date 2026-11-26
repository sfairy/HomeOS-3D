/**
 * 页面背景检查器宿主绑定的单测（0.8.9）。
 *
 * 这里测的是**渲染层与检查器之间的口径**，不是 DOM 交互（那部分要浏览器）：
 *
 * - 选中非页面背景时，检查器必须整体隐藏并返回 `false`（否则会占着右栏）；
 * - 透明度在**本仓文档里是 0–100**（上游是 0–1）—— 混用会让背景几乎全透明；
 * - 预设下拉的选项集合与 `PAGE_BACKGROUND_PRESETS` 一致；
 * - 铺满模式忽略自定义位置，四格不会残留旧值。
 */
import { describe, expect, test } from 'bun:test'

import {
  normalizePageBackground,
  pageBackgroundPreset,
  PAGE_BACKGROUND_PRESETS,
} from '../../../homeos/frontend/src/shared/utils/widget/page-background.util'
import {
  applyPageBackgroundEdit,
  pageBackgroundFieldVisible,
} from '../../../homeos/frontend/src/studio/app/editor/inspectors/home/page-background-spec'

describe('预设表与上游一致', () => {
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
  test('本仓文档存 0–100，不是 0–1', () => {
    const background = normalizePageBackground({ opacity: 42 })
    expect(background.opacity).toBe(42)
  })

  test('越界被夹到 0–100', () => {
    expect(normalizePageBackground({ opacity: 500 }).opacity).toBe(100)
    expect(normalizePageBackground({ opacity: -3 }).opacity).toBe(0)
  })

  test('检查器编辑透明度写回百分数', () => {
    const next = applyPageBackgroundEdit({}, { key: 'opacity', value: 65 })
    expect(next.opacity).toBe(65)
  })
})

describe('字段可见性', () => {
  test('选图片时隐藏预设，选内置时隐藏图片字段', () => {
    expect(pageBackgroundFieldVisible('preset', { source: 'preset' })).toBe(true)
    expect(pageBackgroundFieldVisible('preset', { source: 'image' })).toBe(false)
    expect(pageBackgroundFieldVisible('assetId', { source: 'image' })).toBe(true)
    expect(pageBackgroundFieldVisible('assetId', { source: 'preset' })).toBe(false)
  })

  test('铺满时隐藏位置四格', () => {
    // 字段表里位置是**一个组**（`position`），不是四行独立字段：四格同显同隐。
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'fill' })).toBe(false)
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'free' })).toBe(true)
  })

  test('未知字段默认可见（新增字段不会被静默藏起来）', () => {
    expect(pageBackgroundFieldVisible('somethingNew', {})).toBe(true)
  })
})

describe('铺满与自由的位置语义', () => {
  test('铺满强制 0/0/100/100（忽略传入的自定义值）', () => {
    const background = normalizePageBackground({
      layoutMode: 'fill',
      position: { x: 17, y: 22, width: 30, height: 40 },
    })
    expect(background.position).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  test('自由模式保留并夹取', () => {
    const background = normalizePageBackground({
      layoutMode: 'free',
      position: { x: -10, y: 30, width: 0, height: 250 },
    })
    expect(background.position.x).toBe(0)
    expect(background.position.y).toBe(30)
    expect(background.position.width).toBe(0.1)
    expect(background.position.height).toBe(100)
  })
})
