export function floorOpeningPolygon(opening, scale) {
  const rotationRad = (opening.rotation * Math.PI) / 180,
    cosRotation = Math.cos(rotationRad),
    sinRotation = Math.sin(rotationRad),
    halfWidth = (opening.width * scale) / 2,
    halfDepth = (opening.depth * scale) / 2;
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([localX, localY]) => ({
    x: opening.x + localX * cosRotation - localY * sinRotation,
    y: opening.y + localX * sinRotation + localY * cosRotation,
  }));
}
