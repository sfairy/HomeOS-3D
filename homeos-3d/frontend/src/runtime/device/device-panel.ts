import { createPurifierExtras } from "../climate/purifier-extras";
import { carState } from "../vehicle/car-state";
import { deviceStatus } from "./device-status";
import { genericDeviceProfile } from "./device-profiles";
export function createDevicePanel({ onControl: onControl, onLayout: onLayout = () => {} }) {
  const rootElement = document.createElement("div");
  ((rootElement.className = "i3d-climate-panel i3d-nas-panel i3d-device-panel"),
    (rootElement.hidden = true));
  const titleElement = document.createElement("h3"),
    statusElement = document.createElement("p"),
    extraGridElement = document.createElement("div"),
    hintElement = document.createElement("p"),
    badgeElement = document.createElement("p");
  ((extraGridElement.className = "i3d-climate-groups i3d-extra-grid"),
    (hintElement.textContent = "请在设备配置中选择弹窗内容。"));
  const headingElement = document.createElement("div");
  headingElement.className = "i3d-climate-heading i3d-nas-heading";
  const headingTextElement = document.createElement("div");
  ((headingTextElement.className = "i3d-climate-heading-text"),
    (badgeElement.hidden = true),
    headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, badgeElement));
  const bodyElement = document.createElement("div");
  ((bodyElement.className = "i3d-popup-body"),
    bodyElement.append(extraGridElement, hintElement),
    rootElement.append(headingElement, bodyElement));
  const purifierExtras = createPurifierExtras({
    element: extraGridElement,
    onLayout: onLayout,
    onControl: (controlEvent) =>
      onControl({
        ...controlEvent,
        deviceKind: "device-extra",
      }),
  });
  return {
    root: rootElement,
    update(incomingState) {
      titleElement.textContent =
        incomingState.item.label ||
        incomingState.item.deviceName ||
        incomingState.item.deviceLabel ||
        genericDeviceProfile(incomingState.item.deviceKind)?.label ||
        "设备";
      const status = deviceStatus(incomingState.item, incomingState.states);
      if (
        ((statusElement.hidden = !status.visible),
        (statusElement.textContent =
          {
            normal: "正常",
            warning: "异常",
            off: "已关闭",
            unknown: "状态未知",
          }[status.status] || ""),
        (statusElement.style.color = status.color
          ? "var(--i3d-device-status-" + status.status + "," + status.color + ")"
          : ""),
        (badgeElement.textContent = ""),
        (hintElement.hidden = !!incomingState.item.extraControls?.length),
        incomingState.item.deviceKind === "smallcar")
      ) {
        const carStatus = carState(incomingState.item, incomingState.states);
        ((statusElement.hidden = false),
          (statusElement.textContent = "电量 " + carStatus.batteryText + " · " + carStatus.status),
          (hintElement.hidden = true),
          purifierExtras.update({
            ...incomingState,
            item: {
              ...incomingState.item,
              extraControls: [],
            },
          }));
      } else purifierExtras.update(incomingState);
    },
    dispose() {
      (purifierExtras.dispose(), rootElement.remove());
    },
  };
}
