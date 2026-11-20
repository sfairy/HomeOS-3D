/**
 * 「已放置」面板的接线：把 DOM 壳层（素材库卡片 / 模式页签）与运行时状态连起来。
 *
 * 为什么是「安装一次 + 弱表索引」而不是把面板挂在 runtime 上：引擎闭包里没有地方再塞
 * 新字段（`boot.ts` 有行数预算），而刷新点分散在 `refreshStudioView`。用
 * `WeakMap<appCtx, panel>` 做索引后，任何拿到 `appCtx` 的刷新点都能推动面板更新，
 * 不必为了一个面板去改引擎的状态形状。
 *
 * 交互边界（与 0.8.7 一致）：
 * - **选择**：走 `selectSceneObject('item', id)` 并刷新画布，与在画布上点选同一条链路；
 * - **定位**：选中 + 把清单行滚进视口。**不平移相机**（上游 `j2` 只在自动导图里居中）；
 * - **隐藏 / 锁定**：只写本会话的 `session`，不进户型文档；隐藏或「显示全部」后
 *   必须**重建场景**（`scope:'all'`），否则画布上仍留着被隐藏的网格。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import type { StudioAppContext } from '../studio-app-context'
import { itemTypeCatalog } from '../../items/item-catalog'
import { itemElevationMeaning } from '../../../loaders/studio-normalization'
import { editNumberText } from '../../studio-edit-metrics'
import {
  createItemSession,
  createPlacedItemsPanel,
  itemIdOf,
  type PlacedItemsPanel,
  type PlacedItemsState,
} from './studio-placed-items'
import { isPlacedItemHidden, registerPlacedVisibilitySource } from '../../items/placed-item-state'
import { exactHeightBoundsOf } from './editor-3d-geometry'
import { rememberLibraryMode } from './library-mode'
import { refreshEditor3D } from './editor-3d-wiring'
import { dismissAssetPreview, dismissOverlapPicker } from './overlap-and-preview-wiring'

type PlaceWiring = {
  panel: PlacedItemsPanel
  session: ReturnType<typeof createItemSession>
  card: HTMLElement
  panelElement: HTMLElement
  setMode: (mode: 'assets' | 'placed') => void
}

const wirings = new WeakMap<StudioAppContext, PlaceWiring>()

/**
 * 物品类型 → 中文名（模型库词表）。
 *
 * **懒构建**：模块初始化时就遍历 `itemTypeCatalog` 会踩到循环 import ——
 * 那一刻目录可能还没装配完，`Object.entries` 拿到的是空表，
 * 于是清单里所有行都退化成类型 id（`tvstand` 而不是「电视柜」）。
 * 改成首次渲染时构建，目录早已就绪。
 */
let typeNamesCache: Record<string, string> | null = null
function typeNames(): Record<string, string> {
  if (typeNamesCache) return typeNamesCache
  const names: Record<string, string> = {}
  for (const [type, entry] of Object.entries(itemTypeCatalog)) {
    const name = (entry as { name?: string } | undefined)?.name
    if (name) names[type] = name
  }
  typeNamesCache = names
  return names
}

function selectedItemIds(appCtx: StudioAppContext): Set<string> {
  const ids = new Set<string>()
  for (const selected of appCtx.selectedItems ?? []) {
    if (selected?.kind === 'item' && selected.id) ids.add(String(selected.id))
  }
  if (appCtx.selectedItem?.kind === 'item' && appCtx.selectedItem.id) {
    ids.add(String(appCtx.selectedItem.id))
  }
  return ids
}

/**
 * 行详情文案（0.8.7 `t0`）：
 * - 有精确包围盒 → `实际高度 0–1.8 m`（en dash，去尾零）；
 * - 否则 → 类型化的离地字段（`底部离地 0 m` / `光源安装高度 3.5 m`）。
 */
function describeItem(
  item: Record<string, unknown>,
  bounds: { min: number; max: number; exact: boolean } | null,
): string {
  if (bounds?.exact) return `实际高度 ${editNumberText(bounds.min)}–${editNumberText(bounds.max)} m`
  const elevation = Number(item.elevation ?? 0)
  return `${itemElevationMeaning(item.type).label} ${editNumberText(Number.isFinite(elevation) ? elevation : 0)} m`
}

/** 删除后重建场景（隐藏 / 显示全部都会改变「这一层该画什么」）。 */
function rebuildAllScenes(runtime: StudioAppRuntime): void {
  runtime.requestSceneRebuild?.({ scope: 'all', force: true })
  runtime.refreshStudioUi?.()
  runtime.refreshStudioView()
}

/**
 * 隐藏之后：如果要隐藏的正是当前选中项，先取消选中。
 *
 * 不取消的话，属性面板会继续编辑一件画布上已经不存在的物件（用户以为「没反应」）。
 * 只在**确实变成隐藏**时执行（0.8.7 判的是切换后的 `Ci(item).hidden`）：点「显示」把
 * 选中项放回来时不该顺手清掉选择。
 */
function dropSelectionIfHidden(runtime: StudioAppRuntime, item: Record<string, unknown>): void {
  const id = itemIdOf(item)
  const appCtx = runtime.appCtx
  if (!isPlacedItemHidden(appCtx, id)) return
  const selected = selectedItemIds(appCtx)
  if (!selected.has(id)) return
  appCtx.selectedItems = (appCtx.selectedItems ?? []).filter(
    (entry: { id?: unknown } | null) => String(entry?.id ?? '') !== id,
  )
  if (String(appCtx.selectedItem?.id ?? '') === id) runtime.refreshSelection()
}

/** 面板挂载点：页签容器 + 卡片 + 面板的兄弟关系（缺一不可）。 */
interface PanelHosts {
  libraryPanel: HTMLElement
  card: HTMLElement
  list: HTMLElement
  search: HTMLInputElement
  panelElement: HTMLElement
}

/** 收集挂载点；缺任何一个就说明不在编辑器页面（嵌入舞台等），直接放弃。 */
function collectPanelHosts(): PanelHosts | null {
  const documentNode = globalThis.document
  // 0.8.7：页签在 `.library-panel` 下，素材库卡片与「已放置」面板是它的兄弟节点。
  const libraryPanel = documentNode.querySelector('.library-panel') as HTMLElement | null
  const card = documentNode.querySelector('.asset-library-card') as HTMLElement | null
  const list = documentNode.getElementById('placed-items-list')
  const search = documentNode.getElementById('placed-search') as HTMLInputElement | null
  const panelElement = documentNode.getElementById('placed-items-panel') as HTMLElement | null
  if (!libraryPanel || !card || !list || !search || !panelElement) return null
  return { libraryPanel, card, list, search, panelElement }
}

/** 面板状态（页签模式要在 `getState` 与 `setMode` 之间共享）。 */
interface PanelModeState {
  mode: 'assets' | 'placed'
}

/** 组装面板选项：每次渲染现算，不缓存副本。 */
function createPanelOptions(
  runtime: StudioAppRuntime,
  hosts: PanelHosts,
  session: ReturnType<typeof createItemSession>,
  state: PanelModeState,
) {
  const appCtx = runtime.appCtx
  return {
    host: hosts.list,
    search: hosts.search,
    // 侧栏头部已固定，整栏不再滚动：定位时滚的是清单本身。
    scrollHost: hosts.list,
    session,
    describe: describeItem,
    getState(): PlacedItemsState {
      const items = (appCtx.studioState?.items ?? []) as Array<Record<string, unknown>>
      return {
        floorId: String(appCtx.activeFloorId ?? ''),
        items,
        names: typeNames(),
        groups: (appCtx.studioState?.lightGroups ?? []) as Array<{ id?: unknown; name?: unknown }>,
        selectedIds: selectedItemIds(appCtx),
        // 面板只在「已放置」页签下才有意义：没显示时不算可见，省掉每次刷新的整列重算。
        visible: state.mode === 'placed',
        heightBounds: (item) => exactHeightBoundsOf(runtime, itemIdOf(item)),
      }
    },
    onSelect(item: Record<string, unknown>) {
      runtime.selectSceneObject('item', itemIdOf(item))
      // 属性面板必须跟着走：否则「已放置」里选中的物件，右侧还停在上一件。
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView()
    },
    onLocate(item: Record<string, unknown>) {
      runtime.selectSceneObject('item', itemIdOf(item))
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView()
    },
    onState(item: Record<string, unknown>, flag: 'hidden' | 'locked') {
      // 与上游 `onState` 一致：先结束手势、收起浮层与悬停预览；只有「隐藏」才需要重建场景
      // （锁定只影响可拖动性，画面不变，重建反而会让手柄闪一下）。
      runtime.endStudioGesture?.()
      dismissOverlapPicker(runtime)
      dismissAssetPreview(runtime)
      if (flag !== 'hidden') {
        runtime.refreshStudioUi?.()
        runtime.refreshStudioView()
        return
      }
      dropSelectionIfHidden(runtime, item)
      rebuildAllScenes(runtime)
    },
  }
}

/** 页签按钮的视觉态（`hidden` 交替 + active / aria-pressed）。 */
function syncModeTabs(hosts: PanelHosts, next: 'assets' | 'placed'): void {
  hosts.card.hidden = next === 'placed'
  hosts.panelElement.hidden = next !== 'placed'
  for (const tab of hosts.libraryPanel.querySelectorAll<HTMLElement>('[data-library-mode]')) {
    const active = tab.dataset.libraryMode === next
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-pressed', String(active))
  }
}

/** 绑定页签切换与「显示全部」。 */
function bindPanelActions(
  runtime: StudioAppRuntime,
  hosts: PanelHosts,
  session: ReturnType<typeof createItemSession>,
  panel: PlacedItemsPanel,
  state: PanelModeState,
): void {
  const setMode = (next: 'assets' | 'placed') => {
    // 与 0.8.7 一致：两个面板互为兄弟，用 `hidden` 交替（不是给卡片加模式类）。
    state.mode = next
    rememberLibraryMode(runtime.appCtx, next)
    // 切页签会改变「可见集合」与预览范围，先结束手势再按新范围重建。
    runtime.endStudioGesture?.()
    const scope = runtime.getPreviewScopeSelection?.()
    syncModeTabs(hosts, next)
    if (scope) runtime.requestSceneRebuild?.({ scope, preserveLightCache: true })
    panel.update({ followSelection: true })
    runtime.refreshStudioUi?.()
    runtime.refreshStudioView()
    // 3D 叠层（高度手柄 / 中心十字）要按新的可见集合重投影一次。
    refreshEditor3D(runtime.appCtx)
  }
  for (const tab of hosts.libraryPanel.querySelectorAll<HTMLElement>('[data-library-mode]')) {
    tab.addEventListener('click', () => {
      const next = tab.dataset.libraryMode === 'placed' ? 'placed' : 'assets'
      if (next !== state.mode) setMode(next)
    })
  }
  globalThis.document.getElementById('show-all-items')?.addEventListener('click', () => {
    runtime.endStudioGesture?.()
    session.showAll(String(runtime.appCtx.activeFloorId ?? ''))
    panel.update({ followSelection: false })
    rebuildAllScenes(runtime)
  })
}

/** 安装（幂等）：重复调用只返回已有实例。 */
export function installPlacedItemsPanel(runtime: StudioAppRuntime): void {
  const appCtx = runtime.appCtx
  if (wirings.has(appCtx)) return
  const hosts = collectPanelHosts()
  if (!hosts) return
  const session = createItemSession()
  const state: PanelModeState = { mode: 'assets' }
  const panel = createPlacedItemsPanel(createPanelOptions(runtime, hosts, session, state))
  bindPanelActions(runtime, hosts, session, panel, state)
  wirings.set(appCtx, {
    panel,
    session,
    card: hosts.card,
    panelElement: hosts.panelElement,
    setMode: (mode) => {
      state.mode = mode
      rememberLibraryMode(appCtx, mode)
      syncModeTabs(hosts, mode)
    },
  })
  // 引擎侧（绘制 / 命中 / 拖拽）只认这份只读读取口，不直接摸面板实例。
  registerPlacedVisibilitySource(appCtx, session)
}

/** 由画布刷新路径推动（选中、换层、增删物品都会走到这里）。 */
export function refreshPlacedItemsPanel(appCtx: StudioAppContext): void {
  wirings.get(appCtx)?.panel.update()
}
