/**
 * 3D 场景圆形按钮的两个基础度量：默认边长与图标占比。
 *
 * 之所以放在一起：改按钮默认大小（DEFAULT_BUTTON_SIZE）时，图标大小要按同一比例跟着
 * 走（buttonIconSize），否则就是「按钮变大、图标不变」。两个消费方必须同一口径：
 * - frontend/src/runtime/core/stage.ts 的 resolveMarkerIconSize（运行时渲染兜底）
 * - frontend/src/runtime/editor/config-editor.ts 的 syncLinkedIconSize / 归一化
 * 改这一个文件同时生效。
 */

/** 按钮未配置 size 时的默认边长（px）。 */
export const DEFAULT_BUTTON_SIZE = 60;

/**
 * 圆形按钮里 mdi 图标的相对大小（图标边长 / 按钮边长）。
 *
 * 按钮是一个 size×size 的圆，图标是 24×24 的 mdi 蒙版居中盖上去的。mdi 图形自己会在
 * 24×24 视框里留内边距（多数只画到 ~14/24，例如 wall-sconce-flat 占 0.71、
 * fridge-outline 占 0.58），所以图标边长要再放大一档才能看起来「撑满」：
 * - 沿用旧的「打开编辑器时按 size-18 写死一次」（44→26，约 0.59）会随按钮放大而失效，
 *   视觉上就是「按钮大、图标小」；
 * - 等大（1.0）又会逼近圆边，满幅图形（curtains 0.92、air-conditioner 高 1.06）直接
 *   顶到描边甚至溢出。
 * 取 0.6 时图形实际约占直径 35%–55%（不同图标有差异，但一致地把按钮内部撑起来），
 * 与旧默认观感接近，又不会顶边。默认 60 按钮 → 图标 36。
 *
 * 注意：扫地机状态卡、环境标签把 iconSize 当字号用，安防标签（门 / 摄像头 / 人体
 * 传感）由 security-editor 的「图标大小」控制，都与这个比例无关。
 */
export const BUTTON_ICON_SIZE_RATIO = 0.6;

export function buttonIconSize(buttonSize) {
  const numericSize = Number(buttonSize),
    resolvedSize =
      Number.isFinite(numericSize) && numericSize > 0 ? numericSize : DEFAULT_BUTTON_SIZE;
  return Math.max(1, Math.round(resolvedSize * BUTTON_ICON_SIZE_RATIO * 100) / 100);
}
