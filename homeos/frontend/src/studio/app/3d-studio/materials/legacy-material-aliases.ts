/**
 * 旧槽位名别名表：改名后的材质名 → 改名前的材质名。
 *
 * 为什么需要它：`studio-external-models.ts` 里有 30 处按 `material-<n>` 下标或 SimLab 原始名
 * （`M03_Pewter_Shine`、`[color_008]1`、`*5`）取色的历史分支。GLB 槽位按契约改名后，
 * 这些分支会**静默失效**——不报错，只是颜色变回默认值，很难在几百个模型里发现。
 *
 * 这里的做法是「一次迁移、单点归一」：改名与别名表由同一份契约生成
 * （`ops/checks/studio/repair_glb_material_slots.mjs --emit-generated`），
 * 加载器在拿到材质名的第一件事就是过一遍这张表，历史分支看到的一直是旧名，
 * 逻辑与视觉都不变；新代码则应当优先用 `resolveModelMaterialRole` 按角色判定。
 *
 * 别名表为空时（尚未改名）本模块退化为小写归一，行为与改动前完全等价。
 */
import {
  LEGACY_MATERIAL_ALIASES,
  LEGACY_MATERIAL_ALIASES_BY_ITEM,
} from "./legacy-material-aliases.generated";

/**
 * 取色分支用的规范化材质名。
 *
 * - 先按 `itemType` 精确匹配（同一个 GLB 被多个 itemType 复用时，不同 itemType 的
 *   `material-<n>` 含义可能不同，必须分开）；
 * - 再退回全局表（模型名前缀已经足够唯一）；
 * - 都没有就小写返回，和旧行为一致。
 */
export function canonicalExternalMaterialName(
  name: string | null | undefined,
  itemType?: string | null,
): string {
  const lower = (name || "").toLowerCase();
  if (!lower) return lower;
  const scoped = itemType ? LEGACY_MATERIAL_ALIASES_BY_ITEM[itemType]?.[lower] : undefined;
  return scoped ?? LEGACY_MATERIAL_ALIASES[lower] ?? lower;
}

/** 别名表规模，供门禁断言「改名后别名必须齐」。 */
export function legacyMaterialAliasCount(): number {
  return Object.keys(LEGACY_MATERIAL_ALIASES).length;
}

export { LEGACY_MATERIAL_ALIASES, LEGACY_MATERIAL_ALIASES_BY_ITEM };
