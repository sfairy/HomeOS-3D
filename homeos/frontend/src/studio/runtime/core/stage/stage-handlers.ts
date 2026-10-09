/** mountStage handler clusters — wired via explicit host from stage.ts */
import { bathHeaterState as bathHeaterState2 } from "../../bath-heater/bath-heater";
import { purifierState as purifierState2 } from "../../purifier/purifier-state";
import { carState as carState2 } from "../../vehicle/car-state";
import { speakerState as speakerState2 } from "../../speaker/speaker-state";
import { lockState as lockState2 } from "../../security/lock-state";
import { vacuumQuip as vacuumQuip2, vacuumBirdCamera as vacuumBirdCamera2 } from "../../vacuum/vacuum-motion";
import { vacuumStatusPresentation as vacuumStatusPresentation2 } from "../../vacuum/vacuum-map";
import { televisionState as televisionState2 } from "../../television/television-state";
import { deviceStatus as deviceStatus2 } from "../../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../../device/generic-device-catalog";
import { nasDeviceState as nasDeviceState2 } from "../../nas/nas-status";
import { coverState as coverState2, coverIconIsOn as coverIconIsOn2 } from "../../cover/cover-state";
import { climateState as climateState2 } from "../../climate/climate-state";
import {
  lightPresetEntries,
  resolveMarkerIconSize,
  configuredModuleKinds,
  createStageElement,
  lampIconSvgMarkup,
  postHostMessage,
} from "./_shared";
import { buildMetadata } from "./build-metadata";
import { buildFloorCameraConfig as buildFloorCameraConfigExternal } from "./floor-camera-config";
import {
  temperatureHumidityReading as readTemperatureHumidity,
  temperatureHumidityEntities,
  DEFAULT_LABEL_SIZE as defaultLabelSize,
  DEFAULT_LABEL_ICON_SIZE as defaultLabelIconSize,
  MAX_LABEL_SIZE as maxLabelSize,
  MAX_LABEL_ICON_SIZE as maxLabelIconSize,
  MIN_LABEL_SIZE as minLabelSize,
  MIN_LABEL_ICON_SIZE as minLabelIconSize,
} from "@app/bridge/temperature-humidity";
import { createMarkerTouch, nearestMarkerTarget } from "../marker-input";
import { buttonIconSize as resolveButtonIconSize } from "@app/bridge/button-icon-size";
import { CARD_TEXT_SIZE_PX as cardTextSizePx } from "@app/bridge/card-text-size";
import { withRegionLightingPreset as applyRegionLightingPreset } from "@app/bridge/region-lighting-presets";
import {
  securityAlarmReadings,
  overlayEligibleAlarms,
  securityAlarmReading,
  renderSecurityAlarmCard,
} from "../../security/security-alarm";
import { updateCarCard as updateCarCard2 } from "../../vehicle/car-card";
import { cameraOnline as cameraOnline2 } from "../../camera/camera-status";
import { backgroundOpacity as labelBackgroundOpacity } from "../label-appearance";
import {
  ENVIRONMENT_METRICS as environmentMetricNames,
  layoutEnvironmentReadings,
} from "@app/bridge/temperature-humidity";
import { DEFAULT_BUTTON_SIZE as defaultButtonSize } from "@app/bridge/button-icon-size";

export interface StageHandlersHost {
  [key: string]: any;
}


export function createUpdateDevicePanel(host: StageHandlersHost) {
  return function updateDevicePanel() {
    host.lightPanelSection.classList.toggle("is-airer-panel", !!host.getFocusedEntry()?.airer);
    const panelItem = host.getFocusedEntry();
    if (!(panelItem?.deviceKind === "lock")) host.lockPanel.hide();
    else {
      host.lockPanel.root.hidden = false;
      for (const panelRootElement of [
        host.lightPanelHeader,
        host.lightControlsElement,
        host.controlErrorElement,
        host.climatePanel.root,
        host.coverPanel.root,
        host.coverGroupPanel.root,
        host.nasPanel.root,
        host.televisionPanel.root,
        host.speakerPanel.root,
        host.devicePanel.root,
      ])
        panelRootElement.hidden = true;
      (host.lightPanelSection.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "is-nas-panel",
        "is-television-panel",
        "has-light-controls",
      ),
        host.lightPanelSection.setAttribute("aria-label", "门"),
        host.lockPanel.update({
          item: panelItem,
          states: host.deviceStates,
          editing: host.isEditing || !host.isControlReady || !panelItem.modelAvailable,
        }));
      return;
    }
    const isCurtainGroupKind = panelItem?.isCurtainGroup === true;
    if (
      (typeof host.coverGroupPanel < "u" && (host.coverGroupPanel.root.hidden = !isCurtainGroupKind),
      host.lightPanelSection.classList.toggle("is-cover-group-panel", isCurtainGroupKind),
      host.lightPanelSection.classList.toggle(
        "is-cover-group-vertical",
        isCurtainGroupKind && panelItem.panelLayout === "vertical",
      ),
      !isCurtainGroupKind && typeof host.coverGroupPanel < "u" && host.coverGroupPanel.deactivate(),
      ["vacuum", "presence", "camera"].includes(panelItem?.deviceKind))
    ) {
      (host.lightPanelSection.classList.remove("is-open"), host.lightPanelSection.setAttribute("inert", ""));
      return;
    }
    const isGenericDevice = isGenericDeviceKind2(panelItem?.deviceKind);
    typeof host.devicePanel < "u" && (host.devicePanel.root.hidden = !isGenericDevice);
    const isSpeakerDevice = panelItem?.deviceKind === "speaker";
    !isSpeakerDevice || !host.lightPanelSection.classList.contains("is-open")
      ? host.speakerPanel.hide()
      : (host.speakerPanel.root.hidden = false);
    const isNasDevice = panelItem?.deviceKind === "nas",
      isTelevisionDevice = panelItem?.deviceKind === "television";
    if (
      (!isTelevisionDevice || !host.lightPanelSection.classList.contains("is-open")
        ? host.televisionPanel.hide()
        : (host.televisionPanel.root.hidden = false),
      (host.nasPanel.root.hidden = !isNasDevice),
      host.lightPanelSection.classList.toggle("is-nas-panel", isNasDevice),
      host.lightPanelSection.classList.toggle(
        "is-television-panel",
        isTelevisionDevice || isSpeakerDevice,
      ),
      isNasDevice || isTelevisionDevice || isSpeakerDevice || isGenericDevice)
    ) {
      (host.lightPanelSection.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "has-light-controls",
        "has-error",
      ),
        host.lightPanelSection.classList.toggle("is-climate-panel", isGenericDevice),
        host.lightPanelSection.setAttribute(
          "aria-label",
          isGenericDevice
            ? (panelItem.deviceLabel ||
                genericDeviceProfile2(panelItem.deviceKind)?.label ||
                "设备") + "控制"
            : isSpeakerDevice
              ? "智能音响控制"
              : isTelevisionDevice
                ? "电视状态"
                : "NAS 状态",
        ),
        panelItem.clickAction === "focus" &&
          !host.isEditing &&
          (host.lightPanelSection.classList.remove("is-open"),
          host.lightPanelSection.setAttribute("inert", "")),
        (host.climatePanel.root.hidden =
          host.coverPanel.root.hidden =
          host.lightPanelHeader.hidden =
          host.lightControlsElement.hidden =
          host.controlErrorElement.hidden =
            true),
        isSpeakerDevice
          ? (host.isEditing || panelItem.clickAction !== "focus") &&
            host.lightPanelSection.classList.contains("is-open") &&
            host.speakerPanel.update({
              item: panelItem,
              states: host.deviceStates,
              editing: host.isEditing || !host.isControlReady || !panelItem.modelAvailable,
            })
          : isTelevisionDevice
            ? (host.isEditing || panelItem.clickAction !== "focus") &&
              host.lightPanelSection.classList.contains("is-open") &&
              host.televisionPanel.update({
                item: panelItem,
                states: host.deviceStates,
                editing: host.isEditing || !host.isControlReady,
              })
            : isGenericDevice && typeof host.devicePanel < "u"
              ? host.devicePanel.update({
                  item: panelItem,
                  states: host.deviceStates,
                  editing: host.isEditing || !host.isControlReady || !panelItem.modelAvailable,
                })
              : host.nasPanel.update({
                  item: panelItem,
                  states: host.deviceStates,
                }));
      return;
    }
    const isCoverDevice = panelItem?.deviceKind === "cover",
      isClimateDevice = !!panelItem?.modelId && !isCoverDevice;
    if (
      ((host.climatePanel.root.hidden = !isClimateDevice),
      (host.coverPanel.root.hidden = !isCoverDevice || isCurtainGroupKind),
      typeof host.coverGroupPanel < "u" && (host.coverGroupPanel.root.hidden = !isCurtainGroupKind),
      (host.lightPanelHeader.hidden =
        host.lightControlsElement.hidden =
        host.controlErrorElement.hidden =
          isClimateDevice || isCoverDevice),
      host.lightPanelSection.classList.toggle("is-cover-panel", isCoverDevice),
      host.lightPanelSection.classList.toggle("is-climate-panel", isClimateDevice),
      host.lightPanelSection.setAttribute(
        "aria-label",
        isCoverDevice
          ? panelItem.airer
            ? "晾衣架控制"
            : "窗帘控制"
          : isClimateDevice
            ? panelItem.waterHeater
              ? "热水器控制"
              : panelItem.pedestalFan
                ? "电风扇控制"
                : panelItem.airPurifier
                  ? "空气净化器控制"
                  : "空调控制"
            : "灯光控制",
      ),
      !panelItem)
    )
      return host.exitFocusMode();
    if (isCoverDevice) {
      if (
        (host.lightPanelSection.classList.remove("has-light-controls", "has-error"), isCurtainGroupKind)
      ) {
        const coverStatesById = Object.fromEntries(
            panelItem.memberItems.map((coverMemberEntry: any) => [
              coverMemberEntry.id,
              coverState2(
                coverMemberEntry.entityId,
                (host.deviceStates as any)[coverMemberEntry.entityId],
                coverMemberEntry,
              ),
            ]),
          ),
          coverPresentationsById = Object.fromEntries(
            panelItem.memberItems.map((presentationMemberEntry: any) => [
              presentationMemberEntry.id,
              host.readCoverFeedback(
                presentationMemberEntry,
                coverStatesById[presentationMemberEntry.id],
              ),
            ]),
          );
        typeof host.coverGroupPanel < "u" &&
          host.coverGroupPanel.update({
            item: panelItem,
            states: coverStatesById,
            presentations: coverPresentationsById,
            editing: host.isEditing || !host.isControlReady,
            errors: Object.fromEntries(
              panelItem.memberItems.map((errorMemberEntry: any) => [
                errorMemberEntry.id,
                errorMemberEntry.modelAvailable
                  ? coverPresentationsById[errorMemberEntry.id]?.error || ""
                  : "窗帘模型已移除，请重新配置。",
              ]),
            ),
          });
      } else {
        const coverState = coverState2(
          panelItem.entityId,
          (host.deviceStates as any)[panelItem.entityId],
          panelItem,
        );
        panelItem.modelAvailable || (coverState.available = false);
        const coverPresentation = host.readCoverFeedback(panelItem, coverState);
        host.coverPanel.update({
          item: panelItem,
          state: coverState,
          states: host.deviceStates,
          presentation: coverPresentation,
          editing: host.isEditing || !host.isControlReady,
          error: panelItem.modelAvailable
            ? coverPresentation.error || ""
            : "窗帘模型已移除，请重新配置。",
        });
      }
      return;
    }
    if (isClimateDevice) {
      host.lightPanelSection.classList.remove("has-light-controls", "has-error");
      const climateState = climateState2(panelItem.entityId, (host.deviceStates as any)[panelItem.entityId]);
      (panelItem.modelAvailable || (climateState.available = false),
        host.climatePanel.update({
          item: panelItem,
          state: climateState,
          states: host.deviceStates,
          editing: host.isEditing || !host.isControlReady || !panelItem.modelAvailable,
          error: panelItem.modelAvailable ? "" : "设备模型已移除，请重新配置。",
        }));
      return;
    }
    const panelLightState = host.resolveLightState(panelItem);
    ((host.lightTitleElement.textContent = panelItem.label || panelLightState.name),
      (host.deviceStatusElement.textContent = panelItem.entityId
        ? panelLightState.available
          ? panelLightState.on
            ? "已开启"
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备"),
      (host.lightTitleElement.title = host.lightTitleElement.textContent),
      (host.controlErrorElement.title = host.controlErrorElement.textContent),
      host.updateLampButton(panelLightState),
      host.deviceStatusElement.classList.toggle(
        "is-on",
        panelLightState.available && panelLightState.on,
      ));
    const some2 = [...host.lightGroupByKey.values()].some(
      (pendingLightCommand) => pendingLightCommand.entityId === panelItem.entityId,
    );
    (host.lightPanelSection.classList.toggle(
      "is-command-pending",
      some2 && panelLightState.available && !host.isEditing,
    ),
      host.lightPanelSection.setAttribute("aria-busy", String(some2)));
    const colorSupported =
        panelLightState.brightnessSupported ||
        panelLightState.temperatureSupported ||
        panelLightState.colorSupported,
      colorModeName =
        panelLightState.colorMode === "white"
          ? "white"
          : panelLightState.colorMode === "color_temp" && panelLightState.temperatureSupported
            ? "temperature"
            : panelLightState.colorSupported
              ? "color"
              : "temperature",
      lightModeOptions = {
        color: panelLightState.colorSupported,
        temperature: panelLightState.temperatureSupported,
        white: panelLightState.colorModes?.includes("white"),
      };
    (host.lightModeMenu.update({
      modes: lightModeOptions,
      value: colorModeName,
      disabled: host.isEditing || !panelLightState.available,
      entity: panelItem.entityId,
    }),
      host.lightColorPicker.update({
        entityId: panelItem.entityId,
        hs: panelLightState.colorHs,
        visible: panelLightState.colorSupported && colorModeName === "color",
        enabled: !host.isEditing && panelLightState.available,
      }),
      host.lightPanelSection.classList.toggle("has-light-controls", colorSupported),
      host.lightPanelSection.classList.toggle(
        "has-color-controls",
        panelLightState.colorSupported && colorModeName === "color",
      ),
      host.lightPanelSection.classList.toggle("has-error", !!host.controlErrorElement.textContent),
      (host.isEditing || !panelLightState.available || !panelLightState.on) &&
        host.restoreFocusWithin(host.lightControlsElement, host.lightPanelSection),
      colorSupported
        ? host.lightControlsElement.removeAttribute("inert")
        : (host.restoreFocusWithin(host.lightControlsElement, host.lightPanelSection),
          host.lightControlsElement.setAttribute("inert", "")),
      host.lightControlsElement.removeAttribute("aria-hidden"),
      (host.powerButton.disabled = host.isEditing || !panelLightState.available),
      (host.brightnessSlider.input.min = 0),
      (host.brightnessSlider.input.max = 100),
      (host.temperatureSlider.input.min = panelLightState.minimum),
      (host.temperatureSlider.input.max = panelLightState.maximum));
    for (const [lightSliderControl, isSliderEnabled, sliderValue, sliderUnitSuffix] of [
      [host.brightnessSlider, panelLightState.brightnessSupported, panelLightState.brightness, "%"],
      [
        host.temperatureSlider,
        panelLightState.temperatureSupported && colorModeName === "temperature",
        panelLightState.kelvin,
        " K",
      ],
    ])
      ((lightSliderControl.root.hidden = !isSliderEnabled),
        (lightSliderControl.input.disabled = host.isEditing || !panelLightState.available),
        lightSliderControl === host.brightnessSlider &&
          !panelLightState.on &&
          isSliderEnabled &&
          (lightSliderControl.input.value = "0"),
        document.activeElement !== lightSliderControl.input &&
          ((lightSliderControl.input.value =
            sliderValue ??
            (lightSliderControl === host.brightnessSlider ? 100 : panelLightState.minimum)),
          (lightSliderControl.value.value =
            sliderValue === null ? "—" : "" + sliderValue + sliderUnitSuffix)),
        lightSliderControl.syncProgress?.());
    host.lightPresetsElement.hidden =
      panelLightState.colorSupported ||
      (!panelLightState.brightnessSupported && !panelLightState.temperatureSupported);
    for (const lightPreset of host.lightPresetRecords) {
      const round = Math.round(
          panelLightState.minimum +
            ((panelLightState.maximum - panelLightState.minimum) * lightPreset.temperaturePercent) /
              100,
        ),
        isPresetActive =
          panelLightState.on &&
          (!panelLightState.brightnessSupported ||
            Math.abs(panelLightState.brightness - lightPreset.brightness) <= 4) &&
          (!panelLightState.temperatureSupported ||
            Math.abs(panelLightState.kelvin - round) <=
              Math.max(50, (panelLightState.maximum - panelLightState.minimum) * 0.06));
      ((lightPreset.button.disabled =
        host.isEditing || !panelLightState.available || host.lightPresetsElement.hidden),
        lightPreset.button.classList.toggle("is-active", isPresetActive),
        lightPreset.button.setAttribute("aria-pressed", String(isPresetActive)),
        (lightPreset.detail.textContent = panelLightState.brightnessSupported
          ? lightPreset.brightness + "%"
          : "开启"));
    }
  }
}

export function createRenderMarkerPositions(host: StageHandlersHost) {
  return function renderMarkerPositions(isForced = false) {
    if (host.isRangeEditorOpen || host.isCameraMoving || host.isControlBusy) return;
    ((host.mountOptions.floorTransitionActive || host.cameraMotionSnapshot) && host.screenOutlines.pause(),
      host.screenOutlines.update(),
      host.editorSelectionOutlines.update());
    const isConcealGraceElapsed =
      host.lastInteractionMs !== null && performance.now() - host.lastInteractionMs >= 240;
    if (isConcealGraceElapsed && !host.vacuumWorkingLayerElement.childElementCount) {
      host.lastRenderSignature = "";
      return;
    }
    (host.mountOptions.camera.updateMatrixWorld(),
      (host.cachedDocumentSource !== host.mountOptions.document ||
        host.cachedDocumentFloorId !== host.selectedFloorId) &&
        (host.sceneCacheByKey.clear(),
        (host.cachedDocumentSource = host.mountOptions.document),
        (host.cachedDocumentFloorId = host.selectedFloorId)));
    const renderCanvasRect = host.containerViewportSize || host.element.getBoundingClientRect(),
      width4 = (host.hasStageRect() && host.mediaViewportSize?.width) || renderCanvasRect.width,
      height3 = (host.hasStageRect() && host.mediaViewportSize?.height) || renderCanvasRect.height;
    if (host.outgoingGhostAnimation && host.mountOptions.presentationPoint)
      for (const outgoingMarker of host.outgoingGhostAnimation.outgoing) {
        if (!outgoingMarker.node) continue;
        const presentationPoint = host.mountOptions.presentationPoint(
          outgoingMarker.floorId,
          outgoingMarker.x,
          outgoingMarker.y,
          outgoingMarker.height,
        );
        if (!presentationPoint) {
          outgoingMarker.node.hidden = true;
          continue;
        }
        const project = presentationPoint.project(host.mountOptions.camera);
        ((outgoingMarker.node.hidden =
          project.z < -1 ||
          project.z > 1 ||
          Math.abs(project.x) > 1.05 ||
          Math.abs(project.y) > 1.05),
          (outgoingMarker.node.style.left = ((project.x + 1) * width4) / 2 + "px"),
          (outgoingMarker.node.style.top = ((1 - project.y) * height3) / 2 + "px"));
      }
    const isUniformOverviewStack =
        host.selectedFloorId === "all" && host.mountOptions.document.uniformOverviewStack === true,
      renderSignature =
        width4 +
        ":" +
        height3 +
        ":" +
        isUniformOverviewStack +
        ":" +
        host.mountOptions.camera.matrixWorld.elements +
        ":" +
        host.mountOptions.camera.projectionMatrix.elements;
    if (!(
      isForced !== true &&
      !host.mountOptions.floorTransitionActive &&
      renderSignature === host.lastRenderSignature
    )) {
      host.lastRenderSignature = renderSignature;
      for (const layoutMarkerItem of host.currentModuleBindings()) {
        const layoutMarkerSnapshot =
            host.activePointerDrag?.id === layoutMarkerItem.id
              ? {
                  ...layoutMarkerItem,
                  ...host.activePointerDrag.point,
                }
              : layoutMarkerItem,
          layoutMarkerId = layoutMarkerSnapshot.id,
          layoutMarkerElement = host.map.get(layoutMarkerId);
        if (
          !layoutMarkerElement ||
          (isConcealGraceElapsed && layoutMarkerElement.parentElement === host.markerLayerElement)
        )
          continue;
        const isMarkerVisible =
          (host.isEditing || layoutMarkerSnapshot.deviceKind !== "presence") &&
          (host.isEditing || layoutMarkerSnapshot.visible !== false) &&
          (host.isEditing || layoutMarkerSnapshot.buttonHidden !== true) &&
          layoutMarkerSnapshot.modelAvailable !== false &&
          (host.selectedFloorId === "all" || layoutMarkerSnapshot.floorId === host.selectedFloorId);
        let cachedWorldPoint = host.sceneCacheByKey.get(layoutMarkerId);
        isMarkerVisible &&
          (!cachedWorldPoint ||
            cachedWorldPoint.floorId !== layoutMarkerSnapshot.floorId ||
            cachedWorldPoint.x !== layoutMarkerSnapshot.x ||
            cachedWorldPoint.y !== layoutMarkerSnapshot.y ||
            cachedWorldPoint.height !== layoutMarkerSnapshot.height) &&
          ((cachedWorldPoint = {
            floorId: layoutMarkerSnapshot.floorId,
            x: layoutMarkerSnapshot.x,
            y: layoutMarkerSnapshot.y,
            height: layoutMarkerSnapshot.height,
            point: host.mountOptions.worldPoint(
              layoutMarkerSnapshot.floorId,
              layoutMarkerSnapshot.x,
              layoutMarkerSnapshot.y,
              layoutMarkerSnapshot.height,
            ),
          }),
          host.sceneCacheByKey.set(layoutMarkerId, cachedWorldPoint));
        const presentationPoint2 =
          isMarkerVisible &&
          ((host.mountOptions.floorTransitionActive || isUniformOverviewStack) &&
          host.mountOptions.presentationPoint
            ? host.mountOptions.presentationPoint(
                layoutMarkerSnapshot.floorId,
                layoutMarkerSnapshot.x,
                layoutMarkerSnapshot.y,
                layoutMarkerSnapshot.height,
              )
            : cachedWorldPoint?.point);
        if (!presentationPoint2) {
          layoutMarkerElement.hidden = true;
          continue;
        }
        const project2 = host.scratchVector.copy(presentationPoint2).project(host.mountOptions.camera);
        ((layoutMarkerElement.hidden =
          project2.z < -1 ||
          project2.z > 1 ||
          Math.abs(project2.x) > 1.05 ||
          Math.abs(project2.y) > 1.05),
          (layoutMarkerElement.style.left = ((project2.x + 1) * width4) / 2 + "px"),
          (layoutMarkerElement.style.top = ((1 - project2.y) * height3) / 2 + "px"));
      }
    }
  }
}

export function createPickMarkerAtPoint(host: StageHandlersHost) {
  return function pickMarkerAtPoint(pickPointerEvent: any, fallbackMarkerId: any) {
    if (host.isEditing) return fallbackMarkerId;
    const hitCandidates: any[] = [];
    for (const [candidateMarkerId, candidateMarkerElement] of host.map) {
      if (
        candidateMarkerElement.hidden ||
        candidateMarkerElement.disabled ||
        candidateMarkerElement.closest("[inert]")
      )
        continue;
      const computedStyle2 = getComputedStyle(candidateMarkerElement);
      if (computedStyle2.pointerEvents === "none" || computedStyle2.visibility === "hidden")
        continue;
      const candidateMarkerRect = candidateMarkerElement.getBoundingClientRect();
      candidateMarkerRect.width > 0 &&
        candidateMarkerRect.height > 0 &&
        hitCandidates.push({
          id: candidateMarkerId,
          rect: candidateMarkerRect,
          width:
            ((parseFloat(candidateMarkerElement.style.width) ||
              candidateMarkerElement.offsetWidth) *
              candidateMarkerRect.width) /
            candidateMarkerElement.offsetWidth,
          height:
            ((parseFloat(candidateMarkerElement.style.height) ||
              candidateMarkerElement.offsetHeight) *
              candidateMarkerRect.height) /
            candidateMarkerElement.offsetHeight,
        });
    }
    return (
      nearestMarkerTarget(hitCandidates, pickPointerEvent.clientX, pickPointerEvent.clientY) ||
      fallbackMarkerId
    );
  }
}

export function createSyncMarkers(host: StageHandlersHost) {
  return function syncMarkers(markerChange: any = null) {
    if (host.isCameraMoving) return;
    (markerChange ||
      (host.stateUpdatePlanner.invalidate(), host.stageModelIndex.invalidate()),
      host.wakeSceneBackground(),
      host.markerLayerElement.classList.toggle("is-editing", host.isEditing));
    const syncMarkerItems = host.currentModuleBindings().filter(
        (filteredMarkerItem: any) => host.isEditing || filteredMarkerItem.deviceKind !== "presence",
      ),
      visibleMarkerIdSet = new Set(
        syncMarkerItems.map((visibleMarkerItem: any) => visibleMarkerItem.id),
      );
    let hasMarkerChange = false;
    for (const [existingMarkerId, existingMarkerElement] of host.map)
      visibleMarkerIdSet.has(existingMarkerId) ||
        (existingMarkerElement.remove(),
        host.map.delete(existingMarkerId),
        host.sceneCacheByKey.delete(existingMarkerId),
        (hasMarkerChange = true));
    for (const syncMarkerItem of syncMarkerItems) {
      let syncMarkerElement = host.map.get(syncMarkerItem.id);
      if (syncMarkerElement && markerChange && !markerChange.affects(syncMarkerItem)) continue;
      if (((hasMarkerChange = true), !syncMarkerElement)) {
        ((syncMarkerElement = createStageElement(
          syncMarkerItem.passiveSensor ||
            syncMarkerItem.securityAlarm ||
            ["temperature-humidity", "smallcar", "lock"].includes(syncMarkerItem.deviceKind)
            ? "div"
            : "button",
          "i3d-marker",
        )),
          (syncMarkerElement.type = "button"));
        const ms2 = createMarkerTouch((markerHitEvent: any) =>
          host.pickMarkerAtPoint(markerHitEvent, syncMarkerItem.id),
        );
        (syncMarkerElement.addEventListener("pointerdown", (dragDownEvent: any) => {
          host.isEditing || ms2.down(dragDownEvent);
        }),
          syncMarkerElement.addEventListener("pointermove", (dragMoveEvent: any) =>
            ms2.move(dragMoveEvent),
          ),
          syncMarkerElement.addEventListener("pointerup", (dragUpEvent: any) => ms2.up(dragUpEvent)),
          syncMarkerElement.addEventListener("pointercancel", () => ms2.cancel()),
          syncMarkerElement.addEventListener("click", (markerClickEvent: any) => {
            if (
              (markerClickEvent.stopPropagation(),
              host.findBindingById(syncMarkerItem.id)?.passiveSensor ||
                host.isCameraMoving ||
                host.isAwaitingFloorViewAdjust ||
                host.panelDisplayMode === "edit" ||
                (!host.isEditing && host.findBindingById(syncMarkerItem.id)?.buttonHidden === true))
            )
              return;
            if (syncMarkerElement.dataset.dragged === "true") {
              syncMarkerElement.dataset.dragged = "";
              return;
            }
            const clickedMarkerId =
                !host.isEditing && markerClickEvent.detail > 0
                  ? host.pickMarkerAtPoint(markerClickEvent, syncMarkerItem.id)
                  : syncMarkerItem.id,
              target = host.isEditing
                ? syncMarkerItem.id
                : ms2.target(markerClickEvent, clickedMarkerId);
            target && host.activateMarker(target, true);
          }),
          syncMarkerElement.addEventListener("pointerdown", (markerDragEvent: any) =>
            host.beginMarkerDrag(markerDragEvent, syncMarkerItem.id),
          ),
          syncMarkerElement.addEventListener("pointermove", host.moveMarkerDrag),
          syncMarkerElement.addEventListener("pointerup", host.endMarkerDrag),
          syncMarkerElement.addEventListener("pointercancel", host.cancelMarkerDrag),
          host.markerLayerElement.append(syncMarkerElement),
          host.map.set(syncMarkerItem.id, syncMarkerElement));
      }
      const icon2 = /^mdi:[a-z0-9-]+$/.test(syncMarkerItem.icon || "") ? syncMarkerItem.icon : "",
        isVacuumDevice = syncMarkerItem.deviceKind === "vacuum",
        isVacuumRoomDevice = syncMarkerItem.deviceKind === "vacuum-room";
      if (syncMarkerItem.isCurtainGroup) {
        const memberIconList = syncMarkerItem.memberItems.map((memberIconItem: any) =>
            /^mdi:[a-z0-9-]+$/.test(memberIconItem.icon || "")
              ? memberIconItem.icon
              : "mdi:curtains",
          ),
          join = memberIconList.join("|");
        syncMarkerElement.dataset.groupIcons !== join &&
          ((syncMarkerElement.dataset.groupIcons = join),
          syncMarkerElement.replaceChildren(
            ...memberIconList.map((memberIconName: any) => {
              const groupIconElement = createStageElement(
                  "span",
                  "i3d-marker-icon i3d-curtain-group-icon",
                ),
                groupIconMaskUrl =
                  'url("/static/vendor/mdi/7.4.47/svg/' + memberIconName.slice(4) + '.svg")';
              return (
                groupIconElement.style.setProperty("mask-image", groupIconMaskUrl),
                groupIconElement.style.setProperty("-webkit-mask-image", groupIconMaskUrl),
                groupIconElement
              );
            }),
          ));
      } else {
        if (
          !isVacuumDevice &&
          !syncMarkerItem.securityAlarm &&
          syncMarkerItem.deviceKind !== "smallcar" &&
          syncMarkerItem.deviceKind !== "temperature-humidity" &&
          syncMarkerElement.dataset.icon !== icon2
        ) {
          if (((syncMarkerElement.dataset.icon = icon2), icon2)) {
            const markerIconElement = createStageElement("span", "i3d-marker-icon");
            markerIconElement.setAttribute("aria-hidden", "true");
            const markerIconMaskUrl =
              'url("/static/vendor/mdi/7.4.47/svg/' + icon2.slice(4) + '.svg")';
            (markerIconElement.style.setProperty("mask-image", markerIconMaskUrl),
              markerIconElement.style.setProperty("-webkit-mask-image", markerIconMaskUrl),
              syncMarkerElement.replaceChildren(markerIconElement));
          } else syncMarkerElement.innerHTML = lampIconSvgMarkup;
        }
      }
      const markerPresentationState = syncMarkerItem.isCurtainGroup
          ? {
              available: syncMarkerItem.memberItems.some(
                (coverAvailabilityMember: any) =>
                  coverState2(
                    coverAvailabilityMember.entityId,
                    (host.deviceStates as any)[coverAvailabilityMember.entityId],
                    coverAvailabilityMember,
                  ).available,
              ),
              on: syncMarkerItem.memberItems.some((coverIconMember: any) =>
                coverIconIsOn2(
                  coverIconMember,
                  coverState2(
                    coverIconMember.entityId,
                    (host.deviceStates as any)[coverIconMember.entityId],
                    coverIconMember,
                  ),
                ),
              ),
            }
          : syncMarkerItem.deviceKind === "temperature-humidity"
            ? {
                available: temperatureHumidityEntities([syncMarkerItem]).some(
                  ({ entityId: humidityEntityId }) =>
                    readTemperatureHumidity(host.deviceStates[humidityEntityId]).available,
                ),
                on: false,
              }
            : syncMarkerItem.deviceKind?.startsWith("vacuum")
              ? {
                  available: !!(
                    (host.deviceStates as any)[syncMarkerItem.entityId] &&
                    !["unknown", "unavailable"].includes(
                      (host.deviceStates as any)[syncMarkerItem.entityId].state,
                    )
                  ),
                  on: (host.deviceStates as any)[syncMarkerItem.entityId]?.state === "cleaning",
                }
              : syncMarkerItem.deviceKind === "lock"
                ? (() => {
                    const lockState = lockState2(syncMarkerItem, host.deviceStates);
                    return {
                      available: lockState.available,
                      on: lockState.state === "unlocked" || lockState.state === "open",
                      name: syncMarkerItem.label || "门",
                      lock: lockState,
                    };
                  })()
                : syncMarkerItem.deviceKind === "speaker"
                  ? speakerState2(syncMarkerItem, host.deviceStates)
                  : syncMarkerItem.deviceKind === "television"
                    ? televisionState2(syncMarkerItem, host.deviceStates)
                    : syncMarkerItem.deviceKind === "smallcar"
                      ? carState2(syncMarkerItem, host.deviceStates)
                      : isGenericDeviceKind2(syncMarkerItem.deviceKind)
                        ? deviceStatus2(syncMarkerItem, host.deviceStates)
                        : syncMarkerItem.deviceKind === "nas"
                          ? nasDeviceState2(syncMarkerItem, host.deviceStates)
                          : syncMarkerItem.deviceKind === "cover"
                            ? coverState2(
                                syncMarkerItem.entityId,
                                (host.deviceStates as any)[syncMarkerItem.entityId],
                                syncMarkerItem,
                              )
                            : syncMarkerItem.modelId
                              ? syncMarkerItem.waterHeater && !syncMarkerItem.entityId
                                ? deviceStatus2(syncMarkerItem, host.deviceStates)
                                : syncMarkerItem.airPurifier
                                  ? purifierState2(syncMarkerItem, host.deviceStates)
                                  : syncMarkerItem.climateType === "bath-heater"
                                    ? bathHeaterState2(syncMarkerItem, host.deviceStates)
                                    : climateState2(
                                        syncMarkerItem.entityId,
                                        (host.deviceStates as any)[syncMarkerItem.entityId],
                                      )
                              : host.readLightState(syncMarkerItem.entityId),
        size =
          Number.isFinite(syncMarkerItem.size) && syncMarkerItem.size > 0
            ? syncMarkerItem.size
            : defaultButtonSize,
        iconSize = resolveMarkerIconSize(syncMarkerItem, size, isVacuumDevice, resolveButtonIconSize),
        hitSize =
          Number.isFinite(syncMarkerItem.hitSize) && syncMarkerItem.hitSize > 0
            ? syncMarkerItem.hitSize
            : Math.max(defaultButtonSize, size),
        scaleXFactor = 1,
        scaleYFactor = 1,
        baseScaleFactor = scaleXFactor,
        scaledSizeX = size * scaleXFactor,
        scaledSizeY = size * scaleYFactor,
        scaledIconSizeX = iconSize * scaleXFactor,
        scaledIconSizeY = iconSize * scaleYFactor,
        scaledHitSizeX = hitSize * scaleXFactor,
        scaledHitSizeY = hitSize * scaleYFactor;
      if (
        ((syncMarkerElement.style.width = scaledHitSizeX + "px"),
        (syncMarkerElement.style.height = scaledHitSizeY + "px"),
        syncMarkerItem.isCurtainGroup &&
          ((syncMarkerElement.style.width =
            Math.max(
              scaledHitSizeX,
              scaledSizeX * 2 + 4 * scaleXFactor,
              scaledIconSizeX * 2 + 12 * scaleXFactor,
            ) + "px"),
          (syncMarkerElement.style.height =
            Math.max(scaledHitSizeY, scaledSizeY, scaledIconSizeY + 8 * scaleYFactor) + "px")),
        syncMarkerElement.classList.toggle("is-vacuum-status", isVacuumDevice),
        syncMarkerElement.classList.toggle(
          "is-curtain-group",
          syncMarkerItem.isCurtainGroup === true,
        ),
        syncMarkerElement.classList.toggle(
          "is-overview-quip",
          syncMarkerItem.overviewQuip === true,
        ),
        (syncMarkerElement.style.pointerEvents =
          syncMarkerItem.overviewQuip ||
          (syncMarkerItem.passiveSensor && syncMarkerItem.deviceKind !== "temperature-humidity")
            ? "none"
            : ""),
        syncMarkerElement.classList.toggle(
          "is-presence-wave",
          syncMarkerItem.passiveSensor === true &&
            syncMarkerItem.deviceKind !== "temperature-humidity",
        ),
        syncMarkerElement.classList.toggle(
          "is-security-label",
          syncMarkerItem.deviceKind === "lock" ||
            syncMarkerItem.deviceKind === "camera" ||
            syncMarkerItem.deviceKind === "presence",
        ),
        syncMarkerElement.classList.toggle("is-lock-label", syncMarkerItem.deviceKind === "lock"),
        syncMarkerElement.classList.toggle(
          "is-temperature-humidity",
          syncMarkerItem.deviceKind === "temperature-humidity",
        ),
        syncMarkerElement.classList.toggle(
          "is-editable-temperature-humidity",
          syncMarkerItem.deviceKind === "temperature-humidity" && host.isEditing,
        ),
        syncMarkerItem.deviceKind === "temperature-humidity")
      ) {
        let selector = syncMarkerElement.querySelector(".i3d-temperature-humidity-card");
        if (!selector) {
          selector = createStageElement("span", "i3d-temperature-humidity-card");
          const environmentHeaderElement = createStageElement("span", "i3d-environment-header"),
            batteryRowElement = createStageElement("span", "i3d-environment-battery"),
            batteryIconElement = createStageElement("i", "i3d-meter-icon");
          batteryIconElement.setAttribute("aria-hidden", "true");
          const batteryIconMaskUrl = "url('/static/vendor/mdi/7.4.47/svg/battery.svg')";
          (batteryIconElement.style.setProperty("mask-image", batteryIconMaskUrl),
            batteryIconElement.style.setProperty("-webkit-mask-image", batteryIconMaskUrl),
            batteryRowElement.append(
              batteryIconElement,
              createStageElement("span", "i3d-meter-label", "电量"),
              createStageElement("span", "i3d-meter-number"),
            ),
            environmentHeaderElement.append(
              createStageElement("strong", "i3d-temperature-humidity-title"),
              batteryRowElement,
            ),
            selector.append(
              environmentHeaderElement,
              createStageElement("span", "i3d-temperature-humidity-values"),
            ));
          for (const {
            key: metricKey,
            label: metricLabelText,
            icon: metricIconName,
          } of environmentMetricNames) {
            const metricReadingElement = createStageElement(
                "span",
                "i3d-meter-reading is-" + metricKey,
              ),
              metricReadingIconElement = createStageElement("i", "i3d-meter-icon");
            metricReadingIconElement.setAttribute("aria-hidden", "true");
            const metricIconMaskUrl =
              "url('/static/vendor/mdi/7.4.47/svg/" + metricIconName + ".svg')";
            (metricReadingIconElement.style.setProperty("mask-image", metricIconMaskUrl),
              metricReadingIconElement.style.setProperty("-webkit-mask-image", metricIconMaskUrl),
              metricReadingElement.setAttribute("aria-label", metricLabelText),
              (metricReadingElement.title = metricLabelText),
              metricReadingElement.append(
                metricReadingIconElement,
                createStageElement("span", "i3d-meter-label", metricLabelText),
                createStageElement("span", "i3d-meter-number"),
                createStageElement("span", "i3d-meter-unit"),
              ),
              selector.lastElementChild.append(metricReadingElement));
          }
          syncMarkerElement.replaceChildren(selector);
        }
        const humidityTitleElement = selector.querySelector(".i3d-temperature-humidity-title");
        ((humidityTitleElement.textContent = syncMarkerItem.label ?? "环境标签"),
          (humidityTitleElement.hidden = !humidityTitleElement.textContent));
        const isMetricNamesVisible = syncMarkerItem.showMetricNames !== false;
        selector.classList.toggle("is-metric-names-hidden", !isMetricNamesVisible);
        const batteryPanelElement = selector.querySelector(".i3d-environment-battery"),
          ar2 = readTemperatureHumidity((host.deviceStates as any)[syncMarkerItem.batteryEntityId]);
        ((batteryPanelElement.hidden = !syncMarkerItem.batteryEntityId),
          (batteryPanelElement.querySelector(".i3d-meter-label").hidden = !isMetricNamesVisible),
          batteryPanelElement.classList.toggle("is-unavailable", !ar2.available));
        const batteryValueText = "" + ar2.value + (ar2.available ? ar2.unit || "%" : "");
        ((batteryPanelElement.querySelector(".i3d-meter-number").textContent = batteryValueText),
          batteryPanelElement.setAttribute("aria-label", "电量 " + batteryValueText),
          (selector.querySelector(".i3d-environment-header").hidden =
            humidityTitleElement.hidden && batteryPanelElement.hidden));
        const some5 = environmentMetricNames.some(
          ({ key: metricEntitySuffix }) => syncMarkerItem[metricEntitySuffix + "EntityId"],
        );
        selector.querySelector(".i3d-temperature-humidity-values").hidden = !some5;
        for (const { key: metricLoopKey } of environmentMetricNames) {
          const metricEntityId = syncMarkerItem[metricLoopKey + "EntityId"],
            ar3 = readTemperatureHumidity((host.deviceStates as any)[metricEntityId]),
            metricRowElement = selector.querySelector(".is-" + metricLoopKey);
          ((metricRowElement.hidden = !metricEntityId),
            (metricRowElement.querySelector(".i3d-meter-label").hidden = !isMetricNamesVisible),
            metricRowElement.classList.toggle("is-unavailable", !ar3.available),
            (metricRowElement.querySelector(".i3d-meter-number").textContent = ar3.value));
          const metricUnitElement = metricRowElement.querySelector(".i3d-meter-unit");
          ((metricUnitElement.textContent = ar3.unit), (metricUnitElement.hidden = !ar3.unit));
        }


        const min = Math.min(
          maxLabelSize,
          Math.max(minLabelSize, Number(syncMarkerItem.size) || defaultLabelSize),
        );
        ((selector.style.fontSize =
          Math.min(
            maxLabelIconSize,
            Math.max(minLabelIconSize, Number(syncMarkerItem.iconSize) || defaultLabelIconSize),
          ) + "px"),
          selector.style.setProperty(
            "--meter-background-opacity",
            String(
              Number.isFinite(syncMarkerItem.opacity)
                ? Math.min(1, Math.max(0, syncMarkerItem.opacity))
                : 1,
            ),
          ),
          (selector.style.width = min + "px"),
          layoutEnvironmentReadings(selector, syncMarkerItem.columns),
          (selector.style.transformOrigin = "top left"),
          (selector.style.transform = "scale(" + scaleXFactor + ", " + scaleYFactor + ")"),
          (syncMarkerElement.style.width =
            Math.min(
              maxLabelSize,
              Math.max(minLabelSize, Number(syncMarkerItem.size) || defaultLabelSize),
            ) *
            scaleXFactor +
            "px"),
          (syncMarkerElement.style.height =
            Math.max(44, selector.offsetHeight || 48) * scaleYFactor + "px"),
          syncMarkerElement.setAttribute("role", host.isEditing ? "button" : "group"),
          host.isEditing
            ? syncMarkerElement.setAttribute("tabindex", "0")
            : syncMarkerElement.removeAttribute("tabindex"));
      }
      if (
        (syncMarkerElement.classList.toggle(
          "is-car-status",
          syncMarkerItem.deviceKind === "smallcar",
        ),
        syncMarkerItem.deviceKind === "smallcar" &&
          (updateCarCard2(syncMarkerElement, syncMarkerItem, host.deviceStates),
          (syncMarkerElement.style.pointerEvents = host.isEditing ? "" : "none"),
          syncMarkerElement.setAttribute("role", host.isEditing ? "button" : "group"),
          host.isEditing
            ? syncMarkerElement.setAttribute("tabindex", "0")
            : syncMarkerElement.removeAttribute("tabindex")),
        isVacuumDevice)
      ) {
        syncMarkerElement.style.setProperty(
          "--label-background-opacity",
          String(labelBackgroundOpacity(syncMarkerItem.backgroundOpacity)),
        );
        let vacuumStatusElement = syncMarkerElement.querySelector(".i3d-vacuum-status");
        (!vacuumStatusElement ||
          vacuumStatusElement.dataset.compact !== String(syncMarkerItem.overviewQuip === true)) &&
          ((vacuumStatusElement = createStageElement("span", "i3d-vacuum-status")),
          (vacuumStatusElement.dataset.compact = String(syncMarkerItem.overviewQuip === true)),
          syncMarkerItem.overviewQuip ||
            (vacuumStatusElement.append(
              createStageElement("strong", "i3d-vacuum-status-name"),
              createStageElement("span", "i3d-vacuum-status-detail"),
            ),
            vacuumStatusElement.lastElementChild.append(
              createStageElement("span", "i3d-vacuum-status-text"),
              createStageElement("span", "i3d-vacuum-status-battery"),
            )),
          vacuumStatusElement.append(createStageElement("span", "i3d-vacuum-quip")),
          syncMarkerItem.overviewQuip &&
            (Object.assign(vacuumStatusElement.style, {
              opacity: ".55",
              pointerEvents: "none",
              background: "none",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
              webkitBackdropFilter: "none",
            }),
            (vacuumStatusElement.lastElementChild.style.pointerEvents = "none")),
          syncMarkerElement.replaceChildren(vacuumStatusElement));
        const vacuumPresentation = vacuumStatusPresentation2(syncMarkerItem, host.deviceStates),
          vacuumScaleX = scaledSizeX / 44,
          vacuumScaleY = scaledSizeY / 44;
        syncMarkerItem.overviewQuip ||
          ((vacuumStatusElement.querySelector(".i3d-vacuum-status-name").textContent =
            syncMarkerItem.label || "扫地机器人"),
          (vacuumStatusElement.querySelector(".i3d-vacuum-status-text").textContent =
            vacuumPresentation.status),
          (vacuumStatusElement.querySelector(".i3d-vacuum-status-battery").textContent =
            vacuumPresentation.battery));
        const vacuumQuipElement = vacuumStatusElement.querySelector(".i3d-vacuum-quip");
        ((vacuumQuipElement.textContent = vacuumPresentation.active
          ? vacuumQuip2(syncMarkerItem, host.deviceStates, performance.now())
          : ""),
          (vacuumQuipElement.hidden = !vacuumQuipElement.textContent),
          (vacuumStatusElement.style.transform =
            "translate(-50%,-50%) scale(" + vacuumScaleX + "," + vacuumScaleY + ")"),
          (vacuumStatusElement.style.fontSize = Math.max(8, iconSize / 2) + "px"));
        const vacuumCardHeight = Math.max(
          syncMarkerItem.overviewQuip ? 28 : 50,
          vacuumStatusElement.offsetHeight,
        );
        ((syncMarkerElement.style.width = Math.max(scaledHitSizeX, 140 * vacuumScaleX) + "px"),
          (syncMarkerElement.style.height =
            Math.max(scaledHitSizeY, vacuumCardHeight * vacuumScaleY) + "px"),
          (syncMarkerElement.dataset.status = vacuumPresentation.status),
          (syncMarkerElement.title =
            (syncMarkerItem.label || "扫地机器人") +
            " · " +
            vacuumPresentation.status +
            " · " +
            vacuumPresentation.battery),
          (markerPresentationState.on = vacuumPresentation.active),
          (markerPresentationState.available = vacuumPresentation.available));
      }
      if (syncMarkerItem.securityAlarm) {
        const alarmReading = securityAlarmReading(syncMarkerItem, host.deviceStates);
        (syncMarkerElement.classList.toggle("is-alarm-card", true),
          syncMarkerElement.classList.toggle("is-editable-alarm-card", host.isEditing),
          (syncMarkerElement.style.pointerEvents = host.isEditing ? "auto" : "none"),
          renderSecurityAlarmCard(syncMarkerElement, syncMarkerItem, host.deviceStates),
          (markerPresentationState.available =
            alarmReading.available || alarmReading.status === "unbound"),
          (markerPresentationState.on = alarmReading.on),
          (syncMarkerElement.title = alarmReading.label + " · " + alarmReading.detail));
      }
      if (
        syncMarkerItem.deviceKind === "lock" ||
        syncMarkerItem.deviceKind === "camera" ||
        syncMarkerItem.deviceKind === "presence"
      ) {
        const securityDeviceState =
            (host.deviceStates as any)[syncMarkerItem.entityId]?.newState ||
            (host.deviceStates as any)[syncMarkerItem.entityId],
          lock = syncMarkerItem.deviceKind === "lock" ? markerPresentationState.lock : null,
          available2 =
            syncMarkerItem.deviceKind === "lock"
              ? lock.available
              : syncMarkerItem.deviceKind === "camera"
                ? cameraOnline2(securityDeviceState)
                : securityDeviceState?.available !== false &&
                  !!securityDeviceState?.state &&
                  !["unknown", "unavailable"].includes(securityDeviceState.state);
        if (
          ((markerPresentationState.available = available2),
          (markerPresentationState.on =
            syncMarkerItem.deviceKind === "lock"
              ? lock.state === "unlocked" || lock.state === "open"
              : syncMarkerItem.deviceKind === "camera"
                ? securityDeviceState?.state === "recording"
                : securityDeviceState?.state === "on"),
          syncMarkerItem.passiveSensor)
        )
          (syncMarkerElement.querySelector(".i3d-sensor-wave") ||
            syncMarkerElement.replaceChildren(
              ...[0, 1, 2].map(() => createStageElement("span", "i3d-sensor-wave")),
            ),
            (syncMarkerElement.hidden = !available2),
            syncMarkerElement.setAttribute("aria-hidden", "true"),
            syncMarkerElement.classList.toggle("is-inactive", !available2));
        else {
          const isPresenceChoice = syncMarkerItem.deviceKind === "presence" && host.isEditing;
          syncMarkerElement.classList.toggle("is-sensor-choice", isPresenceChoice);
          let securityLabelElement = syncMarkerElement.querySelector(".i3d-security-label");
          (securityLabelElement ||
            ((securityLabelElement = createStageElement("span", "i3d-security-label")),
            securityLabelElement.append(createStageElement("strong"), createStageElement("span")),
            syncMarkerElement.append(securityLabelElement)),
            (securityLabelElement.children[0].textContent =
              syncMarkerItem.label ||
              (syncMarkerItem.deviceKind === "lock"
                ? "门"
                : syncMarkerItem.deviceKind === "camera"
                  ? "摄像头"
                  : "人体传感器")));
          const entityId3 =
            syncMarkerItem.deviceKind === "lock" &&
            (syncMarkerItem.doorEntityId ||
              syncMarkerItem.doorEventEntityId ||
              syncMarkerItem.doorOpenEntityId ||
              syncMarkerItem.doorCloseEntityId ||
              syncMarkerItem.batteryEntityId ||
              syncMarkerItem.entityId);
          if (
            ((securityLabelElement.children[1].textContent =
              host.isEditing &&
              !(syncMarkerItem.deviceKind === "lock" ? entityId3 : syncMarkerItem.entityId)
                ? "未绑定实体"
                : available2
                  ? syncMarkerItem.deviceKind === "lock"
                    ? "" +


                      (lock.doorOpenLabel ||
                        (lock.doorOpen === true
                          ? "门已打开"
                          : lock.doorOpen === false
                            ? "门已关闭"
                            : "门状态未知")) +
                      (syncMarkerItem.batteryEntityId && lock.battery !== "—"
                        ? " · " + lock.battery
                        : "")
                    : syncMarkerItem.deviceKind === "presence"
                      ? securityDeviceState.state === "on"
                        ? "有人"
                        : "检测中"
                      : "在线"
                  : "离线"),
            (securityLabelElement.children[1].hidden = isPresenceChoice),
            securityLabelElement.classList.toggle(
              "is-camera-status",
              syncMarkerItem.deviceKind === "camera",
            ),
            securityLabelElement.classList.toggle(
              "is-lock-status",
              syncMarkerItem.deviceKind === "lock",
            ),
            securityLabelElement.classList.toggle("is-camera-offline", !available2),
            (securityLabelElement.hidden = !host.isLockLabelShown(syncMarkerItem, lock)),
            (securityLabelElement.style.fontSize = (syncMarkerItem.fontSize || cardTextSizePx) + "px"),
            securityLabelElement.style.setProperty(
              "--label-background-opacity",
              String(labelBackgroundOpacity(syncMarkerItem.backgroundOpacity)),
            ),
            syncMarkerItem.deviceKind === "camera" || syncMarkerItem.deviceKind === "lock")
          ) {
            const securityMarkerIconElement = syncMarkerElement.querySelector(".i3d-marker-icon");
            (securityMarkerIconElement &&
              securityMarkerIconElement.parentNode !== securityLabelElement &&
              securityLabelElement.append(securityMarkerIconElement),
              securityLabelElement.style.setProperty("--i3d-marker-icon-size", iconSize + "px"));
          }
          (syncMarkerElement.style.setProperty("--i3d-security-scale", String(scaledSizeX / 44)),
            syncMarkerElement.style.setProperty("--i3d-security-scale-y", String(scaledSizeY / 44)),
            (syncMarkerElement.style.width =
              Math.max(
                scaledHitSizeX,
                ((syncMarkerItem.deviceKind === "camera"
                  ? securityLabelElement.offsetWidth || 0
                  : isPresenceChoice
                    ? 120
                    : 180) *
                  scaledSizeX) /
                  44,
              ) + "px"),
            (syncMarkerElement.style.height =
              Math.max(
                scaledHitSizeY,
                ((syncMarkerItem.deviceKind === "camera"
                  ? securityLabelElement.offsetHeight || 0
                  : isPresenceChoice
                    ? 32
                    : 58) *
                  scaledSizeY) /
                  44,
              ) + "px"));
        }
      }
      if (
        (syncMarkerElement.classList.toggle("i3d-vacuum-room", isVacuumRoomDevice),
        syncMarkerElement.classList.toggle(
          "is-icon-hidden",
          isVacuumRoomDevice && syncMarkerItem.iconHidden === true,
        ),
        isVacuumRoomDevice)
      ) {
        let vacuumRoomLabelElement = syncMarkerElement.querySelector(".i3d-room-label");
        (vacuumRoomLabelElement ||
          ((vacuumRoomLabelElement = createStageElement("span", "i3d-room-label")),
          syncMarkerElement.append(vacuumRoomLabelElement)),
          (vacuumRoomLabelElement.textContent = syncMarkerItem.label || "清扫"),
          (vacuumRoomLabelElement.hidden = syncMarkerItem.labelHidden === true),
          (vacuumRoomLabelElement.style.fontSize =
            (syncMarkerItem.fontSize || cardTextSizePx) * baseScaleFactor + "px"));
      }
      (syncMarkerElement.style.setProperty("--i3d-marker-size", scaledSizeX + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-size-y", scaledSizeY + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-icon-size", scaledIconSizeX + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-icon-size-y", scaledIconSizeY + "px"),
        syncMarkerItem.deviceKind !== "smallcar" &&
          syncMarkerElement.setAttribute(
            "aria-label",
            syncMarkerItem.overviewQuip
              ? vacuumQuip2(syncMarkerItem, host.deviceStates, performance.now())
              : syncMarkerItem.label || markerPresentationState.name || "灯光",
          ),
        !isVacuumDevice &&
          syncMarkerItem.deviceKind !== "smallcar" &&
          (syncMarkerElement.title = syncMarkerItem.label || markerPresentationState.name));
      const playing =
        syncMarkerItem.deviceKind === "speaker"
          ? markerPresentationState.available && markerPresentationState.playing
          : syncMarkerItem.deviceKind === "cover"
            ? coverIconIsOn2(syncMarkerItem, markerPresentationState)
            : markerPresentationState.on;
      (syncMarkerElement.classList.toggle(
        "is-on",
        !isVacuumDevice && syncMarkerItem.deviceKind !== "smallcar" && playing,
      ),
        syncMarkerElement.classList.toggle(
          "is-offline",
          !host.isEditing && !markerPresentationState.available,
        ),
        syncMarkerElement.classList.toggle("is-nas", syncMarkerItem.deviceKind === "nas"),
        syncMarkerElement.classList.toggle("is-selected", host.isEditing && host.text === syncMarkerItem.id));
    }
    // 全屏报警由父页 runtime 挂到 document.body；iframe 内仅保留卡片，避免只盖住 3D 区域。
    host.securityAlarmOverlay.update(
      securityAlarmReadings(
        overlayEligibleAlarms(host.options.security?.alarms || []),
        host.deviceStates,
      ),
      false,
      host.options.sceneStyle === "warm-wood" ? "warm-wood" : "default",
    );
    ((!markerChange || markerChange.lighting) && host.applyLightStates(undefined, markerChange),
      (!markerChange || markerChange.environment) && host.refreshStageUi());
    const isPanelAffected =
      !markerChange || !!(host.focusedItemId && markerChange.affects(host.getFocusedEntry()));
    (isPanelAffected && host.updateDevicePanel(),
      (!markerChange || hasMarkerChange || isPanelAffected) &&
        (host.syncLayoutMetrics(), host.syncStageVisibility(), host.renderMarkerPositions(true)));
  }
}

export function createHandleHostMessage(host: StageHandlersHost) {
  return function handleHostMessage(hostMessageEvent: any) {
    if (
      hostMessageEvent.origin !== location.origin ||
      hostMessageEvent.source !== window.parent ||
      hostMessageEvent.data?.channel !== "hb-i3d-v1"
    )
      return;
    const data = hostMessageEvent.data;
    if ((data.type !== "states" && host.wakeSceneBackground(), data.type === "presentation-layout"))
      Number.isFinite(data.width) &&
        data.width > 0 &&
        Number.isFinite(data.height) &&
        data.height > 0 &&
        ((host.mediaViewportSize = {
          width: data.width,
          height: data.height,
        }),
        host.syncLayoutMetrics());
    else {
      if (data.type === "config") {
        if (host.isCameraMoving) {
          host.pendingEditorAction = hostMessageEvent;
          return;
        }
        ((host.isRangeEditorOnly = data.rangeEditorOnly === true),
          (host.canEditLightRange = data.allowRangeEditing === true || data.editing === true),
          host.isRangeEditorOpen &&
            (!host.canEditLightRange ||
              data.viewEditing === true ||
              data.properties?.lightingMode !== "region" ||
              data.properties?.floorSelection !== host.baseStageConfig.floorSelection ||
              JSON.stringify(data.properties?.camera) !== JSON.stringify(host.baseStageConfig.camera) ||
              JSON.stringify(data.properties?.lightRegionOverrides || {}) !==
                JSON.stringify(host.baseStageConfig.lightRegionOverrides || {})) &&
            host.rangeEditorHandle?.close(),
          (host.hasIdleIconActivity = false),
          host.focusedItemId.startsWith("vacuum:") &&
            JSON.stringify(
              (host.baseStageConfig.devices?.vacuums || []).find(
                (currentVacuumEntry: any) => "vacuum:" + currentVacuumEntry.id === host.focusedItemId,
              ),
            ) !==
              JSON.stringify(
                (data.properties.devices?.vacuums || []).find(
                  (nextVacuumEntry: any) => "vacuum:" + nextVacuumEntry.id === host.focusedItemId,
                ),
              ) &&
            host.exitFocusMode({
              immediate: true,
            }),
          (data.editing ||
            data.viewEditing ||
            host.baseStageConfig.floorSelection !== data.properties.floorSelection ||
            JSON.stringify(host.baseStageConfig.floorCameras) !==
              JSON.stringify(data.properties.floorCameras)) &&
            ((host.pendingFloorId = ""), (host.pendingModule = "")),
          (host.baseStageConfig = structuredClone(data.properties)),
          !host.hasAutoSelectedFloors &&
            !data.editing &&
            !data.viewEditing &&
            ((host.hasAutoSelectedFloors = true),
            host.mountOptions.document.floors.length > 1 && (host.pendingFloorId = "all")),
          host.pendingFloorId &&
            host.pendingFloorId !== "all" &&
            !host.mountOptions.document.floors.some(
              (knownFloorEntry: any) => knownFloorEntry.id === host.pendingFloorId,
            ) &&
            (host.pendingFloorId = ""),
          (data?.editing ||
            data?.viewEditing ||
            (host.baseStageConfig.floorSelection !== host.options.floorSelection && !host.pendingFloorId)) &&
            host.mountOptions.finishFloorTransition?.(),
          host.mountOptions.setFloorGap?.(host.baseStageConfig.floorGap),
          host.mountOptions.setUniformOverviewStack?.(host.baseStageConfig.uniformOverviewStack),
          (data.properties = host.buildFloorCameraConfig({
            ...host.baseStageConfig,
            ...(host.pendingFloorId
              ? {
                  floorSelection: host.pendingFloorId,
                }
              : {}),
          })),
          host.pendingFloorId && host.activeCameraPose
            ? (data.properties.camera = host.activeCameraPose)
            : host.pendingFloorId &&
              host.pendingFloorId !== host.baseStageConfig.floorSelection &&
              (data.properties.camera = host.transformFloorCamera(
                host.baseStageConfig.floorCameras?.[host.pendingFloorId] || null,
                host.pendingFloorId,
              )),
          host.idleRotationControl.activity(),
          host.idleIconVisibilityControl.activity(),
          host.idleFocusExitControl.activity());
        const isCameraChanged =
          (host.isAwaitingFloorViewAdjust && data.viewEditing !== true) ||
          JSON.stringify(host.options.camera) !== JSON.stringify(data.properties.camera);
        (host.panelDisplayMode || host.idleReturnCamera || host.cameraMotionSnapshot) &&
          (isCameraChanged ||
            host.options.sceneStyle !== data.properties.sceneStyle ||
            host.options.wallOpacity !== data.properties.wallOpacity ||
            host.options.floorSelection !== data.properties.floorSelection ||
            host.isEditing !== (data.editing === true) ||
            data.viewEditing === true ||
            (host.isEditing && host.text !== (data.selectedId || ""))) &&
          (host.exitFocusMode({
            immediate: true,
          }),
          host.cameraMotionSnapshot &&
            ((host.cameraMotionSnapshot = null),
            host.mountOptions.finishFloorTransition?.(),
            host.mountOptions.endCameraMotion()));
        const editingSecurityKind =
          data.editing === true &&
          ["camera", "presence", "lock", "moisture", "smoke", "gas"].includes(
            data.editingSecurityKind,
          )
            ? data.editingSecurityKind
            : "";
        ((data.editing !== true ||
          editingSecurityKind !== "lock" ||
          (host.text && host.text !== (data.selectedId || ""))) &&
          (host.selectedLockEntry = null),
          (host.options = structuredClone(data.properties)),
          (host.isEditing = data.editing === true),
          (host.selectedSecurityKind = editingSecurityKind),
          (host.isAwaitingFloorViewAdjust = data.viewEditing === true),
          (host.text = data.selectedId || ""),
          (host.deviceStates = data.states || {}),
          host.syncAirConditionerHistory(),
          (host.isNavigationVisible = data.editorCanvas === true && !host.isEditing),

          (host.navigationEditing = data.navigationEditing === true && host.isNavigationVisible),
          document.body?.dataset &&
            (document.body.dataset.sceneStyle =
              host.options.sceneStyle === "warm-wood" ? "warm-wood" : "default"),
          host.sceneBackgroundController.configure(host.options.backgroundTheme, host.options),
          (host.isControlReady = !host.isEditing && data.interactive === true),
          (host.editingVacuumId = data.editingVacuumId || ""),
          (host.configuredModuleKinds2 = configuredModuleKinds(host.options)));
        let editingModule = host.isEditing
          ? [
              "security",
              "climate",
              "fan",
              "purifier",
              "water-heater",
              "airer",
              "cover",
              "nas",
              "television",
              "speaker",
              "vacuum",
              "vacuum-shortcut",
              "temperature-humidity",
              ...GENERIC_DEVICE_KINDS2,
            ].includes(data.editingModule)
            ? data.editingModule
            : "light"
          : ["overview", "security", "light", "devices", "vacuum"].includes(host.activeModule)
            ? host.activeModule
            : [
                  "nas",
                  "television",
                  "speaker",
                  "water-heater",
                  "airer",
                  ...GENERIC_DEVICE_KINDS2,
                ].includes(host.activeModule)
              ? "devices"
              : "environment";
        (!host.isEditing &&
          editingModule !== "overview" &&
          !host.configuredModuleKinds2.includes(editingModule) &&
          (editingModule = "light"),
          host.pendingModule && !host.configuredModuleKinds2.includes(host.pendingModule) && (host.pendingModule = ""),
          host.activeModule !== editingModule &&
            (host.stopVacuumFollow(),
            host.exitFocusMode({
              immediate: true,
            }),
            host.cancelGhostAnimation(),
            (host.activeModule = editingModule),
            host.sceneCacheByKey.clear()));
        for (const queuedCommandEntry of host.lightGroupByKey.values())
          queuedCommandEntry.next &&
            (!host.isControlReady ||
              !(host.options.lights || []).some(
                (configuredLightItem: any) =>
                  configuredLightItem.entityId === queuedCommandEntry.entityId,
              )) &&
            (host.vector.reject(queuedCommandEntry.entityId, queuedCommandEntry.next.previewToken),
            (queuedCommandEntry.next = null));
        (host.configureIdleBehaviors(),
          host.syncAvailability(),
          host.mountOptions.appearance(
            applyRegionLightingPreset(
              host.isRangeEditorOpen
                ? {
                    ...host.options,
                    lightRegionOverrides: host.mountOptions.regionLighting.getOverrides(),
                  }
                : host.options,
            ),
          ));
        const floorSelection =
          host.mountOptions.document.floors.some(
            (configuredFloorEntry: any) => configuredFloorEntry.id === host.options.floorSelection,
          ) || host.options.floorSelection === "all"
            ? host.options.floorSelection
            : host.mountOptions.document.floors[0].id;
        (host.isEditing || (floorSelection === "all" && (host.activeModule = "overview")),
          host.selectedFloorId !== floorSelection
            ? (host.stopVacuumFollow(false),
              (host.selectedFloorId = floorSelection),
              host.mountOptions.setFloor(floorSelection),
              host.mountOptions.restoreCamera(
                host.normalizeCameraPose(
                  host.options.camera || host.mountOptions.floorDefaultCamera?.(floorSelection),
                ),
              ),
              (host.activeCameraPose = host.mountOptions.cameraState()))
            : isCameraChanged &&
              (host.mountOptions.restoreCamera(host.normalizeCameraPose(host.options.camera || host.activeCameraPose)),
              (host.activeCameraPose = host.mountOptions.cameraState())),
          host.syncCameraInteraction(),
          (host.toolbarElement.hidden = true),
          host.syncPanelChrome(),
          (host.isAwaitingFloorViewAdjust || (!host.isEditing && !host.isControlReady)) &&
            host.exitFocusMode({
              immediate: true,
            }),
          host.syncMarkers());
        const adoptGeneration = ++host.animationFrameRequestId;
        (host.isStagePresented ? Promise.resolve() : host.mountOptions.whenPresented())
          .then(() => {
            host.isControlBusy ||
              adoptGeneration !== host.animationFrameRequestId ||
              (host.isStagePresented || (host.activeCameraPose = host.mountOptions.cameraState()),
              (host.isStagePresented = true),
              host.syncAvailability(),
              host.renderMarkerPositions(true),
              host.noopStageCallback(),
              postHostMessage({
                type: "presented",
                configId: data.configId,
                camera: host.transformFloorCamera(
                  host.mountOptions.cameraState(),
                  host.options.floorSelection,
                  true,
                ),
              }));
          })
          .catch((adoptError: any) => {
            !host.isControlBusy &&
              adoptGeneration === host.animationFrameRequestId &&
              postHostMessage({
                type: "error",
                message: adoptError.message || "户型画面准备失败，请重新载入。",
              });
          });
      } else {
        if (data.type === "vacuum-room-result") {
          (clearTimeout(host.vacuumOverlayByKey.get(data.id)), host.vacuumOverlayByKey.delete(data.id));
          const roomResultMarkerElement = host.map.get(data.id);
          (roomResultMarkerElement &&
            ((roomResultMarkerElement.disabled = false),
            (roomResultMarkerElement.title = data.error || "")),
            data.error &&
              ((host.moduleEmptyElement.hidden = false), (host.moduleEmptyElement.textContent = data.error)));
        } else {
          if (data.type === "range-editor") {
            if (data.flush === true) {
              const rangeEditorFlushError =
                !host.canEditLightRange || !host.isRangeEditorOpen ? "请先打开照射范围编辑。" : "";
              (rangeEditorFlushError || host.rangeEditorHandle.flush(),
                postHostMessage({
                  type: "range-editor-state",
                  active: host.isRangeEditorOpen,
                  requestId: data.requestId,
                  ...(rangeEditorFlushError
                    ? {
                        error: rangeEditorFlushError,
                      }
                    : {}),
                }));
            } else {
              if (data.open === false) {
                host.isRangeEditorSuppressingClose = !!data.requestId;
                try {
                  host.rangeEditorHandle?.close();
                } finally {
                  host.isRangeEditorSuppressingClose = false;
                }
                data.requestId &&
                  postHostMessage({
                    type: "range-editor-state",
                    active: false,
                    requestId: data.requestId,
                  });
              } else host.openRangeEditor(data.requestId);
            }
          } else {
            if (data.type === "range-save-result")
              host.rangeEditorHandle?.setSaveStatus?.(data.error || "");
            else {
              if (data.type === "activity-state")
                ((host.hasPresentedOnce = true),
                  (host.isStageVisible = data.visible === true),
                  (host.isPresentedVisible =
                    data.presentedVisible === undefined
                      ? host.isStageVisible
                      : data.presentedVisible === true),
                  (!host.isStageVisible || !host.isPresentedVisible) &&
                    host.focusExitPointer &&
                    host.releaseFocusExit({
                      pointerId: host.focusExitPointer.pointerId,
                    }),
                  host.mountOptions.setPresentedVisible?.(host.isPresentedVisible),
                  host.syncVacuumMap(),
                  host.isStageVisible || (host.hasIdleIconActivity = false),
                  host.syncAvailability());
              else {
                if (data.type === "user-activity")
                  ((host.hasIdleIconActivity = false),
                    (host.furthestFloorOrder = performance.now()),
                    host.syncStageVisibility(),
                    (host.isPointerHeld = data.held === true),
                    host.syncIdleHold());
                else {
                  if (data.type === "dismiss-focus")
                    (host.idleRotationControl.activity(),
                      host.idleIconVisibilityControl.activity(),
                      host.stopVacuumFollow(data.immediate !== true),
                      host.exitFocusMode({
                        immediate: data.immediate === true,
                      }));
                  else {
                    if (data.type === "states") {
                      const stateUpdatePlan =
                          data.patch === true
                            ? host.stateUpdatePlanner.plan(host.options, data.states)
                            : null,
                        snapshotLightState = (patchedEntityId: any) =>
                          JSON.stringify([
                            host.resolveDeviceState(patchedEntityId),
                            host.readLightState(patchedEntityId),
                          ]),
                        lightOnlySnapshotMap = new Map(
                          (stateUpdatePlan?.lightOnlyIds || []).map((lightOnlyId: any) => [
                            lightOnlyId,
                            snapshotLightState(lightOnlyId),
                          ]),
                        );
                      ((host.deviceStates =
                        data.patch === true
                          ? {
                              ...host.deviceStates,
                              ...(data.states || {}),
                            }
                          : data.states || {}),
                        host.syncAirConditionerHistory(stateUpdatePlan));
                      for (const patchedLightItem of host.options.lights || [])
                        (data.patch !== true ||
                          Object.hasOwn(data.states || {}, patchedLightItem.entityId)) &&
                          host.vector.reconcile(
                            patchedLightItem.entityId,
                            host.resolveDeviceState(patchedLightItem.entityId),
                          );
                      for (const [trackedLightId, previousLightSnapshot] of lightOnlySnapshotMap)
                        snapshotLightState(trackedLightId) === previousLightSnapshot &&
                          stateUpdatePlan!.changed.delete(trackedLightId);
                      (!stateUpdatePlan || stateUpdatePlan.changed.size) &&
                        host.syncMarkers(stateUpdatePlan);
                    } else {
                      if (data.type === "control-result")
                        host.mediaControlRequestsByRequestId.has(data.requestId)
                          ? host.settleMediaRequest(data.requestId, data.error)
                          : host.coverControlRequestsByRequestId.has(data.requestId)
                            ? host.failCoverRequest(data.requestId, data.error)
                            : host.pendingControlRequestsByRequestId.has(data.requestId)
                              ? host.settleClimateRequest(data.requestId, data.error)
                              : host.settleControlCommand(
                                  data.requestId,
                                  data.error || "",
                                  data.timedOut === true,
                                );
                      else {
                        if (data.type === "editor-command" && host.isEditing)
                          try {
                            if (data.command === "preview-lock-motion") {
                              if (host.selectedSecurityKind !== "lock") throw new Error("请先选择门。");
                              const previewLockMarkerItem = host.findBindingById(data.id);
                              if (
                                previewLockMarkerItem?.deviceKind !== "lock" ||
                                !previewLockMarkerItem.modelAvailable
                              )
                                throw new Error("请选择可用的门模型。");
                              ((host.selectedLockEntry = {
                                id: data.id,
                                open: data.value !== "closed",
                              }),
                                host.wakeSceneBackground(),
                                host.syncCameraInteraction());
                              return;
                            } else {
                              if (data.command === "presence-top-view") {
                                const { floorId: presenceFloorId, box: presenceViewBox } =
                                  data.value || {};
                                if (
                                  !presenceViewBox ||
                                  ![
                                    presenceViewBox.x,
                                    presenceViewBox.y,
                                    presenceViewBox.w,
                                    presenceViewBox.h,
                                  ].every(Number.isFinite) ||
                                  presenceViewBox.w <= 0 ||
                                  presenceViewBox.h <= 0
                                )
                                  throw new Error("顶视图范围无效。");
                                const worldPoint2 = host.mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x + presenceViewBox.w / 2,
                                    presenceViewBox.y + presenceViewBox.h / 2,
                                    0,
                                  ),
                                  worldPoint3 = host.mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x,
                                    presenceViewBox.y,
                                    0,
                                  ),
                                  worldPoint4 = host.mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x + presenceViewBox.w,
                                    presenceViewBox.y + presenceViewBox.h,
                                    0,
                                  );
                                if (!worldPoint2 || !worldPoint3 || !worldPoint4)
                                  throw new Error("请选择有效楼层。");
                                const presenceFrameSize = Math.max(
                                  Math.abs(worldPoint4.z - worldPoint3.z),
                                  Math.abs(worldPoint4.x - worldPoint3.x) /
                                    (host.canvasElement.clientWidth /
                                      Math.max(1, host.canvasElement.clientHeight)),
                                );
                                (host.exitFocusMode({
                                  immediate: true,
                                }),
                                  host.mountOptions.restoreCamera({
                                    mode: "orthographic",
                                    view: "top",
                                    topRotation: 0,
                                    position: [
                                      worldPoint2.x,
                                      worldPoint2.y + Math.max(20, presenceFrameSize * 2),
                                      worldPoint2.z,
                                    ],
                                    target: worldPoint2.toArray(),
                                    up: [0, 0, -1],
                                    zoom: 1,
                                    frameSize: presenceFrameSize,
                                  }));
                              } else {
                                if (data.command === "presence-3d-view")
                                  (host.mountOptions.setCameraView?.("free"),
                                    host.mountOptions.restoreCamera(
                                      host.options.camera ||
                                        host.mountOptions.floorDefaultCamera?.(host.selectedFloorId) ||
                                        host.activeCameraPose,
                                    ));
                                else {
                                  if (data.command === "presence-preview-walk")
                                    ((host.isPresencePressed = data.value === true),
                                      host.syncPresenceScene());
                                  else {
                                    if (data.command === "presence-show-hit-range")
                                      ((host.isPresenceEditing = data.value === true),
                                        host.layoutPresenceHitBoxes());
                                    else {
                                      if (data.command === "edit-follow-camera") {
                                        const followMarkerItem = host.findBindingById(data.id);
                                        if (followMarkerItem?.deviceKind !== "vacuum")
                                          throw new Error("请选择扫地机。");
                                        host.focusMarkerById(data.id, "edit", true);
                                        const followCameraTarget =
                                          host.mountOptions.environmentModelPose(
                                            followMarkerItem.floorId,
                                            followMarkerItem.modelId,
                                          )?.center || host.mountOptions.cameraState().target;
                                        host.startCameraMotion(
                                          followMarkerItem.followCamera ||
                                            vacuumBirdCamera2(
                                              host.options.camera || host.mountOptions.cameraState(),
                                              followCameraTarget,
                                            ),
                                          false,
                                          true,
                                        );
                                      } else {
                                        if (data.command === "edit-light-camera")
                                          host.focusMarkerById(data.id, "edit", true);
                                        else {
                                          if (data.command === "preview-light-camera")
                                            host.focusMarkerById(data.id, "preview");
                                          else {
                                            if (data.command === "preview-device-panel")
                                              host.focusMarkerById(data.id, "panel");
                                            else {
                                              if (data.command === "preview-light-effect") {
                                                if (
                                                  ![
                                                    "brightnessMin",
                                                    "brightnessMax",
                                                    "temperatureMin",
                                                    "temperatureMax",
                                                    "defaults",
                                                  ].includes(data.value)
                                                )
                                                  throw new Error("请选择要预览的效果。");
                                                if (!host.findBindingById(data.id))
                                                  throw new Error("灯光按钮已移除。");
                                                if (!host.findBindingById(data.id).entityId)
                                                  throw new Error("请先绑定实体，再预览灯光效果。");
                                                (host.focusMarkerById(data.id, "preview"),
                                                  (host.lightEditPreview = {
                                                    id: data.id,
                                                    kind: data.value,
                                                  }),
                                                  host.applyLightStates({
                                                    preview: true,
                                                  }),
                                                  host.updateDevicePanel());
                                              } else {
                                                if (data.command === "cancel-light-camera")
                                                  host.exitFocusMode({
                                                    immediate: true,
                                                  });
                                                else {
                                                  if (
                                                    host.panelDisplayMode !== "edit" ||
                                                    data.id !== host.focusedItemId
                                                  )
                                                    throw new Error("请先进入视角调整。");
                                                  (data.command === "focus-projection" &&
                                                    host.mountOptions.setCameraProjection(data.value),
                                                    data.command === "focus-focal-length" &&
                                                      host.mountOptions.setCameraFocalLength(
                                                        data.value,
                                                      ));
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            host.syncCameraInteraction();
                            const editCameraSnapshot = host.applyDefaultCamera();
                            (postHostMessage({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              id: data.id,
                              camera: editCameraSnapshot,
                            }),
                              data.command === "save-light-camera" &&
                                host.exitFocusMode({
                                  immediate: true,
                                }));
                          } catch (editorCommandError: any) {
                            postHostMessage({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              error: editorCommandError.message,
                            });
                          }
                        else
                          data.type === "editor-command" &&
                            host.isAwaitingFloorViewAdjust &&
                            (data.command === "projection" &&
                              host.mountOptions.setCameraProjection(data.value),
                            data.command === "focal-length" &&
                              host.mountOptions.setCameraFocalLength(data.value),
                            host.syncCameraInteraction(),
                            (data.command === "save-camera" || data.requestId) &&
                              postHostMessage({
                                type: "edit",
                                action: "camera",
                                requestId: data.requestId,
                                camera: host.applyDefaultCamera(),
                              }));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

export function createRunFrame(host: StageHandlersHost) {
  return function runFrame(frameTimestamp: any) {
    if (host.isControlBusy || document.hidden || host.isCameraMoving || host.startupProgress === 0)
      return Infinity;
    host.syncPresenceScene();
    const floorTransitionActive2 =
      host.mountOptions.floorTransitionActive || host.cameraMotionSnapshot?.owner === "floor";
    if (
      (host.mountOptions.recordFloorFrame?.(frameTimestamp, !!floorTransitionActive2),
      !floorTransitionActive2)
    ) {
      (host.rebuildCurtainMotion(),
        host.syncNasOverlay(),
        host.syncCameraOverlay(),
        host.syncEnvironmentLayers(),
        host.syncVacuumMotion(),
        host.speakerRings.tick(frameTimestamp),
        host.carCharging.tick(frameTimestamp),
        host.fanMotion.tick(frameTimestamp),
        host.airerMotion.tick(frameTimestamp),
        host.nasStatus.tick(frameTimestamp));
      for (const stateTickerEntry of Object.values(host.waterHeaterStatusByModelType) as any[])
        stateTickerEntry.tick(frameTimestamp);
      for (const genericTickerEntry of Object.values(host.entries) as any[])
        genericTickerEntry.tick(frameTimestamp);
      ([host.coverFeedback.tick(frameTimestamp), host.dreamTiltFeedback.tick(frameTimestamp)].some(Boolean) &&
        (host.pruneTiltPreviews(),
        host.syncCoverIconStates(),
        host.getFocusedEntry()?.deviceKind === "cover" && host.updateDevicePanel()),
        host.curtainMotion.update(frameTimestamp));
    }
    (host.syncVacuumMap(),
      host.mountOptions.curtainFrame?.({
        key: host.curtainMotion.poseKey(),
        structure: host.curtainMotion.structureKey(),
        floorIds: host.list,
        moving:
          host.startupProgress > 0 &&
          (host.curtainMotion.isMoving() || host.nextCoverFeedbackDelay() <= 1000 / 30),
      }));
    const tick = host.presenceWaves.tick(frameTimestamp),
      tick2 = host.environmentScene.tick(frameTimestamp);
    (floorTransitionActive2 || host.environmentAirflow.tick(frameTimestamp),
      host.mountOptions.setEnvironmentActive?.(host.environmentScene.isActive),
      host.advanceCameraMotion(frameTimestamp));
    const tick3 = host.sceneBackgroundController.tick(frameTimestamp),
      tick4 = host.vacuumMaps.tick(frameTimestamp);
    (host.idleFocusExitControl.tick(frameTimestamp),
      host.idleRotationControl.tick(frameTimestamp),
      host.idleIconVisibilityControl.tick(frameTimestamp),
      host.vector.expire() && host.syncMarkers());
    const deltaSeconds = host.lastIdleFrameMs
      ? Math.min(0.1, (frameTimestamp - host.lastIdleFrameMs) / 1000)
      : 0;
    host.lastIdleFrameMs = frameTimestamp;
    const lightBindingFrame = host.buildLockMotionInput(),
      tick5 =
        !floorTransitionActive2 &&
        host.lockMotion.tick(frameTimestamp, lightBindingFrame.bindings, lightBindingFrame.states);
    host.mountOptions.setLockMoving?.(tick5);
    const tick6 = !floorTransitionActive2 && host.presenceScene.tick(deltaSeconds);
    host.layoutPresenceHitBoxes();
    const tick7 = !floorTransitionActive2 && host.vacuumMotion.tick(deltaSeconds);
    tick7 && ((host.lastRenderSignature = ""), host.renderMarkerPositions(true));
    const some6 = (host.options.devices?.vacuums || []).some(
        (activeVacuumItem: any) => vacuumStatusPresentation2(activeVacuumItem, host.deviceStates).active,
      ),
      floor = Math.floor(frameTimestamp / 7000);
    (some6 && floor !== host.lastIdleFloorId && ((host.lastIdleFloorId = floor), host.syncMarkers()),
      host.revealFollowCamera());
    const frameTimestampCameraQuaternionKey =
      host.mountOptions.camera.quaternion?.toArray?.().join(",") || "";
    if (frameTimestampCameraQuaternionKey !== host.cameraQuaternionKey) {
      const frameDeltaSeconds =
          Math.min(100, Math.max(1, frameTimestamp - (host.lastQuaternionMs ?? frameTimestamp - 16.7))) /
          1000,
        cameraAngularSpeed =
          host.scratchQuaternion.angleTo(host.mountOptions.camera.quaternion) / frameDeltaSeconds;
      (host.cameraQuaternionKey &&
        !host.cameraMotionSnapshot &&
        !host.followVacuumId &&
        (host.set.size || host.isPointerHeld || cameraAngularSpeed > 0.035) &&
        (host.idleIconDelayUntilMs = frameTimestamp + 60),
        (host.cameraQuaternionKey = frameTimestampCameraQuaternionKey));
    }
    (host.scratchQuaternion.copy(host.mountOptions.camera.quaternion), (host.lastQuaternionMs = frameTimestamp));
    const isRotatingByPointer =
        host.isIdleIconHidden &&
        !host.cameraMotionSnapshot &&
        !host.followVacuumId &&
        (host.set.size > 0 || host.isPointerHeld),
      shouldHideIconsWhileRotating =
        host.pageBehavior.hideIconsWhileRotating === true &&
        !host.isEditing &&
        !host.isAwaitingFloorViewAdjust &&
        (host.isIdleRotationRunning || isRotatingByPointer || frameTimestamp < host.idleIconDelayUntilMs);
    shouldHideIconsWhileRotating !== host.isIdleIconHidden &&
      ((host.isIdleIconHidden = shouldHideIconsWhileRotating), host.syncStageVisibility());
    const some7 = (host.options.devices?.vacuums || []).some(
      (trackedVacuumItem: any) =>
        host.matchesSelectedFloor(trackedVacuumItem) && host.vacuumMotion.hasTracking(trackedVacuumItem.id),
    );
    return (
      (host.followToggleButton.hidden =
        host.isEditing || (!host.followVacuumId && (host.activeModule !== "vacuum" || !some7))),
      (host.toolbarElement.hidden = host.followToggleButton.hidden),
      (host.followToggleButton.disabled = !host.followVacuumId && !some7),
      host.renderMarkerPositions(),
      (host.canvasElement.dataset.stageFrameChecks = String(
        host.sceneBackground?.stats?.frames ?? 0,
      )),
      Math.min(
        host.carCharging.nextDelay(),
        host.airerMotion.nextDelay(),
        host.fanMotion.nextDelay(),
        host.speakerRings.nextDelay(),
        tick5 ? 1000 / 30 : Infinity,
        tick3,
        tick ? 1000 / 30 : Infinity,
        host.screenOutlines.nextDelay(),
        tick6 ? 0 : Infinity,
        tick7 || host.followVacuumId ? 1000 / 30 : Infinity,
        host.isIdleIconHidden ? 60 : Infinity,
        some6 ? 7000 - (frameTimestamp % 7000) : Infinity,
        host.cameraMotionSnapshot || tick2 || tick4 ? 0 : Infinity,
        host.curtainMotion.isMoving() ? 1000 / 30 : Infinity,
        Math.min(
          host.coverFeedback.nextDelay(frameTimestamp),
          host.dreamTiltFeedback.nextDelay(frameTimestamp),
        ),
        host.environmentAirflow.nextDelay(),
        host.nasStatus.nextDelay(),
        ...(Object.values(host.waterHeaterStatusByModelType) as any[]).map((stateTickerForDelay) =>
          stateTickerForDelay.nextDelay(),
        ),
        ...(Object.values(host.entries) as any[]).map((genericTickerForDelay) =>
          genericTickerForDelay.nextDelay(),
        ),
        host.idleFocusExitControl.nextDelay(frameTimestamp),
        host.idleRotationControl.nextDelay(frameTimestamp),
        host.idleIconVisibilityControl.nextDelay(frameTimestamp),
        host.vector.nextDelay(frameTimestamp),
      )
    );
  }
}
