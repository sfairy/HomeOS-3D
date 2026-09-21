/**
 * `date` 控件：本地日期与农历。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609211953";
import {
  formatLocalDate,
  formatLunarDate
} from "../../../controls/date-time-runtime.js?v=2609211953";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609211953";
// 同门分片：registry-visuals
import {
  applyFontWeight,
  resolveColor
} from "../registry-visuals.js?v=2609211953";

// 日期控件：主行日期 + 可选星期 / 农历，同样由运行时定时刷新。
registerComponent("date", {
  render(dateComponent, dateContext) {
    const dateProperties = dateComponent.properties || {};
    const dateElement = document.createElement("div");
    dateElement.className = "hb-date-component";
    dateElement.style.opacity = String(clampCoercedNumber(dateProperties.opacity, 0, 1, 1));
    dateElement.style.gap = clampCoercedNumber(dateProperties.lineGap, 0, 200, 8) + "px";
    const datePrimaryElement = document.createElement("strong");
    datePrimaryElement.className = "hb-date-primary";
    datePrimaryElement.style.color = resolveColor(dateProperties.primaryColor, "#8d9296");
    const datePrimarySize = clampCoercedNumber(dateProperties.primarySize, 12, 500, 36);
    datePrimaryElement.style.fontSize = datePrimarySize + "px";
    applyFontWeight(datePrimaryElement, dateProperties.primaryWeight, datePrimarySize);
    datePrimaryElement.style.letterSpacing =
      clampCoercedNumber(dateProperties.primarySpacing, -20, 100, 1) + "px";
    dateElement.append(datePrimaryElement);
    let lunarElement = null;
    if (dateProperties.showLunar === true) {
      lunarElement = document.createElement("small");
      lunarElement.className = "hb-date-lunar";
      lunarElement.style.color = resolveColor(dateProperties.lunarColor, "#7f878c");
      const dateLunarSize = clampCoercedNumber(dateProperties.lunarSize, 10, 500, 24);
      lunarElement.style.fontSize = dateLunarSize + "px";
      applyFontWeight(lunarElement, dateProperties.lunarWeight, dateLunarSize);
      lunarElement.style.letterSpacing =
        clampCoercedNumber(dateProperties.lunarSpacing, -20, 100, 1) + "px";
      dateElement.append(lunarElement);
    }
    // 刷新日期文案。30 秒一次足够：日期与农历都以「天」为最小变化单位，
    // 轮询只是为了让跨零点时能在半分钟内自动翻页，无需按秒刷新。
    const updateDateDisplay = () => {
      const todayDate = new Date();
      datePrimaryElement.textContent = formatLocalDate(dateProperties, todayDate);
      if (lunarElement) {
        lunarElement.textContent = formatLunarDate(todayDate);
      }
    };
    updateDateDisplay();
    const dateIntervalId = window.setInterval(updateDateDisplay, 30000);
    dateContext.cleanup(() => window.clearInterval(dateIntervalId));
    return dateElement;
  }
});
