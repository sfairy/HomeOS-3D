/**
 * vue-tsc 启动器（**全仓唯一一份**）：为 vue-tsc 指定它该用的 TypeScript。
 *
 * 两个前端（`homeos/frontend` 与 `homeos-store`）的 `typecheck` 都调本文件；副本各自维护会
 * 两边行为漂移，故收敛为一份。
 *
 * 全仓统一 TypeScript 6.x（vue-tsc 只支持到 6.x：它按 `typescript/lib/tsc` 子路径
 * 定位 tsc，而 7.x 的 `exports` 不再导出该子路径）。依赖经 bunfig.toml 的 hoisted
 * linker 提升到工作区根 `node_modules`，本脚本用 createRequire 解析到根上的 6.x
 * （从 `ops/` 向上走即到仓库根，与从任一 `<app>/scripts/` 向上走落在同一个 node_modules）。
 *
 * 参数与 `vue-tsc` 原样透传（`-p tsconfig.json --noEmit` 等由 @volar 的 quickstart
 * 从 process.argv 读取）；`-p` 是相对**调用方 cwd** 解析的，故调用方仍必须在自己目录下执行。
 *
 * 回归防线：解析失败或解析到的 TypeScript 没有 `lib/tsc`（= 误拿到 7.x）时直接
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
      '[vue-tsc] 解析不到 TypeScript 6.x（typescript/lib/tsc）。',
      '',
      'vue-tsc 只支持到 6.x。请确认工作区根已安装 typescript@6，且未被 7.x 覆盖：',
      '  bun install                       # 按 bun.lock 重装到根 node_modules',
      '  node -e "console.log(require(\'typescript/package.json\').version)"',
      '',
      '若确实要升级到 TypeScript 7，需要同时换掉 vue-tsc（它尚不支持 7.x 的 exports 布局）。',
    ].join('\n'),
  )
  process.exit(1)
}

require('vue-tsc').run(tscPath)
