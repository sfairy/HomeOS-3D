/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  FLOOR_SCENE_SCHEMA_VERSION,
  createEmptyScene
} from "./studio-scene-defaults.js";
import {
  finite,
  itemMinimumFootprint,
  itemMinimumHeight,
  normalizeFixedCameraView,
  normalizeFullRotation,
  normalizeLabelText,
  normalizePoint
} from "../loaders/studio-normalization.js";
import {
  clamp,
  distance
} from "../plan/geometry.js";
import {
  createId,
  normalizePillarAxis,
  normalizeStripAxis,
  splitWallsWithOpenings
} from "./studio-plan-geometry.js";
import {
  DEFAULT_LIGHT_SETTINGS,
  DOOR_TYPE_DIMENSIONS,
  ITEM_TYPE_DEFINITIONS,
  LIGHT_TYPE_MAX_ANGLE_DEG,
  STUDIO_PALETTE,
  TV_MOUNT_STYLES
} from "./studio-config-tables.js";
import {
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES
} from "./studio-item-types.js";
import {
  curtainFootprintDepth,
  normalizeCurtainTrack
} from "../loaders/studio-curtain-track.js";
import {
  normalizeFeatureWallStyle,
  normalizeMuralArtStyle
} from "../materials/studio-surface-textures.js";
import {
  MATERIAL_STYLE_AUTO,
  isMaterialStyleCapable,
  normalizeMaterialStyle
} from "./studio-material-styles.js";
import { COVER_DEFAULT_PREVIEW_POSITION } from "../../utils/cover-features.js";
import {
  DOOR_MATERIAL_AUTO,
  normalizeDoorMaterial
} from "./studio-door-materials.js";
import { state } from "./studio-state.js";

/**
 * 暂存老草稿里的两个布局比例（previewPanelRatio / detailsPanelWidthRatio）。
 */
export function captureLegacyLayoutSeed(rawSettings: any) {
  if (!rawSettings || typeof rawSettings != "object") {
    return;
  }
  const legacyPreviewHeightRatio = finite(rawSettings.previewPanelRatio, NaN);
  const legacyDetailsWidthRatio = finite(rawSettings.detailsPanelWidthRatio, NaN);
  if (!Number.isFinite(legacyPreviewHeightRatio) && !Number.isFinite(legacyDetailsWidthRatio)) {
    return;
  }
  // 存进去的是百分比（与布局层 % 栏的量纲一致），旧文档存的是 0~1 的比例，这里换算一次。
  state.pendingLegacyLayoutSeed = {
    previewHeight: Number.isFinite(legacyPreviewHeightRatio)
      ? legacyPreviewHeightRatio * 100
      : undefined,
    details: Number.isFinite(legacyDetailsWidthRatio) ? legacyDetailsWidthRatio * 100 : undefined
  };
}

/**
 * 取某类灯具的聚光角上限（度）。兜底 120 而不是 180：真实射灯不会做成全向，
 */
export function maxLightAngleForType(itemType: any) {
  return (LIGHT_TYPE_MAX_ANGLE_DEG as any)[itemType] || 120;
}

/**
 * 窗帘「预览打开」默认值定稿的那一版（= 第 4 版）。
 */
export const CURTAIN_PREVIEW_DEFAULT_SCHEMA_VERSION = 4;

export function migrateLegacyCurtainPreview(sourceItemRecord: any, schemaVersion: any) {
  if (
    sourceItemRecord?.type !== "curtain" ||
    schemaVersion >= CURTAIN_PREVIEW_DEFAULT_SCHEMA_VERSION
  ) {
    return sourceItemRecord;
  }
  const legacyCurtainPreview = finite(sourceItemRecord.curtainPreview, NaN);
  const isLegacyDefault = schemaVersion < 3 && legacyCurtainPreview === 0;
  // 版本 3 那次迁移留下的全开值。注意这一条对「版本 3 文档里用户自己设的 0 / 50」不生效 ——
  const isPreviousDefault = legacyCurtainPreview === 100;
  return isLegacyDefault || isPreviousDefault
    ? {
        ...sourceItemRecord,
        curtainPreview: COVER_DEFAULT_PREVIEW_POSITION
      }
    : sourceItemRecord;
}

/**
 * 把任意来源的场景 JSON 归一成当前版本可用对象（读盘、导入、外层 API 都过这里）：
 */
export function normalizeScene(raw: any) {
  const emptyScene = createEmptyScene();
  if (!raw || typeof raw != "object") {
    return emptyScene;
  }
  const schemaVersion = finite(raw.schemaVersion, 0);
  // 老草稿把两个布局比例混在 settings 里，本次迁移到 localStorage。这里只暂存旧值，
  captureLegacyLayoutSeed(raw.settings);
  const calibrationPixelsPerMeter = clamp(finite(raw.calibration?.pixelsPerMeter, 0), 0, 100000);
  const calibration =
    calibrationPixelsPerMeter > 0
      ? {
          pixelsPerMeter: calibrationPixelsPerMeter,
          reference: raw.calibration?.reference
            ? {
                start: normalizePoint(raw.calibration.reference.start),
                end: normalizePoint(raw.calibration.reference.end),
                meters: clamp(finite(raw.calibration.reference.meters, 1), 0.01, 1000)
              }
            : null
        }
      : null;
  const normalizedWalls = Array.isArray(raw.walls)
    ? raw.walls
        .map((rawWall: any) => ({
          id: String(rawWall?.id || createId("wall")),
          start: normalizePoint(rawWall?.start),
          end: normalizePoint(rawWall?.end),
          height: clamp(finite(rawWall?.height, raw.settings?.wallHeight || 2.8), 0.01, 6),
          thickness: clamp(
            finite(rawWall?.thickness, raw.settings?.wallThickness || 0.12),
            0.01,
            3
          ),
          opacity:
            rawWall?.opacity === null || rawWall?.opacity === undefined || rawWall?.opacity === ""
              ? null
              : clamp(
                  finite(rawWall.opacity, raw.settings?.wallOpacity ?? STUDIO_PALETTE.wallOpacity),
                  0,
                  1
                ),
          allowOpenEnd: rawWall?.allowOpenEnd === true
        }))
        .filter((validWall: any) => distance(validWall.start, validWall.end) > 0.1)
    : [];
  const wallIds = new Set(normalizedWalls.map((wallIdEntry: any) => wallIdEntry.id));
  const normalizedWindows = Array.isArray(raw.windows)
    ? raw.windows
        .map((rawWindow: any) => ({
          id: String(rawWindow?.id || createId("window")),
          wallId: String(rawWindow?.wallId || ""),
          t: clamp(finite(rawWindow?.t, 0.5), 0, 1),
          width: clamp(finite(rawWindow?.width, 1.4), 0.3, 20),
          height: clamp(finite(rawWindow?.height, 1.35), 0.3, 20),
          sill: clamp(finite(rawWindow?.sill, 0.85), 0, 20),
          hasDivider: rawWindow?.hasDivider !== false
        }))
        .filter((validWindow: any) => wallIds.has(validWindow.wallId))
    : [];
  const normalizedDoors = Array.isArray(raw.doors)
    ? raw.doors
        .map((rawDoor: any) => {
          // 门型要先定下来：材质档位的合法性按门型判（玻璃档位只在玻璃门型上算数），
          const doorType = Object.hasOwn(DOOR_TYPE_DIMENSIONS, rawDoor?.doorType)
            ? rawDoor.doorType
            : "solid";
          const normalizedDoor = {
            id: String(rawDoor?.id || createId("door")),
            wallId: String(rawDoor?.wallId || ""),
            t: clamp(finite(rawDoor?.t, 0.5), 0, 1),
            width: clamp(finite(rawDoor?.width, 0.9), 0.55, 20),
            height: clamp(finite(rawDoor?.height, 2.1), 1.8, 20),
            sill: 0,
            doorType: doorType,
            hinge: rawDoor?.hinge === "right" ? "right" : "left",
            swing: rawDoor?.swing === -1 ? -1 : 1
          };
          applyDoorMaterialStyle(normalizedDoor, doorType, rawDoor?.materialStyle);
          return normalizedDoor;
        })
        .filter((validDoor: any) => wallIds.has(validDoor.wallId))
    : [];
  const normalizedRailings = Array.isArray(raw.railings)
    ? raw.railings
        .map((rawRailing: any) => ({
          id: String(rawRailing?.id || createId("railing")),
          wallId: String(rawRailing?.wallId || ""),
          t: clamp(finite(rawRailing?.t, 0.5), 0, 1),
          width: clamp(finite(rawRailing?.width, 2), 0.3, 20),
          height: clamp(finite(rawRailing?.height, 1.1), 0.5, 3),
          sill: 0
        }))
        .filter((validRailing: any) => wallIds.has(validRailing.wallId))
    : [];
  const normalizedAreas = [];
  const areaIds = new Set();
  if (Array.isArray(raw.areas)) {
    for (const rawArea of raw.areas) {
      const areaId = String(rawArea?.id || createId("area"));
      if (!areaIds.has(areaId)) {
        areaIds.add(areaId);
        normalizedAreas.push({
          id: areaId,
          name: normalizeLabelText(rawArea?.name, "区域 " + (normalizedAreas.length + 1), 16)
        });
      }
    }
  }
  const normalizedLightGroups: any = [];
  const lightGroupIds = new Set();
  if (Array.isArray(raw.lightGroups)) {
    for (const rawGroup of raw.lightGroups) {
      const groupId = String(rawGroup?.id || createId("light-group"));
      if (!lightGroupIds.has(groupId)) {
        lightGroupIds.add(groupId);
        const groupAreaId = String(rawGroup?.areaId || "");
        normalizedLightGroups.push({
          id: groupId,
          name: normalizeLabelText(
            rawGroup?.name,
            "灯组 " + (normalizedLightGroups.length + 1),
            24
          ),
          enabled: rawGroup?.enabled !== false,
          areaId: areaIds.has(groupAreaId) ? groupAreaId : null
        });
      }
    }
  }
  /**
   * 按名字取灯组；没有就新建一个（原地修改 normalizedLightGroups）。归一化过程中同一个
   */
  const ensureLightGroup = (groupName = "默认灯组") => {
    const normalizedGroupName = normalizeLabelText(groupName, "默认灯组", 24);
    const existingGroup = normalizedLightGroups.find(
      (matchedLightGroup: any) => matchedLightGroup.name === normalizedGroupName
    );
    if (existingGroup) {
      return existingGroup;
    }
    const newGroup = {
      id: createId("light-group"),
      name: normalizedGroupName,
      enabled: true,
      areaId: null
    };
    normalizedLightGroups.push(newGroup);
    lightGroupIds.add(newGroup.id);
    return newGroup;
  };
  if (!normalizedLightGroups.length) {
    normalizedLightGroups.push({
      id: "light-group-default",
      name: "默认灯组",
      enabled: true,
      areaId: null
    });
    lightGroupIds.add("light-group-default");
  }
  let tvCounter = 0;
  let carCounter = 0;
  const rawItems = Array.isArray(raw.items)
    ? raw.items
        .filter((sourceItem: any) => !["smallseat", "entrydoor", "car"].includes(sourceItem?.type))
        .map((sourceItemRecord: any) => {
          const typeDefaults =
            (ITEM_TYPE_DEFINITIONS as any)[sourceItemRecord?.type] || ITEM_TYPE_DEFINITIONS.table;
          const width = clamp(
            finite(sourceItemRecord?.width, typeDefaults.width),
            itemMinimumFootprint(sourceItemRecord?.type),
            8
          );
          const depth = clamp(
            finite(sourceItemRecord?.depth, typeDefaults.depth),
            itemMinimumFootprint(sourceItemRecord?.type),
            8
          );
          const isLegacyStrip =
            schemaVersion < 2 && sourceItemRecord?.type === "striplight" && depth > width;
          const rotation = normalizeFullRotation(
            finite(sourceItemRecord?.rotation) + (isLegacyStrip ? 90 : 0)
          );
          const height = clamp(
            finite(sourceItemRecord?.height, typeDefaults.height),
            itemMinimumHeight(sourceItemRecord?.type),
            6
          );
          const isDesktopLegacySize =
            sourceItemRecord?.type === "desktop" &&
            Math.abs(width - 1.2) < 0.01 &&
            Math.abs(depth - 0.65) < 0.01;
          const isPlantLegacySize =
            sourceItemRecord?.type === "plant" &&
            Math.abs(width - 0.6) < 0.01 &&
            Math.abs(depth - 0.6) < 0.01 &&
            Math.abs(height - 1.15) < 0.01;
          const isToiletLegacySize =
            sourceItemRecord?.type === "toilet" &&
            Math.abs(width - 0.7) < 0.01 &&
            Math.abs(depth - 0.42) < 0.01;
          const isFloorLampLegacySize =
            sourceItemRecord?.type === "floorlamp" &&
            Math.abs(width - 0.9) < 0.01 &&
            Math.abs(depth - 0.45) < 0.01 &&
            Math.abs(height - 1.8) < 0.01;
          const isRugLegacyHeight = sourceItemRecord?.type === "rug" && height >= 0.045;
          const isLegacyWallCabinetElevation =
            sourceItemRecord?.type === "wallcabinet" &&
            schemaVersion < FLOOR_SCENE_SCHEMA_VERSION;
          let wallCabinetElevation = finite(sourceItemRecord?.elevation, 0);
          if (isLegacyWallCabinetElevation) {
            if (
              Math.abs(wallCabinetElevation - 1.4) < 0.005 ||
              Math.abs(wallCabinetElevation - 1.6) < 0.005
            ) {
              wallCabinetElevation = 0;
            } else if (wallCabinetElevation >= 0.5) {
              wallCabinetElevation -= 1.4 * (height / 0.82);
            }
          }
          const isSmallDownlight =
            sourceItemRecord?.type === "downlight" && width < 0.3 && depth < 0.3;
          const isNarrowPiano = sourceItemRecord?.type === "piano" && depth < 1;
          const lightDefaults =
            (DEFAULT_LIGHT_SETTINGS as any)[sourceItemRecord?.type] || DEFAULT_LIGHT_SETTINGS.downlight;
          const lightGroupId = LIGHT_ITEM_TYPES.has(sourceItemRecord?.type)
            ? lightGroupIds.has(String(sourceItemRecord?.lightGroupId || ""))
              ? String(sourceItemRecord.lightGroupId)
              : ensureLightGroup(sourceItemRecord?.lightGroup || "默认灯组").id
            : "";
          const tvLayerIndex = sourceItemRecord?.type === "tv" ? ++tvCounter : 0;
          const carLayerIndex = sourceItemRecord?.type === "smallcar" ? ++carCounter : 0;
          return {
            id: String(sourceItemRecord?.id || createId("item")),
            type:
              sourceItemRecord?.type === "rounddiningtableturntable"
                ? "rounddiningtable"
                : (ITEM_TYPE_DEFINITIONS as any)[sourceItemRecord?.type]
                  ? sourceItemRecord.type
                  : "table",
            x: finite(sourceItemRecord?.x),
            y: finite(sourceItemRecord?.y),
            rotation:
              sourceItemRecord?.type === "striplight"
                ? rotation
                : finite(sourceItemRecord?.rotation),
            width:
              sourceItemRecord?.type === "striplight"
                ? Math.max(width, depth)
                : isDesktopLegacySize ||
                    isPlantLegacySize ||
                    isFloorLampLegacySize ||
                    isToiletLegacySize ||
                    isSmallDownlight ||
                    isNarrowPiano
                  ? typeDefaults.width
                  : width,
            depth:
              sourceItemRecord?.type === "striplight"
                ? Math.min(width, depth)
                : isDesktopLegacySize ||
                    isPlantLegacySize ||
                    isFloorLampLegacySize ||
                    isToiletLegacySize ||
                    isSmallDownlight ||
                    isNarrowPiano
                  ? typeDefaults.depth
                  : depth,
            height:
              (sourceItemRecord?.type === "sideboard" && height < 1.4) ||
              isDesktopLegacySize ||
              isPlantLegacySize ||
              isToiletLegacySize ||
              isRugLegacyHeight ||
              isNarrowPiano
                ? typeDefaults.height
                : height,
            elevation: clamp(
              isLegacyWallCabinetElevation
                ? wallCabinetElevation
                : finite(sourceItemRecord?.elevation, typeDefaults.elevation || 0),
              0,
              6
            ),
            ...(["camera", "presence"].includes(sourceItemRecord?.type)
              ? {
                  verticalRotation: clamp(finite(sourceItemRecord?.verticalRotation, 0), -180, 180)
                }
              : {}),
            ...(sourceItemRecord?.type === "pillar"
              ? {
                  pillarShape: normalizePillarShape(sourceItemRecord?.pillarShape),
                  pillarAxis: normalizePillarAxis(sourceItemRecord?.pillarAxis)
                }
              : {}),
            color:
              sourceItemRecord?.type === "pillar"
                ? typeDefaults.color
                : /^#[0-9a-f]{6}$/i.test(sourceItemRecord?.color || "")
                  ? sourceItemRecord.color
                  : typeDefaults.color,
            ...(sourceItemRecord?.type === "planlabel"
              ? {
                  title: normalizeLabelText(sourceItemRecord?.title, "家庭总览", 24),
                  subtitle: normalizeLabelText(sourceItemRecord?.subtitle, "HOME PLAN", 36),
                  titleSpacing: clamp(finite(sourceItemRecord?.titleSpacing, 1.05), 0, 1.8),
                  subtitleSpacing: clamp(finite(sourceItemRecord?.subtitleSpacing, 0.08), 0, 0.6),
                  lineLength: clamp(finite(sourceItemRecord?.lineLength, 0.86), 0.3, 1)
                }
              : {}),
            ...(sourceItemRecord?.type === "tv"
              ? {
                  screenEnabled: sourceItemRecord?.screenEnabled !== false,
                  screenLayerName: normalizeLabelText(
                    sourceItemRecord?.screenLayerName,
                    "电视画面 " + tvLayerIndex,
                    24
                  ),
                  tvMountStyle: TV_MOUNT_STYLES.has(sourceItemRecord?.tvMountStyle)
                    ? sourceItemRecord.tvMountStyle
                    : "standard"
                }
              : {}),
            ...(sourceItemRecord?.type === "smallcar"
              ? {
                  chargingEnabled: sourceItemRecord?.chargingEnabled === true,
                  chargingLayerName: normalizeLabelText(
                    sourceItemRecord?.chargingLayerName,
                    "汽车充电 " + carLayerIndex,
                    24
                  )
                }
              : {}),
            // 冰箱款式：只有 double 落键，其余（含老数据、脏值）一律归一为 standard。
            ...(sourceItemRecord?.type === "fridge"
              ? {
                  fridgeStyle: sourceItemRecord.fridgeStyle === "double" ? "double" : "standard"
                }
              : {}),
            ...(sourceItemRecord?.type === "curtain"
              ? {
                  curtainPosition: ["left", "right", "split"].includes(
                    sourceItemRecord?.curtainPosition
                  )
                    ? sourceItemRecord.curtainPosition
                    : "split",
                  // 老版本的 0 是「没设置」而非「用户要关」，先过迁移再归一化。
                  ...normalizeCurtainTrack(
                    migrateLegacyCurtainPreview(sourceItemRecord, schemaVersion)
                  ),
                  depth: curtainFootprintDepth(sourceItemRecord)
                }
              : {}),
            ...(sourceItemRecord?.type === "mural"
              ? {
                  muralStyle: normalizeMuralArtStyle(sourceItemRecord?.muralStyle)
                }
              : {}),
            ...(sourceItemRecord?.type === "featurewall"
              ? {
                  wallStyle: normalizeFeatureWallStyle(sourceItemRecord?.wallStyle)
                }
              : {}),
            // 逐物件「材质风格」：所有受支持类型统一归一，非法 / 陈旧取值落回 auto（= 不落键）。
            ...materialStyleSnapshotFields(sourceItemRecord),
            ...(STAIR_DIRECTION_ITEM_TYPES.has(sourceItemRecord?.type)
              ? {
                  stairDirection: ["left", "right"].includes(sourceItemRecord?.stairDirection)
                    ? sourceItemRecord.stairDirection
                    : "right"
                }
              : {}),
            ...(sourceItemRecord?.type === "shoecabinet"
              ? {
                  shoeCabinetMirrored: sourceItemRecord?.shoeCabinetMirrored === true
                }
              : {}),
            ...(ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(sourceItemRecord?.type)
              ? {
                  roundTableTurntable:
                    sourceItemRecord?.type === "rounddiningtableturntable" ||
                    sourceItemRecord?.roundTableTurntable === true
                }
              : {}),
            ...(LIGHT_ITEM_TYPES.has(sourceItemRecord?.type)
              ? {
                  lightGroupId: lightGroupId,
                  verticalRotation:
                    sourceItemRecord?.type === "striplight"
                      ? normalizeFullRotation(sourceItemRecord?.verticalRotation)
                      : clamp(finite(sourceItemRecord?.verticalRotation, 0), -90, 90),
                  ...(sourceItemRecord?.type === "striplight"
                    ? {
                        stripAxis: normalizeStripAxis(sourceItemRecord?.stripAxis),
                        stripRollRotation: normalizeFullRotation(
                          sourceItemRecord?.stripRollRotation
                        ),
                        lightSourceVisible: sourceItemRecord?.lightSourceVisible !== false
                      }
                    : {}),
                  lightTemperature: clamp(
                    finite(sourceItemRecord?.lightTemperature, lightDefaults.temperature),
                    2200,
                    6500
                  ),
                  lightBrightness: clamp(
                    finite(sourceItemRecord?.lightBrightness, lightDefaults.brightness),
                    0,
                    100
                  ),
                  lightRange: clamp(
                    finite(sourceItemRecord?.lightRange, lightDefaults.range),
                    0.5,
                    10
                  ),
                  lightAngle: clamp(
                    finite(sourceItemRecord?.lightAngle, lightDefaults.angle),
                    15,
                    maxLightAngleForType(sourceItemRecord?.type)
                  )
                }
              : {})
          };
        })
    : [];
  const background =
    raw.background?.assetId && raw.background?.url
      ? {
          assetId: String(raw.background.assetId),
          url: String(raw.background.url),
          name: String(raw.background.name || "户型底图"),
          width: clamp(finite(raw.background.width, 1), 1, 8192),
          height: clamp(finite(raw.background.height, 1), 1, 8192)
        }
      : null;
  const splitGeometry = splitWallsWithOpenings(
    normalizedWalls,
    normalizedWindows,
    normalizedDoors,
    calibrationPixelsPerMeter,
    normalizedRailings
  );
  return {
    schemaVersion: FLOOR_SCENE_SCHEMA_VERSION,
    background: background,
    calibration: calibration,
    settings: {
      wallHeight: clamp(finite(raw.settings?.wallHeight, 2.8), 0.01, 6),
      wallThickness: clamp(finite(raw.settings?.wallThickness, 0.12), 0.01, 3),
      wallOpacity: clamp(finite(raw.settings?.wallOpacity, STUDIO_PALETTE.wallOpacity), 0, 1),
      floorEdgeVisible: raw.settings?.floorEdgeVisible !== false,
      planViewRotation:
        (((Math.round(finite(raw.settings?.planViewRotation, 0) / 90) * 90) % 360) + 360) % 360,
      cameraView: raw.settings?.cameraView === "top" ? "top" : "free",
      cameraTopRotation:
        (((Math.round(finite(raw.settings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
      cameraMode: raw.settings?.cameraMode === "orthographic" ? "orthographic" : "perspective",
      cameraFocalLength: clamp(finite(raw.settings?.cameraFocalLength, 50), 18, 120),
      fixedCameraView: normalizeFixedCameraView(raw.settings?.fixedCameraView),
      livePreviewEnabled: raw.settings?.livePreviewEnabled !== false,
      backgroundVisible: raw.settings?.backgroundVisible !== false,
      snapEnabled: raw.settings?.snapEnabled !== false,
      snapEndpoints: raw.settings?.snapEndpoints !== false,
      snapIntersections: raw.settings?.snapIntersections !== false,
      snapSegments: raw.settings?.snapSegments !== false,
      snapOrthogonal: raw.settings?.snapOrthogonal !== false,
      snapAngles: raw.settings?.snapAngles !== false,
      snapGrid: raw.settings?.snapGrid !== false,
      snapTolerance: clamp(Math.round(finite(raw.settings?.snapTolerance, 13)), 6, 24)
    },
    walls: splitGeometry.walls,
    windows: splitGeometry.windows,
    doors: splitGeometry.doors,
    railings: splitGeometry.railings,
    lightGroups: normalizedLightGroups,
    areas: normalizedAreas,
    items: rawItems
  };
}

/**
 * 快照 / 草稿里的 materialStyle 字段。只有真正选了风格时才写键：
 */
export function materialStyleSnapshotFields(itemRecord: any) {
  const itemType = itemRecord?.type;
  if (!isMaterialStyleCapable(itemType)) {
    return {};
  }
  const materialStyle = normalizeMaterialStyle(itemType, itemRecord?.materialStyle);
  return materialStyle === MATERIAL_STYLE_AUTO ? {} : { materialStyle };
}

/**
 * 把门材质档位写进那条门记录。`auto`（跟随全局风格）**不落键** —— 与物件侧的 materialStyle
 * @returns {string} 归一后的档位 id。
 */
export function applyDoorMaterialStyle(doorRecord: any, doorType: any, styleValue: any) {
  const materialStyle = normalizeDoorMaterial(doorType, styleValue);
  if (materialStyle === DOOR_MATERIAL_AUTO) {
    delete doorRecord.materialStyle;
    return DOOR_MATERIAL_AUTO;
  }
  doorRecord.materialStyle = materialStyle;
  return materialStyle;
}

export const PILLAR_SHAPES = Object.freeze(["square", "round", "semicircle", "quarter", "quarterinner"]);

export const pillarShapeSet = new Set(PILLAR_SHAPES);

/**
 * @returns {string} 合法造型名。
 */
export function normalizePillarShape(value: any) {
  return pillarShapeSet.has(value) ? value : PILLAR_SHAPES[0];
}
