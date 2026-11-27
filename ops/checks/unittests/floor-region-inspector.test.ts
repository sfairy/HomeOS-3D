/**
 * 地面分区检查器表现层的单测。
 *
 * 这三个判定都不抛异常，错了只表现为「按钮文案不对」「点瓷砖没反应」：
 * 1. 自然木语下 `theme` 叫「跟随主题」、其它风格叫「原色」；
 * 2. 瓷砖只在自然木语下出现（其它风格没有对应的瓷砖色档配方）；
 * 3. 深浅只对 wood / tile 可见，`theme` 由场景风格决定，不给用户调。
 */
import { describe, expect, test } from 'bun:test'

import {
  FLOOR_FINISH_BUTTONS,
  floorFinishButtonHidden,
  floorFinishButtonLabel,
  floorRegionInspectorView,
  isNaturalWoodStyle,
} from '../../../homeos/frontend/src/studio/authoring/plan/floor-region-inspector'

describe('isNaturalWoodStyle', () => {
  test('只有 natural-wood 命中', () => {
    expect(isNaturalWoodStyle('natural-wood')).toBe(true)
    expect(isNaturalWoodStyle('warm-wood')).toBe(false)
    expect(isNaturalWoodStyle('default')).toBe(false)
    expect(isNaturalWoodStyle(null)).toBe(false)
  })
})

describe('铺面按钮文案', () => {
  test('木地板两种风格同名', () => {
    expect(floorFinishButtonLabel('wood', 'default')).toBe('木地板')
    expect(floorFinishButtonLabel('wood', 'natural-wood')).toBe('木地板')
  })

  test('theme 在自然木语下叫「跟随主题」，否则「原色」', () => {
    expect(floorFinishButtonLabel('theme', 'natural-wood')).toBe('跟随主题')
    expect(floorFinishButtonLabel('theme', 'default')).toBe('原色')
    expect(floorFinishButtonLabel('theme', 'warm-wood')).toBe('原色')
  })

  test('瓷砖在自然木语下叫「瓷砖」', () => {
    expect(floorFinishButtonLabel('tile', 'natural-wood')).toBe('瓷砖')
  })

  test('瓷砖只在自然木语下可见', () => {
    expect(floorFinishButtonHidden('tile', 'natural-wood')).toBe(false)
    expect(floorFinishButtonHidden('tile', 'default')).toBe(true)
    expect(floorFinishButtonHidden('wood', 'default')).toBe(false)
    expect(floorFinishButtonHidden('theme', 'default')).toBe(false)
  })
})

describe('floorRegionInspectorView', () => {
  test('未选中分区时：按钮按默认铺面高亮，深浅隐藏', () => {
    const view = floorRegionInspectorView(null, {}, 'default')
    expect(view.buttons.map((button) => button.finish)).toEqual([...FLOOR_FINISH_BUTTONS])
    expect(view.buttons.find((button) => button.finish === 'theme')?.pressed).toBe(true)
    expect(view.toneVisible).toBe(false)
    expect(view.canRemove).toBe(false)
  })

  test('选中木地板：深浅可见、上下限 ±20、标签「木地板深浅」', () => {
    const view = floorRegionInspectorView({ finish: 'wood', canRemove: true }, { wood: 7 }, 'default')
    expect(view.toneVisible).toBe(true)
    expect(view.toneValue).toBe(7)
    expect(view.toneMin).toBe(-20)
    expect(view.toneMax).toBe(20)
    expect(view.toneLabel).toBe('木地板深浅')
    expect(view.canRemove).toBe(true)
  })

  test('选中瓷砖：读 tile 色档而不是 wood', () => {
    const view = floorRegionInspectorView({ finish: 'tile', canRemove: false }, { wood: 9, tile: -4 }, 'natural-wood')
    expect(view.toneValue).toBe(-4)
    expect(view.toneLabel).toBe('瓷砖深浅')
  })

  test('选中 theme：深浅隐藏（由场景风格决定）', () => {
    const view = floorRegionInspectorView({ finish: 'theme', canRemove: true }, { wood: 5 }, 'natural-wood')
    expect(view.toneVisible).toBe(false)
    expect(view.toneValue).toBe(0)
  })

  test('0 档时复位按钮禁用；非 0 时可用', () => {
    expect(floorRegionInspectorView({ finish: 'wood', canRemove: true }, {}, 'default').toneResetDisabled).toBe(true)
    expect(
      floorRegionInspectorView({ finish: 'wood', canRemove: true }, { wood: 3 }, 'default').toneResetDisabled,
    ).toBe(false)
  })

  test('越界色档被夹取', () => {
    expect(floorRegionInspectorView({ finish: 'wood', canRemove: true }, { wood: 99 }, 'default').toneValue).toBe(20)
    expect(floorRegionInspectorView({ finish: 'wood', canRemove: true }, { wood: -99 }, 'default').toneValue).toBe(-20)
  })

  test('自然木语下三个铺面都可见且 theme 文案为「跟随主题」', () => {
    const view = floorRegionInspectorView({ finish: 'wood', canRemove: true }, {}, 'natural-wood')
    expect(view.buttons.every((button) => !button.hidden)).toBe(true)
    expect(view.buttons.find((button) => button.finish === 'theme')?.label).toBe('跟随主题')
    expect(view.buttons.find((button) => button.finish === 'tile')?.label).toBe('瓷砖')
  })

  test('其它风格下瓷砖隐藏', () => {
    const view = floorRegionInspectorView({ finish: 'wood', canRemove: true }, {}, 'warm-wood')
    expect(view.buttons.find((button) => button.finish === 'tile')?.hidden).toBe(true)
  })
})
