/**
 * 两个前端（`homeos/frontend` 与 `homeos-store/frontend`）共用的 ESLint 规则核（P5 抽取）。
 *
 * 为什么抽：两份配置唯一的差别本该只是「文件范围 + 风格两条」，但各写一份 parser / 插件 / 规则清单
 * 时，**抓 bug 的那批规则**（未使用 import、`any`、vue 陷阱）漂移是静默的 —— 某天只在主应用加了
 * `vue/no-mutating-props`，商店就永久少一条，而没有任何门禁会说话。这类「两份配置声称同一套规则」
 * 的表格，本项目里已经栽过一次（docker.yml ↔ checks.yml，见 .github/workflows/checks.yml 顶注）。
 *
 * 刻意**没有**统一的部分 —— **风格**：
 *
 *   商店实测（把主应用规则集原样套到商店 75 个源文件上）**0 errors / 5789 warnings，且 5789 条
 *   全部是 `semi`(3107) + `quotes`(2682)** —— 换句话说商店代码在「抓 bug」口径上本来就干净，
 *   分歧只在写法：它全树是**双引号 + 分号**。所以风格两条各自按既有约定给，`--fix` 只用来抹平
 *   商店里 45 条零散单引号（4 个文件、30 行），**不**把那 5789 条按主应用风格整树重写 ——
 *   那等于重写商店前端几乎每一行：git blame 全灭、真评审被风格噪音淹掉，换来的只是
 *   「两个应用的引号一样」。差异集中在 `APP_STYLE` / `STORE_STYLE` 两个常量里 ——
 *   想统一的那天，改代码 + 改一个常量即可，不会有第二处。
 *
 * 只收**实测确有的重复**：parser/插件装配、coreRules、flat/essential 的映射方式。
 *
 * 刻意**没有**动的第三份配置 —— `packages/shared/eslint.config.mjs`：
 *
 *   它看着和这里「同一套规则」，其实两处设计目标不同：共享包必须能**独立安装、独立跑**它的
 *   lint（它是 `@homeos/shared` 的源码，会被单独 checkout / 发布），所以它的配置不能去 import
 *   一个位于包外两层的 `ops/`；而且它跑的是 `typescript-eslint` 的 recommended 全集 + 伞包
 *   （`typescript-eslint`），两个应用跑的是**挑出来**的一套（`no-explicit-any` 硬 error、
 *   风格规则按应用定）。硬合会把「两个前端的门槛」与「共享包的门槛」绑成一件事。
 *
 * 依赖归属：本文件 import 的 eslint 工具链声明在**仓库根** `package.json`（`ops/` 属根 workspace）。
 * 因此两个应用的 `package.json` 里**不再**声明 `@eslint/js` / `eslint-plugin-vue`（各自的配置
 * 只 import 本文件的工厂函数）—— 留着它们会被 `knip` 报成未使用的 devDependency，那是**对的**：
 * 应用侧真的不再直接 import 它们。这与 P3e「vue-tsc 依赖归属移到根」是同一个道理。
 */
import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import pluginVue from "eslint-plugin-vue";

/**
 * 抓 bug 的规则：两个前端逐条一致（含 `comma-dangle` —— 两边都已合规，实测 0 条）。
 *
 * 不导出：它是 `jsBlock`/`tsBlock`/`vueBlock` 的内部拼装料，调用方只该按「文件类型」取块；
 * 导出出去就会有人直接 spread 一份，那时两边的规则核又开始各自漂移（knip 也会报未使用导出）。
 */
const coreRules = {
  "no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "no-console": ["warn", { allow: ["warn", "error"] }],
  "comma-dangle": ["warn", "always-multiline"],
  indent: "off",
  "no-empty": ["error", { allowEmptyCatch: true }],
  // 这两条是 eslint 10 的新规则，存量代码命中即为噪音，显式关掉（关掉也是一种声明）。
  "no-useless-assignment": "off",
  "preserve-caught-error": "off",
};

/** 主应用风格：单引号、无分号（`homeos/frontend` 全树既有约定）。 */
export const APP_STYLE = {
  semi: ["warn", "never"],
  quotes: ["warn", "single"],
};

/** 商店风格：双引号、带分号（`homeos-store/frontend` 全树既有约定，见文件头实测数据）。 */
export const STORE_STYLE = {
  semi: ["warn", "always"],
  quotes: ["warn", "double"],
};

const TS_PLUGINS = { "@typescript-eslint": tseslint, "unused-imports": unusedImports };

const TS_LANGUAGE_OPTIONS = {
  ecmaVersion: 2022,
  parser: tsparser,
  parserOptions: { sourceType: "module", ecmaVersion: 2022 },
  globals: { ...globals.browser, ...globals.node },
};

const VUE_LANGUAGE_OPTIONS = {
  parser: vueParser,
  parserOptions: {
    parser: tsparser,
    sourceType: "module",
    ecmaVersion: 2022,
    extraFileExtensions: [".vue"],
  },
  globals: globals.browser,
};

/**
 * `@eslint/js` 的 `recommended` 块（`files` 必填：两边的文件范围不同，只有调用方知道该管哪些文件）。
 *
 * 不解构 `configs.recommended` 再展开，是因为它自带的键随 eslint 版本变化，直接透传最稳。
 */
export function recommendedBlock({ files, ignores = [] }) {
  return { ...js.configs.recommended, files, ignores };
}

/** 裸 `.js` / `.mjs` 块：只上 coreRules 风格规则，不引入 TS parser。 */
export function jsBlock({ files, ignores = [], style, rules = {} }) {
  return {
    files,
    ignores,
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "unused-imports": unusedImports },
    rules: { ...coreRules, ...style, ...rules },
  };
}

/** `.ts` / `.tsx` 块（含 `any` 与 type-import 两条 TS 专属规则）。 */
export function tsBlock({ files, ignores = [], style, rules = {} }) {
  return {
    files,
    ignores,
    languageOptions: TS_LANGUAGE_OPTIONS,
    plugins: TS_PLUGINS,
    rules: {
      ...coreRules,
      ...style,
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      ...rules,
    },
  };
}

/** `.vue` 块：template 走 vue-parser，`<script>` 段再交给 tseslint。 */
export function vueBlock({ files, ignores = [], style, rules = {} }) {
  return {
    files,
    ignores,
    languageOptions: VUE_LANGUAGE_OPTIONS,
    plugins: TS_PLUGINS,
    rules: {
      ...coreRules,
      ...style,
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "vue/no-unused-vars": ["error", { ignorePattern: "^_" }],
      "vue/multi-word-component-names": "off",
      "vue/no-reserved-component-names": "off",
      "vue/no-ref-as-operand": "warn",
      "vue/no-side-effects-in-computed-properties": "warn",
      "vue/no-mutating-props": ["warn", { shallowOnly: true }],
      ...rules,
    },
  };
}

/**
 * `pluginVue.configs['flat/essential']` 的映射：补上内建块缺失的 `files`（默认为全部 `.vue`）
 * 与调用方自己的 `ignores`。
 *
 * （注释里不能直接写那条 `files` 字面量：它含有会提前闭合块注释的字符序列。）
 *
 * 抽在这里还有个副作用是好的：升级 eslint-plugin-vue 时，两边的 flat 配置形状一起更新，
 * 不会出现「主应用跑的是新形状、商店还挂着一个 eslint 已经把 `files` 语义改掉的旧块」。
 */
export function vueEssentialBlocks({ ignores = [] } = {}) {
  return pluginVue.configs["flat/essential"].map((config) => ({
    ...config,
    files: config.files ?? ["**/*.vue"],
    ignores: [...(config.ignores ?? []), ...ignores],
  }));
}
