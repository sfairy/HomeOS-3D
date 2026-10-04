/**
 * SPA 回退中间件：在前端静态资源服务之前拦截未命中文件，避免被回退成 index.html。
 *
 * 职责：
 *   - 拦截内嵌反代页「逃逸子资源」请求，307 重定向回反代前缀；
 *   - 对 /assets/ 等静态资源路径，文件不存在时返回带正确 Content-Type 的 404，
 *     防止被回退成 index.html 触发模块脚本 MIME 校验失败；
 *   - 仅对未知路由（非静态资源、非 API、非可替换资源前缀）回退到 index.html，
 *     支持前端客户端路由（history 模式）。
 * 关键依赖：
 *   - ../embed/fallback.util#resolveEmbedProxyFallbackRedirect：内嵌逃逸兜底判定
 *   - express#Request/Response/NextFunction：HTTP 中间件类型
 *   - node:fs / node:path：文件存在性检查与路径拼接
 */
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'fs';
import { extname } from 'path';
import { join } from 'path';

import { resolveEmbedProxyFallbackRedirect } from '../embed/fallback.util';

/**
 * 静态资源扩展名 → MIME 类型映射。
 * 当内嵌反代页的子资源逃逸到 HomeOS 根路径且 Referer 缺失时，
 * 返回 404 应使用正确的 Content-Type，避免浏览器模块脚本严格 MIME 校验报错。
 */
export const STATIC_MIME: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
};

/** 已知的静态资源扩展名集合：这些路径绝不应回退为 index.html */
const STATIC_EXTENSIONS = new Set(Object.keys(STATIC_MIME));

/**
 * 构造 SPA 回退中间件工厂。
 *
 * 处理流程：
 * 1. API / health / metrics 路径直接放行；
 * 2. 内嵌反代逃逸子资源：307 重定向回反代前缀；
 * 3. /assets/ 下文件不存在：返回带正确 MIME 的 404；
 * 4. 可替换资源前缀（floorplans/backgrounds/icons 等）放行给 ServeStaticModule；
 * 5. 已知静态资源扩展名但文件未命中：返回 404（避免被 index.html 顶替）；
 * 6. 其余未知路由：回退 index.html（无缓存），支持前端 history 路由。
 *
 * @param frontendDistPath 前端构建产物目录（dist/frontend）绝对路径
 * @returns Express 中间件函数
 */
export function spaFallbackMiddleware(frontendDistPath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return;

    const url = req.path;

    // API / 健康检查 / 指标端点不走 SPA 回退，交给后续路由处理
    if (url.startsWith('/api/')) return next();

    if (url.startsWith('/health') || url.startsWith('/metrics')) {
      return next();
    }

    // 内嵌反代页「逃逸子资源」兜底（详见 embed-fallback.util.ts）
    const embedFallback = resolveEmbedProxyFallbackRedirect(req);
    if (embedFallback) {
      res.redirect(307, embedFallback.targetUrl);
      return;
    }

    if (url.startsWith('/assets/')) {
      const filePath = join(frontendDistPath, url);
      if (!existsSync(filePath)) {
        const ext = extname(url).toLowerCase();
        if (STATIC_MIME[ext]) {
          res.status(404).type(STATIC_MIME[ext]).end();
        } else {
          res.status(404).type('text/plain').send('未找到');
        }
        return;
      }
      return next();
    }

    const manifestPath = join(frontendDistPath, 'manifest.json');
    if (url === '/manifest.json' && existsSync(manifestPath)) {
      return next();
    }

    if (url === '/sw.js') {
      const filePath = join(frontendDistPath, 'sw.js');
      if (existsSync(filePath)) {
        return next();
      }
    }

    // 可替换资源 URL 前缀（仓库根 assets/，由 ServeStaticModule 托管）；勿在此拦截成 SPA
    if (
      url.startsWith('/floorplans/') ||
      url.startsWith('/backgrounds/') ||
      url.startsWith('/icons/') ||
      url.startsWith('/room_images/') ||
      url.startsWith('/sounds/') ||
      url.startsWith('/logo/')
    ) {
      return next();
    }

    // 已知的静态资源扩展名：绝不应回退为 index.html。
    // 内嵌反代页逃逸子资源（如 .js / .css / .wasm）若走到这里说明前面所有兜底均未命中；
    // 返回 404 + 正确 Content-Type，避免浏览器将 index.html（text/html）当作模块脚本解析，
    // 触发 "Expected a JavaScript module but the server responded with MIME type text/html" 报错。
    const ext = extname(url).toLowerCase();
    if (STATIC_EXTENSIONS.has(ext)) {
      res
        .status(404)
        .type(STATIC_MIME[ext] || 'application/octet-stream')
        .end();
      return;
    }

    const indexPath = join(frontendDistPath, 'index.html');
    if (existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(indexPath);
    } else {
      next();
    }
  };
}
