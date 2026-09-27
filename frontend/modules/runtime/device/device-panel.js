/**
 * 通用设备详情弹窗（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）。
 */

import { createPurifierExtras } from "../climate/purifier-extras.js?v=2609271226";
import { deviceStatus } from "./device-status.js?v=2609271226";
import { genericDeviceProfile } from "./device-profiles.js?v=2609271226";

// 状态灯四态的中文说法。status 为 "none"（没配任何规则）时查不到，落到空串。
const STATUS_LABELS = {
  normal: "正常",
  warning: "异常",
  off: "已关闭",
  unknown: "状态未知"
};

// 设备图形的部件清单。顺序即 DOM 顺序（先画的在下层）：落地阴影 → 机身 → 门盖 → 把手 →
const VISUAL_PARTS = [
  "ground",
  "body",
  "door",
  "handle",
  "console",
  "window",
  "light",
  "pot",
  "foliage"
];
// 叶片是唯一有内部结构的部件（一片叶子一个节点），其余部件都是单个元素靠伪元素补细节。
const FOLIAGE_LEAF_COUNT = 5;

/**
 * 建设备图形：一棵所有品类共用的部件树。
 */
function createDeviceVisual() {
  const element = document.createElement("div");
  element.className = "i3d-device-visual";
  // 装饰性插画：不进无障碍树、不吃指针事件。面板里已经有标题行与卡片承担全部语义与操作，
  element.setAttribute("aria-hidden", "true");
  const parts = {};
  for (const part of VISUAL_PARTS) {
    const node = document.createElement("i");
    node.className = "i3d-device-visual-" + part;
    if (part === "foliage") {
      for (let leafIndex = 0; leafIndex < FOLIAGE_LEAF_COUNT; leafIndex += 1) {
        node.append(document.createElement("i"));
      }
    }
    parts[part] = node;
    element.append(node);
  }
  let currentKind = "";
  let currentSignature = "";
  return {
    element,
    update(deviceKind, status) {
      const kind = typeof deviceKind === "string" ? deviceKind : "";
      const signature = [kind, status.status, status.available, status.on].join("|");
      if (signature === currentSignature) {
        return;
      }
      currentSignature = signature;
      if (kind !== currentKind) {
        currentKind = kind;
        element.className = "i3d-device-visual" + (kind ? " is-" + kind : "");
      }
      element.classList.toggle("is-on", !!status.on);
      element.classList.toggle("is-unavailable", !status.available);
      for (const statusName of ["normal", "warning", "off", "unknown", "none"]) {
        element.classList.toggle("is-status-" + statusName, status.status === statusName);
      }
    }
  };
}

/**
 * @param onControl 卡片上的操作回调，会带上 `deviceKind: "device-extra"`
 * @param onLayout  卡片拖动 / 改尺寸后的布局变更回调（与空气净化器共用同一套布局偏好存储）
 */
export function createDevicePanel({ onControl, onLayout = () => {} }) {
  const root = document.createElement("div");
  root.className = "i3d-climate-panel i3d-nas-panel i3d-device-panel";
  root.hidden = true;

  const heading = document.createElement("h3");
  const statusElement = document.createElement("p");
  const extraGrid = document.createElement("div");
  const emptyHint = document.createElement("p");
  const errorElement = document.createElement("p");
  extraGrid.className = "i3d-climate-groups i3d-extra-grid";
  emptyHint.textContent = "请在设备配置中选择弹窗内容。";

  const headingWrap = document.createElement("div");
  headingWrap.className = "i3d-climate-heading i3d-nas-heading";
  const headingText = document.createElement("div");
  headingText.className = "i3d-climate-heading-text";
  errorElement.hidden = true;
  headingText.append(heading, statusElement);
  headingWrap.append(headingText, errorElement);

  // 设备图形单独占一行、居中，插在标题行与卡片网格之间 —— 与空调 / 净化器 / 电视面板同一套
  const visual = createDeviceVisual();

  root.append(headingWrap, visual.element, extraGrid, emptyHint);

  // errorElement 除了与空调 / 窗帘面板的 DOM 结构一致，也真的会用上：模型被移除时
  let lastItem = {};

  /** 面板标题：配置优先，最后才退回品类名。卡片标题去前缀也以它为准。 */
  function titleForItem(item = {}) {
    return (
      item.label ||
      item.deviceName ||
      item.deviceLabel ||
      genericDeviceProfile(item.deviceKind)?.label ||
      "设备"
    );
  }

  // titlePrefix：把卡片标题里重复的「设备名 + 分隔符」前缀去掉（friendly_name 惯例会把
  const extras = createPurifierExtras({
    element: extraGrid,
    onLayout,
    onControl: control => onControl({ ...control, deviceKind: "device-extra" }),
    titlePrefixProvider: () => titleForItem(lastItem)
  });

  return {
    root,
    update({ item, states, error = "", editing = false, busy = false }) {
      lastItem = item || {};
      const title = titleForItem(lastItem);
      heading.textContent = title;
      heading.title = title;
      const status = deviceStatus(lastItem, states);
      statusElement.hidden = !status.visible;
      statusElement.textContent = STATUS_LABELS[status.status] || "";
      // 走 CSS 变量而不是直接写颜色：主题可以覆盖 --i3d-device-status-* 而不必改 JS。
      statusElement.style.color = status.color
        ? "var(--i3d-device-status-" + status.status + "," + status.color + ")"
        : "";
      errorElement.textContent = error;
      errorElement.hidden = !error;
      // 配了附加控件就不再显示「请选择弹窗内容」的引导语。
      emptyHint.hidden = !!lastItem.extraControls?.length;
      // 设备图形：品类缺失（理论上不会发生，绑定收集侧必填 deviceKind）时整块不占位。
      visual.element.hidden = !lastItem.deviceKind;
      visual.update(lastItem.deviceKind, status);
      // editing / busy 原样转给卡片网格：编辑预览态下它才渲染拖拽 / 改尺寸手柄、允许拖拽
      extras.update({ item: lastItem, states, editing: !!(editing || busy) });
    },
    dispose() {
      extras.dispose();
      root.remove();
    }
  };
}
