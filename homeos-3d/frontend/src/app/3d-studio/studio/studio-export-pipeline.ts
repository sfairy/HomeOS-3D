/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  currentPreviewFloorMode,
  getCurrentFloor
} from "./studio-plan-render.js";
import { state } from "./studio-state.js";
import {
  finite,
  normalizeLabelText
} from "../loaders/studio-normalization.js";
import { studioPalette } from "./studio-architecture.js";
import {
  EXPORT_IMAGE_MIME_TYPE,
  EXPORT_IMAGE_QUALITY,
  buildLightDeltaPixels
} from "../export/export-utils.js";
import {
  applyExportPreset,
  exportStatusElement,
  refreshExportPreview,
  renderExportPreviewFrames
} from "./studio-export-dialogs.js";
import {
  refreshLightsLayer,
  refreshPreviewScene
} from "./studio-render-pipeline.js";
import { yieldToScheduler } from "./studio-yield.js";
import {
  buildExportPreset,
  exportLockRatioInput,
  exportPresetLabel,
  renderExportPresetSlots,
  saveActiveExportPreset
} from "./studio-camera-presets.js";
import {
  MAX_EXPORT_PRESET_COUNT,
  normalizeExportPresetSlots
} from "../export/export-presets.js";
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import {
  exportHeightInput,
  exportWidthInput
} from "./studio-render-quality.js";
import {
  DEFAULT_EXPORT_HEIGHT,
  DEFAULT_EXPORT_WIDTH
} from "./studio-config-tables.js";
import { clamp } from "../plan/geometry.js";

/**
 * 计算某楼层在整景导出图里相对基准层的垂直偏移（米）。单层导出无堆叠概念，返回 0。
 */
export function floorExportOffset(measuredFloor: any) {
  if (currentPreviewFloorMode() !== "all") {
    return 0;
  }
  const offsetFloorIndex = state.studioDocument.floors.findIndex(
    (indexedFloorRecord: any) => indexedFloorRecord.id === measuredFloor?.id
  );
  return Math.max(offsetFloorIndex, 0) * finite(state.studioDocument.exportFloorGap, 3);
}

/**
 * 处理导出宽高输入，按锁定比例联动另一边并夹紧到 320–4096。shouldClampBoth 为真时
 */
export function setExportDimension(dimension: any, shouldClampBoth = false) {
  const inputDimensionValue = Number(
    (dimension === "width" ? exportWidthInput : exportHeightInput).value
  );
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) {
    return;
  }
  let nextWidthPx = dimension === "width" ? inputDimensionValue : Number(exportWidthInput.value);
  let nextHeightPx = dimension === "height" ? inputDimensionValue : Number(exportHeightInput.value);
  nextWidthPx =
    Number.isFinite(nextWidthPx) && nextWidthPx > 0 ? nextWidthPx : DEFAULT_EXPORT_WIDTH;
  nextHeightPx =
    Number.isFinite(nextHeightPx) && nextHeightPx > 0 ? nextHeightPx : DEFAULT_EXPORT_HEIGHT;
  if (exportLockRatioInput.checked) {
    if (dimension === "width") {
      if (shouldClampBoth) {
        nextWidthPx = clamp(nextWidthPx, 320, 4096);
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
        if (nextHeightPx < 320) {
          nextHeightPx = 320;
          nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
        }
        if (nextHeightPx > 4096) {
          nextHeightPx = 4096;
          nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
        }
      } else {
        nextHeightPx = Math.round(clamp(nextWidthPx / state.exportAspectRatio, 320, 4096));
      }
    } else if (shouldClampBoth) {
      nextHeightPx = clamp(nextHeightPx, 320, 4096);
      nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
      if (nextWidthPx < 320) {
        nextWidthPx = 320;
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
      }
      if (nextWidthPx > 4096) {
        nextWidthPx = 4096;
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
      }
    } else {
      nextWidthPx = Math.round(clamp(nextHeightPx * state.exportAspectRatio, 320, 4096));
    }
  }
  if (shouldClampBoth) {
    nextWidthPx = Math.round(clamp(nextWidthPx, 320, 4096));
    nextHeightPx = Math.round(clamp(nextHeightPx, 320, 4096));
    exportWidthInput.value = String(nextWidthPx);
    exportHeightInput.value = String(nextHeightPx);
  } else if (exportLockRatioInput.checked) {
    if (dimension === "width") {
      exportHeightInput.value = String(nextHeightPx);
    } else {
      exportWidthInput.value = String(nextWidthPx);
    }
  }
  refreshExportPreview();
}

/**
 * 切换活动导出档位：先保存当前档位，再应用目标档位。非法下标或导出进行中直接忽略。
 */
export function selectExportPresetSlot(presetSlotIndexToApply: any) {
  const presetSlotCount = state.studioDocument?.exportPresets?.length || 0;
  if (
    !Number.isInteger(presetSlotIndexToApply) ||
    presetSlotIndexToApply < 0 ||
    presetSlotIndexToApply >= presetSlotCount ||
    state.isExportBusy
  ) {
    return;
  }
  saveActiveExportPreset();
  state.studioDocument.activeExportPresetSlot = presetSlotIndexToApply;
  const didApplyPreset = applyExportPreset(presetSlotIndexToApply);
  state.exportPresets = false;
  renderExportPresetSlots();
  markDocumentDirty();
  if (!didApplyPreset) {
    exportStatusElement.textContent =
      "存档 " + String(presetSlotIndexToApply + 1).padStart(2, "0") + " 没有设置";
  }
}

/**
 * 生成不与其他档位重名的名称（重名则追加递增序号）。名称先按 normalizeLabelText 截到 24 字；
 */
export function uniqueExportPresetName(baseName: any, excludeSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText(baseName, "导出视角", 24);
  const presetLabelSet = new Set(
    (state.studioDocument?.exportPresets || [])
      .map((presetEntry: any, presetEntryIndex: any) =>
        presetEntryIndex === excludeSlotIndex
          ? ""
          : exportPresetLabel(presetEntry, presetEntryIndex)
      )
      .filter(Boolean)
  );
  if (!presetLabelSet.has(normalizedPresetName)) {
    return normalizedPresetName;
  }
  let duplicateSuffixNumber = 2;
  while (presetLabelSet.has(normalizedPresetName + " " + duplicateSuffixNumber)) {
    duplicateSuffixNumber += 1;
  }
  return (normalizedPresetName + " " + duplicateSuffixNumber).slice(0, 24);
}

/**
 * 新增一个导出档位：以当前视角为初始状态，并沿用上一个档位的分辨率设置。先保存当前档位以免
 */
export function addExportPresetSlot() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  state.studioDocument.exportPresets = normalizeExportPresetSlots(state.studioDocument.exportPresets);
  if (state.studioDocument.exportPresets.length >= MAX_EXPORT_PRESET_COUNT) {
    showToast("最多可以保存 8 个导出存档。");
    return;
  }
  const presetCount = state.studioDocument.exportPresets.length;
  const presetBaseName =
    currentPreviewFloorMode() === "all"
      ? "全楼"
      : getCurrentFloor()?.name || "存档 " + (presetCount + 1);
  const newPresetName = uniqueExportPresetName(presetBaseName + "视角");
  const previousPreset = state.studioDocument.exportPresets.slice(0, presetCount).reverse().find(Boolean);
  const newPreset: any = buildExportPreset({
    name: newPresetName
  });
  if (previousPreset) {
    newPreset.width = previousPreset.width;
    newPreset.height = previousPreset.height;
    newPreset.lockRatio = previousPreset.lockRatio;
  }
  state.studioDocument.exportPresets.push(newPreset);
  state.studioDocument.activeExportPresetSlot = presetCount;
  state.exportPresets = false;
  renderExportPresetSlots();
  markDocumentDirty();
  exportStatusElement.textContent = "已新增“" + newPresetName + "”";
  showToast("已新增“" + newPresetName + "”，可以继续调整楼层和视角。", "success");
}

/**
 * 把 canvas 转成 Blob（JPEG / PNG 与质量由导出常量决定）。
 */
export function canvasToBlob(sourceCanvas: any) {
  return new Promise((resolveBlob, rejectBlob) => {
    sourceCanvas.toBlob(
      (producedBlob: any) => {
        if (producedBlob) {
          resolveBlob(producedBlob);
        } else {
          rejectBlob(new Error("无法生成导出图像。"));
        }
      },
      EXPORT_IMAGE_MIME_TYPE,
      EXPORT_IMAGE_QUALITY
    );
  });
}

export async function captureStageImage(captureWidth: any, captureHeight: any, captureOptions: any = {}) {
  renderExportPreviewFrames();
  const captureCanvasElement = document.createElement("canvas");
  captureCanvasElement.width = captureWidth;
  captureCanvasElement.height = captureHeight;
  const captureContext = captureCanvasElement.getContext("2d", {
    willReadFrequently: captureOptions.pixels === true
  });
  if (!captureContext) {
    throw new Error("当前浏览器无法创建导出画布。");
  }
  captureContext.drawImage(state.renderer.domElement, 0, 0, captureWidth, captureHeight);
  const captureResult: any = {};
  if (captureOptions.pixels) {
    captureResult.imageData = captureContext.getImageData(0, 0, captureWidth, captureHeight);
  }
  if (captureOptions.blob) {
    captureResult.blob = await canvasToBlob(captureCanvasElement);
  }
  return captureResult;
}

export async function compositeLightGroupShadows(
  baseFrame: any,
  lightGroupExportEntry: any,
  frameWidthPx: any,
  frameHeightPx: any,
  lightGroupOrdinal: any,
  lightGroupTotal: any
) {
  const shadowCompositeCanvas = document.createElement("canvas");
  shadowCompositeCanvas.width = frameWidthPx;
  shadowCompositeCanvas.height = frameHeightPx;
  const shadowCompositeContext = shadowCompositeCanvas.getContext("2d");
  const lightLayerCanvas = document.createElement("canvas");
  lightLayerCanvas.width = frameWidthPx;
  lightLayerCanvas.height = frameHeightPx;
  const lightLayerContext = lightLayerCanvas.getContext("2d");
  if (!shadowCompositeContext || !lightLayerContext) {
    throw new Error("当前浏览器无法合成逐灯阴影。");
  }
  const enabledGroupLights = lightGroupExportEntry.lights.filter(
    (groupLightItem: any) => finite(groupLightItem.lightBrightness, 0) > 0
  );
  try {
    for (let lightLoopIndex = 0; lightLoopIndex < enabledGroupLights.length; lightLoopIndex += 1) {
      const currentGroupLight = enabledGroupLights[lightLoopIndex];
      exportStatusElement.textContent =
        "正在渲染灯组 " +
        (lightGroupOrdinal + 1) +
        "/" +
        lightGroupTotal +
        "：" +
        lightGroupExportEntry.name +
        "（" +
        (lightLoopIndex + 1) +
        "/" +
        enabledGroupLights.length +
        "）";
      state.forcedVisibleLightIds = new Set([currentGroupLight.id]);
      if (currentPreviewFloorMode() === "all") {
        refreshPreviewScene({
          preserveLightCache: true
        });
      } else {
        refreshLightsLayer({
          preserveLightCache: true
        });
      }
      const litFrameCapture = await captureStageImage(frameWidthPx, frameHeightPx, {
        pixels: true
      });
      const lightDeltaPixelData = buildLightDeltaPixels(
        baseFrame.data,
        litFrameCapture.imageData.data
      );
      lightLayerContext.clearRect(0, 0, frameWidthPx, frameHeightPx);
      lightLayerContext.putImageData(
        new ImageData(lightDeltaPixelData as any, frameWidthPx, frameHeightPx),
        0,
        0
      );
      shadowCompositeContext.drawImage(lightLayerCanvas, 0, 0);
      await yieldToScheduler();
    }
  } finally {
    state.forcedVisibleLightIds = null;
  }
  return canvasToBlob(shadowCompositeCanvas);
}

/**
 * 合成导出用的背景底图：先铺满主题背景色，再把户型俯视图逐像素叠上去。户型俯视图由离屏
 */
export async function composeBackgroundBlob(
  backgroundWidthPx: any,
  backgroundHeightPx: any,
  floorPlanImageData: any = null
) {
  const backgroundCanvasElement = document.createElement("canvas");
  backgroundCanvasElement.width = backgroundWidthPx;
  backgroundCanvasElement.height = backgroundHeightPx;
  const backgroundCanvasContext = backgroundCanvasElement.getContext("2d");
  if (!backgroundCanvasContext) {
    throw new Error("当前浏览器无法创建导出底图。");
  }
  backgroundCanvasContext.fillStyle =
    "#" + studioPalette().background.toString(16).padStart(6, "0");
  backgroundCanvasContext.fillRect(0, 0, backgroundWidthPx, backgroundHeightPx);
  if (floorPlanImageData) {
    const floorPlanCanvasElement = document.createElement("canvas");
    floorPlanCanvasElement.width = backgroundWidthPx;
    floorPlanCanvasElement.height = backgroundHeightPx;
    const floorPlanCanvasContext = floorPlanCanvasElement.getContext("2d");
    if (!floorPlanCanvasContext) {
      throw new Error("当前浏览器无法合成户型底图。");
    }
    floorPlanCanvasContext.putImageData(floorPlanImageData, 0, 0);
    backgroundCanvasContext.drawImage(floorPlanCanvasElement, 0, 0);
  }
  return canvasToBlob(backgroundCanvasElement);
}

/**
 * @returns {object} 导出用的灯光描述对象。
 */
export function buildExportedLight(lightSourceItem: any, owningFloor = getCurrentFloor()) {
  const activeFloorPixelsPerMeter = owningFloor?.scene?.calibration?.pixelsPerMeter || 1;
  return {
    id: lightSourceItem.id,
    floorId: owningFloor?.id || null,
    type: lightSourceItem.type,
    position: {
      x: lightSourceItem.x / activeFloorPixelsPerMeter,
      z: lightSourceItem.y / activeFloorPixelsPerMeter,
      elevation: floorExportOffset(owningFloor) + (lightSourceItem.elevation || 0)
    },
    rotation: lightSourceItem.rotation || 0,
    verticalRotation: lightSourceItem.verticalRotation || 0,
    stripRollRotation:
      (lightSourceItem.type === "striplight" && lightSourceItem.stripRollRotation) || 0,
    size: {
      width: lightSourceItem.width,
      depth: lightSourceItem.depth
    },
    temperature: lightSourceItem.lightTemperature,
    brightness: lightSourceItem.lightBrightness,
    range: lightSourceItem.lightRange,
    angle: lightSourceItem.lightAngle
  };
}
