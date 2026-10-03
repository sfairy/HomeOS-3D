/**
 * 内嵌反代兜底判定工具
 *
 * 所属模块：backend/src/common/embed
 * 职责：在内嵌反代场景下，对「逃逸出反代前缀」的子资源请求做兜底判定——
 *   - 顶层文档/子框架导航请求不应被劫持回反代前缀；
 *   - 非 /api 的请求若不属于 HomeOS 自身前端资源，则 307 重定向回反代前缀，
 *     避免懒加载 chunk 等被 SPA 回退中间件误处理。
 * 关键依赖：
 *   - express#Request：HTTP 请求类型
 *   - @homeos/shared：核心判定逻辑复用包，避免前后端重复实现
 */
import type { Request } from 'express';

import { resolveEmbedProxyFallbackRedirect as resolveEmbedProxyFallbackRedirectCore } from '@homeos/shared';

/**
 * 判定非 /api 请求是否应 307 重定向回内嵌反代前缀（逃逸子资源兜底）。
 * 排除 HomeOS 自身前端资源，避免访问内嵌页后顶栏切换 Tab 时懒加载 chunk 被误劫持。
 *
 * @param req Express 请求对象
 * @returns 命中时返回 { embedId, targetUrl }；不命中返回 null
 */
export function resolveEmbedProxyFallbackRedirect(
  req: Request,
): { embedId: string; targetUrl: string } | null {
  return resolveEmbedProxyFallbackRedirectCore({
    method: req.method,
    path: req.path,
    // originalUrl 包含查询串，比 path 更精确；兜底到 url 字段，最后退回 path
    originalUrl: req.originalUrl || req.url || req.path,
    headers: req.headers as Record<string, string | string[] | undefined>,
  });
}