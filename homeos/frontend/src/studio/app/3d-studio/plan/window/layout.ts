/**
 * 自定义窗型的版式引擎（0.8.4）：一棵二叉分格树 + 一组几何约束。
 *
 * 为什么不用「窗格列表」：窗格之间有对齐关系（合并一段分隔线要保证左右两侧
 * 宽度一致），只有树结构能表达「这条分隔线属于哪个区域」。所有编辑操作
 * （切分 / 拖动分隔线 / 局部合并 / 改整窗尺寸）都落到树上的一个节点，
 * 再由 {@link flatten} 摊平成带绝对坐标的窗格列表。
 *
 * 单位：整窗宽高、坐标都是米；`ratio` 是无量纲比例 (0, 1)；`angle` 是度。
 * 约束与后端 `domains/studio3d/windows.py` 一一对应，两边都校验，谁先拒绝都不算错。
 */

import { randomUuid } from '@app/shared/util/random-id'

/** 支持的窗扇类型；`fixed` 是固定扇。 */
export const WINDOW_KINDS = Object.freeze(['fixed', 'casement', 'top-hung', 'bottom-hung', 'sliding'] as const)

/** 单个窗格的最小短边（米）。再小五金件装不下，铰链开启也会互相打架。 */
export const MIN_CELL = 0.26

/** 分格树节点上限：24 个叶子窗扇对应 47 个节点。 */
const MAX_NODES = 47

/** 分格树深度上限（防递归爆栈）。 */
const MAX_DEPTH = 24

/** 整窗尺寸允许区间（米）。 */
const MIN_SIZE = 0.3
const MAX_SIZE = 20

/** 窗扇身份 / 备注的字数上限。 */
const MAX_IDENTITY = 80
const MAX_REMARKS = 96
const MAX_REMARK_TEXT = 60

/** 撤销栈深度。 */
const HISTORY_DEPTH = 80

export type WindowKind = (typeof WINDOW_KINDS)[number]
export type WindowAxis = 'x' | 'y'
export type WindowHinge = 'left' | 'right'
export type WindowSwing = 'in' | 'out'
export type WindowSlide = 'left' | 'right'
export type WindowMode = 'ordinary' | 'custom'

/** 叶子：一片可开启 / 固定的窗扇。 */
export interface WindowLeaf {
  id: string
  kind: WindowKind
  hinge: WindowHinge
  swing: WindowSwing
  /** 开启角度（度）：平开 ≤120，上下悬 ≤90。 */
  angle: number
  /** 推拉组扇数（2 或 3）；其它窗型恒为 2（占位，校验只要求合法值）。 */
  count: number
  slide: WindowSlide
  /** 扇身份：推拉组按面板排列，其它窗型是自身 id 的占位。 */
  panelIds: string[]
  /** 默认开度（%）：进入 3D 时的初始姿态。 */
  defaultOpening?: number
  /** 叶子永远没有子节点；显式声明让 `node.children` 在联合类型上可访问。 */
  children?: undefined
}

/** 分隔：沿一条轴把区域一分为二。 */
export interface WindowSplit {
  id: string
  axis: WindowAxis
  ratio: number
  children: WindowNode[]
  /** 分隔节点没有窗扇类型；显式声明让 `node.kind` 在联合类型上可访问。 */
  kind?: undefined
}

export type WindowNode = WindowSplit | WindowLeaf

/** 窗户自带的版式；`ordinary` 是「切回自定义」前的占位树。 */
export interface WindowDesign {
  version: 1
  mode: WindowMode
  interiorSide: 1 | -1
  layout: WindowNode
  wallDirection?: 1 | -1
  /** 窗扇备注（按窗扇 id），只服务配置时辨认，不影响渲染。 */
  sashRemarks?: Record<string, string>
}

/** 场景里的一扇窗户（墙体开洞）。只列出本模块用到的字段。 */
export interface WindowRecord {
  id: string
  width: number
  height: number
  sill?: number
  t?: number
  wallId?: string
  hasDivider?: boolean
  remark?: string
  windowDesign?: WindowDesign
  [key: string]: any
}

/** 摊平后的窗格：绝对坐标 + 祖先分隔线 id（由外到内）。 */
export interface WindowEntry {
  node: WindowNode
  x: number
  y: number
  width: number
  height: number
  ancestors: string[]
}

/** 一段可单独删除的分隔线。 */
export interface WindowSegment {
  start: number
  end: number
  coordinate: number
  vertical: boolean
  first: WindowEntry | null
  second: WindowEntry | null
  canMerge: boolean
  reason: string
}

/** 一次「删除窗扇」的可撤销快照。 */
export interface WindowDeletionChange {
  id: string
  before: WindowRecord
  after: WindowRecord
  remarks: Record<string, string>
}

const clone = <T>(value: T): T => structuredClone(value)

const id = () => 'sash-' + randomUuid()

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object'

/** 上下悬窗：铰链在横边，只能开 ≤90°。 */
export function isHung(kind: WindowKind): boolean {
  return kind === 'top-hung' || kind === 'bottom-hung'
}

/** 进入 3D 时的默认开度：固定扇恒为 0。 */
export function defaultWindowOpening(node: WindowNode): number {
  return node.kind === 'fixed' ? 0 : ((node as WindowLeaf).defaultOpening ?? 0)
}

/** 是否是「自定义窗型」的窗户（普通窗型没有细分窗扇）。 */
export function isCustomWindow(window: WindowRecord | null | undefined): boolean {
  return window?.windowDesign?.version === 1 && window.windowDesign.mode === 'custom'
}

/** 窗格的备注：优先用自身备注；推拉组只有唯一面板备注时也用上。 */
export function windowOpeningRemark(window: WindowRecord, node: WindowNode): string {
  const remarks = window.windowDesign?.sashRemarks || {}
  if (Object.hasOwn(remarks, node.id)) return remarks[node.id]
  const leaf = node as WindowLeaf
  const panelRemarks = [
    ...new Set(
      (leaf.kind === 'sliding' ? leaf.panelIds : []).map((panelId) => remarks[panelId]?.trim()).filter(Boolean),
    ),
  ]
  return panelRemarks.length === 1 ? panelRemarks[0] : ''
}

/** 新建一片窗扇。字段顺序与后端校验无关，但默认值必须全部合法。 */
export function leaf(kind: WindowKind = 'fixed'): WindowLeaf {
  return {
    id: id(),
    kind,
    hinge: 'left',
    swing: kind === 'top-hung' ? 'out' : 'in',
    angle: isHung(kind) ? 30 : 75,
    count: 2,
    slide: 'right',
    panelIds: [id(), id()],
  }
}

/** 切换窗型：上下悬统一 30°，其它窗型的角度夹到 120° 以内。 */
export function changeKind(node: WindowLeaf, kind: WindowKind): void {
  if (!WINDOW_KINDS.includes(kind)) throw Error('不支持的窗型。')
  if (node.kind !== kind && isHung(kind)) {
    node.angle = 30
    node.swing = kind === 'top-hung' ? 'out' : 'in'
  }
  if (node.kind !== kind && !isHung(kind)) node.angle = Math.min(node.angle, 120)
  node.kind = kind
}

/** 推拉组扇数：只允许两扇或三扇。 */
export function changePanelCount(node: WindowLeaf, count: number): void {
  if (![2, 3].includes(count)) throw Error('推拉组支持两扇或三扇。')
  node.panelIds = Array.from({ length: count }, (_, panelIndex) => node.panelIds[panelIndex] || id())
  node.count = count
}

/** 由普通窗户生成窗型草稿：已有设计就克隆，否则按「是否显示中间分割」造初始树。 */
export function createWindowDesign(window: WindowRecord, interiorSide: 1 | -1 = 1): WindowDesign {
  if (window.windowDesign) {
    validateWindowDesign(window.windowDesign, window.width, window.height)
    const design = clone(window.windowDesign)
    design.mode = 'custom'
    return design
  }
  const layout: WindowNode =
    window.hasDivider !== false && window.width > 1.2
      ? { id: id(), axis: 'x', ratio: 0.5, children: [leaf(), leaf()] }
      : leaf()
  return { version: 1, mode: 'custom', interiorSide, layout }
}

/**
 * 生成编辑用草稿：`ordinary` 窗型的历史分格可能比当前整窗尺寸更大，
 * 这里把草稿的宽高**放大**到刚好容纳旧分格，避免一打开编辑器就报「分格过小」。
 */
export function createWindowDraft(window: WindowRecord, interiorSide: 1 | -1 = 1): WindowRecord {
  const draft: WindowRecord = { ...clone(window), windowDesign: createWindowDesign(window, interiorSide) }
  if (window.windowDesign?.mode === 'ordinary') {
    let widthRatio = 0
    let heightRatio = 0
    for (const entry of flatten(draft.windowDesign!.layout, 1, 1).filter((item) => !item.node.children)) {
      widthRatio = Math.max(widthRatio, minimum(entry.node, 'x') / entry.width)
      heightRatio = Math.max(heightRatio, MIN_CELL / entry.height)
    }
    const roundUp = (ratio: number) => Math.min(MAX_SIZE, Math.ceil(ratio * 1000 - 0.000001) / 1000)
    draft.width = Math.max(draft.width, roundUp(widthRatio))
    draft.height = Math.max(draft.height, roundUp(heightRatio))
  }
  validateWindowRecord(draft)
  return draft
}

/** 把分格树摊平成带绝对坐标的窗格列表（深度优先，先左后右 / 先上后下）。 */
export function flatten(
  node: WindowNode,
  width: number,
  height: number,
  x = 0,
  y = 0,
  ancestors: string[] = [],
  output: WindowEntry[] = [],
): WindowEntry[] {
  const entry: WindowEntry = { node, x, y, width, height, ancestors }
  output.push(entry)
  if (node.children) {
    const split = node as WindowSplit
    const size = (split.axis === 'x' ? width : height) * split.ratio
    const childAncestors = [...ancestors, split.id]
    if (split.axis === 'x') {
      flatten(split.children[0], size, height, x, y, childAncestors, output)
      flatten(split.children[1], width - size, height, x + size, y, childAncestors, output)
    } else {
      flatten(split.children[0], width, size, x, y, childAncestors, output)
      flatten(split.children[1], width, height - size, x, y + size, childAncestors, output)
    }
  }
  return output
}

/** 窗户的窗格列表。 */
export const entries = (window: WindowRecord): WindowEntry[] =>
  flatten(window.windowDesign!.layout, window.width, window.height)

/** 按节点 id 找窗格。 */
export const find = (window: WindowRecord, nodeId: string): WindowEntry | undefined =>
  entries(window).find((entry) => entry.node.id === nodeId)

/**
 * 某个方向上「这个节点至少要占多宽 / 多高」。
 *
 * 分隔节点的需求由两侧比例反推：`max(左需求 / ratio, 右需求 / (1 - ratio))`；
 * 叶子节点是 `MIN_CELL`，推拉组在 x 方向还要按扇数翻倍。
 */
export function minimum(node: WindowNode, axis: WindowAxis): number {
  if (!node.children) {
    const leafNode = node as WindowLeaf
    return MIN_CELL * (leafNode.kind === 'sliding' && axis === 'x' ? leafNode.count : 1)
  }
  const split = node as WindowSplit
  const childMinimums = split.children.map((child) => minimum(child, axis))
  return split.axis === axis
    ? Math.max(childMinimums[0] / split.ratio, childMinimums[1] / (1 - split.ratio))
    : Math.max(...childMinimums)
}

/** 把窗格位置上的节点换成新节点（改树）；根节点直接换 layout。 */
function replaceNode(window: WindowRecord, entry: WindowEntry, node: WindowNode): void {
  if (!entry.ancestors.length) {
    window.windowDesign!.layout = node
    return
  }
  const parentEntry = find(window, entry.ancestors.at(-1)!)!
  const parent = parentEntry.node as WindowSplit
  parent.children[parent.children.indexOf(entry.node)] = node
}

/**
 * 切分一个窗格：`size` 是分隔线距区域左边 / 顶边的距离（米），
 * 会被夹到「两侧都装得下」的合法区间里。
 */
export function split(window: WindowRecord, nodeId: string, axis: WindowAxis, size: number): string | undefined {
  const entry = find(window, nodeId)
  if (!entry || entry.node.children || !['x', 'y'].includes(axis)) return
  const extent = axis === 'x' ? entry.width : entry.height
  const need = minimum(entry.node, axis)
  const available = extent - MIN_CELL
  if (available < need) throw Error('空间不足，请先扩大窗户或减少分格。')
  const node: WindowSplit = {
    id: id(),
    axis,
    ratio: Math.max(need, Math.min(available, size)) / extent,
    children: [clone(entry.node), leaf()],
  }
  replaceNode(window, entry, node)
  return node.id
}

/** 拖动分隔线：`size` 是距区域开始边的距离（米）。 */
export function moveSplit(window: WindowRecord, nodeId: string, size: number): void {
  const entry = find(window, nodeId)
  if (!entry?.node.children) return
  const split = entry.node as WindowSplit
  const extent = split.axis === 'x' ? entry.width : entry.height
  const leading = minimum(split.children[0], split.axis)
  const trailing = extent - minimum(split.children[1], split.axis)
  if (trailing < leading) throw Error('当前尺寸无法容纳这些分格。')
  split.ratio = Math.max(leading, Math.min(trailing, size)) / extent
}

/** 整块合并：把一个分隔节点直接换回单片窗扇。 */
export function merge(window: WindowRecord, nodeId: string): string | undefined {
  const entry = find(window, nodeId)
  if (!entry?.node.children) return
  const replacement = leaf()
  replaceNode(window, entry, replacement)
  return replacement.id
}

/**
 * 分隔线被切成若干可独立删除的线段：只有**两侧窗格都对齐**的那段才能合并。
 *
 * 不对齐时删除会留下非矩形窗格（3D 里直接是个洞），所以给出可操作的原因。
 */
export function windowSplitSegments(window: WindowRecord, nodeId: string): WindowSegment[] {
  const entry = find(window, nodeId)
  if (!entry?.node.children) return []
  const vertical = (entry.node as WindowSplit).axis === 'x'
  const crossAxis: WindowAxis = vertical ? 'y' : 'x'
  const alongAxis: WindowAxis = vertical ? 'x' : 'y'
  const crossSize = vertical ? 'height' : 'width'
  const alongSize = vertical ? 'width' : 'height'
  const coordinate = entry[alongAxis] + entry[alongSize] * (entry.node as WindowSplit).ratio
  const epsilon = 1e-7
  const near = (left: number, right: number) => Math.abs(left - right) < epsilon
  const neighbors = entries(window).filter(
    (candidate) =>
      !candidate.node.children &&
      (near(candidate[alongAxis], coordinate) || near(candidate[alongAxis] + candidate[alongSize], coordinate)) &&
      candidate[crossAxis] < entry[crossAxis] + entry[crossSize] - epsilon &&
      candidate[crossAxis] + candidate[crossSize] > entry[crossAxis] + epsilon,
  )
  const boundaries = [
    entry[crossAxis],
    entry[crossAxis] + entry[crossSize],
    ...neighbors.flatMap((neighbor) => [neighbor[crossAxis], neighbor[crossAxis] + neighbor[crossSize]]),
  ]
    .filter((value) => value >= entry[crossAxis] - epsilon && value <= entry[crossAxis] + entry[crossSize] + epsilon)
    .sort((left, right) => left - right)
    .filter((value, index, list) => !index || !near(value, list[index - 1]))
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]
    const middle = (start + end) / 2
    const crossing = neighbors.filter(
      (neighbor) => neighbor[crossAxis] < middle && neighbor[crossAxis] + neighbor[crossSize] > middle,
    )
    const first = crossing.find((neighbor) => near(neighbor[alongAxis] + neighbor[alongSize], coordinate)) || null
    const second = crossing.find((neighbor) => near(neighbor[alongAxis], coordinate)) || null
    const canMerge =
      !!first &&
      !!second &&
      [first, second].every(
        (neighbor) => near(neighbor[crossAxis], start) && near(neighbor[crossAxis] + neighbor[crossSize], end),
      )
    return {
      start,
      end,
      coordinate,
      vertical,
      first,
      second,
      canMerge,
      reason: canMerge
        ? '仅合并这段两侧的两个窗格，新窗格为固定玻璃；其他窗格不变，可撤销。'
        : '两侧分格未对齐，删除会形成非矩形窗格。请先对齐分隔或补一条分隔线。',
    }
  })
}

/** 按位置命中一段分隔线（默认取区域中点）。 */
export function windowSplitSegment(window: WindowRecord, nodeId: string, ratio = 0.5): WindowSegment | null {
  const entry = find(window, nodeId)
  if (!entry?.node.children) return null
  const vertical = (entry.node as WindowSplit).axis === 'x'
  const start = vertical ? entry.y : entry.x
  const size = vertical ? entry.height : entry.width
  const position = start + size * Math.max(0, Math.min(1, ratio))
  const segments = windowSplitSegments(window, nodeId)
  return (
    segments.find((segment) => position >= segment.start - 1e-7 && position < segment.end - 1e-7) ||
    segments.at(-1) ||
    null
  )
}

/**
 * 局部合并：把这段分隔线两侧的两个窗格合成一片固定扇，其余窗格**结构不变**。
 *
 * 直接「删掉一个窗格再把父节点换掉」会让兄弟窗格尺寸跳变，所以合并后要把剩下的
 * 窗格重新装回一棵与原结构同形的树（{@link rebuildNode}）。装不回去就拒绝。
 */
export function mergeWindowSegment(window: WindowRecord, nodeId: string, ratio = 0.5): string {
  const segment = windowSplitSegment(window, nodeId, ratio)
  if (!segment?.canMerge) throw Error(segment?.reason || '请先选择要删除的分隔线段。')
  const allEntries = entries(window)
  const mergedIds = new Set([segment.first!.node.id, segment.second!.node.id])
  const remaining = allEntries.filter((entry) => !entry.node.children && !mergedIds.has(entry.node.id))
  const replacement = leaf()
  remaining.push({
    node: replacement,
    x: Math.min(segment.first!.x, segment.second!.x),
    y: Math.min(segment.first!.y, segment.second!.y),
    width: segment.vertical ? segment.first!.width + segment.second!.width : segment.first!.width,
    height: segment.vertical ? segment.first!.height : segment.first!.height + segment.second!.height,
    ancestors: [],
  })
  const near = (left: number, right: number) => Math.abs(left - right) < 1e-7

  /** 用剩下的窗格重建一棵覆盖 (x, y, width, height) 的树。 */
  function rebuildNode(items: WindowEntry[], x: number, y: number, width: number, height: number): WindowNode | null {
    if (items.length === 1) return clone(items[0].node)
    // 原结构里正好有一个同尺寸、同叶子集合的分隔节点 → 直接复用它（保住分隔线 id）。
    const existing = allEntries.find(
      (candidate) =>
        near(candidate.x, x) &&
        near(candidate.y, y) &&
        near(candidate.width, width) &&
        near(candidate.height, height) &&
        flatten(candidate.node, candidate.width, candidate.height)
          .filter((child) => !child.node.children)
          .every((child) => items.some((item) => item.node.id === child.node.id)) &&
        flatten(candidate.node, candidate.width, candidate.height).filter((child) => !child.node.children).length ===
          items.length,
    )
    if (existing) return clone(existing.node)
    for (const axis of ['x', 'y'] as const) {
      const sizeKey = axis === 'x' ? 'width' : 'height'
      const origin = axis === 'x' ? x : y
      const extent = axis === 'x' ? width : height
      const cuts = [...new Set(items.map((item) => item[axis] + item[sizeKey]))]
        .filter((cut) => cut > origin + 1e-7 && cut < origin + extent - 1e-7)
        .sort((left, right) => left - right)
      for (const cut of cuts) {
        const leading = items.filter((item) => item[axis] + item[sizeKey] <= cut + 1e-7)
        const trailing = items.filter((item) => item[axis] >= cut - 1e-7)
        if (!leading.length || !trailing.length || leading.length + trailing.length !== items.length) continue
        const first = rebuildNode(leading, x, y, axis === 'x' ? cut - x : width, axis === 'y' ? cut - y : height)
        const second = rebuildNode(
          trailing,
          axis === 'x' ? cut : x,
          axis === 'y' ? cut : y,
          axis === 'x' ? x + width - cut : width,
          axis === 'y' ? y + height - cut : height,
        )
        if (first && second) {
          // 复用原分隔节点的 id（若尺寸与切点完全一致），否则新生成一个。
          const originalSplit = allEntries.find(
            (candidate) =>
              candidate.node.children &&
              (candidate.node as WindowSplit).axis === axis &&
              near(candidate.x, x) &&
              near(candidate.y, y) &&
              near(candidate.width, width) &&
              near(candidate.height, height) &&
              near(candidate[axis] + candidate[sizeKey] * (candidate.node as WindowSplit).ratio, cut),
          )
          return {
            id: originalSplit?.node.id || id(),
            axis,
            ratio: (cut - origin) / extent,
            children: [first, second],
          }
        }
      }
    }
    return null
  }

  const layout = rebuildNode(remaining, 0, 0, window.width, window.height)
  if (!layout) throw Error('这段合并后无法保留现有分格结构，请先补分隔线或调整布局。')
  const candidate: WindowRecord = { ...window, windowDesign: { ...window.windowDesign!, layout } }
  validateWindowRecord(candidate)
  window.windowDesign!.layout = layout
  return replacement.id
}

/** 改单个窗格的尺寸：挪动离它最近的那条同向分隔线。 */
export function resizeLeaf(window: WindowRecord, leafId: string, axis: WindowAxis, size: number): void {
  const splitEntry = [...find(window, leafId)!.ancestors]
    .reverse()
    .map((ancestorId) => find(window, ancestorId)!)
    .find((entry) => (entry.node as WindowSplit).axis === axis)
  if (!splitEntry) throw Error('这一方向没有分隔线，请修改整窗尺寸。')
  const isLeading = flatten((splitEntry.node as WindowSplit).children[0], 1, 1).some(
    (entry) => entry.node.id === leafId,
  )
  moveSplit(window, splitEntry.node.id, isLeading ? size : (axis === 'x' ? splitEntry.width : splitEntry.height) - size)
}

/** 写入边界校验（与后端同一套规则，编辑器内即时反馈）。 */
export function validateWindowDesign(design: WindowDesign | undefined, width: number, height: number): void {
  if (!design || design.version !== 1) throw Error('窗型版本不兼容，请使用支持此版本的编辑器。')
  if (!['ordinary', 'custom'].includes(design.mode) || ![1, -1].includes(design.interiorSide))
    throw Error('窗型参数无效。')
  if (design.wallDirection !== undefined && ![1, -1].includes(design.wallDirection)) throw Error('窗型朝向无效。')
  if (![width, height].every((value) => Number.isFinite(value) && value >= MIN_SIZE && value <= MAX_SIZE))
    throw Error('整窗宽、高需在 300–20000 mm 之间。')

  let count = 0
  const identifiers = new Set<string>()
  function unique(value: unknown): void {
    if (typeof value !== 'string' || !value || value.length > MAX_IDENTITY || identifiers.has(value))
      throw Error('窗扇身份无效或重复。')
    identifiers.add(value)
  }
  function visit(node: any, depth: number): boolean {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH || ++count > MAX_NODES)
      throw Error('窗型最多支持 24 个分格。')
    unique(node.id)
    if (node.children !== undefined) {
      if (
        !['x', 'y'].includes(node.axis) ||
        !Number.isFinite(node.ratio) ||
        node.ratio <= 0 ||
        node.ratio >= 1 ||
        !Array.isArray(node.children) ||
        node.children.length !== 2
      )
        throw Error('分隔参数无效。')
      node.children.forEach((child: any) => visit(child, depth + 1))
      return true
    }
    if (
      !WINDOW_KINDS.includes(node.kind) ||
      !['left', 'right'].includes(node.hinge) ||
      !['in', 'out'].includes(node.swing) ||
      !['left', 'right'].includes(node.slide) ||
      ![2, 3].includes(node.count) ||
      !Number.isFinite(node.angle) ||
      node.angle < 10 ||
      node.angle > (isHung(node.kind) ? 90 : 120) ||
      !Array.isArray(node.panelIds) ||
      node.panelIds.length !== node.count
    )
      throw Error('窗扇参数无效。')
    node.panelIds.forEach(unique)
    if (
      node.defaultOpening !== undefined &&
      (!Number.isFinite(node.defaultOpening) || node.defaultOpening < 0 || node.defaultOpening > 100)
    )
      throw Error('默认开度需在 0–100% 之间。')
    return false
  }
  visit(design.layout, 0)
  if (
    design.sashRemarks !== undefined &&
    (!design.sashRemarks ||
      Array.isArray(design.sashRemarks) ||
      typeof design.sashRemarks !== 'object' ||
      Object.keys(design.sashRemarks).length > MAX_REMARKS ||
      Object.entries(design.sashRemarks).some(
        ([key, value]) =>
          !key || key.length > MAX_IDENTITY || typeof value !== 'string' || value.length > MAX_REMARK_TEXT,
      ))
  )
    throw Error('窗扇备注最多 60 个字。')

  const dormant = design.mode === 'ordinary'
  for (const entry of flatten(design.layout, dormant ? MAX_SIZE : width, dormant ? MAX_SIZE : height).filter(
    (item) => !item.node.children,
  ))
    if (entry.width + 1e-8 < minimum(entry.node, 'x') || entry.height + 1e-8 < MIN_CELL)
      throw Error('分格过小，请先扩大窗户或减少分格。')
}

/** 校验一扇窗户（带 `windowDesign` 才校验）。 */
export function validateWindowRecord(window: WindowRecord): void {
  if (window.windowDesign !== undefined) validateWindowDesign(window.windowDesign, window.width, window.height)
}

/** 墙体方向翻转时，窗型的内外朝向要跟着翻。 */
export function remapWindowOrientation(window: WindowRecord, beforeWall: any, afterWall: any): WindowRecord {
  if (window.windowDesign?.version !== 1) return window
  const dot =
    (beforeWall.end.x - beforeWall.start.x) * (afterWall.end.x - afterWall.start.x) +
    (beforeWall.end.y - beforeWall.start.y) * (afterWall.end.y - afterWall.start.y)
  return dot >= 0
    ? window
    : {
        ...window,
        windowDesign: {
          ...clone(window.windowDesign),
          wallDirection: -((window.windowDesign.wallDirection ?? 1) as 1 | -1) as 1 | -1,
        },
      }
}

/** 可绑定的窗扇目标（开窗器 / 窗磁用）。 */
export function windowSashTargets(window: WindowRecord): { id: string; groupId: string; kind: WindowKind }[] {
  return isCustomWindow(window)
    ? entries(window)
        .filter((entry) => !entry.node.children && (entry.node as WindowLeaf).kind !== 'fixed')
        .flatMap(({ node }) =>
          (node as WindowLeaf).kind === 'sliding'
            ? [node.id, ...(node as WindowLeaf).panelIds].map((sashId) => ({
                id: sashId,
                groupId: node.id,
                kind: (node as WindowLeaf).kind,
              }))
            : [{ id: node.id, groupId: node.id, kind: (node as WindowLeaf).kind }],
        )
    : []
}

const windowSnapshot = (window: WindowRecord): WindowRecord => ({
  id: window.id,
  width: window.width,
  height: window.height,
  t: window.t,
  windowDesign: Object.fromEntries(
    Object.entries(window.windowDesign || {}).filter(([key]) => key !== 'sashRemarks'),
  ) as unknown as WindowDesign,
})

/**
 * 对比一次删除前后的窗户：删掉窗扇时顺带记下它们的备注，撤销时能一起还原。
 * 没有窗扇被删时返回 null。
 */
export function windowDeletionChange(
  beforeWindow: WindowRecord,
  afterWindow: WindowRecord,
): WindowDeletionChange | null {
  const remainingIds = new Set(windowSashTargets(afterWindow).map((target) => target.id))
  if (!windowSashTargets(beforeWindow).some((target) => !remainingIds.has(target.id))) return null
  const remarks = Object.fromEntries(
    windowSashTargets(beforeWindow)
      .filter((target) => !remainingIds.has(target.id))
      .filter((target) => Object.hasOwn(beforeWindow.windowDesign!.sashRemarks || {}, target.id))
      .map((target) => [target.id, beforeWindow.windowDesign!.sashRemarks![target.id]]),
  )
  return {
    id: beforeWindow.id,
    before: clone(windowSnapshot(beforeWindow)),
    after: clone(windowSnapshot(afterWindow)),
    remarks,
  }
}

/**
 * 撤销一次删除：把 `current` 里「仍是删除后状态」的字段改回删除前。
 *
 * 三方合并（current / before / after）：用户如果已经再次修改过这片结构，
 * 就拒绝撤销（提示先撤销那些改动），避免把两次编辑搅在一起。
 */
export function restoreWindowDeletion(current: WindowRecord, change: WindowDeletionChange): WindowRecord {
  const equal = (left: any, right: any) => JSON.stringify(left) === JSON.stringify(right)
  function merge(currentValue: any, beforeValue: any, afterValue: any): any {
    if (equal(beforeValue, afterValue) || equal(currentValue, beforeValue)) return currentValue
    if (equal(currentValue, afterValue)) return clone(beforeValue)
    if (
      currentValue &&
      beforeValue &&
      afterValue &&
      typeof currentValue === 'object' &&
      typeof beforeValue === 'object' &&
      typeof afterValue === 'object' &&
      Array.isArray(currentValue) === Array.isArray(beforeValue) &&
      Array.isArray(beforeValue) === Array.isArray(afterValue) &&
      (!Array.isArray(beforeValue) ||
        (beforeValue.length === afterValue.length && currentValue.length === beforeValue.length)) &&
      beforeValue.id === afterValue.id &&
      currentValue.id === afterValue.id
    ) {
      const merged = clone(currentValue)
      for (const key of new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])) {
        const value = merge(currentValue[key], beforeValue[key], afterValue[key])
        if (value === undefined) delete merged[key]
        else merged[key] = value
      }
      return merged
    }
    throw Error('相关窗扇结构已再次修改，请先撤销这些改动，再撤销删除。')
  }
  const restored = merge(current, change.before, change.after)
  if (Object.keys(change.remarks || {}).length)
    restored.windowDesign.sashRemarks = {
      ...change.remarks,
      ...restored.windowDesign.sashRemarks,
    }
  validateWindowRecord(restored)
  return restored
}

/** 窗型编辑器的撤销栈（按整份窗户快照存，深度 80）。 */
export class WindowHistory {
  past: WindowRecord[] = []
  future: WindowRecord[] = []
  value: WindowRecord

  constructor(window: WindowRecord) {
    this.value = clone(window)
  }

  /** 记录一个旧状态；与当前值相同则忽略（避免「改了又改回去」也占一格）。 */
  commit(previous: WindowRecord): void {
    if (JSON.stringify(previous) === JSON.stringify(this.value)) return
    this.past.push(clone(previous))
    if (this.past.length > HISTORY_DEPTH) this.past.shift()
    this.future = []
  }

  /** 应用一次修改：失败时回滚到修改前，并把错误抛给调用方显示。 */
  change(mutate: (window: WindowRecord) => void): void {
    const previous = clone(this.value)
    try {
      mutate(this.value)
      validateWindowRecord(this.value)
      this.commit(previous)
    } catch (error) {
      this.value = previous
      throw error
    }
  }

  undo(): void {
    if (!this.past.length) return
    this.future.push(clone(this.value))
    this.value = this.past.pop()!
  }

  redo(): void {
    if (!this.future.length) return
    this.past.push(clone(this.value))
    this.value = this.future.pop()!
  }
}

export { clone as cloneWindow, isRecord as isWindowRecord }
