/**
 * 数量统计（开合设备）的单测（0.8.9）。
 *
 * 公告口径：「可把所选窗帘、车库门、开窗器和晾衣架等开合设备纳入同一组」，
 * 且**未完全关闭计入数量**。这里钉住三件容易错的事：
 *
 * 1. `opening` / `closing` 算「开」——用户问「几扇开着」，正在关的那扇还没关完；
 * 2. 状态字符串优先，只有状态不可用才回落到 `current_position`；
 * 3. `assumed_state`（HA 标记的推测态）不算异常 —— 否则无位置回传的设备永远统计不出来。
 */
import { describe, expect, test } from 'bun:test'

import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
} from '../../../homeos/frontend/src/studio/app/renderer/controls/light-statistics-runtime'

const cover = (entityId = 'cover.window', extra: Record<string, unknown> = {}) => ({
  entityId,
  domain: 'cover',
  name: '窗户',
  ...extra,
})

describe('开合设备的支持判定', () => {
  test('cover 域受支持，文案说明「未完全关闭计入」', () => {
    const support = lightStatisticsEntitySupport(cover())
    expect(support.supported).toBe(true)
    expect(support.message).toContain('开合状态')
  })

  test('从 entityId 推断域（未显式给 domain）', () => {
    expect(lightStatisticsEntitySupport({ entityId: 'cover.garage' }).supported).toBe(true)
  })
})

describe('开合设备的状态判定', () => {
  test('open / opening / closing 都算开', () => {
    for (const state of ['open', 'opening', 'closing', 'opened']) {
      expect(lightStatisticsEntityStateStatus(cover(), { state })).toBe('on')
    }
  })

  test('closed 算关', () => {
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'closed' })).toBe('off')
  })

  test('unavailable / unknown 算异常', () => {
    for (const state of ['unavailable', 'unknown']) {
      expect(lightStatisticsEntityStateStatus(cover(), { state })).toBe('abnormal')
    }
  })

  test('disabled / missing 算异常（不是关）', () => {
    for (const state of ['disabled', 'missing']) {
      expect(lightStatisticsEntityStateStatus(cover(), { state })).toBe('abnormal')
    }
  })

  test('状态不可用时回落到 current_position', () => {
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'idle', attributes: { current_position: 40 } })).toBe(
      'on',
    )
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'idle', attributes: { current_position: 0 } })).toBe(
      'off',
    )
  })

  test('支持 camelCase 的 currentPosition（HA 两种写法都有）', () => {
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'idle', attributes: { currentPosition: 10 } })).toBe('on')
  })

  test('assumed_state 不影响判定（推测态仍可用）', () => {
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'open', attributes: { assumed_state: true } })).toBe('on')
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'closed', attributes: { assumed_state: true } })).toBe(
      'off',
    )
  })

  test('状态与位置都不可判断时算异常', () => {
    expect(lightStatisticsEntityStateStatus(cover(), { state: 'idle' })).toBe('abnormal')
  })

  test('车库门 / 开窗器 / 晾衣架走同一套判定', () => {
    for (const entityId of ['cover.garage_door', 'cover.window_opener', 'cover.airer']) {
      expect(lightStatisticsEntityStateStatus(cover(entityId), { state: 'open' })).toBe('on')
      expect(lightStatisticsEntityStateStatus(cover(entityId), { state: 'closed' })).toBe('off')
    }
  })
})

describe('不影响既有域', () => {
  test('灯仍然是 on/off 语义', () => {
    const light = { entityId: 'light.a', domain: 'light' }
    expect(lightStatisticsEntityStateStatus(light, { state: 'on' })).toBe('on')
    expect(lightStatisticsEntityStateStatus(light, { state: 'off' })).toBe('off')
  })

  test('switch 仍然是 on/off 语义', () => {
    const toggle = { entityId: 'switch.a', domain: 'switch' }
    expect(lightStatisticsEntityStateStatus(toggle, { state: 'on' })).toBe('on')
  })

  test('cover 不再落到「按开启/关闭」的通用文案', () => {
    expect(lightStatisticsEntitySupport(cover()).message).not.toBe('按开启/关闭状态统计。')
  })
})
