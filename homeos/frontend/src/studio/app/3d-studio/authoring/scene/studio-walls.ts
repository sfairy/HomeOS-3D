/**
 * 墙体构件族：轮廓路径 → 带洞形状 → 侧 / 顶材质 → 分段墙带 → 顶面 → 接触阴影，
 * 最后 `buildInteriorScene` 把它们串成完整室内场景。
 *
 * 从 studio-app.ts 单体切出（P4）。外部状态经 `StudioWallsDeps` 显式传入（无闭包捕获）：
 * 场景状态 / 根节点 / 几何缓存句柄 / 主题视图设置 / 楼层与选中态等一律解引用为 `deps.*`，
 * 正文其余部分逐字保留。`addArchitectureMesh` / `addWindowFrames` 已是宿主上的薄转发器，
 * 这里按函数值注入，避免重复装配盒子网格缓存。
 */

import { SLIDING_DOOR_DISPLAY_OPEN_RATIO as SLIDING_DOOR_DISPLAY_OPEN_RATIO2, canonicalPolygonKey as canonicalPolygonKey2, clamp as clamp2, clampWindowT as clampWindowT2, doorLeafRotation as doorLeafRotation2, pointInPolygon as pointInPolygon2, polygonArea as polygonArea2, validatedUnionPolygonLoops as validatedUnionPolygonLoops2, wallLengthMeters as wallLengthMeters2, wallSolidPieces as wallSolidPieces2 } from "../../plan/geometry";
import type { WallBandOptions, WallSurfaceMaterialOptions, WallTopSurfaceOptions } from "../types/studio-app-types";
import { buildWallSpanFootprint } from "../../plan/studio-wall-spans";
import { createWallSideMaterial as createWallSideMaterial2, setWallCornerDistances as setWallCornerDistances2, setWallGradientHeight as setWallGradientHeight2 } from "../../materials/studio-wall-materials";
import { WALL_SURFACE_FINISH as WALL_SURFACE_FINISH2, wallEmissiveIntensity as wallEmissiveIntensity2 } from "../../materials/studio-wall-finish";
import { doorMaterialPartRoleFor } from "../../materials/studio-model-material-roles";
import { finite as finite2 } from "../../loaders/studio-normalization";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { validGeometryLoops as validGeometryLoops2 } from "../../geometry-persistent-cache";
import { windowGeometryParts as windowGeometryParts2 } from "../../plan/studio-window-geometry";
import { collectExhaustFanOpenings } from "../items/studio-exhaust-fan";

/** 墙体构件族的外部状态（只读：本族不写入任何外部可变绑定）。 */
interface StudioWallsDeps {
  activeFloorId: any;
  addArchitectureMesh: any;
  addWindowFrames: any;
  backgroundSettings: any;
  computeSurfaceExclusions: any;
  createSelectionRef: any;
  defaultWallRuntimeProfile: any;
  doorPartDisplayColor: any;
  doorPartMeshOptions: any;
  doorPartThemeColor: any;
  geometryCacheHandle: any;
  isEmbedStageMode: any;
  isEmbeddedStage: any;
  lampsLayerIndex: any;
  resolveDoorPartMaterials: any;
  sceneRootNode: any;
  sceneStyle: any;
  studioState: any;
  wallOpacityValue: any;
}



export function createOutlinePath(deps: StudioWallsDeps, outlineShapeConstructor: any, outlinePointList: any) {
  const outlinePath = new outlineShapeConstructor();
  return (
    outlinePointList.forEach((outlinePoint: any, outlinePointIndex: any) => {
      outlinePointIndex === 0
        ? outlinePath.moveTo(outlinePoint.x, outlinePoint.y)
        : outlinePath.lineTo(outlinePoint.x, outlinePoint.y);
    }),
    outlinePath.closePath(),
    outlinePath
  );
}

export function buildShapesWithHoles(deps: StudioWallsDeps, polygonLoopList: any) {
  const outerLoopEntries: any[] = [],
    holeLoopQueue: any[] = [];
  for (const polygonLoop of polygonLoopList) {
    const polygonLoopArea = polygonArea2(polygonLoop);
    polygonLoopArea > 0
      ? outerLoopEntries.push({
          loop: polygonLoop,
          area: polygonLoopArea,
          holes: [] as any[],
        })
      : polygonLoopArea < 0 && holeLoopQueue.push(polygonLoop);
  }
  if (!outerLoopEntries.length)
    for (const reversedPolygonLoop of holeLoopQueue.splice(0)) {
      const reverse = [...reversedPolygonLoop].reverse();
      outerLoopEntries.push({
        loop: reverse,
        area: Math.abs(polygonArea2(reverse)),
        holes: [] as any[],
      });
    }
  for (const pendingHoleLoop of holeLoopQueue) {
    const containingOuterEntry = outerLoopEntries
      .filter((candidateOuterEntry) =>
        pointInPolygon2(pendingHoleLoop[0], candidateOuterEntry.loop, 0.000001),
      )
      .sort((firstAreaEntry, secondAreaEntry) => firstAreaEntry.area - secondAreaEntry.area)[0];
    containingOuterEntry && containingOuterEntry.holes.push(pendingHoleLoop);
  }
  return outerLoopEntries.map((outerLoopEntry) => {
    const gc2 = createOutlinePath(deps, ns2.Shape, outerLoopEntry.loop);
    for (const holeLoopShapeSource of outerLoopEntry.holes)
      gc2.holes.push(createOutlinePath(deps, ns2.Path, holeLoopShapeSource));
    return gc2;
  });
}

export function createSceneWallSideMaterial(deps: StudioWallsDeps, 
  wallSideColor: any,
  wallSideOpacity: any,
  wallSideOptions: WallSurfaceMaterialOptions = {},
) {
  const warmWood = deps.backgroundSettings().warmWood && wallSideOptions.polygonOffset !== true,
    isWallSideOpaque = wallSideOpacity >= 0.999,
    We2 = deps.isEmbedStageMode && !isWallSideOpaque,
    wallSideMaterial = createWallSideMaterial2(
      ns2,
      {
        color: wallSideColor,
        roughness: WALL_SURFACE_FINISH2.roughness,
        metalness: WALL_SURFACE_FINISH2.metalness,
        clearcoat: WALL_SURFACE_FINISH2.clearcoat,
        clearcoatRoughness: WALL_SURFACE_FINISH2.clearcoatRoughness,
        transmission: isWallSideOpaque || We2 ? 0 : 0.012,
        thickness: 0.1,
        ior: 1.22,
        transparent: !isWallSideOpaque,
        opacity: wallSideOpacity,
        depthWrite: wallSideOptions.depthWrite ?? isWallSideOpaque,
        depthFunc:
          wallSideOptions.depthFunc ?? (isWallSideOpaque ? ns2.LessEqualDepth : ns2.LessDepth),
        polygonOffset: wallSideOptions.polygonOffset === true,
        polygonOffsetFactor: wallSideOptions.polygonOffsetFactor ?? -2,
        polygonOffsetUnits: wallSideOptions.polygonOffsetUnits ?? -4,
        side: ns2.DoubleSide,
        emissive: wallSideOptions.emissive ?? wallSideColor,


        emissiveIntensity: wallSideOptions.emissiveIntensity ?? wallEmissiveIntensity2(warmWood),
      },
      wallSideOptions.polygonOffset !== true,
      deps.isEmbedStageMode && typeof window < "u"
        ? (new URLSearchParams(window.location.search).get("wall-trial") ??
            deps.defaultWallRuntimeProfile)
        : "",
      warmWood,
    );
  return ((wallSideMaterial.userData.alphaWallBand = We2), wallSideMaterial);
}

function createHiddenBasicMaterial(deps: StudioWallsDeps) {
  const hiddenBasicMaterial = new ns2.MeshBasicMaterial();
  return ((hiddenBasicMaterial.visible = false), hiddenBasicMaterial);
}

export function createWallTopMaterial(deps: StudioWallsDeps, 
  wallTopBaseColor: any,
  wallTopOpacity: any,
  wallTopOptions: WallSurfaceMaterialOptions = {},
) {
  const warmWood2 = deps.backgroundSettings().warmWood && wallTopOptions.polygonOffset !== true,
    isWallTopOpaque = wallTopOpacity >= 0.999,
    wallTopTint = new ns2.Color(wallTopOptions.topColor ?? wallTopBaseColor);
  isWallTrialShaderEnabled(deps) &&
    wallTopOptions.polygonOffset !== true &&
    wallTopTint.multiplyScalar(1.2);
  const wallTopMaterial = new ns2.MeshStandardMaterial({
    color: wallTopTint,
    roughness: 0.76,
    metalness: 0,
    transparent: !isWallTopOpaque,
    opacity:
      wallTopOptions.topOpacity ??
      (isWallTopOpaque
        ? 1
        : Math.min(wallTopOpacity * (warmWood2 ? 1.65 : 1.08), warmWood2 ? 0.72 : 0.42)),
    depthWrite: wallTopOptions.depthWrite ?? isWallTopOpaque,
    depthFunc: wallTopOptions.depthFunc ?? (isWallTopOpaque ? ns2.LessEqualDepth : ns2.LessDepth),
    polygonOffset: wallTopOptions.polygonOffset === true,
    polygonOffsetFactor: wallTopOptions.polygonOffsetFactor ?? -2,
    polygonOffsetUnits: wallTopOptions.polygonOffsetUnits ?? -4,
    side: ns2.DoubleSide,
    emissive: wallTopOptions.emissive ?? wallTopOptions.topColor ?? wallTopBaseColor,
    emissiveIntensity: wallTopOptions.emissiveIntensity
      ? wallTopOptions.emissiveIntensity * 0.3
      : warmWood2
        ? 0.38


        : 0.30,
  });
  return (
    wallTopOptions.polygonOffset !== true && (wallTopMaterial.userData.environmentWallTop = true),
    wallTopMaterial
  );
}

/** 墙体轮廓并集：经几何持久缓存复用，命中时跳过昂贵的多边形布尔运算。 */
function cachedWallUnionLoops(deps: StudioWallsDeps, wallLoopList: any) {
  const computeUnionLoops = () => validatedUnionPolygonLoops2(wallLoopList, 1e-7);
  return deps.geometryCacheHandle
    ? deps.geometryCacheHandle.value("wall-union", wallLoopList, computeUnionLoops, validGeometryLoops2)
    : computeUnionLoops();
}

function buildWallBandMesh(deps: StudioWallsDeps, 
  wallBandLoopList: any,
  wallBandBaseHeight: any,
  wallBandTopHeight: any,
  wallBandColor: any,
  wallBandOpacity: any,
  wallBandOptions: WallBandOptions = {},
) {
  if (!wallBandLoopList.length || wallBandTopHeight - wallBandBaseHeight <= 0.000001) return;
  const validatedWallBandLoops = cachedWallUnionLoops(deps, wallBandLoopList),
    hasValidWallBandLoops = validatedWallBandLoops.length > 0,
    ms2 = buildShapesWithHoles(deps, hasValidWallBandLoops ? validatedWallBandLoops : wallBandLoopList),
    resolvedWallBandOptions =
      !hasValidWallBandLoops && wallBandOpacity < 0.999 && wallBandOptions.depthWrite === undefined
        ? {
            ...wallBandOptions,
            depthWrite: true,
            depthFunc: ns2.LessDepth,
          }
        : wallBandOptions;
  for (const wallBandShape of ms2) {
    const usesWallTrialShader = isWallTrialShaderEnabled(deps) && wallBandOptions.polygonOffset !== true,
      extractPoints = wallBandShape.extractPoints(1),
      buildWallBandGeometry = () => {
        const extrudedGeometry = new ns2.ExtrudeGeometry(wallBandShape, {
          depth: wallBandTopHeight - wallBandBaseHeight,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
        return (
          setWallGradientHeight2(
            ns2,
            extrudedGeometry,
            "z",
            wallBandTopHeight,
            -1,
            deps.studioState.settings.wallHeight,
          ),
          usesWallTrialShader &&
            setWallCornerDistances2(ns2, extrudedGeometry, [
              extractPoints.shape,
              ...extractPoints.holes,
            ]),
          extrudedGeometry
        );
      },
      wallBandGeometry = deps.geometryCacheHandle
        ? deps.geometryCacheHandle.geometry(ns2, "wall-band", [
            extractPoints,
            wallBandBaseHeight,
            wallBandTopHeight,
            deps.studioState.settings.wallHeight,
            usesWallTrialShader,
          ], buildWallBandGeometry)
        : buildWallBandGeometry();
    const hiddenWallBandMaterial = createHiddenBasicMaterial(deps),
      hg3 = createSceneWallSideMaterial(deps, wallBandColor, wallBandOpacity, resolvedWallBandOptions),
      wallBandMesh = new ns2.Mesh(wallBandGeometry, [hiddenWallBandMaterial, hg3]);
    ((wallBandMesh.userData.hbMergeWallBand =
      wallBandOptions.polygonOffset !== true && (wallBandOptions.renderOrder ?? 4) === 4),
      (wallBandMesh.userData.reflectionRole = "wall"),
      (wallBandMesh.rotation.x = Math.PI / 2),
      (wallBandMesh.position.y = wallBandTopHeight));
    const isWallBandOpaque = wallBandOpacity >= 0.999;
    ((wallBandMesh.castShadow = wallBandOptions.castShadow === true),
      wallBandOptions.lightOccluder && wallBandMesh.layers.set(deps.lampsLayerIndex),
      (wallBandMesh.receiveShadow = isWallBandOpaque),
      (wallBandMesh.renderOrder = wallBandOptions.renderOrder ?? 4),
      deps.sceneRootNode.add(wallBandMesh));
  }
}

function buildWallTopSurface(deps: StudioWallsDeps, 
  wallTopLoopList: any,
  wallTopSurfaceHeight: any,
  wallTopSurfaceColor: any,
  wallTopSurfaceOpacity: any,
  wallTopSurfaceOptions: WallTopSurfaceOptions = {},
) {
  if (!wallTopLoopList.length) return;
  const validatedWallTopLoops = cachedWallUnionLoops(deps, wallTopLoopList),
    hasValidWallTopLoops = validatedWallTopLoops.length > 0,
    ms3 = buildShapesWithHoles(deps, hasValidWallTopLoops ? validatedWallTopLoops : wallTopLoopList),
    resolvedWallTopSurfaceOptions =
      !hasValidWallTopLoops &&
      wallTopSurfaceOpacity < 0.999 &&
      wallTopSurfaceOptions.depthWrite === undefined
        ? {
            ...wallTopSurfaceOptions,
            depthWrite: true,
            depthFunc: ns2.LessDepth,
          }
        : wallTopSurfaceOptions;
  for (const wallTopShape of ms3) {
    const wallTopSurfaceGeometry = new ns2.ShapeGeometry(wallTopShape, 1),
      fg3 = createWallTopMaterial(
        deps, wallTopSurfaceColor,
        wallTopSurfaceOpacity,
        resolvedWallTopSurfaceOptions,
      ),
      wallTopSurfaceMesh = new ns2.Mesh(wallTopSurfaceGeometry, fg3);
    ((wallTopSurfaceMesh.rotation.x = Math.PI / 2),
      (wallTopSurfaceMesh.position.y = wallTopSurfaceHeight + 0.0005),
      (wallTopSurfaceMesh.userData.reflectionRole = "wall"),
      (wallTopSurfaceMesh.castShadow = false),
      (wallTopSurfaceMesh.receiveShadow = false),
      (wallTopSurfaceMesh.renderOrder = wallTopSurfaceOptions.renderOrder ?? 4),
      deps.isEmbeddedStage && fg3.transparent && (fg3.forceSinglePass = true),
      deps.sceneRootNode.add(wallTopSurfaceMesh));
  }
}

export function expandPolygonOutward(deps: StudioWallsDeps, polygonPointList: any, outwardOffset: any) {
  const reduce = polygonPointList.reduce(
    (accumulatedPoint: any, offsetPointEntry: any) => ({
      x: accumulatedPoint.x + offsetPointEntry.x / polygonPointList.length,
      y: accumulatedPoint.y + offsetPointEntry.y / polygonPointList.length,
    }),
    {
      x: 0,
      y: 0,
    },
  );
  return polygonPointList.map((polygonPoint: any) => {
    const pointDeltaX = polygonPoint.x - reduce.x,
      pointDeltaY = polygonPoint.y - reduce.y,
      pointDistance = Math.max(Math.hypot(pointDeltaX, pointDeltaY), 0.000001);
    return {
      x: polygonPoint.x + (pointDeltaX / pointDistance) * outwardOffset,
      y: polygonPoint.y + (pointDeltaY / pointDistance) * outwardOffset,
    };
  });
}

function createWallContactShadowMesh(deps: StudioWallsDeps, wallPolygonList: any, contactShadowHeight: any) {
  if (!wallPolygonList.length || isWallTrialShaderEnabled(deps)) return;
  const wallShapes = wallPolygonList.map((wallPolygon: any) => {
      const xu3 = expandPolygonOutward(deps, wallPolygon, 0.028),
        reverse2 = polygonArea2(xu3) >= 0 ? xu3 : [...xu3].reverse();
      return createOutlinePath(deps, ns2.Shape, reverse2);
    }),
    wallShapeGeometries = wallShapes.map((wallShape: any) => {
      const wallShapeGeometry = new ns2.ShapeGeometry(wallShape, 1);
      return (
        wallShapeGeometry.rotateX(Math.PI / 2),
        wallShapeGeometry.translate(0, contactShadowHeight, 0),
        wallShapeGeometry
      );
    }),
    mergedContactGeometry = mergeGeometries2(wallShapeGeometries);
  if (
    (wallShapeGeometries.forEach((disposableGeometry: any) => disposableGeometry.dispose()),
    !mergedContactGeometry)
  )
    return;
  const wallContactShadowMesh = new ns2.Mesh(
    mergedContactGeometry,
    new ns2.MeshBasicMaterial({
      color: 527122,
      transparent: true,
      opacity: 0.052,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      toneMapped: false,
      side: ns2.DoubleSide,
    }),
  );
  ((wallContactShadowMesh.renderOrder = 1),
    (wallContactShadowMesh.userData.batchedWallContactShadowCount = wallShapes.length),
    (wallContactShadowMesh.userData.exportRole = "background"),
    (wallContactShadowMesh.visible = deps.sceneStyle !== "warm-wood"),
    deps.sceneRootNode.add(wallContactShadowMesh));
}

function isWallTrialShaderEnabled(deps: StudioWallsDeps) {
  return (
    deps.isEmbedStageMode &&
    (new URLSearchParams(window.location.search).get("wall-trial") ?? deps.defaultWallRuntimeProfile)
      .split(",")
      .includes("shader")
  );
}

export function buildInteriorScene(deps: StudioWallsDeps, {
  ppm: interiorPixelsPerMeter,
  toWorld: interiorToWorld,
  floorSurfaceY: interiorFloorSurfaceY,
}: any) {
  const yt6 = deps.backgroundSettings(),
    oe4 = typeof deps.activeFloorId == "string" ? deps.activeFloorId : "",
    buildInteriorSceneIsEmbeddedStage =
      typeof window < "u" &&
      window.location.pathname ===
        "/api/v1/modules/interaction3d/stage.html",
    resolveDoorMaterialType = (rawDoorType: any) =>
      rawDoorType === "entry" || rawDoorType === "entry-child-mother"
        ? "entry"
        : rawDoorType === "solid"
          ? "wood"
          : rawDoorType === "double"
            ? "double"
            : rawDoorType === "glass"
              ? "glass"
              : rawDoorType === "sliding-glass"
                ? "sliding"
                : rawDoorType === "roller-shutter"
                  ? "roller"
                  : "static",
    existingChildSet = new Set(deps.sceneRootNode.children),
    floorOpenings = [
      ...deps.studioState.windows,
      ...deps.studioState.doors.map((doorEntry: any) => ({
        ...doorEntry,
        sill: 0,
      })),
      ...deps.studioState.railings.map((railingEntry: any) => {
        const railingWall = deps.studioState.walls.find(
          (candidateWall: any) => candidateWall.id === railingEntry.wallId,
        );
        return {
          ...railingEntry,
          sill: 0,
          height: railingWall?.height || deps.studioState.settings.wallHeight,
        };
      }),
      /** 排气扇是场景条目而非洞口集合，洞口由自身位置 + 墙体反推（84% 真洞）。 */
      ...collectExhaustFanOpenings(
        deps.studioState.items,
        deps.studioState.walls,
        interiorPixelsPerMeter,
        deps.studioState.settings.wallHeight,
      ).map((exhaustOpeningEntry) => exhaustOpeningEntry.installation.opening),
    ],
    wallVolumes: any[] = [],
    wallVolumeKeySet = new Set(),
    iy2 = deps.computeSurfaceExclusions(interiorPixelsPerMeter);
  for (const currentWall of deps.studioState.walls) {
    const wallOpacity =
      deps.wallOpacityValue ??
      (currentWall.opacity === null || currentWall.opacity === undefined
        ? deps.studioState.settings.wallOpacity
        : clamp2(finite2(currentWall.opacity, deps.studioState.settings.wallOpacity), 0, 1));
    for (const wallSolidPiece of wallSolidPieces2(
      currentWall,
      floorOpenings,
      interiorPixelsPerMeter,
      currentWall.height,
    )) {
      const jv2 = buildWallSpanFootprint(
        currentWall,
        wallSolidPiece,
        interiorPixelsPerMeter,
        interiorToWorld,
        iy2[currentWall.id],
      );
      if (!jv2) continue;
      const join5 = [
        canonicalPolygonKey2(jv2, 4),
        wallSolidPiece.bottom.toFixed(5),
        wallSolidPiece.top.toFixed(5),
        wallOpacity.toFixed(4),
      ].join("|");
      wallVolumeKeySet.has(join5) ||
        (wallVolumeKeySet.add(join5),
        wallVolumes.push({
          wallId: currentWall.id,
          footprint: jv2,
          bottom: wallSolidPiece.bottom,
          top: wallSolidPiece.top,
          opacity: wallOpacity,
        }));
    }
  }
  const sort5 = [
    ...new Set(
      wallVolumes
        .flatMap((flatWallVolume) => [flatWallVolume.bottom, flatWallVolume.top])
        .map((wallLevelNumber) => wallLevelNumber.toFixed(6)),
    ),
  ]
    .map(Number)
    .sort((firstWallLevel, secondWallLevel) => firstWallLevel - secondWallLevel);
  createWallContactShadowMesh(
    deps, wallVolumes
      .filter((bottomWallVolume) => bottomWallVolume.bottom <= 0.000001)
      .map((lowWallVolume) => lowWallVolume.footprint),
    interiorFloorSurfaceY + 0.0025,
  );
  for (let wallLevelIndex = 0; wallLevelIndex < sort5.length - 1; wallLevelIndex += 1) {
    const lowerWallLevel = sort5[wallLevelIndex],
      upperWallLevel = sort5[wallLevelIndex + 1];
    if (upperWallLevel - lowerWallLevel <= 0.000001) continue;
    const midWallLevel = (lowerWallLevel + upperWallLevel) / 2,
      midLevelWallVolumes = wallVolumes.filter(
        (midLevelWallVolume) =>
          midWallLevel > midLevelWallVolume.bottom - 0.000001 &&
          midWallLevel < midLevelWallVolume.top + 0.000001,
      ),
      wallVolumesByOpacity = new Map();
    for (const volumeAtMidLevel of midLevelWallVolumes) {
      const fixed2 = volumeAtMidLevel.opacity.toFixed(4);
      (wallVolumesByOpacity.has(fixed2) ||
        wallVolumesByOpacity.set(fixed2, {
          opacity: volumeAtMidLevel.opacity,
          volumes: [] as any[],
        }),
        wallVolumesByOpacity.get(fixed2).volumes.push(volumeAtMidLevel));
    }
    for (const wallOpacityGroup of wallVolumesByOpacity.values()) {
      buildWallBandMesh(
        deps, wallOpacityGroup.volumes.map((groupWallVolume: any) => groupWallVolume.footprint),
        lowerWallLevel,
        upperWallLevel,
        yt6.wall,
        wallOpacityGroup.opacity,
        {
          castShadow: true,
          lightOccluder: true,
        },
      );
      const wallOpacityFootprints = wallOpacityGroup.volumes
        .filter((topWallVolume: any) => Math.abs(topWallVolume.top - upperWallLevel) <= 0.000001)
        .map((topWallVolumeEntry: any) => topWallVolumeEntry.footprint);
      buildWallTopSurface(
        deps, wallOpacityFootprints,
        upperWallLevel,
        yt6.wall,
        wallOpacityGroup.opacity,
        {
          topColor: yt6.warmWood ? yt6.wallTop : yt6.wall,
        },
      );
    }
    const accentWallFootprints = midLevelWallVolumes
      .filter((accentWallVolume) => deps.createSelectionRef("wall", accentWallVolume.wallId))
      .map((accentWallVolumeEntry) => accentWallVolumeEntry.footprint);
    if (accentWallFootprints.length) {
      buildWallBandMesh(deps, accentWallFootprints, lowerWallLevel, upperWallLevel, yt6.accent, 0.28, {
        depthWrite: false,
        depthFunc: ns2.LessEqualDepth,
        polygonOffset: true,
        emissive: yt6.accent,
        emissiveIntensity: 0.12,
        renderOrder: 5,
      });
      const accentTopWallFootprints = midLevelWallVolumes
        .filter(
          (accentTopWallVolume) =>
            deps.createSelectionRef("wall", accentTopWallVolume.wallId) &&
            Math.abs(accentTopWallVolume.top - upperWallLevel) <= 0.000001,
        )
        .map((accentTopVolumeEntry) => accentTopVolumeEntry.footprint);
      buildWallTopSurface(deps, accentTopWallFootprints, upperWallLevel, yt6.accent, 0.28, {
        depthWrite: false,
        depthFunc: ns2.LessEqualDepth,
        polygonOffset: true,
        emissive: yt6.accent,
        emissiveIntensity: 0.12,
        topOpacity: 0.12,
        renderOrder: 6,
      });
    }
  }
  for (const openingWall of deps.studioState.walls) {
    const openingWallDeltaX = openingWall.end.x - openingWall.start.x,
      openingWallDeltaZ = openingWall.end.y - openingWall.start.y,
      hypot7 = Math.hypot(openingWallDeltaX, openingWallDeltaZ);
    if (!hypot7) continue;
    const openingWallAngle = -Math.atan2(openingWallDeltaZ, openingWallDeltaX);
    for (const currentWindow of deps.studioState.windows.filter(
      (buildInteriorSceneWindowCandidate: any) =>
        buildInteriorSceneWindowCandidate.wallId === openingWall.id,
    )) {
      const windowPositionT = clampWindowT2(openingWall, currentWindow, interiorPixelsPerMeter),
        windowCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * windowPositionT,
          y: openingWall.start.y + openingWallDeltaZ * windowPositionT,
        },
        windowWorldPoint = interiorToWorld(windowCenterPlanPoint),
        windowGroup = new ns2.Group();
      (windowGroup.position.set(windowWorldPoint.x, 0, windowWorldPoint.z),
        (windowGroup.rotation.y = openingWallAngle));
      const windowWidth = Math.min(
          currentWindow.width,
          wallLengthMeters2(openingWall, interiorPixelsPerMeter),
        ),
        windowSillHeight = clamp2(currentWindow.sill, 0, openingWall.height),
        windowHeight = Math.min(currentWindow.height, openingWall.height - windowSillHeight),
        windowParts = windowGeometryParts2(
          windowWidth,
          windowHeight,
          windowSillHeight,
          currentWindow.hasDivider !== false,
        );
      if (!windowParts) continue;
      deps.addArchitectureMesh(windowGroup, windowParts.glass, yt6.glass, {
        rounded: false,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: ns2.DoubleSide,
        roughness: 0.08,
        metalness: 0.04,
        castShadow: false,
        renderOrder: 6,
      });
      const accent = deps.createSelectionRef("window", currentWindow.id)
        ? yt6.accent
        : (yt6.windowFrame ?? yt6.furniture);
      (deps.addArchitectureMesh(windowGroup, windowParts.frames, accent, {
        rounded: false,
        metalness: 0.15,
        castShadow: false,
        receiveShadow: false,
      }),
        (windowGroup.userData.optimizationStats = {
          type: windowParts.divided ? "window-divided" : "window-plain",
          before: windowParts.divided ? 6 : 5,
          after: 2,
        }),
        deps.sceneRootNode.add(windowGroup));
    }
    for (const currentRailing of deps.studioState.railings.filter(
      (buildInteriorSceneRailingCandidate: any) =>
        buildInteriorSceneRailingCandidate.wallId === openingWall.id,
    )) {
      const railingPositionT = clampWindowT2(openingWall, currentRailing, interiorPixelsPerMeter),
        railingCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * railingPositionT,
          y: openingWall.start.y + openingWallDeltaZ * railingPositionT,
        },
        railingWorldPoint = interiorToWorld(railingCenterPlanPoint),
        railingGroup = new ns2.Group();
      (railingGroup.position.set(railingWorldPoint.x, 0, railingWorldPoint.z),
        (railingGroup.rotation.y = openingWallAngle));
      const railingWidth = Math.min(
          currentRailing.width,
          wallLengthMeters2(openingWall, interiorPixelsPerMeter),
        ),
        railingHeight = Math.min(currentRailing.height, openingWall.height),
        accent2 = deps.createSelectionRef("railing", currentRailing.id) ? yt6.accent : yt6.frame,
        railingPostThickness = Math.min(Math.max(railingWidth * 0.012, 0.028), 0.05),
        railingRailInset = 0.08,
        railingClearHeight = Math.max(
          railingHeight - railingRailInset - railingPostThickness * 1.4,
          0.2,
        );
      deps.addArchitectureMesh(
        railingGroup,
        [
          [
            Math.max(railingWidth - railingPostThickness * 2.4, 0.2),
            railingClearHeight,
            0.018,
            0,
            railingRailInset + railingClearHeight * 0.5,
            0,
          ],
        ],
        yt6.glass,
        {
          rounded: false,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: ns2.DoubleSide,
          metalness: 0.04,
          roughness: 0.08,
          castShadow: false,
          receiveShadow: false,
          renderOrder: 6,
        },
      );
      const railingMaterialOptions = {
          rounded: false,
          metalness: 0.58,
          roughness: 0.24,
          castShadow: false,
          receiveShadow: false,
        },
        railingPostCount = Math.max(2, Math.min(16, Math.ceil(railingWidth / 1.5) + 1)),
        railingPostSpans = [[railingWidth, railingPostThickness, 0.055, 0, railingHeight, 0]],
        railingRailSpans: any[] = [];
      for (let railingPostIndex = 0; railingPostIndex < railingPostCount; railingPostIndex += 1) {
        const railingPostX =
          -railingWidth / 2 + (railingWidth * railingPostIndex) / (railingPostCount - 1);
        (railingPostSpans.push([
          railingPostThickness,
          railingHeight,
          0.055,
          railingPostX,
          railingHeight * 0.5,
          0,
        ]),
          railingRailSpans.push([
            railingPostThickness * 2,
            railingPostThickness * 0.8,
            0.08,
            railingPostX,
            railingPostThickness * 0.4,
            0,
          ]));
      }
      (deps.addArchitectureMesh(railingGroup, railingPostSpans, accent2, railingMaterialOptions),
        deps.addArchitectureMesh(
          railingGroup,
          railingRailSpans,
          yt6.furnitureSoft,
          railingMaterialOptions,
        ),
        (railingGroup.userData.optimizationStats = {
          type: "glass-railing",
          before: 2 + railingPostCount * 2,
          after: 3,
        }),
        deps.sceneRootNode.add(railingGroup));
    }
    for (const currentDoor of deps.studioState.doors.filter(
      (buildInteriorSceneDoorCandidate: any) =>
        buildInteriorSceneDoorCandidate.wallId === openingWall.id,
    )) {
      const doorPositionT = clampWindowT2(openingWall, currentDoor, interiorPixelsPerMeter),
        doorCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * doorPositionT,
          y: openingWall.start.y + openingWallDeltaZ * doorPositionT,
        },
        doorWorldPoint = interiorToWorld(doorCenterPlanPoint),
        doorGroup = new ns2.Group();
      (buildInteriorSceneIsEmbeddedStage &&
        Object.assign(doorGroup.userData, {
          editorModelId: "door:" + currentDoor.id,
          editorFloorId: oe4,
        }),
        doorGroup.position.set(doorWorldPoint.x, 0, doorWorldPoint.z),
        (doorGroup.rotation.y = openingWallAngle),
        buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.environmentModelId = "door:" + currentDoor.id),
          (doorGroup.userData.environmentFloorId = oe4),
          (doorGroup.userData.environmentModelType = "door"),
          (doorGroup.userData.doorAnimationType = resolveDoorMaterialType(
            currentDoor.doorType || "solid",
          ))));
      const buildInteriorSceneDoorWidth = Math.min(
          currentDoor.width,
          wallLengthMeters2(openingWall, interiorPixelsPerMeter),
        ),
        buildInteriorSceneDoorHeight = Math.min(currentDoor.height, openingWall.height),
        ne8 = deps.createSelectionRef("door", currentDoor.id),
        doorType = currentDoor.doorType || "solid",
        isSolidDoorLeaf = doorType === "solid" || doorType === "frame-only",


        doorParts = deps.resolveDoorPartMaterials(currentDoor, yt6),


        doorPartForRole = (roleName: any) => doorParts[doorMaterialPartRoleFor(doorType, roleName)],
        doorPartColor = (roleName: any) => deps.doorPartDisplayColor(doorPartForRole(roleName), ne8, yt6),
        doorPartOptions = (roleName: any, baseOptions: any) =>
          deps.doorPartMeshOptions(doorPartForRole(roleName), baseOptions),

        doorGlassColor = doorParts.glass?.colorValue ?? deps.doorPartThemeColor(doorType, "glass", yt6),
        doorLeafMaterialOptions = yt6.warmWood
          ? {


              emissive: doorPartForRole("door")?.colorValue ?? yt6.doorLeaf,
              emissiveIntensity: 0.4,
            }
          : {},
        doorLeafThickness = 0.065,
        doorLeafOptions = {
          rounded: false,
          metalness: 0.08,
          castShadow: false,
          receiveShadow: false,
          ...(isSolidDoorLeaf ? doorLeafMaterialOptions : {}),
        },
        doorLeafPanels = [
          [
            doorLeafThickness,
            buildInteriorSceneDoorHeight,
            0.09,
            -buildInteriorSceneDoorWidth / 2,
            buildInteriorSceneDoorHeight / 2,
            0,
          ],
          [
            doorLeafThickness,
            buildInteriorSceneDoorHeight,
            0.09,
            buildInteriorSceneDoorWidth / 2,
            buildInteriorSceneDoorHeight / 2,
            0,
          ],
          [
            buildInteriorSceneDoorWidth + doorLeafThickness,
            doorLeafThickness,
            0.09,
            0,
            buildInteriorSceneDoorHeight,
            0,
          ],
        ];
      if (doorType === "roller-shutter") {
        const doorSwingSign = currentDoor.swing === -1 ? -1 : 1;
        doorLeafPanels.push([
          buildInteriorSceneDoorWidth + doorLeafThickness * 0.6,
          doorLeafThickness * 1.8,
          0.13,
          0,
          buildInteriorSceneDoorHeight - doorLeafThickness * 0.35,
          doorSwingSign * 0.04,
        ]);
      }
      if (
        (deps.addArchitectureMesh(
          doorGroup,
          doorLeafPanels,
          doorPartColor("frame"),
          doorPartOptions("frame", doorLeafOptions),
        ),
        doorType === "frame-only")
      ) {
        ((doorGroup.userData.optimizationStats = {
          type: "door-frame-only",
          before: 3,
          after: 1,
        }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      if (doorType === "sliding-glass") {
        const doorLeafMaxHeight = Math.max(
            buildInteriorSceneDoorHeight - doorLeafThickness * 0.85,
            0.4,
          ),
          doorLeafMaxWidth = Math.max(buildInteriorSceneDoorWidth * 0.54, 0.28),
          doorHingeSign = currentDoor.hinge === "right" ? 1 : -1;
        for (const slidingPanelSign of [-1, 1]) {
          const slidingPanelGroup = new ns2.Group(),
            slidingPanelOffset = slidingPanelSign * buildInteriorSceneDoorWidth * 0.23,


            slidingPanelRestOffset =
              slidingPanelSign === -doorHingeSign
                ? doorHingeSign *
                  buildInteriorSceneDoorWidth *
                  0.46 *
                  SLIDING_DOOR_DISPLAY_OPEN_RATIO2
                : 0;
          ((slidingPanelGroup.position.x = slidingPanelRestOffset),
            buildInteriorSceneIsEmbeddedStage &&
              Object.assign(slidingPanelGroup.userData, {
                doorSlidePivot: true,
                doorSlideSide: slidingPanelSign,
                doorRestTranslation: slidingPanelRestOffset,
                doorSlideTravel: buildInteriorSceneDoorWidth * 0.46,
              }),
            doorGroup.add(slidingPanelGroup),
            deps.addWindowFrames(
              slidingPanelGroup,
              [
                {
                  width: doorLeafMaxWidth,
                  height: doorLeafMaxHeight,
                  centerX: slidingPanelOffset,
                  centerZ: slidingPanelSign * 0.024,
                },
              ],
              doorPartColor("frame"),
              doorGlassColor,
            ));
          const slidingPanelTrackOffset =
            slidingPanelOffset - slidingPanelSign * doorLeafMaxWidth * 0.36;
          deps.addArchitectureMesh(
            slidingPanelGroup,
            [
              [
                0.026,
                0.15,
                0.055,
                slidingPanelTrackOffset,
                buildInteriorSceneDoorHeight * 0.52,
                slidingPanelSign * 0.052,
              ],
            ],
            doorPartColor("metal"),
            doorPartOptions("metal", {
              rounded: false,
              metalness: 0.5,
              castShadow: false,
              receiveShadow: false,
            }),
          );
        }
        (buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.doorSlideOpenTranslation = buildInteriorSceneDoorWidth * 0.46),
          (doorGroup.userData.doorSlideClosedTranslation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: "door-sliding-glass",
            before: 15,
            after: 5,
          }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      if (doorType === "roller-shutter") {
        const pocketDoorWidth = Math.max(
            buildInteriorSceneDoorWidth - doorLeafThickness * 1.3,
            0.4,
          ),
          pocketDoorHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.8),
          pocketSwingSign = currentDoor.swing === -1 ? -1 : 1,
          pocketDoorGroup = new ns2.Group();
        (buildInteriorSceneIsEmbeddedStage &&
          ((pocketDoorGroup.userData.doorRollerPivot = true),
          (pocketDoorGroup.userData.doorRestTranslation = 0),
          (pocketDoorGroup.userData.doorRollerClosedTranslation = 0),
          (pocketDoorGroup.userData.doorRollerOpenTranslation = pocketDoorHeight)),
          deps.addArchitectureMesh(
            pocketDoorGroup,
            [
              [
                pocketDoorWidth,
                pocketDoorHeight,
                0.045,
                0,
                pocketDoorHeight * 0.5,
                pocketSwingSign * 0.04,
              ],
            ],
            doorPartColor("shutter"),
            doorPartOptions("shutter", {
              ...doorLeafMaterialOptions,
              rounded: false,
              metalness: yt6.warmWood ? 0.08 : 0.36,
              roughness: 0.42,
              castShadow: false,
              receiveShadow: false,
            }),
          ));
        const pocketSlatCount = Math.max(5, Math.min(36, Math.round(pocketDoorHeight / 0.12))),
          pocketSlatOffsets: any[] = [];
        for (let pocketSlatIndex = 1; pocketSlatIndex < pocketSlatCount; pocketSlatIndex += 1) {
          const pocketSlatOffset = (pocketDoorHeight * pocketSlatIndex) / pocketSlatCount;
          pocketSlatOffsets.push([
            pocketDoorWidth * 0.98,
            0.012,
            0.052,
            0,
            pocketSlatOffset,
            pocketSwingSign * 0.052,
          ]);
        }
        (deps.addArchitectureMesh(
          pocketDoorGroup,
          pocketSlatOffsets,
          doorPartColor("slat"),
          doorPartOptions("slat", {
            ...doorLeafMaterialOptions,
            rounded: false,
            metalness: yt6.warmWood ? 0.08 : 0.42,
            roughness: 0.34,
            castShadow: false,
            receiveShadow: false,
          }),
        ),
          doorGroup.add(pocketDoorGroup),
          (doorGroup.userData.optimizationStats = {
            type: "door-roller-shutter",
            before: 5 + pocketSlatCount,
            after: 3,
          }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      if (doorType === "entry") {
        const pocketLeafWidth = Math.max(
            buildInteriorSceneDoorWidth - doorLeafThickness * 1.5,
            0.4,
          ),
          pocketLeafHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.8),


          pocketSwingSign = currentDoor.swing === -1 ? -1 : 1,
          pocketLeafFaceZ =
            pocketSwingSign * Math.max(0, (0.09 - doorLeafThickness) / 2) * 0.9,
          pocketTrimZ = pocketLeafFaceZ + pocketSwingSign * 0.012,
          pocketHandleZ = pocketLeafFaceZ + pocketSwingSign * 0.055;
        (deps.addArchitectureMesh(
          doorGroup,
          [[pocketLeafWidth, pocketLeafHeight, 0.065, 0, pocketLeafHeight * 0.5, pocketLeafFaceZ]],
          doorPartColor("door"),
          doorPartOptions("door", {
            rounded: false,
            roughness: 0.58,
            metalness: 0.1,
            castShadow: false,
            receiveShadow: false,
          }),
        ),
          deps.addArchitectureMesh(
            doorGroup,
            [
              [pocketLeafWidth * 0.76, 0.022, 0.078, 0, buildInteriorSceneDoorHeight * 0.68, pocketTrimZ],
              [pocketLeafWidth * 0.76, 0.022, 0.078, 0, buildInteriorSceneDoorHeight * 0.34, pocketTrimZ],
            ],
            doorPartColor("trim"),
            doorPartOptions("trim", {
              rounded: false,
              roughness: 0.5,
              castShadow: false,
              receiveShadow: false,
            }),
          ));
        const pocketHingeOffset =
          currentDoor.hinge === "right" ? -pocketLeafWidth * 0.34 : pocketLeafWidth * 0.34;
        deps.addArchitectureMesh(
          doorGroup,
          [[0.035, 0.18, 0.085, pocketHingeOffset, buildInteriorSceneDoorHeight * 0.5, pocketHandleZ]],
          doorPartColor("metal"),
          doorPartOptions("metal", {
            rounded: false,
            metalness: 0.58,
            roughness: 0.24,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        const pocketLeafGroup = new ns2.Group();
        pocketLeafGroup.position.x =
          ((currentDoor.hinge === "right" ? 1 : -1) * pocketLeafWidth) / 2;
        for (const pocketPanel of [...doorGroup.children].slice(1))
          ((pocketPanel.position.x -= pocketLeafGroup.position.x),
            pocketLeafGroup.add(pocketPanel));
        (doorGroup.add(pocketLeafGroup),
          buildInteriorSceneIsEmbeddedStage &&
            ((pocketLeafGroup.userData.entryDoorPivot = true),
            (pocketLeafGroup.userData.doorHingePivot = true),
            (pocketLeafGroup.userData.doorRestRotation = 0),
            (doorGroup.userData.entryDoorSign =
              (currentDoor.hinge === "right" ? 1 : -1) * (currentDoor.swing === -1 ? -1 : 1)),
            (doorGroup.userData.entryDoorLeafWidth = pocketLeafWidth),
            (doorGroup.userData.doorLeafWidth = pocketLeafWidth),
            (doorGroup.userData.doorClosedRotation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: "door-entry",
            before: 7,
            after: 4,
          }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      if (doorType === "entry-child-mother") {
        /** 入户子母门：宽扇（母门）带铰链可开，窄扇（子门）常闭，两扇不等宽。 */
        const childMotherHingeSign = currentDoor.hinge === "right" ? 1 : -1,
          childMotherSwingSign = currentDoor.swing === -1 ? -1 : 1,
          childMotherLeafHeight = Math.max(
            buildInteriorSceneDoorHeight - doorLeafThickness * 0.85,
            0.8,
          ),
          childMotherUsableWidth = Math.max(
            buildInteriorSceneDoorWidth - doorLeafThickness * 1.5,
            0.34,
          ),
          childMotherChildWidth = Math.min(
            Math.max(childMotherUsableWidth * 0.3, 0.22),
            Math.max(childMotherUsableWidth * 0.45, childMotherUsableWidth - 0.4),
          ),
          childMotherMotherWidth = Math.max(childMotherUsableWidth - childMotherChildWidth, 0.2),
          /** 母门扇在铰链枢轴内的局部偏移；子门中心恰好与它同号同值。 */
          childMotherLeafOffsetX = -childMotherHingeSign * (childMotherMotherWidth / 2),
          childMotherFaceZ =
            childMotherSwingSign * Math.max(0, (0.09 - doorLeafThickness) / 2) * 0.9,
          childMotherTrimZ = childMotherFaceZ + childMotherSwingSign * 0.012,
          childMotherHandleZ = childMotherFaceZ + childMotherSwingSign * 0.055,
          childMotherMotherGroup = new ns2.Group();
        childMotherMotherGroup.position.x = (childMotherHingeSign * childMotherUsableWidth) / 2;
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              childMotherMotherWidth,
              childMotherLeafHeight,
              doorLeafThickness,
              childMotherLeafOffsetX,
              childMotherLeafHeight / 2,
              childMotherFaceZ,
            ],
          ],
          doorPartColor("door"),
          doorPartOptions("door", {
            ...doorLeafMaterialOptions,
            rounded: false,
            roughness: 0.58,
            metalness: 0.1,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              childMotherMotherWidth * 0.76,
              0.022,
              0.078,
              childMotherLeafOffsetX,
              buildInteriorSceneDoorHeight * 0.68,
              childMotherTrimZ,
            ],
            [
              childMotherMotherWidth * 0.76,
              0.022,
              0.078,
              childMotherLeafOffsetX,
              buildInteriorSceneDoorHeight * 0.34,
              childMotherTrimZ,
            ],
          ],
          doorPartColor("trim"),
          doorPartOptions("trim", {
            rounded: false,
            roughness: 0.5,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              0.035,
              0.18,
              0.085,
              -childMotherHingeSign * childMotherMotherWidth * 0.4,
              buildInteriorSceneDoorHeight * 0.5,
              childMotherHandleZ,
            ],
          ],
          doorPartColor("metal"),
          doorPartOptions("metal", {
            rounded: false,
            metalness: 0.58,
            roughness: 0.24,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        /** 子门：常闭窄扇，带上下两道插销。 */
        deps.addArchitectureMesh(
          doorGroup,
          [
            [
              childMotherChildWidth,
              childMotherLeafHeight,
              doorLeafThickness,
              childMotherLeafOffsetX,
              childMotherLeafHeight / 2,
              childMotherFaceZ,
            ],
          ],
          doorPartColor("door"),
          doorPartOptions("door", {
            ...doorLeafMaterialOptions,
            rounded: false,
            roughness: 0.58,
            metalness: 0.1,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        deps.addArchitectureMesh(
          doorGroup,
          [
            [
              0.045,
              0.028,
              0.06,
              childMotherLeafOffsetX + childMotherHingeSign * childMotherChildWidth * 0.35,
              buildInteriorSceneDoorHeight * 0.62,
              childMotherHandleZ,
            ],
            [
              0.045,
              0.028,
              0.06,
              childMotherLeafOffsetX + childMotherHingeSign * childMotherChildWidth * 0.35,
              buildInteriorSceneDoorHeight * 0.36,
              childMotherHandleZ,
            ],
          ],
          doorPartColor("metal"),
          doorPartOptions("metal", {
            rounded: false,
            metalness: 0.52,
            roughness: 0.3,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        (doorGroup.add(childMotherMotherGroup),
          buildInteriorSceneIsEmbeddedStage &&
            (Object.assign(childMotherMotherGroup.userData, {
              entryDoorPivot: true,
              doorHingePivot: true,
              doorFixedHinge: true,
              doorRestRotation: 0,
              doorClosedRotation: 0,
              doorOpenRotation: childMotherHingeSign * Math.PI * 0.42,
            }),
            (doorGroup.userData.entryDoorSign = childMotherHingeSign * childMotherSwingSign),
            (doorGroup.userData.entryDoorLeafWidth = childMotherMotherWidth),
            (doorGroup.userData.doorLeafWidth = childMotherMotherWidth),
            (doorGroup.userData.doorClosedRotation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: "door-entry-child-mother",
            before: 9,
            after: 6,
          }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      if (doorType === "double") {
        const splitPanelWidth = Math.max(
            (buildInteriorSceneDoorWidth - doorLeafThickness) / 2 - 0.003,
            0.25,
          ),
          splitPanelHeight = Math.max(
            buildInteriorSceneDoorHeight - doorLeafThickness / 2 - 0.006,
            0.4,
          ),
          splitPanelSwingAngle = (currentDoor.swing === -1 ? 1 : -1) * Math.PI * 0.42;
        for (const splitPanelSign of [-1, 1]) {
          const splitPanelOffset =
              splitPanelSign * (buildInteriorSceneDoorWidth / 2 - doorLeafThickness * 0.5),
            splitPanelGroup = new ns2.Group();
          ((splitPanelGroup.position.x = splitPanelOffset),
            (splitPanelGroup.rotation.y =
              splitPanelSign < 0 ? splitPanelSwingAngle : -splitPanelSwingAngle),
            buildInteriorSceneIsEmbeddedStage &&
              ((splitPanelGroup.userData.doorHingePivot = true),
              (splitPanelGroup.userData.doorFixedHinge = true),
              (splitPanelGroup.userData.doorRestRotation = splitPanelGroup.rotation.y),
              (splitPanelGroup.userData.doorOpenRotation = splitPanelGroup.rotation.y)));
          const splitPanelHandleOffset =
            splitPanelSign < 0 ? splitPanelWidth / 2 : -splitPanelWidth / 2;
          deps.addArchitectureMesh(
            splitPanelGroup,
            [
              [
                splitPanelWidth,
                splitPanelHeight,
                0.04,
                splitPanelHandleOffset,
                splitPanelHeight / 2,
                0,
              ],
            ],
            doorPartColor("door"),
            doorPartOptions("door", {
              ...doorLeafMaterialOptions,
              rounded: false,
              roughness: 0.66,
              castShadow: false,
              receiveShadow: false,
            }),
          );
          const splitPanelHandleX =
            splitPanelSign < 0 ? splitPanelWidth * 0.84 : -splitPanelWidth * 0.84;
          (deps.addArchitectureMesh(
            splitPanelGroup,
            [[0.035, 0.055, 0.065, splitPanelHandleX, buildInteriorSceneDoorHeight * 0.5, 0.04]],
            doorPartColor("metal"),
            doorPartOptions("metal", {
              rounded: false,
              metalness: 0.45,
              castShadow: false,
              receiveShadow: false,
            }),
          ),
            doorGroup.add(splitPanelGroup));
        }
        ((doorGroup.userData.optimizationStats = {
          type: "door-double",
          before: 7,
          after: 3,
        }),
          deps.sceneRootNode.add(doorGroup));
        continue;
      }
      const isRightHingeLeaf = currentDoor.hinge === "right",
        foldLeafWidth = Math.max(buildInteriorSceneDoorWidth - doorLeafThickness * 1.4, 0.2),
        foldLeafHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.8, 0.4),
        foldLeafGroup = new ns2.Group();
      ((foldLeafGroup.position.x = isRightHingeLeaf
        ? buildInteriorSceneDoorWidth / 2 - doorLeafThickness * 0.5
        : -buildInteriorSceneDoorWidth / 2 + doorLeafThickness * 0.5),
        (foldLeafGroup.rotation.y = doorLeafRotation2(currentDoor, Math.PI * 0.42)),
        buildInteriorSceneIsEmbeddedStage &&
          ((foldLeafGroup.userData.doorHingePivot = true),
          (foldLeafGroup.userData.doorRestRotation = foldLeafGroup.rotation.y)),
        doorGroup.add(foldLeafGroup));
      const foldLeafOffset = isRightHingeLeaf ? -foldLeafWidth / 2 : foldLeafWidth / 2;
      doorType === "glass"
        ? deps.addWindowFrames(
            foldLeafGroup,
            [
              {
                width: foldLeafWidth,
                height: foldLeafHeight,
                centerX: foldLeafOffset,
                centerZ: 0,
              },
            ],
            doorPartColor("frame"),
            doorGlassColor,
          )
        : deps.addArchitectureMesh(
            foldLeafGroup,
            [[foldLeafWidth, foldLeafHeight, 0.04, foldLeafOffset, foldLeafHeight / 2, 0]],
            doorPartColor("door"),
            doorPartOptions("door", {
              ...doorLeafMaterialOptions,
              rounded: false,
              roughness: 0.66,
              castShadow: false,
              receiveShadow: false,
            }),
          );
      const foldLeafHingeOffset = isRightHingeLeaf ? -foldLeafWidth * 0.84 : foldLeafWidth * 0.84;
      (deps.addArchitectureMesh(
        foldLeafGroup,
        [[0.035, 0.055, 0.065, foldLeafHingeOffset, buildInteriorSceneDoorHeight * 0.5, 0.04]],
        doorPartColor("metal"),
        doorPartOptions("metal", {
          rounded: false,
          metalness: 0.45,
          castShadow: false,
          receiveShadow: false,
        }),
      ),
        buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.doorLeafWidth = foldLeafWidth),
          (doorGroup.userData.doorClosedRotation = 0),
          (doorGroup.userData.doorOpenRotation = foldLeafGroup.rotation.y)),
        (doorGroup.userData.optimizationStats = {
          type: doorType === "glass" ? "door-glass" : "door-solid",
          before: doorType === "glass" ? 9 : 5,
          after: doorType === "glass" ? 4 : 3,
        }),
        deps.sceneRootNode.add(doorGroup));
    }
  }
  for (const interiorChildObject of deps.sceneRootNode.children)
    existingChildSet.has(interiorChildObject) ||
      ((interiorChildObject.userData.modelLayer = "architecture"),
      interiorChildObject.traverse((interiorDescendant: any) => {
        interiorDescendant.userData.exportRole || (interiorDescendant.userData.exportRole = "plan");
      }));
}
