import { createPurifierExtras } from "../climate/purifier-extras";
import { carState } from "../vehicle/car-state";
import { deviceStatus } from "./device-status";
import { genericDeviceProfile } from "./generic-device-catalog";
import { createStageDeviceVisual } from "../core/stage-device-visual";
export function createDevicePanel({ onControl: onControl, onLayout: onLayout = () => {} }: any) {
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
  const deviceVisual = createStageDeviceVisual({
    kind: "generic",
    onActivate: undefined,
  });
  ((headingTextElement.className = "i3d-climate-heading-text"),
    (badgeElement.hidden = true),
    headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, badgeElement, deviceVisual.root));
  const bodyElement = document.createElement("div");
  ((bodyElement.className = "i3d-popup-body"),
    bodyElement.append(extraGridElement, hintElement),
    rootElement.append(headingElement, bodyElement));
  const purifierExtras = createPurifierExtras({
    element: extraGridElement,
    onLayout: onLayout,
    onControl: (controlEvent: any) =>
      onControl({
        ...controlEvent,
        deviceKind: "device-extra",
      }),
  });
  return {
    root: rootElement,
    update(incomingState: any) {
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
              extraControls: [] as any[],
            },
          }));
      } else purifierExtras.update(incomingState);
      deviceVisual.sync({
        kind: "generic",
        on: status.status === "normal",
        available: status.status !== "unknown",
        interactive: false,
        disabled: true,
        status: status.status || "unknown",
        accent: status.color || "#c9a26d",
        label: titleElement.textContent || "设备",
      });
    },
    dispose() {
      (purifierExtras.dispose(), deviceVisual.dispose(), rootElement.remove());
    },
  };
}
