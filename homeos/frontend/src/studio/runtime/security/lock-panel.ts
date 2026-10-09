/**
 * 3D 门锁控制面板（栈 D）。
 * 直播与编辑均可经 focusMarkerById / activateMarker 打开；
 * `editing: true` 时禁用操作（模型不可用或控制未就绪），否则可上锁/解锁/释放锁舌。
 */
import { lockState } from "./lock-state";
import { domElement } from "@app/utils/dom-factory";
import { createStageDeviceVisual } from "../core/stage-device-visual";
export function createLockPanel({ onControl: onControl }: any) {
  const createTextElement = (tagName: any, textContent = "") =>
      domElement(document, tagName, "", textContent),
    panelElement = createTextElement("section"),
    headingElement = createTextElement("div"),
    titleElement = createTextElement("h3"),
    metaElement = createTextElement("p"),
    statusElement = createTextElement("p"),
    detailsElement = createTextElement("div"),
    actionsElement = createTextElement("div"),
    codeInputElement = createTextElement("input"),
    messageElement = createTextElement("p");
  const deviceVisual = createStageDeviceVisual({
    kind: "lock",
    // 门锁不通过角标直接开锁，避免绕过二次确认。
    onActivate: undefined,
  });
  ((panelElement.className = "i3d-lock-panel i3d-nas-panel"),
    (headingElement.className = "i3d-nas-heading"),
    (metaElement.className = "i3d-nas-meta"),
    (statusElement.className = "i3d-nas-status"),
    (detailsElement.className = "i3d-lock-details"),
    (actionsElement.className = "i3d-focus-actions"),
    messageElement.setAttribute("role", "status"),
    (codeInputElement.type = "password"),
    (codeInputElement.autocomplete = "off"),
    (codeInputElement.maxLength = 128),
    (codeInputElement.placeholder = "门密码（仅本次操作）"),
    codeInputElement.setAttribute("aria-label", "门密码"));
  let currentComponent: any = null,
    isEditing = true,
    isSubmitting = false,
    isDisposed = false,
    pendingAction = "",
    updateEpoch = 0,
    draftLocked: boolean | null = null,
    draftTimeoutId: any = null;
  const clearLockDraft = () => {
      (draftTimeoutId !== null && clearTimeout(draftTimeoutId),
        (draftTimeoutId = null),
        (draftLocked = null));
    },
    armLockDraftTimeout = () => {
      draftTimeoutId !== null && clearTimeout(draftTimeoutId);
      draftTimeoutId = setTimeout(() => {
        ((draftTimeoutId = null), (draftLocked = null), isDisposed || refreshPanel());
      }, 8000);
    };
  const buttonsByActionName = new Map();
  for (const [actionName, actionLabel] of [
    ["lock", "上锁"],
    ["unlock", "解锁"],
    ["open", "释放锁舌"],
  ]) {
    const actionButton = createTextElement("button", actionLabel);
    ((actionButton.type = "button"),
      buttonsByActionName.set(actionName, actionButton),
      actionsElement.append(actionButton),
      actionButton.addEventListener("click", async () => {
        if (isEditing || isSubmitting || !currentComponent) return;
        if (actionName !== "lock" && pendingAction !== actionName) {
          ((pendingAction = actionName),
            (messageElement.textContent = "确认要" + actionLabel + "吗？再次点击执行。"),
            refreshPanel());
          return;
        }
        ((pendingAction = ""),
          (isSubmitting = true),
          (draftLocked = actionName === "lock"),
          armLockDraftTimeout());
        const submitEpoch = updateEpoch,
          submittedComponent = currentComponent;
        refreshPanel();
        const serviceData = codeInputElement.value
          ? {
              code: codeInputElement.value,
            }
          : {};
        codeInputElement.value = "";
        try {
          (await onControl({
            deviceKind: "lock",
            domain: "lock",
            service: actionName,
            entityId: submittedComponent.entityId,
            data: serviceData,
          }),
            !isDisposed &&
              submitEpoch === updateEpoch &&
              (messageElement.textContent = "指令已提交，状态以门反馈为准。"));
        } catch (error: any) {
          !isDisposed &&
            submitEpoch === updateEpoch &&
            (clearLockDraft(), (messageElement.textContent = error.message || "操作失败。"));
        } finally {
          !isDisposed && submitEpoch === updateEpoch && ((isSubmitting = false), refreshPanel());
        }
      }));
  }
  let lockSnapshot = lockState({});
  function refreshPanel() {
    const isLockedNow = lockSnapshot.state === "locked";
    draftLocked !== null && isLockedNow === draftLocked && clearLockDraft();
    const effectiveLocked = draftLocked ?? isLockedNow;
    ((statusElement.textContent = currentComponent?.entityId
      ? (draftLocked !== null
          ? draftLocked
            ? "上锁中"
            : "解锁中"
          : lockSnapshot.label) +
        " · " +
        lockSnapshot.doorLabel
      : lockSnapshot.label),
      detailsElement.replaceChildren(
        ...[currentComponent?.batteryEntityId ? "电量 " + lockSnapshot.battery : ""]
          .filter(Boolean)
          .map((detailText) => {
            const detailElement = createTextElement("span", detailText);
            return ((detailElement.className = "i3d-lock-detail"), detailElement);
          }),
      ),
      (metaElement.textContent = lockSnapshot.available
        ? lockSnapshot.busy || isSubmitting || draftLocked !== null
          ? "设备正在动作"
          : "状态实时更新"
        : "设备不可用"),
      (codeInputElement.hidden = !lockSnapshot.codeRequired));
    for (const [actionKey, actionButtonElement] of buttonsByActionName)
      ((actionButtonElement.hidden =
        !currentComponent?.entityId || (actionKey === "open" && !lockSnapshot.canOpen)),
        (actionButtonElement.disabled =
          isEditing ||
          isSubmitting ||
          !lockSnapshot.available ||
          lockSnapshot.busy ||
          (actionKey === "lock" && effectiveLocked)));
    deviceVisual.sync({
      kind: "lock",
      on: !effectiveLocked,
      locked: effectiveLocked,
      jammed: /jam/i.test(String(lockSnapshot.state || "")),
      available: !!lockSnapshot.available,
      busy: !!lockSnapshot.busy || isSubmitting || draftLocked !== null,
      interactive: false,
      disabled: true,
      label: titleElement.textContent || "门",
    });
  }
  const headingTextElement = createTextElement("div");
  headingTextElement.className = "i3d-popup-heading-text";
  return (
    headingTextElement.append(titleElement, metaElement),
    headingElement.append(headingTextElement, deviceVisual.root),
    panelElement.append(
      headingElement,
      statusElement,
      detailsElement,
      codeInputElement,
      actionsElement,
      messageElement,
    ),
    {
      root: panelElement,
      update({ item: component, states: entityStates, editing: editing }: any) {
        (currentComponent?.id !== component.id &&
          (updateEpoch++,
          (isSubmitting = false),
          (pendingAction = ""),
          clearLockDraft(),
          (codeInputElement.value = ""),
          (messageElement.textContent = "")),
          (currentComponent = component),
          (isEditing = editing),
          (lockSnapshot = lockState(component, entityStates)),
          (titleElement.textContent = component.label || "门"),
          refreshPanel());
      },
      hide() {
        (updateEpoch++,
          (isSubmitting = false),
          (pendingAction = ""),
          clearLockDraft(),
          (codeInputElement.value = ""),
          (messageElement.textContent = ""),
          (panelElement.hidden = true));
      },
      dispose() {
        ((isDisposed = true),
          clearLockDraft(),
          (codeInputElement.value = ""),
          deviceVisual.dispose(),
          panelElement.remove());
      },
    }
  );
}
