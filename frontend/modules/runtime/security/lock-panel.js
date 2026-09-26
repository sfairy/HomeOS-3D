/**
 * 门锁详情面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 把 lock-state 归一化后的门锁状态渲染成「状态文案 + 电量 + 密码输入 + 上锁 / 解锁 / 释放锁舌」，
 * 操作交给 onControl 下发给后端。约定：不直接访问后端，命令由本模块组装成
 * { deviceKind: "lock", domain: "lock", service, entityId, data } 的形状。
 *
 * 危险动作（解锁 / 释放锁舌）需要二次点击确认：第一次点击只提示，第二次才真的下发；
 * 结果文案固定为「指令已提交，状态以门反馈为准。」，真正的开合以后续状态回传为准。
 */
import { lockState } from "./lock-state.js?v=2609262312";

/**
 * 创建门锁面板。
 *
 * onControl(command) 由宿主注入（通常是运行时上下文里的 sendControl，返回 Promise）。
 * 返回 { root, update({ item, states, editing }), hide(), dispose() }：root 是待挂载的根节点，
 * update 刷新绑定项与状态，hide 保留节点只隐藏（弹窗复用），dispose 彻底移除。
 */
export function createLockPanel({ onControl }) {
  const el = (tag, text = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  const rootElement = el("section");
  const headingElement = el("div");
  const titleElement = el("h3");
  const metaElement = el("p");
  const statusElement = el("p");
  const detailsElement = el("div");
  const actionsElement = el("div");
  const codeInputElement = el("input");
  const feedbackElement = el("p");
  // 沿用 NAS 面板的外观类，让门锁弹窗与其它设备弹窗的排版一致。
  rootElement.className = "i3d-lock-panel i3d-nas-panel";
  headingElement.className = "i3d-nas-heading";
  metaElement.className = "i3d-nas-meta";
  statusElement.className = "i3d-nas-status";
  detailsElement.className = "i3d-lock-details";
  actionsElement.className = "i3d-focus-actions";
  feedbackElement.setAttribute("role", "status");
  codeInputElement.type = "password";
  codeInputElement.autocomplete = "off";
  codeInputElement.maxLength = 128;
  codeInputElement.placeholder = "门密码（仅本次操作）";
  codeInputElement.setAttribute("aria-label", "门密码");
  // 当前绑定项；为 null 表示尚未绑定门锁，所有动作按钮都隐藏。
  let currentItem = null;
  // editing=true 表示处于编辑器预览态，此时禁用一切下发。
  let isEditing = true;
  // 有命令在途；在途期间按钮禁用，避免连点重复下发。
  let isBusy = false;
  // 已 dispose 后所有异步回包都不应再改 DOM。
  let isDisposed = false;
  // 已点过一次、等待二次确认的动作名（空串表示无待确认动作）。
  let pendingAction = "";
  // 绑定项变化即自增，用于丢弃属于上一个门锁的异步回包。
  let instanceId = 0;
  const actionButtons = new Map();
  for (const [service, label] of [
    ["lock", "上锁"],
    ["unlock", "解锁"],
    ["open", "释放锁舌"]
  ]) {
    const buttonElement = el("button", label);
    buttonElement.type = "button";
    actionButtons.set(service, buttonElement);
    actionsElement.append(buttonElement);
    buttonElement.addEventListener("click", async () => {
      if (isEditing || isBusy || !currentItem) {
        return;
      }
      // 上锁是安全方向，不必二次确认；解锁 / 释放锁舌要先点一次确认。
      if (service !== "lock" && pendingAction !== service) {
        pendingAction = service;
        feedbackElement.textContent = "确认要" + label + "吗？再次点击执行。";
        return;
      }
      pendingAction = "";
      isBusy = true;
      const instanceAtSend = instanceId;
      const itemAtSend = currentItem;
      render();
      const serviceData = codeInputElement.value ? { code: codeInputElement.value } : {};
      // 密码只允许用于本次操作，无论成功失败都立刻清空输入框。
      codeInputElement.value = "";
      try {
        await onControl({
          deviceKind: "lock",
          domain: "lock",
          service,
          entityId: itemAtSend.entityId,
          data: serviceData
        });
        if (!isDisposed && instanceAtSend === instanceId) {
          feedbackElement.textContent = "指令已提交，状态以门反馈为准。";
        }
      } catch (error) {
        if (!isDisposed && instanceAtSend === instanceId) {
          feedbackElement.textContent = error.message || "操作失败。";
        }
      } finally {
        if (!isDisposed && instanceAtSend === instanceId) {
          isBusy = false;
          render();
        }
      }
    });
  }
  let viewState = lockState({});
  /** 按当前绑定项与 viewState 重绘面板。 */
  function render() {
    // 状态行：绑定后就显示「锁状态 · 门磁状态」，未绑定只显示锁状态。
    statusElement.textContent = currentItem?.entityId
      ? viewState.label + " · " + viewState.doorLabel
      : viewState.label;
    // 详情行只放电量（装配了电量实体时才有）。
    detailsElement.replaceChildren(
      ...[currentItem?.batteryEntityId ? "电量 " + viewState.battery : ""]
        .filter(Boolean)
        .map(text => {
          const spanElement = el("span", text);
          spanElement.className = "i3d-lock-detail";
          return spanElement;
        })
    );
    metaElement.textContent = viewState.available
      ? viewState.busy
        ? "设备正在动作"
        : "状态实时更新"
      : "设备不可用";
    // 只有设备要求密码时才显示输入框。
    codeInputElement.hidden = !viewState.codeRequired;
    for (const [service, buttonElement] of actionButtons) {
      buttonElement.hidden =
        !currentItem?.entityId || (service === "open" && !viewState.canOpen);
      buttonElement.disabled =
        isEditing ||
        isBusy ||
        !viewState.available ||
        viewState.busy ||
        (service === "lock" && viewState.state === "locked");
    }
  }
  headingElement.append(titleElement, metaElement);
  rootElement.append(
    headingElement,
    statusElement,
    detailsElement,
    codeInputElement,
    actionsElement,
    feedbackElement
  );
  return {
    root: rootElement,
    /**
     * 用新的绑定项 / 状态 / 编辑态刷新面板。
     * 换门锁（id 变化）时作废旧回包，并清空密码、待确认动作与提示文案。
     */
    update({ item, states, editing }) {
      if (currentItem?.id !== item.id) {
        instanceId++;
        isBusy = false;
        pendingAction = "";
        codeInputElement.value = "";
        feedbackElement.textContent = "";
      }
      currentItem = item;
      isEditing = editing;
      viewState = lockState(item, states);
      titleElement.textContent = item.label || "门";
      render();
    },
    /** 隐藏面板但保留节点（弹窗复用时不清 DOM）；同时作废在途回包与本地输入。 */
    hide() {
      instanceId++;
      isBusy = false;
      pendingAction = "";
      codeInputElement.value = "";
      feedbackElement.textContent = "";
      rootElement.hidden = true;
    },
    /** 彻底释放：标记已销毁、清空密码并移除根节点。 */
    dispose() {
      isDisposed = true;
      codeInputElement.value = "";
      rootElement.remove();
    }
  };
}
