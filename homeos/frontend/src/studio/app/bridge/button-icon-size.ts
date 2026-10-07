/** 3D 场景圆形按钮的两个基础度量：默认边长与图标占比。 */

/** 按钮未配置 size 时的默认边长（px）。 */
export const DEFAULT_BUTTON_SIZE = 60;

/** 圆形按钮里 mdi 图标的相对大小（图标边长 / 按钮边长）。 */
export const BUTTON_ICON_SIZE_RATIO = 0.6;

export function buttonIconSize(buttonSize: any) {
  const numericSize = Number(buttonSize),
    resolvedSize =
      Number.isFinite(numericSize) && numericSize > 0 ? numericSize : DEFAULT_BUTTON_SIZE;
  return Math.max(1, Math.round(resolvedSize * BUTTON_ICON_SIZE_RATIO * 100) / 100);
}
