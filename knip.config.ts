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
  entry: ['ops/**/*.{mjs,js,ts}', 'package.json'],
  project: ['ops/**/*.{mjs,js,ts}', 'knip.config.ts', 'tsconfig.node.json'],
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
        'vite-quiet-logger.ts',
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
        // Stage 4 renderer.ts 拆分子模块：导出通过 Object.assign(PanelRenderer.prototype, …)
        // 运行时挂载（import * as geometryMethods + Object.assign），knip 不识别此消费模式
        'src/studio/app/renderer/core/renderer-geometry.ts': ['exports', 'types'],
      },
    },
    'homeos/packages/shared': {
      entry: ['src/index.ts', 'package.json'],
      project: ['src/**/*.{ts,js}'],
    },
    'homeos-store': {
      entry: [
        'frontend/index.html',
        'frontend/src/main.ts',
        'frontend/src/auth-bootstrap.ts',
        'frontend/vite.config.ts',
        'frontend/vite-quiet-logger.ts',
      ],
      project: ['frontend/src/**/*.{ts,vue,js}', 'frontend/*.ts'],
      ignore: ['frontend/public/**', 'dist/**'],
    },
  },
}

export default config
