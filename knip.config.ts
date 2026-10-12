/**
 * Knip：JS/TS 未使用文件/导出/依赖扫描。
 *
 * 动态入口白名单：
 * - classic IIFE（vite-studio classicEntries）
 * - studio/runtime/**（interaction3d 按需下发）
 * - studio/shims/**（tsconfig 路径别名，运行期外置）
 * - utils/registry、popup-registry（字符串 key / 动态查找）
 */
import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  // 未使用文件 / 未声明依赖为硬错误；导出面与 shim 重复导出保留为报告项（大量公共 API）
  rules: {
    files: 'error',
    dependencies: 'error',
    unlisted: 'error',
    binaries: 'error',
    exports: 'error',
    types: 'error',
    nsExports: 'off',
    duplicates: 'error',
  },
  // ⚠ monorepo 下顶层的 `entry` / `project` 不会被采纳。本仓库的 package.json 声明了
  // workspaces，knip 会把顶层这两个 glob 报成 `unused top-level entry / project`
  // （Configuration hints），即它们对任何文件都不生效 —— 于是 ops 下的脚本只剩
  // 「被 package.json scripts 引用」这一条入口来源。
  // 根工作区必须用 `'.'` 显式声明，见下方 workspaces。
  ignore: [
    'dist/**',
    '**/node_modules/**',
    '**/.vite/**',
    'design/**',
    'homeos/backend/**',
    'homeos-store/backend/**',
    'homeos-store/db/**',
    'homeos/data/**',
    'homeos-store/data/**',
    'ops/cleanup-reports/**',
  ],
  ignoreDependencies: ['javascript-obfuscator'],
  workspaces: {
    '.': {
      // ops/** 下的脚本是「手工运行的 CLI」：没有被任何模块 import，而 knip 只把
      // package.json scripts 引用到的文件当入口。不登记时它们会被判为 unused files，
      // 且未成为入口 → 不可达 → lib/ 里的 import 不计入使用，lib 的导出被误报为 unused exports。
      // （根目录的 eslint.config.mjs 由 knip 的 ESLint 插件自带入口，导出亦豁免，无需列举。）
      entry: ['ops/**/*.{mjs,js,ts}', 'package.json'],
      project: ['ops/**/*.{mjs,js,ts}', 'knip.config.ts'],
      // 入口文件默认不报「未使用导出」，但 ops/ui-audit/lib/*.mjs 是被脚本共享的模块、
      // 不是 CLI 本身，必须继续受检 —— 否则等于用「不报噪声」换「静默丢覆盖」。
      // 实测：开启后往 lib/scan.mjs 注入一个无引用导出会被正常报出。
      includeEntryExports: true,
      // 入口文件内自用（含局部 helper 导出）不算未使用，避免 CLI 工具误报。
      ignoreExportsUsedInFile: true,
    },
    homeos: {
      entry: ['scripts/**/*.{mjs,js,ts}', 'package.json'],
      project: ['scripts/**/*.{mjs,js,ts}'],
    },
    'homeos/frontend': {
      entry: [
        'index.html',
        'src/main.ts',
        'vite.config.ts',
        'vite.runtime.config.ts',
        'vite-studio.ts',
        'vite-plugin-*.ts',
        // eslint 配置本身也是「被读过才知道依赖谁」的文件：不列进来，它 import 的
        // @eslint/js / eslint-plugin-vue 就会被误报成未使用的 devDependency（P5 实测）。
        'eslint.config.js',
        'scripts/**/*.{ts,mjs,js}',
        'src/studio/runtime/**/*.ts',
        // classic IIFE / Worker 入口（见 vite-studio.ts classicEntries）
        'src/studio/app/logging/client-log.ts',
        'src/studio/app/display/display-boot.ts',
        'src/studio/app/display/display-startup.ts',
        'src/studio/app/auth/scene/scene-depth.ts',
        'src/studio/app/3d-studio/export/draco-decoder-worker.ts',
        // tsconfig paths → 运行期外置 shim
        'src/studio/shims/**/*.ts',
        // 编辑器选中态的**类型契约**：为「显式 state 袋」切片预置（宿主 `home.ts` 里那一族
        // 高频可变捕获收成 `editorSelection` 门面）。
        // 宿主接线前它还没有消费者，故显式列为根；接线完成后应从本清单移除。
        'src/studio/app/editor/selection/selection-state.ts',
      ],
      project: ['src/**/*.{ts,vue,js}', 'scripts/**/*.{ts,mjs,js}', '*.ts'],
      ignore: [
        'dist/**',
        'public/**',
        'src/**/*.d.ts',
        'src/studio/vite-env.d.ts',
      ],
      ignoreDependencies: ['autoprefixer', 'postcss', 'esbuild'],
      ignoreExportsUsedInFile: true,
      // 引擎 facade / 诊断 API / shim 双导出：保留导出面
      ignoreIssues: {
        'src/studio/engine/display-facade.ts': ['exports'],
        'src/studio/engine/index.ts': ['exports', 'types'],
        'src/studio/engine/facade-runtime.ts': ['exports', 'types'],
        'src/composables/ui/useBodyScrollLock.ts': ['exports'],
        'src/utils/ui/screensaver-background-idle.util.ts': ['exports'],
        'src/studio/shims/**': ['exports', 'types', 'nsExports', 'duplicates'],
        // renderer 拆分子模块：导出通过 Object.assign(PanelRenderer.prototype, …)
        // 运行时挂载（import * as … + Object.assign），knip 不识别此消费模式
        'src/studio/app/renderer/renderer-geometry.ts': ['exports', 'types'],
      },
    },
    'packages/shared': {
      entry: ['src/index.ts', 'package.json'],
      project: ['src/**/*.{ts,js}'],
    },
    'homeos-store': {
      entry: [
        'frontend/index.html',
        'frontend/src/main.ts',
        'frontend/src/auth-bootstrap.ts',
        'frontend/vite.config.ts',
        // P5 新加的 eslint 配置：不列进来，它 import 的 7 个 eslint 包会被误报成未使用的 devDependency。
        'eslint.config.js',
      ],
      project: ['frontend/src/**/*.{ts,vue,js}', 'frontend/*.ts'],
      ignore: ['frontend/public/**', 'dist/**'],
    },
  },
}

export default config
