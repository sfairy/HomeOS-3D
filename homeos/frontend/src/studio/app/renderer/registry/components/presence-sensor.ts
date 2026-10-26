/** 人在传感器渲染器（从 register-all 拆出，按组件族懒加载）。 */
import { clampNumberWithFallback, normalizeCssColor } from "../_shared";
import {
  presenceAnimationPhase,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from "../../controls/presence-runtime";
import {
  createDoorWindowSensorView,
  createWaterLeakSensorView,
  createSmokeSensorView,
  createNaturalGasSensorView,
} from "../sensor-views";
import { componentContentUnitsPx } from "../content-units";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("presence-sensor", {
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
  });
}

export default register;
