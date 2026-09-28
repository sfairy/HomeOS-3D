/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  canonicalPolygonKey,
  clamp,
  clampWindowT,
  doorLeafRotation,
  polygonArea,
  slidingDoorPanelCenters,
  validatedUnionPolygonLoops,
  wallJoinExtensions,
  wallLengthMeters,
  wallSolidPieces
} from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";
import {
  buildPolygonShapes,
  buildWallFootprint,
  offsetPolygonOutward,
  polygonLoopToPath
} from "./studio-plan-geometry.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { windowGeometryParts } from "../plan/studio-window-geometry.js";
import { findDoorMaterial } from "./studio-door-materials.js";
import { buildMergedWallGeometry } from "./studio-mesh-geometry.js";
import {
  createMaterialSurfaceTexture,
  hasMaterialSurfaceTexture
} from "../materials/studio-surface-fabrics.js";
import { STUDIO_PALETTE } from "./studio-config-tables.js";
import { WARM_WOOD_STYLE } from "./studio-scene-style.js";
import {
  createWallSideMaterial,
  setWallCornerDistances,
  setWallGradientHeight
} from "../materials/studio-wall-materials.js";
import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";

export const isStageViewerMode = window.location.pathname === "/api/v1/modules/interaction3d/stage.html";

export const isRegionLightingEnabled =
  isStageViewerMode && new URLSearchParams(location.search).get("lighting") === "region";

export const WALL_RUNTIME_PROFILE = "shader";

export const PREVIEW_OBJECT_LAYER = 2;

export const materialByRenderKey = new Map();

export const wallDerivedCacheByScene = new WeakMap();

/**
 * 判断某个对象是否处于选中态（主选中或多选中任一命中）。场景重建时会对每个对象调用一次，
 */
export function isSelected(selectionKind: any, selectedId: any) {
  return (
    (state.primarySelection?.kind === selectionKind && state.primarySelection.id === selectedId) ||
    state.multiSelection.some(
      (checkedEntry: any) => checkedEntry.kind === selectionKind && checkedEntry.id === selectedId
    )
  );
}

export function wallDerivedData(toleranceMeters: any) {
  const tolerance = Math.max(1, toleranceMeters * 0.01);
  const wallSignature = state.activeScene.walls
    .map(
      (signatureWall: any) =>
        signatureWall.id +
        "," +
        signatureWall.start.x +
        "," +
        signatureWall.start.y +
        "," +
        signatureWall.end.x +
        "," +
        signatureWall.end.y +
        "," +
        signatureWall.thickness +
        "," +
        (signatureWall.allowOpenEnd === true ? 1 : 0)
    )
    .join(";");
  let derivedCache = wallDerivedCacheByScene.get(state.activeScene);
  if (!derivedCache || derivedCache.signature !== tolerance + "|" + wallSignature) {
    derivedCache = {
      signature: tolerance + "|" + wallSignature,
      tolerance: tolerance,
      floorPolygons: null,
      intersections: null,
      joinExtensions: null,
      unclosedEndpoints: null
    };
    wallDerivedCacheByScene.set(state.activeScene, derivedCache);
  }
  return derivedCache;
}

/**
 * 取（并缓存）墙端为拼接平齐所需的延伸量（L / T 形接口补角用）。
 */
export function wallJoinExtensionsForWalls(joinToleranceMeters: any) {
  const joinDerived = wallDerivedData(joinToleranceMeters);
  joinDerived.joinExtensions ||= wallJoinExtensions(state.activeScene.walls);
  return joinDerived.joinExtensions;
}

/**
 * 取 3D 工作台场景调色板（背景、地面、墙、地板、门窗等硬编码色值的唯一出处）。包成函数是为了
 */
export function studioPalette(): any {
  if (state.studioSceneStyle === "warm-wood") {
    return {
      ...STUDIO_PALETTE,
      ...WARM_WOOD_STYLE,
      // 暖阳原木本来就同时启用「家居」与「场景」两张色卡；家居换色分支改看 warmFurniture 之后，
      warmFurniture: true
    };
  }
  return STUDIO_PALETTE;
}

/**
 * @returns {THREE.MeshStandardMaterial} 共享材质实例。
 */
export function resolveSharedWallMaterial(wallColor: any, wallMaterialOptions: any = {}) {
  const wallColorHex = new threeModuleMin.Color(wallColor).getHex();
  const wallMaterialCacheKey = JSON.stringify([
    wallColorHex,
    wallMaterialOptions.roughness ?? 0.8,
    wallMaterialOptions.metalness ?? 0.01,
    !!wallMaterialOptions.transparent,
    wallMaterialOptions.opacity ?? 1,
    wallMaterialOptions.depthWrite ?? true,
    wallMaterialOptions.depthFunc ?? threeModuleMin.LessEqualDepth,
    wallMaterialOptions.side ?? threeModuleMin.FrontSide,
    wallMaterialOptions.emissive ?? 0,
    wallMaterialOptions.emissiveIntensity ?? 0,
    // 质感贴图与它的平铺密度：贴图按 surface 全局缓存，这里只需把「取哪张、铺几次」记进键，
    wallMaterialOptions.surface ?? null,
    wallMaterialOptions.surfaceRepeat ?? null
  ]);
  if (!materialByRenderKey.has(wallMaterialCacheKey)) {
    const wallMaterial = new threeModuleMin.MeshStandardMaterial({
      color: wallColorHex,
      roughness: wallMaterialOptions.roughness ?? 0.8,
      metalness: wallMaterialOptions.metalness ?? 0.01,
      transparent: !!wallMaterialOptions.transparent,
      opacity: wallMaterialOptions.opacity ?? 1,
      depthWrite: wallMaterialOptions.depthWrite ?? true,
      depthFunc: wallMaterialOptions.depthFunc ?? threeModuleMin.LessEqualDepth,
      side: wallMaterialOptions.side ?? threeModuleMin.FrontSide,
      emissive: wallMaterialOptions.emissive ?? 0,
      emissiveIntensity: wallMaterialOptions.emissiveIntensity ?? 0
    });
    // 只有声明了质感族、且该族确实有画法时才挂贴图（漆面 / 陶瓷 / 玻璃都没有，硬塞一张噪点图
    if (wallMaterialOptions.surface && hasMaterialSurfaceTexture(wallMaterialOptions.surface)) {
      const wallSurfaceTexture = createMaterialSurfaceTexture(
        threeModuleMin,
        wallMaterialOptions.surface,
        {
          maxAnisotropy: studioMaxTextureAnisotropy(),
          repeat: wallMaterialOptions.surfaceRepeat ?? 2
        }
      );
      if (wallSurfaceTexture) {
        wallMaterial.map = wallSurfaceTexture;
      }
    }
    materialByRenderKey.set(wallMaterialCacheKey, wallMaterial);
  }
  return materialByRenderKey.get(wallMaterialCacheKey);
}

/**
 * 把门材质档位的配方并入墙带材质参数：配方只声明它要覆盖的那几项（质感族 / 粗糙度 / 金属度 /
 */
export function doorMaterialRecipeOptions(baseOptions: any, materialRecipe: any) {
  if (!materialRecipe) {
    return baseOptions;
  }
  const mergedOptions = { ...baseOptions };
  if (Number.isFinite(materialRecipe.roughness)) {
    mergedOptions.roughness = materialRecipe.roughness;
  }
  if (Number.isFinite(materialRecipe.metalness)) {
    mergedOptions.metalness = materialRecipe.metalness;
  }
  if (materialRecipe.surface) {
    mergedOptions.surface = materialRecipe.surface;
    mergedOptions.surfaceRepeat = materialRecipe.repeat ?? null;
  }
  return mergedOptions;
}

export function doorMaterialRecipeColor(baseColor: any, materialRecipe: any) {
  return materialRecipe && Number.isFinite(materialRecipe.color)
    ? materialRecipe.color
    : baseColor;
}

export function addWallBandMesh(architectureRoot: any, wallBands: any, wallMaterialColor: any, wallMeshOptions: any = {}) {
  const wallGeometry = buildMergedWallGeometry(wallBands);
  if (!wallGeometry) {
    return null;
  }
  const wallMesh = new threeModuleMin.Mesh(
    wallGeometry,
    resolveSharedWallMaterial(wallMaterialColor, wallMeshOptions)
  );
  wallMesh.castShadow = wallMeshOptions.castShadow !== false;
  wallMesh.receiveShadow = wallMeshOptions.receiveShadow !== false;
  wallMesh.renderOrder = wallMeshOptions.renderOrder ?? 0;
  wallMesh.userData.architectureSharedGeometry = true;
  wallMesh.userData.architectureSharedMaterial = true;
  architectureRoot.add(wallMesh);
  return wallMesh;
}

export function addWindowFrameMeshes(
  frameParent: any,
  windowPanes: any,
  frameColor: any,
  glassColor: any,
  frameRecipe: any = null,
  glassRecipe: any = null
) {
  // frameRecipe / glassRecipe 是门材质档位给的配方（窗调用不传，行为与从前逐值相同）：
  const frameOptions = doorMaterialRecipeOptions(
    {
      rounded: false,
      metalness: 0.18,
      roughness: 0.36,
      castShadow: false,
      receiveShadow: false
    },
    frameRecipe
  );
  const glassPaneBoxes = [];
  const frameBarBoxes = [];
  for (const windowPane of windowPanes) {
    const paneInset = Math.min(0.045, windowPane.width * 0.08, windowPane.height * 0.04);
    const paneWidth = Math.max(windowPane.width - paneInset * 2, 0.04);
    const paneHeight = Math.max(windowPane.height - paneInset * 2, 0.08);
    glassPaneBoxes.push([
      paneWidth,
      paneHeight,
      0.018,
      windowPane.centerX,
      windowPane.height / 2,
      windowPane.centerZ
    ]);
    frameBarBoxes.push(
      [windowPane.width, paneInset, 0.045, windowPane.centerX, paneInset / 2, windowPane.centerZ],
      [
        windowPane.width,
        paneInset,
        0.045,
        windowPane.centerX,
        windowPane.height - paneInset / 2,
        windowPane.centerZ
      ],
      [
        paneInset,
        windowPane.height,
        0.045,
        windowPane.centerX - windowPane.width / 2 + paneInset / 2,
        windowPane.height / 2,
        windowPane.centerZ
      ],
      [
        paneInset,
        windowPane.height,
        0.045,
        windowPane.centerX + windowPane.width / 2 - paneInset / 2,
        windowPane.height / 2,
        windowPane.centerZ
      ]
    );
  }
  // 暖阳原木：窗玻璃略降不透明度、略提金属度，让室内暖光在玻璃上留一层散射感，
  const isWarmWoodGlass = !!studioPalette().warmWood;
  const glassPaneOptions = doorMaterialRecipeOptions(
    {
      rounded: false,
      transparent: true,
      opacity: isWarmWoodGlass ? 0.2 : 0.24,
      depthWrite: false,
      side: threeModuleMin.DoubleSide,
      roughness: 0.08,
      metalness: isWarmWoodGlass ? 0.04 : 0.03,
      castShadow: false,
      receiveShadow: false,
      renderOrder: 7
    },
    glassRecipe
  );
  // 玻璃档位可用 opacity 覆盖通透度（茶玻比清玻更实）；不写时沿用上面的暖阳 / 默认值。
  if (glassRecipe && Number.isFinite(glassRecipe.opacity)) {
    glassPaneOptions.opacity = glassRecipe.opacity;
  }
  for (const glassPaneBox of glassPaneBoxes) {
    addWallBandMesh(frameParent, [glassPaneBox], glassColor, glassPaneOptions);
  }
  addWallBandMesh(frameParent, frameBarBoxes, frameColor, frameOptions);
}

/**
 * 取渲染器支持的最大各向异性过滤倍数，取不到时按 1 处理（即不做各向异性过滤）。
 * @returns {number} 最大各向异性倍数。
 */
export function studioMaxTextureAnisotropy() {
  return state.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
}

export function makeWallSideMaterial(sideColor: any, sideOpacity: any, wallSideMaterialOptions: any = {}) {
  const isSideOpaque = sideOpacity >= 0.999;
  const isAlphaBand = isRegionLightingEnabled && !isSideOpaque;
  // 暖阳原木：墙面靠更强的自发光（0.32）撑起整体亮度，墙脚渐变也换成几乎不压暗的版本；
  const isWarmCleanWall =
    !!studioPalette().warmWood && wallSideMaterialOptions.polygonOffset !== true;
  // 工作室预览不走舞台那套正面专用墙面 shader：半透明挤出体若用 DoubleSide +
  const createdWallSideMaterial = createWallSideMaterial(
    threeModuleMin,
    {
      color: sideColor,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.82,
      transmission: 0,
      thickness: 0.1,
      ior: 1.22,
      transparent: !isSideOpaque,
      opacity: sideOpacity,
      depthWrite: wallSideMaterialOptions.depthWrite ?? true,
      depthFunc:
        wallSideMaterialOptions.depthFunc ??
        (isSideOpaque ? threeModuleMin.LessEqualDepth : threeModuleMin.LessDepth),
      polygonOffset: wallSideMaterialOptions.polygonOffset === true,
      polygonOffsetFactor: wallSideMaterialOptions.polygonOffsetFactor ?? -2,
      polygonOffsetUnits: wallSideMaterialOptions.polygonOffsetUnits ?? -4,
      side: threeModuleMin.FrontSide,
      emissive: wallSideMaterialOptions.emissive ?? sideColor,
      emissiveIntensity: wallSideMaterialOptions.emissiveIntensity ?? (isWarmCleanWall ? 0.32 : 0.025)
    },
    wallSideMaterialOptions.polygonOffset !== true,
    isRegionLightingEnabled ? WALL_RUNTIME_PROFILE : "single,depth",
    isWarmCleanWall
  );
  createdWallSideMaterial.userData.alphaWallBand = isAlphaBand;
  return createdWallSideMaterial;
}

/**
 * @returns {object} 已置 visible=false 的 MeshBasicMaterial。
 */
export function createInvisibleWallMaterial() {
  const invisibleWallMaterial = new threeModuleMin.MeshBasicMaterial();
  invisibleWallMaterial.visible = false;
  return invisibleWallMaterial;
}

export function createWallTopMaterial(topBaseColor: any, topOpacity: any, topMaterialOptions: any = {}) {
  const isWarmWood = !!studioPalette().warmWood;
  const isTopOpaque = topOpacity >= 0.999;
  const topColor = new threeModuleMin.Color(topMaterialOptions.topColor ?? topBaseColor);
  if (isWallShaderTrialEnabled() && topMaterialOptions.polygonOffset !== true) {
    topColor.multiplyScalar(1.2);
  }
  return new threeModuleMin.MeshStandardMaterial({
    color: topColor,
    roughness: 0.76,
    metalness: 0,
    transparent: !isTopOpaque,
    opacity: topMaterialOptions.topOpacity ?? (isTopOpaque ? 1 : Math.min(topOpacity * 1.08, 0.42)),
    depthWrite: topMaterialOptions.depthWrite ?? true,
    depthFunc:
      topMaterialOptions.depthFunc ??
      (isTopOpaque ? threeModuleMin.LessEqualDepth : threeModuleMin.LessDepth),
    polygonOffset: topMaterialOptions.polygonOffset === true,
    polygonOffsetFactor: topMaterialOptions.polygonOffsetFactor ?? -2,
    polygonOffsetUnits: topMaterialOptions.polygonOffsetUnits ?? -4,
    // ShapeGeometry 会被旋转到 XZ 平面、法线朝下，因此保持 DoubleSide，
    side: threeModuleMin.DoubleSide,
    emissive: topMaterialOptions.emissive ?? topMaterialOptions.topColor ?? topBaseColor,
    // 暖阳原木且未走 polygonOffset 特例时，顶面条带自发光抬到 0.18：
    emissiveIntensity: topMaterialOptions.emissiveIntensity
      ? topMaterialOptions.emissiveIntensity * 0.3
      : isWarmWood && topMaterialOptions.polygonOffset !== true
        ? 0.18
        : 0.08
  });
}

export function addWallExtrusion(
  extrusionLoops: any,
  baseY: any,
  topY: any,
  extrusionColor: any,
  extrusionOpacity: any,
  extrusionOptions: any = {}
) {
  if (!extrusionLoops.length || topY - baseY <= 0.000001) {
    return;
  }
  const extrusionUnionLoops = validatedUnionPolygonLoops(extrusionLoops, 0.000001);
  const hasExtrusionUnionLoops = extrusionUnionLoops.length > 0;
  const extrusionShapeLoops = buildPolygonShapes(
    hasExtrusionUnionLoops ? extrusionUnionLoops : extrusionLoops
  );
  const meshSideMaterialOptions =
    !hasExtrusionUnionLoops && extrusionOpacity < 0.999 && extrusionOptions.depthWrite === undefined
      ? {
          ...extrusionOptions,
          depthWrite: true,
          depthFunc: threeModuleMin.LessDepth
        }
      : extrusionOptions;
  for (const extrusionShapeLoop of extrusionShapeLoops) {
    const extrudedWallGeometry = new threeModuleMin.ExtrudeGeometry(extrusionShapeLoop, {
      depth: topY - baseY,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    setWallGradientHeight(
      threeModuleMin,
      extrudedWallGeometry,
      "z",
      topY,
      -1,
      state.activeScene.settings.wallHeight
    );
    if (isWallShaderTrialEnabled() && extrusionOptions.polygonOffset !== true) {
      const extractedPoints = extrusionShapeLoop.extractPoints(1);
      setWallCornerDistances(threeModuleMin, extrudedWallGeometry, [
        extractedPoints.shape,
        ...extractedPoints.holes
      ]);
    }
    const invisibleMaterial = createInvisibleWallMaterial();
    const sideMaterial = makeWallSideMaterial(
      extrusionColor,
      extrusionOpacity,
      meshSideMaterialOptions
    );
    const extrudedWallMesh = new threeModuleMin.Mesh(extrudedWallGeometry, [
      invisibleMaterial,
      sideMaterial
    ]);
    extrudedWallMesh.userData.reflectionRole = "wall";
    extrudedWallMesh.rotation.x = Math.PI / 2;
    extrudedWallMesh.position.y = topY;
    const receivesShadow = extrusionOpacity >= 0.999;
    extrudedWallMesh.castShadow = extrusionOptions.castShadow === true;
    if (extrusionOptions.lightOccluder) {
      extrudedWallMesh.layers.set(PREVIEW_OBJECT_LAYER);
    }
    extrudedWallMesh.receiveShadow = receivesShadow;
    extrudedWallMesh.renderOrder = extrusionOptions.renderOrder ?? 4;
    state.previewModelRoot.add(extrudedWallMesh);
  }
}

export function addPlanBandMesh(bandLoops: any, wallBandY: any, bandColor: any, bandOpacity: any, bandOptions: any = {}) {
  if (!bandLoops.length) {
    return;
  }
  const bandUnionLoops = validatedUnionPolygonLoops(bandLoops, 0.000001);
  const hasBandUnionLoops = bandUnionLoops.length > 0;
  const bandShapeLoops = buildPolygonShapes(hasBandUnionLoops ? bandUnionLoops : bandLoops);
  const materialOptions =
    !hasBandUnionLoops && bandOpacity < 0.999 && bandOptions.depthWrite === undefined
      ? {
          ...bandOptions,
          depthWrite: true,
          depthFunc: threeModuleMin.LessDepth
        }
      : bandOptions;
  for (const bandShapeLoop of bandShapeLoops) {
    const bandGeometry = new threeModuleMin.ShapeGeometry(bandShapeLoop, 1);
    const bandMaterial = createWallTopMaterial(bandColor, bandOpacity, materialOptions);
    const bandMesh = new threeModuleMin.Mesh(bandGeometry, bandMaterial);
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.position.y = wallBandY + 0.0005;
    bandMesh.userData.reflectionRole = "wall";
    bandMesh.castShadow = false;
    bandMesh.receiveShadow = false;
    bandMesh.renderOrder = bandOptions.renderOrder ?? 4;
    if (isStageViewerMode && bandMaterial.transparent) {
      bandMaterial.forceSinglePass = true;
    }
    state.previewModelRoot.add(bandMesh);
  }
}

export function addFloorContactShadow(shadowPolygons: any, shadowSurfaceY: any) {
  if (!shadowPolygons.length || isWallShaderTrialEnabled()) {
    return;
  }
  const shapes = shadowPolygons.map((shadowSourcePolygon: any) => {
    const offsetPolygon = offsetPolygonOutward(shadowSourcePolygon, 0.028);
    const orientedPolygon =
      polygonArea(offsetPolygon) >= 0 ? offsetPolygon : [...offsetPolygon].reverse();
    return polygonLoopToPath(threeModuleMin.Shape, orientedPolygon);
  });
  const geometries = shapes.map((shadowShape: any) => {
    const shapeGeometry = new threeModuleMin.ShapeGeometry(shadowShape, 1);
    shapeGeometry.rotateX(Math.PI / 2);
    shapeGeometry.translate(0, shadowSurfaceY, 0);
    return shapeGeometry;
  });
  const shadowMergedGeometry = mergeGeometries(geometries);
  geometries.forEach((shapePartGeometry: any) => shapePartGeometry.dispose());
  if (!shadowMergedGeometry) {
    return;
  }
  const contactShadowMesh = new threeModuleMin.Mesh(
    shadowMergedGeometry,
    new threeModuleMin.MeshBasicMaterial({
      color: 527122,
      transparent: true,
      opacity: 0.052,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      toneMapped: false,
      side: threeModuleMin.DoubleSide
    })
  );
  contactShadowMesh.renderOrder = 1;
  contactShadowMesh.userData.batchedWallContactShadowCount = shapes.length;
  state.previewModelRoot.add(contactShadowMesh);
}

/**
 * 判断是否启用墙面试验着色器。此前 `?wall-trial=...` 可覆盖编译期默认值、不必重新构建就能对比
 * @returns {boolean} true 表示走试验着色器分支。
 */
export function isWallShaderTrialEnabled() {
  return isRegionLightingEnabled && WALL_RUNTIME_PROFILE === "shader";
}

export function buildArchitectureLayer({
  ppm: architecturePixelsPerMeter,
  toWorld: architectureToWorld,
  floorSurfaceY: architectureSurfaceY
}: any) {
  const architecturePalette = studioPalette();
  const existingChildren = new Set(state.previewModelRoot.children);
  const wallOpenings = [
    ...state.activeScene.windows,
    ...state.activeScene.doors.map((sourceDoor: any) => ({
      ...sourceDoor,
      sill: 0
    })),
    ...state.activeScene.railings.map((sourceRailing: any) => {
      const railingHostWall = state.activeScene.walls.find(
        (railingWallSpec: any) => railingWallSpec.id === sourceRailing.wallId
      );
      return {
        ...sourceRailing,
        sill: 0,
        height: railingHostWall?.height || state.activeScene.settings.wallHeight
      };
    })
  ];
  const wallVolumes = [];
  const seenVolumeKeys = new Set();
  const joinExtensionsByWallId = wallJoinExtensionsForWalls(architecturePixelsPerMeter);
  for (const loopedWall of state.activeScene.walls) {
    // 墙体透明度覆盖（舞台下发）优先于户型 / 单墙设置；null 表示不覆盖。
    const wallOpacity =
      state.wallOpacityOverride ??
      (loopedWall.opacity === null || loopedWall.opacity === undefined
        ? state.activeScene.settings.wallOpacity
        : clamp(finite(loopedWall.opacity, state.activeScene.settings.wallOpacity), 0, 1));
    for (const loopedSolidPiece of wallSolidPieces(
      loopedWall,
      wallOpenings,
      architecturePixelsPerMeter,
      loopedWall.height
    )) {
      const footprint = buildWallFootprint(
        loopedWall,
        loopedSolidPiece,
        architectureToWorld,
        joinExtensionsByWallId[loopedWall.id]
      );
      if (!footprint) {
        continue;
      }
      const volumeKey = [
        canonicalPolygonKey(footprint, 4),
        loopedSolidPiece.bottom.toFixed(5),
        loopedSolidPiece.top.toFixed(5),
        wallOpacity.toFixed(4)
      ].join("|");
      if (!seenVolumeKeys.has(volumeKey)) {
        seenVolumeKeys.add(volumeKey);
        wallVolumes.push({
          wallId: loopedWall.id,
          footprint: footprint,
          bottom: loopedSolidPiece.bottom,
          top: loopedSolidPiece.top,
          opacity: wallOpacity
        });
      }
    }
  }
  const wallBandHeights = [
    ...new Set(
      wallVolumes
        .flatMap(flatVolume => [flatVolume.bottom, flatVolume.top])
        .map(heightText => heightText.toFixed(6))
    )
  ]
    .map(Number)
    .sort((firstHeight, secondHeight) => firstHeight - secondHeight);
  addFloorContactShadow(
    wallVolumes
      .filter(groundVolume => groundVolume.bottom <= 0.000001)
      .map(groundVolumeEntry => groundVolumeEntry.footprint),
    architectureSurfaceY + 0.0025
  );
  for (let bandIndex = 0; bandIndex < wallBandHeights.length - 1; bandIndex += 1) {
    const bandBottomY = wallBandHeights[bandIndex];
    const bandTopY = wallBandHeights[bandIndex + 1];
    if (bandTopY - bandBottomY <= 0.000001) {
      continue;
    }
    // 取该层高度的中点来判断哪些墙段在这一层里是实心的（墙体的上下界跨过中点）。
    const bandMidY = (bandBottomY + bandTopY) / 2;
    const bandVolumes = wallVolumes.filter(
      midVolume => bandMidY > midVolume.bottom - 0.000001 && bandMidY < midVolume.top + 0.000001
    );
    const volumesByOpacity = new Map();
    for (const bandVolume of bandVolumes) {
      const opacityKey = bandVolume.opacity.toFixed(4);
      if (!volumesByOpacity.has(opacityKey)) {
        volumesByOpacity.set(opacityKey, {
          opacity: bandVolume.opacity,
          volumes: []
        });
      }
      volumesByOpacity.get(opacityKey).volumes.push(bandVolume);
    }
    for (const opacityGroup of volumesByOpacity.values()) {
      addWallExtrusion(
        opacityGroup.volumes.map((groupVolumeEntry: any) => groupVolumeEntry.footprint),
        bandBottomY,
        bandTopY,
        architecturePalette.wall,
        opacityGroup.opacity,
        {
          castShadow: true,
          lightOccluder: true
        }
      );
      const topBandFootprints = opacityGroup.volumes
        .filter((topVolume: any) => Math.abs(topVolume.top - bandTopY) <= 0.000001)
        .map((topVolumeEntry: any) => topVolumeEntry.footprint);
      addPlanBandMesh(topBandFootprints, bandTopY, architecturePalette.wall, opacityGroup.opacity, {
        // 暖阳原木：墙顶压条换成更浅的墙顶色，与提亮后的墙面拉开层次。
        topColor: architecturePalette.warmWood
          ? architecturePalette.wallTop
          : architecturePalette.wall
      });
    }
    const selectedBandFootprints = bandVolumes
      .filter(selectedVolume => isSelected("wall", selectedVolume.wallId))
      .map(selectedVolumeEntry => selectedVolumeEntry.footprint);
    if (selectedBandFootprints.length) {
      addWallExtrusion(
        selectedBandFootprints,
        bandBottomY,
        bandTopY,
        architecturePalette.accent,
        0.28,
        {
          depthWrite: false,
          depthFunc: threeModuleMin.LessEqualDepth,
          polygonOffset: true,
          emissive: architecturePalette.accent,
          emissiveIntensity: 0.12,
          renderOrder: 5
        }
      );
      const selectedTopBandFootprints = bandVolumes
        .filter(
          selectedTopVolume =>
            isSelected("wall", selectedTopVolume.wallId) &&
            Math.abs(selectedTopVolume.top - bandTopY) <= 0.000001
        )
        .map(selectedTopVolumeEntry => selectedTopVolumeEntry.footprint);
      addPlanBandMesh(selectedTopBandFootprints, bandTopY, architecturePalette.accent, 0.28, {
        depthWrite: false,
        depthFunc: threeModuleMin.LessEqualDepth,
        polygonOffset: true,
        emissive: architecturePalette.accent,
        emissiveIntensity: 0.12,
        topOpacity: 0.12,
        renderOrder: 6
      });
    }
  }
  for (const openingHostWall of state.activeScene.walls) {
    const wallDeltaX = openingHostWall.end.x - openingHostWall.start.x;
    const wallDeltaY = openingHostWall.end.y - openingHostWall.start.y;
    const hostWallLength = Math.hypot(wallDeltaX, wallDeltaY);
    if (!hostWallLength) {
      continue;
    }
    const wallRotationY = -Math.atan2(wallDeltaY, wallDeltaX);
    for (const loopedWindowSpec of state.activeScene.windows.filter(
      (filteredWindowSpec: any) => filteredWindowSpec.wallId === openingHostWall.id
    )) {
      const windowT = clampWindowT(openingHostWall, loopedWindowSpec, architecturePixelsPerMeter);
      const windowAnchor = {
        x: openingHostWall.start.x + wallDeltaX * windowT,
        y: openingHostWall.start.y + wallDeltaY * windowT
      };
      const windowWorldPoint = architectureToWorld(windowAnchor);
      const windowGroup = new threeModuleMin.Group();
      windowGroup.position.set(windowWorldPoint.x, 0, windowWorldPoint.z);
      windowGroup.rotation.y = wallRotationY;
      const windowWidth = Math.min(
        loopedWindowSpec.width,
        wallLengthMeters(openingHostWall, architecturePixelsPerMeter)
      );
      const windowSillY = clamp(loopedWindowSpec.sill, 0, openingHostWall.height);
      const windowHeight = Math.min(loopedWindowSpec.height, openingHostWall.height - windowSillY);
      const windowParts = windowGeometryParts(
        windowWidth,
        windowHeight,
        windowSillY,
        loopedWindowSpec.hasDivider !== false
      );
      if (!windowParts) {
        continue;
      }
      addWallBandMesh(windowGroup, windowParts.glass, architecturePalette.glass, {
        rounded: false,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: threeModuleMin.DoubleSide,
        roughness: 0.08,
        metalness: 0.04,
        castShadow: false,
        renderOrder: 6
      });
      const windowFrameColor = isSelected("window", loopedWindowSpec.id)
        ? architecturePalette.accent
        : architecturePalette.furniture;
      addWallBandMesh(windowGroup, windowParts.frames, windowFrameColor, {
        rounded: false,
        metalness: 0.15,
        castShadow: false,
        receiveShadow: false
      });
      windowGroup.userData.optimizationStats = {
        type: windowParts.divided ? "window-divided" : "window-plain",
        before: windowParts.divided ? 6 : 5,
        after: 2
      };
      state.previewModelRoot.add(windowGroup);
    }
    for (const loopedRailingSpec of state.activeScene.railings.filter(
      (filteredRailingSpec: any) => filteredRailingSpec.wallId === openingHostWall.id
    )) {
      const railingT = clampWindowT(openingHostWall, loopedRailingSpec, architecturePixelsPerMeter);
      const railingAnchor = {
        x: openingHostWall.start.x + wallDeltaX * railingT,
        y: openingHostWall.start.y + wallDeltaY * railingT
      };
      const railingWorldPoint = architectureToWorld(railingAnchor);
      const railingGroup = new threeModuleMin.Group();
      railingGroup.position.set(railingWorldPoint.x, 0, railingWorldPoint.z);
      railingGroup.rotation.y = wallRotationY;
      const railingWidth = Math.min(
        loopedRailingSpec.width,
        wallLengthMeters(openingHostWall, architecturePixelsPerMeter)
      );
      const railingHeight = Math.min(loopedRailingSpec.height, openingHostWall.height);
      const railingFrameColor = isSelected("railing", loopedRailingSpec.id)
        ? architecturePalette.accent
        : architecturePalette.frame;
      const railingPostThickness = Math.min(Math.max(railingWidth * 0.012, 0.028), 0.05);
      const railingHandleDepth = 0.08;
      const railingGlassHeight = Math.max(
        railingHeight - railingHandleDepth - railingPostThickness * 1.4,
        0.2
      );
      addWallBandMesh(
        railingGroup,
        [
          [
            Math.max(railingWidth - railingPostThickness * 2.4, 0.2),
            railingGlassHeight,
            0.018,
            0,
            railingHandleDepth + railingGlassHeight * 0.5,
            0
          ]
        ],
        architecturePalette.glass,
        {
          rounded: false,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: threeModuleMin.DoubleSide,
          metalness: 0.04,
          roughness: 0.08,
          castShadow: false,
          receiveShadow: false,
          renderOrder: 6
        }
      );
      const railingBandOptions = {
        rounded: false,
        metalness: 0.58,
        roughness: 0.24,
        castShadow: false,
        receiveShadow: false
      };
      const railingPostCount = Math.max(2, Math.min(16, Math.ceil(railingWidth / 1.5) + 1));
      const railingGlassBands = [[railingWidth, railingPostThickness, 0.055, 0, railingHeight, 0]];
      const railingHandleBands = [];
      for (let postIndex = 0; postIndex < railingPostCount; postIndex += 1) {
        const postX = -railingWidth / 2 + (railingWidth * postIndex) / (railingPostCount - 1);
        railingGlassBands.push([
          railingPostThickness,
          railingHeight,
          0.055,
          postX,
          railingHeight * 0.5,
          0
        ]);
        railingHandleBands.push([
          railingPostThickness * 2,
          railingPostThickness * 0.8,
          0.08,
          postX,
          railingPostThickness * 0.4,
          0
        ]);
      }
      addWallBandMesh(railingGroup, railingGlassBands, railingFrameColor, railingBandOptions);
      addWallBandMesh(
        railingGroup,
        railingHandleBands,
        architecturePalette.furnitureSoft,
        railingBandOptions
      );
      railingGroup.userData.optimizationStats = {
        type: "glass-railing",
        before: 2 + railingPostCount * 2,
        after: 3
      };
      state.previewModelRoot.add(railingGroup);
    }
    for (const loopedDoorSpec of state.activeScene.doors.filter(
      (filteredDoorSpec: any) => filteredDoorSpec.wallId === openingHostWall.id
    )) {
      const doorT = clampWindowT(openingHostWall, loopedDoorSpec, architecturePixelsPerMeter);
      const doorAnchor = {
        x: openingHostWall.start.x + wallDeltaX * doorT,
        y: openingHostWall.start.y + wallDeltaY * doorT
      };
      const doorWorldPoint = architectureToWorld(doorAnchor);
      const doorGroup = new threeModuleMin.Group();
      doorGroup.position.set(doorWorldPoint.x, 0, doorWorldPoint.z);
      doorGroup.rotation.y = wallRotationY;
      const doorWidth = Math.min(
        loopedDoorSpec.width,
        wallLengthMeters(openingHostWall, architecturePixelsPerMeter)
      );
      const doorHeight = Math.min(loopedDoorSpec.height, openingHostWall.height);
      const isHostDoorSelected = isSelected("door", loopedDoorSpec.id);
      const hostDoorType = loopedDoorSpec.doorType || "solid";
      // 逐门「材质」档位：auto（未选）时每一处都回落到原来的 architecturePalette，渲染与加这个
      const doorMaterialStyle = findDoorMaterial(hostDoorType, loopedDoorSpec.materialStyle);
      const doorLeafRecipe = doorMaterialStyle?.leaf ?? null;
      const doorFrameRecipe = doorMaterialStyle?.frame ?? null;
      const doorHandleRecipe = doorMaterialStyle?.handle ?? null;
      const doorGlassRecipe = doorMaterialStyle?.glass ?? null;
      // 舞台模式：给门模型根打上环境模型标识与开合类型，运行时锁动画（lock-motion）靠这组
      if (isStageViewerMode) {
        doorGroup.userData.environmentModelId = "door:" + loopedDoorSpec.id;
        doorGroup.userData.environmentModelType = "door";
        doorGroup.userData.environmentFloorId = state.activeFloorId;
        doorGroup.userData.doorAnimationType =
          hostDoorType === "sliding-glass"
            ? "sliding"
            : hostDoorType === "roller-shutter"
              ? "roller"
              : hostDoorType === "frame-only"
                ? "static"
                : "entry";
      }
      const doorFrameColor = isHostDoorSelected
        ? architecturePalette.accent
        : doorMaterialRecipeColor(architecturePalette.frame, doorFrameRecipe);
      const doorFrameThickness = 0.065;
      // 暖阳原木：给实心门扇与卷帘补一层暖色自发光（doorLeaf），让木面在低照度下
      const warmDoorLeafOptions = architecturePalette.warmWood && !doorMaterialStyle
        ? { emissive: architecturePalette.doorLeaf, emissiveIntensity: 0.4 }
        : {};
      const doorFrameOptions = doorMaterialRecipeOptions(
        {
          rounded: false,
          metalness: 0.08,
          castShadow: false,
          receiveShadow: false,
          ...(hostDoorType === "solid" || hostDoorType === "frame-only" ? warmDoorLeafOptions : {})
        },
        doorFrameRecipe
      );
      const doorFrameBands = [
        [doorFrameThickness, doorHeight, 0.09, -doorWidth / 2, doorHeight / 2, 0],
        [doorFrameThickness, doorHeight, 0.09, doorWidth / 2, doorHeight / 2, 0],
        [doorWidth + doorFrameThickness, doorFrameThickness, 0.09, 0, doorHeight, 0]
      ];
      if (hostDoorType === "roller-shutter") {
        const doorSwing = loopedDoorSpec.swing === -1 ? -1 : 1;
        doorFrameBands.push([
          doorWidth + doorFrameThickness * 0.6,
          doorFrameThickness * 1.8,
          0.13,
          0,
          doorHeight - doorFrameThickness * 0.35,
          doorSwing * 0.04
        ]);
      }
      addWallBandMesh(doorGroup, doorFrameBands, doorFrameColor, doorFrameOptions);
      if (hostDoorType === "frame-only") {
        doorGroup.userData.optimizationStats = {
          type: "door-frame-only",
          before: 3,
          after: 1
        };
        state.previewModelRoot.add(doorGroup);
        continue;
      }
      if (hostDoorType === "sliding-glass") {
        const shutterHeight = Math.max(doorHeight - doorFrameThickness * 0.85, 0.4);
        const slidingPanelWidth = Math.max(doorWidth * 0.54, 0.28);
        const doorHinge = loopedDoorSpec.hinge === "right" ? 1 : -1;
        // 内外翻转：两扇推拉门整体镜像到墙的另一面。
        const slidingPanelFlipSign = loopedDoorSpec.swing === -1 ? -1 : 1;
        const slidingPanelPositions = slidingDoorPanelCenters(doorWidth, doorHinge);
        if (isStageViewerMode) {
          // 舞台模式：两扇门各放进一个枢轴 Group，运行时只平移「活动扇」。活动扇的关门位
          const slidingFixedClosedX = slidingPanelPositions.fixed;
          const slidingMovingClosedX = -slidingPanelPositions.fixed;
          const slidingFixedPanelGroup = new threeModuleMin.Group();
          doorGroup.add(slidingFixedPanelGroup);
          addWindowFrameMeshes(
            slidingFixedPanelGroup,
            [
              {
                width: slidingPanelWidth,
                height: shutterHeight,
                centerX: slidingFixedClosedX,
                centerZ: -0.024 * slidingPanelFlipSign
              }
            ],
            doorFrameColor,
            doorMaterialRecipeColor(architecturePalette.glass, doorGlassRecipe),
            doorFrameRecipe,
            doorGlassRecipe
          );
          const slidingMovingPanelGroup = new threeModuleMin.Group();
          slidingMovingPanelGroup.userData.doorSlidePivot = true;
          slidingMovingPanelGroup.userData.doorRestTranslation = 0;
          doorGroup.add(slidingMovingPanelGroup);
          addWindowFrameMeshes(
            slidingMovingPanelGroup,
            [
              {
                width: slidingPanelWidth,
                height: shutterHeight,
                centerX: slidingMovingClosedX,
                centerZ: 0.024 * slidingPanelFlipSign
              }
            ],
            doorFrameColor,
            doorMaterialRecipeColor(architecturePalette.glass, doorGlassRecipe),
            doorFrameRecipe,
            doorGlassRecipe
          );
          const slidingHandleX = slidingMovingClosedX - doorHinge * slidingPanelWidth * 0.36;
          addWallBandMesh(
            slidingMovingPanelGroup,
            [
              [0.026, 0.15, 0.055, slidingHandleX, doorHeight * 0.52, -0.052],
              [0.026, 0.15, 0.055, slidingHandleX, doorHeight * 0.52, 0.052]
            ],
            doorMaterialRecipeColor(architecturePalette.furnitureDark, doorHandleRecipe),
            doorMaterialRecipeOptions(
              {
                rounded: false,
                metalness: 0.5,
                castShadow: false,
                receiveShadow: false
              },
              doorHandleRecipe
            )
          );
          // 活动扇沿门宽 0.46 倍滑出：铰链居右向 +x、居左向 -x（与两扇的镜像摆位一致）。
          doorGroup.userData.doorSlideOpenTranslation = doorHinge * doorWidth * 0.46;
          doorGroup.userData.doorSlideClosedTranslation = 0;
        } else {
          addWindowFrameMeshes(
            doorGroup,
            [
              {
                width: slidingPanelWidth,
                height: shutterHeight,
                centerX: slidingPanelPositions.fixed,
                centerZ: -0.024 * slidingPanelFlipSign
              },
              {
                width: slidingPanelWidth,
                height: shutterHeight,
                centerX: slidingPanelPositions.moving,
                centerZ: 0.024 * slidingPanelFlipSign
              }
            ],
            doorFrameColor,
            doorMaterialRecipeColor(architecturePalette.glass, doorGlassRecipe),
            doorFrameRecipe,
            doorGlassRecipe
          );
          const slidingHandleX = slidingPanelPositions.moving - doorHinge * slidingPanelWidth * 0.36;
          addWallBandMesh(
            doorGroup,
            [
              [0.026, 0.15, 0.055, slidingHandleX, doorHeight * 0.52, -0.052],
              [0.026, 0.15, 0.055, slidingHandleX, doorHeight * 0.52, 0.052]
            ],
            doorMaterialRecipeColor(architecturePalette.furnitureDark, doorHandleRecipe),
            doorMaterialRecipeOptions(
              {
                rounded: false,
                metalness: 0.5,
                castShadow: false,
                receiveShadow: false
              },
              doorHandleRecipe
            )
          );
        }
        doorGroup.userData.optimizationStats = {
          type: "door-sliding-glass",
          before: 15,
          after: 5
        };
        state.previewModelRoot.add(doorGroup);
        continue;
      }
      if (hostDoorType === "roller-shutter") {
        const panelOnlyWidth = Math.max(doorWidth - doorFrameThickness * 1.3, 0.4);
        const panelOnlyHeight = Math.max(doorHeight - doorFrameThickness * 0.85, 0.8);
        const panelSwing = loopedDoorSpec.swing === -1 ? -1 : 1;
        // 舞台模式：门帘（面板 + 叶片）挂到独立的「卷帘枢轴」Group 上，枢轴原点落在门帘底边。
        let rollerLeafParent = doorGroup;
        if (isStageViewerMode) {
          const rollerPanelPivot = new threeModuleMin.Group();
          rollerPanelPivot.userData.doorRollerPivot = true;
          rollerPanelPivot.userData.doorRestTranslation = 0;
          doorGroup.add(rollerPanelPivot);
          // 行程记在门模型根上：运行时先读根、再读枢轴，关门位移只认根。
          doorGroup.userData.doorRollerOpenTranslation = panelOnlyHeight;
          doorGroup.userData.doorRollerClosedTranslation = 0;
          rollerLeafParent = rollerPanelPivot;
        }
        addWallBandMesh(
          rollerLeafParent,
          [[panelOnlyWidth, panelOnlyHeight, 0.045, 0, panelOnlyHeight * 0.5, panelSwing * 0.04]],
          isHostDoorSelected
            ? architecturePalette.accent
            : doorMaterialRecipeColor(architecturePalette.furnitureSoft, doorLeafRecipe),
          doorMaterialRecipeOptions(
            {
              ...warmDoorLeafOptions,
              rounded: false,
              metalness: architecturePalette.warmWood ? 0.08 : 0.36,
              roughness: 0.42,
              castShadow: false,
              receiveShadow: false
            },
            doorLeafRecipe
          )
        );
        const shutterSlatCount = Math.max(5, Math.min(36, Math.round(panelOnlyHeight / 0.12)));
        const shutterSlats = [];
        for (let shutterSlatIndex = 1; shutterSlatIndex < shutterSlatCount; shutterSlatIndex += 1) {
          // 卷帘叶片按等分高度排布：由下往上数第 shutterSlatIndex 条的高度。
          const slatY = (panelOnlyHeight * shutterSlatIndex) / shutterSlatCount;
          shutterSlats.push([panelOnlyWidth * 0.98, 0.012, 0.052, 0, slatY, panelSwing * 0.052]);
        }
        // 叶片取门套那一档的料：与门帘面板同档会让叶片分不出层次（卷帘最怕读成一块整板），
        addWallBandMesh(
          rollerLeafParent,
          shutterSlats,
          doorMaterialRecipeColor(architecturePalette.furnitureDark, doorFrameRecipe),
          doorMaterialRecipeOptions(
            {
              ...warmDoorLeafOptions,
              rounded: false,
              metalness: architecturePalette.warmWood ? 0.08 : 0.42,
              roughness: 0.34,
              castShadow: false,
              receiveShadow: false
            },
            doorFrameRecipe
          )
        );
        doorGroup.userData.optimizationStats = {
          type: "door-roller-shutter",
          before: 5 + shutterSlatCount,
          after: 3
        };
        state.previewModelRoot.add(doorGroup);
        continue;
      }
      if (hostDoorType === "entry") {
        const entryDoorWidth = Math.max(doorWidth - doorFrameThickness * 1.5, 0.4);
        const entryDoorHeight = Math.max(doorHeight - doorFrameThickness * 0.85, 0.8);
        // 门扇本体始终居中；「内外翻转」只把装饰条与把手镜像到墙的另一面 ——
        const entryFlipSign = loopedDoorSpec.swing === -1 ? -1 : 1;
        const entryDoorColor = isHostDoorSelected
          ? architecturePalette.accent
          : doorMaterialRecipeColor(architecturePalette.furnitureDark, doorLeafRecipe);
        // 舞台模式：门扇挂到「合页枢轴」Group 上，枢轴摆在铰链那一侧的门边，扇体几何整体
        let entryLeafParent = doorGroup;
        let entryLeafShiftX = 0;
        if (isStageViewerMode) {
          const entryHingePivot = new threeModuleMin.Group();
          entryHingePivot.position.x =
            (loopedDoorSpec.hinge === "right" ? 1 : -1) * entryDoorWidth * 0.5;
          entryHingePivot.userData.doorHingePivot = true;
          entryHingePivot.userData.entryDoorPivot = true;
          entryHingePivot.userData.doorRestRotation = 0;
          doorGroup.add(entryHingePivot);
          entryLeafParent = entryHingePivot;
          entryLeafShiftX = -entryHingePivot.position.x;
        }
        addWallBandMesh(
          entryLeafParent,
          [[entryDoorWidth, entryDoorHeight, 0.065, entryLeafShiftX, entryDoorHeight * 0.5, 0]],
          entryDoorColor,
          doorMaterialRecipeOptions(
            {
              rounded: false,
              roughness: 0.58,
              metalness: 0.1,
              castShadow: false,
              receiveShadow: false
            },
            doorLeafRecipe
          )
        );
        addWallBandMesh(
          entryLeafParent,
          [
            [entryDoorWidth * 0.76, 0.022, 0.078, entryLeafShiftX, doorHeight * 0.68, 0.012 * entryFlipSign],
            [entryDoorWidth * 0.76, 0.022, 0.078, entryLeafShiftX, doorHeight * 0.34, 0.012 * entryFlipSign]
          ],
          doorMaterialRecipeColor(architecturePalette.furnitureSoft, doorFrameRecipe),
          doorMaterialRecipeOptions(
            {
              rounded: false,
              roughness: 0.5,
              castShadow: false,
              receiveShadow: false
            },
            doorFrameRecipe
          )
        );
        const entryHandleX =
          (loopedDoorSpec.hinge === "right" ? -entryDoorWidth * 0.34 : entryDoorWidth * 0.34) +
          entryLeafShiftX;
        addWallBandMesh(
          entryLeafParent,
          [[0.035, 0.18, 0.085, entryHandleX, doorHeight * 0.5, 0.055 * entryFlipSign]],
          doorMaterialRecipeColor(architecturePalette.furnitureLight, doorHandleRecipe),
          doorMaterialRecipeOptions(
            {
              rounded: false,
              metalness: 0.58,
              roughness: 0.24,
              castShadow: false,
              receiveShadow: false
            },
            doorHandleRecipe
          )
        );
        if (isStageViewerMode) {
          doorGroup.userData.doorLeafWidth = entryDoorWidth;
          doorGroup.userData.entryDoorLeafWidth = entryDoorWidth;
          doorGroup.userData.doorClosedRotation = 0;
        }
        doorGroup.userData.optimizationStats = {
          type: "door-entry",
          before: 7,
          after: 4
        };
        state.previewModelRoot.add(doorGroup);
        continue;
      }
      if (hostDoorType === "double") {
        const doublePanelWidth = Math.max((doorWidth - doorFrameThickness * 1.8) / 2, 0.25);
        const doublePanelHeight = Math.max(doorHeight - doorFrameThickness * 0.8, 0.4);
        // 双开门的开启角度固定为 0.42π（约 75.6°）：既明显敞开，又不会
        const doublePanelAngle = (loopedDoorSpec.swing === -1 ? 1 : -1) * Math.PI * 0.42;
        if (isStageViewerMode) {
          // 舞台模式：两扇各挂一个「合页枢轴」Group，枢轴就地摆在各自门边，开启角 baked 成
          for (const leafSign of [-1, 1]) {
            const leafRotationY = leafSign < 0 ? doublePanelAngle : -doublePanelAngle;
            const leafOffsetX = leafSign < 0 ? doublePanelWidth / 2 : -doublePanelWidth / 2;
            const leafHandleOffsetX =
              leafSign < 0 ? doublePanelWidth * 0.42 : -doublePanelWidth * 0.42;
            const doubleLeafPivot = new threeModuleMin.Group();
            doubleLeafPivot.position.x = leafSign * (doorWidth / 2 - doorFrameThickness * 0.5);
            doubleLeafPivot.rotation.y = leafRotationY;
            doubleLeafPivot.userData.doorHingePivot = true;
            doubleLeafPivot.userData.doorFixedHinge = true;
            doubleLeafPivot.userData.doorRestRotation = leafRotationY;
            doubleLeafPivot.userData.doorOpenRotation = leafRotationY;
            doorGroup.add(doubleLeafPivot);
            addWallBandMesh(
              doubleLeafPivot,
              [
                {
                  width: doublePanelWidth,
                  height: doublePanelHeight,
                  depth: 0.04,
                  x: leafOffsetX,
                  y: doublePanelHeight / 2,
                  z: 0
                }
              ],
              isHostDoorSelected
                ? architecturePalette.accent
                : doorMaterialRecipeColor(architecturePalette.doorLeaf, doorLeafRecipe),
              doorMaterialRecipeOptions(
                {
                  rounded: false,
                  roughness: 0.66,
                  castShadow: false,
                  receiveShadow: false
                },
                doorLeafRecipe
              )
            );
            addWallBandMesh(
              doubleLeafPivot,
              [[0.035, 0.055, 0.065, leafHandleOffsetX, doorHeight * 0.5, 0.04]],
              doorMaterialRecipeColor(architecturePalette.furnitureDark, doorHandleRecipe),
              doorMaterialRecipeOptions(
                {
                  rounded: false,
                  metalness: 0.45,
                  castShadow: false,
                  receiveShadow: false
                },
                doorHandleRecipe
              )
            );
          }
          doorGroup.userData.doorClosedRotation = 0;
        } else {
          const doublePanelLeaves = [];
          const doublePanelHandles = [];
          for (const leafSign of [-1, 1]) {
            const leafX = leafSign * (doorWidth / 2 - doorFrameThickness * 0.5);
            const leafRotationY = leafSign < 0 ? doublePanelAngle : -doublePanelAngle;
            const leafOffsetX = leafSign < 0 ? doublePanelWidth / 2 : -doublePanelWidth / 2;
            const leafPosition = {
              x: leafX + leafOffsetX * Math.cos(leafRotationY),
              z: -leafOffsetX * Math.sin(leafRotationY)
            };
            doublePanelLeaves.push({
              width: doublePanelWidth,
              height: doublePanelHeight,
              depth: 0.04,
              x: leafPosition.x,
              y: doublePanelHeight / 2,
              z: leafPosition.z,
              rotationY: leafRotationY
            });
            const leafHandleOffsetX =
              leafSign < 0 ? doublePanelWidth * 0.42 : -doublePanelWidth * 0.42;
            doublePanelHandles.push({
              width: 0.035,
              height: 0.055,
              depth: 0.065,
              x: leafX + leafHandleOffsetX * Math.cos(leafRotationY) + Math.sin(leafRotationY) * 0.04,
              y: doorHeight * 0.5,
              z: -leafHandleOffsetX * Math.sin(leafRotationY) + Math.cos(leafRotationY) * 0.04,
              rotationY: leafRotationY
            });
          }
          addWallBandMesh(
            doorGroup,
            doublePanelLeaves,
            isHostDoorSelected
              ? architecturePalette.accent
              : doorMaterialRecipeColor(architecturePalette.doorLeaf, doorLeafRecipe),
            doorMaterialRecipeOptions(
              {
                rounded: false,
                roughness: 0.66,
                castShadow: false,
                receiveShadow: false
              },
              doorLeafRecipe
            )
          );
          addWallBandMesh(
            doorGroup,
            doublePanelHandles,
            doorMaterialRecipeColor(architecturePalette.furnitureDark, doorHandleRecipe),
            doorMaterialRecipeOptions(
              {
                rounded: false,
                metalness: 0.45,
                castShadow: false,
                receiveShadow: false
              },
              doorHandleRecipe
            )
          );
        }
        doorGroup.userData.optimizationStats = {
          type: "door-double",
          before: 7,
          after: 3
        };
        state.previewModelRoot.add(doorGroup);
        continue;
      }
      const isHingeRight = loopedDoorSpec.hinge === "right";
      const glassLeafWidth = Math.max(doorWidth - doorFrameThickness * 1.4, 0.2);
      const glassLeafHeight = Math.max(doorHeight - doorFrameThickness * 0.8, 0.4);
      const glassLeafGroup = new threeModuleMin.Group();
      glassLeafGroup.position.x = isHingeRight
        ? doorWidth / 2 - doorFrameThickness * 0.5
        : -doorWidth / 2 + doorFrameThickness * 0.5;
      glassLeafGroup.rotation.y = doorLeafRotation(loopedDoorSpec, Math.PI * 0.42);
      doorGroup.add(glassLeafGroup);
      if (isStageViewerMode) {
        // 舞台模式：这个 leaf Group 本身就是合页枢轴（枢轴位在门边），运行时按根上的
        glassLeafGroup.userData.doorHingePivot = true;
        glassLeafGroup.userData.doorRestRotation = glassLeafGroup.rotation.y;
      }
      const glassLeafCenterX = isHingeRight ? -glassLeafWidth / 2 : glassLeafWidth / 2;
      if (hostDoorType === "glass") {
        addWindowFrameMeshes(
          glassLeafGroup,
          [
            {
              width: glassLeafWidth,
              height: glassLeafHeight,
              centerX: glassLeafCenterX,
              centerZ: 0
            }
          ],
          doorFrameColor,
          doorMaterialRecipeColor(architecturePalette.glass, doorGlassRecipe),
          doorFrameRecipe,
          doorGlassRecipe
        );
      } else {
        addWallBandMesh(
          glassLeafGroup,
          [[glassLeafWidth, glassLeafHeight, 0.04, glassLeafCenterX, glassLeafHeight / 2, 0]],
          isHostDoorSelected
            ? architecturePalette.accent
            : doorMaterialRecipeColor(architecturePalette.doorLeaf, doorLeafRecipe),
          doorMaterialRecipeOptions(
            {
              rounded: false,
              roughness: 0.66,
              castShadow: false,
              receiveShadow: false
            },
            doorLeafRecipe
          )
        );
      }
      const glassHandleX = isHingeRight ? -glassLeafWidth * 0.42 : glassLeafWidth * 0.42;
      addWallBandMesh(
        glassLeafGroup,
        [[0.035, 0.055, 0.065, glassHandleX, doorHeight * 0.5, 0.04]],
        doorMaterialRecipeColor(architecturePalette.furnitureDark, doorHandleRecipe),
        doorMaterialRecipeOptions(
          {
            rounded: false,
            metalness: 0.45,
            castShadow: false,
            receiveShadow: false
          },
          doorHandleRecipe
        )
      );
      if (isStageViewerMode) {
        doorGroup.userData.doorLeafWidth = glassLeafWidth;
        doorGroup.userData.doorClosedRotation = 0;
        doorGroup.userData.doorOpenRotation = glassLeafGroup.rotation.y;
      }
      doorGroup.userData.optimizationStats = {
        type: hostDoorType === "glass" ? "door-glass" : "door-solid",
        before: hostDoorType === "glass" ? 9 : 5,
        after: hostDoorType === "glass" ? 4 : 3
      };
      state.previewModelRoot.add(doorGroup);
    }
  }
  for (const architectureChild of state.previewModelRoot.children) {
    if (!existingChildren.has(architectureChild)) {
      architectureChild.userData.modelLayer = "architecture";
      architectureChild.traverse((architectureNode: any) => {
        architectureNode.userData.exportRole ||= "plan";
      });
    }
  }
}
