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
 */
/** 只读 `tvMountStyle` 一档：给结构类型而非宽类型，安装方式打错字时编译期就能发现。 */
export interface TelevisionMountItem {
  tvMountStyle?: string;
}

export function computeTelevisionProportions(
  televisionItem: TelevisionMountItem | null | undefined,
  televisionWidth: number,
  televisionHeight: number,
) {
  const mountStyle = televisionItem?.tvMountStyle,
    mobileMount = mountStyle === "mobile",
    tabletopMount = mountStyle === "tabletop",
    screenAspect = 9 / 16,
    // 机身最多占物件高的 98%，屏幕再按 0.94 收进机身内 —— 两条约束都落在等比轴上。
    maxScreenHeight = televisionHeight * 0.98 * 0.94,
    fitScale = Math.min(
      1,
      maxScreenHeight / (televisionWidth * 0.965 * screenAspect),
    ),
    screenWidth = televisionWidth * 0.965 * fitScale,
    screenHeight = screenWidth * screenAspect;
  return {
    screenWidth,
    screenHeight,
    // 屏幕四周留 3% 边框：机身 = 屏幕高 / 0.94。
    bodyHeight: screenHeight / 0.94,
    centerY: televisionHeight * (mobileMount ? 0.76 : tabletopMount ? 0.67 : 0.62),
  };
}
