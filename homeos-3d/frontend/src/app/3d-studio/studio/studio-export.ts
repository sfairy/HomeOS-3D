/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  collectCheckedExportFileKeys,
  exportDialogElement,
  exportFolderNameInput,
  measureVisibleHeight,
  renderExportPresetSlots,
  saveActiveExportPreset
} from "./studio-camera-presets.js";
import {
  autoDiagramComponentId,
  collectCars,
  collectLightGroups,
  collectTelevisions,
  exportPackageButton,
  exportStatusElement,
  previewFloors,
  refreshExportPreview,
  sanitizeFileName
} from "./studio-export-dialogs.js";
import { exportDimensions } from "./studio-render-quality.js";
import {
  EXPORT_IMAGE_EXTENSION,
  EXPORT_IMAGE_MIME_TYPE,
  EXPORT_IMAGE_QUALITY,
  EXPORT_RENDER_SCALE,
  buildLightDeltaPixels,
  buildStoredZip,
  scaledExportResolution
} from "../export/export-utils.js";
import {
  applyCameraSnapshot,
  captureCameraSnapshot
} from "./studio-camera-snapshot.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import {
  cloneStudioDocument,
  requestStudioApi,
  showToast,
  updateOnboardingSteps
} from "./studio-document-save.js";
import { setHighShadowQuality } from "./studio-base-lighting.js";
import {
  buildExportedLight,
  canvasToBlob,
  captureStageImage,
  composeBackgroundBlob,
  compositeLightGroupShadows,
  floorExportOffset
} from "./studio-export-pipeline.js";
import {
  currentPreviewFloorMode,
  selectElement
} from "./studio-plan-render.js";
import { finite } from "../loaders/studio-normalization.js";
import { projectAnchorToFloorPlan } from "./studio-floor-switch.js";
import { cloneSceneForHistory } from "./studio-camera-mode.js";
import {
  invalidateRender,
  isAutoDiagramEmbed,
  refreshPreviewScene
} from "./studio-render-pipeline.js";
import { debugLog } from "../../utils/debug-log.js";
import { syncCameraViewControls } from "./studio-control-sync.js";

export const exportOverwriteDialogElement = selectElement("#export-overwrite-dialog");

export const exportOverwriteNameElement = selectElement("#export-overwrite-name");

export const exportCompleteDialogElement = selectElement("#export-complete-dialog");

export const exportCompleteTitleElement = selectElement("#export-complete-title");

export const exportCompleteMessageElement = selectElement("#export-complete-message");

export const exportCompletePathElement = selectElement("#export-complete-path");

/**
 * 切换导出忙碌态：禁用对话框内除「关闭」与「导出」之外的控件，并显示忙碌提示。
 */
export function setExportBusy(busyState: any) {
  state.isExportBusy = busyState;
  const busyNoticeElement = selectElement("#export-busy-notice");
  if (busyNoticeElement) {
    busyNoticeElement.hidden = !busyState;
  }
  exportPackageButton.disabled = busyState;
  selectElement("#export-close").disabled = busyState;
  for (const exportDialogControl of exportDialogElement.querySelectorAll("input, button")) {
    if (exportDialogControl.id !== "export-close" && exportDialogControl.id !== "export-package") {
      exportDialogControl.disabled = busyState;
    }
  }
  if (!busyState) {
    syncCameraViewControls();
    renderExportPresetSlots();
  }
  state.orbitControls.enabled = !busyState;
}

/**
 * 合成电视画面层：把「点亮电视后」的画面减去「未点亮」的基准画面，得到透明的画面增量层，
 */
export async function composeTelevisionLayerBlob(basePixelFrame: any, litPixelFrame: any) {
  const televisionLayerCanvas = document.createElement("canvas");
  televisionLayerCanvas.width = basePixelFrame.width;
  televisionLayerCanvas.height = basePixelFrame.height;
  const televisionLayerContext = televisionLayerCanvas.getContext("2d");
  if (!televisionLayerContext) {
    throw new Error("当前浏览器无法创建透明灯光层。");
  }
  const televisionDeltaPixels = buildLightDeltaPixels(basePixelFrame.data, litPixelFrame.data);
  televisionLayerContext.putImageData(
    new ImageData(televisionDeltaPixels as any, basePixelFrame.width, basePixelFrame.height),
    0,
    0
  );
  return canvasToBlob(televisionLayerCanvas);
}

/**
 * @returns {string} 可用的文件名。
 */
export function reserveExportFileName(
  nameSource: any,
  fileOrdinal: any,
  usedFileNameSet: any,
  fileExtension = EXPORT_IMAGE_EXTENSION
) {
  const sanitizedBaseName = sanitizeFileName(nameSource, "灯组-" + (fileOrdinal + 1));
  const normalizedExtension = String(fileExtension).replace(/^\./, "");
  let fileNameSuffix = 1;
  let candidateFileName = sanitizedBaseName + "." + normalizedExtension;
  while (usedFileNameSet.has(candidateFileName.toLocaleLowerCase())) {
    fileNameSuffix += 1;
    candidateFileName = sanitizedBaseName + "-" + fileNameSuffix + "." + normalizedExtension;
  }
  usedFileNameSet.add(candidateFileName.toLocaleLowerCase());
  return candidateFileName;
}

/**
 * 拍下当前相机状态（模式、位置、目标、视口宽高比、可见高度、fov）供导出使用。
 * @returns {object} 相机状态快照；正交模式下 fov 记为 null。
 */
export function buildExportCameraState(aspectViewportWidth: any, aspectViewportHeight: any) {
  const orbitControlTarget = state.orbitControls.target;
  return {
    mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    position: {
      x: state.previewCamera.position.x,
      y: state.previewCamera.position.y,
      z: state.previewCamera.position.z
    },
    target: {
      x: orbitControlTarget.x,
      y: orbitControlTarget.y,
      z: orbitControlTarget.z
    },
    aspect: aspectViewportWidth / aspectViewportHeight,
    visibleHeight: measureVisibleHeight(state.previewCamera, orbitControlTarget),
    fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : null
  };
}

/**
 * 在一组灯光里找出第一个能投影进画面的锚点，用于导出时自动取景构图；全部不可见时返回 null。
 * @returns {{x: number, y: number}|null} 首个可见锚点。
 */
export function findLightAnchor(
  anchorLightItems: any,
  anchorFloorEntry: any,
  previewFloorCandidates = previewFloors()
) {
  for (const anchorLightItem of anchorLightItems || []) {
    const resolvedAnchorPoint = projectAnchorToFloorPlan(
      anchorLightItem,
      anchorFloorEntry,
      previewFloorCandidates
    );
    if (resolvedAnchorPoint) {
      return resolvedAnchorPoint;
    }
  }
  return null;
}

/**
 * 把 File / Blob 读成 Uint8Array，便于交给后端或做哈希计算。
 * @returns {Promise<Uint8Array>} 文件的原始字节。
 */
export async function readFileBytes(fileSource: any) {
  return new Uint8Array(await fileSource.arrayBuffer());
}

export function isolateExportVisibility(
  groupKeyFilter = "",
  televisionKeyFilter = "",
  vehicleKeyFilter = ""
) {
  for (const { key: isolatedGroupKey, group: isolatedGroupController } of collectLightGroups()) {
    isolatedGroupController.enabled = groupKeyFilter === "*" || isolatedGroupKey === groupKeyFilter;
  }
  for (const { key: isolatedTvKey, item: isolatedTvController } of collectTelevisions()) {
    isolatedTvController.screenEnabled =
      televisionKeyFilter === "*" || isolatedTvKey === televisionKeyFilter;
  }
  for (const { key: isolatedCarKey, item: isolatedCarController } of collectCars()) {
    isolatedCarController.chargingEnabled =
      vehicleKeyFilter === "*" || isolatedCarKey === vehicleKeyFilter;
  }
  refreshPreviewScene();
}

export function setExportRoleVisibility(exportRole: any, roleVisibility: any) {
  if (state.previewModelRoot) {
    state.previewModelRoot.traverse((roleTargetObject: any) => {
      if (roleTargetObject.userData?.exportRole === exportRole) {
        roleTargetObject.visible = roleVisibility;
      }
    });
    invalidateRender({
      shadows: exportRole === "plan"
    });
  }
}

/**
 * 结束「同名文件夹是否覆盖」的询问：关闭对话框并把用户选择交回等待中的 Promise。用可选调用触发 resolver，
 * @param {string} [chosenAction="cancel"] "overwrite" 或 "cancel"。
 */
export function settleOverwriteChoice(chosenAction = "cancel") {
  const pendingOverwriteResolver = state.overwriteConfirmResolve;
  state.overwriteConfirmResolve = null;
  if (exportOverwriteDialogElement.open) {
    exportOverwriteDialogElement.close();
  }
  pendingOverwriteResolver?.(chosenAction);
}

export function showEmbeddedOverwriteDialog(hostWindow: any, displayFolderName: any) {
  const hostDocument = hostWindow.document;
  const embeddedOverwriteDialog = hostDocument.createElement("dialog");
  embeddedOverwriteDialog.className = "settings-dialog floorplan-auto-diagram-dialog";
  embeddedOverwriteDialog.setAttribute("aria-label", "同名导图已经存在");
  embeddedOverwriteDialog.innerHTML =
    '<div class="dialog-heading"><div><span>EXPORT EXISTS</span><h2>同名导图已经存在</h2></div></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p>文件夹“<strong data-export-folder></strong>”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。</p>\n      <div class="dialog-actions"><button type="button" data-export-choice="cancel">不覆盖</button><button type="button" class="primary" data-export-choice="overwrite">覆盖更新</button></div>\n    </div>';
  embeddedOverwriteDialog.querySelector("[data-export-folder]").textContent = displayFolderName;
  return new Promise((approveOverwrite, rejectOverwriteChoice) => {
    let hasSettledChoice = false;
    /**
     * 内嵌对话框的内部结算函数：只允许结算一次，并负责摘除监听、关闭并移除 DOM。
     * @param {string} settleValue "overwrite" 或 "cancel"。
     */
    const settleChoice = (settleValue: any) => {
      if (!hasSettledChoice) {
        hasSettledChoice = true;
        window.removeEventListener("pagehide", cancelChoice);
        hostWindow.removeEventListener("pagehide", cancelChoice);
        if (embeddedOverwriteDialog.open) {
          embeddedOverwriteDialog.close();
        }
        embeddedOverwriteDialog.remove();
        approveOverwrite(settleValue);
      }
    };
    /**
     * 内嵌对话框「不覆盖」的快捷入口，供 Esc、close 事件与 pagehide 兜底共用。
     * @returns {void}
     */
    const cancelChoice = () => settleChoice("cancel");
    embeddedOverwriteDialog.addEventListener("cancel", (cancelEvent: any) => {
      cancelEvent.preventDefault();
      cancelChoice();
    });
    embeddedOverwriteDialog.addEventListener("close", cancelChoice);
    for (const choiceButton of embeddedOverwriteDialog.querySelectorAll("[data-export-choice]")) {
      choiceButton.addEventListener("click", () => settleChoice(choiceButton.dataset.exportChoice));
    }
    window.addEventListener("pagehide", cancelChoice);
    hostWindow.addEventListener("pagehide", cancelChoice);
    try {
      hostDocument.body.append(embeddedOverwriteDialog);
      embeddedOverwriteDialog.showModal();
      embeddedOverwriteDialog.querySelector('[data-export-choice="cancel"]').focus();
    } catch (dialogMountError) {
      window.removeEventListener("pagehide", cancelChoice);
      hostWindow.removeEventListener("pagehide", cancelChoice);
      embeddedOverwriteDialog.remove();
      rejectOverwriteChoice(dialogMountError);
    }
  });
}

/**
 * 询问用户是否覆盖已存在的同名导出文件夹。内嵌场景走父窗口自绘对话框；独立页面用页面内的 <dialog>，结果通过模块级
 */
export function requestOverwriteDecision(overwriteFolderName: any) {
  if (state.overwriteConfirmResolve) {
    settleOverwriteChoice("cancel");
  }
  if (isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window) {
    return showEmbeddedOverwriteDialog(window.parent, overwriteFolderName);
  } else {
    exportOverwriteNameElement.textContent = overwriteFolderName;
    exportOverwriteDialogElement.showModal();
    return new Promise(overwriteDecisionResolver => {
      state.overwriteConfirmResolve = overwriteDecisionResolver;
    });
  }
}

export function notifyExportStopped(stopCode: any, stopMessage: any) {
  if (!!isAutoDiagramEmbed && !!autoDiagramComponentId && window.parent !== window) {
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-stopped",
        componentId: autoDiagramComponentId,
        reason: stopCode,
        message: stopMessage
      },
      window.location.origin
    );
  }
}

/**
 * 弹出导出完成对话框，按「新建 / 覆盖」分别给出提示语与产物路径。
 * @param {object} exportOutcome 导出结果，含 overwritten 与 relativePath。
 */
export function showExportCompleteDialog(exportOutcome: any) {
  const isOverwriteResult = exportOutcome?.overwritten === true;
  exportCompleteTitleElement.textContent = isOverwriteResult ? "导图覆盖完成" : "导图保存完成";
  exportCompleteMessageElement.textContent = isOverwriteResult
    ? "新导图已经安全替换原文件夹，已有仪表盘中的同名图片会自动更新。"
    : "导出的图片和数据已经保存到 NAS，可以在编辑器素材中继续使用。";
  exportCompletePathElement.textContent = "data/" + (exportOutcome?.relativePath || "exports");
  if (!exportCompleteDialogElement.open) {
    exportCompleteDialogElement.showModal();
  }
}

export async function runStudioExport() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  const exportTargetFolderName = exportFolderNameInput.value.trim();
  if (
    !exportTargetFolderName ||
    /[<>:\"/\\|?*\x00-\x1f\x7f]/.test(exportTargetFolderName) ||
    exportTargetFolderName.startsWith(".") ||
    /[. ]$/.test(exportTargetFolderName)
  ) {
    exportFolderNameInput.classList.add("invalid");
    exportFolderNameInput.focus();
    exportStatusElement.textContent = "请输入有效的文件夹名";
    return;
  }
  exportFolderNameInput.classList.remove("invalid");
  const checkedExportFileKeys = collectCheckedExportFileKeys();
  if (!checkedExportFileKeys.size) {
    exportStatusElement.textContent = "请至少勾选一项图片";
    return;
  }
  const sourceExportDimensions = exportDimensions();
  const { width: renderWidthPx, height: renderHeightPx } = scaledExportResolution(
    sourceExportDimensions.width,
    sourceExportDimensions.height,
    EXPORT_RENDER_SCALE
  );
  const savedCameraSnapshot = captureCameraSnapshot();
  const defaultExportFileNames = {
    background: "00底图." + EXPORT_IMAGE_EXTENSION,
    backgroundWithPlan: "00底图带户型." + EXPORT_IMAGE_EXTENSION,
    floorPlan: "00户型图." + EXPORT_IMAGE_EXTENSION
  };
  const reservedExportFileNames = new Set(
    Object.values(defaultExportFileNames).map(defaultExportFileName =>
      defaultExportFileName.toLocaleLowerCase()
    )
  );
  const exportFloorEntries = previewFloors();
  const lightGroupExportList = collectLightGroups(exportFloorEntries)
    .map(
      ({
        floor: lightGroupFloorEntry,
        group: groupEntry,
        index: groupOrdinal,
        key: groupExportKey
      }: any) => ({
        id: groupExportKey,
        groupId: groupEntry.id,
        floor: lightGroupFloorEntry,
        name:
          exportFloorEntries.length > 1
            ? lightGroupFloorEntry.name + "-" + groupEntry.name
            : groupEntry.name,
        enabledInEditor: state.exportRenderState.groupStates.get(groupExportKey) !== false,
        file: reserveExportFileName(
          exportFloorEntries.length > 1
            ? lightGroupFloorEntry.name + "-" + groupEntry.name
            : groupEntry.name,
          groupOrdinal,
          reservedExportFileNames
        ),
        lights: lightGroupFloorEntry.scene.items.filter(
          (floorSceneItem: any) =>
            LIGHT_ITEM_TYPES.has(floorSceneItem.type) &&
            floorSceneItem.lightGroupId === groupEntry.id
        )
      })
    )
    .filter((groupExportRow: any) => checkedExportFileKeys.has("group:" + groupExportRow.id));
  const televisionExportList = collectTelevisions(exportFloorEntries).map(
    ({ floor: tvExportFloor, item: tvExportItem, index: tvExportOrdinal, key: tvExportKey }: any) => ({
      id: "screen-" + tvExportKey,
      key: tvExportKey,
      floorId: tvExportFloor.id,
      itemId: tvExportItem.id,
      name:
        "" +
        (exportFloorEntries.length > 1 ? tvExportFloor.name + "-" : "") +
        (tvExportItem.screenLayerName || "电视画面 " + (tvExportOrdinal + 1)),
      enabledInEditor: state.exportRenderState.tvStates.get(tvExportKey) !== false,
      floor: tvExportFloor,
      item: tvExportItem,
      file: null
    })
  );
  const vehicleExportList = collectCars(exportFloorEntries).map(
    ({
      floor: vehicleExportFloor,
      item: vehicleExportItem,
      index: vehicleExportOrdinal,
      key: vehicleExportKey
    }: any) => ({
      id: "vehicle-" + vehicleExportKey,
      key: vehicleExportKey,
      floorId: vehicleExportFloor.id,
      itemId: vehicleExportItem.id,
      name:
        "" +
        (exportFloorEntries.length > 1 ? vehicleExportFloor.name + "-" : "") +
        (vehicleExportItem.chargingLayerName || "汽车充电 " + (vehicleExportOrdinal + 1)),
      chargingInEditor: state.exportRenderState.carChargingStates.get(vehicleExportKey) === true,
      floor: vehicleExportFloor,
      item: vehicleExportItem,
      file: null
    })
  );
  for (
    let tvFileAssignIndex = 0;
    tvFileAssignIndex < televisionExportList.length;
    tvFileAssignIndex += 1
  ) {
    const tvExportRow = televisionExportList[tvFileAssignIndex];
    tvExportRow.file = reserveExportFileName(
      tvExportRow.name,
      tvFileAssignIndex,
      reservedExportFileNames
    );
  }
  for (
    let vehicleFileAssignIndex = 0;
    vehicleFileAssignIndex < vehicleExportList.length;
    vehicleFileAssignIndex += 1
  ) {
    const vehicleExportRow = vehicleExportList[vehicleFileAssignIndex];
    vehicleExportRow.file = reserveExportFileName(
      vehicleExportRow.name,
      vehicleFileAssignIndex,
      reservedExportFileNames
    );
  }
  const checkedTelevisionExports = televisionExportList.filter((tvFilterRow: any) =>
    checkedExportFileKeys.has("screen:" + tvFilterRow.key)
  );
  const checkedVehicleExports = vehicleExportList.filter((vehicleFilterRow: any) =>
    checkedExportFileKeys.has("vehicle:" + vehicleFilterRow.key)
  );
  const needsCombinedRender =
    checkedExportFileKeys.has("backgroundWithPlan") ||
    checkedExportFileKeys.has("floorPlan") ||
    checkedTelevisionExports.length > 0 ||
    checkedVehicleExports.length > 0 ||
    lightGroupExportList.length > 0;
  let isOverwriteConfirmed = false;
  setExportBusy(true);
  try {
    exportStatusElement.textContent = "正在检查文件夹名…";
    if (
      (
        await requestStudioApi("/studio3d/exports/check", {
          headers: {
            "X-Export-Folder": encodeURIComponent(exportTargetFolderName)
          }
        })
      )?.exists
    ) {
      exportStatusElement.textContent = "同名导图“" + exportTargetFolderName + "”已经存在";
      const overwriteDecision = await requestOverwriteDecision(exportTargetFolderName);
      if (overwriteDecision === "rename") {
        exportStatusElement.textContent = "请修改文件夹名后重新保存";
        window.setTimeout(() => {
          exportFolderNameInput.focus();
          exportFolderNameInput.select();
        }, 0);
        notifyExportStopped("rename", "请在属性中修改文件夹名称后重新生成。");
        return;
      }
      if (overwriteDecision !== "overwrite") {
        exportStatusElement.textContent = "已取消覆盖，原导图保持不变";
        notifyExportStopped("cancel", "已取消覆盖，原导图保持不变。");
        return;
      }
      isOverwriteConfirmed = true;
    }
    state.renderer.setPixelRatio(1);
    state.renderer.setSize(renderWidthPx, renderHeightPx, false);
    applyCameraSnapshot(savedCameraSnapshot, renderWidthPx / renderHeightPx);
    setHighShadowQuality(true);
    exportStatusElement.textContent = "正在生成精细阴影导出图层…";
    isolateExportVisibility();
    let backgroundOnlyCapture = null;
    let combinedCapture: any = null;
    if (checkedExportFileKeys.has("background")) {
      setExportRoleVisibility("plan", false);
      setExportRoleVisibility("label", false);
      setExportRoleVisibility("outline", false);
      backgroundOnlyCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      setExportRoleVisibility("plan", true);
      setExportRoleVisibility("label", true);
      setExportRoleVisibility("outline", true);
    }
    if (needsCombinedRender) {
      combinedCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
    }
    const exportFileEntries = [];
    if (backgroundOnlyCapture) {
      const backgroundBlob = await composeBackgroundBlob(
        renderWidthPx,
        renderHeightPx,
        backgroundOnlyCapture.imageData
      );
      exportFileEntries.push({
        name: defaultExportFileNames.background,
        data: await readFileBytes(backgroundBlob)
      });
    }
    if (checkedExportFileKeys.has("backgroundWithPlan")) {
      const combinedBlob = await composeBackgroundBlob(
        renderWidthPx,
        renderHeightPx,
        combinedCapture.imageData
      );
      exportFileEntries.push({
        name: defaultExportFileNames.backgroundWithPlan,
        data: await readFileBytes(combinedBlob)
      });
    }
    if (checkedExportFileKeys.has("floorPlan")) {
      setExportRoleVisibility("background", false);
      setExportRoleVisibility("grid", false);
      const floorPlanCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        blob: true
      });
      setExportRoleVisibility("background", true);
      setExportRoleVisibility("grid", true);
      exportFileEntries.push({
        name: defaultExportFileNames.floorPlan,
        data: await readFileBytes(floorPlanCapture.blob)
      });
    }
    for (
      let groupRenderIndex = 0;
      groupRenderIndex < lightGroupExportList.length;
      groupRenderIndex += 1
    ) {
      const groupExportRowEntry = lightGroupExportList[groupRenderIndex];
      const groupBlob = await compositeLightGroupShadows(
        combinedCapture.imageData,
        groupExportRowEntry,
        renderWidthPx,
        renderHeightPx,
        groupRenderIndex,
        lightGroupExportList.length
      );
      exportFileEntries.push({
        name: groupExportRowEntry.file,
        data: await readFileBytes(groupBlob)
      });
    }
    for (
      let tvRenderIndex = 0;
      tvRenderIndex < checkedTelevisionExports.length;
      tvRenderIndex += 1
    ) {
      const tvExportRowItem = checkedTelevisionExports[tvRenderIndex];
      exportStatusElement.textContent =
        "正在生成电视图层 " +
        (tvRenderIndex + 1) +
        "/" +
        checkedTelevisionExports.length +
        "：" +
        tvExportRowItem.name;
      isolateExportVisibility("", tvExportRowItem.key);
      const tvCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      const tvLayerBlob = await composeTelevisionLayerBlob(
        combinedCapture.imageData,
        tvCapture.imageData
      );
      exportFileEntries.push({
        name: tvExportRowItem.file,
        data: await readFileBytes(tvLayerBlob)
      });
    }
    for (
      let vehicleRenderIndex = 0;
      vehicleRenderIndex < checkedVehicleExports.length;
      vehicleRenderIndex += 1
    ) {
      const vehicleExportRowItem = checkedVehicleExports[vehicleRenderIndex];
      exportStatusElement.textContent =
        "正在生成汽车图层 " +
        (vehicleRenderIndex + 1) +
        "/" +
        checkedVehicleExports.length +
        "：" +
        vehicleExportRowItem.name;
      isolateExportVisibility("", "", vehicleExportRowItem.key);
      const vehicleCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      const vehicleLayerBlob = await composeTelevisionLayerBlob(
        combinedCapture.imageData,
        vehicleCapture.imageData
      );
      exportFileEntries.push({
        name: vehicleExportRowItem.file,
        data: await readFileBytes(vehicleLayerBlob)
      });
    }
    const exportManifest = {
      schemaVersion: 3,
      exportName: exportTargetFolderName,
      floorMode: currentPreviewFloorMode(),
      floorPresentationGap:
        currentPreviewFloorMode() === "all" ? finite(state.studioDocument.exportFloorGap, 3) : 0,
      floors: exportFloorEntries.map((manifestFloor: any) => ({
        id: manifestFloor.id,
        name: manifestFloor.name,
        elevation: floorExportOffset(manifestFloor),
        offsetX: manifestFloor.offsetX,
        offsetZ: manifestFloor.offsetZ,
        rotation: manifestFloor.rotation
      })),
      generatedAt: new Date().toISOString(),
      resolution: {
        width: renderWidthPx,
        height: renderHeightPx
      },
      sourceResolution: sourceExportDimensions,
      renderScale: EXPORT_RENDER_SCALE,
      imageFormat: {
        extension: EXPORT_IMAGE_EXTENSION,
        mimeType: EXPORT_IMAGE_MIME_TYPE,
        quality: EXPORT_IMAGE_QUALITY
      },
      camera: buildExportCameraState(renderWidthPx, renderHeightPx),
      backgroundImage: checkedExportFileKeys.has("background")
        ? defaultExportFileNames.background
        : null,
      baseImage: checkedExportFileKeys.has("backgroundWithPlan")
        ? defaultExportFileNames.backgroundWithPlan
        : null,
      floorPlanImage: checkedExportFileKeys.has("floorPlan")
        ? defaultExportFileNames.floorPlan
        : null,
      televisionOnImage:
        checkedTelevisionExports.length === 1 ? checkedTelevisionExports[0].file : null,
      televisionOnImages: checkedTelevisionExports.map((tvFileName: any) => tvFileName.file),
      vehicleChargingImage:
        checkedVehicleExports.length === 1 ? checkedVehicleExports[0].file : null,
      vehicleChargingImages: checkedVehicleExports.map((vehicleFileName: any) => vehicleFileName.file),
      exportedFiles: exportFileEntries.map(exportedFileEntry => exportedFileEntry.name),
      groups: lightGroupExportList.map((manifestGroup: any) => ({
        id: manifestGroup.id,
        groupId: manifestGroup.groupId,
        floorId: manifestGroup.floor.id,
        name: manifestGroup.name,
        file: manifestGroup.file,
        anchor: findLightAnchor(manifestGroup.lights, manifestGroup.floor, exportFloorEntries),
        enabledInEditor: manifestGroup.enabledInEditor,
        lights: manifestGroup.lights.map((manifestGroupLight: any) =>
          buildExportedLight(manifestGroupLight, manifestGroup.floor)
        )
      })),
      screens: televisionExportList.map(
        ({
          key: manifestTvKey,
          floor: manifestTvFloor,
          item: manifestTvItem,
          ...manifestTvRest
        }: any) => ({
          ...manifestTvRest,
          anchor: projectAnchorToFloorPlan(manifestTvItem, manifestTvFloor, exportFloorEntries),
          file: checkedExportFileKeys.has("screen:" + manifestTvKey) ? manifestTvRest.file : null
        })
      ),
      vehicles: vehicleExportList.map(
        ({
          key: manifestVehicleKey,
          floor: manifestVehicleFloor,
          item: manifestVehicleItem,
          ...manifestVehicleRest
        }: any) => ({
          ...manifestVehicleRest,
          anchor: projectAnchorToFloorPlan(
            manifestVehicleItem,
            manifestVehicleFloor,
            exportFloorEntries
          ),
          file: checkedExportFileKeys.has("vehicle:" + manifestVehicleKey)
            ? manifestVehicleRest.file
            : null
        })
      )
    };
    if (checkedExportFileKeys.has("dataLights")) {
      exportFileEntries.push({
        name: "lights.json",
        data: new TextEncoder().encode(JSON.stringify(exportManifest, null, 2) + "\n")
      });
    }
    if (checkedExportFileKeys.has("dataScene")) {
      const sceneSnapshot =
        currentPreviewFloorMode() === "all" ? cloneStudioDocument() : cloneSceneForHistory();
      exportFileEntries.push({
        name: "scene.json",
        data: new TextEncoder().encode(JSON.stringify(sceneSnapshot, null, 2) + "\n")
      });
    }
    exportStatusElement.textContent = "正在打包 ZIP…";
    const zipBlob = buildStoredZip(exportFileEntries);
    exportStatusElement.textContent = "正在保存到 NAS data…";
    const exportPackageBlob = new Blob([zipBlob as any], {
      type: "application/zip"
    });
    const uploadExportPackage = (allowOverwrite = false) =>
      requestStudioApi("/studio3d/exports", {
        method: "POST",
        body: exportPackageBlob,
        headers: {
          "Content-Type": "application/zip",
          "X-Export-Folder": encodeURIComponent(exportTargetFolderName),
          ...(allowOverwrite
            ? {
                "X-Export-Overwrite": "true"
              }
            : {})
        }
      });
    let exportUploadResponse;
    try {
      exportUploadResponse = await uploadExportPackage(isOverwriteConfirmed);
    } catch (exportUploadError: any) {
      if (
        exportUploadError?.status !== 409 ||
        exportUploadError?.payload?.detail?.code !== "STUDIO3D_EXPORT_EXISTS"
      ) {
        throw exportUploadError;
      }
      exportStatusElement.textContent = "同名导图“" + exportTargetFolderName + "”已经存在";
      const retryDecision = await requestOverwriteDecision(exportTargetFolderName);
      if (retryDecision === "rename") {
        exportStatusElement.textContent = "请修改文件夹名后重新保存";
        window.setTimeout(() => {
          exportFolderNameInput.focus();
          exportFolderNameInput.select();
        }, 0);
        notifyExportStopped("rename", "请在属性中修改文件夹名称后重新生成。");
        return;
      }
      if (retryDecision !== "overwrite") {
        exportStatusElement.textContent = "已取消覆盖，原导图保持不变";
        notifyExportStopped("cancel", "已取消覆盖，原导图保持不变。");
        return;
      }
      exportStatusElement.textContent = "正在安全覆盖原导图…";
      exportUploadResponse = await uploadExportPackage(true);
    }
    exportStatusElement.textContent = "已保存到 data/" + exportUploadResponse.relativePath;
    showToast("导图已保存到 data/" + exportUploadResponse.relativePath, "success");
    const embeddingHostWindow = isAutoDiagramEmbed ? window.parent : window.opener;
    if (
      autoDiagramComponentId &&
      embeddingHostWindow &&
      (isAutoDiagramEmbed || !embeddingHostWindow.closed)
    ) {
      embeddingHostWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-export",
          componentId: autoDiagramComponentId,
          folderName: exportTargetFolderName,
          manifest: exportManifest
        },
        window.location.origin
      );
    }
    state.isExportComplete = true;
    updateOnboardingSteps();
    showExportCompleteDialog(exportUploadResponse);
  } catch (exportError: any) {
    window.HABridgeLog?.error?.(exportError, {
      phase: "studio-export",
      componentId: autoDiagramComponentId || ""
    });
    debugLog("error", exportError);
    exportStatusElement.textContent = exportError?.message || "导出失败，请重试。";
    showToast(exportError?.message || "导图失败。", "error");
    if (isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-error",
          componentId: autoDiagramComponentId,
          message: exportError?.message || "后台生成失败，请重试。"
        },
        window.location.origin
      );
    }
  } finally {
    setHighShadowQuality(false);
    for (const {
      key: restoreGroupStateKey,
      group: restoreGroupStateController
    } of collectLightGroups()) {
      if (state.exportRenderState?.groupStates.has(restoreGroupStateKey)) {
        restoreGroupStateController.enabled =
          state.exportRenderState.groupStates.get(restoreGroupStateKey);
      }
    }
    for (const { key: restoreTvStateKey, item: restoreTvStateController } of collectTelevisions()) {
      if (state.exportRenderState?.tvStates.has(restoreTvStateKey)) {
        restoreTvStateController.screenEnabled = state.exportRenderState.tvStates.get(restoreTvStateKey);
      }
    }
    for (const { key: restoreCarStateKey, item: restoreCarStateController } of collectCars()) {
      if (state.exportRenderState?.carChargingStates.has(restoreCarStateKey)) {
        restoreCarStateController.chargingEnabled =
          state.exportRenderState.carChargingStates.get(restoreCarStateKey);
      }
    }
    refreshPreviewScene();
    applyCameraSnapshot(savedCameraSnapshot, renderWidthPx / renderHeightPx);
    setExportBusy(false);
    refreshExportPreview();
  }
}
