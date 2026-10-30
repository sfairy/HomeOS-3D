/**
 * T8：商店前台下单失败必须「可见」+ 后台路由守卫的鉴权分支回归。
 *
 * 1) createOrder 的第一段请求（GET /account 待支付预检）曾在 try 之外：网络抖动、
 *    会话刚过期（401）或 5xx 时异常直接从 store 抛出，既不弹 toast 也不进 409 的
 *    待支付复查分支；调用方 ItemView.submit 只 reportBestEffort 记日志，用户点
 *    「支付」后没有任何反馈。这里把「预检在 try 内 + catch 里统一 toast」钉住。
 * 2) resolveAdminGate 决定后台是否下发 console bundle / 是否就地显示登录屏，
 *    是纯函数（不 import 任何模块），直接用假依赖覆盖四条分支。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL('../../../../' + relativePath, import.meta.url)), 'utf8')

const orderStore = read('homeos-store/frontend/src/features/storefront/stores/order.ts')

const createOrderBody = () => {
  const start = orderStore.indexOf('async function createOrder(')
  assert.ok(start > 0, 'order.ts 里找不到 createOrder')
  const end = orderStore.indexOf('\n  return {\n    paymentOpen,', start)
  assert.ok(end > start, '找不到 createOrder 函数结尾')
  return orderStore.slice(start, end)
}

test('createOrder：/account 预检必须在 try 内，失败也要走统一错误提示', () => {
  const body = createOrderBody()
  const tryAt = body.indexOf('try {')
  const precheckAt = body.indexOf('api<{ orders?: StoreOrder[] }>("/account")')
  assert.ok(tryAt > 0, 'createOrder 里必须有 try')
  assert.ok(precheckAt > 0, '找不到 /account 预检请求')
  assert.ok(
    tryAt < precheckAt,
    '预检请求在 try 之外：失败时用户点击「支付」看不到任何提示（回归）',
  )
  // 409 复查分支仍在 catch 里，且 catch 一定会 toast 后 rethrow。
  const catchAt = body.lastIndexOf('} catch (error) {')
  assert.ok(catchAt > precheckAt, 'catch 必须在预检之后')
  const catchBody = body.slice(catchAt)
  assert.match(catchBody, /apiError\.status === 409/)
  assert.match(catchBody, /api<\{ orders\?: StoreOrder\[\] \}>\("\/account"\)\.catch\(logAndIgnore\(/);
  assert.match(catchBody, /toast\.show\(errorMessage\(error\),\s*"err"\)/)
  assert.match(catchBody, /throw error/)
})

test('resolveAdminGate：guest 访问 requiresAuth 页改道前台登录，后台页就地登录', async () => {
  const modulePath = fileURLToPath(
    new URL('../../../../homeos-store/frontend/src/router/admin-guard.ts', import.meta.url),
  )
  const { resolveAdminGate } = await import(pathToFileURL(modulePath).href)

  const calls = []
  const deps = (overrides = {}) => ({
    serverAuthState: () => 'guest',
    adminPhase: () => 'login',
    bootstrap: async () => false,
    showLogin: () => calls.push('showLogin'),
    ...overrides,
  })

  // 1) 前台受保护页 + 服务端判定 guest → 改道登录（服务端未下发 console 会话）
  //    登录落点与前台 requiresAuth 的落点必须一致，改道到别处只能靠这条断言发现。
  assert.deepEqual(
    await resolveAdminGate({ meta: { requiresAuth: true, storePage: 'account' } }, deps()),
    { path: '/user/authentication/login', replace: true },
  )

  // 2) 非 admin / 非受保护页 → 放行，且不触发后台 bootstrap
  let bootstrapped = false
  assert.equal(
    await resolveAdminGate(
      { meta: { storePage: 'home' } },
      deps({ bootstrap: async () => { bootstrapped = true; return true } }),
    ),
    true,
  )
  assert.equal(bootstrapped, false)

  // 3) 后台页已有 ready 会话 → 放行（不再探针）
  assert.equal(
    await resolveAdminGate(
      { meta: { area: 'admin', requiresAuth: true } },
      deps({ serverAuthState: () => 'user', adminPhase: () => 'ready' }),
    ),
    true,
  )

  // 4) 后台页 bootstrap 失败（未登录 / 非管理员）→ 就地显示登录屏，不放行改道
  const before = calls.length
  assert.equal(
    await resolveAdminGate({ meta: { area: 'admin', requiresAuth: true } }, deps({ serverAuthState: () => 'user' })),
    true,
  )
  assert.equal(calls.length, before + 1, 'bootstrap 失败后必须调用 showLogin 就地登录')
})
