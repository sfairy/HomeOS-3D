/**
 * `floorplan-auto-diagram` 控件：编辑器里嵌 iframe 实时预览 3D 构图，运行时用底图 + 图层叠加渲染。
 *
 * 图层是否点亮走 `entity-state.js` 的 `isLayerEntityActive`（比通用活动态更宽）。
 */
// 同门分片：builtin-assets
import { resolveAssetUrl } from "../builtin-assets.js?v=2609262221";
// 同门分片：entity-state
import { isLayerEntityActive } from "../entity-state.js?v=2609262221";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609262221";

// 户型图自动导图控件：编辑器里嵌 iframe 实时预览 3D 构图，运行时用底图 + 图层叠加渲染。
registerComponent("floorplan-auto-diagram", {
  render(diagramComponent, diagramContext = {}) {
    const diagramProperties = diagramComponent.properties || {};
    const diagramElement = document.createElement("div");
    diagramElement.className = "hb-floorplan-auto-diagram";
    diagramElement.setAttribute(
      "aria-label",
      diagramProperties.label || diagramProperties.instanceName || "户型图自动导图"
    );
    if (
      diagramContext.editable &&
      diagramProperties.previewReady === true &&
      (diagramProperties.generated !== true || diagramProperties.previewing === true)
    ) {
      const diagramPreviewFrameElement = document.createElement("iframe");
      diagramPreviewFrameElement.className =
        "hb-floorplan-auto-diagram-preview is-" +
        (diagramProperties.interactionMode === "view" ? "view" : "position") +
        "-mode";
      diagramPreviewFrameElement.title = "3D户型图构图预览";
      const diagramCanvasMetrics = diagramContext.document?.canvas || {};
      const diagramPosition = diagramComponent.position || {};
      const diagramExportFolder =
        diagramProperties.exportFolder || "自动导图-" + diagramComponent.id;
      const diagramQueryParams = new URLSearchParams({
        "auto-diagram-component": diagramComponent.id,
        "auto-diagram-embed": "1",
        "dashboard-width": String(Number(diagramCanvasMetrics.width || 2778)),
        "dashboard-height": String(Number(diagramCanvasMetrics.height || 1940)),
        "component-width": String(Math.max(1, Math.round(Number(diagramPosition.width || 100)))),
        "component-height": String(Math.max(1, Math.round(Number(diagramPosition.height || 100)))),
        "export-folder": diagramExportFolder
      });
      if (diagramProperties.floorSelection) {
        diagramQueryParams.set("floor-selection", String(diagramProperties.floorSelection));
      }
      diagramPreviewFrameElement.src = "/3d-studio?" + diagramQueryParams;
      diagramPreviewFrameElement.setAttribute("allow", "fullscreen");
      diagramElement.append(diagramPreviewFrameElement);
      const diagramLoadingElement = document.createElement("div");
      diagramLoadingElement.className = "hb-floorplan-auto-diagram-loading";
      diagramLoadingElement.innerHTML =
        '<i aria-hidden="true"></i><strong>正在加载3D户型…</strong>';
      diagramElement.append(diagramLoadingElement);
      const diagramHintElement = document.createElement("div");
      diagramHintElement.className = "hb-floorplan-auto-diagram-preview-hint";
      diagramHintElement.textContent =
        diagramProperties.interactionMode === "view"
          ? "拖动旋转 · 右键平移 · 滚轮缩放"
          : "拖动控件调整位置，右下角调整大小";
      diagramElement.append(diagramHintElement);
      return diagramElement;
    }
    const diagramBaseImageElement = document.createElement("img");
    diagramBaseImageElement.className = "hb-floorplan-auto-diagram-base";
    diagramBaseImageElement.alt = "户型图";
    diagramBaseImageElement.draggable = false;
    const diagramBaseImageSource = resolveAssetUrl(
      diagramProperties.baseAssetId || diagramProperties.floorPlanAssetId || ""
    );
    if (diagramBaseImageSource) {
      diagramBaseImageElement.src = diagramBaseImageSource;
    } else {
      diagramBaseImageElement.className += " is-empty";
      diagramBaseImageElement.alt = "";
    }
    diagramElement.append(diagramBaseImageElement);
    const diagramLayerEntries = [];
    const diagramLayerButtons = [];
    // 按实体状态刷新灯组图层的点亮态；同时挂在 diagramElement 上并注册为运行时状态回调，
    // 这样实体状态变化时只需重跑这个函数，不必整块重建户型图 DOM。
    const syncDiagramLayerState = () => {
      for (const diagramLayerEntry of diagramLayerEntries) {
        const isDiagramLayerActive = isLayerEntityActive(
          diagramLayerEntry.entityId,
          diagramContext
        );
        diagramLayerEntry.image.classList.toggle(
          "is-active",
          isDiagramLayerActive || diagramContext.editable
        );
        diagramLayerEntry.button.classList.toggle("is-active", isDiagramLayerActive);
        diagramLayerEntry.button.setAttribute("aria-pressed", String(isDiagramLayerActive));
      }
    };
    const diagramLightLayers = Array.isArray(diagramProperties.lightLayers)
      ? diagramProperties.lightLayers
      : [];
    for (const diagramLightLayer of diagramLightLayers) {
      const layerImageElement = document.createElement("img");
      layerImageElement.className = "hb-floorplan-auto-diagram-layer";
      layerImageElement.alt = "";
      layerImageElement.draggable = false;
      const layerImageSource = resolveAssetUrl(diagramLightLayer.assetId || "");
      if (layerImageSource) {
        layerImageElement.src = layerImageSource;
      }
      const layerBinding = diagramComponent.bindings?.["lightGroup:" + diagramLightLayer.id] || {};
      const layerEntityId = String(layerBinding.entityId || diagramLightLayer.entityId || "");
      const layerButtonElement = document.createElement("button");
      layerButtonElement.type = "button";
      layerButtonElement.className = "hb-floorplan-auto-diagram-button";
      layerButtonElement.textContent = diagramLightLayer.name || diagramLightLayer.note || "灯组";
      if (diagramLightLayer.note) {
        layerButtonElement.title = diagramLightLayer.note;
      }
      layerButtonElement.addEventListener("click", async layerClickEvent => {
        layerClickEvent.preventDefault();
        layerClickEvent.stopPropagation();
        if (
          !!layerEntityId &&
          !diagramContext.editable &&
          typeof diagramContext.callEntityService == "function"
        ) {
          layerButtonElement.disabled = true;
          try {
            await diagramContext.callEntityService("homeassistant", "toggle", layerEntityId);
          } catch (toggleError) {
            diagramContext.onError?.(toggleError);
          } finally {
            layerButtonElement.disabled = false;
          }
        }
      });
      diagramElement.append(layerImageElement, layerButtonElement);
      const layerEntryRecord = {
        image: layerImageElement,
        button: layerButtonElement,
        entityId: layerEntityId
      };
      diagramLayerEntries.push(layerEntryRecord);
      diagramLayerButtons.push(layerButtonElement);
      if (layerEntityId && typeof diagramContext.registerRuntimeStateHandler == "function") {
        diagramContext.registerRuntimeStateHandler(layerEntityId, syncDiagramLayerState);
      }
    }
    if (!diagramBaseImageSource) {
      const diagramEmptyHintElement = document.createElement("div");
      diagramEmptyHintElement.className = "hb-floorplan-auto-diagram-empty";
      diagramEmptyHintElement.textContent = "请先完成户型和灯组，再生成导图";
      diagramElement.append(diagramEmptyHintElement);
    }
    diagramElement.syncFloorplanAutoDiagramState = syncDiagramLayerState;
    syncDiagramLayerState();
    return diagramElement;
  }
});
