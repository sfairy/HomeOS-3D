/** 摄像头渲染器（从 register-all 拆出）。 */
import { resolveStatePayload } from "../_shared";
import {
  appendCameraFrame,
  cameraRadiusRatio,
  mountCameraMedia,
  mountCameraSnapshot,
} from "../camera-media";
import { cameraSourceConfigured } from "@/studio/platform/camera-binding-source";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("camera", {
    render(cameraComponent: any, cameraRenderEnvironment: any) {
      const cameraProperties = cameraComponent.properties || {},
        boundCameraEntityId = cameraComponent.bindings?.entity?.entityId || "",
        cameraComponentElement = document.createElement("div");
      cameraComponentElement.className = "hb-camera-component";
      const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320)),
        cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180)),
        cameraComponentScale = Math.max(
          0.01,
          Number(cameraRenderEnvironment.document?.canvas?.componentScale || 1),
        ),
        cornerRadiusPx =
          (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
          cameraComponentScale;
      if (
        ((cameraComponentElement.style.borderRadius = cornerRadiusPx + "px"),
        cameraRenderEnvironment.editable)
      ) {
        const editableCameraPlaceholderElement = document.createElement("div");
        ((editableCameraPlaceholderElement.className = "hb-camera-placeholder"),
          (editableCameraPlaceholderElement.textContent =
            cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面"),
          cameraComponentElement.append(editableCameraPlaceholderElement));
      } else {
        if (cameraRenderEnvironment.liveMedia !== false && cameraProperties.mediaVisible !== false) {
          const runtimeCameraPlaceholderElement = document.createElement("div");
          runtimeCameraPlaceholderElement.className = "hb-camera-placeholder";
          // go2rtc 来源可以不绑 HA 实体，此时地址本身就是「已配置」的判据。
          const runtimeCameraGo2rtcUrl =
              cameraProperties.cameraSource === "go2rtc"
                ? String(cameraProperties.go2rtcUrl || "").trim()
                : "",
            isSnapshotMode = cameraProperties.displayMode === "snapshot" && !runtimeCameraGo2rtcUrl;
          runtimeCameraPlaceholderElement.textContent = boundCameraEntityId || runtimeCameraGo2rtcUrl
            ? isSnapshotMode
              ? "正在载入摄像头快照"
              : "正在载入摄像头实时预览"
            : "未选择摄像头实体";
          cameraComponentElement.append(runtimeCameraPlaceholderElement);
          if (cameraSourceConfigured({ ...cameraProperties, entityId: boundCameraEntityId })) {
            const cameraMountOptions = {
              container: cameraComponentElement,
              entityId: boundCameraEntityId,
              label:
                resolveStatePayload(cameraRenderEnvironment.states?.get(boundCameraEntityId))
                  ?.attributes?.friendly_name || boundCameraEntityId,
              objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
              placeholder: runtimeCameraPlaceholderElement,
              // go2rtc 来源时地址必须透传给 MSE 通路，否则会退回 HA 的 HLS；服务端只认 ID，
              // projectId/componentId 用来让 `/api/v1/go2rtc/ws` 从已保存的文档里取回权威地址。
              go2rtcUrl: runtimeCameraGo2rtcUrl,
              projectId: cameraRenderEnvironment.document?.projectId || "",
              componentId: cameraComponent.id || "",
              cleanup: (onComponentCleanup: any) => cameraRenderEnvironment.cleanup(onComponentCleanup),
            };
            isSnapshotMode
              ? mountCameraSnapshot({
                  ...cameraMountOptions,
                  refreshInterval: cameraProperties.refreshInterval,
                })
              : mountCameraMedia(cameraMountOptions);
          }
        }
      }
      return (
        appendCameraFrame(
          cameraComponentElement,
          cameraComponent,
          cameraProperties,
          cameraRenderEnvironment.renderNamespace,
        ),
        cameraComponentElement
      );
    },
  });
}

export default register;
