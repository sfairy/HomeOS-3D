/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  applyBaseLighting,
  isAutoDiagramEmbed
} from "./studio-render-pipeline.js";
import {
  applyBaseLightingSettings,
  autoDiagramComponentId,
  baseLightControlsElement
} from "./studio-export-dialogs.js";
import {
  DEFAULT_BASE_LIGHTING,
  normalizeBaseLighting
} from "../loaders/studio-normalization.js";
import {
  markDocumentDirty,
  saveStudioDraft,
  showToast
} from "./studio-document-save.js";
import { exportDialogElement } from "./studio-camera-presets.js";
import { moveFloatingPanelIntoBounds } from "../../shared/menu-positioning.js";

/**
 * 切换「高阴影质量」档位；降档时把阴影相机视锥还原回升档前的备份。升档前先备份 shadow.camera 的六向
 */
export function setHighShadowQuality(isHighQuality: any) {
  const nextHighQuality = isHighQuality === true;
  if (nextHighQuality !== state.isHighShadowQuality) {
    if (nextHighQuality && state.mainDirectionalLight?.shadow?.camera) {
      const savedShadowCamera = state.mainDirectionalLight.shadow.camera;
      state.savedShadowCameraBounds = {
        left: savedShadowCamera.left,
        right: savedShadowCamera.right,
        top: savedShadowCamera.top,
        bottom: savedShadowCamera.bottom,
        near: savedShadowCamera.near,
        far: savedShadowCamera.far
      };
    }
    state.isHighShadowQuality = nextHighQuality;
    applyBaseLighting();
    if (!nextHighQuality && state.savedShadowCameraBounds && state.mainDirectionalLight?.shadow?.camera) {
      const restoredShadowCamera = state.mainDirectionalLight.shadow.camera;
      Object.assign(restoredShadowCamera, state.savedShadowCameraBounds);
      restoredShadowCamera.updateProjectionMatrix();
      state.savedShadowCameraBounds = null;
    }
    if (state.mainDirectionalLight?.shadow) {
      state.mainDirectionalLight.shadow.needsUpdate = true;
    }
    if (state.renderer?.domElement) {
      state.renderer.domElement.dataset.exportShadowQuality = nextHighQuality ? "high" : "realtime";
    }
  }
}

/**
 * 打开基础光设置面板（必要时先回填一次文档里的配置）。挂载点跟着导出对话框走：对话框打开时面板必须挂进
 */
export function openBaseLightingPanel() {
  if (!state.studioDocument || !baseLightControlsElement) {
    return;
  }
  const mountParent = exportDialogElement?.open ? exportDialogElement : document.body;
  if (baseLightControlsElement.parentElement !== mountParent) {
    mountParent.append(baseLightControlsElement);
  }
  if (baseLightControlsElement.hidden) {
    applyBaseLightingSettings(state.studioDocument.baseLighting);
  }
  baseLightControlsElement.hidden = false;
  const panelRect = baseLightControlsElement.getBoundingClientRect();
  if (
    panelRect.right > window.innerWidth - 8 ||
    panelRect.bottom > window.innerHeight - 8 ||
    panelRect.left < 8 ||
    panelRect.top < 8
  ) {
    moveFloatingPanelIntoBounds({
      panelElement: baseLightControlsElement,
      leftPx: panelRect.left,
      topPx: panelRect.top
    });
  }
}

export function saveBaseLighting() {
  if (!state.studioDocument) {
    return;
  }
  const normalizedLighting = normalizeBaseLighting(state.baseLighting);
  state.studioDocument.baseLighting = normalizedLighting;
  applyBaseLightingSettings(normalizedLighting);
  markDocumentDirty();
  state.lightingChannel?.postMessage({
    type: "base-lighting-saved",
    lighting: normalizedLighting
  });
  // 不能用「调用过 saveStudioDraft」当成功：冲突挂着或请求失败时它并不会落盘，
  saveStudioDraft().then(baseLightingSaveOutcome => {
    if (baseLightingSaveOutcome === "saved") {
      showToast("基础光设置已保存，导图和自动化控件已同步。", "success");
    } else if (
      baseLightingSaveOutcome === "blocked-by-conflict" ||
      baseLightingSaveOutcome === "blocked-by-interaction-confirmation"
    ) {
      showToast("基础光设置已记录，但户型草稿还没保存，请先处理顶栏的保存提示。", "error");
    }
  });
}

/**
 * @param {string} [lightingStatus="ready"] 状态标记：ready / preview / saved / cancelled。
 */
export function postBaseLightingState(lightingStatus = "ready") {
  if (
    !!isAutoDiagramEmbed &&
    !!autoDiagramComponentId &&
    window.parent !== window &&
    !!state.studioDocument
  ) {
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-base-lighting-state",
        componentId: autoDiagramComponentId,
        status: lightingStatus,
        lighting: normalizeBaseLighting(state.baseLighting),
        savedLighting: normalizeBaseLighting(state.studioDocument.baseLighting),
        defaults: normalizeBaseLighting(DEFAULT_BASE_LIGHTING)
      },
      window.location.origin
    );
  }
}
