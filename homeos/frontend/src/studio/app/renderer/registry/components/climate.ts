/** 空调 / 浴霸渲染器（从 register-all 拆出）。 */
import {
  applyTextOutline,
  clampNumberWithFallback,
  normalizeCssColor,
  resolveMdiIconUrl,
  resolveStatePayload,
} from "../_shared";
import { climateDefaultIcon, resolveClimateDeviceType } from "../../controls/climate";
import { formatClimateStateLabel, isClimatePoweredOn } from "../cover-climate-state";
import { componentContentUnitsPx } from "../content-units";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("air-conditioner", {
      render(airConditionerComponent: any, airConditionerRenderEnvironment: any) {
        const airConditionerProperties = airConditionerComponent.properties || {},
          airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "",
          airConditionerEntityState = resolveStatePayload(
            airConditionerRenderEnvironment.states?.get(airConditionerEntityId),
          ),
          airConditionerDeviceType = resolveClimateDeviceType(
            airConditionerComponent,
            airConditionerEntityState,
            airConditionerEntityId,
          ),
          isClimatePowered = isClimatePoweredOn(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          { height: contentUnitHeight } = componentContentUnitsPx(
            airConditionerComponent,
            airConditionerRenderEnvironment,
          ),
          airConditionerElement = document.createElement("div");
        ((airConditionerElement.className =
          "hb-air-conditioner" + (isClimatePowered ? " active" : "")),
          airConditionerElement.style.setProperty(
            "--climate-icon-left",
            clampNumberWithFallback(airConditionerProperties.iconLeft, -100, 200, 20) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-icon-top",
            clampNumberWithFallback(airConditionerProperties.iconTop, -100, 200, 50) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-left",
            clampNumberWithFallback(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-main-top",
            clampNumberWithFallback(airConditionerProperties.mainTextTop, -100, 200, 40) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-left",
            clampNumberWithFallback(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-secondary-top",
            clampNumberWithFallback(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%",
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-color",
            normalizeCssColor(airConditionerProperties.badgeColor, "#5b5e66"),
          ),
          airConditionerElement.style.setProperty(
            "--climate-badge-opacity",
            clampNumberWithFallback(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
          ));
        const airConditionerIconColor = normalizeCssColor(
          isClimatePowered
            ? airConditionerProperties.iconOnColor
            : airConditionerProperties.iconOffColor,
          isClimatePowered ? "#73c8ff" : "#9aa5ad",
        );
        (airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor),
          airConditionerElement.style.setProperty(
            "--climate-icon-glow-size",
            7 * contentUnitHeight + "px",
          ));
        const badgeSizePx = clampNumberWithFallback(airConditionerProperties.badgeSize, 1, 100, 28),
          symbolSizePx = clampNumberWithFallback(airConditionerProperties.symbolSize, 1, 100, 14);
        if (airConditionerProperties.iconVisible !== false) {
          const iconBadgeElement = document.createElement("span");
          ((iconBadgeElement.className = "hb-air-conditioner-icon-badge"),
            (iconBadgeElement.style.width = badgeSizePx * contentUnitHeight + "px"),
            (iconBadgeElement.style.height = badgeSizePx * contentUnitHeight + "px"));
          const configuredIconName = String(airConditionerProperties.icon || ""),
            resolvedIconName =
              airConditionerDeviceType === "bath-heater" &&
              (!configuredIconName || configuredIconName === "mdi:air-conditioner")
                ? climateDefaultIcon(airConditionerDeviceType)
                : configuredIconName || climateDefaultIcon(airConditionerDeviceType),
            resolvedIconUrl = resolveMdiIconUrl(resolvedIconName);
          if (resolvedIconUrl) {
            const airConditionerIconElement = document.createElement("i");
            airConditionerIconElement.className = "hb-air-conditioner-icon";
            const iconScalePercent = clampNumberWithFallback((symbolSizePx / badgeSizePx) * 100, 1, 100, 50);
            ((airConditionerIconElement.style.width = iconScalePercent + "%"),
              (airConditionerIconElement.style.height = iconScalePercent + "%"),
              (airConditionerIconElement.style.backgroundColor = airConditionerIconColor),
              airConditionerIconElement.style.setProperty(
                "mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              airConditionerIconElement.style.setProperty(
                "-webkit-mask-image",
                'url("' + resolvedIconUrl + '")',
              ),
              iconBadgeElement.append(airConditionerIconElement));
          }
          airConditionerElement.append(iconBadgeElement);
        }
        const airConditionerTextElement = document.createElement("span");
        airConditionerTextElement.className = "hb-air-conditioner-text";
        const mainTextSizePx = clampNumberWithFallback(airConditionerProperties.mainSize, 6, 120, 21),
          airConditionerMainTextElement = document.createElement("strong");
        ((airConditionerMainTextElement.textContent =
          String(airConditionerProperties.mainText || "").trim() ||
          String(
            airConditionerEntityState?.attributes?.friendly_name ||
              airConditionerEntityId ||
              (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体"),
          )),
          (airConditionerMainTextElement.style.color = normalizeCssColor(
            airConditionerProperties.mainColor,
            "#c7c8cb",
          )),
          (airConditionerMainTextElement.style.fontSize = mainTextSizePx * contentUnitHeight + "px"),
          (airConditionerMainTextElement.style.letterSpacing =
            clampNumberWithFallback(airConditionerProperties.mainSpacing, -20, 100, 0.5) * contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerMainTextElement,
            airConditionerProperties.mainWeight,
            mainTextSizePx,
          ));
        const secondaryTextSizePx = clampNumberWithFallback(airConditionerProperties.secondarySize, 5, 80, 12),
          airConditionerSecondaryTextElement = document.createElement("small");
        return (
          (airConditionerSecondaryTextElement.textContent = airConditionerEntityId
            ? formatClimateStateLabel(airConditionerComponent, airConditionerRenderEnvironment)
            : "未选择实体"),
          (airConditionerSecondaryTextElement.style.color = normalizeCssColor(
            airConditionerProperties.secondaryColor,
            "#75777d",
          )),
          (airConditionerSecondaryTextElement.style.fontSize =
            secondaryTextSizePx * contentUnitHeight + "px"),
          (airConditionerSecondaryTextElement.style.letterSpacing =
            clampNumberWithFallback(airConditionerProperties.secondarySpacing, -20, 100, 0.3) *
              contentUnitHeight +
            "px"),
          applyTextOutline(
            airConditionerSecondaryTextElement,
            airConditionerProperties.secondaryWeight,
            secondaryTextSizePx,
          ),
          airConditionerProperties.mainTextVisible !== false &&
            airConditionerTextElement.append(airConditionerMainTextElement),
          airConditionerProperties.secondaryTextVisible !== false &&
            airConditionerTextElement.append(airConditionerSecondaryTextElement),
          airConditionerTextElement.childElementCount &&
            airConditionerElement.append(airConditionerTextElement),
          airConditionerElement
        );
      },
    });
}

export default register;
