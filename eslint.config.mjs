// @ts-check

/**
 * 仓库根 ESLint 配置：只管构建与门禁脚本（`ops/**`）。
 * 前端脚本由各自配置管；`ops/` 只保留抓 bug 的规则，不套任一前端的风格。
 */
import { jsBlock, recommendedBlock, tsBlock } from './ops/eslint/frontend-core.mjs'

/** `ops/` 下的脚本；`.mjs`/`.js` 走裸块，`.ts`（`ops/vite/build-helpers.ts`）走 TS 块。 */
const OPS_JS_FILES = ['ops/**/*.{mjs,js}']
const OPS_TS_FILES = ['ops/**/*.ts']
const OPS_ALL_FILES = [...OPS_JS_FILES, ...OPS_TS_FILES]

const OPS_IGNORES = ['ops/cleanup-reports/**']

export default [
  { ignores: ['**/node_modules/**', ...OPS_IGNORES] },
  // `@eslint/js` recommended：`no-undef` / `no-unreachable` 这类只有 linter 会说话的问题。
  recommendedBlock({ files: OPS_ALL_FILES, ignores: OPS_IGNORES }),
  jsBlock({
    files: OPS_JS_FILES,
    ignores: OPS_IGNORES,
    // ops/ 是命令行工具：console.log 就是它的输出通道，故豁免 no-console。
    rules: { 'no-console': 'off' },
  }),
  tsBlock({ files: OPS_TS_FILES, ignores: OPS_IGNORES, rules: { 'no-console': 'off' } }),
]
