/**
 * 「已放置」面板（0.8.7）：当前楼层已摆放物品的清单，可搜索、定位、临时隐藏与锁定。
 *
 * 三条设计约束（都来自现场反馈，改动前请先确认）：
 *
 * 1. **隐藏 / 锁定只作用于本次编辑**：它们是编辑期的可视状态，不进户型文档 ——
 *    否则「临时藏起来看看效果」会被当成内容变化写进存档，别人打开就少了几件家具。
 * 2. **清单是纯派生的**：全部内容从 `getState()` 现算，面板自己不留副本，
 *    撤销 / 重载 / 换楼层后不会出现「面板里还有、画布上已经没了」的影子行。
 * 3. **重排要保留焦点与滚动**：搜索时逐键重排是必然的，但重排后必须把焦点还给输入框、
 *    把滚动位置还原 —— 否则每敲一个字光标就跳走。
 *
 * 行结构与 CSS 类名是 `studio.css` 的契约（`.placed-item-row` 等），不要就地改名。
 */

/** 单件物品的编辑期状态。 */
export type PlacedItemFlags = { hidden: boolean; locked: boolean }

export type PlacedItemsSession = {
  get(floorId: string, itemId: string): PlacedItemFlags
  toggle(floorId: string, itemId: string, flag: 'hidden' | 'locked'): void
  showAll(floorId: string): void
  /** 隐藏集合的指纹：渲染时用它判断「可见性变了没」。 */
  visibilityKey(floorId: string): string
  clear(): void
}

/** 面板需要的外部状态；由调用方每次渲染时现取，面板不缓存。 */
export type PlacedItemsState = {
  floorId: string
  items: Array<Record<string, unknown>>
  /** 物品类型 → 中文名（模型库词表）。 */
  names: Record<string, string>
  groups: Array<{ id?: unknown; name?: unknown }>
  selectedIds: Set<string>
  visible: boolean
  /** 物件高度包围盒（排序与行文案共用）；缺省时按 0 排序。 */
  heightBounds?: (item: Record<string, unknown>) => { min: number; max: number; exact: boolean } | null
}

export type PlacedItemsPanelOptions = {
  host: HTMLElement
  search: HTMLInputElement
  /** 滚动容器（默认就是 host）：定位时滚这里，不是滚整页。 */
  scrollHost?: HTMLElement
  session: PlacedItemsSession
  getState: () => PlacedItemsState
  onSelect: (item: Record<string, unknown>) => void
  onLocate: (item: Record<string, unknown>) => void
  onState: (item: Record<string, unknown>, flag: 'hidden' | 'locked') => void
  /** 行详情文案；`bounds` 由调用方在同一次 `getState()` 里给出，避免重复算包围盒。 */
  describe: (item: Record<string, unknown>, bounds: { min: number; max: number; exact: boolean } | null) => string
}

type ActionKind = 'locate' | 'hidden' | 'locked'

type RowRefs = {
  row: HTMLElement
  pick: HTMLButtonElement
  title: HTMLElement
  note: HTMLElement
  details: HTMLElement
  actions: Map<ActionKind, HTMLButtonElement>
}

type RowEntry = {
  item: Record<string, unknown>
  name: string
  flags: PlacedItemFlags
  /** 行详情文案（`实际高度 0.00–1.80 m` / `底部离地 0.00 m`）。 */
  height: string
  /** 高度包围盒：排序用它（上游 `n0()` 按 max → min → 原序）。 */
  bounds: { min: number; max: number; exact: boolean } | null
}

/** 面板的可变状态：模块级函数都作用在它上面，避免巨型闭包（复杂度棘轮按行数计）。 */
type PanelContext = {
  options: Required<Omit<PlacedItemsPanelOptions, 'scrollHost'>> & { scrollHost: HTMLElement }
  documentNode: Document
  rows: Map<string, RowRefs>
  empty: HTMLElement
  note: HTMLElement
  lastFloorId: string | null
  /** 上一次渲染的选中集合指纹（0.8.7 `selectionKey`）。 */
  lastSelectionKey: string | null
  wasVisible: boolean
  pendingReveal: boolean
  disposed: boolean
}

const EMPTY_FLAGS: PlacedItemFlags = { hidden: false, locked: false }
const ACTION_ORDER = ['locate', 'hidden', 'locked'] as const
const FLAG_ACTIONS: readonly string[] = ['hidden', 'locked']

export function itemIdOf(item: Record<string, unknown>): string {
  return String(item.id ?? '')
}

/** 每层一份 `itemId → flags`；同一层内的物品 id 唯一（场景载荷保证）。 */
export function createItemSession(): PlacedItemsSession {
  const byFloor = new Map<string, Map<string, PlacedItemFlags>>()
  const floorMap = (floorId: string) => {
    const existing = byFloor.get(floorId)
    if (existing) return existing
    const created = new Map<string, PlacedItemFlags>()
    byFloor.set(floorId, created)
    return created
  }
  return {
    get(floorId, id) {
      return byFloor.get(floorId)?.get(id) ?? EMPTY_FLAGS
    },
    toggle(floorId, id, flag) {
      if (!FLAG_ACTIONS.includes(flag)) return
      const map = floorMap(floorId)
      const current = map.get(id) ?? { ...EMPTY_FLAGS }
      map.set(id, { ...current, [flag]: !current[flag] })
    },
    showAll(floorId) {
      for (const flags of byFloor.get(floorId)?.values() ?? []) flags.hidden = false
    },
    visibilityKey(floorId) {
      const map = byFloor.get(floorId)
      if (!map) return ''
      const hidden: string[] = []
      for (const [id, flags] of map) if (flags.hidden) hidden.push(id)
      return hidden.sort().join('|')
    },
    clear() {
      byFloor.clear()
    },
  }
}

/**
 * 面板上显示的名字：模型库中文名 → 物品自带 name → 类型 id。
 * 灯组里的灯额外带组名（「台灯 · 床头灯组」），否则同款灯具无法区分。
 */
/** 名字来源：既接受「类型 → 名字」的扁平表，也接受目录条目（`{ name }`）。 */
type NameLookup = Record<string, string | { name?: string } | undefined>

/** 从两种形状里取出中文名；取不到返回空串。 */
function nameOf(entry: string | { name?: string } | undefined): string {
  if (typeof entry === 'string') return entry
  return entry?.name ? String(entry.name) : ''
}

export function placedItemName(
  item: Record<string, unknown>,
  catalog: NameLookup,
  groups: Array<{ id?: unknown; name?: unknown }> = [],
): string {
  const type = String(item.type ?? '')
  const base = nameOf(catalog[type]) || String(item.name ?? '') || type
  const groupId = item.lightGroupId
  if (groupId === undefined || groupId === null) return base
  const group = groups.find((candidate) => candidate.id === groupId)
  return group?.name ? `${base} · ${String(group.name)}` : base
}

function createRow(documentNode: Document, id: string): RowRefs {
  const row = documentNode.createElement('div')
  row.className = 'placed-item-row'
  row.dataset.placedId = id
  const pick = documentNode.createElement('button')
  pick.type = 'button'
  pick.className = 'placed-item-pick'
  pick.dataset.placedAction = 'select'
  pick.dataset.previewItemId = id
  const title = documentNode.createElement('strong')
  const note = documentNode.createElement('small')
  const details = documentNode.createElement('span')
  pick.append(title, note, details)
  row.append(pick)
  const actions = new Map<ActionKind, HTMLButtonElement>()
  for (const action of ACTION_ORDER) {
    const button = documentNode.createElement('button')
    button.type = 'button'
    button.dataset.placedAction = action
    row.append(button)
    actions.set(action, button)
  }
  return { row, pick, title, note, details, actions }
}

function actionLabel(action: ActionKind, flags: PlacedItemFlags): string {
  if (action === 'locate') return '定位'
  if (action === 'hidden') return flags.hidden ? '显示' : '隐藏'
  return flags.locked ? '解锁' : '锁定'
}

function actionPressed(action: ActionKind, flags: PlacedItemFlags): boolean | null {
  if (action === 'hidden') return flags.hidden
  if (action === 'locked') return flags.locked
  return null
}

function detailsText(entry: RowEntry): string {
  const suffix = (entry.flags.hidden ? ' · 已隐藏' : '') + (entry.flags.locked ? ' · 已锁定' : '')
  return entry.height + suffix
}

function syncRow(refs: RowRefs, entry: RowEntry, selected: boolean): void {
  refs.row.classList.toggle('selected', selected)
  refs.row.classList.toggle('muted', entry.flags.hidden)
  refs.pick.setAttribute('aria-pressed', String(selected))
  if (refs.title.textContent !== entry.name) refs.title.textContent = entry.name
  const note = String(entry.item.remark ?? '') || '无备注'
  if (refs.note.textContent !== note) refs.note.textContent = note
  const details = detailsText(entry)
  if (refs.details.textContent !== details) refs.details.textContent = details
  for (const action of ACTION_ORDER) {
    const button = refs.actions.get(action)
    if (!button) continue
    const label = actionLabel(action, entry.flags)
    if (button.textContent !== label) button.textContent = label
    const pressed = actionPressed(action, entry.flags)
    if (pressed !== null) button.setAttribute('aria-pressed', String(pressed))
    button.setAttribute('aria-label', `${label} ${entry.name}`)
  }
}

function buildEntry(ctx: PanelContext, item: Record<string, unknown>): RowEntry {
  const state = ctx.options.getState()
  const bounds = state.heightBounds?.(item) ?? null
  return {
    item,
    name: placedItemName(item, state.names as Record<string, { name?: string }>, state.groups),
    flags: ctx.options.session.get(state.floorId, itemIdOf(item)),
    height: ctx.options.describe(item, bounds),
    bounds,
  }
}

function matchesKeyword(entry: RowEntry, keyword: string): boolean {
  if (!keyword) return true
  return (entry.name + ' ' + String(entry.item.remark ?? '')).toLocaleLowerCase().includes(keyword)
}

/** 定位（滚动到可见）：只滚容器，且只在真的越界时才动。 */
function revealRow(scrollHost: HTMLElement, row: HTMLElement): void {
  if (scrollHost.clientHeight <= 0) return
  const hostBox = scrollHost.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  const topLimit = hostBox.top + scrollHost.clientTop + 4
  const bottomLimit = hostBox.top + scrollHost.clientTop + scrollHost.clientHeight - 4
  if (rowBox.top < topLimit) {
    scrollHost.scrollTop += rowBox.top - topLimit
    return
  }
  if (rowBox.bottom > bottomLimit) scrollHost.scrollTop += rowBox.bottom - bottomLimit
}

/** 按目标顺序就地移动节点：只搬必要的那几个，避免整列重建导致焦点与过渡丢失。 */
function spliceInto(host: HTMLElement, nodes: HTMLElement[]): void {
  let cursor: ChildNode | null = host.firstChild
  for (const node of nodes) {
    if (node !== cursor) host.insertBefore(node, cursor)
    cursor = node.nextSibling
  }
  while (cursor) {
    const next = cursor.nextSibling
    ;(cursor as HTMLElement).remove?.()
    cursor = next
  }
}

/**
 * 清单顺序 = **楼层内的原始顺序**（0.8.7 直接把 `items` 交给面板，不做排序）。
 *
 * 高度排序只用于重叠浮层的候选（上游 `n0()`）：那里是「同一位置压着的几件」，
 * 按高度从低到高才符合叠放直觉；清单是「整层有哪些东西」，保持放置顺序更容易定位。
 */
function entriesOf(ctx: PanelContext, state: PlacedItemsState): RowEntry[] {
  const keyword = ctx.options.search.value.trim().toLocaleLowerCase()
  return state.items.map((item) => buildEntry(ctx, item)).filter((entry) => matchesKeyword(entry, keyword))
}

function entryFor(ctx: PanelContext, trigger: HTMLElement): RowEntry | null {
  const row = trigger.closest('[data-placed-id]') as HTMLElement | null
  if (!row) return null
  const state = ctx.options.getState()
  const item = state.items.find((candidate) => itemIdOf(candidate) === row.dataset.placedId)
  return item ? buildEntry(ctx, item) : null
}

function mountRows(ctx: PanelContext, state: PlacedItemsState, entries: RowEntry[]): HTMLElement[] {
  if (ctx.lastFloorId !== state.floorId) {
    ctx.rows.clear()
    ctx.lastFloorId = state.floorId
  }
  const alive = new Set(state.items.map(itemIdOf))
  for (const cached of ctx.rows.keys()) if (!alive.has(cached)) ctx.rows.delete(cached)
  const nodes: HTMLElement[] = []
  for (const entry of entries) {
    const id = itemIdOf(entry.item)
    ctx.rows.set(id, ctx.rows.get(id) ?? createRow(ctx.documentNode, id))
    const refs = ctx.rows.get(id) as RowRefs
    syncRow(refs, entry, state.selectedIds.has(id))
    nodes.push(refs.row)
  }
  return nodes
}

function decorateEmpty(ctx: PanelContext, state: PlacedItemsState, entries: RowEntry[], nodes: HTMLElement[]) {
  if (entries.length === 0) {
    ctx.empty.textContent = state.items.length ? '没有匹配的物品' : '当前楼层还没有放置物品'
    nodes.push(ctx.empty)
  }
  const searching = ctx.options.search.value.trim().length > 0
  const selectedMissing =
    searching && state.selectedIds.size > 0 && !entries.some((entry) => state.selectedIds.has(itemIdOf(entry.item)))
  if (!selectedMissing) return
  ctx.note.textContent = '当前选中的物品不在搜索结果中'
  ctx.note.hidden = false
  nodes.push(ctx.note)
}

function revealSelection(ctx: PanelContext, state: PlacedItemsState, entries: RowEntry[]) {
  if (!ctx.pendingReveal) return
  const selected = entries.find((entry) => state.selectedIds.has(itemIdOf(entry.item)))
  const row = selected ? ctx.rows.get(itemIdOf(selected.item))?.row : undefined
  ctx.pendingReveal = false
  if (row) revealRow(ctx.options.scrollHost, row)
}

/**
 * 选中集合的指纹：选中变了才把清单滚到那一行（0.8.7 render 里的 `selectionKey`）。
 * 只比 id 与楼层：位姿变化不该触发滚动，否则拖动家具时清单会一直抖。
 */
function selectionKeyOf(state: PlacedItemsState): string {
  return `${state.floorId}|${[...state.selectedIds].sort().join(',')}`
}

/**
 * 「要不要把列表滚到选中行」的置位（0.8.7 `revealSelected` 的前置）。
 *
 * 三种时机：面板刚变成可见、选中集合变化、调用方明确要求跟随。抽成函数是为了不让
 * `render` 多出两个分支（那个函数已经贴着复杂度棘轮）。
 */
function updatePendingReveal(ctx: PanelContext, state: PlacedItemsState, followSelection: boolean | undefined): void {
  if (!ctx.wasVisible) ctx.pendingReveal = state.selectedIds.size > 0
  const nextSelectionKey = selectionKeyOf(state)
  if (ctx.lastSelectionKey !== nextSelectionKey) {
    ctx.lastSelectionKey = nextSelectionKey
    ctx.pendingReveal = state.selectedIds.size > 0
  }
  if (followSelection === false) ctx.pendingReveal = false
}

function render(ctx: PanelContext, options: { followSelection?: boolean } = {}) {
  if (ctx.disposed) return
  const state = ctx.options.getState()
  if (!state.visible) {
    ctx.wasVisible = false
    return
  }
  updatePendingReveal(ctx, state, options.followSelection)
  ctx.wasVisible = true
  const active = ctx.documentNode.activeElement as HTMLElement | null
  const keepFocus = active && ctx.options.host.contains(active) ? active : null
  const keepScroll = ctx.options.scrollHost.scrollTop
  ctx.note.hidden = true
  const entries = entriesOf(ctx, state)
  const nodes = mountRows(ctx, state, entries)
  decorateEmpty(ctx, state, entries, nodes)
  spliceInto(ctx.options.host, nodes)
  ctx.options.scrollHost.scrollTop = keepScroll
  if (keepFocus?.isConnected && ctx.documentNode.activeElement !== keepFocus) {
    keepFocus.focus({ preventScroll: true })
  }
  ctx.options.host.setAttribute('aria-label', `已放置物品，显示 ${entries.length} / ${state.items.length} 项`)
  if (options.followSelection !== false) revealSelection(ctx, state, entries)
}

function handleAction(ctx: PanelContext, trigger: HTMLElement) {
  const entry = entryFor(ctx, trigger)
  if (!entry) return
  const kind = trigger.dataset.placedAction
  if (kind === 'select') ctx.options.onSelect(entry.item)
  else if (kind === 'locate') ctx.options.onLocate(entry.item)
  else if (kind !== 'hidden' && kind !== 'locked') return
  else {
    const state = ctx.options.getState()
    ctx.options.session.toggle(state.floorId, itemIdOf(entry.item), kind)
    ctx.options.onState(entry.item, kind)
  }
  ctx.pendingReveal = false
  render(ctx, { followSelection: false })
}

export type PlacedItemsPanel = {
  update(options?: { followSelection?: boolean }): void
  destroy(): void
}

/**
 * 渲染「已放置」清单。
 *
 * 内容每次 `update()` 现算；DOM 行按物品 id 复用（`rows` 缓存），避免搜索时重建整列节点。
 */
export function createPlacedItemsPanel(options: PlacedItemsPanelOptions): PlacedItemsPanel {
  const documentNode = options.host.ownerDocument
  const empty = documentNode.createElement('p')
  empty.className = 'placed-empty'
  const note = documentNode.createElement('p')
  note.className = 'placed-session-note'
  note.setAttribute('role', 'status')
  const ctx: PanelContext = {
    options: { ...options, scrollHost: options.scrollHost ?? options.host },
    documentNode,
    rows: new Map(),
    empty,
    note,
    lastFloorId: null,
    lastSelectionKey: null,
    wasVisible: false,
    pendingReveal: false,
    disposed: false,
  }
  const onSearch = () => {
    // 0.8.7 的搜索输入按 `followSelection:false` 渲染：逐键重排时不该顺手把列表滚走，
    // 否则每敲一个字滚动位置就跳一次。
    render(ctx, { followSelection: false })
  }
  const onPick = (event: Event) => {
    const trigger = (event.target as Element | null)?.closest('[data-placed-action]') as HTMLElement | null
    if (trigger) handleAction(ctx, trigger)
  }
  options.search.addEventListener('input', onSearch)
  options.host.addEventListener('click', onPick)
  return {
    update(updateOptions) {
      render(ctx, updateOptions)
    },
    destroy() {
      ctx.disposed = true
      options.search.removeEventListener('input', onSearch)
      options.host.removeEventListener('click', onPick)
      ctx.rows.clear()
    },
  }
}
