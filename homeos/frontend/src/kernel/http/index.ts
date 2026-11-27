/**
 * `kernel/http` 公开面。
 *
 * 三个实现文件各自单一职责（HTTP 客户端 / CSRF 注入 / 系统配置资源访问），
 * 但它们共享 `installed` 这类模块级状态与「模块加载即安装 fetch 钩子」的副作用 ——
 * 合并成一个文件会让声明顺序与求值顺序纠缠（实测出现 TDZ：
 * `Cannot access 'installed' before initialization`）。因此保留目录 + 桶文件。
 */
export { default } from './client'
export * from './client'
export * from './csrf'
export * from './system-api'
