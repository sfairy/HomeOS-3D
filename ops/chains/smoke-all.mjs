/**
 * 全部冒烟链（`bun run verify:smoke:all`）。
 *
 * 四条子链各自也是一个 `run-chain` 清单；这里再包一层是为了让「哪条子链失败」
 * 在汇总里直接可见（原先是 `&&` 链，第一条失败后面的三条连跑都不跑）。
 *
 * 注：`run-chain.mjs` 默认并发 `min(4, CPU)`，所以四条子链默认是**并行**跑完的（每个
 * 步骤的输出仍按清单顺序整段打印，不会交错）。四条链的临时数据目录都是各自 mkdtemp，
 * 授权夹具的端口也是向内核现要的，因此并行不共享状态；但如果本机资源紧张、或排查
 * 「某条链单独跑是绿的、一起跑才红」这类现象，先降到串行再复现：
 *
 *     node ops/lib/run-chain.mjs --concurrency 1 ops/chains/smoke-all.mjs
 */
import { bun } from './common.mjs'

export default [
  bun('verify:smoke:frontend', '前端纯逻辑冒烟'),
  bun('verify:smoke:app', '主应用端到端冒烟'),
  bun('verify:smoke', '授权商店后端冒烟'),
  bun('verify:smoke:license', '授权激活端到端'),
]
