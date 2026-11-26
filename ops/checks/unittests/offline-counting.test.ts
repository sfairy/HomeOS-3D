/**
 * 「离线按设备」口径的单测（前端共享助手）。
 *
 * 这是全站七八处「离线 N」的唯一来源（首页角标 / 设备页侧栏 / 安全区卡片 /
 * 危险源面板 / 设备画像 / 健康趋势）。它错了，所有页面的数字一起错，
 * 而错法不会报错 —— 只是把一台多传感器设备数成 5~10 台。
 */
import { describe, expect, test } from 'bun:test'

import {
  countOfflineDevices,
  groupOfflineByDevice,
} from '../../../homeos/frontend/src/features/device/model/utils/group-offline.util'

function entity(deviceId?: string) {
  return { attributes: deviceId ? { device_id: deviceId } : {} }
}

describe('countOfflineDevices', () => {
  test('一台设备的多个实体只算一台', () => {
    const entities = {
      'switch.kettle': entity('dev-kettle'),
      'sensor.kettle_power': entity('dev-kettle'),
      'sensor.kettle_rssi': entity('dev-kettle'),
    }
    expect(countOfflineDevices(Object.keys(entities), entities)).toBe(1)
  })

  test('10 台 × 5 实体 = 50 条实体 → 10 台设备', () => {
    const entities: Record<string, { attributes: Record<string, string> }> = {}
    const ids: string[] = []
    for (let device = 0; device < 10; device += 1) {
      for (let index = 0; index < 5; index += 1) {
        const eid = `sensor.d${device}_${index}`
        entities[eid] = entity(`dev-${device}`)
        ids.push(eid)
      }
    }
    expect(ids).toHaveLength(50)
    expect(countOfflineDevices(ids, entities)).toBe(10)
  })

  test('无 device_id 的实体各自算一台', () => {
    const entities = { 'sensor.a': entity(), 'sensor.b': entity() }
    expect(countOfflineDevices(['sensor.a', 'sensor.b'], entities)).toBe(2)
  })

  test('空输入为 0', () => {
    expect(countOfflineDevices([], {})).toBe(0)
  })

  test('与 groupOfflineByDevice 的长度一致（两条 API 不会分叉）', () => {
    const entities = { 'light.a': entity('dev-a'), 'light.b': entity('dev-b'), 'sensor.x': entity('dev-a') }
    const ids = ['light.a', 'light.b', 'sensor.x']
    expect(countOfflineDevices(ids, entities)).toBe(groupOfflineByDevice(ids, entities).length)
  })
})
