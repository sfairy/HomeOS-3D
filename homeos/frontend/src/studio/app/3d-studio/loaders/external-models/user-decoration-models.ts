/**
 * 用户装饰模型的**动态注册表**（0.8.9「我的装饰」的渲染侧）。
 *
 * 为什么需要这一层：外部模型管理器（`studio-external-models.ts`）只会按**类型名**去
 * `ALL_ITEM_MODELS` 里查静态描述符 —— 那是随包发布的固定清单。用户上传的 GLB
 * 既不在里面、也不可能在构建期知道，所以必须有一条「按 assetId 现注册 URL」的通道。
 *
 * 键的形状取 `model:<assetId>`：与类型名（`sofa` / `wallac`）天然不冲突，
 * 也一眼能看出「这条是用户资产」，排查时不必再去翻静态清单。
 */

/** 用户装饰模型的键前缀。 */
export const USER_DECORATION_MODEL_PREFIX = 'model:'

/** 编辑器预览用的下载路径（只判登录）。 */
const EDITOR_MODEL_PATH = '/api/v1/studio3d/models/'

/**
 * 嵌入舞台（仪表盘 3D 控件）用的下载路径（**要求该模型被这个场景引用**）。
 *
 * 两条路径不能混：
 * - `/studio3d/models/{id}` 只判登录 —— `assetId` 是可枚举的 hex 空间，
 *   「知道 id」不该等于「有权取」；
 * - `/modules/interaction3d/scenes/{scene}/models/{id}` 额外校验引用，
 *   仪表盘只该看到「这份户型真的用到的」模型。
 */
const STAGE_MODEL_PATH = '/api/v1/modules/interaction3d/scenes/'

/** 合法 assetId（32 位小写 hex），与后端 `uuid4().hex` 同形。 */
const ASSET_ID_PATTERN = /^[0-9a-f]{32}$/

/** 一条动态模型描述符（形状与 `ALL_ITEM_MODELS` 的条目一致）。 */
type UserDecorationModelDefinition = {
  url: string
  fallbackUrl: string
  scaleBasis: [number, number, number]
  /** 保留模型自身原点：用户模型的「底」不一定在 y=0，按包围盒归位更稳。 */
  preserveOrigin: boolean
  /** 标记来源，渲染期可据此决定是否不参与合批（用户资产随时可能被删）。 */
  userDecoration: true
}

const definitionsByKey = new Map<string, UserDecorationModelDefinition>()

/**
 * assetId → 展示名。
 *
 * 为什么需要单独一张表：拖拽的**唯一**载荷是 assetId（上游 MIME 契约如此），
 * 而放置时要写入 `name`（属性面板标题、物件列表都靠它）。没有这张表，
 * 拖拽放置只能写死一个 `'我的装饰'` —— 于是画布上点开任何一件装饰，
 * 标题都是「我的装饰」，用户无法确认自己选的是哪一个。
 *
 * 名字在「库加载完成」时批量登记；改名/上传后重新加载会覆盖，无需手动清理。
 */
const nameByAssetId = new Map<string, string>()

/** 批量登记模型名（库加载后调用）。 */
export function registerDecorationModelNames(models: ReadonlyArray<{ assetId: string; name: string }>): void {
  for (const model of models) {
    if (!ASSET_ID_PATTERN.test(model.assetId)) continue
    const name = String(model.name || '').trim()
    if (name) nameByAssetId.set(model.assetId, name)
  }
}

/** 取某个 assetId 的展示名（未登记返回空串，调用方自行兜底）。 */
export function decorationModelName(assetId: unknown): string {
  const key = typeof assetId === 'string' ? assetId.replace(/^model:/i, '').toLowerCase() : ''
  return nameByAssetId.get(key) || ''
}

/** 删除模型时一并清掉名字。 */
export function forgetDecorationModelName(assetId: string): void {
  nameByAssetId.delete(assetId)
}

/**
 * 舞台上下文（嵌入舞台时由 boot 设置一次）。
 *
 * 有值时所有用户装饰的 URL 都走**场景内**路径；为空时走编辑器路径。
 * 放在模块级而不是每条描述符上：同一个 assetId 在两个宿主里指的是同一份字节，
 * 变的是「谁有权取」，那是全局上下文而不是描述符属性。
 */
const stageContext: { sceneId: string; projectId: string } = { sceneId: '', projectId: '' }

/** 设置舞台上下文（传空串退回编辑器路径）。 */
export function setUserDecorationStageContext(sceneId: string, projectId = ''): void {
  stageContext.sceneId = String(sceneId || '')
  stageContext.projectId = String(projectId || '')
  // 已登记的 URL 必须跟着换：切场景 / 从编辑器进舞台时，旧 URL 会 404。
  for (const [key, definition] of definitionsByKey) {
    const nextUrl = modelUrlFor(key.slice(USER_DECORATION_MODEL_PREFIX.length))
    if (nextUrl && nextUrl !== definition.url) {
      definitionsByKey.set(key, Object.freeze({ ...definition, url: nextUrl, fallbackUrl: nextUrl }))
    }
  }
}

/** 按当前上下文拼出一个 assetId 的下载 URL。 */
function modelUrlFor(assetId: string): string {
  if (!stageContext.sceneId) return `${EDITOR_MODEL_PATH}${assetId}`
  const query = stageContext.projectId ? `?projectId=${encodeURIComponent(stageContext.projectId)}` : ''
  return `${STAGE_MODEL_PATH}${encodeURIComponent(stageContext.sceneId)}/models/${assetId}${query}`
}

/** 拼出某个 assetId 的模型键。 */
export function userDecorationModelKey(assetId: string): string {
  return USER_DECORATION_MODEL_PREFIX + assetId
}

/** 这个键是否指向用户装饰模型。 */
export function isUserDecorationModelKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith(USER_DECORATION_MODEL_PREFIX)
}

/**
 * 注册（或刷新）一条用户装饰模型。
 *
 * 幂等：同一个 assetId 重复注册只覆盖 URL —— 用户重传同名模型后，
 * 缓存里的旧 URL 必须跟着变，否则会一直画旧字节。
 *
 * `size` 是新建物品时的占位尺寸（米）。真实包围盒由加载后的模型写回，
 * 这里只保证「摆放的瞬间有个不自相矛盾的尺寸」。
 */
export function registerUserDecorationModel(
  assetId: string,
  size: { width: number; height: number; depth: number },
): string | null {
  if (!ASSET_ID_PATTERN.test(assetId)) return null
  const url = modelUrlFor(assetId)
  const key = userDecorationModelKey(assetId)
  definitionsByKey.set(
    key,
    Object.freeze({
      url,
      fallbackUrl: url,
      scaleBasis: [positive(size.width, 0.4), positive(size.height, 0.4), positive(size.depth, 0.4)] as [
        number,
        number,
        number,
      ],
      preserveOrigin: true,
      userDecoration: true,
    }),
  )
  return key
}

/** 查一条动态描述符（未注册返回 `undefined`，交由静态清单继续查）。 */
export function userDecorationModelDefinition(key: unknown): UserDecorationModelDefinition | undefined {
  return typeof key === 'string' ? definitionsByKey.get(key) : undefined
}

/** 释放某个 assetId 的登记（模型被删除时调用，避免继续尝试加载 404 的 URL）。 */
export function unregisterUserDecorationModel(assetId: string): void {
  definitionsByKey.delete(userDecorationModelKey(assetId))
}

/**
 * 让一个物品记录可被渲染：`user-decoration` 物品在这里就地注册并返回模型键。
 *
 * 渲染链路会在**每次**建场景时调用它，因此必须幂等且不能抛错
 * （一条坏 assetId 不该让整层地面消失）。
 */
export function modelKeyForDecorationItem(item: {
  type?: string
  assetId?: unknown
  /** 0.8.9 上游的键名（`model:<hex32>`）；与 `assetId` 任读其一。 */
  modelAssetId?: unknown
  width?: unknown
  height?: unknown
  depth?: unknown
}): string | null {
  if (item?.type !== 'user-decoration') return null
  const rawAssetId = typeof item.assetId === 'string' ? item.assetId : item.modelAssetId
  const assetId = typeof rawAssetId === 'string' ? rawAssetId.replace(/^model:/i, '').toLowerCase() : ''
  if (!ASSET_ID_PATTERN.test(assetId)) return null
  return registerUserDecorationModel(assetId, {
    width: Number(item.width) || 0.4,
    height: Number(item.height) || 0.4,
    depth: Number(item.depth) || 0.4,
  })
}

function positive(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** 测试钩子：清空登记表（用例之间不互相污染）。 */
export function resetUserDecorationModelsForTest(): void {
  definitionsByKey.clear()
  nameByAssetId.clear()
  stageContext.sceneId = ''
  stageContext.projectId = ''
}

/**
 * 放置用户装饰时写进物件记录的字段。
 *
 * 抽成函数而不是在两条放置路径里各写一份字面量：**此前拖拽那条写死了
 * `name: '我的装饰'`**，于是画布上点开任何一件装饰，属性面板标题都是
 * 「我的装饰」，用户无法确认自己选的是哪一个 —— 而点击放置那条是对的，
 * 两条路径不一致导致「有时对有时不对」。
 *
 * `name` 优先取库里的真实名（库加载时登记），未登记才回落到目录名。
 */
export function decorationPlacementFields(assetId: string, explicitName?: unknown): Record<string, unknown> {
  const key = assetId.replace(/^model:/i, '').toLowerCase()
  // 显式名字优先（点击路径手上就有库记录），其次查登记表，最后回落目录名。
  const givenName = typeof explicitName === 'string' ? explicitName.trim() : ''
  return {
    assetId: key,
    name: givenName || decorationModelName(key) || '我的装饰',
    modelScale: 1,
  }
}
