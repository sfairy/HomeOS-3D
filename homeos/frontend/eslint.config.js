// @ts-check

import fs from 'node:fs'
import globals from 'globals'
import unusedImports from 'eslint-plugin-unused-imports'
import tsparser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'
// 规则核与商店（`homeos-store/eslint.config.js`）共用：parser/插件装配 + 「抓 bug」那批规则
// 只能有一份，否则某天只在一边加规则、另一边静默少一条。分离出来的**只有风格两条**
// （`APP_STYLE`）—— 商店全树是双引号 + 分号，实测 5789 条存量差异全是这两条，理由见该文件头。
import {
  APP_STYLE,
  jsBlock,
  recommendedBlock,
  tsBlock,
  vueBlock,
  vueEssentialBlocks,
} from '../../ops/eslint/frontend-core.mjs'

/** 非 studio 源码（完整风格规则） */
const APP_FILES = ['src/**/*.{js,ts,vue}', 'scripts/**/*.{js,ts,mjs}']
const APP_IGNORES = ['src/studio/**']

/**
 * 域边界（与 scripts/check-frontend-deps.mjs 同规则）。
 *
 * 自动枚举 `src/features/` 下的域，为每个域生成「禁止深引用别的域」的规则 —— 新增域无需改这里。
 * **权威清单是那个脚本**（它带白名单与过期检测）；这里只提前给编辑器反馈。
 */
const FEATURE_DOMAINS = fs
  .readdirSync(new URL('./src/features/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/** 存量豁免：与脚本白名单对应，收敛后一并删除。 */
const CROSS_DOMAIN_EXEMPT = [
  // 空 —— P2 试点已把 settings → security 的深引用改走域根 barrel。
]

const crossDomainBlocks = FEATURE_DOMAINS.map((domain) => ({
  files: [`src/features/${domain}/**/*.{js,ts,vue}`],
  ignores: [...APP_IGNORES, ...CROSS_DOMAIN_EXEMPT],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: FEATURE_DOMAINS.filter((other) => other !== domain).flatMap((other) => [
              `@/features/${other}/**`,
              `@/features/${other}/*`,
            ]),
            message:
              '跨域引用只能走域根 barrel（import "@/features/<域>"）；域内细节不外借，需要就下沉到 shared',
          },
        ],
      },
    ],
  },
}))

export default [
  {
    ignores: ['dist', 'node_modules', '.vite'],
  },
  recommendedBlock({ files: APP_FILES, ignores: APP_IGNORES }),
  ...vueEssentialBlocks({ ignores: APP_IGNORES }),
  {
    files: APP_FILES,
    ignores: APP_IGNORES,
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'][arguments.0.value='zh-CN']",
          message: '请使用 @/shared/utils/format/locale-format.util 中的语义化函数',
        },
        {
          selector:
            "MemberExpression[object.property.name='attributes'][property.name='friendly_name']",
          message:
            '实体展示名请使用 getEntityDisplayName(entityId, entity)，见 @/shared/entity/utils/derived.util',
        },
      ],
    },
  },
  jsBlock({
    files: ['src/**/*.js', 'scripts/**/*.{js,mjs}'],
    ignores: APP_IGNORES,
    style: APP_STYLE,
  }),
  tsBlock({
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    ignores: APP_IGNORES,
    style: APP_STYLE,
  }),
  vueBlock({
    files: ['src/**/*.vue'],
    ignores: APP_IGNORES,
    style: APP_STYLE,
  }),
  {
    files: [
      'src/components/**/*.{ts,vue}',
      'src/stores/**/*.ts',
      'src/composables/**/*.ts',
    ],
    ignores: [...APP_IGNORES],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/views/**', '@/views/*', '@/features/**', '@/features/*'],
              message:
                'components/stores/utils/composables 禁止 import @/views/** 与 @/features/**；跨页常量请放 @/shared/utils/registry 或 composables',
            },
          ],
        },
      ],
    },
  },
  // shared 是 DAG 的底：共享域被 stores/constants/composables/utils 反向依赖，
  // 自己不得回头依赖上层（与 check-frontend-deps.mjs 同规则）。
  {
    files: ['src/shared/**/*.{js,ts,vue}'],
    ignores: [...APP_IGNORES],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/stores/**',
                '@/composables/**',
                '@/components/**',
                '@/views/**',
                '@/features/**',
                '@/layouts/**',
              ],
              message:
                'shared 禁止反向依赖 stores/composables/components/views/features/layouts（会被下层反向依赖，倒置即失效）',
            },
          ],
        },
      ],
    },
  },
  // 注：根级 `src/utils/` 已在 P2 utils 收尾批清零（全部并入 `src/shared/`），
  // 原先针对它的「叶子层禁止回指 composables/stores/components」独立块随之删除 ——
  // 上面 `src/shared/**` 那块已覆盖同一约束（且更严），留着只会是永不命中的死配置。
  // 「叶子消费者不得 import shared 域 barrel」这条规则**只在** scripts/check-frontend-deps.mjs 里
  // 实现（用 `/^@\/shared\/[^/]+$/` 精确匹配）。ESLint 的 group 是 gitignore 语义，`@/shared/<域>`
  // 不带通配符也会连 `@/shared/<域>/utils/x` 一起命中，写在这里只会产生假阳性。
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
  ...crossDomainBlocks,
]
