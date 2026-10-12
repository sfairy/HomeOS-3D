import type { ComponentControllerElement, ComponentPayload } from "../renderer-types";
import { componentDialogTitle } from "../renderer-helpers";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "../entity-metadata";
import { shellOpenMediaPlayer } from "@/studio/platform/shell-chrome";
import type { PanelRenderer } from "../panel-renderer";

export function popupComponentForEntity(self: PanelRenderer, popupEntityId: any, popupLabel = "") {
    let resolvedEntityId = String(popupEntityId || ""),
      entityDomain = resolvedEntityId.split(".")[0];
    const targetDeviceProfile = self.deviceProfile(resolvedEntityId);
    targetDeviceProfile?.deviceType === "air-purifier" &&
      targetDeviceProfile.roles?.fan &&
      entityDomain !== "fan" &&
      ((resolvedEntityId = targetDeviceProfile.roles.fan), (entityDomain = "fan"));
    const roleEntityId =
      targetDeviceProfile?.roles?.climate || targetDeviceProfile?.roles?.fan || "";
    ["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!) &&
      roleEntityId &&
      !["climate", "light"].includes(entityDomain) &&
      ((resolvedEntityId = roleEntityId), (entityDomain = resolvedEntityId.split(".")[0]));
    const entityMetadataEntry = self.entityMetadata.get(resolvedEntityId);
    if (
      entityDomain === "sensor" &&
      entityMetadataEntry?.deviceId &&
      ["state", "status", "task_status"].includes(entityMetadataEntry.translationKey)
    ) {
      const vacuumMetadataEntry = [...self.entityMetadata.values()].find(
        (metadataCandidate) =>
          metadataCandidate.deviceId === entityMetadataEntry.deviceId &&
          metadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable2(metadataCandidate),
      );
      vacuumMetadataEntry?.entityId &&
        ((resolvedEntityId = vacuumMetadataEntry.entityId), (entityDomain = "vacuum"));
    }
    const popupComponentPayload =
      targetDeviceProfile?.deviceType === "electric-bed"
        ? "electric-bed"
        : targetDeviceProfile?.deviceType === "air-purifier" && entityDomain === "fan"
          ? "air-purifier"
          : (["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!) &&
                ["climate", "fan"].includes(entityDomain)) ||
              entityDomain === "climate"
            ? "air-conditioner"
            : entityDomain === "water_heater"
              ? "water-heater"
              : entityDomain === "camera"
                ? "camera"
                : entityDomain === "media_player"
                  ? "media-player"
                  : ["fan", "select", "number", "input_number"].includes(entityDomain)
                    ? "device-button"
                    : ["light", "switch", "input_boolean"].includes(entityDomain)
                      ? "icon-button"
                      : entityDomain === "sensor"
                        ? "line-chart"
                        : entityDomain === "vacuum"
                          ? "vacuum-control"
                          : "device-button";
    return {
      id: "popup-" + resolvedEntityId,
      type: popupComponentPayload,
      bindings: {
        entity: {
          entityId: resolvedEntityId,
        },
      },
      properties: {
        label: popupLabel || "",
        ...(["air-conditioner", "bath-heater"].includes(targetDeviceProfile?.deviceType!)
          ? {
              deviceType: targetDeviceProfile!.deviceType,
            }
          : {}),
        ...(targetDeviceProfile?.deviceType === "air-purifier"
          ? {
              deviceType: "air-purifier",
            }
          : {}),
        ...(targetDeviceProfile?.deviceType === "electric-bed"
          ? {
              deviceType: "electric-bed",
            }
          : {}),
        ...(targetDeviceProfile?.coverKind
          ? {
              coverKind: targetDeviceProfile.coverKind,
            }
          : {}),
      },
      actions: {} as Record<string, any>,
    };
  }
export function showActionPopup(self: PanelRenderer, popupComponent: any, popupActionRecord: any, { preview: isPopupPreview = false } = {}) {
    const popupSourceMode = popupActionRecord?.data?.popupSource || "current";
    if (popupSourceMode === "custom") {
      const customPopupRecord = (self.document?.customPopups || []).find(
        (customPopupCandidate: any) => customPopupCandidate.id === popupActionRecord.data?.popupId,
      );
      if (!customPopupRecord) throw new Error("选择的组合弹窗不存在。");
      self.showCustomPopup(customPopupRecord, {
        preview: isPopupPreview,
      });
      return;
    }
    const popupEntityIdValue = popupComponent?.bindings?.entity?.entityId,
      isPopupTypeSupported =
        String(popupEntityIdValue || "").split(".", 1)[0] === "cover" ||
        ["camera", "line-chart", "air-conditioner", "icon-button"].includes(popupComponent?.type);
    let popupComponentForEntity =
      popupSourceMode === "entity"
        ? self.popupComponentForEntity(
            popupActionRecord.data?.entityId,
            componentDialogTitle(
              popupComponent,
              popupActionRecord.data?.title || popupActionRecord.data?.entityId,
            ),
          )
        : isPopupTypeSupported
          ? popupComponent
          : self.popupComponentForEntity(
              popupEntityIdValue,
              componentDialogTitle(popupComponent, ""),
            );
    if (
      (popupSourceMode !== "entity" &&
        popupComponentForEntity !== popupComponent &&
        popupComponent?.properties?.relatedEntities &&
        (popupComponentForEntity = {
          ...popupComponentForEntity,
          properties: {
            ...(popupComponentForEntity.properties || {}),
            relatedEntities: structuredClone(popupComponent.properties.relatedEntities),
          },
        }),
      !popupComponentForEntity?.bindings?.entity?.entityId)
    )
      throw new Error("该弹窗没有可用实体。");
    popupComponentForEntity.type === "camera"
      ? self.showCameraPreview(popupComponentForEntity, {
          preview: isPopupPreview,
        })
      : self.showEntityDetails(popupComponentForEntity, {
          preview: isPopupPreview,
        });
  }
export function showCapabilityDetails(self: PanelRenderer, capabilityComponent: any,
    { preview: isPreviewMode = false, title: dialogTitle = "" } = {},) {
    const detailsEntityId = capabilityComponent.bindings?.entity?.entityId;
    if (!detailsEntityId) throw new Error("该控件没有关联实体。");
    self.closeRuntimeDialog();
    const capabilityStateSnapshot = self.states.get(detailsEntityId)?.newState ||
        self.states.get(detailsEntityId) || {
          entityId: detailsEntityId,
          state: "unknown",
          attributes: {} as Record<string, any>,
        },
      capabilityDeviceProfile = self.deviceProfile(detailsEntityId),
      isAirPurifier = capabilityDeviceProfile?.deviceType === "air-purifier",
      capabilityDialog = document.createElement("dialog");
    capabilityDialog.className =
      "hb-entity-details-dialog capability-details" +
      (isAirPurifier ? " air-purifier-details" : "");
    const capabilityDialogCard = document.createElement("div");
    capabilityDialogCard.className = "hb-entity-details-card";
    const capabilityDialogHeading = document.createElement("div");
    capabilityDialogHeading.className = "hb-entity-details-heading";
    const capabilityDialogTitleBox = document.createElement("div"),
      capabilityDialogTitle = document.createElement("strong");
    capabilityDialogTitle.textContent =
      dialogTitle ||
      capabilityComponent.properties?.label ||
      capabilityStateSnapshot.attributes?.friendly_name ||
      detailsEntityId;
    const capabilityDialogStatus = document.createElement("span");
    ((capabilityDialogStatus.textContent =
      capabilityStateSnapshot.state === "unavailable" ? "当前不可用" : "设备控制"),
      capabilityDialogTitleBox.append(capabilityDialogTitle, capabilityDialogStatus));
    const capabilityDialogCloseButton = document.createElement("button");
    ((capabilityDialogCloseButton.type = "button"),
      (capabilityDialogCloseButton.textContent = "×"),
      capabilityDialogCloseButton.setAttribute("aria-label", "关闭弹窗"),
      capabilityDialogHeading.append(capabilityDialogTitleBox, capabilityDialogCloseButton));
    const capabilityDetailsBody = document.createElement("div");
    capabilityDetailsBody.className = "hb-capability-details-body";
    const capabilityDetailsControls = self.createCapabilityDetailsControls(
      detailsEntityId,
      capabilityStateSnapshot,
      {
        interactive: !isPreviewMode,
        variant: isAirPurifier ? "air-purifier" : "",
      },
    );
    (capabilityDetailsBody.append(capabilityDetailsControls),
      capabilityDialogCard.append(capabilityDialogHeading, capabilityDetailsBody),
      capabilityDialog.append(capabilityDialogCard));
    const metricRoleLabels = {
        pm25: "PM2.5",
        airQuality: "空气质量",
        temperature: "温度",
        humidity: "湿度",
        filterLife: "滤芯寿命",
      },
      slice2 = isAirPurifier
        ? ["pm25", "airQuality", "temperature", "humidity", "filterLife"]
            .map((deviceRoleName) => ({
              role: deviceRoleName,
              id: capabilityDeviceProfile.roles?.[deviceRoleName],
            }))
            .filter(({ id: metricEntityId }) => metricEntityId)
            .map(({ role: metricRole, id: metricId }) => ({
              role: metricRole,
              item: self.entityMetadata.get(metricId),
            }))
            .filter(
              ({ item: metricItem }) =>
                ["sensor", "binary_sensor"].includes(metricItem?.domain) &&
                entityMetadataIsAvailable2(metricItem),
            )
            .slice(0, 5)
        : [],
      metricValueByEntityId = new Map();
    if (slice2.length) {
      const capabilityMetricsBox = document.createElement("div");
      capabilityMetricsBox.className = "hb-capability-metrics";
      for (const { role: metricRoleKey, item: metricEntity } of slice2) {
        const capabilityMetricRow = document.createElement("div");
        capabilityMetricRow.className =
          "hb-capability-metric hb-capability-metric--" + metricRoleKey;
        const metricRoleLabel = document.createElement("small");
        metricRoleLabel.textContent =
          (metricRoleLabels as any)[metricRoleKey] ||
          metricEntity.name ||
          metricEntity.originalName ||
          metricEntity.entityId;
        const metricValueLabel = document.createElement("strong");
        (capabilityMetricRow.append(metricRoleLabel, metricValueLabel),
          capabilityMetricsBox.append(capabilityMetricRow),
          metricValueByEntityId.set(metricEntity.entityId, metricValueLabel));
      }
      capabilityDetailsBody.prepend(capabilityMetricsBox);
    }
    const capabilityDialogOverlay = document.createElement("div");
    ((capabilityDialogOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (self.options.editable ? "" : " hb-runtime-no-select")),
      (capabilityDialogOverlay.tabIndex = -1),
      capabilityDialogOverlay.append(capabilityDialog),
      self.container.append(capabilityDialogOverlay),
      (self.detailsDialog = capabilityDialog));
    const syncCapabilityHandler = (capabilitySyncStateArg: any) => {
        (capabilityDetailsControls.syncCapabilityState?.(capabilitySyncStateArg),
          (capabilityDialogStatus.textContent = ["unknown", "unavailable"].includes(
            String(capabilitySyncStateArg?.state || "").toLowerCase(),
          )
            ? "当前不可用"
            : "设备控制"));
      },
      capabilityHandlerByEntityId = new Map([[detailsEntityId, [syncCapabilityHandler]]]);
    for (const { item: metricEntityItem } of slice2) {
      const syncMetricHandler = (metricState: any) => {
        const metricValueText = metricValueByEntityId.get(metricEntityItem.entityId);
        metricValueText &&
          (metricValueText.textContent =
            metricState?.state === "unknown" || metricState?.state === "unavailable"
              ? "--"
              : (
                  (metricState?.state ?? "--") +
                  " " +
                  (metricState?.attributes?.unit_of_measurement || "")
                ).trim());
      };
      (syncMetricHandler(
        self.states.get(metricEntityItem.entityId)?.newState ||
          self.states.get(metricEntityItem.entityId),
      ),
        capabilityHandlerByEntityId.set(metricEntityItem.entityId, [syncMetricHandler]));
    }
    ((self.detailsStateSync = {
      dialog: capabilityDialog,
      handlers: capabilityHandlerByEntityId,
    }),
      self.registerRuntimeDialogScale(
        capabilityDialogOverlay,
        capabilityDialog,
        isAirPurifier ? 620 : 560,
        isAirPurifier ? 560 : 500,
      ),
      capabilityDialogCloseButton.addEventListener("click", () => capabilityDialog.close()),
      self.bindRuntimeDialogOutsideDismiss(
        capabilityDialogOverlay,
        capabilityDialog,
        capabilityDialogCard,
      ),
      capabilityDialogOverlay.addEventListener("keydown", (capabilityKeyEvent) => {
        capabilityKeyEvent.key === "Escape" && capabilityDialog.close();
      }),
      capabilityDialog.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls.cleanupCapabilityDetails?.(),
            self.clearRuntimeDialogScale(capabilityDialog),
            self.detailsDialog === capabilityDialog && (self.detailsDialog = null),
            self.detailsStateSync?.dialog === capabilityDialog && (self.detailsStateSync = null),
            capabilityDialogOverlay.remove());
        },
        {
          once: true,
        },
      ),
      capabilityDialog.show());
  }
export function showMediaPlayerDetails(self: PanelRenderer, mediaComponent: any, { preview: _isMediaDetailsPreview = false } = {}) {
    const mediaPlayerEntityId = mediaComponent.bindings?.entity?.entityId;
    if (!mediaPlayerEntityId) throw new Error("该控件没有关联实体。");
    // 栈 C more-info → 栈 B MediaPlayerModal（与 MiniWidget / 紧凑弹窗展开共用），不再维护手写 DOM dialog。
    self.closeRuntimeDialog();
    shellOpenMediaPlayer(String(mediaPlayerEntityId));
  }
export function createBathHeaterLightControl(self: PanelRenderer, createBathHeaterLightControlToggleEntityId: any,
    bathLightState: any,
    {
      interactive: isBathLightInteractive = true,
      onStateChange: onBathLightStateChange = null,
    }: any = {},): ComponentControllerElement {
    const bathHeaterLightSection: ComponentControllerElement = document.createElement("section");
    bathHeaterLightSection.className = "hb-bath-heater-light-control";
    const bathLightHeading = document.createElement("span"),
      bathLightIcon = document.createElement("i");
    (bathLightIcon.setAttribute("aria-hidden", "true"), (bathLightIcon.textContent = "☀"));
    const bathLightLabel = document.createElement("strong");
    bathLightLabel.textContent = String(bathLightState?.attributes?.friendly_name || "浴霸灯");
    const bathLightBadge = document.createElement("output");
    bathLightHeading.append(bathLightIcon, bathLightLabel, bathLightBadge);
    const bathLightToggleButton = document.createElement("button");
    ((bathLightToggleButton.type = "button"),
      (bathLightToggleButton.disabled = !isBathLightInteractive));
    let currentBathLightState = bathLightState,
      isBathLightBusy = false;
    const syncBathLightState = (nextBathLightState = currentBathLightState) => {
        currentBathLightState = nextBathLightState || currentBathLightState;
        const isBathLightUnavailable = ["unknown", "unavailable"].includes(
            String(currentBathLightState?.state || ""),
          ),
          isBathLightOn = currentBathLightState?.state === "on";
        (bathHeaterLightSection.classList.toggle("is-on", isBathLightOn && !isBathLightUnavailable),
          bathHeaterLightSection.classList.toggle("is-unavailable", isBathLightUnavailable),
          (bathLightBadge.textContent = isBathLightUnavailable
            ? "不可用"
            : isBathLightOn
              ? "已开启"
              : "已关闭"),
          (bathLightToggleButton.textContent = isBathLightOn ? "关闭灯光" : "开启灯光"),
          (bathLightToggleButton.disabled =
            !isBathLightInteractive || isBathLightBusy || isBathLightUnavailable),
          bathLightToggleButton.setAttribute("aria-pressed", String(isBathLightOn)),
          onBathLightStateChange?.({
            isOn: isBathLightOn,
            unavailable: isBathLightUnavailable,
          }));
      },
      toggleBathLight = async () => {
        if (!isBathLightInteractive || isBathLightBusy) return;
        isBathLightBusy = true;
        const previousBathLightState = currentBathLightState;
        syncBathLightState({
          ...(currentBathLightState || {}),
          state: currentBathLightState?.state === "on" ? "off" : "on",
        });
        try {
          await self.callEntityService(
            "homeassistant",
            "toggle",
            createBathHeaterLightControlToggleEntityId,
          );
        } catch (bathLightUpdateError: any) {
          (syncBathLightState(previousBathLightState),
            self.options.onError?.(bathLightUpdateError));
        } finally {
          ((isBathLightBusy = false), syncBathLightState(currentBathLightState));
        }
      };
    return (
      bathLightToggleButton.addEventListener("click", toggleBathLight),
      bathHeaterLightSection.append(bathLightHeading, bathLightToggleButton),
      (bathHeaterLightSection.syncBathLightState = syncBathLightState),
      (bathHeaterLightSection.toggleBathLight = toggleBathLight),
      syncBathLightState(bathLightState),
      bathHeaterLightSection
    );
  }
export function showElectricBedLoadingDetails(self: PanelRenderer, electricBedComponent: any,
    { preview: _isElectricBedPreview = false } = {},) {
    if (!electricBedComponent.bindings?.entity?.entityId) return;
    const pendingEntityDetails2 = self.pendingEntityDetails,
      detailsDialog2 = self.detailsDialog;
    ((self.detailsDialog = null),
      self.closeRuntimeDialog(detailsDialog2, {
        preservePending: true,
      }));
    const electricBedLoadingDialog = document.createElement("dialog");
    ((electricBedLoadingDialog.className =
      "hb-entity-details-dialog electric-bed-details electric-bed-loading-details"),
      (electricBedLoadingDialog.tabIndex = -1));
    const electricBedLoadingCard = document.createElement("div");
    electricBedLoadingCard.className = "hb-entity-details-card";
    const electricBedLoadingHeading = document.createElement("div");
    electricBedLoadingHeading.className = "hb-entity-details-heading";
    const electricBedLoadingTitle = document.createElement("strong");
    ((electricBedLoadingTitle.textContent = componentDialogTitle(electricBedComponent, "电动床")),
      electricBedLoadingHeading.append(electricBedLoadingTitle));
    const electricBedLoadingBody = document.createElement("section");
    electricBedLoadingBody.className = "hb-electric-bed-loading-body";
    const electricBedLoadingStateSection = document.createElement("section");
    electricBedLoadingStateSection.className = "hb-climate-details-loading is-loading";
    const electricBedLoadingIcon = document.createElement("i");
    electricBedLoadingIcon.setAttribute("aria-hidden", "true");
    const electricBedLoadingLabel = document.createElement("strong");
    electricBedLoadingLabel.textContent = "—";
    const electricBedLoadingHint = document.createElement("span");
    ((electricBedLoadingHint.textContent = ""),
      electricBedLoadingStateSection.append(
        electricBedLoadingIcon,
        electricBedLoadingLabel,
        electricBedLoadingHint,
      ),
      electricBedLoadingBody.append(electricBedLoadingStateSection),
      electricBedLoadingCard.append(electricBedLoadingHeading, electricBedLoadingBody),
      electricBedLoadingDialog.append(electricBedLoadingCard));
    const electricBedLoadingOverlay = document.createElement("div");
    ((electricBedLoadingOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (self.options.editable ? "" : " hb-runtime-no-select")),
      (electricBedLoadingOverlay.tabIndex = -1),
      electricBedLoadingOverlay.append(electricBedLoadingDialog),
      self.container.append(electricBedLoadingOverlay),
      (self.detailsDialog = electricBedLoadingDialog),
      self.registerRuntimeDialogScale(
        electricBedLoadingOverlay,
        electricBedLoadingDialog,
        760,
        420,
      ),
      self.bindRuntimeDialogOutsideDismiss(
        electricBedLoadingOverlay,
        electricBedLoadingDialog,
        electricBedLoadingCard,
      ),
      electricBedLoadingOverlay.addEventListener("keydown", (loadingOverlayKeyEvent) => {
        loadingOverlayKeyEvent.key === "Escape" && electricBedLoadingDialog.close();
      }),
      electricBedLoadingDialog.addEventListener(
        "close",
        () => {
          (self.detailsDialog === electricBedLoadingDialog &&
            self.pendingEntityDetails === pendingEntityDetails2 &&
            self.cancelPendingEntityDetails(),
            self.clearRuntimeDialogScale(electricBedLoadingDialog),
            self.detailsDialog === electricBedLoadingDialog && (self.detailsDialog = null),
            electricBedLoadingOverlay.remove());
        },
        {
          once: true,
        },
      ),
      electricBedLoadingDialog.show(),
      electricBedLoadingDialog.focus({
        preventScroll: true,
      }));
  }
export function showElectricBedDetails(self: PanelRenderer, electricBedDetailsComponent: any,
    { preview: isElectricBedDetailsPreview = false } = {},) {
    const electricBedEntityId = electricBedDetailsComponent.bindings?.entity?.entityId;
    if (!electricBedEntityId) throw new Error("该电动床控件没有关联实体。");
    const electricBedProfile = self.deviceProfile(electricBedEntityId),
      electricBedRoles = electricBedProfile?.roles || {},
      angleControls = [
        ["backrest", "靠背角度"],
        ["leg", "腿部角度"],
        ["waist", "腰部角度"],
      ]
        .map(([roleName, roleLabel]) => ({
          role: roleName,
          label: roleLabel,
          entityId: String(electricBedRoles[roleName] || ""),
        }))
        .filter((roleEntry) => roleEntry.entityId),
      modeEntityId = String(electricBedRoles.mode || ""),
      electricBedMetadata = self.entityMetadata.get(electricBedEntityId),
      siblingEntityIds = electricBedMetadata?.deviceId
        ? [...self.entityMetadata.values()]
            .filter(
              (siblingMetadata) =>
                siblingMetadata.deviceId === electricBedMetadata.deviceId &&
                ["button", "select"].includes(
                  String(siblingMetadata.domain || siblingMetadata.entityId || "").split(".", 1)[0],
                ) &&
                siblingMetadata.entityId !== electricBedRoles.mode &&
                entityMetadataIsAvailable2(siblingMetadata),
            )
            .sort((metadataA, metadataB) =>
              String(metadataA.entityId || "").localeCompare(String(metadataB.entityId || "")),
            )
            .map((siblingEntityId) => siblingEntityId.entityId)
        : [],
      slice6 = [
        ...new Set(
          [
            String(electricBedRoles.memory1 || ""),
            String(electricBedRoles.memory2 || ""),
            ...siblingEntityIds,
          ].filter(Boolean),
        ),
      ].slice(0, 2);
    self.closeRuntimeDialog();
    const electricBedDialog = document.createElement("dialog");
    electricBedDialog.className = "hb-entity-details-dialog electric-bed-details";
    const electricBedCard = document.createElement("div");
    electricBedCard.className = "hb-entity-details-card";
    const electricBedHeading = document.createElement("div");
    electricBedHeading.className = "hb-entity-details-heading";
    const electricBedTitleRow = document.createElement("div"),
      electricBedTitle = document.createElement("strong");
    electricBedTitle.textContent = componentDialogTitle(
      electricBedDetailsComponent,
      electricBedProfile?.deviceName || "电动床",
    );
    const electricBedUnavailableHint = document.createElement("span");
    electricBedTitleRow.append(electricBedTitle, electricBedUnavailableHint);
    const electricBedCloseButton = document.createElement("button");
    ((electricBedCloseButton.type = "button"),
      (electricBedCloseButton.textContent = "×"),
      electricBedCloseButton.setAttribute("aria-label", "关闭电动床详情"),
      electricBedHeading.append(electricBedTitleRow, electricBedCloseButton));
    const electricBedBody = document.createElement("div");
    electricBedBody.className = "hb-electric-bed-details-body";
    const electricBedVisualSection = document.createElement("section");
    electricBedVisualSection.className = "hb-electric-bed-visual";
    const electricBedModelElement = document.createElement("div");
    electricBedModelElement.className = "hb-electric-bed-model";
    const bedMattressElement = document.createElement("i");
    bedMattressElement.className = "hb-electric-bed-mattress";
    const bedBackElement = document.createElement("i");
    bedBackElement.className = "hb-electric-bed-back";
    const bedWaistElement = document.createElement("i");
    bedWaistElement.className = "hb-electric-bed-waist";
    const bedLegsElement = document.createElement("i");
    bedLegsElement.className = "hb-electric-bed-legs";
    const bedBaseElement = document.createElement("i");
    ((bedBaseElement.className = "hb-electric-bed-base"),
      electricBedModelElement.append(
        bedMattressElement,
        bedBackElement,
        bedWaistElement,
        bedLegsElement,
        bedBaseElement,
      ));
    const createAngleReadout = (readoutClassName: any, readoutLabel: any) => {
        const angleReadoutElement = document.createElement("span");
        angleReadoutElement.className = "hb-electric-bed-angle-readout " + readoutClassName;
        const angleReadoutValueLabel = document.createElement("strong"),
          angleReadoutLabel = document.createElement("small");
        return (
          (angleReadoutLabel.textContent = readoutLabel),
          angleReadoutElement.append(angleReadoutValueLabel, angleReadoutLabel),
          {
            readout: angleReadoutElement,
            value: angleReadoutValueLabel,
          }
        );
      },
      backAngleReadoutElement = createAngleReadout("back", "靠背"),
      waistAngleReadoutElement = createAngleReadout("waist", "腰部"),
      legsAngleReadoutElement = createAngleReadout("legs", "腿部"),
      deviceStatusLabel = document.createElement("strong"),
      deviceStatusHint = document.createElement("small");
    electricBedVisualSection.append(
      electricBedModelElement,
      backAngleReadoutElement.readout,
      waistAngleReadoutElement.readout,
      legsAngleReadoutElement.readout,
      deviceStatusLabel,
      deviceStatusHint,
    );
    const electricBedUtilitiesSection = document.createElement("section");
    electricBedUtilitiesSection.className = "hb-electric-bed-utilities";
    const electricBedMainSection = document.createElement("section");
    electricBedMainSection.className = "hb-electric-bed-main";
    const angleControlsSection = document.createElement("section");
    angleControlsSection.className = "hb-electric-bed-angle-controls";
    const syncHandlersByEntityId = new Map(),
      controlCleanups: any = [],
      resolveAngleState = (angleEntityId: any) => {
        const resolvedAngleState = self.states.get(angleEntityId);
        return (
          resolvedAngleState?.newState ||
          resolvedAngleState || {
            entityId: angleEntityId,
            state: "unknown",
            attributes: {} as Record<string, any>,
          }
        );
      },
      createAngleControl = (
        controlLabel: any,
        controlEntityId: any,
        controlVariant = "",
        controlContainer = angleControlsSection,
      ) => {
        const controlAngleState = resolveAngleState(controlEntityId),
          angleControlSection = document.createElement("section");
        ((angleControlSection.className = "hb-electric-bed-control"),
          controlLabel === "模式" && angleControlSection.classList.add("hb-electric-bed-mode"));
        const angleControlLabel = document.createElement("strong");
        angleControlLabel.textContent = controlLabel;
        const capabilityDetailsControls5 = self.createCapabilityDetailsControls(
          controlEntityId,
          controlAngleState,
          {
            interactive: !isElectricBedDetailsPreview,
            variant: controlVariant,
          },
        );
        (capabilityDetailsControls5.classList.add("hb-electric-bed-capability"),
          angleControlSection.append(angleControlLabel, capabilityDetailsControls5),
          controlContainer.append(angleControlSection));
        const syncAngleControl = (angleState: any) =>
          capabilityDetailsControls5.syncCapabilityState?.(angleState);
        (syncHandlersByEntityId.set(controlEntityId, [syncAngleControl]),
          controlCleanups.push({
            role: controlLabel,
            entityId: controlEntityId,
            sync: syncAngleControl,
            cleanup: () => capabilityDetailsControls5.cleanupCapabilityDetails?.(),
          }));
      };
    for (const angleControlEntry of angleControls)
      createAngleControl(angleControlEntry.label, angleControlEntry.entityId);
    if (modeEntityId)
      createAngleControl("模式", modeEntityId, "electric-bed", electricBedUtilitiesSection);
    else {
      const modeControlSection = document.createElement("section");
      modeControlSection.className = "hb-electric-bed-control hb-electric-bed-mode is-unavailable";
      const modeControlLabel = document.createElement("strong");
      modeControlLabel.textContent = "模式";
      const modeSelect = document.createElement("select");
      ((modeSelect.className = "hb-capability-select"),
        (modeSelect.disabled = true),
        modeSelect.setAttribute("aria-label", "模式"));
      const modePlaceholderOptionElement = document.createElement("option");
      ((modePlaceholderOptionElement.textContent = "未识别到模式实体"),
        modeSelect.append(modePlaceholderOptionElement),
        modeControlSection.append(modeControlLabel, modeSelect),
        electricBedUtilitiesSection.append(modeControlSection));
    }
    const memoryControlSection = document.createElement("section");
    memoryControlSection.className = "hb-electric-bed-memory";
    const memoryControlLabel = document.createElement("strong");
    memoryControlLabel.textContent = "记忆姿势";
    const memoryControlList = document.createElement("div");
    memoryControlList.className = "hb-electric-bed-memory-list";
    for (let memorySlotIndex = 0; memorySlotIndex < 2; memorySlotIndex += 1) {
      const memoryEntityId = slice6[memorySlotIndex] || "",
        memoryEntityMetadata = memoryEntityId ? self.entityMetadata.get(memoryEntityId) : null;
      if (String(memoryEntityId).split(".", 1)[0] === "select") {
        const memorySlotSection = document.createElement("section");
        memorySlotSection.className = "hb-electric-bed-memory-control hb-electric-bed-control";
        const memorySlotLabel = document.createElement("strong");
        memorySlotLabel.textContent = "记忆姿势 " + (memorySlotIndex + 1);
        const capabilityDetailsControls6 = self.createCapabilityDetailsControls(
          memoryEntityId,
          resolveAngleState(memoryEntityId),
          {
            interactive: !isElectricBedDetailsPreview,
            variant: "electric-bed-memory",
            selectLabel: "姿势",
          },
        );
        (capabilityDetailsControls6.classList.add("hb-electric-bed-capability"),
          memorySlotSection.append(memorySlotLabel, capabilityDetailsControls6),
          memoryControlList.append(memorySlotSection));
        const syncMemorySlot = (memoryState: any) =>
          capabilityDetailsControls6.syncCapabilityState?.(memoryState);
        (syncHandlersByEntityId.set(memoryEntityId, [syncMemorySlot]),
          controlCleanups.push({
            role: "memory" + (memorySlotIndex + 1),
            entityId: memoryEntityId,
            sync: syncMemorySlot,
            cleanup: () => capabilityDetailsControls6.cleanupCapabilityDetails?.(),
          }));
        continue;
      }
      const memorySlotButton = document.createElement("button");
      ((memorySlotButton.type = "button"),
        (memorySlotButton.className = "hb-electric-bed-memory-button"),
        (memorySlotButton.textContent =
          memoryEntityMetadata?.name ||
          memoryEntityMetadata?.originalName ||
          "记忆姿势 " + (memorySlotIndex + 1)),
        (memorySlotButton.disabled = isElectricBedDetailsPreview || !memoryEntityId),
        memorySlotButton.classList.toggle("is-unavailable", !memoryEntityId),
        memorySlotButton.addEventListener("click", async () => {
          if (!(isElectricBedDetailsPreview || !memoryEntityId || memorySlotButton.disabled)) {
            ((memorySlotButton.disabled = true), memorySlotButton.classList.add("is-pending"));
            try {
              (await self.callEntityService("button", "press", memoryEntityId),
                memorySlotButton.classList.add("is-success"),
                window.setTimeout(() => memorySlotButton.classList.remove("is-success"), 900));
            } catch (memoryUpdateError: any) {
              self.options.onError?.(memoryUpdateError);
            } finally {
              (memorySlotButton.classList.remove("is-pending"),
                (memorySlotButton.disabled = isElectricBedDetailsPreview || !memoryEntityId));
            }
          }
        }),
        memoryControlList.append(memorySlotButton));
    }
    if (
      (memoryControlSection.append(memoryControlLabel, memoryControlList),
      electricBedUtilitiesSection.append(memoryControlSection),
      !angleControls.length)
    ) {
      const angleEmptyHint = document.createElement("p");
      ((angleEmptyHint.className = "hb-electric-bed-empty"),
        (angleEmptyHint.textContent = "暂未识别到角度实体"),
        angleControlsSection.append(angleEmptyHint));
    }
    (electricBedMainSection.append(electricBedVisualSection, angleControlsSection),
      electricBedBody.append(electricBedUtilitiesSection, electricBedMainSection),
      electricBedCard.append(electricBedHeading, electricBedBody),
      electricBedDialog.append(electricBedCard));
    const anglePercentForState = (_angleRoleEntityId: any, angleEntityState: any) => {
        const angleRawValue = Number(angleEntityState?.state),
          angleMinimum = Number(angleEntityState?.attributes?.min),
          angleMaximum = Number(angleEntityState?.attributes?.max);
        return Number.isFinite(angleRawValue)
          ? !Number.isFinite(angleMinimum) ||
            !Number.isFinite(angleMaximum) ||
            angleMaximum <= angleMinimum
            ? Math.max(0, Math.min(100, angleRawValue))
            : Math.max(
                0,
                Math.min(
                  100,
                  ((angleRawValue - angleMinimum) / (angleMaximum - angleMinimum)) * 100,
                ),
              )
          : 0;
      },
      syncAngleVisuals = () => {
        const backAngleState = resolveAngleState(electricBedRoles.backrest),
          legAngleState = resolveAngleState(electricBedRoles.leg),
          waistAngleState = resolveAngleState(electricBedRoles.waist),
          formatAngleValue = (angleValueState: any) => {
            const angleNumericValue = Number(angleValueState?.state);
            if (!Number.isFinite(angleNumericValue)) return "--";
            const angleUnit = String(angleValueState?.attributes?.unit_of_measurement || "°");
            return "" + angleNumericValue + angleUnit;
          };
        ((backAngleReadoutElement.value.textContent = formatAngleValue(backAngleState)),
          (waistAngleReadoutElement.value.textContent = formatAngleValue(waistAngleState)),
          (legsAngleReadoutElement.value.textContent = formatAngleValue(legAngleState)),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-backrest-angle",
            anglePercentForState(electricBedRoles.backrest, backAngleState) * -0.42 + "deg",
          ),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-leg-angle",
            anglePercentForState(electricBedRoles.leg, legAngleState) * -0.28 + "deg",
          ),
          electricBedVisualSection.style.setProperty(
            "--hb-bed-waist-angle",
            anglePercentForState(electricBedRoles.waist, waistAngleState) * -0.1 + "deg",
          ));
        const angleStateStrings = [backAngleState, legAngleState, waistAngleState].map(
            (angleStateString) => String(angleStateString?.state || "").toLowerCase(),
          ),
          some = angleStateStrings.some(
            (unavailableAngleState) => unavailableAngleState === "unavailable",
          ),
          some2 =
            !some &&
            angleStateStrings.some(
              (unknownAngleState) => unknownAngleState === "unknown" || !unknownAngleState,
            );
        ((deviceStatusLabel.textContent = some ? "部分实体不可用" : some2 ? "—" : "设备在线"),
          (deviceStatusHint.textContent = angleControls.length === 3 ? "三个角度独立控制" : ""),
          (electricBedUnavailableHint.textContent = some ? "部分功能不可用" : ""));
      };
    syncAngleVisuals();
    for (const entityControlEntry of angleControls)
      syncHandlersByEntityId.get(entityControlEntry.entityId)?.push(() => {
        syncAngleVisuals();
      });
    (modeEntityId && syncHandlersByEntityId.get(modeEntityId)?.push(() => syncAngleVisuals()),
      (self.detailsStateSync = {
        dialog: electricBedDialog,
        handlers: syncHandlersByEntityId,
      }));
    const electricBedOverlay = document.createElement("div");
    ((electricBedOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (self.options.editable ? "" : " hb-runtime-no-select")),
      (electricBedOverlay.tabIndex = -1),
      electricBedOverlay.append(electricBedDialog),
      self.container.append(electricBedOverlay),
      (self.detailsDialog = electricBedDialog),
      self.registerRuntimeDialogScale(electricBedOverlay, electricBedDialog, 760, 560),
      electricBedCloseButton.addEventListener("click", () => electricBedDialog.close()),
      self.bindRuntimeDialogOutsideDismiss(electricBedOverlay, electricBedDialog, electricBedCard),
      electricBedOverlay.addEventListener("keydown", (electricBedOverlayKeyEvent) => {
        electricBedOverlayKeyEvent.key === "Escape" && electricBedDialog.close();
      }),
      electricBedDialog.addEventListener(
        "close",
        () => {
          for (const controlCleanup of controlCleanups) controlCleanup.cleanup?.();
          (self.clearRuntimeDialogScale(electricBedDialog),
            self.detailsDialog === electricBedDialog && (self.detailsDialog = null),
            self.detailsStateSync?.dialog === electricBedDialog && (self.detailsStateSync = null),
            electricBedOverlay.remove());
        },
        {
          once: true,
        },
      ),
      electricBedDialog.show());
  }
export function openInteraction3dVacuumDetails(self: PanelRenderer, vacuumDetailsOptions: any,
    onDialogClose: any,
    {
      states: stateSnapshot = {},
      root: rootHost,
      frame: frameHost,
      popupOpacity: popupOpacity = 74,
      getPresentationLayout: getPresentationLayout,
      getPopupLayout: getPopupLayout,
    }: {
      states?: ComponentPayload;
      root?: any;
      frame?: any;
      popupOpacity?: number;
      getPresentationLayout?: any;
      getPopupLayout?: any;
    } = {},): any {
    const statusEntityIdSet = new Set([
      vacuumDetailsOptions.entityId,
      ...(vacuumDetailsOptions.relatedEntityIds || []),
    ]);
    let vacuumDialogElement: any = null;
    const updateVacuumStates = (stateMap: any) => {
      for (const statusEntityId of statusEntityIdSet) {
        const entityState = stateMap[statusEntityId] || {
          entityId: statusEntityId,
          state: "unavailable",
          attributes: {} as Record<string, any>,
        };
        if (
          (self.states.set(statusEntityId, entityState),
          self.detailsStateSync?.dialog === vacuumDialogElement)
        ) {
          for (const stateHandler of self.detailsStateSync!.handlers.get(statusEntityId) || [])
            stateHandler(entityState);
        }
      }
    };
    updateVacuumStates(stateSnapshot);
    const findVacuumComponent = (componentList: any) => {
        for (const componentRecordCandidate of componentList || []) {
          if (
            componentRecordCandidate.type === "vacuum-control" &&
            componentRecordCandidate.bindings?.entity?.entityId === vacuumDetailsOptions.entityId
          )
            return componentRecordCandidate;
          const nestedComponent: any = findVacuumComponent(componentRecordCandidate.children);
          if (nestedComponent) return nestedComponent;
        }
        return null;
      },
      pageComponent = (self.document?.pages || [])
        .map((documentPage: any) => findVacuumComponent(documentPage.components))
        .find(Boolean),
      selectedStatusEntityIds =
        pageComponent?.properties?.relatedEntities?.mode === "selected"
          ? (pageComponent.properties.relatedEntities.entityIds || []).filter((selectedEntityId: any) =>
              statusEntityIdSet.has(selectedEntityId),
            )
          : [],
      vacuumSnapshotOptions = {
        id: "vacuum:" + vacuumDetailsOptions.id,
        type: "vacuum-control",
        properties: {
          label: vacuumDetailsOptions.label,
          relatedEntities: {
            mode: "selected",
            entityIds: selectedStatusEntityIds,
          },
        },
        bindings: {
          entity: {
            entityId: vacuumDetailsOptions.entityId,
          },
        },
      };
    return (
      (() => {
        (vacuumDialogElement?.removeEventListener("close", onDialogClose),
          self.showVacuumDetails(vacuumSnapshotOptions, {
            preview: !!self.options.editable,
            interaction3d: {
              root: rootHost,
              frame: frameHost,
              popupOpacity: popupOpacity,
              getPresentationLayout: getPresentationLayout,
              getPopupLayout: getPopupLayout,
              statusEntities: [...statusEntityIdSet]
                .filter((sensorEntityId) => sensorEntityId.startsWith("sensor."))
                .map((statusSensorEntityId) => ({
                  entityId: statusSensorEntityId,
                  role: vacuumDetailsOptions.statusEntityRoles
                    ? vacuumDetailsOptions.statusEntityRoles[statusSensorEntityId] || ""
                    : undefined,
                })),
            },
          }),
          (vacuumDialogElement = self.detailsDialog),
          vacuumDialogElement?.addEventListener("close", onDialogClose, {
            once: true,
          }));
      })(),
      {
        updateStates: updateVacuumStates,
        updateLayout: () => vacuumDialogElement?.resizeInteraction3d?.(),
        close: () => {
          (vacuumDialogElement?.removeEventListener("close", onDialogClose),
            vacuumDialogElement?.close());
        },
        contains: (containedEntityId: any) => vacuumDialogElement?.contains(containedEntityId),
      }
    );
  }