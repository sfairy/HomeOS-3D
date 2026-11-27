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
  applySplitToFloorRegions,
  beginFloorRegionSplit,
  cancelFloorRegionSplit,
  clickFloorRegionTool,
  commitSelectedFloorRegionFinish,
  currentFloorPolygons,
  floorRegionInspectorLabel,
  isAwaitingFloorRegionSplit,
  resetFloorRegionTool,
  selectedFloorRegionIndex,
} from '../../../homeos/frontend/src/studio/authoring/interaction/tools'
import type { FloorRegion } from '../../../homeos/frontend/src/studio/authoring/plan/studio-floor'

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

  test('切分失败（线在区域外）仍停在切分并可重画终点', () => {
    resetFloorRegionTool()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    beginFloorRegionSplit()
    // 分割线是**无限长直线**：让整条线落在区域外，必须两点同高（y = -5）。
    expect(clickFloorRegionTool({ x: -5, y: -5 }, SOURCE).kind).toBe('awaiting-end')
    const outside = clickFloorRegionTool({ x: -4, y: -5 }, SOURCE)
    expect(outside.kind).toBe('error')
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

/** 矩形轮廓（与 `square` 同口径，但用于已落盘分区）。 */
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

function createCommitHost(regions: FloorRegion[] = []) {
  const floor: { id: string; floorRegions: FloorRegion[]; floorFinishTones?: Record<string, number> } = {
    id: 'floor-1',
    floorRegions: regions,
  }
  let idSeed = 0
  const calls = { undo: 0, dirty: 0, notices: [] as string[] }
  return {
    floor,
    calls,
    host: {
      activeFloorId: 'floor-1',
      floors: [floor],
      createId: (prefix: string) => `${prefix}-${++idSeed}`,
      pushUndoEntry: () => {
        calls.undo += 1
      },
      markDocumentDirty: () => {
        calls.dirty += 1
      },
      notify: (message: string) => {
        calls.notices.push(message)
      },
    },
  }
}

describe('落盘：空 floorRegions 也必须能创建分区', () => {
  test('点选房间后改铺面 → 创建第一条记录（旧实现会提示「请先点选」并失败）', () => {
    resetFloorRegionTool()
    const { floor, calls, host } = createCommitHost()
    expect(clickFloorRegionTool({ x: 2, y: 2 }, SOURCE).kind).toBe('selected')
    expect(commitSelectedFloorRegionFinish(host, 'wood')).toBe(true)
    expect(floor.floorRegions).toHaveLength(1)
    expect(floor.floorRegions[0]!.finish).toBe('wood')
    expect(floor.floorRegions[0]!.outline.length).toBeGreaterThanOrEqual(3)
    expect(calls.undo).toBe(1)
    expect(calls.dirty).toBe(1)
  })

  test('默认铺面 theme 不生成无意义记录', () => {
    resetFloorRegionTool()
    const { floor, host } = createCommitHost()
    clickFloorRegionTool({ x: 2, y: 2 }, SOURCE)
    expect(commitSelectedFloorRegionFinish(host, 'theme')).toBe(false)
    expect(floor.floorRegions).toHaveLength(0)
  })
})

describe('落盘：房间减去已有分区 / 洞口', () => {
  const leftRegion: FloorRegion = { id: 'region-left', finish: 'wood', outline: rect(0, 0, 2, 4), holes: [] }

  test('在被切走一半的房间剩余区域上取铺面 → 新记录只有剩余那块（不与已有分区重叠）', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 3, y: 2 }, SOURCE, [leftRegion])
    expect(result.kind).toBe('selected')
    const { floor, host } = createCommitHost([{ ...leftRegion }])
    expect(commitSelectedFloorRegionFinish(host, 'tile')).toBe(true)
    const created = floor.floorRegions.find((region) => region.id !== 'region-left')
    expect(created).toBeDefined()
    // 剩余区域是 x∈[2,4]×[0,4]，面积 8（整间房是 16）。
    expect(Math.abs(ringAreaOf(created!.outline))).toBeCloseTo(8, 4)
    expect(created!.outline.every((vertex) => vertex.x >= 1.999)).toBe(true)
  })

  test('点已被分区覆盖的一半 → 选中的是那个分区，不新建记录', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 1, y: 2 }, SOURCE, [leftRegion])
    expect(result.kind).toBe('selected')
    const { floor, host } = createCommitHost([{ ...leftRegion }])
    expect(commitSelectedFloorRegionFinish(host, 'tile')).toBe(true)
    expect(floor.floorRegions).toHaveLength(1)
    expect(floor.floorRegions[0]!.finish).toBe('tile')
  })

  test('楼板洞口不算可铺地面（点洞口报错，不退回去生成整间房记录）', () => {
    resetFloorRegionTool()
    const source = { ...SOURCE, excludeLoops: [rect(1, 1, 3, 3)] }
    const inOpening = clickFloorRegionTool({ x: 2, y: 2 }, source)
    expect(inOpening.kind).toBe('error')
    // 洞口外仍然可选，且新建记录的轮廓会带洞。
    resetFloorRegionTool()
    expect(clickFloorRegionTool({ x: 0.5, y: 2 }, source).kind).toBe('selected')
    const { floor, host } = createCommitHost()
    expect(commitSelectedFloorRegionFinish(host, 'wood')).toBe(true)
    expect(floor.floorRegions).toHaveLength(1)
    expect(floor.floorRegions[0]!.holes.length).toBeGreaterThanOrEqual(1)
  })
  test('选中后切换楼层：改铺面被拒绝（不能把旧楼层轮廓写进新楼层）', () => {
    resetFloorRegionTool()
    expect(clickFloorRegionTool({ x: 2, y: 2 }, SOURCE, [], 'floor-a').kind).toBe('selected')
    const floorB: FloorRegion[] = []
    const { calls, host: baseHost } = createCommitHost(floorB)
    // 宿主当前在 B 层：直接构造一个新宿主，避免改共享对象。
    const host = { ...baseHost, activeFloorId: 'floor-b', floors: [{ id: 'floor-b', floorRegions: floorB }] }
    expect(commitSelectedFloorRegionFinish(host, 'wood')).toBe(false)
    expect(floorB).toHaveLength(0)
    expect(calls.undo).toBe(0)
    expect(calls.notices.some((message) => message.includes('切换楼层'))).toBe(true)
  })
})

/** 有向面积（只用于断言轮廓覆盖范围）。 */
function ringAreaOf(ring: ReadonlyArray<{ x: number; y: number }>): number {
  let total = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!
    const next = ring[(index + 1) % ring.length]!
    total += current.x * next.y - next.x * current.y
  }
  return total / 2
}

describe('落盘：已存分区优先于墙线房间', () => {
  const left: FloorRegion = { id: 'region-left', finish: 'theme', outline: rect(0, 0, 2, 4), holes: [] }
  const right: FloorRegion = { id: 'region-right', finish: 'tile', outline: rect(2, 0, 4, 4), holes: [] }

  test('点子块选中该子块，而不是整块房间', () => {
    resetFloorRegionTool()
    const result = clickFloorRegionTool({ x: 1, y: 2 }, SOURCE, [left, right])
    expect(result.kind).toBe('selected')
    expect(result.kind === 'selected' && result.label).toBe('地面分区 1/2')

    const { floor, host } = createCommitHost([{ ...left }, { ...right }])
    expect(commitSelectedFloorRegionFinish(host, 'wood')).toBe(true)
    expect(floor.floorRegions.find((region) => region.id === 'region-left')?.finish).toBe('wood')
    // 邻居不受影响（旧实现按下标 0 写，选中右边那块时会改错对象）。
    expect(floor.floorRegions.find((region) => region.id === 'region-right')?.finish).toBe('tile')
  })

  test('切分已存子块：按 id 替换，其他分区保持原样', () => {
    const pieces = {
      left: { outline: rect(0, 0, 1, 4), holes: [] },
      right: { outline: rect(1, 0, 2, 4), holes: [] },
    }
    const next = applySplitToFloorRegions(
      [left, right],
      { recordId: 'region-left', area: left },
      pieces,
      (prefix) => `${prefix}-new`,
    )
    expect(next).toHaveLength(3)
    expect(next.map((region) => region.id)).toEqual(['floor-region-new', 'floor-region-new', 'region-right'])
    expect(next[0]!.finish).toBe('theme')
    expect(next[2]).toBe(right)
  })

  test('切分未落盘房间：两块追加为新记录（不能因为 0 号为空就静默失败）', () => {
    const pieces = {
      left: { outline: rect(0, 0, 2, 4), holes: [] },
      right: { outline: rect(2, 0, 4, 4), holes: [] },
    }
    const next = applySplitToFloorRegions(
      [],
      { recordId: null, area: { finish: 'theme' } },
      pieces,
      (prefix) => `${prefix}-new`,
    )
    expect(next).toHaveLength(2)
    expect(next[0]!.outline).toEqual(pieces.left.outline)
    expect(next[1]!.outline).toEqual(pieces.right.outline)
  })

  test('切分沿用原分区的铺面', () => {
    const pieces = {
      left: { outline: rect(0, 0, 1, 4), holes: [] },
      right: { outline: rect(1, 0, 2, 4), holes: [] },
    }
    const next = applySplitToFloorRegions(
      [left],
      { recordId: 'region-left', area: left },
      pieces,
      (prefix) => `${prefix}-new`,
    )
    expect(next.every((region) => region.finish === left.finish)).toBe(true)
  })
})
