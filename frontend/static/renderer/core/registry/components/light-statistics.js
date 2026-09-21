/**
 * `light-statistics` 控件：灯具统计摘要，统计口径在 `controls/light-statistics-runtime.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609211953";
import { mdiIconUrl } from "../../../../utils/icon-url.js?v=2609211953";
// 「点亮数量」的激活色默认取全站主控色（见 design/scene/page.css）。
import { paletteColor } from "../../../../utils/colors.js?v=2609211953";
import { lightStatisticsSummary } from "../../../controls/light-statistics-runtime.js?v=2609211953";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609211953";
// 同门分片：registry-visuals
import {
  applyFontWeight,
  componentContentUnitsPx,
  resolveColor
} from "../registry-visuals.js?v=2609211953";

// 灯光统计控件：把实体列表交给 lightStatisticsSummary 汇总后渲染，
// 统计口径（哪些实体能统计、异常怎么算）全部在 light-statistics-runtime.js 里。
registerComponent("light-statistics", {
  render(statisticsComponent, statisticsContext) {
    const statisticsProperties = statisticsComponent.properties || {};
    const lightSummary = lightStatisticsSummary(
      statisticsProperties.entityIds,
      statisticsContext.states,
      statisticsContext.entityMetadata
    );
    const { width: statisticsWidth, height: statisticsHeight } = componentContentUnitsPx(
      statisticsComponent,
      statisticsContext
    );
    const statisticsElement = document.createElement("div");
    statisticsElement.className = "hb-light-statistics";
    statisticsElement.classList.toggle("active", lightSummary.on > 0);
    statisticsElement.dataset.total = String(lightSummary.total);
    statisticsElement.dataset.on = String(lightSummary.on);
    statisticsElement.dataset.off = String(lightSummary.off);
    statisticsElement.dataset.abnormal = String(lightSummary.abnormal);
    statisticsElement.style.setProperty(
      "--light-statistics-icon-size",
      clampCoercedNumber(statisticsProperties.iconSize, 1, 100, 42) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-size",
      clampCoercedNumber(statisticsProperties.titleSize, 8, 200, 32) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-spacing",
      clampCoercedNumber(statisticsProperties.titleSpacing, -20, 100, 1.2) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-size",
      clampCoercedNumber(statisticsProperties.countSize, 8, 200, 34) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-spacing",
      clampCoercedNumber(statisticsProperties.countSpacing, -20, 100, 0) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-gap",
      clampCoercedNumber(statisticsProperties.iconGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-gap",
      clampCoercedNumber(statisticsProperties.countGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-color",
      resolveColor(statisticsProperties.iconColor, "#8b9298")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-active-color",
      resolveColor(statisticsProperties.iconActiveColor, paletteColor("--hos-accent", "#5fd4ff"))
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-color",
      resolveColor(statisticsProperties.titleColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-color",
      resolveColor(statisticsProperties.countColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-active-color",
      resolveColor(statisticsProperties.countActiveColor, paletteColor("--hos-accent", "#5fd4ff"))
    );
    const statisticsIconName = Object.prototype.hasOwnProperty.call(statisticsProperties, "icon")
      ? String(statisticsProperties.icon || "")
      : "mdi:lightbulb-group-outline";
    const statisticsIconSource = mdiIconUrl(statisticsIconName);
    const hasStatisticsIcon = statisticsProperties.iconVisible !== false && !!statisticsIconSource;
    const hasStatisticsTitle = statisticsProperties.titleVisible !== false;
    const hasStatisticsCount = statisticsProperties.countVisible !== false;
    statisticsElement.classList.toggle("has-icon", hasStatisticsIcon);
    statisticsElement.classList.toggle("has-title", hasStatisticsTitle);
    statisticsElement.classList.toggle("has-count", hasStatisticsCount);
    if (hasStatisticsIcon) {
      const statisticsIconElement = document.createElement("i");
      statisticsIconElement.className = "hb-light-statistics-icon";
      statisticsIconElement.style.maskImage = 'url("' + statisticsIconSource + '")';
      statisticsIconElement.style.webkitMaskImage = 'url("' + statisticsIconSource + '")';
      statisticsElement.append(statisticsIconElement);
    }
    if (hasStatisticsTitle) {
      const statisticsTitleElement = document.createElement("strong");
      statisticsTitleElement.className = "hb-light-statistics-title";
      statisticsTitleElement.textContent = String(statisticsProperties.title || "数量");
      applyFontWeight(
        statisticsTitleElement,
        statisticsProperties.titleWeight,
        clampCoercedNumber(statisticsProperties.titleSize, 8, 200, 32)
      );
      statisticsElement.append(statisticsTitleElement);
    }
    if (hasStatisticsCount) {
      const statisticsCountElement = document.createElement("span");
      statisticsCountElement.className = "hb-light-statistics-count";
      const statisticsCountValueElement = document.createElement("b");
      statisticsCountValueElement.textContent = lightSummary.total ? String(lightSummary.on) : "--";
      applyFontWeight(
        statisticsCountValueElement,
        statisticsProperties.countWeight,
        clampCoercedNumber(statisticsProperties.countSize, 8, 200, 34)
      );
      statisticsCountElement.append(statisticsCountValueElement);
      if (lightSummary.total) {
        const statisticsCountTotalElement = document.createElement("em");
        statisticsCountTotalElement.textContent = " / " + lightSummary.total;
        statisticsCountElement.append(statisticsCountTotalElement);
      }
      statisticsElement.append(statisticsCountElement);
    }
    return statisticsElement;
  }
});
