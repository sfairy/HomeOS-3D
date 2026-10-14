// @ts-check

/**
 * 商店前端（`homeos-store/frontend`）ESLint 配置。
 *
 * 规则核与主应用共用一份（`../ops/eslint/frontend-core.mjs`）：parser/插件装配 + 「抓 bug」那批
 * 规则（未使用 import、`any`、vue 陷阱）只能有一个真源。**只有风格两条**按本店既有约定给
 * （双引号 + 分号）：套上主应用的单引号/无分号规则会一次产生 5789 条警告（实测，且全是这两条），
 * 把那批 `--fix` 掉等于重写商店前端的每一行、git blame 全灭，而一条 bug 也抓不出来 ——
 * 所以只把商店里 45 条零散单引号（4 个文件）抹平，让「双引号 + 分号」这条规则的现存违规归零。
 * 完整实测数据与取舍写在 frontend-core.mjs 文件头。
 *
 * 与主应用同样的边界：**不 lint `vite.config.ts`**（主应用也没 lint 它）—— 构建配置的
 * 类型由根 `tsconfig.node.json` 的 `typecheck:node` 把关，风格规则对构建脚本只增噪音。
 */
import {
  STORE_STYLE,
  jsBlock,
  recommendedBlock,
  tsBlock,
  vueBlock,
  vueEssentialBlocks,
} from '../ops/eslint/frontend-core.mjs'

/** 与 package.json 的 lint 脚本 glob 一致；`public/` 是原样拷贝的静态资源，不参与 lint。 */
const STORE_TS_FILES = ['frontend/src/**/*.ts']
const STORE_JS_FILES = ['frontend/src/**/*.js']
const STORE_VUE_FILES = ['frontend/src/**/*.vue']
const STORE_FILES = [...STORE_TS_FILES, ...STORE_JS_FILES, ...STORE_VUE_FILES]

/**
 * 商店自己的门禁脚本（`homeos-store/scripts/**`，如 `check-store-deps.mjs`）。
 *
 * 它们此前落在「商店前端的 config 管不到、根 config 只管 `ops/**`」的缝里，等于零 lint ——
 * 这批脚本恰恰是判定依赖方向的判据本身，判据写错没人拦。与 `ops/**` 同属工具脚本，
 * 故只上抓 bug 的核：**不套商店前端的双引号 + 分号风格**（它们沿用仓库 JS 工具链的
 * 单引号 + 无分号），并豁免 `no-console`（打印结果就是它的输出通道）。
 */
const STORE_SCRIPT_FILES = ['scripts/**/*.{js,mjs}']

export default [
  {
    ignores: ['dist', 'node_modules', '.vite', 'frontend/public/**'],
  },
  recommendedBlock({ files: STORE_FILES }),
  ...vueEssentialBlocks(),
  jsBlock({ files: STORE_JS_FILES, style: STORE_STYLE }),
  tsBlock({ files: STORE_TS_FILES, style: STORE_STYLE }),
  vueBlock({ files: STORE_VUE_FILES, style: STORE_STYLE }),
  jsBlock({ files: STORE_SCRIPT_FILES, rules: { 'no-console': 'off' } }),
]
