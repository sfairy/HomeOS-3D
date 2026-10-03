/**
 * @file http-guard.util.ts
 * @module common/http-security
 *
 * HTTP 专用全局守卫的上下文判定工具。
 *
 * 背景：
 * 本项目通过 `APP_GUARD` 注册了多个全局守卫（限流、JWT 认证、游客写保护、角色、商业授权）。
 * 这些守卫天生依赖 HTTP 请求/响应对象——读取 `req.headers` / `req.method` / `req.path`，
 * 或往响应对象写 `X-RateLimit-*` 响应头。
 *
 * 自 NestJS 12 起，`APP_GUARD` 注册的全局守卫也会在 WebSocket 等非 HTTP 上下文执行，
 * 而这些 HTTP 专用守卫在其中会取不到请求对象（`switchToHttp().getRequest()` 返回的是
 * Socket 客户端），于是每次 WS 消息都抛 TypeError，被 `WsExceptionsHandler` 反复打印，
 * 并可能中断后续守卫链。
 *
 * 处理方式：
 * 所有 HTTP 专用全局守卫都需跳过非 HTTP 上下文：
 *  - 自有守卫（JWT / 游客写 / 角色 / 商业授权）在 `canActivate` 开头调用 `isHttpContext`；
 *  - `ThrottlerGuard` 复用其原生的 `skipIf` 配置项（见 app.module 的 ThrottlerModule）。
 *
 * 安全性说明：
 * 跳过非 HTTP 上下文不会削弱 WS 链路的安全边界——WS 连接与消息有独立的鉴权与授权流程
 * （见 `modules/ws-push/connection.helper.ts`，自行校验 JWT 与商业授权），
 * 且这些 HTTP 守卫在 WS 上下文本就无法正确工作。限流/角色/授权语义始终只作用于 HTTP API。
 */

import type { ExecutionContext } from '@nestjs/common';

/**
 * 判断当前执行上下文是否为 HTTP。
 *
 * `context.getType()` 在 HTTP 请求下返回 `'http'`；WebSocket 网关返回 `'ws'`，
 * 微服务/RPC 返回 `'rpc'`。仅 `'http'` 需要走 HTTP 专用的全局守卫。
 *
 * @param context 当前执行上下文
 * @returns true 表示 HTTP 上下文（应执行守卫）；false 表示非 HTTP（应跳过）
 */
export function isHttpContext(context: ExecutionContext): boolean {
  return context.getType() === 'http';
}
