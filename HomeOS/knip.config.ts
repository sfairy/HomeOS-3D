/**
 * knip 全仓死代码检测配置（bun workspaces monorepo）。
 *
 * 运行：bun run audit:deadcode
 * 说明：
 *  - 各 workspace 的 package.json scripts、index.html、prisma.config.ts、
 *    packages/shared 的 package.json exports 均由 knip 自动发现；
 *  - 此处仅补充脚本无法体现的入口（nest 隐式入口 main.ts、runtime 资产 version.js、
 *    bun test 的测试入口、Prisma 生成客户端：确保 @prisma/client runtime 子路径被识别，
 *    避免误报 @prisma/client 为 Unused dependency）；
 *  - ignoreBinaries：ioreg 是 macOS 内置硬件 UUID CLI，reg 是 Windows 注册表查询 CLI，
 *    二者均非 npm 包，knip 将 execSync('xxx …') 误报为 unlisted node binary。
 *  - 已知限制：knip 不解析 Vue SFC 的 <style src="..."> 外部 CSS 引用，
 *    故 frontend workspace 用 ignore 排除 CSS 文件（CSS 无 JS 导出，人工 grep 验证），
 *    这样 knip 既能成为干净的 CI 门禁（JS/TS 死代码归零），又不被 CSS 误报污染。
 *  - frontend/public/sw.js：PWA Service Worker，由 pwa-update.ts 注册、spa-fallback 中间件服务、
 *    shared embed 白名单引用（运行时字符串路径，非 ESM import），故一并 ignore。
 */
const config = {
  workspaces: {
    backend: {
      entry: ['src/main.ts', 'test/**/*.test.ts', 'version.js', 'src/generated/prisma/client.ts'],
      ignoreBinaries: ['ioreg', 'reg'],
    },
    frontend: {
      entry: ['index.html'],
      ignore: ['**/*.css', 'public/sw.js'],
    },
    'packages/shared': {
      entry: ['test/**/*.test.ts'],
    },
  },
}

export default config
