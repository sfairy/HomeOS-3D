/**
 * 2D 面板渲染器 · `panel-frame` 家族。
 *
 * 从 register-all.ts 拆出：该文件原先是一个 1,898 行的巨型装配函数，
 * 每次改一个控件都要在整份文件里定位；按 registry 家族拆开后每个文件只放
 * 自己那一族的 DOM 构建逻辑，装配函数只负责按顺序调用。
 */
import { clampNumberWithFallback, normalizeCssColor, appendSvgElement } from "../_shared";

export function registerPanelFrameComponent(registerComponent: (type: any, def: any) => void) {
  registerComponent("panel-frame", {
    render(panelFrameComponent: any, panelFrameRenderEnvironment: any) {
      const panelFrameProperties = panelFrameComponent.properties || {},
        panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528)),
        panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300)),
        edgeStrokeWidth = clampNumberWithFallback(panelFrameProperties.edgeWidth, 0, 20, 0.9),
        edgeInset = Math.max(0.5, edgeStrokeWidth / 2 + 0.5),
        innerFrameWidth = Math.max(1, panelFrameWidth - edgeInset * 2),
        innerFrameHeight = Math.max(1, panelFrameHeight - edgeInset * 2),
        panelCornerRadius =
          Math.min(innerFrameWidth, innerFrameHeight) *
          clampNumberWithFallback(panelFrameProperties.radius, 0, 0.5, 0.195),
        edgeOpacity = clampNumberWithFallback(panelFrameProperties.edgeOpacity, 0, 1, 1),
        panelGlowStrength = clampNumberWithFallback(panelFrameProperties.glowStrength, 0, 5, 0.5),
        panelGlowSize = clampNumberWithFallback(panelFrameProperties.glowSize, 0, 3, 1.5),
        panelGlowRadius = Math.min(innerFrameWidth, innerFrameHeight) * 0.22 * panelGlowSize,
        panelGlowBlur = Math.min(innerFrameWidth, innerFrameHeight) * 0.06 * panelGlowSize,
        edgeStrokeColor = normalizeCssColor(panelFrameProperties.edgeColor, "#d4d4d4"),
        panelGlowColor = normalizeCssColor(panelFrameProperties.glowColor, "#ffffff"),
        panelFrameId =
          (panelFrameRenderEnvironment.renderNamespace || "renderer") +
          "-frame-" +
          String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
        panelFrameElement = document.createElement("div");
      panelFrameElement.className = "hb-panel-frame-component";
      const panelFrameSvgElement = appendSvgElement(panelFrameElement, "svg", {
          viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        }),
        panelFrameDefsElement = appendSvgElement(panelFrameSvgElement, "defs"),
        panelGlowGradientElement = appendSvgElement(panelFrameDefsElement, "linearGradient", {
          id: panelFrameId + "-glass",
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
        });
      (appendSvgElement(panelGlowGradientElement, "stop", {
        offset: 0,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(0.35, 0.035 * panelGlowStrength),
      }),
        appendSvgElement(panelGlowGradientElement, "stop", {
          offset: 0.52,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(0.12, 0.01 * panelGlowStrength),
        }),
        appendSvgElement(panelGlowGradientElement, "stop", {
          offset: 1,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(0.25, 0.025 * panelGlowStrength),
        }));
      const panelEdgeGradientElement = appendSvgElement(panelFrameDefsElement, "linearGradient", {
        id: panelFrameId + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: panelFrameHeight / 2,
        x2: panelFrameWidth,
        y2: panelFrameHeight / 2,
        gradientTransform:
          "rotate(" +
          clampNumberWithFallback(panelFrameProperties.edgeAngle, 0, 360, 45) +
          " " +
          panelFrameWidth / 2 +
          " " +
          panelFrameHeight / 2 +
          ")",
      });
      for (const [panelStopOffset, panelStopOpacity] of [
        [0, 0.96],
        [0.22, 0.72],
        [0.52, 0.3],
        [0.78, 0.66],
        [1, 0.42],
      ])
        appendSvgElement(panelEdgeGradientElement, "stop", {
          offset: panelStopOffset,
          "stop-color": edgeStrokeColor,
          "stop-opacity": panelStopOpacity * edgeOpacity,
        });
      const panelGlassGradientElement = appendSvgElement(panelFrameDefsElement, "linearGradient", {
        id: panelFrameId + "-glow",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: panelFrameHeight / 2,
        x2: panelFrameWidth,
        y2: panelFrameHeight / 2,
        gradientTransform:
          "rotate(" +
          clampNumberWithFallback(panelFrameProperties.glowAngle, 0, 360, 242) +
          " " +
          panelFrameWidth / 2 +
          " " +
          panelFrameHeight / 2 +
          ")",
      });
      for (const [panelGlassStopOffset, panelGlassStopOpacity] of [
        [0, 0.32],
        [0.42, 0.09],
        [0.72, 0.05],
        [1, 0.22],
      ])
        appendSvgElement(panelGlassGradientElement, "stop", {
          offset: panelGlassStopOffset,
          "stop-color": panelGlowColor,
          "stop-opacity": Math.min(1, panelGlassStopOpacity * panelGlowStrength),
        });
      const panelClipPathElement = appendSvgElement(panelFrameDefsElement, "clipPath", {
        id: panelFrameId + "-clip",
      });
      appendSvgElement(panelClipPathElement, "rect", {
        x: edgeInset,
        y: edgeInset,
        width: innerFrameWidth,
        height: innerFrameHeight,
        rx: panelCornerRadius,
      });
      const panelGlowFilterElement = appendSvgElement(panelFrameDefsElement, "filter", {
        id: panelFrameId + "-blur",
        x: "-35%",
        y: "-55%",
        width: "170%",
        height: "210%",
      });
      if (
        (appendSvgElement(panelGlowFilterElement, "feGaussianBlur", {
          stdDeviation: panelGlowBlur,
        }),
        panelFrameProperties.glowVisible !== false)
      ) {
        const panelEdgeGroupElement = appendSvgElement(panelFrameSvgElement, "g", {
          "clip-path": "url(#" + panelFrameId + "-clip)",
        });
        (appendSvgElement(panelEdgeGroupElement, "rect", {
          x: edgeInset,
          y: edgeInset,
          width: innerFrameWidth,
          height: innerFrameHeight,
          rx: panelCornerRadius,
          fill: "url(#" + panelFrameId + "-glass)",
        }),
          panelGlowRadius > 0 &&
            panelGlowStrength > 0 &&
            appendSvgElement(panelEdgeGroupElement, "rect", {
              x: edgeInset,
              y: edgeInset,
              width: innerFrameWidth,
              height: innerFrameHeight,
              rx: panelCornerRadius,
              fill: "none",
              stroke: "url(#" + panelFrameId + "-glow)",
              "stroke-width": panelGlowRadius,
              filter: "url(#" + panelFrameId + "-blur)",
            }));
      }
      panelFrameProperties.edgeVisible !== false &&
        appendSvgElement(panelFrameSvgElement, "rect", {
          x: edgeInset,
          y: edgeInset,
          width: innerFrameWidth,
          height: innerFrameHeight,
          rx: panelCornerRadius,
          fill: "none",
          stroke: "url(#" + panelFrameId + "-edge)",
          "stroke-width": edgeStrokeWidth,
        });
      const textLeftPercent = clampNumberWithFallback(panelFrameProperties.textLeft, -100, 200, 5.2),
        textTopPercent = clampNumberWithFallback(panelFrameProperties.textTop, -100, 200, 28),
        mainTextX =
          (panelFrameWidth *
            clampNumberWithFallback(panelFrameProperties.mainTextLeft, -100, 200, textLeftPercent)) /
          100,
        mainTextY =
          (panelFrameHeight *
            clampNumberWithFallback(
              panelFrameProperties.mainTextTop,
              -100,
              200,
              textTopPercent -
                (clampNumberWithFallback(panelFrameProperties.lineGap, 0, 500, 24) / panelFrameHeight) * 100,
            )) /
          100,
        secondaryTextX =
          (panelFrameWidth *
            clampNumberWithFallback(panelFrameProperties.secondaryTextLeft, -100, 200, textLeftPercent)) /
          100,
        secondaryTextY =
          (panelFrameHeight *
            clampNumberWithFallback(panelFrameProperties.secondaryTextTop, -100, 200, textTopPercent)) /
          100,
        mainTextOpacity = clampNumberWithFallback(panelFrameProperties.mainOpacity, 0, 1, 0.72),
        secondaryTextOpacity = clampNumberWithFallback(panelFrameProperties.secondaryOpacity, 0, 1, 0.36);
      if (panelFrameProperties.mainTextVisible !== false) {
        const panelMainTextElement = appendSvgElement(panelFrameSvgElement, "text", {
            x: mainTextX,
            y: mainTextY,
            "text-anchor": "start",
            fill: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
            "fill-opacity": mainTextOpacity,
            "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
            "font-size": clampNumberWithFallback(panelFrameProperties.mainSize, 8, 500, 30),
            "font-weight": 300,
            "letter-spacing": clampNumberWithFallback(panelFrameProperties.mainSpacing, -20, 100, 2),
          }),
          mainTextWeight = clampNumberWithFallback(panelFrameProperties.mainWeight, 0, 3, 0);
        (mainTextWeight > 0 &&
          Object.entries({
            stroke: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
            "stroke-opacity": mainTextOpacity,
            "stroke-width": mainTextWeight,
            "paint-order": "stroke fill",
          }).forEach(([attributeName, attributeValue]) =>
            panelMainTextElement.setAttribute(attributeName, attributeValue),
          ),
          (panelMainTextElement.textContent = String(panelFrameProperties.mainText || "")));
      }
      if (panelFrameProperties.secondaryTextVisible !== false) {
        const panelSecondaryTextElement = appendSvgElement(panelFrameSvgElement, "text", {
            x: secondaryTextX,
            y: secondaryTextY,
            "text-anchor": "start",
            fill: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
            "fill-opacity": secondaryTextOpacity,
            "font-family": "Helvetica Neue,Arial,sans-serif",
            "font-size": clampNumberWithFallback(panelFrameProperties.secondarySize, 6, 500, 15),
            "font-weight": 300,
            "letter-spacing": clampNumberWithFallback(panelFrameProperties.secondarySpacing, -20, 100, 2.1),
          }),
          secondaryTextWeight = clampNumberWithFallback(panelFrameProperties.secondaryWeight, 0, 3, 0);
        (secondaryTextWeight > 0 &&
          Object.entries({
            stroke: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
            "stroke-opacity": secondaryTextOpacity,
            "stroke-width": secondaryTextWeight,
            "paint-order": "stroke fill",
          }).forEach(([secondaryAttributeName, secondaryAttributeValue]) =>
            panelSecondaryTextElement.setAttribute(secondaryAttributeName, secondaryAttributeValue),
          ),
          (panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "")));
      }
      return panelFrameElement;
    },
  });
}
