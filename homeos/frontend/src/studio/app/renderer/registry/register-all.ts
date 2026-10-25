import { createVacuumMapImageLoader } from "../vacuum-map-state";
import { bindSceneMode } from "../scene-mode";
import { renderPercentageBarControl } from "./percentage-bar";
import {
  climateDefaultIcon,
  resolveClimateDeviceType,
} from "../controls/climate";


import {
  clampNumberWithFallback,
  normalizeCssColor,
  applyTextOutline,
  resolveMdiIconUrl,
  appendSvgElement,
  resolveStatePayload,
  buildHistorySeries,
  createHoverLineChart,
} from "./_shared";
import {
  cameraRadiusRatio,
  appendCameraFrame,
  mountCameraSnapshot,
  mountCameraMedia,
} from "./camera-media";
import { cameraSourceConfigured } from "@/studio/platform/camera-binding-source";


import {
  formatLineChartValue,
  lineChartGeometry,
} from "../controls/line-chart-runtime";


import {
  meteoconUrl,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual,
} from "../controls/weather-chart-runtime";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate,
} from "../controls/date-time-runtime";
import {
  presenceAnimationPhase,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from "../controls/presence-runtime";
import {
  formatClimateStateLabel,
  isClimatePoweredOn,
} from "./cover-climate-state";
import { renderEventLogWall } from "./event-log-wall";
import { buttonComponentRenderers } from "./button-renderers";
import {
  createDoorWindowSensorView,
  createWaterLeakSensorView,
  createSmokeSensorView,
  createNaturalGasSensorView,
} from "./sensor-views";
import { componentContentUnitsPx } from "./content-units";
import { navigationComponentRenderer } from "./navigation-button";
import { registerImageComponent } from "./components/image";
import { registerFloorplanAutoDiagramComponent } from "./components/floorplan-auto-diagram";
import { registerPanelFrameComponent } from "./components/panel-frame";

import type { RenderPropertyBag, ComponentControllerHooks } from "./components/types";

export type { RenderPropertyBag, ComponentControllerHooks };

export function installRegistryComponents(registerComponent: (type: any, def: any) => void) {
  registerImageComponent(registerComponent);
  registerFloorplanAutoDiagramComponent(registerComponent);
  registerComponent("event-log-wall", {
    render: renderEventLogWall,
  });
  (registerComponent("icon-button", buttonComponentRenderers),
    registerComponent("device-button", buttonComponentRenderers));
  (registerComponent("presence-sensor", {
    render(sensorViewComponent: any, sensorViewRenderEnvironment: any) {
      const sensorProperties = sensorViewComponent.properties || {},
        sensorEntityId = sensorViewComponent.bindings?.entity?.entityId || "",
        sensorEntityState = sensorViewRenderEnvironment.states?.get(sensorEntityId),
        presenceMotionConfig = presenceMotionEventConfig(
          sensorEntityId,
          sensorEntityState,
          sensorViewRenderEnvironment.entityMetadata,
          sensorViewRenderEnvironment.states,
          sensorProperties,
        ),
        presencePresentation = presenceSensorPresentation(
          sensorEntityState,
          sensorViewRenderEnvironment.editable ? sensorViewRenderEnvironment.previewState : "auto",
          presenceMotionConfig,
        );
      if (sensorProperties.sensorKind === "door-window")
        return createDoorWindowSensorView(
          sensorViewComponent,
          sensorProperties,
          presencePresentation,
          sensorViewRenderEnvironment,
        );
      if (sensorProperties.sensorKind === "water-leak")
        return createWaterLeakSensorView(sensorProperties, presencePresentation);
      if (sensorProperties.sensorKind === "smoke")
        return createSmokeSensorView(sensorProperties, presencePresentation);
      if (sensorProperties.sensorKind === "natural-gas")
        return createNaturalGasSensorView(sensorProperties, presencePresentation);
      const occupiedAccentColor = normalizeCssColor(
          sensorProperties.iconOnColor || sensorProperties.occupiedColor,
          "#ffffff",
        ),
        clearAccentColor = normalizeCssColor(
          sensorProperties.iconColor || sensorProperties.clearColor,
          "#758189",
        ),
        contentUnits = componentContentUnitsPx(sensorViewComponent, sensorViewRenderEnvironment),
        presenceSensorElement = document.createElement("div");
      ((presenceSensorElement.className = "hb-presence-sensor is-" + presencePresentation.key),
        presenceSensorElement.classList.toggle(
          "is-halo-hidden",
          sensorProperties.haloVisible === false,
        ),
        presenceSensorElement.classList.toggle(
          "is-person-hidden",
          sensorProperties.personVisible === false,
        ),
        (presenceSensorElement.dataset.presenceState = presencePresentation.key),
        presenceSensorElement.style.setProperty("--hb-presence-occupied", occupiedAccentColor),
        presenceSensorElement.style.setProperty("--hb-presence-clear", clearAccentColor));
      const animationStrength = clampNumberWithFallback(sensorProperties.animationStrength, 0, 1, 0.72),
        haloScale = clampNumberWithFallback(sensorProperties.haloScale, 0.2, 3, 1),
        haloScaleX = clampNumberWithFallback(sensorProperties.haloScaleX, 0.2, 3, haloScale),
        haloScaleY = clampNumberWithFallback(sensorProperties.haloScaleY, 0.2, 3, haloScale),
        haloRotation = clampNumberWithFallback(sensorProperties.haloRotation, -360, 360, 0),
        haloOpacity = clampNumberWithFallback(sensorProperties.haloOpacity, 0, 1, 1),
        personScale = clampNumberWithFallback(sensorProperties.personScale, 0.2, 3, 1),
        personRotation = clampNumberWithFallback(sensorProperties.personRotation, -360, 360, 0),
        personOpacity = clampNumberWithFallback(sensorProperties.personOpacity, 0, 1, 1),
        orbitDuration = clampNumberWithFallback(sensorProperties.orbitDuration, 2, 60, 8);
      presenceSensorElement.style.setProperty("--hb-presence-motion", String(animationStrength));
      const waveDurationSeconds = Number((3.2 - animationStrength * 0.8).toFixed(2));
      if (
        (presenceSensorElement.style.setProperty(
          "--hb-presence-wave-duration",
          waveDurationSeconds + "s",
        ),
        presenceSensorElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX)),
        presenceSensorElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY)),
        presenceSensorElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg"),
        presenceSensorElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity)),
        presenceSensorElement.style.setProperty("--hb-presence-person-scale", String(personScale)),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-rotation",
          personRotation + "deg",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-opacity",
          String(personOpacity),
        ),
        presenceSensorElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s"),
        presencePresentation.key === "occupied")
      ) {
        const animationPhase = presenceAnimationPhase(sensorEntityState, {
          orbit: orbitDuration,
          wave: waveDurationSeconds,
        });
        (presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-delay",
          animationPhase.orbitDelay,
        ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-wave-delay",
            animationPhase.waveDelay,
          ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-floor-delay",
            animationPhase.floorDelay,
          ),
          presenceSensorElement.style.setProperty(
            "--hb-presence-step-delay",
            animationPhase.stepDelay,
          ));
      }
      const orbitOffsetX = 32 * haloScaleX * contentUnits.width,
        orbitOffsetY = 13 * haloScaleY * contentUnits.height;
      (presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x",
        orbitOffsetX.toFixed(4) + "px",
      ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-negative",
          (-orbitOffsetX).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y",
          orbitOffsetY.toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-negative",
          (-orbitOffsetY).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-diagonal",
          (orbitOffsetX * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-diagonal-negative",
          (-orbitOffsetX * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-diagonal",
          (orbitOffsetY * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-diagonal-negative",
          (-orbitOffsetY * 0.707).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-shallow",
          (orbitOffsetX * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-shallow-negative",
          (-orbitOffsetX * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-steep",
          (orbitOffsetX * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-x-steep-negative",
          (-orbitOffsetX * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-shallow",
          (orbitOffsetY * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-shallow-negative",
          (-orbitOffsetY * 0.382683).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-steep",
          (orbitOffsetY * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-orbit-y-steep-negative",
          (-orbitOffsetY * 0.92388).toFixed(4) + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-width",
          22 * contentUnits.width + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-person-height",
          62 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-gap",
          7 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-main-size",
          20 * contentUnits.height + "px",
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-copy-secondary-size",
          10 * contentUnits.height + "px",
        ),
        presenceSensorElement.setAttribute("role", "img"),
        presenceSensorElement.setAttribute(
          "aria-label",
          "人在传感器：" + presencePresentation.label,
        ));
      const presenceVisualElement = document.createElement("div");
      presenceVisualElement.className = "hb-presence-sensor-visual";
      const presenceHaloElement = document.createElement("span");
      presenceHaloElement.className = "hb-presence-sensor-halo";
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceDotIndex = 0; spaceDotIndex < 3; spaceDotIndex += 1)
        presenceSpaceElement.append(document.createElement("i"));
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i"),
        personTorsoElement = document.createElement("b"),
        personLeftArmElement = document.createElement("span");
      personLeftArmElement.className = "arm left";
      const personRightArmElement = document.createElement("span");
      personRightArmElement.className = "arm right";
      const personLeftLegElement = document.createElement("span");
      personLeftLegElement.className = "leg left";
      const personRightLegElement = document.createElement("span");
      ((personRightLegElement.className = "leg right"),
        presencePersonElement.append(
          personHeadElement,
          personTorsoElement,
          personLeftArmElement,
          personRightArmElement,
          personLeftLegElement,
          personRightLegElement,
        ));
      const presenceFloorElement = document.createElement("span");
      ((presenceFloorElement.className = "hb-presence-sensor-floor"),
        presenceHaloElement.append(presenceSpaceElement, presenceFloorElement));
      const presenceOrbitElement = document.createElement("span");
      presenceOrbitElement.className = "hb-presence-sensor-orbit";
      const presenceTravelerElement = document.createElement("span");
      if (
        ((presenceTravelerElement.className = "hb-presence-sensor-traveler"),
        presenceTravelerElement.append(presencePersonElement),
        presenceOrbitElement.append(presenceTravelerElement),
        presenceVisualElement.append(presenceHaloElement, presenceOrbitElement),
        presenceSensorElement.append(presenceVisualElement),
        !sensorViewRenderEnvironment.editable &&
          presenceMotionConfig.motionEvent &&
          presencePresentation.key === "occupied")
      ) {
        const motionTimeoutSeconds = presenceMotionConfig.motionTimeoutSeconds ?? 0,
          stateTimestamp = presenceStateTimestamp(sensorEntityState),
          motionTimeoutRemainingMs = Number.isFinite(stateTimestamp)
            ? motionTimeoutSeconds * 1000 - (Date.now() - stateTimestamp!)
            : 0;
        if (motionTimeoutRemainingMs > 0) {
          const motionTimeoutHandle = window.setTimeout(
            () => sensorViewRenderEnvironment.invalidate?.(),
            motionTimeoutRemainingMs + 80,
          );
          sensorViewRenderEnvironment.cleanup(() => window.clearTimeout(motionTimeoutHandle));
        }
      }
      return presenceSensorElement;
    },
  }),
    registerComponent("air-conditioner", {
      render(airConditionerComponent: any, airConditionerRenderEnvironment: any) {
        const airConditionerProperties = airConditionerComponent.properties || {},
          airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "",
          airConditionerEntityState = resolveStatePayload(
            airConditionerRenderEnvironment.states?.get(airConditionerEntityId),
          ),
          airConditionerDeviceType = resolveClimateDeviceType(
            airConditionerComponent,
            airConditionerEntityState,
            airConditionerEntityId,
          ),
          isClimatePowered = isClimatePoweredOn(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          { height: contentUnitHeight } = componentContentUnitsPx(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          airConditionerElement = document.createElement("div");
        ((airConditionerElement.className =
          "hb-air-conditioner" + (isClimatePowered ? " active" : "")),
          airConditionerElement.style.setProperty(
            "--climate-icon-left",
            clampNumberWithFallback(airConditionerProperties.iconLeft, -100, 200, 20) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-icon-top",
            clampNumberWithFallback(airConditionerProperties.iconTop, -100, 200, 50) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-left",
            clampNumberWithFallback(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-top",
            clampNumberWithFallback(airConditionerProperties.mainTextTop, -100, 200, 40) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-left",
            clampNumberWithFallback(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-top",
            clampNumberWithFallback(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-color",
            normalizeCssColor(airConditionerProperties.badgeColor, "#5b5e66"),
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-opacity",
            clampNumberWithFallback(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
          ));
        const airConditionerIconColor = normalizeCssColor(
          isClimatePowered
            ? airConditionerProperties.iconOnColor
            : airConditionerProperties.iconOffColor,
          isClimatePowered ? "#73c8ff" : "#9aa5ad",
        );
        (airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor),
          airConditionerElement.style.setProperty(
            "--climate-icon-glow-size",
            7 * contentUnitHeight + "px",
          ));
        const badgeSizePx = clampNumberWithFallback(airConditionerProperties.badgeSize, 1, 100, 28),
          symbolSizePx = clampNumberWithFallback(airConditionerProperties.symbolSize, 1, 100, 14);
        if (airConditionerProperties.iconVisible !== false) {
          const iconBadgeElement = document.createElement("span");
          ((iconBadgeElement.className = "hb-air-conditioner-icon-badge"),
            (iconBadgeElement.style.width = badgeSizePx * contentUnitHeight + "px"),
            (iconBadgeElement.style.height = badgeSizePx * contentUnitHeight + "px"));
          const configuredIconName = String(airConditionerProperties.icon || ""),
            resolvedIconName =
              airConditionerDeviceType === "bath-heater" &&
              (!configuredIconName || configuredIconName === "mdi:air-conditioner")
                ? climateDefaultIcon(airConditionerDeviceType)
                : configuredIconName || climateDefaultIcon(airConditionerDeviceType),
            resolvedIconUrl = resolveMdiIconUrl(resolvedIconName);
          if (resolvedIconUrl) {
            const airConditionerIconElement = document.createElement("i");
            airConditionerIconElement.className = "hb-air-conditioner-icon";
            const iconScalePercent = clampNumberWithFallback((symbolSizePx / badgeSizePx) * 100, 1, 100, 50);
            ((airConditionerIconElement.style.width = iconScalePercent + "%"),
              (airConditionerIconElement.style.height = iconScalePercent + "%"),
              (airConditionerIconElement.style.backgroundColor = airConditionerIconColor),
              airConditionerIconElement.style.setProperty(
                "mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              airConditionerIconElement.style.setProperty(
                "-webkit-mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              iconBadgeElement.append(airConditionerIconElement));
          }
          airConditionerElement.append(iconBadgeElement);
        }
        const airConditionerTextElement = document.createElement("span");
        airConditionerTextElement.className = "hb-air-conditioner-text";
        const mainTextSizePx = clampNumberWithFallback(airConditionerProperties.mainSize, 6, 120, 21),
          airConditionerMainTextElement = document.createElement("strong");
        ((airConditionerMainTextElement.textContent =
          String(airConditionerProperties.mainText || "").trim() ||
          String(
            airConditionerEntityState?.attributes?.friendly_name ||
              airConditionerEntityId ||
              (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体"),
          )),
          (airConditionerMainTextElement.style.color = normalizeCssColor(
            airConditionerProperties.mainColor,
            "#c7c8cb",
          )),
          (airConditionerMainTextElement.style.fontSize = mainTextSizePx * contentUnitHeight + "px"),
          (airConditionerMainTextElement.style.letterSpacing =
            clampNumberWithFallback(airConditionerProperties.mainSpacing, -20, 100, 0.5) * contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerMainTextElement,
            airConditionerProperties.mainWeight,
            mainTextSizePx,
          ));
        const secondaryTextSizePx = clampNumberWithFallback(airConditionerProperties.secondarySize, 5, 80, 12),
          airConditionerSecondaryTextElement = document.createElement("small");
        return (
          (airConditionerSecondaryTextElement.textContent = airConditionerEntityId
            ? formatClimateStateLabel(airConditionerComponent, airConditionerRenderEnvironment)
            : "未选择实体"),
          (airConditionerSecondaryTextElement.style.color = normalizeCssColor(
            airConditionerProperties.secondaryColor,
            "#75777d",
          )),
          (airConditionerSecondaryTextElement.style.fontSize =
            secondaryTextSizePx * contentUnitHeight + "px"),
          (airConditionerSecondaryTextElement.style.letterSpacing =
            clampNumberWithFallback(airConditionerProperties.secondarySpacing, -20, 100, 0.3) *
              contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerSecondaryTextElement,
            airConditionerProperties.secondaryWeight,
            secondaryTextSizePx,
          ),
          airConditionerProperties.mainTextVisible !== false &&
            airConditionerTextElement.append(airConditionerMainTextElement),
          airConditionerProperties.secondaryTextVisible !== false &&
            airConditionerTextElement.append(airConditionerSecondaryTextElement),
          airConditionerTextElement.childElementCount &&
            airConditionerElement.append(airConditionerTextElement),
          airConditionerElement
        );
      },
    }));
  (registerComponent("camera", {
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
  }),
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
    }),
    registerComponent("time", {
      render(timeComponent: any, timeRenderEnvironment: any) {
        const timeProperties = timeComponent.properties || {},
          timeFontSize = clampNumberWithFallback(timeProperties.fontSize, 12, 500, 96),
          timeComponentElement = document.createElement("time");
        ((timeComponentElement.className = "hb-time-component"),
          (timeComponentElement.style.color = normalizeCssColor(timeProperties.color, "#248eb2")),
          (timeComponentElement.style.fontSize = timeFontSize + "px"),
          (timeComponentElement.style.letterSpacing =
            clampNumberWithFallback(timeProperties.letterSpacing, -20, 100, 2.2) + "px"),
          (timeComponentElement.style.opacity = String(
            clampNumberWithFallback(timeProperties.opacity, 0, 1, 1),
          )));
        const timeValueElement = document.createElement("span");
        ((timeValueElement.className = "hb-time-value"),
          applyTextOutline(timeValueElement, timeProperties.fontWeight, timeFontSize));
        const timePeriodElement = document.createElement("small");
        ((timePeriodElement.className = "hb-time-period"),
          applyTextOutline(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5),
          timeComponentElement.append(timeValueElement, timePeriodElement));
        const updateClockDisplay = () => {
          const currentDate = new Date(),
            formattedTime = formatLocalTime(timeProperties, currentDate);
          ((timeComponentElement.dateTime = currentDate.toISOString()),
            (timeValueElement.textContent = formattedTime.value),
            (timePeriodElement.textContent = formattedTime.suffix),
            (timePeriodElement.hidden = !formattedTime.suffix));
        };
        updateClockDisplay();
        const clockTimerId = window.setInterval(
          updateClockDisplay,
          timeProperties.showSeconds === true ? 250 : 1000,
        );
        return (
          timeRenderEnvironment.cleanup(() => window.clearInterval(clockTimerId)),
          timeComponentElement
        );
      },
    }),
    registerComponent("date", {
      render(dateComponent: any, dateRenderEnvironment: any) {
        const dateProperties = dateComponent.properties || {},
          dateComponentElement = document.createElement("div");
        ((dateComponentElement.className = "hb-date-component"),
          (dateComponentElement.style.opacity = String(clampNumberWithFallback(dateProperties.opacity, 0, 1, 1))),
          (dateComponentElement.style.gap = clampNumberWithFallback(dateProperties.lineGap, 0, 200, 8) + "px"));
        const datePrimaryElement = document.createElement("strong");
        ((datePrimaryElement.className = "hb-date-primary"),
          (datePrimaryElement.style.color = normalizeCssColor(
            dateProperties.primaryColor,
            "#8d9296",
          )));
        const primaryFontSize = clampNumberWithFallback(dateProperties.primarySize, 12, 500, 36);
        ((datePrimaryElement.style.fontSize = primaryFontSize + "px"),
          applyTextOutline(datePrimaryElement, dateProperties.primaryWeight, primaryFontSize),
          (datePrimaryElement.style.letterSpacing =
            clampNumberWithFallback(dateProperties.primarySpacing, -20, 100, 1) + "px"),
          dateComponentElement.append(datePrimaryElement));
        let lunarElement: any = null;
        if (dateProperties.showLunar === true) {
          ((lunarElement = document.createElement("small")),
            (lunarElement.className = "hb-date-lunar"),
            (lunarElement.style.color = normalizeCssColor(dateProperties.lunarColor, "#7f878c")));
          const lunarFontSize = clampNumberWithFallback(dateProperties.lunarSize, 10, 500, 24);
          ((lunarElement.style.fontSize = lunarFontSize + "px"),
            applyTextOutline(lunarElement, dateProperties.lunarWeight, lunarFontSize),
            (lunarElement.style.letterSpacing =
              clampNumberWithFallback(dateProperties.lunarSpacing, -20, 100, 1) + "px"),
            dateComponentElement.append(lunarElement));
        }
        const updateDateDisplay = () => {
          const nowDate = new Date();
          ((datePrimaryElement.textContent = formatLocalDate(dateProperties, nowDate)),
            lunarElement && (lunarElement.textContent = formatLunarDate(nowDate)));
        };
        updateDateDisplay();
        const dateTimerId = window.setInterval(updateDateDisplay, 30000);
        return (
          dateRenderEnvironment.cleanup(() => window.clearInterval(dateTimerId)),
          dateComponentElement
        );
      },
    }),
    registerComponent("weather", {
      render(weatherComponent: any, weatherRenderEnvironment: any) {
        const weatherProperties = weatherComponent.properties || {},
          weatherEntityId = weatherComponent.bindings?.entity?.entityId || "",
          sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun",
          weatherEntityState = weatherRenderEnvironment.states.get(weatherEntityId),
          sunEntityState = weatherRenderEnvironment.states.get(sunEntityId)?.state || "",
          weatherAttributes = weatherEntityState?.attributes || {},
          [weatherIconSlug, weatherConditionLabel] = weatherVisual(
            weatherEntityState?.state,
            sunEntityState,
          ),
          weatherComponentElement = document.createElement("div");
        if (
          ((weatherComponentElement.className = "hb-weather-component"),
          (weatherComponentElement.style.gap =
            clampNumberWithFallback(weatherProperties.iconGap, 0, 300, 22) + "px"),
          (weatherComponentElement.style.opacity = String(
            clampNumberWithFallback(weatherProperties.opacity, 0, 1, 1),
          )),
          weatherProperties.iconVisible !== false)
        ) {
          const weatherIconElement = document.createElement("img");
          ((weatherIconElement.className = "hb-weather-icon"),
            (weatherIconElement.src = meteoconUrl(weatherIconSlug)),
            (weatherIconElement.alt = weatherConditionLabel),
            (weatherIconElement.draggable = false),
            (weatherIconElement.style.width =
              clampNumberWithFallback(weatherProperties.iconSize, 12, 500, 64) + "px"),
            (weatherIconElement.style.height =
              clampNumberWithFallback(weatherProperties.iconSize, 12, 500, 64) + "px"),
            weatherComponentElement.append(weatherIconElement));
        }
        const weatherContentElement = document.createElement("span");
        if (
          ((weatherContentElement.className = "hb-weather-content"),
          (weatherContentElement.style.gap =
            clampNumberWithFallback(weatherProperties.lineGap, 0, 200, 7) + "px"),
          weatherProperties.temperatureVisible !== false)
        ) {
          const temperatureElement = document.createElement("strong"),
            temperatureValue = Number(weatherAttributes.temperature),
            temperatureUnit = String(
              weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C",
            );
          ((temperatureElement.textContent = Number.isFinite(temperatureValue)
            ? "" + temperatureValue + temperatureUnit
            : "--" + temperatureUnit),
            (temperatureElement.style.color = normalizeCssColor(
              weatherProperties.temperatureColor,
              "#aeb3b7",
            )));
          const temperatureFontSize = clampNumberWithFallback(weatherProperties.temperatureSize, 12, 500, 32);
          ((temperatureElement.style.fontSize = temperatureFontSize + "px"),
            applyTextOutline(
              temperatureElement,
              weatherProperties.temperatureWeight,
              temperatureFontSize,
            ),
            (temperatureElement.style.letterSpacing =
              clampNumberWithFallback(weatherProperties.temperatureSpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(temperatureElement));
        }
        if (
          weatherProperties.conditionVisible !== false ||
          weatherProperties.humidityVisible !== false
        ) {
          const weatherDetailElement = document.createElement("small"),
            weatherDetailParts: any[] = [];
          weatherProperties.conditionVisible !== false &&
            weatherDetailParts.push(weatherConditionLabel);
          const humidityValue = Number(weatherAttributes.humidity);
          (weatherProperties.humidityVisible !== false &&
            weatherDetailParts.push(
              Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --",
            ),
            (weatherDetailElement.textContent = weatherDetailParts.join(" · ")),
            (weatherDetailElement.style.color = normalizeCssColor(
              weatherProperties.secondaryColor,
              "#8d9296",
            )));
          const weatherDetailFontSize = clampNumberWithFallback(weatherProperties.secondarySize, 10, 500, 18);
          ((weatherDetailElement.style.fontSize = weatherDetailFontSize + "px"),
            applyTextOutline(
              weatherDetailElement,
              weatherProperties.secondaryWeight,
              weatherDetailFontSize,
            ),
            (weatherDetailElement.style.letterSpacing =
              clampNumberWithFallback(weatherProperties.secondarySpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(weatherDetailElement));
        }
        return (
          weatherContentElement.childElementCount &&
            weatherComponentElement.append(weatherContentElement),
          weatherComponentElement
        );
      },
    }),
    registerComponent("line-chart", {
      render(lineChartComponent: any, lineChartRenderEnvironment: any) {
        const lineChartProperties = lineChartComponent.properties || {},
          lineChartEntityId = lineChartComponent.bindings?.entity?.entityId || "",
          lineChartEntityState = lineChartRenderEnvironment.states.get(lineChartEntityId),
          lineChartUnit = String(lineChartEntityState?.attributes?.unit_of_measurement || ""),
          lineChartStateValue = Number.parseFloat(lineChartEntityState?.state),
          historySeries = buildHistorySeries(
            lineChartRenderEnvironment,
            lineChartEntityId,
            lineChartStateValue,
            lineChartProperties.hours,
          ),
          resolvedThresholdList = resolvedThresholds(
            lineChartProperties.thresholds,
            historySeries,
            lineChartProperties.thresholdMode,
          ),
          lineChartComponentElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
        ((lineChartComponentElement.className = "hb-line-chart-component"),
          (lineChartComponentElement.style.borderRadius =
            clampNumberWithFallback(lineChartProperties.cornerRadius, 0, 50, 10) + "%"));
        const lineChartValueElement = document.createElement("span");
        ((lineChartValueElement.className = "hb-line-chart-value"),
          (lineChartValueElement.hidden = lineChartProperties.valueVisible === false),
          (lineChartValueElement.style.color = normalizeCssColor(
            lineChartProperties.valueColor,
            "#dce1e5",
          )),
          (lineChartValueElement.style.fontSize =
            Math.max(
              10,
              (Number(lineChartComponent.position?.height || 300) *
                0.12 *
                clampNumberWithFallback(lineChartProperties.valueScale, 10, 500, 100)) /
                100,
            ) + "px"),
          (lineChartValueElement.style.left =
            95 + clampNumberWithFallback(lineChartProperties.valueOffsetX, -100, 100, 0) + "%"),
          (lineChartValueElement.style.top =
            8 + clampNumberWithFallback(lineChartProperties.valueOffsetY, -100, 100, 0) + "%"));
        const stateValueElement = document.createElement("strong");
        stateValueElement.textContent = formatLineChartValue(
          lineChartStateValue,
          lineChartProperties.statePrecision,
        );
        const stateUnitElement = document.createElement("small");
        ((stateUnitElement.textContent = lineChartUnit),
          lineChartValueElement.append(stateValueElement, stateUnitElement),
          lineChartComponentElement.append(lineChartValueElement),
          (lineChartComponentElement.syncLineChartState = (syncedEntityState) => {
            const syncedStateValue = Number.parseFloat(syncedEntityState?.state);
            ((stateValueElement.textContent = formatLineChartValue(
              syncedStateValue,
              lineChartProperties.statePrecision,
            )),
              (stateUnitElement.textContent = String(
                syncedEntityState?.attributes?.unit_of_measurement || "",
              )),
              lineChartComponentElement.style.setProperty(
                "--hb-chart-current-color",
                Number.isFinite(syncedStateValue)
                  ? thresholdColor(resolvedThresholdList, syncedStateValue)
                  : "#68cc3e",
              ));
          }));
        const lineChartSvgElement = appendSvgElement(lineChartComponentElement, "svg", {
          viewBox: "0 0 100 70",
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        });
        if ((lineChartSvgElement.classList.add("hb-line-chart-graph"), historySeries.length)) {
          const chartGeometry = lineChartGeometry(historySeries),
            {
              minimum: minimumValue,
              maximum: maximumValue,
              span: valueSpan,
              points: chartPoints,
            } = chartGeometry,
            chartPathDefinition = smoothChartPath(chartPoints),
            lineChartGradientId =
              (lineChartRenderEnvironment.renderNamespace || "renderer") +
              "-chart-" +
              String(lineChartComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
            chartDefsElement = appendSvgElement(lineChartSvgElement, "defs"),
            gradientElement = appendSvgElement(chartDefsElement, "linearGradient", {
              id: lineChartGradientId + "-line",
              gradientUnits: "userSpaceOnUse",
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 70,
            }),
            thresholdEntries = resolvedThresholdList.length
              ? resolvedThresholdList
              : [
                  {
                    value: minimumValue,
                    color: "#68cc3e",
                  },
                ];
          for (const thresholdEntry of [...thresholdEntries].sort(
            (leftThreshold, rightThreshold) => rightThreshold.value - leftThreshold.value,
          ))
            appendSvgElement(gradientElement, "stop", {
              offset:
                clampNumberWithFallback(((maximumValue - thresholdEntry.value) / valueSpan) * 100, 0, 100, 0) +
                "%",
              "stop-color": thresholdEntry.color,
            });
          if (
            (appendSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition + " L100 70 L0 70 Z",
              fill: "url(#" + lineChartGradientId + "-line)",
              opacity: 0.18,
            }),
            appendSvgElement(lineChartSvgElement, "path", {
              d: chartPathDefinition,
              fill: "none",
              stroke: "url(#" + lineChartGradientId + "-line)",
              "stroke-width": 1.6,
              "vector-effect": "non-scaling-stroke",
            }),
            !lineChartRenderEnvironment.editable)
          ) {
            const hoverLayerElement = document.createElement("span");
            ((hoverLayerElement.className = "hb-line-chart-hover-layer"),
              lineChartComponentElement.append(hoverLayerElement));
            const chartHoverOverlayElement = createHoverLineChart(
              hoverLayerElement,
              lineChartComponentElement,
              chartGeometry,
              lineChartUnit,
              (chartPoint: any) => ({
                x: chartPoint.x,
                y: (chartPoint.y / 70) * 100,
              }),
              lineChartProperties.statePrecision,
            );
            lineChartRenderEnvironment.cleanup?.(chartHoverOverlayElement);
          }
        } else lineChartComponentElement.classList.add("history-loading");
        return (
          lineChartComponentElement.style.setProperty(
            "--hb-chart-current-color",
            Number.isFinite(lineChartStateValue)
              ? thresholdColor(resolvedThresholdList, lineChartStateValue)
              : "#68cc3e",
          ),
          lineChartComponentElement
        );
      },
    }));
  registerPanelFrameComponent(registerComponent);
  (registerComponent("navigation-button", {
    render: navigationComponentRenderer,
  }),
    registerComponent("scene-mode", {
      render(sceneModeComponent: any, sceneModeRenderEnvironment: any) {
        const sceneModeElement = document.createElement("button");
        ((sceneModeElement.type = "button"),
          (sceneModeElement.className = "hb-scene-mode"),
          sceneModeElement.setAttribute(
            "aria-label",
            sceneModeComponent.properties?.mainText || "情景模式",
          ));
        const navigationButtonViewElement = navigationComponentRenderer(
          {
            ...sceneModeComponent,
            actions: {} as Record<string, any>,
            bindings: {} as Record<string, any>,
            properties: {
              ...sceneModeComponent.properties,
              targetPage: "",
              frameVisible: false,
              glowVisible: false,
            },
          },
          {
            ...sceneModeRenderEnvironment,
            editable: true,
            previewState: "off",
          },
        );
        return (
          sceneModeElement.append(navigationButtonViewElement),
          bindSceneMode(
            sceneModeElement,
            navigationButtonViewElement,
            sceneModeComponent,
            sceneModeRenderEnvironment,
          ),
          sceneModeElement
        );
      },
    }),
    registerComponent("percentage-bar", {
      render: renderPercentageBarControl,
    }));
}
