/**
 * 电视控制面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 在 3D 子系统里的位置：把 televisionState 归一化后的状态渲染成「封面 + 曲目信息 +
 * 播放进度 + 开关机 / 上一集 / 播放暂停 / 下一集」，并把命令交给 onControl 发送。
 *
 * 对外提供：createTelevisionPanel。
 *
 * 约定：面板不直接访问后端；开关机与媒体控制分别由 television-state.js 的
 *       televisionPower / televisionMediaControl 生成命令。播放进度条靠每秒重绘推进，
 *       因为 HA 只在状态变化时上报 media_position。
 */
import {
  televisionState,
  televisionTime,
  televisionPower,
  televisionMediaControl
} from "./television-state.js?v=20260918202529";
/**
 * 创建电视面板。
 *
 * @param {object} [options] 参数。
 * @param {(command: object) => Promise<void>} [options.onControl] 命令发送回调。
 * @returns {{root: HTMLElement, update: Function, hide: Function, dispose: Function}} 面板句柄。
 */
export function createTelevisionPanel({ onControl: onControl = async () => {} } = {}) {
  // 建元素并顺手挂类名：类名统一带 i3d- 前缀，样式分别写在 stage.css / nas-panel.css，
  // 避免与宿主页面的样式互相污染。
  const createElement = (tagName, className) => {
    const element = document.createElement(tagName);
    element.className = className;
    return element;
  };
  const rootElement = createElement("div", "i3d-television-panel");
  // 标题区沿用 NAS 面板的样式类，两个面板在弹窗里外观一致。
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
  // 开关做成两个独立按钮（而不是一个切换按钮），避免状态回传延迟时按钮文案来回跳。
  const powerOnButton = createElement("button", "i3d-tv-power");
  const powerOffButton = createElement("button", "i3d-tv-power");
  const errorElement = createElement("p", "i3d-tv-error");
  powerOnButton.type = powerOffButton.type = "button";
  errorElement.setAttribute("role", "status");
  const actionsElement = createElement("div", "i3d-tv-actions");
  actionsElement.setAttribute("role", "group");
  actionsElement.setAttribute("aria-label", "电视播放控制");
  // 三个媒体按钮共用同一套点击逻辑，只有 action 不同。
  const mediaButtons = ["previous", "play", "next"].map(action => {
    const createdButton = createElement("button", "");
    createdButton.type = "button";
    createdButton.addEventListener("click", async () => {
      // pendingPower 期间禁用媒体控制：电视正在开关机，媒体状态不可信。
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
        // 只在仍是同一个实体时展示错误，避免旧实体的失败盖住新实体的界面。
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
  // 封面加载失败（例如代理返回 404）时直接隐藏，不留破图。
  artworkElement.addEventListener("error", () => {
    artworkElement.hidden = true;
  });
  headingElement.append(titleElement, statusElement, powerOnButton, powerOffButton);
  detailsElement.append(mediaTitleElement, mediaMetaElement, progressElement, timeElement);
  contentElement.append(artworkElement, detailsElement);
  rootElement.append(headingElement, contentElement, actionsElement, errorElement);
  // 由外部控制显隐，创建时先隐藏以免闪出空面板。
  rootElement.hidden = true;
  let viewModel;
  let artworkUrl = "";
  let progressTimerId = null;
  // 正在等待结果的开关机目标：null 表示空闲，true / false 表示目标状态。
  let pendingPower = null;
  let powerTimeoutId = null;
  let instanceId = 0;
  let isDisposed = false;
  let isBusy = false;
  // 命令已被后端受理（但状态尚未回传）的标记，用于提前结束乐观等待。
  let powerConfirmed = false;
  /** 清空乐观开关机状态与超时定时器。 */
  function clearPendingPower() {
    if (powerTimeoutId !== null) {
      clearTimeout(powerTimeoutId);
    }
    powerTimeoutId = null;
    pendingPower = null;
    powerConfirmed = false;
  }
  /**
   * 发送开关机命令（带乐观状态与超时兜底）。
   *
   * @param {boolean} powerOn 目标状态。
   * @returns {Promise<void>}
   */
  async function sendPower(powerOn) {
    if (!viewModel || isDisposed || viewModel.editing || isBusy || pendingPower !== null) {
      return;
    }
    const powerControl = televisionPower(viewModel.item, viewModel.states, powerOn);
    // 电源不可用或实体不支持开关时静默返回：按钮本该是禁用的，这里再兜一层。
    if (!powerControl.available || !powerControl.supported) {
      return;
    }
    const powerInstanceAtSend = instanceId;
    pendingPower = powerOn;
    powerConfirmed = false;
    errorElement.textContent = "";
    render();
    // 14 秒超时：电视开机需要几秒才会上报新状态，给足时间；
    // 超时后放弃乐观显示并回到真实状态，避免界面永远停在「开机中…」。
    powerTimeoutId = setTimeout(() => {
      if (!isDisposed && instanceId === powerInstanceAtSend) {
        clearPendingPower();
        render();
      }
    }, 14000);
    try {
      await onControl(powerControl.command);
      if (!isDisposed && powerInstanceAtSend === instanceId) {
        // 命令已被受理：让下一次 render 尝试用真实状态提前结束等待。
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
  /** 按当前 viewModel 重绘面板。 */
  function render() {
    if (!viewModel) {
      return;
    }
    const state = televisionState(viewModel.item, viewModel.states);
    // 不带目标态调用，取的是「真实电源状态」，用来判断乐观等待是否已经达成。
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
      // 任一开关机在途时两个按钮都禁用，保证同一时刻只有一条电源命令。
      powerButton.disabled =
        !!viewModel.editing ||
        isBusy ||
        pendingPower !== null ||
        !buttonControl.available ||
        !buttonControl.supported;
      // 禁用原因（不支持 / 状态不可用）放在 title 里，鼠标悬停可见。
      powerButton.title = viewModel.editing ? "编辑预览不可控制设备" : buttonControl.reason;
    }
    rootElement.setAttribute("aria-busy", String(pendingPower !== null));
    for (const { action: mediaAction, button: mediaButton } of mediaButtons) {
      const mediaControlState = televisionMediaControl(
        viewModel.item,
        viewModel.states,
        mediaAction
      );
      // 「播放 / 暂停」按钮的文案由当前播放状态决定；上一集 / 下一集是固定文案。
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
    // 关机时曲目信息位置显示状态文案（如「电视已关闭」），保持版面不塌陷。
    mediaTitleElement.textContent = state.on ? state.title : state.status;
    mediaMetaElement.textContent = [state.app, state.artist].filter(Boolean).join(" · ") || "—";
    mediaMetaElement.hidden = false;
    // 只有封面地址变化时才动 img：每次 render 重设 src 会让图片反复重载闪烁。
    if (state.artwork !== artworkUrl) {
      artworkUrl = state.artwork;
      artworkElement.hidden = !artworkUrl;
      if (artworkUrl) {
        // 新封面先藏起来，等 onload 之后再显示；
        // onload 里再比一次地址，防止连续换曲时旧图的 onload 把新图的占位提前揭开。
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
    // max / value 用 1 / 0 兜底：progress 元素在 duration 未知时也需要合法数值。
    progressElement.max = state.duration || 1;
    progressElement.value = state.position || 0;
    timeElement.textContent =
      televisionTime(state.position) + " / " + televisionTime(state.duration);
    // 停止播放就撤掉每秒重绘的定时器，避免空闲时持续刷新。
    if (!state.playing && progressTimerId !== null) {
      clearInterval(progressTimerId);
      progressTimerId = null;
    }
  }
  return {
    root: rootElement,
    /**
     * 用新的视图模型刷新面板。
     *
     * @param {object} nextViewModel 含 item 与 states。
     * @returns {void}
     */
    update(nextViewModel) {
      // 换了绑定项：作废在途回包并清空与旧设备相关的状态。
      if (viewModel?.item.id !== nextViewModel.item.id) {
        instanceId++;
        isBusy = false;
        clearPendingPower();
        errorElement.textContent = "";
      }
      viewModel = nextViewModel;
      render();
      // 播放中才需要每秒重绘推进进度；已在计时则不重复创建。
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
