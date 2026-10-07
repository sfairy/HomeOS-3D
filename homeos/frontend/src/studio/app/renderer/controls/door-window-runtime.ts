const defaultCorners = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]),
  cornerClampRanges = Object.freeze([
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
    [-1.5, 2.5],
  ]);
export function doorWindowPerspectiveCorners(cornerCoordinates: any) {
  return (
    Array.isArray(cornerCoordinates) && cornerCoordinates.length === 8
      ? cornerCoordinates
      : defaultCorners
  ).map((rawCoordinate, componentIndex) => {
    const numericCoordinate = Number(rawCoordinate),
      fallbackCoordinate = defaultCorners[componentIndex],
      [clampMin, clampMax] = cornerClampRanges[componentIndex];
    return Math.max(
      clampMin,
      Math.min(
        clampMax,
        Number.isFinite(numericCoordinate) ? numericCoordinate : fallbackCoordinate,
      ),
    );
  });
}
export function doorWindowPerspectiveMatrix(viewportWidth: any, viewportHeight: any, rawCorners: any) {
  const sourceWidth = Math.max(1, Number(viewportWidth) || 1),
    sourceHeight = Math.max(1, Number(viewportHeight) || 1),
    clampedCorners = doorWindowPerspectiveCorners(rawCorners),
    [
      topLeftX,
      topLeftY,
      topRightX,
      topRightY,
      bottomRightX,
      bottomRightY,
      bottomLeftX,
      bottomLeftY,
    ] = clampedCorners.map(
      (cornerComponent, cornerIndex) =>
        cornerComponent * (cornerIndex % 2 === 0 ? sourceWidth : sourceHeight),
    ),
    rightEdgeDeltaX = topRightX - bottomRightX,
    bottomEdgeDeltaX = bottomLeftX - bottomRightX,
    perspectiveNumeratorX = topLeftX - topRightX + bottomRightX - bottomLeftX,
    rightEdgeDeltaY = topRightY - bottomRightY,
    bottomEdgeDeltaY = bottomLeftY - bottomRightY,
    perspectiveNumeratorY = topLeftY - topRightY + bottomRightY - bottomLeftY,
    perspectiveDeterminant =
      rightEdgeDeltaX * bottomEdgeDeltaY - bottomEdgeDeltaX * rightEdgeDeltaY;
  if (Math.abs(perspectiveDeterminant) < 0.000001)
    return "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";
  const perspectiveXFactor =
      (perspectiveNumeratorX * bottomEdgeDeltaY - bottomEdgeDeltaX * perspectiveNumeratorY) /
      perspectiveDeterminant,
    perspectiveYFactor =
      (rightEdgeDeltaX * perspectiveNumeratorY - perspectiveNumeratorX * rightEdgeDeltaY) /
      perspectiveDeterminant,
    matrixScaleX = (topRightX - topLeftX + perspectiveXFactor * topRightX) / sourceWidth,
    matrixShearY = (bottomLeftX - topLeftX + perspectiveYFactor * bottomLeftX) / sourceHeight,
    matrixShearX = (topRightY - topLeftY + perspectiveXFactor * topRightY) / sourceWidth,
    matrixScaleY = (bottomLeftY - topLeftY + perspectiveYFactor * bottomLeftY) / sourceHeight,
    matrixPerspectiveX = perspectiveXFactor / sourceWidth,
    matrixPerspectiveY = perspectiveYFactor / sourceHeight;
  return (
    "matrix3d(" +
    [
      matrixScaleX,
      matrixShearX,
      0,
      matrixPerspectiveX,
      matrixShearY,
      matrixScaleY,
      0,
      matrixPerspectiveY,
      0,
      0,
      1,
      0,
      topLeftX,
      topLeftY,
      0,
      1,
    ]
      .map((matrixComponent) =>
        Math.abs(matrixComponent) < 1e-8 ? 0 : Number(matrixComponent.toFixed(8)),
      )
      .join(",") +
    ")"
  );
}
