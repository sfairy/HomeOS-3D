/**
 * `navigation-button` 控件：跳转 + 特效层 + 高亮，后两者在 `navigation-effects.js`。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import {
  clampCoercedNumber,
  clampNumber
} from "../../../../utils/numbers.js?v=2609260900";
import { mdiIconUrl } from "../../../../utils/icon-url.js?v=2609260900";
// 同门分片：entity-state
import { isComponentEntityActive } from "../entity-state.js?v=2609260900";
// 同门分片：navigation-effects
import {
  buildNavigationEffects,
  navigationButtonIsActive
} from "../navigation-effects.js?v=2609260900";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609260900";
// 同门分片：registry-visuals
import {
  navigationContentUnitPx,
  resolveColor
} from "../registry-visuals.js?v=2609260900";

// 导航按钮控件：目标页取自三个点击动作里的 navigate，其次才是 properties.targetPage；
// 高亮状态由 navigationButtonIsActive 统一判定。
registerComponent("navigation-button", {
  render(navigationComponent, navigationContext) {
    const navigationProperties = navigationComponent.properties || {};
    const navigationButtonTargetPage =
      ["tap", "doubleTap", "hold"]
        .map(navigationActionName => navigationComponent.actions?.[navigationActionName])
        .find(navigationAction => navigationAction?.type === "navigate" && navigationAction.target)
        ?.target ||
      navigationProperties.targetPage ||
      "";
    const navigationBindingEntityId = navigationComponent.bindings?.entity?.entityId || "";
    const navigationButtonPreviewState =
      navigationContext.editable && ["off", "on"].includes(navigationContext.previewState)
        ? navigationContext.previewState
        : "auto";
    const isNavigationTargetEntityActive =
      !!navigationBindingEntityId &&
      !!isComponentEntityActive(
        navigationComponent,
        navigationBindingEntityId,
        navigationContext.states?.get(navigationBindingEntityId),
        navigationContext
      );
    const isNavigationButtonActive = navigationButtonIsActive({
      targetPage: navigationButtonTargetPage,
      currentPagePath: navigationContext.page?.path || "",
      entityId: navigationBindingEntityId,
      entityActive: isNavigationTargetEntityActive,
      previewState: navigationButtonPreviewState
    });
    const navigationTextOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? (navigationProperties.textActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.textIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationIconOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? (navigationProperties.iconActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.iconIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationButtonFrameOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.frameActiveOpacity
        : navigationProperties.frameIdleOpacity,
      0,
      1,
      isNavigationButtonActive ? 0.98 : 0.48
    );
    const navigationButtonGlowStrength = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveStrength
        : navigationProperties.glowIdleStrength,
      0,
      5,
      isNavigationButtonActive ? 2.2 : 0.5
    );
    const navigationButtonGlowSize = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveSize
        : navigationProperties.glowIdleSize,
      0,
      3,
      isNavigationButtonActive ? 3 : 1.5
    );
    const navigationMainColor = resolveColor(navigationProperties.mainColor, "#e9edf0");
    const navigationSecondaryColor = resolveColor(navigationProperties.secondaryColor, "#e9edf0");
    const navigationLineHeightRatio = 100 / 64.36;
    const navigationUnitPx = navigationContentUnitPx(navigationComponent, navigationContext);
    const navigationTextLeft = clampCoercedNumber(navigationProperties.textLeft, -100, 200, 27.5);
    const navigationTextTop = clampCoercedNumber(navigationProperties.textTop, -100, 200, 81.5);
    const navigationMainLeft = clampCoercedNumber(
      navigationProperties.mainTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationMainTop = clampCoercedNumber(
      navigationProperties.mainTextTop,
      -100,
      200,
      // 兜底是「文本上移一个行高」的推导值（行高比 100/64.36），文本贴下限 -100 时会
      // 算到 -127 附近 —— 兜底现在原样返回，所以在调用点先夹一次，行为与统一前逐字相同。
      clampNumber(navigationTextTop - navigationLineHeightRatio * 18, -100, 200)
    );
    const navigationSecondaryLeft = clampCoercedNumber(
      navigationProperties.secondaryTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationSecondaryTop = clampCoercedNumber(
      navigationProperties.secondaryTextTop,
      -100,
      200,
      navigationTextTop
    );
    const navigationElement = document.createElement("div");
    navigationElement.className =
      "hb-navigation-button" + (isNavigationButtonActive ? " active" : "");
    navigationElement.dataset.targetPage = navigationButtonTargetPage;
    navigationElement.style.setProperty("--navigation-text-opacity", String(navigationTextOpacity));
    navigationElement.style.setProperty("--navigation-icon-opacity", String(navigationIconOpacity));
    navigationElement.style.setProperty(
      "--navigation-icon-size",
      clampCoercedNumber(navigationProperties.iconSize, 1, 500, 50) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-left",
      clampCoercedNumber(navigationProperties.iconLeft, -100, 200, 14) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-top",
      clampCoercedNumber(navigationProperties.iconTop, -100, 200, 50) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-main-size",
      clampCoercedNumber(navigationProperties.mainSize, 1, 500, 30) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-size",
      clampCoercedNumber(navigationProperties.secondarySize, 1, 500, 11) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-main-spacing",
      clampCoercedNumber(navigationProperties.mainSpacing, -20, 100, 8) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-spacing",
      clampCoercedNumber(navigationProperties.secondarySpacing, -20, 100, 3) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty("--navigation-main-left", navigationMainLeft + "%");
    navigationElement.style.setProperty(
      "--navigation-secondary-left",
      navigationSecondaryLeft + "%"
    );
    navigationElement.style.setProperty("--navigation-main-top", navigationMainTop + "%");
    navigationElement.style.setProperty("--navigation-secondary-top", navigationSecondaryTop + "%");
    if (navigationProperties.glowVisible !== false || navigationProperties.frameVisible !== false) {
      navigationElement.append(
        buildNavigationEffects(
          navigationComponent,
          navigationProperties,
          isNavigationButtonActive,
          navigationButtonFrameOpacity,
          navigationButtonGlowStrength,
          navigationButtonGlowSize
        )
      );
    }
    if (navigationProperties.iconVisible !== false) {
      const navigationIconSource = mdiIconUrl(
        navigationProperties.icon || "mdi:home-lightbulb-outline"
      );
      if (navigationIconSource) {
        const navigationIconElement = document.createElement("i");
        navigationIconElement.className = "hb-navigation-icon";
        navigationIconElement.setAttribute("aria-hidden", "true");
        navigationIconElement.style.backgroundColor = resolveColor(
          navigationProperties.iconColor,
          "#e9edf0"
        );
        navigationIconElement.style.maskImage = 'url("' + navigationIconSource + '")';
        navigationIconElement.style.webkitMaskImage = 'url("' + navigationIconSource + '")';
        navigationElement.append(navigationIconElement);
      }
    }
    const navigationTextElement = document.createElement("span");
    navigationTextElement.className = "hb-navigation-text";
    if (navigationProperties.mainTextVisible !== false) {
      const navigationMainTextElement = document.createElement("strong");
      navigationMainTextElement.textContent = navigationProperties.mainText || "页面导航";
      navigationMainTextElement.style.color = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeColor = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeWidth =
        clampCoercedNumber(navigationProperties.mainWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationMainTextElement);
    }
    if (navigationProperties.secondaryTextVisible !== false) {
      const navigationSecondaryTextElement = document.createElement("small");
      navigationSecondaryTextElement.textContent =
        navigationProperties.secondaryText || "NAVIGATION";
      navigationSecondaryTextElement.style.color = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeColor = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeWidth =
        clampCoercedNumber(navigationProperties.secondaryWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationSecondaryTextElement);
    }
    if (navigationTextElement.childElementCount) {
      navigationElement.append(navigationTextElement);
    }
    return navigationElement;
  }
});
