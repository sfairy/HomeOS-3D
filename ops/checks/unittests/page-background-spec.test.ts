/**
 * 页面背景检查器字段表与编辑合并的单测（0.9.0）。
 *
 * 这些断言保护的是「两个宿主看起来一致」：字段何时显示、数值怎么夹、切换来源后
 * 另一侧字段是否还残留可见，以及位置百分比与组件 px 的互算。
 */
import { describe, expect, test } from 'bun:test'

import {
  PAGE_BACKGROUND_FIELDS,
  PAGE_BACKGROUND_POSITION_FIELDS,
  applyPageBackgroundEdit,
  applyPageBackgroundEdits,
  pageBackgroundFieldVisible,
  pageBackgroundLegacyBox,
  pageBackgroundPositionAxisValue,
  pageBackgroundPositionPercentages,
  pageBackgroundPresetOptions,
} from '../../../homeos/frontend/src/studio/app/editor/inspectors/home/page-background-spec'

import { normalizePageBackground } from '../../../homeos/frontend/src/kernel/widget/page-background'

describe('字段表', () => {
  test('六个预设都能出现在下拉里', () => {
    expect(pageBackgroundPresetOptions()).toHaveLength(6)
    expect(pageBackgroundPresetOptions()[0]!.value).toBe('default/grid')
  })

  test('预设字段只在来源为 preset 时可见', () => {
    expect(pageBackgroundFieldVisible('preset', { backgroundSource: 'preset' })).toBe(true)
    expect(pageBackgroundFieldVisible('preset', { backgroundSource: 'image' })).toBe(false)
  })

  test('图片字段只在来源为 image 时可见', () => {
    expect(pageBackgroundFieldVisible('assetId', { backgroundSource: 'image' })).toBe(true)
    expect(pageBackgroundFieldVisible('assetId', { backgroundSource: 'preset' })).toBe(false)
  })

  test('位置字段只在自由布局时可见（铺满时整组隐藏）', () => {
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'free' })).toBe(true)
    expect(pageBackgroundFieldVisible('position', { layoutMode: 'fill' })).toBe(false)
  })

  test('未知字段默认可见（新增字段不会被悄悄藏起来）', () => {
    expect(pageBackgroundFieldVisible('future-field', {})).toBe(true)
  })

  test('字段表覆盖 0.9.0 检查器的全部 6 行', () => {
    const keys = PAGE_BACKGROUND_FIELDS.map((field) => field.key)
    for (const key of ['label', 'backgroundSource', 'preset', 'assetId', 'opacity', 'layoutMode', 'position']) {
      expect(keys).toContain(key)
    }
  })
})

describe('applyPageBackgroundEdit', () => {
  test('切换来源为 image', () => {
    expect(applyPageBackgroundEdit({}, { key: 'backgroundSource', value: 'image' }).backgroundSource).toBe('image')
  })

  test('旧字段名 source 仍可写入（别名）', () => {
    expect(applyPageBackgroundEdit({}, { key: 'source', value: 'image' }).backgroundSource).toBe('image')
  })

  test('非法来源回落 preset', () => {
    expect(
      applyPageBackgroundEdit({ backgroundSource: 'image' }, { key: 'backgroundSource', value: 'nope' })
        .backgroundSource,
    ).toBe('preset')
  })

  test('透明度 0–100 输入折算到 0–1', () => {
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: 500 }).opacity).toBe(1)
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: 65 }).opacity).toBe(0.65)
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: -5 }).opacity).toBe(0)
  })

  test('透明度 0–1 输入原样保留', () => {
    expect(applyPageBackgroundEdit({}, { key: 'opacity', value: 0.42 }).opacity).toBe(0.42)
  })

  test('备注截断到 128', () => {
    expect(applyPageBackgroundEdit({}, { key: 'label', value: 'x'.repeat(500) }).label).toHaveLength(128)
  })

  test('未知字段原样返回', () => {
    const background = applyPageBackgroundEdit({ opacity: 0.4 }, { key: 'nonsense', value: 1 })
    expect(background.opacity).toBe(0.4)
  })

  test('结果总是归一化过的（可直接入库/上行）', () => {
    const background = applyPageBackgroundEdit(undefined, { key: 'opacity', value: 33 })
    expect(background).toEqual(normalizePageBackground(background))
  })

  test('位置四格常量与标签一一对应', () => {
    expect([...PAGE_BACKGROUND_POSITION_FIELDS]).toEqual(['x', 'y', 'width', 'height'])
  })
})

describe('位置百分比换算（0.9.0）', () => {
  const canvas = { width: 1000, height: 500 }
  const position = { x: 100, y: 50, width: 200, height: 100 }

  test('x/y 取中心点百分比，width/height 取尺寸百分比', () => {
    expect(pageBackgroundPositionPercentages(position, canvas)).toEqual({
      x: 20,
      y: 20,
      width: 20,
      height: 20,
    })
  })

  test('x 百分比回写时减去一半尺寸（中心点 → 左上角）', () => {
    expect(pageBackgroundPositionAxisValue('x', 20, position, canvas)).toBe(100)
    expect(pageBackgroundPositionAxisValue('y', 20, position, canvas)).toBe(50)
  })

  test('width/height 回写时按画布折算，最小 0.1%', () => {
    expect(pageBackgroundPositionAxisValue('width', 20, position, canvas)).toBe(200)
    expect(pageBackgroundPositionAxisValue('height', 0, position, canvas)).toBe(0.5)
  })

  test('旧百分比盒按画布折算成 px', () => {
    const background = normalizePageBackground({
      layoutMode: 'free',
      position: { x: 10, y: 20, width: 30, height: 40 },
    })
    expect(pageBackgroundLegacyBox(background, canvas)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    })
  })
})

describe('applyPageBackgroundEdits', () => {
  test('空编辑列表等价于归一化', () => {
    expect(applyPageBackgroundEdits({ opacity: 0.7 }, [])).toEqual(normalizePageBackground({ opacity: 0.7 }))
  })

  test('多次编辑按顺序累积', () => {
    const background = applyPageBackgroundEdits({}, [
      { key: 'preset', value: 'warm-wood/warm-dusk' },
      { key: 'opacity', value: 55 },
      { key: 'backgroundSource', value: 'image' },
      { key: 'assetId', value: 'user:abc' },
    ])
    expect(background.preset).toBe('warm-wood/warm-dusk')
    expect(background.opacity).toBe(0.55)
    expect(background.backgroundSource).toBe('image')
    expect(background.assetId).toBe('user:abc')
  })
})
