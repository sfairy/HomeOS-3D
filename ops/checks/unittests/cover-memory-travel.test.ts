/**
 * 行程字段（0.8.9 `known_start` / `assumed_state`）的纯函数单测。
 *
 * 这些函数从 `cover-memory-client.ts` 单独切出，为的就是能在这里直接断言——
 * 它们错了不会抛异常，只会让帘布「先跳一下再动」，或者把一个推测位置当精确值。
 */
import { describe, expect, test } from 'bun:test'

import {
  isAssumedState,
  mergeTravelState,
  nextTravelState,
  observedTimestamp,
  readLastState,
  readTravelPayload,
  supportedFeatureBits,
  travelDirectionOf,
} from '../../../homeos/frontend/src/studio/runtime/cover/cover-memory-travel'

const STATES = ['open', 'closed', 'opening', 'closing']

describe('travelDirectionOf', () => {
  test('只在两个「在动」的状态上给方向', () => {
    expect(travelDirectionOf('opening')).toBe('opening')
    expect(travelDirectionOf('closing')).toBe('closing')
    expect(travelDirectionOf('open')).toBeNull()
    expect(travelDirectionOf('closed')).toBeNull()
    expect(travelDirectionOf('')).toBeNull()
  })
})

describe('nextTravelState', () => {
  test('进入 opening 时记录起点', () => {
    expect(nextTravelState({}, 'opening', 20, 1000)).toEqual({
      travel: { from: 20, at: 1000, direction: 'opening' },
      lastState: 'opening',
    })
  })

  test('同一段行程内不重复记录', () => {
    const first = nextTravelState({}, 'opening', 20, 1000)
    const second = nextTravelState(first, 'opening', 70, 3000)
    expect(second.travel).toEqual(first.travel)
  })

  test('方向翻转时刷新起点', () => {
    const opening = nextTravelState({}, 'opening', 20, 1000)
    expect(nextTravelState(opening, 'closing', 70, 5000).travel).toEqual({
      from: 70,
      at: 5000,
      direction: 'closing',
    })
  })

  test('位置未知时不记录（宁可没有起点）', () => {
    expect(nextTravelState({}, 'opening', null, 1000).travel).toBeUndefined()
  })

  test('本次无上报时用记忆里的最后一次位置', () => {
    const state = nextTravelState({ position: { position: 35 } }, 'closing', null, 2000)
    expect(state.travel?.from).toBe(35)
  })

  test('稳态不产生起点', () => {
    expect(nextTravelState({}, 'open', 40, 1000).travel).toBeUndefined()
    expect(nextTravelState({}, 'closed', 0, 1000).travel).toBeUndefined()
  })

  test('位置 0 是合法起点（不能因为 0 被当成假值丢掉）', () => {
    expect(nextTravelState({}, 'opening', 0, 1000).travel?.from).toBe(0)
  })
})

describe('mergeTravelState', () => {
  test('起点取更晚的一段', () => {
    const merged: { travel?: { from: number; at: number; direction: 'opening' } } = {
      travel: { from: 10, at: 1000, direction: 'opening' },
    }
    mergeTravelState(merged, { travel: { from: 40, at: 3000, direction: 'closing' } })
    expect(merged.travel?.from).toBe(40)
  })

  test('后到的旧快照不覆盖本地新起点', () => {
    const merged = { travel: { from: 10, at: 5000, direction: 'opening' as const } }
    mergeTravelState(merged, { travel: { from: 5, at: 1000, direction: 'opening' } })
    expect(merged.travel?.from).toBe(10)
  })

  test('上次状态直接取后到的那份', () => {
    const merged: { lastState?: string } = { lastState: 'open' }
    mergeTravelState(merged, { lastState: 'closing' })
    expect(merged.lastState).toBe('closing')
  })
})

describe('readTravelPayload', () => {
  test('三种键名都由调用方归一后传入（本函数只认结构）', () => {
    expect(readTravelPayload({ from: 10, at: 1000, direction: 'opening' })).toEqual({
      from: 10,
      at: 1000,
      direction: 'opening',
    })
  })

  test('兼容 start / position 作为起点', () => {
    expect(readTravelPayload({ start: 22, at: 1000, direction: 'closing' })?.from).toBe(22)
    expect(readTravelPayload({ position: 33, at: 1000, direction: 'opening' })?.from).toBe(33)
  })

  test('无效方向 / 越界位置 / 缺时刻一律丢弃', () => {
    expect(readTravelPayload({ from: 10, at: 1000, direction: 'sideways' })).toBeNull()
    expect(readTravelPayload({ from: 140, at: 1000, direction: 'opening' })).toBeNull()
    expect(readTravelPayload({ from: 10, direction: 'opening' })).toBeNull()
    expect(readTravelPayload(null)).toBeNull()
  })

  test('接受数字字符串（后端 JSON 里出现过）', () => {
    expect(readTravelPayload({ from: '15', at: 1000, direction: 'opening' })?.from).toBe(15)
  })
})

describe('readLastState', () => {
  test('只认开合四态，其余忽略', () => {
    expect(readLastState('CLOSING', STATES)).toBe('closing')
    expect(readLastState('idle', STATES)).toBeUndefined()
    expect(readLastState(42, STATES)).toBeUndefined()
  })
})

describe('observedTimestamp', () => {
  test('优先用 HA 的 updatedAt', () => {
    expect(observedTimestamp({ updatedAt: '2026-11-25T10:00:00.000Z' })).toBe(Date.parse('2026-11-25T10:00:00.000Z'))
  })

  test('回落到 last_updated', () => {
    expect(observedTimestamp({ last_updated: '2026-11-25T11:00:00.000Z' })).toBe(Date.parse('2026-11-25T11:00:00.000Z'))
  })

  test('坏值回落到本机时间（正数）', () => {
    expect(observedTimestamp({ updatedAt: 'not-a-date' })).toBeGreaterThan(0)
    expect(observedTimestamp({})).toBeGreaterThan(0)
  })
})

describe('supportedFeatureBits', () => {
  test('读位掩码', () => {
    expect(supportedFeatureBits({ supported_features: 240 })).toBe(240)
  })

  test('缺失 / 坏值按 0', () => {
    expect(supportedFeatureBits({})).toBe(0)
    expect(supportedFeatureBits({ supported_features: null })).toBe(0)
    expect(supportedFeatureBits({ supported_features: 'abc' })).toBe(0)
  })
})

describe('isAssumedState', () => {
  test('snake 与 camel 两种写法都认', () => {
    expect(isAssumedState({ assumed_state: true }, {})).toBe(true)
    expect(isAssumedState({}, { assumedState: true })).toBe(true)
  })

  test('没有标记时为 false', () => {
    expect(isAssumedState({}, {})).toBe(false)
    expect(isAssumedState({ assumed_state: 'yes' }, {})).toBe(false)
  })
})
