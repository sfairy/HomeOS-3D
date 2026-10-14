/**
 * `@homeos/shared` 的唯一 barrel 入口（Node / 后端类型 + 跨端纯函数）。
 *
 * 边界口径：
 * - **浏览器侧 UI 与纯函数走 subpath**（`@homeos/shared/components/...`、`/scene/...`、`/utils/...`）：
 *   构建器只打包被引用的那一个文件，不会把整包拖进产物（`exports` 里逐条登记，见 package.json）。
 * - **Node / 后端类型与纯逻辑走本 barrel**：后端无需知道内部文件路径，域内重构不影响调用方。
 *
 * 本文件只做「按域转发」：每个域的实现与公开面在 `src/<域>/index.ts`。
 * 新增导出请加到对应域 barrel，别在本文件里直接写 `from './<域>/<文件>'` ——
 * 否则 402 行的上帝 barrel 会原地长回来。
 */

export * from './config';
export * from './crud';
export * from './earthquake';
export * from './embed';
export * from './energy';
export * from './entity';
export * from './errors';
export * from './ha';
export * from './home';
export * from './notification';
export * from './observability';
export * from './room';
export * from './setup';
export * from './template';
export * from './time';
export * from './ws';
export * from './yaml';
