/**
 * 仪表盘全局字体（0.8.6）：按文档 `theme.fonts` 把中文 / 英文数字两套字体挂到容器上。
 *
 * - 字体经 `FontFace` 动态注册，按 unicode-range 拆成「中文」「拉丁」两张 face，
 *   同一文档内同名 face 引用计数共享（多个渲染器 / 预览不会重复下载）；
 * - 生效方式是容器上的 `data-hb-fonts` + `--hb-dashboard-font`（见 `/static/dashboard-fonts.css`），
 *   canvas 文字（3D 名牌、电视海报）读同一个变量；
 * - 任一环节失败都回退设备字体栈，只通过 `onError` 报告，不打断渲染。
 */

export type DashboardFontRole = 'chinese' | 'latin'

export interface DashboardFontChoices {
  chinese: string
  latin: string
}

export interface DashboardFontEntry {
  id: string
  name: string
  role: DashboardFontRole | 'both'
  source: 'builtin' | 'user'
  weight?: string
  size: number
  url: string
  licenseUrl?: string
}

export interface DashboardFontCatalog {
  builtin?: DashboardFontEntry[]
  uploaded?: DashboardFontEntry[]
}

export interface DashboardFontsController {
  apply(choices: Partial<DashboardFontChoices> | null | undefined): Promise<void> | undefined
  dispose(): void
}

interface FontsEnv {
  fetch: typeof fetch
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  FontFace?: typeof FontFace
}

interface FaceRecord {
  references: number
  controller: AbortController
  face: FontFace | null
  failed: boolean
  timedOut: boolean
  promise: Promise<void>
}

const DEVICE_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const LATIN_RANGE = 'U+0000-024F,U+1E00-1EFF,U+2000-214F,U+2190-22FF'
const CHINESE_RANGE = 'U+0250-1DFF,U+1F00-1FFF,U+2150-218F,U+2300-10FFFF'
const ALL_RANGE = 'U+0000-10FFFF'
const FACE_TIMEOUT_MS = 20_000
const CATALOG_TIMEOUT_MS = 12_000
const FONTS_STYLESHEET = '/static/dashboard-fonts.css'

const facesByDocument = new WeakMap<Document, Map<string, FaceRecord>>()

/** 只关心 `theme.fonts` 的文档切面：编辑器草稿、渲染器文档都满足。 */
export type DashboardFontDocument =
  | { theme?: { fonts?: Partial<DashboardFontChoices> | null } | null }
  | null
  | undefined

export function dashboardFontChoices(document: DashboardFontDocument): DashboardFontChoices {
  const fonts = document?.theme?.fonts
  return { chinese: fonts?.chinese || 'device', latin: fonts?.latin || 'device' }
}

/** 舞台 iframe 的字体查询参数（名牌 / 电视画面 / 弹窗沿用宿主仪表盘字体）；文档没设字体时不追加。 */
export function stageFontParams(document: DashboardFontDocument): Record<string, string> {
  if (!document?.theme?.fonts) return {}
  const { chinese, latin } = dashboardFontChoices(document)
  return { fontChinese: chinese, fontLatin: latin }
}

/** 字体失败统一写运行日志；界面照常使用设备字体。 */
export function reportDashboardFontError(phase: string): (error: Error) => void {
  return (error) =>
    globalThis.window?.HomeOSLog?.report?.('warning', '仪表盘字体', '字体加载失败，暂时使用设备字体。', {
      phase,
      message: error.message,
    })
}

export function fontFamilyName(id: string, role: DashboardFontRole = 'chinese', all = false): string {
  return 'HB_' + id.replace(/[^a-zA-Z0-9]/g, '_') + '_' + role + (all ? '_all' : '')
}

export function dashboardFontFamily(doc: Document | undefined = globalThis.document, fallback = 'sans-serif'): string {
  return doc?.documentElement?.style?.getPropertyValue('--hb-dashboard-font')?.trim() || fallback
}

/** canvas `ctx.font`：`prefix` 是字重 + 字号，如 `'600 28px'`。 */
export function dashboardCanvasFont(
  prefix: string,
  fallback = 'sans-serif',
  doc: Document | undefined = globalThis.document,
): string {
  return prefix + ' ' + dashboardFontFamily(doc, fallback)
}

function documentFaces(doc: Document): Map<string, FaceRecord> {
  let faces = facesByDocument.get(doc)
  if (!faces) {
    faces = new Map()
    facesByDocument.set(doc, faces)
  }
  return faces
}

/** 408 / 5xx / 网络错误重试一次；其余错误直接抛出。 */
async function fetchWithRetry<T>(
  url: string,
  env: FontsEnv,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>,
  failureMessage: string,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await env.fetch(url, { signal, credentials: 'same-origin' })
      if (!response.ok) {
        const error = new Error(failureMessage + '（' + response.status + '）。') as Error & { transient?: boolean }
        error.transient = response.status === 408 || response.status >= 500
        throw error
      }
      return await read(response)
    } catch (error) {
      const transient = error instanceof TypeError || (error as { transient?: boolean })?.transient
      if (attempt || signal.aborted || !transient) throw error
    }
  }
}

function acquireFace(doc: Document, font: DashboardFontEntry, role: DashboardFontRole, all: boolean, env: FontsEnv) {
  const faces = documentFaces(doc)
  const family = fontFamilyName(font.id, role, all)
  let record = faces.get(family)
  if (record?.failed) record = undefined
  if (!record) {
    const controller = new AbortController()
    const created: FaceRecord = {
      references: 0,
      controller,
      face: null,
      failed: false,
      timedOut: false,
      promise: Promise.resolve(),
    }
    const timer = env.setTimeout(() => {
      created.timedOut = true
      controller.abort()
    }, FACE_TIMEOUT_MS)
    faces.set(family, created)
    created.promise = (async () => {
      const data = await fetchWithRetry(
        font.url,
        env,
        controller.signal,
        (response) => response.arrayBuffer(),
        '字体“' + font.name + '”加载失败',
      )
      if (controller.signal.aborted || !env.FontFace) return
      const face = new env.FontFace(family, data, {
        weight: font.weight || '400',
        display: 'swap',
        unicodeRange: all ? ALL_RANGE : role === 'latin' ? LATIN_RANGE : CHINESE_RANGE,
      })
      await face.load()
      if (controller.signal.aborted) return
      created.face = face
      doc.fonts.add(face)
    })()
      .catch((error) => {
        created.failed = true
        if (created.timedOut) throw new Error('字体“' + font.name + '”加载超时，暂时使用设备字体。')
        if (!controller.signal.aborted) throw error
      })
      .finally(() => env.clearTimeout(timer))
    created.promise.catch(() => {})
    record = created
  }
  const shared = record
  shared.references++
  return {
    family,
    ready: shared.promise,
    release() {
      if (--shared.references > 0) return
      shared.controller.abort()
      if (shared.face) doc.fonts.delete(shared.face)
      if (faces.get(family) === shared) faces.delete(family)
    },
  }
}

function ensureStylesheet(doc: Document | null) {
  if (!doc?.head || doc.querySelector('link[data-dashboard-fonts]')) return
  const link = doc.createElement('link')
  link.rel = 'stylesheet'
  link.href = FONTS_STYLESHEET
  link.dataset.dashboardFonts = ''
  doc.head.append(link)
}

/** 读字体目录（带超时）；`signal` 被中止时抛出。 */
async function fetchFontCatalog(env: FontsEnv, controller: AbortController): Promise<Map<string, DashboardFontEntry>> {
  const timer = env.setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS)
  try {
    const catalog: DashboardFontCatalog = await fetchWithRetry(
      '/api/v1/fonts',
      env,
      controller.signal,
      (response) => response.json(),
      '无法读取字体目录，暂时使用设备字体',
    )
    return new Map([...(catalog.builtin || []), ...(catalog.uploaded || [])].map((font) => [font.id, font]))
  } finally {
    env.clearTimeout(timer)
  }
}

type FaceHandle = ReturnType<typeof acquireFace>

/** 按中文 / 英文两个角色挂字体；目录里已不存在的 id 计入 `missing`。 */
function acquireChoiceFaces(
  doc: Document,
  fonts: Map<string, DashboardFontEntry>,
  chinese: string,
  latin: string,
  env: FontsEnv,
) {
  const handles: FaceHandle[] = []
  let missing = false
  for (const [role, id] of [
    ['chinese', chinese],
    ['latin', latin],
  ] as const) {
    if (id === 'device' || id === 'chinese') continue
    const font = fonts.get(id)
    if (font) handles.push(acquireFace(doc, font, role, role === 'chinese' && latin === 'chinese', env))
    else missing = true
  }
  return { handles, missing }
}

function needsWebFonts(chinese: string, latin: string) {
  return chinese !== 'device' || (latin !== 'device' && latin !== 'chinese')
}

interface DashboardFontsOptions {
  env?: FontsEnv
  applyToDom?: boolean
  onReady?: () => void
  onError?: (error: Error) => void
}

class DashboardFonts implements DashboardFontsController {
  private readonly env: FontsEnv
  private readonly applyToDom: boolean
  private readonly onReady: () => void
  private readonly onError: (error: Error) => void
  private generation = 0
  private disposed = false
  private releases: Array<() => void> = []
  private appliedKey = ''
  private pending: Promise<void> | undefined
  private catalogController: AbortController | undefined
  private degraded = false

  constructor(
    private readonly root: HTMLElement,
    options: DashboardFontsOptions,
  ) {
    this.env = options.env || (globalThis as unknown as FontsEnv)
    this.applyToDom = options.applyToDom ?? true
    this.onReady = options.onReady || (() => {})
    this.onError = options.onError || (() => {})
    if (this.applyToDom) ensureStylesheet(root.ownerDocument)
  }

  apply(choices: Partial<DashboardFontChoices> | null | undefined) {
    if (this.disposed) return
    const key = JSON.stringify(choices || null)
    if (this.appliedKey === key && this.pending && !this.degraded) return this.pending
    this.appliedKey = key
    this.pending = this.start(choices)
    return this.pending
  }

  dispose() {
    this.disposed = true
    this.generation++
    this.catalogController?.abort()
    this.releaseAll()
    this.clearDom()
  }

  private start(choices: Partial<DashboardFontChoices> | null | undefined): Promise<void> | undefined {
    this.degraded = false
    const current = ++this.generation
    this.catalogController?.abort()
    this.releaseAll()
    if (!choices) {
      this.clearDom()
      return undefined
    }
    if (this.applyToDom) this.root.setAttribute('data-hb-fonts', '')
    this.root.style.setProperty('--hb-dashboard-font', DEVICE_FONT_STACK)
    const doc = this.root.ownerDocument
    const chinese = choices.chinese || 'device'
    const latin = choices.latin || 'device'
    if (!this.env.FontFace || !doc?.fonts || !needsWebFonts(chinese, latin)) return undefined
    const stale = () => this.disposed || current !== this.generation
    return this.load(doc, chinese, latin, stale).catch((error) => {
      if (!stale()) this.fail(error)
    })
  }

  private async load(doc: Document, chinese: string, latin: string, stale: () => boolean) {
    const controller = new AbortController()
    this.catalogController = controller
    const fonts = await fetchFontCatalog(this.env, controller)
    if (stale()) return
    const { handles, missing } = acquireChoiceFaces(doc, fonts, chinese, latin, this.env)
    if (missing) this.fail(new Error('所选字体已不存在，暂时使用设备字体。'))
    this.releases = handles.map((handle) => () => handle.release())
    const families = handles.map((handle) => '"' + handle.family + '"')
    this.root.style.setProperty('--hb-dashboard-font', [...families, DEVICE_FONT_STACK].join(', '))
    const results = await Promise.allSettled(handles.map((handle) => handle.ready))
    if (stale()) return
    for (const result of results) if (result.status === 'rejected') this.fail(result.reason)
    this.onReady()
  }

  private fail(error: Error) {
    this.degraded = true
    this.onError(error)
  }

  private releaseAll() {
    for (const release of this.releases) release()
    this.releases = []
  }

  private clearDom() {
    this.root.removeAttribute('data-hb-fonts')
    this.root.style.removeProperty('--hb-dashboard-font')
  }
}

export function createDashboardFonts(root: HTMLElement, options: DashboardFontsOptions = {}): DashboardFontsController {
  return new DashboardFonts(root, options)
}
