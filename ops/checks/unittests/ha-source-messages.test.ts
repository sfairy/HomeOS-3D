/**
 * HA 来源变化文案映射的单测。
 *
 * 这条的价值在于「不要把网络故障误报成来源变化」——反过来也一样：
 * 来源变了却报「请求失败」，用户会一直点重试而不是重开选择器。
 */
import { describe, expect, test } from 'bun:test'

import {
  HA_SOURCE_CHANGED_CATALOG_MESSAGE,
  HA_SOURCE_CHANGED_PICKER_MESSAGE,
  haSourceChangedMessage,
  isHaSourceChangedError,
} from '../../../homeos/frontend/src/kernel/ha-source-messages'

/** 造一个带 `apiErrorCode` 的错误（与 axios / fetch 包装后的形状一致）。 */
const apiError = (code: string) => {
  const error = new Error('boom') as Error & { response?: { data?: { apiErrorCode?: string } } }
  error.response = { data: { apiErrorCode: code } }
  return error
}

describe('isHaSourceChangedError', () => {
  test('只有 HA_SOURCE_CHANGED 命中', () => {
    expect(isHaSourceChangedError(apiError('HA_SOURCE_CHANGED'))).toBe(true)
    expect(isHaSourceChangedError(apiError('DAILY_LIMIT_EXCEEDED'))).toBe(false)
  })

  test('普通 Error / 字符串 / null 都不命中', () => {
    expect(isHaSourceChangedError(new Error('network'))).toBe(false)
    expect(isHaSourceChangedError('HA_SOURCE_CHANGED')).toBe(false)
    expect(isHaSourceChangedError(null)).toBe(false)
    expect(isHaSourceChangedError(undefined)).toBe(false)
  })
})

describe('haSourceChangedMessage', () => {
  test('目录刷新与选择器给出不同文案', () => {
    const error = apiError('HA_SOURCE_CHANGED')
    expect(haSourceChangedMessage(error, 'catalog')).toBe(HA_SOURCE_CHANGED_CATALOG_MESSAGE)
    expect(haSourceChangedMessage(error, 'picker')).toBe(HA_SOURCE_CHANGED_PICKER_MESSAGE)
    expect(HA_SOURCE_CHANGED_CATALOG_MESSAGE).toContain('重试实体目录刷新')
    expect(HA_SOURCE_CHANGED_PICKER_MESSAGE).toContain('重新打开选择器')
  })

  test('其它错误返回 undefined，让调用方沿用更具体的文案', () => {
    expect(haSourceChangedMessage(apiError('SOMETHING_ELSE'), 'catalog')).toBe(undefined)
    expect(haSourceChangedMessage(new Error('timeout'), 'picker')).toBe(undefined)
  })
})
