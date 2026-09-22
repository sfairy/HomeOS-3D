/**
 * `air-conditioner` 控件：温控主体，气流层在 `airflow.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609221053";
import {
  climateDefaultIcon,
  resolveClimateDeviceType
} from "../../../controls/climate.js?v=2609221053";
// 状态条目归一统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609221053";
import { mdiIconUrl } from "../../../../utils/icon-url.js?v=2609221053";
// 同门分片：entity-state
import {
  isClimateDeviceActive,
  resolveClimateLabel
} from "../entity-state.js?v=2609221053";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609221053";
// 同门分片：registry-visuals
import {
  applyFontWeight,
  componentContentUnitsPx,
  paletteColor,
  resolveColor
} from "../registry-visuals.js?v=2609221053";

// 空调 / 浴霸控件：本体内绘制出风图层，弹窗里再展开完整控制面板。
registerComponent("air-conditioner", {
  render(airConditionerComponent, airConditionerContext) {
    const airConditionerProperties = airConditionerComponent.properties || {};
    const airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "";
    const airConditionerState = resolveStateEntry(
      airConditionerContext.states?.get(airConditionerEntityId)
    );
    const airConditionerDeviceType = resolveClimateDeviceType(
      airConditionerComponent,
      airConditionerState,
      airConditionerEntityId
    );
    const isAirConditionerActive = isClimateDeviceActive(
      airConditionerComponent,
      airConditionerContext
    );
    const { height: airConditionerUnitPx } = componentContentUnitsPx(
      airConditionerComponent,
      airConditionerContext
    );
    const airConditionerElement = document.createElement("div");
    airConditionerElement.className =
      "hb-air-conditioner" + (isAirConditionerActive ? " active" : "");
    airConditionerElement.style.setProperty(
      "--climate-icon-left",
      clampCoercedNumber(airConditionerProperties.iconLeft, -100, 200, 20) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-icon-top",
      clampCoercedNumber(airConditionerProperties.iconTop, -100, 200, 50) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-left",
      clampCoercedNumber(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-top",
      clampCoercedNumber(airConditionerProperties.mainTextTop, -100, 200, 40) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-left",
      clampCoercedNumber(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-top",
      clampCoercedNumber(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-color",
      resolveColor(airConditionerProperties.badgeColor, "#5b5e66")
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-opacity",
      clampCoercedNumber(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
    );
    const airConditionerIconColor = resolveColor(
      isAirConditionerActive
        ? airConditionerProperties.iconOnColor
        : airConditionerProperties.iconOffColor,
      isAirConditionerActive ? paletteColor("--hos-cool", "#58c4ff") : "#9aa5ad"
    );
    airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor);
    airConditionerElement.style.setProperty(
      "--climate-icon-glow-size",
      airConditionerUnitPx * 7 + "px"
    );
    const airConditionerBadgeSize = clampCoercedNumber(airConditionerProperties.badgeSize, 1, 100, 28);
    const airConditionerSymbolSize = clampCoercedNumber(airConditionerProperties.symbolSize, 1, 100, 14);
    if (airConditionerProperties.iconVisible !== false) {
      const airConditionerBadgeElement = document.createElement("span");
      airConditionerBadgeElement.className = "hb-air-conditioner-icon-badge";
      airConditionerBadgeElement.style.width =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      airConditionerBadgeElement.style.height =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      const airConditionerIconName = String(airConditionerProperties.icon || "");
      const airConditionerResolvedIconName =
        airConditionerDeviceType === "bath-heater" &&
        (!airConditionerIconName || airConditionerIconName === "mdi:air-conditioner")
          ? climateDefaultIcon(airConditionerDeviceType)
          : airConditionerIconName || climateDefaultIcon(airConditionerDeviceType);
      const airConditionerIconSource = mdiIconUrl(airConditionerResolvedIconName);
      if (airConditionerIconSource) {
        const airConditionerIconElement = document.createElement("i");
        airConditionerIconElement.className = "hb-air-conditioner-icon";
        const airConditionerSymbolPercent = clampCoercedNumber(
          (airConditionerSymbolSize / airConditionerBadgeSize) * 100,
          1,
          100,
          50
        );
        airConditionerIconElement.style.width = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.height = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.backgroundColor = airConditionerIconColor;
        airConditionerIconElement.style.maskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerIconElement.style.webkitMaskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerBadgeElement.append(airConditionerIconElement);
      }
      airConditionerElement.append(airConditionerBadgeElement);
    }
    const airConditionerTextElement = document.createElement("span");
    airConditionerTextElement.className = "hb-air-conditioner-text";
    const airConditionerMainTextSize = clampCoercedNumber(airConditionerProperties.mainSize, 6, 120, 21);
    const airConditionerMainTextElement = document.createElement("strong");
    airConditionerMainTextElement.textContent =
      String(airConditionerProperties.mainText || "").trim() ||
      String(
        airConditionerState?.attributes?.friendly_name ||
          airConditionerEntityId ||
          (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体")
      );
    airConditionerMainTextElement.style.color = resolveColor(
      airConditionerProperties.mainColor,
      "#c7c8cb"
    );
    airConditionerMainTextElement.style.fontSize =
      airConditionerMainTextSize * airConditionerUnitPx + "px";
    airConditionerMainTextElement.style.letterSpacing =
      clampCoercedNumber(airConditionerProperties.mainSpacing, -20, 100, 0.5) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerMainTextElement,
      airConditionerProperties.mainWeight,
      airConditionerMainTextSize
    );
    const airConditionerSecondaryTextSize = clampCoercedNumber(
      airConditionerProperties.secondarySize,
      5,
      80,
      12
    );
    const airConditionerSecondaryTextElement = document.createElement("small");
    airConditionerSecondaryTextElement.textContent = airConditionerEntityId
      ? resolveClimateLabel(airConditionerComponent, airConditionerContext)
      : "未选择实体";
    airConditionerSecondaryTextElement.style.color = resolveColor(
      airConditionerProperties.secondaryColor,
      "#75777d"
    );
    airConditionerSecondaryTextElement.style.fontSize =
      airConditionerSecondaryTextSize * airConditionerUnitPx + "px";
    airConditionerSecondaryTextElement.style.letterSpacing =
      clampCoercedNumber(airConditionerProperties.secondarySpacing, -20, 100, 0.3) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerSecondaryTextElement,
      airConditionerProperties.secondaryWeight,
      airConditionerSecondaryTextSize
    );
    if (airConditionerProperties.mainTextVisible !== false) {
      airConditionerTextElement.append(airConditionerMainTextElement);
    }
    if (airConditionerProperties.secondaryTextVisible !== false) {
      airConditionerTextElement.append(airConditionerSecondaryTextElement);
    }
    if (airConditionerTextElement.childElementCount) {
      airConditionerElement.append(airConditionerTextElement);
    }
    return airConditionerElement;
  }
});
