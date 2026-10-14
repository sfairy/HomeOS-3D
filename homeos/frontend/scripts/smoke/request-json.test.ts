/**
 * 编辑器请求面回归（`studio/app/editor/net/request-json.ts`）—— `bun test` 版。
 *
 * 由脚本式冒烟 `_request_json_smoke.ts` 迁移而来（`ops/testing/README.md` ADR-0001 的 P3-b）。
 * 断言逐条保留，换掉的是**载体**：分段脚本 → `test()` 命名用例。
 *
 * 为什么这两个用例值得换载体（也是它们与其余 7 个冒烟的区别）：
 *  - **失败定位**：脚本版只打印 `[FAIL] label`，一个用例失败后剩下的照跑；`bun test` 直接给出
 *    用例名 + diff，还支持 `test.each` 参数化（本文件的路由/错误分支表就是 4 组参数）。
 *  - **隔离**：脚本版靠模块级可变状态（`fetchPlan` / `fetchCalls` / `navigations`）串行推进，
 *    顺序一改就互相污染；这里每个用例 `beforeEach` 重建状态。
 *
 * 保留 harness 的部分**没有变**（这也是 ADR 的结论：换壳不改断言）：DOM/`fetch`/`window`
 * 桩仍来自 `_smoke_harness`，超时仍用同一份 `FakeTimers`（它比 `jest.useFakeTimers()` 多一件事：
 * 能列出「当前排了哪些延时」，`requestJson` 的超时排程靠它断言）。
 *
 * 运行：`bun test scripts/smoke/request-json.test.ts`（在 `homeos/frontend` 下执行）。
 */
import { beforeEach, expect, test } from 'bun:test'

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  requestJson,
  type RequestJsonDeps,
} from '../../src/studio/app/editor/net/request-json'

import { FakeTimers, installGlobal, installWindow, removeGlobal } from '../_smoke_harness'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code
}

/** 请求里的 init 只关心这几项（其余原样透传，断言不碰）。 */
interface FetchInit {
  cache?: string
  method?: string
  body?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

type FetchPlan = (url: string, init: FetchInit) => Promise<Response>

const navigations: string[] = []
const fetchCalls: { url: string; init: FetchInit }[] = []
let fetchPlan: FetchPlan | null = null
/** 超时用的虚拟时钟（`requestJson` 用的是全局 `setTimeout`，不是 `window.setTimeout`）。 */
let timers: FakeTimers

const freshDeps = (): RequestJsonDeps => ({ authRedirectState: { started: false } })

const jsonPlan =
  (status: number, body: unknown): FetchPlan =>
  async () =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

/** fetch 挂到被中止为止 —— 用来驱动超时与「调用方取消」两条路径。 */
const hangUntilAbort: FetchPlan = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    )
  })

/** 断言「一定抛错且消息命中模式」，并把实际消息带进失败信息。 */
async function expectThrow(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    const value = await run()
    expect(`没有抛错，返回 ${JSON.stringify(value)}`, `应抛错：${pattern}`).toBe('已抛错')
  } catch (error) {
    expect(pattern.test(messageOf(error)), `错误消息应命中 ${pattern}`).toBe(true)
  }
}

beforeEach(() => {
  timers = new FakeTimers()
  navigations.length = 0
  fetchCalls.length = 0
  fetchPlan = null

  installWindow({
    location: {
      href: 'https://homeos.local/studio/editor',
      origin: 'https://homeos.local',
      pathname: '/studio/editor',
      search: '',
      assign: (target: string) => {
        navigations.push(target)
      },
    },
  })
  installGlobal('setTimeout', timers.setTimeout)
  installGlobal('clearTimeout', timers.clearTimeout)
  installGlobal('fetch', (url: string, init: FetchInit) => {
    fetchCalls.push({ url, init })
    if (!fetchPlan) throw new Error('smoke: 未安排 fetch 响应')
    return fetchPlan(url, init)
  })
  removeGlobal('document')
})

test('① 正常 JSON 响应 + URL / cache 形态', async () => {
  fetchPlan = jsonPlan(200, { items: [1, 2] })
  const packed = await requestJson(freshDeps(), '/projects')

  expect(JSON.stringify(packed), 'GET 200 返回解析后的 JSON').toBe('{"items":[1,2]}')
  expect(fetchCalls[0]?.url, '请求打到 /api/v1 前缀').toBe('/api/v1/projects')
  expect(fetchCalls[0]?.init?.cache, 'GET 带 cache: no-store').toBe('no-store')
  expect(fetchCalls[0]?.init?.headers?.['Content-Type'], 'GET 无 body 时不补 Content-Type').toBeUndefined()
})

test('② 变更类请求的 CSRF / Content-Type', async () => {
  installGlobal('document', { cookie: 'other=1; csrf_token=abc123' })
  fetchPlan = jsonPlan(200, { ok: true })

  await requestJson(freshDeps(), '/projects/p1/draft', { method: 'PUT', body: '{"a":1}' })

  expect(fetchCalls[0]?.init?.headers?.['X-CSRF-Token'], 'PUT 合并 X-CSRF-Token（取自 csrf_token Cookie）').toBe('abc123')
  expect(fetchCalls[0]?.init?.headers?.['Content-Type'], 'PUT 带 body 时补 application/json').toBe('application/json')
})

test('③ 204 无响应体 → null', async () => {
  fetchPlan = async () => new Response(null, { status: 204 })
  expect(await requestJson(freshDeps(), '/ha/sync'), '204 返回 null').toBeNull()
})

test('④ 401 → 跳登录页，且闩只生效一次', async () => {
  fetchPlan = jsonPlan(401, { detail: 'unauthorized' })
  const deps = freshDeps()

  await expectThrow(() => requestJson(deps, '/auth/me'), /登录状态已失效/)
  expect(navigations.join(','), '401 跳转 /login').toBe('/login')

  await expectThrow(() => requestJson(deps, '/auth/me'), /登录状态已失效/)
  expect(navigations.length, '闩只跳一次（第二次不再跳转）').toBe(1)
})

test('⑤ 闩是「每实例一份」（换一份 deps 应当重新允许跳转）', async () => {
  fetchPlan = jsonPlan(401, { detail: 'unauthorized' })

  await expectThrow(() => requestJson(freshDeps(), '/auth/me'), /登录状态已失效/)
  expect(navigations.join(','), '闩随 deps 重置（新实例重新跳转）').toBe('/login')
})

test('⑥ 403 + LICENSE_RESTRICTED 走授权页', async () => {
  fetchPlan = jsonPlan(403, { detail: { code: 'LICENSE_RESTRICTED' } })

  await expectThrow(() => requestJson(freshDeps(), '/license/status'), /授权已失效/)
  expect(navigations.join(','), '403 授权失效跳 /license').toBe('/license')
})

test('⑥b 403 其它 code 落回通用分支且不跳转', async () => {
  fetchPlan = jsonPlan(403, { detail: { code: 'FORBIDDEN_SCOPE', message: '无权访问该资源' } })

  await expectThrow(() => requestJson(freshDeps(), '/x'), /无权访问该资源/)
  expect(navigations.length, '普通 403 不跳转').toBe(0)
})

test('⑦ 非 ok：detail.message / detail.code 挂到 Error.code', async () => {
  fetchPlan = jsonPlan(400, { detail: { code: 'BAD_DRAFT', message: '草稿不合法' } })

  try {
    await requestJson(freshDeps(), '/projects/p1/draft')
    expect('未抛错', '400 应抛错').toBe('已抛错')
  } catch (error) {
    expect(messageOf(error), '400 消息用 detail.message').toBe('草稿不合法')
    expect(errorCodeOf(error), '400 把 detail.code 挂到 Error.code').toBe('BAD_DRAFT')
  }
})

test('⑦b 502 消息带状态码与响应片段', async () => {
  fetchPlan = async () => new Response('upstream exploded', { status: 502 })

  try {
    await requestJson(freshDeps(), '/ha/devices')
    expect('未抛错', '502 应抛错').toBe('已抛错')
  } catch (error) {
    expect(/（HTTP 502）/.test(messageOf(error)), '502 消息带状态码').toBe(true)
    expect(/upstream exploded/.test(messageOf(error)), '502 消息带响应片段').toBe(true)
  }
})

test('⑧ ok 但非 JSON → 「接口返回格式异常」', async () => {
  fetchPlan = async () => new Response('<html>nope</html>', { status: 200 })
  await expectThrow(() => requestJson(freshDeps(), '/assets/version'), /接口返回格式异常/)
})

test('⑨ 超时：推进虚拟时钟 → 抛中文错误并已中止请求', async () => {
  fetchPlan = hangUntilAbort
  // 不 await：先让 requestJson 同步跑到 fetch 并挂上定时器，再推进虚拟时钟触发超时。
  const timedOut = requestJson(freshDeps(), '/assets/user', { timeoutMs: 20 }).then(
    (value) => ({ thrown: false as const, value }),
    (error: unknown) => ({ thrown: true as const, error }),
  )
  timers.advance(20)
  const outcome = await timedOut

  expect(
    outcome.thrown && /请求超时：\/assets\/user/.test(messageOf(outcome.error)),
    '超时抛「请求超时」并带上路径',
  ).toBe(true)
  expect(fetchCalls[0]?.init?.signal?.aborted, '超时后请求信号已中止').toBe(true)
})

test('⑩ 调用方中止：原错误原样抛出（不能被超时分支吞掉）', async () => {
  const callerAbort = new AbortController()
  fetchPlan = hangUntilAbort

  const pending = requestJson(freshDeps(), '/ha/translations', { signal: callerAbort.signal })
  callerAbort.abort(new Error('调用方取消'))

  try {
    await pending
    expect('未抛错', '调用方中止应抛错').toBe('已抛错')
  } catch (error) {
    expect(error instanceof Error && error.name === 'AbortError', '调用方中止原样抛原错误').toBe(true)
  }
})

test('⑪ 默认超时常量', () => {
  expect(DEFAULT_REQUEST_TIMEOUT_MS, '默认超时 20 秒').toBe(20000)
})
