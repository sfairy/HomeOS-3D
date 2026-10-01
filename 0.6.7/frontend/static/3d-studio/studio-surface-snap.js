const snappableTypesSet = new Set([
    "decor-books",
    "decor-vase",
    "decor-tea-tray",
    "decor-tissue-box",
    "decor-small-plant",
    "router",
    "humidifier",
    "laptop",
    "desktop",
    "nas",
    "printer",
    "microwave",
    "ricecooker",
  ]),
  supportTypesSet = new Set([
    "table",
    "rounddiningtable",
    "rounddiningtableturntable",
    "coffeetable",
    "squarecoffeetable",
    "tea-table-set",
    "desk",
    "nightstand",
    "tvstand",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "kitchenbase",
    "bar",
    "vanity",
  ]);
export function snapItemToSurface({
  THREE: three,
  item: snapItem,
  items: sceneItems,
  pixelsPerMeter: pixelsPerMeter,
  mountModel: mountModel,
  enabled: isEnabled = true,
  movingIds: movingIds = [snapItem.id],
}) {
  if (
    !isEnabled ||
    movingIds.length !== 1 ||
    !snappableTypesSet.has(snapItem.type) ||
    !(pixelsPerMeter > 0) ||
    !(snapItem.width > 0 && snapItem.depth > 0)
  )
    return null;
  const rotationRad = ((snapItem.rotation || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad),
    sampleOffsets = [
      [0, 0],
      [-0.48, -0.48],
      [0.48, -0.48],
      [-0.48, 0.48],
      [0.48, 0.48],
      [-0.48, 0],
      [0.48, 0],
      [0, -0.48],
      [0, 0.48],
    ].map(
      ([offsetX, offsetY]) => (
        (offsetX *= snapItem.width),
        (offsetY *= snapItem.depth),
        [
          offsetX * rotationCos - offsetY * rotationSin,
          offsetX * rotationSin + offsetY * rotationCos,
        ]
      ),
    ),
    raycaster = new three.Raycaster(),
    normalMatrix = new three.Matrix3(),
    surfaceNormal = new three.Vector3(),
    rayDirection = new three.Vector3(0, -1, 0);
  let surfaceCandidate = null;
  for (const supportItem of sceneItems) {
    if (supportItem.id === snapItem.id || !supportTypesSet.has(supportItem.type)) continue;
    const deltaX = (supportItem.x - snapItem.x) / pixelsPerMeter,
      deltaY = (supportItem.y - snapItem.y) / pixelsPerMeter;
    if (Math.hypot(deltaX, deltaY) > Math.hypot(supportItem.width, supportItem.depth) / 2) continue;
    const supportGroup = new three.Group();
    if (!mountModel(supportGroup, supportItem)) continue;
    (supportGroup.position.set(deltaX, supportItem.elevation || 0, deltaY),
      (supportGroup.rotation.y = (-(supportItem.rotation || 0) * Math.PI) / 180),
      supportGroup.updateMatrixWorld(true));
    const supportMeshes = [];
    supportGroup.traverseVisible((childObject) => {
      childObject.isMesh && supportMeshes.push(childObject);
    });
    const supportBounds = new three.Box3().setFromObject(supportGroup),
      hitHeights = [];
    for (const [sampleX, sampleY] of sampleOffsets) {
      raycaster.set(new three.Vector3(sampleX, supportBounds.max.y + 0.1, sampleY), rayDirection);
      const intersection = raycaster.intersectObjects(supportMeshes, false)[0];
      if (
        !intersection?.face ||
        (surfaceNormal
          .copy(intersection.face.normal)
          .applyMatrix3(normalMatrix.getNormalMatrix(intersection.object.matrixWorld))
          .normalize(),
        surfaceNormal.y < 0.999 || intersection.point.y < 0.05 || intersection.point.y > 6)
      )
        break;
      hitHeights.push(intersection.point.y);
    }
    if (hitHeights.length !== sampleOffsets.length) continue;
    const surfaceElevation = Math.max(...hitHeights);
    surfaceElevation - Math.min(...hitHeights) > 0.005 ||
      ((!surfaceCandidate || surfaceElevation > surfaceCandidate.elevation) &&
        (surfaceCandidate = {
          elevation: surfaceElevation,
          supportId: supportItem.id,
        }));
  }
  return (surfaceCandidate && (snapItem.elevation = surfaceCandidate.elevation), surfaceCandidate);
}
