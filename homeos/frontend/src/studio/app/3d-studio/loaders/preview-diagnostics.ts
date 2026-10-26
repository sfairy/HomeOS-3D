/**
 * 预览加载诊断：把「模型没出来」从静默失败变成可见、可巡检的数据。
 *
 * 背景（2026-10-23 全库回滚）：模型加载链上有三处会**安静地什么都不显示**：
 * 1. `GLTFLoader` 取 `dependencies[0][json.scene || 0]`，`scenes` 为空时 `gltf.scene` 是
 *    `undefined` 且不抛错 —— 整件模型不渲染，控制台干净得像没事；
 * 2. lite 变体 Draco 解码失败时，上层只 `console.warn` 后直接放弃（回退分支没接上）；
 * 3. 贴图 404 被 `LoadingManager` 吞掉，材质退化成纯色壳。
 *
 * 这里统一收口：失败写进 `#preview-quality-status`（用户可见）、`window.__studioPreviewIssues`
 * （自动化可读），并带上 modelType / URL / HTTP 状态 / 解析错误。`preview_smoke.mjs`
 * 直接读这份数据做逐卡巡检。
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

export function clearPreviewIssues(): void {
  issueStore().length = 0
  sequence = 0
  const element = statusElement()
  if (element) {
    element.hidden = true
    element.textContent = ''
    element.title = ''
    delete element.dataset.previewIssues
    delete element.dataset.previewIssueCount
  }
}

function statusElement(): HTMLElement | null {
  return typeof document === 'undefined'
    ? null
    : (document.getElementById('preview-quality-status') as HTMLElement | null)
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
  const element = statusElement()
  if (element) {
    const latest = list.slice(-3).map(describe)
    element.hidden = false
    element.textContent = `预览异常 ${list.length}`
    element.title = latest.join('\n')
    element.dataset.previewIssueCount = String(list.length)
    element.dataset.previewIssues = JSON.stringify(list.slice(-10))
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

/**
 * 渲染统计的空场兜底：`renderTriangles === 0` 说明这一帧什么都没画出来
 * （模型没挂上、被裁掉、材质全透明）。只记一次，避免每帧刷屏。
 */
export function reportBlankFrame(itemType: string, url?: string): void {
  reportPreviewIssue({
    stage: 'render',
    itemType: itemType || 'scene',
    url,
    message: '帧内三角面为 0：模型未挂入场景、被相机裁掉或材质全透明',
  })
}
