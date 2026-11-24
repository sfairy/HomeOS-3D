/**
 * 离线「按设备聚合」的单测。
 *
 * 这里钉住的口径错了不会报错，只会安静地给出一个看起来合理的数字：
 * 一台掉线的多传感器设备贡献 5~10 条实体，按实体数算会让首页角标写成「离线 131」，
 * 而实际只有十几台设备连不上 —— 与用户「几台设备连不上」的直觉差一个数量级。
 */
import { describe, expect, test } from 'bun:test'

import { groupOfflineByDevice } from '../../../homeos/frontend/src/shared/device/utils/group-offline.util'

type EntityMap = Record<string, { attributes?: Record<string, unknown> } | undefined>

/** 造一台设备：deviceId 为空表示「没有注册表归属」。 */
function entity(deviceId?: string, extra: Record<string, unknown> = {}) {
  return { attributes: deviceId ? { device_id: deviceId, ...extra } : { ...extra } }
}

describe('groupOfflineByDevice', () => {
  test('同一 device_id 的多个实体聚成一台', () => {
    const entities: EntityMap = {
      'switch.kettle': entity('dev-kettle'),
      'sensor.kettle_power': entity('dev-kettle'),
      'sensor.kettle_rssi': entity('dev-kettle'),
    }
    const groups = groupOfflineByDevice(['switch.kettle', 'sensor.kettle_power', 'sensor.kettle_rssi'], entities)

    expect(groups).toHaveLength(1)
    expect(groups[0].deviceKey).toBe('dev-kettle')
    expect(groups[0].entityIds).toHaveLength(3)
  })

  test('代表实体优先可控域（点开就是能操作的那个）', () => {
    const entities: EntityMap = {
      'sensor.kettle_power': entity('dev-kettle'),
      'switch.kettle': entity('dev-kettle'),
    }
    // 入参里 sensor 在前，但代表必须是可控的 switch
    const groups = groupOfflineByDevice(['sensor.kettle_power', 'switch.kettle'], entities)
    expect(groups[0].entityId).toBe('switch.kettle')
  })

  test('没有可控实体时取字典序最小（输出稳定）', () => {
    const entities: EntityMap = {
      'sensor.b': entity('dev-x'),
      'sensor.a': entity('dev-x'),
    }
    const groups = groupOfflineByDevice(['sensor.b', 'sensor.a'], entities)
    expect(groups[0].entityId).toBe('sensor.a')
  })

  test('没有 device_id 的实体各自算一台', () => {
    const entities: EntityMap = {
      'sensor.template_a': entity(),
      'sensor.template_b': entity(),
    }
    const groups = groupOfflineByDevice(['sensor.template_a', 'sensor.template_b'], entities)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.deviceKey)).toEqual(['sensor.template_a', 'sensor.template_b'])
  })

  test('device_id 为空串或无 attributes 时按无归属处理', () => {
    const entities: EntityMap = {
      'light.a': entity(''),
      'light.b': undefined,
    }
    const groups = groupOfflineByDevice(['light.a', 'light.b'], entities)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.deviceKey)).toEqual(['light.a', 'light.b'])
  })

  test('设备数远小于实体数（核心场景）', () => {
    const entities: EntityMap = {}
    const ids: string[] = []
    // 10 台设备 × 每台 5 个实体 = 50 条实体
    for (let device = 0; device < 10; device += 1) {
      for (let index = 0; index < 5; index += 1) {
        const eid = index === 0 ? `switch.d${device}` : `sensor.d${device}_${index}`
        entities[eid] = entity(`dev-${device}`)
        ids.push(eid)
      }
    }
    expect(ids).toHaveLength(50)
    expect(groupOfflineByDevice(ids, entities)).toHaveLength(10)
  })

  test('顺序沿用代表实体在入参中的先后（critical 优先）', () => {
    const entities: EntityMap = {
      'switch.b': entity('dev-b'),
      'switch.a': entity('dev-a'),
    }
    const groups = groupOfflineByDevice(['switch.b', 'switch.a'], entities)
    expect(groups.map((group) => group.deviceKey)).toEqual(['dev-b', 'dev-a'])
  })

  test('空输入返回空数组', () => {
    expect(groupOfflineByDevice([], {})).toEqual([])
  })

  test('同一实体重复出现不会重复计数', () => {
    const entities: EntityMap = { 'switch.a': entity('dev-a') }
    const groups = groupOfflineByDevice(['switch.a', 'switch.a'], entities)
    expect(groups).toHaveLength(1)
    // 重复项会进入 entityIds，但设备数仍是 1 —— 角标口径按设备，不受影响
    expect(groups[0].entityIds).toHaveLength(2)
  })
})
