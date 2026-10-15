import js from '@eslint/js';
import tsparser from '@typescript-eslint/parser';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint';

const IGNORES = ['dist/**', 'node_modules/**', '**/*.test.ts'];

/**
 * 共享包自己的 lint 配置：不继承任一前端的配置（本包必须能独立安装、独立跑）。
 *
 * `.vue` 也在这里查：`components/*.vue` 是两个前端共用的 SFC，若只留应用侧的 vue-tsc
 * （只查类型、不查规则），它们会失去规则检查。vue 段落与主应用
 * `homeos/frontend/eslint.config.js` 的 `.vue` 块对齐。
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'].map((config) => ({
    ...config,
    files: ['**/*.vue'],
    ignores: IGNORES,
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      // 共享包是两个前端 + 静态运行面共同依赖的**叶子**：这里漏出去一个 `any`，
      // 三个消费方就都失去了这一处的类型保护，而且是在自己的 `tsc` 里才暴露。
      // 存量已清零（`src/**/*.ts` 0 处），故按 error 收口；`.vue` 段落本来就是 error，
      // 此前只有 `.ts` 段落是 `off`，等于「同一个包、两种口径」。
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        sourceType: 'module',
        ecmaVersion: 2022,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/no-unused-vars': ['error', { ignorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-reserved-component-names': 'off',
      'vue/no-ref-as-operand': 'warn',
      'vue/no-side-effects-in-computed-properties': 'warn',
      'vue/no-mutating-props': ['warn', { shallowOnly: true }],
    },
  },
  {
    ignores: IGNORES,
  },
);
