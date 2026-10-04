/**
 * @file fallback-core.util.ts
 * @module @homeos/shared/embed
 * @brief 内嵌反代逃逸子资源兜底核心逻辑（与 HTTP 框架无关）。
 *
 * 职责：
 *  - 识别 HomeOS 前端自有静态资源路径（绝不应被内嵌反代兜底重定向劫持）；
 *  - 识别顶层文档 / 子框架导航请求（不应被兜底劫持）；
 *  - 从 Referer / embed_ctx__ Cookie 解析 embedId，并解析兜底重定向目标 URL。
 *
 * 关键依赖：
 *  - spa-fallback.middleware 与 Vite dev 插件共用本模块，保持 dev/prod 行为一致。
 *
 * 约定：
 *  - 仅对"非导航 + 非 HomeOS 自有资源 + 来自内嵌页面"的子资源做兜底重定向；
 *  - embedId 优先从 Referer 的 /api/v1/embed-proxy/:id 解析，其次从 embed_ctx__ Cookie；
 *  - Referer 存在但未命中 embedId 时不再查 Cookie（避免跨页串扰）。
 */

/** HomeOS 前端自有静态资源路径：绝不应被内嵌反代兜底重定向劫持 */
const HOMEOS_FRONTEND_RESOURCE_PREFIXES = [
  '/assets/',
  '/floorplans/',
  '/backgrounds/',
  '/icons/',
  '/room_images/',
  '/sounds/',
  '/logo/',
] as const;

const HOMEOS_FRONTEND_ROOT_FILES = new Set(['/manifest.json', '/sw.js']);

const STATIC_RESOURCE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.wasm',
  '.map',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

/**
 * 与 HTTP 框架无关的兜底请求最小形状。
 * 供 spa-fallback.middleware 与 Vite dev 插件共用，避免对框架 Request 类型的强耦合。
 */
export type EmbedFallbackRequestLike = {
  /** HTTP 方法（大写；缺省按 GET 处理） */
  method?: string;
  /** URL path（不含 query，如 /assets/logo.svg） */
  path: string;
  /** 原始 URL（含 query，用于重定向；缺省时回退为 path） */
  originalUrl?: string;
  /** 请求头（单值或多值数组，统一取首元素做解析） */
  headers: Record<string, string | string[] | undefined>;
};

/** 取请求头首个值（数组取首元素，空值归一为空串） */
function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return String(value || '');
}

/**
 * 判断路径是否为 HomeOS 前端自有静态资源（前缀命中或根文件命中）。
 * 命中则不应被内嵌反代兜底重定向劫持。
 */
export function isHomeosFrontendResourcePath(urlPath: string): boolean {
  const path = String(urlPath || '').split('?')[0];
  if (!path.startsWith('/')) return false;
  if (HOMEOS_FRONTEND_ROOT_FILES.has(path)) return true;
  return HOMEOS_FRONTEND_RESOURCE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** 取 URL 路径扩展名（剔除 query，无扩展名或目录返回空串） */
function pathExtname(urlPath: string): string {
  const q = urlPath.indexOf('?');
  const clean = q >= 0 ? urlPath.slice(0, q) : urlPath;
  const dot = clean.lastIndexOf('.');
  if (dot <= clean.lastIndexOf('/')) return '';
  return clean.slice(dot).toLowerCase();
}

/** 顶层文档/子框架导航不应被内嵌反代兜底劫持 */
export function isEmbedFallbackNavigationDest(req: EmbedFallbackRequestLike): boolean {
  const dest = headerValue(req.headers['sec-fetch-dest']).toLowerCase();
  if (dest === 'document' || dest === 'iframe' || dest === 'frame') return true;
  if (!dest && (req.method || 'GET').toUpperCase() === 'GET') {
    const ext = pathExtname(req.path);
    if (!STATIC_RESOURCE_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

/**
 * 从 Referer 头解析内嵌反代 embedId（匹配 /api/v1/embed-proxy/:id 段）。
 * @returns 解码后的 embedId；未命中返回 null。解码失败时回退原始值。
 */
export function parseEmbedIdFromReferer(referer: string): string | null {
  const match = String(referer || '').match(/\/api\/v1\/embed-proxy\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * 从 embed_ctx__{id} Cookie 解析内嵌上下文 embedId。
 * @returns 解码后的 embedId；未命中返回 null。解码失败时回退原始值。
 */
export function parseEmbedIdFromContextCookie(cookieHeader: string | undefined): string | null {
  const match = String(cookieHeader || '').match(/(?:^|;\s*)embed_ctx__([^=;]+)=/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * 综合判定是否需要将子资源请求兜底重定向到内嵌反代代理路径。
 *
 * 判定顺序：
 *  1. 导航请求 / HomeOS 自有资源 → 不重定向（返回 null）；
 *  2. Referer 命中 embedId → 重定向到 /api/v1/embed-proxy/:id + originalUrl；
 *  3. 无 Referer 时查 embed_ctx__ Cookie，命中则同上；
 *  4. 均未命中 → 返回 null。
 *
 * @returns 重定向目标（embedId + targetUrl）；无需重定向返回 null。
 */
export function resolveEmbedProxyFallbackRedirect(
  req: EmbedFallbackRequestLike,
): { embedId: string; targetUrl: string } | null {
  if (isEmbedFallbackNavigationDest(req)) return null;
  if (isHomeosFrontendResourcePath(req.path)) return null;

  const originalUrl = req.originalUrl || req.path;

  const refEmbedId = parseEmbedIdFromReferer(headerValue(req.headers.referer));
  if (refEmbedId) {
    return {
      embedId: refEmbedId,
      targetUrl: `/api/v1/embed-proxy/${refEmbedId}${originalUrl}`,
    };
  }

  const ref = headerValue(req.headers.referer);
  if (!ref) {
    const cookieEmbedId = parseEmbedIdFromContextCookie(headerValue(req.headers.cookie));
    if (cookieEmbedId) {
      return {
        embedId: cookieEmbedId,
        targetUrl: `/api/v1/embed-proxy/${cookieEmbedId}${originalUrl}`,
      };
    }
  }

  return null;
}
