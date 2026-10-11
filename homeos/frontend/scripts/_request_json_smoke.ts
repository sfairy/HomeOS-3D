/* eslint-disable no-console -- 冒烟脚本的唯一交付物就是控制台 PASS/FAIL 记录 */
/**
 * 编辑器请求面回归（`studio/app/editor/net/request-json.ts`，P4 6e 从 `app/editor/home.ts` 切出）。
 *
 * 守护的故障（每条都对应切分可引入的行为漂移）：
 *  1. **认证跳转闩是「每实例一份」**：原地是 `bootEditor` 内的 `let authRedirectStarted`，
 *     teardown → boot 会重置。切分时若图省事提到模块作用域，就变成跨实例共享 ——
 *     同一文档内重新进编辑器后，401 不再跳登录页（页面停在半加载状态，只能手动刷新）。
 *  2. **401 / 403 的分支顺序**：403 只在 `detail.code === LICENSE_RESTRICTED` 时走授权页，
 *     其余 403 必须落回通用错误分支（否则把普通权限拒绝误报成「授权失效」）。
 *  3. **超时与调用方中止**：超时抛可读中文错误，调用方 `AbortSignal` 中止仍原样抛原错误
 *     （不能被超时分支吞掉，否则调用方拿不到自己的取消原因）。
 *  4. **CSRF 头与 Content-Type**：变更类请求带 `X-CSRF-Token`（与 `csrf_token` Cookie 一致），
 *     带 body 时补 `application/json`，GET 不补。
 *  5. **响应体解析**：204 返回 null；`ok` 但非 JSON 抛「接口返回格式异常」；非 ok 把 `detail.code`
 *     挂到 Error.code 上，且消息里带响应片段。
 *
 * 用法：``bun run scripts/_request_json_smoke.ts``（在 homeos/frontend 下执行）。
 */

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  requestJson,
  type RequestJsonDeps,
} from '../src/studio/app/editor/net/request-json'

const failures: string[] = []

function check(label: string, condition: boolean, detail: unknown = ''): void {
  if (condition) {
    console.log(`  PASS  ${label}`)
    return
  }
  failures.push(`${label}${detail === '' ? '' : ` — ${String(detail)}`}`)
  console.log(`  FAIL  ${label}${detail === '' ? '' : ` — ${String(detail)}`}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code
}

async function expectThrow(label: string, run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    const value = await run()
    check(label, false, `没有抛错，返回 ${JSON.stringify(value)}`)
  } catch (error) {
    check(label, pattern.test(messageOf(error)), `实际：${messageOf(error)}`)
  }
}

// —— 环境桩：模块只依赖 window.location / window.fetch / document.cookie / window.HomeOSLog ——

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

Object.assign(globalThis, {
  window: {
    location: {
      href: 'https://homeos.local/studio/editor',
      pathname: '/studio/editor',
      search: '',
      assign: (target: string) => {
        navigations.push(target)
      },
    },
  },
  fetch: (url: string, init: FetchInit) => {
    fetchCalls.push({ url, init })
    if (!fetchPlan) throw new Error('smoke: 未安排 fetch 响应')
    return fetchPlan(url, init)
  },
})

const jsonPlan =
  (status: number, body: unknown): FetchPlan =>
  async () =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

const freshDeps = (): RequestJsonDeps => ({ authRedirectState: { started: false } })

async function main(): Promise<void> {
  // 1. 正常 JSON 响应 + URL / cache 形态
  const deps = freshDeps()
  fetchPlan = jsonPlan(200, { items: [1, 2] })
  const packed = await requestJson(deps, '/projects')
  check('GET 200 返回解析后的 JSON', JSON.stringify(packed) === '{"items":[1,2]}', packed)
  check('请求打到 /api/v1 前缀', fetchCalls[0]?.url === '/api/v1/projects', fetchCalls[0]?.url)
  check('GET 带 cache: no-store', fetchCalls[0]?.init?.cache === 'no-store')
  check('GET 无 body 时不补 Content-Type', !fetchCalls[0]?.init?.headers?.['Content-Type'])

  // 2. 变更类请求的 CSRF / Content-Type
  Object.assign(globalThis, { document: { cookie: 'other=1; csrf_token=abc123' } })
  fetchCalls.length = 0
  fetchPlan = jsonPlan(200, { ok: true })
  await requestJson(deps, '/projects/p1/draft', { method: 'PUT', body: '{"a":1}' })
  check(
    'PUT 合并 X-CSRF-Token（取自 csrf_token Cookie）',
    fetchCalls[0]?.init?.headers?.['X-CSRF-Token'] === 'abc123',
    fetchCalls[0]?.init?.headers,
  )
  check(
    'PUT 带 body 时补 application/json',
    fetchCalls[0]?.init?.headers?.['Content-Type'] === 'application/json',
    fetchCalls[0]?.init?.headers,
  )
  Reflect.deleteProperty(globalThis, 'document')

  // 3. 204 返回 null
  fetchPlan = async () => new Response(null, { status: 204 })
  check('204 返回 null', (await requestJson(deps, '/ha/sync')) === null)

  // 4. 401：抛错 + 跳登录页，且闩只生效一次
  fetchCalls.length = 0
  navigations.length = 0
  fetchPlan = jsonPlan(401, { detail: 'unauthorized' })
  await expectThrow('401 抛「登录状态已失效」', () => requestJson(deps, '/auth/me'), /登录状态已失效/)
  check('401 跳转 /login', navigations.join(',') === '/login', navigations)
  await expectThrow('第二次 401 仍抛错', () => requestJson(deps, '/auth/me'), /登录状态已失效/)
  check('闩只跳一次（第二次不再跳转）', navigations.length === 1, navigations)

  // 5. 闩是「每实例一份」：换一份 deps 应当重新允许跳转（原地 let 在 bootEditor 内，teardown→boot 会重置）
  navigations.length = 0
  await expectThrow('新实例的 401 仍抛错', () => requestJson(freshDeps(), '/auth/me'), /登录状态已失效/)
  check('闩随 deps 重置（新实例重新跳转）', navigations.join(',') === '/login', navigations)

  // 6. 403 的两个分支
  navigations.length = 0
  fetchPlan = jsonPlan(403, { detail: { code: 'LICENSE_RESTRICTED' } })
  await expectThrow(
    '403 + LICENSE_RESTRICTED 走授权页',
    () => requestJson(freshDeps(), '/license/status'),
    /授权已失效/,
  )
  check('403 授权失效跳 /license', navigations.join(',') === '/license', navigations)

  navigations.length = 0
  fetchPlan = jsonPlan(403, { detail: { code: 'FORBIDDEN_SCOPE', message: '无权访问该资源' } })
  await expectThrow('403 其它 code 落回通用分支', () => requestJson(freshDeps(), '/x'), /无权访问该资源/)
  check('普通 403 不跳转', navigations.length === 0, navigations)

  // 7. 非 ok：消息带响应片段 + 把 detail.code 挂到 Error.code
  fetchPlan = jsonPlan(400, { detail: { code: 'BAD_DRAFT', message: '草稿不合法' } })
  try {
    await requestJson(freshDeps(), '/projects/p1/draft')
    check('400 应抛错', false)
  } catch (error) {
    check('400 消息用 detail.message', messageOf(error) === '草稿不合法', messageOf(error))
    check('400 把 detail.code 挂到 Error.code', errorCodeOf(error) === 'BAD_DRAFT', errorCodeOf(error))
  }

  fetchPlan = async () => new Response('upstream exploded', { status: 502 })
  try {
    await requestJson(freshDeps(), '/ha/devices')
    check('502 应抛错', false)
  } catch (error) {
    check(
      '502 消息带状态码与响应片段',
      /（HTTP 502）/.test(messageOf(error)) && /upstream exploded/.test(messageOf(error)),
      messageOf(error),
    )
  }

  // 8. ok 但非 JSON
  fetchPlan = async () => new Response('<html>nope</html>', { status: 200 })
  await expectThrow(
    '200 非 JSON 抛「接口返回格式异常」',
    () => requestJson(freshDeps(), '/assets/version'),
    /接口返回格式异常/,
  )

  // 9. 超时：fetch 挂住直到被 abort，抛中文超时错误并已中止请求
  const hangUntilAbort: FetchPlan = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      )
    })
  fetchPlan = hangUntilAbort
  fetchCalls.length = 0
  await expectThrow(
    '超时抛「请求超时」并带上路径',
    () => requestJson(freshDeps(), '/assets/user', { timeoutMs: 20 }),
    /请求超时：\/assets\/user/,
  )
  check('超时后请求信号已中止', fetchCalls[0]?.init?.signal?.aborted === true)

  // 10. 调用方中止：原错误原样抛出（不能被超时分支吞掉）
  const callerAbort = new AbortController()
  fetchPlan = hangUntilAbort
  const pending = requestJson(freshDeps(), '/ha/translations', { signal: callerAbort.signal })
  callerAbort.abort(new Error('调用方取消'))
  try {
    await pending
    check('调用方中止应抛错', false)
  } catch (error) {
    check(
      '调用方中止原样抛原错误',
      error instanceof Error && error.name === 'AbortError',
      error instanceof Error ? error.name : error,
    )
  }

  // 11. 默认超时常量
  check('默认超时 20 秒', DEFAULT_REQUEST_TIMEOUT_MS === 20000, DEFAULT_REQUEST_TIMEOUT_MS)

  if (failures.length === 0) {
    console.log('\n请求面冒烟全部通过。')
    return
  }
  console.log(`\n请求面冒烟 ${failures.length} 项失败：\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

void main()
