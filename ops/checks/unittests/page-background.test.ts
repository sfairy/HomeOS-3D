/**
 * 页面背景模型的单测（0.9.0）。
 *
 * 这里钉住的是与 0.9.0 文档/渲染器一致的口径：
 * - 来源键是 `backgroundSource`，旧 `source` 只做读取兼容；
 * - `opacity` 存 0–1，旧 0–100 文档会被折算；
 * - 位置在组件 `position`（px），`properties.position` 只作为旧文档的 legacyPosition；
 * - 取图按容器宽高比挑横 / 竖 / 方三套；
 * - 归一化幂等（保存一次不会漂移）。
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_PAGE_BACKGROUND,
  PAGE_BACKGROUND_PRESETS,
  createPageBackground,
  isPageBackground,
  normalizePageBackground,
  normalizePageBackgroundOpacity,
  pageBackgroundCss,
  pageBackgroundPreset,
  pageBackgroundPresetSource,
  samePageBackground,
} from '../../../homeos/frontend/src/kernel/widget/page-background'

describe('pageBackgroundPreset', () => {
  test('未知预设回落到第一个，而不是抛错或空白', () => {
    expect(pageBackgroundPreset('nope/not-there')[0]).toBe(DEFAULT_PAGE_BACKGROUND)
  })

  test('六个内置预设都可解析', () => {
    expect(PAGE_BACKGROUND_PRESETS).toHaveLength(6)
    for (const [id] of PAGE_BACKGROUND_PRESETS) {
      expect(pageBackgroundPreset(id)[0]).toBe(id)
    }
  })
})

describe('pageBackgroundPresetSource', () => {
  test('宽容器取 landscape', () => {
    expect(pageBackgroundPresetSource('warm-wood/warm-sunlight', 1600, 900)).toContain('-landscape.webp')
  })

  test('竖容器取 portrait', () => {
    expect(pageBackgroundPresetSource('warm-wood/warm-sunlight', 900, 1600)).toContain('-portrait.webp')
  })

  test('近方形取 square', () => {
    expect(pageBackgroundPresetSource('warm-wood/warm-sunlight', 1000, 1000)).toContain('-square.webp')
  })

  test('落在 /static/page-backgrounds 下', () => {
    expect(pageBackgroundPresetSource('default/grid')).toStartWith('/static/page-backgrounds/')
  })
})

describe('normalizePageBackgroundOpacity', () => {
  test('0–1 原样返回', () => {
    expect(normalizePageBackgroundOpacity(0.4)).toBe(0.4)
  })

  test('旧文档的 0–100 折算成 0–1', () => {
    expect(normalizePageBackgroundOpacity(60)).toBe(0.6)
  })

  test('越界被夹到 0–1', () => {
    expect(normalizePageBackgroundOpacity(-1)).toBe(0)
    expect(normalizePageBackgroundOpacity(500)).toBe(1)
    expect(normalizePageBackgroundOpacity('abc')).toBe(1)
  })
})

describe('normalizePageBackground', () => {
  test('空输入得到默认值（与 0.9.0 模板一致）', () => {
    const background = normalizePageBackground(undefined)
    expect(background.backgroundSource).toBe('preset')
    expect(background.preset).toBe(DEFAULT_PAGE_BACKGROUND)
    expect(background.assetId).toBe('')
    expect(background.opacity).toBe(1)
    expect(background.layoutMode).toBe('fill')
    expect(background.legacyPosition).toBeUndefined()
  })

  test('旧 `source` 字段折算到 backgroundSource', () => {
    expect(normalizePageBackground({ source: 'image' }).backgroundSource).toBe('image')
  })

  test('旧百分比位置只作为 legacyPosition 保留', () => {
    const background = normalizePageBackground({
      layoutMode: 'free',
      position: { x: 10, y: 20, width: 30, height: 40 },
    })
    expect(background.legacyPosition).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  test('铺满模式不保留旧位置', () => {
    const background = normalizePageBackground({
      layoutMode: 'fill',
      position: { x: 10, y: 10, width: 20, height: 20 },
    })
    expect(background.legacyPosition).toBeUndefined()
  })

  test('旧位置的宽高最小 0.1%（0 会让元素消失）', () => {
    const background = normalizePageBackground({
      layoutMode: 'free',
      position: { x: 0, y: 0, width: 0, height: -5 },
    })
    expect(background.legacyPosition?.width).toBe(0.1)
    expect(background.legacyPosition?.height).toBe(0.1)
  })

  test('未知预设回落到默认预设', () => {
    expect(normalizePageBackground({ preset: 'not-a-preset' }).preset).toBe(DEFAULT_PAGE_BACKGROUND)
  })

  test('备注截断到 128', () => {
    expect(normalizePageBackground({ label: 'x'.repeat(500) }).label).toHaveLength(128)
  })

  test('归一化幂等', () => {
    const once = normalizePageBackground({
      backgroundSource: 'image',
      assetId: 'user:abc',
      layoutMode: 'free',
      position: { x: 5, y: 6, width: 30, height: 40 },
      opacity: 0.6,
    })
    expect(normalizePageBackground(once)).toEqual(once)
  })
})

describe('createPageBackground', () => {
  test('覆盖字段但不共享对象引用', () => {
    const left = createPageBackground()
    const right = createPageBackground()
    left.assetId = 'user:left'
    expect(right.assetId).toBe('')
  })
})

describe('isPageBackground', () => {
  test('只认文档组件类型标记', () => {
    expect(isPageBackground({ type: 'page-background' })).toBe(true)
    expect(isPageBackground({ type: 'page-background-x' })).toBe(false)
    expect(isPageBackground(null)).toBe(false)
  })
})

describe('pageBackgroundCss', () => {
  test('无图片地址时返回 null（宿主应隐藏而不是画空白）', () => {
    expect(pageBackgroundCss(normalizePageBackground({}), null)).toBeNull()
    expect(pageBackgroundCss(normalizePageBackground({}), '')).toBeNull()
  })

  test('有地址时给出 px 盒与 0–1 透明度', () => {
    const css = pageBackgroundCss(normalizePageBackground({ opacity: 0.5 }), '/x.webp', {
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
    expect(css?.backgroundImage).toBe("url('/x.webp')")
    expect(css?.left).toBe('10px')
    expect(css?.top).toBe('20px')
    expect(css?.width).toBe('30px')
    expect(css?.height).toBe('40px')
    expect(css?.opacity).toBe('0.5')
  })
})

describe('samePageBackground', () => {
  test('等价输入判为相同', () => {
    expect(samePageBackground({}, normalizePageBackground({}))).toBe(true)
  })

  test('透明度不同判为不同', () => {
    expect(samePageBackground({ opacity: 0.1 }, { opacity: 0.2 })).toBe(false)
  })
})
