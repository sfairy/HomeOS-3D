/**
 * 布局未保存草稿的归属校验。
 *
 * 草稿是**整份布局**，一旦读错对象就不是「布局少个按钮」，而是整页配置变成别人的。
 * 因此把 key 的构造与解析都抽成纯函数在这里钉住：
 * - 同一浏览器里切换显示方案不能串台；
 * - 换账号登录不能读到上一个账号的草稿；
 * - 损坏的 JSON 不能把应用卡在恢复弹窗上。
 */
import { describe, expect, test } from 'bun:test'

import {
  layoutDraftKey,
  parseLayoutDraft,
  stableLayoutString,
} from '../../../homeos/frontend/src/domain/layout/store/create-layout-draft-state'

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    layoutConfig: { navTabOrder: ['home'] },
    profileId: 'default',
    userId: 'alice',
    timestamp: 1700000000000,
    ...overrides,
  }
}

describe('layoutDraftKey', () => {
  test('用户与方案都参与 key', () => {
    expect(layoutDraftKey('alice', 'default')).not.toBe(layoutDraftKey('bob', 'default'))
    expect(layoutDraftKey('alice', 'default')).not.toBe(layoutDraftKey('alice', 'tv'))
  })

  test('缺省值不会让两个身份落到同一个 key', () => {
    expect(layoutDraftKey('', 'default')).toContain('anonymous')
    expect(layoutDraftKey('alice', '')).toContain('default')
  })
})

describe('parseLayoutDraft', () => {
  test('归属一致时解析成功', () => {
    const parsed = parseLayoutDraft(JSON.stringify(makeDraft()), 'alice', 'default')
    expect(parsed?.layoutConfig).toEqual({ navTabOrder: ['home'] })
    expect(parsed?.timestamp).toBe(1700000000000)
  })

  test('换成别的账号读同一份草稿 → null', () => {
    expect(parseLayoutDraft(JSON.stringify(makeDraft()), 'bob', 'default')).toBeNull()
  })

  test('换成别的方案读同一份草稿 → null', () => {
    expect(parseLayoutDraft(JSON.stringify(makeDraft()), 'alice', 'tv')).toBeNull()
  })

  test('损坏 / 空 / 缺配置 → null（不抛异常）', () => {
    expect(parseLayoutDraft(null, 'alice', 'default')).toBeNull()
    expect(parseLayoutDraft('{', 'alice', 'default')).toBeNull()
    expect(parseLayoutDraft(JSON.stringify({ profileId: 'default', userId: 'alice' }), 'alice', 'default')).toBeNull()
    expect(parseLayoutDraft(JSON.stringify({ ...makeDraft(), layoutConfig: 'nope' }), 'alice', 'default')).toBeNull()
  })

  test('未登录用户的草稿同样按 anonymous 校验', () => {
    const raw = JSON.stringify(makeDraft({ userId: 'anonymous' }))
    expect(parseLayoutDraft(raw, '', 'default')?.userId).toBe('anonymous')
    expect(parseLayoutDraft(raw, 'alice', 'default')).toBeNull()
  })
})

describe('stableLayoutString', () => {
  test('键顺序不同但内容相同 → 同一串（否则每次载入都会误弹恢复弹窗）', () => {
    expect(stableLayoutString({ a: 1, b: { c: 2, d: 3 } })).toBe(stableLayoutString({ b: { d: 3, c: 2 }, a: 1 }))
  })

  test('数组顺序有意义（导航顺序不能当噪声）', () => {
    expect(stableLayoutString({ nav: ['a', 'b'] })).not.toBe(stableLayoutString({ nav: ['b', 'a'] }))
  })

  test('内容真变了必须不同', () => {
    expect(stableLayoutString({ a: 1 })).not.toBe(stableLayoutString({ a: 2 }))
  })
})
