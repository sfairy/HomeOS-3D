/**
 * 墙体拓扑校验与庭院围合多边形的单测。
 *
 * 这两组都是「算错了不会抛异常」的纯几何：
 * - 拓扑校验漏判 → 新墙把已有门洞劈开，保存后才发现；
 * - 围合判断放宽 → 伸到墙外的庭院铺装被当成都被围住，把室外地面挖成洞。
 */
import { describe, expect, test } from 'bun:test'

import { enclosedCourtyardPolygons } from '../../../homeos/frontend/src/studio/authoring/plan/courtyard-drawing'
import {
  calibrationPlacementError,
  wallTopologyPlacementError,
} from '../../../homeos/frontend/src/studio/authoring/plan/wall-topology'

const PPM = 100

/** 一段水平墙：从 (0,0) 到 (400,0)，即 4m 长。 */
const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 0.2, height: 2.8 }

describe('wallTopologyPlacementError', () => {
  test('没有新增墙时直接放行', () => {
    expect(wallTopologyPlacementError({}, { walls: [wall] }, PPM, [])).toBe('')
  })

  test('新墙穿过已有门洞时报门/窗/栏杆文案', () => {
    const nextPlan = {
      walls: [wall],
      doors: [{ wallId: 'w1', t: 0.5, width: 0.9, sill: 0, height: 2.1 }],
    }
    // 竖直新墙正好穿过门洞中心 (200, 0)
    const newWall = { id: 'w2', start: { x: 200, y: -100 }, end: { x: 200, y: 100 } }
    expect(wallTopologyPlacementError({}, nextPlan, PPM, [newWall])).toBe(
      '新墙体穿过已有门、窗或栏杆的开口，请调整接墙位置。',
    )
  })

  test('新墙落在门洞之外不报错', () => {
    const nextPlan = {
      walls: [wall],
      doors: [{ wallId: 'w1', t: 0.5, width: 0.9, sill: 0, height: 2.1 }],
    }
    const newWall = { id: 'w2', start: { x: 20, y: -100 }, end: { x: 20, y: 100 } }
    expect(wallTopologyPlacementError({}, nextPlan, PPM, [newWall])).toBe('')
  })

  test('窗前的新墙若与窗的竖向区间不重叠则不报错', () => {
    const nextPlan = {
      walls: [wall],
      windows: [{ wallId: 'w1', t: 0.5, width: 1.2, sill: 2.2, height: 0.5 }],
    }
    // 新墙只有 1.2m 高，够不到 2.2m 起的窗
    const newWall = { id: 'w2', start: { x: 200, y: -100 }, end: { x: 200, y: 100 }, height: 1.2 }
    expect(wallTopologyPlacementError({}, nextPlan, PPM, [newWall])).toBe('')
  })

  test('新墙穿过排气扇洞口时报排气扇文案', () => {
    const nextPlan = {
      walls: [wall],
      items: [{ type: 'exhaust-fan', wallId: 'w1', t: 0.25, width: 0.3, sill: 1.6, height: 0.3 }],
    }
    const newWall = { id: 'w2', start: { x: 100, y: -100 }, end: { x: 100, y: 100 } }
    expect(wallTopologyPlacementError({}, nextPlan, PPM, [newWall])).toBe('新墙体穿过已有排气扇洞口，请调整接墙位置。')
  })

  test('比例非法时放行（由调用方先行校验）', () => {
    expect(
      wallTopologyPlacementError({}, { walls: [wall] }, 0, [{ id: 'w2', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }]),
    ).toBe('')
  })
})

describe('calibrationPlacementError', () => {
  test('庭院门比墙段还宽时报「新比例下…」', () => {
    const nextPlan = {
      walls: [wall], // 4m
      items: [{ type: 'courtyard-gate', wallId: 'w1', width: 4.2, t: 0.5 }],
    }
    expect(calibrationPlacementError({}, nextPlan, PPM)).toBe(
      '新比例下，这一段围挡放不下原有庭院门，请先移动庭院门或加长直段。',
    )
  })

  test('庭院门放得下时不报错', () => {
    const nextPlan = {
      walls: [wall],
      items: [{ type: 'courtyard-gate', wallId: 'w1', width: 1.2, t: 0.5 }],
    }
    expect(calibrationPlacementError({}, nextPlan, PPM)).toBe('')
  })

  test('墙上没有门时不受影响', () => {
    expect(calibrationPlacementError({}, { walls: [wall] }, PPM)).toBe('')
  })
})

describe('enclosedCourtyardPolygons', () => {
  const wallLoop = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ]

  // 绘图点存的是**归一化 0–1**，`drawingPlanPoints` 会乘 `width/depth`（米）再乘
  // `pixelsPerMeter`，所以 fixture 必须给 width/depth，否则会得到 NaN。
  const courtyardArea = (points: Array<{ x: number; y: number }>, holes: unknown[] = []) => ({
    type: 'courtyard-area',
    x: 0,
    y: 0,
    rotation: 0,
    width: 4,
    depth: 4,
    drawing: { points, holes },
  })

  test('全部顶点都在墙环内才返回', () => {
    const insideArea = courtyardArea([
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.5, y: 0.5 },
    ])
    const outsideArea = courtyardArea([
      { x: 0.25, y: 0.25 },
      { x: 1.25, y: 0.25 },
      { x: 1.25, y: 0.5 },
    ])
    const result = enclosedCourtyardPolygons([insideArea, outsideArea], [wallLoop], PPM)
    expect(result).toHaveLength(1)
    expect(result[0]!.outline).toHaveLength(3)
    // 归一化 0.25 × 4m × 100px/m = 100px
    expect(result[0]!.outline[0]).toEqual({ x: 100, y: 100 })
    expect(result[0]!.holes).toEqual([])
  })

  test('没有墙环时一律不返回', () => {
    const area = courtyardArea([
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.5, y: 0.5 },
    ])
    expect(enclosedCourtyardPolygons([area], [], PPM)).toEqual([])
  })

  test('非 courtyard-area 直接跳过', () => {
    const path = {
      type: 'courtyard-path',
      width: 4,
      depth: 4,
      drawing: {
        points: [
          { x: 0.25, y: 0.25 },
          { x: 0.5, y: 0.5 },
        ],
      },
    }
    expect(enclosedCourtyardPolygons([path], [wallLoop], PPM)).toEqual([])
  })

  test('合法洞被保留，非法洞被丢弃', () => {
    const area = courtyardArea(
      [
        { x: 0.125, y: 0.125 },
        { x: 0.875, y: 0.125 },
        { x: 0.875, y: 0.875 },
        { x: 0.125, y: 0.875 },
      ],
      [
        [
          { x: 0.3, y: 0.3 },
          { x: 0.4, y: 0.3 },
          { x: 0.4, y: 0.4 },
          { x: 0.3, y: 0.4 },
        ],
        // 超出外环：应被 validHole 丢掉
        [
          { x: 0.75, y: 0.75 },
          { x: 1.25, y: 0.75 },
          { x: 1.25, y: 1.25 },
          { x: 0.75, y: 1.25 },
        ],
      ],
    )
    const result = enclosedCourtyardPolygons([area], [wallLoop], PPM)
    expect(result).toHaveLength(1)
    expect(result[0]!.holes).toHaveLength(1)
  })
})
