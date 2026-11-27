/**
 * 重叠物件拾取（0.8.7）：光标下有多件重叠时，列出候选让人选，而不是「最上面那件永远赢」。
 *
 * 为什么必须做：户型里沙发与地毯、灯具与家具大面积重叠是常态。命中测试只能返回一个 id，
 * 于是被压在下面的那件**永远选不到** —— 用户以为是坏的，实际是拾取策略的问题。
 *
 * 交互契约：
 * - 只在候选 ≥ 2 时出现；只有一件时保持「点哪选哪」的既有手感。
 * - 换楼层 / 选择变化就关掉：候选集合已经失效，留着会让人选到别层的东西。
 * - 键盘可选：`↑`/`↓` 移，`Enter` 选，`Esc` 关。
 *
 * 结构说明：面板的可变状态收在一个 `PickerContext` 里，所有行为都是模块级函数，
 * 而不是挂在 `createOverlapPicker` 闭包里 —— 闭包版会让单个函数超过 80 行
 * 状态与渲染也就分不开了。
 */

export type OverlapCandidate = {
  id: string
  /** 显示名（模型库中文名 / 类型 id）。 */
  label: string
  /** 备注（可选），用来区分同款。 */
  remark?: string
  /** 高度 / 尺寸描述（可选）。 */
  height?: string
}

export type OverlapPickerOptions = {
  host: HTMLElement
  onPick: (id: string) => void
  /** 关闭时回调（点到面板外 / Esc / 选完）。 */
  onClose?: () => void
}

export type OverlapPicker = {
  /** 在屏幕坐标处展示候选；空数组等于关闭。 */
  show(candidates: OverlapCandidate[], anchor: { x: number; y: number }): void
  hide(): void
  /** 当前是否展开。 */
  readonly open: boolean
  destroy(): void
}

type PickerContext = {
  documentNode: Document
  panel: HTMLElement
  options: OverlapPickerOptions
  candidates: OverlapCandidate[]
  activeIndex: number
  isOpen: boolean
}

const PANEL_OFFSET_PX = 6
const EDGE_MARGIN_PX = 8

/** 把面板夹在视口内：靠近右/下边缘时翻到光标另一侧。 */
function placePanel(panel: HTMLElement, anchor: { x: number; y: number }): void {
  panel.style.left = '0px'
  panel.style.top = '0px'
  const box = panel.getBoundingClientRect()
  const view = panel.ownerDocument.defaultView
  const maxX = (view?.innerWidth ?? 0) - box.width - EDGE_MARGIN_PX
  const maxY = (view?.innerHeight ?? 0) - box.height - EDGE_MARGIN_PX
  const left = Math.min(Math.max(EDGE_MARGIN_PX, anchor.x + PANEL_OFFSET_PX), Math.max(EDGE_MARGIN_PX, maxX))
  const top = Math.min(Math.max(EDGE_MARGIN_PX, anchor.y + PANEL_OFFSET_PX), Math.max(EDGE_MARGIN_PX, maxY))
  panel.style.left = `${Math.round(left)}px`
  panel.style.top = `${Math.round(top)}px`
}

/**
 * 一行的文本（0.8.7 同一句话）：`名称 · 备注 · detail · 已锁定`。
 *
 * 上游把候选拼成**单个文本节点**而不是 `strong + small + span`：浮层只有 2–4 行，
 * 用标题加粗反而让「哪一段是备注」看起来像两种信息层级，且行高被拉高。
 */
function candidateText(candidate: OverlapCandidate): string {
  const parts = [candidate.label]
  if (candidate.remark) parts.push(candidate.remark)
  if (candidate.height) parts.push(candidate.height)
  return parts.join(' · ')
}

/** 构造一行候选（纯文本按钮）。 */
function createCandidateRow(ctx: PickerContext, candidate: OverlapCandidate, index: number): HTMLElement {
  const entry = ctx.documentNode.createElement('button')
  entry.type = 'button'
  entry.dataset.overlapId = candidate.id
  entry.className = index === ctx.activeIndex ? 'is-active' : ''
  entry.setAttribute('aria-selected', String(index === ctx.activeIndex))
  entry.textContent = candidateText(candidate)
  return entry
}

function render(ctx: PickerContext): void {
  ctx.panel.replaceChildren()
  const heading = ctx.documentNode.createElement('p')
  heading.className = 'overlap-heading'
  heading.textContent = `重叠物件 · ${ctx.candidates.length}`
  ctx.panel.append(heading)
  ctx.candidates.forEach((candidate, index) => ctx.panel.append(createCandidateRow(ctx, candidate, index)))
}

function moveActive(ctx: PickerContext, delta: number): void {
  if (!ctx.candidates.length) return
  ctx.activeIndex = (ctx.activeIndex + delta + ctx.candidates.length) % ctx.candidates.length
  render(ctx)
  ctx.panel.querySelector<HTMLElement>('.is-active')?.scrollIntoView?.({ block: 'nearest' })
}

function hide(ctx: PickerContext): void {
  if (!ctx.isOpen) return
  ctx.isOpen = false
  ctx.panel.hidden = true
  ctx.candidates = []
  ctx.options.onClose?.()
}

function pick(ctx: PickerContext, id: string): void {
  hide(ctx)
  ctx.options.onPick(id)
}

function handleKeyDown(ctx: PickerContext, event: KeyboardEvent): void {
  if (!ctx.isOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    hide(ctx)
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(ctx, event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key !== 'Enter') return
  const picked = ctx.candidates[ctx.activeIndex]
  if (!picked) return
  event.preventDefault()
  pick(ctx, picked.id)
}

function show(ctx: PickerContext, candidates: OverlapCandidate[], anchor: { x: number; y: number }): void {
  if (candidates.length < 2) {
    hide(ctx)
    return
  }
  ctx.candidates = candidates
  ctx.activeIndex = 0
  ctx.isOpen = true
  ctx.panel.hidden = false
  // 先渲染再定位：`getBoundingClientRect` 需要真实尺寸。
  render(ctx)
  placePanel(ctx.panel, anchor)
}

export function createOverlapPicker(options: OverlapPickerOptions): OverlapPicker {
  const documentNode = options.host.ownerDocument
  // 用宿主节点（`#overlap-items`）做面板：另建节点而不 append 会「永远存在内存里」，
  // 表现为「点击有反应、浮层不出现」。模板里已经带了同名 class，这里只补语义属性。
  const panel = options.host
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', '重叠物件')
  panel.hidden = true
  const ctx: PickerContext = { documentNode, panel, options, candidates: [], activeIndex: 0, isOpen: false }

  const onClick = (event: Event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-overlap-id]')
    if (!target?.dataset.overlapId) return
    event.stopPropagation()
    pick(ctx, target.dataset.overlapId)
  }
  const onKeyDown = (event: KeyboardEvent) => handleKeyDown(ctx, event)
  /** 点到面板以外就关：用捕获阶段，避免被画布的 pointerdown 抢先处理。 */
  const onDocumentPointerDown = (event: Event) => {
    if (ctx.isOpen && !panel.contains(event.target as Node)) hide(ctx)
  }

  panel.addEventListener('click', onClick)
  documentNode.addEventListener('keydown', onKeyDown)
  documentNode.addEventListener('pointerdown', onDocumentPointerDown, true)

  return {
    show(candidates, anchor) {
      show(ctx, candidates, anchor)
    },
    hide() {
      hide(ctx)
    },
    get open() {
      return ctx.isOpen
    },
    destroy() {
      hide(ctx)
      panel.removeEventListener('click', onClick)
      documentNode.removeEventListener('keydown', onKeyDown)
      documentNode.removeEventListener('pointerdown', onDocumentPointerDown, true)
      // 宿主节点属于模板，不能删：只清内容并隐藏。
      panel.replaceChildren()
      panel.hidden = true
    },
  }
}
