import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { courtyardBoundaryPoints as courtyardBoundaryPoints2, sceneContentBounds as sceneContentBounds2, sceneModelOrigin as sceneModelOrigin2 } from "../../../../plan/courtyard-drawing";
import { decorateWarmFloor as decorateWarmFloor2 } from "../../../scene/studio-scene-style";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { clamp as clamp2, selectShadowCastingLightIds as selectShadowCastingLightIds2, spotShadowTextureUnitLimit as spotShadowTextureUnitLimit2 } from "../../../../plan/geometry";
import { drawTrackedText as drawTrackedText2 } from "../../../../plan/studio-plan-drawing";
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2, kelvinToRgbHex as kelvinToRgbHex2, normalizeFullRotation as normalizeFullRotation2, normalizeLabelText as normalizeLabelText2 } from "../../../../loaders/studio-normalization";
import { lampItemTypeSet } from "../../../items/item-catalog";
import type { SceneRebuildOptions } from "../../../types/studio-app-types";
import { lightPresetCatalog } from "../../../lights/studio-app-light-data";
import { addBoxMesh } from "../../../items/studio-mesh-primitives";
import { precompileShaderPrograms } from "../../../scene/studio-shader-precompile";
import { collectSharedMeshRecords } from "../../../items/studio-shared-mesh-records";
import { maxTextureUnitLimit, planLabelAccentAlpha, shadowTextureUnits, reservedTextureUnits, normalizePlanLabelColor } from "../../../scene/studio-scene-payload";
import { mergeStaticItemMeshesCore } from "../../../items/studio-static-item-meshes";
import { addCylinderMesh } from "../../scene/cylinder-mesh";
import { lightSignatureOf } from "../../ui/light-signature";

export function addStripLightPreview(runtime: StudioAppRuntime, stripPreviewParent: any, stripLightItem: any) {
  if (stripLightItem.type !== "striplight") return;
  const stripPreviewGroup = new ns2.Group();
  ((stripPreviewGroup.userData.exportRole = "light-source-preview"),
    (stripPreviewGroup.userData.lightSourcePreview = true),
    (stripPreviewGroup.visible =
      stripLightItem.lightSourceVisible !== false &&
      !runtime.appCtx.pendingRuntimeSettings &&
      runtime.createSelectionRef("item", stripLightItem.id)));
  const stripLightColorHex = kelvinToRgbHex2(stripLightItem.lightTemperature) || 16762219,
    stripLightDepth = clamp2(finite2(stripLightItem.depth, 0.28), 0.1, 8),
    stripLightWidth = clamp2(finite2(stripLightItem.width, 1), 0.1, 8),
    stripLightOffset = clamp2(finite2(stripLightItem.lightRange, 3.5) * 0.16, 0.28, 0.72),
    stripVerticalGroup = new ns2.Group();
  stripVerticalGroup.rotation.z = ns2.MathUtils.degToRad(
    normalizeFullRotation2(stripLightItem.verticalRotation),
  );
  const stripRollGroup = new ns2.Group();
  stripRollGroup.rotation.x = ns2.MathUtils.degToRad(
    normalizeFullRotation2(stripLightItem.stripRollRotation),
  );
  (runtime.configureLightSourcePreview(
    addBoxMesh(
      stripRollGroup,
      stripLightWidth,
      0.014,
      stripLightDepth,
      0,
      -stripLightOffset,
      0,
      stripLightColorHex,
      {
        rounded: false,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        emissive: stripLightColorHex,
        emissiveIntensity: 0.68,
        castShadow: false,
        receiveShadow: false,
      },
    ),
  ),
    runtime.configureLightSourcePreview(
      addCylinderMesh(
        stripRollGroup,
        0.012,
        0.012,
        stripLightOffset,
        0,
        -stripLightOffset * 0.5,
        0,
        stripLightColorHex,
        {
          segments: 10,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          roughness: 0.3,
          emissive: stripLightColorHex,
          emissiveIntensity: 0.8,
        },
      ),
    ));
  const stripLightMesh = new ns2.Mesh(
    new ns2.ConeGeometry(0.045, 0.12, 10),
    new ns2.MeshBasicMaterial({
      color: stripLightColorHex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  ((stripLightMesh.rotation.x = Math.PI),
    stripLightMesh.position.set(0, -stripLightOffset, 0),
    runtime.configureLightSourcePreview(stripLightMesh),
    stripRollGroup.add(stripLightMesh),
    stripVerticalGroup.add(stripRollGroup));
  (stripPreviewGroup.add(stripVerticalGroup), stripPreviewParent.add(stripPreviewGroup));
}

export function applyAccentEmissive(runtime: StudioAppRuntime, accentRoot: any, isAccentActive: any) {
  if (!isAccentActive) return;
  const yt3 = runtime.backgroundSettings();
  accentRoot.traverse((accentObject: any) => {
    const accentMaterials = Array.isArray(accentObject.material)
      ? accentObject.material
      : accentObject.material
        ? [accentObject.material]
        : [];
    for (const accentMaterial of accentMaterials)
      accentMaterial?.isMeshStandardMaterial &&
        ((accentMaterial.emissive = new ns2.Color(yt3.accent)),
        (accentMaterial.emissiveIntensity = 0.32));
  });
}

/** 由铭牌颜色派生底线 / 描边的半透明色，保证描边永远跟字色同源。 */
export function planLabelAccentColor(runtime: StudioAppRuntime, candidateColor: any, alpha = planLabelAccentAlpha) {
  const labelColorHex = normalizePlanLabelColor(candidateColor);
  return (
    "rgba(" +
    Number.parseInt(labelColorHex.slice(1, 3), 16) +
    ", " +
    Number.parseInt(labelColorHex.slice(3, 5), 16) +
    ", " +
    Number.parseInt(labelColorHex.slice(5, 7), 16) +
    ", " +
    alpha +
    ")"
  );
}

export function createPlanLabel(runtime: StudioAppRuntime, labelSpec: any) {
  const labelCanvas = document.createElement("canvas");
  ((labelCanvas.width = 2048), (labelCanvas.height = 640));
  const labelCanvasPainter = labelCanvas.getContext("2d"),
    labelPaintColor = normalizePlanLabelColor(labelSpec.labelColor);
  (labelCanvasPainter!.clearRect(0, 0, labelCanvas.width, labelCanvas.height),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = "left"),
    (labelCanvasPainter!.textBaseline = "middle"));
  const labelTitleText = normalizeLabelText2(labelSpec.title, "家庭总览", 24),
    labelSubtitleText = normalizeLabelText2(labelSpec.subtitle, "HOME PLAN", 36),
    labelTitleX = 115,
    labelTitleFontSize = 184;
  ((labelCanvasPainter!.font = "700 " + labelTitleFontSize + "px sans-serif"),
    drawTrackedText2(
      labelCanvasPainter,
      labelTitleText,
      labelTitleX,
      130,
      labelTitleFontSize * clamp2(finite2(labelSpec.titleSpacing, 1.05), 0, 1.8),
      1340,
    ));
  const labelGlyphX = 1580,
    labelGlyphY = 130,
    labelGlyphSize = 170;
  ((labelCanvasPainter!.fillStyle = labelPaintColor),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelGlyphX, labelGlyphY - labelGlyphSize * 0.58),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.56,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.38,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.38,
      labelGlyphY + labelGlyphSize * 0.5,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.38,
      labelGlyphY + labelGlyphSize * 0.5,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.38,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.56,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.closePath(),
    labelCanvasPainter!.fill(),
    labelCanvasPainter!.save(),
    (labelCanvasPainter!.globalCompositeOperation = "destination-out"),
    labelCanvasPainter!.fillRect(
      labelGlyphX - labelGlyphSize * 0.09,
      labelGlyphY + labelGlyphSize * 0.2,
      labelGlyphSize * 0.18,
      labelGlyphSize * 0.3,
    ),
    labelCanvasPainter!.restore(),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = "left"));
  const labelSubtitleFontSize = 310;
  ((labelCanvasPainter!.font =
    "400 " + labelSubtitleFontSize + 'px "Arial Narrow", Arial, sans-serif'),
    drawTrackedText2(
      labelCanvasPainter,
      labelSubtitleText,
      72,
      410,
      labelSubtitleFontSize * clamp2(finite2(labelSpec.subtitleSpacing, 0.08), 0, 0.6),
      1880,
    ));
  const labelLineStartX = 74,
    labelLineEndX = labelLineStartX + 1880 * clamp2(finite2(labelSpec.lineLength, 0.86), 0.3, 1);
  ((labelCanvasPainter!.strokeStyle = runtime.planLabelAccentColor(labelSpec.labelColor)),
    (labelCanvasPainter!.lineWidth = 16),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelLineStartX, 590),
    labelCanvasPainter!.lineTo(labelLineEndX, 590),
    labelCanvasPainter!.moveTo(labelLineStartX, 566),
    labelCanvasPainter!.lineTo(labelLineStartX, 614),
    labelCanvasPainter!.moveTo(labelLineEndX, 566),
    labelCanvasPainter!.lineTo(labelLineEndX, 614),
    labelCanvasPainter!.stroke());
  const labelTexture = new ns2.CanvasTexture(labelCanvas);
  ((labelTexture.colorSpace = ns2.SRGBColorSpace),
    (labelTexture.anisotropy = Math.min(runtime.appCtx.threeRenderer?.capabilities?.getMaxAnisotropy?.() || 1, 8)),
    (labelTexture.needsUpdate = true));
  const labelPlaneMesh = new ns2.Mesh(
    new ns2.PlaneGeometry(labelSpec.width, labelSpec.depth),
    new ns2.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
      side: ns2.DoubleSide,
      forceSinglePass: runtime.isEmbeddedStage,
    }),
  );
  return (
    (labelPlaneMesh.rotation.x = -Math.PI / 2),
    (labelPlaneMesh.position.y = 0.008),
    (labelPlaneMesh.castShadow = false),
    (labelPlaneMesh.receiveShadow = false),
    (labelPlaneMesh.renderOrder = 8),
    labelPlaneMesh
  );
}

export function collectLightSourceSpecs(runtime: StudioAppRuntime, ) {
  return new Set(
    selectShadowCastingLightIds2(
      runtime.appCtx.studioState.items.map((lightSourceItem) => ({
        id: lightSourceItem.id,
        groupId: lightSourceItem.lightGroupId,
        type: lightSourceItem.type,
        brightness: finite2(
          lightSourceItem.lightBrightness,
          (lightPresetCatalog as any)[lightSourceItem.type]?.brightness || 0,
        ),
        enabled: lampItemTypeSet.has(lightSourceItem.type) && runtime.isLampEnabled(lightSourceItem),
      })),
      maxTextureUnitLimit,
    ),
  );
}

export function countMaterialTextures(runtime: StudioAppRuntime, countedMaterial: any) {
  if (!countedMaterial || countedMaterial.isMeshBasicMaterial || countedMaterial.isShadowMaterial)
    return 0;
  let textureCount = Object.values(countedMaterial).filter(
    (materialValue: any) => materialValue?.isTexture === true,
  ).length;
  return (
    countedMaterial.isMeshPhysicalMaterial &&
      finite2(countedMaterial.transmission, 0) > 0 &&
      (textureCount += 1),
    textureCount
  );
}

export function findMaxMaterialTextures(runtime: StudioAppRuntime, textureSearchRoot = runtime.appCtx.sceneRootNode) {
  let maxTextureUnits = 0;
  return (
    textureSearchRoot?.traverse((textureSearchMesh: any) => {
      if (!textureSearchMesh.isMesh) return;
      const searchMaterials = Array.isArray(textureSearchMesh.material)
        ? textureSearchMesh.material
        : textureSearchMesh.material
          ? [textureSearchMesh.material]
          : [];
      for (const searchMaterial of searchMaterials)
        maxTextureUnits = Math.max(maxTextureUnits, runtime.countMaterialTextures(searchMaterial));
    }),
    runtime.appCtx.threeScene?.environment?.isTexture && (maxTextureUnits += 1),
    maxTextureUnits
  );
}

export function getMaxTextureUnits(runtime: StudioAppRuntime, ) {
  const glHandle = runtime.appCtx.threeRenderer?.getContext?.(),
    maxTextureImageUnits = glHandle?.getParameter?.(glHandle.MAX_TEXTURE_IMAGE_UNITS);
  return Math.max(
    1,
    Math.floor(finite2(maxTextureImageUnits, runtime.appCtx.threeRenderer?.capabilities?.maxTextures || 16)),
  );
}

export function collectShadowCandidates(runtime: StudioAppRuntime, shadowSearchRoot = runtime.appCtx.sceneRootNode) {
  const shadowCandidates: any = [];
  return (
    shadowSearchRoot?.traverse((shadowCandidateLight: any) => {
      if (
        !shadowCandidateLight.isSpotLight ||
        shadowCandidateLight.userData?.shadowCandidate !== true
      )
        return;
      const candidateFloorId = String(shadowCandidateLight.userData?.lightFloorId || ""),
        candidateItemId = String(shadowCandidateLight.userData?.lightItemId || "");
      candidateItemId &&
        shadowCandidates.push({
          id: candidateFloorId + ":" + candidateItemId,
          groupId:
            candidateFloorId + ":" + String(shadowCandidateLight.userData?.lightGroupId || ""),
          type: String(shadowCandidateLight.userData?.lightType || "downlight"),
          brightness: finite2(shadowCandidateLight.userData?.lightBrightness, 0),
          enabled: shadowCandidateLight.visible !== false,
        });
    }),
    shadowCandidates
  );
}

export function setupSceneShadows(runtime: StudioAppRuntime, 
  shadowSetupRoot = runtime.appCtx.sceneRootNode,
  { rebuildAtlas: shouldRebuildAtlas = true } = {},
) {
  if (runtime.isEmbedStageMode)
    return (
      shadowSetupRoot?.traverse((atlasLightObject: any) => {
        atlasLightObject.isLight &&
          atlasLightObject.userData?.lightItemId &&
          ((atlasLightObject.castShadow = false), atlasLightObject.layers.set(30));
      }),
      runtime.appCtx.threeRenderer &&
        ((runtime.appCtx.threeRenderer.domElement.dataset.spotShadowMode = "region"),
        (runtime.appCtx.threeRenderer.domElement.dataset.activeSpotShadows = "0")),
      0
    );
  if (!shadowSetupRoot || !runtime.appCtx.threeRenderer) return 0;
  const xv2 = runtime.getMaxTextureUnits(),
    qv2 = runtime.findMaxMaterialTextures(shadowSetupRoot);
  let nonSpotShadowUnitCount = 0;
  runtime.appCtx.threeScene?.traverse((nonSpotLightObject: any) => {
    nonSpotLightObject.visible !== false &&
      nonSpotLightObject.isLight &&
      !nonSpotLightObject.isSpotLight &&
      nonSpotLightObject.castShadow &&
      (nonSpotShadowUnitCount += 1);
  });
  let hasRectAreaLight = false;
  shadowSetupRoot.traverse((rectAreaLightObject: any) => {
    rectAreaLightObject.visible !== false &&
      rectAreaLightObject.isRectAreaLight &&
      (hasRectAreaLight = true);
  });
  const rectAreaShadowUnits = hasRectAreaLight ? shadowTextureUnits : 0,
    // 分层灯光接管后，面光与方向光阴影都不再走 three 的「每盏灯一个纹理单元」，
    // 而是固定的「面光 2 个 LTC + 方向光 1 层数组纹理」。两者取大值，不能相加：
    // 图集路径与分层路径是互斥的，相加会把预算算得比实际紧张，提前把分层路径关掉。
    controllerAreaUnits = runtime.appCtx.lightPrecompileController?.areaTextureUnits?.() || 0,
    controllerDirectionalUnits =
      runtime.appCtx.lightPrecompileController?.directionalTextureUnits?.() || 0,
    Gw2 = Math.max(rectAreaShadowUnits, controllerAreaUnits),
    availableShadowUnits =
      xv2 -
      qv2 -
      Math.max(nonSpotShadowUnitCount, controllerDirectionalUnits) -
      Gw2 -
      reservedTextureUnits,
    shadowAtlasUnits =
      runtime.appCtx.lightPrecompileController?.textureUnitsFor?.(
        runtime.collectShadowCandidates(shadowSetupRoot).filter(
          (shadowCandidateLight: any) => shadowCandidateLight.enabled,
        ).length,
      ) || 1,
    shadowBudgetChanged = runtime.appCtx.lightPrecompileController?.setBudgetAvailable?.(
      availableShadowUnits >= shadowAtlasUnits,
    ),
    isAtlasFallback = runtime.appCtx.lightPrecompileController?.isFallback?.() === true;
  if (
    !isAtlasFallback &&
    !runtime.appCtx.pendingRuntimeSettings &&
    runtime.appCtx.lightPrecompileController &&
    availableShadowUnits >= shadowAtlasUnits
  ) {
    const schedule = shouldRebuildAtlas || shadowBudgetChanged
        ? runtime.appCtx.lightPrecompileController.schedule(shadowSetupRoot)
        : runtime.collectShadowCandidates(shadowSetupRoot).length,
      sync = runtime.appCtx.lightPrecompileController.sync(shadowSetupRoot),
      domElement7 = runtime.appCtx.threeRenderer.domElement;
    ((domElement7.dataset.fragmentTextureUnits = String(xv2)),
      (domElement7.dataset.materialTextureUnits = String(qv2)),
      (domElement7.dataset.spotShadowLimit = String(schedule)),
      (domElement7.dataset.activeSpotShadows = String(sync)));
    let activeUserLightCount = 0;
    return (
      shadowSetupRoot.traverse((countedUserLight: any) => {
        countedUserLight.isLight &&
          countedUserLight.userData?.lightItemId &&
          countedUserLight.visible !== false &&
          (activeUserLightCount += 1);
      }),
      (domElement7.dataset.activeUserLights = String(activeUserLightCount)),
      sync
    );
  }
  const spotShadowLimit = spotShadowTextureUnitLimit2({
    maxTextureUnits: xv2,
    materialTextureUnits: qv2,
    nonSpotShadowTextureUnits: nonSpotShadowUnitCount,
    rectAreaLightTextureUnits: Gw2,
    reservedTextureUnits: runtime.appCtx.lightPrecompileController
      ? Math.max(reservedTextureUnits, shadowAtlasUnits)
      : reservedTextureUnits,
    hardLimit: maxTextureUnitLimit,
  });
  runtime.appCtx.lightPrecompileController &&
    (runtime.appCtx.pendingRuntimeSettings && runtime.appCtx.lightPrecompileController.setEnabled(false),
    runtime.appCtx.lightPrecompileController.sync(shadowSetupRoot));
  const castShadowLightIdSet = new Set(
    selectShadowCastingLightIds2(runtime.collectShadowCandidates(shadowSetupRoot), spotShadowLimit),
  );
  let appliedSpotShadowCount = 0;
  shadowSetupRoot.traverse((spotShadowLight: any) => {
    if (!spotShadowLight.isSpotLight || !spotShadowLight.userData?.lightItemId) return;
    const spotLightKey =
        String(spotShadowLight.userData?.lightFloorId || "") +
        ":" +
        String(spotShadowLight.userData.lightItemId),
      isSpotShadowEnabled = castShadowLightIdSet.has(spotLightKey);
    ((spotShadowLight.castShadow = isSpotShadowEnabled),
      isSpotShadowEnabled &&
        ((appliedSpotShadowCount += 1),
        spotShadowLight.shadow &&
          !spotShadowLight.shadow.map &&
          (spotShadowLight.shadow.needsUpdate = true)));
  });
  const domElement8 = runtime.appCtx.threeRenderer.domElement;
  ((domElement8.dataset.spotShadowMode = "individual"),
    (domElement8.dataset.fragmentTextureUnits = String(xv2)),
    (domElement8.dataset.materialTextureUnits = String(qv2)),
    (domElement8.dataset.spotShadowLimit = String(spotShadowLimit)),
    (domElement8.dataset.activeSpotShadows = String(appliedSpotShadowCount)));
  let visibleUserLightCount = 0;
  return (
    shadowSetupRoot.traverse((visibleUserLight: any) => {
      visibleUserLight.isLight &&
        visibleUserLight.userData?.lightItemId &&
        visibleUserLight.visible !== false &&
        (visibleUserLightCount += 1);
    }),
    (domElement8.dataset.activeUserLights = String(visibleUserLightCount)),
    appliedSpotShadowCount
  );
}

export function batchSharedMeshes(runtime: StudioAppRuntime, batchSceneRoot: any, batchItemEntries: any) {
  const signatureGroupsByKey = new Map();
  for (const { item: batchItem, group: batchItemGroup } of batchItemEntries) {
    if (
      runtime.instanceTestTypeSet.has(batchItem.type) ||
      (runtime.isEmbeddedStage &&
        [
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(batchItem.type)) ||
      runtime.createSelectionRef("item", batchItem.id)
    )
      continue;
    const kv2 = collectSharedMeshRecords(batchItemGroup);
    if (!kv2) continue;
    const batchSignature = JSON.stringify([
      batchItem.type,
      kv2.map((meshDescriptor: any) => meshDescriptor.signature),
    ]);
    (signatureGroupsByKey.has(batchSignature) || signatureGroupsByKey.set(batchSignature, []),
      signatureGroupsByKey.get(batchSignature).push({
        item: batchItem,
        group: batchItemGroup,
        descriptors: kv2,
      }));
  }
  batchSceneRoot.updateMatrixWorld(true);
  const invert3 = batchSceneRoot.matrixWorld.clone().invert(),
    instanceBatchStats: any[] = [];
  for (const signatureGroup of signatureGroupsByKey.values()) {
    if (signatureGroup.length < 2) continue;
    const descriptorCount = signatureGroup[0].descriptors.length;
    for (let descriptorIndex = 0; descriptorIndex < descriptorCount; descriptorIndex += 1) {
      const mesh = signatureGroup[0].descriptors[descriptorIndex].mesh,
        instanceMaterial = mesh.userData.externalModelSharedMaterial
          ? mesh.material
          : mesh.material.clone(),
        instancedMesh = new ns2.InstancedMesh(
          mesh.geometry,
          instanceMaterial,
          signatureGroup.length,
        );
      ((instancedMesh.name =
        "homeos-instance-" + signatureGroup[0].item.type + "-" + (descriptorIndex + 1)),
        (instancedMesh.castShadow = mesh.castShadow),
        (instancedMesh.receiveShadow = mesh.receiveShadow),
        (instancedMesh.renderOrder = mesh.renderOrder),
        instancedMesh.instanceMatrix.setUsage(ns2.StaticDrawUsage),
        runtime.isEmbeddedStage && (instancedMesh.matrixAutoUpdate = false),
        (instancedMesh.userData.externalModelSharedGeometry = true),
        (instancedMesh.userData.externalModelSharedTextures = true),
        (instancedMesh.userData.externalModelSharedMaterial =
          mesh.userData.externalModelSharedMaterial === true),
        (instancedMesh.userData.modelLayer = "items"),
        (instancedMesh.userData.exportRole = "plan"),
        (instancedMesh.userData.instanceItemType = signatureGroup[0].item.type),
        (instancedMesh.userData.instanceItemIds = signatureGroup.map(
          ({ item: batchItemEntry }: any) => batchItemEntry.id,
        )),
        signatureGroup.forEach(({ descriptors: batchDescriptor }: any, instanceIndex: any) => {
          const multiplyMatrices3 = new ns2.Matrix4().multiplyMatrices(
            invert3,
            batchDescriptor[descriptorIndex].mesh.matrixWorld,
          );
          instancedMesh.setMatrixAt(instanceIndex, multiplyMatrices3);
        }),
        (instancedMesh.instanceMatrix.needsUpdate = true),
        instancedMesh.computeBoundingBox(),
        instancedMesh.computeBoundingSphere(),
        batchSceneRoot.add(instancedMesh));
    }
    for (const { group: batchGroup } of signatureGroup)
      (batchSceneRoot.remove(batchGroup), runtime.disposeObjectTree(batchGroup));
    instanceBatchStats.push({
      type: signatureGroup[0].item.type,
      instances: signatureGroup.length,
      before: signatureGroup.length * descriptorCount,
      after: descriptorCount,
    });
  }
  return (
    (batchSceneRoot.userData.instanceBatchStats = instanceBatchStats),
    runtime.appCtx.threeRenderer?.domElement &&
      ((runtime.appCtx.threeRenderer.domElement.dataset.instanceBatchCount = String(instanceBatchStats.length)),
      (runtime.appCtx.threeRenderer.domElement.dataset.instanceCount = String(
        instanceBatchStats.reduce(
          (instanceCountAccumulator, batchStat) => instanceCountAccumulator + batchStat.instances,
          0,
        ),
      )),
      (runtime.appCtx.threeRenderer.domElement.dataset.instanceDrawCallsSaved = String(
        instanceBatchStats.reduce(
          (savedCountAccumulator, savedStat) =>
            savedCountAccumulator + savedStat.before - savedStat.after,
          0,
        ),
      ))),
    instanceBatchStats
  );
}

/** 静态物品网格合批（原 studio-app 直系声明，P4 搬进 `items/studio-static-item-meshes`，此处只转发句柄）。 */
export function mergeStaticItemMeshes(runtime: StudioAppRuntime, mergeSceneRoot: any, mergeItemEntries: any) {
  return mergeStaticItemMeshesCore(runtime.studioStaticItemMeshesDeps(), mergeSceneRoot, mergeItemEntries);
}

export function collectSharedMaterials(runtime: StudioAppRuntime, ) {
  const sharedMaterialSet = new Set();
  return (
    runtime.appCtx.sceneRootNode?.traverse((sharedMesh: any) => {
      if (!sharedMesh.isMesh || !sharedMesh.userData.externalModelSharedGeometry) return;
      const meshMaterials = Array.isArray(sharedMesh.material)
        ? sharedMesh.material
        : sharedMesh.material
          ? [sharedMesh.material]
          : [];
      for (const sharedMaterial of meshMaterials)
        sharedMaterial &&
          !runtime.disposedMaterialSet.has(sharedMaterial) &&
          sharedMaterialSet.add(sharedMaterial);
    }),
    [...sharedMaterialSet]
  );
}

export function updateExternalModelDataset(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.threeRenderer?.domElement) return;
  const modelLoadState3 = runtime.externalModelRegistry.modelLoadState();
  ((runtime.appCtx.threeRenderer.domElement.dataset.externalSharedMaterialCount = String(
    modelLoadState3.materials,
  )),
    (runtime.appCtx.threeRenderer.domElement.dataset.externalMaterialReuseCount = String(
      modelLoadState3.materialReuses,
    )),
    (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompilePassCount = String(
      runtime.appCtx.externalPrecompilePassCount,
    )),
    (runtime.appCtx.threeRenderer.domElement.dataset.lightPrecompilePassCount = String(runtime.appCtx.lightPrecompilePassCount)));
}

export function planLightPrecompileBatches(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.sceneRootNode) return [];
  const visibleLights: any = [],
    lightsByGroupId = new Map();
  runtime.appCtx.sceneRootNode.traverse((sceneLight: any) => {
    if (
      !sceneLight.isLight ||
      !sceneLight.userData?.lightItemId ||
      (!runtime.isEmbeddedStage && finite2(sceneLight.userData.lightOnIntensity, 0) <= 0)
    )
      return;
    sceneLight.visible !== false && visibleLights.push(sceneLight);
    const planLightPrecompileBatchesLightGroupId = String(sceneLight.userData.lightGroupId || "");
    planLightPrecompileBatchesLightGroupId &&
      (lightsByGroupId.has(planLightPrecompileBatchesLightGroupId) ||
        lightsByGroupId.set(planLightPrecompileBatchesLightGroupId, []),
      lightsByGroupId.get(planLightPrecompileBatchesLightGroupId).push(sceneLight));
  });
  const flat = [...lightsByGroupId.values()].flat(),
    processedSignatureSet = new Set(),
    lightBatches: any = [],
    lg2 = lightSignatureOf(visibleLights),
    lightCacheKey = runtime.appCtx.sceneRootNode.uuid + ":" + runtime.appCtx.externalPrecompilePassCount;
  runtime.appCtx.currentPrecompileSignature !== lightCacheKey &&
    ((runtime.appCtx.currentPrecompileSignature = lightCacheKey), runtime.precompiledMaterialKeySet.clear());
  const addLightBatch = (
    planLightPrecompileBatchesLightEntries: any,
    lightChanges: any,
    isForcedBatch = false,
  ) => {
    const lg3 = lightSignatureOf(planLightPrecompileBatchesLightEntries);
    processedSignatureSet.has(lg3) ||
      (processedSignatureSet.add(lg3),
      !runtime.precompiledMaterialKeySet.has(lg3) &&
        ((!isForcedBatch &&
          lg3 !== lg2 &&
          runtime.precompiledMaterialKeySet.size + lightBatches.length >= runtime.maxPrecompileBatchSize) ||
          lightBatches.push({
            signature: lg3,
            lights: lightChanges
              .filter((batchLightEntry: any) => batchLightEntry.visible)
              .map((lightChangeRecord: any) => lightChangeRecord.light),
            changes: lightChanges,
          })));
  };
  (addLightBatch(visibleLights, [], true),
    addLightBatch(
      [],
      flat.map((groupLightEntry) => ({
        light: groupLightEntry,
        visible: false,
      })),
      true,
    ));
  for (const groupLights of lightsByGroupId.values()) {
    const hiddenLights = groupLights.filter(
      (hiddenLightEntry: any) => hiddenLightEntry.visible === false,
    );
    hiddenLights.length &&
      addLightBatch(
        [...visibleLights, ...hiddenLights],
        hiddenLights.map((revealLightChange: any) => ({
          light: revealLightChange,
          visible: true,
        })),
      );
    const visibleGroupLights = groupLights.filter(
      (visibleGroupLight: any) => visibleGroupLight.visible !== false,
    );
    visibleGroupLights.length &&
      addLightBatch(
        visibleLights.filter((retainedLight: any) => !visibleGroupLights.includes(retainedLight)),
        visibleGroupLights.map((hideLightChange: any) => ({
          light: hideLightChange,
          visible: false,
        })),
      );
  }
  return (
    runtime.isEmbeddedStage &&
      addLightBatch(
        flat,
        flat.map((flatLightEntry) => ({
          light: flatLightEntry,
          visible: true,
        })),
        true,
      ),
    lightBatches
  );
}

export function shouldSuspendSceneWork(runtime: StudioAppRuntime, ) {
  return (
    runtime.appCtx.isPageHidden ||
    runtime.appCtx.isDisposed ||
    document.hidden ||
    (runtime.isEmbeddedStage && (!runtime.appCtx.isHighDetailQuality || runtime.renderCacheWriter?.closed))
  );
}

export function shouldDeferSceneWork(runtime: StudioAppRuntime, ) {
  return (
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isWindowHidden ||
    runtime.appCtx.isCapturingLights ||
    runtime.appCtx.isRendererUnavailable ||
    (runtime.isEmbeddedStage && (runtime.appCtx.isPrewarming || runtime.appCtx.prewarmState)) ||
    (!runtime.isEmbeddedStage && runtime.areLightsEnabled())
  );
}

export function scheduleLightPrecompile(runtime: StudioAppRuntime, delayMs = 360) {
  runtime.isEmbedStageMode ||
    runtime.isAutoDiagramEmbed ||
    runtime.appCtx.isPageHidden ||
    ((runtime.appCtx.isEnvironmentLoading = true),
    window.clearTimeout(runtime.appCtx.precompileDebounceId),
    !(runtime.appCtx.isLightPrecompileRunning || runtime.shouldSuspendSceneWork()) &&
      (runtime.appCtx.precompileDebounceId = window.setTimeout(async () => {
        if (((runtime.appCtx.precompileDebounceId = null), runtime.shouldSuspendSceneWork())) return;
        const modelLoadState4 = runtime.externalModelRegistry.modelLoadState();
        if (
          !runtime.appCtx.threeRenderer ||
          !runtime.appCtx.threeScene ||
          !runtime.appCtx.threeCamera ||
          !runtime.appCtx.sceneRootNode ||
          runtime.shouldDeferSceneWork() ||
          runtime.appCtx.isExternalModelLoadDeferred ||
          runtime.appCtx.modelLoadDebounceId ||
          (modelLoadState4.pending ?? modelLoadState4.active + modelLoadState4.queued) > 0
        ) {
          runtime.scheduleLightPrecompile(240);
          return;
        }
        const qv3 = runtime.planLightPrecompileBatches(),
          lightSceneRoot = runtime.appCtx.sceneRootNode,
          ue2 = runtime.appCtx.threeScene,
          activeRenderer = runtime.appCtx.threeRenderer;
        if (!qv3.length) {
          ((runtime.appCtx.isEnvironmentLoading = false),
            (activeRenderer.domElement.dataset.lightPrecompileState = "ready"),
            runtime.updateExternalModelDataset());
          return;
        }
        ((runtime.appCtx.isLightPrecompileRunning = true),
          (runtime.appCtx.isEnvironmentLoading = false),
          (activeRenderer.domElement.dataset.lightPrecompileState = "working"),
          (activeRenderer.domElement.dataset.lightPrecompilePlanCount = String(qv3.length)));
        const shouldAbortPrecompile = () =>
          runtime.appCtx.sceneRootNode === lightSceneRoot &&
          runtime.appCtx.threeScene === ue2 &&
          runtime.appCtx.threeRenderer === activeRenderer &&
          !runtime.appCtx.isEnvironmentLoading &&
          !runtime.shouldSuspendSceneWork() &&
          !runtime.shouldDeferSceneWork();
        let isPrecompileComplete = true;
        try {
          for (const pendingLightBatch of qv3) {
            if ((await runtime.waitForIdleFrame(), !shouldAbortPrecompile())) {
              ((isPrecompileComplete = false), (runtime.appCtx.isEnvironmentLoading = true));
              break;
            }
            const lightChangeRecords = pendingLightBatch.changes.map(
              ({ light: pendingLightEntry, visible: nextVisibleState }: any) => ({
                light: pendingLightEntry,
                nextVisible: nextVisibleState,
                visible: pendingLightEntry.visible,
                intensity: pendingLightEntry.intensity,
              }),
            );
            let compilePromise: any = null;
            try {
              for (const lightChangeEntry of lightChangeRecords)
                ((lightChangeEntry.light.intensity = 0),
                  (lightChangeEntry.light.visible = lightChangeEntry.nextVisible));
              (runtime.setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              }),
                (compilePromise = precompileShaderPrograms(
                  activeRenderer,
                  ue2,
                  runtime.appCtx.threeCamera,
                  shouldAbortPrecompile,
                )));
            } finally {
              for (const restoreLightEntry of lightChangeRecords)
                ((restoreLightEntry.light.visible = restoreLightEntry.visible),
                  (restoreLightEntry.light.intensity = restoreLightEntry.intensity));
              runtime.setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              });
            }
            if (!(await compilePromise) || !shouldAbortPrecompile()) {
              ((isPrecompileComplete = false),
                (activeRenderer.domElement.dataset.lightPrecompileDeferred = "true"),
                (runtime.appCtx.isEnvironmentLoading ||= !shouldAbortPrecompile()));
              break;
            }
            ((runtime.appCtx.lightPrecompilePassCount += 1),
              runtime.precompiledMaterialKeySet.add(pendingLightBatch.signature));
          }
          isPrecompileComplete
            ? (delete activeRenderer.domElement.dataset.lightPrecompileDeferred,
              (activeRenderer.domElement.dataset.lightPrecompileState = "ready"))
            : (activeRenderer.domElement.dataset.lightPrecompileState = "deferred");
        } catch {
          activeRenderer.domElement.dataset.lightPrecompileState = "fallback";
        } finally {
          ((runtime.appCtx.isLightPrecompileRunning = false),
            runtime.updateExternalModelDataset(),
            runtime.appCtx.isEnvironmentLoading && runtime.scheduleLightPrecompile(240));
        }
      }, delayMs)));
}

export function scheduleExternalPrecompile(runtime: StudioAppRuntime, initialDelayMs = 0) {
  runtime.isEmbedStageMode ||
    ((runtime.appCtx.isRecoveryRender = true),
    window.clearTimeout(runtime.appCtx.precompileTimeoutId),
    !(runtime.appCtx.isRendererUnavailable || runtime.appCtx.isDisposed) &&
      (runtime.appCtx.precompileTimeoutId = window.setTimeout(async () => {
        if (
          ((runtime.appCtx.precompileTimeoutId = null),
          !runtime.appCtx.threeRenderer ||
            !runtime.appCtx.threeScene ||
            !runtime.appCtx.threeCamera ||
            !runtime.appCtx.sceneRootNode ||
            runtime.appCtx.pendingRuntimeSettings ||
            document.hidden ||
            runtime.appCtx.isRenderSuppressed ||
            runtime.appCtx.isWindowHidden ||
            runtime.appCtx.isCapturingLights)
        ) {
          runtime.scheduleExternalPrecompile(240);
          return;
        }
        const sg2 = runtime.collectSharedMaterials();
        if (!sg2.length) {
          ((runtime.appCtx.isRecoveryRender = false), runtime.updateExternalModelDataset(), runtime.scheduleLightPrecompile());
          return;
        }
        ((runtime.appCtx.isRendererUnavailable = true),
          (runtime.appCtx.isRecoveryRender = false),
          (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "working"));
        try {
          (runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
            rebuildAtlas: false,
          }),
            runtime.appCtx.threeRenderer.compile(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
            sg2.forEach((materialToCache: any) => runtime.disposedMaterialSet.add(materialToCache as object)),
            (runtime.appCtx.externalPrecompilePassCount += 1),
            (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "ready"));
        } catch (precompileError) {
          // 静默回退会让「模型发黑/首帧卡顿」无从排查：上游这里会向 HABridge 报一条 warning。
          (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "fallback"),
            console.warn("外部模型预编译失败，已回退到逐帧编译。", precompileError);
        } finally {
          ((runtime.appCtx.isRendererUnavailable = false),
            runtime.updateExternalModelDataset(),
            runtime.appCtx.isRecoveryRender ? runtime.scheduleExternalPrecompile(120) : runtime.scheduleLightPrecompile());
        }
      }, initialDelayMs)));
}

export function requestSceneRebuild(runtime: StudioAppRuntime, rebuildOptions: SceneRebuildOptions = {}) {
  if (typeof runtime.appCtx.isSceneStillLoading < "u" && runtime.appCtx.isSceneStillLoading) {
    runtime.assetLoaderState.revision++;
    return;
  }
  const isForcedRebuild = rebuildOptions.force === true,
    isExternalOnlyRebuild = rebuildOptions.externalModelsOnly === true,
    scope =
      typeof rebuildOptions.scope === "string" &&
      ["items", "lights", "architecture"].includes(rebuildOptions.scope)
        ? rebuildOptions.scope
        : "all";
  if (!runtime.getPreviewSyncMode() && !isForcedRebuild) {
    (rebuildOptions.transient !== true && (runtime.appCtx.isSceneDirty = true), runtime.refreshPreviewSync());
    return;
  }
  (isForcedRebuild
    ? ((runtime.appCtx.isMaterialPrecompilePending = true),
      isExternalOnlyRebuild || (runtime.dirtyFloorIdSet.add("all"), (runtime.appCtx.hasAllFloorsSelected = true)))
    : (runtime.dirtyFloorIdSet.add(scope), scope === "all" && (runtime.appCtx.hasAllFloorsSelected = true)),
    isExternalOnlyRebuild && (runtime.appCtx.isRuntimeWarmupDone = true),
    rebuildOptions.precompile === true && (runtime.appCtx.isRendererLost = true),
    rebuildOptions.preserveLightCache !== true && (runtime.appCtx.isLightCachePreserved = true),
    !runtime.appCtx.isPrecompileBlocked &&
      ((runtime.appCtx.isPrecompileBlocked = true),
      requestAnimationFrame(() => {
        if (((runtime.appCtx.isPrecompileBlocked = false), runtime.appCtx.isWindowHidden && !runtime.appCtx.isMaterialPrecompilePending)) return;
        const wl4 = runtime.getPreviewSyncMode() || runtime.appCtx.isMaterialPrecompilePending;
        if (((runtime.appCtx.isMaterialPrecompilePending = false), !wl4)) {
          ((runtime.appCtx.isSceneDirty = true), runtime.refreshPreviewSync());
          return;
        }
        const rebuildScopeSet = new Set(runtime.dirtyFloorIdSet);
        runtime.dirtyFloorIdSet.clear();
        const yl5 = runtime.appCtx.hasAllFloorsSelected || rebuildScopeSet.has("all");
        runtime.appCtx.hasAllFloorsSelected = false;
        const shouldPreserveLightCacheOnRebuild = !runtime.appCtx.isLightCachePreserved;
        runtime.appCtx.isLightCachePreserved = false;
        const Hr2 = typeof runtime.appCtx.isRuntimeWarmupDone < "u" && runtime.appCtx.isRuntimeWarmupDone;
        (typeof runtime.appCtx.isRuntimeWarmupDone < "u" && (runtime.appCtx.isRuntimeWarmupDone = false),
          typeof runtime.stageLoadTiming == "function" && runtime.stageLoadTiming("rebuild-start"),
          Hr2 &&
          !yl5 &&
          !rebuildScopeSet.has("architecture") &&
          !rebuildScopeSet.has("lights") &&
          runtime.appCtx.sceneRootNode?.children?.length
            ? (runtime.getPreviewFloorMode() === "all"
                ? runtime.buildLayerForFloor("items", {
                    preserveLightCache: false,
                  })
                : (runtime.buildFloorAtIndex(new Set(["items"]), {
                    preserveLightCache: false,
                  }),
                  true)) ||
              runtime.rebuildFloorLayers({
                preserveLightCache: shouldPreserveLightCacheOnRebuild,
              })
            : yl5 || !runtime.appCtx.studioState.walls.length
              ? runtime.rebuildFloorLayers({
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                })
              : runtime.buildFloorAtIndex(rebuildScopeSet, {
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                  allowTransforms: !Hr2 && rebuildScopeSet.size === 1 && rebuildScopeSet.has("items"),
                }),
          typeof runtime.stageLoadTiming == "function" && runtime.stageLoadTiming("rebuild-end"));
        const zd2 = runtime.appCtx.isRendererLost;
        ((runtime.appCtx.isRendererLost = false),
          runtime.updateExternalModelDataset(),
          (zd2 || runtime.collectSharedMaterials().length) && runtime.scheduleExternalPrecompile(),
          (runtime.appCtx.isSceneDirty = false),
          runtime.refreshPreviewSync());
      })));
}

export function getSceneContentBounds(runtime: StudioAppRuntime, ) {
  return sceneContentBounds2(runtime.appCtx.studioState);
}

export function computeCourtyardBounds(runtime: StudioAppRuntime, { physicalStack: isPhysicalStack = false } = {}) {
  if (!runtime.appCtx.studioProject?.floors?.length) return null;
  const isAllFloors = runtime.getPreviewFloorMode() === "all",
    sort4 = isAllFloors
      ? [...runtime.appCtx.studioProject.floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation)
      : runtime.appCtx.studioProject.floors.filter(
          (isPhysicalStackFloorMatch: any) => isPhysicalStackFloorMatch.id === runtime.appCtx.activeFloorId,
        );
  if (
    !sort4.some((isPhysicalStackFloorCandidate: any) =>
      isPhysicalStackFloorCandidate.scene.items.some(isCourtyardDrawing2),
    )
  )
    return null;
  const courtyardBoundsBox = new ns2.Box3(),
    floorGapMeters = runtime.appCtx.pendingRuntimeSettings
      ? finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
      : finite2(runtime.appCtx.studioProject.previewFloorGap, 3);
  return (
    sort4.forEach((isPhysicalStackFloorEntry: any, isPhysicalStackFloorIndex: any) => {
      const isPhysicalStackPixelsPerMeter =
          isPhysicalStackFloorEntry.scene.calibration?.pixelsPerMeter || 100,
        isPhysicalStackFloorModelOrigin = sceneModelOrigin2(
          isPhysicalStackFloorEntry.scene,
          isPhysicalStackFloorEntry,
        ),
        floorElevationOffset = isAllFloors
          ? isPhysicalStack
            ? isPhysicalStackFloorEntry.elevation - sort4[0].elevation
            : isPhysicalStackFloorIndex * floorGapMeters
          : 0,
        maxCourtyardHeight = Math.max(
          0,
          ...isPhysicalStackFloorEntry.scene.walls.map((isPhysicalStackWallEntry: any) =>
            finite2(
              isPhysicalStackWallEntry.height,
              isPhysicalStackFloorEntry.scene.settings?.wallHeight || 2.8,
            ),
          ),
          ...isPhysicalStackFloorEntry.scene.items
            .filter(isCourtyardDrawing2)
            .map(
              (courtyardLevelDrawing: any) =>
                finite2(courtyardLevelDrawing.elevation, 0) +
                finite2(courtyardLevelDrawing.height, 0),
            ),
        );
      for (const courtyardBoundaryPoint of courtyardBoundaryPoints2(
        isPhysicalStackFloorEntry.scene,
        isPhysicalStackPixelsPerMeter,
      )) {
        const $a4 = isAllFloors
          ? runtime.planToWorldPoint(isPhysicalStackFloorEntry, courtyardBoundaryPoint)
          : {
              x:
                (courtyardBoundaryPoint.x - isPhysicalStackFloorModelOrigin.x) /
                isPhysicalStackPixelsPerMeter,
              z:
                (courtyardBoundaryPoint.y - isPhysicalStackFloorModelOrigin.y) /
                isPhysicalStackPixelsPerMeter,
            };
        (courtyardBoundsBox.expandByPoint(new ns2.Vector3($a4.x, floorElevationOffset, $a4.z)),
          courtyardBoundsBox.expandByPoint(
            new ns2.Vector3($a4.x, floorElevationOffset + maxCourtyardHeight, $a4.z),
          ));
      }
    }),
    courtyardBoundsBox.isEmpty() ? null : courtyardBoundsBox
  );
}

export function createFloorMaterial(runtime: StudioAppRuntime, ) {
  const yt5 = runtime.backgroundSettings(),
    floorMaterial = new ns2.MeshStandardMaterial({
      color: yt5.floor,
      roughness: 0.96,
      metalness: 0,
      emissive: yt5.floor,
      emissiveIntensity: 0.025,
    });
  return (decorateWarmFloor2(floorMaterial, yt5), floorMaterial);
}
