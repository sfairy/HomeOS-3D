/**
 * 页面背景模型的单测（0.8.9）。
 *
 * 这里钉住的是「两侧宿主必须一致」的那部分：
 * - 预设 id 未知时回落第一个预设（不是画空白）；
 * - 铺满 / 自由的 `position` 语义（自由布局最小 0.1%，0 会让元素彻底消失）；
 * - 取图按容器宽高比挑横 / 竖 / 方三套；
 * - 归一化幂等（保存一次不会漂移）。
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_PAGE_BACKGROUND,
  PAGE_BACKGROUND_FILL_POSITION,
  PAGE_BACKGROUND_PRESETS,
  createPageBackground,
  isPageBackground,
  normalizePageBackground,
  pageBackgroundCss,
  pageBackgroundPreset,
  pageBackgroundPresetSource,
  samePageBackground,
} from '../../../homeos/frontend/src/shared/utils/widget/page-background.util'

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

describe('normalizePageBackground', () => {
  test('空输入得到默认值', () => {
    const background = normalizePageBackground(undefined)
    expect(background.source).toBe('preset')
    expect(background.preset).toBe(DEFAULT_PAGE_BACKGROUND)
    expect(background.opacity).toBe(100)
    expect(background.layoutMode).toBe('fill')
    expect(background.position).toEqual(PAGE_BACKGROUND_FILL_POSITION)
  })

  test('透明度夹到 0–100', () => {
    expect(normalizePageBackground({ opacity: -20 }).opacity).toBe(0)
    expect(normalizePageBackground({ opacity: 500 }).opacity).toBe(100)
    expect(normalizePageBackground({ opacity: 'abc' }).opacity).toBe(100)
  })

  test('铺满模式忽略自定义 position（避免半张图）', () => {
    const background = normalizePageBackground({
      layoutMode: 'fill',
      position: { x: 10, y: 10, width: 20, height: 20 },
    })
    expect(background.position).toEqual(PAGE_BACKGROUND_FILL_POSITION)
  })

  test('自由模式的宽高最小 0.1%（0 会让元素消失）', () => {
    const background = normalizePageBackground({
      layoutMode: 'free',
      position: { x: 0, y: 0, width: 0, height: -5 },
    })
    expect(background.position.width).toBe(0.1)
    expect(background.position.height).toBe(0.1)
  })

  test('未知预设回落到默认预设', () => {
    expect(normalizePageBackground({ preset: 'not-a-preset' }).preset).toBe(DEFAULT_PAGE_BACKGROUND)
  })

  test('备注截断到 128', () => {
    expect(normalizePageBackground({ label: 'x'.repeat(500) }).label).toHaveLength(128)
  })

  test('归一化幂等', () => {
    const once = normalizePageBackground({
      source: 'image',
      assetId: 'user:abc',
      layoutMode: 'free',
      position: { x: 5, y: 6, width: 30, height: 40 },
      opacity: 60,
    })
    expect(normalizePageBackground(once)).toEqual(once)
  })
})

describe('createPageBackground', () => {
  test('覆盖字段但不共享 position 引用', () => {
    const left = createPageBackground()
    const right = createPageBackground()
    left.position.x = 50
    expect(right.position.x).toBe(0)
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

  test('有地址时给出百分比盒与透明度', () => {
    const css = pageBackgroundCss(
      normalizePageBackground({ layoutMode: 'free', opacity: 50, position: { x: 10, y: 20, width: 30, height: 40 } }),
      '/x.webp',
    )
    expect(css?.backgroundImage).toBe("url('/x.webp')")
    expect(css?.left).toBe('10%')
    expect(css?.top).toBe('20%')
    expect(css?.width).toBe('30%')
    expect(css?.height).toBe('40%')
    expect(css?.opacity).toBe('0.5')
  })
})

describe('samePageBackground', () => {
  test('等价输入判为相同', () => {
    expect(samePageBackground({}, normalizePageBackground({}))).toBe(true)
  })

  test('透明度不同判为不同', () => {
    expect(samePageBackground({ opacity: 10 }, { opacity: 20 })).toBe(false)
  })
})
