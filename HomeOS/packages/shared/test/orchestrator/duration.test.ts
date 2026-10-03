/**
 * @file duration.test.ts
 * @module @homeos/shared/orchestrator
 * @brief Home Assistant duration 解析与格式化工具的单元测试。
 *
 * 职责：
 *  - 验证 parseHaDuration：数字秒数直接返回、HH:MM:SS 字符串换算、{hours,minutes,seconds} 对象累加；
 *  - 验证 formatHaDuration：秒数格式化为 HH:MM:SS 并可选加双引号（用于 YAML 字符串）。
 *
 * 约定：
 *  - 输入 0 秒视为无效时长，parseHaDuration 返回 undefined；
 *  - 格式化输出使用零补齐，不足两位补前导零。
 */
import { describe, expect, test } from 'bun:test'
import { formatHaDuration, parseHaDuration } from '../../src/orchestrator/duration'

describe('parseHaDuration', () => {
  test('number seconds', () => {
    expect(parseHaDuration(90)).toBe(90)
    expect(parseHaDuration(0)).toBeUndefined()
  })
  test('HH:MM:SS string', () => {
    expect(parseHaDuration('01:02:03')).toBe(3723)
  })
  test('object hours/minutes/seconds', () => {
    expect(parseHaDuration({ hours: 1, minutes: 1, seconds: 1 })).toBe(3661)
  })
})

describe('formatHaDuration', () => {
  test('formats quoted HH:MM:SS', () => {
    expect(formatHaDuration(3723)).toBe('"01:02:03"')
    expect(formatHaDuration(3723, { quoted: false })).toBe('01:02:03')
  })
})
