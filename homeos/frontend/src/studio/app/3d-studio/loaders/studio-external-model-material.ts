/** 模板材质名归一与材质签名值的纯函数（从 `studio-external-models` 拆出）。 */

import { legacyExternalMaterialName } from "../materials/legacy-material-aliases";

/**
 * 把模板里的材质名换回**旧名**（只在别名表命中时）。
 *
 * 背景：GLB 槽位按契约改名后，本文件下游 30 处历史分支仍按旧名/下标取色
 * （`material-<n>`、`M03_Pewter_Shine`、`B-1`、`cabinet-material-0`…），
 * 别名表 `legacy-material-aliases.generated.ts` 与改名同源生成。这里在模板入库前
 * 单点归一，所有读取点（取色分支 / 车辆收尾 / 检查面板）看到的都是旧名，
 * 行为与改名前一模一样；别名表为空时这是 no-op。
 *
 * 注意：这里**只**处理有别名（真正改过名）的材质，未改名模型连大小写都不动。
 */
type SlotMaterial = { name?: string };
type SlotNode = { material?: SlotMaterial | SlotMaterial[] | null };
type SlotScene = { traverse?: (visit: (node: SlotNode) => void) => void } | null;

export function normalizeTemplateSlotNames(templateScene: SlotScene, itemType: string): void {
  templateScene?.traverse?.((node) => {
    if (!node?.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      const legacy = legacyExternalMaterialName(material?.name, itemType);
      if (legacy && legacy !== material.name) material.name = legacy;
    }
  });
}

/** 普通字面量对象（调色板 / 覆盖表这类）：交给签名函数逐键展开。 */
export function isPlainRecord(recordValue: unknown): boolean {
  if (!recordValue || typeof recordValue != "object" || Array.isArray(recordValue)) return false;
  const recordPrototype = Object.getPrototypeOf(recordValue);
  return recordPrototype === Object.prototype || recordPrototype === null;
}
