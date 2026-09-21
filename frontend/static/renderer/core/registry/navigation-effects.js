/**
 * 导航按钮的特效层与高亮判定。
 *
 * 高亮优先级：编辑态预览 → 目标页等于当前页 → 绑定实体的活动态；都没有时不高亮。
 */
import { randomUuid } from "../../../utils/random-id.js?v=20260921151446";
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../utils/numbers.js?v=20260921151446";
// 同门分片：registry-visuals
import { resolveColor } from "./registry-visuals.js?v=20260921151446";

/**
 * 生成导航按钮的边框与光晕 SVG：viewBox 宽度固定 236，高度按控件实际宽高比换算，配合
 * preserveAspectRatio=none 拉伸，内部只需按 236 宽的坐标系算边距、圆角与描边宽度。
 * 渐变 id 用随机 UUID 加后缀，避免同一页面上多个导航按钮的 id 冲突而引用到前一个的渐变。
 */
export function buildNavigationEffects(
  navFrameComponent,
  navFrameProperties,
  isNavFrameActive,
  navFrameOpacity,
  navGlowStrength,
  navGlowSize
) {
  const navFramePanelWidth = Math.max(1, Number(navFrameComponent.position?.width || 236));
  const navFramePanelHeight = Math.max(1, Number(navFrameComponent.position?.height || 100));
  const navFrameViewBoxHeight = Math.max(8, (navFramePanelHeight * 236) / navFramePanelWidth);
  const navFrameWidth = clampCoercedNumber(navFrameProperties.frameWidth, 0, 20, 2);
  const navFrameInset = Math.max(0.5, navFrameWidth / 2 + 0.5);
  const navFrameInnerWidth = Math.max(1, 236 - navFrameInset * 2);
  const navFrameInnerHeight = Math.max(1, navFrameViewBoxHeight - navFrameInset * 2);
  const navFrameCornerRadius =
    Math.min(navFrameInnerWidth, navFrameInnerHeight) *
    clampCoercedNumber(navFrameProperties.radius, 0, 0.5, 0.5);
  const navGlowOpacity = Math.min(1, navGlowStrength * 0.38);
  const navGlowStrokeWidth = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.42 * navGlowSize
  );
  const navGlowBlurStdDeviation = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.095 * navGlowSize
  );
  const navGradientCenterX = 118;
  const navGradientCenterY = navFrameViewBoxHeight / 2;
  const navFrameColorValue = resolveColor(navFrameProperties.frameColor, "#d9e0e6");
  const navGlowColorValue = resolveColor(navFrameProperties.glowColor, "#f2f6fa");
  const navFrameAngleValue = clampCoercedNumber(navFrameProperties.frameAngle, 0, 360, 45);
  const navGlowAngleValue = clampCoercedNumber(navFrameProperties.glowAngle, 0, 360, 45);
  const navOpacityDivisor = isNavFrameActive ? 0.98 : 0.48;
  // 把设计稿的透明度档位折算到当前控件的透明度：先乘 navFrameOpacity，再除以档位
  // 上限 navOpacityDivisor（活动 0.98 / 非活动 0.48），让最亮的 stop 恰好落在控件
  // 设定值上；末尾夹到 0~1，防止系数放大后溢出。
  const scaleNavOpacity = navOpacityInput =>
    Math.max(0, Math.min(1, (navOpacityInput * navFrameOpacity) / navOpacityDivisor));
  const navGradientIdSuffix = "navigation-" + randomUuid();
  const navigationFrameElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  navigationFrameElement.classList.add("hb-navigation-effects");
  navigationFrameElement.setAttribute("viewBox", "0 0 236 " + navFrameViewBoxHeight);
  navigationFrameElement.setAttribute("preserveAspectRatio", "none");
  navigationFrameElement.setAttribute("aria-hidden", "true");
  navigationFrameElement.innerHTML =
    '\n    <defs>\n      <linearGradient id="navigation-edge-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navFrameAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.98 : 0.48) +
    '"/>\n        <stop offset=".48" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.58 : 0.22) +
    '"/>\n        <stop offset="1" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.82 : 0.36) +
    '"/>\n      </linearGradient>\n      <linearGradient id="navigation-light-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navGlowAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity +
    '"/>\n        <stop offset=".45" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.35 +
    '"/>\n        <stop offset="1" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.72 +
    '"/>\n      </linearGradient>\n      <clipPath id="navigation-shape-' +
    navGradientIdSuffix +
    '"><rect x="' +
    navFrameInset +
    '" y="' +
    navFrameInset +
    '" width="' +
    navFrameInnerWidth +
    '" height="' +
    navFrameInnerHeight +
    '" rx="' +
    navFrameCornerRadius +
    '"/></clipPath>\n      <filter id="navigation-soft-light-' +
    navGradientIdSuffix +
    '" x="-35%" y="-75%" width="170%" height="250%"><feGaussianBlur stdDeviation="' +
    navGlowBlurStdDeviation +
    '"/></filter>\n    </defs>\n    ' +
    (navFrameProperties.glowVisible !== false && navGlowStrokeWidth > 0 && navGlowOpacity > 0
      ? '<g clip-path="url(#navigation-shape-' +
        navGradientIdSuffix +
        ')"><rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-light-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navGlowStrokeWidth +
        '" filter="url(#navigation-soft-light-' +
        navGradientIdSuffix +
        ')"/></g>'
      : "") +
    "\n    " +
    (navFrameProperties.frameVisible !== false
      ? '<rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-edge-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navFrameWidth +
        '"/>'
      : "") +
    "\n  ";
  return navigationFrameElement;
}

/**
 * 判断导航按钮是否高亮：优先级为编辑态预览 → 目标页等于当前页 → 绑定实体的活动态。
 * 都没有时按不高亮处理。
 */
export function navigationButtonIsActive({
  targetPage: navigationTargetPage = "",
  currentPagePath: activePagePath = "",
  entityId: navigationStateEntityId = "",
  entityActive: isNavigationEntityActive = false,
  previewState: navigationPreviewState = "auto"
} = {}) {
  if (navigationPreviewState === "on") {
    return true;
  } else if (navigationPreviewState === "off") {
    return false;
  } else if (navigationTargetPage) {
    return navigationTargetPage === activePagePath;
  } else {
    return !!navigationStateEntityId && !!isNavigationEntityActive;
  }
}
