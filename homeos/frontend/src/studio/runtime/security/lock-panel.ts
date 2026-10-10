/**
 * 3D 门锁控制面板（栈 D）。
 * 直播与编辑均可经 focusMarkerById / activateMarker 打开；
 * `editing: true` 时禁用操作（模型不可用或控制未就绪），否则可上锁/解锁/释放锁舌。
 */
import { lockState } from "./lock-state";
import { domElement } from "@app/utils/dom-factory";
import { createStageDeviceVisual } from "../core/stage-device-visual";
/**
 * 把门锁原始 state 归一成右上角图形能表达的档位。
 * 关键：拿不到可信锁状态（未绑定锁实体 / unknown / unavailable）时归 `unknown`，
 * 绝不默认成 `unlocked`，否则卡片会摆出开锁图，与实际不符。
 */
const lockVisualStateOf = (snapshot: any, draftLocked: boolean | null) => {
  if (draftLocked !== null) return draftLocked ? "locking" : "unlocking";
  switch (String(snapshot?.state || "").trim().toLowerCase()) {
    case "locked":
      return "locked";
    case "unlocked":
    case "open":
      return "unlocked";
    case "locking":
      return "locking";
    case "unlocking":
    case "opening":
      return "unlocking";
    case "jammed":
      return "jammed";
    default:
      return "unknown";
  }
};
const LOCK_STATE_TEXT: Record<string, string> = {
  locked: "已上锁",
  unlocked: "已解锁",
  locking: "正在上锁",
  unlocking: "正在解锁",
  jammed: "门锁卡住",
  unknown: "锁状态未知",
};
const TONE_CLASSES = [
  "is-locked",
  "is-unlocked",
  "is-moving",
  "is-jammed",
  "is-normal",
  "is-warning",
  "is-unknown",
];
/** 状态行与芯片共用同一套色调类，CSS 按主题上色。 */
const applyTone = (element: any, tone: string) => {
  for (const toneClass of TONE_CLASSES)
    element.classList.toggle(toneClass, !!tone && toneClass === tone);
};
const doorTone = (snapshot: any) =>
  snapshot.doorOpenRatio === null ? "is-unknown" : snapshot.doorOpen ? "is-warning" : "is-normal";
/** 电量低于此值转告警色。 */
const LOW_BATTERY_PERCENT = 20;

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
  /** 状态芯片：名称 + 数值 + 可选底部电量条。 */
  const createChip = (withGauge = false) => {
    const chipElement = createTextElement("span"),
      nameElement = createTextElement("span"),
      valueElement = createTextElement("strong"),
      gaugeElement = createTextElement("i");
    return (
      (chipElement.className = "i3d-lock-detail"),
      (nameElement.className = "i3d-lock-detail-name"),
      (valueElement.className = "i3d-lock-detail-value"),
      (gaugeElement.className = "i3d-lock-detail-gauge"),
      (gaugeElement.hidden = !withGauge),
      chipElement.append(nameElement, valueElement, gaugeElement),
      { chipElement, nameElement, valueElement, gaugeElement }
    );
  };
  const doorChip = createChip(),
    batteryChip = createChip(true),
    battery2Chip = createChip(true);
  // 门磁芯片在双电量并排的网格里独占整行（见 stage.css 的 .i3d-lock-details）。
  doorChip.chipElement.classList.add("is-door");
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
  /** 电量芯片：名称（锂电池 / 干电池）+ 数值 + 底部电量条。 */
  function paintBatteryChip(chip: any, labelText: string, batteryText: string, batteryLevel: any) {
    const level = typeof batteryLevel === "number" ? batteryLevel : null;
    ((chip.nameElement.textContent = labelText),
      (chip.valueElement.textContent = batteryText));
    if (level === null) chip.gaugeElement.hidden = true;
    else
      ((chip.gaugeElement.hidden = false),
        (chip.gaugeElement.style.width = Math.max(0, Math.min(100, level)) + "%"));
    applyTone(
      chip.chipElement,
      level === null ? "is-unknown" : level <= LOW_BATTERY_PERCENT ? "is-warning" : "is-normal",
    );
  }
  function refreshPanel() {
    const isLockedNow = lockSnapshot.state === "locked";
    draftLocked !== null && isLockedNow === draftLocked && clearLockDraft();
    const hasLockEntity = !!currentComponent?.entityId,
      visualLockState = lockVisualStateOf(lockSnapshot, draftLocked),
      // 「已上锁 / 正在上锁」都算锁已就位：上锁按钮据此置灰，避免重复下发。
      effectiveLocked = visualLockState === "locked" || visualLockState === "locking";
    // 主状态：绑了锁实体就以锁为准，门磁降为芯片；否则门磁顶上，都没有才说「仅电量」。
    ((statusElement.textContent = hasLockEntity
      ? LOCK_STATE_TEXT[visualLockState]
      : currentComponent?.doorEntityId
        ? lockSnapshot.doorOpenLabel
        : "仅电量监测"),
      applyTone(
        statusElement,
        hasLockEntity
          ? ({
              locked: "is-locked",
              unlocked: "is-unlocked",
              locking: "is-moving",
              unlocking: "is-moving",
              jammed: "is-jammed",
            } as Record<string, string>)[visualLockState] || "is-unknown"
          : doorTone(lockSnapshot),
      ),
      (metaElement.textContent = isEditing
        ? "控制预览"
        : !lockSnapshot.available
          ? "设备不可用"
          : lockSnapshot.busy || isSubmitting || draftLocked !== null
            ? "设备正在动作"
            : hasLockEntity
              ? "状态实时更新"
              : "仅门磁监测"));
    const chipQueue: any[] = [],
      hasPrimaryBattery = !!currentComponent?.batteryEntityId,
      hasSecondaryBattery = !!currentComponent?.battery2EntityId;
    // 门磁芯片：只有锁状态接管了主行时才需要补这一条。
    if (hasLockEntity && currentComponent?.doorEntityId) {
      ((doorChip.nameElement.textContent = "门磁"),
        (doorChip.valueElement.textContent = lockSnapshot.doorOpenLabel),
        (doorChip.gaugeElement.hidden = true),
        applyTone(doorChip.chipElement, doorTone(lockSnapshot)),
        chipQueue.push(doorChip.chipElement));
    }
    if (hasPrimaryBattery) {
      paintBatteryChip(batteryChip, "锂电池", lockSnapshot.battery, lockSnapshot.batteryLevel);
      chipQueue.push(batteryChip.chipElement);
    }
    // 第二槽位固定是干电池；只绑这一路时它就是该门锁唯一的电量来源。
    if (hasSecondaryBattery) {
      paintBatteryChip(
        battery2Chip,
        "干电池",
        lockSnapshot.battery2,
        lockSnapshot.battery2Level,
      );
      chipQueue.push(battery2Chip.chipElement);
    }
    (detailsElement.replaceChildren(...chipQueue), (detailsElement.hidden = !chipQueue.length));
    (codeInputElement.hidden = !lockSnapshot.codeRequired);
    let hasVisibleAction = false;
    for (const [actionKey, actionButtonElement] of buttonsByActionName) {
      const actionHidden = !hasLockEntity || (actionKey === "open" && !lockSnapshot.canOpen);
      ((actionButtonElement.hidden = actionHidden),
        (actionButtonElement.disabled =
          isEditing ||
          isSubmitting ||
          !lockSnapshot.available ||
          lockSnapshot.busy ||
          (actionKey === "lock" && effectiveLocked)));
      actionHidden || (hasVisibleAction = true);
    }
    // 没绑锁实体时三个按钮全隐藏，别让空行继续占位。
    actionsElement.hidden = !hasVisibleAction;
    deviceVisual.sync({
      kind: "lock",
      on: visualLockState === "unlocked",
      lockState: visualLockState,
      locked: visualLockState === "locked",
      jammed: visualLockState === "jammed",
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
