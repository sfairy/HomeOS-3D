/**
 * 开门器（`door-opener`）契约的单元测试（`bun test`）。
 *
 * 这块最容易错在两处，而且都**不会抛异常**：
 *
 * 1. **点动型（momentary）**：发一次脉冲后开关会自己复位。若在「等待复位」期间放行第二次，
 *    门还动着就被反向触发 —— 现场表现是「门抖一下就停」。后端 `reject_if_not_observed`
 *    会拒，但前端必须先禁用按钮，否则用户以为没生效而连点。
 * 2. **开关极性**（`switchOpenState`）：部分门机是低电平有效，「开」要发 `turn_off`。
 *    反了就是按开变关。
 */
import { describe, expect, test } from 'bun:test'

import {
  doorOpenerDomain,
  doorSwitchControl,
  doorSwitchState,
  isDoorSwitch,
} from '../../../homeos/frontend/src/studio/runtime/cover/cover'

const switchState = (state: string, extra: Record<string, unknown> = {}) => ({
  state,
  attributes: { friendly_name: '车库门机' },
  ...extra,
})

describe('isDoorSwitch', () => {
  test('switch 与 cover 都算开门器（上游：绑定 cover 或 switch）', () => {
    expect(isDoorSwitch({ entityId: 'switch.garage' })).toBe(true)
    expect(isDoorSwitch({ entityId: 'cover.garage' })).toBe(true)
    expect(isDoorSwitch({ entityId: 'binary_sensor.door' })).toBe(false)
    expect(isDoorSwitch({ entityId: 'light.x' })).toBe(false)
    expect(isDoorSwitch({})).toBe(false)
  })

  test('doorOpenerDomain 区分两种形态', () => {
    expect(doorOpenerDomain({ entityId: 'switch.a' })).toBe('switch')
    expect(doorOpenerDomain({ entityId: 'cover.b' })).toBe('cover')
    expect(doorOpenerDomain({ entityId: 'light.c' })).toBe(null)
  })
})

describe('doorSwitchState', () => {
  test('保持型：on/off 均可用，不需要脉冲', () => {
    const status = doorSwitchState({ entityId: 'switch.g', switchMode: 'maintained' }, switchState('on'))
    expect(status.available).toBe(true)
    expect(status.momentary).toBe(false)
    expect(status.pulse).toBe(null)
    expect(status.ready).toBe(true)
    expect(status.name).toBe('车库门机')
  })

  test('不可用 / 非 on-off 状态拒绝', () => {
    expect(doorSwitchState({ entityId: 'switch.g' }, { state: 'unavailable' }).available).toBe(false)
    expect(doorSwitchState({ entityId: 'switch.g' }, { state: 'on', available: false }).available).toBe(false)
  })

  test('点动型：脉冲未复位时不可发指令', () => {
    const binding = { entityId: 'switch.g', switchMode: 'momentary' }
    const waiting = doorSwitchState(binding, switchState('off', { momentarySwitch: { waitingForReset: true } }))
    expect(waiting.momentary).toBe(true)
    expect(waiting.available).toBe(true)
    expect(waiting.ready).toBe(false)
    const ready = doorSwitchState(binding, switchState('off', { momentarySwitch: { waitingForReset: false } }))
    expect(ready.ready).toBe(true)
  })

  test('门磁只做展示（on / contactOpen），不影响 ready', () => {
    const status = doorSwitchState({ entityId: 'switch.g' }, switchState('on'), true)
    expect(status.on).toBe(true)
    expect(status.contactOpen).toBe(true)
    expect(status.ready).toBe(true)
    const unknownContact = doorSwitchState({ entityId: 'switch.g' }, switchState('on'), null)
    expect(unknownContact.contactOpen).toBe(null)
    expect(unknownContact.on).toBe(false)
  })

  test('支持 newState 包装（HA 事件直传）', () => {
    expect(doorSwitchState({ entityId: 'switch.g' }, { newState: switchState('on') }).available).toBe(true)
  })
})

describe('doorSwitchControl', () => {
  const maintainedOn = { ready: true, momentary: false }

  test('未就绪时报「开关暂不可用」', () => {
    expect(() => doorSwitchControl({ entityId: 'switch.g' }, { ready: false, momentary: false }, 'open_cover')).toThrow(
      '开门器开关暂不可用。',
    )
  })

  test('高电平有效（默认）：开→turn_on，关→turn_off', () => {
    expect(doorSwitchControl({ entityId: 'switch.g' }, maintainedOn, 'open_cover')).toEqual({
      entityId: 'switch.g',
      domain: 'switch',
      service: 'turn_on',
      data: {},
    })
    expect(doorSwitchControl({ entityId: 'switch.g' }, maintainedOn, 'close_cover').service).toBe('turn_off')
  })

  test('低电平有效（switchOpenState=off）时极性反转', () => {
    const binding = { entityId: 'switch.g', switchOpenState: 'off' }
    expect(doorSwitchControl(binding, maintainedOn, 'open_cover').service).toBe('turn_off')
    expect(doorSwitchControl(binding, maintainedOn, 'close_cover').service).toBe('turn_on')
  })

  test('点动型只能开门，且一律 turn_on', () => {
    const momentary = { ready: true, momentary: true }
    expect(doorSwitchControl({ entityId: 'switch.g' }, momentary, 'open_cover').service).toBe('turn_on')
    expect(() => doorSwitchControl({ entityId: 'switch.g' }, momentary, 'close_cover')).toThrow('开门器不支持此操作。')
  })

  test('停止等其它动作一律拒绝', () => {
    expect(() => doorSwitchControl({ entityId: 'switch.g' }, maintainedOn, 'stop_cover')).toThrow(
      '开门器不支持此操作。',
    )
    expect(() => doorSwitchControl({ entityId: 'switch.g' }, maintainedOn, 'set_cover_position')).toThrow(
      '开门器不支持此操作。',
    )
  })
})

describe('cover 域开门器', () => {
  const coverState = (state: string) => ({ state, attributes: { friendly_name: '车库卷帘门' } })

  test('cover 的合法状态比 switch 宽（opening/closing/stopped 也算可用）', () => {
    for (const state of ['open', 'closed', 'opening', 'closing', 'stopped'])
      expect(doorSwitchState({ entityId: 'cover.g' }, coverState(state)).available).toBe(true)
    expect(doorSwitchState({ entityId: 'cover.g' }, coverState('unavailable')).available).toBe(false)
  })

  test('cover 没有点动语义（即使配了 switchMode 也不生效）', () => {
    const status = doorSwitchState({ entityId: 'cover.g', switchMode: 'momentary' }, coverState('closed'))
    expect(status.domain).toBe('cover')
    expect(status.momentary).toBe(false)
    expect(status.ready).toBe(true)
  })

  test('cover 走 cover 域服务，不做极性换算', () => {
    const status = { ready: true, momentary: false, domain: 'cover' as const }
    expect(doorSwitchControl({ entityId: 'cover.g', switchOpenState: 'off' }, status, 'open_cover')).toEqual({
      entityId: 'cover.g',
      domain: 'cover',
      service: 'open_cover',
      data: {},
    })
    expect(doorSwitchControl({ entityId: 'cover.g' }, status, 'close_cover').service).toBe('close_cover')
  })

  test('cover 支持停止与定位', () => {
    const status = { ready: true, momentary: false, domain: 'cover' as const }
    expect(doorSwitchControl({ entityId: 'cover.g' }, status, 'stop_cover').service).toBe('stop_cover')
    expect(doorSwitchControl({ entityId: 'cover.g' }, status, 'set_cover_position').service).toBe('set_cover_position')
  })

  test('cover 不支持的门机专属动作仍被拒', () => {
    const status = { ready: true, momentary: false, domain: 'cover' as const }
    expect(() => doorSwitchControl({ entityId: 'cover.g' }, status, 'open_cover_tilt')).toThrow('开门器不支持此操作。')
  })
})
