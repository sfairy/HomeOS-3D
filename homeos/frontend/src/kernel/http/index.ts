/**
 * `kernel/http` 公开面。
 *
 * 各实现文件单一职责（HTTP 客户端 / CSRF 注入 / 系统配置资源访问 / REST 查询状态），
 * 但它们共享 `installed` 这类模块级状态与「模块加载即安装 fetch 钩子」的副作用 ——
 * 合并成一个文件会让声明顺序与求值顺序纠缠（实测出现 TDZ：
 * `Cannot access 'installed' before initialization`）。因此保留目录 + 桶文件。
 *
 * `use-api-query` 原是 `features/settings` 里的通用设施（只依赖 kernel），
 * 归属 L0 设施层而不是某个 feature，故下沉到此。**刻意不从本桶转出**：
 * 桶里的 `./client` 加载即安装 fetch 钩子，而 `use-api-query` 会拉进 `vue` ——
 * 需要查询状态的调用方直接引 `@/kernel/http/use-api-query`（深引 kernel 是允许的），
 * 不会顺带触发客户端副作用。
 */
export { default } from './client'
export * from './client'
export * from './csrf'
export * from './system-api'
