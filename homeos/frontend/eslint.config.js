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

export default [
  { ignores: ['dist', 'node_modules', '.vite'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.js', '**/*.ts', '**/*.vue'],
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
    files: ['**/*.js'],
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
    files: ['**/*.ts'],
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
      // TypeScript 已做未定义检查；no-undef 会误报 env.d.ts 中的接口类型名
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
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
      'vue/no-mutating-props': 'warn',
    },
  },
  {
    // components / stores / utils / composables 不得反向依赖 views（注册表等应在 utils/registry）
    files: [
      'src/components/**/*.{ts,vue}',
      'src/stores/**/*.ts',
      'src/utils/**/*.ts',
      'src/composables/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@/views/**', '@/views/*'],
              message:
                'components/stores/utils/composables 禁止 import @/views/**；跨页常量请放 @/utils/registry 或 composables',
            },
          ],
        },
      ],
    },
  },
]
