/**
 * `panel-frame` 控件：面板框与标题条。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import {
  clampCoercedNumber,
  clampNumber
} from "../../../../utils/numbers.js?v=2609251801";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609251801";
// 同门分片：registry-visuals
import {
  appendSvgElement,
  resolveColor
} from "../registry-visuals.js?v=2609251801";

// 面板框控件：纯装饰性外框（描边 + 光晕），内部内容由子组件承载。
registerComponent("panel-frame", {
  render(panelFrameComponent, panelFrameContext) {
    const panelFrameProperties = panelFrameComponent.properties || {};
    const panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528));
    const panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300));
    const panelEdgeWidth = clampCoercedNumber(panelFrameProperties.edgeWidth, 0, 20, 0.9);
    const panelInset = Math.max(0.5, panelEdgeWidth / 2 + 0.5);
    const panelInnerWidth = Math.max(1, panelFrameWidth - panelInset * 2);
    const panelInnerHeight = Math.max(1, panelFrameHeight - panelInset * 2);
    const panelCornerRadius =
      Math.min(panelInnerWidth, panelInnerHeight) *
      clampCoercedNumber(panelFrameProperties.radius, 0, 0.5, 0.195);
    const panelEdgeOpacity = clampCoercedNumber(panelFrameProperties.edgeOpacity, 0, 1, 1);
    const panelGlowStrength = clampCoercedNumber(panelFrameProperties.glowStrength, 0, 5, 0.5);
    const panelGlowSize = clampCoercedNumber(panelFrameProperties.glowSize, 0, 3, 1.5);
    const panelGlowStrokeWidth = Math.min(panelInnerWidth, panelInnerHeight) * 0.22 * panelGlowSize;
    const panelGlowBlur = Math.min(panelInnerWidth, panelInnerHeight) * 0.06 * panelGlowSize;
    const panelEdgeColor = resolveColor(panelFrameProperties.edgeColor, "#d4d4d4");
    const panelGlowColor = resolveColor(panelFrameProperties.glowColor, "#ffffff");
    const panelFrameId =
      (panelFrameContext.renderNamespace || "renderer") +
      "-frame-" +
      String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const panelFrameElement = document.createElement("div");
    panelFrameElement.className = "hb-panel-frame-component";
    const panelFrameSvg = appendSvgElement(panelFrameElement, "svg", {
      viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    const panelFrameDefs = appendSvgElement(panelFrameSvg, "defs");
    const panelGlassGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glass",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.35, panelGlowStrength * 0.035)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0.52,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.12, panelGlowStrength * 0.01)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 1,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.25, panelGlowStrength * 0.025)
    });
    const panelEdgeGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampCoercedNumber(panelFrameProperties.edgeAngle, 0, 360, 45) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelEdgeStopOffset, panelEdgeStopOpacity] of [
      [0, 0.96],
      [0.22, 0.72],
      [0.52, 0.3],
      [0.78, 0.66],
      [1, 0.42]
    ]) {
      appendSvgElement(panelEdgeGradient, "stop", {
        offset: panelEdgeStopOffset,
        "stop-color": panelEdgeColor,
        "stop-opacity": panelEdgeStopOpacity * panelEdgeOpacity
      });
    }
    const panelGlowGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glow",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampCoercedNumber(panelFrameProperties.glowAngle, 0, 360, 242) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelGlowStopOffset, panelGlowStopOpacity] of [
      [0, 0.32],
      [0.42, 0.09],
      [0.72, 0.05],
      [1, 0.22]
    ]) {
      appendSvgElement(panelGlowGradient, "stop", {
        offset: panelGlowStopOffset,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(1, panelGlowStopOpacity * panelGlowStrength)
      });
    }
    const panelClipPath = appendSvgElement(panelFrameDefs, "clipPath", {
      id: panelFrameId + "-clip"
    });
    appendSvgElement(panelClipPath, "rect", {
      x: panelInset,
      y: panelInset,
      width: panelInnerWidth,
      height: panelInnerHeight,
      rx: panelCornerRadius
    });
    const panelBlurFilter = appendSvgElement(panelFrameDefs, "filter", {
      id: panelFrameId + "-blur",
      x: "-35%",
      y: "-55%",
      width: "170%",
      height: "210%"
    });
    appendSvgElement(panelBlurFilter, "feGaussianBlur", {
      stdDeviation: panelGlowBlur
    });
    if (panelFrameProperties.glowVisible !== false) {
      const panelGlowGroup = appendSvgElement(panelFrameSvg, "g", {
        "clip-path": "url(#" + panelFrameId + "-clip)"
      });
      appendSvgElement(panelGlowGroup, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "url(#" + panelFrameId + "-glass)"
      });
      if (panelGlowStrokeWidth > 0 && panelGlowStrength > 0) {
        appendSvgElement(panelGlowGroup, "rect", {
          x: panelInset,
          y: panelInset,
          width: panelInnerWidth,
          height: panelInnerHeight,
          rx: panelCornerRadius,
          fill: "none",
          stroke: "url(#" + panelFrameId + "-glow)",
          "stroke-width": panelGlowStrokeWidth,
          filter: "url(#" + panelFrameId + "-blur)"
        });
      }
    }
    if (panelFrameProperties.edgeVisible !== false) {
      appendSvgElement(panelFrameSvg, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "none",
        stroke: "url(#" + panelFrameId + "-edge)",
        "stroke-width": panelEdgeWidth
      });
    }
    const panelTextLeft = clampCoercedNumber(panelFrameProperties.textLeft, -100, 200, 5.2);
    const panelTextTop = clampCoercedNumber(panelFrameProperties.textTop, -100, 200, 28);
    const panelMainTextX =
      (panelFrameWidth * clampCoercedNumber(panelFrameProperties.mainTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelMainTextY =
      (panelFrameHeight *
        clampCoercedNumber(
          panelFrameProperties.mainTextTop,
          -100,
          200,
          // 兜底是「主文本上移一个行距」的推导值，行距大 / 面板矮时会低于下限 -100 ——
          // 兜底现在原样返回，所以在调用点先夹一次，行为与统一前逐字相同。
          clampNumber(
            panelTextTop -
              (clampCoercedNumber(panelFrameProperties.lineGap, 0, 500, 24) /
                panelFrameHeight) *
                100,
            -100,
            200
          )
        )) /
      100;
    const panelSecondaryTextX =
      (panelFrameWidth *
        clampCoercedNumber(panelFrameProperties.secondaryTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelSecondaryTextY =
      (panelFrameHeight *
        clampCoercedNumber(panelFrameProperties.secondaryTextTop, -100, 200, panelTextTop)) /
      100;
    const panelMainTextOpacity = clampCoercedNumber(panelFrameProperties.mainOpacity, 0, 1, 0.72);
    const panelSecondaryTextOpacity = clampCoercedNumber(
      panelFrameProperties.secondaryOpacity,
      0,
      1,
      0.36
    );
    if (panelFrameProperties.mainTextVisible !== false) {
      const panelMainTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelMainTextX,
        y: panelMainTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
        "fill-opacity": panelMainTextOpacity,
        "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
        "font-size": clampCoercedNumber(panelFrameProperties.mainSize, 8, 500, 30),
        "font-weight": 300,
        "letter-spacing": clampCoercedNumber(panelFrameProperties.mainSpacing, -20, 100, 2)
      });
      const panelMainTextStrokeWidth = clampCoercedNumber(panelFrameProperties.mainWeight, 0, 3, 0);
      if (panelMainTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
          "stroke-opacity": panelMainTextOpacity,
          "stroke-width": panelMainTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([mainTextAttributeName, mainTextAttributeValue]) =>
          panelMainTextElement.setAttribute(mainTextAttributeName, mainTextAttributeValue)
        );
      }
      panelMainTextElement.textContent = String(panelFrameProperties.mainText || "");
    }
    if (panelFrameProperties.secondaryTextVisible !== false) {
      const panelSecondaryTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelSecondaryTextX,
        y: panelSecondaryTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
        "fill-opacity": panelSecondaryTextOpacity,
        "font-family": "Helvetica Neue,Arial,sans-serif",
        "font-size": clampCoercedNumber(panelFrameProperties.secondarySize, 6, 500, 15),
        "font-weight": 300,
        "letter-spacing": clampCoercedNumber(panelFrameProperties.secondarySpacing, -20, 100, 2.1)
      });
      const panelSecondaryTextStrokeWidth = clampCoercedNumber(
        panelFrameProperties.secondaryWeight,
        0,
        3,
        0
      );
      if (panelSecondaryTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
          "stroke-opacity": panelSecondaryTextOpacity,
          "stroke-width": panelSecondaryTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([secondaryTextAttributeName, secondaryTextAttributeValue]) =>
          panelSecondaryTextElement.setAttribute(
            secondaryTextAttributeName,
            secondaryTextAttributeValue
          )
        );
      }
      panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "");
    }
    return panelFrameElement;
  }
});
