/**
 * `icon-button-effect` 控件：只负责注册，绘制与色温知识在 `effect-visuals.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=20260921192957";
import { mdiIconUrl } from "../../../../utils/icon-url.js?v=20260921192957";
// 同门分片：entity-state
import { isLightVisualActive } from "../entity-state.js?v=20260921192957";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=20260921192957";
// 同门分片：registry-visuals
import { resolveColor } from "../registry-visuals.js?v=20260921192957";

// 图标按钮光效控件：把状态色、辉光强度换算成 CSS 变量交给样式表，
// 图标用 mask-image 着色，因此可以跟随开 / 关态换色而不需要两张图。
registerComponent("icon-button-effect", {
  render(effectButtonComponent, effectButtonContext) {
    const effectButtonProperties = effectButtonComponent.properties || {};
    const isEffectButtonActive = isLightVisualActive(effectButtonComponent, effectButtonContext);
    const isEffectIconVisible =
      effectButtonContext?.isIconVisible?.(effectButtonComponent.id) !== false;
    const effectButtonElement = document.createElement("div");
    effectButtonElement.className =
      "hb-icon-button-effect" + (isEffectButtonActive ? " active" : "");
    effectButtonElement.hidden = effectButtonProperties.buttonVisible === false;
    effectButtonElement.style.opacity = isEffectIconVisible ? "1" : "0";
    effectButtonElement.style.transition = "opacity .24s ease";
    effectButtonElement.style.setProperty(
      "--effect-button-color",
      resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.buttonOnColor
          : effectButtonProperties.buttonOffColor,
        isEffectButtonActive ? "#1f91b8" : "#17242d"
      )
    );
    effectButtonElement.style.setProperty(
      "--effect-button-opacity",
      clampCoercedNumber(effectButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-color",
      resolveColor(effectButtonProperties.frameColor, "#dcebf2")
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-width",
      clampCoercedNumber(effectButtonProperties.frameWidth, 0, 20, 1.5) + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-opacity",
      clampCoercedNumber(effectButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-radius",
      clampCoercedNumber(effectButtonProperties.radius, 0, 50, 50) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-color",
      resolveColor(effectButtonProperties.glowColor, "#43c8f0")
    );
    const effectGlowStrength = clampCoercedNumber(
      isEffectButtonActive
        ? effectButtonProperties.glowOnStrength
        : effectButtonProperties.glowOffStrength,
      0,
      3,
      isEffectButtonActive ? 1 : 0
    );
    effectButtonElement.style.setProperty("--effect-glow-size", effectGlowStrength * 18 + "px");
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-size",
      effectGlowStrength * 13 + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-opacity",
      Math.min(100, effectGlowStrength * 38) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-opacity",
      Math.min(100, effectGlowStrength * 30) + "%"
    );
    const effectIconSource = mdiIconUrl(effectButtonProperties.icon || "mdi:lightbulb-outline");
    if (effectIconSource) {
      const effectIconElement = document.createElement("i");
      effectIconElement.className = "hb-icon-button-effect-icon";
      effectIconElement.style.transition = "opacity .24s ease";
      effectIconElement.style.opacity = isEffectIconVisible ? "1" : "0";
      effectIconElement.style.backgroundColor = resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.iconOnColor
          : effectButtonProperties.iconOffColor,
        isEffectButtonActive ? "#ffffff" : "#9aa5ad"
      );
      effectIconElement.style.width =
        clampCoercedNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.height =
        clampCoercedNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.maskImage = 'url("' + effectIconSource + '")';
      effectIconElement.style.webkitMaskImage = 'url("' + effectIconSource + '")';
      effectButtonElement.append(effectIconElement);
    }
    return effectButtonElement;
  }
});
