/**
 * 自 studio-app.ts 外提（宿主：createStageController）——统一闭包保证对本模块外零依赖。
 */
import { state } from "./studio-state.js";
import { currentPreviewFloorMode } from "./studio-plan-render.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { modelBounds } from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";

/**
 * 平面像素点 → 世界坐标（米）。未旋转时平面 x→世界 x、平面 y→世界 z；平面 y 向下而
 */
export function floorPointToScenePoint(sourceFloorRef: any, pointToConvert: any) {
  const floorPointScale = sourceFloorRef?.scene?.calibration?.pixelsPerMeter || 1;
  const planX = (pointToConvert.x - finite(sourceFloorRef?.originX, 0)) / floorPointScale;
  const planY = (pointToConvert.y - finite(sourceFloorRef?.originY, 0)) / floorPointScale;
  const floorRotationRad = -threeModuleMin.MathUtils.degToRad(finite(sourceFloorRef?.rotation, 0));
  return {
    x:
      finite(sourceFloorRef?.offsetX, 0) +
      Math.cos(floorRotationRad) * planX +
      Math.sin(floorRotationRad) * planY,
    z:
      finite(sourceFloorRef?.offsetZ, 0) -
      Math.sin(floorRotationRad) * planX +
      Math.cos(floorRotationRad) * planY
  };
}

/**
 * 求当前场景「需要取景的范围」（平面包围盒，单位：平面像素）。优先只按墙体计算 —— 墙体才代表建筑轮廓；没有墙时退化为
 */
export function computeFloorBounds() {
  if (state.activeScene.walls.length) {
    return modelBounds({
      background: null,
      walls: state.activeScene.walls,
      items: []
    });
  } else if (state.activeScene.items.length) {
    return modelBounds({
      background: null,
      walls: [],
      items: state.activeScene.items
    });
  } else {
    return modelBounds(state.activeScene);
  }
}

/**
 * 把某楼层的平面坐标换算成场景世界坐标；叠层模式下按楼层顺序叠加高度间隔。楼层不存在时返回 null。
 * @param {number} worldElevationMeters 距楼面的高度（米，默认 0.1）。
 * @returns {object|null} Three.js Vector3。
 */
export function worldPointForFloor(worldFloorId: any, worldPlanX: any, worldPlanY: any, worldElevationMeters = 0.1) {
  const worldFloorRecord = state.studioDocument.floors.find(
    (worldFloorEntry: any) => worldFloorEntry.id === worldFloorId
  );
  if (!worldFloorRecord) {
    return null;
  }
  const worldFloorScale = worldFloorRecord.scene.calibration?.pixelsPerMeter || 1;
  if (currentPreviewFloorMode() === "all") {
    const floorsByElevation = [...state.studioDocument.floors].sort(
      (sortedLeftFloor, sortedRightFloor) =>
        sortedLeftFloor.elevation - sortedRightFloor.elevation
    );
    const worldFloorPoint = floorPointToScenePoint(worldFloorRecord, {
      x: worldPlanX,
      y: worldPlanY
    });
    return new threeModuleMin.Vector3(
      worldFloorPoint.x,
      floorsByElevation.indexOf(worldFloorRecord) * state.studioDocument.previewFloorGap +
        worldElevationMeters,
      worldFloorPoint.z
    );
  }
  const activeSceneBeforeFloorBounds = state.activeScene;
  state.activeScene = worldFloorRecord.scene;
  const worldFloorBounds = computeFloorBounds();
  state.activeScene = activeSceneBeforeFloorBounds;
  return new threeModuleMin.Vector3(
    (worldPlanX - (worldFloorBounds.minX + worldFloorBounds.maxX) / 2) / worldFloorScale,
    worldElevationMeters,
    (worldPlanY - (worldFloorBounds.minY + worldFloorBounds.maxY) / 2) / worldFloorScale
  );
}

/**
 * 构造某楼层的世界变换矩阵：用该楼层标定的像素 / 米建立基向量，并平移到楼层原点。
 * @returns {object|null} Three.js Matrix4；楼层不存在时返回 null。
 */
export function floorWorldMatrix(matrixFloorId: any) {
  if (!state.studioDocument.floors.some((matrixFloorEntry: any) => matrixFloorEntry.id === matrixFloorId)) {
    return null;
  }
  const matrixFloorScale =
    state.studioDocument.floors.find((scaleFloorEntry: any) => scaleFloorEntry.id === matrixFloorId)?.scene
      .calibration?.pixelsPerMeter || 1;
  const matrixFloorOrigin = worldPointForFloor(matrixFloorId, 0, 0, 0);
  return new threeModuleMin.Matrix4()
    .makeBasis(
      worldPointForFloor(matrixFloorId, matrixFloorScale, 0, 0).sub(matrixFloorOrigin),
      new threeModuleMin.Vector3(0, 1, 0),
      worldPointForFloor(matrixFloorId, 0, matrixFloorScale, 0).sub(matrixFloorOrigin)
    )
    .setPosition(matrixFloorOrigin);
}

/**
 * 计算总览视角的中心点：按需统计各楼层墙线包围盒与最高墙高，叠层模式下再抬高到层叠体量的中部。
 * @returns {object|null} Three.js Vector3；单层非总览模式或没有墙线时返回 null。
 */
export function computeOverviewCenter() {
  const isOverviewAllFloors = currentPreviewFloorMode() === "all";
  if (isOverviewAllFloors && state.studioDocument.floors.length < 2) {
    return null;
  }
  const overviewFloorList = isOverviewAllFloors
    ? state.studioDocument.floors
    : state.studioDocument.floors.filter((overviewFloorEntry: any) => overviewFloorEntry.id === state.activeFloorId);
  const overviewBoundsBox = new threeModuleMin.Box3();
  let overviewMaxWallHeight = 0;
  for (const overviewFloorRecord of overviewFloorList) {
    for (const overviewWall of overviewFloorRecord.scene.walls || []) {
      for (const overviewWallEndpoint of [overviewWall.start, overviewWall.end]) {
        if (
          !overviewWallEndpoint ||
          !Number.isFinite(overviewWallEndpoint.x) ||
          !Number.isFinite(overviewWallEndpoint.y)
        ) {
          continue;
        }
        const overviewScenePoint = isOverviewAllFloors
          ? floorPointToScenePoint(overviewFloorRecord, overviewWallEndpoint)
          : {
              x: overviewWallEndpoint.x,
              z: overviewWallEndpoint.y
            };
        overviewBoundsBox.expandByPoint(
          new threeModuleMin.Vector3(overviewScenePoint.x, 0, overviewScenePoint.z)
        );
      }
      overviewMaxWallHeight = Math.max(
        overviewMaxWallHeight,
        finite(overviewWall.height, overviewFloorRecord.scene.settings?.wallHeight || 2.8)
      );
    }
  }
  if (overviewBoundsBox.isEmpty()) {
    return null;
  }
  const overviewCenterPoint = overviewBoundsBox.getCenter(new threeModuleMin.Vector3());
  if (isOverviewAllFloors) {
    const overviewFloorElevations = overviewFloorList.map(
      (elevationFloorEntry: any) => elevationFloorEntry.elevation
    );
    const overviewStackHeight =
      state.studioDocument.uniformOverviewStack === true
        ? Math.max(...overviewFloorElevations) - Math.min(...overviewFloorElevations)
        : (state.studioDocument.floors.length - 1) * state.studioDocument.previewFloorGap;
    overviewCenterPoint.y = overviewStackHeight / 2 + overviewMaxWallHeight / 2;
    return overviewCenterPoint;
  }
  return worldPointForFloor(
    state.activeFloorId,
    overviewCenterPoint.x,
    overviewCenterPoint.z,
    overviewMaxWallHeight / 2
  );
}
