/**
 * 3D 弹窗摆放（0.8.1）：
 * - 新增 `maxHeight`（画面高度的百分比，30–95）与 `fitContent`；
 * - 缩放不再只受宽度约束，还要压到「最大高度」以内，长内容在面板内部滚动；
 * - `custom` 显式标记优先，其次是 scale / maxHeight / x / y 任一被设置过。
 */
const clampOrDefault = <TFallback extends number | null>(
  value: unknown,
  fallback: TFallback,
  min: number,
  max: number,
): number | TFallback =>
  typeof value == "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

export interface PopupPlacementSettings {
  scale?: number;
  x?: number;
  y?: number;
  /** 面板最大高度占画面的百分比（30–95）。 */
  maxHeight?: number;
  custom?: boolean;
}

export interface PopupPlacementOptions {
  width: number;
  height: number;
  panelWidth: number;
  panelHeight: number;
  defaultScale?: number;
  defaultTop?: number;
  defaultRight?: number;
  settings?: PopupPlacementSettings | null;
  /** 按内容高度收口（而非按 180px 的最小占位估算）。 */
  fitContent?: boolean;
}

export interface PopupPlacement {
  scale: number;
  top: number;
  right: number;
  left: number;
  width: number;
  height: number;
  /** 面板内可用的最大高度（px），超过就在面板内部滚动。 */
  maxHeight: number;
  margin: number;
  custom: boolean;
}

export function popupCustomEnabled(settings: PopupPlacementSettings = {}): boolean {
  return typeof settings.custom == "boolean"
    ? settings.custom
    : clampOrDefault(settings.scale, 1, 0.5, 10) !== 1 ||
        Number.isFinite(settings.maxHeight) ||
        Number.isFinite(settings.x) ||
        Number.isFinite(settings.y);
}

export function popupPlacement({
  width: width,
  height: height,
  panelWidth: panelWidth,
  panelHeight: panelHeight,
  defaultScale: defaultScale = 1,
  defaultTop: defaultTop = 12,
  defaultRight: defaultRight = 16,
  settings: rawSettings = {},
  fitContent: fitContent = false,
}: PopupPlacementOptions): PopupPlacement {
  ((width = Math.max(1, width)),
    (height = Math.max(1, height)),
    (panelWidth = Math.max(1, panelWidth)),
    (panelHeight = Math.max(1, panelHeight)));
  const placementSettings: PopupPlacementSettings = rawSettings ?? {},
    custom = popupCustomEnabled(placementSettings),
    customScale = custom ? clampOrDefault(placementSettings.scale, 1, 0.5, 10) : 1,
    xPercent = custom ? clampOrDefault(placementSettings.x, null, 0, 100) : null,
    yPercent = custom ? clampOrDefault(placementSettings.y, null, 0, 100) : null,
    margin = Math.min(12, width / 4, height / 4),
    maxPanelHeight = Math.min(
      height - margin * 2,
      (height * (custom ? clampOrDefault(placementSettings.maxHeight, 75, 30, 95) : 75)) / 100,
    ),
    scale = Math.max(
      0.001,
      Math.min(
        defaultScale * (customScale ?? 1),
        (width - margin * 2) / panelWidth,
        maxPanelHeight / (fitContent ? panelHeight : 180),
      ),
    ),
    contentMaxHeight = maxPanelHeight / scale,
    scaledWidth = panelWidth * scale,
    scaledHeight = Math.min(panelHeight, contentMaxHeight) * scale,
    left =
      xPercent === null
        ? Math.max(margin, width - Math.max(margin, defaultRight) - scaledWidth)
        : margin + (Math.max(0, width - margin * 2 - scaledWidth) * xPercent) / 100,
    top =
      yPercent === null
        ? Math.max(margin, Math.min(height - margin - scaledHeight, defaultTop))
        : margin + (Math.max(0, height - margin * 2 - scaledHeight) * yPercent) / 100;
  return {
    scale: scale,
    top: top,
    right: width - left - scaledWidth,
    left: left,
    width: scaledWidth,
    height: scaledHeight,
    maxHeight: contentMaxHeight,
    margin: margin,
    custom: custom,
  };
}
