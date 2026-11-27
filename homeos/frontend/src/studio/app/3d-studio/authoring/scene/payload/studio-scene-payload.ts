/**
 * 场景负载（scene payload）的**入库净化**：
 * `normalizeScenePayload`（楼层 / 平面图 / 相机 / 灯光 / 物件逐项规整）及其材质净化助手、
 * `createStudioDocument`（空白文档工厂）与随切片搬出的常量（门类型目录 / 平面图标签默认色等）。
 *
 * 从 studio-app.ts 单体切出（P4）。只读输入、无闭包可变状态；唯一的外部状态是
 * `externalModelRegistry`（外部模型注册表），按参数显式传入 —— 其余依赖都是 import。
 */

import { isVehicleModelType } from '../../items/studio-vehicle-models'
import { MATERIAL_STYLE_AUTO, normalizeMaterialStyle } from '../../../materials/studio-material'
import { airerDimensions as airerDimensions2 } from '../../items/studio-airer'
import { clamp as clamp2, distance as distance2 } from '../../../plan/geometry'
import {
  curtainFootprintDepth as curtainFootprintDepth2,
  normalizeCurtainTrack as normalizeCurtainTrack2,
} from '@app/shared/scene/studio-curtain-track'
import { defaultViewSettings } from './studio-view-settings'
import { fanDimensions as fanDimensions2 } from '../../items/studio-fan'
import {
  finite as finite2,
  isCourtyardDrawing as isCourtyardDrawing2,
  itemMinimumFootprint as itemMinimumFootprint2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumElevation,
  normalizeCourtyardDrawing as normalizeCourtyardDrawing2,
  normalizeFixedCameraView as normalizeFixedCameraView2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
  normalizePoint as normalizePoint2,
} from '../../../loaders/studio-normalization'
import { generateId } from '../../ui/studio-app-helpers'
import {
  itemTypeCatalog,
  lampItemTypeSet,
  openStairTypeSet,
  roundTableTypeSet,
  tvMountStyleSet,
} from '../../items/item-catalog'
import { normalizePipelineDispenserStyle } from '../../items/pipeline-dispenser'
import { STORAGE_SECTION_TYPES } from '../../items/studio-storage-sections'
import { lightAngleLimitForType, lightPresetCatalog } from '../../lights/studio-app-light-data'
import { normalizeFeatureWallStyle, normalizeMuralArtStyle } from '../../../materials/studio-surface'
import { normalizeModelRemark as normalizeModelRemark2 } from '../../../../shared/model-remarks'
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
} from '../../items/studio-item-posture'
import { stripLoadRecord } from '../../lights/strip-light/strip-light-spec'
import { remapOpeningsToWalls } from '../../../plan/studio-wall'

/**
 * 智能屏安装方式字段：只有智能屏才有；缺失时按 type 反推（老文档只有 `smart-display-wall`）。
 * 抽成函数是为了不给下面那个巨型归一化函数再加两个分支（它有复杂度预算）。
 */
function smartDisplayMountRecord(item: Record<string, unknown> | null | undefined): Record<string, string> {
  const type = String(item?.type || '')
  if (!type.startsWith('smart-display')) return {}
  return {
    smartDisplayMount: item?.smartDisplayMount === 'wall' || type === 'smart-display-wall' ? 'wall' : 'tabletop',
  }
}

export const maxTextureUnitLimit = 8,
  planLabelDefaultColor = '#e8eef6',
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
    'entry-child-mother': {
      width: 1.2,
      height: 2.2,
    },
    glass: {
      width: 0.9,
      height: 2.1,
    },
    'sliding-glass': {
      width: 1.8,
      height: 2.1,
    },
    'roller-shutter': {
      width: 3,
      height: 2.8,
    },
    'frame-only': {
      width: 0.9,
      height: 2.1,
    },
  }

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
      // 0.8.9 绘制页 3D 预览的光影管线：standard = 逐灯按距离/光束角投光（默认），
      // region = 按柔光范围照亮。与 3D 交互控件的 `lightingMode` 同义词，
      // 但**分开存**：控件的模式属于组件属性，绘制页的模式属于这份户型草稿。
      lightingMode: 'standard' as 'standard' | 'region',
      lightingModeVersion: 2,
      planViewRotation: 0,
      cameraView: 'free',
      cameraTopRotation: 0,
      cameraMode: 'perspective',
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
      // 物件拖动的两类吸附（0.8.7）：贴墙 / 边缘与中心对齐。默认都开。
      snapObjectWalls: true,
      snapModels: true,
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
        id: 'light-group-default',
        name: '默认灯组',
        enabled: true,
        areaId: null as any,
      },
    ],
    items: [] as any[],
  }
}

/** 逐物件材质覆盖色的**入库净化**：只接受 `{ "<GLB 材质名>": "#rrggbb" }`，键按字典序排好（让产物稳定，也避免同一份覆盖在不同页面到处重建材质）。 */
export function normalizeMaterialOverrides(rawOverrides: any) {
  if (!rawOverrides || typeof rawOverrides != 'object' || Array.isArray(rawOverrides)) return null
  const normalizedEntries = Object.entries(rawOverrides)
    .filter(
      ([materialName, overrideColor]) =>
        Boolean(materialName) && typeof overrideColor == 'string' && /^#[0-9a-f]{6}$/i.test(overrideColor),
    )
    .map(([materialName, overrideColor]) => [String(materialName).slice(0, 120), String(overrideColor).toLowerCase()])
    .sort(([materialNameA], [materialNameB]) =>
      materialNameA < materialNameB ? -1 : materialNameA > materialNameB ? 1 : 0,
    )
  return normalizedEntries.length ? Object.fromEntries(normalizedEntries) : null
}

/** 0.8.0 四轮胎压：关闭时整段丢弃，开启时按白名单保留样式与四轮 `sensor.*`。 */
function normalizeTirePressure(rawTirePressure: any) {
  if (rawTirePressure?.enabled !== true) return null
  const wheels = ['fl', 'fr', 'rl', 'rr'].reduce((collectedWheels: Record<string, string>, wheelKey) => {
    const wheelEntityId = rawTirePressure.wheels?.[wheelKey]
    typeof wheelEntityId == 'string' &&
      /^sensor\.[a-z0-9_]+$/.test(wheelEntityId) &&
      (collectedWheels[wheelKey] = wheelEntityId)
    return collectedWheels
  }, {})
  return {
    enabled: true,
    mode: rawTirePressure.mode === 'named' ? 'named' : 'compact',
    fontSize: clamp2(finite2(rawTirePressure.fontSize, 14), 8, 40),
    opacity: clamp2(finite2(rawTirePressure.opacity, 0.8), 0.1, 1),
    wheels,
  }
}

function normalizeItemMaterialStyle(rawItemRecord: any, externalModelRegistry: any) {
  const modelType = externalModelRegistry.modelTypeForItem(rawItemRecord),
    materialStyle = normalizeMaterialStyle(modelType, rawItemRecord?.materialStyle)
  return materialStyle === MATERIAL_STYLE_AUTO ? null : materialStyle
}

function doorMaterialFields(rawDoor: any) {
  const materialStyle = normalizeMaterialStyle('door', rawDoor?.materialStyle),
    materialOverrides = normalizeMaterialOverrides(rawDoor?.materialOverrides),
    materialSurfaceOverrides = normalizeMaterialSurfaceOverrides(rawDoor?.materialSurfaceOverrides)
  return {
    ...(materialStyle === MATERIAL_STYLE_AUTO ? {} : { materialStyle }),
    ...(materialOverrides ? { materialOverrides } : {}),
    ...(Object.keys(materialSurfaceOverrides).length ? { materialSurfaceOverrides } : {}),
  }
}

export function normalizeMaterialSurfaceOverrides(rawSurfaceOverrides: any) {
  if (!rawSurfaceOverrides || typeof rawSurfaceOverrides != 'object' || Array.isArray(rawSurfaceOverrides)) return {}
  const normalizedEntries = Object.entries(rawSurfaceOverrides)
    .map(([materialName, surfaceOverride]): [string, Record<string, any>] | null => {
      if (!materialName || !surfaceOverride || typeof surfaceOverride != 'object') return null
      const normalizedSurfaceOverride: Record<string, any> = {}
      for (const surfaceKey of ['roughness', 'metalness']) {
        const surfaceValue = (surfaceOverride as any)[surfaceKey]
        typeof surfaceValue == 'number' &&
          Number.isFinite(surfaceValue) &&
          ((normalizedSurfaceOverride as any)[surfaceKey] =
            Math.round(Math.min(1, Math.max(0, surfaceValue)) * 100) / 100)
      }
      return Object.keys(normalizedSurfaceOverride).length
        ? [String(materialName).slice(0, 120), normalizedSurfaceOverride]
        : null
    })
    .filter((entry): entry is [string, Record<string, any>] => entry !== null)
    .sort(([materialNameA], [materialNameB]) =>
      materialNameA < materialNameB ? -1 : materialNameA > materialNameB ? 1 : 0,
    )
  return normalizedEntries.length ? Object.fromEntries(normalizedEntries) : {}
}

/** 某个槽位上的表面覆盖（已净化）； */
/** 自定义装饰的资产 id 形状（与后端 `MODEL_UUID` 同一正则）。 */
const USER_DECORATION_ASSET_ID = /^[0-9a-f]{32}$/

/**
 * 剥掉 0.8.9 上游的 `model:` 前缀（本仓存裸 hex，上游带前缀）。
 *
 * 不剥的后果：从 0.8.9 导入的户型里，装饰的 `assetId` 会被清成空串
 * —— 物件还在原位，但渲染不出任何网格（表现为「导入后装饰消失」）。
 */
function strippedDecorationAssetId(raw: unknown): string {
  const text = String(raw || '').toLowerCase()
  return text.startsWith('model:') ? text.slice('model:'.length) : text
}
/** 展示名上限（与后端 `MODEL_NAME_LIMIT` 同口径）。 */
const USER_DECORATION_NAME_LIMIT = 64

/**
 * 自定义装饰条目净化。
 *
 * 只带 `assetId` / `name` / `modelScale` 三个额外字段：
 * - 非 ``user-decoration`` 返回空对象（调用方直接展开，不给大函数加三元）；
 * - `assetId` 非法时**保留条目但标记为空**（`assetId: ''`），由 UI 显示「模型已失联」，
 *   比整条丢弃更接近用户预期（物体还在原位，只是暂时画不出来）；
 * - `modelScale` 夹到 `0.05..20`，避免一份坏草稿把场景撑爆。
 */
export function normalizeUserDecorationRecord(rawItemRecord: Record<string, unknown> | null | undefined) {
  if (rawItemRecord?.type !== 'user-decoration') return {}
  // 双键读取：0.8.9 上游存 `modelAssetId` / `modelName`，本仓存 `assetId` / `name`。
  // 只读一边的后果是「从 0.8.9 导入的装饰拿不到 assetId，物件在原位但画不出来」。
  const assetId = strippedDecorationAssetId(rawItemRecord?.assetId ?? rawItemRecord?.modelAssetId)
  const rawNameSource = rawItemRecord?.name ?? rawItemRecord?.modelName
  const rawName = typeof rawNameSource === 'string' ? rawNameSource.trim() : ''
  return {
    assetId: USER_DECORATION_ASSET_ID.test(assetId) ? assetId : '',
    name: rawName.slice(0, USER_DECORATION_NAME_LIMIT),
    // 同时写出上游键名：这份文档若被 0.8.9 打开，`modelAssetId` / `modelName` 仍需可读。
    // 带 `model:` 前缀是上游 `isDecorationAssetId` 的要求。
    modelAssetId: USER_DECORATION_ASSET_ID.test(assetId) ? `model:${assetId}` : '',
    modelName: rawName.slice(0, USER_DECORATION_NAME_LIMIT),
    modelScale: clamp2(finite2(rawItemRecord?.modelScale, 1), 0.05, 20),
  }
}

export function normalizeScenePayload(rawScene: any, externalModelRegistry: any) {
  const kd2 = createStudioDocument()
  if (!rawScene || typeof rawScene != 'object') return kd2
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
            id: String(rawWall?.id || generateId('wall')),
            start: normalizePoint2(rawWall?.start),
            end: normalizePoint2(rawWall?.end),
            height: clamp2(finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8), 0.01, 6),
            thickness: clamp2(finite2(rawWall?.thickness, rawScene.settings?.wallThickness || 0.12), 0.01, 3),
            opacity:
              rawWall?.opacity === null || rawWall?.opacity === undefined || rawWall?.opacity === ''
                ? null
                : clamp2(
                    finite2(rawWall.opacity, rawScene.settings?.wallOpacity ?? defaultViewSettings.wallOpacity),
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
            id: String(rawWindow?.id || generateId('window')),
            wallId: String(rawWindow?.wallId || ''),
            t: clamp2(finite2(rawWindow?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawWindow?.width, 1.4), 0.3, 20),
            height: clamp2(finite2(rawWindow?.height, 1.35), 0.3, 20),
            sill: clamp2(finite2(rawWindow?.sill, 0.85), 0, 20),
            hasDivider: rawWindow?.hasDivider !== false,
            // 自定义窗型（0.8.4）必须原样带过：这里只挑固定字段，少写一行就等于
            // 「保存一次，窗型设计全部退回普通窗」——载入时被丢掉，下一次整份 PUT 就再也写不回去。
            ...(rawWindow?.windowDesign ? { windowDesign: structuredClone(rawWindow.windowDesign) } : {}),
            // 窗户备注同样是 `WindowRecord` 的正式字段（3D 里窗扇模型的显示名用它）。
            ...(typeof rawWindow?.remark === 'string' && rawWindow.remark ? { remark: rawWindow.remark } : {}),
          }))
          .filter((windowCandidate: any) => wallIdSet.has(windowCandidate.wallId))
      : [],
    doorRecords = Array.isArray(rawScene.doors)
      ? rawScene.doors
          .map((rawDoor: any) => ({
            id: String(rawDoor?.id || generateId('door')),
            remark: normalizeModelRemark2(rawDoor?.remark),
            wallId: String(rawDoor?.wallId || ''),
            t: clamp2(finite2(rawDoor?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawDoor?.width, 0.9), 0.55, 20),
            height: clamp2(finite2(rawDoor?.height, 2.1), 1.8, 20),
            sill: 0,
            doorType: Object.hasOwn(doorTypeCatalog, rawDoor?.doorType) ? rawDoor.doorType : 'solid',
            hinge: rawDoor?.hinge === 'right' ? 'right' : 'left',
            swing: rawDoor?.swing === -1 ? -1 : 1,
            ...(typeof rawDoor?.defaultOpening === 'number' && Number.isFinite(rawDoor.defaultOpening)
              ? { defaultOpening: clamp2(rawDoor.defaultOpening, 0, 100) }
              : {}),
            ...doorMaterialFields(rawDoor),
          }))
          .filter((doorCandidate: any) => wallIdSet.has(doorCandidate.wallId))
      : [],
    railingRecords = Array.isArray(rawScene.railings)
      ? rawScene.railings
          .map((rawRailing: any) => ({
            id: String(rawRailing?.id || generateId('railing')),
            wallId: String(rawRailing?.wallId || ''),
            t: clamp2(finite2(rawRailing?.t, 0.5), 0, 1),
            width: clamp2(finite2(rawRailing?.width, 2), 0.3, 20),
            height: clamp2(finite2(rawRailing?.height, 1.1), 0.5, 3),
            sill: 0,
          }))
          .filter((railingCandidate: any) => wallIdSet.has(railingCandidate.wallId))
      : [],
    lightGroupRecords: any = [],
    lightGroupIdSet = new Set()
  if (Array.isArray(rawScene.lightGroups))
    for (const rawLightGroup of rawScene.lightGroups) {
      const lightGroupIdString = String(rawLightGroup?.id || generateId('light-group'))
      lightGroupIdSet.has(lightGroupIdString) ||
        (lightGroupIdSet.add(lightGroupIdString),
        lightGroupRecords.push({
          id: lightGroupIdString,
          name: normalizeLabelText2(rawLightGroup?.name, '灯组 ' + (lightGroupRecords.length + 1), 24),
          enabled: rawLightGroup?.enabled !== false,

          areaId: String(rawLightGroup?.areaId || '').trim() || null,
        }))
    }
  const ensureDefaultLightGroup = (requestedGroupName = '默认灯组') => {
    const normalizedGroupName = normalizeLabelText2(requestedGroupName, '默认灯组', 24),
      existingLightGroup = lightGroupRecords.find((groupNameMatch: any) => groupNameMatch.name === normalizedGroupName)
    if (existingLightGroup) return existingLightGroup
    const newLightGroupRecord = {
      id: generateId('light-group'),
      name: normalizedGroupName,
      enabled: true,
      areaId: null as any,
    }
    return (
      lightGroupRecords.push(newLightGroupRecord), lightGroupIdSet.add(newLightGroupRecord.id), newLightGroupRecord
    )
  }
  lightGroupRecords.length ||
    (lightGroupRecords.push({
      id: 'light-group-default',
      name: '默认灯组',
      enabled: true,
      areaId: null as any,
    }),
    lightGroupIdSet.add('light-group-default'))
  let tvScreenCount = 0,
    vehicleChargingCount = 0
  const sceneItemRecords = Array.isArray(rawScene.items)
      ? rawScene.items
          .filter((rawSceneItem: any) => !['smallseat', 'entrydoor', 'car'].includes(rawSceneItem?.type))
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
              stripRecord = stripLoadRecord(rawItemRecord, itemWidth, itemDepth),
              itemHeight = clamp2(
                finite2(rawItemRecord?.height, table.height),
                itemMinimumHeight2(rawItemRecord?.type),
                6,
              ),
              isDesktopTable =
                rawItemRecord?.type === 'desktop' &&
                Math.abs(itemWidth - 1.2) < 0.01 &&
                Math.abs(itemDepth - 0.65) < 0.01,
              isPlantScale =
                rawItemRecord?.type === 'plant' &&
                Math.abs(itemWidth - 0.6) < 0.01 &&
                Math.abs(itemDepth - 0.6) < 0.01 &&
                Math.abs(itemHeight - 1.15) < 0.01,
              isToiletScale =
                rawItemRecord?.type === 'toilet' &&
                Math.abs(itemWidth - 0.7) < 0.01 &&
                Math.abs(itemDepth - 0.42) < 0.01,
              isFloorLampScale =
                rawItemRecord?.type === 'floorlamp' &&
                Math.abs(itemWidth - 0.9) < 0.01 &&
                Math.abs(itemDepth - 0.45) < 0.01 &&
                Math.abs(itemHeight - 1.8) < 0.01,
              isRugThin = rawItemRecord?.type === 'rug' && itemHeight >= 0.045,
              isDownlightSmall = rawItemRecord?.type === 'downlight' && itemWidth < 0.3 && itemDepth < 0.3,
              isPianoScale = rawItemRecord?.type === 'piano' && itemDepth < 1,
              downlight = (lightPresetCatalog as any)[rawItemRecord?.type] || lightPresetCatalog.downlight,
              text = lampItemTypeSet.has(rawItemRecord?.type)
                ? lightGroupIdSet.has(String(rawItemRecord?.lightGroupId || ''))
                  ? String(rawItemRecord.lightGroupId)
                  : ensureDefaultLightGroup(rawItemRecord?.lightGroup || '默认灯组').id
                : '',
              tvScreenIndex = rawItemRecord?.type === 'tv' ? ++tvScreenCount : 0,
              vehicleChargingIndex = isVehicleModelType(rawItemRecord?.type) ? ++vehicleChargingCount : 0
            return {
              ...normalizeCourtyardDrawing2(rawItemRecord),
              ...(rawItemRecord?.type === 'mural'
                ? {
                    muralStyle: normalizeMuralArtStyle(rawItemRecord?.muralStyle),
                  }
                : {}),
              ...(rawItemRecord?.type === 'featurewall'
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
                    materialStyle: normalizeItemMaterialStyle(rawItemRecord, externalModelRegistry),
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
              id: String(rawItemRecord?.id || generateId('item')),
              remark: normalizeModelRemark2(rawItemRecord?.remark),
              type:
                rawItemRecord?.type === 'rounddiningtableturntable'
                  ? 'rounddiningtable'
                  : (itemTypeCatalog as any)[rawItemRecord?.type]
                    ? rawItemRecord.type
                    : 'table',
              x: finite2(rawItemRecord?.x),
              y: finite2(rawItemRecord?.y),
              rotation: stripRecord ? stripRecord.rotation : finite2(rawItemRecord?.rotation),
              width: stripRecord
                ? stripRecord.width
                : isDesktopTable ||
                    isPlantScale ||
                    isFloorLampScale ||
                    isToiletScale ||
                    isDownlightSmall ||
                    isPianoScale
                  ? table.width
                  : itemWidth,
              depth: stripRecord
                ? stripRecord.depth
                : isDesktopTable ||
                    isPlantScale ||
                    isFloorLampScale ||
                    isToiletScale ||
                    isDownlightSmall ||
                    isPianoScale
                  ? table.depth
                  : itemDepth,
              height:
                (rawItemRecord?.type === 'sideboard' && itemHeight < 1.4) ||
                isDesktopTable ||
                isPlantScale ||
                isToiletScale ||
                isRugThin ||
                isPianoScale
                  ? table.height
                  : itemHeight,
              ...(rawItemRecord?.type === 'fan' ? fanDimensions2(rawItemRecord) : {}),
              elevation: clamp2(
                finite2(rawItemRecord?.elevation, table.elevation || 0),
                itemMinimumElevation(rawItemRecord?.type),
                6,
              ),
              ...(rawItemRecord?.type === 'airer' ? airerDimensions2(rawItemRecord) : {}),
              ...(['camera', 'presence'].includes(rawItemRecord?.type)
                ? {
                    verticalRotation: clamp2(finite2(rawItemRecord?.verticalRotation, 0), -180, 180),
                  }
                : {}),
              color:
                rawItemRecord?.type === 'pillar'
                  ? table.color
                  : /^#[0-9a-f]{6}$/i.test(rawItemRecord?.color || '')
                    ? rawItemRecord.color
                    : table.color,
              ...(rawItemRecord?.type === 'planlabel'
                ? {
                    title: normalizeLabelText2(rawItemRecord?.title, '家庭总览', 24),
                    subtitle: normalizeLabelText2(rawItemRecord?.subtitle, 'HOME PLAN', 36),
                    titleSpacing: clamp2(finite2(rawItemRecord?.titleSpacing, 1.05), 0, 1.8),
                    subtitleSpacing: clamp2(finite2(rawItemRecord?.subtitleSpacing, 0.08), 0, 0.6),
                    lineLength: clamp2(finite2(rawItemRecord?.lineLength, 0.86), 0.3, 1),
                    labelColor: normalizePlanLabelColor(rawItemRecord?.labelColor),
                  }
                : {}),
              ...(rawItemRecord?.type === 'tv'
                ? {
                    screenEnabled: rawItemRecord?.screenEnabled !== false,
                    screenLayerName: normalizeLabelText2(
                      rawItemRecord?.screenLayerName,
                      '电视画面 ' + tvScreenIndex,
                      24,
                    ),
                    tvMountStyle: tvMountStyleSet.has(rawItemRecord?.tvMountStyle)
                      ? rawItemRecord.tvMountStyle
                      : 'standard',
                  }
                : {}),
              ...(isVehicleModelType(rawItemRecord?.type)
                ? {
                    chargingEnabled: rawItemRecord?.chargingEnabled === true,
                    chargingLayerName: normalizeLabelText2(
                      rawItemRecord?.chargingLayerName,
                      '汽车充电 ' + vehicleChargingIndex,
                      24,
                    ),
                    ...(() => {
                      const tirePressure = normalizeTirePressure(rawItemRecord?.tirePressure)
                      return tirePressure ? { tirePressure } : {}
                    })(),
                  }
                : {}),
              ...(rawItemRecord?.type === 'fridge'
                ? {
                    fridgeStyle: rawItemRecord.fridgeStyle === 'double' ? 'double' : 'standard',
                  }
                : {}),
              /** 0.8.0 柜门结构：只有衣柜 / 储物柜认这个字段，缺省整门。 */
              ...(STORAGE_SECTION_TYPES.has(rawItemRecord?.type)
                ? {
                    cabinetSections: rawItemRecord.cabinetSections === 'two-section' ? 'two-section' : 'full',
                  }
                : {}),
              /**
               * 排气扇：`depth` 是吸墙后沿墙面法线方向的机身厚（缺省 0.16，挂墙时会被墙厚覆写），
               * `elevation` 是离地中心高（缺省 1.83，与卡片一致）。
               */
              ...(rawItemRecord?.type === 'exhaust-fan'
                ? {
                    depth: clamp2(finite2(rawItemRecord?.depth, 0.16), 0.04, 0.6),
                    elevation: clamp2(finite2(rawItemRecord?.elevation, 1.83), 0, 6),
                  }
                : {}),
              ...(rawItemRecord?.type === 'pipelinewaterpurifier'
                ? {
                    pipelineDispenserStyle: normalizePipelineDispenserStyle(rawItemRecord?.pipelineDispenserStyle),
                  }
                : {}),
              // 智能屏安装方式：0.8.7 作为独立字段保存；老文档缺字段时按 type 反推。
              ...smartDisplayMountRecord(rawItemRecord),
              ...(rawItemRecord?.type === 'curtain'
                ? {
                    curtainPosition: ['left', 'right', 'split'].includes(rawItemRecord?.curtainPosition)
                      ? rawItemRecord.curtainPosition
                      : 'split',
                    ...normalizeCurtainTrack2(rawItemRecord),
                    depth: curtainFootprintDepth2(rawItemRecord),
                  }
                : {}),
              ...(openStairTypeSet.has(rawItemRecord?.type)
                ? {
                    stairDirection: ['left', 'right'].includes(rawItemRecord?.stairDirection)
                      ? rawItemRecord.stairDirection
                      : 'right',
                  }
                : {}),
              ...(rawItemRecord?.type === 'shoecabinet'
                ? {
                    shoeCabinetMirrored: rawItemRecord?.shoeCabinetMirrored === true,
                  }
                : {}),
              ...(rawItemRecord?.type === 'pillar'
                ? {
                    pillarShape: normalizePillarShape2(rawItemRecord?.pillarShape),
                    pillarAxis: normalizePillarAxis2(rawItemRecord?.pillarAxis),
                  }
                : {}),
              // 0.8.9 自定义装饰：模型库条目（32 位 hex）+ 展示名 + 等比缩放。
              // 少了这三项，保存一次就会退化成一张普通桌子（`type` 兜底 `table`）。
              // 非装饰类型时函数返回 `{}`，展开即为空。
              ...normalizeUserDecorationRecord(rawItemRecord),
              ...(rawItemRecord?.type === 'sofa-l'
                ? {
                    sofaChaiseSide: rawItemRecord.sofaChaiseSide === 'left' ? 'left' : 'right',
                  }
                : {}),
              ...(roundTableTypeSet.has(rawItemRecord?.type)
                ? {
                    roundTableTurntable:
                      rawItemRecord?.type === 'rounddiningtableturntable' ||
                      rawItemRecord?.roundTableTurntable === true,
                  }
                : {}),
              ...(lampItemTypeSet.has(rawItemRecord?.type)
                ? {
                    lightGroupId: text,
                    verticalRotation:
                      rawItemRecord?.type === 'striplight'
                        ? normalizeFullRotation2(rawItemRecord?.verticalRotation)
                        : clamp2(finite2(rawItemRecord?.verticalRotation, 0), -90, 90),
                    ...(rawItemRecord?.type === 'striplight'
                      ? {
                          lightSourceVisible: rawItemRecord?.lightSourceVisible !== false,
                          // 安装方式 + 位姿（旧档迁移；覆盖上面的 verticalRotation）。
                          ...stripRecord,
                        }
                      : {}),
                    lightTemperature: clamp2(
                      finite2(rawItemRecord?.lightTemperature, downlight.temperature),
                      2200,
                      6500,
                    ),
                    lightBrightness: clamp2(finite2(rawItemRecord?.lightBrightness, downlight.brightness), 0, 100),
                    lightRange: clamp2(finite2(rawItemRecord?.lightRange, downlight.range), 0.5, 10),
                    lightAngle: clamp2(
                      finite2(rawItemRecord?.lightAngle, downlight.angle),
                      15,
                      lightAngleLimitForType(rawItemRecord?.type),
                    ),
                  }
                : {}),
            }
          })
      : [],
    backgroundAsset =
      rawScene.background?.assetId && rawScene.background?.url
        ? {
            assetId: String(rawScene.background.assetId),
            url: String(rawScene.background.url),
            name: String(rawScene.background.name || '户型底图'),
            width: clamp2(finite2(rawScene.background.width, 1), 1, 8192),
            height: clamp2(finite2(rawScene.background.height, 1), 1, 8192),
          }
        : null,
    tf2 = remapOpeningsToWalls(wallRecords, windowRecords, doorRecords, pixelsPerMeterValue, railingRecords)
  return {
    schemaVersion: 2,
    background: backgroundAsset,
    calibration: calibrationSettings,
    settings: {
      wallHeight: clamp2(finite2(rawScene.settings?.wallHeight, 2.8), 0.01, 6),
      wallThickness: clamp2(finite2(rawScene.settings?.wallThickness, 0.12), 0.01, 3),
      wallOpacity: clamp2(finite2(rawScene.settings?.wallOpacity, defaultViewSettings.wallOpacity), 0, 1),
      floorEdgeVisible: rawScene.settings?.floorEdgeVisible !== false,
      lightingMode: rawScene.settings?.lightingMode === 'region' ? 'region' : 'standard',
      lightingModeVersion: 2,
      planViewRotation: (((Math.round(finite2(rawScene.settings?.planViewRotation, 0) / 90) * 90) % 360) + 360) % 360,
      cameraView: rawScene.settings?.cameraView === 'top' ? 'top' : 'free',
      cameraTopRotation: (((Math.round(finite2(rawScene.settings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
      cameraMode: rawScene.settings?.cameraMode === 'orthographic' ? 'orthographic' : 'perspective',
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
      snapObjectWalls: rawScene.settings?.snapObjectWalls !== false,
      snapModels: rawScene.settings?.snapModels !== false,
      snapTolerance: clamp2(Math.round(finite2(rawScene.settings?.snapTolerance, 13)), 6, 24),
      previewPanelRatio: clamp2(finite2(rawScene.settings?.previewPanelRatio, 0.52), 0.06, 0.94),
      detailsPanelWidthRatio: clamp2(finite2(rawScene.settings?.detailsPanelWidthRatio, 0.29), 0.08, 0.86),
    },
    walls: tf2.walls,
    windows: tf2.windows,
    doors: tf2.doors,
    railings: tf2.railings,
    lightGroups: lightGroupRecords,
    items: sceneItemRecords,
  }
}

/** 铭牌颜色的唯一收口：任何来源都要先过这里，避免写进非法色值。 */
export function normalizePlanLabelColor(candidateColor: any) {
  return /^#[0-9a-f]{6}$/i.test(String(candidateColor || '')) ? candidateColor : planLabelDefaultColor
}

/** 暖阳原木下，仍是默认色的铭牌改用主题的字色 / 底线色；`line` 为 null 时底线由字色派生。 */
export function planLabelThemeColors(
  candidateColor: unknown,
  themePalette: { warmWood?: boolean; planLabelText?: string; planLabelLine?: string } | null | undefined,
): { text: string; line: string | null } {
  const text = normalizePlanLabelColor(candidateColor)
  return themePalette?.warmWood && themePalette.planLabelText && text.toLowerCase() === planLabelDefaultColor
    ? { text: themePalette.planLabelText, line: themePalette.planLabelLine || null }
    : { text, line: null }
}
