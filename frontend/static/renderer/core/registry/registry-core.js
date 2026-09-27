/**
 * 控件类型注册表本体：`componentsByType` 与它的两个入口。
 */

// 控件类型注册表。用 Map 而不是对象字面量：控件类型来自文档数据，
const componentsByType = new Map();

/**
 * 注册一个控件类型的渲染器；重复注册同一类型会直接覆盖（后注册者生效）。
 */
export function registerComponent(componentType, componentRenderer) {
  componentsByType.set(componentType, componentRenderer);
}

/**
 * 渲染一个控件：查出注册的渲染器并调用，查不到则画「控件尚未实现」占位。
 */
export function renderRegisteredComponent(component, renderContext) {
  const registeredRenderer = componentsByType.get(component.type);
  if (registeredRenderer) {
    return registeredRenderer.render(component, renderContext);
  }
  const unknownComponentElement = document.createElement("div");
  unknownComponentElement.className = "hb-unknown-component";
  const unknownTitleElement = document.createElement("strong");
  unknownTitleElement.textContent = "控件尚未实现";
  const unknownTypeElement = document.createElement("span");
  unknownTypeElement.textContent = component.type;
  unknownComponentElement.append(unknownTitleElement, unknownTypeElement);
  return unknownComponentElement;
}
