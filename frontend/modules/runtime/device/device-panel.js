/**
 * 通用设备详情弹窗（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）。
 *
 * 面板骨架与空调面板同源：标题行（设备名 + 状态）→ 设备图形 → 附加功能卡片网格。
 *
 * 三块内容各自的来源：
 *   标题     —— 配置里的 label / deviceName / deviceLabel，最后才退回品类名（「冰箱」）
 *   状态行   —— device-status 的 deviceStatus()，正常 / 异常 / 已关闭 / 状态未知 四态
 *   设备图形 —— 本文件建出同一个部件树，形状与配色全部由 device-panel.css 按品类决定
 *   卡片网格 —— purifier-extras 的 createPurifierExtras()，与空气净化器同一套实现
 *
 * 关于 `onControl`：追加了 `deviceKind: "device-extra"` 再交给上层。空调那边的附加实体是
 * `purifier-extra`，两者在 /control 上走不同的校验分支，这个标记就是分流依据，不能省。
 *
 * 与空调 / 净化器 / 电视那几台图形的分工完全一致：图形是纯 CSS 插画，JS 只负责「按品类
 * 挂一个类名、按状态挂几个状态类」，不参与造型。所以六个品类共用同一棵树 —— 冰柜没有
 * 观察窗、绿植没有把手这类差异，交给 CSS 把用不到的部件隐藏即可，不必在 JS 里再长出一张
 * 「品类 → 部件」表。
 */

import { createPurifierExtras } from "../climate/purifier-extras.js?v=2609262312";
import { deviceStatus } from "./device-status.js?v=2609262312";
import { genericDeviceProfile } from "./device-profiles.js?v=2609262312";

// 状态灯四态的中文说法。status 为 "none"（没配任何规则）时查不到，落到空串。
const STATUS_LABELS = {
  normal: "正常",
  warning: "异常",
  off: "已关闭",
  unknown: "状态未知"
};

// 设备图形的部件清单。顺序即 DOM 顺序（先画的在下层）：落地阴影 → 机身 → 门盖 → 把手 →
// 控制台 → 观察窗 → 状态灯 → 花盆 → 叶片。每个品类只用其中一部分，其余由 CSS 隐藏。
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
 *
 * `update(deviceKind, status)` 只改类名，不重建 DOM —— 与卡片网格「签名不变就不重建」同一纪律，
 * 面板在同一台设备上刷新状态时不会把图形推倒重来。
 */
function createDeviceVisual() {
  const element = document.createElement("div");
  element.className = "i3d-device-visual";
  // 装饰性插画：不进无障碍树、不吃指针事件。面板里已经有标题行与卡片承担全部语义与操作，
  // 图形再挂一套交互等于给同一个动作开第二条没有标签的路径（与空调 / 电视图形同一口径）。
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
      // 品类与状态合成一个签名：两者都没变就一个类都不碰，避免每帧重排 classList。
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
  // 节奏（标题 → 图形 → 内容）。图形按品类画，同一棵部件树见 createDeviceVisual。
  const visual = createDeviceVisual();

  root.append(headingWrap, visual.element, extraGrid, emptyHint);

  // errorElement 除了与空调 / 窗帘面板的 DOM 结构一致，也真的会用上：模型被移除时
  // 由舞台把「设备模型已移除，请重新配置。」传进来（卡片内的错误各自显示在卡片里，
  // 这一层只承担「整张卡都不可用」的那种错）。
  //
  // 最近一次 update 的绑定项：标题与卡片前缀都要用它，且必须早于 extras 的创建
  // （titlePrefixProvider 虽然在 update 时才被调用，但先声明能让依赖顺序一眼可见）。
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
  // 设备名拼在实体名前面，如「冰箱 冷藏室门2开关状态」）。面板标题已经写着「冰箱」，
  // 卡片再带一遍只会让名字更长、把卡片挤到换行 —— 所以这里把面板标题当冗余前缀传下去。
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
      // 回传布局，并把卡片控件禁用（预览不发设备指令）。上游 device-panel 是把整个
      // viewModel 直接交给 extras.update，这里显式取同一对字段，口径一致。
      extras.update({ item: lastItem, states, editing: !!(editing || busy) });
    },
    dispose() {
      extras.dispose();
      root.remove();
    }
  };
}
