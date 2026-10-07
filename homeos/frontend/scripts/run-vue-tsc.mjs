/**
 * vue-tsc 启动器：为 vue-tsc 指定它该用的 TypeScript。
 *
 * 为什么要这一层：
 *
 * 本仓库同时存在两个 TypeScript 主版本 —— 工作区根与 `homeos-store` 用 7.x（原生
 * 编译器，跑得快），而 `homeos/frontend` 与 `homeos/packages/shared` 用 6.x。原因是
 * vue-tsc 只支持到 6.x：它按 `typescript/lib/tsc` 这个子路径定位 tsc，而 7.x 的
 * `exports` 不再导出该子路径。
 *
 * 依赖被提升到工作区根以后，`node_modules/vue-tsc/index.js` 里的
 * `require.resolve('typescript/lib/tsc')` 会命中**根**的 7.x，于是直接
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`，前端 typecheck 整个跑不起来（vue-tsc 的 bin 不接
 * 受 tsc 路径参数，所以只能从外面把路径喂给它的 `run()`）。
 *
 * 这里用本文件自己的位置解析 TypeScript：沿着 `homeos/frontend/` 自下而上找，必然
 * 先命中 `homeos/frontend/node_modules/typescript`（6.x，bun 因版本冲突放在这里的
 * 嵌套副本），而不是仓库根的 7.x。两个主版本因此可以继续共存，不必把根的 7.x 降级。
 *
 * 参数与 `vue-tsc` 原样透传（`-p tsconfig.json --noEmit` 等由 @volar 的 quickstart
 * 从 process.argv 读取）。
 *
 * 回归防线：解析失败或解析到的 TypeScript 没有 `lib/tsc`（= 又拿到 7.x 了）时直接
 * 给出可操作的报错，而不是抛一句难懂的 exports 错。
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let tscPath
try {
  tscPath = require.resolve('typescript/lib/tsc')
} catch {
  console.error(
    [
      '[vue-tsc] 解析不到 frontend 自己的 TypeScript（typescript/lib/tsc）。',
      '',
      '这说明 homeos/frontend 依赖树里的 typescript 不是 6.x（vue-tsc 只支持到 6.x），',
      '很可能是依赖提升把它变成了工作区根的 7.x。处理办法：',
      '  bun install                       # 让 bun 按 bun.lock 重新铺一遍嵌套副本',
      '  node -e "console.log(require.resolve(\'typescript/lib/tsc\'))"  # 在 homeos/frontend 下核对',
      '',
      '若确实要升级到 TypeScript 7，需要同时换掉 vue-tsc（它尚不支持 7.x 的 exports 布局）。',
    ].join('\n'),
  )
  process.exit(1)
}

require('vue-tsc').run(tscPath)
