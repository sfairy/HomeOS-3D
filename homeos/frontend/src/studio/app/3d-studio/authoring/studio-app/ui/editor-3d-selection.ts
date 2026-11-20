/**
 * 3D 视口编辑的选中桥（从 `editor-3d-wiring` 拆出）。
 *
 * 三件事：
 * 1. 把「场景树里的对象」和「状态里的 item id」对上（旧缓存 / 合批实例缺 tag，要回填）；
 * 2. 选中时重建场景（让选中项退出合批，这样才有描边与可拖对象）；
 * 3. 拖动期间按 id 取三维对象，写字状态时同步朝向。
 */
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { applyItemOrientation } from '../geometry/item-orientation'
import type { EditorPick } from '../interaction/editor-picking'
import type { PlanMapper } from '../interaction/editor-3d-gesture'
import { adoptSceneItemTags } from '../interaction/editor-scene-tags'
import { findItem, itemsOf, type SceneObjectLike } from './editor-3d-geometry'

export interface SelectionBridge {
  ids: () => string[]
  select: (pick: EditorPick | null, additive: boolean) => void
  rebuildIndex: () => void
  liveObject: (id: string) => SceneObjectLike | null
  /** 索引脏了才重建（拾取前调用）。 */
  ensureIndex: () => void
  /** 场景重建后标记索引失效。 */
  invalidate: () => void
}

interface IndexState {
  entries: Map<string, SceneObjectLike>
  dirty: boolean
}

/** 选中项的 id 列表（单选与多选统一成数组）。 */
function selectedIds(runtime: StudioAppRuntime): string[] {
  const appCtx = runtime.appCtx
  if (appCtx.selectedItems?.length) {
    return (appCtx.selectedItems as EditorPick[]).filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  }
  return appCtx.selectedItem?.kind === 'item' ? [appCtx.selectedItem.id] : []
}

/** 重建 id → 对象的索引；缺 tag 的对象先按世界坐标补齐。 */
function rebuildIndex(runtime: StudioAppRuntime, state: IndexState, mapper: () => PlanMapper): void {
  state.entries.clear()
  const root = runtime.appCtx.sceneRootNode
  adoptSceneItemTags({
    sceneRoot: root,
    items: itemsOf(runtime),
    toWorld: (planX, planY) => {
      const { pixelsPerMeter, origin } = mapper()
      return { x: (planX - origin.x) / pixelsPerMeter, z: (planY - origin.y) / pixelsPerMeter }
    },
    instanceOffset: (mesh, index) => {
      const matrix = new three.Matrix4()
      ;(mesh as unknown as { getMatrixAt: (i: number, m: object) => void }).getMatrixAt(index, matrix)
      return { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14] }
    },
  })
  root?.traverse?.((object: SceneObjectLike) => {
    const data = object.userData as Record<string, unknown> | undefined
    const id = data?.editorItemId
    if (typeof id === 'string' && id) state.entries.set(id, object)
  })
  state.dirty = false
}

/** 追加 / 移除一个选中项（Shift 点击）。 */
function toggleSelection(runtime: StudioAppRuntime, pick: EditorPick): void {
  const current = selectedIds(runtime)
  const next = current.includes(pick.id) ? current.filter((id) => id !== pick.id) : [...current, pick.id]
  runtime.appCtx.selectedItems = next.map((id) => ({ kind: 'item', id }) as EditorPick)
  runtime.appCtx.selectedItem = next.length ? { kind: 'item', id: next[next.length - 1] } : null
}

/**
 * 选中之后必须重建场景：选中项要退出合批（`createSelectionRef` 在重建时生效），
 * 否则既没有描边，拖动时也拿不到能实时移动的三维对象。
 */
function afterSelection(runtime: StudioAppRuntime, state: IndexState): void {
  state.dirty = true
  runtime.requestSceneRebuild?.({ scope: 'items', preserveLightCache: true })
  // 右侧属性面板由 `refreshStudioUi` 驱动；只刷 2D 平面的话会「选中了但面板不更新」。
  runtime.refreshStudioUi?.()
  runtime.refreshStudioView?.()
}

export function createSelectionBridge(runtime: StudioAppRuntime, mapper: () => PlanMapper): SelectionBridge {
  const state: IndexState = { entries: new Map(), dirty: true }
  const select = (pick: EditorPick | null, additive: boolean): void => {
    if (!pick) runtime.refreshSelection()
    else if (additive) toggleSelection(runtime, pick)
    else runtime.selectSceneObject('item', pick.id)
    rebuildIndex(runtime, state, mapper)
    afterSelection(runtime, state)
  }
  return {
    ids: () => selectedIds(runtime),
    select,
    rebuildIndex: () => rebuildIndex(runtime, state, mapper),
    invalidate: () => {
      state.dirty = true
    },
    ensureIndex: () => {
      if (state.dirty) rebuildIndex(runtime, state, mapper)
    },
    liveObject: (id) => state.entries.get(id) ?? null,
  }
}

/** 修改一个物件的状态，并把朝向同步到它的三维对象（拖动期间的即时反馈）。 */
export function writeItemState(
  runtime: StudioAppRuntime,
  selection: SelectionBridge,
  id: string,
  write: (item: SceneObjectLike) => void,
): void {
  const item = findItem(runtime, id)
  if (!item) return
  write(item)
  const object = selection.liveObject(id)
  if (object) applyItemOrientation(object, item)
}
