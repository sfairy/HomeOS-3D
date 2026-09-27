/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  requestStudioApi,
  setSaveState,
  showToast
} from "./studio-document-save.js";
import { initializeStudioStage } from "./studio-stage-init.js";
import {
  loadStudioRecord,
  loadTiming,
  resizePlanCanvas
} from "./studio-document-io.js";
import { isStageViewerMode } from "./studio-architecture.js";
import { stageStartup } from "../stage-startup.js";
import { createStageController } from "./studio-stage-controller.js";
import {
  autoDiagramComponentId,
  openExportDialog
} from "./studio-export-dialogs.js";
import { isAutoDiagramEmbed } from "./studio-render-pipeline.js";
import { selectElement } from "./studio-plan-render.js";

export const projectNameElement = selectElement("#project-name");

export const isStudioRoute = isStageViewerMode || /^\/3d-studio\/?$/.test(window.location.pathname);

export async function initializeStudio() {
  if (!isStudioRoute) {
    setSaveState("地址无效", "error");
    return;
  }
  try {
    // 必须 await：initializeStudioStage 内部可能在等一次上下文重建重试，不等它就直接
    await initializeStudioStage();
    resizePlanCanvas();
    const pageSearchParams = new URLSearchParams(window.location.search);
    loadTiming("draft-requested");
    const studioRecord = await requestStudioApi(
      isStageViewerMode
        ? "/modules/interaction3d/scenes/" +
            encodeURIComponent(pageSearchParams.get("sceneId") || "") +
            "/current?projectId=" +
            encodeURIComponent(pageSearchParams.get("projectId") || "")
        : "/studio3d",
      {},
      // 舞台页的预热响应（stage-startup.js 已经发过同一个 URL）；非舞台页为 null，
      stageStartup?.response
    );
    projectNameElement.textContent = "户型图绘制";
    document.title = "户型图绘制";
    loadTiming("draft-fetched");
    await loadStudioRecord(studioRecord);
    loadTiming("draft-loaded");
    if (isStageViewerMode) {
      await new Promise(requestAnimationFrame);
      const { mountStage: mountStage } = await (stageStartup?.module ||
        import(/* @vite-ignore */ "/api/v1/modules/interaction3d/core/stage.js"));
      mountStage(createStageController());
      loadTiming("stage-mounted");
      return;
    }
    setSaveState("已自动保存", "saved");
    if (autoDiagramComponentId) {
      if (isAutoDiagramEmbed) {
        openExportDialog();
      } else {
        window.setTimeout(() => openExportDialog(), 180);
      }
    }
  } catch (studioLoadError: any) {
    if (isStageViewerMode) {
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          type: "error",
          message: studioLoadError.message || "无法载入3D户型。"
        },
        window.location.origin
      );
    }
    setSaveState("载入失败", "error");
    showToast(studioLoadError.message || "无法载入项目。", "error");
  }
}
