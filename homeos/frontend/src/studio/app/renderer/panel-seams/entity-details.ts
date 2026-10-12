import { COVER_CLOSED_POSITION_EPSILON, componentDialogTitle, createAirerVisual, createSwitchVisual, entityStateText } from "../renderer-helpers";
import type { ClimateVisualSyncPayload, ComponentControllerElement, ComponentPayload, EntityStateControlElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { airerPositionCalibration as airerPositionCalibration2, airerVisualDrop as airerVisualDrop2, coverComponentIsAirer as coverComponentIsAirer2, coverMotorIsReversedForComponent as coverMotorIsReversedForComponent2, coverPresentationState as coverPresentationState2, dreamCurtainStatusFromRetraction as dreamCurtainStatusFromRetraction2, dreamCurtainStatusText as dreamCurtainStatusText2, dreamCurtainToggleService as dreamCurtainToggleService2, physicalCoverState as physicalCoverState2, relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor2, relatedAirerLightEntity as relatedAirerLightEntity2, relatedAirerMotorActionEntities as relatedAirerMotorActionEntities2, relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor2, relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity2, relatedDeviceDomainEntity as relatedDeviceDomainEntity2 } from "../controls/cover-runtime";
import { applyXiaomiDeviceProfile as applyXiaomiDeviceProfile2 } from "../../../platform/entity-role-profiles";
import { bathHeaterModeUsesAirflow as bathHeaterModeUsesAirflow2, climateControlStructureKey as climateControlStructureKey2, climateDeviceLabel as climateDeviceLabel2, climateIsPoweredOn as climateIsPoweredOn2, climateModeLabel as climateModeLabel2, climatePowerCommand as climatePowerCommand2, normalizeClimateCapabilities as normalizeClimateCapabilities2, resolveClimateDeviceType as resolveClimateDeviceType2, waterHeaterStatusLabel as waterHeaterStatusLabel2 } from "../controls/climate";
import { formatLineChartValue as formatLineChartValue2, renderLineChartDetails as renderLineChartDetails2 } from "../registry";
import { lightColorRgb as lightColorRgb2, lightSupportsColor as lightSupportsColor2 } from "../controls/light-runtime";
import { selectedRelatedEntityIds as selectedRelatedEntityIds2 } from "../../shared/related-entities";

export function showEntityDetails(this: PanelRenderer, entityDetailsComponent: any, { preview: isEntityDetailsPreview = false } = {}) {
    const detailEntityId = entityDetailsComponent.bindings?.entity?.entityId;
    if (!detailEntityId) throw new Error("该控件没有关联实体。");
    const detailEntityIdText = String(detailEntityId),
      detailDeviceProfile = this.deviceProfile(detailEntityIdText);
    entityDetailsComponent = applyXiaomiDeviceProfile2(entityDetailsComponent, detailDeviceProfile);
    const isEntityDetailsPreviewEntityDomain = detailEntityIdText.split(".", 1)[0],
      isCatalogRetry =
        entityDetailsComponent.properties?.deviceType === "electric-bed" ||
        detailDeviceProfile?.deviceType === "electric-bed";
    if (!this.entityCatalogReady) {
      (this.deferEntityDetailsUntilReady(
        {
          ...entityDetailsComponent,
          properties: {
            ...(entityDetailsComponent.properties || {}),
            __catalogRetry: true,
          },
        },
        isEntityDetailsPreview,
        isCatalogRetry ? "electric-bed-catalog" : "catalog",
      ),
        isCatalogRetry &&
          this.showElectricBedLoadingDetails(entityDetailsComponent, {
            preview: isEntityDetailsPreview,
          }));
      return;
    }
    if (
      !detailDeviceProfile &&
      isEntityDetailsPreviewEntityDomain === "number" &&
      !entityDetailsComponent.properties?.__catalogRetry
    ) {
      (this.deferEntityDetailsUntilReady(
        {
          ...entityDetailsComponent,
          properties: {
            ...(entityDetailsComponent.properties || {}),
            __catalogRetry: true,
          },
        },
        isEntityDetailsPreview,
        isCatalogRetry ? "electric-bed-catalog" : "catalog",
      ),
        isCatalogRetry &&
          this.showElectricBedLoadingDetails(entityDetailsComponent, {
            preview: isEntityDetailsPreview,
          }));
      return;
    }
    if (
      isEntityDetailsPreviewEntityDomain === "water_heater" &&
      !this.waterHeaterDetailsReady(detailEntityIdText)
    ) {
      this.deferEntityDetailsUntilReady(entityDetailsComponent, isEntityDetailsPreview);
      return;
    }
    if ((this.cancelPendingEntityDetails(), entityDetailsComponent.type === "presence-sensor")) {
      this.showPresenceDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (detailDeviceProfile?.deviceType === "electric-bed") {
      this.showElectricBedDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    detailDeviceProfile?.deviceType === "air-purifier" &&
      isEntityDetailsPreviewEntityDomain === "fan" &&
      ["icon-button", "device-button", "icon-button-effect"].includes(
        entityDetailsComponent.type,
      ) &&
      (entityDetailsComponent = {
        ...entityDetailsComponent,
        type: "air-purifier",
        properties: {
          ...(entityDetailsComponent.properties || {}),
          deviceType: "air-purifier",
        },
      });
    const coveredDomainSet = new Set([
      "line-chart",
      "media-player",
      "air-purifier",
      "air-conditioner",
      "water-heater",
      "vacuum-control",
      "electric-bed",
    ]).has(entityDetailsComponent.type);
    if (
      entityDetailsComponent.type === "media-player" ||
      (!coveredDomainSet && isEntityDetailsPreviewEntityDomain === "media_player")
    ) {
      this.showMediaPlayerDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (entityDetailsComponent.type === "air-purifier") {
      this.showAirPurifierDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    if (
      (["air-conditioner", "bath-heater"].includes(detailDeviceProfile?.deviceType!) &&
        ["climate", "fan"].includes(isEntityDetailsPreviewEntityDomain) &&
        !coveredDomainSet &&
        entityDetailsComponent.type !== "air-conditioner" &&
        (entityDetailsComponent = {
          ...entityDetailsComponent,
          type: "air-conditioner",
        }),
      entityDetailsComponent.type === "vacuum-control" ||
        (!coveredDomainSet && detailEntityIdText.startsWith("vacuum.")))
    ) {
      this.showVacuumDetails(entityDetailsComponent, {
        preview: isEntityDetailsPreview,
      });
      return;
    }
    const detailEntityState = this.states.get(detailEntityIdText),
      entityStateValue = detailEntityState?.newState || detailEntityState,
      entityAttributes = entityStateValue?.attributes || {},
      isLineChart = entityDetailsComponent.type === "line-chart",
      isCoverEntity = !isLineChart && isEntityDetailsPreviewEntityDomain === "cover",
      coverKind2 = ["standard", "dream", "airer"].includes(
        entityDetailsComponent.properties?.coverKind,
      )
        ? entityDetailsComponent.properties.coverKind
        : "auto",
      isAirerEntity =
        isCoverEntity &&
        coverComponentIsAirer2(
          entityDetailsComponent,
          detailEntityIdText,
          entityStateValue,
          this.entityMetadata,
          this.deviceMetadata,
        ),
      supportedFeatures = Number(entityAttributes.supported_features || 0),
      deviceNameHaystack =
        detailEntityIdText +
        " " +
        (entityAttributes.friendly_name || "") +
        " " +
        (entityDetailsComponent.properties?.label || ""),
      finite8 =
        Number.isFinite(Number(entityAttributes.current_tilt_position)) ||
        !!(supportedFeatures & 240),
      test3 = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(deviceNameHaystack),
      isEntityDetailsPreviewIsDreamCover =
        isCoverEntity &&
        !isAirerEntity &&
        (coverKind2 === "dream" || (coverKind2 === "auto" && (finite8 || test3))),
      hasTiltPosition = isEntityDetailsPreviewIsDreamCover && finite8,
      airerLightEntityId =
        (isAirerEntity ? relatedAirerLightEntity2(this.entityMetadata, detailEntityIdText) : null)
          ?.entityId || "",
      airerLightState = airerLightEntityId ? this.states.get(airerLightEntityId) : null;
    let airerLightStateValue = airerLightState?.newState || airerLightState || null;
    const positionCommandEntityId =
        (isAirerEntity
          ? relatedAirerPositionNumberEntity2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      positionCommandState = this.states.get(positionCommandEntityId),
      positionCommandStateValue = positionCommandState?.newState || positionCommandState || null,
      positionEntityId =
        (isAirerEntity
          ? relatedAirerCurrentPositionSensor2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      motorEntityId =
        (isAirerEntity
          ? relatedAirerMotorSpeedSensor2(this.entityMetadata, detailEntityIdText)
          : null
        )?.entityId || "",
      motorState = this.states.get(motorEntityId),
      motorStateValue = motorState?.newState || motorState || null,
      motorActionEntities = isAirerEntity
        ? relatedAirerMotorActionEntities2(this.entityMetadata, detailEntityIdText)
        : {},
      motorActionEntityIds = Object.fromEntries(
        Object.entries(motorActionEntities).map(([motorActionKey, motorActionEntityValue]) => [
          motorActionKey,
          motorActionEntityValue?.entityId || "",
        ]),
      ),
      positionState = this.states.get(positionEntityId || positionCommandEntityId),
      positionStateValue = positionState?.newState || positionState || null,
      isOpenDirection =
        isCoverEntity &&
        coverMotorIsReversedForComponent2(
          entityDetailsComponent,
          this.entityMetadata,
          this.states,
          detailEntityIdText,
        ),
      openServiceName = isOpenDirection ? "open_cover" : "close_cover",
      closeServiceName = isOpenDirection ? "close_cover" : "open_cover",
      coverDirection2 = ["left", "right"].includes(
        entityDetailsComponent.properties?.coverDirection,
      )
        ? entityDetailsComponent.properties.coverDirection
        : "split",
      isButtonEntity = !isLineChart && isEntityDetailsPreviewEntityDomain === "button",
      isSwitchEntity =
        !isLineChart &&
        (isButtonEntity ||
          ["switch", "input_boolean"].includes(isEntityDetailsPreviewEntityDomain)),
      isLightEntity =
        entityDetailsComponent.type === "icon-button" &&
        isEntityDetailsPreviewEntityDomain === "light",
      isClimateEntity =
        !isLineChart &&
        (entityDetailsComponent.type === "air-conditioner" ||
          entityDetailsComponent.type === "water-heater" ||
          ["climate", "water_heater"].includes(isEntityDetailsPreviewEntityDomain)),
      climateDeviceType = isClimateEntity
        ? isEntityDetailsPreviewEntityDomain === "water_heater" ||
          entityDetailsComponent.type === "water-heater"
          ? "water-heater"
          : resolveClimateDeviceType2(entityDetailsComponent, entityStateValue, detailEntityIdText)
        : "air-conditioner",
      climateDeviceLabel = climateDeviceLabel2(climateDeviceType),
      replace = componentDialogTitle(
        entityDetailsComponent,
        String(entityAttributes.friendly_name || "").trim() || climateDeviceLabel,
      ).replace(/(浴霸)(?:\s+浴霸)+$/i, "$1"),
      componentDialogTitle2 = componentDialogTitle(
        entityDetailsComponent,
        String(entityAttributes.friendly_name || "").trim() || (isButtonEntity ? "按钮" : "开关"),
      ),
      isToggleable = isLightEntity || isClimateEntity || isSwitchEntity;
    this.closeRuntimeDialog();
    const resolveEntityStateLabel = (stateValueText: any, stateAttributes = entityAttributes) =>
        isButtonEntity
          ? false
          : isLightEntity || isSwitchEntity
            ? stateValueText === "on"
            : climateIsPoweredOn2(
                {
                  state: stateValueText,
                  attributes: stateAttributes,
                },
                climateDeviceType,
              ),
      entityDetailsDialog = document.createElement("dialog");
    ((entityDetailsDialog.className = "hb-entity-details-dialog"),
      (entityDetailsDialog.tabIndex = -1),
      entityDetailsDialog.classList.toggle("line-chart-details", isLineChart),
      entityDetailsDialog.classList.toggle("light-details", isLightEntity),
      entityDetailsDialog.classList.toggle("cover-details", isCoverEntity),
      entityDetailsDialog.classList.toggle(
        "dream-cover-details",
        isEntityDetailsPreviewIsDreamCover,
      ),
      entityDetailsDialog.classList.toggle("airer-cover-details", isAirerEntity),
      entityDetailsDialog.classList.toggle("climate-details", isClimateEntity),
      entityDetailsDialog.classList.toggle(
        "bath-heater-details",
        climateDeviceType === "bath-heater",
      ),
      entityDetailsDialog.classList.toggle(
        "water-heater-details",
        climateDeviceType === "water-heater",
      ),
      entityDetailsDialog.classList.toggle("switch-details", isSwitchEntity),
      entityDetailsDialog.classList.toggle("momentary-button-details", isButtonEntity));
    const entityDetailsCard = document.createElement("div");
    entityDetailsCard.className = "hb-entity-details-card";
    const entityDetailsHeading = document.createElement("div");
    entityDetailsHeading.className = "hb-entity-details-heading";
    const entityDetailsHeadingRow = document.createElement("div"),
      entityDetailsTitle = document.createElement("strong");
    ((entityDetailsTitle.textContent = isLightEntity
      ? componentDialogTitle(entityDetailsComponent, "灯光")
      : isCoverEntity
        ? componentDialogTitle(entityDetailsComponent, isAirerEntity ? "晾衣机" : "窗帘")
        : isClimateEntity
          ? replace
          : isSwitchEntity
            ? componentDialogTitle2
            : componentDialogTitle(entityDetailsComponent, "设备详情")),
      entityDetailsHeadingRow.append(entityDetailsTitle));
    let entityStateLabelElement: any = null,
      coverStateLabelElement: any = null,
      isEntityDetailsPreviewEntityStateText = String(entityStateValue?.state || ""),
      climateStateLabelElement: any = null,
      buttonStateLabelElement: any = null,
      lineChartStateLabelElement: any = null;
    if (isLightEntity) {
      const switchStateLabel = document.createElement("span");
      ((switchStateLabel.textContent = entityStateValue?.state === "on" ? "已开启" : "已关闭"),
        switchStateLabel.classList.toggle("is-on", entityStateValue?.state === "on"),
        (entityStateLabelElement = switchStateLabel),
        entityDetailsHeadingRow.append(switchStateLabel));
    } else {
      if (isCoverEntity) {
        const coverStateLabel = document.createElement("span"),
          physicalCoverState = physicalCoverState2(entityStateValue?.state, isOpenDirection),
          coverPositionPercent = Number(
            entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
          ),
          coverStateLabels = {
            open: "已打开",
            closed: "已关闭",
            opening: "正在打开",
            closing: "正在关闭",
          };
        ((coverStateLabel.textContent = isAirerEntity
          ? entityStateText(physicalCoverState) || physicalCoverState || "状态未知"
          : isEntityDetailsPreviewIsDreamCover
            ? dreamCurtainStatusText2(
                entityStateValue?.state,
                coverPositionPercent,
                isOpenDirection,
              )
            : (coverStateLabels as any)[physicalCoverState] || physicalCoverState || "状态未知"),
          coverStateLabel.classList.toggle(
            "is-on",
            physicalCoverState === "open" || physicalCoverState === "opening",
          ),
          (coverStateLabelElement = coverStateLabel),
          entityDetailsHeadingRow.append(coverStateLabel));
      } else {
        if (isClimateEntity || isSwitchEntity) {
          const toggleStateLabel = document.createElement("span"),
            toggleStateValue = resolveEntityStateLabel(entityStateValue?.state);
          ((toggleStateLabel.textContent = isButtonEntity
            ? ["unknown", "unavailable"].includes(entityStateValue?.state)
              ? "当前不可用"
              : "按下执行"
            : climateDeviceType === "water-heater"
              ? waterHeaterStatusLabel2(entityStateValue)
              : ["unknown", "unavailable"].includes(entityStateValue?.state)
                ? "当前不可用"
                : toggleStateValue
                  ? "已开启"
                  : "已关闭"),
            toggleStateLabel.classList.toggle("is-on", toggleStateValue),
            isClimateEntity
              ? (climateStateLabelElement = toggleStateLabel)
              : (buttonStateLabelElement = toggleStateLabel),
            entityDetailsHeadingRow.append(toggleStateLabel));
        } else {
          if (entityDetailsComponent.type === "line-chart") {
            const lineChartStateLabel = document.createElement("span");
            ((lineChartStateLabel.textContent =
              entityStateValue?.state == null ||
              ["unknown", "unavailable"].includes(entityStateValue.state)
                ? "暂无数据"
                : "实时数据"),
              (lineChartStateLabelElement = lineChartStateLabel),
              entityDetailsHeadingRow.append(lineChartStateLabel));
          }
        }
      }
    }
    const entityDetailsCloseButton = document.createElement("button");
    ((entityDetailsCloseButton.type = "button"),
      entityDetailsCloseButton.setAttribute("aria-label", "关闭实体详情"),
      (entityDetailsCloseButton.textContent = "×"),
      entityDetailsHeading.append(entityDetailsHeadingRow, entityDetailsCloseButton));
    let currentEntityState = entityStateValue,
      coverVisualControllerElement: ComponentControllerElement | null = null,
      stateController: any = null,
      lightVisualButton: any = null,
      lightVisualSync: any = null,
      coverVisualButton: any = null,
      coverVisualSync: any = null,
      airerLightSync: any = null,
      curtainPosition = 0;
    const airerPositionCalibration = airerPositionCalibration2(
      this.entityMetadata,
      this.deviceMetadata,
      detailEntityIdText,
    );
    let isEntityPending = false,
      climateVisualButton: any = null,
      climateVisualSync: any = null,
      switchVisualButton: any = null,
      toggleController: any = null,
      isEntityDetailsPreviewToggleHandler: any = null,
      isTogglePending = false,
      toggleResetTimerId: any = null,
      toggleStatusText = "idle",
      bathHeaterLightEntityId = "",
      bathLightControl: any = null,
      waterHeaterExtensionControl: any = null,
      registeredEntityIdSet = new Set();
    const selectedRelatedIds = selectedRelatedEntityIds2(entityDetailsComponent);
    if (isLightEntity) {
      ((lightVisualButton = document.createElement("button")),
        (lightVisualButton.type = "button"),
        (lightVisualButton.className = "hb-light-visual"),
        (lightVisualButton.inert = isEntityDetailsPreview),
        lightVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const lightAuraElement = document.createElement("div");
      lightAuraElement.className = "hb-light-visual-aura";
      const lightLampElement = document.createElement("div");
      lightLampElement.className = "hb-light-visual-lamp";
      for (const lampPartName of ["cord", "shade", "bulb", "filament"]) {
        const lampPartElement = document.createElement("i");
        ((lampPartElement.className = "hb-light-visual-" + lampPartName),
          lampPartElement.setAttribute("aria-hidden", "true"),
          lightLampElement.append(lampPartElement));
      }
      const lightVisualStatusLabel = document.createElement("span");
      ((lightVisualStatusLabel.className = "hb-light-visual-status"),
        lightVisualButton.append(lightAuraElement, lightLampElement, lightVisualStatusLabel));
      const warmColorStop =
          Number(entityAttributes.min_color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.max_mireds))
            ? 1000000 / Number(entityAttributes.max_mireds)
            : 2000),
        coolColorStop =
          Number(entityAttributes.max_color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.min_mireds))
            ? 1000000 / Number(entityAttributes.min_mireds)
            : 6500),
        NaN7 =
          Number(entityAttributes.color_temp_kelvin) ||
          (Number.isFinite(Number(entityAttributes.color_temp))
            ? 1000000 / Number(entityAttributes.color_temp)
            : NaN),
        colorTemperatureKelvin = Number.isFinite(NaN7) ? NaN7 : (warmColorStop + coolColorStop) / 2,
        supportsColor = lightSupportsColor2(entityAttributes),
        lightVisualOptions = {
          isOn: entityStateValue?.state === "on",
          brightnessPercent: Number.isFinite(Number(entityAttributes.brightness))
            ? (Number(entityAttributes.brightness) / 255) * 100
            : 100,
          colorTemperatureKelvin: colorTemperatureKelvin,
          colorRgb: supportsColor ? lightColorRgb2(entityAttributes) : null,
        },
        applyLightVisual = () => {
          const brightnessPercent = Math.max(
              1,
              Math.min(100, Number(lightVisualOptions.brightnessPercent) || 1),
            ),
            clampedKelvin = Math.max(
              2000,
              Math.min(6500, Number(lightVisualOptions.colorTemperatureKelvin) || 3000),
            ),
            kelvinRatio = (clampedKelvin - 2000) / 4500,
            warmColorRgb = [255, 132, 42],
            coolColorRgb = [172, 225, 255],
            lightVisualColorCss =
              "rgb(" +
              (
                lightVisualOptions.colorRgb ||
                warmColorRgb.map((warmChannel, channelIndex) =>
                  Math.round(
                    warmChannel + (coolColorRgb[channelIndex] - warmChannel) * kelvinRatio,
                  ),
                )
              ).join(",") +
              ")";
          (lightVisualButton.classList.toggle("is-on", lightVisualOptions.isOn),
            lightVisualButton.style.setProperty("--hb-light-visual-color", lightVisualColorCss),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-opacity",
              lightVisualOptions.isOn ? String(0.08 + (brightnessPercent / 100) * 0.92) : "0",
            ),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-blur",
              Math.round(15 + brightnessPercent * 1.14) + "px",
            ),
            lightVisualButton.style.setProperty(
              "--hb-light-visual-scale",
              String(0.62 + (brightnessPercent / 100) * 1.05),
            ),
            (lightVisualStatusLabel.textContent = lightVisualOptions.isOn
              ? Math.round(brightnessPercent) + "%  ·  " + Math.round(clampedKelvin) + "K"
              : "灯光已关闭"),
            lightVisualButton.setAttribute("aria-label", lightVisualStatusLabel.textContent));
        };
      ((lightVisualSync = (updateLightState: ComponentPayload = {}) => {
        const lightAttributes = updateLightState.attributes || {};
        (typeof updateLightState.isOn == "boolean"
          ? (lightVisualOptions.isOn = updateLightState.isOn)
          : typeof updateLightState.state == "string" &&
            (lightVisualOptions.isOn = updateLightState.state === "on"),
          Number.isFinite(Number(updateLightState.brightnessPercent))
            ? (lightVisualOptions.brightnessPercent = Number(updateLightState.brightnessPercent))
            : Number.isFinite(Number(lightAttributes.brightness)) &&
              (lightVisualOptions.brightnessPercent =
                (Number(lightAttributes.brightness) / 255) * 100),
          Number.isFinite(Number(updateLightState.colorTemperatureKelvin))
            ? (lightVisualOptions.colorTemperatureKelvin = Number(
                updateLightState.colorTemperatureKelvin,
              ))
            : Number.isFinite(Number(lightAttributes.color_temp_kelvin))
              ? (lightVisualOptions.colorTemperatureKelvin = Number(
                  lightAttributes.color_temp_kelvin,
                ))
              : Number.isFinite(Number(lightAttributes.color_temp)) &&
                (lightVisualOptions.colorTemperatureKelvin =
                  1000000 / Number(lightAttributes.color_temp)),
          Object.hasOwn(updateLightState, "colorRgb")
            ? (lightVisualOptions.colorRgb = updateLightState.colorRgb)
            : updateLightState.attributes &&
              supportsColor &&
              (lightVisualOptions.colorRgb = lightColorRgb2(lightAttributes)),
          applyLightVisual());
      }),
        applyLightVisual());
    }
    if (isCoverEntity) {
      ((coverVisualButton = document.createElement("button")),
        (coverVisualButton.type = "button"),
        (coverVisualButton.className = "hb-cover-visual"),
        (coverVisualButton.inert = isEntityDetailsPreview),
        coverVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const coverRailElement = document.createElement("i");
      coverRailElement.className = "hb-cover-visual-rail";
      const coverPanelLeftElement = document.createElement("i");
      coverPanelLeftElement.className = "hb-cover-visual-panel left";
      const coverPanelRightElement = document.createElement("i");
      coverPanelRightElement.className = "hb-cover-visual-panel right";
      const coverSlatsElement = document.createElement("span");
      coverSlatsElement.className = "hb-cover-visual-slats";
      const coverSlatCount = 13;
      for (let coverSlatIndex = 0; coverSlatIndex < coverSlatCount; coverSlatIndex += 1) {
        const coverSlatElement = document.createElement("span");
        coverSlatElement.className = "hb-cover-visual-slat";
        const coverSlatDetailElement = document.createElement("i");
        coverSlatElement.style.setProperty("--hb-cover-slat-index", String(coverSlatIndex));
        const abs4 =
          coverDirection2 === "right"
            ? coverSlatCount - 1 - coverSlatIndex
            : coverDirection2 === "split"
              ? Math.abs((coverSlatCount - 1) / 2 - coverSlatIndex)
              : coverSlatIndex;
        coverSlatElement.style.setProperty("--hb-cover-slat-delay-index", String(abs4));
        const coverSlatShift =
          coverDirection2 === "left"
            ? -coverSlatIndex * 14.5
            : coverDirection2 === "right"
              ? (coverSlatCount - 1 - coverSlatIndex) * 14.5
              : coverSlatIndex <= (coverSlatCount - 1) / 2
                ? -coverSlatIndex * 14.5
                : (coverSlatCount - 1 - coverSlatIndex) * 14.5;
        (coverSlatElement.style.setProperty("--hb-cover-retracted-shift", coverSlatShift + "px"),
          coverSlatElement.append(coverSlatDetailElement),
          coverSlatsElement.append(coverSlatElement));
      }
      const coverWindowElement = document.createElement("i");
      ((coverWindowElement.className = "hb-cover-visual-window"),
        coverVisualButton.classList.toggle("is-dream", isEntityDetailsPreviewIsDreamCover),
        coverVisualButton.classList.toggle("is-airer", isAirerEntity),
        coverVisualButton.classList.add("direction-" + coverDirection2),
        coverVisualButton.append(
          coverWindowElement,
          coverRailElement,
          coverPanelLeftElement,
          coverPanelRightElement,
          coverSlatsElement,
        ),
        isAirerEntity && createAirerVisual(coverVisualButton),
        (airerLightSync = (nextLightState = airerLightStateValue) => {
          if (!isAirerEntity) return;
          airerLightStateValue = nextLightState || airerLightStateValue;
          const isAirerLightUnavailable =
              !airerLightEntityId ||
              ["unknown", "unavailable"].includes(String(airerLightStateValue?.state || "unknown")),
            isAirerLightOn = airerLightStateValue?.state === "on";
          (coverVisualButton.classList.toggle(
            "is-light-on",
            isAirerLightOn && !isAirerLightUnavailable,
          ),
            coverVisualButton.classList.toggle("is-light-unavailable", isAirerLightUnavailable),
            (coverVisualButton.disabled = isEntityDetailsPreview || isAirerLightUnavailable),
            coverVisualButton.setAttribute(
              "aria-pressed",
              String(isAirerLightOn && !isAirerLightUnavailable),
            ),
            coverVisualButton.setAttribute(
              "aria-label",
              isAirerLightUnavailable
                ? "晾衣机灯光实体不可用"
                : "晾衣机灯光" + (isAirerLightOn ? "已开启，点击关闭" : "已关闭，点击开启"),
            ));
        }),
        airerLightSync(),
        (coverVisualSync = ({ position: coverPosition = 0, state: coverState = "" } = {}) => {
          const clampedCoverPosition = Math.max(0, Math.min(100, Number(coverPosition) || 0)),
            coverPresentationState = coverPresentationState2(
              {
                state: coverState,
                attributes: {
                  current_position: clampedCoverPosition,
                },
              },
              isOpenDirection,
            ),
            physicalCoverStateValue = physicalCoverState2(
              coverState || isEntityDetailsPreviewEntityStateText,
              isOpenDirection,
            ),
            isEntityDetailsPreviewIsCoverOpen =
              physicalCoverStateValue === "open" || physicalCoverStateValue === "opening";
          ((curtainPosition = clampedCoverPosition),
            coverVisualButton.style.setProperty(
              "--hb-cover-open-position",
              clampedCoverPosition + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-airer-drop",
              airerVisualDrop2(clampedCoverPosition) + "px",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-panel-width",
              45.9 - clampedCoverPosition * 0.331 + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-single-panel-width",
              91.8 - clampedCoverPosition * 0.79 + "%",
            ),
            coverVisualButton.style.setProperty(
              "--hb-cover-slat-angle",
              clampedCoverPosition * 1.8 + "deg",
            ),
            coverVisualButton.classList.toggle("is-tilt-reversed", clampedCoverPosition > 50),
            coverVisualButton.classList.toggle(
              "is-tilt-center",
              Math.abs(clampedCoverPosition - 50) <= 2,
            ),
            coverVisualButton.classList.toggle(
              "is-open",
              isEntityDetailsPreviewIsDreamCover
                ? isEntityDetailsPreviewIsCoverOpen
                : coverPresentationState === "open" || coverPresentationState === "opening",
            ),
            coverVisualButton.classList.toggle(
              "is-moving",
              coverState === "opening" || coverState === "closing",
            ),
            coverVisualButton.setAttribute(
              "aria-pressed",
              String(
                isEntityDetailsPreviewIsDreamCover
                  ? isEntityDetailsPreviewIsCoverOpen
                  : coverPresentationState === "open" || coverPresentationState === "opening",
              ),
            ),
            isAirerEntity ||
              coverVisualButton.setAttribute(
                "aria-label",
                isEntityDetailsPreviewIsDreamCover
                  ? "" +
                      componentDialogTitle(entityDetailsComponent, "梦幻帘") +
                      dreamCurtainStatusText2(
                        coverState || isEntityDetailsPreviewEntityStateText,
                        clampedCoverPosition,
                        isOpenDirection,
                      )
                  : "" +
                      componentDialogTitle(entityDetailsComponent, "窗帘") +
                      (coverPresentationState === "open" || coverPresentationState === "opening"
                        ? "已打开，点击关闭"
                        : "已关闭，点击打开"),
              ));
        }),
        coverVisualSync({
          position: Number.isFinite(
            Number(
              entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
            ),
          )
            ? Number(
                entityAttributes[hasTiltPosition ? "current_tilt_position" : "current_position"],
              )
            : entityStateValue?.state === "open"
              ? 100
              : 0,
          state: entityStateValue?.state,
        }),
        coverVisualButton.addEventListener("click", async () => {
          if (isEntityDetailsPreview || isEntityPending) return;
          if (
            ((isEntityPending = true),
            coverVisualButton.setAttribute("aria-busy", "true"),
            isAirerEntity)
          ) {
            const finalAirerState = airerLightStateValue;
            airerLightSync({
              ...(airerLightStateValue || {}),
              state: airerLightStateValue?.state === "on" ? "off" : "on",
            });
            try {
              await this.callEntityService("homeassistant", "toggle", airerLightEntityId);
            } catch (coverUpdateError: any) {
              (airerLightSync(finalAirerState), this.options.onError?.(coverUpdateError));
            } finally {
              ((isEntityPending = false), coverVisualButton.removeAttribute("aria-busy"));
            }
            return;
          }
          const currentCoverPosition = curtainPosition,
            isCurtainRetracted =
              coverVisualControllerElement?.isDreamCurtainRetracted?.() ??
              coverVisualButton.dataset.curtainRetracted === "true",
            isCoverPositionOpen = currentCoverPosition > COVER_CLOSED_POSITION_EPSILON;
          (isEntityDetailsPreviewIsDreamCover &&
            coverVisualControllerElement?.beginDreamCurtainMotion?.(!isCurtainRetracted),
            isEntityDetailsPreviewIsDreamCover ||
              coverVisualControllerElement?.beginCoverMotion?.(
                isCoverPositionOpen ? 0 : 100,
                isCoverPositionOpen ? "closing" : "opening",
              ));
          try {
            await this.callEntityService(
              "cover",
              isEntityDetailsPreviewIsDreamCover
                ? dreamCurtainToggleService2(isCurtainRetracted, closeServiceName, openServiceName)
                : isCoverPositionOpen
                  ? openServiceName
                  : closeServiceName,
              detailEntityIdText,
            );
          } catch (coverCommandError: any) {
            (isEntityDetailsPreviewIsDreamCover
              ? (coverVisualControllerElement?.cancelDreamCurtainMotion?.(),
                coverVisualControllerElement?.setDreamCurtainRetracted?.(isCurtainRetracted, false))
              : coverVisualControllerElement?.cancelCoverMotion?.(),
              coverVisualControllerElement?.syncCoverState?.(entityStateValue),
              coverVisualSync({
                position: currentCoverPosition,
                state: entityStateValue?.state,
              }),
              this.options.onError?.(coverCommandError));
          } finally {
            ((isEntityPending = false), coverVisualButton.removeAttribute("aria-busy"));
          }
        }));
    }
    if (isClimateEntity) {
      const climateModeLabels = {
        entityId: detailEntityIdText,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      };
      ((climateVisualButton = document.createElement("button")),
        (climateVisualButton.type = "button"),
        (climateVisualButton.className = "hb-climate-visual"),
        climateVisualButton.classList.toggle("is-bath-heater", climateDeviceType === "bath-heater"),
        climateVisualButton.classList.toggle(
          "is-water-heater",
          climateDeviceType === "water-heater",
        ),
        (climateVisualButton.inert = isEntityDetailsPreview),
        climateVisualButton.setAttribute("aria-disabled", String(isEntityDetailsPreview)));
      const climateVisualUnitElement = document.createElement("div");
      climateVisualUnitElement.className = "hb-climate-visual-unit";
      const climateVisualBrandLabel = document.createElement("span");
      ((climateVisualBrandLabel.className = "hb-climate-visual-brand"),
        (climateVisualBrandLabel.textContent =
          climateDeviceType === "bath-heater"
            ? "BATH HEATER"
            : climateDeviceType === "water-heater"
              ? "SMART WATER"
              : "SMART AIR"));
      const climateVisualDisplayLabel = document.createElement("strong");
      climateVisualDisplayLabel.className = "hb-climate-visual-display";
      const climateVisualVentElement = document.createElement("div");
      climateVisualVentElement.className = "hb-climate-visual-vent";
      for (let ventIndex = 0; ventIndex < 5; ventIndex += 1)
        climateVisualVentElement.append(document.createElement("i"));
      climateVisualUnitElement.append(
        climateVisualBrandLabel,
        climateVisualDisplayLabel,
        climateVisualVentElement,
      );
      const climateVisualAirflowElement = document.createElement("div");
      climateVisualAirflowElement.className = "hb-climate-visual-airflow";
      for (let airflowIndex = 0; airflowIndex < 3; airflowIndex += 1)
        climateVisualAirflowElement.append(document.createElement("i"));
      (climateVisualButton.append(climateVisualUnitElement, climateVisualAirflowElement),
        (climateVisualSync = ({
          mode: climateVisualMode = "off",
          visualMode: climateVisualModeKey = "off",
          running: isClimateVisualRunning = false,
          accentColor: climateAccentColor = "#65717a",
          targetTemperature: climateTargetTemperature,
        }: ClimateVisualSyncPayload = {}) => {
          const isClimateVisualOn = climateVisualModeKey !== "off";
          (climateVisualButton.classList.toggle("is-on", isClimateVisualOn),
            climateVisualButton.classList.toggle("is-running", isClimateVisualRunning),
            climateVisualButton.classList.toggle(
              "is-airflow-mode",
              climateDeviceType === "bath-heater" &&
                isClimateVisualOn &&
                bathHeaterModeUsesAirflow2(climateVisualMode),
            ),
            (climateVisualButton.dataset.visualMode = climateVisualModeKey),
            climateVisualButton.style.setProperty(
              "--hb-climate-visual-accent",
              climateAccentColor,
            ));
          const finite9 =
            climateTargetTemperature != null &&
            climateTargetTemperature !== "" &&
            Number.isFinite(Number(climateTargetTemperature));
          climateVisualDisplayLabel.textContent = isClimateVisualOn
            ? finite9
              ? Number(climateTargetTemperature) + "°"
              : climateModeLabel2(climateVisualMode, climateDeviceType, climateModeLabels)
            : "OFF";
        }));
    }
    if (isSwitchEntity) {
      const hn4 = createSwitchVisual({
        label: componentDialogTitle2,
        interactive: !isEntityDetailsPreview,
        momentary: isButtonEntity,
        onToggle: () => isEntityDetailsPreviewToggleHandler?.(),
      });
      ((switchVisualButton = hn4.visual),
        (toggleController = hn4.sync),
        toggleController(resolveEntityStateLabel(entityStateValue?.state), {
          unavailable: ["unknown", "unavailable"].includes(entityStateValue?.state),
        }));
    }
    const entityStateControl = document.createElement(
      isToggleable ? "button" : "div",
    ) as EntityStateControlElement;
    ((entityStateControl.className = "hb-entity-details-state"),
      isToggleable && (entityStateControl.type = "button"));
    const stateControlIcon = document.createElement("span");
    stateControlIcon.textContent = isToggleable ? "⏻" : "当前状态";
    const stateControlValueLabel = document.createElement("strong"),
      entityStateLabels = {
        off: "关闭",
        auto: "自动",
        cool: "制冷",
        dry: "除湿",
        heat: "制热",
        fan_only: "送风",
        heat_cool: "冷暖自动",
      };
    ((stateControlValueLabel.textContent = isToggleable
      ? entityStateValue?.state
        ? resolveEntityStateLabel(entityStateValue.state)
          ? "已开启"
          : "已关闭"
        : "状态未知"
      : isEntityDetailsPreviewEntityDomain === "climate"
        ? (entityStateLabels as any)[entityStateValue?.state] || entityStateValue?.state || "暂无状态"
        : (entityStateValue?.state ?? "暂无状态")),
      entityStateControl.classList.toggle("hb-light-details-power", isLightEntity),
      entityStateControl.classList.toggle("hb-climate-details-power", isClimateEntity),
      entityStateControl.classList.toggle("hb-switch-details-power", isSwitchEntity),
      entityStateControl.classList.toggle(
        "is-on",
        isToggleable && resolveEntityStateLabel(entityStateValue?.state),
      ),
      entityStateControl.append(stateControlIcon, stateControlValueLabel),
      isToggleable &&
        ((entityStateControl.inert = isEntityDetailsPreview),
        entityStateControl.setAttribute("aria-disabled", String(isEntityDetailsPreview)),
        (stateController = (
          isOnState: any,
          { unavailable: isStateUnavailable = false, syncClimate: shouldSyncClimate = true } = {},
        ) => {
          if (
            (entityStateControl.classList.toggle("is-on", isOnState),
            entityStateControl.classList.toggle("is-unavailable", isStateUnavailable),
            entityStateControl.setAttribute("aria-pressed", String(isOnState)),
            (entityStateControl.disabled = isStateUnavailable || isEntityDetailsPreview),
            (stateControlValueLabel.textContent = isStateUnavailable
              ? "当前不可用"
              : isButtonEntity
                ? toggleStatusText === "success"
                  ? "执行成功"
                  : isTogglePending
                    ? "执行中"
                    : "等待执行"
                : isOnState
                  ? "已开启"
                  : "已关闭"),
            entityStateControl.setAttribute(
              "aria-label",
              isStateUnavailable
                ? (isLightEntity
                    ? componentDialogTitle(entityDetailsComponent, "灯光")
                    : isClimateEntity
                      ? replace
                      : componentDialogTitle2) + "当前不可用"
                : isButtonEntity
                  ? "" +
                    componentDialogTitle2 +
                    (toggleStatusText === "success"
                      ? "执行成功"
                      : isTogglePending
                        ? "正在执行"
                        : "，点击执行")
                  : "" +
                    componentDialogTitle(
                      entityDetailsComponent,
                      isLightEntity ? "灯光" : isClimateEntity ? climateDeviceLabel : "开关",
                    ) +
                    (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
            ),
            isLightEntity &&
              (lightVisualSync?.({
                isOn: isOnState,
              }),
              (entityStateLabelElement.textContent = isOnState ? "已开启" : "已关闭"),
              entityStateLabelElement.classList.toggle("is-on", isOnState),
              lightVisualButton.setAttribute("aria-pressed", String(isOnState)),
              lightVisualButton.setAttribute(
                "aria-label",
                "" +
                  componentDialogTitle(entityDetailsComponent, "灯光") +
                  (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
              )),
            isClimateEntity && coverVisualControllerElement?.syncClimateState && shouldSyncClimate)
          ) {
            const climateCapabilities = normalizeClimateCapabilities2(
                currentEntityState || entityStateValue,
              ),
              fallbackClimateState =
                climateDeviceType === "water-heater"
                  ? climateCapabilities.operationModes.find(
                      (modeCandidate) =>
                        !["off", "空"].includes(String(modeCandidate).trim().toLowerCase()),
                    ) || "普通"
                  : climateCapabilities.hvacModes.find(
                      (hvacModeCandidateValue) => hvacModeCandidateValue !== "off",
                    ) || (climateDeviceType === "bath-heater" ? "heat" : "auto"),
              state3 =
                coverVisualControllerElement!.dataset.lastClimateMode ||
                (entityStateValue?.state && entityStateValue.state !== "off"
                  ? entityStateValue.state
                  : fallbackClimateState);
            coverVisualControllerElement!.syncClimateState!({
              state: isOnState ? (climateDeviceType === "water-heater" ? "on" : state3) : "off",
              attributes: {
                ...(currentEntityState?.attributes || entityStateValue?.attributes || {}),
                operation_mode:
                  climateDeviceType === "water-heater"
                    ? isOnState
                      ? currentEntityState?.attributes?.operation_mode || fallbackClimateState
                      : "off"
                    : undefined,
                hvac_action:
                  climateDeviceType === "water-heater"
                    ? undefined
                    : isOnState
                      ? entityStateValue?.attributes?.hvac_action || state3
                      : "off",
              },
            });
          }
          (isClimateEntity &&
            ((climateStateLabelElement.textContent =
              climateDeviceType === "water-heater"
                ? waterHeaterStatusLabel2({
                    ...(currentEntityState || entityStateValue || {}),
                    state: isOnState ? "on" : "off",
                  })
                : isOnState
                  ? "已开启"
                  : "已关闭"),
            climateStateLabelElement.classList.toggle("is-on", isOnState),
            climateDeviceType === "bath-heater"
              ? (bathLightControl || climateVisualButton.setAttribute("aria-pressed", "false"),
                climateVisualButton.setAttribute("aria-label", replace + "，点击切换浴霸灯"))
              : (climateVisualButton.setAttribute("aria-pressed", String(isOnState)),
                climateVisualButton.setAttribute(
                  "aria-label",
                  "" + replace + (isOnState ? "已开启，点击关闭" : "已关闭，点击开启"),
                ))),
            isSwitchEntity &&
              (toggleController?.(isOnState, {
                pending: isTogglePending && toggleStatusText !== "success",
                success: toggleStatusText === "success",
                unavailable: isStateUnavailable,
              }),
              (buttonStateLabelElement.textContent = isStateUnavailable
                ? "当前不可用"
                : isButtonEntity
                  ? toggleStatusText === "success"
                    ? "执行成功"
                    : isTogglePending
                      ? "正在执行"
                      : "按下执行"
                  : isOnState
                    ? "已开启"
                    : "已关闭"),
              buttonStateLabelElement.classList.toggle(
                "is-on",
                (isButtonEntity ? isTogglePending || toggleStatusText === "success" : isOnState) &&
                  !isStateUnavailable,
              )));
        }),
        entityStateValue?.state &&
          stateController(resolveEntityStateLabel(entityStateValue.state), {
            unavailable: ["unknown", "unavailable"].includes(entityStateValue.state),
          }),
        (isEntityDetailsPreviewToggleHandler = async () => {
          if (isEntityDetailsPreview || isTogglePending || !currentEntityState?.state) return;
          isTogglePending = true;
          const activeVisualButton = isLightEntity
            ? lightVisualButton
            : isClimateEntity
              ? climateVisualButton
              : switchVisualButton;
          activeVisualButton?.setAttribute("aria-busy", "true");
          const contains2 = entityStateControl.classList.contains("is-on"),
            isToggleComplete = isButtonEntity || !contains2;
          stateController(isToggleComplete);
          try {
            if (isButtonEntity)
              (await this.callEntityService("button", "press", detailEntityIdText),
                (toggleStatusText = "success"),
                stateController(false),
                await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 900)));
            else {
              if (isClimateEntity) {
                if (!isToggleComplete && climateDeviceType === "bath-heater") {
                  const presetModeName = normalizeClimateCapabilities2(
                    currentEntityState,
                  ).presetModes.find((presetCandidate) =>
                    ["idle", "standby", "待机", "关闭"].includes(
                      String(presetCandidate).trim().toLowerCase(),
                    ),
                  );
                  presetModeName &&
                    (await this.callEntityService(
                      isEntityDetailsPreviewEntityDomain === "fan" ? "fan" : "climate",
                      "set_preset_mode",
                      detailEntityIdText,
                      {
                        preset_mode: presetModeName,
                      },
                    ));
                }
                const climatePowerCommand = climatePowerCommand2(
                  detailEntityIdText,
                  currentEntityState,
                  isToggleComplete,
                  climateDeviceType,
                  coverVisualControllerElement?.dataset.lastClimateMode || "",
                );
                await this.callEntityService(
                  climatePowerCommand.domain,
                  climatePowerCommand.service,
                  detailEntityIdText,
                  climatePowerCommand.data,
                );
              } else await this.callEntityService("homeassistant", "toggle", detailEntityIdText);
            }
          } catch (powerCommandError: any) {
            ((toggleStatusText = "idle"),
              stateController(contains2),
              this.options.onError?.(powerCommandError));
          } finally {
            ((isTogglePending = false),
              isButtonEntity
                ? ((toggleStatusText = "idle"), stateController(false))
                : isSwitchEntity &&
                  toggleController?.(entityStateControl.classList.contains("is-on")),
              activeVisualButton?.removeAttribute("aria-busy"));
          }
        }),
        entityStateControl.addEventListener("click", isEntityDetailsPreviewToggleHandler),
        isLightEntity &&
          lightVisualButton.addEventListener("click", isEntityDetailsPreviewToggleHandler),
        isClimateEntity &&
          climateVisualButton.addEventListener("click", () => {
            if (climateDeviceType === "bath-heater") {
              bathLightControl?.toggleBathLight
                ? bathLightControl.toggleBathLight()
                : this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
              return;
            }
            isEntityDetailsPreviewToggleHandler();
          })));
    const createClimateControls = isClimateEntity
      ? (climateStateInput: any) =>
          this.createClimateDetailsControls(detailEntityIdText, climateStateInput, {
            interactive: !isEntityDetailsPreview,
            deviceType: climateDeviceType,
            onPowerChange: (powerState: any) =>
              stateController?.(powerState, {
                syncClimate: false,
              }),
            onVisualChange: ({
              mode: climateDetailMode,
              visualMode: climateDetailVisualMode,
              running: isClimateDetailRunning,
              accentColor: climateDetailAccent,
              accentSoft: climateDetailAccentSoft,
              targetTemperature: climateDetailTargetTemperature,
            }: any) => {
              (entityStateControl.classList.toggle("is-running", isClimateDetailRunning),
                entityStateControl.style.setProperty("--hb-climate-accent", climateDetailAccent),
                entityStateControl.style.setProperty(
                  "--hb-climate-accent-soft",
                  climateDetailAccentSoft,
                ),
                climateStateLabelElement.style.setProperty(
                  "--hb-climate-accent",
                  climateDetailAccent,
                ),
                climateDeviceType === "water-heater" &&
                  (climateStateLabelElement.textContent =
                    climateDetailVisualMode === "off"
                      ? "已关闭"
                      : isClimateDetailRunning
                        ? "正在加热"
                        : "保温中"),
                climateVisualSync?.({
                  mode: climateDetailMode,
                  visualMode: climateDetailVisualMode,
                  running: isClimateDetailRunning,
                  accentColor: climateDetailAccent,
                  targetTemperature: climateDetailTargetTemperature,
                }));
            },
            modeColors: {
              cool: entityDetailsComponent.properties?.airflowCoolColor || "#73c8ff",
              heat: entityDetailsComponent.properties?.airflowHeatColor || "#ff8a65",
              other: entityDetailsComponent.properties?.airflowOtherColor || "#dce2e6",
            },
          })
      : null;
    ((coverVisualControllerElement = isLightEntity
      ? this.createLightDetailsControls(detailEntityIdText, entityStateValue, {
          interactive: !isEntityDetailsPreview,
          onTurnOn: () => stateController?.(true),
          onVisualChange: (visualChangePayload: any) => lightVisualSync?.(visualChangePayload),
        })
      : isClimateEntity
        ? createClimateControls!(entityStateValue)
        : isCoverEntity
          ? this.createCoverDetailsControls(detailEntityIdText, entityStateValue, {
              interactive: !isEntityDetailsPreview,
              dream: isEntityDetailsPreviewIsDreamCover,
              airer: isAirerEntity,
              tilt: hasTiltPosition,
              motorReversed: isOpenDirection,
              positionState: positionStateValue,
              positionCommandEntityId: positionCommandEntityId,
              positionCommandState: positionCommandStateValue,
              motorState: motorStateValue,
              airerActionEntityIds: motorActionEntityIds,
              positionCalibration: airerPositionCalibration,
              onVisualChange: ({ position: visualPosition, state: visualState }: any) => {
                (visualState && (isEntityDetailsPreviewEntityStateText = visualState),
                  coverVisualSync?.({
                    position: visualPosition,
                    state: visualState,
                  }));
                const coverVisualPresentationState = coverPresentationState2(
                    {
                      state: visualState,
                      attributes: {
                        current_position: visualPosition,
                      },
                    },
                    isOpenDirection,
                  ),
                  coverPositionLabels = {
                    open: "已打开",
                    closed: "已关闭",
                    opening: "正在打开",
                    closing: "正在关闭",
                  },
                  resolvedCoverState = physicalCoverState2(
                    isEntityDetailsPreviewEntityStateText,
                    isOpenDirection,
                  );
                ((coverStateLabelElement.textContent = isAirerEntity
                  ? entityStateText(coverVisualPresentationState) ||
                    Math.round(visualPosition) + "%"
                  : isEntityDetailsPreviewIsDreamCover
                    ? dreamCurtainStatusText2(
                        isEntityDetailsPreviewEntityStateText,
                        visualPosition,
                        isOpenDirection,
                      )
                    : (coverPositionLabels as any)[coverVisualPresentationState] ||
                      Math.round(visualPosition) + "%"),
                  coverStateLabelElement.classList.toggle(
                    "is-on",
                    isEntityDetailsPreviewIsDreamCover
                      ? resolvedCoverState === "open" || resolvedCoverState === "opening"
                      : coverVisualPresentationState === "open" ||
                          coverVisualPresentationState === "opening",
                  ));
              },
              onCurtainPositionChange: ({
                retracted: isCurtainRetractedValue,
                moving: isCurtainMoving,
              }: any) => {
                (coverVisualButton.classList.toggle(
                  "is-curtain-retracted",
                  isCurtainRetractedValue,
                ),
                  coverVisualButton.classList.toggle("is-curtain-moving", isCurtainMoving),
                  (coverVisualButton.dataset.curtainRetracted = String(isCurtainRetractedValue)),
                  isEntityDetailsPreviewIsDreamCover &&
                    ((coverStateLabelElement.textContent = dreamCurtainStatusFromRetraction2(
                      isCurtainRetractedValue,
                      isCurtainMoving,
                      curtainPosition,
                    )),
                    coverStateLabelElement.classList.toggle("is-on", isCurtainRetractedValue)));
              },
            })
          : null),
      isLightEntity &&
        coverVisualControllerElement?.classList.contains("has-color-picker") &&
        entityDetailsDialog.classList.add("color-picker-details"),
      isClimateEntity &&
        climateDeviceType === "water-heater" &&
        coverVisualControllerElement &&
        climateVisualButton &&
        (coverVisualControllerElement.prepend(climateVisualButton),
        coverVisualControllerElement.syncClimateGrid?.()));
    const profileLightEntityId =
      (isClimateEntity &&
        climateDeviceType === "bath-heater" &&
        detailDeviceProfile?.roles?.light) ||
      "";
    if (
      ((bathHeaterLightEntityId =
        (profileLightEntityId
          ? this.entityMetadata.get(profileLightEntityId)
          : isClimateEntity && climateDeviceType === "bath-heater"
            ? relatedDeviceDomainEntity2(this.entityMetadata, detailEntityIdText, "light")
            : null
        )?.entityId || ""),
      bathHeaterLightEntityId && coverVisualControllerElement)
    ) {
      const bathLightStateValue = this.states.get(bathHeaterLightEntityId),
        bathLightOptions = bathLightStateValue?.newState ||
          bathLightStateValue || {
            state: "unknown",
            attributes: {} as Record<string, any>,
          };
      ((bathLightControl = this.createBathHeaterLightControl(
        bathHeaterLightEntityId,
        bathLightOptions,
        {
          interactive: !isEntityDetailsPreview,
          onStateChange: ({
            isOn: isBathLightOnValue,
            unavailable: isBathLightUnavailableValue,
          }: any) => {
            (climateVisualButton?.classList.toggle(
              "is-light-on",
              isBathLightOnValue && !isBathLightUnavailableValue,
            ),
              climateVisualButton?.setAttribute(
                "aria-pressed",
                String(isBathLightOnValue && !isBathLightUnavailableValue),
              ));
          },
        },
      )),
        coverVisualControllerElement!.append(bathLightControl),
        coverVisualControllerElement!.syncClimateGrid?.());
    }
    const refreshCatalogFn =
      isClimateEntity && (climateDeviceType === "water-heater" || selectedRelatedIds !== null)
        ? () => {
            const registeredEntityIds = registeredEntityIdSet,
              waterHeaterExtensionControls3 = this.createWaterHeaterExtensionControls(
                detailEntityIdText,
                {
                  component: entityDetailsComponent,
                  interactive: !isEntityDetailsPreview,
                  excludedEntityIds: bathHeaterLightEntityId ? [bathHeaterLightEntityId] : [],
                },
              );
            (waterHeaterExtensionControl?.remove(),
              (waterHeaterExtensionControl = waterHeaterExtensionControls3),
              (registeredEntityIdSet = new Set(
                waterHeaterExtensionControls3?.relatedEntityIds || [],
              )),
              coverVisualControllerElement?.classList.toggle(
                "has-multiline-water-heater-extensions",
                climateDeviceType === "water-heater" &&
                  Number(waterHeaterExtensionControls3?.dataset?.controlCount || 0) > 2,
              ),
              climateDeviceType !== "water-heater" &&
                entityDetailsCard.isConnected &&
                entityDetailsDialog.classList.toggle(
                  "has-related-extensions",
                  !!waterHeaterExtensionControls3,
                ),
              waterHeaterExtensionControls3 &&
                coverVisualControllerElement &&
                (climateDeviceType === "water-heater"
                  ? ((
                      coverVisualControllerElement.waterHeaterControlPanel ||
                      coverVisualControllerElement
                    ).append(waterHeaterExtensionControls3),
                    coverVisualControllerElement.syncClimateGrid?.())
                  : entityDetailsCard.isConnected &&
                    (entityDetailsCard.append(waterHeaterExtensionControls3),
                    entityDetailsDialog.classList.add("has-related-extensions"))));
            const stateHandlerMap = this.detailsStateSync?.handlers;
            if (stateHandlerMap) {
              for (const registeredHandlerEntity of registeredEntityIds)
                stateHandlerMap.delete(registeredHandlerEntity);
              for (const [
                extensionEntityId,
                extensionHandlers,
              ] of waterHeaterExtensionControls3?.stateHandlers || []) {
                stateHandlerMap.set(extensionEntityId, extensionHandlers);
                const extensionEntityState = this.states.get(extensionEntityId);
                if (extensionEntityState) {
                  for (const extensionHandler of extensionHandlers)
                    extensionHandler(extensionEntityState.newState || extensionEntityState);
                }
              }
            }
          }
        : null;
    refreshCatalogFn?.();
    let lineChartContainer: ComponentControllerElement | null =
        entityDetailsComponent.type === "line-chart"
          ? renderLineChartDetails2(entityDetailsComponent, {
              states: this.states,
              history: this.historySeries,
              renderNamespace: this.renderNamespace,
            })
          : null,
      lineChartCurrentVisualElement: any = null,
      lineChartCurrentValue: any = null,
      lineChartUnitLabel: any = null;
    const attributeList = document.createElement("dl");
    attributeList.className = "hb-entity-details-attributes";
    for (const [isEntityDetailsPreviewAttributeName, attributeValue] of Object.entries(
      entityAttributes,
    ).filter(([attributeKey]) => attributeKey !== "friendly_name")) {
      const attributeRow = document.createElement("div"),
        attributeTermElement = document.createElement("dt");
      attributeTermElement.textContent = isEntityDetailsPreviewAttributeName;
      const attributeDescriptionElement = document.createElement("dd");
      ((attributeDescriptionElement.textContent =
        typeof attributeValue == "string" ? attributeValue : JSON.stringify(attributeValue)),
        attributeRow.append(attributeTermElement, attributeDescriptionElement),
        attributeList.append(attributeRow));
    }
    if (lineChartContainer) {
      ((lineChartCurrentVisualElement = document.createElement("section")),
        (lineChartCurrentVisualElement.className = "hb-line-chart-current-visual"),
        lineChartCurrentVisualElement.style.setProperty(
          "--hb-chart-current-color",
          lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (lineChartCurrentValue = document.createElement("strong")));
      const float2 = Number.parseFloat(entityStateValue?.state);
      ((lineChartCurrentValue.textContent = Number.isFinite(float2)
        ? formatLineChartValue2(float2, entityDetailsComponent.properties?.statePrecision)
        : entityStateValue?.state || "--"),
        (lineChartUnitLabel = document.createElement("small")),
        (lineChartUnitLabel.textContent = String(
          entityAttributes.unit_of_measurement || "实时数值",
        )),
        lineChartCurrentVisualElement.append(lineChartCurrentValue, lineChartUnitLabel),
        entityStateControl.style.setProperty(
          "--hb-chart-current-color",
          lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
        ),
        (stateControlIcon.textContent = "●"),
        (stateControlValueLabel.textContent = "实时数据"),
        entityDetailsCard.append(
          entityDetailsHeading,
          lineChartCurrentVisualElement,
          lineChartContainer,
        ));
    } else {
      if (isClimateEntity)
        (entityDetailsCard.append(
          entityDetailsHeading,
          ...(climateDeviceType === "water-heater"
            ? [coverVisualControllerElement]
            : [climateVisualButton, coverVisualControllerElement]),
          ...(climateDeviceType !== "water-heater" && waterHeaterExtensionControl
            ? [waterHeaterExtensionControl]
            : []),
        ),
          entityDetailsDialog.classList.toggle(
            "has-related-extensions",
            climateDeviceType !== "water-heater" && !!waterHeaterExtensionControl,
          ));
      else {
        if (isLightEntity) {
          const lightDetailsLayout = document.createElement("div");
          lightDetailsLayout.className = "hb-light-details-layout";
          const lightDetailsPanel = document.createElement("section");
          ((lightDetailsPanel.className = "hb-light-details-panel"),
            lightDetailsPanel.append(
              ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
            ),
            lightDetailsLayout.append(lightDetailsPanel, lightVisualButton),
            entityDetailsCard.append(entityDetailsHeading, lightDetailsLayout));
        } else {
          if (isSwitchEntity) {
            const switchDetailsLayout = document.createElement("div");
            ((switchDetailsLayout.className = "hb-switch-details-layout"),
              switchDetailsLayout.append(switchVisualButton),
              entityDetailsCard.append(entityDetailsHeading, switchDetailsLayout));
          } else {
            if (isCoverEntity) {
              const coverDetailsLayout = document.createElement("div");
              coverDetailsLayout.className = "hb-cover-details-layout";
              const coverDetailsPanel = document.createElement("section");
              ((coverDetailsPanel.className = "hb-cover-details-panel"),
                coverDetailsPanel.append(
                  ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                ),
                coverDetailsLayout.append(coverDetailsPanel, coverVisualButton),
                entityDetailsCard.append(entityDetailsHeading, coverDetailsLayout));
            } else {
              if (attributeList.childElementCount)
                entityDetailsCard.append(
                  entityDetailsHeading,
                  entityStateControl,
                  ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                  attributeList,
                );
              else {
                const attributeEmptyHint = document.createElement("p");
                ((attributeEmptyHint.className = "hb-entity-details-empty"),
                  (attributeEmptyHint.textContent = "该实体暂无附加属性。"),
                  attributeList.replaceWith(attributeEmptyHint),
                  entityDetailsCard.append(
                    entityDetailsHeading,
                    entityStateControl,
                    ...(coverVisualControllerElement ? [coverVisualControllerElement] : []),
                    attributeEmptyHint,
                  ));
              }
            }
          }
        }
      }
    }
    entityDetailsDialog.append(entityDetailsCard);
    const entityDetailsOverlay = document.createElement("div");
    ((entityDetailsOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (entityDetailsOverlay.tabIndex = -1),
      entityDetailsOverlay.append(entityDetailsDialog),
      this.container.append(entityDetailsOverlay),
      (this.detailsDialog = entityDetailsDialog));
    const dialogScaleX = isClimateEntity
        ? 840
        : entityDetailsComponent.type === "line-chart"
          ? 780
          : isLightEntity || isCoverEntity
            ? 760
            : isSwitchEntity
              ? 620
              : 460,
      dialogScaleY = isClimateEntity
        ? climateDeviceType !== "water-heater" && waterHeaterExtensionControl
          ? 620
          : 540
        : isLightEntity || isCoverEntity
          ? 620
          : isSwitchEntity
            ? 500
            : 680;
    this.registerRuntimeDialogScale(
      entityDetailsOverlay,
      entityDetailsDialog,
      dialogScaleX,
      dialogScaleY,
    );
    let historyRefreshTimerId = 0;
    if (entityDetailsComponent.type === "line-chart" && lineChartContainer) {
      const refreshLineChart = () => {
          if (
            ((historyRefreshTimerId = 0),
            !lineChartContainer?.isConnected ||
              this.detailsStateSync?.dialog !== entityDetailsDialog)
          )
            return;
          const lineChartDetails = renderLineChartDetails2(entityDetailsComponent, {
            states: this.states,
            history: this.historySeries,
            renderNamespace: this.renderNamespace,
          });
          (lineChartContainer!.cleanupLineChartHover?.(),
            lineChartContainer!.replaceWith(lineChartDetails),
            (lineChartContainer = lineChartDetails),
            lineChartCurrentVisualElement.style.setProperty(
              "--hb-chart-current-color",
              lineChartContainer.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
        scheduleHistoryRefresh = (refreshDelayMs = 700) => {
          historyRefreshTimerId ||
            (historyRefreshTimerId = window.setTimeout(
              refreshLineChart,
              Math.max(0, Number(refreshDelayMs) || 0),
            ));
        };
      this.detailsStateSync = {
        dialog: entityDetailsDialog,
        entityId: detailEntityIdText,
        refreshHistory: () => scheduleHistoryRefresh(0),
        apply: (chartState: any) => {
          const float3 = Number.parseFloat(chartState?.state);
          ((lineChartCurrentValue.textContent = Number.isFinite(float3)
            ? formatLineChartValue2(float3, entityDetailsComponent.properties?.statePrecision)
            : chartState?.state || "--"),
            (lineChartUnitLabel.textContent = String(
              chartState?.attributes?.unit_of_measurement || "实时数值",
            )),
            (lineChartStateLabelElement.textContent =
              chartState?.state == null || ["unknown", "unavailable"].includes(chartState.state)
                ? "暂无数据"
                : "实时数据"),
            lineChartContainer!.syncLineChartState?.(chartState),
            lineChartCurrentVisualElement.style.setProperty(
              "--hb-chart-current-color",
              lineChartContainer!.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e",
            ));
        },
      };
    } else {
      if (isToggleable && stateController) {
        const applyEntityState = (nextEntityState: any) => {
            if (
              ((currentEntityState = nextEntityState),
              isClimateEntity && createClimateControls && coverVisualControllerElement)
            ) {
              const climateStructureKey = climateControlStructureKey2(
                detailEntityIdText,
                nextEntityState,
                climateDeviceType,
              );
              if (
                coverVisualControllerElement!.dataset.climateStructureKey !== climateStructureKey
              ) {
                const climateControlsElement = createClimateControls!(nextEntityState);
                (climateControlsElement.classList.toggle(
                  "has-multiline-water-heater-extensions",
                  coverVisualControllerElement!.classList.contains(
                    "has-multiline-water-heater-extensions",
                  ),
                ),
                  climateControlsElement.classList.add("is-runtime-hydrated"),
                  climateDeviceType === "water-heater" &&
                    climateVisualButton &&
                    climateControlsElement.prepend(climateVisualButton),
                  bathLightControl &&
                    (climateControlsElement.append(bathLightControl),
                    climateControlsElement.syncClimateGrid?.()),
                  waterHeaterExtensionControl &&
                    climateDeviceType === "water-heater" &&
                    ((
                      climateControlsElement.waterHeaterControlPanel || climateControlsElement
                    ).append(waterHeaterExtensionControl),
                    climateControlsElement.syncClimateGrid?.()),
                  coverVisualControllerElement!.replaceWith(climateControlsElement),
                  (coverVisualControllerElement = climateControlsElement));
              }
            }
            (nextEntityState?.state &&
              stateController(
                resolveEntityStateLabel(nextEntityState.state, nextEntityState.attributes),
                {
                  unavailable: ["unknown", "unavailable"].includes(nextEntityState.state),
                },
              ),
              coverVisualControllerElement?.syncLightState?.(nextEntityState),
              coverVisualControllerElement?.syncClimateState?.(nextEntityState));
          },
          entityHandlersByEntityId = new Map([[detailEntityIdText, [applyEntityState]]]);
        if (
          (bathHeaterLightEntityId &&
            bathLightControl &&
            entityHandlersByEntityId.set(bathHeaterLightEntityId, [
              (bathLightStateArg) => bathLightControl.syncBathLightState?.(bathLightStateArg),
            ]),
          waterHeaterExtensionControl?.stateHandlers)
        ) {
          for (const [handlerEntityIdValue, handlerFn] of waterHeaterExtensionControl.stateHandlers)
            entityHandlersByEntityId.set(handlerEntityIdValue, handlerFn);
        }
        if (
          ((this.detailsStateSync = {
            dialog: entityDetailsDialog,
            handlers: entityHandlersByEntityId,
            refreshEntityCatalog: refreshCatalogFn,
          }),
          isClimateEntity &&
            coverVisualControllerElement?.querySelector(".hb-climate-details-loading"))
        ) {
          const requestStartedAt = Date.now();
          toggleResetTimerId = window.setInterval(() => {
            const latestEntityState = this.states.get(detailEntityIdText),
              currentEntityStateValue = latestEntityState?.newState || latestEntityState;
            (currentEntityStateValue && applyEntityState(currentEntityStateValue),
              (!coverVisualControllerElement?.querySelector(".hb-climate-details-loading") ||
                Date.now() - requestStartedAt >= 30000) &&
                (window.clearInterval(toggleResetTimerId), (toggleResetTimerId = null)));
          }, 120);
        }
      } else {
        if (isCoverEntity) {
          const coverHandlersByEntityId = new Map([
            [
              detailEntityIdText,
              [(coverStateArg: any) => coverVisualControllerElement?.syncCoverState?.(coverStateArg)],
            ],
          ]);
          (airerLightEntityId && coverHandlersByEntityId.set(airerLightEntityId, [airerLightSync]),
            positionEntityId &&
              coverHandlersByEntityId.set(positionEntityId, [
                (coverPositionArg) =>
                  coverVisualControllerElement?.syncCoverPositionState?.(coverPositionArg),
              ]),
            positionCommandEntityId &&
              coverHandlersByEntityId.set(positionCommandEntityId, [
                (coverPositionCommandState) => {
                  (coverVisualControllerElement?.syncCoverPositionCommandState?.(
                    coverPositionCommandState,
                  ),
                    positionEntityId ||
                      coverVisualControllerElement?.syncCoverPositionState?.(
                        coverPositionCommandState,
                      ));
                },
              ]),
            motorEntityId &&
              coverHandlersByEntityId.set(motorEntityId, [
                (motorStateArg) =>
                  coverVisualControllerElement?.syncAirerMotorState?.(motorStateArg),
              ]),
            (this.detailsStateSync = {
              dialog: entityDetailsDialog,
              handlers: coverHandlersByEntityId,
            }));
        }
      }
    }
    (entityDetailsCloseButton.addEventListener("click", () => entityDetailsDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        entityDetailsOverlay,
        entityDetailsDialog,
        entityDetailsCard,
      ),
      entityDetailsOverlay.addEventListener("keydown", (entityDetailsOverlayKeyEvent) => {
        entityDetailsOverlayKeyEvent.key === "Escape" && entityDetailsDialog.close();
      }),
      entityDetailsDialog.addEventListener(
        "close",
        () => {
          (window.clearTimeout(historyRefreshTimerId),
            window.clearInterval(toggleResetTimerId),
            (toggleResetTimerId = null),
            coverVisualControllerElement?.cleanupLightDetails?.(),
            coverVisualControllerElement?.cleanupClimateDetails?.(),
            coverVisualControllerElement?.cleanupCoverDetails?.(),
            lineChartContainer?.cleanupLineChartHover?.(),
            this.clearRuntimeDialogScale(entityDetailsDialog),
            this.detailsDialog === entityDetailsDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === entityDetailsDialog && (this.detailsStateSync = null),
            entityDetailsOverlay.remove());
        },
        {
          once: true,
        },
      ),
      entityDetailsDialog.show(),
      entityDetailsDialog.focus({
        preventScroll: true,
      }));
  }
