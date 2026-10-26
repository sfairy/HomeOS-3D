/** 扫地机实时地图渲染器（从 register-all 拆出）。 */
import { clampNumberWithFallback, resolveStatePayload } from "../_shared";
import { createVacuumMapImageLoader } from "../../vacuum-map-state";
import type { ComponentControllerHooks } from "./types";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("vacuum-map", {
      render(vacuumMapComponent: any, vacuumMapRenderEnvironment: any) {
        const vacuumMapProperties = vacuumMapComponent.properties || {},
          vacuumMapBoundEntityId = vacuumMapComponent.bindings?.entity?.entityId || "",
          vacuumMapComponentElement = document.createElement("div");
        if (
          ((vacuumMapComponentElement.className = "hb-vacuum-map-component"),
          (vacuumMapComponentElement.style.opacity = String(
            clampNumberWithFallback(vacuumMapProperties.opacity, 0, 1, 0.5),
          )),
          vacuumMapComponentElement.setAttribute(
            "aria-label",
            vacuumMapProperties.label || "扫地机器人实时地图",
          ),
          !vacuumMapBoundEntityId)
        ) {
          if (vacuumMapRenderEnvironment.editable) {
            const missingEntityPlaceholderElement = document.createElement("span");
            ((missingEntityPlaceholderElement.className = "hb-vacuum-map-placeholder"),
              (missingEntityPlaceholderElement.textContent = "请选择实时地图实体"),
              vacuumMapComponentElement.append(missingEntityPlaceholderElement));
          }
          return vacuumMapComponentElement;
        }
        let vacuumMapImageElement: HTMLImageElement & ComponentControllerHooks = document.createElement("img");
        ((vacuumMapImageElement.className = "hb-vacuum-map-image"),
          (vacuumMapImageElement.alt =
            vacuumMapProperties.label ||
            resolveStatePayload(vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId))
              ?.attributes?.friendly_name ||
            vacuumMapBoundEntityId),
          (vacuumMapImageElement.draggable = false));
        const unavailableMapPlaceholderElement = document.createElement("span");
        ((unavailableMapPlaceholderElement.className = "hb-vacuum-map-placeholder"),
          (unavailableMapPlaceholderElement.textContent = "实时地图暂时不可用"),
          (unavailableMapPlaceholderElement.hidden = true),
          (vacuumMapImageElement.hidden = true),
          vacuumMapComponentElement.append(vacuumMapImageElement, unavailableMapPlaceholderElement));
        const vacuumMapImageLoader = createVacuumMapImageLoader({
            entityId: vacuumMapBoundEntityId,
            getState: () => vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId),
            isActive: () =>
              vacuumMapRenderEnvironment.liveMedia !== false &&
              document.visibilityState !== "hidden" &&
              vacuumMapImageElement.dataset.vacuumMapSuspended !== "true",
            onFrame(mapFramePayload: any) {
              ((mapFramePayload.className = vacuumMapImageElement.className),
                (mapFramePayload.alt = vacuumMapImageElement.alt),
                (mapFramePayload.draggable = false),
                (mapFramePayload.hbSyncVacuumMap = syncVacuumMapImage),
                vacuumMapImageElement.replaceWith(mapFramePayload),
                (vacuumMapImageElement = mapFramePayload),
                (vacuumMapImageElement.hidden = false),
                (unavailableMapPlaceholderElement.hidden = true));
            },
            onUnavailable() {
              ((vacuumMapImageElement.hidden = true),
                vacuumMapImageElement.removeAttribute("src"),
                (unavailableMapPlaceholderElement.hidden = !vacuumMapRenderEnvironment.editable));
            },
          }),
          syncVacuumMapImage = () => vacuumMapImageLoader.sync();
        vacuumMapImageElement.hbSyncVacuumMap = syncVacuumMapImage;
        const handleMapVisibilityChange = () => syncVacuumMapImage();
        return (
          document.addEventListener("visibilitychange", handleMapVisibilityChange),
          vacuumMapRenderEnvironment.liveMedia !== false && syncVacuumMapImage(),
          vacuumMapRenderEnvironment.cleanup(() => {
            (document.removeEventListener("visibilitychange", handleMapVisibilityChange),
              delete vacuumMapImageElement.hbSyncVacuumMap,
              vacuumMapImageLoader.dispose());
          }),
          vacuumMapComponentElement
        );
      },
    });
}

export default register;
