/**
 * 自定义静态 GLB 装饰的**客户端库**（0.8.9「我的装饰」）。
 *
 * 只负责「跟后端模型库对话 + 把结果归一成渲染层认识的形状」，不碰 three：
 *
 * - 列表 / 上传 / 改名 / 删除，全部在 `onLibraryChanged` 之后重新拉列表（后端是唯一事实源）；
 * - 失败按 `apiErrorCode` 分派（`STUDIO3D_MODEL_TOO_LARGE` 要单独提示「文件太大」）；
 * - 上传走 `fetch` + `FormData`，**不用 XHR**：进度条不是必需品，而 XHR 会绕过
 *   统一 fetch 的 CSRF 注入（见 `services/api/csrf.ts`），写请求会 403。
 *
 * 三条必须保持的行为：
 *
 * 1. **删除是墓碑**：删除成功后本地立刻移除该条目，但**不**清理场景里的引用 ——
 *    那是保存时核对的事（`STUDIO3D_BINDING_CONFLICT`）。提前清引用会让用户
 *    「删了一个模型，工具柜里的另一件东西消失了」。
 * 2. **上限来自服务端**：`maxBytes` / `maxModels` 由列表接口返回，前端不写死 ——
 *    写死就会出现「前端放行、后端拒绝」。
 * 3. **失败不静默**：每个错误都带回可展示文案（优先用后端 `message`）。
 */

/**
 * 装饰模型库的合约类型与路径真源在 `@/domain/api/studio`（domain 不得反向依赖 studio）。
 * 这里再导出，既有 `from '../items/studio-user-decorations'` 的引用无需改动。
 */
import {
  DECORATION_MODELS_PATH,
  type DecorationLibraryState,
  type DecorationModel,
  type DecorationUploadLimits,
} from '@/domain/api/studio'

export type { DecorationLibraryState, DecorationModel, DecorationUploadLimits }
export { DECORATION_MODELS_PATH }

/** 全零的 `uploadLimits`（服务端未声明时使用）。 */
export const EMPTY_UPLOAD_LIMITS: DecorationUploadLimits = Object.freeze({
  triangles: 0,
  meshParts: 0,
  nodes: 0,
  images: 0,
  imageSide: 0,
  imagePixels: 0,
})

/**
 * 模型 id 形状（32 位小写 hex），与后端同一正则。
 *
 * 只校验**剥掉前缀之后**的部分：0.8.9 上游把 assetId 存成 `model:<hex32>`，
 * 本仓存裸 `<hex32>`。两种都要能读 —— 否则从 0.8.9 导入的户型里，
 * 装饰会因为正则不匹配被清成空 assetId（物件还在原位，但画不出来）。
 */
export const DECORATION_ASSET_ID = /^[0-9a-f]{32}$/

/** 上游 assetId 的前缀。 */
export const DECORATION_ASSET_PREFIX = 'model:'

/** 剥掉可能存在的 `model:` 前缀并小写（其它形态原样返回，交给正则去拒）。 */
export function normalizeDecorationAssetId(raw: unknown): string {
  const text = String(raw || '')
    .trim()
    .toLowerCase()
  return text.startsWith(DECORATION_ASSET_PREFIX) ? text.slice(DECORATION_ASSET_PREFIX.length) : text
}

/** 展示名上限（与后端 `NAME_LIMIT` 同口径）。 */
export const DECORATION_NAME_LIMIT = 64

/** 字节数的可读表示（上游文案里要带原始大小）。 */
function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 字节'
  const mib = value / (1024 * 1024)
  if (mib >= 1) return `${mib.toFixed(1)} MiB`
  const kib = value / 1024
  return kib >= 1 ? `${Math.round(kib)} KiB` : `${Math.round(value)} 字节`
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** `uploadLimits` 归一化：逐字段有限数字，缺失视为 0（该行文案隐藏）。 */
function normalizeUploadLimits(raw: unknown): DecorationUploadLimits {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<DecorationUploadLimits>
  const pick = (value: unknown): number => Math.max(0, Math.floor(finiteNumber(value, 0)))
  return {
    triangles: pick(source.triangles),
    meshParts: pick(source.meshParts),
    nodes: pick(source.nodes),
    images: pick(source.images),
    imageSide: pick(source.imageSide),
    imagePixels: pick(source.imagePixels),
  }
}

function normalizeModel(raw: unknown): DecorationModel | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const assetId = normalizeDecorationAssetId(source.assetId)
  // 形状不对的条目直接丢：一个坏 id 进场景后会变成「永远下载不到」的幽灵装饰。
  if (!DECORATION_ASSET_ID.test(assetId)) return null
  const name = String(source.name || '')
    .trim()
    .slice(0, DECORATION_NAME_LIMIT)
  return {
    assetId,
    name: name || '我的装饰',
    bytes: Math.max(0, finiteNumber(source.bytes)),
    createdAt: finiteNumber(source.createdAt),
    builtin: source.builtin === true,
  }
}

/** 归一化列表响应；坏条目丢弃、顺序按 `createdAt` 倒序（最新在前）。 */
export function normalizeDecorationLibrary(raw: unknown): DecorationLibraryState {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const models: DecorationModel[] = []
  const seen = new Set<string>()
  // `items` 是 0.8.9 上游键名，`models` 是本仓既有约定：两者任一都要能读。
  const rawModels = Array.isArray(source.models) ? source.models : Array.isArray(source.items) ? source.items : []
  for (const candidate of rawModels) {
    const model = normalizeModel(candidate)
    if (!model || seen.has(model.assetId)) continue
    seen.add(model.assetId)
    models.push(model)
  }
  // 按名称排序（上游 `localeCompare`）：同一个人的装饰通常按物件命名，
  // 按名字找比按上传时间找更符合「我要找那个花瓶」的实际动作。
  // 同名时退回创建时间倒序，保证顺序稳定（否则每次重载卡片位置都会跳动）。
  models.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || right.createdAt - left.createdAt)
  return {
    models,
    totalBytes: Math.max(
      0,
      finiteNumber(
        source.totalBytes,
        models.reduce((sum, model) => sum + model.bytes, 0),
      ),
    ),
    maxBytes: Math.max(0, finiteNumber(source.maxBytes)),
    maxModels: Math.max(0, finiteNumber(source.maxModels)),
    maxUploadBytes: Math.max(0, finiteNumber(source.maxUploadBytes, Math.max(0, finiteNumber(source.maxBytes)))),
    uploadLimits: normalizeUploadLimits(source.uploadLimits),
  }
}

/** 模型下载地址（编辑器预览）。 */
export function decorationModelUrl(assetId: string): string {
  return `${DECORATION_MODELS_PATH}/${assetId}`
}

/** 按场景引用下发的地址（3D 舞台用；要求该模型被该场景引用）。 */
export function decorationSceneModelUrl(sceneId: string, assetId: string, projectId = ''): string {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return `/api/v1/modules/interaction3d/scenes/${encodeURIComponent(sceneId)}/models/${assetId}${query}`
}

/** 一次上传的校验结果。`null` 表示可以上传。 */
export function decorationUploadIssue(
  file:
    | {
        name?: string
        size?: number
        type?: string
      }
    | null
    | undefined,
  limits: Pick<DecorationLibraryState, 'maxBytes' | 'maxUploadBytes' | 'maxModels'> & { modelCount?: number },
): string | null {
  if (!file) return '请选择 GLB 文件。'
  const name = String(file.name || '')
  if (!/\.glb$/i.test(name)) return '请选择 .glb 文件。'
  const size = finiteNumber(file.size)
  if (size <= 0) return '文件为空，请重新选择模型。'
  // 单文件上限优先用上游的 `maxUploadBytes`（与库总量不是一回事：库可以很大，
  // 但单个 GLB 有独立上限）。文案对齐上游「文件大小为 X，单个 GLB 文件最多 Y」。
  const maxUploadBytes = limits.maxUploadBytes > 0 ? limits.maxUploadBytes : limits.maxBytes
  if (maxUploadBytes > 0 && size > maxUploadBytes) {
    const limit = Math.round(maxUploadBytes / (1024 * 1024))
    return `文件大小为 ${formatBytes(size)}，单个 GLB 文件最多 ${limit} MiB。`
  }
  if (limits.maxModels > 0 && finiteNumber(limits.modelCount) >= limits.maxModels) {
    return '装饰模型数量已达上限，请先删除不用的模型。'
  }
  return null
}

/** 从错误里取可展示文案（优先后端 `message`，其次 `detail`，最后兜底）。 */
export function decorationErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  const response = (error as { response?: { data?: Record<string, unknown> } })?.response
  const data = response?.data
  const message = data?.message
  if (typeof message === 'string' && message.trim()) return message.trim()
  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}

/** 从错误里取 `apiErrorCode`（前端按码分派，不靠文案）。 */
export function decorationErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { apiErrorCode?: unknown } } })?.response?.data?.apiErrorCode
  return typeof code === 'string' && code ? code : null
}

/**
 * 把库里的一件模型变成「可摆放的物品记录」。
 *
 * 尺寸给一个保守的默认占位（0.4m 立方）：真实包围盒要等 GLB 加载后由渲染层写回，
 * 但摆放的一瞬间就需要一个尺寸，否则物体会以 0 尺寸出现在场景里（看不见）。
 */
export function decorationToItem(model: DecorationModel, id: string): Record<string, unknown> {
  return {
    id,
    type: 'user-decoration',
    assetId: model.assetId,
    name: model.name,
    modelScale: 1,
    width: 0.4,
    depth: 0.4,
    height: 0.4,
    elevation: 0,
    x: 0,
    y: 0,
    rotation: 0,
  }
}

/** 装饰库的用户文案（0.8.9 `studio-user-decorations.js`）；与 `ui/decoration-library.ts` 共用同一份。 */
export const DECORATION_COPY = Object.freeze({
  uploadIdle: '上传一个 GLB 后，即可将它放进户型。',
  uploading: '正在上传并校验 GLB…',
  preparing: '正在准备装饰模型…',
  place: '放置模型',
  manage: '管理模型',
  deleted: '已删除模型。',
  noMatch: '没有匹配的装饰模型。',
  loadFailed: '装饰模型加载失败，请重新尝试或检查 GLB 文件。',
  uploadUnconfirmed: '无法确认上传结果。请检查网络后重新打开「我的装饰」查看。',
  deleteUnconfirmed: '无法确认删除结果。请检查网络后重新打开「我的装饰」查看。',
  readFailed: '无法读取装饰模型。请检查网络后重新打开「我的装饰」。',
  pixelUnit: '像素',
  uploadLimitTail: '字节）。请缩小贴图或简化网格后重新导出。',
  stillReferenced: '该模型仍在',
  customDecoration: '自定义装饰',
  sortHint: '长按灯组后拖动排序，右键可重命名、复制或删除',
})
