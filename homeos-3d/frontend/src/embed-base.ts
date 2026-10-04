/**
 * 嵌入模式前缀。
 *
 * 后端 EmbedSessionMiddleware（backend/src/embedding.py）把页面挂在 `/embed/<43 位 token>/`
 * 下：剥离前缀后才交给路由表，同时注入授权用的 display cookie。因此嵌入页面里的
 * `location.pathname` 比 SPA 路由多一段 43 位 token 前缀。
 *
 * vue-router 必须在解析地址时就把它当 base 摘掉，否则
 * `/embed/<token>/display/xxx` 匹配不到任何路由 → 落到 catch-all → `redirect: "/"` →
 * history.replaceState 把前缀整个抹掉（嵌入页渲染成编辑器）。
 *
 * 非嵌入环境下 EMBED_BASE 为空串，所有拼 URL 的地方行为不变。
 */
export const EMBED_BASE =
  /^\/embed\/[A-Za-z0-9_-]{43}(?=\/)/.exec(location.pathname)?.[0] ?? "";

/** 把 SPA 路由的绝对路径还原成当前文档下的真实 URL（嵌入模式补回前缀）。 */
export function withEmbedBase(path: string): string {
  return EMBED_BASE ? EMBED_BASE + path : path;
}
