/**
 * 「开放壳」模型名单：几何本身不闭合，**必须双面渲染**。
 *
 * 判据是实测边界边（`audit_glb_geometry.mjs` 的 `topology.boundaryEdges`），不是目测：
 * 闭合实体件的边界边应为 0；这两个开合件的 `boundaryEdges` 分别是 2936 / 数千条，
 * 149 个壳里有大量只有单面的门板 / 内饰片。
 *
 * 为什么单列成模块而不是各写一份：三个消费方必须给出同一个答案，否则会出现
 * 「契约说单面、审计不报、修复脚本把文件改成单面」这种自洽但视觉上错的闭环：
 * - `audit_glb_materials.mjs`：A4（OPAQUE 却被标双面）对它们豁免，只进附录留痕；
 * - `build-slot-contracts.mjs`：契约里 `target.doubleSided` 固定写 `true`（与文件一致，
 *   让后续任何回填都以「双面」为准，不会再把它们改回去）；
 * - `repair_glb_material_slots.mjs`：`--backfill-surface` 命中时主动恢复 `doubleSided=true`。
 *
 * 新增条目要在提交说明里附上 `boundaryEdges` 实测值。名单按 **itemType** 匹配。
 */
export const OPEN_SHELL_ITEM_TYPES = Object.freeze({
  'smallcar-openings': '可动件从 `小汽车.glb` 拆出，门板 / 内饰片是单面壳（boundaryEdges 2936），单面化会从背面看穿',
  'suv-openings': '同 `smallcar-openings`：`越野车` 车体本身就是开放壳（boundaryEdges 8604），可动件同理',
})
