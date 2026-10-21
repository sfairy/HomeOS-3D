





import {
  anchorGate as anchorGate2,
  syncCourtyardGates as syncCourtyardGates2,
} from "../../../plan/courtyard-drawing";


import {
  airerDimensions as airerDimensions2,
} from "../../items/studio-airer";
import { setPipelineDispenserStyle } from "../../items/pipeline-dispenser";
import {
  fanDimensions as fanDimensions2,
} from "../../items/studio-fan";




import {
  normalizeMuralArtStyle,
  normalizeFeatureWallStyle,
} from "../../../materials/studio-surface-textures";




import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from "../../../loaders/studio-curtain-track";








import {
  clamp as clamp2,
  clampWindowT as clampWindowT2,
} from "../../../plan/geometry";










import {
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
} from "../../../loaders/studio-normalization";
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
  normalizeStripAxis as normalizeStripAxis2,
} from "../../items/studio-item-posture";
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet, sofaMinDimensions, tvMountStyleSet } from "../../items/item-catalog";


import type {
  StudioControlElement,
} from '../../types/studio-app-types';


import {
  lightPresetCatalog,
  lightAngleLimitForType,
} from '../../lights/studio-app-light-data';
import { doorTypeCatalog, normalizePlanLabelColor } from "../../scene/studio-scene-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface ApplyToolSettingDeps { appCtx: StudioAppContext; applyPlacementChange: any; captureUndoSnapshot: any; getLightGroups: any; getPixelsPerMeter: any; getSelectedObject: any; isSelectionAllowed: any; itemLightSourceVisibleInput: any; itemStripRollInput: any; markDocumentDirty: any; refreshScopeItems: any; refreshStudioUi: any; resolvePreviewScope: any; selectElement: any; validateSelectionChange: any; }

export function applyToolSetting(deps: ApplyToolSettingDeps, selectedToolName: any) {
  const { appCtx, applyPlacementChange, captureUndoSnapshot, getLightGroups, getPixelsPerMeter, getSelectedObject, isSelectionAllowed, itemLightSourceVisibleInput, itemStripRollInput, markDocumentDirty, refreshScopeItems, refreshStudioUi, resolvePreviewScope, selectElement, validateSelectionChange } = deps;

  const toolPlacedElement = getSelectedObject();
  if (
    !toolPlacedElement ||
    appCtx.selectedItem?.kind !== selectedToolName ||
    !isSelectionAllowed(appCtx.selectedItem)
  )
    return;
  const yr2 =
      selectedToolName === "item"
        ? resolvePreviewScope(toolPlacedElement)
        : ["door", "window", "railing"].includes(selectedToolName)
          ? "architecture"
          : "all",
    ft9 = captureUndoSnapshot();
  if (selectedToolName === "wall")
    ((toolPlacedElement.height = clamp2(
      finite2(selectElement("#wall-height").value, toolPlacedElement.height),
      0.01,
      6,
    )),
      (toolPlacedElement.thickness = clamp2(
        finite2(selectElement("#wall-thickness").value, toolPlacedElement.thickness),
        0.01,
        3,
      )),
      (toolPlacedElement.opacity =
        selectElement("#wall-opacity-mode").value === "custom"
          ? clamp2(
              finite2(selectElement("#wall-opacity").value, appCtx.studioState.settings.wallOpacity * 100),
              0,
              100,
            ) / 100
          : null),
      (toolPlacedElement.allowOpenEnd = selectElement("#wall-open-end-mode").value === "allowed"),
      (appCtx.studioState.settings.wallHeight = toolPlacedElement.height),
      (appCtx.studioState.settings.wallThickness = toolPlacedElement.thickness));
  else {
    if (selectedToolName === "window") {
      ((toolPlacedElement.width = clamp2(
        finite2(selectElement("#window-width").value, toolPlacedElement.width),
        0.3,
        20,
      )),
        (toolPlacedElement.height = clamp2(
          finite2(selectElement("#window-height").value, toolPlacedElement.height),
          0.3,
          20,
        )),
        (toolPlacedElement.sill = clamp2(
          finite2(selectElement("#window-sill").value, toolPlacedElement.sill),
          0,
          20,
        )),
        (toolPlacedElement.hasDivider = selectElement("#window-divider").value !== "without"));
      const toolAnchorWallRecord = appCtx.studioState.walls.find(
        (toolAnchorWall) => toolAnchorWall.id === toolPlacedElement.wallId,
      );
      toolAnchorWallRecord &&
        (toolPlacedElement.t = clampWindowT2(
          toolAnchorWallRecord,
          toolPlacedElement,
          getPixelsPerMeter(),
        ));
    } else {
      if (selectedToolName === "door") {
        ((toolPlacedElement.doorType = Object.hasOwn(
          doorTypeCatalog,
          selectElement("#door-type").value,
        )
          ? selectElement("#door-type").value
          : "solid"),
          (toolPlacedElement.width = clamp2(
            finite2(selectElement("#door-width").value, toolPlacedElement.width),
            0.55,
            20,
          )),
          (toolPlacedElement.height = clamp2(
            finite2(selectElement("#door-height").value, toolPlacedElement.height),
            1.8,
            20,
          )));
        const toolWindowWallRecord = appCtx.studioState.walls.find(
          (toolWindowWall) => toolWindowWall.id === toolPlacedElement.wallId,
        );
        toolWindowWallRecord &&
          (toolPlacedElement.t = clampWindowT2(
            toolWindowWallRecord,
            toolPlacedElement,
            getPixelsPerMeter(),
          ));
      } else {
        if (selectedToolName === "railing") {
          ((toolPlacedElement.width = clamp2(
            finite2(selectElement("#railing-width").value, toolPlacedElement.width),
            0.3,
            20,
          )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement("#railing-height").value, toolPlacedElement.height),
              0.5,
              3,
            )));
          const toolDoorWallRecord = appCtx.studioState.walls.find(
            (toolDoorWall) => toolDoorWall.id === toolPlacedElement.wallId,
          );
          toolDoorWallRecord &&
            (toolPlacedElement.t = clampWindowT2(
              toolDoorWallRecord,
              toolPlacedElement,
              getPixelsPerMeter(),
            ));
        } else {
          const toolPpm = getPixelsPerMeter() || 1;
          if (
            ((toolPlacedElement.x =
              finite2(selectElement("#item-x").value, toolPlacedElement.x / toolPpm) * toolPpm),
            (toolPlacedElement.y =
              finite2(selectElement("#item-y").value, toolPlacedElement.y / toolPpm) * toolPpm),
            toolPlacedElement.type === "fan" &&
              Object.assign(
                toolPlacedElement,
                fanDimensions2({
                  ...toolPlacedElement,
                  fanHeight: Number(selectElement("#fan-model-height").value),
                  fanScale: Number(selectElement("#fan-model-scale").value) / 100,
                }),
              ),
            (toolPlacedElement.width = clamp2(
              finite2(selectElement("#item-width").value, toolPlacedElement.width),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement("#item-height").value, toolPlacedElement.height),
              itemMinimumHeight2(toolPlacedElement.type),
              6,
            )),
            (toolPlacedElement.depth = clamp2(
              finite2(selectElement("#item-depth").value, toolPlacedElement.depth),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            toolPlacedElement.type === "sofa-l" &&
              (toolPlacedElement.sofaChaiseSide =
                selectElement("#sofa-chaise-side").value === "left" ? "left" : "right"),
            toolPlacedElement.type === "fan" &&
              Object.assign(toolPlacedElement, fanDimensions2(toolPlacedElement)),
            (toolPlacedElement.elevation = clamp2(
              finite2(selectElement("#item-elevation").value, toolPlacedElement.elevation || 0),
              0,
              6,
            )),
            toolPlacedElement.type === "airer" &&
              Object.assign(
                toolPlacedElement,
                airerDimensions2({
                  ...toolPlacedElement,
                  airerStyle:
                    selectElement("#airer-style").value === "single" ? "single" : "double",
                  airerExtension: Number(selectElement("#airer-extension").value),
                  airerPreview: Number(selectElement("#airer-preview").value),
                }),
              ),
            (toolPlacedElement.rotation =
              toolPlacedElement.type === "striplight"
                ? normalizeFullRotation2(
                    selectElement("#item-rotation").value,
                    toolPlacedElement.rotation,
                  )
                : finite2(selectElement("#item-rotation").value, toolPlacedElement.rotation)),
            toolPlacedElement.type === "planlabel" &&
              ((toolPlacedElement.title = normalizeLabelText2(
                selectElement("#label-title").value,
                "家庭总览",
                24,
              )),
              (toolPlacedElement.subtitle = normalizeLabelText2(
                selectElement("#label-subtitle").value,
                "HOME PLAN",
                36,
              )),
              (toolPlacedElement.titleSpacing = clamp2(
                finite2(selectElement("#label-title-spacing").value, 105) / 100,
                0,
                1.8,
              )),
              (toolPlacedElement.subtitleSpacing = clamp2(
                finite2(selectElement("#label-subtitle-spacing").value, 8) / 100,
                0,
                0.6,
              )),
              (toolPlacedElement.lineLength = clamp2(
                finite2(selectElement("#label-line-length").value, 86) / 100,
                0.3,
                1,
              )),
              (toolPlacedElement.labelColor = normalizePlanLabelColor(
                selectElement("#label-color").value,
              )),
              (toolPlacedElement.height = 0.01),
              (toolPlacedElement.elevation = 0)),
            toolPlacedElement.type === "curtain")
          ) {
            toolPlacedElement.curtainPosition = ["left", "right", "split"].includes(
              selectElement("#curtain-position").value,
            )
              ? selectElement("#curtain-position").value
              : "split";
            const curtainTrack = normalizeCurtainTrack2(toolPlacedElement).curtainTrack;
            ((toolPlacedElement.curtainForm =
              selectElement("#curtain-form").value === "roller" ? "roller" : "standard"),
              Object.assign(
                toolPlacedElement,
                normalizeCurtainTrack2({
                  curtainForm: toolPlacedElement.curtainForm,
                  curtainTrack: selectElement("#curtain-track").value,
                  curtainCorner: selectElement("#curtain-corner").value,
                  curtainLeftLength: selectElement("#curtain-left-length").value,
                  curtainRightLength: selectElement("#curtain-right-length").value,
                  curtainMeet: selectElement("#curtain-meet").value,
                  curtainPreview: selectElement("#curtain-preview").value,
                  curtainFabric: selectElement("#curtain-fabric").value,
                }),
              ),
              curtainTrack !== "straight" &&
                toolPlacedElement.curtainTrack === "straight" &&
                (toolPlacedElement.depth = 0.18),
              (toolPlacedElement.depth = curtainFootprintDepth2(toolPlacedElement)));
          }
          if (
            (roundTableTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.roundTableTurntable =
                selectElement("#round-table-turntable").value === "with"),
            toolPlacedElement.type === "fridge" &&
              (toolPlacedElement.fridgeStyle =
                document.querySelector<StudioControlElement>('input[name="fridge-style"]:checked')?.value === "double"
                  ? "double"
                  : "standard"),
            openStairTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.stairDirection = ["left", "right"].includes(
                selectElement("#stair-direction").value,
              )
                ? selectElement("#stair-direction").value
                : "right"),
            toolPlacedElement.type === "pillar" &&
              ((toolPlacedElement.pillarShape = normalizePillarShape2(
                selectElement("#pillar-shape").value,
              )),
              (toolPlacedElement.pillarAxis = normalizePillarAxis2(
                selectElement("#pillar-axis").value,
              ))),
            toolPlacedElement.type === "pipelinewaterpurifier" &&
              setPipelineDispenserStyle(
                toolPlacedElement,
                selectElement("#pipeline-dispenser-style").value,
              ),
            toolPlacedElement.type === "striplight" &&
              ((toolPlacedElement.stripAxis = normalizeStripAxis2(
                selectElement("#strip-axis").value,
              ))),
            toolPlacedElement.type === "mural" &&
              (toolPlacedElement.muralStyle = normalizeMuralArtStyle(
                selectElement("#mural-style").value,
              )),
            toolPlacedElement.type === "featurewall" &&
              (toolPlacedElement.wallStyle = normalizeFeatureWallStyle(
                selectElement("#featurewall-style").value,
              )),
            toolPlacedElement.type === "tv")
          ) {
            const tvMountStyle2 = tvMountStyleSet.has(toolPlacedElement.tvMountStyle)
                ? toolPlacedElement.tvMountStyle
                : "standard",
              tvMountStyleValue = tvMountStyleSet.has(selectElement("#tv-mount-style").value)
                ? selectElement("#tv-mount-style").value
                : "standard";
            (tvMountStyle2 !== tvMountStyleValue && tvMountStyleValue === "mobile"
              ? ((toolPlacedElement.height = Math.max(
                  toolPlacedElement.height,
                  sofaMinDimensions.height,
                )),
                (toolPlacedElement.depth = Math.max(
                  toolPlacedElement.depth,
                  sofaMinDimensions.depth,
                )),
                (toolPlacedElement.elevation = 0))
              : tvMountStyle2 === "mobile" &&
                tvMountStyleValue !== "mobile" &&
                Math.abs(toolPlacedElement.height - sofaMinDimensions.height) < 0.001 &&
                Math.abs(toolPlacedElement.depth - sofaMinDimensions.depth) < 0.001 &&
                ((toolPlacedElement.height = itemTypeCatalog.tv.height),
                (toolPlacedElement.depth = itemTypeCatalog.tv.depth)),
              (toolPlacedElement.tvMountStyle = tvMountStyleValue));
          }
          if (lampItemTypeSet.has(toolPlacedElement.type)) {
            const downlight5 =
              (lightPresetCatalog as any)[toolPlacedElement.type] || lightPresetCatalog.downlight;
            ((toolPlacedElement.verticalRotation =
              toolPlacedElement.type === "striplight"
                ? normalizeFullRotation2(
                    selectElement("#item-vertical-rotation").value,
                    toolPlacedElement.verticalRotation || 0,
                  )
                : clamp2(
                    finite2(
                      selectElement("#item-vertical-rotation").value,
                      toolPlacedElement.verticalRotation || 0,
                    ),
                    -90,
                    90,
                  )),
              toolPlacedElement.type === "striplight" &&
                ((toolPlacedElement.stripRollRotation = normalizeFullRotation2(
                  itemStripRollInput.value,
                  toolPlacedElement.stripRollRotation || 0,
                )),
                (toolPlacedElement.lightSourceVisible = itemLightSourceVisibleInput.checked)),
              (toolPlacedElement.lightGroupId = appCtx.studioState.lightGroups.some(
                (matchingLightGroup) =>
                  matchingLightGroup.id === selectElement("#light-group").value,
              )
                ? selectElement("#light-group").value
                : getLightGroups().id),
              (toolPlacedElement.lightTemperature = clamp2(
                finite2(selectElement("#light-temperature").value, downlight5.temperature),
                2200,
                6500,
              )),
              (toolPlacedElement.lightBrightness = clamp2(
                finite2(selectElement("#light-brightness").value, downlight5.brightness),
                0,
                100,
              )),
              (toolPlacedElement.lightRange = clamp2(
                finite2(selectElement("#light-range").value, downlight5.range),
                0.5,
                10,
              )),
              (toolPlacedElement.lightAngle = clamp2(
                finite2(selectElement("#light-angle").value, downlight5.angle),
                15,
                lightAngleLimitForType(toolPlacedElement.type),
              )),
              (toolPlacedElement.height = (itemTypeCatalog as any)[toolPlacedElement.type].height));
          } else
            ["camera", "presence"].includes(toolPlacedElement.type) &&
              (toolPlacedElement.verticalRotation = clamp2(
                finite2(
                  selectElement("#item-vertical-rotation").value,
                  toolPlacedElement.verticalRotation || 0,
                ),
                -180,
                180,
              ));
        }
      }
    }
  }
  if (
    (selectedToolName === "item" &&
      toolPlacedElement.type.startsWith("garden-gate") &&
      (anchorGate2(toolPlacedElement, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom),
      syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter())),
    !validateSelectionChange(ft9))
  ) {
    (refreshStudioUi(true), refreshScopeItems(yr2));
    return;
  }
  (applyPlacementChange(ft9), refreshScopeItems(yr2), markDocumentDirty());

}
