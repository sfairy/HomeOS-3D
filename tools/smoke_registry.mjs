/**
 * 控件注册表的运行时冒烟：把 `registry.js` 当成真实 ESM 加载一遍。
 *
 * 为什么需要它：注册表已拆成 `registry/` 下 28 个分片，`registerComponent` 是 import 副作用，
 * 而 `componentsByType` 是模块级 Map。结构类守卫（`check_registry_split.mjs`）能证明
 * 「每个分片都被引入」，但证明不了「引入之后真的跑到了注册那一行」——漏一个类型在页面上
 * 只表现为「控件尚未实现」，不报错、不 404，CI 与本地都不会发现。
 *
 * 这里补上那一环：带 DOM 桩加载整棵树，然后逐个类型走 `renderRegisteredComponent`，
 * 断言拿到的不是注册表自己画的占位。
 *
 * Usage:
 *   node tools/smoke_registry.mjs            # 通过则 0，任一类型没注册/渲染抛错则 1
 *   node tools/smoke_registry.mjs --quiet
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");

/* ------------------------------------------------------------------ DOM 桩 ---- */

/** `style` 要能真的接住 setProperty / getPropertyValue / removeProperty：渲染器写内联变量都走它们。 */
function createStyleStub() {
  const style = {};
  style.setProperty = (name, value) => {
    style[name] = String(value);
  };
  style.getPropertyValue = (name) => style[name] ?? "";
  style.removeProperty = (name) => {
    delete style[name];
    return "";
  };
  return style;
}

class StubElement {
  constructor(tagName) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.style = createStyleStub();
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(node) {
    this.children.push(node);
    return node;
  }
  prepend(...nodes) {
    this.children.unshift(...nodes);
  }
  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    return node;
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  hasAttribute(name) {
    return name in this.attributes;
  }
  addEventListener() {}
  removeEventListener() {}
  remove() {}
  cloneNode() {
    return new StubElement(this.tagName);
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  matches() {
    return false;
  }
  closest() {
    return null;
  }
  getContext() {
    return stub;
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 };
  }
  get firstElementChild() {
    return this.children.find((child) => child instanceof StubElement) || null;
  }
  get childElementCount() {
    return this.children.filter((child) => child instanceof StubElement).length;
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}

const handler = {
  get: (target, key) => {
    if (key === Symbol.toPrimitive) return () => "";
    if (key === "then") return undefined;
    if (Reflect.has(target, key)) return Reflect.get(target, key);
    return stub;
  },
  set: (target, key, value) => Reflect.set(target, key, value),
  has: () => true,
  apply: () => stub,
  construct: () => stub,
  getPrototypeOf: () => Object.prototype
};
const stub = new Proxy(function () {}, handler);

const documents = {
  createElement: (tagName) => new StubElement(tagName),
  createElementNS: (_namespace, tagName) => new StubElement(tagName),
  createTextNode: (text) => {
    const node = new StubElement("#text");
    node.textContent = String(text);
    return node;
  },
  createDocumentFragment: () => new StubElement("#fragment"),
  documentElement: new StubElement("html"),
  head: new StubElement("head"),
  body: new StubElement("body")
};

const define = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  } catch {
    /* 只读内建改不动就跳过：分片顶层读它只会拿到 Proxy。 */
  }
};
define("window", stub);
define("document", new Proxy(documents, handler));
define("navigator", stub);
define("location", stub);
define("localStorage", stub);
define("sessionStorage", stub);
define("getComputedStyle", () => stub);
define("matchMedia", () => stub);
define("requestAnimationFrame", (callback) => {
  void callback;
  return 1;
});
define("cancelAnimationFrame", () => {});
for (const observer of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) {
  define(observer, function () {
    return stub;
  });
}
define("Image", function () {
  return new StubElement("img");
});
define("Audio", function () {
  return new StubElement("audio");
});
define("CSS", { escape: (value) => String(value), supports: () => true });

/* ------------------------------------------------------------------ 冒烟 ---- */

/* `registerComponent` 的键就是这些字符串（renderer.js 与文档数据都用同一套）。 */
const EXPECTED_TYPES = [
  "interaction3d",
  "image",
  "floorplan-auto-diagram",
  "icon-button",
  "icon-button-effect",
  "device-button",
  "title-button",
  "light-statistics",
  "presence-sensor",
  "air-conditioner",
  "camera",
  "vacuum-map",
  "time",
  "date",
  "weather",
  "line-chart",
  "panel-frame",
  "navigation-button"
];

/** 注册表对未知类型画的占位，文案是唯一可靠的判据（image 的「尚未选择图片」也复用同款 class）。 */
const UNKNOWN_PLACEHOLDER_TEXT = "控件尚未实现";

const collectText = (node, found = []) => {
  if (!(node instanceof StubElement)) return found;
  if (node.textContent) found.push(String(node.textContent));
  for (const child of node.children) collectText(child, found);
  return found;
};

const renderContext = new Proxy(
  {
    editable: true,
    states: new Map(),
    cleanup: () => {},
    unitPx: 96,
    contentUnits: { width: 0, height: 0 }
  },
  handler
);

const entry = pathToFileURL(path.join(ROOT, "frontend/static/renderer/core/registry.js")).href;
let registry;
try {
  registry = await import(`${entry}?smoke=${Date.now()}`);
} catch (error) {
  console.log(`FAIL: registry.js 加载失败 —— ${error.message}`);
  process.exit(1);
}

const unregistered = [];
const crashed = [];
for (const type of EXPECTED_TYPES) {
  const component = { type, properties: {}, bindings: {} };
  try {
    const element = registry.renderRegisteredComponent(component, renderContext);
    if (collectText(element).includes(UNKNOWN_PLACEHOLDER_TEXT)) unregistered.push(type);
  } catch (error) {
    crashed.push(`${type}：${error.message}`);
  }
}

const problems = [];
if (typeof registry.registerComponent !== "function") problems.push("registerComponent 没有导出");
if (typeof registry.renderRegisteredComponent !== "function") problems.push("renderRegisteredComponent 没有导出");
if (unregistered.length) problems.push(`这些控件类型没有注册（渲染成了占位）：${unregistered.join(", ")}`);
for (const crash of crashed) problems.push(`渲染器抛异常 —— ${crash}`);

if (quiet) {
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  for (const problem of problems) console.log(`FAIL: ${problem}`);
  console.log(`\n${problems.length} 项问题`);
  process.exit(1);
}
const exported = Object.keys(registry).length;
console.log(`  registry.js 加载成功，导出名 ${exported} 个`);
console.log(`  ${EXPECTED_TYPES.length} 个控件类型全部注册且能渲染`);
console.log("\nOK: 拆开后的注册表是一棵可完整求值的模块树，控件类型一个都没漏。");
