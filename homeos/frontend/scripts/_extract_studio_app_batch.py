#!/usr/bin/env python3
"""One-off batch extract large studio-app.ts clusters (Phase 2 split)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/studio/app/3d-studio/studio"
APP = ROOT / "studio-app.ts"


def main() -> None:
    lines = APP.read_text().splitlines(keepends=True)

    def slice_lines(start: int, end: int) -> str:
        return "".join(lines[start - 1 : end])

    def strip_function_wrapper(body: str) -> str:
        body = re.sub(r"^async function \w+\([^)]*\)\s*\{\n", "", body)
        body = re.sub(r"^function \w+\([^)]*\)\s*\{\n", "", body)
        body = re.sub(r"\n\}\s*$", "\n", body)
        return body

    def apply_host_prefix(body: str, symbols: list[str]) -> str:
        symbols = sorted(set(symbols), key=len, reverse=True)
        for sym in symbols:
            body = re.sub(rf"\b{re.escape(sym)}\b", f"host.{sym}", body)
        return body.replace("host.host.", "host.")

    def make_module(
        header: str,
        imports: str,
        iface: str,
        factory: str,
        fn_name: str,
        body: str,
        *,
        is_async: bool = False,
    ) -> str:
        async_kw = "async " if is_async else ""
        return (
            f"/**\n * {header}\n */\n"
            f"{imports}\n\n"
            f"export interface {iface} {{\n"
            f"  [key: string]: any;\n"
            f"}}\n\n"
            f"export function {factory}(host: {iface}) {{\n"
            f"  return {async_kw}function {fn_name}"
            f"{body}"
            f"}}\n"
        )

    extractions: list[tuple[str, str]] = []

    # sceneCacheDescriptor
    body = apply_host_prefix(
        strip_function_wrapper(slice_lines(458, 524)),
        [
            "getPreviewFloorMode",
            "studioProject",
            "getActiveFloor",
            "threeCamera",
            "sceneRootNode",
            "isEmbedStageMode",
            "sceneStyle",
            "baseLightingSettings",
            "wallOpacityValue",
            "backgroundSettings",
            "reflectionSettingsJson",
            "curtainStructureJson",
            "backgroundThemeName",
            "externalModelRegistry",
            "threeRenderer",
        ],
    )
    extractions.append(
        (
            "studio-app-scene-cache-descriptor.ts",
            make_module(
                "Render cache scene descriptor hash.",
                """import { isCourtyardDrawing as isCourtyardDrawing2 } from "../loaders/studio-normalization";
import {
  RENDER_CACHE_VERSION as RENDER_CACHE_VERSION2,
  cacheSceneDescriptor as cacheSceneDescriptor2,
  sha256 as sha2562,
  stableCacheJSON as stableCacheJSON2,
} from "../../bridge/scene/render-cache";""",
                "SceneCacheDescriptorHost",
                "createSceneCacheDescriptor",
                "sceneCacheDescriptor",
                body,
            ),
        )
    )

    # generateExportBundle
    body = apply_host_prefix(
        strip_function_wrapper(slice_lines(11196, 11678)),
        [
            "pendingRuntimeSettings",
            "isInteractionLocked",
            "saveExportPreset",
            "exportFolderNameInput",
            "exportStatusElement",
            "collectSelectedExportFiles",
            "stateViewportAspectGetCanvasSize",
            "captureOverviewCamera",
            "getOrderedFloorList",
            "makeUniqueFileName",
            "fetchStudioApi",
            "beginExportFlow",
            "reportExportFailure",
            "threeRenderer",
            "applyCameraState",
            "setShadowQualityHigh",
            "applyExportVisibility",
            "setExportRoleVisibility",
            "renderExportImage",
            "renderBackgroundLayer",
            "blobToBytes",
            "renderLightShadowLayer",
            "renderLightDeltaLayer",
            "getPreviewFloorMode",
            "studioProject",
            "floorElevationFor",
            "buildExportCamera",
            "projectLightGroupAnchor",
            "buildLightExportEntry",
            "projectItemAnchor",
            "captureStudioSnapshot",
            "captureUndoSnapshot",
            "isAutoDiagramEmbed",
            "autoDiagramComponentId",
            "showToast",
            "refreshStepChecklist",
            "showExportResult",
            "isExporting",
            "rebuildFloorLayers",
            "setExportBusy",
            "syncCanvasSizeInputs",
        ],
    )
    extractions.append(
        (
            "studio-app-export-bundle.ts",
            make_module(
                "NAS export ZIP bundle generation.",
                """import { finite as finite2 } from "../loaders/studio-normalization";
import {
  buildStoredZip as buildStoredZip2,
  EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2,
  EXPORT_IMAGE_MIME_TYPE as EXPORT_IMAGE_MIME_TYPE2,
  EXPORT_IMAGE_QUALITY as EXPORT_IMAGE_QUALITY2,
  EXPORT_RENDER_SCALE as EXPORT_RENDER_SCALE2,
  scaledExportResolution as scaledExportResolution2,
} from "../export/export-utils";
import { lampItemTypeSet } from "./studio-app-item-type-sets";
import { listLightGroupRows, listScreenRows, listChargingRows } from "./studio-app-inventory-rows";""",
                "ExportBundleHost",
                "createGenerateExportBundle",
                "generateExportBundle",
                body,
                is_async=True,
            ),
        )
    )

    # refreshStudioUiInner
    body = apply_host_prefix(
        strip_function_wrapper(slice_lines(5256, 5722)),
        [
            "getSelectedObject",
            "selectedItems",
            "selectedItem",
            "studioState",
            "planPainter",
            "selectElement",
            "inspectorEmptyElement",
            "selectionInspectorElement",
            "deleteSelectionButton",
            "lightPreviewNoteElement",
            "selectionHeadingElement",
            "wallFieldsElement",
            "windowFieldsElement",
            "doorFieldsElement",
            "railingFieldsElement",
            "itemFieldsElement",
            "selectionIdElement",
            "labelTextFieldsElement",
            "lightFieldsElement",
            "curtainPositionFieldElement",
            "itemHeightFieldElement",
            "itemElevationFieldElement",
            "itemRotationFieldElement",
            "itemRotationActionsElement",
            "itemVerticalRotationFieldElement",
            "itemStripRollFieldElement",
            "itemStripOrientationHeadingElement",
            "itemLightSourceVisibilityFieldElement",
            "pillarShapeFieldElement",
            "pillarAxisFieldElement",
            "stripAxisFieldElement",
            "roundTableTurntableFieldElement",
            "stairDirectionFieldElement",
            "tvMountStyleFieldElement",
            "shoeCabinetActionsElement",
            "shoeCabinetMirrorButton",
            "itemWidthLabelElement",
            "itemDepthLabelElement",
            "itemHeightLabelElement",
            "itemVerticalRotationLabelElement",
            "itemStripRollInput",
            "itemLightSourceVisibleInput",
            "applyLightPropertyControls",
            "renderDoorMaterialPanel",
            "renderMaterialSlotPanel",
            "getPixelsPerMeter",
            "resolveLightGroup",
            "getLightGroups",
            "syncLightGroupList",
            "syncLightGroupSelect",
            "activeLightGroupId",
        ],
    )
    extractions.append(
        (
            "studio-app-refresh-ui-inner.ts",
            make_module(
                "Inspector panel field sync for current selection.",
                """import { syncControlValue as syncControlValue2 } from "./ui-controls";
import { syncStudioSelect as syncStudioSelect2 } from "./studio-widgets";
import { isCourtyardGate as isCourtyardGate2, isCourtyardDrawing as isCourtyardDrawing2 } from "../loaders/studio-normalization";
import { clamp as clamp2, wallLengthMeters as wallLengthMeters2 } from "../plan/geometry";
import {
  finite as finite2,
  normalizeFullRotation as normalizeFullRotation2,
  itemMinimumFootprint as itemMinimumFootprint2,
  itemMinimumHeight as itemMinimumHeight2,
} from "../loaders/studio-normalization";
import { normalizeCurtainTrack as normalizeCurtainTrack2 } from "../loaders/studio-curtain-track";
import { airerDimensions as airerDimensions2 } from "./studio-airer";
import { fanDimensions as fanDimensions2 } from "./studio-fan";
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
  normalizeStripAxis as normalizeStripAxis2,
  pillarIsLying as pillarIsLying2,
} from "./studio-item-posture";
import { normalizeMuralArtStyle, normalizeFeatureWallStyle } from "../materials/studio-surface-textures";
import { lightPresetCatalog, lightAngleLimitForType } from "./studio-app-light-data";
import { normalizePlanLabelColor } from "./studio-app-plan-label";
import { itemTypeCatalog } from "./studio-app-scene-defaults";
import {
  lampItemTypeSet,
  openStairTypeSet,
  roundTableTypeSet,
  tvMountStyleSet,
} from "./studio-app-item-type-sets";
import { isTurntableRoundTable } from "./studio-app-helpers";
import type { StudioControlElement } from "./studio-app-types";""",
                "RefreshUiInnerHost",
                "createRefreshStudioUiInner",
                "refreshStudioUiInner",
                body,
            ),
        )
    )

    # applyToolSetting
    body = apply_host_prefix(
        strip_function_wrapper(slice_lines(16141, 16504)),
        [
            "getSelectedObject",
            "selectedItem",
            "isSelectionAllowed",
            "resolvePreviewScope",
            "captureUndoSnapshot",
            "selectElement",
            "studioState",
            "getPixelsPerMeter",
            "validateSelectionChange",
            "refreshStudioUi",
            "refreshScopeItems",
            "applyPlacementChange",
            "markDocumentDirty",
            "itemStripRollInput",
            "itemLightSourceVisibleInput",
            "getLightGroups",
            "planView",
        ],
    )
    extractions.append(
        (
            "studio-app-apply-tool-setting.ts",
            make_module(
                "Apply inspector inputs back to selected plan object.",
                """import { anchorGate as anchorGate2, syncCourtyardGates as syncCourtyardGates2 } from "../plan/courtyard-drawing";
import { clamp as clamp2, clampWindowT as clampWindowT2 } from "../plan/geometry";
import {
  finite as finite2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
  itemMinimumFootprint as itemMinimumFootprint2,
  itemMinimumHeight as itemMinimumHeight2,
} from "../loaders/studio-normalization";
import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from "../loaders/studio-curtain-track";
import { airerDimensions as airerDimensions2 } from "./studio-airer";
import { fanDimensions as fanDimensions2 } from "./studio-fan";
import {
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
  normalizeStripAxis as normalizeStripAxis2,
} from "./studio-item-posture";
import { normalizeMuralArtStyle, normalizeFeatureWallStyle } from "../materials/studio-surface-textures";
import { lightPresetCatalog, lightAngleLimitForType } from "./studio-app-light-data";
import { normalizePlanLabelColor } from "./studio-app-plan-label";
import { doorTypeCatalog, itemTypeCatalog } from "./studio-app-scene-defaults";
import {
  lampItemTypeSet,
  openStairTypeSet,
  roundTableTypeSet,
  tvMountStyleSet,
  sofaMinDimensions,
} from "./studio-app-item-type-sets";
import type { StudioControlElement } from "./studio-app-types";""",
                "ApplyToolSettingHost",
                "createApplyToolSetting",
                "applyToolSetting",
                body,
            ),
        )
    )

    # light property list
    light_block = apply_host_prefix(
        slice_lines(16982, 17080),
        [
            "lightPropertyTargetListElement",
            "lightPropertySelectionCountElement",
            "lightPropertyToggleAllButton",
            "studioState",
            "selectedItem",
        ],
    )
    light_module = f"""/**
 * Light property bulk-apply target list UI.
 */
import {{ lampItemTypeSet }} from "./studio-app-item-type-sets";
import {{ itemTypeCatalog }} from "./studio-app-scene-defaults";
import {{
  normalizeLightPropertyValue,
  formatLightPropertyValue,
}} from "./studio-app-light-data";

export interface LightPropertyListHost {{
  [key: string]: any;
}}

export function createLightPropertyList(host: LightPropertyListHost) {{
{light_block}
  return {{ collectLightTargetInputs, syncLightTargetGroups, buildLightGroupList }};
}}
"""
    extractions.append(("studio-app-light-property-list.ts", light_module))

    # drawDoor
    body = apply_host_prefix(
        strip_function_wrapper(slice_lines(4037, 4343)),
        [
            "wallWindowSpan",
            "createSelectionRef",
            "doorPlanColor",
            "getPixelsPerMeter",
            "planView",
            "drawGuideSegment",
            "drawLabelText",
            "drawPointMarker",
            "planToScreen",
            "planCanvasRenderer",
        ],
    )
    extractions.append(
        (
            "studio-app-draw-door.ts",
            make_module(
                "Plan canvas door opening graphics.",
                """import { distance as distance2, slidingDoorPanelCenters as slidingDoorPanelCenters2 } from "../plan/geometry";
import type { PlanEditPreviewFlags } from "./studio-app-types";""",
                "DrawDoorHost",
                "createDrawDoor",
                "drawDoor",
                body,
            ),
        )
    )

    for fname, content in extractions:
        path = ROOT / fname
        path.write_text(content)
        print(f"Wrote {fname}: {len(content.splitlines())} lines")


if __name__ == "__main__":
    main()
