/**
 * 重叠拾取与素材悬停预览的接线。
 *
 * 两者都是**纯附加**的交互层：不改命中测试的返回值，也不改模型库的卡片结构 ——
 * 命中测试仍返回一个 id（画布绘制与选择性重绘都依赖它），这里只是额外问一次
 * 「光标下还有没有别的」，以及在卡片上挂悬停预览。
 *
 * 为什么要单独一次 `collectOverlapCandidates`：真正的「所有命中」只能从命中测试的
 * 过滤条件倒推出来。与其把 `hitTestPlanItem` 改成返回数组（会波及所有调用方），
 * 不如在这里用同一套几何重复算一遍 —— 计算量是 O(物件数)，只在**按下鼠标**时跑一次。
 *
 * 0.8.7 的两个浮层都**挂在 body 上**（`position: fixed`）：它们的锚点在左栏素材库，
 * 若留在 `#plan-stage` 里，绝对定位会先被包含块偏移、再被 `overflow: hidden` 裁掉。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { pointInRotatedRectangle as pointInRotatedRectangle2 } from '../../../plan/geometry'
import { itemWithPlanFootprint as itemWithPlanFootprint2 } from '../../items/studio-item-posture'
import { isPlacedItemHidden, isPlacedItemLocked } from '../../items/placed-item-state'
import { itemTypeCatalog, lampItemTypeSet } from '../../items/item-catalog'
import { itemElevationMeaning } from '../../../loaders/studio-normalization'
import { editNumberText } from '../../studio-edit-metrics'
import { exactHeightBoundsOf } from './editor-3d-geometry'
import { createOverlapPicker, type OverlapCandidate, type OverlapPicker } from './studio-overlap-picker'
import { createAssetPreview, type AssetPreview, type AssetPreviewRecord } from './studio-asset-preview'
import { createAssetThumbnailRenderer, type AssetThumbnailRenderer } from './studio-asset-thumbnail'

type Wiring = {
  runtime: StudioAppRuntime
  picker: OverlapPicker
  preview: AssetPreview
  thumbnail: AssetThumbnailRenderer
}
const wirings = new WeakMap<object, Wiring>()

/** 「整组尺寸」的四类组合品（0.8.7 同列表）。 */
const GROUP_PREVIEW_TYPES = new Set(['tea-table-set', 'coffeetable', 'dual-monitors', 'figurine-set'])

function typeNames(): Record<string, string> {
  const names: Record<string, string> = {}
  for (const [type, entry] of Object.entries(itemTypeCatalog)) {
    const name = (entry as { name?: string } | undefined)?.name
    if (name) names[type] = name
  }
  return names
}

/**
 * 懒构建：模块初始化时遍历 `itemTypeCatalog` 会踩到循环 import（目录还没装配完），
 * 结果是浮层里所有候选都显示成类型 id。首次使用时再建。
 */
let typeNamesCache: Record<string, string> | null = null
function cachedTypeNames(): Record<string, string> {
  typeNamesCache ??= typeNames()
  return typeNamesCache
}

/** 物件的最小形状：判断命中只需要尺寸与类型。 */
type PlanItemLike = { id: string; type: string; width: number; depth: number; remark?: unknown; elevation?: unknown }

/** 命中盒：小件（插座）有一个最小像素下限，必须与 `hitTestPlanItem` 保持一致。 */
function hitBoxFor(item: PlanItemLike, pixelsPerMeter: number, zoom: number) {
  if (item.type !== 'smart-socket-86') return itemWithPlanFootprint2(item, pixelsPerMeter)
  const minimum = 12 / (pixelsPerMeter * zoom)
  return { ...item, width: Math.max(item.width, minimum), depth: Math.max(item.depth, minimum) }
}

/** 该物件是否参与重叠候选（隐藏项、庭院地面、非当前分类都要排除）。 */
function isOverlapCandidateItem(runtime: StudioAppRuntime, item: PlanItemLike): boolean {
  if (item.type === 'courtyard-area') return false
  if (isPlacedItemHidden(runtime.appCtx, item.id)) return false
  // 0.8.7 `Di()` 要求「未锁定」：锁定件本来就不能拖动，列进候选只会让人点完没反应。
  if (isPlacedItemLocked(runtime.appCtx, item.id)) return false
  return runtime.isPlanItemVisible(item)
}

/** 候选的详情文案：与「已放置」清单同一套（`实际高度 min–max m`）。 */
function candidateDetail(runtime: StudioAppRuntime, item: PlanItemLike): string | undefined {
  const bounds = exactHeightBoundsOf(runtime, item.id)
  if (bounds?.exact) return `实际高度 ${editNumberText(bounds.min)}–${editNumberText(bounds.max)} m`
  const elevation = Number(item.elevation)
  return Number.isFinite(elevation)
    ? `${itemElevationMeaning(item.type).label} ${editNumberText(elevation)} m`
    : undefined
}

/**
 * 光标位置下的全部物件候选（含被压在下面的）。
 *
 * 判定与 `hitTestPlanItem` 同源：同样的 `itemWithPlanFootprint` 与
 * `pointInRotatedRectangle`，所以「看起来选得到」和「这里列出来」永远一致。
 */
export function collectOverlapCandidates(
  runtime: StudioAppRuntime,
  planPoint: { x: number; y: number },
): OverlapCandidate[] {
  const appCtx = runtime.appCtx
  const pixelsPerMeter = runtime.getPixelsPerMeter() || 100
  const zoom = appCtx.planView.zoom
  const hits: Array<{ item: PlanItemLike; index: number; bounds: { min: number; max: number } | null }> = []
  const allItems = appCtx.studioState.items as unknown as PlanItemLike[]
  allItems.forEach((item, index) => {
    if (!isOverlapCandidateItem(runtime, item)) return
    if (!pointInRotatedRectangle2(planPoint, hitBoxFor(item, pixelsPerMeter, zoom), pixelsPerMeter)) return
    hits.push({ item, index, bounds: exactHeightBoundsOf(runtime, item.id) })
  })
  // 与「已放置」清单同序（高度上限 → 下限 → 楼层内原序），列表与浮层的顺序才一致。
  hits.sort(
    (left, right) =>
      (left.bounds?.max ?? 0) - (right.bounds?.max ?? 0) ||
      (left.bounds?.min ?? 0) - (right.bounds?.min ?? 0) ||
      left.index - right.index,
  )
  return hits.map(({ item }) => ({
    id: String(item.id),
    label: cachedTypeNames()[item.type] || String(item.type || '物件'),
    remark: String(item.remark || '') || undefined,
    height: candidateDetail(runtime, item),
  }))
}

function findItem(runtime: StudioAppRuntime, id: string): Record<string, unknown> | null {
  const found = (runtime.appCtx.studioState.items as Array<Record<string, unknown>>).find(
    (candidate) => String(candidate.id) === id,
  )
  return found ?? null
}

/** 尺寸三元组：实例优先（已放置件可能改过尺寸），否则取目录默认值。 */
function previewDimensions(
  item: Record<string, unknown> | null,
  catalog: Record<string, unknown> | undefined,
): { width: number; depth: number; height: number } | null {
  const width = Number(item?.width ?? catalog?.width ?? 0)
  const depth = Number(item?.depth ?? catalog?.depth ?? 0)
  const height = Number(item?.height ?? catalog?.height ?? 0)
  return width > 0 && depth > 0 && height > 0 ? { width, depth, height } : null
}

/**
 * 指针下的元素 → 预览记录。
 *
 * 两种来源：素材卡只有 `data-item-type`（取目录尺寸）；「已放置」行带
 * `data-preview-item-id`（取实例尺寸，沙发 / 电视 / 窗帘还要看变体字段）。
 */
function resolvePreviewRecord(runtime: StudioAppRuntime, target: HTMLElement): AssetPreviewRecord | null {
  const previewId = target.dataset.previewItemId
  const item = previewId ? findItem(runtime, previewId) : null
  const type = String(item?.type || target.dataset.itemType || '')
  // 楼板洞口没有可渲染模型；目录里没有的类型（本项目自有）也不预览。
  if (!type || type === 'flooropening') return null
  const catalog = (itemTypeCatalog as Record<string, Record<string, unknown>>)[type]
  if (!catalog && !item) return null
  const dimensions = previewDimensions(item, catalog)
  if (!dimensions) return null
  return {
    ...(catalog || {}),
    ...(item || {}),
    type,
    ...dimensions,
    previewName: String(
      target.dataset.libraryName || item?.note || item?.name || catalog?.name || cachedTypeNames()[type] || type,
    ),
    previewSchematic: lampItemTypeSet.has(type),
    previewGroup: GROUP_PREVIEW_TYPES.has(type),
  }
}

/** 换场景风格 / 换前端修订后缩略图必须重渲染，所以主题键两者都要带。 */
function themeKeyOf(runtime: StudioAppRuntime): string {
  const style = (runtime.appCtx as { sceneStyle?: unknown }).sceneStyle
  return JSON.stringify([typeof style === 'string' ? style : 'default', new URL(import.meta.url).search])
}

/** 预览失败写全局日志（0.8.7 同一句文案与 phase）。 */
function reportPreviewFailure(error: unknown, record: AssetPreviewRecord): void {
  const name = record.previewName || record.type
  globalThis.window?.HomeOSLog?.warn?.(`模型悬停预览未能生成：${name}，名称和尺寸仍可使用`, {
    phase: 'model-hover-preview',
    code: 'MODEL_PREVIEW_FAILED',
    modelType: record.type,
    hint: '此记录仅表示悬停预览未生成；放置后的模型显示结果需在实际画面核对。',
    reason: (error as Error)?.message || String(error),
  })
}

/** 安装（幂等）。 */
export function installOverlapAndPreview(runtime: StudioAppRuntime): void {
  const appCtx = runtime.appCtx
  if (wirings.has(appCtx)) return
  const documentNode = globalThis.document
  const overlapHost = documentNode.getElementById('overlap-items')
  const previewHost = documentNode.getElementById('asset-preview')
  if (!overlapHost || !previewHost) return
  // 0.8.7 两个浮层都是 body 的直接子节点：fixed 定位才能超出左栏 / 画布的裁剪边界。
  if (overlapHost.parentElement !== documentNode.body) documentNode.body.append(overlapHost)
  if (previewHost.parentElement !== documentNode.body) documentNode.body.append(previewHost)
  overlapHost.hidden = true
  const thumbnail = createAssetThumbnailRenderer(runtime)
  wirings.set(appCtx, {
    runtime,
    picker: createOverlapPicker({
      host: overlapHost,
      onPick(id) {
        runtime.selectSceneObject('item', id)
        // 属性面板由 `refreshStudioUi` 驱动：只刷画布会「选中了但右侧还停在上一件 / 空面板」。
        runtime.refreshStudioUi?.()
        runtime.refreshStudioView()
      },
      onClose() {
        overlapHost.hidden = true
      },
    }),
    thumbnail,
    preview: createAssetPreview({
      host: previewHost,
      resolve: (target) => resolvePreviewRecord(runtime, target),
      thumbnail,
      themeKey: () => themeKeyOf(runtime),
      onError: reportPreviewFailure,
    }),
  })
}

/**
 * 重叠区域按下时「这次拖谁」：光标下的候选里有当前选中的那件，就返回它。
 *
 * 命中测试只会返回最上面那件。若用户刚从浮层里选了被压住的那件，再按下去仍按命中结果
 * 取最上面那件，就会「选中的那件永远拖不动」—— 只能在原地点一下重新弹浮层。
 *
 * 只在单选时生效：多选拖动本来就该整体移动（命中其中任一件都算）。
 */
export function overlapDragTarget(runtime: StudioAppRuntime, planPoint: unknown): string | null {
  const { appCtx } = runtime
  if (appCtx.selectedItems?.length) return null
  const selected = appCtx.selectedItem
  if (!selected || selected.kind !== 'item') return null
  const selectedId = String(selected.id)
  const candidates = collectOverlapCandidates(runtime, planPoint as { x: number; y: number })
  return candidates.some((candidate) => candidate.id === selectedId) ? selectedId : null
}

/**
 * 画布上**单击**（按下 → 抬起没拖动）时：有 ≥2 个重叠候选就弹选择器。返回是否已接管本次点击。
 *
 * 不能在按下时弹：那一刻画布已经 `setPointerCapture`，捕获期间的点击到不了浮层，
 * 于是按下只弹窗、拖动永远起不来。放到松手之后，拖动照常，单击仍能选到被压住的那件。
 */
export function offerOverlapPicker(runtime: StudioAppRuntime, planPoint: unknown, screenPoint: unknown): boolean {
  const wiring = wirings.get(runtime.appCtx)
  if (!wiring) return false
  const candidates = collectOverlapCandidates(runtime, planPoint as { x: number; y: number })
  if (candidates.length < 2) {
    wiring.picker.hide()
    return false
  }
  wiring.picker.show(candidates, screenPoint as { x: number; y: number })
  return true
}

/**
 * 松手后列候选（`pointer-input` 的入口：它只拿得到 `appCtx`）。
 *
 * 按 `appCtx` 反查这次运行时的接线：否则要给 `StudioAppRuntime` 再加一个成员，
 * 而 `boot.ts` 已经贴着文件规模棘轮，一行都不该再长。
 */
export function offerOverlapPickerFor(appCtx: object, planPoint: unknown, screenPoint: unknown): boolean {
  const wiring = wirings.get(appCtx)
  return wiring ? offerOverlapPicker(wiring.runtime, planPoint, screenPoint) : false
}

/** 换楼层 / 选择变化时收起：候选集合已失效。 */
export function dismissOverlapPicker(runtime: StudioAppRuntime): void {
  wirings.get(runtime.appCtx)?.picker.hide()
}

/** 隐藏 / 锁定后收起悬停预览（0.8.7 `oo?.hide()`）：预览的是旧位姿，留着会误导。 */
export function dismissAssetPreview(runtime: StudioAppRuntime): void {
  wirings.get(runtime.appCtx)?.preview.hide()
}

/**
 * 兼容入口：早期版本在这里逐卡挂 enter/leave。
 * 0.8.7 改成 document 委托（素材卡 + 已放置行共用），因此这里只需保证预览已安装。
 */
export function bindAssetHoverPreview(runtime: StudioAppRuntime): void {
  installOverlapAndPreview(runtime)
}

export function disposeOverlapAndPreview(runtime: StudioAppRuntime): void {
  const wiring = wirings.get(runtime.appCtx)
  if (!wiring) return
  wiring.picker.destroy()
  wiring.preview.destroy()
  wiring.thumbnail.dispose()
  wirings.delete(runtime.appCtx)
}
