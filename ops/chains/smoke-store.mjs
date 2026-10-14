/**
 * 商店侧冒烟链清单（`bun run verify:smoke`）。
 *
 * 后端步骤走 Python，前端步骤走 bun（只读源码 + 跑纯函数，不需要 node_modules）。
 * 两半放在同一条链里是有意的：商店是「一个产品、两棵树」，CI 里也就该只有一个入口 ——
 * 拆成两条链之后，总有一条会在改商店时被忘掉。
 *
 * 改动原因见 `ops/chains/common.mjs` 顶部（`&&` 短路 + `${PYTHON:-…}` 语义）。
 */
import { bun, py } from './common.mjs'

export default [
  py('homeos-store/scripts/smoke_store.py', '商店基础冒烟'),
  py('homeos-store/scripts/_store_api_smoke.py', '商店端点层（鉴权/回调/优惠码/提现/审计）'),
  py('homeos-store/scripts/_schema_drift_guard_smoke.py', '结构漂移护栏'),
  py('homeos-store/scripts/_commerce_recount_smoke.py', '商务对账重算'),
  py('homeos-store/scripts/_store_layout_smoke.py', '商店前端布局契约'),
  bun('homeos-store/scripts/_store_admin_guard_smoke.mjs', '商店后台路由闸门'),
  bun('homeos-store/scripts/_store_frontend_session_smoke.mjs', '商店首屏会话探针优先级链'),
  bun('homeos-store/scripts/_store_frontend_race_smoke.mjs', '商店前端竞态守卫（轮询/优惠码）'),
]
