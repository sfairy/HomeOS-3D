/**
 * 地面分区渲染规格的单测（0.8.9）。
 *
 * 覆盖三处「算错也不报错、但画面明显不对」的地方：
 *
 * - 没有手工分区时必须返回 `null`（返回空数组会让地面消失）；
 * - 色档只作用在支持调深浅的铺面上（`theme` 调档应当无效）；
 * - 盘管必须跟着分区走：切分后段数变多，且不会越出分区包围盒。
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveFloorRegionPlates,
  resolveHeatingPolylines,
  sharedToneKindFor,
  shouldRenderHeating,
} from '../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-floor-render'

/** 一块 4m × 4m 的正方形地面（`{x, y}` 平面坐标）。 */
const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
]

const toWorld = (point: { x: number; y: number }) => ({ x: point.x, z: point.y })

function floorRecord(overrides: Record<string, unknown> = {}) {
  return {
    floorRegions: [{ id: 'r1', finish: 'wood', outline: SQUARE, holes: [] }],
    floorFinishTones: { wood: 0, tile: 0 },
    underfloorHeating: false,
    ...overrides,
  }
}

describe('分区板解析', () => {
  test('没有分区 → null（调用方保留整板）', () => {
    expect(resolveFloorRegionPlates({ floorRegions: [] })).toBeNull()
    expect(resolveFloorRegionPlates({})).toBeNull()
    expect(resolveFloorRegionPlates(null)).toBeNull()
  })

  test('有分区 → 一区一块，铺面原样带出', () => {
    const plates = resolveFloorRegionPlates(floorRecord())
    expect(plates?.length).toBe(1)
    expect(plates?.[0]?.finish).toBe('wood')
    expect(plates?.[0]?.outline.length).toBe(4)
  })

  test('坏分区被丢弃而不是画成空板', () => {
    const plates = resolveFloorRegionPlates(
      floorRecord({ floorRegions: [{ id: 'bad', finish: 'wood', outline: [] }, ...floorRecord().floorRegions] }),
    )
    expect(plates?.length).toBe(1)
    expect(plates?.[0]?.outline.length).toBe(4)
  })

  test('多块分区各用各的铺面', () => {
    const plates = resolveFloorRegionPlates({
      floorRegions: [
        { id: 'a', finish: 'wood', outline: SQUARE, holes: [] },
        { id: 'b', finish: 'tile', outline: SQUARE.map((p) => ({ x: p.x + 5, y: p.y })), holes: [] },
      ],
    })
    expect(plates?.map((plate) => plate.finish)).toEqual(['wood', 'tile'])
  })
})

describe('色档与材质', () => {
  test('wood 铺面吃 wood 色档：正档更亮', () => {
    const base = resolveFloorRegionPlates(floorRecord({ floorFinishTones: { wood: 0, tile: 0 } }))![0]!
    const lighter = resolveFloorRegionPlates(floorRecord({ floorFinishTones: { wood: 4, tile: 0 } }))![0]!
    expect(lighter.params.brightness).toBeGreaterThan(base.params.brightness)
    expect(lighter.params.toned).toBe(true)
  })

  test('负档更暗', () => {
    const base = resolveFloorRegionPlates(floorRecord())![0]!
    const darker = resolveFloorRegionPlates(floorRecord({ floorFinishTones: { wood: -4, tile: 0 } }))![0]!
    expect(darker.params.brightness).toBeLessThan(base.params.brightness)
  })

  test('tile 分区不吃 wood 色档（各档独立）', () => {
    const plate = resolveFloorRegionPlates(
      floorRecord({
        floorRegions: [{ id: 't', finish: 'tile', outline: SQUARE, holes: [] }],
        floorFinishTones: { wood: 5, tile: 0 },
      }),
    )![0]!
    expect(plate.params.toned).toBe(false)
  })

  test('theme 铺面调档无效（不支持的铺面忽略色档）', () => {
    const plate = resolveFloorRegionPlates(
      floorRecord({
        floorRegions: [{ id: 'th', finish: 'theme', outline: SQUARE, holes: [] }],
        floorFinishTones: { wood: 5, tile: 5 },
      }),
    )![0]!
    expect(plate.params.toned).toBe(false)
  })

  test('共享色档键：同一层只有一块 wood 时只报 wood', () => {
    const plates = resolveFloorRegionPlates(floorRecord())!
    expect(sharedToneKindFor(plates)).toEqual(['wood'])
  })
})

describe('地暖盘管', () => {
  test('没有分区 → 无折线', () => {
    expect(resolveHeatingPolylines({ floorRegions: [] }, toWorld)).toEqual([])
  })

  test('一块 4m 分区 → 多条蛇形段，且都在分区范围内', () => {
    const polylines = resolveHeatingPolylines(floorRecord(), toWorld)
    expect(polylines.length).toBeGreaterThan(1)
    for (const polyline of polylines) {
      for (const point of polyline.points) {
        expect(point.x).toBeGreaterThanOrEqual(-0.001)
        expect(point.x).toBeLessThanOrEqual(4.001)
        expect(point.z).toBeGreaterThanOrEqual(-0.001)
        expect(point.z).toBeLessThanOrEqual(4.001)
      }
    }
  })

  test('切分后各分区都有自己的盘管（不是只画左半边）', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ]
    const right = [
      { x: 2, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
    ]
    const polylines = resolveHeatingPolylines(
      floorRecord({
        floorRegions: [
          { id: 'l', finish: 'wood', outline: left, holes: [] },
          { id: 'r', finish: 'wood', outline: right, holes: [] },
        ],
      }),
      toWorld,
    )
    // 两块分区各自铺管：必须有落在右半区（x ≥ 2）的段，否则「只画了左半边」。
    const hasRightSide = polylines.some((polyline) => polyline.points.some((point) => point.x >= 2))
    const hasLeftSide = polylines.some((polyline) => polyline.points.some((point) => point.x <= 2))
    expect(hasRightSide).toBe(true)
    expect(hasLeftSide).toBe(true)
  })

  test('显示条件：开关 + 有折线，缺一不可', () => {
    expect(shouldRenderHeating({ underfloorHeating: true }, 3)).toBe(true)
    expect(shouldRenderHeating({ underfloorHeating: false }, 3)).toBe(false)
    expect(shouldRenderHeating({ underfloorHeating: true }, 0)).toBe(false)
    expect(shouldRenderHeating({}, 3)).toBe(false)
  })
})
