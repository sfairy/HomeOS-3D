import {
  anchorGate as anchorGate2,
  syncCourtyardGates as syncCourtyardGates2,
  remapCourtyardAttachments as remapCourtyardAttachments2,
} from '../plan/courtyard-drawing'
import { airerDimensions as airerDimensions2 } from '../items/model/airer'
import { setPipelineDispenserStyle } from '../items/pipeline-dispenser'
import { fanDimensions as fanDimensions2 } from '../items/model/fan'
import { normalizeMuralArtStyle, normalizeFeatureWallStyle } from '../materials/studio-surface'
import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from '@app/shared/scene/studio-curtain-track'
import {
  clamp as clamp2,
  clampWindowT as clampWindowT2,
  defaultDoorOpening,
  closedWallPolygons,
} from '../plan/geometry'
import {
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumElevation,
  itemMinimumFootprint as itemMinimumFootprint2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
  isCourtyardDrawing as isCourtyardDrawing2,
} from '../loaders/studio-normalization'
import { normalizeModelRemark as normalizeModelRemark2 } from '../../app/shared/model-remarks'
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
} from '../items/studio-item-posture'
import { applyStripInspectorPose, applyStripMountSelection } from '../lights/strip-light'
import {
  itemTypeCatalog,
  lampItemTypeSet,
  openStairTypeSet,
  roundTableTypeSet,
  sofaMinDimensions,
  tvMountStyleSet,
} from '../items/item-catalog'
import { syncLightShapeAndRepaint } from '../lights/light-areas'
import { STORAGE_SECTION_TYPES, storageSectionStyle } from '../items/studio-storage-sections'
import { setTvMountStyle } from '../items/model/television-proportions'
import { type StudioControlElement } from '../studio-app-types'
import { lightPresetCatalog, lightAngleLimitForType } from '../lights/studio-app-light-data'
import { doorTypeCatalog, normalizePlanLabelColor } from '../scene/payload/studio-scene-payload'
import { type StudioAppContext } from '../app-context'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { snapItemToSurface as snapItemToSurface2 } from '../items/placement/surface-snap'
import { snapExhaustFan } from '../items/model/exhaust-fan'
import {
  isCourtyardPlanItem as isCourtyardPlanItem2,
  courtyardToolAllowed as courtyardToolAllowed2,
} from '../plan/courtyard'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { patchStudioFacadeState } from '@/studio/engine/studio-facade'
import { generateId } from '../ui/studio-app-helpers'
import { FLOOR_REGION_ERROR, FLOOR_REGION_PROMPT } from '../plan/studio-floor-region'
import {
  MIN_SPLIT_LENGTH,
  armSplit,
  cancelSplit,
  createFloorRegionInteraction,
  floorRegionTitle,
  pointInsidePolygon,
  regionHitsWithBounds,
  setSplitStart,
  type FloorRegionInteraction,
  type PlanPoint,
} from '../plan/studio-floor-region'
import { splitFloorRegionByLine, type FloorRegionSplitSide } from '../plan/studio-floor-region'
import {
  type FloorFinish,
  type FloorPoint,
  type FloorRegion,
  type FloorToneKind,
  clampFloorTone,
  floorToneKind,
} from '../plan/studio-floor'
import { floorRegionInspectorView, paintFloorRegionInspector } from '../plan/floor-region-inspector'
import { pointInPolygon, polygonArea, subtractPolygonLoops } from '../plan/geometry'

/**
 * 输入框的空值语义是「沿用门型默认」，必须删字段而不是写 0；
 * 有值时按 0–100 收口，越界输入回落门型默认。
 */
function applyDoorOpeningInput(door: { defaultOpening?: number; doorType?: string }, input: HTMLInputElement) {
  if (input.value === '') {
    delete door.defaultOpening
    return
  }
  door.defaultOpening = clamp2(finite2(input.value, defaultDoorOpening(door)), 0, 100)
}
/** 灯具提交时的高：灯带的高（截面厚度）由用户在尺寸里设，其余灯具回到目录默认值。 */
function lampItemHeight(lamp: { type: string; height?: number }) {
  return lamp.type === 'striplight'
    ? lamp.height
    : (itemTypeCatalog as Record<string, { height?: number }>)[lamp.type]?.height
}
export interface ApplyToolSettingDeps {
  appCtx: StudioAppContext
  applyPlacementChange: any
  captureUndoSnapshot: any
  getLightGroups: any
  getPixelsPerMeter: any
  getSelectedObject: any
  isSelectionAllowed: any
  itemLightSourceVisibleInput: any
  itemStripRollInput: any
  markDocumentDirty: any
  refreshScopeItems: any
  refreshStudioUi: any
  resolvePreviewScope: any
  selectElement: any
  validateSelectionChange: any
}

export function applyToolSetting(deps: ApplyToolSettingDeps, selectedToolName: any) {
  const {
    appCtx,
    applyPlacementChange,
    captureUndoSnapshot,
    getLightGroups,
    getPixelsPerMeter,
    getSelectedObject,
    isSelectionAllowed,
    itemLightSourceVisibleInput,
    itemStripRollInput,
    markDocumentDirty,
    refreshScopeItems,
    refreshStudioUi,
    resolvePreviewScope,
    selectElement,
    validateSelectionChange,
  } = deps

  const toolPlacedElement = getSelectedObject()
  if (!toolPlacedElement || appCtx.selectedItem?.kind !== selectedToolName || !isSelectionAllowed(appCtx.selectedItem))
    return
  const yr2 =
      selectedToolName === 'item'
        ? resolvePreviewScope(toolPlacedElement)
        : ['door', 'window', 'railing'].includes(selectedToolName)
          ? 'architecture'
          : 'all',
    ft9 = captureUndoSnapshot()
  /** 立柱切到半圆时进深被咬合过，末尾要回刷检查器里的进深输入。 */
  let pillarDepthSnapped = false
  /** 灯带换了安装方式：建议离地高度和倾斜 / 翻滚输入的显隐都变了，末尾同样要回刷检查器。 */
  let stripMountChanged = false
  // 模型备注是编辑期元数据：与几何字段同源提交，但空串要**删键**而不是留空串，
  // 否则 `withoutModelRemarks` 之外的比较（保存载荷 / 场景同步）会把「从没写过备注」
  // 和「清空过备注」当成两种不同状态。
  if (selectedToolName === 'item' || selectedToolName === 'door') {
    const modelRemarkInput = selectElement('#model-remark')
    if (modelRemarkInput && !modelRemarkInput.closest('[hidden]')) {
      const nextModelRemark = normalizeModelRemark2(modelRemarkInput.value)
      modelRemarkInput.value = nextModelRemark
      if (nextModelRemark !== (toolPlacedElement.remark || '')) {
        if (nextModelRemark) toolPlacedElement.remark = nextModelRemark
        else delete toolPlacedElement.remark
      }
    }
  }
  if (selectedToolName === 'wall')
    (toolPlacedElement.height = clamp2(
      finite2(selectElement('#wall-height').value, toolPlacedElement.height),
      0.01,
      6,
    )),
      (toolPlacedElement.thickness = clamp2(
        finite2(selectElement('#wall-thickness').value, toolPlacedElement.thickness),
        0.01,
        3,
      )),
      (toolPlacedElement.opacity =
        selectElement('#wall-opacity-mode').value === 'custom'
          ? clamp2(
              finite2(selectElement('#wall-opacity').value, appCtx.studioState.settings.wallOpacity * 100),
              0,
              100,
            ) / 100
          : null),
      (toolPlacedElement.allowOpenEnd = selectElement('#wall-open-end-mode').value === 'allowed'),
      (appCtx.studioState.settings.wallHeight = toolPlacedElement.height),
      (appCtx.studioState.settings.wallThickness = toolPlacedElement.thickness)
  else {
    if (selectedToolName === 'window') {
      ;(toolPlacedElement.width = clamp2(
        finite2(selectElement('#window-width').value, toolPlacedElement.width),
        0.3,
        20,
      )),
        (toolPlacedElement.height = clamp2(
          finite2(selectElement('#window-height').value, toolPlacedElement.height),
          0.3,
          20,
        )),
        (toolPlacedElement.sill = clamp2(finite2(selectElement('#window-sill').value, toolPlacedElement.sill), 0, 20)),
        (toolPlacedElement.hasDivider = selectElement('#window-divider').value !== 'without')
      const toolAnchorWallRecord = appCtx.studioState.walls.find(
        (toolAnchorWall) => toolAnchorWall.id === toolPlacedElement.wallId,
      )
      toolAnchorWallRecord &&
        (toolPlacedElement.t = clampWindowT2(toolAnchorWallRecord, toolPlacedElement, getPixelsPerMeter()))
    } else {
      if (selectedToolName === 'door') {
        ;(toolPlacedElement.doorType = Object.hasOwn(doorTypeCatalog, selectElement('#door-type').value)
          ? selectElement('#door-type').value
          : 'solid'),
          (toolPlacedElement.width = clamp2(
            finite2(selectElement('#door-width').value, toolPlacedElement.width),
            0.55,
            20,
          )),
          (toolPlacedElement.height = clamp2(
            finite2(selectElement('#door-height').value, toolPlacedElement.height),
            1.8,
            20,
          ))
        applyDoorOpeningInput(toolPlacedElement, selectElement('#door-default-opening'))
        const toolWindowWallRecord = appCtx.studioState.walls.find(
          (toolWindowWall) => toolWindowWall.id === toolPlacedElement.wallId,
        )
        toolWindowWallRecord &&
          (toolPlacedElement.t = clampWindowT2(toolWindowWallRecord, toolPlacedElement, getPixelsPerMeter()))
      } else {
        if (selectedToolName === 'railing') {
          ;(toolPlacedElement.width = clamp2(
            finite2(selectElement('#railing-width').value, toolPlacedElement.width),
            0.3,
            20,
          )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement('#railing-height').value, toolPlacedElement.height),
              0.5,
              3,
            ))
          const toolDoorWallRecord = appCtx.studioState.walls.find(
            (toolDoorWall) => toolDoorWall.id === toolPlacedElement.wallId,
          )
          toolDoorWallRecord &&
            (toolPlacedElement.t = clampWindowT2(toolDoorWallRecord, toolPlacedElement, getPixelsPerMeter()))
        } else {
          const toolPpm = getPixelsPerMeter() || 1
          if (
            ((toolPlacedElement.x = finite2(selectElement('#item-x').value, toolPlacedElement.x / toolPpm) * toolPpm),
            (toolPlacedElement.y = finite2(selectElement('#item-y').value, toolPlacedElement.y / toolPpm) * toolPpm),
            toolPlacedElement.type === 'fan' &&
              Object.assign(
                toolPlacedElement,
                fanDimensions2({
                  ...toolPlacedElement,
                  fanHeight: Number(selectElement('#fan-model-height').value),
                  fanScale: Number(selectElement('#fan-model-scale').value) / 100,
                }),
              ),
            (toolPlacedElement.width = clamp2(
              finite2(selectElement('#item-width').value, toolPlacedElement.width),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement('#item-height').value, toolPlacedElement.height),
              itemMinimumHeight2(toolPlacedElement.type),
              6,
            )),
            (toolPlacedElement.depth = clamp2(
              finite2(selectElement('#item-depth').value, toolPlacedElement.depth),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            toolPlacedElement.type === 'sofa-l' &&
              (toolPlacedElement.sofaChaiseSide =
                selectElement('#sofa-chaise-side').value === 'left' ? 'left' : 'right'),
            toolPlacedElement.type === 'fan' && Object.assign(toolPlacedElement, fanDimensions2(toolPlacedElement)),
            (toolPlacedElement.elevation = clamp2(
              finite2(selectElement('#item-elevation').value, toolPlacedElement.elevation || 0),
              itemMinimumElevation(toolPlacedElement.type),
              6,
            )),
            toolPlacedElement.type === 'airer' &&
              Object.assign(
                toolPlacedElement,
                airerDimensions2({
                  ...toolPlacedElement,
                  airerStyle: selectElement('#airer-style').value === 'single' ? 'single' : 'double',
                  airerExtension: Number(selectElement('#airer-extension').value),
                  airerPreview: Number(selectElement('#airer-preview').value),
                }),
              ),
            (toolPlacedElement.rotation =
              toolPlacedElement.type === 'striplight'
                ? normalizeFullRotation2(selectElement('#item-rotation').value, toolPlacedElement.rotation)
                : finite2(selectElement('#item-rotation').value, toolPlacedElement.rotation)),
            toolPlacedElement.type === 'planlabel' &&
              ((toolPlacedElement.title = normalizeLabelText2(selectElement('#label-title').value, '家庭总览', 24)),
              (toolPlacedElement.subtitle = normalizeLabelText2(
                selectElement('#label-subtitle').value,
                'HOME PLAN',
                36,
              )),
              (toolPlacedElement.titleSpacing = clamp2(
                finite2(selectElement('#label-title-spacing').value, 105) / 100,
                0,
                1.8,
              )),
              (toolPlacedElement.subtitleSpacing = clamp2(
                finite2(selectElement('#label-subtitle-spacing').value, 8) / 100,
                0,
                0.6,
              )),
              (toolPlacedElement.lineLength = clamp2(
                finite2(selectElement('#label-line-length').value, 86) / 100,
                0.3,
                1,
              )),
              (toolPlacedElement.labelColor = normalizePlanLabelColor(selectElement('#label-color').value)),
              (toolPlacedElement.height = 0.01),
              (toolPlacedElement.elevation = 0)),
            toolPlacedElement.type === 'curtain')
          ) {
            toolPlacedElement.curtainPosition = ['left', 'right', 'split'].includes(
              selectElement('#curtain-position').value,
            )
              ? selectElement('#curtain-position').value
              : 'split'
            const curtainTrack = normalizeCurtainTrack2(toolPlacedElement).curtainTrack
            ;(toolPlacedElement.curtainForm =
              selectElement('#curtain-form').value === 'roller' ? 'roller' : 'standard'),
              Object.assign(
                toolPlacedElement,
                normalizeCurtainTrack2({
                  curtainForm: toolPlacedElement.curtainForm,
                  curtainTrack: selectElement('#curtain-track').value,
                  curtainCorner: selectElement('#curtain-corner').value,
                  curtainLeftLength: selectElement('#curtain-left-length').value,
                  curtainRightLength: selectElement('#curtain-right-length').value,
                  curtainMeet: selectElement('#curtain-meet').value,
                  curtainPreview: selectElement('#curtain-preview').value,
                  curtainFabric: selectElement('#curtain-fabric').value,
                }),
              ),
              curtainTrack !== 'straight' &&
                toolPlacedElement.curtainTrack === 'straight' &&
                (toolPlacedElement.depth = 0.18),
              (toolPlacedElement.depth = curtainFootprintDepth2(toolPlacedElement))
          }
          if (
            (roundTableTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.roundTableTurntable = selectElement('#round-table-turntable').value === 'with'),
            toolPlacedElement.type === 'fridge' &&
              (toolPlacedElement.fridgeStyle =
                document.querySelector<StudioControlElement>('input[name="fridge-style"]:checked')?.value === 'double'
                  ? 'double'
                  : 'standard'),
            openStairTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.stairDirection = ['left', 'right'].includes(selectElement('#stair-direction').value)
                ? selectElement('#stair-direction').value
                : 'right'),
            toolPlacedElement.type === 'pillar' &&
              (() => {
                const nextPillarShape = normalizePillarShape2(selectElement('#pillar-shape').value),
                  previousPillarShape = normalizePillarShape2(toolPlacedElement.pillarShape)
                ;(toolPlacedElement.pillarShape = nextPillarShape),
                  (toolPlacedElement.pillarAxis = normalizePillarAxis2(selectElement('#pillar-axis').value))
                /**
                 * 刚切到「半圆」时把进深咬到半宽：真半圆的深度只能是半径，
                 * 而占位框是 width × depth 的矩形 —— 进深留在 0.45 会把半径 0.225 的
                 * 圆弧沿 Z 拉成半椭圆（深 = 直径），看上去像被压扁的桶。
                 * 只在**切入**那一下就咬合；之后手动改进深仍是半椭圆（平面轮廓与 3D 同源）。
                 */
                if (nextPillarShape !== 'semicircle' || previousPillarShape === 'semicircle') return
                const snappedDepth = clamp2(
                  toolPlacedElement.width / 2,
                  itemMinimumFootprint2(toolPlacedElement.type),
                  8,
                )
                if (Math.abs(snappedDepth - toolPlacedElement.depth) < 0.001) return
                toolPlacedElement.depth = snappedDepth
                pillarDepthSnapped = true
              })(),
            toolPlacedElement.type === 'pipelinewaterpurifier' &&
              setPipelineDispenserStyle(toolPlacedElement, selectElement('#pipeline-dispenser-style').value),
            toolPlacedElement.type === 'striplight' &&
              (stripMountChanged = applyStripMountSelection(
                toolPlacedElement,
                selectElement('#strip-mount').value,
                appCtx.studioState.settings?.wallHeight,
              )),
            toolPlacedElement.type === 'mural' &&
              (toolPlacedElement.muralStyle = normalizeMuralArtStyle(selectElement('#mural-style').value)),
            toolPlacedElement.type === 'featurewall' &&
              (toolPlacedElement.wallStyle = normalizeFeatureWallStyle(selectElement('#featurewall-style').value)),
            toolPlacedElement.type === 'tv')
          ) {
            const tvMountStyle2 = tvMountStyleSet.has(toolPlacedElement.tvMountStyle)
                ? toolPlacedElement.tvMountStyle
                : 'standard',
              tvMountStyleValue = tvMountStyleSet.has(selectElement('#tv-mount-style').value)
                ? selectElement('#tv-mount-style').value
                : 'standard'
            // 0.9.0：移动支架与**四脚落地支架**都有「落地最小尺寸」，切换逻辑收敛到
            // `setTvMountStyle`（含「离开落地件时回落到标准尺寸」「落地档 elevation 归零」）。
            tvMountStyle2 !== tvMountStyleValue &&
              setTvMountStyle(toolPlacedElement, tvMountStyleValue, sofaMinDimensions)
          }
          // 智能屏安装方式（0.8.7）：无条件调用，判断类型与是否需要换模型都在 helper 里。
          syncSmartDisplayMount(toolPlacedElement, selectElement('#smart-display-mount').value)
          STORAGE_SECTION_TYPES.has(toolPlacedElement.type) &&
            (toolPlacedElement.cabinetSections = storageSectionStyle({
              type: toolPlacedElement.type,
              cabinetSections: selectElement('#storage-section').value,
            }))
          if (lampItemTypeSet.has(toolPlacedElement.type)) {
            const downlight5 = (lightPresetCatalog as any)[toolPlacedElement.type] || lightPresetCatalog.downlight
            ;(toolPlacedElement.verticalRotation =
              toolPlacedElement.type === 'striplight'
                ? normalizeFullRotation2(
                    selectElement('#item-vertical-rotation').value,
                    toolPlacedElement.verticalRotation || 0,
                  )
                : clamp2(
                    finite2(selectElement('#item-vertical-rotation').value, toolPlacedElement.verticalRotation || 0),
                    -90,
                    90,
                  )),
              // 手调安装倾斜 / 出光方向 → 自动落成「自定义角度」，安装方式下拉要跟着回刷。
              // 同一笔提交里换过安装方式时以安装方式为准（见 helper 的 `mountChanged`）。
              toolPlacedElement.type === 'striplight' &&
                (stripMountChanged = applyStripInspectorPose(
                  toolPlacedElement,
                  itemStripRollInput.value,
                  itemLightSourceVisibleInput.checked,
                  stripMountChanged,
                )),
              (toolPlacedElement.lightGroupId = appCtx.studioState.lightGroups.some(
                (matchingLightGroup) => matchingLightGroup.id === selectElement('#light-group').value,
              )
                ? selectElement('#light-group').value
                : getLightGroups().id),
              (toolPlacedElement.lightTemperature = clamp2(
                finite2(selectElement('#light-temperature').value, downlight5.temperature),
                2200,
                6500,
              )),
              (toolPlacedElement.lightBrightness = clamp2(
                finite2(selectElement('#light-brightness').value, downlight5.brightness),
                0,
                100,
              )),
              (toolPlacedElement.lightRange = clamp2(
                finite2(selectElement('#light-range').value, downlight5.range),
                0.5,
                10,
              )),
              (toolPlacedElement.lightAngle = clamp2(
                finite2(selectElement('#light-angle').value, downlight5.angle),
                15,
                lightAngleLimitForType(toolPlacedElement.type),
              )),
              (toolPlacedElement.height = lampItemHeight(toolPlacedElement))
          } else
            ['camera', 'presence'].includes(toolPlacedElement.type) &&
              (toolPlacedElement.verticalRotation = clamp2(
                finite2(selectElement('#item-vertical-rotation').value, toolPlacedElement.verticalRotation || 0),
                -180,
                180,
              ))
        }
      }
    }
  }
  if (
    (selectedToolName === 'item' &&
      toolPlacedElement.type.startsWith('garden-gate') &&
      (anchorGate2(toolPlacedElement, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom),
      syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter())),
    !validateSelectionChange(ft9))
  ) {
    refreshStudioUi(true), refreshScopeItems(yr2)
    return
  }
  applyPlacementChange(ft9),
    (pillarDepthSnapped || stripMountChanged) && refreshStudioUi(false),
    // 照射范围/光束角只存在于灯对象上，重建被推迟（手动预览）时不会有任何画面变化；
    // 这里补一次就地同步 + 重绘，让这两个参数提交即生效（非灯具时内部直接返回 0）。
    syncLightShapeAndRepaint(appCtx, [toolPlacedElement]),
    refreshScopeItems(yr2),
    markDocumentDirty()
}

type SmartDisplayMount = 'tabletop' | 'wall'

/** 智能屏两种安装方式对应的 item type（模型与外形随之一并切换）。 */
const SMART_DISPLAY_TYPES = {
  tabletop: 'smart-display',
  wall: 'smart-display-wall',
} as const satisfies Record<SmartDisplayMount, keyof typeof itemTypeCatalog>

/** 只读需要的字段：不引入宽类型，也就能对尺寸做静态检查。 */
interface SmartDisplayItem {
  type: string
  width: number
  height: number
  depth: number
  elevation: number
  smartDisplayMount?: string
}

/** 从下拉值读出安装方式（任何非法值都按桌面款处理）。 */
export function syncSmartDisplayMount(item: SmartDisplayItem, rawMount: unknown): void {
  if (!item.type.startsWith('smart-display')) return
  applySmartDisplayMount(item, rawMount === 'wall' ? 'wall' : 'tabletop')
}

/**
 * 切换智能屏的安装方式。
 *
 * 与 0.8.7 一致的只有「等比例缩放」这一步：新尺寸 = 旧尺寸 × (新模板 / 旧模板)，
 * 这样用户把屏幕拉宽过之后，切到壁挂仍然是同样的长宽比，而不是跳回模板默认值。
 * 离地高度跟着模板走：桌面款放在柜面上、壁挂款贴墙抬高，不跟着缩放（否则壁挂会贴地）。
 */
function applySmartDisplayMount(item: SmartDisplayItem, nextMount: SmartDisplayMount): void {
  const currentMount: SmartDisplayMount =
    item.smartDisplayMount === 'wall' || item.type === 'smart-display-wall' ? 'wall' : 'tabletop'
  if (currentMount !== nextMount) {
    const previousDefinition = itemTypeCatalog[SMART_DISPLAY_TYPES[currentMount]]
    const nextDefinition = itemTypeCatalog[SMART_DISPLAY_TYPES[nextMount]]
    const previousSize = [previousDefinition.width, previousDefinition.height, previousDefinition.depth]
    const nextSize = [nextDefinition.width, nextDefinition.height, nextDefinition.depth]
    const currentSize = [Number(item.width || 0), Number(item.height || 0), Number(item.depth || 0)]
    const scaled = nextSize.map((value, index) =>
      previousSize[index] > 0 ? (value * currentSize[index]) / previousSize[index] : value,
    )
    ;[item.width, item.height, item.depth] = scaled
    item.type = SMART_DISPLAY_TYPES[nextMount]
    item.elevation = nextDefinition.elevation
  }
  item.smartDisplayMount = nextMount
}

export function setDrawingToolGroupOpen(
  _runtime: StudioAppRuntime,
  drawingToolSection: any,
  isDrawingToolGroupOpen: any,
) {
  const drawingToolToggle = drawingToolSection.querySelector('.drawing-tool-toggle')
  const drawingToolPanel = drawingToolSection.querySelector('.drawing-tool-buttons')
  if (!drawingToolToggle || !drawingToolPanel) return
  drawingToolSection.classList.toggle('open', isDrawingToolGroupOpen),
    (drawingToolPanel.hidden = !isDrawingToolGroupOpen),
    drawingToolToggle.setAttribute('aria-expanded', String(isDrawingToolGroupOpen))
}

export function closeDrawingToolGroups(runtime: StudioAppRuntime, drawingToolGroupToKeep: any = null) {
  for (const drawingToolSection of runtime.drawingToolSections)
    if (drawingToolSection !== drawingToolGroupToKeep) runtime.setDrawingToolGroupOpen(drawingToolSection, false)
}

export function syncDrawingToolGroupStates(runtime: StudioAppRuntime) {
  for (const drawingToolSection of runtime.drawingToolSections as HTMLElement[]) {
    const activeDrawingToolBadge = drawingToolSection.querySelector<StudioControlElement>('.drawing-tool-active')
    if (!activeDrawingToolBadge) continue
    const activeDrawingToolButton = drawingToolSection.querySelector<StudioControlElement>('.tool-button.active')
    activeDrawingToolBadge.textContent = ''
    if (activeDrawingToolButton) {
      const activeDrawingToolIcon = activeDrawingToolButton.querySelector('i')
      const activeDrawingToolLabel = activeDrawingToolButton.querySelector('span')
      if (activeDrawingToolIcon) {
        const badgeIcon = activeDrawingToolIcon.cloneNode(true) as HTMLElement
        const iconSource = getComputedStyle(activeDrawingToolIcon).getPropertyValue('--hb-ui-icon-source')
        if (iconSource) badgeIcon.style.setProperty('--hb-ui-icon-source', iconSource)
        activeDrawingToolBadge.append(badgeIcon)
      }
      if (activeDrawingToolLabel?.textContent) activeDrawingToolBadge.append(activeDrawingToolLabel.textContent)
    }
    ;(activeDrawingToolBadge.hidden = !activeDrawingToolButton),
      drawingToolSection.classList.toggle('has-active', Boolean(activeDrawingToolButton))
  }
}

export function selectStudioTool(runtime: StudioAppRuntime, toolId: any) {
  if (!(runtime.toolHelpMessages as any)[toolId]) return
  if (
    (toolId.startsWith('courtyard-') &&
      runtime.appCtx.activeLibraryCategory !== 'courtyard' &&
      runtime.setAssetCategory('courtyard'),
    runtime.appCtx.activeLibraryCategory === 'courtyard' && !courtyardToolAllowed2(toolId))
  ) {
    runtime.showToast('庭院编辑中户型已锁定，请先切回家居或电器。')
    return
  }

  if (runtime.appCtx.activeLibraryCategory === 'light' && toolId !== 'select' && toolId !== 'pan') {
    runtime.showToast('灯光编辑中户型已锁定，请先切回家居、电器或庭院。')
    return
  }
  const shouldWarnOpenWall =
    runtime.appCtx.activeToolName === 'wall' && toolId !== 'wall' && runtime.appCtx.wallSegmentCount > 0
  ;(runtime.appCtx.activeToolName = toolId),
    runtime.planPainter?.setTool(toolId),
    (runtime.planCanvasElement.dataset.tool = toolId),
    (runtime.planCanvasElement.style.cursor = '')
  for (const toolButton of runtime.toolButtons)
    toolButton.classList.toggle('active', toolButton.dataset.tool === toolId),
      toolButton.setAttribute('aria-pressed', String(toolButton.dataset.tool === toolId))
  patchStudioFacadeState({ activeTool: toolId })
  // 0.8.9：换工具必须清空地面选区/分割线，否则分割线会跟着带到下一个工具里。
  resetFloorRegionToolIfLeaving(toolId)
  // 无条件安装（内部幂等）：这里加 `if` 会让 `selectStudioTool` 超复杂度基线。
  installFloorRegionToolBindings(runtime)
  patchStudioFacadeState({ floorRegion: floorRegionFacadeValue(0) })
  runtime.closeDrawingToolGroups(),
    runtime.syncDrawingToolGroupStates(),
    ([runtime.activeToolLabel.textContent, runtime.toolHelpElement.textContent] =
      runtime.appCtx.activeLibraryCategory === 'light' && toolId === 'select'
        ? ['灯光编辑', '户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制']
        : runtime.appCtx.activeLibraryCategory === 'courtyard' && toolId === 'select'
          ? ['庭院编辑', '其他对象已锁定；可选择、移动、框选庭院对象，切换分类恢复编辑']
          : (runtime.toolHelpMessages as any)[toolId]),
    (runtime.finishWallButton.hidden = toolId !== 'wall' || !runtime.appCtx.segmentStartPoint),
    toolId !== 'wall' && runtime.refreshPreviewScene(),
    toolId !== 'scale' && (runtime.appCtx.previewEndPoint = null),
    (runtime.appCtx.snapHit = null),
    (runtime.appCtx.windowPlacement = null),
    (runtime.appCtx.doorPlacement = null),
    (runtime.appCtx.railingPlacement = null),
    runtime.refreshStudioView(),
    shouldWarnOpenWall &&
      runtime.showToast('当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。', 'warning')
}

export function ensureCalibrationReady(runtime: StudioAppRuntime, fallbackToolId = 'scale') {
  return runtime.getPixelsPerMeter()
    ? true
    : (runtime.showToast('请先画一条参考线并填写真实长度。', 'error'), runtime.selectStudioTool(fallbackToolId), false)
}

export function clearSelection(runtime: StudioAppRuntime) {
  if (
    ((runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(runtime.isSelectionAllowed)),
    runtime.appCtx.selectedItem &&
      !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) &&
      runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length)
  ) {
    const qa2 = runtime.getCurrentPreviewScope()
    runtime.deselectAll()
    const clearSelectionWallIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((wallDrawingEntry: any) => wallDrawingEntry.kind === 'wall')
          .map((wallDrawing: any) => wallDrawing.id),
      ),
      windowIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((windowDrawingEntry: any) => windowDrawingEntry.kind === 'window')
          .map((windowDrawing: any) => windowDrawing.id),
      ),
      doorIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((doorDrawingEntry: any) => doorDrawingEntry.kind === 'door')
          .map((doorDrawing: any) => doorDrawing.id),
      ),
      railingIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((railingDrawingEntry: any) => railingDrawingEntry.kind === 'railing')
          .map((railingDrawing: any) => railingDrawing.id),
      ),
      itemIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((itemDrawingEntry: any) => itemDrawingEntry.kind === 'item')
          .map((itemDrawing: any) => itemDrawing.id),
      )
    ;(runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter(
      (removedWall) => !clearSelectionWallIdSet.has(removedWall.id),
    )),
      (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
        (windowItem) => !windowIdSet.has(windowItem.id) && !clearSelectionWallIdSet.has(windowItem.wallId),
      )),
      (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
        (doorItem) => !doorIdSet.has(doorItem.id) && !clearSelectionWallIdSet.has(doorItem.wallId),
      )),
      (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
        (railingItem) => !railingIdSet.has(railingItem.id) && !clearSelectionWallIdSet.has(railingItem.wallId),
      )),
      (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
        (removedItem) => !itemIdSet.has(removedItem.id),
      )),
      clearSelectionWallIdSet.size && runtime.rebuildWallIndex(),
      runtime.refreshSelection(),
      runtime.refreshScopeItems(qa2),
      runtime.markDocumentDirty()
    return
  }
  const at5 = runtime.getSelectedObject()
  if (!at5 || !runtime.appCtx.selectedItem) return
  const qa3 = runtime.getCurrentPreviewScope()
  runtime.deselectAll(),
    runtime.appCtx.selectedItem.kind === 'wall'
      ? ((runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter(
          (wallById) => wallById.id !== at5.id,
        )),
        (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
          (windowByWallId) => windowByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
          (doorByWallId) => doorByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
          (railingByWallId) => railingByWallId.wallId !== at5.id,
        )),
        runtime.rebuildWallIndex())
      : runtime.appCtx.selectedItem.kind === 'window'
        ? (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
            (windowById) => windowById.id !== at5.id,
          ))
        : runtime.appCtx.selectedItem.kind === 'door'
          ? (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
              (doorById) => doorById.id !== at5.id,
            ))
          : runtime.appCtx.selectedItem.kind === 'railing'
            ? (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
                (railingById) => railingById.id !== at5.id,
              ))
            : (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
                (excludedItem) => excludedItem.id !== at5.id,
              )),
    runtime.refreshSelection(),
    runtime.refreshScopeItems(qa3),
    runtime.markDocumentDirty()
}

/**
 * 落台（拖动松手 / 新建物件 / 属性面板的「贴合台面」共用的唯一入口）。
 *
 * `explicit` 对应用户**主动**要求贴台面（属性面板那个按钮）：此时忽略「吸附」总开关与
 * `snapSurfaces` 设置 —— 与 0.8.7 `h0(..., { explicit: true })` 同口径。用户把吸附关掉
 * 是不想要「拖到哪都自动吸」，不是禁止「点一下贴上去」。
 */
export function finalizeAddedItem(
  runtime: StudioAppRuntime,
  addedItem: any,
  movingIds = [addedItem.id],
  explicit = false,
) {
  /**
   * 排气扇只吸墙、不参与台面吸附（0.8.0 在这里明确 `return`）。
   * 朝向保持拖动后的状态，只有新建路径才会先按墙走向对齐。
   */
  if (addedItem?.type === 'exhaust-fan') {
    snapExhaustFan(addedItem, runtime.appCtx.studioState.walls, runtime.getPixelsPerMeter())
    return null
  }
  // 量高度用的支撑物模型只活这一笔操作：不传缓存时每个候选都会 clone 一份且无人释放。
  const surfaceModels = new Map<string, unknown>()
  try {
    return snapItemToSurface2({
      THREE: ns2,
      item: addedItem,
      items: runtime.appCtx.studioState.items,
      pixelsPerMeter: runtime.getPixelsPerMeter(),
      enabled: explicit || (runtime.isSnapEnabled() && runtime.appCtx.studioState.settings.snapSurfaces !== false),
      movingIds: movingIds,
      modelCache: surfaceModels,
      mountModel: (mountedModelItem: any, externalModel: any) =>
        runtime.externalModelRegistry.addExternalItemModel(
          mountedModelItem,
          externalModel,
          runtime.materialLoadOptionsForItem(mountedModelItem),
        ),
    })
  } finally {
    for (const surfaceModel of surfaceModels.values()) {
      surfaceModel && runtime.disposeObjectTree?.(surfaceModel)
    }
    surfaceModels.clear()
  }
}

export function duplicateSelection(runtime: StudioAppRuntime) {
  const duplicateSourceIdSet = new Set([
      ...(runtime.appCtx.selectedItem?.kind === 'item' ? [runtime.appCtx.selectedItem.id] : []),
      ...runtime.appCtx.selectedItems
        .filter((duplicateDrawingEntry: any) => duplicateDrawingEntry.kind === 'item')
        .map((duplicateDrawing: any) => duplicateDrawing.id),
    ]),
    duplicateItems = runtime.appCtx.studioState.items.filter(
      (filteredSceneItem) =>
        duplicateSourceIdSet.has(filteredSceneItem.id) && runtime.isPlanItemVisible(filteredSceneItem),
    )
  if (!duplicateItems.length) {
    runtime.showToast('请先选择要复制的灯具、家具或电器。')
    return
  }
  const ft3 = runtime.captureUndoSnapshot(),
    duplicateOffset = (runtime.getPixelsPerMeter() || 100) * 0.12,
    duplicateClones = duplicateItems.map((sourceItem) => ({
      ...structuredClone(sourceItem),
      id: generateId('item'),
      x: sourceItem.x + duplicateOffset,
      y: sourceItem.y + duplicateOffset,
    }))
  remapCourtyardAttachments2(duplicateItems, duplicateClones),
    runtime.pushUndoEntry(duplicateClones),
    runtime.appCtx.studioState.items.push(...duplicateClones),
    runtime.validateSelectionChange(ft3) &&
      (runtime.applyPlacementChange(ft3),
      duplicateClones.length === 1
        ? runtime.selectSceneObject('item', duplicateClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = duplicateClones.map((clonedItem) => ({
            kind: 'item',
            id: clonedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          duplicateClones.map((clonedItemRecord) => ({
            kind: 'item',
            id: clonedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.syncStudioClipboardFacade(),
      runtime.showToast('已复制 ' + duplicateClones.length + ' 个物件。'))
}

export function collectSelectedPlanItems(runtime: StudioAppRuntime) {
  const planItemIdSet = new Set([
    ...(runtime.appCtx.selectedItem?.kind === 'item' ? [runtime.appCtx.selectedItem.id] : []),
    ...runtime.appCtx.selectedItems
      .filter((planDrawingEntry: any) => planDrawingEntry.kind === 'item')
      .map((planDrawing: any) => planDrawing.id),
  ])
  return runtime.appCtx.studioState.items.filter(
    (candidateSceneItem) => planItemIdSet.has(candidateSceneItem.id) && runtime.isPlanItemVisible(candidateSceneItem),
  )
}

export function mirrorSelection(runtime: StudioAppRuntime) {
  const zy2 = runtime.collectSelectedPlanItems()
  if (!zy2.length) {
    runtime.showToast('请先选择要复制的灯具、家具或电器。')
    return
  }
  runtime.appCtx.clipboardItems = zy2.map((mirroredSourceItem: any) => structuredClone(mirroredSourceItem))
  const ae7 = runtime.getActiveFloor()
  ;(runtime.appCtx.clipboardSourceFloor = {
    id: ae7.id,
    originX: ae7.originX,
    originY: ae7.originY,
    offsetX: ae7.offsetX,
    offsetZ: ae7.offsetZ,
    rotation: ae7.rotation,
    scene: {
      calibration: structuredClone(runtime.appCtx.studioState.calibration),
    },
  }),
    (runtime.appCtx.pasteOffsetFactor = 0),
    runtime.syncStudioClipboardFacade(),
    runtime.showToast('已复制 ' + runtime.appCtx.clipboardItems.length + ' 个物件，按 ⌘/Ctrl+V 粘贴。')
}

export function rotateSelection(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.clipboardItems.length) {
    runtime.showToast('暂无可粘贴的物件。')
    return
  }
  if (
    runtime.appCtx.clipboardItems.some(
      (validatedPlanItem: any) => validatedPlanItem.type === 'flooropening' || isCourtyardDrawing2(validatedPlanItem),
    ) &&
    !runtime.ensureCalibrationReady()
  )
    return
  if (
    runtime.appCtx.activeLibraryCategory === 'courtyard' &&
    runtime.appCtx.clipboardItems.some((courtyardPlanItem: any) => !isCourtyardPlanItem2(courtyardPlanItem))
  ) {
    runtime.showToast('庭院编辑中只能粘贴庭院对象，请先切换分类。')
    return
  }
  const every = runtime.appCtx.clipboardItems.every((planItemEntry: any) => lampItemTypeSet.has(planItemEntry.type))
  every && runtime.appCtx.activeLibraryCategory !== 'light'
    ? runtime.setAssetCategory('light')
    : !every && runtime.appCtx.activeLibraryCategory === 'light' && runtime.setAssetCategory('home')
  const ft4 = runtime.captureUndoSnapshot()
  runtime.appCtx.pasteOffsetFactor += 1
  const selectionOffset = (runtime.getPixelsPerMeter() || 100) * 0.12 * runtime.appCtx.pasteOffsetFactor,
    movedClones = runtime.appCtx.clipboardItems.map((movedSourceItem: any) => ({
      ...structuredClone(movedSourceItem),
      id: generateId('item'),
      x: movedSourceItem.x + selectionOffset,
      y: movedSourceItem.y + selectionOffset,
      ...((movedSourceItem.type === 'flooropening' ||
        isCourtyardDrawing2(movedSourceItem) ||
        movedSourceItem.courtyardGate) &&
      runtime.appCtx.clipboardSourceFloor &&
      runtime.appCtx.clipboardSourceFloor.id !== runtime.getActiveFloor().id
        ? {
            ...runtime.worldPointForFloor(
              movedSourceItem,
              runtime.appCtx.clipboardSourceFloor,
              runtime.getActiveFloor(),
            ),
            rotation:
              movedSourceItem.rotation +
              finite2(runtime.appCtx.clipboardSourceFloor.rotation, 0) -
              finite2(runtime.getActiveFloor().rotation, 0),
          }
        : {}),
      ...(lampItemTypeSet.has(movedSourceItem.type) &&
      !runtime.appCtx.studioState.lightGroups.some((lightGroup) => lightGroup.id === movedSourceItem.lightGroupId)
        ? {
            lightGroupId: runtime.getLightGroups().id,
          }
        : {}),
    }))
  remapCourtyardAttachments2(runtime.appCtx.clipboardItems, movedClones),
    runtime.pushUndoEntry(movedClones),
    runtime.appCtx.studioState.items.push(...movedClones),
    runtime.validateSelectionChange(ft4) &&
      (runtime.applyPlacementChange(ft4),
      movedClones.length === 1
        ? runtime.selectSceneObject('item', movedClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = movedClones.map((movedItem: any) => ({
            kind: 'item',
            id: movedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          movedClones.map((movedItemRecord: any) => ({
            kind: 'item',
            id: movedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.syncStudioClipboardFacade(),
      runtime.showToast('已粘贴 ' + movedClones.length + ' 个物件。'))
}

/**
 * 地面分区工具的附加绑定：楼层级「显示地暖盘管」开关。
 *
 * 单独一个函数而不是塞进 `selectStudioTool`：那个函数已经很长，再加分支会读不出主线。
 */
function installFloorRegionToolBindings(runtime: StudioAppRuntime): void {
  installUnderfloorHeatingToggle({
    floors: () => runtime.appCtx.studioProject?.floors || [],
    activeFloorId: () => runtime.appCtx.activeFloorId,
    markDirty: () => runtime.markDocumentDirty(),
    // 盘管与地面板一起挂，所以必须重建建筑层（只刷视图看不到变化）。
    rebuildArchitecture: () => runtime.rebuildFloorLayers({ layers: new Set(['architecture']) }),
    notify: runtime.showToast,
  })
}

/**
 * 「地面分区」工具的宿主粘合层（0.8.9）。
 *
 * 职责只有三件，全部可以脱离 three / DOM 测试：
 *
 * 1. 从当前层的墙线求出**闭合地面多边形**（复用 `closedWallPolygons`，与铺面渲染同源）；
 * 2. 把平面点击交给 `studio-floor-region-editor` 的状态机；
 * 3. 切分时用 `splitFloorRegionByLine` 产出两块轮廓，交回宿主落盘。
 *
 * 坐标口径：全程 `{x, y}`（与 `plan-coords.ts` 的 `screenToPlanPoint`、`FloorPoint` 一致），
 * 中间不做任何换轴 —— 换轴是这里最容易出错的地方，干脆不引入。
 *
 * 状态为什么在模块里：它只在「地面分区」工具激活期间有意义，换工具必须清空；
 * 单例 + 显式 `resetFloorRegionTool()` 比在巨型 `appCtx` 上加字段更容易守住棘轮，
 * 也避免忘了清空时把分割线带到下一个工具里。
 */

/**
 * 工具当前的交互状态。
 *
 * 用 `const` + 可变字段而不是模块级 `let`：本仓的别名棘轮把模块级 `let` 计入
 * 「转发层」指标（只允许下降），而这里的状态本来就是一个可替换的槽位。
 */
/** 选中的一块地面：`recordId` 为空表示这块地面还没有写进 `floorRegions`。 */
type FloorRegionSelection = {
  /** 已落盘分区的 id；`null` 表示选中的是墙线围出的整块房间，还没有分区记录。 */
  recordId: string | null
  /** 选中区域的几何；`room` 来源时洞口为空（墙线闭合环本身不带洞）。 */
  area: FloorRegion
  /**
   * 选中时所在的楼层 id。
   *
   * 必须记下来：切换楼层后 `recordId` / 几何都属于**旧楼层**，继续拿它去切分或改铺面
   * 会把旧楼层的轮廓写进新楼层（floorRegions 是按楼层存的），表现是「切一刀后另一层
   * 多出一块形状完全不对的地面」。交互入口在每次点击前用楼层 id 校验一次即可避免。
   */
  floorId: string
}

/** 命中结果：几何 + 面板标题要用的序号 / 总数（楼层 id 由调用方补上）。 */
type FloorRegionPick = Omit<FloorRegionSelection, 'floorId'> & {
  display: { index: number; count: number }
}

const state: {
  interaction: FloorRegionInteraction
  selection: FloorRegionSelection | null
  display: { index: number; count: number } | null
} = {
  interaction: createFloorRegionInteraction(),
  selection: null,
  display: null,
}

/** 当前层的墙线与合并容差（像素），用于求闭合地面。 */
export type FloorPolygonSource = {
  walls: unknown
  mergeTolerance: number
  /**
   * 可铺设地面要**排除**的区域（平面坐标）：楼板洞口（`flooropening` 的投影）。
   *
   * 不排除的话，点洞口会得到一块「把洞口也铺上」的分区；表现是挑空处突然出现地板，
   * 与整板渲染（`subtractPolygonLoops` 挖掉洞口）不一致。
   */
  excludeLoops?: ReadonlyArray<ReadonlyArray<FloorPoint>>
}

/** 一次点击的结果，宿主据此显示提示 / 落盘。 */
export type FloorRegionClickResult =
  | { kind: 'selected'; index: number; label: string }
  | { kind: 'awaiting-end'; label: string }
  | { kind: 'split'; pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide } }
  | { kind: 'error'; message: string }

/** 换工具 / 退出平面视图时清空。 */
export function resetFloorRegionTool(): void {
  state.interaction = createFloorRegionInteraction()
  state.selection = null
  state.display = null
}

/** 进入「画分割线」等待第一个点；未选中区域时返回 `false`。 */
export function beginFloorRegionSplit(): boolean {
  if (!state.selection) return false
  const next = armSplit(state.interaction)
  if (next === state.interaction) return false
  state.interaction = next
  return true
}

/** 放弃分割线（Esc）。 */
export function cancelFloorRegionSplit(): void {
  state.interaction = cancelSplit(state.interaction)
}

/** 当前是否在等分割线。 */
export function isAwaitingFloorRegionSplit(): boolean {
  return state.interaction.phase === 'split'
}

/** 选中的区域下标（未选中为 `null`）。 */
export function selectedFloorRegionIndex(): number | null {
  return state.interaction.selectedIndex
}

/** 检查器标题；未选中返回 `null`，宿主据此隐藏面板。 */
export function floorRegionInspectorLabel(regionCount: number): string | null {
  if (state.interaction.selectedIndex === null) return null
  return floorRegionTitle(state.interaction, regionCount)
}

/** 读出当前层的地面多边形（`{x, y}`，至少三点）。 */
export function currentFloorPolygons(source: FloorPolygonSource): FloorPoint[][] {
  const tolerance = Math.max(Number(source.mergeTolerance) || 0, 1e-7)
  const polygons = closedWallPolygons(source.walls, tolerance)
  return (polygons as unknown[]).filter(
    (polygon): polygon is FloorPoint[] =>
      Array.isArray(polygon) && polygon.length >= 3 && polygon.every((vertex) => isPlanPoint(vertex as FloorPoint)),
  )
}

/**
 * 处理一次平面点击。
 *
 * 切分的「第二点」由状态机产出线段；这里立刻切成两块轮廓返回给宿主，
 * 宿主负责生成新 `FloorRegion`（新 id、铺面沿用）并打 undo 快照。
 */
export function clickFloorRegionTool(
  point: PlanPoint,
  source: FloorPolygonSource,
  storedRegions: ReadonlyArray<FloorRegion> = [],
  floorId = '',
): FloorRegionClickResult {
  const rooms = currentFloorPolygons(source)
  // 已进入切分但还没定起点：这一次点击就是起点。
  if (state.interaction.phase === 'split' && state.interaction.splitStart === null) {
    state.interaction = setSplitStart(state.interaction, point)
    return { kind: 'awaiting-end', label: FLOOR_REGION_PROMPT.splitEnd }
  }
  if (state.interaction.phase === 'split') return finishFloorRegionSplit(point)

  const pick = pickFloorRegion(point, rooms, storedRegions, source.excludeLoops || [])
  // `void`：点落在已存分区的洞口里。洞口是挖空的地面，不能退回去选中整块房间，
  // 否则下一次「换铺面 / 切分」会在洞口上压出一块重叠分区。
  if (!pick || pick === 'void') return { kind: 'error', message: FLOOR_REGION_ERROR.noFloor }
  state.selection = { recordId: pick.recordId, area: pick.area, floorId }
  state.display = pick.display
  state.interaction = { phase: 'select', splitStart: null, selectedIndex: pick.display.index }
  return {
    kind: 'selected',
    index: pick.display.index,
    label: floorRegionTitle(state.interaction, pick.display.count),
  }
}

/**
 * 命中一块地面：**已存分区优先**，其次才是墙线围出的整块房间。
 *
 * 这个顺序是「切分后还能继续编辑子块」的前提：切分落盘的子块盖在房间上，
 * 若先命中房间，切分只会重复切整块地面，子块永远选不中。
 *
 * 房间这一路必须先做**差集**（房间 − 已存分区 − 楼板洞口）：否则在一块已被切走一半的
 * 房间的剩余区域上点选，会生成一条覆盖整间房的新记录，与已有分区重叠 ——
 * 渲染上表现为色块互相压盖，切分与铺面都会作用到错误的面。
 */
function pickFloorRegion(
  point: PlanPoint,
  rooms: ReadonlyArray<FloorPoint[]>,
  storedRegions: ReadonlyArray<FloorRegion>,
  excludeLoops: ReadonlyArray<ReadonlyArray<FloorPoint>> = [],
): FloorRegionPick | 'void' | null {
  for (let index = storedRegions.length - 1; index >= 0; index -= 1) {
    const region = storedRegions[index]
    if (!region) continue
    if (!regionHitsWithBounds(point, region.outline)) continue
    // 洞口是挖空区域：点到里面不命中任何一块地面。
    if ((region.holes || []).some((hole) => pointInsidePolygon(point, hole))) return 'void'
    return { recordId: region.id, area: region, display: { index, count: storedRegions.length } }
  }
  for (let index = rooms.length - 1; index >= 0; index -= 1) {
    const outline = rooms[index]
    if (!outline || !regionHitsWithBounds(point, outline)) continue
    const areas = roomRemainderAreas(outline, storedRegions, excludeLoops)
    // 后画的（数组靠后的）优先：差集结果的叠放顺序与渲染一致。
    for (let areaIndex = areas.length - 1; areaIndex >= 0; areaIndex -= 1) {
      const area = areas[areaIndex]
      if (!area || !regionHitsWithBounds(point, area.outline)) continue
      if (area.holes.some((hole) => pointInsidePolygon(point, hole))) continue
      return {
        recordId: null,
        area: { id: '', finish: 'theme', outline: area.outline, holes: area.holes },
        display: { index, count: rooms.length },
      }
    }
    // 点在房间里，但已被已有分区 / 洞口挖空：不能退回去生成整间房记录。
    return 'void'
  }
  return null
}

/** 差集结果的一块（外环 + 洞口），与 `FloorRegion` 的几何字段同形。 */
type FloorAreaOutline = { outline: FloorPoint[]; holes: FloorPoint[][] }

/** 复制一条环，断开与原数组/对象的引用（差集结果会被写进文档）。 */
function copyRing(ring: ReadonlyArray<FloorPoint>): FloorPoint[] {
  return ring.map((vertex) => ({ x: vertex.x, y: vertex.y }))
}

/**
 * 把 `subtractPolygonLoops` 的输出还原成「外环 + 洞口」列表。
 *
 * 该函数的输出沿用 three `Shape` 的约定：**正面积是外环、负面积是洞**，
 * 洞本身不保证紧跟在自己的外环后面，必须按「首点落在哪个外环内」重新归属。
 * 全是负环（并集退化）时反转方向当外环，与 `buildShapesWithHoles` 同口径。
 */
function loopsToAreas(loops: ReadonlyArray<ReadonlyArray<FloorPoint>>): FloorAreaOutline[] {
  const areas: FloorAreaOutline[] = []
  const holes: FloorPoint[][] = []
  for (const loop of loops) {
    if (!Array.isArray(loop) || loop.length < 3) continue
    const area = polygonArea(loop)
    if (area > 0) areas.push({ outline: copyRing(loop), holes: [] })
    else if (area < 0) holes.push(copyRing(loop))
  }
  if (!areas.length) {
    for (const loop of holes) areas.push({ outline: [...loop].reverse(), holes: [] })
    return areas
  }
  for (const hole of holes) {
    const home = areas
      .filter((candidate) => pointInPolygon(hole[0]!, candidate.outline, 1e-6))
      .sort((left, right) => polygonArea(left.outline) - polygonArea(right.outline))[0]
    home?.holes.push(hole)
  }
  return areas
}

/**
 * 房间的可铺设剩余区域：房间轮廓减去已存分区与楼板洞口。
 *
 * 差集失败（几何退化，例如墙线自相交）时回落成整间房：宁可让用户看到一次重叠，
 * 也不要因为几何异常让整个工具点不动 —— 后者更难自查。
 */
function roomRemainderAreas(
  outline: ReadonlyArray<FloorPoint>,
  storedRegions: ReadonlyArray<FloorRegion>,
  excludeLoops: ReadonlyArray<ReadonlyArray<FloorPoint>>,
): FloorAreaOutline[] {
  const cutLoops: FloorPoint[][] = [
    ...excludeLoops.map(copyRing),
    ...storedRegions.flatMap((region) => [copyRing(region.outline), ...(region.holes || []).map(copyRing)]),
  ]
  const room = copyRing(outline)
  if (!cutLoops.length) return [{ outline: room, holes: [] }]
  let loops: ReadonlyArray<ReadonlyArray<FloorPoint>> = []
  try {
    loops = subtractPolygonLoops([room], cutLoops)
  } catch {
    loops = []
  }
  const areas = loopsToAreas(loops)
  return areas.length ? areas : [{ outline: room, holes: [] }]
}

/** 切分第二点：用选中区域的真实几何（含洞口）切分，而不是墙线下标。 */
function finishFloorRegionSplit(point: PlanPoint): FloorRegionClickResult {
  const selection = state.selection
  const start = state.interaction.splitStart
  if (!selection || !start) {
    resetFloorRegionTool()
    return { kind: 'error', message: FLOOR_REGION_ERROR.noFloor }
  }
  if (Math.hypot(point.x - start.x, point.y - start.y) < MIN_SPLIT_LENGTH) {
    return {
      kind: 'error',
      message: `分割线太短（需 ≥ ${MIN_SPLIT_LENGTH}m），请重新选择终点。`,
    }
  }
  const pieces = splitFloorRegionByLine(selection.area, start, point)
  // 切分失败时保持切分阶段与起点：用户可以直接重画终点，不用重新点「画分割线」。
  if (!pieces) return { kind: 'error', message: FLOOR_REGION_ERROR.splitInvalid }
  state.interaction = { phase: 'select', splitStart: null, selectedIndex: state.display?.index ?? null }
  return { kind: 'split', pieces }
}

function isPlanPoint(value: FloorPoint | undefined): value is FloorPoint {
  return Boolean(value) && Number.isFinite(value?.x) && Number.isFinite(value?.y)
}

/**
 * 把一次切分结果写回某层的 `floorRegions`（纯函数，返回新数组）。
 *
 * 语义：
 * - 命中的是**已落盘分区** → 原地替换成两块（保持渲染叠放顺序不变）；
 * - 命中的是**还没落盘的房间** → 两块直接追加为新记录。新户型 `floorRegions` 为空，
 *   旧实现用 0 号下标去替换 `regions[0]` 会拿到 `undefined` 并静默返回空数组，
 *   界面却提示「已分割为两块」，等于整条切分链路第一次点击就失效；
 * - 铺面沿用原区域；色档是层级的（`floorFinishTones`），这里不动；
 * - 洞口沿用切分结果：`splitFloorRegionByLine` 已把每个洞按分割线裁到两侧。
 */
export function applySplitToFloorRegions(
  regions: readonly FloorRegion[],
  selected: { recordId: string | null; area: Pick<FloorRegion, 'finish'> },
  pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide },
  createId: (prefix: string) => string,
): FloorRegion[] {
  const originalIndex = selected.recordId ? regions.findIndex((region) => region.id === selected.recordId) : -1
  const finish = originalIndex >= 0 ? regions[originalIndex]!.finish : selected.area.finish
  const left: FloorRegion = {
    id: createId('floor-region'),
    finish,
    outline: pieces.left.outline,
    holes: pieces.left.holes,
  }
  const right: FloorRegion = {
    id: createId('floor-region'),
    finish,
    outline: pieces.right.outline,
    holes: pieces.right.holes,
  }
  if (originalIndex >= 0) return [...regions.slice(0, originalIndex), left, right, ...regions.slice(originalIndex + 1)]
  return [...regions, left, right]
}

/**
 * 切分完成后清空选中：两块新区域各有新 id，继续保留旧记录会编辑到已经被替换的那一块。
 */
export function clearFloorRegionSelection(): void {
  state.interaction = { phase: 'select', splitStart: null, selectedIndex: null }
  state.selection = null
  state.display = null
}

/**
 * 把当前选区同步到 facade（检查器显隐 / 标题）。
 *
 * 集中在这里而不是在每次点击后各写一遍：`select` / `split` / `error` / `reset` 四条路径
 * 只要漏一条，就会出现「面板还开着但已经没选中」这种很难查的错位。
 */
export function syncFloorRegionFacade(
  patch: (partial: { floorRegion: FloorRegionFacadeValue }) => void,
  _regionCount = 0,
): void {
  patch({ floorRegion: floorRegionFacadeValue() })
}

/** facade 上的选区形态（与 `StudioFacadeState['floorRegion']` 同形）。 */
export type FloorRegionFacadeValue = { label: string; regionCount: number; canSplit: boolean } | null

/** 由当前交互状态算出 facade 值（选中信息由 `clickFloorRegionTool` 写入状态）。 */
export function floorRegionFacadeValue(_regionCount = 0): FloorRegionFacadeValue {
  if (!state.selection) return null
  const count = state.display?.count ?? 0
  return {
    label: state.display ? floorRegionTitle(state.interaction, count) : '地面分区',
    regionCount: count,
    canSplit: true,
  }
}

/**
 * 移除选中的分区（检查器「移除分区」）。
 *
 * 允许移除最后一块：删掉这条记录后这层会回到「没有手工分区」的整板地面，
 * 也就是把这一块改回默认铺面。返回新数组；下标越界返回 `null`。
 */
export function removeFloorRegionAt(regions: readonly FloorRegion[], index: number): FloorRegion[] | null {
  if (index < 0 || index >= regions.length) return null
  return [...regions.slice(0, index), ...regions.slice(index + 1)]
}

/**
 * 「显示本层地暖盘管」复选框的节点 id。
 *
 * 与 `StudioView.vue` 的标记一一对应；放常量而不是各写字符串，改名时只有一处要改。
 */
export const UNDERFLOOR_HEATING_INPUT_ID = 'floor-underfloor-heating'

/** 读复选框当前值（节点缺失按关闭处理）。 */
export function readUnderfloorHeatingToggle(): boolean {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  return input?.checked === true
}

/** 把楼层开关同步到复选框（切换楼层 / 重载文档后调用）。 */
export function syncUnderfloorHeatingToggle(enabled: boolean): void {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  if (input) input.checked = enabled
}

/** 换工具时清空（分支放在这里，避免给宿主的 `selectStudioTool` 增加复杂度）。 */
export function resetFloorRegionToolIfLeaving(nextToolId: string): void {
  if (nextToolId === 'floor-region') return
  resetFloorRegionTool()
}

/**
 * 绑定「显示本层地暖盘管」开关（只绑一次）。
 *
 * 开关写的是**楼层**字段 `underfloorHeating`，然后请求重建建筑层 —— 盘管是与地面板
 * 一起挂的，不重建就不会出现/消失。
 */
export function installUnderfloorHeatingToggle(host: {
  floors: () => ReadonlyArray<{ id?: string; underfloorHeating?: boolean }>
  activeFloorId: () => string
  markDirty: () => void
  rebuildArchitecture: () => void
  notify: (message: string, kind?: string) => void
}): void {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  if (!input || input.dataset.floorUnderfloorBound === '1') return
  input.dataset.floorUnderfloorBound = '1'
  input.addEventListener('change', () => {
    const floor = host.floors().find((candidate) => candidate.id === host.activeFloorId())
    if (!floor) {
      host.notify('没有找到当前楼层，无法切换地暖盘管。', 'error')
      return
    }
    floor.underfloorHeating = input.checked
    host.markDirty()
    host.rebuildArchitecture()
  })
}

/** `handlePointerDown` 转发所需的宿主能力（显式传入，避免依赖弱类型的 deps 对象）。 */
export type FloorRegionPointerHost = {
  point: PlanPoint
  source: FloorPolygonSource
  activeFloorId: string
  /** 所有楼层记录（只读用于查找当前层）。 */
  floors: ReadonlyArray<{ id?: string; floorRegions?: FloorRegion[]; underfloorHeating?: boolean }>
  createId: (prefix: string) => string
  pushUndoEntry: () => void
  markDocumentDirty: () => void
  notify: (message: string, kind?: string) => void
}

/**
 * 一次「地面分区」点击的**完整处理**（含提示、落盘、facade 同步）。
 *
 * 全部收在这里是为了让 `handlePointerDown` 只留一行调用 —— 那个文件已经很大，
 * 一次 if/else 链就会让分支数再涨一截。
 */
export function handleFloorRegionPointer(
  host: FloorRegionPointerHost,
  patchFacade: (partial: { floorRegion: FloorRegionFacadeValue }) => void,
): void {
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  // 换过楼层：旧选中的几何 / 记录 / 切分起点都属于上一层，必须先清空再判断这次点击。
  // 这样落到新楼层的点击是「选中这块地面」，而不是继续切上一层的区域。
  if (state.selection?.floorId && state.selection.floorId !== host.activeFloorId) resetFloorRegionTool()
  // 命中测试必须同时看已存分区与墙线房间：只看墙线时，切分出来的子块永远选不中。
  const result = clickFloorRegionTool(host.point, host.source, activeFloor?.floorRegions || [], host.activeFloorId)
  if (result.kind === 'error') {
    host.notify(result.message, 'error')
  } else if (result.kind === 'awaiting-end') {
    host.notify(result.label, 'info')
  } else if (result.kind === 'selected') {
    host.notify(`已选中${result.label}`, 'info')
  } else {
    applySplit(host, result.pieces)
  }
  // 选中/切分之后顺手把楼层的地暖开关状态同步到复选框：
  // 切楼层不重建检查器，不在这里同步会显示上一层勾选状态。
  syncUnderfloorHeatingToggle(
    host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)?.underfloorHeating === true,
  )
  syncFloorRegionFacade(patchFacade)
  // 选区变了：检查器的铺面高亮、深浅值与「移除分区」可用性都要跟着重画。
  repaintFloorRegionInspector()
}

function applySplit(
  host: FloorRegionPointerHost,
  pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide },
): void {
  const selection = state.selection
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  if (!activeFloor || !selection) {
    host.notify('没有找到当前楼层，无法切分地面。', 'error')
    return
  }
  // 切分用的是选中时缓存的几何；楼层已变时必须拒绝，否则会把旧楼层的轮廓写进新楼层。
  if (selection.floorId && selection.floorId !== host.activeFloorId) {
    clearFloorRegionSelection()
    host.notify('已切换楼层，请在新楼层重新点选一块地面。', 'warning')
    return
  }
  host.pushUndoEntry()
  activeFloor.floorRegions = applySplitToFloorRegions(activeFloor.floorRegions || [], selection, pieces, host.createId)
  clearFloorRegionSelection()
  host.markDocumentDirty()
  host.notify('已分割为两块地面。', 'success')
}

/* ------------------------------------------------------------------------- *
 * 地面分区的「铺面 / 深浅」落盘（0.9.0）
 *
 * 与切分同一条提交链：`pushUndoEntry → 改楼层记录 → markDocumentDirty`。
 * 色档是**层级**的（同层同 `toneKind` 共用一个档位），所以它写在楼层的
 * `floorFinishTones` 上，而不是挂到分区上 —— 面板上「本层同类铺面一起调整」就是这条。
 * ------------------------------------------------------------------------- */

/** 铺面/色档落盘需要的宿主（比点击宿主窄：不需要 point / source）。 */
export type FloorRegionCommitHost = {
  activeFloorId: string
  floors: Array<{
    id?: string
    floorRegions?: FloorRegion[]
    floorFinishTones?: Partial<Record<FloorToneKind, number>>
  }>
  /** 新分区 id 生成器；只有「第一次给未落盘房间改铺面」时才需要。 */
  createId?: (prefix: string) => string
  pushUndoEntry: () => void
  markDocumentDirty: () => void
  notify: (message: string, kind?: string) => void
}

/**
 * 设置当前选中分区的铺面。
 *
 * 选中「墙线房间但还没有分区记录」时，第一次改铺面会**创建一条记录** ——
 * 与 0.9.0 的 `selectFloorRegion` 返回 `{record, area}` 后再 commit 同语义。
 * 旧实现只按 `floorRegions[index]` 取记录，新户型（空数组）点任何房间都提示
 * 「请先在平面上点选一块地面」，铺面按钮等于全废。
 */
export function commitSelectedFloorRegionFinish(host: FloorRegionCommitHost, finish: FloorFinish): boolean {
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  const selection = state.selection
  if (!activeFloor || !selection) {
    host.notify('请先在平面上点选一块地面。', 'warning')
    return false
  }
  // 选中后切过楼层：几何与 recordId 都属于旧楼层，继续写会把轮廓落到错误的层。
  if (selection.floorId && selection.floorId !== host.activeFloorId) {
    clearFloorRegionSelection()
    host.notify('已切换楼层，请在新楼层重新点选一块地面。', 'warning')
    return false
  }
  const storedRegion = selection.recordId
    ? activeFloor.floorRegions?.find((region) => region.id === selection.recordId)
    : undefined
  if (storedRegion) {
    if (storedRegion.finish === finish) return false
    host.pushUndoEntry()
    storedRegion.finish = finish
    state.selection = { recordId: storedRegion.id, area: storedRegion, floorId: host.activeFloorId }
    host.markDocumentDirty()
    return true
  }
  // 还没落盘的房间：默认铺面就是 theme，再点「原色 / 跟随主题」不必生成一条无意义记录。
  if (finish === 'theme') return false
  if (!host.createId) {
    host.notify('无法创建地面分区，请刷新后重试。', 'error')
    return false
  }
  host.pushUndoEntry()
  const created: FloorRegion = {
    id: host.createId('floor-region'),
    finish,
    outline: selection.area.outline.map((vertex) => ({ x: vertex.x, y: vertex.y })),
    holes: (selection.area.holes || []).map((hole) => hole.map((vertex) => ({ x: vertex.x, y: vertex.y }))),
  }
  activeFloor.floorRegions = [...(activeFloor.floorRegions || []), created]
  state.selection = { recordId: created.id, area: created, floorId: host.activeFloorId }
  // 记录数变了：标题里的 `1/N` 要跟着更新（否则还停在房间序号 / 房间总数）。
  state.display = { index: activeFloor.floorRegions.length - 1, count: activeFloor.floorRegions.length }
  state.interaction = { phase: 'select', splitStart: null, selectedIndex: state.display.index }
  syncFloorRegionFacade(patchStudioFacadeState)
  host.markDocumentDirty()
  return true
}

/**
 * 设置本层某色档（`wood` / `tile`），范围夹到 ±20。
 *
 * `0` 会**删键**而不是写 0：文档越小越好，且 `normalizeFloorTones` 缺省就是 0。
 */
export function commitFloorRegionTone(host: FloorRegionCommitHost, toneKind: FloorToneKind, tone: number): boolean {
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  if (!activeFloor) {
    host.notify('没有找到当前楼层，无法调整铺面深浅。', 'warning')
    return false
  }
  const nextTone = clampFloorTone(tone),
    currentTone = clampFloorTone(activeFloor.floorFinishTones?.[toneKind] ?? 0)
  if (currentTone === nextTone) return false
  host.pushUndoEntry()
  const nextTones = { ...(activeFloor.floorFinishTones || {}) }
  if (nextTone === 0) delete nextTones[toneKind]
  else nextTones[toneKind] = nextTone
  activeFloor.floorFinishTones = nextTones
  host.markDocumentDirty()
  return true
}

/* ------------------------------------------------------------------------- *
 * 地面分区检查器的 DOM 绑定（0.9.0）
 *
 * 检查器能显示但按钮是死的，是因为**没人把 DOM 事件接到上面两个 commit**。
 * 这一层只做三件事：把视图贴上去、把点击翻译成 commit、把 Esc / Enter 转给分割线状态机。
 * 全部逻辑仍在 `commit*` 与纯函数里，便于单测。
 * ------------------------------------------------------------------------- */

/** 绑定检查器所需的宿主：落盘所需数据 + 场景风格 + 重绘。 */
export type FloorRegionInspectorHost = FloorRegionCommitHost & {
  /** 场景风格（决定铺面文案与瓷砖显隐）。 */
  sceneStyle: () => string
  /** 提交后的重绘（分区板与盘管）。 */
  refresh: () => void
}

/**
 * 已绑定的检查器宿主。
 *
 * 存在模块级而不是逐处传递：选区变化发生在画布点击路径（`handleFloorRegionPointer`），
 * 那条路径拿不到场景风格与重绘函数，硬塞进去会让它的签名膨胀到 10 个参数。
 * 绑定期写一次、解绑清空，读写都在同一线程。
 */
let boundInspectorHost: FloorRegionInspectorHost | null = null

/** 选区变化后重画控件（未绑定时是 no-op）。 */
export function repaintFloorRegionInspector(): void {
  boundInspectorHost && refreshFloorRegionInspector(boundInspectorHost)
}

/**
 * 当前选中分区的几何。
 *
 * 先按 `recordId` 查已存记录；记录不存在（或选中的是未落盘房间）时回落到选择时
 * 保存的区域几何 —— 这样「点选房间 → 直接换铺面」在还没有任何分区的新户型上也能用。
 */
function selectedFloorRegionOf(host: FloorRegionCommitHost): FloorRegion | null {
  const selection = state.selection
  if (!selection) return null
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  const storedRegion = selection.recordId
    ? activeFloor?.floorRegions?.find((region) => region.id === selection.recordId)
    : undefined
  return storedRegion ?? selection.area
}

/** 把当前状态算成视图（供 `paintFloorRegionInspector` 使用）。 */
export function currentFloorRegionInspectorView(
  host: FloorRegionCommitHost & { sceneStyle: () => string },
): ReturnType<typeof floorRegionInspectorView> {
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId),
    region = selectedFloorRegionOf(host)
  return floorRegionInspectorView(
    // 未落盘的房间没有 record 可删：此时「移除分区」应禁用（删它等于删空气）。
    region ? { finish: region.finish, canRemove: !!state.selection?.recordId } : null,
    activeFloor?.floorFinishTones ?? {},
    host.sceneStyle(),
  )
}

/** 重画检查器控件（值 / 文案 / 显隐）。不改容器的 `hidden` —— 那由 facade 决定。 */
export function refreshFloorRegionInspector(host: FloorRegionInspectorHost): void {
  paintFloorRegionInspector(document, currentFloorRegionInspectorView(host))
}

/**
 * 绑定检查器的全部交互，返回解绑函数。
 *
 * 事件委托到容器上：按钮会被重绘（`textContent` 变化不影响监听），逐元素绑要跟着重建。
 */
export function bindFloorRegionInspector(host: FloorRegionInspectorHost): () => void {
  const inspectorSection = document.getElementById('floor-region-inspector')
  if (!inspectorSection) return () => {}
  const commitAndRefresh = (commit: () => boolean) => () => {
    commit() && (host.refresh(), refreshFloorRegionInspector(host))
  }

  const handleClick = (clickEvent: Event) => {
    const clickTarget = clickEvent.target as HTMLElement | null
    if (!clickTarget) return
    const finishButton = clickTarget.closest<HTMLElement>('[data-floor-finish]')
    if (finishButton) {
      const finish = finishButton.dataset.floorFinish as FloorFinish | undefined
      finish === 'theme' || finish === 'wood' || finish === 'tile'
        ? commitAndRefresh(() => commitSelectedFloorRegionFinish(host, finish))()
        : undefined
      return
    }
    if (clickTarget.closest('[data-floor-tone-reset]')) {
      commitAndRefresh(() => commitFloorRegionTone(host, currentFloorRegionToneKind(host), 0))()
      return
    }
    if (clickTarget.closest('[data-floor-region-remove]')) {
      const selection = state.selection,
        activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
      // 选中未落盘房间时没有记录可删（按钮也已禁用）；这里再兜一次，避免误删邻居。
      if (!selection?.recordId || !activeFloor?.floorRegions) return
      const regionIndex = activeFloor.floorRegions.findIndex((region) => region.id === selection.recordId)
      const nextRegions = regionIndex >= 0 ? removeFloorRegionAt(activeFloor.floorRegions, regionIndex) : null
      if (!nextRegions) return
      host.pushUndoEntry()
      activeFloor.floorRegions = nextRegions
      // 记录按 id 删除，剩余记录的相对顺序不变；清空选中避免面板继续指向已删记录。
      clearFloorRegionSelection()
      host.markDocumentDirty()
      syncFloorRegionFacade(patchStudioFacadeState)
      host.refresh()
      refreshFloorRegionInspector(host)
    }
  }

  /** 深浅输入：`change` 提交（避免每敲一位就写一次撤销栈），Enter 同 `change`。 */
  const commitToneFromInput = () => {
    const toneInput = document.querySelector<HTMLInputElement>('#floor-tone-input')
    if (!toneInput) return
    const parsedTone = Number(toneInput.valueAsNumber)
    if (!Number.isFinite(parsedTone)) {
      // 非法输入（空串 / 只打了负号）：恢复成当前档位，不要拿 NaN 去写文档。
      refreshFloorRegionInspector(host)
      return
    }
    commitAndRefresh(() => commitFloorRegionTone(host, currentFloorRegionToneKind(host), parsedTone))()
  }

  const handleChange = (changeEvent: Event) => {
    ;(changeEvent.target as HTMLElement | null)?.id === 'floor-tone-input' && commitToneFromInput()
  }

  const handleKeydown = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === 'Escape') {
      // Esc：画线中放弃第一个点；否则清空选中（与勾选态一致）。
      isAwaitingFloorRegionSplit()
        ? (cancelFloorRegionSplit(), refreshFloorRegionInspector(host), host.refresh())
        : (clearFloorRegionSelection(), syncFloorRegionFacade(patchStudioFacadeState))
      return
    }
    keyEvent.key === 'Enter' &&
      (keyEvent.target as HTMLElement | null)?.id === 'floor-tone-input' &&
      commitToneFromInput()
  }

  inspectorSection.addEventListener('click', handleClick)
  inspectorSection.addEventListener('change', handleChange)
  inspectorSection.addEventListener('keydown', handleKeydown)
  boundInspectorHost = host
  refreshFloorRegionInspector(host)
  return () => {
    inspectorSection.removeEventListener('click', handleClick)
    inspectorSection.removeEventListener('change', handleChange)
    inspectorSection.removeEventListener('keydown', handleKeydown)
    boundInspectorHost === host && (boundInspectorHost = null)
  }
}

/** 当前深浅该写哪个色档键（跟随选中分区的铺面）。 */
function currentFloorRegionToneKind(host: FloorRegionCommitHost): FloorToneKind {
  const selectedRegion = selectedFloorRegionOf(host)
  return floorToneKind(selectedRegion?.finish ?? 'wood')
}
