/**
 * 首屏会话探针优先级链回归（`frontend/src/features/storefront/utils/session-probe.ts` + `StoreLayout.vue` 的接线）。
 *
 * 守护的改动：这条「要不要打一发 `/auth/me`」的判定原先内联在 `StoreLayout.vue` 的
 * `onMounted` 里（`state === "guest" ? false : state === "unknown" ? hinted || requiresAuth : true`）。
 * 商店前端没有组件级测试运行时，判定写错只会表现为「白打一发注定 401 的探针」或者反过来
 * 「已登录用户被当成游客、账号中心直接转登录页」——两种都很难在浏览器里一眼看出来。
 *
 * 两层断言，各管一件事：
 *
 * 1. **判定表**（纯函数）：服务端结论 / hint / 页面要求三个信号的各种组合。
 * 2. **接线契约**（读源码）：`StoreLayout.vue` 真的把这三个信号喂给了这个纯函数，
 *    而不是又留了一份内联三元表达式 —— 抽出去却没人用，等于没测。
 *
 * 用法：`bun run scripts/_store_frontend_session_smoke.mjs`（在 homeos-store 下执行）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { check, report, section } from '../../homeos/frontend/scripts/_smoke_harness.mjs'
import { shouldProbeSession } from '../frontend/src/features/storefront/utils/session-probe.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const LAYOUT_SOURCE = fs.readFileSync(
  path.join(here, '../frontend/src/features/storefront/views/StoreLayout.vue'),
  'utf8',
)

/* ------------------------------------------------------------------ *
 * 1. 判定表
 * ------------------------------------------------------------------ */

section('1. 判定表（服务端结论 > hint > 页面要求）')

{
  // 服务端已经确认这一页没有会话：无论 hint 怎么猜、页面要不要登录，都不要打探针。
  // 「hint 类是客户端上次的结论」，服务端刚解过会话，它更权威 —— 这条是省掉
  // 一发注定 401 的关键。
  for (const hinted of [true, false]) {
    for (const requiresAuth of [true, false]) {
      const probe = shouldProbeSession({ serverAuth: 'guest', hinted, requiresAuth })
      check(
        `guest + hint=${hinted} + 需登录=${requiresAuth} → 不打探针`,
        probe === false,
        probe,
      )
    }
  }
}

{
  // 服务端说有会话（user / admin）：打一发把账号、授权与订单读下来。
  for (const serverAuth of ['user', 'admin']) {
    const probe = shouldProbeSession({ serverAuth, hinted: false, requiresAuth: false })
    check(`${serverAuth} → 打探针`, probe === true, probe)
  }
}

{
  // 外壳没注入（老模板 / 静态托管）：退回「按 hint 猜」。
  const cases = [
    { hinted: true, requiresAuth: false, wanted: true, why: 'hint 说上次是登录态' },
    { hinted: false, requiresAuth: true, wanted: true, why: '这一页必须登录' },
    { hinted: false, requiresAuth: false, wanted: false, why: '既不提示也不要求' },
    { hinted: true, requiresAuth: true, wanted: true, why: '两个信号都指向登录态' },
  ]
  for (const { hinted, requiresAuth, wanted, why } of cases) {
    const probe = shouldProbeSession({ serverAuth: 'unknown', hinted, requiresAuth })
    check(`unknown + hint=${hinted} + 需登录=${requiresAuth}（${why}）→ ${wanted ? '打' : '不打'}`, probe === wanted, probe)
  }
}

{
  // 认不出的取值不能按「已登录」猜：服务端将来加取值时，宁可多发一发探针。
  for (const serverAuth of ['', 'weird', 'USER', '1']) {
    const probe = shouldProbeSession({ serverAuth, hinted: false, requiresAuth: false })
    check(`认不出的 data-auth（${JSON.stringify(serverAuth)}）→ 按 unknown 处理`, probe === false, probe)
    const required = shouldProbeSession({ serverAuth, hinted: false, requiresAuth: true })
    check(`认不出的 data-auth（${JSON.stringify(serverAuth)}）+ 需登录 → 仍打探针`, required === true, required)
  }
}

/* ------------------------------------------------------------------ *
 * 2. 接线契约
 * ------------------------------------------------------------------ */

section('2. 接线契约（读 StoreLayout.vue 源码）')

check(
  '从 utils/session-probe.js 导入纯函数',
  /import\s*\{\s*shouldProbeSession\s*\}\s*from\s*"@store\/features\/storefront\/utils\/session-probe"/.test(
    LAYOUT_SOURCE,
  ),
  '',
)
check(
  '三个信号都真的喂进去了（data-auth / hint 类 / 页面要求）',
  /shouldProbeSession\(\{[\s\S]{0,400}serverAuth:\s*serverAuthState\(\)[\s\S]{0,400}hb-auth-hint[\s\S]{0,400}requiresAuth:\s*requiresAuth\.value/.test(
    LAYOUT_SOURCE,
  ),
  '',
)
// 抽了却留着内联三元表达式 = 两套判定并存，改动只会生效一半（旧的那份仍然说话）。
check(
  '内联的三元判定已删除（不留第二份真相）',
  !/serverAuthState\(\)\s*===|state === "guest"/.test(LAYOUT_SOURCE),
  '',
)
check(
  '探针失败仍按「可降级」处理（留痕而不是静默）',
  /session\.fetchMe\(\)\.catch\(logAndIgnore/.test(LAYOUT_SOURCE),
  '',
)

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

report('商店首屏会话探针优先级链回归')
