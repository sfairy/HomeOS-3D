import {
  televisionState,
  televisionTime,
  televisionPower,
  televisionMediaControl
} from "./television-state.js?v=20260916013557";
export function createTelevisionPanel({ onControl: onControl = async () => {} } = {}) {
  const createElement = (tagName, className) => {
    const element = document.createElement(tagName);
    element.className = className;
    return element;
  };
  const rootElement = createElement("div", "i3d-television-panel");
  const headingElement = createElement("div", "i3d-nas-heading");
  const titleElement = createElement("h3", "");
  const statusElement = createElement("span", "i3d-tv-status");
  const contentElement = createElement("div", "i3d-tv-content");
  const artworkElement = createElement("img", "i3d-tv-artwork");
  const detailsElement = createElement("div", "i3d-tv-details");
  const mediaTitleElement = createElement("strong", "");
  const mediaMetaElement = createElement("span", "");
  const progressElement = createElement("progress", "");
  const timeElement = createElement("span", "i3d-tv-time");
  const powerOnButton = createElement("button", "i3d-tv-power");
  const powerOffButton = createElement("button", "i3d-tv-power");
  const errorElement = createElement("p", "i3d-tv-error");
  powerOnButton.type = powerOffButton.type = "button";
  errorElement.setAttribute("role", "status");
  const actionsElement = createElement("div", "i3d-tv-actions");
  actionsElement.setAttribute("role", "group");
  actionsElement.setAttribute("aria-label", "电视播放控制");
  const mediaButtons = ["previous", "play", "next"].map(action => {
    const createdButton = createElement("button", "");
    createdButton.type = "button";
    createdButton.addEventListener("click", async () => {
      if (!viewModel || isDisposed || viewModel.editing || isBusy || pendingPower !== null) {
        return;
      }
      const mediaControl = televisionMediaControl(viewModel.item, viewModel.states, action);
      if (!mediaControl.enabled) {
        return;
      }
      const instanceAtSend = instanceId;
      isBusy = true;
      errorElement.textContent = "";
      render();
      try {
        await onControl(mediaControl.command);
      } catch (error) {
        if (!isDisposed && instanceAtSend === instanceId) {
          errorElement.textContent = error?.message || "播放控制失败，请重试。";
        }
      } finally {
        if (!isDisposed && instanceAtSend === instanceId) {
          isBusy = false;
          render();
        }
      }
    });
    actionsElement.append(createdButton);
    return {
      action: action,
      button: createdButton
    };
  });
  artworkElement.hidden = true;
  artworkElement.alt = "正在播放的内容封面";
  artworkElement.addEventListener("error", () => {
    artworkElement.hidden = true;
  });
  headingElement.append(titleElement, statusElement, powerOnButton, powerOffButton);
  detailsElement.append(mediaTitleElement, mediaMetaElement, progressElement, timeElement);
  contentElement.append(artworkElement, detailsElement);
  rootElement.append(headingElement, contentElement, actionsElement, errorElement);
  rootElement.hidden = true;
  let viewModel;
  let artworkUrl = "";
  let progressTimerId = null;
  let pendingPower = null;
  let powerTimeoutId = null;
  let instanceId = 0;
  let isDisposed = false;
  let isBusy = false;
  let powerConfirmed = false;
  function clearPendingPower() {
    if (powerTimeoutId !== null) {
      clearTimeout(powerTimeoutId);
    }
    powerTimeoutId = null;
    pendingPower = null;
    powerConfirmed = false;
  }
  async function sendPower(powerOn) {
    if (!viewModel || isDisposed || viewModel.editing || isBusy || pendingPower !== null) {
      return;
    }
    const powerControl = televisionPower(viewModel.item, viewModel.states, powerOn);
    if (!powerControl.available || !powerControl.supported) {
      return;
    }
    const powerInstanceAtSend = instanceId;
    pendingPower = powerOn;
    powerConfirmed = false;
    errorElement.textContent = "";
    render();
    powerTimeoutId = setTimeout(() => {
      if (!isDisposed && instanceId === powerInstanceAtSend) {
        clearPendingPower();
        render();
      }
    }, 14000);
    try {
      await onControl(powerControl.command);
      if (!isDisposed && powerInstanceAtSend === instanceId) {
        powerConfirmed = true;
        render();
      }
    } catch (powerError) {
      if (!isDisposed && powerInstanceAtSend === instanceId) {
        clearPendingPower();
        errorElement.textContent = powerError?.message || "开关机失败，请重试。";
        render();
      }
    }
  }
  powerOnButton.addEventListener("click", () => sendPower(true));
  powerOffButton.addEventListener("click", () => sendPower(false));
  function render() {
    if (!viewModel) {
      return;
    }
    const state = televisionState(viewModel.item, viewModel.states);
    const powerState = televisionPower(viewModel.item, viewModel.states);
    if (
      powerConfirmed &&
      pendingPower !== null &&
      pendingPower === powerState.on &&
      powerState.available
    ) {
      clearPendingPower();
    }
    for (const [powerButton, desiredOn] of [
      [powerOnButton, true],
      [powerOffButton, false]
    ]) {
      const buttonControl = televisionPower(viewModel.item, viewModel.states, desiredOn);
      powerButton.textContent =
        pendingPower === desiredOn
          ? desiredOn
            ? "开机中…"
            : "关机中…"
          : desiredOn
            ? "开机"
            : "关机";
      powerButton.setAttribute("aria-label", desiredOn ? "开启电视" : "关闭电视");
      powerButton.disabled =
        !!viewModel.editing ||
        isBusy ||
        pendingPower !== null ||
        !buttonControl.available ||
        !buttonControl.supported;
      powerButton.title = viewModel.editing ? "编辑预览不可控制设备" : buttonControl.reason;
    }
    rootElement.setAttribute("aria-busy", String(pendingPower !== null));
    for (const { action: mediaAction, button: mediaButton } of mediaButtons) {
      const mediaControlState = televisionMediaControl(
        viewModel.item,
        viewModel.states,
        mediaAction
      );
      mediaButton.textContent =
        mediaAction === "previous"
          ? "上一集"
          : mediaAction === "next"
            ? "下一集"
            : state.playing
              ? "暂停"
              : "播放";
      mediaButton.setAttribute("aria-label", mediaButton.textContent);
      mediaButton.disabled =
        !!viewModel.editing || isBusy || pendingPower !== null || !mediaControlState.enabled;
      mediaButton.title = mediaControlState.enabled ? "" : "当前设备状态或播放器不支持此操作";
    }
    titleElement.textContent = state.name;
    statusElement.textContent = state.status;
    mediaTitleElement.textContent = state.on ? state.title : state.status;
    mediaMetaElement.textContent = [state.app, state.artist].filter(Boolean).join(" · ") || "—";
    mediaMetaElement.hidden = false;
    if (state.artwork !== artworkUrl) {
      artworkUrl = state.artwork;
      artworkElement.hidden = !artworkUrl;
      if (artworkUrl) {
        artworkElement.hidden = true;
        artworkElement.onload = () => {
          if (viewModel && artworkUrl === state.artwork) {
            artworkElement.hidden = false;
          }
        };
        artworkElement.src = artworkUrl;
      } else {
        artworkElement.removeAttribute("src");
      }
    }
    progressElement.hidden = timeElement.hidden = false;
    progressElement.max = state.duration || 1;
    progressElement.value = state.position || 0;
    timeElement.textContent =
      televisionTime(state.position) + " / " + televisionTime(state.duration);
    if (!state.playing && progressTimerId !== null) {
      clearInterval(progressTimerId);
      progressTimerId = null;
    }
  }
  return {
    root: rootElement,
    update(nextViewModel) {
      if (viewModel?.item.id !== nextViewModel.item.id) {
        instanceId++;
        isBusy = false;
        clearPendingPower();
        errorElement.textContent = "";
      }
      viewModel = nextViewModel;
      render();
      if (
        televisionState(nextViewModel.item, nextViewModel.states).playing &&
        progressTimerId === null
      ) {
        progressTimerId = setInterval(render, 1000);
      }
    },
    hide() {
      rootElement.hidden = true;
      if (progressTimerId !== null) {
        clearInterval(progressTimerId);
      }
      progressTimerId = null;
    },
    dispose() {
      isDisposed = true;
      instanceId++;
      clearPendingPower();
      this.hide();
      viewModel = null;
      artworkElement.removeAttribute("src");
      rootElement.remove();
    }
  };
}
