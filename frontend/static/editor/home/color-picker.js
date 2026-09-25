/*
 * 取色器。
 *
 * 颜色输入框的增强、取色面板的定位与拖拽、HSV/RGB 提交，以及取色期间的预览联动。
 *
 * 由 static/editor/home.js 外提而来：这里只放函数，对 home.js 模块级状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 home.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

import { clampNumber } from "../../utils/numbers.js?v=2609251920";
import {
  hexColorOrEmpty,
  paletteColor,
  strictHexColorOrEmpty
} from "../../utils/colors.js?v=2609251920";
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb } from "../editor-utils.js?v=2609251920";

export function createColorPicker(ctx) {

  /**
   * 把子树里的原生 color 输入框换成「点击弹自建取色器」的行为。用 pointerdown 而不是 click 打开，
   * 是为了抢在原生取色面板弹出前 preventDefault；绑定记录存在 colorPickerBoundInputs 里，重复增强不叠加监听。
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
   * 切换前先关掉旧的，避免 input 事件被派发到已经不该响应的控件上。
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
   * 收尾才补一次 change：调用方普遍把 change 当作「一次编辑结束」的提交点，只有此时才写历史。
   */
  function closeColorPicker() {
    // 先把它从 dialog 里还回 body 原位，无论有没有 active 输入框：留在 dialog 里的话，
    // dialog 关闭一帧后会被惰性卸载（editor-dialogs.js），取色器会连着被摘离文档
    // —— 之后 document.getElementById 都找不到它，只能靠这里的模块引用重新挂回去。
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

  /**
   * 把颜色选择器的 RGB 三个通道输入合成十六进制并提交（失焦与输入时都会触发）。各通道先夹到 0–255（用户可能输入越界数字），
   * 只有三个值都是有限数才提交，避免在输入中途用残缺值刷掉当前颜色。
   */
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

  /**
   * 按指针位置更新 HSV 取色器的饱和度与明度，并立即提交给当前输入框。坐标换算成 0~1 的比例：x 相对色块左边距除以宽度得饱和度；
   * y 相对上边距除以高度后取反得明度（HSV 的明度向上递增，而 DOM 的 y 轴向下）。分母用 Math.max(1, …) 兜底，防止色块尚未完成布局
   * （宽高为 0）时除零，否则结果会变成 NaN/Infinity 并写进输入框。由色块的 pointerdown / pointermove 调用（拖动过程中连续触发）。
   */
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
   * 否则每次选灰色都会把色相重置为 0，用户再拖饱和度时颜色会跳变。
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
   * isConnected 一并判断，元素已被移除时直接跳过。
   */
  function syncOpenColorPicker() {
    if (!ctx.globalColorPickerElement.hidden && ctx.activeColorInputElement?.isConnected) {
      syncColorPickerFromHex(ctx.activeColorInputElement.value);
    }
  }

  /**
   * 取色器该挂到哪个父节点下。
   *
   * 模态 <dialog> 在顶层渲染，body 级的 position: fixed 元素会被它整个压住。而且不只是
   * 「被遮住」：模态 dialog 会把 dialog 之外的一切设为 inert，实测连 popover 都不出现在
   * elementsFromPoint 的命中栈里 —— 提层级、加 z-index 都救不回来。
   * 所以输入框在 dialog 里时（例如站点配色面板的主控色），取色器必须挂进**同一个 dialog**，
   * 跟着它一起进顶层；没有 dialog 时回到 body，z-index 与侧栏菜单的关系不变。
   */
  function colorPickerHostFor(colorInputElement) {
    return colorInputElement.closest("dialog[open]") || document.body;
  }

  /**
   * 把取色器从它可能所在的 dialog 里还回 body 原位。
   *
   * 参照节点必须现取：globalColorPickerHomeNextSibling 那个兄弟自己就是一只 <dialog>，
   * 而惰性卸载（editor-dialogs.js）会把它摘离 DOM。拿着一个已脱离文档的节点去 insertBefore
   * 会抛 NotFoundError —— 于是 closeColorPicker 后面的「隐藏面板」全被跳过，取色器就这么
   * 亮着被 dialog 一起摘走。取不到活的参照就退化成 append，位置差一点也好过面板关不上。
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
