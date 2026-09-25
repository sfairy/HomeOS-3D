/**
 * 编辑器基础检查器（Inspector）的通用计算。
 *
 * 右侧属性面板中图标按钮特效层、组件尺寸与百分比度量等基础项：切换「显示 / 隐藏」按钮态、
 * 归一特效层参数、把组件对齐到目标尺寸、把像素坐标换算成百分比与缩放值，以及按描述表把组件
 * 属性回填进面板控件（``applyInspectorFields`` / ``applyInspectorToggles``，各组件自己的描述表
 * 留在 home.js 里贴着对应的 sync 函数）。画布默认尺寸 2778×1940 与后端 schema 一致；百分比
 * 保留 editor-utils 的 roundField 精度并对越界做 clamp。
 */
import { roundField } from "./editor-utils.js?v=2609251920";
import { clampNumber } from "../utils/numbers.js?v=2609251920";

/**
 * 同步「显示 / 隐藏」切换按钮的按压态与文案。
 */
export function setInspectorToggle(toggleElement, isPressed) {
  toggleElement.setAttribute("aria-pressed", String(isPressed));
  toggleElement.textContent = isPressed ? "隐藏" : "显示";
}

/**
 * 归一图标按钮特效的编辑层参数。
 */
export function iconButtonEffectInspectorLayer(component = {}, requestedLayer = "") {
  if (requestedLayer === "button" || requestedLayer === "effect") {
    return requestedLayer;
  } else {
    // 未知层一律回退到按钮层，保证面板永远有可编辑对象。
    return "button";
  }
}

/**
 * 把组件按目标尺寸做中心对齐缩放。
 */
export function fitInspectorComponentToDimensions(sourceComponent, properties, measureDimensions) {
  if (!sourceComponent) {
    return;
  }
  const width = Number(sourceComponent.position?.width || 100);
  const height = Number(sourceComponent.position?.height || 100);
  const centerX = Number(sourceComponent.position?.x || 0) + width / 2;
  const centerY = Number(sourceComponent.position?.y || 0) + height / 2;
  const { width: targetWidth, height: targetHeight } = measureDimensions(properties);
  // 保持中心点不动，只改宽高与左上角坐标，视觉上就是「以中心缩放」。
  sourceComponent.position = {
    ...(sourceComponent.position || {}),
    x: centerX - targetWidth / 2,
    y: centerY - targetHeight / 2,
    width: targetWidth,
    height: targetHeight
  };
}

/**
 * 计算面板要展示的组件度量值（百分比定位 / 宽高 / 缩放 / 旋转）。
 */
export function inspectorComponentMetrics(inspectedComponent, editorDocument) {
  const position = inspectedComponent.position || {};
  const canvasWidth = Number(editorDocument?.canvas?.width || 2778);
  const canvasHeight = Number(editorDocument?.canvas?.height || 1940);
  const componentWidth = Number(position.width || 100);
  const componentHeight = Number(position.height || 100);
  return {
    position: position,
    width: componentWidth,
    height: componentHeight,
    // left/top 是「组件中心」在画布中的百分比，与后端存储的左上角坐标区分开。
    left: roundField(
      clampNumber(((Number(position.x || 0) + componentWidth / 2) / canvasWidth) * 100, 0, 100)
    ),
    top: roundField(
      clampNumber(((Number(position.y || 0) + componentHeight / 2) / canvasHeight) * 100, 0, 100)
    ),
    // 百分比下限取 0.1 而非 0：面板输入框不接受 0 宽高。
    widthPercent: roundField(clampNumber((componentWidth / canvasWidth) * 100, 0.1, 100)),
    heightPercent: roundField(clampNumber((componentHeight / canvasHeight) * 100, 0.1, 100)),
    scale: roundField(clampNumber(Number(inspectedComponent.style?.scale || 1) * 100, 1, 500)),
    rotation: roundField(clampNumber(Number(position.rotation || 0), -360, 360))
  };
}

/**
 * 把组件属性按「描述表」写回检查器控件。
 *
 * 表存在的理由：这类回填原本是每个组件手写 40–150 行赋值，同一个默认值与 clamp 范围在
 * 时间 / 日期 / 天气三处各写一遍 —— 漏一处不会报错，只表现为面板里某个值不对。表里每行
 * 只描述「哪个控件 ← 哪个来源、怎么取值」，来源有三种：
 *   - ``constant``：固定文案（组件类型标题）；
 *   - ``metric``：``inspectorComponentMetrics`` 算出的度量（位置 / 缩放 / 旋转）；
 *   - ``property``：组件属性；带 ``clamp`` / ``multiply`` / ``transform`` 任一项时按数值处理。
 * 数值一律过 ``roundField``，与面板其余地方的显示精度一致。
 */
export function applyInspectorFields(fields, { properties = {}, metrics = {} } = {}) {
  for (const field of fields) {
    const { element, clamp, multiply, transform } = field;
    if (!element) {
      // 控件引用可能取不到（模板裁剪 / 面板未挂载），跳过这一行而不是中断整段回填。
      continue;
    }
    if (field.constant !== undefined) {
      element.value = field.constant;
    } else if (field.metric !== undefined) {
      element.value = metrics[field.metric];
    } else if (clamp || multiply !== undefined || transform) {
      // 数值属性用 `??` 取默认值而不是 `||`：0 是合法取值（字距、行距、旋转都能是 0），
      // `||` 会把用户明确设的 0 悄悄换回默认值 —— 表现是「改了不生效」。
      let numericValue = Number(properties[field.property] ?? field.fallback);
      if (multiply !== undefined) numericValue *= multiply;
      if (clamp) numericValue = clampNumber(numericValue, clamp[0], clamp[1]);
      if (transform) numericValue = transform(numericValue);
      element.value = roundField(numericValue);
    } else {
      // 文本与颜色：空串、缺字段都回落到默认值，与 `||` 的语义一致。
      element.value = properties[field.property] || field.fallback;
    }
  }
}

/**
 * 把「单选按钮组」（时分制、显示秒、周几、农历、天气四项可见性）的按压态写回控件。
 *
 * ``active`` 由调用方给：每个开关的判读口径都不同（``!== false`` / ``=== true`` /
 * ``=== false``），把它统一成「没写就算开」这类约定只会把「缺字段算开还是算关」藏起来。
 * ``attribute`` 默认从 ``dataset`` 推导（驼峰 → 短横线），与模板里 ``data-*`` 的写法一致。
 */
export function applyInspectorToggles(toggles, properties = {}) {
  for (const toggle of toggles) {
    const { container, dataset } = toggle;
    if (!container) {
      continue;
    }
    const attribute =
      toggle.attribute || dataset.replace(/[A-Z]/g, letterChar => "-" + letterChar.toLowerCase());
    const activeValue = toggle.active(properties);
    for (const toggleElement of container.querySelectorAll(`[data-${attribute}]`)) {
      const isActive = toggleElement.dataset[dataset] === activeValue;
      toggleElement.classList.toggle("active", isActive);
      // aria-pressed 只在原本就写了它的组上同步：无脑加属性会改掉别的组已有的样式钩子。
      if (toggle.ariaPressed) {
        toggleElement.setAttribute("aria-pressed", String(isActive));
      }
    }
  }
}
