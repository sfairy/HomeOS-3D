/*
 * 取色器。
 */

import { clampNumber } from "../../utils/numbers.js?v=2609271508";
import {
  hexColorOrEmpty,
  paletteColor,
  strictHexColorOrEmpty
} from "../../utils/colors.js?v=2609271508";
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb } from "../editor-utils.js?v=2609271508";

export function createColorPicker(ctx) {

  /**
   * 把子树里的原生 color 输入框换成「点击弹自建取色器」的行为。用 pointerdown 而不是 click 打开，
   */
  function enhanceColorInputsIn(colorRootNode = document) {
    (colorRootNode instanceof HTMLInputElement && colorRootNode.type === "color"
      ? [colorRootNode]
      : [...(colorRootNode.querySelectorAll?.('input[type="color"]') || [])]
    ).forEach(colorInputCandidate => {
      if (!ctx.colorPickerBoundInputs.has(colorInputCandidate)) {
        ctx.colorPickerBoundInputs.set(colorInputCandidate, true);
        colorInputCandidate.title = "打开颜色选择器";
        colorInputCandidate.addEventListener("pointerdown", colorPointerEvent => {
          colorPointerEvent.preventDefault();
          openColorPickerForInput(colorInputCandidate);
        });
        colorInputCandidate.addEventListener("click", colorClickEvent =>
          colorClickEvent.preventDefault()
        );
        colorInputCandidate.addEventListener("keydown", colorKeyEvent => {
          if (["Enter", " "].includes(colorKeyEvent.key)) {
            colorKeyEvent.preventDefault();
            openColorPickerForInput(colorInputCandidate);
          }
        });
      }
    });
  }

  /**
   * 为某个颜色输入框打开取色器，并把输入框现值解析成初始 HSV。同一时刻只服务一个输入框：
   */
  function openColorPickerForInput(colorInputElement) {
    if (!colorInputElement || colorInputElement.disabled) {
      return;
    }
    if (ctx.activeColorInputElement && ctx.activeColorInputElement !== colorInputElement) {
      closeColorPicker();
    }
    const colorPickerHost = colorPickerHostFor(colorInputElement);
    if (ctx.globalColorPickerElement.parentElement !== colorPickerHost) {
      colorPickerHost.append(ctx.globalColorPickerElement);
    }
    ctx.activeColorInputElement = colorInputElement;
    ctx.activeColorHex = hexColorOrEmpty(colorInputElement.value) || "#000000";
    const inputHsvColor = rgbToHsv(hexToRgb(ctx.activeColorHex));
    ctx.colorPickerHue = inputHsvColor.h;
    ctx.colorPickerSaturation = inputHsvColor.s;
    ctx.colorPickerBrightness = inputHsvColor.v;
    ctx.globalColorPickerElement.hidden = false;
    syncColorPickerFromHex(ctx.activeColorHex);
    window.requestAnimationFrame(positionColorPicker);
  }

  /**
   * 关闭取色器面板，并在颜色确实变化时补发 change 事件。拖动过程中只派发 input（实时预览），
   */
  function closeColorPicker() {
    // 先把它从 dialog 里还回 body 原位，无论有没有 active 输入框：留在 dialog 里的话，
    returnColorPickerToBody();
    if (!ctx.activeColorInputElement) {
      return;
    }
    const closingColorInput = ctx.activeColorInputElement;
    const colorValueChanged = hexColorOrEmpty(closingColorInput.value) !== ctx.activeColorHex;
    ctx.globalColorPickerElement.hidden = true;
    ctx.activeColorInputElement = null;
    ctx.colorPickerDragPointerId = null;
    if (colorValueChanged) {
      closingColorInput.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );
    }
    ctx.resetPreviewForInput(closingColorInput);
  }

  /**
   * 把当前 HSV 取色结果换算回十六进制并写回输入框。
   */
  function commitColorPickerHsv() {
    const previewRgbColor = hsvToRgb(ctx.colorPickerHue, ctx.colorPickerSaturation, ctx.colorPickerBrightness);
    syncColorPickerFromHex(rgbToHex(previewRgbColor.r, previewRgbColor.g, previewRgbColor.b), true);
  }

  const commitColorPickerFromRgb = () => {
    if (!ctx.activeColorInputElement) {
      return;
    }
    const redChannel = clampNumber(Number(ctx.globalColorPickerRedInputElement.value), 0, 255);
    const greenChannel = clampNumber(Number(ctx.globalColorPickerGreenInputElement.value), 0, 255);
    const blueChannel = clampNumber(Number(ctx.globalColorPickerBlueInputElement.value), 0, 255);
    if ([redChannel, greenChannel, blueChannel].every(Number.isFinite)) {
      syncColorPickerFromHex(rgbToHex(redChannel, greenChannel, blueChannel), true);
    }
  };

  const updateColorPickerFromPointer = saturationPointerEvent => {
    const saturationAreaRect = ctx.globalColorPickerSaturationValueElement.getBoundingClientRect();
    ctx.colorPickerSaturation = clampNumber(
      (saturationPointerEvent.clientX - saturationAreaRect.left) /
        Math.max(1, saturationAreaRect.width),
      0,
      1
    );
    ctx.colorPickerBrightness =
      1 -
      clampNumber(
        (saturationPointerEvent.clientY - saturationAreaRect.top) /
          Math.max(1, saturationAreaRect.height),
        0,
        1
      );
    commitColorPickerHsv();
  };

  /**
   * 把取色器面板贴到当前输入框旁边，优先左侧、放不下再翻到右侧，并做视口钳制。
   */
  function positionColorPicker() {
    if (ctx.globalColorPickerElement.hidden || !ctx.activeColorInputElement) {
      return;
    }
    const colorInputRect = ctx.activeColorInputElement.getBoundingClientRect();
    const colorPickerRect = ctx.globalColorPickerElement.getBoundingClientRect();
    const colorPickerGapPx = 9;
    const colorPickerMarginPx = 8;
    const colorPickerLeftCandidatePx = colorInputRect.left - colorPickerRect.width - colorPickerGapPx;
    const colorPickerLeftPx =
      colorPickerLeftCandidatePx >= colorPickerMarginPx
        ? colorPickerLeftCandidatePx
        : Math.min(
            window.innerWidth - colorPickerRect.width - colorPickerMarginPx,
            colorInputRect.right + colorPickerGapPx
          );
    const colorPickerTopPx = clampNumber(
      colorInputRect.top,
      colorPickerMarginPx,
      Math.max(colorPickerMarginPx, window.innerHeight - colorPickerRect.height - colorPickerMarginPx)
    );
    ctx.globalColorPickerElement.style.left = Math.max(colorPickerMarginPx, colorPickerLeftPx) + "px";
    ctx.globalColorPickerElement.style.top = colorPickerTopPx + "px";
  }

  /**
   * 用十六进制色值刷新取色器面板，并可选地回写到当前绑定的输入框。饱和度为 0（灰阶）时保留原色相，
   */
  function syncColorPickerFromHex(hexColorValue, shouldDispatchInput = false) {
    const normalizedHex = hexColorOrEmpty(hexColorValue);
    if (!normalizedHex || !ctx.activeColorInputElement) {
      return;
    }
    const rgbColor = hexToRgb(normalizedHex);
    const hsvColor = rgbToHsv(rgbColor);
    ctx.colorPickerHue = hsvColor.s > 0 ? hsvColor.h : ctx.colorPickerHue;
    ctx.colorPickerSaturation = hsvColor.s;
    ctx.colorPickerBrightness = hsvColor.v;
    ctx.globalColorPickerElement.style.setProperty(
      "--picker-hue",
      "hsl(" + ctx.colorPickerHue + " 100% 50%)"
    );
    ctx.globalColorPickerElement.style.setProperty("--picker-color", normalizedHex);
    ctx.globalColorPickerMarkerElement.style.left = ctx.colorPickerSaturation * 100 + "%";
    ctx.globalColorPickerMarkerElement.style.top = (1 - ctx.colorPickerBrightness) * 100 + "%";
    ctx.globalColorPickerHueRangeInputElement.value = String(Math.round(ctx.colorPickerHue));
    if (document.activeElement !== ctx.globalColorPickerHexTextInputElement) {
      ctx.globalColorPickerHexTextInputElement.value = normalizedHex.toUpperCase();
    }
    ctx.globalColorPickerRedInputElement.value = String(Math.round(rgbColor.r));
    ctx.globalColorPickerGreenInputElement.value = String(Math.round(rgbColor.g));
    ctx.globalColorPickerBlueInputElement.value = String(Math.round(rgbColor.b));
    ctx.globalColorPickerSwatchElement.style.background = normalizedHex;
    if (ctx.activeColorInputElement.value !== normalizedHex) {
      ctx.activeColorInputElement.value = normalizedHex;
      if (shouldDispatchInput) {
        ctx.activeColorInputElement.dispatchEvent(
          new Event("input", {
            bubbles: true
          })
        );
      }
    }
  }

  /**
   * 取色器开着时，把绑定输入框的当前值重新同步进面板。输入框可能被别的逻辑（如「应用样式」）改写，
   */
  function syncOpenColorPicker() {
    if (!ctx.globalColorPickerElement.hidden && ctx.activeColorInputElement?.isConnected) {
      syncColorPickerFromHex(ctx.activeColorInputElement.value);
    }
  }

  /**
   * 取色器该挂到哪个父节点下。
   */
  function colorPickerHostFor(colorInputElement) {
    return colorInputElement.closest("dialog[open]") || document.body;
  }

  /**
   * 把取色器从它可能所在的 dialog 里还回 body 原位。
   */
  function returnColorPickerToBody() {
    if (ctx.globalColorPickerElement.parentElement === document.body) {
      return;
    }
    const anchor =
      ctx.globalColorPickerHomeNextSibling?.isConnected ? ctx.globalColorPickerHomeNextSibling : null;
    document.body.insertBefore(ctx.globalColorPickerElement, anchor);
  }

  return { closeColorPicker, colorPickerHostFor, commitColorPickerFromRgb, commitColorPickerHsv, enhanceColorInputsIn, openColorPickerForInput, positionColorPicker, returnColorPickerToBody, syncColorPickerFromHex, syncOpenColorPicker, updateColorPickerFromPointer };
}
