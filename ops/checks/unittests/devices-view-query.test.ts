/**
 * `/devices` URL 筛选解析的单测。
 *
 * 两条被钉住的行为，都是「写错了也不会报错、只是安静地不对」那种：
 *
 * 1. 非法 query 值不能生效 —— `?status=whatever` 若被当成筛选值，列表会空且没有任何解释；
 * 2. 默认值不回写 URL —— `?status=all` 这类噪声会让「从设备健康点进来」与「正常进入」
 *    在地址栏上无法区分，也让复制出去的链接变长。
 */
import { describe, expect, test } from 'bun:test'

import { parseDeviceQueryFilters, toDeviceQueryParams } from '../../../homeos/frontend/src/features/device/devices-view'

describe('parseDeviceQueryFilters', () => {
  test('两个键都合法时全部解析出来', () => {
    expect(parseDeviceQueryFilters({ domain: 'sensor', status: 'offline' })).toEqual({
      domain: 'sensor',
      status: 'offline',
      present: true,
    })
  })

  test('只有 domain 时 status 为 null', () => {
    expect(parseDeviceQueryFilters({ domain: 'light' })).toEqual({
      domain: 'light',
      status: null,
      present: true,
    })
  })

  test('status 非法时忽略，但 domain 仍生效', () => {
    expect(parseDeviceQueryFilters({ domain: 'sensor', status: 'whatever' })).toEqual({
      domain: 'sensor',
      status: null,
      present: true,
    })
  })

  test('全部非法时 present 为 false（调用方据此不动状态）', () => {
    expect(parseDeviceQueryFilters({ status: 'whatever' })).toEqual({
      domain: null,
      status: null,
      present: false,
    })
  })

  test('空 query 与 undefined 都返回 not present', () => {
    expect(parseDeviceQueryFilters({}).present).toBe(false)
    expect(parseDeviceQueryFilters(undefined).present).toBe(false)
  })

  test('空白值不当作 domain', () => {
    expect(parseDeviceQueryFilters({ domain: '   ' }).present).toBe(false)
  })

  test('重复参数取第一个（route.query 的数组形态）', () => {
    expect(parseDeviceQueryFilters({ domain: ['switch', 'light'] }).domain).toBe('switch')
  })

  test('四个合法 status 都被接受', () => {
    for (const status of ['all', 'online', 'offline', 'low-battery'] as const) {
      expect(parseDeviceQueryFilters({ status }).status).toBe(status)
    }
  })
})

describe('toDeviceQueryParams', () => {
  test('默认值折叠成 null（由调用方删键）', () => {
    expect(toDeviceQueryParams({ domain: 'all', status: 'all' })).toEqual({ domain: null, status: null })
  })

  test('非默认值原样输出', () => {
    expect(toDeviceQueryParams({ domain: 'sensor', status: 'offline' })).toEqual({
      domain: 'sensor',
      status: 'offline',
    })
  })

  test('只有一个非默认值时另一个为 null', () => {
    expect(toDeviceQueryParams({ domain: 'all', status: 'offline' })).toEqual({
      domain: null,
      status: 'offline',
    })
  })

  test('空字符串 domain 折叠成 null', () => {
    expect(toDeviceQueryParams({ domain: '', status: 'all' })).toEqual({ domain: null, status: null })
  })

  test('解析 → 回写 往返一致', () => {
    const parsed = parseDeviceQueryFilters({ domain: 'sensor', status: 'offline' })
    const roundTrip = toDeviceQueryParams({
      domain: parsed.domain ?? 'all',
      status: parsed.status ?? 'all',
    })
    expect(roundTrip).toEqual({ domain: 'sensor', status: 'offline' })
  })
})
