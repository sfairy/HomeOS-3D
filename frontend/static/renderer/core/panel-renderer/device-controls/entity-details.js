/*
 * 设备控件区块：实体详情总入口。
 *
 * 单个组件没有专门的详情页时走这里：按实体域与能力挑一组控件渲染详情弹窗，
 * 并负责「实体目录还没到、详情先被点开」时的等待与补开。
 */

import {
  COVER_POSITION_EPSILON_PERCENT,
  formatLineChartValue,
  renderLineChartDetails
} from "../../registry.js?v=2609220141";
import { paletteColor } from "../../../../utils/colors.js?v=2609220141";
import { entityDomainFromId } from "../../../../utils/entities.js?v=2609220141";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609220141";
import {
  bathHeaterModeUsesAirflow,
  climateControlStructureKey,
  climateDeviceLabel,
  climateIsPoweredOn,
  climateModeLabel,
  climatePowerCommand,
  normalizeClimateCapabilities,
  resolveClimateDeviceType,
  waterHeaterStatusLabel
} from "../../../controls/climate.js?v=2609220141";
import { applyXiaomiDeviceProfile } from "../../device-profiles.js?v=2609220141";
import { selectedRelatedEntityIds } from "../../../../shared/related-entities.js?v=2609220141";
import { hsToRgbColor, lightSupportsColor } from "../../../controls/light-runtime.js?v=2609220141";
import {
  airerPositionCalibration,
  airerVisualDrop,
  coverComponentIsAirer,
  coverPresentationState,
  dreamCurtainStatusFromRetraction,
  dreamCurtainStatusText,
  dreamCurtainToggleService,
  physicalCoverState,
  relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity,
  relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity,
  relatedDeviceDomainEntity
} from "../../../controls/cover-runtime.js?v=2609220141";
import {
  coverMotorIsReversedForComponent
} from "../../../controls/cover-direction.js?v=2609220141";
import {
  airerPositionLabel,
  appendAirerVisual,
  componentDialogTitle,
  createSwitchVisual
} from "../primitives.js?v=2609220141";

export const entityDetailsMethods = {
  /**
   * 打开实体详情弹窗：按设备画像渲染相应区块，是「更多信息」动作的落点。
   * 各类设备的详情差异全部收敛在这里，因此是本文件里最大的分支树；数据未就绪的设备（热水器等）交由 deferEntityDetailsUntilReady 挂起后重试。
   * @throws {Error} 组件没有绑定实体。
   */
  showEntityDetails(detailsComponent, { preview: detailsPreview = false } = {}) {
    const detailsEntityId = detailsComponent.bindings?.entity?.entityId;
    if (!detailsEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    const resolvedDetailsEntityId = String(detailsEntityId);
    const deviceProfile = this.deviceProfile(resolvedDetailsEntityId);
    detailsComponent = applyXiaomiDeviceProfile(detailsComponent, deviceProfile);
    const detailsEntityDomain = entityDomainFromId(resolvedDetailsEntityId);
    const isElectricBedDevice =
      detailsComponent.properties?.deviceType === "electric-bed" ||
      deviceProfile?.deviceType === "electric-bed";
    if (!this.entityCatalogReady) {
      this.deferEntityDetailsUntilReady(
        {
          ...detailsComponent,
          properties: {
            ...(detailsComponent.properties || {}),
            __catalogRetry: true
          }
        },
        detailsPreview,
        isElectricBedDevice ? "electric-bed-catalog" : "catalog"
      );
      // 画像尚未就绪但已知是电动床：先给加载态弹窗，否则用户点下去毫无反馈。
      if (isElectricBedDevice) {
        this.showElectricBedLoadingDetails(detailsComponent, {
          preview: detailsPreview
        });
      }
      return;
    }
    if (
      !deviceProfile &&
      detailsEntityDomain === "number" &&
      !detailsComponent.properties?.__catalogRetry
    ) {
      this.deferEntityDetailsUntilReady(
        {
          ...detailsComponent,
          properties: {
            ...(detailsComponent.properties || {}),
            __catalogRetry: true
          }
        },
        detailsPreview,
        isElectricBedDevice ? "electric-bed-catalog" : "catalog"
      );
      if (isElectricBedDevice) {
        this.showElectricBedLoadingDetails(detailsComponent, {
          preview: detailsPreview
        });
      }
      return;
    }
    // 热水器要先拿到温度区间才能画刻度；数据没到就挂起，等状态推送后再自动打开。
    if (
      detailsEntityDomain === "water_heater" &&
      !this.waterHeaterDetailsReady(resolvedDetailsEntityId)
    ) {
      this.deferEntityDetailsUntilReady(detailsComponent, detailsPreview);
      return;
    }
    // 走到这里说明所需数据齐备，作废挂起超时，避免稍后又弹一次。
    window.clearTimeout(this.pendingEntityDetails?.timer);
    this.pendingEntityDetails = null;
    if (detailsComponent.type === "presence-sensor") {
      this.showPresenceDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (deviceProfile?.deviceType === "electric-bed") {
      this.showElectricBedDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (
      deviceProfile?.deviceType === "air-purifier" &&
      detailsEntityDomain === "fan" &&
      ["icon-button", "device-button", "icon-button-effect"].includes(detailsComponent.type)
    ) {
      detailsComponent = {
        ...detailsComponent,
        type: "air-purifier",
        properties: {
          ...(detailsComponent.properties || {}),
          deviceType: "air-purifier"
        }
      };
    }
    // 专有详情类型名单：命中则走各自的详情实现，其余落到通用能力弹窗。
    const isDedicatedDetailsType = new Set([
      "line-chart",
      "media-player",
      "air-purifier",
      "air-conditioner",
      "water-heater",
      "vacuum-control",
      "electric-bed"
    ]).has(detailsComponent.type);
    if (
      detailsComponent.type === "media-player" ||
      (!isDedicatedDetailsType && detailsEntityDomain === "media_player")
    ) {
      this.showMediaPlayerDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (detailsComponent.type === "air-purifier") {
      this.showAirPurifierDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    if (
      ["air-conditioner", "bath-heater"].includes(deviceProfile?.deviceType) &&
      ["climate", "fan"].includes(detailsEntityDomain) &&
      !isDedicatedDetailsType &&
      detailsComponent.type !== "air-conditioner"
    ) {
      detailsComponent = {
        ...detailsComponent,
        type: "air-conditioner"
      };
    }
    if (
      detailsComponent.type === "vacuum-control" ||
      (!isDedicatedDetailsType && resolvedDetailsEntityId.startsWith("vacuum."))
    ) {
      this.showVacuumDetails(detailsComponent, {
        preview: detailsPreview
      });
      return;
    }
    const entityCatalogState = this.states.get(resolvedDetailsEntityId);
    const detailsEntityState = resolveStateEntry(entityCatalogState);
    const entityAttributes = detailsEntityState?.attributes || {};
    const isLineChart = detailsComponent.type === "line-chart";
    const isCover = !isLineChart && detailsEntityDomain === "cover";
    const coverKindSetting = ["standard", "dream", "airer"].includes(
      detailsComponent.properties?.coverKind
    )
      ? detailsComponent.properties.coverKind
      : "auto";
    const isAirerDevice =
      isCover &&
      coverComponentIsAirer(
        detailsComponent,
        resolvedDetailsEntityId,
        detailsEntityState,
        this.entityMetadata,
        this.deviceMetadata
      );
    const supportedFeatures = Number(entityAttributes.supported_features || 0);
    const coverSearchText =
      resolvedDetailsEntityId +
      " " +
      (entityAttributes.friendly_name || "") +
      " " +
      (detailsComponent.properties?.label || "");
    const supportsTiltPosition =
      Number.isFinite(Number(entityAttributes.current_tilt_position)) ||
      !!(supportedFeatures & 240);
    const isDreamCoverName = /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(coverSearchText);
    const isDreamCover =
      isCover &&
      !isAirerDevice &&
      (coverKindSetting === "dream" ||
        (coverKindSetting === "auto" && (supportsTiltPosition || isDreamCoverName)));
    const isTiltCover = isDreamCover && supportsTiltPosition;
    const airerLightRelatedEntityId =
      (isAirerDevice ? relatedAirerLightEntity(this.entityMetadata, resolvedDetailsEntityId) : null)
        ?.entityId || "";
    const airerLightRelatedState = airerLightRelatedEntityId
      ? this.states.get(airerLightRelatedEntityId)
      : null;
    let airerLightCurrentState = resolveStateEntry(airerLightRelatedState);
    const airerPositionNumberEntityId =
      (isAirerDevice
        ? relatedAirerPositionNumberEntity(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerPositionNumberState = this.states.get(airerPositionNumberEntityId);
    const airerPositionCurrentState =
      resolveStateEntry(airerPositionNumberState);
    const airerPositionSensorEntityId =
      (isAirerDevice
        ? relatedAirerCurrentPositionSensor(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerMotorSpeedSensorId =
      (isAirerDevice
        ? relatedAirerMotorSpeedSensor(this.entityMetadata, resolvedDetailsEntityId)
        : null
      )?.entityId || "";
    const airerMotorSpeedSensorState = this.states.get(airerMotorSpeedSensorId);
    const airerMotorSpeedCurrentState =
      resolveStateEntry(airerMotorSpeedSensorState);
    const airerActionEntities = isAirerDevice
      ? relatedAirerMotorActionEntities(this.entityMetadata, resolvedDetailsEntityId)
      : {};
    const airerActionEntityIdMap = Object.fromEntries(
      Object.entries(airerActionEntities).map(([actionRoleName, actionRoleEntity]) => [
        actionRoleName,
        actionRoleEntity?.entityId || ""
      ])
    );
    const airerPositionSensorState = this.states.get(
      airerPositionSensorEntityId || airerPositionNumberEntityId
    );
    const airerPositionSensorCurrentState =
      resolveStateEntry(airerPositionSensorState);
    const isCoverMotorPolarityReversed =
      isCover && coverMotorIsReversedForComponent(detailsComponent);
    const coverPrimaryService = isCoverMotorPolarityReversed ? "open_cover" : "close_cover";
    const coverSecondaryService = isCoverMotorPolarityReversed ? "close_cover" : "open_cover";
    const coverSplitDirection = ["left", "right"].includes(
      detailsComponent.properties?.coverDirection
    )
      ? detailsComponent.properties.coverDirection
      : "split";
    const isMomentaryButton = !isLineChart && detailsEntityDomain === "button";
    const isSwitchLike =
      !isLineChart &&
      (isMomentaryButton || ["switch", "input_boolean"].includes(detailsEntityDomain));
    const isLightDetails =
      detailsComponent.type === "icon-button" && detailsEntityDomain === "light";
    const isClimateDetails =
      !isLineChart &&
      (detailsComponent.type === "air-conditioner" ||
        detailsComponent.type === "water-heater" ||
        ["climate", "water_heater"].includes(detailsEntityDomain));
    const resolvedClimateDeviceType = isClimateDetails
      ? detailsEntityDomain === "water_heater" || detailsComponent.type === "water-heater"
        ? "water-heater"
        : resolveClimateDeviceType(detailsComponent, detailsEntityState, resolvedDetailsEntityId)
      : "air-conditioner";
    const climateTypeLabel = climateDeviceLabel(resolvedClimateDeviceType);
    const climateDialogTitle = componentDialogTitle(
      detailsComponent,
      String(entityAttributes.friendly_name || "").trim() || climateTypeLabel
    ).replace(/(浴霸)(?:\s+浴霸)+$/i, "$1");
    const switchDialogTitle = componentDialogTitle(
      detailsComponent,
      String(entityAttributes.friendly_name || "").trim() || (isMomentaryButton ? "按钮" : "开关")
    );
    const hasPowerToggle = isLightDetails || isClimateDetails || isSwitchLike;
    this.closeRuntimeDialog();
    /**
     * 判断实体当前是否处于「开启」状态。
     * 三类控件规则不同：瞬时按钮（button）恒为 false；灯与开关只看 state === "on"；
     * 气候类交给 climateIsPoweredOn —— 还要结合 hvac_action / preset_mode，否则送风、除湿会被判成关。
     */
    const resolvePowerOn = (powerStateText, powerStateAttributes = entityAttributes) =>
      isMomentaryButton
        ? false
        : isLightDetails || isSwitchLike
          ? powerStateText === "on"
          : climateIsPoweredOn(
              {
                state: powerStateText,
                attributes: powerStateAttributes
              },
              resolvedClimateDeviceType
            );
    const entityDialog = document.createElement("dialog");
    entityDialog.className = "hb-entity-details-dialog";
    entityDialog.tabIndex = -1;
    entityDialog.classList.toggle("line-chart-details", isLineChart);
    entityDialog.classList.toggle("light-details", isLightDetails);
    entityDialog.classList.toggle("cover-details", isCover);
    entityDialog.classList.toggle("dream-cover-details", isDreamCover);
    entityDialog.classList.toggle("airer-cover-details", isAirerDevice);
    entityDialog.classList.toggle("climate-details", isClimateDetails);
    entityDialog.classList.toggle(
      "bath-heater-details",
      resolvedClimateDeviceType === "bath-heater"
    );
    entityDialog.classList.toggle(
      "water-heater-details",
      resolvedClimateDeviceType === "water-heater"
    );
    entityDialog.classList.toggle("switch-details", isSwitchLike);
    entityDialog.classList.toggle("momentary-button-details", isMomentaryButton);
    const entityDialogCard = document.createElement("div");
    entityDialogCard.className = "hb-entity-details-card";
    const entityDialogHeading = document.createElement("div");
    entityDialogHeading.className = "hb-entity-details-heading";
    const entityTitleRow = document.createElement("div");
    const entityTitleText = document.createElement("strong");
    entityTitleText.textContent = isLightDetails
      ? componentDialogTitle(detailsComponent, "灯光")
      : isCover
        ? componentDialogTitle(detailsComponent, isAirerDevice ? "晾衣机" : "窗帘")
        : isClimateDetails
          ? climateDialogTitle
          : isSwitchLike
            ? switchDialogTitle
            : componentDialogTitle(detailsComponent, "设备详情");
    entityTitleRow.append(entityTitleText);
    let lightStatusText = null;
    let coverStatusText = null;
    let coverPhysicalStateText = String(detailsEntityState?.state || "");
    let climateStatusText = null;
    let switchStatusText = null;
    let chartStatusText = null;
    if (isLightDetails) {
      const lightStatusElement = document.createElement("span");
      lightStatusElement.textContent = detailsEntityState?.state === "on" ? "已开启" : "已关闭";
      lightStatusElement.classList.toggle("is-on", detailsEntityState?.state === "on");
      lightStatusText = lightStatusElement;
      entityTitleRow.append(lightStatusElement);
    } else if (isCover) {
      const coverStatusElement = document.createElement("span");
      const physicalState = physicalCoverState(
        detailsEntityState?.state,
        isCoverMotorPolarityReversed
      );
      const currentPositionValue = Number(
        entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"]
      );
      const coverStateLabels = {
        open: "已打开",
        closed: "已关闭",
        opening: "正在打开",
        closing: "正在关闭"
      };
      coverStatusElement.textContent = isAirerDevice
        ? airerPositionLabel(physicalState) || physicalState || "状态未知"
        : isDreamCover
          ? dreamCurtainStatusText(
              detailsEntityState?.state,
              currentPositionValue,
              isCoverMotorPolarityReversed
            )
          : coverStateLabels[physicalState] || physicalState || "状态未知";
      coverStatusElement.classList.toggle(
        "is-on",
        physicalState === "open" || physicalState === "opening"
      );
      coverStatusText = coverStatusElement;
      entityTitleRow.append(coverStatusElement);
    } else if (isClimateDetails || isSwitchLike) {
      const powerStatusElement = document.createElement("span");
      const isPowerOn = resolvePowerOn(detailsEntityState?.state);
      powerStatusElement.textContent = isMomentaryButton
        ? ["unknown", "unavailable"].includes(detailsEntityState?.state)
          ? "当前不可用"
          : "按下执行"
        : resolvedClimateDeviceType === "water-heater"
          ? waterHeaterStatusLabel(detailsEntityState)
          : ["unknown", "unavailable"].includes(detailsEntityState?.state)
            ? "当前不可用"
            : isPowerOn
              ? "已开启"
              : "已关闭";
      powerStatusElement.classList.toggle("is-on", isPowerOn);
      if (isClimateDetails) {
        climateStatusText = powerStatusElement;
      } else {
        switchStatusText = powerStatusElement;
      }
      entityTitleRow.append(powerStatusElement);
    } else if (detailsComponent.type === "line-chart") {
      const chartStatusElement = document.createElement("span");
      chartStatusElement.textContent =
        detailsEntityState?.state == null ||
        ["unknown", "unavailable"].includes(detailsEntityState.state)
          ? "暂无数据"
          : "实时数据";
      chartStatusText = chartStatusElement;
      entityTitleRow.append(chartStatusElement);
    }
    const entityCloseButton = document.createElement("button");
    entityCloseButton.type = "button";
    entityCloseButton.setAttribute("aria-label", "关闭实体详情");
    entityCloseButton.textContent = "×";
    entityDialogHeading.append(entityTitleRow, entityCloseButton);
    let latestEntityState = detailsEntityState;
    let detailsControls = null;
    let renderPowerState = null;
    let entityLightVisual = null;
    let applyLightVisualState = null;
    let entityCoverVisual = null;
    let renderCoverPosition = null;
    let renderAirerLight = null;
    let coverOpenPosition = 0;
    const airerLiftCalibration = airerPositionCalibration(
      this.entityMetadata,
      this.deviceMetadata,
      resolvedDetailsEntityId
    );
    let isCoverCommandPending = false;
    let entityClimateVisual = null;
    let renderClimateVisual = null;
    let switchVisualElement = null;
    let syncSwitchVisual = null;
    let toggleEntityPower = null;
    let isEntityTogglePending = false;
    let climatePollTimer = null;
    let buttonActionStatus = "idle";
    let bathHeaterLightEntityId = "";
    let bathHeaterLightController = null;
    let relatedExtensionsControl = null;
    let relatedExtensionEntityIds = new Set();
    const selectedRelatedIds = selectedRelatedEntityIds(detailsComponent);
    if (isLightDetails) {
      entityLightVisual = document.createElement("button");
      entityLightVisual.type = "button";
      entityLightVisual.className = "hb-light-visual";
      entityLightVisual.inert = detailsPreview;
      entityLightVisual.setAttribute("aria-disabled", String(detailsPreview));
      const lightVisualAura = document.createElement("div");
      lightVisualAura.className = "hb-light-visual-aura";
      const lightVisualLamp = document.createElement("div");
      lightVisualLamp.className = "hb-light-visual-lamp";
      for (const lightShapeName of ["cord", "shade", "bulb", "filament"]) {
        const lightShaperElement = document.createElement("i");
        lightShaperElement.className = "hb-light-visual-" + lightShapeName;
        lightShaperElement.setAttribute("aria-hidden", "true");
        lightVisualLamp.append(lightShaperElement);
      }
      const lightVisualStatus = document.createElement("span");
      lightVisualStatus.className = "hb-light-visual-status";
      entityLightVisual.append(lightVisualAura, lightVisualLamp, lightVisualStatus);
      const lightKelvinMin =
        Number(entityAttributes.min_color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.max_mireds))
          ? 1000000 / Number(entityAttributes.max_mireds)
          : 2000);
      const lightKelvinMax =
        Number(entityAttributes.max_color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.min_mireds))
          ? 1000000 / Number(entityAttributes.min_mireds)
          : 6500);
      const lightKelvinCurrent =
        Number(entityAttributes.color_temp_kelvin) ||
        (Number.isFinite(Number(entityAttributes.color_temp))
          ? 1000000 / Number(entityAttributes.color_temp)
          : NaN);
      const lightKelvinResolved = Number.isFinite(lightKelvinCurrent)
        ? lightKelvinCurrent
        : (lightKelvinMin + lightKelvinMax) / 2;
      const supportsLightColor = lightSupportsColor(entityAttributes);
      const lightVisualSnapshot = {
        isOn: detailsEntityState?.state === "on",
        brightnessPercent: Number.isFinite(Number(entityAttributes.brightness))
          ? (Number(entityAttributes.brightness) / 255) * 100
          : 100,
        colorTemperatureKelvin: lightKelvinResolved,
        colorRgb:
          supportsLightColor && Array.isArray(entityAttributes.rgb_color)
            ? entityAttributes.rgb_color
                .slice(0, 3)
                .map(lightRgbChannel => Number(lightRgbChannel) || 0)
            : supportsLightColor && Array.isArray(entityAttributes.hs_color)
              ? hsToRgbColor(entityAttributes.hs_color)
              : null
      };
      /**
       * 按灯光快照刷新详情弹窗里的光晕（颜色、透明度、模糊与缩放）。
       * 亮度映射到 0.08~1 透明度、15~129px 模糊与 0.62~1.67 缩放，都是视觉调参值：透明度下限留 0.08 是为了让 「已开但很暗」与「已关闭」在界面上可区分。色温用 2000K~6500K 的暖色 [255,132,42] 与冷色 [172,225,255]
       * 线性插值兜底，只在这盏灯拿不到可直接使用的 RGB 时才走到这条路。
       */
      const renderEntityLightVisual = () => {
        const lightVisualBrightness = Math.max(
          1,
          Math.min(100, Number(lightVisualSnapshot.brightnessPercent) || 1)
        );
        const lightVisualKelvin = Math.max(
          2000,
          Math.min(6500, Number(lightVisualSnapshot.colorTemperatureKelvin) || 3000)
        );
        const lightWarmthRatio = (lightVisualKelvin - 2000) / 4500;
        const lightWarmRgb = [255, 132, 42];
        const lightCoolRgb = [172, 225, 255];
        const lightRgbCss =
          "rgb(" +
          (
            lightVisualSnapshot.colorRgb ||
            lightWarmRgb.map((lightRgbChannelValue, lightRgbChannelIndex) =>
              Math.round(
                lightRgbChannelValue +
                  (lightCoolRgb[lightRgbChannelIndex] - lightRgbChannelValue) * lightWarmthRatio
              )
            )
          ).join(",") +
          ")";
        entityLightVisual.classList.toggle("is-on", lightVisualSnapshot.isOn);
        entityLightVisual.style.setProperty("--hb-light-visual-color", lightRgbCss);
        entityLightVisual.style.setProperty(
          "--hb-light-visual-opacity",
          lightVisualSnapshot.isOn ? String(0.08 + (lightVisualBrightness / 100) * 0.92) : "0"
        );
        entityLightVisual.style.setProperty(
          "--hb-light-visual-blur",
          Math.round(15 + lightVisualBrightness * 1.14) + "px"
        );
        entityLightVisual.style.setProperty(
          "--hb-light-visual-scale",
          String(0.62 + (lightVisualBrightness / 100) * 1.05)
        );
        lightVisualStatus.textContent = lightVisualSnapshot.isOn
          ? Math.round(lightVisualBrightness) + "%  ·  " + Math.round(lightVisualKelvin) + "K"
          : "灯光已关闭";
        entityLightVisual.setAttribute("aria-label", lightVisualStatus.textContent);
      };
      applyLightVisualState = (lightStateInput = {}) => {
        const lightUpdateAttributes = lightStateInput.attributes || {};
        if (typeof lightStateInput.isOn == "boolean") {
          lightVisualSnapshot.isOn = lightStateInput.isOn;
        } else if (typeof lightStateInput.state == "string") {
          lightVisualSnapshot.isOn = lightStateInput.state === "on";
        }
        if (Number.isFinite(Number(lightStateInput.brightnessPercent))) {
          lightVisualSnapshot.brightnessPercent = Number(lightStateInput.brightnessPercent);
        } else if (Number.isFinite(Number(lightUpdateAttributes.brightness))) {
          lightVisualSnapshot.brightnessPercent =
            (Number(lightUpdateAttributes.brightness) / 255) * 100;
        }
        if (Number.isFinite(Number(lightStateInput.colorTemperatureKelvin))) {
          lightVisualSnapshot.colorTemperatureKelvin = Number(
            lightStateInput.colorTemperatureKelvin
          );
        } else if (Number.isFinite(Number(lightUpdateAttributes.color_temp_kelvin))) {
          lightVisualSnapshot.colorTemperatureKelvin = Number(
            lightUpdateAttributes.color_temp_kelvin
          );
        } else if (Number.isFinite(Number(lightUpdateAttributes.color_temp))) {
          lightVisualSnapshot.colorTemperatureKelvin =
            1000000 / Number(lightUpdateAttributes.color_temp);
        }
        if (supportsLightColor && Array.isArray(lightStateInput.colorRgb)) {
          lightVisualSnapshot.colorRgb = lightStateInput.colorRgb
            .slice(0, 3)
            .map(updateRgbChannel => Number(updateRgbChannel) || 0);
        } else if (supportsLightColor && Array.isArray(lightUpdateAttributes.rgb_color)) {
          lightVisualSnapshot.colorRgb = lightUpdateAttributes.rgb_color
            .slice(0, 3)
            .map(attributeRgbChannel => Number(attributeRgbChannel) || 0);
        } else if (supportsLightColor && Array.isArray(lightUpdateAttributes.hs_color)) {
          lightVisualSnapshot.colorRgb = hsToRgbColor(lightUpdateAttributes.hs_color);
        }
        renderEntityLightVisual();
      };
      renderEntityLightVisual();
    }
    if (isCover) {
      entityCoverVisual = document.createElement("button");
      entityCoverVisual.type = "button";
      entityCoverVisual.className = "hb-cover-visual";
      entityCoverVisual.inert = detailsPreview;
      entityCoverVisual.setAttribute("aria-disabled", String(detailsPreview));
      const coverRailVisual = document.createElement("i");
      coverRailVisual.className = "hb-cover-visual-rail";
      const coverLeftPanelVisual = document.createElement("i");
      coverLeftPanelVisual.className = "hb-cover-visual-panel left";
      const coverRightPanelVisual = document.createElement("i");
      coverRightPanelVisual.className = "hb-cover-visual-panel right";
      const coverSlatContainer = document.createElement("span");
      coverSlatContainer.className = "hb-cover-visual-slats";
      const coverSlatTotal = 13;
      for (let slatOrdinal = 0; slatOrdinal < coverSlatTotal; slatOrdinal += 1) {
        const slatElement = document.createElement("span");
        slatElement.className = "hb-cover-visual-slat";
        const slatInnerElement = document.createElement("i");
        slatElement.style.setProperty("--hb-cover-slat-index", String(slatOrdinal));
        const slatDelayOrder =
          coverSplitDirection === "right"
            ? coverSlatTotal - 1 - slatOrdinal
            : coverSplitDirection === "split"
              ? Math.abs((coverSlatTotal - 1) / 2 - slatOrdinal)
              : slatOrdinal;
        slatElement.style.setProperty("--hb-cover-slat-delay-index", String(slatDelayOrder));
        const slatRetractedShiftPx =
          coverSplitDirection === "left"
            ? -slatOrdinal * 14.5
            : coverSplitDirection === "right"
              ? (coverSlatTotal - 1 - slatOrdinal) * 14.5
              : slatOrdinal <= (coverSlatTotal - 1) / 2
                ? -slatOrdinal * 14.5
                : (coverSlatTotal - 1 - slatOrdinal) * 14.5;
        slatElement.style.setProperty("--hb-cover-retracted-shift", slatRetractedShiftPx + "px");
        slatElement.append(slatInnerElement);
        coverSlatContainer.append(slatElement);
      }
      const coverWindowVisual = document.createElement("i");
      coverWindowVisual.className = "hb-cover-visual-window";
      entityCoverVisual.classList.toggle("is-dream", isDreamCover);
      entityCoverVisual.classList.toggle("is-airer", isAirerDevice);
      entityCoverVisual.classList.add("direction-" + coverSplitDirection);
      entityCoverVisual.append(
        coverWindowVisual,
        coverRailVisual,
        coverLeftPanelVisual,
        coverRightPanelVisual,
        coverSlatContainer
      );
      if (isAirerDevice) {
        appendAirerVisual(entityCoverVisual);
      }
      renderAirerLight = (nextAirerLightState = airerLightCurrentState) => {
        if (!isAirerDevice) {
          return;
        }
        airerLightCurrentState = nextAirerLightState || airerLightCurrentState;
        const isAirerLightOffline =
          !airerLightRelatedEntityId ||
          ["unknown", "unavailable"].includes(String(airerLightCurrentState?.state || "unknown"));
        const airerLightIsOn = airerLightCurrentState?.state === "on";
        entityCoverVisual.classList.toggle("is-light-on", airerLightIsOn && !isAirerLightOffline);
        entityCoverVisual.classList.toggle("is-light-unavailable", isAirerLightOffline);
        entityCoverVisual.disabled = detailsPreview || isAirerLightOffline;
        entityCoverVisual.setAttribute(
          "aria-pressed",
          String(airerLightIsOn && !isAirerLightOffline)
        );
        entityCoverVisual.setAttribute(
          "aria-label",
          isAirerLightOffline
            ? "晾衣机灯光实体不可用"
            : "晾衣机灯光" + (airerLightIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
        );
      };
      renderAirerLight();
      renderCoverPosition = ({
        position: coverPosition = 0,
        state: coverCommandPositionState = ""
      } = {}) => {
        const normalizedCoverPosition = Math.max(0, Math.min(100, Number(coverPosition) || 0));
        const coverPresentation = coverPresentationState(
          {
            state: coverCommandPositionState,
            attributes: {
              current_position: normalizedCoverPosition
            }
          },
          isCoverMotorPolarityReversed
        );
        const currentPhysicalState = physicalCoverState(
          coverCommandPositionState || coverPhysicalStateText,
          isCoverMotorPolarityReversed
        );
        const isCoverOpen = currentPhysicalState === "open" || currentPhysicalState === "opening";
        coverOpenPosition = normalizedCoverPosition;
        entityCoverVisual.style.setProperty(
          "--hb-cover-open-position",
          normalizedCoverPosition + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-airer-drop",
          airerVisualDrop(normalizedCoverPosition) + "px"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-panel-width",
          45.9 - normalizedCoverPosition * 0.331 + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-single-panel-width",
          91.8 - normalizedCoverPosition * 0.79 + "%"
        );
        entityCoverVisual.style.setProperty(
          "--hb-cover-slat-angle",
          normalizedCoverPosition * 1.8 + "deg"
        );
        entityCoverVisual.classList.toggle("is-tilt-reversed", normalizedCoverPosition > 50);
        entityCoverVisual.classList.toggle(
          "is-tilt-center",
          Math.abs(normalizedCoverPosition - 50) <= 2
        );
        entityCoverVisual.classList.toggle(
          "is-open",
          isDreamCover
            ? isCoverOpen
            : coverPresentation === "open" || coverPresentation === "opening"
        );
        entityCoverVisual.classList.toggle(
          "is-moving",
          coverCommandPositionState === "opening" || coverCommandPositionState === "closing"
        );
        entityCoverVisual.setAttribute(
          "aria-pressed",
          String(
            isDreamCover
              ? isCoverOpen
              : coverPresentation === "open" || coverPresentation === "opening"
          )
        );
        if (!isAirerDevice) {
          entityCoverVisual.setAttribute(
            "aria-label",
            isDreamCover
              ? "" +
                  componentDialogTitle(detailsComponent, "梦幻帘") +
                  dreamCurtainStatusText(
                    coverCommandPositionState || coverPhysicalStateText,
                    normalizedCoverPosition,
                    isCoverMotorPolarityReversed
                  )
              : "" +
                  componentDialogTitle(detailsComponent, "窗帘") +
                  (coverPresentation === "open" || coverPresentation === "opening"
                    ? "已打开，点击关闭"
                    : "已关闭，点击打开")
          );
        }
      };
      renderCoverPosition({
        position: Number.isFinite(
          Number(entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"])
        )
          ? Number(entityAttributes[isTiltCover ? "current_tilt_position" : "current_position"])
          : detailsEntityState?.state === "open"
            ? 100
            : 0,
        state: detailsEntityState?.state
      });
      entityCoverVisual.addEventListener("click", async () => {
        if (detailsPreview || isCoverCommandPending) {
          return;
        }
        isCoverCommandPending = true;
        entityCoverVisual.setAttribute("aria-busy", "true");
        if (isAirerDevice) {
          const previousAirerLightSnapshot = airerLightCurrentState;
          renderAirerLight({
            ...(airerLightCurrentState || {}),
            state: airerLightCurrentState?.state === "on" ? "off" : "on"
          });
          try {
            await this.callEntityService("homeassistant", "toggle", airerLightRelatedEntityId);
          } catch (airerLightError) {
            renderAirerLight(previousAirerLightSnapshot);
            this.options.onError?.(airerLightError);
          } finally {
            isCoverCommandPending = false;
            entityCoverVisual.removeAttribute("aria-busy");
          }
          return;
        }
        const previousCoverPositionValue = coverOpenPosition;
        const dreamCurtainRetractedState =
          detailsControls?.isDreamCurtainRetracted?.() ??
          entityCoverVisual.dataset.curtainRetracted === "true";
        const isCoverOffClosedPosition = previousCoverPositionValue > COVER_POSITION_EPSILON_PERCENT;
        if (isDreamCover) {
          detailsControls?.beginDreamCurtainMotion?.(!dreamCurtainRetractedState);
        }
        if (!isDreamCover) {
          detailsControls?.beginCoverMotion?.(
            isCoverOffClosedPosition ? 0 : 100,
            isCoverOffClosedPosition ? "closing" : "opening"
          );
        }
        try {
          await this.callEntityService(
            "cover",
            isDreamCover
              ? dreamCurtainToggleService(
                  dreamCurtainRetractedState,
                  coverSecondaryService,
                  coverPrimaryService
                )
              : isCoverOffClosedPosition
                ? coverPrimaryService
                : coverSecondaryService,
            resolvedDetailsEntityId
          );
        } catch (coverCommandError) {
          if (isDreamCover) {
            detailsControls?.cancelDreamCurtainMotion?.();
            detailsControls?.setDreamCurtainRetracted?.(dreamCurtainRetractedState, false);
          } else {
            detailsControls?.cancelCoverMotion?.();
          }
          detailsControls?.syncCoverState?.(detailsEntityState);
          renderCoverPosition({
            position: previousCoverPositionValue,
            state: detailsEntityState?.state
          });
          this.options.onError?.(coverCommandError);
        } finally {
          isCoverCommandPending = false;
          entityCoverVisual.removeAttribute("aria-busy");
        }
      });
    }
    if (isClimateDetails) {
      const climateVisualContext = {
        entityId: resolvedDetailsEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations
      };
      entityClimateVisual = document.createElement("button");
      entityClimateVisual.type = "button";
      entityClimateVisual.className = "hb-climate-visual";
      entityClimateVisual.classList.toggle(
        "is-bath-heater",
        resolvedClimateDeviceType === "bath-heater"
      );
      entityClimateVisual.classList.toggle(
        "is-water-heater",
        resolvedClimateDeviceType === "water-heater"
      );
      entityClimateVisual.inert = detailsPreview;
      entityClimateVisual.setAttribute("aria-disabled", String(detailsPreview));
      const climateBodyElement = document.createElement("div");
      climateBodyElement.className = "hb-climate-visual-unit";
      const climateBrandLabel = document.createElement("span");
      climateBrandLabel.className = "hb-climate-visual-brand";
      climateBrandLabel.textContent =
        resolvedClimateDeviceType === "bath-heater"
          ? "BATH HEATER"
          : resolvedClimateDeviceType === "water-heater"
            ? "SMART WATER"
            : "SMART AIR";
      const climateDisplayText = document.createElement("strong");
      climateDisplayText.className = "hb-climate-visual-display";
      const climateVentRow = document.createElement("div");
      climateVentRow.className = "hb-climate-visual-vent";
      for (let ventSlotIndex = 0; ventSlotIndex < 5; ventSlotIndex += 1) {
        climateVentRow.append(document.createElement("i"));
      }
      climateBodyElement.append(climateBrandLabel, climateDisplayText, climateVentRow);
      const climateAirflowRow = document.createElement("div");
      climateAirflowRow.className = "hb-climate-visual-airflow";
      for (let airflowSlotIndex = 0; airflowSlotIndex < 3; airflowSlotIndex += 1) {
        climateAirflowRow.append(document.createElement("i"));
      }
      entityClimateVisual.append(climateBodyElement, climateAirflowRow);
      renderClimateVisual = ({
        mode: climateModeName = "off",
        visualMode: climateVisualModeName = "off",
        running: isClimateUnitRunning = false,
        accentColor: climateAccentColorRgb = paletteColor("--hos-sensor", "#9eb0c4"),
        targetTemperature: targetTemperatureCelsius
      } = {}) => {
        const isClimateUnitOn = climateVisualModeName !== "off";
        entityClimateVisual.classList.toggle("is-on", isClimateUnitOn);
        entityClimateVisual.classList.toggle("is-running", isClimateUnitRunning);
        entityClimateVisual.classList.toggle(
          "is-airflow-mode",
          resolvedClimateDeviceType === "bath-heater" &&
            isClimateUnitOn &&
            bathHeaterModeUsesAirflow(climateModeName)
        );
        entityClimateVisual.dataset.visualMode = climateVisualModeName;
        entityClimateVisual.style.setProperty("--hb-climate-visual-accent", climateAccentColorRgb);
        const hasTemperatureReading =
          targetTemperatureCelsius != null &&
          targetTemperatureCelsius !== "" &&
          Number.isFinite(Number(targetTemperatureCelsius));
        climateDisplayText.textContent = isClimateUnitOn
          ? hasTemperatureReading
            ? Number(targetTemperatureCelsius) + "°"
            : climateModeLabel(climateModeName, resolvedClimateDeviceType, climateVisualContext)
          : "OFF";
      };
    }
    if (isSwitchLike) {
      const switchVisualParts = createSwitchVisual({
        label: switchDialogTitle,
        interactive: !detailsPreview,
        momentary: isMomentaryButton,
        onToggle: () => toggleEntityPower?.()
      });
      switchVisualElement = switchVisualParts.visual;
      syncSwitchVisual = switchVisualParts.sync;
      syncSwitchVisual(resolvePowerOn(detailsEntityState?.state), {
        unavailable: ["unknown", "unavailable"].includes(detailsEntityState?.state)
      });
    }
    const powerToggleElement = document.createElement(hasPowerToggle ? "button" : "div");
    powerToggleElement.className = "hb-entity-details-state";
    if (hasPowerToggle) {
      powerToggleElement.type = "button";
    }
    const powerIconElement = document.createElement("span");
    powerIconElement.textContent = hasPowerToggle ? "⏻" : "当前状态";
    const powerStateTextElement = document.createElement("strong");
    const hvacModeLabels = {
      off: "关闭",
      auto: "自动",
      cool: "制冷",
      dry: "除湿",
      heat: "制热",
      fan_only: "送风",
      heat_cool: "冷暖自动"
    };
    powerStateTextElement.textContent = hasPowerToggle
      ? detailsEntityState?.state
        ? resolvePowerOn(detailsEntityState.state)
          ? "已开启"
          : "已关闭"
        : "状态未知"
      : detailsEntityDomain === "climate"
        ? hvacModeLabels[detailsEntityState?.state] || detailsEntityState?.state || "暂无状态"
        : (detailsEntityState?.state ?? "暂无状态");
    powerToggleElement.classList.toggle("hb-light-details-power", isLightDetails);
    powerToggleElement.classList.toggle("hb-climate-details-power", isClimateDetails);
    powerToggleElement.classList.toggle("hb-switch-details-power", isSwitchLike);
    powerToggleElement.classList.toggle(
      "is-on",
      hasPowerToggle && resolvePowerOn(detailsEntityState?.state)
    );
    powerToggleElement.append(powerIconElement, powerStateTextElement);
    if (hasPowerToggle) {
      powerToggleElement.inert = detailsPreview;
      powerToggleElement.setAttribute("aria-disabled", String(detailsPreview));
      renderPowerState = (
        powerIsOn,
        { unavailable: powerIsUnavailable = false, syncClimate: shouldSyncClimate = true } = {}
      ) => {
        powerToggleElement.classList.toggle("is-on", powerIsOn);
        powerToggleElement.classList.toggle("is-unavailable", powerIsUnavailable);
        powerToggleElement.setAttribute("aria-pressed", String(powerIsOn));
        powerToggleElement.disabled = powerIsUnavailable || detailsPreview;
        powerStateTextElement.textContent = powerIsUnavailable
          ? "当前不可用"
          : isMomentaryButton
            ? buttonActionStatus === "success"
              ? "执行成功"
              : isEntityTogglePending
                ? "执行中"
                : "等待执行"
            : powerIsOn
              ? "已开启"
              : "已关闭";
        powerToggleElement.setAttribute(
          "aria-label",
          powerIsUnavailable
            ? (isLightDetails
                ? componentDialogTitle(detailsComponent, "灯光")
                : isClimateDetails
                  ? climateDialogTitle
                  : switchDialogTitle) + "当前不可用"
            : isMomentaryButton
              ? "" +
                switchDialogTitle +
                (buttonActionStatus === "success"
                  ? "执行成功"
                  : isEntityTogglePending
                    ? "正在执行"
                    : "，点击执行")
              : "" +
                componentDialogTitle(
                  detailsComponent,
                  isLightDetails ? "灯光" : isClimateDetails ? climateTypeLabel : "开关"
                ) +
                (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
        );
        if (isLightDetails) {
          applyLightVisualState?.({
            isOn: powerIsOn
          });
          lightStatusText.textContent = powerIsOn ? "已开启" : "已关闭";
          lightStatusText.classList.toggle("is-on", powerIsOn);
          entityLightVisual.setAttribute("aria-pressed", String(powerIsOn));
          entityLightVisual.setAttribute(
            "aria-label",
            "" +
              componentDialogTitle(detailsComponent, "灯光") +
              (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
          );
        }
        if (isClimateDetails && detailsControls?.syncClimateState && shouldSyncClimate) {
          const climateCapabilitySet = normalizeClimateCapabilities(
            latestEntityState || detailsEntityState
          );
          const defaultClimateMode =
            resolvedClimateDeviceType === "water-heater"
              ? climateCapabilitySet.operationModes.find(
                  operationModeName =>
                    !["off", "空"].includes(String(operationModeName).trim().toLowerCase())
                ) || "普通"
              : climateCapabilitySet.hvacModes.find(hvacModeName => hvacModeName !== "off") ||
                (resolvedClimateDeviceType === "bath-heater" ? "heat" : "auto");
          const currentClimateMode =
            detailsControls.dataset.lastClimateMode ||
            (detailsEntityState?.state && detailsEntityState.state !== "off"
              ? detailsEntityState.state
              : defaultClimateMode);
          detailsControls.syncClimateState({
            state: powerIsOn
              ? resolvedClimateDeviceType === "water-heater"
                ? "on"
                : currentClimateMode
              : "off",
            attributes: {
              ...(latestEntityState?.attributes || detailsEntityState?.attributes || {}),
              operation_mode:
                resolvedClimateDeviceType === "water-heater"
                  ? powerIsOn
                    ? latestEntityState?.attributes?.operation_mode || defaultClimateMode
                    : "off"
                  : undefined,
              hvac_action:
                resolvedClimateDeviceType === "water-heater"
                  ? undefined
                  : powerIsOn
                    ? detailsEntityState?.attributes?.hvac_action || currentClimateMode
                    : "off"
            }
          });
        }
        if (isClimateDetails) {
          climateStatusText.textContent =
            resolvedClimateDeviceType === "water-heater"
              ? waterHeaterStatusLabel({
                  ...(latestEntityState || detailsEntityState || {}),
                  state: powerIsOn ? "on" : "off"
                })
              : powerIsOn
                ? "已开启"
                : "已关闭";
          climateStatusText.classList.toggle("is-on", powerIsOn);
          if (resolvedClimateDeviceType === "bath-heater") {
            if (!bathHeaterLightController) {
              entityClimateVisual.setAttribute("aria-pressed", "false");
            }
            entityClimateVisual.setAttribute("aria-label", climateDialogTitle + "，点击切换浴霸灯");
          } else {
            entityClimateVisual.setAttribute("aria-pressed", String(powerIsOn));
            entityClimateVisual.setAttribute(
              "aria-label",
              "" + climateDialogTitle + (powerIsOn ? "已开启，点击关闭" : "已关闭，点击开启")
            );
          }
        }
        if (isSwitchLike) {
          syncSwitchVisual?.(powerIsOn, {
            pending: isEntityTogglePending && buttonActionStatus !== "success",
            success: buttonActionStatus === "success",
            unavailable: powerIsUnavailable
          });
          switchStatusText.textContent = powerIsUnavailable
            ? "当前不可用"
            : isMomentaryButton
              ? buttonActionStatus === "success"
                ? "执行成功"
                : isEntityTogglePending
                  ? "正在执行"
                  : "按下执行"
              : powerIsOn
                ? "已开启"
                : "已关闭";
          switchStatusText.classList.toggle(
            "is-on",
            (isMomentaryButton
              ? isEntityTogglePending || buttonActionStatus === "success"
              : powerIsOn) && !powerIsUnavailable
          );
        }
      };
      if (detailsEntityState?.state) {
        renderPowerState(resolvePowerOn(detailsEntityState.state), {
          unavailable: ["unknown", "unavailable"].includes(detailsEntityState.state)
        });
      }
      toggleEntityPower = async () => {
        if (detailsPreview || isEntityTogglePending || !latestEntityState?.state) {
          return;
        }
        isEntityTogglePending = true;
        const pendingVisualElement = isLightDetails
          ? entityLightVisual
          : isClimateDetails
            ? entityClimateVisual
            : switchVisualElement;
        pendingVisualElement?.setAttribute("aria-busy", "true");
        const isPowerCurrentlyOn = powerToggleElement.classList.contains("is-on");
        const nextPowerState = isMomentaryButton || !isPowerCurrentlyOn;
        renderPowerState(nextPowerState);
        try {
          if (isMomentaryButton) {
            await this.callEntityService("button", "press", resolvedDetailsEntityId);
            buttonActionStatus = "success";
            renderPowerState(false);
            await new Promise(resolveTimeout => window.setTimeout(resolveTimeout, 900));
          } else if (isClimateDetails) {
            if (!nextPowerState && resolvedClimateDeviceType === "bath-heater") {
              const bathHeaterIdlePreset = normalizeClimateCapabilities(
                latestEntityState
              ).presetModes.find(presetModeName =>
                ["idle", "standby", "待机", "关闭"].includes(
                  String(presetModeName).trim().toLowerCase()
                )
              );
              if (bathHeaterIdlePreset) {
                await this.callEntityService(
                  detailsEntityDomain === "fan" ? "fan" : "climate",
                  "set_preset_mode",
                  resolvedDetailsEntityId,
                  {
                    preset_mode: bathHeaterIdlePreset
                  }
                );
              }
            }
            const climatePowerServiceRequest = climatePowerCommand(
              resolvedDetailsEntityId,
              latestEntityState,
              nextPowerState,
              resolvedClimateDeviceType,
              detailsControls?.dataset.lastClimateMode || ""
            );
            await this.callEntityService(
              climatePowerServiceRequest.domain,
              climatePowerServiceRequest.service,
              resolvedDetailsEntityId,
              climatePowerServiceRequest.data
            );
          } else {
            await this.callEntityService("homeassistant", "toggle", resolvedDetailsEntityId);
          }
        } catch (powerToggleFailure) {
          buttonActionStatus = "idle";
          renderPowerState(isPowerCurrentlyOn);
          this.options.onError?.(powerToggleFailure);
        } finally {
          isEntityTogglePending = false;
          if (isMomentaryButton) {
            buttonActionStatus = "idle";
            renderPowerState(false);
          } else if (isSwitchLike) {
            syncSwitchVisual?.(powerToggleElement.classList.contains("is-on"));
          }
          pendingVisualElement?.removeAttribute("aria-busy");
        }
      };
      powerToggleElement.addEventListener("click", toggleEntityPower);
      if (isLightDetails) {
        entityLightVisual.addEventListener("click", toggleEntityPower);
      }
      if (isClimateDetails) {
        entityClimateVisual.addEventListener("click", () => {
          if (resolvedClimateDeviceType === "bath-heater") {
            if (bathHeaterLightController?.toggleBathLight) {
              bathHeaterLightController.toggleBathLight();
            } else {
              this.options.onError?.(new Error("未找到与浴霸同设备的灯光实体。"));
            }
            return;
          }
          toggleEntityPower();
        });
      }
    }
    const createClimateControls = isClimateDetails
      ? climateState =>
          this.createClimateDetailsControls(resolvedDetailsEntityId, climateState, {
            interactive: !detailsPreview,
            deviceType: resolvedClimateDeviceType,
            onPowerChange: powerChangeValue =>
              renderPowerState?.(powerChangeValue, {
                syncClimate: false
              }),
            onVisualChange: ({
              mode: updatedMode,
              visualMode: updatedVisualMode,
              running: updatedRunning,
              accentColor: updatedAccentColor,
              accentSoft: updatedAccentSoftColor,
              targetTemperature: updatedTargetTemperature
            }) => {
              powerToggleElement.classList.toggle("is-running", updatedRunning);
              powerToggleElement.style.setProperty("--hb-climate-accent", updatedAccentColor);
              powerToggleElement.style.setProperty(
                "--hb-climate-accent-soft",
                updatedAccentSoftColor
              );
              climateStatusText.style.setProperty("--hb-climate-accent", updatedAccentColor);
              if (resolvedClimateDeviceType === "water-heater") {
                climateStatusText.textContent =
                  updatedVisualMode === "off" ? "已关闭" : updatedRunning ? "正在加热" : "保温中";
              }
              renderClimateVisual?.({
                mode: updatedMode,
                visualMode: updatedVisualMode,
                running: updatedRunning,
                accentColor: updatedAccentColor,
                targetTemperature: updatedTargetTemperature
              });
            },
            modeColors: {
              cool: detailsComponent.properties?.airflowCoolColor || paletteColor("--hos-cool", "#58c4ff"),
              heat: detailsComponent.properties?.airflowHeatColor || paletteColor("--hos-heat", "#ff8a65"),
              other:
                detailsComponent.properties?.airflowOtherColor || paletteColor("--hos-ink", "#f1f7fb")
            }
          })
      : null;
    detailsControls = isLightDetails
      ? this.createLightDetailsControls(resolvedDetailsEntityId, detailsEntityState, {
          interactive: !detailsPreview,
          onTurnOn: () => renderPowerState?.(true),
          onVisualChange: lightVisualUpdate => applyLightVisualState?.(lightVisualUpdate)
        })
      : isClimateDetails
        ? createClimateControls(detailsEntityState)
        : isCover
          ? this.createCoverDetailsControls(resolvedDetailsEntityId, detailsEntityState, {
              interactive: !detailsPreview,
              dream: isDreamCover,
              airer: isAirerDevice,
              tilt: isTiltCover,
              motorReversed: isCoverMotorPolarityReversed,
              positionState: airerPositionSensorCurrentState,
              positionCommandEntityId: airerPositionNumberEntityId,
              positionCommandState: airerPositionCurrentState,
              motorState: airerMotorSpeedCurrentState,
              airerActionEntityIds: airerActionEntityIdMap,
              positionCalibration: airerLiftCalibration,
              onVisualChange: ({ position: updatedPosition, state: updatedPositionState }) => {
                if (updatedPositionState) {
                  coverPhysicalStateText = updatedPositionState;
                }
                renderCoverPosition?.({
                  position: updatedPosition,
                  state: updatedPositionState
                });
                const updatedCoverPresentation = coverPresentationState(
                  {
                    state: updatedPositionState,
                    attributes: {
                      current_position: updatedPosition
                    }
                  },
                  isCoverMotorPolarityReversed
                );
                const coverMovementLabels = {
                  open: "已打开",
                  closed: "已关闭",
                  opening: "正在打开",
                  closing: "正在关闭"
                };
                const updatedPhysicalState = physicalCoverState(
                  coverPhysicalStateText,
                  isCoverMotorPolarityReversed
                );
                coverStatusText.textContent = isAirerDevice
                  ? airerPositionLabel(updatedCoverPresentation) ||
                    Math.round(updatedPosition) + "%"
                  : isDreamCover
                    ? dreamCurtainStatusText(
                        coverPhysicalStateText,
                        updatedPosition,
                        isCoverMotorPolarityReversed
                      )
                    : coverMovementLabels[updatedCoverPresentation] ||
                      Math.round(updatedPosition) + "%";
                coverStatusText.classList.toggle(
                  "is-on",
                  isDreamCover
                    ? updatedPhysicalState === "open" || updatedPhysicalState === "opening"
                    : updatedCoverPresentation === "open" || updatedCoverPresentation === "opening"
                );
              },
              onCurtainPositionChange: ({ retracted: curtainRetracted, moving: curtainMoving }) => {
                entityCoverVisual.classList.toggle("is-curtain-retracted", curtainRetracted);
                entityCoverVisual.classList.toggle("is-curtain-moving", curtainMoving);
                entityCoverVisual.dataset.curtainRetracted = String(curtainRetracted);
                if (isDreamCover) {
                  coverStatusText.textContent = dreamCurtainStatusFromRetraction(
                    curtainRetracted,
                    curtainMoving,
                    coverOpenPosition
                  );
                  coverStatusText.classList.toggle("is-on", curtainRetracted);
                }
              }
            })
          : null;
    if (isLightDetails && detailsControls?.classList.contains("has-color-picker")) {
      entityDialog.classList.add("color-picker-details");
    }
    if (
      isClimateDetails &&
      resolvedClimateDeviceType === "water-heater" &&
      detailsControls &&
      entityClimateVisual
    ) {
      detailsControls.prepend(entityClimateVisual);
      detailsControls.syncClimateGrid?.();
    }
    const bathHeaterLightRoleEntityId =
      (isClimateDetails &&
        resolvedClimateDeviceType === "bath-heater" &&
        deviceProfile?.roles?.light) ||
      "";
    bathHeaterLightEntityId =
      (bathHeaterLightRoleEntityId
        ? this.entityMetadata.get(bathHeaterLightRoleEntityId)
        : isClimateDetails && resolvedClimateDeviceType === "bath-heater"
          ? relatedDeviceDomainEntity(this.entityMetadata, resolvedDetailsEntityId, "light")
          : null
      )?.entityId || "";
    if (bathHeaterLightEntityId && detailsControls) {
      const bathLightStateSnapshot = this.states.get(bathHeaterLightEntityId);
      const bathLightResolvedState = resolveStateEntry(bathLightStateSnapshot, {
        state: "unknown",
        attributes: {}
      });
      bathHeaterLightController = this.createBathHeaterLightControl(
        bathHeaterLightEntityId,
        bathLightResolvedState,
        {
          interactive: !detailsPreview,
          onStateChange: ({ isOn: bathLightIsOn, unavailable: bathLightIsUnavailable }) => {
            entityClimateVisual?.classList.toggle(
              "is-light-on",
              bathLightIsOn && !bathLightIsUnavailable
            );
            entityClimateVisual?.setAttribute(
              "aria-pressed",
              String(bathLightIsOn && !bathLightIsUnavailable)
            );
          }
        }
      );
      detailsControls.append(bathHeaterLightController);
      detailsControls.syncClimateGrid?.();
    }
    const refreshRelatedExtensions =
      isClimateDetails &&
      (resolvedClimateDeviceType === "water-heater" || selectedRelatedIds !== null)
        ? () => {
            const previousExtensionIds = relatedExtensionEntityIds;
            const extensionControls = this.createWaterHeaterExtensionControls(
              resolvedDetailsEntityId,
              {
                component: detailsComponent,
                interactive: !detailsPreview,
                excludedEntityIds: bathHeaterLightEntityId ? [bathHeaterLightEntityId] : []
              }
            );
            relatedExtensionsControl?.remove();
            relatedExtensionsControl = extensionControls;
            relatedExtensionEntityIds = new Set(extensionControls?.relatedEntityIds || []);
            detailsControls?.classList.toggle(
              "has-multiline-water-heater-extensions",
              resolvedClimateDeviceType === "water-heater" &&
                Number(extensionControls?.dataset?.controlCount || 0) > 2
            );
            if (resolvedClimateDeviceType !== "water-heater" && entityDialogCard.isConnected) {
              entityDialog.classList.toggle("has-related-extensions", !!extensionControls);
            }
            if (extensionControls && detailsControls) {
              if (resolvedClimateDeviceType === "water-heater") {
                (detailsControls.waterHeaterControlPanel || detailsControls).append(
                  extensionControls
                );
                detailsControls.syncClimateGrid?.();
              } else if (entityDialogCard.isConnected) {
                entityDialogCard.append(extensionControls);
                entityDialog.classList.add("has-related-extensions");
              }
            }
            const runtimeStateHandlers = this.detailsStateSync?.handlers;
            if (runtimeStateHandlers) {
              for (const staleExtensionId of previousExtensionIds) {
                runtimeStateHandlers.delete(staleExtensionId);
              }
              for (const [
                extensionHandlerEntityId,
                extensionHandlerList
              ] of extensionControls?.stateHandlers || []) {
                runtimeStateHandlers.set(extensionHandlerEntityId, extensionHandlerList);
                const extensionEntityState = this.states.get(extensionHandlerEntityId);
                if (extensionEntityState) {
                  for (const extensionStateHandler of extensionHandlerList) {
                    extensionStateHandler(resolveStateEntry(extensionEntityState));
                  }
                }
              }
            }
          }
        : null;
    refreshRelatedExtensions?.();
    let lineChartCurrentVisual =
      detailsComponent.type === "line-chart"
        ? renderLineChartDetails(detailsComponent, {
            states: this.states,
            history: this.historySeries,
            renderNamespace: this.renderNamespace
          })
        : null;
    let chartVisualSection = null;
    let chartCurrentValue = null;
    let chartCurrentUnit = null;
    const attributesListElement = document.createElement("dl");
    attributesListElement.className = "hb-entity-details-attributes";
    for (const [entityAttributeName, attributeValue] of Object.entries(entityAttributes).filter(
      ([entityAttributeKey]) => entityAttributeKey !== "friendly_name"
    )) {
      const attributeRow = document.createElement("div");
      const attributeTerm = document.createElement("dt");
      attributeTerm.textContent = entityAttributeName;
      const attributeDescription = document.createElement("dd");
      attributeDescription.textContent =
        typeof attributeValue == "string" ? attributeValue : JSON.stringify(attributeValue);
      attributeRow.append(attributeTerm, attributeDescription);
      attributesListElement.append(attributeRow);
    }
    if (lineChartCurrentVisual) {
      chartVisualSection = document.createElement("section");
      chartVisualSection.className = "hb-line-chart-current-visual";
      chartVisualSection.style.setProperty(
        "--hb-chart-current-color",
        lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
      );
      chartCurrentValue = document.createElement("strong");
      const chartNumericValue = Number.parseFloat(detailsEntityState?.state);
      chartCurrentValue.textContent = Number.isFinite(chartNumericValue)
        ? formatLineChartValue(chartNumericValue, detailsComponent.properties?.statePrecision)
        : detailsEntityState?.state || "--";
      chartCurrentUnit = document.createElement("small");
      chartCurrentUnit.textContent = String(entityAttributes.unit_of_measurement || "实时数值");
      chartVisualSection.append(chartCurrentValue, chartCurrentUnit);
      powerToggleElement.style.setProperty(
        "--hb-chart-current-color",
        lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
      );
      powerIconElement.textContent = "●";
      powerStateTextElement.textContent = "实时数据";
      entityDialogCard.append(entityDialogHeading, chartVisualSection, lineChartCurrentVisual);
    } else if (isClimateDetails) {
      entityDialogCard.append(
        entityDialogHeading,
        ...(resolvedClimateDeviceType === "water-heater"
          ? [detailsControls]
          : [entityClimateVisual, detailsControls]),
        ...(resolvedClimateDeviceType !== "water-heater" && relatedExtensionsControl
          ? [relatedExtensionsControl]
          : [])
      );
      entityDialog.classList.toggle(
        "has-related-extensions",
        resolvedClimateDeviceType !== "water-heater" && !!relatedExtensionsControl
      );
    } else if (isLightDetails) {
      const lightLayoutElement = document.createElement("div");
      lightLayoutElement.className = "hb-light-details-layout";
      const lightPanelElement = document.createElement("section");
      lightPanelElement.className = "hb-light-details-panel";
      lightPanelElement.append(...(detailsControls ? [detailsControls] : []));
      lightLayoutElement.append(lightPanelElement, entityLightVisual);
      entityDialogCard.append(entityDialogHeading, lightLayoutElement);
    } else if (isSwitchLike) {
      const switchLayoutElement = document.createElement("div");
      switchLayoutElement.className = "hb-switch-details-layout";
      switchLayoutElement.append(switchVisualElement);
      entityDialogCard.append(entityDialogHeading, switchLayoutElement);
    } else if (isCover) {
      const coverDetailsLayout = document.createElement("div");
      coverDetailsLayout.className = "hb-cover-details-layout";
      const coverPanelElement = document.createElement("section");
      coverPanelElement.className = "hb-cover-details-panel";
      coverPanelElement.append(...(detailsControls ? [detailsControls] : []));
      coverDetailsLayout.append(coverPanelElement, entityCoverVisual);
      entityDialogCard.append(entityDialogHeading, coverDetailsLayout);
    } else if (attributesListElement.childElementCount) {
      entityDialogCard.append(
        entityDialogHeading,
        powerToggleElement,
        ...(detailsControls ? [detailsControls] : []),
        attributesListElement
      );
    } else {
      const emptyAttributesElement = document.createElement("p");
      emptyAttributesElement.className = "hb-entity-details-empty";
      emptyAttributesElement.textContent = "该实体暂无附加属性。";
      attributesListElement.replaceWith(emptyAttributesElement);
      entityDialogCard.append(
        entityDialogHeading,
        powerToggleElement,
        ...(detailsControls ? [detailsControls] : []),
        emptyAttributesElement
      );
    }
    entityDialog.append(entityDialogCard);
    const entityDialogLayer = document.createElement("div");
    entityDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    entityDialogLayer.tabIndex = -1;
    entityDialogLayer.append(entityDialog);
    this.container.append(entityDialogLayer);
    this.detailsDialog = entityDialog;
    const dialogWidth = isClimateDetails
      ? 840
      : detailsComponent.type === "line-chart"
        ? 780
        : isLightDetails || isCover
          ? 760
          : isSwitchLike
            ? 620
            : 460;
    const dialogHeight = isClimateDetails
      ? resolvedClimateDeviceType !== "water-heater" && relatedExtensionsControl
        ? 620
        : 540
      : isLightDetails || isCover
        ? 620
        : isSwitchLike
          ? 500
          : 680;
    this.registerRuntimeDialogScale(entityDialogLayer, entityDialog, dialogWidth, dialogHeight);
    let chartRefreshTimer = 0;
    if (detailsComponent.type === "line-chart" && lineChartCurrentVisual) {
      /**
       * 重建详情弹窗里的折线图，并把新线色同步回外层容器。
       * 折线图尺寸依赖挂载后的实际布局，无法原地更新，只能整体换新实例，故先解绑旧实例的
       * 悬浮监听再 replaceWith；弹窗已关闭或图表已脱离文档时直接返回，避免在已销毁 DOM 上替换。
       */
      const refreshLineChartVisual = () => {
        chartRefreshTimer = 0;
        if (
          !lineChartCurrentVisual?.isConnected ||
          this.detailsStateSync?.dialog !== entityDialog
        ) {
          return;
        }
        const nextChartVisual = renderLineChartDetails(detailsComponent, {
          states: this.states,
          history: this.historySeries,
          renderNamespace: this.renderNamespace
        });
        lineChartCurrentVisual.cleanupLineChartHover?.();
        lineChartCurrentVisual.replaceWith(nextChartVisual);
        lineChartCurrentVisual = nextChartVisual;
        chartVisualSection.style.setProperty(
          "--hb-chart-current-color",
          lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
        );
      };
      /**
       * 安排一次折线图重建（默认 700ms 防抖）。
       * 用 `||=` 保证同一时刻只有一个待执行定时器：历史数据通常成批到达，每条都重建会连续
       * 触发重排，这里合并成一次。
       */
      const scheduleChartRefresh = (delayMs = 700) => {
        chartRefreshTimer ||= window.setTimeout(
          refreshLineChartVisual,
          Math.max(0, Number(delayMs) || 0)
        );
      };
      this.detailsStateSync = {
        dialog: entityDialog,
        entityId: resolvedDetailsEntityId,
        refreshHistory: () => scheduleChartRefresh(0),
        apply: nextEntityState => {
          const nextChartValue = Number.parseFloat(nextEntityState?.state);
          chartCurrentValue.textContent = Number.isFinite(nextChartValue)
            ? formatLineChartValue(nextChartValue, detailsComponent.properties?.statePrecision)
            : nextEntityState?.state || "--";
          chartCurrentUnit.textContent = String(
            nextEntityState?.attributes?.unit_of_measurement || "实时数值"
          );
          chartStatusText.textContent =
            nextEntityState?.state == null ||
            ["unknown", "unavailable"].includes(nextEntityState.state)
              ? "暂无数据"
              : "实时数据";
          lineChartCurrentVisual.syncLineChartState?.(nextEntityState);
          chartVisualSection.style.setProperty(
            "--hb-chart-current-color",
            lineChartCurrentVisual.style.getPropertyValue("--hb-chart-current-color") || "#68cc3e"
          );
        }
      };
    } else if (hasPowerToggle && renderPowerState) {
      /**
       * 把实体最新状态应用到详情弹窗（开关 / 灯 / 气候类控件的统一入口）。
       * 气候控件的结构取决于实体属性（可用模式、风速档、摆风档…），属性变化时必须整块重建而非就地更新，否则 新旧档位按钮会混在一起；因此先比对 climateControlStructureKey，只有结构变了才重建，重建时把灯控、扩展
       * 控件等外挂节点迁回新控件，最后统一刷新开关态与各子控件状态。
       */
      const applyEntityDetailsState = updatedEntityState => {
        latestEntityState = updatedEntityState;
        if (isClimateDetails && createClimateControls && detailsControls) {
          const climateStructureKey = climateControlStructureKey(
            resolvedDetailsEntityId,
            updatedEntityState,
            resolvedClimateDeviceType
          );
          if (detailsControls.dataset.climateStructureKey !== climateStructureKey) {
            const nextClimateControls = createClimateControls(updatedEntityState);
            nextClimateControls.classList.toggle(
              "has-multiline-water-heater-extensions",
              detailsControls.classList.contains("has-multiline-water-heater-extensions")
            );
            nextClimateControls.classList.add("is-runtime-hydrated");
            if (resolvedClimateDeviceType === "water-heater" && entityClimateVisual) {
              nextClimateControls.prepend(entityClimateVisual);
            }
            if (bathHeaterLightController) {
              nextClimateControls.append(bathHeaterLightController);
              nextClimateControls.syncClimateGrid?.();
            }
            if (relatedExtensionsControl && resolvedClimateDeviceType === "water-heater") {
              (nextClimateControls.waterHeaterControlPanel || nextClimateControls).append(
                relatedExtensionsControl
              );
              nextClimateControls.syncClimateGrid?.();
            }
            detailsControls.replaceWith(nextClimateControls);
            detailsControls = nextClimateControls;
          }
        }
        if (updatedEntityState?.state) {
          renderPowerState(
            resolvePowerOn(updatedEntityState.state, updatedEntityState.attributes),
            {
              unavailable: ["unknown", "unavailable"].includes(updatedEntityState.state)
            }
          );
        }
        detailsControls?.syncLightState?.(updatedEntityState);
        detailsControls?.syncClimateState?.(updatedEntityState);
      };
      const detailsStateHandlers = new Map([[resolvedDetailsEntityId, [applyEntityDetailsState]]]);
      if (bathHeaterLightEntityId && bathHeaterLightController) {
        detailsStateHandlers.set(bathHeaterLightEntityId, [
          bathLightState => bathHeaterLightController.syncBathLightState?.(bathLightState)
        ]);
      }
      if (relatedExtensionsControl?.stateHandlers) {
        for (const [
          extensionHandlerKey,
          extensionHandlerGroup
        ] of relatedExtensionsControl.stateHandlers) {
          detailsStateHandlers.set(extensionHandlerKey, extensionHandlerGroup);
        }
      }
      this.detailsStateSync = {
        dialog: entityDialog,
        handlers: detailsStateHandlers,
        refreshEntityCatalog: refreshRelatedExtensions
      };
      if (isClimateDetails && detailsControls?.querySelector(".hb-climate-details-loading")) {
        const climateLoadingStartedAt = Date.now();
        climatePollTimer = window.setInterval(() => {
          const polledEntityState = this.states.get(resolvedDetailsEntityId);
          const polledResolvedState = resolveStateEntry(polledEntityState);
          if (polledResolvedState) {
            applyEntityDetailsState(polledResolvedState);
          }
          if (
            !detailsControls?.querySelector(".hb-climate-details-loading") ||
            Date.now() - climateLoadingStartedAt >= 30000
          ) {
            window.clearInterval(climatePollTimer);
            climatePollTimer = null;
          }
        }, 120);
      }
    } else if (isCover) {
      const coverStateHandlers = new Map([
        [
          resolvedDetailsEntityId,
          [coverStateChangeUpdate => detailsControls?.syncCoverState?.(coverStateChangeUpdate)]
        ]
      ]);
      if (airerLightRelatedEntityId) {
        coverStateHandlers.set(airerLightRelatedEntityId, [renderAirerLight]);
      }
      if (airerPositionSensorEntityId) {
        coverStateHandlers.set(airerPositionSensorEntityId, [
          coverPositionUpdate => detailsControls?.syncCoverPositionState?.(coverPositionUpdate)
        ]);
      }
      if (airerPositionNumberEntityId) {
        coverStateHandlers.set(airerPositionNumberEntityId, [
          coverPositionCommandUpdate => {
            detailsControls?.syncCoverPositionCommandState?.(coverPositionCommandUpdate);
            if (!airerPositionSensorEntityId) {
              detailsControls?.syncCoverPositionState?.(coverPositionCommandUpdate);
            }
          }
        ]);
      }
      if (airerMotorSpeedSensorId) {
        coverStateHandlers.set(airerMotorSpeedSensorId, [
          airerMotorUpdate => detailsControls?.syncAirerMotorState?.(airerMotorUpdate)
        ]);
      }
      this.detailsStateSync = {
        dialog: entityDialog,
        handlers: coverStateHandlers
      };
    }
    entityCloseButton.addEventListener("click", () => entityDialog.close());
    this.bindRuntimeDialogOutsideDismiss(entityDialogLayer, entityDialog, entityDialogCard);
    this.bindRuntimeDialogEscapeClose(entityDialogLayer, entityDialog);
    entityDialog.addEventListener(
      "close",
      () => {
        window.clearTimeout(chartRefreshTimer);
        window.clearInterval(climatePollTimer);
        climatePollTimer = null;
        detailsControls?.cleanupLightDetails?.();
        detailsControls?.cleanupClimateDetails?.();
        detailsControls?.cleanupCoverDetails?.();
        lineChartCurrentVisual?.cleanupLineChartHover?.();
        this.clearRuntimeDialogScale(entityDialog);
        if (this.detailsDialog === entityDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === entityDialog) {
          this.detailsStateSync = null;
        }
        entityDialogLayer.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(entityDialogLayer, entityDialog);
    entityDialog.focus({
      preventScroll: true
    });
  }
};
