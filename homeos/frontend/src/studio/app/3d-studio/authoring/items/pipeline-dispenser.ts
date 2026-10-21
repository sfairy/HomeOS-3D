/**
 * 管线机（`pipelinewaterpurifier`）的**外观款式**：原款 / 矩形双出水。
 *
 * 两个款式是两支独立 GLB：原款 `pipelinewaterpurifier`、变体
 * `rectangular-pipeline-dispenser`。款式的包围盒不同（原款偏高、变体偏宽扁），
 * 切换时**按新旧包围盒逐轴等比缩放**物品的 `width/height/depth`，
 * 让摆在场上的物件不会因为换模型而突然变形或悬空。
 *
 * 存档只存 `pipelineDispenserStyle`（`"original"` / `"rectangular"`），
 * 读到非法值时一律回落 `original`，模型与尺寸由此推导。
 */
export type PipelineDispenserStyle = "original" | "rectangular";

/** 原款 `pipelinewaterpurifier` 的包围盒（[宽, 高, 深]）。 */
const ORIGINAL_PIPELINE_DISPENSER_SIZE: readonly [number, number, number] = Object.freeze([
  0.48, 0.68, 0.24,
]);

/**
 * 变体 `rectangular-pipeline-dispenser` 的包围盒 —— 与
 * `approved-item-models.ts` 里该变体的 `size` 同值。刻意写常量而不 import 注册表：
 * 本模块被加载器反向依赖（`studio-external-models` 要调 `pipelineDispenserModelType`），
 * 走 import 会形成「加载器 ↔ 注册表 ↔ 本模块」的初始化环。
 */
const RECTANGULAR_PIPELINE_DISPENSER_SIZE: readonly [number, number, number] = Object.freeze([
  0.6, 0.44, 0.233,
]);

const PIPELINE_DISPENSER_SIZES: Readonly<
  Record<PipelineDispenserStyle, readonly [number, number, number]>
> = Object.freeze({
  original: ORIGINAL_PIPELINE_DISPENSER_SIZE,
  rectangular: RECTANGULAR_PIPELINE_DISPENSER_SIZE,
});

/** 归一化款式；只有显式写了 `rectangular` 才算变体。 */
export function normalizePipelineDispenserStyle(style: unknown): PipelineDispenserStyle {
  return style === "rectangular" ? "rectangular" : "original";
}

/** 物品当前的款式（缺省 / 非法值 → `original`）。 */
export function pipelineDispenserStyle(item: any): PipelineDispenserStyle {
  return item?.pipelineDispenserStyle === "rectangular" ? "rectangular" : "original";
}

/** 该款式对应的模型类型键（`resolveModelTypeForItem` 用）。 */
export function pipelineDispenserModelType(item: any): string {
  return pipelineDispenserStyle(item) === "rectangular"
    ? "rectangular-pipeline-dispenser"
    : "pipelinewaterpurifier";
}

/**
 * 切换款式并把物品尺寸按包围盒比例改写。
 *
 * 比例取自**物品当前尺寸**而不是上一个款式的标准尺寸：用户手动拉过尺寸后，
 * 切换款式仍然保留「用户偏大 / 偏小」的比例，只把长宽高关系换成新款式的。
 */
export function setPipelineDispenserStyle(item: any, style: unknown): PipelineDispenserStyle {
  const nextStyle = normalizePipelineDispenserStyle(style);
  if (!item) return nextStyle;
  const previousStyle = pipelineDispenserStyle(item);
  if (nextStyle !== previousStyle) {
    const previousSize = PIPELINE_DISPENSER_SIZES[previousStyle],
      nextSize = PIPELINE_DISPENSER_SIZES[nextStyle],
      currentSize = [item.width, item.height, item.depth];
    if (currentSize.every((dimension: any) => Number.isFinite(dimension) && dimension > 0)) {
      [item.width, item.height, item.depth] = nextSize.map(
        (targetSize, axis) => (targetSize * currentSize[axis]) / previousSize[axis],
      );
    }
  }
  item.pipelineDispenserStyle = nextStyle;
  return nextStyle;
}
