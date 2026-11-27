/**
 * 页面背景检查器字段表与编辑合并的单测（0.8.9）。
 *
 * 这些断言保护的是「两个宿主看起来一致」：字段何时显示、数值怎么夹、切换来源后
 * 另一侧字段是否还残留可见。错了不会报错，只会让侧边栏设置与主页面检查器悄悄分叉。
 */
import { describe, expect, test } from 'bun:test'

import {
  PAGE_BACKGROUND_FIELDS,
  PAGE_BACKGROUND_POSITION_FIELDS,
  applyPageBackgroundEdit,
  applyPageBackgroundEdits,
  pageBackgroundFieldVisible,
  pageBackgroundPresetOptions,
} from '../../../homeos/frontend/src/studio/app/editor/inspectors/home/page-background-spec'

import { normalizePageBackground } from '../../../homeos/frontend/src/kernel/widget/page-background'

describe('字段表', () => {
  test('六个预设都能出现在下拉里', () => {
    expect(pageBackgroundPresetOptions()).toHaveLength(6)
    expect(pageBackgroundPresetOptions()[0]!.value).toBe('default/grid')
  })

  test('预设字段只在来源为 preset 时可见', () => {
    expect(pageBackgroundFieldVisible('preset', { source: 'preset' })).toBe(true)
    expect(pageBackgroundFieldVisible('preset', { source: 'image' })).toBe(false)
  })

  test('图片字段只在来源为 image 时可见', () => {
    expect(pageBackgroundFieldVisible('assetId', { source: 'image' })).toBe(true)
    expect(pageBackgroundFieldVisible('assetId', { source: 'preset' })).toBe(false)
  })

  test('位置字段只在自由布局时可见（铺满时整组隐藏）', () => {
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'free' })).toBe(true)
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'fill' })).toBe(false)
  })

  test('未知字段默认可见（新增字段不会被悄悄藏起来）', () => {
    expect(pageBackgroundFieldVisible('future-field', {})).toBe(true)
  })

  test('字段表覆盖 0.8.9 检查器的全部 6 行', () => {
    const keys = PAGE_BACKGROUND_FIELDS.map((field) => field.key)
    for (const key of ['label', 'source', 'preset', 'assetId', 'opacity', 'layoutMode', 'position']) {
      expect(keys).toContain(key)
    }
  })
})

describe('applyPageBackgroundEdit', () => {
  test('切换来源为 image', () => {
    expect(applyPageBackgroundEdit({}, { key: 'source', value: 'image' }).source).toBe('image')
  })

  test('非法来源回落 preset', () => {
    expect(applyPageBackgroundEdit({ source: 'image' }, { key: 'source', value: 'nope' }).source).toBe('preset')
  })

  test('透明度夹到 0–100', () => {
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: 500 }).opacity).toBe(100)
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: -5 }).opacity).toBe(0)
  })

  test('备注截断到 128', () => {
    expect(applyPageBackgroundEdit({}, { key: 'label', value: 'x'.repeat(500) }).label).toHaveLength(128)
  })

  test('切换自由布局后位置保留', () => {
    const background = applyPageBackgroundEdits({}, [
      { key: 'layoutMode', value: 'free' },
      { key: 'position.x', value: 12 },
      { key: 'position.y', value: 34 },
    ])
    expect(background.layoutMode).toBe('free')
    expect(background.position.x).toBe(12)
    expect(background.position.y).toBe(34)
  })

  test('自由布局下尺寸最小 0.1%（0 会让元素消失）', () => {
    const background = applyPageBackgroundEdits({}, [
      { key: 'layoutMode', value: 'free' },
      { key: 'position.width', value: 0 },
    ])
    expect(background.position.width).toBe(0.1)
  })

  test('切回铺满后位置被重置为铺满', () => {
    const background = applyPageBackgroundEdits({}, [
      { key: 'layoutMode', value: 'free' },
      { key: 'position.x', value: 50 },
      { key: 'layoutMode', value: 'fill' },
    ])
    expect(background.position).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  test('未知位置轴被忽略', () => {
    const background = applyPageBackgroundEdit({}, { key: 'position.zzz', value: 5 })
    expect(background.position).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  test('未知字段原样返回', () => {
    const background = applyPageBackgroundEdit({ opacity: 40 }, { key: 'nonsense', value: 1 })
    expect(background.opacity).toBe(40)
  })

  test('结果总是归一化过的（可直接入库/上行）', () => {
    const background = applyPageBackgroundEdit(undefined, { key: 'opacity', value: 33 })
    expect(background).toEqual(normalizePageBackground(background))
  })

  test('位置四格常量与标签一一对应', () => {
    expect([...PAGE_BACKGROUND_POSITION_FIELDS]).toEqual(['x', 'y', 'width', 'height'])
  })
})

describe('applyPageBackgroundEdits', () => {
  test('空编辑列表等价于归一化', () => {
    expect(applyPageBackgroundEdits({ opacity: 70 }, [])).toEqual(normalizePageBackground({ opacity: 70 }))
  })

  test('多次编辑按顺序累积', () => {
    const background = applyPageBackgroundEdits({}, [
      { key: 'preset', value: 'warm-wood/warm-dusk' },
      { key: 'opacity', value: 55 },
      { key: 'source', value: 'image' },
      { key: 'assetId', value: 'user:abc' },
    ])
    expect(background.preset).toBe('warm-wood/warm-dusk')
    expect(background.opacity).toBe(55)
    expect(background.source).toBe('image')
    expect(background.assetId).toBe('user:abc')
  })
})
