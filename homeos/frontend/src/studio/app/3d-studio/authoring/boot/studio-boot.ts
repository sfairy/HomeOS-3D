/**
 * 引导序列（原 `studio-app.ts` 里的顶层 `startupStudio()`）：建渲染器 → 拉草稿 → 净化文档 →
 * 应用草稿 → 按嵌入与否挂载舞台 / 打开导出面板，失败时按嵌入契约向宿主报错。
 *
 * 从 `studio-app.ts` 单体切出（P4）。它是**编排**，不是实现：15 个外部依赖全部按 deps 显式传入，
 * 其中 `stageLoadTiming` 是文件顶层的计时器单例（必须与宿主共用同一个实例，新建一个会把耗时算丢）。
 * 只有一个调用点（宿主闭包末尾的 `startupStudio();`），所以不需要源侧薄绑定。
 */

import { registryReady } from "../../../renderer/registry";
import { prepareSceneDocument as prepareSceneDocument2 } from "../../scene-persistent-cache";
import { stageStartup as stageStartup2 } from "../../stage-startup";

/** 引导序列需要的外部状态：入口判定 / 取数 / 渲染器与舞台挂载 / 状态提示 / 嵌入契约。 */
interface StudioBootDeps {
  isStudioEntry: boolean;
  isEmbeddedStage: boolean;
  isAutoDiagramEmbed: boolean;
  autoDiagramComponentId: any;
  projectNameElement: any;
  stageLoadTiming: (label: string) => void;
  showSaveState: (text: string, state: string) => void;
  showToast: (text: string, state: string) => void;
  fetchStudioApi: (path: string, options: any, response: any) => Promise<any>;
  createStudioRenderer: () => void;
  resizePlanStage: () => void;
  applyLoadedDraft: (payload: any, sceneDocument: any) => Promise<any>;
  runStudioRenderLoop: () => any;
  openExportPanel: () => void;
  normalizeDocument: (rawDocument: any) => any;
}

export async function startupStudio(deps: StudioBootDeps) {
  if (!deps.isStudioEntry) {
    deps.showSaveState("地址无效", "error");
    return;
  }
  try {
    // 组件族是动态 chunk：先等注册表就绪，否则面板会先画成「控件尚未实现」再被替换。
    // 与建渲染器并行等待，避免串行化这两段互不依赖的启动工作。
    (deps.createStudioRenderer(), deps.stageLoadTiming("renderer-created"), deps.resizePlanStage());
    await registryReady;
    const xa3 = await deps.fetchStudioApi(
      stageStartup2?.path || "/studio3d",
      {},
      stageStartup2?.response,
    );
    ((deps.projectNameElement.textContent = "户型图绘制"),
      deps.stageLoadTiming("draft-fetched"),
      (document.title = "户型图绘制"));
    let sceneDocument: any = null;
    if (stageStartup2) {
      const { cache: startupCache, key: startupKey } = stageStartup2,
        preparedDocument = prepareSceneDocument2(
          xa3,
          startupCache.peek(startupKey),
          deps.normalizeDocument,
        );
      ((sceneDocument = preparedDocument.document),
        deps.stageLoadTiming(
          preparedDocument.reused ? "scene-preparation-reused" : "scene-preparation-built",
        ),
        preparedDocument.reused || startupCache.schedule(startupKey, xa3, sceneDocument));
    }
    if (
      (await deps.applyLoadedDraft(xa3, sceneDocument),
      deps.stageLoadTiming("draft-loaded"),
      deps.isEmbeddedStage)
    ) {
      const module = await stageStartup2!.module;
      (await new Promise(requestAnimationFrame),
        module.mountStage(deps.runStudioRenderLoop()),
        deps.stageLoadTiming("stage-mounted"));
      return;
    }
    (deps.showSaveState("已自动保存", "saved"),
      deps.autoDiagramComponentId &&
        (deps.isAutoDiagramEmbed
          ? deps.openExportPanel()
          : window.setTimeout(() => deps.openExportPanel(), 180)));
  } catch (startupError: any) {
    (deps.isEmbeddedStage &&
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          type: "error",
          message: startupError.message || "无法载入3D户型。",
        },
        window.location.origin,
      ),
      deps.showSaveState("载入失败", "error"),
      deps.showToast(startupError.message || "无法载入项目。", "error"));
  }
}
