/**
 * 两个前端（`homeos/frontend` 与 `homeos-store/frontend`）共用的 ESLint 规则核。
 *
 * 抽出的目的：抓 bug 的那批规则（未使用 import、`any`、vue 陷阱）写成两份会静默漂移。
 * 风格刻意不统一：主应用单引号、商店双引号 + 分号，各自按既有约定给（差异集中在 APP_STYLE / STORE_STYLE）。
 * `packages/shared` 的配置设计目标不同（需能独立安装并单独跑 lint），刻意不并入。
 * 本文件 import 的 eslint 工具链声明在仓库根 `package.json`，应用侧不再声明。
 */
import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import pluginVue from "eslint-plugin-vue";

/**
 * 抓 bug 的规则：两个前端逐条一致。
 * 不导出：它是 jsBlock/tsBlock/vueBlock 的内部拼装料，调用方只该按文件类型取块。
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
