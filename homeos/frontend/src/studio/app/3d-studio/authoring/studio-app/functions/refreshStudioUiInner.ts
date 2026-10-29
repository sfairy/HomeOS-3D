import {
  editNumberText,
  itemDimensionPolicy as itemDimensionPolicy2,
  rememberNumberValue,
} from "../../studio-edit-metrics";




import {
  isCourtyardGate as isCourtyardGate2,
} from "../../../plan/courtyard-drawing";
import { normalizeModelRemark as normalizeModelRemark2 } from "../../../../shared/model-remarks";


import {
  airerDimensions as airerDimensions2,
} from "../../items/studio-airer";
import { normalizePipelineDispenserStyle } from "../../items/pipeline-dispenser";
import {
  fanDimensions as fanDimensions2,
} from "../../items/studio-fan";




import {
  normalizeMuralArtStyle,
  normalizeFeatureWallStyle,
} from "../../../materials/studio-surface-textures";




import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
} from "../../../loaders/studio-curtain-track";








import {
  clamp as clamp2,
  wallLengthMeters as wallLengthMeters2,
} from "../../../plan/geometry";




import { syncControlValue as syncControlValue2 } from "../../ui/ui-controls";
import {
  syncStudioSelect as syncStudioSelect2,
} from "../../ui/studio-widgets";




import {
  isCourtyardDrawing as isCourtyardDrawing2,
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
  normalizeFullRotation as normalizeFullRotation2,
} from "../../../loaders/studio-normalization";
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
  normalizeStripAxis as normalizeStripAxis2,
  pillarIsLying as pillarIsLying2,
} from "../../items/studio-item-posture";
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet, tvMountStyleSet } from "../../items/item-catalog";
import { STORAGE_SECTION_TYPES, storageSectionStyle } from "../../items/studio-storage-sections";


import type {
  StudioControlElement,
} from '../../types/studio-app-types';
import {
  isTurntableRoundTable,
} from '../../ui/studio-app-helpers';
import {
  lightPresetCatalog,
  lightAngleLimitForType,
} from '../../lights/studio-app-light-data';
import { normalizePlanLabelColor } from "../../scene/studio-scene-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface RefreshStudioUiInnerDeps { appCtx: StudioAppContext; applyLightPropertyControls: any; curtainPositionFieldElement: any; deleteSelectionButton: any; doorFieldsElement: any; getLightGroups: any; getPixelsPerMeter: any; getSelectedObject: any; inspectorEmptyElement: any; itemDepthLabelElement: any; itemElevationFieldElement: any; itemFieldsElement: any; itemHeightFieldElement: any; itemHeightLabelElement: any; itemLightSourceVisibilityFieldElement: any; itemLightSourceVisibleInput: any; itemRotationActionsElement: any; itemRotationFieldElement: any; itemStripOrientationHeadingElement: any; itemStripRollFieldElement: any; itemStripRollInput: any; itemVerticalRotationFieldElement: any; itemVerticalRotationLabelElement: any; itemWidthLabelElement: any; labelTextFieldsElement: any; lightFieldsElement: any; lightPreviewNoteElement: any; pillarAxisFieldElement: any; pillarShapeFieldElement: any; planPainter: any; railingFieldsElement: any; renderDoorMaterialPanel: any; renderMaterialSlotPanel: any; resolveLightGroup: any; roundTableTurntableFieldElement: any; selectElement: any; selectionHeadingElement: any; selectionIdElement: any; selectionInspectorElement: any; shoeCabinetActionsElement: any; shoeCabinetMirrorButton: any; stairDirectionFieldElement: any; stripAxisFieldElement: any; syncLightGroupList: any; syncLightGroupSelect: any; tvMountStyleFieldElement: any; wallFieldsElement: any; windowFieldsElement: any; }

export function refreshStudioUiInner(deps: RefreshStudioUiInnerDeps, shouldClearActiveElement = false) {
  const { appCtx, applyLightPropertyControls, curtainPositionFieldElement, deleteSelectionButton, doorFieldsElement, getLightGroups, getPixelsPerMeter, getSelectedObject, inspectorEmptyElement, itemDepthLabelElement, itemElevationFieldElement, itemFieldsElement, itemHeightFieldElement, itemHeightLabelElement, itemLightSourceVisibilityFieldElement, itemLightSourceVisibleInput, itemRotationActionsElement, itemRotationFieldElement, itemStripOrientationHeadingElement, itemStripRollFieldElement, itemStripRollInput, itemVerticalRotationFieldElement, itemVerticalRotationLabelElement, itemWidthLabelElement, labelTextFieldsElement, lightFieldsElement, lightPreviewNoteElement, pillarAxisFieldElement, pillarShapeFieldElement, planPainter, railingFieldsElement, renderDoorMaterialPanel, renderMaterialSlotPanel, resolveLightGroup, roundTableTurntableFieldElement, selectElement, selectionHeadingElement, selectionIdElement, selectionInspectorElement, shoeCabinetActionsElement, shoeCabinetMirrorButton, stairDirectionFieldElement, stripAxisFieldElement, syncLightGroupList, syncLightGroupSelect, tvMountStyleFieldElement, wallFieldsElement, windowFieldsElement } = deps;

  const setControlValue = (controlElement: any, controlValue: any) =>
      syncControlValue2(
        controlElement,
        controlValue,
        shouldClearActiveElement ? null : document.activeElement,
      ),
    /**
     * 数字输入框回写（0.8.1 `v1275`）：显示文本统一走 `editNumberText`（最多 6 位小数、
     * 去掉尾随 0），同时把「显示文本 → 数值」记进 memo，± 步进才能接着算，
     * 而不是重新解析被格式化过的字符串（0.30000000000000004 就是这么来的）。
     */
    setNumericControlValue = (controlElement: HTMLInputElement, numericValue: number) => {
      setControlValue(controlElement, editNumberText(numericValue));
      rememberNumberValue(controlElement, numericValue);
    },
    at4 = getSelectedObject(),
    selectionCount = appCtx.selectedItems.length;
  if (
    (planPainter?.refresh(at4),
    (inspectorEmptyElement.hidden = !!at4),
    (selectionInspectorElement.hidden = !at4),
    (deleteSelectionButton.disabled = !at4 && !selectionCount),
    selectionCount)
  ) {
    ((inspectorEmptyElement.hidden = false),
      (selectionInspectorElement.hidden = true),
      (inspectorEmptyElement.querySelector("strong").textContent =
        "已框选 " + selectionCount + " 个对象"),
      (inspectorEmptyElement.querySelector("p").textContent =
        "可以直接批量删除；单击一个对象可继续精确编辑属性。"));
    return;
  }
  if (
    ((inspectorEmptyElement.querySelector("strong").textContent = "选择画布中的对象"),
    (inspectorEmptyElement.querySelector("p").textContent =
      "选中墙体、窗户、门或家具后，可在这里精确调整。"),
    (selectElement("#courtyard-gate-style-field").hidden = !isCourtyardGate2(at4)),
    isCourtyardGate2(at4) &&
      ((selectElement("#courtyard-gate-style").value = at4.type),
      syncStudioSelect2(selectElement("#courtyard-gate-style"))),
    !(!at4 || !appCtx.selectedItem))
  ) {
    // 备注只对「门 / 物件」开放：灯具有灯组与批量入口、平面标签与庭院绘制走各自的命名，
    // 都不参与 3D 交互里的模型选择，给了输入框反而会让人以为能按备注选中。
    const isRemarkableModel =
      at4 &&
      (appCtx.selectedItem.kind === "door" ||
        (appCtx.selectedItem.kind === "item" &&
          at4.type !== "planlabel" &&
          !lampItemTypeSet.has(at4.type) &&
          !isCourtyardDrawing2(at4)));
    ((selectElement("#model-remark-field").hidden = !isRemarkableModel),
      isRemarkableModel &&
        setControlValue(selectElement("#model-remark"), normalizeModelRemark2(at4.remark)));
    if (
      ((lightPreviewNoteElement.hidden = true),
      selectionHeadingElement.classList.remove("light-selected"),
      (wallFieldsElement.hidden = appCtx.selectedItem.kind !== "wall"),
      (windowFieldsElement.hidden = appCtx.selectedItem.kind !== "window"),
      (doorFieldsElement.hidden = appCtx.selectedItem.kind !== "door"),
      (railingFieldsElement.hidden = appCtx.selectedItem.kind !== "railing"),
      (itemFieldsElement.hidden = appCtx.selectedItem.kind !== "item"),
      (selectionIdElement.hidden = appCtx.selectedItem.kind === "item"),
      (selectionIdElement.textContent = selectionIdElement.hidden ? "" : at4.id),
      isCourtyardDrawing2(at4))
    ) {
      ((itemFieldsElement.hidden = true),
        (selectElement("#selection-title").textContent = (itemTypeCatalog as any)[at4.type].name));
      return;
    }


    appCtx.selectedItem.kind === "door"
      ? renderDoorMaterialPanel(at4)
      : renderMaterialSlotPanel(at4);
    if (appCtx.selectedItem.kind === "wall") {
      ((selectElement("#selection-title").textContent = "墙体"),
        setControlValue(
          selectElement("#wall-length"),
          wallLengthMeters2(at4, getPixelsPerMeter() || 1).toFixed(2) + " m",
        ),
        setNumericControlValue(selectElement("#wall-height"), at4.height),
        setNumericControlValue(selectElement("#wall-thickness"), at4.thickness));
      const customWallOpacity =
        at4.opacity === null || at4.opacity === undefined
          ? null
          : clamp2(finite2(at4.opacity, appCtx.studioState.settings.wallOpacity), 0, 1);
      ((selectElement("#wall-opacity-mode").value =
        customWallOpacity === null ? "global" : "custom"),
        setControlValue(
          selectElement("#wall-opacity"),
          Math.round((customWallOpacity ?? appCtx.studioState.settings.wallOpacity) * 100),
        ),
        (selectElement("#wall-opacity").disabled = customWallOpacity === null),
        syncStudioSelect2(selectElement("#wall-opacity-mode")),
        (selectElement("#wall-open-end-mode").value =
          at4.allowOpenEnd === true ? "allowed" : "auto"),
        syncStudioSelect2(selectElement("#wall-open-end-mode")));
    } else {
      if (appCtx.selectedItem.kind === "window")
        ((selectElement("#selection-title").textContent = "窗户"),
          setNumericControlValue(selectElement("#window-width"), at4.width),
          setNumericControlValue(selectElement("#window-height"), at4.height),
          setNumericControlValue(selectElement("#window-sill"), at4.sill),
          (selectElement("#window-divider").value = at4.hasDivider === false ? "without" : "with"),
          syncStudioSelect2(selectElement("#window-divider")),
          setControlValue(selectElement("#window-position"), Math.round(at4.t * 100) + "%"));
      else {
        if (appCtx.selectedItem.kind === "door")
          ((selectElement("#selection-title").textContent =
            ({
              solid: "普通平开门",
              double: "双开门",
              entry: "入户门（常闭）",
              "entry-child-mother": "入户子母门",
              glass: "玻璃平开门",
              "sliding-glass": "玻璃推拉门（常开）",
              "roller-shutter": "卷帘门",
              "frame-only": "仅门框",
            } as any)[at4.doorType] || "普通平开门"),
            (selectElement("#door-type").value = at4.doorType || "solid"),
            syncStudioSelect2(selectElement("#door-type")),
            setNumericControlValue(selectElement("#door-width"), at4.width),
            setNumericControlValue(selectElement("#door-height"), at4.height),
            setControlValue(selectElement("#door-position"), Math.round(at4.t * 100) + "%"),
            (selectElement(".door-actions").hidden = at4.doorType === "frame-only"),
            (selectElement("#door-hinge").hidden = [
              "double",
              "roller-shutter",
              "frame-only",
            ].includes(at4.doorType)),
            (selectElement("#door-swing").hidden = ["sliding-glass", "frame-only"].includes(
              at4.doorType,
            )),
            (selectElement("#door-hinge").textContent =
              at4.doorType === "sliding-glass" ? "左右推拉" : "左右换边"),
            (selectElement("#door-swing").textContent =
              at4.doorType === "double"
                ? "双扇内外开"
                : at4.doorType === "entry-child-mother"
                  ? "子母内外开"
                  : at4.doorType === "roller-shutter"
                    ? "内外侧"
                    : "内外翻转"));
        else {
          if (appCtx.selectedItem.kind === "railing")
            ((selectElement("#selection-title").textContent = "玻璃栏杆"),
              setNumericControlValue(selectElement("#railing-width"), at4.width),
              setNumericControlValue(selectElement("#railing-height"), at4.height),
              setControlValue(selectElement("#railing-position"), Math.round(at4.t * 100) + "%"));
          else {
            const itemTypeDefinition = (itemTypeCatalog as any)[at4.type],
              isPlanLabel = at4.type === "planlabel",
              isLightItem = lampItemTypeSet.has(at4.type);
            if (
              ((selectElement("#selection-title").textContent = itemTypeDefinition?.name || "物件"),
              (lightPreviewNoteElement.hidden = !isLightItem),
              selectionHeadingElement.classList.toggle("light-selected", isLightItem),
              (labelTextFieldsElement.hidden = !isPlanLabel),
              (lightFieldsElement.hidden = !isLightItem),
              (curtainPositionFieldElement.hidden = at4.type !== "curtain"),
              (selectElement("#fridge-style-fields").hidden = at4.type !== "fridge"),
              (selectElement("#pipeline-dispenser-style-field").hidden =
                at4.type !== "pipelinewaterpurifier"),
              at4.type === "pipelinewaterpurifier" &&
                setControlValue(
                  selectElement("#pipeline-dispenser-style"),
                  normalizePipelineDispenserStyle(at4.pipelineDispenserStyle),
                ),
              at4.type === "fridge")
            ) {
              for (const fridgeStyleInput of document.querySelectorAll<StudioControlElement>(
                'input[name="fridge-style"]',
              ))
                fridgeStyleInput.checked =
                  fridgeStyleInput.value === (at4.fridgeStyle === "double" ? "double" : "standard");
            }
            if (
              ((selectElement("#curtain-track-fields").hidden = at4.type !== "curtain"),
              (selectElement("#airer-model-fields").hidden = at4.type !== "airer"),
              at4.type === "airer")
            ) {
              const airerDimensions = airerDimensions2(at4);
              (setControlValue(
                selectElement("#airer-style"),
                airerDimensions.airerStyle === "single" ? "single" : "double",
              ),
                setControlValue(
                  selectElement("#airer-extension"),
                  String(airerDimensions.airerExtension),
                ),
                setControlValue(
                  selectElement("#airer-preview"),
                  String(airerDimensions.airerPreview),
                ));
            }
            if (
              ((selectElement("#item-elevation").title =
                at4.type === "airer" ? "顶部机身安装面距本层地面的高度" : ""),
              (selectElement("#fan-model-fields").hidden = at4.type !== "fan"),
              at4.type === "fan")
            ) {
              const fanDimensions = fanDimensions2(at4);
              (setNumericControlValue(
                selectElement("#fan-model-scale"),
                fanDimensions.fanScale * 100,
              ),
                setNumericControlValue(
                  selectElement("#fan-model-height"),
                  fanDimensions.fanHeight,
                ));
            }
            for (const itemDimensionInput of [
              selectElement("#item-width"),
              selectElement("#item-height"),
              selectElement("#item-depth"),
            ])
              itemDimensionInput.readOnly =
                at4.type === "fan" ||
                (at4.type === "airer" && itemDimensionInput.id === "item-height");
            ((itemHeightFieldElement.hidden =
              isPlanLabel || isLightItem || at4.type === "flooropening"),
              (itemElevationFieldElement.hidden = isPlanLabel || at4.type === "flooropening"),
              (itemRotationFieldElement.hidden = at4.type === "ceilinglight"),
              (itemRotationActionsElement.hidden = at4.type === "ceilinglight"),
              (selectElement("#item-depth").readOnly =
                at4.type === "fan" ||
                (at4.type === "curtain" &&
                  normalizeCurtainTrack2(at4).curtainTrack !== "straight")));
            const includes = ["camera", "presence"].includes(at4.type);
            ((itemVerticalRotationFieldElement.hidden = !(isLightItem || includes)),
              (itemVerticalRotationFieldElement.title = includes
                ? "0° 正装，±90° 侧装，180° 倒装；离地高度为底座安装点高度"
                : ""),
              (itemStripRollFieldElement.hidden = at4.type !== "striplight"),
              (itemStripOrientationHeadingElement.hidden = at4.type !== "striplight"),
              (itemLightSourceVisibilityFieldElement.hidden = at4.type !== "striplight"),
              (pillarShapeFieldElement.hidden = at4.type !== "pillar"),
              (pillarAxisFieldElement.hidden = at4.type !== "pillar"),
              (stripAxisFieldElement.hidden = at4.type !== "striplight"),
              (roundTableTurntableFieldElement.hidden = !roundTableTypeSet.has(at4.type)),
              (selectElement("#sofa-chaise-side-field").hidden = at4.type !== "sofa-l"),
              (selectElement("#mural-style-field").hidden = at4.type !== "mural"),
              (selectElement("#featurewall-style-field").hidden = at4.type !== "featurewall"),
              at4.type === "sofa-l" &&
                ((selectElement("#sofa-chaise-side").value =
                  at4.sofaChaiseSide === "left" ? "left" : "right"),
                syncStudioSelect2(selectElement("#sofa-chaise-side"))),
              (stairDirectionFieldElement.hidden = !openStairTypeSet.has(at4.type)),
              (tvMountStyleFieldElement.hidden = at4.type !== "tv"),
              (selectElement("#storage-section-field").hidden = !STORAGE_SECTION_TYPES.has(at4.type)),
              STORAGE_SECTION_TYPES.has(at4.type) &&
                ((selectElement("#storage-section").value = storageSectionStyle(at4)),
                syncStudioSelect2(selectElement("#storage-section"))),
              (shoeCabinetActionsElement.hidden = at4.type !== "shoecabinet"),
              shoeCabinetMirrorButton.setAttribute(
                "aria-pressed",
                at4.shoeCabinetMirrored === true ? "true" : "false",
              ),
              (selectElement("#item-rotation-label").textContent =
                at4.type === "striplight"
                  ? "平面旋转（°）"
                  : isLightItem
                    ? "平面方向（°）"
                    : "旋转角度（°）"),
              (selectElement("#item-rotation").min = at4.type === "striplight" ? "0" : "-360"),
              (selectElement("#item-rotation").max = "360"),
              (itemVerticalRotationLabelElement.textContent =
                at4.type === "striplight"
                  ? "安装倾斜（°）"
                  : includes
                    ? "安装翻转／侧装（°）"
                    : "出光角度（°）"),
              (selectElement("#item-vertical-rotation").min =
                at4.type === "striplight" ? "0" : includes ? "-180" : "-90"),
              (selectElement("#item-vertical-rotation").max =
                at4.type === "striplight" ? "360" : includes ? "180" : "90"));
            for (const lightControlElement of applyLightPropertyControls)
              lightControlElement.hidden = !isLightItem;
            if (
              ((itemWidthLabelElement.textContent =
                at4.type === "flooropening"
                  ? "洞口宽（m）"
                  : at4.type === "striplight"
                    ? "发光长度（m）"
                    : at4.type === "pillar"
                      ? "长（m）"
                      : "宽（m）"),
              at4.type === "curtain" && (itemWidthLabelElement.textContent = "主边长度（m）"),
              (itemDepthLabelElement.textContent =
                at4.type === "flooropening"
                  ? "洞口长（m）"
                  : at4.type === "striplight"
                    ? "发光宽度（m）"
                    : isPlanLabel
                      ? "铭牌高（m）"
                      : at4.type === "pillar"
                        ? "宽（m）"
                        : "深（m）"),
              isPlanLabel &&
                (setControlValue(selectElement("#label-title"), at4.title || "家庭总览"),
                setControlValue(
                  selectElement("#label-title-spacing"),
                  Math.round(clamp2(finite2(at4.titleSpacing, 1.05), 0, 1.8) * 100),
                ),
                setControlValue(selectElement("#label-subtitle"), at4.subtitle || "HOME PLAN"),
                setControlValue(
                  selectElement("#label-subtitle-spacing"),
                  Math.round(clamp2(finite2(at4.subtitleSpacing, 0.08), 0, 0.6) * 100),
                ),
                setControlValue(
                  selectElement("#label-line-length"),
                  Math.round(clamp2(finite2(at4.lineLength, 0.86), 0.3, 1) * 100),
                ),
                setControlValue(
                  selectElement("#label-color"),
                  normalizePlanLabelColor(at4.labelColor),
                )),
              isLightItem)
            ) {
              const downlight2 = (lightPresetCatalog as any)[at4.type] || lightPresetCatalog.downlight;
              ((appCtx.activeLightGroupId = resolveLightGroup(at4)?.id || getLightGroups().id),
                syncLightGroupList(),
                syncLightGroupSelect(at4),
                setControlValue(
                  selectElement("#light-temperature"),
                  Math.round(
                    clamp2(finite2(at4.lightTemperature, downlight2.temperature), 2200, 6500),
                  ),
                ),
                setControlValue(
                  selectElement("#light-brightness"),
                  Math.round(clamp2(finite2(at4.lightBrightness, downlight2.brightness), 0, 100)),
                ),
                setControlValue(
                  selectElement("#light-range"),
                  clamp2(finite2(at4.lightRange, downlight2.range), 0.5, 10).toFixed(1),
                ),
                (selectElement("#light-angle").max = String(lightAngleLimitForType(at4.type))),
                setControlValue(
                  selectElement("#light-angle"),
                  Math.round(
                    clamp2(
                      finite2(at4.lightAngle, downlight2.angle),
                      15,
                      lightAngleLimitForType(at4.type),
                    ),
                  ),
                ));
              const itemVerticalRotation =
                at4.type === "striplight"
                  ? normalizeFullRotation2(at4.verticalRotation)
                  : clamp2(finite2(at4.verticalRotation, 0), -90, 90);
              (setControlValue(
                selectElement("#item-vertical-rotation"),
                Math.round(itemVerticalRotation * 100) / 100,
              ),
                setControlValue(
                  itemStripRollInput,
                  Math.round(clamp2(finite2(at4.stripRollRotation, 0), 0, 360) * 100) / 100,
                ),
                (itemLightSourceVisibleInput.checked = at4.lightSourceVisible !== false));
            }
            if (
              (includes &&
                syncControlValue2(
                  selectElement("#item-vertical-rotation"),
                  Math.round(clamp2(finite2(at4.verticalRotation, 0), -180, 180) * 100) / 100,
                ),
              at4.type === "curtain")
            ) {
              const isRollerCurtain = at4.curtainForm === "roller";
              ((selectElement("#curtain-form").value = isRollerCurtain ? "roller" : "standard"),
                syncStudioSelect2(selectElement("#curtain-form")),
                (curtainPositionFieldElement.hidden = isRollerCurtain),
                (selectElement("#curtain-track-field").hidden = isRollerCurtain),
                (selectElement("#curtain-position").value = ["left", "right", "split"].includes(
                  at4.curtainPosition,
                )
                  ? at4.curtainPosition
                  : "split"),
                syncStudioSelect2(selectElement("#curtain-position")));
              const curtainTrackSettings = normalizeCurtainTrack2(at4);
              for (const [curtainControlId, curtainControlValue] of [
                ["curtain-track", curtainTrackSettings.curtainTrack],
                ["curtain-corner", curtainTrackSettings.curtainCorner],
                ["curtain-fabric", at4.curtainFabric || "cloth"],
              ])
                ((selectElement("#" + curtainControlId).value = curtainControlValue),
                  syncStudioSelect2(selectElement("#" + curtainControlId)));
              for (const [curtainSyncId, curtainSyncValue] of [
                ["curtain-left-length", curtainTrackSettings.curtainLeftLength],
                ["curtain-right-length", curtainTrackSettings.curtainRightLength],
                ["curtain-meet", curtainTrackSettings.curtainMeet],
                ["curtain-preview", curtainTrackSettings.curtainPreview],
              ])
                syncControlValue2(selectElement("#" + curtainSyncId), curtainSyncValue);
              ((selectElement("#curtain-corner-field").hidden =
                curtainTrackSettings.curtainTrack !== "l"),
                (selectElement("#curtain-left-length-field").hidden =
                  curtainTrackSettings.curtainTrack === "straight" ||
                  (curtainTrackSettings.curtainTrack === "l" &&
                    curtainTrackSettings.curtainCorner !== "left")),
                (selectElement("#curtain-right-length-field").hidden =
                  curtainTrackSettings.curtainTrack === "straight" ||
                  (curtainTrackSettings.curtainTrack === "l" &&
                    curtainTrackSettings.curtainCorner !== "right")),
                (selectElement("#curtain-meet-field").hidden =
                  isRollerCurtain || at4.curtainPosition !== "split"));
            }
            (roundTableTypeSet.has(at4.type) &&
              ((selectElement("#round-table-turntable").value = isTurntableRoundTable(at4)
                ? "with"
                : "without"),
              syncStudioSelect2(selectElement("#round-table-turntable"))),
              openStairTypeSet.has(at4.type) &&
                ((selectElement("#stair-direction").value = ["left", "right"].includes(
                  at4.stairDirection,
                )
                  ? at4.stairDirection
                  : "right"),
                syncStudioSelect2(selectElement("#stair-direction"))),
              at4.type === "tv" &&
                ((selectElement("#tv-mount-style").value = tvMountStyleSet.has(at4.tvMountStyle)
                  ? at4.tvMountStyle
                  : "standard"),
                syncStudioSelect2(selectElement("#tv-mount-style"))),
              at4.type === "mural" &&
                ((selectElement("#mural-style").value = normalizeMuralArtStyle(at4.muralStyle)),
                syncStudioSelect2(selectElement("#mural-style"))),
              at4.type === "featurewall" &&
                ((selectElement("#featurewall-style").value = normalizeFeatureWallStyle(
                  at4.wallStyle,
                )),
                syncStudioSelect2(selectElement("#featurewall-style"))),
              at4.type === "pillar" &&
                ((selectElement("#pillar-shape").value = normalizePillarShape2(at4.pillarShape)),
                syncStudioSelect2(selectElement("#pillar-shape")),
                (selectElement("#pillar-axis").value = normalizePillarAxis2(at4.pillarAxis)),
                syncStudioSelect2(selectElement("#pillar-axis"))),
              at4.type === "striplight" &&
                ((selectElement("#strip-axis").value = normalizeStripAxis2(at4.stripAxis)),
                syncStudioSelect2(selectElement("#strip-axis"))),
              setNumericControlValue(
                selectElement("#item-x"),
                at4.x / (getPixelsPerMeter() || 1),
              ),
              setNumericControlValue(
                selectElement("#item-y"),
                at4.y / (getPixelsPerMeter() || 1),
              ));
            const dimensionPolicy = itemDimensionPolicy2(at4.type),
              dimensionDecimals = dimensionPolicy.digits;
            for (const footprintInput of [
              selectElement("#item-width"),
              selectElement("#item-depth"),
            ])
              ((footprintInput.min = String(itemMinimumFootprint2(at4.type))),
                (footprintInput.step = String(dimensionPolicy.widthStep)));
            (setNumericControlValue(selectElement("#item-width"), at4.width),
              (itemHeightLabelElement.textContent = pillarIsLying2(at4) ? "长（m）" : "高（m）"),
              (selectElement("#item-height").min = String(itemMinimumHeight2(at4.type))),
              (selectElement("#item-height").step = String(dimensionPolicy.heightStep)),
              setNumericControlValue(selectElement("#item-height"), at4.height),
              setNumericControlValue(selectElement("#item-depth"), at4.depth),
              setNumericControlValue(selectElement("#item-elevation"), at4.elevation || 0),
              setNumericControlValue(selectElement("#item-rotation"), at4.rotation));
          }
        }
      }
    }
  }

}
