const numberOrFallback = (candidate, fallback) => {
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

type DiagramPixelSize = { width?: unknown; height?: unknown };
export function floorplanAutoDiagramExportResolution(
  target: DiagramPixelSize = {},
  reference: DiagramPixelSize = {},
) {
  const referenceWidth = numberOrFallback(reference.width, 2778),
    referenceHeight = numberOrFallback(reference.height, 1940),
    targetWidth = numberOrFallback(target.width, referenceWidth),
    targetHeight = numberOrFallback(target.height, referenceHeight),
    areaRatio = Math.sqrt((referenceWidth * referenceHeight) / (targetWidth * targetHeight)),
    minScale = Math.max(320 / targetWidth, 320 / targetHeight),
    maxScale = Math.min(4096 / targetWidth, 4096 / targetHeight),
    scale = minScale <= maxScale ? Math.max(minScale, Math.min(maxScale, areaRatio)) : maxScale;
  return {
    width: Math.max(1, Math.round(targetWidth * scale)),
    height: Math.max(1, Math.round(targetHeight * scale)),
  };
}
