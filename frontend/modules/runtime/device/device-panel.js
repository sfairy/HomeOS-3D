/**
 * 通用设备详情弹窗（冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）。
 *
 * 这张面板的骨架是「标题 + 一行状态 + 一片附加功能卡片网格」，与空调面板共用
 * `i3d-climate-panel` 的排版类，也共用 `i3d-extra-*` 那套卡片网格——所以它同时挂上
 * `i3d-climate-panel` 与 `i3d-nas-panel` 两个类名，样式才有得可继承。
 *
 * 三块内容各自的来源：
 *   标题     —— 配置里的 label / deviceName / deviceLabel，最后才退回品类名（「冰箱」）
 *   状态行   —— device-status 的 deviceStatus()，正常 / 异常 / 已关闭 / 状态未知 四态
 *   卡片网格 —— purifier-extras 的 createPurifierExtras()，与空气净化器同一套实现
 *
 * 关于 `onControl`：追加了 `deviceKind: "device-extra"` 再交给上层。空调那边的附加实体是
 * `purifier-extra`，两者在 /control 上走不同的校验分支，这个标记就是分流依据，不能省。
 */

import { createPurifierExtras } from "../climate/purifier-extras.js?v=2609260842";
import { deviceStatus } from "./device-status.js?v=2609260842";
import { genericDeviceProfile } from "./device-profiles.js?v=2609260842";

// 状态灯四态的中文说法。status 为 "none"（没配任何规则）时查不到，落到空串。
const STATUS_LABELS = {
  normal: "正常",
  warning: "异常",
  off: "已关闭",
  unknown: "状态未知"
};

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
  root.append(headingWrap, extraGrid, emptyHint);

  // errorElement 是留着给这一层自己报错用的（目前卡片内的错误各自显示在卡片里，
  // 所以只清不写）。保留节点是为了与空调 / 窗帘面板的 DOM 结构一致，样式表按位置选中它。
  const extras = createPurifierExtras({
    element: extraGrid,
    onLayout,
    onControl: control => onControl({ ...control, deviceKind: "device-extra" })
  });

  return {
    root,
    update({ item, states }) {
      heading.textContent =
        item.label ||
        item.deviceName ||
        item.deviceLabel ||
        genericDeviceProfile(item.deviceKind)?.label ||
        "设备";
      const status = deviceStatus(item, states);
      statusElement.hidden = !status.visible;
      statusElement.textContent = STATUS_LABELS[status.status] || "";
      // 走 CSS 变量而不是直接写颜色：主题可以覆盖 --i3d-device-status-* 而不必改 JS。
      statusElement.style.color = status.color
        ? "var(--i3d-device-status-" + status.status + "," + status.color + ")"
        : "";
      errorElement.textContent = "";
      // 配了附加控件就不再显示「请选择弹窗内容」的引导语。
      emptyHint.hidden = !!item.extraControls?.length;
      extras.update({ item, states });
    },
    dispose() {
      extras.dispose();
      root.remove();
    }
  };
}
