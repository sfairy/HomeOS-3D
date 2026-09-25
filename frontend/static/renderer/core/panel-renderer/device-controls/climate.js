/*
 * 设备控件区块：空调/地暖/浴霸详情（模式、目标温度、风速、摆风与联动灯）。
 */

import { capturePointer, releasePointer } from "../../../../utils/pointer-capture.js?v=2609251801";
import { randomUuid } from "../../../../utils/random-id.js?v=2609251801";
// 颜色插值统一走 utils/colors.js，避免再出现「同名但失败值不同」的本地副本。
import { mixHexColors, paletteColor } from "../../../../utils/colors.js?v=2609251801";
import { entityDomainFromId } from "../../../../utils/entities.js?v=2609251801";
import {
  climateControlStructureKey,
  climateEffectMode,
  climateIsPoweredOn,
  climateIsRunning,
  climateModeIcon,
  climateModeLabel,
  climateOperationModeValues,
  climateOptionPresentation,
  climatePowerCommand,
  climatePresentationMode,
  climateSwingModeLabel,
  normalizeClimateCapabilities,
  reconcileClimateTargetTemperature
} from "../../../controls/climate.js?v=2609251801";

export const climateDetailsMethods = {
  /**
   * 构建空调 / 地暖详情弹窗的控制区（电源、模式、温度、风速、摆风）。
   * 能力清单先过 normalizeClimateCapabilities 归一：各家集成的属性名与取值不一致，
   * 统一字段后才能用同一套逻辑决定渲染哪些控件。
   */
  createClimateDetailsControls(
    climateControlsEntityId,
    climateControlsState,
    {
      interactive: climateControlsInteractive = true,
      onPowerChange: climatePowerChangeCallback = null,
      onVisualChange: climateVisualChangeCallback = null,
      modeColors: climateModeColors = {},
      deviceType: climateDeviceType = "air-conditioner"
    } = {}
  ) {
    const climateCapabilities = normalizeClimateCapabilities(climateControlsState);
    const climateCapabilityAttributes = climateCapabilities.attributes;
    const climateEntityDomain = entityDomainFromId(climateControlsEntityId);
    const climateLabelContext = {
      entityId: climateControlsEntityId,
      entityMetadata: this.entityMetadata,
      entityTranslations: this.entityTranslations
    };
    const climateControlsElement = document.createElement("section");
    climateControlsElement.className = "hb-climate-details-controls";
    climateControlsElement.dataset.climateDeviceType = climateDeviceType;
    // 结构键由实体、状态与机型算出：同键时只需更新数值，换键才整体重建控件，
    // 避免每次温度变化都把整块温控区重画一遍而闪烁。
    climateControlsElement.dataset.climateStructureKey = climateControlStructureKey(
      climateControlsEntityId,
      climateControlsState,
      climateDeviceType
    );
    climateControlsElement.inert = !climateControlsInteractive;
    const capabilityCurrentTemperature = climateCapabilities.currentTemperature;
    const capabilityTargetTemperature = climateCapabilities.targetTemperature;
    const capabilityMinimumTemperature = climateCapabilities.minimumTemperature;
    const capabilityMaximumTemperature = climateCapabilities.maximumTemperature;
    const capabilityTemperatureStep = climateCapabilities.temperatureStep;
    // 只有 climate / water_heater 域且上报了目标温度能力，才显示温度设定区。
    const supportsTargetTemperature =
      ["climate", "water_heater"].includes(climateEntityDomain) &&
      climateCapabilities.supportsTargetTemperature;
    const isWaterHeater = climateEntityDomain === "water_heater";
    climateControlsElement.classList.toggle("without-temperature", !supportsTargetTemperature);
    let pendingTargetTemperature = supportsTargetTemperature
      ? capabilityTargetTemperature
      : capabilityMinimumTemperature;
    let confirmedCommand = null;
    let commandTimer = null;
    let commandClearTimer = null;
    // 指令确认窗口：记下最近一次下发的指令，8 秒内视其仍然有效，
    // 用来抑制「状态推送还没回来时滑条值弹回旧值」。
    const clearCommandTimers = () => {
      confirmedCommand = null;
      window.clearTimeout(commandTimer);
      window.clearTimeout(commandClearTimer);
      commandTimer = null;
      commandClearTimer = null;
    };
    // 确认过的指令 8 秒后过期；另有 2.5 秒的清理定时器负责收掉中间的待发状态。
    const rememberConfirmedCommand = confirmedCommandValue => {
      confirmedCommand = confirmedCommandValue;
      window.clearTimeout(commandTimer);
      window.clearTimeout(commandClearTimer);
      commandClearTimer = null;
      commandTimer = window.setTimeout(() => {
        confirmedCommand = null;
        commandTimer = null;
      }, 8000);
    };
    /**
     * 安排一次「指令中间态」清理（2.5 秒后把待发状态一并收掉）。
     * 与 8 秒确认窗口配套：确认窗口负责压住状态回弹，这个短定时器负责在请求失败或用户
     * 不再操作时复位 pending 状态。
     */
    const scheduleCommandClear = () => {
      window.clearTimeout(commandClearTimer);
      commandClearTimer = window.setTimeout(clearCommandTimers, 2500);
    };
    const thermostatElement = document.createElement("section");
    thermostatElement.className = "hb-climate-thermostat";
    const temperatureDownButton = document.createElement("button");
    temperatureDownButton.type = "button";
    temperatureDownButton.className = "hb-climate-temperature-step";
    temperatureDownButton.textContent = "−";
    temperatureDownButton.setAttribute("aria-label", "降低设定温度");
    const temperatureDialElement = document.createElement("div");
    temperatureDialElement.className = "hb-climate-temperature-dial";
    const dialArcStartElement = document.createElement("i");
    dialArcStartElement.className = "hb-climate-arc-cap start";
    dialArcStartElement.setAttribute("aria-hidden", "true");
    const dialArcEndElement = document.createElement("i");
    dialArcEndElement.className = "hb-climate-arc-cap end";
    dialArcEndElement.setAttribute("aria-hidden", "true");
    const temperatureThumbElement = document.createElement("button");
    temperatureThumbElement.type = "button";
    temperatureThumbElement.className = "hb-climate-temperature-thumb";
    temperatureThumbElement.setAttribute("aria-label", "拖动调节设定温度");
    const temperatureContentElement = document.createElement("div");
    temperatureContentElement.className = "hb-climate-temperature-content";
    const temperatureCaptionElement = document.createElement("small");
    temperatureCaptionElement.textContent = "设定温度";
    const temperatureValueElement = document.createElement("strong");
    const currentTemperatureElement = document.createElement("span");
    currentTemperatureElement.textContent = Number.isFinite(capabilityCurrentTemperature)
      ? "当前温度 " + capabilityCurrentTemperature + "°C"
      : "当前温度 --";
    temperatureContentElement.append(
      temperatureCaptionElement,
      temperatureValueElement,
      currentTemperatureElement
    );
    temperatureDialElement.append(
      dialArcStartElement,
      dialArcEndElement,
      temperatureThumbElement,
      temperatureContentElement
    );
    const temperatureUpButton = document.createElement("button");
    temperatureUpButton.type = "button";
    temperatureUpButton.className = "hb-climate-temperature-step";
    temperatureUpButton.textContent = "+";
    temperatureUpButton.setAttribute("aria-label", "提高设定温度");
    let latestClimateEntityState = climateControlsState;
    /**
     * 取实体状态对应的气候「效果模式」，供可视化层决定配色与动画。
     *
     * 不同设备类型（空调 / 浴霸等）对 state 的解释不同，统一交给 climateEffectMode 判定。
     */
    const resolveEffectMode = effectSourceState =>
      climateEffectMode(effectSourceState, climateDeviceType);
    /**
     * 渲染温控区：模式按钮高亮、强调色、当前温度与可视回调。
     * 强调色按「制冷 / 制热 / 其他」取模式色，再用目标温度在区间内的比例提亮，让用户一眼
     * 看出设定温度处于高位还是低位；末尾统一刷新所有按钮与自定义下拉的选中态。
     */
    const renderClimateControls = (controlsSourceState = latestClimateEntityState) => {
      latestClimateEntityState = controlsSourceState || latestClimateEntityState;
      const effectMode = resolveEffectMode(latestClimateEntityState);
      const temperatureRatio = Math.max(
        0,
        Math.min(
          1,
          (pendingTargetTemperature - capabilityMinimumTemperature) /
            Math.max(
              capabilityTemperatureStep,
              capabilityMaximumTemperature - capabilityMinimumTemperature
            )
        )
      );
      const modeAccentColor =
        effectMode === "cool"
          ? climateModeColors.cool || paletteColor("--hos-cool", "#58c4ff")
          : effectMode === "heat"
            ? climateModeColors.heat || paletteColor("--hos-heat", "#ff8a65")
            : climateModeColors.other || paletteColor("--hos-ink", "#f1f7fb");
      const climateAccentColorValue =
        effectMode === "off"
          ? paletteColor("--hos-sensor", "#9eb0c4")
          : effectMode === "cool"
            ? mixHexColors(modeAccentColor, "#ffffff", temperatureRatio * 0.32)
            : effectMode === "heat"
              ? mixHexColors(modeAccentColor, "#ffffff", (1 - temperatureRatio) * 0.3)
              : modeAccentColor;
      climateControlsElement.dataset.climateVisualMode = effectMode;
      if (effectMode !== "off") {
        climateControlsElement.dataset.lastClimateMode = String(
          latestClimateEntityState?.state || "auto"
        );
      }
      const climateAccentSoftColorValue = mixHexColors(climateAccentColorValue, "#11171c", 0.72);
      climateControlsElement.style.setProperty("--hb-climate-accent", climateAccentColorValue);
      climateControlsElement.style.setProperty(
        "--hb-climate-accent-soft",
        climateAccentSoftColorValue
      );
      const isClimateRunning = climateIsRunning(latestClimateEntityState, climateDeviceType);
      climateControlsElement.classList.toggle("is-running", isClimateRunning);
      climateVisualChangeCallback?.({
        mode: climatePresentationMode(latestClimateEntityState, climateDeviceType),
        visualMode: effectMode,
        running: isClimateRunning,
        accentColor: climateAccentColorValue,
        accentSoft: climateAccentSoftColorValue,
        targetTemperature: supportsTargetTemperature ? pendingTargetTemperature : null
      });
      const normalizedCurrentTemperature =
        normalizeClimateCapabilities(latestClimateEntityState).currentTemperature;
      currentTemperatureElement.textContent =
        normalizedCurrentTemperature !== null
          ? "当前温度 " + normalizedCurrentTemperature + "°C"
          : "当前温度 --";
      /**
       * 按服务名取出该服务对应的「当前值」，用于高亮模式按钮与自定义下拉。
       * HA 把模式、风速、摆风、预设等维度分散在 state 与各种 attribute 上，这里按服务名
       * 集中映射，免得每个按钮各自写一遍取值逻辑。
       */
      const resolveServiceValue = climateServiceName =>
        climateServiceName === "set_hvac_mode"
          ? latestClimateEntityState?.state
          : climateServiceName === "set_fan_mode"
            ? latestClimateEntityState?.attributes?.fan_mode
            : climateServiceName === "set_swing_mode"
              ? latestClimateEntityState?.attributes?.swing_mode
              : climateServiceName === "set_swing_horizontal_mode"
                ? latestClimateEntityState?.attributes?.swing_horizontal_mode
                : climateServiceName === "set_preset_mode"
                  ? latestClimateEntityState?.attributes?.preset_mode
                  : climateServiceName === "set_operation_mode"
                    ? latestClimateEntityState?.attributes?.operation_mode
                    : null;
      for (const climateModeButtonElement of climateControlsElement.querySelectorAll(
        "button[data-climate-service]"
      )) {
        const modeButtonService = climateModeButtonElement.dataset.climateService;
        const modeButtonValue = resolveServiceValue(modeButtonService);
        climateModeButtonElement.classList.toggle(
          "active",
          climateModeButtonElement.dataset.climateValue === String(modeButtonValue ?? "")
        );
      }
      for (const climateSelectElement of climateControlsElement.querySelectorAll(
        ".hb-climate-select[data-climate-service]"
      )) {
        const climateSelectCurrentValue = String(
          resolveServiceValue(climateSelectElement.dataset.climateService) ?? ""
        );
        climateSelectElement.dataset.currentValue = climateSelectCurrentValue;
        const selectedOptionElement = Array.from(
          climateSelectElement.querySelectorAll('[role="option"]')
        ).find(selectOption => selectOption.dataset.value === climateSelectCurrentValue);
        const selectTriggerSpanElement = climateSelectElement.querySelector(
          ".hb-climate-select-trigger > span"
        );
        if (selectTriggerSpanElement) {
          selectTriggerSpanElement.textContent =
            selectedOptionElement?.textContent || climateSelectCurrentValue || "请选择";
          selectTriggerSpanElement.title = selectTriggerSpanElement.textContent;
        }
        climateSelectElement.querySelectorAll('[role="option"]').forEach(selectMenuOption => {
          const isOptionSelected = selectMenuOption.dataset.value === climateSelectCurrentValue;
          selectMenuOption.classList.toggle("active", isOptionSelected);
          selectMenuOption.setAttribute("aria-selected", String(isOptionSelected));
        });
      }
    };
    /**
     * 渲染圆形温控表盘：设定值、进度弧、指针角度与加减按钮可用性。
     * 表盘可视角度只有 270°（自 225° 起），故进度按 75% 折算而非 100%；边界判断留半步
     * 容差 stepEpsilon，否则步进值非整数时会「差一点点按不动」；参数控制强调动画重放。
     */
    const renderThermostat = (shouldAnimate = false) => {
      temperatureValueElement.innerHTML = supportsTargetTemperature
        ? pendingTargetTemperature + "<small>°C</small>"
        : "--";
      const progressRatio =
        ((pendingTargetTemperature - capabilityMinimumTemperature) /
          Math.max(
            capabilityTemperatureStep,
            capabilityMaximumTemperature - capabilityMinimumTemperature
          )) *
        75;
      const clampedProgress = Math.max(0, Math.min(75, progressRatio));
      temperatureDialElement.style.setProperty(
        "--hb-climate-temperature-progress",
        clampedProgress + "%"
      );
      temperatureDialElement.style.setProperty(
        "--hb-climate-thumb-angle",
        225 + (clampedProgress / 75) * 270 + "deg"
      );
      temperatureThumbElement.setAttribute("aria-valuemin", String(capabilityMinimumTemperature));
      temperatureThumbElement.setAttribute("aria-valuemax", String(capabilityMaximumTemperature));
      temperatureThumbElement.setAttribute("aria-valuenow", String(pendingTargetTemperature));
      temperatureThumbElement.setAttribute("aria-valuetext", pendingTargetTemperature + "°C");
      const stepEpsilon = Math.max(0.001, capabilityTemperatureStep / 2);
      temperatureDownButton.disabled =
        !supportsTargetTemperature ||
        pendingTargetTemperature <= capabilityMinimumTemperature + stepEpsilon;
      temperatureUpButton.disabled =
        !supportsTargetTemperature ||
        pendingTargetTemperature >= capabilityMaximumTemperature - stepEpsilon;
      temperatureDownButton.title = "最低 " + capabilityMinimumTemperature + "°C";
      temperatureUpButton.title = "最高 " + capabilityMaximumTemperature + "°C";
      renderClimateControls();
      if (shouldAnimate) {
        temperatureValueElement.classList.remove("is-changing");
        window.requestAnimationFrame(() => temperatureValueElement.classList.add("is-changing"));
      }
    };
    let lastCommittedTemperature = pendingTargetTemperature;
    const temperatureQueue = [];
    let inFlightTemperature = null;
    let displayTargetTemperature = pendingTargetTemperature;
    let isTemperatureRequestPending = false;
    let temperatureQueueTimer = null;
    /**
     * 判断两个设定温度是否相等（容差 1e-8）。
     * 温度可能是 22.5 这类浮点数，直接用 === 会因浮点误差误判，导致相同的值仍被下发一次服务调用。
     */
    const areTemperaturesEqual = (firstTemperature, secondTemperature) =>
      firstTemperature !== null &&
      secondTemperature !== null &&
      Math.abs(firstTemperature - secondTemperature) < 1e-8;
    /**
     * 查看当前「最新目标温度」（队尾优先，其次在途值），不修改队列。
     */
    const peekQueuedTemperature = () => temperatureQueue.at(-1) ?? inFlightTemperature;
    /**
     * 把最新目标温度登记为「已确认指令」，用于压住状态回弹。
     */
    const scheduleTemperatureQueue = () => {
      const queuedTemperature = peekQueuedTemperature();
      if (queuedTemperature !== null) {
        rememberConfirmedCommand(queuedTemperature);
      }
    };
    /**
     * 串行下发温度设定请求。
     * 同一时刻只允许一个在途请求：取队首下发，期间新值继续排队，本轮结束 220ms 后再处理
     * 下一个；与上次成功值相同就跳过；失败时清空队列并把显示回退到最后一个成功值。
     */
    const flushTemperatureQueue = async () => {
      window.clearTimeout(temperatureQueueTimer);
      temperatureQueueTimer = null;
      if (isTemperatureRequestPending || !temperatureQueue.length) {
        return;
      }
      const nextTemperature = temperatureQueue.shift();
      inFlightTemperature = nextTemperature;
      if (areTemperaturesEqual(nextTemperature, lastCommittedTemperature)) {
        inFlightTemperature = null;
        scheduleTemperatureQueue();
        if (temperatureQueue.length) {
          temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 220);
        }
        return;
      }
      isTemperatureRequestPending = true;
      try {
        await this.callEntityService(
          climateEntityDomain === "climate" ? "climate" : climateEntityDomain,
          "set_temperature",
          climateControlsEntityId,
          {
            temperature: nextTemperature
          }
        );
        lastCommittedTemperature = nextTemperature;
        if (climateEntityDomain !== "water_heater") {
          climatePowerChangeCallback?.(true);
        }
      } catch (temperatureRequestError) {
        temperatureQueue.length = 0;
        clearCommandTimers();
        displayTargetTemperature = lastCommittedTemperature;
        pendingTargetTemperature = lastCommittedTemperature;
        renderThermostat(true);
        this.options.onError?.(temperatureRequestError);
      } finally {
        isTemperatureRequestPending = false;
        inFlightTemperature = null;
        scheduleTemperatureQueue();
        if (temperatureQueue.length) {
          temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 220);
        }
      }
    };
    /**
     * 把当前目标温度排入下发队列。
     * 与队列末尾值相同就不重复排队（只刷新确认窗口）。preserveIntermediateSteps 为真且设备是热水器时保留 中间档位，因为热水器「点一次升一档」，合并中间值会让实际档位跳级；其他设备与拖动结束只留最终值。
     * 160ms 延迟用于合并连续点击。
     */
    const enqueueTemperature = ({
      preserveIntermediateSteps: preserveIntermediateSteps = true
    } = {}) => {
      const desiredTemperature = pendingTargetTemperature;
      displayTargetTemperature = desiredTemperature;
      const queuedTargetTemperature =
        temperatureQueue.at(-1) ?? inFlightTemperature ?? lastCommittedTemperature;
      if (areTemperaturesEqual(desiredTemperature, queuedTargetTemperature)) {
        scheduleTemperatureQueue();
        return;
      }
      if (preserveIntermediateSteps && isWaterHeater) {
        const secondaryQueuedTarget =
          temperatureQueue.at(-2) ?? inFlightTemperature ?? lastCommittedTemperature;
        if (
          temperatureQueue.length &&
          areTemperaturesEqual(desiredTemperature, secondaryQueuedTarget)
        ) {
          temperatureQueue.pop();
        } else {
          temperatureQueue.push(desiredTemperature);
        }
      } else {
        temperatureQueue.length = 0;
        temperatureQueue.push(desiredTemperature);
      }
      scheduleTemperatureQueue();
      if (!isTemperatureRequestPending) {
        window.clearTimeout(temperatureQueueTimer);
        temperatureQueueTimer = window.setTimeout(flushTemperatureQueue, 160);
      }
    };
    /**
     * 按步长增减目标温度（「+」「-」按钮的处理函数）。
     * 先夹到设备支持的 [min, max]，再按 capabilityTemperatureStep 的小数位数取整，避免
     * 浮点累加出现 22.500000000000004 这类值；值真的变化才重绘并入队下发。
     */
    const stepTargetTemperature = stepCount => {
      if (!climateControlsInteractive || !supportsTargetTemperature) {
        return;
      }
      const previousTemperature = pendingTargetTemperature;
      const temperatureDecimals = String(capabilityTemperatureStep).split(".")[1]?.length || 0;
      pendingTargetTemperature = Number(
        Math.max(
          capabilityMinimumTemperature,
          Math.min(
            capabilityMaximumTemperature,
            pendingTargetTemperature + stepCount * capabilityTemperatureStep
          )
        ).toFixed(temperatureDecimals)
      );
      if (pendingTargetTemperature !== previousTemperature) {
        renderThermostat(true);
        enqueueTemperature();
      }
    };
    /**
     * 把表盘上的指针位置换算成设定温度。
     * 有效角度区间 225°~495°（从正下方顺时针 270°，缺口在正下方）；指针落在缺口
     * 135°~225° 内时按靠近端吸附到端值，避免读值跳变；比例再按设备温区与步长量化。
     */
    const temperatureFromPointer = dialPointerEvent => {
      const dialRect = temperatureDialElement.getBoundingClientRect();
      const dialCenterX = dialRect.left + dialRect.width / 2;
      const dialCenterY = dialRect.top + dialRect.height / 2;
      const pointerOffsetX = dialPointerEvent.clientX - dialCenterX;
      const pointerOffsetY = dialPointerEvent.clientY - dialCenterY;
      const pointerAngleDeg =
        ((Math.atan2(pointerOffsetX, -pointerOffsetY) * 180) / Math.PI + 360) % 360;
      let normalizedAngleDeg;
      if (pointerAngleDeg >= 225) {
        normalizedAngleDeg = pointerAngleDeg;
      } else if (pointerAngleDeg <= 135) {
        normalizedAngleDeg = pointerAngleDeg + 360;
      } else {
        normalizedAngleDeg = pointerAngleDeg <= 180 ? 495 : 225;
      }
      const angleRatio = Math.max(0, Math.min(1, (normalizedAngleDeg - 225) / 270));
      const decimalPlaces = String(capabilityTemperatureStep).split(".")[1]?.length || 0;
      return Number(
        (
          capabilityMinimumTemperature +
          Math.round(
            ((capabilityMaximumTemperature - capabilityMinimumTemperature) * angleRatio) /
              capabilityTemperatureStep
          ) *
            capabilityTemperatureStep
        ).toFixed(decimalPlaces)
      );
    };
    let activeDialDrag = null;
    temperatureDialElement.addEventListener("pointerdown", dialDownEvent => {
      if (!climateControlsInteractive || !supportsTargetTemperature) {
        return;
      }
      const dialDragRect = temperatureDialElement.getBoundingClientRect();
      const dialRadiusPx = Math.min(dialDragRect.width, dialDragRect.height) / 2;
      const pointerDistancePx = Math.hypot(
        dialDownEvent.clientX - (dialDragRect.left + dialDragRect.width / 2),
        dialDownEvent.clientY - (dialDragRect.top + dialDragRect.height / 2)
      );
      if (
        dialDownEvent.target === temperatureThumbElement ||
        !(Math.abs(pointerDistancePx - dialRadiusPx) > 34)
      ) {
        dialDownEvent.preventDefault();
        activeDialDrag = {
          pointerId: dialDownEvent.pointerId,
          previous: pendingTargetTemperature
        };
        capturePointer(temperatureDialElement, dialDownEvent.pointerId);
        temperatureDialElement.classList.add("is-dragging");
        pendingTargetTemperature = temperatureFromPointer(dialDownEvent);
        renderThermostat();
      }
    });
    temperatureDialElement.addEventListener("pointermove", dialMoveEvent => {
      if (!!activeDialDrag && dialMoveEvent.pointerId === activeDialDrag.pointerId) {
        pendingTargetTemperature = temperatureFromPointer(dialMoveEvent);
        renderThermostat();
      }
    });
    /**
     * 结束表盘拖动：清掉拖动态、释放指针捕获，并仅在温度真的变化时下发。
     * 比较对象是「按下时的温度」而非上一次移动值，一次拖动只产生一个请求；
     * preserveIntermediateSteps 传 false，让队列合并中间值。
     */
    const endDialDrag = dialReleaseEvent => {
      if (!activeDialDrag || dialReleaseEvent.pointerId !== activeDialDrag.pointerId) {
        return;
      }
      const dragStartTemperature = activeDialDrag.previous;
      activeDialDrag = null;
      temperatureDialElement.classList.remove("is-dragging");
      releasePointer(temperatureDialElement, dialReleaseEvent.pointerId);
      renderThermostat(true);
      if (pendingTargetTemperature !== dragStartTemperature) {
        enqueueTemperature({
          preserveIntermediateSteps: false
        });
      }
    };
    temperatureDialElement.addEventListener("pointerup", endDialDrag);
    temperatureDialElement.addEventListener("pointercancel", endDialDrag);
    temperatureThumbElement.disabled = !supportsTargetTemperature;
    temperatureDownButton.addEventListener("click", () => stepTargetTemperature(-1));
    temperatureUpButton.addEventListener("click", () => stepTargetTemperature(1));
    renderThermostat();
    thermostatElement.append(temperatureDownButton, temperatureDialElement, temperatureUpButton);
    if (supportsTargetTemperature) {
      climateControlsElement.append(thermostatElement);
    }
    const waterHeaterPanelElement =
      climateDeviceType === "water-heater" ? document.createElement("section") : null;
    if (waterHeaterPanelElement) {
      waterHeaterPanelElement.className = "hb-water-heater-control-panel";
      waterHeaterPanelElement.dataset.controlSource = "primary-entity";
      climateControlsElement.append(waterHeaterPanelElement);
      climateControlsElement.waterHeaterControlPanel = waterHeaterPanelElement;
    }
    /**
     * 创建一组温控选项控件（模式 / 风速 / 摆风 / 预设等）。
     * 呈现形式由 climateOptionPresentation 按「选项数量与文案长度」自动决定：少量短文案用内联按钮，多或长 则用自定义下拉 —— 原生 select 无法满足样式与弹层定位需求，所以用 popover + listbox 角色手工实现并补齐
     * 键盘操作。取值列表去重后为空则整组不渲染，避免出现空区块。
     */
    const createClimateOptionGroup = ({
      label: optionLabel,
      values: optionValuesInput,
      current: optionCurrentValue,
      service: optionService,
      dataKey: optionDataKey,
      labels: optionLabels = {},
      icons: optionIcons = {},
      className: optionClassName = "",
      domain: optionDomain = "climate",
      presentation: optionPresentation = "auto"
    }) => {
      const optionValues = [
        ...new Set(
          (Array.isArray(optionValuesInput) ? optionValuesInput : [])
            .map(optionValueInput => String(optionValueInput ?? "").trim())
            .filter(Boolean)
        )
      ];
      if (!optionValues.length) {
        return;
      }
      const presentationMode =
        optionPresentation === "auto"
          ? climateOptionPresentation(optionValues, optionLabels)
          : optionPresentation;
      const climateOptionGroupElement = document.createElement("div");
      climateOptionGroupElement.className = ("hb-climate-details-group " + optionClassName).trim();
      if (waterHeaterPanelElement) {
        climateOptionGroupElement.dataset.controlSource = "primary-entity";
      }
      const climateOptionGroupTitleElement = document.createElement("strong");
      climateOptionGroupTitleElement.textContent = optionLabel;
      if (presentationMode === "select") {
        climateOptionGroupElement.classList.add("select-options");
        const climateSelectContainerElement = document.createElement("div");
        climateSelectContainerElement.className = "hb-climate-select";
        climateSelectContainerElement.dataset.climateService = optionService;
        climateSelectContainerElement.dataset.currentValue = String(optionCurrentValue ?? "");
        const selectTriggerElement = document.createElement("button");
        selectTriggerElement.type = "button";
        selectTriggerElement.className = "hb-climate-select-trigger";
        selectTriggerElement.setAttribute("aria-label", optionLabel);
        selectTriggerElement.setAttribute("aria-haspopup", "listbox");
        selectTriggerElement.setAttribute("aria-expanded", "false");
        selectTriggerElement.disabled = !climateControlsInteractive;
        const selectTriggerLabelElement = document.createElement("span");
        const selectChevronElement = document.createElement("i");
        selectChevronElement.setAttribute("aria-hidden", "true");
        selectTriggerElement.append(selectTriggerLabelElement, selectChevronElement);
        const selectMenuElement = document.createElement("div");
        selectMenuElement.className = "hb-climate-select-menu";
        selectMenuElement.id = "hb-climate-select-" + randomUuid();
        selectMenuElement.setAttribute("role", "listbox");
        selectMenuElement.setAttribute("aria-label", optionLabel);
        selectMenuElement.setAttribute("popover", "auto");
        selectMenuElement.hidden = true;
        selectTriggerElement.setAttribute("aria-controls", selectMenuElement.id);
        let isSelectRequestPending = false;
        /**
         * 判断下拉菜单当前是否展开。
         * 优先用 :popover-open 伪类；不支持 popover 的环境走兼容分支读 dataset.open 标记，
         * 避免整个方法抛错导致菜单彻底不可用。
         */
        const isSelectMenuOpen = () => {
          try {
            return selectMenuElement.matches(":popover-open");
          } catch {
            return selectMenuElement.dataset.open === "true";
          }
        };
        /**
         * 把下拉当前值渲染到触发器文案与菜单项的选中态上。
         * 显示文案优先取对应菜单项文本（可能已本地化），找不到才退回原始值，保证未在 labels
         * 登记的取值也能显示。
         */
        const renderSelectValue = selectValueOption => {
          const currentSelectValueText = String(selectValueOption ?? "");
          climateSelectContainerElement.dataset.currentValue = currentSelectValueText;
          const selectedMenuOptionElement = Array.from(
            selectMenuElement.querySelectorAll('[role="option"]')
          ).find(menuOptionSearch => menuOptionSearch.dataset.value === currentSelectValueText);
          selectTriggerLabelElement.textContent =
            selectedMenuOptionElement?.textContent || currentSelectValueText || "请选择";
          selectTriggerLabelElement.title = selectTriggerLabelElement.textContent;
          selectMenuElement.querySelectorAll('[role="option"]').forEach(menuOptionToggle => {
            const isMenuOptionSelected = menuOptionToggle.dataset.value === currentSelectValueText;
            menuOptionToggle.classList.toggle("active", isMenuOptionSelected);
            menuOptionToggle.setAttribute("aria-selected", String(isMenuOptionSelected));
          });
        };
        /**
         * 计算并设置下拉菜单的尺寸与位置（空间不足时向上翻转）。
         * 用 fixed 定位并夹进取视口：宽度取触发器宽度与 190px 的较大值、高度上限 360px；
         * 下方容不下且上方更宽裕时向上弹；最后把 left/top 夹进视口内 10px，避免贴边或溢出。
         *
         * 为什么不与编辑器侧那 11 处下拉共用 `shared/menu-positioning.js`：这里有三处手感是它
         * 没有的 —— 宽度**下限** 190px、翻转阈值用 `min(内容高, 180)` 且要求上方更宽裕、不翻转时
         * 把 top 也夹进视口。共享实现要长出三个开关才能表达，而那三个开关只服务这一个调用点；
         * 强行合并会改掉长菜单贴底时的翻转时机（本文件在展示页上），得靠视觉验证兜。故保留分叉。
         */
        const positionSelectMenu = () => {
          if (!isSelectMenuOpen() && selectMenuElement.hidden) {
            return;
          }
          const triggerRect = selectTriggerElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const menuWidthPx = Math.min(
            Math.max(triggerRect.width, 190),
            Math.max(190, viewportWidth - 20)
          );
          selectMenuElement.style.width = menuWidthPx + "px";
          selectMenuElement.style.maxHeight =
            Math.min(360, Math.max(120, viewportHeight - 20)) + "px";
          const menuHeightPx = Math.min(selectMenuElement.scrollHeight || 0, 360);
          const spaceBelowPx = viewportHeight - triggerRect.bottom - 10;
          const spaceAbovePx = triggerRect.top - 10;
          const menuTopPx =
            spaceBelowPx < Math.min(menuHeightPx, 180) && spaceAbovePx > spaceBelowPx
              ? Math.max(10, triggerRect.top - menuHeightPx - 5)
              : Math.min(viewportHeight - menuHeightPx - 10, triggerRect.bottom + 5);
          selectMenuElement.style.left =
            Math.max(10, Math.min(triggerRect.left, viewportWidth - menuWidthPx - 10)) + "px";
          selectMenuElement.style.top = Math.max(10, menuTopPx) + "px";
        };
        /**
         * 关闭下拉菜单，并同步 hidden 标记与 aria-expanded。
         */
        const closeSelectMenu = () => {
          if (isSelectMenuOpen() && typeof selectMenuElement.hidePopover == "function") {
            selectMenuElement.hidePopover();
          }
          selectMenuElement.hidden = true;
          selectMenuElement.dataset.open = "false";
          selectTriggerElement.setAttribute("aria-expanded", "false");
        };
        /**
         * 打开下拉菜单并完成定位，必要时把焦点移入选项。
         *
         * 触发器禁用或有请求在途时不打开，避免在提交过程中切换取值。
         */
        const openSelectMenu = (shouldFocusFirstOption = false) => {
          if (!selectTriggerElement.disabled && !isSelectRequestPending) {
            selectMenuElement.hidden = false;
            if (typeof selectMenuElement.showPopover == "function") {
              selectMenuElement.showPopover();
            } else {
              selectMenuElement.dataset.open = "true";
            }
            selectTriggerElement.setAttribute("aria-expanded", "true");
            positionSelectMenu();
            if (shouldFocusFirstOption) {
              (
                selectMenuElement.querySelector('[aria-selected="true"]') ||
                selectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        /**
         * 提交下拉选中的取值：先乐观刷新触发器文案，再调用服务，失败时回滚显示。
         * 成功后必须把结果合并进 latestClimateEntityState：状态推送总晚于服务返回，不合并的话紧接着的 renderClimateControls 会按旧状态把刚选中的模式改回去。合并时还要补齐派生字段 —— hvac_mode 同步 state 与
         * hvac_action（否则配色不对），浴霸预设的「待机/关闭」折算成 off，水暖的 operation_mode 映射成 on/off。
         */
        const commitSelectOption = async committedOptionValue => {
          if (!climateControlsInteractive || isSelectRequestPending) {
            return;
          }
          const previousSelectValue = climateSelectContainerElement.dataset.currentValue;
          isSelectRequestPending = true;
          selectTriggerElement.disabled = true;
          closeSelectMenu();
          renderSelectValue(committedOptionValue);
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: committedOptionValue
            });
            const nextClimateAttributes = {
              ...(latestClimateEntityState?.attributes || {}),
              [optionDataKey]: committedOptionValue
            };
            if (optionService === "set_hvac_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue,
                attributes: {
                  ...nextClimateAttributes,
                  hvac_action:
                    committedOptionValue === "cool"
                      ? "cooling"
                      : committedOptionValue === "heat"
                        ? "heating"
                        : committedOptionValue === "off"
                          ? "off"
                          : committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyPreset =
                climateDeviceType === "bath-heater" &&
                ["idle", "standby", "待机", "关闭"].includes(
                  String(committedOptionValue).trim().toLowerCase()
                );
              const fallbackClimateMode =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeCandidate => fallbackModeCandidate !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetClimateState = {
                ...(latestClimateEntityState || {}),
                state: isStandbyPreset
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackClimateMode,
                attributes: {
                  ...nextClimateAttributes,
                  preset_mode: committedOptionValue
                }
              };
              const presetEffectMode = climateEffectMode(nextPresetClimateState, climateDeviceType);
              nextPresetClimateState.attributes.hvac_action = isStandbyPreset
                ? "idle"
                : presetEffectMode === "cool"
                  ? "cooling"
                  : presetEffectMode === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetClimateState;
              climatePowerChangeCallback?.(!isStandbyPreset);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...nextClimateAttributes,
                  operation_mode: committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                attributes: nextClimateAttributes
              };
            }
            renderClimateControls();
          } catch (selectRequestError) {
            renderSelectValue(previousSelectValue);
            this.options.onError?.(selectRequestError);
          } finally {
            isSelectRequestPending = false;
            selectTriggerElement.disabled = !climateControlsInteractive;
          }
        };
        for (const optionButtonValue of optionValues) {
          const climateSelectOptionElement = document.createElement("button");
          climateSelectOptionElement.type = "button";
          climateSelectOptionElement.className = "hb-climate-select-option";
          climateSelectOptionElement.setAttribute("role", "option");
          climateSelectOptionElement.dataset.value = optionButtonValue;
          climateSelectOptionElement.textContent =
            optionLabels[optionButtonValue] || optionButtonValue;
          climateSelectOptionElement.title = climateSelectOptionElement.textContent;
          climateSelectOptionElement.addEventListener("click", () =>
            commitSelectOption(optionButtonValue)
          );
          selectMenuElement.append(climateSelectOptionElement);
        }
        renderSelectValue(String(optionCurrentValue ?? ""));
        selectTriggerElement.addEventListener("click", () => {
          if (isSelectMenuOpen() || selectMenuElement.dataset.open === "true") {
            closeSelectMenu();
          } else {
            openSelectMenu();
          }
        });
        selectTriggerElement.addEventListener("keydown", triggerKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(triggerKeyEvent.key)) {
            triggerKeyEvent.preventDefault();
            openSelectMenu(true);
          }
        });
        selectMenuElement.addEventListener("keydown", menuKeyEvent => {
          const menuOptionElements = [...selectMenuElement.querySelectorAll('[role="option"]')];
          const focusedOptionIndex = menuOptionElements.indexOf(document.activeElement);
          if (menuKeyEvent.key === "Escape") {
            menuKeyEvent.preventDefault();
            closeSelectMenu();
            selectTriggerElement.focus();
          } else if (menuKeyEvent.key === "ArrowDown" || menuKeyEvent.key === "ArrowUp") {
            menuKeyEvent.preventDefault();
            const menuStepDirection = menuKeyEvent.key === "ArrowDown" ? 1 : -1;
            menuOptionElements[
              (focusedOptionIndex + menuStepDirection + menuOptionElements.length) %
                menuOptionElements.length
            ]?.focus();
          } else if (menuKeyEvent.key === "Enter" || menuKeyEvent.key === " ") {
            menuKeyEvent.preventDefault();
            document.activeElement?.click();
          }
        });
        selectMenuElement.addEventListener("toggle", menuToggleEvent => {
          const isMenuVisible = menuToggleEvent.newState === "open";
          selectMenuElement.hidden = !isMenuVisible;
          selectMenuElement.dataset.open = String(isMenuVisible);
          selectTriggerElement.setAttribute("aria-expanded", String(isMenuVisible));
          if (isMenuVisible) {
            positionSelectMenu();
          }
        });
        climateSelectContainerElement.append(selectTriggerElement, selectMenuElement);
        climateOptionGroupElement.append(
          climateOptionGroupTitleElement,
          climateSelectContainerElement
        );
        (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
        return;
      }
      const inlineOptionsElement = document.createElement("div");
      inlineOptionsElement.className = "hb-climate-details-options";
      for (const inlineOptionValue of optionValues) {
        const inlineOptionButton = document.createElement("button");
        inlineOptionButton.type = "button";
        inlineOptionButton.dataset.climateService = optionService;
        inlineOptionButton.dataset.climateValue = inlineOptionValue;
        const inlineOptionIconElement = document.createElement("i");
        inlineOptionIconElement.setAttribute("aria-hidden", "true");
        inlineOptionIconElement.textContent = optionIcons[inlineOptionValue] || "";
        const inlineOptionLabelElement = document.createElement("span");
        inlineOptionLabelElement.textContent = optionLabels[inlineOptionValue] || inlineOptionValue;
        inlineOptionButton.append(inlineOptionIconElement, inlineOptionLabelElement);
        inlineOptionButton.classList.toggle("active", inlineOptionValue === optionCurrentValue);
        inlineOptionButton.addEventListener("click", async () => {
          if (!climateControlsInteractive) {
            return;
          }
          const isStandbyOption =
            climateDeviceType === "bath-heater" &&
            optionService === "set_preset_mode" &&
            ["idle", "standby", "待机", "关闭"].includes(
              String(inlineOptionValue).trim().toLowerCase()
            );
          inlineOptionsElement.querySelectorAll("button").forEach(inlineOptionElement => {
            inlineOptionElement.disabled = true;
          });
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: inlineOptionValue
            });
            if (isStandbyOption) {
              const powerCommandRequest = climatePowerCommand(
                climateControlsEntityId,
                latestClimateEntityState,
                false,
                "bath-heater"
              );
              await this.callEntityService(
                powerCommandRequest.domain,
                powerCommandRequest.service,
                climateControlsEntityId,
                powerCommandRequest.data
              );
            }
            inlineOptionsElement
              .querySelectorAll("button")
              .forEach(inlineButtonElement =>
                inlineButtonElement.classList.toggle(
                  "active",
                  inlineButtonElement === inlineOptionButton
                )
              );
            if (optionService === "set_hvac_mode") {
              const hvacAction =
                inlineOptionValue === "cool"
                  ? "cooling"
                  : inlineOptionValue === "heat"
                    ? "heating"
                    : inlineOptionValue === "off"
                      ? "off"
                      : inlineOptionValue;
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  hvac_action: hvacAction
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyOptionValue = isStandbyOption;
              const fallbackModeValue =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeOption => fallbackModeOption !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetStateValue = {
                ...(latestClimateEntityState || {}),
                state: isStandbyOptionValue
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackModeValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  preset_mode: inlineOptionValue
                }
              };
              const presetEffectModeValue = climateEffectMode(
                nextPresetStateValue,
                climateDeviceType
              );
              nextPresetStateValue.attributes.hvac_action = isStandbyOptionValue
                ? "idle"
                : presetEffectModeValue === "cool"
                  ? "cooling"
                  : presetEffectModeValue === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetStateValue;
              renderClimateControls();
              climatePowerChangeCallback?.(!isStandbyOptionValue);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  operation_mode: inlineOptionValue
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            }
          } catch (optionRequestError) {
            this.options.onError?.(optionRequestError);
          } finally {
            inlineOptionsElement.querySelectorAll("button").forEach(disabledButtonElement => {
              disabledButtonElement.disabled = false;
            });
          }
        });
        inlineOptionsElement.append(inlineOptionButton);
      }
      climateOptionGroupElement.append(climateOptionGroupTitleElement, inlineOptionsElement);
      (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
    };
    const operationModes = climateOperationModeValues(climateControlsState, climateDeviceType);
    const operationModeLabels = Object.fromEntries(
      operationModes.map(operationModeValue => [
        operationModeValue,
        climateModeLabel(operationModeValue, climateDeviceType, climateLabelContext)
      ])
    );
    const operationModeIcons = Object.fromEntries(
      operationModes.map(operationModeIconValue => [
        operationModeIconValue,
        climateModeIcon(operationModeIconValue, climateDeviceType)
      ])
    );
    createClimateOptionGroup({
      label: "运行模式",
      values: operationModes,
      current: String(
        climateDeviceType === "water-heater"
          ? climateCapabilityAttributes.operation_mode || ""
          : climateControlsState?.state || ""
      ),
      service: climateDeviceType === "water-heater" ? "set_operation_mode" : "set_hvac_mode",
      dataKey: climateDeviceType === "water-heater" ? "operation_mode" : "hvac_mode",
      labels: operationModeLabels,
      icons: operationModeIcons,
      className: "mode-options",
      domain: climateDeviceType === "water-heater" ? "water_heater" : "climate",
      presentation: climateOptionPresentation(operationModes, operationModeLabels)
    });
    const climateFanModes = climateEntityDomain === "climate" ? climateCapabilities.fanModes : [];
    if (climateFanModes.length) {
      const fanModeLabels = {
        silent: "静音",
        low: "低",
        medium: "中",
        high: "高",
        full: "强劲",
        auto: "自动",
        1: "一档",
        2: "二档",
        3: "三档",
        4: "四档",
        5: "五档",
        6: "六档",
        7: "七档",
        max: "Max档"
      };
      const autoFanMode = climateFanModes.find(autoFanModeCandidate =>
        ["auto", "自动"].includes(String(autoFanModeCandidate).toLowerCase())
      );
      const manualFanModes = climateFanModes.filter(
        manualFanModeCandidate => manualFanModeCandidate !== autoFanMode
      );
      const fanSliderElement = document.createElement("section");
      fanSliderElement.className = "hb-climate-fan-slider";
      const fanSliderHeadingElement = document.createElement("span");
      fanSliderHeadingElement.className = "hb-climate-fan-slider-heading";
      const fanSliderIconElement = document.createElement("i");
      fanSliderIconElement.setAttribute("aria-hidden", "true");
      fanSliderIconElement.textContent = "✾";
      const fanSliderNameElement = document.createElement("strong");
      fanSliderNameElement.textContent = "风速";
      const fanSliderOutputElement = document.createElement("output");
      const initialFanIndex = Math.max(
        0,
        manualFanModes.indexOf(climateCapabilityAttributes.fan_mode)
      );
      let committedFanIndex = initialFanIndex;
      let isAutoFanSelected = !!autoFanMode && climateCapabilityAttributes.fan_mode === autoFanMode;
      let currentFanMode = climateCapabilityAttributes.fan_mode;
      const fanRangeElement = document.createElement("input");
      fanRangeElement.type = "range";
      fanRangeElement.min = "0";
      fanRangeElement.max = String(Math.max(0, manualFanModes.length - 1));
      fanRangeElement.step = "1";
      fanRangeElement.value = String(initialFanIndex);
      fanRangeElement.disabled = manualFanModes.length === 0;
      /**
       * 取风速档位对应的中文标签，取不到时退回原始值，最后兜底 "--"。
       *
       * 档位名可能是数字（1、2）或英文（low/auto），所以查表前统一转小写字符串。
       */
      const fanModeLabelAt = fanModeIndex =>
        fanModeLabels[String(manualFanModes[fanModeIndex]).toLowerCase()] ||
        manualFanModes[fanModeIndex] ||
        "--";
      const autoFanButton = document.createElement("button");
      autoFanButton.type = "button";
      autoFanButton.className = "hb-climate-fan-auto";
      autoFanButton.textContent = "自动";
      autoFanButton.hidden = !autoFanMode;
      autoFanButton.classList.toggle("active", isAutoFanSelected);
      /**
       * 渲染风速滑条：档位文案、进度填充与「自动」按钮高亮。
       * 自动挡不在手动档位序列里，故用 isAutoFanSelected 单独决定文案，同时保留滑条位置，
       * 用户切回手动时能原地恢复上次档位。
       */
      const renderFanSlider = () => {
        const fanSliderIndex = Number(fanRangeElement.value);
        const fanProgressPercent =
          manualFanModes.length > 1 ? (fanSliderIndex / (manualFanModes.length - 1)) * 100 : 100;
        fanSliderOutputElement.textContent = isAutoFanSelected
          ? "自动"
          : fanModeLabelAt(fanSliderIndex);
        fanRangeElement.style.setProperty("--hb-climate-fan-progress", fanProgressPercent + "%");
      };
      fanSliderHeadingElement.append(
        fanSliderIconElement,
        fanSliderNameElement,
        fanSliderOutputElement,
        autoFanButton
      );
      fanRangeElement.addEventListener("input", () => {
        isAutoFanSelected = false;
        autoFanButton.classList.remove("active");
        renderFanSlider();
      });
      fanRangeElement.addEventListener("change", async () => {
        if (!climateControlsInteractive || !manualFanModes.length) {
          return;
        }
        const selectedFanIndex = Number(fanRangeElement.value);
        const selectedFanMode = manualFanModes[selectedFanIndex];
        fanRangeElement.disabled = true;
        autoFanButton.disabled = true;
        try {
          await this.callEntityService("climate", "set_fan_mode", climateControlsEntityId, {
            fan_mode: selectedFanMode
          });
          committedFanIndex = selectedFanIndex;
          currentFanMode = selectedFanMode;
          isAutoFanSelected = false;
        } catch (fanModeRequestError) {
          isAutoFanSelected = !!autoFanMode && currentFanMode === autoFanMode;
          if (!isAutoFanSelected) {
            fanRangeElement.value = String(committedFanIndex);
          }
          autoFanButton.classList.toggle("active", isAutoFanSelected);
          renderFanSlider();
          this.options.onError?.(fanModeRequestError);
        } finally {
          fanRangeElement.disabled = false;
          autoFanButton.disabled = false;
        }
      });
      autoFanButton.addEventListener("click", async () => {
        if (!!climateControlsInteractive && !!autoFanMode && !autoFanButton.disabled) {
          fanRangeElement.disabled = true;
          autoFanButton.disabled = true;
          try {
            await this.callEntityService("climate", "set_fan_mode", climateControlsEntityId, {
              fan_mode: autoFanMode
            });
            isAutoFanSelected = true;
            currentFanMode = autoFanMode;
            autoFanButton.classList.add("active");
            renderFanSlider();
          } catch (autoFanRequestError) {
            this.options.onError?.(autoFanRequestError);
          } finally {
            fanRangeElement.disabled = manualFanModes.length === 0;
            autoFanButton.disabled = false;
          }
        }
      });
      const fanSliderLegendElement = document.createElement("span");
      fanSliderLegendElement.className = "hb-climate-fan-slider-legend";
      const fanMinLabelElement = document.createElement("small");
      fanMinLabelElement.textContent = fanModeLabelAt(0);
      const fanMaxLabelElement = document.createElement("small");
      fanMaxLabelElement.textContent = fanModeLabelAt(manualFanModes.length - 1);
      fanSliderLegendElement.append(fanMinLabelElement, fanMaxLabelElement);
      renderFanSlider();
      fanSliderElement.append(fanSliderHeadingElement, fanRangeElement, fanSliderLegendElement);
      climateControlsElement.append(fanSliderElement);
    }
    let syncFanPercentage = null;
    if (climateEntityDomain === "fan" && climateCapabilities.supportsFanPercentage) {
      const fanPercentageGroupElement = document.createElement("section");
      fanPercentageGroupElement.className = "hb-climate-fan-slider";
      const fanPercentageHeadingElement = document.createElement("span");
      fanPercentageHeadingElement.className = "hb-climate-fan-slider-heading";
      const fanPercentageIconElement = document.createElement("i");
      fanPercentageIconElement.setAttribute("aria-hidden", "true");
      fanPercentageIconElement.textContent = "✾";
      const fanPercentageNameElement = document.createElement("strong");
      fanPercentageNameElement.textContent = "风速";
      const fanPercentageOutputElement = document.createElement("output");
      let fanPercentage = Math.max(0, Math.min(100, climateCapabilities.fanPercentage));
      const fanPercentageRangeElement = document.createElement("input");
      fanPercentageRangeElement.type = "range";
      fanPercentageRangeElement.min = "0";
      fanPercentageRangeElement.max = "100";
      fanPercentageRangeElement.step = String(climateCapabilities.fanPercentageStep);
      fanPercentageRangeElement.value = String(fanPercentage);
      /**
       * 渲染风速百分比滑条：百分比文案与进度填充。
       */
      const renderFanPercentage = () => {
        const inputPercentageValue = Math.max(
          0,
          Math.min(100, Number(fanPercentageRangeElement.value) || 0)
        );
        fanPercentageOutputElement.textContent = Math.round(inputPercentageValue) + "%";
        fanPercentageRangeElement.style.setProperty(
          "--hb-climate-fan-progress",
          inputPercentageValue + "%"
        );
      };
      syncFanPercentage = fanPercentageSourceState => {
        const stateFanPercentage =
          normalizeClimateCapabilities(fanPercentageSourceState).fanPercentage;
        if (stateFanPercentage !== null) {
          fanPercentage = Math.max(0, Math.min(100, stateFanPercentage));
          fanPercentageRangeElement.value = String(fanPercentage);
          renderFanPercentage();
        }
      };
      fanPercentageRangeElement.addEventListener("input", renderFanPercentage);
      fanPercentageRangeElement.addEventListener("change", async () => {
        if (!climateControlsInteractive || fanPercentageRangeElement.disabled) {
          return;
        }
        const requestedPercentage = Math.max(
          0,
          Math.min(100, Number(fanPercentageRangeElement.value) || 0)
        );
        fanPercentageRangeElement.disabled = true;
        try {
          await this.callEntityService("fan", "set_percentage", climateControlsEntityId, {
            percentage: requestedPercentage
          });
          fanPercentage = requestedPercentage;
          latestClimateEntityState = {
            ...(latestClimateEntityState || {}),
            state: requestedPercentage > 0 ? "on" : "off",
            attributes: {
              ...(latestClimateEntityState?.attributes || {}),
              percentage: requestedPercentage
            }
          };
          renderClimateControls();
          climatePowerChangeCallback?.(requestedPercentage > 0);
        } catch (fanPercentageRequestError) {
          fanPercentageRangeElement.value = String(fanPercentage);
          renderFanPercentage();
          this.options.onError?.(fanPercentageRequestError);
        } finally {
          fanPercentageRangeElement.disabled = false;
        }
      });
      const fanPercentageLegendElement = document.createElement("span");
      fanPercentageLegendElement.className = "hb-climate-fan-slider-legend";
      const fanPercentageMinLabelElement = document.createElement("small");
      fanPercentageMinLabelElement.textContent = "关闭";
      const fanPercentageMaxLabelElement = document.createElement("small");
      fanPercentageMaxLabelElement.textContent = "最大";
      fanPercentageLegendElement.append(fanPercentageMinLabelElement, fanPercentageMaxLabelElement);
      fanPercentageHeadingElement.append(
        fanPercentageIconElement,
        fanPercentageNameElement,
        fanPercentageOutputElement
      );
      renderFanPercentage();
      fanPercentageGroupElement.append(
        fanPercentageHeadingElement,
        fanPercentageRangeElement,
        fanPercentageLegendElement
      );
      climateControlsElement.append(fanPercentageGroupElement);
    }
    const swingModeLabels = Object.fromEntries(
      climateCapabilities.swingModes.map(swingModeValue => [
        swingModeValue,
        climateSwingModeLabel(swingModeValue, "vertical", climateLabelContext)
      ])
    );
    createClimateOptionGroup({
      label: climateCapabilities.horizontalSwingModes.length ? "纵向摆风" : "摆风",
      values: climateCapabilities.swingModes,
      current: climateCapabilityAttributes.swing_mode,
      service: "set_swing_mode",
      dataKey: "swing_mode",
      labels: swingModeLabels,
      icons: {
        off: "—",
        vertical: "↕",
        horizontal: "↔",
        both: "✣"
      },
      className: "compact-options",
      presentation: climateOptionPresentation(climateCapabilities.swingModes, swingModeLabels, {
        inlineIcon: true
      })
    });
    const horizontalSwingModeLabels = Object.fromEntries(
      climateCapabilities.horizontalSwingModes.map(horizontalSwingModeValue => [
        horizontalSwingModeValue,
        climateSwingModeLabel(horizontalSwingModeValue, "horizontal", climateLabelContext)
      ])
    );
    createClimateOptionGroup({
      label: "水平摆风",
      values: climateCapabilities.horizontalSwingModes,
      current: climateCapabilityAttributes.swing_horizontal_mode,
      service: "set_swing_horizontal_mode",
      dataKey: "swing_horizontal_mode",
      labels: horizontalSwingModeLabels,
      className: "compact-options",
      presentation: climateOptionPresentation(
        climateCapabilities.horizontalSwingModes,
        horizontalSwingModeLabels,
        {
          inlineIcon: true
        }
      )
    });
    const presetModeLabels = Object.fromEntries(
      climateCapabilities.presetModes.map(presetModeItem => [
        presetModeItem,
        climateModeLabel(presetModeItem, climateDeviceType, climateLabelContext)
      ])
    );
    const presetModeIcons = Object.fromEntries(
      climateCapabilities.presetModes.map(presetModeIconValue => [
        presetModeIconValue,
        climateModeIcon(presetModeIconValue, climateDeviceType)
      ])
    );
    createClimateOptionGroup({
      label: "预设模式",
      values: climateCapabilities.presetModes,
      current: climateCapabilityAttributes.preset_mode,
      service: "set_preset_mode",
      dataKey: "preset_mode",
      labels: presetModeLabels,
      icons: presetModeIcons,
      className: "compact-options",
      domain: climateEntityDomain === "fan" ? "fan" : "climate",
      presentation: climateOptionPresentation(climateCapabilities.presetModes, presetModeLabels, {
        inlineIcon: true
      })
    });
    let renderLoadingState = null;
    if (!climateControlsElement.childElementCount) {
      const climateLoadingSectionElement = document.createElement("section");
      climateLoadingSectionElement.className = "hb-climate-details-loading";
      const climateLoadingIconElement = document.createElement("i");
      climateLoadingIconElement.setAttribute("aria-hidden", "true");
      const climateLoadingTitleElement = document.createElement("strong");
      const climateLoadingHintElement = document.createElement("span");
      renderLoadingState = loadingSourceState => {
        const loadingStateText = String(loadingSourceState?.state || "")
          .trim()
          .toLowerCase();
        const isLoadingState =
          !loadingSourceState || !loadingStateText || loadingStateText === "unknown";
        const isUnavailableState = loadingStateText === "unavailable";
        climateLoadingSectionElement.classList.toggle("is-loading", isLoadingState);
        climateLoadingSectionElement.classList.toggle("is-unavailable", isUnavailableState);
        climateLoadingTitleElement.textContent = isLoadingState
          ? "正在加载设备状态…"
          : isUnavailableState
            ? "设备当前不可用"
            : "暂无可用控制数据";
        climateLoadingHintElement.textContent = isLoadingState
          ? "状态到达后会自动显示，无需重新打开弹窗"
          : isUnavailableState
            ? "连接恢复后会自动更新"
            : "请检查该实体在 Home Assistant 中提供的控制能力";
      };
      renderLoadingState(climateControlsState);
      climateLoadingSectionElement.append(
        climateLoadingIconElement,
        climateLoadingTitleElement,
        climateLoadingHintElement
      );
      climateControlsElement.append(climateLoadingSectionElement);
    }
    climateControlsElement.syncClimateGrid = () => {
      const climateGridChildren = Array.from(climateControlsElement.children);
      const gridThermostatElement = climateGridChildren.find(thermostatGridChild =>
        thermostatGridChild.classList.contains("hb-climate-thermostat")
      );
      if (!gridThermostatElement) {
        return;
      }
      const gridWaterHeaterElement = climateGridChildren.find(waterHeaterGridChild =>
        waterHeaterGridChild.classList.contains("is-water-heater")
      );
      const gridRowSpan = climateGridChildren.filter(
        gridChildNode =>
          gridChildNode !== gridThermostatElement && gridChildNode !== gridWaterHeaterElement
      ).length;
      gridThermostatElement.style.gridRow = "1 / span " + Math.max(1, gridRowSpan);
      if (gridWaterHeaterElement) {
        gridWaterHeaterElement.style.gridRow = "1 / span " + Math.max(1, gridRowSpan);
      }
    };
    climateControlsElement.syncClimateGrid();
    climateControlsElement.syncClimateState = syncClimateStateValue => {
      if (!syncClimateStateValue) {
        return;
      }
      latestClimateEntityState = syncClimateStateValue;
      renderLoadingState?.(syncClimateStateValue);
      syncFanPercentage?.(syncClimateStateValue);
      const stateTargetTemperature =
        normalizeClimateCapabilities(syncClimateStateValue).targetTemperature;
      const reconciledTarget = reconcileClimateTargetTemperature(
        displayTargetTemperature,
        stateTargetTemperature,
        confirmedCommand,
        capabilityTemperatureStep
      );
      if (confirmedCommand === null || reconciledTarget.confirmed) {
        displayTargetTemperature = reconciledTarget.temperature;
      }
      pendingTargetTemperature = displayTargetTemperature;
      if (
        stateTargetTemperature !== null &&
        (confirmedCommand === null || reconciledTarget.confirmed)
      ) {
        lastCommittedTemperature = stateTargetTemperature;
      }
      if (confirmedCommand !== null && reconciledTarget.confirmed) {
        if (isWaterHeater) {
          scheduleCommandClear();
        } else {
          clearCommandTimers();
        }
      }
      renderThermostat();
    };
    climateControlsElement.cleanupClimateDetails = () => {
      window.clearTimeout(temperatureQueueTimer);
      temperatureQueueTimer = null;
      temperatureQueue.length = 0;
      inFlightTemperature = null;
      clearCommandTimers();
    };
    renderClimateControls();
    return climateControlsElement;
  },
  /**
   * 构建浴室取暖器的照明开关。
   * 取暖与照明是同一设备下的两个实体，开关必须落到 light 实体上，故单独做一个控件，
   * 而不复用取暖器本体的开关。
   */
  createBathHeaterLightControl(
    bathLightEntityId,
    bathLightEntityState,
    {
      interactive: bathLightInteractive = true,
      onStateChange: bathLightStateChangeCallback = null
    } = {}
  ) {
    const bathHeaterLightElement = document.createElement("section");
    bathHeaterLightElement.className = "hb-bath-heater-light-control";
    const bathLightCaptionElement = document.createElement("span");
    const bathLightIconElement = document.createElement("i");
    bathLightIconElement.setAttribute("aria-hidden", "true");
    bathLightIconElement.textContent = "☀";
    const bathLightLabelElement = document.createElement("strong");
    bathLightLabelElement.textContent = String(
      bathLightEntityState?.attributes?.friendly_name || "浴霸灯"
    );
    const bathLightOutputElement = document.createElement("output");
    bathLightCaptionElement.append(
      bathLightIconElement,
      bathLightLabelElement,
      bathLightOutputElement
    );
    const bathLightButtonElement = document.createElement("button");
    bathLightButtonElement.type = "button";
    bathLightButtonElement.disabled = !bathLightInteractive;
    let bathLightCurrentState = bathLightEntityState;
    let isBathLightPending = false;
    /**
     * 渲染浴霸灯开关：文案、可用状态与对外回调。
     */
    const renderBathLight = (bathLightSourceState = bathLightCurrentState) => {
      bathLightCurrentState = bathLightSourceState || bathLightCurrentState;
      const isBathLightUnavailable = ["unknown", "unavailable"].includes(
        String(bathLightCurrentState?.state || "")
      );
      const isBathLightOn = bathLightCurrentState?.state === "on";
      bathHeaterLightElement.classList.toggle("is-on", isBathLightOn && !isBathLightUnavailable);
      bathHeaterLightElement.classList.toggle("is-unavailable", isBathLightUnavailable);
      bathLightOutputElement.textContent = isBathLightUnavailable
        ? "不可用"
        : isBathLightOn
          ? "已开启"
          : "已关闭";
      bathLightButtonElement.textContent = isBathLightOn ? "关闭灯光" : "开启灯光";
      bathLightButtonElement.disabled =
        !bathLightInteractive || isBathLightPending || isBathLightUnavailable;
      bathLightButtonElement.setAttribute("aria-pressed", String(isBathLightOn));
      bathLightStateChangeCallback?.({
        isOn: isBathLightOn,
        unavailable: isBathLightUnavailable
      });
    };
    /**
     * 切换浴霸灯（乐观更新 + 失败回滚）。
     *
     * 先按相反状态渲染以获得即时反馈，请求失败再退回原状态并把错误交给 onError。
     */
    const toggleBathLight = async () => {
      if (!bathLightInteractive || isBathLightPending) {
        return;
      }
      isBathLightPending = true;
      const previousBathLightState = bathLightCurrentState;
      renderBathLight({
        ...(bathLightCurrentState || {}),
        state: bathLightCurrentState?.state === "on" ? "off" : "on"
      });
      try {
        await this.callEntityService("homeassistant", "toggle", bathLightEntityId);
      } catch (bathLightRequestError) {
        renderBathLight(previousBathLightState);
        this.options.onError?.(bathLightRequestError);
      } finally {
        isBathLightPending = false;
        renderBathLight(bathLightCurrentState);
      }
    };
    bathLightButtonElement.addEventListener("click", toggleBathLight);
    bathHeaterLightElement.append(bathLightCaptionElement, bathLightButtonElement);
    bathHeaterLightElement.syncBathLightState = renderBathLight;
    bathHeaterLightElement.toggleBathLight = toggleBathLight;
    renderBathLight(bathLightEntityState);
    return bathHeaterLightElement;
  }
};
