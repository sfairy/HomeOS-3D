/**
 * 电视安装方式（含 0.9.0 新增「四脚落地支架」）的纯函数单测。
 *
 * 落地支架与前三种的差别不只是比例：它**没有外部 GLB**、有「落地最小尺寸」，
 * 且切换档位时要同时处理高度/深度回落与 `elevation` 归零。这三条错了都只表现为
 * 「电视半悬在地面上」或「换档后高度卡在 1.55」，不会抛异常。
 */
import { describe, expect, test } from 'bun:test'

import {
  TV_FLOOR_STAND,
  TV_MOUNT_RATIOS,
  computeTelevisionProportions,
  normalizeTvMountStyle,
  setTvMountStyle,
  tvExternalModelType,
  tvFloorStandLegs,
  tvScreenLayout,
} from '../../../homeos/frontend/src/studio/authoring/items/studio-television-proportions'

describe('normalizeTvMountStyle', () => {
  test('四档都认，未知回落 standard', () => {
    for (const style of ['standard', 'tabletop', 'mobile', TV_FLOOR_STAND]) {
      expect(normalizeTvMountStyle(style)).toBe(style)
    }
    expect(normalizeTvMountStyle('wall')).toBe('standard')
    expect(normalizeTvMountStyle(undefined)).toBe('standard')
  })
})

describe('tvExternalModelType', () => {
  test('落地支架没有外部模型，返回空串', () => {
    expect(tvExternalModelType(TV_FLOOR_STAND)).toBe('')
    expect(tvExternalModelType('standard')).toBe('tv_standard')
    expect(tvExternalModelType('tabletop')).toBe('tv_tabletop')
    expect(tvExternalModelType('mobile')).toBe('tv_mobile')
    expect(tvExternalModelType('nonsense')).toBe('tv_standard')
  })
})

describe('tvScreenLayout', () => {
  test('落地支架用 0.6 / 0.7 比例与更薄的面板', () => {
    const layout = tvScreenLayout({ tvMountStyle: TV_FLOOR_STAND, width: 1.2, height: 1.6, depth: 0.5 })
    expect(layout.bodyHeight).toBeCloseTo(1.6 * 0.6, 6)
    expect(layout.centerY).toBeCloseTo(1.6 * 0.7, 6)
    expect(layout.panelDepth).toBeCloseTo(Math.min(0.5 * 0.14, 0.06), 6)
    expect(layout.screenWidth).toBeCloseTo(1.2 * 0.94, 6)
    expect(layout.screenHeight).toBeCloseTo(layout.bodyHeight * 0.9, 6)
  })

  test('壁挂档沿用 0.965 / 0.94 与更厚的面板', () => {
    const layout = tvScreenLayout({ tvMountStyle: 'standard', width: 1.2, height: 1.6, depth: 0.5 })
    expect(layout.panelDepth).toBeCloseTo(Math.max(0.5 * 0.28, 0.05), 6)
    expect(layout.screenWidth).toBeCloseTo(1.2 * 0.965, 6)
  })
})

describe('tvFloorStandLegs', () => {
  test('四条腿，前后各两条且左右对称', () => {
    const { radius, legs } = tvFloorStandLegs(1.2, 1.48, 0.5)
    expect(legs).toHaveLength(4)
    expect(radius).toBeLessThanOrEqual(0.012)
    // 前脚外撇 0.47 倍宽，后脚 0.42 倍宽。
    const frontFootX = Math.max(...legs.map((leg) => Math.abs(leg.footX)))
    expect(frontFootX).toBeCloseTo(1.2 * 0.47, 6)
    // 腿顶都落在 ±0.36 倍宽上。
    for (const leg of legs) expect(Math.abs(leg.topX)).toBeCloseTo(1.2 * 0.36, 6)
  })

  test('腿半径取四者最小值，不会超过 12mm', () => {
    expect(tvFloorStandLegs(0.4, 1.48, 0.5).radius).toBeLessThanOrEqual(0.012)
    expect(tvFloorStandLegs(2, 1.48, 0.5).radius).toBeCloseTo(0.012, 6)
  })
})

describe('setTvMountStyle', () => {
  test('切到落地支架：抬到最小值且 elevation 归零', () => {
    const item: { tvMountStyle?: string; height?: number; depth?: number; elevation?: number } = {
      tvMountStyle: 'standard',
      height: 0.8,
      depth: 0.1,
      elevation: 1.2,
    }
    setTvMountStyle(item, TV_FLOOR_STAND)
    expect(item.tvMountStyle).toBe(TV_FLOOR_STAND)
    expect(item.height).toBeCloseTo(TV_MOUNT_RATIOS[TV_FLOOR_STAND].floorSize!.height, 6)
    expect(item.depth).toBeCloseTo(TV_MOUNT_RATIOS[TV_FLOOR_STAND].floorSize!.depth, 6)
    expect(item.elevation).toBe(0)
  })

  test('离开落地档且尺寸正好是落地最小值时回落到兜底尺寸', () => {
    const item: { tvMountStyle?: string; height?: number; depth?: number; elevation?: number } = {
      tvMountStyle: TV_FLOOR_STAND,
      height: TV_MOUNT_RATIOS[TV_FLOOR_STAND].floorSize!.height,
      depth: TV_MOUNT_RATIOS[TV_FLOOR_STAND].floorSize!.depth,
      elevation: 0,
    }
    setTvMountStyle(item, 'standard', { height: 1.2, depth: 0.3 })
    expect(item.height).toBeCloseTo(1.2, 6)
    expect(item.depth).toBeCloseTo(0.3, 6)
  })

  test('同档重复设置不改变尺寸', () => {
    const item = { tvMountStyle: 'standard', height: 0.8, depth: 0.12 }
    setTvMountStyle(item, 'standard')
    expect(item.height).toBe(0.8)
    expect(item.depth).toBe(0.12)
  })
})

describe('computeTelevisionProportions', () => {
  test('落地支架走 tvScreenLayout，不再按宽度定屏幕', () => {
    const proportions = computeTelevisionProportions({ tvMountStyle: TV_FLOOR_STAND }, 1.2, 1.6)
    const layout = tvScreenLayout({ tvMountStyle: TV_FLOOR_STAND, width: 1.2, height: 1.6, depth: 0 })
    expect(proportions.screenWidth).toBeCloseTo(layout.screenWidth, 6)
    expect(proportions.bodyHeight).toBeCloseTo(layout.bodyHeight, 6)
    expect(proportions.centerY).toBeCloseTo(layout.centerY, 6)
  })

  test('其它档保持原有等比轴行为', () => {
    const standard = computeTelevisionProportions({ tvMountStyle: 'standard' }, 1.2, 1.6)
    expect(standard.screenWidth / standard.screenHeight).toBeCloseTo(16 / 9, 6)
    expect(computeTelevisionProportions({ tvMountStyle: 'mobile' }, 1.2, 1.6).centerY).toBeCloseTo(1.6 * 0.76, 6)
    expect(computeTelevisionProportions({ tvMountStyle: 'tabletop' }, 1.2, 1.6).centerY).toBeCloseTo(1.6 * 0.67, 6)
  })
})
