/**
 * `camera` 控件：注册 `registry/camera.js` 的挂载函数。
 */
// 状态条目归一统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=20260921124622";
// 同门分片：camera
import {
  appendCameraFrame,
  cameraRadiusRatio,
  mountCameraMedia,
  mountCameraSnapshot
} from "../camera.js?v=20260921124622";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=20260921124622";

// 摄像头控件：运行时优先播放实时视频，不可用时退回定时刷新的快照。
registerComponent("camera", {
  render(cameraComponent, cameraContext) {
    const cameraProperties = cameraComponent.properties || {};
    const cameraBindingEntityId = cameraComponent.bindings?.entity?.entityId || "";
    const cameraElement = document.createElement("div");
    cameraElement.className = "hb-camera-component";
    const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320));
    const cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180));
    const cameraScopeScale = Math.max(
      0.01,
      Number(cameraContext.document?.canvas?.componentScale || 1)
    );
    const cameraBorderRadius =
      (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
      cameraScopeScale;
    cameraElement.style.borderRadius = cameraBorderRadius + "px";
    if (cameraContext.editable) {
      const cameraPlaceholderElement = document.createElement("div");
      cameraPlaceholderElement.className = "hb-camera-placeholder";
      cameraPlaceholderElement.textContent =
        cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面";
      cameraElement.append(cameraPlaceholderElement);
    } else if (cameraContext.liveMedia !== false && cameraProperties.mediaVisible !== false) {
      const cameraStatusElement = document.createElement("div");
      cameraStatusElement.className = "hb-camera-placeholder";
      const isSnapshotDisplayMode = cameraProperties.displayMode === "snapshot";
      cameraStatusElement.textContent = cameraBindingEntityId
        ? isSnapshotDisplayMode
          ? "正在载入摄像头快照"
          : "正在载入摄像头实时预览"
        : "未选择摄像头实体";
      cameraElement.append(cameraStatusElement);
      if (cameraBindingEntityId) {
        const cameraMountOptions = {
          container: cameraElement,
          entityId: cameraBindingEntityId,
          label:
            resolveStateEntry(cameraContext.states?.get(cameraBindingEntityId))?.attributes
              ?.friendly_name || cameraBindingEntityId,
          objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
          placeholder: cameraStatusElement,
          cleanup: cleanupRegistration => cameraContext.cleanup(cleanupRegistration)
        };
        if (isSnapshotDisplayMode) {
          mountCameraSnapshot({
            ...cameraMountOptions,
            refreshInterval: cameraProperties.refreshInterval
          });
        } else {
          mountCameraMedia(cameraMountOptions);
        }
      }
    }
    appendCameraFrame(
      cameraElement,
      cameraComponent,
      cameraProperties,
      cameraContext.renderNamespace
    );
    return cameraElement;
  }
});
