// @ts-nocheck  (0.6.7 JS→TS 全量迁移：该文件保留原生 JS 写法，类型基线暂不收紧)
import { speakerState, speakerCommand } from "./speaker-state";
import { televisionTime } from "../television/television-state";
export function createSpeakerPanel({
  onControl: sendCommand = async () => {},
  fetchMedia: fetchMedia = (...fetchArgs) => fetch(...fetchArgs),
} = {}) {
  const createElement = (tagName, className = "", labelText = "") => {
      const createdElement = document.createElement(tagName);
      return (
        (createdElement.className = className),
        (createdElement.textContent = labelText),
        createdElement
      );
    },
    panelElement = createElement("div", "i3d-television-panel i3d-speaker-panel");
  panelElement.hidden = true;
  const headingElement = createElement("div", "i3d-nas-heading"),
    titleElement = createElement("h3"),
    statusElement = createElement("span", "i3d-tv-status"),
    headingTextElement = createElement("div", "i3d-popup-heading-text");
  (headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement));
  const contentElement = createElement("div", "i3d-tv-content"),
    artworkImage = createElement("img", "i3d-tv-artwork"),
    detailsElement = createElement("div", "i3d-tv-details"),
    trackTitleElement = createElement("strong"),
    artistElement = createElement("span"),
    albumElement = createElement("span"),
    timeElement = createElement("span", "i3d-tv-time");
  ((artworkImage.alt = "正在播放的内容封面"), (artworkImage.hidden = true));
  const progressElement = createElement("progress"),
    seekInput = createElement("input");
  ((seekInput.type = "range"),
    (seekInput.min = "0"),
    (seekInput.step = "1"),
    seekInput.setAttribute("aria-label", "播放进度"),
    detailsElement.append(
      trackTitleElement,
      artistElement,
      albumElement,
      progressElement,
      seekInput,
      timeElement,
    ),
    contentElement.append(artworkImage, detailsElement));
  const actionsElement = createElement("div", "i3d-tv-actions i3d-speaker-actions"),
    settingsElement = createElement("div", "i3d-speaker-settings"),
    errorElement = createElement("p", "i3d-tv-error");
  errorElement.setAttribute("role", "status");
  const bodyElement = createElement("div", "i3d-popup-body");
  (bodyElement.append(contentElement, actionsElement, settingsElement, errorElement),
    panelElement.append(headingElement, bodyElement));
  let activeEntity = null,
    revisionCount = 0,
    isDisposed = false,
    refreshIntervalId = null,
    browseAbortController = null,
    breadcrumbPath = [],
    artworkUrl = "";
  const controlBindings = [],
    pendingCommandMap = new Map(),
    resolveServiceGroup = (serviceName) =>
      ["media_play", "media_pause"].includes(serviceName)
        ? "playback"
        : ["volume_set", "volume_up", "volume_down"].includes(serviceName)
          ? "volume"
          : ["turn_on", "turn_off"].includes(serviceName)
            ? "power"
            : serviceName,
    isServicePending = (checkedService) =>
      pendingCommandMap.has(resolveServiceGroup(checkedService)),
    isControlDisabled = (stateSnapshot, guardService) =>
      !activeEntity ||
      activeEntity.editing ||
      !stateSnapshot.available ||
      (guardService && isServicePending(guardService));
  async function executeCommand(targetService, serviceData = {}, messageElement = errorElement) {
    if (!activeEntity || isDisposed || activeEntity.editing || isServicePending(targetService))
      return;
    const commandSpec = speakerCommand(
      activeEntity.item,
      activeEntity.states,
      targetService,
      serviceData,
    );
    if (!commandSpec.enabled) return;
    const revisionAtStart = revisionCount,
      serviceGroup = resolveServiceGroup(targetService),
      pendingToken = {};
    (pendingCommandMap.set(serviceGroup, pendingToken),
      (messageElement.textContent = ""),
      renderPanel());
    try {
      return (
        await sendCommand(commandSpec.command),
        !isDisposed && revisionAtStart === revisionCount
      );
    } catch (controlError) {
      return (
        revisionAtStart === revisionCount &&
          !isDisposed &&
          (messageElement.textContent = controlError?.message || "媒体控制失败，请重试。"),
        false
      );
    } finally {
      revisionAtStart === revisionCount &&
        !isDisposed &&
        (pendingCommandMap.get(serviceGroup) === pendingToken &&
          pendingCommandMap.delete(serviceGroup),
        renderPanel());
    }
  }
  function createControlButton(
    buttonLabel,
    controlService,
    payloadBuilder,
    hostElement = actionsElement,
  ) {
    const controlButton = createElement("button", "", buttonLabel);
    return (
      (controlButton.type = "button"),
      controlButton.addEventListener("click", () => {
        const buttonState = speakerState(activeEntity.item, activeEntity.states);
        executeCommand(
          typeof controlService == "function" ? controlService(buttonState) : controlService,
          payloadBuilder ? payloadBuilder(buttonState) : {},
        );
      }),
      hostElement.append(controlButton),
      controlBindings.push({
        element: controlButton,
        service: controlService,
      }),
      controlButton
    );
  }
  const powerActionsElement = createElement("div", "i3d-popup-power-actions");
  (headingElement.append(powerActionsElement),
    (createControlButton("开机", "turn_on", null, powerActionsElement).className = "i3d-tv-power"),
    (createControlButton("关机", "turn_off", null, powerActionsElement).className = "i3d-tv-power"),
    createControlButton("上一首", "media_previous_track"));
  const playPauseButton = createControlButton("播放", (playbackState) =>
    playbackState.playing ? "media_pause" : "media_play",
  );
  (createControlButton("下一首", "media_next_track"), createControlButton("停止", "media_stop"));
  const volumeContainer = createElement("div", "i3d-speaker-volume");
  settingsElement.append(volumeContainer);
  const volumeField = createElement("label", "i3d-speaker-field i3d-volume-slider"),
    volumeLabel = createElement("span", "", "音量"),
    volumeInput = createElement("input", "i3d-control-range");
  ((volumeInput.type = "range"),
    (volumeInput.min = "0"),
    (volumeInput.max = "100"),
    (volumeInput.step = "1"),
    volumeInput.setAttribute("aria-label", "音量"),
    volumeField.append(volumeLabel, volumeInput),
    volumeContainer.append(volumeField),
    controlBindings.push({
      element: volumeField,
      input: volumeInput,
      service: "volume_set",
    }),
    volumeInput.addEventListener("input", () => {
      volumeLabel.textContent = "音量 " + Math.round(Number(volumeInput.value)) + "%";
    }),
    volumeInput.addEventListener(
      "change",
      () =>
        void executeCommand("volume_set", {
          volume_level: Number(volumeInput.value) / 100,
        }),
    ),
    seekInput.addEventListener(
      "change",
      () =>
        void executeCommand("media_seek", {
          seek_position: Number(seekInput.value),
        }),
    ));
  const volumeActions = createElement("div", "i3d-speaker-actions");
  volumeContainer.append(volumeActions);
  const volumeDownButton = createControlButton("音量−", "volume_down", null, volumeActions),
    volumeUpButton = createControlButton("音量＋", "volume_up", null, volumeActions),
    muteButton = createControlButton(
      "静音",
      "volume_mute",
      (muteState) => ({
        is_volume_muted: muteState.attributes.is_volume_muted !== true,
      }),
      volumeContainer,
    ),
    shuffleButton = createControlButton(
      "随机播放",
      "shuffle_set",
      (shuffleState) => ({
        shuffle: shuffleState.attributes.shuffle !== true,
      }),
      settingsElement,
    ),
    selectControls = [];
  for (const [fieldLabel, fieldService, attributeName, choicesAttribute] of [
    ["来源", "select_source", "source", "source_list"],
    ["音效", "select_sound_mode", "sound_mode", "sound_mode_list"],
    ["循环", "repeat_set", "repeat", null],
  ]) {
    const controlField = createElement("label", "i3d-speaker-field"),
      selectElement = createElement("select");
    (controlField.append(createElement("span", "", fieldLabel), selectElement),
      settingsElement.append(controlField),
      selectElement.setAttribute("aria-label", fieldLabel),
      selectElement.addEventListener(
        "change",
        () =>
          void executeCommand(fieldService, {
            [attributeName]: selectElement.value,
          }),
      ),
      selectControls.push({
        select: selectElement,
        attribute: attributeName,
        choices: choicesAttribute,
        signature: "",
      }),
      controlBindings.push({
        element: controlField,
        input: selectElement,
        service: fieldService,
      }));
  }
  const browseButton = createElement("button", "i3d-speaker-browse"),
    backButton = createElement("button", "", "返回上级"),
    libraryHeading = createElement("h3", "", "媒体库"),
    mediaListElement = createElement("div", "i3d-speaker-media-list");
  ((browseButton.title = "浏览媒体"),
    browseButton.setAttribute("aria-label", "浏览媒体"),
    (browseButton.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h10M4 10h10M4 15h5M17 18V5l4-1v4l-4 1"/><ellipse cx="14" cy="18" rx="3" ry="2.5"/></svg>'),
    contentElement.append(browseButton));
  const mediaDialog = createElement("dialog", "i3d-speaker-media-dialog"),
    mediaHeadingElement = createElement("div", "i3d-speaker-media-heading"),
    closeButton = createElement("button", "", "关闭"),
    reloadButton = createElement("button", "", "重新加载"),
    playCurrentButton = createElement("button", "", "播放当前内容"),
    mediaToolbarElement = createElement("div", "i3d-speaker-media-toolbar"),
    mediaErrorElement = createElement("p", "i3d-tv-error");
  (mediaDialog.setAttribute("aria-label", "选择播放媒体"),
    mediaErrorElement.setAttribute("role", "status"),
    closeButton.setAttribute("aria-label", "关闭媒体库"));
  for (const actionButton of [
    browseButton,
    backButton,
    closeButton,
    reloadButton,
    playCurrentButton,
  ])
    actionButton.type = "button";
  ((backButton.hidden = playCurrentButton.hidden = true),
    mediaHeadingElement.append(libraryHeading, closeButton),
    mediaToolbarElement.append(backButton, reloadButton, playCurrentButton),
    mediaDialog.append(
      mediaHeadingElement,
      mediaToolbarElement,
      mediaListElement,
      mediaErrorElement,
    ),
    panelElement.append(mediaDialog));
  let currentLibrary = null;
  function closeLibrary() {
    (abortBrowse(),
      mediaDialog.open && mediaDialog.close(),
      mediaListElement.replaceChildren(),
      (mediaErrorElement.textContent = ""),
      activeEntity && !isDisposed && renderPanel());
  }
  (closeButton.addEventListener("click", closeLibrary),
    mediaDialog.addEventListener("keydown", (keyEvent) => {
      keyEvent.key === "Escape" &&
        (keyEvent.preventDefault(), keyEvent.stopPropagation(), closeLibrary());
    }),
    mediaDialog.addEventListener("cancel", (cancelEvent) => {
      (cancelEvent.preventDefault(), closeLibrary());
    }),
    mediaDialog.addEventListener("close", () => {
      mediaDialog.open || abortBrowse();
    }),
    browseButton.addEventListener("click", () => {
      !activeEntity ||
        isDisposed ||
        activeEntity.editing ||
        !speakerState(activeEntity.item, activeEntity.states).available ||
        (mediaDialog.open || mediaDialog.showModal(), loadMediaLibrary(null, []));
    }),
    backButton.addEventListener("click", () => {
      const parentBreadcrumbPath = breadcrumbPath.slice(0, -1);
      loadMediaLibrary(parentBreadcrumbPath.at(-1) || null, parentBreadcrumbPath.slice(0, -1));
    }),
    reloadButton.addEventListener(
      "click",
      () => void loadMediaLibrary(breadcrumbPath.at(-1) || null, breadcrumbPath.slice(0, -1)),
    ));
  async function playMedia(mediaItem) {
    (await executeCommand(
      "play_media",
      {
        media_content_id: mediaItem.media_content_id,
        media_content_type: mediaItem.media_content_type,
      },
      mediaErrorElement,
    )) && closeLibrary();
  }
  playCurrentButton.addEventListener("click", () => {
    currentLibrary && playMedia(currentLibrary);
  });
  function abortBrowse() {
    (browseAbortController?.abort(), (browseAbortController = null));
  }
  async function loadMediaLibrary(folderItem, ancestorTrail) {
    if (
      !activeEntity ||
      isDisposed ||
      activeEntity.editing ||
      !speakerState(activeEntity.item, activeEntity.states).available
    )
      return;
    abortBrowse();
    const abortController = new AbortController();
    browseAbortController = abortController;
    const revisionBeforeLoad = revisionCount;
    ((mediaErrorElement.textContent = ""),
      mediaListElement.replaceChildren(),
      (libraryHeading.textContent = "正在加载…"),
      (playCurrentButton.hidden = true),
      renderPanel());
    try {
      const response = await fetchMedia("/api/v1/ha/media/browse", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          signal: abortController.signal,
          body: JSON.stringify({
            playerLibrary: true,
            entityId: activeEntity.item.entityId,
            mediaContentId: folderItem?.media_content_id || "",
            mediaContentType: folderItem?.media_content_type || "",
          }),
        }),
        responseBody = await response.json();
      if (!response.ok || responseBody.ok === false)
        throw new Error(responseBody.detail || responseBody.error || "媒体库加载失败");
      if (isDisposed || revisionBeforeLoad !== revisionCount || abortController.signal.aborted)
        return;
      const libraryResult = responseBody.result || {};
      ((currentLibrary = libraryResult),
        (playCurrentButton.hidden =
          !libraryResult.can_play ||
          !speakerState(activeEntity.item, activeEntity.states).supports("play_media")),
        (breadcrumbPath = folderItem ? [...ancestorTrail, folderItem] : []),
        (backButton.hidden = breadcrumbPath.length === 0),
        (libraryHeading.textContent = libraryResult.title || "媒体库"));
      for (const libraryItem of libraryResult.children || []) {
        const mediaRow = createElement("div", "i3d-speaker-media-row");
        if (
          (mediaRow.append(
            createElement("span", "", libraryItem.title || libraryItem.media_content_id || "媒体"),
          ),
          libraryItem.can_expand)
        ) {
          const openButton = createElement("button", "", "打开");
          ((openButton.type = "button"),
            (openButton.onclick = () => void loadMediaLibrary(libraryItem, breadcrumbPath)),
            mediaRow.append(openButton));
        }
        if (
          libraryItem.can_play &&
          speakerState(activeEntity.item, activeEntity.states).supports("play_media")
        ) {
          const libraryItemPlayButton = createElement("button", "", "播放");
          ((libraryItemPlayButton.type = "button"),
            (libraryItemPlayButton.onclick = () => void playMedia(libraryItem)),
            mediaRow.append(libraryItemPlayButton));
        }
        mediaListElement.append(mediaRow);
      }
      mediaListElement.childElementCount ||
        mediaListElement.append(createElement("p", "", "暂无可浏览的媒体"));
    } catch (browseError) {
      revisionBeforeLoad === revisionCount &&
        !isDisposed &&
        !abortController.signal.aborted &&
        ((libraryHeading.textContent = "媒体库"),
        (mediaErrorElement.textContent = browseError?.message || "媒体库加载失败，请重试。"));
    } finally {
      browseAbortController === abortController &&
        ((browseAbortController = null), activeEntity && renderPanel());
    }
  }
  function renderPanel() {
    if (!activeEntity || isDisposed) return;
    const entityState = speakerState(activeEntity.item, activeEntity.states);
    if (
      ((titleElement.textContent = entityState.name),
      (titleElement.title = entityState.name),
      (statusElement.textContent = entityState.status),
      (statusElement.title = entityState.status),
      (trackTitleElement.textContent = entityState.on ? entityState.title : entityState.status),
      (artistElement.textContent = entityState.artist),
      (albumElement.textContent = entityState.album),
      (artistElement.hidden = !entityState.artist),
      (albumElement.hidden = !entityState.album),
      artworkUrl !== entityState.artwork)
    ) {
      ((artworkUrl = entityState.artwork), (artworkImage.hidden = true));
      const artworkRevision = revisionCount;
      ((artworkImage.onload = () => {
        !isDisposed &&
          artworkRevision === revisionCount &&
          activeEntity &&
          artworkUrl === entityState.artwork &&
          (artworkImage.hidden = false);
      }),
        (artworkImage.onerror = () => {
          artworkImage.hidden = true;
        }),
        entityState.artwork
          ? (artworkImage.src = entityState.artwork)
          : artworkImage.removeAttribute("src"));
    }
    playPauseButton.textContent = entityState.playing ? "暂停" : "播放";
    for (const controlBinding of controlBindings) {
      const resolvedService =
        typeof controlBinding.service == "function"
          ? controlBinding.service(entityState)
          : controlBinding.service;
      ((controlBinding.element.hidden = !entityState.supports(resolvedService)),
        (controlBinding.input || controlBinding.element).setAttribute(
          "aria-busy",
          String(isServicePending(resolvedService)),
        ),
        ((controlBinding.input || controlBinding.element).disabled =
          isControlDisabled(entityState, resolvedService) ||
          !speakerCommand(activeEntity.item, activeEntity.states, resolvedService).enabled));
    }
    ((volumeDownButton.hidden ||= entityState.supports("volume_set")),
      (volumeUpButton.hidden ||= entityState.supports("volume_set")),
      (volumeActions.hidden = volumeDownButton.hidden && volumeUpButton.hidden),
      (volumeContainer.hidden = volumeField.hidden && volumeActions.hidden && muteButton.hidden),
      (settingsElement.hidden = ![
        "volume_set",
        "volume_up",
        "volume_down",
        "volume_mute",
        "shuffle_set",
        "select_source",
        "select_sound_mode",
        "repeat_set",
      ].some((supportedService) => entityState.supports(supportedService))));
    const hasTimeline = entityState.duration !== null && entityState.position !== null;
    ((progressElement.hidden = !hasTimeline || entityState.supports("media_seek")),
      (seekInput.hidden = !hasTimeline || !entityState.supports("media_seek")),
      (timeElement.hidden = !hasTimeline),
      (progressElement.max = seekInput.max = entityState.duration || 1),
      (progressElement.value = entityState.position || 0),
      document.activeElement !== seekInput && (seekInput.value = entityState.position || 0),
      (seekInput.disabled = isControlDisabled(entityState, "media_seek") || !entityState.on),
      (timeElement.textContent =
        televisionTime(entityState.position) + " / " + televisionTime(entityState.duration)));
    const volumeLevel = entityState.attributes.volume_level;
    (document.activeElement !== volumeInput &&
      ((volumeInput.value = Number.isFinite(volumeLevel) ? volumeLevel * 100 : 0),
      (volumeLabel.textContent = Number.isFinite(volumeLevel)
        ? "音量 " + Math.round(volumeLevel * 100) + "%"
        : "音量")),
      (muteButton.textContent =
        entityState.attributes.is_volume_muted === true ? "取消静音" : "静音"),
      muteButton.setAttribute(
        "aria-pressed",
        String(entityState.attributes.is_volume_muted === true),
      ),
      shuffleButton.setAttribute("aria-pressed", String(entityState.attributes.shuffle === true)));
    for (const selectControl of selectControls) {
      const choiceValues = selectControl.choices
          ? entityState.attributes[selectControl.choices] || []
          : ["off", "all", "one"],
        choiceSignature = JSON.stringify(choiceValues);
      if (selectControl.signature !== choiceSignature) {
        ((selectControl.signature = choiceSignature), selectControl.select.replaceChildren());
        for (const choiceValue of choiceValues) {
          if (typeof choiceValue != "string") continue;
          const optionElement = createElement(
            "option",
            "",
            selectControl.attribute === "repeat"
              ? {
                  off: "关闭循环",
                  all: "列表循环",
                  one: "单曲循环",
                }[choiceValue]
              : choiceValue,
          );
          ((optionElement.value = choiceValue), selectControl.select.append(optionElement));
        }
      }
      ((selectControl.select.value = entityState.attributes[selectControl.attribute] || ""),
        (selectControl.select.disabled ||= choiceValues.length === 0));
    }
    ((browseButton.hidden = !entityState.supports("browse_media")),
      (browseButton.disabled = isControlDisabled(entityState) || !!browseAbortController),
      !entityState.supports("browse_media") && mediaDialog.open && closeLibrary());
    for (const mediaButton of [
      backButton,
      reloadButton,
      ...mediaListElement.querySelectorAll("button"),
    ])
      mediaButton.disabled =
        isControlDisabled(entityState) ||
        !!browseAbortController ||
        (mediaButton.textContent === "播放" && isServicePending("play_media"));
    ((playCurrentButton.disabled =
      isControlDisabled(entityState, "play_media") || !!browseAbortController),
      mediaDialog.setAttribute("aria-busy", String(!!browseAbortController)),
      !entityState.playing &&
        refreshIntervalId !== null &&
        (clearInterval(refreshIntervalId), (refreshIntervalId = null)),
      entityState.playing &&
        refreshIntervalId === null &&
        !panelElement.hidden &&
        (refreshIntervalId = setInterval(renderPanel, 1000)));
  }
  function resetPanel() {
    (revisionCount++,
      closeLibrary(),
      (currentLibrary = null),
      pendingCommandMap.clear(),
      refreshIntervalId !== null && clearInterval(refreshIntervalId),
      (refreshIntervalId = null),
      (breadcrumbPath = []),
      mediaListElement.replaceChildren(),
      (libraryHeading.textContent = ""),
      (backButton.hidden = true),
      (errorElement.textContent = ""),
      (artworkUrl = ""),
      artworkImage.removeAttribute("src"),
      (artworkImage.hidden = true));
  }
  return {
    root: panelElement,
    update(nextEntity) {
      isDisposed ||
        ((activeEntity?.item.id !== nextEntity.item.id ||
          activeEntity?.item.entityId !== nextEntity.item.entityId) &&
          resetPanel(),
        (activeEntity = nextEntity),
        renderPanel());
    },
    hide() {
      (!activeEntity && panelElement.hidden) ||
        ((panelElement.hidden = true), resetPanel(), (activeEntity = null));
    },
    dispose() {
      isDisposed || (this.hide(), (isDisposed = true), panelElement.remove());
    },
  };
}
