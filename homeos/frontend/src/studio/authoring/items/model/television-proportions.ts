/**
 * 电视面板 / 屏幕的比例换算（纯函数，无 three 依赖，便于契约测试）。
 *
 * 面板一律 **16:9 由宽度决定**：屏幕贴图（960×540 的宣传画、512×288 的运行时画布）都是
 * 16:9，面板一旦不是 16:9，画面就会被拉宽或压扁——「电视画面显示异常」大半来自这里。
 *
 * 原实现把两条约束写成了互相独立的两步：先 `min(width × 9/16, height × 0.98)` 求机身，
 * 再 `机身 × 0.94` 求屏幕。只要物件高偏矮、`height × 0.98` 这一支生效，屏幕就变成
 * 比 16:9 更宽的长条，贴图被横向拉伸。现在统一在等比轴上：先由宽度定屏幕，再按物件高度
 * 上限**等比**回收（`fitScale`），机身始终 = 屏幕高 / 0.94。
 *
 * 0.9.0 起多了第四种安装方式 **四脚落地支架**（`floor-stand`）：它有自己的机身/中心比例，
 * 并且**没有外部 GLB**（`tvExternalModelType` 返回空 → 走参数化几何）。
 */
/** 只读 `tvMountStyle` 一档：给结构类型而非宽类型，安装方式打错字时编译期就能发现。 */
interface TelevisionMountItem {
  tvMountStyle?: string
  height?: number
  depth?: number
  elevation?: number
}

/** 0.9.0 新增的安装方式：四脚落地支架。 */
export const TV_FLOOR_STAND = 'floor-stand'

/** 四种安装方式。 */
export type TvMountStyle = 'standard' | 'tabletop' | 'mobile' | 'floor-stand'

/** 一档安装方式的比例参数；`floorSize` 只有「落地件」才有。 */
type TvMountRatio = {
  bodyRatio: number
  centerRatio: number
  floorSize?: { height: number; depth: number }
}

/** 四种安装方式的比例参数（机身占高比 / 屏幕中心占高比 / 落地最小尺寸）。 */
export const TV_MOUNT_RATIOS: Readonly<Record<TvMountStyle, TvMountRatio>> = Object.freeze({
  standard: Object.freeze({ bodyRatio: 0.62, centerRatio: 0.62 }),
  tabletop: Object.freeze({ bodyRatio: 0.56, centerRatio: 0.67 }),
  mobile: Object.freeze({
    bodyRatio: 0.43,
    centerRatio: 0.76,
    floorSize: Object.freeze({ height: 1.55, depth: 0.55 }),
  }),
  [TV_FLOOR_STAND]: Object.freeze({
    bodyRatio: 0.6,
    centerRatio: 0.7,
    floorSize: Object.freeze({ height: 1.48, depth: 0.5 }),
  }),
})

/** 归一化安装方式：未知值一律按 `standard`（与「未知风格按默认渲染」的既有口径一致）。 */
export function normalizeTvMountStyle(mountStyle: unknown): TvMountStyle {
  return typeof mountStyle === 'string' && Object.hasOwn(TV_MOUNT_RATIOS, mountStyle)
    ? (mountStyle as TvMountStyle)
    : 'standard'
}

/**
 * 外部模型类型：`standard` → `tv_standard`、`mobile` → `tv_mobile`。
 * 四脚落地支架没有外部模型，返回空串让调用方走参数化几何。
 */
export function tvExternalModelType(mountStyle: unknown): string {
  const normalized = normalizeTvMountStyle(mountStyle)
  return normalized === TV_FLOOR_STAND ? '' : 'tv_' + normalized
}

/**
 * 切换安装方式（就地改物件，与上游一致）。
 *
 * 两条规则：
 * 1. 从「有落地尺寸」的档切走时，若当前高/深正好等于该档的最小值，改写成目标档的
 *    `floorSize`（或调用方给的兜底尺寸）—— 否则会残留一个「既不是落地件也不是桌面件」的高度；
 * 2. 切到「有落地尺寸」的档时，高/深**向上取到**该档最小值，且 `elevation` 归零
 *    （落地支架本身就站地上，浮空会穿地）。
 */
export function setTvMountStyle(
  televisionItem: TelevisionMountItem,
  nextMountStyle: unknown,
  fallbackSize: { height: number; depth: number } = { height: 1.2, depth: 0.3 },
): TvMountStyle {
  const previousStyle = normalizeTvMountStyle(televisionItem.tvMountStyle),
    normalizedNext = normalizeTvMountStyle(nextMountStyle)
  televisionItem.tvMountStyle = normalizedNext
  if (previousStyle === normalizedNext) return normalizedNext
  const previousFloorSize = TV_MOUNT_RATIOS[previousStyle].floorSize,
    nextFloorSize = TV_MOUNT_RATIOS[normalizedNext].floorSize
  if (
    previousFloorSize &&
    Math.abs((televisionItem.height ?? 0) - previousFloorSize.height) < 0.001 &&
    Math.abs((televisionItem.depth ?? 0) - previousFloorSize.depth) < 0.001
  ) {
    const targetSize = nextFloorSize ?? fallbackSize
    televisionItem.height = targetSize.height
    televisionItem.depth = targetSize.depth
  }
  if (nextFloorSize) {
    televisionItem.height = Math.max(televisionItem.height ?? 0, nextFloorSize.height)
    televisionItem.depth = Math.max(televisionItem.depth ?? 0, nextFloorSize.depth)
    televisionItem.elevation = 0
  }
  return normalizedNext
}

/** 屏幕与机身的几何描述（`tvScreenLayout`，0.9.0 上游同名字段）。 */
export type TvScreenLayout = {
  bodyHeight: number
  centerY: number
  panelDepth: number
  screenWidth: number
  screenHeight: number
  screenY: number
}

/**
 * 按安装方式算屏幕 / 机身几何。
 *
 * 四脚落地支架与其它三档的差别：屏幕占比更大（`0.94 / 0.9` 而不是 `0.965 / 0.94`）、
 * 面板更薄（`min(depth × 0.14, 0.06)`），因为落地支架没有壁挂背板。
 */
export function tvScreenLayout({
  tvMountStyle,
  width,
  height,
  depth,
}: {
  tvMountStyle?: string
  width: number
  height: number
  depth: number
}): TvScreenLayout {
  const mountStyle = normalizeTvMountStyle(tvMountStyle),
    ratios = TV_MOUNT_RATIOS[mountStyle],
    isFloorStand = mountStyle === TV_FLOOR_STAND,
    bodyHeight = height * ratios.bodyRatio,
    centerY = height * ratios.centerRatio
  return {
    bodyHeight,
    centerY,
    panelDepth: isFloorStand ? Math.min(depth * 0.14, 0.06) : Math.max(depth * 0.28, 0.05),
    screenWidth: width * (isFloorStand ? 0.94 : 0.965),
    screenHeight: bodyHeight * (isFloorStand ? 0.9 : 0.94),
    screenY: isFloorStand ? centerY + bodyHeight * 0.02 : centerY,
  }
}

/** 一条落地支腿：腿顶（贴机身）与脚（贴地）的平面坐标。 */
export type TvFloorStandLeg = { topX: number; topZ: number; footX: number; footZ: number }

/**
 * 四脚落地支架的四条腿（前后各两条，X 左右、Z 前后）。
 *
 * 腿越粗越像落地支架，但太粗会压过屏幕边框，所以半径取四者的最小值封顶 0.012 m。
 * 前脚比后脚略外撇（0.47 vs 0.42 倍宽），是落地支架的常见形态。
 */
export function tvFloorStandLegs(
  standWidth: number,
  standHeight: number,
  standDepth: number,
): { radius: number; legs: TvFloorStandLeg[] } {
  const radius = Math.min(0.012, standWidth * 0.009, standHeight * 0.055, standDepth * 0.2),
    legs = [-1, 1].flatMap((side) => [
      {
        topX: side * standWidth * 0.36,
        topZ: standDepth * 0.2,
        footX: side * standWidth * 0.47,
        footZ: standDepth * 0.44,
      },
      {
        topX: side * standWidth * 0.36,
        topZ: -standDepth * 0.2,
        footX: side * standWidth * 0.42,
        footZ: -standDepth * 0.44,
      },
    ])
  return { radius, legs }
}

export function computeTelevisionProportions(
  televisionItem: TelevisionMountItem | null | undefined,
  televisionWidth: number,
  televisionHeight: number,
) {
  const mountStyle = televisionItem?.tvMountStyle,
    floorStandMount = mountStyle === TV_FLOOR_STAND,
    mobileMount = mountStyle === 'mobile',
    tabletopMount = mountStyle === 'tabletop'
  // 落地支架直接走 `tvScreenLayout`：它按机身占高比算，不能再用「宽度定屏幕」那条轴
  // （否则 1.48m 高的支架会被屏幕撑成一张矮扁的板）。
  if (floorStandMount) {
    const layout = tvScreenLayout({
      tvMountStyle: mountStyle,
      width: televisionWidth,
      height: televisionHeight,
      depth: 0,
    })
    return {
      screenWidth: layout.screenWidth,
      screenHeight: layout.screenHeight,
      bodyHeight: layout.bodyHeight,
      centerY: layout.centerY,
    }
  }
  const screenAspect = 9 / 16,
    // 机身最多占物件高的 98%，屏幕再按 0.94 收进机身内 —— 两条约束都落在等比轴上。
    maxScreenHeight = televisionHeight * 0.98 * 0.94,
    fitScale = Math.min(1, maxScreenHeight / (televisionWidth * 0.965 * screenAspect)),
    screenWidth = televisionWidth * 0.965 * fitScale,
    screenHeight = screenWidth * screenAspect
  return {
    screenWidth,
    screenHeight,
    // 屏幕四周留 3% 边框：机身 = 屏幕高 / 0.94。
    bodyHeight: screenHeight / 0.94,
    centerY: televisionHeight * (mobileMount ? 0.76 : tabletopMount ? 0.67 : 0.62),
  }
}
