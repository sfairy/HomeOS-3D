/** 像素/米是所有偏移换算的除数：0 / NaN 会把相机位置算成 Infinity，只能看到画面全空。 */
function resolvePixelsPerMeter(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 居中包围盒的采样点（墙体端点是平面坐标，家具项自带 x/y）。 */
type PlanPoint = { x?: number; y?: number };

/** computeFloorPlacement 需要读到的场景字段（旧草稿可能整段缺失）。 */
type PlanScene = {
  walls?: Array<{ start?: PlanPoint; end?: PlanPoint }>;
  items?: Array<PlanPoint & { type?: string }>;
  background?: { width?: number; height?: number };
};

/** 「只有庭院平面、没有墙体」的场景：用原点 + 像素/米直接定位，不做包围盒居中。 */
function isCourtyardOnlyScene(scene: PlanScene): boolean {
  const courtyardTypes = ["courtyard-area", "courtyard-path", "courtyard-fence"];
  return (
    !scene.walls?.length &&
    scene.items?.some((sceneItem) => courtyardTypes.includes(String(sceneItem.type))) === true
  );
}

/** 计算居中包围盒用的采样点：墙体端点 → 家具 → 背景矩形 → 缺省 1200×800。 */
function resolvePlanPoints(scene: PlanScene): PlanPoint[] {
  if (scene.walls?.length) {
    return scene.walls.flatMap((wall) => [wall.start ?? { x: 0, y: 0 }, wall.end ?? { x: 0, y: 0 }]);
  }
  if (scene.items?.length) return scene.items;
  if (scene.background?.width && scene.background?.height) {
    return [
      { x: 0, y: 0 },
      { x: scene.background.width, y: scene.background.height },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: 1200, y: 800 },
  ];
}

function computeFloorPlacement(project: any, floorId: any, activeFloorId: any) {
  const floors = project.floors || [],
    floor = floors.find(
      (floorEntry: any) => floorEntry.id === (floorId === "all" ? activeFloorId : floorId),
    );
  if (!floor) return null;
  // ``floor.scene`` 可能缺失（旧草稿 / 只建了一半楼层）：旧实现在这里直接取
  // ``scene.calibration``，``?.`` 只保护了 calibration 本身，scene 为 undefined 时
  // 抛 TypeError —— 一次相机迁移就把整个「全部楼层」视图打断。
  const scene = floor.scene ?? {},
    pixelsPerMeter = resolvePixelsPerMeter(scene.calibration?.pixelsPerMeter);
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
  if (isCourtyardOnlyScene(scene))
    return {
      ppm: pixelsPerMeter,
      c: 1,
      s: 0,
      x: -(floor.originX || 0) / pixelsPerMeter,
      z: -(floor.originY || 0) / pixelsPerMeter,
      y: 0,
    };
  let floorPlanPoints = resolvePlanPoints(scene);
  if (
    ((floorPlanPoints = floorPlanPoints.filter(
      (point: any) => Number.isFinite(point?.x) && Number.isFinite(point?.y),
    )),
    !floorPlanPoints.length)
  )
    return null;
  const minX = Math.min(...floorPlanPoints.map((minXPoint: any) => minXPoint.x)),
    minY = Math.min(...floorPlanPoints.map((minYPoint: any) => minYPoint.y)),
    maxX = Math.max(minX + 1, ...floorPlanPoints.map((maxXPoint: any) => maxXPoint.x)),
    maxY = Math.max(minY + 1, ...floorPlanPoints.map((maxYPoint: any) => maxYPoint.y));
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
  cameraState: any,
  sourceProject: any,
  targetProject: any,
  requestedFloorId: any,
  shouldSwap = false,
) {
  if (!cameraState) return cameraState;
  const sharedFloorId = sourceProject.floors?.find((sourceFloor: any) =>
    targetProject.floors?.some((targetFloor: any) => targetFloor.id === sourceFloor.id),
  )?.id;
  let sourcePlacement = computeFloorPlacement(sourceProject, requestedFloorId, sharedFloorId),
    targetPlacement = computeFloorPlacement(targetProject, requestedFloorId, sharedFloorId);
  if (!sourcePlacement || !targetPlacement) return structuredClone(cameraState);
  shouldSwap && ([sourcePlacement, targetPlacement] = [targetPlacement, sourcePlacement]);
  const scale = sourcePlacement.ppm / targetPlacement.ppm,
    cosDelta = targetPlacement.c * sourcePlacement.c + targetPlacement.s * sourcePlacement.s,
    sinDelta = targetPlacement.s * sourcePlacement.c - targetPlacement.c * sourcePlacement.s,
    rotatePoint = ([sourceX, sourceY, sourceZ]: any) => [
      cosDelta * sourceX + sinDelta * sourceZ,
      sourceY,
      -sinDelta * sourceX + cosDelta * sourceZ,
    ],
    transformPoint = ([pointX, pointY, pointZ]: any) => {
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
