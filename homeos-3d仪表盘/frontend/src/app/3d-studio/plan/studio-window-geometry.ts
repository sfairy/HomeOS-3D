export function windowGeometryParts(width, height, sillHeight, hasMullions = true) {
  if (![width, height, sillHeight].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const frameThickness = Math.min(0.045, width / 4, height / 4),
    centerY = sillHeight + height / 2,
    glassParts = [[width - frameThickness, height - frameThickness, 0.025, 0, centerY, 0]],
    frameParts = [
      [width, frameThickness, 0.06, 0, sillHeight + frameThickness / 2, 0],
      [width, frameThickness, 0.06, 0, sillHeight + height - frameThickness / 2, 0],
      [
        frameThickness,
        height - 2 * frameThickness,
        0.06,
        -(width - frameThickness) / 2,
        centerY,
        0,
      ],
      [frameThickness, height - 2 * frameThickness, 0.06, (width - frameThickness) / 2, centerY, 0],
    ],
    isDivided = hasMullions && width > 1.2;
  return (
    isDivided &&
      frameParts.push([frameThickness * 0.7, height - 2 * frameThickness, 0.055, 0, centerY, 0]),
    {
      glass: glassParts,
      frames: frameParts,
      divided: isDivided,
    }
  );
}
