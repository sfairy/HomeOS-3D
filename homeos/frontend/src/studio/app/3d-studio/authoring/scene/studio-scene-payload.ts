/**
 * 场景负载（scene payload）的**入库净化**：
 * `normalizeScenePayload`（楼层 / 平面图 / 相机 / 灯光 / 物件逐项规整）及其材质净化助手、
 * `createStudioDocument`（空白文档工厂）与随切片搬出的常量（门类型目录 / 平面图标签默认色等）。
 *
 * 从 studio-app.ts 单体切出（P4）。只读输入、无闭包可变状态；唯一的外部状态是
 * `externalModelRegistry`（外部模型注册表），按参数显式传入 —— 其余依赖都是 import。
 */

import { MATERIAL_STYLE_AUTO, normalizeMaterialStyle } from "../../materials/studio-material-presets";
import { airerDimensions as airerDimensions2 } from "../items/studio-airer";
import { clamp as clamp2, distance as distance2 } from "../../plan/geometry";
import { curtainFootprintDepth as curtainFootprintDepth2, normalizeCurtainTrack as normalizeCurtainTrack2 } from "../../loaders/studio-curtain-track";
import { defaultViewSettings } from "./studio-view-settings";
import { fanDimensions as fanDimensions2 } from "../items/studio-fan";
import { finite as finite2, isCourtyardDrawing as isCourtyardDrawing2, itemMinimumFootprint as itemMinimumFootprint2, itemMinimumHeight as itemMinimumHeight2, normalizeCourtyardDrawing as normalizeCourtyardDrawing2, normalizeFixedCameraView as normalizeFixedCameraView2, normalizeFullRotation as normalizeFullRotation2, normalizeLabelText as normalizeLabelText2, normalizePoint as normalizePoint2 } from "../../loaders/studio-normalization";
import { generateId } from "../ui/studio-app-helpers";
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet, tvMountStyleSet } from "../items/item-catalog";
import { normalizePipelineDispenserStyle } from "../items/pipeline-dispenser";
import { STORAGE_SECTION_TYPES } from "../items/studio-storage-sections";
import { lightAngleLimitForType, lightPresetCatalog } from "../lights/studio-app-light-data";
import { normalizeFeatureWallStyle, normalizeMuralArtStyle } from "../../materials/studio-surface-textures";
import { normalizeModelRemark as normalizeModelRemark2 } from "../../../shared/model-remarks";
import { normalizePillarAxis as normalizePillarAxis2, normalizePillarShape as normalizePillarShape2, normalizeStripAxis as normalizeStripAxis2 } from "../items/studio-item-posture";
import { remapOpeningsToWalls } from "../../plan/studio-wall-openings";

export const maxTextureUnitLimit = 8,
  planLabelDefaultColor = "#e8eef6",
  planLabelAccentAlpha = 0.72,
  shadowTextureUnits = 2,
  reservedTextureUnits = 1,
  minTextureSize = 1024,
  minPointDistance = 0.8,
  doorTypeCatalog = {
    solid: {
      width: 0.9,
      height: 2.1,
    },
    double: {
      width: 1.8,
      height: 2.2,
    },
    entry: {
      width: 1.05,
      height: 2.2,
    },
    "entry-child-mother": {
      width: 1.2,
      height: 2.2,
    },
    glass: {
      width: 0.9,
      height: 2.1,
    },
    "sliding-glass": {
      width: 1.8,
      height: 2.1,
    },
    "roller-shutter": {
      width: 3,
      height: 2.8,
    },
    "frame-only": {
      width: 0.9,
      height: 2.1,
    },
  };

export function createStudioDocument() {
  return {
    schemaVersion: 2,
    background: null as any,
    calibration: null as any,
    settings: {
      wallHeight: 2.4,
      wallThickness: 0.15,
      wallOpacity: defaultViewSettings.wallOpacity,
      floorEdgeVisible: true,
      planViewRotation: 0,
      cameraView: "free",
      cameraTopRotation: 0,
      cameraMode: "perspective",
      cameraFocalLength: 50,
      fixedCameraView: null as any,
      livePreviewEnabled: true,
      backgroundVisible: true,
      snapEnabled: true,
      snapEndpoints: true,
      snapIntersections: true,
      snapSegments: true,
      snapOrthogonal: true,
      snapAngles: true,
      snapGrid: true,
      snapSurfaces: true,
      snapTolerance: 13,
      previewPanelRatio: 0.52,
      detailsPanelWidthRatio: 0.29,
    },
    walls: [] as any[],
    windows: [] as any[],
    doors: [] as any[],
    railings: [] as any[],
    lightGroups: [
      {
        id: "light-group-default",
        name: "默认灯组",
        enabled: true,
        areaId: null as any,
      },
    ],
    items: [] as any[],
  };
}

/** 逐物件材质覆盖色的**入库净化**：只接受 `{ "<GLB 材质名>": "#rrggbb" }`，键按字典序排好（让产物稳定，也避免同一份覆盖在不同页面到处重建材质）。 */
export function normalizeMaterialOverrides(rawOverrides: any) {
  if (!rawOverrides || typeof rawOverrides != "object" || Array.isArray(rawOverrides)) return null;
  const normalizedEntries = Object.entries(rawOverrides)
    .filter(
      ([materialName, overrideColor]) =>
        Boolean(materialName) &&
        typeof overrideColor == "string" &&
        /^#[0-9a-f]{6}$/i.test(overrideColor),
    )
    .map(([materialName, overrideColor]) => [
      String(materialName).slice(0, 120),
      String(overrideColor).toLowerCase(),
    ])
    .sort(([materialNameA], [materialNameB]) =>
      materialNameA < materialNameB ? -1 : materialNameA > materialNameB ? 1 : 0,
    );
  return normalizedEntries.length ? Object.fromEntries(normalizedEntries) : null;
}

/** 0.8.0 四轮胎压：关闭时整段丢弃，开启时按白名单保留样式与四轮 `sensor.*`。 */
function normalizeTirePressure(rawTirePressure: any) {
  if (rawTirePressure?.enabled !== true) return null;
  const wheels = ["fl", "fr", "rl", "rr"].reduce(
    (collectedWheels: Record<string, string>, wheelKey) => {
      const wheelEntityId = rawTirePressure.wheels?.[wheelKey];
      typeof wheelEntityId == "string" &&
        /^sensor\.[a-z0-9_]+$/.test(wheelEntityId) &&
        (collectedWheels[wheelKey] = wheelEntityId);
      return collectedWheels;
    },
    {},
  );
  return {
    enabled: true,
    mode: rawTirePressure.mode === "named" ? "named" : "compact",
    fontSize: clamp2(finite2(rawTirePressure.fontSize, 14), 8, 40),
    opacity: clamp2(finite2(rawTirePressure.opacity, 0.8), 0.1, 1),
    wheels,
  };
}

function normalizeItemMaterialStyle(rawItemRecord: any, externalModelRegistry: any) {
  const modelType = externalModelRegistry.modelTypeForItem(rawItemRecord),
    materialStyle = normalizeMaterialStyle(modelType, rawItemRecord?.materialStyle);
  return materialStyle === MATERIAL_STYLE_AUTO ? null : materialStyle;
}

function doorMaterialFields(rawDoor: any) {
  const materialStyle = normalizeMaterialStyle("door", rawDoor?.materialStyle),
    materialOverrides = normalizeMaterialOverrides(rawDoor?.materialOverrides),
    materialSurfaceOverrides = normalizeMaterialSurfaceOverrides(rawDoor?.materialSurfaceOverrides);
  return {
    ...(materialStyle === MATERIAL_STYLE_AUTO ? {} : { materialStyle }),
    ...(materialOverrides ? { materialOverrides } : {}),
    ...(Object.keys(materialSurfaceOverrides).length ? { materialSurfaceOverrides } : {}),
  };
}

export function normalizeMaterialSurfaceOverrides(rawSurfaceOverrides: any) {
  if (
    !rawSurfaceOverrides ||
    typeof rawSurfaceOverrides != "object" ||
    Array.isArray(rawSurfaceOverrides)
  )
    return {};
  const normalizedEntries = Object.entries(rawSurfaceOverrides)
    .map(([materialName, surfaceOverride]): [string, Record<string, any>] | null => {
      if (!materialName || !surfaceOverride || typeof surfaceOverride != "object")
        return null;
      const normalizedSurfaceOverride: Record<string, any> = {};
      for (const surfaceKey of ["roughness", "metalness"]) {
        const surfaceValue = (surfaceOverride as any)[surfaceKey];
        typeof surfaceValue == "number" &&
          Number.isFinite(surfaceValue) &&
          ((normalizedSurfaceOverride as any)[surfaceKey] =
            Math.round(Math.min(1, Math.max(0, surfaceValue)) * 100) / 100);
      }
      return Object.keys(normalizedSurfaceOverride).length
        ? [String(materialName).slice(0, 120), normalizedSurfaceOverride]
        : null;
    })
    .filter((entry): entry is [string, Record<string, any>] => entry !== null)
    .sort(([materialNameA], [materialNameB]) =>
      materialNameA < materialNameB ? -1 : materialNameA > materialNameB ? 1 : 0,
    );
  return normalizedEntries.length ? Object.fromEntries(normalizedEntries) : {};
}

/** 某个槽位上的表面覆盖（已净化）； */
export function normalizeScenePayload(rawScene: any, externalModelRegistry: any) {
  const kd2 = createStudioDocument();
  if (!rawScene || typeof rawScene != "object") return kd2;
  const pixelsPerMeterValue = clamp2(finite2(rawScene.calibration?.pixelsPerMeter, 0), 0, 100000),
    calibrationSettings =
      pixelsPerMeterValue > 0
        ? {
            pixelsPerMeter: pixelsPerMeterValue,
            reference: rawScene.calibration?.reference
              ? {
                  start: normalizePoint2(rawScene.calibration.reference.start),
                  end: normalizePoint2(rawScene.calibration.reference.end),
                  meters: clamp2(finite2(rawScene.calibration.reference.meters, 1), 0.01, 1000),
                }
              : null,
          }
        : null,
    wallRecords = Array.isArray(rawScene.walls)
      ? rawScene.walls
          .map((rawWall: any) => ({
            id: String(rawWall?.id || generateId("wall")),
            start: normalizePoint2(rawWall?.start),
            end: normalizePoint2(rawWall?.end),
            height: clamp2(finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8), 0.01, 6),
            thickness: clamp2(
              finite2(rawWall?.thickness, rawScene.settings?.wallThickness || 0.12),
              0.01,
              3,
            ),
            opacity:
              rawWall?.opacity === null || rawWall?.opacity === undefined || rawWall?.opacity === ""
                ? null
                : clamp2(
                    finite2(
                      rawWall.opacity,
                      rawScene.settings?.wallOpacity ?? defaultViewSettings.wallOpacity,
                    ),
                    0,
                    1,
                  ),
            allowOpenEnd: rawWall?.allowOpenEnd === true,
          }))
          .filter((wallCandidate: any) => distance2(wallCandidate.start, wallCandidate.end) > 0.1)
      : [],
    wallIdSet = new Set(wallRecords.map((wallRecordRef: any) => wallRecordRef.id)),
    windowRecords = Array.isArray(rawScene.windows)
      ? rawScene.windows
          .map((rawWindow: any) => ({
            id: String(rawWindow?.id || generateId("window")),
            wallId: String(rawWindow?.wallId || ""),
            t: clamp2(finite2(rawWindow?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawWindow?.width, 1.4), 0.3, 20),
            height: clamp2(finite2(rawWindow?.height, 1.35), 0.3, 20),
            sill: clamp2(finite2(rawWindow?.sill, 0.85), 0, 20),
            hasDivider: rawWindow?.hasDivider !== false,
          }))
          .filter((windowCandidate: any) => wallIdSet.has(windowCandidate.wallId))
      : [],
    doorRecords = Array.isArray(rawScene.doors)
      ? rawScene.doors
          .map((rawDoor: any) => ({
            id: String(rawDoor?.id || generateId("door")),
            remark: normalizeModelRemark2(rawDoor?.remark),
            wallId: String(rawDoor?.wallId || ""),
            t: clamp2(finite2(rawDoor?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawDoor?.width, 0.9), 0.55, 20),
            height: clamp2(finite2(rawDoor?.height, 2.1), 1.8, 20),
            sill: 0,
            doorType: Object.hasOwn(doorTypeCatalog, rawDoor?.doorType)
              ? rawDoor.doorType
              : "solid",
            hinge: rawDoor?.hinge === "right" ? "right" : "left",
            swing: rawDoor?.swing === -1 ? -1 : 1,


            ...doorMaterialFields(rawDoor),
          }))
          .filter((doorCandidate: any) => wallIdSet.has(doorCandidate.wallId))
      : [],
    railingRecords = Array.isArray(rawScene.railings)
      ? rawScene.railings
          .map((rawRailing: any) => ({
            id: String(rawRailing?.id || generateId("railing")),
            wallId: String(rawRailing?.wallId || ""),
            t: clamp2(finite2(rawRailing?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawRailing?.width, 2), 0.3, 20),
            height: clamp2(finite2(rawRailing?.height, 1.1), 0.5, 3),
            sill: 0,
          }))
          .filter((railingCandidate: any) => wallIdSet.has(railingCandidate.wallId))
      : [],
    lightGroupRecords: any = [],
    lightGroupIdSet = new Set();
  if (Array.isArray(rawScene.lightGroups))
    for (const rawLightGroup of rawScene.lightGroups) {
      const lightGroupIdString = String(rawLightGroup?.id || generateId("light-group"));
      lightGroupIdSet.has(lightGroupIdString) ||
        (lightGroupIdSet.add(lightGroupIdString),
        lightGroupRecords.push({
          id: lightGroupIdString,
          name: normalizeLabelText2(
            rawLightGroup?.name,
            "灯组 " + (lightGroupRecords.length + 1),
            24,
          ),
          enabled: rawLightGroup?.enabled !== false,

          areaId: String(rawLightGroup?.areaId || "").trim() || null,
        }));
    }
  const ensureDefaultLightGroup = (requestedGroupName = "默认灯组") => {
    const normalizedGroupName = normalizeLabelText2(requestedGroupName, "默认灯组", 24),
      existingLightGroup = lightGroupRecords.find(
        (groupNameMatch: any) => groupNameMatch.name === normalizedGroupName,
      );
    if (existingLightGroup) return existingLightGroup;
    const newLightGroupRecord = {
      id: generateId("light-group"),
      name: normalizedGroupName,
      enabled: true,
      areaId: null as any,
    };
    return (
      lightGroupRecords.push(newLightGroupRecord),
      lightGroupIdSet.add(newLightGroupRecord.id),
      newLightGroupRecord
    );
  };
  lightGroupRecords.length ||
    (lightGroupRecords.push({
      id: "light-group-default",
      name: "默认灯组",
      enabled: true,
      areaId: null as any,
    }),
    lightGroupIdSet.add("light-group-default"));
  let tvScreenCount = 0,
    vehicleChargingCount = 0;
  const sceneItemRecords = Array.isArray(rawScene.items)
      ? rawScene.items
          .filter((rawSceneItem: any) => !["smallseat", "entrydoor", "car"].includes(rawSceneItem?.type))
          .map((rawItemRecord: any) => {
            const table = (itemTypeCatalog as any)[rawItemRecord?.type] || itemTypeCatalog.table,
              itemWidth = clamp2(
                finite2(rawItemRecord?.width, table.width),
                itemMinimumFootprint2(rawItemRecord?.type),
                isCourtyardDrawing2(rawItemRecord) ? 200 : 8,
              ),
              itemDepth = clamp2(
                finite2(rawItemRecord?.depth, table.depth),
                itemMinimumFootprint2(rawItemRecord?.type),
                isCourtyardDrawing2(rawItemRecord) ? 200 : 8,
              ),
              itemRotation = normalizeFullRotation2(finite2(rawItemRecord?.rotation)),
              itemHeight = clamp2(
                finite2(rawItemRecord?.height, table.height),
                itemMinimumHeight2(rawItemRecord?.type),
                6,
              ),
              isDesktopTable =
                rawItemRecord?.type === "desktop" &&
                Math.abs(itemWidth - 1.2) < 0.01 &&
                Math.abs(itemDepth - 0.65) < 0.01,
              isPlantScale =
                rawItemRecord?.type === "plant" &&
                Math.abs(itemWidth - 0.6) < 0.01 &&
                Math.abs(itemDepth - 0.6) < 0.01 &&
                Math.abs(itemHeight - 1.15) < 0.01,
              isToiletScale =
                rawItemRecord?.type === "toilet" &&
                Math.abs(itemWidth - 0.7) < 0.01 &&
                Math.abs(itemDepth - 0.42) < 0.01,
              isFloorLampScale =
                rawItemRecord?.type === "floorlamp" &&
                Math.abs(itemWidth - 0.9) < 0.01 &&
                Math.abs(itemDepth - 0.45) < 0.01 &&
                Math.abs(itemHeight - 1.8) < 0.01,
              isRugThin = rawItemRecord?.type === "rug" && itemHeight >= 0.045,
              isDownlightSmall =
                rawItemRecord?.type === "downlight" && itemWidth < 0.3 && itemDepth < 0.3,
              isPianoScale = rawItemRecord?.type === "piano" && itemDepth < 1,
              downlight = (lightPresetCatalog as any)[rawItemRecord?.type] || lightPresetCatalog.downlight,
              text = lampItemTypeSet.has(rawItemRecord?.type)
                ? lightGroupIdSet.has(String(rawItemRecord?.lightGroupId || ""))
                  ? String(rawItemRecord.lightGroupId)
                  : ensureDefaultLightGroup(rawItemRecord?.lightGroup || "默认灯组").id
                : "",
              tvScreenIndex = rawItemRecord?.type === "tv" ? ++tvScreenCount : 0,
              vehicleChargingIndex = ["smallcar", "suv", "scooter"].includes(rawItemRecord?.type)
                ? ++vehicleChargingCount
                : 0;
            return {
              ...normalizeCourtyardDrawing2(rawItemRecord),
              ...(rawItemRecord?.type === "mural"
                ? {
                    muralStyle: normalizeMuralArtStyle(rawItemRecord?.muralStyle),
                  }
                : {}),
              ...(rawItemRecord?.type === "featurewall"
                ? {
                    wallStyle: normalizeFeatureWallStyle(rawItemRecord?.wallStyle),
                  }
                : {}),
              ...(normalizeMaterialOverrides(rawItemRecord?.materialOverrides)
                ? {
                    materialOverrides: normalizeMaterialOverrides(rawItemRecord.materialOverrides),
                  }
                : {}),
              ...(normalizeItemMaterialStyle(rawItemRecord, externalModelRegistry)
                ? {
                    materialStyle: normalizeItemMaterialStyle(
                      rawItemRecord,
                      externalModelRegistry,
                    ),
                  }
                : {}),
              ...(rawItemRecord?.courtyardGate?.fenceId
                ? {
                    courtyardGate: {
                      fenceId: String(rawItemRecord.courtyardGate.fenceId),
                      fraction: clamp2(finite2(rawItemRecord.courtyardGate.fraction, 0.5), 0, 1),
                    },
                  }
                : {}),
              id: String(rawItemRecord?.id || generateId("item")),
              remark: normalizeModelRemark2(rawItemRecord?.remark),
              type:
                rawItemRecord?.type === "rounddiningtableturntable"
                  ? "rounddiningtable"
                  : (itemTypeCatalog as any)[rawItemRecord?.type]
                    ? rawItemRecord.type
                    : "table",
              x: finite2(rawItemRecord?.x),
              y: finite2(rawItemRecord?.y),
              rotation:
                rawItemRecord?.type === "striplight"
                  ? itemRotation
                  : finite2(rawItemRecord?.rotation),
              width:
                rawItemRecord?.type === "striplight"
                  ? Math.max(itemWidth, itemDepth)
                  : isDesktopTable ||
                      isPlantScale ||
                      isFloorLampScale ||
                      isToiletScale ||
                      isDownlightSmall ||
                      isPianoScale
                    ? table.width
                    : itemWidth,
              depth:
                rawItemRecord?.type === "striplight"
                  ? Math.min(itemWidth, itemDepth)
                  : isDesktopTable ||
                      isPlantScale ||
                      isFloorLampScale ||
                      isToiletScale ||
                      isDownlightSmall ||
                      isPianoScale
                    ? table.depth
                    : itemDepth,
              height:
                (rawItemRecord?.type === "sideboard" && itemHeight < 1.4) ||
                isDesktopTable ||
                isPlantScale ||
                isToiletScale ||
                isRugThin ||
                isPianoScale
                  ? table.height
                  : itemHeight,
              ...(rawItemRecord?.type === "fan" ? fanDimensions2(rawItemRecord) : {}),
              elevation: clamp2(finite2(rawItemRecord?.elevation, table.elevation || 0), 0, 6),
              ...(rawItemRecord?.type === "airer" ? airerDimensions2(rawItemRecord) : {}),
              ...(["camera", "presence"].includes(rawItemRecord?.type)
                ? {
                    verticalRotation: clamp2(
                      finite2(rawItemRecord?.verticalRotation, 0),
                      -180,
                      180,
                    ),
                  }
                : {}),
              color:
                rawItemRecord?.type === "pillar"
                  ? table.color
                  : /^#[0-9a-f]{6}$/i.test(rawItemRecord?.color || "")
                    ? rawItemRecord.color
                    : table.color,
              ...(rawItemRecord?.type === "planlabel"
                ? {
                    title: normalizeLabelText2(rawItemRecord?.title, "家庭总览", 24),
                    subtitle: normalizeLabelText2(rawItemRecord?.subtitle, "HOME PLAN", 36),
                    titleSpacing: clamp2(finite2(rawItemRecord?.titleSpacing, 1.05), 0, 1.8),
                    subtitleSpacing: clamp2(finite2(rawItemRecord?.subtitleSpacing, 0.08), 0, 0.6),
                    lineLength: clamp2(finite2(rawItemRecord?.lineLength, 0.86), 0.3, 1),
                    labelColor: normalizePlanLabelColor(rawItemRecord?.labelColor),
                  }
                : {}),
              ...(rawItemRecord?.type === "tv"
                ? {
                    screenEnabled: rawItemRecord?.screenEnabled !== false,
                    screenLayerName: normalizeLabelText2(
                      rawItemRecord?.screenLayerName,
                      "电视画面 " + tvScreenIndex,
                      24,
                    ),
                    tvMountStyle: tvMountStyleSet.has(rawItemRecord?.tvMountStyle)
                      ? rawItemRecord.tvMountStyle
                      : "standard",
                  }
                : {}),
              ...(["smallcar", "suv", "scooter"].includes(rawItemRecord?.type)
                ? {
                    chargingEnabled: rawItemRecord?.chargingEnabled === true,
                    chargingLayerName: normalizeLabelText2(
                      rawItemRecord?.chargingLayerName,
                      "汽车充电 " + vehicleChargingIndex,
                      24,
                    ),
                    ...(() => {
                      const tirePressure = normalizeTirePressure(rawItemRecord?.tirePressure);
                      return tirePressure ? { tirePressure } : {};
                    })(),
                  }
                : {}),
              ...(rawItemRecord?.type === "fridge"
                ? {
                    fridgeStyle: rawItemRecord.fridgeStyle === "double" ? "double" : "standard",
                  }
                : {}),
              /** 0.8.0 柜门结构：只有衣柜 / 储物柜认这个字段，缺省整门。 */
              ...(STORAGE_SECTION_TYPES.has(rawItemRecord?.type)
                ? {
                    cabinetSections:
                      rawItemRecord.cabinetSections === "two-section" ? "two-section" : "full",
                  }
                : {}),
              /**
               * 排气扇：`depth` 是吸墙后沿墙面法线方向的机身厚（缺省 0.16，挂墙时会被墙厚覆写），
               * `elevation` 是离地中心高（缺省 1.83，与卡片一致）。
               */
              ...(rawItemRecord?.type === "exhaust-fan"
                ? {
                    depth: clamp2(finite2(rawItemRecord?.depth, 0.16), 0.04, 0.6),
                    elevation: clamp2(finite2(rawItemRecord?.elevation, 1.83), 0, 6),
                  }
                : {}),
              ...(rawItemRecord?.type === "pipelinewaterpurifier"
                ? {
                    pipelineDispenserStyle: normalizePipelineDispenserStyle(
                      rawItemRecord?.pipelineDispenserStyle,
                    ),
                  }
                : {}),
              ...(rawItemRecord?.type === "curtain"
                ? {
                    curtainPosition: ["left", "right", "split"].includes(
                      rawItemRecord?.curtainPosition,
                    )
                      ? rawItemRecord.curtainPosition
                      : "split",
                    ...normalizeCurtainTrack2(rawItemRecord),
                    depth: curtainFootprintDepth2(rawItemRecord),
                  }
                : {}),
              ...(openStairTypeSet.has(rawItemRecord?.type)
                ? {
                    stairDirection: ["left", "right"].includes(rawItemRecord?.stairDirection)
                      ? rawItemRecord.stairDirection
                      : "right",
                  }
                : {}),
              ...(rawItemRecord?.type === "shoecabinet"
                ? {
                    shoeCabinetMirrored: rawItemRecord?.shoeCabinetMirrored === true,
                  }
                : {}),
              ...(rawItemRecord?.type === "pillar"
                ? {
                    pillarShape: normalizePillarShape2(rawItemRecord?.pillarShape),
                    pillarAxis: normalizePillarAxis2(rawItemRecord?.pillarAxis),
                  }
                : {}),
              ...(rawItemRecord?.type === "sofa-l"
                ? {
                    sofaChaiseSide: rawItemRecord.sofaChaiseSide === "left" ? "left" : "right",
                  }
                : {}),
              ...(roundTableTypeSet.has(rawItemRecord?.type)
                ? {
                    roundTableTurntable:
                      rawItemRecord?.type === "rounddiningtableturntable" ||
                      rawItemRecord?.roundTableTurntable === true,
                  }
                : {}),
              ...(lampItemTypeSet.has(rawItemRecord?.type)
                ? {
                    lightGroupId: text,
                    verticalRotation:
                      rawItemRecord?.type === "striplight"
                        ? normalizeFullRotation2(rawItemRecord?.verticalRotation)
                        : clamp2(finite2(rawItemRecord?.verticalRotation, 0), -90, 90),
                    ...(rawItemRecord?.type === "striplight"
                      ? {
                          stripRollRotation: normalizeFullRotation2(
                            rawItemRecord?.stripRollRotation,
                          ),
                          lightSourceVisible: rawItemRecord?.lightSourceVisible !== false,
                          stripAxis: normalizeStripAxis2(rawItemRecord?.stripAxis),
                        }
                      : {}),
                    lightTemperature: clamp2(
                      finite2(rawItemRecord?.lightTemperature, downlight.temperature),
                      2200,
                      6500,
                    ),
                    lightBrightness: clamp2(
                      finite2(rawItemRecord?.lightBrightness, downlight.brightness),
                      0,
                      100,
                    ),
                    lightRange: clamp2(
                      finite2(rawItemRecord?.lightRange, downlight.range),
                      0.5,
                      10,
                    ),
                    lightAngle: clamp2(
                      finite2(rawItemRecord?.lightAngle, downlight.angle),
                      15,
                      lightAngleLimitForType(rawItemRecord?.type),
                    ),
                  }
                : {}),
            };
          })
      : [],
    backgroundAsset =
      rawScene.background?.assetId && rawScene.background?.url
        ? {
            assetId: String(rawScene.background.assetId),
            url: String(rawScene.background.url),
            name: String(rawScene.background.name || "户型底图"),
            width: clamp2(finite2(rawScene.background.width, 1), 1, 8192),
            height: clamp2(finite2(rawScene.background.height, 1), 1, 8192),
          }
        : null,
    tf2 = remapOpeningsToWalls(
      wallRecords,
      windowRecords,
      doorRecords,
      pixelsPerMeterValue,
      railingRecords,
    );
  return {
    schemaVersion: 2,
    background: backgroundAsset,
    calibration: calibrationSettings,
    settings: {
      wallHeight: clamp2(finite2(rawScene.settings?.wallHeight, 2.8), 0.01, 6),
      wallThickness: clamp2(finite2(rawScene.settings?.wallThickness, 0.12), 0.01, 3),
      wallOpacity: clamp2(
        finite2(rawScene.settings?.wallOpacity, defaultViewSettings.wallOpacity),
        0,
        1,
      ),
      floorEdgeVisible: rawScene.settings?.floorEdgeVisible !== false,
      planViewRotation:
        (((Math.round(finite2(rawScene.settings?.planViewRotation, 0) / 90) * 90) % 360) + 360) %
        360,
      cameraView: rawScene.settings?.cameraView === "top" ? "top" : "free",
      cameraTopRotation:
        (((Math.round(finite2(rawScene.settings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) %
        360,
      cameraMode: rawScene.settings?.cameraMode === "orthographic" ? "orthographic" : "perspective",
      cameraFocalLength: clamp2(finite2(rawScene.settings?.cameraFocalLength, 50), 18, 120),
      fixedCameraView: normalizeFixedCameraView2(rawScene.settings?.fixedCameraView),
      livePreviewEnabled: rawScene.settings?.livePreviewEnabled !== false,
      backgroundVisible: rawScene.settings?.backgroundVisible !== false,
      snapEnabled: rawScene.settings?.snapEnabled !== false,
      snapEndpoints: rawScene.settings?.snapEndpoints !== false,
      snapIntersections: rawScene.settings?.snapIntersections !== false,
      snapSegments: rawScene.settings?.snapSegments !== false,
      snapOrthogonal: rawScene.settings?.snapOrthogonal !== false,
      snapAngles: rawScene.settings?.snapAngles !== false,
      snapGrid: rawScene.settings?.snapGrid !== false,
      snapSurfaces: rawScene.settings?.snapSurfaces !== false,
      snapTolerance: clamp2(Math.round(finite2(rawScene.settings?.snapTolerance, 13)), 6, 24),
      previewPanelRatio: clamp2(finite2(rawScene.settings?.previewPanelRatio, 0.52), 0.06, 0.94),
      detailsPanelWidthRatio: clamp2(
        finite2(rawScene.settings?.detailsPanelWidthRatio, 0.29),
        0.08,
        0.86,
      ),
    },
    walls: tf2.walls,
    windows: tf2.windows,
    doors: tf2.doors,
    railings: tf2.railings,
    lightGroups: lightGroupRecords,
    items: sceneItemRecords,
  };
}

/** 铭牌颜色的唯一收口：任何来源都要先过这里，避免写进非法色值。 */
export function normalizePlanLabelColor(candidateColor: any) {
  return /^#[0-9a-f]{6}$/i.test(String(candidateColor || ""))
    ? candidateColor
    : planLabelDefaultColor;
}
