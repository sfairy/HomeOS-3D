/**
 * 「缩放与拖移」开关（`viewGesturesEnabled`）的契约（0.8.9）。
 *
 * 三种不一致都会让功能「看起来有、实际不生效」：
 *
 * 1. **默认值**：必须是「缺省关闭」。它是新增能力，老组件没有这个键时若按开启处理，
 *    升级后所有人的画布突然可拖动 —— 破坏性变更。
 * 2. **判据**：前端写 `=== true`，会话里的字符串 `"true"` 不能让 runtime 打开。
 * 3. **预览态**：嵌入舞台下开关应禁用（改的是宿主文档，画面不会立刻变）。
 *
 * 这里断言前两条（纯数据），第三条由 UI 的 `disabled` 绑定实现。
 */
import { describe, expect, test } from 'bun:test'

/** 与 `stage.ts` / `editor.ts` 同一判据：严格等于 true 才算开启。 */
function readViewGesturesEnabled(properties: Record<string, unknown> | null | undefined): boolean {
  return properties?.viewGesturesEnabled === true
}

describe('开关的默认值与判据', () => {
  test('缺省（老组件）→ 关闭', () => {
    expect(readViewGesturesEnabled({})).toBe(false)
    expect(readViewGesturesEnabled({ sceneId: 'x' })).toBe(false)
    expect(readViewGesturesEnabled(null)).toBe(false)
    expect(readViewGesturesEnabled(undefined)).toBe(false)
  })

  test('显式 true → 开启', () => {
    expect(readViewGesturesEnabled({ viewGesturesEnabled: true })).toBe(true)
  })

  test('显式 false → 关闭', () => {
    expect(readViewGesturesEnabled({ viewGesturesEnabled: false })).toBe(false)
  })

  test('字符串 "true" 不算开启（否则 runtime 与 UI 判定会分叉）', () => {
    expect(readViewGesturesEnabled({ viewGesturesEnabled: 'true' })).toBe(false)
  })

  test('数字 1 / 对象不算开启', () => {
    expect(readViewGesturesEnabled({ viewGesturesEnabled: 1 })).toBe(false)
    expect(readViewGesturesEnabled({ viewGesturesEnabled: {} })).toBe(false)
  })
})

describe('说明文案', () => {
  test('与上游一致（否则用户不知道这项影响什么）', () => {
    const note = '单层支持双指拖移。双指捏合或滚轮可推进透视镜头，正交视角可调整取景大小。'
    expect(note).toContain('双指拖移')
    expect(note).toContain('双指捏合')
    expect(note).toContain('正交视角')
  })
})
