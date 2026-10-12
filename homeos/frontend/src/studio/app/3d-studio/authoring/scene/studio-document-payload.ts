/**
 * 楼层文档负载的**入库净化**：`normalizeStudioDocument`（整份文档 → 楼层数组 + 相机 / 灯光 / 导出预设）
 * 与 `createFloorRecord`（新建一条楼层记录）。
 *
 * 从 studio-app.ts 单体切出（P4）。只读输入、无闭包可变状态；两个外部依赖按参数显式传入 ——
 * `externalModelRegistry`（转交 `normalizeScenePayload`）与 `studioProject`（只读 `defaultFloorHeight`）。
 */

import { clamp as clamp2 } from "../../plan/geometry";
import { createStudioDocument, normalizeScenePayload } from "./studio-scene-payload";
import { finite as finite2, normalizeBaseLighting as normalizeBaseLighting2, normalizeCameraSettings as normalizeCameraSettings2, normalizeFixedCameraView as normalizeFixedCameraView2, normalizeLabelText as normalizeLabelText2 } from "../../loaders/studio-normalization";
import { floorDisplayName, generateId } from "../ui/studio-app-helpers";
import { normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2, normalizeExportPresetSlots as normalizeExportPresetSlots2 } from "../../export/export-presets";

/** 文档净化需要的外部状态：外部模型注册表 + 当前项目（只读默认层高）。 */
export interface StudioDocumentDeps {
  externalModelRegistry: any;
  studioProject: any;
}

export function createFloorRecord(
  deps: StudioDocumentDeps,
  floorElevationIndex = 0,
  documentSnapshot = createStudioDocument(),
) {
  const jd2 = normalizeScenePayload(documentSnapshot, deps.externalModelRegistry),
    floorHeightStep = clamp2(finite2(deps.studioProject?.defaultFloorHeight, 3), 1.8, 8);
  return {
    id: generateId("floor"),
    name: floorDisplayName(floorElevationIndex),
    elevation: floorElevationIndex * floorHeightStep,
    offsetX: 0,
    offsetZ: 0,
    rotation: 0,
    originX: jd2.background?.width ? jd2.background.width / 2 : 0,
    originY: jd2.background?.height ? jd2.background.height / 2 : 0,
    originInitialized: !!jd2.background,
    aligned: floorElevationIndex === 0,
    alignmentPending: floorElevationIndex > 0,
    scene: jd2,
  };
}

export function normalizeStudioDocument(rawDocument: any, deps: StudioDocumentDeps) {
  const floors2 = Array.isArray(rawDocument?.floors) ? rawDocument.floors : null,
    parsedFloors = floors2?.length
      ? floors2.map((rawFloor: any, rawFloorIndex: any) => {
          const jd3 = normalizeScenePayload(rawFloor?.scene, deps.externalModelRegistry),
            hasOriginInitialized = rawFloor?.originInitialized === true,
            normalizedFloorName = normalizeLabelText2(
              rawFloor?.name,
              floorDisplayName(rawFloorIndex),
              24,
            ),
            qd2 =
              normalizedFloorName === rawFloorIndex + 1 + "层"
                ? floorDisplayName(rawFloorIndex)
                : normalizedFloorName;
          return {
            id: String(rawFloor?.id || generateId("floor")),
            name: qd2,
            elevation: clamp2(finite2(rawFloor?.elevation, rawFloorIndex * 3), -30, 120),
            offsetX: clamp2(finite2(rawFloor?.offsetX, 0), -100, 100),
            offsetZ: clamp2(finite2(rawFloor?.offsetZ, 0), -100, 100),
            rotation: clamp2(finite2(rawFloor?.rotation, 0), -180, 180),
            originX: hasOriginInitialized
              ? finite2(rawFloor?.originX, 0)
              : jd3.background?.width
                ? jd3.background.width / 2
                : 0,
            originY: hasOriginInitialized
              ? finite2(rawFloor?.originY, 0)
              : jd3.background?.height
                ? jd3.background.height / 2
                : 0,
            originInitialized: hasOriginInitialized || !!jd3.background,
            aligned:
              rawFloorIndex === 0 ||
              rawFloor?.aligned === true ||
              Math.abs(finite2(rawFloor?.offsetX, 0)) > 0.000001 ||
              Math.abs(finite2(rawFloor?.offsetZ, 0)) > 0.000001,
            alignmentPending: rawFloor?.alignmentPending === true,
            scene: jd3,
          };
        })
      : [createFloorRecord(deps, 0, rawDocument)],
    requestedActiveFloorId = String(rawDocument?.activeFloorId || ""),
    activeFloorRecord =
      parsedFloors.find((matchedFloor: any) => matchedFloor.id === requestedActiveFloorId) ||
      parsedFloors[0],
    exportPresetSlots = normalizeExportPresetSlots2(rawDocument?.exportPresets);
  return {
    schemaVersion: 8,
    activeFloorId: activeFloorRecord.id,
    defaultFloorHeight: clamp2(finite2(rawDocument?.defaultFloorHeight, 3), 1.8, 8),
    previewFloorGap: clamp2(finite2(rawDocument?.previewFloorGap, 3), 0, 20),
    uniformOverviewStack: rawDocument?.uniformOverviewStack === true,
    exportFloorGap: clamp2(finite2(rawDocument?.exportFloorGap, 3), 0, 20),
    previewFloorMode: rawDocument?.previewFloorMode === "all" ? "all" : "active",
    combinedCameraSettings: normalizeCameraSettings2(rawDocument?.combinedCameraSettings),
    combinedFixedCameraView: normalizeFixedCameraView2(rawDocument?.combinedFixedCameraView),
    baseLighting: normalizeBaseLighting2(rawDocument?.baseLighting),
    exportPresets: exportPresetSlots,
    activeExportPresetSlot: normalizeActiveExportPresetSlot2(
      rawDocument?.activeExportPresetSlot,
      exportPresetSlots.length,
    ),
    floors: parsedFloors,
  };
}
