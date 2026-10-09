#!/usr/bin/env python3
"""Remove extracted bodies from studio-app.ts and wire createX hosts."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "src/studio/app/3d-studio/studio/studio-app.ts"

IMPORTS = """
import { createSceneCacheDescriptor } from './studio-app-scene-cache-descriptor';
import { createGenerateExportBundle } from './studio-app-export-bundle';
import { createRefreshStudioUiInner } from './studio-app-refresh-ui-inner';
import { createApplyToolSetting } from './studio-app-apply-tool-setting';
import { createLightPropertyList } from './studio-app-light-property-list';
import { createDrawDoor } from './studio-app-draw-door';
"""

WIRE_ANCHOR = "for (const lightTargetToggleRow of applyLightPropertyControls)"

HOST_BLOCK = """
const studioAppExtractHost = {
  get activeLightGroupId() {
    return activeLightGroupId;
  },
  set activeLightGroupId(v: any) {
    activeLightGroupId = v;
  },
  get isExporting() {
    return isExporting;
  },
  set isExporting(v: any) {
    isExporting = v;
  },
  get pendingRuntimeSettings() {
    return pendingRuntimeSettings;
  },
  get studioProject() {
    return studioProject;
  },
  get studioState() {
    return studioState;
  },
  get selectedItem() {
    return selectedItem;
  },
  set selectedItem(v: any) {
    selectedItem = v;
  },
  get planPainter() {
    return planPainter;
  },
  get planView() {
    return planView;
  },
  get activeDoorType() {
    return activeDoorType;
  },
  applyCameraState,
  applyExportVisibility,
  applyPlacementChange,
  autoDiagramComponentId,
  backgroundSettings,
  beginExportFlow,
  blobToBytes,
  buildExportCamera,
  buildLightExportEntry,
  captureOverviewCamera,
  captureStudioSnapshot,
  captureUndoSnapshot,
  collectSelectedExportFiles,
  createSelectionRef,
  curtainStructureJson,
  doorPlanColor,
  drawGuideSegment,
  drawLabelText,
  drawPointMarker,
  exportFolderNameInput,
  exportStatusElement,
  externalModelRegistry,
  fetchStudioApi,
  floorElevationFor,
  getActiveFloor,
  getLightGroups,
  getOrderedFloorList,
  getPixelsPerMeter,
  getPreviewFloorMode,
  getSelectedObject,
  isAutoDiagramEmbed,
  isEmbedStageMode,
  isInteractionLocked,
  itemLightSourceVisibleInput,
  itemStripRollInput,
  lightPropertySelectionCountElement,
  lightPropertyTargetListElement,
  lightPropertyToggleAllButton,
  makeUniqueFileName,
  markDocumentDirty,
  planCanvasRenderer,
  planToScreen,
  projectItemAnchor,
  projectLightGroupAnchor,
  rebuildFloorLayers,
  reflectionSettingsJson,
  renderBackgroundLayer,
  renderDoorMaterialPanel,
  renderExportImage,
  renderLightDeltaLayer,
  renderLightShadowLayer,
  renderMaterialSlotPanel,
  reportExportFailure,
  resolveLightGroup,
  resolvePreviewScope,
  refreshScopeItems,
  refreshStepChecklist,
  refreshStudioUi,
  saveExportPreset,
  sceneRootNode,
  sceneStyle,
  selectElement,
  setExportBusy,
  setExportRoleVisibility,
  setShadowQualityHigh,
  showExportResult,
  showToast,
  syncCanvasSizeInputs,
  syncLightGroupList,
  syncLightGroupSelect,
  stateViewportAspectGetCanvasSize,
  threeCamera,
  threeRenderer,
  wallOpacityValue,
  wallWindowSpan,
  applyLightPropertyControls,
  backgroundThemeName,
  baseLightingSettings,
  deleteSelectionButton,
  doorFieldsElement,
  inspectorEmptyElement,
  isSelectionAllowed,
  itemDepthLabelElement,
  itemElevationFieldElement,
  itemFieldsElement,
  itemHeightFieldElement,
  itemHeightLabelElement,
  itemLightSourceVisibilityFieldElement,
  itemRotationActionsElement,
  itemRotationFieldElement,
  itemStripOrientationHeadingElement,
  itemStripRollFieldElement,
  itemVerticalRotationFieldElement,
  itemVerticalRotationLabelElement,
  itemWidthLabelElement,
  labelTextFieldsElement,
  lightFieldsElement,
  lightPreviewNoteElement,
  curtainPositionFieldElement,
  pillarAxisFieldElement,
  pillarShapeFieldElement,
  railingFieldsElement,
  roundTableTurntableFieldElement,
  selectedItems,
  selectionHeadingElement,
  selectionIdElement,
  selectionInspectorElement,
  shoeCabinetActionsElement,
  shoeCabinetMirrorButton,
  stairDirectionFieldElement,
  stripAxisFieldElement,
  tvMountStyleFieldElement,
  validateSelectionChange,
  windowFieldsElement,
  wallFieldsElement,
};
const sceneCacheDescriptor = createSceneCacheDescriptor(studioAppExtractHost);
const generateExportBundle = createGenerateExportBundle(studioAppExtractHost);
const refreshStudioUiInner = createRefreshStudioUiInner(studioAppExtractHost);
const applyToolSetting = createApplyToolSetting(studioAppExtractHost);
const { collectLightTargetInputs, syncLightTargetGroups, buildLightGroupList } =
  createLightPropertyList(studioAppExtractHost);
const drawDoor = createDrawDoor(studioAppExtractHost);

"""


def main() -> None:
    text = APP.read_text()
    if "createSceneCacheDescriptor" in text and "studioAppExtractHost" in text:
        print("Already patched")
        return

    marker = "} from './studio-app-build-interior-scene';"
    if marker not in text:
        raise SystemExit("import anchor missing")
    text = text.replace(marker, marker + IMPORTS, 1)

    if WIRE_ANCHOR not in text:
        raise SystemExit("wire anchor missing")
    text = text.replace(WIRE_ANCHOR, HOST_BLOCK + WIRE_ANCHOR, 1)

    lines = text.splitlines(keepends=True)
    # 1-based inclusive ranges to delete (single pass — ranges are for pre-patch file)
    ranges = [
        (16982, 17080),
        (16141, 16504),
        (11196, 11678),
        (5256, 5722),
        (4037, 4343),
        (1426, 1470),
        (458, 524),
    ]
    delete_lines: set[int] = set()
    for start, end in ranges:
        delete_lines.update(range(start, end + 1))
    lines = [line for index, line in enumerate(lines, start=1) if index not in delete_lines]

    APP.write_text("".join(lines))
    print(f"Patched studio-app.ts -> {len(lines)} lines")


if __name__ == "__main__":
    main()
