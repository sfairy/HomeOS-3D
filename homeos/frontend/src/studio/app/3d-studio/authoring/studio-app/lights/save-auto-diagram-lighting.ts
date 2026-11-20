/**
 * 内嵌自动导图里「保存光照」的**定向下发**（0.8.7 `saveAutoDiagramLighting`）。
 *
 * 为什么不能复用整份自动保存：iframe 打开期间父页面可能改过户型。此时
 * 1. 整场景 PUT 会带着**旧 revision** 直接 409，冲突框还开在 iframe 里（用户看不见），
 *    改动实际丢掉；
 * 2. 就算 revision 恰好没变，整份覆盖也会把父页面在 iframe 打开期间的其它改动抹掉。
 *
 * 所以这里只做三件事：读服务器最新草稿 → 只改 `baseLightingByTheme[当前主题]` →
 * 用服务器给的 revision 提交。内容已经一致时连 PUT 都不发（避免一次无意义的修订推进）。
 */

/** 草稿响应里本模块真正用到的字段（其余原样透传，不在这里建模）。 */
export interface StudioDraftResponse {
  revision?: number
  scene?: {
    baseLightingByTheme?: Record<string, Record<string, unknown>>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** 提交函数形状：与宿主注入的 `fetchStudioApi(path, options)` 一致。 */
export type StudioApiFetch = (path: string, options?: Record<string, unknown>) => Promise<StudioDraftResponse>

/** 两份光照是否逐键相同（键集合也要一致，少一个键不等于「没变」）。 */
export function sameBaseLighting(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  if (leftKeys.length !== Object.keys(rightRecord).length) return false
  return leftKeys.every((key) => leftRecord[key] === rightRecord[key])
}

/**
 * 只把当前主题的基础光照写回草稿。
 *
 * 返回服务器响应（未改动时返回读到的草稿）；中途被取消（`signal` 中止 / `isCurrent`
 * 变 false）返回 `null`，调用方据此不提示成功。
 */
export async function saveAutoDiagramLighting(
  fetchStudioApi: StudioApiFetch,
  theme: string,
  lighting: Record<string, unknown>,
  options: { signal?: AbortSignal; isCurrent?: () => boolean } = {},
): Promise<StudioDraftResponse | null> {
  const isCancelled = () => options.signal?.aborted === true || options.isCurrent?.() === false
  const draft = await fetchStudioApi('/studio3d', options.signal ? { signal: options.signal } : {})
  if (isCancelled()) return null
  const byTheme = draft?.scene?.baseLightingByTheme
  if (sameBaseLighting(byTheme?.[theme], lighting)) return draft
  const scene = structuredClone(draft?.scene)
  if (!scene || typeof scene !== 'object') throw new Error('无法读取服务器户型，请稍后重试。')
  scene.baseLightingByTheme = { ...byTheme, [theme]: structuredClone(lighting) }
  const saved = await fetchStudioApi('/studio3d', {
    method: 'PUT',
    ...(options.signal ? { signal: options.signal } : {}),
    body: JSON.stringify({ revision: draft.revision, scene }),
  })
  if (isCancelled()) return null
  return saved
}

/** 宿主提供的「保存完当前主题光照」所需的薄上下文。 */
export interface EmbeddedBaseLightingTarget {
  fetchStudioApi: StudioApiFetch
  /** 当前场景风格（`appCtx.sceneStyle`）。 */
  sceneStyle: unknown
  /** 内存文档；保存成功后就地更新它，避免父页面同步前用户看到旧值。 */
  project?: {
    baseLightingByTheme?: Record<string, Record<string, unknown>>
    baseLighting?: Record<string, unknown>
  } | null
  /** 服务器 revision 已前进：调用方负责推进本地版本（否则下一次自动保存会 409）。 */
  advanceRevision?: (revision: number) => void
  /** 成功：父页面据此关闭光照面板。 */
  onSaved: () => void
  /** 失败：文案要可执行；调用方**不能**当作成功。 */
  onError: (message: string) => void
}

/**
 * 内嵌自动导图「保存光照」的完整落地：定向下发 → 推进 revision → 就地更新内存 → 回报。
 *
 * 与 `confirmLightingDialog`（编辑器内保存）的差别只有两点：不发整场景 PUT、
 * 不标记文档脏 —— iframe 里没有「整份文档」的所有权，父页面才是。
 */
export async function saveEmbeddedBaseLighting(
  target: EmbeddedBaseLightingTarget,
  theme: string,
  lighting: Record<string, unknown>,
): Promise<void> {
  try {
    const saved = await saveAutoDiagramLighting(target.fetchStudioApi, theme, lighting)
    if (!saved) return
    const savedRevision = Number(saved.revision)
    if (Number.isFinite(savedRevision)) target.advanceRevision?.(savedRevision)
    if (target.project) {
      target.project.baseLightingByTheme = { ...(target.project.baseLightingByTheme || {}), [theme]: { ...lighting } }
      if (theme === 'default') target.project.baseLighting = { ...lighting }
    }
    target.onSaved()
  } catch (error) {
    target.onError(error instanceof Error ? error.message : '光照保存失败，请重试。')
  }
}
