/**
 * 首屏登录态探针判定的回归（`shared/utils/auth/session-probe.util.ts`）。
 *
 * 守的是一条**反直觉**的取舍：只有服务端明确说「没有会话 Cookie」时才跳过 `/auth/me`。
 * 任何一处放松 —— 把 `user` 也当不必探、把未知取值当游客、或者干脆按开发端口判断 ——
 * 症状都是「刷新后停在登录页，而 Cookie 明明是好的」，且只在特定入口复现，极难排查。
 *
 * 因此这里断言的正是那些个「看起来可以顺手省掉、实际会误伤已登录用户」的取值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/shared/utils/auth/session-probe.util.ts', import.meta.url),
)
const { parseServerAuthHint, shouldProbeSession, readServerAuthHint } = await import(MODULE)

test('只有 guest 才跳过探针：user / unknown 都必须真打一次', () => {
  assert.equal(shouldProbeSession('guest'), false)
  assert.equal(shouldProbeSession('user'), true)
  // 属性缺失 = Vite 开发索引。必须探，否则开发态硬刷新会把已登录用户判成匿名。
  assert.equal(shouldProbeSession('unknown'), true)
})

test('未知取值收敛成 unknown 而不是 guest', () => {
  for (const value of [null, undefined, '', 'GUEST', 'admin', 'true', '  guest  ']) {
    assert.equal(parseServerAuthHint(value), 'unknown', `取值 ${JSON.stringify(value)}`)
  }
  assert.equal(parseServerAuthHint('guest'), 'guest')
  assert.equal(parseServerAuthHint('user'), 'user')
})

test('readServerAuthHint 直接读 <html data-auth>', () => {
  const attrs = new Map()
  globalThis.document = {
    documentElement: { getAttribute: (name) => attrs.get(name) ?? null },
  }
  assert.equal(readServerAuthHint(), 'unknown')
  attrs.set('data-auth', 'guest')
  assert.equal(readServerAuthHint(), 'guest')
  attrs.set('data-auth', 'user')
  assert.equal(readServerAuthHint(), 'user')
  delete globalThis.document
})

test('没有 document 时不抛错（预渲染 / 单测环境）', () => {
  assert.equal(readServerAuthHint(), 'unknown')
})
