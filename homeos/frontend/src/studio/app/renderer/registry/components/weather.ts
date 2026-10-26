/** 天气渲染器（从 register-all 拆出）。 */
import { applyTextOutline, clampNumberWithFallback, normalizeCssColor } from "../_shared";
import { meteoconUrl, weatherVisual } from "../../controls/weather-chart-runtime";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("weather", {
      render(weatherComponent: any, weatherRenderEnvironment: any) {
        const weatherProperties = weatherComponent.properties || {},
          weatherEntityId = weatherComponent.bindings?.entity?.entityId || "",
          sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun",
          weatherEntityState = weatherRenderEnvironment.states.get(weatherEntityId),
          sunEntityState = weatherRenderEnvironment.states.get(sunEntityId)?.state || "",
          weatherAttributes = weatherEntityState?.attributes || {},
          [weatherIconSlug, weatherConditionLabel] = weatherVisual(
            weatherEntityState?.state,
            sunEntityState,
          ),
          weatherComponentElement = document.createElement("div");
        if (
          ((weatherComponentElement.className = "hb-weather-component"),
          (weatherComponentElement.style.gap =
            clampNumberWithFallback(weatherProperties.iconGap, 0, 300, 22) + "px"),
          (weatherComponentElement.style.opacity = String(
            clampNumberWithFallback(weatherProperties.opacity, 0, 1, 1),
          )),
          weatherProperties.iconVisible !== false)
        ) {
          const weatherIconElement = document.createElement("img");
          ((weatherIconElement.className = "hb-weather-icon"),
            (weatherIconElement.src = meteoconUrl(weatherIconSlug)),
            (weatherIconElement.alt = weatherConditionLabel),
            (weatherIconElement.draggable = false),
            (weatherIconElement.style.width =
              clampNumberWithFallback(weatherProperties.iconSize, 12, 500, 64) + "px"),
            (weatherIconElement.style.height =
              clampNumberWithFallback(weatherProperties.iconSize, 12, 500, 64) + "px"),
            weatherComponentElement.append(weatherIconElement));
        }
        const weatherContentElement = document.createElement("span");
        if (
          ((weatherContentElement.className = "hb-weather-content"),
          (weatherContentElement.style.gap =
            clampNumberWithFallback(weatherProperties.lineGap, 0, 200, 7) + "px"),
          weatherProperties.temperatureVisible !== false)
        ) {
          const temperatureElement = document.createElement("strong"),
            temperatureValue = Number(weatherAttributes.temperature),
            temperatureUnit = String(
              weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C",
            );
          ((temperatureElement.textContent = Number.isFinite(temperatureValue)
            ? "" + temperatureValue + temperatureUnit
            : "--" + temperatureUnit),
            (temperatureElement.style.color = normalizeCssColor(
              weatherProperties.temperatureColor,
              "#aeb3b7",
            )));
          const temperatureFontSize = clampNumberWithFallback(weatherProperties.temperatureSize, 12, 500, 32);
          ((temperatureElement.style.fontSize = temperatureFontSize + "px"),
            applyTextOutline(
              temperatureElement,
              weatherProperties.temperatureWeight,
              temperatureFontSize,
            ),
            (temperatureElement.style.letterSpacing =
              clampNumberWithFallback(weatherProperties.temperatureSpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(temperatureElement));
        }
        if (
          weatherProperties.conditionVisible !== false ||
          weatherProperties.humidityVisible !== false
        ) {
          const weatherDetailElement = document.createElement("small"),
            weatherDetailParts: any[] = [];
          weatherProperties.conditionVisible !== false &&
            weatherDetailParts.push(weatherConditionLabel);
          const humidityValue = Number(weatherAttributes.humidity);
          (weatherProperties.humidityVisible !== false &&
            weatherDetailParts.push(
              Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --",
            ),
            (weatherDetailElement.textContent = weatherDetailParts.join(" · ")),
            (weatherDetailElement.style.color = normalizeCssColor(
              weatherProperties.secondaryColor,
              "#8d9296",
            )));
          const weatherDetailFontSize = clampNumberWithFallback(weatherProperties.secondarySize, 10, 500, 18);
          ((weatherDetailElement.style.fontSize = weatherDetailFontSize + "px"),
            applyTextOutline(
              weatherDetailElement,
              weatherProperties.secondaryWeight,
              weatherDetailFontSize,
            ),
            (weatherDetailElement.style.letterSpacing =
              clampNumberWithFallback(weatherProperties.secondarySpacing, -20, 100, 1) + "px"),
            weatherContentElement.append(weatherDetailElement));
        }
        return (
          weatherContentElement.childElementCount &&
            weatherComponentElement.append(weatherContentElement),
          weatherComponentElement
        );
      },
    });
}

export default register;
