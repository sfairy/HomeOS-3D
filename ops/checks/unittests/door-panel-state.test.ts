/**
 * 门面板状态机文案的单测。
 *
 * 这是 0.9.0 比窗帘多出来的部分：门机常不回报位置，所以文案要同时表达
 * 「开没开」「开度知不知道」「指令受理没受理」「开门器能不能用」四件事。
 * 组合错了不会报错，只会让用户看到一句自相矛盾的话（例如「门已打开 · 开门器不可用」
 * 写成「设备不可用」，用户就不知道该去修门机还是等门磁）。
 */
import { describe, expect, test } from 'bun:test'

import {
  DOOR_SWITCH_UNAVAILABLE_SUFFIX,
  doorContactMismatchNotice,
  doorPanelControls,
  doorPanelLabel,
  doorPanelPrimaryAction,
  doorPanelSecondaryAction,
  doorPanelTargetLabel,
  doorPanelTitle,
  doorPanelUnavailableReason,
} from '../../../homeos/frontend/src/studio/runtime/cover/door-panel-state'

const input = (overrides: Record<string, unknown> = {}) => ({
  doorOpen: true,
  positionKnown: false,
  openerAvailable: true,
  waitingForReset: false,
  awaitingReport: false,
  momentary: false,
  targetPosition: null,
  ...overrides,
})

describe('doorPanelLabel', () => {
  test('正常态：开 / 关', () => {
    expect(doorPanelLabel(input({ doorOpen: true, positionKnown: true }))).toBe('门已打开')
    expect(doorPanelLabel(input({ doorOpen: false }))).toBe('门已关闭')
  })

  test('已匹配但开度未知', () => {
    expect(doorPanelLabel(input({ doorOpen: true, positionKnown: false }))).toBe('门已打开 · 开度未知')
  })

  test('在途指令优先于一切', () => {
    expect(doorPanelLabel(input({ awaitingReport: true, doorOpen: true }))).toBe('已发送 · 等待门磁回报')
    expect(doorPanelLabel(input({ awaitingReport: true, doorOpen: null }))).toBe('已发送 · 门状态未知')
    // 即使在途 + 开门器不可用，也要先说「已发送」（用户刚点了按钮）。
    expect(doorPanelLabel(input({ awaitingReport: true, openerAvailable: false }))).toBe('已发送 · 等待门磁回报')
  })

  test('开门器不可用时带出开合状态', () => {
    expect(doorPanelLabel(input({ openerAvailable: false, doorOpen: true }))).toBe('门已打开 · 开门器不可用')
    expect(doorPanelLabel(input({ openerAvailable: false, doorOpen: false }))).toBe('门已关闭 · 开门器不可用')
    expect(doorPanelLabel(input({ openerAvailable: false, doorOpen: null }))).toBe('门状态未知')
  })

  test('未匹配时是「未确认」而不是「未知」以外的死值', () => {
    expect(doorPanelLabel(input({ doorOpen: null }))).toBe('门状态未确认')
  })
})

describe('doorContactMismatchNotice', () => {
  test('两侧都明确且矛盾才提示', () => {
    expect(doorContactMismatchNotice(true, false)).toBe('开门器与门磁状态不一致，请核对门或设备回报。')
    expect(doorContactMismatchNotice(false, true)).toBe('开门器与门磁状态不一致，请核对门或设备回报。')
  })

  test('一致 / 任一侧未知都不提示', () => {
    expect(doorContactMismatchNotice(true, true)).toBe('')
    expect(doorContactMismatchNotice(false, false)).toBe('')
    // 没有门磁（或门磁没匹配上）是「未确认」，不是「矛盾」。
    expect(doorContactMismatchNotice(true, null)).toBe('')
    expect(doorContactMismatchNotice(null, true)).toBe('')
  })

  test('点动型等复位期间不提示（门磁本来就会滞后）', () => {
    expect(doorContactMismatchNotice(true, false, true)).toBe('')
  })
})

describe('doorPanelTitle', () => {
  test('开关实体掉线时在标题后追加「 · 开关不可用」', () => {
    expect(doorPanelTitle(input({ doorOpen: true, positionKnown: true, switchAvailable: false }))).toBe(
      '门已打开' + DOOR_SWITCH_UNAVAILABLE_SUFFIX,
    )
    expect(DOOR_SWITCH_UNAVAILABLE_SUFFIX).toBe(' · 开关不可用')
  })

  test('未提供 switchAvailable 时不追加（向后兼容）', () => {
    expect(doorPanelTitle(input({ doorOpen: true, positionKnown: true }))).toBe('门已打开')
  })

  test('与「开门器不可用」是两档：两者同时成立时两个后缀都在', () => {
    const title = doorPanelTitle(input({ doorOpen: false, openerAvailable: false, switchAvailable: false }))
    expect(title).toContain('门已关闭 · 开门器不可用')
    expect(title).toContain(' · 开关不可用')
  })
})

describe('doorPanelPrimaryAction', () => {
  test('点动型固定「触发门机」', () => {
    expect(doorPanelPrimaryAction(input({ momentary: true, doorOpen: true }))).toBe('触发门机')
    expect(doorPanelPrimaryAction(input({ momentary: true, doorOpen: false }))).toBe('触发门机')
  })

  test('保持型按当前态给反向动作', () => {
    expect(doorPanelPrimaryAction(input({ doorOpen: true }))).toBe('关门')
    expect(doorPanelPrimaryAction(input({ doorOpen: false }))).toBe('开门')
    // 未匹配时默认给「开门」（更可能是用户想开）。
    expect(doorPanelPrimaryAction(input({ doorOpen: null }))).toBe('开门')
  })

  test('在途时给「正在发送」', () => {
    expect(doorPanelPrimaryAction(input({ awaitingReport: true }))).toBe('正在发送')
  })
})

describe('doorPanelSecondaryAction', () => {
  test('在途时是「等待门磁回报」，否则「停止」', () => {
    expect(doorPanelSecondaryAction(input({ awaitingReport: true }))).toBe('等待门磁回报')
    expect(doorPanelSecondaryAction(input())).toBe('停止')
  })
})

describe('doorPanelTargetLabel', () => {
  test('保持型且有目标才显示', () => {
    expect(doorPanelTargetLabel(input({ targetPosition: 73 }))).toBe('目标 73%')
    expect(doorPanelTargetLabel(input({ targetPosition: null }))).toBe('')
    expect(doorPanelTargetLabel(input({ momentary: true, targetPosition: 50 }))).toBe('')
  })

  test('目标取整', () => {
    expect(doorPanelTargetLabel(input({ targetPosition: 33.4 }))).toBe('目标 33%')
  })
})

describe('doorPanelControls', () => {
  test('点动型只能触发，不能区分开/关', () => {
    const controls = doorPanelControls(input({ momentary: true }))
    expect(controls.canPulse).toBe(true)
    expect(controls.canClose).toBe(false)
    expect(controls.canStop).toBe(false)
  })

  test('点动型等复位期间全部禁用', () => {
    const controls = doorPanelControls(input({ momentary: true, waitingForReset: true }))
    expect(controls.canPulse).toBe(false)
    expect(controls.canOpen).toBe(false)
  })

  test('保持型不给「已在目标态」的按钮', () => {
    const openControls = doorPanelControls(input({ doorOpen: true }))
    expect(openControls.canOpen).toBe(false)
    expect(openControls.canClose).toBe(true)
    const closedControls = doorPanelControls(input({ doorOpen: false }))
    expect(closedControls.canOpen).toBe(true)
    expect(closedControls.canClose).toBe(false)
  })

  test('未匹配时两个都可用（用户知道自己还没确认）', () => {
    const controls = doorPanelControls(input({ doorOpen: null }))
    expect(controls.canOpen).toBe(true)
    expect(controls.canClose).toBe(true)
    expect(controls.canStop).toBe(true)
  })

  test('开门器不可用时全部禁用', () => {
    const controls = doorPanelControls(input({ openerAvailable: false }))
    expect(controls.canOpen).toBe(false)
    expect(controls.canClose).toBe(false)
    expect(controls.canStop).toBe(false)
  })
})

describe('doorPanelUnavailableReason', () => {
  test('开门器不可用优先', () => {
    expect(doorPanelUnavailableReason(input({ openerAvailable: false, waitingForReset: true }))).toBe('开门器不可用')
  })

  test('点动型等复位', () => {
    expect(doorPanelUnavailableReason(input({ momentary: true, waitingForReset: true }))).toBe('等待开关复位')
  })

  test('可用时为空串', () => {
    expect(doorPanelUnavailableReason(input())).toBe('')
    // 保持型不看 waitingForReset。
    expect(doorPanelUnavailableReason(input({ waitingForReset: true }))).toBe('')
  })
})
