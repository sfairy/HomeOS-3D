function computeFloorPlacement(project, floorId, activeFloorId) {
  const floors = project.floors || [],
    floor = floors.find(
      (floorEntry) => floorEntry.id === (floorId === "all" ? activeFloorId : floorId),
    );
  if (!floor) return null;
  const scene = floor.scene,
    pixelsPerMeter = scene.calibration?.pixelsPerMeter || 1;
  if (floorId === "all" && floors.length > 1) {
    const rotationRad = (-(floor.rotation || 0) * Math.PI) / 180,
      cosRotation = Math.cos(rotationRad),
      sinRotation = Math.sin(rotationRad);
    return {
      ppm: pixelsPerMeter,
      c: cosRotation,
      s: sinRotation,
      x:
        (floor.offsetX || 0) -
        (cosRotation * (floor.originX || 0) + sinRotation * (floor.originY || 0)) / pixelsPerMeter,
      z:
        (floor.offsetZ || 0) -
        (-sinRotation * (floor.originX || 0) + cosRotation * (floor.originY || 0)) / pixelsPerMeter,
      y:
        [...floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation).indexOf(floor) *
        project.previewFloorGap,
    };
  }
  if (
    !scene.walls?.length &&
    scene.items?.some((sceneItem) =>
      ["courtyard-area", "courtyard-path", "courtyard-fence"].includes(sceneItem.type),
    )
  )
    return {
      ppm: pixelsPerMeter,
      c: 1,
      s: 0,
      x: -(floor.originX || 0) / pixelsPerMeter,
      z: -(floor.originY || 0) / pixelsPerMeter,
      y: 0,
    };
  let floorPlanPoints = scene.walls?.length
    ? scene.walls.flatMap((wall) => [wall.start, wall.end])
    : scene.items?.length
      ? scene.items
      : scene.background?.width && scene.background?.height
        ? [
            {
              x: 0,
              y: 0,
            },
            {
              x: scene.background.width,
              y: scene.background.height,
            },
          ]
        : [
            {
              x: 0,
              y: 0,
            },
            {
              x: 1200,
              y: 800,
            },
          ];
  if (
    ((floorPlanPoints = floorPlanPoints.filter(
      (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y),
    )),
    !floorPlanPoints.length)
  )
    return null;
  const minX = Math.min(...floorPlanPoints.map((minXPoint) => minXPoint.x)),
    minY = Math.min(...floorPlanPoints.map((minYPoint) => minYPoint.y)),
    maxX = Math.max(minX + 1, ...floorPlanPoints.map((maxXPoint) => maxXPoint.x)),
    maxY = Math.max(minY + 1, ...floorPlanPoints.map((maxYPoint) => maxYPoint.y));
  return {
    ppm: pixelsPerMeter,
    c: 1,
    s: 0,
    x: -(minX + maxX) / 2 / pixelsPerMeter,
    z: -(minY + maxY) / 2 / pixelsPerMeter,
    y: 0,
  };
}
export function transformSceneCamera(
  cameraState,
  sourceProject,
  targetProject,
  requestedFloorId,
  shouldSwap = false,
) {
  if (!cameraState) return cameraState;
  const sharedFloorId = sourceProject.floors?.find((sourceFloor) =>
    targetProject.floors?.some((targetFloor) => targetFloor.id === sourceFloor.id),
  )?.id;
  let sourcePlacement = computeFloorPlacement(sourceProject, requestedFloorId, sharedFloorId),
    targetPlacement = computeFloorPlacement(targetProject, requestedFloorId, sharedFloorId);
  if (!sourcePlacement || !targetPlacement) return structuredClone(cameraState);
  shouldSwap && ([sourcePlacement, targetPlacement] = [targetPlacement, sourcePlacement]);
  const scale = sourcePlacement.ppm / targetPlacement.ppm,
    cosDelta = targetPlacement.c * sourcePlacement.c + targetPlacement.s * sourcePlacement.s,
    sinDelta = targetPlacement.s * sourcePlacement.c - targetPlacement.c * sourcePlacement.s,
    rotatePoint = ([sourceX, sourceY, sourceZ]) => [
      cosDelta * sourceX + sinDelta * sourceZ,
      sourceY,
      -sinDelta * sourceX + cosDelta * sourceZ,
    ],
    transformPoint = ([pointX, pointY, pointZ]) => {
      const rotatedPoint = rotatePoint([
        pointX - sourcePlacement.x,
        pointY - sourcePlacement.y,
        pointZ - sourcePlacement.z,
      ]);
      return [
        rotatedPoint[0] * scale + targetPlacement.x,
        rotatedPoint[1] * scale + targetPlacement.y,
        rotatedPoint[2] * scale + targetPlacement.z,
      ];
    };
  return {
    ...structuredClone(cameraState),
    position: transformPoint(cameraState.position),
    target: transformPoint(cameraState.target),
    ...(cameraState.up
      ? {
          up: rotatePoint(cameraState.up),
        }
      : {}),
    ...(cameraState.frameSize
      ? {
          frameSize: cameraState.frameSize * scale,
        }
      : {}),
  };
}
