/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  ensureActiveLightGroup,
  findSelectedEntity,
  itemLightSourceVisibleInput,
  itemStripRollInput,
  refreshStudio
} from "./studio-ui-refresh.js";
import { state } from "./studio-state.js";
import { scopeForItem } from "./studio-plan-interaction.js";
import { pushHistorySnapshot } from "./studio-camera-mode.js";
import {
  clamp,
  clampWindowT
} from "../plan/geometry.js";
import {
  finite,
  itemMinimumFootprint,
  itemMinimumHeight,
  normalizeFullRotation,
  normalizeLabelText
} from "../loaders/studio-normalization.js";
import {
  currentPixelsPerMeter,
  selectElement
} from "./studio-plan-render.js";
import {
  DEFAULT_LIGHT_SETTINGS,
  DOOR_TYPE_DIMENSIONS,
  ITEM_TYPE_DEFINITIONS,
  MOBILE_TV_MOUNT_DIMENSIONS,
  TELEVISION_MOUNT_DEPTHS,
  TELEVISION_MOUNT_ELEVATIONS,
  TV_MOUNT_STYLES
} from "./studio-config-tables.js";
import {
  applyDoorMaterialStyle,
  maxLightAngleForType,
  normalizePillarShape
} from "./studio-scene-normalize.js";
import {
  curtainFootprintDepth,
  normalizeCurtainTrack
} from "../loaders/studio-curtain-track.js";
import {
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES
} from "./studio-item-types.js";
import {
  normalizeFeatureWallStyle,
  normalizeMuralArtStyle
} from "../materials/studio-surface-textures.js";
import {
  MATERIAL_STYLE_AUTO,
  isMaterialStyleCapable,
  normalizeMaterialStyle
} from "./studio-material-styles.js";
import {
  normalizePillarAxis,
  normalizeStripAxis
} from "./studio-plan-geometry.js";
import { markDocumentDirty } from "./studio-document-save.js";

/**
 * 改挂装方式时把进深与离地高度拨到对应档。两样都只在「当前值恰好等于某一种挂装的标称值」
 */
export function snapTelevisionMountDimensions(televisionItem: any, nextMountStyle: any) {
  const televisionDepth = finite(televisionItem.depth, 0);
  if (
    Object.values(TELEVISION_MOUNT_DEPTHS).some(
      nominalDepth => Math.abs(televisionDepth - nominalDepth) < 0.001
    )
  ) {
    televisionItem.depth = (TELEVISION_MOUNT_DEPTHS as any)[nextMountStyle];
  }
  const televisionElevation = finite(televisionItem.elevation, 0);
  if (
    Object.values(TELEVISION_MOUNT_ELEVATIONS).some(
      nominalElevation => Math.abs(televisionElevation - nominalElevation) < 0.001
    )
  ) {
    televisionItem.elevation = (TELEVISION_MOUNT_ELEVATIONS as any)[nextMountStyle];
  }
}

export function applyInspectorChanges(entityKind: any) {
  const editingEntity = findSelectedEntity();
  if (!editingEntity || state.primarySelection?.kind !== entityKind) {
    return;
  }
  const inspectorRefreshScope =
    entityKind === "item"
      ? scopeForItem(editingEntity)
      : ["door", "window", "railing"].includes(entityKind)
        ? "architecture"
        : "all";
  pushHistorySnapshot();
  if (entityKind === "wall") {
    editingEntity.height = clamp(
      finite(selectElement("#wall-height").value, editingEntity.height),
      0.01,
      6
    );
    editingEntity.thickness = clamp(
      finite(selectElement("#wall-thickness").value, editingEntity.thickness),
      0.01,
      3
    );
    editingEntity.opacity =
      selectElement("#wall-opacity-mode").value === "custom"
        ? clamp(
            finite(selectElement("#wall-opacity").value, state.activeScene.settings.wallOpacity * 100),
            0,
            100
          ) / 100
        : null;
    editingEntity.allowOpenEnd = selectElement("#wall-open-end-mode").value === "allowed";
    state.activeScene.settings.wallHeight = editingEntity.height;
    state.activeScene.settings.wallThickness = editingEntity.thickness;
  } else if (entityKind === "window") {
    editingEntity.width = clamp(
      finite(selectElement("#window-width").value, editingEntity.width),
      0.3,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#window-height").value, editingEntity.height),
      0.3,
      20
    );
    editingEntity.sill = clamp(
      finite(selectElement("#window-sill").value, editingEntity.sill),
      0,
      20
    );
    editingEntity.hasDivider = selectElement("#window-divider").value !== "without";
    const windowWall = state.activeScene.walls.find(
      (windowWallRecord: any) => windowWallRecord.id === editingEntity.wallId
    );
    if (windowWall) {
      editingEntity.t = clampWindowT(windowWall, editingEntity, currentPixelsPerMeter());
    }
  } else if (entityKind === "door") {
    editingEntity.doorType = Object.hasOwn(DOOR_TYPE_DIMENSIONS, selectElement("#door-type").value)
      ? selectElement("#door-type").value
      : "solid";
    applyDoorMaterialStyle(
      editingEntity,
      editingEntity.doorType,
      selectElement("#door-material").value
    );
    editingEntity.width = clamp(
      finite(selectElement("#door-width").value, editingEntity.width),
      0.55,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#door-height").value, editingEntity.height),
      1.8,
      20
    );
    const doorWall = state.activeScene.walls.find(
      (doorWallRecord: any) => doorWallRecord.id === editingEntity.wallId
    );
    if (doorWall) {
      editingEntity.t = clampWindowT(doorWall, editingEntity, currentPixelsPerMeter());
    }
  } else if (entityKind === "railing") {
    editingEntity.width = clamp(
      finite(selectElement("#railing-width").value, editingEntity.width),
      0.3,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#railing-height").value, editingEntity.height),
      0.5,
      3
    );
    const inspectorRailingWall = state.activeScene.walls.find(
      (railingWallRecord: any) => railingWallRecord.id === editingEntity.wallId
    );
    if (inspectorRailingWall) {
      editingEntity.t = clampWindowT(inspectorRailingWall, editingEntity, currentPixelsPerMeter());
    }
  } else {
    const inspectorPixelsPerMeter = currentPixelsPerMeter() || 1;
    editingEntity.x =
      finite(selectElement("#item-x").value, editingEntity.x / inspectorPixelsPerMeter) *
      inspectorPixelsPerMeter;
    editingEntity.y =
      finite(selectElement("#item-y").value, editingEntity.y / inspectorPixelsPerMeter) *
      inspectorPixelsPerMeter;
    editingEntity.width = clamp(
      finite(selectElement("#item-width").value, editingEntity.width),
      itemMinimumFootprint(editingEntity.type),
      8
    );
    editingEntity.height = clamp(
      finite(selectElement("#item-height").value, editingEntity.height),
      itemMinimumHeight(editingEntity.type),
      6
    );
    editingEntity.depth = clamp(
      finite(selectElement("#item-depth").value, editingEntity.depth),
      itemMinimumFootprint(editingEntity.type),
      8
    );
    editingEntity.elevation = clamp(
      finite(selectElement("#item-elevation").value, editingEntity.elevation || 0),
      0,
      6
    );
    editingEntity.rotation =
      editingEntity.type === "striplight"
        ? normalizeFullRotation(selectElement("#item-rotation").value, editingEntity.rotation)
        : finite(selectElement("#item-rotation").value, editingEntity.rotation);
    if (editingEntity.type === "planlabel") {
      editingEntity.title = normalizeLabelText(selectElement("#label-title").value, "家庭总览", 24);
      editingEntity.subtitle = normalizeLabelText(
        selectElement("#label-subtitle").value,
        "HOME PLAN",
        36
      );
      editingEntity.titleSpacing = clamp(
        finite(selectElement("#label-title-spacing").value, 105) / 100,
        0,
        1.8
      );
      editingEntity.subtitleSpacing = clamp(
        finite(selectElement("#label-subtitle-spacing").value, 8) / 100,
        0,
        0.6
      );
      editingEntity.lineLength = clamp(
        finite(selectElement("#label-line-length").value, 86) / 100,
        0.3,
        1
      );
      editingEntity.height = 0.01;
      editingEntity.elevation = 0;
    }
    if (editingEntity.type === "curtain") {
      editingEntity.curtainPosition = ["left", "right", "split"].includes(
        selectElement("#curtain-position").value
      )
        ? selectElement("#curtain-position").value
        : "split";
      const editedCurtainTrack = normalizeCurtainTrack(editingEntity).curtainTrack;
      Object.assign(
        editingEntity,
        normalizeCurtainTrack({
          // 形态先于轨道：卷帘会把下面的 curtainTrack 收敛成直线型（归一化里处理）。
          curtainForm: selectElement("#curtain-form").value,
          curtainTrack: selectElement("#curtain-track").value,
          curtainCorner: selectElement("#curtain-corner").value,
          curtainLeftLength: selectElement("#curtain-left-length").value,
          curtainRightLength: selectElement("#curtain-right-length").value,
          curtainMeet: selectElement("#curtain-meet").value,
          curtainPreview: selectElement("#curtain-preview").value,
          curtainFabric: selectElement("#curtain-fabric").value
        })
      );
      if (editedCurtainTrack !== "straight" && editingEntity.curtainTrack === "straight") {
        editingEntity.depth = 0.18;
      }
      editingEntity.depth = curtainFootprintDepth(editingEntity);
    }
    if (ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(editingEntity.type)) {
      editingEntity.roundTableTurntable = selectElement("#round-table-turntable").value === "with";
    }
    if (editingEntity.type === "fridge") {
      // 只有 double 落键，其余（含未选、脏值）一律归一为 standard —— 与回填口径一致。
      editingEntity.fridgeStyle =
        (document.querySelector('input[name="fridge-style"]:checked') as any)?.value === "double"
          ? "double"
          : "standard";
    }
    if (STAIR_DIRECTION_ITEM_TYPES.has(editingEntity.type)) {
      editingEntity.stairDirection = ["left", "right"].includes(
        selectElement("#stair-direction").value
      )
        ? selectElement("#stair-direction").value
        : "right";
    }
    if (editingEntity.type === "tv") {
      const previousMountStyle = TV_MOUNT_STYLES.has(editingEntity.tvMountStyle)
        ? editingEntity.tvMountStyle
        : "standard";
      const nextMountStyle = TV_MOUNT_STYLES.has(selectElement("#tv-mount-style").value)
        ? selectElement("#tv-mount-style").value
        : "standard";
      if (previousMountStyle !== nextMountStyle && nextMountStyle === "mobile") {
        editingEntity.height = Math.max(editingEntity.height, MOBILE_TV_MOUNT_DIMENSIONS.height);
        editingEntity.elevation = 0;
      } else if (
        previousMountStyle === "mobile" &&
        nextMountStyle !== "mobile" &&
        Math.abs(editingEntity.height - MOBILE_TV_MOUNT_DIMENSIONS.height) < 0.001
      ) {
        editingEntity.height = ITEM_TYPE_DEFINITIONS.tv.height;
      }
      // 进深与离地高度跟着挂装方式走（壁挂 60mm / 0.70m，座装 180mm / 落地，移动 550mm / 落地）：
      snapTelevisionMountDimensions(editingEntity, nextMountStyle);
      editingEntity.tvMountStyle = nextMountStyle;
    }
    if (editingEntity.type === "mural") {
      editingEntity.muralStyle = normalizeMuralArtStyle(selectElement("#mural-style").value);
    }
    if (editingEntity.type === "featurewall") {
      editingEntity.wallStyle = normalizeFeatureWallStyle(
        selectElement("#feature-wall-style").value
      );
    }
    if (isMaterialStyleCapable(editingEntity.type)) {
      const nextMaterialStyle = normalizeMaterialStyle(
        editingEntity.type,
        selectElement("#material-style").value
      );
      // auto 不落键：草稿 / 快照里只有真正选过风格才留下 materialStyle，
      if (nextMaterialStyle === MATERIAL_STYLE_AUTO) {
        delete editingEntity.materialStyle;
      } else {
        editingEntity.materialStyle = nextMaterialStyle;
      }
    }
    if (editingEntity.type === "pillar") {
      editingEntity.pillarShape = normalizePillarShape(selectElement("#pillar-shape").value);
      editingEntity.pillarAxis = normalizePillarAxis(selectElement("#pillar-axis").value);
    }
    if (editingEntity.type === "striplight") {
      editingEntity.stripAxis = normalizeStripAxis(selectElement("#strip-axis").value);
    }
    if (LIGHT_ITEM_TYPES.has(editingEntity.type)) {
      const defaultLightSettings =
        (DEFAULT_LIGHT_SETTINGS as any)[editingEntity.type] || DEFAULT_LIGHT_SETTINGS.downlight;
      editingEntity.verticalRotation =
        editingEntity.type === "striplight"
          ? normalizeFullRotation(
              selectElement("#item-vertical-rotation").value,
              editingEntity.verticalRotation || 0
            )
          : clamp(
              finite(
                selectElement("#item-vertical-rotation").value,
                editingEntity.verticalRotation || 0
              ),
              -90,
              90
            );
      if (editingEntity.type === "striplight") {
        editingEntity.stripRollRotation = normalizeFullRotation(
          itemStripRollInput.value,
          editingEntity.stripRollRotation || 0
        );
        editingEntity.lightSourceVisible = itemLightSourceVisibleInput.checked;
      }
      editingEntity.lightGroupId = state.activeScene.lightGroups.some(
        (ownerLightGroup: any) => ownerLightGroup.id === selectElement("#light-group").value
      )
        ? selectElement("#light-group").value
        : ensureActiveLightGroup().id;
      editingEntity.lightTemperature = clamp(
        finite(selectElement("#light-temperature").value, defaultLightSettings.temperature),
        2200,
        6500
      );
      editingEntity.lightBrightness = clamp(
        finite(selectElement("#light-brightness").value, defaultLightSettings.brightness),
        0,
        100
      );
      editingEntity.lightRange = clamp(
        finite(selectElement("#light-range").value, defaultLightSettings.range),
        0.5,
        10
      );
      editingEntity.lightAngle = clamp(
        finite(selectElement("#light-angle").value, defaultLightSettings.angle),
        15,
        maxLightAngleForType(editingEntity.type)
      );
      editingEntity.height = (ITEM_TYPE_DEFINITIONS as any)[editingEntity.type].height;
    } else if (["camera", "presence"].includes(editingEntity.type)) {
      editingEntity.verticalRotation = clamp(
        finite(selectElement("#item-vertical-rotation").value, editingEntity.verticalRotation || 0),
        -180,
        180
      );
    }
  }
  refreshStudio(inspectorRefreshScope);
  markDocumentDirty();
}
