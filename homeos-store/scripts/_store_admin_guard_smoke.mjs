/**
 * 商店后台路由闸门回归（`frontend/src/router/admin-guard.ts` + 路由表的 meta）。
 *
 * 守护的改动：`/admin` 此前**没有任何路由级护栏** —— 谁访问都先把 `AdminLayout` 的 chunk
 * 下下来，再由 HTTP 拦截器或挂载后的探针把未登录访客弹回登录屏。也就是说后台外壳与
 * 它的面板 bundle 对任何人都照发。现在 `/admin` 带 `meta.requiresAuth + area:"admin"`，
 * 守卫在放行前确认管理员会话，确认不了就回登录入口（这一层在组件解析**之前**跑，
 * 所以未登录访客连那块 chunk 都不会下）。
 *
 * 两层断言，各管一件事：
 *
 * 1. **判定表**（`resolveAdminGate`，纯函数 + 假 store）：哪条路由该放行、哪条该改道、
 *    什么时候探针、探针失败怎么办。纯函数不依赖 vue/pinia/router，所以能直接在 bun 里跑。
 * 2. **路由表契约**（读源码）：`meta` 真的挂上了、守卫真的委托出去了、后台组件仍是
 *    **懒加载**（改成静态 import 的话闸门就拦不住 bundle 了）。
 *
 * 第 2 层为什么只能读源码：`router/index.ts` 静态 import 了两个 `.vue`（`StoreLayout` /
 * `HomeView`），bun 没有 SFC 加载器，真起一个 router 实例得把整张路由表复制一份 ——
 * 而复制出来的那份测的就不是线上那张表了。
 *
 * 用法：`bun run scripts/_store_admin_guard_smoke.mjs`（在 homeos-store 下执行）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { check, report, section } from '../../homeos/frontend/scripts/_smoke_harness.mjs'
import { STORE_LOGIN_PATH, resolveAdminGate } from '../frontend/src/router/admin-guard.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROUTER_SOURCE = fs.readFileSync(path.join(here, '../frontend/src/router/index.ts'), 'utf8')

/** 期望的「改道登录页」结果。 */
const GO_LOGIN = { path: STORE_LOGIN_PATH, replace: true }

/** 假 store：只实现闸门真正用到的那四面，并记录调用次数（「有没有白探针」也要断言）。 */
function fakeDeps({ serverAuth = 'guest', phase = 'boot', bootstrap = true, throws = false } = {}) {
  const calls = { bootstrap: 0, showLogin: 0 }
  return {
    calls,
    deps: {
      serverAuthState: () => serverAuth,
      adminPhase: () => phase,
      bootstrap: async () => {
        calls.bootstrap += 1
        if (throws) throw new Error('探针自己炸了')
        return bootstrap
      },
      showLogin: () => {
        calls.showLogin += 1
      },
    },
  }
}

/** `JSON.stringify` 比较：守卫的返回值就是这么个两键对象，逐键写断言只会更长。 */
const isLoginRedirect = (result) => JSON.stringify(result) === JSON.stringify(GO_LOGIN)

/* ------------------------------------------------------------------ *
 * 1. 判定表
 * ------------------------------------------------------------------ */

section('1. 判定表（假 store 驱动纯函数）')

{
  // 验收里那条「未登录访问 /admin 不加载 admin chunk」：闸门在组件解析前改道，
  // 后台 chunk 的 loader 根本不会被调用，而这里连探针都不该发（省一发注定 401 的 /auth/me）。
  const { deps, calls } = fakeDeps({ serverAuth: 'guest' })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check('游客访问 /admin → 改道登录页且不探针', isLoginRedirect(result), result)
  check('游客访问 /admin → bootstrap 未被调用', calls.bootstrap === 0, calls)
}

{
  // 前台那两页（账号中心 / 推荐）沿用改动前的行为，必须原样保留。
  const { deps } = fakeDeps({ serverAuth: 'guest' })
  const result = await resolveAdminGate({ meta: { storePage: 'account', requiresAuth: true } }, deps)
  check('游客访问需登录的前台页 → 改道登录页', isLoginRedirect(result), result)
}

{
  // 会话提示还在（服务端没判 guest）：交给闸门做确定性探针，探针通过就放行。
  const { deps, calls } = fakeDeps({ serverAuth: 'admin', bootstrap: true })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check('会话提示在 + 探针通过 → 放行', result === true, result)
  check('探针通过 → 不切登录屏', calls.showLogin === 0, calls)
  check('会话提示在 → 恰好探针一次', calls.bootstrap === 1, calls)
}

{
  // 有 cookie 但不是管理员：`/store-admin/v1/overview` 返回 403 → bootstrap false。
  // 这条**放行**到 /admin：后台登录屏就在 AdminLayout 里，挡掉它等于让非管理员账号
  // 再也看不到后台登录入口。切登录屏状态 + 放行是这里唯一不丢功能的组合。
  const { deps, calls } = fakeDeps({ serverAuth: 'user', bootstrap: false })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check('探针失败（非管理员/会话过期）→ 放行到后台登录屏', result === true, result)
  check('探针失败 → 切回登录屏状态', calls.showLogin === 1, calls)
}

{
  // 游客这一侧不能落到上面那条支路：`showLogin()` 会把外壳属性写成 guest，
  // 而 guest 必须走「换页」而不是「显示登录屏」——这两条一起才构成「不下发 chunk」。
  const { deps, calls } = fakeDeps({ serverAuth: 'guest', bootstrap: false })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check(
    '游客（即使探针会失败）→ 仍是换页，且不探针/不切屏',
    isLoginRedirect(result) && calls.bootstrap === 0 && calls.showLogin === 0,
    { result, calls },
  )
}

{
  // 已经在后台里跳页：phase 已是 ready，不能每跳一次都再探一发。
  const { deps, calls } = fakeDeps({ serverAuth: 'admin', phase: 'ready' })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check('已确认会话 → 放行', result === true, result)
  check('已确认会话 → 不重复探针', calls.bootstrap === 0, calls)
}

{
  // 兜底契约：探针抛错不该让导航整个失败（那就是白屏），仍走「切登录屏 + 放行」这条确定性路径。
  const { deps, calls } = fakeDeps({ serverAuth: 'admin', throws: true })
  const result = await resolveAdminGate(
    { meta: { area: 'admin', requiresAuth: true } },
    deps,
  )
  check('探针抛错 → 放行到后台登录屏（导航不挂在异常上）', result === true, result)
  check('探针抛错 → 切回登录屏状态', calls.showLogin === 1, calls)
}

{
  // 闸门只该管后台：前台的商品页、无需登录的页、以及完全没有 meta 的路由都要原样放行。
  const cases = [
    ['前台首页（无 meta）', {}],
    ['前台商品页', { meta: { storePage: 'products' } }],
    ['meta 字段缺失', { meta: {} }],
  ]
  for (const [label, route] of cases) {
    const { deps, calls } = fakeDeps({ serverAuth: 'admin' })
    const result = await resolveAdminGate(route, deps)
    check(`${label} → 放行且不探针`, result === true && calls.bootstrap === 0, { result, calls })
  }
}

/* ------------------------------------------------------------------ *
 * 2. 路由表契约
 * ------------------------------------------------------------------ */

section('2. 路由表契约（读 router/index.ts 源码）')

/** 取一条顶层路由记录的源码片段：从 `path: "<literal>"` 到下一个顶层记录（两空格缩进的 `{`）。 */
function routeRecord(pathLiteral) {
  const start = ROUTER_SOURCE.indexOf(`path: ${pathLiteral}`)
  if (start === -1) return ''
  const end = ROUTER_SOURCE.indexOf('\n  {', start)
  return ROUTER_SOURCE.slice(start, end === -1 ? ROUTER_SOURCE.length : end)
}

const adminRecord = routeRecord('"/admin/:page?/:tab?"')
check('路由表里能找到 /admin 记录', adminRecord !== '', adminRecord.slice(0, 80))
check('/admin 记录带 meta.area = "admin"', adminRecord.includes('area: "admin"'), adminRecord)
check('/admin 记录带 meta.requiresAuth = true', adminRecord.includes('requiresAuth: true'), adminRecord)

// 懒加载是「未登录不下发后台 bundle」的前提：静态 import 会让 chunk 跟着入口包一起发，
// 那时闸门再早也拦不住。组件走的是模块级 `const AdminLayout = () => import(...)` 绑定，
// 所以要同时钉住「绑定本身是函数式 import」与「记录引用的就是这个绑定」。
check(
  '后台组件绑定成懒加载（const AdminLayout = () => import(...)）',
  ROUTER_SOURCE.includes('const AdminLayout = () => import("@store/features/admin/views/AdminLayout.vue")'),
  '',
)
check(
  '/admin 引用该懒加载绑定，且没有静态 import 后台组件',
  /component:\s*AdminLayout\b/.test(adminRecord) && !/import\s+AdminLayout\s+from/.test(ROUTER_SOURCE),
  adminRecord,
)

// 守卫必须**委托**给纯函数：只加 meta 不加守卫，meta 就是死装饰（vue-router 自身不认它）。
check('beforeEach 委托 resolveAdminGate', ROUTER_SOURCE.includes('resolveAdminGate(to, {'), ROUTER_SOURCE.length)
check(
  '且从 ./admin-guard 导入',
  /import\s*\{\s*resolveAdminGate\s*\}\s*from\s*"\.\/admin-guard"/.test(ROUTER_SOURCE),
  '',
)

// 常量与真实登录路由对上：写错路径的守卫会把人送到一个 404。
check(
  '回落路径常量指向真实登录路由',
  STORE_LOGIN_PATH === '/user/authentication/login' &&
    ROUTER_SOURCE.includes('path: "/user/authentication/:mode(login|register|forget)"'),
  STORE_LOGIN_PATH,
)

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

report('商店后台路由闸门回归')
