/**
 * 弹窗布局排版：把弹窗模块按网格排布并算出整体尺寸。
 *
 * 位置：编辑器弹窗设计器与展示页弹窗运行时共用。
 * 职责：给定模块列表与列数，求解每个模块的网格坐标（x / y / 宽 / 高），
 *   并换算成弹窗的像素宽高。
 * 约定：网格列数限制在 2~4 列、最多 3 行；climate 等大模块占 2 列；
 *   放不下时返回 fits: false，由调用方提示用户精简模块。
 */
const MIN_POPUP_COLUMNS = 2;
const MAX_POPUP_COLUMNS = 4;
const DEFAULT_POPUP_COLUMNS = 3;
const POPUP_COLUMN_WIDTH_PX = 420;
const POPUP_ROW_HEIGHT_PX = 470;
const POPUP_GRID_GAP_PX = 14;
const POPUP_CELL_PADDING_PX = 28;
const POPUP_HEADER_HEIGHT_PX = 88;

/**
 * 归一弹窗列数。
 *
 * @param {object|number} options 布局选项对象或直接给出的列数。
 * @returns {number} 2~4 之间的列数；非法值回退为默认 3 列。
 */
export function popupLayoutColumns(options) {
  const columns = Number(options?.columns);
  // 越界一律回退默认列数。
  if (columns >= MIN_POPUP_COLUMNS && columns <= MAX_POPUP_COLUMNS) {
    return columns;
  } else {
    return DEFAULT_POPUP_COLUMNS;
  }
}

/**
 * 计算模块占用的列数。
 *
 * @param {string|object} moduleSpec 模块类型字符串或模块对象。
 * @returns {number} 占用列数（1 或 2）。
 */
export function popupModuleColumnSpan(moduleSpec) {
  const type = typeof moduleSpec == "string" ? moduleSpec : moduleSpec?.type;
  const deviceType =
    typeof moduleSpec == "object"
      ? moduleSpec?.deviceType || moduleSpec?.properties?.deviceType
      : "";
  // 电动床与空调类模块内容较宽，固定占 2 列。
  if (
    type === "electric-bed" ||
    deviceType === "electric-bed" ||
    ["climate", "air-purifier", "water-heater", "media-player", "camera", "line-chart"].includes(
      type
    )
  ) {
    return 2;
  } else {
    return 1;
  }
}

/**
 * 计算模块占用的行数。
 *
 * 目前所有模块都只占 1 行，保留该函数是为了以后支持高模块时不必改调用方。
 *
 * @param {string|object} rowModuleSpec 模块类型字符串或模块对象。
 * @returns {number} 固定为 1。
 */
export function popupModuleRowSpan(rowModuleSpec) {
  return 1;
}

/**
 * 按先后顺序为模块寻找空位（首次适配）。
 *
 * @param {Array<object>} modules 模块列表。
 * @param {number} columnLimit 可用列数。
 * @returns {Array<object>|null} 每个模块的 {x, y, width, height}；放不下返回 null。
 */
function placeModules(modules, columnLimit) {
  const placements = [];
  // occupied[row][column] 标记已占用的格子，二维数组按需增长。
  const occupied = [];
  for (const module of modules || []) {
    const columnSpan = popupModuleColumnSpan(module);
    const rowSpan = popupModuleRowSpan(module);
    // 单模块比整行还宽，无法排版。
    if (columnSpan > columnLimit) {
      return null;
    }
    let placement = null;
    // 行数上限取「模块数 * 2 + 1」，保证最坏情况下也有尝试空间。
    const maxRows = Math.max(4, (modules?.length || 0) * 2 + 1);
    for (let row = 0; row < maxRows && !placement; row += 1) {
      for (let column = 0; column <= columnLimit - columnSpan; column += 1) {
        // 检查 rowSpan × columnSpan 的矩形区域是否全部为空。
        if (
          Array.from(
            {
              length: rowSpan
            },
            (unusedRowIndex, rowOffset) =>
              Array.from(
                {
                  length: columnSpan
                },
                (unusedColumnIndex, columnOffset) =>
                  !occupied[row + rowOffset]?.[column + columnOffset]
              ).every(Boolean)
          ).every(Boolean)
        ) {
          placement = {
            x: column,
            y: row,
            width: columnSpan,
            height: rowSpan
          };
          for (let rowIndex = 0; rowIndex < rowSpan; rowIndex += 1) {
            occupied[row + rowIndex] ||= [];
            for (let columnIndex = 0; columnIndex < columnSpan; columnIndex += 1) {
              occupied[row + rowIndex][column + columnIndex] = true;
            }
          }
          break;
        }
      }
    }
    if (!placement) {
      return null;
    }
    placements.push(placement);
  }
  return placements;
}

/**
 * 打包弹窗模块布局。
 *
 * @param {Array<object>} moduleList 模块列表。
 * @param {number|object} columnTotal 期望列数或布局选项。
 * @returns {{rows: number, columns: number, placements: Array<object>, fits: boolean}}
 *   布局结果；fits 为 false 表示超过 3 行上限，UI 需要给出提示。
 */
export function packPopupModules(moduleList, columnTotal) {
  const columnCount = popupLayoutColumns(columnTotal);
  // placeModules 返回 null 说明某个模块放不下，此时按空布局兜底。
  const packedPlacements = placeModules(moduleList, columnCount) || [];
  const rowCount = Math.max(
    1,
    packedPlacements.reduce(
      (maxRow, packedPlacement) => Math.max(maxRow, packedPlacement.y + packedPlacement.height),
      0
    )
  );
  return {
    // rows 对外截到 3，让 UI 按最大行高绘制；是否溢出由 fits 表达。
    rows: Math.min(rowCount, 3),
    columns: columnCount,
    placements: packedPlacements,
    fits: rowCount <= 3
  };
}

/**
 * 计算弹窗布局的像素尺寸。
 *
 * 尺寸全部取自文件顶部的 POPUP_* 常量（内边距、列宽、间距、行高、标题栏高度），
 * 改常量即改此处，不要在函数里写回数值字面量。
 *
 * @param {Array<object>} moduleSpecs 模块列表。
 * @param {number|object} layoutOptions 列数或布局选项。
 * @returns {object} 布局结果外加 gridWidth / gridHeight / popupWidth / popupHeight。
 */
export function popupLayoutMetrics(moduleSpecs, layoutOptions) {
  const layout = packPopupModules(moduleSpecs, layoutOptions);
  // 左右各一份内边距（合计两份）；列 / 行间距都是 (数量 - 1) 份间距。
  const gridWidth =
    POPUP_CELL_PADDING_PX * 2 +
    layout.columns * POPUP_COLUMN_WIDTH_PX +
    (layout.columns - 1) * POPUP_GRID_GAP_PX;
  const gridHeight =
    POPUP_CELL_PADDING_PX * 2 +
    layout.rows * POPUP_ROW_HEIGHT_PX +
    (layout.rows - 1) * POPUP_GRID_GAP_PX;
  return {
    ...layout,
    gridWidth: gridWidth,
    gridHeight: gridHeight,
    popupWidth: gridWidth,
    // 弹窗总高要加上标题栏。
    popupHeight: POPUP_HEADER_HEIGHT_PX + gridHeight
  };
}
