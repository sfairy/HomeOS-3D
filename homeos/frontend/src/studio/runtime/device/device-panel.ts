import { createPurifierExtras } from "../climate/purifier-extras";
import { carState } from "../vehicle/car-state";
import { computerPower } from "./computer-state";
import { deviceStatus } from "./device-status";
import { genericDeviceProfile } from "./generic-device-catalog";
import { resolveFridgeOpenings } from "./fridge-openings";
import { createStageDeviceVisual } from "../core/stage-device-visual";
import { createPopupFeedback } from "@app/shared/util/popup-feedback";
/** 电源指令等待 HA 回执的上限；超时给出「设备未响应」。 */
const POWER_RESPONSE_TIMEOUT_MS = 14_000;
export function createDevicePanel({ onControl: onControl, onLayout: onLayout = () => {} }: any) {
  const rootElement = document.createElement("div");
  ((rootElement.className = "i3d-climate-panel i3d-nas-panel i3d-device-panel"),
    (rootElement.hidden = true));
  const titleElement = document.createElement("h3"),
    statusElement = document.createElement("p"),
    extraGridElement = document.createElement("div"),
    hintElement = document.createElement("p"),
    badgeElement = document.createElement("p"),
    powerButton = document.createElement("button");
  ((extraGridElement.className = "i3d-climate-groups i3d-extra-grid"),
    (hintElement.textContent = "请在设备配置中选择弹窗内容。"),
    (powerButton.className = "i3d-device-power"),
    (powerButton.type = "button"),
    (powerButton.hidden = true));
  let powerRequest: { desired: boolean; accepted: boolean } | null = null,
    powerTimer: any = null,
    powerSignature = "",
    isDisposed = false,
    lastItem: any = null;
  const extraErrorElement = document.createElement("p");
  ((extraErrorElement.className = "i3d-extra-error"),
    extraErrorElement.setAttribute("role", "status"));
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
    headingElement.append(headingTextElement, badgeElement, powerButton, deviceVisual.root));
  const bodyElement = document.createElement("div");
  ((bodyElement.className = "i3d-popup-body"),
    bodyElement.append(extraGridElement, extraErrorElement, hintElement),
    rootElement.append(headingElement, bodyElement));
  // 电源键失败/超时提示统一走弹窗反馈聚合区（0.7.8 `device-panel.js`）。
  const feedbackSlot = createPopupFeedback({ element: rootElement }),
    releaseExtraError = feedbackSlot.attach(extraErrorElement, {
      source: "power",
      label: () => titleElement.textContent || "",
    });
  const purifierExtras = createPurifierExtras({
    element: extraGridElement,
    feedbackSlot,
    onLayout: onLayout,
    onControl: (controlEvent: any) =>
      onControl({
        ...controlEvent,
        deviceKind: "device-extra",
      }),
  });
  const readPower = () =>
      lastItem?.item?.deviceKind === "computer"
        ? computerPower(lastItem.item, lastItem.states)
        : null,
    clearPowerRequest = () => {
      (clearTimeout(powerTimer), (powerTimer = null), (powerRequest = null));
    };
  /**
   * 电源键只服务电脑（0.7.8 `device-panel.js`）：实体可用、支持开关机、
   * 非编辑预览时才可点；等待回执期间显示「开机中… / 关机中…」。
   */
  function refreshPower() {
    if (isDisposed || !lastItem) return;
    const power = readPower();
    if (powerRequest && !power?.available) {
      (clearPowerRequest(), (extraErrorElement.textContent = "设备已离线"));
    }
    if (powerRequest?.accepted && powerRequest.desired === power?.on) {
      (clearPowerRequest(), (extraErrorElement.textContent = ""));
    }
    powerButton.hidden = !power || !lastItem.item?.powerEntityId;
    powerButton.disabled =
      !!lastItem.editing ||
      !!powerRequest ||
      !power?.available ||
      !power?.supported;
    (powerButton.setAttribute("aria-pressed", String(power?.on === true)),
      (powerButton.textContent = powerRequest
        ? powerRequest.desired
          ? "开机中…"
          : "关机中…"
        : power?.on
          ? "关机"
          : "开机"),
      (powerButton.title = lastItem.editing
        ? "编辑预览不可控制设备"
        : power?.reason || ""),
      (extraErrorElement.hidden = !extraErrorElement.textContent),
      rootElement.setAttribute("aria-busy", String(!!powerRequest)));
  }
  powerButton.addEventListener("click", async () => {
    if (!lastItem || isDisposed || powerButton.disabled || powerButton.hidden || powerRequest)
      return;
    const power = readPower();
    if (!power) return;
    const nextRequest = { desired: !power.on, accepted: false };
    ((powerRequest = nextRequest),
      (extraErrorElement.textContent = ""),
      refreshPower(),
      (powerTimer = setTimeout(() => {
        if (isDisposed || powerRequest !== nextRequest) return;
        (clearPowerRequest(),
          (extraErrorElement.textContent = "设备未响应，请重试"),
          refreshPower());
      }, POWER_RESPONSE_TIMEOUT_MS)),
      powerTimer.unref?.());
    try {
      await onControl(power.command);
      if (isDisposed || powerRequest !== nextRequest) return;
      ((nextRequest.accepted = true), refreshPower());
    } catch (powerError: any) {
      if (isDisposed || powerRequest !== nextRequest) return;
      (clearPowerRequest(),
        (extraErrorElement.textContent = powerError?.message || "开关机失败，请重试。"),
        refreshPower());
    }
  });
  return {
    root: rootElement,
    update(incomingState: any) {
      if (isDisposed) return;
      lastItem = incomingState;
      const nextPowerSignature = JSON.stringify([
        incomingState.item?.deviceKind,
        incomingState.item?.id,
        incomingState.item?.floorId,
        incomingState.item?.modelId,
        incomingState.item?.powerEntityId,
        !!incomingState.editing,
      ]);
      nextPowerSignature !== powerSignature &&
        ((powerSignature = nextPowerSignature),
        clearPowerRequest(),
        (extraErrorElement.textContent = ""));
      refreshPower();
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
      // 冰箱用专属图形（对开门 + 两层抽屉），开口开合由门磁实时驱动；其余通用设备仍是通用图形。
      const isFridge = incomingState.item.deviceKind === "fridge";
      deviceVisual.sync({
        kind: isFridge ? "fridge" : "generic",
        on: status.status === "normal",
        available: status.status !== "unknown",
        interactive: false,
        disabled: true,
        status: status.status || "unknown",
        accent: status.color || "#c9a26d",
        label: titleElement.textContent || "设备",
        fridgeOpenings: isFridge
          ? resolveFridgeOpenings(incomingState.item, incomingState.states)
          : null,
      });
    },
    dispose() {
      (isDisposed = true),
        clearTimeout(powerTimer),
        releaseExtraError(),
        feedbackSlot.dispose(),
        purifierExtras.dispose(),
        deviceVisual.dispose(),
        rootElement.remove();
    },
  };
}
