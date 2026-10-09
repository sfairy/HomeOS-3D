import { clampNumber, normalizeCssColor, applyTextOutline, resolveMdiIconUrl, resolveStatePayload, createSvgElement } from "./_shared";
import { resolveAssetSource, staticAssetImageSource } from "./asset-state";
import {
  coverComponentIsDream,
  formatEntityState,
  isCoverComponentActive,
  isCoverAuthoredActive,
  isEntityComponentActive,
  resolveEntityIcon,
} from "./cover-climate-state";
import { componentContentUnitsPx } from "./content-units";

export const buttonComponentRenderers = {
  render(buttonComponent: any, buttonRenderEnvironment: any) {
    const buttonProperties = buttonComponent.properties || {},
      isDeviceButton = buttonComponent.type === "device-button",
      boundEntityId = buttonComponent.bindings?.entity?.entityId || "",
      boundEntityState = buttonRenderEnvironment.states?.get(boundEntityId),
      entityStatePayload = resolveStatePayload(boundEntityState),
      isButtonActive = isCoverComponentActive(buttonComponent, buttonRenderEnvironment),
      buttonWidthPx = Math.max(20, Number(buttonComponent.position?.width || 144)),
      buttonHeightPx = Math.max(20, Number(buttonComponent.position?.height || 150)),
      { height: buttonUnitHeight } = componentContentUnitsPx(
        buttonComponent,
        buttonRenderEnvironment,
      ),
      cornerCutSize =
        (Math.min(buttonWidthPx, buttonHeightPx) *
          clampNumber(buttonProperties.cutCorner, 0, 50, 20)) /
        100,
      frameStrokeWidth = clampNumber(buttonProperties.frameWidth, 0, 12, 1),
      frameGradientAngle = clampNumber(buttonProperties.frameAngle, 0, 360, 45),
      frameOnOpacity = clampNumber(
        isButtonActive ? buttonProperties.frameOnOpacity : buttonProperties.frameOffOpacity,
        0,
        1,
        isButtonActive ? 1 : 0.8,
      ),
      softLightColor = normalizeCssColor(buttonProperties.softLightColor, "#ffffff"),
      softLightStrength = clampNumber(buttonProperties.softLightStrength, 0, 5, 1),
      softLightSize = clampNumber(buttonProperties.softLightSize, 0, 3, 1),
      softLightAngle = clampNumber(buttonProperties.softLightAngle, 0, 360, 45),
      buttonGlowColor = normalizeCssColor(buttonProperties.glowColor, "#ffffff"),
      glowStrength = clampNumber(buttonProperties.glowStrength, 0, 5, 1),
      glowSize = clampNumber(buttonProperties.glowSize, 0, 3, 1),
      buttonGlowAngle = clampNumber(buttonProperties.glowAngle, 0, 360, 220),
      buttonCenterX = buttonWidthPx / 2,
      buttonCenterY = buttonHeightPx / 2,
      glowAngleRadians = (buttonGlowAngle * Math.PI) / 180,
      glowCenterX = buttonCenterX + Math.cos(glowAngleRadians) * buttonWidthPx * 0.16,
      glowCenterY = buttonCenterY + Math.sin(glowAngleRadians) * buttonHeightPx * 0.18,
      filterIdPrefix =
        (buttonRenderEnvironment.renderNamespace || "renderer") +
        "-icon-button-" +
        String(buttonComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
      deviceButtonElement = document.createElement("div");
    if (
      ((deviceButtonElement.className = "hb-icon-button" + (isButtonActive ? " active" : "")),
      deviceButtonElement.style.setProperty(
        "--icon-button-main-left",
        clampNumber(buttonProperties.mainTextLeft, -100, 200, 9) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-main-top",
        clampNumber(buttonProperties.mainTextTop, -100, 200, 78) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-secondary-left",
        clampNumber(buttonProperties.secondaryTextLeft, -100, 200, 9) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-secondary-top",
        clampNumber(buttonProperties.secondaryTextTop, -100, 200, 91) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-left",
        clampNumber(buttonProperties.iconLeft, -100, 200, 50) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-top",
        clampNumber(buttonProperties.iconTop, -100, 200, 34) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-glow-size",
        9 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--device-button-icon-glow-size",
        5 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--device-button-icon-active-glow-size",
        7 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--hb-on-fill-fade-duration",
        clampNumber(buttonProperties.onFillFadeDuration, 0, 3, 0.3) + "s",
      ),
      !isDeviceButton)
    ) {
      const buttonSvgElement = createSvgElement(deviceButtonElement, "svg", {
          viewBox: "0 0 " + buttonWidthPx + " " + buttonHeightPx,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        }),
        svgDefsElement = createSvgElement(buttonSvgElement, "defs"),
        clipPolygonPoints =
          "0,0 " +
          (buttonWidthPx - cornerCutSize) +
          ",0 " +
          buttonWidthPx +
          "," +
          cornerCutSize +
          " " +
          buttonWidthPx +
          "," +
          buttonHeightPx +
          " 0," +
          buttonHeightPx,
        clipPathElement = createSvgElement(svgDefsElement, "clipPath", {
          id: filterIdPrefix + "-clip",
        });
      createSvgElement(clipPathElement, "polygon", {
        points: clipPolygonPoints,
      });
      const softLightRadius = buttonWidthPx * 0.5 * softLightSize,
        softLightGradientElement = createSvgElement(svgDefsElement, "linearGradient", {
          id: filterIdPrefix + "-soft-light",
          gradientUnits: "userSpaceOnUse",
          x1: buttonCenterX - softLightRadius,
          y1: buttonCenterY,
          x2: buttonCenterX + softLightRadius,
          y2: buttonCenterY,
          gradientTransform:
            "rotate(" + softLightAngle + " " + buttonCenterX + " " + buttonCenterY + ")",
        });
      (createSvgElement(softLightGradientElement, "stop", {
        offset: 0,
        "stop-color": softLightColor,
        "stop-opacity": Math.min(1, 0.055 * softLightStrength),
      }),
        createSvgElement(softLightGradientElement, "stop", {
          offset: 0.55,
          "stop-color": softLightColor,
          "stop-opacity": Math.min(1, 0.018 * softLightStrength),
        }),
        createSvgElement(softLightGradientElement, "stop", {
          offset: 1,
          "stop-color": softLightColor,
          "stop-opacity": Math.min(1, 0.085 * softLightStrength),
        }));
      const edgeGradientElement = createSvgElement(svgDefsElement, "linearGradient", {
        id: filterIdPrefix + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: buttonCenterY,
        x2: buttonWidthPx,
        y2: buttonCenterY,
        gradientTransform:
          "rotate(" + frameGradientAngle + " " + buttonCenterX + " " + buttonCenterY + ")",
      });
      (createSvgElement(edgeGradientElement, "stop", {
        offset: 0,
        "stop-color": "#ffffff",
        "stop-opacity": frameOnOpacity,
      }),
        createSvgElement(edgeGradientElement, "stop", {
          offset: 0.48,
          "stop-color": "#ffffff",
          "stop-opacity": frameOnOpacity * 0.49,
        }),
        createSvgElement(edgeGradientElement, "stop", {
          offset: 1,
          "stop-color": "#ffffff",
          "stop-opacity": frameOnOpacity * 0.66,
        }));
      const glowGradientElement = createSvgElement(svgDefsElement, "radialGradient", {
        id: filterIdPrefix + "-glow",
        gradientUnits: "userSpaceOnUse",
        cx: glowCenterX,
        cy: glowCenterY,
        r: Math.min(buttonWidthPx, buttonHeightPx) * 0.42 * glowSize,
      });
      (createSvgElement(glowGradientElement, "stop", {
        offset: 0,
        "stop-color": buttonGlowColor,
        "stop-opacity": Math.min(1, 0.12 * glowStrength),
      }),
        createSvgElement(glowGradientElement, "stop", {
          offset: 0.52,
          "stop-color": buttonGlowColor,
          "stop-opacity": Math.min(1, 0.025 * glowStrength),
        }),
        createSvgElement(glowGradientElement, "stop", {
          offset: 1,
          "stop-color": buttonGlowColor,
          "stop-opacity": 0,
        }));
      const glowFilterElement = createSvgElement(svgDefsElement, "filter", {
        id: filterIdPrefix + "-glow-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%",
      });
      createSvgElement(glowFilterElement, "feGaussianBlur", {
        stdDeviation: Math.min(buttonWidthPx, buttonHeightPx) * 0.03,
      });
      const glowGroupElement = createSvgElement(buttonSvgElement, "g", {
        "clip-path": "url(#" + filterIdPrefix + "-clip)",
      });
      (buttonProperties.onFillVisible !== false &&
        createSvgElement(glowGroupElement, "polygon", {
          class: "hb-icon-button-on-fill",
          points: clipPolygonPoints,
          fill: normalizeCssColor(buttonProperties.onFillColor, "#dfb64f"),
          "fill-opacity": clampNumber(buttonProperties.onFillStrength, 0, 1, 1),
        }),
        buttonProperties.softLightVisible !== false &&
          softLightSize > 0 &&
          createSvgElement(glowGroupElement, "polygon", {
            points: clipPolygonPoints,
            fill: "url(#" + filterIdPrefix + "-soft-light)",
          }),
        buttonProperties.glowVisible !== false &&
          glowSize > 0 &&
          createSvgElement(glowGroupElement, "ellipse", {
            cx: glowCenterX,
            cy: glowCenterY,
            rx: buttonWidthPx * 0.42 * glowSize,
            ry: buttonHeightPx * 0.42 * glowSize,
            fill: "url(#" + filterIdPrefix + "-glow)",
            filter: "url(#" + filterIdPrefix + "-glow-blur)",
          }),
        buttonProperties.frameVisible !== false &&
          frameStrokeWidth > 0 &&
          createSvgElement(glowGroupElement, "polygon", {
            points: clipPolygonPoints,
            fill: "none",
            stroke: "url(#" + filterIdPrefix + "-edge)",
            "stroke-width": frameStrokeWidth,
            "vector-effect": "non-scaling-stroke",
          }));
    }
    const iconSource =
        String(buttonProperties.icon || "").trim() ||
        (isDeviceButton ? resolveEntityIcon(boundEntityId, boundEntityState) : "mdi:ceiling-light"),
      iconUrl = resolveMdiIconUrl(iconSource);
    if (
      iconUrl &&
      (!isDeviceButton ||
        buttonProperties.iconVisible !== false ||
        buttonProperties.hiddenContentClickable === true)
    ) {
      const buttonIconElement = document.createElement("i");
      if (
        ((buttonIconElement.className = isDeviceButton
          ? "hb-device-button-icon"
          : "hb-icon-button-icon"),
        isDeviceButton ||
          ((buttonIconElement.style.width =
            clampNumber(buttonProperties.iconSize, 1, 100, 42) + "%"),
          (buttonIconElement.style.height =
            clampNumber(buttonProperties.iconSize, 1, 100, 42) + "%")),
        (buttonIconElement.style.backgroundColor =
          isDeviceButton && isButtonActive
            ? normalizeCssColor(buttonProperties.iconOnColor, "#379bff")
            : normalizeCssColor(
                buttonProperties.iconColor ||
                  buttonProperties.iconOffColor ||
                  buttonProperties.iconOnColor,
                "#d7d8da",
              )),
        (buttonIconElement.style.opacity = isDeviceButton
          ? "1"
          : String(
              clampNumber(
                isButtonActive ? buttonProperties.iconOnOpacity : buttonProperties.iconOffOpacity,
                0,
                1,
                1,
              ),
            )),
        buttonIconElement.style.setProperty("mask-image", 'url("' + iconUrl + '")'),
        buttonIconElement.style.setProperty("-webkit-mask-image", 'url("' + iconUrl + '")'),
        isDeviceButton)
      ) {
        const baseIconSize = clampNumber(buttonProperties.iconSize, 1, 100, 28),
          badgeSize = clampNumber(buttonProperties.badgeSize ?? baseIconSize, 1, 100, baseIconSize),
          symbolSize = clampNumber(
            buttonProperties.symbolSize ?? baseIconSize * 0.5,
            1,
            100,
            baseIconSize * 0.5,
          ),
          symbolScale = clampNumber((symbolSize / badgeSize) * 100, 1, 100, 50);
        ((buttonIconElement.style.width = symbolScale + "%"),
          (buttonIconElement.style.height = symbolScale + "%"));
        const badgeElement = document.createElement("span");
        ((badgeElement.className =
          "hb-device-button-icon-badge" + (isButtonActive ? " active" : "")),
          buttonProperties.iconVisible === false && (badgeElement.style.visibility = "hidden"),
          (badgeElement.style.width = badgeSize * buttonUnitHeight + "px"),
          (badgeElement.style.height = badgeSize * buttonUnitHeight + "px"),
          badgeElement.style.setProperty(
            "--device-badge-color",
            normalizeCssColor(buttonProperties.badgeColor, "#5b5e66"),
          ),
          badgeElement.style.setProperty(
            "--device-badge-opacity",
            clampNumber(buttonProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
          ),
          badgeElement.append(buttonIconElement),
          deviceButtonElement.append(badgeElement));
      } else deviceButtonElement.append(buttonIconElement);
    }
    const buttonTextElement = document.createElement("span");
    buttonTextElement.className = "hb-icon-button-text";
    const mainTextSize = clampNumber(buttonProperties.mainSize, 6, 120, 25),
      primaryTextElement = document.createElement("strong");
    ((primaryTextElement.textContent = isDeviceButton
      ? String(buttonProperties.mainText || "").trim() ||
        String(entityStatePayload?.attributes?.friendly_name || boundEntityId || "未选择实体")
      : String(buttonProperties.mainText || "主灯")),
      (primaryTextElement.style.color = normalizeCssColor(
        buttonProperties.mainColor || buttonProperties.mainOffColor || buttonProperties.mainOnColor,
        "#c7c8cb",
      )),
      (primaryTextElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampNumber(
              isButtonActive ? buttonProperties.mainOnOpacity : buttonProperties.mainOffOpacity,
              0,
              1,
              1,
            ),
          )),
      (primaryTextElement.style.fontSize = mainTextSize * buttonUnitHeight + "px"),
      (primaryTextElement.style.letterSpacing =
        clampNumber(buttonProperties.mainSpacing, -20, 100, 1) * buttonUnitHeight + "px"),
      applyTextOutline(primaryTextElement, buttonProperties.mainWeight, mainTextSize),
      (primaryTextElement.hidden =
        isDeviceButton &&
        buttonProperties.mainTextVisible === false &&
        buttonProperties.hiddenContentClickable !== true),
      isDeviceButton &&
        buttonProperties.mainTextVisible === false &&
        buttonProperties.hiddenContentClickable === true &&
        (primaryTextElement.style.visibility = "hidden"));
    const secondaryTextSize = clampNumber(buttonProperties.secondarySize, 5, 80, 10),
      secondaryLabelElement = document.createElement("small");
    return (
      (secondaryLabelElement.textContent = isDeviceButton
        ? String(buttonProperties.secondaryText || "").trim() ||
          (boundEntityId
            ? formatEntityState(boundEntityState, boundEntityId, {
                ...buttonRenderEnvironment,
                component: buttonComponent,
              })
            : "未选择实体")
        : String(buttonProperties.secondaryText || "MAIN LIGHT")),
      (secondaryLabelElement.style.color = normalizeCssColor(
        buttonProperties.secondaryColor ||
          buttonProperties.secondaryOffColor ||
          buttonProperties.secondaryOnColor,
        "#75777d",
      )),
      (secondaryLabelElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampNumber(
              isButtonActive
                ? buttonProperties.secondaryOnOpacity
                : buttonProperties.secondaryOffOpacity,
              0,
              1,
              1,
            ),
          )),
      (secondaryLabelElement.style.fontSize = secondaryTextSize * buttonUnitHeight + "px"),
      (secondaryLabelElement.style.letterSpacing =
        clampNumber(buttonProperties.secondarySpacing, -20, 100, 0.7) * buttonUnitHeight + "px"),
      applyTextOutline(secondaryLabelElement, buttonProperties.secondaryWeight, secondaryTextSize),
      (secondaryLabelElement.hidden =
        isDeviceButton &&
        buttonProperties.secondaryTextVisible === false &&
        buttonProperties.hiddenContentClickable !== true),
      isDeviceButton &&
        buttonProperties.secondaryTextVisible === false &&
        buttonProperties.hiddenContentClickable === true &&
        (secondaryLabelElement.style.visibility = "hidden"),
      buttonTextElement.append(primaryTextElement, secondaryLabelElement),
      deviceButtonElement.append(buttonTextElement),
      deviceButtonElement
    );
  },
};
