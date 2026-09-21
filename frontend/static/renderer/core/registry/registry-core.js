/**
 * 控件类型注册表本体：`componentsByType` 与它的两个入口。
 *
 * 全仓只许存在一个 `componentsByType`，因此本文件是叶子（不 import 任何兄弟分片）；
 * 各 `components/*.js` 只从 @import 这里拿 `registerComponent`，不会各自持有一份表。
 */

// 控件类型注册表。用 Map 而不是对象字面量：控件类型来自文档数据，
// Map 不受原型链影响，查 "constructor" 之类的键也不会拿到奇怪的结果。
const componentsByType = new Map();

/**
 * 注册一个控件类型的渲染器；重复注册同一类型会直接覆盖（后注册者生效）。
 * 版本戳不一致会让两份模块各维护一份表，务必保持一致。
 */
export function registerComponent(componentType, componentRenderer) {
  componentsByType.set(componentType, componentRenderer);
}

/**
 * 渲染一个控件：查出注册的渲染器并调用，查不到则画「控件尚未实现」占位。
 * 不抛异常：页面可能只是比运行时新，缺一个控件不该让整页渲染失败。
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
