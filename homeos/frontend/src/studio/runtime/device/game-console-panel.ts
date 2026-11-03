/**
 * 游戏机主屏（0.8.4 `game-console-panel`）：封面 + 账号 + 累计时长 + 唤醒 / 休眠 + 选游戏。
 *
 * 封面与头像都是「先取二进制再转 blob URL」：后端 `/game-image/{entity}/{role}` 会把
 * 上游图片代理回来并做域校验，直接 `<img src>` 会绕过后端的兜底与超时控制，
 * 所以这里用 `fetch` + `AbortController`，并用 `version` 计数丢弃迟到的响应。
 */

import { createPopupFeedback } from "@app/shared/util/popup-feedback";
import { enhancePopupSelects } from "@app/shared/util/select-picker";
import { gameConsoleCommand, gameConsoleState } from "./game-console-state";

/** 单张封面 / 头像的大小上限（4MB）：超过视为后端代理出了问题。 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** 允许的图片 MIME：只放行位图，避免 SVG 里带脚本。 */
const ALLOWED_IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
/** 指令发出后等主机回报的上限。 */
const COMMAND_ACK_TIMEOUT_MS = 14_000;

export function createGameConsoleMain({
  element: hostElement,
  feedbackSlot: inheritedFeedbackSlot,
  onControl: onControl,
  fetchImage: fetchImage = (input: any, init?: any) => fetch(input, init),
}: any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document,
    createElement = (tagName: any, className = "", textContent = "") => {
      const createdElement = ownerDocument.createElement(tagName);
      return ((createdElement.className = className), (createdElement.textContent = textContent), createdElement);
    },
    contentElement = createElement("div", "i3d-game-content"),
    coverElement = createElement("img", "i3d-game-cover"),
    detailElement = createElement("div", "i3d-game-detail"),
    titleElement = createElement("strong", "i3d-game-title"),
    accountElement = createElement("div", "i3d-game-account"),
    avatarElement = createElement("img", "i3d-game-avatar"),
    accountTextElement = createElement("span"),
    hoursElement = createElement("span", "i3d-game-hours"),
    artworkMessageElement = createElement("span", "i3d-game-art-message"),
    reloadArtworkButton = createElement("button", "", "重新加载封面");
  reloadArtworkButton.type = "button";
  const actionsElement = createElement("div", "i3d-game-actions"),
    powerOnButton = createElement("button", "", "唤醒"),
    powerOffButton = createElement("button", "", "休眠");
  powerOnButton.type = powerOffButton.type = "button";
  const sourceLabelElement = createElement("label", "i3d-game-source"),
    sourceSelectElement = createElement("select");
  ((sourceSelectElement.name = "i3d-game-source"),
    sourceSelectElement.setAttribute("aria-label", "游戏 / 应用"));
  const errorElement = createElement("p", "i3d-extra-error");
  (errorElement.setAttribute("role", "status"),
    (avatarElement.alt = "玩家头像"),
    (coverElement.alt = "当前游戏或应用封面"),
    (avatarElement.hidden = coverElement.hidden = reloadArtworkButton.hidden = true),
    accountElement.append(avatarElement, accountTextElement),
    detailElement.append(titleElement, accountElement, hoursElement, artworkMessageElement, reloadArtworkButton),
    contentElement.append(coverElement, detailElement),
    actionsElement.append(powerOnButton, powerOffButton),
    sourceLabelElement.append(createElement("span", "", "游戏 / 应用"), sourceSelectElement),
    hostElement.append(contentElement, actionsElement, sourceLabelElement, errorElement));
  const pickers = enhancePopupSelects(hostElement);
  let lastItem: any = null,
    lastSignature = "",
    isDisposed = false,
    isVisible = false,
    generation = 0,
    pendingRequest: any = null,
    ackTimeoutId: any = null,
    lastSourcesJson = "";
  const feedbackSlot = inheritedFeedbackSlot || createPopupFeedback({ element: hostElement }),
    releaseError = feedbackSlot.attach(errorElement, {
      source: () => lastItem?.item?.mainEntityId,
      label: () => lastItem?.item?.label || "游戏机",
    }),
    imageSlots = [coverElement, avatarElement].map((imageElement: any) => ({
      image: imageElement,
      source: "",
      controller: null as AbortController | null,
      blob: "",
      version: 0,
    }));

  /** 清掉一个图片槽位：中止在途请求、释放 blob、隐藏 `<img>`。 */
  function resetImageSlot(imageSlot: any) {
    (imageSlot.version++,
      imageSlot.controller?.abort(),
      (imageSlot.controller = null),
      (imageSlot.image.onload = imageSlot.image.onerror = null),
      imageSlot.image.removeAttribute?.("src"),
      (imageSlot.image.hidden = true),
      imageSlot.blob && URL.revokeObjectURL(imageSlot.blob),
      (imageSlot.blob = ""),
      (imageSlot.source = ""));
  }

  /**
   * 加载一张封面 / 头像。
   *
   * @param imageSlot   槽位
   * @param imageSource 后端图片 URL（空串表示无图）
   * @param force       地址相同也强制重取（「重新加载封面」）
   */
  function loadImage(imageSlot: any, imageSource: any, force = false) {
    if ((!force && imageSlot.source === imageSource) || (resetImageSlot(imageSlot), (imageSlot.source = imageSource), !imageSource || !isVisible))
      return;
    const slotVersion = imageSlot.version,
      controller = new AbortController();
    imageSlot.controller = controller;
    // 迟到的响应 / 关闭弹窗 / 换了设备，一律丢弃。
    const isCurrentRequest = () =>
        !isDisposed && isVisible && imageSlot.version === slotVersion && !controller.signal.aborted,
      onFailure = () => {
        isCurrentRequest() &&
          ((imageSlot.image.hidden = true),
          imageSlot === imageSlots[0] &&
            ((artworkMessageElement.textContent = "封面暂不可用"), (reloadArtworkButton.hidden = false)));
      };
    fetchImage(imageSource, { credentials: "same-origin", signal: controller.signal })
      .then(async (imageResponse: any) => {
        if (!imageResponse.ok) throw new Error("图片读取失败");
        const imageBlob = await imageResponse.blob();
        if (!isCurrentRequest()) return;
        if (imageBlob.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.test(imageBlob.type))
          throw new Error("图片格式不可用");
        ((imageSlot.blob = URL.createObjectURL(imageBlob)),
          (imageSlot.image.onload = () => {
            isCurrentRequest() &&
              ((imageSlot.image.hidden = false),
              imageSlot === imageSlots[0] &&
                ((artworkMessageElement.textContent = ""), (reloadArtworkButton.hidden = true)));
          }),
          (imageSlot.image.onerror = onFailure),
          (imageSlot.image.src = imageSlot.blob));
      })
      .catch(onFailure)
      .finally(() => {
        imageSlot.version === slotVersion && (imageSlot.controller = null);
      });
  }

  /** 结束一次等待回报的指令（成功、超时、失败都走这里）。 */
  function clearPendingRequest() {
    (clearTimeout(ackTimeoutId), (ackTimeoutId = null), (pendingRequest = null));
  }

  /** 主机回报的状态是否已经满足这次指令（用于「唤醒中…」自动收起）。 */
  function isRequestSatisfied(consoleState: any, request: any) {
    return request.service === "select_source"
      ? consoleState.source === request.data.source || consoleState.title === request.data.source
      : consoleState.available && consoleState.on === (request.service === "turn_on");
  }

  function refresh() {
    if (!lastItem || isDisposed) return;
    const consoleState = gameConsoleState(lastItem.item, lastItem.states);
    (pendingRequest &&
      !consoleState.available &&
      (clearPendingRequest(), (errorElement.textContent = "主实体状态不可用")),
      pendingRequest?.accepted &&
        isRequestSatisfied(consoleState, pendingRequest) &&
        (clearPendingRequest(), (errorElement.textContent = "")),
      (titleElement.textContent =
        consoleState.title ||
        (consoleState.mode === "unknown" ? "等待状态回报" : "暂无运行内容")),
      (accountTextElement.textContent = [consoleState.account, consoleState.platform]
        .filter(Boolean)
        .join(" · ")),
      (accountElement.hidden = !accountTextElement.textContent && !consoleState.avatar),
      (hoursElement.hidden = consoleState.hours === null),
      (hoursElement.textContent =
        consoleState.hours === null
          ? ""
          : "本作累计 " +
            (consoleState.hours as number).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) +
            " 小时"),
      // 换了游戏（封面地址变了）才清掉上一条「暂无封面」提示。
      imageSlots[0].source !== consoleState.artwork &&
        ((artworkMessageElement.textContent = consoleState.artwork ? "" : "暂无游戏封面"),
        (reloadArtworkButton.hidden = true)),
      loadImage(imageSlots[0], isVisible ? consoleState.artwork : ""),
      loadImage(imageSlots[1], isVisible ? consoleState.avatar : ""),
      // 只有 PlayStation 支持开关机 / 选源（Switch 是只读 sensor）。
      (powerOnButton.hidden = consoleState.kind !== "playstation" || !(consoleState.features & 0x80)),
      (powerOffButton.hidden = consoleState.kind !== "playstation" || !(consoleState.features & 0x100)),
      (powerOnButton.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !gameConsoleCommand(lastItem.item, lastItem.states, "turn_on").enabled),
      (powerOffButton.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !gameConsoleCommand(lastItem.item, lastItem.states, "turn_off").enabled),
      (actionsElement.hidden = powerOnButton.hidden && powerOffButton.hidden),
      (powerOnButton.textContent = pendingRequest?.service === "turn_on" ? "唤醒中…" : "唤醒"),
      (powerOffButton.textContent = pendingRequest?.service === "turn_off" ? "休眠中…" : "休眠"),
      (sourceLabelElement.hidden =
        consoleState.kind !== "playstation" || !(consoleState.features & 0x800)));
    const sourcesJson = JSON.stringify(consoleState.sources);
    if (sourcesJson !== lastSourcesJson) {
      ((lastSourcesJson = sourcesJson), sourceSelectElement.replaceChildren());
      const placeholderOption = createElement("option", "", "选择游戏或应用");
      ((placeholderOption.value = ""), sourceSelectElement.append(placeholderOption));
      for (const sourceName of consoleState.sources) {
        const sourceOption = createElement("option", "", sourceName);
        ((sourceOption.value = sourceName), sourceSelectElement.append(sourceOption));
      }
    }
    (pickers.focused(sourceSelectElement) ||
      (sourceSelectElement.value = consoleState.sources.includes(consoleState.source)
        ? consoleState.source
        : ""),
      (sourceSelectElement.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !consoleState.available ||
        !consoleState.on ||
        !consoleState.sources.length),
      hostElement.setAttribute("aria-busy", String(!!pendingRequest)),
      pickers.sync());
  }

  /**
   * 发一条指令并等回报。
   *
   * 期间面板保持「唤醒中… / 休眠中…」，`accepted` 由 `refresh()` 在状态真正变化后置位；
   * 超时给出「主机未回报操作结果」，而不是假装成功。
   */
  async function runCommand(service: any, serviceData: Record<string, any> = {}) {
    if (isDisposed || !isVisible || !lastItem || lastItem.editing || pendingRequest) return;
    const command = gameConsoleCommand(lastItem.item, lastItem.states, service, serviceData);
    if (!command.enabled) return;
    const request = { service: service, data: serviceData, generation: generation, accepted: false };
    ((pendingRequest = request),
      (errorElement.textContent = ""),
      refresh(),
      (ackTimeoutId = setTimeout(() => {
        pendingRequest !== request ||
          isDisposed ||
          (clearPendingRequest(),
          (errorElement.textContent = "主机未回报操作结果，请检查状态后重试。"),
          refresh());
      }, COMMAND_ACK_TIMEOUT_MS)),
      ackTimeoutId.unref?.());
    try {
      (await onControl(command.command),
        !isDisposed &&
          pendingRequest === request &&
          generation === request.generation &&
          ((request.accepted = true), refresh()));
    } catch (commandError: any) {
      !isDisposed &&
        pendingRequest === request &&
        generation === request.generation &&
        (clearPendingRequest(),
        (errorElement.textContent = commandError?.message || "主机控制失败"),
        refresh());
    }
  }

  return (
    (powerOnButton.onclick = () => runCommand("turn_on")),
    (powerOffButton.onclick = () => runCommand("turn_off")),
    sourceSelectElement.addEventListener("change", () => {
      sourceSelectElement.disabled ||
        runCommand("select_source", { source: (sourceSelectElement as any).value });
    }),
    (reloadArtworkButton.onclick = () => {
      !lastItem ||
        isDisposed ||
        !isVisible ||
        ((reloadArtworkButton.hidden = true),
        (artworkMessageElement.textContent = ""),
        loadImage(
          imageSlots[0],
          gameConsoleState(lastItem.item, lastItem.states).artwork,
          true,
        ));
    }),
    {
      update(incomingState: any) {
        if (isDisposed) return;
        // 换设备 / 换主实体 / 进出编辑预览：清掉所有在途请求与图片。
        const nextSignature = JSON.stringify([
          incomingState.item.id,
          incomingState.item.floorId,
          incomingState.item.modelId,
          incomingState.item.deviceKind,
          incomingState.item.mainEntityId,
          !!incomingState.editing,
        ]);
        (nextSignature !== lastSignature &&
          ((lastSignature = nextSignature),
          generation++,
          clearPendingRequest(),
          (errorElement.textContent = ""),
          pickers.close(),
          imageSlots.forEach(resetImageSlot)),
          (lastItem = incomingState),
          refresh());
      },
      setVisible(nextVisible: any) {
        ((isVisible = !!nextVisible),
          isVisible ||
            (generation++,
            clearPendingRequest(),
            imageSlots.forEach(resetImageSlot),
            pickers.close()),
          refresh());
      },
      dispose() {
        isDisposed ||
          ((isDisposed = true),
          generation++,
          clearPendingRequest(),
          imageSlots.forEach(resetImageSlot),
          pickers.dispose(),
          releaseError(),
          (lastItem = null),
          hostElement.replaceChildren());
      },
    }
  );
}
