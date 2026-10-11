import type { ComponentControllerElement, ComponentPayload } from "../renderer-types";
import { LIGHT_DETAIL_PRESET_DEFINITIONS as LIGHT_DETAIL_PRESET_DEFINITIONS2, LIGHT_PRESET_MAXIMUM_HOLD_MS as LIGHT_PRESET_MAXIMUM_HOLD_MS2, LIGHT_PRESET_MINIMUM_HOLD_MS as LIGHT_PRESET_MINIMUM_HOLD_MS2, LIGHT_PRESET_STABLE_CONFIRMATION_MS as LIGHT_PRESET_STABLE_CONFIRMATION_MS2, UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT as UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2, UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN as UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2, hsToRgbColor as hsToRgbColor2, lightColorHs as lightColorHs2, lightColorPickerHsFromPoint as lightColorPickerHsFromPoint2, lightColorPickerPointFromHs as lightColorPickerPointFromHs2, lightColorRgb as lightColorRgb2, lightColorServiceData as lightColorServiceData2, lightControlMode as lightControlMode2, lightControlModes as lightControlModes2, lightPresetBrightnessServiceData as lightPresetBrightnessServiceData2, lightPresetPendingDecision as lightPresetPendingDecision2, lightRealtimeCapabilities as lightRealtimeCapabilities2, lightSupportsColor as lightSupportsColor2, lightVisualValueForCapability as lightVisualValueForCapability2, relativeLightColorTemperature as relativeLightColorTemperature2 } from "../../controls/light-runtime";
import type { PanelRenderer } from "../renderer";

export function createLightDetailsControls(this: PanelRenderer, 
    lightEntityId: any,
    lightState: any,
    {
      interactive: isLightInteractive = true,
      onTurnOn: onLightTurnOn = null,
      onVisualChange: onLightVisualChange = null,
    }: any = {},
  ): ComponentControllerElement {
    const lightStateAttributes = lightState?.attributes || {},
      startsWith3 = lightEntityId.startsWith("light."),
      hasColorPicker = startsWith3 && lightSupportsColor2(lightStateAttributes),
      { brightness: supportsBrightness, colorTemperature: supportsColorTemperature } =
        lightRealtimeCapabilities2(lightEntityId, lightState),
      supportsColorTemperatureControl = supportsColorTemperature,
      lightDetailsControlsElement: ComponentControllerElement = document.createElement("section");
    ((lightDetailsControlsElement.className = "hb-light-details-controls"),
      lightDetailsControlsElement.classList.toggle("has-color-picker", hasColorPicker),
      (lightDetailsControlsElement.inert = !isLightInteractive));
    const sliderByPayloadKey = new Map(),
      lightControlModes = lightControlModes2(lightStateAttributes);
    let currentLightMode = lightControlMode2(lightStateAttributes.color_mode, lightControlModes);
    const lightModeSelect = document.createElement("select");
    ((lightModeSelect.className = "hb-light-mode"),
      lightModeSelect.setAttribute("aria-label", "灯光模式"),
      (lightModeSelect.hidden = lightControlModes.length < 2));
    for (const lightModeOption of lightControlModes) {
      const lightModeOptionElement = document.createElement("option");
      ((lightModeOptionElement.value = lightModeOption),
        (lightModeOptionElement.textContent = {
          color: "彩光",
          temperature: "色温",
          white: "白光",
        }[lightModeOption]!),
        lightModeSelect.append(lightModeOptionElement));
    }
    const applyLightMode = (nextLightMode: any) => {
      ((currentLightMode = nextLightMode),
        (lightModeSelect.value = nextLightMode),
        lightColorPickerPanel && (lightColorPickerPanel.hidden = nextLightMode !== "color"));
      const temperatureSlider = sliderByPayloadKey.get("color_temp_kelvin");
      (temperatureSlider && (temperatureSlider.root.hidden = nextLightMode !== "temperature"),
        lightDetailsControlsElement.classList.toggle(
          "has-color-picker",
          hasColorPicker && nextLightMode === "color",
        ));
    };
    lightModeSelect.addEventListener("change", async () => {
      if (!isLightInteractive) return;
      resyncLightDetails();
      const previousLightMode = currentLightMode;
      applyLightMode(lightModeSelect.value);
      const lightTurnOnOptions =
        currentLightMode === "white"
          ? {
              white: Math.round(
                Math.max(
                  1,
                  Math.min(255, Number(previousLightState?.attributes?.brightness) || 255),
                ),
              ),
            }
          : currentLightMode === "temperature"
            ? {
                color_temp_kelvin:
                  Number(sliderByPayloadKey.get("color_temp_kelvin")?.input.value) ||
                  minColorTemperatureKelvin,
              }
            : lightColorServiceData2(lightStateAttributes, [
                lightColorHs?.hue || 0,
                lightColorHs?.saturation || 0,
              ]);
      try {
        (await this.callEntityService("light", "turn_on", lightEntityId, lightTurnOnOptions),
          onLightTurnOn?.());
      } catch (lightModeError: any) {
        (applyLightMode(previousLightMode), this.options.onError?.(lightModeError));
      }
    });
    const syncLightSlider = ({
      label: sliderLabel,
      value: sliderInitialValue,
      minimum: sliderMinimum,
      maximum: sliderMaximum,
      step: sliderStep,
      suffix: sliderSuffix,
      dataKey: sliderPayloadKey,
      className: sliderClassName = "",
      icon: sliderIcon,
      minimumLabel: sliderMinimumLabel,
      maximumLabel: sliderMaximumLabel,
      supported: isSliderSupported = true,
    }: any) => {
      const lightSliderField = document.createElement("label");
      ((lightSliderField.className = ("hb-light-details-slider " + sliderClassName).trim()),
        lightSliderField.classList.toggle("is-unavailable", !isSliderSupported));
      const lightSliderHeading = document.createElement("span");
      lightSliderHeading.className = "hb-light-details-slider-heading";
      const lightSliderIcon = document.createElement("i");
      ((lightSliderIcon.className = "hb-light-details-slider-icon"),
        lightSliderIcon.setAttribute("aria-hidden", "true"),
        (lightSliderIcon.textContent = sliderIcon));
      const lightSliderLabel = document.createElement("strong");
      lightSliderLabel.textContent = sliderLabel;
      const lightSliderOutputElement = document.createElement("output"),
        clampedSliderValue = Math.max(sliderMinimum, Math.min(sliderMaximum, sliderInitialValue));
      ((lightSliderOutputElement.textContent = "" + Math.round(clampedSliderValue) + sliderSuffix),
        lightSliderHeading.append(lightSliderIcon, lightSliderLabel, lightSliderOutputElement));
      const lightSliderInput = document.createElement("input");
      ((lightSliderInput.type = "range"),
        lightSliderInput.classList.add("hb-range"),
        (lightSliderInput.min = String(sliderMinimum)),
        (lightSliderInput.max = String(sliderMaximum)),
        (lightSliderInput.step = String(sliderStep)),
        (lightSliderInput.value = String(clampedSliderValue)),
        (lightSliderInput.disabled = !isSliderSupported));
      const updateSliderValue = ({ notify: shouldNotifyChange = false } = {}) => {
        const sliderValue = Number(lightSliderInput.value),
          sliderProgressPercent = Math.max(
            0,
            Math.min(
              100,
              ((sliderValue - sliderMinimum) / Math.max(1, sliderMaximum - sliderMinimum)) * 100,
            ),
          ),
          // 同时写 studio 专用变量与全局 main.css 读取的 --progress-pct：
          // 未排除的 range 会吃到 main.css 默认 50%，造成「读数 25%、蓝条却停在一半」。
          progressCss = sliderProgressPercent + "%";
        ((lightSliderOutputElement.textContent = isSliderSupported
          ? "" + Math.round(sliderValue) + sliderSuffix
          : "不支持"),
          lightSliderInput.style.setProperty("--hb-light-slider-progress", progressCss),
          lightSliderInput.style.setProperty("--progress-pct", progressCss),
          lightSliderInput.style.setProperty("--progress", progressCss),
          lightSliderInput.style.setProperty("--range-progress", progressCss));
        // 亮度：琥珀进度填充。色温：保留暖→冷渐变，进度点之后盖灰（拇指右侧不露色）
        if (sliderPayloadKey === "brightness_pct") {
          lightSliderInput.style.background = `linear-gradient(90deg, #f4a816 0%, #f4a816 ${progressCss}, #343d44 ${progressCss}, #343d44 100%)`;
        } else if (sliderPayloadKey === "color_temp_kelvin") {
          lightSliderInput.style.background = `linear-gradient(90deg, transparent 0%, transparent ${progressCss}, #343d44 ${progressCss}, #343d44 100%), linear-gradient(90deg, #f4a816, #f6c76d 35%, #e5dfcf 57%, #72b9ed)`;
        }
        shouldNotifyChange &&
          isSliderSupported &&
          onLightVisualChange?.(
            sliderPayloadKey === "brightness_pct"
              ? {
                  brightnessPercent: sliderValue,
                }
              : {
                  colorTemperatureKelvin: sliderValue,
                  colorRgb: null as any,
                },
          );
      };
      (updateSliderValue(),
        lightSliderInput.addEventListener("input", () => {
          (resyncLightDetails(),
            updateSliderValue({
              notify: true,
            }));
        }),
        lightSliderInput.addEventListener("change", async () => {
          if (!(!isLightInteractive || !isSliderSupported))
            try {
              (await this.callEntityService("light", "turn_on", lightEntityId, {
                [sliderPayloadKey]: Number(lightSliderInput.value),
              }),
                onLightTurnOn?.());
            } catch (sliderCommitError: any) {
              (this.options.onError?.(sliderCommitError),
                (lightSliderOutputElement.textContent = "设置失败"));
            }
        }));
      const lightSliderLegend = document.createElement("span");
      lightSliderLegend.className = "hb-light-details-slider-legend";
      const lightSliderMinimumLabel = document.createElement("small");
      lightSliderMinimumLabel.textContent = sliderMinimumLabel;
      const lightSliderMaximumLabel = document.createElement("small");
      ((lightSliderMaximumLabel.textContent = sliderMaximumLabel),
        lightSliderLegend.append(lightSliderMinimumLabel, lightSliderMaximumLabel),
        lightSliderField.append(lightSliderHeading, lightSliderInput, lightSliderLegend),
        lightDetailsControlsElement.append(lightSliderField),
        sliderByPayloadKey.set(sliderPayloadKey, {
          root: lightSliderField,
          input: lightSliderInput,
          updateSliderValue: updateSliderValue,
          supported: isSliderSupported,
        }));
    };
    let lightColorPickerPanel: any = null,
      lightColorHs: any = null,
      isColorPickerBound = false;
    if (hasColorPicker) {
      const initialColorHs = lightColorHs2(lightStateAttributes) || [0, 0];
      ((lightColorHs = {
        hue: Number(initialColorHs[0]) || 0,
        saturation: Number(initialColorHs[1]) || 0,
      }),
        (lightColorPickerPanel = document.createElement("div")),
        (lightColorPickerPanel.className = "hb-light-color-picker"),
        lightColorPickerPanel.setAttribute("role", "slider"),
        lightColorPickerPanel.setAttribute("tabindex", isLightInteractive ? "0" : "-1"),
        lightColorPickerPanel.setAttribute("aria-label", "选择灯光颜色"));
      const colorPickerGlowIcon = document.createElement("i");
      colorPickerGlowIcon.className = "hb-light-color-picker-glow";
      const colorPickerHandleIcon = document.createElement("i");
      ((colorPickerHandleIcon.className = "hb-light-color-picker-handle"),
        lightColorPickerPanel.append(colorPickerGlowIcon, colorPickerHandleIcon));
      const measureColorPickerPoint = () =>
          lightColorPickerPointFromHs2([lightColorHs.hue, lightColorHs.saturation]),
        syncColorPicker = ({
          hue: nextHue = lightColorHs.hue,
          saturation: nextSaturation = lightColorHs.saturation,
        } = {}) => {
          ((lightColorHs.hue = (((Number(nextHue) || 0) % 360) + 360) % 360),
            (lightColorHs.saturation = Math.max(0, Math.min(100, Number(nextSaturation) || 0))));
          const colorPickerPoint = measureColorPickerPoint(),
            lightColorRgb = hsToRgbColor2([lightColorHs.hue, lightColorHs.saturation]),
            lightColorCss = "rgb(" + lightColorRgb!.join(",") + ")";
          (lightColorPickerPanel.style.setProperty(
            "--hb-light-color-picker-x",
            colorPickerPoint.x * 100 + "%",
          ),
            lightColorPickerPanel.style.setProperty(
              "--hb-light-color-picker-y",
              colorPickerPoint.y * 100 + "%",
            ),
            lightColorPickerPanel.style.setProperty("--hb-light-color-picker-color", lightColorCss),
            lightColorPickerPanel.setAttribute(
              "aria-valuetext",
              "色相 " +
                Math.round(lightColorHs.hue) +
                " 度，饱和度 " +
                Math.round(lightColorHs.saturation) +
                "%",
            ),
            onLightVisualChange?.({
              colorHs: [lightColorHs.hue, lightColorHs.saturation],
              colorRgb: lightColorRgb,
            }));
        },
        applyColorPickerPointer = (colorPointerEvent: any) => {
          const colorPickerRect = lightColorPickerPanel.getBoundingClientRect();
          if (!colorPickerRect.width || !colorPickerRect.height) return;
          const pickerX = Math.max(
              0,
              Math.min(
                1,
                (colorPointerEvent.clientX - colorPickerRect.left) / colorPickerRect.width,
              ),
            ),
            pickerY = Math.max(
              0,
              Math.min(
                1,
                (colorPointerEvent.clientY - colorPickerRect.top) / colorPickerRect.height,
              ),
            ),
            [pickedHue, pickedSaturation] = lightColorPickerHsFromPoint2(pickerX, pickerY);
          syncColorPicker({
            hue: pickedHue,
            saturation: pickedSaturation,
          });
        },
        commitColorPicker = async () => {
          if (!(!isLightInteractive || isColorPickerBound)) {
            ((isColorPickerBound = true), lightColorPickerPanel.setAttribute("aria-busy", "true"));
            try {
              (await this.callEntityService(
                "light",
                "turn_on",
                lightEntityId,
                lightColorServiceData2(lightStateAttributes, [
                  lightColorHs.hue,
                  lightColorHs.saturation,
                ]),
              ),
                onLightTurnOn?.());
            } catch (colorPickerError: any) {
              this.options.onError?.(colorPickerError);
            } finally {
              ((isColorPickerBound = false), lightColorPickerPanel.removeAttribute("aria-busy"));
            }
          }
        };
      (lightColorPickerPanel.addEventListener("pointerdown", (pickerPointerDownEvent: any) => {
        isLightInteractive &&
          (lightColorPickerPanel.setPointerCapture?.(pickerPointerDownEvent.pointerId),
          (lightColorPickerPanel.dataset.dragging = "true"),
          applyColorPickerPointer(pickerPointerDownEvent),
          pickerPointerDownEvent.preventDefault());
      }),
        lightColorPickerPanel.addEventListener("pointermove", (pickerPointerMoveEvent: any) => {
          lightColorPickerPanel.dataset.dragging === "true" &&
            applyColorPickerPointer(pickerPointerMoveEvent);
        }));
      const endColorPickerDrag = async (pickerPointerUpEvent: any) => {
        lightColorPickerPanel.dataset.dragging === "true" &&
          ((lightColorPickerPanel.dataset.dragging = "false"),
          lightColorPickerPanel.releasePointerCapture?.(pickerPointerUpEvent.pointerId),
          await commitColorPicker());
      };
      (lightColorPickerPanel.addEventListener("pointerup", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("pointercancel", endColorPickerDrag),
        lightColorPickerPanel.addEventListener("keydown", async (colorPickerKeyEvent: any) => {
          if (!isLightInteractive) return;
          const keyboardStep = colorPickerKeyEvent.shiftKey ? 10 : 3;
          let { hue: keyboardHue, saturation: keyboardSaturation }: any = lightColorHs;
          if (colorPickerKeyEvent.key === "ArrowLeft") keyboardHue -= keyboardStep;
          else {
            if (colorPickerKeyEvent.key === "ArrowRight") keyboardHue += keyboardStep;
            else {
              if (colorPickerKeyEvent.key === "ArrowUp") keyboardSaturation -= keyboardStep;
              else {
                if (colorPickerKeyEvent.key === "ArrowDown") keyboardSaturation += keyboardStep;
                else {
                  if (colorPickerKeyEvent.key === "Enter" || colorPickerKeyEvent.key === " ") {
                    (await commitColorPicker(), colorPickerKeyEvent.preventDefault());
                    return;
                  } else return;
                }
              }
            }
          }
          (syncColorPicker({
            hue: keyboardHue,
            saturation: keyboardSaturation,
          }),
            colorPickerKeyEvent.preventDefault());
        }),
        (lightColorPickerPanel.syncColorPicker = syncColorPicker),
        (lightColorPickerPanel.cleanupColorPicker = () => {
          lightColorPickerPanel.dataset.dragging = "false";
        }),
        syncColorPicker(),
        lightDetailsControlsElement.append(lightColorPickerPanel));
    }
    const maxMiredsKelvin = Number.isFinite(Number(lightStateAttributes.max_mireds))
        ? 1000000 / Number(lightStateAttributes.max_mireds)
        : 2000,
      minMiredsKelvin = Number.isFinite(Number(lightStateAttributes.min_mireds))
        ? 1000000 / Number(lightStateAttributes.min_mireds)
        : 6500,
      minColorTemperatureKelvin =
        Number(lightStateAttributes.min_color_temp_kelvin) || maxMiredsKelvin,
      maxColorTemperatureKelvin =
        Number(lightStateAttributes.max_color_temp_kelvin) || minMiredsKelvin,
      miredColorTemperatureKelvin = Number.isFinite(Number(lightStateAttributes.color_temp))
        ? 1000000 / Number(lightStateAttributes.color_temp)
        : minColorTemperatureKelvin,
      currentColorTemperatureKelvin =
        Number(lightStateAttributes.color_temp_kelvin) || miredColorTemperatureKelvin;
    (!hasColorPicker || supportsColorTemperature) &&
      syncLightSlider({
        label: "色温",
        value: currentColorTemperatureKelvin,
        minimum: Math.round(minColorTemperatureKelvin),
        maximum: Math.round(maxColorTemperatureKelvin),
        step: 50,
        suffix: "K",
        dataKey: "color_temp_kelvin",
        className: "hb-light-details-temperature",
        icon: "♨",
        minimumLabel: "暖色",
        maximumLabel: "冷色",
        supported: supportsColorTemperature,
      });
    const brightnessByte = Number.isFinite(Number(lightStateAttributes.brightness))
      ? (Number(lightStateAttributes.brightness) / 255) * 100
      : 100;
    syncLightSlider({
      label: "亮度",
      value: brightnessByte,
      minimum: 1,
      maximum: 100,
      step: 1,
      suffix: "%",
      dataKey: "brightness_pct",
      className: "hb-light-details-brightness",
      icon: "☀",
      minimumLabel: "暗",
      maximumLabel: "亮",
      supported: supportsBrightness,
    });
    let lightPresetPending: any = null,
      presetTimeoutTimer = 0,
      previousLightState = lightState;
    const resyncLightDetails = ({ resync: shouldResync = false } = {}) => {
        (window.clearTimeout(presetTimeoutTimer),
          (presetTimeoutTimer = 0),
          (lightPresetPending = null),
          shouldResync && lightDetailsControlsElement.syncLightState?.(previousLightState));
      },
      presetTimeoutTick = () => {
        if (
          (window.clearTimeout(presetTimeoutTimer), (presetTimeoutTimer = 0), !lightPresetPending)
        )
          return;
        const presetNowMs = Date.now(),
          presetDecision = lightPresetPendingDecision2(lightPresetPending, presetNowMs);
        if (presetDecision === "confirmed" || presetDecision === "timeout") {
          resyncLightDetails({
            resync: true,
          });
          return;
        }
        const presetHoldMs = lightPresetPending.latestMatches
          ? Math.min(
              lightPresetPending.expiresAt,
              Math.max(
                lightPresetPending.minimumHoldUntil,
                lightPresetPending.matchStartedAt + LIGHT_PRESET_STABLE_CONFIRMATION_MS2,
              ),
            )
          : lightPresetPending.expiresAt;
        presetTimeoutTimer = window.setTimeout(
          presetTimeoutTick,
          Math.max(50, presetHoldMs - presetNowMs),
        );
      },
      lightPresetDefinitions = LIGHT_DETAIL_PRESET_DEFINITIONS2,
      colorTemperatureFromPercent = (presetEntry: any) =>
        relativeLightColorTemperature2(
          minColorTemperatureKelvin,
          maxColorTemperatureKelvin,
          presetEntry.colorTemperaturePercent,
        ),
      lightPresetsBox = document.createElement("div");
    ((lightPresetsBox.className = "hb-light-details-presets"),
      (lightPresetsBox.hidden =
        hasColorPicker || (!supportsBrightness && !supportsColorTemperatureControl)));
    const lightPresetEntries = lightPresetDefinitions.map((presetDefinition) => {
      const lightPresetButton = document.createElement("button");
      ((lightPresetButton.type = "button"), (lightPresetButton.disabled = !startsWith3));
      const lightPresetLabel = document.createElement("strong");
      lightPresetLabel.textContent = presetDefinition.label;
      const lightPresetDetailElement = document.createElement("small");
      return (
        (lightPresetDetailElement.textContent = supportsBrightness
          ? presetDefinition.detail
          : "开启"),
        lightPresetButton.append(lightPresetLabel, lightPresetDetailElement),
        lightPresetButton.addEventListener("click", async () => {
          if (!isLightInteractive || !startsWith3) return;
          const presetColorTemperatureKelvin = colorTemperatureFromPercent(presetDefinition),
            lightPresetServicePayload: ComponentPayload = {};
          (supportsBrightness &&
            Object.assign(
              lightPresetServicePayload,
              lightPresetBrightnessServiceData2(presetDefinition.brightnessPercent),
            ),
            supportsColorTemperatureControl &&
              (lightPresetServicePayload.color_temp_kelvin = Math.round(
                presetColorTemperatureKelvin,
              )),
            window.clearTimeout(presetTimeoutTimer));
          const presetStartedAtMs = Date.now();
          ((lightPresetPending = {
            brightnessPercent: presetDefinition.brightnessPercent,
            colorTemperatureKelvin: presetColorTemperatureKelvin,
            minimumHoldUntil: presetStartedAtMs + LIGHT_PRESET_MINIMUM_HOLD_MS2,
            expiresAt: presetStartedAtMs + LIGHT_PRESET_MAXIMUM_HOLD_MS2,
            latestMatches: false,
            matchStartedAt: null as any,
          }),
            presetTimeoutTick());
          const brightnessSlider = sliderByPayloadKey.get("brightness_pct");
          brightnessSlider?.supported &&
            ((brightnessSlider.input.value = String(presetDefinition.brightnessPercent)),
            brightnessSlider.updateSliderValue({
              notify: true,
            }));
          const colorTemperatureSlider = sliderByPayloadKey.get("color_temp_kelvin");
          colorTemperatureSlider?.supported &&
            ((colorTemperatureSlider.input.value = String(presetColorTemperatureKelvin)),
            colorTemperatureSlider.updateSliderValue({
              notify: true,
            }));
          for (const presetControl of lightPresetEntries)
            presetControl.button.classList.toggle(
              "is-active",
              presetControl.button === lightPresetButton,
            );
          (onLightVisualChange?.({
            isOn: true,
            ...(supportsBrightness
              ? {
                  brightnessPercent: presetDefinition.brightnessPercent,
                }
              : {}),
            ...(supportsColorTemperatureControl
              ? {
                  colorTemperatureKelvin: presetColorTemperatureKelvin,
                }
              : {}),
          }),
            onLightTurnOn?.());
          try {
            await this.callEntityService(
              "light",
              "turn_on",
              lightEntityId,
              lightPresetServicePayload,
            );
          } catch (presetApplyError: any) {
            (resyncLightDetails({
              resync: true,
            }),
              lightPresetButton.classList.remove("is-active"),
              this.options.onError?.(presetApplyError));
          }
        }),
        lightPresetsBox.append(lightPresetButton),
        {
          button: lightPresetButton,
          ...presetDefinition,
        }
      );
    });
    (lightDetailsControlsElement.append(lightPresetsBox),
      lightDetailsControlsElement.prepend(lightModeSelect),
      lightDetailsControlsElement.classList.toggle(
        "has-mode-switch",
        lightControlModes.length > 1,
      ));
    const syncLightStateDetails = (nextLightDetailsState: any) => {
      const lightDetailsAttributes = nextLightDetailsState?.attributes || {},
        isLightOn = nextLightDetailsState?.state === "on",
        NaN3 = Number.isFinite(Number(lightDetailsAttributes.brightness))
          ? (Number(lightDetailsAttributes.brightness) / 255) * 100
          : NaN,
        NaN4 = Number.isFinite(Number(lightDetailsAttributes.color_temp))
          ? 1000000 / Number(lightDetailsAttributes.color_temp)
          : NaN,
        reportedColorTemperatureKelvin = Number(lightDetailsAttributes.color_temp_kelvin) || NaN4;
      for (const presetControlEntry of lightPresetEntries) {
        const presetColorTemperatureTarget = colorTemperatureFromPercent(presetControlEntry),
          colorTemperatureTolerance = Math.max(
            50,
            (maxColorTemperatureKelvin - minColorTemperatureKelvin) * 0.06,
          ),
          finite3 =
            !supportsBrightness ||
            (Number.isFinite(NaN3) && Math.abs(NaN3 - presetControlEntry.brightnessPercent) <= 4),
          finite4 =
            !supportsColorTemperatureControl ||
            (Number.isFinite(reportedColorTemperatureKelvin) &&
              Math.abs(reportedColorTemperatureKelvin - presetColorTemperatureTarget) <=
                colorTemperatureTolerance);
        presetControlEntry.button.classList.toggle("is-active", isLightOn && finite3 && finite4);
      }
    };
    return (
      syncLightStateDetails(lightState),
      (lightDetailsControlsElement.syncLightState = (lightStateArg) => {
        if (!lightStateArg) return;
        previousLightState = lightStateArg;
        const lightRealtimeAttributes = lightStateArg.attributes || {};
        lightRealtimeAttributes.color_mode &&
          applyLightMode(lightControlMode2(lightRealtimeAttributes.color_mode, lightControlModes));
        const colorTemperatureSliderControl = sliderByPayloadKey.get("color_temp_kelvin"),
          NaN5 = Number.isFinite(Number(lightRealtimeAttributes.color_temp))
            ? 1000000 / Number(lightRealtimeAttributes.color_temp)
            : NaN,
          realtimeColorTemperatureKelvin =
            Number(lightRealtimeAttributes.color_temp_kelvin) || NaN5,
          brightnessSliderControl = sliderByPayloadKey.get("brightness_pct"),
          NaN6 = Number.isFinite(Number(lightRealtimeAttributes.brightness))
            ? (Number(lightRealtimeAttributes.brightness) / 255) * 100
            : NaN;
        if (lightPresetPending) {
          const finite5 =
              !supportsBrightness ||
              (Number.isFinite(NaN6) && Math.abs(NaN6 - lightPresetPending.brightnessPercent) <= 4),
            finite6 =
              !supportsColorTemperatureControl ||
              (Number.isFinite(realtimeColorTemperatureKelvin) &&
                Math.abs(
                  realtimeColorTemperatureKelvin - lightPresetPending.colorTemperatureKelvin,
                ) <= 220),
            isLightStateMatching = finite5 && finite6;
          (isLightStateMatching &&
            !lightPresetPending.latestMatches &&
            (lightPresetPending.matchStartedAt = Date.now()),
            isLightStateMatching || (lightPresetPending.matchStartedAt = null),
            (lightPresetPending.latestMatches = isLightStateMatching),
            presetTimeoutTick());
        }
        const pendingColorTemperatureKelvin =
            lightPresetPending?.colorTemperatureKelvin ?? realtimeColorTemperatureKelvin,
          pendingBrightnessPercent = lightPresetPending?.brightnessPercent ?? NaN6;
        if (
          (colorTemperatureSliderControl?.supported &&
            Number.isFinite(pendingColorTemperatureKelvin) &&
            ((colorTemperatureSliderControl.input.value = String(pendingColorTemperatureKelvin)),
            colorTemperatureSliderControl.updateSliderValue()),
          brightnessSliderControl?.supported &&
            Number.isFinite(pendingBrightnessPercent) &&
            ((brightnessSliderControl.input.value = String(pendingBrightnessPercent)),
            brightnessSliderControl.updateSliderValue()),
          lightColorPickerPanel)
        ) {
          const realtimeColorHs = lightColorHs2(lightRealtimeAttributes);
          realtimeColorHs &&
            lightColorPickerPanel.syncColorPicker({
              hue: realtimeColorHs[0],
              saturation: realtimeColorHs[1],
            });
        }
        syncLightStateDetails(
          lightPresetPending
            ? {
                state: "on",
                attributes: {
                  ...lightRealtimeAttributes,
                  ...(supportsBrightness
                    ? {
                        brightness: (lightPresetPending.brightnessPercent / 100) * 255,
                      }
                    : {}),
                  ...(supportsColorTemperatureControl
                    ? {
                        color_temp_kelvin: lightPresetPending.colorTemperatureKelvin,
                      }
                    : {}),
                },
              }
            : lightStateArg,
        );
        const visualColorTemperature = lightVisualValueForCapability2(
            supportsColorTemperatureControl,
            pendingColorTemperatureKelvin,
            UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN2,
          ),
          visualBrightnessPercent = lightVisualValueForCapability2(
            supportsBrightness,
            pendingBrightnessPercent,
            UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT2,
          );
        onLightVisualChange?.({
          isOn: lightStateArg.state === "on",
          colorTemperatureKelvin: visualColorTemperature,
          brightnessPercent: visualBrightnessPercent,
          colorRgb: hasColorPicker ? lightColorRgb2(lightRealtimeAttributes) : null,
        });
      }),
      applyLightMode(currentLightMode),
      lightDetailsControlsElement.syncLightState(lightState),
      (lightDetailsControlsElement.cleanupLightDetails = () => {
        (resyncLightDetails(), lightColorPickerPanel?.cleanupColorPicker?.());
      }),
      lightDetailsControlsElement
    );
  }
