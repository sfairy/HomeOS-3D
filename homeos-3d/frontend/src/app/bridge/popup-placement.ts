const clampOrDefault = (value, fallback, min, max) =>
  typeof value == "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
export function popupPlacement({
  width: width,
  height: height,
  panelWidth: panelWidth,
  panelHeight: panelHeight,
  defaultScale: defaultScale = 1,
  defaultTop: defaultTop = 12,
  defaultRight: defaultRight = 16,
  settings: settings = {},
}: {
  width: number;
  height: number;
  panelWidth: number;
  panelHeight: number;
  defaultScale?: number;
  defaultTop?: number;
  defaultRight?: number;
  settings?: { scale?: number; x?: number; y?: number } | null;
}) {
  ((width = Math.max(1, width)),
    (height = Math.max(1, height)),
    (panelWidth = Math.max(1, panelWidth)),
    (panelHeight = Math.max(1, panelHeight)));
  const customScale = clampOrDefault(settings?.scale, 1, 0.5, 10),
    xPercent = clampOrDefault(settings?.x, null, 0, 100),
    yPercent = clampOrDefault(settings?.y, null, 0, 100);  if (!(customScale !== 1 || xPercent !== null || yPercent !== null))
    return {
      scale: defaultScale,
      top: defaultTop,
      right: defaultRight,
      left: width - defaultRight - panelWidth * defaultScale,
      width: panelWidth * defaultScale,
      height: panelHeight * defaultScale,
      custom: false,
    };
  const margin = Math.min(12, width / 4, height / 4),
    scale = Math.max(0.001, defaultScale * customScale),
    scaledWidth = panelWidth * scale,
    scaledHeight = panelHeight * scale,
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
    custom: true,
  };
}
