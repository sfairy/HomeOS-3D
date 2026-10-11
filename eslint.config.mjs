// @ts-check

/**
 * 仓库根 ESLint 配置：只管**构建与门禁脚本**（`ops/**`）。
 *
 * 为什么需要它
 * ------------
 * `ops/` 下有 9 个 `.mjs`/`.ts`：vite 共用构建助手、vue-tsc 包装、以及本会话新写的一批
 * **解析型门禁**（`check-*.mjs`、`studio_slice_*.mjs`、`restore_import_formatting.mjs`）。
 * 在它之前，这些文件**没有任何 lint**：
 *
 *   - 根 `package.json` 没有 lint 脚本，根目录也没有 eslint 配置；
 *   - 两个前端的 `lint:ci` 只 glob `src/**`（配置里虽写了 `scripts/**`，CLI glob 才是真的）；
 *   - `knip` 覆盖它们，但把 `ops/**` 当 **entry**（见 `knip.config.ts`）—— entry 永远不算「未使用」，
 *     所以 `unused-imports` / `no-empty` 这类**抓 bug** 的规则一条都没上。
 *
 * 一条规则核（`ops/eslint/frontend-core.mjs`）同时喂三个前端与这里，理由见该文件头：
 * 「同一套规则」写成三份，漂移是静默的。
 *
 * 覆盖边界：只 `ops/**`。前端脚本（`homeos/frontend/scripts/*.mjs`）由前端自己的配置管
 * （`homeos/frontend/eslint.config.js` 的 `APP_FILES` 已含 `scripts/**`，`lint:ci` glob 已对齐）。
 *
 * 风格：`ops/` 是构建/工具代码，**不套任何一个前端的风格**（既不单引号也不双引号），
 * 只保留抓 bug 的那批规则。与 `packages/shared` 的理由相同 —— 工具脚本全树混用两种引号,
 * 统一它只会制造一次无意义的整树重排。
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
    // `coreRules` 的 `no-console` 是给**浏览器应用**定的（只放行 warn/error）。`ops/**` 是
    // **命令行工具**：`console.log` 就是它的输出通道（dev 服务器日志、切片工具的进度、
    // 门禁的 `✓/✗` 报告），关掉它等于要求这些脚本去重新发明 stdout。所以这一个仓库位置
    // 显式豁免 —— 豁免写在这里，而不是在每条规则旁边加 `eslint-disable`。
    rules: { 'no-console': 'off' },
  }),
  tsBlock({ files: OPS_TS_FILES, ignores: OPS_IGNORES, rules: { 'no-console': 'off' } }),
]
