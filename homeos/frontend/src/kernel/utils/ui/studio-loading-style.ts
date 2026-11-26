/**
 * 3D 编辑器首屏遮罩的**按需注入**（0.8.9 公告 9：普通页面不预载 3D 资源）。
 *
 * ## 原来怎么做的、为什么不对
 *
 * `index.html` 里无条件挂了 `<link href="/static/3d-studio/studio-loading.css">`，
 * 并在 `<body>` 里无条件输出了 `#studio-loading` 那 20 个节点。于是：
 *
 * - 每个普通仪表盘用户的首屏都多一次 1.7KB CSS 请求与解析；
 * - 每个页面都要解析一段永远 `hidden` 的 DOM；
 * - 而真正需要它的只有 `/3d-studio` 一条路由。
 *
 * ## 现在怎么做
 *
 * 进入创作页时再注入样式表；离开时不回撤（同一会话内再次进入无需重复请求，
 * 且样式表被移除会导致正在退场的遮罩闪一下无样式）。
 *
 * 只注入**样式**，不注入 DOM：`#studio-loading` 的标记仍留在 `index.html`
 * 的 body 里 —— 它必须在 Vue 挂载前就存在（见那里的注释），搬到 JS 里会因为
 * 入口 chunk 还没下载完而错过「已挂载但路由未渲染」那段空窗。
 */

const STUDIO_LOADING_STYLE_HREF = '/static/3d-studio/studio-loading.css'
const STYLE_ELEMENT_ID = 'studio-loading-style'

/** 注入（幂等）首屏遮罩样式表；返回是否已在文档中。 */
export function ensureStudioLoadingStyle(doc: Document = document): boolean {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return true
  // 可能已由服务端模板或上一版逻辑挂上：按 href 判重，避免重复请求。
  const existing = doc.querySelector(`link[rel="stylesheet"][href="${STUDIO_LOADING_STYLE_HREF}"]`)
  if (existing) return true
  const link = doc.createElement('link')
  link.id = STYLE_ELEMENT_ID
  link.rel = 'stylesheet'
  link.href = STUDIO_LOADING_STYLE_HREF
  doc.head.append(link)
  return true
}
