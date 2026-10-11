import { COVER_CLOSED_POSITION_EPSILON, createAirerVisual, createSwitchVisual, entityStateText, popupModuleDialogTitle } from "../renderer-helpers";
import type { ClimateVisualSyncPayload, ComponentControllerElement, ComponentPayload } from "../renderer-types";
import type { PanelRenderer } from "../renderer";
import { airerPositionCalibration as airerPositionCalibration2, airerVisualDrop as airerVisualDrop2, coverComponentIsAirer as coverComponentIsAirer2, coverMotorIsReversedForComponent as coverMotorIsReversedForComponent2, coverPresentationState as coverPresentationState2, dreamCurtainStatusFromRetraction as dreamCurtainStatusFromRetraction2, dreamCurtainStatusText as dreamCurtainStatusText2, dreamCurtainToggleService as dreamCurtainToggleService2, physicalCoverState as physicalCoverState2, relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor2, relatedAirerLightEntity as relatedAirerLightEntity2, relatedAirerMotorActionEntities as relatedAirerMotorActionEntities2, relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor2, relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity2, relatedDeviceDomainEntity as relatedDeviceDomainEntity2 } from "../../controls/cover-runtime";
import { applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2 } from "../entity-role-profiles";
import { bathHeaterModeUsesAirflow as bathHeaterModeUsesAirflow2, climateIsPoweredOn as climateIsPoweredOn2, climateModeLabel as climateModeLabel2, climatePowerCommand as climatePowerCommand2, resolveClimateDeviceType as resolveClimateDeviceType2 } from "../../controls/climate";
import { formatLineChartValue as formatLineChartValue2, mountCameraMedia as mountCameraMedia2, renderLineChartDetails as renderLineChartDetails2 } from "../registry";
import { lightColorRgb as lightColorRgb2, lightSupportsColor as lightSupportsColor2 } from "../../controls/light-runtime";
import { playFixedDeviceDropEntrance as playFixedDeviceDropEntrance2, playMediaSpeakerEntrance as playMediaSpeakerEntrance2 } from "../panel-dialog-motion";
import { popupLayoutMetrics as popupLayoutMetrics2 } from "../../../shared/popup-layout";
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../../shared/util/range-progress";
import { syncedLineChartProperties as syncedLineChartProperties2 } from "../panel-document";

export function showCustomPopup(this: PanelRenderer, customPopupModule: any, { preview: isCustomPopupPreview = false } = {}) {
    (this.closeRuntimeDialog(),
      (this.historyPopupGeneration += 1),
      (this.activePopupId = String(customPopupModule?.id || "")),
      this.connectRuntime());
    const customPopupDialog = document.createElement("dialog");
    customPopupDialog.className = "hb-custom-popup-dialog";
    const customPopupCard = document.createElement("div");
    customPopupCard.className = "hb-custom-popup-card";
    const popupModules = customPopupModule.modules || [],
      popupLayoutMetrics = popupLayoutMetrics2(popupModules, customPopupModule.layout),
      popupWidth = popupLayoutMetrics.popupWidth,
      popupHeight = popupLayoutMetrics.popupHeight;
    ((customPopupDialog.dataset.runtimeDialogLayout =
      popupLayoutMetrics.rows === 1 && popupLayoutMetrics.columns === 2 ? "compact" : "fill"),
      (customPopupCard.style.width = popupWidth + "px"),
      (customPopupCard.style.height = popupHeight + "px"),
      (customPopupCard.style.maxHeight = "none"));
    const customPopupHeading = document.createElement("div");
    customPopupHeading.className = "hb-custom-popup-heading";
    const customPopupTitleBox = document.createElement("div"),
      customPopupTitle = document.createElement("strong");
    ((customPopupTitle.textContent = customPopupModule.name || "组合弹窗"),
      customPopupTitleBox.append(customPopupTitle));
    const customPopupCloseButton = document.createElement("button");
    ((customPopupCloseButton.type = "button"),
      (customPopupCloseButton.textContent = "×"),
      customPopupCloseButton.setAttribute("aria-label", "关闭组合弹窗"),
      customPopupHeading.append(customPopupTitleBox, customPopupCloseButton));
    const customPopupGrid = document.createElement("div");
    ((customPopupGrid.className = "hb-custom-popup-grid"),
      (customPopupGrid.style.gridTemplateColumns =
        "repeat(" + popupLayoutMetrics.columns + ", minmax(0, 1fr))"),
      (customPopupGrid.style.gridTemplateRows =
        "repeat(" + popupLayoutMetrics.rows + ", minmax(0, 1fr))"));
    const popupCleanupCallbacks: any = [],
      popupMediaSpeakerVisuals: any[] = [],
      popupControlPanels: any[] = [],
      popupEntranceTargets: any[] = [],
      popupRefreshCallbacks: any = [],
      stateHandlerByPopupEntityId = new Map(),
      registerPopupStateHandler = (popupHandlerEntityId: any, popupHandlerCallback: any) => {
        (stateHandlerByPopupEntityId.has(popupHandlerEntityId) ||
          stateHandlerByPopupEntityId.set(popupHandlerEntityId, []),
          stateHandlerByPopupEntityId.get(popupHandlerEntityId).push(popupHandlerCallback));
      };
    for (const [moduleIndex, popupModuleEntry] of popupModules.entries()) {
      const popupModuleOptions =
          popupModuleEntry.type === "capability-device"
            ? {
                ...popupModuleEntry,
                type: "generic",
              }
            : popupModuleEntry,
        moduleEntityId = String(popupModuleOptions.entityId || ""),
        popupDeviceProfile = this.deviceProfile(moduleEntityId),
        xiaomiDeviceProfile = applyXiaomiDeviceProfile2(
          {
            bindings: {
              entity: {
                entityId: popupModuleOptions.entityId,
              },
            },
            properties: {
              ...(popupModuleOptions.properties || {}),
              deviceType:
                popupModuleOptions.deviceType ||
                popupModuleOptions.properties?.deviceType ||
                "auto",
            },
          },
          popupDeviceProfile,
        ),
        moduleDeviceProfile = popupDeviceProfile
          ? {
              ...popupModuleOptions,
              properties: xiaomiDeviceProfile.properties,
              deviceType:
                xiaomiDeviceProfile.properties?.deviceType || popupModuleOptions.deviceType,
            }
          : popupModuleOptions,
        modulePlacement = popupLayoutMetrics.placements[moduleIndex] || {
          x: 0,
          y: moduleIndex,
          width: 1,
          height: 1,
        },
        moduleColumnSpan = [
          "climate",
          "air-purifier",
          "water-heater",
          "media-player",
          "camera",
          "line-chart",
        ].includes(moduleDeviceProfile.type)
          ? 2
          : modulePlacement.width,
        entityId = moduleEntityId || moduleDeviceProfile.entityId,
        moduleEntityState = this.states.get(entityId),
        popupEntityState = moduleEntityState?.newState || moduleEntityState,
        popupModuleSection = document.createElement("section");
      ((popupModuleSection.className =
        "hb-custom-popup-module hb-custom-popup-module--" +
        (moduleDeviceProfile.type || "generic")),
        (popupModuleSection.style.gridColumn =
          modulePlacement.x + 1 + " / span " + moduleColumnSpan),
        (popupModuleSection.style.gridRow =
          modulePlacement.y + 1 + " / span " + modulePlacement.height));
      const popupModuleHeading = document.createElement("div");
      popupModuleHeading.className = "hb-custom-popup-module-heading";
      const popupModuleTitle = document.createElement("strong");
      popupModuleTitle.textContent = popupModuleDialogTitle(moduleDeviceProfile, popupEntityState);
      const popupModuleStatus = document.createElement("span");
      popupModuleStatus.className =
        "hb-custom-popup-module-status type-" + (moduleDeviceProfile.type || "generic");
      const moduleStatusLabels = {
        light: "灯光",
        climate: "空调 / 浴霸",
        "air-purifier": "空气净化器",
        "water-heater": "热水器",
        "media-player": "媒体",
        "electric-bed": "电动床",
        switch: "开关",
        cover: "窗帘",
        camera: "摄像头",
        "line-chart": "实时数据",
        generic: "设备",
      };
      if (
        ((popupModuleStatus.textContent =
          (moduleStatusLabels as any)[moduleDeviceProfile.type] || moduleStatusLabels.generic),
        popupModuleHeading.append(popupModuleTitle, popupModuleStatus),
        popupModuleSection.append(popupModuleHeading),
        moduleDeviceProfile.type === "electric-bed" &&
          popupDeviceProfile?.deviceType !== "electric-bed")
      ) {
        popupModuleSection.classList.add("hb-custom-popup-module--electric-bed");
        const bedPositionSection = document.createElement("section");
        bedPositionSection.className =
          "hb-custom-electric-bed-loading hb-climate-details-loading is-loading";
        const bedPositionIcon = document.createElement("i");
        bedPositionIcon.setAttribute("aria-hidden", "true");
        const bedPositionValueElement = document.createElement("strong");
        ((bedPositionValueElement.textContent = "—"),
          bedPositionSection.append(bedPositionIcon, bedPositionValueElement),
          popupModuleSection.append(bedPositionSection));
      } else {
        if (moduleDeviceProfile.type === "electric-bed") {
          popupModuleSection.classList.add("hb-custom-popup-module--electric-bed");
          const bedRoles = (popupDeviceProfile || this.deviceProfile(entityId))?.roles || {},
            resolveBedEntityState = (bedEntityId: any) => {
              const bedEntityState = this.states.get(bedEntityId);
              return (
                bedEntityState?.newState ||
                bedEntityState || {
                  entityId: bedEntityId,
                  state: "unknown",
                  attributes: {} as Record<string, any>,
                }
              );
            },
            electricBedBodyElement = document.createElement("div");
          electricBedBodyElement.className = "hb-custom-electric-bed-body";
          const electricBedVisualElement = document.createElement("section");
          electricBedVisualElement.className = "hb-electric-bed-visual";
          const electricBedModelArea = document.createElement("div");
          electricBedModelArea.className = "hb-electric-bed-model";
          for (const bedModelPart of ["mattress", "back", "waist", "legs", "base"]) {
            const bedModelPartIcon = document.createElement("i");
            ((bedModelPartIcon.className = "hb-electric-bed-" + bedModelPart),
              electricBedModelArea.append(bedModelPartIcon));
          }
          const createBedAngleReadout = (anglePartName: any, anglePartLabel: any) => {
              const bedAngleReadoutElement = document.createElement("span");
              bedAngleReadoutElement.className = "hb-electric-bed-angle-readout " + anglePartName;
              const bedAngleValueElement = document.createElement("strong"),
                bedAngleCaption = document.createElement("small");
              return (
                (bedAngleCaption.textContent = anglePartLabel),
                bedAngleReadoutElement.append(bedAngleValueElement, bedAngleCaption),
                {
                  item: bedAngleReadoutElement,
                  value: bedAngleValueElement,
                }
              );
            },
            backrestReadoutElement = createBedAngleReadout("back", "靠背"),
            waistReadoutElement = createBedAngleReadout("waist", "腰部"),
            legsReadoutElement = createBedAngleReadout("legs", "腿部");
          electricBedVisualElement.append(
            electricBedModelArea,
            backrestReadoutElement.item,
            waistReadoutElement.item,
            legsReadoutElement.item,
          );
          const bedModeControl = document.createElement("section");
          bedModeControl.className = "hb-electric-bed-control hb-electric-bed-mode";
          const bedMemorySection = document.createElement("section");
          bedMemorySection.className = "hb-electric-bed-memory";
          const bedAngleControlsSection = document.createElement("section");
          bedAngleControlsSection.className = "hb-electric-bed-angle-controls";
          const bedModeValue = String(bedRoles.mode || ""),
            slice4 = [bedRoles.memory1, bedRoles.memory2].filter(Boolean).slice(0, 2),
            bedAngleControlEntries = [
              ["backrest", "靠背角度", "back"],
              ["leg", "腿部角度", "legs"],
              ["waist", "腰部角度", "waist"],
            ]
              .map(([angleRole, angleLabel, angleVisualClass]) => ({
                role: angleRole,
                label: angleLabel,
                visualClass: angleVisualClass,
                entityId: String(bedRoles[angleRole] || ""),
              }))
              .filter((angleControlItem) => angleControlItem.entityId),
            createBedControlBlock = (
              controlParentElement: any,
              controlLabelText: any,
              blockEntityId: any,
              controlVariantName = "",
            ) => {
              const bedControlSection = document.createElement("section");
              bedControlSection.className = "hb-electric-bed-control";
              const bedControlTitle = document.createElement("strong");
              bedControlTitle.textContent = controlLabelText;
              const capabilityDetailsControls3 = this.createCapabilityDetailsControls(
                blockEntityId,
                resolveBedEntityState(blockEntityId),
                {
                  interactive: !isCustomPopupPreview,
                  variant: controlVariantName,
                },
              );
              (capabilityDetailsControls3.classList.add("hb-electric-bed-capability"),
                bedControlSection.append(bedControlTitle, capabilityDetailsControls3),
                controlParentElement.append(bedControlSection),
                popupCleanupCallbacks.push(() =>
                  capabilityDetailsControls3.cleanupCapabilityDetails?.(),
                ),
                registerPopupStateHandler(blockEntityId, (capabilityStateArg: any) =>
                  capabilityDetailsControls3.syncCapabilityState?.(capabilityStateArg),
                ));
            };
          if (bedModeValue)
            createBedControlBlock(bedModeControl, "模式", bedModeValue, "electric-bed");
          else {
            const bedModeTitle = document.createElement("strong");
            bedModeTitle.textContent = "模式";
            const bedModeSelect = document.createElement("select");
            ((bedModeSelect.className = "hb-capability-select"),
              (bedModeSelect.disabled = true),
              bedModeSelect.append(new Option("未识别到模式实体")),
              bedModeControl.append(bedModeTitle, bedModeSelect));
          }
          const bedMemoryTitle = document.createElement("strong");
          bedMemoryTitle.textContent = "记忆姿势";
          const bedMemoryList = document.createElement("div");
          bedMemoryList.className = "hb-electric-bed-memory-list";
          for (let memoryIndex = 0; memoryIndex < 2; memoryIndex += 1) {
            const memorySlotEntityId = String(slice4[memoryIndex] || ""),
              memoryMetadata = memorySlotEntityId
                ? this.entityMetadata.get(memorySlotEntityId)
                : null;
            if (memorySlotEntityId.split(".", 1)[0] === "select") {
              createBedControlBlock(
                bedMemoryList,
                "记忆姿势 " + (memoryIndex + 1),
                memorySlotEntityId,
                "electric-bed-memory",
              );
              continue;
            }
            const bedMemoryButton = document.createElement("button");
            ((bedMemoryButton.type = "button"),
              (bedMemoryButton.className = "hb-electric-bed-memory-button"),
              (bedMemoryButton.textContent =
                memoryMetadata?.name ||
                memoryMetadata?.originalName ||
                "记忆姿势 " + (memoryIndex + 1)),
              (bedMemoryButton.disabled = isCustomPopupPreview || !memorySlotEntityId),
              bedMemoryButton.addEventListener("click", async () => {
                if (!(isCustomPopupPreview || !memorySlotEntityId || bedMemoryButton.disabled)) {
                  bedMemoryButton.disabled = true;
                  try {
                    (await this.callEntityService("button", "press", memorySlotEntityId),
                      bedMemoryButton.classList.add("is-success"),
                      window.setTimeout(() => bedMemoryButton.classList.remove("is-success"), 900));
                  } catch (memoryPressError: any) {
                    this.options.onError?.(memoryPressError);
                  } finally {
                    bedMemoryButton.disabled = isCustomPopupPreview || !memorySlotEntityId;
                  }
                }
              }),
              bedMemoryList.append(bedMemoryButton));
          }
          bedMemorySection.append(bedMemoryTitle, bedMemoryList);
          for (const bedAngleEntry of bedAngleControlEntries)
            createBedControlBlock(
              bedAngleControlsSection,
              bedAngleEntry.label,
              bedAngleEntry.entityId,
            );
          const syncBedAngle = () => {
            const bedAngleEntityIds = {
                backrest: resolveBedEntityState(bedRoles.backrest),
                leg: resolveBedEntityState(bedRoles.leg),
                waist: resolveBedEntityState(bedRoles.waist),
              },
              getBedAngleValue = (bedAngleState: any) => {
                const bedAngleNumber = Number(bedAngleState?.state);
                return Number.isFinite(bedAngleNumber) ? bedAngleNumber : null;
              },
              applyBedAngle = (angleRoleName: any, _angleElement: any, angleReadoutValue: any) => {
                const bedAngleDegrees = getBedAngleValue((bedAngleEntityIds as any)[angleRoleName]);
                ((angleReadoutValue.textContent =
                  bedAngleDegrees === null ? "--" : Math.round(bedAngleDegrees) + "°"),
                  bedAngleDegrees !== null &&
                    electricBedModelArea.style.setProperty(
                      "--hb-bed-" +
                        (angleRoleName === "backrest" ? "backrest" : angleRoleName) +
                        "-angle",
                      bedAngleDegrees + "deg",
                    ));
              };
            (applyBedAngle("backrest", electricBedModelArea, backrestReadoutElement.value),
              applyBedAngle("waist", electricBedModelArea, waistReadoutElement.value),
              applyBedAngle("leg", electricBedModelArea, legsReadoutElement.value),
              (popupModuleStatus.textContent = "已连接"));
          };
          for (const bedAngleEntityId of [bedRoles.backrest, bedRoles.leg, bedRoles.waist].filter(
            Boolean,
          ))
            registerPopupStateHandler(bedAngleEntityId, syncBedAngle);
          (syncBedAngle(),
            electricBedBodyElement.append(
              bedModeControl,
              electricBedVisualElement,
              bedMemorySection,
              bedAngleControlsSection,
            ),
            popupModuleSection.append(electricBedBodyElement));
        } else {
          if (moduleDeviceProfile.type === "camera") {
            const popupCameraVisualElement = document.createElement("section");
            ((popupCameraVisualElement.className =
              "hb-camera-device-visual hb-custom-camera-device-visual"),
              popupCameraVisualElement.setAttribute("aria-hidden", "true"));
            const popupCameraMountIcon = document.createElement("i");
            popupCameraMountIcon.className = "hb-camera-device-mount";
            const popupCameraArmIcon = document.createElement("i");
            popupCameraArmIcon.className = "hb-camera-device-arm";
            const popupCameraBody = document.createElement("div");
            popupCameraBody.className = "hb-camera-device-body";
            const popupCameraLensIcon = document.createElement("i");
            popupCameraLensIcon.className = "hb-camera-device-lens";
            const popupCameraLedIcon = document.createElement("i");
            ((popupCameraLedIcon.className = "hb-camera-device-led"),
              popupCameraBody.append(popupCameraLensIcon, popupCameraLedIcon),
              popupCameraVisualElement.append(
                popupCameraMountIcon,
                popupCameraArmIcon,
                popupCameraBody,
              ),
              popupModuleHeading.append(popupCameraVisualElement));
            let popupCameraMotionTimeoutId = 0,
              popupCameraMotionAnimation: any = null,
              popupCameraPreviousAngle = 0;
            const formatPopupCameraTilt = (popupTiltAngleDeg: any, popupTiltScaleFactor = 0) =>
                "translateX(-50%) perspective(260px) rotateY(" +
                popupTiltAngleDeg +
                "deg) rotateZ(" +
                popupTiltAngleDeg * 0.035 +
                "deg) translateY(" +
                popupTiltScaleFactor +
                "px)",
              popupCameraTiltTick = () => {
                if (!popupCameraBody.isConnected) return;
                const popupCameraTiltAngles = [-22, -16, -9, -4, 0, 6, 12, 18, 23].filter(
                    (filteredPopupAngle) =>
                      Math.abs(filteredPopupAngle - popupCameraPreviousAngle) >= 7,
                  ),
                  popupCameraTargetAngle =
                    popupCameraTiltAngles[
                      Math.floor(Math.random() * popupCameraTiltAngles.length)
                    ] ?? 0,
                  popupCameraTiltDirection =
                    Math.sign(popupCameraTargetAngle - popupCameraPreviousAngle) || 1,
                  abs2 = Math.abs(popupCameraTargetAngle - popupCameraPreviousAngle),
                  round2 = Math.round(430 + abs2 * 18 + Math.random() * 320),
                  popupCameraOvershootAngle =
                    popupCameraTargetAngle + popupCameraTiltDirection * (1.4 + Math.random() * 2.2),
                  popupCameraJitterAmount = Math.random() * 1.4 - 0.7;
                (popupCameraLensIcon.style.setProperty(
                  "--hb-camera-lens-shift",
                  (popupCameraTargetAngle / 23) * 2.5 + "px",
                ),
                  popupCameraMotionAnimation?.cancel(),
                  (popupCameraMotionAnimation = popupCameraBody.animate(
                    [
                      {
                        transform: formatPopupCameraTilt(popupCameraPreviousAngle, 0),
                        offset: 0,
                      },
                      {
                        transform: formatPopupCameraTilt(
                          popupCameraOvershootAngle,
                          popupCameraJitterAmount,
                        ),
                        offset: 0.78,
                      },
                      {
                        transform: formatPopupCameraTilt(
                          popupCameraTargetAngle,
                          popupCameraJitterAmount * 0.35,
                        ),
                        offset: 1,
                      },
                    ],
                    {
                      duration: round2,
                      easing: "cubic-bezier(.2,.72,.22,1)",
                      fill: "forwards",
                    },
                  )),
                  popupCameraMotionAnimation.addEventListener(
                    "finish",
                    () => {
                      ((popupCameraPreviousAngle = popupCameraTargetAngle),
                        (popupCameraBody.style.transform = formatPopupCameraTilt(
                          popupCameraPreviousAngle,
                          popupCameraJitterAmount * 0.35,
                        )),
                        popupCameraMotionAnimation?.cancel(),
                        (popupCameraMotionAnimation = null));
                      const popupCameraReturnDelayMs =
                        Math.random() < 0.22
                          ? 180 + Math.random() * 260
                          : 680 + Math.random() * 1500;
                      popupCameraMotionTimeoutId = window.setTimeout(
                        popupCameraTiltTick,
                        popupCameraReturnDelayMs,
                      );
                    },
                    {
                      once: true,
                    },
                  ));
              };
            (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
              (popupCameraMotionTimeoutId = window.setTimeout(popupCameraTiltTick, 620)),
              popupCleanupCallbacks.push(() => {
                (window.clearTimeout(popupCameraMotionTimeoutId),
                  popupCameraMotionAnimation?.cancel());
              }));
            const popupCameraStage = document.createElement("div");
            ((popupCameraStage.className = "hb-custom-popup-camera-stage is-connecting"),
              (popupModuleStatus.textContent = isCustomPopupPreview ? "预览模式" : "正在连接"),
              popupModuleStatus.classList.add("is-connecting"));
            const popupCameraRevealVeilIcon = document.createElement("i");
            popupCameraRevealVeilIcon.className = "hb-camera-preview-reveal-veil";
            const popupCameraScanLineIcon = document.createElement("i");
            ((popupCameraScanLineIcon.className = "hb-camera-preview-scan-line"),
              popupCameraStage.append(popupCameraRevealVeilIcon, popupCameraScanLineIcon));
            const popupCameraPlaceholderElement = document.createElement("span");
            ((popupCameraPlaceholderElement.textContent = isCustomPopupPreview
              ? "预览模式不获取实时画面"
              : "正在载入摄像头实时预览"),
              popupCameraStage.append(popupCameraPlaceholderElement),
              isCustomPopupPreview
                ? (popupModuleStatus.classList.remove("is-connecting"),
                  popupCameraStage.classList.remove("is-connecting"),
                  popupCameraStage.classList.add("is-ready"))
                : mountCameraMedia2({
                    container: popupCameraStage,
                    entityId: entityId,
                    label: popupModuleTitle.textContent,
                    objectFit: "fill",
                    placeholder: popupCameraPlaceholderElement,
                    onReady: () => {
                      ((popupModuleStatus.textContent = "实时画面"),
                        popupModuleStatus.classList.remove("is-connecting", "is-unavailable"),
                        popupModuleStatus.classList.add("is-live"),
                        popupCameraVisualElement.classList.remove("is-unavailable"),
                        popupCameraVisualElement.classList.add("is-live"),
                        popupCameraStage.classList.remove(
                          "is-connecting",
                          "is-unavailable",
                          "is-revealing",
                        ),
                        popupCameraStage.classList.add("is-ready"));
                    },
                    onUnavailable: () => {
                      ((popupModuleStatus.textContent = "画面不可用"),
                        popupModuleStatus.classList.remove("is-connecting", "is-live"),
                        popupModuleStatus.classList.add("is-unavailable"),
                        popupCameraVisualElement.classList.remove("is-live"),
                        popupCameraVisualElement.classList.add("is-unavailable"),
                        popupCameraStage.classList.remove("is-connecting", "is-revealing"),
                        popupCameraStage.classList.add("is-unavailable"));
                    },
                    cleanup: (popupCleanupCallback: any) => {
                      popupCleanupCallbacks.push(popupCleanupCallback);
                    },
                  }),
              popupModuleSection.append(popupCameraStage));
          } else {
            if (moduleDeviceProfile.type === "line-chart") {
              const lineChartModuleOptions = {
                  type: "line-chart",
                  bindings: {
                    entity: {
                      entityId: entityId,
                    },
                  },
                  properties: {
                    ...syncedLineChartProperties2(
                      this.document,
                      this.page,
                      entityId,
                      moduleDeviceProfile.properties,
                    ),
                    compactDetailsHorizontal: true,
                  },
                },
                lineChartCurrentOutputElement = document.createElement("output");
              lineChartCurrentOutputElement.className = "hb-custom-line-chart-current";
              const lineChartCurrentLabel = document.createElement("strong"),
                lineChartCurrentUnitElement = document.createElement("small"),
                chartValueColor = String(
                  lineChartModuleOptions.properties?.valueColor || "#dce1e5",
                );
              ((lineChartCurrentLabel.style.color = chartValueColor),
                (lineChartCurrentUnitElement.style.color = chartValueColor),
                lineChartCurrentOutputElement.append(
                  lineChartCurrentLabel,
                  lineChartCurrentUnitElement,
                ),
                popupModuleHeading.append(lineChartCurrentOutputElement));
              const syncLineChart = (chartStateArg: any) => {
                  const float = Number.parseFloat(chartStateArg?.state);
                  ((lineChartCurrentLabel.textContent = Number.isFinite(float)
                    ? formatLineChartValue2(
                        float,
                        lineChartModuleOptions.properties?.statePrecision,
                      )
                    : chartStateArg?.state || "--"),
                    (lineChartCurrentUnitElement.textContent = String(
                      chartStateArg?.attributes?.unit_of_measurement || "",
                    )),
                    lineChartCurrentOutputElement.setAttribute(
                      "aria-label",
                      "当前数值 " +
                        lineChartCurrentLabel.textContent +
                        lineChartCurrentUnitElement.textContent,
                    ));
                },
                lineChartStateOptions = {
                  states: this.states,
                  history: this.historySeries,
                  renderNamespace: this.renderNamespace + "-" + moduleDeviceProfile.id,
                  interactive: true,
                  animate: false,
                };
              let lineChartPanel: ComponentControllerElement = renderLineChartDetails2(
                  lineChartModuleOptions,
                  lineChartStateOptions,
                ),
                chartRefreshTimer = 0;
              const rerenderLineChart = () => {
                  if (
                    ((chartRefreshTimer = 0),
                    !lineChartPanel?.isConnected ||
                      this.detailsStateSync?.dialog !== customPopupDialog)
                  )
                    return;
                  const nextLineChartDetails = renderLineChartDetails2(
                    lineChartModuleOptions,
                    lineChartStateOptions,
                  );
                  (lineChartPanel.cleanupLineChartHover?.(),
                    lineChartPanel.replaceWith(nextLineChartDetails),
                    (lineChartPanel = nextLineChartDetails),
                    syncLineChartState());
                },
                scheduleChartRefresh = (chartRefreshDelayMs = 700) => {
                  chartRefreshTimer ||
                    (chartRefreshTimer = window.setTimeout(
                      rerenderLineChart,
                      Math.max(0, Number(chartRefreshDelayMs) || 0),
                    ));
                };
              popupRefreshCallbacks.push(() => scheduleChartRefresh(0));
              const syncLineChartState = () => {
                lineChartCurrentOutputElement.style.setProperty(
                  "--hb-custom-chart-accent",
                  lineChartPanel.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
                );
              };
              (syncLineChart(popupEntityState),
                syncLineChartState(),
                registerPopupStateHandler(entityId, (lineChartStateArg: any) => {
                  (syncLineChart(lineChartStateArg),
                    lineChartPanel.syncLineChartState?.(lineChartStateArg),
                    syncLineChartState());
                }),
                popupCleanupCallbacks.push(() => {
                  (window.clearTimeout(chartRefreshTimer),
                    lineChartPanel.cleanupLineChartHover?.());
                }),
                popupModuleSection.append(lineChartPanel));
            } else {
              if (moduleDeviceProfile.type === "switch") {
                let currentModuleState = popupEntityState,
                  isModuleTogglePending = false,
                  toggleStatusValue = "idle",
                  togglePressHandler: any = null;
                const isMomentaryButton = entityId.split(".")[0] === "button",
                  hn3 = createSwitchVisual({
                    label: popupModuleTitle.textContent,
                    interactive: !isCustomPopupPreview,
                    momentary: isMomentaryButton,
                    onToggle: () => togglePressHandler?.(),
                  });
                hn3.visual.classList.add("hb-custom-switch-visual");
                const syncPopupModuleState = (moduleState: any) => {
                  currentModuleState = moduleState;
                  const isModuleUnavailable =
                      !moduleState?.state || ["unknown", "unavailable"].includes(moduleState.state),
                    isModuleOn = !isMomentaryButton && moduleState?.state === "on";
                  (hn3.sync(isModuleOn, {
                    unavailable: isModuleUnavailable,
                    pending: isModuleTogglePending && toggleStatusValue !== "success",
                    success: toggleStatusValue === "success",
                  }),
                    (popupModuleStatus.textContent = isModuleUnavailable
                      ? "当前不可用"
                      : isMomentaryButton
                        ? toggleStatusValue === "success"
                          ? "执行成功"
                          : isModuleTogglePending
                            ? "正在执行"
                            : "按下执行"
                        : isModuleOn
                          ? "已开启"
                          : "已关闭"),
                    popupModuleStatus.classList.toggle(
                      "is-live",
                      (isMomentaryButton
                        ? isModuleTogglePending || toggleStatusValue === "success"
                        : isModuleOn) && !isModuleUnavailable,
                    ));
                };
                ((togglePressHandler = async () => {
                  if (
                    isCustomPopupPreview ||
                    isModuleTogglePending ||
                    ["unknown", "unavailable"].includes(currentModuleState?.state)
                  )
                    return;
                  const previousModuleState = currentModuleState;
                  ((isModuleTogglePending = true),
                    (toggleStatusValue = "idle"),
                    syncPopupModuleState(
                      isMomentaryButton
                        ? previousModuleState
                        : {
                            ...previousModuleState,
                            state: previousModuleState?.state === "on" ? "off" : "on",
                          },
                    ));
                  try {
                    isMomentaryButton
                      ? (await this.callEntityService("button", "press", entityId),
                        (toggleStatusValue = "success"),
                        syncPopupModuleState(currentModuleState),
                        await new Promise((timeoutResolve) =>
                          window.setTimeout(timeoutResolve, 900),
                        ))
                      : await this.callEntityService("homeassistant", "toggle", entityId);
                  } catch (moduleToggleError: any) {
                    ((toggleStatusValue = "idle"),
                      syncPopupModuleState(previousModuleState),
                      this.options.onError?.(moduleToggleError));
                  } finally {
                    ((isModuleTogglePending = false),
                      (toggleStatusValue = "idle"),
                      syncPopupModuleState(currentModuleState));
                  }
                }),
                  syncPopupModuleState(popupEntityState),
                  registerPopupStateHandler(entityId, syncPopupModuleState),
                  popupModuleSection.append(hn3.visual));
              } else {
                if (moduleDeviceProfile.type === "light") {
                  let popupBathLightControl: any = null;
                  popupModuleHeading.classList.add("has-light-visual");
                  const popupLightVisualElement = document.createElement("button");
                  ((popupLightVisualElement.type = "button"),
                    (popupLightVisualElement.className = "hb-light-visual hb-custom-light-visual"),
                    (popupLightVisualElement.style.animationDelay =
                      0.08 + moduleIndex * 0.07 + "s"),
                    (popupLightVisualElement.inert = isCustomPopupPreview),
                    popupLightVisualElement.setAttribute(
                      "aria-disabled",
                      String(isCustomPopupPreview),
                    ));
                  const lightVisualAuraElement = document.createElement("div");
                  lightVisualAuraElement.className = "hb-light-visual-aura";
                  const lightVisualLampElement = document.createElement("div");
                  lightVisualLampElement.className = "hb-light-visual-lamp";
                  for (const lightVisualPart of ["cord", "shade", "bulb", "filament"]) {
                    const lightVisualPartIcon = document.createElement("i");
                    ((lightVisualPartIcon.className = "hb-light-visual-" + lightVisualPart),
                      lightVisualLampElement.append(lightVisualPartIcon));
                  }
                  (popupLightVisualElement.append(lightVisualAuraElement, lightVisualLampElement),
                    popupModuleHeading.append(popupLightVisualElement));
                  const popupLightAttributes = popupEntityState?.attributes || {},
                    supportsLightColor = lightSupportsColor2(popupLightAttributes),
                    minMiredColorKelvin =
                      Number(popupLightAttributes.min_color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.max_mireds))
                        ? 1000000 / Number(popupLightAttributes.max_mireds)
                        : 2000),
                    maxMiredColorKelvin =
                      Number(popupLightAttributes.max_color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.min_mireds))
                        ? 1000000 / Number(popupLightAttributes.min_mireds)
                        : 6500),
                    NaN2 =
                      Number(popupLightAttributes.color_temp_kelvin) ||
                      (Number.isFinite(Number(popupLightAttributes.color_temp))
                        ? 1000000 / Number(popupLightAttributes.color_temp)
                        : NaN),
                    lightVisualValue = {
                      isOn: popupEntityState?.state === "on",
                      brightnessPercent: Number.isFinite(Number(popupLightAttributes.brightness))
                        ? (Number(popupLightAttributes.brightness) / 255) * 100
                        : 100,
                      colorTemperatureKelvin: Number.isFinite(NaN2)
                        ? NaN2
                        : (minMiredColorKelvin + maxMiredColorKelvin) / 2,
                      colorRgb: supportsLightColor ? lightColorRgb2(popupLightAttributes) : null,
                    },
                    syncLightVisual = (lightValueInput: ComponentPayload = {}) => {
                      const lightVisualAttributes = lightValueInput.attributes || {};
                      (typeof lightValueInput.isOn == "boolean"
                        ? (lightVisualValue.isOn = lightValueInput.isOn)
                        : typeof lightValueInput.state == "string" &&
                          (lightVisualValue.isOn = lightValueInput.state === "on"),
                        Number.isFinite(Number(lightValueInput.brightnessPercent))
                          ? (lightVisualValue.brightnessPercent = Number(
                              lightValueInput.brightnessPercent,
                            ))
                          : Number.isFinite(Number(lightVisualAttributes.brightness)) &&
                            (lightVisualValue.brightnessPercent =
                              (Number(lightVisualAttributes.brightness) / 255) * 100),
                        Number.isFinite(Number(lightValueInput.colorTemperatureKelvin))
                          ? (lightVisualValue.colorTemperatureKelvin = Number(
                              lightValueInput.colorTemperatureKelvin,
                            ))
                          : Number.isFinite(Number(lightVisualAttributes.color_temp_kelvin))
                            ? (lightVisualValue.colorTemperatureKelvin = Number(
                                lightVisualAttributes.color_temp_kelvin,
                              ))
                            : Number.isFinite(Number(lightVisualAttributes.color_temp)) &&
                              (lightVisualValue.colorTemperatureKelvin =
                                1000000 / Number(lightVisualAttributes.color_temp)),
                        Object.hasOwn(lightValueInput, "colorRgb")
                          ? (lightVisualValue.colorRgb = lightValueInput.colorRgb)
                          : lightValueInput.attributes &&
                            supportsLightColor &&
                            (lightVisualValue.colorRgb = lightColorRgb2(lightVisualAttributes)));
                      const brightnessLevel = Math.max(
                          1,
                          Math.min(100, Number(lightVisualValue.brightnessPercent) || 1),
                        ),
                        colorBlendRatio =
                          (Math.max(
                            2000,
                            Math.min(6500, Number(lightVisualValue.colorTemperatureKelvin) || 4250),
                          ) -
                            2000) /
                          4500,
                        coldColorRgb = [255, 132, 42],
                        warmRgbChannel = [172, 225, 255],
                        blendedRgbChannels =
                          lightVisualValue.colorRgb ||
                          coldColorRgb.map((channelValue, rgbChannelIndex) =>
                            Math.round(
                              channelValue +
                                (warmRgbChannel[rgbChannelIndex] - channelValue) * colorBlendRatio,
                            ),
                          );
                      (popupLightVisualElement.classList.toggle("is-on", lightVisualValue.isOn),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-color",
                          "rgb(" + blendedRgbChannels.join(",") + ")",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-opacity",
                          lightVisualValue.isOn
                            ? String(0.08 + (brightnessLevel / 100) * 0.92)
                            : "0",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-blur",
                          Math.round(15 + brightnessLevel * 1.14) + "px",
                        ),
                        popupLightVisualElement.style.setProperty(
                          "--hb-light-visual-scale",
                          String(0.62 + (brightnessLevel / 100) * 1.05),
                        ),
                        popupLightVisualElement.setAttribute(
                          "aria-pressed",
                          String(lightVisualValue.isOn),
                        ),
                        popupLightVisualElement.setAttribute(
                          "aria-label",
                          "" +
                            popupModuleTitle.textContent +
                            (lightVisualValue.isOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                        ),
                        (popupModuleStatus.textContent = lightVisualValue.isOn
                          ? "已开启"
                          : "已关闭"),
                        popupModuleStatus.classList.toggle("is-live", lightVisualValue.isOn));
                    };
                  syncLightVisual();
                  let isLightTogglePending = false;
                  (popupLightVisualElement.addEventListener("click", async () => {
                    if (isCustomPopupPreview || isLightTogglePending) return;
                    ((isLightTogglePending = true),
                      popupLightVisualElement.setAttribute("aria-busy", "true"));
                    const isOn2 = lightVisualValue.isOn;
                    syncLightVisual({
                      isOn: !isOn2,
                    });
                    try {
                      await this.callEntityService("homeassistant", "toggle", entityId);
                    } catch (lightToggleError: any) {
                      (syncLightVisual({
                        isOn: isOn2,
                      }),
                        this.options.onError?.(lightToggleError));
                    } finally {
                      ((isLightTogglePending = false),
                        popupLightVisualElement.removeAttribute("aria-busy"));
                    }
                  }),
                    (popupBathLightControl = this.createLightDetailsControls(
                      entityId,
                      popupEntityState,
                      {
                        interactive: !isCustomPopupPreview,
                        onTurnOn: () => {
                          syncLightVisual({
                            isOn: true,
                          });
                        },
                        onVisualChange: syncLightVisual,
                      },
                    )),
                    popupCleanupCallbacks.push(() =>
                      popupBathLightControl?.cleanupLightDetails?.(),
                    ),
                    registerPopupStateHandler(entityId, (popupLightStateArg: any) => {
                      (syncLightVisual(popupLightStateArg),
                        popupBathLightControl?.syncLightState?.(popupLightStateArg));
                    }),
                    popupModuleSection.append(popupBathLightControl));
                } else {
                  if (
                    moduleDeviceProfile.type === "climate" ||
                    moduleDeviceProfile.type === "water-heater"
                  ) {
                    popupModuleSection.classList.add("hb-custom-popup-module--climate");
                    const heaterType =
                      moduleDeviceProfile.type === "water-heater"
                        ? "water-heater"
                        : resolveClimateDeviceType2(
                            {
                              properties: {
                                deviceType:
                                  moduleDeviceProfile.deviceType ||
                                  moduleDeviceProfile.properties?.deviceType ||
                                  "auto",
                                label: moduleDeviceProfile.title || "",
                              },
                            },
                            popupEntityState,
                            entityId,
                          );
                    let currentClimateState = popupEntityState;
                    const climateModeLabelOptions = {
                        entityId: entityId,
                        entityMetadata: this.entityMetadata,
                        entityTranslations: this.entityTranslations,
                      },
                      climateVisualElement = document.createElement("button");
                    ((climateVisualElement.type = "button"),
                      (climateVisualElement.className =
                        "hb-climate-visual hb-custom-climate-visual"),
                      climateVisualElement.classList.toggle(
                        "is-bath-heater",
                        heaterType === "bath-heater",
                      ),
                      climateVisualElement.classList.toggle(
                        "is-water-heater",
                        heaterType === "water-heater",
                      ),
                      heaterType === "water-heater" &&
                        popupEntranceTargets.push({
                          visual: climateVisualElement,
                          distance: 168,
                          delay: 100 + moduleIndex * 45,
                        }),
                      (climateVisualElement.inert = isCustomPopupPreview),
                      climateVisualElement.setAttribute(
                        "aria-disabled",
                        String(isCustomPopupPreview),
                      ));
                    const climateVisualUnitBox = document.createElement("div");
                    climateVisualUnitBox.className = "hb-climate-visual-unit";
                    const climateVisualBrandElement = document.createElement("span");
                    ((climateVisualBrandElement.className = "hb-climate-visual-brand"),
                      (climateVisualBrandElement.textContent =
                        heaterType === "bath-heater"
                          ? "BATH HEATER"
                          : heaterType === "water-heater"
                            ? "SMART WATER"
                            : "SMART AIR"));
                    const climateVisualDisplayElement = document.createElement("strong");
                    climateVisualDisplayElement.className = "hb-climate-visual-display";
                    const climateVisualVentBox = document.createElement("div");
                    climateVisualVentBox.className = "hb-climate-visual-vent";
                    for (
                      let climateVentUnitIndex = 0;
                      climateVentUnitIndex < 5;
                      climateVentUnitIndex += 1
                    )
                      climateVisualVentBox.append(document.createElement("i"));
                    climateVisualUnitBox.append(
                      climateVisualBrandElement,
                      climateVisualDisplayElement,
                      climateVisualVentBox,
                    );
                    const climateVisualAirflowBox = document.createElement("div");
                    climateVisualAirflowBox.className = "hb-climate-visual-airflow";
                    for (
                      let climateAirflowUnitIndex = 0;
                      climateAirflowUnitIndex < 3;
                      climateAirflowUnitIndex += 1
                    )
                      climateVisualAirflowBox.append(document.createElement("i"));
                    climateVisualElement.append(climateVisualUnitBox, climateVisualAirflowBox);
                    const syncClimateVisual = ({
                        mode: climateMode = "off",
                        visualMode: climateVisualModeState = "off",
                        running: isClimateRunning = false,
                        accentColor: climateVisualAccentColor = "#65717a",
                        targetTemperature: targetTemperature,
                      }: ClimateVisualSyncPayload = {}) => {
                        const isClimateOn = climateVisualModeState !== "off";
                        (climateVisualElement.classList.toggle("is-on", isClimateOn),
                          climateVisualElement.classList.toggle("is-running", isClimateRunning),
                          climateVisualElement.classList.toggle(
                            "is-airflow-mode",
                            heaterType === "bath-heater" &&
                              isClimateOn &&
                              bathHeaterModeUsesAirflow2(climateMode),
                          ),
                          (climateVisualElement.dataset.visualMode = climateVisualModeState),
                          climateVisualElement.style.setProperty(
                            "--hb-climate-visual-accent",
                            climateVisualAccentColor,
                          ));
                        const finite =
                          targetTemperature != null &&
                          targetTemperature !== "" &&
                          Number.isFinite(Number(targetTemperature));
                        ((climateVisualDisplayElement.textContent = isClimateOn
                          ? finite
                            ? Number(targetTemperature) + "°"
                            : climateModeLabel2(climateMode, heaterType, climateModeLabelOptions)
                          : "OFF"),
                          heaterType === "bath-heater"
                            ? climateVisualElement.setAttribute(
                                "aria-label",
                                popupModuleTitle.textContent + "，点击切换浴霸灯",
                              )
                            : (climateVisualElement.setAttribute(
                                "aria-pressed",
                                String(isClimateOn),
                              ),
                              climateVisualElement.setAttribute(
                                "aria-label",
                                "" +
                                  popupModuleTitle.textContent +
                                  (isClimateOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                              )));
                      },
                      climateDetailsControls = this.createClimateDetailsControls(
                        entityId,
                        popupEntityState,
                        {
                          interactive: !isCustomPopupPreview,
                          deviceType: heaterType,
                          onVisualChange: ({
                            mode: climateStateMode,
                            visualMode: climateStateVisualMode,
                            running: isClimateStateRunning,
                            accentColor: climateStateAccent,
                            accentSoft: climateStateAccentSoft,
                            targetTemperature: climateStateTargetTemperature,
                          }: any) => {
                            ((popupModuleStatus.textContent = climateModeLabel2(
                              climateStateMode,
                              heaterType,
                              climateModeLabelOptions,
                            )),
                              popupModuleStatus.classList.toggle(
                                "is-live",
                                climateStateVisualMode !== "off",
                              ),
                              popupModuleStatus.classList.toggle(
                                "is-running",
                                isClimateStateRunning,
                              ),
                              popupModuleStatus.style.setProperty(
                                "--hb-climate-accent",
                                climateStateAccent,
                              ),
                              popupModuleStatus.style.setProperty(
                                "--hb-climate-accent-soft",
                                climateStateAccentSoft,
                              ),
                              syncClimateVisual({
                                mode: climateStateMode,
                                visualMode: climateStateVisualMode,
                                running: isClimateStateRunning,
                                accentColor: climateStateAccent,
                                targetTemperature: climateStateTargetTemperature,
                              }));
                          },
                        },
                      );
                    popupCleanupCallbacks.push(() =>
                      climateDetailsControls.cleanupClimateDetails?.(),
                    );
                    const bathLightEntityId =
                        heaterType === "bath-heater" ? popupDeviceProfile?.roles?.light : "",
                      bathLightMetadata = bathLightEntityId
                        ? this.entityMetadata.get(bathLightEntityId)
                        : heaterType === "bath-heater"
                          ? relatedDeviceDomainEntity2(this.entityMetadata, entityId, "light")
                          : null;
                    let moduleBathLightControl: any = null;
                    if (bathLightMetadata?.entityId) {
                      const moduleBathLightState = this.states.get(bathLightMetadata.entityId),
                        bathLightStateSnapshot = moduleBathLightState?.newState ||
                          moduleBathLightState || {
                            state: "unknown",
                            attributes: {} as Record<string, any>,
                          };
                      ((moduleBathLightControl = this.createBathHeaterLightControl(
                        bathLightMetadata.entityId,
                        bathLightStateSnapshot,
                        {
                          interactive: !isCustomPopupPreview,
                          onStateChange: ({
                            isOn: isModuleBathLightOn,
                            unavailable: isModuleBathLightUnavailable,
                          }: any) => {
                            (climateVisualElement.classList.toggle(
                              "is-light-on",
                              isModuleBathLightOn && !isModuleBathLightUnavailable,
                            ),
                              climateVisualElement.setAttribute(
                                "aria-pressed",
                                String(isModuleBathLightOn && !isModuleBathLightUnavailable),
                              ));
                          },
                        },
                      )),
                        climateDetailsControls.append(moduleBathLightControl),
                        registerPopupStateHandler(
                          bathLightMetadata.entityId,
                          (moduleBathLightStateArg: any) =>
                            moduleBathLightControl.syncBathLightState?.(moduleBathLightStateArg),
                        ));
                    }
                    const climateChildElements = Array.from(climateDetailsControls.children) as HTMLElement[],
                      climateThermostatElement = climateChildElements.find((childElement) =>
                        childElement.classList.contains("hb-climate-thermostat"),
                      ),
                      fanSliderElement = climateChildElements.find((fanSliderChildElement) =>
                        fanSliderChildElement.classList.contains("hb-climate-fan-slider"),
                      ),
                      climateLeftColumn = document.createElement("div");
                    climateLeftColumn.className = "hb-custom-climate-left";
                    const climateRightColumn = document.createElement("div");
                    ((climateRightColumn.className = "hb-custom-climate-right"),
                      climateThermostatElement &&
                        climateLeftColumn.append(climateThermostatElement),
                      fanSliderElement && climateLeftColumn.append(fanSliderElement),
                      climateRightColumn.append(
                        climateVisualElement,
                        ...climateChildElements.filter(
                          (remainingChild) =>
                            remainingChild !== climateThermostatElement &&
                            remainingChild !== fanSliderElement,
                        ),
                      ));
                    const hasPrimaryControls = !!(climateThermostatElement || fanSliderElement);
                    (climateDetailsControls.classList.toggle(
                      "without-primary-controls",
                      !hasPrimaryControls,
                    ),
                      climateDetailsControls.replaceChildren(
                        ...(hasPrimaryControls
                          ? [climateLeftColumn, climateRightColumn]
                          : [climateRightColumn]),
                      ));
                    let isClimateTogglePending = false;
                    (climateVisualElement.addEventListener("click", async () => {
                      if (heaterType === "bath-heater") {
                        moduleBathLightControl?.toggleBathLight
                          ? await moduleBathLightControl.toggleBathLight()
                          : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
                        return;
                      }
                      if (isCustomPopupPreview || isClimateTogglePending) return;
                      ((isClimateTogglePending = true),
                        climateVisualElement.setAttribute("aria-busy", "true"));
                      const previousClimateState = currentClimateState,
                        isClimatePoweredOn = climateIsPoweredOn2(previousClimateState, heaterType),
                        state2 =
                          climateDetailsControls.dataset.lastClimateMode ||
                          (isClimatePoweredOn ? previousClimateState.state : "auto"),
                        currentClimateSnapshot = {
                          state: isClimatePoweredOn ? "off" : state2,
                          attributes: {
                            ...(previousClimateState?.attributes || {}),
                            hvac_action: isClimatePoweredOn ? "off" : state2,
                          },
                        };
                      ((currentClimateState = currentClimateSnapshot),
                        climateDetailsControls.syncClimateState?.(currentClimateSnapshot));
                      try {
                        const climatePowerServicePayload = climatePowerCommand2(
                          entityId,
                          previousClimateState,
                          !isClimatePoweredOn,
                          heaterType,
                          climateDetailsControls.dataset.lastClimateMode || "",
                        );
                        await this.callEntityService(
                          climatePowerServicePayload.domain,
                          climatePowerServicePayload.service,
                          entityId,
                          climatePowerServicePayload.data,
                        );
                      } catch (climatePowerError: any) {
                        ((currentClimateState = previousClimateState),
                          climateDetailsControls.syncClimateState?.(previousClimateState),
                          this.options.onError?.(climatePowerError));
                      } finally {
                        ((isClimateTogglePending = false),
                          climateVisualElement.removeAttribute("aria-busy"));
                      }
                    }),
                      registerPopupStateHandler(entityId, (popupClimateStateArg: any) => {
                        ((currentClimateState = popupClimateStateArg),
                          climateDetailsControls.syncClimateState?.(popupClimateStateArg));
                      }),
                      popupModuleSection.append(climateDetailsControls));
                  } else {
                    if (moduleDeviceProfile.type === "cover") {
                      let currentCoverState = popupEntityState;
                      const coverAttributes = popupEntityState?.attributes || {},
                        isCoverAirer = coverComponentIsAirer2(
                          moduleDeviceProfile,
                          entityId,
                          popupEntityState,
                          this.entityMetadata,
                          this.deviceMetadata,
                        ),
                        coverSupportedFeatures = Number(coverAttributes.supported_features || 0),
                        coverIdentityText =
                          entityId +
                          " " +
                          (coverAttributes.friendly_name || "") +
                          " " +
                          (moduleDeviceProfile.title || ""),
                        finite2 =
                          Number.isFinite(Number(coverAttributes.current_tilt_position)) ||
                          !!(coverSupportedFeatures & 240),
                        test2 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(
                          coverIdentityText,
                        ),
                        coverKind = ["standard", "dream", "airer"].includes(
                          moduleDeviceProfile.properties?.coverKind,
                        )
                          ? moduleDeviceProfile.properties.coverKind
                          : "auto",
                        isDreamCurtain =
                          !isCoverAirer &&
                          (coverKind === "dream" || (coverKind === "auto" && (finite2 || test2))),
                        coverAirerLightEntityId =
                          (isCoverAirer
                            ? relatedAirerLightEntity2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerLightMetadata = coverAirerLightEntityId
                          ? this.states.get(coverAirerLightEntityId)
                          : null;
                      let coverAirerLightState =
                        airerLightMetadata?.newState || airerLightMetadata || null;
                      const coverPositionEntityId =
                          (isCoverAirer
                            ? relatedAirerPositionNumberEntity2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        coverPositionState = this.states.get(coverPositionEntityId),
                        coverCommandStateValue =
                          coverPositionState?.newState || coverPositionState || null,
                        coverPositionCommandEntityId =
                          (isCoverAirer
                            ? relatedAirerCurrentPositionSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerMotorEntityId =
                          (isCoverAirer
                            ? relatedAirerMotorSpeedSensor2(this.entityMetadata, entityId)
                            : null
                          )?.entityId || "",
                        airerMotorState = this.states.get(airerMotorEntityId),
                        airerMotorStateValue = airerMotorState?.newState || airerMotorState || null,
                        airerRoles = isCoverAirer
                          ? relatedAirerMotorActionEntities2(this.entityMetadata, entityId)
                          : {},
                        entries = Object.fromEntries(
                          Object.entries(airerRoles).map(([airerRoleKey, airerRoleMeta]) => [
                            airerRoleKey,
                            airerRoleMeta?.entityId || "",
                          ]),
                        ),
                        coverPositionCommandStateValue = this.states.get(
                          coverPositionCommandEntityId || coverPositionEntityId,
                        ),
                        coverPositionStateValue =
                          coverPositionCommandStateValue?.newState ||
                          coverPositionCommandStateValue ||
                          null,
                        isTiltSupported = isDreamCurtain && finite2,
                        isCoverMotorReversed = coverMotorIsReversedForComponent2(
                          moduleDeviceProfile,
                          this.entityMetadata,
                          this.states,
                          entityId,
                        ),
                        openServiceByDirection = isCoverMotorReversed
                          ? "open_cover"
                          : "close_cover",
                        closeServiceByDirection = isCoverMotorReversed
                          ? "close_cover"
                          : "open_cover",
                        coverDirection = ["left", "right"].includes(
                          moduleDeviceProfile.properties?.coverDirection,
                        )
                          ? moduleDeviceProfile.properties.coverDirection
                          : "split",
                        coverLayoutBox = document.createElement("div");
                      coverLayoutBox.className = "hb-custom-cover-layout";
                      const coverVisualElement = document.createElement("button");
                      ((coverVisualElement.type = "button"),
                        (coverVisualElement.className = "hb-cover-visual hb-custom-cover-visual"),
                        (coverVisualElement.inert = isCustomPopupPreview),
                        coverVisualElement.setAttribute(
                          "aria-disabled",
                          String(isCustomPopupPreview),
                        ));
                      const coverRailIcon = document.createElement("i");
                      coverRailIcon.className = "hb-cover-visual-rail";
                      const coverLeftPanelIcon = document.createElement("i");
                      coverLeftPanelIcon.className = "hb-cover-visual-panel left";
                      const coverRightPanelIcon = document.createElement("i");
                      coverRightPanelIcon.className = "hb-cover-visual-panel right";
                      const coverSlatsBox = document.createElement("span");
                      coverSlatsBox.className = "hb-cover-visual-slats";
                      const coverSlatTotal = 13;
                      for (
                        let coverSlatPosition = 0;
                        coverSlatPosition < coverSlatTotal;
                        coverSlatPosition += 1
                      ) {
                        const coverSlatIcon = document.createElement("span");
                        coverSlatIcon.className = "hb-cover-visual-slat";
                        const coverSlatDetailIcon = document.createElement("i");
                        coverSlatIcon.style.setProperty(
                          "--hb-cover-slat-index",
                          String(coverSlatPosition),
                        );
                        const abs3 =
                          coverDirection === "right"
                            ? coverSlatTotal - 1 - coverSlatPosition
                            : coverDirection === "split"
                              ? Math.abs((coverSlatTotal - 1) / 2 - coverSlatPosition)
                              : coverSlatPosition;
                        coverSlatIcon.style.setProperty(
                          "--hb-cover-slat-delay-index",
                          String(abs3),
                        );
                        const retractedShiftPx =
                          coverDirection === "left"
                            ? -coverSlatPosition * 14.5
                            : coverDirection === "right"
                              ? (coverSlatTotal - 1 - coverSlatPosition) * 14.5
                              : coverSlatPosition <= (coverSlatTotal - 1) / 2
                                ? -coverSlatPosition * 14.5
                                : (coverSlatTotal - 1 - coverSlatPosition) * 14.5;
                        (coverSlatIcon.style.setProperty(
                          "--hb-cover-retracted-shift",
                          retractedShiftPx + "px",
                        ),
                          coverSlatIcon.append(coverSlatDetailIcon),
                          coverSlatsBox.append(coverSlatIcon));
                      }
                      const coverWindowIcon = document.createElement("i");
                      ((coverWindowIcon.className = "hb-cover-visual-window"),
                        coverVisualElement.classList.toggle("is-dream", isDreamCurtain),
                        coverVisualElement.classList.toggle("is-airer", isCoverAirer),
                        coverVisualElement.classList.add("direction-" + coverDirection),
                        coverVisualElement.append(
                          coverWindowIcon,
                          coverRailIcon,
                          coverLeftPanelIcon,
                          coverRightPanelIcon,
                          coverSlatsBox,
                        ),
                        isCoverAirer && createAirerVisual(coverVisualElement));
                      const syncAirerLight = (nextAirerLightState = coverAirerLightState) => {
                        if (!isCoverAirer) return;
                        coverAirerLightState = nextAirerLightState || coverAirerLightState;
                        const isCoverAirerLightUnavailable =
                            !coverAirerLightEntityId ||
                            ["unknown", "unavailable"].includes(
                              String(coverAirerLightState?.state || "unknown"),
                            ),
                          isCoverAirerLightOn = coverAirerLightState?.state === "on";
                        (coverVisualElement.classList.toggle(
                          "is-light-on",
                          isCoverAirerLightOn && !isCoverAirerLightUnavailable,
                        ),
                          coverVisualElement.classList.toggle(
                            "is-light-unavailable",
                            isCoverAirerLightUnavailable,
                          ),
                          (coverVisualElement.disabled =
                            isCustomPopupPreview || isCoverAirerLightUnavailable),
                          coverVisualElement.setAttribute(
                            "aria-pressed",
                            String(isCoverAirerLightOn && !isCoverAirerLightUnavailable),
                          ),
                          coverVisualElement.setAttribute(
                            "aria-label",
                            isCoverAirerLightUnavailable
                              ? "晾衣机灯光实体不可用"
                              : "晾衣机灯光" +
                                  (isCoverAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                          ));
                      };
                      syncAirerLight();
                      let airerCurrentPosition = 0;
                      const coverAirerPositionCalibration = airerPositionCalibration2(
                          this.entityMetadata,
                          this.deviceMetadata,
                          entityId,
                        ),
                        syncAirerVisual = ({
                          position: airerVisualPosition = 0,
                          state: airerVisualState = "",
                        } = {}) => {
                          const clampedAirerPosition = Math.max(
                              0,
                              Math.min(100, Number(airerVisualPosition) || 0),
                            ),
                            coverDisplayState = coverPresentationState2(
                              {
                                state: airerVisualState,
                                attributes: {
                                  current_position: clampedAirerPosition,
                                },
                              },
                              isCoverMotorReversed,
                            ),
                            coverPhysicalState = physicalCoverState2(
                              airerVisualState || currentCoverState?.state,
                              isCoverMotorReversed,
                            ),
                            isCoverFullyOpen =
                              coverPhysicalState === "open" || coverPhysicalState === "opening";
                          ((airerCurrentPosition = clampedAirerPosition),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-open-position",
                              clampedAirerPosition + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-airer-drop",
                              airerVisualDrop2(clampedAirerPosition) + "px",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-panel-width",
                              45.9 - clampedAirerPosition * 0.331 + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-single-panel-width",
                              91.8 - clampedAirerPosition * 0.79 + "%",
                            ),
                            coverVisualElement.style.setProperty(
                              "--hb-cover-slat-angle",
                              clampedAirerPosition * 1.8 + "deg",
                            ),
                            coverVisualElement.classList.toggle(
                              "is-tilt-reversed",
                              clampedAirerPosition > 50,
                            ),
                            coverVisualElement.classList.toggle(
                              "is-tilt-center",
                              Math.abs(clampedAirerPosition - 50) <= 2,
                            ),
                            coverVisualElement.classList.toggle(
                              "is-open",
                              isDreamCurtain
                                ? isCoverFullyOpen
                                : coverDisplayState === "open" || coverDisplayState === "opening",
                            ),
                            coverVisualElement.classList.toggle(
                              "is-moving",
                              airerVisualState === "opening" || airerVisualState === "closing",
                            ),
                            coverVisualElement.setAttribute(
                              "aria-pressed",
                              String(
                                isDreamCurtain
                                  ? isCoverFullyOpen
                                  : coverDisplayState === "open" || coverDisplayState === "opening",
                              ),
                            ),
                            isCoverAirer
                              ? (popupModuleStatus.textContent =
                                  entityStateText(coverDisplayState) ||
                                  Math.round(clampedAirerPosition) + "%")
                              : isDreamCurtain
                                ? (popupModuleStatus.textContent = dreamCurtainStatusText2(
                                    airerVisualState || currentCoverState?.state,
                                    clampedAirerPosition,
                                    isCoverMotorReversed,
                                  ))
                                : (popupModuleStatus.textContent =
                                    {
                                      open: "已打开",
                                      closed: "已关闭",
                                      opening: "正在打开",
                                      closing: "正在关闭",
                                    }[coverDisplayState] || Math.round(clampedAirerPosition) + "%"),
                            popupModuleStatus.classList.toggle(
                              "is-live",
                              isDreamCurtain
                                ? isCoverFullyOpen
                                : coverDisplayState === "open" || coverDisplayState === "opening",
                            ),
                            isCoverAirer ||
                              coverVisualElement.setAttribute(
                                "aria-label",
                                isDreamCurtain
                                  ? "" +
                                      popupModuleTitle.textContent +
                                      dreamCurtainStatusText2(
                                        airerVisualState || currentCoverState?.state,
                                        clampedAirerPosition,
                                        isCoverMotorReversed,
                                      )
                                  : "" +
                                      popupModuleTitle.textContent +
                                      (coverDisplayState === "open" ||
                                      coverDisplayState === "opening"
                                        ? "已打开，点击关闭"
                                        : "已关闭，点击打开"),
                              ));
                        },
                        coverDetailsControls = this.createCoverDetailsControls(
                          entityId,
                          popupEntityState,
                          {
                            interactive: !isCustomPopupPreview,
                            dream: isDreamCurtain,
                            airer: isCoverAirer,
                            tilt: isTiltSupported,
                            motorReversed: isCoverMotorReversed,
                            positionState: coverPositionStateValue,
                            positionCommandEntityId: coverPositionEntityId,
                            positionCommandState: coverCommandStateValue,
                            motorState: airerMotorStateValue,
                            airerActionEntityIds: entries,
                            positionCalibration: coverAirerPositionCalibration,
                            onVisualChange: syncAirerVisual,
                            onCurtainPositionChange: ({
                              retracted: isCurtainFolded,
                              moving: isAirerCurtainMoving,
                            }: any) => {
                              (coverVisualElement.classList.toggle(
                                "is-curtain-retracted",
                                isCurtainFolded,
                              ),
                                coverVisualElement.classList.toggle(
                                  "is-curtain-moving",
                                  isAirerCurtainMoving,
                                ),
                                (coverVisualElement.dataset.curtainRetracted =
                                  String(isCurtainFolded)),
                                isDreamCurtain &&
                                  ((popupModuleStatus.textContent =
                                    dreamCurtainStatusFromRetraction2(
                                      isCurtainFolded,
                                      isAirerCurtainMoving,
                                      airerCurrentPosition,
                                    )),
                                  popupModuleStatus.classList.toggle("is-live", isCurtainFolded)));
                            },
                          },
                        );
                      let isCoverTogglePending = false;
                      (coverVisualElement.addEventListener("click", async () => {
                        if (isCustomPopupPreview || isCoverTogglePending) return;
                        if (
                          ((isCoverTogglePending = true),
                          coverVisualElement.setAttribute("aria-busy", "true"),
                          isCoverAirer)
                        ) {
                          const previousAirerLightState = coverAirerLightState;
                          syncAirerLight({
                            ...(coverAirerLightState || {}),
                            state: coverAirerLightState?.state === "on" ? "off" : "on",
                          });
                          try {
                            await this.callEntityService(
                              "homeassistant",
                              "toggle",
                              coverAirerLightEntityId,
                            );
                          } catch (coverToggleError: any) {
                            (syncAirerLight(previousAirerLightState),
                              this.options.onError?.(coverToggleError));
                          } finally {
                            ((isCoverTogglePending = false),
                              coverVisualElement.removeAttribute("aria-busy"));
                          }
                          return;
                        }
                        const initialCoverPosition = airerCurrentPosition,
                          nextCurtainRetracted =
                            coverDetailsControls.isDreamCurtainRetracted?.() ??
                            coverVisualElement.dataset.curtainRetracted === "true",
                          isCoverClosed = initialCoverPosition > COVER_CLOSED_POSITION_EPSILON;
                        isDreamCurtain
                          ? coverDetailsControls.beginDreamCurtainMotion?.(!nextCurtainRetracted)
                          : coverDetailsControls.beginCoverMotion?.(
                              isCoverClosed ? 0 : 100,
                              isCoverClosed ? "closing" : "opening",
                            );
                        try {
                          await this.callEntityService(
                            "cover",
                            isDreamCurtain
                              ? dreamCurtainToggleService2(
                                  nextCurtainRetracted,
                                  closeServiceByDirection,
                                  openServiceByDirection,
                                )
                              : isCoverClosed
                                ? openServiceByDirection
                                : closeServiceByDirection,
                            entityId,
                          );
                        } catch (coverPositionError: any) {
                          (isDreamCurtain
                            ? (coverDetailsControls.cancelDreamCurtainMotion?.(),
                              coverDetailsControls.setDreamCurtainRetracted?.(
                                nextCurtainRetracted,
                                false,
                              ))
                            : coverDetailsControls.cancelCoverMotion?.(),
                            coverDetailsControls.syncCoverState?.(currentCoverState),
                            this.options.onError?.(coverPositionError));
                        } finally {
                          ((isCoverTogglePending = false),
                            coverVisualElement.removeAttribute("aria-busy"));
                        }
                      }),
                        registerPopupStateHandler(entityId, (coverSyncStateArg: any) => {
                          ((currentCoverState = coverSyncStateArg),
                            coverDetailsControls.syncCoverState?.(coverSyncStateArg));
                        }),
                        coverAirerLightEntityId &&
                          registerPopupStateHandler(coverAirerLightEntityId, syncAirerLight),
                        coverPositionCommandEntityId &&
                          registerPopupStateHandler(
                            coverPositionCommandEntityId,
                            (popupCoverCommandArg: any) =>
                              coverDetailsControls.syncCoverPositionState?.(popupCoverCommandArg),
                          ),
                        coverPositionEntityId &&
                          registerPopupStateHandler(
                            coverPositionEntityId,
                            (popupCoverPositionStateArg: any) => {
                              (coverDetailsControls.syncCoverPositionCommandState?.(
                                popupCoverPositionStateArg,
                              ),
                                coverPositionCommandEntityId ||
                                  coverDetailsControls.syncCoverPositionState?.(
                                    popupCoverPositionStateArg,
                                  ));
                            },
                          ),
                        airerMotorEntityId &&
                          registerPopupStateHandler(airerMotorEntityId, (airerMotorStateArg: any) =>
                            coverDetailsControls.syncAirerMotorState?.(airerMotorStateArg),
                          ),
                        popupCleanupCallbacks.push(() =>
                          coverDetailsControls.cleanupCoverDetails?.(),
                        ),
                        coverLayoutBox.append(coverVisualElement, coverDetailsControls),
                        popupModuleSection.append(coverLayoutBox));
                    } else {
                      if (moduleDeviceProfile.type === "air-purifier") {
                        let airPurifierSnapshot = popupEntityState || {
                          entityId: entityId,
                          state: "unknown",
                          attributes: {} as Record<string, any>,
                        };
                        const popupAirPurifierVisualElement = document.createElement("button");
                        ((popupAirPurifierVisualElement.type = "button"),
                          (popupAirPurifierVisualElement.className =
                            "hb-air-purifier-visual hb-custom-air-purifier-visual"),
                          (popupAirPurifierVisualElement.inert = isCustomPopupPreview),
                          popupAirPurifierVisualElement.setAttribute(
                            "aria-disabled",
                            String(isCustomPopupPreview),
                          ));
                        const popupPurifierAuraIcon = document.createElement("i");
                        popupPurifierAuraIcon.className = "hb-air-purifier-visual-aura";
                        const popupPurifierAirflowIcon = document.createElement("span");
                        popupPurifierAirflowIcon.className = "hb-air-purifier-visual-airflow";
                        for (
                          let popupPurifierAirflowIndex = 0;
                          popupPurifierAirflowIndex < 4;
                          popupPurifierAirflowIndex += 1
                        )
                          popupPurifierAirflowIcon.append(document.createElement("i"));
                        const popupPurifierBodyIcon = document.createElement("span");
                        popupPurifierBodyIcon.className = "hb-air-purifier-visual-body";
                        const popupPurifierTopIcon = document.createElement("i");
                        popupPurifierTopIcon.className = "hb-air-purifier-visual-top";
                        const popupPurifierVentIcon = document.createElement("i");
                        popupPurifierVentIcon.className = "hb-air-purifier-visual-vent";
                        const popupPurifierDisplayIcon = document.createElement("span");
                        popupPurifierDisplayIcon.className = "hb-air-purifier-visual-display";
                        const popupPurifierDisplayLabel = document.createElement("strong");
                        (popupPurifierDisplayIcon.append(popupPurifierDisplayLabel),
                          popupPurifierBodyIcon.append(
                            popupPurifierTopIcon,
                            popupPurifierVentIcon,
                            popupPurifierDisplayIcon,
                          ),
                          popupAirPurifierVisualElement.append(
                            popupPurifierAuraIcon,
                            popupPurifierAirflowIcon,
                            popupPurifierBodyIcon,
                          ));
                        const capabilityDetailsControls4 = this.createCapabilityDetailsControls(
                            entityId,
                            airPurifierSnapshot,
                            {
                              interactive: !isCustomPopupPreview,
                              variant: "air-purifier",
                            },
                          ),
                          popupPurifierLayoutBox = document.createElement("div");
                        popupPurifierLayoutBox.className =
                          "hb-air-purifier-layout hb-custom-air-purifier-layout";
                        const popupPurifierSummarySection = document.createElement("section");
                        popupPurifierSummarySection.className = "hb-air-purifier-summary";
                        const popupPurifierGaugeWrapElement = document.createElement("div");
                        popupPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
                        const popupPurifierGaugeBox = document.createElement("div");
                        popupPurifierGaugeBox.className = "hb-air-purifier-gauge is-quality";
                        const popupPurifierGaugeOrbitIcon = document.createElement("i");
                        popupPurifierGaugeOrbitIcon.className = "hb-air-purifier-gauge-orbit";
                        const popupPurifierArcStartIcon = document.createElement("i");
                        popupPurifierArcStartIcon.className = "hb-air-purifier-arc-cap start";
                        const popupPurifierArcEndIcon = document.createElement("i");
                        popupPurifierArcEndIcon.className = "hb-air-purifier-arc-cap end";
                        const popupPurifierGaugeContentElement = document.createElement("div");
                        popupPurifierGaugeContentElement.className =
                          "hb-air-purifier-gauge-content";
                        const popupPurifierQualityCaption = document.createElement("small");
                        popupPurifierQualityCaption.textContent = "室内空气质量";
                        const popupPurifierQualityValueElement = document.createElement("strong"),
                          popupPurifierQualityNumberElement = document.createElement("span"),
                          popupPurifierDeviceStatus = document.createElement("span");
                        ((popupPurifierDeviceStatus.textContent = "设备状态 --"),
                          popupPurifierQualityValueElement.append(
                            popupPurifierQualityNumberElement,
                          ),
                          popupPurifierGaugeContentElement.append(
                            popupPurifierQualityCaption,
                            popupPurifierQualityValueElement,
                            popupPurifierDeviceStatus,
                          ),
                          popupPurifierGaugeBox.append(
                            popupPurifierArcStartIcon,
                            popupPurifierArcEndIcon,
                            popupPurifierGaugeContentElement,
                          ),
                          popupPurifierGaugeWrapElement.append(
                            popupPurifierGaugeOrbitIcon,
                            popupPurifierGaugeBox,
                          ));
                        const popupPurifierControlsSection = document.createElement("section");
                        ((popupPurifierControlsSection.className = "hb-air-purifier-controls-pane"),
                          popupPurifierControlsSection.append(capabilityDetailsControls4));
                        const popupMetricLabels = {
                            pm25: "PM2.5",
                            pm10: "PM10",
                            filterLife: "滤芯寿命",
                            filterLeftTime: "滤芯剩余时间",
                            hcho: "甲醛",
                            temperature: "温度",
                            humidity: "湿度",
                          },
                          airPurifierMetricCandidates = [
                            {
                              role: "pm25",
                              ids: [popupDeviceProfile?.roles?.pm25],
                            },
                            {
                              role: "pm10",
                              ids: [popupDeviceProfile?.roles?.pm10],
                            },
                            {
                              role: "filterLife",
                              ids: [
                                popupDeviceProfile?.roles?.filterLife,
                                popupDeviceProfile?.roles?.filterLeftTime,
                              ],
                            },
                            {
                              role: "hcho",
                              ids: [popupDeviceProfile?.roles?.hcho],
                            },
                            {
                              role: "temperature",
                              ids: [popupDeviceProfile?.roles?.temperature],
                            },
                            {
                              role: "humidity",
                              ids: [popupDeviceProfile?.roles?.humidity],
                            },
                          ].map((metricCandidateEntry) => ({
                            ...metricCandidateEntry,
                            ids: metricCandidateEntry.ids.filter(Boolean),
                          })),
                          resolveEntityStateById = (resolveStateEntityId: any) => {
                            const stateForEntity = this.states.get(resolveStateEntityId);
                            return stateForEntity?.newState || stateForEntity || null;
                          },
                          hasStateForEntity = (candidateEntityId: any) => {
                            const resolvedStateValue = resolveEntityStateById(candidateEntityId);
                            return (
                              resolvedStateValue &&
                              !["unknown", "unavailable"].includes(
                                String(resolvedStateValue.state || "").toLowerCase(),
                              ) &&
                              Number.isFinite(Number(resolvedStateValue.state))
                            );
                          },
                          slice5 = airPurifierMetricCandidates
                            .map((metricCandidateGroup) => ({
                              ...metricCandidateGroup,
                              id:
                                metricCandidateGroup.ids.find((candidateId) =>
                                  hasStateForEntity(candidateId),
                                ) ||
                                metricCandidateGroup.ids.find((knownEntityId) =>
                                  this.entityMetadata.has(knownEntityId),
                                ),
                            }))
                            .filter((metricCandidateFilter) => metricCandidateFilter.id)
                            .slice(0, 3),
                          popupSecondaryMetricsElement = document.createElement("div");
                        popupSecondaryMetricsElement.className =
                          "hb-air-purifier-secondary-metrics hb-custom-air-purifier-metrics";
                        for (const popupMetricEntry of slice5) {
                          const popupMetricMetadata = this.entityMetadata.get(popupMetricEntry.id),
                            popupMetricRow = document.createElement("div");
                          popupMetricRow.className =
                            "hb-air-purifier-secondary-metric hb-air-purifier-secondary-metric--" +
                            popupMetricEntry.role;
                          const popupMetricLabel = document.createElement("small");
                          popupMetricLabel.textContent =
                            (popupMetricLabels as any)[popupMetricEntry.role] || popupMetricEntry.role;
                          const popupMetricValueElement = document.createElement("strong");
                          (popupMetricRow.append(popupMetricLabel, popupMetricValueElement),
                            popupSecondaryMetricsElement.append(popupMetricRow));
                          const syncPopupMetric = (popupMetricState: any) => {
                            popupMetricValueElement.textContent = [
                              "unknown",
                              "unavailable",
                            ].includes(String(popupMetricState?.state || "").toLowerCase())
                              ? "--"
                              : (
                                  (popupMetricState?.state ?? "--") +
                                  " " +
                                  (popupMetricState?.attributes?.unit_of_measurement ||
                                    popupMetricMetadata?.unitOfMeasurement ||
                                    "")
                                ).trim();
                          };
                          (syncPopupMetric(resolveEntityStateById(popupMetricEntry.id)),
                            registerPopupStateHandler(popupMetricEntry.id, syncPopupMetric));
                        }
                        const airQualityRoleEntityId = popupDeviceProfile?.roles?.airQuality,
                          particulateRoleEntityId = popupDeviceProfile?.roles?.pm25,
                          syncPopupAirQuality = () => {
                            const airQualityStateValue =
                                resolveEntityStateById(airQualityRoleEntityId),
                              particulateStateValue =
                                resolveEntityStateById(particulateRoleEntityId),
                              airQualityStateText = ["unknown", "unavailable"].includes(
                                String(airQualityStateValue?.state || "").toLowerCase(),
                              )
                                ? ""
                                : String(airQualityStateValue?.state || "").trim(),
                              particulateNumericValue = Number(particulateStateValue?.state),
                              lowerCase5 = airQualityStateText.toLowerCase();
                            let airQualityDisplayText = airQualityStateText,
                              popupQualityLevel = "unknown";
                            (/excellent|优/.test(lowerCase5)
                              ? (popupQualityLevel = "excellent")
                              : /good|良/.test(lowerCase5)
                                ? (popupQualityLevel = "good")
                                : /moderate|fair|一般|轻度|污染/.test(lowerCase5)
                                  ? (popupQualityLevel = "warning")
                                  : /poor|unhealthy|较差|中度|重度|严重/.test(lowerCase5)
                                    ? (popupQualityLevel = "poor")
                                    : Number.isFinite(particulateNumericValue) &&
                                      ((popupQualityLevel =
                                        particulateNumericValue <= 15
                                          ? "excellent"
                                          : particulateNumericValue <= 35
                                            ? "good"
                                            : particulateNumericValue <= 75
                                              ? "warning"
                                              : "poor"),
                                      (airQualityDisplayText = {
                                        excellent: "空气优",
                                        good: "空气良",
                                        warning: "轻度污染",
                                        poor: "空气较差",
                                      }[popupQualityLevel]!)),
                              (popupPurifierQualityNumberElement.textContent =
                                airQualityDisplayText || "--"),
                              popupPurifierGaugeBox.style.setProperty(
                                "--hb-air-purifier-progress",
                                {
                                  excellent: 72,
                                  good: 58,
                                  warning: 42,
                                  poor: 26,
                                  unknown: 0,
                                }[popupQualityLevel] + "%",
                              ),
                              popupPurifierGaugeBox.classList.toggle(
                                "is-warning",
                                popupQualityLevel === "warning",
                              ),
                              popupPurifierGaugeBox.classList.toggle(
                                "is-poor",
                                popupQualityLevel === "poor",
                              ));
                            const popupPurifierAccent = {
                                excellent: "#76cfa1",
                                good: "#76cfa1",
                                warning: "#e4b15f",
                                poor: "#db7770",
                                unknown: "#7d8990",
                              }[popupQualityLevel],
                              popupPurifierAccentSoft = {
                                excellent: "rgba(118,207,161,.13)",
                                good: "rgba(118,207,161,.13)",
                                warning: "rgba(228,177,95,.15)",
                                poor: "rgba(219,119,112,.15)",
                                unknown: "rgba(125,137,144,.13)",
                              }[popupQualityLevel];
                            (popupModuleSection.style.setProperty(
                              "--hb-air-purifier-accent",
                              popupPurifierAccent!,
                            ),
                              popupModuleSection.style.setProperty(
                                "--hb-air-purifier-accent-soft",
                                popupPurifierAccentSoft!,
                              ));
                          };
                        (airQualityRoleEntityId &&
                          registerPopupStateHandler(airQualityRoleEntityId, syncPopupAirQuality),
                          particulateRoleEntityId &&
                            particulateRoleEntityId !== airQualityRoleEntityId &&
                            registerPopupStateHandler(particulateRoleEntityId, syncPopupAirQuality),
                          syncPopupAirQuality());
                        const syncPopupPurifierState = (
                          nextPopupPurifierState = airPurifierSnapshot,
                        ) => {
                          airPurifierSnapshot = nextPopupPurifierState || airPurifierSnapshot;
                          const lowerCase6 = String(airPurifierSnapshot?.state || "").toLowerCase(),
                            isPopupPurifierUnavailable = ["unknown", "unavailable"].includes(
                              lowerCase6,
                            ),
                            isPopupPurifierOn = !isPopupPurifierUnavailable && lowerCase6 !== "off";
                          ((popupPurifierDisplayLabel.textContent = isPopupPurifierOn
                            ? "ON"
                            : "OFF"),
                            popupAirPurifierVisualElement.classList.toggle(
                              "is-on",
                              isPopupPurifierOn,
                            ),
                            popupAirPurifierVisualElement.classList.toggle(
                              "is-unavailable",
                              isPopupPurifierUnavailable,
                            ),
                            popupAirPurifierVisualElement.setAttribute(
                              "aria-pressed",
                              String(isPopupPurifierOn),
                            ),
                            popupAirPurifierVisualElement.setAttribute(
                              "aria-label",
                              "" +
                                popupModuleTitle.textContent +
                                (isPopupPurifierOn ? "已开启，点击关闭" : "已关闭，点击开启"),
                            ),
                            (popupModuleStatus.textContent = isPopupPurifierUnavailable
                              ? "当前不可用"
                              : isPopupPurifierOn
                                ? "已开启"
                                : "已关闭"),
                            popupModuleStatus.classList.toggle("is-live", isPopupPurifierOn),
                            (popupPurifierDeviceStatus.textContent = isPopupPurifierUnavailable
                              ? "设备不可用"
                              : isPopupPurifierOn
                                ? "净化中"
                                : "已关闭"),
                            popupPurifierGaugeBox.classList.toggle("is-running", isPopupPurifierOn),
                            popupPurifierGaugeOrbitIcon.classList.toggle(
                              "is-running",
                              isPopupPurifierOn,
                            ),
                            capabilityDetailsControls4.syncCapabilityState?.(airPurifierSnapshot));
                        };
                        syncPopupPurifierState();
                        let isPopupPurifierPending = false;
                        (popupAirPurifierVisualElement.addEventListener("click", async () => {
                          if (
                            isCustomPopupPreview ||
                            isPopupPurifierPending ||
                            ["unknown", "unavailable"].includes(
                              String(airPurifierSnapshot?.state || "").toLowerCase(),
                            )
                          )
                            return;
                          ((isPopupPurifierPending = true),
                            popupAirPurifierVisualElement.setAttribute("aria-busy", "true"));
                          const previousPopupPurifierState = airPurifierSnapshot,
                            isPopupPurifierOff =
                              String(previousPopupPurifierState?.state || "").toLowerCase() ===
                              "off";
                          syncPopupPurifierState({
                            ...previousPopupPurifierState,
                            state: isPopupPurifierOff ? "on" : "off",
                          });
                          try {
                            await this.callEntityService(
                              "fan",
                              isPopupPurifierOff ? "turn_on" : "turn_off",
                              entityId,
                            );
                          } catch (popupPurifierError: any) {
                            (syncPopupPurifierState(previousPopupPurifierState),
                              this.options.onError?.(popupPurifierError));
                          } finally {
                            ((isPopupPurifierPending = false),
                              popupAirPurifierVisualElement.removeAttribute("aria-busy"));
                          }
                        }),
                          registerPopupStateHandler(entityId, syncPopupPurifierState),
                          popupModuleHeading.append(popupAirPurifierVisualElement),
                          popupPurifierSummarySection.append(
                            popupPurifierGaugeWrapElement,
                            popupSecondaryMetricsElement,
                          ),
                          popupPurifierLayoutBox.append(
                            popupPurifierSummarySection,
                            popupPurifierControlsSection,
                          ),
                          popupModuleSection.append(popupPurifierLayoutBox));
                      } else {
                        if (moduleDeviceProfile.type === "media-player") {
                          ((popupModuleTitle.textContent = popupModuleDialogTitle(
                            moduleDeviceProfile,
                            popupEntityState,
                            "媒体",
                          )),
                            popupModuleSection.classList.add("hb-media-player-details"));
                          const popupMediaSpeakerVisualElement = document.createElement("div");
                          ((popupMediaSpeakerVisualElement.className = "hb-media-speaker-visual"),
                            popupMediaSpeakerVisualElement.setAttribute("aria-hidden", "true"),
                            popupMediaSpeakerVisuals.push(popupMediaSpeakerVisualElement));
                          const popupSpeakerBodyIcon = document.createElement("i");
                          popupSpeakerBodyIcon.className = "hb-media-speaker-body";
                          const popupSpeakerArtworkImage = document.createElement("img");
                          ((popupSpeakerArtworkImage.className = "hb-media-speaker-artwork"),
                            (popupSpeakerArtworkImage.alt = ""),
                            (popupSpeakerArtworkImage.hidden = true));
                          const popupSpeakerLightIcon = document.createElement("i");
                          ((popupSpeakerLightIcon.className = "hb-media-speaker-light"),
                            popupMediaSpeakerVisualElement.append(
                              popupSpeakerBodyIcon,
                              popupSpeakerArtworkImage,
                              popupSpeakerLightIcon,
                            ),
                            popupModuleHeading.append(popupMediaSpeakerVisualElement));
                          const popupMediaBody: any = document.createElement("div");
                          popupMediaBody.className =
                            "hb-media-player-details-body hb-custom-media-player-body";
                          const popupNowPlayingSection: any = document.createElement("section");
                          popupNowPlayingSection.className = "hb-media-player-now-playing";
                          const popupMediaArtworkImage = document.createElement("img");
                          ((popupMediaArtworkImage.className = "hb-media-player-artwork"),
                            (popupMediaArtworkImage.alt = ""),
                            (popupMediaArtworkImage.hidden = true));
                          const popupMediaCopyBox = document.createElement("div");
                          popupMediaCopyBox.className = "hb-media-player-copy";
                          const popupMediaTitleLabel = document.createElement("strong"),
                            popupMediaSubtitleLabel = document.createElement("span"),
                            popupMediaProgressRow = document.createElement("div");
                          ((popupMediaProgressRow.className = "hb-media-player-progress"),
                            (popupMediaProgressRow.hidden = true));
                          const popupMediaProgressBar = document.createElement("progress");
                          ((popupMediaProgressBar.max = 1), (popupMediaProgressBar.value = 0));
                          const popupMediaTimeRow = document.createElement("span"),
                            popupMediaElapsedLabel = document.createElement("time"),
                            popupMediaDurationLabel = document.createElement("time");
                          (popupMediaTimeRow.append(
                            popupMediaElapsedLabel,
                            popupMediaDurationLabel,
                          ),
                            popupMediaProgressRow.append(popupMediaProgressBar, popupMediaTimeRow),
                            popupMediaCopyBox.append(
                              popupMediaTitleLabel,
                              popupMediaSubtitleLabel,
                              popupMediaProgressRow,
                            ),
                            popupNowPlayingSection.append(
                              popupMediaArtworkImage,
                              popupMediaCopyBox,
                            ));
                          const popupMediaActionsRow = document.createElement("div");
                          popupMediaActionsRow.className = "hb-media-player-actions";
                          const createPopupMediaButton = (popupButtonLabel: any, popupMediaService: any) => {
                              const popupMediaButton = document.createElement("button");
                              return (
                                (popupMediaButton.type = "button"),
                                (popupMediaButton.textContent = popupButtonLabel),
                                popupMediaButton.addEventListener("click", async () => {
                                  if (!isCustomPopupPreview) {
                                    popupMediaButton.disabled = true;
                                    try {
                                      await this.callEntityService(
                                        "media_player",
                                        popupMediaService,
                                        entityId,
                                      );
                                    } catch (popupMediaControlError: any) {
                                      this.options.onError?.(popupMediaControlError);
                                    } finally {
                                      popupMediaButton.disabled = false;
                                    }
                                  }
                                }),
                                popupMediaActionsRow.append(popupMediaButton),
                                popupMediaButton
                              );
                            },
                            popupMediaPreviousButton = createPopupMediaButton(
                              "上一曲",
                              "media_previous_track",
                            ),
                            popupMediaPlayButton = createPopupMediaButton(
                              "播放",
                              "media_play_pause",
                            ),
                            popupMediaNextButton = createPopupMediaButton(
                              "下一曲",
                              "media_next_track",
                            ),
                            mediaBrowserControl2 = this.createMediaBrowserControl(entityId, {
                              preview: isCustomPopupPreview,
                            });
                          popupCleanupCallbacks.push(() => mediaBrowserControl2.cleanup?.());
                          const popupMediaVolumeSection = document.createElement("section");
                          popupMediaVolumeSection.className = "hb-capability-range-group";
                          const popupMediaVolumeHeading = document.createElement("div");
                          popupMediaVolumeHeading.className = "hb-capability-range-heading";
                          const popupMediaVolumeTitle = document.createElement("strong");
                          popupMediaVolumeTitle.textContent = "音量";
                          const popupMediaVolumeOutputElement = document.createElement("output");
                          popupMediaVolumeHeading.append(
                            popupMediaVolumeTitle,
                            popupMediaVolumeOutputElement,
                          );
                          const popupMediaVolumeSlider = document.createElement("input");
                          ((popupMediaVolumeSlider.type = "range"),
                            (popupMediaVolumeSlider.min = "0"),
                            (popupMediaVolumeSlider.max = "1"),
                            (popupMediaVolumeSlider.step = ".01"),
                            (popupMediaVolumeSlider.disabled = isCustomPopupPreview),
                            popupMediaVolumeSection.append(
                              popupMediaVolumeHeading,
                              popupMediaVolumeSlider,
                            ));
                          let popupArtworkUrl = "",
                            popupMediaDuration: any = null,
                            popupInitialPosition = 0,
                            popupPlaybackUpdatedAtMs: any = null,
                            isPopupVolumeDragging = false,
                            popupVolumeLevel: any = null,
                            popupDraggingValue: any = null,
                            popupLastCommittedVolume: any = null,
                            popupPendingVolume: any = null,
                            isPopupVolumeSyncing = false,
                            popupVolumeCommitTimer: any = null,
                            popupVolumeSyncTimer: any = null;
                          const formatPopupMediaTime = (popupSecondsValue: any) => {
                              const popupWholeSeconds = Math.max(
                                0,
                                Math.floor(Number(popupSecondsValue) || 0),
                              );
                              return (
                                Math.floor(popupWholeSeconds / 60) +
                                ":" +
                                String(popupWholeSeconds % 60).padStart(2, "0")
                              );
                            },
                            popupMediaPositionTick = () => {
                              if (!Number.isFinite(popupMediaDuration) || popupMediaDuration <= 0) {
                                popupMediaProgressRow.hidden = true;
                                return;
                              }
                              let popupMediaPositionSeconds = Number.isFinite(popupInitialPosition)
                                ? popupInitialPosition
                                : 0;
                              (isPopupVolumeDragging &&
                                Number.isFinite(popupPlaybackUpdatedAtMs) &&
                                (popupMediaPositionSeconds += Math.max(
                                  0,
                                  (Date.now() - popupPlaybackUpdatedAtMs) / 1000,
                                )),
                                (popupMediaPositionSeconds = Math.max(
                                  0,
                                  Math.min(popupMediaDuration, popupMediaPositionSeconds),
                                )),
                                (popupMediaProgressRow.hidden = false),
                                (popupMediaProgressBar.max = popupMediaDuration),
                                (popupMediaProgressBar.value = popupMediaPositionSeconds),
                                (popupMediaElapsedLabel.textContent =
                                  formatPopupMediaTime(popupMediaPositionSeconds)),
                                (popupMediaDurationLabel.textContent =
                                  formatPopupMediaTime(popupMediaDuration)));
                            },
                            setInterval2 = window.setInterval(popupMediaPositionTick, 1000);
                          (popupCleanupCallbacks.push(() => {
                            (window.clearInterval(setInterval2),
                              window.clearTimeout(popupVolumeCommitTimer),
                              window.clearTimeout(popupVolumeSyncTimer));
                          }),
                            popupMediaArtworkImage.addEventListener("error", () => {
                              ((popupMediaArtworkImage.hidden = true),
                                popupNowPlayingSection.classList.remove("has-artwork"));
                            }),
                            popupMediaArtworkImage.addEventListener("load", () => {
                              ((popupMediaArtworkImage.hidden = false),
                                popupNowPlayingSection.classList.add("has-artwork"));
                            }),
                            popupSpeakerArtworkImage.addEventListener("error", () => {
                              ((popupSpeakerArtworkImage.hidden = true),
                                popupMediaSpeakerVisualElement.classList.remove("has-artwork"));
                            }),
                            popupSpeakerArtworkImage.addEventListener("load", () => {
                              ((popupSpeakerArtworkImage.hidden = false),
                                popupMediaSpeakerVisualElement.classList.add("has-artwork"));
                            }));
                          const isPopupVolumeClose = (popupLeftVolume: any, popupRightVolume: any) =>
                              Number.isFinite(popupLeftVolume) &&
                              Number.isFinite(popupRightVolume) &&
                              Math.abs(popupLeftVolume - popupRightVolume) <= 0.005,
                            applyPopupVolume = (popupRawVolume: any) => {
                              ((popupVolumeLevel = Math.max(
                                0,
                                Math.min(1, Number(popupRawVolume) || 0),
                              )),
                                (popupMediaVolumeSlider.value = String(popupVolumeLevel)),
                                syncHtmlRangeProgress2(popupMediaVolumeSlider),
                                (popupMediaVolumeOutputElement.textContent =
                                  Math.round(popupVolumeLevel * 100) + "%"));
                            },
                            commitPopupVolume = async () => {
                              if (
                                (window.clearTimeout(popupVolumeCommitTimer),
                                (popupVolumeCommitTimer = null),
                                isPopupVolumeSyncing || popupPendingVolume === null)
                              )
                                return;
                              const popupCommittedVolume = popupPendingVolume;
                              ((popupPendingVolume = null), (isPopupVolumeSyncing = true));
                              try {
                                await this.callEntityService(
                                  "media_player",
                                  "volume_set",
                                  entityId,
                                  {
                                    volume_level: popupCommittedVolume,
                                  },
                                );
                              } catch (popupVolumeError: any) {
                                ((popupPendingVolume = null),
                                  (popupLastCommittedVolume = null),
                                  window.clearTimeout(popupVolumeSyncTimer),
                                  popupDraggingValue !== null &&
                                    applyPopupVolume(popupDraggingValue),
                                  this.options.onError?.(popupVolumeError));
                              } finally {
                                ((isPopupVolumeSyncing = false),
                                  popupPendingVolume !== null &&
                                    !isPopupVolumeClose(popupPendingVolume, popupCommittedVolume) &&
                                    (popupVolumeCommitTimer = window.setTimeout(
                                      commitPopupVolume,
                                      140,
                                    )));
                              }
                            },
                            handlePopupVolumeChange = () => {
                              const popupNewVolumeLevel = Math.max(
                                0,
                                Math.min(1, Number(popupMediaVolumeSlider.value) || 0),
                              );
                              ((popupLastCommittedVolume = popupNewVolumeLevel),
                                (popupPendingVolume = popupNewVolumeLevel),
                                window.clearTimeout(popupVolumeSyncTimer),
                                isPopupVolumeSyncing ||
                                  (window.clearTimeout(popupVolumeCommitTimer),
                                  (popupVolumeCommitTimer = window.setTimeout(
                                    commitPopupVolume,
                                    120,
                                  ))));
                            };
                          (popupMediaVolumeSlider.addEventListener("input", () =>
                            applyPopupVolume(popupMediaVolumeSlider.value),
                          ),
                            popupMediaVolumeSlider.addEventListener(
                              "change",
                              handlePopupVolumeChange,
                            ));
                          const syncPopupMediaState = (nextPopupMediaState: any) => {
                            const popupMediaAttributes = nextPopupMediaState?.attributes || {},
                              lowerCase7 = String(
                                nextPopupMediaState?.state || "unknown",
                              ).toLowerCase(),
                              popupMediaSupportedFeatures = Number(
                                popupMediaAttributes.supported_features || 0,
                              );
                            mediaBrowserControl2.sync(nextPopupMediaState);
                            const popupMediaStateLabels = {
                              off: "已关闭",
                              on: "已开启",
                              idle: "空闲",
                              playing: "播放中",
                              paused: "已暂停",
                              buffering: "缓冲中",
                              standby: "待机",
                              unavailable: "不可用",
                              unknown: "未知状态",
                            };
                            ((popupModuleStatus.textContent =
                              (popupMediaStateLabels as any)[lowerCase7] ||
                              nextPopupMediaState?.state ||
                              "未知状态"),
                              popupModuleStatus.classList.toggle(
                                "is-live",
                                ["playing", "paused"].includes(lowerCase7),
                              ),
                              (popupMediaTitleLabel.textContent =
                                popupMediaAttributes.media_title ||
                                popupMediaAttributes.media_series_title ||
                                popupMediaAttributes.app_name ||
                                popupMediaAttributes.source ||
                                "暂无播放内容"),
                              (popupMediaSubtitleLabel.textContent =
                                [
                                  popupMediaAttributes.media_artist,
                                  popupMediaAttributes.media_album_name,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                popupMediaAttributes.media_content_type ||
                                "媒体播放器"),
                              (popupMediaPlayButton.textContent =
                                lowerCase7 === "playing" ? "暂停" : "播放"),
                              (popupMediaPlayButton.disabled =
                                isCustomPopupPreview ||
                                ["off", "unavailable", "unknown"].includes(lowerCase7)),
                              (popupMediaPreviousButton.disabled =
                                isCustomPopupPreview || !(popupMediaSupportedFeatures & 16)),
                              (popupMediaNextButton.disabled =
                                isCustomPopupPreview || !(popupMediaSupportedFeatures & 32)),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-playing",
                                lowerCase7 === "playing",
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-paused",
                                lowerCase7 === "paused",
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "is-off",
                                ["off", "unavailable", "unknown"].includes(lowerCase7),
                              ),
                              (popupMediaDuration = Number.isFinite(
                                Number(popupMediaAttributes.media_duration),
                              )
                                ? Number(popupMediaAttributes.media_duration)
                                : null),
                              (popupInitialPosition = Number.isFinite(
                                Number(popupMediaAttributes.media_position),
                              )
                                ? Number(popupMediaAttributes.media_position)
                                : 0));
                            const popupPositionUpdatedAtMs = Date.parse(
                              String(popupMediaAttributes.media_position_updated_at || ""),
                            );
                            ((popupPlaybackUpdatedAtMs = Number.isFinite(popupPositionUpdatedAtMs)
                              ? popupPositionUpdatedAtMs
                              : null),
                              (isPopupVolumeDragging = lowerCase7 === "playing"),
                              popupMediaPositionTick());
                            const popupReportVolumeLevel = Number(
                              popupMediaAttributes.volume_level,
                            );
                            ((popupMediaVolumeSection.hidden =
                              !Number.isFinite(popupReportVolumeLevel)),
                              Number.isFinite(popupReportVolumeLevel) &&
                                (popupLastCommittedVolume === null
                                  ? ((popupDraggingValue = popupReportVolumeLevel),
                                    applyPopupVolume(popupReportVolumeLevel))
                                  : isPopupVolumeClose(
                                        popupReportVolumeLevel,
                                        popupLastCommittedVolume,
                                      )
                                    ? ((popupDraggingValue = popupReportVolumeLevel),
                                      applyPopupVolume(popupLastCommittedVolume),
                                      window.clearTimeout(popupVolumeSyncTimer),
                                      (popupVolumeSyncTimer = window.setTimeout(() => {
                                        popupLastCommittedVolume = null;
                                      }, 1800)))
                                    : window.clearTimeout(popupVolumeSyncTimer)));
                            const popupCandidateArtworkUrl =
                              [
                                popupMediaAttributes.entity_picture_local,
                                popupMediaAttributes.entity_picture,
                                popupMediaAttributes.media_image_url,
                              ]
                                .map((popupRawArtworkUrl) =>
                                  String(popupRawArtworkUrl || "").trim(),
                                )
                                .find(
                                  (popupArtworkPath) =>
                                    popupArtworkPath.startsWith("/api/media_player_proxy/") ||
                                    popupArtworkPath.startsWith("/api/image_proxy/"),
                                ) || "";
                            popupCandidateArtworkUrl !== popupArtworkUrl &&
                              ((popupArtworkUrl = popupCandidateArtworkUrl),
                              (popupMediaArtworkImage.hidden = !popupArtworkUrl),
                              (popupSpeakerArtworkImage.hidden = !popupArtworkUrl),
                              popupNowPlayingSection.classList.toggle(
                                "has-artwork",
                                !!popupArtworkUrl,
                              ),
                              popupMediaSpeakerVisualElement.classList.toggle(
                                "has-artwork",
                                !!popupArtworkUrl,
                              ),
                              popupArtworkUrl
                                ? ((popupMediaArtworkImage.src = popupArtworkUrl),
                                  (popupSpeakerArtworkImage.src = popupArtworkUrl))
                                : (popupMediaArtworkImage.removeAttribute("src"),
                                  popupSpeakerArtworkImage.removeAttribute("src")));
                          };
                          (popupNowPlayingSection.append(mediaBrowserControl2.root),
                            syncPopupMediaState(popupEntityState),
                            registerPopupStateHandler(entityId, syncPopupMediaState),
                            popupMediaBody.append(
                              popupNowPlayingSection,
                              popupMediaActionsRow,
                              popupMediaVolumeSection,
                            ),
                            popupControlPanels.push(mediaBrowserControl2.panel),
                            popupModuleSection.append(popupMediaBody));
                        } else {
                          const popupModuleStatusNote = document.createElement("p");
                          popupModuleStatusNote.className = "hb-custom-popup-generic";
                          const syncPopupModuleStatus = (popupModuleStateArg: any) => {
                            popupModuleStatusNote.textContent =
                              "当前状态：" + (popupModuleStateArg?.state ?? "暂无状态");
                          };
                          (syncPopupModuleStatus(popupEntityState),
                            registerPopupStateHandler(entityId, syncPopupModuleStatus),
                            popupModuleSection.append(popupModuleStatusNote));
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
      customPopupGrid.append(popupModuleSection);
    }
    if (!(customPopupModule.modules || []).length) {
      const popupEmptyNote = document.createElement("p");
      ((popupEmptyNote.className = "hb-custom-popup-generic"),
        (popupEmptyNote.textContent = "这个组合弹窗还没有添加模块。"),
        customPopupGrid.append(popupEmptyNote));
    }
    (customPopupCard.append(customPopupHeading, customPopupGrid, ...popupControlPanels),
      customPopupDialog.append(customPopupCard));
    const customPopupOverlay = document.createElement("div");
    ((customPopupOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (customPopupOverlay.tabIndex = -1),
      customPopupOverlay.append(customPopupDialog),
      this.container.append(customPopupOverlay),
      (this.detailsDialog = customPopupDialog));
    const popupStructureKey = (popupStructureEntry: any) =>
        popupStructureEntry
          .map((popupStructureModule: any) => {
            const popupStructureProfile =
                popupStructureModule.type === "electric-bed"
                  ? this.deviceProfile(this.runtimeEntityId(popupStructureModule.entityId))
                  : null,
              popupRoleIdAliases =
                popupStructureProfile?.deviceType === "electric-bed"
                  ? popupStructureProfile.roles || {}
                  : {};
            return [
              popupStructureModule.id,
              popupStructureProfile?.deviceType || popupStructureModule.type || "generic",
              "backrest",
              "leg",
              "waist",
              "mode",
              "memory1",
              "memory2",
            ]
              .map((popupRoleId) =>
                String(
                  popupRoleId === popupStructureModule.id
                    ? popupStructureModule.id
                    : popupRoleIdAliases[popupRoleId] || "",
                ),
              )
              .join(":");
          })
          .join("|"),
      previousStructureKey = popupStructureKey(popupModules);
    ((this.detailsStateSync = {
      dialog: customPopupDialog,
      handlers: stateHandlerByPopupEntityId,
      refreshHistory: () =>
        popupRefreshCallbacks.forEach((popupRefreshCallback: any) => popupRefreshCallback()),
      refreshEntityCatalog: () => {
        this.detailsDialog !== customPopupDialog ||
          !customPopupDialog.open ||
          (popupStructureKey(popupModules) !== previousStructureKey &&
            this.showCustomPopup(customPopupModule, {
              preview: isCustomPopupPreview,
            }));
      },
    }),
      this.registerRuntimeDialogScale(
        customPopupOverlay,
        customPopupDialog,
        popupWidth,
        popupHeight,
      ),
      customPopupCloseButton.addEventListener("click", () => customPopupDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(customPopupOverlay, customPopupDialog, customPopupCard),
      customPopupOverlay.addEventListener("keydown", (customPopupKeyEvent) => {
        customPopupKeyEvent.key === "Escape" && customPopupDialog.close();
      }),
      customPopupDialog.addEventListener(
        "close",
        () => {
          for (const popupCleanupFn of popupCleanupCallbacks.splice(0)) popupCleanupFn();
          (this.clearRuntimeDialogScale(customPopupDialog),
            this.detailsDialog === customPopupDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === customPopupDialog && (this.detailsStateSync = null),
            !this.replacingDocument &&
              this.activePopupId === String(customPopupModule?.id || "") &&
              ((this.activePopupId = null),
              (this.historyPopupGeneration += 1),
              this.connectRuntime(),
              this.refreshHistorySeries()),
            customPopupOverlay.remove());
        },
        {
          once: true,
        },
      ),
      customPopupDialog.show(),
      this.refreshHistorySeries());
    for (const popupSpeakerVisualElement of popupMediaSpeakerVisuals) {
      const mediaSpeakerAnimation = playMediaSpeakerEntrance2(popupSpeakerVisualElement);
      mediaSpeakerAnimation && popupCleanupCallbacks.push(() => mediaSpeakerAnimation.cancel());
    }
    for (const popupEntranceTarget of popupEntranceTargets) {
      const popupEntranceAnimation = playFixedDeviceDropEntrance2(
        popupEntranceTarget.visual,
        popupEntranceTarget,
      );
      popupEntranceAnimation && popupCleanupCallbacks.push(() => popupEntranceAnimation.cancel());
    }
  }
