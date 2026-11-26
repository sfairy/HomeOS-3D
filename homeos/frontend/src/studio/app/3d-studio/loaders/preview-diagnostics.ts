/**
 * 预览加载诊断：把「模型没出来」从静默失败变成**可巡检**的数据。
 *
 * 背景（2026-10-23 全库回滚）：模型加载链上有三处会**安静地什么都不显示**：
 * 1. `GLTFLoader` 取 `dependencies[0][json.scene || 0]`，`scenes` 为空时 `gltf.scene` 是
 *    `undefined` 且不抛错 —— 整件模型不渲染，控制台干净得像没事；
 * 2. lite 变体 Draco 解码失败时，上层只 `console.warn` 后直接放弃（回退分支没接上）；
 * 3. 贴图 404 被 `LoadingManager` 吞掉，材质退化成纯色壳。
 *
 * 收口去向（**不再写进标题条**）：
 * - `console.error`：现场一眼能看到是哪一件、哪个 URL、什么错误；
 * - `window.__studioPreviewIssues`：自动化 / 巡检可读的完整列表；
 * - `<html data-preview-issues>`：控制台被刷掉之后仍能从 DOM 上取证。
 *
 * 为什么不挂在 `#preview-quality-status` 上：上游 0.8.9 的那个元素**只被隐藏和清空**
 * （`jd.hidden = true; jd.title = ''; jd.textContent = ''`），从不写入内容 —— 它是
 * 预留位，不是诊断出口。我们此前把「预览异常 N」写进去，于是标题条常年顶着一个
 * 橙色标签，含义只有实现者知道（用户看到的是「什么东西异常了？」）。
 * 上游对「装饰模型缺失」的可见出口在**导出时**（`有装饰模型暂时无法载入，请检查后再导图。`），
 * 编辑期保持静默；这里对齐这一点：诊断留在开发通道，不占用户界面。
 */
interface PreviewIssue {
  /** 失败发生在哪一步：请求 / 解析 / 回退 / 渲染空白。 */
  stage: 'load' | 'parse' | 'fallback' | 'render'
  itemType: string
  url?: string
  status?: number
  message: string
  /** 自增序号，便于判断「这次巡检新增了几条」。 */
  at: number
}

const MAX_ISSUES = 80
const globalScope = globalThis as typeof globalThis & {
  __studioPreviewIssues?: PreviewIssue[]
}

let sequence = 0

function issueStore(): PreviewIssue[] {
  globalScope.__studioPreviewIssues ??= []
  return globalScope.__studioPreviewIssues
}

export function previewIssues(): PreviewIssue[] {
  return issueStore().slice()
}

function describe(issue: PreviewIssue): string {
  const parts = [issue.stage, issue.itemType]
  if (issue.status) parts.push(`HTTP ${issue.status}`)
  if (issue.url) parts.push(issue.url)
  parts.push(issue.message)
  return parts.join(' · ')
}

/**
 * 记一条预览问题。同一条问题只记一次（同一个 itemType + URL + 消息），
 * 否则 336 张卡片逐一点选时状态栏会被同一个 404 刷满。
 */
export function reportPreviewIssue(issue: Omit<PreviewIssue, 'at'>): PreviewIssue | null {
  const list = issueStore()
  const duplicate = list.some(
    (existing) =>
      existing.stage === issue.stage &&
      existing.itemType === issue.itemType &&
      existing.url === issue.url &&
      existing.message === issue.message,
  )
  if (duplicate) return null
  const entry: PreviewIssue = { ...issue, at: (sequence += 1) }
  list.push(entry)
  if (list.length > MAX_ISSUES) list.splice(0, list.length - MAX_ISSUES)

  console.error(`[3D-preview] ${describe(entry)}`)
  /**
   * 只留 DOM 取证通道，**不碰** `#preview-quality-status`（上游 0.8.9 从不写入它）。
   * 挂在 `documentElement` 上而不是那个 span 上：控制台被刷掉、或者那一段标记被改动时，
   * 取证入口都不会跟着一起消失。
   */
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.dataset.previewIssueCount = String(list.length)
    root.dataset.previewIssues = JSON.stringify(list.slice(-10))
  }
  return entry
}

/** 从加载错误里抽出 HTTP 状态（loader 把 response 挂在 error 上）。 */
export function statusOfPreviewError(error: unknown): number | undefined {
  const candidate = error as { response?: { status?: number }; status?: number } | undefined
  const status = candidate?.response?.status ?? candidate?.status
  return typeof status === 'number' && status > 0 ? status : undefined
}

export function messageOfPreviewError(error: unknown): string {
  if (error instanceof Error) {
    const aggregate = error as Error & { errors?: unknown[] }
    if (Array.isArray(aggregate.errors) && aggregate.errors.length) {
      return aggregate.errors.map((inner) => messageOfPreviewError(inner)).join('；')
    }
    return error.message || error.name
  }
  return String(error ?? '未知错误')
}
