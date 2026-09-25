/**
 * `title-button` 控件：标题 / 副标题 / 图标与字号，支持模板变量替换。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609251801";
import { mdiIconUrl } from "../../../../utils/icon-url.js?v=2609251801";
// 标记点默认色取全站主控色（见 design/scene/page.css）。
import { paletteColor } from "../../../../utils/colors.js?v=2609251801";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609251801";
// 同门分片：registry-visuals
import {
  appendSvgElement,
  applyFontWeight,
  componentContentUnitsPx,
  resolveColor
} from "../registry-visuals.js?v=2609251801";

// 标题按钮控件：纯展示 + 外框装饰，尺寸单位统一由 componentContentUnitsPx 换算。
registerComponent("title-button", {
  render(titleComponent, titleContext) {
    const titleProperties = titleComponent.properties || {};
    const isHiddenContentClickable = titleProperties.hiddenContentClickable === true;
    const titleWidth = Math.max(20, Number(titleComponent.position?.width || 500));
    const titleHeight = Math.max(20, Number(titleComponent.position?.height || 122));
    const { height: titleUnitPx } = componentContentUnitsPx(titleComponent, titleContext);
    const titleElement = document.createElement("div");
    titleElement.className = "hb-title-button";
    // 这里**刻意不写** --title-frame-color / -width / -offset-x / -offset-y。
    // 那四枚曾经存在过（早期用 CSS 画外框的方案），但现在的外框是一段内联 SVG：
    // 颜色直接落成 path 的 stroke 属性、宽度落成 stroke-width、两个偏移参与算出
    // 括号的坐标（见下面 titleFrameOffsetXPx / titleFrameOffsetYPx）。也就是说这四项
    // 输入已经在 JS 里被消费完了，再写进元素的 style 只是没人读的死壳
    // （tools/check_invariants.mjs 第 10 条会拦下这类「写了没人读」的变量）。
    // 其余 --title-* 变量不同：它们由 renderer.css 的 .hb-title-button-* 规则取用。
    titleElement.style.setProperty(
      "--title-main-size",
      clampCoercedNumber(titleProperties.mainSize, 8, 200, 34) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-size",
      clampCoercedNumber(titleProperties.secondarySize, 6, 100, 12) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-spacing",
      clampCoercedNumber(titleProperties.mainSpacing, -20, 100, 1) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-spacing",
      clampCoercedNumber(titleProperties.secondarySpacing, -20, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-line-gap",
      clampCoercedNumber(titleProperties.secondaryLineGap, 0, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-left",
      clampCoercedNumber(titleProperties.mainTextLeft, -100, 200, 5.5) + "%"
    );
    titleElement.style.setProperty(
      "--title-main-top",
      clampCoercedNumber(titleProperties.mainTextTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-left",
      clampCoercedNumber(titleProperties.secondaryTextLeft, -100, 200, 54) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-top",
      clampCoercedNumber(titleProperties.secondaryTextTop, -100, 200, 43) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-size",
      clampCoercedNumber(titleProperties.iconSize, 1, 100, 30) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-icon-left",
      clampCoercedNumber(titleProperties.iconLeft, -100, 200, 50) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-top",
      clampCoercedNumber(titleProperties.iconTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-left",
      clampCoercedNumber(titleProperties.markerLeft, -100, 200, 1.8) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-top",
      clampCoercedNumber(titleProperties.markerTop, -100, 200, 84) + "%"
    );
    if (titleProperties.frameVisible !== false || isHiddenContentClickable) {
      const titleFrameSizeRatio = clampCoercedNumber(titleProperties.frameSize, 10, 300, 100) / 100;
      const titleFrameHalfHeight = titleHeight * 0.45 * titleFrameSizeRatio;
      const titleFrameOffsetXPx =
        (titleWidth * clampCoercedNumber(titleProperties.frameOffsetX, -100, 100, 0)) / 100;
      const titleFrameOffsetYPx =
        (titleHeight * clampCoercedNumber(titleProperties.frameOffsetY, -100, 100, 0)) / 100;
      const titleFrameHalfSpacing =
        (titleWidth * clampCoercedNumber(titleProperties.frameSpacing, 0, 300, 100)) / 200;
      const titleFrameCenterX = titleWidth / 2 + titleFrameOffsetXPx;
      const titleFrameCenterY = titleHeight / 2 + titleFrameOffsetYPx;
      const titleFrameTop = titleFrameCenterY - titleFrameHalfHeight / 2;
      const titleFrameBottom = titleFrameCenterY + titleFrameHalfHeight / 2;
      const titleBracketLength = titleHeight * 0.12;
      const titleFrameHalfWidth = clampCoercedNumber(titleProperties.frameWidth, 0, 12, 1.5) / 2;
      const titleLeftBracketX = titleFrameCenterX - titleFrameHalfSpacing + titleFrameHalfWidth;
      const titleRightBracketX = titleFrameCenterX + titleFrameHalfSpacing - titleFrameHalfWidth;
      const titleBracketsElement = appendSvgElement(titleElement, "svg", {
        viewBox: "0 0 " + titleWidth + " " + titleHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      titleBracketsElement.setAttribute("class", "hb-title-button-brackets");
      if (titleProperties.frameVisible === false) {
        titleBracketsElement.style.visibility = "hidden";
      }
      const titleBracketAttributes = {
        fill: "none",
        stroke: resolveColor(titleProperties.frameColor, "#60636a"),
        "stroke-width": clampCoercedNumber(titleProperties.frameWidth, 0, 12, 1.5),
        "stroke-opacity": 1,
        "stroke-linecap": "butt",
        "stroke-linejoin": "miter",
        "vector-effect": "non-scaling-stroke"
      };
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleLeftBracketX + titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleLeftBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleLeftBracketX + titleBracketLength)
      });
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleRightBracketX - titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleRightBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleRightBracketX - titleBracketLength)
      });
    }
    if (titleProperties.mainTextVisible !== false || isHiddenContentClickable) {
      const titleMainTextElement = document.createElement("strong");
      titleMainTextElement.className = "hb-title-button-main";
      titleMainTextElement.textContent = String(titleProperties.mainText || "客厅");
      titleMainTextElement.style.color = resolveColor(titleProperties.mainColor, "#b9bbc0");
      if (titleProperties.mainTextVisible === false) {
        titleMainTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleMainTextElement,
        titleProperties.mainWeight,
        clampCoercedNumber(titleProperties.mainSize, 8, 200, 34)
      );
      titleElement.append(titleMainTextElement);
    }
    if (titleProperties.secondaryTextVisible !== false || isHiddenContentClickable) {
      const titleSecondaryTextElement = document.createElement("small");
      titleSecondaryTextElement.className = "hb-title-button-secondary";
      String(titleProperties.secondaryText || "LIVING ROOM\nLIGHTING")
        .split(/\r?\n/)
        .slice(0, 2)
        .forEach(titleTextLine => {
          const titleTextLineElement = document.createElement("span");
          titleTextLineElement.textContent = titleTextLine;
          titleSecondaryTextElement.append(titleTextLineElement);
        });
      titleSecondaryTextElement.style.color = resolveColor(
        titleProperties.secondaryColor,
        "#70737b"
      );
      if (titleProperties.secondaryTextVisible === false) {
        titleSecondaryTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleSecondaryTextElement,
        titleProperties.secondaryWeight,
        clampCoercedNumber(titleProperties.secondarySize, 6, 100, 12)
      );
      titleElement.append(titleSecondaryTextElement);
    }
    if (titleProperties.iconVisible !== false || isHiddenContentClickable) {
      const titleIconSource = mdiIconUrl(titleProperties.icon || "");
      if (titleIconSource) {
        const titleIconElement = document.createElement("i");
        titleIconElement.className = "hb-title-button-icon";
        if (titleProperties.iconVisible === false) {
          titleIconElement.style.visibility = "hidden";
        }
        titleIconElement.style.backgroundColor = resolveColor(titleProperties.iconColor, "#b9bbc0");
        titleIconElement.style.maskImage = 'url("' + titleIconSource + '")';
        titleIconElement.style.webkitMaskImage = 'url("' + titleIconSource + '")';
        titleElement.append(titleIconElement);
      }
    }
    if (titleProperties.markerVisible !== false || isHiddenContentClickable) {
      const titleMarkerElement = document.createElement("i");
      titleMarkerElement.className = "hb-title-button-marker";
      if (titleProperties.markerVisible === false) {
        titleMarkerElement.style.visibility = "hidden";
      }
      titleMarkerElement.style.color = resolveColor(
        titleProperties.markerColor,
        paletteColor("--hos-accent", "#ffc46a")
      );
      titleMarkerElement.style.borderTopColor = resolveColor(
        titleProperties.markerColor,
        paletteColor("--hos-accent", "#ffc46a")
      );
      titleMarkerElement.style.setProperty(
        "--title-marker-size",
        clampCoercedNumber(titleProperties.markerSize, 2, 60, 10) * titleUnitPx + "px"
      );
      titleElement.append(titleMarkerElement);
    }
    return titleElement;
  }
});
