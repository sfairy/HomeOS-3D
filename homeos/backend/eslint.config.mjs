// @ts-check

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // 类型相关
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'warn',
      '@typescript-eslint/no-unsafe-declaration-merging': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      // NestJS 空 Module 类为框架惯例
      '@typescript-eslint/no-extraneous-class': 'off',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',

      // 代码风格（与现有 NestJS/TS 代码一致：分号、单引号）
      semi: ['warn', 'always'],
      quotes: ['warn', 'single'],
      'comma-dangle': ['warn', 'always-multiline'],
      indent: 'off',

      // 最佳实践
      'no-console': 'warn',
      // ESLint 10 recommended 新增规则，与既有代码风格不一致
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // modules 业务层禁止裸 throw new Error，须用 BusinessException + API_ERROR
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            'backend/src/modules 内禁止 throw new Error，请使用 BusinessException + API_ERROR',
        },
      ],
    },
  },
  {
    // common 不得依赖 modules（共享层 → 特性层倒置）
    files: ['src/common/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**', '*/modules/*', '../*/modules/*', '../../modules/**'],
              message:
                'backend/src/common 禁止 import modules/*；请经端口注入或将编排代码迁到 modules',
            },
          ],
        },
      ],
    },
  },
);
