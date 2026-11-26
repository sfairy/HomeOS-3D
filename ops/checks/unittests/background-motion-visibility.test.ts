/**
 * 「背景动态」开关的显示条件（0.8.9）。
 *
 * 上游条件：`isWarmWood && sceneStyle !== 'natural-wood'`。
 *
 * 这条看似琐碎，但它决定用户能不能看到该功能：本仓此前**只判 `isWarmWood`**，
 * 没有排除自然木语 —— 而自然木语的背景是两张静态插画，开关本身没有意义。
 * 更关键的是它属于「户型与布局」分区，用户去那里找却找不到时会以为功能缺失。
 */
import { describe, expect, test } from 'bun:test'

import { isWarmSceneStyle } from '../../../homeos/frontend/src/studio/app/shared/scene-styles'

/** 与 `editor.ts` 里的 `supportsBackgroundMotion` 同一条判据。 */
function supportsBackgroundMotion(sceneStyle: string): boolean {
  return isWarmSceneStyle(sceneStyle) && sceneStyle !== 'natural-wood'
}

describe('背景动态开关的显示条件', () => {
  test('暖阳原木：显示', () => {
    expect(supportsBackgroundMotion('warm-wood')).toBe(true)
  })

  test('自然木语：不显示（背景是静态插画，开关无意义）', () => {
    expect(supportsBackgroundMotion('natural-wood')).toBe(false)
  })

  test('默认风格：不显示（背景是纯网格，没有动画）', () => {
    expect(supportsBackgroundMotion('default')).toBe(false)
  })

  test('未知风格：不显示而不是报错', () => {
    expect(supportsBackgroundMotion('nope')).toBe(false)
    expect(supportsBackgroundMotion('')).toBe(false)
  })
})
