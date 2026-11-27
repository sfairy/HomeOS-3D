/**
 * 车辆「在家 / 离家」与开合配置段的单测（pure 部分）。
 *
 * 三条最容易写错的规则：
 * 1. **每行一个值**：两组各最多 16 个，单行输入填不下；空行与重复要丢掉；
 * 2. **留空 = 自动识别**，不是「不动作」—— 提示文案必须说清自动识别的词表；
 * 3. **未匹配要说「不会动作」**，而不是笼统的「未知」（用户会以为会自己恢复）。
 */
import { describe, expect, test } from 'bun:test'

import {
  CAR_OPENING_PART_LABELS,
  CAR_STATE_MAX_PER_GROUP,
  carOpeningHint,
  carPresenceHint,
  formatCarStateLines,
  hasCarStateValues,
  parseCarStateLines,
} from '../../../homeos/frontend/src/studio/runtime/config-ui/config-editor/rendering/car-motion-section'

describe('parseCarStateLines', () => {
  test('逐行切分并 trim', () => {
    expect(parseCarStateLines('在家\n  在家里  \nHome')).toEqual(['在家', '在家里', 'Home'])
  })

  test('丢弃空行与重复', () => {
    expect(parseCarStateLines('在家\n\n在家\n   \n离家')).toEqual(['在家', '离家'])
  })

  test('兼容 CRLF', () => {
    expect(parseCarStateLines('在家\r\n离家')).toEqual(['在家', '离家'])
  })

  test(`最多 ${CAR_STATE_MAX_PER_GROUP} 个`, () => {
    const tooMany = Array.from({ length: CAR_STATE_MAX_PER_GROUP + 5 }, (_unused, index) => 's' + index).join('\n')
    expect(parseCarStateLines(tooMany)).toHaveLength(CAR_STATE_MAX_PER_GROUP)
  })

  test('空输入返回空数组', () => {
    expect(parseCarStateLines('')).toEqual([])
    expect(parseCarStateLines('   \n  ')).toEqual([])
  })
})

describe('formatCarStateLines', () => {
  test('数组 → 多行文本', () => {
    expect(formatCarStateLines(['在家', '离家'])).toBe('在家\n离家')
    expect(formatCarStateLines([])).toBe('')
    expect(formatCarStateLines(undefined)).toBe('')
  })

  test('与 parseCarStateLines 互逆', () => {
    const states = ['在家', '在家里', 'Home']
    expect(parseCarStateLines(formatCarStateLines(states))).toEqual(states)
  })
})

describe('hasCarStateValues', () => {
  test('空数组 / undefined 都算「没填」', () => {
    expect(hasCarStateValues([])).toBe(false)
    expect(hasCarStateValues(undefined)).toBe(false)
    expect(hasCarStateValues(['在家'])).toBe(true)
  })
})

describe('carPresenceHint', () => {
  test('两组都空：说明自动识别词表', () => {
    const hint = carPresenceHint([], [], '', null)
    expect(hint).toContain('自动识别')
    expect(hint).toContain('在家 / 在家里 / Home / at home')
    expect(hint).toContain('离家 / Away / not home')
    expect(hint).toContain('home / not_home')
  })

  test('自动识别模式下带出当前识别结果', () => {
    expect(carPresenceHint(undefined, undefined, 'home', true)).toContain('当前识别：在家')
    expect(carPresenceHint(undefined, undefined, 'not_home', false)).toContain('当前识别：离家')
    expect(carPresenceHint(undefined, undefined, 'weird', null)).toContain('当前识别：未匹配')
  })

  test('填了状态值：说明按原始值完整匹配', () => {
    const hint = carPresenceHint(['进库'], ['出库'], '进库', true)
    expect(hint).toContain('按填写的原始值完整匹配')
    expect(hint).toContain('每行一个')
    expect(hint).toContain('当前原始状态：进库')
    expect(hint).toContain('识别为在家')
  })

  test('填了状态值但没有原始状态：说明尚未取得', () => {
    expect(carPresenceHint(['进库'], ['出库'], '', null)).toContain('尚未取得')
  })
})

describe('carOpeningHint', () => {
  test('留空时说明自动识别域', () => {
    const hint = carOpeningHint('', null)
    expect(hint).toContain('自动识别')
    expect(hint).toContain('门 / 车库门 / 窗口')
  })

  test('未匹配要明确写「不会动作」', () => {
    const hint = carOpeningHint('half', null)
    expect(hint).toContain('未匹配（不会动作）')
  })

  test('匹配时给打开 / 关闭', () => {
    expect(carOpeningHint('on', true)).toContain('识别为打开')
    expect(carOpeningHint('off', false)).toContain('识别为关闭')
  })
})

describe('CAR_OPENING_PART_LABELS', () => {
  test('六件齐全且顺序固定', () => {
    expect(CAR_OPENING_PART_LABELS.map(([part]) => part)).toEqual([
      'leftFront',
      'leftRear',
      'rightFront',
      'rightRear',
      'hood',
      'tail',
    ])
    expect(CAR_OPENING_PART_LABELS.map(([, label]) => label)).toEqual([
      '左前门',
      '左后门',
      '右前门',
      '右后门',
      '前备箱',
      '后备箱',
    ])
  })
})
