/**
 * 「地面分区」工具粘合层的单测（0.8.9）。
 *
 * 这里验证的是**端到端接线**，而不是几何细节（几何另有 `floor-region-geometry.test.ts`）：
 *
 * - 墙线 → 闭合地面：没有闭合墙体时必须得到 0 块地面（否则可以「选中空气」）；
 * - 点选 → 下标正确；
 * - 分割：先进入切分、再点两下 → 必须产出左右两块；
 * - 换工具 `reset` 后不残留分割线。
 */
import { describe, expect, test } from 'bun:test'

import {
  beginFloorRegionSplit,
  cancelFloorRegionSplit,
  clickFloorRegionTool,
  currentFloorPolygons,
  floorRegionInspectorLabel,
  isAwaitingFloorRegionSplit,
  resetFloorRegionTool,
  selectedFloorRegionIndex,
} from '../../../homeos/frontend/src/studio/authoring/interaction/tools'

/** 一圈闭合矩形墙（4m × 4m），坐标是平面米制。 */
const CLOSED_WALLS = [
  { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
  { start: { x: 4, y: 0 }, end: { x: 4, y: 4 } },
  { start: { x: 4, y: 4 }, end: { x: 0, y: 4 } },
  { start: { x: 0, y: 4 }, end: { x: 0, y: 0 } },
]

/** 一圈没闭合的墙（缺最后一条边）。 */
const OPEN_WALLS = CLOSED_WALLS.slice(0, 3)

const SOURCE = { walls: CLOSED_WALLS, mergeTolerance: 0.05 }

describe('墙线 → 闭合地面', () => {
  test('闭合墙得到一块地面', () => {
    expect(currentFloorPolygons(SOURCE).length).toBe(1)
  })

  test('未闭合墙得到 0 块（不能选中空气）', () => {
    expect(currentFloorPolygons({ walls: OPEN_WALLS, mergeTolerance: 0.05 }).length).toBe(0)
  })

  test('坏数据被过滤掉（少于三点 / 非数值）', () => {
    const polygons = currentFloorPolygons({ walls: CLOSED_WALLS, mergeTolerance: 0.05 })
    for (const polygon of polygons) {
      expect(polygon.length).toBeGreaterThanOrEqual(3)
      for (const vertex of polygon) {
        expect(Number.isFinite(vertex.x)).toBe(true)
        expect(Number.isFinite(vertex.y)).toBe(true)
      }
    }
  })
})

describe('点选', () => {
  test('点室内 → 选中并给出标题', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    expect(result.kind).toBe('selected')
    expect(selectedFloorRegionIndex()).toBe(0)
    expect(floorRegionInspectorLabel(1)).toBe('地面分区 1/1')
  })

  test('点室外 → 报错且不选中', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 40, y: 40 }, SOURCE)
    expect(result.kind).toBe('error')
    expect(selectedFloorRegionIndex()).toBeNull()
    expect(floorRegionInspectorLabel(1)).toBeNull()
  })

  test('没有闭合墙时报错（不是静默）', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 2, y: 2 }, { walls: OPEN_WALLS, mergeTolerance: 0.05 })
    expect(result.kind).toBe('error')
  })
})

describe('切分', () => {
  test('未选中时不能进入切分', () => {
    resetFloorRegionTool()
    expect(beginFloorRegionSplit()).toBe(false)
  })

  test('选中后进入切分 → 两点产出左右两块', () => {
    resetFloorRegionTool()
    expect(clickFloorRegionTool({ x: 2, y: 2 }, SOURCE).kind).toBe('selected')
    expect(beginFloorRegionSplit()).toBe(true)
    expect(isAwaitingFloorRegionSplit()).toBe(true)

    const first = clickFloorRegionTool({ x: 2, y: 0.2 }, SOURCE)
    expect(first.kind).toBe('awaiting-end')

    const second = clickFloorRegionTool({ x: 2, y: 3.8 }, SOURCE)
    expect(second.kind).toBe('split')
    if (second.kind === 'split') {
      expect(second.pieces.left.outline.length).toBeGreaterThanOrEqual(3)
      expect(second.pieces.right.outline.length).toBeGreaterThanOrEqual(3)
    }
  })

  test('分割线太短 → 报错，仍停在切分（可重画终点）', () => {
    resetFloorRegionTool()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    beginFloorRegionSplit()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    const tooShort = clickFloorRegionTool({ x: 2.05, y: 2 }, SOURCE)
    expect(tooShort.kind).toBe('error')
    expect(isAwaitingFloorRegionSplit()).toBe(true)
  })

  test('取消切分后回到选择态并保留选中', () => {
    resetFloorRegionTool()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    beginFloorRegionSplit()
    cancelFloorRegionSplit()
    expect(isAwaitingFloorRegionSplit()).toBe(false)
    expect(selectedFloorRegionIndex()).toBe(0)
  })

  test('reset 后不残留分割线', () => {
    resetFloorRegionTool()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    beginFloorRegionSplit()
    resetFloorRegionTool()
    expect(isAwaitingFloorRegionSplit()).toBe(false)
    expect(selectedFloorRegionIndex()).toBeNull()
  })
})
