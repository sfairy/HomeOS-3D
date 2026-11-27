/**
 * 门扇动画来源与卷帘姿态的单测。
 *
 * 判定错了都只表现为「门不动」或「门绕错轴」：
 * 1. `auto` 必须优先有位置回报的那一路（门半开时只有门机能如实表现）；
 * 2. 显式选了某一路但没绑定 → `none`，**不静默回退**；
 * 3. 卷帘带 pivot 时绕顶部轴转，不再用「平移 + 缩高」假装卷起。
 */
import { describe, expect, test } from 'bun:test'

import {
  DOOR_ANIMATION_TYPES,
  DOOR_MOTION_SOURCES,
  legacyMotionSource,
  normalizeDoorAnimationType,
  normalizeDoorMotionSource,
  resolveDoorMotion,
  rollerPose,
} from '../../../homeos/frontend/src/studio/runtime/security/door-motion-source'

describe('枚举归一', () => {
  test('motionSource 只认三值，其余回落 auto', () => {
    for (const source of DOOR_MOTION_SOURCES) expect(normalizeDoorMotionSource(source)).toBe(source)
    expect(normalizeDoorMotionSource('opener-something')).toBe('auto')
    expect(normalizeDoorMotionSource(undefined)).toBe('auto')
  })

  test('doorAnimationType 只认四值，其余回落 entry', () => {
    for (const animationType of DOOR_ANIMATION_TYPES)
      expect(normalizeDoorAnimationType(animationType)).toBe(animationType)
    expect(normalizeDoorAnimationType('slide')).toBe('entry')
    expect(normalizeDoorAnimationType(null)).toBe('entry')
  })

  test('旧 doorSource 的事件型归 contact，其余 auto', () => {
    expect(legacyMotionSource('single-event')).toBe('contact')
    expect(legacyMotionSource('dual-event')).toBe('contact')
    expect(legacyMotionSource('sensor')).toBe('auto')
    expect(legacyMotionSource(undefined)).toBe('auto')
  })
})

describe('resolveDoorMotion', () => {
  const opener = { identity: 'cover.door_motor', openRatio: 0.4 }
  const contact = { identity: 'binary_sensor.door', openRatio: 1 }

  test('auto：有位置回报的优先（门半开时只有门机能表现）', () => {
    const resolution = resolveDoorMotion({}, { opener, contact })
    expect(resolution.source).toBe('opener')
    expect(resolution.openRatio).toBe(0.4)
    expect(resolution.automatic).toBe(true)
  })

  test('auto：门机没读数时退回门磁', () => {
    const resolution = resolveDoorMotion({}, { opener: { identity: 'cover.motor', openRatio: null }, contact })
    expect(resolution.source).toBe('contact')
    expect(resolution.openRatio).toBe(1)
    expect(resolution.automatic).toBe(true)
  })

  test('auto：两路都没读数时选已绑定的一路，但比例为 null', () => {
    const resolution = resolveDoorMotion({}, { opener: { identity: 'cover.motor', openRatio: null } })
    expect(resolution.source).toBe('opener')
    expect(resolution.openRatio).toBe(null)
  })

  test('显式 opener 但没绑定时不静默回退', () => {
    const resolution = resolveDoorMotion({ motionSource: 'opener' }, { contact })
    expect(resolution.source).toBe('none')
    expect(resolution.openRatio).toBe(null)
    expect(resolution.automatic).toBe(false)
  })

  test('显式 contact 只用门磁', () => {
    const resolution = resolveDoorMotion({ motionSource: 'contact' }, { opener, contact })
    expect(resolution.source).toBe('contact')
    expect(resolution.openRatio).toBe(1)
  })

  test('旧文档 doorSource=dual-event 视为 contact', () => {
    const resolution = resolveDoorMotion(
      { doorSource: 'dual-event', doorEntityId: 'binary_sensor.legacy' },
      { contact: { identity: 'binary_sensor.legacy', openRatio: 0 } },
    )
    expect(resolution.source).toBe('contact')
  })

  test('旧文档只有 doorEntityId 时自动当门磁身份', () => {
    const resolution = resolveDoorMotion({ doorEntityId: 'binary_sensor.only_contact' }, {})
    expect(resolution.source).toBe('contact')
    expect(resolution.identity).toBe('binary_sensor.only_contact')
    // 没有读数 → 比例未知，调用方保持当前姿态。
    expect(resolution.openRatio).toBe(null)
  })

  test('两路都没有时 source 为 none', () => {
    const resolution = resolveDoorMotion({}, {})
    expect(resolution.source).toBe('none')
    expect(resolution.identity).toBe('')
  })
})

describe('rollerPose', () => {
  test('无 pivot：竖直平移 + 缩高（旧模型近似）', () => {
    expect(rollerPose(0, 2, 1.2, false)).toEqual({ translation: 0, rotation: 0, scaleY: 1 })
    expect(rollerPose(1, 2, 1.2, false)).toEqual({ translation: 2, rotation: 0, scaleY: 0.001 })
    const half = rollerPose(0.5, 2, 1.2, false)
    expect(half.translation).toBe(1)
    expect(half.scaleY).toBe(0.5)
    expect(half.rotation).toBe(0)
  })

  test('有 pivot：绕顶部轴转，不挪位置、不缩高', () => {
    const pose = rollerPose(1, 2, 1.2, true)
    expect(pose).toEqual({ translation: 0, rotation: 1.2, scaleY: 1 })
    expect(rollerPose(0.25, 2, 1.2, true).rotation).toBeCloseTo(0.3, 6)
  })

  test('比例越界与 NaN 被夹取', () => {
    expect(rollerPose(5, 2, 1.2, false).translation).toBe(2)
    expect(rollerPose(-5, 2, 1.2, true).rotation).toBe(0)
    expect(rollerPose(Number.NaN, 2, 1.2, false).translation).toBe(0)
  })

  test('全开时缩高不会到 0（否则几何塌成一条线）', () => {
    expect(rollerPose(1, 2, 1.2, false).scaleY).toBeGreaterThan(0)
  })
})
