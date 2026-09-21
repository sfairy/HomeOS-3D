/**
 * `time` 控件：本地时间（走 `controls/date-time-runtime.js`，不用浏览器本地时区猜测）。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=20260921122709";
import { formatLocalTime } from "../../../controls/date-time-runtime.js?v=20260921122709";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=20260921122709";
// 同门分片：registry-visuals
import {
  applyFontWeight,
  resolveColor
} from "../registry-visuals.js?v=20260921122709";

// 时间控件：文案由 date-time-runtime 格式化，运行时由 home.js 定时触发重绘。
registerComponent("time", {
  render(timeComponent, timeContext) {
    const timeProperties = timeComponent.properties || {};
    const timeFontSize = clampCoercedNumber(timeProperties.fontSize, 12, 500, 96);
    const timeElement = document.createElement("time");
    timeElement.className = "hb-time-component";
    timeElement.style.color = resolveColor(timeProperties.color, "#248eb2");
    timeElement.style.fontSize = timeFontSize + "px";
    timeElement.style.letterSpacing =
      clampCoercedNumber(timeProperties.letterSpacing, -20, 100, 2.2) + "px";
    timeElement.style.opacity = String(clampCoercedNumber(timeProperties.opacity, 0, 1, 1));
    const timeValueElement = document.createElement("span");
    timeValueElement.className = "hb-time-value";
    applyFontWeight(timeValueElement, timeProperties.fontWeight, timeFontSize);
    const timePeriodElement = document.createElement("small");
    timePeriodElement.className = "hb-time-period";
    applyFontWeight(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5);
    timeElement.append(timeValueElement, timePeriodElement);
    // 刷新显示的时钟文案。这里自己起定时器而不依赖外层重绘：
    // 秒级显示用 250ms 轮询，是为了让「跳秒」看起来更接近整秒切换而不是漂移。
    const updateTimeDisplay = () => {
      const nowDate = new Date();
      const formattedLocalTime = formatLocalTime(timeProperties, nowDate);
      timeElement.dateTime = nowDate.toISOString();
      timeValueElement.textContent = formattedLocalTime.value;
      timePeriodElement.textContent = formattedLocalTime.suffix;
      timePeriodElement.hidden = !formattedLocalTime.suffix;
    };
    updateTimeDisplay();
    const timeIntervalId = window.setInterval(
      updateTimeDisplay,
      timeProperties.showSeconds === true ? 250 : 1000
    );
    timeContext.cleanup(() => window.clearInterval(timeIntervalId));
    return timeElement;
  }
});
