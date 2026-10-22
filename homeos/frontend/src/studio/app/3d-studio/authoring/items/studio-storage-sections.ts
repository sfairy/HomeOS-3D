/**
 * 柜体「柜门结构」变体：整门（`full`，默认）与上下两节（`two-section`，下小上大）。
 *
 * 只作用于衣柜 `wardrobe` 与储物柜 `cabinet`：这两族在 0.8.0 里补了 `-two-section`
 * 的 GLB（门板多一条横向分缝），外包围盒与整门版一致，因此切换只换模型、不改尺寸。
 * 旧户型没有 `cabinetSections` 字段，缺省按 `full` 处理，不需要迁移。
 */

/** 支持柜门结构切换的物件类型。 */
export const STORAGE_SECTION_TYPES: ReadonlySet<string> = new Set(["wardrobe", "cabinet"]);

/** 下拉可选值（顺序即界面顺序）。 */
export const STORAGE_SECTION_VALUES = Object.freeze(["full", "two-section"] as const);

export type StorageSectionStyle = (typeof STORAGE_SECTION_VALUES)[number];

/** 该条目当前的柜门结构；不支持的家族 / 非法值一律回落到 `full`。 */
export function storageSectionStyle(item: any): StorageSectionStyle {
  return STORAGE_SECTION_TYPES.has(item?.type) && item?.cabinetSections === "two-section"
    ? "two-section"
    : "full";
}

/**
 * 该条目应当加载的**模型类型**：两节版是 `${type}-two-section`，否则仍是 `item.type`。
 *
 * 注意兜底是 `item.type` 而不是 `item.modelId`：`modelId` 可能带着旧场景里的别名，
 * 直接拿来当模型键会找不到 GLB。
 */
export function storageSectionModelType(item: any): string {
  return storageSectionStyle(item) === "two-section" ? `${item.type}-two-section` : item.type;
}
