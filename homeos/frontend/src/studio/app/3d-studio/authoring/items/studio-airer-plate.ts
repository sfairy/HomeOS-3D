/**
 * 单杆晾衣架开孔挂板的几何常量（0.8.1）。
 *
 * 挂孔是单杆机型的识别特征（晾衣杆穿过开孔板），漏掉就变成一块实心板；
 * 逐孔重排也会把板画歪（上游按 `width / 1.9` 整体缩放）。
 *
 * 这些值原本写在 `studio-airer.ts` 里，但那个模块 import 了 three 的 addon，
 * Node 测试环境只能解析到 shim，跑不起来。把纯数值部分单独拎出来，
 * 「21 个孔、左右对称、孔在板内」才可以被静态断言。
 */

/** 板长（米）。挤出后按 `width / plateWidth` 整体缩放。 */
export const AIRER_PLATE_WIDTH = 1.9;

/** 相邻两个孔的间距（米）。 */
export const AIRER_PLATE_HOLE_SPACING = 0.085;

/** 孔径半径（米）。 */
export const AIRER_PLATE_HOLE_RADIUS = 0.0075;

/** 孔数：-10 … 10 共 21 个，奇数保证正中一个孔且左右对称。 */
export const AIRER_PLATE_HOLE_COUNT = 21;

/** 21 个孔的 X 偏移，从 -0.85 到 0.85。 */
export function singleAirerPlateHoleOffsets(): number[] {
  const offsets: number[] = [];
  for (let holeIndex = -10; holeIndex <= 10; holeIndex++) offsets.push(holeIndex * AIRER_PLATE_HOLE_SPACING);
  return offsets;
}

/** 板体宽度方向缩放：保持孔与杆的相对位置，不逐孔重排。 */
export function airerPlateScale(airerWidth: number): number {
  return Number.isFinite(airerWidth) && airerWidth > 0 ? airerWidth / AIRER_PLATE_WIDTH : 1;
}
