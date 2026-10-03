const positiveOr = (candidate, fallback) =>
  Number.isFinite(Number(candidate)) && Number(candidate) > 0 ? Number(candidate) : fallback;
export function interaction3dPreviewSize(element, board, boardWidth, boardHeight) {
  const isFill = element.properties?.layoutMode === "fill",
    sourceSize = isFill ? board?.canvas : element.position,
    width = positiveOr(sourceSize?.width, isFill ? 2778 : 100),
    height = positiveOr(sourceSize?.height, isFill ? 1940 : 100),
    scale = Math.min(positiveOr(boardWidth, 0) / width, positiveOr(boardHeight, 0) / height);
  return {
    width: width * scale,
    height: height * scale,
    aspectRatio: width / height,
  };
}
