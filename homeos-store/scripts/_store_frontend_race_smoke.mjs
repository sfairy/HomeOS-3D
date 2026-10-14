/**
 * 商店前端的两个「后发先至」竞态回归（`frontend/src/features/storefront/utils/async-guard.ts` + 两处接线）。
 *
 * 守护的改动：两处竞态原先各写了一份内联守卫，且都不可测（商店前端没有组件级测试运行时）：
 *
 * 1. **下单轮询**（`features/storefront/stores/order.ts`）：用户关掉支付弹窗 / 换单之后，在途的订单查询回来
 *    仍会写回 `currentOrder`，而 `fulfilled` 分支还会把整页跳去账号中心；
 * 2. **优惠码试算**（`features/storefront/views/ItemView.vue`）：防抖 450ms 之后发请求，「防抖」只保证
 *    少发请求 —— 用户继续打字时，先发的请求后回来会把已经过期的折扣价盖回表单。
 *
 * 判定抽成纯函数（`createEpochGuard` / `createLatestGuard`）之后，这里能**真的跑一遍**
 * 两条流程（假响应、假定时器、可控的到达顺序），而不是只读源码猜它写对了。
 *
 * 用法：`bun run scripts/_store_frontend_race_smoke.mjs`（在 homeos-store 下执行）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { check, report, section } from '../../homeos/frontend/scripts/_smoke_harness.mjs'
import { createEpochGuard, createLatestGuard } from '../frontend/src/features/storefront/utils/async-guard.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (...parts) => fs.readFileSync(path.join(here, ...parts), 'utf8')
const ORDER_SOURCE = read('../frontend/src/features/storefront/stores/order.ts')
const ITEM_SOURCE = read('../frontend/src/features/storefront/views/ItemView.vue')

/** 可控 promise：模拟「响应什么时候回来、按什么顺序回来」。 */
function deferred() {
  let settle
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/* ------------------------------------------------------------------ *
 * 1. 世代守卫的行为
 * ------------------------------------------------------------------ */

section('1. 世代守卫的行为（取号 / 作废 / 是否仍是当前）')

{
  const guard = createEpochGuard()
  const token = guard.begin()
  check('刚取号时令牌是当前的', guard.isCurrent(token) === true, token)
  check('同一代里的并发请求共用令牌（轮询的定时器与倒计时同属一次支付会话）', guard.begin() === token, token)
  guard.invalidate()
  check('作废之后旧令牌失效', guard.isCurrent(token) === false, token)
  const next = guard.begin()
  check('换代后的新令牌有效', guard.isCurrent(next) === true, next)
  check('旧令牌不会复活（世代单调递增，不是取模复用）', guard.isCurrent(token) === false, token)
}

{
  const guard = createLatestGuard()
  const first = guard.begin()
  check('第一次 begin 的令牌有效', guard.isCurrent(first) === true, first)
  const second = guard.begin()
  check('第二次 begin 自动作废第一次', guard.isCurrent(first) === false, first)
  check('第二次 begin 的令牌有效', guard.isCurrent(second) === true, second)
  guard.invalidate()
  check('显式作废后最新令牌也失效', guard.isCurrent(second) === false, second)
}

/* ------------------------------------------------------------------ *
 * 2. 下单轮询：关弹窗之后在途响应不许回写
 * ------------------------------------------------------------------ */

section('2. 下单轮询（照 `features/storefront/stores/order.ts` 的形状跑一遍）')

{
  // 与 store 里同一套用法：关闭支付会话 = `pollGuard.invalidate()`，
  // 响应到达时用取号时的世代判断是否还算数。
  const guard = createEpochGuard()
  let currentOrder = null
  let navigated = false

  const token = guard.begin()
  const pendingResponse = deferred()
  const inFlight = pendingResponse.promise.then((order) => {
    if (!guard.isCurrent(token)) return false
    currentOrder = order
    if (order.status === 'fulfilled') navigated = true
    return true
  })

  // 用户在响应回来之前关掉了支付弹窗。
  guard.invalidate()
  pendingResponse.settle({ status: 'fulfilled' })

  const applied = await inFlight
  check('关弹窗后在途响应被整体丢弃', applied === false, applied)
  check('订单没有被写回 currentOrder', currentOrder === null, currentOrder)
  check('也没有触发 fulfilled 的整页跳转', navigated === false, navigated)
}

{
  // 反向用例：没关弹窗时同一个响应必须照常写入 —— 守卫不能把正常路径也丢掉。
  const guard = createEpochGuard()
  let currentOrder = null
  const token = guard.begin()
  const response = deferred()
  const inFlight = response.promise.then((order) => {
    if (!guard.isCurrent(token)) return false
    currentOrder = order
    return true
  })
  response.settle({ status: 'paid' })
  const applied = await inFlight
  check('弹窗仍开着 → 响应正常写入（守卫不误伤正常路径）', applied === true && currentOrder?.status === 'paid', currentOrder)
}

/* ------------------------------------------------------------------ *
 * 3. 优惠码试算：防抖 + 后发先至
 * ------------------------------------------------------------------ */

section('3. 优惠码试算（照 `features/storefront/views/ItemView.vue` 的形状跑一遍）')

/**
 * 一条与组件同形状的试算流程：`type` = 输入变化（清定时器 + 作废在途 + 重新防抖），
 * `fire` = 防抖窗口到期（发出请求并取号），响应由调用方 `settle` 控制到达顺序。
 *
 * 定时器用假实现（可同步触发），所以整段判定不依赖真实等待，CI 里不会被 600ms 的
 * sleep 拖慢、也不会偶发不稳。
 */
function couponScenario() {
  const guard = createLatestGuard()
  const scenario = {
    guard,
    coupon: '',
    status: 'idle',
    message: '',
    attempts: 0,
    /** 防抖窗口里待触发的回调；`type` 会重置它，`fire` 会执行它。 */
    pending: null,
  }
  scenario.type = (value) => {
    scenario.coupon = value
    scenario.pending = null // 等价于 clearTimeout：旧窗口作废
    guard.invalidate() // 输入一变，在途请求立刻失效
    if (!scenario.coupon.trim()) {
      scenario.status = 'idle'
      scenario.message = ''
      return
    }
    scenario.status = 'checking'
    scenario.pending = () => scenario.preview()
  }
  scenario.fire = () => {
    const run = scenario.pending
    scenario.pending = null
    return run ? run() : null
  }
  scenario.preview = () => {
    const code = scenario.coupon.trim()
    if (!code) return null
    scenario.attempts += 1
    const token = guard.begin()
    const response = deferred()
    return {
      code,
      response,
      applied: response.promise.then((result) => {
        if (!guard.isCurrent(token)) return false
        scenario.status = 'valid'
        scenario.message = `优惠码有效，优惠 ${result.discountCents}`
        return true
      }),
    }
  }
  return scenario
}

{
  const scenario = couponScenario()
  for (const value of ['S', 'SM', 'SMO', 'SMOK', 'SMOKE']) scenario.type(value)
  check('连续输入期间一个请求都没发（debounce 未到期）', scenario.attempts === 0, scenario.attempts)
  const request = scenario.fire()
  check('防抖只发一次试算请求', scenario.attempts === 1, scenario.attempts)
  check('请求带的是停手那一刻的码', request.code === 'SMOKE', request.code)
  request.response.settle({ discountCents: 499 })
  await request.applied
  check('正常路径照常写入（守卫不误伤）', scenario.status === 'valid' && scenario.message.includes('499'), scenario)
}

{
  // 请求在途时用户改了码：旧响应回来必须整体丢弃，否则表单上会出现「已作废的折扣」。
  const scenario = couponScenario()
  scenario.type('OLDCODE')
  const stale = scenario.fire()
  scenario.type('NEWCODE')
  stale.response.settle({ discountCents: 9 })
  const applied = await stale.applied
  check('输入变化后在途的旧响应被丢弃', applied === false, applied)
  check('旧响应没有写状态与文案', scenario.status === 'checking' && scenario.message === '', scenario)
}

{
  // 后发先至：新码的响应先回来并写好了状态，随后旧码的响应才到 —— 不许覆盖。
  const scenario = couponScenario()
  scenario.type('CODE-A')
  const first = scenario.fire()
  scenario.type('CODE-B')
  const second = scenario.fire()
  second.response.settle({ discountCents: 1000 })
  check('新码响应写入状态', (await second.applied) === true, scenario)
  first.response.settle({ discountCents: 9999 })
  check('旧码响应后到被丢弃', (await first.applied) === false, scenario)
  check('最终留下的是新码的折扣（不是 9999）', scenario.message.includes('1000'), scenario.message)
}

{
  const scenario = couponScenario()
  scenario.type('OK')
  const request = scenario.fire()
  request.response.settle({ discountCents: 500 })
  await request.applied
  const attemptsBefore = scenario.attempts
  scenario.type('')
  check('清空输入 → 状态回到 idle', scenario.status === 'idle', scenario.status)
  check('清空输入 → 不再有待触发的请求', scenario.fire() === null, scenario.pending)
  check('清空输入 → 没有多打一发请求', scenario.attempts === attemptsBefore, scenario.attempts)
}

/* ------------------------------------------------------------------ *
 * 4. 接线契约
 * ------------------------------------------------------------------ */

section('4. 接线契约（读源码：两处竞态真的接了这个守卫）')

check(
  'order.ts 从域内 utils 导入 createEpochGuard',
  /import\s*\{\s*createEpochGuard\s*\}\s*from\s*"@store\/features\/storefront\/utils\/async-guard"/.test(
    ORDER_SOURCE,
  ),
  '',
)
check(
  'order.ts 关闭支付会话时作废世代（stopPolling → invalidate）',
  /function stopPolling\(\)\s*\{[\s\S]{0,120}pollGuard\.invalidate\(\)/.test(ORDER_SOURCE),
  '',
)
check(
  'order.ts 响应到达时按世代判定（两处：调度前 + await 之后）',
  (ORDER_SOURCE.match(/pollGuard\.isCurrent\(/g) || []).length >= 3,
  (ORDER_SOURCE.match(/pollGuard\.isCurrent\(/g) || []).length,
)
check('order.ts 里旧的裸世代变量已删除（不留第二份真相）', !/pollEpoch/.test(ORDER_SOURCE), '')

check(
  'ItemView.vue 从域内 utils 导入 createLatestGuard',
  /import\s*\{\s*createLatestGuard\s*\}\s*from\s*"@store\/features\/storefront\/utils\/async-guard"/.test(
    ITEM_SOURCE,
  ),
  '',
)
check(
  'ItemView.vue 输入变化与卸载都作废在途试算',
  (ITEM_SOURCE.match(/couponGuard\.invalidate\(\)/g) || []).length >= 2,
  (ITEM_SOURCE.match(/couponGuard\.invalidate\(\)/g) || []).length,
)
check(
  'ItemView.vue 请求前取号、两条分支都按号判定',
  /couponGuard\.begin\(\)/.test(ITEM_SOURCE) &&
    (ITEM_SOURCE.match(/couponGuard\.isCurrent\(token\)/g) || []).length >= 2,
  '',
)
check(
  'ItemView.vue 旧的「按码串比较」守卫已删除（不留第二份真相）',
  !/code !== coupon\.value\.trim\(\)/.test(ITEM_SOURCE),
  '',
)
check(
  'ItemView.vue 防抖窗口是具名常量（不是散落的字面量）',
  /COUPON_DEBOUNCE_MS/.test(ITEM_SOURCE) && /setTimeout\(previewCoupon, COUPON_DEBOUNCE_MS\)/.test(ITEM_SOURCE),
  '',
)

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

report('商店前端竞态守卫回归（下单轮询 / 优惠码试算）')
