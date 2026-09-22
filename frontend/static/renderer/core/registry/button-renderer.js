/**
 * `icon-button` / `device-button` 共用的按钮渲染器：图标、状态文案、配色与点击反馈。
 *
 * 两个控件类型外观与交互一致，差异只在默认图标与尺寸，因此共用这一份实现；
 * `components/icon-button.js` 只负责把同一份渲染器注册到两个类型名上。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import {
  clampCoercedNumber,
  clampNumber
} from "../../../utils/numbers.js?v=2609221226";
// 状态条目归一统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry } from "../../../utils/state-entry.js?v=2609221226";
import { mdiIconUrl } from "../../../utils/icon-url.js?v=2609221226";
// 同门分片：entity-state
import {
  formatEntityState,
  isDeviceButtonVisualActive,
  resolveStateIcon
} from "./entity-state.js?v=2609221226";
// 同门分片：registry-visuals
import {
  appendSvgElement,
  applyFontWeight,
  componentContentUnitsPx,
  resolveColor
} from "./registry-visuals.js?v=2609221226";

// 图标按钮与设备按钮共用同一份渲染器：两者结构一致，差异只在 data 里带的类型，
// 渲染时用 component.type 区分（见下面的 isDeviceButton）。
export const buttonRenderer = {
  render(deviceButtonComponent, deviceButtonContext) {
    const deviceButtonProperties = deviceButtonComponent.properties || {};
    const isDeviceButton = deviceButtonComponent.type === "device-button";
    const deviceButtonEntityId = deviceButtonComponent.bindings?.entity?.entityId || "";
    const deviceButtonState = deviceButtonContext.states?.get(deviceButtonEntityId);
    const deviceButtonResolvedState = resolveStateEntry(deviceButtonState);
    const isDeviceButtonActive = isDeviceButtonVisualActive(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonWidth = Math.max(20, Number(deviceButtonComponent.position?.width || 144));
    const deviceButtonHeight = Math.max(20, Number(deviceButtonComponent.position?.height || 150));
    const { height: deviceButtonUnitPx } = componentContentUnitsPx(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonCutCorner =
      (Math.min(deviceButtonWidth, deviceButtonHeight) *
        clampCoercedNumber(deviceButtonProperties.cutCorner, 0, 50, 20)) /
      100;
    const deviceButtonFrameWidth = clampCoercedNumber(deviceButtonProperties.frameWidth, 0, 12, 1);
    const deviceButtonFrameAngle = clampCoercedNumber(deviceButtonProperties.frameAngle, 0, 360, 45);
    const deviceButtonFrameOpacity = clampCoercedNumber(
      isDeviceButtonActive
        ? deviceButtonProperties.frameOnOpacity
        : deviceButtonProperties.frameOffOpacity,
      0,
      1,
      isDeviceButtonActive ? 1 : 0.8
    );
    const deviceButtonSoftLightColor = resolveColor(
      deviceButtonProperties.softLightColor,
      "#ffffff"
    );
    const deviceButtonSoftLightStrength = clampCoercedNumber(
      deviceButtonProperties.softLightStrength,
      0,
      5,
      1
    );
    const deviceButtonSoftLightSize = clampCoercedNumber(deviceButtonProperties.softLightSize, 0, 3, 1);
    const deviceButtonSoftLightAngle = clampCoercedNumber(
      deviceButtonProperties.softLightAngle,
      0,
      360,
      45
    );
    const deviceButtonGlowColor = resolveColor(deviceButtonProperties.glowColor, "#ffffff");
    const deviceButtonGlowStrength = clampCoercedNumber(deviceButtonProperties.glowStrength, 0, 5, 1);
    const deviceButtonGlowSize = clampCoercedNumber(deviceButtonProperties.glowSize, 0, 3, 1);
    const deviceButtonGlowAngle = clampCoercedNumber(deviceButtonProperties.glowAngle, 0, 360, 220);
    const deviceButtonCenterX = deviceButtonWidth / 2;
    const deviceButtonCenterY = deviceButtonHeight / 2;
    // 光晕按角度定位到控件一侧：先换成弧度，再沿该方向按宽高的固定比例（16% / 18%）偏移，
    // 比例取宽高各自的百分比而不是统一半径，控件被拉扁时光晕才不会跑出边缘。
    const deviceButtonGlowAngleRad = (deviceButtonGlowAngle * Math.PI) / 180;
    const deviceButtonGlowX =
      deviceButtonCenterX + Math.cos(deviceButtonGlowAngleRad) * deviceButtonWidth * 0.16;
    const deviceButtonGlowY =
      deviceButtonCenterY + Math.sin(deviceButtonGlowAngleRad) * deviceButtonHeight * 0.18;
    const deviceButtonNamespace =
      (deviceButtonContext.renderNamespace || "renderer") +
      "-icon-button-" +
      String(deviceButtonComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const deviceButtonElement = document.createElement("div");
    deviceButtonElement.className = "hb-icon-button" + (isDeviceButtonActive ? " active" : "");
    deviceButtonElement.style.setProperty(
      "--icon-button-main-left",
      clampCoercedNumber(deviceButtonProperties.mainTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-main-top",
      clampCoercedNumber(deviceButtonProperties.mainTextTop, -100, 200, 78) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-left",
      clampCoercedNumber(deviceButtonProperties.secondaryTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-top",
      clampCoercedNumber(deviceButtonProperties.secondaryTextTop, -100, 200, 91) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-left",
      clampCoercedNumber(deviceButtonProperties.iconLeft, -100, 200, 50) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-top",
      clampCoercedNumber(deviceButtonProperties.iconTop, -100, 200, 34) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-glow-size",
      deviceButtonUnitPx * 9 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-glow-size",
      deviceButtonUnitPx * 5 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-active-glow-size",
      deviceButtonUnitPx * 7 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--hb-on-fill-fade-duration",
      clampCoercedNumber(deviceButtonProperties.onFillFadeDuration, 0, 3, 0.3) + "s"
    );
    if (!isDeviceButton) {
      const deviceButtonFrameSvg = appendSvgElement(deviceButtonElement, "svg", {
        viewBox: "0 0 " + deviceButtonWidth + " " + deviceButtonHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      const deviceButtonDefsElement = appendSvgElement(deviceButtonFrameSvg, "defs");
      const deviceButtonPolygonPoints =
        "0,0 " +
        (deviceButtonWidth - deviceButtonCutCorner) +
        ",0 " +
        deviceButtonWidth +
        "," +
        deviceButtonCutCorner +
        " " +
        deviceButtonWidth +
        "," +
        deviceButtonHeight +
        " 0," +
        deviceButtonHeight;
      const deviceButtonClipPath = appendSvgElement(deviceButtonDefsElement, "clipPath", {
        id: deviceButtonNamespace + "-clip"
      });
      appendSvgElement(deviceButtonClipPath, "polygon", {
        points: deviceButtonPolygonPoints
      });
      const deviceButtonSoftLightHalfWidth = deviceButtonWidth * 0.5 * deviceButtonSoftLightSize;
      const deviceButtonSoftLightGradient = appendSvgElement(
        deviceButtonDefsElement,
        "linearGradient",
        {
          id: deviceButtonNamespace + "-soft-light",
          gradientUnits: "userSpaceOnUse",
          x1: deviceButtonCenterX - deviceButtonSoftLightHalfWidth,
          y1: deviceButtonCenterY,
          x2: deviceButtonCenterX + deviceButtonSoftLightHalfWidth,
          y2: deviceButtonCenterY,
          gradientTransform:
            "rotate(" +
            deviceButtonSoftLightAngle +
            " " +
            deviceButtonCenterX +
            " " +
            deviceButtonCenterY +
            ")"
        }
      );
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.055)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0.55,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.018)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.085)
      });
      const deviceButtonEdgeGradient = appendSvgElement(deviceButtonDefsElement, "linearGradient", {
        id: deviceButtonNamespace + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: deviceButtonCenterY,
        x2: deviceButtonWidth,
        y2: deviceButtonCenterY,
        gradientTransform:
          "rotate(" +
          deviceButtonFrameAngle +
          " " +
          deviceButtonCenterX +
          " " +
          deviceButtonCenterY +
          ")"
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0.48,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.49
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 1,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.66
      });
      const deviceButtonGlowGradient = appendSvgElement(deviceButtonDefsElement, "radialGradient", {
        id: deviceButtonNamespace + "-glow",
        gradientUnits: "userSpaceOnUse",
        cx: deviceButtonGlowX,
        cy: deviceButtonGlowY,
        r: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.42 * deviceButtonGlowSize
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.12)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0.52,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.025)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": 0
      });
      const deviceButtonGlowFilter = appendSvgElement(deviceButtonDefsElement, "filter", {
        id: deviceButtonNamespace + "-glow-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%"
      });
      appendSvgElement(deviceButtonGlowFilter, "feGaussianBlur", {
        stdDeviation: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.03
      });
      const deviceButtonClippedGroup = appendSvgElement(deviceButtonFrameSvg, "g", {
        "clip-path": "url(#" + deviceButtonNamespace + "-clip)"
      });
      if (deviceButtonProperties.onFillVisible !== false) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          class: "hb-icon-button-on-fill",
          points: deviceButtonPolygonPoints,
          fill: resolveColor(deviceButtonProperties.onFillColor, "#dfb64f"),
          "fill-opacity": clampCoercedNumber(deviceButtonProperties.onFillStrength, 0, 1, 1)
        });
      }
      if (deviceButtonProperties.softLightVisible !== false && deviceButtonSoftLightSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "url(#" + deviceButtonNamespace + "-soft-light)"
        });
      }
      if (deviceButtonProperties.glowVisible !== false && deviceButtonGlowSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "ellipse", {
          cx: deviceButtonGlowX,
          cy: deviceButtonGlowY,
          rx: deviceButtonWidth * 0.42 * deviceButtonGlowSize,
          ry: deviceButtonHeight * 0.42 * deviceButtonGlowSize,
          fill: "url(#" + deviceButtonNamespace + "-glow)",
          filter: "url(#" + deviceButtonNamespace + "-glow-blur)"
        });
      }
      if (deviceButtonProperties.frameVisible !== false && deviceButtonFrameWidth > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "none",
          stroke: "url(#" + deviceButtonNamespace + "-edge)",
          "stroke-width": deviceButtonFrameWidth,
          "vector-effect": "non-scaling-stroke"
        });
      }
    }
    const deviceButtonIconName =
      String(deviceButtonProperties.icon || "").trim() ||
      (isDeviceButton
        ? resolveStateIcon(deviceButtonEntityId, deviceButtonState)
        : "mdi:ceiling-light");
    const deviceButtonIconSource = mdiIconUrl(deviceButtonIconName);
    if (
      deviceButtonIconSource &&
      (!isDeviceButton ||
        deviceButtonProperties.iconVisible !== false ||
        deviceButtonProperties.hiddenContentClickable === true)
    ) {
      const deviceButtonIconElement = document.createElement("i");
      deviceButtonIconElement.className = isDeviceButton
        ? "hb-device-button-icon"
        : "hb-icon-button-icon";
      if (!isDeviceButton) {
        deviceButtonIconElement.style.width =
          clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
        deviceButtonIconElement.style.height =
          clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
      }
      deviceButtonIconElement.style.backgroundColor =
        isDeviceButton && isDeviceButtonActive
          ? resolveColor(deviceButtonProperties.iconOnColor, "#379bff")
          : resolveColor(
              deviceButtonProperties.iconColor ||
                deviceButtonProperties.iconOffColor ||
                deviceButtonProperties.iconOnColor,
              "#d7d8da"
            );
      deviceButtonIconElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampCoercedNumber(
              isDeviceButtonActive
                ? deviceButtonProperties.iconOnOpacity
                : deviceButtonProperties.iconOffOpacity,
              0,
              1,
              1
            )
          );
      deviceButtonIconElement.style.maskImage = 'url("' + deviceButtonIconSource + '")';
      deviceButtonIconElement.style.webkitMaskImage = 'url("' + deviceButtonIconSource + '")';
      if (isDeviceButton) {
        const deviceButtonIconSize = clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 28);
        const deviceButtonBadgeSize = clampCoercedNumber(
          deviceButtonProperties.badgeSize ?? deviceButtonIconSize,
          1,
          100,
          deviceButtonIconSize
        );
        const deviceButtonSymbolSize = clampCoercedNumber(
          deviceButtonProperties.symbolSize ?? deviceButtonIconSize * 0.5,
          1,
          100,
          // 图标取下限 1 时「一半」是 0.5 —— 兜底现在原样返回，所以在调用点先夹一次，
          // 行为与统一前（兜底跟着夹）逐字相同。
          clampNumber(deviceButtonIconSize * 0.5, 1, 100)
        );
        const deviceButtonSymbolPercent = clampCoercedNumber(
          (deviceButtonSymbolSize / deviceButtonBadgeSize) * 100,
          1,
          100,
          50
        );
        deviceButtonIconElement.style.width = deviceButtonSymbolPercent + "%";
        deviceButtonIconElement.style.height = deviceButtonSymbolPercent + "%";
        const deviceButtonBadgeElement = document.createElement("span");
        deviceButtonBadgeElement.className =
          "hb-device-button-icon-badge" + (isDeviceButtonActive ? " active" : "");
        if (deviceButtonProperties.iconVisible === false) {
          deviceButtonBadgeElement.style.visibility = "hidden";
        }
        deviceButtonBadgeElement.style.width = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.height = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-color",
          resolveColor(deviceButtonProperties.badgeColor, "#5b5e66")
        );
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-opacity",
          clampCoercedNumber(deviceButtonProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
        );
        deviceButtonBadgeElement.append(deviceButtonIconElement);
        deviceButtonElement.append(deviceButtonBadgeElement);
      } else {
        deviceButtonElement.append(deviceButtonIconElement);
      }
    }
    const deviceButtonTextElement = document.createElement("span");
    deviceButtonTextElement.className = "hb-icon-button-text";
    const deviceButtonMainTextSize = clampCoercedNumber(deviceButtonProperties.mainSize, 6, 120, 25);
    const deviceButtonMainTextElement = document.createElement("strong");
    deviceButtonMainTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.mainText || "").trim() ||
        String(
          deviceButtonResolvedState?.attributes?.friendly_name ||
            deviceButtonEntityId ||
            "未选择实体"
        )
      : String(deviceButtonProperties.mainText || "主灯");
    deviceButtonMainTextElement.style.color = resolveColor(
      deviceButtonProperties.mainColor ||
        deviceButtonProperties.mainOffColor ||
        deviceButtonProperties.mainOnColor,
      "#c7c8cb"
    );
    deviceButtonMainTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampCoercedNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.mainOnOpacity
              : deviceButtonProperties.mainOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonMainTextElement.style.fontSize =
      deviceButtonMainTextSize * deviceButtonUnitPx + "px";
    deviceButtonMainTextElement.style.letterSpacing =
      clampCoercedNumber(deviceButtonProperties.mainSpacing, -20, 100, 1) * deviceButtonUnitPx + "px";
    applyFontWeight(
      deviceButtonMainTextElement,
      deviceButtonProperties.mainWeight,
      deviceButtonMainTextSize
    );
    deviceButtonMainTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonMainTextElement.style.visibility = "hidden";
    }
    const deviceButtonSecondaryTextSize = clampCoercedNumber(
      deviceButtonProperties.secondarySize,
      5,
      80,
      10
    );
    const deviceButtonSecondaryTextElement = document.createElement("small");
    deviceButtonSecondaryTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.secondaryText || "").trim() ||
        (deviceButtonEntityId
          ? formatEntityState(deviceButtonState, deviceButtonEntityId, {
              ...deviceButtonContext,
              component: deviceButtonComponent
            })
          : "未选择实体")
      : String(deviceButtonProperties.secondaryText || "MAIN LIGHT");
    deviceButtonSecondaryTextElement.style.color = resolveColor(
      deviceButtonProperties.secondaryColor ||
        deviceButtonProperties.secondaryOffColor ||
        deviceButtonProperties.secondaryOnColor,
      "#75777d"
    );
    deviceButtonSecondaryTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampCoercedNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.secondaryOnOpacity
              : deviceButtonProperties.secondaryOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonSecondaryTextElement.style.fontSize =
      deviceButtonSecondaryTextSize * deviceButtonUnitPx + "px";
    deviceButtonSecondaryTextElement.style.letterSpacing =
      clampCoercedNumber(deviceButtonProperties.secondarySpacing, -20, 100, 0.7) * deviceButtonUnitPx +
      "px";
    applyFontWeight(
      deviceButtonSecondaryTextElement,
      deviceButtonProperties.secondaryWeight,
      deviceButtonSecondaryTextSize
    );
    deviceButtonSecondaryTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonSecondaryTextElement.style.visibility = "hidden";
    }
    deviceButtonTextElement.append(deviceButtonMainTextElement, deviceButtonSecondaryTextElement);
    deviceButtonElement.append(deviceButtonTextElement);
    return deviceButtonElement;
  }
};
