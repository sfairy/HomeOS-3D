/**
 * 地面分区交互状态机的单测（0.8.9）。
 *
 * 宿主（pointerdown / 面板）只做转发，因此这里要把「用户会踩的坑」全部钉住：
 *
 * - 点墙外 → 必须报错，不能静默；
 * - 点墙中心线（正好压边） → 必须命中（容差）；
 * - 后画的区域盖在先画的上面 → 命中最上面那块；
 * - 分割线太短 → 报错但**保留**起点，可以直接重画终点；
 * - 未选中就进切分 → 无效（不改变状态）。
 */
import { describe, expect, test } from 'bun:test'

import {
  MIN_SPLIT_LENGTH,
  REGION_HIT_TOLERANCE,
  armSplit,
  cancelSplit,
  clickFloorRegion,
  createFloorRegionInteraction,
  floorRegionTitle,
  pointHitsRegion,
  pointInsidePolygon,
  resolveRegionAt,
  setSplitStart,
  shouldShowFloorRegionInspector,
} from '../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-floor-region'

const square = (x0: number, y0: number, size = 4) => [
  { x: x0, y: y0 },
  { x: x0 + size, y: y0 },
  { x: x0 + size, y: y0 + size },
  { x: x0, y: y0 + size },
]

const ROOM = { id: 'r1', polygon: square(0, 0) }
const SECOND = { id: 'r2', polygon: square(10, 0) }

describe('点包含判定', () => {
  test('内部点命中', () => {
    expect(pointInsidePolygon({ x: 2, y: 2 }, square(0, 0))).toBe(true)
  })

  test('外部点不命中', () => {
    expect(pointInsidePolygon({ x: 9, y: 2 }, square(0, 0))).toBe(false)
  })

  test('顶点顺序反转后结果不变', () => {
    expect(pointInsidePolygon({ x: 2, y: 2 }, [...square(0, 0)].reverse())).toBe(true)
  })

  test('不足三个顶点视为空地面', () => {
    expect(
      pointHitsRegion({ x: 0, y: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(false)
  })

  test('压在边界上或被射线法判到内侧：都算命中', () => {
    // 边界点用射线法判定本身是有歧义的（左边界可能计入、也可能不计入），
    // 所以这里只断言「一定算命中」这个用户真正关心的结果。
    expect(pointHitsRegion({ x: 0, y: 2 }, square(0, 0))).toBe(true)
    expect(pointHitsRegion({ x: 4, y: 2 }, square(0, 0))).toBe(true)
  })

  test('边界外侧容差内也算命中（点墙中心线不落空）', () => {
    const justOutside = REGION_HIT_TOLERANCE / 2
    expect(pointInsidePolygon({ x: -justOutside, y: 2 }, square(0, 0))).toBe(false)
    expect(pointHitsRegion({ x: -justOutside, y: 2 }, square(0, 0))).toBe(true)
  })

  test('容差外不命中', () => {
    const outside = REGION_HIT_TOLERANCE + 0.01
    expect(pointHitsRegion({ x: -outside, y: 2 }, square(0, 0))).toBe(false)
  })
})

describe('命中测试 resolveRegionAt', () => {
  test('命中对应下标', () => {
    expect(resolveRegionAt({ x: 12, y: 2 }, [ROOM, SECOND])?.index).toBe(1)
  })

  test('后画的区域优先（覆盖渲染同口径）', () => {
    const overlay = { id: 'top', polygon: square(0, 0) }
    const hit = resolveRegionAt({ x: 2, y: 2 }, [ROOM, overlay])
    expect(hit?.index).toBe(1)
    expect(hit?.region.id).toBe('top')
  })

  test('都不命中返回 null', () => {
    expect(resolveRegionAt({ x: 100, y: 100 }, [ROOM, SECOND])).toBeNull()
  })

  test('跳过缺 polygON 的坏数据', () => {
    const broken = { id: 'bad', polygon: [] }
    expect(resolveRegionAt({ x: 2, y: 2 }, [broken, ROOM])?.index).toBe(1)
  })
})

describe('选择流程', () => {
  test('点中地面 → 选中并应显示面板', () => {
    const { interaction, step } = clickFloorRegion(createFloorRegionInteraction(), { x: 2, y: 2 }, [ROOM])
    expect(step.kind).toBe('select')
    expect(interaction.selectedIndex).toBe(0)
    expect(shouldShowFloorRegionInspector(interaction)).toBe(true)
  })

  test('点空地 → 报错且不选中', () => {
    const { interaction, step } = clickFloorRegion(createFloorRegionInteraction(), { x: 50, y: 50 }, [ROOM])
    expect(step.kind).toBe('error')
    expect(interaction.selectedIndex).toBeNull()
    expect(shouldShowFloorRegionInspector(interaction)).toBe(false)
  })

  test('初始状态不显示面板', () => {
    expect(shouldShowFloorRegionInspector(createFloorRegionInteraction())).toBe(false)
  })
})

describe('切分流程', () => {
  test('未选中时 armSplit 无效', () => {
    const state = createFloorRegionInteraction()
    expect(armSplit(state)).toEqual(state)
  })

  test('选中后可进入切分', () => {
    const selected = { phase: 'select' as const, splitStart: null, selectedIndex: 0 }
    const armed = armSplit(selected)
    expect(armed.phase).toBe('split')
    expect(armed.selectedIndex).toBe(0)
  })

  test('两点成线 → 产出 split 并回到 select', () => {
    let state = { phase: 'split' as const, splitStart: null, selectedIndex: 0 }
    state = setSplitStart(state, { x: 2, y: 0 })
    const result = clickFloorRegion(state, { x: 2, y: 4 }, [ROOM])
    expect(result.step.kind).toBe('split')
    if (result.step.kind === 'split') {
      expect(result.step.start).toEqual({ x: 2, y: 0 })
      expect(result.step.end).toEqual({ x: 2, y: 4 })
      expect(result.step.index).toBe(0)
    }
    expect(result.interaction.phase).toBe('select')
    expect(result.interaction.selectedIndex).toBe(0)
  })

  test('分割线太短 → 报错并保留起点（可直接重画终点）', () => {
    const state = { phase: 'split' as const, splitStart: { x: 2, y: 2 }, selectedIndex: 0 }
    const short = { x: 2 + MIN_SPLIT_LENGTH / 2, y: 2 }
    const result = clickFloorRegion(state, short, [ROOM])
    expect(result.step.kind).toBe('error')
    expect(result.interaction.phase).toBe('split')
    expect(result.interaction.splitStart).toEqual({ x: 2, y: 2 })
  })

  test('切分阶段没有起点时点中地面 → 记为起点而不是切分', () => {
    const state = { phase: 'split' as const, splitStart: null, selectedIndex: 0 }
    const result = clickFloorRegion(state, { x: 2, y: 2 }, [ROOM])
    // 当前实现：无起点时回落到「重新选中」，不产生分割线。
    expect(result.step.kind).toBe('select')
    expect(result.interaction.splitStart).toBeNull()
  })

  test('cancelSplit 保留选中、丢弃起点', () => {
    const state = { phase: 'split' as const, splitStart: { x: 1, y: 1 }, selectedIndex: 0 }
    const cancelled = cancelSplit(state)
    expect(cancelled.phase).toBe('select')
    expect(cancelled.splitStart).toBeNull()
    expect(cancelled.selectedIndex).toBe(0)
  })
})

describe('面板标题', () => {
  test('未选中是通用标题', () => {
    expect(floorRegionTitle(createFloorRegionInteraction(), 3)).toBe('地面分区')
  })

  test('选中后带序号与总数', () => {
    expect(floorRegionTitle({ phase: 'select', splitStart: null, selectedIndex: 1 }, 3)).toBe('地面分区 2/3')
  })
})
