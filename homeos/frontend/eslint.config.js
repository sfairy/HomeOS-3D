// @ts-check

import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import unusedImports from 'eslint-plugin-unused-imports'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

const baseRules = {
  'no-unused-vars': 'off',
  'unused-imports/no-unused-imports': 'error',
  'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  semi: ['warn', 'never'],
  quotes: ['warn', 'single'],
  'comma-dangle': ['warn', 'always-multiline'],
  indent: 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-useless-assignment': 'off',
  'preserve-caught-error': 'off',
}

/** 非 studio 源码（完整风格规则） */
const APP_FILES = ['src/**/*.{js,ts,vue}', 'scripts/**/*.{js,ts,mjs}']
const APP_IGNORES = ['src/studio/**']

export default [
  {
    ignores: ['dist', 'node_modules', '.vite'],
  },
  {
    ...js.configs.recommended,
    files: APP_FILES,
    ignores: APP_IGNORES,
  },
  ...pluginVue.configs['flat/essential'].map((config) => ({
    ...config,
    files: config.files ?? ['**/*.vue'],
    ignores: [...(config.ignores ?? []), ...APP_IGNORES],
  })),
  {
    files: APP_FILES,
    ignores: APP_IGNORES,
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'][arguments.0.value='zh-CN']",
          message: '请使用 @/utils/format/locale-format.util 中的语义化函数',
        },
        {
          selector:
            "MemberExpression[object.property.name='attributes'][property.name='friendly_name']",
          message:
            '实体展示名请使用 getEntityDisplayName(entityId, entity)，见 @/utils/entity/derived.util',
        },
      ],
    },
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.{js,mjs}'],
    ignores: APP_IGNORES,
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: baseRules,
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    ignores: APP_IGNORES,
    languageOptions: {
      ecmaVersion: 2022,
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    rules: {
      ...baseRules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    },
  },
  {
    files: ['src/**/*.vue'],
    ignores: APP_IGNORES,
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        sourceType: 'module',
        ecmaVersion: 2022,
        extraFileExtensions: ['.vue'],
      },
      globals: globals.browser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    rules: {
      ...baseRules,
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
    files: [
      'src/components/**/*.{ts,vue}',
      'src/stores/**/*.ts',
      'src/utils/**/*.ts',
      'src/composables/**/*.ts',
    ],
    ignores: APP_IGNORES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/views/**', '@/views/*', '@/features/**', '@/features/*'],
              message:
                'components/stores/utils/composables 禁止 import @/views/** 与 @/features/**；跨页常量请放 @/utils/registry 或 composables',
            },
          ],
        },
      ],
    },
  },
  // utils 叶子层：禁止回指 composables / stores / components
  {
    files: ['src/utils/**/*.{js,ts}'],
    ignores: APP_IGNORES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/composables/**',
                '@/stores/**',
                '@/components/**',
                '@/views/**',
                '@/features/**',
              ],
              message:
                'utils 禁止 import composables/stores/components/views/features；见 npm run check:frontend-deps 白名单清零计划',
            },
          ],
        },
      ],
    },
  },
  // studio：仅 unused-imports（不套风格规则；类型由 typecheck 把关）
  {
    files: ['src/studio/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      parser: tsparser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // 历史 studio 大量解构占位；只卡未使用 import，避免 max-warnings 0 被淹没
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'off',
    },
  },
  // studio/shared：禁止回指 editor/renderer（叶子层）
  {
    files: ['src/studio/app/shared/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/editor/**', '../editor/**', '../../editor/**', '@app/editor/**'],
              message: 'app/shared 禁止 import app/editor；下沉到 editor 或 platform',
            },
            {
              group: ['**/renderer/**', '../renderer/**', '../../renderer/**', '@app/renderer/**'],
              message: 'app/shared 禁止 import app/renderer；下沉到 renderer 或 platform',
            },
          ],
        },
      ],
    },
  },
  // studio/platform：真叶子
  {
    files: ['src/studio/platform/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@app/editor/**',
                '@app/renderer/**',
                '@app/3d-studio/**',
                '@app/display/**',
                '**/app/editor/**',
                '**/app/renderer/**',
                '**/app/3d-studio/**',
              ],
              message: 'platform 禁止 import creator/panel 应用层',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/studio/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        sourceType: 'module',
        ecmaVersion: 2022,
        extraFileExtensions: ['.vue'],
      },
      globals: globals.browser,
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-reserved-component-names': 'off',
    },
  },
]
