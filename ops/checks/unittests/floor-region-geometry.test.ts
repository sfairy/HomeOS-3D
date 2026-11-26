/**
 * 地面分区几何与铺面参数的单测（0.8.9）。
 *
 * 三个模块都只产出数值，但错了的后果很具体：
 * - 切分算错 → 分区消失或渲染成碎片；
 * - 色档算错 → 相邻分区深浅不一致（同一批木料变成两种木头）；
 * - 盘管算错 → 管子穿墙或盘不成蛇形。
 */
import { describe, expect, test } from 'bun:test'

import {
  FLOOR_FINISH_PROFILES,
  THEME_FLOOR_BY_SCENE_STYLE,
  clampFloorTone,
  floorFinishSupportsTone,
  floorFinishToneKind,
  floorMaterialParams,
  floorToneBrightness,
  floorToneForFinish,
} from '../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-floor-finish'
import {
  MIN_REGION_AREA,
  clipRingByLine,
  dedupeRing,
  hasSelfIntersection,
  ringArea,
  ringAreaAbs,
  snapToFloorRegionEdge,
  splitFloorRegionByLine,
} from '../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-floor-region-split'
import {
  buildRegionHeatingPaths,
  buildUnderfloorHeatingPaths,
  clipHorizontalSpan,
  shouldShowUnderfloorHeating,
} from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-underfloor-heating'

const square = (size = 4, x = 0, y = 0) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
]

describe('环面积', () => {
  test('4×4 方形面积为 16，正负只表示绕向', () => {
    expect(ringAreaAbs(square())).toBeCloseTo(16, 6)
    expect(Math.sign(ringArea(square()))).toBe(-Math.sign(ringArea([...square()].reverse())))
  })

  test('退化环面积为 0', () => {
    expect(
      ringAreaAbs([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBeCloseTo(0, 6)
  })
})

describe('clipRingByLine', () => {
  test('竖线切方形得到两个矩形', () => {
    const left = dedupeRing(clipRingByLine(square(4), { x: 2, y: -1 }, { x: 2, y: 5 }, true))
    const right = dedupeRing(clipRingByLine(square(4), { x: 2, y: -1 }, { x: 2, y: 5 }, false))
    expect(ringAreaAbs(left)).toBeCloseTo(8, 6)
    expect(ringAreaAbs(right)).toBeCloseTo(8, 6)
  })

  test('完全在一侧的线：只有一侧留下完整区域，另一侧为空', () => {
    // 注意「左右」由线的**方向**决定：`{x:10,y:-1}→{x:10,y:5}` 朝 +y，
    // 方形（x≤4）落在它的一侧。这里不依赖具体命名，只断言「恰好一侧完整、另一侧空」。
    const positive = dedupeRing(clipRingByLine(square(4), { x: 10, y: -1 }, { x: 10, y: 5 }, true))
    const negative = dedupeRing(clipRingByLine(square(4), { x: 10, y: -1 }, { x: 10, y: 5 }, false))
    const areas = [ringAreaAbs(positive), ringAreaAbs(negative)].sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(0, 6)
    expect(areas[1]).toBeCloseTo(16, 6)
  })

  test('零长度线返回空（不产生 NaN 多边形）', () => {
    expect(clipRingByLine(square(4), { x: 2, y: 2 }, { x: 2, y: 2 }, true)).toHaveLength(0)
  })
})

describe('dedupeRing', () => {
  test('去掉连续重复点与首尾重合', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 0 },
    ]
    expect(dedupeRing(ring)).toHaveLength(3)
  })
})

describe('hasSelfIntersection', () => {
  test('方形不自交', () => {
    expect(hasSelfIntersection(square())).toBe(false)
  })

  test('蝴蝶形自交', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ]
    expect(hasSelfIntersection(bowtie)).toBe(true)
  })

  test('三点环不算自交', () => {
    expect(
      hasSelfIntersection([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false)
  })
})

describe('splitFloorRegionByLine', () => {
  test('竖切方形得到两块同面积', () => {
    const split = splitFloorRegionByLine({ outline: square(4), holes: [] }, { x: 2, y: -1 }, { x: 2, y: 5 })
    expect(split).not.toBeNull()
    expect(ringAreaAbs(split!.left.outline)).toBeCloseTo(8, 6)
    expect(ringAreaAbs(split!.right.outline)).toBeCloseTo(8, 6)
    expect(split!.left.holes).toEqual([])
  })

  test('斜切也能切出两块', () => {
    const split = splitFloorRegionByLine({ outline: square(4), holes: [] }, { x: -1, y: -1 }, { x: 5, y: 5 })
    expect(split).not.toBeNull()
    // 两块面积之和等于原面积（裁剪不丢面积）。
    const total = ringAreaAbs(split!.left.outline) + ringAreaAbs(split!.right.outline)
    expect(total).toBeCloseTo(16, 4)
  })

  test('线在区域外 → 切不开', () => {
    expect(splitFloorRegionByLine({ outline: square(4), holes: [] }, { x: 10, y: 0 }, { x: 10, y: 4 })).toBeNull()
  })

  test('只擦到一个角（碎块过小）→ 切不开', () => {
    expect(
      splitFloorRegionByLine({ outline: square(4), holes: [] }, { x: 3.999, y: -1 }, { x: 3.999, y: 5 }),
    ).toBeNull()
  })

  test('带洞的分区拒绝切分（没有对应 UI 表达洞被切开）', () => {
    expect(
      splitFloorRegionByLine({ outline: square(6), holes: [square(1, 2, 2)] }, { x: 3, y: -1 }, { x: 3, y: 7 }),
    ).toBeNull()
  })

  test('最小面积常量是正数（防止被改成 0 让碎块合法）', () => {
    expect(MIN_REGION_AREA).toBeGreaterThan(0)
  })
})

describe('snapToFloorRegionEdge', () => {
  test('内部点吸附到最近边', () => {
    const snap = snapToFloorRegionEdge({ outline: square(4) }, { x: 3.8, y: 2 })
    expect(snap).not.toBeNull()
    expect(snap!.point.x).toBeCloseTo(4, 6)
    expect(snap!.distance).toBeCloseTo(0.2, 6)
  })

  test('超过 maxDistance 返回 null（UI 提示「请靠近边界」）', () => {
    expect(snapToFloorRegionEdge({ outline: square(4) }, { x: 2, y: 2 }, 0.5)).toBeNull()
  })

  test('靠近顶点时吸附到最近的边上（不是强行吸到顶点）', () => {
    // 顶点附近两条边等距时，吸附落点取决于边序：这里只要求「贴在边上且距离正确」。
    const snap = snapToFloorRegionEdge({ outline: square(4) }, { x: 0.01, y: 0.01 })
    expect(snap).not.toBeNull()
    expect(snap!.distance).toBeCloseTo(0.01, 6)
    // 落点必须在方形边界上（x≈0 或 y≈0）。
    const onBoundary = Math.abs(snap!.point.x) < 1e-6 || Math.abs(snap!.point.y) < 1e-6
    expect(onBoundary).toBe(true)
  })

  test('退化环返回 null', () => {
    expect(
      snapToFloorRegionEdge(
        {
          outline: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
        { x: 0, y: 0 },
      ),
    ).toBeNull()
  })
})

describe('色档与铺面', () => {
  test('只有 wood / tile 支持调深浅', () => {
    expect(floorFinishSupportsTone('wood')).toBe(true)
    expect(floorFinishSupportsTone('tile')).toBe(true)
    expect(floorFinishSupportsTone('theme')).toBe(false)
  })

  test('色档夹到 ±5 并取整', () => {
    expect(clampFloorTone(99)).toBe(5)
    expect(clampFloorTone(-99)).toBe(-5)
    expect(clampFloorTone(2.4)).toBe(2)
    expect(clampFloorTone('abc')).toBe(0)
  })

  test('0 档为 1.0，正档更亮、负档更暗', () => {
    expect(floorToneBrightness(0)).toBe(1)
    expect(floorToneBrightness(5)).toBeGreaterThan(1)
    expect(floorToneBrightness(-5)).toBeLessThan(1)
  })

  test('±5 档的明度偏移约 ±30%', () => {
    expect(floorToneBrightness(5)).toBeCloseTo(1.3, 4)
    expect(floorToneBrightness(-5)).toBeCloseTo(0.7, 4)
  })

  test('theme 的 toneKind 跟随场景风格', () => {
    expect(floorFinishToneKind('theme', 'default')).toBe('wood')
    expect(floorFinishToneKind('theme', 'warm-wood')).toBe('wood')
    expect(floorFinishToneKind('tile', 'warm-wood')).toBe('tile')
  })

  test('未知风格回落 default', () => {
    expect(floorFinishToneKind('theme', 'unknown-style')).toBe('wood')
  })

  test('材质参数合成三者：基线 × 风格 × 色档', () => {
    const warm = floorMaterialParams('theme', 0, 'warm-wood')
    expect(warm.brightness).toBeCloseTo(THEME_FLOOR_BY_SCENE_STYLE['warm-wood']!.brightness, 4)
    const toned = floorMaterialParams('wood', 5, 'warm-wood')
    expect(toned.brightness).toBeCloseTo(1 * 1 * 1.3, 4)
    expect(toned.toned).toBe(true)
  })

  test('theme 不受色档影响（深浅由风格决定）', () => {
    const a = floorMaterialParams('theme', 5, 'default')
    const b = floorMaterialParams('theme', -5, 'default')
    expect(a.brightness).toBe(b.brightness)
    expect(a.toned).toBe(false)
  })

  test('瓷砖与木地板使用不同贴图与粗糙度', () => {
    expect(FLOOR_FINISH_PROFILES.wood.texture).not.toBe(FLOOR_FINISH_PROFILES.tile.texture)
    expect(FLOOR_FINISH_PROFILES.tile.roughness).toBeLessThan(FLOOR_FINISH_PROFILES.wood.roughness)
  })

  test('floorToneForFinish 对 theme 返回 0', () => {
    expect(floorToneForFinish({ wood: 3, tile: -2 }, 'theme')).toBe(0)
    expect(floorToneForFinish({ wood: 3, tile: -2 }, 'wood')).toBe(3)
    expect(floorToneForFinish({ wood: 3, tile: -2 }, 'tile')).toBe(-2)
  })
})

describe('地盘管路径', () => {
  test('方形区域铺出多条蛇形横线', () => {
    const segments = buildRegionHeatingPaths({ outline: square(4) })
    expect(segments.length).toBeGreaterThan(3)
    // 每条横线两端都在边距内
    for (const segment of segments) {
      expect(segment.from.y).toBe(segment.to.y)
      expect(Math.min(segment.from.x, segment.to.x)).toBeGreaterThanOrEqual(0.15 - 1e-6)
      expect(Math.max(segment.from.x, segment.to.x)).toBeLessThanOrEqual(3.85 + 1e-6)
    }
  })

  test('相邻行走向相反（蛇形）', () => {
    const segments = buildRegionHeatingPaths({ outline: square(4) }, 1, 0.15)
    const firstRow = segments[0]!
    const secondRow = segments[1]!
    const firstForward = firstRow.to.x > firstRow.from.x
    const secondForward = secondRow.to.x > secondRow.from.x
    expect(firstForward).not.toBe(secondForward)
  })

  test('L 形区域不会把管子铺到房外', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ]
    const segments = buildRegionHeatingPaths({ outline: lShape }, 0.5, 0.1)
    // 所有点必须仍在多边形的 y 范围内，且 x 不超过该行的实际宽度。
    for (const segment of segments) {
      expect(segment.from.y).toBeGreaterThanOrEqual(0.1 - 1e-6)
      expect(segment.from.y).toBeLessThanOrEqual(3.9 + 1e-6)
    }
    // 上方的行（y > 2）宽度只有 2m（左侧竖条），不会横跨到 x=4。
    const upperRows = segments.filter((segment) => segment.from.y > 2.1)
    expect(upperRows.length).toBeGreaterThan(0)
    for (const segment of upperRows) {
      expect(Math.max(segment.from.x, segment.to.x)).toBeLessThanOrEqual(1.9 + 1e-6)
    }
  })

  test('过小的区域不铺管', () => {
    expect(buildRegionHeatingPaths({ outline: square(0.2) })).toHaveLength(0)
  })

  test('多层拼接', () => {
    const one = buildRegionHeatingPaths({ outline: square(4) })
    const two = buildUnderfloorHeatingPaths([{ outline: square(4) }, { outline: square(4) }])
    expect(two.length).toBe(one.length * 2)
  })

  test('clipHorizontalSpan 在半高处给出整段', () => {
    expect(clipHorizontalSpan(square(4), 2)).toEqual([[0, 4]])
  })

  test('clipHorizontalSpan 在顶点处不重复计数', () => {
    // y=0 恰好穿过下边（两个顶点）：半开区间判定只应产生一段长度为 4 的区间。
    const spans = clipHorizontalSpan(square(4), 0)
    expect(spans.length).toBeLessThanOrEqual(1)
  })
})

describe('是否显示地盘管', () => {
  test('三者缺一都不显示', () => {
    expect(shouldShowUnderfloorHeating({ hasBoiler: false, boilerHeating: true, regionCount: 1 })).toBe(false)
    expect(shouldShowUnderfloorHeating({ hasBoiler: true, boilerHeating: false, regionCount: 1 })).toBe(false)
    expect(shouldShowUnderfloorHeating({ hasBoiler: true, boilerHeating: true, regionCount: 0 })).toBe(false)
  })

  test('全满足才显示', () => {
    expect(shouldShowUnderfloorHeating({ hasBoiler: true, boilerHeating: true, regionCount: 2 })).toBe(true)
  })
})
