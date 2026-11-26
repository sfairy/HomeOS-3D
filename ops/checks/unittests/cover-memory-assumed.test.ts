/**
 * 窗帘姿态记忆的 0.8.9 增量：`assumed_state` 与行程起点（`known_start`）。
 *
 * 两件都不是「新功能」，而是修一类**看不见的错**：
 *
 * 1. 红外/射频控制的电机上报的是推测位置（HA 标 `assumed_state`）。把它当成精确值，
 *    补间会算出一个看起来专业、实际偏几十厘米的位置；
 * 2. 行程开始时的「最后上报位置」可能已经过时几百毫秒。没有起点，补间只能从中途开始，
 *    帘布会先跳一下再动。
 *
 * 这里钉住的是**不变量**：推测标记会被带过、起点只在状态跃迁时记录一次、起点未知时不猜。
 */
import { describe, expect, test } from 'bun:test'

import {
  mergeCoverMemoryEntries,
  normalizeCoverMemoryEntry,
  observeCoverMemoryState,
  type CoverMemoryEntry,
} from '../../../homeos/frontend/src/studio/runtime/cover/cover-memory-client'

const ENTITY = 'cover.living_room'

/** 造一帧 HA 状态变化。 */
function change(state: string, attributes: Record<string, unknown> = {}, updatedAt = '2026-11-25T10:00:00.000Z') {
  return {
    entityId: ENTITY,
    newState: { entityId: ENTITY, state, attributes, updatedAt },
  }
}

describe('assumed_state', () => {
  test('带标记的读数会被带上 assumed', () => {
    const entry = observeCoverMemoryState(undefined, change('open', { current_position: 60, assumed_state: true }))
    expect(entry?.position?.position).toBe(60)
    expect(entry?.position?.assumed).toBe(true)
  })

  test('不带标记的读数没有 assumed 字段（不写 false，保持条目精简）', () => {
    const entry = observeCoverMemoryState(undefined, change('open', { current_position: 60 }))
    expect(entry?.position?.assumed).toBeUndefined()
  })

  test('推测读数仍会更新显示（不能因为不确定就停在旧值）', () => {
    const first = observeCoverMemoryState(undefined, change('open', { current_position: 10 }))
    const second = observeCoverMemoryState(
      first,
      change('open', { current_position: 80, assumed_state: true }, '2026-11-25T10:00:05.000Z'),
    )
    expect(second?.position?.position).toBe(80)
    expect(second?.position?.assumed).toBe(true)
  })

  test('camelCase 的 assumedState 也认', () => {
    const entry = observeCoverMemoryState(undefined, {
      entityId: ENTITY,
      newState: { state: 'open', assumedState: true, attributes: { current_position: 40 } },
    })
    expect(entry?.position?.assumed).toBe(true)
  })

  test('归一化会带过后端返回的 assumed', () => {
    const entry = normalizeCoverMemoryEntry({ position: { position: 30, at: 1000, assumed: true } })
    expect(entry?.position?.assumed).toBe(true)
  })
})

describe('行程起点（known_start）', () => {
  test('刚进入 opening 时记录起点', () => {
    const entry = observeCoverMemoryState(undefined, change('opening', { current_position: 20 }))
    expect(entry?.travel).toEqual({
      from: 20,
      at: Date.parse('2026-11-25T10:00:00.000Z'),
      direction: 'opening',
    })
  })

  test('同一段行程里不重复记录（起点保持第一次）', () => {
    const first = observeCoverMemoryState(undefined, change('opening', { current_position: 20 }))
    const second = observeCoverMemoryState(
      first,
      change('opening', { current_position: 55 }, '2026-11-25T10:00:02.000Z'),
    )
    expect(second?.travel?.from).toBe(20)
    expect(second?.travel?.at).toBe(Date.parse('2026-11-25T10:00:00.000Z'))
  })

  test('方向翻转时记录新的起点', () => {
    const opening = observeCoverMemoryState(undefined, change('opening', { current_position: 20 }))
    const closing = observeCoverMemoryState(
      opening,
      change('closing', { current_position: 70 }, '2026-11-25T10:00:03.000Z'),
    )
    expect(closing?.travel?.direction).toBe('closing')
    expect(closing?.travel?.from).toBe(70)
  })

  test('位置未知时不猜起点', () => {
    const entry = observeCoverMemoryState(undefined, change('opening', {}))
    expect(entry?.travel).toBeUndefined()
  })

  test('没有本次上报时用记忆里的最后一次位置作起点', () => {
    const known = observeCoverMemoryState(undefined, change('open', { current_position: 35 }))
    const entry = observeCoverMemoryState(known, change('closing', {}, '2026-11-25T10:00:09.000Z'))
    expect(entry?.travel?.from).toBe(35)
  })

  test('进入 open / closed 不产生行程起点', () => {
    expect(observeCoverMemoryState(undefined, change('open', { current_position: 30 }))?.travel).toBeUndefined()
    expect(observeCoverMemoryState(undefined, change('closed', { current_position: 0 }))?.travel).toBeUndefined()
  })

  test('归一化认后端三种写法：travel / knownStart / known_start', () => {
    for (const key of ['travel', 'knownStart', 'known_start']) {
      const entry = normalizeCoverMemoryEntry({
        position: { position: 10, at: 1000 },
        [key]: { from: 10, at: 1000, direction: 'opening' },
      })
      expect(entry?.travel).toEqual({ from: 10, at: 1000, direction: 'opening' })
    }
  })

  test('归一化丢弃无效方向', () => {
    const entry = normalizeCoverMemoryEntry({
      position: { position: 10, at: 1000 },
      travel: { from: 10, at: 1000, direction: 'sideways' },
    })
    expect(entry?.travel).toBeUndefined()
  })
})

describe('合并', () => {
  test('行程起点取更晚的一段', () => {
    const older: CoverMemoryEntry = {
      position: { position: 10, at: 1000 },
      estimates: {},
      travel: { from: 10, at: 1000, direction: 'opening' },
    }
    const newer: CoverMemoryEntry = {
      position: { position: 40, at: 3000 },
      estimates: {},
      travel: { from: 40, at: 3000, direction: 'closing' },
    }
    expect(mergeCoverMemoryEntries(older, newer)?.travel?.from).toBe(40)
  })

  test('后到的快照不会抹掉本地更新的起点', () => {
    const local: CoverMemoryEntry = {
      position: { position: 10, at: 5000 },
      estimates: {},
      travel: { from: 10, at: 5000, direction: 'opening' },
    }
    const snapshot: CoverMemoryEntry = {
      position: { position: 5, at: 1000 },
      estimates: {},
      travel: { from: 5, at: 1000, direction: 'opening' },
    }
    expect(mergeCoverMemoryEntries(local, snapshot)?.travel?.from).toBe(10)
  })
})
