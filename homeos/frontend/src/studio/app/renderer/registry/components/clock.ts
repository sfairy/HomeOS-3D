/** 时钟 / 日期渲染器（从 register-all 拆出）。 */
import { applyTextOutline, clampNumberWithFallback, normalizeCssColor } from "../_shared";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate,
} from "../../controls/date-time-runtime";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("time", {
      render(timeComponent: any, timeRenderEnvironment: any) {
        const timeProperties = timeComponent.properties || {},
          timeFontSize = clampNumberWithFallback(timeProperties.fontSize, 12, 500, 96),
          timeComponentElement = document.createElement("time");
        ((timeComponentElement.className = "hb-time-component"),
          (timeComponentElement.style.color = normalizeCssColor(timeProperties.color, "#248eb2")),
          (timeComponentElement.style.fontSize = timeFontSize + "px"),
          (timeComponentElement.style.letterSpacing =
            clampNumberWithFallback(timeProperties.letterSpacing, -20, 100, 2.2) + "px"),
          (timeComponentElement.style.opacity = String(
            clampNumberWithFallback(timeProperties.opacity, 0, 1, 1),
          )));
        const timeValueElement = document.createElement("span");
        ((timeValueElement.className = "hb-time-value"),
          applyTextOutline(timeValueElement, timeProperties.fontWeight, timeFontSize));
        const timePeriodElement = document.createElement("small");
        ((timePeriodElement.className = "hb-time-period"),
          applyTextOutline(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5),
          timeComponentElement.append(timeValueElement, timePeriodElement));
        const updateClockDisplay = () => {
          const currentDate = new Date(),
            formattedTime = formatLocalTime(timeProperties, currentDate);
          ((timeComponentElement.dateTime = currentDate.toISOString()),
            (timeValueElement.textContent = formattedTime.value),
            (timePeriodElement.textContent = formattedTime.suffix),
            (timePeriodElement.hidden = !formattedTime.suffix));
        };
        updateClockDisplay();
        const clockTimerId = window.setInterval(
          updateClockDisplay,
          timeProperties.showSeconds === true ? 250 : 1000,
        );
        return (
          timeRenderEnvironment.cleanup(() => window.clearInterval(clockTimerId)),
          timeComponentElement
        );
      },
    });
  registerComponent("date", {
      render(dateComponent: any, dateRenderEnvironment: any) {
        const dateProperties = dateComponent.properties || {},
          dateComponentElement = document.createElement("div");
        ((dateComponentElement.className = "hb-date-component"),
          (dateComponentElement.style.opacity = String(clampNumberWithFallback(dateProperties.opacity, 0, 1, 1))),
          (dateComponentElement.style.gap = clampNumberWithFallback(dateProperties.lineGap, 0, 200, 8) + "px"));
        const datePrimaryElement = document.createElement("strong");
        ((datePrimaryElement.className = "hb-date-primary"),
          (datePrimaryElement.style.color = normalizeCssColor(
            dateProperties.primaryColor,
            "#8d9296",
          )));
        const primaryFontSize = clampNumberWithFallback(dateProperties.primarySize, 12, 500, 36);
        ((datePrimaryElement.style.fontSize = primaryFontSize + "px"),
          applyTextOutline(datePrimaryElement, dateProperties.primaryWeight, primaryFontSize),
          (datePrimaryElement.style.letterSpacing =
            clampNumberWithFallback(dateProperties.primarySpacing, -20, 100, 1) + "px"),
          dateComponentElement.append(datePrimaryElement));
        let lunarElement: any = null;
        if (dateProperties.showLunar === true) {
          ((lunarElement = document.createElement("small")),
            (lunarElement.className = "hb-date-lunar"),
            (lunarElement.style.color = normalizeCssColor(dateProperties.lunarColor, "#7f878c")));
          const lunarFontSize = clampNumberWithFallback(dateProperties.lunarSize, 10, 500, 24);
          ((lunarElement.style.fontSize = lunarFontSize + "px"),
            applyTextOutline(lunarElement, dateProperties.lunarWeight, lunarFontSize),
            (lunarElement.style.letterSpacing =
              clampNumberWithFallback(dateProperties.lunarSpacing, -20, 100, 1) + "px"),
            dateComponentElement.append(lunarElement));
        }
        const updateDateDisplay = () => {
          const nowDate = new Date();
          ((datePrimaryElement.textContent = formatLocalDate(dateProperties, nowDate)),
            lunarElement && (lunarElement.textContent = formatLunarDate(nowDate)));
        };
        updateDateDisplay();
        const dateTimerId = window.setInterval(updateDateDisplay, 30000);
        return (
          dateRenderEnvironment.cleanup(() => window.clearInterval(dateTimerId)),
          dateComponentElement
        );
      },
    });
}

export default register;
