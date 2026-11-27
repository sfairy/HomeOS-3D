/**
 * 「开门器」配置段的单测（pure 部分）。
 *
 * 两条最容易被写错的规则：
 * 1. **点动型不显示「开门对应状态」** —— 复位语义下这个设置不成立，显示出来会诱导
 *    用户配一个永远不生效的极性；
 * 2. **门磁说明要指名是哪几扇门** —— 只说「已在安防配置门磁」时，一屋子十几扇门
 *    用户不知道该去哪核对。
 */
import { describe, expect, test } from 'bun:test'

import {
  doorContactLabel,
  doorContactNote,
  doorSwitchModeNote,
  floorDoorContacts,
  normalizeDoorSwitchMode,
} from '../../../homeos/frontend/src/studio/runtime/config-ui/config-editor/rendering/door-opener-section'

describe('normalizeDoorSwitchMode', () => {
  test('只有 momentary 是点动，其余一律保持型', () => {
    expect(normalizeDoorSwitchMode('momentary')).toBe('momentary')
    expect(normalizeDoorSwitchMode('maintained')).toBe('maintained')
    expect(normalizeDoorSwitchMode('toggle')).toBe('maintained')
    expect(normalizeDoorSwitchMode(undefined)).toBe('maintained')
  })
})

describe('floorDoorContacts', () => {
  const environment = {
    security: {
      locks: [
        { floorId: 'floor-1', label: '入户门', doorEntityId: 'binary_sensor.a' },
        { floorId: 'floor-2', label: '车库门', doorEntityId: 'binary_sensor.b' },
        // 没有任何门磁实体的记录不算「已配门磁」。
        { floorId: 'floor-1', label: '空门' },
        { floorId: 'floor-1', label: '开门磁', doorOpenEntityId: 'binary_sensor.c' },
      ],
    },
  }

  test('只取本层且真的绑了门磁的记录', () => {
    const contacts = floorDoorContacts(environment, 'floor-1')
    expect(contacts.map((contact) => contact.label)).toEqual(['入户门', '开门磁'])
  })

  test('楼层为空时按当前层匹配', () => {
    const contacts = floorDoorContacts({ security: { locks: [{ doorEntityId: 'binary_sensor.x' }] } }, '')
    expect(contacts).toHaveLength(1)
  })

  test('没有 environment 时安全返回空数组', () => {
    expect(floorDoorContacts(null, 'floor-1')).toEqual([])
    expect(floorDoorContacts({}, 'floor-1')).toEqual([])
  })
})

describe('doorContactLabel', () => {
  test('优先 label，其次任一实体 id', () => {
    expect(doorContactLabel({ label: '入户门', doorEntityId: 'binary_sensor.a' })).toBe('入户门')
    expect(doorContactLabel({ doorEntityId: 'binary_sensor.a' })).toBe('binary_sensor.a')
    expect(doorContactLabel({ doorOpenEntityId: 'binary_sensor.b' })).toBe('binary_sensor.b')
    expect(doorContactLabel({ doorEventEntityId: 'event.c' })).toBe('event.c')
    expect(doorContactLabel({})).toBe('')
  })
})

describe('doorContactNote', () => {
  test('已有门磁时列出名字并说明分工', () => {
    const note = doorContactNote([{ label: '入户门' }, { label: '车库门' }])
    expect(note).toContain('已在安防配置门磁：入户门、车库门')
    expect(note).toContain('开门器负责控制')
    // 0.9.0 改口径：同一**模型**一路动画（不再按扇说「同一扇门」）。
    expect(note).toContain('同一模型使用一路动画反馈')
  })

  test('没有门磁时说明可以单用', () => {
    const note = doorContactNote([])
    expect(note).toContain('可单独使用开门器')
    expect(note).toContain('可在安防中为此门配置门磁')
  })
})

describe('doorSwitchModeNote', () => {
  test('点动型说明只用于开门且等待复位期间不能再触发', () => {
    const note = doorSwitchModeNote('momentary')
    expect(note).toContain('由设备自动复位开关')
    expect(note).toContain('只用于开门')
    expect(note).toContain('等待复位期间不能再次触发')
  })

  test('保持型说明门扇跟随门磁并可确认关闭', () => {
    // 0.9.0 原文：开关方式的说明不再重复「开和关分别控制门」（那是选项标签），
    // 只说明动画来源与确认方式。
    const note = doorSwitchModeNote('maintained')
    expect(note).toContain('门扇跟随安防门磁回报')
    expect(note).toContain('配置门磁后可以确认门是否已关上')
  })
})
