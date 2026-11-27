/**
 * 地面色档落盘（`commitFloorRegionTone`）的单测。
 *
 * 这条是 0.9.0「±20 数字步进」的前端落点：范围夹取、`0` 删键、同值不写历史，
 * 三条里任何一条错了都只表现为「拖到 25 变成 20 但撤销栈多一条」这种无声问题。
 */
import { describe, expect, test } from 'bun:test'

import { commitFloorRegionTone } from '../../../homeos/frontend/src/studio/authoring/interaction/tools'

const createHost = (tones?: Record<string, number>) => {
  const floor: { id: string; floorFinishTones?: Partial<Record<'wood' | 'tile', number>> } = {
    id: 'floor-1',
    floorFinishTones: tones ? { ...tones } : undefined,
  }
  const calls = { undo: 0, dirty: 0, notices: [] as string[] }
  return {
    floor,
    calls,
    host: {
      activeFloorId: 'floor-1',
      floors: [floor],
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

describe('commitFloorRegionTone', () => {
  test('写入色档会进撤销栈并标脏', () => {
    const { floor, calls, host } = createHost()
    expect(commitFloorRegionTone(host, 'wood', 12)).toBe(true)
    expect(floor.floorFinishTones).toEqual({ wood: 12 })
    expect(calls.undo).toBe(1)
    expect(calls.dirty).toBe(1)
  })

  test('±20 之外夹取', () => {
    const { floor, host } = createHost()
    commitFloorRegionTone(host, 'tile', 99)
    expect(floor.floorFinishTones).toEqual({ tile: 20 })
    commitFloorRegionTone(host, 'tile', -99)
    expect(floor.floorFinishTones).toEqual({ tile: -20 })
  })

  test('0 档删键而不是写 0', () => {
    const { floor, host } = createHost({ wood: 7 })
    commitFloorRegionTone(host, 'wood', 0)
    expect(floor.floorFinishTones).toEqual({})
  })

  test('同值不写历史', () => {
    const { calls, host } = createHost({ wood: 5 })
    expect(commitFloorRegionTone(host, 'wood', 5)).toBe(false)
    expect(calls.undo).toBe(0)
    expect(calls.dirty).toBe(0)
  })

  test('找不到当前楼层时提示且不写', () => {
    const { calls, host } = createHost()
    const staleHost = { ...host, activeFloorId: 'missing' }
    expect(commitFloorRegionTone(staleHost, 'wood', 3)).toBe(false)
    expect(calls.notices.length).toBe(1)
    expect(calls.undo).toBe(0)
  })
})
