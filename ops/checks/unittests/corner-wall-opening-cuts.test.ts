/**
 * 转角开口切分（`cornerWallOpeningCuts`）的单测。
 *
 * 算法直接从 0.9.0 反汇编逐行复刻，所以这里锁的是**判定顺序**：
 * 顺序错了不会崩，只会「该挖的不挖」或「不该挖的挖了」——前者露出一截墙垛，
 * 后者在门洞旁边凭空开个洞。两种都很难在画面上看出是这里的问题。
 *
 * 关键约束：
 * 1. 门 + 栏杆总数 < 2 → 直接空（没有「两侧都有开口」的可能）；
 * 2. 只有**窗与栏杆**参与（门洞本身要留全，不切）；
 * 3. 必须：不同墙、共享同一墙端点、两墙近似垂直、且无第三堵墙过该点；
 * 4. `t = gap / (2 × 墙长)`，`end` 侧取 `1 − t`。
 */
// biome-ignore-all lint/suspicious/noExplicitAny: 规划形状刻意用宽松对象，避免为测试造完整类型
import { describe, expect, test } from 'bun:test'

import { cornerWallOpeningCuts } from '../../../homeos/frontend/src/studio/authoring/plan/wall-topology'

const PPM = 100
const WALL_HEIGHT = 2.8

/** 水平墙：从 (0,0) 到 (400,0)，即 4m。 */
const horizontalWall = { id: 'w-h', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, height: WALL_HEIGHT }
/** 竖直墙：从 (400,0) 到 (400,400)，即 4m；与水平墙在 (400,0) 相接。 */
const verticalWall = { id: 'w-v', start: { x: 400, y: 0 }, end: { x: 400, y: 400 }, height: WALL_HEIGHT }

/** 贴在水平墙 `end` 侧的一扇窗：t=1 表示在右端点。 */
const windowAtEnd = { id: 'win-1', wallId: 'w-h', t: 0.98, width: 0.6, sill: 0.9, height: 1.2 }
/** 贴在竖直墙 `start` 侧的一扇窗。 */
const windowAtStart = { id: 'win-2', wallId: 'w-v', t: 0.02, width: 0.6, sill: 0.9, height: 1.2 }

const plan = (overrides: Record<string, unknown> = {}) => ({
  walls: [horizontalWall, verticalWall],
  windows: [] as any[],
  railings: [] as any[],
  doors: [] as any[],
  settings: { wallHeight: WALL_HEIGHT },
  ...overrides,
})

describe('cornerWallOpeningCuts 前置条件', () => {
  test('门 + 栏杆不足 2 个时直接返回空', () => {
    const result = cornerWallOpeningCuts(plan({ windows: [windowAtEnd] }), PPM)
    expect(result.size).toBe(0)
  })

  test('比例非法时返回空（调用方先行校验）', () => {
    const result = cornerWallOpeningCuts(plan({ windows: [windowAtEnd], railings: [] }), 0)
    expect(result.size).toBe(0)
  })
})

describe('cornerWallOpeningCuts 命中集合', () => {
  test('两墙垂直且各贴一端 → 两侧都切', () => {
    const result = cornerWallOpeningCuts(plan({ windows: [windowAtEnd, windowAtStart] }), PPM)
    expect([...result.keys()].sort()).toEqual(['w-h', 'w-v'])
    expect(result.get('w-h')).toHaveLength(1)
    expect(result.get('w-v')).toHaveLength(1)
  })

  test('同一条墙上的两个开口不算转角', () => {
    const result = cornerWallOpeningCuts(
      plan({
        windows: [windowAtEnd, { ...windowAtEnd, id: 'win-3', t: 0.9 }],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })

  test('开口没贴端点时不切', () => {
    // 两扇窗都在墙中间（t=0.5），间隙远大于容差。
    const result = cornerWallOpeningCuts(
      plan({
        windows: [
          { ...windowAtEnd, t: 0.5 },
          { ...windowAtStart, t: 0.5 },
        ],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })

  test('两墙平行（不垂直）时不切', () => {
    const parallelWall = { id: 'w-p', start: { x: 400, y: 0 }, end: { x: 800, y: 0 }, height: WALL_HEIGHT }
    const result = cornerWallOpeningCuts(
      plan({
        walls: [horizontalWall, parallelWall],
        windows: [windowAtEnd, { ...windowAtEnd, id: 'win-p', wallId: 'w-p', t: 0.02 }],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })

  test('有第三堵墙也过该点时不算独立转角', () => {
    const thirdWall = { id: 'w-t', start: { x: 400, y: 0 }, end: { x: 400, y: -400 }, height: WALL_HEIGHT }
    const result = cornerWallOpeningCuts(
      plan({
        walls: [horizontalWall, verticalWall, thirdWall],
        windows: [windowAtEnd, windowAtStart],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })

  test('门不参与（门洞要留全）', () => {
    const result = cornerWallOpeningCuts(
      plan({
        doors: [
          { id: 'door-1', wallId: 'w-h', t: 0.98, width: 0.9 },
          { id: 'door-2', wallId: 'w-v', t: 0.02, width: 0.9 },
        ],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })

  test('栏杆参与切分（窗 + 栏杆 = 2 个可切开口）', () => {
    const result = cornerWallOpeningCuts(
      plan({
        windows: [windowAtEnd],
        railings: [{ id: 'rail-1', wallId: 'w-v', t: 0.02, width: 0.4 }],
      }),
      PPM,
    )
    expect([...result.keys()].sort()).toEqual(['w-h', 'w-v'])
    // 栏杆没有「上沿」（到墙顶），与窗的交集由窗决定：0.9 → 2.1。
    for (const cut of [...(result.get('w-h') || []), ...(result.get('w-v') || [])]) {
      expect(cut.sill).toBeCloseTo(0.9, 6)
      expect(cut.height).toBeCloseTo(1.2, 6)
    }
  })
})

describe('cornerWallOpeningCuts 数值', () => {
  test('t = gap / (2 × 墙长)，end 侧取 1 − t', () => {
    // 窗宽 0.6、墙长 4m、t=0.98 → 中心 3.92m，右边缘 4.22 已超墙，
    // width 收口到 min(0.6, 4) = 0.6；end 侧间隙 = (4 − 3.92) − 0.3 = −0.22 → 夹到 0。
    const result = cornerWallOpeningCuts(plan({ windows: [windowAtEnd, windowAtStart] }), PPM)
    const horizontalCut = result.get('w-h')?.[0]
    expect(horizontalCut).toBeDefined()
    // 贴的是 end 侧 → t = 1 − gapRatio = 1。
    expect(horizontalCut!.t).toBeCloseTo(1, 6)
    // 竖直墙贴的是 start 侧 → t = gapRatio = 0。
    expect(result.get('w-v')?.[0]!.t).toBeCloseTo(0, 6)
  })

  test('间隙非 0 时按比例落位', () => {
    // 容差只有 5mm，所以「贴端点但有间隙」的窗口很窄：让右边缘离端点 0.004m。
    // 中心 = 4 − 0.3 − 0.004 = 3.696 → t = 0.924
    const offsetWindow = { id: 'win-4', wallId: 'w-h', t: 0.924, width: 0.6, sill: 0.9, height: 1.2 }
    const result = cornerWallOpeningCuts(plan({ windows: [offsetWindow, windowAtStart] }), PPM)
    const cut = result.get('w-h')?.[0]
    expect(cut).toBeDefined()
    // gap = 0.004 → gapRatio = 0.004 / 8 = 0.0005，end 侧取 1 − 0.0005
    expect(cut!.t).toBeCloseTo(1 - 0.004 / (2 * 4), 6)
    expect(cut!.width).toBeCloseTo(0.6, 6)
  })

  test('竖直区间取两侧交集', () => {
    // 一侧窗台 0.9、另一侧窗台 1.4 → 交集从 1.4 起。
    const highSill = { ...windowAtStart, sill: 1.4 }
    const result = cornerWallOpeningCuts(plan({ windows: [windowAtEnd, highSill] }), PPM)
    const cut = result.get('w-h')?.[0]
    expect(cut!.sill).toBeCloseTo(1.4, 6)
    // 上沿 = min(0.9+1.2, 1.4+1.2) = 2.1 → 高度 0.7
    expect(cut!.height).toBeCloseTo(2.1 - 1.4, 6)
  })

  test('竖直区间无交集时不切', () => {
    // 一侧窗台 2.0 高 0.5（2.0–2.5），另一侧窗台 0.2 高 0.5（0.2–0.7）→ 无交集。
    const result = cornerWallOpeningCuts(
      plan({
        windows: [
          { ...windowAtEnd, sill: 2.0, height: 0.5 },
          { ...windowAtStart, sill: 0.2, height: 0.5 },
        ],
      }),
      PPM,
    )
    expect(result.size).toBe(0)
  })
})
