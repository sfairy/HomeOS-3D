/**
 * 视口内标签的屏幕空间排版（0.8.7 `studio-editor-labels.js` 的对应实现）。
 *
 * 选中物件后，画面上要显示「名称 + 尺寸 / 离地高度」。这些标签有三个硬约束：
 * 1. **不能互相压住**：多选时物件挨得近，标签直接叠成一团就读不出来；
 * 2. **不能被视口边缘裁掉**：贴边的物件标签要往里推；
 * 3. **不能压住手柄**：高度箭头、中心十字、灯带工具条都是可点的，标签盖上去就点不到。
 *
 * 与早期实现（贪心下推）的区别：这里给每个标签生成一组候选位置（首选位、上一帧位、
 * 8 向环、障碍物四向、视口 9 个锚点），按「碰撞面积 × 1e6 + 偏移距离平方」评分取最优。
 * 贪心下推只有「往下挪」一个方向，遇到右边是工具条时会把标签挤到视口外。
 */

export interface EditorLabelAnchor {
  id: string
  /** 锚点的屏幕坐标（CSS 像素，相对画布左上角）。 */
  anchor: { x: number; y: number }
  /** 标签自身尺寸（CSS 像素）；由调用方测量后传入。 */
  width: number
  height: number
  /** 首选中心；缺省用 `anchor`。 */
  preferred?: { x: number; y: number }
}

export interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface EditorLabelPlacement {
  id: string
  /** 标签中心（CSS 像素）。 */
  x: number
  y: number
  rect: Rect
  score: number
}

export interface EditorLabelLayoutOptions {
  width: number
  height: number
  obstacles?: Rect[]
  /** 上一帧每个标签相对锚点的偏移，用于抑制抖动。 */
  previous?: Map<string, { x: number; y: number }>
  /** 与视口边缘保留的间隙。 */
  padding?: number
  /**
   * 只接受「完全不碰撞」的位置。
   *
   * 3D 物件标签可以退让成「稍微压住」——它旁边没有第二个位置可选时，压住也比消失好；
   * 毫米标尺不行：压在物件或手柄上的读数会挡操作，上游的做法是直接藏起来。
   */
  requireClear?: boolean
}

const RING_OFFSETS = [0, 16, 32]
const GAP = 7

function overlapArea(first: Rect, second: Rect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
  return width * height
}

/** 标签尺寸 / 锚点是否可用：相机背后、超出视口太多的直接不参与排版。 */
function isLayoutCandidate(label: EditorLabelAnchor, width: number, height: number, padding: number): boolean {
  const anchor = label.anchor
  if (!(label.width > 0 && label.height > 0)) return false
  if (!(Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y))) return false
  if (label.width > width - padding * 2 || label.height > height - padding * 2) return false
  return anchor.x > -64 && anchor.y > -64 && anchor.x < width + 64 && anchor.y < height + 64
}

/** 候选位置：首选 → 上一帧 → 环形 8 向（3 圈）→ 障碍物四向 → 视口 9 锚点。 */
function buildCandidates(
  label: EditorLabelAnchor,
  preferred: { x: number; y: number },
  lastOffset: { x: number; y: number } | undefined,
  obstacles: Rect[],
  width: number,
  height: number,
  padding: number,
): Array<{ x: number; y: number }> {
  const anchor = label.anchor
  const candidates: Array<{ x: number; y: number }> = [preferred]
  if (lastOffset) candidates.push({ x: anchor.x + lastOffset.x, y: anchor.y + lastOffset.y })
  const gap = GAP
  for (const ringOffset of RING_OFFSETS) {
    const ringX = label.width / 2 + gap + ringOffset
    const ringY = label.height / 2 + gap + ringOffset
    candidates.push(
      { x: anchor.x + ringX, y: anchor.y },
      { x: anchor.x - ringX, y: anchor.y },
      { x: anchor.x, y: anchor.y - ringY },
      { x: anchor.x, y: anchor.y + ringY },
      { x: anchor.x + ringX, y: anchor.y - ringY },
      { x: anchor.x - ringX, y: anchor.y - ringY },
      { x: anchor.x + ringX, y: anchor.y + ringY },
      { x: anchor.x - ringX, y: anchor.y + ringY },
    )
  }
  // 障碍物四向：贴在工具条 / 手柄旁边时比环形候选更自然。
  for (const obstacle of obstacles) {
    candidates.push(
      { x: anchor.x, y: obstacle.top - label.height / 2 - gap },
      { x: anchor.x, y: obstacle.bottom + label.height / 2 + gap },
      { x: obstacle.left - label.width / 2 - gap, y: anchor.y },
      { x: obstacle.right + label.width / 2 + gap, y: anchor.y },
    )
  }
  // 视口 9 个锚点：极端情况下至少能把标签放进画面。
  for (const columnX of [padding + label.width / 2, width / 2, width - padding - label.width / 2]) {
    for (const rowY of [padding + label.height / 2, height / 2, height - padding - label.height / 2]) {
      candidates.push({ x: columnX, y: rowY })
    }
  }
  return candidates
}

/** 把候选位置夹进视口，并给出外扩 2px 的碰撞矩形。 */
function clampCandidate(
  candidate: { x: number; y: number },
  label: EditorLabelAnchor,
  width: number,
  height: number,
  padding: number,
): { x: number; y: number; rect: Rect } {
  const x = Math.max(padding + label.width / 2, Math.min(width - padding - label.width / 2, candidate.x))
  const y = Math.max(padding + label.height / 2, Math.min(height - padding - label.height / 2, candidate.y))
  // 碰撞判定用外扩 2px 的矩形：刚好贴边在视觉上也算「压住」。
  return {
    x,
    y,
    rect: {
      left: x - label.width / 2 - 2,
      right: x + label.width / 2 + 2,
      top: y - label.height / 2 - 2,
      bottom: y + label.height / 2 + 2,
    },
  }
}

/** 候选评分：碰撞面积占绝对权重，其余看「离首选多远」「离上一帧多远」。 */
function scoreCandidate(
  candidate: { x: number; y: number; rect: Rect },
  anchor: { x: number; y: number },
  preferred: { x: number; y: number },
  lastOffset: { x: number; y: number } | undefined,
  occupied: Rect[],
): number {
  const collision = occupied.reduce((sum, other) => sum + overlapArea(candidate.rect, other), 0)
  const preferDistance = (candidate.x - preferred.x) ** 2 + (candidate.y - preferred.y) ** 2
  const previousPenalty = lastOffset
    ? (candidate.x - anchor.x - lastOffset.x) ** 2 * 0.15 + (candidate.y - anchor.y - lastOffset.y) ** 2 * 0.15
    : 0
  return collision * 1e6 + preferDistance + previousPenalty
}

/**
 * 为每个标签选位置。
 *
 * 顺序按输入给（调用方已按「重要的在前」排好）；先放的标签占据空间，后面的避开它。
 */
export function layoutEditorLabels(
  labels: EditorLabelAnchor[],
  { width, height, obstacles = [], previous = new Map(), padding = 7, requireClear = false }: EditorLabelLayoutOptions,
): EditorLabelPlacement[] {
  // 视口小到连一个标签都放不下时直接放弃，避免所有候选都被夹成一团。
  if (!(width > padding * 2 && height > padding * 2)) return []
  const occupied: Rect[] = [...obstacles]
  const placements: EditorLabelPlacement[] = []
  for (const label of labels) {
    if (!isLayoutCandidate(label, width, height, padding)) continue
    const best = bestPlacementFor(label, { width, height, padding, previous, occupied })
    if (!best) continue
    // 标尺要求「完全不碰撞」：候选全被挡就整条藏起来（由调用方决定隐藏）。
    if (requireClear && occupied.some((other) => overlapArea(best.rect, other) > 0)) continue
    placements.push(best)
    occupied.push(best.rect)
  }
  return placements
}

/** 单个标签的最优位置：在所有候选里取评分最低的一个。 */
function bestPlacementFor(
  label: EditorLabelAnchor,
  context: {
    width: number
    height: number
    padding: number
    previous: Map<string, { x: number; y: number }>
    occupied: Rect[]
  },
): EditorLabelPlacement | null {
  const preferred = label.preferred ?? label.anchor
  const lastOffset = context.previous.get(label.id)
  const candidates = buildCandidates(
    label,
    preferred,
    lastOffset,
    context.occupied,
    context.width,
    context.height,
    context.padding,
  )
  let best: EditorLabelPlacement | null = null
  for (const candidate of candidates) {
    const clamped = clampCandidate(candidate, label, context.width, context.height, context.padding)
    const score = scoreCandidate(clamped, label.anchor, preferred, lastOffset, context.occupied)
    if (!best || score < best.score) best = { id: label.id, x: clamped.x, y: clamped.y, rect: clamped.rect, score }
  }
  return best
}
