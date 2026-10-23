/**
 * 自动生成，勿手改。生成命令：
 *   bun ops/checks/studio/repair_glb_material_slots.mjs --emit-generated
 *
 * 作用：GLB 槽位改名后，`studio-external-models.ts` 里按 `material-<n>` / 原始名取色的
 * 分支仍然要看到**旧名**。加载器在拿 `materialName` 的第一时间过一遍这张表，
 * 旧分支逻辑与视觉结果都不变；表为空时函数退化为小写归一，行为完全等价。
 */

export const LEGACY_MATERIAL_ALIASES: Readonly<Record<string, string>> = Object.freeze({});

export const LEGACY_MATERIAL_ALIASES_BY_ITEM: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
{}
);
