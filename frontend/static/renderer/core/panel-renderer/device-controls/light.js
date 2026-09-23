/*
 * 设备控件区块：灯具详情（亮度、色温、颜色、效果与灯组场景）。
 */

import { capturePointer, releasePointer } from "../../../../utils/pointer-capture.js?v=2609231046";
import {
  LIGHT_DETAIL_PRESET_DEFINITIONS,
  LIGHT_PRESET_MAXIMUM_HOLD_MS,
  LIGHT_PRESET_MINIMUM_HOLD_MS,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT,
  UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN,
  hsToRgbColor,
  lightColorPickerHsFromPoint,
  lightColorPickerPointFromHs,
  lightColorServiceData,
  lightPresetBrightnessServiceData,
  lightPresetPendingDecision,
  lightRealtimeCapabilities,
  lightSupportsColor,
  lightVisualValueForCapability,
  relativeLightColorTemperature,
  rgbToHsColor
} from "../../../controls/light-runtime.js?v=2609231046";

export const lightDetailsMethods = {
  /**
   * 构建灯具详情弹窗的控制区（电源、亮度、色温、颜色）。
   * 能力分三档：支持彩色、只支持色温、都不支持；不支持的控件不渲染，
   * 因此渲染哪些滑块由能力探测结果决定，而非用户配置。
   */
  createLightDetailsControls(
    lightControlsEntityId,
    lightControlsState,
    {
      interactive: lightControlsInteractive = true,
      onTurnOn: lightTurnOnCallback = null,
      onVisualChange: lightVisualChangeCallback = null
    } = {}
  ) {
    const detailLightAttributes = lightControlsState?.attributes || {};
    // 非 light 域（例如净化器的灯带表现为 switch）只给开关，不给亮度 / 色温控件。
    const isLightDomain = lightControlsEntityId.startsWith("light.");
    const isColorSupported = isLightDomain && lightSupportsColor(detailLightAttributes);
    const { brightness: supportsBrightness, colorTemperature: supportsColorTemperature } =
      lightRealtimeCapabilities(lightControlsEntityId, lightControlsState);
    // 「仅色温」这一档决定是否显示色温滑条并隐藏彩色盘，与支持彩色的灯具区分开。
    const supportsTemperatureOnly = supportsColorTemperature && !isColorSupported;
    const lightControlsElement = document.createElement("section");
    lightControlsElement.className = "hb-light-details-controls";
    lightControlsElement.classList.toggle("has-color-picker", isColorSupported);
    lightControlsElement.inert = !lightControlsInteractive;
    const slidersByDataKey = new Map();
    /**
     * 创建灯具详情弹窗里的一个滑条控件（亮度或色温）。
     * 用参数对象而非位置参数，因为两个滑条只有单位与数据键不同；拖动（input）只更新本地
     * 显示并回调预览，松手（change）才下发 light.turn_on，避免拖动中打出大量服务调用。
     */
    const createLightSlider = ({
      label: sliderLabelText,
      value: sliderInitialValue,
      minimum: sliderMinimum,
      maximum: sliderMaximum,
      step: sliderStep,
      suffix: sliderSuffix,
      dataKey: sliderDataKey,
      className: sliderClassName = "",
      icon: sliderIcon,
      minimumLabel: sliderMinimumLabel,
      maximumLabel: sliderMaximumLabel,
      supported: sliderSupported = true
    }) => {
      const sliderLabelElement = document.createElement("label");
      sliderLabelElement.className = ("hb-light-details-slider " + sliderClassName).trim();
      sliderLabelElement.classList.toggle("is-unavailable", !sliderSupported);
      const sliderHeadingElement = document.createElement("span");
      sliderHeadingElement.className = "hb-light-details-slider-heading";
      const sliderIconElement = document.createElement("i");
      sliderIconElement.className = "hb-light-details-slider-icon";
      sliderIconElement.setAttribute("aria-hidden", "true");
      sliderIconElement.textContent = sliderIcon;
      const sliderNameElement = document.createElement("strong");
      sliderNameElement.textContent = sliderLabelText;
      const sliderOutputElement = document.createElement("output");
      const clampedSliderValue = Math.max(
        sliderMinimum,
        Math.min(sliderMaximum, sliderInitialValue)
      );
      sliderOutputElement.textContent = "" + Math.round(clampedSliderValue) + sliderSuffix;
      sliderHeadingElement.append(sliderIconElement, sliderNameElement, sliderOutputElement);
      const sliderInputElement = document.createElement("input");
      sliderInputElement.type = "range";
      sliderInputElement.min = String(sliderMinimum);
      sliderInputElement.max = String(sliderMaximum);
      sliderInputElement.step = String(sliderStep);
      sliderInputElement.value = String(clampedSliderValue);
      sliderInputElement.disabled = !sliderSupported;
      /**
       * 刷新滑条的数值文本与进度填充，并按需把新值回调给可视化层。
       */
      const updateSliderValue = ({ notify: shouldNotify = false } = {}) => {
        const inputSliderValue = Number(sliderInputElement.value);
        const sliderProgressPercent =
          ((inputSliderValue - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100;
        sliderOutputElement.textContent = sliderSupported
          ? "" + Math.round(inputSliderValue) + sliderSuffix
          : "不支持";
        sliderInputElement.style.setProperty(
          "--hb-light-slider-progress",
          Math.max(0, Math.min(100, sliderProgressPercent)) + "%"
        );
        if (shouldNotify && sliderSupported) {
          lightVisualChangeCallback?.(
            sliderDataKey === "brightness_pct"
              ? {
                  brightnessPercent: inputSliderValue
                }
              : {
                  colorTemperatureKelvin: inputSliderValue
                }
          );
        }
      };
      updateSliderValue();
      sliderInputElement.addEventListener("input", () => {
        clearPresetPending();
        updateSliderValue({
          notify: true
        });
      });
      sliderInputElement.addEventListener("change", async () => {
        if (!!lightControlsInteractive && !!sliderSupported) {
          try {
            await this.callEntityService("light", "turn_on", lightControlsEntityId, {
              [sliderDataKey]: Number(sliderInputElement.value)
            });
            lightTurnOnCallback?.();
          } catch (sliderSetError) {
            this.options.onError?.(sliderSetError);
            sliderOutputElement.textContent = "设置失败";
          }
        }
      });
      const sliderLegendElement = document.createElement("span");
      sliderLegendElement.className = "hb-light-details-slider-legend";
      const sliderMinLabelElement = document.createElement("small");
      sliderMinLabelElement.textContent = sliderMinimumLabel;
      const sliderMaxLabelElement = document.createElement("small");
      sliderMaxLabelElement.textContent = sliderMaximumLabel;
      sliderLegendElement.append(sliderMinLabelElement, sliderMaxLabelElement);
      sliderLabelElement.append(sliderHeadingElement, sliderInputElement, sliderLegendElement);
      lightControlsElement.append(sliderLabelElement);
      slidersByDataKey.set(sliderDataKey, {
        input: sliderInputElement,
        updateSliderValue: updateSliderValue,
        supported: sliderSupported
      });
    };
    let colorPickerElement = null;
    let colorHs = null;
    let isColorRequestPending = false;
    if (isColorSupported) {
      const initialHsColor = Array.isArray(detailLightAttributes.hs_color)
        ? detailLightAttributes.hs_color
        : rgbToHsColor(detailLightAttributes.rgb_color) || [0, 100];
      colorHs = {
        hue: Number(initialHsColor[0]) || 0,
        saturation: Number(initialHsColor[1]) || 0
      };
      colorPickerElement = document.createElement("div");
      colorPickerElement.className = "hb-light-color-picker";
      colorPickerElement.setAttribute("role", "slider");
      colorPickerElement.setAttribute("tabindex", lightControlsInteractive ? "0" : "-1");
      colorPickerElement.setAttribute("aria-label", "选择灯光颜色");
      const colorPickerGlowElement = document.createElement("i");
      colorPickerGlowElement.className = "hb-light-color-picker-glow";
      const colorPickerHandleElement = document.createElement("i");
      colorPickerHandleElement.className = "hb-light-color-picker-handle";
      colorPickerElement.append(colorPickerGlowElement, colorPickerHandleElement);
      /**
       * 把当前 HS 色值换算成取色盘上的归一化坐标。
       */
      const getColorPickerPoint = () =>
        lightColorPickerPointFromHs([colorHs.hue, colorHs.saturation]);
      /**
       * 应用 HS 色值：归一化入参、更新取色盘手柄与颜色，并回调可视化层。
       *
       * 色相取模到 [0,360)、饱和度夹到 [0,100]，这样键盘连按可以绕圈而不会越界。
       */
      const applyColorPickerHs = ({
        hue: pickerHue = colorHs.hue,
        saturation: pickerSaturation = colorHs.saturation
      } = {}) => {
        colorHs.hue = (((Number(pickerHue) || 0) % 360) + 360) % 360;
        colorHs.saturation = Math.max(0, Math.min(100, Number(pickerSaturation) || 0));
        const colorPickerPoint = getColorPickerPoint();
        const colorPickerRgb = hsToRgbColor([colorHs.hue, colorHs.saturation]);
        const colorPickerCssColor = "rgb(" + colorPickerRgb.join(",") + ")";
        colorPickerElement.style.setProperty(
          "--hb-light-color-picker-x",
          colorPickerPoint.x * 100 + "%"
        );
        colorPickerElement.style.setProperty(
          "--hb-light-color-picker-y",
          colorPickerPoint.y * 100 + "%"
        );
        colorPickerElement.style.setProperty("--hb-light-color-picker-color", colorPickerCssColor);
        colorPickerElement.setAttribute(
          "aria-valuetext",
          "色相 " + Math.round(colorHs.hue) + " 度，饱和度 " + Math.round(colorHs.saturation) + "%"
        );
        lightVisualChangeCallback?.({
          colorHs: [colorHs.hue, colorHs.saturation],
          colorRgb: colorPickerRgb
        });
      };
      /**
       * 处理取色盘上的指针事件：把指针位置换算成 HS 色值并应用。
       * 先按取色盘实际矩形把 client 坐标归一化到 0~1（夹取），再交由
       * lightColorPickerHsFromPoint 反解出色相 / 饱和度；盘面尺寸为 0 时直接返回，避免除零。
       */
      const handleColorPickerPointer = colorPickerEvent => {
        const colorPickerRect = colorPickerElement.getBoundingClientRect();
        if (!colorPickerRect.width || !colorPickerRect.height) {
          return;
        }
        const pointerRatioX = Math.max(
          0,
          Math.min(1, (colorPickerEvent.clientX - colorPickerRect.left) / colorPickerRect.width)
        );
        const pointerRatioY = Math.max(
          0,
          Math.min(1, (colorPickerEvent.clientY - colorPickerRect.top) / colorPickerRect.height)
        );
        const [pickedHue, pickedSaturation] = lightColorPickerHsFromPoint(
          pointerRatioX,
          pointerRatioY
        );
        applyColorPickerHs({
          hue: pickedHue,
          saturation: pickedSaturation
        });
      };
      /**
       * 把当前选中的颜色通过 light.turn_on 提交，并用在途标记去重。
       * 拖动结束会连续触发提交，不加 isColorRequestPending 守卫会发出一串请求；请求期间
       * 给取色盘加 aria-busy，让辅助技术知道正处于忙碌状态。
       */
      const commitColorPicker = async () => {
        if (!!lightControlsInteractive && !isColorRequestPending) {
          isColorRequestPending = true;
          colorPickerElement.setAttribute("aria-busy", "true");
          try {
            await this.callEntityService(
              "light",
              "turn_on",
              lightControlsEntityId,
              lightColorServiceData(detailLightAttributes, [colorHs.hue, colorHs.saturation])
            );
            lightTurnOnCallback?.();
          } catch (colorRequestError) {
            this.options.onError?.(colorRequestError);
          } finally {
            isColorRequestPending = false;
            colorPickerElement.removeAttribute("aria-busy");
          }
        }
      };
      colorPickerElement.addEventListener("pointerdown", colorPointerDownEvent => {
        if (lightControlsInteractive) {
          capturePointer(colorPickerElement, colorPointerDownEvent.pointerId);
          colorPickerElement.dataset.dragging = "true";
          handleColorPickerPointer(colorPointerDownEvent);
          colorPointerDownEvent.preventDefault();
        }
      });
      colorPickerElement.addEventListener("pointermove", colorPointerMoveEvent => {
        if (colorPickerElement.dataset.dragging === "true") {
          handleColorPickerPointer(colorPointerMoveEvent);
        }
      });
      /**
       * 结束取色盘拖动：清掉拖动标记、释放指针捕获，并提交最终颜色。
       * 以 dataset.dragging 判断「是否真的在拖」，避免 pointercancel 与 pointerup 各触发
       * 一次提交导致重复下发。
       */
      const handleColorPickerRelease = async colorReleaseEvent => {
        if (colorPickerElement.dataset.dragging === "true") {
          colorPickerElement.dataset.dragging = "false";
          releasePointer(colorPickerElement, colorReleaseEvent.pointerId);
          await commitColorPicker();
        }
      };
      colorPickerElement.addEventListener("pointerup", handleColorPickerRelease);
      colorPickerElement.addEventListener("pointercancel", handleColorPickerRelease);
      colorPickerElement.addEventListener("keydown", async colorPickerKeyEvent => {
        if (!lightControlsInteractive) {
          return;
        }
        const hueStepDegrees = colorPickerKeyEvent.shiftKey ? 10 : 3;
        let { hue: nextHue, saturation: nextSaturation } = colorHs;
        if (colorPickerKeyEvent.key === "ArrowLeft") {
          nextHue -= hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowRight") {
          nextHue += hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowUp") {
          nextSaturation -= hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "ArrowDown") {
          nextSaturation += hueStepDegrees;
        } else if (colorPickerKeyEvent.key === "Enter" || colorPickerKeyEvent.key === " ") {
          await commitColorPicker();
          colorPickerKeyEvent.preventDefault();
          return;
        } else {
          return;
        }
        applyColorPickerHs({
          hue: nextHue,
          saturation: nextSaturation
        });
        colorPickerKeyEvent.preventDefault();
      });
      colorPickerElement.syncColorPicker = applyColorPickerHs;
      colorPickerElement.cleanupColorPicker = () => {
        colorPickerElement.dataset.dragging = "false";
      };
      applyColorPickerHs();
      lightControlsElement.append(colorPickerElement);
    }
    const maxKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.max_mireds))
      ? 1000000 / Number(detailLightAttributes.max_mireds)
      : 2000;
    const minKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.min_mireds))
      ? 1000000 / Number(detailLightAttributes.min_mireds)
      : 6500;
    const detailMinKelvin =
      Number(detailLightAttributes.min_color_temp_kelvin) || maxKelvinFromMireds;
    const detailMaxKelvin =
      Number(detailLightAttributes.max_color_temp_kelvin) || minKelvinFromMireds;
    const currentKelvinFromMireds = Number.isFinite(Number(detailLightAttributes.color_temp))
      ? 1000000 / Number(detailLightAttributes.color_temp)
      : detailMinKelvin;
    const detailCurrentKelvin =
      Number(detailLightAttributes.color_temp_kelvin) || currentKelvinFromMireds;
    if (!isColorSupported) {
      createLightSlider({
        label: "色温",
        value: detailCurrentKelvin,
        minimum: Math.round(detailMinKelvin),
        maximum: Math.round(detailMaxKelvin),
        step: 50,
        suffix: "K",
        dataKey: "color_temp_kelvin",
        className: "hb-light-details-temperature",
        icon: "♨",
        minimumLabel: "暖色",
        maximumLabel: "冷色",
        supported: supportsColorTemperature
      });
    }
    const detailBrightnessPercent = Number.isFinite(Number(detailLightAttributes.brightness))
      ? (Number(detailLightAttributes.brightness) / 255) * 100
      : 100;
    createLightSlider({
      label: "亮度",
      value: detailBrightnessPercent,
      minimum: 1,
      maximum: 100,
      step: 1,
      suffix: "%",
      dataKey: "brightness_pct",
      className: "hb-light-details-brightness",
      icon: "☀",
      minimumLabel: "暗",
      maximumLabel: "亮",
      supported: supportsBrightness
    });
    let pendingPreset = null;
    let presetTimer = 0;
    let latestLightState = lightControlsState;
    /**
     * 清除「场景预设」的待确认状态及其定时器。
     */
    const clearPresetPending = ({ resync: shouldResync = false } = {}) => {
      window.clearTimeout(presetTimer);
      presetTimer = 0;
      pendingPreset = null;
      if (shouldResync) {
        lightControlsElement.syncLightState?.(latestLightState);
      }
    };
    /**
     * 安排一次场景预设的下发结果核对。
     * 下发后设备状态不会立刻到位，先强制保持一段最小时间，再要求状态连续稳定
     * （LIGHT_PRESET_STABLE_CONFIRMATION_MS）或到达最大等待时间才判定结束；同一时刻只排一个定时器。
     */
    const schedulePresetCheck = () => {
      window.clearTimeout(presetTimer);
      presetTimer = 0;
      if (!pendingPreset) {
        return;
      }
      const nowMs = Date.now();
      const presetDecision = lightPresetPendingDecision(pendingPreset, nowMs);
      if (presetDecision === "confirmed" || presetDecision === "timeout") {
        clearPresetPending({
          resync: true
        });
        return;
      }
      const presetResolveAtMs = pendingPreset.latestMatches
        ? Math.min(
            pendingPreset.expiresAt,
            Math.max(
              pendingPreset.minimumHoldUntil,
              pendingPreset.matchStartedAt + LIGHT_PRESET_STABLE_CONFIRMATION_MS
            )
          )
        : pendingPreset.expiresAt;
      presetTimer = window.setTimeout(schedulePresetCheck, Math.max(50, presetResolveAtMs - nowMs));
    };
    const presetDefinitions = LIGHT_DETAIL_PRESET_DEFINITIONS;
    /**
     * 把预设里的「色温百分比」换算成实际色温（开尔文）。
     * 预设只声明相对位置（0% 暖 → 100% 冷），须结合这盏灯自身支持的 min/max 色温换算，
     * 才能适配不同型号。
     */
    const presetKelvin = presetEntry =>
      relativeLightColorTemperature(
        detailMinKelvin,
        detailMaxKelvin,
        presetEntry.colorTemperaturePercent
      );
    const presetsElement = document.createElement("div");
    presetsElement.className = "hb-light-details-presets";
    presetsElement.hidden = isColorSupported || (!supportsBrightness && !supportsTemperatureOnly);
    const presetButtons = presetDefinitions.map(presetItem => {
      const presetButtonElement = document.createElement("button");
      presetButtonElement.type = "button";
      presetButtonElement.disabled = !isLightDomain;
      const presetLabelElement = document.createElement("strong");
      presetLabelElement.textContent = presetItem.label;
      const presetDetailElement = document.createElement("small");
      presetDetailElement.textContent = supportsBrightness ? presetItem.detail : "开启";
      presetButtonElement.append(presetLabelElement, presetDetailElement);
      presetButtonElement.addEventListener("click", async () => {
        if (!lightControlsInteractive || !isLightDomain) {
          return;
        }
        const presetKelvinValue = presetKelvin(presetItem);
        const presetServiceData = {};
        if (supportsBrightness) {
          Object.assign(
            presetServiceData,
            lightPresetBrightnessServiceData(presetItem.brightnessPercent)
          );
        }
        if (supportsTemperatureOnly) {
          presetServiceData.color_temp_kelvin = Math.round(presetKelvinValue);
        }
        window.clearTimeout(presetTimer);
        const presetNowMs = Date.now();
        pendingPreset = {
          brightnessPercent: presetItem.brightnessPercent,
          colorTemperatureKelvin: presetKelvinValue,
          minimumHoldUntil: presetNowMs + LIGHT_PRESET_MINIMUM_HOLD_MS,
          expiresAt: presetNowMs + LIGHT_PRESET_MAXIMUM_HOLD_MS,
          latestMatches: false,
          matchStartedAt: null
        };
        schedulePresetCheck();
        const brightnessSlider = slidersByDataKey.get("brightness_pct");
        if (brightnessSlider?.supported) {
          brightnessSlider.input.value = String(presetItem.brightnessPercent);
          brightnessSlider.updateSliderValue({
            notify: true
          });
        }
        const temperatureSlider = slidersByDataKey.get("color_temp_kelvin");
        if (temperatureSlider?.supported) {
          temperatureSlider.input.value = String(presetKelvinValue);
          temperatureSlider.updateSliderValue({
            notify: true
          });
        }
        for (const presetButtonEntry of presetButtons) {
          presetButtonEntry.button.classList.toggle(
            "is-active",
            presetButtonEntry.button === presetButtonElement
          );
        }
        lightVisualChangeCallback?.({
          isOn: true,
          ...(supportsBrightness
            ? {
                brightnessPercent: presetItem.brightnessPercent
              }
            : {}),
          ...(supportsTemperatureOnly
            ? {
                colorTemperatureKelvin: presetKelvinValue
              }
            : {})
        });
        lightTurnOnCallback?.();
        try {
          await this.callEntityService(
            "light",
            "turn_on",
            lightControlsEntityId,
            presetServiceData
          );
        } catch (presetRequestError) {
          clearPresetPending({
            resync: true
          });
          presetButtonElement.classList.remove("is-active");
          this.options.onError?.(presetRequestError);
        }
      });
      presetsElement.append(presetButtonElement);
      return {
        button: presetButtonElement,
        ...presetItem
      };
    });
    lightControlsElement.append(presetsElement);
    /**
     * 根据灯光当前状态高亮匹配的预设按钮。
     * 匹配是模糊的：亮度容差 4 个百分点、色温容差取 50K 与量程 6% 的较大者
     * —— 设备回传值与下发值存在量化误差，精确相等会永远不高亮；两维都命中且灯 on 才激活。
     */
    const renderPresetActiveState = presetState => {
      const presetLightAttributes = presetState?.attributes || {};
      const isPresetLightOn = presetState?.state === "on";
      const presetBrightness = Number.isFinite(Number(presetLightAttributes.brightness))
        ? (Number(presetLightAttributes.brightness) / 255) * 100
        : NaN;
      const presetKelvinFromMireds = Number.isFinite(Number(presetLightAttributes.color_temp))
        ? 1000000 / Number(presetLightAttributes.color_temp)
        : NaN;
      const presetCurrentKelvin =
        Number(presetLightAttributes.color_temp_kelvin) || presetKelvinFromMireds;
      for (const presetActiveEntry of presetButtons) {
        const presetTargetKelvin = presetKelvin(presetActiveEntry);
        const presetKelvinTolerance = Math.max(50, (detailMaxKelvin - detailMinKelvin) * 0.06);
        const isPresetBrightnessMatch =
          !supportsBrightness ||
          (Number.isFinite(presetBrightness) &&
            Math.abs(presetBrightness - presetActiveEntry.brightnessPercent) <= 4);
        const isPresetTemperatureMatch =
          !supportsTemperatureOnly ||
          (Number.isFinite(presetCurrentKelvin) &&
            Math.abs(presetCurrentKelvin - presetTargetKelvin) <= presetKelvinTolerance);
        presetActiveEntry.button.classList.toggle(
          "is-active",
          isPresetLightOn && isPresetBrightnessMatch && isPresetTemperatureMatch
        );
      }
    };
    renderPresetActiveState(lightControlsState);
    lightControlsElement.syncLightState = syncState => {
      if (!syncState) {
        return;
      }
      latestLightState = syncState;
      const syncAttributes = syncState.attributes || {};
      const temperatureSliderControl = slidersByDataKey.get("color_temp_kelvin");
      const temperatureFromMireds = Number.isFinite(Number(syncAttributes.color_temp))
        ? 1000000 / Number(syncAttributes.color_temp)
        : NaN;
      const syncedTemperatureKelvin =
        Number(syncAttributes.color_temp_kelvin) || temperatureFromMireds;
      const brightnessSliderControl = slidersByDataKey.get("brightness_pct");
      const syncedBrightnessPercent = Number.isFinite(Number(syncAttributes.brightness))
        ? (Number(syncAttributes.brightness) / 255) * 100
        : NaN;
      if (pendingPreset) {
        const isBrightnessPresetMatch =
          !supportsBrightness ||
          (Number.isFinite(syncedBrightnessPercent) &&
            Math.abs(syncedBrightnessPercent - pendingPreset.brightnessPercent) <= 4);
        const isTemperaturePresetMatch =
          !supportsTemperatureOnly ||
          (Number.isFinite(syncedTemperatureKelvin) &&
            Math.abs(syncedTemperatureKelvin - pendingPreset.colorTemperatureKelvin) <= 220);
        const isPresetMatch = isBrightnessPresetMatch && isTemperaturePresetMatch;
        if (isPresetMatch && !pendingPreset.latestMatches) {
          pendingPreset.matchStartedAt = Date.now();
        }
        if (!isPresetMatch) {
          pendingPreset.matchStartedAt = null;
        }
        pendingPreset.latestMatches = isPresetMatch;
        schedulePresetCheck();
      }
      const displayTemperatureKelvin =
        pendingPreset?.colorTemperatureKelvin ?? syncedTemperatureKelvin;
      const displayBrightnessPercent = pendingPreset?.brightnessPercent ?? syncedBrightnessPercent;
      if (temperatureSliderControl?.supported && Number.isFinite(displayTemperatureKelvin)) {
        temperatureSliderControl.input.value = String(displayTemperatureKelvin);
        temperatureSliderControl.updateSliderValue();
      }
      if (brightnessSliderControl?.supported && Number.isFinite(displayBrightnessPercent)) {
        brightnessSliderControl.input.value = String(displayBrightnessPercent);
        brightnessSliderControl.updateSliderValue();
      }
      if (colorPickerElement) {
        const syncedHsColor = Array.isArray(syncAttributes.hs_color)
          ? syncAttributes.hs_color
          : rgbToHsColor(syncAttributes.rgb_color);
        if (syncedHsColor) {
          colorPickerElement.syncColorPicker({
            hue: syncedHsColor[0],
            saturation: syncedHsColor[1]
          });
        }
      }
      renderPresetActiveState(
        pendingPreset
          ? {
              state: "on",
              attributes: {
                ...syncAttributes,
                ...(supportsBrightness
                  ? {
                      brightness: (pendingPreset.brightnessPercent / 100) * 255
                    }
                  : {}),
                ...(supportsTemperatureOnly
                  ? {
                      color_temp_kelvin: pendingPreset.colorTemperatureKelvin
                    }
                  : {})
              }
            }
          : syncState
      );
      const visualTemperatureKelvin = lightVisualValueForCapability(
        supportsTemperatureOnly,
        displayTemperatureKelvin,
        UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN
      );
      const visualBrightnessPercent = lightVisualValueForCapability(
        supportsBrightness,
        displayBrightnessPercent,
        UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT
      );
      lightVisualChangeCallback?.({
        isOn: syncState.state === "on",
        colorTemperatureKelvin: visualTemperatureKelvin,
        brightnessPercent: visualBrightnessPercent
      });
    };
    lightControlsElement.syncLightState(lightControlsState);
    lightControlsElement.cleanupLightDetails = () => {
      clearPresetPending();
      colorPickerElement?.cleanupColorPicker?.();
    };
    return lightControlsElement;
  }
};
