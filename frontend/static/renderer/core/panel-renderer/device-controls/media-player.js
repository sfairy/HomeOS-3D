/*
 * 设备控件区块：媒体播放器详情与媒体库浏览。
 *
 * 播放控制、音量、音源切换，以及媒体库的控制端（browseMedia 走 HA 的 media 浏览服务，
 * 结果按目录树渲染，懒加载下一层）。
 */

import { apiErrorMessage } from "../../../../utils/api-error.js?v=2609251754";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609251754";
import { playMediaSpeakerEntrance } from "../../runtime-dialog-motion.js?v=2609251754";
import { componentDialogTitle } from "../primitives.js?v=2609251754";

export const mediaPlayerDetailsMethods = {
  /**
   * 打开媒体播放器详情弹窗（播放控制、进度、音源与音量）。
   * 打开前先关掉当前弹窗：媒体详情体量大，两个叠在一起会同时占满可用区域。
   * @throws {Error} 组件没有绑定实体。
   */
  showMediaPlayerDetails(mediaPlayerComponent, { preview: mediaPlayerPreview = false } = {}) {
    const mediaPlayerDetailsEntityId = mediaPlayerComponent.bindings?.entity?.entityId;
    if (!mediaPlayerDetailsEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    let mediaPlayerState = resolveStateEntry(this.states.get(mediaPlayerDetailsEntityId), {
      entityId: mediaPlayerDetailsEntityId,
      state: "unknown",
      attributes: {}
    });
    const mediaPlayerDialogElement = document.createElement("dialog");
    mediaPlayerDialogElement.className =
      "hb-entity-details-dialog media-player-details capability-details";
    const mediaPlayerCardElement = document.createElement("div");
    mediaPlayerCardElement.className = "hb-entity-details-card";
    const mediaPlayerHeadingElement = document.createElement("div");
    mediaPlayerHeadingElement.className = "hb-entity-details-heading";
    const mediaPlayerTitleRowElement = document.createElement("div");
    const mediaPlayerTitleElement = document.createElement("strong");
    mediaPlayerTitleElement.textContent = componentDialogTitle(
      mediaPlayerComponent,
      mediaPlayerState.attributes?.friendly_name || "媒体"
    );
    const mediaPlayerStatusElement = document.createElement("span");
    mediaPlayerTitleRowElement.append(mediaPlayerTitleElement, mediaPlayerStatusElement);
    const speakerVisualElement = document.createElement("div");
    speakerVisualElement.className = "hb-media-speaker-visual";
    speakerVisualElement.setAttribute("aria-hidden", "true");
    const speakerBodyElement = document.createElement("i");
    speakerBodyElement.className = "hb-media-speaker-body";
    const speakerArtworkElement = document.createElement("img");
    speakerArtworkElement.className = "hb-media-speaker-artwork";
    speakerArtworkElement.alt = "";
    speakerArtworkElement.hidden = true;
    const speakerLightElement = document.createElement("i");
    speakerLightElement.className = "hb-media-speaker-light";
    speakerVisualElement.append(speakerBodyElement, speakerArtworkElement, speakerLightElement);
    mediaPlayerHeadingElement.append(mediaPlayerTitleRowElement, speakerVisualElement);
    const mediaPlayerBodyElement = document.createElement("div");
    mediaPlayerBodyElement.className = "hb-media-player-details-body";
    const nowPlayingElement = document.createElement("section");
    nowPlayingElement.className = "hb-media-player-now-playing";
    const nowPlayingArtworkElement = document.createElement("img");
    nowPlayingArtworkElement.className = "hb-media-player-artwork";
    nowPlayingArtworkElement.alt = "";
    nowPlayingArtworkElement.hidden = true;
    const nowPlayingCopyElement = document.createElement("div");
    nowPlayingCopyElement.className = "hb-media-player-copy";
    const nowPlayingTitleElement = document.createElement("strong");
    const nowPlayingSubtitleElement = document.createElement("span");
    const progressElement = document.createElement("div");
    progressElement.className = "hb-media-player-progress";
    progressElement.hidden = true;
    const progressBarElement = document.createElement("progress");
    progressBarElement.max = 1;
    progressBarElement.value = 0;
    const progressTimesElement = document.createElement("span");
    const elapsedTimeElement = document.createElement("time");
    const durationTimeElement = document.createElement("time");
    progressTimesElement.append(elapsedTimeElement, durationTimeElement);
    progressElement.append(progressBarElement, progressTimesElement);
    nowPlayingCopyElement.append(
      nowPlayingTitleElement,
      nowPlayingSubtitleElement,
      progressElement
    );
    nowPlayingElement.append(nowPlayingArtworkElement, nowPlayingCopyElement);
    const mediaActionsElement = document.createElement("div");
    mediaActionsElement.className = "hb-media-player-actions";
    /**
     * 创建媒体详情弹窗的动作按钮（上一曲 / 播放暂停 / 下一曲）。
     * 点击后先置灰防连点，失败交给 onError，成功与否都在 finally 恢复可用；预览态只渲染不派发。
     */
    const createMediaActionButton = (mediaButtonLabel, mediaServiceName, mediaServiceData = {}) => {
      const mediaActionButton = document.createElement("button");
      mediaActionButton.type = "button";
      mediaActionButton.textContent = mediaButtonLabel;
      mediaActionButton.addEventListener("click", async () => {
        if (!mediaPlayerPreview) {
          mediaActionButton.disabled = true;
          try {
            await this.callEntityService(
              "media_player",
              mediaServiceName,
              mediaPlayerDetailsEntityId,
              mediaServiceData
            );
          } catch (mediaActionError) {
            this.options.onError?.(mediaActionError);
          } finally {
            mediaActionButton.disabled = false;
          }
        }
      });
      mediaActionsElement.append(mediaActionButton);
      return mediaActionButton;
    };
    const previousTrackButton = createMediaActionButton("上一曲", "media_previous_track");
    const playPauseButton = createMediaActionButton("播放", "media_play_pause");
    const nextTrackButton = createMediaActionButton("下一曲", "media_next_track");
    const mediaBrowserControl = this.createMediaBrowserControl(mediaPlayerDetailsEntityId, {
      preview: mediaPlayerPreview
    });
    const volumeGroupElement = document.createElement("section");
    volumeGroupElement.className = "hb-capability-range-group";
    const volumeHeadingElement = document.createElement("div");
    volumeHeadingElement.className = "hb-capability-range-heading";
    const volumeTitleElement = document.createElement("strong");
    volumeTitleElement.textContent = "音量";
    const volumeOutputElement = document.createElement("output");
    volumeHeadingElement.append(volumeTitleElement, volumeOutputElement);
    const volumeInputElement = document.createElement("input");
    volumeInputElement.type = "range";
    volumeInputElement.min = "0";
    volumeInputElement.max = "1";
    volumeInputElement.step = ".01";
    volumeInputElement.disabled = mediaPlayerPreview;
    volumeGroupElement.append(volumeHeadingElement, volumeInputElement);
    nowPlayingElement.append(mediaBrowserControl.root);
    mediaPlayerBodyElement.append(nowPlayingElement, mediaActionsElement, volumeGroupElement);
    let mediaArtworkUrl = "";
    let pendingVolumeValue = null;
    let lastReportedVolume = null;
    let localVolumeOverride = null;
    let queuedVolumeValue = null;
    let isVolumeFlushPending = false;
    let volumeFlushTimer = null;
    let volumeResetTimer = null;
    let mediaDurationSeconds = null;
    let mediaPositionSeconds = 0;
    let mediaPositionUpdatedAtMs = null;
    let isMediaPlaying = false;
    /**
     * 把秒数格式化成 "分:秒" 的播放时间文本。
     */
    const formatPlaybackTime = totalSeconds => {
      const normalizedSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      const minutePart = Math.floor(normalizedSeconds / 60);
      const secondPart = String(normalizedSeconds % 60).padStart(2, "0");
      return minutePart + ":" + secondPart;
    };
    /**
     * 渲染播放进度条与已播 / 总时长文本。
     * HA 的 media_position 只是某一时刻的快照（media_position_updated_at），播放中必须
     * 叠加此后流逝的时间，否则进度条会卡住；位置夹到 [0, duration]，无时长则整块隐藏。
     */
    const renderPlaybackProgress = () => {
      if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds <= 0) {
        progressElement.hidden = true;
        return;
      }
      let currentPositionSeconds = Number.isFinite(mediaPositionSeconds) ? mediaPositionSeconds : 0;
      if (isMediaPlaying && Number.isFinite(mediaPositionUpdatedAtMs)) {
        currentPositionSeconds += Math.max(0, (Date.now() - mediaPositionUpdatedAtMs) / 1000);
      }
      currentPositionSeconds = Math.max(0, Math.min(mediaDurationSeconds, currentPositionSeconds));
      progressElement.hidden = false;
      progressBarElement.max = mediaDurationSeconds;
      progressBarElement.value = currentPositionSeconds;
      elapsedTimeElement.textContent = formatPlaybackTime(currentPositionSeconds);
      durationTimeElement.textContent = formatPlaybackTime(mediaDurationSeconds);
    };
    const progressIntervalTimer = window.setInterval(renderPlaybackProgress, 1000);
    /**
     * 判断两个音量值是否足够接近（容差 0.005）。
     * 用于区分「HA 已回传刚下发的音量」与「HA 仍在报旧值」：前者可撤掉本地覆盖，
     * 后者必须继续压制滑杆，否则会被旧值拽回去。
     */
    const isVolumeCloseEnough = (firstVolume, secondVolume) =>
      Number.isFinite(firstVolume) &&
      Number.isFinite(secondVolume) &&
      Math.abs(firstVolume - secondVolume) <= 0.005;
    /**
     * 渲染音量滑杆与百分比文本，并把音量夹到 0~1。
     * 同时刷新 pendingVolumeValue：它是「界面当前显示音量」的唯一来源，供回声判定与补发复用。
     */
    const renderVolumeLevel = volumeLevel => {
      pendingVolumeValue = Math.max(0, Math.min(1, Number(volumeLevel) || 0));
      volumeInputElement.value = String(pendingVolumeValue);
      volumeOutputElement.textContent = Math.round(pendingVolumeValue * 100) + "%";
    };
    /**
     * 把排队的音量值下发给 media_player.volume_set。
     * 同一时刻只允许一个在途请求：下发时取走队列并置忙，期间新值留在队列，本次结束后
     * 140ms 再补发一次，既避免乱序也不丢最后一次拖动；失败回滚本地覆盖并回到 HA 上次上报值。
     */
    const flushVolumeLevel = async () => {
      window.clearTimeout(volumeFlushTimer);
      volumeFlushTimer = null;
      if (isVolumeFlushPending || queuedVolumeValue === null) {
        return;
      }
      const volumeToFlush = queuedVolumeValue;
      queuedVolumeValue = null;
      isVolumeFlushPending = true;
      try {
        await this.callEntityService("media_player", "volume_set", mediaPlayerDetailsEntityId, {
          volume_level: volumeToFlush
        });
      } catch (volumeSetError) {
        queuedVolumeValue = null;
        localVolumeOverride = null;
        window.clearTimeout(volumeResetTimer);
        if (lastReportedVolume !== null) {
          renderVolumeLevel(lastReportedVolume);
        }
        this.options.onError?.(volumeSetError);
      } finally {
        isVolumeFlushPending = false;
        if (queuedVolumeValue !== null && !isVolumeCloseEnough(queuedVolumeValue, volumeToFlush)) {
          volumeFlushTimer = window.setTimeout(flushVolumeLevel, 140);
        }
      }
    };
    /**
     * 提交滑杆音量：记录本地覆盖值并延迟下发。
     * 立即写 localVolumeOverride 是为了压住 HA 回声状态；120ms 延迟把连续 change 合并成
     * 一次请求；在途时不再排新定时器，交给 flushVolumeLevel 的补发逻辑收尾。
     */
    const commitVolumeChange = () => {
      const nextVolumeLevel = Math.max(0, Math.min(1, Number(volumeInputElement.value) || 0));
      localVolumeOverride = nextVolumeLevel;
      queuedVolumeValue = nextVolumeLevel;
      window.clearTimeout(volumeResetTimer);
      if (!isVolumeFlushPending) {
        window.clearTimeout(volumeFlushTimer);
        volumeFlushTimer = window.setTimeout(flushVolumeLevel, 120);
      }
    };
    nowPlayingArtworkElement.addEventListener("error", () => {
      nowPlayingArtworkElement.hidden = true;
      nowPlayingElement.classList.remove("has-artwork");
    });
    nowPlayingArtworkElement.addEventListener("load", () => {
      nowPlayingArtworkElement.hidden = false;
      nowPlayingElement.classList.add("has-artwork");
    });
    speakerArtworkElement.addEventListener("error", () => {
      speakerArtworkElement.hidden = true;
      speakerVisualElement.classList.remove("has-artwork");
    });
    speakerArtworkElement.addEventListener("load", () => {
      speakerArtworkElement.hidden = false;
      speakerVisualElement.classList.add("has-artwork");
    });
    volumeInputElement.addEventListener("input", () => renderVolumeLevel(volumeInputElement.value));
    volumeInputElement.addEventListener("change", commitVolumeChange);
    /**
     * 把 media_player 的最新状态同步到播放器弹窗的全部界面元素。
     * 涵盖状态文案与扬声器视觉态、标题/副标题、播放暂停与上下曲按钮可用性
     * （supported_features 位掩码 16/32）、播放进度，以及音量滑杆与本地覆盖值的博弈。
     */
    const syncMediaPlayerState = nextPlayerState => {
      mediaPlayerState = nextPlayerState || mediaPlayerState;
      const playerAttributes = mediaPlayerState.attributes || {};
      const playerStateLabels = {
        off: "已关闭",
        on: "已开启",
        idle: "空闲",
        playing: "播放中",
        paused: "已暂停",
        buffering: "缓冲中",
        standby: "待机",
        unavailable: "不可用",
        unknown: "未知状态"
      };
      const playerNormalizedState = String(mediaPlayerState.state || "unknown").toLowerCase();
      const playerSupportedFeatures = Number(playerAttributes.supported_features || 0);
      mediaBrowserControl.sync(mediaPlayerState);
      mediaPlayerStatusElement.textContent =
        playerStateLabels[playerNormalizedState] || mediaPlayerState.state || "未知状态";
      speakerVisualElement.classList.toggle("is-playing", playerNormalizedState === "playing");
      speakerVisualElement.classList.toggle("is-paused", playerNormalizedState === "paused");
      speakerVisualElement.classList.toggle(
        "is-off",
        ["off", "unavailable", "unknown"].includes(playerNormalizedState)
      );
      nowPlayingTitleElement.textContent =
        playerAttributes.media_title ||
        playerAttributes.media_series_title ||
        playerAttributes.app_name ||
        playerAttributes.source ||
        "暂无播放内容";
      nowPlayingSubtitleElement.textContent =
        [playerAttributes.media_artist, playerAttributes.media_album_name]
          .filter(Boolean)
          .join(" · ") ||
        playerAttributes.media_content_type ||
        "媒体播放器";
      playPauseButton.textContent = playerNormalizedState === "playing" ? "暂停" : "播放";
      playPauseButton.disabled =
        mediaPlayerPreview || ["off", "unavailable", "unknown"].includes(playerNormalizedState);
      previousTrackButton.disabled = mediaPlayerPreview || !(playerSupportedFeatures & 16);
      nextTrackButton.disabled = mediaPlayerPreview || !(playerSupportedFeatures & 32);
      mediaDurationSeconds = Number.isFinite(Number(playerAttributes.media_duration))
        ? Number(playerAttributes.media_duration)
        : null;
      mediaPositionSeconds = Number.isFinite(Number(playerAttributes.media_position))
        ? Number(playerAttributes.media_position)
        : 0;
      const positionUpdatedAtMs = Date.parse(
        String(playerAttributes.media_position_updated_at || "")
      );
      mediaPositionUpdatedAtMs = Number.isFinite(positionUpdatedAtMs) ? positionUpdatedAtMs : null;
      isMediaPlaying = playerNormalizedState === "playing";
      renderPlaybackProgress();
      const reportedVolumeLevel = Number(playerAttributes.volume_level);
      volumeGroupElement.hidden = !Number.isFinite(reportedVolumeLevel);
      if (Number.isFinite(reportedVolumeLevel)) {
        if (localVolumeOverride === null) {
          lastReportedVolume = reportedVolumeLevel;
          renderVolumeLevel(reportedVolumeLevel);
        } else if (isVolumeCloseEnough(reportedVolumeLevel, localVolumeOverride)) {
          lastReportedVolume = reportedVolumeLevel;
          renderVolumeLevel(localVolumeOverride);
          window.clearTimeout(volumeResetTimer);
          volumeResetTimer = window.setTimeout(() => {
            localVolumeOverride = null;
          }, 1800);
        } else {
          window.clearTimeout(volumeResetTimer);
        }
      }
      const artworkSourceUrl =
        [
          playerAttributes.entity_picture_local,
          playerAttributes.entity_picture,
          playerAttributes.media_image_url
        ]
          .map(artworkCandidate => String(artworkCandidate || "").trim())
          .find(
            artworkUrl =>
              artworkUrl.startsWith("/api/media_player_proxy/") ||
              artworkUrl.startsWith("/api/image_proxy/")
          ) || "";
      if (artworkSourceUrl !== mediaArtworkUrl) {
        mediaArtworkUrl = artworkSourceUrl;
        nowPlayingArtworkElement.hidden = !mediaArtworkUrl;
        nowPlayingElement.classList.toggle("has-artwork", !!mediaArtworkUrl);
        speakerArtworkElement.hidden = !mediaArtworkUrl;
        speakerVisualElement.classList.toggle("has-artwork", !!mediaArtworkUrl);
        if (mediaArtworkUrl) {
          nowPlayingArtworkElement.src = mediaArtworkUrl;
          speakerArtworkElement.src = mediaArtworkUrl;
        } else {
          nowPlayingArtworkElement.removeAttribute("src");
          speakerArtworkElement.removeAttribute("src");
        }
      }
    };
    syncMediaPlayerState(mediaPlayerState);
    mediaPlayerCardElement.append(
      mediaPlayerHeadingElement,
      mediaPlayerBodyElement,
      mediaBrowserControl.panel
    );
    mediaPlayerDialogElement.append(mediaPlayerCardElement);
    const mediaPlayerLayerElement = document.createElement("div");
    mediaPlayerLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    mediaPlayerLayerElement.tabIndex = -1;
    mediaPlayerLayerElement.append(mediaPlayerDialogElement);
    this.container.append(mediaPlayerLayerElement);
    this.detailsDialog = mediaPlayerDialogElement;
    this.detailsStateSync = {
      dialog: mediaPlayerDialogElement,
      handlers: new Map([[mediaPlayerDetailsEntityId, [syncMediaPlayerState]]])
    };
    this.registerRuntimeDialogScale(mediaPlayerLayerElement, mediaPlayerDialogElement, 540, 368);
    this.bindRuntimeDialogOutsideDismiss(
      mediaPlayerLayerElement,
      mediaPlayerDialogElement,
      mediaPlayerCardElement
    );
    this.bindRuntimeDialogEscapeClose(mediaPlayerLayerElement, mediaPlayerDialogElement);
    let speakerEntranceAnimation = null;
    mediaPlayerDialogElement.addEventListener(
      "close",
      () => {
        speakerEntranceAnimation?.cancel();
        mediaBrowserControl.cleanup?.();
        window.clearInterval(progressIntervalTimer);
        window.clearTimeout(volumeFlushTimer);
        window.clearTimeout(volumeResetTimer);
        this.clearRuntimeDialogScale(mediaPlayerDialogElement);
        if (this.detailsDialog === mediaPlayerDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === mediaPlayerDialogElement) {
          this.detailsStateSync = null;
        }
        mediaPlayerLayerElement.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(mediaPlayerLayerElement, mediaPlayerDialogElement);
    speakerEntranceAnimation = playMediaSpeakerEntrance(speakerVisualElement);
  },
  /**
   * 创建媒体浏览控件（下拉式目录浏览器，含返回、播放目标选择）。
   */
  createMediaBrowserControl(mediaPlayerEntityId, { preview: mediaBrowserPreview = false } = {}) {
    const mediaBrowserElement = document.createElement("section");
    mediaBrowserElement.className = "hb-media-browser";
    const mediaBrowserTrigger = document.createElement("button");
    mediaBrowserTrigger.type = "button";
    mediaBrowserTrigger.className = "hb-media-browser-trigger";
    mediaBrowserTrigger.innerHTML = '<span aria-hidden="true"></span>';
    mediaBrowserTrigger.setAttribute("aria-label", "选择本地媒体");
    mediaBrowserTrigger.setAttribute("title", "选择本地媒体");
    mediaBrowserTrigger.setAttribute("aria-expanded", "false");
    mediaBrowserTrigger.disabled = mediaBrowserPreview;
    const mediaBrowserPanelElement = document.createElement("div");
    mediaBrowserPanelElement.className = "hb-media-browser-panel";
    mediaBrowserPanelElement.hidden = true;
    const mediaBrowserToolbarElement = document.createElement("div");
    mediaBrowserToolbarElement.className = "hb-media-browser-toolbar";
    const mediaBrowserBackButton = document.createElement("button");
    mediaBrowserBackButton.type = "button";
    mediaBrowserBackButton.className = "hb-media-browser-back";
    mediaBrowserBackButton.textContent = "返回";
    mediaBrowserBackButton.hidden = true;
    const mediaBrowserLocationElement = document.createElement("strong");
    mediaBrowserLocationElement.className = "hb-media-browser-location";
    mediaBrowserLocationElement.textContent = "媒体库";
    const mediaBrowserStatusElement = document.createElement("span");
    mediaBrowserStatusElement.className = "hb-media-browser-status";
    const mediaBrowserCloseButton = document.createElement("button");
    mediaBrowserCloseButton.type = "button";
    mediaBrowserCloseButton.className = "hb-media-browser-close";
    mediaBrowserCloseButton.textContent = "×";
    mediaBrowserCloseButton.setAttribute("aria-label", "关闭媒体选择");
    mediaBrowserToolbarElement.append(
      mediaBrowserBackButton,
      mediaBrowserLocationElement,
      mediaBrowserStatusElement,
      mediaBrowserCloseButton
    );
    const mediaBrowserListElement = document.createElement("div");
    mediaBrowserListElement.className = "hb-media-browser-list";
    mediaBrowserPanelElement.append(mediaBrowserToolbarElement, mediaBrowserListElement);
    mediaBrowserElement.append(mediaBrowserTrigger);
    let mediaCurrentContentId = "media-source://";
    let mediaCurrentContentType = "";
    let mediaHistoryStack = [];
    let isMediaBrowserBusy = false;
    let isMediaBrowserSupported = false;
    /**
     * 更新媒体浏览器工具栏的状态文案。
     */
    const setMediaBrowserStatus = (mediaStatusText = "") => {
      mediaBrowserStatusElement.textContent = mediaStatusText;
    };
    /**
     * 收起媒体浏览器面板（只改显隐与 aria-expanded，不清空已加载的目录）。
     */
    const closeMediaBrowserPanel = () => {
      mediaBrowserPanelElement.hidden = true;
      mediaBrowserTrigger.setAttribute("aria-expanded", "false");
    };
    /**
     * 切换媒体浏览器的忙碌态：忙碌时禁用触发器、返回键与列表内的全部按钮。
     *
     * 目录加载与投播都是异步的，期间若仍可点击会让「当前目录 ID」与列表内容错位。
     */
    const setMediaBrowserBusy = mediaBusyValue => {
      isMediaBrowserBusy = !!mediaBusyValue;
      mediaBrowserTrigger.disabled =
        mediaBrowserPreview || isMediaBrowserBusy || !isMediaBrowserSupported;
      mediaBrowserBackButton.disabled = isMediaBrowserBusy;
      mediaBrowserListElement.querySelectorAll("button").forEach(childButton => {
        childButton.disabled = isMediaBrowserBusy;
      });
    };
    /**
     * 取媒体条目的展示标题：title → name → media_content_id 依次回退。
     * 各类媒体源字段不统一（音乐用 title、电台用 name），末级兜底 "未命名媒体" 避免空白行。
     */
    const mediaEntryTitle = mediaEntry =>
      String(mediaEntry?.title || mediaEntry?.name || mediaEntry?.media_content_id || "未命名媒体");
    /**
     * 打开媒体库的一个目录，并把返回的子项渲染成列表。
     * 目录层级与游标由 HA 的 media-source 协议给出（media_content_id / media_content_type），
     * 进入新目录时把当前层级压栈以支持「返回」；读取与投播期间用 busy 态禁用全部按钮防连点。
     */
    const openMediaDirectory = async (
      mediaContentEntryId,
      mediaContentEntryType = "",
      { pushHistory: pushHistory = true } = {}
    ) => {
      if (!isMediaBrowserBusy && !mediaBrowserPreview && !!isMediaBrowserSupported) {
        setMediaBrowserBusy(true);
        setMediaBrowserStatus("读取中…");
        try {
          const directoryResult = await this.browseMedia(
            mediaPlayerEntityId,
            mediaContentEntryId,
            mediaContentEntryType
          );
          if (pushHistory && mediaCurrentContentId !== mediaContentEntryId) {
            mediaHistoryStack.push({
              id: mediaCurrentContentId,
              type: mediaCurrentContentType,
              title: mediaBrowserLocationElement.textContent
            });
          }
          mediaCurrentContentId = mediaContentEntryId;
          mediaCurrentContentType = mediaContentEntryType || "";
          mediaBrowserLocationElement.textContent = mediaEntryTitle(directoryResult) || "媒体库";
          mediaBrowserBackButton.hidden = mediaHistoryStack.length === 0;
          mediaBrowserListElement.replaceChildren();
          const directoryChildren = Array.isArray(directoryResult?.children)
            ? directoryResult.children
            : [];
          if (!directoryChildren.length) {
            const emptyNoticeElement = document.createElement("p");
            emptyNoticeElement.className = "hb-media-browser-empty";
            emptyNoticeElement.textContent = "此处没有可播放的媒体。";
            mediaBrowserListElement.append(emptyNoticeElement);
          }
          directoryChildren.forEach(directoryChild => {
            const mediaItemElement = document.createElement("div");
            mediaItemElement.className = "hb-media-browser-item";
            const mediaItemTitleElement = document.createElement("span");
            mediaItemTitleElement.className = "hb-media-browser-item-title";
            mediaItemTitleElement.textContent = mediaEntryTitle(directoryChild);
            const mediaItemButton = document.createElement("button");
            mediaItemButton.type = "button";
            const canExpandEntry = !!directoryChild?.can_expand || !!directoryChild?.children;
            const canPlayEntry = !!directoryChild?.can_play;
            mediaItemButton.textContent = canExpandEntry ? "打开" : "播放";
            mediaItemButton.disabled = !canExpandEntry && !canPlayEntry;
            mediaItemButton.addEventListener("click", async () => {
              if (canExpandEntry) {
                await openMediaDirectory(
                  directoryChild.media_content_id,
                  directoryChild.media_content_type || "",
                  {
                    pushHistory: true
                  }
                );
                return;
              }
              if (!!canPlayEntry && !isMediaBrowserBusy) {
                setMediaBrowserBusy(true);
                setMediaBrowserStatus("发送播放…");
                try {
                  await this.callEntityService("media_player", "play_media", mediaPlayerEntityId, {
                    media_content_id: directoryChild.media_content_id,
                    media_content_type: directoryChild.media_content_type || "music"
                  });
                  setMediaBrowserStatus("");
                } catch (playMediaError) {
                  setMediaBrowserStatus(playMediaError.message || "播放失败");
                  this.options.onError?.(playMediaError);
                } finally {
                  setMediaBrowserBusy(false);
                }
              }
            });
            mediaItemElement.append(mediaItemTitleElement, mediaItemButton);
            mediaBrowserListElement.append(mediaItemElement);
          });
          mediaBrowserPanelElement.hidden = false;
          mediaBrowserTrigger.setAttribute("aria-expanded", "true");
          setMediaBrowserStatus(directoryChildren.length ? directoryChildren.length + " 项" : "");
        } catch (browseMediaError) {
          const mediaErrorMessage = String(browseMediaError?.message || "媒体目录读取失败");
          setMediaBrowserStatus(
            mediaErrorMessage.includes("Media directory does not exist")
              ? "此目录暂无媒体"
              : mediaErrorMessage
          );
          mediaBrowserListElement.replaceChildren();
          const mediaErrorElement = document.createElement("p");
          mediaErrorElement.className = "hb-media-browser-empty";
          mediaErrorElement.textContent = mediaErrorMessage.includes(
            "Media directory does not exist"
          )
            ? "此目录暂无可用媒体。"
            : mediaErrorMessage;
          mediaBrowserListElement.append(mediaErrorElement);
          mediaBrowserPanelElement.hidden = false;
          mediaBrowserTrigger.setAttribute("aria-expanded", "true");
        } finally {
          setMediaBrowserBusy(false);
        }
      }
    };
    mediaBrowserTrigger.addEventListener("click", () => {
      if (!mediaBrowserPanelElement.hidden) {
        closeMediaBrowserPanel();
        return;
      }
      openMediaDirectory(mediaCurrentContentId, mediaCurrentContentType, {
        pushHistory: false
      });
    });
    mediaBrowserCloseButton.addEventListener("click", closeMediaBrowserPanel);
    mediaBrowserBackButton.addEventListener("click", async () => {
      const mediaHistoryEntry = mediaHistoryStack.pop();
      if (mediaHistoryEntry) {
        await openMediaDirectory(mediaHistoryEntry.id, mediaHistoryEntry.type, {
          pushHistory: false
        });
        mediaBrowserLocationElement.textContent = mediaHistoryEntry.title || "媒体库";
        mediaBrowserBackButton.hidden = mediaHistoryStack.length === 0;
      }
    });
    return {
      root: mediaBrowserElement,
      panel: mediaBrowserPanelElement,
      sync: mediaBrowserEntityState => {
        isMediaBrowserSupported = !!(
          Number(mediaBrowserEntityState?.attributes?.supported_features || 0) & 512
        );
        mediaBrowserElement.hidden = !isMediaBrowserSupported;
        if (!isMediaBrowserSupported) {
          closeMediaBrowserPanel();
        }
        mediaBrowserTrigger.disabled =
          mediaBrowserPreview || isMediaBrowserBusy || !isMediaBrowserSupported;
      },
      cleanup: () => {
        mediaBrowserElement.remove();
        mediaBrowserPanelElement.remove();
      }
    };
  },
  /**
   * 读取媒体的目录内容（媒体浏览器用）。
   *
   * @throws {Error} 读取失败。
   */
  async browseMedia(
    mediaBrowserEntityId,
    mediaContentId = "media-source://",
    mediaContentType = ""
  ) {
    const mediaBrowseResponse = await fetch("/api/v1/ha/media/browse", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        entityId: mediaBrowserEntityId,
        mediaContentId: mediaContentId,
        mediaContentType: mediaContentType
      })
    });
    const mediaBrowseBody = await mediaBrowseResponse.json().catch(() => ({}));
    if (!mediaBrowseResponse.ok) {
      throw new Error(apiErrorMessage(mediaBrowseBody, "媒体目录读取失败。"));
    }
    return mediaBrowseBody.result || {};
  }
};
