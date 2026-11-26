/**
 * S7c · panel 保持独立顶层包。
 *
 * 计划原本把 `panel/` 并入 `domains/panel/`，实测代价过大：`panel` 被 api 与多个
 * domains 引用，同时它自己又引用 studio3d 等域，移入 domains 后把原本 5 个独立
 * 强连通分量并成一个 14 包的巨环，等于摧毁 B4「新增环即失败」的约束价值。
 *
 * 结论：`panel/` 与 `modules/` 同级，作为独立的「文档与 schema」模块存在。
 */
const B = 'homeos/backend/src'

export default {
  dirMoves: [{ from: `${B}/domains/panel`, to: `${B}/panel` }],
}
