/**
 * `weather` 控件：天气图标与曲线，配色走 `controls/weather-chart-runtime.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609222006";
import {
  meteoconUrl,
  weatherVisual
} from "../../../controls/weather-chart-runtime.js?v=2609222006";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609222006";
// 同门分片：registry-visuals
import {
  applyFontWeight,
  resolveColor
} from "../registry-visuals.js?v=2609222006";

// 天气控件：图标与文案由 weatherVisual 映射，并结合太阳实体判断昼夜切换夜间图标。
registerComponent("weather", {
  render(weatherComponent, weatherContext) {
    const weatherProperties = weatherComponent.properties || {};
    const weatherEntityId = weatherComponent.bindings?.entity?.entityId || "";
    const sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun";
    const weatherState = weatherContext.states.get(weatherEntityId);
    const sunStateText = weatherContext.states.get(sunEntityId)?.state || "";
    const weatherAttributes = weatherState?.attributes || {};
    const [weatherIconName, weatherConditionLabel] = weatherVisual(
      weatherState?.state,
      sunStateText
    );
    const weatherElement = document.createElement("div");
    weatherElement.className = "hb-weather-component";
    weatherElement.style.gap = clampCoercedNumber(weatherProperties.iconGap, 0, 300, 22) + "px";
    weatherElement.style.opacity = String(clampCoercedNumber(weatherProperties.opacity, 0, 1, 1));
    if (weatherProperties.iconVisible !== false) {
      const weatherIconElement = document.createElement("img");
      weatherIconElement.className = "hb-weather-icon";
      weatherIconElement.src = meteoconUrl(weatherIconName);
      weatherIconElement.alt = weatherConditionLabel;
      weatherIconElement.draggable = false;
      weatherIconElement.style.width = clampCoercedNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherIconElement.style.height = clampCoercedNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherElement.append(weatherIconElement);
    }
    const weatherContentElement = document.createElement("span");
    weatherContentElement.className = "hb-weather-content";
    weatherContentElement.style.gap = clampCoercedNumber(weatherProperties.lineGap, 0, 200, 7) + "px";
    if (weatherProperties.temperatureVisible !== false) {
      const weatherTemperatureElement = document.createElement("strong");
      const temperatureValue = Number(weatherAttributes.temperature);
      const temperatureUnit = String(
        weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C"
      );
      weatherTemperatureElement.textContent = Number.isFinite(temperatureValue)
        ? "" + temperatureValue + temperatureUnit
        : "--" + temperatureUnit;
      weatherTemperatureElement.style.color = resolveColor(
        weatherProperties.temperatureColor,
        "#aeb3b7"
      );
      const temperatureFontSize = clampCoercedNumber(weatherProperties.temperatureSize, 12, 500, 32);
      weatherTemperatureElement.style.fontSize = temperatureFontSize + "px";
      applyFontWeight(
        weatherTemperatureElement,
        weatherProperties.temperatureWeight,
        temperatureFontSize
      );
      weatherTemperatureElement.style.letterSpacing =
        clampCoercedNumber(weatherProperties.temperatureSpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherTemperatureElement);
    }
    if (
      weatherProperties.conditionVisible !== false ||
      weatherProperties.humidityVisible !== false
    ) {
      const weatherSecondaryElement = document.createElement("small");
      const weatherSecondaryParts = [];
      if (weatherProperties.conditionVisible !== false) {
        weatherSecondaryParts.push(weatherConditionLabel);
      }
      const humidityValue = Number(weatherAttributes.humidity);
      if (weatherProperties.humidityVisible !== false) {
        weatherSecondaryParts.push(
          Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --"
        );
      }
      weatherSecondaryElement.textContent = weatherSecondaryParts.join(" · ");
      weatherSecondaryElement.style.color = resolveColor(
        weatherProperties.secondaryColor,
        "#8d9296"
      );
      const weatherSecondaryFontSize = clampCoercedNumber(weatherProperties.secondarySize, 10, 500, 18);
      weatherSecondaryElement.style.fontSize = weatherSecondaryFontSize + "px";
      applyFontWeight(
        weatherSecondaryElement,
        weatherProperties.secondaryWeight,
        weatherSecondaryFontSize
      );
      weatherSecondaryElement.style.letterSpacing =
        clampCoercedNumber(weatherProperties.secondarySpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherSecondaryElement);
    }
    if (weatherContentElement.childElementCount) {
      weatherElement.append(weatherContentElement);
    }
    return weatherElement;
  }
});
